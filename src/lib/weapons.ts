export type WeaponMode = 'cannon' | 'machinegun' | 'flamethrower' | 'napalm';

export interface CannonReloadState {
  /** Normalized 0-1 progress through the current reload cycle. */
  progress: number;
  remainingSeconds: number;
  ready: boolean;
}

export interface MachineGunHeatState {
  /** Normalized 0-1 heat. During recovery this falls back toward zero. */
  heat: number;
  firing: boolean;
  overheated: boolean;
  burstRemainingSeconds: number;
  recoveryRemainingSeconds: number;
}

export interface NapalmStrike {
  id: number;
  position: [number, number, number];
  rotation: number;
}

export const WEAPON_LABELS: Record<WeaponMode, string> = {
  cannon: 'M41 Cannon',
  machinegun: 'M37 Machine Gun',
  flamethrower: 'Flame Unit',
  napalm: 'Napalm Strike',
};

export const FLAMETHROWER_RANGE = 11;
export const FLAMETHROWER_CONE_DOT = Math.cos(Math.PI / 7);
export const FLAMETHROWER_CAPACITY_SECONDS = 4;
export const FLAMETHROWER_RECHARGE_SECONDS = 5;
export const FLAMETHROWER_HIT_INTERVAL = 0.12;
/** The M41 accepts a new trigger press only after this full reload window. */
export const CANNON_RELOAD_SECONDS = 1;
export const MACHINE_GUN_FIRE_INTERVAL = 0.1;
/**
 * Verified duration of public/audio/sfx/machine_gun_burst_01.wav.
 * The projectile burst uses the same clock so it cannot outlive the recording.
 */
export const MACHINE_GUN_BURST_SECONDS = 7.665;
/** Full recovery after a maximum-length M37 burst. */
export const MACHINE_GUN_OVERHEAT_RECOVERY_SECONDS = 4;
export const NAPALM_STRIKE_LENGTH = 20;
export const NAPALM_STRIKE_WIDTH = 5.5;
export const NAPALM_COOLDOWN_SECONDS = 10;
/** World queries run frequently so fast targets cannot cross the flames between samples. */
export const NAPALM_HAZARD_SAMPLE_SECONDS = 0.2;
/** A target can take one burn tick per strike during this interval. */
export const NAPALM_HAZARD_DAMAGE_INTERVAL_SECONDS = 0.7;
export const NAPALM_HAZARD_DAMAGE_PER_TICK = 32;
export const NAPALM_HAZARD_FRIENDLY_DAMAGE_PER_TICK = 8;

export function isPointInsideNapalmStrike(
  x: number,
  z: number,
  strike: Pick<NapalmStrike, 'position' | 'rotation'>,
  padding = 0,
) {
  const offsetX = x - strike.position[0];
  const offsetZ = z - strike.position[2];
  const runX = Math.cos(strike.rotation);
  const runZ = -Math.sin(strike.rotation);
  const alongRun = offsetX * runX + offsetZ * runZ;
  const acrossRun = -offsetX * runZ + offsetZ * runX;
  return Math.abs(alongRun) <= NAPALM_STRIKE_LENGTH * 0.5 + Math.max(0, padding)
    && Math.abs(acrossRun) <= NAPALM_STRIKE_WIDTH * 0.5 + Math.max(0, padding);
}

// One clock drives the aircraft, ordnance, gameplay impact, and lingering burn.
// The impact point is matched to the first explosive transient in napalm_strike.wav.
export const NAPALM_TIMELINE = {
  jetIngressSeconds: 4.05,
  bombReleaseSeconds: 7.3,
  impactSeconds: 8.45,
  ignitionSweepSeconds: 0.48,
  rollingFireSeconds: 4.75,
  jetExitSeconds: 13.2,
  cleanupSeconds: 17.96,
} as const;
