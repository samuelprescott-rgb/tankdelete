// Build a blinded deck of *actual* chase PNGs. Full panels are byte-identical
// to the captured files. Keep the key outside the folder shown to reviewers.
import assert from 'node:assert/strict';
import {createHash,randomInt} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir,link} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../tmp/production-qa/',import.meta.url));
const [leftRun,rightRun,comparison='material']=process.argv.slice(2);
assert.ok(['material','guard-post','staging'].includes(comparison));
const runs=[leftRun,rightRun];
const reports=await Promise.all(runs.map(async d=>{
  assert.match(d,/^horde-visibility-[\w-]+$/);
  const r=JSON.parse(await readFile(path.join(root,d,'report.json')));
  assert.equal(r.status,'checks-passed');assert.ok(r.checks.fullSizeChase&&r.checks.fixedChase&&r.checks.liveThreats);
  return r;
}));
const [a,b]=reports;assert.equal(a.width,b.width);assert.equal(a.height,b.height);
assert.deepEqual(a.hordeVisibility.map(s=>s.targetMs),b.hordeVisibility.map(s=>s.targetMs));
if(comparison==='staging'){
  assert.ok(a.ordinaryHudThroughout&&b.ordinaryHudThroughout,'Formation must be judged in ordinary HUD-on play');
  assert.deepEqual(a.campaign.archives,b.campaign.archives);
  for(const r of reports)assert.match(r.hordeVisibility[0].before.nightmareHud,/UNDEAD REMAINING\s+10\b/);
}
const out=await mkdtemp(path.join(root,'defense-blind-'));
const blind=path.join(out,'panels');await mkdir(blind);
const key={runs,comparison,viewport:[a.width,a.height],panels:[]};
for(let i=0;i<a.hordeVisibility.length;i++){
  const samples=reports.map(r=>r.hordeVisibility[i]);const target=samples[0].targetMs;
  const source='chase-wave-'+target+'ms.png';
  const [p,q]=samples.map(s=>s.before);
  assert.ok(samples.every(s=>Math.abs(s.before.waveMs-target)<250&&s.after.waveMs-s.before.waveMs<800),'Capture outside requested moment');
  const ids=[p,q].map(s=>s.zombies.map(z=>z.id).sort());
  if(comparison!=='staging')assert.deepEqual(...ids,'Different seeded roster or deaths at this time');
  else {
    // Changing real approach positions can change who survives friendly fire.
    // Do not filter the simulation for matching survivors: retain both actual lists.
    const seed=ids[0][0]?.replace(/-\d+$/,'');
    assert.ok(seed&&ids.every(list=>list.every(id=>id.replace(/-\d+$/,'')===seed)),'Different seeded waves');
    (key.liveActorIds??=[]).push({target,before:ids[0],after:ids[1]});
  }
  if(comparison!=='guard-post') {
    for(const f of ['xyz','quaternion'])assert.ok(p.camera[f].every((v,j)=>Math.abs(v-q.camera[f][j])<.0005));
    assert.deepEqual(p.tank,q.tank);
  }
  const first=randomInt(2);
  for(const [j,k] of [first,1-first].entries()){
    const name='scene-'+(i+1)+(j?'B':'A')+'.png',file=path.join(root,runs[k],source);
    const sha=createHash('sha256').update(await readFile(file)).digest('hex');
    assert.equal(sha,reports[k].screenshots.find(s=>s.file===source)?.sha256);
    await link(file,path.join(blind,name));
    key.panels.push({name,build:k?'candidate':'baseline',sha,source,observation:samples[k]});
  }
}
await writeFile(path.join(out,'key.json'),JSON.stringify(key));
console.log(blind);
