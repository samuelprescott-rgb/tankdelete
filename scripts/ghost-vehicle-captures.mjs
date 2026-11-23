// Inspect mounted production meshes. Only the camera is overridden; world lights, renderer,
// poses, motion, draw distance, authored materials and atmospheric effects remain in-game.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium }=createRequire(import.meta.url)('playwright');
const [port,cdp,dir]=process.argv.slice(2);
assert.ok([port,cdp].every(v=>/^\d{4,5}$/.test(v)) && dir);
const out=resolve(dir);await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+cdp);
const ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await ctx.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|WebGLProgram.*ERROR/i.test(m.text()))errors.push(m.text());});
try{
 await page.goto('http://127.0.0.1:'+port+'/?ghostSignal=river');
 await page.getByRole('button',{name:/^River crossing/i}).click();
 await page.waitForFunction(()=>{
  const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
  for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
   for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.name==='player-tank'){
    const t=h.memoizedState.current,s=t.__r3f.root.getState();
    if(!s.scene.getObjectByName('huey-wreck-airframe'))return false;
    window.__vehicleCamera={tank:t,state:s,store:t.__r3f.root};return true;
   }
  return false;
 },{},{timeout:75000});
 await page.addStyleTag({content:'body *:not(:has(canvas)):not(canvas){visibility:hidden!important} canvas[data-game-ui]{visibility:hidden!important}'});
 // Let the spawn camera cut and the opening material compilation finish first.
 await page.waitForTimeout(2100);
 const views=[
 ['tank-bow','player-tank',[1.6,1.72,-2.8],[0,.74,-.15]],
 ['tank-nose-paint','player-tank',[.21,.72,-2.14],[0,.30,-1.24]],
 ['tank-turret','tank-turret',[1.40,.45,-.36],[0,.14,0]],
 ['tank-flank','player-tank',[2.55,1.82,2.25],[0,.68,0]],
 ['huey-wreck','huey-wreck-airframe',[4.15,1.38,-3.00],[0,.18,1.11]],
 ['huey-flight','huey-flying-airframe',[4.20,.85,-3.10],[0,.08,1.2]],
 ['huey-door','huey-flying-airframe',[3.23,.17,-.24],[0,.14,.10]]
 ];
 const report={origin:port,errors,views:[],bundles:await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname).filter(p=>/assets\/(index|GameSession)-.*\.js$/.test(p)))};
 assert.ok(report.bundles.some(p=>p.includes('GameSession-')));
 for(const [name,target,e,a] of views){
  const info=await page.evaluate(({target,e,a})=>{
   const {state:s,store}=window.__vehicleCamera, {camera,scene}=s;
   const subject=scene.getObjectByName(target);if(!subject)return null;
   const pos=camera.position.clone(),eye=pos.clone(),aim=pos.clone(),q=camera.quaternion.clone();
   const shot=()=>{subject.updateWorldMatrix(true,false);eye.fromArray(e).applyMatrix4(subject.matrixWorld);aim.fromArray(a).applyMatrix4(subject.matrixWorld);
    camera.position.copy(eye);camera.lookAt(aim);camera.updateMatrixWorld();};
   const end=s.internal.subscribe({current:shot},0,store);shot();window.__restoreVehicle=()=>{end();camera.position.copy(pos);camera.quaternion.copy(q);camera.updateMatrixWorld()};
   return {subject:subject.name,pixelBuffer:[s.gl.domElement.width,s.gl.domElement.height],eyeLocal:e,aimLocal:a,materials:subject.children.flatMap(m=>m.material?[m.material.name||m.material.type]:[])};
  },{target,e,a});assert.ok(info,target);
  await page.waitForTimeout(420);await page.screenshot({path:out+'/'+name+'.png',timeout:60000});
  await page.evaluate(()=>window.__restoreVehicle());report.views.push(info);
 }
 await writeFile(out+'/capture.json',JSON.stringify(report,null,2));assert.equal(errors.length,0,errors.join('\n'));
 console.log(out);
}finally{await ctx.close();await browser.close();}
