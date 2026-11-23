// Mounted production combat hook, actual Three skeleton and true rifle socket.
// No renderer, clocks/delays, browser or file bridge involved.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import * as T from 'three';
import {act,context,extend,reconciler} from '@react-three/fiber';
import {build} from 'vite';
const dir=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),entry=dir+'/virtual-defender-flinch.mjs';
const bundle=await build({root:dir,configFile:false,publicDir:false,logLevel:'silent',plugins:[{name:'contact-check',
  resolveId(id){if(id===entry)return id;},load(id){if(id===entry)return ['components/Scene/USInfantrySquad','hooks/useEnemyCombat',
  'lib/villageCover','lib/embassyDefense'].map(m=>'export * from '+JSON.stringify(dir+'/src/'+m)+';').join('\n');}}],
  esbuild:{jsx:'automatic'},build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
const source=bundle.output.find(o=>o.type==='chunk'&&o.isEntry).code.replace(/from "([^"]+)"/g,(_,s)=>'from '+JSON.stringify(import.meta.resolve(s)));
const {USInfantrySquad,useEnemyCombat,createVillageObstacle,EMBASSY_DEFENSE_OFFSET_Z}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(T);
const scene=new T.Scene(),subs=new Map(),state={scene,camera:new T.PerspectiveCamera(),invalidate(){},
  internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
    subscribe(ref,p){subs.set(ref,p);return()=>subs.delete(ref);}}};
const store=Object.assign((select=v=>v)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;},root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const el=React.createElement,render=e=>act(async()=>reconciler.updateContainer(el(context.Provider,{value:store},e),root,null,null));
const id='us-rifle-1',other='us-rifle-2',poses={current:new Map()},walk=v=>v.getWorldPosition(new T.Vector3());
let combat,now=0,calls=0,hits=0,obstacles=[],mounted=1,shooting=false,defenseOffsetZ=0;
const soldier=()=>scene.getObjectByName(id),bone=name=>soldier().getObjectByName('us-field-infantry-volume').skeleton.bones.find(b=>b.name===name);
const enemyPositions=[-5.65,.02,7],hitPoint=new T.Vector3();
function Harness(){
  combat=useEnemyCombat({sessionKey:179});
  return el(USInfantrySquad,{key:mounted,enabled:shooting,defenseOffsetZ,friendlies:combat.friendlies,friendlyPosesRef:combat.friendlyPosesRef,
    enemies:[{...combat.enemies[0],position:enemyPositions,stance:'kneeling'}],zombiePosesRef:poses,obstacles,
    onFriendlyFire:e=>{if(e.soldierId===id){calls++;let flash;
      soldier().traverse(v=>{if(v.renderOrder===87)flash=v;});assert.ok(flash.getWorldPosition(hitPoint).distanceTo(e.position)<1e-8);}},
    onEnemyHit:e=>{if(e.soldierId===id)hits++;}});
}
function step(n,dt=1/60){for(let i=0;i<n;i++){now+=dt;
  for(const [sub] of subs)sub.current({...state,clock:{elapsedTime:now}},dt);scene.updateMatrixWorld(true);}}
const hit=amount=>act(async()=>{combat.damageFriendly(id,amount);});
try{
  await render(el(Harness));step(24);
  const loc=walk(soldier()),head=()=>walk(bone('field-infantry-head-review')),foot=()=>walk(bone('left-foot'));
  const ankle=foot(),initialHead=head();
  const pose=(x,z,to,phase)=>({position:new T.Vector3(loc.x+x,loc.y,loc.z+z),active:true,archetype:'standard',pursuingSoldier:to,soldierSwing:phase});
  poses.current.set('wrong-defender',pose(.19,0,other,'strike'));
  poses.current.set('uncommitted',pose(-.31,0,id,'windup'));
  poses.current.set('actual-raker',pose(1.0,0,id,'strike'));
  step(8);assert.equal(soldier().userData.defenderHit,undefined,'swing or spawn without health loss cannot flinch');
  await hit(40);step(1);
  const contact=soldier().userData.defenderHit;
  assert.deepEqual([contact.fromHealth,contact.toHealth,contact.attackerId,contact.sequence],[100,60,'actual-raker',1]);
  assert.ok(contact.weight>0,'visible on first updated gameplay frame');
  step(7);const peak=head(),retreat=initialHead.x-peak.x;
  assert.ok(retreat>.20,'actual bound head must recede >20 cm away from the true attacker; got '+retreat);
  assert.ok(foot().distanceTo(ankle)<.001,'support foot must stay planted');
  assert.ok(walk(soldier()).distanceTo(loc)<1e-8&&combat.friendlyPosesRef.current.get(id).position.distanceTo(loc)<1e-8);
  assert.equal(scene.getObjectByName(other).userData.defenderHit,undefined);
  step(45);assert.equal(contact.weight,0);assert.ok(head().distanceTo(initialHead)<.013,'real head must recover to guard');
  assert.equal(contact.sequence,1);
  mounted++;await render(el(Harness));step(5);
  assert.equal(soldier().userData.defenderHit,undefined,'first mount at wounded health establishes a baseline, not another hit');
  shooting=true;await render(el(Harness));poses.current.clear();await hit(8);step(1);
  assert.equal(soldier().userData.defenderHit.attackerId,null,'unattributed damage must not invent an attacker');
  step(235);assert.ok(calls>0&&hits>0,'same held rifle still fires and its real rounds reach the target');
  const before=calls;
  obstacles=[createVillageObstacle({path:'sim://fixture/cover',scale:1.6,position:[loc.x,.5,loc.z+3]})];
  await render(el(Harness));await hit(8);step(45);
  assert.equal(calls,before,'a flinching soldier must not shoot through hard cover');
  const lastContact=soldier().userData.defenderHit;
  await hit(999);step(1);
  assert.equal(combat.friendlies.find(f=>f.id===id).alive,false);
  assert.equal(soldier().userData.defenderHit,lastContact,'fatal damage cannot start a fresh flinch');
  step(140);assert.ok(soldier().visible,'the fallen defender holds the landed pose');
  step(135);assert.equal(soldier().visible,false);
  assert.equal(calls,before,'a fallen soldier cannot fire');

  defenseOffsetZ=EMBASSY_DEFENSE_OFFSET_Z;mounted++;shooting=false;
  await act(async()=>{combat.resetFriendlies(defenseOffsetZ);});
  await render(el(Harness));step(1);
  const uprightHead=head();
  await hit(999);step(1);step(75);
  assert.ok(soldier().visible && uprightHead.distanceTo(head())>.6 && Math.abs(soldier().rotation.z)>1,
    'the defender tips onto a shoulder and the helmet clears the firing stance');
  const landed=head();step(156);
  assert.ok(soldier().visible && head().distanceTo(landed)<1e-6,'the landed pose holds still');
  step(60);assert.equal(soldier().visible,false);
  assert.equal(combat.damageFriendly(id,1),null,'the held pose cannot take more damage');
  console.log(JSON.stringify({health:[100,60],attacker:contact.attackerId,peakHeadRetreatWorld:+retreat.toFixed(3),
    plantedFoot:true,rootAndHitPoseUnmoved:true,settled:contact.weight===0,noSpawnReaction:true,realShots:calls,realHits:hits,blockedCoverShots:calls-before}));
}finally{await render(null);assert.equal(subs.size,0);}
