// Active game clocks, real river/hut clearance and mounted, animated actors.
import assert from 'node:assert/strict';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
import React from 'react';
import * as THREE from 'three';
import {act,context,extend,reconciler} from '@react-three/fiber';
const dir=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const entry=dir+'/virtual-campaign-tunnels.mjs';
const files=['lib/fieldRelief','lib/campaignTunnels','lib/combat','lib/villageCover','components/Scene/riverLayout','components/Scene/VietCongCombatants'];
const bundle=await build({root:dir,configFile:false,logLevel:'silent',publicDir:false,
  plugins:[{name:'field-assault',resolveId:id=>id===entry?id:null,load:id=>id===entry?
    files.map(f=>'export * from "./src/'+f+'"').join(';'):null}],esbuild:{jsx:'automatic'},build:{ssr:entry,write:false}});
const source=bundle.output.find(c=>c.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {US_FIGHTING_POSITIONS,chooseReliefLanding,newTunnelClock,chooseTunnelSite,stepTunnels,tunnelFighters,tunnelDebt,safeVillageLeg,createVillageObstacle,
  createVietCongCombatants,createRiverStations,VietCongCombatants}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const spawn={x:0,z:-12,yaw:Math.PI};
let checked=0;
for(const seed of [1968,9032,549,208044973])for(const player of [spawn,{x:2,z:25,yaw:0},{x:-32,z:45,yaw:1.8}]){
  const river=createRiverStations(seed),obstacles=[];
  const orig=chooseTunnelSite(player,[],river,[],null,0);assert(orig);
  obstacles.push(createVillageObstacle({path:'fictional-blocked-exit.txt',position:[orig.x,.30,orig.z],scale:4}));
  let last=null;
  for(let batch=0;batch<2;batch++){
    const s=chooseTunnelSite(player,obstacles,river,[],last,batch);
    assert(s&&s.slots.length===6&&safeVillageLeg(s.x,s.z,s.x,s.z,obstacles,river));
    if(!last&&player===spawn)assert(s.z>player.z);
    for(const p of s.slots){
      assert(safeVillageLeg(s.x,s.z,p.x,p.z,obstacles,river));
      assert(Math.hypot(p.x-player.x,p.z-player.z)>8);
    }
    checked+=s.slots.length;last=s;
  }
}
const river=createRiverStations(1968),site=chooseTunnelSite(spawn,[],river,[],null,0);
const c=newTunnelClock(true),pick=()=>site;
function ticks(n,living,valid=()=>true,picker=pick){const events=[];for(let i=0;i<n;i++){
  const e=stepTunnels(c,1/60,living,picker,valid);if(e)events.push(e.kind);
}return events;}
assert.equal(tunnelDebt(newTunnelClock(false)),0,'Training and horde have no reserve');
assert.deepEqual(ticks(1200,12),[],'Ceiling is 16 simultaneously live');
assert.deepEqual(ticks(1,10),['warning']);
assert.deepEqual(ticks(245,10,()=>false),['warning'],'A tank on top of the opening forces a complete new warning');
assert.deepEqual(ticks(230,10),[]);assert.deepEqual(ticks(14,10),['emerge']);
assert.equal(tunnelDebt(c),6);assert.deepEqual(ticks(400,0,()=>true,()=>null),['sealed']);
assert.equal(tunnelDebt(c),0,'No room left in a fully blocked map cannot softlock the radio');
assert.deepEqual(ticks(3000,0),[],'The encounter cannot respawn indefinitely');

// Main-map reserves keep responding at zero or one live soldier, including after the
// opening encounter. Standing at exactly two must never dispatch a replacement batch.
const repeat=newTunnelClock(true,true);
for(let batch=1;batch<=4;batch++){
  for(let n=0;n<300;n++)assert.equal(stepTunnels(repeat,.1,2,pick,()=>true),null);
  let arrivals=0;
  for(let n=0;n<60;n++){
    const e=stepTunnels(repeat,.1,arrivals?7:1,pick,()=>true);
    if(e?.kind==='emerge'){assert.equal(e.batch,batch);arrivals++;}
  }
  assert.equal(arrivals,1);
}
let previous=null;
for(let batch=1;batch<=8;batch++){
  const zone=chooseReliefLanding(batch,previous,spawn,[],river,()=>.02,()=>.31);
  assert.ok(zone);assert.equal(new Set(zone.tickets.map(t=>t.id)).size,3);
  if(previous)assert.ok(Math.hypot(previous.x-zone.x,previous.z-zone.z)>=12);
  assert(zone.z<=-22&&Math.abs(zone.x)>=7&&Math.abs(zone.x)<=10);
  assert(zone.tickets.every(t=>t.step[2]>t.door[2]&&t.post[2]-t.step[2]>9));
  const cover=US_FIGHTING_POSITIONS.find(p=>p.id===zone.tickets[0].coverId);
  assert(cover && Math.sign(cover.position[0])===Math.sign(zone.x));
  for(const {post} of zone.tickets){
    assert(post[2]>spawn.z && post[2]<cover.position[2]);
    assert(Math.hypot(post[0]-cover.position[0],post[2]-cover.position[2])<2);
  }
  const [x,,z]=zone.tickets[0].post;
  const staffed=chooseReliefLanding(batch,previous,spawn,[],river,()=>.02,()=>.31,[{x,z}]);
  assert.equal(staffed.x,zone.x);
  assert(staffed.tickets.every(({post})=>Math.hypot(post[0]-x,post[2]-z)>=.8));
  if(previous)assert(Math.sign(previous.x)!==Math.sign(zone.x));
  previous=zone;
}
// Measure physical, independently ticked world poses rather than accepting
// a route recommendation or stable spawn coordinate as proof of movement.
globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(THREE);
const scene=new THREE.Scene(),subs=new Set(),state={scene,camera:new THREE.PerspectiveCamera(),invalidate(){},
  internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
    subscribe(r){subs.add(r);return ()=>subs.delete(r);}}};
const store=Object.assign((select=v=>v)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;},root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const mount=n=>act(async()=>reconciler.updateContainer(React.createElement(context.Provider,{value:store},n),root,null,null));
const ref=current=>({current}),tank=new THREE.Group();tank.position.set(spawn.x,0,spawn.z);
const enemies=tunnelFighters(1968,1,site),poses=ref(new Map()),initial=enemies.map(e=>new THREE.Vector3(...e.position));
await mount(React.createElement(VietCongCombatants,{enemies,enemyPosesRef:poses,friendliesRef:ref([]),friendlyPosesRef:ref(new Map()),
  tankRef:ref(tank),obstacles:[],navigationRiver:river,fieldAdvance:true}));
const progress=enemies.map(()=>0),prev=enemies.map(()=>new THREE.Vector3(site.x,0,site.z));let simultaneous=0;
for(let i=0;i<600;i++){
  const t=(i+1)/30;for(const s of subs)s.current({...state,clock:{elapsedTime:t}},1/30);
  let moving=0;
  enemies.forEach((e,j)=>{
    const p=poses.current.get(e.id).position;
    const v=scene.getObjectByName(j===0?'enemy-infantry-review':e.id).getWorldPosition(new THREE.Vector3());
    assert(v.distanceTo(p)<1e-6);const stride=Math.hypot(p.x-prev[j].x,p.z-prev[j].z);assert(stride<.105);
    if(i===0)assert(p.y<-.70,'New arrivals rise visibly through the hatch');
    if(i>=24)assert(Math.abs(p.y-.02)<1e-6);
    if(stride>.01)moving++;
    assert(p.z>=1.39&&safeVillageLeg(prev[j].x,prev[j].z,p.x,p.z,[],river));
    progress[j]=Math.max(progress[j],initial[j].distanceTo(tank.position)-p.distanceTo(tank.position));
    prev[j].copy(p);
  });simultaneous=Math.max(simultaneous,moving);
}
assert(progress.filter(p=>p>=3).length>=4,'At least four tunnel arrivals should actually close 3 units: '+progress);
assert(simultaneous>=3,'Independent assault clocks should overlap');
await mount(null);
const opening=createVietCongCombatants(1968,12),openingPoses=ref(new Map());
await mount(React.createElement(VietCongCombatants,{enemies:opening,enemyPosesRef:openingPoses,friendliesRef:ref([]),friendlyPosesRef:ref(new Map()),
  tankRef:ref(tank),obstacles:[],navigationRiver:river,fieldAdvance:true}));
const gains=opening.map(()=>0);
for(let i=0;i<720;i++){
  const t=(i+1)/30;for(const s of subs)s.current({...state,clock:{elapsedTime:t}},1/30);
  for(let j=0;j<opening.length;j++){
    const start=opening[j].position,p=openingPoses.current.get(opening[j].id).position;
    gains[j]=Math.max(gains[j],Math.hypot(start[0]-spawn.x,start[2]-spawn.z)-Math.hypot(p.x-spawn.x,p.z-spawn.z));
  }
}
const pressed=gains.filter((g,j)=>j%3!==1&&g>=2.8).length;
assert(pressed>=4,'Opening field should also press forward: '+gains);
await mount(null);
console.log('PASS campaign assault: '+checked+' outdoor slots, warning and re-warning, active cap, terminal debt; '+pressed+' opening attackers close and mounted reinforcements gain '+progress.map(p=>p.toFixed(1)).join('/')+'; '+simultaneous+' moving together.');
