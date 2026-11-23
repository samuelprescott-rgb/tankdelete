// Fixed 1080p river chase only. Pair this measurement with visual review; a
// black paddy would also have no glare and is not a passing art treatment.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
const [reference, candidate] = process.argv.slice(2);
assert(reference && candidate, 'Usage: node scripts/check-paddy-glint.mjs reference-river-chase.png candidate-river-chase.png');
const roi = {left:245, top:834, width:320, height:125};
async function measure(path) {
  const {width,height} = await sharp(path).metadata();
  assert.deepEqual([width,height],[1920,1080], 'Use matched native gameplay captures');
  const data = await sharp(path).extract(roi).removeAlpha().raw().toBuffer();
  const light = [];
  for(let i=0;i<data.length;i+=3) light.push(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);
  light.sort((a,b)=>a-b);
  return {p50:light[light.length>>1], p95:light[Math.floor(.95*light.length)],
    p99:light[Math.floor(.99*light.length)], fractionAbove205:light.filter(v=>v>205).length/light.length};
}
const before=await measure(reference), after=await measure(candidate);
console.log(JSON.stringify({reference,candidate,roi,before,after}));
assert(after.fractionAbove205 < .035, 'Rice-paddy specular plateau still competes with the crossing');
assert(after.p50>22 && after.p95-after.p50>13, 'Suppressing the reflection must not erase the paddy values');
