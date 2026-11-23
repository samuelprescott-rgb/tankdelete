// Offline gallery, no renderer. Usage: node scripts/compose-command-storm-review.mjs micro-r19
// All required pairs must exist; missing receipts/media never become an apparent pass.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {constants} from 'node:fs';
import {access,copyFile,mkdir,mkdtemp,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const [candidate,mode]=process.argv.slice(2),baseline='micro-r14';
const baseOnly=candidate==='--check-baseline'&&!mode;
assert(baseOnly||(/^micro-r(?:1[5-9]|[2-9]\d|\d{3,})$/.test(candidate||'')&&(!mode||mode==='--check')),
  'Usage: node scripts/compose-command-storm-review.mjs micro-rN [--check], or --check-baseline');
let sharp;try{sharp=createRequire(import.meta.url)('sharp');}catch{sharp=createRequire(process.execPath)('sharp');}
const game=fileURLToPath(new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/game/',import.meta.url));
const dest=join(game,candidate),name='command-storm-review',gallery=join(dest,name),zip=join(dest,name+'.zip');
const exists=async p=>{try{await access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const sha=b=>createHash('sha256').update(b).digest('hex'),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const singleton=(list,id,key='id')=>{const hits=list.filter(x=>x[key]===id);assert.equal(hits.length,1,'missing or repeated '+id);return hits[0];};
const near=(a,b,d,why)=>{assert.equal(a.length,b.length,why);assert(a.every((v,i)=>Number.isFinite(v)&&Math.abs(v-b[i])<d),why);};
const study=[
  ['ordinary','01 · Embassy in play','Archive layout, recess, working flag, right-hand emplacement','env','embassy-chase'],
  ['roof','01 · Embassy in play','Annex massing and broken roof','env','embassy-scenic'],
  ['front','01 · Embassy in play','Door, pole and central facade','env','embassy-facade'],
  ['day-sky','02 · Sky and weather','River · upper sky and distant canopy','env','river-chase',[0,0,1920,470]],
  ['storm','02 · Sky and weather','Embassy · storm layers, weather and roofline','env','embassy-scenic',[0,0,1920,460]],
  ['water','03 · Surface work','Water and light under the crossing','surface','water',[580,650,530,340]],
  ['bark','03 · Surface work','Trunk · bark and wet grain','surface','bark',[780,270,530,340]],
  ['sandbags','03 · Surface work','Field sandbag · weave and weight','surface','sandbag',[720,425,530,340]],
  ['fig-roots','03 · Surface work','Riverbank fig · roots enter the water','shore','bank-fig-roots'],
  ['wet-ledge','03 · Surface work','Riverbank · wet ledge and waterline','shore','bank-wet-ledge'],
  ['contact','04 · Final contact','Command · ordinary player view at contact','chase','contact'],
  ['front-left','04 · Final contact','Command · near three-quarter silhouette','command','front-left'],
  ['profile','04 · Final contact','Command · profile and gait','command','profile-right'],
  ['face','04 · Final contact','Command · front portrait','command','front-portrait'],
  ['eye5','05 · Ordinary undead','Red eyes · five metres','eye','undead-eyes-5m',[720,382,480,312]],
  ['eye16','05 · Ordinary undead','Red eyes · sixteen metres','eye','undead-eyes-16m',[805,446,310,194]],
  ['eye25','05 · Ordinary undead','Red eyes · twenty-five metres','eye','undead-eyes-25m',[840,455,240,170]],
  ...['campaign','embassy'].flatMap(route=>['seated-near','seated-reverse','at-sill','ground-handoff','cabin-empty'].map(cue=>
    [route+'-'+cue,'06 · Helicopter transport',(route==='campaign'?'Kestrel':'Rook')+' · '+({'seated-near':'seated, near door','seated-reverse':'seated, opposite door','at-sill':'at the sill','ground-handoff':'first ground owner','cabin-empty':'unloaded cabin'}[cue]),'cabin',route+':'+cue])),
];
const films=[
  ['command/boss-player-chase.mp4','Command · player chase','command/player-chase.json'],
  ['command/boss-walk.mp4','Command · gait study','command/receipt.json'],
  ['conditions/embassy-player.mp4','Embassy · ordinary weather in motion','conditions/embassy-film.json'],
  ['conditions/river-player.mp4','River · ordinary sky in motion','conditions/river-film.json'],
];
const sides=['before','after'],labels=[baseline,candidate];
async function collect(stage,old){
  const root=join(game,stage),files=new Map(),read=async rel=>{
    assert(/^[A-Za-z0-9_/-][A-Za-z0-9_.\/-]*$/.test(rel)&&!rel.split('/').includes('..')&&!rel.startsWith('/'));
    const bytes=await readFile(join(root,rel));files.set(rel,sha(bytes));return bytes;
  },json=async rel=>JSON.parse(await read(rel));
  const world=await json('receipt.json'),shore=await json('shore/receipt.json'),surface=await json('surface-receipt.json'),boss=await json('command/receipt.json'),
    chase=await json('command/player-chase.json'),bundle=basename(world.builds[0]);
  assert.equal(world.builds.length,1);assert.equal(world.stage,stage);assert.equal(world.pass,true);assert.deepEqual(world.errors,[]);
  assert.equal(shore.stage,stage);assert.equal(shore.pass,true);assert.deepEqual(shore.errors,[]);assert.deepEqual(shore.builds,world.builds);
  for(const x of [surface,boss])assert.deepEqual(x.errors,[]);assert.equal(surface.pass,true);assert.equal(surface.stage,stage);
  for(const x of [surface.expected,boss.bundle,chase.bundle])assert.equal(basename(x),bundle,'mixed stage bundle');
  const dir=await readdir(join(root,'cabin'));
  const receipts=dir.filter(p=>old?/^transport-cabin-baseline-(both|campaign|embassy)\.json$/.test(p):
    /^transport-cabin-(both|campaign|embassy)\.json$/.test(p));
  assert(receipts.length,'missing '+stage+' cabin '+(old?'baseline':'candidate')+' receipt');
  const cabin=new Map();
  for(const filename of receipts){
    const rel='cabin/'+filename,c=await json(rel);assert.deepEqual(c.errors,[]);
    if(old){assert.equal(c.captureComplete,true);assert.equal(c.pass,false,'baseline must not assert candidate ticket gates');}
    else assert.equal(c.pass,true,'candidate did not pass its live transfer checks');
    for(const run of c.runs){assert.equal(run.bundle,bundle);assert(/^[a-f\d]{64}$/.test(run.bundleSha256));
      assert(!cabin.has(run.mode),'ambiguous transport receipt; keep either both or the individual runs, not duplicates');
      cabin.set(run.mode,{run,rel});}
  }
  const checks={},still={};
  for(const [id,,title,kind,subject] of study){
    let rel,receipt,row,fileHash;
    if(kind==='env'){row=singleton(world.shots,subject);rel=subject+'.png';receipt='receipt.json';fileHash=row.sha256;
      assert.equal(basename(row.bundle),bundle);assert.equal(row.dpr,1);}
    if(kind==='surface'){row=singleton(surface.shots,subject);rel=row.filename;receipt='surface-receipt.json';fileHash=row.sha256;}
    if(kind==='shore'){row=singleton(shore.shots,subject);rel='shore/'+subject+'.png';receipt='shore/receipt.json';fileHash=row.sha256;
      assert.equal(row.camera,'fixed');assert.equal(row.dpr,1);assert.equal(basename(row.bundle),bundle);}
    if(kind==='command'||kind==='eye'){row=singleton(kind==='eye'?boss.eyes:boss.shots,subject,'name');
      rel='command/'+subject+'.png';receipt='command/receipt.json';}
    if(kind==='chase'){row=singleton(chase.picks,subject,'name');rel='command/player-'+subject+'.jpg';receipt='command/player-chase.json';}
    if(kind==='cabin'){const [flight,cue]=subject.split(':'),run=cabin.get(flight);assert(run,'missing '+flight);
      row=singleton(run.run.shots,cue,'label');rel='cabin/'+row.file;receipt=run.rel;fileHash=row.sha256;}
    const bytes=await read(rel),meta=await sharp(bytes).metadata();assert.deepEqual([meta.width,meta.height],[1920,1080],rel);
    if(fileHash)assert.equal(files.get(rel),fileHash,stage+' capture SHA mismatch '+rel);
    still[id]={rel,receipt,kind,title,sha256:files.get(rel),hashSource:fileHash?'capture receipt matched':'calculated on original during packaging'};
    checks[id]=row;
  }
  const video={};
  for(const [rel,title,receipt] of films){
    let r;if(receipt.startsWith('conditions/')){r=await json(receipt);assert.equal(r.bundle,bundle);assert.deepEqual(r.errors,[]);
      assert.equal(r.film,basename(rel));assert(r.frames>0&&r.realSeconds>0);}
    const bytes=await read(rel);assert(bytes.length>1000,rel);
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,codec_name:format=duration','-of','json',join(root,rel)],{encoding:'utf8'}));
    const stream=info.streams[0],duration=+info.format.duration;
    const size=[stream.width,stream.height];
    assert(size.join('x')==='1920x1080'||(rel==='command/boss-walk.mp4'&&size.join('x')==='960x540'),
      'unexpected source film dimensions '+rel+' '+size);
    assert.equal(stream.codec_name,'h264');assert(duration>0);
    if(r)assert(Math.abs(duration-r.realSeconds)<.6,'video duration inconsistent with capture');
    video[rel]={title,receipt,sha256:files.get(rel),seconds:duration,size};
  }
  return {stage,root,files,checks,still,video,bundle};
}
if(baseOnly){const data=await collect(baseline,true);console.log('Baseline only: verified '+study.length+' untouched capture inputs, '
  +films.length+' supported video containers and their receipts from '+data.bundle+'. No candidate assertions evaluated.');process.exit(0);}
const bins=await Promise.all(labels.map((s,i)=>collect(s,i===0)));
assert.notEqual(bins[0].bundle,bins[1].bundle,'before/after resolved to the same build');
for(const [id,,,kind] of study){
  const [a,b]=bins.map(s=>s.checks[id]);
  if(kind==='env'||kind==='surface'||kind==='shore'){near(a.eye,b.eye,.005,id+' world eye');near(a.quaternion,b.quaternion,.0006,id+' view');}
  if(kind==='shore'){assert.deepEqual(a.look,b.look,'macro world target');assert.equal(a.verticalFov,b.verticalFov);}
  if(kind==='eye')assert(Math.abs(a.distance-b.distance)<.025,'different measured eye distance');
  if(kind==='cabin'){assert.equal(a.goal,b.goal);assert.equal(a.fov,b.fov);near(a.camera,b.camera,.05,id+' camera');
    assert(Math.abs(a.t-b.t)<.3,'not a phase-matched cabin capture');}
}
if(mode==='--check'){console.log('Verified '+study.length+' before/after frame pairs and '+films.length+' paired films.');process.exit(0);}
assert(!await exists(gallery)&&!await exists(zip),'Refusing to replace an existing command/storm gallery');
const out=await mkdtemp(join(dest,'.command-storm-review-'));await mkdir(join(out,'plates'));
const href=(i,rel)=>'originals/'+sides[i]+'/'+rel;
for(const [i,b] of bins.entries())for(const [rel,digest] of b.files){
  const target=join(out,href(i,rel));await mkdir(dirname(target),{recursive:true});
  await copyFile(join(b.root,rel),target,constants.COPYFILE_EXCL|constants.COPYFILE_FICLONE);
  assert.equal(sha(await readFile(target)),digest,'copied source changed: '+rel);
}
const svg=(w,h,t1,t2)=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#182126"/><text x="15" y="26" fill="#eee8d5" font-family="Helvetica,sans-serif" font-size="17">'+esc(t1)+'</text><text x="'+(w-15)+'" y="26" text-anchor="end" fill="#b4bbad" font-family="Helvetica,sans-serif" font-size="13">'+esc(t2)+'</text></svg>');
const sections=new Map(),manifest=[];
for(const [id,section,title,kind,,crop] of study){
  const [x,y,w,h]=crop??[0,0,1920,1080],width=Math.min(w,740),height=Math.round(h*width/w),bar=39,gutter=5;
  const layers=[];for(const [i,b] of bins.entries()){
    const src=b.still[id],left=i*(width+gutter),frame=await sharp(join(out,href(i,src.rel)))
      .extract({left:x,top:y,width:w,height:h}).resize(width,height,{kernel:'lanczos3'}).png().toBuffer();
    layers.push({input:svg(width,bar,i?'AFTER':'BEFORE',b.stage),left,top:0},{input:frame,left,top:bar});
  }
  const plate='plates/'+id+'.png',data=await sharp({create:{width:width*2+gutter,height:height+bar,channels:3,background:'#121b1e'}}).composite(layers).png().toBuffer();
  await writeFile(join(out,plate),data);
  const link=(i,k,txt)=>'<a href="'+esc(href(i,bins[i].still[id][k]))+'">'+txt+'</a>';
  const caption=kind==='chase'?'Same ordinary contact event; moving actor and gameplay are not pixel-registered.':
    kind==='command'?(bins[1].checks[id].protocol==='disclosed clearance offset'
      ?'Same named body study, with a disclosed after-camera offset to clear real scenery; these are not perfectly registered angles. See the after receipt for the offset.'
      :'Same named actor-relative study; gait phase and world background may differ.'):
    kind==='eye'?'Same measured distance. The crop is native pixels; neither eye color nor exposure was changed.':
    kind==='cabin'?'Same flight phase and cabin inspection camera. The earlier shot records the old cabin; it does not pass the new ownership checks.':
    'Same fixed 1080p capture rectangle. Water and weather are live, not phase-locked.';
  if(!sections.has(section))sections.set(section,[]);
  sections.get(section).push('<article><h3>'+esc(title)+'</h3><a href="'+plate+'"><img loading="lazy" src="'+plate+'" alt="'+esc(title)+' before, then after"></a><p>'+caption+'</p><p>Full frames: '+link(0,'rel','before')+' · '+link(1,'rel','after')+' &nbsp; Receipts: '+link(0,'receipt','before')+' · '+link(1,'receipt','after')+'</p></article>');
  manifest.push({id,title,plate,crop:[x,y,w,h],plateSha256:sha(data),before:bins[0].still[id],after:bins[1].still[id]});
}
const movie=films.map(([rel,title,rec])=>'<article><h3>'+esc(title)+'</h3><div class="films">'+bins.map((b,i)=>
  '<div><p>'+esc(b.stage)+' · '+b.video[rel].size.join('×')+' · '+b.video[rel].seconds.toFixed(1)+' s</p><video preload="none" controls src="'+href(i,rel)+'"></video><p><a href="'+href(i,rel)+'">Original MP4</a> · <a href="'+href(i,rec)+'">Capture receipt</a></p></div>').join('')+'</div></article>').join('');
const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Command / storm · '+esc(candidate)+'</title><style>*{box-sizing:border-box}body{margin:0;background:#11191c;color:#e8e7d9;font:16px/1.6 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:2em 3vw}h1{font-size:clamp(2rem,5vw,4.5rem);line-height:1.05;margin:.3em 0}h2{border-top:1px solid #586257;padding-top:1em;color:#d5ba85}h3{margin-bottom:.45em}p{color:#bac4ba}article{margin:1.5em 0 3em}a{color:#eac990}img{max-width:100%;height:auto;display:block}.films{display:grid;grid-template-columns:1fr 1fr;gap:1em}video{width:100%;background:#080c0e}@media(max-width:650px){.films{grid-template-columns:1fr}}</style><main><header><small>TANKDELETE / IN-GAME ART EVIDENCE</small><h1>Command and storm</h1><p>'+esc(labels.join(' → '))+'. Actual 1920×1080 game captures. Open a plate to inspect it, or open its full original and capture receipt. No paint-over, compositing into the scene, grading, or frame reconstruction. These comparisons do not certify frame time.</p><a href="verification.json">Verification manifest</a></header>'+
  [...sections].map(([s,rows])=>'<section><h2>'+esc(s)+'</h2>'+rows.join('')+'</section>').join('')+'<section><h2>07 · Original motion</h2>'+movie+'</section></main></html>';
await writeFile(join(out,'index.html'),html);await writeFile(join(out,'verification.json'),JSON.stringify({baseline,candidate,
  sources:bins.map((b,i)=>({stage:b.stage,bundle:b.bundle,root:'originals/'+sides[i],sha256:Object.fromEntries(b.files)})),plates:manifest,films:bins.map(b=>b.video)},null,2)+'\n');
for(const [,u] of html.matchAll(/(?:src|href)="([^"]+)"/g))await access(join(out,u));
await rename(out,gallery);execFileSync('zip',['-q','-0','-r',name+'.zip',name],{cwd:dest});execFileSync('unzip',['-tq',zip]);
console.log(join(gallery,'index.html')+'\n'+zip);
