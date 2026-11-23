// Offline CC0 source-to-game asset build. No model generation runs in gameplay.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import assert from 'node:assert/strict';

const here = new URL('../tmp/asset-source/makehuman/', import.meta.url);
const output = new URL('../public/models/us-infantry-head/', import.meta.url);
await mkdir(output, { recursive: true });
const source = await readFile(new URL('base.obj', here), 'utf8');
const positions = [], uvs = [], groups = new Map();
let group = '';
for (const line of source.split('\n')) {
  if (line.startsWith('v ')) positions.push(line.slice(2).trim().split(/\s+/).map(Number));
  else if (line.startsWith('vt ')) uvs.push(line.slice(3).trim().split(/\s+/).map(Number));
  else if (line.startsWith('g ')) { group = line.slice(2).trim(); groups.set(group, []); }
  else if (line.startsWith('f ')) groups.get(group).push(line.slice(2).trim().split(/\s+/)
    .map(corner => corner.split('/').map(Number)));
}
const target = gunzipSync(await readFile(new URL('caucasian-male-young.target.gz', here))).toString();
for (const line of target.split('\n')) {
  if (!/^\d/.test(line)) continue;
  const [index, x, y, z] = line.split(/\s+/).map(Number);
  positions[index][0] += x; positions[index][1] += y; positions[index][2] += z;
}

// Retain the author's facial topology and UV seams. Cut at the narrow neck,
// below the chin; the resulting open neck sits inside the game's collar.
const neckY = 6.8;
const neckCenterZ = 0.1503;
const faces = groups.get('body').filter(face => face.every(corner => positions[corner[0] - 1][1] >= neckY));
const vertices = new Map(), xyz = [], tex = [], indices = [];
for (const face of faces) {
  const corners = face.map(([p, t]) => {
    const key = `${p}/${t}`;
    if (!vertices.has(key)) {
      vertices.set(key, vertices.size);
      const [x, y, z] = positions[p - 1];
      // Native decimetres -> metres, +Z authoring face -> game's -Z forward.
      xyz.push(-x * 0.1, (y - neckY) * 0.1, -(z - neckCenterZ) * 0.1);
      tex.push(uvs[t - 1][0], 1 - uvs[t - 1][1]);
    }
    return vertices.get(key);
  });
  for (let i = 1; i < corners.length - 1; i++) indices.push(corners[0], corners[i], corners[i + 1]);
}
// Whole-quad selection leaves a sawtooth neck edge. Extend only its open lower
// boundary into the collar, preserving every facial vertex and UV pairing.
// Count source-position edges, not UV-split edges, to avoid touching UV seams.
const edgeUses = new Map();
for (const face of faces) for (let i = 0; i < face.length; i++) {
  const a = face[i][0], b = face[(i + 1) % face.length][0];
  const key = a < b ? `${a}/${b}` : `${b}/${a}`;
  edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
}
const neckBoundary = new Set();
for (const [edge, count] of edgeUses) if (count === 1) {
  const endpoints = edge.split('/').map(Number);
  if (endpoints.every(id => positions[id - 1][1] < neckY + 0.5)) endpoints.forEach(id => neckBoundary.add(id));
}
for (const [key, index] of vertices) if (neckBoundary.has(Number(key.split('/')[0]))) xyz[index * 3 + 1] = -0.008;
assert.ok(neckBoundary.size > 10, 'The collar seam must include the complete lower neck boundary');
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
geometry.setAttribute('uv', new THREE.Float32BufferAttribute(tex, 2));
geometry.setIndex(indices);
geometry.computeVertexNormals(); geometry.computeBoundingBox();

// Averaging across only identical authored position IDs keeps UV seams smooth
// without welding across the lips, eyelids, or the neck boundary.
const normalsByPosition = new Map();
for (const [key, index] of vertices) {
  const position = key.split('/')[0];
  if (!normalsByPosition.has(position)) normalsByPosition.set(position, new THREE.Vector3());
  normalsByPosition.get(position).add(new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, index));
}
for (const [key, index] of vertices) {
  const n = normalsByPosition.get(key.split('/')[0]).clone().normalize();
  geometry.attributes.normal.setXYZ(index, n.x, n.y, n.z);
}
const far = new SimplifyModifier().modify(geometry, 3000);
far.computeBoundingBox(); far.computeBoundingSphere();
for (const g of [geometry, far]) {
  for (const name of ['position', 'normal', 'uv']) assert.ok(g.getAttribute(name).array.every(Number.isFinite));
}
assert.ok(far.index.count / 3 >= 2000 && far.index.count / 3 <= 3000, 'Far head must meet its 2–3k triangle budget');
const views = [], buffers = [], accessors = [], meshes = [];
let byteLength = 0;
for (const [level, g] of [geometry, far].entries()) {
  const ids = [];
  for (const [index, array] of [g.attributes.position.array, g.attributes.normal.array,
    g.attributes.uv.array, new Uint16Array(g.index.array)].entries()) {
    const padding = (4 - byteLength % 4) % 4;
    if (padding) { buffers.push(Buffer.alloc(padding)); byteLength += padding; }
    views.push({ buffer: 0, byteOffset: byteLength, byteLength: array.byteLength });
    buffers.push(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    byteLength += array.byteLength;
    const accessor = { bufferView: views.length - 1, componentType: index === 3 ? 5123 : 5126,
      count: array.length / (index === 2 ? 2 : index === 3 ? 1 : 3),
      type: index === 2 ? 'VEC2' : index === 3 ? 'SCALAR' : 'VEC3' };
    if (index === 0) { accessor.min = g.boundingBox.min.toArray(); accessor.max = g.boundingBox.max.toArray(); }
    ids.push(accessors.length); accessors.push(accessor);
  }
  meshes.push({ name: level === 0 ? 'head-near' : 'head-far',
    primitives: [{ attributes: { POSITION: ids[0], NORMAL: ids[1], TEXCOORD_0: ids[2] }, indices: ids[3], material: 0 }] });
}
const gltf = {
  asset: { version: '2.0', generator: 'Tank Delete offline CC0 infantry head build' },
  scene: 0, scenes: [{ nodes: [0, 1] }],
  nodes: [{ name: 'head-near', mesh: 0 }, { name: 'head-far', mesh: 1 }], meshes,
  materials: [{ name: 'Mindfront Aksel CC0 diffuse only', pbrMetallicRoughness: {
    baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.88 } }],
  textures: [{ sampler: 0, source: 0 }], images: [{ uri: 'Aksel_Skin_diffuse.png' }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  buffers: [{ uri: 'us-male-head.bin', byteLength }], bufferViews: views, accessors,
};
const sourcePaths = ['base.obj', 'caucasian-male-young.target.gz',
  'skins/mindfront_aksel_skin/Aksel_Skin_diffuse.png'];
const files = [];
for (const path of sourcePaths) {
  const bytes = await readFile(new URL(path, here));
  files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const skinRecord = JSON.parse(await readFile(new URL('packs/skins02.json', here), 'utf8')).mindfront_aksel_skin;
assert.equal(skinRecord.license, 'CC0', 'The exact selected skin must have its own CC0 record');
const report = { license: 'CC0-1.0',
  sourceMesh: 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj',
  sourceMorph: 'https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/targets/macrodetails/caucasian-male-young.target.gz',
  sourceSkinPack: 'https://files2.makehumancommunity.org/asset_packs/skins02/skins02_cc0.zip',
  skinLicenseEvidence: 'https://static.makehumancommunity.org/assets/assetpacks/skins02.html',
  meshMorphLicenseEvidence: 'https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md',
  skin: { asset: 'mindfront_aksel_skin', author: skinRecord.author, license: skinRecord.license, source: skinRecord.source },
  sourceVertices: positions.length, sourceBodyQuads: groups.get('body').length,
  headQuads: faces.length, headTriangles: indices.length / 3, headUvSplitVertices: xyz.length / 3,
  farTriangles: far.index.count / 3, farVertices: far.attributes.position.count,
  neckBoundaryVertices: neckBoundary.size, neckBoundaryY: -0.008,
  binaryBytes: byteLength, dimensionsMetres: geometry.boundingBox.getSize(new THREE.Vector3()).toArray(),
  boundsMetres: { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() },
  textures: { diffuse: [2048, 2048], normalNotUsed: true, specularNotUsed: true }, files };
await writeFile(new URL('us-male-head.bin', output), Buffer.concat(buffers));
await writeFile(new URL('us-male-head.gltf', output), JSON.stringify(gltf, null, 2));
await writeFile(new URL('provenance.json', output), JSON.stringify(report, null, 2));
await copyFile(new URL('skins/mindfront_aksel_skin/Aksel_Skin_diffuse.png', here), new URL('Aksel_Skin_diffuse.png', output));
await copyFile(new URL('LICENSE-ASSETS.md', here), new URL('LICENSE-CC0.txt', output));
geometry.dispose(); far.dispose();
console.log(JSON.stringify(report, null, 2));
