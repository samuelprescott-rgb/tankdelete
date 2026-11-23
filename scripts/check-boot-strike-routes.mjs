import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import React from 'react';
import * as T from 'three';
import {act,context,extend,reconciler} from '@react-three/fiber';
import {bootStrikeRoutes,verifySurveyedRoute} from './boot-strike-routes.mjs';
import {targetCount} from './measure-napalm-impact.mjs';

const buildResult=await build({configFile:false,logLevel:'silent',publicDir:false,esbuild:{jsx:'automatic'},
  build:{ssr:fileURLToPath(new URL('./fixtures/boot-strike-layout.ts',import.meta.url)),write:false}});
const code=buildResult.output.find(c=>c.type==='chunk'&&c.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {bootStrikeLayout,isPointInsideNapalmStrike,CameraRig,VietCongCombatants,USInfantrySquad,createUSInfantryCombatants,
  createVillageObstacle,NAPALM_STRIKE_LENGTH:L,NAPALM_STRIKE_WIDTH:W}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const {blocks,enemies}=bootStrikeLayout(), sparks=b=>Math.min(500,Math.max(20,Math.floor(b.scale*200)));
const cluster=(x,z)=>({rotation:Math.atan2(x,z+12),position:[x,0,z]});
let clusters=0;
for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++)for(let k=j+1;k<blocks.length;k++){
  const bs=[blocks[i],blocks[j],blocks[k]];if(bs.reduce((n,b)=>n+sparks(b),0)<1446)continue;
  clusters++;
  assert(bs.some(a=>bs.some(b=>Math.hypot(a.position[0]-b.position[0],a.position[2]-b.position[2])>Math.hypot(L,W))),
    'Re-evaluate the full Boot Camp workload: an equally heavy triple may now fit');
}
assert(clusters>0);
const edges=(x,z,mark,padding=0)=>{
  const c=Math.cos(mark.rotation),s=Math.sin(mark.rotation),dx=x-mark.position[0],dz=z-mark.position[2];
  return [Math.abs(dx*c-dz*s)-L/2-padding, Math.abs(dx*s+dz*c)-W/2-padding];
};
const diagnostics=[];
for(const [name,route] of Object.entries(bootStrikeRoutes)){
  const [x,,z]=route.landmark,mark=cluster(x,z),hit=blocks.filter(b=>isPointInsideNapalmStrike(b.position[0],b.position[2],mark));
  assert.deepEqual(hit.map(b=>b.name).sort(),[...route.names].sort());
  assert.equal(hit.reduce((n,b)=>n+b.size/2**20,0),route.mib);
  assert.equal(hit.reduce((n,b)=>n+sparks(b),0),route.sparks);
  // HUD receipts have counts and freed bytes rather than paths. Prove those
  // two observations uniquely identify these distinct files in this manifest.
  const matching=[];
  for(let mask=0;mask<2**blocks.length;mask++){
    const subset=blocks.filter((_,i)=>mask&(1<<i));
    if(subset.length===route.files && subset.reduce((n,b)=>n+b.size/2**20,0)===route.mib)
      matching.push(subset.map(b=>b.name).sort());
  }
  assert.deepEqual(matching,[[...route.names].sort()]);
  const margin=Math.min(...blocks.map(b=>Math.abs(Math.max(...edges(b.position[0],b.position[2],mark)))));
  assert(margin>.38,'The aim must not sit on a file edge');
  const homeDist=Math.min(...enemies.map(e=>Math.hypot(...edges(e.position[0],e.position[2],mark,.35).map(v=>Math.max(v,0)))));
  if(route.files===3)assert(homeDist>7.5,'Clear even the 7-unit detour, not just the regular 5.1-unit patrol');
  diagnostics.push({name,route,mark,margin,homeDist,patrolDist:Infinity});
  const n=route.files,m=route.mib,bytes=m.toFixed(2)+' MB',cues=[100,8000].map(t=>({inbound:{text:'Phantom inbound · '+n+' targets in strike zone'},impact:{t,text:'Napalm impact · '+n+' targets caught in the burn'}}));
  const events=[{type:'file-hud',t:0,sector:'13 files',run:'0 trashed · 0 B freed',armed:null},
    {type:'file-hud',t:105,sector:'13 files',run:'0 trashed · 0 B freed',armed:n+' files armed · '+bytes},
    {type:'deletion-toast',t:8000,text:'Deleted '+n+' files (+'+m+' pts)'},
    {type:'file-hud',t:8800,sector:(13-n)+' files',run:n+' trashed · '+bytes+' freed',armed:null}];
  const validate=()=>Object.values(verifySurveyedRoute(route,cues,events,targetCount)).every(Boolean);
  assert(validate());events[1].armed=(n-1)+' files armed · '+bytes;assert(!validate());
  events[1].armed=n+' files armed · '+bytes;cues[0].inbound.text='Phantom inbound · '+(n+1)+' targets in strike zone';assert(!validate());
}
// Play the actual camera and both authored infantry components without GL.
// Actors are held alive to sample their uninterrupted full patrol cycle; this
// is a sensitivity check, not a substitute for the actual HUD receipts.
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.document=new EventTarget();extend(T);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,16/9,.1,340),subs=new Map();
const state={scene,camera,invalidate(){},internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),subscribe(r,p){subs.set(r,p);return()=>subs.delete(r);}}};
const store=Object.assign((sel=x=>x)=>sel(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;},root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const render=node=>act(async()=>reconciler.updateContainer(node&&React.createElement(context.Provider,{value:store},node),root,null,null));
const tank=new T.Group();tank.position.set(0,0,-12);tank.rotation.y=Math.PI;
const tankRef={current:tank},us=createUSInfantryCombatants(),up={current:new Map()},vp={current:new Map()},uRef={current:us};
const obstacles=blocks.map(createVillageObstacle);
try{
  await render(React.createElement(React.Fragment,null,React.createElement(CameraRig,{tankRef}),
    React.createElement(USInfantrySquad,{enemies,friendlies:us,enemyPosesRef:vp,friendlyPosesRef:up,obstacles}),
    React.createElement(VietCongCombatants,{enemies,friendliesRef:uRef,friendlyPosesRef:up,enemyPosesRef:vp,tankRef,obstacles})));
  for(let i=1;i<=60*30;i++){
    const f={...state,clock:{elapsedTime:i/30}};
    for(const [r] of [...subs].sort((a,b)=>a[1]-b[1]))r.current(f,1/30);
    for(const d of diagnostics)for(const {position:p} of vp.current.values()){
      const [a,b]=edges(p.x,p.z,d.mark,.35);d.patrolDist=Math.min(d.patrolDist,Math.hypot(Math.max(0,a),Math.max(0,b)));
    }
  }
  assert.equal(vp.current.size,enemies.length);
  camera.updateMatrixWorld();const ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0);
  for(const d of diagnostics){
    const v=new T.Vector3(...d.route.landmark).project(camera);
    assert(Math.abs(v.x)<.9&&Math.abs(v.y)<.85&&Math.abs(v.z)<1);
    const pixel=[Math.round((v.x+1)*960),Math.round((1-v.y)*540)];
    ray.setFromCamera(new T.Vector2(pixel[0]/960-1,1-pixel[1]/540),camera);
    const p=ray.ray.intersectPlane(plane,new T.Vector3());assert(p);
    const hit=blocks.filter(b=>isPointInsideNapalmStrike(b.position[0],b.position[2],cluster(p.x,p.z)));
    assert.deepEqual(hit.map(b=>b.name).sort(),[...d.route.names].sort(),'Whole-pixel physical input changes intended files');
    console.log(d.name,JSON.stringify({pixel,files:d.route.files,MiB:d.route.mib,sparks:d.route.sparks,fileEdge:+d.margin.toFixed(2),
      homeDistance:+d.homeDist.toFixed(2),sampledHostileDistance:+d.patrolDist.toFixed(2)}));
    assert(d.patrolDist>.3,'A transient hostile crosses the padded strip in the uninterrupted one-minute fixture');
  }
}finally{await render(null);delete globalThis.document;}
