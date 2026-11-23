// Unmodified driver view, with its actual HUD, in the live embassy encounter.
// The only staged actions use the ordinary friendly-rifle damage callback.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const {chromium}=createRequire(import.meta.url)('playwright');
const [port,bundle,folder]=process.argv.slice(2);
assert(/^\d{4,5}$/.test(port)&&/^GameSession-[\w-]+\.js$/.test(bundle)&&folder);
const origin='http://127.0.0.1:'+port,out=resolve(folder),dir=resolve(out,'motion');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[];
const report={bundle,method:'Full-screen Chrome compositor capture of the real driver HUD and native chase; no orbit, input, actor movement, camera, DPR, light, mask phase, or health property edits. Friendly hit callback clears early waves, stages 52%, then crosses the actual half-health threshold in view.'};
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS.*false|context lost/i.test(m.text()))errors.push(m.text());});
try{
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
  await page.goto(origin+'/?ghostSignal=embassy');
  await page.getByRole('button',{name:/^Embassy approach/i}).click();
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Virtual browser field only');
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const t=h.memoizedState?.current;if(t?.name==='player-tank'){window.driverStore=t.__r3f.root;return true;}
    }return false;
  },null,{timeout:90000});
  report.url=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(u=>/\/GameSession-[\w-]+\.js/.test(u)));
  assert.equal(report.url,origin+'/assets/'+bundle);
  await page.evaluate(()=>{
    const el=document.querySelector('.scene-container');
    const walk=v=>{if(Array.isArray(v)){for(const x of v){const b=walk(x);if(b)return b;}return;}
      const p=v?.props;return p?.onZombieHit&&p.zombies&&p.zombiePosesRef?p:walk(p?.children??[]);};
    window.hordeForDrop=()=>walk(el[Object.keys(el).find(k=>k.startsWith('__reactProps$'))].children);
  });
  await page.waitForFunction(()=>{
    const hud=document.querySelector('.nightmare-order'),wave=Number(hud?.innerText.match(/wave\s+(\d+)\s*\//i)?.[1]),h=window.hordeForDrop();
    if(wave===4)return !!h?.zombies.find(z=>z.wave===4&&z.alive&&z.archetype==='boss');
    if(!h||![1,2,3].includes(wave)||!hud?.classList.contains('is-combat'))return false;
    for(const z of h.zombies){const p=h.zombiePosesRef.current.get(z.id);if(z.wave===wave&&z.alive&&p?.active&&z.archetype==='standard'){
      h.onZombieHit({soldierId:'driver-mask-setup',zombieId:z.id,position:p.position.clone(),damage:z.health});}}
    return false;
  },null,{timeout:210000,polling:140});
  const cdp=await page.context().newCDPSession(page),frames=[];
  cdp.on('Page.screencastFrame',e=>{
    void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});
    frames.push({epoch:e.metadata.timestamp,data:e.data});
    while(frames.length>1&&frames.at(-1).epoch-frames[0].epoch>6)frames.shift();
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:93,maxWidth:1920,maxHeight:1080,everyNthFrame:2});
  console.log('Wave four; untouched driver HUD recording',bundle);
  try{
    await page.evaluate(()=>{
      const st=window.driverStore,s=st.getState(),{camera,scene,gl}=s,vec=()=>camera.position.clone();
      const r=scene.getObjectByName('nightmare-boss-sculpt'),m=scene.getObjectByName('command-portrait-masks');
      const heads=['command-double-faced-skull','command-watchers-skull'].map(n=>r.getObjectByName(n));
      const crowns=['command-lead-crown','command-watcher-crown'].map(n=>r.getObjectByName(n));
      const masks=['command-harris-mask','command-joe-mask'].map(n=>m.getObjectByName(n));
      const p=vec(),root=vec(),previousCamera=camera.position.clone(),previousQ=camera.quaternion.clone(),fov=camera.fov,lens=camera.uuid;
      const rnd=n=>Math.round(n*1000)/1000,arr=v=>v.toArray().map(rnd);
      const screen=v=>{v.project(camera);return [rnd((1+v.x)*960),rnd((1-v.y)*540),rnd(v.z)];};
      const support=heads.map((h,i)=>[h,crowns[i]].map(o=>{
        const pos=o.geometry.attributes.position,picks=new Set();
        for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1]){
          if(!x&&!y&&!z)continue;let id=0,best=-Infinity;
          for(let j=0;j<pos.count;j++){const v=x*pos.getX(j)+y*pos.getY(j)+z*pos.getZ(j);if(v>best){best=v;id=j;}}picks.add(id);
        }
        return {o,points:[...picks].map(j=>vec().fromBufferAttribute(pos,j))};
      }));
      const boxes=()=>support.map(parts=>{
        const points=parts.flatMap(({o,points})=>points.map(v=>screen(p.copy(v).applyMatrix4(o.matrixWorld))));
        return [Math.min(...points.map(a=>a[0])),Math.min(...points.map(a=>a[1])),Math.max(...points.map(a=>a[0])),Math.max(...points.map(a=>a[1])),Math.max(...points.map(a=>a[2]))];
      });
      const log=window.driverDrop={samples:[],hits:[],done:false};
      const hit=(h,z,p,ratio,epoch)=>{
        const target=z.maxHealth*ratio;if(z.health<=target)throw Error('Staging already below '+ratio);
        const dmg=(z.health-target)/.25;
        log.hits.push({epoch,before:z.health,requested:target,source:'friendly-rifle',callbackDamage:dmg});
        h.onZombieHit({soldierId:'driver-mask-threshold',zombieId:z.id,position:p.position.clone(),damage:dmg});
      };
      let lastSample=0,stage=0,stageEpoch=-Infinity,hitEpoch=-Infinity;
      s.internal.subscribe({current:()=>{
        if(log.done||!r.visible||document.querySelector('.nightmare-takeover'))return;
        const h=window.hordeForDrop(),z=h?.zombies.find(z=>z.wave===4&&z.alive&&z.archetype==='boss'),pose=z&&h.zombiePosesRef.current.get(z.id);if(!pose?.active)return;
        const epoch=(performance.timeOrigin+performance.now())/1000;
        r.getWorldPosition(root);if(root.x>13||root.z> -13||epoch-lastSample<.016)return;lastSample=epoch;
        r.updateWorldMatrix(true,true);m.updateWorldMatrix(true,true);
        const headsOnScreen=boxes(),opacity=heads[0].material.opacity;
        const hudTop=document.querySelector('.header').getBoundingClientRect().bottom;
        const good=headsOnScreen.every(([l,t,rr,b,d])=>l>290&&rr<1570&&t>hudTop+12&&b<700&&d>0&&d<1)&&opacity>.90;
        const row={epoch,t:s.clock.elapsedTime,hp:z.health,max:z.maxHealth,id:z.id,root:arr(root),bounds:headsOnScreen,good,
          phase:m.userData.phase,age:rnd(m.userData.age),drops:m.userData.drops,opacity:rnd(opacity),
          maskPixels:masks.map(o=>screen(o.getWorldPosition(p))),masksVisible:masks.map(o=>!!(o.visible&&m.visible&&o.material.visible)),
          camera:arr(camera.position),cameraDirection:arr(camera.getWorldDirection(p)),fov:camera.fov,buffer:[gl.domElement.width,gl.domElement.height],
          unchanged:camera.uuid===lens&&Math.abs(camera.fov-fov)<.00001&&camera.position.distanceTo(previousCamera)<.0001&&camera.quaternion.angleTo(previousQ)<.0001};
        log.samples.push(row);
        if(stage===0&&root.x<7.4&&root.z< -14&&good&&row.phase==='worn'&&row.masksVisible.every(Boolean)){
          stage=1;stageEpoch=epoch;hit(h,z,pose,.52,epoch);
        }else if(stage===1&&epoch-stageEpoch>.50&&root.x<4.8&&good&&row.phase==='worn'&&row.hp/row.max>.50&&row.hp/row.max<=.52){
          stage=2;hitEpoch=epoch;hit(h,z,pose,.50,epoch);
        }else if(stage===2&&epoch-hitEpoch>2.55&&row.phase==='shed')log.done=true;
      }},.91,st);
    });
    await page.waitForFunction(()=>window.driverDrop.done,null,{timeout:65000,polling:70});
  }finally{await cdp.send('Page.stopScreencast');await cdp.detach();}
  const data=await page.evaluate(()=>window.driverDrop);Object.assign(report,data);
  const event=data.hits[1].epoch,firstShed=data.samples.find(s=>s.epoch>event&&s.phase==='shed'&&s.good);
  assert(firstShed,'No in-view fully revealed phase');
  const end=event+Math.min(2.54,Math.max(2.40,firstShed.epoch-event+.15)),begin=event-.42;
  const f=frames.filter(k=>k.epoch>=begin&&k.epoch<=end);
  assert(f.length>=22&&f.at(-1).epoch-f[0].epoch>2.56,'Not a continuous full driver event');
  const rows=data.samples.filter(s=>s.epoch>=begin&&s.epoch<=end);
  const nearest=(a,t,fn)=>a.reduce((x,y)=>Math.abs(fn(x)-t)<=Math.abs(fn(y)-t)?x:y);
  const shotRows=[['above',nearest(rows.filter(s=>s.epoch<event-.055&&s.phase==='worn'&&s.hp/s.max>.5&&s.hp/s.max<=.52&&s.good),event-.18,s=>s.epoch)],
    ['falling',nearest(rows.filter(s=>s.phase==='falling'&&s.drops===1&&s.good&&s.masksVisible.every(Boolean)),.53,s=>s.age)],
    ['revealed',nearest(data.samples.filter(s=>s.epoch>event&&s.phase==='shed'&&s.drops===1&&s.good&&!s.masksVisible.some(Boolean)),end-.07,s=>s.epoch)]];
  const ids=rows.map(s=>s.id);assert(new Set(ids).size===1&&rows.every(s=>s.unchanged));
  assert.equal(shotRows[1][1].drops,1);assert(shotRows[1][1].hp<=shotRows[1][1].max*.50&&shotRows[2][1].hp<=shotRows[2][1].max*.50);
  const threshold=rows.find(s=>s.epoch>=event&&s.hp<=s.max/2);
  assert(threshold&&threshold.drops<=1);
  report.transition={from:shotRows[0][1].hp,callbackRequested:data.hits[1].requested,firstAtOrBelowHalf:threshold.hp,max:threshold.max,
    drops:shotRows[2][1].drops,lensUnchanged:rows.every(s=>s.unchanged),minOpacity:Math.min(...rows.map(s=>s.opacity)),
    bothCrownsVisibleThroughout:rows.every(s=>s.good),afterSeconds:firstShed.epoch-event};
  const lines=[];for(const [i,frame] of f.entries()){const fn='frame-'+String(i).padStart(3,'0')+'.jpg';frame.name=fn;
    await writeFile(resolve(dir,fn),Buffer.from(frame.data,'base64'));delete frame.data;
    lines.push("file '"+fn+"'","duration "+Math.max(.001,(f[i+1]?.epoch??frame.epoch+.033)-frame.epoch).toFixed(5));
  }
  await writeFile(resolve(dir,'frames.txt'),lines.join('\n')+'\n');
  report.stills=[];for(const [name,row] of shotRows){const shot=nearest(frames,row.epoch,k=>k.epoch);
    assert(Math.abs(shot.epoch-row.epoch)<.080,'No close rendered HUD frame');
    if(shot.name)await copyFile(resolve(dir,shot.name),resolve(out,name+'.jpg'));
    else await writeFile(resolve(out,name+'.jpg'),Buffer.from(shot.data,'base64'));
    report.stills.push({name,source:shot.name??'full HUD; after film end',frameDeltaMs:Math.round((shot.epoch-row.epoch)*1000),...row});
  }
  report.movie={file:'driver-mask-drop.mp4',source:'Actual HUD compositor frames',frameCount:f.length,seconds:f.at(-1).epoch-f[0].epoch,frames:f.map(({name,epoch})=>({name,epoch}))};
  const v=spawnSync('ffmpeg',['-y','-nostdin','-loglevel','error','-f','concat','-safe','1','-i','frames.txt','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',resolve(out,'driver-mask-drop.mp4')],{cwd:dir});
  assert.equal(v.status,0,String(v.stderr));assert.deepEqual(errors,[]);
  console.log('Verified unaltered driver mask drop',bundle,report.stills.map(s=>[s.name,s.hp,s.phase]),report.movie.seconds);
}finally{
  if(!report.samples)Object.assign(report,(await page.evaluate(()=>window.driverDrop??{}).catch(()=>({}))));
  report.errors=errors;await writeFile(resolve(out,'receipt.json'),JSON.stringify(report,null,2));await browser.close();
}
