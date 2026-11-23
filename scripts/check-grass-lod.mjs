import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import React from 'react';
import { act, context, extend, reconciler } from '@react-three/fiber';
import ts from 'typescript';

const modules = new Map();
async function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = (async () => {
    let { outputText } = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    });
    // The real component remains DEV-gated; emulate Vite's DEV replacement for
    // this headless lifecycle test, not a different implementation of the LOD.
    if (url.pathname.endsWith('/DenseGroundCover.tsx')) outputText = outputText.replaceAll('import.meta.env.DEV', 'true');
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
const { ROAD_GRID_SPACING } = await load('../src/lib/constants.ts');
const near = grass.createGroundCoverGeometry(), far = grass.createGroundCoverGeometry('far');
assert.equal(near.index.count / 3, 17);
assert.equal(far.index.count / 3, 4);
assert.equal(near.attributes.position.count, 37, '51 submitted corners can reuse 37 local vertices per near clump');
assert.equal(far.attributes.position.count, 8);
for (const geo of [near, far]) {
  const flat = geo.toNonIndexed();
  const indexedNormals = flat.attributes.normal.clone();
  flat.computeVertexNormals();
  for (let i = 0; i < indexedNormals.array.length; i++)
    assert.ok(Math.abs(indexedNormals.array[i] - flat.attributes.normal.array[i]) < 0.000002,
      'Indexing a planar segment must preserve its original flat normal, including both sides of each blade fold');
  flat.dispose();
}
assert.deepEqual(Object.keys(near.attributes), Object.keys(far.attributes), 'LOD must not change shader attribute requirements');
assert.ok(near.boundingBox.containsBox(far.boundingBox), 'Near culling bounds must contain every far vertex');
const nearEndpoints = new Set();
for (let i = 0; i < near.attributes.position.count; i++) {
  if (near.attributes.coverSurface.getX(i) !== 1) continue;
  nearEndpoints.add([near.attributes.position.getX(i), near.attributes.position.getY(i), near.attributes.position.getZ(i),
    near.attributes.uv.getX(i), near.attributes.uv.getY(i)].join('/'));
}
for (const attribute of Object.values(far.attributes)) assert.ok(attribute.array.every(Number.isFinite));
for (let i = 0; i < far.attributes.position.count; i++) {
  assert.equal(far.attributes.coverSurface.getX(i), 1, 'Far mesh uses the unchanged photographic alpha surface');
  assert.equal(far.attributes.color.getX(i), 1); assert.equal(far.attributes.color.getY(i), 1); assert.equal(far.attributes.color.getZ(i), 1);
  assert.ok(nearEndpoints.has([far.attributes.position.getX(i), far.attributes.position.getY(i), far.attributes.position.getZ(i),
    far.attributes.uv.getX(i), far.attributes.uv.getY(i)].join('/')), 'Card endpoint and UV must match the near mesh');
  assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(far.attributes.normal, i).length() - 1) < 1e-6);
}
for (let i = 0; i < far.index.count; i += 3) {
  const a = new THREE.Vector3().fromBufferAttribute(far.attributes.position, far.index.getX(i));
  const b = new THREE.Vector3().fromBufferAttribute(far.attributes.position, far.index.getX(i + 1));
  const c = new THREE.Vector3().fromBufferAttribute(far.attributes.position, far.index.getX(i + 2));
  assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-8);
}
assert.equal(grass.grassLodReviewEnabled(false, '?grassLodReview'), false, 'Production cannot enable the candidate through its URL');
assert.equal(grass.grassLodReviewEnabled(true, ''), false);
assert.equal(grass.grassLodReviewEnabled(true, '?sceneReview=1&grassLodReview'), true);
assert.equal(grass.grassChunkUsesFarGeometry(false, 60 ** 2, true), false);
assert.equal(grass.grassChunkUsesFarGeometry(false, 60.01 ** 2, true), true);
assert.equal(grass.grassChunkUsesFarGeometry(true, 52 ** 2, true), true);
assert.equal(grass.grassChunkUsesFarGeometry(true, 51.99 ** 2, true), false);
assert.equal(grass.grassChunkUsesFarGeometry(true, 100 ** 2, false), false);
assert.equal(grass.grassChunkUsesFarGeometry(true, Number.NaN, true), false);
assert.equal(grass.grassChunkDistanceSquared({ x: 48, z: 48 }, 0, 0), 24 ** 2 * 2,
  'Distance is measured to the nearest whole-chunk edge, not its center');

const rules = { distanceToRoad: value => Math.abs(((value + ROAD_GRID_SPACING / 2) % ROAD_GRID_SPACING
  + ROAD_GRID_SPACING) % ROAD_GRID_SPACING - ROAD_GRID_SPACING / 2),
isInsideObjectiveClearing: (x, z, padding = 0) => Math.abs(x) < 10 + padding && z > 25 - padding && z < 40 + padding,
isInsidePaddy: (x, z, padding = 0) => Math.abs(x) < 12 + padding && z > -16 - padding && z < 7 + padding };
const budgets = [];
for (const seed of [1968, 70921, 1234, 4277391332]) {
  const chunks = grass.createGroundCoverPlacements({ ...rules, seed });
  assert.equal(chunks.length, 9); assert.equal(chunks.reduce((sum, c) => sum + c.placements.length, 0), 10000);
  const original = structuredClone(chunks);
  for (const [x, z] of [[0, -12], [20, -20], [36, -30], [48, 0], [-48, -48], [64, 64]]) {
    let oldTriangles = 0, candidateTriangles = 0, draws = 0;
    for (const chunk of chunks) {
      const distance = grass.grassChunkDistanceSquared(chunk, x, z);
      if (distance >= 86 ** 2) continue;
      draws++; oldTriangles += chunk.placements.length * 17;
      candidateTriangles += chunk.placements.length * (grass.grassChunkUsesFarGeometry(false, distance, true) ? 4 : 17);
    }
    assert.ok(draws <= 9); assert.ok(candidateTriangles <= oldTriangles);
    if (x === 0 && z === -12) assert.equal(candidateTriangles, oldTriangles, 'Central close grass cannot lose detail');
    if (x === -48 && z === -48) assert.ok(oldTriangles - candidateTriangles > 30000, 'Edge-sector geometry savings must be meaningful');
    if (seed === 4277391332) budgets.push({ camera: [x, z], draws, oldTriangles, candidateTriangles });
  }
  assert.deepEqual(chunks, original, 'LOD calculations cannot change density, placement, tint or scale');
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend({ Group: THREE.Group, InstancedMesh: THREE.InstancedMesh });
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
const subscribers = new Set();
const state = { scene, camera, internal: { active: false, frames: 0, interaction: [], initialHits: [], hovered: new Map(), capturedMap: new Map(),
  subscribe(ref) { subscribers.add(ref); return () => subscribers.delete(ref); } }, invalidate() {} };
const store = { getState: () => state, getInitialState: () => state, subscribe: () => () => {} };
scene.__r3f = { root: store, type: 'scene', parent: null, children: [], props: {}, object: scene, eventCount: 0, handlers: {}, isHidden: false };
const fail = error => { throw error; };
const root = reconciler.createContainer(store, 1, null, false, null, '', fail, fail, fail, null);
const map = new THREE.Texture();
const time = { value: 0 }, tank = { value: new THREE.Vector3() };
const rotor = {value:new THREE.Vector4(-10,0,1,8)};
const material = grass.createGroundCoverMaterial(time, tank, map, rotor);
const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
material.onBeforeCompile(shader, null);
assert.equal(shader.uniforms.coverTime, time); assert.equal(shader.uniforms.coverTank, tank);
assert.equal(shader.uniforms.rotorGust, rotor);
assert.match(shader.vertexShader, /coverLocalAway \* coverBend \* coverTip/);
assert.match(shader.fragmentShader, /vCoverVisibility < 0\.012/);
for (const displacement of ['coverTip * coverTip * 0.045','coverTip * 0.025','mix(bendOffset,local*coverTip*coverTip,gust)','bendOffset * 0.43'])
  assert.ok(shader.vertexShader.includes(displacement),'Keep the geometric wind/bend oracle in sync with the actual shader');
const chunk = { x: 0, z: 0, placements: [{ x: 0, y: 0, z: 0, rotation: 1.2, width: 1.1, height: 0.8, tint: 0.9 }] };
const render = element => act(async () => reconciler.updateContainer(React.createElement(context.Provider, { value: store }, element), root, null, null));
const frame = x => { camera.position.set(x, 2, 0); for (const ref of subscribers) ref.current({ camera, clock: { elapsedTime: 2 } }, 1 / 60); };
await render(React.createElement(grass.GroundCoverChunk, { chunk, geometry: near, farGeometry: far, material }));
const mesh = scene.children[0], matrixBuffer = mesh.instanceMatrix, colorBuffer = mesh.instanceColor;
const matrixBytes = [...matrixBuffer.array], colorBytes = [...colorBuffer.array];
const matrixVersion = matrixBuffer.version, colorVersion = colorBuffer.version;
const bounds = mesh.boundingBox.clone(), sphere = mesh.boundingSphere.clone();
mesh.setMatrixAt = () => { throw new Error('LOD must not rewrite instance matrices'); };
mesh.setColorAt = () => { throw new Error('LOD must not rewrite instance colors'); };
mesh.computeBoundingBox = mesh.computeBoundingSphere = () => { throw new Error('LOD must reuse conservative near bounds'); };
assert.equal(subscribers.size, 1, 'One existing chunk callback handles culling and LOD');
for (const [cameraX, expected] of [[0, near], [84, near], [85, far], [82, far], [76, far], [75, near], [90, far]]) {
  frame(cameraX); assert.equal(scene.children[0], mesh); assert.equal(mesh.geometry, expected);
  assert.equal(mesh.instanceMatrix, matrixBuffer); assert.equal(mesh.instanceColor, colorBuffer);
  assert.equal(matrixBuffer.version, matrixVersion); assert.equal(colorBuffer.version, colorVersion);
  assert.deepEqual([...matrixBuffer.array], matrixBytes); assert.deepEqual([...colorBuffer.array], colorBytes);
  assert.ok(mesh.boundingBox.equals(bounds)); assert.ok(mesh.boundingSphere.equals(sphere));
}
material.map = null; frame(90); assert.equal(mesh.geometry, near, 'Missing atlas must keep solid-blade fallback rather than invisible cards');
material.map = map; frame(90); assert.equal(mesh.geometry, far);
await render(React.createElement(grass.GroundCoverChunk, { chunk, geometry: near, material }));
frame(90); assert.equal(mesh.geometry, near, 'Disabling the candidate restores close geometry without reconstructing instances');
let borrowedDisposals = 0; for (const resource of [near, far, material]) resource.addEventListener('dispose', () => borrowedDisposals++);
await render(null); assert.equal(scene.children.length, 0); assert.equal(subscribers.size, 0); assert.equal(borrowedDisposals, 0);
await render(React.createElement(grass.GroundCoverChunk, { chunk, geometry: near, farGeometry: far, material }));
assert.equal(scene.children[0].geometry, near, 'Restart begins in a clean near state');
await render(null);

// Exercise the actual parent's resource owner and all nine child subscriptions.
const oldWindow = globalThis.window;
globalThis.window = { location: { search: '?grassLodReview' } };
let mapDisposals = 0; map.addEventListener('dispose', () => mapDisposals++);
try {
  await render(React.createElement(grass.DenseGroundCover, { ...rules, seed: 1968, grassMap: map }));
  const batches = [];
  scene.traverse(object => { if (object.isInstancedMesh) batches.push(object); });
  assert.equal(batches.length, 9); assert.equal(subscribers.size, 10, 'No additional callbacks beyond existing nine chunks and shared wind clock');
  const ownedNear = batches[0].geometry, ownedMaterial = batches[0].material;
  frame(48);
  const ownedFar = batches.find(batch => batch.geometry !== ownedNear)?.geometry;
  assert.ok(ownedFar); assert.equal(ownedFar.index.count / 3, 4);
  let cleanup = 0; for (const resource of [ownedNear, ownedFar, ownedMaterial]) resource.addEventListener('dispose', () => cleanup++);
  await render(null); assert.equal(cleanup, 3); assert.equal(subscribers.size, 0); assert.equal(mapDisposals, 0);
} finally { globalThis.window = oldWindow; }

// Exercise real Three batch callbacks using the perspective/lens in Scene. The
// comparison reproduces the former nine spheres (matrix insertion order and
// radius pad included). These are CPU-derived submissions, not GPU timings.
await render(React.createElement(grass.DenseGroundCover, { ...rules, seed: 4277391332, grassMap: map }));
const plans = grass.createGroundCoverPlacements({ ...rules, seed: 4277391332 });
const batches = scene.children[0].children;
const transform = new THREE.Object3D(), matrix = new THREE.Matrix4(), tint = new THREE.Color();
const xyz = (x,z) => [Math.fround(x),Math.fround(z)].join(':');
const reference = plans.map((plan,i) => {
  const batch = batches[i], full = plan.placements.length;
  const old = new THREE.InstancedMesh(near, material, full), byPosition = new Map();
  for (const [j,p] of plan.placements.entries()) {
    transform.position.set(p.x,p.y,p.z); transform.rotation.set(0,p.rotation,0);
    transform.scale.set(p.width,p.height,p.width); transform.updateMatrix();
    old.setMatrixAt(j,transform.matrix);
    old.setColorAt(j,tint.setRGB(p.tint*.98,p.tint,p.tint*.94));
    byPosition.set(xyz(p.x,p.z), j);
  }
  old.computeBoundingSphere(); old.boundingSphere.radius += 1;
  const oracleBounds = [];
  for (let j=0; j<full; j++) {
    batch.getMatrixAt(j,matrix);
    const key = xyz(matrix.elements[12],matrix.elements[14]), k=byPosition.get(key);
    assert.notEqual(k,undefined,'A seeded tuft cannot move or appear twice'); byPosition.delete(key);
    assert.deepEqual(matrix.elements,[...old.instanceMatrix.array.subarray(k*16,k*16+16)]);
    assert.deepEqual([...batch.instanceColor.array.subarray(j*3,j*3+3)],[...old.instanceColor.array.subarray(k*3,k*3+3)]);
    // Independent vertex envelope: transform every real near vertex (which
    // includes every far endpoint), at full/collapsed height and extreme bend.
    const b = new THREE.Box3(), point = new THREE.Vector3(), pos = near.attributes.position;
    for (let v=0;v<pos.count;v++) {
      const tip = Math.min(1,Math.max(0,pos.getY(v)/.58));
      const dx = .045*tip*tip+.43*tip, dz=.025*tip+.43*tip;
      for (const sx of [-1,1]) for (const sz of [-1,1]) for (const h of [0,pos.getY(v)])
        b.expandByPoint(point.set(pos.getX(v)+sx*dx,h,pos.getZ(v)+sz*dz).applyMatrix4(matrix));
    }
    oracleBounds.push(b);
  }
  assert.equal(byPosition.size,0);
  return {old,oracleBounds, matrixVersion:batch.instanceMatrix.version,colorVersion:batch.instanceColor.version};
});
const positions = {
  Chase:[[2,3.8,6.14],[1.12,2.75,-1.28]], Embassy:[[0,5,-13],[0,3,-26]],
  Bridge:[[9,5,9],[0,0,17]], River:[[-14,4,-23],[-24,0,-16]], Village:[[20,8,8],[0,1.5,29]],
  Edge:[[53,3,-42],[76,6,-44]], Corner:[[54,3,52],[78,7,76]], Layout:[[18,95,-22],[0,0,0]],
  Napalm:[[-7,5,-1],[0,1.5,8]], Reverse:[[2,3.8,6.14],[3,2.75,13.56]],
};
camera.fov=60; camera.aspect=16/9;camera.near=.1;camera.far=340;camera.updateProjectionMatrix();
scene.updateMatrixWorld();
const frustum=new THREE.Frustum(), clip=new THREE.Matrix4(), submissions=[];
for (const [view,[eye,target]] of Object.entries(positions)) {
  camera.position.set(...eye);camera.lookAt(...target);camera.updateMatrixWorld();
  for (const ref of subscribers) ref.current({camera,clock:{elapsedTime:2}},1/60);
  frustum.setFromProjectionMatrix(clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem);
  let beforeDraws=0,draws=0,beforeTriangles=0,triangles=0;
  for (const [i,batch] of batches.entries()) {
    const {old,oracleBounds,matrixVersion,colorVersion}=reference[i], full=oracleBounds.length;
    if (!batch.visible) continue; // unchanged distance policy
    if (frustum.intersectsObject(old)) {beforeDraws++;beforeTriangles+=17*full;}
    const inside=frustum.intersectsObject(batch);
    if (inside) batch.onBeforeRender(null,scene,camera,batch.geometry,batch.material,null);
    const count=inside?batch.count:0;
    if (count>0) {draws++;triangles+=17*count;}
    for (let j=count;j<full;j++) assert.equal(frustum.intersectsBox(oracleBounds[j]),false,
      view+': a culled tuft could contribute a pixel at maximum wind or tank bend');
    assert.equal(batch.instanceMatrix.version,matrixVersion);assert.equal(batch.instanceColor.version,colorVersion);
    assert.equal(batch.geometry.index.count/3,17,'Production geometry must not switch detail to meet this budget');
  }
  submissions.push({view,beforeDraws,draws,beforeTriangles,triangles});
}
const sum=k=>submissions.reduce((n,row)=>n+row[k],0);
assert.ok(sum('draws')<=sum('beforeDraws'));
assert.ok(sum('triangles')<sum('beforeTriangles')*.85,'Unchanged near-detail grass should reject material work across the camera fixture');
console.log('Grass-only CPU submission fixture:',JSON.stringify({poses:submissions,
  total:{beforeDraws:sum('beforeDraws'),draws:sum('draws'),beforeTriangles:sum('beforeTriangles'),triangles:sum('triangles')}}));
// Same pass can render with another camera or with a repositioned parent.
// A previously zero-length draw must resume immediately without buffer edits.
const batch=batches[4], ref=reference[4], parent=batch.parent;
const auditPass=(passCamera)=>{
  scene.updateMatrixWorld(); passCamera.updateMatrixWorld();
  clip.multiplyMatrices(passCamera.projectionMatrix,passCamera.matrixWorldInverse).multiply(batch.matrixWorld);
  frustum.setFromProjectionMatrix(clip,passCamera.coordinateSystem,passCamera.reversedDepth);
  batch.onBeforeRender(null,scene,passCamera,batch.geometry,batch.material,null);
  for (let j=batch.count;j<ref.oracleBounds.length;j++) assert.equal(frustum.intersectsBox(ref.oracleBounds[j]),false);
  assert.equal(batch.instanceMatrix.version,ref.matrixVersion);assert.equal(batch.instanceColor.version,ref.colorVersion);
};
const toolCamera=new THREE.OrthographicCamera(-32,32,32,-32,.1,200);
toolCamera.position.set(0,5,100);toolCamera.lookAt(0,5,0);auditPass(toolCamera);
assert.equal(batch.count,ref.oracleBounds.length);
parent.position.set(600,0,0);auditPass(toolCamera);assert.equal(batch.count,0);
parent.position.set(0,0,0);parent.rotation.y=1.2;parent.scale.set(.65,1,.65);auditPass(toolCamera);
assert.equal(batch.count,ref.oracleBounds.length);
for (const {old} of reference) old.dispose();
await render(null);
near.dispose(); far.dispose(); material.dispose(); map.dispose();
console.log('Grass LOD checks passed: DEV opt-in, 17/4 triangles, unchanged endpoints/alpha/attributes, 60/52m whole-chunk hysteresis, static buffer/bounds reuse, nine batches, atlas fallback, reset and owned-resource cleanup.');
console.log(JSON.stringify(budgets));
