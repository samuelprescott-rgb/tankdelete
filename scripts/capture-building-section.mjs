// Ordinary game inputs and stock chase camera. Never set a transform, material,
// time, health, resolution, or camera. Observes fuel-free locally bundled stages.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const [port,bundle,output,mode]=process.argv.slice(2);assert(/^\d{4}$/.test(port)&&['day','night'].includes(mode));
const out=resolve(output),origin='http://127.0.0.1:'+port,report={bundle,mode,photos:{},errors:[]};
await mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)('playwright'),browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal','--no-first-run']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push('Runtime: '+e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS false|context lost/i.test(m.text()))report.errors.push(m.text());});
 await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
 await page.goto(origin+(mode==='night'?'/?ghostSignal=embassy':'/'));await page.getByRole('button',{name:mode==='night'?/^Embassy approach/i:/^Start Campaign$/}).click();
 await page.waitForFunction(()=>{const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
  if(window.__TAURI_INTERNALS__)throw Error('simulated mode required');
  for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){const o=h.memoizedState?.current;
   if(o?.name==='player-tank'){window.bt=o;window.bs=o.__r3f.root;return true;}}return false;
 },null,{timeout:100000});
 assert.equal((await page.evaluate(()=>performance.getEntriesByType('resource').find(o=>/\/GameSession-[\w-]+\.js/.test(o.name))?.name)),origin+'/assets/'+bundle);
 await page.evaluate(()=>{const s=window.bs.getState(),t=window.bt,lens=s.camera.uuid;window.fact=()=>{
  const {scene,gl,camera,clock}=s,proj=(x,y,z)=>{const v=t.position.clone().set(x,y,z).project(camera);return [Math.round((1+v.x)*960),Math.round((1-v.y)*540)];};
  const huts=[];scene.traverse(n=>{if(n.visible&&n.userData?.ghostHutSkin)for(const {block:b} of n.userData.ghostHutSkin.entries)huts.push({name:b.name,at:b.position});});
  return {tank:t.position.toArray(),yaw:t.rotation.y,camera:camera.position.toArray(),fov:camera.fov,unmodifiedCamera:lens===camera.uuid,buf:[gl.domElement.width,gl.domElement.height],t:clock.elapsedTime,huts,
   poi:{jetty:proj(14.945,1.3,29),embassy:proj(0,4,-26),landing:!!scene.getObjectByName('far-bank-fishing-landing')},drawCalls:gl.info.render.calls};
 };});
 await page.waitForFunction(()=>window.fact().t>1.6&&window.fact().buf[0]===1920,null,{timeout:30000});
 const state=()=>page.evaluate(()=>window.fact()),ledger=async()=>writeFile(join(out,'receipt.json'),JSON.stringify(report,null,2));
 const shot=async name=>{await page.waitForTimeout(580);const s=await state();assert.deepEqual(s.buf,[1920,1080]);assert(s.unmodifiedCamera);
  await page.screenshot({path:join(out,name+'.jpg'),quality:95});report.photos[name]=s;await ledger();console.log(name,s.tank,s.yaw,s.poi.jetty);};
 const norm=x=>Math.atan2(Math.sin(x),Math.cos(x));
 const turn=async yaw=>{for(let j=0;j<55;j++){const s=await state(),err=norm(yaw-s.yaw);if(Math.abs(err)<.033)return;const k=err>0?'a':'d';await page.keyboard.down(k);try{await page.waitForTimeout(Math.min(145,Math.max(15,Math.abs(err)*350)));}finally{await page.keyboard.up(k);}await page.waitForTimeout(25);}throw Error('driver could not reach yaw '+yaw);};
 const drive=async(x,z)=>{const started=Date.now();let old=Infinity;while(Date.now()-started<27000){
  const s=await state(),dx=x-s.tank[0],dz=z-s.tank[2],dist=Math.hypot(dx,dz);if(dist<1.02)return;
  if(old<1.4&&dist>old+.3)return;old=dist;const desired=Math.atan2(-dx,-dz);
  if(Math.abs(norm(desired-s.yaw))>.09)await turn(desired);
  await page.keyboard.down('w');try{await page.waitForTimeout(Math.min(510,Math.max(70,dist*57)));}finally{await page.keyboard.up('w');}await page.waitForTimeout(95);
 }throw Error('drive did not reach '+[x,z]+' got '+JSON.stringify((await state()).tank));};
 const film=async name=>{const dir=join(out,name+'-frames');await mkdir(dir,{recursive:true});const cdp=await page.context().newCDPSession(page),frames=[];let busy=false,begin=0;
  cdp.on('Page.screencastFrame',async f=>{await cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});if(busy||!begin||Date.now()-begin>2450)return;
   busy=true;frames.push({b:f.data,t:f.metadata.timestamp});busy=false;});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:84,maxWidth:1280,maxHeight:720,everyNthFrame:3});begin=Date.now();await page.waitForTimeout(2500);await cdp.send('Page.stopScreencast');await cdp.detach();
  assert(frames.length>=6,'No moving screen sequence');const txt=[];
  for(let i=0;i<frames.length;i++){const fn='f'+String(i).padStart(3,'0')+'.jpg';await writeFile(join(dir,fn),Buffer.from(frames[i].b,'base64'));
   txt.push("file '"+fn+"'","duration "+Math.max(.016,(frames[i+1]?.t??frames[i].t+.04)-frames[i].t).toFixed(4));}
  await writeFile(join(dir,'frames.txt'),txt.join('\n')+'\n');const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','concat','-safe','1','-i','frames.txt','-c:v','libx264','-pix_fmt','yuv420p','-crf','19','-movflags','+faststart','-y',join(out,name+'.mp4')],{cwd:dir});assert.equal(ff.status,0,ff.stderr?.toString());};
 if(mode==='day'){
  await shot('river-approach');await drive(-2,9);await turn(Math.PI);await shot('village');
  const s=await state(),distance=h=>Math.hypot(h.at[0]-s.tank[0],h.at[2]-s.tank[2]);
  const hut=s.huts.filter(h=>distance(h)>5&&distance(h)<23).sort((a,b)=>Math.abs(distance(a)-10)-Math.abs(distance(b)-10))[0];
  if(hut){await turn(Math.atan2(s.tank[0]-hut.at[0],s.tank[2]-hut.at[2]));await shot('timber-row');report.hut=hut;}
  await drive(-.5,17.4);await turn(-2.16);await shot('jetty');await film('jetty-motion');
  await drive(.5,25.7);await drive(6.7,29.7);const q=await state();await turn(Math.atan2(q.tank[0]-14.945,q.tank[2]-29));await shot('ruin');await film('ruin-motion');
 }else{
  await page.waitForFunction(()=>!document.querySelector('.nightmare-takeover')&&document.querySelector('.nightmare-order.is-combat')&&window.fact().t>7,null,{timeout:32000});
  await shot('embassy');const y=(await state()).yaw;await turn(y+.57);await shot('west-wing');await turn(y-.43);await shot('east-wing');await film('east-wing-motion');
 }
 assert.deepEqual(report.errors,[]);report.ok=true;
}catch(e){report.failure=String(e);throw e;}finally{await writeFile(join(out,'receipt.json'),JSON.stringify(report,null,2));await browser.close();}
