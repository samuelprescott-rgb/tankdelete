import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installQueueProbe,installPassWallProbe,summarizeQueueProbe} from './qa-wk-queue-probe.mjs';

// Fake only an isolated context for probe semantics; no synthetic numbers are
// written into any real route receipt.
let t=0,epoch=0,active=0,waitResult=3,disjoint=false;
const waits=[],timers=new Map(),subs=new Map(),canvas={},radar={};
const ctx={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,TIMEOUT_EXPIRED:3,CONDITION_SATISFIED:4,
  getExtension(k){assert.equal(k,'EXT_disjoint_timer_query_webgl2');return disjoint?{}:null;},
  fenceSync(a,b){assert.deepEqual([a,b],[1,0]);assert.equal(active++,0);return {};},
  clientWaitSync(_s,f,ns){assert.equal(f,0);assert.equal(ns,0);waits.push(t);return waitResult;},
  deleteSync(){assert.equal(active--,1);},flush(){assert.fail('must never flush');},finish(){assert.fail('must never finish');}};
const state={gl:{getContext:()=>ctx},internal:{subscribers:[{priority:1}],
  subscribe(s,p){subs.set(p,s.current);return ()=>subs.delete(p);}}};
radar.__reactFiber$0={memoizedState:{memoizedState:{current:{name:'player-tank',__r3f:{root:{getState:()=>state}}}}}};
const globals={window:{},location:{hostname:'127.0.0.1'},performance:{now:()=>t},ctx,
  document:{timeline:{get currentTime(){return epoch;}},querySelector:s=>s.includes('badge')?{textContent:'Simulation'}:s.includes('data-game-ui')?radar:canvas},
  setTimeout(fn,dt){assert.equal(dt,6);timers.set(fn,fn);return fn;},clearTimeout:k=>timers.delete(k)};
const install=()=>vm.runInNewContext('('+installQueueProbe.toString()+')(ctx)',globals);
function draw(a,b,c){
  epoch=t=a;subs.get(-10000)();t=b;subs.get(.999)();t=c;subs.get(1.001)();
}
function midway(at,result){t=at;waitResult=result;for(const fn of timers.values()){timers.delete(fn);fn();}}
const probe=install();probe.markFirst(0);
draw(0,1,4);midway(10,2);draw(50,51,53);midway(59,3);
// A pending fence cannot be replaced, and polling cannot flush. At next
// entry, observing it signaled doesn't prove completion before that entry.
waitResult=3;draw(67,68,70);assert.equal(active,1);
waitResult=2;draw(84,85,87);
const result=probe.finish(),summary=summarizeQueueProbe(result,[[0],[50],[67],[84]]);
assert.equal(result.disjointTimer,false);assert.equal(result.failure,null);
assert.equal(summary.exactEpochMatches,3);assert.equal(summary.gaps.length,1);
assert.equal(summary.gaps[0].fenceSignaledBeforeNextEntryMs,40);
assert.equal(summary.gaps[0].simMs,1);assert.equal(summary.gaps[0].composerMs,3);
assert.equal(summary.signaledAhead.samples,1);assert.equal(summary.signaledAhead.max,40);
assert.equal(summarizeQueueProbe(result,[[2],[48]]).exactEpochMatches,0);
assert.equal(subs.size,0);assert.equal(timers.size,0);assert.equal(active,0);
assert.deepEqual(waits,[10,59,67,84]);
disjoint=true;
const failed=install();draw(100,101,102);midway(108,99);draw(117,118,119);
assert.equal(active,0);assert.equal(failed.finish().failure,'clientWaitSync failed');
assert.equal(subs.size,0);
const world={},camera={},fx={children:[{isMesh:true,material:{name:'FXAA'},geometry:{attributes:{position:{count:3},uv:{count:3}}}}]};
let dst=null;
const target={texture:{name:'HDR'}},rr={getRenderTarget:()=>dst,
  setRenderTarget(next){dst=next;t+=2;return 44;},
  render(scene){t+=3;if(scene===world){this.setRenderTarget(target);t+=5;}return 123;}};
const origRender=rr.render,origSet=rr.setRenderTarget;
const one={entry:0,simBegin:0,composerBegin:0,composerEnd:20,epoch:0,polls:[]};
const two={...one,entry:50,epoch:50};
const pass=vm.runInNewContext('('+installPassWallProbe.toString()+')(rr,world,camera,()=>one)',
  {rr,world,camera,one,performance:globals.performance});
assert.equal(rr.render(world,camera),123); // nested target bind belongs only to world
rr.render(fx,camera);assert.equal(rr.setRenderTarget(null),44);rr.render(fx,camera);
const passCatalog=pass.finish();
assert.equal(rr.render,origRender);assert.equal(rr.setRenderTarget,origSet);
const sum=summarizeQueueProbe({firstPeakEpoch:0,samples:[one,two],passCatalog},[[0],[50]]);
assert.deepEqual(sum.gaps[0].passBreakdown.wall,{'world':10,'fullscreen-effect':3,'fullscreen-final':3,'target-change':2,'other-scene':0});
assert.equal(sum.gaps[0].passBreakdown.outsideTimedMethodsMs,2);
assert.equal(sum.passSummary.groups['target-change'].callsPerFrame.max,1);
const marker={name:'Synthetic test mesh',type:'Mesh',parent:{name:'test parent'}};
const material={name:'fake'},geometry={type:'BufferGeometry',index:{count:42}};
const direct=function(){t+=6;return 4;};
const drawRenderer={getRenderTarget:()=>target,setRenderTarget:()=>{},renderBufferDirect:direct,
  render(scene){t+=2;assert.equal(this.renderBufferDirect(camera,scene,geometry,material,marker),4);}};
const drawRow={epoch:0,entry:0,polls:[],simBegin:0,composerBegin:0,composerEnd:16};
const drawProbe=vm.runInNewContext('('+installPassWallProbe.toString()+')(drawRenderer,world,camera,()=>drawRow,true)',
  {drawRenderer,world,camera,drawRow,performance:globals.performance});
drawRenderer.render(world,camera);drawRenderer.render(fx,camera);
const drawCatalog=drawProbe.finish(),drawSum=summarizeQueueProbe({samples:[drawRow,two],firstPeakEpoch:0,
  passCatalog:drawCatalog,drawCalibration:drawProbe.calibration},[[0],[50]]);
assert.equal(drawRenderer.renderBufferDirect,direct);
assert.equal(drawSum.gaps[0].drawWall.count,1);assert.equal(drawSum.gaps[0].drawWall.sumMs,6);
assert.equal(drawSum.gaps[0].drawWall.slow[0].object,'Synthetic test mesh');
assert.equal(drawSum.gaps[0].drawWall.slow[0].previousGeometryDraws,0);
assert.equal(drawSum.gaps[0].drawWall.outsideDirectMs,2);
assert.equal(drawSum.drawSummary.count.p50,1);
console.log('Queue diagnostic: non-forcing polls, single outstanding fence, clean teardown, exact epoch attribution and failure paths passed.');
