// Inspect the actual gameplay photos and include native-pixel crops, drawn
// only from the full frames. No retouching, target cut-outs or fake backdrops.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createRequire} from 'node:module';
import {randomInt} from 'node:crypto';
const sharp=createRequire(import.meta.url)('sharp');
const [oldDir,newDir,folder]=process.argv.slice(2).map(x=>resolve(x)),dirs=[oldDir,newDir];
await mkdir(folder,{recursive:true});
const runs=await Promise.all(dirs.map(async d=>JSON.parse(await readFile(join(d,'receipt.json')))));
assert(runs.every(r=>r.followThrough&&!r.errors.length&&r.still.opacity>.87&&r.still.bounds[0]>=24&&r.still.bounds[1]>=24&&r.still.bounds[2]<=1896&&r.still.bounds[3]<=1056));
assert(Math.abs(runs[0].still.phase-runs[1].still.phase)<.12);
const W=646,H=363,G=6;const word=(w,h,txt,size=17)=>Buffer.from('<svg width="'+w+'" height="'+h+'"><text x="10" y="'+(h*.71)+'" font-family="Helvetica" font-size="'+size+'" fill="#e0e5df">'+txt+'</text></svg>');
const lens=await Promise.all(dirs.map(async(d,i)=>{
  const raw=await readFile(join(d,'windup-full.png')),m=await sharp(raw).metadata();
  assert(m.width===1920&&m.height===1080);
  const [l,t,r,b]=runs[i].still.bounds;
  const width=Math.min(950,Math.max(660,...runs.map(x=>Math.ceil(x.still.bounds[2]-x.still.bounds[0]+80))));
  const height=Math.min(740,Math.max(370,...runs.map(x=>Math.ceil(x.still.bounds[3]-x.still.bounds[1]+70))));
  const left=Math.max(0,Math.min(m.width-width,Math.floor((l+r-width)/2))),top=Math.max(0,Math.min(m.height-height,Math.floor((t+b-height)/2)));
  assert(l-left>0&&t-top>0&&r-left<width&&b-top<height);
  return [await sharp(raw).resize(W,H).png().toBuffer(),await sharp(raw).extract({left,top,width,height}).resize(W,Math.round(height*W/width)).png().toBuffer()];
}));
const flip=randomInt(2),H2=(await sharp(lens[0][1]).metadata()).height;assert.equal(H2,(await sharp(lens[1][1]).metadata()).height);
for(const blind of [false,true]){
  const stack=[{input:word(2*W+G,40,'Wave four  /  Striking hand at the top of the wind-up',23),left:0,top:0}];
  for(let j=0;j<2;j++){const i=blind&&flip?1-j:j,x=j*(W+G);
    stack.push({input:word(W,28,blind?['A','B'][j]:['BEFORE','AFTER'][j]),left:x,top:40},
      {input:lens[i][0],left:x,top:68},{input:lens[i][1],left:x,top:68+H+G});}
  await sharp({create:{width:2*W+G,height:68+H+G+H2,channels:3,background:'#142027'}}).composite(stack).png().toFile(join(folder,(blind?'blind-':'')+'boss-windup.png'));
}
await writeFile(join(folder,'strike-pair.json'),JSON.stringify({flip,rows:runs.map((r,i)=>({dir:relative(folder,dirs[i]),bundle:r.bundle,phase:r.still.phase,windUp:r.still.elapsedWindup,bounds:r.still.bounds,opacity:r.still.opacity,sha256:r.sha256}))},null,2));
const page=join(folder,'index.html'),tag='<!-- strike-proof -->';
const html=(await readFile(page,'utf8')).split(tag)[0];
await writeFile(page,html+tag+'<h2>Actual boss swing</h2><p>Matched attack phase, using the same player-facing lens. The lower row is taken from the full frames above, with the same crop size on each side.</p><img src="boss-windup.png"><p>'+dirs.map((d,i)=>'<a href="'+relative(folder,join(d,'strike.mp4'))+'">'+['Before','After'][i]+' · gameplay clip</a>').join(' / ')+'</p>');
