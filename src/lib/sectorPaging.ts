import type { FileEntry } from './types';

/** Hard rendering budgets for one finite combat sector. */
export const SECTOR_FILE_CAPACITY = 80;
export const SECTOR_FOLDER_CAPACITY = 12;

export interface SectorPage {
  /** Zero-based, already clamped page index. */
  pageIndex: number;
  pageCount: number;
  entries: FileEntry[];
  /** Permanent plot manifest, including deleted entries as empty reservations. */
  layoutEntries: FileEntry[];
  totalFiles: number;
  totalFolders: number;
}

/** One directory's plot ownership for the lifetime of a mounted game session. */
export interface SectorReservations {
  files: FileEntry[];
  folders: FileEntry[];
  filePaths: Set<string>;
  folderPaths: Set<string>;
  /** A mission's spare slot remains reserved after its target is destroyed. */
  regularFileCapacity: number | null;
}

export function createSectorReservations(): SectorReservations {
  return {
    files: [],
    folders: [],
    filePaths: new Set(),
    folderPaths: new Set(),
    regularFileCapacity: null,
  };
}

function compareEntryPaths(left: FileEntry, right: FileEntry) {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

function clampPageIndex(pageIndex: number, pageCount: number) {
  if (!Number.isFinite(pageIndex)) return 0;
  return Math.max(0, Math.min(pageCount - 1, Math.trunc(pageIndex)));
}

/**
 * Deterministically selects the structures rendered in one arena-sized sector.
 * The returned slice is only a presentation layer: callers retain the complete
 * entry list for Trash, Undo, mission validity, stats, and folder navigation.
 *
 * An active bonus target consumes one of the 80 file slots and is appended to
 * every page. This keeps the single safe target reachable without ever pushing
 * the finite arena over its layout budget.
 */
export function createSectorPage(
  entries: readonly FileEntry[],
  requestedPageIndex: number,
  pinnedFilePath?: string,
  reservations: SectorReservations = createSectorReservations(),
): SectorPage {
  const liveByPath = new Map(entries.map(entry => [entry.path, entry]));
  const pinnedEntry = pinnedFilePath ? liveByPath.get(pinnedFilePath) : undefined;
  const pinnedFile = pinnedEntry && !pinnedEntry.is_dir ? pinnedEntry : undefined;
  if (reservations.regularFileCapacity === null) {
    // Reserve using the objective's identity, even if Horde Mode enters after
    // that target was already destroyed. Its absence must not compact pages.
    reservations.regularFileCapacity = SECTOR_FILE_CAPACITY - (pinnedFilePath ? 1 : 0);
  }

  // Only previously unseen paths acquire new plots. Tombstones are deliberately
  // retained: undo restores the original hut, and deleting a boundary item can
  // never pull another hut in from a different sector. Fresh files append in a
  // deterministic order without consuming somebody else's vacated plot.
  const unseen = entries.filter(entry => entry.is_dir
    ? !reservations.folderPaths.has(entry.path)
    : !reservations.filePaths.has(entry.path)
      && (entry.path !== pinnedFilePath || reservations.regularFileCapacity === SECTOR_FILE_CAPACITY));
  unseen.sort(compareEntryPaths);
  for (const entry of unseen) {
    const paths = entry.is_dir ? reservations.folderPaths : reservations.filePaths;
    if (paths.has(entry.path)) continue;
    paths.add(entry.path);
    (entry.is_dir ? reservations.folders : reservations.files).push({ ...entry });
  }

  const regularFileCapacity = reservations.regularFileCapacity;
  const filePageCount = Math.ceil(reservations.files.length / regularFileCapacity);
  const folderPageCount = Math.ceil(reservations.folders.length / SECTOR_FOLDER_CAPACITY);
  const pageCount = Math.max(1, filePageCount, folderPageCount);
  const pageIndex = clampPageIndex(requestedPageIndex, pageCount);
  const fileStart = pageIndex * regularFileCapacity;
  const folderStart = pageIndex * SECTOR_FOLDER_CAPACITY;
  const filePlots = reservations.files.slice(fileStart, fileStart + regularFileCapacity);
  const folderPlots = reservations.folders.slice(folderStart, folderStart + SECTOR_FOLDER_CAPACITY);
  const pageFiles = filePlots.flatMap(plot => {
    const entry = liveByPath.get(plot.path);
    return entry && !entry.is_dir && entry.path !== pinnedFilePath ? [entry] : [];
  });
  const pageFolders = folderPlots.flatMap(plot => {
    const entry = liveByPath.get(plot.path);
    return entry?.is_dir ? [entry] : [];
  });

  // Missions are normally present at initialization and have a reserved slot
  // on every page. If a later rescan introduces a new mission, do not move a
  // full page's huts to make room; the target remains reachable on its own page.
  if (pinnedFile && pageFiles.length < SECTOR_FILE_CAPACITY) pageFiles.push(pinnedFile);

  return {
    pageIndex,
    pageCount,
    entries: [...pageFolders, ...pageFiles],
    layoutEntries: [...folderPlots, ...filePlots],
    totalFiles: entries.filter(entry => !entry.is_dir).length,
    totalFolders: entries.filter(entry => entry.is_dir).length,
  };
}
