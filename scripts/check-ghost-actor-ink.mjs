import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/components/Scene/ghostActorInk.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
const {paintGhostActor,INK_CELL:N,ACTOR_PALETTE}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const different=(a,b)=>a.reduce((sum,v,i)=>sum+(v!==b[i]),0);
const firstInk=b=>b.findIndex(v=>v!==0)/N;
for(const kind of ['us','vc','boss']){
 for(let view=0;view<5;view++)for(let step=0;step<(kind==='boss'?5:3);step++){
  const cel=paintGhostActor(kind,view,step);
  assert.equal(cel.length,N*N);assert.equal(cel[0],0);
  assert(cel.every(v=>v<ACTOR_PALETTE.length));
  assert(cel.filter(Boolean).length>700);assert(new Set(cel).size>15);
  // The highest few helmet pixels can reach the crown of the tile; the
  // material addresses integer texel centers, never interpolates neighbors.
  assert(cel.subarray(0,N).filter(Boolean).length<12,'oversized or clipped crown');
  assert(cel.every((v,i)=>i%N!==0&&i%N!==N-1||v===0),'side edge bleed');
  assert(cel.subarray((N-1)*N).every(v=>v===0),'edge bleed across atlas tiles');
  assert.deepEqual(cel,paintGhostActor(kind,view,step),'art is deterministic');
 }
 assert(different(paintGhostActor(kind,0,0),paintGhostActor(kind,4,0))>150,'must change front vs rear design');
 assert(different(paintGhostActor(kind,1,1),paintGhostActor(kind,1,2))>60,'alternating footfalls must change silhouette');
}
for(let view=0;view<5;view++){
 const idle=paintGhostActor('boss',view,0),lift=paintGhostActor('boss',view,3),strike=paintGhostActor('boss',view,4);
 const tips=cel=>Array.from(cel.entries()).filter(([i,c])=>c>0 && Math.abs(i%N-48)>30).map(([i])=>Math.floor(i/N));
 assert.ok(Math.min(...tips(lift))+9<Math.min(...tips(idle)),'Raised claws change the outer silhouette, including in profile');
 assert.ok(different(lift,strike)>400,'Attack visibly follows through');
}
assert(firstInk(paintGhostActor('us',0,0,true))-firstInk(paintGhostActor('us',0,0))>17);
assert(different(paintGhostActor('us',1,0),paintGhostActor('vc',1,0))>250);
const faceA=paintGhostActor('boss',0,0).subarray(0,N*26),faceB=paintGhostActor('boss',4,0).subarray(0,N*26);
assert(faceA.filter(v=>v===50||v===51).length>80,'dark wavy front hair');
assert(faceB.filter(v=>v===46||v===47).length>25,'light cropped rear hair');
assert(different(faceA,faceB)>300);
console.log('55 authored actor cels passed: clean texture borders, indexed colors, opposing portraits, visible boss windup/strike, faction gear, knee height and gait.');
