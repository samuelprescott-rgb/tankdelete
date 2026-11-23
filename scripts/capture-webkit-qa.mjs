// macOS-only isolated native WebKit simulation. No bundled Tauri file access.
// Compile qa-wk-host.swift locally, then pass the binary and frozen dist path.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {preview} from 'vite';
import {qaArtifactFiles} from './qa-artifact-files.mjs';
import {waitForWorldFrames,physicalPresentation} from './qa-wk-render-ready.mjs';
import {install,impactWindow,targetCount} from './measure-napalm-impact.mjs';
import {installImpactShaderProbe} from './inspect-impact-shaders.mjs';
import {installCorrelation} from './qa-wk-correlation.mjs';
import {bootStrikeRoutes,verifySurveyedRoute} from './boot-strike-routes.mjs';

async function route(startProbe,proveFrames,readyMs,diagnoseShaders,followLandmark,bootLandmark,profileCallbacks,surveyedGround) {
  const handler=window.__headlessStrikePort??window.webkit.messageHandlers.simulationQA;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async (fn,label,ms=25000)=>{
    const end=performance.now()+ms;
    while(performance.now()<end){if(fn())return;await wait(100);}
    throw Error('Timeout: '+label);
  };
  const report={stage:'menu',errors:[],cues:[],userAgent:navigator.userAgent};
  const cleanups=[];
  if(profileCallbacks){
    // Installed at document start, before React caches its scheduler. The
    // clean run has no function probes, clock messages or diagnostic timers.
    profileCallbacks(report,handler,cleanups);
    const slow=report.slowCallbacks=[];
    for(const name of ['queueMicrotask','requestAnimationFrame']){
      const original=window[name];
      if(!original)continue;
      window[name]=function(fn){
        return original.call(this,function(...args){const t=performance.now();try{return fn.apply(this,args);}
          finally{const end=performance.now();if(end-t>=4&&slow.length<20000)slow.push({name,t,end,fn:Function.prototype.toString.call(fn).slice(0,90)});}});
      };
      cleanups.push(()=>{window[name]=original;});
    }
  }
  let shaderProbe;
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  addEventListener('error',e=>report.errors.push(String(e.message||'Resource error: '+e.target?.src)),true);
  addEventListener('unhandledrejection',e=>report.errors.push(String(e.reason)));
  const click=(x,y)=>handler.postMessage({op:'click',x,y});
  function clickButton(el){const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    check(el.contains(document.elementFromPoint(x,y)),'Control obscured');click(x,y);}
  const button=(s,q)=>[...document.querySelectorAll(s)].find(b=>q.test(b.innerText));
  try{
    check(!('__TAURI_INTERNALS__' in window)&&!location.search&&location.hostname==='127.0.0.1','Not isolated local game');
    const boot=()=>button('button',/^boot camp$/i);await waitFor(boot,'Boot Camp');clickButton(boot());
    const canvas=()=>document.querySelector('canvas[data-engine]');
    const sim=()=>document.querySelector('.training-badge')?.textContent.trim().toLowerCase()==='simulation'&&!document.querySelector('.nightmare-order');
    report.stage='world readiness';const gl=await proveFrames('boot',report,readyMs);
    report.stage='warmup';await wait(8000);
    report.viewport=[innerWidth,innerHeight];report.buffer=[canvas().width,canvas().height];
    report.pixelRatio=devicePixelRatio;report.renderer=gl.getParameter(gl.RENDERER);
    check(innerWidth===1920&&innerHeight===1080,'Unexpected viewport');
    if(canvas().width!==1920||canvas().height!==1080){
      // Preserve the exact full-buffer gate below. A failed landmark run can
      // still record the workload and timings at the actual adaptive sizes.
      if(!bootLandmark)throw Error('Unexpected viewport or scaled buffer');
      report.resolutionFailure='Production automatically reduced its drawing buffer before measurement; timings do not qualify as 1080p.';
    }
    const weapon=()=>button('.weapon-selector button',/napalm/i);await waitFor(weapon,'napalm button');clickButton(weapon());
    await waitFor(()=>weapon()?.getAttribute('aria-pressed')==='true','napalm selected');
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    report.gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null;
    if(diagnoseShaders)shaderProbe=diagnoseShaders(gl);
    handler.postMessage({op:'phase',stage:'measureBegin'});
    startProbe(true,false,false);handler.postMessage({op:'move',x:960,y:489});await wait(2500);
    // Optional focused-player route: the cinematic changes the pitch of the
    // chase camera. Track the SAME patch of ground with ordinary mouse events,
    // without reading actors/target counts or writing anything to the game.
    let landmark,camera,worldState;report.worldPresses=[];
    if(followLandmark||bootLandmark){
      const radar=document.querySelector('canvas[data-game-ui]'),k=Object.keys(radar).find(k=>k.startsWith('__reactFiber$'));
      for(let f=radar[k];f&&!camera;f=f.return)for(let h=f.memoizedState;h;h=h.next){
        const t=h.memoizedState?.current;if(t?.name==='player-tank'){worldState=t.__r3f?.root?.getState();camera=worldState?.camera;}
      }
      check(camera?.isPerspectiveCamera,'No player camera for landmark');
      if(bootLandmark){
        // The legacy default is Boot Camp ground observed by unprojecting (960,489) in
        // frozen GameSession-D4hKvOWf on this Mac, with two verified
        // three-file impacts (wk-1080p-Q4RBcc); never estimate from FOV.
        // Surveyed routes have separate fixed coordinates and report identities.
        // Never inspect actors, retarget using impact results, or drive game state.
        landmark=camera.position.clone().set(...(surveyedGround??[0,0,7.971431828621334]));
      }else{
        const eye=camera.position,ray=eye.clone().set(0,1-2*489/1080,.5).unproject(camera).sub(eye).normalize();
        check(ray.y<-.001,'First point must be on ground');landmark=eye.clone().addScaledVector(ray,-eye.y/ray.y);
      }
    }
    for(let i=1;i<=2;i++){
      report.stage='strike '+i;
      let x=960,y=489;
      if(bootLandmark||(followLandmark&&i===2)){
        const p=landmark.clone().project(camera);x=Math.round((p.x+1)*960);y=Math.round((1-p.y)*540);
        check(Math.abs(p.x)<.9&&Math.abs(p.y)<.85&&Math.abs(p.z)<1,'Ground landmark out of view');
        handler.postMessage({op:'move',x:x-4,y:y+3});await wait(90);
        handler.postMessage({op:'move',x,y});await wait(2200);
      }
      check(sim()&&!document.hidden&&document.elementFromPoint(x,y)===canvas(),'Not foreground simulation aim');
      let hover;
      if(bootLandmark){
        const ptr=worldState.pointer,eye=camera.position,dir=eye.clone().set(ptr.x,ptr.y,.5).unproject(camera).sub(eye).normalize();
        const turret=worldState.scene.getObjectByName('tank-turret');
        hover={pixel:[(ptr.x+1)*960,(1-ptr.y)*540],ground:eye.clone().addScaledVector(dir,-eye.y/dir.y).toArray(),
          turretDirection:turret?eye.clone().set(0,0,-1).transformDirection(turret.matrixWorld).toArray():null};
      }
      const press={x,y,ground:landmark?.toArray(),hover,requestedMs:performance.now()};
      report.worldPresses.push(press);click(x,y);
      const inbound=await window.__impactQA.wait('inbound',i,6500),impact=inbound&&await window.__impactQA.wait('impact',i,14000);
      // Distinguish a swallowed native event from a game that received the
      // press but did not fire. Never retry or manufacture an input/cue.
      press.received=window.__impactQA.input.filter(e=>e.type==='pointerdown'&&e.trusted&&e.world&&e.t>=press.requestedMs&&e.x===x&&e.y===y);
      check(press.received.length===1,'Expected exactly one trusted world press at strike '+i+'; received '+press.received.length);
      check(inbound&&impact,'Trusted press reached the world, but no live inbound/impact at '+i);report.cues.push({inbound,impact});
      await wait(i===1?Math.max(0,inbound.t+22200-performance.now()):6000);
    }
    report.raw=window.__impactQA.finish();
    handler.postMessage({op:'phase',stage:'measureEnd'});
    report.glError=gl.getError();report.contextLost=gl.isContextLost();
    report.stage='exit';
    clickButton(document.querySelector('button[title="Exit training"]'));await waitFor(boot,'exit back to menu');
    report.stage='complete';
  }catch(e){report.error=String(e);report.body=document.body?.innerText.slice(0,1100);
    if(!report.raw&&window.__impactQA?.finish)report.raw=window.__impactQA.finish();}
  if(shaderProbe)report.shaderPrograms=shaderProbe.finish();
  for(const fn of cleanups.reverse())fn();
  handler.postMessage({op:'done',report:JSON.parse(JSON.stringify(report))});
}

const [host,distArg,order='back',probeMode]=process.argv.slice(2);
const headless=['headless-webkit','headless-chrome'].includes(host);
if(headless&&order!=='back')throw Error('A windowless comparison cannot use a physical presentation mode');
const routeName=probeMode?.replace(/^diagnose-/,''),surveyed=Object.hasOwn(bootStrikeRoutes,routeName)?bootStrikeRoutes[routeName]:null;
if(!host||!distArg||process.platform!=='darwin'||!['front','back','back-physical','front-physical','player-physical'].includes(order)||(probeMode&&!surveyed&&!['diagnose-shaders','diagnose-boot-landmark','follow-landmark','boot-landmark'].includes(probeMode)))throw Error('Expected compiled macOS QA host, local dist, panel order and optional probe mode');
const diagnostic=probeMode==='diagnose-shaders'||probeMode==='diagnose-boot-landmark'||(surveyed&&probeMode.startsWith('diagnose-'));
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.resolve(root,distArg);
const output=await mkdtemp(path.join(root,headless?'tmp/production-qa/'+host+'-1080p-':diagnostic?'tmp/production-qa/wk-shader-diagnostic-':'tmp/production-qa/wk-1080p-'));console.log('Strike evidence: '+output);
const origin='http://127.0.0.1:1485/',server=await preview({root,build:{outDir:dist},preview:{host:'127.0.0.1',port:1485,strictPort:true,open:false}});
try{
  const manifest=JSON.parse(await readFile(path.join(dist,'.vite/manifest.json')));
  const files=await qaArtifactFiles(dist,manifest);
  const sha=b=>createHash('sha256').update(b).digest('hex'),artifact={};
  for(const f of files){const disk=sha(await readFile(path.join(dist,f))),resp=await fetch(origin+f);
    if(!resp.ok||disk!==sha(Buffer.from(await resp.arrayBuffer())))throw Error('Wrong local artifact: '+f);artifact[f]=disk;}
  const child=headless?spawn(process.execPath,[path.join(root,'scripts/qa-headless-strike-host.mjs'),host.slice(9),origin,order],{stdio:['pipe','pipe','pipe']}):spawn(path.resolve(host),[origin,order],{stdio:['pipe','pipe','pipe']});
  const stdout=[];child.stdout.on('data',b=>stdout.push(b));child.stderr.pipe(process.stderr);
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Host exit '+code)));});
  child.stdin.end('('+route.toString()+')('+install.toString()+','+waitForWorldFrames.toString()+','+(order.endsWith('-physical')?55000:28000)+','+(diagnostic?installImpactShaderProbe.toString():'null')+','+(probeMode==='follow-landmark')+','+Boolean(surveyed||routeName==='boot-landmark')+','+(diagnostic&&routeName!=='shaders'?installCorrelation.toString():'null')+','+JSON.stringify(surveyed?.landmark??null)+')');await done;
  const r=JSON.parse(Buffer.concat(stdout));r.artifact=artifact;
  r.inputRoute=surveyed?{name:routeName,...surveyed,legacyReferenceSparks:1446,comparability:'Different file group after the downstream hut relocation; not a rerun of the legacy workload.'}:{name:probeMode??'fixed-screen'};
  r.inputHost=headless?{kind:host}:{kind:'system-wkwebview',binary:path.basename(host),sha256:sha(await readFile(path.resolve(host)))};
  if(r.raw){
    const {raw}=r;delete r.raw;await writeFile(path.join(output,'impact-raw.json'),JSON.stringify(raw));
    const planned=r.worldPresses??[];const clicks=raw.input.filter(i=>i.type==='pointerdown'&&i.trusted&&i.world).filter((v,i)=>v.x===planned[i]?.x&&v.y===planned[i]?.y);
    r.windows=(r.cues??[]).map(({inbound,impact},i)=>{
      const c=clicks[i]?.t,b=inbound.t,t=impact.t;return Object.fromEntries(Object.entries({launch:[c-50,b+1000],
        inboundToImpact:[b,t],centeredImpact:[t-500,t+500],ignite:[t,t+500],rollingFire:[t+500,t+4500]}).map(([k,[a,z]])=>
        [k,impactWindow(raw,a,z,d=>({samples:d.length,maxMs:Math.max(...d)}))]));});
    const deltas=raw.rafTimestampsMs.slice(1).map((t,i)=>t-raw.rafTimestampsMs[i]);
    const initial=raw.rafTimestampsMs.slice(1).map((t,i)=>({t,d:t-raw.rafTimestampsMs[i]})).filter(v=>v.t<(clicks[0]?.t??Infinity)).map(v=>v.d);
    const stats=v=>{const s=v.slice().sort((a,b)=>a-b);const p=f=>s[Math.max(0,Math.ceil(s.length*f)-1)];
      return {samples:s.length,p50:p(.5),p95:p(.95),p99:p(.99),max:p(1),over33:s.filter(t=>t>33.4).length};};
    r.cadence={preClick:stats(initial),wholeRoute:stats(deltas)};
    const fileHud=raw.fileEvents?.filter(e=>e.type==='file-hud')??[];
    const armed=fileHud.find(e=>/^3 files armed\b/.test(e.armed??'')&&/^0 trashed\b/.test(e.run??''));
    const confirmed=fileHud.find(e=>e.t>(armed?.t??Infinity)&&/^3 trashed\b/.test(e.run??'')&&!e.armed
      &&parseInt(e.sector,10)===parseInt(fileHud[0]?.sector,10)-3);
    r.checks={finished:r.stage==='complete',events:clicks.length===2&&raw.cues.map(c=>c.type).join(',')==='inbound,impact,inbound,impact',
      isolatedInput:raw.input.filter(i=>i.trusted&&i.t<=raw.ended).length===2,
      threeEach:r.cues?.length===2&&r.cues.every(c=>targetCount(c.impact.text)===3),
      virtualFilesArmedThenConfirmed:!!(armed&&confirmed),
      foreground:!raw.startedHidden&&raw.visibility.every(v=>!v.hidden),
      fullBuffer:!r.resolutionFailure&&raw.buffers.length>0&&raw.buffers.every(b=>b.width===1920&&b.height===1080),
      runtime:!r.error&&!r.errors.length&&r.glError===0&&!r.contextLost,
      timing:r.windows.length===2&&r.windows.every(w=>Object.values(w).every(v=>v.coverage&&v.samples>0&&v.maxMs<=33.4))};
    if(surveyed){
      // New named workloads own their count checks; the original two
      // three-file gates above remain exactly as written on every old route.
      if(surveyed.files===4){delete r.checks.threeEach;delete r.checks.virtualFilesArmedThenConfirmed;}
      Object.assign(r.checks,verifySurveyedRoute(surveyed,r.cues,raw.fileEvents??[],targetCount));
    }
  }
  r.presentation=physicalPresentation(r);
  if(headless){
    r.presentation={target:'Windowless comparison; no native display or focus qualification',verifiedPlayerFocus:false,verifiedPhysical1080:false,css:r.viewport??null};
    if(r.checks)r.checks.hardwareRenderer=!!r.gpu&&!/software|swiftshader|llvmpipe/i.test(r.gpu);
  }
  if(order.endsWith('-physical')&&r.checks)r.checks.physicallyFitted=r.presentation.verifiedPhysical1080;
  if(order==='back-physical'&&r.checks)r.checks.neverTookFocus=(r.native?.samples??[]).length>0&&r.native.samples.every(s=>!s.key&&!s.main&&!s.appActive);
  if(order==='player-physical'&&r.checks)r.checks.keyPlayerWindow=r.presentation.verifiedPlayerFocus;
  r.status=r.checks&&Object.values(r.checks).every(Boolean)?'checks-passed':'not-passed';
  if(diagnostic){
    r.diagnosticOnly=true;r.status='diagnostic-only';
    if(r.shaderPrograms){await writeFile(path.join(output,'shader-programs.json'),JSON.stringify(r.shaderPrograms,null,2));delete r.shaderPrograms;}
  }
  await writeFile(path.join(output,'report.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({stage:r.stage,status:r.status,error:r.error,checks:r.checks}));
  if(diagnostic?r.stage!=='complete'||!!r.error:r.status!=='checks-passed')process.exitCode=1;
}finally{await new Promise(resolve=>server.httpServer.close(resolve));}
