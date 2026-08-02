import * as THREE from 'three';
import { intersectsTerrainMound } from './terrain';

export type EnemyStance = 'standing' | 'kneeling';
export type EnemyHeadwear = 'boonie' | 'pith';
export type EnemyDamageSource = 'cannon' | 'machinegun' | 'flamethrower' | 'napalm';

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
export const ENEMY_RIFLE_DAMAGE = 3;
export const ENEMY_RIFLE_SPEED = 18;
export const ENEMY_RIFLE_LIFETIME = 3.2;

const DEFAULT_SPAWN_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [-11, 5],
  [11, 5],
  [-17, 13],
  [17, 13],
  [-11, 22],
  [11, 22],
  [-23, 29],
  [23, 29],
];

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

function resolveSpawnPoint(seed: number, index: number, anchorX: number, anchorZ: number) {
  let x = anchorX + (seeded(seed, index, 1) - 0.5) * 1.8;
  let z = anchorZ + (seeded(seed, index, 2) - 0.5) * 1.8;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (!intersectsTerrainMound(x, z, 0.45)) return [x, 0.02, z] as [number, number, number];
    const angle = seeded(seed, index, 20 + attempt) * Math.PI * 2;
    const distance = 1.4 + attempt * 0.48;
    x = anchorX + Math.cos(angle) * distance;
    z = anchorZ + Math.sin(angle) * distance;
  }

  return [anchorX, 0.02, anchorZ] as [number, number, number];
}

/**
 * Produces a stable six-to-eight-soldier patrol. Stable placement matters because
 * combat/HUD state changes must not cause enemies to jump around the battlefield.
 */
export function createVietCongCombatants(seed = 1968, requestedCount = 8): EnemyCombatant[] {
  const count = THREE.MathUtils.clamp(Math.round(requestedCount), 6, 8);

  return Array.from({ length: count }, (_, index) => {
    const [anchorX, anchorZ] = DEFAULT_SPAWN_ANCHORS[index];
    return {
      id: `vc-${seed}-${index}`,
      position: resolveSpawnPoint(seed, index, anchorX, anchorZ),
      health: ENEMY_MAX_HEALTH,
      maxHealth: ENEMY_MAX_HEALTH,
      alive: true,
      stance: index % 3 === 1 ? 'standing' : 'kneeling',
      headwear: index % 4 === 0 ? 'pith' : 'boonie',
      uniformVariant: index % 3,
      fireInterval: 2.15 + seeded(seed, index, 4) * 1.55,
      initialFireDelay: 1.6 + index * 0.34 + seeded(seed, index, 5),
      accuracy: 0.035 + seeded(seed, index, 6) * 0.045,
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
      if (hitT !== null && hitT < nearestT) {
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
