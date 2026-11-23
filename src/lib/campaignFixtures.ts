import type { FileEntry } from './types';

/** Hand-authored game objects, not paths on disk. No runtime inputs or discovery. */
export const CAMPAIGN_ROOT = 'sim://campaign';
const RELAY = CAMPAIGN_ROOT + '/Relay';
const DEPOT = CAMPAIGN_ROOT + '/Depot';
const VAULT = RELAY + '/Vault';
export const CAMPAIGN_FINALE = VAULT;
const MIB = 1024 * 1024;

type FileSpec = readonly [name: string, sizeMiB: number, duplicateOfName?: string];
interface SectorSpec {
  directory: string;
  parent: string | null;
  files: readonly FileSpec[];
}

const sectors: readonly SectorSpec[] = [
  { directory: CAMPAIGN_ROOT, parent: null, files: [
    ['sector-map.png', 14], ['sector-map-copy.png', 14, 'sector-map.png'],
    ['relay-diagnostics.log', 55], ['simulator-replay.mov', 640],
    ['retired-textures.zip', 318], ['weather-sample.wav', 38],
    ['training-schedule.pdf', 8], ['atlas-preview.psd', 180],
  ] },
  { directory: RELAY, parent: CAMPAIGN_ROOT, files: [
    ['rain-loop.wav', 24], ['rain-loop-copy.wav', 24, 'rain-loop.wav'],
    ['signal-history.log', 78], ['relay-schematic.svg', 2],
    ['radio-rehearsal.mov', 430], ['caption-draft.txt', 1],
  ] },
  { directory: DEPOT, parent: CAMPAIGN_ROOT, files: [
    ['props-index.csv', 5], ['props-index-copy.csv', 5, 'props-index.csv'],
    ['terrain-prototypes.blend', 186], ['packing-list.pdf', 9],
    ['prop-photographs.zip', 360], ['old-build.dmg', 270],
  ] },
  { directory: VAULT, parent: RELAY, files: [
    ['old-atlas.pdf', 32], ['old-atlas-copy.pdf', 32, 'old-atlas.pdf'],
    ['archived-reel.mov', 524], ['color-studies.psd', 96],
    ['catalog.csv', 3], ['readme.txt', 1],
  ] },
];

export function createCampaignFixtures() {
  const directories = new Map<string, { parent: string | null; children: FileEntry[] }>();
  const files = new Map<string, FileEntry>();
  for (const { directory, parent } of sectors) {
    directories.set(directory, { parent, children: [] });
  }
  for (const { directory, parent, files: specs } of sectors) {
    if (parent !== null) {
      directories.get(parent)!.children.push({
        path: directory, name: directory.slice(parent.length + 1),
        is_dir: true, size: 0, extension: null,
      });
    }
    for (const [name, sizeMiB, duplicateOfName] of specs) {
      const path = directory + '/' + name;
      const entry: FileEntry = {
        path, name, size: sizeMiB * MIB, is_dir: false,
        extension: name.slice(name.lastIndexOf('.') + 1),
        ...(duplicateOfName && { safe_duplicate_of: directory + '/' + duplicateOfName }),
      };
      directories.get(directory)!.children.push(entry);
      files.set(path, entry);
    }
  }
  return { directories, files };
}
