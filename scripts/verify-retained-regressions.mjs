// Run core repository checks once, serially and offline. This does not open a
// browser, install, mutate a campaign, or qualify GPU/rendered performance.
import {spawnSync} from 'node:child_process';
import {readFile,readdir,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),qa=path.join(root,'tmp','production-qa');
if(!process.argv[2])throw Error('Pass a frozen production output');
const dist=await realpath(path.resolve(root,process.argv[2]));
if(!dist.startsWith(qa+path.sep))throw Error('Expected local frozen QA build, not the player install');
const manifest=JSON.parse(await readFile(path.join(dist,'.vite','manifest.json')));
if(!manifest['src/GameSession.tsx']?.isDynamicEntry)throw Error('Game is not present in candidate');
const out=await mkdtemp(path.join(qa,'retained-cpu-'));
const entry=manifest['src/GameSession.tsx'].file;
const summary={dist,game:entry,sha256:createHash('sha256').update(await readFile(path.join(dist,entry))).digest('hex'),
  scope:'CPU/source regressions; bundle check explicitly targets the named built output. Not a graphics timing result.',checks:[]};
const checks=(await readdir(path.join(root,'scripts'))).filter(n=>/^check-[\w-]+\.mjs$/.test(n)).sort();
// Pixel-value tests require real captures of this exact build, not source-only
// arguments or an older convenient screenshot. Keep the viewport contract.
const plates=process.argv.slice(3);
if(plates.length!==2)throw Error('Pass the original and retained 1080p capture directories after the frozen output.');
const inputs=await Promise.all(plates.map(async dir=>{
  const d=path.resolve(root,dir),receipt=JSON.parse(await readFile(path.join(d,'receipt.json')));
  const shot=receipt.shots.find(s=>s.id==='river-chase'),file=path.join(d,'river-chase.png');
  const hash=createHash('sha256').update(await readFile(file)).digest('hex');
  if(!receipt.pass||!shot||String(shot.canvas)!=='1920,1080'||hash!==shot.sha256)throw Error('Unverified river capture '+file);
  return {file,bundle:receipt.builds[0],hash};
}));
if(inputs[0].bundle===inputs[1].bundle||inputs[1].bundle!=='/'+entry)throw Error('Wrong before/after build');
summary.captureInputs=inputs;
console.log('Regression evidence: '+out);
for(const [name,args] of [['typescript',['node_modules/typescript/bin/tsc','--noEmit']],...checks.map(n=>[n,['scripts/'+n,...(n==='check-bundle-budget.mjs'?[dist]:n==='check-paddy-glint.mjs'?inputs.map(i=>i.file):[])]])]){
  const res=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,timeout:90000});
  await writeFile(path.join(out,name+'.log'),(res.stdout??'')+(res.stderr??'')+(res.error?String(res.error):''));
  summary.checks.push({name,exit:res.status,signal:res.signal});
}
await writeFile(path.join(out,'report.json'),JSON.stringify(summary,null,2));
const failures=summary.checks.filter(c=>c.exit!==0);
console.log(JSON.stringify({total:summary.checks.length,failures,game:summary.game}));if(failures.length)process.exitCode=1;
