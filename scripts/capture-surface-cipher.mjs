// Run against immutable production previews, not dev/HMR. Browser practice
// only. Ex: NODE_PATH=/path/to/deps node scripts/capture-surface-cipher.mjs
// micro-before 1527 BR1y_Y3u (then micro-rN PORT HASH on the candidate).
// Run "compare micro-rN" with the same Node dependencies to verify the source
// PNGs and produce the matched 1:1 crop plate and fixed glare measurements.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const [stage,port,bundle]=process.argv.slice(2);
const root=fileURLToPath(new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/game/',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(stage==='compare'){
 assert(/^micro-r[1-9]\d*$/.test(port),'Use compare micro-rN');
 const stages=['micro-before',port],rows=['bark','water','sandbag'],labels=['BASELINE','CANDIDATE'];
 const sw=530,sh=340,bar=44,regions={bark:[780,270],water:[580,650],sandbag:[720,425]};
 const poses={};
 const layer=[],comp={method:'Matched world camera and 60-degree field of view. Fixed 1:1 screenshot crops, no grading. Brightness is sRGB display-space Rec.709 weighted luma; counts describe only the captured frames. Full and reflection patches include live motion and scenery.',stages:[]};
 for(const [j,run] of stages.entries()){
  const r=JSON.parse(await readFile(root+run+'/surface-receipt.json','utf8'));assert(r.pass&&r.shots.length===3);const side={stage:run,bundle:r.expected,surfaces:[]};comp.stages.push(side);
  for(const [i,id] of rows.entries()){
   const shot=r.shots.find(a=>a.id===id),bytes=await readFile(root+run+'/'+shot.filename);assert.equal(sha(bytes),shot.sha256);
   const {width,height}=await sharp(bytes).metadata();assert.deepEqual([width,height],[1920,1080]);assert.deepEqual(shot.viewport,[width,height]);
   const pose={eye:shot.eye,look:shot.look,quaternion:shot.quaternion,projection:shot.projection,fov:shot.fov};
   if(j)assert.deepEqual(poses[id],pose);else poses[id]=pose;
   const [left,top]=regions[id];const roi={left,top,width:sw,height:sh},x=i*sw,y=j*(bar+sh);
   const sg=Buffer.from('<svg width="'+sw+'" height="'+bar+'"><rect width="100%" height="100%" fill="#172026"/><text x="18" y="29" fill="#eedfc8" font-family="Helvetica,Arial" font-size="18">'+labels[j]+'  /  '+id.toUpperCase()+'  ·  1:1</text></svg>');
   layer.push({input:sg,left:x,top:y},{input:await sharp(bytes).extract(roi).png().toBuffer(),left:x,top:y+bar});
   const metric={id,sha256:shot.sha256,crop:roi};side.surfaces.push(metric);
   if(id==='water'){
    const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});metric.glare=[];
    for(const [name,left,top,width,height] of [['whole frame',0,0,1920,1080],['sun reflection',340,0,530,370],['center detail',720,420,480,240]]){
     let above205=0,atLeast250=0;
     for(let y=top;y<top+height;y++)for(let x=left;x<left+width;x++){const k=(y*info.width+x)*info.channels,v=.2126*data[k]+.7152*data[k+1]+.0722*data[k+2];if(v>205)above205++;if(v>=250)atLeast250++;}
     metric.glare.push({name,left,top,width,height,pixels:width*height,above205,atLeast250});
    }
   }
  }
 }
 assert.notEqual(comp.stages[0].bundle,comp.stages[1].bundle);
 const plate=await sharp({create:{width:sw*3,height:(sh+bar)*2,channels:3,background:'#172026'}}).composite(layer).png().toBuffer();
 comp.plate={file:port+'/surface-comparison.png',sha256:sha(plate)};await writeFile(root+comp.plate.file,plate);
 await writeFile(root+port+'/surface-comparison.json',JSON.stringify(comp,null,2));process.exit(0);
}
assert(/^micro-(before|r[1-9]\d*)$/.test(stage)&&/^\d{4,5}$/.test(port)&&/^[\w-]{6,}$/.test(bundle),'Expected stage, local preview port and production bundle hash');
const out=root+stage+'/',baseline=stage==='micro-before'?null:JSON.parse(await readFile(root+'micro-before/surface-receipt.json','utf8'));
if(baseline)assert(baseline.pass&&baseline.shots.length===3);
const origin='http://127.0.0.1:'+port,expected='/assets/GameSession-'+bundle+'.js',width=1920,height=1080;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const report={stage,origin,expected,capturedAt:new Date().toISOString(),capture:'Actual visible river practice, one settled production frame per plate. Three unedited 1920x1080 screenshots, fixed 60-degree lens, DPR 1, HUD hidden. No mesh, material, light, shader, or clock overrides. Live water and actors need not match phases.',shots:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(/THREE\.WebGLProgram: Shader Error|WebGL: INVALID|VALIDATE_STATUS false|context lost/i.test(m.text()))report.errors.push(m.text());});
 await page.goto(origin+'/?ghostSignal=river');
 await page.getByRole('button',{name:/^River crossing/i}).click();
 await page.waitForFunction(()=>{
  if('__TAURI_INTERNALS__' in window)throw Error('Refusing native filesystem session');
  const radar=document.querySelector('canvas[data-game-ui]');if(!radar)return false;
  for(let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
   const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
   const store=t.__r3f.root,s=store.getState(),group=s.scene.getObjectByName('layered-jungle');
   const bark=group?.children.find(c=>c.isInstancedMesh&&c.material?.map),water=s.scene.getObjectByName('winding-river-water'),sandbag=s.scene.getObjectByName('us-field-sandbags');
   if(!bark||!water||!sandbag?.count)return false;
   const q=window.__surface={store,t,meshes:{bark,water,sandbag},ticks:0,placed:0};
   store.subscribe(next=>{if(next.viewport.dpr!==1)next.setDpr(1);});if(s.viewport.dpr!==1)s.setDpr(1);
   s.internal.subscribe({current:()=>{q.ticks++;}},0,store);return true;
  }
 },null,{timeout:100000});
 await page.waitForFunction(()=>window.__surface.ticks>24,null,{timeout:65000});
 await page.addStyleTag({content:'body *:not(:has(canvas)):not(canvas){visibility:hidden!important} canvas[data-game-ui]{visibility:hidden!important}'});
 for(const id of ['bark','water','sandbag']){
  const ref=baseline?.shots.find(v=>v.id===id);
  const plan=await page.evaluate(({id,ref})=>{
   const q=window.__surface,s=q.store.getState(),mesh=q.meshes[id],c=s.camera,V=(x=0,y=0,z=0)=>c.position.clone().set(x,y,z);
   let instance=null,worldTransform=null,eye,look;
   if(ref){({instance,worldTransform,eye,look}=ref);}
   else if(id==='water'){eye=[-5.9,1.25,12.0];look=[-5.4,.009,13.45];}
   else{
    const mat=mesh.matrix.clone();let winner=Infinity,world;
    for(let i=0;i<mesh.count;i++){
     mesh.getMatrixAt(i,mat);const center=V().setFromMatrixPosition(mat).applyMatrix4(mesh.matrixWorld);
     const d=id==='bark'?(center.x-8)**2+(center.z-5)**2:(center.x-4.95)**2+(center.z+3.28)**2+(center.y-.35)**2*20;
     if(d<winner){winner=d;instance=i;}
    }
    mesh.getMatrixAt(instance,mat);world=mesh.matrixWorld.clone().multiply(mat);worldTransform=world.toArray();
    if(id==='bark'){
     const y=.245,center=V(Math.sin(y*2.1)*.19,y,Math.sin(y*3.5)*.14).applyMatrix4(world);
     look=center.toArray();eye=center.add(V(-.75,.11,-.91)).toArray();
    }else{
     const target=V(0,.15,.37).applyMatrix4(world);look=target.toArray();
     const front=V(0,0,1).transformDirection(world);eye=target.addScaledVector(front,1.16).add(V(.18,.39,0)).toArray();
    }
   }
   function place(){c.position.fromArray(eye);c.lookAt(...look);c.updateMatrixWorld();}
   q.placed=0;const old=s.gl.render;
   s.gl.render=function(scene,camera,...rest){if(scene===s.scene&&camera===c){place();q.placed++;}return old.call(this,scene,camera,...rest);};
   const off=s.internal.subscribe({current:place},.5,q.store);q.stop=()=>{off();s.gl.render=old;};place();
   return {instance,worldTransform,eye,look};
  },{id,ref});
  await page.waitForFunction(()=>window.__surface.placed>=5,null,{timeout:60000});
  const data=await page.evaluate(id=>{
   const q=window.__surface,s=q.store.getState(),c=s.camera,mesh=q.meshes[id],ray=new s.raycaster.constructor();
   ray.setFromCamera({x:0,y:0},c);const hit=ray.intersectObject(mesh,false)[0];if(!hit)throw Error('Center ray did not intersect '+id);
   const result={bundle:performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname).find(p=>/\/assets\/GameSession-[\w-]+\.js$/.test(p)),viewport:[s.gl.domElement.width,s.gl.domElement.height],dpr:s.viewport.dpr,fov:c.fov,eye:c.position.toArray(),quaternion:c.quaternion.toArray(),renderTicks:q.ticks,hit:{mesh:mesh.name||mesh.parent.name,instance:hit.instanceId??null,world:hit.point.toArray(),distance:hit.distance},projection:c.projectionMatrix.toArray(),material:mesh.material.name||mesh.material.type,meshMap:mesh.material.map?.source?.data?.currentSrc??null};return result;
  },id);
  assert.equal(data.bundle,expected);assert.equal(data.dpr,1);assert.equal(data.fov,60);assert.deepEqual(data.viewport,[width,height]);assert.deepEqual(data.eye,plan.eye);
  // Frustum-compacted vegetation can move the same tree to a new slot after
  // our fixed lens takes over. Verify physical impact distance and world hit
  // across builds rather than treating the ephemeral slot as an object ID.
  assert(data.hit.distance<3,'Center ray missed close material: '+JSON.stringify(data.hit));
  if(ref){assert.deepEqual(data.eye,ref.eye);assert.deepEqual(plan.look,ref.look);assert.deepEqual(data.quaternion,ref.quaternion);assert.deepEqual(data.projection,ref.projection);data.hitDeltaMetres=Math.hypot(...data.hit.world.map((v,i)=>v-ref.hit.world[i]));if(id==='sandbag'){assert.equal(data.hit.mesh,ref.hit.mesh);assert.equal(data.hit.instance,ref.hit.instance);assert(data.hitDeltaMetres<.025,'Resculpt must stay on the same bag surface within 2.5cm');}if(id==='bark')assert(data.hitDeltaMetres<.0005,'Corresponding surface moved '+data.hitDeltaMetres+' metres: '+id);}
  const filename='surface-'+id+'.png',bytes=await page.screenshot({path:out+filename,timeout:60000});
  const roi={left:720,top:420,width:480,height:240};
  const {data:rgb,info}=await sharp(bytes).extract(roi).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const lum=[],n=roi.width*roi.height;let bright=0,clipped=0;for(let j=0;j<rgb.length;j+=info.channels){const y=.2126*rgb[j]+.7152*rgb[j+1]+.0722*rgb[j+2];lum.push(y);if(y>205)bright++;if(y>=250)clipped++;}
  lum.sort((a,b)=>a-b);
  report.shots.push({id,...plan,...data,filename,sha256:sha(bytes),displayLuma:{roi,pixels:n,median:lum[Math.floor(n*.5)],p95:lum[Math.floor(n*.95)],p99:lum[Math.floor(n*.99)],above205:bright,atLeast250:clipped}});
  await page.evaluate(()=>window.__surface.stop());
  console.log(stage,id,JSON.stringify({instance:plan.instance,hit:data.hit,bright,clipped}));
 }
 assert.deepEqual(report.errors,[]);report.pass=true;
}finally{await writeFile(out+'surface-receipt.json',JSON.stringify(report,null,2));await browser.close();}
