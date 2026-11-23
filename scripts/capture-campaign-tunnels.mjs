// A production, no-query, ordinary-player capture. Nothing writes game state.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {observeField} from './campaign-journey-qa.mjs';
const port=Number(process.argv[2]);assert(Number.isInteger(port)&&port>1023&&port<65536&&port!==1420);
const origin='http://127.0.0.1:'+port,folder=resolve('tmp/visual-review');
await mkdir(folder,{recursive:true});const out=await mkdtemp(join(folder,'campaign-tunnel-'));console.log(out);
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',route=>{const u=new URL(route.request().url());
    return u.origin===origin||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
  await page.goto(origin+'/');await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
  await page.locator('.campaign-brief').waitFor({timeout:85000});
  const detail=process.argv.includes('--inspection');
  if(detail)await page.waitForFunction(()=>{
    const radar=document.querySelector('canvas[data-game-ui]');if(!radar)return false;
    for(let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
      for(let h=f.memoizedState;h;h=h.next){
        const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
        const store=t.__r3f.root,{scene,camera,internal,raycaster}=store.getState(),aim=t.position.clone(),look=camera.lookAt,
          ray=new raycaster.constructor(),eye=t.position.clone(),direction=t.position.clone(),probe=t.position.clone();let chosen=null;
        const mat=()=>scene.getObjectByName('signal-tunnel-warning')??scene.getObjectByName('spent-signal-hatch');
        // A fixed offset can put the lens INSIDE an intact file hut. Probe
        // the true transformed hut triangles at the lid and all four corners
        // and choose a clear angle (prefer to see under the rear hinge).
        function place(o){
          if(chosen)return;
          const huts=[];scene.traverseVisible(n=>{if(n.isMesh&&n.geometry?.getAttribute('ghostPlank'))huts.push(n);});
          if(!huts.length)throw Error('No physical file structures found for the visibility probe');
          for(const offset of [[-.94,2.94,2.54],[-1.85,2.82,1.88],[.88,3.00,2.56],[-2.27,3.32,.62],
            [1.95,3.02,1.51],[-.66,3.65,-1.37],[.21,3.68,.46],[.01,4.96,.05]]){
            eye.copy(o.position);eye.x+=offset[0];eye.y+=offset[1];eye.z+=offset[2];let blocked=false;
            for(const [dx,dz] of [[0,0],[-.83,-.64],[.83,-.64],[-.83,.64],[.83,.64]]){
              probe.copy(o.position);probe.x+=dx;probe.y+=.30;probe.z+=dz;
              direction.copy(probe).sub(eye);ray.far=direction.length();ray.set(eye,direction.normalize());
              if(ray.intersectObjects(huts,false).length){blocked=true;break;}
              // Front-sided wall panels do not report a ray leaving the hut.
              // The reverse segment catches lenses starting inside a room.
              ray.set(probe,direction.negate());if(ray.intersectObjects(huts,false).length){blocked=true;break;}
            }
            if(!blocked){chosen=[...offset];window.__hatchLens={offset:chosen,clearBidirectionalHutSegments:5,hutBatches:huts.length};return;}
          }
          throw Error('No unobstructed inspection lens above the actual hatch');
        }
        // Only the inspection lens moves and only while this actual hatch exists.
        camera.lookAt=function(...args){const o=mat();if(!o)return look.apply(this,args);
          place(o);camera.position.copy(o.position);camera.position.x+=chosen[0];camera.position.y+=chosen[1];camera.position.z+=chosen[2];
          aim.copy(o.position);aim.y+=.50;look.call(this,aim);camera.updateMatrixWorld();};
        window.__hatchDetails={};
        internal.subscribe({current:({gl})=>{const o=mat(),hinge=o?.getObjectByName('bamboo-hatch-hinge');if(!hinge)return;
          const beta=-hinge.rotation.x;
          const key=beta<.16?'closed':beta>.64&&beta<.94?'lifting':o.name==='spent-signal-hatch'?'open':null;
          if(key&&!window.__hatchDetails[key])window.__hatchDetails[key]={angle:beta,world:o.position.toArray(),
            png:gl.domElement.toDataURL('image/png').split(',')[1]};
        }},1.9,store);return true;
      }
    return false;
  },null,{timeout:30000});
  const observe=()=>page.evaluate(observeField);
  const end=Date.now()+100000;let warning,arrival,lastShot=0,cannon=false;
  while(Date.now()<end){
    const s=await observe();
    if(!s){await sleep(120);continue;}
    if(!warning&&s.tunnel&&s.brief.includes('TUNNEL OPENING')){
      assert(!s.radio&&!s.unlocked);warning=s;
      await page.screenshot({path:join(out,'01-warning.png')});console.log('captured warning',JSON.stringify(s.tunnel));
    }else if(warning&&s.spent&&s.enemies.some(e=>e.id.startsWith('tunnel-'))){
      arrival=s;await sleep(780);await page.screenshot({path:join(out,'02-arrival.png')});break;
    }else if(!warning&&s.enemies.length>9&&Date.now()-lastShot>(cannon?1800:1000)){
      const t=s.enemies.filter(e=>e.aim.ok).sort((a,b)=>a.range-b.range)[0];
      if(t){
        if(!lastShot)await page.locator('.weapon-selector button').filter({hasText:'Napalm'}).click();
        else if(!cannon){await page.locator('.weapon-selector button').filter({hasText:'Cannon'}).click();cannon=true;}
        await page.mouse.click(t.aim.x,t.aim.y);lastShot=Date.now();
      }
    }
    await sleep(100);
  }
  assert.deepEqual(errors,[]);assert(warning&&arrival,'No warning / arrival during normal play');
  const newcomers=arrival.enemies.filter(e=>e.id.startsWith('tunnel-'));
  assert(newcomers.length>=4);assert(Math.hypot(warning.tunnel.x-arrival.spent.x,warning.tunnel.z-arrival.spent.z)<.01);
  assert(newcomers.every(e=>Math.hypot(e.x-arrival.spent.x,e.z-arrival.spent.z)<5));
  const bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\/GameSession-[\w-]+\.js$/.test(n)));
  if(detail){
    const stages=await page.evaluate(()=>window.__hatchDetails);
    for(const key of ['closed','lifting','open']){
      assert.ok(stages[key]?.png,'Missing photographed stage '+key);
      await writeFile(join(out,'inspection-'+key+'.png'),Buffer.from(stages[key].png,'base64'));delete stages[key].png;
    }
    await writeFile(join(out,'inspection-angles.json'),JSON.stringify({...stages,lens:await page.evaluate(()=>window.__hatchLens)},null,2));
  }
  assert(bundle);await writeFile(join(out,'evidence.json'),JSON.stringify({bundle,warning,arrival,errors},null,2));
  console.log('PASS',warning.brief,'Six-slot hatch at',arrival.spent.x,arrival.spent.z,'actual visible arrivals:',newcomers.length);
}finally{await browser.close();}
