import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {createRequire} from 'node:module';
import {randomInt,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const sharp=createRequire(import.meta.url)('sharp'),[base,version,destination]=process.argv.slice(2),root=resolve(base),out=resolve(destination);await mkdir(out,{recursive:true});
const groups=[
 ['village','River village','day',[['timber-row','Huts from the bridge',580,315,650,340],['jetty','Fishing landing and hamlet',680,340,750,380]]],
 ['rubble','Burned jetty','day',[['ruin','Charred structure at the riverside',715,340,535,310]]],
 ['embassy','Embassy frontage','night',[['embassy','Whole approach',310,192,1300,540],['west-wing','Records wing, camera left',600,270,550,365],['east-wing','Dispatch, camera right',1010,225,700,490]]]
];
const bg='#162024',header=(w,h,t,size=18)=>Buffer.from('<svg width="'+w+'" height="'+h+'"><text x="12" y="'+h*.71+'" font-size="'+size+'" font-family="Helvetica" fill="#e3ded1">'+t+'</text></svg>');
const rec={},W=630,H=354,gap=6,width=2*W+gap;const sha=b=>createHash('sha256').update(b).digest('hex');
for(const [id,title,mode,views] of groups){const swap=randomInt(2),docs=[],shots=await Promise.all(['original',version].map(async v=>JSON.parse(await readFile(join(root,v,mode,'receipt.json')))));
 assert(shots.every(s=>s.ok&&!s.errors.length));const rows=[];
 for(const [name,tag,x,y,w,h] of views){const f=[];
  for(const [i,ver] of ['original',version].entries()){const path=join(root,ver,mode,name+'.jpg'),buf=await readFile(path),s=shots[i].photos[name];
   const md=await sharp(buf).metadata();assert(md.width===1920&&md.height===1080&&s.unmodifiedCamera&&s.buf[0]===1920);
   const copy='frame-'+name+'-'+((swap?1-i:i)?'B':'A')+'.jpg';await copyFile(path,join(out,copy));
   f.push({overview:await sharp(buf).resize(W,H).toBuffer(),detail:await sharp(buf).extract({left:x,top:y,width:w,height:h}).resize({width:W,height:204,fit:'contain',background:bg}).png().toBuffer(),path,sha:sha(buf),s});}
  const separation=Math.hypot(...f[0].s.tank.map((n,i)=>n-f[1].s.tank[i])),angle=Math.abs(Math.atan2(Math.sin(f[0].s.yaw-f[1].s.yaw),Math.cos(f[0].s.yaw-f[1].s.yaw)));
  docs.push({name,paths:f.map(q=>relative(out,q.path)),sha:f.map(q=>q.sha),meters:separation,degrees:angle*180/Math.PI});rows.push({f,tag});}
 rec[id]={swap,docs};for(const blind of [true,false]){let at=38;const layers=[{input:header(width,38,title+' / original tank camera',22),left:0,top:0}];
 for(let j=0;j<2;j++)layers.push({input:header(W,25,(blind?['A','B']:['BEFORE','AFTER'])[j]),left:j*(W+gap),top:at});at+=25;
 for(const {tag,f} of rows){layers.push({input:header(width,27,tag,16),left:0,top:at});at+=27;
  for(let j=0;j<2;j++){const img=f[blind&&swap?1-j:j];layers.push({input:img.overview,left:j*(W+gap),top:at},{input:img.detail,left:j*(W+gap),top:at+H+3});}at+=H+3+204+7;}
 await sharp({create:{width,height:at,channels:3,background:bg}}).composite(layers).png().toFile(join(out,(blind?'blind-':'')+id+'.png'));}
 if(id!=='village'){const film=mode==='day'?'ruin-motion':'east-wing-motion';for(const [i,ver] of ['original',version].entries())await copyFile(join(root,ver,mode,film+'.mp4'),join(out,id+'-'+((swap?1-i:i)?'B':'A')+'.mp4'));
  const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',join(root,'original',mode,film+'.mp4'),'-i',join(root,version,mode,film+'.mp4'),'-filter_complex','[0:v]scale=760:428,setsar=1[a];[1:v]scale=760:428,setsar=1[b];[a][b]hstack=inputs=2:shortest=1[v]','-map','[v]','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-y',join(out,id+'-motion.mp4')]);assert.equal(ff.status,0,ff.stderr?.toString());}
}
await writeFile(join(out,'paired.json'),JSON.stringify(rec,null,2));
const sections=groups.map(([id,title])=>'<section><h2>'+title+'</h2><img alt="'+title+' before and after" src="'+id+'.png"><p>'+rec[id].docs.map(d=>d.name+': <a href="'+d.paths[0]+'">Before 1080p</a> / <a href="'+d.paths[1]+'">After 1080p</a>').join(' · ')+'</p>'+(id==='village'?'':'<video controls preload="none" src="'+id+'-motion.mp4"></video><p>Original left, revised right.</p>')+'</section>').join('');
await writeFile(join(out,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ghost Signal · Buildings</title><style>body{background:#111a1d;color:#e2ddcf;max-width:1280px;margin:30px auto;padding:0 20px;font:17px/1.5 system-ui}h1{font-size:clamp(34px,5vw,64px);margin:.25em 0}section{border-top:1px solid #53605d;padding-top:20px;margin-top:32px}a{color:#a9dfd3}img,video{width:100%;height:auto}</style><header>GHOST SIGNAL / BUILDINGS AND EFFECTS<h1>From the tank</h1><p>Actual production gameplay with the HUD and normal third-person camera. Each comparison shows the full frame first, then a crop of those same pixels. Input and stopping points are matched, not synchronized actors, rain or gunfire.</p></header>'+sections+'</html>');
