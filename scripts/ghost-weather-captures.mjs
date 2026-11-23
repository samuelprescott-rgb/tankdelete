// Two builds, the same seed, inspection lens, and world coordinates. Only
// camera placement and UI visibility change; no replacement lights or assets.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const [port,cdp,dir,version]=process.argv.slice(2);
assert.ok([port,cdp].every(v=>/^\d{4,5}$/.test(v)) && dir && ['before','after'].includes(version));
const out=resolve(dir);await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+cdp);
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={version,port,views:[],errors:[]};
try {
 for(const slice of ['river','embassy']){
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|WebGLProgram.*ERROR/i.test(m.text()))report.errors.push(m.text())});
  await page.goto('http://127.0.0.1:'+port+'/?ghostSignal='+slice);
  await page.getByRole('button',{name:slice==='river'?/^River crossing/i:/^Embassy approach/i}).click();
  await page.waitForFunction(()=>{
    const r=document.querySelector('canvas[data-game-ui]');if(!r)return false;
    for(let f=r[Object.keys(r).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
      const store=t.__r3f.root,s=store.getState();if(!s.scene.getObjectByName('winding-river-water'))return false;
      window.__weatherQA={s,store};return true;
    }
    return false;
  },null,{timeout:80000});
  await page.waitForTimeout(2000);
  if(slice==='embassy' && version==='after')await page.waitForFunction(()=>!!window.__weatherQA.s.scene.getObjectByName('ghost-signal-horde-rain'),null,{timeout:45000});
  const evidence=await page.evaluate(()=>({hud:document.body.innerText.slice(0,850),bundle:performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname).filter(p=>/assets\/(?:index|GameSession)-.*\.js$/.test(p))}));
  assert.ok(evidence.bundle.some(p=>p.includes('GameSession-')));
  await page.addStyleTag({content:'body *:not(:has(canvas)):not(canvas){visibility:hidden!important} canvas[data-game-ui]{visibility:hidden!important}'});
  const views=slice==='river'?[['water',[-23.1,2.35,-1.5],[-24.3,-.02,-7.1]],['water-detail',[-23.1,1.55,-4.0],[-24.0,0,-6.9]]]:
                             [['rain',[-11,2.6,-8.1],[-2,1.4,-23]],['rain-gate',[4.0,1.7,-12.2],[-.3,1.45,-24.7]]];
  for(const [name,eye,aim] of views){
   const frame=await page.evaluate(({eye,aim})=>{
    const {s,store}=window.__weatherQA,c=s.camera;
    const frame=()=>{c.position.fromArray(eye);c.lookAt(...aim);c.updateMatrixWorld();};
    window.__endWeatherShot=s.internal.subscribe({current:frame},0,store);frame();
    const rain=s.scene.getObjectByName('ghost-signal-horde-rain');
    return {rain:rain?{drops:rain.geometry.index.count/6,time:rain.material.uniforms.elapsed.value}:null,
            pools:(s.scene.getObjectByName('ghost-signal-rain-gathers')?.geometry.index.count??0)/6,
            canvas:[s.gl.domElement.width,s.gl.domElement.height],type:s.scene.getObjectByName('winding-river-water').material.customProgramCacheKey()};
   },{eye,aim});
   await page.waitForTimeout(450);await page.screenshot({path:out+'/'+name+'.png',timeout:70000});
   // Optional real-time film of the compositor's actual output. No offline
   // animation, duplicated stills or moved rain camera during this recording.
   if(process.env.GHOST_WEATHER_FILM==='1'&&version==='after'&&['water-detail','rain'].includes(name)){
    const video=await page.evaluate(async()=>{
      const {s}=window.__weatherQA,stream=s.gl.domElement.captureStream(30);
      try{
        const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:4500000});
        const parts=[];const ready=new Promise((resolve,reject)=>{
          recorder.ondataavailable=e=>parts.push(e.data);recorder.onerror=e=>reject(e.error?.message??'recording failed');
          recorder.onstop=async()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject('video read failed');reader.readAsDataURL(new Blob(parts,{type:'video/webm'}));};
        });
        recorder.start();await new Promise(res=>setTimeout(res,3500));recorder.stop();return await ready;
      }finally{stream.getTracks().forEach(t=>t.stop());}
    });await writeFile(out+'/'+name+'.webm',Buffer.from(video,'base64'));
   }
   await page.evaluate(()=>window.__endWeatherShot());
   assert.equal(!!frame.rain,version==='after'&&slice==='embassy');
   assert.deepEqual(frame.canvas,[1920,1080]);
   assert.equal(frame.pools,version==='after'&&slice==='embassy'?11:0);
   assert.equal(frame.type,version==='after'?'wetland-water-ghost-crossing-v3':'wetland-water-ghost-crossing-v1');
   report.views.push({slice,name,eye,aim,...frame,...evidence});
  }
  await page.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile(out+'/weather.json',JSON.stringify(report,null,2));await context.close();await browser.close();}
