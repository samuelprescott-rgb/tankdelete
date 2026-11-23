import * as THREE from 'three';
import { ARENA_BOUNDS, isInsideArena } from './arenaBounds';
import { intersectsTerrainMound } from './terrain';

export type ZombieEpiloguePhase =
  | 'locked'
  | 'warning'
  | 'combat'
  | 'intermission'
  | 'victory'
  | 'defeat';

export type ZombieWaveNumber = 1 | 2 | 3 | 4;
export type ZombieArchetype = 'standard' | 'boss';

interface PaddyApproach {
  readonly entry: readonly [number, number];
  readonly turn: readonly [number, number];
  readonly delay: number;
  readonly pace: number;
}

// Two ordinary pursuers clear the near paddy bank before turning on the
// rifle line. One breaks cover a stride after the other. Both are vulnerable
// from their first step; the Dispatch raider keeps its own eastern route.
const OPENING_PADDY_PAIR: Readonly<Partial<Record<number,PaddyApproach>>> = {
  1: { entry: [-5.4, 8], turn: [-8.59, -4.65], delay: .8, pace: 3.85 },
  2: { entry: [-2, 8.1], turn: [-6.21, -5.5], delay: 1.8, pace: 3.55 },
};

// The command contact does not materialise at an archive. It emerges in
// front of the defenses, circles the east bank, then crosses the broken
// side gate with the chancery behind it. Both ordinary starting cameras
// see the last two legs without turning the tank or steering its camera.
export const COMMAND_ENTRY = [23.5, 9.0] as const;
// The advanced Dispatch shell occupies the old straight eastern crossing.
// Round its broken rear return; the entry and final two contact marks stay put.
export const COMMAND_INGRESS = [[23.1,-10.8],[18.1,-16.65],[16.72,-21.42],[14.63,-22.45],
  [9.21,-22.43],[7.46,-21.52],[6.4,-17.8],[.75,-17.9]] as const;

export type ZombieDamageSource =
  | 'cannon'
  | 'machinegun'
  | 'flamethrower'
  | 'napalm'
  | 'eagle'
  | 'friendly-rifle';

export interface ZombieCombatant {
  id: string;
  wave: ZombieWaveNumber;
  /** Immutable entry point. Live world positions are stored in ZombieCombatPose. */
  position: [number, number, number];
  /** Seconds after a wave begins before this combatant emerges. */
  spawnDelay: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  speed: number;
  attackInterval: number;
  variant: 0 | 1 | 2;
  archetype: ZombieArchetype;
  visualScale: number;
  collisionRadius: number;
  breachRange: number;
  /** Incremented by allied hits; the renderer converts it into a short stagger. */
  suppressionRevision: number;
  /** An aimed player hit can draw the command contact off a threatened ally. */
  playerChallenge: number;
  /** One blue-grey sprinter threatens Dispatch instead of chasing the rifle line. */
  archiveRunner?: boolean;
  openingPaddyApproach?: PaddyApproach;
  commandIngress?: boolean;
}

export interface ZombieCombatPose {
  /** Mutated by ZombieHorde without causing React renders. */
  position: THREE.Vector3;
  /** False while spawning and immediately after death. */
  active: boolean;
  archetype: ZombieArchetype;
  /** Last confirmed rifle impact, in monotonic seconds and world-space direction. */
  rifleImpact?: { at: number; direction: THREE.Vector3 };
  /** What this live actor is actually pursuing, not a prediction from its spawn slot. */
  pursuingSoldier?: string | null;
  soldierSwing?: 'ready' | 'windup' | 'strike';
}

export interface ZombieDamageResult {
  zombie: ZombieCombatant;
  previousHealth: number;
  killed: boolean;
  source: ZombieDamageSource;
  /** Snapshot of the live pose for impact effects and UI feedback. */
  position: THREE.Vector3;
}

export interface ZombieHitResult {
  zombie: ZombieCombatant;
  point: THREE.Vector3;
  /** Parametric distance along a tested segment. */
  t: number;
}

export interface ZombieTankBreachEvent {
  zombieId: string;
  position: THREE.Vector3;
  damage: number;
}

export interface FriendlyZombieHitEvent {
  bulletDirection?: THREE.Vector3;
  soldierId: string;
  zombieId: string;
  position: THREE.Vector3;
  damage: number;
}

export interface ZombieFriendlyBreachEvent {
  zombieId: string;
  friendlyId: string;
  position: THREE.Vector3;
  damage: number;
}

export interface ZombieBreachOutcome {
  accepted: boolean;
  breachCount: number;
  maxBreaches: number;
  defeated: boolean;
}

export interface ZombieWaveConfig {
  wave: ZombieWaveNumber;
  count: number;
  health: number;
  minimumSpeed: number;
  maximumSpeed: number;
  attackInterval: number;
  spawnInterval: number;
  archetype: ZombieArchetype;
  visualScale: number;
  collisionRadius: number;
  breachRange: number;
}

export const ZOMBIE_MAX_WAVES = 4;
export const ZOMBIE_MAX_ACTIVE = 22;
export const ZOMBIE_MAX_BREACHES = 3;
export const ZOMBIE_WARNING_MS = 10_000;
export const ZOMBIE_INTERMISSION_MS = 12_000;
export const ZOMBIE_HIT_RADIUS = 0.5;
export const ZOMBIE_BREACH_DAMAGE = 34;
export const ZOMBIE_FRIENDLY_BREACH_DAMAGE = 40;
export const ZOMBIE_BREACH_RANGE = 1.48;
export const ZOMBIE_MAX_BREACHES_PER_SECOND = 1;
export const ZOMBIE_BOSS_VISUAL_SCALE = 5;
export const ZOMBIE_BOSS_SPEED = 7.2;
export const ZOMBIE_BOSS_HEALTH = 4_800;
export const ZOMBIE_BOSS_NAPALM_DAMAGE = 900;

export const ZOMBIE_WAVES: Readonly<Record<ZombieWaveNumber, ZombieWaveConfig>> = Object.freeze({
  1: Object.freeze({
    wave: 1,
    count: 10,
    health: 80,
    minimumSpeed: 1.62,
    maximumSpeed: 1.88,
    attackInterval: 1.18,
    spawnInterval: 0.22,
    archetype: 'standard',
    visualScale: 1,
    collisionRadius: 0.34,
    breachRange: ZOMBIE_BREACH_RANGE,
  }),
  2: Object.freeze({
    wave: 2,
    count: 18,
    health: 95,
    minimumSpeed: 1.82,
    maximumSpeed: 2.12,
    attackInterval: 1.08,
    spawnInterval: 0.19,
    archetype: 'standard',
    visualScale: 1,
    collisionRadius: 0.34,
    breachRange: ZOMBIE_BREACH_RANGE,
  }),
  3: Object.freeze({
    wave: 3,
    count: ZOMBIE_MAX_ACTIVE,
    health: 110,
    minimumSpeed: 2.02,
    maximumSpeed: 2.36,
    attackInterval: 0.98,
    spawnInterval: 0.16,
    archetype: 'standard',
    visualScale: 1,
    collisionRadius: 0.34,
    breachRange: ZOMBIE_BREACH_RANGE,
  }),
  4: Object.freeze({
    wave: 4,
    count: 11, // Command contact + two escort groups, not eleven bosses.
    health: ZOMBIE_BOSS_HEALTH,
    minimumSpeed: ZOMBIE_BOSS_SPEED,
    maximumSpeed: ZOMBIE_BOSS_SPEED,
    attackInterval: 0.9,
    spawnInterval: 0,
    archetype: 'boss',
    visualScale: ZOMBIE_BOSS_VISUAL_SCALE,
    collisionRadius: 1.65,
    breachRange: 4.6,
  }),
});

const ZOMBIE_SPAWN_PADDING = 16;
const ZOMBIE_SPAWN_TERRAIN_RADIUS = 0.42;
/** The embassy is behind the initial defensive line at Z=-13..-30.
 * No horde lane or terrain fallback may put an enemy behind those buildings. */
export const ZOMBIE_SPAWN_MIN_Z = 8;

/**
 * Sixteen perimeter lanes keep the horde finite and readable. Most contacts
 * enter from the front and front flanks of the embassy defensive line.
 */
const PERIMETER_LANES: ReadonlyArray<readonly [number, number]> = [
  [-34, 36], [-25, 38], [-16, 36], [-6, 39],
  [6, 37], [16, 39], [26, 36], [35, 38],
  [38, 30], [36, 21], [39, 12], [32, 16],
  [25, 18], [-24, 18], [-34, 16], [-38, 25],
];

export function hashZombieSession(value: string | number) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value) >>> 0;
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function seededUnit(seed: number, index: number, salt = 0) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function resolveSpawnPosition(seed: number, wave: ZombieWaveNumber, index: number) {
  const laneOffset = Math.floor(seededUnit(seed, wave, 71) * PERIMETER_LANES.length);
  // The extra groups enter just beyond the eastern road bend, against
  // open ground in the guard's field of view, not behind the archive.
  const column = wave === 4 && index > 0 || wave === 3 && index >= 16 || wave === 2 && index >= 14;
  // Wave three's six new arrivals come down the visible east service road.
  // The wave-two landing squad now holds the near bend. Putting the last
  // group directly in their pocket hid its entrance behind the earlier push.
  const roadX=20+(index%5)*2.45;
  const lane = wave===3 && index>=16 ? [roadX,8.1+(roadX-16.5)*.65+(index%2)*1.4]
    : isArchiveRunner(wave,index) ? [18, 19] : column
    ? [11 + (index % 5) * 2.6, 11 + Math.floor(index % 10 / 5) * 3.2 + (index % 2) * 1.8]
    : PERIMETER_LANES[(index * 5 + laneOffset) % PERIMETER_LANES.length];
  const jitterX = (seededUnit(seed, index, wave * 11 + 1) - 0.5) * 3.2;
  const jitterZ = (seededUnit(seed, index, wave * 11 + 2) - 0.5) * 3.2;
  const baseX = THREE.MathUtils.clamp(
    lane[0] + jitterX,
    ARENA_BOUNDS.minX + ZOMBIE_SPAWN_PADDING,
    ARENA_BOUNDS.maxX - ZOMBIE_SPAWN_PADDING,
  );
  const baseZ = THREE.MathUtils.clamp(
    lane[1] + jitterZ,
    Math.max(ZOMBIE_SPAWN_MIN_Z, ARENA_BOUNDS.minZ + ZOMBIE_SPAWN_PADDING),
    ARENA_BOUNDS.maxZ - ZOMBIE_SPAWN_PADDING,
  );

  if (!intersectsTerrainMound(baseX, baseZ, ZOMBIE_SPAWN_TERRAIN_RADIUS)) {
    return [baseX, 0.02, baseZ] as [number, number, number];
  }

  // Deterministic sunflower search prevents a contact from emerging inside a mound.
  const phase = seededUnit(seed, index, wave * 11 + 3) * Math.PI * 2;
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    const radius = 0.65 + Math.sqrt(attempt) * 0.7;
    const angle = phase + attempt * 2.399963229728653;
    const x = THREE.MathUtils.clamp(
      baseX + Math.cos(angle) * radius,
      ARENA_BOUNDS.minX + ZOMBIE_SPAWN_PADDING,
      ARENA_BOUNDS.maxX - ZOMBIE_SPAWN_PADDING,
    );
    const z = THREE.MathUtils.clamp(
      baseZ + Math.sin(angle) * radius,
      Math.max(ZOMBIE_SPAWN_MIN_Z, ARENA_BOUNDS.minZ + ZOMBIE_SPAWN_PADDING),
      ARENA_BOUNDS.maxZ - ZOMBIE_SPAWN_PADDING,
    );
    if (isInsideArena(x, z, ZOMBIE_SPAWN_PADDING)
      && !intersectsTerrainMound(x, z, ZOMBIE_SPAWN_TERRAIN_RADIUS)) {
      return [x, 0.02, z] as [number, number, number];
    }
  }

  return [baseX, 0.02, baseZ] as [number, number, number];
}

function isArchiveRunner(wave: ZombieWaveNumber, slot: number) {
  return wave !== 4 && slot === 6;
}

// A second entry group after the player has seen the vanguard; the third
// wave has two shorter followups. Keep the named early warning runner in
// the vanguard. Each cohort uses the same bounded, instanced actor batches.
export function reinforcementBeat(wave: ZombieWaveNumber, slot: number) {
  if (wave === 2) return slot >= 7 ? 3.6 : 0;
  if (wave === 3) return slot >= 12 ? 4.0 : slot >= 7 ? 2.25 : 0;
  if (wave === 4 && slot > 0) return (slot <= 5 ? 1.35 : 8.5) + ((slot - 1) % 5) * .23;
  return 0;
}

/** Creates one stable, bounded wave. Only the current wave needs to stay resident. */
export function createZombieWave(
  seed: number,
  wave: ZombieWaveNumber,
): ZombieCombatant[] {
  const waveConfig = ZOMBIE_WAVES[wave];
  const count = Math.min(waveConfig.count, ZOMBIE_MAX_ACTIVE);
  return Array.from({ length: count }, (_, index) => {
    const config = wave === 4 && index > 0 ? ZOMBIE_WAVES[2] : waveConfig;
    const speedMix = seededUnit(seed, index, wave * 17 + 1);
    const runner = isArchiveRunner(wave, index);
    const opening = wave === 1 ? OPENING_PADDY_PAIR[index] : undefined;
    const health = runner ? 140 : opening ? 125 : config.health; // All three remain one clean player cannon hit.
    const variant = config.archetype === 'boss' || runner
      ? 2
      : Math.floor(seededUnit(seed, index, wave * 17 + 2) * 3) as 0 | 1 | 2;
    return {
      id: `undead-${seed.toString(36)}-${wave}-${index}`,
      wave,
      position: config.archetype === 'boss' ? [COMMAND_ENTRY[0], .02, COMMAND_ENTRY[1]]
        : opening ? [opening.entry[0], .02, opening.entry[1]] : resolveSpawnPosition(seed, wave, index),
      openingPaddyApproach: opening,
      commandIngress: config.archetype === 'boss',
      // The lead contact appears on the same frame the T+10 wave timer fires;
      // later contacts retain a small deterministic stagger for readability.
      spawnDelay: opening ? opening.delay : index === 0
        ? 0
        : index * waveConfig.spawnInterval + reinforcementBeat(wave, index)
          + seededUnit(seed, index, wave * 17 + 3) * 0.08,
      health,
      maxHealth: health,
      alive: true,
      archiveRunner: runner,
      speed: runner ? 4.1 + wave * .14 : THREE.MathUtils.lerp(config.minimumSpeed, config.maximumSpeed, speedMix),
      attackInterval: config.attackInterval
        * (0.92 + seededUnit(seed, index, wave * 17 + 4) * 0.16),
      variant,
      archetype: config.archetype,
      visualScale: config.visualScale,
      collisionRadius: config.collisionRadius,
      breachRange: config.breachRange,
      suppressionRevision: 0,
      playerChallenge: 0,
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
  const offsetX = start.x - centerX;
  const offsetY = start.y - centerY;
  const offsetZ = start.z - centerZ;
  const radiusSquared = radius * radius;
  if (offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ <= radiusSquared) return 0;

  const a = dx * dx + dy * dy + dz * dz;
  if (a <= Number.EPSILON) return null;
  const b = 2 * (offsetX * dx + offsetY * dy + offsetZ * dz);
  const c = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ - radiusSquared;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  if (near >= 0 && near <= 1) return near;
  const far = (-b + root) / (2 * a);
  return far >= 0 && far <= 1 ? far : null;
}

/** Swept player-projectile collision against a moving, upright zombie profile. */
export function findNearestLivingZombieHit(
  start: THREE.Vector3,
  end: THREE.Vector3,
  zombies: readonly ZombieCombatant[],
  poses: ReadonlyMap<string, ZombieCombatPose>,
  radius = ZOMBIE_HIT_RADIUS,
): ZombieHitResult | null {
  let nearestZombie: ZombieCombatant | null = null;
  let nearestT = Infinity;

  for (const zombie of zombies) {
    if (!zombie.alive) continue;
    const pose = poses.get(zombie.id);
    if (!pose?.active) continue;

    const hitScale = zombie.archetype === 'boss' ? zombie.visualScale * 0.78 : 1;
    const profile = zombie.archetype === 'boss'
      ? [[0.28, 0.96], [0.68, 1.04], [1.05, 0.84], [1.3, 0.65]] as const
      : [[0.28, 0.96], [0.68, 1.04], [1.05, 0.84]] as const;
    for (const [height, radiusScale] of profile) {
      const center = pose.position;
      const hitT = segmentSphereIntersectionXYZ(
        start,
        end,
        center.x,
        center.y + height * zombie.visualScale,
        center.z,
        radius * radiusScale * hitScale,
      );
      if (hitT !== null && hitT < nearestT) {
        nearestZombie = zombie;
        nearestT = hitT;
      }
    }
  }

  if (!nearestZombie) return null;
  return {
    zombie: nearestZombie,
    t: nearestT,
    point: start.clone().lerp(end, nearestT),
  };
}

/**
 * Selects live contacts inside an oriented support rectangle. This is shared by
 * delayed napalm impacts and the eagle strafe so moving targets are sampled at
 * impact rather than locked when support is requested.
 */
export function findLivingZombiesInRectangle(
  zombies: readonly ZombieCombatant[],
  poses: ReadonlyMap<string, ZombieCombatPose>,
  centerX: number,
  centerZ: number,
  directionX: number,
  directionZ: number,
  length: number,
  width: number,
) {
  const directionLength = Math.hypot(directionX, directionZ) || 1;
  const runX = directionX / directionLength;
  const runZ = directionZ / directionLength;
  const halfLength = Math.max(0, length) * 0.5;
  const halfWidth = Math.max(0, width) * 0.5;
  const matches: ZombieCombatant[] = [];

  for (const zombie of zombies) {
    if (!zombie.alive) continue;
    const pose = poses.get(zombie.id);
    if (!pose?.active) continue;
    const offsetX = pose.position.x - centerX;
    const offsetZ = pose.position.z - centerZ;
    const alongRun = offsetX * runX + offsetZ * runZ;
    const acrossRun = -offsetX * runZ + offsetZ * runX;
    if (Math.abs(alongRun) <= halfLength && Math.abs(acrossRun) <= halfWidth) {
      matches.push(zombie);
    }
  }

  return matches;
}
