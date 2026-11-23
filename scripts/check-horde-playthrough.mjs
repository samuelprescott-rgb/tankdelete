// Mounted gameplay-component route, not GPU, real-time human input, or a Tauri/filesystem test.
// Run from the checkout: node scripts/check-horde-playthrough.mjs
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import React from 'react';
import * as THREE from 'three';
import {act,context,extend,reconciler,useLoader} from '@react-three/fiber';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {build} from 'vite';

const dir=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const receipt={route:'CPU-mounted real Horde, guards, reinforcements and moving projectiles. Final-wave driver leads targets and fits one normal intermission hull plate; no random pickups. Simulation time, not a GPU frame benchmark.',gait:[],swing:[]};
const names={
  'lib/campaignFixtures':['CAMPAIGN_FINALE'],'lib/tauri-commands':['createSimulatedCommands'],
  'lib/mission':['createFileObjective'],'lib/combat':['hashCombatSession','createUSInfantryCombatants'],
  'lib/training':['TRAINING_DIRECTORY','createTrainingEntries'],
  'components/Scene/Tank':['Tank'],'components/Scene/CameraRig':['CameraRig'],
  'components/Scene/EmbassyDefense':['createEmbassyBuildingGeometry'],
  'components/Scene/embassyGroundworks':['createEmbassyGroundworks'],'components/Scene/embassyColors':['createEmbassyColors'],
  'lib/ghostSignal':['GHOST_EMBASSY_START','GHOST_EMBASSY_YAW'],
  'components/Scene/EmbassyLift':['EmbassyLift'],'lib/embassyLift':['LIFT_TEAM','LIFT_DOOR','LIFT_PAD'],
  'components/Scene/ZombieHorde':['ZombieHorde'], 'components/Scene/USInfantrySquad':['USInfantrySquad'],
  'components/Scene/FinalBossAllies':['FinalBossAllies'], 'components/Scene/ProjectileManager':['ProjectileManager'],
  'hooks/useEnemyCombat':['useEnemyCombat'],'hooks/useFinalBossAllies':['useFinalBossAllies'],
  'hooks/useProjectilePool':['useProjectilePool'],'hooks/useZombieEpilogue':['useZombieEpilogue'],
  'lib/embassyDefense':['embassyCombatObstacles','EMBASSY_DEFENSE_OFFSET_Z','EMBASSY_GUARD_POSITION','EMBASSY_GUARD_YAW','selectEmbassyTarget','createEmbassyArchives','attackEmbassyArchive'],
  'lib/zombieEpilogue':['findNearestLivingZombieHit','createZombieWave','ZOMBIE_WAVES','ZOMBIE_MAX_ACTIVE'], 'lib/weapons':['CANNON_RELOAD_SECONDS'],
  'lib/constants':['PROJECTILE_SPEED'],
};
const entry=dir+'/virtual-horde-playthrough.mjs';
const bundle=await build({root:dir,configFile:false,publicDir:false,logLevel:'silent',
  plugins:[{name:'mounted-horde',resolveId:id=>id===entry?id:null,load:id=>id===entry?
    Object.entries(names).map(([path,n])=>'export { '+n.join(',')+' } from '+JSON.stringify(dir+'/src/'+path)).join(';'):null}],
  esbuild:{jsx:'automatic'},build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
const js=bundle.output.find(c=>c.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const game=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const el=React.createElement,ref=current=>({current}),v3=(x,y,z)=>new THREE.Vector3(x,y,z);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// CPU-only run: no image decode, WebGL, or optional authored portrait assets.
class FixtureEventTarget extends EventTarget {
  // Node's DOM shim needs an explicit options object to remove a capturing
  // listener reliably; match the browser contract for component cleanup.
  addEventListener(type,callback,options){super.addEventListener(type,callback,typeof options==='boolean'?{capture:options}:options);}
  removeEventListener(type,callback,options){super.removeEventListener(type,callback,typeof options==='boolean'?{capture:options}:options);}
}
globalThis.document=Object.assign(new FixtureEventTarget(),{hidden:false,hasFocus:()=>true,createElement(tag){assert.equal(tag,'canvas');return {getContext:()=>null};}});
THREE.TextureLoader.prototype.load=function(url,ok){
  assert.match(url,/^\/images\/textures\/(?:tank-[a-z0-9-]+\.(?:svg|png)|(?:ghost-cast-enamel-v1|field-fire-(?:jet|flame)|ally-holy-pillar)\.png)$/);
  const texture=new THREE.Texture();queueMicrotask(()=>ok(texture));return texture;
};
// The full scene has already loaded this shared atlas for napalm before wave four.
useLoader.preload(THREE.TextureLoader,'/images/textures/field-fire-flame.png');
await new Promise(resolve=>setImmediate(resolve));
GLTFLoader.prototype.load=function(url){assert.equal(url,'/models/us-infantry-head/us-male-head.gltf');};
let ms=0,seq=0;
Date.now=()=>Math.round(ms);
Object.defineProperty(performance,'now',{value:()=>ms});
const timers=new Map();
globalThis.window=Object.assign(new FixtureEventTarget(),{setTimeout(fn,delay){const id=++seq;timers.set(id,{at:ms+delay,fn});return id;},clearTimeout:id=>timers.delete(id)});
extend(THREE);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.1,340),subscribers=new Map();
const state={scene,camera,pointer:new THREE.Vector2(),size:{left:0,top:0,width:1920,height:1080},gl:{domElement:{}},invalidate(){},internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
  subscribe(r,p){subscribers.set(r,p);return ()=>subscribers.delete(r);}}};
const store=Object.assign((select=v=>v)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;},root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const render=child=>act(async()=>reconciler.updateContainer(el(context.Provider,{value:store},child),root,null,null));
let delta=.05;
async function frame(pre=()=>{}){
  ms+=delta*1000;
  await act(async()=>{
    for(const [id,t] of [...timers])if(t.at<=ms&&timers.delete(id))t.fn();
    pre();
    for(const [cb] of [...subscribers].sort((a,b)=>a[1]-b[1]))cb.current({...state,clock:{elapsedTime:ms/1000}},delta);
  });
}
const tank=ref(new THREE.Group());tank.current.position.set(0,0,-12);camera.position.set(0,5,-19);
let h,corps,allies,gun,w,serial=0,attempt=0;
const start=game.EMBASSY_GUARD_POSITION;
const empty=Object.freeze([]),pos=v3(0,0,0),dirVec=v3(0,0,0);
function Encounter({realTank=false,sessionKey='virtual-embassy-playthrough',seed=1968}) {
  h=game.useZombieEpilogue({sessionKey,seed});
  corps=game.useEnemyCombat({sessionKey:'virtual-embassy-playthrough'});gun=game.useProjectilePool();
  const boss=h.livingZombies.find(z=>z.archetype==='boss');
  allies=game.useFinalBossAllies({enabled:!!boss,encounterKey:'fixture:'+attempt+':'+h.wave,
    baseFriendliesRef:corps.friendliesRef,posesRef:corps.friendlyPosesRef});
  const obstacles=React.useMemo(()=>game.embassyCombatObstacles(h.archives),[h.archives]);
  const fighting=h.phase==='combat';
  const allyHit=e=>{if(h.damageZombie(e.zombieId,e.damage,'friendly-rifle')){
    w.allyHits++;w.shooters.add(e.soldierId);
  }};
  return el(React.Fragment,null,
    h.phase!=='defeat'&&h.phase!=='victory'&&el(game.EmbassyLift,{key:'lift'+attempt,wave:h.wave,running:true,
      deploy:corps.deployPassenger,onCall:()=>{},roster:corps.friendlies}),
    realTank&&el(game.Tank,{ref:tank,initialPosition:start,initialHeading:game.EMBASSY_GUARD_YAW,environmentSeed:seed,
      fieldSurface:(from,to)=>{
        const hit=game.findNearestLivingZombieHit(from,to,h.zombiesRef.current,h.posesRef.current);
        return hit?{kind:'actor',t:hit.t}:null;
      },onShoot:(p,d)=>{w.tankShots++;gun.spawn(p,d,'cannon',++serial);}}),
    realTank&&el(game.CameraRig,{tankRef:tank,embassy:true}),
    el(game.USInfantrySquad,{key:'squad'+attempt,defenseOffsetZ:game.EMBASSY_DEFENSE_OFFSET_Z,enemies:empty,friendlies:corps.friendlies,
      friendlyPosesRef:corps.friendlyPosesRef,zombies:h.zombies,zombiePosesRef:h.posesRef,obstacles,enabled:fighting,
      onFriendlyFire:()=>w.allyShots++,onZombieHit:allyHit}),
    el(game.ZombieHorde,{zombies:h.zombies,posesRef:h.posesRef,tankRef:tank,friendliesRef:allies.friendliesRef,
      friendlyPosesRef:allies.posesRef,obstacles,archives:h.archives,active:fighting,
      onArchiveHit:(id,amt)=>{w.buildings.add(id);h.damageArchive(id,amt);},
      onTankBreach:()=>{w.tankHits++;h.registerBreach();},
      onFriendlyBreach:e=>{w.friendlyHits++;if(!allies.handleFriendlyBreach(e)){const hit=corps.damageFriendly(e.friendlyId,e.damage);if(hit&&hit.friendly.id.startsWith('lift-'))w.liftBreaches++;}}}),
    el(game.FinalBossAllies,{allies:allies.allies,posesRef:allies.posesRef,zombies:h.zombies,zombiePosesRef:h.posesRef,
      obstacles,enabled:!!boss,prepareSummoning:h.wave>=3,onZombieHit:allyHit,onFire:()=>w.allyShots++}),
    el(game.ProjectileManager,{pool:gun.pool,despawn:gun.despawn,allBlocks:empty,enemies:empty,zombies:h.zombies,
      zombiePosesRef:h.posesRef,onHit:()=>assert.fail('No file target exists'),onEnemyHit:()=>assert.fail('No conventional hostiles exist'),
      onZombieHit:(id,projectile)=>{if(h.damageZombie(id,140,projectile.kind))w.tankShotHits++;}}));
}
function metrics(){return {allyHits:0,allyShots:0,tankShotHits:0,tankShots:0,tankHits:0,friendlyHits:0,peak:0,shooters:new Set(),
  liftBreaches:0,liftDescent:false,liftUnload:false,liftPeel:false,liftGround:new Set(),liftEmerged:new Set(),clearSteps:new Map(),
  buildings:new Set(),lanes:new Set(),emerged:new Set(),entryTimes:[],firstArrival:null};}
async function run(policy) {
  const rows=[],lastSeen=new Map();let lastFire=-Infinity,begin=ms,no=0,usedPlate=false;
  const arrivalSites = new Map();
  for(let count=0;count<20*270;count++){
    if(h.phase==='victory'||h.phase==='defeat')break;
    if(h.phase!=='combat'){
      if(policy==='defend' && h.phase==='intermission' && h.wave===3 && !usedPlate){
        await act(async()=>{usedPlate=h.spendKit('hull');});assert.ok(usedPlate);
      }
      await frame();continue;
    }
    if(h.wave!==no){no=h.wave;w=metrics();begin=ms;lastFire=ms;w.roster=h.aliveCount;}
    const t=(ms-begin)/1000;
    if (no >= 3) for (const ally of allies.allies) {
      const effect = scene.getObjectByName(ally.id + '-summoning');
      if (no === 4 && t >= .20 && t <= .45) {
        assert.equal(scene.getObjectByName(ally.id).visible, false, 'The figure waits for the descending shaft');
      }
      if (no === 4 && t >= .82 && t <= .96) {
        const actor = scene.getObjectByName(ally.id);
        assert.ok(actor.visible && actor.userData.arrivalReveal > 0 && actor.userData.arrivalReveal < 1,
          'Each ally materializes progressively at touchdown');
        assert.ok(effect.visible && actor.position.distanceTo(effect.position) < .1,
          'The rider, mount and infantry form at the foot of their own pillar');
      }
      if (no === 3 || t >= 4) {
        assert.ok(!effect?.visible, 'Summoning is a one-shot exclusive to wave four');
      } else if (t >= 0.8 && t <= 2) {
        assert.ok(effect?.visible && effect.getObjectByName('summoning-ground-light')?.material.opacity > 0);
        if (!arrivalSites.has(ally.id)) arrivalSites.set(ally.id, effect.position.clone());
        assert.ok(effect.position.equals(arrivalSites.get(ally.id)), 'Light stays at the landing site as the ally moves');
      }
    }
    const active=h.zombies.map((z,i)=>({z,i,p:h.posesRef.current.get(z.id)})).filter(({z,p})=>z.alive&&p?.active);
    w.peak=Math.max(w.peak,active.length);
    if(no===2){
      const aircraft=scene.getObjectByName('rook-relief-transport');
      if(aircraft?.visible)assert.ok(aircraft.getObjectByName('seated-door-gunner')?.isMesh&&aircraft.getObjectByName('door-projector-signal')?.isMesh);
      const passengers=corps.friendlies.filter(a=>a.id.startsWith('lift-'));
      if(aircraft?.visible){
        w.liftDescent ||= aircraft.position.y>4&&!passengers.length;
        w.liftUnload ||= aircraft.position.y<1.5&&passengers.length>0&&passengers.length<4;
        w.liftPeel ||= aircraft.position.y>4&&passengers.length===4
          &&passengers.every(p=>(scene.getObjectByName(p.id)?.userData.reliefRounds??0)>0);
      }
      for(const p of passengers){
        const model=scene.getObjectByName(p.id), pose=corps.friendlyPosesRef.current.get(p.id)?.position;
        if(!p.alive||!pose||!model?.visible||!model.getObjectByName('us-field-infantry-volume')?.isSkinnedMesh)continue;
        assert.ok(model.position.distanceTo(pose)<.00001,'same target pose as rendered landing infantry');
        if(pose.y>.5&&Math.abs(pose.x-game.LIFT_DOOR[0])<.2)w.liftEmerged.add(p.id);
        if(pose.y>.22&&Math.hypot(pose.x-game.LIFT_DOOR[0],pose.z-game.LIFT_DOOR[2])>.98)
          w.clearSteps.set(p.id,(w.clearSteps.get(p.id)??0)+delta);
        if(pose.y<.03&&Math.hypot(pose.x-game.LIFT_DOOR[0],pose.z-game.LIFT_DOOR[2])>1.5)w.liftGround.add(p.id);
      }
    }
    for(const {z,i,p} of active) {
      if(!w.emerged.has(z.id))w.entryTimes[i]=+t.toFixed(3);
      w.emerged.add(z.id);
      const d=Math.min(tank.current.position.distanceToSquared(p.position),...allies.friendliesRef.current.filter(a=>a.alive)
        .map(a=>allies.posesRef.current.get(a.id)?.position.distanceToSquared(p.position)??Infinity));
      const target=game.selectEmbassyTarget(h.archives,p.position.x,p.position.z,i,d,z.archetype==='boss');
      if(target)w.lanes.add(target.id);
    }
    if(policy==='unanswered'&&t<5){tank.current.position.z=Math.min(21,-12+t*7);}
    if(policy==='defend'&&no===4&&t>1){
      // Continuous from the actual guard station, including acceleration.
      // This scripted movement tests combat and is not a claim about input or navigation.
      const r=Math.hypot(start[0],start[2]-5),elapsed=t-1;
      const a=Math.atan2(start[0],5-start[2])+7.8*(elapsed-.65*(1-Math.exp(-elapsed/.65)))/r;
      tank.current.position.set(r*Math.sin(a),0,5-r*Math.cos(a));
    }
    if(policy==='defend'&&t>=(no===4?1.5:7)&&ms-lastFire>=game.CANNON_RELOAD_SECONDS*1000&&active.length){
      const nearest=active.reduce((a,b)=>a.p.position.distanceToSquared(tank.current.position)<b.p.position.distanceToSquared(tank.current.position)?a:b);
      pos.copy(tank.current.position);pos.y+=.60;
      dirVec.copy(nearest.p.position);
      if(no===4&&lastSeen.has(nearest.z.id)){
        // Aim where the moving target is headed during the shell's real flight,
        // using only its previous observed position (no future pose or hit assist).
        const lead=nearest.p.position.clone().sub(lastSeen.get(nearest.z.id)).divideScalar(delta).clampLength(0,nearest.z.speed);
        dirVec.addScaledVector(lead,Math.min(.55,pos.distanceTo(nearest.p.position)/game.PROJECTILE_SPEED));
      }
      dirVec.sub(pos);dirVec.y=0;dirVec.normalize();
      // Single normal-damage shell, fired at the current pose. Flight time,
      // sweep, miss, despawn, and hit registration use the mounted manager.
      gun.spawn(pos,dirVec,'cannon',++serial);lastFire=ms;w.tankShots++;
    }
    if(no===4)for(const {z,p} of active)lastSeen.set(z.id,(lastSeen.get(z.id)??v3(0,0,0)).copy(p.position));
    await frame();
    if(w.firstArrival===null&&(w.tankHits||w.friendlyHits||w.buildings.size))w.firstArrival=+(t+delta).toFixed(2);
    if(h.phase!=='combat'){
      const row={wave:no,seconds:(ms-begin)/1000,spawned:w.emerged.size,roster:w.roster,peak:w.peak,firstArrival:w.firstArrival,
        entryTimes:w.entryTimes,raidLanes:[...w.lanes],archiveContacts:[...w.buildings],squadOrBossAllyHits:w.allyHits,
        shooters:[...w.shooters],allyShots:w.allyShots,cannonShots:w.tankShots,cannonHits:w.tankShotHits,
        friendlyBreaches:w.friendlyHits,tankContacts:w.tankHits,unblockedTankBreaches:h.breachCount,plateUsed:no===4&&usedPlate,archives:h.archives.map(a=>a.health),
        survivors:corps.friendlies.filter(a=>a.alive).length,downed:corps.friendlies.filter(a=>!a.alive).map(a=>a.id),
        bossAllies:no===4?allies.allies.map(a=>({name:a.shortLabel,hp:Math.round(a.health),cause:a.defeatCause})):[],outcome:h.phase,
        flight:[w.liftDescent,w.liftUnload,w.liftPeel],emergedFromDoor:w.liftEmerged.size,dispersed:w.liftGround.size,
        separatedStepSeconds:[...w.clearSteps.values()],liftBreaches:w.liftBreaches};
      rows.push(row);console.log(policy,JSON.stringify(row));
    }
  }
  assert.ok(h.phase==='victory'||h.phase==='defeat','Timed out in wave '+h.wave);
  return rows;
}

// Correlate the exact R9 seeded replay's *gameplay* events with peak time.
// No GL, scheduling or GPU timing: a nearby archival event is a candidate
// for first-use work, not evidence that WebKit spent the whole gap on it.
if(process.argv.includes('--peak-archive-correlation')){
  const replay=game.createFileObjective(game.createTrainingEntries(),game.TRAINING_DIRECTORY+':horde:1');
  delta=1/60;w=metrics();camera.aspect=16/9;camera.updateProjectionMatrix();camera.position.set(0,4.2,-18.8);
  await render(el(Encounter,{realTank:true,sessionKey:1,seed:game.hashCombatSession(game.TRAINING_DIRECTORY)}));
  await act(async()=>{assert.ok(h.begin(replay.id,3));corps.resetFriendlies(game.EMBASSY_DEFENSE_OFFSET_Z);});
  let start=null,full=null,nextFixture=0,fullFrames=0;const firstAlarms=new Map(),matrix=new THREE.Matrix4();
  const staged=[0,0];
  for(let f=0;f<60*75;f++){
    await frame();
    if(h.phase!=='combat')continue;
    if(h.wave<3){
      if(ms<nextFixture)continue;
      nextFixture=ms+175;
      await act(async()=>{for(const z of h.zombies)if(z.alive&&h.posesRef.current.get(z.id)?.active){
        h.damageZombie(z.id,z.health,'friendly-rifle');staged[h.wave-1]++;
      }});
      continue;
    }
    assert.equal(h.wave,3);start??=ms;
    const heads=scene.getObjectByName('nightmare-undead-heads');assert.equal(heads.instanceMatrix.count,22);
    let mask=0;
    for(let i=0;i<heads.count;i++){heads.getMatrixAt(i,matrix);if(Math.abs(matrix.determinant())>=1e-9)mask|=1<<i;}
    if(mask===0x3fffff){full??=ms;fullFrames++;}
    else assert.equal(full,null,'real wave-three head disappeared in the seven-second interval');
    for(const a of h.archives)if(a.underAttackUntil>ms&&!firstAlarms.has(a.id))firstAlarms.set(a.id,ms);
    if(full!==null&&ms-full>=7000)break;
  }
  assert.notEqual(start,null);assert.notEqual(full,null);assert.ok(fullFrames>=421);
  assert.deepEqual(staged,[10,18]);
  const ids=h.zombies.map(z=>z.id);
  assert.deepEqual(ids,Array.from({length:22},(_,i)=>'undead-1e2mj13-3-'+i),'same R9 physical roster identities');
  assert.equal(firstAlarms.keys().next().value,'dispatch');
  const events=Object.fromEntries([...firstAlarms].map(([id,t])=>[id,Math.round(t-full)]));
  console.log(JSON.stringify({scope:'CPU-mounted 60 Hz simulated gameplay, no WebKit/GPU measurements',
    firstWaveThreeId:ids[0],roster:ids.length,stagedHits:staged,fullSinceWaveMs:Math.round(full-start),
    fullWindowMs:Math.round(ms-full),firstAlarmsAfterFullMs:events},null,2));
  await render(null);assert.equal(subscribers.size,0);assert.equal(timers.size,0);process.exit(0);
}

await render(el(Encounter));
await act(async()=>{assert.ok(h.begin('virtual-only'));corps.resetFriendlies(game.EMBASSY_DEFENSE_OFFSET_Z);});
const won=await run('defend');
receipt.defense=won;
assert.equal(h.phase,'victory');
const designed=Object.values(game.ZOMBIE_WAVES).map(w=>w.count);
assert.deepEqual(won.map(a=>a.spawned),designed);
assert.equal(Math.max(...won.map(a=>a.peak)),game.ZOMBIE_MAX_ACTIVE,'actual full concurrent peak under fire');
assert.deepEqual(won[1].flight,[true,true,true]);
assert.equal(won[1].emergedFromDoor,4);assert.equal(won[1].dispersed,4);
assert.ok(won[1].separatedStepSeconds.length===4&&won[1].separatedStepSeconds.every(t=>t>=.28),'Every actor visibly clears the sill while still off the road');
assert.ok(won[1].shooters.some(id=>id.startsWith('lift-')),'Passenger fired a projectile that hit a real horde actor');
assert.ok(won.some(row=>row.liftBreaches>0),'Mounted horde successfully picked and damaged relief infantry');
assert.ok(won[3].peak>=6&&won[3].entryTimes[6]-won[3].entryTimes[5]>5,'Finale fielded a mixed group and a distinct second escort push');
assert.ok(won[1].entryTimes[7]-won[1].entryTimes[6]>3.5,'Wave 2 has an observable second arrival');
assert.ok(won[2].entryTimes[7]-won[2].entryTimes[6]>2 && won[2].entryTimes[12]-won[2].entryTimes[11]>1.65,
  'Wave 3 presents three separate reinforcement groups');
assert.ok(won.every(a=>a.squadOrBossAllyHits>0&&a.cannonHits>0&&a.seconds>6));
assert.ok(won.slice(0,3).every(a=>a.raidLanes.length===3));
assert.equal(h.totalKills,designed.reduce((a,b)=>a+b,0));
await act(async()=>{h.reset();});tank.current.position.set(0,0,-12);attempt++;
await act(async()=>{assert.ok(h.begin('virtual-only'));corps.resetFriendlies(game.EMBASSY_DEFENSE_OFFSET_Z);});
await run('unanswered');
assert.equal(h.phase,'defeat');assert.equal(h.defeatReason,'tank');assert.equal(h.breachCount,3);
await act(async()=>{for(const p of gun.pool.current)p.active=false;attempt++;assert.ok(h.retry());corps.resetFriendlies(game.EMBASSY_DEFENSE_OFFSET_Z);});
assert.equal(h.phase,'warning');assert.equal(h.wave,0);assert.equal(h.totalKills,0);assert.equal(h.breachCount,0);
assert.ok(h.archives.every(a=>a.health===a.maxHealth&&!a.underAttackUntil));
for(let n=0;n<200;n++)await frame();
assert.equal(h.phase,'combat');assert.equal(h.wave,1);assert.equal(h.aliveCount,10);
await render(null);assert.equal(subscribers.size,0);assert.equal(timers.size,0);

// Matched ordinary opening with the real five defenders, tank, chase camera and input
// handlers. No staged actor placements, archive writes or gun.spawn from the driver.
const virtual=game.createSimulatedCommands(),vault=game.CAMPAIGN_FINALE;
const finale=game.createFileObjective(await virtual.scanDirectory(vault),vault+':2');
const duplicate=finale.targets[0];
await virtual.moveToTrash(duplicate.path,duplicate.duplicateOfPath);
const files=virtual.getDefenseFiles(new Set([duplicate.duplicateOfPath]));
assert.equal(files.length,3);
const replay=game.createFileObjective(game.createTrainingEntries(),game.TRAINING_DIRECTORY+':horde:1');
for (const spec of [
  {case:'seeded-opening',hz:20,sessionKey:'virtual-embassy-playthrough',seed:1968,objective:'virtual-only'},
  {case:'earned-Vault',hz:20,sessionKey:2,seed:game.hashCombatSession(vault),objective:finale.id},
  {case:'earned-Vault',hz:60,sessionKey:2,seed:game.hashCombatSession(vault),objective:finale.id},
  {case:'earned-replay',hz:60,sessionKey:1,seed:game.hashCombatSession(game.TRAINING_DIRECTORY),objective:replay.id},
]) {
delta=1/spec.hz;
const paired={};
for(const reactToAlarm of [false,true]){
  ms=0;attempt++;w=metrics();
  camera.aspect=1920/1080;camera.updateProjectionMatrix();camera.position.set(0,4.2,-18.8);
  await render(el(Encounter,{realTank:true,sessionKey:spec.sessionKey,seed:spec.seed}));
  await act(async()=>{assert.ok(h.begin(spec.objective,files.length));corps.resetFriendlies(game.EMBASSY_DEFENSE_OFFSET_Z);});
  while(h.phase==='warning')await frame();
  const waveStart=ms,seconds=()=>+( (ms-waveStart)/1000 ).toFixed(2);
  let alarm=null,damage=null,firstDamageHP=null,turn='',lastClick=-Infinity,spawn=null,spawnInChase=null,atAlarm=null,down=null,previous=null,biggestStep=0;
  const key=(type,code)=>window.dispatchEvent(Object.assign(new Event(type),{code,repeat:false}));
  // The document capture listener receives the canvas as the original target.
  // Supply CSS client coordinates just as a browser press does.
  const button=type=>{
    const {pointer,size}=state;
    const event=Object.assign(new Event(type),{button:0,
      clientX:size.left+(1+pointer.x)*size.width/2,clientY:size.top+(1-pointer.y)*size.height/2});
    Object.defineProperty(event,'target',{value:state.gl.domElement});
    document.dispatchEvent(event);
  };
  const runner=h.zombies.find(z=>z.archiveRunner);assert.ok(runner);
  const formation=[];
  // The moving reticle is not an instantaneous barrel turn. Wait for the
  // production player's sweep cue to settle before issuing the response shot.
  let sweeping=false;
  const trackSweep=e=>{sweeping=e.detail;};
  document.addEventListener('tankdelete:turret-sweep',trackSweep);
  for(let i=0;i<spec.hz*28&&h.phase==='combat'&&h.wave===1;i++){
    // Sample intact, ordinarily targeted actors, from the mounted player's
    // actual camera. This is a projection guard, not a substitute for film.
    if(spec.case.startsWith('earned-') && spec.hz===60 && [4.5,6,8].includes(seconds())){
      const pair=h.zombies.filter(z=>z.openingPaddyApproach);
      assert.equal(pair.length,2);
      formation.push(pair.map(z=>{
        const p=h.posesRef.current.get(z.id);
        assert.ok(p?.active && z.alive && !z.archiveRunner,'Two actual living supports, not render proxies');
        const top=p.position.clone().add(v3(0,1.4,0)).project(camera),foot=p.position.clone().project(camera);
        const x=(1+top.x)*960,y=(1-top.y)*540,height=(top.y-foot.y)*540;
        assert.ok(x>950 && x<1550 && y>440 && y<580 && height>=65,'Upper bodies inside unobstructed HUD region at gameplay scale');
        return {x,y,height};
      }));
    }
    const file=h.archives.find(a=>a.id==='dispatch');
    if(file.underAttackUntil>ms)alarm??=seconds();
    if(file.health<file.maxHealth){damage??=seconds();firstDamageHP??=file.health;}
    const actor=h.posesRef.current.get(runner.id);
    if(actor?.active){
      if(previous)biggestStep=Math.max(biggestStep,actor.position.distanceTo(previous));
      previous=actor.position.clone();spawn??=actor.position.toArray();
      spawnInChase??=actor.position.clone().add(v3(0,1,0)).project(camera).toArray();
      if(alarm!==null&&!atAlarm)atAlarm=actor.position.clone().add(v3(0,1,0)).project(camera).toArray();
    }else if(spawn)down??=seconds();
    if(reactToAlarm&&alarm!==null&&actor?.active){
      // Turn using the same A/D bindings as the player until the named door and
      // its attacker are on screen. Aim at a legal screen point, allow a frame
      // for the real turret, and click the real reloading cannon.
      const torso=actor.position.clone().add(v3(0,.68,0));
      const xy=torso.clone().project(camera);
      const visible=xy.z>-1&&xy.z<1&&Math.abs(xy.x)<.85&&Math.abs(xy.y)<.8;
      const next=visible?'':tank.current.worldToLocal(torso).x>0?'KeyD':'KeyA';
      if(next!==turn){if(turn)key('keyup',turn);if(next)key('keydown',next);turn=next;}
      if(visible){
        state.pointer.set(xy.x,xy.y);
        if(ms-lastClick>=1050){
          await frame();
          if(!sweeping){button('pointerdown');button('pointerup');lastClick=ms;}
        }
      }
    }
    await frame();
  }
  document.removeEventListener('tankdelete:turret-sweep',trackSweep);
  if(turn)key('keyup',turn);
  if(spec.case.startsWith('earned-') && spec.hz===60){
    assert.equal(formation.length,3);
    for(const [a,b] of formation)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>24,'Front rank must have two distinct silhouettes');
    for(const n of [0,1])assert.ok(formation[0][n].x-formation[2][n].x>220,'Front rank visibly crosses the firing lane');
  }
  const result={alarmSec:alarm,firstDamageSec:damage,firstDamageHP,dispatchHP:h.archives.find(a=>a.id==='dispatch').health,
    shots:w.tankShots,hits:w.tankShotHits,runnerDownSec:down,peakStep:biggestStep,runnerStart:spawn,spawnInChase,atAlarm,
    namedFile:spec.case.startsWith('earned-')?files[2]:'Dispatch annex',
    allyHits:w.allyHits,regularDefenders:corps.friendlies.length};
  console.log(spec.case,spec.hz+'Hz',reactToAlarm?'answer':'ignore',JSON.stringify(result));
  paired[reactToAlarm?'answer':'ignore']=result;
  await render(null);
}
assert.ok(paired.ignore.alarmSec>0&&paired.ignore.alarmSec<=18&&paired.ignore.firstDamageSec>paired.ignore.alarmSec);
assert.equal(paired.answer.alarmSec,paired.ignore.alarmSec);
assert.ok(paired.ignore.atAlarm && Math.abs(paired.ignore.atAlarm[0])<.86 && Math.abs(paired.ignore.atAlarm[1])<.8 && Math.abs(paired.ignore.atAlarm[2])<1,'The stationary player can see the first raider at the warning, without moving the tank');
assert.ok(paired.ignore.dispatchHP<200&&paired.answer.dispatchHP===200&&paired.answer.shots>0&&paired.answer.hits>0);
if(spec.case.startsWith('earned-')){
  assert.equal(paired.ignore.firstDamageHP,192,'First strike capped at 8 HP; continued neglect can cost more');
  assert.equal(paired.answer.shots,1);assert.equal(paired.answer.hits,1);
}
const maxStride=(4.1+.14)/spec.hz+1e-6;
assert.ok(paired.answer.peakStep<=maxStride&&paired.ignore.peakStep<=maxStride,'The runner must physically traverse the route, not recover by warping');
assert.deepEqual(paired.answer.runnerStart,paired.ignore.runnerStart);
assert.ok(paired.ignore.spawnInChase.every(x=>Math.abs(x)<1),'Front entry must project inside the actual chase frame');
assert.equal(paired.answer.regularDefenders,5);assert.ok(paired.answer.allyHits>0&&paired.ignore.allyHits>0);
}
delta=.05;
tank.current=new THREE.Group();

// Isolate pressure arbitration independently of the (much stronger) successful driver:
// an evacuated line, three raiders already at separate doors and one striker at the tank.
// Only the starting positions are staged; the mounted actors choose targets, detect
// contact, and attack through the same windup, damage, defeat and retry paths as play.
let siege, tankContact=null, siegePoses;
const warnings=new Map(),damage=new Map(),evacuated=ref([]),emptyPoses=ref(new Map());
tank.current.position.set(0,0,0);
function Siege() {
  siege=game.useZombieEpilogue({sessionKey:'concurrent-siege',seed:1968});
  const placed=React.useMemo(()=>siege.zombies.map((z,i)=>{
    const a=game.createEmbassyArchives()[Math.floor(i/3)];
    // Deliberately land a few ULPs outside the exact nominal reach, as a
    // natural 60 Hz approach can. All three are within the melee tolerance.
    const entry=i===1?[0,.02,.65]:a?[a.approach[0],.02,a.approach[2]+z.breachRange+1e-12]:z.position;
    return {...z,position:entry,alive:z.alive&&[0,1,3,6].includes(i),spawnDelay:0};
  }),[siege.zombies]);
  // Wave poses are allocated by the hook before rendering. Mount this one
  // fixture with its own pose map so its custom entry points take effect.
  const posed=React.useRef(new Map());
  siegePoses=posed;
  return el(game.ZombieHorde,{zombies:placed,posesRef:posed,tankRef:tank,friendliesRef:evacuated,friendlyPosesRef:emptyPoses,
    archives:siege.archives,obstacles:game.embassyCombatObstacles(siege.archives),active:siege.phase==='combat',
    tankTargetEnabled:tankContact===null,
    onTankBreach:()=>{tankContact??=ms;siege.registerBreach();},
    onArchiveHit:(id,amount)=>{warnings.set(id,warnings.get(id)??ms);siege.damageArchive(id,amount);}});
}
delta=1/60;
await render(el(Siege));await act(async()=>{assert.ok(siege.begin('virtual-siege'));});
const resting=new Map();let settledActorFrames=0;
for(let n=0;n<60*90&&siege.phase!=='defeat';n++){
  await frame();
  for(const a of siege.archives)if(a.health<a.maxHealth&&!damage.has(a.id))damage.set(a.id,ms);
  if(warnings.size===3 && ms - Math.max(...warnings.values())<10000) {
    for(const i of [0,3,6]){
      const pose=siegePoses.current.get(siege.zombies[i].id);assert.ok(pose.active);
      if(!resting.has(i))resting.set(i,pose.position.clone());
      assert.ok(pose.position.distanceTo(resting.get(i))<1e-9,'Contacted raider must not walk or warp during a ten-second siege');
      settledActorFrames++;
    }
  }
}
assert.ok(settledActorFrames>=3*9*60,'Hold each raid for at least twice the 4.25s stuck timer');
assert.equal(warnings.size,3);assert.equal(damage.size,3);assert.notEqual(tankContact,null);
const times=[tankContact,...warnings.values()];
assert.ok(Math.max(...times)-Math.min(...times)<500,'An unrelated target may not steal another building or defender contact window');
for(const [id,at] of damage)assert.ok(at-warnings.get(id)>=2250,'Every building has its complete warning window');
assert.equal(siege.phase,'defeat');assert.equal(siege.defeatReason,'archives');assert.equal(siege.breachCount,1);
assert.ok(siege.archives.every(a=>a.health===0));
assert.ok(ms-Math.min(...warnings.values())>=30000,'Even simultaneous undefended sieges take at least 30 seconds');
console.log('Staged simultaneous siege:',JSON.stringify({settledActorFrames,contactsWithinMs:Math.round(Math.max(...times)-Math.min(...times)),
  firstDamageAfterMs:Object.fromEntries([...damage].map(([id,at])=>[id,at-warnings.get(id)])),
  timeFromFirstWarningToLossSec:(ms-Math.min(...warnings.values()))/1000,breaches:siege.breachCount}));
await act(async()=>{assert.ok(siege.retry());});
assert.ok(siege.archives.every(a=>a.health===a.maxHealth&&a.underAttackUntil===0&&a.damageReadyAt===0));
await render(null);assert.equal(subscribers.size,0);assert.equal(timers.size,0);
console.log('PASS: mounted four-wave combat victory, unopposed tank loss, parallel archive sieges and clean retries. Times are simulated combat only; exclude UI takeover, menu, GPU and filesystem.');

// Same encounter, tank parked at the guard station. No player actions at all;
// allies still take their own shots. Do not confuse this with driving toward
// the zombies under the unanswered policy above.
delta=.05;tank.current=new THREE.Group();tank.current.position.set(...start);attempt++;
await render(el(Encounter));
await act(async()=>{assert.ok(h.begin('virtual-only'));corps.resetFriendlies(game.EMBASSY_DEFENSE_OFFSET_Z);});
const idle=await run('parked');assert.ok(idle.every(a=>a.cannonShots===0));
assert.equal(h.phase,'defeat','A completely unattended defense should not win');
receipt.parked=idle;
assert.ok(idle[0].downed.length>=1 && idle[0].survivors<won[0].survivors,'Player protection changes actual defender survival');
assert.equal(won[0].downed.length,0,'The exposed opening team can all survive');
assert.ok(won[3].bossAllies.some(a=>a.hp>0),'Drawing boss aggro can save named allies');
assert.ok(won[3].bossAllies.every(a=>a.hp>0||a.cause==='combat'));
await render(null);

// Identical routing principle to the peak browser probe: stage ONLY emerged
// wave-one/two contacts; leave allies and the entire measured third wave alone.
// This is a combat/roster check in simulation time, not a timing receipt.
delta=1/60;ms=0;attempt++;w=metrics();tank.current=new THREE.Group();tank.current.position.set(...start);
await render(el(Encounter,{sessionKey:1,seed:game.hashCombatSession(game.TRAINING_DIRECTORY)}));
await act(async()=>{assert.ok(h.begin(replay.id));corps.resetFriendlies(game.EMBASSY_DEFENSE_OFFSET_Z);});
let peakAt=-1,peakIds=[],heldMs=0;
for(let step=0;step<85*60;step++){
  await frame();
  if(h.phase==='intermission')continue;
  if(h.phase!=='combat')continue;
  const active=h.zombies.filter(z=>z.alive&&h.posesRef.current.get(z.id)?.active);
  if(h.wave<3){if(step%10===0&&active.length)await act(async()=>h.damageZombies(active.map(z=>z.id),140,'friendly-rifle'));continue;}
  const mesh=scene.getObjectByName('nightmare-undead-heads'),mat=new THREE.Matrix4();
  const ids=active.filter(z=>{mesh.getMatrixAt(h.zombies.indexOf(z),mat);return Math.abs(mat.determinant())>1e-9;}).map(z=>z.id);
  if(peakAt<0&&ids.length===22){peakAt=ms;peakIds=ids;}
  if(peakAt>=0){
    if(ids.length<22)break;
    assert.deepEqual(ids,peakIds,'Same emerged, moving, destructible contacts throughout');
    heldMs=ms-peakAt;
  }
}
assert.ok(peakAt>=0&&heldMs>=7000,'Full-roster interval lasted '+(heldMs/1000).toFixed(3)+'s; required seven seconds.');
console.log('Earned-replay mounted peak: the same 22 visible heads for '+(heldMs/1000).toFixed(3)+' simulation seconds with the landed squad fighting.');
await render(null);

// Face one command contact at the edge of its reach. Observe the actual arm
// rotating on the chest. In the paired attempt drive away at normal
// speed as soon as the raised-claw silhouette appears, before damage.
for(const evade of [false,true]){
  delta=1/60;const startMs=ms,hits=[],poses=ref(new Map());
  const boss={...game.createZombieWave(67,4)[0],position:[0,.02,-7.44]};
  tank.current=new THREE.Group();tank.current.position.set(0,0,-12);
  await render(el(game.ZombieHorde,{zombies:[boss],posesRef:poses,tankRef:tank,active:true,
    obstacles:empty,archives:empty,onTankBreach:()=>hits.push((ms-startMs)/1000)}));
  const bossRoot=scene.getObjectByName('nightmare-boss-sculpt');
  const arm=bossRoot?.getObjectByName('command-striking-arm');
  assert.ok(arm?.isMesh&&!bossRoot.getObjectByName('ghost-actor-pixels'),'Solid striking arm, no billboard');
  assert(bossRoot.getObjectByName('command-double-faced-skull')?.isMesh);
  let raisedAt=null,struckAt=null;
  for(let i=0;i<60*2.5;i++) {
    if(evade&&raisedAt!==null)tank.current.position.z-=8*delta;
    await frame();scene.updateMatrixWorld();
    if(bossRoot.visible&&arm.rotation.x>.57)raisedAt??=(ms-startMs)/1000;
    if(raisedAt!==null&&arm.rotation.x<-.08)struckAt??=(ms-startMs)/1000;
  }
  assert.notEqual(raisedAt,null);
  if(evade){assert.deepEqual(hits,[]);assert.ok(struckAt!==null&&struckAt-raisedAt>=.5,'The planted swing finishes, and visibly misses');}
  else {assert.equal(hits.length,1);assert.ok(hits[0]-raisedAt>=.53);assert.equal(hits[0],struckAt);}
  console.log('Visible boss swing',evade?'evade':'hold',JSON.stringify({raisedAt,struckAt,hits}));
  receipt.swing.push({evade,raisedAt,struckAt,hits});
  await render(null);
}

// Follow a complete ranged attack on a tank in open terrain.
{
  const boss={...game.createZombieWave(67,4)[0],position:[0,.02,5]};
  tank.current=new THREE.Group();tank.current.position.set(0,0,-12);
  const poses=ref(new Map());
  await render(el(game.ZombieHorde,{zombies:[boss],posesRef:poses,tankRef:tank,active:true}));
  const comet=scene.getObjectByName('boss-fireball'),tail=scene.getObjectByName('boss-comet-flame');
  const impact=scene.getObjectByName('boss-fire-impact'),flames=scene.getObjectByName('boss-ground-flames');
  assert.equal(tail.material.uniforms.atlas.value,flames.material.uniforms.atlas.value);
  const matrix=new THREE.Matrix4();
  let charged=false,thrown=false,full=false,finished=false;
  for(let i=0;i<60*16&&!finished;i++){
    await frame();scene.updateMatrixWorld();
    if(comet.visible){
      if(tail.scale.y>1.5)thrown=true;else charged=true;
    }
    if(impact.visible&&flames.count===flames.instanceMatrix.count){
      assert.equal(comet.visible,false);
      for(let j=0;j<flames.count;j++){
        flames.getMatrixAt(j,matrix);
        assert.equal(matrix.elements[13],0,'Every flame stays on the impact surface');
        assert(matrix.determinant()>0,'Only invertible volumes can be submitted');
      }
      full=true;
    }
    finished=full&&!impact.visible;
  }
  assert(charged&&thrown&&full&&finished,'Charge, trailing fire, spreading burn and cleanup all render');
  await render(null);
}

// Both ordinary chase rigs look across this court. Dispatch has advanced:
// some genuine frontage now shows through the cut-back at the rear. Count
// it only if BOTH mounted head and chest are actually visible from the rig;
// the former z>-20 rectangle also counted unseen bodies behind solid walls.
const courtWorks=game.createEmbassyGroundworks(),courtFlag=game.createEmbassyColors(),
  occluderMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const occluder=(geometry,at=[0,0,0])=>{const mesh=new THREE.Mesh(geometry,occluderMaterial);
  mesh.position.fromArray(at);mesh.updateMatrixWorld();return mesh;};
const obstaclesToView=[...game.createEmbassyArchives().map(a=>occluder(game.createEmbassyBuildingGeometry(a.id==='chancery',false,a.id),a.position)),
  occluder(courtWorks.walls),occluder(courtFlag.cloth),occluder(courtFlag.pole)];
const rayToActor=new THREE.Raycaster(),landmark=v3(0,0,0),clip=v3(0,0,0);
function clearBodyLandmark(part,chest){
  if(!part.geometry.boundingBox)part.geometry.computeBoundingBox();
  const box=part.geometry.boundingBox;box.getCenter(landmark);
  if(chest)landmark.y=THREE.MathUtils.lerp(box.min.y,box.max.y,.73);
  part.localToWorld(landmark);clip.copy(landmark).project(camera);
  if(clip.z<=0||clip.z>=1||Math.abs(clip.x)>.97||Math.abs(clip.y)>.97)return false;
  rayToActor.set(camera.position,clip.copy(landmark).sub(camera.position).normalize());
  rayToActor.far=camera.position.distanceTo(landmark)-.01;
  return rayToActor.intersectObjects(obstaclesToView,false).length===0;
}
// Mount the real final roster's lead and normal defenders, plus the real
// CameraRig on a stationary observer independent of the encounter's tank.
for(const view of ['campaign','practice'])for(const hz of [20,60]){
  delta=1/hz;const poses=ref(new Map()),defenders=game.createUSInfantryCombatants(game.EMBASSY_DEFENSE_OFFSET_Z);
  tank.current=new THREE.Group();tank.current.position.set(3,0,-8.5);
  const z=game.createZombieWave(248,4)[0],allies=ref(defenders),allyPoses=ref(new Map(defenders.map(d=>
    [d.id,{position:new THREE.Vector3(...d.position)}])));
  let attacked=0,inside=0,travel=0,xMin=100,xMax=-100,previous=new THREE.Vector3(...z.position);
  const archives=game.createEmbassyArchives(),obstacles=game.embassyCombatObstacles(archives),zombies=[z];
  const observer=ref(new THREE.Group());observer.current.position.fromArray(view==='campaign'?game.EMBASSY_GUARD_POSITION:game.GHOST_EMBASSY_START);
  observer.current.rotation.y=view==='campaign'?game.EMBASSY_GUARD_YAW:game.GHOST_EMBASSY_YAW;
  camera.aspect=16/9;camera.updateProjectionMatrix();
  function CourtEncounter(){
    const named=game.useFinalBossAllies({enabled:true,encounterKey:'court-fixture:'+hz,baseFriendliesRef:allies,posesRef:allyPoses});
    return el(React.Fragment,null,el(game.CameraRig,{tankRef:observer,embassy:true}),
      el(game.ZombieHorde,{zombies,tankRef:tank,posesRef:poses,friendliesRef:named.friendliesRef,friendlyPosesRef:named.posesRef,
        active:true,archives,obstacles,onFriendlyBreach:e=>{attacked++;named.handleFriendlyBreach(e);}}),
      el(game.FinalBossAllies,{allies:named.allies,posesRef:named.posesRef,zombies,zombiePosesRef:poses,obstacles,enabled:true,
        onZombieHit:()=>{z.suppressionRevision++;},onFire:()=>{}}));
  }
  await render(el(CourtEncounter));
  const body=scene.getObjectByName('nightmare-boss-sculpt'),skull=body.getObjectByName('command-double-faced-skull'),
    chest=body.getObjectByName('command-ripped-coat'),rear=archives.find(a=>a.id==='chancery').approach[2];
  for(let i=0;i<hz*13;i++){
    await frame();const p=poses.current.get(z.id)?.position;if(!p)continue;
    const step=p.distanceTo(previous);assert.ok(step<=z.speed*delta+.0001,'Authored ingress advanced in real movement steps');
    travel+=step;previous.copy(p);
    if(p.z<-14.1&&p.z>=rear&&p.x<14&&p.x>-12){
      body.updateWorldMatrix(true,true);camera.updateMatrixWorld();
      if(body.visible&&clearBodyLandmark(skull,false)&&clearBodyLandmark(chest,true)){inside++;xMin=Math.min(xMin,p.x);xMax=Math.max(xMax,p.x);}
    }
  }
  assert.ok(inside/hz>2.1&&xMax-xMin>7 && attacked>0,'Physical forecourt crossing returns to live melee');
  console.log('Mounted command ingress',view,hz+'Hz',{visibleSeconds:inside/hz,visibleCrossingWidth:xMax-xMin,travel,attacked});
  await render(null);
}
for(const o of obstaclesToView)o.geometry.dispose();
occluderMaterial.dispose();courtWorks.court.dispose();courtFlag.map.dispose();courtFlag.material.dispose();
{
  delta=1/60;const poses=ref(new Map()),z=game.createZombieWave(910,4)[0];
  tank.current=new THREE.Group();tank.current.position.set(3,0,-8.5);
  await render(el(game.ZombieHorde,{zombies:[z],tankRef:tank,posesRef:poses,active:true}));
  for(let i=0;i<150;i++)await frame();
  const pose=poses.current.get(z.id),prev=pose.position.clone();assert.ok(prev.distanceTo(tank.current.position)<23);
  z.playerChallenge++; // Real damage hook revision; no movement/target edits.
  await frame();
  const motion=pose.position.clone().sub(prev).setY(0).normalize(),toTank=tank.current.position.clone().sub(prev).setY(0).normalize();
  assert.ok(motion.dot(toTank)>.999,'A legal player challenge immediately diverts the real approach');
  await render(null);
}

// Track soles from their actual mounted world matrices through several full
// strides. A sine-bob at the pelvis or a foot merely moving relative to the
// model will not pass this fixed-world, alternating-support check.
for(const hz of [20,60]){
  delta=1/hz;const poses=ref(new Map());
  tank.current=new THREE.Group();tank.current.position.set(0,0,-25);
  const boss={...game.createZombieWave(97,4)[0],position:[0,.02,18]};
  await render(el(game.ZombieHorde,{zombies:[boss],posesRef:poses,tankRef:tank,active:true}));
  const root=scene.getObjectByName('nightmare-boss-sculpt');
  const legs=['left','right'].map(n=>root.getObjectByName('command-leg-'+n)),feet=legs.map(l=>l.getObjectByName('boot'));
  const previous=[v3(0,0,0),v3(0,0,0)],p=v3(0,0,0),rootStart=v3(0,0,0),seen=[0,0],fixed=[0,0],alternation=[];
  let measured=0,maxDrift=0,maxHeight=0,maxFlex=0;
  for(let frameNo=0;frameNo<hz*3;frameNo++){
    await frame();scene.updateMatrixWorld();
    if(!root.visible||frameNo<hz*.55)continue;
    for(let i=0;i<2;i++){
      feet[i].getWorldPosition(p);maxHeight=Math.max(maxHeight,p.y-.02);
      if(p.y<.025&&previous[i].y<.025&&measured){
        const drift=previous[i].distanceTo(p);maxDrift=Math.max(maxDrift,drift);fixed[i]++;
      }
      if(p.y>.39){seen[i]++;if(alternation.at(-1)!==i)alternation.push(i);}
      const thigh=legs[i].getObjectByName('thigh'),shin=legs[i].getObjectByName('shin');
      maxFlex=Math.max(maxFlex,thigh.quaternion.angleTo(shin.quaternion));
      previous[i].copy(p);
    }
    if(!measured)root.getWorldPosition(rootStart);measured++;
  }
  // At 20Hz a foot can be within 5mm of the floor immediately BEFORE
  // touchdown; test a pair of samples exactly at the height of the sole.
  assert.ok(maxDrift<.012&&Math.min(...fixed)>hz*.45,'Both boots remain planted during their support phases: '+maxDrift);
  assert.ok(alternation.length>=5&&Math.min(...seen)>=4&&maxHeight>.47&&maxFlex>.55);
  assert.ok(rootStart.distanceTo(root.getWorldPosition(p))>9);
  console.log('Mounted boss gait',hz+'Hz',JSON.stringify({alternation,fixed,maxDrift,maxHeight,maxFlex}));
  receipt.gait.push({hz,alternation,fixed,maxDrift,maxHeight,maxFlex});
  await render(null);
}

// A file runner meets a live soldier on its route while a second soldier is
// engaged elsewhere. Use the actual mounted decision, pose and damage events.
// This controlled contact is separate from the unmodified four-wave route above.
{
  delta=1/60;
  const soldier=(id,x,z)=>({id,alive:true,health:40,maxHealth:40,kneeling:false,position:[x,.02,z]});
  const line=ref([soldier('point',4,7),soldier('wing',-4,7)]);
  const linePoses=ref(new Map(line.current.map(s=>[s.id,{position:v3(...s.position)}])));
  const units=[0,1].map((i)=>({...game.createZombieWave(97,1)[i],archiveRunner:i===0,openingPaddyApproach:undefined,
    position:[i===0?4:-4,.02,8.86],spawnDelay:0,speed:2.5}));
  const poses=ref(new Map()),firstLift=new Map(),hits=[],archives=game.createEmbassyArchives();
  tank.current=new THREE.Group();tank.current.position.set(-14,0,-12);
  const startMs=ms;
  await render(el(game.ZombieHorde,{zombies:units,posesRef:poses,tankRef:tank,friendliesRef:line,
    friendlyPosesRef:linePoses,archives,obstacles:[],active:true,
    onFriendlyBreach:e=>{const target=line.current.find(s=>s.id===e.friendlyId);
      assert(target?.alive);target.health-=e.damage;target.alive=target.health>0;
      hits.push({zombie:e.zombieId,soldier:e.friendlyId,sec:(ms-startMs)/1000});}}));
  for(let f=0;f<150;f++){await frame();for(const [id,p] of poses.current)
    if(p.active&&p.soldierSwing==='windup'&&!firstLift.has(id))firstLift.set(id,(ms-startMs)/1000);}
  assert.deepEqual(hits.map(h=>h.soldier).sort(),['point','wing']);
  for(const h of hits){assert(firstLift.has(h.zombie));assert(h.sec-firstLift.get(h.zombie)>=.25);}
  for(const [,p] of poses.current)assert.equal(p.pursuingSoldier,null,'Downed soldiers are not targeted');
  console.log('File runner and flank contacts independently engaged two soldiers:',JSON.stringify(hits));
  await render(null);
}
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(receipt,null,2)+'\n');
