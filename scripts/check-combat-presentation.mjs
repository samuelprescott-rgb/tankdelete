import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import ts from 'typescript';

const modules = new Map();
async function moduleURL(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let js = ts.transpileModule(await readFile(url, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const match of [...js.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
    let target;
    if (match[2].startsWith('.')) {
      let local = new URL(`${match[2]}.ts`, url);
      if (!ts.sys.fileExists(fileURLToPath(local))) local = new URL(`${match[2]}.tsx`, url);
      target = await moduleURL(local);
    } else target = import.meta.resolve(match[2]);
    js = js.replace(match[0], `from '${target}'`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  modules.set(url.href, result); return result;
}
const load = async path => import(await moduleURL(new URL(path, import.meta.url)));
const weapons = await load('../src/lib/tankWeapons.ts');
const { CANNON_BARREL_MOUNT_Z, cannonRecoilPosition } = await load('../src/components/Scene/tankGeometry.ts');
const position = new THREE.Vector3(), direction = new THREE.Vector3();
for (const tankYaw of [0, 0.6, Math.PI, -2]) for (const turretYaw of [-2.4, 0, 1.7]) for (const recoil of [0, 0.6, 1]) {
  const tank = new THREE.Group(), turret = new THREE.Group();
  tank.position.set(12, 0.2, -18); tank.rotation.y = tankYaw;
  turret.position.set(0, 0.72, 0.02); turret.rotation.y = turretYaw; tank.add(turret);
  for (const machineGun of [false, true]) {
    const mount = new THREE.Group(), muzzle = new THREE.Group();
    mount.position.set(machineGun ? 0.42 : 0, machineGun ? 0.48 : 0.1,
      machineGun ? -0.02 + recoil * 0.02 : cannonRecoilPosition(recoil));
    muzzle.position.set(...(machineGun ? weapons.MACHINE_GUN_MUZZLE_SOCKET : weapons.CANNON_MUZZLE_SOCKET));
    turret.add(mount); mount.add(muzzle);
    // Deliberately don't update ancestors: sampling must handle input before render.
    weapons.sampleTankMuzzle(muzzle, position, direction);
    const cap = new THREE.Vector3(0, machineGun ? 0.08 : 0, machineGun ? -1.015 : -1.44).applyMatrix4(mount.matrixWorld);
    assert.ok(Math.abs(position.distanceTo(cap) - 0.002) < 1e-9, 'Round starts 2mm beyond the visible barrel end');
    assert.ok(Math.abs(direction.length() - 1) < 1e-9);
    assert.ok(position.clone().sub(cap).normalize().dot(direction) > 0.999999, 'Launch direction points out through the muzzle');
    for (const delta of [0, 1 / 144, 1 / 60, 1 / 30, 0.25]) {
      const travel = (machineGun ? 57.75 : 35) * delta;
      const length = weapons.tankTracerLength(machineGun, travel);
      assert.ok(length <= travel && length >= 0, 'First visible tail never extends behind the muzzle');
      const tail = position.clone().addScaledVector(direction, travel - length);
      assert.ok(tail.clone().sub(position).dot(direction) >= -1e-9);
    }
  }
}
assert.equal(cannonRecoilPosition(0), CANNON_BARREL_MOUNT_Z);
const tankSource = await readFile(new URL('../src/components/Scene/Tank.tsx', import.meta.url), 'utf8');
assert.match(tankSource, /ref=\{cannonMuzzleRef\} position=\{CANNON_MUZZLE_SOCKET\}/);
assert.match(tankSource, /ref=\{machineGunMuzzleRef\} position=\{MACHINE_GUN_MUZZLE_SOCKET\}/);
assert.match(tankSource, /sampleTankMuzzle\(activeMuzzle, tempWorldPos, tempWorldDir\)/);
assert.match(tankSource, /sampleTankMuzzle\(muzzle, tempWorldPos, tempWorldDir\)/);
const projectiles = await readFile(new URL('../src/components/Scene/ProjectileManager.tsx', import.meta.url), 'utf8');
const tracers = await readFile(new URL('../src/components/Scene/RoundTracers.tsx', import.meta.url), 'utf8');
assert.match(projectiles, /tracers\.write\(instanceCount\+\+, projectile.position, tangent, projectile.lifetime \* speed, projectile.kind === 'machinegun'\)/);
assert.match(tracers, /tankTracerLength\(machineGun, distance\)/);
assert.match(tracers, /depthTest: true/);
assert.doesNotMatch(projectiles, /depthTest=\{false\}/, 'Rounds must not draw over their own tank or scenery');

const { createNapalmParticleMaterial, createNapalmParticleGeometry, createNapalmScorchMaterial } = await load('../src/components/Scene/napalmMaterials.ts');
const geometry = createNapalmParticleGeometry(1, 2, 112);
assert.equal(geometry.getAttribute('aParticleSeed').count, 112);
assert.ok(geometry.getAttribute('aParticleSeed').array.every(value => Number.isFinite(value) && value >= 0 && value < 1));
geometry.dispose();
const scorch = createNapalmScorchMaterial();
const shader = { vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
scorch.onBeforeCompile(shader, {});
assert.match(shader.fragmentShader, /smoothstep\(0.28, 0.98/); scorch.dispose();
const time = { value: 0 };
const {paintGhostVfxAtlas, FX_H, FX_W, FX_FRAMES}=await load('../src/components/Scene/ghostVfxAtlas.ts');
const packed=paintGhostVfxAtlas(), frames=new Set();
for(let f=0;f<FX_FRAMES;f++){
  const colors=new Set();let pose='';
  for(let y=0;y<FX_H;y++)for(let x=0;x<FX_W;x++){
    const at=((y*FX_FRAMES+f)*FX_W+x)*4;
    const lit=packed[at+3]>0;
    if(lit)colors.add(packed.slice(at,at+3).join(','));
    pose+=lit?'#':'.';
  }
  assert.ok(colors.size>=5,'Every flame pose includes an ink shadow, body, and light core');
  frames.add(pose);
}
assert.equal(frames.size,6,'The six poses must change shape, not merely cycle color');
// Exhaustive coverage of the actual packed geometry, source alpha and flip.
// Sampling corners as well as centers prevents a contour from cutting through
// a one-pixel ember. No two strips may blend the same fragment twice.
for(const [kind,bank,n] of [['fire',0,112],['smoke',1,40]]){
  const g=createNapalmParticleGeometry(kind==='fire'?1:2,2,n,kind),area=[],aa=g.getAttribute('aCelA'),bb=g.getAttribute('aCelB');
  assert.ok(g.index.count<=24,'At most eight triangles per instance, in the same draw');
  let colored=0;
  for(const flip of [false,true])for(let f=0;f<FX_FRAMES;f++){
    const coverage=new Uint8Array(FX_W*FX_H);
    for(let i=0;i<aa.count;i+=4){
      const rect=Array.from({length:4},(_,k)=>{
        const packed=(f<3?aa:bb).getComponent(i+k,f%3),y=Math.floor(packed/32),x=packed-y*32;
        assert.ok(Number.isInteger(x)&&x>=0&&x<=FX_W&&y>=0&&y<=FX_H);
        return [flip?FX_W-x:x,y];
      });
      assert.deepEqual(rect.map(q=>q[0]),[rect[0][0],rect[1][0],rect[1][0],rect[0][0]]);
      assert.deepEqual(rect.map(q=>q[1]),[rect[0][1],rect[0][1],rect[2][1],rect[2][1]]);
      const left=Math.min(rect[0][0],rect[1][0]),right=Math.max(rect[0][0],rect[1][0]);
      for(let y=rect[0][1];y<rect[2][1];y++)for(let x=left;x<right;x++)coverage[y*FX_W+x]++;
    }
    for(let y=0;y<FX_H;y++)for(let x=0;x<FX_W;x++){
      const ix=flip?FX_W-1-x:x,alpha=packed[((y+FX_H*bank)*FX_W*FX_FRAMES+f*FX_W+ix)*4+3];
      assert.ok(coverage[y*FX_W+x]<=1,'No alpha overdrawing seam');
      if(alpha){colored++;assert.equal(coverage[y*FX_W+x],1,'Every painted cell must survive '+[kind,f,flip,x,y]);}
    }
    area.push(coverage.reduce((a,b)=>a+b,0));
  }
  const old=FX_W*FX_H*area.length,total=area.reduce((a,b)=>a+b);
  assert.ok(total<old*(bank?.51:.68),'Transparent empty area is geometrically skipped');
  console.log(kind+': '+colored+' painted cells retained across six cels in both orientations; '+
    (100*(1-total/old)).toFixed(1)+'% less billboard area submitted.');
  g.dispose();
}
const {makeGhostRoundGeo}=await load('../src/components/Scene/ghostRoundArt.ts');
for(const kind of ['core','tail','nose','flash','chip']){
  const art=makeGhostRoundGeo(kind);art.computeBoundingBox();
  const positions=art.getAttribute('position'), colors=art.getAttribute('color');
  assert.equal(colors.count,positions.count);assert.ok(positions.count<=360);
  if(['core','tail'].includes(kind)){
    assert.ok(art.boundingBox.min.y>=-.501&&art.boundingBox.max.y<=.501,'Rendered trails must not exceed sampled travel bounds');
  }
  art.dispose();
}
const {makeGhostDoomSundae}=await load('../src/components/Scene/ghostDoomSundae.ts');
for(const part of ['wafer','scoop','sparks']){
  const art=makeGhostDoomSundae(part), pos=art.getAttribute('position');
  art.computeBoundingBox();
  assert.equal(pos.count,art.getAttribute('color').count);
  assert.ok(pos.count<=1900 && pos.array.every(Number.isFinite));
  assert.ok(art.boundingBox.min.x>=-.37&&art.boundingBox.max.x<=.37);
  art.dispose();
}
for (const kind of ['fire', 'core', 'smoke']) {
  const material = createNapalmParticleMaterial(time, kind,kind==='smoke'?new THREE.Texture():undefined);
  assert.equal(material.uniforms.uTime, time, 'One shared time uniform, no timer per particle');
  assert.equal(material.depthWrite, false); assert.equal(material.depthTest, true);
  assert.equal(material.blending, THREE.NormalBlending, 'No additive whiteout in the overlapping fire/smoke');
  assert.match(material.vertexShader, /instanceMatrix/);
  assert.match(material.vertexShader, /vPhase = aParticleSeed/, 'Particle drift must not randomize noise phase every frame');
  assert.match(material.vertexShader, /viewMatrix \* worldInstance/, 'Billboards use the actual render camera');
  const atlas=material.uniforms.uGhostCels.value;
  assert.ok(atlas.isDataTexture && atlas.minFilter===THREE.NearestFilter && !atlas.generateMipmaps);
  assert.match(material.fragmentShader,/texture2D\(uGhostCels/);
  assert.match(material.vertexShader,/floor\(uTime\*/, 'The same discrete cel is selected once per vertex, not per fragment');
  assert.match(material.fragmentShader,/float frame=vAtlasFrame/);
  assert.equal(atlas.image.width,144);assert.equal(atlas.image.height,56);
  if (kind === 'smoke') {
    assert.match(material.vertexShader, /mvCenter\.xy \+= sprite \* size/, 'Only suspended smoke pitches with the camera');
    assert.match(material.fragmentShader, /ink.a<.02\)discard/, 'No translucent square surrounding the plume');
  } else {
    assert.match(material.vertexShader, /vec4\(across\.x, sprite\.y \* size\.y, across\.y, 0\.0\)/,
      'Flame up axis stays vertical in world space during camera pitch');
    assert.ok(atlas.image.data.slice(0,144*4).every(v=>v===0), 'Fire sprites must have an irregular foot instead of a solid quad edge');
  }
  assert.match(material.fragmentShader, /colorspace_fragment/);
  let disposed = false; material.addEventListener('dispose', () => { disposed = true; });
  material.dispose(); assert.equal(disposed, true);
}
const ordnance = await readFile(new URL('../src/components/Scene/OrdnanceEffects.tsx', import.meta.url), 'utf8');
assert.match(ordnance, /useFireVolume\('flame'\)/);
assert.match(ordnance, /createSmokeFoldArt\(SMOKE_PARTICLES,time,atlas\)/);
assert.doesNotMatch(ordnance, /dodecahedronGeometry/);
assert.match(ordnance, /onBurnTick\?\.\(strike.id, burnDown\)/, 'Presentation preserves lingering gameplay damage');
assert.match(ordnance, /useEffect\(\(\) => \(\) => assets.dispose\(\), \[assets\]\)/,
  'Shared napalm resources have a session owner and are disposed on exit');
console.log('Combat presentation checks passed: muzzle frames, tracer bounds, depth occlusion, six-cel fire/smoke and owned-resource disposal.');
