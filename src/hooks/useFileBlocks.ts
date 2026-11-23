import { useMemo, useRef } from 'react';
import { FileEntry } from '../lib/types';
import { layoutFilesInGrid } from '../lib/layout';
import { fileToScale } from '../lib/scale';
import { getFileCategory, getCategoryColor, FileCategory } from '../lib/colors';
import { FILE_OBJECTIVE_RESERVED_ZONE, type FileObjective } from '../lib/mission';
import { createSectorPage, createSectorReservations, type SectorReservations } from '../lib/sectorPaging';

/** Keep every visited directory's plots until the game session is unmounted. */
export function useStableSectorPage(
  entries: FileEntry[],
  pageIndex: number,
  objectivePath: string | undefined,
  directory: string | null,
  ready: boolean,
) {
  const directoriesRef = useRef(new Map<string, SectorReservations>());
  return useMemo(() => {
    // During navigation the old entries briefly coexist with the new path.
    // They must not become permanent reservations in the destination directory.
    if (!ready || !directory) return createSectorPage([], 0);
    let reservations = directoriesRef.current.get(directory);
    if (!reservations) {
      reservations = createSectorReservations();
      directoriesRef.current.set(directory, reservations);
    }
    return createSectorPage(entries, pageIndex, objectivePath, reservations);
  }, [directory, entries, objectivePath, pageIndex, ready]);
}

export interface BlockData {
  path: string;
  name: string;
  size: number;
  extension: string | null;
  position: [number, number, number];
  scale: number;
  color: string;
  category: FileCategory;
  is_dir: boolean;
  isObjective: boolean;
}

export interface FileBlocksData {
  blocksByCategory: Map<FileCategory, BlockData[]>;
  folders: FileEntry[];
  allBlocks: BlockData[];
}

export function useFileBlocks(
  entries: FileEntry[],
  objective: FileObjective | null = null,
  layoutEntries: FileEntry[] = entries,
  reservedObjective: FileObjective | null = objective,
): FileBlocksData {
  return useMemo(() => {
    // Separate folders and files
    const folders = entries.filter(e => e.is_dir);
    const files = entries.filter(e => !e.is_dir);

    const objectivePositions = new Map(
      reservedObjective?.targets.map(target => [target.path, target.position]) ?? [],
    );
    const activeObjectivePaths = new Set(objective?.targets.map(target => target.path));
    // The manifest retains empty plots after destruction, so removal, undo and
    // category/size changes affect only that hut. Mission targets have their own
    // reserved rear compound and do not consume an ordinary village plot.
    const positions = layoutFilesInGrid(
      layoutEntries.filter(file => !file.is_dir),
      { reservedZones: [FILE_OBJECTIVE_RESERVED_ZONE], preserveSlots: true },
    );

    // Transform files into block data
    const allBlocks: BlockData[] = files.map(file => {
      const objectivePosition = objectivePositions.get(file.path);
      const position = objectivePosition ?? positions.get(file.path);
      const scale = fileToScale(file.size);
      const category = getFileCategory(file.extension);
      const color = getCategoryColor(file.extension);

      return {
        path: file.path,
        name: file.name,
        size: file.size,
        extension: file.extension,
        position: position ? [position.x, position.y, position.z] : [0, 0, 0],
        scale,
        color,
        category,
        is_dir: file.is_dir,
        // Withdrawing an unsafe mission removes its marker, not its plot. The
        // remaining duplicate stays in the compound if its original is removed.
        isObjective: activeObjectivePaths.has(file.path),
      };
    });

    // Group blocks by category for instanced rendering
    const blocksByCategory = new Map<FileCategory, BlockData[]>();
    for (const block of allBlocks) {
      if (!blocksByCategory.has(block.category)) {
        blocksByCategory.set(block.category, []);
      }
      blocksByCategory.get(block.category)!.push(block);
    }

    return {
      blocksByCategory,
      folders,
      allBlocks,
    };
  }, [entries, layoutEntries, objective, reservedObjective]);
}
