import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import React from 'react';
import { act, context, extend, reconciler, useLoader } from '@react-three/fiber';
import ts from 'typescript';

// Count calls inside the real factories, without replacing their implementation.
globalThis.__jungleCompositionCalls = { scatter: 0, select: 0 };
const modules = new Map();
async function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = (async () => {
    let source = await readFile(url, 'utf8');
    const parsed = ts.createSourceFile(url.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const inserts = [];
    for (const node of parsed.statements) {
      const field = node.name?.text === 'createDenseJunglePlacements' ? 'scatter'
        : node.name?.text === 'selectAuthoredShrubPlacements' ? 'select' : undefined;
      if (field && ts.isFunctionDeclaration(node) && node.body) inserts.push({ at: node.body.getStart(parsed) + 1, field });
    }
    for (const { at, field } of inserts.sort((a, b) => b.at - a.at)) {
      source = `${source.slice(0, at)}\n(globalThis as any).__jungleCompositionCalls.${field}++;\n${source.slice(at)}`;
    }
    let { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    });
    if (url.pathname.endsWith('/DenseGroundCover.tsx')) outputText = outputText.replaceAll('import.meta.env.DEV', 'false');
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
const grass = await load('../src/components/Scene/DenseGroundCover.tsx');
const jungle = await load('../src/components/Scene/DenseJungle.tsx');
const plants = await load('../src/components/Scene/AuthoredJunglePlants.tsx');
const { createRiverCrossings, createRiverStations } = await load('../src/components/Scene/riverLayout.ts');
const { VietnamEnvironment, createRiverReeds } = await load('../src/components/Scene/VietnamEnvironment.tsx');
const geom = await load('../src/components/Scene/jungleGeometry.ts');
const horizontalRadius = geometry => {
  const p = geometry.getAttribute('position');
  let radius = 0;
  for (let i = 0; i < p.count; i++) radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i)));
  geometry.dispose();
  return radius;
};
const leafRadii = { shrubs: horizontalRadius(geom.createJungleShrubGeometry()), broadleaf: horizontalRadius(geom.createJungleBroadleafGeometry()),
  ferns: horizontalRadius(geom.createJungleFernGeometry()), bananas: horizontalRadius(geom.createJungleBananaGeometry()) };
const grassRadius = Math.max(horizontalRadius(grass.createGroundCoverGeometry()), horizontalRadius(grass.createGroundCoverGeometry('far')));

const obj = new OBJLoader().parse(await readFile(new URL(`../public${plants.AUTHORED_JUNGLE_ASSETS.shrub.model}`, import.meta.url), 'utf8'));
const sourceBounds = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
assert.ok(Math.abs(grass.AUTHORED_SHRUB_RADIUS_PER_HEIGHT - Math.max(sourceBounds.x, sourceBounds.z) / sourceBounds.y / 2) < 1e-12,
  'Grass footprint must follow measured source width, not an arbitrary wide clearing');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend({ InstancedMesh: THREE.InstancedMesh });
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), subscribers = new Set();
const state = { scene, camera, internal: { active: false, frames: 0, interaction: [], initialHits: [], hovered: new Map(), capturedMap: new Map(),
  subscribe(ref) { subscribers.add(ref); return () => subscribers.delete(ref); } }, invalidate() {} };
const store = { getState: () => state, getInitialState: () => state, subscribe: () => () => {} };
scene.__r3f = { root: store, type: 'scene', parent: null, children: [], props: {}, object: scene, eventCount: 0, handlers: {}, isHidden: false };
const fail = error => { throw error; };
const root = reconciler.createContainer(store, 1, null, false, null, '', fail, fail, fail, null);
const render = element => act(async () => reconciler.updateContainer(React.createElement(context.Provider, { value: store }, element), root, null, null));
let environmentTree, jungleTree;
function EnvironmentProbe(props) { environmentTree = VietnamEnvironment(props); return null; }
function JungleProbe(props) { jungleTree = jungle.DenseJungle(props); return null; }
// Mount the actual three production JungleBatch components returned by
// DenseJungle, with their real hooks, camera compaction and resource ownership.
// Other forest children use unrelated optional texture/OBJ requests.
function MountedCrowns(props) {
  const tree = jungle.DenseJungle(props);
  const arrays = [props.placements.nearCrowns, props.placements.midCrowns, props.placements.farCrowns];
  return React.Children.toArray(tree.props.children).filter(child => arrays.includes(child.props.placements));
}
const childProps = (tree, type) => React.Children.toArray(tree.props.children).find(child => child.type === type)?.props;
const resetCalls = () => { globalThis.__jungleCompositionCalls.scatter = 0; globalThis.__jungleCompositionCalls.select = 0; };
const calls = globalThis.__jungleCompositionCalls;
const textureLoads = new Map(), textures = [];
const originalTextureLoad = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = function (url, success) {
  const texture = new THREE.Texture(); textures.push(texture); textureLoads.set(url, () => success(texture)); return texture;
};
const urls = ['/images/textures/jungle-bark-v1.png', '/images/textures/jungle-branch-spray-v1.png'];
const counts = [];
try {
  urls.forEach(url => useLoader.clear(THREE.TextureLoader, url));
  resetCalls();
  await render(React.createElement(React.Suspense, { fallback: null }, React.createElement(EnvironmentProbe, { seed: 4277391332 })));
  assert.deepEqual(calls, { scatter: 0, select: 0 }, 'Do not build the forest while bark is pending');
  await act(async () => textureLoads.get(urls[0])());
  assert.deepEqual(calls, { scatter: 0, select: 0 }, 'Do not build the forest while canopy is pending');
  await act(async () => textureLoads.get(urls[1])());
  assert.deepEqual(calls, { scatter: 1, select: 1 }, 'The scene builds and selects its shared plan exactly once');
  const initial = childProps(environmentTree, jungle.DenseJungle);
  assert.equal(childProps(environmentTree, grass.DenseGroundCover).shrubFootprints, initial.authoredShrubs.selected,
    'Grass receives the exact selected array used by the plant renderer');
  for (let i = 0; i < 4; i++) {
    await render(React.createElement(React.Suspense, { fallback: null }, React.createElement(EnvironmentProbe, { seed: 4277391332, tankRef: { current: null } })));
    assert.equal(childProps(environmentTree, jungle.DenseJungle).placements, initial.placements);
  }
  assert.deepEqual(calls, { scatter: 1, select: 1 }, 'Unrelated parent renders cannot re-scatter or reselect');
  await render(React.createElement(React.Suspense, { fallback: null }, React.createElement(EnvironmentProbe, { seed: 1968 })));
  const changedSeed = childProps(environmentTree, jungle.DenseJungle);
  assert.notEqual(changedSeed.placements, initial.placements);
  assert.equal(childProps(environmentTree, grass.DenseGroundCover).shrubFootprints, changedSeed.authoredShrubs.selected);
  assert.deepEqual(calls, { scatter: 2, select: 2 }, 'A new seed refreshes the shared plan once for both children');
  await render(React.createElement(React.Suspense, { fallback: null }, React.createElement(EnvironmentProbe, { seed: Number.NaN })));
  assert.equal(childProps(environmentTree, jungle.DenseJungle).placements, changedSeed.placements);
  assert.deepEqual(calls, { scatter: 2, select: 2 }, 'Equivalent normalized seeds reuse the existing plan');
  await render(null);

  {
    const props = changedSeed;
    const arrays = [props.placements.nearCrowns, props.placements.midCrowns, props.placements.farCrowns];
    let photoDisposals=0, ownedDisposals=0;
    props.canopyMap.addEventListener('dispose', () => photoDisposals++);
    await render(React.createElement(MountedCrowns, props));
    const batches=[...scene.children], versions=batches.map(m=>m.instanceMatrix.version);
    assert.equal(batches.length,3,'Playable near/mid/far hardwoods keep the three bounded batches');
    for (const [level, mesh] of batches.entries()) {
      assert.ok(mesh.isInstancedMesh && mesh.count===arrays[level].length);
      assert.equal(mesh.castShadow,level===0);
      assert.equal(mesh.material.map,props.canopyMap,'All three LODs actually render the existing shared photo, not a private synthetic crown skin');
      assert.equal(mesh.material,batches[0].material);
      assert.equal(mesh.material.transparent,false);
      for (let i=0;i<mesh.count;i++) {
        const matrix=new THREE.Matrix4(); mesh.getMatrixAt(i,matrix);
        const p=arrays[level][i];
        assert(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(new THREE.Vector3(p.x,p.y,p.z))<1e-5);
      }
      mesh.geometry.addEventListener('dispose',()=>ownedDisposals++);
    }
    batches[0].material.addEventListener('dispose',()=>ownedDisposals++);
    await render(React.createElement(MountedCrowns, props));
    assert.deepEqual(scene.children,batches);
    assert.deepEqual(batches.map(m=>m.instanceMatrix.version),versions,'Unrelated renders must not regenerate live forest buffers');
    await render(null);
    assert.equal(ownedDisposals,4);
    assert.equal(photoDisposals,0);
    assert.equal(scene.children.length,0);
    assert.equal(subscribers.size,0);
  }

  // 1968 has a flooded first search square; 55 and 72 split the planted
  // spine at a road or inlet even when six individually legal sites exist.
  for (const seed of [1968, 55, 72, 70921, 1234, 4277391332]) {
    await render(React.createElement(EnvironmentProbe, { seed }));
    const forestProps = childProps(environmentTree, jungle.DenseJungle);
    const groundProps = childProps(environmentTree, grass.DenseGroundCover);
    const bridge = createRiverCrossings(createRiverStations(seed)).find(crossing => crossing.kind === 'bridge');
    const bridgeNeighbors = forestProps.placements.shrubs.filter(p => Math.abs(p.z - bridge.z) < bridge.length * .5 + 14);
    assert.ok(!bridgeNeighbors.some(p => Math.abs(p.x - bridge.centerX) < 3
      && Math.abs(p.z - bridge.z) < bridge.length * .5 + 5), 'Keep the deck approaches quiet beyond the abutments');
    assert.ok(bridgeNeighbors.filter(p => Math.abs(p.x - bridge.centerX) > 4 && Math.abs(p.x - bridge.centerX) < 18).length >= 15,
      'Keep living banks on the shoulders; clearing the whole village is not composition');
    const unvisited = new Set(bridgeNeighbors.filter(p => Math.abs(p.x - bridge.centerX) < 14));
    const groups = [], plantedShoulders = new Set();
    while (unvisited.size) {
      const stack = [unvisited.values().next().value];
      unvisited.delete(stack[0]);
      let count = 0, sumX = 0, sumZ = 0;
      while (stack.length) {
        const p = stack.pop();
        count++;
        sumX += p.x; sumZ += p.z;
        for (const q of unvisited) if (Math.hypot(p.x - q.x, p.z - q.z) < 1.12) {
          unvisited.delete(q); stack.push(q);
        }
      }
      groups.push(count);
      if(count >= 6) plantedShoulders.add([Math.sign(sumX/count-bridge.centerX),Math.sign(sumZ/count-bridge.z)].join(','));
    }
    assert.ok(groups.filter(n => n >= 6).length >= 4,
      `Nearby plants should touch in four substantial groups: seed=${seed}, cluster sizes=${groups.sort((a,b)=>b-a).slice(0,8)}`);
    assert.equal(plantedShoulders.size,4,'Both dry shoulders of each abutment need their own cluster');
    const planSnapshot = structuredClone(forestProps.placements);
    assert.ok(groundProps.shrubFootprints.length > 0 && groundProps.shrubFootprints.length <= 6,
      'River and compound clearances may reject shrub plots without exceeding the six-plot budget');
    assert.equal(groundProps.shrubFootprints, forestProps.authoredShrubs.selected);
    const baseline = grass.createGroundCoverPlacements({ ...groundProps, shrubFootprints: undefined });
    const composed = grass.createGroundCoverPlacements(groundProps);
    // These are actual instantiated placements and measured geometry extents, not an origin-only scatter test.
    // Project onto the rendered planks' local frame. Leave the deck and its first 2m of gravel approach clear.
    const gap = p => {
      const dx = p.x - bridge.centerX, dz = p.z - bridge.z, c = Math.cos(bridge.rotation), s = Math.sin(bridge.rotation);
      return Math.hypot(Math.max(0, Math.abs(dx*c - dz*s) - bridge.length/2 - 2),
        Math.max(0, Math.abs(dx*s + dz*c) - bridge.width/2));
    };
    const overlaps = Object.fromEntries(Object.entries(leafRadii).map(([key, radius]) =>
      [key, forestProps.placements[key].filter(p => gap(p) <= (radius + .04)*Math.max(p.sx,p.sz)).length]));
    overlaps.grass = composed.flatMap(c => c.placements).filter(p => gap(p) <= (grassRadius + .43 + .052) * p.width).length;
    overlaps.reeds = createRiverReeds(createRiverStations(seed), seed).filter(p => gap(p) <= .74*Math.max(p.scaleX,p.scaleZ)).length;
    assert.ok(Object.values(overlaps).every(n => n === 0), `Planks or approach overlap, seed ${seed}: ${JSON.stringify(overlaps)}`);
    assert.deepEqual(composed, grass.createGroundCoverPlacements(groundProps), 'Composition stays repeatable');
    assert.deepEqual(forestProps.placements, planSnapshot, 'Ground cover cannot mutate the shared forest plan');
    assert.equal(composed.length, 9);
    const footprints = grass.createAuthoredShrubGrassFootprints(groundProps.shrubFootprints);
    for (let i = 0; i < footprints.length; i++) {
      const footprint = footprints[i];
      const matrix = plants.composeAuthoredJungleMatrix(new THREE.Matrix4(), groundProps.shrubFootprints[i], 'shrub');
      const scale = new THREE.Vector3().setFromMatrixScale(matrix);
      assert.ok(Math.abs(footprint.radius - scale.y * grass.AUTHORED_SHRUB_RADIUS_PER_HEIGHT) < 1e-12);
      assert.equal(grass.authoredShrubGrassHeightScale(footprint.x, footprint.z, [footprint]), 0.24);
      assert.equal(grass.authoredShrubGrassHeightScale(footprint.x + footprint.radius + 0.331, footprint.z, [footprint]), 1);
      const samples = [0, 0.7, 1.4, 2.1].map(angle => grass.authoredShrubGrassHeightScale(
        footprint.x + Math.cos(angle) * (footprint.radius + 0.125),
        footprint.z + Math.sin(angle) * (footprint.radius + 0.125), [footprint]));
      assert.ok(Math.max(...samples) - Math.min(...samples) > 0.01, 'Feather must be irregular, not a repeated bald circle');
    }
    let changed = 0, total = 0;
    for (let chunk = 0; chunk < composed.length; chunk++) {
      assert.equal(composed[chunk].placements.length, baseline[chunk].placements.length);
      for (let i = 0; i < composed[chunk].placements.length; i++) {
        const before = baseline[chunk].placements[i], after = composed[chunk].placements[i];
        total++;
        assert.deepEqual({ ...after, height: before.height }, before, 'Only height may change; keep XZ/Y/width/rotation/tint/priority identical');
        if (after.height !== before.height) {
          changed++;
          assert.ok(after.height < before.height && after.height >= before.height * 0.24 - 1e-12);
          assert.ok(footprints.some(p => Math.hypot(p.x - after.x, p.z - after.z) < p.radius + 0.331), 'Outside every feather, grass is byte-for-byte unchanged');
        }
      }
    }
    assert.equal(total, 10000);
    assert.ok(changed >= 6 && changed <= 80, `Only a small local population should change, got ${changed}`);
    counts.push({ seed, shrubs: footprints.length, grassClumps: total, shortened: changed });
    await render(null);
    resetCalls();
    await render(React.createElement(JungleProbe, forestProps));
    assert.deepEqual(calls, { scatter: 0, select: 0 }, 'DenseJungle must consume the supplied plan without fallback rescatter/selection');
    assert.ok(jungleTree);
    await render(null);
    assert.equal(subscribers.size, 0, 'Jungle wind subscription is cleaned on exit');
    resetCalls();
    await render(React.createElement(JungleProbe, { ...forestProps, placements: undefined, authoredShrubs: undefined }));
    assert.deepEqual(calls, { scatter: 1, select: 1 }, 'Standalone DenseJungle retains its deterministic fallback');
    await render(null);
  }
} finally {
  await render(null);
  THREE.TextureLoader.prototype.load = originalTextureLoad;
  urls.forEach(url => useLoader.clear(THREE.TextureLoader, url));
  textures.forEach(texture => texture.dispose());
  delete globalThis.__jungleCompositionCalls;
}
console.log('Shared jungle composition checks passed:', JSON.stringify(counts));
