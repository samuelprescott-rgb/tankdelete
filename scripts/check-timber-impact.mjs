import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// Use the exported poses of the shipping effect; never substitute a second
// motion formula in the test. Actual coverage/GL pixels are checked separately.
const entry=fileURLToPath(new URL('../src/components/Scene/ImpactPlumes.tsx',import.meta.url));
const result=await build({configFile:false,logLevel:'silent',publicDir:false,
  esbuild:{jsx:'automatic'},build:{ssr:entry,write:false,minify:false}});
const source=result.output.find(v=>v.type==='chunk'&&v.isEntry).code
  .replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {plumePose,splinterPose}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const hitY=3.25, id=6;
for(let k=0;k<12;k++){
  const p=t=>splinterPose(t,k,id,1.08,hitY);
  const start=p(.02),during=p(.75),fallen=p(1.26),end=p(1.54);
  assert.ok(start.side>.42 && start.y>hitY-.35,'readable fragments begin at the actual roof');
  assert.ok(during.y<start.y && fallen.y<=.101,'timber falls towards the ruined structure');
  assert.ok(end.side<start.side*.10 && end.y>=.09,'grounded pieces fade without passing through terrain');
  assert.ok(Math.hypot(during.x,during.z)>Math.hypot(start.x,start.z));
  assert.equal(k<4,start.mark> -3,'large slats and smaller ASCII marks must remain distinct');
  assert.deepEqual(start,p(.02),'reproducible animation independent of frame rate');
  assert.equal(p(1.7),null);
}
assert(plumePose(.58,1.08,0).rise>plumePose(.12,1.08,0).rise,'smoke rises while the roof falls');
assert.equal(splinterPose(-.01,0,1,1,2),null);
console.log('Timber impact: 4 slats and 8 glyphs descend from the surface, stay above ground and fade; the separate smoke rises.');
