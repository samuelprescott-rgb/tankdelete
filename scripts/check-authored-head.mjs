import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import React, { useState } from 'react';
import { act, context, extend, reconciler, useLoader } from '@react-three/fiber';
import ts from 'typescript';

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
  modules.set(url.href, pending); return pending;
}
const load = async path => import(await moduleUrl(new URL(path, import.meta.url)));
const heads = await load('../src/components/Scene/AuthoredInfantryHead.tsx');
const undeadHeads = await load('../src/components/Scene/AuthoredZombieHead.tsx');
const infantry = await load('../src/components/Scene/infantryGeometry.ts');
const folder = new URL('../public/models/us-infantry-head/', import.meta.url);
const document = JSON.parse(await readFile(new URL('us-male-head.gltf', folder), 'utf8'));
const binary = await readFile(new URL('us-male-head.bin', folder));
const provenance = JSON.parse(await readFile(new URL('provenance.json', folder), 'utf8'));
assert.equal(provenance.license, 'CC0-1.0');
assert.equal(provenance.skin.license, 'CC0'); assert.equal(provenance.skin.author, 'Mindfront');
assert.equal(provenance.neckBoundaryVertices, 52, 'Only the lower open neck boundary is extended into the collar');
assert.equal(provenance.neckBoundaryY, -0.008);
const diffuse = await readFile(new URL('Aksel_Skin_diffuse.png', folder));
assert.equal(createHash('sha256').update(diffuse).digest('hex'),
  '268ee6d1ea9665f8050d040c7b47971884428628021418ae52f68912859f5e60', 'Original diffuse must remain unmodified');
assert.equal(diffuse.readUInt32BE(16), 2048); assert.equal(diffuse.readUInt32BE(20), 2048);
assert.equal(document.images.length, 1); assert.equal(document.textures.length, 1);
assert.equal(document.materials[0].normalTexture, undefined, 'No unused normal image may be fetched');
assert.equal(document.materials[0].pbrMetallicRoughness.roughnessFactor, 0.88);
assert.equal(binary.length, 253840);

// Parse the actual mesh binary without a browser image decoder. Image bytes and
// material references are checked independently above, not replaced on disk.
const parserDocument = structuredClone(document);
parserDocument.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString('base64')}`;
delete parserDocument.materials[0].pbrMetallicRoughness.baseColorTexture;
globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } };
const gltf = await new GLTFLoader().parseAsync(JSON.stringify(parserDocument), '');
const near = gltf.scene.getObjectByName('head-near'), far = gltf.scene.getObjectByName('head-far');
assert.equal(near.geometry.index.count / 3, 8452); assert.equal(far.geometry.index.count / 3, 2452);
assert.equal(near.material, far.material, 'Both levels share one skin material');
const sourcePairs = new Set();
function checkMesh(mesh, original = false) {
  const { geometry } = mesh;
  for (const attribute of ['position', 'normal', 'uv']) assert.ok(geometry.attributes[attribute].array.every(Number.isFinite));
  const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
  assert.equal(uv.count, p.count); assert.equal(n.count, p.count);
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 0.01);
    const key = [p.getX(i), p.getY(i), p.getZ(i), uv.getX(i), uv.getY(i)].join('/');
    if (original) sourcePairs.add(key);
    else assert.ok(sourcePairs.has(key), 'Far mesh cannot detach an authored UV from its matching position');
  }
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, geometry.index.getX(i));
    const b = new THREE.Vector3().fromBufferAttribute(p, geometry.index.getX(i + 1));
    const c = new THREE.Vector3().fromBufferAttribute(p, geometry.index.getX(i + 2));
    assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-18, 'No degenerate head triangles');
  }
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.x > 0.17 && size.x < 0.19 && size.y > 0.24 && size.y < 0.26);
}
checkMesh(near, true); checkMesh(far);
assert.ok(near.geometry.boundingBox.min.distanceTo(far.geometry.boundingBox.min) < 0.012);
assert.ok(near.geometry.boundingBox.max.distanceTo(far.geometry.boundingBox.max) < 0.012);
assert.equal(heads.authoredHeadLod(false, 5 ** 2), true);
assert.equal(heads.authoredHeadLod(false, 6 ** 2), false);
assert.equal(heads.authoredHeadLod(true, 6 ** 2), true);
assert.equal(heads.authoredHeadLod(true, 8 ** 2), false);

const original = infantry.createInfantryGeometry({ faction: 'us', kneeling: false });
const headless = infantry.createInfantryGeometry({ faction: 'us', kneeling: false, omitProceduralHead: true });
assert.ok(headless.attributes.position.count < original.attributes.position.count);
assert.equal(headless.boundingBox.max.y, original.boundingBox.max.y, 'Helmet remains unchanged');
assert.equal(headless.attributes.skinIndex.count, headless.attributes.position.count);

// Exercise the real optional component's pending/failure fallback, portal bone
// attachment, LOD updates and unmount cleanup using R3F's headless reconciler.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend({ Group: THREE.Group, Mesh: THREE.Mesh });
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
const subscribers = new Set();
const state = { scene, camera, size: {}, viewport: {}, events: {}, invalidate() {},
  internal: { active: false, frames: 0, interaction: [], initialHits: [], hovered: new Map(), capturedMap: new Map(),
    subscribe(ref) { subscribers.add(ref); return () => subscribers.delete(ref); } } };
const store = { getState: () => state, getInitialState: () => state, subscribe: () => () => {} };
scene.__r3f = { root: store, type: 'scene', parent: null, children: [], props: {}, object: scene,
  eventCount: 0, handlers: {}, isHidden: false };
const fail = error => { throw error; }; let caught = 0;
const root = reconciler.createContainer(store, 1, null, false, null, '', fail, () => { caught++; }, fail, null);
let rig, completeRequest, rejectRequest;
const originalLoad = GLTFLoader.prototype.load;
GLTFLoader.prototype.load = function (_url, success, _progress, failure) { completeRequest = success; rejectRequest = failure; };
function Harness() {
  const [ready, setReady] = useState(false);
  return React.createElement(context.Provider, { value: store }, React.createElement('group', { name: 'test-soldier' },
    React.createElement('primitive', { object: rig.root }),
    React.createElement('mesh', { name: 'test-body', geometry: ready ? headless : original, dispose: null }),
    React.createElement(heads.AuthoredInfantryHead, { rig, onReady: setReady })));
}
try {
  rig = infantry.createInfantryRig(false);
  await act(async () => reconciler.updateContainer(React.createElement(Harness), root, null, null));
  assert.equal(scene.getObjectByName('test-body').geometry, original, 'Pending head keeps original complete body');
  await act(async () => completeRequest(gltf));
  assert.equal(scene.getObjectByName('test-body').geometry, headless, 'Ready mapped head replaces only old facial geometry');
  const attachment = rig.head.getObjectByName('authored-infantry-head');
  assert.ok(attachment && attachment.parent === rig.head);
  assert.equal(attachment.scale.x, 1, 'Compact world scale cannot be applied twice');
  scene.updateMatrixWorld(true); camera.position.set(0, 2, 30);
  for (const sub of subscribers) sub.current({ camera, clock: { elapsedTime: 1 } });
  assert.equal(attachment.children[0].geometry, far.geometry);
  await act(async () => reconciler.updateContainer(null, root, null, null));
  assert.equal(rig.head.children.length, 0, 'Unmount removes portal artwork from the bone');
  assert.equal(subscribers.size, 0, 'Unmount removes LOD callbacks');
  infantry.disposeInfantryRig(rig);
  useLoader.clear(GLTFLoader, heads.AUTHORED_HEAD_PATH);
  rig = infantry.createInfantryRig(false);
  await act(async () => reconciler.updateContainer(React.createElement(Harness), root, null, null));
  await act(async () => rejectRequest(new Error('Expected optional-art request failure')));
  assert.ok(caught > 0, 'A real rejected load must reach the local error boundary');
  assert.equal(scene.getObjectByName('test-body').geometry, original, 'Failed optional art cannot leave a headless soldier');
  assert.equal(rig.head.children.length, 0);
  await act(async () => reconciler.updateContainer(null, root, null, null));
  infantry.disposeInfantryRig(rig);
  // The undead reuses the same CC0 source but only the 2,452-triangle mesh.
  // Exercise the real async adapter: one existing instance batch, no extra head draw.
  const map=new THREE.Texture(); far.material.map=map;
  const fallbackGeometry=new THREE.SphereGeometry(.2,8,6),fallbackMaterial=new THREE.MeshStandardMaterial();
  const head=new THREE.InstancedMesh(fallbackGeometry,fallbackMaterial,16), headRef={current:null};
  const instanceBuffer=head.instanceMatrix;
  const sourcePosition=far.geometry.attributes.position.array.slice();
  const undeadRender=()=>act(async()=>reconciler.updateContainer(React.createElement(context.Provider,{value:store},
    React.createElement(React.StrictMode,null,
      React.createElement(undeadHeads.AuthoredZombieHead,{headRef}),
      React.createElement('primitive',{object:head,ref:headRef,dispose:null}))),root,null,null));
  useLoader.clear(GLTFLoader,heads.AUTHORED_HEAD_PATH);
  await undeadRender();assert.equal(head.geometry,fallbackGeometry,'Pending optional undead head preserves fallback');
  await act(async()=>completeRequest(gltf));
  assert.notEqual(head.geometry,far.geometry,'Undead geometry is an owned clone');
  assert.equal(head.geometry.index.count/3,2452);
  assert.equal(head.material.map,map,'Original shared 2K diffuse is reused');
  assert.equal(head.instanceMatrix,instanceBuffer,'Existing gait matrices are not replaced');
  assert.equal(head.userData.authoredUndead,true);
  assert.deepEqual(far.geometry.attributes.position.array,sourcePosition,'Living soldiers retain their original head geometry');
  assert.ok(head.geometry.boundingBox.max.y<.21&&head.geometry.boundingBox.min.y>-.21,'Head fits the old animation frame');
  assert.ok(head.geometry.boundingBox.min.z<undeadHeads.ZOMBIE_EYE_LOCAL[2],'Glow centres stay behind the nose');
  const shader={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};
  head.material.onBeforeCompile(shader,{});
  assert.ok(shader.fragmentShader.includes('texture2D(map,vMapUv)'));
  assert.equal(head.material.emissiveIntensity,1);assert.equal(head.material.emissive.getHex(),0,'Head receives ordinary scene lighting');
  let ownedDisposed=0,sourceDisposed=0;
  head.geometry.addEventListener('dispose',()=>ownedDisposed++);head.material.addEventListener('dispose',()=>ownedDisposed++);
  far.geometry.addEventListener('dispose',()=>sourceDisposed++);map.addEventListener('dispose',()=>sourceDisposed++);
  await act(async()=>reconciler.updateContainer(null,root,null,null));
  assert.equal(head.geometry,fallbackGeometry);assert.equal(head.material,fallbackMaterial);
  assert.equal(head.userData.authoredUndead,false);assert.equal(ownedDisposed,2);assert.equal(sourceDisposed,0);
  // Warm-cache mount must also work when the adapter precedes the target ref.
  await undeadRender();assert.equal(head.userData.authoredUndead,true,'Warm cache cannot race the host ref');
  await act(async()=>reconciler.updateContainer(null,root,null,null));
  useLoader.clear(GLTFLoader,heads.AUTHORED_HEAD_PATH);await undeadRender();
  await act(async()=>rejectRequest(new Error('Expected undead-art failure')));
  assert.equal(head.geometry,fallbackGeometry,'Failed load cannot remove undead heads');
  await act(async()=>reconciler.updateContainer(null,root,null,null));
  fallbackGeometry.dispose();fallbackMaterial.dispose();map.dispose();far.material.map=null;
} finally {
  GLTFLoader.prototype.load = originalLoad;
  useLoader.clear(GLTFLoader, heads.AUTHORED_HEAD_PATH);
  original.dispose(); headless.dispose(); near.geometry.dispose(); far.geometry.dispose(); near.material.dispose();
}
console.log('Authored head checks passed: CC0 provenance, original 2K diffuse, 8452/2452-triangle UV LODs, material sharing, body fallback, bone attachment, hysteresis, undead instancing with cold/warm ref timing, rejected-load safety and cleanup.');
