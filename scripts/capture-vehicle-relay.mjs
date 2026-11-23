// Measure the visible relay model from the stock campaign chase camera. No
// camera/clock writes, diagnostic game flags, native bridge or fake inputs.
// node scripts/capture-vehicle-relay.mjs PORT GameSession-HASH.js FOLDER [--film]
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
const [port,bundle,folder,...opts]=process.argv.slice(2);
assert(/^\d{4,5}$/.test(port)&&/^GameSession-[\w-]+\.js$/.test(bundle)&&folder);
const origin='http://127.0.0.1:'+port,out=resolve(folder);
const {chromium}=createRequire(import.meta.url)('playwright');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],frames=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
const cues={cross:20.05,profile:23.80,incoming:24.88,contact:25.30,flash:25.46,roll:26.30,descent:27.55,bank:28.85,impact:31.12,smoke:33.1};
try {
 await page.goto(origin+'/');await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
 await page.waitForFunction(()=>{
  const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
  for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
   for(let h=f.memoizedState;h;h=h.next){const t=h.memoizedState?.current;
    if(t?.name==='player-tank'&&t.__r3f?.root.getState().scene.getObjectByName('relay-damaged-aircraft')){
     window.relayProof={store:t.__r3f.root};return true;}}
  return false;
 },null,{timeout:100000});
 const loaded=await page.evaluate(()=>performance.getEntriesByType('resource').find(r=>/\/assets\/GameSession-[^/]+\.js$/.test(r.name))?.name);
 assert.equal(loaded,origin+'/assets/'+bundle);
 await page.evaluate(({cues,film})=>{
  const w=window.relayProof,{scene,gl,camera,internal}=w.store.getState(),root=scene.getObjectByName('campaign-airlift'),
   bird=root.getObjectByName('relay-damaged-aircraft'),body=bird.getObjectByName('huey-body'),v=camera.position.clone(),p=v.clone();
  w.frames={};const shots=Object.entries(cues);let i=0;
  internal.subscribe({current:()=>{
   const t=root.userData.flightTime;
   if(film&&t>=18&&!w.rec){
    const stream=gl.domElement.captureStream(24),type=['video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    const rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:4000000}),chunks=[];
    w.movie=new Promise((res,rej)=>{rec.onerror=rej;rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
     rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onerror=rej;
      reader.onload=()=>res(String(reader.result).split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type}));};});
    w.rec=rec;rec.start(1000);
   }
   if(i>=shots.length||t<shots[i][1])return;
   const [id]=shots[i++],{width,height}=gl.domElement;
   const [x,y]=bird.getWorldPosition(p).project(camera).toArray(),pos=body.geometry.attributes.position;
   let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
   for(let k=0;k<pos.count;k++){v.fromBufferAttribute(pos,k).applyMatrix4(body.matrixWorld).project(camera);
    const sx=width*(v.x+1)/2,sy=height*(1-v.y)/2;left=Math.min(left,sx);right=Math.max(right,sx);top=Math.min(top,sy);bottom=Math.max(bottom,sy);}
   const data=gl.domElement.toDataURL('image/jpeg',.91),world=bird.getWorldPosition(p);
   w.frames[id]={data:data.split(',')[1],id,time:t,width,height,camera:camera.position.toArray(),center:[(x+1)*width/2,(1-y)*height/2],
    visible:bird.visible,pivotDistance:world.distanceTo(camera.position),world:world.toArray(),bodyWidthPx:right-left,bounds:[left,top,right,bottom]};
   if(i===shots.length&&w.rec)w.rec.stop();
  }},1.9,w.store);
 },{cues,film:opts.includes('--film')});
 for(const id of Object.keys(cues)){
  await page.waitForFunction(id=>!!window.relayProof?.frames[id],id,{timeout:150000,polling:200});
  const {data,...row}=await page.evaluate(id=>{const w=window.relayProof,r=w.frames[id];delete w.frames[id];return r;},id);
  assert.equal(row.width,1920);assert.equal(row.height,1080);assert(row.time-cues[id]<.20);
  const file=id+'.jpg';await writeFile(join(out,file),Buffer.from(data,'base64'));frames.push({...row,file});
  console.log(id,row.time.toFixed(2),'s;',row.bodyWidthPx.toFixed(1),'px');
 }
 if(opts.includes('--film')){
  const b=await page.evaluate(()=>window.relayProof.movie);const path=join(out,'relay.webm');await writeFile(path,Buffer.from(b,'base64'));
  execFileSync('ffmpeg',['-nostdin','-loglevel','error','-n','-i',path,'-an','-vf','scale=1280:720','-c:v','libx264','-threads','2','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',join(out,'relay.mp4')]);
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'relay.json'),JSON.stringify({bundle,loaded,camera:'unaltered stationary player chase; no HUD overlay in WebGL surface',frames,errors},null,2));
}finally{await browser.close();}
