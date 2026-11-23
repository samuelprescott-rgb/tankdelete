import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { act, context, extend, reconciler, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import ts from 'typescript';

// Import the actual TSX component, not a second implementation of its loading
// or placement logic. Loader callbacks below only replace the network boundary.
const modules = new Map();
async function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = (async () => {
    let { outputText } = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    });
    for (const match of [...outputText.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
      const tsUrl = new URL(`${match[2]}.ts`, url);
      const local = ts.sys.fileExists(fileURLToPath(tsUrl)) ? tsUrl : new URL(`${match[2]}.tsx`, url);
      const resolved = match[2].startsWith('.') ? await moduleUrl(local) : import.meta.resolve(match[2]);
      outputText = outputText.replace(match[0], `from '${resolved}'`);
    }
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  })();
  modules.set(url.href, pending);
  return pending;
}
const { SupplyCrates } = await import(await moduleUrl(new URL('../src/components/Scene/SupplyCrates.tsx', import.meta.url)));
const modelPath = '/models/yughues-crates/Crate-04.obj';
const mapPaths = ['/models/yughues-crates/diffuse.tga', '/models/yughues-crates/normal.tga'];
const assetRoot = new URL('../public/models/yughues-crates/', import.meta.url);
const source = new OBJLoader().parse(await readFile(new URL('Crate-04.obj', assetRoot), 'utf8'));
const textures = [];
for (const name of ['diffuse.tga', 'normal.tga']) {
  const bytes = await readFile(new URL(name, assetRoot));
  const image = new TGALoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(image.width, 512); assert.equal(image.height, 512);
  textures.push(new THREE.DataTexture(image.data, image.width, image.height));
}
const cachedGeometries = new Set();
const sourcePositions = new Map();
let cachedDisposals = 0;
source.traverse(node => {
  if (!node.isMesh) return;
  cachedGeometries.add(node.geometry);
  sourcePositions.set(node.geometry, node.geometry.attributes.position.array.slice());
  node.geometry.addEventListener('dispose', () => { cachedDisposals++; });
});
for (const texture of textures) texture.addEventListener('dispose', () => { cachedDisposals++; });

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend({ Group: THREE.Group, InstancedMesh: THREE.InstancedMesh });
const scene = new THREE.Scene();
const state = { scene, camera: new THREE.PerspectiveCamera(), size: {}, viewport: {}, events: {}, invalidate() {},
  internal: { active: false, frames: 0, interaction: [], initialHits: [], hovered: new Map(), capturedMap: new Map() } };
const store = { getState: () => state, getInitialState: () => state, subscribe: () => () => {} };
scene.__r3f = { root: store, type: 'scene', parent: null, children: [], props: {}, object: scene,
  eventCount: 0, handlers: {}, isHidden: false };
const fail = error => { throw error; };
let caught = 0;
const root = reconciler.createContainer(store, 1, null, false, null, '', fail, error => {
  assert.match(error.message, /Expected optional-crate/);
  caught++;
}, fail, null);
const requests = new Map();
const originalObjLoad = OBJLoader.prototype.load;
const originalTgaLoad = TGALoader.prototype.load;
function mockLoad(url, success, _progress, failure) {
  assert.ok(!requests.has(url), `One cached load per asset: ${url}`);
  requests.set(url, { success, failure });
}
OBJLoader.prototype.load = mockLoad;
TGALoader.prototype.load = mockLoad;
const clearCaches = () => {
  useLoader.clear(OBJLoader, modelPath);
  useLoader.clear(TGALoader, mapPaths);
  requests.clear();
};
const harness = () => React.createElement(context.Provider, { value: store },
  React.createElement(React.StrictMode, null, React.createElement(SupplyCrates)));
const render = async value => act(async () => reconciler.updateContainer(value, root, null, null));
function getBatch(label) {
  const batches = [];
  scene.traverse(node => { if (node.isInstancedMesh && node.visible) batches.push(node); });
  assert.equal(batches.length, 1, `${label}: exactly one visible instanced batch`);
  const mesh = batches[0];
  assert.equal(mesh.count, 3, `${label}: all three crates remain present`);
  assert.equal(mesh.instanceMatrix.usage, THREE.StaticDrawUsage);
  assert.ok(mesh.boundingBox && !mesh.boundingBox.isEmpty());
  assert.ok(mesh.boundingSphere && Number.isFinite(mesh.boundingSphere.radius));
  const pose = new THREE.Object3D(), actual = new THREE.Matrix4();
  [[0, 0, 0], [0.7, 0, 0], [0.35, 0.62, 0]].forEach(([x, y, z], index) => {
    pose.position.set(x, y, z); pose.rotation.y = index * 0.08; pose.scale.setScalar(0.62); pose.updateMatrix();
    mesh.getMatrixAt(index, actual);
    assert.ok(actual.elements.every((value, i) => Math.abs(value - pose.matrix.elements[i]) < 1e-6),
      `${label}: crate ${index} keeps its placed matrix, not constructor identity`);
  });
  assert.deepEqual(mesh.parent.position.toArray(), [7.8, -0.046, -6.7]);
  assert.equal(mesh.parent.rotation.y, -0.24);
  return mesh;
}
function assertSourcesUntouched() {
  assert.equal(cachedDisposals, 0, 'An optional instance cannot dispose useLoader-cached source geometry/textures');
  for (const [geometry, positions] of sourcePositions) {
    assert.deepEqual(geometry.attributes.position.array, positions, 'Normalization must clone source geometry');
  }
  for (const texture of textures) assert.equal(texture.colorSpace, THREE.NoColorSpace, 'Material setup cannot mutate the cached texture');
}

try {
  clearCaches();
  await render(harness());
  const pendingObj = getBatch('OBJ pending');
  assert.ok(pendingObj.geometry.attributes.crateMetal, 'Pending load uses the procedural closed-plank fallback');
  const composed = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  pendingObj.material.onBeforeCompile(composed, null);
  assert.match(composed.fragmentShader,
    /float wash = sin\(vCrateLocal[\s\S]*?\{\s*vec3 paintPoint[\s\S]*?float wash = paintedNoise[\s\S]*?\}\s*#include <alphamap_fragment>/,
    'Paint locals must be scoped separately from the crate wash in the assembled shader');
  assert.ok(requests.has(modelPath));
  assert.ok(!requests.has(mapPaths[0]), 'Texture loading follows the resolved model');
  await act(async () => requests.get(modelPath).success(source));
  getBatch('TGA pending');
  assert.ok(mapPaths.every(path => requests.has(path)));
  await act(async () => requests.get(mapPaths[0]).success(textures[0]));
  getBatch('One TGA pending');
  await act(async () => requests.get(mapPaths[1]).success(textures[1]));
  const complete = getBatch('Loaded');
  assert.equal(complete.geometry.attributes.position.count / 3, 768, 'The actual OBJ merges to 768 shared triangles');
  assert.equal(complete.geometry.groups.length, 0, 'No per-material draw groups are introduced');
  assert.ok(!Array.isArray(complete.material), 'All instances share one material');
  assert.ok(!cachedGeometries.has(complete.geometry));
  assert.notEqual(complete.material.map, textures[0]);
  assert.notEqual(complete.material.normalMap, textures[1]);
  assert.equal(complete.material.map.source, textures[0].source, 'Texture clones share decoded pixels');
  assert.equal(complete.material.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(complete.material.normalMap.colorSpace, THREE.NoColorSpace);
  let ownedDisposals = 0;
  for (const asset of [complete.geometry, complete.material, complete.material.map, complete.material.normalMap]) {
    asset.addEventListener('dispose', () => { ownedDisposals++; });
  }
  await render(null);
  assert.equal(scene.children.length, 0, 'Unmount removes the batch and wrapper');
  assert.equal(ownedDisposals, 4, 'Unmount releases the instance-owned merged geometry, material and texture wrappers');
  assertSourcesUntouched();

  // Exercise both separate failure stages; Suspense alone does not catch either.
  for (const failurePath of [modelPath, ...mapPaths]) {
    clearCaches();
    const caughtBefore = caught;
    await render(harness());
    getBatch('Failure scenario pending');
    if (failurePath !== modelPath) {
      await act(async () => requests.get(modelPath).success(source));
      const otherIndex = failurePath === mapPaths[0] ? 1 : 0;
      await act(async () => requests.get(mapPaths[otherIndex]).success(textures[otherIndex]));
    }
    await act(async () => requests.get(failurePath).failure(new Error(`Expected optional-crate failure: ${failurePath}`)));
    assert.ok(caught > caughtBefore, 'The real local error boundary receives the rejected asset');
    const fallback = getBatch('Rejected asset');
    assert.ok(fallback.geometry.attributes.crateMetal, 'Rejected asset still shows the complete procedural crates');
    await render(null);
    assert.equal(scene.children.length, 0);
    assertSourcesUntouched();
  }
} finally {
  await render(null);
  OBJLoader.prototype.load = originalObjLoad;
  TGALoader.prototype.load = originalTgaLoad;
  clearCaches();
  for (const geometry of cachedGeometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  source.traverse(node => { if (node.isMesh) node.material.dispose(); });
}
console.log('Supply crate checks passed: actual OBJ/TGA loading, 768 shared triangles, one three-instance static batch, model and both texture failure fallbacks, StrictMode and cached-source-safe cleanup.');
