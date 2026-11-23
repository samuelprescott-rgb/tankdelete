// From the project root: node scripts/compose-review-plates.mjs NEW.jpg tmp/production-qa/hero-comparison-XXXXXX/VIEW.png [...]
// Ordered full-frame evidence only: before on the left, after on the right.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const qa = path.join(repo, 'tmp/production-qa');
const [output, ...inputs] = process.argv.slice(2);
if (!/^[\w-]+\.jpg$/i.test(output ?? '') || !inputs.length)
  throw Error('Supply a new .jpg basename followed by ordered comparison PNG paths.');
const ff = (...args) => execFileSync('ffmpeg', ['-nostdin', '-v', 'error', ...args], {maxBuffer: 32 * 1024 * 1024});
const pixelHash = (...args) => ff(...args, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'hash', '-hash', 'sha256', 'pipe:1').toString();
const stack = '[0:v]scale=800:450:flags=lanczos[a];[1:v]scale=800:450:flags=lanczos[b];[a][b]hstack=inputs=2';
const rows = [];
for (const input of inputs) {
  const row = path.resolve(input), dir = path.dirname(row), file = path.basename(row);
  if (path.dirname(dir) !== qa || !/^hero-comparison-[\w-]+$/.test(path.basename(dir)) || !/^[a-z0-9-]+\.png$/.test(file))
    throw Error('Expected an ordered comparison PNG directly inside its result directory: ' + input);
  const key = JSON.parse(await readFile(path.join(dir, 'comparison-key.json'), 'utf8'));
  const view = key.views.find(v => v.name + '.png' === file);
  if (view?.sources?.length !== 2) throw Error('No matching before/after hashes: ' + input);
  const originals = [];
  for (const [i, name] of [key.beforeDir, key.afterDir].entries()) {
    if (typeof name !== 'string' || !/^[\w-]+$/.test(name)) throw Error('Invalid capture directory in key.');
    const original = path.join(qa, name, file);
    if (createHash('sha256').update(await readFile(original)).digest('hex') !== view.sources[i])
      throw Error('Original no longer matches its comparison key: ' + original);
    originals.push(original);
  }
  // The key signs the originals, not the panels. Check every ordered pixel too.
  const png = await readFile(row);
  if (png.readUInt32BE(16) !== 1600 || png.readUInt32BE(20) !== 450 ||
      pixelHash('-i', row) !== pixelHash('-i', originals[0], '-i', originals[1], '-filter_complex', stack))
    throw Error('Panel is not the ordered, unaltered comparison of those captures: ' + input);
  rows.push(row);
}

const args = rows.flatMap(row => ['-i', row]);
const join = rows.map((_, i) => '[' + i + ':v]').join('') + 'vstack=inputs=' + rows.length;
if (rows.length > 1) args.push('-filter_complex', join);
const jpg = ff(...args, '-frames:v', '1', '-q:v', '2', '-pix_fmt', 'yuvj444p', '-c:v', 'mjpeg', '-f', 'image2pipe', 'pipe:1');
const destination = path.join(repo, 'screenshots', output);
await writeFile(destination, jpg, {flag: 'wx'});
console.log(destination + ' (left: BEFORE; right: AFTER)');
