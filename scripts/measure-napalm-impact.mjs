// Optional production-only measurement route for capture-production-qa.mjs.
// No game-state access: use trusted world input, the impact handler's real
// toast, the existing game WebGL context and monotonic browser timestamps.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function install(attribution,trace,pointerProbe) {
  const canvas=document.querySelector('canvas[data-engine]'), gl=canvas.getContext('webgl2');
  const toaster=document.querySelector('[data-rht-toaster]');
  if(!gl||!toaster)throw new Error('Missing production WebGL context or live toast container');
  const q=window.__impactQA={frames:[],visibility:[],input:[],cues:[],gpuCalls:[],buffers:[],longFrames:[],fileEvents:[]};
  const waiters=new Set(), seen=new WeakMap(), restore=[];
  const traceMarks=[],bufferUploads=[],cueCounts={inbound:0,impact:0};
  const mark=label=>{
    const name='tankdelete.qa.napalm.'+label;
    const t=performance.mark(name).startTime;
    traceMarks.push({name,t});
    return t;
  };
  const examine=()=>{
    for(const node of toaster.querySelectorAll('[role="status"]')) {
      const text=node.textContent.trim(), match=text.match(/^(Phantom inbound|Napalm impact)\s*·/i);
      if(seen.get(node)===text)continue;
      if(!match) {
        if(attribution&&/^Deleted\s/.test(text)){seen.set(node,text);q.fileEvents.push({type:'deletion-toast',t:performance.now(),text:text.slice(0,160)});}
        continue;
      }
      seen.set(node,text);
      const type=match[1].toLowerCase()==='phantom inbound'?'inbound':'impact';
      q.cues.push({type,text,t:trace?mark(type+'-'+(++cueCounts[type])):performance.now()});
      for(const check of [...waiters])check();
    }
  };
  const observer=new MutationObserver(examine);
  observer.observe(toaster,{subtree:true,childList:true,characterData:true});
  // Use only mutation notifications, no per-frame DOM query or layout read.
  // "Trashed" and the success toast are committed on a simulated second hit.
  // Sector file count changes when completed de-rez removes the actual entry.
  let hudObserver;
  if(attribution){
    const hud=document.querySelector('.hud'),log=hud?.querySelector('.hud-log');
    if(!hud||!log)throw new Error('Missing virtual Boot Camp file HUD for attribution');
    let previous,observedStatus;
    const captureHud=()=>{
      const [sector,run]=[...log.querySelectorAll('dd')].map(e=>e.textContent);
      const armed=hud.querySelector('[aria-label="Armed file targets"] [role="status"]');
      if(armed&&observedStatus!==armed){observedStatus=armed;hudObserver.observe(armed,{childList:true,subtree:true,characterData:true});}
      const state={sector,run,armed:armed?.textContent??null},signature=JSON.stringify(state);
      if(previous!==signature){previous=signature;q.fileEvents.push({type:'file-hud',t:performance.now(),...state});}
    };
    hudObserver=new MutationObserver(captureHud);
    hudObserver.observe(hud,{childList:true});hudObserver.observe(log,{childList:true,subtree:true,characterData:true});captureHud();
  }
  q.wait=(type,num,timeout)=>new Promise(resolve=>{
    let timer;
    const check=()=>{
      const cue=q.cues.filter(c=>c.type===type)[num-1];
      if(!cue)return;
      clearTimeout(timer);waiters.delete(check);resolve(cue);
    };
    waiters.add(check);timer=setTimeout(()=>{waiters.delete(check);resolve(null);},timeout);check();
  });
  const downs=new WeakMap(),pointerReads=[];
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,e=>{
    q.input.push({type,t:performance.now(),trusted:e.isTrusted,code:e.code,button:e.button,
      x:e.clientX,y:e.clientY,world:e.target===canvas});
    if(pointerProbe&&type==='pointerdown'&&e.isTrusted&&e.target===canvas){
      const sample={x:e.clientX,y:e.clientY,offsetX:0,offsetY:0,layerX:0,layerY:0};
      downs.set(e,sample);pointerReads.push(sample);
    }
  },true);
  if(pointerProbe){
    const fiberEventSource=canvas.parentElement?.parentElement;
    for(const key of ['offsetX','offsetY','layerX','layerY']){
      const proto=MouseEvent.prototype,descriptor=Object.getOwnPropertyDescriptor(proto,key);
      if(!fiberEventSource||!descriptor?.get||!descriptor.configurable)throw new Error('Cannot observe native canvas pointer '+key);
      Object.defineProperty(proto,key,{...descriptor,get(){
        const sample=downs.get(this);
        if(sample&&this.currentTarget===fiberEventSource)sample[key]++;
        return descriptor.get.call(this);
      }});
      restore.push(()=>Object.defineProperty(proto,key,descriptor));
    }
  }
  document.addEventListener('visibilitychange',()=>q.visibility.push({t:performance.now(),hidden:document.hidden}));
  // No per-draw wrappers or blocking query for shader status. Time only the
  // JS-facing driver calls on the existing gameplay GL context (not other GL).
  for(const name of ['linkProgram','compileShader']) {
    const proto=WebGL2RenderingContext.prototype,desc=Object.getOwnPropertyDescriptor(proto,name);
    const orig=proto[name];
    if(typeof orig!=='function')throw new Error(name+' cannot be observed');
    const wrapped=function(...args){
      if(this!==gl)return Reflect.apply(orig,this,args);
      const t=performance.now();
      try{return Reflect.apply(orig,this,args);}
      finally{q.gpuCalls.push({name,t,end:performance.now()});}
    };
    Object.defineProperty(proto,name,{value:wrapped,configurable:true,writable:true,enumerable:desc?.enumerable??false});
    if(gl[name]!==wrapped)throw new Error('Active WebGL context does not dispatch '+name+' through observed prototype');
    restore.push(()=>{if(desc)Object.defineProperty(proto,name,desc);else delete proto[name];});
  }
  if(trace){
    // Diagnose initial allocations only. No per-draw or bufferSubData wrapper,
    // no readback, and no instrumentation on other renderers or normal runs.
    const proto=WebGL2RenderingContext.prototype;
    const desc=Object.getOwnPropertyDescriptor(proto,'bufferData'),orig=proto.bufferData;
    const wrapped=function(...args){
      if(this!==gl)return Reflect.apply(orig,this,args);
      const [target,source,usage,offset=0,length=0]=args;
      const stride=source?.BYTES_PER_ELEMENT??1;
      const bytes=typeof source==='number'?source:length?length*stride:(source?.byteLength??0)-offset*stride;
      const t=performance.now();
      try{return Reflect.apply(orig,this,args);}
      finally{bufferUploads.push({target,usage,requestedBytes:Math.max(0,bytes),t,end:performance.now()});}
    };
    Object.defineProperty(proto,'bufferData',{value:wrapped,configurable:true,writable:true,enumerable:desc?.enumerable??false});
    restore.push(()=>{if(desc)Object.defineProperty(proto,'bufferData',desc);else delete proto.bufferData;});
  }
  let loaf;
  q.hasLoaf=PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
  const recordLongFrames=entries=>{
    for(const e of entries){
      const frame={t:e.startTime,duration:e.duration,blockingDuration:e.blockingDuration,renderStart:e.renderStart,styleAndLayoutStart:e.styleAndLayoutStart};
      if(attribution){
        const scripts=Array.from(e.scripts??[]);
        frame.scriptCount=scripts.length;
        frame.scripts=scripts.sort((a,b)=>b.duration-a.duration).slice(0,12).map(s=>({
          t:s.startTime,executionStart:s.executionStart,duration:s.duration,
          invokerType:s.invokerType??null,invoker:s.invoker?.slice(0,160)??null,
          sourceURL:s.sourceURL?.slice(0,320)??null,sourceFunctionName:s.sourceFunctionName?.slice(0,110)??null,
          sourceCharPosition:s.sourceCharPosition??null,sourceLine:s.sourceLine??null,sourceColumn:s.sourceColumn??null,
          forcedStyleAndLayoutDuration:s.forcedStyleAndLayoutDuration??null,forcedStyleDuration:s.forcedStyleDuration??null,
          forcedLayoutDuration:s.forcedLayoutDuration??null,pauseDuration:s.pauseDuration??null}));
      }
      q.longFrames.push(frame);
    }
  };
  if(q.hasLoaf) {
    loaf=new PerformanceObserver(list=>recordLongFrames(list.getEntries()));
    loaf.observe({type:'long-animation-frame'});
  }
  let active=true;
  const raf=t=>{
    if(!active)return;
    q.frames.push(t);
    const last=q.buffers.at(-1);
    if(!last||last.width!==canvas.width||last.height!==canvas.height)q.buffers.push({t,width:canvas.width,height:canvas.height});
    requestAnimationFrame(raf);
  };
  q.began=trace?mark('begin'):performance.now();q.startedHidden=document.hidden;requestAnimationFrame(raf);
  q.finish=()=>{
    active=false;observer.disconnect();hudObserver?.disconnect();if(loaf)recordLongFrames(loaf.takeRecords());loaf?.disconnect();for(const fn of restore)fn();
    q.ended=trace?mark('end'):performance.now();
    const {frames,visibility,input,cues,gpuCalls,buffers,longFrames,began,ended,startedHidden,hasLoaf,fileEvents}=q;
    return {rafTimestampsMs:frames,visibility,input,cues,gpuCalls,buffers,longFrames,began,ended,startedHidden,hasLoaf,...(attribution?{fileEvents}:{}),...(trace?{traceMarks,bufferUploads}:{}),...(pointerProbe?{pointerReads}:{})};
  };
}

const rounded=n=>+n.toFixed(3);
export function impactWindow(raw,from,to,summarize) {
  // Time intervals are selected by overlap, NOT by their ending timestamp:
  // a long frame spanning the DOM commit cannot disappear at a window edge.
  const intervals=[];
  for(let i=1;i<raw.rafTimestampsMs.length;i++){
    const a=raw.rafTimestampsMs[i-1],b=raw.rafTimestampsMs[i];
    if(a<to&&b>from)intervals.push({a,b,dt:b-a});
  }
  const calls=raw.gpuCalls.filter(c=>c.t>=from&&c.t<to);
  const buffer=raw.buffers.filter(b=>b.t<=from).at(-1);
  const changes=raw.buffers.filter(b=>b.t>from&&b.t<to);
  const longest=intervals.reduce((p,c)=>!p||p.dt<c.dt?c:p,null);
  return {fromMs:rounded(from),toMs:rounded(to),coverage:raw.rafTimestampsMs[0]<=from&&raw.rafTimestampsMs.at(-1)>=to,
    ...(intervals.length?summarize(intervals.map(i=>i.dt)):{samples:0}),
    longest:longest&&{startMs:rounded(longest.a),endMs:rounded(longest.b),durationMs:rounded(longest.dt)},
    linkCalls:calls.filter(c=>c.name==='linkProgram').length,compileCalls:calls.filter(c=>c.name==='compileShader').length,
    buffers:[...(buffer?[buffer]:[]),...changes]};
}

// Count the actual resolved impact rather than the potentially stale target
// prediction from designation. Reject unknown copy instead of guessing zero.
export function targetCount(cue) {
  if(/^Napalm impact · strike zone clear$/i.test(cue))return 0;
  const m=cue.match(/^Napalm impact · (\d+) targets? caught in the burn$/i);
  return m?Number(m[1]):null;
}
export function workloadMatches(expect,counts) {
  return counts.length===2&&counts.every(n=>Number.isInteger(n)&&n>=0
    &&(expect==='observe'||(expect==='targets'?n>0:n===0)));
}

// Read source only AFTER stopping measurement, and only from a hash-verified
// local bundle listed in the captured manifest. Never fetch attribution URLs.
async function addSourceSlices(raw,report,dist) {
  const cache=new Map();
  for(const f of raw.longFrames)for(const s of f.scripts??[]){
    let u;try{u=new URL(s.sourceURL);}catch{continue;}
    const asset=u.pathname.slice(1),pos=s.sourceCharPosition;
    if(u.origin!==report.origin||!/^assets\/[\w.-]+\.js$/.test(asset)||!Object.hasOwn(report.artifact,asset)||!Number.isInteger(pos)||pos<0)continue;
    if(!cache.has(asset)){
      const bytes=await readFile(path.join(dist,asset)).catch(()=>null);
      cache.set(asset,bytes&&createHash('sha256').update(bytes).digest('hex')===report.artifact[asset]?bytes.toString('utf8'):null);
    }
    const src=cache.get(asset);if(!src||pos>=src.length)continue;
    const start=Math.max(0,pos-64);s.sourceSlice={asset,start,offsetWithin:pos-start,text:src.slice(start,pos+128)};
  }
}

export async function runNapalmImpact({ev,page,click,mouse,waitFor,shot,snap,report,output,summarize,aim:override,expect,attribution=false,trace=false,pointerProbe=false,disarm=false,dist}) {
  const aim=override??{x:Math.round(report.width*.50),y:Math.round(report.height*.55)};
  const selected=`document.querySelector('.weapon-selector [aria-pressed="true"]')`;
  const key=type=>page('Input.dispatchKeyEvent',{type,key:'4',code:'Digit4',windowsVirtualKeyCode:52});
  const napalm=report.napalmImpact={aim,requestedWorkload:expect,attribution,disarmBetween:disarm,
    method:'Two normal left clicks in one virtual Boot Camp session, same stationary chase pose and screen target. Cold = first use this session, not empty browser/driver shader caches; warm = later use after prior effect lifetime. Impact anchor is the first DOM commit of the real impact-handler toast, not click, inbound, a guessed delay, audible transient or scanout.',
    frameMethod:'Intervals overlapping each window, including the spanning frame. Adjacent/overlapping windows must not be added. WebGL call counts use disjoint entry timestamps when windows are disjoint. linkProgram/compileShader durations are host API-return times, not completed GPU execution times.',
    strikes:[]};
  await ev('('+install.toString()+')('+[attribution,trace,pointerProbe].map(value=>JSON.stringify(value)).join(',')+')');
  const stateExpr=`({t:performance.now(),armed:document.querySelector('[aria-label="Armed file targets"] [role="status"]')?.textContent??null,
    run:document.querySelector('.hud-log div:nth-child(2) dd')?.textContent??null,sector:document.querySelector('.hud-log dd')?.textContent??null})`;
  let raw;
  try {
    await key('keyDown');await key('keyUp');await waitFor('selected napalm weapon',`/napalm/i.test(${selected}?.textContent)`);
    await mouse('mouseMoved',aim.x,aim.y);await delay(2500);
    for(let i=1;i<=2;i++) {
      if(!await ev(`!document.hidden && !('__TAURI_INTERNALS__' in window) && !location.search && document.querySelector('.training-badge')?.textContent==='Simulation'
        && !document.querySelector('.nightmare-order') && /napalm/i.test(${selected}?.textContent)
        && document.elementFromPoint(${aim.x},${aim.y})?.matches('canvas[data-engine]')`))
        throw new Error('Refusing strike outside unobstructed, foreground production Boot Camp');
      await click(aim);
      const inbound=await ev(`window.__impactQA.wait('inbound',${i},8000)`);
      if(!inbound)throw new Error('No runtime Phantom inbound cue for strike '+i);
      const impact=await ev(`window.__impactQA.wait('impact',${i},18000)`);
      if(!impact)throw new Error('No real impact cue for strike '+i+'; click is not an impact anchor');
      const actualTargets=targetCount(impact.text);
      napalm.strikes.push({use:i===1?'first-use':'repeat-use',inbound,impact,actualTargets});
      console.log('Observed real '+(i===1?'first':'repeat')+' impact: '+impact.text);
      // No screenshot, polling, GPU readback or model inspection inside any
      // timed event windows. At +5.8s the authored rolling-fire phase is over.
      await delay(5800);
      await shot('impact-'+i+'-afterglow-outside-window');
      if(i===1) {
        // Cleanup is 17.96s after strike begins; pad to 22s after inbound.
        // Readiness is an extra check, not proof of an earlier impact.
        const remaining=await ev(String(inbound.t+22000)+'-performance.now()');if(remaining>0)await delay(remaining);
        await waitFor('support cooldown ended',`/napalm/i.test(${selected}?.textContent)&&!${selected}?.querySelector('small')`);
        if(disarm){
          const before=await ev(stateExpr);
          if(!before.armed||!before.run||!before.sector)throw new Error('Cannot disarm: no observed armed simulated file(s) or missing before-state');
          for(const type of ['keyDown','keyUp'])await page('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
          await waitFor('armed file queue cleared before repeated strike',`!document.querySelector('[aria-label="Armed file targets"]')`,2500);
          napalm.disarmControl={before,afterEscape:await ev(stateExpr)};
        }
        await delay(2500); // separate completed first effect from pre-click idle
      }
    }
  } finally {
    raw=await ev('window.__impactQA.finish()');
    if(pointerProbe)napalm.pointerReads=raw.pointerReads;
    if(attribution)await addSourceSlices(raw,report,dist);
    await writeFile(path.join(output,'impact-raw.json'),JSON.stringify(raw));
  }
  const clicks=raw.input.filter(e=>e.type==='pointerdown'&&e.world&&e.trusted&&e.button===0);
  for(const [i,s] of napalm.strikes.entries()) {
    const clickT=clicks[i]?.t,t=s.impact.t, ib=s.inbound.t;
    if(!Number.isFinite(clickT))throw new Error('Missing trusted world click');
    s.clickT=clickT;s.clickToInboundMs=rounded(ib-clickT);s.inboundToImpactMs=rounded(t-ib);
    s.windows=Object.fromEntries(Object.entries({
      preClickIdle:[clickT-2000,clickT],launch:[clickT-50,ib+1000],
      inboundToImpact:[ib,t],preImpact:[t-2000,t-500],centeredImpact:[t-500,t+500],
      impactSpan:[t-150,t+150],ignite:[t,t+500],rollingFire:[t+500,t+4500],postRolling:[t+4500,t+5500],
    }).map(([name,[a,b]])=>[name,impactWindow(raw,a,b,summarize)]));
    s.nearbyGpuCalls=raw.gpuCalls.filter(c=>c.t>=t-500&&c.t<t+500).map(c=>({name:c.name,
      startRelativeToImpactMs:rounded(c.t-t),apiReturnMs:rounded(c.end-c.t)}));
    const closest=s.windows.centeredImpact.longest;
    if(closest)s.centeredWorstRelativeMs=[rounded(closest.startMs-t),rounded(closest.endMs-t)];
    if(attribution){
      s.nearbyFileEvents=raw.fileEvents.filter(e=>e.t>t-200&&e.t<t+1800).map(e=>({...e,relativeMs:rounded(e.t-t)}));
      s.nearbyLongFrames=raw.longFrames.filter(f=>f.t+f.duration>t-500&&f.t<t+1800).map(f=>({...f,relativeMs:rounded(f.t-t)}));
    }
  }
  const counts=napalm.strikes.map(s=>s.actualTargets);
  napalm.observedWorkload=workloadMatches('clear',counts)?'both clear':
    workloadMatches('targets',counts)?'both target-bearing':counts.includes(null)?'unrecognized impact count':'mixed clear and target-bearing';
  report.bufferChanges=raw.buffers;report.after=await snap();
  if(disarm){
    const c=napalm.disarmControl;c.afterSecond=await ev(stateExpr);
    report.checks.provedDisarmControl=raw.input.some(e=>e.type==='keydown'&&e.code==='Escape'&&e.trusted&&e.t>=c.before.t&&e.t<=c.afterEscape.t)
      &&c.afterEscape.armed===null&&c.afterSecond.armed!==null
      &&c.before.run===c.afterEscape.run&&c.afterSecond.run===c.before.run
      &&c.before.sector===c.afterEscape.sector&&c.afterSecond.sector===c.before.sector;
  }
  Object.assign(report.checks,{
    twoTrustedProductionStrikes:clicks.length===2&&clicks.every(e=>e.x===aim.x&&e.y===aim.y)&&raw.input.some(e=>e.trusted&&e.code==='Digit4')
      &&raw.cues.map(c=>c.type).join(',')==='inbound,impact,inbound,impact',
    intendedImpactWorkload:workloadMatches(expect,counts),
    correctImpactOrder:napalm.strikes.every(s=>s.clickT<=s.inbound.t&&s.inbound.t<s.impact.t),
    separatedStrikes:napalm.strikes[1].clickT-napalm.strikes[0].inbound.t>=22000,
    allImpactWindowsCovered:napalm.strikes.every(s=>Object.values(s.windows).every(w=>w.coverage&&w.samples>0)),
    foregroundImpact:!raw.startedHidden&&!raw.visibility.some(v=>v.hidden),
    fullSizeImpact:raw.buffers.length>0&&raw.buffers.every(b=>b.width===report.width&&b.height===report.height),
  });
}
