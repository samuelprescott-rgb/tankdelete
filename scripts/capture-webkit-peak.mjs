// macOS-only isolated WKWebView; optional stress evidence, never a Tauri/real
// filesystem run. Node 22+, compiled qa-wk-host.swift, and a frozen Vite dist.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {preview} from 'vite';
import {qaArtifactFiles} from './qa-artifact-files.mjs';
import {installPeakProbe} from './peak-horde-qa.mjs';
import {waitForWorldFrames,physicalPresentation} from './qa-wk-render-ready.mjs';
import {inspectDrawBudget} from './qa-wk-scene-budget.mjs';
import {installQueueProbe,installPassWallProbe,summarizeQueueProbe} from './qa-wk-queue-probe.mjs';

async function peak(install,seed,proveFrames,readyMs,inspectBudget,installQueue,installPasses,measureDraws){
  const handler=window.__headlessStrikePort??window.webkit.messageHandlers.simulationQA,now=()=>performance.now();
  const wait=ms=>new Promise(res=>setTimeout(res,ms));
  const report={scope:'System WKWebView, nonpersistent local virtual simulation; seeded replay, NOT campaign progression or packaged Tauri.',
    route:[],stage:'setup',errors:[],hits:[0,0],rendererEdits:0};
  const stage=s=>{report.stage=s;handler.postMessage({op:'phase',stage:s});};
  const check=(ok,s)=>{if(!ok)throw Error(s);};
  const until=async(fn,label,ms)=>{const stop=now()+ms;while(now()<stop){const out=fn();if(out)return out;await wait(100);}throw Error('Timeout: '+label);};
  addEventListener('error',e=>report.errors.push(String(e.message||'resource failed: '+e.target?.src)),true);
  addEventListener('unhandledrejection',e=>report.errors.push(String(e.reason)));
  const key='tankdelete.virtual-defense.v1';
  let queue;
  try{
    check(!('__TAURI_INTERNALS__' in window)&&location.hostname==='127.0.0.1'&&!location.search,'Wrong isolated origin');
    check(localStorage.getItem(key)===null,'Existing save in supposed nonpersistent QA profile');
    localStorage.setItem(key,JSON.stringify(seed));report.seededFictionalReplay=seed;
    const button=await until(()=>document.querySelector('button[aria-label="Launch Horde Mode"]'),'seeded horde button',10000);
    const r=button.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    check(!button.disabled&&button.contains(document.elementFromPoint(x,y)),'Replay control not actionable');
    stage('launch');handler.postMessage({op:'click',x,y});
    await until(()=>/Embassy defense/.test(document.querySelector('.header h2')?.textContent??'')
      &&document.querySelector('.nightmare-order.is-combat')&&document.querySelector('canvas[data-engine]'),'real horde combat',35000);
    const ctx=await proveFrames('horde',report,readyMs);
    const renderer=ctx.getExtension('WEBGL_debug_renderer_info');
    report.device={userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],drawingBuffer:[ctx.drawingBufferWidth,ctx.drawingBufferHeight],
      gpu:renderer?ctx.getParameter(renderer.UNMASKED_RENDERER_WEBGL):ctx.getParameter(ctx.RENDERER)};
    check(innerWidth===1920&&innerHeight===1080&&ctx.drawingBufferWidth===1920&&ctx.drawingBufferHeight===1080,'Not full native input size');
    check(seed.every(n=>document.querySelector('.embassy-file-health')?.innerText.includes(n)),'Seeded fictional archive labels did not reach the live HUD');
    install();const p=window.__peakHorde;
    stage('stageWaves1and2');
    const end=now()+56000;
    while(now()<end){
      const {phase,wave}=p.ui();
      if(report.route.at(-1)?.phase!==phase||report.route.at(-1)?.wave!==wave)report.route.push({phase,wave,t:now(),active:p.active()});
      if(phase==='combat'&&wave===3)break;
      check(phase!=='defeat'&&phase!=='victory','Reached terminal state during setup');
      if(phase==='combat'&&(wave===1||wave===2))report.hits[wave-1]+=p.fixtureClear(wave);
      await wait(175);
    }
    const u=p.ui();check(u.wave===3&&u.phase==='combat','Never reached untouched wave 3');
    stage('peak');report.batchBefore=p.batch();
    if(installQueue)queue=installQueue(ctx,installPasses,measureDraws);
    p.arm(true,queue?.markFirst);
    report.identities=p.identities;
    // No additional inputs, hits, snapshots, phase/timing reads or file edits
    // in the seven-second actor window. Only poll completion outside rAF.
    report.frames=await until(()=>p.frames,'seven seconds from actual '+report.batchBefore.capacity+'-instance peak',23000);
    if(queue){report.queueProbe=queue.finish();queue=null;}
    report.batchAfter=p.batch();report.endPhase=p.ui();report.endBuffer=[ctx.drawingBufferWidth,ctx.drawingBufferHeight];
    report.glError=ctx.getError();report.contextLost=ctx.isContextLost();
    if(inspectBudget){stage('post-measurement draw census');report.drawBudget=await inspectBudget();}
    stage('complete');
  }catch(e){report.error=String(e);if(queue)report.queueProbe=queue.finish();}
  handler.postMessage({op:'done',report});
}

const [host,distArg,earnedReport,order='back',post]=process.argv.slice(2);
if(process.platform!=='darwin'||!host||!distArg||!earnedReport||!['front','back','front-physical','player-physical'].includes(order))throw Error('Provide a compiled macOS QA host, frozen dist, earned report and optional panel order');
const headless=host==='headless-webkit';
if(headless&&order!=='back')throw Error('Windowless WebKit is not a physical presentation');
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.resolve(root,distArg);
const earned=JSON.parse(await readFile(path.resolve(root,earnedReport))),seed=earned.campaign?.archives?.map(s=>s.split(' · ').at(-1));
if(earned.status!=='checks-passed'||seed?.length!==3||new Set(seed).size!==3||!seed.every(s=>/^[\w .()\-]{1,64}$/.test(s)&&!s.includes('..')))throw Error('No verified three-file virtual save in supplied report');
if(post&&!['post-budget','queue-diagnostic','queue-passes','queue-world'].includes(post))throw Error('Unknown peak mode');
const queueMode=post?.startsWith('queue-'),passMode=post==='queue-passes'||post==='queue-world';
const output=await mkdtemp(path.join(root,'tmp/production-qa/'+(headless?'headless-webkit-peak-':queueMode?'wk-queue-diagnostic-':'wk-peak-')));
console.log(headless?'Windowless WebKit peak evidence:':'Native peak evidence:',output);
const origin='http://127.0.0.1:1488/',server=await preview({root,build:{outDir:dist},preview:{host:'127.0.0.1',port:1488,strictPort:true,open:false}});
try{
  const manifest=JSON.parse(await readFile(path.join(dist,'.vite/manifest.json'))),artifact={};
  for(const file of await qaArtifactFiles(dist,manifest)){
    const hash=b=>createHash('sha256').update(b).digest('hex'),resp=await fetch(origin+file),dig=hash(await readFile(path.join(dist,file)));
    if(!resp.ok||hash(Buffer.from(await resp.arrayBuffer()))!==dig)throw Error('Artifact mismatch: '+file);
    artifact[file]=dig;
  }
  const child=headless?spawn(process.execPath,[path.join(root,'scripts/qa-headless-strike-host.mjs'),'webkit',origin,order],{stdio:['pipe','pipe','inherit']}):spawn(path.resolve(host),[origin,order],{stdio:['pipe','pipe','inherit']});const chunks=[];child.stdout.on('data',b=>chunks.push(b));
  const done=new Promise((res,rej)=>{child.once('error',rej);child.once('exit',(code,s)=>code===0?res():rej(Error('Host exit '+(code??s))));});
  child.stdin.end('('+peak.toString()+')(('+installPeakProbe.toString()+'),'+JSON.stringify(seed)+',('+waitForWorldFrames.toString()+'),'+(order.endsWith('-physical')?55000:28000)+','+(post==='post-budget'?'('+inspectDrawBudget.toString()+')':'null')+','+(queueMode?'('+installQueueProbe.toString()+')':'null')+','+(passMode?'('+installPassWallProbe.toString()+')':'null')+','+(post==='queue-world')+')');await done;
  const r=JSON.parse(Buffer.concat(chunks));r.artifact=artifact;if(headless)r.scope='Windowless Playwright WebKit, fictional seeded replay from a prior verified campaign. No native display or native window QA.';r.seedFrom=path.relative(root,path.resolve(root,earnedReport));
  const rows=r.frames??[];delete r.frames;await writeFile(path.join(output,'frames.json'),JSON.stringify(rows));
  if(rows.length>1){
    const deltas=rows.slice(1).map((v,i)=>v[0]-rows[i][0]),d=deltas.slice().sort((a,b)=>a-b),duration=rows.at(-1)[0]-rows[0][0];
    const pct=p=>d[Math.ceil(p*d.length)-1],sameBatch=r.batchBefore.stillMounted&&r.batchAfter.stillMounted&&r.batchBefore.uuid===r.batchAfter.uuid;
    r.timing={durationMs:duration,samples:d.length,effectiveHz:1000*d.length/duration,p50Ms:pct(.5),p95Ms:pct(.95),p99Ms:pct(.99),maxMs:pct(1),over33:d.filter(v=>v>33.4).length};
    r.checks={complete:r.stage==='complete'&&!r.error&&!r.errors.length,realWave:r.endPhase.wave===3&&r.endPhase.phase==='combat'&&r.hits.every(n=>n>0),
      sameFullRoster:duration>=7000&&sameBatch&&!r.batchBefore.frustumCulled&&r.batchBefore.capacity===r.batchAfter.capacity
        &&rows.every(v=>v[2]===r.batchBefore.capacity&&v[6]===2**r.batchBefore.capacity-1),
      foreground:rows.every(v=>!v[5])&&(headless?r.headless?.engine==='webkit':r.native?.samples.filter(v=>v.stage==='peak').some(v=>v.occlusionVisible)),
      fullResolution:rows.every(v=>v[3]===1920&&v[4]===1080)&&r.endBuffer.join('x')==='1920x1080',draws:!r.contextLost&&r.glError===0,
      timing:r.timing.effectiveHz>=58&&r.timing.p95Ms<=18.5&&r.timing.maxMs<=33.4};
  }
  r.presentation=headless?{target:'Windowless WebKit; no native display or focus qualification',verifiedPlayerFocus:false,verifiedPhysical1080:false}:physicalPresentation(r);
  if(headless&&r.checks)r.checks.hardwareRenderer=!!r.device?.gpu&&!/software|swiftshader|llvmpipe/i.test(r.device.gpu);
  if(order.endsWith('-physical')&&r.checks)r.checks.physicallyFitted=r.presentation.verifiedPhysical1080;
  if(order==='player-physical'&&r.checks)r.checks.keyPlayerWindow=r.presentation.verifiedPlayerFocus;
  if(queueMode){
    r.scope+=' Instrumented queue-completion diagnostic; never a release timing run.';
    if(r.queueProbe){
      const {samples,...device}=r.queueProbe;
      r.queueSummary={...device,...summarizeQueueProbe(r.queueProbe,rows)};
      await writeFile(path.join(output,'queue-raw.json'),JSON.stringify(samples));
      delete r.queueProbe;
    }
    const q=r.queueSummary,g=q?.passSummary?.groups;
    const passCoverage=(!passMode||(g?.world.callsPerFrame.p50>=1&&g['fullscreen-effect'].callsPerFrame.p50>=1&&g['fullscreen-final'].callsPerFrame.p50>=1))&&(post!=='queue-world'||q?.drawSummary?.count.p50>0);
    r.status=r.checks&&Object.entries(r.checks).every(([key,ok])=>key==='timing'||ok)&&rows.length>1&&q?.exactEpochMatches===rows.length-1&&q.fenceSupported&&q.polls>0&&!q.failure&&!q.dropped&&passCoverage?'diagnostic-complete':'diagnostic-incomplete';
  }else r.status=r.checks&&Object.values(r.checks).every(Boolean)?'checks-passed':'not-passed';
  await writeFile(path.join(output,'report.json'),JSON.stringify(r,null,2));
  console.log(JSON.stringify({status:r.status,stage:r.stage,error:r.error,timing:r.timing,checks:r.checks}));
  if(!['checks-passed','diagnostic-complete'].includes(r.status))process.exitCode=1;
}finally{await new Promise(res=>server.httpServer.close(res));}
