// Observe live friendly pursuit in the unmodified production encounter; no state injection.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const [port,revision]=process.argv.slice(2);const record=process.argv.includes('--video'),adaptive=process.argv.includes('--ordinary-adaptive');assert(/^\d{4,5}$/.test(port)&&/^[\w-]+$/.test(revision));
const out=resolve('../TankDelete-Concepts/ghost-field/defenders-'+revision);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={revision,scope:'Actual wave in embassy practice; idle player, no pose, state, light, or camera overrides.',display:adaptive?'1920x1080 viewport, ordinary adaptive production renderer; not a 1080p timing run.':'1920x1080 buffer required.',buffers:[],errors:[],shots:[],ticks:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+port+'/?ghostSignal=embassy');await page.getByRole('button',{name:/^Embassy approach/i}).click();
 if(record){
  await page.waitForSelector('canvas[data-engine]');
  await page.evaluate(()=>{
   const stream=document.querySelector('canvas[data-engine]').captureStream(30);
   const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mimeType)throw Error('No supported game capture codec');
   const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6500000}),chunks=[];
   const captured=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    recorder.onerror=reject;recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;
     reader.readAsDataURL(new Blob(chunks,{type:mimeType}));stream.getTracks().forEach(t=>t.stop());};});
   window.__defenderRecorder={recorder,captured};recorder.start(300);
  });
 }
 const snapshot=()=>page.evaluate(()=>{
  const el=document.querySelector('.scene-container');if(!el)return null;
  const k=Object.keys(el).find(k=>k.startsWith('__reactProps$'));
  const find=v=>{if(Array.isArray(v)){for(const item of v){const p=find(item);if(p)return p;}return;}
   const p=v?.props;if(p?.onArchiveHit&&p.posesRef&&p.friendlyPosesRef)return p;return p&&find(p.children);};
  const p=find(el[k]?.children);if(!p?.active)return null;
  if(!window.__defenderWorld){
   const c=document.querySelector('canvas[data-game-ui]');
   if(c)for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const t=h.memoizedState?.current;if(t?.name==='player-tank')window.__defenderWorld=t.__r3f.root.getState().scene;
   }
  }
  const matches=[];for(const [id,z] of p.posesRef.current){if(!z.active||!z.pursuingSoldier)continue;
   const f=p.friendlyPosesRef.current.get(z.pursuingSoldier),actor=p.friendliesRef.current.find(s=>s.id===z.pursuingSoldier);if(!f||!actor)continue;
   const recoil=window.__defenderWorld?.getObjectByName(actor.id)?.userData.defenderHit;
   matches.push({id,soldier:actor.id,health:actor.health,alive:actor.alive,d:Math.hypot(z.position.x-f.position.x,z.position.z-f.position.z),swing:z.soldierSwing,z:z.position.toArray(),f:f.position.toArray(),recoil:recoil?{...recoil}:null});
  }
  return {t:performance.now(),matches:matches.sort((a,b)=>a.d-b.d),roster:p.friendliesRef.current.map(a=>[a.id,a.health]),game:performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\/GameSession-[\w-]+\.js$/.test(n)),
   buffer:[document.querySelector('canvas[data-engine]').width,document.querySelector('canvas[data-engine]').height]};
 });
 const health=new Map(),got=new Set();let start;const deadline=Date.now()+153000;
 while(Date.now()<deadline){
  const s=await snapshot();if(s&&s.matches.length){start??=s.t;
   assert(s.game.endsWith('/GameSession-'+revision+'.js'));if(!adaptive)assert.deepEqual(s.buffer,[1920,1080]);
   if(!report.buffers.some(b=>b[0]===s.buffer[0]&&b[1]===s.buffer[1]))report.buffers.push(s.buffer);
   const hurt=s.roster.filter(([id,h])=>health.has(id)&&h<health.get(id));for(const [id,h] of s.roster)health.set(id,h);
   report.ticks.push({ms:Math.round(s.t-start),pursuers:s.matches.length,nearest:s.matches[0],hurt});
   const take=async name=>{if(got.has(name))return;got.add(name);report.shots.push({name,...report.ticks.at(-1)});await page.screenshot({path:out+'/'+name+'.png'});};
   if(s.matches[0].d<5)await take('closing-on-rifle-line');
   if(s.matches.some(m=>m.swing==='windup'))await take('soldier-windup');
   if(hurt.length)await take('soldier-hit');
   if(s.matches.some(m=>m.recoil?.attackerId===m.id && m.recoil.weight>.32))await take('soldier-recoil');
   if(got.has('soldier-hit')&&got.has('soldier-windup')&&got.has('soldier-recoil')){await page.waitForTimeout(720);break;}
  }
  if(start&&await page.getByRole('button',{name:/retry/i}).count())break;
  await page.waitForTimeout(55);
 }
 report.pursuit=got.has('closing-on-rifle-line');report.contact=got.has('soldier-hit');assert(report.pursuit);
 if(record){const bytes=Buffer.from(await page.evaluate(()=>{window.__defenderRecorder.recorder.stop();return window.__defenderRecorder.captured;}),'base64');
  assert(bytes.length>100000);await writeFile(out+'/live-encounter.webm',bytes);}
 console.log(out,JSON.stringify({pursuit:report.pursuit,contact:report.contact,shots:[...got],samples:report.ticks.length}));
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
