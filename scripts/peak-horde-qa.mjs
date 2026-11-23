// Integration for capture-production-qa. Requires explicitly verified local virtual play;
// cannot run on the splash screen, in a native game, or against a user's directory.
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';

// Executed in the browser. No renderer/camera/clock writes. The optional stress fixture
// invokes *only* the mounted virtual ally-hit callback on waves 1 and 2, never wave 3.
export function installPeakProbe() {
  const requireVirtual=()=>{
    if(!['127.0.0.1','localhost'].includes(location.hostname)||'__TAURI_INTERNALS__' in window
      ||document.querySelector('.training-badge')?.textContent.trim()!=='Simulation'
      ||!/Embassy defense/.test(document.querySelector('.header h2')?.textContent??''))
      throw Error('Peak route requires local browser-only virtual embassy defense');
  };
  requireVirtual();
  const radar=document.querySelector('canvas[data-game-ui]');
  const key=Object.keys(radar).find(k=>k.startsWith('__reactFiber$'));
  const container=document.querySelector('.scene-container');
  const propKey=Object.keys(container).find(k=>k.startsWith('__reactProps$'));
  let tank;
  for(let f=radar[key];f&&!tank;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    if(h.memoizedState?.current?.name==='player-tank'){tank=h.memoizedState.current;break;}
  }
  const state=tank?.__r3f?.root?.getState();
  const canvas=document.querySelector('canvas[data-engine]');
  if(!state||state.gl.domElement!==canvas)throw Error('Actual game canvas not mounted');
  const heads=state.scene.getObjectByName('nightmare-undead-heads');
  if(!heads?.isInstancedMesh)throw Error('Mounted standard horde head instances unavailable');
  const capacity=heads.instanceMatrix.count;
  // Independent release contract: a stale 16-slot renderer must not lower
  // the benchmark just by reporting its own, smaller physical capacity.
  if(capacity!==22)throw Error('Expected 22 physical actor slots for the expanded encounter; mounted '+capacity);
  const m=heads.matrix.clone(),point=tank.position.clone(),v=point.clone();
  const round=n=>+n.toFixed(2);
  const ui=()=>{
    const panel=document.querySelector('.nightmare-order');
    return {phase:panel?.className.match(/is-(combat|defeat|victory|warning|intermission)/)?.[1],
      wave:Number(panel?.innerText.match(/wave\s+(\d)\s*\//i)?.[1])||0};
  };
  // A pool's .count is the roster size, including hidden/dead slots. Its non-degenerate
  // transforms are the real emerged actors actually submitted by the renderer.
  let slotMask=0;
  function active(aim=false) {
    let n=0,candidate=null,nearest=Infinity;slotMask=0;
    for(let o=heads;o;o=o.parent)if(!o.visible)return aim?null:0;
    for(let i=0;i<heads.count;i++){
      heads.getMatrixAt(i,m);
      if(Math.abs(m.determinant())<1e-9)continue;
      n++;if(i<32)slotMask|=1<<i;
      if(!aim)continue;
      point.setFromMatrixPosition(m); heads.localToWorld(point); point.y=0;
      const d=point.distanceToSquared(tank.position);
      if(d>=nearest)continue;
      v.copy(point).project(state.camera);
      if(v.z<=-1||v.z>=1||Math.abs(v.x)>.97||Math.abs(v.y)>.95)continue;
      const r=canvas.getBoundingClientRect(),x=r.left+(1+v.x)*r.width*.5,y=r.top+(1-v.y)*r.height*.5;
      if(document.elementFromPoint(x,y)!==canvas)continue;
      nearest=d;candidate={x,y};
    }
    return aim?candidate:n;
  }
  function infantry() {
    function walk(element) {
      if(!element)return;
      if(Array.isArray(element)){for(const item of element){const p=walk(item);if(p)return p;}return;}
      const p=element.props;
      if(p?.onZombieHit&&p.friendlies&&p.zombiePosesRef&&p.zombies)return p;
      return walk(p?.children);
    }
    const p=walk(container[propKey]?.children);
    if(!p)throw Error('Cannot locate mounted virtual infantry hit callback');
    return p;
  }
  function fixtureClear(requested) {
    requireVirtual(); const {wave,phase}=ui();
    if(phase!=='combat'||![1,2].includes(wave)||requested!==wave)return 0;
    const p=infantry();let count=0;
    for(const z of p.zombies) {
      const pose=p.zombiePosesRef.current.get(z.id);
      if(z.wave!==wave||!z.alive||!pose?.active||z.archetype!=='standard')continue;
      p.onZombieHit({soldierId:'benchmark-stager',zombieId:z.id,position:pose.position.clone(),damage:z.health});
      count++;
    }
    return count;
  }
  let sampling=false,done=null,identities=[];
  const arm=(verifySlots=false,markFirst=null)=>{
    if(sampling||done)return;
    const p=infantry();
    identities=p.zombies.filter(z=>z.wave===3&&z.archetype==='standard').map(z=>z.id);
    if(identities.length!==capacity||new Set(identities).size!==capacity||identities.some(id=>!id||!p.zombiePosesRef.current.has(id)))
      throw Error('Wave 3 does not actually contain the 22 distinct actor identities');
    sampling=true;const frames=[]; let last=null;let first;
    function frame(t) {
      const n=active();
      if(last===null&&n!==capacity){requestAnimationFrame(frame);return;}
      if(first===undefined){first=t;markFirst?.(t);}
      const row=[round(t-first),last===null?null:round(t-last),n,canvas.width,canvas.height,document.hidden];
      if(verifySlots)row.push(slotMask>>>0);
      frames.push(row);
      if(t-first<7000){last=t;requestAnimationFrame(frame);}
      else {done=frames;sampling=false;}
    }
    requestAnimationFrame(frame);
  };
  window.__peakHorde={ui,active,fixtureClear,arm,get frames(){return done;},get identities(){return identities;},
    batch(){return {name:heads.name,uuid:heads.uuid,capacity:heads.instanceMatrix.count,
      stillMounted:state.scene.getObjectByName(heads.name)===heads,frustumCulled:heads.frustumCulled};},
    status(){return {...ui(),active:active(),aim:active(true)};}};
}

export async function capturePeakHorde({ev, mouse, shot, width, height, setup='controls'}) {
  if(!['controls','fixture'].includes(setup))throw Error('Unsupported peak setup mode');
  await ev('('+installPeakProbe.toString()+')()');
  const capacity=await ev('window.__peakHorde.batch().capacity');
  const result={setup:setup==='fixture'?'STRESS FIXTURE: waves 1/2 staged through mounted ally damage; untouched wave 3':'Projected aiming with ordinary trusted pointer input',
    capacity,windowMs:7000,openingHits:0,openingInputs:0,route:[],peakVerified:false};
  let lastShot=0,armed=false;
  const deadline=Date.now()+ (setup==='fixture'?90000:200000);
  while(Date.now()<deadline) {
    const p=await ev('window.__peakHorde.status()');
    if(result.route.at(-1)?.phase!==p.phase||result.route.at(-1)?.wave!==p.wave)
      result.route.push({phase:p.phase,wave:p.wave,active:p.active});
    if(['defeat','victory'].includes(p.phase))throw Error('Peak setup reached '+p.phase+' before measurement: '+JSON.stringify(result));
    if(p.phase==='combat'&&p.wave===3){
      await ev('window.__peakHorde.arm(true)');armed=true;break;
    }
    if(p.phase==='combat'&&[1,2].includes(p.wave)){
      if(setup==='fixture')result.openingHits+=await ev('window.__peakHorde.fixtureClear('+p.wave+')');
      else if(p.aim&&Date.now()-lastShot>=1050){
        await mouse('mouseMoved',p.aim.x,p.aim.y);await sleep(50);
        await mouse('mousePressed',p.aim.x,p.aim.y);await mouse('mouseReleased',p.aim.x,p.aim.y);
        result.openingInputs++;lastShot=Date.now();
      }
    }
    await sleep(175);
  }
  assert.ok(armed,'Never reached actual wave 3: '+JSON.stringify(result));
  // No timing-contaminating screenshots or combat/gameplay changes during the measured window.
  const limit=Date.now()+26000;
  let frames;
  while(Date.now()<limit){if(await ev('!!window.__peakHorde.frames')){frames=await ev('window.__peakHorde.frames');break;}await sleep(250);}
  assert.ok(frames,'Wave 3 never reached the mounted '+capacity+'-actor cap for measurement');
  const d=frames.slice(1).map(f=>f[1]).sort((a,b)=>a-b);
  const q=p=>d[Math.ceil(d.length*p)-1], all=frames.map(f=>f[2]);
  const ends=new Map();let atCap=0;
  for(let i=1;i<frames.length;i++){
    const [_,dt,n,w,h]=frames[i];const key=w+'x'+h;ends.set(key,(ends.get(key)??0)+1);
    if(n===capacity&&frames[i-1][2]===capacity)atCap+=dt;
  }
  const duration=frames.at(-1)[0];
  Object.assign(result,{peakVerified:all[0]===capacity&&Math.max(...all)===capacity,entireWindowAtCap:frames.every(f=>f[2]===capacity&&f[6]===2**capacity-1),
    atCapMs:Math.round(atCap),minActive:Math.min(...all),maxActive:Math.max(...all),resolutionHistogram:Object.fromEntries(ends),
    fullResolution:frames.every(f=>f[3]===width&&f[4]===height),foreground:frames.every(f=>!f[5]),
    timing:{durationMs:duration,samples:d.length,effectiveHz:d.length*1000/duration,p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),maxMs:q(1)},
    frames});
  assert.ok(result.peakVerified&&result.foreground,'Invalid peak: '+JSON.stringify(result.timing));
  result.photoState=await ev('window.__peakHorde.status()');
  result.identities=await ev('window.__peakHorde.identities');
  await shot('wave-three-after-timed-window');
  return result;
}
