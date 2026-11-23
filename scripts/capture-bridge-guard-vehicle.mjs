// Production-only camera acceptance: physical W/A/D inputs and normal game
// start. Observes rendered objects; never sets a scene transform or game state.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const [port,bundle,folder]=process.argv.slice(2);
assert(/^\d{4,5}$/.test(port)&&/^GameSession-[\w-]+\.js$/.test(bundle)&&folder);
const settleMs=Number(process.argv.find(a=>a.startsWith('--settle-ms='))?.slice(12)??4500);
assert(Number.isFinite(settleMs)&&settleMs>=4500&&settleMs<=30000);
const origin='http://127.0.0.1:'+port,out=resolve(folder);
await mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal','--no-first-run']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={origin,bundle,viewport:[1920,1080],settleMs,method:'Unmodified chase camera. Direct W across bridge to z=29, timed wait. Left turn and approach follow as a separate, explicitly labelled comparison.',frames:[],inputs:[],errors:[]};
const held=new Set();
const stamp=()=>new Date().toISOString();
const receipt=()=>writeFile(join(out,'driver-receipt.json'),JSON.stringify(report,null,2)+'\n');
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(/shader error|VALIDATE_STATUS false|GL_INVALID_OPERATION/i.test(m.text()))report.errors.push(m.text());});
await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
const sample=()=>page.evaluate(()=>window.guardDriverRead());
const until=async(f,a,ms=25000)=>{const h=await page.waitForFunction(f,a,{polling:'raf',timeout:ms});await h.dispose();};
const hold=async(...keys)=>{
 for(const k of [...held])if(!keys.includes(k)){await page.keyboard.up(k);held.delete(k);report.inputs.push({at:stamp(),key:k,down:false});}
 for(const k of keys)if(!held.has(k)){await page.keyboard.down(k);held.add(k);report.inputs.push({at:stamp(),key:k,down:true});}
};
const cdp=await page.context().newCDPSession(page);
const capture=async(label)=>{
 const pre=await sample(),img=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:88,captureBeyondViewport:false}),post=await sample();
 const file=label+'.jpg';await writeFile(join(out,file),Buffer.from(img.data,'base64'));report.frames.push({label,file,pre,post});await receipt();
 console.log(label,JSON.stringify({p:pre.player,g:pre.guard,screen:pre.screen,warning:pre.warn,pulse:pre.pulse,hp:pre.hp}));
};
const dt=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
async function navigate(x,z,faceOnly){
 const end=Date.now()+32000;
 while(Date.now()<end){const s=await sample(),p=s.player,e=dt(Math.atan2(p[0]-x,p[2]-z),s.yaw);
  // A successful pursuing hull may physically cut off the historical
  // follow-up detour. Stop the real drive at contact instead of pressing
  // through the guard, which would only falsify that comparison.
  if(!faceOnly&&Math.hypot(p[0]-s.guard[0],p[2]-s.guard[2])<4.8){await hold();return 'intercepted';}
  if(faceOnly?Math.abs(e)<.10:Math.hypot(p[0]-x,p[2]-z)<1.3){await hold();return;}
  const keys=[];if(Math.abs(e)>.055)keys.push(e>0?'a':'d');if(!faceOnly&&Math.abs(e)<.24)keys.push('w');await hold(...keys);await page.waitForTimeout(55);
 }throw Error('Navigation stalled: '+JSON.stringify(await sample()));
}
let movie=null;
const movieFrames=[];
cdp.on('Page.screencastFrame',({data,sessionId,metadata})=>{
 cdp.send('Page.screencastFrameAck',{sessionId}).catch(()=>{});
 if(!movie)return;const t=metadata.timestamp,prior=movieFrames.at(-1);
 if(prior&&t-prior.t<1/12)return;
 movieFrames.push({jpeg:Buffer.from(data,'base64'),t});
});
try{
 await page.goto(origin+'/');await page.bringToFront();await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
 await page.evaluate(()=>{
  if(location.search||'__TAURI_INTERNALS__' in window)throw Error('Not an isolated ordinary campaign.');
  let ref;const rows=[],interval=100;
  function read(){
   const world=document.querySelector('canvas[data-engine]'),radar=document.querySelector('canvas[data-game-ui]');
   if(!world||!radar)return null;
   if(!ref||ref.store.getState().gl.domElement!==world||!ref.t.parent){
    let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];while(f?.return)f=f.return;
    const path=[];function find(d){if(!d)return false;path.push(d);if(d.stateNode===radar)return true;
     for(let child=d.child;child;child=child.sibling)if(find(child))return true;path.pop();return false;}
    if(!find(f?.stateNode?.current))return null;
    let actor;for(const node of path.reverse())for(let h=node.memoizedState;h;h=h.next){const o=h.memoizedState?.current;if(o?.name==='player-tank'&&o.__r3f?.root?.getState().gl.domElement===world)actor=o;}
    if(!actor)return null;
    const store=actor.__r3f.root,sc=store.getState().scene,get=n=>sc.getObjectByName(n);
    ref={t:actor,store,g:get('rear-field-armored-guard'),turret:get('rear-guard-turret'),warn:get('rear-guard-warning-mark'),pulse:get('rear-guard-signal-pulse')};
    if(!ref.g||!ref.warn||!ref.pulse||!ref.turret){ref=null;return null;}
   }
   const {t,g,turret,warn,pulse,store}=ref,{camera,clock,gl}=store.getState(),r=world.getBoundingClientRect(),v=g.position.clone();
   function project(x,y,z){v.set(x,y,z).project(camera);return [r.x+(v.x+1)*r.width/2,r.y+(1-v.y)*r.height/2,v.z];}
   const screen=project(g.position.x,.97,g.position.z),cs=Math.cos(g.rotation.y),sn=Math.sin(g.rotation.y),points=[];
   for(const x of [-1.1,1.1])for(const y of [.15,1.74])for(const z of [-1.68,1.68])points.push(project(g.position.x+x*cs+z*sn,y,g.position.z-x*sn+z*cs));
   const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
   return {wall:Date.now(),time:clock.elapsedTime,id:t.uuid,player:t.position.toArray(),yaw:t.rotation.y,camera:camera.position.toArray(),guard:g.position.toArray(),
    guardYaw:g.rotation.y,turretYaw:g.rotation.y+turret.rotation.y,screen,projectedHull:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],
    buffer:[gl.domElement.width,gl.domElement.height],inFrame:Math.abs(screen[2])<1&&screen[0]>=0&&screen[0]<r.width&&screen[1]>=0&&screen[1]<r.height,
    spotted:/Guard tank active/i.test(document.querySelector('.campaign-brief')?.textContent??''),warn:warn.visible,warnAt:warn.visible?warn.position.toArray():null,pulse:pulse.visible,pulseAt:pulse.visible?pulse.position.toArray():null,hp:document.querySelector('.armor-status strong')?.textContent};
  }
  window.guardDriverRead=read;window.guardDriverRows=rows;
  let last=0;function observe(now){if(now-last>=interval){const s=read();if(s){rows.push(s);last=now;}}requestAnimationFrame(observe);}requestAnimationFrame(observe);
 });
 await until(()=>{const s=window.guardDriverRead();return s?.time>.5&&Math.abs(s.player[2]+12)<.02&&s.buffer[0]===1920&&s.buffer[1]===1080;},null,110000);
 report.loaded=await page.evaluate(()=>performance.getEntriesByType('resource').find(e=>/\/GameSession-[\w-]+\.js$/.test(e.name))?.name);
 assert.equal(report.loaded,origin+'/assets/'+bundle);
 await capture('00-road-start');
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:960,maxHeight:540,everyNthFrame:2});movie=true;
 await hold('w');for(const [z,label] of [[5,'01-bridge-entry'],[14,'02-bridge-span'],[25,'03-far-bank-exit']]){
  await until(z=>window.guardDriverRead()?.player[2]>=z,z,26000);await capture(label);
 }await until(()=>window.guardDriverRead()?.player[2]>=29,null,12000);await hold();
 const stopTime=Date.now(),straightWaitEnds=stopTime+settleMs;let capturedTell=false,capturedShot=false,capturedMatch=false;
 while(Date.now()<straightWaitEnds){const s=await sample();
  if(settleMs>4750&&Date.now()>=stopTime+4500&&!capturedMatch){await capture('04a-far-bank-match-4s5');capturedMatch=true;report.matchEnd=(await sample()).wall;}
  if(s?.inFrame&&s.pulse&&!capturedShot){await capture('03b-far-bank-pulse');capturedShot=true;}
  else if(s?.inFrame&&s.warn&&!capturedTell&&!s.pulse){await capture('03a-far-bank-lock');capturedTell=true;}
  await page.waitForTimeout(45);
 }await capture('04-far-bank-straight');
 report.straightEnd=(await sample()).wall;
 await navigate(-26,42,true);await page.waitForTimeout(1200);await capture('05-far-bank-left-look');
 const west=await navigate(-24,32,false);if(west==='intercepted'){const g=(await sample()).guard;await navigate(g[0],g[2],true);}
 else await navigate(-34,39,true);await page.waitForTimeout(2200);await capture(west==='intercepted'?'06-western-intercept':'06-western-approach');
 report.westEnd=(await sample()).wall;
 const observeEnd=Date.now()+6200;
 while(Date.now()<observeEnd){if((await sample()).pulse){await capture('07-western-pulse');break;}await page.waitForTimeout(45);}
 assert.deepEqual(report.errors,[]);report.completed=true;
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;}
finally{
 await hold().catch(()=>{});movie=false;await cdp.send('Page.stopScreencast').catch(()=>{});
 const rows=await page.evaluate(()=>window.guardDriverRows||[]).catch(()=>[]);
 await writeFile(join(out,'driver-trace.json'),JSON.stringify(rows)+'\n');
 report.traceFile='driver-trace.json';
 const measure=rs=>{if(!rs.length)return null;const first=rs[0].guard;return {n:rs.length,peakDistanceFromFirstGuard:Math.max(...rs.map(s=>Math.hypot(s.guard[0]-first[0],s.guard[2]-first[2]))),maxDistanceBetweenAnyGuardSamples:Math.max(...rs.map(s=>Math.max(...rs.map(t=>Math.hypot(s.guard[0]-t.guard[0],s.guard[2]-t.guard[2]))))),guardOnscreenSamples:rs.filter(s=>s.inFrame).length,warningSamples:rs.filter(s=>s.warn).length,pulseSamples:rs.filter(s=>s.pulse).length,firstWarning:rs.find(s=>s.warn),firstPulse:rs.find(s=>s.pulse),hp:[rs.at(0).hp,rs.at(-1).hp]};};
 report.straight=measure(rows.filter(s=>s.wall<=report.straightEnd));
 if(report.matchEnd)report.firstFourAndHalfSecondsAfterStop=measure(rows.filter(s=>s.player[2]>=22&&s.wall<=report.matchEnd));
 report.firstSpotted=rows.find(s=>s.spotted)??null;
 report.bridgeExitThroughStraightWait=measure(rows.filter(s=>s.player[2]>=22&&s.wall<=report.straightEnd));
 report.westTurnAndApproach=measure(rows.filter(s=>s.wall>report.straightEnd));
 if(movieFrames.length>3){
  // The warning can begin while W is still held. Preserve the actual
  // presented surface nearest a live-sampled warning/projectile even if it
  // didn't coincide with one of the 1080p distance checkpoints.
  for(const [label,pred] of [['crossing-lock',s=>s.warn&&!s.pulse],['crossing-projectile',s=>s.pulse]]){
   const candidates=rows.filter(s=>s.wall<=report.straightEnd&&s.player[2]>=12&&s.inFrame&&pred(s));
   if(!candidates.length)continue;
   const choices=candidates.map(row=>{const frame=movieFrames.reduce((best,f)=>Math.abs(f.t*1000-row.wall)<Math.abs(best.t*1000-row.wall)?f:best);
    return {row,frame,gapMs:Math.abs(frame.t*1000-row.wall)};}).sort((a,b)=>a.gapMs-b.gapMs);
   const {row,frame,gapMs}=choices[0];if(gapMs<75){await writeFile(join(out,label+'.jpg'),frame.jpeg);
    report.frames.push({label,file:label+'.jpg',viewportCapture:[960,540],syncGapMs:gapMs,observed:row});}
  }
  // Resample the timestamps onto an 18 Hz video clock. Keep compressed
  // originals in memory instead of materializing hundreds of scratch files.
  const list=[];for(let i=0,j=0;i<=Math.ceil((movieFrames.at(-1).t-movieFrames[0].t)*18);i++){
   const t=movieFrames[0].t+i/18;while(j+1<movieFrames.length&&movieFrames[j+1].t<=t)j++;list.push(movieFrames[j].jpeg);
  }
  try{execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','18','-vcodec','mjpeg','-i','pipe:0','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-preset','veryfast','-crf','24','-movflags','+faststart',join(out,'driver.mp4')],{input:Buffer.concat(list),stdio:['pipe','ignore','pipe']});
   report.movie={file:'driver.mp4',frames:movieFrames.length,realTimeSeconds:movieFrames.at(-1).t-movieFrames[0].t,source:'CDP capture of presented browser surface, including HUD; original timestamp pacing'};
   if(report.straightEnd){const duration=report.straightEnd/1000-movieFrames[0].t;
    execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-i',join(out,'driver.mp4'),'-t',duration.toFixed(3),'-vf','scale=854:-2','-an','-pix_fmt','yuv420p','-c:v','libx264','-threads','2','-preset','fast','-crf','25','-movflags','+faststart',join(out,'bridge-drive.mp4')]);
    report.straightMovie={file:'bridge-drive.mp4',realTimeSeconds:duration};}
  }catch(e){report.movieError=String(e);process.exitCode=1;}
 }await receipt();await browser.close();
}
