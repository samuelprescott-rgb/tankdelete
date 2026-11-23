// Combine actual player-side in-game pixels, without props, retouching,
// grading or generated art. Recenter identical-sized source crops for the
// clearly labelled detail row. Align actual-time films to measured windup.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('sharp');
const dir=resolve(process.argv[2]),files=['before',process.argv[3]??'after'];
assert(files.every(f=>/^[A-Za-z0-9_-]+$/.test(f)));
const shots=await Promise.all(files.map(async label=>{
  const d=resolve(dir,label),j=JSON.parse(await readFile(resolve(d,'receipt.json'),'utf8'));
  assert(j.still&&j.clip&&j.sha256,'Missing completed capture in '+d);
  return {d,j,src:resolve(d,'windup-full.png'),label};
}));
const [a,b]=shots.map(s=>s.j);
assert((a.target??'tank')===(b.target??'tank'),'Do not compare a different attack class');
assert(Math.abs(a.still.phase-b.still.phase)<.125,'Windup phases too different');
assert(a.still.opacity>.88&&b.still.opacity>.88);
const bg='#161b19',ink='#e5e6dc',sub='#a6b1a4',gold='#d4ad72';
const target=(b.target??'tank')==='tank'?'tank':'Sagamore';
const xml=t=>t.replaceAll('&','&amp;').replaceAll('<','&lt;');
const label=(x,y,t,size,color=ink)=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="Helvetica,Arial,sans-serif">${xml(t)}</text>`;
const W=1520,H=1004,cw=730,ch=410,xs=[20,770];
const [cropW,cropH]=['width','height'].map(k=>Math.max(...shots.map(s=>s.j.crop[k])));
const fac=Math.min(2,690/cropW,420/cropH);
const dw=Math.floor(cropW*fac),dh=Math.floor(cropH*fac);
const inks=[],zones=[];
let letters=label(20,34,'Command contact: the striking hand',26)+label(20,60,'Wave four  /  actual '+target+'-directed wind-up and rake  /  same lens from the player side',16,sub);
shots.forEach(({j,label:side},i)=>{
  const x=xs[i],bounds=j.still.bounds,mid=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
  const l=Math.max(0,Math.min(1920-cropW,Math.round(mid[0]-cropW/2))),t=Math.max(0,Math.min(1080-cropH,Math.round(mid[1]-cropH/2)));
  zones.push({left:l,top:t,width:cropW,height:cropH});
  letters+=label(x,93,(side==='before'?'BEFORE':'AFTER')+'    /    '+j.bundle.slice(12,-3),17,gold);
  letters+=label(x,546,'Wrist detail  /  '+(fac.toFixed(2))+'×, same frame',17,sub);
  letters+=label(x,989,'Live wind-up: '+(100*j.still.phase).toFixed(1)+'%   ·   material opacity '+j.still.opacity,16,sub);
});
const base=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${bg}"/>${letters}</svg>`);
for(const [i,s] of shots.entries()){
  const x=xs[i],zone=zones[i];
  const full=await sharp(s.src).resize(cw,ch,{fit:'fill'}).png().toBuffer();
  const bb=s.j.still.bounds,kx=cw/1920,ky=ch/1080;
  const marker=Buffer.from(`<svg width="${cw}" height="${ch}"><rect x="${(bb[0]-6)*kx}" y="${(bb[1]-6)*ky}" width="${(bb[2]-bb[0]+12)*kx}" height="${(bb[3]-bb[1]+12)*ky}" fill="none" stroke="${gold}" stroke-width="1.5"/></svg>`);
  inks.push({input:await sharp(full).composite([{input:marker}]).png().toBuffer(),left:x,top:104});
  inks.push({input:await sharp(s.src).extract(zone).resize(dw,dh,{fit:'fill'}).png().toBuffer(),left:x+Math.floor((cw-dw)/2),top:553+Math.floor((420-dh)/2)});
}
await sharp(base).composite(inks).png().toFile(resolve(dir,'windup-comparison.png'));
const stripWidth=1518,stripHeight=689,sw=480,sh=270,cols=[18,516,1014];
const cells=[],picks=[];
let stripText=label(18,31,'One real attack, in three frames',25);
for(const [i,name] of ['Approach • shoulder at rest','Late wind-up','First rake'].entries())stripText+=label(cols[i],64,name,18,sub);
for(const [row,shot] of shots.entries()){
  const seq=shot.j.clip,firstReady=seq.findLastIndex(f=>f.time<shot.j.still.time&&Math.abs(f.phase)<.003&&f.eligible);
  const peak=seq.findIndex(f=>Math.abs(f.time-shot.j.still.time)<.002);
  const impact=seq.findIndex(f=>f.time>shot.j.still.time&&f.phase<-.45);
  if(firstReady<0||peak<0||impact<0)break;
  for(const [col,idx] of [firstReady,peak,impact].entries()){
    const f=seq[idx],path=resolve(shot.d,'motion','frame-'+String(idx).padStart(3,'0')+'.jpg');
    cells.push({input:await sharp(path).resize(sw,sh).png().toBuffer(),left:cols[col],top:row?405:98});
    picks.push({folder:files[row],pose:['ready','windup','first-rake'][col],frame:idx,phase:f.phase,time:f.time});
  }
  stripText+=label(18,row?396:89,(row?'AFTER':'BEFORE')+'  /  '+shot.j.bundle.slice(12,-3),14,gold);
}
if(cells.length===6){
  const plate=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${stripWidth}" height="${stripHeight}"><rect width="100%" height="100%" fill="${bg}"/>${stripText}</svg>`);
  await sharp(plate).composite(cells).png().toFile(resolve(dir,'rake-sequence.png'));
}
const offsets=shots.map(s=>s.j.still.time-s.j.clip[0].time),sync=Math.min(...offsets);
const cmd=['-nostdin','-y','-loglevel','error'];
shots.forEach((s,i)=>cmd.push('-ss',(offsets[i]-sync).toFixed(3),'-i',resolve(s.d,'strike.mp4')));
cmd.push('-filter_complex','[0:v]scale=768:432,setsar=1[l];[1:v]scale=768:432,setsar=1[r];[l][r]hstack=inputs=2:shortest=1[film]',
  '-map','[film]','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',resolve(dir,'strike-comparison.mp4'));
const f=spawnSync('ffmpeg',cmd);assert.equal(f.status,0,String(f.stderr));
await writeFile(resolve(dir,'comparison.json'),JSON.stringify({target,before:a.bundle,after:b.bundle,phases:[a.still.phase,b.still.phase],
  explicitInspectionLens:'Camera on player azimuth; not the HUD chase camera. Original lighting/fade; no synthetic pose.',
  fullSize:[1920,1080],cropSize:[cropW,cropH],cropRegions:zones,cropScale:fac,filmBeforeAfter:['left','right'],
  secondsToSharedWindup:sync,secondsTrimmed:offsets.map(n=>n-sync),sequenceFrames:picks},null,2));
const sec=(j,k)=>(j.clip[k<0?j.clip.length+k:k].time-j.still.time);
const shareEnd=Math.min(...shots.map(s=>sec(s.j,-1)));
const stripLink=cells.length===6?'<p><a href="rake-sequence.png">Six-frame comparison: at rest, late wind-up and the first rake</a></p>':'';
const evidence=stripLink+shots.map(({label:folder,j},i)=>`<section><h2>${i?'After':'Before'} • ${xml(j.bundle.slice(12,-3))}</h2><p><a href="${folder}/windup-full.png">Original 1920×1080 frame</a> · <a href="${folder}/windup-wrist.png">Unscaled wrist crop</a> · <a href="${folder}/receipt.json">Capture receipt</a></p><video controls preload="metadata" src="${folder}/strike.mp4"></video></section>`).join('');
await writeFile(resolve(dir,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Command contact: the striking hand</title><style>body{margin:28px auto;padding:0 20px;max-width:1140px;background:#161b19;color:#e5e6dc;font:17px/1.5 system-ui}a{color:#e4c18f}img,video{width:100%;height:auto}section{margin:30px 0}small{color:#b7c4b7}</style><h1>Command contact: the striking hand</h1><p>Live wave-four attack on ${target==='tank'?'the tank':target}. Same player-relative inspection lens, unchanged storm lighting and original camera fade. Each lower panel is an enlargement of the boxed pixels in the same frame above it.</p><a href="windup-comparison.png"><img src="windup-comparison.png" alt="Before and after full boss wind-up, paired with the actual striking wrist from each frame"></a><h2>Approach, wind-up and first rake</h2><video controls loop preload="metadata" src="strike-comparison.mp4"></video><p><small>Before on the left; after on the right. Actual-time clips aligned at the sampled wind-up. Shared interval: ${sync.toFixed(2)} seconds before the matched pose to ${shareEnd.toFixed(2)} seconds after. The untrimmed after video below continues through the sweep and release.</small></p>${evidence}<p><a href="comparison.json">Alignment and crop dimensions</a></p></html>`);
