import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { reconciler, act } from '@react-three/fiber';
import * as THREE from 'three';
import ts from 'typescript';

// Real application hooks and the installed reconciler; only wall timers are
// virtualized. This checks encounter state, not GPU cost or audio audibility.
const modules=new Map();
async function moduleURL(url) {
  if(modules.has(url.href)) return modules.get(url.href);
  const source=await readFile(url,'utf8');
  let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;
  for(const match of [...js.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
    const path=match[2].startsWith('.') ? await moduleURL(new URL(`${match[2]}.ts`,url)) : import.meta.resolve(match[2]);
    js=js.replace(match[0],`from '${path}'`);
  }
  const encoded=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  modules.set(url.href,encoded);return encoded;
}
const {useZombieEpilogue}=await import(await moduleURL(new URL('../src/hooks/useZombieEpilogue.ts',import.meta.url)));
const {ZOMBIE_WAVES,ZOMBIE_MAX_ACTIVE}=await import(await moduleURL(new URL('../src/lib/zombieEpilogue.ts',import.meta.url)));
const {useFinalBossAllies}=await import(await moduleURL(new URL('../src/hooks/useFinalBossAllies.ts',import.meta.url)));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let now=0,nextTimer=0;
const originalDateNow=Date.now;
Date.now=()=>now;
const timers=new Map();
globalThis.window={
  setTimeout(callback,delay){const id=++nextTimer;timers.set(id,{at:now+delay,callback});return id;},
  clearTimeout(id){timers.delete(id);},
};
const store={getState:()=>({scene:new THREE.Scene(),internal:{active:false,frames:0},invalidate(){}})};
const fail=error=>{throw error;};
const root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
let horde,allies;
const defeats=[];
const zombieDeaths=[];
const onKilled=result=>zombieDeaths.push(result);
function Probe({session}) {
  horde=useZombieEpilogue({sessionKey:session,seed:1968,onKilled});
  allies=useFinalBossAllies({enabled:horde.phase==='combat'&&horde.wave===4,encounterKey:`${session}:${horde.wave}`,
    onDefeat:event=>defeats.push(event)});
  return null;
}
const render=async session=>act(async()=>reconciler.updateContainer(session===null ? null
  : React.createElement(React.StrictMode,null,React.createElement(Probe,{session})),root,null,null));
const change=async callback=>act(async()=>{callback();});
async function advance(ms) {
  now+=ms;
  for(let pass=0;pass<20;pass++) {
    const due=[...timers].filter(([,timer])=>timer.at<=now);
    if(!due.length)return;
    await change(()=>{for(const [id,timer] of due){if(timers.delete(id))timer.callback();}});
  }
  assert.fail('Timer loop did not settle');
}

await render('qa-a');
assert.equal(horde.phase,'locked');
await change(()=>{assert.equal(horde.begin('duplicate-objective'),true);assert.equal(horde.begin('duplicate-objective'),false);});
assert.equal(horde.phase,'warning');
await advance(9999);assert.equal(horde.phase,'warning');
await advance(1);
for(let wave=1;wave<=4;wave++) {
  assert.equal(horde.phase,'combat');assert.equal(horde.wave,wave);
  assert.equal(horde.aliveCount,ZOMBIE_WAVES[wave].count);
  assert.ok(horde.aliveCount>0&&horde.aliveCount<=ZOMBIE_MAX_ACTIVE,'Waves stay within actor budget');
  assert.equal(horde.posesRef.current.size,horde.aliveCount);
  if(wave<4) {
    const ids=horde.livingZombies.map(z=>z.id), before=zombieDeaths.length;
    const pose=horde.posesRef.current.get(ids[0]);
    pose.position.x+=.75;
    const lastPosition=pose.position.clone();
    await change(()=>horde.damageZombie(ids[0],1,'friendly-rifle'));
    assert.equal(zombieDeaths.length,before,'a surviving rifle hit cannot leave a skull');
    await change(()=>{
      horde.damageZombies([...ids,ids[0]],1e6,'cannon');
      horde.damageZombie(ids[0],100,'friendly-rifle');
    });
    assert.deepEqual(zombieDeaths.slice(before).map(result=>result.zombie.id),ids,
      'each casualty, including the wave-ending hit, emits exactly once');
    assert.ok(zombieDeaths[before].position.equals(lastPosition));
    assert.notEqual(zombieDeaths[before].position,pose.position,'the mark owns its death position');
    assert.equal(horde.phase,'intermission');assert.equal(horde.posesRef.current.size,0);
    await advance(11999);assert.equal(horde.phase,'intermission','A full twelve-second choice window unless skipped');
    await advance(1);
  }
}
assert.equal(allies.livingCount,3,'Three allies join the boss encounter');
const boss=horde.livingZombies.find(z=>z.archetype==='boss');
assert.ok(boss&&boss.maxHealth===4800);
for(const ratio of [.70,.42,.18]) {
  const current=horde.livingZombies.find(z=>z.id===boss.id);
  await change(()=>horde.damageZombie(boss.id,current.health-boss.maxHealth*ratio,'cannon'));
}
assert.equal(allies.livingCount,3,'Protected allies survive every boss health threshold');
assert.equal(defeats.length,0);
const casualty=allies.allies[0].id;
await change(()=>allies.damageAlly(casualty,300));
await change(()=>allies.damageAlly(casualty,300));
assert.equal(allies.livingCount,2);
assert.deepEqual(defeats.map(d=>[d.allyId,d.cause]),[[casualty,'combat']],'Only actual combat damage downs an ally, once');
await change(()=>horde.damageZombies(horde.livingZombies.map(z=>z.id),1e6,'cannon'));
assert.equal(horde.phase,'victory');assert.equal(allies.active,false);
assert.equal(horde.posesRef.current.size,0);
assert.equal(timers.size,0,'Victory clears ally cleanup and wave timers');

await render('qa-b');
assert.equal(horde.phase,'locked');
await change(()=>horde.begin('retry-objective'));await advance(10000);
await change(()=>{horde.registerBreach();horde.registerBreach();horde.registerBreach();});
assert.equal(horde.phase,'defeat');assert.equal(horde.breachCount,3);
assert.ok([...horde.posesRef.current.values()].every(p=>!p.active));
await change(()=>assert.equal(horde.retry(),true));
assert.equal(horde.breachCount,0);assert.equal(horde.phase,'warning');
assert.ok(horde.archives.every(archive=>archive.health===archive.maxHealth));
await advance(10000);
await change(()=>{
  assert.equal(horde.damageArchive('missing',12),false);
  assert.equal(horde.damageArchive('chancery',NaN),false);
  assert.equal(horde.damageArchive('chancery',12),true);
});
assert.equal(horde.archives[0].health,200,'First contact warns rather than damaging the archive');
assert.ok(horde.archives[0].underAttackUntil>now);
await advance(2250);
await change(()=>{for(let index=0;index<16;index++)horde.damageArchive('chancery',10000);});
assert.equal(horde.archives[0].health,192,'A whole pile-up accepts only one bounded hit per damage window');
await change(()=>horde.damageZombies(horde.livingZombies.map(z=>z.id),1e6,'cannon'));
assert.equal(horde.phase,'intermission');
await change(()=>assert.equal(horde.damageArchive('chancery',12),false));
await advance(12000);
assert.equal(horde.archives[0].health,192,'Archive damage persists between waves');
for(let tick=0;tick<32;tick++) {
  await advance(1250);
  await change(()=>horde.damageArchive('chancery',10000));
  assert.equal(horde.phase,'combat','Even losing one archive must not end the run');
}
assert.equal(horde.archives[0].health,0);
assert.ok(horde.archives.slice(1).every(archive=>archive.health===200));
for(let tick=0;tick<32&&horde.phase==='combat';tick++) {
  await advance(1250);
  await change(()=>{for(const archive of horde.archives) horde.damageArchive(archive.id,10000);});
  if(tick<20)assert.equal(horde.phase,'combat','Arriving enemies cannot instantly end archive defense');
}
assert.equal(horde.phase,'defeat'); assert.equal(horde.defeatReason,'archives');
assert.equal(horde.breachCount,0,'File defense loss is independent of tank hits');
assert.ok([...horde.posesRef.current.values()].every(p=>!p.active));
await change(()=>assert.equal(horde.damageArchive('chancery',12),false));
await change(()=>assert.equal(horde.retry(),true));
assert.equal(horde.defeatReason,null);
assert.ok(horde.archives.every(archive=>archive.health===archive.maxHealth),'Retry restores every archive');
assert.ok(horde.archives.every(archive=>archive.underAttackUntil===0&&archive.damageReadyAt===0),'Retry clears attack warnings and clocks');
await change(()=>horde.reset());await advance(20000);
assert.equal(horde.phase,'locked','Reset prevents a pending warning spawning later');

// A run can bank neither kits nor protection. The same encounter script picks
// different options after an identical round: a partial repair, a one-contact
// brace, or a spare hull plate. Only simulated encounter health ever changes.
for(const option of ['patch','brace','plate','skip']) {
  await change(()=>horde.begin('kit-'+option));await advance(10000);
  assert.equal(horde.spendKit('hull'),false,'Not available during combat');
  if(option==='patch'){
    await change(()=>horde.damageArchive('records',8));await advance(2250);
    await change(()=>horde.damageArchive('records',8));
    for(let n=0;n<3;n++){await advance(1250);await change(()=>horde.damageArchive('records',8));}
    assert.equal(horde.archives[1].health,168);
  }
  await change(()=>horde.damageZombies(horde.livingZombies.map(z=>z.id),1e6,'cannon'));
  assert.equal(horde.phase,'intermission');const until=horde.intermissionEndsAt;
  await change(()=>assert.equal(horde.spendKit('made-up-file'),false));
  if(option!=='skip') {
    const id=option==='plate'?'hull':'records';
    await change(()=>{
      assert.equal(horde.spendKit(id),true);assert.equal(horde.spendKit('chancery'),false);
    });
    assert.equal(horde.kit.type,option);assert.equal(horde.intermissionEndsAt,until);
  }
  await change(()=>{assert.equal(horde.beginNextWave(),true);assert.equal(horde.beginNextWave(),false);});
  assert.equal(horde.wave,2);assert.equal(horde.aliveCount,ZOMBIE_WAVES[2].count);assert.equal(horde.kit,null);
  if(option==='patch'){assert.equal(horde.archives[1].health,192);assert.equal(horde.protection,null);}
  if(option==='brace'){
    await change(()=>horde.damageArchive('records',8));assert.equal(horde.protection.spent,false,'An alarm cannot consume the brace');
    await advance(2250);
    await change(()=>{horde.damageArchive('records',8);horde.damageArchive('records',8);});
    assert.equal(horde.archives[1].health,200);assert.equal(horde.protection.spent,true);
    await advance(1250);await change(()=>horde.damageArchive('records',8));assert.equal(horde.archives[1].health,192);
  }
  if(option==='plate'){
    await change(()=>assert.equal(horde.registerBreach().accepted,false));
    assert.equal(horde.protection.spent,true);assert.equal(horde.breachCount,0);
    await change(()=>assert.equal(horde.registerBreach().accepted,true));assert.equal(horde.breachCount,1);
  }
  await change(()=>horde.damageZombies(horde.livingZombies.map(z=>z.id),1e6,'cannon'));
  assert.equal(horde.wave,2);assert.equal(horde.phase,'intermission');assert.equal(horde.protection,null);
  // Simulate a suspended browser delivering a click before its due callback.
  const deadline=horde.intermissionEndsAt;now=deadline;
  await change(()=>assert.equal(horde.spendKit('hull'),false));
  await advance(0);assert.equal(horde.wave,3);assert.equal(horde.aliveCount,ZOMBIE_MAX_ACTIVE);
  await change(()=>horde.reset());await advance(15000);
  assert.equal(horde.phase,'locked');assert.equal(horde.protection,null);assert.equal(horde.kit,null);
}
console.log('Field workshop: patch capped at +24, one-hit brace after windup, plate vs next horde breach, instant skip, 12s timeout, and no double spend or carryover passed.');
const moduleAt=async path=>import(await moduleURL(new URL(path,import.meta.url)));
const {createSimulatedCommands}=await moduleAt('../src/lib/tauri-commands.ts');
const {CAMPAIGN_ROOT,CAMPAIGN_FINALE}=await moduleAt('../src/lib/campaignFixtures.ts');
const {awardDefenseReplay,loadDefenseManifest}=await moduleAt('../src/lib/defenseManifest.ts');
const replayStorage=new Map();
globalThis.localStorage={setItem:(key,value)=>replayStorage.set(key,value),getItem:key=>replayStorage.get(key)??null};
const campaign={mode:'directory',directory:CAMPAIGN_ROOT};
assert.deepEqual(loadDefenseManifest(),[],'Fresh profile begins locked');
for(const session of [{mode:'training'}, {mode:'training',preview:'embassy'}, {mode:'horde'}, {mode:'cleanup'}])
  assert.equal(awardDefenseReplay(session,session,['practice.txt']),null,'Only the live campaign may grant a replay');
assert.equal(replayStorage.size,0);
assert.equal(awardDefenseReplay(campaign,{...campaign},['expired.txt']),null,'Stale callback from a prior campaign');
assert.equal(awardDefenseReplay(null,campaign,['expired.txt']),null,'Callback after exit');
replayStorage.set('tankdelete.virtual-defense.v1',JSON.stringify(['old-atlas.pdf']));
assert.deepEqual(loadDefenseManifest(),['old-atlas.pdf'],'Pre-radio earned unlock remains valid');
assert.equal(awardDefenseReplay(campaign,campaign,['../unsafe']),null);
assert.deepEqual(loadDefenseManifest(),['old-atlas.pdf'],'An empty/invalid award cannot wipe the earned replay');
for(const expected of [['old-atlas.pdf'],['old-atlas.pdf','readme.txt'],['old-atlas.pdf','archived-reel.mov','catalog.csv']]) {
  const drive=createSimulatedCommands(),oldMeshes=await drive.scanDirectory(CAMPAIGN_FINALE);
  const copy=oldMeshes.find(entry=>entry.safe_duplicate_of),originals=new Set([copy.safe_duplicate_of]);
  // Start simultaneous confirmations but do not await animation, or even their promises.
  const confirmations=oldMeshes.filter(entry=>!expected.includes(entry.name))
    .map(entry=>drive.moveToTrash(entry.path,entry.safe_duplicate_of));
  const names=drive.getDefenseFiles(originals);
  assert.deepEqual(names,expected,'Confirmed virtual trash cannot reappear as an archive');
  await Promise.all(confirmations);
  assert.deepEqual(awardDefenseReplay(campaign,campaign,names),expected);
  for(const files of [names,loadDefenseManifest()]) {
    assert.deepEqual(files,expected,'Earned replay retains the same fictional files');
    await change(()=>assert.ok(horde.begin('earned-replay',files.length)));
    const ids=['chancery','records','dispatch'].slice(0,files.length);
    assert.deepEqual(horde.archives.map(a=>a.id),ids);
    await advance(10000);
    for(let tick=0;tick<32&&horde.phase==='combat';tick++) {
      await advance(1250);
      await change(()=>horde.archives.forEach(a=>horde.damageArchive(a.id,8)));
    }
    assert.equal(horde.defeatReason,'archives','The loss condition counts only actual files');
    await change(()=>assert.ok(horde.retry()));
    assert.deepEqual(horde.archives.map(a=>a.id),ids,'Retry cannot create missing objectives');
    assert.ok(horde.archives.every(a=>a.health===a.maxHealth));
    await change(()=>horde.reset());
  }
}
await change(()=>assert.equal(horde.begin('empty',0),false,'An empty manifest cannot launch Horde'));
await change(()=>horde.begin('exit-objective'));
assert.ok(timers.size>0);await render(null);
assert.equal(timers.size,0,'Leaving the level cancels all encounter timers');
Date.now=originalDateNow;
console.log('Encounter lifecycle passed: all waves, protected boss allies survive, actual combat loss, victory, retry, reset and exit under StrictMode.');
