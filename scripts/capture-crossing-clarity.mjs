// Production campaign. Pose, render time, effects and HUD are only observed.
// Input is ordinary desktop input; no review camera, teleport or state changes.
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const port=Number(process.argv[2]);assert.ok(port>1024&&port<65536);
const base=resolve('tmp/production-qa');await mkdir(base,{recursive:true});const out=await mkdtemp(join(base,'crossing-clarity-'));
console.log(out);const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const origin='http://127.0.0.1:'+port,errors=[],frames=[],events=[];
let bundle=null,status='running';
const receipt=()=>writeFile(join(out,'receipt.json'),JSON.stringify({origin,bundle,status,frames,events,errors},null,2));
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===origin||['blob:','data:'].includes(u.protocol)?r.continue():r.abort();});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',e=>{if(e.type()==='error'&&/shader error|VALIDATE_STATUS false|GL_INVALID_OPERATION/.test(e.text()))errors.push(e.text());});
 await page.goto(origin+'/');await page.bringToFront();
 await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
 await page.evaluate(()=>{
  // The HUD can outlive a scene remount. Resolve the current connected actor
  // for every read instead of caching a possibly detached React ref.
  let renderStore;
  window.clarityLive=()=>{
   const c=document.querySelector('canvas[data-game-ui]'),world=document.querySelector('canvas[data-engine]');
   if(!c||!world)return null;
   const connected=(store)=>{
    const state=store?.getState(),scene=state?.scene;
    if(!scene||state.gl.domElement!==world||!world.isConnected)return null;
    const t=scene.getObjectByName('player-tank');
    return t?.parent?{t,state}:null;
   };
   const cached=connected(renderStore);if(cached)return cached;
   let root=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];
   while(root?.return)root=root.return;
   const path=[];
   function find(f){if(!f)return false;path.push(f);if(f.stateNode===c)return true;
    for(let child=f.child;child;child=child.sibling)if(find(child))return true;
    path.pop();return false;}
   if(!find(root?.stateNode?.current))return null;
   for(const f of path.reverse())for(let h=f.memoizedState;h;h=h.next){
    const t=h.memoizedState?.current;
    if(t?.name!=='player-tank')continue;
    const live=connected(t.__r3f?.root);
    if(live){renderStore=t.__r3f.root;return live;}
   }
   return null;
  };
  window.claritySample=()=>{
   const o=window.clarityLive();if(!o)return null;
   const {t,state:{scene,camera,gl,clock}}=o,r=gl.domElement.getBoundingClientRect();
   const land=scene.getObjectByName('far-bank-fishing-landing'),v=t.position.clone();
   let roof=null;if(land?.geometry.boundingSphere){const center=land.geometry.boundingSphere.center;
    v.set(center.x,3.25,center.z).project(camera);roof={x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};}
   const kits=scene.getObjectByName('recoverable-field-supplies')?.children.map(o=>({name:o.name,p:o.position.toArray(),visible:o.visible}));
   const cloud=scene.getObjectByName('ink-impact-plumes')?.geometry,instances=cloud?.instanceCount||0;
   let shards=0;for(let i=0;i<instances;i++)if(cloud.getAttribute('beat').getY(i)<0)shards++;
   const clouds=instances-shards;
   return {pose:t.position.toArray(),yaw:t.rotation.y,pitch:t.rotation.x,roll:t.rotation.z,camera:camera.position.toArray(),buffer:[gl.domElement.width,gl.domElement.height],
    time:clock.elapsedTime,pageTime:performance.now(),focus:document.hasFocus(),visible:!document.hidden,roof,kits,clouds,shards,
    phase:clouds?cloud.getAttribute('beat').getX(0):null,hp:document.querySelector('.armor-status strong')?.textContent};
  };
 });
 const sample=()=>page.evaluate(()=>window.claritySample());
 const check=async(fn,arg,timeout=15000)=>{const h=await page.waitForFunction(fn,arg,{polling:'raf',timeout});await h.dispose();};
 await check(()=>{const s=window.claritySample();return s?.time>.7&&Math.abs(s.pose[2]+12)<.01&&s.buffer[0]===1920&&s.buffer[1]===1080;},null,100000);
 bundle=await page.evaluate(()=>performance.getEntriesByType('resource').find(x=>/\/GameSession-[\w-]+\.js$/.test(x.name))?.name);
 const expected=process.argv.find(s=>s.startsWith('--bundle='))?.slice(9);
 assert.ok(bundle&&(!expected||new URL(bundle).pathname==='/assets/'+expected+'.js'),'unexpected bundle '+bundle);
 const cdp=await page.context().newCDPSession(page);
 const capture=async(name,details={})=>{
  await check(()=>!!window.clarityLive(),null,8000);
  const before=await sample();
  const result=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  const after=await sample();assert.ok(before&&after,'scene disconnected during '+name+' capture');
  await writeFile(join(out,name+'.png'),Buffer.from(result.data,'base64'));
  frames.push({name,file:name+'.png',...before,after,...details});await receipt();
  console.log(name,JSON.stringify({pose:before.pose,camera:before.camera,time:[before.time,after.time],hp:before.hp,clouds:before.clouds,phase:before.phase}));
  return before;
 };
 await capture('approach');
 if(process.argv.includes('--bridge-proof'))await page.evaluate(()=>{
   const o=window.clarityLive(),track=[];window.driveAcrossProfile=track;
   o.t.__r3f.root.getState().internal.subscribe({current:()=>{
     const p=o.t.position,last=track.at(-1);if(!last||Math.abs(p.z-last.z)>.16)
       track.push({x:p.x,y:p.y,z:p.z,pitch:o.t.rotation.x,roll:o.t.rotation.z});
   }},0,o.t.__r3f.root);
 });
 // A blur, a component remount or a session transition can discard held keys.
 // Release/re-press after a measured stall. Keep the stop point on the bridge.
 let reached=false;
 for(let i=0;i<24&&!reached;i++){
  await page.keyboard.up('w');await page.bringToFront();
  await check(()=>document.hasFocus()&&!document.hidden&&!!window.clarityLive(),null,5000);
  const start=await sample();if(start.pose[2]>=14){reached=true;break;}
  await page.keyboard.down('w');try{
   await check(z=>{const s=window.claritySample();return s&&s.pose[2]>=Math.min(z+.2,14);},start.pose[2],1500);
   await check(()=>window.clarityLive()?.t.position.z>=14,null,6500);reached=true;
  }catch(err){if(err.name!=='TimeoutError')throw err;
   events.push({event:'retry-forward',attempt:i+1,start:start.pose,end:(await sample())?.pose});}
  finally{await page.keyboard.up('w');}
 }
 assert.ok(reached,'normal W drive never reached crossing: '+JSON.stringify(await sample()));
 // Match a resting chase camera, after the normal coast following keyup.
 await check(()=>{const s=window.claritySample();return s&&Math.abs(s.camera[0]+3.35)<.09&&Math.abs(s.camera[2]-s.pose[2]+4.48)<.14;},null,12000);
 const cross=await capture('crossing');assert(Math.abs(cross.pose[0])<.3&&Math.abs(cross.pose[2]-15.39)<2);
 if(process.argv.includes('--bridge-proof')){
   await page.keyboard.down('w');try{await check(()=>window.clarityLive()?.t.position.z>26.5,null,32000);}
   finally{await page.keyboard.up('w');}
   await check(()=>{const s=window.claritySample();return s&&Math.abs(s.pose[1])<.06&&Math.abs(s.pitch)<.02;},null,6000);
   await capture('far-bank');
   const profile=await page.evaluate(()=>window.driveAcrossProfile);
   const top=Math.max(...profile.map(p=>p.y)),up=Math.max(...profile.map(p=>p.pitch)),down=Math.min(...profile.map(p=>p.pitch));
   assert.ok(top>.70&&up>.10&&down<-.10&&profile.length>60,'a real climb, level span, descent and drive onto dry ground');
   events.push({event:'key-driven-bridge-traverse',top,maxPitch:up,minPitch:down,profile});await receipt();
 }
 if(process.argv.includes('--extras')){
  const target=(await sample()).roof;assert.ok(target);
  await page.mouse.move(target.x,target.y);await page.waitForTimeout(1300);
  for(let i=0;i<2;i++){await page.locator('[aria-label="Cannon ready"]').waitFor({state:'attached'});await page.mouse.click(target.x,target.y);
   await page.locator('[aria-label^="Cannon reload "]').waitFor({state:'attached'});if(!i)await page.waitForTimeout(1250);}
  await check(()=>{const s=window.claritySample();return s&&!s.roof&&s.clouds>=2;},null,5000);
  const burst=await capture('burst');
  await check(t=>window.claritySample()?.time>=t,burst.time+.40,4000);
  await capture('ash',{referenceTime:burst.time});
  const start=await sample(),dest=start.kits.find(s=>s.name==='pickup-patch');assert(dest.visible);
  let keys=[];const hold=async list=>{for(const k of keys)if(!list.includes(k))await page.keyboard.up(k);
   for(const k of list)if(!keys.includes(k))await page.keyboard.down(k);keys=list;};
  let lastReset=Date.now();const end=Date.now()+45000;
  try{while(Date.now()<end){
   const s=await sample();if(!s){await hold([]);await page.waitForTimeout(80);continue;}
   if(!s.kits.find(k=>k.name==='pickup-patch').visible)break;
   const {pose,yaw}=s,a=Math.atan2(pose[0]-dest.p[0],pose[2]-dest.p[2])-yaw;
   const e=Math.atan2(Math.sin(a),Math.cos(a)),cmd=[];
   if(Math.hypot(pose[0]-dest.p[0],pose[2]-dest.p[2])>1.1){
    if(Math.abs(e)>.05)cmd.push(e>0?'a':'d');if(Math.abs(e)<.24)cmd.push('w');}
   if(!s.focus||Date.now()-lastReset>2000){await hold([]);await page.bringToFront();lastReset=Date.now();}
   await hold(cmd);await page.waitForTimeout(55);
  }}finally{await hold([]);}
  const finish=await sample();assert(!finish.kits.find(s=>s.name==='pickup-patch').visible,'expected physical repair pickup');
  await capture('repair',{start,finish});
 }
 assert.equal(errors.length,0);status='complete';await receipt();
}catch(e){status='failed';events.push({event:'failure',message:e.message});await receipt();throw e;}
finally{await browser.close();}
