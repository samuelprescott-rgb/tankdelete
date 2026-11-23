// Fixed-camera evidence from a running production build. Never changes game state or assets.
import assert from 'node:assert/strict';
import {createHash,randomInt} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url), sharp=require('sharp');
const [stage,port,bundle]=process.argv.slice(2);
const root=resolve('../TankDelete-Concepts/ghost-field'),names=['boot-chase','boot-ridgeline','river-tank','tank-quarters','embassy-chase'];
const sha=b=>createHash('sha256').update(b).digest('hex');
if(stage==='compare'){
 const [before,after]=[port,bundle];assert([before,after].every(s=>/^[a-z0-9-]+$/.test(s)));
 const reports=await Promise.all([before,after].map(s=>readFile(root+'/'+s+'/report.json','utf8').then(JSON.parse)));
 assert(reports.every(r=>r.pass)&&reports[0].bundle!==reports[1].bundle);
 const prior=await readFile(root+'/'+after+'/blind-key.json','utf8').then(JSON.parse,e=>{if(e.code!=='ENOENT')throw e;return null;});
 if(prior)assert(prior.length===names.length && prior.every((row,i)=>row.name===names[i] && [before,after].includes(row.left)));
 const order=prior?Number(prior[0].left===after):randomInt(2), small=(label,w)=>Buffer.from('<svg width="'+w+'" height="27"><rect width="100%" height="100%" fill="#142329"/><text x="12" y="19" fill="#edebd6" font-family="Helvetica" font-size="15">'+label+'</text></svg>');
 const key=[];
 for(const type of ['field','tank','night']){
  const list=type==='field'?names.slice(0,2):type==='tank'?names.slice(2,4):names.slice(4), rows=[[],[]],w=660,h=371;
  for(const [y,name] of list.entries()){
   const meta=reports.map(r=>r.shots.find(s=>s.name===name)); if(name!=='boot-chase'&&name!=='embassy-chase'){assert.deepEqual(meta[0].local,meta[1].local);assert.deepEqual(meta[0].world,meta[1].world);}
   const flip=(order+names.indexOf(name))%2;key.push({name,left:flip?after:before});
   for(let x=0;x<2;x++){
    const raw=await readFile(root+'/'+[before,after][x]+'/'+name+'.png');assert.equal(sha(raw),meta[x].sha);
    const px=await sharp(raw).resize(w,h,{fit:'fill'}).png().toBuffer();
    for(let b=0;b<2;b++){const c=b?x^flip:x;rows[b].push({input:small((b?(c?'B':'A'):(c?'AFTER':'BEFORE'))+'   /   '+name,w),left:c*w,top:y*(h+27)},{input:px,left:c*w,top:y*(h+27)+27});}
   }
  }
  for(let b=0;b<2;b++)await sharp({create:{width:w*2,height:list.length*(h+27),channels:3,background:'#142329'}}).composite(rows[b]).jpeg({quality:94}).toFile(root+'/'+after+'/'+type+(b?'-AB':'-comparison')+'.jpg');
 }
 // Native-pixel detail: same crop in both 1920 x 1080 originals, without
 // re-lighting, replacement art, sharpening, or resampling.
 const detail=[];
 for(const [y,name] of ['river-tank','tank-quarters'].entries()){
  for(const [x,s] of [before,after].entries()){
   const crop=await sharp(root+'/'+s+'/'+name+'.png').extract({left:530,top:300,width:950,height:540}).png().toBuffer();
   detail.push({input:small((x?'AFTER':'BEFORE')+' / '+name+' / 1:1 game pixels',950),left:x*950,top:y*567},
    {input:crop,left:x*950,top:y*567+27});
  }
 }
 await sharp({create:{width:1900,height:1134,channels:3,background:'#142329'}}).composite(detail).png().toFile(root+'/'+after+'/tank-native-details.png');
 await writeFile(root+'/'+after+'/blind-key.json',JSON.stringify(key));process.exit(0);
}
assert(/^[a-z0-9-]+$/.test(stage)&&/^\d+$/.test(port)&&/^[\w-]+$/.test(bundle));
const out=root+'/'+stage;await mkdir(out,{recursive:true});
const browser=await require('playwright').chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const artStills=process.argv.includes('--art-stills');
const report={bundle,views:'Production WebGL. Fixed shots use an inspection camera; chase retains default camera and HUD.'+(artStills?' Art stills hold the actual render buffer at 1920x1080; not a frame-time test.':''),shots:[],errors:[]};
try {
 for(const mode of ['boot','river','embassy']){
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS false|WebGL: INVALID|context lost/i.test(m.text()))report.errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+port+'/'+(mode==='boot'?'':'?ghostSignal='+mode));
  await page.getByRole('button',{name:mode==='boot'?/^Boot Camp$/i:mode==='river'?/^River crossing/i:/^Embassy approach/i}).click();
  await page.waitForFunction(()=>{
   const radar=document.querySelector('canvas[data-game-ui]');if(!radar)return false;
   for(let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
    const store=t.__r3f.root,s=store.getState();if(!s.scene.getObjectByName('winding-river-water'))return false;
    if(!window.__film){window.__film={t,store,s,frames:0};s.internal.subscribe({current:()=>{window.__film.frames++;}},0,store);}
    return true;
   }
  },null,{timeout:90000});
  if(artStills)await page.evaluate(()=>{const {store}=window.__film;store.getState().internal.subscribe({current:()=>{if(store.getState().viewport.dpr!==1)store.getState().setDpr(1);}},0,store);});
  await page.waitForFunction(()=>window.__film.frames>60,null,{timeout:65000});
  if(mode==='embassy')await page.waitForFunction(()=>!document.querySelector('.nightmare-takeover')&&document.querySelector('.nightmare-order')?.classList.contains('is-combat'),null,{timeout:45000});
  for(const [name,local,world] of mode==='boot'?[[names[0],null,null],[names[1],null,[[1.0,3.2,-13],[1.0,4.7,36]]]]:mode==='river'?[[names[2],[[4.1,1.95,3.45],[0,.63,-.25]],null],[names[3],[[3.4,1.68,-3.65],[0,.66,-.1]],null]]:[[names[4],null,null]]){
   if(local||world)await page.addStyleTag({content:'body *:not(:has(canvas)):not(canvas){visibility:hidden!important} canvas[data-game-ui]{visibility:hidden!important}'});
   await page.evaluate(({local,world})=>{
    const a=window.__film,{camera:c}=a.s,eye=c.position.clone(),aim=eye.clone();a.start=a.frames;
    if(!local&&!world)return; const [e,l]=local||world;
    const place=()=>{eye.fromArray(e);aim.fromArray(l);if(local){a.t.updateWorldMatrix(true,false);eye.applyMatrix4(a.t.matrixWorld);aim.applyMatrix4(a.t.matrixWorld);}c.position.copy(eye);c.lookAt(aim);c.updateMatrixWorld();};
    const gl=a.s.gl,original=gl.render;gl.render=function(sc,cam,...other){if(sc===a.s.scene&&cam===c)place();return original.call(this,sc,cam,...other);};const off=a.s.internal.subscribe({current:place},.5,a.store);a.undo=()=>{off();gl.render=original;};place();
   },{local,world});
   await page.waitForFunction(()=>window.__film.frames-window.__film.start>10,null,{timeout:20000});
   // Both subject-relative pictures use the *same* sight line. Ordinary
   // pointer input slews the live articulated turret; do not rotate the mesh.
   if(local){
    const mouse=await page.evaluate(()=>{const {s,t}=window.__film,land=t.position.clone().set(0,0,-1.68).applyMatrix4(t.matrixWorld);land.y=0;land.project(s.camera);return [(land.x+1)*innerWidth/2,(1-land.y)*innerHeight/2];});
    assert(mouse.every(Number.isFinite)&&mouse[0]>0&&mouse[0]<1920&&mouse[1]>0&&mouse[1]<1080,'Aim sample must be on canvas');
    await page.mouse.move(...mouse);
    await page.waitForFunction(()=>{const {t}=window.__film,q=t.getObjectByName('tank-turret').quaternion;return Math.abs(q.y)<.025;},null,{timeout:15000});
   }
   const meta=await page.evaluate(()=>{const {s,t}=window.__film;return {buffer:[s.gl.domElement.width,s.gl.domElement.height],eye:s.camera.position.toArray(),heading:s.camera.quaternion.toArray(),tank:t.position.toArray(),turret:t.getObjectByName('tank-turret').quaternion.toArray(),module:performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\/GameSession-[\w-]+\.js$/.test(n))};});
   assert.deepEqual(meta.buffer,[1920,1080]);assert(meta.module.endsWith('/GameSession-'+bundle+'.js'),meta.module);
   const bytes=await page.screenshot({path:out+'/'+name+'.png'});report.shots.push({name,local,world,...meta,sha:sha(bytes)});
   await page.evaluate(()=>{window.__film.undo?.();window.__film.undo=null;});console.log(stage,name);
  }
  await page.close();
 }
 assert.deepEqual(report.errors,[]);report.pass=true;
}finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));}
