// Diagnostic only: same artifact and simulation, no fidelity, clock, game-state
// or media overrides. Unlike the acceptance route this one instruments JS work.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {preview} from 'vite';
import {install,impactWindow} from './measure-napalm-impact.mjs';
import {qaArtifactFiles} from './qa-artifact-files.mjs';
import {waitForWorldFrames,physicalPresentation} from './qa-wk-render-ready.mjs';
import {installCorrelation,summarizeCorrelations} from './qa-wk-correlation.mjs';
import {inspectDrawBudget} from './qa-wk-scene-budget.mjs';

async function diagnose(twoStrikes,installImpact,hudBlend,proveFrames,correlate,readyMs,inspectBudget){
  const native=window.webkit.messageHandlers.simulationQA,now=performance.now.bind(performance);
  const report={scope:'Diagnostic only; virtual Boot Camp, no Tauri, no capture of user input.',stage:'startup',
    marks:[],raf:[],heartbeat:[],scene:[],media:[],errors:[],visibility:[]};
  const mark=stage=>{report.stage=stage;const t=now();report.marks.push({stage,t});native.postMessage({op:'phase',stage,browserMs:t});};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(fn,label,ms=20000)=>{const end=now()+ms;while(now()<end){if(fn())return;await wait(80);}throw Error('Timeout: '+label);};
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const originals=[], cleanups=[], activeShots=new Map();
  if(correlate)correlate(report,native,cleanups);
  const restoreWarmGL=[];let warmCallback=null;report.glWarmup={totals:{},slow:[],slowRaf:[]};
  if(twoStrikes){
    const gl=WebGL2RenderingContext.prototype;
    // The correlated route instruments only startup/initial submission here,
    // and frees these wrappers before the measured aim/strikes. This catches
    // first-world driver stalls without instrumenting every live draw call.
    const warmCalls=correlate?['linkProgram','compileShader','getProgramParameter','checkFramebufferStatus','texImage2D','texSubImage2D','bufferData',
      'drawElements','drawElementsInstanced','drawArrays','drawArraysInstanced']:
      ['linkProgram','compileShader','getProgramParameter','getActiveUniform','getUniformLocation','getActiveAttrib',
      'getShaderParameter','checkFramebufferStatus','texImage2D','texSubImage2D','bufferData','drawElements','drawElementsInstanced','drawArrays','drawArraysInstanced'];
    for(const name of warmCalls){
      let p=gl;while(p&&!Object.hasOwn(p,name))p=Object.getPrototypeOf(p);if(!p)continue;
      const desc=Object.getOwnPropertyDescriptor(p,name),total=report.glWarmup.totals[name]=[0,0,0];
      Object.defineProperty(p,name,{...desc,value:function(...args){const a=now();try{return desc.value.apply(this,args);}finally{
        const dt=now()-a;total[0]++;total[1]+=dt;total[2]=Math.max(total[2],dt);
        if(warmCallback){const s=warmCallback[name]??(warmCallback[name]=[0,0]);s[0]++;s[1]+=dt;}
        if(dt>=8&&report.glWarmup.slow.length<300)report.glWarmup.slow.push([name,a,dt]);}}});
      restoreWarmGL.push(()=>Object.defineProperty(p,name,desc));
    }
  }
  addEventListener('error',e=>report.errors.push(String(e.message||'resource error')),true);
  addEventListener('unhandledrejection',e=>report.errors.push(String(e.reason)));
  document.addEventListener('visibilitychange',()=>report.visibility.push({t:now(),hidden:document.hidden}));
  // Aggregate across callbacks sharing one delivered WebKit rAF timestamp.
  // Entries record actual start/end as well as the scheduler-provided clock.
  const request=window.requestAnimationFrame,cache=new WeakMap();
  let last=null;
  const frame=t=>{if(!last||last[0]!==t){last=[t,now(),now(),0,0,0];report.raf.push(last);}return last;};
  window.requestAnimationFrame=function(fn){
    if(typeof fn!=='function')return request.call(window,fn);
    let wrapper=cache.get(fn);
    if(!wrapper){wrapper=function(t){
      const record=frame(t),start=now(),previous=warmCallback,warm=restoreWarmGL.length?{}:null;warmCallback=warm;
      try{return fn.call(this,t);}finally{
        const stop=now(),dt=stop-start;record[2]=stop;record[3]+=dt;record[4]++;record[5]=Math.max(record[5],dt);warmCallback=previous;
        if(warm&&dt>=32&&report.glWarmup.slowRaf.length<100)report.glWarmup.slowRaf.push({t:start,dt,source:Function.prototype.toString.call(fn).slice(0,160),calls:warm});
      }
    };cache.set(fn,wrapper);}
    return request.call(window,wrapper);
  };
  let live=true;
  function sampling(t){if(live){frame(t);
    for(const {gain,record} of activeShots.values())if(gain)record.peakObservedGain=Math.max(record.peakObservedGain,gain.gain.value);
    request.call(window,sampling);}}
  request.call(window,sampling);
  const heart=setInterval(()=>report.heartbeat.push(now()),50);
  // Non-blocking audio telemetry: never wait on, cancel, mute or fake media.
  // Observe only play calls and 'playing' events, including detached pool voices.
  const mediaProto=HTMLMediaElement.prototype,playDesc=Object.getOwnPropertyDescriptor(mediaProto,'play');
  Object.defineProperty(mediaProto,'play',{...playDesc,value:function(...args){
    const t=now(),stage=report.stage,name=(this.currentSrc||this.src||'').split('/').at(-1).slice(0,90);
    let record=[t,stage,name,0,null];report.media.push(record);
    const played=()=>{record[4]=now();};
    this.addEventListener('playing',played,{once:true});
    cleanups.push(()=>this.removeEventListener('playing',played));
    const at=now();try{return Reflect.apply(playDesc.value,this,args);}finally{record[3]=now()-at;}
  }});
  originals.push(()=>Object.defineProperty(mediaProto,'play',playDesc));
  // Independently follow network bytes -> decoded buffer -> real AudioContext
  // start/stop and nonzero gain. An unsupported/silent path is not a perf win.
  const bytesToUrl=new WeakMap(),bufferToClip=new WeakMap(),outputNodes=new WeakMap();
  report.decoded=[];report.shots=[];
  const wrap=(prototype,name,h)=>{let p=prototype;while(p&&!Object.hasOwn(p,name))p=Object.getPrototypeOf(p);
    if(!p)throw Error('Unobservable '+name);const desc=Object.getOwnPropertyDescriptor(p,name);
    Object.defineProperty(p,name,{...desc,value:function(...args){return h(this,desc.value,args);}});
    originals.push(()=>Object.defineProperty(p,name,desc));};
  if(window.AudioBufferSourceNode&&window.BaseAudioContext){
    wrap(Response.prototype,'arrayBuffer',(self,orig,args)=>{
      const result=orig.apply(self,args),u=new URL(self.url||location.href);
      if(u.origin!==location.origin||!u.pathname.startsWith('/audio/sfx/'))return result;
      return result.then(bytes=>{bytesToUrl.set(bytes,u.pathname.split('/').at(-1));return bytes;});});
    wrap(BaseAudioContext.prototype,'decodeAudioData',(self,orig,args)=>{
      const name=bytesToUrl.get(args[0]),result=orig.apply(self,args);if(!name||!result?.then)return result;
      return result.then(buffer=>{const data=buffer.getChannelData(0);let peak=0;
        for(let j=0;j<data.length;j+=Math.max(1,Math.floor(data.length/128)))peak=Math.max(peak,Math.abs(data[j]));
        report.decoded.push({name,duration:buffer.duration,peak});bufferToClip.set(buffer,name);return buffer;});});
    wrap(AudioNode.prototype,'connect',(self,orig,args)=>{const result=orig.apply(self,args);
      if(self instanceof AudioBufferSourceNode&&args[0] instanceof GainNode)outputNodes.set(self,args[0]);return result;});
    wrap(AudioBufferSourceNode.prototype,'start',(self,orig,args)=>{
      const at=now(),result=orig.apply(self,args),returned=now(),name=bufferToClip.get(self.buffer);if(!name)return result;
      const record={name,t:at,returned,startCallMs:returned-at,rate:self.playbackRate.value,offset:args[1]??0,state:self.context.state,peakObservedGain:0,stop:null,ended:null};
      report.shots.push(record);activeShots.set(self,{record,gain:outputNodes.get(self)});
      self.addEventListener('ended',()=>{record.ended=now();activeShots.delete(self);},{once:true});return result;});
    wrap(AudioBufferSourceNode.prototype,'stop',(self,orig,args)=>{const at=now(),result=orig.apply(self,args),returned=now(),shot=activeShots.get(self);
      if(shot){shot.record.stop=at;shot.record.stopCallMs=returned-at;if(shot.gain)shot.record.peakObservedGain=Math.max(shot.record.peakObservedGain,shot.gain.gain.value);
        // Real pooled gain nodes can be reused before WebKit delivers 'ended'.
        // Never credit a subsequent voice's level to this stopped source.
        activeShots.delete(self);}
      return result;});
  }
  const getButton=text=>[...document.querySelectorAll('button')].find(b=>text.test(b.textContent));
  const click=(x,y)=>native.postMessage({op:'click',x,y});
  const tap=element=>{const r=element.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;check(element.contains(document.elementFromPoint(x,y)),'Obscured control');click(x,y);};
  const storeForScene=()=>{
    const radar=document.querySelector('canvas[data-game-ui]'),key=radar&&Object.keys(radar).find(k=>k.startsWith('__reactFiber$'));
    for(let f=key&&radar[key];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const object=h.memoizedState?.current;if(object?.isGroup&&object.name==='player-tank')return object.__r3f?.root;
    }
  };
  try{
    check(!('__TAURI_INTERNALS__' in window)&&location.hostname==='127.0.0.1'&&!location.search,'Not isolated local game');
    await until(()=>getButton(/^Boot Camp$/i),'menu');
    mark('menu');await wait(6000);
    mark('boot');tap(getButton(/^Boot Camp$/i));
    const world=()=>document.querySelector('canvas[data-engine]');
    await proveFrames('boot',report,readyMs);
    await until(()=>document.querySelector('.training-badge')?.textContent==='Simulation'&&world()
      &&storeForScene()?.getState().internal.subscribers.some(s=>s.priority===1),'live Boot Camp');
    const store=storeForScene(),state=store.getState(),ctx=state.gl.getContext();
    check(world()===state.gl.domElement&&!document.querySelector('.nightmare-order'),'Expected mounted simulation renderer');
    check(innerWidth===1920&&innerHeight===1080,'Expected 1080p viewport');
    const priorities=state.internal.subscribers.map(s=>s.priority);
    check(priorities.includes(1)&&Math.max(...priorities)===1,'Cannot locate active composer at final priority 1');
    report.device={screen:[screen.width,screen.height],viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,
      buffer:[world().width,world().height],gpuTimer:!!ctx.getExtension('EXT_disjoint_timer_query_webgl2'),
      priorities,hidden:document.hidden,focus:document.hasFocus(),userAgent:navigator.userAgent};
    const worldElement=world();let simStart=0,renderStart=0;
    if(hudBlend){
      const vignette=document.querySelector('.damage-vignette');
      check(vignette,'Missing live damage HUD');
      const style=document.createElement('style');
      style.textContent='.damage-vignette{mix-blend-mode:'+hudBlend+' !important}';
      document.head.appendChild(style);cleanups.push(()=>style.remove());
      const record=report.hudPaint={blend:hudBlend,devices:[innerWidth,innerHeight,devicePixelRatio],events:[],actors:null,activeEffects:[]};
      const styl=getComputedStyle(vignette),box=vignette.getBoundingClientRect();
      record.computed={blend:styl.mixBlendMode,rect:[box.x,box.y,box.width,box.height],transitionDuration:styl.transitionDuration};
      check(record.computed.blend===hudBlend&&box.width===1920&&box.height===1080,'HUD blend proof failed');
      record.actors=document.querySelector('.armor-status')?.textContent;
      for(const el of document.querySelectorAll('[data-game-ui],.hud *,.damage-vignette')){
        const css=getComputedStyle(el);if(css.backdropFilter!=='none'&&css.backdropFilter||css.mixBlendMode!=='normal'||css.filter!=='none'){
          const bounds=el.getBoundingClientRect();if(bounds.width&&bounds.height)record.activeEffects.push({
            selector:el.className?.toString().slice(0,60),blend:css.mixBlendMode,filter:css.filter,backdrop:css.backdropFilter,
            size:[bounds.width,bounds.height]});}
      }
      const flash=()=>record.events.push({t:now(),on:vignette.classList.contains('is-visible')});flash();
      const observer=new MutationObserver(flash);observer.observe(vignette,{attributes:true,attributeFilter:['class']});cleanups.push(()=>observer.disconnect());
    }
    // This project's active composer already owns rendering at priority 1.
    // No callback replaces a subscriber, issues a draw or queries GL.
    cleanups.push(state.internal.subscribe({current:()=>{simStart=now();}},-10000,store));
    cleanups.push(state.internal.subscribe({current:()=>{renderStart=now();}},.999,store));
    cleanups.push(state.internal.subscribe({current:()=>{
      const stop=now();report.scene.push([simStart,renderStart,stop,worldElement.width,worldElement.height]);
    }},1.001,store));
    mark('sceneWarmup');
    await wait(8000);for(const fn of restoreWarmGL.splice(0))fn();
    if(!twoStrikes){mark('sceneIdle');await wait(8000);}
    mark('aim');const weapon=()=>[...document.querySelectorAll('.weapon-selector button')].find(b=>/napalm/i.test(b.textContent));
    tap(weapon());await until(()=>weapon()?.getAttribute('aria-pressed')==='true','selected napalm');
    if(twoStrikes)installImpact(true,false,false);
    native.postMessage({op:'move',x:960,y:489});await wait(2500);
    check(!document.hidden&&document.elementFromPoint(960,489)===worldElement,'Expected visible simulation aim');
    if(twoStrikes){
      for(let i=1;i<=2;i++){
        mark('strike'+i);click(960,489);
        const inbound=await window.__impactQA.wait('inbound',i,6500);
        if(correlate&&inbound)native.postMessage({op:'phase',stage:'inbound'+i,browserMs:inbound.t});
        const impact=inbound&&await window.__impactQA.wait('impact',i,14000);
        if(correlate&&impact)native.postMessage({op:'phase',stage:'impact'+i,browserMs:impact.t});
        check(inbound&&impact,'Missing strike '+i);await wait(i===1?Math.max(0,inbound.t+22200-now()):6000);
      }
      report.impact=window.__impactQA.finish();
      check(report.impact.cues.filter(c=>c.type==='impact'&&/3 targets/.test(c.text)).length===2&&
        report.impact.fileEvents.some(e=>e.type==='deletion-toast'&&/3 files/.test(e.text)),'Unmatched target workload');
      if(correlate){mark('post-measurement draw census');report.drawBudget=await inspectBudget();}
    }else{const toaster=document.querySelector('[data-rht-toaster]'),cues=[],seen=new Set();
    const observer=new MutationObserver(()=>{for(const el of toaster.querySelectorAll('[role="status"]')){
      const s=el.textContent.trim();if(/^(Phantom inbound|Napalm impact)\s*·/i.test(s)&&!seen.has(s)){seen.add(s);cues.push({t:now(),text:s});}
    }});observer.observe(toaster,{subtree:true,characterData:true,childList:true});cleanups.push(()=>observer.disconnect());
    report.cues=cues;mark('strike');click(960,489);await wait(15500);
    check(cues.length===2,'Missing diagnostic inbound or impact');
    }
    report.endBuffer=[worldElement.width,worldElement.height];report.glError=ctx.getError();report.contextLost=ctx.isContextLost();
    mark('exit');tap(document.querySelector('button[title="Exit training"]'));
    await until(()=>getButton(/^Boot Camp$/i),'simulation exit');
    mark('menuReturn');await wait(4000);mark('complete');
  }catch(error){report.error=String(error);}
  live=false;clearInterval(heart);for(const fn of cleanups)fn();for(const fn of originals)fn();for(const fn of restoreWarmGL)fn();
  window.requestAnimationFrame=request;
  native.postMessage({op:'done',report});
}

function summarize(r){
  const stats=a=>{if(!a.length)return null;const s=a.slice().sort((a,b)=>a-b),p=f=>+(s[Math.ceil(s.length*f)-1]).toFixed(2);
    return {n:s.length,p50:p(.5),p95:p(.95),max:p(1),over100:s.filter(x=>x>=100).length};};
  const rows=[],allIntervals=r.raf.slice(1).map((next,k)=>[r.raf[k],next]);
  for(let i=0;i<r.marks.length-1;i++){
    const a=r.marks[i].t,b=r.marks[i+1].t,within=t=>t>=a&&t<b;
    const frames=r.raf.filter(v=>within(v[0])),h=r.heartbeat.filter(within),scene=r.scene.filter(v=>within(v[0]));
    const intervals=allIntervals.filter(([prev,next])=>prev[0]<b&&next[0]>a);
    const slow=[];for(const [prev,next] of intervals){if(next[0]-prev[0]<=33.4)continue;
      // Count independent 50ms heartbeats in wall time between callback entries,
      // plus overlap of measured render/JS/AI work across this stall.
      const start=prev[1],end=next[1],duration=end-start,overlap=(x,y)=>Math.max(0,Math.min(end,y)-Math.max(start,x));
      const hit=r.scene.filter(f=>f[0]<end&&f[2]>start);
      slow.push({t:prev[0],rafGap:next[0]-prev[0],wallGap:duration,callbacks:prev[3],heartbeats:r.heartbeat.filter(t=>t>=start&&t<end).length,
        media:r.media.filter(v=>v[0]<end&&v[0]+v[3]>=start),fileEvents:r.impact?.fileEvents.filter(v=>v.t>=start&&v.t<end),
        simulation:hit.reduce((n,v)=>n+overlap(v[0],v[1]),0),render:hit.reduce((n,v)=>n+overlap(v[1],v[2]),0)});
    }
    rows.push({stage:r.marks[i].stage,durationMs:b-a,rafGap:stats(intervals.map(([v,n])=>n[0]-v[0])),
      heartbeatGap:stats(h.slice(1).map((v,k)=>v-h[k])),callbackWork:stats(frames.map(v=>v[3])),
      simulation:stats(scene.map(v=>v[1]-v[0])),render:stats(scene.map(v=>v[2]-v[1])),
      expectFullBuffer:scene.every(v=>v[3]===1920&&v[4]===1080),slow});
  }return rows;
}

function strikeWindows(raw){
  const clicks=raw.input.filter(i=>i.trusted&&i.world&&i.type==='pointerdown');
  return clicks.map((click,i)=>{const [inbound,impact]=raw.cues.slice(i*2,i*2+2),t=impact.t,b=inbound.t;
    return Object.fromEntries(Object.entries({launch:[click.t-50,b+1000],inboundToImpact:[b,t],centered:[t-500,t+500],
      ignite:[t,t+500],rolling:[t+500,t+4500]}).map(([k,[a,z]])=>[k,impactWindow(raw,a,z,
        d=>({samples:d.length,maxMs:Math.max(...d)}))]));});
}

// Classify each accepted-route interval by overlap with the mounted HUD's real
// visible period, including the entire 220ms CSS release. Report exposure too:
// two simulations need not receive the same number of hits at the same times.
function hudEffectStats(report){
  const q=report.impact,e=report.hudPaint.events,intervals=[],ranges=[];
  let begin=null;
  for(const event of e){if(event.on){begin??=event.t;}else if(begin!==null){ranges.push([begin,event.t+220]);begin=null;}}
  if(begin!==null)ranges.push([begin,q.ended]);
  for(let i=1;i<q.rafTimestampsMs.length;i++){
    const a=q.rafTimestampsMs[i-1],b=q.rafTimestampsMs[i],active=ranges.some(([s,t])=>s<b&&t>a);
    intervals.push({active,dt:b-a});
  }
  function stats(v){const d=v.map(i=>i.dt).sort((a,b)=>a-b),s=d.filter(n=>n>33.4);return {frames:d.length,
    seconds:d.reduce((n,k)=>n+k,0)/1000,p95:d[Math.ceil(d.length*.95)-1]??null,max:d.at(-1)??null,over33:s.length,over50:s.filter(n=>n>50).length};}
  return {blend:report.hudPaint.blend,hitStarts:e.filter(v=>v.on&&v.t>=q.began&&v.t<=q.ended).length,
    exposed:stats(intervals.filter(v=>v.active)),unexposed:stats(intervals.filter(v=>!v.active)),all:stats(intervals)};
}

const [host,distArg,order='back',route='single']=process.argv.slice(2);
if(process.platform!=='darwin'||!host||!distArg||!['front','back','front-physical'].includes(order))throw Error('Pass compiled QA host, frozen dist path, and panel order');
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.resolve(root,distArg);
const output=await mkdtemp(path.join(root,'tmp/production-qa/wk-diagnostic-'));
console.log('Diagnostic evidence:',output);
const origin='http://127.0.0.1:1487/',server=await preview({root,build:{outDir:dist},preview:{host:'127.0.0.1',port:1487,strictPort:true,open:false}});
try{
  const manifest=JSON.parse(await readFile(path.join(dist,'.vite/manifest.json'))),artifact={};
  for(const file of await qaArtifactFiles(dist,manifest)){
    const hash=b=>createHash('sha256').update(b).digest('hex'),r=await fetch(origin+file);
    const sha=hash(await readFile(path.join(dist,file)));if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==sha)throw Error('Artifact mismatch: '+file);
    artifact[file]=sha;
  }
  const child=spawn(path.resolve(host),[origin,order],{stdio:['pipe','pipe','inherit']});const chunks=[];child.stdout.on('data',b=>chunks.push(b));
  const done=new Promise((res,rej)=>{child.once('error',rej);child.once('exit',(code,signal)=>code===0?res():rej(Error('WK host exit: '+(code??signal))));});
  const hudBlend=route==='hud-screen'?'screen':route==='hud-normal'?'normal':null;
  const correlated=route==='correlate';
  child.stdin.end('('+diagnose.toString()+')('+(route==='double'||correlated||!!hudBlend)+',('+install.toString()+'),'+JSON.stringify(hudBlend)+',('+waitForWorldFrames.toString()+'),'+(correlated?'('+installCorrelation.toString()+')':'null')+','+(order==='front-physical'?55000:28000)+',('+inspectDrawBudget.toString()+'))');await done;
  const r=JSON.parse(Buffer.concat(chunks));r.artifact=artifact;r.presentation=physicalPresentation(r);
  if(order==='front-physical'&&!r.presentation.verifiedPhysical1080)r.error??='Native presentation was not wholly fitted at physical 1080p';
  await writeFile(path.join(output,'raw.json'),JSON.stringify(r));
  const {raf,heartbeat,scene,media,shots,diagnosticMainTicks,...summary}=r;summary.phases=r.marks?summarize(r):[];
  if(correlated){summary.correlatedSlow=summarizeCorrelations(r);summary.native={...r.native,diagnostic20msTicksUptimeMs:r.native?.diagnostic20msTicksUptimeMs?.length};}
  if(r.impact)summary.windows=strikeWindows(r.impact);
  if(r.hudPaint&&r.impact)summary.hudEffect=hudEffectStats(r);
  summary.mediaSummary={plays:media?.length,slowSynchronousPlays:media?.filter(v=>v[3]>=50),napalm:media?.filter(v=>/napalm/i.test(v[2]))};
  summary.scheduledAudio={starts:shots?.length,stops:shots?.filter(s=>s.stop!==null).length,ended:shots?.filter(s=>s.ended!==null).length,
    nonzeroGain:shots?.filter(s=>s.peakObservedGain>0).length,perClip:Object.fromEntries([...new Set(shots?.map(s=>s.name))].map(k=>[k,shots.filter(s=>s.name===k).length]))};
  await writeFile(path.join(output,'report.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({stage:r.stage,error:r.error,phases:summary.phases.map(({slow,...v})=>v)}));
  if(r.error||r.stage!=='complete')process.exitCode=1;
}finally{await new Promise(res=>server.httpServer.close(res));}
