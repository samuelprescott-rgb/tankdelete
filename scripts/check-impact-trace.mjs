import assert from 'node:assert/strict';
import { summarizeImpactTrace } from './measure-impact-trace.mjs';

const labels=['begin','inbound-1','impact-1','inbound-2','impact-2','end'];
const traceMarks=labels.map((label,i)=>({name:`tankdelete.qa.napalm.${label}`,t:[0,20,40,200,250,400][i]}));
const offset=5_000_000;
const event=(name,t,duration,extra={})=>({name,pid:11,tid:3,cat:'devtools.timeline',ph:'X',ts:offset+t*1000,dur:duration*1000,...extra});
const events=[...traceMarks.map(m=>event(m.name,m.t,0,{ph:'R',cat:'blink.user_timing'})),
  {ph:'M',name:'process_name',pid:18,args:{name:'GPU Process'}},
  {ph:'M',name:'thread_name',pid:11,tid:3,args:{name:'CrRendererMain'}},
  {ph:'M',name:'thread_name',pid:11,tid:4,args:{name:'CompositorTileWorker1'}},
  event('RunTask',28,36),event('UpdateLayoutTree',35,22),
  event('DrawAndSwap',39,31,{pid:18,tid:2,cat:'viz'}),
  event('RasterTask',25,0,{tid:4,cat:'cc',ph:'B'}),event('RasterTask',55,0,{tid:4,cat:'cc',ph:'E'}),
  event('GLESCommandBuffer',42,20,{pid:18,tid:5,cat:'gpu'}),
];
const raw={traceMarks,rafTimestampsMs:[0,16.7,25,76,92.7,125,175,200,216.7,233.3,250,266.7],
  longFrames:[{t:27,duration:53,blockingDuration:3}],
  bufferUploads:[{target:34962,requestedBytes:2048,t:34,end:35}]};
const strikes=[{use:'first-use',impact:{t:40},windows:{preClickIdle:{fromMs:80,toMs:170},
  centeredImpact:{fromMs:23,toMs:42},ignite:{fromMs:40,toMs:84}}},
  {use:'repeat-use',impact:{t:250},windows:{centeredImpact:{fromMs:240,toMs:290}}}];
const report=summarizeImpactTrace(events,raw,strikes,33.4);
assert.equal(report.alignment.usable,true);
assert.equal(report.alignment.offsetSpreadMs,0);
assert.equal(report.gapCount,1,'Deduplicate one raw interval spanning overlapping gated windows; omit non-gated windows');
const [gap]=report.gaps;
assert.equal(gap.durationMs,51);
assert.deepEqual(gap.matches,[{strike:'first-use',windows:['centeredImpact','ignite'],relativeToImpactMs:[-15,36]}]);
assert.equal(gap.lanes['renderer-main'].events[0].name,'RunTask');
assert.equal(gap.lanes.raster.events[0].durationMs,30,'Pair synchronous trace begin/end slices');
assert.equal(gap.lanes.viz.events[0].overlapMs,31);
assert.equal(gap.lanes.gpu.events[0].overlapMs,20);
assert.deepEqual(gap.bufferUploads,[{target:34962,requestedBytes:2048,startFromGapMs:9,apiReturnMs:1}]);
assert.deepEqual(gap.longFrames,[{startFromGapMs:2,durationMs:53,blockingMs:3}]);
assert.equal(summarizeImpactTrace(events.slice(1),raw,strikes,33.4).alignment.usable,false);
const unsynced=events.map(e=>e.name.endsWith('.end')?{...e,ts:e.ts+2000}:e);
assert.equal(summarizeImpactTrace(unsynced,raw,strikes,33.4).alignment.usable,false);
console.log('Impact trace QA checks passed: cue clock, gated gap deduplication, overlapping renderer/compositor lanes, and buffer allocation attribution.');
