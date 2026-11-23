// Production-build rehearsal, trusted inputs only. Reads the existing minimap
// and camera to aim, never injects file selections, mutations or unlock state.
import {createRequire} from 'node:module';
import {mkdtemp,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const port=Number(process.argv[2]); assert(port>=1024&&port<=65535);
const origin='http://127.0.0.1:'+port;
const out=await mkdtemp(new URL('../tmp/production-qa/cleanup-rehearsal-',import.meta.url).pathname);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run']});
const ctx=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});
await ctx.route('**/*',r=>{const url=new URL(r.request().url());return !['http:','https:'].includes(url.protocol)||url.origin===origin?r.continue():r.abort();});
const page=await ctx.newPage(),report={origin,inputs:[],errors:[],out},btn=name=>page.getByRole('button',{name}),shot=name=>page.screenshot({path:out+'/'+name+'.png'});
page.on('pageerror',e=>report.errors.push(String(e)));
function probe(){
 const world=document.querySelector('canvas[data-engine]'),radar=document.querySelector('canvas[data-game-ui]');
 if(!radar||!world)return [];
 const key=Object.keys(radar).find(k=>k.startsWith('__reactFiber$'));let tank;
 for(let f=radar[key];f&&!tank;f=f.return)for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.name==='player-tank')tank=h.memoizedState.current;
 const state=tank?.__r3f?.root?.getState();if(!state)return [];
 const rect=world.getBoundingClientRect(), targets=[];
 state.scene.traverse(m=>{for(const {block} of m.userData.ghostHutSkin?.entries??[]){
   if(!block.path.startsWith('pick:sample-'))continue;
   const p=tank.position.clone().set(block.position[0],0,block.position[2]).project(state.camera);
   const x=(p.x+1)*rect.width/2+rect.x,y=(1-p.y)*rect.height/2+rect.y;
   targets.push({id:block.path,x,y,z:p.z,aim:p.z>=0&&p.z<=1&&document.elementFromPoint(x,y)===world});
 }}); return targets;
}
try{
 await page.goto(origin); await btn('Start Campaign').waitFor();assert.equal(await btn('Launch Horde Mode').count(),0);
 assert.match(await page.locator('body').innerText(),/Campaign and Boot Camp use fictional files/);
 await btn('Cleanup Desk').click();await shot('01-desk');
 assert.equal(await btn(/Choose files on this Mac/).count(),0);
 await btn('Rehearse with sample files').click();
 await page.waitForFunction(()=>!!document.querySelector('canvas[data-engine]'),{},{timeout:70000});
 const roster=page.getByRole('complementary',{name:'Numbered file targets'});
 const archiveRow=roster.getByRole('button',{name:/02.*field-notes.*Archive/});
 await archiveRow.click();
 report.archivePressedImmediately=await archiveRow.getAttribute('aria-pressed');
 await roster.getByRole('button',{name:/02.*field-notes.*Archive/,pressed:true}).waitFor({timeout:7000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.cleanup-beacon.is-found')].some(x=>x.textContent==='02'),{},{timeout:15000});
 report.highlighted='02: Archive / field-notes.txt';
 assert.equal(await btn('Review shortlist (0)').count(),1,'Highlighting alone must not nominate');
 assert.equal(await page.locator('.controls-ribbon').innerText().then(x=>/Undo|Purge/.test(x)),false);
 await page.waitForFunction(probe,{}, {timeout:20000}).catch(()=>{});
 const deadline=Date.now()+28000;let hit=false;
 while(Date.now()<deadline&&!hit){
   const points=await page.evaluate(probe);report.lastPoints=points;
   // Leave the Archive duplicate identified in the index; deliberately fire
   // at the unobstructed Drafts hut. The cannon, not the highlighted row, wins.
   for(const p of points.filter(x=>x.aim&&x.id==='pick:sample-a')){
     await page.mouse.move(p.x,p.y);await page.waitForTimeout(600);await page.mouse.click(p.x,p.y);
     report.inputs.push(p);
     if(await btn('Review shortlist (1)').waitFor({timeout:1800}).then(()=>true).catch(()=>false)){hit=true;break;}
   }
   if(!hit)await page.waitForTimeout(400);
 }
 assert(hit,'No selected sample hut nominated by trusted cannon input. '+JSON.stringify(report.lastPoints));
 const actual=await page.locator('.cleanup-beacon.is-marked').allTextContents();
 assert.deepEqual(actual,['01 ✓'],'The Drafts duplicate that was shot must be the only nomination');report.marked=actual;
 await page.keyboard.press('x'); await page.keyboard.press('Control+z'); assert(!await btn('Review shortlist (1)').isDisabled());
 await shot('02-nominated');await btn('Review shortlist (1)').click();
 const listed=page.locator('.cleanup-desk li'); assert.equal(await listed.count(),1);
 report.path=await listed.locator('.desk-path').innerText();assert.equal(report.path,'Sample drive / Drafts / field-notes.txt');
 assert.match(await listed.innerText(),/01 · field-notes\.txt/);
 await btn('Review sample…').click();assert(await btn('Keep sample').evaluate(b=>b===document.activeElement),'Keep sample must have initial focus');await btn('Keep sample').click();assert.match(await listed.innerText(),/Kept · no change/);await shot('02b-kept');report.cancelled=true;
 await btn('Review sample…').click();await btn('Move sample to virtual Trash').click();assert.match(await listed.innerText(),/No real files changed/);await shot('03-receipt');
 await btn('Finish & forget selection').click();await btn('Start Campaign').click();await btn('Field files').click({timeout:50000});
 await page.locator('.virtual-drive li').first().waitFor();
 const rows=await page.locator('.virtual-drive li').allInnerTexts();assert(rows.some(x=>/sector-map\.png/i.test(x))&&!rows.some(x=>/field-notes\.txt/i.test(x)));
 assert.equal(await page.locator('.virtual-drive li button').count(),0,'The field list must not offer folder navigation');
 assert.match(await page.locator('.virtual-drive footer').innerText(),/Virtual Trash · 0/);report.campaignRows=rows;
 report.bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>new URL(x.name).pathname).filter(x=>/\/assets\/(GameSession|index)-.+\.js$/.test(x)));
 assert(report.bundle.some(x=>x.includes('GameSession')));assert.equal(report.errors.length,0);report.pass=true;
}catch(e){report.failure=String(e);report.text=(await page.locator('body').innerText().catch(()=>'')).slice(0,1800);report.bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>new URL(x.name).pathname).filter(x=>/\/assets\/(GameSession|index)-.+\.js$/.test(x))).catch(()=>[]);await shot('failure').catch(()=>{});process.exitCode=1;}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
