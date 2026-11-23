// Produce a proof sheet, not a new render. Panels share the same chase-camera
// viewport, timestamp, crop and zoom. Three captures: requested look, last
// playtest, and the restored effect. No compositing into the game frames.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const [reference,prior,current,out]=process.argv.slice(2);assert(reference&&prior&&current&&out);
const sharp=createRequire(import.meta.url)('sharp'),panel=560,full=315,detail=235,gap=3,title=46,legend=36;
const band=(w,h,s)=>Buffer.from('<svg width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#19231f"/><text x="15" y="'+Math.round(h*.68)+'" fill="#f1eee1" font-family="Helvetica,sans-serif" font-size="'+(h===title?19:16)+'" font-weight="bold">'+s+'</text></svg>');
const inputs=[reference,prior,current],names=['Original smoke reference','Previous playtest','Restored smoke'];
const layers=[];const records=await Promise.all(inputs.map(async dir=>JSON.parse(await readFile(join(dir,'relay.json'),'utf8'))));
for(const [i,dir] of inputs.entries()){
 const row=records[i].frames.find(f=>f.id==='descent');
 assert.equal(row.width,1920);assert.equal(row.height,1080);assert(Math.abs(row.time-27.55)<.2);
 const baseline=records[0].frames.find(f=>f.id==='descent').camera;
 assert(row.camera.every((n,k)=>Math.abs(n-baseline[k])<.001),'incompatible cameras');
 const left=(panel+gap)*i,frame=join(dir,row.file);
 layers.push({left,top:0,input:band(panel,title,names[i])});
 layers.push({left,top:title,input:await sharp(frame).resize(panel,full).toBuffer()});
 layers.push({left,top:title+full,input:band(panel,legend,'Same frame and crop · 2.35 s after the hit')});
 layers.push({left,top:title+full+legend,input:await sharp(frame).extract({left:950,top:10,width:panel,height:detail}).toBuffer()});
}
await sharp({create:{width:panel*3+2*gap,height:title+full+legend+detail,channels:3,background:'#798674'}}).composite(layers).jpeg({quality:92}).toFile(out);
