// CPU-only, offline. The immutable R14 capture is never an output directory.
// Usage: node scripts/compose-field-art-review.mjs micro-r16
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {constants} from 'node:fs';
import {access,copyFile,mkdir,mkdtemp,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let sharp;try{sharp=require('sharp');}catch{sharp=createRequire(process.execPath)('sharp');}
const base='micro-r14', after=process.argv[2];
assert(/^micro-r(?:1[5-9]|[2-9]\d|\d{3,})$/.test(after||'')&&process.argv.length===3,'Supply one later capture stage, e.g. micro-r16');
const game=fileURLToPath(new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/game/',import.meta.url));
const destination=join(game,after),folder=join(destination,'field-art-review'),zip=join(destination,'field-art-review.zip');
const pngSize=[1920,1080],kits=['pack','helmet','load-bearing','radio','local-scout'];
const vistas=['river-chase','river-bank','river-scenic','embassy-chase','embassy-scenic','embassy-facade'];
const dims=(actual,expected)=>assert.deepEqual(actual,expected,'unexpected capture dimensions');
const hash=b=>createHash('sha256').update(b).digest('hex');
const readJSON=async f=>JSON.parse(await readFile(f,'utf8'));
const near=(a,b,tol,name)=>{assert.equal(a.length,b.length,name);assert(a.every((x,i)=>Number.isFinite(x)&&Math.abs(x-b[i])<=tol),name);};
const unique=(rows,id)=>{const a=rows.filter(x=>x.id===id);assert.equal(a.length,1,id);return a[0];};
const exists=async f=>{try{await access(f);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
await stat(destination);assert(!await exists(folder)&&!await exists(zip),'An existing review is never overwritten; select another completed capture stage.');
async function batch(stage){
  const root=join(game,stage),env=await readJSON(join(root,'receipt.json')),kit=await readJSON(join(root,'kit/kit.json'));
  const bundle=kit.bundle;assert(/^GameSession-[\w-]+\.js$/.test(bundle));assert(/^[\da-f]{64}$/.test(kit.jsHash));
  assert.equal(env.stage,stage);assert.equal(env.pass,true);assert.deepEqual(env.errors,[]);assert.deepEqual(kit.errors,[]);
  assert.deepEqual(env.builds.map(basenameSafe),[bundle]);const stills={},films={},files=new Map();
  async function record(rel){const bytes=await readFile(join(root,rel));files.set(rel,hash(bytes));return bytes;}
  await record('receipt.json');await record('kit/kit.json');
  for(const id of [...kits,...vistas]){
    const actor=kits.includes(id),s=unique(actor?kit.shots:env.shots,id),rel=(actor?'kit/':'')+id+'.png';
    const bytes=await record(rel),m=await sharp(bytes).metadata();assert.equal(files.get(rel),s.sha256,stage+'/'+rel+' SHA does not match receipt');
    dims([m.width,m.height],pngSize);dims(actor?s.buffer:s.canvas,pngSize);assert.equal(m.format,'png');
    if(!actor){assert.equal(basenameSafe(s.bundle),bundle);assert.equal(s.dpr,1);}
    stills[id]={s,rel};
  }
  for(const scene of ['embassy','river']){
    const receipt='conditions/'+scene+'-film.json',rel='conditions/'+scene+'-player.mp4';
    if(!await exists(join(root,receipt))){
      assert(stage===base&&scene==='river'&&!await exists(join(root,rel)),'Missing film receipt: '+stage+'/'+receipt);
      films[scene]=null;continue;
    }
    const f=JSON.parse(await record(receipt));assert.deepEqual(f.errors,[]);
    assert.equal(f.bundle,bundle);assert.equal(basename(new URL(f.source).pathname),bundle);
    assert.equal(f.film,basename(rel));assert(f.frames>0&&f.realSeconds>0);
    const mp4=join(root,rel);await record(rel);
    const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,codec_name:format=duration','-of','json',mp4],{encoding:'utf8'}));
    const video=meta.streams[0];dims([video.width,video.height],pngSize);assert.equal(video.codec_name,'h264');
    assert(Math.abs(+meta.format.duration-f.realSeconds)<.5,'unmatched clip duration');
    near(f.first.eye,stills[scene+'-chase'].s.eye,.01,stage+' '+scene+' film start does not match chase');
    near(f.first.yaw,stills[scene+'-chase'].s.quaternion,.001,'film orientation');
    films[scene]={rel,receipt,frames:f.frames,duration:+meta.format.duration,sha256:files.get(rel)};
  }
  return {stage,root,env,kit,files,stills,films,bundle,jsHash:kit.jsHash};
}
function basenameSafe(p){return basename(p);}
const [before,next]=await Promise.all([batch(base),batch(after)]);
assert.notEqual(before.jsHash,next.jsHash);assert.notEqual(before.bundle,next.bundle);
for(const id of [...kits,...vistas]){
  const a=before.stills[id].s,b=next.stills[id].s;
  if(kits.includes(id)){
    for(const prop of ['actor','body','bones','localEye','localLook','fov'])assert.deepEqual(a[prop],b[prop],id+' '+prop);
  }else{
    for(const prop of ['slice','camera','look','verticalFov'])assert.deepEqual(a[prop],b[prop],id+' '+prop);
    near(a.eye,b.eye,.005,id+' eye');near(a.quaternion,b.quaternion,.0004,id+' rotation');near(a.tank,b.tank,.003,id+' tank');
  }
}
// Explicit identical pixel rectangles; all coordinates use untouched 1080p
// originals. Rectangles are never selected independently for before/after.
const plates=[
  ['pack','Rucksack & carrying straps','pack',[716,155,655,865],'Rear quarter • US rifleman'],
  ['helmet','Helmet, brim & face','helmet',[711,371,539,534],'Head and upper collar • same rifleman'],
  ['load-bearing','Load-bearing equipment','load-bearing',[770,250,690,580],'Harness, pouches and rifle • same rifleman'],
  ['radio','RTO field radio','radio',[657,173,651,826],'Radio, harness and shoulder • US radio operator'],
  ['local-scout','Local scout','local-scout',[710,60,831,981],'Face, tunic, webbing and stance • same scout'],
  ['river-chase','River crossing · player view','river-chase',null,'Normal chase • HUD retained'],
  ['wet-bank','Wet bank & waterline','river-chase',[825,533,800,547],'Same chase • foreground roots, stones and water'],
  ['bank-deck','Crossing abutment','river-bank',[410,444,1360,636],'Bank camera • timber, stones and channel'],
  ['plume','Wind and rising smoke','river-chase',[750,48,885,485],'Same chase • eastern canopy and ridge'],
  ['night-chase','Embassy · player view','embassy-chase',null,'Normal chase • HUD retained'],
  ['downpour','Downpour & west canopy','embassy-scenic',[0,0,1480,846],'Scenic camera • rain, tree and front court'],
];
const stages=[before,next],labels=['before','after'];
const out=await mkdtemp(join(destination,'.field-art-review-'));
for(const [i,b] of stages.entries())for(const [rel,expected] of b.files){
  const target=join(out,'originals',labels[i],rel);await mkdir(dirname(target),{recursive:true});
  await copyFile(join(b.root,rel),target,constants.COPYFILE_FICLONE|constants.COPYFILE_EXCL);
  assert.equal(hash(await readFile(target)),expected,'source changed during copy');
}
await mkdir(join(out,'plates'));
const W=820,B=38,escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const band=(w,h,left,right='')=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#151c1e"/><text x="14" y="'+Math.floor(h*.69)+'" font-family="Helvetica,Arial,sans-serif" font-size="15" fill="#f5eddb">'+escape(left)+'</text><text x="'+(w-14)+'" y="'+Math.floor(h*.69)+'" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="13" fill="#b8c5bd">'+escape(right)+'</text></svg>');
const baseCanvas=(w,h)=>sharp({create:{width:w,height:h,channels:3,background:'#151c1e'}});
for(const [slug,title,id,crop] of plates){
  const [x,y,w,h]=crop||[0,0,...pngSize],pw=Math.min(w,W),ph=Math.round(pw*h/w);
  assert(x>=0&&y>=0&&x+w<=1920&&y+h<=1080);const layers=[];
  for(const [i,b] of stages.entries()){
    const path=join(out,'originals',labels[i],b.stills[id].rel);
    const part=await sharp(path).extract({left:x,top:y,width:w,height:h}).resize(pw,ph,{fit:'fill'}).png().toBuffer();
    layers.push({input:part,left:i*(pw+3),top:B},
      {input:band(pw,B,(i?'AFTER':'BEFORE')+'   /   '+b.stage,title),left:i*(pw+3),top:0});
  }
  await baseCanvas(pw*2+3,ph+B).composite(layers).png().toFile(join(out,'plates',slug+'.png'));
}
for(const [name,rows] of [['gear-overview',plates.slice(0,5)],['environment-overview',plates.slice(5)]]){
  const tw=600,th=362,cols=2,n=Math.ceil(rows.length/cols),layers=[];
  for(const [i,[slug,title]] of rows.entries()){
    const top=Math.floor(i/cols)*th,left=i%cols*tw;
    layers.push({input:band(tw,32,title),top,left},{input:await sharp(join(out,'plates',slug+'.png')).resize(tw,th-32,{fit:'contain',background:'#151c1e'}).png().toBuffer(),top:top+32,left});
  }
  await baseCanvas(tw*cols,th*n).composite(layers).jpeg({quality:93,chromaSubsampling:'4:4:4'}).toFile(join(out,name+'.jpg'));
}
const src=(i,rel)=>'originals/'+labels[i]+'/'+rel;
const link=(url,text)=>'<a href="'+escape(url)+'">'+escape(text)+'</a>';
const figure=([slug,title,id,crop,caption])=>{
  const [a,b]=stages.map(x=>x.stills[id]),role=a.s.actor||a.s.camera;
  return '<article id="'+slug+'"><div class="heading"><h3>'+escape(title)+'</h3><span>'+escape(caption)+'</span></div><a href="plates/'+slug+'.png"><img loading="lazy" alt="Matched before and after: '+escape(title)+'" src="plates/'+slug+'.png"></a><div class="meta">'+escape(role)+' · '+(crop?'Crop x '+crop[0]+', y '+crop[1]+' · '+crop[2]+' × '+crop[3]:'Entire 1920 × 1080 frame')+'<br>'+link(src(0,a.rel),'Before original')+' &nbsp; '+link(src(1,b.rel),'After original')+' &nbsp; '+link('plates/'+slug+'.png','Open diptych')+'</div></article>';
};
const motion=['embassy','river'].map(sc=>'<article><div class="heading"><h3>'+(sc==='embassy'?'Embassy downpour':'River crossing')+' · chase film</h3></div><div class="pair">'+stages.map((b,i)=>{
  const f=b.films[sc];return '<div><p>'+labels[i].toUpperCase()+' / '+b.stage+'</p>'+(f?'<video id="v-'+sc+i+'" controls playsinline preload="none" poster="'+src(i,b.stills[sc+'-chase'].rel)+'" src="'+src(i,f.rel)+'"></video><div class="meta">'+f.duration.toFixed(2)+'s · 1920 × 1080 · '+link(src(i,f.rel),'Original MP4')+' · '+link(src(i,f.receipt),'Capture receipt')+'</div>':'<p class="missing">No baseline river film was retained. The full R14 river chase still is available above.</p>')+'</div>';}).join('')+'</div>'+(stages.every(b=>b.films[sc])?'<button data-scene="'+sc+'">Restart and play both</button>':'')+'</article>').join('');
const originals=[...vistas,...kits].map(id=>'<tr><td>'+escape(id)+'</td>'+stages.map((b,i)=>'<td>'+link(src(i,b.stills[id].rel),'Full PNG')+'</td>').join('')+'</tr>').join('');
const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ghost Signal · '+base+' vs '+after+'</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#101619;color:#eee9de;font:16px/1.55 system-ui,sans-serif}main{max-width:1250px;margin:auto;padding:32px clamp(16px,4vw,58px) 54px}h1{font-size:clamp(32px,5vw,64px);line-height:1.05;margin:.2em 0}h2{font-size:30px;margin:52px 0 12px}h3{font-size:20px;margin:0}a{color:#b5d8cd;text-underline-offset:3px}nav a{display:inline-block;margin:0 20px 6px 0}.kicker,button{font-size:13px;font-weight:bold;letter-spacing:.08em;color:#e6ba83}article{border:1px solid #3c4847;background:#192124;margin:18px 0 27px;overflow:hidden;border-radius:7px}.heading,.meta,article>button{padding:10px 16px}.heading span,.meta,small{color:#b6beb9}.heading{display:flex;align-items:center;gap:15px;justify-content:space-between}.meta,small{font-size:14px}img,video{max-width:100%;display:block}article>a img{width:100%;height:auto}article>button{background:#202c2b;border:1px solid #66766f;margin:12px;cursor:pointer}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 14px 12px}.pair p{font-size:13px;letter-spacing:.05em}.pair .missing{padding:20px;border:1px dashed #60716c}table{border-collapse:collapse;margin:12px 0 24px}td,th{text-align:left;border-bottom:1px solid #3b4744;padding:7px 22px 7px 0}code{overflow-wrap:anywhere;color:#d6d1bc}.badge{font-weight:650;color:#e5b87e}section:target{outline:1px solid #586865;outline-offset:5px}@media(max-width:650px){.pair{grid-template-columns:1fr}.heading{display:block}main{padding:18px 12px}.heading span{font-size:13px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}</style><main>'+
  '<div class="kicker">TANKDELETE &nbsp; / &nbsp; FIELD ART REVIEW</div><h1>Ghost Signal</h1><p><strong>'+base+' → '+after+'</strong> · Two production practice builds. Before is always left. '+(after==='micro-r15'?'<span class="badge">R15 preview.</span>':'')+'</p><nav>'+[['kit','01 · Field kit'],['world','02 · Environment'],['motion','03 · Motion'],['receipts','04 · Originals & receipts']].map(([x,t])=>link('#'+x,t)).join('')+'</nav>'+
  '<p>The same actor and lens, or the same world camera, are matched across builds. The game clock, foliage motion and enemy motion were not synchronized. Diptychs use only the named identical crops and uniform scale. No retouching, grading, sharpening or overlays on the gameplay image. Labels are outside the image.</p>'+
  '<section id="kit"><h2>01 · Field kit</h2>'+link('gear-overview.jpg','Open gear overview')+plates.slice(0,5).map(figure).join('')+'</section><section id="world"><h2>02 · Environment</h2>'+link('environment-overview.jpg','Open environment overview')+plates.slice(5).map(figure).join('')+'</section><section id="motion"><h2>03 · Motion</h2><p>Unmodified chase-camera recordings. Use these to inspect rain and smoke in motion, not to qualify frame time.</p>'+motion+'</section>'+
  '<section id="receipts"><h2>04 · Originals & receipts</h2><p>The original PNGs, MP4s and capture receipts are included in this folder. Each original PNG was checked against its capture SHA-256. Film hashes are computed at packaging time; the original film receipts identify the bundle, camera, duration and recorded buffers.</p><table><tr><th>Camera / actor study</th><th>'+base+'</th><th>'+after+'</th></tr>'+originals+'</table>'+
  stages.map((b,i)=>'<p><strong>'+b.stage+'</strong> · <code>'+b.bundle+'</code><br><small>Bundle SHA-256 reported by kit capture: <code>'+b.jsHash+'</code></small><br>'+link(src(i,'receipt.json'),'World cameras')+' · '+link(src(i,'kit/kit.json'),'Actor cameras')+'</p>').join('')+link('verification.json','Open verification manifest')+'</section></main><script>for(const b of document.querySelectorAll("button[data-scene]"))b.onclick=()=>{for(const i of [0,1]){const v=document.getElementById("v-"+b.dataset.scene+i);v.currentTime=0;v.play().catch(()=>{});}};</script></html>';
await writeFile(join(out,'index.html'),html);
const manifest={before:base,after,sourceDimensions:pngSize,method:'Same crop and uniform scale only; original bytes included unchanged.',plates:plates.map(([id,title,shot,crop])=>({id,title,shot,crop})),
  builds:stages.map((b,i)=>({label:labels[i],stage:b.stage,bundle:b.bundle,reportedBundleSHA256:b.jsHash,films:b.films,files:Object.fromEntries(b.files)}))};
await writeFile(join(out,'verification.json'),JSON.stringify(manifest,null,2)+'\n');
for(const [,url] of html.matchAll(/(?:href|src|poster)="([^"]+)"/g))if(!url.startsWith('#'))await access(join(out,url));
await rename(out,folder);
// Only the freshly generated allowlisted art dossier goes into the ZIP.
execFileSync('zip',['-q','-0','-r','field-art-review.zip','field-art-review'],{cwd:destination});
execFileSync('unzip',['-tq',zip]);console.log(join(folder,'index.html')+'\n'+zip);
