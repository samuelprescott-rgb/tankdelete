import assert from 'node:assert/strict';
import {waitForWorldFrames,physicalPresentation} from './qa-wk-render-ready.mjs';

async function exercise(program,draw){
  let seq=0;const timers=new Map(),world={isConnected:true,width:1920,height:1080,dataset:{engine:'three.js'},
    getBoundingClientRect:()=>({width:1920,height:1080})};
  const ctx={CURRENT_PROGRAM:1,RENDERER:2,getParameter:p=>p===1?program:'test',drawingBufferWidth:1920,drawingBufferHeight:1080,isContextLost:()=>false};
  const renderer={domElement:world,getContext:()=>ctx,info:{render:{frame:0,calls:12,triangles:1024}}},camera={};
  const tank={isGroup:true,name:'player-tank',parent:{}},original=()=>{};
  const scene={getObjectByName:()=>tank,onAfterRender:original};
  tank.__r3f={root:{getState:()=>({scene,camera,gl:renderer})}};
  const radar={'__reactFiber$fixture':{memoizedState:{memoizedState:{current:tank}}}};
  globalThis.innerWidth=1920;globalThis.innerHeight=1080;
  globalThis.document={hidden:false,querySelectorAll:()=>[world],querySelector:s=>({
    '.training-badge':{textContent:'  SIMULATION  '},'.header h2':{textContent:'Boot Camp'},
    'canvas[data-engine]':world,'canvas[data-game-ui]':radar})[s]};
  globalThis.requestAnimationFrame=fn=>{const id=++seq;timers.set(id,setTimeout(()=>{timers.delete(id);
    if(draw){renderer.info.render.frame++;scene.onAfterRender(renderer,scene,camera);}
    fn(performance.now());},5));return id;};
  globalThis.cancelAnimationFrame=id=>{clearTimeout(timers.get(id));timers.delete(id);};
  const report={};
  if(draw){assert.equal(await waitForWorldFrames('boot',report,250),ctx);assert.equal(report.renderReadiness.samples.length,3);}
  else await assert.rejects(waitForWorldFrames('boot',report,100),/No three live/);
  assert.equal(scene.onAfterRender,original,'restore production callback even on a failed readiness test');
  assert.equal(timers.size,0,'no QA sampler remains in an acceptance window');
}
await exercise(null,true);await exercise({},false);
const state={stage:'peak',occlusionVisible:true,backingSurface:[1920,1080],onActiveSpace:true,wholeFrameOnScreen:true,wholeFrameInUsableScreen:true};
const present=(s,order='front-physical')=>physicalPresentation({native:{order,samples:[s]},viewport:[1920,1080]});
assert.equal(present(state).verifiedPhysical1080,true);
assert.equal(present(state,'back-physical').verifiedPhysical1080,true);
assert.equal(present(state,'back-physical').verifiedPlayerFocus,false);
assert.equal(present({...state,backingSurface:[3840,2160]},'front').verifiedPhysical1080,false);
assert.equal(present({...state,wholeFrameOnScreen:false}).verifiedPhysical1080,false);
assert.equal(present({...state,wholeFrameInUsableScreen:false}).verifiedPhysical1080,false);
assert.equal(present({...state,occlusionVisible:false}).verifiedPhysical1080,false);
const keyState={...state,key:true,main:true,appActive:true};
const player=(stages)=>physicalPresentation({native:{order:'player-physical',samples:stages}});
assert.equal(player([{...keyState,stage:'measureBegin'},{...keyState,stage:'measureEnd'}]).verifiedPlayerFocus,true);
assert.equal(player([{...keyState,stage:'peak'},{...keyState,stage:'focus',main:false},{...keyState,stage:'complete'}]).verifiedPlayerFocus,false);
assert.equal(player([{...keyState,stage:'peak'}]).verifiedPlayerFocus,false);
console.log('WK readiness distinguishes real repeated world draws from a bound program; observer is removed before measurement.');
