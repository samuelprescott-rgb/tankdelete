import type { FileEntry } from './types';

/** Hard rendering budgets for one finite combat sector. */
export const SECTOR_FILE_CAPACITY = 80;
export const SECTOR_FOLDER_CAPACITY = 12;

export interface SectorPage {
  /** Zero-based, already clamped page index. */
  pageIndex: number;
  pageCount: number;
  entries: FileEntry[];
  totalFiles: number;
  totalFolders: number;
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
): SectorPage {
  const folders = entries
    .filter(entry => entry.is_dir)
    .slice()
    .sort(compareEntryPaths);
  const allFiles = entries
    .filter(entry => !entry.is_dir)
    .slice()
    .sort(compareEntryPaths);
  const pinnedFile = pinnedFilePath
    ? allFiles.find(entry => entry.path === pinnedFilePath)
    : undefined;
  const regularFiles = pinnedFile
    ? allFiles.filter(entry => entry.path !== pinnedFile.path)
    : allFiles;
  const regularFileCapacity = SECTOR_FILE_CAPACITY - (pinnedFile ? 1 : 0);
  const filePageCount = Math.ceil(regularFiles.length / regularFileCapacity);
  const folderPageCount = Math.ceil(folders.length / SECTOR_FOLDER_CAPACITY);
  const pageCount = Math.max(1, filePageCount, folderPageCount);
  const pageIndex = clampPageIndex(requestedPageIndex, pageCount);
  const fileStart = pageIndex * regularFileCapacity;
  const folderStart = pageIndex * SECTOR_FOLDER_CAPACITY;
  const pageFiles = regularFiles.slice(fileStart, fileStart + regularFileCapacity);
  const pageFolders = folders.slice(folderStart, folderStart + SECTOR_FOLDER_CAPACITY);

  if (pinnedFile) pageFiles.push(pinnedFile);

  return {
    pageIndex,
    pageCount,
    entries: [...pageFolders, ...pageFiles],
    totalFiles: allFiles.length,
    totalFolders: folders.length,
  };
}
