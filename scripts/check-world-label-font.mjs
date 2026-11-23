import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fontResolverWorkerModule } from 'troika-three-text';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
async function loadLib(name) {
  const source = await readFile(new URL('src/lib/' + name + '.ts', root), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}
const { WORLD_LABEL_FONT, WORLD_LABEL_PRELOAD, offlineWorldLabel } = await loadLib('worldLabelFont');
assert.match(WORLD_LABEL_FONT, /^\/fonts\/[\w-]+\.ttf$/);
const bytes = await readFile(new URL('public' + WORLD_LABEL_FONT, root));
const license = await readFile(new URL('public/fonts/LICENSE_LIBERATION', root), 'utf8');
assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);

// Run the actual installed Troika parser/resolver on CPU with every network
// transport trapped. Only the exact local TTF can supply font data.
const xhr = [], fetches = [];
globalThis.self = globalThis;
globalThis.fetch = url => { fetches.push(url); return new Promise(() => {}); };
globalThis.XMLHttpRequest = class {
  status = 200;
  open(_method, url) { xhr.push(url); }
  send() { this.response = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length); this.onload(); }
};
async function resolve(text) {
  let result;
  await fontResolverWorkerModule(text, value => { result = value; }, { fonts: [{ src: WORLD_LABEL_FONT }] });
  assert.deepEqual(fetches, [], 'Troika attempted Unicode CDN resolution');
  assert.deepEqual(xhr, [WORLD_LABEL_FONT], 'Only the bundled font may be requested, once');
  assert.deepEqual(result?.fonts.map(font => font.src), [WORLD_LABEL_FONT], 'All runs must resolve offline');
  return result.fonts[0];
}
const font = await resolve(WORLD_LABEL_PRELOAD);
// Catch stale coverage after a font change, including an unrepresented but
// actually available glyph. This TTF has only BMP glyphs.
for (let code = 0; code <= 0xffff; code++) {
  const char = String.fromCharCode(code);
  if (char === '\n') continue;
  assert.equal(offlineWorldLabel(char) === char, font.supportsCodePoint(code), 'Incorrect coverage U+' + code.toString(16));
}
const { createCampaignFixtures } = await loadLib('campaignFixtures');
const { TRAINING_ENTRIES } = await loadLib('training');
const { EMBASSY_ARCHIVE_SLOTS } = await loadLib('embassyDefense');
const { formatBytes } = await loadLib('format');
const labels = new Set(['BACK', 'U.S. EMBASSY // NIGHTMARE', WORLD_LABEL_PRELOAD]);
for (const [path, { children }] of createCampaignFixtures().directories) {
  labels.add(path.split('/').at(-1));
  for (const entry of children) {
    labels.add(entry.name);
    labels.add(`ARMED · ${entry.name}`);
    labels.add(`DEFEND // ${entry.name}`);
    labels.add(`LOST // ${entry.name}`);
    if (entry.is_dir) labels.add(`${entry.name}\n12 items · ${formatBytes(1234567890)}`);
  }
}
for (const { name } of TRAINING_ENTRIES) labels.add(`ARMED · ${name}`);
for (const { label } of EMBASSY_ARCHIVE_SLOTS) labels.add(`DEFEND // ${label}`);
for (const text of labels) {
  assert.equal(offlineWorldLabel(text), text, 'Game labels must not need substitution: ' + text);
  await resolve(text);
}
font.forEachGlyph([...new Set([...labels].join(''))].filter(char => !/\s/u.test(char)).join(''), 1, 0,
  glyph => assert.ok(glyph.index > 0 && glyph.path.length && glyph.advanceWidth > 0, 'Expected a visible glyph outline'));
assert.equal(offlineWorldLabel('München — 🛰'), 'München — [U+1F6F0]');
for (const text of ['', '\nrelay', 'München — 🛰']) await resolve(offlineWorldLabel(text));

const scene = new URL('src/components/Scene/', root);
for (const name of await readdir(scene)) {
  if (!name.endsWith('.tsx') || name === 'WorldLabel.tsx') continue;
  const source = await readFile(new URL(name, scene), 'utf8');
  assert.doesNotMatch(source, /import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*['"]@react-three\/drei/,
    name + ': use WorldLabel so the default CDN stays unreachable');
}
const wrapper = await readFile(new URL('WorldLabel.tsx', scene), 'utf8');
assert.match(wrapper, /font=\{WORLD_LABEL_FONT\}/);
assert.match(wrapper, /characters=\{WORLD_LABEL_PRELOAD\}/);
assert.match(wrapper, /offlineWorldLabel\(children\)/);
console.log(`World font: ${labels.size} unchanged fixture labels, verified glyph coverage, one packaged TTF, no external requests.`);
