// One ordinary synthetic campaign. Follow an actual translated, formerly
// kneeling US actor with the inspection camera. No AI/clock/actor overrides.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
const {chromium}=createRequire(import.meta.url)('playwright');
const [port,outArg,bundle]=process.argv.slice(2),out=resolve(outArg);
assert(/^\d{4,5}$/.test(port) && /^GameSession-[\w-]+\.js$/.test(bundle));
const origin='http://127.0.0.1:'+port,errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  const loaded=page.waitForResponse(r=>r.url()===origin+'/assets/'+bundle&&r.ok(),{timeout:30000});
  void loaded.catch(()=>{});
  await page.goto(origin);await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
  const asset=await loaded,sha256=createHash('sha256').update(await asset.body()).digest('hex');
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Not a browser-only synthetic test');
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const o=h.memoizedState?.current;if(o?.name==='player-tank'&&o.__r3f.root.getState().scene.getObjectByName('us-rifle-1')){
        window.__coverWalk=o.__r3f.root;return true;
      }
    }return false;
  },null,{timeout:30000});
  const result=await page.evaluate(async()=>{
    const store=window.__coverWalk,{scene,gl,camera,internal,clock}=store.getState();
    const subjects=[],vec=()=>camera.position.clone(),saved=camera.position.clone(),savedQ=camera.quaternion.clone();
    for(const id of ['us-rifle-1','us-rifle-2','us-rifle-3']){
      const actor=scene.getObjectByName(id),skin=actor?.getObjectByName('us-field-infantry-volume');
      if(!skin)continue;
      const [pelvis,,thigh,shinL,footL,,shinR,footR]=skin.skeleton.bones;
      if(thigh.position.y<.60)subjects.push({actor,pelvis,shinL,shinR,footL,footR,last:actor.position.clone()});
    }
    if(!subjects.length)throw Error('No authored cover rigs');
    const mime=['video/mp4;codecs=avc1.42001E','video/webm;codecs=vp8'].find(x=>MediaRecorder.isTypeSupported(x));
    if(!mime)throw Error('No canvas video codec');
    const stream=gl.domElement.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000}),parts=[];
    const ended=new Promise(resolve=>{recorder.onstop=resolve;});
    recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
    const a=vec(),b=vec(),samples=[];
    let chosen=null,t0=0,realStart=0,travel=0,peak=0,selectedVisible=true;
    let finish;const done=new Promise(resolve=>{finish=resolve;});
    const off=internal.subscribe({current:()=>{
      const now=clock.elapsedTime;
      for(const s of subjects){
        const moved=s.actor.position.distanceTo(s.last);
        if(!chosen&&s.actor.visible&&moved>.0003&&s.pelvis.position.y>.065){
          chosen=s;t0=now;realStart=performance.now();recorder.start();
        }
        if(s===chosen)travel+=moved;s.last.copy(s.actor.position);
      }
      if(!chosen)return;
      const {actor,pelvis,shinL,shinR,footL,footR}=chosen;
      selectedVisible&&=actor.visible;
      actor.updateWorldMatrix(true,true);
      const offsetY=pelvis.position.y*.40;
      camera.position.copy(a.set(2.1,.91,-.74).applyMatrix4(actor.matrixWorld));
      camera.lookAt(b.set(0,.71+offsetY,-.08).applyMatrix4(actor.matrixWorld));camera.updateMatrixWorld(true);
      peak=Math.max(peak,pelvis.position.y);
      samples.push({t:now,world:actor.position.toArray(),hip:pelvis.position.y,
        knees:[shinL,shinR].map(o=>actor.worldToLocal(o.getWorldPosition(a)).y),ankles:[footL,footR].map(o=>o.getWorldPosition(a).toArray())});
      if(performance.now()-realStart>3600)finish();
    }},.91,store);
    const timeout=setTimeout(finish,26000);
    try{
      await done;
      if(!chosen||recorder.state==='inactive')throw Error('No naturally moving cover soldier observed');
      recorder.stop();await ended;
      if(travel<.30||peak<.18||!selectedVisible||samples.length<18)throw Error('Incomplete walk '+JSON.stringify({travel,peak,selectedVisible,frames:samples.length}));
      const blob=new Blob(parts,{type:mime}),reader=new FileReader();
      const data=await new Promise((ok,no)=>{reader.onload=()=>ok(reader.result.split(',')[1]);reader.onerror=no;reader.readAsDataURL(blob);});
      return {data,mime,actor:chosen.actor.name,t0,travel,peak,samples};
    }finally{
      clearTimeout(timeout);off();if(recorder.state==='recording')recorder.stop();stream.getTracks().forEach(t=>t.stop());
      camera.position.copy(saved);camera.quaternion.copy(savedQ);camera.updateMatrixWorld(true);
    }
  });
  const {data,...receipt}=result,film='ordinary-cover-walk.'+(receipt.mime.includes('mp4')?'mp4':'webm');
  assert.deepEqual(errors,[]);await mkdir(out,{recursive:true});
  await writeFile(join(out,film),Buffer.from(data,'base64'));
  await writeFile(join(out,'capture.json'),JSON.stringify({bundle,sha256,film,route:'Start Campaign',cameraOnly:true,errors,...receipt},null,2));
  console.log(JSON.stringify({film:join(out,film),actor:receipt.actor,travel:receipt.travel,peak:receipt.peak,frames:receipt.samples.length}));
}finally{await browser.close();}
