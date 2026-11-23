// Build an honest review sheet from two successful production captures.
// No filters other than uniform resizing and side-by-side arrangement.
// Blind panels omit the answer: hand only the blind folder to the critic.
import {createHash,randomInt} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../',import.meta.url));
const base=path.join(repo,'tmp/production-qa');
const [beforeDir,afterDir,...views]=process.argv.slice(2);
if(!beforeDir||!afterDir||!views.length)throw Error('Supply before and after capture dirs followed by view names.');
for(const d of [beforeDir,afterDir])if(!/^[A-Za-z0-9_-]+$/.test(d))throw Error('Expected capture name inside tmp/production-qa');
const digest=b=>createHash('sha256').update(b).digest('hex');
// Compare geometry rather than IEEE roundoff around world zero. This is
// 0.00000001 world units/degrees; actor IDs and other metadata stay exact.
const poseKey=v=>JSON.stringify(v,(_,p)=>typeof p==='number'&&Number.isFinite(p)?Math.round(p*1e8)/1e8:p);
const load=async d=>JSON.parse(await readFile(path.join(base,d,'report.json'),'utf8'));
const reports=await Promise.all([load(beforeDir),load(afterDir)]);
for(const r of reports)if(r.status!=='checks-passed'||!r.checks.fullResolution)throw Error('Incomplete or scaled photos cannot qualify');
const out=await mkdtemp(path.join(base,'hero-comparison-'));
const blindDir=path.join(out,'blind');await mkdir(blindDir);
const key={beforeDir,afterDir,views:[],method:'Sourced from full production frames; 800×450 per panel; no cropping, repainting, color adjustment or game-state edits.'};
const strip=(left,right,dest)=>execFileSync('ffmpeg',['-nostdin','-loglevel','error','-i',left,'-i',right,'-filter_complex',
  '[0:v]scale=800:450:flags=lanczos[a];[1:v]scale=800:450:flags=lanczos[b];[a][b]hstack=inputs=2','-frames:v','1',dest]);
for(const name of views){
  if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid view: '+name);
  const file=name+'.png',paths=[beforeDir,afterDir].map(d=>path.join(base,d,file));
  const shots=reports.map(r=>r.screenshots.find(s=>s.file===file));
  for(const [i,p] of paths.entries())if(!shots[i]||digest(await readFile(p))!==shots[i].sha256)throw Error('Changed or missing capture: '+p);
  const poses=reports.map(r=>r.views?.find(v=>v.view===name));
  if(poses.some(Boolean)&&poseKey(poses[0])!==poseKey(poses[1]))
    throw Error('Camera or actor mismatch: '+name);
  const reverse=!!randomInt(2);
  strip(paths[0],paths[1],path.join(out,file));
  strip(paths[Number(reverse)],paths[Number(!reverse)],path.join(blindDir,file));
  key.views.push({name,leftBlind:reverse?'after':'before',sources:shots.map(s=>s.sha256),anchor:poses[0]??null});
}
await writeFile(path.join(out,'comparison-key.json'),JSON.stringify(key,null,2));
console.log(out);
