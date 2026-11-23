// Fixed, ungraded production captures; the only processing is matching crops/resizing.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sharp=createRequire(import.meta.url)('sharp'),[original,retained,out]=process.argv.slice(2).map(p=>resolve(p));
const refs=await Promise.all([original,retained].map(s=>readFile(join(s,'field-heroes.json'),'utf8').then(JSON.parse)));
assert.notEqual(refs[0][0].bundle.split('/').at(-1),refs[1][0].bundle.split('/').at(-1));
const groups={armor:[['tank-bow','Red shark bow'],['tank-flank','Turret and stowage']],infantry:[['us','Radio operator'],['river-hero','Rifleman']]};
const report={method:'Same actor-local camera offsets and lens; original gameplay canvas; no lighting or poses edited. Different moments of the live animation.',evidence:[]};
for(const [group,views] of Object.entries(groups)){
 const layers=[];const W=850,H=478,B=35;
 for(const [i,[id,label]] of views.entries())for(const [j,dir] of [original,retained].entries()){
  const a=refs[0].find(x=>x.file===id),b=refs[1].find(x=>x.file===id);
  for(const k of ['name','eye','aim'])assert.deepEqual(a[k],b[k]);
  const bytes=await readFile(join(dir,id+'.png')),meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();
  assert.equal(meta.width,1920);assert.equal(meta.height,1080);assert(stats.entropy>2 && (!meta.hasAlpha || stats.channels.at(-1).mean>249),'Empty, transparent or invalid hero frame: '+id);
  const svg=Buffer.from('<svg width="'+W+'" height="'+B+'"><rect width="100%" height="100%" fill="#172127"/><text x="14" y="25" fill="#f0dfbd" font-size="19" font-family="Helvetica">'+(j?'CANDIDATE':'BEFORE')+' / '+label+'</text></svg>');
  layers.push({input:svg,left:j*W,top:i*(H+B)},{input:await sharp(bytes).resize(W,H).png().toBuffer(),left:j*W,top:i*(H+B)+B});
  report.evidence.push({id,file:join(dir,id+'.png'),expectedAsset:j?b.bundle:a.bundle,sha256:createHash('sha256').update(bytes).digest('hex'),entropy:stats.entropy});
 }
 await sharp({create:{width:W*2,height:(H+B)*2,channels:3,background:'#172127'}}).composite(layers).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(join(out,group+'-before-after.jpg'));
}
await writeFile(join(out,'hero-comparison.json'),JSON.stringify(report,null,2));
