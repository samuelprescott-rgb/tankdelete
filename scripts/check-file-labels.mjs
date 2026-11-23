import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/fileLabelSelection.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const labels = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const fixture = (path, x, z = 0) => ({ path, position: [x, 0, z] });
const select = (blocks, marked = [], x = 0, z = 0) => labels.selectProximityFileLabelPaths(
  labels.createFileLabelIndex(blocks), new Set(marked), x, z);

assert.equal(labels.MAX_NEARBY_FILE_LABELS, 4);
assert.equal(labels.MAX_FLOATING_FILE_LABELS, 16);
assert.equal(labels.FILE_LABEL_VISIBILITY_RADIUS, 18);
assert.equal(labels.FILE_LABEL_INDEX_CELL_SIZE, 12);
assert.equal(labels.FILE_LABEL_REFRESH_CELL_SIZE, 2);
assert.equal(labels.FILE_LABEL_REFRESH_SECONDS, 0.4);
assert.deepEqual(select([]), []);
assert.deepEqual(select([fixture('far', 18.01)]), []);
assert.deepEqual(select([fixture('edge', 18)]), ['edge'], '18m boundary is inclusive');
assert.deepEqual(select([fixture('diagonal-outside', 13, 13)]), [], 'Distance is radial, not a square box');
const near = [fixture('five', 5), fixture('four', 4), fixture('three', 3), fixture('two', 2), fixture('one', 1)];
const saved = structuredClone(near);
assert.deepEqual(select(near), ['one', 'two', 'three', 'four']);
assert.deepEqual(near, saved, 'Selection cannot mutate block paths, placement or ordering');
assert.deepEqual(select([...near, fixture('remote-armed', 500)], ['remote-armed']),
  ['remote-armed', 'one', 'two', 'three', 'four'], 'Armed targets outside the radius do not consume the ordinary four-label allowance');
assert.deepEqual(select(near, ['five']), ['five', 'one', 'two', 'three', 'four'],
  'Arming a fifth nearby target keeps it visible with confirmation priority');
assert.deepEqual(select([fixture('z', -1), fixture('a', 1)]), ['a', 'z']);
assert.deepEqual(select([fixture('a', 1), fixture('z', -1)]), ['a', 'z'], 'Equal distance has stable path-based ordering');
assert.deepEqual(select([fixture('duplicate', 1), fixture('duplicate', 1)]), ['duplicate']);
assert.deepEqual(select(near, ['deleted-file']), ['one', 'two', 'three', 'four'], 'Stale marks cannot create phantom labels');
const removed = near.filter(block => block.path !== 'one');
assert.deepEqual(select(removed, ['one']), ['two', 'three', 'four', 'five']);
assert.deepEqual(select([...removed, near.find(block => block.path === 'one')]), ['one', 'two', 'three', 'four'],
  'Restored file labels resume from their unchanged original position');
const marked = Array.from({ length: 20 }, (_, i) => fixture(`armed-${i}`, 100 + i));
assert.deepEqual(select([...near, ...marked], marked.map(block => block.path)), marked.slice(0, 16).map(block => block.path),
  'Global cap prioritizes nearest armed targets without allowing ordinary labels to displace them');
assert.deepEqual(select([...near, ...marked.slice(0, 15)], marked.slice(0, 15).map(block => block.path)),
  [...marked.slice(0, 15).map(block => block.path), 'one']);
assert.deepEqual(select([fixture('negative-neighbor', -29.8, -12.2)], [], -12, -12), ['negative-neighbor']);
assert.deepEqual(select([fixture('positive-neighbor', 29.8, 12.2)], [], 12, 12), ['positive-neighbor']);
assert.deepEqual(select([fixture('camera-near', 101, 100), fixture('old-near', 1)], [], 100, 100), ['camera-near']);
assert.deepEqual(select(near, [], Number.NaN, 0), []);

// A large remote directory must not become a per-refresh linear file scan.
const distant = Array.from({ length: 10000 }, (_, i) => fixture(`remote-${i}`, 1000 + i, 3000));
const index = labels.createFileLabelIndex([...near, ...distant]);
let cellReads = 0, pathReads = 0;
const getCell = index.blocksByCell.get.bind(index.blocksByCell);
const getPath = index.blocksByPath.get.bind(index.blocksByPath);
index.blocksByCell.get = key => { cellReads++; return getCell(key); };
index.blocksByPath.get = key => { pathReads++; return getPath(key); };
for (const map of [index.blocksByPath, index.blocksByCell]) {
  map.values = map.entries = map[Symbol.iterator] = () => { throw new Error('Query must not scan the whole index'); };
}
assert.deepEqual(labels.selectProximityFileLabelPaths(index, new Set(['remote-9999']), 0, 0),
  ['remote-9999', 'one', 'two', 'three', 'four']);
assert.equal(cellReads, 25, '18m query visits at most five-by-five existing12m cells');
assert.equal(pathReads, 1, 'Only explicit outside marked paths need direct lookups');

const component = await readFile(new URL('../src/components/Scene/FileBlocks.tsx', import.meta.url), 'utf8');
const proximity = await readFile(new URL('../src/components/Scene/ProximityFileLabels.tsx', import.meta.url), 'utf8');
assert.match(proximity, /selectProximityFileLabelPaths\(labelIndex, markedFiles/);
assert.match(proximity, /clock\.elapsedTime < nextRefreshAtRef\.current/);
assert.match(proximity, /selectionKey === lastSelectionKeyRef\.current/);
assert.match(proximity, /ARMED · \$\{block\.name\}/, 'Confirmation labels must retain their existing armed prefix');
assert.match(component, /<ObjectiveFileMarkers blocks=\{allBlocks\}/);
assert.match(component, /\{formatBytes\(hoveredBlock\.size\)\}/, 'Hover details remain available independently of floating-name budget');
console.log('File label checks passed: four nearest ordinary names within18m, armed priority/global16cap, deterministic ties, deletion/restore, spatial boundaries, bounded index queries and unchanged confirmation/hover information.');
await import('./check-world-label-font.mjs');
