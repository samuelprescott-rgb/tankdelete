// Production-browser acceptance. Real player inputs only; observes mounted geometry.
// NODE_PATH=/path/to/playwright/node_modules node scripts/check-player-field-buildings.mjs PORT
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const port=Number(process.argv[2]);assert.ok(port>1023&&port<65536&&port!==1420&&Number.isInteger(port));
const aimAt=process.argv[3]??'roof';assert.ok(['ground','body','roof'].includes(aimAt));
const origin='http://127.0.0.1:'+port;
const {chromium}=createRequire(import.meta.url)('playwright');
const base=resolve('tmp/player-field-acceptance');await mkdir(base,{recursive:true});const out=await mkdtemp(join(base,'run-'));
console.log(out);
const report={origin,errors:[],events:[],verified:false};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===origin||['blob:','data:'].includes(u.protocol)?r.continue():r.abort();});
const event=(name,value)=>{report.events.push({name,value});console.log(name,JSON.stringify(value));};
const shot=label=>page.screenshot({path:join(out,label+'.png'),timeout:35000});
const award=()=>page.evaluate(()=>localStorage.getItem('tankdelete.virtual-defense.v1'));
const state=(roofFile=null)=>page.evaluate((roofFile)=>{
 const world=document.querySelector('canvas[data-engine]'),radar=document.querySelector('canvas[data-game-ui]');if(!world||!radar)return null;
 let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];while(f?.return)f=f.return;
 const find=(f)=>{if(!f)return null;if(f.stateNode===radar)return f;for(let c=f.child;c;c=c.sibling){const v=find(c);if(v)return v;}return null;};
 let tank,files;for(f=find(f?.stateNode?.current);f;f=f.return){
  if(f.memoizedProps?.tankStateRef&&f.memoizedProps?.fileBlocks)files??=f.memoizedProps.fileBlocks;
  for(let h=f.memoizedState;h;h=h.next){const o=h.memoizedState?.current;if(o?.isGroup&&o.name==='player-tank')tank??=o;}
 }
 if(!tank||!files)return null;
 const {camera,scene}=tank.__r3f.root.getState(),r=world.getBoundingClientRect(),vec=tank.position.clone();
 const land=scene.getObjectByName('far-bank-fishing-landing')??scene.getObjectByName('far-bank-landing-ruins');
 const radio=scene.getObjectByName('rear-radio-intact-walls');if(!land||!radio)return null;
 const web=(x,y,z)=>{vec.set(x,y,z).project(camera);const px=r.x+(vec.x+1)*r.width/2,py=r.y+(1-vec.y)*r.height/2;return {x:px,y:py,visible:Math.abs(vec.z)<1&&document.elementFromPoint(px,py)===world};};
 const pos=land.geometry.attributes.position,min=[Infinity,Infinity,Infinity],max=min.map(n=>-n);
 for(let i=0;i<pos.count;i++){vec.fromBufferAttribute(pos,i).applyMatrix4(land.matrixWorld);[vec.x,vec.y,vec.z].forEach((n,j)=>{min[j]=Math.min(min[j],n);max[j]=Math.max(max[j],n);});}
 const x=(min[0]+max[0])/2,z=(min[2]+max[2])/2;
 const names=[],huts=[];let fileRoof=null;scene.traverse(n=>{if(n.name&&/(hut|roof|shack|shelter|house|building|bunker|landing)/i.test(n.name))names.push({name:n.name,visible:n.visible});
  if(n.visible&&n.userData?.ghostHutSkin)for(const {index,block:b} of n.userData.ghostHutSkin.entries){
   huts.push({name:b.name,path:b.path,at:b.position,instance:index,batchSize:n.count});if(!roofFile||b.name!==roofFile)continue;
   const l=[Infinity,Infinity,Infinity],h=l.map(v=>-v),m=n.matrixWorld.clone(),p=n.geometry.attributes.position;n.getMatrixAt(index,m);
   for(let i=0;i<p.count;i++){vec.fromBufferAttribute(p,i).applyMatrix4(m).applyMatrix4(n.matrixWorld);
    [vec.x,vec.y,vec.z].forEach((v,j)=>{l[j]=Math.min(l[j],v);h[j]=Math.max(h[j],v);});}
   fileRoof={name:b.name,point:web((l[0]+h[0])/2,l[1]+(h[1]-l[1])*.80,(l[2]+h[2])/2)};
  }});
 return {player:[tank.position.x,tank.position.z,tank.rotation.y],land:{name:land.name,pos:[x,z],bounds:{min,max},aim:web(x,0,z),body:web(x,2.16,z),roof:web(x,3.25,z),vertices:pos.count},radio:radio.visible,structureNames:names,huts,
 fileRoof,files:files.map(b=>({position:b.position,armed:!!b.isMarked})),brief:document.querySelector('.campaign-brief')?.textContent};
},roofFile);
try{
 await page.goto(origin+'/');const start=page.getByRole('button',{name:'Start Campaign',exact:true});await start.waitFor({timeout:30000});
 assert.equal(await page.evaluate(()=>('__TAURI_INTERNALS__' in window)||location.search!==''),false);
 const replay=page.getByRole('button',{name:'Launch Horde Mode'});assert.equal(await replay.count(),0);assert.equal(await award(),null);
 const secret=page.getByRole('button',{name:'Tune hidden Horde channel'});const box=await secret.boundingBox();
 assert.ok(box&&box.x+box.width>=1900&&box.y+box.height>=1060);
 const click=async(x,y)=>page.mouse.click(x,y);
 await shot('01-fresh-menu');await click(box.x+box.width/2,box.y+box.height/2);
 await page.locator('.nightmare-order.is-combat').waitFor({timeout:95000});
 const wave=await page.locator('.nightmare-order.is-combat').innerText();assert.match(wave,/wave\s*0?1/i);
 event('secret',{box,wave,awarded:await award(),archives:await page.locator('.embassy-file-health span').allTextContents()});assert.equal(await award(),null);await shot('02-secret-wave-one');
 await page.locator('button[data-session-exit]').click();await start.waitFor({timeout:15000});await page.reload();await start.waitFor();
 assert.equal(await award(),null);assert.equal(await replay.count(),0);event('post-secret-reload',{awarded:null,normalReplay:false});
 await start.click();await page.locator('.campaign-brief').waitFor({timeout:80000});
 let s;for(let i=0;i<180&&!s;i++){s=await state();if(!s)await delay(250);}assert.ok(s,'Campaign did not mount');event('field-at-spawn',s);
 const floor=s.land.bounds.max[1];assert.ok(floor>4&&s.radio&&s.files.length>=1);
 await page.getByRole('button',{name:'Field files',exact:true}).click();const manifest=await page.locator('.virtual-drive li span').allTextContents();
 await page.getByRole('button',{name:'Close field files'}).click();event('hut-inventory',{manifest,renderedHuts:s.huts.map(h=>h.name)});
 assert.deepEqual(s.huts.map(h=>h.name).sort(),[...manifest].sort(),'Not every manifested file has exactly one rendered hut damage surface');
 assert.deepEqual(s.huts.map(h=>JSON.stringify(h.at)).sort(),s.files.map(f=>JSON.stringify(f.position)).sort());
 // Drive straight up the center of the real bridge. From here the shelter fills the sight.
 const driveDeadline=Date.now()+70000;
 do{const dz=14.7-s.player[1];if(Math.abs(dz)<.95)break;const direction=dz>0?'w':'s';
  await page.keyboard.down(direction);try{await delay(Math.min(850,Math.max(90,(Math.abs(dz)-.3)*95)));}finally{await page.keyboard.up(direction);}
  await delay(320);s=await state();
 }while(Date.now()<driveDeadline);
 await delay(650);s=await state();event('bridge-position',s);assert.ok(s.player[1]>12&&s.land.aim.visible,'Drive or target sight failed');
 const target=s=>aimAt==='ground'?s.land.aim:s.land[aimAt];event('aim-selection',{aimAt,target:target(s)});await page.mouse.move(target(s).x,target(s).y);await delay(1400);await shot('03-fishing-shelter-intact');
 let fired=0;while(s.land.name==='far-bank-fishing-landing'&&fired<4){
   await page.locator('[aria-label="Cannon ready"]').waitFor({state:'attached',timeout:6000});
   await page.mouse.move(target(s).x,target(s).y);await delay(300);await click(target(s).x,target(s).y);fired++;
   await page.locator('[aria-label^="Cannon reload "]').waitFor({state:'attached',timeout:1800});
   await delay(1550);s=await state();event('cannon-'+fired,{name:s.land.name,player:s.player,fired:true,crosshair:target(s)});
   assert.ok(!s.files.some(b=>b.armed),'A cannon shot aimed at the shelter falsely armed a file hut');
 }
 assert.equal(s.land.name,'far-bank-landing-ruins','Shelter failed to collapse from the centered cannon shots');assert.ok(s.land.bounds.max[1]<floor/3);
 await delay(900);await shot('04-fishing-shelter-ruins');event('after-destruction',await state());
 if(process.argv.includes('--also-village')){
  const name='sector-map-copy.png',before=await state(name);assert.ok(before.fileRoof?.point.visible,'Background hut roof must be in view from bridge');
  for(let i=0;i<2;i++){const f=(await state(name)).fileRoof?.point;assert.ok(f?.visible);
   await page.locator('[aria-label="Cannon ready"]').waitFor({state:'attached'});await page.mouse.move(f.x,f.y);await delay(1250);
   if(!i)await shot('05-village-roof-intact');await click(f.x,f.y);
   await page.locator('[aria-label^="Cannon reload "]').waitFor({state:'attached',timeout:1800});await delay(1800);
   const hit=await state(),arms=hit.files.filter(b=>b.armed).map(b=>hit.huts.find(h=>h.at.every((v,j)=>v===b.position[j]))?.name);
   event('village-roof-'+(i+1),{name,aim:f,armed:arms,remaining:hit.huts.map(h=>h.name)});
   assert.deepEqual(arms,i===0?[name]:[],'Cannon hit marked the wrong file or failed to hit the visible roof');}
  await shot('06-village-roof-after');assert.equal((await state(name)).fileRoof,null,'Two roof hits left the targeted fictional file in the field.');
  await page.getByRole('button',{name:'Field files',exact:true}).click();const after=await page.locator('.virtual-drive li span').allTextContents();
  assert.deepEqual(after.sort(),manifest.filter(n=>n!==name).sort(),'Destroyed hut and file list disagreed');
 }
 assert.equal(await award(),null);assert.deepEqual(report.errors,[]);report.verified=true;
}catch(e){report.failure=e.stack;report.ui=await page.locator('body').innerText({timeout:3500}).catch(()=>null);await shot('incomplete').catch(()=>{});console.error(e);process.exitCode=1;}
finally{report.bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\/GameSession-[\w-]+\.js$/.test(n))).catch(()=>null);
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
