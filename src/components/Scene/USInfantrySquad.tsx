import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CombatObstacle,
  EnemyCombatant,
  findNearestLivingEnemyHit,
  findNearestObstacleHit,
  FriendlyEnemyHitEvent,
  FriendlyFireEvent,
  hashCombatSession,
  terrainBlocksCombatSegment,
} from '../../lib/combat';

const FRIENDLY_PROJECTILE_CAPACITY = 40;
const FRIENDLY_RIFLE_SPEED = 31;
const FRIENDLY_RIFLE_LIFETIME = 2.7;
// The squad sustains the firefight without clearing the whole encounter before
// the player can engage; concentrated rifle fire still finishes exposed targets.
const FRIENDLY_RIFLE_DAMAGE = 1;
const FRIENDLY_MAX_RANGE = 58;
const TRACER_LENGTH = 0.58;
const SOLDIER_SCALE = 0.96;

interface FriendlyProjectile {
  active: boolean;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  direction: THREE.Vector3;
  lifetime: number;
  soldierId: string;
}

interface SquadMember {
  id: string;
  position: [number, number, number];
  alternatePosition?: [number, number, number];
  kneeling: boolean;
  radioOperator: boolean;
  fireInterval: number;
  initialDelay: number;
  accuracy: number;
  burstSize: number;
}

interface SoldierRuntime {
  nextShotAt: number;
  shotIndex: number;
  flashUntil: number;
  recoilUntil: number;
  burstRemaining: number;
  baseX: number;
  baseZ: number;
  moveFromX: number;
  moveFromZ: number;
  moveToX: number;
  moveToZ: number;
  moveStartedAt: number;
  moveEndsAt: number;
  moving: boolean;
  atAlternate: boolean;
}

export interface USInfantrySquadProps {
  enemies: readonly EnemyCombatant[];
  obstacles?: readonly CombatObstacle[];
  onEnemyHit?: (event: FriendlyEnemyHitEvent) => void;
  onFriendlyFire?: (event: FriendlyFireEvent) => void;
  enabled?: boolean;
}

const SQUAD: readonly SquadMember[] = [
  { id: 'us-rifle-1', position: [-5.65, 0.02, -5.35], alternatePosition: [-5.3, 0.02, -5.7], kneeling: true, radioOperator: false, fireInterval: 1.42, initialDelay: 0.42, accuracy: 0.024, burstSize: 3 },
  { id: 'us-rifle-2', position: [-4.12, 0.02, -5.18], alternatePosition: [-4.48, 0.02, -5.62], kneeling: true, radioOperator: false, fireInterval: 1.55, initialDelay: 0.86, accuracy: 0.03, burstSize: 2 },
  { id: 'us-rifle-3', position: [4.18, 0.02, -3.96], alternatePosition: [4.53, 0.02, -4.33], kneeling: true, radioOperator: false, fireInterval: 1.48, initialDelay: 1.16, accuracy: 0.026, burstSize: 3 },
  { id: 'us-rto-4', position: [5.72, 0.02, -3.78], kneeling: false, radioOperator: true, fireInterval: 1.72, initialDelay: 1.48, accuracy: 0.032, burstSize: 2 },
  { id: 'us-rifle-5', position: [0.25, 0.02, 1.82], alternatePosition: [-0.3, 0.02, 1.76], kneeling: true, radioOperator: false, fireInterval: 1.62, initialDelay: 1.82, accuracy: 0.027, burstSize: 2 },
];

export const US_FIGHTING_POSITIONS = [
  { id: 'left', position: [-4.9, 0.02, -4.7] as [number, number, number], rotation: -0.08, width: 3.15 },
  { id: 'right', position: [4.95, 0.02, -3.28] as [number, number, number], rotation: 0.08, width: 3.15 },
  { id: 'forward', position: [0.25, 0.02, 2.48] as [number, number, number], rotation: 0, width: 1.85 },
] as const;

export const US_INFANTRY_MINIMAP_CONTACTS = SQUAD.map(member => ({ position: member.position }));

function deterministicNoise(id: string, index: number, salt: number) {
  const seed = hashCombatSession(id);
  const value = Math.sin(seed * 0.00017 + index * 73.317 + salt * 23.113) * 43758.5453;
  return value - Math.floor(value);
}

interface StaticInstance {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
}

const SANDBAG_COLORS = ['#8c8257', '#756d49', '#9a8c5c'];
const GRASS_COLORS = ['#394b2d', '#536238'];
const COVER_GEOMETRY = {
  sandbag: new THREE.SphereGeometry(1, 10, 6),
  tie: new THREE.TorusGeometry(1, 0.035, 4, 10),
  grass: new THREE.ConeGeometry(0.035, 1, 4),
  circle: new THREE.CircleGeometry(1, 18),
  box: new THREE.BoxGeometry(1, 1, 1),
  handle: new THREE.TorusGeometry(0.12, 0.012, 5, 12, Math.PI),
  can: new THREE.CylinderGeometry(0.11, 0.11, 1, 9),
};
const COVER_MATERIAL = {
  sandbag: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
  tie: new THREE.MeshStandardMaterial({ color: '#5d563b', roughness: 1 }),
  grass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86 }),
  mud: new THREE.MeshStandardMaterial({ color: '#3c3a24', roughness: 1 }),
  water: new THREE.MeshStandardMaterial({
    color: '#30483d', roughness: 0.32, metalness: 0.08, transparent: true, opacity: 0.72,
  }),
  crate: new THREE.MeshStandardMaterial({ color: '#4d5634', roughness: 0.94 }),
  crateLid: new THREE.MeshStandardMaterial({ color: '#6c7245', roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: '#2d3328', metalness: 0.35, roughness: 0.65 }),
  can: new THREE.MeshStandardMaterial({ color: '#4c5736', roughness: 0.85, metalness: 0.18 }),
};

const composeMatrix = (
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
) => new THREE.Matrix4().compose(
  new THREE.Vector3(...position),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
  new THREE.Vector3(...scale),
);

function buildCoverInstances() {
  const sandbags: StaticInstance[] = [];
  const ties: StaticInstance[] = [];
  const grass: StaticInstance[] = [];
  const mud: StaticInstance[] = [];
  const water: StaticInstance[] = [];
  const crates: StaticInstance[] = [];
  const crateLids: StaticInstance[] = [];
  const handles: StaticInstance[] = [];
  const cans: StaticInstance[] = [];

  const addInstance = (
    target: StaticInstance[],
    parent: THREE.Matrix4,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number],
    color?: string,
  ) => {
    target.push({
      matrix: parent.clone().multiply(composeMatrix(position, rotation, scale)),
      color: color ? new THREE.Color(color) : undefined,
    });
  };

  US_FIGHTING_POSITIONS.forEach(fightingPosition => {
    const { position, rotation, width } = fightingPosition;
    const emplacement = composeMatrix(position, [0, rotation, 0]);
    const lowerCount = Math.max(3, Math.round(width / 0.5));
    const lower = Array.from({ length: lowerCount }, (_, index) => (
      -width * 0.5 + (index + 0.5) * (width / lowerCount)
    ));
    const upper = lower.slice(0, -1).map((value, index) => (
      value + width / lowerCount * 0.5 + Math.sin(index * 2.3) * 0.025
    ));
    const bags = [
      ...lower.map((x, index) => ({ position: [x, 0.13, 0] as [number, number, number], rotation: 0, shade: index })),
      ...upper.map((x, index) => ({
        position: [x, 0.32, 0.015] as [number, number, number],
        rotation: index % 2 === 0 ? 0.025 : -0.025,
        shade: index + 1,
      })),
      ...[-1, 1].flatMap(side => [0, 1, 2].map(step => ({
        position: [
          side * (width * 0.5 - 0.05),
          0.13 + (step === 2 ? 0.17 : 0),
          -0.32 - step * 0.38,
        ] as [number, number, number],
        rotation: Math.PI * 0.5,
        shade: step + (side > 0 ? 1 : 0),
      }))),
    ];
    bags.forEach(bag => {
      const bagParent = emplacement.clone().multiply(composeMatrix(
        bag.position,
        [0, bag.rotation, 0],
      ));
      addInstance(
        sandbags,
        bagParent,
        [0, 0, 0],
        [0, 0, 0],
        [0.29, 0.115, 0.17],
        SANDBAG_COLORS[bag.shade % SANDBAG_COLORS.length],
      );
      addInstance(ties, bagParent, [0, 0.002, 0], [Math.PI / 2, 0, 0], [0.17, 0.1, 0.17]);
    });

    addInstance(mud, emplacement, [0, -0.004, -0.18], [-Math.PI / 2, 0, 0], [width * 0.55, width * 0.55, 1]);
    addInstance(
      water,
      emplacement,
      [-width * 0.08, 0.004, -0.45],
      [-Math.PI / 2, 0, 0],
      [width * 0.43 * 0.9, width * 0.43 * 0.36, 1],
    );

    const crateParent = emplacement.clone().multiply(composeMatrix(
      [width * 0.31, 0.14, -0.68],
      [0, -0.08, 0],
    ));
    addInstance(crates, crateParent, [0, 0, 0], [0, 0, 0], [0.48, 0.28, 0.35]);
    addInstance(crateLids, crateParent, [0, 0.15, 0], [0, 0, 0], [0.5, 0.035, 0.37]);
    addInstance(handles, crateParent, [0, 0.18, 0], [-Math.PI / 2, 0, 0], [1, 1, 1]);
    addInstance(cans, emplacement, [-width * 0.29, 0.08, -0.74], [0, 0.16, Math.PI / 2], [1, 0.34, 1]);

    const clumps = [
      { position: [-width * 0.48, 0, 0.1] as [number, number, number], rotation: 0.12 },
      { position: [width * 0.46, 0, -0.08] as [number, number, number], rotation: -0.18 },
      ...(width > 2
        ? [{ position: [-width * 0.18, 0, -0.96] as [number, number, number], rotation: 0.4 }]
        : []),
    ];
    clumps.forEach(clump => {
      const clumpParent = emplacement.clone().multiply(composeMatrix(
        clump.position,
        [0, clump.rotation, 0],
      ));
      [-0.16, -0.08, 0, 0.09, 0.17].forEach((x, index) => {
        const height = 0.38 + (index % 3) * 0.11;
        addInstance(
          grass,
          clumpParent,
          [x, height * 0.5, Math.sin(index * 1.8) * 0.08],
          [0.03 * (index - 2), 0, (x / 0.17) * -0.14],
          [1, height, 1],
          GRASS_COLORS[index % GRASS_COLORS.length],
        );
      });
    });
  });

  return { sandbags, ties, grass, mud, water, crates, crateLids, handles, cans };
}

const COVER_INSTANCES = buildCoverInstances();

function StaticFightingPositions() {
  const sandbagRef = useRef<THREE.InstancedMesh>(null);
  const tieRef = useRef<THREE.InstancedMesh>(null);
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const mudRef = useRef<THREE.InstancedMesh>(null);
  const waterRef = useRef<THREE.InstancedMesh>(null);
  const crateRef = useRef<THREE.InstancedMesh>(null);
  const lidRef = useRef<THREE.InstancedMesh>(null);
  const handleRef = useRef<THREE.InstancedMesh>(null);
  const canRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const batches: Array<[React.RefObject<THREE.InstancedMesh | null>, StaticInstance[]]> = [
      [sandbagRef, COVER_INSTANCES.sandbags],
      [tieRef, COVER_INSTANCES.ties],
      [grassRef, COVER_INSTANCES.grass],
      [mudRef, COVER_INSTANCES.mud],
      [waterRef, COVER_INSTANCES.water],
      [crateRef, COVER_INSTANCES.crates],
      [lidRef, COVER_INSTANCES.crateLids],
      [handleRef, COVER_INSTANCES.handles],
      [canRef, COVER_INSTANCES.cans],
    ];
    batches.forEach(([ref, instances]) => {
      const mesh = ref.current;
      if (!mesh) return;
      instances.forEach((instance, index) => {
        mesh.setMatrixAt(index, instance.matrix);
        if (instance.color) mesh.setColorAt(index, instance.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    });
  }, []);

  return (
    <group>
      <instancedMesh ref={sandbagRef} args={[COVER_GEOMETRY.sandbag, COVER_MATERIAL.sandbag, COVER_INSTANCES.sandbags.length]} castShadow receiveShadow />
      <instancedMesh ref={tieRef} args={[COVER_GEOMETRY.tie, COVER_MATERIAL.tie, COVER_INSTANCES.ties.length]} receiveShadow />
      <instancedMesh ref={grassRef} args={[COVER_GEOMETRY.grass, COVER_MATERIAL.grass, COVER_INSTANCES.grass.length]} />
      <instancedMesh ref={mudRef} args={[COVER_GEOMETRY.circle, COVER_MATERIAL.mud, COVER_INSTANCES.mud.length]} receiveShadow />
      <instancedMesh ref={waterRef} args={[COVER_GEOMETRY.circle, COVER_MATERIAL.water, COVER_INSTANCES.water.length]} receiveShadow />
      <instancedMesh ref={crateRef} args={[COVER_GEOMETRY.box, COVER_MATERIAL.crate, COVER_INSTANCES.crates.length]} castShadow />
      <instancedMesh ref={lidRef} args={[COVER_GEOMETRY.box, COVER_MATERIAL.crateLid, COVER_INSTANCES.crateLids.length]} />
      <instancedMesh ref={handleRef} args={[COVER_GEOMETRY.handle, COVER_MATERIAL.metal, COVER_INSTANCES.handles.length]} />
      <instancedMesh ref={canRef} args={[COVER_GEOMETRY.can, COVER_MATERIAL.can, COVER_INSTANCES.cans.length]} />
    </group>
  );
}

// Five soldiers reuse this compact palette and geometry set. Keeping the models
// deliberately low-poly preserves their readable silhouettes while avoiding the
// dozens of duplicate GPU resources the JSX primitives previously constructed.
const SOLDIER_GEOMETRY = {
  box: new THREE.BoxGeometry(1, 1, 1),
  leg: new THREE.CylinderGeometry(0.052, 0.066, 1, 7),
  canteen: new THREE.CylinderGeometry(0.045, 0.05, 1, 8),
  antenna: new THREE.CylinderGeometry(0.007, 0.012, 1, 6),
  neck: new THREE.CylinderGeometry(0.055, 0.065, 1, 7),
  head: new THREE.SphereGeometry(1, 9, 6),
  hand: new THREE.SphereGeometry(1, 7, 5),
  helmet: new THREE.SphereGeometry(1, 11, 7, 0, Math.PI * 2, 0, Math.PI * 0.68),
  helmetBand: new THREE.TorusGeometry(0.122, 0.011, 5, 14),
  flash: new THREE.ConeGeometry(0.075, 0.2, 7),
};
const standardMaterial = (color: string, roughness: number, metalness = 0) => (
  new THREE.MeshStandardMaterial({ color, roughness, metalness })
);
const SOLDIER_MATERIAL = {
  fatigues: standardMaterial('#343f30', 0.88),
  uniformA: standardMaterial('#3f4c35', 0.84),
  uniformB: standardMaterial('#46543a', 0.84),
  boots: standardMaterial('#312f24', 1),
  fieldGear: standardMaterial('#6f714f', 0.98),
  webbing: standardMaterial('#8a8058', 1),
  pouch: standardMaterial('#6f6848', 1),
  canteen: standardMaterial('#5f694a', 1),
  radio: standardMaterial('#3f4b34', 0.94),
  antenna: standardMaterial('#272d26', 0.68, 0.3),
  neck: standardMaterial('#8c6849', 1),
  skin: standardMaterial('#956f50', 1),
  helmetA: standardMaterial('#44523b', 0.82),
  helmetB: standardMaterial('#505b40', 0.82),
  helmetBand: standardMaterial('#323b2d', 1),
  flash: new THREE.MeshBasicMaterial({
    color: '#ffe28b',
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
};

type SoldierVectorTuple = [number, number, number];

function asNonIndexedGeometry(geometry: THREE.BufferGeometry) {
  if (!geometry.index) return geometry;
  const nonIndexed = geometry.toNonIndexed();
  geometry.dispose();
  return nonIndexed;
}

function colorizeSoldierPart(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
) {
  const vertexCount = geometry.getAttribute('position').count;
  const colors = new Float32Array(vertexCount * 3);
  const resolved = new THREE.Color(color);
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 3;
    colors[offset] = resolved.r;
    colors[offset + 1] = resolved.g;
    colors[offset + 2] = resolved.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function transformedSoldierPart(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  position: SoldierVectorTuple,
  rotation: SoldierVectorTuple = [0, 0, 0],
) {
  const normalizedGeometry = asNonIndexedGeometry(geometry);
  const transform = new THREE.Object3D();
  transform.position.set(...position);
  transform.rotation.set(...rotation);
  transform.updateMatrix();
  normalizedGeometry.applyMatrix4(transform.matrix);
  return colorizeSoldierPart(normalizedGeometry, color);
}

function cylinderBetweenSoldierPoints(
  start: SoldierVectorTuple,
  end: SoldierVectorTuple,
  radiusTop: number,
  radiusBottom: number,
  radialSegments = 7,
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
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments);
  geometry.applyMatrix4(transform);
  return geometry;
}

function mergeSoldierParts(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Unable to merge infantry geometry');
  for (const part of parts) part.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * A tank-scale early M16 silhouette. Every detail is baked into one shared,
 * vertex-coloured geometry so five readable rifles still cost one mesh each.
 */
function buildM16Geometry() {
  const polymer = '#252b28';
  const polymerEdge = '#343b36';
  const gunmetal = '#171d1c';
  const steelEdge = '#303735';
  const parts: THREE.BufferGeometry[] = [
    // Distinct fixed butt stock and butt plate.
    transformedSoldierPart(new THREE.BoxGeometry(0.09, 0.115, 0.255), polymer, [0, 0, 0.155], [-0.035, 0, 0]),
    transformedSoldierPart(new THREE.BoxGeometry(0.105, 0.132, 0.026), polymerEdge, [0, -0.004, 0.286], [-0.035, 0, 0]),
    transformedSoldierPart(new THREE.BoxGeometry(0.073, 0.075, 0.09), polymer, [0, 0.01, 0.005]),

    // Upper/lower receiver, pistol grip, and a slightly canted 20-round magazine.
    transformedSoldierPart(new THREE.BoxGeometry(0.092, 0.105, 0.19), gunmetal, [0, 0, -0.075]),
    transformedSoldierPart(new THREE.BoxGeometry(0.082, 0.055, 0.18), steelEdge, [0, 0.057, -0.082]),
    transformedSoldierPart(new THREE.BoxGeometry(0.052, 0.115, 0.058), polymer, [0, -0.097, 0.002], [-0.18, 0, 0]),
    transformedSoldierPart(new THREE.BoxGeometry(0.06, 0.105, 0.064), gunmetal, [0, -0.103, -0.105], [0.13, 0, 0]),
    transformedSoldierPart(new THREE.BoxGeometry(0.056, 0.085, 0.06), steelEdge, [0, -0.188, -0.092], [-0.04, 0, 0]),

    // The raised carry handle is the most readable early-M16 identifier.
    transformedSoldierPart(new THREE.BoxGeometry(0.047, 0.07, 0.025), gunmetal, [0, 0.105, -0.02], [0.12, 0, 0]),
    transformedSoldierPart(new THREE.BoxGeometry(0.047, 0.07, 0.025), gunmetal, [0, 0.105, -0.145], [-0.12, 0, 0]),
    transformedSoldierPart(new THREE.BoxGeometry(0.047, 0.025, 0.145), steelEdge, [0, 0.139, -0.082]),
    transformedSoldierPart(new THREE.BoxGeometry(0.064, 0.018, 0.022), gunmetal, [0, 0.157, -0.025]),

    // Tapered triangular handguard, long pencil barrel, flash hider, and front sight.
    transformedSoldierPart(new THREE.CylinderGeometry(0.068, 0.043, 0.25, 6), polymerEdge, [0, 0.006, -0.3], [Math.PI / 2, 0, 0]),
    transformedSoldierPart(new THREE.CylinderGeometry(0.012, 0.015, 0.29, 7), gunmetal, [0, 0.012, -0.565], [Math.PI / 2, 0, 0]),
    transformedSoldierPart(new THREE.CylinderGeometry(0.018, 0.022, 0.055, 6), steelEdge, [0, 0.012, -0.738], [Math.PI / 2, 0, 0]),
    transformedSoldierPart(new THREE.BoxGeometry(0.064, 0.025, 0.027), gunmetal, [0, 0.034, -0.65]),
    transformedSoldierPart(new THREE.BoxGeometry(0.018, 0.075, 0.018), gunmetal, [0, 0.075, -0.65]),
  ];
  return mergeSoldierParts(parts);
}

function buildShoulderedArmsGeometry(bodyY: number, rifleY: number) {
  const parts = [
    // Support arm: shoulder -> tucked elbow -> forward handguard grip.
    cylinderBetweenSoldierPoints(
      [-0.16, bodyY + 0.1, -0.012],
      [-0.205, rifleY - 0.005, -0.18],
      0.043,
      0.052,
    ),
    cylinderBetweenSoldierPoints(
      [-0.205, rifleY - 0.005, -0.18],
      [-0.035, rifleY, -0.41],
      0.039,
      0.047,
    ),
    // Trigger arm: raised shoulder -> close elbow -> pistol-grip hand.
    cylinderBetweenSoldierPoints(
      [0.16, bodyY + 0.095, -0.01],
      [0.205, rifleY - 0.045, -0.075],
      0.043,
      0.052,
    ),
    cylinderBetweenSoldierPoints(
      [0.205, rifleY - 0.045, -0.075],
      [0.04, rifleY - 0.012, -0.15],
      0.039,
      0.047,
    ),
  ];
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Unable to merge shouldered arm geometry');
  for (const part of parts) part.dispose();
  merged.computeBoundingSphere();
  return merged;
}

const M16_GEOMETRY = buildM16Geometry();
const M16_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.68,
  metalness: 0.28,
  flatShading: true,
});
const SHOULDERED_ARM_GEOMETRY = {
  kneeling: buildShoulderedArmsGeometry(0.49, 0.57),
  standing: buildShoulderedArmsGeometry(0.62, 0.71),
};
const M16_MUZZLE_Z = -0.77;
const M16_MUZZLE_LOCAL_Z = -0.1 + M16_MUZZLE_Z;
const M16_MUZZLE_LOCAL_Y = 0.012;

function SoldierModel({
  member,
  index,
  soldierRefs,
  bodyRefs,
  flashRefs,
}: {
  member: SquadMember;
  index: number;
  soldierRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  bodyRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  flashRefs: React.MutableRefObject<Array<THREE.Mesh | null>>;
}) {
  const bodyY = member.kneeling ? 0.49 : 0.62;
  const headY = member.kneeling ? 0.76 : 0.9;
  const rifleY = member.kneeling ? 0.57 : 0.71;
  const uniform = index % 2 === 0
    ? SOLDIER_MATERIAL.uniformA
    : SOLDIER_MATERIAL.uniformB;
  const helmet = index % 2 === 0
    ? SOLDIER_MATERIAL.helmetA
    : SOLDIER_MATERIAL.helmetB;

  return (
    <group
      ref={node => { soldierRefs.current[index] = node; }}
      position={member.position}
      scale={SOLDIER_SCALE}
    >
      <group ref={node => { bodyRefs.current[index] = node; }}>
        {member.kneeling ? (
          <>
            <mesh geometry={SOLDIER_GEOMETRY.leg} material={SOLDIER_MATERIAL.fatigues} position={[-0.09, 0.17, 0.02]} rotation={[0.7, 0, 0.08]} scale={[1, 0.34, 1]} />
            <mesh geometry={SOLDIER_GEOMETRY.leg} material={SOLDIER_MATERIAL.fatigues} position={[0.1, 0.14, 0.12]} rotation={[1.17, 0, -0.1]} scale={[1, 0.29, 1]} />
            <mesh geometry={SOLDIER_GEOMETRY.box} material={SOLDIER_MATERIAL.boots} position={[0.1, 0.05, 0.24]} scale={[0.11, 0.075, 0.23]} />
          </>
        ) : (
          [-0.09, 0.09].map(legX => (
            <group key={legX}>
              <mesh geometry={SOLDIER_GEOMETRY.leg} material={SOLDIER_MATERIAL.fatigues} position={[legX, 0.22, 0]} scale={[1, 0.39, 1]} />
              <mesh geometry={SOLDIER_GEOMETRY.box} material={SOLDIER_MATERIAL.boots} position={[legX, 0.04, -0.045]} scale={[0.105, 0.075, 0.2]} />
            </group>
          ))
        )}

        <mesh geometry={SOLDIER_GEOMETRY.box} material={SOLDIER_MATERIAL.fatigues} position={[0, bodyY - 0.16, 0.015]} scale={[0.26, 0.2, 0.19]} />
        <mesh geometry={SOLDIER_GEOMETRY.box} material={uniform} position={[0, bodyY, 0]} scale={[0.35, 0.35, 0.22]} castShadow />
        <mesh geometry={SOLDIER_GEOMETRY.box} material={SOLDIER_MATERIAL.fieldGear} position={[0, bodyY + 0.015, -0.122]} scale={[0.3, 0.28, 0.055]} />

        {/* M1956-style crossed webbing and a readable ammunition-pouch row. */}
        <mesh geometry={SOLDIER_GEOMETRY.box} material={SOLDIER_MATERIAL.webbing} position={[-0.07, bodyY + 0.005, -0.154]} scale={[0.032, 0.36, 0.018]} rotation={[0, 0, -0.25]} />
        <mesh geometry={SOLDIER_GEOMETRY.box} material={SOLDIER_MATERIAL.webbing} position={[0.07, bodyY + 0.005, -0.154]} scale={[0.032, 0.36, 0.018]} rotation={[0, 0, 0.25]} />
        <mesh geometry={SOLDIER_GEOMETRY.box} material={SOLDIER_MATERIAL.pouch} position={[0, bodyY - 0.15, -0.17]} scale={[0.27, 0.11, 0.065]} />
        <mesh geometry={SOLDIER_GEOMETRY.canteen} material={SOLDIER_MATERIAL.canteen} position={[0.18, bodyY - 0.14, 0]} scale={[1, 0.17, 1]} />

        {member.radioOperator && (
          <group position={[0, bodyY, 0.16]}>
            <mesh geometry={SOLDIER_GEOMETRY.box} material={SOLDIER_MATERIAL.radio} scale={[0.27, 0.32, 0.17]} />
            <mesh geometry={SOLDIER_GEOMETRY.antenna} material={SOLDIER_MATERIAL.antenna} position={[0.1, 0.55, 0.03]} rotation={[0.03, 0, -0.04]} scale={[1, 1.05, 1]} />
          </group>
        )}

        <mesh geometry={SOLDIER_GEOMETRY.neck} material={SOLDIER_MATERIAL.neck} position={[0, headY - 0.1, 0]} scale={[1, 0.1, 1]} />
        <mesh geometry={SOLDIER_GEOMETRY.head} material={SOLDIER_MATERIAL.skin} position={[0, headY, -0.015]} scale={0.11} />

        {/* M1 helmet with subdued cloth cover and elastic band. */}
        <group position={[0, headY + 0.09, 0]}>
          <mesh geometry={SOLDIER_GEOMETRY.helmet} material={helmet} scale={[0.157, 0.077, 0.149]} castShadow />
          <mesh geometry={SOLDIER_GEOMETRY.helmetBand} material={SOLDIER_MATERIAL.helmetBand} position={[0, -0.007, 0]} />
        </group>

        {/* Bent arms terminate at the actual trigger and handguard grips. */}
        <mesh
          geometry={member.kneeling
            ? SHOULDERED_ARM_GEOMETRY.kneeling
            : SHOULDERED_ARM_GEOMETRY.standing}
          material={uniform}
        />
        <mesh geometry={SOLDIER_GEOMETRY.hand} material={SOLDIER_MATERIAL.skin} position={[-0.035, rifleY, -0.41]} scale={0.052} />
        <mesh geometry={SOLDIER_GEOMETRY.hand} material={SOLDIER_MATERIAL.skin} position={[0.04, rifleY - 0.012, -0.15]} scale={0.052} />

        {/* One shared early-M16 mesh: fixed stock, carry handle, magazine, sights, and barrel. */}
        <group position={[0, rifleY, -0.1]}>
          <mesh geometry={M16_GEOMETRY} material={M16_MATERIAL} />
          <mesh
            ref={node => { flashRefs.current[index] = node; }}
            geometry={SOLDIER_GEOMETRY.flash}
            material={SOLDIER_MATERIAL.flash}
            position={[0, 0.012, M16_MUZZLE_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
            renderOrder={87}
          />
        </group>
      </group>
    </group>
  );
}

const createTracerCylinder = (
  radiusTop: number,
  radiusBottom: number,
  length: number,
  zOffset: number,
) => {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 6);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, zOffset);
  return geometry;
};
const TRACER_GEOMETRY = {
  core: createTracerCylinder(0.021, 0.011, TRACER_LENGTH, -TRACER_LENGTH * 0.5),
  glow: createTracerCylinder(0.052, 0.022, TRACER_LENGTH * 1.08, -TRACER_LENGTH * 0.52),
  tip: new THREE.SphereGeometry(0.057, 8, 6),
};
const TRACER_MATERIAL = {
  core: new THREE.MeshBasicMaterial({
    color: '#ffe39b',
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }),
  glow: new THREE.MeshBasicMaterial({
    color: '#e0a64f',
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }),
  tip: new THREE.MeshBasicMaterial({
    color: '#fff4c6',
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }),
};

export function USInfantrySquad({
  enemies,
  obstacles = [],
  onEnemyHit,
  onFriendlyFire,
  enabled = true,
}: USInfantrySquadProps) {
  const soldierRefs = useRef<Array<THREE.Group | null>>([]);
  const bodyRefs = useRef<Array<THREE.Group | null>>([]);
  const flashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const tracerCoreRef = useRef<THREE.InstancedMesh>(null);
  const tracerGlowRef = useRef<THREE.InstancedMesh>(null);
  const tracerTipRef = useRef<THREE.InstancedMesh>(null);
  const runtimeRef = useRef(new Map<string, SoldierRuntime>());
  const projectileCursorRef = useRef(0);
  const activeBoundMemberRef = useRef(-1);
  const boundCursorRef = useRef(0);
  const nextSquadBoundAtRef = useRef(5.8);

  const projectilePool = useMemo<FriendlyProjectile[]>(() => (
    Array.from({ length: FRIENDLY_PROJECTILE_CAPACITY }, () => ({
      active: false,
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      lifetime: 0,
      soldierId: '',
    }))
  ), []);
  const muzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const candidateMuzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const shotDirection = useMemo(() => new THREE.Vector3(), []);
  const impactPosition = useMemo(() => new THREE.Vector3(), []);
  const tracerForward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const tracerQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tracerMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tracerScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  useLayoutEffect(() => {
    const meshes = [tracerCoreRef.current, tracerGlowRef.current, tracerTipRef.current];
    meshes.forEach(mesh => {
      if (!mesh) return;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    });
  }, []);

  const spawnFriendlyRound = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    soldierId: string,
  ) => {
    for (let offset = 0; offset < projectilePool.length; offset += 1) {
      const index = (projectileCursorRef.current + offset) % projectilePool.length;
      const projectile = projectilePool[index];
      if (projectile.active) continue;
      projectileCursorRef.current = (index + 1) % projectilePool.length;
      projectile.active = true;
      projectile.position.copy(position);
      projectile.previousPosition.copy(position);
      projectile.direction.copy(direction).normalize();
      projectile.lifetime = 0;
      projectile.soldierId = soldierId;
      return true;
    }
    return false;
  };

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;

    if (!enabled) {
      for (const projectile of projectilePool) projectile.active = false;
      for (const flash of flashRefs.current) if (flash) flash.visible = false;
    }

    for (let memberIndex = 0; memberIndex < SQUAD.length; memberIndex += 1) {
      const member = SQUAD[memberIndex];
      let runtime = runtimeRef.current.get(member.id);
      if (!runtime) {
        runtime = {
          nextShotAt: now + member.initialDelay,
          shotIndex: 0,
          flashUntil: 0,
          recoilUntil: 0,
          burstRemaining: member.burstSize,
          baseX: member.position[0],
          baseZ: member.position[2],
          moveFromX: member.position[0],
          moveFromZ: member.position[2],
          moveToX: member.position[0],
          moveToZ: member.position[2],
          moveStartedAt: 0,
          moveEndsAt: 0,
          moving: false,
          atAlternate: false,
        };
        runtimeRef.current.set(member.id, runtime);
      }

      // One rifleman at a time makes a short, deterministic bound within the
      // protection of his existing emplacement. The radio operator holds fast.
      if (enabled
        && enemies.length > 0
        && activeBoundMemberRef.current < 0
        && now >= nextSquadBoundAtRef.current) {
        while (!SQUAD[boundCursorRef.current]?.alternatePosition) {
          boundCursorRef.current = (boundCursorRef.current + 1) % SQUAD.length;
        }
        if (memberIndex === boundCursorRef.current && member.alternatePosition) {
          runtime.moveFromX = runtime.baseX;
          runtime.moveFromZ = runtime.baseZ;
          runtime.moveToX = runtime.atAlternate
            ? member.position[0]
            : member.alternatePosition[0];
          runtime.moveToZ = runtime.atAlternate
            ? member.position[2]
            : member.alternatePosition[2];
          runtime.moveStartedAt = now;
          runtime.moveEndsAt = now + 0.82
            + deterministicNoise(member.id, runtime.shotIndex, 31) * 0.28;
          runtime.moving = true;
          activeBoundMemberRef.current = memberIndex;
          runtime.nextShotAt = Math.max(runtime.nextShotAt, runtime.moveEndsAt + 0.22);
        }
      }

      const soldier = soldierRefs.current[memberIndex];
      const body = bodyRefs.current[memberIndex];
      const flash = flashRefs.current[memberIndex];
      let movementProgress = 0;
      let movementBlend = 0;
      if (runtime.moving) {
        const movementDuration = Math.max(0.001, runtime.moveEndsAt - runtime.moveStartedAt);
        movementProgress = THREE.MathUtils.clamp(
          (now - runtime.moveStartedAt) / movementDuration,
          0,
          1,
        );
        movementBlend = movementProgress * movementProgress * (3 - 2 * movementProgress);
        runtime.baseX = THREE.MathUtils.lerp(runtime.moveFromX, runtime.moveToX, movementBlend);
        runtime.baseZ = THREE.MathUtils.lerp(runtime.moveFromZ, runtime.moveToZ, movementBlend);

        if (movementProgress >= 1) {
          runtime.baseX = runtime.moveToX;
          runtime.baseZ = runtime.moveToZ;
          runtime.moving = false;
          runtime.atAlternate = !runtime.atAlternate;
          activeBoundMemberRef.current = -1;
          boundCursorRef.current = (memberIndex + 1) % SQUAD.length;
          nextSquadBoundAtRef.current = now + 6.6
            + deterministicNoise(member.id, runtime.shotIndex, 32) * 3.2;
        }
      }
      if (soldier) {
        // Add the established idle weight shift around the current cover slot.
        soldier.position.x = runtime.baseX
          + Math.sin(now * (0.34 + memberIndex * 0.025) + memberIndex * 1.7) * 0.045;
        soldier.position.z = runtime.baseZ
          + Math.sin(now * 0.27 + memberIndex * 2.1) * 0.026;
      }
      if (body) {
        const recoil = now < runtime.recoilUntil
          ? Math.sin((runtime.recoilUntil - now) * 62) * 0.034
          : 0;
        const boundStride = runtime.moving
          ? Math.sin(movementProgress * Math.PI * 4)
          : 0;
        body.rotation.x = recoil + (member.kneeling ? -0.012 : 0.045)
          + (runtime.moving ? 0.075 : 0);
        body.rotation.z = runtime.moving
          ? boundStride * 0.055
          : Math.sin(now * 1.3 + memberIndex * 1.9) * 0.018;
        body.position.y = (runtime.moving ? Math.abs(boundStride) * 0.025 : 0)
          + Math.sin(now * 1.05 + memberIndex) * 0.009
          - (member.kneeling ? (Math.sin(now * 0.42 + memberIndex) + 1) * 0.008 : 0);
        body.position.z = recoil * 0.6;
      }
      if (flash) {
        flash.visible = now < runtime.flashUntil;
        if (flash.visible) flash.scale.setScalar(0.82 + Math.sin(now * 157 + memberIndex) * 0.18);
      }

      if (!enabled || enemies.length === 0) {
        if (soldier) {
          soldier.rotation.y = Math.PI
            + Math.sin(now * 0.24 + memberIndex * 1.3) * (member.radioOperator ? 0.34 : 0.22);
        }
        continue;
      }

      // Pick a stable preferred contact without allocating or sorting temporary
      // arrays. On firing frames this is only a distribution bias: the clear-
      // lane pass below chooses the final target before the rifle is rotated.
      let preferredTarget: EnemyCombatant | null = null;
      let preferredTargetIndex = -1;
      let aimScore = Number.POSITIVE_INFINITY;
      for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex += 1) {
        const candidate = enemies[enemyIndex];
        if (!candidate.alive) continue;
        const dx = candidate.position[0] - (soldier?.position.x ?? runtime.baseX);
        const dz = candidate.position[2] - (soldier?.position.z ?? runtime.baseZ);
        const assignmentPenalty = ((enemyIndex + 3 - (memberIndex % 3)) % 3) * 12;
        const score = dx * dx + dz * dz + assignmentPenalty;
        if (score >= aimScore) continue;
        aimScore = score;
        preferredTarget = candidate;
        preferredTargetIndex = enemyIndex;
      }
      if (!preferredTarget) continue;

      if (runtime.moving || now < runtime.nextShotAt) {
        if (soldier) {
          soldier.rotation.y = Math.atan2(
            -(preferredTarget.position[0] - soldier.position.x),
            -(preferredTarget.position[2] - soldier.position.z),
          );
        }
        continue;
      }

      // Estimate the candidate-specific muzzle location for cover tests. The
      // forward offset mirrors the rendered M16 but does not mutate scene
      // matrices, so the final clear/suppression target can be chosen first.
      const soldierX = soldier?.position.x ?? member.position[0];
      const soldierY = soldier?.position.y ?? member.position[1];
      const soldierZ = soldier?.position.z ?? member.position[2];
      const rifleY = member.kneeling ? 0.57 : 0.71;
      const candidateMuzzleY = soldierY + (
        (body?.position.y ?? 0) + rifleY + M16_MUZZLE_LOCAL_Y
      ) * SOLDIER_SCALE;
      const muzzleForwardOffset = -(
        M16_MUZZLE_LOCAL_Z + (body?.position.z ?? 0)
      ) * SOLDIER_SCALE;
      let selectedTarget: EnemyCombatant | null = null;
      let suppressionTarget: EnemyCombatant | null = null;
      let selectedScore = Number.POSITIVE_INFINITY;
      let suppressionScore = Number.POSITIVE_INFINITY;
      for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex += 1) {
        const candidate = enemies[enemyIndex];
        if (!candidate.alive) continue;
        targetPosition.set(
          candidate.position[0],
          candidate.position[1] + (candidate.stance === 'kneeling' ? 0.52 : 0.68),
          candidate.position[2],
        );
        const targetDx = targetPosition.x - soldierX;
        const targetDz = targetPosition.z - soldierZ;
        const horizontalDistance = Math.sqrt(targetDx * targetDx + targetDz * targetDz);
        const muzzleOffsetScale = horizontalDistance > 0.0001
          ? muzzleForwardOffset / horizontalDistance
          : 0;
        candidateMuzzlePosition.set(
          soldierX + targetDx * muzzleOffsetScale,
          candidateMuzzleY,
          soldierZ + targetDz * muzzleOffsetScale,
        );
        const distanceSq = candidateMuzzlePosition.distanceToSquared(targetPosition);
        if (distanceSq > FRIENDLY_MAX_RANGE * FRIENDLY_MAX_RANGE) continue;
        const assignmentPenalty = ((enemyIndex + 3 - (memberIndex % 3)) % 3) * 12;
        const score = distanceSq
          + assignmentPenalty
          + (enemyIndex === preferredTargetIndex ? -8 : 0);
        if (score < suppressionScore) {
          suppressionScore = score;
          suppressionTarget = candidate;
        }
        if (score >= selectedScore) continue;
        const obstacleT = findNearestObstacleHit(candidateMuzzlePosition, targetPosition, obstacles);
        if (obstacleT !== null && obstacleT < 0.9) continue;
        if (terrainBlocksCombatSegment(candidateMuzzlePosition, targetPosition)) continue;
        selectedTarget = candidate;
        selectedScore = score;
      }

      // The team still lays visible suppressive fire when vegetation, huts, or a
      // mound masks every direct lane. Collision checks below continue to stop the
      // projectile at that cover, so this improves feedback without wall-hacking.
      selectedTarget ??= suppressionTarget;
      if (!selectedTarget) {
        if (soldier) {
          soldier.rotation.y = Math.atan2(
            -(preferredTarget.position[0] - soldier.position.x),
            -(preferredTarget.position[2] - soldier.position.z),
          );
        }
        runtime.nextShotAt = now + 0.45;
        continue;
      }

      targetPosition.set(
        selectedTarget.position[0],
        selectedTarget.position[1] + (selectedTarget.stance === 'kneeling' ? 0.52 : 0.68),
        selectedTarget.position[2],
      );

      // Rotate to the final selected contact, update the complete model hierarchy,
      // and only then sample the rendered flash socket. This keeps rifle, flash,
      // tracer, and damage ray on the same target even when a nearer lane is blocked.
      if (soldier) {
        soldier.rotation.y = Math.atan2(
          -(targetPosition.x - soldier.position.x),
          -(targetPosition.z - soldier.position.z),
        );
      }
      if (soldier && flash) {
        soldier.updateWorldMatrix(true, true);
        flash.getWorldPosition(muzzlePosition);
      } else {
        const targetDx = targetPosition.x - soldierX;
        const targetDz = targetPosition.z - soldierZ;
        const horizontalDistance = Math.sqrt(targetDx * targetDx + targetDz * targetDz);
        const muzzleOffsetScale = horizontalDistance > 0.0001
          ? muzzleForwardOffset / horizontalDistance
          : 0;
        muzzlePosition.set(
          soldierX + targetDx * muzzleOffsetScale,
          candidateMuzzleY,
          soldierZ + targetDz * muzzleOffsetScale,
        );
      }
      shotDirection.copy(targetPosition).sub(muzzlePosition).normalize();
      const shotIndex = runtime.shotIndex++;
      shotDirection.x += (deterministicNoise(member.id, shotIndex, 1) - 0.5) * member.accuracy * 2;
      shotDirection.y += (deterministicNoise(member.id, shotIndex, 2) - 0.5) * member.accuracy;
      shotDirection.z += (deterministicNoise(member.id, shotIndex, 3) - 0.5) * member.accuracy * 2;
      shotDirection.normalize();

      if (spawnFriendlyRound(muzzlePosition, shotDirection, member.id)) {
        runtime.flashUntil = now + 0.075;
        runtime.recoilUntil = now + 0.11;
        onFriendlyFire?.({
          soldierId: member.id,
          targetEnemyId: selectedTarget.id,
          position: muzzlePosition.clone(),
          direction: shotDirection.clone(),
        });
      }
      runtime.burstRemaining -= 1;
      if (runtime.burstRemaining > 0) {
        runtime.nextShotAt = now + 0.105 + deterministicNoise(member.id, shotIndex, 5) * 0.065;
      } else {
        runtime.burstRemaining = member.burstSize;
        runtime.nextShotAt = now + member.fireInterval * (
          0.9 + deterministicNoise(member.id, shotIndex, 4) * 0.25
        );
      }
    }

    let tracerCount = 0;
    for (let projectileIndex = 0; projectileIndex < projectilePool.length; projectileIndex += 1) {
      const projectile = projectilePool[projectileIndex];
      if (!projectile.active) continue;
      projectile.previousPosition.copy(projectile.position);
      projectile.position.addScaledVector(projectile.direction, FRIENDLY_RIFLE_SPEED * delta);
      projectile.lifetime += delta;

      if (projectile.lifetime >= FRIENDLY_RIFLE_LIFETIME
        || terrainBlocksCombatSegment(projectile.previousPosition, projectile.position)) {
        projectile.active = false;
        continue;
      }

      const obstacleHitT = projectile.lifetime > 0.08
        ? findNearestObstacleHit(projectile.previousPosition, projectile.position, obstacles)
        : null;
      const enemyHit = findNearestLivingEnemyHit(
        projectile.previousPosition,
        projectile.position,
        enemies,
      );

      if (enemyHit && (obstacleHitT === null || enemyHit.t < obstacleHitT)) {
        impactPosition.copy(enemyHit.point);
        onEnemyHit?.({
          soldierId: projectile.soldierId,
          enemyId: enemyHit.enemy.id,
          position: impactPosition.clone(),
          damage: FRIENDLY_RIFLE_DAMAGE,
        });
        projectile.active = false;
        continue;
      }
      if (obstacleHitT !== null) {
        projectile.active = false;
        continue;
      }

      tracerQuaternion.setFromUnitVectors(tracerForward, projectile.direction);
      tracerMatrix.compose(projectile.position, tracerQuaternion, tracerScale);
      tracerCoreRef.current?.setMatrixAt(tracerCount, tracerMatrix);
      tracerGlowRef.current?.setMatrixAt(tracerCount, tracerMatrix);
      tracerTipRef.current?.setMatrixAt(tracerCount, tracerMatrix);
      tracerCount += 1;
    }

    const core = tracerCoreRef.current;
    const glow = tracerGlowRef.current;
    const tip = tracerTipRef.current;
    if (core) {
      core.count = tracerCount;
      if (tracerCount > 0) core.instanceMatrix.needsUpdate = true;
    }
    if (glow) {
      glow.count = tracerCount;
      if (tracerCount > 0) glow.instanceMatrix.needsUpdate = true;
    }
    if (tip) {
      tip.count = tracerCount;
      if (tracerCount > 0) tip.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group dispose={null}>
      <StaticFightingPositions />

      {SQUAD.map((member, index) => (
        <SoldierModel
          key={member.id}
          member={member}
          index={index}
          soldierRefs={soldierRefs}
          bodyRefs={bodyRefs}
          flashRefs={flashRefs}
        />
      ))}

      <instancedMesh
        ref={tracerCoreRef}
        args={[TRACER_GEOMETRY.core, TRACER_MATERIAL.core, FRIENDLY_PROJECTILE_CAPACITY]}
        renderOrder={86}
        frustumCulled={false}
      />
      <instancedMesh
        ref={tracerGlowRef}
        args={[TRACER_GEOMETRY.glow, TRACER_MATERIAL.glow, FRIENDLY_PROJECTILE_CAPACITY]}
        renderOrder={86}
        frustumCulled={false}
      />
      <instancedMesh
        ref={tracerTipRef}
        args={[TRACER_GEOMETRY.tip, TRACER_MATERIAL.tip, FRIENDLY_PROJECTILE_CAPACITY]}
        renderOrder={86}
        frustumCulled={false}
      />
    </group>
  );
}
