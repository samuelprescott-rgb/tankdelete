import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import React from 'react';
import { reconciler, act, applyProps } from '@react-three/fiber';
import * as THREE from 'three';
import ts from 'typescript';

// Use the exact installed postprocessing dependency used by the wrapper, even
// under pnpm's isolated node_modules layout. No new test runner is required.
const require = createRequire(import.meta.url);
const postprocessingRequire = createRequire(require.resolve('@react-three/postprocessing'));
const { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect } = postprocessingRequire('postprocessing');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Exercise the real hooks with the real R3F reconciler and Three resources,
// without requiring a browser/GPU. Extract only the hooks to avoid importing
// browser effect JSX through Node; the implementation is not duplicated here.
const source = await readFile(new URL('../src/components/Scene/PostProcessing.tsx', import.meta.url), 'utf8');
const start = source.indexOf('const BLOOM_WORK');
const end = source.indexOf('export function exposureForBrightness');
assert(start >= 0 && end > start, 'Postprocessing lifecycle hooks must be available');
const { outputText } = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
});
const { BLOOM_WORK, useComposerLifetime, useComposerResolution } = new Function(
  'useEffect', 'useLayoutEffect', 'useRef',
  `${outputText}; return { BLOOM_WORK, useComposerLifetime, useComposerResolution };`,
)(React.useEffect, React.useLayoutEffect, React.useRef);

// The wrapper passes its options to the constructor and applies nested props
// via Fiber. Drive the installed effect's real update path to count its actual
// offscreen renders rather than assuming that 'resolutionScale' sizes the mask.
function bloomWork(props) {
  const effect = new BloomEffect({ ...props, mipmapBlur: true, luminanceThreshold: 1.05, intensity: 0.28 });
  applyProps(effect, props);
  const sceneBuffer = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType });
  effect.setSize(sceneBuffer.width, sceneBuffer.height);
  const draws = [];
  let target;
  effect.update({ setRenderTarget(t) { target = t; }, render() { draws.push([target.width, target.height]); } }, sceneBuffer, 1 / 60);
  assert.equal(sceneBuffer.width, 1920); assert.equal(sceneBuffer.height, 1080);
  effect.dispose(); sceneBuffer.dispose();
  return { draws, pixels: draws.reduce((n, [w,h]) => n + w*h, 0) };
}
const baseline = bloomWork({}), retained = bloomWork(BLOOM_WORK);
assert.deepEqual(baseline.draws[0], [1920,1080]);
assert.deepEqual(retained.draws[0], [960,540]);
assert.equal(baseline.draws.length, 16);
assert.equal(retained.draws.length, 10);
assert.ok(retained.pixels < baseline.pixels * 0.56);
console.log(`1080p bloom: ${baseline.draws.length} -> ${retained.draws.length} offscreen draws; ${baseline.pixels} -> ${retained.pixels} target pixels per frame.`);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const composer = new EffectComposer();
const renderPass = new RenderPass(scene, camera);
composer.passes.push(renderPass);
const bloom = new BloomEffect();
const tone = new ToneMappingEffect({ mode: 6 });
const composerRef = { current: composer };
const dimensions = { width: 1280, height: 720, dpr: 1 };
// Actual composer.setSize updates actual render targets against this minimal
// renderer contract; no GL commands are necessary to validate resolution.
const gl = {
  getSize: target => target.set(dimensions.width, dimensions.height),
  getDrawingBufferSize: target => target.set(dimensions.width * dimensions.dpr, dimensions.height * dimensions.dpr),
  setSize: (width, height) => Object.assign(dimensions, { width, height }),
};
composer.renderer = gl;
const store = { getState: () => ({ scene, internal: { active: false, frames: 0 }, invalidate() {} }) };
const fail = error => { throw error; };
const root = reconciler.createContainer(store, 1, null, false, null, '', fail, fail, fail, null);
let disposals = 0;
let bufferDisposals = 0;
let layoutUnmounts = 0;
let resolveGate;
const gate = new Promise(resolve => { resolveGate = resolve; });
const originalDispose = composer.dispose.bind(composer);
composer.dispose = () => { disposals++; originalDispose(); };
composer.inputBuffer.addEventListener('dispose', () => bufferDisposals++);

function Probe({ suspend, width, height, dpr }) {
  // Match wrapper ownership: only EffectPasses are rebuilt after a hidden
  // Suspense tree returns; the persistent RenderPass must never be destroyed.
  React.useLayoutEffect(() => {
    const pass = new EffectPass(camera, bloom, tone);
    composer.passes.push(pass);
    return () => {
      layoutUnmounts++;
      composer.removePass(pass);
    };
  }, []);
  useComposerLifetime(composerRef, camera, gl, scene);
  useComposerResolution(composerRef, width, height, dpr);
  if (suspend) throw gate;
  return null;
}

const tree = suspend => React.createElement(React.StrictMode, null,
  React.createElement(React.Suspense, { fallback: null }, React.createElement(Probe, { suspend, ...dimensions })));
const render = async element => {
  await act(async () => { reconciler.updateContainer(element, root, null, null); });
  await Promise.resolve();
};

await render(tree(false));
assert.equal(disposals, 0, 'StrictMode replay must not destroy the active composer');
assert(composer.passes.includes(renderPass));
assert(layoutUnmounts >= 1, 'StrictMode layout cleanup must be exercised');
assert.equal(composer.inputBuffer.width, 1280);
assert.equal(composer.inputBuffer.height, 720);
dimensions.dpr = 0.75;
await render(tree(false));
assert.equal(composer.inputBuffer.width, 960, 'DPR-only changes must resize the scene HDR buffer');
assert.equal(composer.inputBuffer.height, 540);
assert.equal(composer.outputBuffer.width, 960, 'Both ping-pong buffers must follow adaptive resolution');
assert.equal(composer.outputBuffer.height, 540);
assert.equal(composer.passes.length, 2, 'DPR changes must retain the existing effect pass');
dimensions.dpr = 1;
await render(tree(false));
assert.equal(composer.inputBuffer.width, 1280, 'Recovered DPR must restore HDR resolution');

const beforeHide = layoutUnmounts;
await render(tree(true));
assert(layoutUnmounts > beforeHide, 'Suspense hide must exercise layout cleanup');
assert.equal(disposals, 0, 'Suspense hide must retain the composer');
assert(composer.passes.includes(renderPass), 'RenderPass must survive the hidden state');
await act(async () => { resolveGate(); reconciler.updateContainer(tree(false), root, null, null); });
assert.equal(disposals, 0, 'Suspense reveal must retain the composer');
assert(composer.passes.includes(renderPass));
assert.equal(composer.passes.length, 2, 'RenderPass and effects must remain after reveal');
const beforeExit = bufferDisposals;
await render(null);
assert.equal(disposals, 1, 'Final unmount must destroy the composer exactly once');
assert.equal(bufferDisposals, beforeExit + 1, 'Final unmount must free the HDR input buffer');
assert.equal(composer.passes.length, 0);
bloom.dispose();
tone.dispose();
console.log('Postprocessing checks passed: StrictMode, Suspense hide/reveal, DPR resize/recovery, and final buffer disposal.');
