import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
async function load(file) {
  const source = await readFile(new URL('../src/'+file,import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
  const m={};new Function('exports','require',outputText)(m,require);return m;
}
const {ghostSliceWeight:w, ghostInkStrength:ink, inGhostRiverHutPlot:plots, ghostPreviewFromSearch:entry,
  GHOST_RIVER_START:river, GHOST_EMBASSY_START:embassy} = await load('lib/ghostSignal.ts');
for (const [xyz,night] of [[river,false],[embassy,true]]) assert.ok(w(xyz[0],xyz[2],night)>.9);
assert.equal(w(40,16,false),0); assert.equal(w(0,-25,false),0);
assert.equal(w(0,24,true),0); assert.equal(w(NaN,0,false),0);
for (let i=0;i<6;i++) assert.ok(w(14+i,16,false)>w(15+i,16,false));
assert.ok(plots(-5.5,7)); assert.ok(!plots(0,40)); assert.ok(!plots(27.75,22));
assert.ok(ink(false)>0 && ink(false)<.35 && ink(true)<.5);
const compositor=await readFile(new URL('../src/components/Scene/PostProcessing.tsx',import.meta.url),'utf8');
assert.doesNotMatch(compositor,/Pixelation|ghostSliceWeight|tankRef/,'gameplay compositor must not switch resolution by position');
assert.equal(entry('?ghostSignal=river'),'river'); assert.equal(entry('?ghostSignal=embassy'),'embassy');
for(const query of ['', '?sceneReview=1','?ghostSignal=directory','?ghostSignal=/tmp'])assert.equal(entry(query),undefined);
const {createGhostPalette}=await load('components/Scene/ghostPalette.ts');
const t=createGhostPalette(), a=t.image.data;
assert.equal(t.image.width,32);assert.equal(a.length,32**3*4);
const rgb=(r,g,b)=>Array.from(a.slice(4*(r+32*g+32*32*b),4*(r+32*g+32*32*b)+3));
const night=rgb(3,4,6), teeth=rgb(29,29,26), mouth=rgb(23,8,6);
assert.ok(night[2]>night[0] && Math.max(...night)<70);
assert.ok(teeth.every(v=>v>195));assert.ok(mouth[0]>mouth[1]*1.5 && mouth[0]>mouth[2]*1.5);
t.dispose();
console.log('PASS Ghost Signal: continuous artwork grade, no pixel-grid pass, practice spawns and camera shoulder, and night / shark / ivory palette ramps.');
