// Renderer-only observer for a REAL tank-directed wave-four close attack.
// Arguments: <port> <GameSession-...js> <output directory>
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const {chromium}=createRequire(import.meta.url)('playwright');
const [port,bundle,dest]=process.argv.slice(2);
const target=process.env.STRIKE_TARGET??'tank';
assert(['tank','sagamore'].includes(target));
assert(/^\d{4,5}$/.test(port)&&/^GameSession-[\w-]+\.js$/.test(bundle)&&dest);
const out=resolve(dest),origin='http://127.0.0.1:'+port;
const framesDir=resolve(out,'motion');await mkdir(framesDir,{recursive:true});
const report={bundle,target,method:'Real wave-four melee. Waves 1–3 cleared via normal friendly hit callback. W/D drive the live player to the breach; on the tank route a normal left-click cannon can challenge the boss. No direct health writes or changes to boss AI, mesh transform, fade or light. Fixed 1080p, player-relative inspection lens; wrist is cropped from identical full-body pixels.'};
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal','--no-first-run']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS.*false|context lost/i.test(m.text()))errors.push(m.text());});
try{
  // Read-only renderer commit subscription, including the three-fiber root.
  // It lets the observer read the production .70 s clock itself, separately
  // from either build's authored right-arm pose or finger morph.
  await page.addInitScript(()=>{
    let nextId=0;window.proofRoots=[];
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject:()=>++nextId,
      onCommitFiberRoot:(_id,root)=>{if(!window.proofRoots.includes(root))window.proofRoots.push(root);}};
  });
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
  await page.goto(origin+'/?ghostSignal=embassy');await page.getByRole('button',{name:/^Embassy approach/i}).click();
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Virtual fixtures only');
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const o=h.memoizedState?.current;if(o?.name==='player-tank'){window.proofStore=o.__r3f.root;return true;}
    }return false;
  },null,{timeout:90000});
  report.url=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name).find(u=>/\/GameSession-[\w-]+\.js/.test(u)));
  assert.equal(report.url,origin+'/assets/'+bundle);
  await page.evaluate(target=>{window.proofTarget=target;},target);
  await page.evaluate(()=>{
    const el=document.querySelector('.scene-container');
    const find=v=>{if(Array.isArray(v)){for(const e of v){const a=find(e);if(a)return a;}return;}
      const p=v?.props;return p?.onZombieHit&&p.zombies&&p.zombiePosesRef?p:find(p?.children??[]);};
    window.readHorde=()=>find(el[Object.keys(el).find(k=>k.startsWith('__reactProps$'))].children);
  });
  await page.waitForFunction(()=>{
    const panel=document.querySelector('.nightmare-order'),wave=Number(panel?.innerText.match(/wave\s+(\d+)\s*\//i)?.[1]),p=window.readHorde();
    if(!p)return false;if(wave===4)return !!p.zombies.find(z=>z.wave===4&&z.archetype==='boss'&&z.alive);
    if(![1,2,3].includes(wave)||!panel?.classList.contains('is-combat'))return false;
    for(const z of p.zombies){const pose=p.zombiePosesRef.current.get(z.id);if(z.wave===wave&&z.alive&&pose?.active&&z.archetype==='standard')
      p.onZombieHit({soldierId:'strike-proof-early-waves',zombieId:z.id,position:pose.position.clone(),damage:z.health});}
    return false;
  },null,{timeout:210000,polling:120});
  console.log('Wave 4',bundle);
  await page.evaluate(()=>{
    const st=window.proofStore,s=st.getState(),{camera,gl,scene}=s;
    const boss=scene.getObjectByName('nightmare-boss-sculpt'),tank=scene.getObjectByName('player-tank'),w=boss.getObjectByName('command-wrist-1');
    const shoulder=boss.getObjectByName('command-striking-arm'),guard=boss.getObjectByName('command-upper-0'),coat=boss.getObjectByName('command-ripped-coat');
    let rtMap;
    function runtimeFor(id){
      if(rtMap?.has(id))return rtMap.get(id);
      for(const root of window.proofRoots){const stack=[root.current];
        while(stack.length){const f=stack.pop();if(!f)continue;if(f.child)stack.push(f.child);if(f.sibling)stack.push(f.sibling);
          for(let hook=f.memoizedState;hook;hook=hook.next){const v=hook.memoizedState?.current;
            if(v instanceof Map&&typeof v.get(id)?.swingLift==='number'){rtMap=v;return v.get(id);}}
        }
      }throw Error('Live tank attack runtime not found');
    }
    const vec=()=>camera.position.clone(),p=vec(),root=vec(),tankPos=vec(),toward=vec(),aim=vec(),world=vec(),ray=new s.raycaster.constructor();
    const toPx=v=>{const q=v.clone().project(camera);return [(1+q.x)*960,(1-q.y)*540];};
    const ring=[],rows=[],diag=window.strikeDiag={samples:[],liftFrames:0,windups:0};
    const proof=window.strikeProof={done:false};
    const geo=w.geometry.getAttribute('position'),probes=[];
    for(let i=0;i<geo.count;i+=Math.max(1,Math.floor(geo.count/160)))probes.push(i);
    const body=[coat,...['command-pelvis','command-continuous-lower-body','command-living-shoulder-net','command-double-faced-skull','command-watchers-skull'].map(n=>boss.getObjectByName(n))].filter(Boolean);
    const round=v=>Math.round(v*1000)/1000,xyz=o=>o.toArray().map(round);
    const trace=()=>{let lx=Infinity,ly=Infinity,hx=-Infinity,hy=-Infinity,clear=0,front=0,total=0;
      for(let i=0;i<geo.count;i++){const [x,y]=toPx(w.getVertexPosition(i,p).applyMatrix4(w.matrixWorld));lx=Math.min(lx,x);hx=Math.max(hx,x);ly=Math.min(ly,y);hy=Math.max(hy,y);}
      for(const i of probes){w.getVertexPosition(i,world).applyMatrix4(w.matrixWorld);ray.set(camera.position,p.copy(world).sub(camera.position).normalize());
        const hits=ray.intersectObjects(body,false);clear+=Number(!hits.length);front+=Number(!hits.length||hits[0].distance>camera.position.distanceTo(world)-.016);total++;}
      return {bounds:[lx,ly,hx,hy].map(round),clearBody:round(clear/total),inFront:round(front/total),probes:total};
    };
    const photo=document.createElement('canvas');photo.width=1920;photo.height=1080;const pix=photo.getContext('2d');
    let now,meta,last=-99,timePick=null,prevLift=0,best=null,cutLocked=false,seenStrike=false,lastDiag=0;
    let lastSeen=null;
    s.internal.subscribe({current:()=>{
      meta=null;if(proof.done||!boss.visible)return;
      boss.updateWorldMatrix(true,true);tank.getWorldPosition(tankPos);boss.getWorldPosition(root);
      now=s.clock.elapsedTime;const h=window.readHorde(),z=h?.zombies.find(z=>z.wave===4&&z.archetype==='boss'&&z.alive),pose=z&&h.zombiePosesRef.current.get(z.id);
      if(!pose?.active||document.querySelector('.nightmare-takeover'))return;
      const dx=root.x-tankPos.x,dz=root.z-tankPos.z,dist=Math.hypot(dx,dz);
      const rt=runtimeFor(z.id),t=Math.max(0,Math.min(1,rt.swingLift/.70));
      const versusRider=window.proofTarget==='sagamore',rider=pose.pursuingSoldier==='boss-ally-sagamore';
      const lift=versusRider?rt.armWindup/.28:t*t*(3-2*t);
      const follow=versusRider?Math.max(0,1-(now-rt.lastSoldierSwing)/.34):Math.max(0,1-(now-rt.lastTankSwing)/.23);
      const phase=lift-follow*.47/.43,tankTarget=!pose.pursuingSoldier;
      const guardPhase=(-guard.rotation.y-.18)/.43;
      lastSeen={time:round(now),root:xyz(root),tank:xyz(tankPos),dist:round(dist),target:pose.pursuingSoldier,
        phase:round(phase),guardPhase:round(guardPhase),elapsedWindup:round(versusRider?rt.armWindup:rt.swingLift),
        eligible:versusRider?rider:tankTarget,actualSoldierAction:pose.soldierSwing,lastSoldierSwing:Number.isFinite(rt.lastSoldierSwing)?round(rt.lastSoldierSwing):null,
        lastTankSwing:Number.isFinite(rt.lastTankSwing)?round(rt.lastTankSwing):null,hp:z.health};
      if(now-lastDiag>.4){lastDiag=now;diag.samples.push(lastSeen);if(diag.samples.length>200)diag.samples.shift();}
      if(tankTarget&&dist<4.85&&phase>.02)diag.liftFrames++;
      if(dist>10||root.z>-10)return;
      if(st.getState().viewport.dpr!==1)st.getState().setDpr(1);
      // Exact player azimuth: do not swing around to the attractive side
      // of the model. Both builds use the same height, distance and FOV.
      toward.copy(tankPos).sub(root);toward.y=0;toward.normalize();
      aim.copy(root);aim.y+=4.65;
      camera.position.copy(aim).addScaledVector(toward,18);camera.position.y+=1.45;
      camera.lookAt(aim);camera.fov=35;camera.updateProjectionMatrix();camera.updateMatrixWorld();
      meta={...lastSeen,tankTarget,shoulderY:round(shoulder.rotation.y),morph:round(w.morphTargetInfluences?.[0]??0),opacity:round(w.material.opacity),camera:xyz(camera.position),aim:xyz(aim),fov:camera.fov};
      window.challengeSight={time:now,dist,point:toPx(p.copy(root).setY(0)),challenges:z.playerChallenge};
    }},.91,st);
    s.internal.subscribe({current:()=>{
      if(!meta||proof.done||gl.domElement.width!==1920||gl.domElement.height!==1080)return;
      const phase=meta.phase,acquiring=meta.eligible&&meta.dist<=(window.proofTarget==='sagamore'?10:4.82)&&phase>.42&&phase<=1.001;
      const reached=acquiring&&phase>=.66&&phase<=1&&phase>=prevLift;
      const choose=reached&&(!best||Math.abs(phase-.82)<Math.abs(best.phase-.82));
      const needFrame=now-last>=1/22||choose;
      prevLift=phase;if(!needFrame)return;
      last=now;pix.drawImage(gl.domElement,0,0,1920,1080);
      const frame={...meta,jpg:photo.toDataURL('image/jpeg',.94)};
      ring.push(frame);if(!cutLocked)while(ring.length>1&&now-ring[0].time>1.12)ring.shift();
      if(choose&&meta.opacity>.88){const audit=trace(),[l,t,r,b]=audit.bounds;if(audit.inFront>=.40&&l>35&&t>35&&r<1885&&b<1045){
        best={...meta,...audit,png:photo.toDataURL('image/png')};timePick=now;cutLocked=true;diag.windups++;
      }}
      if(best&&now>timePick+.035&&phase<-.10)seenStrike=true;
      const impact=window.proofTarget==='sagamore'?meta.lastSoldierSwing:meta.lastTankSwing;
      if(best&&seenStrike&&impact>timePick&&now-impact>=.39){
        proof.done=true;proof.still=best;proof.frames=ring;proof.didFollow=true;return;
      }
      if(best&&now-timePick>1.5){cutLocked=false;best=null;seenStrike=false;}
    }},10,st);
  });
  // Approach the crossing through real controls with ordinary acceleration,
  // deceleration and collisions. Stop early enough to keep the tank in frame.
  await page.waitForFunction(()=>!document.querySelector('.nightmare-takeover'),null,{timeout:18000});
  if(target==='tank'){
  await page.keyboard.down('d');
  try{await page.waitForFunction(()=>window.proofStore.getState().scene.getObjectByName('player-tank').rotation.y<=-.51,null,{polling:'raf',timeout:2200});}
  catch{}finally{await page.keyboard.up('d');}}
  await page.keyboard.down('w');
  try{await page.waitForFunction(limit=>window.proofStore.getState().scene.getObjectByName('player-tank').position.z<=limit,target==='tank'?-15.45:-13.75,{polling:'raf',timeout:3500});}
  catch{/* At a real obstacle or input lock, remain in the last drivable position. */}
  finally{await page.keyboard.up('w');}
  let aimed=null,pressed=0;const deadline=Date.now()+75000;
  while(Date.now()<deadline){
    const live=await page.evaluate(()=>({done:window.strikeProof.done,sight:window.challengeSight}));if(live.done)break;
    const a=live.sight;
    if(target==='tank'&&a&&a.dist<8&&a.challenges===0){
      const [x,y]=a.point.map(Math.round);if(x>=3&&x<1916&&y>=4&&y<1075){
        await page.mouse.move(x,y);
        if(aimed!==null&&Date.now()-aimed>550&&Date.now()-pressed>1700){await page.mouse.click(x,y);pressed=Date.now();}
        aimed??=Date.now();
      }
    }
    await page.waitForTimeout(130);
  }
  assert(await page.evaluate(()=>window.strikeProof.done),'No completed '+target+'-directed attack');
  const {still,frames,didFollow}=await page.evaluate(()=>window.strikeProof);
  assert(didFollow&&frames.some(f=>f.phase<-.1)&&frames.length>=7);
  assert(Math.abs(still.phase-still.guardPhase)<.004&&still.elapsedWindup>0,'Independent guard shoulder and live tank windup clock disagree');
  const raw=Buffer.from(still.png.split(',')[1],'base64');delete still.png;
  await writeFile(resolve(out,'windup-full.png'),raw);
  const run=(args,cwd=out)=>{const v=spawnSync('ffmpeg',['-nostdin','-y','-loglevel','error',...args],{cwd});assert.equal(v.status,0,String(v.stderr));};
  const [x0,y0,x1,y1]=still.bounds;const width=Math.min(1920,Math.max(240,Math.ceil((x1-x0+44)/2)*2)),height=Math.min(1080,Math.max(200,Math.ceil((y1-y0+44)/2)*2));
  const x=Math.min(1920-width,Math.max(0,Math.round((x1+x0-width)/2))),y=Math.min(1080-height,Math.max(0,Math.round((y1+y0-height)/2)));
  run(['-i','windup-full.png','-vf',`crop=${width}:${height}:${x}:${y}`,'-frames:v','1','windup-wrist.png']);
  const clip=frames.filter(f=>f.time>=still.time-.94),lines=[];
  for(const [i,f] of clip.entries()){
    const name='frame-'+String(i).padStart(3,'0')+'.jpg';
    await writeFile(resolve(framesDir,name),Buffer.from(f.jpg.split(',')[1],'base64'));delete f.jpg;
    lines.push("file '"+name+"'","duration "+Math.max(.012,(clip[i+1]?.time??f.time+.04)-f.time).toFixed(4));
  }
  await writeFile(resolve(framesDir,'frames.txt'),lines.join('\n')+'\n');
  run(['-f','concat','-safe','1','-i','frames.txt','-c:v','libx264','-pix_fmt','yuv420p','-crf','17','-movflags','+faststart',resolve(out,'strike.mp4')],framesDir);
  Object.assign(report,{still,clip,followThrough:didFollow,crop:{x,y,width,height},sha256:createHash('sha256').update(raw).digest('hex')});
  assert.deepEqual(errors,[]);console.log('Retained',bundle,still,clip.length);
}finally{
  report.errors=errors;report.diagnostics=await page.evaluate(()=>window.strikeDiag??null).catch(()=>null);
  await writeFile(resolve(out,'receipt.json'),JSON.stringify(report,null,2));await browser.close();
}
