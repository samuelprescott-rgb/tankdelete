// Read-only evidence check. Usage (paths relative to the working directory):
// node scripts/summarize-qualification.mjs FROZEN_DIST REPORT_DIR [REPORT_DIR ...]
// JSON to stdout; exit 0 only if every supplied receipt matches and passes.
// This is not a completeness/release gate: even a green browser + CPU summary
// cannot establish packaged Tauri, audio quality, or an untested workload.
import {readFile,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {qaArtifactFiles} from './qa-artifact-files.mjs';
import {impactWindow,targetCount} from './measure-napalm-impact.mjs';

const [distArg,...dirs]=process.argv.slice(2);
if(!distArg||!dirs.length){console.error('Usage: node scripts/summarize-qualification.mjs FROZEN_DIST REPORT_DIR [REPORT_DIR ...]');process.exit(2);}
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const dist=await realpath(distArg), manifest=await json(path.join(dist,'.vite','manifest.json'));
const game=manifest['src/GameSession.tsx'];
if(!game?.isDynamicEntry)throw Error('Frozen manifest does not contain the game entry');
const artifact=new Map();
for(const file of await qaArtifactFiles(dist,manifest)){
  const disk=await realpath(path.resolve(dist,file));
  if(!disk.startsWith(dist+path.sep))throw Error('Build file outside frozen output: '+file);
  artifact.set(file,createHash('sha256').update(await readFile(disk)).digest('hex'));
}
const sha256=artifact.get(game.file);
const expectedCPU=['typescript',...(await readdir(new URL('.',import.meta.url))).filter(n=>/^check-[\w-]+\.mjs$/.test(n))];
const out={dist,game:game.file,sha256,scope:'Only supplied receipts. Browser, standalone WKWebView, and CPU checks do not verify packaged Tauri runtime.',reports:[]};
const gateWindows=['launch','inboundToImpact','centeredImpact','ignite','rollingFire'];
const validSeries=a=>Array.isArray(a)&&a.length>=2&&a.every((v,i)=>Number.isFinite(v)&&(!i||v>a[i-1]));
const dims=rows=>[...new Set(rows.map(([w,h])=>w+'x'+h))];
const rounded=n=>+n.toFixed(3);

async function strikeSummary(dir,r,s){
  const raw=await json(path.join(dir,'impact-raw.json')),c=raw.cues;
  const clicks=raw.input.filter(e=>e.type==='pointerdown'&&e.world&&e.trusted&&e.button===0);
  if(!validSeries(raw.rafTimestampsMs)||clicks.length!==2||c.map(e=>e.type).join(',')!=='inbound,impact,inbound,impact')throw Error('Incomplete raw strike timing/input/cues');
  s.rawImpactResolution=dims(raw.buffers.map(b=>[b.width,b.height]));
  if(s.rawImpactResolution.join(',')!==[r.width??1920,r.height??1080].join('x')||raw.startedHidden!==false||raw.visibility.some(e=>e.hidden))s.findings.push('Raw strike resolution/visibility failed');
  s.strikes=clicks.map(({t:click},i)=>{
    const inbound=c[2*i].t,impact=c[2*i+1].t,targets=targetCount(c[2*i+1].text);
    if(!(click<=inbound&&inbound<impact)||targets===null)throw Error('Invalid raw strike order/target count');
    if(r.napalmImpact&&r.napalmImpact.strikes?.[i]?.actualTargets!==targets)s.findings.push('Raw and reported target counts differ');
    const bounds={launch:[click-50,inbound+1000],inboundToImpact:[inbound,impact],centeredImpact:[impact-500,impact+500],ignite:[impact,impact+500],rollingFire:[impact+500,impact+4500]};
    if(r.napalmImpact)Object.assign(bounds,{preClickIdle:[click-2000,click],preImpact:[impact-2000,impact-500],impactSpan:[impact-150,impact+150],postRolling:[impact+4500,impact+5500]});
    const reported=r.napalmImpact?.strikes?.[i]?.windows??r.windows?.[i];
    const windows=Object.fromEntries(Object.entries(bounds).map(([key,[from,to]])=>{
      const {maxMs,samples,coverage}=impactWindow(raw,from,to,d=>({maxMs:Math.max(...d),samples:d.length}));
      const w=reported?.[key];
      if(!w||!(samples>0)||!coverage||w.samples!==samples||!Number.isFinite(w.maxMs)||Math.abs(w.maxMs-maxMs)>.0011)s.findings.push('Unverified '+(i?'later':'first')+' window '+key);
      return [key,{maxMs:Number.isFinite(maxMs)?rounded(maxMs):null,samples,coverage}];
    }));
    const budgetMs=r.impactFrameBudget?.maxMs??33.4;
    if(!Number.isFinite(budgetMs)||gateWindows.some(k=>windows[k].maxMs===null||windows[k].maxMs>Math.min(budgetMs,33.4)))s.findings.push('Strike '+(i+1)+' exceeds gate');
    return {use:i?'later':'first',targets,budgetMs:Math.min(budgetMs,33.4),windows};
  });
}
async function waveSummary(dir,r,s){
  const p=r.peakHorde,rows=p?.frames??await json(path.join(dir,'frames.json'));
  if(!validSeries(rows.map(f=>f[0]))||rows.some(f=>!Number.isInteger(f[2])||typeof f[5]!=='boolean'))throw Error('No valid timed wave samples');
  // Chromium rounds timestamps AND deltas independently. Use its recorded
  // delta, verifying consistency to one unit of that rounding; WK uses time.
  const delta=rows.slice(1).map((f,i)=>{
    const dt=f[0]-rows[i][0];if(!p)return dt;
    if(!(f[1]>0)||Math.abs(f[1]-dt)>.101)throw Error('Invalid raw wave interval');return f[1];
  }).sort((a,b)=>a-b);
  const durationMs=rows.at(-1)[0]-rows[0][0],samples=delta.length,q=f=>delta[Math.ceil(samples*f)-1];
  const w=s.wave={wave:(p?.route?.at(-1)??r.endPhase)?.wave,setup:p?.setup??r.scope,durationMs,samples,
    active:[Math.min(...rows.map(f=>f[2])),Math.max(...rows.map(f=>f[2]))],framebuffer:dims(rows.map(f=>[f[3],f[4]])),foreground:rows.every(f=>!f[5]),
    effectiveHz:rounded(1000*samples/durationMs),p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),maxMs:q(1),over33_4:delta.filter(n=>n>33.4).length};
  // Older Chromium receipts predate the explicit pool field (sixteen slots).
  const capacity=p?.capacity??r.batchBefore?.capacity??16;
  if(w.wave!==3||w.active.some(n=>n!==capacity)||w.framebuffer.join(',')!==[r.width??1920,r.height??1080].join('x')||!w.foreground||durationMs<7000||1000*samples/durationMs<58||w.p95Ms>18.5||w.maxMs>33.4)s.findings.push('Raw wave gate failed');
  if(r.drawBudget)s.postTimingDraws={calls:r.drawBudget.calls,triangles:r.drawBudget.triangles};
}
for(const dir of dirs){
  const s={dir:path.resolve(dir),findings:[]};out.reports.push(s);
  try{
    const r=await json(path.join(dir,'report.json')),cpu=Array.isArray(r.checks)&&typeof r.sha256==='string';
    s.runtime=cpu?'CPU/source':/^Chrome\//.test(r.browser)?'Chromium':r.native?.order?'standalone system WKWebView':'unrecognized';
    if(s.runtime==='unrecognized')throw Error('Unrecognized report type; no native/package claim');
    s.scope=r.scope??s.runtime;s.reportedStatus=r.status??null;
    const bad=cpu?(r.game===game.file&&r.sha256===sha256?[]:['game or SHA mismatch']):
      [...new Set([...artifact.keys(),...Object.keys(r.artifact??{})])].filter(k=>!artifact.has(k)||r.artifact?.[k]!==artifact.get(k));
    s.artifactMatch=bad.length===0;s.identityScope=cpu?'game bundle only':'complete QA asset hash set';
    if(bad.length)throw Error('Frozen artifact mismatch: '+bad.join(', '));
    s.checks=r.checks??null;
    if(cpu){
      const names=new Set(r.checks.map(c=>c.name));
      s.cpuSuite={total:r.checks.length,missingFromCurrentSuite:expectedCPU.filter(n=>!names.has(n)),failed:r.checks.filter(c=>c.exit!==0||c.signal!=null).map(c=>c.name)};
      if(s.cpuSuite.missingFromCurrentSuite.length||names.size!==r.checks.length||s.cpuSuite.failed.length)s.findings.push('Missing, duplicate, or failed CPU checks');
    }else{
      if(r.status!=='checks-passed'||!r.checks||!Object.keys(r.checks).length||Object.values(r.checks).some(v=>v!==true)||r.error)s.findings.push(r.error?.split('\n')[0]??'Report not passed');
      const pixelSize=c=>c?[c.bufferWidth,c.bufferHeight]:null;
      s.render={requested:r.width&&r.height?[r.width,r.height]:null,before:pixelSize(r.before?.canvas)??r.device?.drawingBuffer??r.buffer??null,
        after:pixelSize(r.after?.canvas)??r.endBuffer??null,physical1080:r.presentation?.verifiedPhysical1080??null};
      if(r.napalmImpact||r.windows)await strikeSummary(dir,r,s);
      if(r.peakHorde||(r.endPhase&&r.timing))await waveSummary(dir,r,s);
      if(r.defenseJourney){const {outcome,policy,durationMs,waves}=r.defenseJourney;s.defenseJourney={outcome,policy,durationMs,waves};}
    }
  }catch(error){s.findings.push(error.message);}
  s.passed=s.findings.length===0;
}
out.suppliedReportsPassed=out.reports.every(r=>r.passed);
console.log(JSON.stringify(out,null,2));if(!out.suppliedReportsPassed)process.exitCode=1;
