import { FileEntry } from './types';
import { getFileCategory } from './colors';
import { ROAD_GRID_SPACING } from './constants';
import { ARENA_BOUNDS, isInsideArena } from './arenaBounds';
import { intersectsTerrainMound } from './terrain';
import { DOWNSTREAM_HUT_PLOT, atDownstreamHut } from './ghostSignal';
import { createRiverStations, isInsideRiverCorridor } from '../components/Scene/riverLayout';

export type BlockPosition = {
  x: number;
  y: number;
  z: number;
};

export interface ReservedLayoutZone {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
}

interface LayoutOptions {
  reservedZones?: readonly ReservedLayoutZone[];
  /** Input includes reserved empty plots in their permanent slot order. */
  preserveSlots?: boolean;
}

// File centers remain this far inside the hard edge. The hut geometry can then
// extend beyond its center without touching the jungle wall or skybox seam.
export const LAYOUT_PLAYABLE_PADDING = 6;

function coordinateNoise(value: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

const layoutRiver = createRiverStations(1968);
export const VILLAGE_COLUMN_ORDER = [-1, 0, -2, 1, -3, 2] as const;

// These four permanent addresses would let a rotated roof/porch cover the deck or a
// five-metre landing. Use surveyed dry side plots rather than deleting a slot and
// shuffling every file after it. The same address is safe at the 2.5x maximum scale.
const BRIDGE_SIDE_PLOTS = [
  // The inside bend is the sightline to the bridge. Place its former near
  // porch with the downstream houses instead, behind the water in both modes.
  { cx: 4, cz: 12, slot: 1, ...DOWNSTREAM_HUT_PLOT },
  { cx: -4, cz: 20, slot: 2, x: -28, z: 26 },
  { cx: -4, cz: 28, slot: 1, x: -33.25, z: 30 },
  { cx: 4, cz: 28, slot: 0, x: 27.75, z: 22 },
] as const;

/** Shared fixed parcel plan: three houses around an open working yard. The
 * empty corner alternates, leaving connected sightlines between compounds.
 * This depends on plot coordinates, never live file count/size/category. */
export function villageParcelPlots(centerX: number, centerZ: number) {
  const parcel = `${centerX}:${centerZ}`;
  const mirrored = coordinateNoise(parcel, 840) > 0.5 ? -1 : 1;
  const swayX = (coordinateNoise(parcel, 841) - 0.5) * 0.32;
  const swayZ = (coordinateNoise(parcel, 842) - 0.5) * 0.32;
  return [[-2.35, -2.3], [2.35, -1.8], [0.5, 2.5]].map(([x, z], slot) => {
    const side = BRIDGE_SIDE_PLOTS.find(p => p.cx === centerX && p.cz === centerZ && p.slot === slot);
    return side ? { x: side.x, z: side.z } : { x: centerX + x * mirrored + swayX, z: centerZ + z + swayZ };
  });
}

export function villageStructureVariant(path: string) {
  return Math.min(3, Math.floor(coordinateNoise(path, 846) * 4));
}

export function villageHutYaw(path: string, x: number, z: number) {
  const centerX = (Math.floor(x / ROAD_GRID_SPACING) + 0.5) * ROAD_GRID_SPACING;
  const centerZ = (Math.floor(z / ROAD_GRID_SPACING) + 0.5) * ROAD_GRID_SPACING;
  // Front doors face their courtyard. A bounded slant breaks exact repetition,
  // while rear objective plots retain a clear entrance facing the player.
  // This doorstep faces the bank track at (24,26), not the slot's grid centre.
  const courtyardYaw = atDownstreamHut(x,z) ? Math.atan2(x-24,z-26) : Math.atan2(x - centerX, z - centerZ);
  return (Math.abs(x) < 1 && z >= 38 ? 0 : courtyardYaw) + (coordinateNoise(path, 847) - 0.5) * 0.18;
}

export function isVillagePlotArea(x: number, z: number, padding = 0) {
  if (BRIDGE_SIDE_PLOTS.some(p => Math.abs(x-p.x) < 2+padding && Math.hypot(x-p.x,z-p.z) < 2+padding)) return true;
  const centerX = (Math.floor(x / ROAD_GRID_SPACING) + 0.5) * ROAD_GRID_SPACING;
  const centerZ = (Math.floor(z / ROAD_GRID_SPACING) + 0.5) * ROAD_GRID_SPACING;
  const inFront = centerZ >= 12 && centerZ <= 52;
  const inRear = centerZ <= -28 && centerZ >= -52
    && !(centerZ === -28 && Math.abs(centerX) < 16);
  if (!VILLAGE_COLUMN_ORDER.some(column => (column + 0.5) * ROAD_GRID_SPACING === centerX)
    || (!inFront && !inRear)) return false;
  return villageParcelPlots(centerX, centerZ).some(plot => Math.hypot(x - plot.x, z - plot.z) < 2.0 + padding);
}

/**
 * Permanent village courtyards lie between the existing driving lanes.
 * A three-house parcel and an alternating open corner replace uniform 2x2 rows.
 * Folders sit at road intersections as tunnel entrances.
 */
export function layoutFilesInGrid(
  files: FileEntry[],
  options: LayoutOptions = {},
): Map<string, BlockPosition> {
  const positions = new Map<string, BlockPosition>();
  const S = ROAD_GRID_SPACING;

  // Separate files and folders
  const folders = files.filter(f => f.is_dir);
  const regularFiles = files.filter(f => !f.is_dir);

  // Live sectors pass their persistent plot manifest, including trashed files.
  // Never sort that manifest by mutable names, sizes or categories: doing so
  // would relocate surviving huts when a neighboring file changes or is gone.
  if (!options.preserveSlots) {
    folders.sort((a, b) => a.name.localeCompare(b.name));

    // Stateless callers can still request the original category-first layout.
    regularFiles.sort((a, b) => {
      const catA = getFileCategory(a.extension);
      const catB = getFileCategory(b.extension);
      if (catA !== catB) return catA.localeCompare(catB);
      const sizeDifference = b.size - a.size;
      if (sizeDifference !== 0) return sizeDifference;
      // Filesystem enumeration order is not guaranteed. A stable path tie-breaker
      // ensures the same directory always reconstructs the same city layout.
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });
  }

  // Place folders at road intersections in front row
  const folderCols = Math.max(folders.length, 1);
  const folderRowOffset = ((folderCols - 1) * S) / 2;

  for (let i = 0; i < folders.length; i++) {
    // Center-out slots never recenter existing portals when a folder is added.
    const x = options.preserveSlots
      ? (i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? -S : S))
      : i * S - folderRowOffset;
    if (isInsideArena(x, 0, LAYOUT_PLAYABLE_PADDING)) {
      positions.set(folders[i].path, { x, y: 0.5, z: 0 });
    }
  }

  // Place files in city blocks between road grid lines.
  // Each block is the area between 4 road lines.
  // Files go at the center of each block with a small scatter.
  const filesPerBlock = 3;
  const blockInset = 2.7;
  const jitterLimit = 0.12;

  // Generate block centers: blocks are at (col+0.5)*S, (row+0.5)*S
  // Start from row 0 (between z=0 road and z=S road)
  const columns: readonly number[] = VILLAGE_COLUMN_ORDER;

  let fileIndex = 0;
  const maximumPlotOffset = blockInset + jitterLimit;
  const maximumBlockCenterZ = ARENA_BOUNDS.maxZ - LAYOUT_PLAYABLE_PADDING - maximumPlotOffset;
  const minimumBlockCenterZ = ARENA_BOUNDS.minZ + LAYOUT_PLAYABLE_PADDING + maximumPlotOffset;
  const rowCenters: number[] = [];

  // Keep the familiar village in front of the spawn first. A finite defensive
  // rear pass is available if a future reserved zone removes more front plots.
  for (let z = S * 1.5; z <= maximumBlockCenterZ; z += S) rowCenters.push(z);
  for (let z = -S * 3.5; z >= minimumBlockCenterZ; z -= S) rowCenters.push(z);

  for (let row = 0; row < rowCenters.length && fileIndex < regularFiles.length; row++) {
    const blockCenterZ = rowCenters[row];
    for (let c = 0; c < columns.length && fileIndex < regularFiles.length; c++) {
      const col = columns[c];
      const blockCenterX = (col + 0.5) * S;
      // The fixed US embassy/landing-yard compound is not a file plot. Keep
      // both its south approach and the playable spawn sightline unobstructed.
      if (blockCenterZ === -28 && Math.abs(blockCenterX) < 16) continue;
      if (!isInsideArena(
        blockCenterX,
        blockCenterZ,
        LAYOUT_PLAYABLE_PADDING + maximumPlotOffset,
      )) continue;
      const blockOverlapsReservedZone = options.reservedZones?.some(zone => (
        Math.abs(blockCenterX - zone.centerX) <= zone.halfWidth + S * 0.5
        && Math.abs(blockCenterZ - zone.centerZ) <= zone.halfDepth + S * 0.5
      ));
      if (blockOverlapsReservedZone) continue;
      const plots = villageParcelPlots(blockCenterX, blockCenterZ);
      // Protect the largest hut footprint, not only its center. Exclusions are
      // plot-based so a size change/deletion cannot rearrange its neighbors.

      for (let f = 0; f < filesPerBlock && fileIndex < regularFiles.length; f++) {
        const plot = plots[f];
        if (intersectsTerrainMound(plot.x, plot.z, 2.45)
          || isInsideRiverCorridor(plot.x, plot.z, layoutRiver, 3.0)) continue;
        const file = regularFiles[fileIndex];
        // Stable coordinate-seeded perturbation breaks the visible 2x2 grid
        // while remaining tightly bounded around each assigned plot.
        const coordinateSeed = `${file.path}:${row}:${col}:${f}`;
        const jitterX = (coordinateNoise(coordinateSeed, 1968) - 0.5) * jitterLimit * 2;
        const jitterZ = (coordinateNoise(coordinateSeed, 1971) - 0.5) * jitterLimit * 2;
        const x = plot.x + jitterX;
        const z = plot.z + jitterZ;
        if (!isInsideArena(x, z, LAYOUT_PLAYABLE_PADDING)) continue;
        positions.set(file.path, {
          x,
          y: 0.5,
          z,
        });
        fileIndex++;
      }
    }
  }

  return positions;
}
