// Metre-scale sockets shared by the rendered troops and swept combat volumes.
// Keeping the shoulder line here prevents another visual-only resize from
// leaving rifles, targeting and hit detection at the old toy-sized height.
export const INFANTRY_STANDING_HEIGHT = 1.74;
// The existing tank and fixed arena use a compact world scale. Author people in
// metres, then apply this same conversion to their body, weapon and target data.
export const INFANTRY_WORLD_SCALE = 0.72;
export const INFANTRY_KNEEL_OFFSET = 0.44;
export const INFANTRY_STANDING_RIFLE_Y = 1.32;
export const INFANTRY_RIFLE_X = 0.154;

export function infantryRifleHeight(kneeling: boolean) {
  return INFANTRY_STANDING_RIFLE_Y - (kneeling ? INFANTRY_KNEEL_OFFSET : 0);
}

type RiflePoint = [number, number, number];
export type InfantryRifleStyle = 'service' | 'wood-rifle' | 'wood-carbine' | 'scout' | 'heavy';
interface RifleArtProfile {
  scaleZ: number;
  padZ: number;
  padY: number;
  muzzle: RiflePoint;
  support: RiflePoint;
  firing: RiflePoint;
}

// Prop-space anchor points, measured on the game meshes. Translations and
// depth scale are applied to the *whole* prop, not independently to its stock
// or effect sockets. Each grip point describes the solid under the hand.
const RIFLE_ART_PROFILES: Record<InfantryRifleStyle, RifleArtProfile> = {
  service: { scaleZ: .86, padZ: .300, padY: -.004,
    muzzle: [0, .012, -.77], support: [0, .001, -.228], firing: [0, -.092, .005] },
  'wood-rifle': { scaleZ: .86, padZ: .250, padY: 0,
    muzzle: [0, .012, -.773], support: [0, -.005, -.256], firing: [0, -.029, -.060] },
  'wood-carbine': { scaleZ: .88, padZ: .236, padY: -.006,
    muzzle: [0, .012, -.773], support: [0, -.004, -.272], firing: [0, -.093, -.035] },
  scout: { scaleZ: .90, padZ: .168, padY: -.015,
    muzzle: [0, 0, -.72], support: [0, 0, -.352], firing: [0, -.094, -.108] },
  heavy: { scaleZ: .87, padZ: .168, padY: -.015,
    muzzle: [0, 0, -.72], support: [0, -.021, -.345], firing: [0, -.094, -.108] },
};

export function fieldRifleStyle(faction: 'us' | 'vc', variant: number): InfantryRifleStyle {
  return faction === 'us' ? 'service' : variant % 3 === 0 ? 'wood-rifle' : 'wood-carbine';
}

function buildRifleBind(style: InfantryRifleStyle, kneeling: boolean) {
  const profile = RIFLE_ART_PROFILES[style];
  const origin: RiflePoint = [INFANTRY_RIFLE_X, infantryRifleHeight(kneeling), -.085 - profile.padZ * profile.scaleZ];
  const point = ([x, y, z]: RiflePoint): RiflePoint => [origin[0] + x, origin[1] + y, origin[2] + z * profile.scaleZ];
  return {
    origin,
    scaleZ: profile.scaleZ,
    pad: point([0, profile.padY, profile.padZ]),
    localMuzzle: profile.muzzle,
    muzzle: point(profile.muzzle),
    support: point(profile.support),
    firing: point(profile.firing),
  };
}

const pair = (style: InfantryRifleStyle) => [buildRifleBind(style, false), buildRifleBind(style, true)] as const;
const rifleBindCache = {
  service: pair('service'), 'wood-rifle': pair('wood-rifle'), 'wood-carbine': pair('wood-carbine'),
  scout: pair('scout'), heavy: pair('heavy'),
};

export function infantryRifleBind(style: InfantryRifleStyle, kneeling: boolean) {
  return rifleBindCache[style][kneeling ? 1 : 0];
}

export function infantryAimHeight(kneeling: boolean) {
  return (1.2 - (kneeling ? INFANTRY_KNEEL_OFFSET : 0)) * INFANTRY_WORLD_SCALE;
}

// Broad overlapping profiles preserve the forgiving pintle-MG hits while
// covering the complete adult silhouette. Cover is still tested separately.
export const INFANTRY_HIT_PROFILES = {
  standing: [[0.3 * INFANTRY_WORLD_SCALE, 0.86], [0.79 * INFANTRY_WORLD_SCALE, 0.94], [1.23 * INFANTRY_WORLD_SCALE, 0.96], [1.58 * INFANTRY_WORLD_SCALE, 0.61]],
  // The last volume intentionally reaches the fixed, unpitched tank MG line;
  // shrinking it strictly to the kneeling head would make that weapon miss.
  kneeling: [[0.23 * INFANTRY_WORLD_SCALE, 0.96], [0.65 * INFANTRY_WORLD_SCALE, 1], [0.94, 0.92]],
} as const;
