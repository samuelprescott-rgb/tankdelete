import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import React from 'react';
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
const plants = await load('../src/components/Scene/AuthoredJunglePlants.tsx');
const { createDenseJunglePlacements, jungleGroundHeight } = await load('../src/components/Scene/DenseJungle.tsx');
const { ROAD_GRID_SPACING } = await load('../src/lib/constants.ts');
const sourceAssets = {};
for (const [kind, asset] of Object.entries(plants.AUTHORED_JUNGLE_ASSETS)) {
  const folder = new URL(`../public${asset.model.slice(0, asset.model.lastIndexOf('/') + 1)}`, import.meta.url);
  const provenance = JSON.parse(await readFile(new URL('provenance.json', folder), 'utf8'));
  assert.equal(provenance.license, 'CC0-1.0');
  assert.match(provenance.source, /^https:\/\/opengameart.org\/content\//);
  assert.ok(!(await readdir(folder)).some(path => /normal|specular|\.fbx$/i.test(path)), 'No unneeded maps or full FBX sources shipped');
  for (const file of provenance.files) {
    const bytes = await readFile(new URL(file.path, folder));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, 'Original model and diffuse bytes must remain unchanged');
  }
  const model = new OBJLoader().parse(await readFile(new URL(`../public${asset.model}`, import.meta.url), 'utf8'));
  const bytes = await readFile(new URL(`../public${asset.diffuse}`, import.meta.url));
  const decoded = new TGALoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(decoded.width, 512); assert.equal(decoded.height, kind === 'palm' ? 512 : 1024);
  assert.equal(decoded.flipY, true);
  const alpha = decoded.data.filter((_, index) => index % 4 === 3);
  assert.ok(alpha.includes(0) && alpha.includes(255), 'Diffuse must retain genuine opaque and transparent alpha');
  const texture = new THREE.DataTexture(decoded.data, decoded.width, decoded.height);
  const resource = plants.createAuthoredJungleResources(model, texture, kind);
  const original = model.children[0].geometry;
  assert.notEqual(resource.geometry, original); assert.notEqual(resource.map, texture);
  assert.deepEqual(resource.geometry.attributes.uv.array, original.attributes.uv.array, 'No authored UV edits');
  assert.equal(resource.geometry.attributes.position.count / 3, asset.triangles);
  for (const name of ['position', 'normal', 'uv']) assert.ok(resource.geometry.attributes[name].array.every(Number.isFinite));
  const positions = resource.geometry.attributes.position, normals = resource.geometry.attributes.normal;
  for (let i = 0; i < positions.count; i++) assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 0.001);
  for (let i = 0; i < positions.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, i);
    const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
    assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-15, 'No degenerate imported triangles');
  }
  assert.ok(Math.abs(resource.geometry.boundingBox.min.y) < 1e-7);
  assert.ok(Math.abs(resource.geometry.boundingBox.max.y - 1) < 1e-7);
  assert.equal(resource.material.map, resource.map); assert.equal(resource.material.normalMap, null);
  assert.equal(resource.material.transparent, false); assert.equal(resource.material.alphaTest, 0.5);
  assert.equal(resource.material.side, THREE.DoubleSide); assert.equal(resource.material.depthWrite, true);
  assert.equal(resource.material.fog, true); assert.equal(resource.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(resource.map.flipY, true); assert.equal(resource.map.generateMipmaps, true);
  assert.equal(resource.material.emissive.getHex(), 0, 'Leaves still receive normal scene lighting and shadows');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  resource.material.onBeforeCompile(shader, null);
  if (kind === 'shrub') {
    assert.equal(shader.uniforms.shrubAlbedoGain.value, 4);
    assert.match(shader.fragmentShader, /min\(diffuseColor\.rgb \* shrubAlbedoGain, vec3\(0\.85\)\)/);
  } else assert.equal(shader.uniforms.shrubAlbedoGain, undefined, 'Palm shading must remain unchanged');
  let geometryDisposed = 0, materialDisposed = 0, mapDisposed = 0, sourceDisposed = 0;
  resource.geometry.addEventListener('dispose', () => geometryDisposed++);
  resource.material.addEventListener('dispose', () => materialDisposed++);
  resource.map.addEventListener('dispose', () => mapDisposed++);
  original.addEventListener('dispose', () => sourceDisposed++); texture.addEventListener('dispose', () => sourceDisposed++);
  resource.dispose();
  assert.deepEqual([geometryDisposed, materialDisposed, mapDisposed, sourceDisposed], [1, 1, 1, 0]);
  sourceAssets[kind] = { model, texture, sourceDisposals: () => sourceDisposed };
}

const rules = { distanceToRoad: value => Math.abs(((value + ROAD_GRID_SPACING / 2) % ROAD_GRID_SPACING
  + ROAD_GRID_SPACING) % ROAD_GRID_SPACING - ROAD_GRID_SPACING / 2),
isInsideObjectiveClearing: (x, z, padding = 0) => Math.abs(x) < 10 + padding && z > 25 - padding && z < 40 + padding,
isInsidePaddy: (x, z, padding = 0) => Math.abs(x) < 12 + padding && z > -16 - padding && z < 7 + padding };
let firstForest;
for (const seed of [1968, 70921, 1234, 4277391332]) {
  const forest = createDenseJunglePlacements({ ...rules, seed });
  firstForest ??= forest;
  const before = structuredClone(forest);
  const selection = plants.selectAuthoredShrubPlacements(forest.shrubs);
  assert.equal(selection.selected.length, 6); assert.equal(new Set(selection.selected).size, 6);
  assert.deepEqual(plants.selectAuthoredShrubPlacements(forest.shrubs), selection);
  assert.equal(selection.selected.length + selection.remaining.length, forest.shrubs.length);
  assert.ok(selection.selected.every(plant => forest.shrubs.includes(plant) && !selection.remaining.includes(plant)));
  assert.deepEqual(forest, before, 'Selection cannot alter any original tree/shrub placement');
  for (const [kind, placements] of [['palm', forest.palmTrunks], ['shrub', selection.selected]]) {
    for (const placement of placements) {
      const a = plants.composeAuthoredJungleMatrix(new THREE.Matrix4(), placement, kind);
      const b = plants.composeAuthoredJungleMatrix(new THREE.Matrix4(), placement, kind);
      assert.deepEqual(a.elements, b.elements); assert.ok(a.elements.every(Number.isFinite)); assert.ok(a.determinant() > 0);
      assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(a).toArray(), [placement.x, placement.y, placement.z]);
      assert.equal(placement.y, jungleGroundHeight(placement.x, placement.z));
      const scale = new THREE.Vector3(), rotation = new THREE.Quaternion(); a.decompose(new THREE.Vector3(), rotation, scale);
      assert.ok(rotation.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotation)) < 1e-7);
      if (kind === 'palm') assert.equal(scale.y, placement.sy, 'Palm retains exact seeded overall height');
      else assert.ok(scale.y >= 0.62 && scale.y <= 0.86, 'Hero shrub must stay below infantry eye height');
    }
  }
}

// Test the real optional renderer: pending / rejected art must retain the
// original batch locally, and replacement must never render both at once.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend({ Group: THREE.Group, Mesh: THREE.Mesh, InstancedMesh: THREE.InstancedMesh });
const scene = new THREE.Scene();
const state = { scene, internal: { active: false, frames: 0, interaction: [], initialHits: [], hovered: new Map(), capturedMap: new Map() }, invalidate() {} };
const store = { getState: () => state, getInitialState: () => state, subscribe: () => () => {} };
scene.__r3f = { root: store, type: 'scene', parent: null, children: [], props: {}, object: scene, eventCount: 0, handlers: {}, isHidden: false };
const fail = error => { throw error; }; let caught = 0;
const root = reconciler.createContainer(store, 1, null, false, null, '', fail, () => { caught++; }, fail, null);
const originalObjLoad = OBJLoader.prototype.load, originalTgaLoad = TGALoader.prototype.load;
let modelSuccess, modelFailure, textureSuccess, textureFailure;
OBJLoader.prototype.load = function (_url, success, _progress, failure) { modelSuccess = success; modelFailure = failure; };
TGALoader.prototype.load = function (_url, success, _progress, failure) { textureSuccess = success; textureFailure = failure; };
function render(kind, placements) {
  return React.createElement(context.Provider, { value: store }, React.createElement(plants.AuthoredJunglePlants, {
    key: kind, kind, placements, fallback: React.createElement('group', { name: 'original-plant-fallback' }),
  }, React.createElement('group', { name: 'remaining-original-plants' })));
}
function clear(kind) { useLoader.clear(OBJLoader, plants.AUTHORED_JUNGLE_ASSETS[kind].model); useLoader.clear(TGALoader, plants.AUTHORED_JUNGLE_ASSETS[kind].diffuse); }
try {
  for (const kind of ['palm', 'shrub']) {
    clear(kind);
    const placements = kind === 'palm' ? firstForest.palmTrunks : plants.selectAuthoredShrubPlacements(firstForest.shrubs).selected;
    await act(async () => reconciler.updateContainer(render(kind, placements), root, null, null));
    assert.ok(scene.getObjectByName('original-plant-fallback'));
    await act(async () => modelSuccess(sourceAssets[kind].model));
    assert.ok(scene.getObjectByName('original-plant-fallback'), 'Pending texture keeps the complete fallback');
    await act(async () => textureSuccess(sourceAssets[kind].texture));
    assert.equal(scene.getObjectByName('original-plant-fallback'), undefined);
    assert.ok(scene.getObjectByName('remaining-original-plants'));
    const mesh = scene.getObjectByName(`authored-jungle-${kind}-batch`);
    assert.ok(mesh?.isInstancedMesh); assert.equal(mesh.count, placements.length);
    assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, true);
    assert.equal(mesh.instanceMatrix.usage, THREE.StaticDrawUsage);
    const originalVersion = mesh.instanceMatrix.version;
    const geometry = mesh.geometry, material = mesh.material, map = material.map;
    let cleaned = 0; for (const resource of [geometry, material, map]) resource.addEventListener('dispose', () => cleaned++);
    for (let i = 0; i < placements.length; i++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix);
      assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(new THREE.Vector3(placements[i].x, placements[i].y, placements[i].z)) < 1e-5);
    }
    await act(async () => reconciler.updateContainer(render(kind, placements), root, null, null));
    assert.equal(mesh.instanceMatrix.version, originalVersion, 'Unchanged props must not upload matrices again');
    const nextPlacements = placements.map(p => ({ ...p, x: p.x + 1 }));
    await act(async () => reconciler.updateContainer(render(kind, nextPlacements), root, null, null));
    assert.equal(scene.getObjectByName(`authored-jungle-${kind}-batch`), mesh, 'Seed/position changes reuse instance storage');
    assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material);
    assert.equal(cleaned, 0); assert.ok(mesh.instanceMatrix.version > originalVersion);
    await act(async () => reconciler.updateContainer(null, root, null, null));
    assert.equal(scene.children.length, 0); assert.equal(cleaned, 3, 'Owned geometry/material/map cleaned exactly once');
    assert.equal(sourceAssets[kind].sourceDisposals(), 0, 'Cached originals must survive scene exit');
    for (const phase of ['model', 'texture']) {
      clear(kind);
      await act(async () => reconciler.updateContainer(render(kind, placements), root, null, null));
      if (phase === 'texture') await act(async () => modelSuccess(sourceAssets[kind].model));
      await act(async () => (phase === 'model' ? modelFailure : textureFailure)(new Error('Expected optional plant load failure')));
      assert.ok(scene.getObjectByName('original-plant-fallback'), 'Failed optional art keeps original plants');
      assert.equal(scene.getObjectByName(`authored-jungle-${kind}-batch`), undefined);
      await act(async () => reconciler.updateContainer(null, root, null, null));
    }
  }
  assert.equal(caught, 4, 'All actual load rejections must be contained by the local boundary');
} finally {
  OBJLoader.prototype.load = originalObjLoad; TGALoader.prototype.load = originalTgaLoad;
  for (const kind of ['palm', 'shrub']) clear(kind);
}
console.log('Authored plant checks passed: CC0 hashes, 451/608 triangles, original alpha/UVs, deterministic grounded transforms, six existing shrub plots, static batches, local model/texture fallbacks and resource cleanup.');
