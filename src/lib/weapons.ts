export type WeaponMode = 'cannon' | 'machinegun' | 'flamethrower' | 'napalm';

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
export const MACHINE_GUN_FIRE_INTERVAL = 0.1;
export const NAPALM_STRIKE_LENGTH = 20;
export const NAPALM_STRIKE_WIDTH = 5.5;
export const NAPALM_COOLDOWN_SECONDS = 10;

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
