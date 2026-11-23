// Inspect normal campaign or naturally earned Wave 2. Never moves the
// transport, its occupants, clock, targets, or health. Only the second
// exposure uses an inspection camera. No native commands or napalm.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [port,mode,folder]=process.argv.slice(2);
assert.ok(/^\d{4,5}$/.test(port)&&port!=='1420'&&['campaign','horde'].includes(mode)&&folder);
const {chromium}=createRequire(import.meta.url)('playwright'),out=resolve(folder);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),page=await ctx.newPage();
const receipt={mode,route:'Menu / original chase camera, then a separate exterior cabin inspection lens. Real simulation only.',errors:[]};
page.on('pageerror',e=>receipt.errors.push(e.message));
page.on('console',m=>{if(/Shader Error|INVALID_OPERATION|context lost/i.test(m.text()))receipt.errors.push(m.text());});
try{
  await page.goto('http://127.0.0.1:'+port);
  assert.equal(await page.evaluate(()=>!!window.__TAURI_INTERNALS__),false);
  const bundle=page.waitForResponse(r=>r.ok()&&/\/GameSession-[\w-]+\.js$/.test(r.url()),{timeout:120000});
  await page.getByRole('button',{name:mode==='campaign'?'Start Campaign':'Tune hidden Horde channel',exact:true}).click();
  const res=await bundle;receipt.bundle=res.url().split('/').at(-1);receipt.sha256=createHash('sha256').update(await res.body()).digest('hex');
  await page.waitForFunction(mode=>{
    const canvas=document.querySelector('canvas[data-game-ui]');if(!canvas)return false;
    let tank,line;
    for(let f=canvas[Object.keys(canvas).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return){
      if(f.memoizedProps?.zombiePosesRef?.current instanceof Map)line=f.memoizedProps;
      for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.name==='player-tank')tank=h.memoizedState.current;
    }
    if(!line||!tank)return false;
    const store=tank.__r3f.root,s=store.getState(),bird=s.scene.getObjectByName(mode==='campaign'?'kestrel-campaign-transport':'rook-relief-transport');
    if(!bird)return false;
    window.doorQA={line,tank,store,bird,shots:[],frames:[],misses:[],heading:tank.rotation.y};
    return true;
  },mode,{timeout:120000});
  await page.evaluate(({mode})=>{
    const q=window.doorQA,{bird,store,tank,line}=q,s=store.getState(),cam=s.camera,v=cam.position.clone();
    const seat=bird.getObjectByName('door-gunner-pivot'),signal=bird.getObjectByName('door-projector-signal');
    const prop=bird.getObjectByName('door-crew-field-prop'),head=bird.getObjectByName('seated-door-gunner').skeleton.bones.find(b=>b.name==='head');
    const hull=bird.getObjectByName('huey-flying-airframe'),mount=seat.parent,ray=new s.raycaster.constructor();
    const axis=o=>o.localToWorld(v.clone().set(0,0,-1)).sub(o.getWorldPosition(v.clone())).normalize();
    const observed=()=>{
      const t=bird.userData.flightTime,id=seat.userData.contactId;
      if(!bird.visible||!signal.visible||!id)return;
      // Read only. The live radar map uses the same world locations as the
      // independently animated actors. All wave-two horde actors are 1x size.
      const radar=document.querySelector('canvas[data-game-ui]'),k=Object.keys(radar).find(k=>k.startsWith('__reactFiber$'));
      let actor;
      for(let f=radar[k];mode==='campaign'&&f&&!actor;f=f.return)
        for(const h of [f.memoizedProps,f.alternate?.memoizedProps])
          if(h?.enemyPosesRef?.current instanceof Map)actor??=h.enemies?.find(a=>a.id===id&&a.alive);
      const pose=(mode==='campaign'?line.enemyPosesRef:line.zombiePosesRef).current.get(id);
      if(!pose||pose.active===false||mode==='campaign'&&!actor)return;
      const target=pose.position.clone();target.y+=mode==='campaign'?(1.2-(actor.stance==='kneeling'?.44:0))*.72:.72;
      const tip=signal.getWorldPosition(v.clone()),barrel=axis(prop),face=axis(head),towards=target.clone().sub(tip).normalize();
      const start=prop.localToWorld(v.clone().set(0,-.004,.3)),ndc=tip.clone().project(cam);
      ray.set(start,barrel);ray.far=start.distanceTo(target);
      const angle=a=>Math.acos(Math.max(-1,Math.min(1,a.dot(towards))))*180/Math.PI;
      return {t,id,target:target.toArray(),tip:tip.toArray(),muzzleAngle:angle(barrel),faceAngle:angle(face),
        blocked:ray.intersectObject(hull,true)[0]?.object?.name??null,ndc:ndc.toArray(),
        aligned:angle(barrel)<1.25&&angle(face)<2};
    };
    const isFlightReady=()=>bird.visible&&bird.userData.flightTime>(mode==='campaign'?4:3.8);
    let inspect=false;
    s.internal.subscribe({current:()=>{
      if(!isFlightReady()||q.shots.length!==1)return;
      inspect=true;
      const eye=mount.localToWorld(v.clone().set(2.27,.38,-1.16)),look=mount.localToWorld(v.clone().set(.71,.10,-.23));
      cam.position.copy(eye);cam.lookAt(look);cam.updateMatrixWorld(true);
    }},.92,store);
    s.internal.subscribe({current:()=>{
      if(!isFlightReady()||q.shots.length>=2||q.shots.length===1&&!inspect)return;
      const m=observed();if(!m)return;
      if(!m.aligned||m.blocked){if(q.misses.length<12)q.misses.push(m);return;}
      if(Math.abs(m.ndc[0])>.98||Math.abs(m.ndc[1])>.96||m.ndc[2]<0||m.ndc[2]>1)return;
      const canvas=s.gl.domElement,kind=inspect?'inspection':'stock';
      q.frames.push(canvas.toDataURL('image/png').split(',')[1]);
      q.shots.push({...m,kind,camera:cam.position.toArray(),buffer:[canvas.width,canvas.height]});
    }},1.9,store);
    q.status=()=>{
      const rect=s.gl.domElement.getBoundingClientRect(),targets=[...line.zombiePosesRef.current.values()].filter(z=>z.active).map(z=>{
        const p=z.position.clone();p.y=0;p.project(cam);const x=(p.x+1)*rect.width/2,y=(1-p.y)*rect.height/2;
        return {x,y,ndc:p.z,world:z.position.toArray(),range:z.position.distanceTo(tank.position),clear:document.elementFromPoint(x,y)===s.gl.domElement};
      }).sort((a,b)=>a.range-b.range);
      return {air:bird.visible,phase:document.querySelector('.nightmare-order')?.className,targets,yaw:tank.rotation.y,
        start:q.heading,tank:tank.position.toArray(),shots:q.shots.length,t:bird.userData.flightTime,id:seat.userData.contactId,misses:q.misses.length};
    };
  },{mode});
  const end=Date.now()+(mode==='campaign'?125000:300000);let held='',last=0,strafe=0,nextStatus=0;
  const steer=async(a,c)=>{const d=Math.atan2(Math.sin(a-c),Math.cos(a-c)),k=Math.abs(d)<.055?'':d>0?'a':'d';
    if(held!==k){if(held)await page.keyboard.up(held);if(k)await page.keyboard.down(k);held=k;}};
  while(Date.now()<end){
    const s=await page.evaluate(()=>window.doorQA.status()),now=Date.now();
    if(now>nextStatus){console.log(mode,s.phase,s.air,s.t,s.id,s.shots);nextStatus=now+20000;}
    if(s.shots===2||s.t>20.5&&!s.air)break;
    if(mode==='horde'&&!s.air){
      if(s.phase?.includes('defeat'))break;
      if(s.phase?.includes('intermission')){
        await steer(s.start,s.yaw);const b=page.locator('.field-kit__proceed');if(!held&&await b.isEnabled())await b.click();
      }else if(s.phase?.includes('combat')){
        const v=s.targets.find(v=>v.clear&&v.ndc>0&&v.ndc<1&&v.x>30&&v.x<1890&&v.y>30&&v.y<1050);
        if(v){await steer(s.yaw,s.yaw);await page.mouse.move(v.x,v.y);
          const e=page.getByRole('button',{name:'Arm Eagle Strafe target designator',exact:true});
          if(now-strafe>7000&&s.targets.length>=3&&await e.isVisible()&&await e.isEnabled()){
            await e.click();await page.mouse.click(v.x,v.y);last=strafe=now;
          }else if(now-last>750){await page.mouse.click(v.x,v.y);last=now;}
        }else if(s.targets.length){const [x,,z]=s.targets[0].world;await steer(Math.atan2(s.tank[0]-x,s.tank[2]-z),s.yaw);}
      }
    }else if(held)await steer(s.yaw,s.yaw);
    await page.waitForTimeout(90);
  }
  const result=await page.evaluate(()=>({shots:window.doorQA.shots,misses:window.doorQA.misses,frames:window.doorQA.frames,status:window.doorQA.status()}));
  receipt.shots=result.shots;receipt.misses=result.misses;receipt.status=result.status;
  for(const [i,m] of result.shots.entries())await writeFile(join(out,mode+'-'+m.kind+'.png'),Buffer.from(result.frames[i],'base64'));
  assert.deepEqual(result.shots.map(m=>m.kind),['stock','inspection']);assert.deepEqual(receipt.errors,[]);
  console.log(mode,result.shots.map(s=>[s.kind,s.t,s.id,s.muzzleAngle,s.blocked]));
}finally{
  await writeFile(join(out,mode+'.json'),JSON.stringify(receipt,null,2));await browser.close();
}
