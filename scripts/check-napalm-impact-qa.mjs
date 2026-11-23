// Pure measurement checks. A positive fixture only tests parsing/gating; it
// does not count as the production capture of a target-bearing strike.
import assert from 'node:assert/strict';
import { impactWindow, targetCount, workloadMatches } from './measure-napalm-impact.mjs';
const clear=targetCount('Napalm impact · strike zone clear');
const three=targetCount('Napalm impact · 3 targets caught in the burn');
const one=targetCount('Napalm impact · 1 targets caught in the burn');
const inbound=targetCount('Phantom inbound · 3 targets in strike zone');
assert.equal(clear,0);assert.equal(three,3);assert.equal(one,1);assert.equal(inbound,null);
assert.equal(workloadMatches('clear',[clear,clear]),true);
assert.equal(workloadMatches('targets',[three,one]),true);
assert.equal(workloadMatches('targets',[three,clear]),false);
assert.equal(workloadMatches('observe',[three,inbound]),false);
assert.equal(workloadMatches('targets',[three]),false);
const raw={rafTimestampsMs:[0,16,32,150,166],gpuCalls:[{name:'linkProgram',t:101}],buffers:[{t:0,width:1920,height:1080}]};
const stats=a=>({samples:a.length,maxMs:Math.max(...a)});
const s=impactWindow(raw,50,110,stats);
assert.equal(s.coverage,true);assert.equal(s.samples,1);assert.equal(s.maxMs,118);
assert.equal(s.linkCalls,1);assert.equal(s.buffers[0].width,1920);
assert.equal(impactWindow(raw,170,180,stats).coverage,false);
console.log('Impact rAF overlap, link counts, and clear versus target-bearing cue gates passed.');
