import { ROAD_GRID_SPACING } from './constants';

export interface TerrainMound {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotation: number;
}

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 91.719 + salt * 17.173) * 43758.5453;
  return value - Math.floor(value);
}

function distanceToRoad(value: number) {
  const half = ROAD_GRID_SPACING * 0.5;
  return Math.abs(((value + half) % ROAD_GRID_SPACING + ROAD_GRID_SPACING) % ROAD_GRID_SPACING - half);
}

function createTerrainMounds(): TerrainMound[] {
  const placements: TerrainMound[] = [
    { x: -15, y: -0.72, z: -5, sx: 4.8, sy: 1.35, sz: 3.4, rotation: 0.3 },
    { x: 15, y: -0.78, z: 5, sx: 4.2, sy: 1.25, sz: 4.8, rotation: 1.1 },
    { x: -16, y: -0.82, z: 15, sx: 5.4, sy: 1.4, sz: 4.2, rotation: 0.7 },
    { x: 16, y: -0.74, z: -5, sx: 4.5, sy: 1.3, sz: 3.8, rotation: 2.2 },
  ];
  let candidate = 0;

  while (placements.length < 42 && candidate < 1000) {
    const x = (seeded(candidate, 80) - 0.5) * 176;
    const z = (seeded(candidate, 81) - 0.5) * 176;
    candidate += 1;
    if (Math.hypot(x, z) < 24) continue;
    if (distanceToRoad(x) < 2.7 || distanceToRoad(z) < 2.7) continue;
    const sx = 3.5 + seeded(candidate, 82) * 6.5;
    const sy = 0.7 + seeded(candidate, 83) * 2.2;
    placements.push({
      x,
      y: -0.8 + sy * 0.12,
      z,
      sx,
      sy,
      sz: 3.5 + seeded(candidate, 84) * 6.5,
      rotation: seeded(candidate, 85) * Math.PI,
    });
  }

  return placements;
}

export const TERRAIN_MOUNDS = createTerrainMounds();

export function intersectsTerrainMound(x: number, z: number, padding = 0.5) {
  return TERRAIN_MOUNDS.some(mound => {
    const dx = x - mound.x;
    const dz = z - mound.z;
    const cosine = Math.cos(mound.rotation);
    const sine = Math.sin(mound.rotation);
    const localX = cosine * dx + sine * dz;
    const localZ = -sine * dx + cosine * dz;
    const radiusX = mound.sx * 0.88 + padding;
    const radiusZ = mound.sz * 0.88 + padding;
    return (localX * localX) / (radiusX * radiusX)
      + (localZ * localZ) / (radiusZ * radiusZ) < 1;
  });
}
