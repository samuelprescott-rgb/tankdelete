// Mounted campaign progression. No WebGL, camera, real disk, or product test API.
// Use node scripts/check-field-session.mjs from the game checkout.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import * as THREE from 'three';
import {act, reconciler} from '@react-three/fiber';
import {build} from 'vite';

const dir=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const el=React.createElement;
const observations=new Map(), controls=new Map(), frames=new Set();
const noop=()=>{}, quiet=new Proxy({}, {get:()=>noop});

// Render the actual session and manifest. Native presentation elements need no
// host surface: keep their controls and mount their children with React.
function Host({tag,model,children}) {
  const token=React.useRef({});
  React.useLayoutEffect(()=>{
    if(tag!=='button' && tag!=='section')return;
    controls.set(token.current,model);
    return ()=>{controls.delete(token.current);};
  },[tag,model]);
  return React.Children.toArray(children).filter(React.isValidElement);
}
globalThis.fieldSessionElement=(type,props,...children)=>typeof type==='string'
  ? el(Host,{tag:type,key:props?.key,model:{...props,children}},...children)
  : el(type,props,...children);
globalThis.fieldSessionAdapters={
  quiet, toast:Object.assign(noop,{success:noop,error:noop}),
  useFrame(callback){
    const current=React.useRef(callback);current.current=callback;
    React.useLayoutEffect(()=>{frames.add(current);return ()=>{frames.delete(current);};},[]);
  },
  component(name){
    return function Presentation(props) {
      const token=React.useRef({});
      React.useLayoutEffect(()=>{
        observations.set(name,{props,token:token.current});
        return ()=>{observations.delete(name);};
      },[props]);
      if(name==='Tank'){
        const [tank]=React.useState(()=>{
          const group=new THREE.Group();group.position.set(...props.initialPosition);return group;
        });
        React.useImperativeHandle(props.ref,()=>tank,[tank]);
      }
      return name==='Scene'||name==='KeyboardControls'?props.children:null;
    };
  },
};

// Isolate only audio and presentation. File commands, layout, combat state,
// radio range/guard frame logic and the entire epilogue hook stay production.
const entry=dir+'/virtual-field-session.mjs';
const stub=(name)=>'\0field-test:'+name;
const componentSource=name=>'export const '+name+'=globalThis.fieldSessionAdapters.component('+JSON.stringify(name)+');';
const plugin={name:'mounted-field',enforce:'pre',resolveId(id,importer){
  if(id===entry)return id;
  if(importer?.endsWith('/RearFieldEncounter.tsx')||importer?.endsWith('/CampaignTunnels.tsx')){
    if(id==='@react-three/fiber')return stub('frame');
    if(id==='./RearFieldStronghold')return stub('RearFieldStronghold');
  }
  if(!importer?.endsWith('/GameSession.tsx'))return;
  if(id==='react-hot-toast')return stub('toast');
  if(id==='@react-three/drei')return stub('drei');
  const name=id.split('/').at(-1);
  if(id.startsWith('./components/') && /^[A-Z]/.test(name)
    && !['VirtualDrivePanel','RearFieldEncounter','CampaignTunnels'].includes(name))return stub(name);
  if(['useGameAudio','useZombieAmbience','useBossVoice'].includes(name))return stub(name);
},load(id){
  if(id===entry)return [
    "export {default as GameSession} from './src/GameSession.tsx'",
    "export {commands,CAMPAIGN_ROOT} from './src/lib/tauri-commands'",
    "export {REAR_RADIO} from './src/lib/rearStronghold'",
    "export {RIVER_CROSSING_Z,createRiverCrossings} from './src/components/Scene/riverLayout'",
    "export {ZOMBIE_WARNING_MS} from './src/lib/zombieEpilogue'",
  ].join(';');
  if(!id.startsWith(stub('')))return;
  const name=id.slice(stub('').length);
  // These modules also export state factories and hit handlers used by the
  // session. Keep those real; replace only their WebGL components.
  if(['UndeadDeathMarks','InfantryContactArt','CharacterFires'].includes(name)){
    return componentSource(name)+'export * from '+JSON.stringify(dir+'/src/components/Scene/'+name+'.tsx')+';';
  }
  if(name==='VietnamEnvironment')return 'export const CRASHED_HUEY_TRANSFORM={position:[-9,0,-17],rotation:[0,.18,0]}';
  if(name==='drei')return componentSource('Html')+componentSource('KeyboardControls');
  if(name==='toast')return 'export default globalThis.fieldSessionAdapters.toast';
  if(name==='frame')return 'export const useFrame=globalThis.fieldSessionAdapters.useFrame';
  if(name.startsWith('use'))return 'export const '+name+'=()=>globalThis.fieldSessionAdapters.quiet';
  return componentSource(name);
}};
const bundled=await build({root:dir,configFile:false,logLevel:'silent',publicDir:false,plugins:[plugin],
  esbuild:{jsx:'transform',jsxFactory:'globalThis.fieldSessionElement'},build:{ssr:entry,write:false}});
const source=bundled.output.find(c=>c.isEntry).code.replace(/from "([^"]+)"/g,
  (_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const game=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const timers=new Map();let now=0,nextTimer=0;
globalThis.window=Object.assign(new EventTarget(),{location:{search:''},
  setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},
  clearTimeout:id=>timers.delete(id)});
const store={getState:()=>({scene:new THREE.Scene(),internal:{active:false,frames:0},invalidate(){}})};
const fail=e=>{throw e;}, root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const render=node=>act(async()=>{reconciler.updateContainer(node,root,null,null);});
const change=fn=>act(async()=>{await fn();});
const see=name=>{const mounted=observations.get(name);assert.ok(mounted,name+' must be mounted');return mounted;};
const props=name=>see(name).props;
const findControl=filter=>{const match=[...controls.values()].filter(filter);assert.equal(match.length,1,'Expected one matching control');return match[0];};
const key=(init={})=>window.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code:'KeyF',key:'f',...init}));
const shoot={kind:'cannon',triggerId:1};
function frame(){for(const ref of frames)ref.current({},1/60);}
async function trash(path,{finish=true}={}){
  const hit=()=>props('ProjectileManager').onHit(path,shoot);
  await change(hit);
  assert.ok(props('FileBlocks').markedFiles.has(path),'First round arms '+path);
  await change(hit);
  assert.ok(props('FileBlocks').deletingFiles.has(path),'Second round confirms '+path);
  if(finish)await change(()=>props('FileBlocks').onDeletionComplete(path));
}

async function exercise(guardFirst) {
  game.commands.resetSession();
  const original=(await game.commands.scanDirectory(game.CAMPAIGN_ROOT)).filter(f=>!f.is_dir);
  assert.ok(original.length>3);
  const awards=[],launch={mode:'directory',directory:game.CAMPAIGN_ROOT};
  const scores={score:0,addPoints:()=>1,removePoints:noop};
  function Campaign(){
    const [files,setFiles]=React.useState([]);
    return el(game.GameSession,{launch,defenseFiles:files,onUnlockDefense(names){awards.push([...names]);setFiles(names);},
      fieldRadio:quiet,worldGunBank:null,settings:{},settingsOpen:false,scoreState:scores,
      onExit:()=>assert.fail('Campaign exited unexpectedly'),onReviewCleanup:()=>assert.fail('Entered cleanup desk')});
  }
  await render(el(Campaign));
  const scene=see('Scene').token,tank=props('Scene').tankRef.current;
  assert.deepEqual(props('Tank').initialPosition,[0,0,-12],'Start Campaign deploys on the original center road, not at the art-preview turnout');
  assert.equal(props('Tank').initialHeading??Math.PI,Math.PI,'The hull faces the main bridge along +Z');
  if(!guardFirst){
    const deployed=props('Tank').initialPosition;
    await change(()=>props('VietCongCombatants').onTankHit({damage:100,position:new THREE.Vector3(2,1,-10)}));
    assert.equal(props('VietCongCombatants').tankTargetEnabled,false,'Hull disabled before recovery');
    await change(()=>{
      now+=2200;
      for(const [id,t] of timers)if(t.at<=now && timers.delete(id))t.fn();
    });
    assert.equal(props('VietCongCombatants').tankTargetEnabled,true,'Hull recovered');
    assert.notEqual(props('Tank').initialPosition,deployed,'Recovery issues a fresh transform to reset the tank');
    assert.deepEqual(props('Tank').initialPosition,[0,0,-12]);
    assert.equal(props('Tank').initialHeading??Math.PI,Math.PI);
  }
  async function position(x,z){await change(()=>{tank.position.set(x,0,z);frame();});}
  function sameWorld(){
    assert.equal(see('Scene').token,scene,'One mounted world on both banks');
    assert.equal(props('Scene').tankRef.current,tank,'Tank was not respawned');
    assert.equal(props('Scene').rearOutpost,true,'Crossing did not enter a different arena');
    assert.deepEqual(props('Minimap').folderPortals,[],'The crossing is not a folder portal');
    assert.equal(props('Minimap').backPortalPosition,null);
  }
  function locked(why){
    assert.equal(props('HUD').bonusPhase,'locked',why);
    assert.equal(observations.has('EmbassyDefense'),false,why);
    assert.equal(awards.length,0,why);
  }
  const infantry=props('ProjectileManager').enemies.map(e=>e.id);
  assert.equal(infantry.length,12,'Opening formation');
  assert.equal(props('HUD').hostileCount,infantry.length+1,'HUD counts deployed infantry and the guard, not future relief');
  for(const z of [game.RIVER_CROSSING_Z-2,game.RIVER_CROSSING_Z,game.RIVER_CROSSING_Z+2]){
    await position(0,z);sameWorld();
  }
  const manifest=()=>findControl(p=>p.children.includes('Field files')).onClick();
  const closeManifest=()=>findControl(p=>p['aria-label']==='Close field files').onClick();
  await change(manifest);
  findControl(p=>p['aria-label']==='Field file manifest');
  assert.equal(props('Tank').disabled,true);
  await change(closeManifest);
  sameWorld();assert.equal(tank.position.z,game.RIVER_CROSSING_Z+2);
  assert.deepEqual(props('ProjectileManager').enemies.map(e=>e.id),infantry);
  assert.deepEqual(props('ProjectileManager').allBlocks.map(b=>b.path).sort(),original.map(f=>f.path).sort());

  const bridge=game.createRiverCrossings(props('TankTreadImprints').river).find(b=>b.kind==='bridge');
  const exit=bridge.z+bridge.length/2,gp=props('Tank').rearGuardPoseRef.current;
  const gap=()=>Math.hypot(gp.x-tank.position.x,gp.z-tank.position.z);
  await position(bridge.centerX,exit-.05);
  assert.doesNotMatch(props('HUD').campaignBrief,/Guard tank active/);
  await position(bridge.centerX,exit+.05);
  const startGap=gap();assert.ok(startGap>27,'Bridge is well outside the original firing range');
  assert.match(props('HUD').campaignBrief,/Guard tank active/,'Spotted on the crossing frame');
  // Case B follows the ordinary W-only drive: continue beyond the last plank,
  // stop on the central road at Z30, and never rotate to hunt for the guard.
  await change(()=>{for(let i=0;i<300;i++){
    if(guardFirst)tank.position.z=Math.min(30,tank.position.z+8/60);
    frame();
  }});
  const fiveSecondGap=gap();
  assert.ok(startGap-fiveSecondGap>10,'Live guard approaches the occupied bridge, not a faster lap of its patrol');
  if(guardFirst)assert.ok(Math.abs(gp.x-tank.position.x)<8&&gp.z>tank.position.z+5,
    'First pass comes into the forward road view, not a stationary offscreen warning from the west flank');
  await change(()=>{for(let i=0;i<540;i++)frame();});
  assert.ok(gap()<19,'Guard found a reachable firing lane with the original village buildings standing');
  if(guardFirst)assert.ok(props('HUD').tankIntegrity<100,'Guard fired from its new pose at the player holding the exit');
  if(guardFirst)console.log('Mounted bridge encounter: exit Z, initial / 5s / 14s separation, 14s hull integrity',
    ...[exit,startGap,fiveSecondGap,gap(),props('HUD').tankIntegrity].map(n=>+n.toFixed(2)));
  locked('Guard pursuit alone never unlocks the embassy');

  await position(game.REAR_RADIO[0],game.REAR_RADIO[2]);
  assert.equal(props('HUD').campaignRadio,undefined,'No actionable radio prompt yet');
  await change(key);locked('In-range F with uncleared field');
  const pm=()=>props('ProjectileManager');
  const down=async target=>change(()=>{for(let i=0;i<2;i++)pm()[target](shoot);});
  // Case A: defeat the patrols first; keep a file dissolving until the last
  // frame. Case B: leave the armored guard and all reserves alive; hit the
  // shelter last, away from the mast. Neither F nor proximity is required.
  await position(0,game.RIVER_CROSSING_Z-5);
  if(!guardFirst){
    await change(()=>{for(let i=0;i<3;i++)pm().onRearGuardHit(shoot);});
    const seen=new Set();
    const clear=async()=>change(()=>{for(const e of pm().enemies){seen.add(e.id);pm().onEnemyHit(e.id,shoot);}});
    await clear();
    for(let batch=1;batch<=2;batch++){
      const advance=n=>change(()=>{for(let i=0;i<n;i++)frame();});
      await advance(65);assert.match(props('HUD').campaignBrief,/TUNNEL OPENING/);
      await change(manifest);await advance(320);assert.equal(pm().enemies.length,0);
      await change(closeManifest);await advance(247);
      assert.equal(pm().enemies.length,1,'The first reinforcement emerges alone');
      await advance(180);
      assert.equal(pm().enemies.length,6,'The rest of the squad follows at intervals');await clear();
    }
    assert.equal(seen.size,24);await change(key);locked('Killing every hostile never substitutes for demolition');
  }
  await down('onRearHutHit');if(!guardFirst) await down('onSceneryHit');
  const last=original.at(-1).path;
  for(const f of original){
    if(!guardFirst&&f.path===last){
      // Previously the last enemy plus F at this receiver unlocked Horde.
      // Satisfy EVERY old condition, with both physical structures in ruins
      // and only one unmarked simulated file actually left in the manifest.
      const remaining=(await game.commands.scanDirectory(game.CAMPAIGN_ROOT)).filter(f=>!f.is_dir);
      assert.deepEqual(remaining.map(f=>f.path),[last]);
      assert.equal(props('FileBlocks').markedFiles.has(last),false);
      assert.equal(props('FileBlocks').deletingFiles.has(last),false);
      assert.equal(props('HUD').hostileCount,0);
      await position(game.REAR_RADIO[0],game.REAR_RADIO[2]);await change(key);
      locked('Cleared guard, both ruins, no hostiles and F at the receiver cannot substitute for even one standing file');
      await position(0,game.RIVER_CROSSING_Z-5);
    }
    await trash(f.path,{finish:guardFirst||f.path!==last});
  }
  locked(guardFirst?'Shelter still standing':'Last file is still in its de-rez animation');
  assert.equal(props('HUD').campaignRadio,undefined);
  if(guardFirst){
    await change(manifest);await down('onSceneryHit');
    locked('Do not change scenes behind a modal');
    await change(closeManifest);
  }else await change(()=>props('FileBlocks').onDeletionComplete(last));
  const expected=['outpost-radio-transcript.txt'];
  assert.equal(props('FieldCurtain').stage,'covering');
  locked('The field stays active until the transition covers it');
  await change(()=>props('FieldCurtain').onCovered());
  assert.equal(props('FieldCurtain').stage,'covered');
  assert.deepEqual(awards,[expected]);
  assert.equal(props('HUD').bonusPhase,'warning');
  const archives=props('EmbassyDefense').archives, labeled=props('HUD').defenseArchives;
  assert.equal(archives.length,expected.length);
  assert.deepEqual(labeled.map(a=>a.id),archives.map(a=>a.id),'HUD labels belong to the defended archives');
  assert.deepEqual(labeled.map(a=>a.label),archives.map((a,i)=>a.label+' · '+expected[i]));
  await change(()=>props('Scene').onReady());
  assert.equal(props('FieldCurtain').stage,'revealing');
  await change(()=>props('FieldCurtain').onRevealed());
  assert.equal(observations.has('FieldCurtain'),false);
  await change(()=>{
    key();now+=game.ZOMBIE_WARNING_MS;
    for(const [id,t] of timers)if(t.at<=now && timers.delete(id))t.fn();
  });
  assert.equal(props('HUD').bonusPhase,'combat');assert.equal(props('HUD').bonusWave,1);
  assert.ok(props('ZombieHorde').zombies.length>0);
  assert.deepEqual(awards,[expected],'A repeated activation cannot award again');
  await render(null);
  assert.equal(timers.size,0);assert.equal(frames.size,0);assert.equal(observations.size,0);assert.equal(controls.size,0);
  return expected;
}
const survivors=await exercise(false),transcript=await exercise(true);
console.log('PASS: all building orders, file de-rez, live or defeated guards, paused manifest, no F/range requirement, one automatic unlock and Wave 1.',survivors,transcript);
