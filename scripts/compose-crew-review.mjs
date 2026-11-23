// Match ungraded, original production frames by role and verify the source bytes.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sharp=createRequire(import.meta.url)('sharp');
const [before,after]=process.argv.slice(2).map(s=>resolve(s));
const roots=[before,after], reports=await Promise.all(roots.map(d=>readFile(join(d,'named-allies.json'),'utf8').then(JSON.parse)));
for(const report of reports){assert.equal(report.shots.length,6);assert.deepEqual(report.errors,[]);}
assert.notEqual(reports[0].dist,reports[1].dist);
const layers=[],W=612,H=344,B=30;
for(const [row,role] of ['boss-ally-atlas','boss-ally-sagamore','boss-ally-redwood'].entries())for(const [col,d] of roots.entries()){
  const shot=reports[col].shots.find(v=>v.id===role&&v.view==='portrait');assert(shot?.bodyDrawObserved);
  const bytes=await readFile(join(d,role+'-portrait.png'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),shot.sha256);
  const meta=await sharp(bytes).metadata();assert.equal(meta.width,1920);assert.equal(meta.height,1080);
  const title=Buffer.from('<svg width="612" height="30"><rect width="100%" height="100%" fill="#162128"/><text x="12" y="22" fill="#f4dcaf" font-size="17" font-family="Helvetica">'+(col?'AFTER':'BEFORE')+' / '+shot.name+'</text></svg>');
  layers.push({input:title,left:col*W,top:row*(B+H)},{input:await sharp(bytes).resize(W,H).png().toBuffer(),left:col*W,top:row*(B+H)+B});
}
await sharp({create:{width:2*W,height:3*(H+B),channels:3,background:'#162128'}}).composite(layers)
  .jpeg({quality:95,chromaSubsampling:'4:4:4'}).toFile(join(after,'portraits-before-after.jpg'));
