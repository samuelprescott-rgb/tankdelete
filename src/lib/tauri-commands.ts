import { CAMPAIGN_FINALE, CAMPAIGN_ROOT, createCampaignFixtures } from './campaignFixtures';
import type { FileEntry, TrashAction } from './types';

export { CAMPAIGN_ROOT };

// The name of this module is retained for existing call sites. There is no
// host adapter: identical simulation code runs in a browser and a webview.
const { directories, files } = createCampaignFixtures();

/** The root has no parent. Arbitrary strings are never parsed or normalized. */
export function getSimulatedParent(directory: string): string | null {
  return directories.get(directory)?.parent ?? null;
}

export function createSimulatedCommands() {
  const removed = new Set<string>();
  const history: TrashAction[] = [];
  let reclaimed = 0;
  let lastDirectory: string | null = null;

  function sector(path: string) {
    const node = directories.get(path);
    if (!node) throw new Error('Unknown simulated sector.');
    return node;
  }

  return {
    async pickDirectory(): Promise<string> {
      return CAMPAIGN_ROOT;
    },
    async scanDirectory(path: string): Promise<FileEntry[]> {
      return sector(path).children
        .filter(entry => !removed.has(entry.path))
        .map(entry => ({ ...entry }));
    },
    countChildren(path: string): number {
      return sector(path).children.reduce((n, entry) => n + Number(!removed.has(entry.path)), 0);
    },
    /** Snapshot confirmed survivors, even while their old meshes are dissolving. */
    getDefenseFiles(retainedOriginals: ReadonlySet<string>, source: string = CAMPAIGN_FINALE): string[] {
      return sector(source).children
        .filter(entry => !entry.is_dir && !removed.has(entry.path))
        .sort((a, b) => Number(retainedOriginals.has(b.path)) - Number(retainedOriginals.has(a.path))
          || a.name.localeCompare(b.name))
        .slice(0, 3).map(entry => entry.name);
    },
    async saveLastDirectory(path: string): Promise<void> {
      sector(path);
      lastDirectory = path;
    },
    async getLastDirectory(): Promise<string | null> {
      return lastDirectory;
    },
    // Marking is a UI action. Only confirmation changes the virtual trash.
    async moveToTrash(path: string, duplicateOf?: string): Promise<TrashAction> {
      const entry = files.get(path);
      if (!entry || removed.has(path)) throw new Error('Simulated file is not in play.');
      if (duplicateOf !== undefined &&
        (duplicateOf !== entry.safe_duplicate_of || !files.has(duplicateOf) || removed.has(duplicateOf))) {
        throw new Error('Simulated duplicate does not match a live retained original.');
      }
      const action: TrashAction = {
        file_path: path, file_name: entry.name, original_size: entry.size,
        trash_timestamp: Date.now(),
      };
      removed.add(path);
      history.push(action);
      reclaimed += entry.size;
      return { ...action };
    },
    async undoLastTrash(): Promise<TrashAction | null> {
      const action = history.pop();
      if (!action) return null;
      removed.delete(action.file_path);
      reclaimed -= action.original_size;
      return { ...action };
    },
    async getSessionStats(): Promise<[number, number]> {
      return [removed.size, reclaimed];
    },
    resetSession(): void {
      removed.clear();
      history.length = 0;
      reclaimed = 0;
      lastDirectory = null;
    },
  };
}

export const commands = createSimulatedCommands();
