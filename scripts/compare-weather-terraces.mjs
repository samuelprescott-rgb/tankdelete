// Two unretouched, fixed-camera full-resolution comparisons. The animated
// weather isn't phase locked; do not use their pixel difference as a rain count.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const sharp=createRequire(import.meta.url)('sharp');
const root=new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/game/',import.meta.url);
const [a,b]=process.argv.slice(2);
assert([a,b].every(s=>/^micro-r\d+$/.test(s))&&a!==b);
const dirs=[a,b],records=await Promise.all(dirs.map(id=>readFile(new URL(id+'/receipt.json',root),'utf8').then(JSON.parse)));
assert(records.every(r=>r.pass)&&records[0].builds[0]!==records[1].builds[0]);
const plates=[],manifest=[];
for(const [row,[name,crop]] of [
  ['river-chase',{left:1030,top:126,width:660,height:300}],
  ['embassy-facade',{left:370,top:230,width:660,height:300}],
].entries()){
 const shots=records.map(r=>r.shots.find(s=>s.id===name));assert(shots.every(s=>s.canvas.join('x')==='1920x1080'));
 assert(Math.hypot(...shots[0].eye.map((n,i)=>n-shots[1].eye[i]))<.002,'camera movement too large');
 for(const [col,id] of dirs.entries()){
  const input=await readFile(new URL(id+'/'+name+'.png',root));assert.equal(createHash('sha256').update(input).digest('hex'),shots[col].sha256);
  plates.push({input:await sharp(input).extract(crop).png().toBuffer(),left:col*662,top:row*302});
  manifest.push({scene:name,stage:id,source:shots[col].sha256,crop});
 }
}
await sharp({create:{width:1322,height:602,channels:3,background:'#26343a'}}).composite(plates).png().toFile(new URL(b+'/weather-and-hills.png',root).pathname);
await writeFile(new URL(b+'/weather-and-hills.json',root),JSON.stringify(manifest,null,2));
