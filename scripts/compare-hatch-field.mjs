// Contact sheet of crops from the actual full-HUD screenshots. The first
// three have identical crop scale; the drive-up is native screenshot scale.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {constants} from 'node:fs';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import * as T from 'three';
import {sampleHatchWood} from './hatch-wood-samples.mjs';
const sharp=createRequire(import.meta.url)('sharp');
const [a,b,published]=process.argv.slice(2).map(p=>resolve(p));assert(a&&b&&a!==b);
const ids=['01-closed','02-lifting','03-open','04-driven-close'],labels=['Closed','Lifting','Open','Driven approach'];
const W=1800,H=813,pw=428,ph=300,layers=[],measurements=[];
let titles='';
const line=(x,y,size,t,color='#e4e5d6')=>{titles+='<text x="'+x+'" y="'+y+'" fill="'+color+'" font-family="Helvetica, sans-serif" font-size="'+size+'">'+t+'</text>';};
line(20,40,29,'Tunnel camouflage · production tank camera');line(20,68,16,'Crops of full 1920 × 1080 campaign frames. Same bank, site and approach; live actors and precise parking positions differ.');
for(const [row,dir] of [a,b].entries()){
  const r=JSON.parse(await readFile(join(dir,'receipt.json'),'utf8'));assert(r.pass&&!r.study,'Use frozen captures only; never publish a temporary look study');
  assert.deepEqual(r.shots['03-open'].before.site,[8,.07,7],'Compare the same real hatch');
  const keep=published?join(dirname(published),row?'after':'before','hatch'):null;
  if(keep){await mkdir(keep,{recursive:true});await copyFile(join(dir,'receipt.json'),join(keep,'receipt.json'));}
  line(20,106+row*350,19,(row?'Revised':'Before')+'  /  '+r.bundle);
  for(const [i,id] of ids.entries()){
    const path=join(dir,id+'.png'),{width,height}=await sharp(path).metadata();assert(width===1920&&height===1080);
    const snap=r.shots[id],bounds=snap.before.box.map((v,k)=>(v+snap.after.box[k])/2),
      cx=(bounds[0]+bounds[2])/2,cy=(bounds[1]+bounds[3])/2,sw=i===3?428:214,sh=i===3?300:150,
      x=T.MathUtils.clamp(Math.round(cx-sw/2),0,width-sw),y=T.MathUtils.clamp(Math.round(cy-sh/2),0,height-sh);
    const crop=await sharp(path).extract({left:x,top:y,width:sw,height:sh}).resize(pw,ph,{kernel:'nearest'}).png().toBuffer();
    if(keep)await copyFile(path,join(keep,id+'.png'),constants.COPYFILE_FICLONE);
    const left=20+(pw+15)*i,top=118+350*row;layers.push({input:crop,left,top});line(left,top+ph+19,16,labels[i]+(i===3?' · native':' · 2×'));
    // The lattice is the visibly straw-coloured offender. Project the middle
    // of eleven transverse-spaced cane strips at four heights. Sampling
    // the original HUD keeps fog, shading and the final grade in the result.
    if(i!==3)continue;
    measurements.push({bundle:r.bundle,...await sampleHatchWood(path,snap)});
  }
}
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'">'+titles+'</svg>');
layers.push({input:svg,left:0,top:0});
await sharp({create:{width:W,height:H,channels:3,background:'#17201d'}}).composite(layers).png().toFile(join(b,'hatch-comparison.png'));
if(published){
  await sharp(join(b,'hatch-comparison.png')).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toFile(published);
  await writeFile(join(dirname(published),'hatch-screen-samples.json'),JSON.stringify(measurements,null,2)+'\n');
}
await writeFile(join(b,'hatch-screen-samples.json'),JSON.stringify(measurements,null,2)+'\n');console.log(measurements);
