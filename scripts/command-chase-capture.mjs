import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

// Separate real play session. No orbit, DPR override, hidden HUD, teleports,
// camera edits, attacks or ally edits in wave four. Earlier waves are cleared
// with the same hit callback used by the existing photo inspector.
export async function recordCommandChase(page,port,out){
  await page.goto('http://127.0.0.1:'+port+'/?ghostSignal=embassy');
  await page.getByRole('button',{name:/^Embassy approach/i}).click();
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Browser-only review');
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const tank=h.memoizedState?.current;if(tank?.name!=='player-tank')continue;
      window.commandScene=tank.__r3f.root;return true;
    }return false;
  },null,{timeout:120000});
  await page.evaluate(()=>{
    const store=window.commandScene,s=store.getState(),{scene,camera}=s,boss=scene.getObjectByName('nightmare-boss-sculpt');
    const p=camera.position.clone(),h=p.clone(),sample=[],hips=boss.getObjectByName('command-weight-bearing-chest');
    const feet=['left','right'].map(n=>boss.getObjectByName('command-leg-'+n).getObjectByName('boot'));
    const pelvis=boss.getObjectByName('command-pelvis');
    const heads=['command-double-faced-skull','command-watchers-skull'].map(n=>boss.getObjectByName(n));
    const upper=['command-upper-0','command-striking-arm'].map(n=>boss.getObjectByName(n));
    const lens=camera.uuid,round=v=>Math.round(v*1000)/1000;
    const screen=v=>{v.project(camera);return [(1+v.x)*960,(1-v.y)*540].map(round);};
    // Sample support vertices on each actual skull/crown/jaw once; do not
    // substitute an arbitrary root-height proxy or touch the game camera.
    const surfaces=heads.map(head=>{
      const list=[];head.traverse(o=>{
        if(!o.geometry)return;
        const pos=o.geometry.getAttribute('position'),chosen=new Set();
        for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1]){
          if(x===0&&y===0&&z===0)continue;let peak=-Infinity,at=0;
          for(let i=0;i<pos.count;i++){const score=x*pos.getX(i)+y*pos.getY(i)+z*pos.getZ(i);if(score>peak){peak=score;at=i;}}
          chosen.add(at);
        }
        list.push({o,points:[...chosen].map(i=>p.clone().fromBufferAttribute(pos,i))});
      });return list;
    });
    const facts=()=>heads.map((head,i)=>{
      const points=surfaces[i].flatMap(({o,points})=>points.map(v=>screen(h.copy(v).applyMatrix4(o.matrixWorld))));
      const bounds=[Math.min(...points.map(v=>v[0])),Math.min(...points.map(v=>v[1])),
        Math.max(...points.map(v=>v[0])),Math.max(...points.map(v=>v[1]))];
      const direction=h.set(0,0,-1).transformDirection(head.matrixWorld);
      const facing=direction.dot(head.getWorldPosition(p).sub(camera.position).negate().normalize());
      return {bounds,facing:round(facing),shoulder:screen(upper[i].getWorldPosition(p))};
    });
    let last=0;
    window.chaseFacts=sample;
    s.internal.subscribe({current:()=>{
      if(!boss.visible||!hips.visible||document.querySelector('.nightmare-takeover') || performance.now()-last<65)return;
      last=performance.now();boss.updateWorldMatrix(true,true);
      const epoch=(performance.timeOrigin+last)/1000,root=boss.getWorldPosition(p).toArray();
      const footPixel=p.clone().project(camera);
      h.set(0,1.54,0).applyMatrix4(boss.matrixWorld).project(camera);
      sample.push({epoch,root,footPixel:[(1+footPixel.x)*960,(1-footPixel.y)*540],headPixel:[(1+h.x)*960,(1-h.y)*540],depth:h.z,
        camera:camera.position.toArray(),cameraDir:camera.getWorldDirection(p).toArray(),feet:feet.map(f=>f.getWorldPosition(p).toArray()),
        pelvis:pelvis?.getWorldPosition(p).toArray(),feetOnScreen:feet.map(f=>screen(f.getWorldPosition(p))),
        measuredHeads:facts(),hudBottom:document.querySelector('.header').getBoundingClientRect().bottom,
        originalChaseLens:s.camera.uuid===lens,verticalFov:s.camera.fov,
        opacity:boss.getObjectByName('command-double-faced-skull').material.opacity});
    }},.91,store);
  });
  await page.waitForFunction(()=>{
    const panel=document.querySelector('.nightmare-order'),wave=Number(panel?.innerText.match(/wave\s+(\d+)\s*\//i)?.[1]);
    if(wave===4)return true;
    if(![1,2,3].includes(wave)||!panel.classList.contains('is-combat'))return false;
    const c=document.querySelector('.scene-container'),walk=el=>{if(!el)return;if(Array.isArray(el)){for(const it of el){const v=walk(it);if(v)return v;}return;}
      const p=el.props;return p?.onZombieHit&&p.zombiePosesRef&&p.zombies?p:walk(p?.children);};
    const p=walk(c[Object.keys(c).find(k=>k.startsWith('__reactProps$'))].children);if(!p)return false;
    for(const z of p.zombies){const pose=p.zombiePosesRef.current.get(z.id);if(z.wave===wave&&z.alive&&pose?.active&&z.archetype==='standard')
      p.onZombieHit({soldierId:'chase-setup',zombieId:z.id,position:pose.position.clone(),damage:z.health});}
    return false;
  },null,{polling:150,timeout:210000});
  const cdp=await page.context().newCDPSession(page),dir=resolve(out,'chase-frames');await mkdir(dir,{recursive:true});
  const frames=[],pending=[];
  cdp.on('Page.screencastFrame',e=>{
    void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});
    const name='player-'+String(frames.length).padStart(4,'0')+'.jpg';
    frames.push({name,epoch:e.metadata.timestamp});
    pending.push(writeFile(resolve(dir,name),Buffer.from(e.data,'base64')));
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:88,maxWidth:1920,maxHeight:1080,everyNthFrame:2});
  try{
    await page.waitForFunction(()=>window.chaseFacts.length>=2,null,{timeout:65000});
    // Following the retained clip length is independent of whether the actor
    // enters the view, so the very same recorder can also prove the old miss.
    const field=process.env.REVIEW_MATCH_COURT==='1';
    await page.waitForFunction(field=>{
      const s=window.chaseFacts,now=performance.timeOrigin/1000+performance.now()/1000,t=now-s[0].epoch;
      if(!field)return t>=12;
      const at=s.find(row=>row.opacity>.84&&Math.hypot(row.root[0]-5.5,row.root[2]+17.9)<.45);
      return at&&now-at.epoch>=2.2 || t>=28;
    },field,{timeout:48000,polling:120});
  }finally{
    await cdp.send('Page.stopScreencast');await cdp.detach();await Promise.all(pending);
  }
  const info=await page.evaluate(()=>({samples:window.chaseFacts,bundle:performance.getEntriesByType('resource').map(e=>e.name)
    .find(u=>/\/GameSession-[\w-]+\.js/.test(u)),hud:document.querySelector('.nightmare-order')?.innerText}));
  const samples=info.samples,f=frames.filter(a=>a.epoch>=samples[0].epoch-.20);
  assert.ok(f.length>=20&&f.at(-1).epoch-f[0].epoch>7,'Actual animated player segment with HUD');
  const lines=f.flatMap((r,i)=>["file '"+r.name+"'","duration "+Math.max(.001,(f[i+1]?.epoch??r.epoch+.06)-r.epoch).toFixed(4)]);
  await writeFile(resolve(dir,'frames.txt'),lines.join('\n')+'\n');
  const v=spawnSync(process.env.FFMPEG??'ffmpeg',['-y','-loglevel','error','-f','concat','-safe','1','-i','frames.txt',
    '-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',resolve(out,'boss-player-chase.mp4')],{cwd:dir});
  assert.equal(v.status,0,String(v.stderr));
  const visible=s=>s.depth>0&&s.depth<1&&s.headPixel[0]>280&&s.headPixel[0]<1580&&s.headPixel[1]>65&&s.footPixel[1]<820&&s.footPixel[1]-s.headPixel[1]>200;
  const onCourt=s=>s.root[0]<14.1&&s.root[0]>-12&&s.root[2]<-14.1&&s.root[2]>-20;
  const crossing=samples.filter(s=>visible(s)&&onCourt(s)&&s.opacity>.84);
  const picks=[];
  for(const [name,s] of [['arrival',samples[Math.floor(samples.length*.26)]],
    ['breach',crossing[Math.floor(crossing.length*.19)]??samples[Math.floor(samples.length*.50)]],
    ['crossing',crossing[Math.floor(crossing.length*.56)]??samples[Math.floor(samples.length*.73)]],
    ['contact',crossing[Math.floor(crossing.length*.88)]??samples.at(-1)]]){
    const frame=f.reduce((a,b)=>Math.abs(a.epoch-s.epoch)<Math.abs(b.epoch-s.epoch)?a:b);
    await copyFile(resolve(dir,frame.name),resolve(out,'player-'+name+'.jpg'));
    picks.push({name,...s,projectedInCourt:onCourt(s)&&visible(s),selection:crossing.length||name==='arrival'?'encounter':'time-fallback-no-projected-court',
      frame:frame.name,deltaMs:Math.round(1000*(frame.epoch-s.epoch))});
  }
  const late=samples.filter(row=>row.epoch-samples[0].epoch>=9&&row.epoch-samples[0].epoch<=12&&row.depth>0&&row.depth<1);
  const lateMetrics=late.map(s=>{
    const [a,b]=[...s.measuredHeads].sort((left,right)=>left.bounds[0]-right.bounds[0]);
    return {hudClearance:Math.min(a.bounds[1],b.bounds[1])-s.hudBottom,headGap:b.bounds[0]-a.bounds[2],
      leastFacing:Math.min(a.facing,b.facing)};
  });
  const lens=samples[0];
  const unchanged=samples.every(s=>s.originalChaseLens&&s.verticalFov===lens.verticalFov&&s.camera.every((x,i)=>Math.abs(x-lens.camera[i])<.0001)
    &&s.cameraDir.every((x,i)=>Math.abs(x-lens.cameraDir[i])<.0001));
  const lateProjection={samples:late.length,unchangedPlayerLens:unchanged,
    minHudClearance:late.length?Math.min(...lateMetrics.map(s=>s.hudClearance)):null,
    minHeadGap:late.length?Math.min(...lateMetrics.map(s=>s.headGap)):null,
    minFacing:late.length?Math.min(...lateMetrics.map(s=>s.leastFacing)):null};
  const result={...info,frameCount:f.length,seconds:f.at(-1).epoch-f[0].epoch,visible: samples.filter(visible).length,
    projectedForecourtSamples:crossing.length,lateProjection,picks};
  await writeFile(resolve(out,'player-chase.json'),JSON.stringify(result,null,2));
  console.log('Untouched HUD chase',info.bundle,'frames',f.length,'projected courtyard samples',crossing.length,'9-12s actual head bounds',lateProjection);
}
