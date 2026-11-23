// Read actual mounted units from a browser-only campaign. First frame is the
// untouched chase camera; the next two are clearly marked inspection cameras.
// No synthetic poses, kills, locations or simulated wall-clock are used.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const port=Number(process.argv[2]),out=resolve(process.argv[3]??'tmp/production-qa/foot-patrol');
assert(Number.isInteger(port)&&port>1024&&port<65536);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal','--no-first-run']});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
  await page.waitForFunction(()=>{
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    if(window.__TAURI_INTERNALS__)throw Error('Requires a browser-only game.');
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
      for(let h=f.memoizedState;h;h=h.next){
        const t=h.memoizedState?.current;
        if(t?.name==='player-tank'&&t.__r3f?.root.getState().scene.getObjectByName('field-hostile-chevron')){
          window.footRoot=t.__r3f.root;return true;
        }
      }
    return false;
  },null,{timeout:120000});
  const sample=()=>page.evaluate(()=>{
    const {camera,scene,clock}=window.footRoot.getState(),v=camera.position.clone();
    const actors=[];
    scene.traverse(o=>{
      if(!o.isSprite||!['field-ally-dash','field-hostile-chevron'].includes(o.name)||!o.parent.visible)return;
      const p=o.parent.getWorldPosition(v).toArray();
      const u=o.getWorldPosition(v).project(camera).toArray();
      actors.push({id:o.parent.name,team:o.name,p,insignia:o.visible,inFrame:u.every(n=>Math.abs(n)<1),ndc:u.slice(0,2)});
    });
    return {t:clock.elapsedTime,actors};
  });
  const initial=await sample();
  await page.waitForFunction(t=>window.footRoot.getState().clock.elapsedTime>t+5,initial.t,{timeout:90000});
  await page.screenshot({path:out+'/01-chase.jpg',quality:88});
  const chase=await sample(),selection={};
  for(const [name,file] of [['field-hostile-chevron','02-hostile'],['field-ally-dash','03-friendly']]){
    selection[name]=await page.evaluate(name=>{
      const {scene,camera}=window.footRoot.getState(),v=camera.position.clone(),target=v.clone();
      const choices=[];
      scene.traverse(o=>{if(o.name===name&&o.parent.visible)choices.push(o);});
      choices.sort((a,b)=>Number(b.visible)-Number(a.visible)||
        a.getWorldPosition(v).distanceTo(camera.position)-b.getWorldPosition(v).distanceTo(camera.position));
      const actor=choices[0].parent;
      window.footOriginalLook??=camera.lookAt;
      camera.lookAt=function(){
        actor.getWorldPosition(target);target.y+=.48;
        this.position.set(target.x+2.9,target.y+1.45,target.z-5.9);
        return window.footOriginalLook.call(this,target);
      };
      return actor.name;
    },name);
    const start=(await sample()).t;
    await page.waitForFunction(t=>window.footRoot.getState().clock.elapsedTime>t+1.1,start,{timeout:50000});
    await page.screenshot({path:out+'/'+file+'-inspection.jpg',quality:90});
  }
  const last=await sample(),moved={};
  for(const a of last.actors){
    const p=initial.actors.find(o=>o.id===a.id)?.p;if(!p)continue;
    moved[a.id]=Number(Math.hypot(a.p[0]-p[0],a.p[2]-p[2]).toFixed(2));
  }
  const bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name)
    .find(u=>/\/assets\/GameSession-[^/]+\.js/.test(u))??'Vite dev');
  const report={port,bundle,selection,errors,initial,chase,last,moved};
  await writeFile(out+'/receipt.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({bundle,selection,errors,moved,chaseVisible:chase.actors.filter(a=>a.inFrame&&a.insignia).map(a=>a.id)},null,2));
  assert.deepEqual(errors,[]);assert.ok(initial.actors.length>=8);
  for(const team of ['field-ally-dash','field-hostile-chevron'])
    assert.ok(last.actors.some(a=>a.team===team&&moved[a.id]>1),'No substantial live movement for '+team);
}finally{await browser.close();}
