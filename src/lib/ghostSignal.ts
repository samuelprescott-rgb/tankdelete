/** Two authored art slices; neither file simulation nor the campaign unlock depends on them. */
export type GhostPreview = 'river' | 'embassy';
// The explicit river art preview looks down the bend from a dry turnout.
// Start Campaign and ordinary Boot Camp deploy on the central bridge road.
export const GHOST_RIVER_START: [number, number, number] = [-15, 0, 2.5];
export const GHOST_RIVER_YAW = 4.24;
export function startsOnRiverBank(mode: string, preview?: GhostPreview) {
  return mode==='training' && preview==='river';
}
// Only the art-practice URL faces the archive doors on entry; the regular
// horde guard still watches its gameplay ingress from the existing turnout.
export const GHOST_EMBASSY_START: [number, number, number] = [3, 0, -8.5];
export const GHOST_EMBASSY_YAW = .20;
export const GHOST_PRACTICE_ARCHIVES = ['dispatch.txt', 'field-map.png', 'radio.log'];

// One file hut lives in the downstream bank hamlet. Keep its impact surface
// in practice as well as campaign, without enabling all distant file batches.
// On the outer shoulder of the next grid strip. The nearer verge is dry for
// the campaign's small file, but clips the larger rotated porches on wet seeds.
// Keep the parcel/slot and courtyard axis stable; only this house moves.
export const DOWNSTREAM_HUT_PLOT = { x: 35.25, z: 28.75 } as const;
export const atDownstreamHut = (x: number, z: number) =>
  Math.abs(x - DOWNSTREAM_HUT_PLOT.x) < .18 && Math.abs(z - DOWNSTREAM_HUT_PLOT.z) < .18;

export function ghostPreviewFromSearch(search: string): GhostPreview | undefined {
  const entry = new URLSearchParams(search).get('ghostSignal');
  return entry === 'river' || entry === 'embassy' ? entry : undefined;
}

export function inGhostRiverHutPlot(x: number, z: number) {
  return (Math.abs(x) <= 14 && z >= 4 && z <= 27) || atDownstreamHut(x, z);
}

/** Feather the camera shoulder only. Never change screen resolution or palette at a map boundary. */
export function ghostSliceWeight(x: number, z: number, embassy: boolean) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const gap = embassy
    ? Math.max(Math.abs(x) - 22, -34 - z, z - 12)
    : Math.max(Math.abs(x) - 14, 3 - z, z - 27);
  const t = Math.max(0, Math.min(1, 1 - Math.max(0, gap) / 6));
  return t * t * (3 - 2 * t);
}

// Detail comes from the models, glyph materials and wet surfaces, not reducing
// the picture to giant cells. One restrained ink mix per mode, including the bridge.
export const ghostInkStrength=(embassy:boolean)=>embassy ? .42 : .28;
