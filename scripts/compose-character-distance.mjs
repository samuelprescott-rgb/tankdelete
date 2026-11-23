// Contact sheets from original production pixels. No color correction, adaptive
// framing, independent zoom or replacement backgrounds in the character rows.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join,basename,relative} from 'node:path';
import {createHash,randomInt} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url), sharp=req('sharp'), [root,candidate,out]=process.argv.slice(2);
assert(root&&candidate&&out);
await mkdir(out,{recursive:true});
const boards=[
 ['gunner','Tank machine gunner','day',340,205],['scout','Viet Cong field scout','day',290,210],
 ['boss','Two-headed boss','boss',640,680],['undead-16','Night approach','night',225,164],
 ['undead-24','Distant wave','night',225,164],['undead-turn','Night turn','night',225,164]];
const esc=s=>s.replace(/[&<>]/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[k]));
const txt=(w,h,s,size=18,tint='#d9dbc8')=>Buffer.from('<svg width="'+w+'" height="'+h+'"><text x="12" y="'+(h*.7)+'" fill="'+tint+'" font-family="Helvetica" font-size="'+size+'">'+esc(s)+'</text></svg>');
const records={};
const compact=[];
// Use the same point on the live approach on both sides rather than picking
// the most impressive pose from either film. No recompositing or lens change.
async function fixedBoss(dir,receipt){
  const target=[5.5,-17.9];
  const metric=a=>Math.hypot(a.root[0]-target[0],a.root[2]-target[1]);
  const a=receipt.samples.filter(x=>x.opacity>.84).sort((x,y)=>metric(x)-metric(y))[0];
  const frames=(await readFile(join(dir,'chase-frames/frames.txt'),'utf8')).trim().split('\n'),
    names=frames.filter(x=>x.startsWith('file ')).map(x=>x.slice(6,-1)),dt=frames.filter(x=>x.startsWith('duration ')).map(x=>Number(x.slice(9)));
  let t=0;const stamps=dt.map(d=>{const start=t;t+=d;return start;});
  const starts=receipt.picks.map(x=>x.epoch+x.deltaMs/1000-stamps[names.indexOf(x.frame)]).sort((x,y)=>x-y);
  const origin=starts[Math.floor(starts.length/2)],wanted=a.epoch-origin,
    i=stamps.reduce((best,x,j)=>Math.abs(x-wanted)<Math.abs(stamps[best]-wanted)?j:best,0);
  return {a, capture:'chase-frames/'+names[i],worldMiss:metric(a),movieTime:wanted,synchronizationMs:Math.round(1000*(stamps[i]-wanted))};
}
for(const [id,title,mode,w,h] of boards){
  const images=[];
  for(const stage of ['before',candidate]){
    const storedStage=stage==='before'&&process.env.CHARACTER_BEFORE_STAGE?process.env.CHARACTER_BEFORE_STAGE:id==='undead-turn'&&stage==='before'?'before-turn':mode==='boss'&&stage==='before'&&process.env.CHARACTER_BASE_MOTION?process.env.CHARACTER_BASE_MOTION:stage;
    const dir=join(root,storedStage,mode),
      rec=JSON.parse(await readFile(join(dir,mode==='boss'?'player-chase.json':'receipt.json')));
    const {a,capture,worldMiss,movieTime,synchronizationMs}=mode==='boss'?await fixedBoss(dir,rec):{a:rec.shots[id],capture:id+'.png'};assert(a,id);
    if(mode==='boss'&&process.env.CHARACTER_BASE_MOTION)assert(worldMiss<.45&&movieTime>1&&rec.seconds-movieTime>1.2,'Boss did not reach the comparison point with a complete stride: '+worldMiss);
    const raw=await readFile(join(dir,capture)),sha256=createHash('sha256').update(raw).digest('hex');
    const md=await sharp(raw).metadata();assert.equal(md.width,1920);assert.equal(md.height,1080);
    const center=mode==='boss'?[a.footPixel[0],(Math.min(...a.measuredHeads.map(x=>x.bounds[1]))+a.footPixel[1])/2]:a.center;
    // Lock both the frame and the crop to the courtyard; leave space below
    // the contact plane so toes nearer the player do not get cropped off.
    const l=mode==='boss'?896:Math.min(1920-w,Math.max(0,Math.round(center[0]-w/2))),
      t=mode==='boss'?64:Math.min(1080-h,Math.max(0,Math.round(center[1]-h*(mode==='night'?.24:.50))));
    const crop=await sharp(raw).extract({left:l,top:t,width:w,height:h}).png().toBuffer(),
      overview=await sharp(raw).resize(640,360).png().toBuffer();
    const distance=a.distance??Math.hypot(...a.root.map((x,i)=>x-a.camera[i]));
    images.push({crop,overview,distance,raw:join(dir,capture),sha256,cropPixels:[l,t,w,h],actor:a.id??'command',sockets:a.sockets,eyePixels:a.eyePixels,
      facing:a.facing,world:a.world??a.root,worldMiss,movieTime,synchronizationMs,storedStage});
  }
  const blindSwap=randomInt(2);records[id]={title,blindSwap,observations:images.map(({crop,overview,...meta})=>meta)};
  compact.push({id,title,images,w,h});
  for(const blind of [true,false]){
    const pair=blind&&blindSwap?[...images].reverse():images;
    const gap=6, W=1280+gap,H=72+360+30+h+16,layers=[{input:txt(W,34,title+'  /  PRODUCTION PLAYER CAMERA',22),left:0,top:0}];
    for(let i=0;i<2;i++){
      const x=i*(640+gap),m=pair[i],name=blind?['A','B'][i]:['BEFORE','AFTER'][i];
      layers.push({input:txt(640,34,name+'   ·   '+m.distance.toFixed(1)+' m'),left:x,top:35},
        {input:m.overview,left:x,top:72},{input:txt(640,26,'1:1 detail from the frame above',14,'#a8b5bb'),left:x,top:434},
        {input:m.crop,left:x+Math.floor((640-w)/2),top:462});
    }
    await sharp({create:{width:W,height:H,channels:3,background:'#172028'}}).composite(layers).png()
      .toFile(join(out,(blind?'blind-':'')+id+'.png'));
  }
}
for(const [name,keys] of [['field',['gunner','scout']],['boss',['boss']],['horde',['boss','undead-turn','undead-24']]]){
  const rows=compact.filter(x=>keys.includes(x.id)).sort((a,b)=>keys.indexOf(a.id)-keys.indexOf(b.id)),
    cell=Math.max(...rows.map(r=>r.w)),W=cell*2+8,layers=[];let y=34;
  for(let i=0;i<2;i++)layers.push({input:txt(cell,32,['BEFORE','AFTER'][i],19),left:i*(cell+8),top:0});
  for(const row of rows){layers.push({input:txt(W,30,row.title+'   /   '+row.images.map(m=>m.distance.toFixed(1)).join(' vs ')+' m',16,'#becbd1'),left:0,top:y});y+=30;
    for(let i=0;i<2;i++)layers.push({input:row.images[i].crop,left:i*(cell+8)+Math.floor((cell-row.w)/2),top:y});
    y+=row.h+6;
  }
  await sharp({create:{width:W,height:y,channels:3,background:'#172028'}}).composite(layers).png().toFile(join(out,name+'-at-player-distance.png'));
}
// Put the unscaled head/torso beside an explicit integer enlargement. The
// enlargement is a loupe, never evidence of visibility at normal size.
{
  const W=744,C=368,keys=['undead-16','undead-turn','undead-24'],layers=[];
  for(let i=0;i<2;i++)layers.push({input:txt(C,32,['BEFORE','AFTER'][i],18),left:i*(C+8),top:0});
  for(let j=0;j<keys.length;j++){
    const row=records[keys[j]],y=34+j*170;
    for(let i=0;i<2;i++){
      const o=row.observations[i],x=i*(C+8),mid=[0,1].map(ax=>Math.round((o.sockets[0][ax]+o.sockets[1][ax])/2));
      const face=await sharp(o.raw).extract({left:mid[0]-74,top:mid[1]-30,width:148,height:125}).png().toBuffer(),
        pin=await sharp(o.raw).extract({left:mid[0]-20,top:mid[1]-13,width:40,height:26}).resize(160,104,{kernel:'nearest'}).png().toBuffer();
      layers.push({input:txt(C,30,row.title+'  /  '+o.distance.toFixed(1)+' m',16),left:x,top:y},
        {input:face,left:x,top:y+30},{input:pin,left:x+153,top:y+30},
        {input:txt(206,24,'4× pixel loupe',13,'#a8b5bb'),left:x+148,top:y+134});
    }
  }
  await sharp({create:{width:W,height:34+keys.length*170,channels:3,background:'#172028'}}).composite(layers).png().toFile(join(out,'night-eyes.png'));
}
const motionSwap=randomInt(2);
for(let i=0;i<2;i++){
  const observation=records.boss.observations[motionSwap?1-i:i],clip=join(root,observation.storedStage,'boss/boss-player-chase.mp4'),output=join(out,'film-'+['A','B'][i]+'.mp4');
  if(!process.env.CHARACTER_BASE_MOTION)await copyFile(clip,output);
  else {
    const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-ss',(observation.movieTime-.95).toFixed(3),'-i',clip,'-t','2.15','-c:v','libx264','-crf','17','-preset','fast','-an','-y',output]);
    assert.equal(result.status,0,result.stderr?.toString());
    await copyFile(output,join(out,(motionSwap?1-i:i)?'matched-after.mp4':'matched-before.mp4'));
  }
}
records.motion={blindSwap:motionSwap};
if(process.env.CHARACTER_BASE_MOTION){
  const pair=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',
    '-i',join(out,'matched-before.mp4'),'-i',join(out,'matched-after.mp4'),
    '-filter_complex','[0:v]scale=960:540,setsar=1[a];[1:v]scale=960:540,setsar=1[b];[a][b]hstack=inputs=2[v]',
    '-map','[v]','-an','-c:v','libx264','-crf','18','-preset','fast','-movflags','+faststart','-y',join(out,'boss-stride-before-after.mp4')]);
  assert.equal(pair.status,0,pair.stderr?.toString());
}
await writeFile(join(out,'provenance.json'),JSON.stringify(records,null,2));
const links=boards.map(([id])=>{
  const r=records[id],n=basename(out);
  return '<h2>'+r.title+'</h2><a href="'+id+'.png"><img alt="'+r.title+' comparison" src="'+id+'.png"></a><p>'+
    r.observations.map((o,i)=>'<a href="'+relative(out,o.raw)+'">'+(i?'After':'Before')+' — full 1080p</a>').join(' · ')+'</p>';
}).join('\n');
await writeFile(join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Ghost Signal — character distances</title><style>body{max-width:1286px;margin:30px auto;background:#10171b;color:#d7dfdc;font:17px system-ui}img{width:100%;height:auto}a{color:#b6d9eb}h2{margin-top:2em}</style><h1>Ghost Signal · character field review</h1><p>Actual player-camera frames. Left: original. Right: character pass. The lower detail windows contain native pixels, not magnified portraits. Wave four is staged only by completing earlier waves; the boss encounter plays normally. Day/night field captures are prior to HUD compositing.</p>'+links+'<p><a href="../'+records.boss.observations[0].storedStage+'/boss/boss-player-chase.mp4">Before encounter film</a> · <a href="../'+candidate+'/boss/boss-player-chase.mp4">After encounter film</a> · <a href="night-eyes.png">Original eye pixels and labeled 4× loupe</a></p>');
console.log(resolve(out));
