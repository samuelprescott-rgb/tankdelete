import assert from 'node:assert/strict';
import {summarizeCorrelations} from './qa-wk-correlation.mjs';

const r={raf:[[10,11,17,6],[60,61,65,4],[77,78,81,3]],scene:[[12,14,16],[62,63,65]],
  diagnosticMainTicks:[6,18,30,42,54,66],clockSync:[{sent:5,received:7,host:1006},{sent:12,received:32,host:1022}],
  native:{diagnostic20msTicksUptimeMs:[1000,1020,1040,1060,1080]},nonRafWork:[{kind:'setTimeout',at:18,end:26},{kind:'MessagePort.onmessage',at:90,end:99}],
  shots:[{t:23,name:'known'}],media:[],impact:{began:0,ended:80,cues:[{t:4,type:'inbound'}],gpuCalls:[],fileEvents:[]}};
const [s,...rest]=summarizeCorrelations(r);
assert.equal(rest.length,0);assert.equal(s.duration,50);assert.equal(s.callbackMs,6);assert.equal(s.idleAfterCallbacksMs,44);
assert.equal(s.simulationMs,2);assert.equal(s.composerMs,2);assert.equal(s.alignment.offset,1000);assert.equal(s.alignment.error,2);
assert.deepEqual(s.host20ms,{count:3,worstOverlappingMs:20});assert.deepEqual(s.main12ms,{count:4,worstOverlappingMs:12});
assert.deepEqual(s.nonRaf.map(v=>v.kind),['setTimeout']);assert.deepEqual(s.afterCue,{type:'inbound',dt:6});assert.deepEqual(s.audioStarts,['known']);
assert.equal(summarizeCorrelations({...r,clockSync:[]})[0].host20ms,null);
assert.equal(summarizeCorrelations({...r,impact:{...r.impact,began:13}}).length,0);
console.log('Native clock bounds, measured overlap, and route-boundary checks passed.');
