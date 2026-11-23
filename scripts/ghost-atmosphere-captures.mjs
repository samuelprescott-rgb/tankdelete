// Actual production practice, two gameplay cameras and two fixed photo cameras.
// NODE_PATH=<playwright + sharp directory> node ghost-atmosphere-captures.mjs before|after PORT
// Optional: explore PORT lays out rough camera alternatives outside the deliverable.
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const [stage,port,expectedBundle]=process.argv.slice(2);
const withFilm=process.argv.includes('--film'),bankMacro=process.argv.includes('--bank-macro');
const micro=/^micro-(before|r[1-9]\d*)$/.test(stage);
const forest=/^forest-(rejected|original|restored|r[1-9]\d*)$/.test(stage);
const replaced=/^replaced-(before|r[1-9]\d*)$/.test(stage);
const height=(micro||replaced)&&process.argv.includes('--1440p')?1440:1080,width=height*16/9;
const root=new URL(micro?'../../TankDelete-Concepts/ghost-signal-microcode-01/game/'+(height===1440?'1440p/':''):replaced?'../../TankDelete-Concepts/replaced-gauntlet/'+height+'p/':forest?'../../TankDelete-Concepts/ghost-signal-forest/':'../../TankDelete-Concepts/ghost-atmosphere/',import.meta.url).pathname;
const paths={river:['river-chase','river-scenic'],embassy:['embassy-chase','embassy-scenic']};
const detail={river:['river-bank',[[-10.3,2.4,10.1],[3,1.85,18]]],embassy:['embassy-facade',[[3.1,1.65,-15.65],[-.5,2.35,-25.1]]]};
const angles={
 river:[[[2.5,3.7,-3],[-10,3,16]],[[5.5,3,-1.5],[-7,2.6,12]],[[-5,4.2,-4],[3,2.8,18]],[[-16,3,-3],[-7,2.3,17]],[[-17.0,3.0,-3.5],[-13,2.4,18]],[[-13,2.0,7],[1,1.45,16]],[[-10.3,2.4,10.1],[3,1.85,18]],[[11,3,24],[-4,2,12]],[[-5,2.1,8],[3,1.8,18]]],
 embassy:[[[7,2.7,-5.7],[-1.8,2.0,-23]],[[5.4,2.7,-3.5],[-2,2.2,-23.2]],[[-8.0,2.8,-3.0],[2.3,2.0,-21]],[[-10,2.8,-8.4],[1.7,1.8,-21]]]
};
const title={ 'river-chase':'River village / normal chase', 'embassy-chase':'Embassy / normal chase', 'river-scenic':'River village / inspection camera', 'embassy-scenic':'Embassy / inspection camera','river-bank':'Village / bridge from the waterline','embassy-facade':'Embassy / approach to the archive entrance' };
const heroIndex={river:2,embassy:0};
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const svg=(title,w,h)=>Buffer.from('<svg width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#16232a"/><text x="17" y="'+Math.ceil(h*.68)+'" fill="#fef1d7" font-size="'+Math.ceil(h*.5)+'" font-family="Helvetica,Arial">'+title+'</text></svg>');
if(stage==='gallery'){
 const reports=await Promise.all(['before','after'].map(stage=>readFile(root+stage+'/receipt.json','utf8').then(JSON.parse)));
 assert(reports.every(x=>x.pass));assert.notDeepEqual(reports[0].builds,reports[1].builds);
 const sections=[],chaseChanges=[];
 for(const [slice,ids] of Object.entries({overview:['river-scenic','embassy-scenic'],...paths,detail:['river-bank','embassy-facade']})){
  const parts=[],width=860,height=484,band=40;
  for(let y=0;y<ids.length;y++) for(let x=0;x<2;x++){
   const stage=['before','after'][x],id=ids[y],frame=await readFile(root+stage+'/'+id+'.png');
   const row=reports[x].shots.find(s=>s.id===id);assert.equal(sha(frame),row.sha256);assert.deepEqual(row.canvas,[1920,1080]);
   const comparator=reports[1-x].shots.find(s=>s.id===id);
   if(row.camera==='fixed'){assert.deepEqual(row.eye,comparator.eye);assert.deepEqual(row.look,comparator.look);}
   if(row.camera==='production chase'){
    assert(Math.hypot(...row.tank.map((v,i)=>v-comparator.tank[i]))<.003,'Same gameplay start required');
    if(x===0)chaseChanges.push({slice,cameraShift:Math.hypot(...row.eye.map((v,i)=>v-comparator.eye[i])),beforeEye:row.eye,afterEye:comparator.eye});
   }
   parts.push({input:svg(stage.toUpperCase()+'   /   '+title[id],width,band),left:x*width,top:y*(height+band)});
   parts.push({input:await sharp(frame).resize(width,height,{fit:'fill'}).png().toBuffer(),left:x*width,top:y*(height+band)+band});
  }
  await sharp({create:{width:width*2,height:(height+band)*2,channels:3,background:'#16232a'}}).composite(parts).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(root+slice+'-comparison.jpg');
  sections.push('<section><h2>'+({overview:'Overview · two fixed scenic cameras',river:'River village',embassy:'Embassy approach',detail:'Waterline and courtyard details'}[slice])+'</h2><a href="'+slice+'-comparison.jpg"><img src="'+slice+'-comparison.jpg" alt="Matched original and candidate views: before on left and after on right"></a>'+ids.map(id=>'<p>'+title[id]+': <a href="before/'+id+'.png">Before · 1080p PNG</a> / <a href="after/'+id+'.png">After · 1080p PNG</a></p>').join('')+'</section>');
 }
 const changed=chaseChanges.some(s=>s.cameraShift>.075);
 await writeFile(root+'camera-comparison.json',JSON.stringify(chaseChanges,null,2));
 const stages=['before',...(await readdir(root)).filter(s=>/^round\d+$/.test(s)).sort((a,b)=>+a.slice(5)-+b.slice(5)),'after'];
 const thumbs=[],tw=470,th=264,bar=37,seen=new Set();let columns=0;
 for(const stage of stages){
  const r=JSON.parse(await readFile(root+stage+'/receipt.json','utf8'));
  if(!r.pass||seen.has(r.builds[0])&&stage!=='after')continue;seen.add(r.builds[0]);
  for(const [y,id] of ['river-scenic','embassy-scenic'].entries()){
   const bytes=await readFile(root+stage+'/'+id+'.png'),row=r.shots.find(s=>s.id===id);
   assert.equal(sha(bytes),row.sha256);assert.deepEqual(row.eye,angles[row.slice][heroIndex[row.slice]][0]);
   thumbs.push({input:svg(stage.toUpperCase()+'   /   '+row.slice.toUpperCase(),tw,bar),left:columns*tw,top:y*(th+bar)});
   thumbs.push({input:await sharp(bytes).resize(tw,th,{fit:'fill'}).png().toBuffer(),left:columns*tw,top:y*(th+bar)+bar});
  }columns++;
 }
 await sharp({create:{width:columns*tw,height:(bar+th)*2,channels:3,background:'#16232a'}}).composite(thumbs).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toFile(root+'iteration-timeline.jpg');
 sections.push('<section><h2>Visual iteration history</h2><a href="iteration-timeline.jpg"><img src="iteration-timeline.jpg" alt="Actual day and night scenes from each reviewed build in chronological order"></a></section>');
 const glare=await readFile(root+'glare-round2-after.json','utf8').then(JSON.parse,()=>null);
 if(glare&&glare.stages[1].bundle===reports[1].builds[0])sections.push('<section><h2>Daylight water glare</h2><p>In the same '+glare.total.toLocaleString('en-US')+'-pixel wet-paddy patch at the settled chase angle, pixels with display luma above 205 changed from '+glare.stages[0].bright.toLocaleString('en-US')+' in round 2 to '+glare.stages[1].bright.toLocaleString('en-US')+' in the retained build. This comparison describes the two captured images, not all possible animation frames.</p><a href="glare-round2-after.json">Coordinates, threshold, image hashes and camera difference</a></section>');
 const originalGlare=await readFile(root+'glare-before-matched-chase-after.json','utf8').then(JSON.parse,()=>null);
 if(originalGlare&&originalGlare.stages[1].bundle===reports[1].builds[0])sections.push('<p>The unmodified starting build, recaptured from the exact retained chase position and orientation, had '+originalGlare.stages[0].bright.toLocaleString('en-US')+' such pixels. <a href="before-matched-chase/river-chase.png">Original from matched lens</a> / <a href="glare-before-matched-chase-after.json">measurement</a>.</p>');
 await writeFile(root+'index.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ghost Signal · Atmosphere comparison</title><style>body{max-width:1500px;padding:20px 2.5vw;margin:auto;background:#112025;color:#eceddc;font:16px/1.55 system-ui} h1,h2{line-height:1.15} p{max-width:86ch} a{color:#b4dfcf} img{width:100%;height:auto;display:block} section{margin-top:2.3rem}</style><h1>Ghost Signal · Atmosphere comparison</h1><p>Actual 1920×1080 browser-practice captures. Before is the untouched production snapshot; after is the retained candidate. The chase views show the unmodified, settled player camera and gameplay HUD, from the same tank starting position.'+(changed?' The shipped chase framing changed between builds; these shots show that change.':'')+' The scenic and detail pairs use identical world coordinates, 60° lens and hidden HUD. Actors, rain, incoming fire and other live effects continue to move. The PNGs below each plate are original screenshots, without repainting or grading.</p><p><a href="../pixel-ascii-01/03-ghost-signal.png">Original art-direction concept · not gameplay</a></p>'+sections.join('')+'<section><h2>Production provenance</h2><p><a href="camera-comparison.json">Natural chase-camera positions in both builds</a></p>'+reports.map(r=>'<p>'+r.stage+': <a href="'+r.stage+'/receipt.json">'+r.builds[0].split('/').pop()+' · coordinates, scene markers, HUD, image hashes and errors</a></p>').join('')+'</section></html>');
 process.exit(0);
}
assert((micro||replaced||forest||['before','after','explore','before-matched-chase'].includes(stage)||/^round[1-9]\d?$/.test(stage))&&/^\d{4,5}$/.test(port));
const out=stage==='explore'?'/private/tmp/ghost-atmosphere-camera-review/':root+stage+(bankMacro?'/shore/':'/');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
const report={stage,capturedAt:new Date().toISOString(),origin:'http://127.0.0.1:'+port,capture:'Unedited Playwright screenshot of visible production practice. Chase uses normal camera and HUD. Scenic uses fixed lens position and hides HUD. No lights, geometry or effects modified; DPR held at 1.',shots:[],errors:[],builds:[]};
try{
 for(const slice of (bankMacro||stage==='before-matched-chase')?['river']:['river','embassy']){
  const page=await context.newPage(),url=report.origin+'/?ghostSignal='+slice;
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(/THREE\.WebGLProgram: Shader Error|WebGL: INVALID|VALIDATE_STATUS false|context lost/i.test(m.text()))report.errors.push(m.text());});
  await page.goto(url);await page.getByRole('button',{name:slice==='river'?/^River crossing/i:/^Embassy approach/i}).click();
  await page.waitForFunction(()=>{
   if('__TAURI_INTERNALS__' in window)throw Error('Not a fictional browser practice scenario');
   const radar=document.querySelector('canvas[data-game-ui]');if(!radar)return false;
   for(let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;const store=t.__r3f.root,s=store.getState();
    if(!s.scene.getObjectByName('winding-river-water'))return false;
    if(!window.__atmos){window.__atmos={store,t,ticks:0,history:[]};
     // These are fixed-resolution art plates only. Holding DPR downstream
     // of the state change avoids racing the later adaptive frame subscriber.
     // The unmodified performance and gameplay recorders do not install this.
     store.subscribe(next=>{if(next.viewport.dpr!==1)next.setDpr(1);});
     if(s.viewport.dpr!==1)s.setDpr(1);
     s.internal.subscribe({current:()=>{const a=window.__atmos;a.ticks++;a.history.push(s.camera.position.clone());if(a.history.length>12)a.history.shift();}},0,store);}
    return true;
   }
  },null,{timeout:95000});
  await page.waitForFunction(()=>window.__atmos.ticks>=42,null,{timeout:45000});
  if(slice==='embassy')await page.waitForFunction(()=>!document.querySelector('.nightmare-takeover')&&document.querySelector('.nightmare-order')?.classList.contains('is-combat'),null,{timeout:45000});
  await page.waitForFunction(()=>{const a=window.__atmos;return a.ticks>=100&&a.history[0].distanceTo(a.history.at(-1))<.00075;},null,{timeout:45000});
  async function capture(id,view){
   if(view)await page.evaluate(([eye,look])=>{
    const a=window.__atmos,s=a.store.getState(),c=s.camera,fn=s.gl.render;let frames=0;
    function place(){c.position.fromArray(eye);c.lookAt(...look);c.updateMatrixWorld();}
    s.gl.render=function(sc,cam,...rest){if(sc===s.scene&&cam===c){place();a.placed=++frames;}return fn.call(this,sc,cam,...rest);};
    const stop=s.internal.subscribe({current:place},.5,a.store);a.placed=0;a.stop=()=>{stop();s.gl.render=fn;};place();
   },view);
   if(view)await page.waitForFunction(()=>window.__atmos.placed>=5,null,{timeout:45000});
   const data=await page.evaluate(()=>{
    const a=window.__atmos,{scene,camera:c,gl,viewport}=a.store.getState(),world=[],hot={};
    scene.traverseVisible(m=>{if(m.name&&/atmos|horizon|smoke|canopy|cloud|practical|skyline/.test(m.name)&&world.length<150)world.push(m.name);});
    return {eye:c.position.toArray(),quaternion:c.quaternion.toArray(),verticalFov:c.fov,tank:a.t.position.toArray(),renderTicks:a.ticks,canvas:[gl.domElement.width,gl.domElement.height],dpr:viewport.dpr,sceneWorld:world, hud:document.body.innerText.slice(0,1100),bundle:performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname).find(p=>/\/assets\/GameSession-[\w-]+\.js$/.test(p))};
   });
   assert(data.bundle&&data.dpr===1);if(expectedBundle)assert.equal(data.bundle,'/assets/GameSession-'+expectedBundle+'.js','Production preview changed before capture');assert.deepEqual(data.canvas,[width,height]);if(view)assert.deepEqual(data.eye,view[0]);if(!report.builds.includes(data.bundle))report.builds.push(data.bundle);
   const bytes=await page.screenshot({path:out+id+'.png',timeout:60000});const rec={id,slice,url,camera:view?'fixed':'production chase',look:view?.[1],sha256:sha(bytes),...data}; report.shots.push(rec);
   if(view)await page.evaluate(()=>window.__atmos.stop());console.log(stage,id,data.bundle,data.eye.join(','));
  }
  if(bankMacro){
    await page.addStyleTag({content:'body *:not(:has(canvas)):not(canvas){visibility:hidden!important} canvas[data-game-ui]{visibility:hidden!important}'});
    await capture('bank-fig-roots',[[-5.20,.57,12.04],[-6.43,-.18,13.74]]);
    await capture('bank-wet-ledge',[[-5.03,.19,11.67],[-6.03,-.36,13.19]]);
    await page.close();continue;
  }
  if(stage==='before-matched-chase'){
   const final=JSON.parse(await readFile(root+'after/receipt.json','utf8')).shots.find(s=>s.id==='river-chase');
   const [x,y,z,w]=final.quaternion,dir=[-2*(x*z+y*w),-2*(y*z-x*w),-(1-2*x*x-2*y*y)],look=final.eye.map((v,i)=>v+dir[i]);
   await capture('river-chase',[final.eye,look]);report.shots[0].camera='inspection camera matched to retained production chase; unmodified HUD';
   assert(report.shots[0].quaternion.every((v,i)=>Math.abs(v-final.quaternion[i])<1e-5));
   await page.close();continue;
  }
  await capture(paths[slice][0],null);
  await page.addStyleTag({content:'body *:not(:has(canvas)):not(canvas){visibility:hidden!important} canvas[data-game-ui]{visibility:hidden!important}'});
  if(stage==='explore'){for(const [index,v] of angles[slice].entries())await capture(slice+'-explore-'+index,v);}
  else {await capture(paths[slice][1],angles[slice][heroIndex[slice]]);await capture(...detail[slice]);}
  if(forest){
    if(slice==='river'){
      // Lock the lens to one real approach tree from the rejected build,
      // not a posed asset or a moving camera that favors the replacement.
      let view;
      if(stage==='forest-rejected'){
        view=await page.evaluate(()=>{
          const s=window.__atmos.store.getState(),mesh=s.scene.getObjectByName('layered-jungle').children.find(m=>m.isInstancedMesh);
          const a=mesh.instanceMatrix.array;let best,score=Infinity;
          for(let i=0;i<mesh.count;i++){const x=a[i*16+12],z=a[i*16+14],d=(x-8)**2+(z-5)**2;
            if(d<score){score=d;best=[x,z];}}
          if(!best)throw Error('No rendered approach tree.');
          const [x,z]=best;return [[x-3.1,2.1,z-6.8],[x,4.9,z]];
        });
      }else {
        const ref=JSON.parse(await readFile(root+'forest-rejected/receipt.json','utf8')).shots.find(s=>s.id==='river-canopy');
        view=[ref.eye,ref.look];
      }
      await capture('river-canopy',view);
      if(withFilm){
        // A real-time lateral inspection: wind and normal rendering keep
        // running. This is visual evidence, never a timing measurement.
        for(const [id,pose] of [['tree',view],['treeline',angles.river[heroIndex.river]]]){
          const film=await page.evaluate(async ([eye,look])=>{
            const a=window.__atmos,s=a.store.getState(),c=s.camera,renderer=s.gl;
            const before=renderer.render,stream=renderer.domElement.captureStream(30);
            const codec=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
            if(!codec)throw Error('No supported browser capture codec');
            const recorder=new MediaRecorder(stream,{mimeType:codec,videoBitsPerSecond:10000000}),parts=[];
            const done=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
            const start=performance.now(),frames=[];
            function place(){const t=Math.min(1,Math.max(0,(performance.now()-start-350)/3000));const x=t*t*(3-2*t);
              c.position.set(eye[0]+x*1.15,eye[1],eye[2]-x*.20);c.lookAt(look[0]+x*.27,look[1],look[2]);c.updateMatrixWorld();}
            const off=s.internal.subscribe({current:place},.5,a.store);
            renderer.render=function(sc,cam,...rest){if(sc===s.scene&&cam===c){place();frames.push(performance.now());}return before.call(this,sc,cam,...rest);};
            try{
              place();recorder.start();await new Promise(r=>setTimeout(r,3750));recorder.stop();await done;
              const blob=new Blob(parts,{type:codec}), data=await new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(f.result.split(',')[1]);f.onerror=rej;f.readAsDataURL(blob);});
              return {data,frames:frames.length,ms:frames.at(-1)-frames[0],pixels:[renderer.domElement.width,renderer.domElement.height],end:c.position.toArray()};
            }finally{off();renderer.render=before;for(const track of stream.getTracks())track.stop();}
          },pose);
          const {data,...stats}=film;assert(stats.frames>24&&stats.ms>3300);assert.deepEqual(stats.pixels,[1920,1080]);
          const bytes=Buffer.from(data,'base64');await writeFile(out+id+'-motion.webm',bytes);
          (report.films??=[]).push({id,...stats,start:pose[0],sha256:sha(bytes),capture:'Live canvas during a repeatable lateral inspection; excludes HUD and is not a timing benchmark.'});
        }
      }
    }else await capture('embassy-clouds',[[7,2.7,-5.7],[-1.8,13,-23]]);
  }
  await page.close();
 }
 assert.equal(report.builds.length,1);assert.deepEqual(report.errors,[]);report.pass=true;
}finally{await writeFile(out+'receipt.json',JSON.stringify(report,null,2));await browser.close();}
