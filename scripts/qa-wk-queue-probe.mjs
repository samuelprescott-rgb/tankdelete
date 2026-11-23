// Inject only into the explicitly diagnostic replay. A fence covers WebGL
// commands before it, not presentation/compositing or subsequent submissions.
export function installQueueProbe(ctx,installPasses=null,measureDraws=false) {
  if ('__TAURI_INTERNALS__' in window || location.hostname !== '127.0.0.1' ||
      document.querySelector('.training-badge')?.textContent.trim() !== 'Simulation')
    throw Error('Queue diagnostic requires isolated local simulation');
  const radar=document.querySelector('canvas[data-game-ui]');
  const key=Object.keys(radar).find(k=>k.startsWith('__reactFiber$'));
  let store;
  for(let f=radar[key];f&&!store;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const o=h.memoizedState?.current;if(o?.name==='player-tank'){store=o.__r3f?.root;break;}
  }
  const state=store?.getState();
  if(state?.gl.getContext()!==ctx || Math.max(...state.internal.subscribers.map(s=>s.priority))!==1)
    throw Error('Cannot identify live priority-1 composer');
  const now=()=>performance.now(), samples=[], unsub=[], timers=new Set();
  let pending=null,current=null,composerRow=null,dropped=0,failure=null,stamp=null;
  const disjointTimer=!!ctx.getExtension('EXT_disjoint_timer_query_webgl2');
  const fenceSupported=['fenceSync','clientWaitSync','deleteSync'].every(k=>typeof ctx[k]==='function');
  const passes=installPasses?.(state.gl,state.scene,state.camera,()=>composerRow,measureDraws);
  const release=()=>{if(!pending)return;ctx.deleteSync(pending.sync);pending=null;};
  // Never flush or wait. At most one in-flight fence; at most one midway
  // timer per submitted fence plus one availability check on later frames.
  const check=(p,source)=>{
    if(pending!==p||!p)return;
    const begin=now(),result=ctx.clientWaitSync(p.sync,0,0),end=now();
    const value=result===ctx.ALREADY_SIGNALED||result===ctx.CONDITION_SATISFIED?'signaled':
      result===ctx.TIMEOUT_EXPIRED?'pending':'failed';
    p.row.polls.push([source,begin,end,value]);
    if(value==='failed')failure='clientWaitSync failed';
    if(value!=='pending')release();
  };
  const sub=(priority,fn)=>unsub.push(state.internal.subscribe({current:fn},priority,store));
  sub(-10000,()=>{
    if(samples.length>=1600){current=null;dropped++;return;}
    current={epoch:document.timeline?.currentTime??null,entry:now(),polls:[]};
    samples.push(current);check(pending,'frame-entry');current.simBegin=now();
  });
  sub(.999,()=>{composerRow=current;if(current)current.composerBegin=now();});
  sub(1.001,()=>{
    composerRow=null;if(!current)return;
    current.composerEnd=now();
    if(!pending&&fenceSupported&&!failure){
      const sync=ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE,0);
      current.insertEnd=now();
      if(!sync){failure='fenceSync returned null';return;}
      const p=pending={sync,row:current};
      const timer=setTimeout(()=>{timers.delete(timer);check(p,'mid-gap');},6);
      timers.add(timer);
    }
  });
  return {markFirst:t=>{stamp=t;},finish(){
    for(const fn of unsub)fn();for(const timer of timers)clearTimeout(timer);release();
    return {firstPeakEpoch:stamp,disjointTimer,fenceSupported,failure,dropped,samples,passCatalog:passes?.finish()??null,drawCalibration:passes?.calibration??null};
  }};
}

// Optional finer cut. Only the two methods of the mounted renderer instance
// are wrapped, never WebGL draw/driver calls. No new renders or target writes.
export function installPassWallProbe(renderer,world,mainCamera,currentRow,measureDraws=false){
  const now=()=>performance.now(),render=renderer.render,set=renderer.setRenderTarget;
  const catalog=[],indices=new Map();let depth=0;
  const direct=renderer.renderBufferDirect;let drawRow=null,slowCount=0,calibration=null;
  if(measureDraws){
    if(typeof direct!=='function')throw Error('Direct draw entry missing');
    const n=8192,start=now();let sink=0;
    for(let i=0;i<n;i++){const a=now(),b=now();sink+=b-a;}
    calibration={clockPairs:n,elapsedMs:now()-start,sink,bound:'clock reads / synthetic bookkeeping; not a bound on graphics or scheduler perturbation'};
    const counter={n:0,ms:0},noop=v=>v,baseline=function(v){return Reflect.apply(noop,this,arguments);};
    const surrogate=function(v){const a=now();try{return Reflect.apply(noop,this,arguments);}
      finally{const dt=now()-a;counter.n++;counter.ms+=dt;}};
    const batch=fn=>{let result=0;const t=now();for(let i=0;i<n;i++)result+=fn(i&1);return {ms:now()-t,result};};
    calibration.surrogatePairs=[false,true,false].map(reverse=>{
      const pair=reverse?{instrumented:batch(surrogate),plain:batch(baseline)}:{plain:batch(baseline),instrumented:batch(surrogate)};
      return {plainMs:pair.plain.ms,instrumentedMs:pair.instrumented.ms,equalResults:pair.plain.result===pair.instrumented.result};});
    // Count resource submissions only inside the diagnostic's measured world
    // frames. This distinguishes a new geometry from a previously seen draw,
    // not a hardware cache miss or first use since app launch.
    const geometryDraws=new WeakMap(),meshDraws=new WeakMap();
    renderer.renderBufferDirect=function(camera,scene,geometry,mat,obj){
      if(!drawRow)return Reflect.apply(direct,this,arguments);
      const previousMeshDraws=meshDraws.get(obj)||0,previousGeometryDraws=geometryDraws.get(geometry)||0;
      meshDraws.set(obj,previousMeshDraws+1);geometryDraws.set(geometry,previousGeometryDraws+1);
      const row=drawRow;drawRow=null;const a=now();
      try{return Reflect.apply(direct,this,arguments);}finally{
        const b=now(),ms=b-a;drawRow=row;row.count++;row.sumMs+=ms;
        if(ms>=4&&slowCount<32){slowCount++;row.slow.push({start:a,ms,previousMeshDraws,previousGeometryDraws,
          object:obj?.name||'',parent:obj?.parent?.name||'',grandparent:obj?.parent?.parent?.name||'',
          type:obj?.type,instances:obj?.isInstancedMesh?obj.count:null,material:mat?.name||mat?.type||'',
          geometry:geometry?.name||geometry?.type||'',indexCount:geometry?.index?.count??null});}
      }
    };
  }
  const record=(row,kind,material,target,dt)=>{
    const destination=target===null?'screen':target?.texture?.name||'unnamed-target';
    const key=kind+'|'+material+'|'+destination;
    let id=indices.get(key);
    if(id===undefined){id=catalog.length;indices.set(key,id);catalog.push({kind,material,destination});}
    const timings=row.passWall??=[];
    while(timings.length<=id)timings.push(null); // WK bridge requires JSONable dense arrays.
    const slot=timings[id]??=[0,0];
    slot[0]++;slot[1]+=dt;
  };
  renderer.render=function(scene,camera){
    const row=currentRow();
    if(!row||depth)return Reflect.apply(render,this,arguments);
    // getRenderTarget() returns Three's in-memory JS binding, not a GL read.
    const dst=this.getRenderTarget(),isWorld=world===scene&&mainCamera===camera;
    const mesh=!isWorld&&scene.children?.length===1?scene.children[0]:null;
    const fullscreen=mesh?.isMesh&&mesh.geometry?.attributes?.position?.count===3&&mesh.geometry?.attributes?.uv?.count===3;
    const kind=isWorld?'world':fullscreen?(dst===null?'fullscreen-final':'fullscreen-effect'):'other-scene';
    const material=fullscreen?mesh.material?.name||'unnamed-material':'';
    if(isWorld&&measureDraws)drawRow=row.drawWall??={count:0,sumMs:0,slow:[]};
    depth++;const start=now();
    try{return Reflect.apply(render,this,arguments);}
    finally{const dt=now()-start;depth--;drawRow=null;record(row,kind,material,dst,dt);}
  };
  renderer.setRenderTarget=function(target){
    const row=currentRow();
    if(!row||depth)return Reflect.apply(set,this,arguments);
    depth++;const start=now();
    try{return Reflect.apply(set,this,arguments);}
    finally{const dt=now()-start;depth--;record(row,'target-change','',target,dt);}
  };
  return {calibration,finish(){renderer.render=render;renderer.setRenderTarget=set;if(measureDraws)renderer.renderBufferDirect=direct;return catalog;}};
}

export function summarizeQueueProbe(probe,frames) {
  const pct=(a,p)=>a.length?a.toSorted((x,y)=>x-y)[Math.ceil(a.length*p)-1]:null;
  const stats=a=>({samples:a.length,p50:pct(a,.5),p95:pct(a,.95),max:pct(a,1)});
  const byEpoch=new Map(probe.samples.map(s=>[s.epoch,s]));
  const rows=[],gaps=[],passKinds=['world','fullscreen-effect','fullscreen-final','target-change','other-scene'];
  for(let i=1;i<frames.length;i++){
    const a=probe.firstPeakEpoch+frames[i-1][0],b=probe.firstPeakEpoch+frames[i][0];
    const prev=byEpoch.get(a),next=byEpoch.get(b);
    if(!prev||!next)continue; // no nearest-clock guesses
    const signaled=prev.polls.find(v=>v[3]==='signaled'&&v[2]<next.entry);
    const r={epoch:a,intervalMs:b-a,simMs:prev.composerBegin-prev.simBegin,
      composerMs:prev.composerEnd-prev.composerBegin,wallAfterComposerMs:next.entry-prev.composerEnd,
      fenceSignaledBeforeNextEntryMs:signaled?next.entry-signaled[2]:null,polls:prev.polls};
    if(probe.passCatalog){
      const wall=Object.fromEntries(passKinds.map(k=>[k,0])),calls=Object.fromEntries(passKinds.map(k=>[k,0]));
      const detail=[];
      for(const [id,v] of (prev.passWall??[]).entries()){
        if(!v)continue;
        const item=probe.passCatalog[id];calls[item.kind]+=v[0];wall[item.kind]+=v[1];
        if(v[1]>0)detail.push({...item,calls:v[0],wallMs:v[1]});
      }
      const accounted=Object.values(wall).reduce((n,v)=>n+v,0);
      r.passBreakdown={wall,calls,outsideTimedMethodsMs:r.composerMs-accounted};
      if(prev.drawWall)r.drawWall={...prev.drawWall,outsideDirectMs:wall.world-prev.drawWall.sumMs};
      if(b-a>33.4)r.passBreakdown.nonzero=detail;
    }
    rows.push(r);if(b-a>33.4)gaps.push(r);
  }
  const polls=probe.samples.flatMap(s=>s.polls);
  return {expected:Math.max(0,frames.length-1),exactEpochMatches:rows.length,sim:stats(rows.map(r=>r.simMs)),
    composer:stats(rows.map(r=>r.composerMs)),afterComposer:stats(rows.map(r=>r.wallAfterComposerMs)),
    signaledAhead:stats(rows.flatMap(r=>r.fenceSignaledBeforeNextEntryMs==null?[]:[r.fenceSignaledBeforeNextEntryMs])),
    insertCost:stats(probe.samples.flatMap(s=>s.insertEnd==null?[]:[s.insertEnd-s.composerEnd])),
    zeroTimeoutPollCost:stats(polls.map(p=>p[2]-p[1])),polls:polls.length,gaps,
    drawSummary:probe.drawCalibration?{count:stats(rows.map(r=>r.drawWall?.count??0)),sumMs:stats(rows.map(r=>r.drawWall?.sumMs??0)),outsideDirectMs:stats(rows.map(r=>r.drawWall?.outsideDirectMs??0))}:null,
    passSummary:probe.passCatalog?{groups:Object.fromEntries(passKinds.map(k=>[k,{
      callsPerFrame:stats(rows.map(r=>r.passBreakdown.calls[k])),wallMsPerFrame:stats(rows.map(r=>r.passBreakdown.wall[k]))}])),
      outsideTimedMethodsMs:stats(rows.map(r=>r.passBreakdown.outsideTimedMethodsMs))}:null};
}
