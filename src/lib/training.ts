import { FileEntry } from './types';

const MIB = 1024 * 1024;

export const TRAINING_DIRECTORY = '/training/cleanup-sector-01';
const TRAINING_DUPLICATE_ORIGINAL = `${TRAINING_DIRECTORY}/duplicate-data.csv`;

export const TRAINING_ENTRIES: FileEntry[] = [
  { path: `${TRAINING_DIRECTORY}/ancient-backup.zip`, name: 'ancient-backup.zip', size: 1450 * MIB, is_dir: false, extension: 'zip' },
  { path: `${TRAINING_DIRECTORY}/camera-roll.mov`, name: 'camera-roll.mov', size: 820 * MIB, is_dir: false, extension: 'mov' },
  { path: `${TRAINING_DIRECTORY}/design-export.psd`, name: 'design-export.psd', size: 510 * MIB, is_dir: false, extension: 'psd' },
  { path: `${TRAINING_DIRECTORY}/debug-session.log`, name: 'debug-session.log', size: 220 * MIB, is_dir: false, extension: 'log' },
  { path: `${TRAINING_DIRECTORY}/unused-installer.dmg`, name: 'unused-installer.dmg', size: 190 * MIB, is_dir: false, extension: 'dmg' },
  { path: `${TRAINING_DIRECTORY}/prototype-v7.blend`, name: 'prototype-v7.blend', size: 128 * MIB, is_dir: false, extension: 'blend' },
  { path: `${TRAINING_DIRECTORY}/mixdown-final.wav`, name: 'mixdown-final.wav', size: 84 * MIB, is_dir: false, extension: 'wav' },
  { path: TRAINING_DUPLICATE_ORIGINAL, name: 'duplicate-data.csv', size: 42 * MIB, is_dir: false, extension: 'csv' },
  {
    path: `${TRAINING_DIRECTORY}/duplicate-data-copy.csv`,
    name: 'duplicate-data-copy.csv',
    size: 42 * MIB,
    is_dir: false,
    extension: 'csv',
    // Training data is synthetic, so this relationship stands in for the
    // scanner's successful streaming byte comparison of the paired fixtures.
    safe_duplicate_of: TRAINING_DUPLICATE_ORIGINAL,
  },
  { path: `${TRAINING_DIRECTORY}/old-notes.pdf`, name: 'old-notes.pdf', size: 18 * MIB, is_dir: false, extension: 'pdf' },
  { path: `${TRAINING_DIRECTORY}/screenshot-copy.png`, name: 'screenshot-copy.png', size: 12 * MIB, is_dir: false, extension: 'png' },
  { path: `${TRAINING_DIRECTORY}/scratch-code.ts`, name: 'scratch-code.ts', size: 4 * MIB, is_dir: false, extension: 'ts' },
  { path: `${TRAINING_DIRECTORY}/readme-copy.txt`, name: 'readme-copy.txt', size: 1 * MIB, is_dir: false, extension: 'txt' },
];

export function createTrainingEntries(): FileEntry[] {
  return TRAINING_ENTRIES.map((entry) => ({ ...entry }));
}
