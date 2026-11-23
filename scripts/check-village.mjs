import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import ts from 'typescript';

const modules = new Map();
async function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = (async () => {
    let { outputText } = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    });
    for (const match of [...outputText.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
      const imported = match[2].startsWith('.') ? await moduleUrl(new URL(`${match[2]}.ts`, url))
        : import.meta.resolve(match[2]);
      outputText = outputText.replace(match[0], `from '${imported}'`);
    }
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  })();
  modules.set(url.href, pending); return pending;
}
const load = async path => import(await moduleUrl(new URL(path, import.meta.url)));
const layout = await load('../src/lib/layout.ts');
const combat = await load('../src/lib/combat.ts');
const cover = await load('../src/lib/villageCover.ts');
const { intersectsTerrainMound } = await load('../src/lib/terrain.ts');
const river = await load('../src/components/Scene/riverLayout.ts');
const { applyHutSurfaceUV } = await load('../src/lib/hutMaterials.ts');
const component = await readFile(new URL('../src/components/Scene/FileBlocks.tsx', import.meta.url), 'utf8');
const start = component.indexOf('const STRUCTURE_ACCENTS');
const end = component.indexOf('interface InstancedCategoryBlocksProps');
assert.ok(start >= 0 && end > start);
const builder = ts.transpileModule(component.slice(start, end).replace('export function createStructureGeometry',
  'function createStructureGeometry'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const createStructureGeometry = new Function('THREE', 'mergeGeometries', 'applyHutSurfaceUV', 'villageHutYaw','HUT_PROFILES',
  `${builder}; return createStructureGeometry;`)(THREE, mergeGeometries, applyHutSurfaceUV, layout.villageHutYaw,cover.HUT_PROFILES);

// Slice the actual rendered hut triangles at each landing (including roofs/porches). A centre-only
// parcel test misses the tank clipping a rotated eave. A world AABB test flags empty corners.
const { TRAINING_DIRECTORY, createTrainingEntries } = await load('../src/lib/training.ts');
const { createFileObjective, FILE_OBJECTIVE_RESERVED_ZONE } = await load('../src/lib/mission.ts');
const { createSectorPage, createSectorReservations } = await load('../src/lib/sectorPaging.ts');
const { fileToScale } = await load('../src/lib/scale.ts');
const { TANK_FOOTPRINT } = await load('../src/lib/tankFootprint.ts');
const entries = createTrainingEntries(), objective = createFileObjective(entries, TRAINING_DIRECTORY);
const trainingPage = createSectorPage(entries, 0, objective.targets[0]?.path, createSectorReservations());
const trainingPlots = layout.layoutFilesInGrid(trainingPage.layoutEntries.filter(e => !e.is_dir),
  { reservedZones: [FILE_OBJECTIVE_RESERVED_ZONE], preserveSlots: true });
const maximumRoofRadius = Math.max(...[0,1,2,3].map(v => {
  const g = createStructureGeometry('other',v), p = g.getAttribute('position');
  let r = 0; for (let i=0;i<p.count;i++) r=Math.max(r,Math.hypot(p.getX(i),p.getZ(i)));
  g.dispose(); return r * fileToScale(Infinity) + .12 * Math.SQRT2;
}));
const nominalRiver = river.createRiverStations(1968);
// A safe-looking verge on one map can be under water on the next. Use actual
// rendered station envelopes; same movement command, only the sector changes.
let rejectedFlooded=0, restoredDry=0;
for(const seed of [11,217,5701,91827]){
  const level=river.createRiverStations(seed);
  for(const station of level.filter(s=>Math.abs(s.z)<48)){
    for(const side of [-1,1]) for(const extra of [-1,-.5,0,.5,1]){
      const x=station.centerX+side*(station.mudHalfWidth+.65+extra),z=station.z;
      const live=cover.safeVillageLeg(x,z-.20,x,z,[],level);
      const nominal=cover.safeVillageLeg(x,z-.20,x,z,[],nominalRiver);
      if(river.isInsideRiverCorridor(x,z,level,.65))assert.equal(live,false,'cannot route on submerged bank');
      if(nominal&&!live)rejectedFlooded++;
      if(live&&!nominal)restoredDry++;
    }
  }
}
assert.ok(rejectedFlooded>0&&restoredDry>0,'seed-specific route must both block newly wet and restore newly dry banks');
console.log('Live river navigation: rejected',rejectedFlooded,'nominal dry legs; restored',restoredDry,'actual dry legs.');
const validPlots = Array.from({length:6},(_,r) => layout.VILLAGE_COLUMN_ORDER.flatMap(col =>
  layout.villageParcelPlots((col+.5)*8,12+r*8))).flat().filter(p => !intersectsTerrainMound(p.x,p.z,2.45)
    && !river.isInsideRiverCorridor(p.x,p.z,nominalRiver,3));
const revised = [[4,12,1],[-4,20,2],[-4,28,1],[4,28,0]].map(([cx,cz,slot]) => layout.villageParcelPlots(cx,cz)[slot]);
const downstream = revised[0];
const {FIELD_PICKUPS,PICKUP_RADIUS} = await load('../src/lib/fieldPickups.ts');
assert.ok(FIELD_PICKUPS.village.every(p=>Math.hypot(p.x-downstream.x,p.z-downstream.z)>maximumRoofRadius+PICKUP_RADIUS),
  'The bank house must leave both supply pickup approaches open');
const roadDistance=v=>Math.abs(((v+4)%8+8)%8-4);
assert.ok(Math.min(roadDistance(downstream.x),roadDistance(downstream.z))>maximumRoofRadius,
  'Even a fully grown roof must leave the grid track centre open');
for (const p of revised) {
  assert.ok(layout.isVillagePlotArea(p.x,p.z), 'Local scenery must respect relocated plots.');
  assert.ok(!intersectsTerrainMound(p.x,p.z,maximumRoofRadius));
  assert.ok(validPlots.every(q => (q.x===p.x && q.z===p.z) || Math.hypot(p.x-q.x,p.z-q.z)>2*maximumRoofRadius));
}
for (let i=0;i<256;i++) {
  const stations = river.createRiverStations(i * 1968), bridge = river.createRiverCrossings(stations).find(c=>c.kind==='bridge');
  for (const p of validPlots) {
    const dx = Math.max(0, Math.abs(p.x-bridge.centerX)-bridge.width/2);
    const dz = Math.max(0, Math.abs(p.z-bridge.z)-bridge.length/2-5);
    assert.ok(Math.hypot(dx,dz)>maximumRoofRadius, `Plot (${p.x},${p.z}) must clear full-size roofs on both five-metre landings: ${Math.hypot(dx,dz)} vs ${maximumRoofRadius}, seed ${i*1968}`);
  }
  for (const p of revised) assert.ok(!river.isInsideRiverCorridor(p.x,p.z,stations,maximumRoofRadius));
  // A radius added only across X misses an oblique river cutting through
  // the near or far corner of the porch. Sweep the full mesh+jitter circle.
  for(let n=0;n<96;n++) {
    const a=n*Math.PI/48,r=maximumRoofRadius+.04;
    assert.ok(!river.isInsideRiverCorridor(downstream.x+r*Math.cos(a),downstream.z+r*Math.sin(a),stations,.02),
      'Downstream porch and eaves must be dry on the actual seeded bank');
  }
  // A narrow bank corner could pass between those angular samples. The
  // downstream plot is on the outer (east) shore; its nearest continuous
  // bank segment must also clear all triangles, all headings and plot jitter.
  for(let s=1;s<stations.length;s++){
    const a=stations[s-1],b=stations[s],x=a.centerX+a.mudHalfWidth,z=a.z;
    const dx=b.centerX+b.mudHalfWidth-x,dz=b.z-z,px=downstream.x-x,pz=downstream.z-z;
    const t=Math.max(0,Math.min(1,(px*dx+pz*dz)/(dx*dx+dz*dz)));
    assert.ok(Math.hypot(px-t*dx,pz-t*dz)>maximumRoofRadius+.06,'Rotated/jittered hut envelope touches the continuous eastern shore');
  }
}
const huts = trainingPage.entries.filter(e => !e.is_dir).map(entry => {
  const p = objective.targets.find(t => t.path === entry.path)?.position ?? trainingPlots.get(entry.path);
  const geo = createStructureGeometry('other', layout.villageStructureVariant(entry.path));
  geo.scale(fileToScale(entry.size), fileToScale(entry.size), fileToScale(entry.size));
  geo.rotateY(layout.villageHutYaw(entry.path, p.x, p.z)); geo.translate(p.x, p.y, p.z);
  return { entry, geo };
});
const clipZ = (poly, edge, sign) => {
  const clipped = [];
  for (let i=0; i<poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if ((p.z-edge)*sign >= 0) clipped.push(p);
    if ((p.z-edge)*(q.z-edge) < 0) clipped.push({ x:p.x+(q.x-p.x)*(edge-p.z)/(q.z-p.z), z:edge });
  }
  return clipped;
};
function closestHut(minZ, maxZ, centerX) {
  let gap = Infinity, name = '';
  for (const {entry, geo} of huts) {
    geo.computeBoundingBox();
    if (geo.boundingBox.max.z < minZ || geo.boundingBox.min.z > maxZ) continue;
    const pos = geo.getAttribute('position');
    for (let t=0; t<pos.count; t+=3) {
      const tri = [0,1,2].map(i => ({x:pos.getX(t+i), z:pos.getZ(t+i)}));
      const poly = clipZ(clipZ(tri,minZ,1),maxZ,-1);
      if (!poly.length) continue;
      const xs = poly.map(p=>p.x-centerX), d = Math.max(0, Math.min(...xs), -Math.max(...xs));
      if (d < gap) { gap=d; name=entry.name; }
    }
  }
  return { gap: Number(gap.toFixed(3)), name };
}
for (const seed of [combat.hashCombatSession(TRAINING_DIRECTORY), 1968, 70921, 1234]) {
  const br = river.createRiverCrossings(river.createRiverStations(seed)).find(c=>c.kind==='bridge');
  const near = br.z-br.length/2, far = br.z+br.length/2;
  const ends = [closestHut(near-5,near,br.centerX),closestHut(near,far,br.centerX),closestHut(far,far+5,br.centerX)];
  assert.ok(ends.every(e=>e.gap > br.width/2 && e.gap > TANK_FOOTPRINT.radius), 'Rendered roofs and porches must leave the entire deck width unobstructed.');
  if (seed === combat.hashCombatSession(TRAINING_DIRECTORY)) console.log('Boot Camp minimum lateral clearance (approach/deck/departure, metres):',ends.map(e=>e.gap));
}
huts.forEach(({geo})=>geo.dispose());
const triangleCounts = [];
const shapes = [];
for (const category of ['media', 'code', 'archive', 'other']) {
  for (const variant of [0, 1, 2, 3]) {
    const geometry = createStructureGeometry(category, variant);
    const again = createStructureGeometry(category, variant);
    for (const name of ['position', 'normal', 'color', 'uv']) {
      const attribute = geometry.getAttribute(name);
      assert.ok(attribute.array.every(Number.isFinite), `${category}/${variant} contains non-finite ${name}`);
      assert.deepEqual(attribute.array, again.getAttribute(name).array);
    }
    assert.equal(geometry.groups.length, 0, 'A hut variant is one merged shared-material draw');
    assert.ok(geometry.getAttribute('uv').array.every(v => v >= 0 && v <= 1));
    const count = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
    assert.ok(count < 1800, `Hut ${category}/${variant} exceeded bounded geometry: ${count}`);
    assert.ok(geometry.boundingBox && geometry.boundingSphere);
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x < 2.1 && size.z < 2.1 && size.y < 2.2, 'Roof repairs cannot inflate file footprint');
    if (category === 'media') {
      shapes.push([...geometry.getAttribute('position').array].join(','));
      triangleCounts.push(count);
    }
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 0.01,
        `Hut ${category}/${variant}: lighting normals must remain valid`);
    }
    geometry.dispose(); again.dispose();
  }
}
assert.equal(new Set(shapes).size, 4, 'The four variants must be different meshes, not only color changes');
const variantCounts = [0, 0, 0, 0];
const yawSamples = new Set();
for (let i = 0; i < 240; i++) {
  const path = `/review/file-${i}.txt`;
  const variant = layout.villageStructureVariant(path); variantCounts[variant]++;
  const {x, z} = layout.villageParcelPlots((i % 6 - 2.5) * 8, 12 + Math.floor(i / 6) % 6 * 8)[i % 3];
  const yaw = layout.villageHutYaw(path, x, z);
  assert.equal(variant, layout.villageStructureVariant(path));
  assert.equal(yaw, layout.villageHutYaw(path, x, z));
  yawSamples.add(Math.round(yaw * 10));
}
assert.ok(variantCounts.every(count => count >= 30), 'A common file extension must still receive all four silhouettes');
assert.ok(yawSamples.size > 8, 'Courtyard entrances cannot all share the same heading');
assert.match(component, /\[0, 1, 2, 3\]\.map\(variant/);
assert.match(component, /villageStructureVariant\(block.path\)/);
assert.match(component, /tempQuaternion.setFromAxisAngle\(Y_AXIS, yaws\[blockIndex\]\)/,
  'Deletion/reset must reuse the exact plot yaw');

for (const seed of [1968, 1969, 70921, 1234, 4277391332, ...Array.from({length:30},(_,i)=>i*973)]) {
  const stations = river.createRiverStations(seed);
  const enemies = combat.createVietCongCombatants(seed, 12);
  assert.deepEqual(enemies, combat.createVietCongCombatants(seed, 12));
  assert.equal(enemies.length, 12);
  for (let i = 0; i < enemies.length; i++) {
    const [x, , z] = enemies[i].position;
    assert.ok(!intersectsTerrainMound(x, z, 0.45), `VC seed${seed}/${i} inside hill`);
    assert.ok(!layout.isVillagePlotArea(x, z, 0.45), `VC seed${seed}/${i} inside potential hut footprint`);
    assert.ok(!river.isInsideRiverCorridor(x, z, stations, 0.8), `VC seed${seed}/${i} in river`);
    for (let j = 0; j < i; j++) {
      assert.ok(Math.hypot(x - enemies[j].position[0], z - enemies[j].position[2]) >= 4.8,
        `VC seed${seed}/${i} overlaps another cover position`);
    }
  }
}
console.log(`Village checks passed: four stable silhouettes (${triangleCounts.join('/')} triangles), `
  + `16 batches maximum, courtyard yaw, UV/normal bounds and 35 seeds of river/plot/hill-safe VC anchors.`);

const fixtures = new Map();
for (let i=0; fixtures.size<4; i++) {
  const path=`/simulated/cover-${i}.txt`;
  fixtures.set(layout.villageStructureVariant(path),path);
}
let meshChecks=0, displaced=0;
for (const [v,path] of fixtures) for (const s of [.4,1,2.5]) {
  const position=[-6.2,.5,14.1];
  const collider=cover.createVillageObstacle({path,position,scale:s}), blockers=[collider];
  const geometry=createStructureGeometry('code',v);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.position.set(...position); mesh.rotation.y=layout.villageHutYaw(path,position[0],position[2]);
  mesh.scale.setScalar(s); mesh.updateWorldMatrix(true,false);
  const W=(x,y,z)=>new THREE.Vector3(x,y,z).applyMatrix4(mesh.matrixWorld);
  const [width,depth,height,rise]=cover.HUT_PROFILES[v];
  for (const [start,end] of [
    [W(-width*.47,height*.75,-2),W(-width*.47,height*.75,2)],
    [W(-2,height*.37,depth*.48),W(2,height*.37,depth*.48)],
    [W(0,height*1.16+rise*.45,-2),W(0,height*1.16+rise*.45,2)],
    [W(width*.35,2.5,0),W(width*.35,.3,0)],
  ]) {
    const dir=end.clone().sub(start), distance=dir.length();
    const ray=new THREE.Raycaster(start,dir.normalize(),0,distance);
    assert.ok(ray.intersectObject(mesh).length,`mesh fixture must actually hit v${v}/${s}`);
    const t=combat.findNearestObstacleHit(start,end,blockers);
    assert.ok(t!==null && t>0 && t<1,`rendered hull must stop the projectile v${v}/${s}`);
    assert.equal(cover.villageBlocksRifle(start,start.clone().lerp(end,.025),end,blockers),true);
    // Blockers win even on the initial update after spawn or a frame hitch.
    const contact=start.clone().lerp(end,t);
    for (const step of [1/144,1/60,.08,.25]) {
      const before=contact.clone().addScaledVector(dir,-.002), after=before.clone().addScaledVector(dir,18*step);
      assert.notEqual(combat.findNearestObstacleHit(before,after,blockers),null);
    }
    meshChecks++;
  }
  const flank=W(1.45,.48,-2), flankTarget=W(1.45,.48,2);
  assert.equal(cover.villageBlocksRifle(flank,flank.clone().lerp(flankTarget,.1),flankTarget,blockers),false);
  assert.equal(combat.findNearestObstacleHit(W(0,2.5,-2),W(0,2.5,2),blockers),null,'clear air over the roof');
  assert.equal(cover.villageBlocksRifle(W(0,.3,-2),W(0,.3,1.3),W(0,.3,3),blockers),true,'protruding muzzle');
  assert.equal(cover.villageBlocksSight(W(0,.3,-2),W(0,.3,2),[]),false,'destroyed structure');
  const a=W(-2,0,0),b=W(2,0,0);
  assert.equal(cover.villageBlocksWalk(a.x,a.z,b.x,b.z,blockers),true);
  assert.equal(cover.villageBlocksWalk(flank.x,flank.z,flankTarget.x,flankTarget.z,blockers,.09),false);
  geometry.dispose(); mesh.material.dispose();
}
for (const seed of [1968,1234,7491,4277391332]) {
  const original=combat.createVietCongCombatants(seed,12);
  // Simulate an objective/sector swap putting different-size houses on top of
  // active soldiers. A damaged soldier must keep health and his pose ownership.
  original[0].health=41;
  const obstacles=original.filter((_,i)=>i%2===0).map((unit,i)=>cover.createVillageObstacle({
    path:`/simulated/oversize-${i}`,position:[unit.position[0],.5,unit.position[2]],scale:2.5,
  }));
  const fitted=combat.fitVietCongToVillage(original,obstacles,seed);
  assert.equal(fitted[0].health,41);
  for (let i=0;i<fitted.length;i++) {
    const [x,,z]=fitted[i].position;
    assert.equal(cover.villageBlocksWalk(x,z,x,z,obstacles,.66),false,`spawn overlaps hut: ${seed}/${i}`);
    if (fitted[i]!==original[i]) displaced++;
  }
  assert.equal(combat.fitVietCongToVillage(fitted,obstacles,seed),fitted,'no subsequent shuffle');
  assert.equal(combat.fitVietCongToVillage(fitted,[],seed),fitted,'demolition must not relocate forces');
}
assert.ok(displaced>=24);
console.log(`Solid-village checks passed: ${meshChecks} mesh ray/first-step comparisons; 12 rotation/scale/roof and walk-around cases; ${displaced} live placements repaired without resets.`);
