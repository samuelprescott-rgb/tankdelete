// Fresh isolated headless Chrome. No native bridge, file selection, player
// damage calls, time warps, target injections or camera changes in chase mode.
// NODE_PATH=<playwright+sharp> node scripts/capture-campaign-flights.mjs PORT OUT [bundle-fragment] [both|campaign|boot] [--video]
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const [port,folder,expected='',select='both']=process.argv.slice(2);
const video=process.argv.includes('--video');
assert.ok(/^\d{4,5}$/.test(port)&&+port!==1420&&+port<=65535&&folder&&['both','campaign','boot'].includes(select));
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const out=resolve(folder);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const errors=[],runs=[];
// Both ridge passes use the player's chase camera. Only the separate Boot
// Camp transport and seated crew are inspected up close before the relay call.
const cues=[['inbound',4.7],['skids',7.9],['door',9.0],['squad',13.2],['outbound',17.2],
  ['enter-left',20.05],['patrol',23.8],['incoming-rocket',24.88],['strike',25.46],['descent',27.55],['bank-right',28.85],
  ['impact',31.12],['smoke',34.15]];
async function run(mode){
  const fixed=mode==='boot',ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|WebGLProgram.*ERROR/i.test(m.text()))errors.push(m.text());});
  try{
    await page.goto('http://127.0.0.1:'+port+'/');
    await page.getByRole('button',{name:fixed?'Boot Camp':'Start Campaign',exact:true}).click();
    await page.waitForFunction(()=>{
      if(window.__TAURI_INTERNALS__)throw Error('Native gameplay prohibited in this harness');
      const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
      for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
        for(let h=f.memoizedState;h;h=h.next){const t=h.memoizedState?.current;
          if(t?.name==='player-tank'&&t.__r3f.root.getState().scene.getObjectByName('campaign-airlift')){
            window.__flights={store:t.__r3f.root};return true;}}
      return false;
    },null,{timeout:120000});
    const bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(u=>/\/assets\/GameSession-[^/]+\.js(?:$|\?)/.test(u)));
    assert.ok(bundle&&bundle.includes(expected),'not the expected production build: '+bundle);
    await page.evaluate(({fixed,cues,video})=>{
      const w=window.__flights,{camera,scene,internal}=w.store.getState(),flight=scene.getObjectByName('campaign-airlift');
      if(video){
        const stream=w.store.getState().gl.domElement.captureStream(24),type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
        if(!type)throw Error('A browser encoder is unavailable');
        const rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:6500000}),chunks=[];
        rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        w.film=new Promise((resolve,reject)=>{rec.onerror=reject;rec.onstop=()=>{
          const reader=new FileReader();reader.onerror=reject;reader.onload=()=>resolve(String(reader.result).split(',')[1]);
          reader.readAsDataURL(new Blob(chunks,{type}));for(const track of stream.getTracks())track.stop();
        };});rec.start(1500);w.rec=rec;
      }
      const obj=n=>scene.getObjectByName(n),pos=camera.position.clone(),look=pos.clone(),vec=pos.clone();
      const transportInspection=t=>{
          const a=obj('kestrel-campaign-transport'),local=(x,y,z)=>a.localToWorld(vec.set(x,y,z)).toArray();
          return t<6?[local(6,2.1,-4),local(0,.4,.55)]:t<16?
            [local(4.65,.55,-1.55),local(.35,-.02,.25)]:[local(5.1,1.1,-5.2),local(0,.38,.52)];
      };
      w.records=[];w.frames={};let next=0;
      if(fixed){
        // Replace the chase rig's camera operation at its own point in the
        // frame. A late pre-render override makes view-facing smoke aim at
        // the outgoing chase camera, so the inspection shot loses its plume.
        const realLookAt=camera.lookAt;
        camera.lookAt=function(...args){
          const t=flight.userData.flightTime||0;
          if(t>=17.65){
            // Release the inspection before the relay chooses its route. From
            // here both modes use ordinary CameraRig; never tail the falling ship.
            camera.position.set(-2.95,3.12,-16.85);camera.lookAt=realLookAt;
            return realLookAt.apply(camera,args);
          }
          const [p,q]=transportInspection(t);
          camera.position.fromArray(p);realLookAt.call(camera,look.fromArray(q));camera.updateMatrixWorld();
        };
        camera.lookAt(look);
      }
      internal.subscribe({current:({gl})=>{
        const t=flight.userData.flightTime;
        if(next>=cues.length||!(t>=cues[next][1]))return;
        const [id,goal]=cues[next++];
        // Access display pixels in the frame the gameplay composer just
        // presented. Unlike a later screenshot this can't miss a short flash.
        const img=gl.domElement.toDataURL('image/png');
        if(img==='data:,')throw Error('No WebGL display for '+id);
        w.frames[id]=img.slice(img.indexOf(',')+1);
        const actors=['kestrel-pip','kestrel-lark','kestrel-fin'].map(id=>{
          const o=obj(id);if(!o)return null;return {id,visible:o.visible,position:o.position.toArray(),shots:o.userData.reliefRounds??0};
        }).filter(Boolean);
        const heli=(name)=>{const g=obj(name);return {visible:g.visible,world:g.position.toArray(),
          screen:vec.copy(g.position).project(camera).toArray()};};
        w.records.push({id,goal,time:t,actors,camera:camera.position.toArray(),size:[gl.domElement.width,gl.domElement.height],
          transport:heli('kestrel-campaign-transport'),patrol:heli('relay-damaged-aircraft'),flash:obj('relay-strike-flash').visible,
          rocket:obj('relay-impact-streak').visible,fire:obj('relay-tumbling-fire-trail').count,
          groundImpact:obj('relay-ground-impact').visible,smoke:obj('relay-drifting-smoke').count,
          radio:document.querySelector('.campaign-air-call')?.textContent??null});
        if(next===cues.length&&w.rec)w.rec.stop();
      }},1.9,w.store);
    },{fixed,cues,video});
    const shots=[];
    for(const [id] of cues){
      await page.waitForFunction(id=>!!window.__flights?.frames[id],id,{timeout:155000,polling:300});
      const [b,row]=await page.evaluate(id=>{
        const w=window.__flights,data=w.frames[id];delete w.frames[id];return [data,w.records.find(r=>r.id===id)];
      },id);
      const file=mode+'-'+id+'.png';
      await writeFile(join(out,file),Buffer.from(b,'base64'));shots.push({...row,file});
      console.log(mode,id,row.time.toFixed(2),row.actors.length+' actors',row.smoke+' puffs');
      if(!fixed&&id==='skids')await page.screenshot({path:join(out,'campaign-ordinary-hud.png'),timeout:60000});
    }
    assert.ok(shots.every(x=>x.time-x.goal<.15));assert.ok(shots.find(r=>r.id==='strike').flash);
    assert.ok(shots.find(r=>r.id==='incoming-rocket').rocket&&shots.find(r=>r.id==='descent').fire>=3);
    const squad=shots.find(r=>r.id==='squad');assert.equal(squad.actors.length,3);
    assert.ok(shots.some(r=>r.actors.some(a=>a.shots>0)),'no actual passenger fired this route');
    assert.ok(shots.find(r=>r.id==='descent').patrol.world[1]<shots.find(r=>r.id==='strike').patrol.world[1]);
    {
      const xs=['enter-left','strike','bank-right'].map(id=>shots.find(r=>r.id===id).patrol.screen[0]);
      assert.ok(xs[0]<-.60&&xs[1]>.1&&xs[2]>.36,'did not cross ordinary gameplay view: '+xs);
    }
    assert.ok(shots.find(r=>r.id==='impact').groundImpact,'missing ground impact');
    assert.ok(!shots.at(-1).patrol.visible&&shots.at(-1).smoke>0,'no lingering crash smoke');
    const parts=[],width=520,height=293,bar=34;
    for(let i=0;i<shots.length;i++){
      const shot=shots[i],left=(i%3)*width,top=Math.floor(i/3)*(height+bar);
      const tag=Buffer.from('<svg width="'+width+'" height="'+bar+'"><text x="10" y="24" fill="#ffdd9f" font-size="18" font-family="Helvetica">'+(i+1)+'. '+shot.id.toUpperCase()+'   /   T+'+shot.time.toFixed(1)+'</text></svg>');
      parts.push({input:tag,left,top},{input:await sharp(join(out,shot.file)).resize(width,height).png().toBuffer(),left,top:top+bar});
    }
    await sharp({create:{width:width*3,height:(height+bar)*Math.ceil(shots.length/3),channels:3,background:'#182321'}}).composite(parts).jpeg({quality:94}).toFile(join(out,mode+'-contact.jpg'));
    let film;
    if(video){
      film=mode+'-flight.webm';const data=await page.evaluate(()=>window.__flights.film);
      const bytes=Buffer.from(data,'base64');assert.ok(bytes.length>100000);await writeFile(join(out,film),bytes);
    }
    runs.push({mode,camera:fixed?'crew inspection; ridge pass in ordinary player chase':'ordinary player chase',bundle,shots,film});
  }finally{await ctx.close();}
}
try{
  for(const mode of select==='both'?['campaign','boot']:[select])await run(mode);
  assert.deepEqual(errors,[]);
}finally{await writeFile(join(out,'airlift-receipt-'+select+'.json'),JSON.stringify({runs,errors},null,2));await browser.close();}
