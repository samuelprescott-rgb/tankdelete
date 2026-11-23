// Diagnostic only, never called by the acceptance probes. The native clock
// synchronization round trip bounds the offset without assuming symmetric IPC.
export function installCorrelation(report,bridge,cleanups){
  const now=performance.now.bind(performance),rows=report.clockSync=[],pending=new Map();
  const work=report.nonRafWork=[],tasks=report.diagnosticMainTicks=[];
  let id=0;
  window.__wkClockReply=(i,host)=>{const sent=pending.get(i);if(sent===undefined)return;
    rows.push({sent,host,received:now()});pending.delete(i);};
  const sync=()=>{const i=id++;pending.set(i,now());bridge.postMessage({op:'clockSync',id:i});};
  sync();const syncTimer=setInterval(sync,2500),timer=setInterval(()=>tasks.push(now()),12);
  cleanups.push(()=>{clearInterval(syncTimer);clearInterval(timer);delete window.__wkClockReply;});
  const timed=(kind,fn)=>function(...args){const at=now();try{return Reflect.apply(fn,this,args);}
    finally{const end=now();if(end-at>=6&&work.length<1000)work.push({kind,at,end,fn:Function.prototype.toString.call(fn).slice(0,110)});}};
  for(const name of ['setTimeout','setInterval']){
    const original=window[name];window[name]=function(fn,...rest){return original.call(this,typeof fn==='function'?timed(name,fn):fn,...rest);};
    cleanups.push(()=>{window[name]=original;});
  }
  // React's scheduler uses MessageChannel in this production build. Wrap
  // callbacks at assignment time, not every message listener on the page.
  const p=window.MessagePort?.prototype,d=p&&Object.getOwnPropertyDescriptor(p,'onmessage');
  if(d?.configurable&&d.get&&d.set){
    const original=new WeakMap();Object.defineProperty(p,'onmessage',{...d,get(){const actual=d.get.call(this),pair=original.get(this);
      return pair&&actual===pair.wrapped?pair.fn:actual;},set(fn){if(typeof fn!=='function'){original.delete(this);return d.set.call(this,fn);}
      const wrapped=timed('MessagePort.onmessage',fn);original.set(this,{fn,wrapped});return d.set.call(this,wrapped);}});
    cleanups.push(()=>Object.defineProperty(p,'onmessage',d));
  }
}

export function summarizeCorrelations(r){
  // Browser timestamps are precision-limited in this non-isolated page. Keep
  // +/-1 ms at both ends; choose the narrowest nearby RTT, never a wall clock.
  function calibration(at){const c=r.clockSync?.filter(x=>Number.isFinite(x.host)&&x.received>=x.sent)
    .sort((a,b)=>{const near=x=>Math.abs(x.sent-at)<=7500?0:1;return near(a)-near(b)||(a.received-a.sent)-(b.received-b.sent)||Math.abs(a.sent-at)-Math.abs(b.sent-at);})[0];
    if(!c)return null;const lo=c.host-c.received-1,hi=c.host-c.sent+1;return {offset:(lo+hi)/2,error:(hi-lo)/2,syncDistanceMs:Math.abs(c.sent-at)};}
  function clock(ticks,start,end){const gaps=[];let count=0;for(let i=1;i<ticks.length;i++){
    const a=ticks[i-1],b=ticks[i];if(a<end&&b>start)gaps.push(b-a);if(b>=start&&b<end)count++;}
    return {count,worstOverlappingMs:gaps.length?Math.max(...gaps):null};}
  const native=r.native?.diagnostic20msTicksUptimeMs??[],out=[];
  const q=r.impact;if(!q)return out;
  for(let i=1;i<r.raf.length;i++){
    const prev=r.raf[i-1],next=r.raf[i];if(next[0]-prev[0]<=33.4||prev[0]<q.began||next[0]>q.ended)continue;
    const a=prev[1],b=next[1],c=calibration(a),overlap=(x,y)=>Math.max(0,Math.min(b,y)-Math.max(a,x));
    const scene=r.scene.filter(v=>v[0]<b&&v[2]>a),context=q.cues.filter(k=>k.t<=prev[0]).at(-1);
    out.push({raf:[prev[0],next[0]],wall:[a,b],duration:next[0]-prev[0],afterCue:context?{type:context.type,dt:prev[0]-context.t}:null,
      callbackMs:prev[3],idleAfterCallbacksMs:b-prev[2],simulationMs:scene.reduce((n,v)=>n+overlap(v[0],v[1]),0),composerMs:scene.reduce((n,v)=>n+overlap(v[1],v[2]),0),
      nonRaf:r.nonRafWork.filter(v=>overlap(v.at,v.end)>0),main12ms:clock(r.diagnosticMainTicks,a,b),
      host20ms:c?clock(native,a+c.offset,b+c.offset):null,alignment:c,
      htmlMedia:r.media.filter(v=>(v[0]>=a&&v[0]<b)||overlap(v[0],v[0]+v[3])>0),
      audioStarts:r.shots.filter(v=>(v.t>=a&&v.t<b)||overlap(v.t,v.returned??v.t)>0).map(v=>v.name),
      shaders:q.gpuCalls.filter(v=>(v.t>=a&&v.t<b)||overlap(v.t,v.end)>0),fileEvents:q.fileEvents.filter(v=>v.t>=a&&v.t<b)});
  }return out;
}
