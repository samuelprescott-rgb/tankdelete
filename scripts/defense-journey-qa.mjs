// Production acceptance, not a balance model: a scripted player may read
// actor projections but only native browser input can affect the live game.
// No spawn helpers, fixture waves, direct damage, timescale or camera edits.
import {setTimeout as sleep} from 'node:timers/promises';
import {inspectRookFilm} from './qa-rook-film.mjs';

export async function playDefenseJourney({ev,state,button,move,click,key,shot,policy,width,height}){
  if(!['defend','watch','relief'].includes(policy))throw Error('Unknown simulated defense policy');
  const sandbox=await ev(`location.hostname==='127.0.0.1'&&!location.search&&!('__TAURI_INTERNALS__' in window)&&
    document.querySelector('.training-badge')?.textContent==='Simulation'`);
  if(!sandbox)throw Error('Not an isolated fictional browser game');
  const began=performance.now(),phases=[],shots=[],points=[],kits=[],relief=[];
  const reliefCaptured=new Set();
  const shooters=new Set(),seenAtSill=new Set(),sustained=new Map();
  let previousAirY=null,parked=null;
  let sawIntro=false,clearSince=null;
  const rejectedFilm=[];
  // Wall-clock observation cap only. No game clock/tuning or input policy
  // change. Some legitimate four-wave routes take over 155s end-to-end.
  const observationLimitMs=policy==='watch'?155000:240000;
  let prev='',lastShot=-5000,lastPoint=-5000,hold=null,lastEagle=-20000,watching=null;
  const press=async(letter)=>{if(hold===letter)return;if(hold)await key('keyUp',hold);hold=letter;if(hold)await key('keyDown',hold);};
  const steerTo=async(t,x,z,advance=false)=>{
    const yaw=Math.atan2(t.x-x,t.z-z),d=Math.atan2(Math.sin(yaw-t.rotationY),Math.cos(yaw-t.rotationY));
    await press(Math.abs(d)>.10?(d>0?'a':'d'):advance?'w':null);
  };
  let outcome='limit';
  try{
    while(performance.now()-began<observationLimitMs){
      const ms=Math.round(performance.now()-began);
      const hud=await ev(`(()=>{const order=document.querySelector('.nightmare-order'),kind=[...order.classList].find(c=>c.startsWith('is-'))?.slice(3);
        const text=order.querySelector('.mission-order-heading strong')?.textContent||'',wave=Number((text.match(/(?:Wave )?(\\d+)\\/\\d+/i)||[])[1]);
        return {kind,wave,armour:document.querySelector('.armor-status strong')?.textContent,
          command:document.querySelector('.nightmare-boss-health strong')?.textContent??null,
          allies:[...document.querySelectorAll('.boss-ally')].map(e=>[e.querySelector('strong')?.textContent,e.querySelector('.boss-ally-value')?.textContent]),
          files:[...document.querySelectorAll('.embassy-file-health meter')].map(m=>m.value),eagle:!!document.querySelector('button[aria-label="Arm Eagle Strafe target designator"]:not(:disabled)'),
          buffer:[document.querySelector('canvas[data-engine]').width,document.querySelector('canvas[data-engine]').height],hidden:document.hidden};})()`);
      if(hud.hidden||hud.buffer[0]!==width||hud.buffer[1]!==height)throw Error('Journey paused or resolution changed');
      const stage=hud.kind+':'+hud.wave;
      if(stage!==prev){prev=stage;phases.push({ms,...hud});await shot('journey-'+policy+'-'+phases.length+'-'+hud.kind);}
      if(lastPoint+700<=ms){points.push({ms,...hud});lastPoint=ms;}
      if(['victory','defeat'].includes(hud.kind)){outcome=hud.kind;break;}
      if(hud.kind==='intermission' && policy!=='watch'){
        await press(null);
        const panel="document.querySelector('[aria-label=\"Between-wave field kit\"]')";
        if(!await ev(`!!${panel}`))throw Error('Next-wave field workshop was not offered');
        // This policy prioritizes a damaged file, else covers a healthy file
        // or the hull on alternating breaks. No calls to game hooks.
        const choice=`(()=>{const choices=[...(${panel}).querySelectorAll('.field-kit__choices button')];return choices.find(b=>b.textContent.includes('Patch ·'))||choices[${hud.wave%2===0?1:0}]||choices[0]})()`;
        const selected=await ev(`(${choice})?.textContent`);
        if(!selected)throw Error('Workshop has no usable choice');
        await button(choice);
        const confirmation=await ev(`(${panel}).querySelector('[role="status"]')?.textContent`);
        if(!confirmation)throw Error('Field kit click was not acknowledged');
        kits.push({afterWave:hud.wave,selected,confirmation});
        await shot('journey-field-kit-'+hud.wave);
        if(policy==='relief'&&hud.wave===1){
          // Take up a viewing spot at normal tank speed during the actual
          // workshop. A+D and W only; no camera writes or test teleports.
          const deadline=performance.now()+8300;
          while(performance.now()<deadline && await ev(`!!${panel}`)){
            const {tank,relief:{verge}}=await state();
            if(Math.hypot(tank.x+14,tank.z+11.5)<1.75){await steerTo(tank,verge[0],verge[2]);if(!hold)break;}
            else await steerTo(tank,-14,-11.5,true);
            await sleep(65);
          }
          await press(null);
        }
        if(await ev(`!!${panel}`))await button(`(${panel}).querySelector('.field-kit__proceed')`);
        await sleep(160);
        continue;
      }
      if(hud.kind!=='combat'||policy==='watch'){await press(null);await sleep(160);continue;}
      const s=await state(),actors=s.zombies;
      if(policy==='relief'&&hud.wave===2){
        const {air,passengers,deployed,photo}=s.relief;
        sawIntro ||= photo?.title?.mounted===true;
        clearSince=photo?.title.clear&&sawIntro ? clearSince??ms : null;
        // Follow the approach, then keep the pad in view. Range is measured
        // between projected main and tail rotor pivots of the rendered model.
        const followShip=air?.visible&&(deployed<4||reliefCaptured.has('fight'));
        await steerTo(s.tank,followShip?air.xyz[0]:s.relief.verge[0],followShip?air.xyz[2]:s.relief.verge[2]);
        const span=air?Math.hypot(air.hub.screen[0]-air.fin.screen[0],air.hub.screen[1]-air.fin.screen[1]):0;
        const ground=passengers.filter(p=>p.inView&&p.feet[1]<.04);
        const enemies=actors.filter(a=>Math.abs(a.clipDepth)<1&&a.screen[0]>.10*width&&a.screen[0]<.94*width&&a.screen[1]>.13*height&&a.screen[1]<.90*height);
        for(const p of passengers)if(p.rounds>0)shooters.add(p.id);
        if(air?.visible&&air.xyz[1]<1.25&&deployed)parked??=air.xyz;
        const doorDistance=p=>Math.hypot(p.feet[0]-air.sill.xyz[0],p.feet[2]-air.sill.xyz[2]);
        const gap=p=>Math.abs(p.boot.screen[0]-air.sill.screen[0]);
        const clearance=p=>Math.abs(p.boot.screen[1]-p.road.screen[1]);
        let witness=null;
        if(air?.visible)for(const p of passengers){
          if(p.feet[1]>.5&&doorDistance(p)<.65)seenAtSill.add(p.id);
          const clear=seenAtSill.has(p.id)&&p.inView&&p.boot.inView&&p.chestVisible&&p.bootsVisible
            &&doorDistance(p)>.98&&p.feet[1]>.22&&gap(p)>width*.023&&clearance(p)>height*.009;
          if(!clear){sustained.delete(p.id);continue;}
          const first=sustained.get(p.id)??ms;sustained.set(p.id,first);
          if(ms-first>=55)witness=p;
        }
        const rising=air?.visible&&previousAirY!==null&&air.xyz[1]>previousAirY+.008;
        previousAirY=air?.xyz[1]??null;
        const airborneAgain=parked&&rising&&air.xyz[1]>parked[1]+1.55&&Math.hypot(air.xyz[0]-parked[0],air.xyz[2]-parked[2])>1.4;
        // An introductory render can submit an aircraft for a frame, then
        // freeze its position beneath the 3.2s pointer-transparent title.
        // Observe that title finish; allow the compositor to settle, and wait
        // for actual approach travel instead of the initial parked transform.
        const movingApproach=air?.visible&&air.inView&&air.xyz[1]>1.9&&air.xyz[1]<7.8&&!deployed&&photo.uncovered;
        const unobscured=clearSince!==null&&ms-clearSince>=130;
        const which=unobscured&&movingApproach&&span>=width*.055?'inbound'
          :air?.visible&&air.inView&&span>=width*.065&&witness?'door'
          :reliefCaptured.has('fight')&&shooters.size===4&&airborneAgain&&air.inView&&span>width*.035?'outbound'
          :deployed===4&&shooters.size===4&&ground.length>=2&&ground.some(p=>p.flash)&&enemies.length>=2?'fight':null;
        if(which&&unobscured&&!reliefCaptured.has(which)){
          const name='rook-'+(which==='inbound'?'1-airborne':which==='door'?'2-disembark':which==='fight'?'3-squad-in-combat':'4-liftoff');
          const record={name,ms,camera:s.camera,tank:s.tank,air,projectedHubToTail:span,passengers,photo,
            msSinceTitleCleared:ms-clearSince,
            actualShooters:[...shooters],parked,witness:witness&&{id:witness.id,metersFromSill:doorDistance(witness),
              horizontalGapPx:gap(witness),bootToSoilPx:clearance(witness),holdMs:ms-sustained.get(witness.id)},
            opponents:enemies.map(a=>({id:a.id,xyz:a.xyz,screen:a.screen}))};
          const saved=await shot(name,async bytes=>{
            // First get the post-exposure state, before analysing or writing
            // the film. Rejected candidates never become named deliverables.
            const after=(await state()).relief;
            record.after={air:after.air,passengers:after.passengers,photo:after.photo};
            record.film=inspectRookFilm(bytes);
            const pass=record.film.clear&&after.photo?.title.clear
              &&(which!=='inbound'||after.photo.uncovered&&after.air?.visible&&after.air.xyz[1]>1.85&&!after.deployed)
              &&(which!=='door'||after.passengers.some(p=>p.id===witness.id&&p.feet[1]>.12&&p.bootsVisible&&p.chestVisible));
            if(!pass)rejectedFilm.push({ms,which,film:record.film,photo:after.photo});
            return pass;
          });
          if(saved){relief.push(record);reliefCaptured.add(which);}
        }
        if(reliefCaptured.size===4){outcome='relief-complete';break;}
        // A missing stage cannot be reconstructed after the aircraft departs.
        if(air&&!air.visible&&deployed){outcome='missed-flight';break;}
        await sleep(42);continue;
      }
      // Prefer an on-screen threat while a clear shot exists, accounting for
      // nearby survivors first. Only click unobscured scene pixels.
      const candidates=actors.filter(a=>a.clipDepth>-1&&a.clipDepth<1&&a.aim[0]>5&&a.aim[0]<width-6&&a.aim[1]>5&&a.aim[1]<height-6)
        .sort((a,b)=>(a.range-(a.archiveRunner?3:0))-(b.range-(b.archiveRunner?3:0)));
      let aim;
      for(const a of candidates.slice(0,6)){const[x,y]=a.aim;if(await ev(`document.elementFromPoint(${x},${y})===document.querySelector('canvas[data-engine]')`)){aim=a;break;}}
      if(aim){
        await press(null);
        // A moving gun can no longer snap to a clicked coordinate. Track
        // the visible target using pointer movement and read the same slew
        // cue as a player, without reading or setting the turret transform.
        await move(aim.aim[0],aim.aim[1]);
        if(ms-lastShot>=1050){
          const eagle=hud.eagle&&ms-lastEagle>7500&&(actors.length>=4||aim.archetype==='boss');
          if(!eagle) {
            await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
            if(await ev("document.querySelector('.tank-pointer-sight')?.dataset.sweeping==='true'")) {await sleep(30);continue;}
          }
          if(eagle){await button(`document.querySelector('button[aria-label="Arm Eagle Strafe target designator"]')`);lastEagle=ms;}
          await click({x:aim.aim[0],y:aim.aim[1]});
          shots.push({ms,kind:eagle?'eagle':'cannon',id:aim.id,wave:hud.wave});lastShot=ms;
        }
      }else if(actors.length){
        const a=actors.find(a=>a.id===watching)??[...actors].sort((a,b)=>a.range-b.range)[0];watching=a.id;
        const desired=Math.atan2(s.tank.x-a.xyz[0],s.tank.z-a.xyz[2]);
        const delta=Math.atan2(Math.sin(desired-s.tank.rotationY),Math.cos(desired-s.tank.rotationY));
        // Reframe using normal hull controls, not by injecting a camera pose.
        await press(Math.abs(delta)>.1?(delta>0?'a':'d'):'w');
      }else await press(null);
      await sleep(95);
    }
  }finally{await press(null);}
  const durationMs=Math.round(performance.now()-began);
  const waves=phases.filter(p=>p.kind==='combat').map(p=>({wave:p.wave,durationMs:(phases[phases.indexOf(p)+1]?.ms??durationMs)-p.ms}));
  return {policy,scope:'Earned browser replay. Projected actor positions are test telemetry; all effects are ordinary inputs. Wall times include captures, not frame benchmarks.',
    phases,points,shots,kits,waves,relief,rejectedFilm,outcome,durationMs,observationLimitMs};
}
