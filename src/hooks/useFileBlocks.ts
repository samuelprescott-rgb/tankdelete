import { useMemo } from 'react';
import { FileEntry } from '../lib/types';
import { layoutFilesInGrid } from '../lib/layout';
import { fileToScale } from '../lib/scale';
import { getFileCategory, getCategoryColor, FileCategory } from '../lib/colors';
import { FILE_OBJECTIVE_RESERVED_ZONE, type FileObjective } from '../lib/mission';

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
): FileBlocksData {
  return useMemo(() => {
    // Separate folders and files
    const folders = entries.filter(e => e.is_dir);
    const files = entries.filter(e => !e.is_dir);

    const objectivePositions = new Map(
      objective?.targets.map(target => [target.path, target.position]) ?? [],
    );
    // Objective huts are literal files, but they live in a reserved rear compound.
    // Excluding them from the village pass avoids leaving ghost gaps or allowing a
    // large directory to build ordinary huts through the mission target area.
    const positions = layoutFilesInGrid(
      files.filter(file => !objectivePositions.has(file.path)),
      objective ? { reservedZones: [FILE_OBJECTIVE_RESERVED_ZONE] } : undefined,
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
        isObjective: objectivePosition !== undefined,
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
  }, [entries, objective]);
}
