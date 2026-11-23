// Acceptance for the one-field CAMPAIGN (not a practice or inspection URL).
// Observe the mounted minimap, field actors and projection; all effects must
// come from trusted player inputs. No clocks, storage, camera or actors set.
import assert from 'node:assert/strict';

// Independent acceptance contract: do not derive the allowed files or the
// original bridge-road start from the production constants being exercised.
const FIELD_FILES=['atlas-preview.psd','relay-diagnostics.log','retired-textures.zip',
  'sector-map-copy.png','sector-map.png','simulator-replay.mov','training-schedule.pdf','weather-sample.wav'];
const names=rows=>rows.map(r=>r.name).sort();

export function observeField(verifySight=false) {
  const world=document.querySelector('canvas[data-engine]'),radar=document.querySelector('canvas[data-game-ui]');
  if(location.hostname!=='127.0.0.1'||location.search||'__TAURI_INTERNALS__' in window)throw Error('Expected isolated local simulation');
  if(!world||!radar)return null;
  let tank,p,root=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];
  while(root?.return)root=root.return;
  const path=[];
  const find=f=>{if(!f)return false;path.push(f);if(f.stateNode===radar)return true;
    for(let child=f.child;child;child=child.sibling)if(find(child))return true;
    path.pop();return false;};
  if(!find(root?.stateNode?.current))return null;
  for(const f of path.reverse()){
    if(f.memoizedProps?.tankStateRef&&f.memoizedProps?.fileBlocks)p??=f.memoizedProps;
    for(let h=f.memoizedState;h;h=h.next){const o=h.memoizedState?.current;if(o?.isGroup&&o.name==='player-tank')tank??=o;}
  }
  if(!tank||!p)return null;
  const {camera,scene}=tank.__r3f.root.getState(),r=world.getBoundingClientRect();
  const project=(x,z,y=0)=>{
    const q=tank.position.clone().set(x,y,z).project(camera),u=r.x+(q.x+1)*r.width/2,v=r.y+(1-q.y)*r.height/2;
    return {x:u,y:v,ok:Math.abs(q.z)<1&&u>0&&v>0&&u<innerWidth&&v<innerHeight&&document.elementFromPoint(u,v)===world};
  };
  const target=(id,x,z)=>({id,x,z,aim:project(x,z),range:Math.hypot(x-tank.position.x,z-tank.position.z)});
  const guard=scene.getObjectByName('rear-field-armored-guard'),wreck=scene.getObjectByName('rear-guard-turret'),
    brief=document.querySelector('.campaign-brief')?.textContent;
  if(!guard||!wreck||!brief)return null;
  const hut=scene.getObjectByName('rear-radio-hut'),landing=scene.getObjectByName('far-bank-fishing-landing');
  const shore=landing?.geometry.boundingSphere?.center;
  const files=p.fileBlocks.map(b=>({...target(b.position[0]+','+b.position[2],b.position[0],b.position[2]),objective:b.isObjective,marked:!!b.isMarked}));
  if(verifySight){
    // Napalm designates the FIRST surface under the pixel, not necessarily
    // the ground beneath a hut. Find an exposed point on the actual rendered
    // hut mesh. Only read the scene; the player's subsequent click does the
    // work. Do not touch R3F's pointer, shared raycaster, or collision hooks.
    const batches=[];scene.traverseVisible(n=>{if(n.userData.ghostHutSkin)batches.push(n);});
    const ray=new (tank.__r3f.root.getState().raycaster.constructor)();
    const objects=landing?[...batches,landing]:batches;
    for(const f of files){
      f.aim.ok=false;
      const entries=batches.flatMap(b=>b.userData.ghostHutSkin.entries);
      const entry=entries.find(e=>e.block.position[0]===f.x&&e.block.position[2]===f.z);
      if(!entry)continue;
      const block=entry.block;
      for(const h of [.88,.65,1.02,.43]){
        const y=block.position[1]+h*block.scale,a=project(f.x,f.z,y);
        if(!a.ok)continue;
        const dir=tank.position.clone().set(f.x,y,f.z).sub(camera.position).normalize();
        ray.set(camera.position,dir);
        const hit=ray.intersectObjects(objects,false)[0];
        if(hit?.object.userData.ghostHutSkin?.entries.some(e=>e.index===hit.instanceId&&e.block.path===block.path)
          &&Math.hypot(hit.point.x-f.x,hit.point.z-f.z)<2.5){
          f.aim=a;f.sightedFile=block.name;break;
        }
      }
    }
  }
  const tunnel=scene.getObjectByName('signal-tunnel-warning'),usedTunnel=scene.getObjectByName('spent-signal-hatch');
  return {tunnel:tunnel?target('live-hatch',tunnel.position.x,tunnel.position.z):null,
    spent:usedTunnel?target('spent-hatch',usedTunnel.position.x,usedTunnel.position.z):null,
    structures:{landing:shore?target('shelter',shore.x,shore.z):null,landingRuined:!!scene.getObjectByName('far-bank-landing-ruins'),
      radioHut:hut?target('mast-hut',hut.position.x,hut.position.z):null,radioRubble:scene.getObjectByName('rear-radio-collapsed-walls')?.visible},x:tank.position.x,z:tank.position.z,yaw:tank.rotation.y,id:tank.uuid,brief,
    hp:document.querySelector('.armor-status strong')?.textContent,radio:!!document.querySelector('.campaign-radio-action:not(:disabled)'),
    armed:!!document.querySelector('[aria-label="Armed file targets"]'),unlocked:localStorage.getItem('tankdelete.virtual-defense.v1'),
    guard:{...target('rear-guard',guard.position.x,guard.position.z),wreck:wreck.position.x<-.04},
    // File removal reindexes the radar list. Coordinates, unlike that old
    // ordinal, continue to identify the same physical plot across two hits.
    standing:Number(brief.match(/Structures standing:\s*(\d+)/)?.[1]??NaN),
    files,
    enemies:p.enemies.map(e=>{const o=scene.getObjectByName(e.id)??(e.id.endsWith('-0')?scene.getObjectByName('enemy-infantry-review'):null);
      if(!o?.visible)throw Error('Cannot observe live field infantry '+e.id);
      const xyz=o.getWorldPosition(tank.position.clone());return target(e.id,xyz.x,xyz.z);})};
}

export async function playVirtualCampaign({ev,button,click,key,waitFor,shot,sleep,log=()=>{}}){
  // Evidence from the ordinary field reads. Allies and area fire can retire
  // infantry the player never targets, so track IDs seen, not only shots.
  const observed=new Set(),warnings=new Set();
  const state=async(sight=false)=>{const until=Date.now()+85000;do{const s=await ev('('+observeField.toString()+')('+Boolean(sight)+')');if(s){
    const fresh=s.enemies.map(e=>e.id).filter(id=>!observed.has(id));for(const id of fresh)observed.add(id);
    if(fresh.length)log({observedInfantry:fresh,totalUniqueObserved:observed.size,order:s.brief});
    const warning=s.brief.match(/TUNNEL OPENING · wave (\d+)\/2/);
    if(warning&&!warnings.has(warning[1])){warnings.add(warning[1]);log({tunnelWarning:Number(warning[1]),order:s.brief});}
    return s;}await sleep(85);}while(Date.now()<until);throw Error('Mounted campaign field not available (radar / actors / cue).');};
  const tap=async k=>{await key('keyDown',k);await key('keyUp',k);};
  const byText=t=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(t)})`;
  const weapon=w=>button(`[...document.querySelectorAll('.weapon-selector button')].find(b=>b.textContent.includes(${JSON.stringify(w)}))`);
  const stages=[],shots=[],held=new Set(),started=Date.now();
  const checkpoint=(name,s)=>{const row={name,ms:Date.now()-started,x:s.x,z:s.z,yaw:s.yaw,infantry:s.enemies.length,guard:s.guard.wreck?'wreck':'active',armor:s.hp,standing:s.standing,order:s.brief};stages.push(row);log(row);};
  const hold=async(...codes)=>{
    for(const k of [...held])if(!codes.includes(k)){await key('keyUp',k);held.delete(k);}
    for(const k of codes)if(!held.has(k)){await key('keyDown',k);held.add(k);}
  };
  const manifest=async()=>{
    await button(byText('Field files'));
    await waitFor('field manifest',"!!document.querySelector('[aria-label=\"Field file manifest\"]')");
    const rows=await ev("[...document.querySelectorAll('.virtual-drive li')].map(l=>({name:l.querySelector('span').textContent,status:l.querySelector('small').textContent}))");
    assert.equal(await ev("!!document.querySelector('.virtual-drive li button')"),false,'Manifest must not contain folder portals');
    await button("document.querySelector('[aria-label=\"Close field files\"]')");return rows;
  };
  const dt=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const spawn=await state(),firstId=spawn.id;
  assert.ok(Math.hypot(spawn.x,spawn.z+12)<1e-5 && Math.abs(dt(spawn.yaw,Math.PI))<1e-5,
    'Unexpected ordinary-campaign bridge-road start: '+JSON.stringify([spawn.x,spawn.z,spawn.yaw]));
  assert.ok(spawn.enemies.length>0&&!spawn.guard.wreck&&!spawn.unlocked);
  checkpoint('spawn',spawn);
  let previous=spawn,maxObservedStep=0;
  const read=async(sight=false)=>{
    const s=await state(sight);assert.ok(s && s.id===firstId&&!s.unlocked,'Unexpected scene reset or early unlock');
    const step=Math.hypot(s.x-previous.x,s.z-previous.z);
    assert.ok(step<3,'Tank jumped between physical samples: '+JSON.stringify([[previous.x,previous.z],[s.x,s.z]]));
    previous=s;maxObservedStep=Math.max(maxObservedStep,step);
    assert.ok(Number.isInteger(s.standing)&&!s.radio,'Ordinary demolition objective must remain visible, without a radio action');
    return s;
  };
  const steer=async(s,x,z,forward=false)=>{
    const err=dt(Math.atan2(s.x-x,s.z-z),s.yaw);
    const keys=[];if(Math.abs(err)>.047)keys.push(err>0?'a':'d');if(forward&&Math.abs(err)<.23)keys.push('w');
    await hold(...keys);
  };
  const walk=async(x,z,until=1.25)=>{
    const end=Date.now()+33000,points=[];
    while(Date.now()<end){const s=await read();points.push([s.x,s.z]);
      if(Math.hypot(x-s.x,z-s.z)<until){await hold();return points;}
      await steer(s,x,z,true);await sleep(40);
    }
    throw Error('Drive stalled before '+JSON.stringify([x,z])+'; last '+JSON.stringify(points.at(-1)));
  };
  const face=async(get)=>{
    const end=Date.now()+15500;let target;
    while(Date.now()<end){const s=await read(true);target=get(s);if(!target)return null;
      if(target.aim.ok){
        await hold();
        // Longitudinal braking and the shoulder camera outlast the keyup;
        // wait for measured convergence even when the last caller released W.
        await sleep(150);const still=await read(true),fixed=get(still);if(!fixed)return null;
        if(fixed.id===target.id&&fixed.aim.ok&&Math.hypot(still.x-s.x,still.z-s.z)<.015
          &&Math.abs(dt(still.yaw,s.yaw))<.002&&Math.hypot(fixed.aim.x-target.aim.x,fixed.aim.y-target.aim.y)<.65)return fixed;
        continue;
      }
      await steer(s,target.x,target.z);await sleep(45);}
    throw Error('No clear screen point for '+JSON.stringify(target));
  };
  const readyButton="[...document.querySelectorAll('.weapon-selector button')].find(b=>b.textContent.includes('Napalm'))";
  const ready=()=>waitFor('napalm rearmed',`!!(${readyButton})&&!((${readyButton}).querySelector('small'))`,28000);
  async function designate(get,label){
    await ready();
    const t=await face(get);assert.ok(t,'Missing projected '+label);
    await click(t.aim);
    // A click intercepted by the HUD or cooldown is not a shot.
    await waitFor('accepted '+label+' designation',`!!(${readyButton})?.querySelector('small')`,3500);
    shots.push({type:'napalm',label,id:t.id,x:t.x,z:t.z,sightedFile:t.sightedFile,ms:Date.now()-started});log(shots.at(-1));
    return t;
  }
  const chooseFile=s=>{
    // Prefer an unobscured cluster far enough from the tank to fire safely.
    const score=t=>s.files.filter(o=>Math.hypot(o.x-t.x,o.z-t.z)<6).length*5+Number(t.aim.ok)*20+Math.min(t.range,35)*.04;
    const options=s.files.filter(t=>t.range>9);
    return options.sort((a,b)=>score(b)-score(a))[0]??s.files[0];
  };
  const nominations=[];
  async function purgeArmed(){
    const before=await manifest(),nominees=names(before.filter(r=>r.status==='Armed'));
    assert.ok(nominees.length&&nominees.every(n=>FIELD_FILES.includes(n)),'X requires named, armed fictional targets');
    await tap('x');await sleep(1300);
    const after=await manifest(),left=names(after);
    const removed=names(before).filter(n=>!left.includes(n));
    assert.deepEqual(removed,nominees,'X must remove exactly the nominated fictional files');
    nominations.push({via:'X',nominees,removed});
  }
  try{
    const initial=await manifest();assert.deepEqual(names(initial),FIELD_FILES);
    assert.ok(!initial.some(r=>r.status==='Armed')&&spawn.standing===10&&spawn.files.length===8);
    await shot('campaign-bridge-road-start');
    // The main road now points straight at the deck. This leg needs forward
    // input only: no sideways travel from the river art-preview turnout.
    const approach=await walk(0,2.5);
    assert.ok(approach.every(([x])=>Math.abs(x)<.2)&&approach.some(([,z])=>z>-8&&z<-3),
      'Did not physically follow the center road toward the bridge');
    checkpoint('center-road-to-bridge-lane',await read());
    await weapon('Napalm');
    const first=await designate(chooseFile,'first hit marks fictional file huts');
    await waitFor('visible arming feedback',"!!document.querySelector('[aria-label=\"Armed file targets\"]')",23000);
    const firstManifest=await manifest();assert.deepEqual(names(firstManifest),FIELD_FILES,'A first strike must not remove a file');
    const marked=names(firstManifest.filter(r=>r.status==='Armed'));
    assert.ok(marked.includes(first.sightedFile),'First hit must arm the sighted fictional filename: '+JSON.stringify({sighted:first.sightedFile,marked}));
    assert.ok(marked.length>0);const armed=await read();
    assert.ok(armed.files.some(b=>b.id===first.id&&b.marked),'The aimed physical plot must be armed');
    checkpoint('first-hit-marks-without-unlock',armed);
    // A second player attack, not a test deletion or a storage write, confirms
    // the marked plot. Subsequent files may also use the ordinary X batch key.
    await designate(s=>s.files.find(b=>b.id===first.id),'second hit confirms marked huts');
    await waitFor('field objective registered confirmed demolition',
      `Number(document.querySelector('.campaign-brief')?.textContent.match(/Structures standing:\\s*(\\d+)/)?.[1])<${armed.standing}`,27000);
    const remaining=await manifest(),confirmed=initial.map(r=>r.name).filter(n=>!remaining.some(r=>r.name===n));
    assert.ok(confirmed.length&&confirmed.every(n=>marked.includes(n)),'Second hit did not confirm an armed file');
    nominations.push({via:'second hit',nominees:marked,removed:confirmed});
    checkpoint('confirmed-huts-do-not-unlock-early',await read());

    const crossing=await walk(0,27);
    assert.ok(crossing.some(([x,z])=>Math.abs(x)<1.6&&z>15&&z<17.5),'Missed the actual bridge deck');
    assert.ok(crossing.every(([x,z],i)=>Math.abs(x)<2&&(!i||Math.hypot(x-crossing[i-1][0],z-crossing[i-1][1])<3)),'Tank jumped or bypassed the bridge');
    checkpoint('bridge-far-bank',await read());await shot('campaign-bridge-far-bank');

    // Demolition, not the number of remaining soldiers or the guard's HP, is
    // the objective. A real battle continues while the route works the field.
    for(let i=0;(await read()).files.length&&i<initial.length*3;i++){
      const before=await read();
      if(before.armed){await purgeArmed();continue;}
      await designate(chooseFile,'file hut');
      await ready();
      const markedField=await read();
      assert.equal(markedField.files.length,before.files.length,'A first hit removed an unnominated file');
      if(markedField.armed)await purgeArmed();
      const after=await read();log({confirmedFileCount:before.files.length-after.files.length,standing:after.standing});
      if(before.files.length===after.files.length&&i%3===2){
        // If a plot was obscured, reacquire the firing angle from the actual
        // lane. The continuity check rejects respawns and position jumps.
        await walk(0,after.z>20?25:0);
      }
    }
    assert.equal((await read()).files.length,0,'Some file huts are still standing');
    const final=await manifest();assert.deepEqual(final,[]);
    const removed=nominations.flatMap(event=>event.removed).sort();assert.deepEqual(removed,FIELD_FILES);
    checkpoint('all-file-huts-confirmed',await read());
    if(!(await read()).structures.landingRuined){
      await designate(s=>s.structures.landing,'riverside fishing shelter');
      await waitFor('riverside shelter visibly replaced by ruins',
        `!!((${observeField.toString()})())?.structures.landingRuined`,26000);
    }
    const beforeMast=await read();
    assert.ok(beforeMast.structures.landingRuined&&!beforeMast.structures.radioRubble&&beforeMast.standing===1,
      'The mast hut should be the last physical structure');
    checkpoint('only-mast-hut-standing',beforeMast);
    await shot('campaign-last-hut-objective');
    if(beforeMast.z<20)await walk(0,27);
    await walk(-28,30);
    const prior=await read();
    assert.ok(prior.standing===1&&!prior.radio&&!prior.unlocked&&
      Math.hypot(prior.x-prior.structures.radioHut.x,prior.z-prior.structures.radioHut.z)>6,
      'The final hit must not be made from the old mast interaction radius');
    checkpoint('last-structure-before-strike',prior);
    await designate(s=>s.structures.radioHut,'final rear mast hut');
    // No further inputs at all: observe the transition and the earned archive.
    await waitFor('automatic first embassy wave',"!!document.querySelector('.nightmare-order.is-combat')&&/Wave 1\\/4/i.test(document.querySelector('.nightmare-order').textContent)",52000);
    const archives=await ev("[...document.querySelectorAll('.embassy-file-health span')].map(e=>e.textContent.split(' · ').at(-1))");
    assert.deepEqual(archives,['outpost-radio-transcript.txt']);
    assert.deepEqual(await ev("JSON.parse(localStorage.getItem('tankdelete.virtual-defense.v1'))"),archives);
    await shot('campaign-earned-defense');
    return {stages,shots,initial,confirmed,nominations,removed,final,archives,allBuildingsDemolished:true,
      route:{approach,crossing,maxObservedStep},observedInfantry:[...observed],tunnelWarnings:[...warnings],
      inputsAfterFinalDesignation:0,progression:'Same tank crossed the bridge, confirmed fictional file huts, destroyed the riverside shelter and rear mast hut, then automatically entered Wave 1 without F or a proximity interaction.'};
  }finally{await hold();}
}
