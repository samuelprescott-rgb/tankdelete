// PORT OUTPUT_DIRECTORY RETAINED_DIST; no desktop bridge, host-file access, or gameplay edits.
// Waves 1–3 are advanced with the existing simulated encounter's normal hit callback.
// Wave four receives no input. Only the inspection camera moves; heroes are never staged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const [portArg,outArg,distArg]=process.argv.slice(2), port=Number(portArg);
assert(Number.isInteger(port)&&port>1024&&port<65536&&outArg&&distArg,'Usage: capture-named-allies.mjs PORT OUTPUT_DIRECTORY RETAINED_DIST');
const require=createRequire(import.meta.url),{chromium}=require('playwright'), sharp=require('sharp');
const out=resolve(outArg),dist=resolve(distArg),origin='http://127.0.0.1:'+port;
const definitions=[
  {id:'boss-ally-atlas',name:'Arnold Schwarzenegger',role:'heavy-gunner'},
  {id:'boss-ally-sagamore',name:'Theodore Roosevelt',role:'mounted-cavalry'},
  {id:'boss-ally-redwood',name:'Rambo',role:'rifle-scout'},
];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={status:'incomplete',route:'Embassy approach / final wave',origin,dist,assets:{},shots:[],errors:[],
  method:'Public simulated embassy training; accelerated only waves 1–3. In wave 4 the camera watches existing, active actors at their own pose. No change to actors, lights, AI, encounter clock or player input. No HUD portraits used as model images.'};
await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(join(dist,'.vite/manifest.json'),'utf8'));
const expectedChunks=new Set(Object.values(manifest).flatMap(r=>[r.file,...(r.css??[])]));
const game=Array.from(expectedChunks).find(x=>/^assets\/GameSession-[\w-]+\.js$/.test(x));
assert.ok(game,'Retained directory lacks a production GameSession manifest');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS.*false|WebGLProgram.*ERROR/i.test(m.text()))report.errors.push(m.text());});
  const pending=[];
  page.on('response',r=>{
    const u=new URL(r.url());if(u.origin!==origin)return;
    const path=u.pathname.slice(1)||'index.html';
    if(path!=='index.html'&&!/^assets\/[\w.-]+\.(?:js|css)$/.test(path))return;
    const verify=(async()=>{
      assert.ok(r.ok(),path+' HTTP '+r.status());
      assert.ok(path==='index.html'||expectedChunks.has(path),'Unexpected executable asset '+path);
      const actual=digest(await r.body());assert.equal(actual,digest(await readFile(join(dist,path))),'Retained artifact mismatch: '+path);
      report.assets[path]=actual;
    })();pending.push(verify);void verify.catch(()=>{});
  });
  await page.goto(origin+'/?ghostSignal=embassy');
  await page.getByRole('button',{name:/^Embassy approach/i}).click();
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Expected an isolated browser, not a native bridge');
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const tank=h.memoizedState?.current;if(tank?.name==='player-tank'&&tank.__r3f?.root){window.__heroPhotoStore=tank.__r3f.root;return true;}
    }return false;
  },null,{timeout:105000});
  await Promise.all(pending);assert.ok(report.assets[game]&&report.assets['index.html'],'Did not load the retained production app');
  // Open the normal encounter, following the established embassy-photo setup. No hero is hit or moved.
  await page.waitForFunction(()=>{
    const hud=document.querySelector('.nightmare-order'),wave=Number(hud?.textContent.match(/wave\s+(\d+)\s*\//i)?.[1]);
    if(wave===4)return document.querySelectorAll('.boss-allies .boss-ally.is-active').length===3;
    if(![1,2,3].includes(wave)||!hud.classList.contains('is-combat'))return false;
    const c=document.querySelector('.scene-container'), props=c?.[Object.keys(c).find(k=>k.startsWith('__reactProps$'))];
    function find(el){
      if(Array.isArray(el)){for(const child of el){const r=find(child);if(r)return r;}return;}
      if(!el?.props)return;const p=el.props;
      return p.friendlies&&p.zombies&&p.zombiePosesRef&&p.onZombieHit?p:find(p.children);
    }
    const p=find(props?.children);if(!p)return false;
    for(const z of p.zombies)if(z.alive&&z.wave===wave&&z.archetype==='standard'){
      const pose=p.zombiePosesRef.current.get(z.id);if(pose?.active)p.onZombieHit({soldierId:'photo-setup',zombieId:z.id,position:pose.position.clone(),damage:z.health});
    }return false;
  },null,{polling:100,timeout:210000});
  // DOM status can commit before the R3F subtree/CC0 face finishes mounting.
  // Do not photograph the previous frame or accept three HUD cards as models.
  const hudReadyAt=Date.now();await page.waitForFunction(ids=>{
    const root=window.__heroPhotoStore?.getState().scene;
    return ids.every(id=>{const a=root?.getObjectByName(id);if(!a?.visible)return false;
      let seen=false;a.traverseVisible(m=>{if(m.isSkinnedMesh&&m.skeleton?.bones.some(b=>b.name==='head'))seen=true;});return seen;});
  },definitions.map(v=>v.id),{polling:'raf',timeout:20000});
  report.hudToConfirmedMountedMs=Date.now()-hudReadyAt;
  const cameraFrames=await page.evaluate(async definitions=>{
    const store=window.__heroPhotoStore,s=store.getState(),{scene,camera,gl,clock,internal}=s;
    const rows=definitions.map(d=>{
      const card=document.querySelector('.boss-ally.is-active.is-'+d.role),actor=scene.getObjectByName(d.id);
      if(card?.querySelector('strong')?.textContent!==d.name||!actor)throw Error('Missing named, active ally: '+d.name);
      let human;const mountLegs=[];
      actor.traverseVisible(m=>{
        if(!m.isSkinnedMesh)return;
        if(m.skeleton.bones.some(b=>b.name==='head'))human=m;
        else if(m.skeleton.bones.length===3)mountLegs.push(m);
      });
      if(!human||mountLegs.length!==(d.role==='mounted-cavalry'?4:0))throw Error('Unexpected mounted model: '+d.name);
      const geom=human.geometry,att=geom.attributes,skin=att.skinIndex,weights=att.skinWeight;
      const head=human.skeleton.bones.find(b=>b.name==='head'),headIndex=human.skeleton.bones.indexOf(head);
      let weightedHead=0;
      for(let i=0;i<skin.count;i++)if(skin.getX(i)===headIndex&&weights.getX(i)>.7)weightedHead++;
      if(!human.material.isMeshStandardMaterial||!att.color||!att.normal||weightedHead<100)throw Error('No weighted, properly shaded facial geometry: '+d.name);
      return {d,actor,human,head,mountLegs,identity:{id:d.id,name:d.name,role:d.role,hudRole:card.querySelector('small').textContent,
        actorUuid:actor.uuid,bodyUuid:human.uuid,headWeightedVertices:weightedHead,vertices:att.position.count,
        bones:human.skeleton.bones.map(b=>b.name),mountLegs:mountLegs.length}};
    });
    const plan=['figure','portrait'].flatMap(view=>rows.map(r=>({view,...r})));
    const eye=camera.position.clone(),aim=eye.clone(),world=eye.clone(),original=camera.position.clone(),rotation=camera.quaternion.clone();
    const shots=[],pictures=[];let frame=0,settled=0,finish,fail,done=false,meta=null;
    const doneP=new Promise((ok,no)=>{finish=ok;fail=no;});
    const marks=rows.map(()=>-1);
    const restores=rows.map(({human},idx)=>{
      const original=human.onAfterRender;
      human.onAfterRender=function(r,sc,cam,...rest){
        const ret=original.call(this,r,sc,cam,...rest);if(r===gl&&sc===scene&&cam===camera)marks[idx]=frame;return ret;
      };
      return ()=>{human.onAfterRender=original;};
    });
    const opaque=document.createElement('canvas');opaque.width=40;opaque.height=24;const probe=opaque.getContext('2d',{willReadFrequently:true});
    const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
    const pose=internal.subscribe({current:()=>{
      if(done)return;
      try{
        frame++;meta=null;const p=plan[shots.length],{actor,head,d,view}=p;
        if(!document.querySelector('.boss-ally.is-active.is-'+d.role)||!visible(actor))throw Error('Ally no longer active: '+d.name);
        actor.updateWorldMatrix(true,true);
        const h=actor.worldToLocal(head.getWorldPosition(world)),mounted=d.role==='mounted-cavalry';
        const lap=view==='figure';
        if(lap){
          const target=mounted?1.27:.86;aim.set(0,target,-.10);
          eye.set(mounted?2.45:1.27,mounted?2.03:1.39,mounted?-2.42:-1.74);
        }else{
          aim.copy(h).add(world.clone().set(.012,.115,-.04));eye.copy(h).add(world.clone().set(.27,.215,-.63));
        }
        camera.position.copy(actor.localToWorld(eye));camera.lookAt(actor.localToWorld(aim));camera.updateMatrixWorld(true);
        meta={...p.identity,view,frame,time:clock.elapsedTime,eye:camera.position.toArray(),lookAt:aim.toArray(),
          actorPosition:actor.getWorldPosition(world).toArray(),pose:p.human.skeleton.bones.map(b=>({bone:b.name,rotation:b.quaternion.toArray()})),
          headNdc:head.getWorldPosition(world).project(camera).toArray()};
        settled++;
      }catch(e){done=true;fail(e);}
    }},.91,store);
    const read=internal.subscribe({current:()=>{
      if(done||!meta||settled<4||marks[shots.length%rows.length]!==frame)return;
      try{
        const W=gl.domElement.width,H=gl.domElement.height;if(W<950||H<530)return;
        const full=document.createElement('canvas');full.width=W;full.height=H;full.getContext('2d').drawImage(gl.domElement,0,0);
        probe.clearRect(0,0,40,24);probe.drawImage(full,0,0,40,24);
        const rgba=probe.getImageData(0,0,40,24).data;let minA=255,lo=255,hi=0;
        for(let i=0;i<rgba.length;i+=4){const v=rgba[i]*.25+rgba[i+1]*.5+rgba[i+2]*.25;lo=Math.min(lo,v);hi=Math.max(hi,v);minA=Math.min(minA,rgba[i+3]);}
        if(minA!==255||hi-lo<38)return;
        if(meta.headNdc.some(v=>!Number.isFinite(v)||Math.abs(v)>=1))throw Error('Head outside frame: '+meta.name);
        shots.push({...meta,buffer:[W,H],pixels:{minAlpha:minA,valueSpan:hi-lo},bodyDrawObserved:true});pictures.push(full);settled=0;
        if(shots.length===plan.length){done=true;finish();}
      }catch(e){done=true;fail(e);}
    }},10,store);
    const timeout=setTimeout(()=>{done=true;fail(Error('Incomplete photos: '+shots.map(s=>s.id+'/'+s.view).join(', ')));},60000);
    try{await doneP;return {shots,images:pictures.map(x=>x.toDataURL('image/png').split(',')[1])};}
    finally{clearTimeout(timeout);read();pose();restores.forEach(f=>f());camera.position.copy(original);camera.quaternion.copy(rotation);camera.updateMatrixWorld(true);}
  },definitions);
  await Promise.all(pending);
  assert.deepEqual(report.errors,[]);
  const layers=[],PW=512,PH=288,B=50;
  for(const [i,shot] of cameraFrames.shots.entries()){
    const bytes=Buffer.from(cameraFrames.images[i],'base64'),file=shot.id+'-'+shot.view+'.png';
    await writeFile(join(out,file),bytes);report.shots.push({...shot,file,sha256:digest(bytes)});
    const x=i%3*PW,y=Math.floor(i/3)*(PH+B);
    layers.push({input:await sharp(bytes).resize(PW,PH,{fit:'contain'}).png().toBuffer(),left:x,top:y+B},
      {input:Buffer.from('<svg width="'+PW+'" height="'+B+'"><rect width="100%" height="100%" fill="#1d282a"/><g font-family="Helvetica,Arial"><text x="14" y="21" fill="#f4e6c3" font-size="17">'+shot.name+'</text><text x="14" y="40" fill="#c3ccbc" font-size="14">'+shot.hudRole+' · '+shot.view.toUpperCase()+'</text></g></svg>'),left:x,top:y});
  }
  await sharp({create:{width:PW*3,height:(PH+B)*2,channels:3,background:'#1d282a'}}).composite(layers).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toFile(join(out,'named-allies.jpg'));
  report.status='captured';console.log('Captured all three named, live allies from '+game+' in '+out);
}catch(e){report.error=String(e);throw e;}
finally{await writeFile(join(out,'named-allies.json'),JSON.stringify(report,null,2));await browser.close();}
