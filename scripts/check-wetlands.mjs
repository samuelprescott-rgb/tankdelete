import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import ts from 'typescript';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { createHash } from 'node:crypto';

const modules = new Map();
async function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const source = await readFile(url, 'utf8');
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  });
  for (const match of [...outputText.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
    const resolved = match[2].startsWith('.') ? await moduleUrl(new URL(`${match[2]}.ts`, url)) : import.meta.resolve(match[2]);
    outputText = outputText.replace(match[0], `from '${resolved}'`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  modules.set(url.href, result);
  return result;
}
const load = async relative => import(await moduleUrl(new URL(relative, import.meta.url)));
const wetland = await load('../src/components/Scene/wetlandGeometry.ts');
const huey = await load('../src/components/Scene/hueyGeometry.ts');
const supplies = await load('../src/components/Scene/supplyCrateGeometry.ts');
const crate = supplies.createSupplyCrateGeometry();
const crateAssetRoot = new URL('../public/models/yughues-crates/', import.meta.url);
for (const [name, hash] of [
  ['Crate-04.obj', 'f9d93502095c4dad042cd224382d395ff717882f166eb45c91a0a5eca1f2b868'],
  ['diffuse.tga', '6235014dbf16f404bf2e8433c5f3e61587eeace927ff70c575846622750e5839'],
  ['normal.tga', 'bb63cf4fd5d044cb8a1ac7cb679be1df9e61d39a12ccf9433f462e41f5acd0b4'],
]) {
  const bytes = await readFile(new URL(name, crateAssetRoot));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `${name} remains the author's unmodified CC0 source`);
  if (name.endsWith('.tga')) {
    const image = new TGALoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(image.width, 512); assert.equal(image.height, 512);
  }
}
const crateModel = new OBJLoader().parse(await readFile(new URL('Crate-04.obj', crateAssetRoot), 'utf8'));
let crateTriangles = 0;
crateModel.traverse(node => {
  if (!node.isMesh) return;
  crateTriangles += node.geometry.getAttribute('position').count / 3;
  for (const name of ['position', 'normal', 'uv']) assert.ok(node.geometry.getAttribute(name).array.every(Number.isFinite));
  node.geometry.dispose();
});
assert.equal(crateTriangles, 768, 'Authored crates add only 2,304 triangles for all three instances');
assert.ok(crate.getAttribute('position').count / 3 < 700, 'Plank crates remain a small shared geometry');
assert.ok(crate.boundingBox.min.y >= -1e-6 && crate.boundingBox.max.y < 0.84, 'Crates rest on their skids and stack without floating');
for (const name of ['position', 'normal', 'color', 'crateMetal']) assert.ok(crate.getAttribute(name).array.every(Number.isFinite));
assert.ok(crate.getAttribute('crateMetal').array.some(value => value === 1), 'Steel straps share the crate draw call');
const outline = [[-5, -2.5], [4.7, -2.7], [5.1, 2.3], [-4.8, 2.6]];
const bank = wetland.createPaddyBankGeometry(outline, -0.05, 1968);
const repeated = wetland.createPaddyBankGeometry(outline, -0.05, 1968);
assert.deepEqual(bank.attributes.position.array, repeated.attributes.position.array);
for (const geometry of [bank, huey.createHueyCabinGeometry()]) {
  for (const name of ['position', 'normal']) {
    assert.ok(geometry.attributes[name].array.every(Number.isFinite), `${name} must stay finite`);
  }
  assert.equal(geometry.index.count % 3, 0);
  assert.ok(geometry.index.array.every(index => index < geometry.attributes.position.count));
  for (let index = 0; index < geometry.attributes.normal.count; index++) {
    const normal = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, index);
    assert.ok(normal.length() > 0.99 && normal.length() < 1.01, 'No degenerate surface normals');
  }
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox.max.y < 1.0, 'Geometry remains appropriately scaled');
  if (geometry !== bank) geometry.dispose();
}
// First and last cross-sections meet exactly: no disconnected boulder seams.
for (let cross = 0; cross < 6; cross++) {
  const a = new THREE.Vector3().fromBufferAttribute(bank.attributes.position, cross);
  const b = new THREE.Vector3().fromBufferAttribute(bank.attributes.position, 112 * 6 + cross);
  assert.ok(a.distanceTo(b) < 1e-5, 'Paddy bank must close without gaps');
}
assert.equal(bank.index.count / 3, 1120, 'Continuous banks retain bounded geometry cost');
assert.ok(bank.boundingBox.max.y - (-0.05) < 0.06, 'Earthen berms must remain low trampled edges, not raised tubes');
const water = wetland.createPaddyWaterGeometry(outline);
assert.ok(water.getAttribute('position').count / 3 <= 1800, 'Shoreline tessellation must remain bounded');
const depths = water.getAttribute('wetlandDepth');
assert.equal(depths.count, water.getAttribute('position').count);
assert.ok(depths.array.every(depth => Number.isFinite(depth) && depth >= 0 && depth <= 1));
assert.ok(depths.array.some(depth => depth === 0) && depths.array.some(depth => depth > 0.9), 'Water must distinguish shoreline and interior depth');
for (const name of ['position', 'normal', 'uv']) assert.ok(water.getAttribute(name).array.every(Number.isFinite));
const rice = wetland.createFieldRiceGeometry();
const riceAgain = wetland.createFieldRiceGeometry();
const sculpt = wetland.createRiceShootGeometry();
const kept = [0,1,3,4,5,6,7,9,10];
for (let leaf=0;leaf<6;leaf++) for(const [i,j] of kept.entries()) for(const key of ['position','color','normal']){
  const a = new THREE.Vector3().fromBufferAttribute(rice.getAttribute(key),leaf*9+i);
  const b = new THREE.Vector3().fromBufferAttribute(sculpt.getAttribute(key),leaf*11+j);
  assert(a.equals(b), 'All border knots and the midrib keep their exact positions, normals and pigment');
}
sculpt.dispose();
const drum = wetland.createFieldDrumGeometry();
assert.ok(drum.boundingBox.min.y >= 0 && drum.boundingBox.min.y < 0.02, 'Steel drum must rest on its rolled lower rim');
assert.ok(drum.boundingBox.max.y > 0.83 && drum.boundingBox.max.y < 0.88);
assert.ok(drum.getAttribute('position').count / 3 <= 1300, 'Shared field drum geometry must stay bounded');
for (const name of ['position', 'normal', 'color']) assert.ok(drum.getAttribute(name).array.every(Number.isFinite));
const riceIndex = rice.getIndex().array;
const riceTuftTriangles = riceIndex.length / 3;
assert.equal(riceTuftTriangles, 48, 'Six full silhouettes at eight triangles each');
assert.equal(rice.getAttribute('position').count, 54, 'Welded leaf vertices must be shared by adjacent triangles');
assert.deepEqual(rice.getAttribute('position').array, riceAgain.getAttribute('position').array);
assert.deepEqual(riceIndex, riceAgain.getIndex().array);
assert.ok(rice.boundingBox.max.y > 0.8 && rice.boundingBox.max.y < 1.1);
const ricePositions = rice.getAttribute('position');
const sweptRadius=Math.max(...Array.from({length:ricePositions.count},(_,i)=>
  Math.hypot(ricePositions.getX(i),ricePositions.getZ(i))+.035*1.14*ricePositions.getY(i)**2));
assert.ok(sweptRadius<=.52,'The .52m planting exclusion includes the full wind-bent fan');
const rootedBlades = new Set();
const bladeVertices = Array.from({ length: ricePositions.count }, () => []);
let waterlineStemTriangles = 0;
for (let vertex = 0; vertex < riceIndex.length; vertex += 3) {
  const indices = Array.from(riceIndex.slice(vertex, vertex + 3));
  const points = indices.map(index => new THREE.Vector3().fromBufferAttribute(ricePositions, index));
  assert.ok(new THREE.Triangle(...points).getArea() > 0.00005, 'Fold and tip faces must not degenerate');
  indices.forEach((index, corner) => bladeVertices[index].push(indices[(corner + 1) % 3], indices[(corner + 2) % 3]));
  if (Math.min(...points.map(point => point.y)) > 0.001) continue;
  waterlineStemTriangles++;
  points.forEach((point, corner) => { if (point.y === 0) rootedBlades.add(indices[corner]); });
  const width = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x));
  const depth = Math.max(...points.map(point => point.z)) - Math.min(...points.map(point => point.z));
  assert.ok(width < 0.032 && depth < 0.032, 'Waterline stems must be separate/slender, not broad cone panels');
}
assert.equal(waterlineStemTriangles, 6);
assert.equal(rootedBlades.size, 6);
const connectedToWater = new Set(rootedBlades);
for (const index of connectedToWater) bladeVertices[index].forEach(neighbor => connectedToWater.add(neighbor));
assert.equal(connectedToWater.size, ricePositions.count, 'Every blade face must be connected to a waterline root; no isolated grain specks');
for (const root of rootedBlades) {
  const left = new THREE.Vector3().fromBufferAttribute(ricePositions, root + 3);
  const right = new THREE.Vector3().fromBufferAttribute(ricePositions, root + 5);
  assert.ok(left.distanceTo(right) >= 0.060 && left.distanceTo(right) < 0.077,
    'Wider midribs keep the bent fan visible at driving distance without broadening the roots');
}
const outerLeafTips = [3,4,5].map(leaf=>leaf*9+8);
for(const tip of outerLeafTips)assert.ok(ricePositions.getY(tip)<ricePositions.getY(tip-2)-.04,
  'Lower fans must turn down distinctly beyond the crest');
for (const name of ['position', 'normal', 'color']) assert.ok(rice.getAttribute(name).array.every(Number.isFinite));
const time = { value: 3 };
const detail = new THREE.Texture();
const riceMaterial = wetland.createRiceShootMaterial(time);
// The planted mud sheet must not pick up the full bright-river glancing lobe.
// Keep the open river type treatment intact and the two programs distinct.
{
  const river = wetland.createWetlandWaterMaterial(time, true);
  const paddy = wetland.createWetlandWaterMaterial(time);
  assert.ok(paddy.roughness > river.roughness);
  assert.notEqual(paddy.customProgramCacheKey(), river.customProgramCacheKey());
  const {WaterLightBatch,registerWaterLights}=await load('../src/components/Scene/weaponWater.ts');
  const firingScene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const render={info:{render:{frame:1}}},batch=new WaterLightBatch();
  const release=registerWaterLights(firingScene,batch);
  for (const [mat,limited] of [[paddy,true],[river,false]]) {
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader, fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    mat.onBeforeCompile(shader,null);
    assert.equal(shader.fragmentShader.includes('paddyShoulder'),limited);
    assert.equal(shader.fragmentShader.includes('paddyGust(cell,gustTick-.24)'),limited, 'Gust ripples belong to flooded plots');
    batch.write(0,new THREE.Vector3(4,1,3),new THREE.Vector3(0,0,-1),6,.72,2);
    batch.count=1;render.info.render.frame++;
    mat.onBeforeRender(render,firingScene,camera);
    assert.equal(shader.uniforms.uWaterShotCount.value,1);
    assert.deepEqual([...shader.uniforms.uWaterShotB.value.slice(0,4)],[4,1,-3,2]);
    batch.count=0;render.info.render.frame++;
    mat.onBeforeRender(render,firingScene,camera);
    assert.equal(shader.uniforms.uWaterShotCount.value,0,'Releasing the flame or despawning a round clears the water on the next draw');
    assert.equal(shader.uniforms.wetlandTime,time, 'Paddy water follows the rice clock');
    assert.equal(shader.uniforms.surfaceCipherMap.value.format,THREE.RGFormat);
    assert.ok(shader.fragmentShader.includes('textureGrad(surfaceCipherMap,cells/64.,dcx/64.,dcy/64.).rg'),'Correct periodic micro grid with explicit footprints inside a nonuniform branch');
    assert.ok(shader.fragmentShader.indexOf('if(footprint2>=2.35*2.35)return vec2(0.)')<shader.fragmentShader.indexOf('textureGrad(surfaceCipherMap'),'Fully filtered ink must skip sampling');
    assert.ok(shader.fragmentShader.includes('textureGrad(surfaceCipherMap,coarser/64.,dcx*(.235/64.),dcy*(.235/64.)).rg'),'Material-local readable register must preserve its own mip derivatives');
    assert.match(shader.fragmentShader,/rippleReveal/, 'material grain tracks the moving crest');
    mat.dispose();
  }
  const {createTracerFogLight}=await load('../src/components/Scene/tracerFogLight.ts');
  const mist=new THREE.ShaderMaterial({uniforms:{seconds:{value:1}}}),bank=new THREE.Object3D();
  bank.scale.set(5,2,3);bank.updateMatrixWorld();createTracerFogLight().bind(mist);
  const sample=()=>mist.onBeforeRender(render,firingScene,camera,null,bank);
  batch.write(0,new THREE.Vector3(1,1,0),new THREE.Vector3(-1,0,0),.9,.12,0);
  batch.count=1;sample();assert.equal(mist.uniforms.fogShotCount.value,1);
  bank.position.z=40;bank.updateMatrixWorld();sample();
  assert.equal(mist.uniforms.fogShotCount.value,0,'The next bank in the same draw frame stays dark');
  bank.position.z=0;bank.updateMatrixWorld();batch.count=0;
  mist.uniforms.seconds.value=1.03;sample();
  assert.equal(mist.uniforms.fogShotCount.value,1);
  assert.ok(mist.uniforms.fogShotB.value[3]>0 && mist.uniforms.fogShotB.value[3]<1,'The last passing round fades');
  mist.uniforms.seconds.value=1.12;sample();
  assert.equal(mist.uniforms.fogShotCount.value,0,'The firing lane clears after the glow');
  batch.write(0,new THREE.Vector3(1,1,0),new THREE.Vector3(-1,0,0),3,.6,2);
  batch.count=1;mist.uniforms.seconds.value=2;sample();
  assert.equal(mist.uniforms.fogShotCount.value,0,'The flame stream is not a tracer');
  mist.dispose();
  release();
}
const materials = [wetland.createWetlandWaterMaterial(time), riceMaterial, wetland.createPaddyBankMaterial(),
  wetland.createPaddyBankMaterial(detail), wetland.createPaddyBedMaterial(detail), wetland.createFieldDrumMaterial(), huey.createHueyPaintMaterial(), supplies.createSupplyCrateMaterial()];
for (const material of materials) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader, null);
  assert.match(shader.vertexShader, /void main\(\)/);
  assert.match(shader.fragmentShader, /void main\(\)/);
  assert.ok(!/\b(?:NaN|Infinity|undefined)\b/.test(shader.vertexShader + shader.fragmentShader));
  if (shader.uniforms.wetlandTime) assert.equal(shader.uniforms.wetlandTime, time);
  if (material === riceMaterial) {
    assert.equal(shader.uniforms.riceTime, time, 'Each rice material must share the live wind clock');
    assert.match(shader.vertexShader, /riceFlex = min\(position\.y \* position\.y, 1\.0\)/, 'Waterline roots remain static');
    assert.match(shader.vertexShader, /transformed\.xz [^;]+ \* riceFlex/);
    assert.doesNotMatch(shader.fragmentShader, /jungleMidrib|jungleBrush|uniform float riceTime/);
    assert.equal(material.transparent, false, 'Keep the single depth-tested opaque batch behind water');
    assert.equal(material.depthWrite, true);
    assert.equal(material.map, null);
  }
  if (shader.uniforms.wetlandTime) {
    const atlas=shader.uniforms.surfaceCipherMap.value;
    assert.equal(atlas.image.width,512);assert.equal(atlas.generateMipmaps,true);
    assert.match(shader.fragmentShader,/dFdx\(cells\)/,'Differentiate material space to fade unreadable marks');
    assert.match(shader.fragmentShader,/vec2 p=vWetlandWorld\.xz/,'The type belongs to the water, not the camera');
    const density=/typeUV=p\*vec2\((\d+)\.,(\d+)\.\)/.exec(shader.fragmentShader);
    assert.ok(density && Number(density[1])*Number(density[2])>=10*15.355,'current rendered grid meets 10x old density');
    assert.equal(material.forceSinglePass, true, 'Open water sheets need a single two-sided transparency submission');
    assert.equal(material.side, THREE.DoubleSide);
    assert.match(shader.fragmentShader, /mat3\(viewMatrix\) \* wetlandNormal/, 'Ripple normals must be converted from world to view coordinates');
    assert.match(shader.fragmentShader, /fresnel/);
    assert.match(shader.fragmentShader, /vec2 wetlandSlope\(vec2 p\)/, 'Water uses decorrelated two-dimensional slopes, not field-wide stripe waves');
    assert.match(shader.fragmentShader, /fineVisibility/, 'Subpixel ripple detail must fade to avoid distance shimmer');
    assert.match(shader.vertexShader, /attribute float wetlandDepth/);
    assert.equal(material.transmission, 0, 'Water must not introduce another full-scene transmission render pass');
  }
  if (shader.uniforms.bankDetailMap) assert.equal(shader.uniforms.bankDetailMap.value, detail);
  if (shader.uniforms.paddySiltMap) assert.equal(shader.uniforms.paddySiltMap.value, detail);
  material.dispose();
}
const fireSource = await readFile(new URL('../src/components/Scene/WreckFire.tsx', import.meta.url), 'utf8');
const {BATTLE_FIRE_SEATS}=await load('../src/components/Scene/battleSmokeVolume.ts');
assert.ok(BATTLE_FIRE_SEATS.day[1][1]>1.9,'distant secondary fire sits on its hillside');
const {createFireSmokePlume,updateFireSmokePlume}=await load('../src/components/Scene/cloudDensity.ts');
const {createSmokeFoldArt,SMOKE_FOLDS}=await load('../src/components/Scene/pixelSmokeFold.ts');
const {CHARCOAL_TEXTURE}=await load('../src/components/Scene/rollingSmoke.ts');
const atlasBytes=await readFile(new URL('../public'+CHARCOAL_TEXTURE,import.meta.url));
assert.equal(atlasBytes.readUInt32BE(16),192);assert.equal(atlasBytes.readUInt32BE(20),192);
const clock={value:0},density=new THREE.Texture();
const art=createSmokeFoldArt(SMOKE_FOLDS,clock,density,'#788581');
assert.equal(art.material.uniforms.cloudAtlas.value,density);assert.equal(art.material.uniforms.uTime,clock);
assert.equal(art.material.depthWrite,false);assert.equal(art.material.depthTest,true);
assert.equal(density.minFilter,THREE.NearestFilter);
const mesh=new THREE.InstancedMesh(art.geometry,art.material,SMOKE_FOLDS);
const folds=createFireSmokePlume(0,.5,-.3);
const at=(age)=>{updateFireSmokePlume(mesh,folds,age,100+age);return mesh.instanceMatrix.array;};
at(0);assert.equal(mesh.count,0,'Ignition starts with visible flames and an empty plume even late in a session');
const first=folds[0].delay;
assert.ok(first<.1 && at(.25)[0]>.30,'A distinct first fold appears in the first quarter second');
const widthAtHalfSecond=at(first+.5)[0], heightAtHalfSecond=mesh.instanceMatrix.array[13];
assert.equal(mesh.count,1);assert.ok(widthAtHalfSecond>.35&&widthAtHalfSecond<1,'The first fold enters narrow');
const grown=at(first+1.5);assert.equal(mesh.count,1);
assert.ok(grown[0]>widthAtHalfSecond && grown[13]>heightAtHalfSecond,'The fold gains width as it floats clear of the source');
at(9);assert.equal(mesh.count,SMOKE_FOLDS);
at(0);assert.equal(mesh.count,0,'A reused hut slot cannot show smoke from its previous fire');
mesh.dispose();art.geometry.dispose();art.material.dispose();density.dispose();
assert.match(fireSource,/cinders\.dispose\(\)/);
{
  const {createCampaignBurnScars,createCampaignCinderMaterial}=await load('../src/components/Scene/campaignBurnScars.ts');
  const {createRiverStations,sampleRiverStation}=await load('../src/components/Scene/riverLayout.ts');
  const {terrainReliefHeight}=await load('../src/lib/terrain.ts');
  const {createTankGroundProfile}=await load('../src/lib/tankGroundProfile.ts');
  const skin=new THREE.MeshLambertMaterial({vertexColors:true});
  const t={value:.75},cinders=createCampaignCinderMaterial(t);
  assert.equal(cinders.uniforms.uTime,t);
  assert.equal(cinders.transparent,true);assert.equal(cinders.fog,true);assert.equal(cinders.depthWrite,false);
  for(const seed of [42,1968,1969]){
    const river=createRiverStations(seed),bank=sampleRiverStation(river,29),ground=createTankGroundProfile(river,seed);
    const sites=[[-66,.52,22],[bank.centerX-bank.mudHalfWidth-.38,.50,29],[66,.52,-30],...BATTLE_FIRE_SEATS.day];
    const scars=createCampaignBurnScars(sites,seed),solid=new THREE.Mesh(scars.timber,skin);
    for(const g of [scars.timber,scars.cinders]){
      assert.equal(g.groups.length,0,'all five sources share one batch per material');
      for(const a of Object.values(g.attributes))assert(a.array.every(Number.isFinite));
      assert(g.index.array.every(i=>i<g.attributes.position.count));
    }
    assert(scars.timber.index.count/3<=2600,'budget for all five structural remains, not per site');
    assert.equal(scars.cinders.index.count/3,40,'four cinders per timber site');
    if(seed===1968)console.log(`Campaign ruins: ${scars.timber.index.count/3} static and ${scars.cinders.index.count/3} cinder triangles across five sources; near-bank fuel seat at ${scars.sites[1].fire[0].position.map(n=>n.toFixed(2))}.`);
    assert(scars.sites.length===5&&scars.sites.every(r=>r.feet.length===4&&r.fire.length===3&&r.fire.every(p=>p.scale.every(v=>v>0))));
    const downward=new THREE.Vector3(0,-1,0),cast=new THREE.Raycaster(),ray=(from)=>{
      cast.set(from,downward);return cast.intersectObject(solid,false);
    };
    for(const r of scars.sites){
      for(const [x,y,z] of r.feet){
        const relief=terrainReliefHeight(x,z);
        assert(Math.abs(y-Math.max(ground.height(x,z),relief>0?relief:-Infinity))<.001,'posts start at actual rendered river/relief height');
        const hit=ray(new THREE.Vector3(x,y+3,z))[0];
        assert(hit&&hit.point.y>y+.12,`missing support on seed ${seed} at ${[x,y,z]}: top ${hit?.point.y}`);
      }
      assert(r.fire.every(({position:[x,y,z]})=>ray(new THREE.Vector3(x,y+.06,z)).some(h=>h.distance<.72)),'all three flame roots sit over real fuel/ash, not empty air');
    }
    scars.timber.dispose();scars.cinders.dispose();
  }
  cinders.dispose();skin.dispose();
}
const environment = await readFile(new URL('../src/components/Scene/VietnamEnvironment.tsx', import.meta.url), 'utf8');
// Execute the component's existing pure memoized placement builder, not a
// separately maintained estimate, to expose the actual seed-specific GPU budget.
const environmentAst = ts.createSourceFile('VietnamEnvironment.tsx', environment, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionNames = new Set(['seeded', 'paddyLocalToWorld', 'createPaddyOutline', 'isInsideOutline']);
const placementStatements = environmentAst.statements.filter(statement =>
  ts.isFunctionDeclaration(statement) && functionNames.has(statement.name?.text)
  || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(environmentAst) === 'PADDY_FIELDS'));
const riceComponent = environmentAst.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'RicePaddies');
const detailsStatement = riceComponent.body.statements.find(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(declaration => declaration.name.getText(environmentAst) === 'details'));
const placementSource = [...placementStatements, detailsStatement].map(statement => statement.getText(environmentAst)).join('\n');
const placementScript = ts.transpileModule(placementSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { coordinateNoise } = await load('../src/components/Scene/environmentGeneration.ts');
const { createRiverStations, isInsideRiverCorridor, createBridgePlantExclusion } = await load('../src/components/Scene/riverLayout.ts');
const { isInEmbassyClearing, EMBASSY_DEFENSE_OFFSET_Z } = await load('../src/lib/embassyDefense.ts');
const { US_FIGHTING_POSITIONS, getUSFightingPositions } = await load('../src/lib/combat.ts');
const placeRice = new Function('THREE', 'coordinateNoise', 'useMemo', 'seed', 'distanceToRoad',
  'createRiverStations', 'isInsideRiverCorridor', 'isInEmbassyClearing', 'createBridgePlantExclusion', `${placementScript}\nreturn details;`);
const placementArgs = [THREE, coordinateNoise, factory => factory(), 1968, () => 10,
  createRiverStations, isInsideRiverCorridor, isInEmbassyClearing, createBridgePlantExclusion];
const placements = placeRice(...placementArgs);
const repeatedPlacements = placeRice(...placementArgs);
for (const reviewSeed of [1968, 70921, 1234, 4277391332]) {
  const args = [...placementArgs]; args[3] = reviewSeed;
  const details = placeRice(...args), overlapsBridge = createBridgePlantExclusion(createRiverStations(reviewSeed));
  assert.ok(!details.seedlings.some(p => overlapsBridge(p.x, p.z, .52 * p.scale)));
  assert.ok(!details.fringe.some(p => overlapsBridge(p.x, p.z, 1.97 * p.scale)));
}
assert.deepEqual(placements.seedlings, repeatedPlacements.seedlings, 'Rice planting must remain seeded and repeatable');
assert.ok(placements.seedlings.length > 1000 && placements.seedlings.length <= 2250, 'Flooded mouths should remain open between concentrated beds');
for(const field of [[-6.35,-10.60,10.05,3.20,-.036,1],[6.30,-4.10,9.68,6.08,-.04,1],[6.15,4.08,10.02,5.70,.028,1]]){
  const [cx,cz,w,d,rotation,end]=field;
  const uv=placements.seedlings.map(p=>{
    const x=p.x-cx,z=p.z-cz;
    return [2*Math.sign(cx)*(x*Math.cos(rotation)-z*Math.sin(rotation))/w,2*end*(x*Math.sin(rotation)+z*Math.cos(rotation))/d];
  });
  assert.equal(uv.filter(([u,v])=>u>-.77&&u<-.46&&v>-.15&&v<.1).length,0,'A continuous flooded mouth faces the travel lane');
  assert.ok(uv.filter(([u,v])=>u>.32&&u<.87&&v>-.18&&v<.55).length>3,'Planted rice remains on the opposing shoulder');
}
const riceTriangles = placements.seedlings.length * riceTuftTriangles;
assert.ok(riceTriangles <= 108000);
assert.match(environment, /useMemo\(createFieldRiceGeometry, \[\]\)/);
assert.match(environment, /<instancedMesh name="paddy-rice-shoots" ref=\{riceRef\} args=\{\[riceGeometry, riceMaterial, details\.seedlings\.length\]\}/);
const coverHeight = wetland.createRiceCoverHeightProfile(US_FIGHTING_POSITIONS, 0);
const embassyCoverHeight = wetland.createRiceCoverHeightProfile(getUSFightingPositions(EMBASSY_DEFENSE_OFFSET_Z), 0);
const [leftCover, rightCover] = US_FIGHTING_POSITIONS;
assert.equal(coverHeight(leftCover.position[0], leftCover.position[2]), 0.28);
assert.equal(embassyCoverHeight(leftCover.position[0], leftCover.position[2]), 1, 'Inactive standard cover must not leave holes in Embassy rice');
assert.equal(coverHeight(rightCover.position[0], rightCover.position[2] + EMBASSY_DEFENSE_OFFSET_Z), 1, 'Inactive Embassy cover must not leave holes in standard rice');
assert.equal(embassyCoverHeight(rightCover.position[0], rightCover.position[2] + EMBASSY_DEFENSE_OFFSET_Z), 0.28);
const coverPoint = (cover, across, along) => [cover.position[0] + Math.cos(cover.rotation) * across + Math.sin(cover.rotation) * along,
  cover.position[2] - Math.sin(cover.rotation) * across + Math.cos(cover.rotation) * along];
assert.equal(coverHeight(...coverPoint(rightCover, rightCover.width * 0.49, -1.1)), 0.28, 'Both U-shaped sandbag arms must have low foliage');
const outerWing = rightCover.width * 0.5;
const low = coverHeight(...coverPoint(rightCover, outerWing + 0.18, -0.7));
const mid = coverHeight(...coverPoint(rightCover, outerWing + 0.45, -0.7));
const high = coverHeight(...coverPoint(rightCover, outerWing + 0.75, -0.7));
assert.ok(low > 0.28 && low < mid && mid < high && high < 1, 'A feathered verge must avoid an abrupt rectangular mowing edge');
assert.equal(coverHeight(...coverPoint(rightCover, outerWing + 1.05, -0.7)), 1);
assert.equal(coverHeight(...coverPoint(rightCover, 0, -2.5)), 1);
const trimmed = [coverHeight, embassyCoverHeight].map(profile => placements.seedlings.filter(plant => profile(plant.x, plant.z) < 1).length);
assert.ok(trimmed.every(count => count > 0 && count < placements.seedlings.length * 0.16),
  'Applying the live footprints must change only a small subset of the seed-1968 rice');
assert.match(environment, /createRiceCoverHeightProfile\(getUSFightingPositions\(fightingPositionOffsetZ\), 0\)/);
const sceneSource = await readFile(new URL('../src/components/Scene/Scene.tsx', import.meta.url), 'utf8');
assert.match(sceneSource, /fightingPositionOffsetZ=\{nightmareActive \? EMBASSY_DEFENSE_OFFSET_Z : 0\}/);
assert.match(environment, /<WreckFire\s*\/>/);
const wreck = environment.slice(environment.indexOf('function CrashedHuey'), environment.indexOf('function RicePaddies'));
assert.ok(!/icosahedronGeometry|dodecahedronGeometry/.test(wreck), 'Wreck vegetation/debris must not revert to boulders');
bank.dispose(); repeated.dispose(); water.dispose(); rice.dispose(); riceAgain.dispose(); drum.dispose(); detail.dispose(); crate.dispose();
console.log(`Wetland/wreck checks passed: low closed 1120-triangle banks, ${riceTuftTriangles}-triangle folded rice (${placements.seedlings.length} instances / ${riceTriangles} triangles at seed1968; ${trimmed.join('/')} plants shortened in standard/Embassy mode), bounded shoreline depth tessellation, seated rimmed drums, Fresnel/ripple shaders without extra render passes, shared detail ownership and fire lifecycle.`);
