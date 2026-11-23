/** Floating names are presentation only; hit targets and file state are untouched. */
export const MAX_FLOATING_FILE_LABELS = 16;
export const MAX_NEARBY_FILE_LABELS = 4;
export const FILE_LABEL_VISIBILITY_RADIUS = 18;
export const FILE_LABEL_INDEX_CELL_SIZE = 12;
export const FILE_LABEL_REFRESH_CELL_SIZE = 2;
export const FILE_LABEL_REFRESH_SECONDS = 0.4;

interface LabelBlock {
  path: string;
  position: readonly [number, number, number];
}

export interface FileLabelIndex<T extends LabelBlock> {
  blocksByPath: ReadonlyMap<string, T>;
  blocksByCell: ReadonlyMap<string, readonly T[]>;
}

export function fileLabelCellKey(x: number, z: number) { return `${x}:${z}`; }

/** Rebuilt only when the block collection changes, not on camera movement. */
export function createFileLabelIndex<T extends LabelBlock>(blocks: readonly T[]): FileLabelIndex<T> {
  const blocksByPath = new Map<string, T>();
  const blocksByCell = new Map<string, T[]>();
  for (const block of blocks) {
    blocksByPath.set(block.path, block);
    const key = fileLabelCellKey(Math.floor(block.position[0] / FILE_LABEL_INDEX_CELL_SIZE),
      Math.floor(block.position[2] / FILE_LABEL_INDEX_CELL_SIZE));
    const cell = blocksByCell.get(key);
    if (cell) cell.push(block); else blocksByCell.set(key, [block]);
  }
  return { blocksByPath, blocksByCell };
}

/** Four nearby ordinary names, with distance-independent armed-label priority. */
export function selectProximityFileLabelPaths<T extends LabelBlock>(index: FileLabelIndex<T>,
  markedFiles: ReadonlySet<string>, cameraX: number, cameraZ: number): string[] {
  if (!Number.isFinite(cameraX) || !Number.isFinite(cameraZ)) return [];
  const ranked: { path: string; distanceSq: number; marked: boolean }[] = [];
  const seenPaths = new Set<string>();
  const cellX = Math.floor(cameraX / FILE_LABEL_INDEX_CELL_SIZE);
  const cellZ = Math.floor(cameraZ / FILE_LABEL_INDEX_CELL_SIZE);
  const radius = Math.ceil(FILE_LABEL_VISIBILITY_RADIUS / FILE_LABEL_INDEX_CELL_SIZE);
  const add = (block: T, marked: boolean) => {
    if (seenPaths.has(block.path)) return;
    const distanceSq = (block.position[0] - cameraX) ** 2 + (block.position[2] - cameraZ) ** 2;
    if (!marked && distanceSq > FILE_LABEL_VISIBILITY_RADIUS ** 2) return;
    seenPaths.add(block.path);
    ranked.push({ path: block.path, distanceSq, marked });
  };
  for (let x = cellX - radius; x <= cellX + radius; x++) {
    for (let z = cellZ - radius; z <= cellZ + radius; z++) {
      for (const block of index.blocksByCell.get(fileLabelCellKey(x, z)) ?? []) {
        add(block, markedFiles.has(block.path));
      }
    }
  }
  // This scales with armed selections, never the entire remote directory.
  for (const path of markedFiles) {
    if (seenPaths.has(path)) continue;
    const block = index.blocksByPath.get(path);
    if (block) add(block, true);
  }
  ranked.sort((a, b) => Number(b.marked) - Number(a.marked)
    || a.distanceSq - b.distanceSq || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const paths: string[] = [];
  let ordinaryCount = 0;
  for (const entry of ranked) {
    if (!entry.marked && ordinaryCount >= MAX_NEARBY_FILE_LABELS) continue;
    paths.push(entry.path);
    if (!entry.marked) ordinaryCount++;
    if (paths.length >= MAX_FLOATING_FILE_LABELS) break;
  }
  return paths;
}
