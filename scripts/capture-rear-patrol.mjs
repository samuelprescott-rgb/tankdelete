// Real campaign plus trusted driver input. A named fixed inspection camera is
// used for the first patrol pair; the chase pictures keep the player camera.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
const port=Number(process.argv[2]);assert.ok(port>1024&&port!==1420&&port<=65535);
const origin='http://127.0.0.1:'+port,root=resolve('tmp/visual-review');await mkdir(root,{recursive:true});
const out=await mkdtemp(join(root,'rear-guard-'));console.log(out);
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const report={errors:[],observations:[],verified:false};
page.on('pageerror',e=>report.errors.push(e.message));
await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
const state=()=>page.evaluate(()=>window.patrolQA.read());
const capture=async label=>{const s=await state();await page.screenshot({path:join(out,label+'.png')});report.observations.push({label,...s});};
const held=new Set();
async function hold(...ks){for(const k of [...held])if(!ks.includes(k)){await page.keyboard.up(k);held.delete(k);}
  for(const k of ks)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}}
async function drive(x,z,face=false){
  const limit=Date.now()+45000;
  while(Date.now()<limit){
    const {px,pz,yaw}=await state(),dx=px-x,dz=pz-z,a=Math.atan2(dx,dz)-yaw,err=Math.atan2(Math.sin(a),Math.cos(a));
    if(!face&&Math.hypot(dx,dz)<1.4||face&&Math.abs(err)<.10){await hold();return;}
    const ks=[];if(Math.abs(err)>.05)ks.push(err>0?'a':'d');if(!face&&Math.abs(err)<.23)ks.push('w');
    await hold(...ks);await sleep(35);
  }throw Error('Stalled at '+JSON.stringify(await state()));
}
try{
  await page.goto(origin);await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Unexpected native bridge');
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const tank=h.memoizedState?.current;if(tank?.name!=='player-tank')continue;
      const {scene,camera,gl,internal}=tank.__r3f.root.getState(),obj=n=>scene.getObjectByName(n),body=obj('rear-field-armored-guard');
      if(!body||!obj('rear-radio-collapsed-walls'))continue;
      const point=tank.position.clone(),read=()=>{const r=gl.domElement.getBoundingClientRect(),q=point.set(-32,0,48).project(camera);
        return {px:tank.position.x,pz:tank.position.z,yaw:tank.rotation.y,gx:body.position.x,gz:body.position.z,gyaw:body.rotation.y,
          shot:obj('rear-guard-signal-pulse').visible,mark:obj('rear-guard-warning-mark').visible,
          rubble:obj('rear-radio-collapsed-walls').visible,radioVisible:obj('rear-field-radio-lamp').visible,
          aim:[r.x+(q.x+1)*r.width/2,r.y+(1-q.y)*r.height/2],hp:document.querySelector('.armor-status strong')?.textContent};};
      const qa=window.patrolQA={read,inspect:true,armed:false,inFlight:null};
      internal.subscribe({current:()=>{if(qa.inspect){
        camera.position.set(-25,4.0,28.9);camera.lookAt(-34,.91,39.3);camera.updateMatrixWorld();
      }}},.51,tank.__r3f.root);
      internal.subscribe({current:()=>{if(qa.armed&&!qa.inFlight&&obj('rear-guard-signal-pulse').visible){
        const b=point.copy(body.position).setY(.8).project(camera);
        if(Math.abs(b.x)<.64&&Math.abs(b.y)<.75){
          qa.inFlight={image:gl.domElement.toDataURL('image/png').split(',')[1],state:read()};qa.armed=false;}}}},2,tank.__r3f.root);
      return true;
    }return false;
  },null,{timeout:100000});
  report.bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(x=>/\/assets\/GameSession-.*\.js$/.test(x)));
  assert.ok(report.bundle);await sleep(700);await capture('01-patrol-fixed-camera');
  const first=report.observations[0];
  await page.waitForFunction(([x,z])=>{const p=window.patrolQA.read();return Math.hypot(p.gx-x,p.gz-z)>4;},[first.gx,first.gz],{timeout:12000});
  await capture('02-patrol-fixed-camera');await page.evaluate(()=>window.patrolQA.inspect=false);
  await drive(0,27);await drive(-27.5,30);
  let g=await state();await drive(g.gx,g.gz,true);
  await page.evaluate(()=>window.patrolQA.armed=true);
  await page.waitForFunction(()=>!!window.patrolQA.inFlight,null,{timeout:18000}); 
  const fire=await page.evaluate(()=>window.patrolQA.inFlight);
  await writeFile(join(out,'03-arcade-return-fire-chase.png'),Buffer.from(fire.image,'base64'));
  report.observations.push({label:'03-arcade-return-fire-chase',...fire.state});await capture('04-rear-fight-with-hud');
  await drive(-32,48,true);const cannon=page.locator('.weapon-selector button').filter({hasText:'Cannon'});await cannon.click();
  for(let i=0;i<6;i++){const s=await state();if(s.rubble)break;await page.mouse.click(...s.aim);await sleep(1200);}
  g=await state();assert.ok(g.rubble&&g.radioVisible,'Rear station was not breached through player input: '+JSON.stringify(g));
  await capture('05-collapsed-hut-with-radio');assert.deepEqual(report.errors,[]);report.verified=true;
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;await page.screenshot({path:join(out,'incomplete.png')}).catch(()=>{});}
finally{await hold();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
