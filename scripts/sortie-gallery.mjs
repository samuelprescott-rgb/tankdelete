// Offline evidence reader. No game, browser, network, AI, image edits or recapture.
// node scripts/sortie-gallery.mjs OUTPUT_DIR replaced-r6 RELIEF_REPORT_DIR [PACKAGE_DIR] [--sheets]
// Source stills are in replaced-gauntlet/{1080,1440}p. OUTPUT_DIR is exact (no latest-run discovery).
// Leave --sheets off during device benchmarking. Missing evidence yields a usable partial gallery + exit 2.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRookFilm } from './qa-rook-film.mjs';

const args=process.argv.slice(2), sheets=args.at(-1)==='--sheets';
if(sheets)args.pop();
if(args.length<3 || args.length>4 || !/^replaced-r[1-9]\d*$/.test(args[1]) || args[1]==='replaced-r3')
  throw Error('Expected: OUTPUT_DIR replaced-rN RELIEF_REPORT_DIR [PACKAGE_DIR] [--sheets] (baseline: replaced-r3)');
const [outputArg,stage,flightArg,deskArg]=args;
const output=path.resolve(outputArg), flight=path.resolve(flightArg), desk=deskArg&&path.resolve(deskArg);
const root=fileURLToPath(new URL('../../TankDelete-Concepts/replaced-gauntlet/',import.meta.url));
const baseline='replaced-r3', assets='sortie-'+stage+'-assets';
const bundlePattern=/^\/assets\/GameSession-[\w-]+\.js$/, hashPattern=/^[a-f\d]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const issues=[],manifest={baseline,stage,bundles:{},comparisons:[],flight:[],nativeDesk:null,issues};
const sizes=[[1920,1080],[2560,1440]], sceneViews=[['embassy-chase','Player view · normal HUD'],['embassy-facade','Archive entrance · close view']];
const flightFrames=[['rook-1-airborne','01 · Arrival'],['rook-2-disembark','02 · Step clear'],['rook-3-squad-in-combat','03 · Squad in combat'],['rook-4-liftoff','04 · Lift-off']];
// A projected actor can be visible to Three while the player's UI covers it.
// Pixel-review exceptions are keyed by the bytes, not a run or a filename.
const visualRejections=new Map([
  ['27b69f2bdb12dbd2cb7ef5609ecd61955899315f6f6a423a5a5913a655418690','The wave-two title card obscures the arriving Huey in the original PNG.'],
]);
const check=(v,msg)=>{if(!v)throw Error(msg);};
const dims=(a,b)=>Array.isArray(a)&&a.length===2&&a[0]===b[0]&&a[1]===b[1];
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const equalVector=(a,b,n)=>vector(a,n)&&vector(b,n)&&a.every((v,i)=>Math.abs(v-b[i])<0.0001);
const link=f=>path.relative(output,f).split(path.sep).map(encodeURIComponent).join('/');
const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const note=(label,e)=>{const reason=e.code==='ENOENT'?'Missing '+path.basename(e.path):e.message; issues.push({label,reason});return reason;};
const once=(a,p,why)=>{const rows=(a??[]).filter(p);check(rows.length===1,why);return rows[0];};
const readCapture=async (f,expected,expectedSize)=>{
  const b=await readFile(f),digest=sha(b);
  check(b.length>32&&b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&b.toString('ascii',12,16)==='IHDR','Not an original PNG');
  const size=[b.readUInt32BE(16),b.readUInt32BE(20)];
  check(size.every(n=>n>0&&n<=16384)&&(!expectedSize||dims(size,expectedSize)),'PNG dimensions differ from capture');
  if(expected!=null)check(hashPattern.test(expected)&&expected===digest,'Screenshot SHA-256 mismatch');
  return {b,digest,size};
};
await mkdir(path.join(output,assets),{recursive:true});
// Content-addressed byte copies keep this page usable after a temporary evidence path is retired.
// Never replace a screenshot, even if the destination already exists.
async function publish(name,bytes,ext){
  const digest=sha(bytes),dest=path.join(output,assets,name+'-'+digest.slice(0,16)+'.'+ext);
  try{await writeFile(dest,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  check(sha(await readFile(dest))===digest,'Published asset readback differs from source: '+name);
  return link(dest);
}
async function receipt(file,label){
  const bytes=await readFile(file),data=JSON.parse(bytes.toString('utf8'));
  return {data,url:await publish(label,bytes,'json')};
}
async function photo(src,name,label,expected,size,extra={}){
  const p=await readCapture(src,expected,size);
  const detail=typeof extra==='function'?extra(p.b):extra;
  return {label,href:await publish(name,p.b,'png'),size:p.size,sha256:p.digest,
    hashSource:expected?'capture receipt verified':'computed at gallery assembly; capture receipt has no image digest',...detail};
}
const receipts=new Map(),currentBundle={};
for(const size of sizes)for(const round of [baseline,stage]){
  const k=round+'-'+size[1],dir=path.join(root,size[1]+'p',round);
  try{
    const {data:r,url}=await receipt(path.join(dir,'receipt.json'),k+'-receipt');
    check(r.stage===round&&r.pass===true&&r.errors?.length===0,'Unfinished or different art capture');
    check(r.builds?.length===1&&bundlePattern.test(r.builds[0]),'No unique production gameplay bundle in art receipt');
    if(currentBundle[round])check(currentBundle[round]===r.builds[0],'1080p and 1440p gameplay bundles differ');
    currentBundle[round]=r.builds[0]; receipts.set(k,{r,url,dir});
  }catch(e){note(k,e);}
}
manifest.bundles=currentBundle;
for(const size of sizes)for(const [id,title] of sceneViews){
  const pair={title,size,id,photos:[]};manifest.comparisons.push(pair);
  try{
    const both=[baseline,stage].map(round=>receipts.get(round+'-'+size[1]));
    check(both.every(Boolean),'Source receipt unavailable or invalid');
    check(currentBundle[stage]!==currentBundle[baseline],'Before and after are the same gameplay bundle');
    const meta=both.map(({r})=>{
      const s=once(r.shots,s=>s.id===id,'Missing or duplicate '+id+' capture');
      check(s.slice==='embassy'&&new URL(s.url).searchParams.get('ghostSignal')==='embassy'&&s.bundle===r.builds[0],
        'Wrong scene, route or build in capture');
      check(s.renderTicks>0&&s.dpr===1&&dims(s.canvas,size)&&hashPattern.test(s.sha256),'Missing full-size capture evidence');
      check(id==='embassy-chase'?s.camera==='production chase'&&/Saigon.*Embassy defense/i.test(s.hud):s.camera==='fixed'&&s.hud==='','Wrong HUD or camera mode');
      return s;
    });
    const [a,b]=meta;
    check(a.verticalFov===60&&b.verticalFov===60&&equalVector(a.eye,b.eye,3)&&equalVector(a.tank,b.tank,3)
      &&equalVector(a.quaternion,b.quaternion,4)&&(id==='embassy-chase'||equalVector(a.look,b.look,3)),'Camera or tank position does not match');
    for(const [i,{dir,url}] of both.entries()){
      const round=i?stage:baseline;
      pair.photos.push(await photo(path.join(dir,id+'.png'),round+'-'+size[1]+'-'+id,(i?'After':'Before')+' · '+round,meta[i].sha256,size,{receipt:url}));
    }
  }catch(e){pair.error=note(size[1]+'p / '+id,e);pair.photos=[];}
}

let horde;
try{
  const {data:r,url}=await receipt(path.join(flight,'report.json'),'relief-report');
  manifest.flightReceipt=url;
  check(r.mode==='horde'&&r.defenseJourney?.policy==='relief'&&r.checks?.earnedReplay===true&&r.campaign&&r.before?.hud?.nightmare===true&&/Embassy defense/i.test(r.before.hud.header),'Not an earned embassy relief replay');
  check(r.before.viewport?.devicePixelRatio===1&&!r.before.viewport.hidden&&!r.before.hud.reviewControls&&r.before.canvas?.bufferWidth===r.width&&r.before.canvas?.bufferHeight===r.height&&sizes.some(s=>dims(s,[r.width,r.height])),'Unexpected viewport or render buffer');
  check(currentBundle[stage]&&hashPattern.test(r.artifact?.[currentBundle[stage].slice(1)]??''),'Relief report does not identify the candidate gameplay bundle');
  horde=r;
  manifest.flightOutcome=r.defenseJourney.outcome;
  if(r.status!=='checks-passed'||r.checks.trustedInputLanding!==true||r.defenseJourney.outcome!=='relief-complete')
    note('Flight acceptance',Error('Replay did not clear all acceptance checks: '+r.defenseJourney.outcome));
}catch(e){manifest.flightError=note('Relief replay',e);}
let lastMs=-1;
const seenFlightHashes=new Set();
for(const [i,[id,label]] of flightFrames.entries()){
  if(!horde){manifest.flight.push({label,error:manifest.flightError});continue;}
  try{
    const m=once(horde.defenseJourney.relief,x=>x.name===id,'No accepted game-state witness for this moment');
    check(vector(m.camera?.xyz,3)&&vector(m.camera?.quaternion,4)&&m.camera.fov===60&&Number.isFinite(m.ms)&&m.ms>lastMs,'No ordered player-camera witness');
    const w=horde.width,h=horde.height,a=m.air,seen=a?.inView&&a.visible,shooters=new Set(m.actualShooters??[]);
    if(i===0)check(seen&&a.xyz[1]>1.85&&m.projectedHubToTail>=w*.055&&m.passengers?.length===0,'Inbound aircraft not established');
    if(i===1){
      const v=m.witness,p=m.after?.passengers?.find(x=>x.id===v?.id);
      check(seen&&m.projectedHubToTail>=w*.065&&v?.metersFromSill>.98&&v.horizontalGapPx>w*.023&&v.bootToSoilPx>h*.009&&v.holdMs>=55&&p?.feet[1]>.12&&p.chestVisible&&p.bootsVisible,'No sustained, unobscured step away from the sill');
    }
    if(i===2)check(shooters.size===4&&m.passengers?.filter(p=>p.inView&&p.feet[1]<.04).length>=2&&m.passengers.some(p=>p.inView&&p.flash&&p.feet[1]<.04)&&m.opponents?.length>=2,'No witnessed four-person engagement');
    if(i===3)check(seen&&shooters.size===4&&m.parked&&a.xyz[1]>m.parked[1]+1.55&&Math.hypot(a.xyz[0]-m.parked[0],a.xyz[2]-m.parked[2])>1.4&&m.projectedHubToTail>w*.035,'No visible lift and departure from the landed position');
    // A timed witness can retry a filename. The final PNG must match the last screenshot receipt, not a discarded intermediate capture.
    const file=id+'.png',snap=horde.screenshots?.filter(x=>x.file===file).at(-1);
    check(snap&&hashPattern.test(snap.sha256)&&!seenFlightHashes.has(snap.sha256),'Missing or reused PNG capture hash');
    check(!visualRejections.has(snap.sha256),visualRejections.get(snap.sha256));
    if(m.photo||m.film)check(m.film?.clear&&m.photo?.title?.clear&&m.after?.photo?.title?.clear&&m.msSinceTitleCleared>=130
      &&(i!==0||m.photo.uncovered&&m.after.photo.uncovered),'Replay records an overlay over this moment');
    const p=await photo(path.join(flight,file),id,label,snap.sha256,[w,h],bytes=>{
      const film=inspectRookFilm(bytes);
      check(film.clear,'The rendered playfield or title band failed the PNG visibility check');
      const subject=i===1?m.passengers.find(p=>p.id===m.witness.id)?.boot?.screen
        :i===2?m.passengers.find(p=>p.inView&&p.flash&&p.feet[1]<.04)?.screen:a.screen;
      const subjectName=['Approaching aircraft','Stepping passenger’s boots','Firing squad member','Departing aircraft'][i];
      const spot=vector(subject,2)?subject.map(Math.round):null;
      return {ms:m.ms,film,...(spot?{subject:{name:subjectName,pixel:spot},hint:subjectName+': '+Math.round(100*spot[0]/w)+'% from left, '+Math.round(100*spot[1]/h)+'% from top.'}:{})};
    });
    manifest.flight.push(p);lastMs=m.ms;seenFlightHashes.add(p.sha256);
  }catch(e){manifest.flight.push({label,error:note(label,e)});}
}
if(desk){
  try{
    const {data:n,url}=await receipt(path.join(desk,'workshop-boot.json'),'native-smoke'),pkg=await readJSON(path.join(desk,'package.json'));
    check(n.pass===true&&n.id===pkg.id&&n.app===pkg.app&&n.ownedWindowImages?.includes('workshop-desk.png')&&n.statesInOrder?.join('/')==='menu/desk'&&n.pid>0&&n.windowID>0,'No owned packaged Desk capture');
    check(n.filePickerOpened===false&&n.realFilesSelected===0&&n.trashOperations===0,'Expected a file-free native smoke test');
    check(currentBundle[stage]&&pkg.assets?.includes(path.basename(currentBundle[stage])),'Desk package does not embed the candidate gameplay bundle');
    const app=await realpath(pkg.app),bin=await realpath(pkg.binary);
    check(path.dirname(app)===await realpath(desk)&&bin===path.join(app,'Contents','MacOS','tauri-app'),'Package binary path mismatch');
    check(n.binarySha256===pkg.binarySha256&&sha(await readFile(bin))===n.binarySha256,'Packaged executable hash differs from smoke receipt');
    manifest.nativeDesk=await photo(path.join(desk,'workshop-desk.png'),'native-workshop-desk','Cleanup Desk · native macOS window',null,null,{receipt:url,binarySha256:n.binarySha256});
  }catch(e){manifest.nativeDesk={label:'Native Cleanup Desk',error:note('Native Cleanup Desk',e)};}
}

const unavailable=reason=>'<div class="missing">Not verified: '+esc(reason)+'</div>';
function card(p){
  if(!p.href)return '<figure><figcaption>'+esc(p.label)+'</figcaption>'+unavailable(p.error)+'</figure>';
  const [w,h]=p.size;
  return '<figure><figcaption>'+esc(p.label)+'</figcaption><a href="'+esc(p.href)+'"><img loading="lazy" width="'+w+'" height="'+h+'" src="'+esc(p.href)+'" alt="'+esc(p.label)+' — open full-size original"></a><small>'+w+' × '+h+' · <a href="'+esc(p.href)+'">Original PNG</a>'+(p.ms!=null?' · '+(p.ms/1000).toFixed(1)+' s':'')+(p.hint?'<br>'+esc(p.hint):'')+'</small></figure>';
}
const boardLinks=[];
if(sheets){
  const sharp=createRequire(import.meta.url)('sharp');
  sharp.concurrency(1);
  async function makeSheet(name,rows,w,h){
    const parts=[],header=32,columns=rows[0].length;
    for(const [y,row] of rows.entries())for(const [x,p] of row.entries()){
      const img=await sharp(path.join(output,decodeURIComponent(p.href))).resize(w,h,{fit:'contain'}).png().toBuffer();
      const text=Buffer.from('<svg width="'+w+'" height="'+header+'"><rect width="100%" height="100%" fill="#192827"/><text x="12" y="22" font-size="16" font-family="Helvetica,sans-serif" fill="#f5efe2">'+esc(p.label)+'</text></svg>');
      parts.push({input:text,left:x*w,top:y*(h+header)},{input:img,left:x*w,top:y*(h+header)+header});
    }
    const b=await sharp({create:{width:columns*w,height:rows.length*(h+header),channels:3,background:'#192827'}}).composite(parts).jpeg({quality:93,chromaSubsampling:'4:4:4'}).toBuffer();
    boardLinks.push({name,href:await publish(name,b,'jpg')});
  }
  const art=manifest.comparisons.filter(p=>p.size[1]===1080&&p.photos.length===2);
  if(art.length)await makeSheet('embassy-comparison',art.map(p=>p.photos.map(f=>({...f,label:f.label+' / '+p.title}))),720,405);
  if(manifest.flight.every(p=>p.href))await makeSheet('relief-sequence',[manifest.flight],480,270);
}
manifest.boards=boardLinks;
const jsonName='sortie-'+stage+'.json',htmlName='sortie-'+stage+'.html';
const sections=sizes.map(s=>'<section id="p'+s[1]+'"><h2>Embassy · '+s[1]+'p</h2>'+manifest.comparisons.filter(p=>p.size[1]===s[1]).map(p=>'<h3>'+esc(p.title)+'</h3>'+(p.error?unavailable(p.error):'<div class="pair">'+p.photos.map(card).join('')+'</div>')).join('')+'</section>').join('');
const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ghost Signal · Embassy sortie</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{max-width:1460px;margin:auto;padding:clamp(14px,2.6vw,40px);background:#111b20;color:#e5e9dc;font:16px/1.5 system-ui}a{color:#b6e7d4;text-underline-offset:.18em}h1,h2,h3{line-height:1.18}h1{font-size:clamp(2rem,4vw,3.4rem);margin:.18em 0}h2{margin-top:1.8em}h3{margin:1.4em 0 .5em}p{max-width:83ch}figure{margin:0;min-width:0}figcaption{font-weight:600;padding:.45em 0}img{width:100%;height:auto;display:block}small{color:#c8cfc0}section{border-top:1px solid #364344;margin-top:1.8rem}.pair,.flight{display:grid;gap:10px}.pair{grid-template-columns:repeat(2,minmax(0,1fr))}.flight{grid-template-columns:repeat(4,minmax(0,1fr))}.desk{max-width:800px}.missing{background:#302b24;color:#ead7ac;padding:.7rem}.eyebrow{letter-spacing:.14em;text-transform:uppercase;color:#9fc7bd;font-size:.8rem}nav{display:flex;flex-wrap:wrap;gap:.5em 1.15em}a:focus-visible{outline:3px solid #f1c76a;outline-offset:2px}@media(max-width:760px){.flight{grid-template-columns:repeat(2,minmax(0,1fr))}body{font-size:14px}}</style><main><div class="eyebrow">Ghost Signal / local capture review</div><h1>Embassy sortie</h1><p>Open any still to see its original pixels. The embassy pairs use the same position, orientation and lens. Rain and actors keep moving. The relief sequence uses ordinary player inputs and the in-game chase camera.</p><nav><a href="#p1080">1080p pairs</a><a href="#p1440">1440p pairs</a><a href="#relief">Huey sequence</a>'+(desk?'<a href="#desk">Native Desk</a>':'')+'<a href="'+jsonName+'">Evidence record</a></nav>'+sections+'<section id="relief"><h2>Wave two · Huey relief</h2><div class="flight">'+manifest.flight.map(card).join('')+'</div>'+(manifest.flightReceipt?'<p><a href="'+manifest.flightReceipt+'">Replay record and timestamps</a></p>':'')+'</section>'+(desk?'<section id="desk"><h2>Native Cleanup Desk</h2><div class="desk">'+card(manifest.nativeDesk)+'</div>'+(manifest.nativeDesk.receipt?'<p><a href="'+manifest.nativeDesk.receipt+'">Packaged window verification</a></p>':'')+'</section>':'')+'<section><h2>Source files</h2><nav><a href="'+jsonName+'">Capture evidence and SHA-256</a>'+boardLinks.map(b=>'<a href="'+esc(b.href)+'">'+esc(b.name.replaceAll('-',' '))+' · JPEG preview</a>').join('')+'</nav>'+(issues.length?'<h3>Incomplete evidence</h3><ul>'+issues.map(x=>'<li>'+esc(x.label)+': '+esc(x.reason)+'</li>').join('')+'</ul>':'')+'</section></main></html>';
await writeFile(path.join(output,jsonName),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(output,htmlName),html);
console.log(JSON.stringify({page:path.join(output,htmlName),record:path.join(output,jsonName),pairs:manifest.comparisons.filter(p=>!p.error).length,flight:manifest.flight.filter(p=>p.href).length,nativeDesk:!!manifest.nativeDesk?.href,boards:boardLinks,issues},null,2));
if(issues.length)process.exitCode=2;
