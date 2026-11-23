// Count bright display-referred pixels in the same inclusive paddy ROI of two original 1080p captures.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sharp=createRequire(import.meta.url)('sharp');
const root=new URL('../../TankDelete-Concepts/ghost-atmosphere/',import.meta.url);
const [first,second]=process.argv.slice(2);assert([first,second].every(x=>/^(before|before-matched-chase|after|round\d+)$/.test(x)));
const left=245,top=834,width=321,height=126,total=width*height;
const report={subject:'river-chase.png',coordinates:'Inclusive x=245..565, y=834..959 in original 1920x1080, top-left origin',method:'Rec.709 display luma = .2126 R + .7152 G + .0722 B, 8-bit sRGB, strict >205; not linear-light luminance',total,stages:[]};
for(const stage of [first,second]){
 const r=JSON.parse(await readFile(new URL(stage+'/receipt.json',root),'utf8')),rec=r.shots.find(s=>s.id==='river-chase');
 const buff=await readFile(new URL(stage+'/river-chase.png',root));assert(r.pass);assert.deepEqual(rec.canvas,[1920,1080]);assert.equal(createHash('sha256').update(buff).digest('hex'),rec.sha256);
 const {data,info}=await sharp(buff).removeAlpha().extract({left,top,width,height}).raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,3);let bright=0;
 for(let i=0;i<data.length;i+=3)if(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722>205)bright++;
 report.stages.push({stage,bundle:rec.bundle,sha256:rec.sha256,cameraEye:rec.eye,bright,percent:100*bright/total});
}
report.eyeDelta=Math.hypot(...report.stages[0].cameraEye.map((v,i)=>v-report.stages[1].cameraEye[i]));assert(report.eyeDelta<.01,'The paddy would not be viewed from a matched camera');
report.percentReduction=report.stages[0].bright?100*(report.stages[0].bright-report.stages[1].bright)/report.stages[0].bright:null;
await writeFile(new URL('glare-'+first+'-'+second+'.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
