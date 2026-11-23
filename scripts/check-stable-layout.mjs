import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import ts from 'typescript';

// Exercise the real pure TypeScript modules without a runner, new dependency,
// generated repository files, or a machine-specific Node executable path.
const modules = new Map();
async function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = (async () => {
    const source = await readFile(url, 'utf8');
    let { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    });
    const imports = [...outputText.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)];
    for (const match of imports) {
      const importedUrl = match[2].startsWith('.')
        ? await moduleUrl(new URL(`${match[2]}.ts`, url))
        : import.meta.resolve(match[2]);
      outputText = outputText.replace(match[0], `from '${importedUrl}'`);
    }
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  })();
  modules.set(url.href, pending);
  return pending;
}
const load = async path => import(await moduleUrl(new URL(path, import.meta.url)));
const { createSectorPage, createSectorReservations, SECTOR_FILE_CAPACITY, SECTOR_FOLDER_CAPACITY } =
  await load('../src/lib/sectorPaging.ts');
const { layoutFilesInGrid, LAYOUT_PLAYABLE_PADDING } = await load('../src/lib/layout.ts');
const { FILE_OBJECTIVE_RESERVED_ZONE, FILE_OBJECTIVE_POSITIONS } = await load('../src/lib/mission.ts');
const { isInsideArena } = await load('../src/lib/arenaBounds.ts');
const { useFileBlocks } = await load('../src/hooks/useFileBlocks.ts');

function renderedBlocks(entries, objective, layoutEntries, reservedObjective) {
  let result;
  function Probe() {
    result = useFileBlocks(entries, objective, layoutEntries, reservedObjective);
    return null;
  }
  renderToString(createElement(Probe));
  return result;
}

function fixture(fileCount, folderCount = 0, directory = '/sector') {
  const files = Array.from({ length: fileCount }, (_, i) => ({
    path: `${directory}/file-${String(i).padStart(4, '0')}`,
    name: `File ${i}`,
    size: 1024 + ((i * 2753) % 10000000),
    is_dir: false,
    extension: ['jpg', 'ts', 'zip', null][i % 4],
  }));
  const folders = Array.from({ length: folderCount }, (_, i) => ({
    path: `${directory}/folder-${String(i).padStart(4, '0')}`,
    name: `Folder ${i}`,
    size: 0,
    is_dir: true,
    extension: null,
  }));
  return [...files, ...folders];
}

function observe(entries, reservations, pinnedPath) {
  const first = createSectorPage(entries, 0, pinnedPath, reservations);
  const positions = new Map();
  const pages = [];
  for (let i = 0; i < first.pageCount; i++) {
    const page = createSectorPage(entries, i, pinnedPath, reservations);
    const plotPositions = layoutFilesInGrid(page.layoutEntries, {
      preserveSlots: true,
      reservedZones: [FILE_OBJECTIVE_RESERVED_ZONE],
    });
    assert.ok(page.entries.filter(entry => !entry.is_dir).length <= SECTOR_FILE_CAPACITY);
    assert.ok(page.entries.filter(entry => entry.is_dir).length <= SECTOR_FOLDER_CAPACITY);
    assert.equal(page.totalFiles, entries.filter(entry => !entry.is_dir).length);
    assert.equal(page.totalFolders, entries.filter(entry => entry.is_dir).length);
    const seenCenters = new Set();
    for (const entry of page.entries) {
      const position = entry.path === pinnedPath
        ? FILE_OBJECTIVE_POSITIONS[0]
        : plotPositions.get(entry.path);
      assert.ok(position, `Every live target needs a valid plot: ${entry.path}`);
      assert.ok(isInsideArena(position.x, position.z, LAYOUT_PLAYABLE_PADDING));
      const center = `${position.x}:${position.z}`;
      assert.ok(!seenCenters.has(center), `Overlapping plot centers on page ${i}`);
      seenCenters.add(center);
      if (!entry.is_dir && entry.path !== pinnedPath) {
        const zone = FILE_OBJECTIVE_RESERVED_ZONE;
        assert.ok(Math.abs(position.x - zone.centerX) > zone.halfWidth
          || Math.abs(position.z - zone.centerZ) > zone.halfDepth,
        'Ordinary huts must stay clear of the mission compound');
      }
      positions.set(`${i}:${entry.path}`, { page: i, ...position });
    }
    pages.push(page);
  }
  return { positions, pages, pageCount: first.pageCount };
}

function unchanged(previous, current, message) {
  for (const [key, position] of current.positions) {
    if (previous.positions.has(key)) assert.deepEqual(position, previous.positions.get(key), message);
    else assert.fail(`${message}: existing target moved between pages (${key})`);
  }
}

// Include several independent file and folder page boundaries and mixed file
// categories. Both first/last and batch deletions previously compacted these.
for (const pinnedIndex of [undefined, 0, 79, 200]) {
  const entries = fixture(201, 29);
  const pinned = pinnedIndex === undefined ? undefined : entries[pinnedIndex].path;
  const reservations = createSectorReservations();
  const initial = observe(entries, reservations, pinned);
  const shuffled = observe([...entries].reverse(), createSectorReservations(), pinned);
  assert.deepEqual(shuffled.positions, initial.positions, 'Initial layout must ignore enumeration order');

  const deleted = new Set([0, 1, 78, 79, 80, 157, 158, 159, 160, 199, 200, 201, 212, 213, 229]
    .map(index => entries[index].path));
  const surviving = entries.filter(entry => !deleted.has(entry.path));
  const afterBatch = observe(surviving, reservations, pinned);
  unchanged(initial, afterBatch, 'Deleting huts must not change surviving coordinates or pages');
  assert.equal(afterBatch.pageCount, initial.pageCount, 'Deleted boundary slots must not collapse pages');
  for (const page of afterBatch.pages) {
    assert.ok(page.entries.every(entry => !deleted.has(entry.path)), 'Empty plots must not render deleted huts');
  }

  const metadataChanged = surviving.map((entry, i) => ({
    ...entry, size: 999999999 - i, extension: i % 2 ? 'ts' : 'wav', name: `Renamed ${i}`,
  })).reverse();
  const changed = observe(metadataChanged, reservations, pinned);
  unchanged(afterBatch, changed, 'Category, size, name and enumeration changes must not shuffle plots');
  for (const page of changed.pages) {
    for (const entry of page.entries) {
      assert.equal(entry.name, metadataChanged.find(candidate => candidate.path === entry.path).name,
        'Live metadata must update independently from its reserved position');
    }
  }

  const restored = observe([...entries].reverse(), reservations, pinned);
  assert.deepEqual(restored.positions, initial.positions, 'Undo must restore every exact original plot');
  const empty = observe([], reservations, pinned);
  assert.equal(empty.positions.size, 0);
  assert.equal(empty.pageCount, initial.pageCount, 'Fully emptied sectors remain navigable for Undo');
  assert.deepEqual(observe(entries, reservations, pinned).positions, initial.positions);

  // New paths that sort before all existing files still acquire new plots.
  const addition = { ...entries[0], path: '/sector/000-new-file', name: 'New file' };
  const newFolder = { ...entries[201], path: '/sector/000-new-folder', name: 'New folder' };
  const expanded = observe([...entries, addition, newFolder], reservations, pinned);
  const oldOnly = { positions: new Map([...expanded.positions]
    .filter(([key]) => !key.endsWith(addition.path) && !key.endsWith(newFolder.path))) };
  unchanged(initial, oldOnly, 'New files and folders must not reuse a deleted plot or move existing targets');
}

// A full final page must remain page 2 even after its last remaining target is
// destroyed. This is the subtle auto-clamp regression from stateless slices.
const boundaryEntries = fixture(81);
const boundaryBook = createSectorReservations();
const boundaryBefore = observe(boundaryEntries, boundaryBook);
const boundaryAfter = observe(boundaryEntries.slice(1, -1), boundaryBook);
assert.equal(boundaryAfter.pageCount, 2);
assert.equal(createSectorPage(boundaryEntries.slice(1, -1), 1, undefined, boundaryBook).pageIndex, 1);
assert.equal(boundaryAfter.pages[1].entries.length, 0);
unchanged(boundaryBefore, boundaryAfter, 'First/last deletion must not backfill or auto-switch sectors');

// Separate directory books are independent, but revisiting one uses its own
// reservations. An explicit new session reconstructs deterministically.
const directoryA = createSectorReservations();
const directoryB = createSectorReservations();
const aEntries = fixture(90, 13, '/a');
const aBefore = observe(aEntries, directoryA);
observe(fixture(170, 25, '/b'), directoryB);
unchanged(aBefore, observe(aEntries.slice(1), directoryA), 'Returning to a directory must retain its plots');
assert.deepEqual(observe(aEntries, createSectorReservations()).positions, aBefore.positions);

// Missing completed objective (direct Horde launch) still reserves its slot;
// restoring that target later cannot shift the first-wave village.
const directEntries = fixture(160);
const directPinned = directEntries[0].path;
const directBook = createSectorReservations();
const direct = observe(directEntries.slice(1), directBook, directPinned);
const withObjective = observe(directEntries, directBook, directPinned);
const regularRestored = { positions: new Map([...withObjective.positions]
  .filter(([key]) => !key.endsWith(directPinned))) };
assert.deepEqual(regularRestored.positions, direct.positions);

// Removing a duplicate's original withdraws the safe-mission marker. The hut
// must nevertheless stay in its reserved compound instead of snapping to zero.
const reservedObjective = {
  id: 'test-objective',
  center: FILE_OBJECTIVE_POSITIONS[0],
  targets: [{ ...directEntries[0], position: FILE_OBJECTIVE_POSITIONS[0] }],
};
const objectivePage = withObjective.pages[0];
const activeBlocks = renderedBlocks(objectivePage.entries, reservedObjective,
  objectivePage.layoutEntries, reservedObjective);
const withdrawnBlocks = renderedBlocks(objectivePage.entries, null,
  objectivePage.layoutEntries, reservedObjective);
assert.deepEqual(withdrawnBlocks.allBlocks.map(block => block.position),
  activeBlocks.allBlocks.map(block => block.position),
  'Withdrawing a mission must not move its hut or any surrounding huts');
assert.equal(withdrawnBlocks.allBlocks.find(block => block.path === directPinned).isObjective, false);
assert.equal(activeBlocks.allBlocks.find(block => block.path === directPinned).isObjective, true);

// Defensive late mission selection cannot overflow a full sector or strand a
// newly scanned objective. No ordinary plot is displaced to make room for it.
const lateEntries = fixture(160);
const lateBook = createSectorReservations();
const lateInitial = observe(lateEntries, lateBook);
const lateTarget = { ...lateEntries[0], path: '/sector/new-mission' };
const late = observe([...lateEntries, lateTarget], lateBook, lateTarget.path);
assert.ok(late.pages.some(page => page.entries.some(entry => entry.path === lateTarget.path)));
unchanged(lateInitial, { positions: new Map([...late.positions]
  .filter(([key]) => !key.endsWith(lateTarget.path))) }, 'Late mission reservation must preserve existing plots');

console.log('Stable layout checks passed: deletion, batch deletion, Undo, page boundaries, metadata changes, additions, directory revisit, and mission reservations.');
