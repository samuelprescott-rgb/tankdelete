import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// Read only this project's source/config for the harness. Test inputs never
// become host paths. Game modules run without Node, network or picker access.
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
let hostCalls = 0;
const forbidden = () => { hostCalls++; throw new Error('Unexpected host API call'); };
const bridge = { invoke: forbidden, open: forbidden };
const browser = {
  __TAURI_INTERNALS__: bridge, __TAURI__: bridge, fetch: forbidden,
  showDirectoryPicker: forbidden, showOpenFilePicker: forbidden, showSaveFilePicker: forbidden,
};
const context = vm.createContext({ ...browser, window: browser }, {
  codeGeneration: { strings: false, wasm: false },
});
const modules = new Map();
function load(path, imports = {}) {
  const { outputText } = ts.transpileModule(source(path), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  const resolve = id => {
    if (Object.hasOwn(imports, id)) return imports[id];
    if (modules.has(id)) return modules.get(id);
    throw new Error('Unexpected game module dependency: ' + id);
  };
  vm.compileFunction(outputText, ['exports', 'require'], { parsingContext: context, filename: path })(exports, resolve);
  return exports;
}
for (const name of ['campaignFixtures', 'tauri-commands', 'constants', 'arenaBounds', 'terrain', 'mission', 'training']) {
  modules.set('./' + name, load('src/lib/' + name + '.ts'));
}
const { commands, createSimulatedCommands, getSimulatedParent, CAMPAIGN_ROOT } = modules.get('./tauri-commands');
const { createFileObjective, getFileObjectiveProgress } = modules.get('./mission');
const { createTrainingEntries } = modules.get('./training');
const stats = async (store = commands) => Array.from(await store.getSessionStats());

assert.equal(await commands.pickDirectory(), CAMPAIGN_ROOT);
assert.equal(getSimulatedParent(CAMPAIGN_ROOT), null);
assert.equal(await commands.getLastDirectory(), null);
assert.equal(await commands.undoLastTrash(), null);
const seen = new Set();
async function visit(directory) {
  assert.ok(!seen.has(directory), 'No cycles or duplicate directories');
  seen.add(directory);
  const entries = await commands.scanDirectory(directory);
  assert.equal(commands.countChildren(directory), entries.length);
  const mission = createFileObjective(entries, directory);
  assert.equal(mission.targets.length, 1);
  assert.equal(getFileObjectiveProgress(mission, entries).phase, 'active');
  for (const entry of entries) {
    assert.equal(entry.path, directory + '/' + entry.name, 'No recursively leaked entries');
    if (entry.is_dir) {
      assert.equal(getSimulatedParent(entry.path), directory);
      await visit(entry.path);
    }
  }
}
await visit(CAMPAIGN_ROOT);
assert.ok([...seen].some(path => getSimulatedParent(getSimulatedParent(path)) === CAMPAIGN_ROOT), 'Nested navigation');
const child = [...seen].find(path => getSimulatedParent(path) === CAMPAIGN_ROOT);
await commands.saveLastDirectory(child);
const invalid = ['/', '..', '.', 'sim://', CAMPAIGN_ROOT + '/', CAMPAIGN_ROOT + '/Relay/../Vault',
  CAMPAIGN_ROOT + '/%2e%2e', CAMPAIGN_ROOT + '/made-up.txt', 'file:///not-a-real-file',
  'C:\\fictional\\bogus', '\u0000', '__proto__', '/fictional-test-input/no-such-sector'];
for (const path of invalid) {
  assert.equal(getSimulatedParent(path), null);
  assert.throws(() => commands.countChildren(path));
  await assert.rejects(commands.scanDirectory(path));
  await assert.rejects(commands.saveLastDirectory(path));
  await assert.rejects(commands.moveToTrash(path));
}
assert.equal(await commands.getLastDirectory(), child);
assert.deepEqual(await stats(), [0, 0]);
const rootEntries = await commands.scanDirectory(CAMPAIGN_ROOT);
const copy = rootEntries.find(entry => entry.safe_duplicate_of);
const original = rootEntries.find(entry => entry.path === copy.safe_duplicate_of);
const regular = rootEntries.find(entry => !entry.is_dir && entry !== original && entry !== copy);
await assert.rejects(commands.scanDirectory(original.path));
await assert.rejects(commands.moveToTrash(child));
await assert.rejects(commands.moveToTrash(copy.path, 'file:///never-open-this'));
await assert.rejects(commands.moveToTrash(copy.path, copy.path));
await assert.rejects(commands.moveToTrash(copy.path, regular.path));
await commands.moveToTrash(original.path);
await assert.rejects(commands.moveToTrash(copy.path, original.path), 'Missing retained original');
await commands.undoLastTrash();

const rootMission = createFileObjective(rootEntries, CAMPAIGN_ROOT);
const change = await commands.moveToTrash(copy.path, original.path);
change.file_path = 'tampered-return';
await assert.rejects(commands.moveToTrash(copy.path));
assert.equal(getFileObjectiveProgress(rootMission, await commands.scanDirectory(CAMPAIGN_ROOT)).phase, 'complete');
const other = (await commands.scanDirectory(child)).find(entry => !entry.is_dir && !entry.safe_duplicate_of);
const before = commands.countChildren(child);
await commands.moveToTrash(other.path);
assert.equal(commands.countChildren(child), before - 1);
assert.deepEqual(await stats(), [2, copy.size + other.size]);
assert.equal((await commands.undoLastTrash()).file_path, other.path, 'Undo across sectors is LIFO');
assert.equal((await commands.undoLastTrash()).file_path, copy.path, 'History is not mutable via action return values');
assert.equal(getFileObjectiveProgress(rootMission, await commands.scanDirectory(CAMPAIGN_ROOT)).phase, 'active');
assert.equal(await commands.undoLastTrash(), null);
copy.name = 'tampered-listing';
assert.notEqual((await commands.scanDirectory(CAMPAIGN_ROOT)).find(entry => entry.path === copy.path).name, copy.name);

// Drive the real mark/confirm hook with just its two React state primitives.
// Without confirmation, a marked (or disarmed) target remains in the store.
let slot = 0;
const state = [];
const react = {
  useState(initial) {
    const i = slot++;
    if (!(i in state)) state[i] = initial;
    return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }];
  },
  useRef(initial) {
    const i = slot++;
    return state[i] ??= { current: initial };
  },
};
const { useMarkedFiles } = load('src/hooks/useMarkedFiles.ts', { react, '../lib/tauri-commands': modules.get('./tauri-commands') });
const renderHook = () => { slot = 0; return useMarkedFiles(); };
renderHook().markFile(regular.path);
assert.equal(renderHook().isMarked(regular.path), true);
assert.deepEqual(await stats(), [0, 0]);
renderHook().clearMarked();
assert.equal(renderHook().isMarked(regular.path), false);
assert.deepEqual(Array.from(await renderHook().deleteAllMarked()), []);
renderHook().markFile(regular.path);
assert.deepEqual(Array.from(await renderHook().deleteAllMarked()), [regular.path]);
assert.deepEqual(await stats(), [1, regular.size]);
assert.deepEqual(await stats(createSimulatedCommands()), [0, 0], 'Separate game instances have separate state');
assert.equal(createFileObjective(createTrainingEntries()).targets.length, 1, 'Boot Camp still has a valid fictional objective');
commands.resetSession();
assert.deepEqual(await stats(), [0, 0]);
assert.equal((await commands.scanDirectory(CAMPAIGN_ROOT)).length, rootEntries.length);
assert.equal(await commands.getLastDirectory(), null);
assert.equal(await commands.undoLastTrash(), null);
assert.equal(hostCalls, 0, 'No bridge or picker used on any success or rejection path');

// Guard against re-enabling old operations in the actual desktop entry point.
for (const path of ['src-tauri/src/main.rs']) {
  const rust = source(path).replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(rust, /\b(?:mod|include|invoke_handler|generate_handler|plugin|setup|manage|std::fs)\b/, path);
}
const cap = JSON.parse(source('src-tauri/capabilities/default.json'));
const config = JSON.parse(source('src-tauri/tauri.conf.json'));
assert.deepEqual(cap.permissions, []);
assert.deepEqual(config.app.security.capabilities, [cap.identifier,'cleanup-mac']);
const restricted=JSON.parse(source('src-tauri/capabilities/cleanup-mac.json'));
assert.deepEqual(restricted.platforms,['macOS']);
assert.deepEqual(restricted.windows,['main']);
assert.deepEqual(restricted.permissions,['allow-cleanup-pick','allow-cleanup-review','allow-cleanup-forget']);
assert.equal(restricted.local,true); assert.equal(restricted.remote,undefined);
assert.doesNotMatch(source('src-tauri/src/lib.rs'),/\bmod\s+(?:commands|store|trash|directory)\b/);
assert.match(source('src-tauri/src/cleanup.rs'),/url\.scheme\(\)=="tauri"/);
assert.equal(config.app.windows[0].dragDropEnabled, false);
assert.doesNotMatch(source('src-tauri/Cargo.toml'), /tauri-plugin-|^trash\s*=|^walkdir\s*=/m);
assert.doesNotMatch(source('src-tauri/Cargo.lock'), /^name = "(?:tauri-plugin-[^"]+|trash)"/m);
for (const name of Object.keys(JSON.parse(source('package.json')).dependencies)) assert.doesNotMatch(name, /^@tauri-apps\//);
const sourceDir = fileURLToPath(new URL('../src', import.meta.url));
for (const path of ts.sys.readDirectory(sourceDir, ['.tsx', '.ts'])) {
  // A browser-only picker or alternate bridge in the UI would bypass the tested store.
  const code=readFileSync(path,'utf8');
  assert.doesNotMatch(code, /@tauri-apps\/|node:fs|\b(?:showDirectoryPicker|showOpenFilePicker|showSaveFilePicker|webkitdirectory|FileReader|FileSystemFileHandle|getAsFileSystemHandle)\b|\btype\s*=\s*['"]file['"]/,path);
  if(!path.endsWith('/lib/cleanupDesk.ts')) assert.doesNotMatch(code,/__TAURI/,path);
}
console.log('PASS: four synthetic sectors, missions, bounded navigation, mark/confirm, virtual trash, undo and reset; zero host calls during play. Separate packaged-Mac-only picker/review capability.');
