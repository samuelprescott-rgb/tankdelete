// Production optical inspection only. Campaign starts via its normal menu;
// embassy earns the wave-two lift with normal keys, mouse and intermission UI.
// NODE_PATH=<playwright> node scripts/capture-transport-cabin.mjs PORT OUT GameSession-HASH.js [both|campaign|embassy] [--baseline]
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
const args=process.argv.slice(2),baseline=args.at(-1)==='--baseline';
if(baseline)args.pop();
const [port,folder,bundle,which='both']=args;
assert.ok(args.length<=4&&/^\d{4,5}$/.test(port)&&+port<=65535&&+port!==1420&&folder&&bundle&&/^GameSession-[\w-]+\.js$/.test(basename(bundle))
  &&['campaign','embassy','both'].includes(which),'Expected PORT OUT GAMESESSION_BUNDLE [both|campaign|embassy] [--baseline]');
// Original micro-r14/kit/kit.json records both of these independently.
const r14={bundle:'GameSession-CFdVOb3e.js',sha256:'576e746858ed35858503a9eefa25b753627db39377347e828b3ca7abcb7f9c6b'};
if(baseline)assert.equal(basename(bundle),r14.bundle,'--baseline is exclusively for the frozen original R14');
const origin='http://127.0.0.1:'+port,out=resolve(folder),sha=b=>createHash('sha256').update(b).digest('hex');
const {chromium}=createRequire(import.meta.url)('playwright');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const receipt={pass:false,captureComplete:false,assessment:baseline?'R14 baseline observation only; no ticket or handoff acceptance':'strict ticket and handoff qualification',
  route:'Isolated web simulation, normal original menu/wave; close inspection camera only, no actor, time, or health overrides.',runs:[],errors:[]};
const options={
  campaign:{button:'Start Campaign',bird:'kestrel-campaign-transport',ids:['kestrel-pip','kestrel-lark','kestrel-fin'],first:8.4,interval:1},
  embassy:{button:'Tune hidden Horde channel',bird:'rook-relief-transport',ids:['lift-amber','lift-wren','lift-cedar','lift-moss'],first:6.28,interval:.96},
};

async function fly(mode){
  const config={...options[mode],baseline},ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const page=await ctx.newPage(),run={mode,shots:[],transfers:[]};receipt.runs.push(run);
  page.on('pageerror',e=>receipt.errors.push(mode+': '+e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS.*false|WebGL: INVALID|context lost/i.test(m.text()))receipt.errors.push(mode+': '+m.text());});
  try{
    const asset=page.waitForResponse(r=>r.ok()&&r.url().startsWith(origin+'/assets/')&&/\/GameSession-[\w-]+\.js$/.test(r.url()),{timeout:120000});
    void asset.catch(()=>{});
    await page.goto(origin+'/');
    assert.ok(!(await page.evaluate(()=>!!window.__TAURI_INTERNALS__)),'simulation-only capture');
    await page.getByRole('button',{name:config.button,exact:true}).click();
    const res=await asset;run.bundle=basename(new URL(res.url()).pathname);assert.equal(run.bundle,basename(bundle));
    run.bundleSha256=sha(await res.body());
    if(baseline)assert.equal(run.bundleSha256,r14.sha256,'served bytes are not the frozen R14 baseline');
    if(bundle.includes('/'))assert.equal(run.bundleSha256,sha(await readFile(resolve(bundle))));
    await page.waitForFunction(({bird,ids,baseline})=>{
      const canvas=document.querySelector('canvas[data-game-ui]');if(!canvas)return false;
      let tank,sceneProps;
      for(let f=canvas[Object.keys(canvas).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return){
        if(f.memoizedProps?.zombiePosesRef?.current instanceof Map)sceneProps=f.memoizedProps;
        for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.name==='player-tank')tank=h.memoizedState.current;
      }
      if(!tank||!sceneProps&&bird.startsWith('rook'))return false;
      const store=tank.__r3f.root,s=store.getState(),air=s.scene.getObjectByName(bird),line=s.scene.getObjectByName('us-rifle-1')?.parent;
      if(!line||!air||!air.getObjectByName('seated-door-gunner'))return false;
      if(!baseline&&!air.getObjectByName('embarked-manifest')?.getObjectByName('aboard-'+ids[0]))return false;
      const clock=baseline&&bird.startsWith('kestrel')?s.scene.getObjectByName('campaign-airlift'):air;
      if(!clock)return false;window.cabinQ={store,air,line,clock,tank,sceneProps};return true;
    },config,{polling:'raf',timeout:120000});
    await page.evaluate(({ids,first,interval,bird,baseline})=>{
      const q=window.cabinQ,s=q.store.getState(),cam=s.camera,{air,line,clock}=q,manifest=air.getObjectByName('embarked-manifest');
      q.store.subscribe(st=>{if(st.viewport.dpr!==1)st.setDpr(1);});s.setDpr(1);
      const vec=cam.position.clone(),aim=vec.clone(),p=vec.clone(),ray=new s.raycaster.constructor();
      const sign=bird.startsWith('rook')?-1:1,last=first+(ids.length-1)*interval;
      const cues=[['seated-near',first-2.45],['seated-reverse',first-1.18],['at-sill',first-.16],['ground-handoff',first+.42],['cabin-empty',last+.85]];
      q.frames={};q.rows=[];q.moves=[];q.faults=[];q.next=0;q.samples=0;
      const fault=msg=>{if(q.faults.length<10&&!q.faults.includes(msg))q.faults.push(msg);};
      // Set the lens only after the actual aircraft runs, never while the
      // player is still completing wave one. Post-processing runs at priority 1.
      s.internal.subscribe({current:()=>{
        if(!air.visible||q.next>=cues.length)return;
        const t=clock.userData.flightTime;if(!(t>.2))return;
        const reverse=t>=cues[0][1]+.22&&t<cues[1][1]+.15,egress=t>=first-.75&&t<last+.49;
        const side=(reverse?-1:1)*sign;
        const eyeL=egress?[sign*2.97,.23,.97]:[side*2.12,.11,reverse?-.36:.51];
        const targetL=egress?[sign*.53,-.015,.23]:[0,-.015,.12];
        cam.position.copy(air.localToWorld(vec.fromArray(eyeL)));cam.lookAt(air.localToWorld(aim.fromArray(targetL)));cam.updateMatrixWorld();
      }},.90,q.store);
      const isVisible=o=>{for(let n=o;n;n=n.parent)if(!n.visible)return false;return !!o;};
      const v3=o=>o.getWorldPosition(vec).toArray(),dist=(a,b)=>Math.hypot(...a.map((k,i)=>k-b[i]));
      const roots=()=>ids.map(id=>{
        const seat=(manifest?.children??[]).filter(o=>o.name==='aboard-'+id),ground=line.children.filter(o=>o.name===id);
        if(!baseline&&seat.length+ground.length!==1)fault(id+' ownership count '+seat.length+'+'+ground.length);
        if(!baseline&&seat[0]&&!isVisible(seat[0]))fault(id+' aboard owner hidden');
        return {id,seat:seat[0],ground:ground[0]};
      });
      const prev=new Map();
      const witness=(o)=>{
        const skin=o?.getObjectByProperty('isSkinnedMesh',true);
        if(!skin||!isVisible(skin)||!skin.skeleton.bones.length)return null;
        const points=[],obstacles=[],kind=skin.geometry.getAttribute('surfaceKind'),pos=skin.geometry.getAttribute('position');
        air.traverseVisible(m=>{if(m.isMesh&&!m.material.transparent&&!m.isInstancedMesh&&!o.getObjectById(m.id))obstacles.push(m);});
        skin.skeleton.update();
        // Sample the real deformed skin, not the bind box or a point in a bench.
        const samples=new Map();
        for(let i=0;i<pos.count;i+=37){
          skin.getVertexPosition(i,vec);skin.localToWorld(vec);const ndc=vec.clone().project(cam);
          if(ndc.z<0||ndc.z>1||Math.abs(ndc.x)>1||Math.abs(ndc.y)>1)continue;
          points.push([(1+ndc.x)*960,(1-ndc.y)*540]);
          const k=kind?.getX(i)??0;if(![0,2,3].includes(k))continue;
          if(!samples.has(k))samples.set(k,[]);samples.get(k).push(vec.clone());
        }
        if(!points.length)return {skeleton:skin.skeleton.bones.length,visible:false};
        const channels={};
        for(const [k,part] of samples){
          let open=0;for(const frac of [.12,.37,.61,.86]){
            const sample=part[Math.floor((part.length-1)*frac)];
            ray.set(cam.position,p.copy(sample).sub(cam.position).normalize());ray.near=0;ray.far=cam.position.distanceTo(sample)-.008;
            if(!ray.intersectObjects(obstacles,false).length)open++;
          }
          channels[k===2?'face':k===3?'helmet':'uniform']=open;
        }
        const xs=points.map(v=>v[0]),ys=points.map(v=>v[1]);
        return {visible:Object.values(channels).some(v=>v>0),unblockedSamples:channels,scale:o.getWorldScale(vec).toArray(),
          skeleton:skin.skeleton.bones.length,drawGeometry:skin.geometry.uuid,material:skin.material.uuid,worldOrigin:v3(o),
          pixelBox:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].map(Math.round)};
      };
      s.internal.subscribe({current:({gl})=>{
        if(!air.visible||q.next>=cues.length||!(clock.userData.flightTime>.2))return;
        const t=clock.userData.flightTime,rows=roots();q.samples++;
        for(const {id,seat,ground} of rows){
          const o=seat??ground;if(!o)continue;
          const owner=seat?'aboard':'ground',origin=v3(o),last=prev.get(id);
          if(last?.owner==='aboard'&&owner==='ground'){
            const local=air.worldToLocal(vec.fromArray(origin)).toArray();
            q.moves.push({id,lastAboard:last.t,firstGround:t,gap:dist(origin,last.origin),lastAboardOrigin:last.origin,groundOrigin:origin,groundLocal:local});
          }else if(!baseline&&last?.owner==='ground'&&owner==='aboard')fault(id+' remounted');
          prev.set(id,{owner,origin,t});
        }
        const [label,at]=cues[q.next];
        if(t<at || (!baseline&&((label==='ground-handoff'&&!rows[0].ground)||(label==='cabin-empty'&&rows.some(r=>r.seat)))))return;
        const png=gl.domElement.toDataURL('image/png');if(png==='data:,'){fault('missing rendered buffer');return;}
        q.frames[label]=png.slice(png.indexOf(',')+1);
        const shots=rows.map(({id,seat,ground})=>({id,owner:seat?'aboard':ground?'ground':'absent',body:witness(seat??ground)}));
        q.rows.push({label,t,goal:at,clockSource:clock.name,manifestMounted:!!manifest,air:air.position.toArray(),camera:cam.position.toArray(),quaternion:cam.quaternion.toArray(),
          fov:cam.fov,canvas:[gl.domElement.width,gl.domElement.height],shots,gunner:isVisible(air.getObjectByName('seated-door-gunner'))});
        q.next++;
      }},1.9,q.store);
      q.status=()=>{
        const b=s.gl.domElement.getBoundingClientRect();
        return {ready:q.next===cues.length,air:air.visible,fail:q.faults.slice(),phase:document.querySelector('.nightmare-order')?.className||'',
          yaw:q.tank.rotation.y,spawn:q.tank.position.toArray(),targets:[...(q.sceneProps?.zombiePosesRef.current.values()??[])].filter(o=>o.active).map(o=>{
            const w=o.position.clone();w.y=0;w.project(cam);const x=(w.x+1)*b.width*.5,y=(1-w.y)*b.height*.5;
            return {x,y,z:w.z,world:o.position.toArray(),range:o.position.distanceTo(q.tank.position),clear:document.elementFromPoint(x,y)===s.gl.domElement};
          }).sort((a,b)=>a.range-b.range)};
      };
    },config);
    // Keep the in-game wave challenge real: only ordinary, trusted Playwright
    // clicks/steering until the roster's original airborne transport arrives.
    const until=Date.now()+(mode==='embassy'?240000:95000);let held='',fired=0,strafe=0;
    const steer=async diff=>{const next=Math.abs(diff)<.055?'':diff>0?'a':'d';if(next!==held){
      if(held)await page.keyboard.up(held);if(next)await page.keyboard.down(next);held=next;}};
    while(Date.now()<until){
      const status=await page.evaluate(()=>window.cabinQ.status());
      if(status.ready)break;
      assert.deepEqual(status.fail,[]);
      if(mode==='embassy'&&!status.air){
        assert.ok(!status.phase.includes('defeat'),'embassy wave one lost before flight');
        if(status.phase.includes('intermission')){
          await steer(0);const b=page.locator('.field-kit__proceed');if(await b.count()&&await b.isEnabled())await b.click();
        }else if(status.phase.includes('combat')){
          const target=status.targets.find(v=>v.clear&&v.z>0&&v.z<1&&v.x>30&&v.x<1890&&v.y>30&&v.y<1050);
          if(target){await steer(0);const now=Date.now();await page.mouse.move(target.x,target.y);
            const e=page.getByRole('button',{name:'Arm Eagle Strafe target designator',exact:true});
            if(now-strafe>7000&&status.targets.length>=3&&await e.isVisible()&&await e.isEnabled()){
              await e.click();await page.mouse.click(target.x,target.y);strafe=fired=now;
            }else if(now-fired>750){await page.mouse.click(target.x,target.y);fired=now;}
          }else if(status.targets.length){
            const [x,,z]=status.targets[0].world,delta=Math.atan2(status.spawn[0]-x,status.spawn[2]-z)-status.yaw;
            await steer(Math.atan2(Math.sin(delta),Math.cos(delta)));
          }
        }
      }else if(held)await steer(0);
      await page.waitForTimeout(85);
    }
    const result=await page.evaluate(()=>({rows:window.cabinQ.rows,moves:window.cabinQ.moves,faults:window.cabinQ.faults,samples:window.cabinQ.samples}));
    run.samples=result.samples;run.transfers=result.moves;run.faults=result.faults;
    for(const row of result.rows){
      const file=(baseline?'baseline-':'')+mode+'-'+row.label+'.png',data=Buffer.from(await page.evaluate(k=>window.cabinQ.frames[k],row.label),'base64');
      await writeFile(join(out,file),data);run.shots.push({...row,file,bytes:data.length,sha256:sha(data)});
      console.log(mode,row.label,row.t.toFixed(2),row.shots.filter(o=>o.owner==='aboard').length+' aboard');
      assert.deepEqual(row.canvas,[1920,1080]);assert.equal(row.gunner,true);assert.ok(data.length>10000);
    }
    assert.deepEqual(result.faults,[]);assert.equal(run.shots.length,5,'missing production cabin moment');
    assert.ok(run.shots.every(r=>Math.abs(r.t-r.goal)<.27),'clock missed a phase: '+run.shots.map(r=>(r.t-r.goal).toFixed(2)));
    if(baseline){
      run.ticketChecks='not evaluated; original observations only';
      assert.ok(run.shots.every(r=>!r.manifestMounted),'original R14 should not contain the new manifest');
      return;
    }
    const [near,far,sill,ground,empty]=run.shots;
    for(const shot of [near,far])assert.ok(shot.shots.every(a=>a.owner==='aboard'&&a.body?.skeleton>8),'missing live seated volume');
    for(const id of config.ids){
      assert.ok([near,far].some(sh=>sh.shots.find(a=>a.id===id)?.body?.visible),'neither doorway view sees '+id);
    }
    assert.ok(sill.shots[0].owner==='aboard'&&sill.shots[0].body?.visible,'first ticket not visible at sill');
    assert.ok(ground.shots[0].owner==='ground'&&ground.shots[0].body?.visible,'no visible first handoff');
    assert.ok(empty.shots.every(a=>a.owner==='ground'),'cabin not depleted');
    assert.deepEqual(result.moves.map(m=>m.id),config.ids,'each existing ticket must transition once and in order');
    for(const m of result.moves)assert.ok(m.gap<.22 && Math.abs(Math.abs(m.groundLocal[0])-.86)<.22 && Math.abs(m.groundLocal[2]-.22)<.22,
      m.id+' visual teleport at threshold: '+JSON.stringify(m));
    run.ticketChecks='passed';
  }finally{await ctx.close();}
}
try{
  for(const mode of which==='both'?['campaign','embassy']:[which])await fly(mode);
  assert.deepEqual(receipt.errors,[]);receipt.captureComplete=true;receipt.pass=!baseline;
}catch(error){receipt.error=error.message;throw error;}finally{
  await writeFile(join(out,'transport-cabin-'+(baseline?'baseline-':'')+which+'.json'),JSON.stringify(receipt,null,2));
  await browser.close();
}
