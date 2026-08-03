import { ROAD_GRID_SPACING } from './constants';

// The combat sector is deliberately tied to the authored road grid. Sixteen
// cells leaves the river, both infantry positions, the Huey, and the rear file
// objective inside the playable space while keeping the battlefield compact.
export const ARENA_GRID_CELLS = 16;
export const ARENA_WIDTH = ROAD_GRID_SPACING * ARENA_GRID_CELLS;
export const ARENA_DEPTH = ARENA_WIDTH;
export const ARENA_HALF_WIDTH = ARENA_WIDTH * 0.5;
export const ARENA_HALF_DEPTH = ARENA_DEPTH * 0.5;

// Scenery overlaps the hard edge so the player meets jungle and earth before
// seeing the end of either the terrain sheet or tactical road material.
export const ARENA_PERIMETER_DEPTH = 4.5;
export const ARENA_TANK_PADDING = 3.2;

export const ARENA_BOUNDS = Object.freeze({
  minX: -ARENA_HALF_WIDTH,
  maxX: ARENA_HALF_WIDTH,
  minZ: -ARENA_HALF_DEPTH,
  maxZ: ARENA_HALF_DEPTH,
});

export function isInsideArena(x: number, z: number, padding = 0) {
  return x >= ARENA_BOUNDS.minX + padding
    && x <= ARENA_BOUNDS.maxX - padding
    && z >= ARENA_BOUNDS.minZ + padding
    && z <= ARENA_BOUNDS.maxZ - padding;
}

export function clampArenaX(x: number, padding = 0) {
  return Math.max(
    ARENA_BOUNDS.minX + padding,
    Math.min(ARENA_BOUNDS.maxX - padding, x),
  );
}

export function clampArenaZ(z: number, padding = 0) {
  return Math.max(
    ARENA_BOUNDS.minZ + padding,
    Math.min(ARENA_BOUNDS.maxZ - padding, z),
  );
}

/** Distance to the nearest sector edge. Negative values are outside. */
export function distanceToArenaEdge(x: number, z: number) {
  return Math.min(
    x - ARENA_BOUNDS.minX,
    ARENA_BOUNDS.maxX - x,
    z - ARENA_BOUNDS.minZ,
    ARENA_BOUNDS.maxZ - z,
  );
}
