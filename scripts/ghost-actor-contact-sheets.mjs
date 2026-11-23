// Presentation only; original 1920x1080 PNGs remain untouched alongside.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const sharp=createRequire(import.meta.url)('sharp');
const root=new URL('../tmp/production-qa/ghost-phase2-actors/',import.meta.url).pathname;
const after=JSON.parse(await readFile(root+'after/report-all.json','utf8'));
assert.equal(after.errors.length,0);assert.equal(after.shots.length,4);
const hash=after.shots[0].bundle.split('/').pop();assert(after.shots.every(s=>s.bundle.endsWith(hash)));
for(const [output,rows] of [
 ['infantry-comparison',[['us','US radio operator'],['vc','VC rifleman in cover']]],
 ['boss-comparison',[['boss','Wave 4 / front'],['boss-rear','Wave 4 / rear']]],
]){
 const w=760,h=428,label=32,parts=[];
 for(let i=0;i<rows.length;i++)for(const [col,stage] of ['before','after'].entries()){
  const [name,caption]=rows[i],source=root+stage+'/'+name+'.png',meta=await sharp(source).metadata();
  assert.equal(meta.width,1920);assert.equal(meta.height,1080);
  parts.push({input:Buffer.from(`<svg width="${w}" height="${label}"><rect width="100%" height="100%" fill="#172429"/><text x="14" y="22" font-size="16" font-family="Helvetica,Arial,sans-serif" fill="#e2e7d3">${stage.toUpperCase()}  /  ${caption}</text></svg>`),top:(h+label)*i,left:w*col});
  parts.push({input:await sharp(source).resize(w,h,{fit:'fill'}).removeAlpha().png().toBuffer(),top:(h+label)*i+label,left:w*col});
 }
 await sharp({create:{width:w*2,height:(h+label)*rows.length,channels:3,background:'#172429'}}).composite(parts).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(root+output+'.jpg');
}
console.log('Two matched photo plates composed from real production shots: '+hash);
