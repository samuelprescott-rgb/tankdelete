import { ARENA_BOUNDS, isInsideArena } from './arenaBounds';
import { ROAD_GRID_SPACING } from './constants';
import type { BlockPosition } from './layout';
import type { ReservedLayoutZone } from './layout';
import { intersectsTerrainMound } from './terrain';
import type { FileEntry } from './types';

export const MAX_FILE_OBJECTIVE_TARGETS = 1;
export const MAX_SAFE_DUPLICATE_BYTES = 256 * 1024 * 1024;

/**
 * The rear objective sits among the Viet Cong reserve positions. Candidate
 * centers stay on road intersections so the compound remains clear of the
 * seeded jungle scatter as well as the normal vehicle lanes.
 */
const PREFERRED_COMPOUND_CENTERS = [
  [0, 40],
  [-8, 40],
  [8, 40],
  [0, 48],
  [-8, 48],
  [8, 48],
] as const;

// A bonus mission has exactly one confirmed-safe structure when available.
const COMPOUND_SLOT_OFFSETS = [[0, 0]] as const;

const OBJECTIVE_TERRAIN_CLEARANCE = 2.75;
const OBJECTIVE_ARENA_PADDING = 8;
const OBJECTIVE_Y = 0.5;

export interface FileObjectiveTarget {
  path: string;
  name: string;
  size: number;
  duplicateOfPath: string;
  duplicateOfName: string;
  position: BlockPosition;
}

export interface FileObjective {
  /** Stable identifier useful for React keys and one-shot completion effects. */
  id: string;
  center: BlockPosition;
  targets: readonly FileObjectiveTarget[];
}

export type FileObjectivePhase = 'unavailable' | 'active' | 'complete';

export interface FileObjectiveProgress {
  phase: FileObjectivePhase;
  total: number;
  destroyed: number;
  remaining: number;
  remainingPaths: readonly string[];
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function isCompoundTerrainSafe(centerX: number, centerZ: number) {
  return COMPOUND_SLOT_OFFSETS.every(([offsetX, offsetZ]) => {
    const targetX = centerX + offsetX;
    const targetZ = centerZ + offsetZ;
    if (!isInsideArena(targetX, targetZ, OBJECTIVE_ARENA_PADDING)) return false;
    return !intersectsTerrainMound(
      targetX,
      targetZ,
      OBJECTIVE_TERRAIN_CLEARANCE,
    );
  });
}

function resolveObjectiveCompoundCenter(): BlockPosition {
  const preferred = PREFERRED_COMPOUND_CENTERS.find(([x, z]) => (
    isCompoundTerrainSafe(x, z)
  ));
  if (preferred) return { x: preferred[0], y: OBJECTIVE_Y, z: preferred[1] };

  // Defensive deterministic search. Every candidate stays road-aligned and at
  // least one full objective perimeter inside the finite combat sector.
  const minimumX = Math.ceil(
    (ARENA_BOUNDS.minX + OBJECTIVE_ARENA_PADDING) / ROAD_GRID_SPACING,
  ) * ROAD_GRID_SPACING;
  const maximumX = Math.floor(
    (ARENA_BOUNDS.maxX - OBJECTIVE_ARENA_PADDING) / ROAD_GRID_SPACING,
  ) * ROAD_GRID_SPACING;
  const minimumZ = Math.ceil(
    (ARENA_BOUNDS.minZ + OBJECTIVE_ARENA_PADDING) / ROAD_GRID_SPACING,
  ) * ROAD_GRID_SPACING;
  const maximumZ = Math.floor(
    (ARENA_BOUNDS.maxZ - OBJECTIVE_ARENA_PADDING) / ROAD_GRID_SPACING,
  ) * ROAD_GRID_SPACING;
  const xCandidates = [0];
  for (let offset = ROAD_GRID_SPACING; offset <= maximumX; offset += ROAD_GRID_SPACING) {
    xCandidates.push(-offset, offset);
  }

  for (let z = maximumZ; z >= minimumZ; z -= ROAD_GRID_SPACING) {
    for (const x of xCandidates) {
      if (x < minimumX || x > maximumX) continue;
      if (isCompoundTerrainSafe(x, z)) return { x, y: OBJECTIVE_Y, z };
    }
  }

  // Authored mounds cannot currently exhaust the grid. Keep the theoretical
  // fallback inside the arena even if future terrain changes do so.
  return { x: 0, y: OBJECTIVE_Y, z: maximumZ };
}

/** Shared world location for objective scenery, markers, and file layout. */
export const FILE_OBJECTIVE_COMPOUND_CENTER = Object.freeze(
  resolveObjectiveCompoundCenter(),
);

export const FILE_OBJECTIVE_POSITIONS: readonly BlockPosition[] = Object.freeze(
  COMPOUND_SLOT_OFFSETS.map(([offsetX, offsetZ]) => Object.freeze({
    x: FILE_OBJECTIVE_COMPOUND_CENTER.x + offsetX,
    y: OBJECTIVE_Y,
    z: FILE_OBJECTIVE_COMPOUND_CENTER.z + offsetZ,
  })),
);

/** Shared exclusion keeps ordinary huts and dense foliage outside the compound. */
export const FILE_OBJECTIVE_RESERVED_ZONE: Readonly<ReservedLayoutZone> = Object.freeze({
  centerX: FILE_OBJECTIVE_COMPOUND_CENTER.x,
  centerZ: FILE_OBJECTIVE_COMPOUND_CENTER.z,
  halfWidth: 4.2,
  halfDepth: 4.2,
});

/**
 * Selects at most one scanner-confirmed redundant copy for an optional sector
 * mission. The original must still be present with the exact scanned size; this
 * prevents stale or incomplete relationship metadata from creating a target.
 * Call this only when a directory/session is initialized and retain the result
 * so deleting a target never replenishes the mission from another duplicate.
 */
export function createFileObjective(
  entries: readonly FileEntry[],
  sessionKey: string | number = 'default',
): FileObjective {
  const entriesByPath = new Map(entries.map(entry => [entry.path, entry]));
  const candidates = entries
    .flatMap(entry => {
      const duplicateOfPath = entry.safe_duplicate_of;
      if (entry.is_dir || !duplicateOfPath || duplicateOfPath === entry.path) return [];

      const original = entriesByPath.get(duplicateOfPath);
      if (!original
        || original.is_dir
        || original.safe_duplicate_of
        || original.size !== entry.size
        || !Number.isSafeInteger(entry.size)
        || entry.size < 0
        || entry.size > MAX_SAFE_DUPLICATE_BYTES) return [];
      return [{ entry, original }];
    })
    .sort((left, right) => {
      const sizeDifference = left.entry.size - right.entry.size;
      if (sizeDifference !== 0) return sizeDifference;
      if (left.entry.path < right.entry.path) return -1;
      return left.entry.path > right.entry.path ? 1 : 0;
    })
    .slice(0, MAX_FILE_OBJECTIVE_TARGETS);

  const targets = candidates.map(({ entry, original }, index) => Object.freeze({
    path: entry.path,
    name: entry.name,
    size: entry.size,
    duplicateOfPath: original.path,
    duplicateOfName: original.name,
    position: FILE_OBJECTIVE_POSITIONS[index],
  }));
  const identity = targets.map(target => target.path).join('\u0000');

  return Object.freeze({
    id: `file-objective-${hashText(`${sessionKey}\u0000${identity}`).toString(36)}`,
    center: FILE_OBJECTIVE_COMPOUND_CENTER,
    targets: Object.freeze(targets),
  });
}

/** Pure progress derivation keeps failed Trash operations and Undo authoritative. */
export function getFileObjectiveProgress(
  objective: FileObjective | null | undefined,
  entries: readonly FileEntry[],
): FileObjectiveProgress {
  const targets = objective?.targets ?? [];
  const total = targets.length;
  if (total === 0) {
    return Object.freeze({
      phase: 'unavailable' as const,
      total: 0,
      destroyed: 0,
      remaining: 0,
      remainingPaths: Object.freeze([] as string[]),
    });
  }

  const liveFilePaths = new Set(
    entries.filter(entry => !entry.is_dir).map(entry => entry.path),
  );
  const remainingPaths = targets
    .filter(target => liveFilePaths.has(target.path))
    .map(target => target.path);
  const remaining = remainingPaths.length;

  // Target removal is authoritative completion. Check it before validating the
  // retained original so a same-frame batch/collateral removal cannot collapse
  // the mission into "unavailable" and prevent the follow-on waves from starting.
  if (remaining === 0) {
    return Object.freeze({
      phase: 'complete' as const,
      total,
      destroyed: total,
      remaining: 0,
      remainingPaths: Object.freeze(remainingPaths),
    });
  }

  // If the retained original is removed separately, the copy is no longer an
  // easy-safe cleanup. Withdraw the bonus target until Undo restores it.
  if (targets.some(target => !liveFilePaths.has(target.duplicateOfPath))) {
    return Object.freeze({
      phase: 'unavailable' as const,
      total: 0,
      destroyed: 0,
      remaining: 0,
      remainingPaths: Object.freeze([] as string[]),
    });
  }

  return Object.freeze({
    phase: 'active' as const,
    total,
    destroyed: total - remaining,
    remaining,
    remainingPaths: Object.freeze(remainingPaths),
  });
}
