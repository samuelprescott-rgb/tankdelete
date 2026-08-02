import { coordinateNoise } from './environmentGeneration';

export interface RiverStation {
  centerX: number;
  mudHalfWidth: number;
  waterHalfWidth: number;
  z: number;
}

// One deterministic layout drives rendering, scenery rejection, tank handling,
// and water effects. Keeping the route math here prevents those systems from
// slowly drifting out of alignment as the environment evolves.
export const RIVER_STATION_COUNT = 29;
export const RIVER_MIN_Z = -38;
export const RIVER_MAX_Z = 44;
export const RIVER_CROSSING_Z = -8;

export function createRiverStations(seed: number): RiverStation[] {
  return Array.from({ length: RIVER_STATION_COUNT }, (_, index) => {
    const progress = index / (RIVER_STATION_COUNT - 1);
    const z = RIVER_MIN_Z + (RIVER_MAX_Z - RIVER_MIN_Z) * progress;
    const broadBend = Math.sin(progress * Math.PI * 2.05 + 0.48) * 0.46;
    const secondaryBend = Math.sin(progress * Math.PI * 4.8 - 0.72) * 0.18;
    const seededBend = (coordinateNoise(index, 0, seed, 810) - 0.5) * 0.28;
    const moundAvoidance = -3.45 * Math.exp(-Math.pow((z - 10.8) / 8.4, 2));
    const waterHalfWidth = 1.16
      + coordinateNoise(index, 0, seed, 811) * 0.32
      + Math.sin(progress * Math.PI * 3.2) * 0.1;

    return {
      centerX: -33.55 + broadBend + secondaryBend + seededBend + moundAvoidance,
      mudHalfWidth: waterHalfWidth + 0.62 + coordinateNoise(index, 0, seed, 812) * 0.2,
      waterHalfWidth,
      z,
    };
  });
}

function scaledStationIndexAtZ(stations: RiverStation[], z: number) {
  if (stations.length < 2 || z < RIVER_MIN_Z || z > RIVER_MAX_Z) return -1;
  const progress = Math.max(0, Math.min(1, (z - RIVER_MIN_Z) / (RIVER_MAX_Z - RIVER_MIN_Z)));
  return progress * (stations.length - 1);
}

function lerp(start: number, end: number, mix: number) {
  return start + (end - start) * mix;
}

/** Exact horizontal corridor test for the piecewise-linear river banks. */
export function isInsideRiverCorridor(
  x: number,
  z: number,
  stations: RiverStation[],
  padding = 0,
) {
  if (z < RIVER_MIN_Z - padding || z > RIVER_MAX_Z + padding) return false;
  const clampedZ = Math.max(RIVER_MIN_Z, Math.min(RIVER_MAX_Z, z));
  const scaledIndex = scaledStationIndexAtZ(stations, clampedZ);
  if (scaledIndex < 0) return false;
  const lowerIndex = Math.min(stations.length - 2, Math.floor(scaledIndex));
  const lower = stations[lowerIndex];
  const upper = stations[lowerIndex + 1];
  const mix = scaledIndex - lowerIndex;
  const centerX = lerp(lower.centerX, upper.centerX, mix);
  const halfWidth = lerp(lower.mudHalfWidth, upper.mudHalfWidth, mix);
  return Math.abs(x - centerX) <= halfWidth + padding;
}

/**
 * Returns a soft 0..1 immersion value inside the visible water. The feathered
 * edge makes wake intensity and future handling changes enter without a pop.
 */
export function riverWaterImmersion(
  x: number,
  z: number,
  stations: RiverStation[],
  edgeFeather = 0.32,
) {
  const scaledIndex = scaledStationIndexAtZ(stations, z);
  if (scaledIndex < 0) return 0;
  const lowerIndex = Math.min(stations.length - 2, Math.floor(scaledIndex));
  const lower = stations[lowerIndex];
  const upper = stations[lowerIndex + 1];
  const mix = scaledIndex - lowerIndex;
  const centerX = lerp(lower.centerX, upper.centerX, mix);
  const halfWidth = lerp(lower.waterHalfWidth, upper.waterHalfWidth, mix);
  const distanceFromEdge = halfWidth - Math.abs(x - centerX);
  if (distanceFromEdge <= 0) return 0;
  if (distanceFromEdge >= edgeFeather) return 1;
  const linear = distanceFromEdge / edgeFeather;
  return linear * linear * (3 - 2 * linear);
}

/** Distance from a point to the water edge, or Infinity beyond its endpoints. */
export function distanceToRiverWater(x: number, z: number, stations: RiverStation[]) {
  const scaledIndex = scaledStationIndexAtZ(stations, z);
  if (scaledIndex < 0) return Number.POSITIVE_INFINITY;
  const lowerIndex = Math.min(stations.length - 2, Math.floor(scaledIndex));
  const lower = stations[lowerIndex];
  const upper = stations[lowerIndex + 1];
  const mix = scaledIndex - lowerIndex;
  const centerX = lerp(lower.centerX, upper.centerX, mix);
  const halfWidth = lerp(lower.waterHalfWidth, upper.waterHalfWidth, mix);
  return Math.max(0, Math.abs(x - centerX) - halfWidth);
}
