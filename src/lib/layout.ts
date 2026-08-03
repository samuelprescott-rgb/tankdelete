import { FileEntry } from './types';
import { getFileCategory } from './colors';
import { ROAD_GRID_SPACING } from './constants';
import { ARENA_BOUNDS, isInsideArena } from './arenaBounds';

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

/**
 * Layout files in "city blocks" between Tron road grid lines.
 * Roads run at multiples of ROAD_GRID_SPACING.
 * Files sit inside the blocks between roads, offset from the lines.
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

  // Sort folders alphabetically
  folders.sort((a, b) => a.name.localeCompare(b.name));

  // Sort files by category then size
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

  // Place folders at road intersections in front row
  const folderCols = Math.max(folders.length, 1);
  const folderRowOffset = ((folderCols - 1) * S) / 2;

  for (let i = 0; i < folders.length; i++) {
    const x = i * S - folderRowOffset;
    if (isInsideArena(x, 0, LAYOUT_PLAYABLE_PADDING)) {
      positions.set(folders[i].path, { x, y: 0.5, z: 0 });
    }
  }

  // Place files in city blocks between road grid lines.
  // Each block is the area between 4 road lines.
  // Files go at the center of each block with a small scatter.
  const filesPerBlock = 4; // max files per city block
  const blockInset = S * 0.3; // how far inside the block from the road edge
  const jitterLimit = S * 0.055;

  // Generate block centers: blocks are at (col+0.5)*S, (row+0.5)*S
  // Start from row 0 (between z=0 road and z=S road)
  const numCols = Math.max(folderCols + 1, 4);
  const colStart = -Math.floor(numCols / 2);

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
    for (let c = 0; c < numCols && fileIndex < regularFiles.length; c++) {
      const col = colStart + c;
      const blockCenterX = (col + 0.5) * S;
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

      // Place up to filesPerBlock in a 2x2 pattern inside the block
      const offsets = [
        [-blockInset, -blockInset],
        [blockInset, -blockInset],
        [-blockInset, blockInset],
        [blockInset, blockInset],
      ];

      for (let f = 0; f < filesPerBlock && fileIndex < regularFiles.length; f++) {
        const [ox, oz] = offsets[f];
        const file = regularFiles[fileIndex];
        // Stable coordinate-seeded perturbation breaks the visible 2x2 grid
        // while remaining tightly bounded around each assigned plot.
        const coordinateSeed = `${file.path}:${row}:${col}:${f}`;
        const jitterX = (coordinateNoise(coordinateSeed, 1968) - 0.5) * jitterLimit * 2;
        const jitterZ = (coordinateNoise(coordinateSeed, 1971) - 0.5) * jitterLimit * 2;
        const x = blockCenterX + ox + jitterX;
        const z = blockCenterZ + oz + jitterZ;
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
