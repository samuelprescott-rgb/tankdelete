// Production browser-only photo mode. A local fixture advances real virtual enemy
// hit callbacks during the first three waves; boss spawn/rendering is not mocked.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {photoSundae} from './ghost-sundae-photo.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const [version,port,cdp='9462']=process.argv.slice(2);
assert(['before','after'].includes(version)&&/^\d+$/.test(port)&&/^\d+$/.test(cdp));
const out=new URL('../tmp/production-qa/ghost-phase2-actors/'+version+'/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+cdp);
const ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await ctx.newPage(),log={origin:'http://127.0.0.1:'+port,shots:[],errors:[]};
page.on('pageerror',e=>log.errors.push(String(e)));
async function enter(slice) {
 await page.goto(log.origin+'/?ghostSignal='+slice);
 await page.getByRole('button',{name:slice==='river'?/^River crossing/i:/^Embassy approach/i}).click();
 await page.waitForFunction(()=>{
   if('__TAURI_INTERNALS__' in window)throw Error('Requires browser-only practice');
   const r=document.querySelector('canvas[data-game-ui]');if(!r)return false;
   for(let f=r[Object.keys(r).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
     if(h.memoizedState?.current?.name==='player-tank'){window.__photoStore=h.memoizedState.current.__r3f.root;return true;}
   }
 },null,{timeout:120000});
}
async function shot(actor,file,eye,look) {
 await page.waitForFunction(name=>window.__photoStore.getState().scene.getObjectByName(name)?.visible,actor,{timeout:60000});
 const info=await page.evaluate(({actor,eye,look})=>{
   const store=window.__photoStore,{scene,camera,internal,gl}=store.getState(),o=scene.getObjectByName(actor);
   const pos=camera.position.clone(),q=camera.quaternion.clone(),v=pos.clone(),t=pos.clone();
   window.__actorCameraTicks=0;
   const apply=()=>{o.updateWorldMatrix(true,false);v.fromArray(eye).applyMatrix4(o.matrixWorld);t.fromArray(look).applyMatrix4(o.matrixWorld);camera.position.copy(v);camera.lookAt(t);camera.updateMatrixWorld();window.__actorCameraTicks++;};
   const oldRender=gl.render;
   gl.render=function(s,c,...args){if(s===scene&&c===camera)apply();return oldRender.call(this,s,c,...args);};
   const end=internal.subscribe({current:apply},.5,store);apply();window.__photoStop=()=>{end();gl.render=oldRender;camera.position.copy(pos);camera.quaternion.copy(q);};
   return {actor,eye,look,matrix:o.matrixWorld.toArray(),bundle:performance.getEntriesByType('resource').map(e=>e.name).find(u=>/\/GameSession-[\w-]+\.js/.test(u)),
    versionMarker:o.getObjectByName('ghost-actor-pixels')?.name??null};
 },{actor,eye,look});
 await page.waitForFunction(()=>window.__actorCameraTicks>=5,null,{timeout:60000});
 // Capture rendered canvas pixels after the normal post-processing chain; no HUD
 // DOM, replacement scene, compositing, art mockup or hand modification.
 const style=await page.addStyleTag({content:'.game-ui,.hud,.header,.training-badge,.nightmare-order, [data-game-ui], .crosshair {visibility:hidden!important}'});
 await page.screenshot({path:out+file+'.png',timeout:60000});
 await style.evaluate(el=>el.remove());await page.evaluate(()=>window.__photoStop());log.shots.push({...info,file}); console.log(file);
}
try{
 if(!['boss','sundae'].includes(process.env.GHOST_ACTOR_ONLY)){
  await enter('river');await page.waitForTimeout(4500);await shot('us-rto-4','us',[1.02,1.65,-1.40],[0,1.12,0]);
  await shot('enemy-infantry-review','vc',[.96,1.48,-1.42],[0,.93,0]);
 }
 if(process.env.GHOST_ACTOR_ONLY!=='infantry'){
 await enter('embassy');
 await page.waitForFunction(()=>{
   const panel=document.querySelector('.nightmare-order'),wave=Number(panel?.innerText.match(/wave\s+(\d+)\s*\//i)?.[1]);
   const boss=window.__photoStore.getState().scene.getObjectByName('nightmare-boss-sculpt');
   if(boss?.visible)return true;
   if(![1,2,3].includes(wave)||!panel.classList.contains('is-combat'))return false;
   const container=document.querySelector('.scene-container'),key=Object.keys(container).find(k=>k.startsWith('__reactProps$'));
   function walk(el){if(!el)return;if(Array.isArray(el)){for(const item of el){const hit=walk(item);if(hit)return hit;}return;}
     const p=el.props;if(p?.onZombieHit&&p.zombiePosesRef&&p.friendlies&&p.zombies)return p;return walk(p?.children);}
   const p=walk(container[key]?.children);if(!p)return false;
   for(const z of p.zombies){const pose=p.zombiePosesRef.current.get(z.id);if(!z.alive||z.wave!==wave||!pose?.active||z.archetype!=='standard')continue;
     p.onZombieHit({soldierId:'qa-virtual-ally',zombieId:z.id,position:pose.position.clone(),damage:z.health});}
   return false;
 },null,{timeout:360000,polling:300});
 await page.waitForFunction(()=>{
  const o=window.__photoStore.getState().scene.getObjectByName('nightmare-boss-sculpt');
  return o?.visible&&Math.hypot(...o.matrixWorld.toArray().slice(4,7))>4.6;
 },null,{timeout:60000});
 if(process.env.GHOST_ACTOR_ONLY==='sundae')log.shots.push(await photoSundae(page,version));
 else{
   await shot('nightmare-boss-sculpt','boss',[1.68,1.37,-2.76],[0,.90,0]);
   await shot('nightmare-boss-sculpt','boss-rear',[-1.68,1.37,2.76],[0,.90,0]);
 }
 }
 if(log.errors.length)throw Error(JSON.stringify(log.errors));
}finally{await writeFile(out+'report-'+(process.env.GHOST_ACTOR_ONLY||'all')+'.json',JSON.stringify(log,null,2));await ctx.close();await browser.close();}
