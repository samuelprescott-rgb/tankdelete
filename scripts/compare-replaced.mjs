// Private photo review. Compare only original browser captures of the retained scenes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
const sharp=createRequire(import.meta.url)('sharp');
const [stage,height='1080',baseline='replaced-before']=process.argv.slice(2);
assert(/^(replaced-before|replaced-r\d+)$/.test(baseline)&&stage!==baseline);
assert(/^replaced-r\d+$/.test(stage)&&['1080','1440'].includes(height));
const root=new URL('../../TankDelete-Concepts/replaced-gauntlet/'+height+'p/',import.meta.url).pathname;
const dir=root+stage+'-board/';
await mkdir(dir,{recursive:true});
const rounds=[baseline,stage], data=await Promise.all(rounds.map(s=>readFile(root+s+'/receipt.json','utf8').then(JSON.parse)));
assert(data.every(x=>x.pass)&&data[0].builds[0]!==data[1].builds[0]);
const key={builds:data.map(d=>d.builds[0]),rows:[]};
const band=(txt,w)=>Buffer.from('<svg width="'+w+'" height="32"><rect width="100%" height="100%" fill="#17252b"/><text x="16" y="22" fill="#f7ecce" font-size="17" font-family="Helvetica, sans-serif">'+txt+'</text></svg>');
const flip=randomInt(2);
for(const [k,slice] of ['river','embassy'].entries()){
 const chunks=[],blind=[];
 for(const [y,name] of ['chase','scenic',slice==='river'?'bank':'facade'].entries()){
  const id=slice+'-'+name,w=800,h=450;
  const meta=data.map(d=>d.shots.find(x=>x.id===id));
  assert(meta.every(m=>m.canvas[1]===Number(height)&&m.dpr===1));
  if(name!=='chase'){assert.deepEqual(meta[0].eye,meta[1].eye);assert.deepEqual(meta[0].look,meta[1].look);}
  const order=(k+y+flip)%2;
  key.rows.push({id,left:rounds[order],right:rounds[1-order]});
  for(const x of [0,1]){
   const bytes=await readFile(root+rounds[x]+'/'+id+'.png');
   assert.equal(createHash('sha256').update(bytes).digest('hex'),meta[x].sha256);
   const file=await sharp(bytes).resize(w,h,{fit:'fill'}).png().toBuffer();
   chunks.push({input:band((x?'After':'Before')+' / '+name,w),left:x*w,top:y*(h+32)},{input:file,left:x*w,top:y*(h+32)+32});
   const col=x^order;
   blind.push({input:band(id+' / '+(col?'B':'A'),w),left:col*w,top:y*(h+32)},{input:file,left:col*w,top:y*(h+32)+32});
  }
 }
 for(const [name,parts] of [[slice+'-comparison',chunks],[slice+'-AB',blind]])await sharp({create:{width:1600,height:1446,channels:3,background:'#17252b'}}).composite(parts).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(dir+name+'.jpg');
}
await writeFile(dir+'key.json',JSON.stringify(key,null,2));
