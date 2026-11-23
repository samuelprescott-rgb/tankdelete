// An ordinary two-shot campaign interaction on ONE surfaced file hut. No
// native bridge, file access, camera edits, teleports, simulated time or hit hooks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {observeField} from './campaign-journey-qa.mjs';
const [port,bundle,folder]=process.argv.slice(2),origin='http://127.0.0.1:'+port;
assert(/^\d{4}$/.test(port)&&Number(port)>1024&&/^GameSession-[\w-]+\.js$/.test(bundle)&&folder);
const out=resolve(folder);await mkdir(out,{recursive:true});
const report={origin,bundle,mode:'simulated campaign',viewport:[1920,1080],shots:[],states:{},errors:[]};
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal','--no-first-run']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const world=()=>page.evaluate(observeField,true);
const screen=label=>page.screenshot({path:join(out,label+'.jpg'),quality:90});
// Capture the real game buffer in the same frame as the shader transition.
// A browser screenshot requested after the trip back to Node can miss it.
async function captureSurface(phase,label){
 const data=await page.evaluate(({phase,name})=>new Promise((resolve,reject)=>{
   const canvas=document.querySelector('canvas[data-engine]'),hud=document.querySelector('canvas[data-game-ui]');
   let tank;for(let f=hud[Object.keys(hud).find(k=>k.startsWith('__reactFiber$'))];f&&!tank;f=f.return)
     for(let h=f.memoizedState;h;h=h.next){const o=h.memoizedState?.current;if(o?.isGroup&&o.name==='player-tank'){tank=o;break;}}
   const game=tank.__r3f.root.getState(),start=performance.now();
   function sample(){
     let ready=false;
     game.scene.traverseVisible(mesh=>{
       const entry=mesh.userData.ghostHutSkin?.entries.find(e=>e.block.name===name);
       if(!entry)return;
       const face=mesh.geometry.getAttribute('ghostFace'),scar=mesh.geometry.getAttribute('ghostScar');
       if(face.getW(entry.index)!==phase)return;
       const uniforms=game.gl.properties.get(mesh.material).uniforms;
       const dt=uniforms?.uGhostHutTime?.value-scar.getW(entry.index);
       ready=phase===2 ? dt>.13&&dt<.65 : dt>-.50&&dt<0;
     });
     if(ready)return resolve(canvas.toDataURL('image/jpeg',.94).split(',')[1]);
     if(performance.now()-start>12000)return reject(Error('Missing rendered surface phase '+phase));
     requestAnimationFrame(sample);
   }
   requestAnimationFrame(sample);
 }),{phase,name:report.target.name});
 await writeFile(join(out,label+'.jpg'),Buffer.from(data,'base64'));
}
const readRows=async(label)=>{await page.getByRole('button',{name:'Field files',exact:true}).click();
  const panel=page.getByRole('region',{name:'Field file manifest'});await panel.waitFor();
  assert.match(await panel.innerText(),/SIMULATED FILESYSTEM/i);
  const rows=await panel.locator('li').evaluateAll(items=>items.map(row=>({name:row.querySelector('span').textContent,status:row.querySelector('small').textContent})).sort((a,b)=>a.name.localeCompare(b.name)));
  const trash=Number((await panel.locator('footer span').innerText()).match(/·\s*(\d+)/)[1]);
  if(label)await screen(label);
  await page.getByRole('button',{name:'Close field files'}).click();
  return {rows,trash};};
const locations=s=>s.files.map(f=>f.id).sort(),target=s=>s.files.find(f=>f.sightedFile==='atlas-preview.psd');
// Do not confuse HUD/React removal with destruction on the field. Read the
// matrices actually submitted to the renderer, independently of the manifest.
const rendered=()=>page.evaluate(()=>{
 const hud=document.querySelector('canvas[data-game-ui]');
 let tank;for(let f=hud[Object.keys(hud).find(k=>k.startsWith('__reactFiber$'))];f&&!tank;f=f.return)
   for(let h=f.memoizedState;h;h=h.next){const obj=h.memoizedState?.current;if(obj?.isGroup&&obj.name==='player-tank'){tank=obj;break;}}
 if(!tank)throw Error('Missing mounted tank');const scene=tank.__r3f.root.getState().scene,rows=[];
 scene.traverseVisible(n=>{if(!n.isInstancedMesh||!n.userData?.ghostHutSkin)return;const m=n.matrixWorld.clone();
   for(const {index,block} of n.userData.ghostHutSkin.entries){if(index>=n.count)continue;n.getMatrixAt(index,m);
     if(Math.abs(m.determinant())>1e-7)rows.push(block.name);}});
 return rows.sort((a,b)=>a.localeCompare(b));
});
const waitFor=async(fn,desc,ms=8500)=>{const start=Date.now();let s;
  while(Date.now()-start<ms){s=await world();if(s&&fn(s))return s;await page.waitForTimeout(85);}
  throw Error(desc+'; last state '+JSON.stringify(s));};
try{
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS false|context lost/i.test(m.text()))report.errors.push(m.text());});
 await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
 await page.goto(origin+'/');await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
 await page.waitForFunction(observeField,false,{timeout:90000});
 report.loaded=await page.evaluate(()=>performance.getEntriesByType('resource').find(r=>/\/GameSession-[\w-]+\.js$/.test(r.name))?.name);
 assert.equal(report.loaded,origin+'/assets/'+bundle);
 assert.equal(await page.locator('canvas[data-engine]').evaluate(c=>c.width+'x'+c.height),'1920x1080');
 const initial=await readRows('00-manifest');assert.equal(initial.trash,0);assert(initial.rows.some(r=>r.name==='atlas-preview.psd'));assert(!initial.rows.some(r=>r.status==='Armed'));
 // South road turnout to the east-bank file row, using the normal drivetrain.
 const held=new Set(),hold=async(keys=[])=>{for(const k of [...held])if(!keys.includes(k)){await page.keyboard.up(k);held.delete(k);}
   for(const k of keys)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}};
 const drive=async(x,z)=>{const end=Date.now()+24000;try{while(Date.now()<end){
    const s=await page.evaluate(observeField,false);if(!s)continue;
    if(Math.hypot(x-s.x,z-s.z)<1.25)return;
    const angle=Math.atan2(s.x-x,s.z-z)-s.yaw,err=Math.atan2(Math.sin(angle),Math.cos(angle)),keys=[];
    if(Math.abs(err)>.055)keys.push(err>0?'a':'d');if(Math.abs(err)<.23)keys.push('w');await hold(keys);await page.waitForTimeout(65);
  }throw Error('driver did not reach the village');}finally{await hold();}};
 await drive(-2,9);
 // The normal campaign now approaches from the centered road spawn. Turn
 // the hull toward the east-bank hut, then let the ordinary chase camera settle.
 const turnUntil=Date.now()+9000;
 try{while(Date.now()<turnUntil){
   const s=await page.evaluate(observeField,false);
   const heading=Math.atan2(s.x-6.33,s.z-9.95)-s.yaw;
   const err=Math.atan2(Math.sin(heading),Math.cos(heading));
   if(Math.abs(err)<.055)break;
   await hold([err>0?'a':'d']);await page.waitForTimeout(35);
 }}finally{await hold();}
 await page.waitForTimeout(750);
 const before=await waitFor(s=>!!target(s),'actual visible file roof under cursor');
 const site=target(before).id,field=locations(before);
 const originals=await rendered();assert.deepEqual(originals,initial.rows.map(r=>r.name));
 report.target={name:'atlas-preview.psd',site,range:target(before).range};report.states.before={...initial,rendered:originals,field,driver:[before.x,before.z]};
 const aim=async()=>{let p;for(let i=0;i<5;i++){const s=await world(),f=target(s);assert(f?.aim.ok,'visible roof and clear gameplay canvas required');
   p=f.aim;await page.mouse.move(p.x,p.y);await page.waitForTimeout(i===0?650:130);}return p;};
 const fire=async(n)=>{await page.locator('[aria-label="Cannon ready"]').waitFor({state:'attached',timeout:6500});
   const p=await aim();await screen(n===1?'01-intact':'03-armed-before-confirmation');
   const pin=target(await world()).aim;await page.mouse.click(pin.x,pin.y);
   report.shots.push({number:n,name:'atlas-preview.psd',x:pin.x,y:pin.y});
   await page.locator('[aria-label^="Cannon reload "]').waitFor({state:'attached',timeout:2200});};
 await fire(1);
 const armed=await waitFor(s=>s.files.find(f=>f.id===site)?.marked,'first shot did not arm the chosen roof');
 assert.deepEqual(locations(armed),field);assert.deepEqual(armed.files.filter(f=>f.marked).map(f=>f.id),[site]);
 const first=await readRows('02-first-hit-manifest');assert.deepEqual(first.rows,initial.rows.map(r=>r.name===report.target.name?{...r,status:'Armed'}:r));assert.equal(first.trash,initial.trash);
 const retained=await rendered();assert.deepEqual(retained,originals);
 report.states.first={...first,rendered:retained,field:locations(armed)};await screen('02-first-hit');
 const captureEffects=process.argv.includes('--capture-effects');
 await Promise.all([fire(2),captureEffects&&captureSurface(2,'04-release-surface')]);
 const gone=await waitFor(s=>!s.files.some(f=>f.id===site),'second shot did not remove the chosen hut');
 assert.deepEqual(locations(gone),field.filter(id=>id!==site));assert.equal(gone.files.filter(f=>f.marked).length,0);
 const last=await readRows('04-second-hit-manifest');assert.deepEqual(last.rows,initial.rows.filter(r=>r.name!==report.target.name));assert.equal(last.trash,initial.trash+1);
 const remaining=await rendered();assert.deepEqual(remaining,originals.filter(n=>n!==report.target.name));
 report.states.second={...last,rendered:remaining,field:locations(gone)};await screen('04-second-hit');assert.deepEqual(report.errors,[]);
 await Promise.all([captureEffects&&captureSurface(3,'05-undo-surface'),page.keyboard.press('Meta+z')]);
 const restored=await waitFor(s=>s.files.some(f=>f.id===site),'Undo did not restore the file hut');
 assert.deepEqual(locations(restored),field);
 assert.equal(restored.files.filter(f=>f.marked).length,0);
 await screen('05-undo');
 const back=await readRows();assert.deepEqual(back,initial);
 assert.deepEqual(await rendered(),originals);
 report.states.undo={...back,field:locations(restored)};
 assert.deepEqual(report.errors,[]);
 report.passed=true;console.log('PASS: exactly two cannon shots and Undo; only '+report.target.name+' armed, removed and restored. '+report.loaded);
}catch(e){report.passed=false;report.failure=String(e);await screen('failure').catch(()=>{});throw e;}
finally{await writeFile(join(out,'receipt.json'),JSON.stringify(report,null,2));await browser.close();}
