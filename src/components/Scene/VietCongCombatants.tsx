import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CombatObstacle,
  EnemyCombatant,
  EnemyFireEvent,
  EnemyTankHitEvent,
  ENEMY_RIFLE_DAMAGE,
  ENEMY_RIFLE_LIFETIME,
  ENEMY_RIFLE_SPEED,
  findNearestObstacleHit,
  hashCombatSession,
  segmentSphereIntersection,
  terrainBlocksCombatSegment,
} from '../../lib/combat';

const HOSTILE_PROJECTILE_CAPACITY = 48;
const TANK_HIT_RADIUS = 0.95;
const TRACER_LENGTH = 0.72;
const MAX_ENGAGEMENT_RANGE = 48;

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

const CONCEALMENT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 1,
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
}

export interface VietCongCombatantsProps {
  enemies: readonly EnemyCombatant[];
  tankRef: RefObject<THREE.Group | null>;
  /** Optional hut/structure volumes. Enemy rounds stop safely without touching file handlers. */
  obstacles?: readonly CombatObstacle[];
  onTankHit?: (event: EnemyTankHitEvent) => void;
  onEnemyFire?: (event: EnemyFireEvent) => void;
  enabled?: boolean;
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

  // The arms remain visibly shouldered: trigger hand aft and support hand on the foregrip.
  parts.push(
    cylinderPart([-0.145, torsoY + 0.105, -0.015], [-0.13, rifleY + 0.045, -0.18], 0.05, palette.shirt),
    cylinderPart([-0.13, rifleY + 0.045, -0.18], [-0.035, rifleY, -0.41], 0.044, palette.shirt),
    cylinderPart([0.15, torsoY + 0.1, -0.012], [0.13, rifleY + 0.035, -0.12], 0.05, palette.shirt),
    cylinderPart([0.13, rifleY + 0.035, -0.12], [0.055, rifleY - 0.002, -0.2], 0.044, palette.shirt),
    transformedPart(new THREE.SphereGeometry(0.052, 7, 5), '#805d3f', [-0.035, rifleY, -0.41]),
    transformedPart(new THREE.SphereGeometry(0.052, 7, 5), '#805d3f', [0.055, rifleY - 0.002, -0.2]),
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

  // Wood-stocked AK-pattern rifle. All parts merge into the same fighter draw object.
  parts.push(
    transformedPart(new THREE.BoxGeometry(0.105, 0.105, 0.31), '#6a4228', [0.05, rifleY + 0.012, 0.03], [0.03, 0, -0.04]),
    transformedPart(new THREE.BoxGeometry(0.09, 0.095, 0.2), '#252821', [0.025, rifleY, -0.205]),
    transformedPart(new THREE.BoxGeometry(0.072, 0.15, 0.095), '#3a3022', [0.025, rifleY - 0.095, -0.187], [0.12, 0, 0]),
    transformedPart(new THREE.BoxGeometry(0.07, 0.1, 0.08), '#4b3726', [0.025, rifleY - 0.165, -0.15], [0.22, 0, 0]),
    transformedPart(new THREE.CylinderGeometry(0.018, 0.022, 0.38, 6), '#20231e', [0.025, rifleY + 0.018, -0.445], [Math.PI / 2, 0, 0]),
    transformedPart(new THREE.CylinderGeometry(0.014, 0.016, 0.25, 6), '#30352b', [0.025, rifleY + 0.052, -0.39], [Math.PI / 2, 0, 0]),
    transformedPart(new THREE.CylinderGeometry(0.025, 0.018, 0.075, 6), '#1d201c', [0.025, rifleY + 0.018, -0.65], [Math.PI / 2, 0, 0]),
  );

  return mergeColoredParts(parts);
}

function buildConcealmentGeometry(kneeling: boolean, variant: number) {
  const coverHeight = kneeling ? 0.31 : 0.26;
  const paletteVariants = [
    ['#263f20', '#365526', '#4b6a2d'],
    ['#1f381d', '#315126', '#526b2c'],
    ['#29441f', '#3e5b28', '#5c7132'],
  ];
  const leafPalette = paletteVariants[variant % paletteVariants.length];
  const parts: THREE.BufferGeometry[] = [];
  const baseSeed = 7331 + variant * 971 + (kneeling ? 101 : 0);

  // Stable seeded scatter: open centre preserves hit readability and minimum spacing avoids overlap.
  const clusterAnchors: Array<[number, number]> = [
    [-0.48, 0.05],
    [0.47, 0.09],
    [-0.24, 0.28],
    [0.25, 0.3],
  ];
  clusterAnchors.forEach(([anchorX, anchorZ], clusterIndex) => {
    const jitterX = (deterministicUnit(baseSeed, clusterIndex * 3 + 1) - 0.5) * 0.1;
    const jitterZ = (deterministicUnit(baseSeed, clusterIndex * 3 + 2) - 0.5) * 0.08;
    const scale = 0.82 + deterministicUnit(baseSeed, clusterIndex * 3 + 3) * 0.28;
    const x = anchorX + jitterX;
    const z = anchorZ + jitterZ;
    const height = coverHeight * scale;
    parts.push(
      transformedPart(new THREE.CylinderGeometry(0.008, 0.014, height, 5), '#3c3f25', [x, height * 0.5, z]),
      transformedPart(
        new THREE.IcosahedronGeometry(0.135 * scale, 0),
        leafPalette[clusterIndex % leafPalette.length],
        [x + (clusterIndex % 2 ? 0.025 : -0.02), height * 0.84, z - 0.012],
        [0.18, deterministicUnit(baseSeed, clusterIndex + 30) * Math.PI, 0.12],
        [1.25, 0.8, 1],
      ),
    );
  });

  for (let frondIndex = 0; frondIndex < 4; frondIndex += 1) {
    const side = frondIndex < 2 ? -1 : 1;
    const localIndex = frondIndex % 2;
    const x = side * (0.55 + localIndex * 0.09);
    const z = 0.12 + localIndex * 0.08;
    const tilt = side * (0.28 + deterministicUnit(baseSeed, frondIndex + 50) * 0.2);
    parts.push(transformedPart(
      new THREE.BoxGeometry(0.055, 0.28 - localIndex * 0.035, 0.018),
      leafPalette[(frondIndex + 1) % leafPalette.length],
      [x, 0.16, z],
      [0.18, tilt, -tilt * 0.85],
    ));
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

const CONCEALMENT_GEOMETRIES = Array.from({ length: 2 }, (_, stanceIndex) => (
  Array.from({ length: 6 }, (_, variant) => buildConcealmentGeometry(stanceIndex === 1, variant))
));

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
  const concealmentVariant = Math.abs(seed) % CONCEALMENT_GEOMETRIES[stanceIndex].length;
  const concealmentRotation = Math.atan2(enemy.position[0], enemy.position[2])
    + (deterministicUnit(seed, 17) - 0.5) * 0.28;
  const bodyWidth = 0.94 + deterministicUnit(seed, 21) * 0.07;
  const bodyHeight = 0.94 + deterministicUnit(seed, 22) * 0.07;
  const rifleY = kneeling ? 0.53 : 0.67;

  return (
    <group position={enemy.position} dispose={null}>
      <mesh
        geometry={CONCEALMENT_GEOMETRIES[stanceIndex][concealmentVariant]}
        material={CONCEALMENT_MATERIAL}
        rotation={[0, concealmentRotation, 0]}
        receiveShadow
      />

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
          position={[0.025, rifleY + 0.018, -0.72]}
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
  tankRef,
  obstacles = [],
  onTankHit,
  onEnemyFire,
  enabled = true,
  maxEngagementRange = MAX_ENGAGEMENT_RANGE,
}: VietCongCombatantsProps) {
  const fighterRefs = useRef<Array<THREE.Group | null>>([]);
  const muzzleFlashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const tracerMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const runtimeByEnemyRef = useRef(new Map<string, FighterRuntime>());

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

    const tank = tankRef.current;
    if (tank) {
      tank.getWorldPosition(tankCenter);
      tankCenter.y += 0.64;
    }

    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      const fighter = fighterRefs.current[index];
      const flash = muzzleFlashRefs.current[index];
      if (!enemy.alive) {
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
        };
        runtimeByEnemyRef.current.set(enemy.id, runtime);
      }

      if (fighter) {
        fighter.visible = true;
        if (tank) {
          const dx = tankCenter.x - enemy.position[0];
          const dz = tankCenter.z - enemy.position[2];
          fighter.rotation.y = Math.atan2(-dx, -dz);
        }
        const idlePhase = now * (0.48 + index * 0.014) + index * 1.67;
        fighter.position.x = Math.sin(idlePhase) * (enemy.stance === 'kneeling' ? 0.006 : 0.014);
        fighter.position.y = Math.sin(idlePhase * 1.7) * 0.006;
        fighter.position.z = now < runtime.flashUntil ? 0.018 : 0;
        fighter.rotation.x = Math.sin(now * 0.72 + index * 1.31) * 0.006;
        fighter.rotation.z = Math.sin(idlePhase * 0.82) * (enemy.stance === 'kneeling' ? 0.006 : 0.014);
      }
      if (flash) {
        flash.visible = now < runtime.flashUntil;
        if (flash.visible) {
          flash.scale.setScalar(0.82 + Math.sin(now * 145 + index) * 0.18);
        }
      }

      if (!tank || now < runtime.nextShotAt) continue;

      muzzlePosition.set(
        enemy.position[0],
        enemy.position[1] + (enemy.stance === 'kneeling' ? 0.53 : 0.67),
        enemy.position[2],
      );
      aimDirection.copy(tankCenter).sub(muzzlePosition);
      const distance = aimDirection.length();
      if (distance > maxEngagementRange || distance < 3.2) {
        runtime.nextShotAt = now + 0.45;
        continue;
      }

      // Keep terrain and huts tactically meaningful; concealed soldiers do not shoot through them.
      const obstacleHitT = findNearestObstacleHit(muzzlePosition, tankCenter, obstacles);
      if (terrainBlocksCombatSegment(muzzlePosition, tankCenter)
        || (obstacleHitT !== null && obstacleHitT < 0.88)) {
        runtime.nextShotAt = now + 0.42;
        continue;
      }

      aimDirection.normalize();
      const shotIndex = runtime.shotIndex++;
      aimDirection.x += (shotNoise(enemy.id, shotIndex, 1) - 0.5) * enemy.accuracy * 2;
      aimDirection.y += (shotNoise(enemy.id, shotIndex, 2) - 0.5) * enemy.accuracy * 0.8;
      aimDirection.z += (shotNoise(enemy.id, shotIndex, 3) - 0.5) * enemy.accuracy * 2;
      aimDirection.normalize();

      // Move the logical muzzle to the visible rifle tip along the aimed heading.
      muzzlePosition.addScaledVector(aimDirection, 0.62);
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
          const tankHitT = tank
            ? segmentSphereIntersection(
                projectile.previousPosition,
                projectile.position,
                tankCenter,
                TANK_HIT_RADIUS,
              )
            : null;

          if (tankHitT !== null && (obstacleHitT === null || tankHitT < obstacleHitT)) {
            impactPosition.copy(projectile.previousPosition).lerp(projectile.position, tankHitT);
            onTankHit?.({
              enemyId: projectile.shooterId,
              position: impactPosition.clone(),
              damage: ENEMY_RIFLE_DAMAGE,
            });
            projectile.active = false;
          } else if (obstacleHitT !== null) {
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
