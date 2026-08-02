import { ROAD_GRID_SPACING } from './constants';
import type { BlockPosition } from './layout';
import type { ReservedLayoutZone } from './layout';
import { intersectsTerrainMound, TERRAIN_MOUNDS } from './terrain';
import type { FileEntry } from './types';

export const MAX_FILE_OBJECTIVE_TARGETS = 3;

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

// The spacing accommodates even the largest 2.5x file huts without overlap.
const COMPOUND_SLOT_OFFSETS = [
  [-4.6, 0],
  [4.6, 0],
  [0, 5.2],
] as const;

const OBJECTIVE_TERRAIN_CLEARANCE = 2.75;
const OBJECTIVE_Y = 0.5;

export interface FileObjectiveTarget {
  path: string;
  name: string;
  size: number;
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

function comparableSize(entry: FileEntry) {
  return Number.isFinite(entry.size) && entry.size >= 0
    ? entry.size
    : Number.MAX_SAFE_INTEGER;
}

function isCompoundTerrainSafe(centerX: number, centerZ: number) {
  return COMPOUND_SLOT_OFFSETS.every(([offsetX, offsetZ]) => (
    !intersectsTerrainMound(
      centerX + offsetX,
      centerZ + offsetZ,
      OBJECTIVE_TERRAIN_CLEARANCE,
    )
  ));
}

function resolveObjectiveCompoundCenter(): BlockPosition {
  const preferred = PREFERRED_COMPOUND_CENTERS.find(([x, z]) => (
    isCompoundTerrainSafe(x, z)
  ));
  if (preferred) return { x: preferred[0], y: OBJECTIVE_Y, z: preferred[1] };

  // Defensive deterministic search. The authored terrain currently resolves to
  // a preferred center, but this keeps future mound edits from burying targets.
  for (let z = 32; z <= 96; z += ROAD_GRID_SPACING) {
    for (const x of [0, -8, 8, -16, 16, -24, 24]) {
      if (isCompoundTerrainSafe(x, z)) return { x, y: OBJECTIVE_Y, z };
    }
  }

  // There is always clear space beyond the finite mound field. Use a road-aligned
  // rear fallback rather than ever returning a position that intersects terrain.
  const rearTerrainEdge = TERRAIN_MOUNDS.reduce((edge, mound) => (
    Math.max(edge, mound.z + Math.hypot(mound.sx, mound.sz) * 0.88)
  ), 96);
  const fallbackZ = Math.ceil(
    (rearTerrainEdge + OBJECTIVE_TERRAIN_CLEARANCE + ROAD_GRID_SPACING)
      / ROAD_GRID_SPACING,
  ) * ROAD_GRID_SPACING;
  return { x: 0, y: OBJECTIVE_Y, z: fallbackZ };
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
  centerZ: FILE_OBJECTIVE_COMPOUND_CENTER.z + 2.6,
  halfWidth: 8.5,
  halfDepth: 8.4,
});

/**
 * Selects up to three literal files for one sector mission. The smallest files
 * are preferred for safety, with the full path providing a stable tie-breaker.
 * Call this only when a directory/session is initialized and retain the result;
 * recomputing from a shrinking entry list would incorrectly replenish targets.
 */
export function createFileObjective(
  entries: readonly FileEntry[],
  sessionKey: string | number = 'default',
): FileObjective {
  const seenPaths = new Set<string>();
  const candidates = entries
    .filter(entry => {
      if (entry.is_dir || seenPaths.has(entry.path)) return false;
      seenPaths.add(entry.path);
      return true;
    })
    .slice()
    .sort((left, right) => {
      const sizeDifference = comparableSize(left) - comparableSize(right);
      if (sizeDifference !== 0) return sizeDifference;
      return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
    })
    .slice(0, MAX_FILE_OBJECTIVE_TARGETS);

  const targets = candidates.map((entry, index) => Object.freeze({
    path: entry.path,
    name: entry.name,
    size: entry.size,
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

  return Object.freeze({
    phase: remaining === 0 ? 'complete' as const : 'active' as const,
    total,
    destroyed: total - remaining,
    remaining,
    remainingPaths: Object.freeze(remainingPaths),
  });
}
