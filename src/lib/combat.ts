import * as THREE from 'three';
import { intersectsTerrainMound } from './terrain';

export type EnemyStance = 'standing' | 'kneeling';
export type EnemyHeadwear = 'boonie' | 'pith';
export type EnemyDamageSource =
  | 'cannon'
  | 'machinegun'
  | 'flamethrower'
  | 'napalm'
  | 'friendly-rifle';

export interface EnemyCombatant {
  id: string;
  position: [number, number, number];
  health: number;
  maxHealth: number;
  alive: boolean;
  stance: EnemyStance;
  headwear: EnemyHeadwear;
  uniformVariant: number;
  fireInterval: number;
  initialFireDelay: number;
  accuracy: number;
}

export interface FriendlyCombatant {
  id: string;
  position: [number, number, number];
  health: number;
  maxHealth: number;
  alive: boolean;
  kneeling: boolean;
}

export interface FriendlyCombatPose {
  /** Mutable world-space center updated by the rendered squad without React state churn. */
  position: THREE.Vector3;
}

export interface CombatObstacle {
  position: [number, number, number];
  radius: number;
}

export interface EnemyFireEvent {
  enemyId: string;
  position: THREE.Vector3;
  direction: THREE.Vector3;
}

export interface EnemyTankHitEvent {
  enemyId: string;
  position: THREE.Vector3;
  damage: number;
}

export interface EnemyFriendlyHitEvent {
  enemyId: string;
  friendlyId: string;
  position: THREE.Vector3;
  damage: number;
}

export interface FriendlyFireEvent {
  soldierId: string;
  targetEnemyId: string;
  position: THREE.Vector3;
  direction: THREE.Vector3;
}

export interface FriendlyEnemyHitEvent {
  soldierId: string;
  enemyId: string;
  position: THREE.Vector3;
  damage: number;
}

export interface EnemyHitResult {
  enemy: EnemyCombatant;
  point: THREE.Vector3;
  /** Parametric distance along the tested segment, from 0 at start to 1 at end. */
  t: number;
}

export const ENEMY_MAX_HEALTH = 100;
export const ENEMY_HIT_RADIUS = 0.48;
export const FRIENDLY_MAX_HEALTH = 100;
export const FRIENDLY_HIT_RADIUS = 0.46;
// Infantry crossfire primarily sells battlefield pressure; it should not decide
// the cleanup encounter before the player has time to engage with the tank.
export const ENEMY_RIFLE_DAMAGE = 1;
export const ENEMY_RIFLE_INFANTRY_DAMAGE = 34;
export const ENEMY_RIFLE_SPEED = 18;
export const ENEMY_RIFLE_LIFETIME = 3.2;

export const US_INFANTRY_DEPLOYMENT = [
  { id: 'us-rifle-1', position: [-5.65, 0.02, -5.35] as [number, number, number], kneeling: true },
  { id: 'us-rifle-2', position: [-4.12, 0.02, -5.18] as [number, number, number], kneeling: true },
  { id: 'us-rifle-3', position: [4.18, 0.02, -3.96] as [number, number, number], kneeling: true },
  { id: 'us-rto-4', position: [5.72, 0.02, -3.78] as [number, number, number], kneeling: false },
  { id: 'us-rifle-5', position: [0.25, 0.02, 1.82] as [number, number, number], kneeling: true },
] as const;

export function createUSInfantryCombatants(): FriendlyCombatant[] {
  return US_INFANTRY_DEPLOYMENT.map(member => ({
    id: member.id,
    position: [...member.position],
    health: FRIENDLY_MAX_HEALTH,
    maxHealth: FRIENDLY_MAX_HEALTH,
    alive: true,
    kneeling: member.kneeling,
  }));
}

const DEFAULT_SPAWN_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [-10.5, 7.5],
  [10.5, 7.5],
  [-17.5, 15],
  [17.5, 15],
  [-9.5, 22.5],
  [9.5, 22.5],
  [-20.5, 29],
  [20.5, 29],
  [-3.5, 31.5],
  [5, 34.5],
  [-16.5, 38],
  [17, 39],
];

const MIN_ENEMY_COUNT = 6;
const MAX_ENEMY_COUNT = DEFAULT_SPAWN_ANCHORS.length;
const MIN_SPAWN_SPACING = 4.8;
// Keep this encounter in the established central combat lane. The western edge
// remains clear for large environmental features such as the river corridor.
const SPAWN_BOUNDS = { minX: -24, maxX: 24, minZ: 5.5, maxZ: 43 } as const;
const VC_LOW_COVER_LIPS = [
  [0, 0.43, 0.27],
  [-0.38, 0.28, 0.24],
  [0.38, 0.28, 0.24],
] as const;

function seeded(seed: number, index: number, salt = 0) {
  const value = Math.sin(seed * 13.731 + index * 91.719 + salt * 17.173) * 43758.5453;
  return value - Math.floor(value);
}

export function hashCombatSession(value: string | number) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveSpawnPoint(
  seed: number,
  index: number,
  anchorX: number,
  anchorZ: number,
  occupied: readonly [number, number, number][],
) {
  const jitterX = (seeded(seed, index, 1) - 0.5) * 1.8;
  const jitterZ = (seeded(seed, index, 2) - 0.5) * 1.8;
  const phase = seeded(seed, index, 3) * Math.PI * 2;
  let terrainSafeFallback: [number, number, number] | null = null;

  // A deterministic sunflower search acts as a small Poisson-disc resolver:
  // every candidate is repeatable, mound-safe, and separated from prior troops.
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const radius = attempt === 0 ? 0 : 0.8 + Math.sqrt(attempt) * 0.72;
    const angle = phase + attempt * 2.399963229728653;
    const x = THREE.MathUtils.clamp(
      anchorX + jitterX + Math.cos(angle) * radius,
      SPAWN_BOUNDS.minX,
      SPAWN_BOUNDS.maxX,
    );
    const z = THREE.MathUtils.clamp(
      anchorZ + jitterZ + Math.sin(angle) * radius,
      SPAWN_BOUNDS.minZ,
      SPAWN_BOUNDS.maxZ,
    );
    if (intersectsTerrainMound(x, z, 0.45)) continue;
    terrainSafeFallback ??= [x, 0.02, z];
    if (occupied.some(([otherX, , otherZ]) => (
      Math.hypot(x - otherX, z - otherZ) < MIN_SPAWN_SPACING
    ))) continue;
    return [x, 0.02, z] as [number, number, number];
  }

  // The authored anchors are already widely spaced, so this deterministic grid
  // is only a defensive fallback for an unlucky seed near a terrain mound.
  for (let offsetZ = -6; offsetZ <= 6; offsetZ += 1) {
    for (let offsetX = -6; offsetX <= 6; offsetX += 1) {
      const x = THREE.MathUtils.clamp(anchorX + offsetX, SPAWN_BOUNDS.minX, SPAWN_BOUNDS.maxX);
      const z = THREE.MathUtils.clamp(anchorZ + offsetZ, SPAWN_BOUNDS.minZ, SPAWN_BOUNDS.maxZ);
      if (intersectsTerrainMound(x, z, 0.45)) continue;
      terrainSafeFallback ??= [x, 0.02, z];
      if (occupied.some(([otherX, , otherZ]) => (
        Math.hypot(x - otherX, z - otherZ) < MIN_SPAWN_SPACING
      ))) continue;
      return [x, 0.02, z] as [number, number, number];
    }
  }

  return terrainSafeFallback ?? [
    THREE.MathUtils.clamp(anchorX, SPAWN_BOUNDS.minX, SPAWN_BOUNDS.maxX),
    0.02,
    THREE.MathUtils.clamp(anchorZ, SPAWN_BOUNDS.minZ, SPAWN_BOUNDS.maxZ),
  ] as [number, number, number];
}

/**
 * Produces a stable six-to-twelve-soldier formation. Stable placement matters
 * because combat/HUD state changes must not cause enemies to jump around the
 * battlefield. The last four contacts are a deliberately slower reserve line:
 * they deepen the scene without multiplying the original encounter's fire rate.
 */
export function createVietCongCombatants(seed = 1968, requestedCount = 12): EnemyCombatant[] {
  const count = THREE.MathUtils.clamp(Math.round(requestedCount), MIN_ENEMY_COUNT, MAX_ENEMY_COUNT);
  const occupied: [number, number, number][] = [];

  return Array.from({ length: count }, (_, index) => {
    const [anchorX, anchorZ] = DEFAULT_SPAWN_ANCHORS[index];
    const position = resolveSpawnPoint(seed, index, anchorX, anchorZ, occupied);
    occupied.push(position);
    const reserveLine = index >= 8;
    return {
      id: `vc-${seed}-${index}`,
      position,
      health: ENEMY_MAX_HEALTH,
      maxHealth: ENEMY_MAX_HEALTH,
      alive: true,
      stance: index % 3 === 1 ? 'standing' : 'kneeling',
      headwear: index % 4 === 0 ? 'pith' : 'boonie',
      uniformVariant: index % 3,
      fireInterval: reserveLine
        ? 4.4 + seeded(seed, index, 4) * 2.3
        : 3.1 + seeded(seed, index, 4) * 2.15,
      initialFireDelay: reserveLine
        ? 6.2 + (index - 8) * 1.15 + seeded(seed, index, 5) * 1.8
        : 1.8 + index * 0.38 + seeded(seed, index, 5) * 1.15,
      accuracy: reserveLine
        ? 0.09 + seeded(seed, index, 6) * 0.06
        : 0.04 + seeded(seed, index, 6) * 0.055,
    };
  });
}

function segmentSphereIntersectionXYZ(
  start: THREE.Vector3,
  end: THREE.Vector3,
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const ox = start.x - centerX;
  const oy = start.y - centerY;
  const oz = start.z - centerZ;
  const radiusSquared = radius * radius;
  const startDistanceSquared = ox * ox + oy * oy + oz * oz;

  if (startDistanceSquared <= radiusSquared) return 0;

  const a = dx * dx + dy * dy + dz * dz;
  if (a <= Number.EPSILON) return null;

  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = startDistanceSquared - radiusSquared;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  if (near >= 0 && near <= 1) return near;
  const far = (-b + root) / (2 * a);
  return far >= 0 && far <= 1 ? far : null;
}

/** Returns a swept segment/sphere hit parameter, or null when there is no hit. */
export function segmentSphereIntersection(
  start: THREE.Vector3,
  end: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
) {
  return segmentSphereIntersectionXYZ(start, end, center.x, center.y, center.z, radius);
}

/**
 * Tests the low frontal lip of a Viet Cong fighting position. This mirrors the
 * visual horseshoe berm without treating foliage as an impenetrable wall: only
 * shots below roughly chest height are stopped, while upper-body hits and fire
 * from a flanking/rear angle remain clear.
 */
export function findVietCongLowCoverHit(
  start: THREE.Vector3,
  end: THREE.Vector3,
  enemy: EnemyCombatant,
) {
  const approachX = -enemy.position[0];
  const approachZ = -12 - enemy.position[2];
  const approachLength = Math.hypot(approachX, approachZ) || 1;
  const forwardX = approachX / approachLength;
  const forwardZ = approachZ / approachLength;
  const sideX = -forwardZ;
  const sideZ = forwardX;
  let nearestT: number | null = null;

  for (const [sideOffset, forwardOffset, radius] of VC_LOW_COVER_LIPS) {
    const hitT = segmentSphereIntersectionXYZ(
      start,
      end,
      enemy.position[0] + forwardX * forwardOffset + sideX * sideOffset,
      enemy.position[1] + 0.19,
      enemy.position[2] + forwardZ * forwardOffset + sideZ * sideOffset,
      radius,
    );
    if (hitT !== null && (nearestT === null || hitT < nearestT)) nearestT = hitT;
  }
  return nearestT;
}

/**
 * Player-projectile helper. It selects the first living infantry target crossed
 * during the frame, avoiding tunnelling by fast cannon and machine-gun rounds.
 */
export function findNearestLivingEnemyHit(
  start: THREE.Vector3,
  end: THREE.Vector3,
  enemies: readonly EnemyCombatant[],
  radius = ENEMY_HIT_RADIUS,
): EnemyHitResult | null {
  let nearestEnemy: EnemyCombatant | null = null;
  let nearestT = Infinity;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const lowCoverHitT = findVietCongLowCoverHit(start, end, enemy);

    // Three overlapping volumes form an inexpensive vertical capsule. The upper
    // volume deliberately follows the weapon line rather than only the rendered
    // torso: the tank's pintle gun is fixed high and has no pitch articulation.
    // A single torso sphere let every horizontal M37 tracer sail over kneeling men.
    const profile = enemy.stance === 'kneeling'
      ? [[0.2, 1], [0.53, 1.04], [0.92, 0.94]] as const
      : [[0.25, 1], [0.68, 1.02], [1.05, 0.9]] as const;

    for (const [height, radiusScale] of profile) {
      const hitT = segmentSphereIntersectionXYZ(
        start,
        end,
        enemy.position[0],
        enemy.position[1] + height,
        enemy.position[2],
        radius * radiusScale,
      );
      if (hitT !== null
        && (lowCoverHitT === null || hitT < lowCoverHitT)
        && hitT < nearestT) {
        nearestT = hitT;
        nearestEnemy = enemy;
      }
    }
  }

  if (!nearestEnemy) return null;
  return {
    enemy: nearestEnemy,
    t: nearestT,
    point: start.clone().lerp(end, nearestT),
  };
}

/**
 * Swept hostile-round test against the five friendly infantry profiles. Their
 * authored bounds are intentionally a little forgiving because the rendered
 * soldiers make short, sub-meter bounds inside their fighting positions.
 */
export function findNearestLivingFriendlyHit(
  start: THREE.Vector3,
  end: THREE.Vector3,
  friendlies: readonly FriendlyCombatant[],
  poses?: ReadonlyMap<string, FriendlyCombatPose>,
  radius = FRIENDLY_HIT_RADIUS,
) {
  let nearestFriendly: FriendlyCombatant | null = null;
  let nearestT = Infinity;

  for (const friendly of friendlies) {
    if (!friendly.alive) continue;
    const livePosition = poses?.get(friendly.id)?.position;
    const centerX = livePosition?.x ?? friendly.position[0];
    const centerY = livePosition?.y ?? friendly.position[1];
    const centerZ = livePosition?.z ?? friendly.position[2];
    const profile = friendly.kneeling
      ? [[0.2, 1], [0.52, 1.04], [0.86, 0.92]] as const
      : [[0.24, 1], [0.66, 1.02], [1, 0.9]] as const;

    for (const [height, radiusScale] of profile) {
      const hitT = segmentSphereIntersectionXYZ(
        start,
        end,
        centerX,
        centerY + height,
        centerZ,
        radius * radiusScale,
      );
      if (hitT !== null && hitT < nearestT) {
        nearestT = hitT;
        nearestFriendly = friendly;
      }
    }
  }

  if (!nearestFriendly) return null;
  return {
    friendly: nearestFriendly,
    t: nearestT,
    point: start.clone().lerp(end, nearestT),
  };
}

const FRIENDLY_COVER_POSITIONS = [
  { position: [-4.9, 0.02, -4.7] as const, rotation: -0.08, width: 3.15 },
  { position: [4.95, 0.02, -3.28] as const, rotation: 0.08, width: 3.15 },
  { position: [0.25, 0.02, 2.48] as const, rotation: 0, width: 1.85 },
] as const;

const FRIENDLY_SANDBAG_SPHERES = FRIENDLY_COVER_POSITIONS.flatMap(cover => {
  const count = Math.max(3, Math.round(cover.width / 0.5));
  const cos = Math.cos(cover.rotation);
  const sin = Math.sin(cover.rotation);
  const row = (upper: boolean) => Array.from(
    { length: upper ? count - 1 : count },
    (_, index) => {
      const spacing = cover.width / count;
      const localX = -cover.width * 0.5
        + (index + 0.5) * spacing
        + (upper ? spacing * 0.5 : 0);
      return {
        x: cover.position[0] + cos * localX,
        y: cover.position[1] + (upper ? 0.32 : 0.14),
        z: cover.position[2] - sin * localX,
        radius: upper ? 0.225 : 0.235,
      };
    },
  );
  return [...row(false), ...row(true)];
});

/** Approximate the visible US sandbag rows so incoming fire lands on cover. */
export function findNearestFriendlyCoverHit(start: THREE.Vector3, end: THREE.Vector3) {
  let nearestT: number | null = null;
  for (const sphere of FRIENDLY_SANDBAG_SPHERES) {
    const hitT = segmentSphereIntersectionXYZ(
      start,
      end,
      sphere.x,
      sphere.y,
      sphere.z,
      sphere.radius,
    );
    if (hitT !== null && (nearestT === null || hitT < nearestT)) nearestT = hitT;
  }
  return nearestT;
}

export function findNearestObstacleHit(
  start: THREE.Vector3,
  end: THREE.Vector3,
  obstacles: readonly CombatObstacle[],
) {
  let nearestT: number | null = null;
  for (const obstacle of obstacles) {
    const hitT = segmentSphereIntersectionXYZ(
      start,
      end,
      obstacle.position[0],
      obstacle.position[1],
      obstacle.position[2],
      obstacle.radius,
    );
    if (hitT !== null && (nearestT === null || hitT < nearestT)) nearestT = hitT;
  }
  return nearestT;
}

/** Coarse terrain occlusion shared by hostile AI and its short per-frame traces. */
export function terrainBlocksCombatSegment(start: THREE.Vector3, end: THREE.Vector3) {
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  const samples = Math.max(1, Math.ceil(distance / 1.25));
  for (let index = 1; index <= samples; index += 1) {
    const alpha = index / samples;
    const x = THREE.MathUtils.lerp(start.x, end.x, alpha);
    const z = THREE.MathUtils.lerp(start.z, end.z, alpha);
    if (intersectsTerrainMound(x, z, 0.08)) return true;
  }
  return false;
}
