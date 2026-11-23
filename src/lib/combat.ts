import * as THREE from 'three';
import { intersectsTerrainMound } from './terrain';
import { INFANTRY_HIT_PROFILES } from './infantryMetrics';
import { isVillagePlotArea } from './layout';
import { segmentVillageHut, villageBlocksWalk, type VillageObstacle } from './villageCover';
import { createRiverStations, isInsideRiverCorridor } from '../components/Scene/riverLayout';
import {RIVER_FLANK_ID,type RiverFlankPost} from './riverFlankPost';

export type EnemyStance = 'standing' | 'kneeling';
export type EnemyHeadwear = 'boonie' | 'pith';
export type EnemyDamageSource =
  | 'cannon'
  | 'machinegun'
  | 'flamethrower'
  | 'napalm'
  | 'runover'
  | 'friendly-rifle';

export interface EnemyCombatant {
  id: string;
  /** Tunnel arrivals are mobile, with no authored cover at their entrance. */
  tunnel?: boolean;
  tunnelMouth?: {x:number;z:number};
  crushed?: boolean;
  diedAt?:number;
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
  relief?:import('./fieldRelief').ReliefTicket;
  diedAt?:number;
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

export interface EnemyCombatPose {
  /** Live actor center only; authored cover remains fixed at enemy.position. */
  position: THREE.Vector3;
  yaw: number;
}

export function enemyWorldPosition(out: THREE.Vector3, enemy: EnemyCombatant, poses?: ReadonlyMap<string, EnemyCombatPose>) {
  const live = poses?.get(enemy.id)?.position;
  return live ? out.copy(live) : out.set(...enemy.position);
}

export type CombatObstacle = VillageObstacle;

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
// VC fire is intentionally frequent and visible; lower per-round damage keeps
// the five-man US line alive long enough for a sustained background firefight.
export const ENEMY_RIFLE_INFANTRY_DAMAGE = 18;
export const ENEMY_RIFLE_SPEED = 18;
export const ENEMY_RIFLE_LIFETIME = 3.2;

// The daytime shoulder clears the player's central road. The embassy has a
// separate guard assignment protecting the archive approach: relocating it
// along with the day post would change when the first archive is breached.
function makePost(x:number,z:number,altX:number,altZ:number){
  const point=(dx:number,dz:number):[number,number,number]=>[x+dx,.02,z+dz];
  return {cover:point(0,0),occupant:point(0,-.66),alternate:point(altX,altZ)};
}
export const US_FORWARD_POST=makePost(3.65,.57,-.41,-.44);
export const getUSForwardPost=(offsetZ:number)=>offsetZ===0?US_FORWARD_POST:makePost(.25,2.48+offsetZ,-.55,-.72);
export const US_INFANTRY_DEPLOYMENT = [
  { id: 'us-rifle-1', position: [-5.65, 0.02, -5.35] as [number, number, number], kneeling: true },
  { id: 'us-rifle-2', position: [-4.12, 0.02, -5.18] as [number, number, number], kneeling: true },
  { id: 'us-rifle-3', position: [4.18, 0.02, -3.96] as [number, number, number], kneeling: true },
  { id: 'us-rto-4', position: [5.72, 0.02, -3.78] as [number, number, number], kneeling: false },
  { id: 'us-rifle-5', position: US_FORWARD_POST.occupant, kneeling: true },
] as const;

export function getUSMemberPost(member:typeof US_INFANTRY_DEPLOYMENT[number],offsetZ=0,flank?:RiverFlankPost){
  if(offsetZ===0&&flank&&member.id===RIVER_FLANK_ID)return {position:flank.position,kneeling:false};
  const position:[number,number,number]=member.id==='us-rifle-5'?[...getUSForwardPost(offsetZ).occupant]:
    [member.position[0],member.position[1],member.position[2]+offsetZ];
  return {position,kneeling:member.kneeling};
}
export function createUSInfantryCombatants(offsetZ=0,flank?:RiverFlankPost): FriendlyCombatant[] {
  return US_INFANTRY_DEPLOYMENT.map(member => ({
    id: member.id,
    ...getUSMemberPost(member,offsetZ,flank),
    health: FRIENDLY_MAX_HEALTH,
    maxHealth: FRIENDLY_MAX_HEALTH,
    alive: true,
  }));
}

const DEFAULT_SPAWN_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [-4, 9.0],
  [4, 9.0],
  [-12, 17],
  [12, 17],
  [-4, 25],
  [4, 25],
  [-20, 29],
  [20, 29],
  [-8, 33],
  [8, 33],
  [-16, 40],
  [16, 40],
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
  river: ReturnType<typeof createRiverStations>,
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
    if (intersectsTerrainMound(x, z, 0.45) || isVillagePlotArea(x, z, 0.45)
      || isInsideRiverCorridor(x, z, river, 0.8)) continue;
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
      if (intersectsTerrainMound(x, z, 0.45) || isVillagePlotArea(x, z, 0.45)
        || isInsideRiverCorridor(x, z, river, 0.8)) continue;
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
 * battlefield. The last four contacts remain a slower reserve line, but every
 * position contributes enough fire to read as an active engagement.
 */
export function createVietCongCombatants(seed = 1968, requestedCount = 12): EnemyCombatant[] {
  const count = THREE.MathUtils.clamp(Math.round(requestedCount), MIN_ENEMY_COUNT, MAX_ENEMY_COUNT);
  const occupied: [number, number, number][] = [];
  const river = createRiverStations(seed);

  return Array.from({ length: count }, (_, index) => {
    const [anchorX, anchorZ] = DEFAULT_SPAWN_ANCHORS[index];
    const position = resolveSpawnPoint(seed, index, anchorX, anchorZ, occupied, river);
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
        ? 3 + seeded(seed, index, 4) * 1.4
        : 2.15 + seeded(seed, index, 4) * 1.15,
      initialFireDelay: reserveLine
        ? 2.7 + (index - 8) * 0.55 + seeded(seed, index, 5) * 0.9
        : 0.8 + index * 0.22 + seeded(seed, index, 5) * 0.65,
      accuracy: reserveLine
        ? 0.09 + seeded(seed, index, 6) * 0.06
        : 0.04 + seeded(seed, index, 6) * 0.055,
    };
  });
}

/** A loaded/changed page can put a larger, rotated or objective hut on a
 * reserved formation anchor. Only displace an affected live actor; deleting a
 * neighbor never pulls him back, resets his health, or re-rolls the encounter. */
export function fitVietCongToVillage(enemies: EnemyCombatant[], obstacles: readonly CombatObstacle[], seed: number) {
  let result = enemies;
  let river: ReturnType<typeof createRiverStations> | undefined;
  // Keep enough room for the subsequent short animated bound from the anchor.
  const pad=.66;
  for (let i=0; i<enemies.length; i++) {
    const enemy=result[i], [ax,y,az]=enemy.position;
    if (!enemy.alive || !villageBlocksWalk(ax,az,ax,az,obstacles,pad)) continue;
    river ??= createRiverStations(seed);
    const phase=seeded(seed,i,37)*Math.PI*2;
    for (let n=1; n<=640; n++) {
      const r=.63*Math.sqrt(n), a=phase+n*2.399963229728653;
      const x=ax+r*Math.cos(a), z=az+r*Math.sin(a);
      if (x<SPAWN_BOUNDS.minX || x>SPAWN_BOUNDS.maxX || z<SPAWN_BOUNDS.minZ || z>SPAWN_BOUNDS.maxZ
        || villageBlocksWalk(x,z,x,z,obstacles,pad) || intersectsTerrainMound(x,z,.45)
        || isInsideRiverCorridor(x,z,river,.8)
        || result.some((other,j)=>j!==i && other.alive && Math.hypot(other.position[0]-x,other.position[2]-z)<MIN_SPAWN_SPACING*.75)) continue;
      if (result===enemies) result=enemies.slice();
      result[i]={...enemy,position:[x,y,z]};
      break;
    }
  }
  return result;
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
  if (enemy.tunnel) return null;
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
  poses?: ReadonlyMap<string, EnemyCombatPose>,
): EnemyHitResult | null {
  let nearestEnemy: EnemyCombatant | null = null;
  let nearestT = Infinity;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const lowCoverHitT = findVietCongLowCoverHit(start, end, enemy);

    // Overlapping volumes form an inexpensive vertical capsule. The upper
    // volume deliberately follows the weapon line rather than only the rendered
    // torso: the tank's pintle gun is fixed high and has no pitch articulation.
    // A single torso sphere let every horizontal M37 tracer sail over kneeling men.
    const profile = INFANTRY_HIT_PROFILES[enemy.stance];
    const live = poses?.get(enemy.id)?.position;

    for (const [height, radiusScale] of profile) {
      const hitT = segmentSphereIntersectionXYZ(
        start,
        end,
        live?.x ?? enemy.position[0],
        (live?.y ?? enemy.position[1]) + height,
        live?.z ?? enemy.position[2],
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
    const profile = INFANTRY_HIT_PROFILES[friendly.kneeling ? 'kneeling' : 'standing'];

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

// The cover mesh, collision and cleared plant verge use the same placement.
export const US_FIGHTING_POSITIONS = [
  { id: 'left', position: [-4.9, 0.02, -4.7], rotation: -0.08, width: 3.15 },
  { id: 'right', position: [4.95, 0.02, -3.28], rotation: 0.08, width: 3.15 },
  { id: 'forward', position: US_FORWARD_POST.cover, rotation: 0, width: 1.85 },
] as const;

export function getUSFightingPositions(offsetZ:number) {
  return offsetZ===0?US_FIGHTING_POSITIONS:US_FIGHTING_POSITIONS.map(cover=>({...cover,
    position:cover.id==='forward'?getUSForwardPost(offsetZ).cover:
      [cover.position[0],cover.position[1],cover.position[2]+offsetZ] as [number,number,number]}));
}

const FRIENDLY_SANDBAG_SPHERES = US_FIGHTING_POSITIONS.flatMap(cover => {
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
    const hitT = obstacle.hut ? segmentVillageHut(obstacle.hut, start, end) : segmentSphereIntersectionXYZ(
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
export function firstTerrainCombatHit(start: THREE.Vector3, end: THREE.Vector3) {
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  const samples = Math.max(1, Math.ceil(distance / 1.25));
  for (let index = 1; index <= samples; index += 1) {
    const alpha = index / samples;
    const x = THREE.MathUtils.lerp(start.x, end.x, alpha);
    const z = THREE.MathUtils.lerp(start.z, end.z, alpha);
    if (intersectsTerrainMound(x, z, 0.08)) return alpha;
  }
  return null;
}

export function terrainBlocksCombatSegment(start: THREE.Vector3, end: THREE.Vector3) {
  return firstTerrainCombatHit(start,end)!==null;
}
