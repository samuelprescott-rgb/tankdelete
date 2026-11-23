// Sequential, isolated local QA; never test the installed Tauri application.
// node scripts/run-retained-browser-suite.mjs FROZEN_DIR CDP_PORT ROUTE [ROUTE ...]
// Separate filmed play from the two timed routes. Read one report per route,
// including failed attempts; do not cherry-pick or reuse older-build measurements.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),qa=path.join(root,'tmp/production-qa');
const [dir,port,...names]=process.argv.slice(2);
if(!dir||!/^\d{4,5}$/.test(port)||Number(port)>65535||!names.length)throw Error('Need frozen QA build, private CDP port, route names');
const dist=await realpath(path.resolve(root,dir));
if(!dist.startsWith(qa+path.sep))throw Error('Only frozen local builds');
const routes={};
for(const [p,w,h,x,y] of [['1080',1920,1080,960,489],['1440',2560,1440,1280,652]]){
  const size=['--width',String(w),'--height',String(h)];
  routes['strikes'+p]=[...size,'--napalm-impact','--impact-aim-x',String(x),'--impact-aim-y',String(y),'--impact-expect','targets','--impact-max-frame-ms','33.4'];
  routes['peak'+p]=[...size,'--mode','horde','--peak-horde','--post-budget'];
}
const full=['--width','1920','--height','1080'];
routes.approach=[...full,'--mode','horde','--horde-visibility','--raid-review','--playing-hud-film','--offline-world'];
routes.portraits=[...full,'--sector-photos','--field-photos','--pin-field-leads','--portrait-turns','--warmup-ms','1200','--offline-world'];
routes.drive=[...full,'--sector-photos','--field-photos','--pin-field-leads','--hero-photos','--drive-crossing','--drive-video','--trail-photos','after','--warmup-ms','1200'];
routes.rescue=[...full,'--mode','horde','--raid-response','answer'];
routes.ignore=[...full,'--mode','horde','--raid-response','ignore'];
routes.watch=[...full,'--mode','horde','--defense-journey','watch'];
routes.defend=[...full,'--mode','horde','--defense-journey','defend'];
routes.relief=[...full,'--mode','horde','--defense-journey','relief'];
routes.compact=['--width','800','--height','600','--warmup-ms','1200'];
for(const n of names)if(!Object.hasOwn(routes,n))throw Error('Unknown route: '+n);
const output=await mkdtemp(path.join(qa,'browser-series-')),manifest=JSON.parse(await readFile(path.join(dist,'.vite/manifest.json'),'utf8'));
const entry=manifest['src/GameSession.tsx'].file,sha=createHash('sha256').update(await readFile(path.join(dist,entry))).digest('hex');
const summary={dist,entry,sha,scope:'Local Chrome. Never proof of WebKit, Tauri or physical presentation.',runs:[]};
console.log('Evidence:',output);
for(const name of names){
  const p=spawn(process.execPath,['scripts/capture-production-qa.mjs','--dist-dir',dist,'--cdp-port',port,'--preview-port','1484',...routes[name]],{cwd:root,stdio:['ignore','pipe','pipe']});
  let log='';
  for(const pipe of [p.stdout,p.stderr])pipe.on('data',data=>{log+=data;process.stdout.write(data);});
  const code=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('close',resolve);});
  const location=log.match(/^QA evidence: (.+)$/m)?.[1]?.trim();
  let r=null;if(location?.startsWith(qa+path.sep))try{r=JSON.parse(await readFile(path.join(location,'report.json'),'utf8'));}catch{}
  const match=r?.artifact?.[entry]===sha,passed=code===0&&match&&r?.status==='checks-passed';
  summary.runs.push({name,code,location:location&&path.basename(location),status:r?.status,match,passed,error:r?.error?.split('\n')[0]});
  await writeFile(path.join(output,'report.json'),JSON.stringify(summary,null,2));
  console.log(name,passed?'PASS':'FAIL',location);
}
if(!summary.runs.every(r=>r.passed))process.exitCode=1;
