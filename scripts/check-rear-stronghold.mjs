// Exercise the real projectile component with deterministic animation frames;
// the signal outpost is never represented by a file path or an infantry ID.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {act, context, extend, reconciler} from '@react-three/fiber';
import * as THREE from 'three';
import {build} from 'vite';

async function load(path) {
  const result = await build({configFile:false, logLevel:'silent', publicDir:false,
    esbuild:{jsx:'automatic'}, build:{ssr:fileURLToPath(new URL(path,import.meta.url)), write:false}});
  const source = result.output.find(c=>c.type==='chunk' && c.isEntry).code
    .replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const [
  S, {ProjectileManager}, {RearFieldEncounter}, {intersectsTerrainMound,terrainReliefHeight},
  {createRiverStations,isInsideRiverCorridor,createRiverCrossings}, {isInsideArena}, {createVillageObstacle,villageBlocksWalk},
  {crossedRearBridge,createRearGuardMap,advanceRearPursuit,newRearPursuit},
] = await Promise.all([
  '../src/lib/rearStronghold.ts','../src/components/Scene/ProjectileManager.tsx','../src/components/Scene/RearFieldEncounter.tsx',
  '../src/lib/terrain.ts','../src/components/Scene/riverLayout.ts','../src/lib/arenaBounds.ts',
  '../src/lib/villageCover.ts','../src/lib/rearGuardPursuit.ts',
].map(load));
const [gx,,gz] = S.REAR_GUARD, [hx,,hz] = S.REAR_HUT, [rx,,rz] = S.REAR_RADIO;
const v = (...args)=>new THREE.Vector3(...args);
const river=createRiverStations(1968);
for(const seed of [0,1968,983270]){
  const br=createRiverCrossings(createRiverStations(seed)).find(c=>c.kind==='bridge'),exit=br.z+br.length/2;
  assert.ok(!crossedRearBridge(br,0,br.z,0,exit-.001),'Still on the deck');
  assert.ok(crossedRearBridge(br,0,exit-.2,0,exit),'Exactly at the far abutment');
  assert.ok(crossedRearBridge(br,-br.width*.55,exit-.5,-br.width*.37,exit+.5),'Angled crossing caught between frames');
  assert.ok(!crossedRearBridge(br,br.width,exit-.5,br.width,exit+.5),'Parallel off-road route is not the bridge');
  assert.ok(!crossedRearBridge(br,0,exit+.5,0,exit-.5),'No alert on reverse crossing');
}
for(const [x,,z] of [S.REAR_HUT,S.REAR_GUARD,S.REAR_RADIO]) {
  assert.ok(isInsideArena(x,z,6) && Math.hypot(x,z+12)>58);
  assert.ok(!intersectsTerrainMound(x,z,3.6) && terrainReliefHeight(x,z)<.01);
  for(const seed of [0,1968,983270]) assert.ok(!isInsideRiverCorridor(x,z,createRiverStations(seed),3.6));
}
// A radius covering the whole player tracks at ANY yaw. Prove a continuous
// route from the actual start through the village bridge to a usable radio
// position even with the station and disabled guard still physically solid.
const pad = .82+.66;
function canDrive(x,z) {
  return isInsideArena(x,z,3.2) && !intersectsTerrainMound(x,z,pad) && !S.rearStrongholdBlocksDrive(x,z,pad);
}
function reaches(start, target) {
  const queue=[start], seen=new Set([start.join(':')]);
  for(let n=0;n<queue.length;n++) {
    const [x,z]=queue[n];
    if(x===target[0] && z===target[1])return true;
    for(const [dx,dz] of [[0,1],[1,0],[-1,0],[0,-1]]) {
      const a=x+dx,b=z+dz,key=a+':'+b;
      if(seen.has(key))continue;seen.add(key);
      if(canDrive(x+dx/2,z+dz/2)&&canDrive(a,b))queue.push([a,b]);
    }
  }
  return false;
}
assert.ok(reaches([0,-12],[0,16]) && reaches([0,16],[rx,rz]),'Spawn -> bridge -> radio');
assert.equal(S.rearStrongholdBlocksDrive(gx,gz,pad),true);
assert.equal(S.rearStrongholdBlocksDrive(hx,hz,pad),true);
assert.equal(S.canUseRearRadio(1,0,rx,rz),false);
assert.equal(S.canUseRearRadio(0,1,rx,rz),false);
assert.equal(S.canUseRearRadio(0,0,0,-12),false);
assert.equal(S.canUseRearRadio(0,0,hx,hz),false);
assert.equal(S.canUseRearRadio(0,0,hx,hz+2,true),true,'the mast can be reached across its collapsed foundation');
assert.equal(S.canUseRearRadio(1,0,hx,hz+2,true),false);
assert.equal(S.canUseRearRadio(0,0,rx,rz),true);
assert.equal(S.damageRearGuard(S.damageRearGuard(S.damageRearGuard(120,'cannon'),'cannon'),'cannon'),0);
assert.equal(S.damageRearGuard(S.damageRearGuard(120,'napalm'),'cannon'),0);
assert.equal(S.damageRearGuard(4,'machinegun'),0);
assert.equal(S.damageRearGuard(0,'cannon'),0);

assert.equal(S.rearGuardHasSight(gx,gz-15,[]),true);
assert.equal(S.rearGuardHasSight(0,-12,[]),false);
assert.equal(S.rearGuardHasSight(hx,hz+4,[]),false,'Hut should provide cover');
const screen=createVillageObstacle({path:'sim://cover',position:[gx,.5,gz-4],scale:2});
assert.equal(S.rearGuardHasSight(gx,gz-8,[screen]),false,'Existing local cover blocks retaliation');
const landingWall=createRearGuardMap(river,[],false,{cx:gx,z:gz-5,yaw:.75}).landingContact;
assert.equal(S.rearGuardHasSight(gx,gz-12,[],undefined,false,landingWall),false,'The standing stilt shelter screens the player');
assert.ok(S.rearPulseHasCover(v(gx,1.44,gz),v(gx,.7,gz-12),[],false,landingWall),'A pulse cannot continue through that shelter either');
for(const rate of [30,60,120]) {
  // Force a genuine detour around a standing village hut; moving the target
  // loses the old firing lane, without a second crossing to reacquire it.
  const walker=S.newRearGuardPose(),chase=newRearPursuit(),block=createVillageObstacle({path:'sim://screen',position:[gx+9,.5,gz],scale:3});
  const map=createRearGuardMap(river,[block],false),player={x:gx+21,z:gz};
  for(let i=0;i<rate*14;i++){
    const x=walker.x,z=walker.z,visible=S.rearGuardHasSight(player.x,player.z,[block],walker);
    advanceRearPursuit(walker,chase,1/rate,player,0,visible,map);
    assert.ok(!intersectsTerrainMound(walker.x,walker.z,2.02)&&!isInsideRiverCorridor(walker.x,walker.z,river,2.02));
    assert.ok(!villageBlocksWalk(x,z,walker.x,walker.z,[block],2.02),'Hull clears every wall and porch on each step');
  }
  assert.ok(Math.hypot(walker.x-player.x,walker.z-player.z)<14 && S.rearGuardHasSight(player.x,player.z,[block],walker),
    'Routed out from behind a screening hut into actual sight and range: '+JSON.stringify({walker,route:chase.route.map(p=>[p.x,p.z]),player}));
  player.x=1;player.z=32;
  const before=Math.hypot(walker.x-player.x,walker.z-player.z);
  for(let i=0;i<rate*7;i++)advanceRearPursuit(walker,chase,1/rate,player,0,S.rearGuardHasSight(player.x,player.z,[block],walker),map);
  assert.ok(before-Math.hypot(walker.x-player.x,walker.z-player.z)>4,'Pursuit retargets after the player changes lanes');
  const patrol=S.newRearGuardPose(),seen=new Set(),rivers=[0,1968,983270].map(createRiverStations);
  for(let j=0;j<rate*40;j++){
    const lastX=patrol.x,lastZ=patrol.z;
    S.advanceRearPatrol(patrol,1/rate,false,0,-12,0,[]);
    seen.add(patrol.waypoint);
    assert.ok(Math.hypot(lastX-patrol.x,lastZ-patrol.z)<2.0/rate);
    assert.ok(!intersectsTerrainMound(patrol.x,patrol.z,2.03));
    assert.ok(rivers.every(r=>!isInsideRiverCorridor(patrol.x,patrol.z,r,2.03)));
    assert.ok(!S.rearStrongholdBlocksDrive(rx,rz,pad,patrol),'The patrol cannot leave a wreck across the radio');
  }
  assert.equal(seen.size,6);assert.ok(patrol.travel>40,'Actually navigated a circuit');
  const stopping=S.newRearGuardPose(),screen=createVillageObstacle({path:'screen',position:[gx+.8,0,gz-4.5],scale:1.3});
  for(let j=0;j<rate*12;j++){
    S.advanceRearPatrol(stopping,1/rate,true,gx-4.4,gz,0,[screen]);
    assert.ok(!S.rearStrongholdBlocksDrive(gx-4.4,gz,.82,stopping) && !S.rearStrongholdBlocksDrive(gx-4.4,gz-.66,.82,stopping) &&
      !S.rearStrongholdBlocksDrive(gx-4.4,gz+.66,.82,stopping),'No overlap with any player track disc');
    assert.ok(Math.hypot(stopping.x-screen.position[0],stopping.z-screen.position[2])>2,'No hull inside village screen');
  }
  for(const fate of ['hit','dodge','cover','destroy']) {
    const s=S.newRearGuardCycle(), events=[];
    assert.equal(S.stepRearGuard(s,1/rate,true,gx,gz-12,false),null);
    assert.equal(S.stepRearGuard(s,1/rate,true,0,-12,true),null);
    assert.equal(S.stepRearGuard(s,1/rate,true,gx,gz-12,true),'warn');
    for(let frame=0;frame<3*rate;frame++) {
      const before=s.phase;
      const event=S.stepRearGuard(s,1/rate,fate!=='destroy'||frame<rate,gx+(fate==='dodge'?4:0),gz-12,
        !(fate==='cover' && frame>=rate));
      if(event)events.push(event);
      if(event==='fire')assert.ok(frame/rate >= S.REAR_GUARD_WARN_SECONDS-.04 && before==='warning');
      assert.equal(s.aimX,gx,'Warning tracks the marked spot, not the dodging player');
    }
    assert.deepEqual(events,fate==='destroy'?[]:['fire',fate==='hit'?'hit':'miss']);
  }
}

globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(THREE);
function frameHarness(){
  const callbacks=new Set(), scene=new THREE.Scene();
  const state={scene,camera:new THREE.PerspectiveCamera(),invalidate(){},internal:{active:false,frames:0,
    interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),subscribe(ref){callbacks.add(ref);return ()=>callbacks.delete(ref);}}};
  const store=Object.assign((f=q=>q)=>f(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
  scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
  const fail=e=>{throw e;},root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
  const mount=async node=>act(async()=>reconciler.updateContainer(React.createElement(context.Provider,{value:store},node),root,null,null));
  return {mount,scene,step:dt=>{for(const ref of callbacks)ref.current(state,dt);}};
}
async function shot({rate=60, kind='cannon', alive=true, x=gx,z=gz-17, y=.82, dir=1, stopAt=null, actorZ=null,
  pose=S.newRearGuardPose(),hutDestroyed=false,sceneryZ=null}) {
  const {mount,step}=frameHarness(),projectile={position:v(x,y,z),direction:v(0,0,dir),active:true,lifetime:0,kind,triggerId:1};
  const expected=[], despawns=[];
  try {
    await mount(React.createElement(ProjectileManager,{pool:{current:[projectile]},despawn:i=>{despawns.push(i);projectile.active=false;},
      onRearGuardHit:p=>{assert.equal(p.active,false,'Guard callback must see retired round');expected.push('guard');},
      onRearHutHit:p=>{assert.equal(p.active,false);expected.push('hut');},rearHutDestroyed:hutDestroyed,
      sceneryContact:(a,b)=>sceneryZ===null||sceneryZ<Math.min(a.z,b.z)||sceneryZ>Math.max(a.z,b.z)?null:(sceneryZ-a.z)/(b.z-a.z),
      onSceneryHit:p=>{assert.equal(p.active,false);expected.push('scenery');},rearGuardPoseRef:{current:pose},
      rearGuardAlive:alive===null?undefined:alive, onHit:()=>expected.push('file'),onEnemyHit:()=>expected.push('infantry'),
      enemies:actorZ===null?[]:[{id:'vc',position:[gx,.02,actorZ],alive:true,stance:'standing'}],
      allBlocks:stopAt===null?[]:[{position:[x,y,stopAt],path:'sim://file'}]}));
    for(let i=0;i<rate*3.1;i++)step(1/rate);
    assert.deepEqual(despawns,[0]);
    return {events:expected,contact:projectile.position.clone()};
  } finally {await mount(null);}
}
for(const rate of [30,60,120]) {
  const cannon=await shot({rate});
  assert.deepEqual(cannon.events,['guard']);
  assert.ok(Math.abs(cannon.contact.z-(gz-1.69))<1e-6 && cannon.contact.y>.03,'Actual sagging cannon hits the visible hull');
  assert.deepEqual((await shot({rate,kind:'machinegun',y:1.25})).events,['guard'],'MG hits upper vehicle');
}
assert.deepEqual((await shot({stopAt:gz-4})).events,['file']);
assert.deepEqual((await shot({actorZ:gz-4})).events,['infantry']);
assert.deepEqual((await shot({stopAt:gz+4})).events,['guard']);
assert.deepEqual((await shot({alive:false,stopAt:gz+4})).events,[],'Wreck absorbs before file');
assert.deepEqual((await shot({z:hz+7,dir:-1})).events,['hut'],'Hut absorbs before guard');
assert.deepEqual((await shot({z:hz+7,dir:-1,hutDestroyed:true})).events,['guard'],'No intact wall in open rubble');
assert.equal(S.firstRearContact(v(hx,.2,hz+2),v(hx,.2,hz-2),undefined,true).kind,'hut','The low plinth remains');
assert.ok(S.rearGuardHasSight(hx,hz+4,[],undefined,true),'Opened rubble no longer screens the player');
assert.deepEqual((await shot({y:.05})).events,[],'Ground absorbs before guard');
assert.deepEqual((await shot({alive:null,stopAt:gz+4})).events,['file'],'No invisible guardian outside campaign');
const moved={...S.newRearGuardPose(),x:gx-5,yaw:Math.PI/2};
assert.deepEqual((await shot({pose:moved,stopAt:gz+4})).events,['file'],'A spawn is not a ghost hitbox');
const turned=await shot({pose:moved,x:moved.x});
assert.deepEqual(turned.events,['guard']);assert.ok(Math.abs(turned.contact.z-(gz-1.11))<1e-5,'Tracks turn with the hull');
assert.deepEqual((await shot({pose:moved,x:moved.x,alive:false,stopAt:gz+4})).events,[],'The actual displaced wreck still absorbs fire');
assert.ok(!S.rearStrongholdBlocksDrive(gx,gz,.1,moved)&&S.rearStrongholdBlocksDrive(moved.x,moved.z,.1,moved));
assert.ok(S.rearStrongholdBlocksDrive(moved.x+1.65,moved.z,.1,moved)&&!S.rearStrongholdBlocksDrive(moved.x,moved.z+1.65,.1,moved),'Rotated tread collision, not a circular guard');
assert.deepEqual((await shot({sceneryZ:gz-6})).events,['scenery']);
assert.deepEqual((await shot({sceneryZ:gz+6})).events,['guard']);
assert.deepEqual((await shot({sceneryZ:gz-6,stopAt:gz-10})).events,['file']);
assert.deepEqual((await shot({sceneryZ:gz-6,actorZ:gz-10})).events,['infantry']);

// Real R3F mesh/socket readbacks (only the browser texture decode is stubbed).
const originalLoader=THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load=function(_url,ok){const t=new THREE.Texture();queueMicrotask(()=>ok(t));return t;};
try{
  const {mount,scene,step}=frameHarness(),pose=S.newRearGuardPose(),tank=new THREE.Group();
  const tankRef={current:tank},rearGuardPoseRef={current:pose};tank.position.set(0,0,-12);
  let hits=0,spotted=0;
  const props={hp:120,ready:false,running:true,tankRef,rearGuardPoseRef,obstacles:[],navigationRiver:river,
    onSpotted:()=>spotted++,onTankHit:()=>hits++};
  const render=async(p={})=>mount(React.createElement(RearFieldEncounter,{...props,...p}));
  await render();
  const body=scene.getObjectByName('rear-field-armored-guard'),turret=scene.getObjectByName('rear-guard-turret');
  assert.ok(body&&turret);const history=[];
  const frame=()=>{step(1/60);scene.updateMatrixWorld();assert.equal(body.position.x,pose.x);assert.equal(body.rotation.y,pose.yaw);};
  for(let i=0;i<180;i++)frame();
  assert.ok(Math.hypot(body.position.x-gx,body.position.z-gz)>3,'Rendered guard visibly changed world position');
  tank.position.set(pose.x+4,0,pose.z-9);
  for(let i=0;i<160;i++){
    frame();const pulse=scene.getObjectByName('rear-guard-signal-pulse'),muzzle=scene.getObjectByName('rear-field-muzzle-flash');
    if(pulse.visible)history.push(pulse.position.clone());
    if(muzzle.visible && history.length===1)assert.ok(muzzle.getWorldPosition(v()).distanceTo(history[0])<.45,'Pulse leaves the moving barrel');
  }
  assert.equal(spotted,1);assert.equal(hits,1);assert.ok(history.length>20&&history[0].distanceTo(history.at(-1))>4);
  const saved=body.position.clone(),yaw=body.rotation.y,savedTurret=turret.rotation.y;
  // The receiver remains an authored physical object, but production no
  // longer asks this component for range or enables a radio button. Moving
  // to the old switch must not light its ready indicator even with its
  // walls and guard gone. GameSession's demolition trigger is exercised in
  // check-field-session, including F here with precisely one file standing.
  await render({hp:0,ready:false,hutDestroyed:true});tank.position.set(rx,0,rz);
  for(let i=0;i<200;i++)frame();
  assert.equal(scene.getObjectByName('rear-field-radio-lamp').material.color.getHexString(),'916c4b',
    'Proximity to the old receiver cannot set the guarded/amber ready lamp');
  assert.equal(hits,1);assert.deepEqual(body.position.toArray(),saved.toArray());
  assert.equal(body.rotation.y,yaw);assert.equal(turret.rotation.y,savedTurret);
  for(const name of ['rear-radio-intact-walls','rear-field-hinged-door','rear-guard-signal-pulse'])assert.equal(scene.getObjectByName(name).visible,false);
  for(const name of ['rear-radio-collapsed-walls','rear-field-radio-lamp'])assert.equal(scene.getObjectByName(name).visible,true);
  assert.ok(scene.getObjectByName('rear-radio-collapsed-walls').geometry.boundingBox.max.y<=.33,'No invisible full-height rubble');
  await mount(null);
}finally{THREE.TextureLoader.prototype.load=originalLoader;}
console.log('PASS rear field: seeded deck exit; six-waypoint patrol and obstacle-aware pursuit at 30/60/120 Hz; physical player/hut/terrain clearance; live R3F movement, barrel pulse, freeze, displaced hit and wreck, breakable walls, reachable receiver and ordered scenery hits.');
