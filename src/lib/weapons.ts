export type WeaponMode = 'cannon' | 'flamethrower' | 'napalm';

export interface FlameBurst {
  id: number;
  origin: [number, number, number];
  direction: [number, number, number];
}

export interface NapalmStrike {
  id: number;
  position: [number, number, number];
}

export const WEAPON_LABELS: Record<WeaponMode, string> = {
  cannon: 'M41 Cannon',
  flamethrower: 'Flame Unit',
  napalm: 'Napalm Strike',
};

export const FLAMETHROWER_RANGE = 11;
export const FLAMETHROWER_CONE_DOT = Math.cos(Math.PI / 7);
export const NAPALM_RADIUS = 7;
export const NAPALM_COOLDOWN_SECONDS = 8;
