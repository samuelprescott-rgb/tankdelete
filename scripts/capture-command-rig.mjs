// Inspect the live four-wave production encounter. Only waves 1–3 are staged.
// The measured boss, its pose, AI, geometry, and feet are never repositioned.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {recordCommandChase} from './command-chase-capture.mjs';
import {installCommandPhotoPlanner} from './command-photo-sightlines.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const port=Number(process.argv[2]),out=resolve(process.argv[3]??'tmp/production-qa/command-rig');
assert(Number.isInteger(port)&&port>1024&&port<65536);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(/Shader Error|VALIDATE_STATUS.*false|compileShader.*failed/i.test(e.text()))errors.push(e.text());});
  const fieldOnly=process.env.REVIEW_FIELD_ONLY==='1';
  if(!fieldOnly&&process.env.REVIEW_RIG_ONLY!=='1')await recordCommandChase(page,port,out);
  if(process.env.REVIEW_CHASE_ONLY!=='1'){
  if(fieldOnly || process.env.REVIEW_FIELD_HEROES==='1'){
    await page.goto('http://127.0.0.1:'+port+'/?ghostSignal=river');await page.getByRole('button',{name:/^River crossing/i}).click();
    await page.waitForFunction(()=>{
      const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
      for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
        for(let h=f.memoizedState;h;h=h.next){const o=h.memoizedState?.current;if(o?.name==='player-tank'){window.fieldActors=o.__r3f.root;return true;}}
      return false;},{},{timeout:75000});
    const evidence=[];
    for(const [file,name,eye,aim] of [
      ['hatch-operator','tank-crew-station',[.83,.73,.53],[.046,.34,-.06]],
      ['tank-bow','player-tank',[1.6,1.72,-2.8],[0,.74,-.15]],
      ['tank-flank','player-tank',[2.55,1.82,2.25],[0,.68,0]],
      ['us','us-rto-4',[1.02,1.65,-1.40],[0,1.12,0]],
      ['river-hero','us-rifle-1',[.86,1.68,-.88],[0,1.30,0]]]){
      const result=await page.evaluate(async({file,name,eye,aim})=>{
        const store=window.fieldActors,s=store.getState(),o=s.scene.getObjectByName(name),{camera,gl}=s;
        if(!o)throw Error('Actor unavailable '+name);store.getState().setDpr(1);
        const target=camera.position.clone(),view=target.clone();let n=0,read=()=>{},failed=()=>{};
        const full=document.createElement('canvas');full.width=1920;full.height=1080;
        const snapshot=full.getContext('2d'),probe=document.createElement('canvas');probe.width=48;probe.height=27;
        const pixels=probe.getContext('2d',{willReadFrequently:true});
        const raw=new Promise((resolve,reject)=>{read=resolve;failed=reject;});
        const restore=s.internal.subscribe({current:()=>{
          o.updateWorldMatrix(true,false);view.fromArray(eye).applyMatrix4(o.matrixWorld);target.fromArray(aim).applyMatrix4(o.matrixWorld);
          camera.position.copy(view);camera.lookAt(target);camera.updateMatrixWorld();
        }},.91,store);
        const end=s.internal.subscribe({current:()=>{
          if(++n>390){failed(Error('No opaque rendered '+file+' frame'));return;}
          if(n<=19||gl.domElement.width!==1920||gl.domElement.height!==1080)return;
          // Read one retained copy. A just-loaded WebGL backbuffer can be
          // transparent after resize even though the page is already ready.
          snapshot.clearRect(0,0,1920,1080);snapshot.drawImage(gl.domElement,0,0);
          pixels.clearRect(0,0,48,27);pixels.drawImage(full,0,0,48,27);
          const data=pixels.getImageData(0,0,48,27).data;let low=255,high=0,minAlpha=255;
          for(let i=0;i<data.length;i+=4){
            const l=.25*data[i]+.5*data[i+1]+.25*data[i+2];
            low=Math.min(l,low);high=Math.max(l,high);minAlpha=Math.min(minAlpha,data[i+3]);
          }
          if(minAlpha===255&&high-low>48&&high>72)
            read({png:full.toDataURL('image/png'),witness:{minAlpha,valueSpan:high-low,framesWaited:n}});
        }},10,store);
        let photo;try{photo=await raw;}finally{end();restore();}
        return {file,name,eye,aim,...photo,bundle:performance.getEntriesByType('resource').map(e=>e.name).find(u=>/\/GameSession-[\w-]+\.js/.test(u))};
      },{file,name,eye,aim});
      await writeFile(resolve(out,file+'.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;evidence.push(result);
    }
    await writeFile(resolve(out,'field-heroes.json'),JSON.stringify(evidence,null,2));
  }
  if(!fieldOnly){
  const partial=resolve(out,'sightline-candidates');await mkdir(partial,{recursive:true});
  await page.exposeBinding('__retainVerifiedBossView',async(_,{name,png,...metadata})=>{
    assert(/^(?:front-left|front-right|profile-left|profile-right|rear|front-portrait|watcher-portrait|opposite-front|opposite-profile)$/.test(name));
    assert(png.startsWith('data:image/png;base64,'));
    await writeFile(resolve(partial,name+'.png'),Buffer.from(png.split(',')[1],'base64'));
    await writeFile(resolve(partial,name+'.json'),JSON.stringify(metadata,null,2));
  });
  await page.goto('http://127.0.0.1:'+port+'/?ghostSignal=embassy');
  await page.getByRole('button',{name:/^Embassy approach/i}).click();
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Browser-only photo route');
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
      for(let h=f.memoizedState;h;h=h.next){
        const actor=h.memoizedState?.current;if(actor?.name!=='player-tank')continue;
        window.rigRoot=actor.__r3f.root;return true;
      }
    return false;
  },null,{timeout:120000});
  await page.evaluate(installCommandPhotoPlanner,{scenic:process.env.REVIEW_STRICT_SCENIC==='1'});
  await page.evaluate(()=>{
    const store=window.rigRoot,s=store.getState(),{scene,camera,gl}=s,boss=scene.getObjectByName('nightmare-boss-sculpt');
    const hips=boss.getObjectByName('command-weight-bearing-chest');
    if(!hips||boss.getObjectByName('ghost-actor-pixels'))throw Error('Production boss was not volumetric');
    const feet=['left','right'].map(n=>boss.getObjectByName('command-leg-'+n).getObjectByName('boot'));
    const p=camera.position.clone(),v=p.clone(),t=p.clone(),f0=p.clone(),f1=p.clone();
    const shots=[],samples=[],film=[],eyes=[];window.rigShots=shots;window.rigSamples=samples;window.rigFilm=film;window.rigEyes=eyes;
    const preview=document.createElement('canvas');preview.width=960;preview.height=540;const draw=preview.getContext('2d');
    const planner=window.commandPhotoPlanner;
    let planned=null,start=null,angle='',nextFilm=0,recording=false;
    const heads=scene.getObjectByName('nightmare-undead-heads'),matrix=camera.matrix.clone();
    const irises=scene.getObjectByName('nightmare-undead-red-eyes'),irisMatrix=camera.matrix.clone(),irisWorld=v.clone();
    if(!irises?.isInstancedMesh)throw Error('Regular eye batch absent');
    let eyePlan=null,tries=0;
    const probe=document.createElement('canvas');probe.width=48;probe.height=36;const pixels=probe.getContext('2d',{willReadFrequently:true});
    s.internal.subscribe({current:()=>{
      if(!boss.visible&&eyes.length<3&&heads?.userData.authoredUndead){
        for(let k0=0;k0<heads.count;k0++){
          const k=(k0+Math.floor(tries/10))%heads.count;
          heads.getMatrixAt(k,matrix);
          if(matrix.elements[5]<.70||Math.hypot(matrix.elements[12],matrix.elements[14])<7||matrix.elements[13]<.96)continue;
          let shown=true;for(let o=heads;o;o=o.parent)if(!o.visible)shown=false;
          if(!shown)continue;
          matrix.premultiply(heads.matrixWorld);
          if(store.getState().viewport.dpr!==1)store.getState().setDpr(1);
          t.set(0,0,0).applyMatrix4(matrix);
          const distance=[5,16,25][eyes.length];
          if(eyes.length&&s.clock.elapsedTime-eyes[0].t<(eyes.length===1?3.1:5.8))break;
          const rise=distance*(.12+(tries%9)*.025);
          v.set(-.11+.38*Math.sin(tries*.37),0,-1).transformDirection(matrix);v.y=0;v.normalize().multiplyScalar(Math.sqrt(distance*distance-rise*rise)).add(t);
          v.y=t.y+rise;camera.position.copy(v);camera.lookAt(t);camera.updateMatrixWorld();
          const witness=[0,1].map(side=>{
            irises.getMatrixAt(k*2+side,irisMatrix);irisMatrix.premultiply(irises.matrixWorld);
            irisWorld.setFromMatrixPosition(irisMatrix).project(camera);
            return [(irisWorld.x*.5+.5)*1920,(-irisWorld.y*.5+.5)*1080];
          });
          eyePlan={name:'undead-eyes-'+distance+'m',distance:camera.position.distanceTo(t),actor:k,world:t.toArray(),witness,t:s.clock.elapsedTime};break;
        }
      }
      if(!boss.visible||(shots.length>=planner.count&&film.length>=16))return;
      if(store.getState().viewport.dpr!==1)store.getState().setDpr(1);
      boss.updateWorldMatrix(true,true);
      const scale=Math.hypot(...boss.matrixWorld.elements.slice(4,7));
      const root=p.setFromMatrixPosition(boss.matrixWorld).toArray();
      start??=root;
      // Physical hit volume and the carried render rig are deliberately different.
      // Reject an uninitialised hidden rig, not the art-directed crouch height.
      if(!Number.isFinite(scale)||scale<1||!boss.getObjectByName('command-double-faced-skull')?.visible)return;
      const f=[feet[0].getWorldPosition(f0).toArray(),feet[1].getWorldPosition(f1).toArray()];
      // The authored final-wave entry has a real breach: let the actor
      // reach it before reviewing details in the same practical light as
      // the player. Old immutable builds still work at their original gate.
      const eastEntry=Math.hypot(start[0]-23.5,start[2]-9)<2;
      if(eastEntry ? (root[2]>-14.85 || root[0]>19.6) :
        Math.hypot(root[0]-start[0],root[2]-start[2])<8.8)return;
      samples.push({t:s.clock.elapsedTime,root,feet:f});
      planned=planner.plan(shots,s.clock.elapsedTime,root,f);
      // Priority goes to the stills while each foot is in swing. On other
      // ticks retain actual movement footage from a verified clear lens.
      if(planned&&planned.opacity<.82)planned=null;
      const motion=planned??(s.clock.elapsedTime>=nextFilm?planner.follow(root,f):null);
      if(!motion||motion.opacity<.82){recording=false;return;}
      v.fromArray(motion.eye);t.fromArray(motion.look);
      camera.position.copy(v);camera.lookAt(t);camera.updateMatrixWorld();
      angle=motion.name;recording=motion.requiredIris<0;
    }},.91,store);
    s.internal.subscribe({current:()=>{
      if(gl.domElement.width!==1920||gl.domElement.height!==1080)return;
      if(eyePlan){
        pixels.drawImage(gl.domElement,936,522,48,36,0,0,48,36);
        const rgba=pixels.getImageData(0,0,48,36).data;
        let red=0;const hits=[0,0],peak=[0,0],w=eyePlan.witness,rad=eyePlan.distance<7?5:2.3;
        for(let i=0;i<rgba.length;i+=4)if(rgba[i]>105&&rgba[i]>rgba[i+1]*1.65&&rgba[i]>rgba[i+2]*1.55){
          red++;
          const x=936+(i/4)%48+.5,y=522+Math.floor(i/192)+.5;
          const ds=w.map(([u,v])=>Math.hypot(x-u,y-v)),s=ds[0]<ds[1]?0:1;
          if(ds[s]<=rad){hits[s]++;peak[s]=Math.max(peak[s],rgba[i]);}
        }
        // Disjoint pixel witnesses at the two projected 3D sockets. A red
        // torch, foliage gap, or single exposed eye is not a two-eye pass.
        if((hits[0]>0&&hits[1]>0&&Math.min(...peak)>=130)||tries>320){
          eyes.push({...eyePlan,rubyPixels:red,eyePixelHits:hits,peakRed:peak,png:gl.domElement.toDataURL('image/png')});tries=0;
        }else tries++;
        eyePlan=null;
      }
      if(recording&&s.clock.elapsedTime>=nextFilm&&film.length<120){
        draw.drawImage(gl.domElement,0,0,960,540);film.push({angle,t:s.clock.elapsedTime,jpg:preview.toDataURL('image/jpeg',.88)});
        nextFilm=s.clock.elapsedTime+1/20;
      }
      if(!planned)return;
      // Portrait identity is checked against real post-processed output at the
      // two projected physical irises, not merely a theoretical camera ray.
      if(planned.requiredIris>=0){
        const pair=planned.targets.irises[planned.requiredIris],hits=[];
        for(const [x,y] of pair){
          const r=10;pixels.clearRect(0,0,21,21);pixels.drawImage(gl.domElement,Math.floor(x)-r,Math.floor(y)-r,21,21,0,0,21,21);
          const rgba=pixels.getImageData(0,0,21,21).data;let n=0;
          for(let j=0;j<rgba.length;j+=4)if(rgba[j]>87&&rgba[j]>rgba[j+1]*1.55&&rgba[j]>rgba[j+2]*1.39)n++;
          hits.push(n);
        }
        planned.irisPixelHits=hits;
        if(!hits.every(n=>n>=2)){planner.rejected['portrait: missing rendered iris']=(planner.rejected['portrait: missing rendered iris']??0)+1;planned=null;return;}
      }
      const proof={...planned,png:gl.domElement.toDataURL('image/png')};shots.push(proof);
      void window.__retainVerifiedBossView(proof).catch(e=>console.error('Could not checkpoint photo',String(e)));planned=null;
    }},10,store);
  });
  await page.waitForFunction(()=>{
    if(window.rigShots.length>=window.commandPhotoPlanner.count&&window.rigFilm.length>=16)return true;
    const panel=document.querySelector('.nightmare-order'),wave=Number(panel?.innerText.match(/wave\s+(\d+)\s*\//i)?.[1]);
    if(![1,2,3].includes(wave)||!panel.classList.contains('is-combat')||(wave===1&&window.rigEyes.length<3))return false;
    const c=document.querySelector('.scene-container');
    const walk=el=>{if(!el)return;if(Array.isArray(el)){for(const item of el){const match=walk(item);if(match)return match;}return;}
      const p=el.props;if(p?.onZombieHit&&p.zombiePosesRef&&p.friendlies&&p.zombies)return p;return walk(p?.children);};
    const p=walk(c[Object.keys(c).find(k=>k.startsWith('__reactProps$'))].children);if(!p)return false;
    for(const z of p.zombies){const pose=p.zombiePosesRef.current.get(z.id);if(z.wave===wave&&z.alive&&pose?.active&&z.archetype==='standard')
      p.onZombieHit({soldierId:'rig-photo-setup',zombieId:z.id,position:pose.position.clone(),damage:z.health});}
    return false;
  },null,{polling:200,timeout:220000}).catch(async e=>{
    const stage=await page.evaluate(()=>({
      panel:document.querySelector('.nightmare-order')?.innerText,
      eyes:window.rigEyes?.map(({png,...entry})=>entry),
      shots:window.rigShots?.map(({png,...entry})=>entry),
      poseSamples:window.rigSamples?.length,attempts:window.commandPhotoPlanner.attempts,blocked:window.commandPhotoPlanner.rejected
    }));
    await writeFile(resolve(out,'incomplete-stage.json'),JSON.stringify(stage,null,2));
    throw e;
  });
  const result=await page.evaluate(()=>({shots:window.rigShots,eyes:window.rigEyes,samples:window.rigSamples,film:window.rigFilm,
    photoProtocol:'R14 local views attempted first; selected offsets disclosed per shot; arms, actors, scenery, lighting and gameplay not edited.',
    photoAttempts:window.commandPhotoPlanner.attempts,rejectedSightlines:window.commandPhotoPlanner.rejected,
    bundle:performance.getEntriesByType('resource').map(e=>e.name).find(u=>/\/GameSession-[\w-]+\.js/.test(u))}));
  for(const shot of [...result.shots,...result.eyes]){await writeFile(resolve(out,shot.name+'.png'),Buffer.from(shot.png.split(',')[1],'base64'));delete shot.png;}
  const ffmpeg=process.env.FFMPEG??'ffmpeg';
  if(result.film.length>=12){
    const dir=resolve(out,'film-frames');await mkdir(dir,{recursive:true});
    const lines=[];
    for(let i=0;i<result.film.length;i++){
      const frame=result.film[i],name='frame-'+String(i).padStart(3,'0')+'.jpg';
      await writeFile(resolve(dir,name),Buffer.from(frame.jpg.split(',')[1],'base64'));delete frame.jpg;
      lines.push("file '"+name+"'","duration "+Math.min(.16,(result.film[i+1]?.t??frame.t+.05)-frame.t).toFixed(4));
    }
    await writeFile(resolve(dir,'frames.txt'),lines.join('\n')+'\n');
    const video=spawnSync(ffmpeg,['-y','-loglevel','error','-f','concat','-safe','1','-i','frames.txt','-pix_fmt','yuv420p','-movflags','+faststart',resolve(out,'boss-walk.mp4')],{cwd:dir});
    assert.equal(video.status,0,String(video.stderr));
  }
  assert.deepEqual(errors,[]);assert.ok(result.bundle);
  await writeFile(resolve(out,'receipt.json'),JSON.stringify({...result,errors},null,2));
  console.log('Live production front, profile, rear; both step phases. '+result.bundle+' '+out);
  }
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
