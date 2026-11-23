// Offline derivative of public/models/us-infantry-head/LICENSE.md (CC0).
// Run with Node; only the compact, baked mesh enters the field actor bundle.
import assert from 'node:assert/strict';
import {readFile, writeFile, realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {inflateSync} from 'node:zlib';
import {bakePortraitChannels} from './field-portrait-planes.mjs';

const folder = new URL('../public/models/us-infantry-head/', import.meta.url);
const descriptor = JSON.parse(await readFile(new URL('us-male-head.gltf', folder), 'utf8'));
const bin = await readFile(new URL('us-male-head.bin', folder));
const png = await readFile(new URL('Aksel_Skin_diffuse.png', folder));
const primitive = descriptor.meshes.find(mesh => mesh.name === 'head-near').primitives[0];
function attribute(index) {
  const a = descriptor.accessors[index], view = descriptor.bufferViews[a.bufferView];
  const Type = a.componentType === 5126 ? Float32Array : Uint16Array;
  return new Type(bin.buffer, bin.byteOffset + view.byteOffset, view.byteLength / Type.BYTES_PER_ELEMENT);
}
const p = attribute(primitive.attributes.POSITION), n = attribute(primitive.attributes.NORMAL);
const uv = attribute(primitive.attributes.TEXCOORD_0), indices = Uint32Array.from(attribute(primitive.indices));
// The source is a noninterlaced RGB-alpha PNG. Reverse only its standard row
// filtering; UVs already point down from the top of the original atlas.
const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
assert.deepEqual([png[24], png[25], png[28]], [8, 6, 0]);
const idat = [];
for (let o = 8; o < png.length;) {
  const size = png.readUInt32BE(o);
  if (png.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + size));
  o += size + 12;
}
const filtered = inflateSync(Buffer.concat(idat)), rgba = Buffer.alloc(w * h * 4);
const stride = w * 4;
for (let y = 0; y < h; y++) {
  const start = y * (stride + 1), filter = filtered[start];
  assert.ok(filter <= 4);
  for (let i = 0; i < stride; i++) {
    const at = y * stride + i, a = i >= 4 ? rgba[at - 4] : 0, b = y ? rgba[at - stride] : 0;
    const c = y && i >= 4 ? rgba[at - stride - 4] : 0;
    const predictor = a + b - c, da = Math.abs(predictor-a), db = Math.abs(predictor-b), dc = Math.abs(predictor-c);
    const prediction = [0, a, b, (a + b) >> 1, da <= db && da <= dc ? a : db <= dc ? b : c][filter];
    rgba[at] = filtered[start + 1 + i] + prediction;
  }
}
const vertexCount = p.length / 3, color = new Uint8Array(vertexCount * 3);
const features = new Float32Array(vertexCount * 6);
for (let i = 0; i < vertexCount; i++) {
  const u = uv[2*i] * w, v = uv[2*i+1] * h;
  // Smooth pores/photographic noise, NOT the broad moustache, lip and brow
  // pigment. Vertex colors interpolate the remaining marks like washes.
  for (let c = 0; c < 3; c++) {
    let sum = 0, weight = 0;
    for (const dy of [-2, 0, 2]) for (const dx of [-2, 0, 2]) {
      const x = Math.max(0, Math.min(w - 1, Math.floor(u + dx)));
      const y = Math.max(0, Math.min(h - 1, Math.floor(v + dy)));
      const src = (y*w + x)*4, alpha = rgba[src + 3]/255;
      sum += rgba[src+c] * alpha; weight += alpha;
    }
    color[i*3+c] = Math.round(weight ? sum/weight : [172,126,104][c]);
    features[6*i+c] = n[3*i+c];
    features[6*i+3+c] = color[i*3+c]/255;
  }
}
// Use the same meshoptimizer dependency that ships with Three's installed
// typings. Attribute-aware reduction keeps lip/eyelid normals and pigmentation.
const typesRequire = createRequire(await realpath(new URL('../node_modules/@types/three/package.json', import.meta.url)));
const {MeshoptSimplifier: simplifier} = typesRequire('meshoptimizer');
await simplifier.ready; simplifier.useExperimentalFeatures = true;
const [tri] = simplifier.simplifyWithAttributes(indices, p, 3, features, 6, [.05,.05,.05,.12,.12,.12], null, 1760*3, 1);
const compact = new Map(), out = [], corners = [];
for (const id of tri) {
  if (!compact.has(id)) {
    compact.set(id, compact.size);
    const bytes = Buffer.alloc(12);
    for (let j = 0; j < 3; j++) {
      bytes.writeInt16LE(Math.round(p[3*id+j] * 100000), j*2);
      bytes.writeInt8(Math.round(n[3*id+j]*127), 6+j);
      bytes[9+j] = color[3*id+j];
    }
    out.push(bytes);
  }
  corners.push(compact.get(id));
}
assert.ok(corners.length / 3 <= 1760);
const faces = Buffer.alloc(corners.length * 2);
corners.forEach((v,i) => faces.writeUInt16LE(v, 2*i));
const dest = new URL('../src/components/Scene/bakedFieldPortrait.ts', import.meta.url);
// Retain the CC0 source's UV charts in the same compact-vertex order.
// In particular, an eyelid near the socket is not on the same UV island
// as a cornea. The new field material never guesses UV from a screenshot.
const uvBytes=Buffer.alloc(compact.size*4);
for(const [id,k] of compact) for(let j=0;j<2;j++)
  uvBytes.writeUInt16LE(Math.round(Math.max(0,Math.min(1,uv[2*id+j]))*65535),4*k+2*j);
await writeFile(new URL('../src/components/Scene/bakedFieldPortraitUV.ts',import.meta.url),
  '// Derived from identical compact indices in bakedFieldPortrait; MakeHuman/Mindfront Aksel, CC0.\nexport const PORTRAIT_UV16='+JSON.stringify(uvBytes.toString('base64'))+';\n');
const load=createRequire(import.meta.url);let sharp;try{sharp=load('sharp');}catch{sharp=createRequire(process.execPath)('sharp');}
// Neutral pigment relief, NOT a second lit photograph. Retain the physical
// folds, follicle pattern, brow and lower-lip grain at their measured UVs.
// The source is an injured character skin. Heal its unilateral orbital
// bruise from the opposite side before deriving the field actor's pigment.
const N=1024,gray=await sharp(png).removeAlpha().resize(N,N).greyscale().raw().toBuffer();
const healed=Buffer.from(gray);
for(let j=0;j<N;j++)for(let i=0;i<N;i++){
  const d=Math.hypot((2*i-1718)/97,(2*j-986)/129),mix=Math.min(1,Math.max(0,(1-d)/.32));
  if(mix)healed[j*N+i]=Math.round((1-mix)*gray[j*N+i]+mix*gray[Math.max(0,Math.min(N-1,Math.round(1058.5-j)))*N+i]);
}
const raw={width:N,height:N,channels:1}, blurred=await sharp(healed,{raw}).blur(5).greyscale().raw().toBuffer();
const broad=await sharp(healed,{raw}).blur(20).greyscale().raw().toBuffer();
const plate=Buffer.alloc(N*N,128);
for(let i=0;i<plate.length;i++){
  // Only face/scalp charts carry real skin pigment. Preserve a flat
  // neutral margin at the interior islands, so they cannot print an eye.
  if(i%N<.63*N||Math.floor(i/N)<.13*N||Math.floor(i/N)>.89*N)continue;
  plate[i]=Math.max(28,Math.min(223,Math.round(128+1.87*(healed[i]-blurred[i])+.95*(blurred[i]-broad[i])+.14*(broad[i]-149))));
}
const painted=bakePortraitChannels(p,uv,tri,N,plate);
await sharp(painted,{raw:{width:N,height:N,channels:3}}).png({compressionLevel:9}).toFile(new URL('../public/images/textures/field-portrait-wash-v1.png',import.meta.url).pathname);
await writeFile(dest, '// Generated by scripts/bake-field-portrait.mjs. MakeHuman/Mindfront Aksel, CC0.\n'
  + 'export const PORTRAIT_VERTICES = ' + JSON.stringify(Buffer.concat(out).toString('base64')) + ';\n'
  + 'export const PORTRAIT_TRIANGLES = ' + JSON.stringify(faces.toString('base64')) + ';\n');
console.log(`Portrait: ${compact.size} shared vertices, ${corners.length/3} skin triangles.`);
