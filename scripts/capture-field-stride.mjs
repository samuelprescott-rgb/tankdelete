// Normal browser campaign; no input/clock/AI/actor/light changes. Only the two
// labelled close-ups replace the camera view. Not a frame-time benchmark.
// NODE_PATH=<playwright+sharp> node scripts/capture-field-stride.mjs PORT OUT [GameSession-HASH.js | path/to/bundle.js]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join, resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {chromium}=require('playwright'), sharp=require('sharp');
const [rawPort, folder, expected]=process.argv.slice(2), port=Number(rawPort);
assert(Number.isInteger(port)&&port>1024&&port<=65535&&folder,'Expected PORT OUTPUT_DIRECTORY [GameSession-HASH.js or path]');
const origin='http://127.0.0.1:'+port, out=resolve(folder), hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
const errors=[], report={route:'Start Campaign',origin,errors,method:'Untouched player chase plus actual live field patrol. Close-ups move only the inspection camera. No staged actor, lighting, AI, animation or simulation time.'};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS.*false|WebGLProgram.*ERROR/i.test(m.text()))errors.push(m.text());});
  const assetP=page.waitForResponse(r=>r.url().startsWith(origin+'/assets/')&&/\/GameSession-[\w-]+\.js$/.test(r.url())&&r.ok(),{timeout:100000});
  // Attach a handler before navigation, including the event of a failed startup.
  void assetP.catch(()=>{});
  await page.goto(origin);
  await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
  const asset=await assetP, assetName=basename(new URL(asset.url()).pathname);
  report.bundle={url:asset.url(),sha256:hash(await asset.body()),expected:expected??null};
  if(expected){
    assert.equal(assetName,basename(expected),'Unexpected production bundle');
    if(expected.includes('/'))assert.equal(report.bundle.sha256,hash(await readFile(resolve(expected))),'Loaded JS bytes differ from retained file');
  }
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Requires isolated browser campaign');
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const a=h.memoizedState?.current;if(a?.name==='player-tank'&&a.__r3f?.root.getState().scene.getObjectByName('us-rto-4')){
        window.__fieldStrideStore=a.__r3f.root;return true;
      }
    }
    return false;
  },null,{timeout:100000});
  await page.waitForFunction(()=>window.__fieldStrideStore.getState().clock.elapsedTime>2,null,{timeout:30000});
  const chase='01-player-chase.png';
  report.chase=await page.evaluate(()=>{
    const {clock,camera}=window.__fieldStrideStore.getState();return {time:clock.elapsedTime,eye:camera.position.toArray(),quaternion:camera.quaternion.toArray()};
  });
  const chaseBytes=await page.screenshot({path:join(out,chase)});report.chase.file=chase;report.chase.sha256=hash(chaseBytes);
  assert((await sharp(chaseBytes).stats()).entropy>2,'Invalid chase screenshot');
  const result=await page.evaluate(async()=>{
    const store=window.__fieldStrideStore, {clock,scene,gl,camera,internal}=store.getState();
    const vec=()=>camera.position.clone(), sides=['left','right'], slots=[], start=clock.elapsedTime;
    scene.traverseVisible(mesh=>{
      if(!mesh.isSkinnedMesh||!['us-field-infantry-volume','vc-field-infantry-volume'].includes(mesh.name))return;
      const actor=mesh.parent, bones=mesh.skeleton.bones, bone=n=>bones.find(b=>b.name===n);
      const elbows=sides.map(side=>bone('field-sleeve-'+side)), feet=sides.map(side=>bone(side+'-foot'));
      if(elbows.some(x=>!x)||feet.some(x=>!x)||!bone('spine'))return;
      const standing=bone('left-thigh').position.y>.65;
      // Prefer the familiar standing US radio operator; alternate standing
      // field humans can qualify if this particular lane is blocked.
      slots.push({actor,mesh,elbows,feet,standing,chest:bone('spine'),last:actor.getWorldPosition(vec()),motion:0,
        rank:actor.name==='us-rto-4'?0:standing&&mesh.name.startsWith('us')?1:standing?2:3});
    });
    if(!slots.length)throw Error('No actual field-sleeve rigs mounted; wrong build?');
    slots.sort((a,b)=>a.rank-b.rank);
    const position=vec(), eye=vec(), target=vec(), scratch=vec(), originalEye=camera.position.clone(), originalQ=camera.quaternion.clone();
    const samples=[], renders=[], blocked=()=>{}, ob=scene.onAfterRender;
    let chosen=null, assigned=0, planned=null, done=false, frames=0, cycles=0, drawn=0, settle=blocked, fail=blocked;
    const raw=new Promise((ok,no)=>{settle=ok;fail=no;});
    const seen={people:slots.map(s=>s.actor.name),bestLift:0,bestTravel:0};
    const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
    const probe=document.createElement('canvas');probe.width=48;probe.height=27;
    const probe2=probe.getContext('2d',{willReadFrequently:true});
    const witness=canvas=>{
      probe2.clearRect(0,0,48,27);probe2.drawImage(canvas,0,0,48,27);
      const d=probe2.getImageData(0,0,48,27).data;let lo=255,hi=0,minA=255;
      for(let i=0;i<d.length;i+=4){const v=d[i]*.25+d[i+1]*.5+d[i+2]*.25;lo=Math.min(lo,v);hi=Math.max(hi,v);minA=Math.min(minA,d[i+3]);}
      return {minAlpha:minA,valueSpan:hi-lo};
    };
    function markers(s){
      // Sample genuinely elbow-weighted sleeve vertices, never just an empty
      // rotating bone. Return each centre in chest space: subtracts all walking,
      // actor yaw and camera movement; no false positives from a sliding root.
      const g=s.mesh.geometry, ids=g.getAttribute('skinIndex'), weights=g.getAttribute('skinWeight');
      s.indices??=s.elbows.map(b=>{
        const num=s.mesh.skeleton.bones.indexOf(b), match=[];
        for(let i=0;i<ids.count;i++)for(let j=0;j<4;j++)if(ids.getComponent(i,j)===num&&weights.getComponent(i,j)>.72){match.push(i);break;}
        if(match.length<12)throw Error('Sleeve pivot has insufficient weighted geometry');
        return Array.from({length:24},(_,j)=>match[Math.floor(j*match.length/24)]);
      });
      return s.indices.map(list=>{
        const center=vec().set(0,0,0);
        for(const id of list)center.add(s.chest.worldToLocal(s.mesh.localToWorld(s.mesh.getVertexPosition(id,scratch))));
        return center.multiplyScalar(1/list.length).toArray();
      });
    }
    function assign(s){
      chosen=s;assigned=clock.elapsedTime;cycles=0;samples.length=0;renders.length=0;
    }
    const onPose=internal.subscribe({current:()=>{
      if(done)return;
      try{
        frames++;planned=null;
        for(const s of slots){
          const w=s.actor.getWorldPosition(position);s.motion=s.last.distanceTo(w);s.last.copy(w);
        }
        if(chosen&&(!visible(chosen.actor)||clock.elapsedTime-assigned>5.5)){
          chosen.deferred=clock.elapsedTime+2;assign(null);
        }
        if(!chosen){
          const s=slots.find(s=>(s.rank===0||clock.elapsedTime-start>9)&&visible(s.actor)&&s.motion>.0008&&
            (!s.deferred||s.deferred<clock.elapsedTime)&&s.elbows.every(b=>Math.hypot(b.quaternion.x,b.quaternion.y,b.quaternion.z)>.011));
          if(s)assign(s);else return;
        }
        const s=chosen,a=s.actor;a.updateWorldMatrix(true,true);
        const k=s.standing?0:.44, localEye=[2.05,1.08-k*.65,-1.00],localAim=[0,.89-k*.65,-.06];
        camera.position.copy(eye.fromArray(localEye).applyMatrix4(a.matrixWorld));camera.lookAt(target.fromArray(localAim).applyMatrix4(a.matrixWorld));camera.updateMatrixWorld(true);
        if(++cycles<3||s.motion<.0003)return;
        const footWorld=s.feet.map(b=>b.getWorldPosition(vec())), ankleY=s.standing?[.16,.16]:[.12,.105];
        const lifts=footWorld.map((p,i)=>a.worldToLocal(p.clone()).y-ankleY[i]);
        const swing=lifts[0]>lifts[1]?0:1, planted=1-swing, qs=s.elbows.map(b=>b.quaternion.toArray());
        seen.bestLift=Math.max(seen.bestLift,lifts[swing]);
        if(lifts[swing]<.047||Math.abs(lifts[planted])>.016||qs.some(q=>Math.hypot(...q.slice(0,3))<.022))return;
        const P=a.getWorldPosition(vec()), first=samples[0], travel=first?Math.hypot(P.x-first.world[0],P.z-first.world[2]):0;
        if(first)seen.bestTravel=Math.max(seen.bestTravel,travel);
        if(first&&(first.swing===sides[swing]||travel<.10||qs.some((q,i)=>q.slice(0,3).reduce((v,x,j)=>v+x*first.sleeveQ[i][j],0)>=0)))return;
        const inShot=[...footWorld,a.localToWorld(vec().set(0,1.73-k,0))].map(v=>v.clone().project(camera).toArray());
        if(inShot.some(p=>Math.abs(p[0])>.95||Math.abs(p[1])>.97||Math.abs(p[2])>1))return;
        const sleeveCenters=markers(s);
        const delta=first?sleeveCenters.map((p,i)=>Math.hypot(...p.map((n,j)=>n-first.sleeveCenters[i][j]))):null;
        if(delta&&delta.some(d=>d<.014))return;
        planned={actor:a.name,actorUuid:a.uuid,body:s.mesh.name,skin:s.mesh.uuid,bones:s.mesh.skeleton.bones.length,
          stepTime:clock.elapsedTime,world:P.toArray(),swing:sides[swing],planted:sides[planted],lifts,travelSinceFirst:travel,
          sleeveQ:qs,sleeveCenters,chestLocalSleeveDifference:delta,feet:footWorld.map(v=>v.toArray()),localEye,localAim,
          camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),footAndHelmetNdc:inShot,frame:frames};
      }catch(e){done=true;fail(e);}
    }},.91,store);
    scene.onAfterRender=function(r,sc,c,...other){const ret=ob.call(this,r,sc,c,...other);if(r===gl&&sc===scene&&c===camera)drawn=frames;return ret;};
    const onDone=internal.subscribe({current:()=>{
      if(done||!planned||drawn!==frames)return;
      try{
        const display=gl.domElement,W=display.width,H=display.height;
        if(W<950||H<500)return;
        const full=document.createElement('canvas');full.width=W;full.height=H;
        full.getContext('2d').drawImage(display,0,0);const test=witness(full);
        if(test.minAlpha<255||test.valueSpan<55)return;
        samples.push({...planned,viewport:[W,H],pixels:test});renders.push(full);
        if(samples.length===2){done=true;settle();}
      }catch(e){done=true;fail(e);}
    }},10,store);
    const timeout=setTimeout(()=>{done=true;fail(Error('No two witnessed live opposite steps: '+JSON.stringify(seen)));},85000);
    try{await raw;return {shots:samples,images:renders.map(c=>c.toDataURL('image/png').split(',')[1])};}
    finally{clearTimeout(timeout);onDone();onPose();scene.onAfterRender=ob;camera.position.copy(originalEye);camera.quaternion.copy(originalQ);camera.updateMatrixWorld(true);}
  });
  report.shots=result.shots;assert.equal(result.shots[0].actorUuid,result.shots[1].actorUuid);
  assert.deepEqual(errors,[]);const layers=[],W=720,H=405,B=58;
  const panels=[{png:chaseBytes,title:'PLAYER CHASE',description:'Normal campaign camera / full HUD'},
    ...result.shots.map((s,i)=>({png:Buffer.from(result.images[i],'base64'),title:'LIVE STRIDE '+(i+1)+' / '+s.planted.toUpperCase()+' FOOT PLANTED',
      description:s.actor+' / same actor-local inspection view / '+s.stepTime.toFixed(2)+' s'}))];
  for(const [i,p] of panels.entries()){
    if(i){const file='0'+(i+1)+'-'+result.shots[i-1].planted+'-planted.png';await writeFile(join(out,file),p.png);
      Object.assign(result.shots[i-1],{file,sha256:hash(p.png)});}
    layers.push({input:await sharp(p.png).resize(W,H,{fit:'contain',background:'#172127'}).png().toBuffer(),left:i*W,top:B});
    const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    layers.push({input:Buffer.from('<svg width="'+W+'" height="'+B+'"><rect width="100%" height="100%" fill="#172127"/><g font-family="Helvetica,Arial"><text x="16" y="24" fill="#f3e8cc" font-size="19">'+esc(p.title)+'</text><text x="16" y="46" fill="#c1c8c5" font-size="15">'+esc(p.description)+'</text></g></svg>'),left:i*W,top:0});
  }
  await sharp({create:{width:W*3,height:H+B,channels:3,background:'#172127'}}).composite(layers).jpeg({quality:93,chromaSubsampling:'4:4:4'}).toFile(join(out,'field-stride-filmstrip.jpg'));
  report.status='passed';console.log(assetName,result.shots[0].actor,result.shots[1].travelSinceFirst,join(out,'field-stride-filmstrip.jpg'));
}catch(e){report.status='failed';report.error=String(e);throw e;}
finally{await writeFile(join(out,'field-stride-receipt.json'),JSON.stringify(report,null,2));await browser.close();}
