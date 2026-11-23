import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Use the existing compiler without adding a test runner or emitted build files.
const source = await readFile(new URL('../src/components/Scene/adaptiveResolution.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { createAdaptiveResolution, setRenderingSuspended } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

function feed(controller, fps, seconds) {
  const changes = [];
  for (let frame = 0; frame < fps * seconds; frame++) {
    const next = controller.sample(1 / fps);
    if (next !== undefined) changes.push(next);
  }
  return changes;
}

const normal = createAdaptiveResolution();
assert.deepEqual(feed(normal, 60, 60), [], 'steady 60 FPS must stay at native resolution');

const overloaded = createAdaptiveResolution();
assert.deepEqual(feed(overloaded, 30, 2), [], 'initial shader/loading warmup must not reduce quality');
assert.deepEqual(feed(overloaded, 30, 6), [0.9], 'sustained slow pacing must lower one quality step');
assert.deepEqual(feed(overloaded, 30, 2), [], 'resolution must remain stable during cooldown');
assert.deepEqual(feed(overloaded, 30, 60), [0.8, 0.75], 'resolution must respect its quality floor');
assert.deepEqual(feed(overloaded, 60, 6), [], 'brief recovery must not immediately raise resolution');
assert.deepEqual(feed(overloaded, 60, 60), [0.8, 0.9, 1], 'sustained recovery must restore quality within its cap');

const interrupted = createAdaptiveResolution();
feed(interrupted, 60, 4);
assert.equal(interrupted.sample(5), undefined, 'tab suspension must not count as low FPS');
assert.deepEqual(feed(interrupted, 30, 2), [], 'resume must start a fresh warmup');
interrupted.reset();
assert.deepEqual(feed(interrupted, 60, 60), [], 'loading or resume must not leave stale slow samples');

const mixed = createAdaptiveResolution();
feed(mixed, 60, 4);
for (let cycle = 0; cycle < 10; cycle++) {
  assert.deepEqual(feed(mixed, 30, 1), []);
  assert.deepEqual(feed(mixed, 60, 2), [], 'isolated frame spikes must not pump resolution');
}

let invalidations = 0;
const state = {
  frameloop: 'always',
  clock: { elapsedTime: 42.25 },
  internal: { frames: 1 },
  setFrameloop(mode) {
    this.clock.elapsedTime = 0; // Match Fiber's installed clock-reset behavior.
    this.frameloop = mode;
  },
  invalidate() { invalidations++; },
};
setRenderingSuspended(state, true);
assert.equal(state.frameloop, 'never');
assert.equal(state.clock.elapsedTime, 42.25, 'suspension must preserve AI and animation timestamps');
assert.equal(state.internal.frames, 0, 'hidden canvases must not drain an invalidated manual frame');
setRenderingSuspended(state, false);
assert.equal(state.frameloop, 'always');
assert.equal(state.clock.elapsedTime, 42.25, 'resume must not reset or advance simulation time');
assert.equal(invalidations, 1, 'resuming must restart the render loop');

console.log('Render control checks passed: warmup, hysteresis, bounds, interruptions, and clock-safe visibility.');

const driveSource=await readFile(new URL('../src/lib/sceneReviewDrive.ts',import.meta.url),'utf8');
const driveJS=ts.transpileModule(driveSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {sceneReviewDriveInput}=await import(`data:text/javascript;base64,${Buffer.from(driveJS).toString('base64')}`);
assert.equal(sceneReviewDriveInput(-1),null);
assert.equal(sceneReviewDriveInput(20),null,'QA driver must stop after its bounded route');
assert.equal(sceneReviewDriveInput(Infinity),null);
assert.equal(sceneReviewDriveInput(0).forward,true);
assert.equal(sceneReviewDriveInput(1.7).left,true);
assert.equal(sceneReviewDriveInput(2.2).forward,true);
assert.equal(sceneReviewDriveInput(8.5).backward,true,'QA route must cover reverse tread motion');
assert.equal(sceneReviewDriveInput(14.5).forward,false,'Reverse cannot also apply forward input');
assert.equal(sceneReviewDriveInput(17.7).right,true,'QA route covers both pivot directions');
console.log('Development drive-route checks passed: bounded duration, ordinary inputs and automatic completion.');

const sweepSource = await readFile(new URL('../src/lib/sceneReviewGrassSweep.ts', import.meta.url), 'utf8');
const sweepJS = ts.transpileModule(sweepSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { sceneReviewGrassSweepX } = await import(`data:text/javascript;base64,${Buffer.from(sweepJS).toString('base64')}`);
assert.equal(sceneReviewGrassSweepX(0), -18);
assert.equal(sceneReviewGrassSweepX(10), -52);
assert.equal(sceneReviewGrassSweepX(20), -18);
assert.equal(sceneReviewGrassSweepX(25), -18, 'Camera-only sweep stops rather than looping');
assert.equal(sceneReviewGrassSweepX(-1), -18);
assert.equal(sceneReviewGrassSweepX(Infinity), -18);
for (let time = 0; time <= 20; time += 0.1) {
  assert.ok(Math.abs(sceneReviewGrassSweepX(time) - sceneReviewGrassSweepX(20 - time)) < 1e-10);
}
console.log('Grass camera sweep checks passed: deterministic outbound/return threshold crossings and bounded duration.');

const timerSource = await readFile(new URL('../src/components/Scene/gpuFrameTimer.ts', import.meta.url), 'utf8');
const timerJS = ts.transpileModule(timerSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { createGpuFrameTimer } = await import(`data:text/javascript;base64,${Buffer.from(timerJS).toString('base64')}`);
function fakeGL(supported = true) {
  let id = 0;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2, available: false, lost: false, disjoint: false,
    active: null, begun: 0, ended: 0, reads: 0, deleted: [], result: 6_250_000,
    getExtension: () => supported ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null,
    isContextLost() { return this.lost; },
    createQuery() { return { id: ++id }; },
    beginQuery(_, query) { assert.equal(this.active, null); this.active = query; this.begun++; },
    endQuery() { assert.ok(this.active); this.active = null; this.ended++; },
    getParameter() { return this.disjoint; },
    getQueryParameter(_, parameter) {
      if (parameter === this.QUERY_RESULT_AVAILABLE) return this.available;
      assert.ok(this.available, 'must never block waiting for a GPU result'); this.reads++; return this.result;
    },
    deleteQuery(query) { assert.ok(!this.deleted.includes(query.id), 'query is disposed exactly once'); this.deleted.push(query.id); },
  };
  return gl;
}
const unsupportedGL = fakeGL(false), unsupportedTimer = createGpuFrameTimer(unsupportedGL);
assert.equal(unsupportedTimer.supported, false);
unsupportedTimer.begin(); unsupportedTimer.end(); assert.equal(unsupportedTimer.poll(), null); unsupportedTimer.dispose();
assert.equal(unsupportedGL.begun, 0);
const timedGL = fakeGL(), timer = createGpuFrameTimer(timedGL);
timer.begin(); timer.begin(); assert.equal(timedGL.begun, 1, 'nested begins cannot overlap');
timer.end(); timer.end(); assert.equal(timedGL.ended, 1);
assert.equal(timer.poll(), null); assert.equal(timedGL.reads, 0);
timedGL.available = true; assert.equal(timer.poll(), 6.25); assert.equal(timedGL.deleted.length, 1);
for (let index = 0; index < 8; index++) { timer.begin(); timer.end(); }
assert.equal(timedGL.begun, 5, 'pending GPU query queue must stay bounded at four');
timedGL.disjoint = true; assert.equal(timer.poll(), null); assert.equal(timedGL.reads, 1);
assert.equal(timedGL.deleted.length, 5, 'invalid disjoint results are discarded');
timedGL.disjoint = false; timer.begin(); timer.dispose(); timer.dispose();
assert.equal(timedGL.deleted.length, 6); assert.equal(timedGL.ended, 6);
timer.begin(); assert.equal(timedGL.begun, 6, 'disposed timer never resumes');
const lostGL = fakeGL(), lostTimer = createGpuFrameTimer(lostGL);
lostTimer.begin(); lostGL.lost = true; lostTimer.end();
assert.equal(lostGL.ended, 0, 'lost contexts must not receive endQuery');
assert.equal(lostGL.deleted.length, 1); lostTimer.dispose();
console.log('GPU telemetry checks passed: optional support, async reads, bounded queries, disjoint/context loss and cleanup.');
