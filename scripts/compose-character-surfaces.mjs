import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {randomInt,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('sharp'),[folder,stage,output]=process.argv.slice(2),root=resolve(folder),out=resolve(output);
await mkdir(out,{recursive:true});
const label=(w,h,text,size=17,tint='#d8e0da')=>Buffer.from('<svg width="'+w+'" height="'+h+'"><text x="10" y="'+(h*.7)+'" fill="'+tint+'" font-family="Helvetica" font-size="'+size+'">'+text+'</text></svg>');
// The same native-pixel rectangles are used on both sides. These are
// unretouched crops of the saved full-buffer frames (not another render).
const detailWindows={
 'gunner-face':[655,273,780,487],'scout':[475,203,780,487],
 'gunner-control':[542,382,780,487],'scout-trigger':[878,100,780,487],
 'lead':[575,220,780,610],'watcher-quarter':[521,185,780,610],
 'claw-detail':[575,280,780,610]};
const records={},slabs=[
  ['portraits','Daylight portraits',[['field-extra','gunner-face','Gunner'],['field','scout','Viet Cong scout']]],
  ['hands','Hands and field kit',[['field-extra','gunner-control','Gunner / control grip'],['field-extra','scout-trigger','Scout / rifle grip']]],
  ['monster','Exposed monster',[['boss','lead','Lead head'],['boss','watcher-quarter','Second head, three-quarter view'],['boss','claw-detail','Striking hand']]],
];
const cell=490,ht=276,gap=6,W=2*cell+gap;
for(const [id,title,rows] of slabs){
  const swap=randomInt(2);records[id]={swap,rows:[]};
  const entries=[];
  for(const [mode,file,desc] of rows){
    const row=[];
    for(const version of ['before',stage]){
      const key=version==='before'&&file==='claw-detail'?'boss-verified':version==='before'&&['lead-quarter','watcher-quarter'].includes(file)?'boss-extra':mode;
      const path=join(root,version,key,file+'.png'),b=await readFile(path),meta=await sharp(b).metadata();assert(meta.width===1920&&meta.height===1080);
      const blind=(version==='before')!==(swap===1)?'A':'B';
      await sharp(b).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(join(out,'inspect-'+id+'-'+file+'-'+blind+'.jpg'));
      row.push({input:await sharp(b).resize(cell,ht,{fit:'fill'}).png().toBuffer(),path:relative(out,path),sha256:createHash('sha256').update(b).digest('hex')});
    }
    records[id].rows.push({desc,frames:row.map(({input,...x})=>x)});entries.push({row,desc});
  }
  const details=[{input:label(W,34,title+'   /   detail crops',21),left:0,top:0}];let dy=34;
  for(let j=0;j<2;j++)details.push({input:label(cell,25,['BEFORE','AFTER'][j],16),left:j*(cell+gap),top:dy});dy+=25;
  for(const rr of records[id].rows){const n=rows.find(x=>x[2]===rr.desc)[1];
    const [left,top,width,height]=detailWindows[n],heightOut=Math.round(height*cell/width);
    details.push({input:label(W,26,rr.desc,15,'#a9b8b4'),left:0,top:dy});dy+=26;
    for(let j=0;j<2;j++)details.push({input:await sharp(resolve(out,rr.frames[j].path)).extract({left,top,width,height}).resize(cell,heightOut).png().toBuffer(),left:j*(cell+gap),top:dy});
    dy+=heightOut+4;
  }
  await sharp({create:{width:W,height:dy,channels:3,background:'#142027'}}).composite(details).png().toFile(join(out,'details-'+id+'.png'));
  for(const blind of [false,true]){
    const layers=[{input:label(W,34,title,21),left:0,top:0}];let y=33;
    for(let j=0;j<2;j++)layers.push({input:label(cell,26,blind?['A','B'][j]:['BEFORE','AFTER'][j],16),left:j*(cell+gap),top:y});y+=26;
    for(const {desc,row} of entries){layers.push({input:label(W,26,desc,15,'#a9b8b4'),left:0,top:y});y+=26;
      for(let j=0;j<2;j++)layers.push({input:row[blind&&swap?1-j:j].input,left:j*(cell+gap),top:y});y+=ht+4;}
    await sharp({create:{width:W,height:y,channels:3,background:'#142027'}}).composite(layers).png().toFile(join(out,(blind?'blind-':'')+id+'.png'));
  }
}
const bd=join(root,stage,'boss'),rec=JSON.parse(await readFile(join(bd,'receipt.json')));assert(rec.photos.length&&rec.health.some(s=>s.phase==='falling'));
const film=JSON.parse(await readFile(join(bd,'motion/frames.json'))),expr=film.flatMap((a,i)=>["file 'frame-"+String(i).padStart(3,'0')+".jpg'","duration "+Math.max(.016,(film[i+1]?.rel??a.rel+.077)-a.rel).toFixed(4)]);
await writeFile(join(bd,'motion/frames.txt'),expr.join('\n')+'\n');
const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','concat','-safe','1','-i','frames.txt','-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart','-y',join(out,'mask-drop.mp4')],{cwd:join(bd,'motion')});assert.equal(ff.status,0,ff.stderr?.toString());
const trace=join(out,'telemetry');await mkdir(trace,{recursive:true});
const max=rec.health[0].max;
for(let i=0;i<film.length;i++){const f=film[i],name='frame-'+String(i).padStart(3,'0')+'.jpg';
  const caption='Live QA   /   Boss HP: '+f.hp+' of '+max+'     |     '+(f.phase==='worn'?'Portraits attached':f.phase==='falling'?'Portraits detached':'Both faces revealed');
  await sharp(join(bd,'motion',name)).extend({top:0,left:0,right:0,bottom:40,background:'#142027'}).composite(
    [{input:label(960,40,caption,21),left:0,top:540}]).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toFile(join(trace,name));
}
await writeFile(join(trace,'frames.txt'),expr.join('\n')+'\n');
const ff2=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','concat','-safe','1','-i','frames.txt','-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart','-y',join(out,'mask-drop-health.mp4')],{cwd:trace});assert.equal(ff2.status,0,ff2.stderr?.toString());
const order=[['mask-harris','Harris / original print'],['mask-joe','Joe / original print'],['drop-1','At half health / falling'],['pair-revealed','After / both heads exposed']];
const tile=440,h=248,layers=[{input:label(tile*2+gap,36,'Wave four  /  The masks fall intact',22),left:0,top:0}];
for(let i=0;i<order.length;i++){const [image,tag]=order[i],x=i%2*(tile+gap),y=36+Math.floor(i/2)*(h+30);
  layers.push({input:label(tile,28,tag,16),left:x,top:y},{input:await sharp(join(bd,image+'.png')).resize(tile,h).png().toBuffer(),left:x,top:y+28});}
await sharp({create:{width:tile*2+gap,height:36+2*(h+30),channels:3,background:'#142027'}}).composite(layers).png().toFile(join(out,'masks.png'));
await writeFile(join(out,'comparison.json'),JSON.stringify(records,null,2));
const link=(url,t)=>'<a href="'+url+'">'+t+'</a>';
const html=slabs.map(([id,title])=>'<h2>'+title+'</h2><img src="details-'+id+'.png"><p>'+link(id+'.png','Uncropped camera comparison')+'</p>'+records[id].rows.map(x=>'<p>'+x.desc+' · '+x.frames.map((f,i)=>link(f.path,i?'After, 1080p':'Before, 1080p')).join(' / ')+'</p>').join('')).join('');
await writeFile(join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Ghost Signal · character close-ups</title><style>body{background:#121c23;color:#d9e0dc;font:17px system-ui;max-width:1100px;margin:32px auto}a{color:#a4d5e0}img,video{max-width:100%}h2{margin-top:2em}</style><h1>Ghost Signal · character close-ups</h1><p>Original and revised production frames, lower resolution pairings for browsing. Open the 1920×1080 originals below. These are inspection cameras inside the running campaign and embassy, not new illustrations or a studio light setup. Moving poses can differ. The wave-four health checks use the shipped combat handler.</p>'+html+'<h2>Two original paper masks · one health transition</h2><img src="masks.png"><p>'+order.map(([n,t])=>link(relative(out,join(bd,n+'.png')),t)).join(' · ')+'</p><video controls preload="metadata" src="mask-drop.mp4"></video><p>'+link(relative(out,join(bd,'receipt.json')),'Health and capture receipt')+'</p>');
const gallery=await readFile(join(out,'index.html'),'utf8');await writeFile(join(out,'index.html'),gallery.replace('src="mask-drop.mp4"','src="mask-drop-health.mp4"')+'<p>'+link('mask-drop.mp4','Original clip without the QA health caption')+'</p>');
console.log('Gameplay review:',out);
