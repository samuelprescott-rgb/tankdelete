import assert from 'node:assert/strict';
import {checkTrestleTrace} from './verify-trestle-reflection.mjs';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
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
      if(match[2].endsWith('?url')){
        const asset=new URL(match[2].slice(0,-4),url);
        await access(asset);
        const exported='export default '+JSON.stringify(asset.href);
        outputText=outputText.replace(match[0],`from 'data:text/javascript;base64,${Buffer.from(exported).toString('base64')}'`);
        continue;
      }
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
const river = await load('../src/components/Scene/riverLayout.ts');
const sceneModule = await load('../src/components/Scene/VietnamEnvironment.tsx');
const {createWetlandWaterMaterial}=await load('../src/components/Scene/wetlandGeometry.ts');
const { paintBridgeTimber } = await load('../src/components/Scene/bridgeTimber.ts');
const {trestleReflection,trestleMirrorGLSL}=await load('../src/components/Scene/trestleReflection.ts');
const {RIVER_WATER_Y,bridgeRise} = await load('../src/components/Scene/riverVerticalSection.ts');
const {createLandingContact,fieldBuildingDamage}=await load('../src/lib/fieldBuildings.ts');
const { createRiverLanding,riverLandingSite } = await load('../src/components/Scene/riverLanding.ts');
const { bakeCrossingReflections } = await load('../src/components/Scene/ghostSignalCrossing.ts');
const { TERRAIN_MOUNDS,intersectsTerrainMound } = await load('../src/lib/terrain.ts');
const {tankFootprintBlocked} = await load('../src/lib/tankFootprint.ts');
const {createTankGroundProfile} = await load('../src/lib/tankGroundProfile.ts');
const { layoutFilesInGrid } = await load('../src/lib/layout.ts');
const { FILE_OBJECTIVE_RESERVED_ZONE } = await load('../src/lib/mission.ts');
const originalTerrain = structuredClone(TERRAIN_MOUNDS), summaries = [];
const sampleSeeds = [0, 1, 1968, 70921, 1234, 4277391332, -1968, Number.MAX_SAFE_INTEGER];
for (const seed of sampleSeeds) {
  const stations = river.createRiverStations(seed), saved = structuredClone(stations);
  assert.deepEqual(stations, river.createRiverStations(seed));
  const site=riverLandingSite(stations),contact=createLandingContact(site),ruin=createRiverLanding(stations,true);
  const shorePoint=(x,y,z)=>({x:site.cx+x*Math.cos(site.yaw)+z*Math.sin(site.yaw),y,z:site.z-x*Math.sin(site.yaw)+z*Math.cos(site.yaw)});
  for(const height of [.25,2.72,3.7])assert.ok(contact(shorePoint(0,height,-6),shorePoint(0,height,6))!==null);
  assert.equal(contact(shorePoint(0,4.5,-6),shorePoint(0,4.5,6)),null,'shots above the roof stay clear');
  assert.equal(contact(shorePoint(3.5,2,-6),shorePoint(3.5,2,6)),null,'side miss');
  ruin.computeBoundingBox();assert.ok(ruin.boundingBox.max.y<.55);ruin.dispose();
  assert.equal(fieldBuildingDamage(fieldBuildingDamage(2,'cannon'),'cannon'),0);
  assert.equal(stations.length, 140,'97 original stations, 21 foreground and 22 downstream transects');
  assert.equal(stations[0].z, -64); assert.equal(stations.at(-1).z, 64);
  assert.ok(Math.max(...stations.map(s => s.centerX)) - Math.min(...stations.map(s => s.centerX)) > 30, 'River must visibly meander, not recreate a straight edge canal');
  assert.ok(sceneModule.riverTerrainClearance(stations), `Bank envelope intersects a hill for seed ${seed}`);
  assert.ok(river.sampleRiverStation(stations,17).waterHalfWidth*2 > 9.3,'The marked village bend opens into a real backwater');
  let changesOfDirection = 0, previousDirection = 0;
  for (let i = 1; i < stations.length; i++) {
    const s = stations[i], previous = stations[i - 1];
    assert.ok(Object.values(s).every(Number.isFinite));
    const inReach = s.z>6 && s.z<28;
    const forePool=s.z>=3.5&&s.z<=11;
    const outlet=s.z>13&&s.z<43;
    assert.ok(s.z > previous.z && s.waterHalfWidth > 1.055 && s.waterHalfWidth < (outlet?14:forePool?5.9:inReach?5.39:2.05));
    assert.ok(s.mudHalfWidth > s.waterHalfWidth + 0.58 && s.mudHalfWidth < s.waterHalfWidth+1.17,'Silt fans take at most .31 metres inward from the old, reserved shore');
    assert.ok(Math.abs(s.waterHalfWidth - previous.waterHalfWidth) < (outlet?2.65:.95),'Tapered inlet: '+[s.z,s.waterHalfWidth,previous.waterHalfWidth]);
    assert.ok(Math.abs(s.centerX - previous.centerX) < 3.7, 'Bank slope stays bounded');
    const direction = Math.sign(s.centerX - previous.centerX);
    if (previousDirection && direction !== previousDirection) changesOfDirection++;
    previousDirection = direction;
  }
  assert.ok(changesOfDirection >= 3);
  for (let z = -64; z <= 64; z += 0.25) {
    const station = river.sampleRiverStation(stations, z);
    if(!station.cut)assert.ok(river.isInsideRiverCorridor(station.centerX, z, stations));
    for (const side of [-1, 1]) {
      assert.ok(river.isInsideRiverCorridor(station.centerX + side * (station.mudHalfWidth - 1e-6), z, stations));
      assert.equal(river.isInsideRiverCorridor(station.centerX + side * (station.mudHalfWidth + 1e-6), z, stations), false);
      assert.equal(river.riverWaterImmersion(station.centerX + side * (station.waterHalfWidth + 1e-6), z, stations), 0);
      assert.ok(Math.abs(river.distanceToRiverWater(station.centerX + side * (station.waterHalfWidth + 0.7), z, stations) - 0.7) < 1e-9);
    }
    if (z >= -33 && z <= -20) assert.ok(station.centerX + station.mudHalfWidth < -17, 'Embassy apron is reserved east of x=-17');
  }
  for (const [x, z] of [[0, -12], [0, -28], [-10, -24], [10, -24], [0, 33], [0, 40]]) {
    assert.equal(river.isInsideRiverCorridor(x, z, stations, 2.5), false, 'Spawn/embassy/objective anchors stay on dry land');
  }
  // The fixed four-column file manifest is not moved or reseeded by this change.
  const files = Array.from({ length: 256 }, (_, i) => ({ path: `/river-test/file-${i}.txt`, name: `file-${i}.txt`, extension: 'txt', size: i, is_dir: false }));
  const targets = layoutFilesInGrid(files, { preserveSlots: true, reservedZones: [FILE_OBJECTIVE_RESERVED_ZONE] });
  for (const position of targets.values()) assert.equal(river.isInsideRiverCorridor(position.x, position.z, stations, 1.2), false, 'Stable file huts remain out of the river');
  const crossings = river.createRiverCrossings(stations);
  assert.deepEqual(crossings.map(c => c.kind), ['ford', 'bridge']);
  const centralBridge = crossings.find(c => c.kind === 'bridge');
  assert.equal(centralBridge.centerX, 0); assert.equal(centralBridge.axis, 'z');
  const sheet = bakeCrossingReflections(stations, seed);
  assert.deepEqual(sheet.mask, bakeCrossingReflections(stations, seed).mask);
  let lit = 0;
  for (let i = 0; i < sheet.mask.length; i++) {
    if (!sheet.mask[i]) continue;
    lit++;
    const x = sheet.x0 + (i % sheet.width + .5) * sheet.widthM / sheet.width;
    const z = sheet.z0 + (Math.floor(i / sheet.width) + .5) * sheet.heightM / sheet.height;
    const s = river.sampleRiverStation(stations, z);
    assert.ok(Math.abs(x - s.centerX) <= s.waterHalfWidth - .18);
    assert.equal(river.riverCrossingAmount(x, z, centralBridge, .4), 0, 'Reflections are not drawn on dry deck');
  }
  assert.ok(lit >= 120 && lit < 1800, 'Ripples are visible phrases, not a noisy full-river overlay');
  assert.ok(centralBridge.z > 10 && centralBridge.z < 23, 'A central-road bridge must carry the north/south combat route');
  for (const crossing of crossings) {
    assert.ok(crossing.width >= 3.8 && crossing.length < (crossing.kind==='bridge'?19:16));
    for (let sample = 0; sample <= 20; sample++) {
      const across = (sample / 20 - 0.5) * crossing.width;
      for (const side of [-1, 1]) {
        const along = side * crossing.length * 0.5;
        const x = crossing.centerX + Math.cos(crossing.rotation) * along + Math.sin(crossing.rotation) * across;
        const z = crossing.z - Math.sin(crossing.rotation) * along + Math.cos(crossing.rotation) * across;
        assert.equal(river.isInsideRiverCorridor(x, z, stations), false, 'Both abutments must reach dry ground across the full deck width');
      }
    }
    const immersion = river.riverWaterImmersion(crossing.centerX, crossing.z, stations);
    assert.ok(Math.abs(immersion - (crossing.kind === 'bridge' ? 0 : 0.2)) < 1e-12, 'Wakes/drag agree with dry bridge and shallow ford');
  }
  const reeds = sceneModule.createRiverReeds(stations, seed), planks = sceneModule.createRiverBridgePlanks(stations, seed);
  const trace=checkTrestleTrace(trestleMirrorGLSL,trestleReflection(centralBridge,planks),planks,centralBridge,
    (x,z)=>river.riverWaterImmersion(x,z,stations)>.025,RIVER_WATER_Y);
  if(seed===1968)console.log('Trestle shader vs geometry, seed 1968:',trace);
  const rails=planks.filter(p=>p.kind);
  assert.ok(reeds.length <= 180 && planks.length-rails.length <= Math.ceil(centralBridge.length/.38)+2);
  assert.equal(rails.filter(p=>p.kind==='post').length, 8);
  assert.equal(rails.filter(p=>p.kind==='rope').length, 18);
  assert.equal(rails.filter(p=>p.kind==='lashing').length, 8);
  assert.equal(rails.filter(p=>p.kind==='brace').length,12);
  assert.equal(rails.filter(p=>p.kind==='pile').length,8);
  assert.equal(rails.filter(p=>p.kind==='headstock').length,4);
  assert.ok(planks.length<=128,'Whole trestle fits the existing timber atlas and single draw');
  for(const p of rails){
    if(p.kind==='headstock'){
      assert.ok(p.scaleX>centralBridge.width+.5&&p.y+p.scaleY*.5<bridgeRise(p.z,centralBridge)-.10,'Transverse cap supports the deck from BELOW');
      continue;
    }
    const halfX=(['rope','brace','wale','carrier'].includes(p.kind)?p.scaleZ:p.scaleX)*.5;
    assert.ok(Math.abs(p.x-centralBridge.centerX)-halfX>centralBridge.width*.5,'Full drive width stays open under all rails');
    assert.ok(Math.abs(p.z-centralBridge.z)+.11<centralBridge.length*.5-1,'Both landings stay open');
  }
  assert.deepEqual(reeds, sceneModule.createRiverReeds(stations, seed));
  for(const side of [-1,1]){
    const bank=reeds.filter(r=>side*(r.x-river.sampleRiverStation(stations,r.z).centerX)>0).map(r=>r.z).sort((a,b)=>a-b);
    const gaps=bank.slice(1).map((z,i)=>z-bank[i]);
    assert.ok(gaps.filter(g=>g<1.15).length>bank.length*.30,'Neighboring reed fans form compact beds rather than a uniform station-by-station fringe');
    assert.ok(gaps.filter(g=>g>4).length>=2,'Separate those reed beds with exposed lengths of bank');
  }
  for (const reed of reeds) {
    assert.ok(Object.values(reed).every(Number.isFinite));
    assert.equal(river.riverWaterImmersion(reed.x, reed.z, stations), 0, 'Reeds must follow the actual water edge, not a mismatched normal offset');
    assert.ok(river.isInsideRiverCorridor(reed.x, reed.z, stations, 0.10));
    assert.ok(crossings.every(c => river.riverCrossingAmount(reed.x, reed.z, c, 0.9) === 0));
  }
  const surfaces = [false, true].map(water => sceneModule.createRiverSurfaceGeometry(stations, seed, water));
  for (let index = 0; index < surfaces.length; index++) {
    const geometry = surfaces[index], water = index === 1, columns = water ? 5 : 11;
    const extra=geometry.index.count/3-2780;
    if(water)assert.equal(geometry.index.count/3,1112);else assert.ok(extra>=34&&extra<=96,'Only nondegenerate retained-point triangles append to the existing bed');
    for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
    assert.ok(geometry.boundingBox && geometry.boundingSphere);
    const p = geometry.attributes.position, n = geometry.attributes.normal;
    for (let row = 0; row < stations.length; row++) {
      const s = stations[row], width = water ? s.waterHalfWidth : s.mudHalfWidth;
      assert.ok(Math.abs(p.getX(row * columns) - (s.centerX - width)) < 1e-5);
      assert.ok(Math.abs(p.getX(row * columns + columns - 1) - (s.centerX + width)) < 1e-5);
      if(!water)for(const sign of [-1,1]){
        const col=c=>row*columns+(sign<0?c:columns-1-c);
        assert.ok(p.getY(col(1))>p.getY(col(2))&&p.getY(col(2))>p.getY(col(3))&&p.getY(col(3))>p.getY(col(4)));
        assert.ok(Math.abs(p.getY(col(4))-RIVER_WATER_Y)<.007,'low silt tongue actually meets ripple/wake edge');
      }
    }
    for (let vertex = 0; vertex < p.count; vertex++) {
      assert.ok(Math.abs(Math.hypot(n.getX(vertex), n.getY(vertex), n.getZ(vertex)) - 1) < 1e-6);
      assert.ok(n.getY(vertex) > (water?.999:.10), 'Normals on level water and eroded slope must face upward: '+n.getY(vertex));
      if (water) assert.ok(Math.abs(p.getY(vertex) - RIVER_WATER_Y) < 3e-8, 'All of the water sits below the surrounding terrain at the same level');
    }
    for (let triangle = 0; triangle < geometry.index.count; triangle += 3) {
      const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(p, geometry.index.getX(triangle + offset)));
      assert.ok(vertices[1].sub(vertices[0]).cross(vertices[2].sub(vertices[0])).lengthSq() > 1e-10);
    }
    geometry.dispose();
  }
  assert.deepEqual(stations, saved, 'Consumers cannot mutate the shared deterministic river');
  const shelter=createRiverLanding(stations),vertices=shelter.getAttribute('position');
  let wetFoot=false,dryFoot=false;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),z=vertices.getZ(i);
    assert.ok(x>2.15,'Static fishing shelter must not occupy the drive lane in any seeded layout.');
    if(vertices.getY(i)>0) continue;
    if(river.riverWaterImmersion(x,z,stations)>.5) wetFoot=true;
    if(river.distanceToRiverWater(x,z,stations)>.04) dryFoot=true;
  }
  assert.ok(wetFoot&&dryFoot,'Shelter must straddle this real seed’s waterline, not float in the middle or sit wholly on land.');
  assert.ok(vertices.count/3<1150);
  summaries.push({ seed, reeds: reeds.length, bridgePieces: planks.length, surfaceTriangles:surfaces[0].index.count/3, landingTriangles:vertices.count/3 });
  shelter.dispose();
}
assert.equal(sceneModule.riverTerrainClearance([5,25].map(z=>({z,centerX:-16,mudHalfWidth:10,waterHalfWidth:8}))),false,
  'A hill fully enclosed by a broad bank trapezoid must be caught even when its four edges miss the hill');
let trackChecks=0,minimum=Infinity,maximum=0;
for (let i=0;i<256;i++) {
  const seed=i*1968,stations=river.createRiverStations(seed),br=river.createRiverCrossings(stations).find(c=>c.kind==='bridge');
  assert.ok(sceneModule.riverTerrainClearance(stations));
  const ground=createTankGroundProfile(stations,seed);
  minimum=Math.min(minimum,br.length);maximum=Math.max(maximum,br.length);
  assert.ok(bridgeRise(br.z,br)-RIVER_WATER_Y>=1.79&&br.width>=4.65,'Carriageway must stand clear of the water and carry a full tracked hull');
  for(const localX of [-1.32,0,1.32])for(let dz=-br.length/2+.12;dz<br.length/2-.11;dz+=.16){
    const z=br.z+dz;
    assert.ok(!tankFootprintBlocked(localX,z,Math.PI,intersectsTerrainMound),'Hull has a continuous full-width crossing');
    for(const side of [-1,1]){
      const x=localX+side*.76;
      const y=Math.max(...[-.043,0,.043].map(off=>ground.height(x,z+off)));
      assert.ok(Math.abs(y-(bridgeRise(z,br)+.025))<.036,'Both shoes follow the actual raised carriageway including board seams');
      assert.equal(river.riverWaterImmersion(x,z,stations),0);
      trackChecks++;
    }
  }
}
console.log('Trestle: 256 seeds, length '+minimum.toFixed(2)+'–'+maximum.toFixed(2)+' m, 4.70 m clear width, 1.80 m crown above water; '+trackChecks+' dry track contact checks.');
assert.deepEqual(TERRAIN_MOUNDS, originalTerrain, 'River routing cannot rewrite terrain/collision data');
assert.deepEqual(river.createRiverStations(NaN), river.createRiverStations(1968));
assert.deepEqual(river.createRiverCrossings([]), []);
assert.equal(river.isInsideRiverCorridor(NaN, 0, river.createRiverStations(1968)), false);
assert.equal(river.riverWaterImmersion(0, NaN, []), 0);
assert.equal(river.distanceToRiverWater(0, 100, []), Infinity);

// Sample the actual tread emitter in both gears and with one tread on shore.
{
  const {createTrackSilt} = await load('../src/components/Scene/trackSilt.ts');
  const stations = river.createRiverStations(1968);
  const atlas = new THREE.Texture(), silt = createTrackSilt(stations, atlas, true);
  const right = new THREE.Vector3(1, 0, 0), travel = new THREE.Vector3(0, 0, 1);
  const z = 33, pos = new THREE.Vector3(river.sampleRiverStation(stations, z).centerX, 0, z);
  for (const gear of [1, -1]) {
    travel.z = gear;
    silt.reset();
    silt.update(1 / 30, pos, .43, travel, right);
    assert.equal(silt.mesh.count, 2);
    for (let side = 0; side < 2; side++) {
      const inkZ = silt.mesh.instanceMatrix.array[side * 16 + 14];
      assert.ok((pos.z - inkZ) * gear > .8, 'Both tread trails start behind the direction of travel');
    }
  }
  travel.z = 1;
  const bank = river.sampleRiverStation(stations, z - .94);
  pos.x = bank.centerX + bank.waterHalfWidth;
  silt.reset();
  silt.update(1 / 30, pos, .43, travel, right);
  assert.equal(silt.mesh.count, 1, 'Only the submerged tread disturbs silt');
  for (let i = 0; i < 100; i++) silt.update(1 / 30, pos, 0, travel, right);
  assert.equal(silt.mesh.visible, false, 'Suspended clay clears while parked');
  const bridge = river.createRiverCrossings(stations).find(c => c.kind === 'bridge');
  pos.set(bridge.centerX, 0, bridge.z);
  silt.update(1 / 30, pos, .43, travel, right);
  assert.equal(silt.mesh.count, 0, 'Crossing on the deck leaves the water clear');
  silt.dispose();
  atlas.dispose();
}

// Mount the river renderer, exercise frame callbacks, then dispose.
// Headless Node has no 2D rasterizer: record the paint program here, while production captures check actual pixels.
const recordPaint = () => {
  const marks = [];
  const gradient = { addColorStop: (...args) => marks.push(['stop', ...args]) };
  const ctx = new Proxy({}, {
    set(_target, key, value) { marks.push([key, value === gradient ? 'gradient' : value]); return true; },
    get(_target, key) { return (...args) => { marks.push([key, ...args]); return key === 'createLinearGradient' ? gradient : undefined; }; },
  });
  return { marks, ctx };
};
const strokes = seed => { const { ctx, marks } = recordPaint(); paintBridgeTimber(ctx, 4, seed); return marks; };
const initial = strokes(1968);
assert.deepEqual(strokes(1968), initial); assert.notDeepEqual(strokes(1969), initial);
assert.ok(new Set(initial.filter(m => m[0] === 'fillStyle' && String(m[1]).startsWith('rgb(')).map(m => m[1])).size >= 3);
const oldDocument = globalThis.document;
globalThis.document = { createElement: tag => { assert.equal(tag, 'canvas'); const { ctx } = recordPaint(); return { getContext: () => ctx }; } };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend({ Group: THREE.Group, Mesh: THREE.Mesh, InstancedMesh: THREE.InstancedMesh });
const scene = new THREE.Scene(), subscribers = new Set();
const state = { scene, internal: { active: false, frames: 0, interaction: [], initialHits: [], hovered: new Map(), capturedMap: new Map(),
  subscribe(ref) { subscribers.add(ref); return () => subscribers.delete(ref); } }, invalidate() {} };
const store = { getState: () => state, getInitialState: () => state, subscribe: () => () => {} };
scene.__r3f = { root: store, type: 'scene', parent: null, children: [], props: {}, object: scene, eventCount: 0, handlers: {}, isHidden: false };
const fail = error => { throw error; };
const root = reconciler.createContainer(store, 1, null, false, null, '', fail, fail, fail, null);
const render = element => act(async () => reconciler.updateContainer(React.createElement(context.Provider, { value: store }, element), root, null, null));
const originalLoad = THREE.TextureLoader.prototype.load, url = '/images/textures/jungle-ground-v1.png',
  skies=(await load('../src/components/Scene/riverDawnAsset.ts')).RIVER_SKY_TEXTURES,
  villagePaint='/images/textures/ghost-hut-materials-v2.png',
  ink='/images/textures/river-current-ink.png',
  images=new Map([url,...skies,villagePaint,ink].map(path=>[path,new THREE.Texture()])),loading=[];let sharedDisposals=0;
for(const im of images.values())im.addEventListener('dispose',()=>sharedDisposals++);
THREE.TextureLoader.prototype.load = function (path, success) { const im=images.get(path);assert.ok(im,path);loading.push(()=>success(im));return im; };
try {
  useLoader.clear(THREE.TextureLoader, url);useLoader.clear(THREE.TextureLoader,skies);
  // Known, off-centre canopy placement: zero-bearing water rays should see
  // it while the antipodal azimuth remains open sky.
  const crownRow=19,crownZ=2+(crownRow+.5)*22/48,crownX=river.sampleRiverStation(river.createRiverStations(1968),crownZ).centerX+9;
  await render(React.createElement(React.Suspense, { fallback: null }, React.createElement(sceneModule.SmallRiver,
    { seed: 1968,crowns:[{x:crownX,y:5,z:crownZ,sx:2.1,sy:1.6,sz:1.3}] })));
  while(loading.length)await act(async()=>loading.splice(0).forEach(resolve=>resolve()));
  const group = scene.getObjectByName('winding-river');
  assert.equal(group.children.length, 7); assert.equal(subscribers.size, 2);
  const eddies = group.getObjectByName('bridge-pier-foam-eddies');
  assert.ok(eddies.isInstancedMesh && eddies.count > 0 && eddies.count <= 8);
  assert.equal(eddies.material.map, images.get(ink));
  assert.equal(eddies.material.map.magFilter, THREE.NearestFilter);
  const shale=group.getObjectByName('low-shale-and-wet-river-stones').geometry;
  console.log('Seed 1968 shoreline detail: '+shale.getAttribute('position').count/3+' triangles, one draw');
  assert.ok(shale.getAttribute('position').count/3<8800&&shale.groups.length===0,'One bounded, static shale draw');
  const landing=group.getObjectByName('far-bank-fishing-landing'), points=landing.geometry.getAttribute('position');
  assert.equal(landing.material.map,images.get(villagePaint),'river shelter shares the village paint, not a vertex-only checkerboard');
  const atlasUV=landing.geometry.getAttribute('uv');
  assert.ok(atlasUV.count===points.count && atlasUV.array.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'every landing triangle is mapped onto the shared atlas');
  assert.ok(points.count/3 < 1150, 'One bounded, static landmark outside the drive corridor.');
  landing.geometry.computeBoundingBox();
  assert.ok(landing.geometry.boundingBox.min.x>2.15 && landing.geometry.boundingBox.min.y<0 && landing.geometry.boundingBox.max.y>4,
    'Rooted stilts, high recognizable roof, full bridge lane stays clear.');
  const meshes = [...group.children], matrices = meshes.filter(m => m.isInstancedMesh).map(m => [m, m.instanceMatrix, m.instanceMatrix.version]);
  const bridge = group.getObjectByName('winding-river-bridge'), map = bridge.material.map;
  const rows = bridge.geometry.getAttribute('timberRow');
  assert.ok(rows.isInstancedBufferAttribute && rows.count === bridge.count);
  assert.equal(new Set(Array.from(rows.array).map(Math.abs)).size, bridge.count, 'Unique brushwork UVs for every board.');
  assert.ok(rows.array.slice(-2).every(row => row < 0));
  assert.ok(map.generateMipmaps && map.minFilter === THREE.LinearMipmapLinearFilter && map.anisotropy === 4);
  assert.equal(map.magFilter, THREE.NearestFilter);
  assert.equal(map.image.width, 128, 'Hand-placed pixel scale should survive close-up');
  const water = group.getObjectByName('winding-river-water');
  const shader = { ...THREE.ShaderLib.physical, uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms) };
  water.material.onBeforeCompile(shader, null);
  // The water trace is allowed a compact heightfield because it is rasterized
  // FROM the submitted faces. Probe the actual geometry at independent texel
  // centres (including the over/under root forks), not the bake's input data.
  const relief=shader.uniforms.bankRelief.value;
  const canopySilhouette=shader.uniforms.bankCanopy.value;
  {
    const {width,data}=canopySilhouette.image,p=(crownRow*width+width/2)*4;
    assert.ok(data[p]>100&&data[p+1]<data[p]&&data[p+2]>120,'Actual crown shades its bearing between its surveyed top and foot');
    assert.equal(data[crownRow*width*4+2],0,'No invented crown in the opposite bearing');
    assert.ok(shader.fragmentShader.includes('crownField=texture2D(bankCanopy,vec2(bearing,'));
  }
  {
    const mesh=group.getObjectByName('low-shale-and-wet-river-stones'),skin=shale.getAttribute('bankFigure');
    const bed=group.getObjectByName('winding-river-banks'),bedShader={...THREE.ShaderLib.standard,uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms)};
    bed.material.onBeforeCompile(bedShader,null);
    assert.equal(bedShader.uniforms.bankRelief.value,relief,'Bed occlusion and foam must share the same surveyed contact');
    assert.ok(shader.fragmentShader.includes('h.r*1.4-max(.0,reflectedRay.y*t)'));
    const {data,width,height}=relief.image,frame=shader.uniforms.bankMapFrame.value;
    const r=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),hits=[],materials=[0,0,0],bands=[0,0];
    const stations=river.createRiverStations(1968),ground=createTankGroundProfile(stations,1968),bridge=river.createRiverCrossings(stations).find(c=>c.kind==='bridge');
    let foam=0,empty=0,bothSides=0;
    for(let z=1;z<height-1;z++)for(let x=1;x<width-1;x++){
      const k=(z*width+x)*4,wx=frame.x+(x+.5)/width/frame.z,wz=frame.y+(z+.5)/height/frame.w;
      if(data[k+2]>20){
        assert.ok(data[k+3]>25,'Foam stays at the shore contacts, never in arbitrary midstream pixels');
        assert.ok(ground.height(wx,wz)<=RIVER_WATER_Y+.053);
        foam++;
      }
      if(!data[k]&&!data[k+3]){empty++;continue;}
      if(data[k]<8||x%2||z%2)continue;
      r.set(new THREE.Vector3(wx,3,wz),down);hits.length=0;r.intersectObject(mesh,false,hits);
      const hit=hits.find(h=>skin.getX(h.face.a)>0);
      assert.ok(hit&&Math.abs(hit.point.y-(RIVER_WATER_Y+1.4*data[k]/255))<.003,'Reflected height must match the visible stone or root face');
      assert.ok(river.riverCrossingAmount(wx,wz,bridge,.04)===0,'New figures stay clear of the timber lane and abutments');
      materials[skin.getX(hit.face.a)]++;
      bands[wz<10?0:1]++;
      bothSides|=wx<river.sampleRiverStation(stations,wz).centerX?1:2;
    }
    console.log('Surveyed-bank independent ray hits [stone, root], [chase, bay], bank bits, sparse foam texels:',materials.slice(1),bands,bothSides,foam);
    assert.ok(materials[1]>100&&materials[2]>40&&bands.every(n=>n>70)&&bothSides===3,'Read real rock and bark in both camera reaches, on both banks');
    assert.ok(foam>=8&&foam<180&&empty>.76*width*height,'Contact must form a few upstream breaks, not the 784-texel closed collars of R15');
  }
  assert.equal(shader.uniforms.mirrorStations.value.length,4*4);
  assert.equal(shader.uniforms.mirrorDeck.value.length,7*4);
  assert.ok(shader.fragmentShader.includes(trestleMirrorGLSL)&&shader.fragmentShader.includes('traceTrestle(vWetlandWorld,reflectedRay)'));
  const reflectionMap = shader.uniforms.surfaceCipherMap.value;
  assert.equal(shader.uniforms.riverDawnPaint.value,images.get(skies[1]),'water samples the exact shared cached sky texture');
  assert.equal(reflectionMap.format, THREE.RGFormat, 'pigment and missing-substrate share one sampled texture');
  assert.equal(reflectionMap.image.data.length,reflectionMap.image.width*reflectionMap.image.height*2);
  assert.match(shader.fragmentShader,/signalGradeDawn\(cloud,reflectedRay\)/,'reflection uses the actual dawn grade');
  assert.equal(reflectionMap.magFilter, THREE.LinearFilter);
  assert.equal(reflectionMap.minFilter, THREE.LinearMipmapLinearFilter);
  const initialReflectionsVersion = reflectionMap.version;
  {
    // Inspect the assembled production fragment, including both mip levels
    // and the point at which derivatives are taken. An implicit LOD lookup
    // inside these footprint-dependent branches is undefined on WebGL.
    const body=shader.fragmentShader.split('vec2 cipherField(vec2 cells) {')[1].split('return micro;')[0]
      .replace(/\/\/[^\n]*/g,'').replace(/\s/g,'');
    const derivative='vec2dcx=dFdx(cells),dcy=dFdy(cells);';
    assert.ok(body.startsWith(derivative+'floatfootprint2=max(dot(dcx,dcx),dot(dcy,dcy));'));
    assert.equal((body.match(/dFd[xy]\(/g)||[]).length,2,'All screen slopes must be evaluated before a divergent branch');
    const reads=[...body.matchAll(/texture\w*\((\w+),/g)].map(m=>[m[0],m[1]]);
    assert.deepEqual(reads,Array(2).fill(['textureGrad(surfaceCipherMap,','surfaceCipherMap']));
    const fine=body.match(/if\(footprint<([\d.]+)\)micro=textureGrad\(surfaceCipherMap,cells\/64\.,dcx\/64\.,dcy\/64\.\)\.rg\*\(1\.-smoothstep\(([\d.]+),([\d.]+),footprint\)\)/);
    const coarse=body.match(/if\(footprint>([\d.]+)&&footprint<([\d.]+)\)\{vec2coarser=cells\*([\d.]+)\+vec2\([\d.,]+\);/);
    assert.ok(fine&&coarse,'Both nested scales sample only their readable footprint range');
    const cutoff=body.match(/if\(footprint2>=([\d.]+)\*([\d.]+)\)returnvec2\(0\.\);/);
    assert.ok(cutoff&&body.indexOf(cutoff[0])<body.indexOf(fine[0]));
    assert.equal(Number(fine[1]),Number(fine[3]),'The fine ink envelope reaches zero before its fetch is skipped');
    assert.ok(body.includes('textureGrad(surfaceCipherMap,coarser/64.,dcx*('+coarse[3]+'/64.),dcy*('+coarse[3]+'/64.)).rg'),
      'Coarse slopes use the same chain-rule scale on both derivative vectors as coarse UVs');
    assert.ok(body.includes('smoothstep('+coarse[1]+',.24,footprint)*(1.-smoothstep(.82,'+coarse[2]+',footprint))*run'));
    assert.ok(body.includes('micro.r=max(micro.r,imprint.r*readable')&&body.includes('micro.g=max(micro.g,imprint.g*readable'),
      'Both ink and substrate channels retain readable coarse marks inside the fine layer');
    const levels=(dx,dy)=>{
      const f2=Math.max(dx[0]**2+dx[1]**2,dy[0]**2+dy[1]**2),f=Math.sqrt(f2);
      return f2>=Number(cutoff[1])*Number(cutoff[2])?[]:
        [...(f<Number(fine[1])?['fine']:[]),...(f>Number(coarse[1])&&f<Number(coarse[2])?['coarse']:[])];
    };
    for(const [f,want] of [[.01,['fine']],[.075,['fine']],[.18,['fine','coarse']],[.76,['coarse']],[1.8,['coarse']],[2.35,[]],[8,[]]]){
      assert.deepEqual(levels([f,0],[0,0]),want);
      assert.deepEqual(levels([0,0],[0,-f]),want,'Also cover the steeper Y slope');
    }
    assert.deepEqual(levels([.60,.60],[.1,-.1]),['coarse'],'Use magnitude, not largest component, for oblique water');
    console.log('Mounted river cipher: signed X/Y slopes prior to branching, 1/2/1/0 atlas reads over fine, shared, coarse, and unresolved ranges.');
  }
  const otherShader={...THREE.ShaderLib.physical,uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms)};
  const paddy=createWetlandWaterMaterial({value:0});paddy.onBeforeCompile(otherShader,null);
  assert.equal(otherShader.uniforms.surfaceCipherMap.value,reflectionMap,'Independent paddy and river share precisely one atlas');paddy.dispose();
  const initialMapVersion = map.version;
  for (let frame = 0; frame < 120; frame++) for (const ref of subscribers) ref.current({ clock: { elapsedTime: frame / 60 } }, 1 / 60);
  for (const [mesh, matrix, version] of matrices) { assert.equal(mesh.instanceMatrix, matrix); assert.equal(matrix.version, version); }
  const resources = new Set(meshes.flatMap(mesh => [mesh.geometry, mesh.material]));
  assert.equal(map.version, initialMapVersion, 'No per-frame atlas upload.');
  assert.equal(reflectionMap.version, initialReflectionsVersion, 'Ripple atlas stays static across updates');
  resources.add(map);
  resources.add(relief);
  resources.add(canopySilhouette);
  let releasedShared=false;reflectionMap.addEventListener('dispose',()=>{releasedShared=true;});
  let disposed = 0; resources.forEach(resource => resource.addEventListener('dispose', () => disposed++));
  await render(null);
  assert.equal(releasedShared,false,'Unmounting one river must not retire the shared cipher atlas');
  assert.equal(subscribers.size, 0); assert.equal(scene.children.length, 0);
  assert.equal(disposed, resources.size); assert.equal(sharedDisposals, 0);
  const { CheckpointFog } = await load('../src/components/Scene/CheckpointFog.tsx');
  await render(React.createElement(CheckpointFog));
  const mist = scene.getObjectByName('checkpoint-drifting-fog');
  assert.ok(mist.children.length > 1 && mist.getObjectByName('east-post-beam-in-rain'));
  for (const layer of mist.children) {
    assert.ok(layer.renderOrder > water.renderOrder, 'River water must draw before the lit checkpoint mist');
    assert.ok(layer.material.depthTest && !layer.material.depthWrite, 'Solid bridge timbers must still occlude mist behind them');
  }
} finally {
  if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  await render(null); THREE.TextureLoader.prototype.load = originalLoad; useLoader.clear(THREE.TextureLoader, url);useLoader.clear(THREE.TextureLoader,skies);useLoader.clear(THREE.TextureLoader,villagePaint);useLoader.clear(THREE.TextureLoader,ink);
  for(const im of images.values())im.dispose();
}
console.log('Winding river checks passed: deterministic continuous curves, 256-seed hill clearance, shared banks/immersion, embassy/file safety, connected crossings, finite geometry, six river draws plus one static fishing landing, and lifecycle checks.', JSON.stringify(summaries));
