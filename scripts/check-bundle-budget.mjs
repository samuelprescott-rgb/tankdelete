import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run after `npm run build`. Count every static entry dependency, not just the
// named entry chunk, so accidental eager engine imports cannot evade the budget.
const dist = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + '/') : new URL('../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', dist), 'utf8'));
const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry);
assert.ok(entries.length > 0, 'Production build must have an entry point');
const initialKeys = new Set();
function visit(key) {
  if (initialKeys.has(key)) return;
  initialKeys.add(key);
  assert.ok(manifest[key], `Missing static dependency: ${key}`);
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
}
for (const [key] of entries) visit(key);

const [gameKey] = Object.entries(manifest).find(([, chunk]) => chunk.src === 'src/GameSession.tsx') ?? [];
assert.ok(gameKey, 'The game session must be emitted as a separate module');
assert.ok(!initialKeys.has(gameKey), 'Home screen must not eagerly load the 3D game session');

for (const file of new Set(Object.values(manifest).map(chunk => chunk.file).filter(file => file.endsWith('.js')))) {
  const contents = await readFile(new URL(file, dist), 'utf8');
  for (const marker of ['QA: clear wave', 'QA: overrun archives', 'QA: napalm pass', 'Drive check · 20s', 'Scene inspection views', 'tankP95FrameMs', 'tankGpuMs', 'foliageOff', 'grassLodReview']) {
    assert.ok(!contents.includes(marker), `Development-only QA control leaked into ${file}: ${marker}`);
  }
}

let rawBytes = 0;
let gzipBytes = 0;
for (const file of new Set([...initialKeys].map(key => manifest[key].file))) {
  const contents = await readFile(new URL(file, dist));
  rawBytes += contents.byteLength;
  gzipBytes += gzipSync(contents).byteLength;
}
assert.ok(rawBytes <= 300_000, `Initial JavaScript ${rawBytes} bytes exceeds the 300 kB menu budget`);
assert.ok(gzipBytes <= 100_000, `Initial compressed JavaScript ${gzipBytes} bytes exceeds the 100 kB menu budget`);
console.log(`Menu bundle: ${(rawBytes / 1000).toFixed(1)} kB raw / ${(gzipBytes / 1000).toFixed(1)} kB gzip. Game session deferred.`);
