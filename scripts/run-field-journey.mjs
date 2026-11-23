// NODE_PATH=/path/to/playwright/node_modules node scripts/run-field-journey.mjs PORT [GameSession-HASH.js]
// Isolated Chromium, no user profile or review controls. Never open native mode.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {resolve,join} from 'node:path';
import {playVirtualCampaign} from './campaign-journey-qa.mjs';
const port=Number(process.argv[2]);assert.ok(Number.isInteger(port)&&port>1023&&port<65536&&port!==1420);
const expectedBundle=process.argv[3];if(expectedBundle)assert.match(expectedBundle,/^GameSession-[\w-]+\.js$/);
const origin='http://127.0.0.1:'+port;
const root=resolve('tmp/field-journey');await mkdir(root,{recursive:true});
const out=await mkdtemp(join(root,'run-'));console.log(out);
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const report={origin,expectedBundle,errors:[],events:[],verified:false};
const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
await page.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
const ev=expr=>page.evaluate(expr),key=(type,k)=>page.keyboard[type==='keyDown'?'down':'up'](k),click=({x,y})=>page.mouse.click(x,y);
const shot=label=>page.screenshot({path:join(out,label+'.png')});
const waitFor=(name,expr,ms=40000)=>page.waitForFunction(expr,undefined,{timeout:ms}).catch(e=>{throw Error(name+': '+e.message);});
const button=async expr=>{
  const pt=await ev(`(()=>{const e=(${expr});if(!e||e.disabled)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`);
  assert.ok(pt,'Unusable button: '+expr);await click(pt);
};
const log=e=>{report.events.push(e);console.log(JSON.stringify(e));};
try{
  await page.goto(origin+'/');assert.equal(new URL(page.url()).origin,origin);
  const launch=page.getByRole('button',{name:'Start Campaign',exact:true});await launch.waitFor();
  assert.equal(await page.getByRole('button',{name:'Launch Horde Mode'}).count(),0);
  assert.equal(await ev("'__TAURI_INTERNALS__' in window"),false);
  await launch.click();await waitFor('village campaign',"document.querySelector('.header h2')?.textContent==='Ghost Signal // Village clearing'",85000);
  report.campaignBundle=await ev("performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\\/GameSession-[\\w-]+\\.js$/.test(n))");
  if(expectedBundle)assert.equal(report.campaignBundle,origin+'/assets/'+expectedBundle,'Unexpected candidate gameplay bundle');
  report.campaign=await playVirtualCampaign({ev,button,key,click,shot,waitFor,sleep,log});
  await page.locator('button[data-session-exit]').click();
  const replay=page.getByRole('button',{name:'Launch Horde Mode'});await replay.waitFor();
  await page.reload();await replay.waitFor();
  report.archiveAfterReload=await ev("JSON.parse(localStorage.getItem('tankdelete.virtual-defense.v1'))");
  assert.deepEqual(report.archiveAfterReload,report.campaign.archives);await replay.click();
  await waitFor('earned replay running',"!!document.querySelector('.nightmare-order.is-combat')",85000);
  report.replay=await ev("[...document.querySelectorAll('.embassy-file-health span')].map(e=>e.textContent.split(' · ').at(-1))");
  assert.deepEqual(report.replay,report.campaign.archives);await shot('campaign-earned-replay');
  assert.deepEqual(report.errors,[]);report.verified=true;
}catch(e){report.failure=e.stack;console.error(e);await shot('incomplete').catch(()=>{});process.exitCode=1;}
finally{
  report.ui=await ev("document.body.innerText.slice(0,3000)").catch(()=>null);
  report.bundle=await ev("performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\\/GameSession-[\\w-]+\\.js$/.test(n))").catch(()=>null);
  if(report.verified&&(!report.bundle||report.bundle!==report.campaignBundle)){report.verified=false;report.failure='Campaign and replay did not load the same production gameplay bundle';process.exitCode=1;}
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();
}
