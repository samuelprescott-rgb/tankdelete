import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CombatObstacle,
  EnemyCombatant,
  EnemyFriendlyHitEvent,
  EnemyFireEvent,
  EnemyTankHitEvent,
  ENEMY_RIFLE_DAMAGE,
  ENEMY_RIFLE_INFANTRY_DAMAGE,
  ENEMY_RIFLE_LIFETIME,
  ENEMY_RIFLE_SPEED,
  findNearestFriendlyCoverHit,
  findNearestLivingFriendlyHit,
  findNearestObstacleHit,
  FriendlyCombatant,
  FriendlyCombatPose,
  hashCombatSession,
  segmentSphereIntersection,
  terrainBlocksCombatSegment,
} from '../../lib/combat';

const HOSTILE_PROJECTILE_CAPACITY = 48;
const TANK_HIT_RADIUS = 0.95;
const TRACER_LENGTH = 0.72;
const MAX_ENGAGEMENT_RANGE = 48;
const VC_RIFLE_MUZZLE_Z = -0.76;

const UNIFORM_PALETTES = [
  { shirt: '#151b28', trousers: '#101522', webbing: '#646251' },
  { shirt: '#202536', trousers: '#151a27', webbing: '#716b55' },
  { shirt: '#1b2328', trousers: '#11181d', webbing: '#5d624e' },
] as const;

const FIGHTER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.93,
  metalness: 0.04,
  flatShading: true,
});

const FIELD_COVER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 1,
  metalness: 0,
  flatShading: true,
});

const MUZZLE_FLASH_GEOMETRY = new THREE.ConeGeometry(0.085, 0.22, 7);
const MUZZLE_FLASH_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#ffd36a',
  transparent: true,
  opacity: 0.94,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

interface HostileProjectile {
  active: boolean;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  direction: THREE.Vector3;
  lifetime: number;
  shooterId: string;
}

interface FighterRuntime {
  nextShotAt: number;
  shotIndex: number;
  flashUntil: number;
  baseOffsetX: number;
  baseOffsetZ: number;
  moveFromX: number;
  moveFromZ: number;
  moveToX: number;
  moveToZ: number;
  moveStartedAt: number;
  moveEndsAt: number;
  moving: boolean;
  atAlternate: boolean;
}

export interface VietCongCombatantsProps {
  enemies: readonly EnemyCombatant[];
  friendliesRef: RefObject<FriendlyCombatant[]>;
  friendlyPosesRef: RefObject<Map<string, FriendlyCombatPose>>;
  tankRef: RefObject<THREE.Group | null>;
  /** Optional hut/structure volumes. Enemy rounds stop safely without touching file handlers. */
  obstacles?: readonly CombatObstacle[];
  onTankHit?: (event: EnemyTankHitEvent) => void;
  onFriendlyHit?: (event: EnemyFriendlyHitEvent) => void;
  onEnemyFire?: (event: EnemyFireEvent) => void;
  enabled?: boolean;
  tankTargetEnabled?: boolean;
  maxEngagementRange?: number;
}

type VectorTuple = [number, number, number];

function deterministicUnit(seed: number, salt: number) {
  const value = Math.sin(seed * 0.000117 + salt * 93.719) * 43758.5453123;
  return value - Math.floor(value);
}

function colorizeGeometry(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const vertexCount = geometry.getAttribute('position').count;
  const vertexColors = new Float32Array(vertexCount * 3);
  const resolved = new THREE.Color(color);
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 3;
    vertexColors[offset] = resolved.r;
    vertexColors[offset + 1] = resolved.g;
    vertexColors[offset + 2] = resolved.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
  return geometry;
}

function asNonIndexed(geometry: THREE.BufferGeometry) {
  if (!geometry.index) return geometry;
  const nonIndexed = geometry.toNonIndexed();
  geometry.dispose();
  return nonIndexed;
}

function transformedPart(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  position: VectorTuple,
  rotation: VectorTuple = [0, 0, 0],
  scale: VectorTuple = [1, 1, 1],
) {
  const normalizedGeometry = asNonIndexed(geometry);
  const transform = new THREE.Object3D();
  transform.position.set(...position);
  transform.rotation.set(...rotation);
  transform.scale.set(...scale);
  transform.updateMatrix();
  normalizedGeometry.applyMatrix4(transform.matrix);
  return colorizeGeometry(normalizedGeometry, color);
}

function cylinderPart(
  start: VectorTuple,
  end: VectorTuple,
  radius: number,
  color: THREE.ColorRepresentation,
  radialSegments = 6,
) {
  const startPoint = new THREE.Vector3(...start);
  const endPoint = new THREE.Vector3(...end);
  const direction = endPoint.clone().sub(startPoint);
  const length = direction.length();
  const midpoint = startPoint.clone().lerp(endPoint, 0.5);
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  const transform = new THREE.Matrix4().compose(
    midpoint,
    orientation,
    new THREE.Vector3(1, 1, 1),
  );
  const geometry = asNonIndexed(new THREE.CylinderGeometry(radius * 0.86, radius, length, radialSegments));
  geometry.applyMatrix4(transform);
  return colorizeGeometry(geometry, color);
}

function mergeColoredParts(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Unable to merge combatant geometry');
  for (const part of parts) part.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildVietCongRifleParts(rifleY: number, sksPattern: boolean) {
  const x = 0.018;
  const wood = sksPattern ? '#80522d' : '#714425';
  const woodHighlight = sksPattern ? '#9a6938' : '#87582c';
  const gunmetal = '#171c19';
  const metalEdge = '#343a31';
  const parts: THREE.BufferGeometry[] = [];

  if (sksPattern) {
    // SKS: a continuous wood furniture line, compact fixed magazine, and long barrel.
    parts.push(
      transformedPart(new THREE.BoxGeometry(0.115, 0.125, 0.31), wood, [x, rifleY + 0.005, 0.075], [-0.025, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.13, 0.145, 0.025), woodHighlight, [x, rifleY, 0.237], [-0.025, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.086, 0.09, 0.16), gunmetal, [x, rifleY + 0.012, -0.15]),
      transformedPart(new THREE.BoxGeometry(0.094, 0.105, 0.285), woodHighlight, [x, rifleY + 0.002, -0.338]),
      transformedPart(new THREE.BoxGeometry(0.065, 0.09, 0.075), gunmetal, [x, rifleY - 0.077, -0.145], [0.08, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.052, 0.042, 0.058), metalEdge, [x, rifleY - 0.132, -0.12], [0.12, 0, 0]),
    );
  } else {
    // AK: broad wood stock and handguard with a strongly readable curved magazine.
    parts.push(
      transformedPart(new THREE.BoxGeometry(0.118, 0.13, 0.28), wood, [x, rifleY + 0.004, 0.075], [-0.055, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.135, 0.155, 0.026), woodHighlight, [x, rifleY - 0.004, 0.222], [-0.055, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.09, 0.105, 0.19), gunmetal, [x, rifleY + 0.006, -0.14]),
      transformedPart(new THREE.BoxGeometry(0.09, 0.105, 0.21), woodHighlight, [x, rifleY + 0.002, -0.338]),
      transformedPart(new THREE.BoxGeometry(0.058, 0.12, 0.06), wood, [x, rifleY - 0.1, -0.035], [-0.28, 0, 0]),
      // Three overlapping facets read as the familiar rear-curving AK magazine.
      transformedPart(new THREE.BoxGeometry(0.07, 0.105, 0.07), '#272820', [x, rifleY - 0.092, -0.135], [-0.16, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.068, 0.095, 0.068), '#343126', [x, rifleY - 0.178, -0.106], [-0.4, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.064, 0.078, 0.064), '#493922', [x, rifleY - 0.242, -0.05], [-0.57, 0, 0]),
      transformedPart(new THREE.CylinderGeometry(0.013, 0.016, 0.255, 6), metalEdge, [x, rifleY + 0.062, -0.37], [Math.PI / 2, 0, 0]),
    );
  }

  // Both patterns share a long blued barrel, rear sight, front sight, and muzzle crown.
  parts.push(
    transformedPart(new THREE.CylinderGeometry(0.013, 0.017, 0.295, 7), gunmetal, [x, rifleY + 0.012, -0.577], [Math.PI / 2, 0, 0]),
    transformedPart(new THREE.CylinderGeometry(0.018, 0.022, 0.052, 6), metalEdge, [x, rifleY + 0.012, -0.742], [Math.PI / 2, 0, 0]),
    transformedPart(new THREE.BoxGeometry(0.06, 0.025, 0.035), gunmetal, [x, rifleY + 0.048, -0.658]),
    transformedPart(new THREE.BoxGeometry(0.017, 0.075, 0.018), gunmetal, [x, rifleY + 0.092, -0.658]),
    transformedPart(new THREE.BoxGeometry(0.055, 0.02, 0.04), metalEdge, [x, rifleY + 0.07, -0.205], [-0.12, 0, 0]),
  );
  return parts;
}

function buildFighterGeometry(
  kneeling: boolean,
  headwear: EnemyCombatant['headwear'],
  uniformVariant: number,
) {
  const palette = UNIFORM_PALETTES[uniformVariant % UNIFORM_PALETTES.length];
  const hipY = kneeling ? 0.25 : 0.38;
  const torsoY = kneeling ? 0.46 : 0.59;
  const headY = kneeling ? 0.72 : 0.86;
  const rifleY = kneeling ? 0.53 : 0.67;
  const parts: THREE.BufferGeometry[] = [];

  if (kneeling) {
    parts.push(
      transformedPart(new THREE.CylinderGeometry(0.052, 0.064, 0.32, 6), palette.trousers, [-0.085, 0.16, 0.01], [0.72, 0, 0.08]),
      transformedPart(new THREE.CylinderGeometry(0.052, 0.064, 0.28, 6), palette.trousers, [0.09, 0.14, 0.09], [1.18, 0, -0.08]),
      transformedPart(new THREE.BoxGeometry(0.1, 0.07, 0.22), '#141610', [0.1, 0.055, 0.21], [Math.PI / 2, 0, 0]),
    );
  } else {
    for (const legX of [-0.085, 0.085]) {
      parts.push(
        transformedPart(new THREE.CylinderGeometry(0.05, 0.063, 0.36, 6), palette.trousers, [legX, 0.2, 0]),
        transformedPart(new THREE.BoxGeometry(0.1, 0.075, 0.18), '#12140f', [legX, 0.035, -0.035]),
      );
    }
  }

  parts.push(
    transformedPart(new THREE.BoxGeometry(0.25, 0.18, 0.18), palette.trousers, [0, hipY, 0.015]),
    transformedPart(new THREE.BoxGeometry(0.34, 0.34, 0.2), palette.shirt, [0, torsoY, 0]),
    transformedPart(new THREE.BoxGeometry(0.035, 0.36, 0.018), palette.webbing, [-0.065, torsoY + 0.01, -0.106], [0, 0, -0.28]),
    transformedPart(new THREE.BoxGeometry(0.035, 0.36, 0.018), palette.webbing, [0.065, torsoY + 0.01, -0.106], [0, 0, 0.28]),
  );

  for (const pouchX of [-0.09, 0, 0.09]) {
    parts.push(transformedPart(
      new THREE.BoxGeometry(0.075, 0.09, 0.055),
      '#62593b',
      [pouchX, torsoY - 0.15, -0.125],
    ));
  }

  // Bent elbows place the trigger hand on the receiver and the support hand on
  // the wood fore-end, keeping both stances visibly shouldered at tank distance.
  parts.push(
    cylinderPart([-0.15, torsoY + 0.105, -0.012], [-0.195, rifleY - 0.005, -0.17], 0.05, palette.shirt),
    cylinderPart([-0.195, rifleY - 0.005, -0.17], [-0.035, rifleY, -0.36], 0.044, palette.shirt),
    cylinderPart([0.15, torsoY + 0.1, -0.01], [0.19, rifleY - 0.04, -0.07], 0.05, palette.shirt),
    cylinderPart([0.19, rifleY - 0.04, -0.07], [0.045, rifleY - 0.005, -0.13], 0.044, palette.shirt),
    transformedPart(new THREE.SphereGeometry(0.052, 7, 5), '#805d3f', [-0.035, rifleY, -0.36]),
    transformedPart(new THREE.SphereGeometry(0.052, 7, 5), '#805d3f', [0.045, rifleY - 0.005, -0.13]),
    transformedPart(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 7), '#76543a', [0, headY - 0.095, 0]),
    transformedPart(new THREE.SphereGeometry(0.11, 8, 6), '#876044', [0, headY, -0.012]),
  );

  if (headwear === 'pith') {
    parts.push(
      transformedPart(new THREE.CylinderGeometry(0.142, 0.178, 0.034, 10), '#7d774c', [0, headY + 0.115, 0], [0, 0, 0], [1, 1, 1.08]),
      transformedPart(new THREE.SphereGeometry(0.12, 9, 5), '#666d43', [0, headY + 0.163, 0.005], [0, 0, 0], [1, 0.68, 1.05]),
    );
  } else {
    // Low-poly palm-leaf conical hat with woven ribs; silhouette stays legible at tank scale.
    parts.push(
      transformedPart(new THREE.ConeGeometry(0.205, 0.095, 14), '#282b28', [0, headY + 0.14, 0]),
      transformedPart(new THREE.TorusGeometry(0.174, 0.006, 4, 14), '#111715', [0, headY + 0.112, 0], [Math.PI / 2, 0, 0]),
    );
    for (let ribIndex = 0; ribIndex < 6; ribIndex += 1) {
      const angle = (ribIndex / 6) * Math.PI * 2;
      parts.push(transformedPart(
        new THREE.BoxGeometry(0.006, 0.006, 0.18),
        '#3b3c35',
        [Math.sin(angle) * 0.082, headY + 0.132, Math.cos(angle) * 0.082],
        [0, angle, 0],
      ));
    }
    parts.push(
      cylinderPart([-0.14, headY + 0.11, 0], [-0.045, headY - 0.045, -0.045], 0.006, '#171814', 4),
      cylinderPart([0.14, headY + 0.11, 0], [0.045, headY - 0.045, -0.045], 0.006, '#171814', 4),
    );
  }

  // AK/SKS variants remain inside the merged fighter geometry: more readable
  // period detail with no added scene objects or draw calls.
  parts.push(...buildVietCongRifleParts(rifleY, uniformVariant % 3 === 0));

  return mergeColoredParts(parts);
}

function buildFightingPositionGeometry() {
  const parts: THREE.BufferGeometry[] = [];

  // A dark, shallow scrape under an irregular horseshoe of freshly packed earth.
  // The open rear and low front lip keep the fighter's chest and head readable.
  parts.push(
    transformedPart(
      new THREE.CylinderGeometry(0.5, 0.55, 0.028, 12),
      '#211b12',
      [0, 0.018, 0.06],
      [0, 0, 0],
      [1, 1, 0.72],
    ),
  );

  const bermMounds: Array<[number, number, number, number, number]> = [
    [-0.43, 0.15, -0.38, 1.38, -0.08],
    [0, 0.18, -0.47, 1.62, 0.04],
    [0.43, 0.15, -0.38, 1.35, 0.1],
    [-0.58, 0.13, -0.03, 1.24, -0.18],
    [0.58, 0.13, -0.03, 1.22, 0.2],
  ];
  bermMounds.forEach(([x, y, z, lengthScale, yaw], index) => {
    parts.push(
      transformedPart(
        new THREE.IcosahedronGeometry(0.25, 1),
        index % 2 === 0 ? '#60472b' : '#715334',
        [x, y, z],
        [0.08, yaw, index % 2 ? -0.04 : 0.06],
        [lengthScale, 0.56, 0.76],
      ),
    );
  });

  // Clods and roots break up the otherwise too-clean procedural rim.
  for (let index = 0; index < 7; index += 1) {
    const angle = -2.55 + index * 0.42;
    parts.push(transformedPart(
      new THREE.DodecahedronGeometry(0.055 + (index % 3) * 0.009, 0),
      index % 2 ? '#4d3925' : '#81613b',
      [Math.sin(angle) * 0.6, 0.26 - Math.abs(index - 3) * 0.018, -0.2 - Math.cos(angle) * 0.28],
      [index * 0.21, index * 0.38, 0],
      [1.25, 0.8, 1],
    ));
  }

  return mergeColoredParts(parts);
}

function buildCutLogGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const addLog = (y: number, z: number, length: number, angle: number, radius: number) => {
    const halfX = Math.cos(angle) * length * 0.5;
    const halfZ = Math.sin(angle) * length * 0.5;
    parts.push(
      cylinderPart([-halfX, y, z - halfZ], [halfX, y, z + halfZ], radius, '#4b3420', 8),
      cylinderPart([-halfX * 1.01, y, z - halfZ * 1.01], [halfX * 1.01, y, z + halfZ * 1.01], radius * 0.72, '#765331', 8),
    );
  };
  addLog(0.21, -0.48, 1.18, 0.04, 0.085);
  addLog(0.33, -0.45, 1.02, -0.08, 0.072);

  // Short broken branch stubs make the silhouette read as field-cut timber.
  parts.push(
    cylinderPart([-0.35, 0.27, -0.46], [-0.28, 0.39, -0.43], 0.026, '#3b2a1c', 6),
    cylinderPart([0.31, 0.34, -0.46], [0.4, 0.43, -0.42], 0.022, '#3b2a1c', 6),
  );
  return mergeColoredParts(parts);
}

function buildBambooScreenGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const bambooColors = ['#7f7842', '#666936', '#99905a'];
  for (let index = 0; index < 6; index += 1) {
    const x = -0.61 + index * 0.245;
    const height = 0.35 + (index % 3) * 0.055;
    const lean = (index % 2 ? 1 : -1) * 0.055;
    parts.push(cylinderPart(
      [x - lean, 0.06, -0.46 + (index % 2) * 0.035],
      [x + lean, height, -0.46 - (index % 2) * 0.025],
      0.018,
      bambooColors[index % bambooColors.length],
      6,
    ));
  }
  parts.push(
    cylinderPart([-0.67, 0.16, -0.47], [0.67, 0.2, -0.46], 0.017, '#5a5630', 6),
    cylinderPart([-0.66, 0.3, -0.46], [0.66, 0.27, -0.47], 0.016, '#817845', 6),
  );
  return mergeColoredParts(parts);
}

function buildBrushScreenGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const leafPalette = ['#203c1c', '#315323', '#4d682b', '#62763a'];
  for (let index = 0; index < 5; index += 1) {
    const angle = index * 2.399963229728653;
    const x = Math.cos(angle) * (0.1 + (index % 2) * 0.08);
    const z = Math.sin(angle) * (0.08 + ((index + 1) % 2) * 0.07);
    const height = 0.25 + (index % 3) * 0.075;
    parts.push(
      transformedPart(new THREE.CylinderGeometry(0.008, 0.014, height, 5), '#3c3f25', [x, height * 0.5, z]),
      transformedPart(
        new THREE.IcosahedronGeometry(0.13 + (index % 2) * 0.025, 0),
        leafPalette[index % leafPalette.length],
        [x, height * 0.78, z],
        [0.14, angle, -0.08],
        [1.24, 0.78, 0.92],
      ),
    );
  }

  return mergeColoredParts(parts);
}

function buildTracerGeometry() {
  const core = new THREE.CylinderGeometry(0.012, 0.025, TRACER_LENGTH, 6);
  core.rotateX(Math.PI / 2);
  core.translate(0, 0, -TRACER_LENGTH * 0.5);
  const head = new THREE.SphereGeometry(0.05, 6, 4);
  const merged = mergeGeometries([core, head], false);
  core.dispose();
  head.dispose();
  if (!merged) throw new Error('Unable to merge tracer geometry');
  merged.computeBoundingSphere();
  return merged;
}

const FIGHTER_GEOMETRIES = Array.from({ length: 2 }, (_, stanceIndex) => (
  Array.from({ length: 2 }, (_, headwearIndex) => (
    Array.from({ length: UNIFORM_PALETTES.length }, (_, paletteIndex) => (
      buildFighterGeometry(
        stanceIndex === 1,
        headwearIndex === 0 ? 'pith' : 'boonie',
        paletteIndex,
      )
    ))
  ))
));

const FIGHTING_POSITION_GEOMETRY = buildFightingPositionGeometry();
const CUT_LOG_GEOMETRY = buildCutLogGeometry();
const BAMBOO_SCREEN_GEOMETRY = buildBambooScreenGeometry();
const BRUSH_SCREEN_GEOMETRY = buildBrushScreenGeometry();

const TRACER_GEOMETRY = buildTracerGeometry();
const TRACER_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#ff9b59',
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
});

function shotNoise(enemyId: string, shotIndex: number, salt: number) {
  const seed = hashCombatSession(enemyId);
  const value = Math.sin(seed * 0.00013 + shotIndex * 81.721 + salt * 19.117) * 43758.5453;
  return value - Math.floor(value);
}

interface FighterProps {
  enemy: EnemyCombatant;
  index: number;
  fighterRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  muzzleFlashRefs: React.MutableRefObject<Array<THREE.Mesh | null>>;
}

interface CoverPlacement {
  position: VectorTuple;
  rotation: number;
  scale: VectorTuple;
}

interface StaticCoverBatchProps {
  geometry: THREE.BufferGeometry;
  placements: readonly CoverPlacement[];
  castShadow?: boolean;
}

function StaticCoverBatch({ geometry, placements, castShadow = false }: StaticCoverBatchProps) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    placements.forEach((placement, index) => {
      position.set(...placement.position);
      quaternion.setFromAxisAngle(up, placement.rotation);
      scale.set(...placement.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [matrix, placements, position, quaternion, scale, up]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, FIELD_COVER_MATERIAL, placements.length]}
      castShadow={castShadow}
      receiveShadow
      dispose={null}
    />
  );
}

function rotateCoverOffset(
  position: EnemyCombatant['position'],
  localX: number,
  localZ: number,
  rotation: number,
): VectorTuple {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    position[0] + cos * localX + sin * localZ,
    position[1],
    position[2] - sin * localX + cos * localZ,
  ];
}

const VietCongFieldCover = memo(function VietCongFieldCover({
  enemies,
}: Pick<VietCongCombatantsProps, 'enemies'>) {
  const placements = useMemo(() => {
    const fightingPositions: CoverPlacement[] = [];
    const logs: CoverPlacement[] = [];
    const bamboo: CoverPlacement[] = [];
    const brush: CoverPlacement[] = [];

    enemies.forEach((enemy, index) => {
      const seed = hashCombatSession(enemy.id);
      // Static fighting positions face the original southern approach. Players
      // who circle around the flank can bypass the low frontal protection.
      const baseRotation = Math.atan2(enemy.position[0], enemy.position[2] + 12);
      // Keep the earth lip aligned exactly with the inexpensive collision model.
      const rotation = baseRotation;
      fightingPositions.push({
        position: enemy.position,
        rotation,
        scale: [
          0.92 + deterministicUnit(seed, 81) * 0.15,
          0.9 + deterministicUnit(seed, 82) * 0.16,
          0.92 + deterministicUnit(seed, 83) * 0.14,
        ],
      });

      // Alternating timber and bamboo reinforce select cells without producing
      // an implausible identical fortification around every combatant.
      if (index % 3 !== 1) {
        logs.push({
          position: enemy.position,
          rotation: rotation + (deterministicUnit(seed, 84) - 0.5) * 0.08,
          scale: [0.9 + deterministicUnit(seed, 85) * 0.18, 0.92, 1],
        });
      }
      if (Math.abs(enemy.position[0]) > 14 || index < 3 || index >= 10) {
        bamboo.push({
          position: enemy.position,
          rotation: rotation + (deterministicUnit(seed, 86) - 0.5) * 0.12,
          scale: [0.9 + deterministicUnit(seed, 87) * 0.18, 0.88 + deterministicUnit(seed, 88) * 0.18, 1],
        });
      }

      // Two offset brush clumps leave a clean shot window through the middle.
      // Forward and outer-flank cells get a third clump for denser concealment.
      const brushCount = index < 4 || Math.abs(enemy.position[0]) > 14 ? 3 : 2;
      for (let brushIndex = 0; brushIndex < brushCount; brushIndex += 1) {
        const side = brushIndex === 0 ? -1 : brushIndex === 1 ? 1 : (index % 2 ? -1 : 1);
        const localX = side * (0.66 + deterministicUnit(seed, 90 + brushIndex) * 0.24);
        const localZ = brushIndex < 2
          ? 0.02 + deterministicUnit(seed, 94 + brushIndex) * 0.25
          : -0.4 + deterministicUnit(seed, 96) * 0.18;
        brush.push({
          position: rotateCoverOffset(enemy.position, localX, localZ, rotation),
          rotation: rotation + deterministicUnit(seed, 100 + brushIndex) * Math.PI,
          scale: [
            0.84 + deterministicUnit(seed, 104 + brushIndex) * 0.34,
            0.9 + deterministicUnit(seed, 108 + brushIndex) * 0.28,
            0.84 + deterministicUnit(seed, 112 + brushIndex) * 0.3,
          ],
        });
      }
    });

    return { fightingPositions, logs, bamboo, brush };
  }, [enemies]);

  return (
    <group dispose={null}>
      <StaticCoverBatch geometry={FIGHTING_POSITION_GEOMETRY} placements={placements.fightingPositions} castShadow />
      <StaticCoverBatch geometry={CUT_LOG_GEOMETRY} placements={placements.logs} castShadow />
      <StaticCoverBatch geometry={BAMBOO_SCREEN_GEOMETRY} placements={placements.bamboo} />
      <StaticCoverBatch geometry={BRUSH_SCREEN_GEOMETRY} placements={placements.brush} />
    </group>
  );
}, (previous, next) => (
  previous.enemies.length === next.enemies.length
  && previous.enemies.every((enemy, index) => {
    const nextEnemy = next.enemies[index];
    return enemy.id === nextEnemy?.id
      && enemy.position[0] === nextEnemy.position[0]
      && enemy.position[1] === nextEnemy.position[1]
      && enemy.position[2] === nextEnemy.position[2];
  })
));

const VietCongFighter = memo(function VietCongFighter({
  enemy,
  index,
  fighterRefs,
  muzzleFlashRefs,
}: FighterProps) {
  const kneeling = enemy.stance === 'kneeling';
  const stanceIndex = kneeling ? 1 : 0;
  const headwearIndex = enemy.headwear === 'pith' ? 0 : 1;
  const geometry = FIGHTER_GEOMETRIES[stanceIndex][headwearIndex][
    enemy.uniformVariant % UNIFORM_PALETTES.length
  ];
  const seed = hashCombatSession(enemy.id);
  const bodyWidth = 0.94 + deterministicUnit(seed, 21) * 0.07;
  const bodyHeight = 0.94 + deterministicUnit(seed, 22) * 0.07;
  const rifleY = kneeling ? 0.53 : 0.67;

  return (
    <group position={enemy.position} dispose={null}>
      <group
        ref={node => { fighterRefs.current[index] = node; }}
        visible={enemy.alive}
        scale={[bodyWidth, bodyHeight, bodyWidth]}
      >
        <mesh
          geometry={geometry}
          material={FIGHTER_MATERIAL}
          castShadow={index < 2}
          receiveShadow
        />
        <mesh
          ref={node => { muzzleFlashRefs.current[index] = node; }}
          geometry={MUZZLE_FLASH_GEOMETRY}
          material={MUZZLE_FLASH_MATERIAL}
          position={[0.018, rifleY + 0.012, VC_RIFLE_MUZZLE_Z]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          renderOrder={85}
        />
      </group>
    </group>
  );
}, (previous, next) => (
  previous.index === next.index
  && previous.enemy.id === next.enemy.id
  && previous.enemy.alive === next.enemy.alive
  && previous.enemy.stance === next.enemy.stance
  && previous.enemy.headwear === next.enemy.headwear
  && previous.enemy.uniformVariant === next.enemy.uniformVariant
  && previous.enemy.position[0] === next.enemy.position[0]
  && previous.enemy.position[1] === next.enemy.position[1]
  && previous.enemy.position[2] === next.enemy.position[2]
));

export function VietCongCombatants({
  enemies,
  friendliesRef,
  friendlyPosesRef,
  tankRef,
  obstacles = [],
  onTankHit,
  onFriendlyHit,
  onEnemyFire,
  enabled = true,
  tankTargetEnabled = true,
  maxEngagementRange = MAX_ENGAGEMENT_RANGE,
}: VietCongCombatantsProps) {
  const fighterRefs = useRef<Array<THREE.Group | null>>([]);
  const muzzleFlashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const tracerMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const runtimeByEnemyRef = useRef(new Map<string, FighterRuntime>());
  const activeBoundEnemyRef = useRef<string | null>(null);
  const boundCursorRef = useRef(0);
  const nextEnemyBoundAtRef = useRef(7.2);

  const projectilePool = useMemo<HostileProjectile[]>(() => (
    Array.from({ length: HOSTILE_PROJECTILE_CAPACITY }, () => ({
      active: false,
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      lifetime: 0,
      shooterId: '',
    }))
  ), []);

  const tankCenter = useMemo(() => new THREE.Vector3(), []);
  const targetCenter = useMemo(() => new THREE.Vector3(), []);
  const muzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const aimDirection = useMemo(() => new THREE.Vector3(), []);
  const impactPosition = useMemo(() => new THREE.Vector3(), []);
  const tracerForward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const tracerQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tracerMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tracerScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const hiddenTracerScale = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useLayoutEffect(() => {
    const tracerMesh = tracerMeshRef.current;
    if (!tracerMesh) return;
    tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < projectilePool.length; index += 1) {
      tracerMatrix.compose(projectilePool[index].position, tracerQuaternion, hiddenTracerScale);
      tracerMesh.setMatrixAt(index, tracerMatrix);
    }
    tracerMesh.instanceMatrix.needsUpdate = true;
  }, [hiddenTracerScale, projectilePool, tracerMatrix, tracerQuaternion]);

  const spawnHostileRound = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    shooterId: string,
  ) => {
    for (let index = 0; index < projectilePool.length; index += 1) {
      const projectile = projectilePool[index];
      if (projectile.active) continue;
      projectile.active = true;
      projectile.position.copy(position);
      projectile.previousPosition.copy(position);
      projectile.direction.copy(direction).normalize();
      projectile.lifetime = 0;
      projectile.shooterId = shooterId;
      return true;
    }
    return false;
  };

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    const tracerMesh = tracerMeshRef.current;

    if (!enabled) {
      for (let index = 0; index < projectilePool.length; index += 1) {
        projectilePool[index].active = false;
        if (tracerMesh) {
          tracerMatrix.compose(projectilePool[index].position, tracerQuaternion, hiddenTracerScale);
          tracerMesh.setMatrixAt(index, tracerMatrix);
        }
      }
      for (const flash of muzzleFlashRefs.current) if (flash) flash.visible = false;
      if (tracerMesh) tracerMesh.instanceMatrix.needsUpdate = true;
      return;
    }

    const tank = tankTargetEnabled ? tankRef.current : null;
    const currentFriendlies = friendliesRef.current;
    if (tank) {
      tank.getWorldPosition(tankCenter);
      tankCenter.y += 0.64;
    }

    if (activeBoundEnemyRef.current !== null) {
      let activeMoverStillAlive = false;
      for (let index = 0; index < enemies.length; index += 1) {
        const enemy = enemies[index];
        if (enemy.id === activeBoundEnemyRef.current && enemy.alive) {
          activeMoverStillAlive = true;
          break;
        }
      }
      if (!activeMoverStillAlive) {
        activeBoundEnemyRef.current = null;
        nextEnemyBoundAtRef.current = now + 1.2;
      }
    }

    // Schedule at most one short foxhole-to-cover shift at a time. Runtime refs
    // keep this cosmetic movement off React's render path and add no scene nodes.
    if (enemies.length > 0
      && activeBoundEnemyRef.current === null
      && now >= nextEnemyBoundAtRef.current) {
      let scheduled = false;
      for (let attempt = 0; attempt < enemies.length; attempt += 1) {
        const candidateIndex = (boundCursorRef.current + attempt) % enemies.length;
        const candidate = enemies[candidateIndex];
        if (!candidate.alive) continue;
        const candidateRuntime = runtimeByEnemyRef.current.get(candidate.id);
        if (!candidateRuntime) continue;

        const seed = hashCombatSession(candidate.id);
        const coverRotation = Math.atan2(candidate.position[0], candidate.position[2] + 12);
        const side = candidateIndex % 2 === 0 ? -1 : 1;
        const lateral = side * (0.24 + deterministicUnit(seed, 141) * 0.075);
        const rearward = 0.055 + deterministicUnit(seed, 142) * 0.035;
        const cosine = Math.cos(coverRotation);
        const sine = Math.sin(coverRotation);
        const alternateX = cosine * lateral + sine * rearward;
        const alternateZ = -sine * lateral + cosine * rearward;

        candidateRuntime.moveFromX = candidateRuntime.baseOffsetX;
        candidateRuntime.moveFromZ = candidateRuntime.baseOffsetZ;
        candidateRuntime.moveToX = candidateRuntime.atAlternate ? 0 : alternateX;
        candidateRuntime.moveToZ = candidateRuntime.atAlternate ? 0 : alternateZ;
        candidateRuntime.moveStartedAt = now;
        candidateRuntime.moveEndsAt = now + 0.68 + deterministicUnit(seed, 143) * 0.2;
        candidateRuntime.moving = true;
        candidateRuntime.nextShotAt = Math.max(
          candidateRuntime.nextShotAt,
          candidateRuntime.moveEndsAt + 0.2,
        );
        activeBoundEnemyRef.current = candidate.id;
        boundCursorRef.current = (candidateIndex + 1) % enemies.length;
        scheduled = true;
        break;
      }
      // A fresh encounter may not have initialized its runtime map until this
      // frame. Retry shortly instead of allocating a second scheduling path.
      if (!scheduled) nextEnemyBoundAtRef.current = now + 0.3;
    }

    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      const fighter = fighterRefs.current[index];
      const flash = muzzleFlashRefs.current[index];
      if (!enemy.alive) {
        if (activeBoundEnemyRef.current === enemy.id) {
          activeBoundEnemyRef.current = null;
          nextEnemyBoundAtRef.current = now + 1.2;
        }
        if (fighter) fighter.visible = false;
        if (flash) flash.visible = false;
        continue;
      }

      let runtime = runtimeByEnemyRef.current.get(enemy.id);
      if (!runtime) {
        runtime = {
          nextShotAt: now + enemy.initialFireDelay,
          shotIndex: 0,
          flashUntil: 0,
          baseOffsetX: 0,
          baseOffsetZ: 0,
          moveFromX: 0,
          moveFromZ: 0,
          moveToX: 0,
          moveToZ: 0,
          moveStartedAt: 0,
          moveEndsAt: 0,
          moving: false,
          atAlternate: false,
        };
        runtimeByEnemyRef.current.set(enemy.id, runtime);
      }

      let movementProgress = 0;
      if (runtime.moving) {
        const movementDuration = Math.max(0.001, runtime.moveEndsAt - runtime.moveStartedAt);
        movementProgress = THREE.MathUtils.clamp(
          (now - runtime.moveStartedAt) / movementDuration,
          0,
          1,
        );
        const movementBlend = movementProgress * movementProgress * (3 - 2 * movementProgress);
        runtime.baseOffsetX = THREE.MathUtils.lerp(runtime.moveFromX, runtime.moveToX, movementBlend);
        runtime.baseOffsetZ = THREE.MathUtils.lerp(runtime.moveFromZ, runtime.moveToZ, movementBlend);

        if (movementProgress >= 1) {
          runtime.baseOffsetX = runtime.moveToX;
          runtime.baseOffsetZ = runtime.moveToZ;
          runtime.moving = false;
          runtime.atAlternate = !runtime.atAlternate;
          if (activeBoundEnemyRef.current === enemy.id) activeBoundEnemyRef.current = null;
          nextEnemyBoundAtRef.current = now + 2.9 + deterministicUnit(
            hashCombatSession(enemy.id),
            144 + runtime.shotIndex,
          ) * 1.8;
        }
      }

      let livingFriendlyCount = 0;
      for (const friendly of currentFriendlies) if (friendly.alive) livingFriendlyCount += 1;
      const shouldEngageFriendlies = livingFriendlyCount > 0 && (
        !tank || index % 3 !== 0
      );
      let selectedFriendly: FriendlyCombatant | null = null;
      if (shouldEngageFriendlies) {
        // Hold a contact for a short three-round engagement before shifting.
        // Focused fire makes casualties possible while the index offset still
        // distributes the squad across the full US line.
        const targetOrdinal = (
          index * 2 + Math.floor(runtime.shotIndex / 3)
        ) % livingFriendlyCount;
        let livingOrdinal = 0;
        for (const friendly of currentFriendlies) {
          if (!friendly.alive) continue;
          if (livingOrdinal === targetOrdinal) {
            selectedFriendly = friendly;
            break;
          }
          livingOrdinal += 1;
        }
      }

      if (selectedFriendly) {
        const livePose = friendlyPosesRef.current.get(selectedFriendly.id)?.position;
        targetCenter.set(
          livePose?.x ?? selectedFriendly.position[0],
          (livePose?.y ?? selectedFriendly.position[1])
            + (selectedFriendly.kneeling ? 0.78 : 0.92),
          livePose?.z ?? selectedFriendly.position[2],
        );
      } else if (tank) {
        targetCenter.copy(tankCenter);
      }
      const hasEngagementTarget = selectedFriendly !== null || tank !== null;

      if (fighter) {
        fighter.visible = true;
        if (hasEngagementTarget) {
          const dx = targetCenter.x - enemy.position[0];
          const dz = targetCenter.z - enemy.position[2];
          fighter.rotation.y = Math.atan2(-dx, -dz);
        }
        const idlePhase = now * (0.48 + index * 0.014) + index * 1.67;
        const boundStride = runtime.moving
          ? Math.sin(movementProgress * Math.PI * 4)
          : 0;
        fighter.position.x = runtime.baseOffsetX
          + Math.sin(idlePhase) * (enemy.stance === 'kneeling' ? 0.006 : 0.014);
        fighter.position.y = Math.sin(idlePhase * 1.7) * 0.006
          + (runtime.moving ? Math.abs(boundStride) * 0.018 : 0);
        fighter.position.z = runtime.baseOffsetZ + (now < runtime.flashUntil ? 0.018 : 0);
        fighter.rotation.x = Math.sin(now * 0.72 + index * 1.31) * 0.006
          + (runtime.moving ? 0.055 : 0);
        fighter.rotation.z = runtime.moving
          ? boundStride * 0.045
          : Math.sin(idlePhase * 0.82) * (enemy.stance === 'kneeling' ? 0.006 : 0.014);
      }
      if (flash) {
        flash.visible = now < runtime.flashUntil;
        if (flash.visible) {
          flash.scale.setScalar(0.82 + Math.sin(now * 145 + index) * 0.18);
        }
      }

      if (!hasEngagementTarget || runtime.moving || now < runtime.nextShotAt) continue;

      // Read the rendered muzzle after stance scaling, idle motion, and yaw.
      // This keeps the flash, tracer origin, and rifle crown on one transform.
      if (fighter && flash) {
        fighter.updateWorldMatrix(true, true);
        flash.getWorldPosition(muzzlePosition);
      } else {
        muzzlePosition.set(
          enemy.position[0],
          enemy.position[1] + (enemy.stance === 'kneeling' ? 0.53 : 0.67),
          enemy.position[2],
        );
      }
      aimDirection.copy(targetCenter).sub(muzzlePosition);
      const distance = aimDirection.length();
      if (distance > maxEngagementRange || distance < 3.2) {
        runtime.nextShotAt = now + 0.45;
        continue;
      }

      // Keep terrain and huts tactically meaningful; concealed soldiers do not shoot through them.
      const obstacleHitT = findNearestObstacleHit(muzzlePosition, targetCenter, obstacles);
      const targetLaneBlocked = terrainBlocksCombatSegment(muzzlePosition, targetCenter)
        || (obstacleHitT !== null && obstacleHitT < 0.88);
      // Infantry contacts rotate after a physical round is spawned. Suppressive
      // shots therefore still leave the rifle when this coarse whole-segment
      // test finds cover; the projectile's swept terrain/structure/sandbag tests
      // stop the tracer at the actual obstruction. Rejecting here pinned a VC
      // rifleman to one blocked squad member forever because shotIndex never
      // advanced, leaving the US line functionally invulnerable.
      if (!selectedFriendly && targetLaneBlocked) {
        runtime.nextShotAt = now + 0.42;
        continue;
      }

      aimDirection.normalize();
      const shotIndex = runtime.shotIndex++;
      // Fire at the exposed upper profile above the sandbag lip. Infantry aim
      // is a little steadier than anti-armor harassment so the opposing squads
      // can actually trade casualties without turning every burst into a hit.
      const infantryAccuracyScale = selectedFriendly ? 0.42 : 1;
      aimDirection.x += (shotNoise(enemy.id, shotIndex, 1) - 0.5)
        * enemy.accuracy * 2 * infantryAccuracyScale;
      aimDirection.y += (shotNoise(enemy.id, shotIndex, 2) - 0.5)
        * enemy.accuracy * 0.8 * infantryAccuracyScale;
      aimDirection.z += (shotNoise(enemy.id, shotIndex, 3) - 0.5)
        * enemy.accuracy * 2 * infantryAccuracyScale;
      aimDirection.normalize();

      if (spawnHostileRound(muzzlePosition, aimDirection, enemy.id)) {
        runtime.flashUntil = now + 0.07;
        onEnemyFire?.({
          enemyId: enemy.id,
          position: muzzlePosition.clone(),
          direction: aimDirection.clone(),
        });
      }
      const cadenceVariation = 0.84 + shotNoise(enemy.id, shotIndex, 4) * 0.32;
      runtime.nextShotAt = now + enemy.fireInterval * cadenceVariation;
    }

    for (let index = 0; index < projectilePool.length; index += 1) {
      const projectile = projectilePool[index];
      if (projectile.active) {
        projectile.previousPosition.copy(projectile.position);
        projectile.position.addScaledVector(projectile.direction, ENEMY_RIFLE_SPEED * delta);
        projectile.lifetime += delta;

        if (projectile.lifetime >= ENEMY_RIFLE_LIFETIME
          || terrainBlocksCombatSegment(projectile.previousPosition, projectile.position)) {
          projectile.active = false;
        } else {
          const obstacleHitT = projectile.lifetime > 0.08
            ? findNearestObstacleHit(projectile.previousPosition, projectile.position, obstacles)
            : null;
          const friendlyCoverHitT = projectile.lifetime > 0.08
            ? findNearestFriendlyCoverHit(projectile.previousPosition, projectile.position)
            : null;
          const blockingHitT = obstacleHitT === null
            ? friendlyCoverHitT
            : friendlyCoverHitT === null
              ? obstacleHitT
              : Math.min(obstacleHitT, friendlyCoverHitT);
          const friendlyHit = findNearestLivingFriendlyHit(
            projectile.previousPosition,
            projectile.position,
            friendliesRef.current,
            friendlyPosesRef.current,
          );
          const tankHitT = tank
            ? segmentSphereIntersection(
                projectile.previousPosition,
                projectile.position,
                tankCenter,
                TANK_HIT_RADIUS,
              )
            : null;

          const friendlyHitT = friendlyHit?.t ?? null;
          const friendlyHitsFirst = friendlyHitT !== null
            && (blockingHitT === null || friendlyHitT < blockingHitT)
            && (tankHitT === null || friendlyHitT < tankHitT);
          const tankHitsFirst = tankHitT !== null
            && (blockingHitT === null || tankHitT < blockingHitT)
            && (friendlyHitT === null || tankHitT <= friendlyHitT);

          if (friendlyHitsFirst && friendlyHit) {
            impactPosition.copy(friendlyHit.point);
            onFriendlyHit?.({
              enemyId: projectile.shooterId,
              friendlyId: friendlyHit.friendly.id,
              position: impactPosition.clone(),
              damage: ENEMY_RIFLE_INFANTRY_DAMAGE,
            });
            projectile.active = false;
          } else if (tankHitsFirst && tankHitT !== null) {
            impactPosition.copy(projectile.previousPosition).lerp(projectile.position, tankHitT);
            onTankHit?.({
              enemyId: projectile.shooterId,
              position: impactPosition.clone(),
              damage: ENEMY_RIFLE_DAMAGE,
            });
            projectile.active = false;
          } else if (blockingHitT !== null) {
            projectile.active = false;
          }
        }
      }

      if (!tracerMesh) continue;
      if (projectile.active) {
        tracerQuaternion.setFromUnitVectors(tracerForward, projectile.direction);
        tracerMatrix.compose(projectile.position, tracerQuaternion, tracerScale);
      } else {
        tracerMatrix.compose(projectile.position, tracerQuaternion, hiddenTracerScale);
      }
      tracerMesh.setMatrixAt(index, tracerMatrix);
    }
    if (tracerMesh) tracerMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group dispose={null}>
      <VietCongFieldCover enemies={enemies} />

      {enemies.map((enemy, index) => (
        <VietCongFighter
          key={enemy.id}
          enemy={enemy}
          index={index}
          fighterRefs={fighterRefs}
          muzzleFlashRefs={muzzleFlashRefs}
        />
      ))}

      <instancedMesh
        ref={node => {
          tracerMeshRef.current = node;
          if (node) node.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        }}
        args={[TRACER_GEOMETRY, TRACER_MATERIAL, HOSTILE_PROJECTILE_CAPACITY]}
        visible={enabled}
        renderOrder={88}
        frustumCulled={false}
      />
    </group>
  );
}
