// Isolated local production practice: move only the inspection camera, never the subject.
// node scripts/infantry-depth-qa.mjs before 1496; repeat with after <candidate-port>.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const [stage,port]=process.argv.slice(2);
assert(stage==='gallery'||(['before','after','night'].includes(stage)&&/^\d{4,5}$/.test(port)));
const root=new URL('../../TankDelete-Concepts/ghost-infantry-3d/',import.meta.url).pathname;
const subjects=[['us','us-rto-4',1.02],['vc','enemy-infantry-review',.86]];
const angles=[['front', .85,-1.52],['side',1.74,0],['rear', .88,1.50]];
async function sheet(id){
 const w=644,h=362,cap=38,pieces=[];
 for(let y=0;y<2;y++)for(let x=0;x<3;x++){
   const v=['before','after'][y],name=angles[x][0];
   const file=root+v+'/'+id+'-'+name+'.png',meta=await sharp(file).metadata();assert.equal(meta.width,1920);assert.equal(meta.height,1080);
   const label=(id==='us'?'US radio operator':'VC rifleman')+'  /  '+v.toUpperCase()+'  /  '+name;
   pieces.push({input:Buffer.from('<svg width="'+w+'" height="'+cap+'"><rect width="100%" height="100%" fill="#17272d"/><text x="15" y="25" fill="#efe9ce" font-size="19" font-family="Helvetica,Arial">'+label+'</text></svg>'),left:x*w,top:y*(h+cap)});
   pieces.push({input:await sharp(file).resize(w,h).png().toBuffer(),left:x*w,top:y*(h+cap)+cap});
 }
 await sharp({create:{width:w*3,height:(h+cap)*2,channels:3,background:'#17272d'}}).composite(pieces).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(root+id+'-three-angles.jpg');
}
async function gallery(){
 const builds={};
 for(const phase of ['before','after']){
   const r=JSON.parse(await readFile(root+phase+'/receipt.json','utf8'));
   assert.equal(r.status,'passed');assert.equal(r.shots.length,6);assert.deepEqual(r.errors,[]);
   builds[phase]=new URL(r.shots[0].bundle).pathname.split('/').pop();assert(r.shots.every(s=>s.bundle.endsWith(builds[phase])));
 }
 const parts=[],w=488,h=275,label=28;
 for(const [y,[id]] of subjects.entries())for(const [x,[angle]] of angles.entries()){
   const caption=(id==='us'?'US RADIO OPERATOR':'VC RIFLEMAN')+'   /   '+angle.toUpperCase();
   parts.push({input:Buffer.from('<svg width="'+w+'" height="'+label+'"><rect width="100%" height="100%" fill="#17272d"/><text x="12" y="19" fill="#efe9ce" font-size="14" font-family="Helvetica,Arial">'+caption+'</text></svg>'),left:x*w,top:y*(h+label)});
   parts.push({input:await sharp(root+'after/'+id+'-'+angle+'.png').resize(w,h).png().toBuffer(),left:x*w,top:y*(h+label)+label});
 }
 await sharp({create:{width:w*3,height:(h+label)*2,channels:3,background:'#17272d'}}).composite(parts).jpeg({quality:93,chromaSubsampling:'4:4:4'}).toFile(root+'infantry-volume-final.jpg');
 const night=await readFile(root+'night/receipt.json','utf8').then(JSON.parse,()=>null);
 const nightSection=night?.status==='passed'&&night.shots[0]?.bundle?.endsWith(builds.after)?'<section><h2>Embassy horde · night visibility</h2><a href="night/us-front.png"><img src="night/us-front.png" alt="U.S. soldier defending the Dispatch annex in the rain, wave one"/></a><a href="night/receipt.json">Night capture receipt</a></section>':'';
 const content='<section><h2>Final field models</h2><a href="infantry-volume-final.jpg"><img src="infantry-volume-final.jpg" alt="Both final 3D infantry models at three angles"/></a></section>'+subjects.map(([id])=>'<section><h2>'+(id==='us'?'U.S. radio operator':'VC rifleman')+'</h2><a href="'+id+'-three-angles.jpg"><img src="'+id+'-three-angles.jpg" alt="Three camera angles, before above and after below" /></a>'+['before','after'].map(s=>'<p><strong>'+s+'</strong> — '+angles.map(([a])=>'<a href="'+s+'/'+id+'-'+a+'.png">'+a+' · 1080p</a>').join(' / ')+'</p>').join('')+'</section>').join('')+nightSection;
 await writeFile(root+'index.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ghost Signal · Infantry depth review</title><style>body{max-width:1200px;margin:32px auto;background:#152127;color:#e6e5d9;font:17px/1.5 system-ui;padding:0 20px}a{color:#9fe0d7}img{width:100%;height:auto}section{margin:32px 0}strong{text-transform:capitalize}</style><h1>Ghost Signal · Infantry depth review</h1><p>Real 1920×1080 captures from the River Crossing production practice scene. Every row follows the same field soldier with the same three actor-local camera positions. The game renderer, lighting, gear and animation are live; only the HUD was hidden and the inspection camera moved.</p>'+content+'<p>Production receipts: <a href="before/receipt.json">'+builds.before+'</a> / <a href="after/receipt.json">'+builds.after+'</a>.</p></html>');
}
if(stage==='gallery'){for(const [id] of subjects)await sheet(id);await gallery();process.exit(0);}
const base=root+stage+'/';await mkdir(base,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const log={stage,url:'http://127.0.0.1:'+port+'/?ghostSignal='+(stage==='night'?'embassy':'river'),shots:[],errors:[]};
page.on('pageerror',e=>log.errors.push(String(e)));
page.on('console',m=>{if(/THREE\.WebGLProgram: Shader Error|WebGL: INVALID|VALIDATE_STATUS false|context lost/i.test(m.text()))log.errors.push(m.text());});
try {
 await page.goto(log.url);await page.getByRole('button',{name:stage==='night'?/^Embassy approach/i:/^River crossing/i}).click();
 await page.waitForFunction(()=>{
  if('__TAURI_INTERNALS__' in window)throw Error('Not a browser-only simulation');
  const r=document.querySelector('canvas[data-game-ui]');if(!r)return false;
  for(let f=r[Object.keys(r).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    if(h.memoizedState?.current?.name==='player-tank'){window.__depthQaStore=h.memoizedState.current.__r3f.root;return true;}
  }
 },null,{timeout:90000});
 await page.waitForTimeout(4500);
 await page.addStyleTag({content:'.game-ui,.hud,.header,.training-badge,.nightmare-order,[data-game-ui],.crosshair {visibility:hidden!important}'});
 for(const [id,actor,aimY] of stage==='night'?subjects.slice(0,1):subjects){
  for(const [angle,x,z] of stage==='night'?angles.slice(0,1):angles){
   await page.evaluate(({actor,x,z,aimY})=>{
    const store=window.__depthQaStore,{scene,camera:c,gl,internal}=store.getState(),o=scene.getObjectByName(actor);
    if(!o?.visible)throw Error('Missing visible field subject: '+actor);
    const eye=c.position.clone(),aim=eye.clone(),local=eye.clone().set(x,aimY+.30,z),target=eye.clone().set(0,aimY,0);
    const old=c.position.clone(),q=c.quaternion.clone(),render=gl.render;
    window.__qaDepthFrames=0;
    function place(){o.updateWorldMatrix(true,false);eye.copy(local).applyMatrix4(o.matrixWorld);aim.copy(target).applyMatrix4(o.matrixWorld);c.position.copy(eye);c.lookAt(aim);c.updateMatrixWorld();}
    gl.render=function(s,cam,...rest){if(s===scene&&cam===c){place();window.__qaDepthFrames++;}return render.call(this,s,cam,...rest);};
    const remove=internal.subscribe({current:()=>{if(store.getState().viewport.dpr!==1)store.getState().setDpr(1);place();}},.5,store);
    window.__finishDepthQa=()=>{remove();gl.render=render;c.position.copy(old);c.quaternion.copy(q);};
   },{actor,x,z,aimY});
   await page.waitForFunction(()=>window.__qaDepthFrames>=4,null,{timeout:30000});
   const file=id+'-'+angle+'.png';await page.screenshot({path:base+file});
   const shot=await page.evaluate(({actor,id,angle})=>{
    const {scene,camera,gl}=window.__depthQaStore.getState(),o=scene.getObjectByName(actor),meshes=[];
    o.traverseVisible(m=>{if(!m.isMesh)return;const g=m.geometry,pos=g?.getAttribute('position');if(!pos)return;
     g.computeBoundingBox();const b=g.boundingBox,kind=g.getAttribute('surfaceKind');let gunPoints=0,minZ=Infinity,maxZ=-Infinity;
     if(kind)for(let i=0;i<kind.count;i++)if(kind.getX(i)===7){++gunPoints;minZ=Math.min(minZ,pos.getZ(i));maxZ=Math.max(maxZ,pos.getZ(i));}
     meshes.push({name:m.name,geometry:g.type,material:m.material.name,vertices:pos.count,dimensions:[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z],
      quaternion:m.quaternion.toArray(),bones:m.skeleton?.bones.length??0,gunPoints,gunDepth:gunPoints?maxZ-minZ:0});});
    const result={actor,angle,actorUuid:o.uuid,camera:camera.position.toArray(),actorPosition:o.getWorldPosition(camera.position.clone()).toArray(),meshes,
     hordeHud:document.querySelector('.nightmare-order')?.textContent?.trim()??null,fog:scene.fog?.color.getHexString()??null,
     viewport:[gl.domElement.width,gl.domElement.height],bundle:performance.getEntriesByType('resource').map(e=>e.name).find(u=>/\/GameSession-[\w-]+\.js/.test(u))};
    window.__finishDepthQa();return result;
   },{actor,id,angle});
   log.shots.push({...shot,file});assert(shot.bundle);assert.deepEqual(shot.viewport,[1920,1080]);
   console.log(stage,id,angle,shot.meshes.map(m=>[m.name,m.bones,m.vertices,m.dimensions[2]]));
   if(stage==='night')assert(shot.hordeHud,'Separate night still must come from live horde mode');
   if(stage==='before')assert(shot.meshes.some(m=>m.name==='ghost-actor-pixels'&&m.dimensions[2]<.001));
   else {
    assert(!shot.meshes.some(m=>m.name==='ghost-actor-pixels'));
    const body=shot.meshes.find(m=>m.bones>=4&&m.vertices>80&&m.dimensions.every(n=>n>.18));assert(body,'Missing visible volumetric skeletal soldier');
    assert(shot.meshes.some(m=>m.gunDepth>.4||(m.bones===0&&m.vertices>60&&m.dimensions[2]>.4)),'Missing visible 3D rifle');
   }
  }
  if(stage==='night')continue;
  const triplet=log.shots.filter(s=>s.actor===actor);assert.equal(new Set(triplet.map(s=>s.actorUuid)).size,1);
  if(stage==='after') {
   const q=triplet[0].meshes.find(m=>m.bones>0).quaternion;
   assert(triplet.every(s=>s.meshes.find(m=>m.bones>0).quaternion.every((v,i)=>Math.abs(v-q[i])<1e-4)),'Body rotated toward the photo camera');
   await sheet(id);
  }else{
   const qs=triplet.map(s=>s.meshes.find(m=>m.name==='ghost-actor-pixels').quaternion);
   assert(Math.abs(qs[0].reduce((sum,e,i)=>sum+e*qs[2][i],0))<.85,'Baseline did not capture billboard turning');
  }
 }
 assert.deepEqual(log.errors,[]);log.status='passed';
}finally{await writeFile(base+'receipt.json',JSON.stringify(log,null,2));await browser.close();}
if(stage==='after'||stage==='night')await gallery();
