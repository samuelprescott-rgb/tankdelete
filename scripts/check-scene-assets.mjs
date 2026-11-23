import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import ts from 'typescript';
import React from 'react';
import { act, context as FiberContext, extend, reconciler } from '@react-three/fiber';

// Load the real asset factories with the project's existing compiler. No build
// artifacts, canvas shim, WebGL dependency, or machine-specific paths are needed.
const modules = new Map();
async function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = (async () => {
    const source = await readFile(url, 'utf8');
    let { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    for (const match of [...outputText.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
      const localUrl = new URL(`${match[2]}.ts`, url);
      const localModule = match[2].startsWith('.') && !ts.sys.fileExists(fileURLToPath(localUrl))
        ? new URL(`${match[2]}.tsx`, url)
        : localUrl;
      const importedUrl = match[2].startsWith('.')
        ? await moduleUrl(localModule)
        : import.meta.resolve(match[2]);
      outputText = outputText.replace(match[0], `from '${importedUrl}'`);
    }
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  })();
  modules.set(url.href, pending);
  return pending;
}
const load = async path => import(await moduleUrl(new URL(path, import.meta.url)));
const plants = await load('../src/components/Scene/jungleGeometry.ts');
const { shadeDistantTree } = await load('../src/components/Scene/crossingWeather.ts');
{
  const leaf=plants.createJungleCanopyMaterial({value:0},new THREE.Texture(),true);
  const compile=leaf.onBeforeCompile, key=leaf.customProgramCacheKey();
  shadeDistantTree(leaf,null);
  assert.equal(leaf.onBeforeCompile,compile,'Embassy rain must reuse the exact original tree shader');
  assert.equal(leaf.customProgramCacheKey(),key);
  shadeDistantTree(leaf,{deck:{value:leaf.map},weatherTime:{value:0}});
  const program={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  leaf.onBeforeCompile(program,{});
  assert.match(program.vertexShader,/smoothstep\(30\.,78\.,treeRange\)/,'Leave the fight and its foreground trees at full contrast');
  assert.match(program.fragmentShader,/branchTexel\.a/,'Retain branch cutouts');
  assert.match(program.fragmentShader,/#include <fog_fragment>/,'Retain existing perimeter and scene fog');
  assert.match(program.fragmentShader,/reflectedLight\.directDiffuse/,'Warmth must require actual lighting, not just a sunward bearing');
  assert.notEqual(leaf.customProgramCacheKey(),key,'Day and night programs must not collide');
  leaf.map.dispose();leaf.dispose();
}
const { createFoliageSightlineUniforms, applyFoliageSightline } = await load('../src/components/Scene/FoliageSightline.tsx');
const sightlineUniforms = createFoliageSightlineUniforms();
assert.equal(sightlineUniforms.foliageSightlineEnabled.value, 0);
const sightlineMaterial = plants.createJungleCanopyMaterial({value:0}, new THREE.Texture());
const originalSightlineKey = sightlineMaterial.customProgramCacheKey();
applyFoliageSightline(sightlineMaterial, sightlineUniforms);
const sightlineShader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
  fragmentShader: THREE.ShaderLib.standard.fragmentShader };
sightlineMaterial.onBeforeCompile(sightlineShader, {});
assert.equal(sightlineShader.uniforms.foliageEye, sightlineUniforms.foliageEye);
assert.equal(sightlineShader.uniforms.foliageSubject, sightlineUniforms.foliageSubject);
assert.match(sightlineShader.vertexShader, /jungleFlutter/, 'existing wind must remain intact');
assert.match(sightlineShader.vertexShader, /instanceMatrix \* foliageWorld/, 'cutout tests final instanced world positions');
assert.match(sightlineShader.fragmentShader, /progress > 0\.0 && progress < 0\.97/, 'never reveal enemies beyond the tank');
assert.match(sightlineShader.fragmentShader, /max\(dot\(sightline, sightline\), 0\.01\)/, 'zero-length view is finite');
assert.match(sightlineShader.fragmentShader, /smoothstep\(radius \* 0\.7, radius \+ 0\.45, separation\)/);
assert.equal(sightlineMaterial.transparent, false, 'no sorted transparency or additional passes');
assert.equal(sightlineMaterial.depthWrite, true);
assert.equal(sightlineMaterial.alphaTest, 0.48, 'original leaf cutout remains intact');
assert.equal(sightlineMaterial.customProgramCacheKey(), originalSightlineKey+'-tank-sightline-v1');
sightlineMaterial.map.dispose(); sightlineMaterial.dispose();
const { createTerrainMaterial } = await load('../src/components/Scene/TerrainSurface.tsx');
const { exposureForBrightness } = await load('../src/components/Scene/PostProcessing.tsx');
const { ROAD_GRID_SPACING } = await load('../src/lib/constants.ts');
const { createGroundCoverGeometry, createGroundCoverPlacements, createGroundCoverMaterial } =
  await load('../src/components/Scene/DenseGroundCover.tsx');
const { createDenseJunglePlacements, jungleGroundHeight } = await load('../src/components/Scene/DenseJungle.tsx');
const { selectAuthoredShrubPlacements, AUTHORED_JUNGLE_ASSETS } = await load('../src/components/Scene/AuthoredJunglePlants.tsx');
const { createPhotoFernPlacements, createPhotoFernMaterial, createPhotoFernAlphaTexture,
  photoFernGrassHeightScale, PHOTO_FERN_TRIANGLES } =
  await load('../src/components/Scene/PhotoFerns.tsx');
const { FILE_OBJECTIVE_RESERVED_ZONE } = await load('../src/lib/mission.ts');
const { TERRAIN_MOUNDS, intersectsTerrainMound } = await load('../src/lib/terrain.ts');
const { TerrainReliefMesh } = await load('../src/components/Scene/TerrainReliefMesh.tsx');
const { createForestPerimeterPlacements, createForestPerimeterResources, ForestPerimeterGeometry } =
  await load('../src/components/Scene/ForestPerimeter.tsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend({ Group: THREE.Group, Mesh:THREE.Mesh, InstancedMesh: THREE.InstancedMesh });
const reliefScene = new THREE.Scene();
const reliefState = { scene: reliefScene, internal: { active: false, frames: 0, interaction: [],
  initialHits: [], hovered: new Map(), capturedMap: new Map(), subscribe: () => () => {} }, invalidate() {} };
const reliefStore = { getState: () => reliefState };
// Minimal root descriptor normally attached by Canvas.configure; no renderer
// or application hook is mocked in the material/instance update test.
reliefScene.__r3f = { root: reliefStore, type: 'scene', parent: null, children: [],
  props: {}, object: reliefScene, eventCount: 0, handlers: {}, isHidden: false };
const failRelief = error => { throw error; };
const reliefRoot = reconciler.createContainer(reliefStore, 1, null, false, null, '', failRelief, failRelief, failRelief, null);
const reliefMaterials = [1968, 1969, 4277391332].map(seed => createTerrainMaterial(seed, 0));
let originalRelief;
for (const { material } of reliefMaterials) {
  await act(async () => reconciler.updateContainer(
    React.createElement(React.StrictMode, null, React.createElement(TerrainReliefMesh, { material })),
    reliefRoot, null, null,
  ));
  const mesh = reliefScene.getObjectByName('terrain-relief');
  assert.ok(mesh?.isMesh && !mesh.isInstancedMesh, 'One static batch of individually sculpted banks');
  if (originalRelief) assert.equal(mesh.geometry, originalRelief.geometry, 'Replacing terrain material must not reconstruct geometry');
  originalRelief = mesh;
  assert.equal(mesh.material, material);
  assert.ok(mesh.geometry.index.count/3<=42*440,'Relief stays inside the previous sphere triangle budget');
  const ray = new THREE.Raycaster(), down=new THREE.Vector3(0,-1,0);
  let asymmetries=0;
  for (let index = 0; index < TERRAIN_MOUNDS.length; index++) {
    const mound = TERRAIN_MOUNDS[index];
    const heights=[];
    for(const offset of [-.40,0,.40]){
      const x=mound.x+Math.sin(mound.rotation)*mound.sz*offset,z=mound.z+Math.cos(mound.rotation)*mound.sz*offset;
      ray.set(new THREE.Vector3(x,9,z),down);
      const visible=ray.intersectObject(mesh,false)[0];
      assert.ok(visible && Math.abs(visible.point.y-jungleGroundHeight(x,z))<.00002,'Live drawn triangles agree with foliage height');
      heights.push(visible.point.y);
    }
    if(Math.abs(heights[0]-heights[2])>.13)asymmetries++;
  }
  assert.ok(asymmetries>=25,'Opposing faces of most banks must have visibly different profiles');
  assert.ok(mesh.geometry.boundingSphere?.radius > 50, 'Terrain culling bounds cover all banks');
}
await act(async () => reconciler.updateContainer(null, reliefRoot, null, null));
assert.equal(reliefScene.children.length, 0);
reliefMaterials.forEach(surface => surface.dispose());

// Test the actual perimeter attachment, StrictMode cleanup/re-setup and atlas
// replacement. Missing/failed image loads take this same real RGBA fallback.
const sharedPerimeterAtlas = new THREE.Texture();
let sharedPerimeterAtlasDisposals = 0;
sharedPerimeterAtlas.addEventListener('dispose', () => sharedPerimeterAtlasDisposals++);
for (const atlas of [undefined, sharedPerimeterAtlas]) {
  await act(async () => reconciler.updateContainer(React.createElement(FiberContext.Provider, { value: reliefStore },
    React.createElement(React.StrictMode, null,
      React.createElement(ForestPerimeterGeometry, { seed: 1968, atlas }))), reliefRoot, null, null));
  const crowns = reliefScene.getObjectByName('perimeter-leaf-cutouts');
  const trunks = reliefScene.getObjectByName('perimeter-trunks');
  assert.ok(crowns?.isInstancedMesh && trunks?.isInstancedMesh, 'Perimeter cannot silently hide every tree');
  assert.ok(crowns.count > 700 && trunks.count === 360);
  assert.ok(crowns.material.map, 'Folded white crown geometry must always carry an alpha atlas');
  assert.equal(crowns.material.alphaTest, 0.48);
  assert.equal(crowns.material.transparent, false);
  assert.equal(crowns.material.depthWrite, true);
  assert.equal(crowns.material.fog, true, 'Outer tree depth must retain the scene fog');
  if (!atlas) assert.equal(crowns.material.map.format, THREE.RGBAFormat);
  else assert.equal(crowns.material.map, atlas, 'Do not copy the photo atlas or allocate a second GPU texture');
  assert.ok(crowns.boundingSphere.radius > 80 && trunks.boundingSphere.radius > 80);
  const expected = createForestPerimeterPlacements(1968);
  for (const [mesh, instances] of [[crowns, expected.crowns], [trunks, expected.trunks]]) {
    for (let index = 0; index < instances.length; index++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
      assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix)
        .distanceTo(new THREE.Vector3(...instances[index].position)) < 1e-5,
      'StrictMode cannot leave an identity tree at world origin');
    }
  }
}
await act(async () => reconciler.updateContainer(null, reliefRoot, null, null));
assert.equal(reliefScene.children.length, 0);
assert.equal(sharedPerimeterAtlasDisposals, 0, 'Unmount must not dispose the main forest shared atlas');
sharedPerimeterAtlas.dispose();

const perimeterBudgets = [];
for (const seed of [1968, 1969, 4277391332]) {
  const plan = createForestPerimeterPlacements(seed);
  assert.deepEqual(plan, createForestPerimeterPlacements(seed), 'Sector edges must remain seed-stable');
  assert.notDeepEqual(plan, createForestPerimeterPlacements(seed + 1));
  assert.equal(plan.trunks.length, 360);
  const depths = new Set();
  const heights = new Set();
  for (const placement of [...plan.crowns, ...plan.trunks]) {
    assert.ok([...placement.position, ...placement.scale, placement.rotation, placement.tint].every(Number.isFinite));
    assert.ok(placement.scale.every(value => value > 0));
    assert.ok(Math.abs(placement.position[0]) < 90 && Math.abs(placement.position[2]) < 90,
      'Perimeter remains on the existing extended ground instead of exposing the mesh edge');
  }
  for (const trunk of plan.trunks) {
    const depth = Math.max(Math.abs(trunk.position[0]) - 64, Math.abs(trunk.position[2]) - 64);
    assert.ok(depth > -2 && depth < 23);
    depths.add(Math.floor(depth)); heights.add(Math.floor(trunk.scale[1]));
  }
  assert.ok(depths.size >= 22 && heights.size >= 8, 'Perimeter must have depth and height variety, not three hedge rows');
  // Each 16m edge segment must still see foliage beyond it. DenseJungle adds
  // further trees here, but the perimeter must independently retain enclosure.
  for (const side of [-1, 1]) for (let along = -56; along <= 56; along += 16) {
    for (const axis of [0, 2]) {
      const other = axis === 0 ? 2 : 0;
      assert.ok(plan.trunks.some(p => p.position[axis] * side >= 62
        && Math.abs(p.position[other] - along) < 10), 'Do not remove a complete visible edge segment');
    }
  }
  const resource = createForestPerimeterResources({ value: 0 });
  const triangles = plan.crowns.length * resource.crown.getAttribute('position').count / 3
    + plan.trunks.length * resource.trunk.getAttribute('position').count / 3;
  assert.ok(triangles < 90000, 'Perimeter retains two bounded instanced draws with no shadow or reflection pass');
  let disposed = 0;
  for (const key of ['crown', 'trunk', 'canopy', 'bark', 'texture']) resource[key].addEventListener('dispose', () => disposed++);
  resource.dispose(); assert.equal(disposed, 5, 'Owned fallback and buffers must all be released');
  perimeterBudgets.push(`${seed}:${triangles} triangles/${plan.crowns.length} crown clusters`);
}

// Compare the optimized collision index with actual inverse render matrices,
// not a second copy of the same trigonometry that could repeat a sign error.
const inverseMoundTransforms = TERRAIN_MOUNDS.map(mound => ({
  inverse: new THREE.Matrix4().compose(new THREE.Vector3(mound.x, mound.y, mound.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mound.rotation),
    new THREE.Vector3(1, 1, 1)).invert(), mound,
}));
for (const padding of [0, 0.5, 0.82, 1.5]) {
  for (let x = -90; x <= 90; x += 2.73) {
    for (let z = -90; z <= 90; z += 3.17) {
      const expected = inverseMoundTransforms.some(({inverse, mound}) => {
        const p = new THREE.Vector3(x, 0, z).applyMatrix4(inverse);
        return (p.x / (mound.sx * 0.88 + padding)) ** 2
          + (p.z / (mound.sz * 0.88 + padding)) ** 2 < 1;
      });
      assert.equal(intersectsTerrainMound(x, z, padding), expected,
        `Hill collision must follow rendered Y rotation at ${x},${z}, padding ${padding}`);
    }
  }
}

const created = [];
const summaries = [];
const measuredGeometryTriangles = new Map();
function checkGeometry(name, factory, triangleLimit, dimensions) {
  const geometry = factory();
  const repeated = factory();
  created.push(geometry, repeated);
  assert.ok(geometry.isBufferGeometry, `${name}: expected shared BufferGeometry`);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = geometry.getAttribute('color');
  assert.ok(positions.count > 0 && positions.itemSize === 3, `${name}: empty or invalid vertices`);
  assert.equal(normals.count, positions.count, `${name}: every vertex needs a normal`);
  assert.equal(colors.count, positions.count, `${name}: every vertex needs a color`);
  for (const attributeName of ['position', 'normal', 'color']) {
    const attribute = geometry.getAttribute(attributeName);
    assert.ok(attribute.array.every(Number.isFinite), `${name}: non-finite ${attributeName}`);
    assert.deepEqual(attribute.array, repeated.getAttribute(attributeName).array,
      `${name}: generation must be deterministic`);
  }
  for (const attributeName of ['uv', 'leafSurface', 'coverSurface']) {
    const attribute = geometry.getAttribute(attributeName);
    if (!attribute) continue;
    assert.equal(attribute.count, positions.count, `${name}: incomplete ${attributeName}`);
    assert.ok(attribute.array.every(Number.isFinite), `${name}: non-finite ${attributeName}`);
    assert.deepEqual(attribute.array, repeated.getAttribute(attributeName).array,
      `${name}: ${attributeName} must repeat with the shared geometry`);
    if (attributeName === 'leafSurface' || attributeName === 'coverSurface') {
      assert.ok(attribute.array.every(value => value === 0 || value === 1),
        `${name}: atlas masking must distinguish stems from leaf surfaces`);
    }
  }
  for (let i = 0; i < normals.count; i++) {
    const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
    assert.ok(length > 0.99 && length < 1.01,
      `${name}: degenerate triangle or non-unit lighting normal at vertex ${i}`);
  }
  assert.ok(colors.array.every(value => value >= 0 && value <= 1), `${name}: color outside linear RGB bounds`);
  const elements = geometry.index?.count ?? positions.count;
  assert.equal(elements % 3, 0, `${name}: incomplete triangle`);
  const triangles = elements / 3;
  assert.ok(triangles <= triangleLimit, `${name}: ${triangles} triangles exceeds ${triangleLimit} shared-asset budget`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const values = [...size.toArray(), ...geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius];
  assert.ok(values.every(Number.isFinite), `${name}: invalid culling bounds`);
  assert.ok(geometry.boundingSphere.radius > 0, `${name}: empty culling sphere`);
  dimensions(geometry.boundingBox, size);
  summaries.push(`${name}=${triangles}`);
  measuredGeometryTriangles.set(name, triangles);
  return triangles;
}

const crownDimensions = (_box, size) => {
  assert.ok(size.x >= 2 && size.x <= 8 && size.z >= 2 && size.z <= 8,
    'Crown must span several metres without becoming an oversized canopy slab');
  assert.ok(size.y >= 0.4 && size.y <= 4, 'Crown must have layered depth rather than a flat card');
};
const trunkDimensions = (box, size) => {
  assert.ok(box.min.y > -0.2 && box.max.y < 1.25 && size.y >= 0.9,
    'Trunk height is normalized for tree instances; branches must not inflate vertical scale');
  assert.ok(size.x > 0.1 && size.z > 0.1 && size.x < 5 && size.z < 5,
    'Trunks and forks need bounded, nonzero cross sections');
};
const compactPlant = (_box, size) => {
  assert.ok(size.x > 0.1 && size.z > 0.1 && size.x < 8 && size.z < 8);
  assert.ok(size.y > 0.02 && size.y < 4, 'Understory geometry should remain below tree scale');
};

const crownNear = checkGeometry('crown-near', () => plants.createJungleCrownGeometry('near'), 116, crownDimensions);
const crownFar = checkGeometry('crown-far', () => plants.createJungleCrownGeometry('far'), 56, crownDimensions);
const crownMid = checkGeometry('crown-mid', () => plants.createJungleCrownGeometry('mid'), 80, crownDimensions);
assert.ok(crownFar < crownNear, 'Distant crowns must reduce geometry work');
for (const palm of [false, true]) {
  const name = palm ? 'palm-trunk' : 'tree-trunk';
  const near = checkGeometry(`${name}-near`, () => plants.createJungleTrunkGeometry(palm, 'near'), 1500, trunkDimensions);
  const far = checkGeometry(`${name}-far`, () => plants.createJungleTrunkGeometry(palm, 'far'), 600, trunkDimensions);
  assert.ok(far < near, `${name}: distant trunks must reduce geometry work`);
  for (const detail of ['near', 'far']) {
    const trunk = plants.createJungleTrunkGeometry(palm, detail);
    created.push(trunk);
    const positions = trunk.getAttribute('position');
    const rings = detail === 'near' ? 6 : 3;
    const sides = detail === 'near' ? 8 : 6;
    const mainTrunkVertices = (rings - 1) * sides * 6;
    // The main stem's circular rings surround evenly spaced normalized Y
    // anchors. Their local Y thickness must stay small before full tree-height
    // scaling; otherwise a curved stem turns into metre-high wedges in game.
    for (let vertex = 0; vertex < mainTrunkVertices; vertex++) {
      const y = positions.getY(vertex);
      const ringY = Math.round(y * (rings - 1)) / (rings - 1);
      assert.ok(Math.abs(y - ringY) < 0.025,
        `${name}/${detail}: tilted trunk ring will stretch into a tall bark spike`);
    }
    for (let ring = 1; ring < rings; ring++) {
      const firstVertex = (ring - 1) * sides * 6;
      const radialDirection = (vertex, height) => new THREE.Vector3(
        positions.getX(vertex) - Math.sin(height * 2.1) * (palm ? 0.4 : 0.19),
        0,
        positions.getZ(vertex) - Math.sin(height * 3.5) * 0.14,
      ).normalize();
      const lowerRadius = radialDirection(firstVertex, (ring - 1) / (rings - 1));
      const upperRadius = radialDirection(firstVertex + 2, ring / (rings - 1));
      assert.ok(lowerRadius.dot(upperRadius) > 0.8,
        `${name}/${detail}: matching ring vertices must not twist into a pinched trunk`);
    }
  }
}
checkGeometry('palm-crown', plants.createJunglePalmGeometry, 2000, crownDimensions);
checkGeometry('fern', plants.createJungleFernGeometry, 1200, compactPlant);
checkGeometry('broadleaf', plants.createJungleBroadleafGeometry, 600, compactPlant);
const shrubTriangles = checkGeometry('shrub-sprays', plants.createJungleShrubGeometry, 48, compactPlant);
const bananaTriangles = checkGeometry('banana', plants.createJungleBananaGeometry, 600, compactPlant);
const grassTriangles = checkGeometry('ground-cover', createGroundCoverGeometry, 60, compactPlant);
checkGeometry('vine', plants.createJungleVineGeometry, 600, (box, size) => {
  assert.ok(box.min.y <= -0.9 && box.max.y < 0.3 && size.y < 1.5,
    'Vines must hang downward from a normalized anchor');
  assert.ok(size.x < 1.5 && size.z < 1.5, 'Vines must remain slender');
});

function standardShader() {
  return {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
}
function assertShaderText(shader) {
  for (const text of [shader.vertexShader, shader.fragmentShader]) {
    assert.ok(!/\b(?:NaN|Infinity|undefined)\b/.test(text), 'Shader contains a non-finite or missing constant');
    assert.match(text, /void main\(\)/, 'Shader patch must preserve Three.js entry points');
  }
}

const time = { value: 2.5 };
const foliage = plants.createJungleFoliageMaterial(time, 0.08);
const strongerFoliage = plants.createJungleFoliageMaterial(time, 0.16);
created.push(foliage, strongerFoliage);
assert.equal(foliage.transparent, false, 'Dense canopy must not become an alpha-overdraw layer');
assert.equal(foliage.depthWrite, true);
assert.equal(foliage.side, THREE.DoubleSide, 'Folded leaves should be lit from both sides');
const foliageShader = standardShader();
foliage.onBeforeCompile(foliageShader, null);
assertShaderText(foliageShader);
assert.equal(foliageShader.uniforms.jungleTime, time, 'All foliage must share the supplied clock uniform');
time.value = 8;
assert.equal(foliageShader.uniforms.jungleTime.value, 8, 'Animation must update without replacing instance matrices');
assert.match(foliageShader.vertexShader, /#ifdef USE_INSTANCING/);
assert.match(foliageShader.vertexShader, /instanceMatrix\[3\]\.xyz/);
assert.match(foliageShader.vertexShader, /transformed\.x \+=/);
assert.notEqual(foliage.customProgramCacheKey(), strongerFoliage.customProgramCacheKey(),
  'Different baked wind strengths need distinct cached shader programs');

const canopyTexture = plants.createJungleCanopyTexture();
const {configureBranchSpray, createSignalCrownTexture} = await load('../src/components/Scene/signalCrown.ts');
{
  const primary = createSignalCrownTexture(), boundary = createSignalCrownTexture();
  assert.equal(primary.source, boundary.source, 'Sector and perimeter use one fallback texture upload');
  assert.equal(primary.magFilter, THREE.LinearFilter);
  assert.equal(primary.minFilter, THREE.LinearMipmapLinearFilter);
  const {width, height, data} = primary.image;
  assert.deepEqual([width,height],[64,64]);
  let solid=0, open=0, perforatedRows=0;
  const palette=new Set();
  for(let y=0;y<height;y++) {
    let runs = 0, prev = false;
    for(let x=0;x<width;x++){
      const offset=(y*width+x)*4, a=data[offset+3], leaf=a>=123;
      if (leaf && !prev) runs++;
      prev=leaf;
      if(leaf){solid++;palette.add(data[offset]*65536+data[offset+1]*256+data[offset+2]);}
      else if(a===0)open++;
    }
    if(runs>=4) perforatedRows++;
  }
  assert(solid>400&&open>1800&&perforatedRows>=18&&palette.size>=6,
    'Fallback branch must separate into multiple connected leaflets with clear gaps, not one painted bulb');
  const shared = configureBranchSpray(new THREE.Texture());
  const version = shared.version;
  assert.equal(configureBranchSpray(shared).version, version, 'Second atlas consumer must not schedule another upload');
  assert.equal(shared.minFilter, THREE.LinearMipmapLinearFilter);
  shared.dispose();
  for(const detail of ['near','mid','far']){
    const g=plants.createJungleCrownGeometry(detail);
    assert(g.getAttribute('leafSurface').array.every(v=>v===1),'All crown faces must be real textured branches; reject opaque infill shells');
    const uv=g.getAttribute('uv');
    for(let i=0;i<uv.count;i+=3){
      const min=Math.min(...[0,1,2].map(j=>uv.getX(i+j))), max=Math.max(...[0,1,2].map(j=>uv.getX(i+j)));
      assert(max-min>.95,'Each folded card samples across the branch alpha silhouette, never a cropped opaque patch');
    }
    g.dispose();
  }
  primary.dispose();boundary.dispose();
}
const repeatedCanopyTexture = plants.createJungleCanopyTexture();
created.push(canopyTexture, repeatedCanopyTexture);
assert.ok(canopyTexture.isDataTexture, 'Procedural canopy fallback must work without a DOM');
assert.equal(canopyTexture.format, THREE.RGBAFormat, 'Canopy cards require actual alpha, not a painted backdrop');
assert.equal(canopyTexture.colorSpace, THREE.SRGBColorSpace);
assert.equal(canopyTexture.generateMipmaps, true);
assert.equal(canopyTexture.minFilter, THREE.LinearMipmapLinearFilter);
assert.equal(canopyTexture.anisotropy, 4, 'Oblique leaves need bounded anisotropic filtering');
assert.deepEqual(canopyTexture.image.data, repeatedCanopyTexture.image.data,
  'Fallback canopy leaves must not change on remount');
let solidCanopyPixels = 0;
let clearCanopyPixels = 0;
for (let i = 3; i < canopyTexture.image.data.length; i += 4) {
  if (canopyTexture.image.data[i] > 128) solidCanopyPixels++;
  if (canopyTexture.image.data[i] === 0) clearCanopyPixels++;
}
const canopyPixels = canopyTexture.image.width * canopyTexture.image.height;
assert.ok(solidCanopyPixels > canopyPixels * 0.08 && clearCanopyPixels > canopyPixels * 0.4,
  'Leaf spray must have useful coverage and genuinely open fine-grained edges');

const canopyMaterial = plants.createJungleCanopyMaterial(time, canopyTexture);
const safeCanopyShader = standardShader();
canopyMaterial.onBeforeCompile(safeCanopyShader, null);
assert.match(safeCanopyShader.fragmentShader, /#ifndef USE_MAP\s+discard;/,
  'An accidentally removed atlas must never reveal whole white cards');
const branchAtlas = await readFile(new URL('../public/images/textures/jungle-branch-spray-v1.png', import.meta.url));
assert.deepEqual([...branchAtlas.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.equal(branchAtlas[25], 6, 'The shared outer forest photo must preserve actual PNG RGBA coverage');
const surfaceMaterial = plants.createJungleSurfaceLeafMaterial(time, canopyTexture, 0.035);
const fasterSurfaceMaterial = plants.createJungleSurfaceLeafMaterial(time, canopyTexture, 0.075);
created.push(canopyMaterial, surfaceMaterial, fasterSurfaceMaterial);
for (const material of [canopyMaterial, surfaceMaterial]) {
  assert.equal(material.map, canopyTexture, 'Foliage must share its caller-owned atlas');
  assert.equal(material.transparent, false, 'Leaf cutouts must use alpha testing, not sorted transparency');
  assert.equal(material.depthWrite, true);
  assert.ok(material.alphaTest >= 0.4 && material.alphaTest <= 0.55,
    'Leaf edges require a positive cutoff without excessively eroding silhouette');
  assert.equal(material.side, THREE.DoubleSide);
  const shader = standardShader();
  material.onBeforeCompile(shader, null);
  assertShaderText(shader);
  assert.equal(shader.uniforms.jungleTime, time, 'Mapped foliage must retain the shared GPU wind clock');
  assert.ok(!shader.fragmentShader.includes('float jungleVeins'),
    'Photographic foliage must not inherit extra procedural leaf markings');
}
const canopyShader = standardShader();
canopyMaterial.onBeforeCompile(canopyShader, null);
assert.match(canopyShader.fragmentShader, /hemisphereLights\[0\]\.skyColor/,
  'Canopy backfill must follow scene lighting rather than glow through the nightmare');
const surfaceShader = standardShader();
surfaceMaterial.onBeforeCompile(surfaceShader, null);
assert.match(surfaceShader.vertexShader, /attribute float leafSurface/);
assert.match(surfaceShader.vertexShader, /vMapUv = vec2\(0\.522, 0\.81\) \+ uv \* vec2\(0\.104, 0\.176\)/,
  'Curved foreground leaves must sample the authored single-leaf atlas region');
assert.match(surfaceShader.fragmentShader, /step\(0\.5, vLeafSurface\)/,
  'Stem geometry must stay opaque while leaf edges use the photo alpha');
assert.equal(surfaceMaterial.vertexColors, false,
  'Photographic leaves must not be multiplied by old dark procedural green');
assert.notEqual(surfaceMaterial.customProgramCacheKey(), fasterSurfaceMaterial.customProgramCacheKey());
const bananaMask = plants.createJungleBananaGeometry();
created.push(bananaMask);
assert.ok(bananaMask.getAttribute('leafSurface').array.includes(0), 'Banana pseudostems need an opaque mask');
assert.ok(bananaMask.getAttribute('leafSurface').array.includes(1), 'Banana leaves need a photographic surface mask');
{
  const mat = plants.createJungleUnderstoryMaterial(time);
  const shader = standardShader();
  applyFoliageSightline(mat, sightlineUniforms);
  mat.onBeforeCompile(shader, null);
  assertShaderText(shader);
  assert.equal(bananaMask.getAttribute('bananaTissue'), bananaMask.getAttribute('leafSurface'));
  const vine = plants.createJungleVineGeometry();
  assert(vine.getAttribute('bananaTissue').array.every(v => v === 0), 'Do not paint banana veins on vines');
  assert.match(shader.fragmentShader, /fwidth\(course\)/, 'Fade fine tears and veins when subpixel');
  const plate=shader.uniforms.bananaBladePlate.value;
  assert.ok(plate.isDataTexture&&plate.generateMipmaps&&plate.minFilter===THREE.LinearMipmapLinearFilter,
    'Banana tissue and edge splits must smoothly filter at the chase camera');
  const image=plate.image;let holes=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    const alpha=image.data[(image.width*y+x)*4+3];
    if(alpha<123)holes++;
    if(Math.abs(x/image.width-.5)<.115)assert.equal(alpha,255,'Small edge tears never sever the central midrib');
  }
  assert(holes>image.width*image.height*.01&&holes<image.width*image.height*.17,'Irregular margin, not bare or broadly transparent blades');
  const bladeNormals=bananaMask.getAttribute('normal'),bladeMask=bananaMask.getAttribute('leafSurface');
  let curved=0;
  for(let i=0;i<bladeNormals.count;i+=3)if(bladeMask.getX(i)>.5&&
    Math.hypot(bladeNormals.getX(i+1)-bladeNormals.getX(i),bladeNormals.getY(i+1)-bladeNormals.getY(i),
      bladeNormals.getZ(i+1)-bladeNormals.getZ(i))>.012)curved++;
  assert(curved>220,'Broad leaves have continuous cupped cross sections, not flat lit triangles');
  assert(shader.fragmentShader.indexOf('vec3 blade =') < shader.fragmentShader.indexOf('float wetLeafValue='),
    'Final rain grade must also apply to painted banana surfaces');
  vine.dispose(); mat.dispose();
}
const photoAtlas = await readFile(new URL('../public/images/textures/jungle-branch-spray-v1.png', import.meta.url));
assert.deepEqual([...photoAtlas.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'Original branch atlas must import as a PNG');
assert.equal(photoAtlas.toString('ascii', 12, 16), 'IHDR');
assert.equal(photoAtlas[25], 6, 'Original photographic atlas must retain RGBA alpha');
assert.ok(photoAtlas.readUInt32BE(16) >= 512 && photoAtlas.readUInt32BE(16) <= 2048);
assert.ok(photoAtlas.readUInt32BE(20) >= 512 && photoAtlas.readUInt32BE(20) <= 2048);
let sharedAtlasDisposals = 0;
canopyTexture.addEventListener('dispose', () => sharedAtlasDisposals++);
surfaceMaterial.dispose();
assert.equal(sharedAtlasDisposals, 0, 'Disposing a foliage material must not dispose the shared atlas');

const grassTime = { value: 0 };
const grassTank = { value: new THREE.Vector3(1, 0, 2) };
const grassMaterial = createGroundCoverMaterial(grassTime, grassTank);
const photoGrassMaterial = createGroundCoverMaterial(grassTime, grassTank, canopyTexture);
created.push(grassMaterial, photoGrassMaterial);
const grassShader = standardShader();
grassMaterial.onBeforeCompile(grassShader, null);
assertShaderText(grassShader);
assert.equal(grassMaterial.transparent, false, 'Dense grass must remain an opaque depth-tested surface');
assert.equal(grassShader.uniforms.coverTime, grassTime);
assert.equal(grassShader.uniforms.coverTank, grassTank);
assert.match(grassShader.vertexShader, /cameraPosition\.xz - coverAnchor\.xz/,
  'Tiny distant blades must thin by world-space viewing distance');
assert.match(grassShader.vertexShader, /transformed\.y \*=/,
  'Tank bending and distance fade should animate GPU vertices rather than CPU instance matrices');
assert.match(grassShader.fragmentShader, /if \(vCoverSurface > 0\.5\) discard/,
  'Missing photographic texture must hide cards instead of exposing solid rectangles');
const photoGrassShader = standardShader();
photoGrassMaterial.onBeforeCompile(photoGrassShader, null);
assertShaderText(photoGrassShader);
assert.equal(photoGrassMaterial.map, canopyTexture);
assert.equal(photoGrassMaterial.alphaTest, 0.55, 'Photographic grass should reject generator edge fringe');
assert.equal(photoGrassMaterial.transparent, false);
assert.equal(photoGrassMaterial.depthWrite, true);
assert.equal(photoGrassShader.uniforms.coverTime, grassTime);
assert.equal(photoGrassShader.uniforms.coverTank, grassTank);
assert.match(photoGrassShader.fragmentShader, /step\(0\.5, vCoverSurface\)/,
  'Three-dimensional blades must not be cut away by the photographic card mask');
assert.notEqual(grassMaterial.customProgramCacheKey(), photoGrassMaterial.customProgramCacheKey());
const grassPhotoAtlas = await readFile(new URL('../public/images/textures/jungle-grass-clump-v1.png', import.meta.url));
assert.deepEqual([...grassPhotoAtlas.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.equal(grassPhotoAtlas[25], 6, 'Photographic grass clumps must retain their transparent alpha');

const fernRoot = new URL('../public/models/fern-02/', import.meta.url);
const fernProvenance = JSON.parse(await readFile(new URL('provenance.json', fernRoot), 'utf8'));
assert.equal(fernProvenance.license, 'CC0-1.0');
let fernAssetBytes = 0;
for (const file of fernProvenance.files) {
  const bytes = await readFile(new URL(file.path, fernRoot));
  fernAssetBytes += bytes.length;
  assert.equal(bytes.length, file.bytes, `Photo fern file is incomplete: ${file.path}`);
  assert.equal(createHash('md5').update(bytes).digest('hex'), file.md5,
    `Photo fern must preserve the verified upstream file: ${file.path}`);
}
assert.equal(fernAssetBytes, 1260950, 'Bounded fern import must stay on the 1K texture set');
const fernModel = JSON.parse(await readFile(new URL('fern_02_1k.gltf', fernRoot), 'utf8'));
const fernBuffer = await readFile(new URL('fern_02.bin', fernRoot));
const fernView = new DataView(fernBuffer.buffer, fernBuffer.byteOffset, fernBuffer.byteLength);
const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3 };
function readFernAccessor(index) {
  const accessor = fernModel.accessors[index];
  const bufferView = fernModel.bufferViews[accessor.bufferView];
  const components = componentCounts[accessor.type];
  assert.ok(components, 'Photo fern accessor must use a known component layout');
  assert.ok([5123, 5126].includes(accessor.componentType));
  const bytes = accessor.componentType === 5126 ? 4 : 2;
  const stride = bufferView.byteStride ?? bytes * components;
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let item = 0; item < accessor.count; item++) {
    for (let component = 0; component < components; component++) {
      const offset = start + item * stride + component * bytes;
      assert.ok(offset + bytes <= fernBuffer.byteLength);
      values.push(accessor.componentType === 5126
        ? fernView.getFloat32(offset, true) : fernView.getUint16(offset, true));
    }
  }
  assert.ok(values.every(Number.isFinite), 'Photo fern geometry contains non-finite values');
  return values;
}
const fernTriangleCounts = {};
for (const node of fernModel.nodes) {
  const mesh = fernModel.meshes[node.mesh];
  assert.equal(mesh.primitives.length, 1, 'Each selected fern should need one draw, not multiple material primitives');
  const primitive = mesh.primitives[0];
  const positions = readFernAccessor(primitive.attributes.POSITION);
  const normals = readFernAccessor(primitive.attributes.NORMAL);
  const uvs = readFernAccessor(primitive.attributes.TEXCOORD_0);
  const indices = readFernAccessor(primitive.indices);
  assert.equal(normals.length, positions.length);
  assert.equal(uvs.length, positions.length / 3 * 2);
  assert.ok(indices.every(index => index < positions.length / 3));
  assert.equal(indices.length % 3, 0);
  for (let i = 0; i < normals.length; i += 3) {
    assert.ok(Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1) < 0.01,
      'Photo fern retains normalized authored lighting normals');
  }
  fernTriangleCounts[node.name] = indices.length / 3;
}
assert.equal(Object.values(fernTriangleCounts).reduce((sum, value) => sum + value, 0), 6232);
assert.equal(fernTriangleCounts.fern_02_b, PHOTO_FERN_TRIANGLES.large);
assert.equal(fernTriangleCounts.fern_02_a, PHOTO_FERN_TRIANGLES.compact);
assert.equal(fernModel.materials[0].alphaMode, 'MASK');
assert.equal(fernModel.materials[0].doubleSided, true);
const fernSource = new THREE.MeshStandardMaterial({ map: canopyTexture, normalMap: canopyTexture,
  roughnessMap: canopyTexture, metalnessMap: canopyTexture });
const fernSourceAlpha = new THREE.Texture();
fernSourceAlpha.colorSpace = THREE.SRGBColorSpace;
const fernAlpha = createPhotoFernAlphaTexture(fernSourceAlpha);
assert.notEqual(fernAlpha, fernSourceAlpha);
assert.equal(fernAlpha.flipY, false, 'External alpha must follow glTF UVs, not TextureLoader vertical orientation');
assert.equal(fernAlpha.colorSpace, THREE.NoColorSpace, 'Coverage is data, not an sRGB color');
assert.equal(fernAlpha.anisotropy, 4);
assert.equal(fernAlpha.generateMipmaps, true);
assert.equal(fernSourceAlpha.flipY, true, 'The cached source texture must remain untouched');
assert.equal(fernSourceAlpha.colorSpace, THREE.SRGBColorSpace);
const fernTime = { value: 1 };
const fernMaterial = createPhotoFernMaterial(fernSource, fernAlpha, fernTime);
created.push(fernSource, fernSourceAlpha, fernAlpha, fernMaterial);
assert.notEqual(fernMaterial, fernSource, 'Fern tweaks must not mutate cached glTF material');
assert.equal(fernSource.alphaMap, null);
assert.equal(fernMaterial.alphaMap, fernAlpha, 'JPEG diffuse requires the explicit external cutout mask');
assert.equal(fernMaterial.map, fernSource.map);
assert.equal(fernMaterial.normalMap, fernSource.normalMap);
assert.equal(fernMaterial.roughnessMap, fernSource.roughnessMap);
assert.equal(fernMaterial.aoMap, fernSource.roughnessMap);
assert.equal(fernMaterial.alphaTest, 0.5);
assert.equal(fernMaterial.side, THREE.DoubleSide);
assert.equal(fernMaterial.transparent, false);
assert.equal(fernMaterial.depthWrite, true);
const fernShader = standardShader();
fernMaterial.onBeforeCompile(fernShader, null);
assertShaderText(fernShader);
assert.equal(fernShader.uniforms.photoFernTime, fernTime);
assert.match(fernShader.vertexShader, /instanceMatrix\[3\]\.xyz/);

const clearingRules = {
  distanceToRoad: value => Math.abs(((value + ROAD_GRID_SPACING / 2) % ROAD_GRID_SPACING
    + ROAD_GRID_SPACING) % ROAD_GRID_SPACING - ROAD_GRID_SPACING / 2),
  isInsideObjectiveClearing: (x, z, padding = 0) => (
    Math.abs(x - FILE_OBJECTIVE_RESERVED_ZONE.centerX) <= FILE_OBJECTIVE_RESERVED_ZONE.halfWidth + padding
    && Math.abs(z - FILE_OBJECTIVE_RESERVED_ZONE.centerZ) <= FILE_OBJECTIVE_RESERVED_ZONE.halfDepth + padding),
  isInsidePaddy: (x, z, padding = 0) => Math.abs(x) < 12 + padding && z > -16 - padding && z < 7 + padding,
};
const geometryBudget = {
  nearTrunks: measuredGeometryTriangles.get('tree-trunk-near'),
  farTrunks: measuredGeometryTriangles.get('tree-trunk-far'),
  palmTrunks: measuredGeometryTriangles.get('palm-trunk-near'),
  nearCrowns: crownNear, midCrowns: crownMid, farCrowns: crownFar,
  palms: measuredGeometryTriangles.get('palm-crown'),
  vines: measuredGeometryTriangles.get('vine'),
  ferns: measuredGeometryTriangles.get('fern'),
  broadleaf: measuredGeometryTriangles.get('broadleaf'), bananas: bananaTriangles,
  shrubs: shrubTriangles,
};
const forestBudgets = [];
for (const seed of [1968, 70921, 1234]) {
  const config = { ...clearingRules, seed };
  const forest = createDenseJunglePlacements(config);
  const chunks = createGroundCoverPlacements(config);
  const photoConfig = { ...config, groundHeight: jungleGroundHeight };
  const photoFerns = createPhotoFernPlacements(photoConfig);
  assert.deepEqual(createPhotoFernPlacements(photoConfig), photoFerns, 'Photographic ferns must preserve seeded positions');
  const photographicFernCount = photoFerns.large.length + photoFerns.compact.length;
  assert.ok(photographicFernCount >= 8 && photographicFernCount <= 12);
  assert.ok(photoFerns.large.length <= 4 && photoFerns.compact.length <= 8);
  for (const fern of photoFerns.large) {
    assert.ok(fern.scale >= 1.3 && fern.scale <= 1.48, 'Large fern height must stay naturally 0.52–0.59 metres');
  }
  for (const fern of photoFerns.compact) {
    assert.ok(fern.scale >= 1.12 && fern.scale <= 1.32, 'Compact fern scale must remain unchanged');
  }
  assert.equal(photoFernGrassHeightScale(1000, 1000, photoFerns), 1, 'Unrelated grass must remain unchanged');
  for (const fern of [...photoFerns.large, ...photoFerns.compact]) {
    assert.equal(photoFernGrassHeightScale(fern.x, fern.z, photoFerns), 0.2,
      'Fern roots need a low carpet, not tall grass or a bare circular clearing');
    const single = { large: [fern], compact: [] };
    const edges = [];
    for (let direction = 0; direction < 8; direction++) {
      const angle = direction * Math.PI / 4;
      let previous = 0.2;
      for (let radius = 0; radius <= 1.1; radius += 0.025) {
        const value = photoFernGrassHeightScale(fern.x + Math.cos(angle) * radius,
          fern.z + Math.sin(angle) * radius, single);
        assert.ok(value >= previous - 1e-10 && value - previous < 0.12,
          'The footprint must feather smoothly back into the surrounding grass');
        previous = value;
      }
      edges.push(photoFernGrassHeightScale(fern.x + Math.cos(angle) * 0.76,
        fern.z + Math.sin(angle) * 0.76, single));
    }
    assert.ok(Math.max(...edges) - Math.min(...edges) > 0.12,
      'Natural fern margins must not form identical circular grass rings');
  }
  for (const fern of [...photoFerns.large, ...photoFerns.compact]) {
    assert.ok(Object.values(fern).every(Number.isFinite));
    assert.ok(Math.min(clearingRules.distanceToRoad(fern.x), clearingRules.distanceToRoad(fern.z)) >= 1.7);
    assert.ok(!clearingRules.isInsideObjectiveClearing(fern.x, fern.z, 1.2));
    assert.ok(!clearingRules.isInsidePaddy(fern.x, fern.z, 0.8));
    assert.equal(fern.y, jungleGroundHeight(fern.x, fern.z) + 0.006);
  }
  assert.deepEqual(createDenseJunglePlacements(config), forest, 'Tree and understory placements must repeat exactly');
  assert.deepEqual(createGroundCoverPlacements(config), chunks, 'Grass clumps must repeat exactly');
  assert.equal(chunks.length, 9, 'Grass must retain bounded spatial draw batches');
  const grass = chunks.flatMap(chunk => chunk.placements);
  assert.ok(grass.length >= 7500 && grass.length <= 10000, 'Dense grass needs thousands of clumps within its fixed budget');
  const playableGrass = grass.filter(tuft => Math.max(Math.abs(tuft.x), Math.abs(tuft.z)) < 50);
  assert.ok(playableGrass.length >= 6500,
    'Foreground coverage must receive most of the grass budget before distant terrain');
  assert.ok(forest.shrubs.length >= 1100 && forest.shrubs.length <= 2300,
    'Overlapping shrub clusters must form a real low forest layer within a bounded count');
  assert.ok(forest.nearTrunks.length >= 175 && forest.midCrowns.length >= 550,
    'The playable jungle needs overlapping trees and saplings, not only a remote perimeter');
  {
    // Measured against the actual bark vertices around the first load-bearing
    // fork, rather than duplicating crown placement trigonometry in the test.
    const bark=plants.createJungleTrunkGeometry(), vertex=bark.getAttribute('position'), elbows=[];
    for(let i=0;i<vertex.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(vertex,i);
      if(p.x>.55 && Math.abs(p.y-.44)<.025) elbows.push(p);
    }
    assert(elbows.length>0);
    const offset=forest.midCrowns.length-2*forest.nearTrunks.length;
    for(const [i,trunk] of forest.nearTrunks.entries()){
      const crown=forest.midCrowns[offset+2*i], matrix=new THREE.Object3D();
      matrix.position.set(trunk.x,trunk.y,trunk.z); matrix.rotation.y=trunk.rotation;
      matrix.scale.set(trunk.sx,trunk.sy,trunk.sz); matrix.updateMatrix();
      const root=new THREE.Vector3(crown.x,crown.y,crown.z).applyMatrix4(matrix.matrix.clone().invert());
      assert(elbows.some(p=>Math.hypot(p.x-root.x,p.z-root.z)<.34 && Math.abs(p.y-root.y)<.07),
        'Lower hardwood tier must attach over its rotated physical bark fork');
    }
    bark.dispose();
  }
  for (const tuft of grass) {
    assert.ok(Object.values(tuft).every(Number.isFinite), 'Grass transforms must remain finite');
    const laneDistance = Math.min(clearingRules.distanceToRoad(tuft.x), clearingRules.distanceToRoad(tuft.z));
    assert.ok(laneDistance < 0.4 || laneDistance > 0.88, 'Grass must preserve clear wheel ruts');
    if (laneDistance < 0.4) assert.ok(tuft.height < 0.34, 'Growth between wheel ruts must stay short');
    assert.ok(!clearingRules.isInsideObjectiveClearing(tuft.x, tuft.z, 0.65), 'Grass must clear the objective compound');
    assert.ok(!clearingRules.isInsidePaddy(tuft.x, tuft.z, -0.06), 'Grass must not replace flooded paddies');
  }
  let triangles = grass.length * grassTriangles;
  for (const [name, placements] of Object.entries(forest)) {
    assert.ok(geometryBudget[name] > 0, `${name}: missing a triangle budget`);
    triangles += placements.length * geometryBudget[name];
    for (const placement of placements) {
      assert.ok(Object.values(placement).every(Number.isFinite), `${name}: non-finite transform`);
      assert.ok(placement.sx > 0 && placement.sy > 0 && placement.sz > 0);
    }
  }
  for (const shrub of forest.shrubs) {
    assert.ok(!clearingRules.isInsideObjectiveClearing(shrub.x, shrub.z, 0.8));
    assert.ok(!clearingRules.isInsidePaddy(shrub.x, shrub.z, 0.32));
    const laneDistance = Math.min(clearingRules.distanceToRoad(shrub.x), clearingRules.distanceToRoad(shrub.z));
    assert.ok(laneDistance >= 1.15, 'Dense shrubs must preserve driving lanes');
    if (Math.abs(shrub.x) < 18 && shrub.z > 8 && shrub.z < 54) {
      assert.ok(shrub.sy < 0.49, 'Village shrub layers must remain below firing sightlines');
    }
  }
  triangles += photoFerns.large.length * PHOTO_FERN_TRIANGLES.large + photoFerns.compact.length * PHOTO_FERN_TRIANGLES.compact;
  const authoredShrubs = selectAuthoredShrubPlacements(forest.shrubs);
  assert.equal(authoredShrubs.selected.length, 6, 'Only six original shrub plots receive authored replacements');
  assert.deepEqual(selectAuthoredShrubPlacements(forest.shrubs), authoredShrubs);
  const fallbackTriangles = triangles;
  const extraShrubTriangles = authoredShrubs.selected.length * (AUTHORED_JUNGLE_ASSETS.shrub.triangles - shrubTriangles);
  const savedPalmTriangles = forest.palmTrunks.length * (geometryBudget.palmTrunks + geometryBudget.palms
    - AUTHORED_JUNGLE_ASSETS.palm.triangles);
  const fallbackBatches = Object.keys(forest).length + chunks.length + 2;
  for (const palmReady of [false, true]) for (const shrubReady of [false, true]) {
    const activeTriangles = fallbackTriangles - (palmReady ? savedPalmTriangles : 0) + (shrubReady ? extraShrubTriangles : 0);
    assert.ok(activeTriangles <= 600000, `Seed ${seed}: ${activeTriangles} triangles exceeds 600k during asset transition; foliage instances and per-plant triangle costs: ${['shrubs','broadleaf','bananas'].map(k=>k+'='+forest[k].length+'x'+geometryBudget[k])}`);
    assert.ok(fallbackBatches - Number(palmReady) + Number(shrubReady) <= 24,
      'Foliage/grass/fern draws must remain bounded even if only one optional asset loads');
  }
  triangles += extraShrubTriangles - savedPalmTriangles;
  forestBudgets.push(`${seed}:${triangles} triangles/${grass.length} clumps/${forest.shrubs.length} shrubs/${photographicFernCount} photo ferns/${forest.palmTrunks.length} authored palms`);
}

const terrain = createTerrainMaterial(1968);
const repeatTerrain = createTerrainMaterial(1968);
const alternateTerrain = createTerrainMaterial(1969);
const hillside = createTerrainMaterial(1968, 0);
const texture = terrain.material.bumpMap;
assert.ok(texture?.isDataTexture, 'Terrain grain must generate without a DOM canvas');
assert.ok(texture.image.width >= 64 && texture.image.width <= 512);
assert.equal(texture.image.height, texture.image.width);
assert.equal(texture.image.data.length, texture.image.width * texture.image.height * 4);
assert.ok(texture.image.data.byteLength <= 1024 * 1024, 'Terrain microtexture must retain a small memory footprint');
assert.deepEqual(texture.image.data, repeatTerrain.material.bumpMap.image.data,
  'Revisiting a seeded sector must reproduce its ground grain');
assert.notDeepEqual(texture.image.data, alternateTerrain.material.bumpMap.image.data,
  'Different sector seeds should vary the ground grain');
const intensities = new Set();
for (let i = 0; i < texture.image.data.length; i += 4) {
  const pixels = texture.image.data;
  assert.equal(pixels[i], pixels[i + 1]);
  assert.equal(pixels[i], pixels[i + 2]);
  assert.equal(pixels[i + 3], 255, 'Ground grain must remain fully opaque');
  intensities.add(pixels[i]);
}
assert.ok(intensities.size > 32, 'Ground grain should not collapse to a flat or banded texture');
assert.equal(texture.wrapS, THREE.RepeatWrapping);
assert.equal(texture.wrapT, THREE.RepeatWrapping);
assert.equal(texture.generateMipmaps, true, 'Microtexture needs mipmaps to avoid distant shimmer');
assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
assert.equal(terrain.material.transparent, false);
assert.ok(terrain.material.roughness >= 0.6 && terrain.material.roughness <= 1);
assert.ok(terrain.material.bumpScale > 0 && terrain.material.bumpScale < 0.15);

const terrainShader = standardShader();
terrain.material.onBeforeCompile(terrainShader, null);
assertShaderText(terrainShader);
assert.equal(terrainShader.uniforms.uRoadSpacing.value, ROAD_GRID_SPACING);
assert.equal(terrainShader.uniforms.uRoadStrength.value, 1);
assert.ok(terrainShader.uniforms.uGroundSeed.value >= 0 && terrainShader.uniforms.uGroundSeed.value < 1);
for (const name of ['uSoil', 'uMoss', 'uDryEarth', 'uPackedEarth']) {
  assert.ok(terrainShader.uniforms[name].value.isColor, `${name}: expected a linear color uniform`);
  assert.ok(terrainShader.uniforms[name].value.toArray().every(Number.isFinite));
}
assert.match(terrainShader.vertexShader, /vGroundXZ\s*=\s*\(modelMatrix\s*\*[^;]+\)\.xz/,
  'Soil pattern must be world-anchored, not stretched with camera movement');
assert.match(terrainShader.vertexShader, /groundVertex = instanceMatrix \* groundVertex/,
  'Instanced hills must sample their world location, rather than repeat a local-origin pattern');
assert.match(terrainShader.fragmentShader, /diffuseColor\.rgb \*= earth/,
  'Terrain shader must actually apply the procedural surface color');
assert.match(terrainShader.fragmentShader, /uRoadExtent - abs\(vGroundXZ\)/,
  'Tracks must give way to natural soil before the forest boundary');
assert.match(terrainShader.fragmentShader, /fwidth\(vGroundXZ\)/,
  'Narrow rut contrast must fade with pixel footprint');
assert.match(terrainShader.fragmentShader, /1\.0 - min\(paintedLanes\.x, paintedLanes\.y\) \* 0\.86/,
  'Crossings suppress competing ruts without losing the packed path');
assert.match(terrainShader.fragmentShader, /roughnessFactor = mix\(/,
  'Wet road ruts should vary roughness within the existing lighting model');
assert.ok(terrainShader.fragmentShader.indexOf('float rut =')
  < terrainShader.fragmentShader.indexOf('roughnessFactor = mix('),
  'Roughness patch must use variables declared earlier in the installed Three.js shader');
const alternateShader = standardShader();
alternateTerrain.material.onBeforeCompile(alternateShader, null);
assert.notEqual(terrainShader.uniforms.uGroundSeed.value, alternateShader.uniforms.uGroundSeed.value);
assert.equal(terrain.material.customProgramCacheKey(), alternateTerrain.material.customProgramCacheKey(),
  'Seeds use uniforms and must share the same compiled ground shader');
const hillsideShader = standardShader();
hillside.material.onBeforeCompile(hillsideShader, null);
assert.equal(hillsideShader.uniforms.uRoadStrength.value, 0, 'Road grooves must be disabled on hills');
assert.equal(terrain.material.customProgramCacheKey(), hillside.material.customProgramCacheKey(),
  'Ground and hills should share one shader program with different uniforms');

let materialDisposals = 0;
let textureDisposals = 0;
terrain.material.addEventListener('dispose', () => materialDisposals++);
texture.addEventListener('dispose', () => textureDisposals++);
terrain.dispose();
assert.equal(materialDisposals, 1, 'Exiting a sector must dispose its ground material');
assert.equal(textureDisposals, 1, 'Exiting a sector must dispose its generated texture');
repeatTerrain.dispose();
alternateTerrain.dispose();
hillside.dispose();

const brightnessValues = [0.7, 0.9, 1.1, 1.3, 1.5, 1.8];
const exposures = brightnessValues.map(exposureForBrightness);
assert.ok(exposures.every(value => Number.isFinite(value) && value > 0 && value < 4));
for (let i = 1; i < exposures.length; i++) {
  assert.ok(exposures[i] > exposures[i - 1], 'Brightness must visibly increase exposure at every setting');
}
assert.equal(exposureForBrightness(-100), exposures[0], 'Exposure must clamp below the supported range');
assert.equal(exposureForBrightness(100), exposures.at(-1), 'Exposure must clamp above the supported range');
assert.equal(exposureForBrightness(NaN), exposureForBrightness(1.3));
assert.equal(exposureForBrightness(Infinity), exposureForBrightness(1.3));

for (const resource of created) resource.dispose();
console.log(`Scene asset checks passed: ${summaries.join(', ')} triangles; ${forestBudgets.join('; ')}; perimeter ${perimeterBudgets.join('; ')}; finite deterministic geometry, LOD bounds, shader hooks, seeded terrain, disposal, and exposure.`);
