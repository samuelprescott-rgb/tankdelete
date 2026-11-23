// Photographs of the production actors in their own live scenes. Inspection
// camera only: never moves a mesh or adds lights. All damage uses the horde's
// actual friendly-hit callback; the test never writes health or a mask phase.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(import.meta.url)('playwright');
const [port,out,bundle,mode,maskMode='baseline']=process.argv.slice(2);
assert(['field','field-extra','boss','boss-extra'].includes(mode)&&/^\d{4}$/.test(port));
const isBoss=mode.startsWith('boss');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const origin='http://127.0.0.1:'+port,errors=[],photos=[],health=[];
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS.*false|context lost/i.test(m.text()))errors.push(m.text());});
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
  await page.goto(origin+(isBoss?'/?ghostSignal=embassy':'/'));
  await page.getByRole('button',{name:isBoss?/^Embassy approach/i:/^Start Campaign$/}).click();
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Virtual field only');
    const el=document.querySelector('canvas[data-game-ui]');if(!el)return false;
    for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const o=h.memoizedState?.current;if(o?.name==='player-tank'){window.st=o.__r3f.root;return true;}
    }return false;
  },null,{timeout:90000});
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(u=>/\/GameSession-[\w-]+\.js/.test(u))),origin+'/assets/'+bundle);
  await page.evaluate(()=>{
    const st=window.st,s=st.getState();s.setDpr(1);
    window.horde=()=>{
      const el=document.querySelector('.scene-container');
      const walk=v=>{if(!v)return null;if(Array.isArray(v)){for(const a of v){const k=walk(a);if(k)return k;}return null;}
        const p=v.props;return p?.onZombieHit&&p.zombies&&p.friendlies&&p.zombiePosesRef?p:walk(p?.children);};
      return walk(el[Object.keys(el).find(k=>k.startsWith('__reactProps$'))].children);
    };
    window.stateBoss=()=>{
      const p=window.horde(),z=p?.zombies.find(z=>z.wave===4&&z.archetype==='boss'&&z.alive);
      const root=s.scene.getObjectByName('nightmare-boss-sculpt'),m=root?.getObjectByName('command-portrait-masks');
      const ms=s.scene.getObjectByName('command-portrait-masks')??m;
      return {id:z?.id,hp:z?.health,max:z?.maxHealth,phase:ms?.userData.phase,drops:ms?.userData.drops,t:s.clock.elapsedTime,
        root:root?.position.toArray(),lead:root?.getObjectByName('command-double-faced-skull')?.getWorldPosition(s.camera.position.clone()).toArray()};
    };
    window.damageTo=ratio=>{
      const p=window.horde(),z=p.zombies.find(z=>z.wave===4&&z.archetype==='boss'&&z.alive),pose=p.zombiePosesRef.current.get(z.id);
      if(!pose?.active)throw Error('Inactive boss hit');
      const target=z.maxHealth*ratio;if(z.health<=target)return false;
      p.onZombieHit({soldierId:'surface-review',zombieId:z.id,position:pose.position.clone(),damage:(z.health-target)/.25});return true;
    };
    const {scene,camera,gl}=s,v=camera.position.clone(),q=v.clone(),off=v.clone(),point=v.clone(),local=v.clone();
    const regularFov=camera.fov,ray=new s.raycaster.constructor(),thumb=v.clone(),tank=v.clone(),bossPos=v.clone(),eye=v.clone(),line=v.clone(),delta=v.clone();
    let audit=null;
    window.setShot=(plan)=>{
      window.view=plan;window.readyFrames=0;
    };
    function aim(plan){
      let a=scene.getObjectByName(plan.actor);if(!a)return false;
      for(let o=a;o;o=o.parent)if(!o.visible)return false;
      if(plan.bone)a=a.getObjectByName('vc-field-infantry-volume').skeleton.bones[plan.bone];
      a.updateWorldMatrix(true,false);
      const pair=plan.kind==='pair',spot=plan.target??[0,0,0];audit=null;
      if(plan.id==='claw-detail'){
        // Close cameras can engage the shipped chase-camera privacy fade. Keep
        // the lens OUTSIDE it, where the wrist actually draws opaque, then use
        // an optical zoom. Never override the character material or its fade.
        const monster=scene.getObjectByName('nightmare-boss-sculpt'),player=scene.getObjectByName('player-tank');
        if(!monster||!player||!a.geometry)return false;
        monster.updateWorldMatrix(true,true);a.geometry.computeBoundingBox();a.geometry.computeBoundingSphere();
        a.geometry.boundingBox.getCenter(point).applyMatrix4(a.matrixWorld);
        monster.getWorldPosition(bossPos);player.getWorldPosition(tank);
        const rad=a.geometry.boundingSphere.radius*a.matrixWorld.getMaxScaleOnAxis(),distance=Math.max(12,rad*6);
        const toward=tank.clone().sub(bossPos);toward.y=0;toward.normalize();
        let best=-Infinity;
        outer:for(const yaw of [0,.52,-.52,1,-1,1.5,-1.5,2,-2,3.14])for(const lift of [.12,.35,.65]){
          const co=Math.cos(yaw),si=Math.sin(yaw);
          off.set(toward.x*co-toward.z*si,lift,toward.x*si+toward.z*co).normalize();
          eye.copy(point).addScaledVector(off,distance);
          if(eye.y<.6||eye.distanceTo(bossPos)<9)continue;
          line.copy(tank).sub(eye);delta.copy(bossPos).sub(eye);
          const p=delta.dot(line)/Math.max(.001,line.lengthSq());
          if(p>.02&&p<1.16&&line.multiplyScalar(Math.min(1,p)).sub(delta).length()<6.3)continue;
          ray.set(eye,delta.copy(point).sub(eye).normalize());
          const h=ray.intersectObject(monster,true).filter(hit=>hit.object.isMesh&&hit.object.geometry&&hit.object.visible);
          const target=h.find(hit=>hit.object===a);
          const rank=(target?4:0)+(target&&h[0]===target?5:0)-Math.abs(yaw)*.2-lift*.1;
          if(rank>best){best=rank;thumb.copy(eye);}if(best>7)break outer;
        }
        if(best<0)return false;
        camera.position.copy(thumb);camera.lookAt(point);camera.fov=2*Math.atan(rad*1.22/distance)*180/Math.PI;camera.updateProjectionMatrix();camera.updateMatrixWorld();
        audit={radius:rad,range:distance,nearestWrist:best>7,opacity:a.material.opacity,bossRootRange:camera.position.distanceTo(bossPos)};
        return audit.opacity>.90&&audit.nearestWrist;
      }
      if(camera.fov!==regularFov){camera.fov=regularFov;camera.updateProjectionMatrix();}
      if(pair){const a1=a.getObjectByName('command-double-faced-skull'),a2=a.getObjectByName('command-watchers-skull');
        point.set(0,.035,-.12).applyMatrix4(a1.matrixWorld);q.set(0,.035,-.12).applyMatrix4(a2.matrixWorld);point.lerp(q,.5);}
      else point.fromArray(spot).applyMatrix4(a.matrixWorld);
      off.fromArray(plan.offset).applyMatrix4(a.matrixWorld).sub(local.setFromMatrixPosition(a.matrixWorld));
      camera.position.copy(point).add(off);camera.lookAt(point);camera.updateMatrixWorld();return true;
    }
    s.internal.subscribe({current:()=>{if(window.view)window.readyFrames=aim(window.view)?window.readyFrames+1:0;}},.91,st);
    s.internal.subscribe({current:()=>{
      if(!window.want||window.readyFrames<window.minFrames||gl.domElement.width!==1920||gl.domElement.height!==1080)return;
      const fn=window.want;window.want=null;fn({png:gl.domElement.toDataURL('image/png'),buffer:[gl.domElement.width,gl.domElement.height],time:s.clock.elapsedTime,
        camera:camera.position.toArray(),aim:point.toArray(),fov:camera.fov,audit});
    }},10,st);
    window.photo=(plan,min=4)=>new Promise((res,rej)=>{window.setShot(plan);window.minFrames=min;const timer=setTimeout(()=>{window.want=null;rej(Error('Photo timed out '+plan.id));},9000);
      window.want=r=>{clearTimeout(timer);res(r);};});
  });
  const persist=async(plan,shot)=>{const {png,...meta}=shot,b=Buffer.from(png.split(',')[1],'base64');await writeFile(join(out,plan.id+'.png'),b);
    photos.push({plan,...meta,sha256:createHash('sha256').update(b).digest('hex')});};
  const shoot=async plan=>persist(plan,await page.evaluate(p=>window.photo(p),plan));
  if(!isBoss){
    const gun='tank-crew-station',vc='vc-1968-2';
    await page.waitForFunction(()=>window.st.getState().scene.getObjectByName('tank-crew-authored-face')?.isMesh);
    const main=[
      {id:'gunner',actor:gun,target:[.172,.30,-.18],offset:[.44,.09,-.51]},
      {id:'gunner-hands',actor:gun,target:[.235,.204,-.189],offset:[.42,.22,-.25]},
      {id:'scout',actor:vc,bone:8,target:[0,.023,-.03],offset:[-.35,.008,-.62]},
      {id:'scout-hands',actor:vc,bone:8,target:[.010,-.20,-.19],offset:[-.64,.055,-.44]},
    ];
    const extra=[
      {id:'gunner-face',actor:'tank-crew-authored-face',target:[0,.135,-.050],offset:[.16,.014,-.39]},
      {id:'gunner-control',actor:gun,target:[.28,.202,-.192],offset:[.25,.105,-.14]},
      {id:'scout-reverse',actor:vc,bone:8,target:[0,-.075,-.10],offset:[.54,.016,-.32]},
      {id:'scout-trigger',actor:vc,bone:8,target:[0,-.185,-.14],offset:[.46,-.06,-.15]},
    ];
    for(const plan of mode==='field-extra'?extra:main)await shoot(plan);
  }else{
    await page.waitForFunction(()=>{
      const panel=document.querySelector('.nightmare-order'),wave=Number(panel?.innerText.match(/wave\s+(\d+)\s*\//i)?.[1]);
      if(wave===4)return !!window.stateBoss().id;
      if(![1,2,3].includes(wave)||!panel.classList.contains('is-combat'))return false;
      const p=window.horde();if(!p)return false;
      for(const z of p.zombies){const pose=p.zombiePosesRef.current.get(z.id);if(z.wave===wave&&z.alive&&pose?.active&&z.archetype==='standard')
        p.onZombieHit({soldierId:'surface-review-setup',zombieId:z.id,position:pose.position.clone(),damage:z.health});}return false;
    },null,{timeout:210000,polling:120});
    await page.waitForFunction(()=>{const s=window.st.getState(),r=s.scene.getObjectByName('nightmare-boss-sculpt'),p=r.getWorldPosition(s.camera.position.clone());
       return !document.querySelector('.nightmare-takeover')&&r.visible&&p.x<10&&p.z>-20&&p.z< -14&&r.getObjectByName('command-double-faced-skull').material.opacity>.90;},null,{timeout:45000,polling:60});
    const pair={id:'pair-worn',actor:'nightmare-boss-sculpt',kind:'pair',offset:[.07,.045,-1.12]};
    if(mode==='boss-extra'){
      if(maskMode==='masks'){await page.evaluate(()=>window.damageTo(.48));await page.waitForFunction(()=>window.stateBoss().phase==='shed');}
      await shoot({id:'claw-detail',actor:'command-wrist-1',target:[0,-.146,-.061],offset:[.14,.035,-.41]});
      for(const [i,actor] of ['command-double-faced-skull','command-watchers-skull'].entries())
        await shoot({id:i?'watcher-quarter':'lead-quarter',actor,target:[0,.014,-.14],offset:[i?.33:-.30,-.016,-.69]});
      health.push(await page.evaluate(()=>window.stateBoss()));
    }else{
    await shoot(pair);
    const skulls=['command-double-faced-skull','command-watchers-skull'];
    if(maskMode==='masks')for(const [i,actor] of skulls.entries())await shoot({id:['mask-harris','mask-joe'][i],actor,target:[0,.045,-.12],offset:[i?-.18:.21,.02,-.89]});
    health.push(await page.evaluate(()=>window.stateBoss()));
    if(maskMode==='masks')assert.equal(health[0].phase,'worn');
    await page.evaluate(()=>window.damageTo(.52));
    await page.waitForFunction(()=>{const z=window.stateBoss();return z.hp/z.max<=.521;},null,{timeout:2000});
    health.push(await page.evaluate(()=>window.stateBoss()));
    if(maskMode==='masks')assert(health[1].hp/health[1].max>.5&&health[1].phase==='worn','Not worn immediately above threshold');
    const clip=await page.evaluate(async({pair,maskMode})=>{
      const st=window.st,s=st.getState(),{gl}=s;s.setDpr(1);window.setShot(pair);
      const ret=[],video=[],small=document.createElement('canvas');small.width=960;small.height=540;const ctx=small.getContext('2d');
      const begin=s.clock.elapsedTime;let sent=false,t0,latest=-1,at=0;
      const thresholds=[.12,.34,.62,1.04,1.6];
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(Error('No phase film'));},7000);
        const off=s.internal.subscribe({current:()=>{const t=s.clock.elapsedTime,state=window.stateBoss();if(!state.id)return;
          if(!sent&&t-begin>.23){window.damageTo(.5);sent=true;t0=t;}
          const rel=sent?t-t0:t-begin-.23;
          if(t-latest>.071){ctx.drawImage(gl.domElement,0,0,960,540);video.push({rel,jpg:small.toDataURL('image/jpeg',.88),phase:state.phase,hp:state.hp});latest=t;}
          if(sent&&at<thresholds.length&&rel>=thresholds[at]){ret.push({png:gl.domElement.toDataURL('image/png'),rel,state,buffer:[1920,1080],time:t,camera:s.camera.position.toArray(),fov:s.camera.fov});at++;}
          if(sent&&rel>1.86){off();clearTimeout(timer);resolve({ret,video});}
        }},11,st);});
    },{pair,maskMode});
    for(const [i,shot] of clip.ret.entries())await persist({...pair,id:'drop-'+i},shot);
    await mkdir(join(out,'motion'),{recursive:true});
    for(const [i,frame] of clip.video.entries())await writeFile(join(out,'motion','frame-'+String(i).padStart(3,'0')+'.jpg'),Buffer.from(frame.jpg.split(',')[1],'base64'));
    await writeFile(join(out,'motion','frames.json'),JSON.stringify(clip.video.map(({jpg,...v})=>v)));
    health.push(...clip.ret.map(f=>f.state));
    if(maskMode==='masks'){
      assert(health.some(s=>s.phase==='falling'),'No falling interval');
      await page.waitForFunction(()=>window.stateBoss().phase==='shed',null,{timeout:10000});
    }
    await shoot({...pair,id:'pair-revealed'});
    for(const [i,actor] of skulls.entries())await shoot({id:['lead','watcher'][i],actor,target:[0,.045,-.12],offset:[i?-.18:.21,.02,-.89]});
    await shoot({id:'claw',actor:'command-wrist-1',target:[0,-.15,-.03],offset:[.55,.13,-.61]});
    await shoot({id:'claw-detail',actor:'command-wrist-1',target:[0,-.146,-.061],offset:[.14,.035,-.41]});
    for(const [i,actor] of skulls.entries())await shoot({id:i?'watcher-quarter':'lead-quarter',actor,target:[0,.014,-.14],offset:[i?.33:-.30,-.016,-.69]});
    health.push(await page.evaluate(()=>window.stateBoss()));
    }
  }
  assert.deepEqual(errors,[]);console.log(mode,bundle,photos.length+' rendered views',health.map(s=>[s.hp,s.phase,s.drops]));
}finally{
  await writeFile(join(out,'receipt.json'),JSON.stringify({bundle,mode,photos,health,errors,method:'Production geometry, original lights and moving animation, fixed actor-local inspection lenses; wave-four QA setup and half-health strike use actual damage callback. No pose or health overwritten.'},null,2));
  await browser.close();
}
