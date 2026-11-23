// Mount the real effects in R3F and drive their normal frame subscriptions.
// This verifies topology, phase, reuse and reset without booting the game or GL.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import * as THREE from 'three';
import { build } from 'vite';

// Fiber chooses the frame-subscription effect at module initialization. Load
// the browser branch without leaving a fake window in the rest of the test.
const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true, value: { document: { createElement() {} } },
});
const { act, context, extend, reconciler } = await import('@react-three/fiber').finally(() => {
  if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow);
  else delete globalThis.window;
});

async function loadSource(path, plugins = []) {
  const entry = fileURLToPath(new URL(path, import.meta.url));
  const result = await build({
    configFile: false, logLevel: 'silent', publicDir: false, plugins,
    esbuild: { jsx: 'automatic' },
    build: { ssr: entry, write: false, minify: false, rollupOptions: { output: { format: 'es' } } },
  });
  const source = result.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry).code
    .replace(/from "([^"]+)"/g, (_, id) => 'from ' + JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

const { OrdnanceEffects, selectNapalmLightCue, CampaignFlights, armedFileRenderBatch, createArmedFileInk, registerArmedFileInk } =
  await loadSource('./fixtures/impact-preparation.ts');
// Each designator uses its gameplay footprint and its original outline tint.
const { createStrikePerimeter, createTerminalAlphabet, terminalMarkerInk } = await loadSource('../src/components/Scene/terminalMarkers.ts');
const markerAlphabet = createTerminalAlphabet();
for (const [kind,length,width,tint] of [['napalm',20,5.5,0xffd568],['eagle',48,11,0xfff0a6]]) {
  const frame = createStrikePerimeter(kind), paint = terminalMarkerInk(markerAlphabet,{value:0},kind);
  frame.computeBoundingBox();
  assert.deepEqual(frame.boundingBox.getSize(new THREE.Vector3()).toArray(),[length,width,0]);
  assert.equal(paint.color.getHex(),tint);
  frame.dispose(); paint.dispose();
}
markerAlphabet.dispose();
const { prepareNapalmRender } = await loadSource('../src/components/Scene/prepareNapalmRender.ts');
const { ExplosionParticles } = await loadSource('../src/components/Scene/ExplosionParticles.tsx');
const { NAPALM_TIMELINE } = await loadSource('../src/lib/weapons.ts');
const { createTrainingEntries } = await loadSource('../src/lib/training.ts');
const { fileToScale } = await loadSource('../src/lib/scale.ts');
const { VietnamSkybox } = await loadSource('../src/components/Scene/VietnamSkybox.tsx', [{
  name: 'headless-sky-without-unrelated-perimeter',
  enforce: 'pre',
  resolveId(id) { if (id === './ForestPerimeter') return '\0mock-perimeter'; },
  load(id) { if (id === '\0mock-perimeter') return 'export function CombatSectorPerimeter() { return null; }'; },
}]);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, .1, 340);
camera.position.set(0, 6, -12);
camera.lookAt(0, 0, 12);
camera.updateMatrixWorld();
const subscribers = new Map();
const state = { scene, camera, invalidate() {},
  internal: { active:false, frames:0, interaction:[], initialHits:[], hovered:new Map(), capturedMap:new Map(),
    subscribe(ref, priority) { subscribers.set(ref, priority); return () => subscribers.delete(ref); } } };
const store = Object.assign((selector = value => value) => selector(state), {
  getState: () => state, getInitialState: () => state, subscribe: () => () => {},
});
scene.__r3f = { root:store, type:'scene', parent:null, children:[], props:{}, object:scene, eventCount:0, handlers:{}, isHidden:false };
const fail = error => { throw error; };
const root = reconciler.createContainer(store, 1, null, false, null, '', fail, fail, fail, null);
const impactIds = [], burnTicks = [], completeIds = [];
const onImpact = id => impactIds.push(id), onBurn = (id, strength) => burnTicks.push([id, strength]);
const onComplete = id => completeIds.push(id);
const noOp = () => {};
const mountEffects = (napalmStrikes, explosions = [], onDebrisComplete=noOp) => act(async () => reconciler.updateContainer(
  React.createElement(context.Provider, { value:store }, React.createElement(React.Fragment, null,
    React.createElement(ExplosionParticles, { explosions, onExplosionComplete:onDebrisComplete }),
    React.createElement(OrdnanceEffects, {
      napalmStrikes, onNapalmImpact:onImpact, onNapalmBurnTick:onBurn, onNapalmComplete:onComplete,
    }),
  )), root, null, null));
const initialRenderTarget = new THREE.WebGLRenderTarget(64, 64);
const warmups = [];
let disposedWarmupTargets = 0, disposedWarmupInstances = 0;
let target = initialRenderTarget, face = 2, mip = 1;
const gl = {
  isWebGLRenderer: true, autoClear: false,
  xr:{ enabled: true, isPresenting: false }, shadowMap:{ enabled: true, type: THREE.PCFShadowMap, autoUpdate: true, needsUpdate: true },
  getContext: () => ({ isContextLost: () => false }),
  getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
  setRenderTarget(value, cubeFace = 0, mipLevel = 0) { target = value; face = cubeFace; mip = mipLevel; },
  render(prepScene, prepCamera) {
    target.addEventListener('dispose', () => disposedWarmupTargets++);
    const instances = prepScene.children.filter(object => object.isInstancedMesh);
    for (const object of instances) {
      object.addEventListener('dispose', () => disposedWarmupInstances++);
    }
    warmups.push({ prepScene, prepCamera, instances, environment:scene.environment,
      intensity:scene.environmentIntensity, rotation:scene.environmentRotation.clone(),
      size:[target.width, target.height, target.texture.type, target.samples],
      flags:[this.autoClear, this.xr.enabled, this.shadowMap.autoUpdate, this.shadowMap.needsUpdate] });
  },
};
// The production warmup catches renderer exceptions. Assert recorded facts
// here, not inside the fake renderer where they could be mistaken for driver errors.
function assertWarmup({ prepScene, prepCamera, instances, environment, intensity, rotation, size, flags }, sun) {
  assert.notEqual(prepScene, scene);
  assert.notEqual(prepCamera, camera);
  assert.equal(prepScene.fog, scene.fog);
  assert.equal(prepScene.environment, environment);
  assert.equal(prepScene.environmentIntensity, intensity);
  assert.ok(prepScene.environmentRotation.equals(rotation));
  assert.deepEqual(size, [16,16,THREE.HalfFloatType,0]);
  assert.deepEqual(flags, [true,false,false,false]);
  assert.equal(instances.length, 5);
  assert.ok(instances.some(({material:m,instanceColor}) => m.isMeshBasicMaterial
    && !m.transparent && !m.vertexColors && !m.map && !m.toneMapped && !instanceColor),
    'Warm the distinct untextured, colorless, opaque instanced contact program');
  assert.equal(instances.filter(object => object.receiveShadow).length, 1);
  assert.ok(instances.every(object => object.count === 1));
  const lights = prepScene.children.filter(object => object.isLight);
  assert.deepEqual(lights.map(light => light.type), sun ? ['PointLight', 'DirectionalLight'] : ['PointLight']);
  assert.notEqual(lights[0], scene.getObjectByName('napalm-ground-light'));
  if (sun) {
    assert.ok(sun.shadow.map.depthTexture.compareFunction != null);
    assert.equal(lights[1].shadow.map, sun.shadow.map, 'PCF warmup must borrow the map generated by the first composer draw');
  }
}
function assertRendererRestored(shadowsEnabled = true) {
  assert.deepEqual([target, face, mip], [initialRenderTarget, 2, 1]);
  assert.deepEqual([gl.autoClear, gl.xr.enabled, gl.shadowMap.enabled, gl.shadowMap.autoUpdate, gl.shadowMap.needsUpdate],
    [false,true,shadowsEnabled,true,true]);
}
let elapsed = 0;
function frame(delta) {
  elapsed += delta;
  scene.updateMatrixWorld(true);
  for (const [callback] of [...subscribers].sort((a,b)=>a[1]-b[1])) {
    callback.current({ camera, gl, scene, clock:{ elapsedTime:elapsed } }, delta);
  }
}

async function checkFirstFrameEnvironment() {
  const panorama = new THREE.Texture();
  const originalMap = new THREE.Texture();
  const originalIntensity = 0.43;
  const originalLoad = THREE.TextureLoader.prototype.load;
  const {RIVER_SKY_TEXTURES:[,daySky]}=await loadSource('../src/components/Scene/riverDawnAsset.ts');
  const skyTextures = new Map([
    ['/images/textures/vietnam-monsoon-panorama-v1.png', panorama],
    [daySky, new THREE.Texture()],
    ['/images/textures/field-fire-flame.png', new THREE.Texture()],
    ['/images/textures/charcoal-cloud.png', new THREE.Texture()],
  ]);
  const pending = new Map();
  let warmupsAfterFirstLayout;
  THREE.TextureLoader.prototype.load = function (url, onLoad) {
    assert.ok(skyTextures.has(url), 'Unexpected texture in the mounted sky/ordnance fixture.');
    const texture = skyTextures.get(url);
    pending.set(url, () => onLoad(texture));
    return texture;
  };
  scene.environment = originalMap;
  scene.environmentIntensity = originalIntensity;
  gl.shadowMap.enabled = false; // This sky-only fixture intentionally has no sun.
  // Observe the same mounted scene in a sibling layout effect so this really
  // tests the pre-passive interval, not a frame after act() flushed all effects.
  function FirstFrameProbe() {
    React.useLayoutEffect(() => {
      frame(0);
      warmupsAfterFirstLayout ??= warmups.length;
    }, []);
    return null;
  }
  try {
    await act(async () => reconciler.updateContainer(
      React.createElement(context.Provider, { value:store }, React.createElement(React.StrictMode, null,
        React.createElement(React.Suspense, { fallback:null },
          React.createElement(VietnamSkybox, { seed:1968 }),
          React.createElement(OrdnanceEffects, {
            napalmStrikes:[], onNapalmImpact:noOp, onNapalmComplete:noOp,
          }),
          React.createElement(FirstFrameProbe),
        ),
      )), root, null, null));
    assert.equal(scene.environment, originalMap, 'The suspended sky does not acquire the scene early');
    assert.equal(warmups.length, 0);
    const loaded = new Set();
    while (loaded.size < skyTextures.size) {
      const ready = [...pending].filter(([url]) => !loaded.has(url));
      assert.ok(ready.length, 'The live scene must request its sky and fire textures');
      await act(async () => { for (const [url, complete] of ready) { loaded.add(url); complete(); } });
    }
    assert.equal(scene.environment, panorama);
    assert.equal(warmupsAfterFirstLayout, 1, 'The first layout frame invokes the real R3F warmup before later manual frames');
    assert.equal(warmups.length, 1, 'Strict Mode does not issue another warmup');
    assert.equal(warmups[0].environment, panorama, 'The first warmup sees the committed panorama, not the previous environment');
    assertWarmup(warmups[0]);
    assert.equal(panorama.mapping, THREE.EquirectangularReflectionMapping);
    assert.equal(panorama.colorSpace, THREE.SRGBColorSpace);
    assert.equal(panorama.wrapS, THREE.RepeatWrapping);
    assert.equal(panorama.minFilter, THREE.LinearMipmapLinearFilter);
    frame(.016);
    assert.ok(scene.environmentIntensity < originalIntensity);
    assert.deepEqual([warmups.length, disposedWarmupTargets, disposedWarmupInstances], [1,1,5]);
    assertRendererRestored(false);
    const skyOnly=night=>act(async()=>reconciler.updateContainer(
      React.createElement(context.Provider,{value:store},React.createElement(VietnamSkybox,{seed:1968,nightmareActive:night})),root,null,null));
    await skyOnly(true);
    const sky=scene.children.find(o=>o.material?.uniforms?.uPanorama);
    assert.equal(sky.material.uniforms.uPanorama.value,panorama,'Visible night sky uses the original panorama, not a newly painted replacement.');
    assert.equal(sky.material.uniforms.uDayPaint.value,skyTextures.get(daySky));
    frame(.016);
    assert.equal(sky.material.uniforms.uNightmare.value,1,'Direct horde practice starts under the monsoon immediately.');
    await skyOnly(false);
    frame(.1);
    assert.ok(sky.material.uniforms.uNightmare.value>0&&sky.material.uniforms.uNightmare.value<1,'Retain continuous transition on mode exit.');
    for(let i=0;i<180;i++)frame(1/30);
    assert.ok(sky.material.uniforms.uNightmare.value<.001 && sky.material.uniforms.uTime.value>0);
  } finally {
    gl.shadowMap.enabled = true;
    await act(async () => reconciler.updateContainer(null, root, null, null));
    THREE.TextureLoader.prototype.load = originalLoad;
  }
  assert.equal(scene.environment, originalMap, 'Unmount releases environment ownership');
  assert.equal(scene.environmentIntensity, originalIntensity);
  scene.environment = null;
  scene.environmentIntensity = 1;
  for (const t of skyTextures.values()) t.dispose();
  originalMap.dispose();
  warmups.length = disposedWarmupTargets = disposedWarmupInstances = elapsed = 0;
}

async function checkHiddenCampaignSmoke() {
  gl.shadowMap.enabled = false; // Isolate the hidden effect from the separate sun-readiness fixture.
  const warning = createArmedFileInk(), release = registerArmedFileInk(scene, warning);
  try {
    await act(async () => reconciler.updateContainer(
      React.createElement(context.Provider, { value:store }, React.createElement(React.StrictMode, null,
        React.createElement(CampaignFlights, { running:true, deploy:() => false, onCall:noOp }),
        React.createElement(OrdnanceEffects, {
          napalmStrikes:[], onNapalmImpact:noOp, onNapalmComplete:noOp,
        }),
      )), root, null, null));
    const smoke = scene.getObjectByName('relay-drifting-smoke');
    const liveParent = smoke.parent, liveMatrix = smoke.instanceMatrix;
    assert.equal(smoke.visible, false);
    assert.equal(smoke.instanceColor, null, 'The authored color buffer is still lazy before the ridge hit');
    let resourceDisposals = 0;
    for (const resource of [smoke.geometry, smoke.material, smoke.material.map]) {
      resource.addEventListener('dispose', () => resourceDisposals++);
    }
    frame(0);
    assert.equal(warmups.length, 1);
    const proxy = warmups[0].instances.find(object => object.material === smoke.material);
    assert.ok(proxy && proxy !== smoke, 'The once-only production pass includes a detached live-material proxy');
    assert.equal(proxy.geometry, smoke.geometry);
    assert.equal(proxy.material.map, smoke.material.map);
    assert.equal(proxy.material.transparent, true);
    assert.equal(proxy.material.depthWrite, false);
    assert.equal(proxy.count, 1);
    assert.deepEqual([...proxy.instanceColor.array], [1,1,1], 'Warm USE_INSTANCING_COLOR as well as USE_MAP');
    assert.equal(proxy.castShadow, smoke.castShadow);
    assert.equal(proxy.receiveShadow, smoke.receiveShadow);
    assert.equal(smoke.parent, liveParent);
    assert.equal(smoke.instanceMatrix, liveMatrix);
    assert.equal(smoke.instanceMatrix.version, 0);
    assert.equal(smoke.instanceColor, null, 'Preparation never modifies the live smoke');
    assert.equal(smoke.visible, false);
    assert.equal(smoke.count, 0);
    const stage=warmups[0].prepScene;
    for(const {geometry,material} of [warning.cage,warning.ring]){
      assert.ok(stage.children.some(o=>o.geometry===geometry && o.material===material),'Prepare the reusable armed warnings in the real renderer path');
    }
    const matches=name=>{
      const live=scene.getObjectByName(name), staged=stage.children.filter(o=>o.material===live.material);
      assert.ok(staged.length && !staged.includes(live) && staged.every(o=>o.parent===stage));
      assert.ok(staged.every(o=>o.material.vertexColors && !o.material.fog && !o.material.transparent && !o.material.map
        && o.geometry.getAttribute('color').itemSize===3),'Require the opaque, no-fog RGB shader, not a mapped/fogged/alpha lookalike');
      return {live,staged};
    };
    const streak=matches('relay-impact-streak'), hit=matches('relay-strike-flash'), wake=matches('relay-damaged-engine-wake'),
      trail=matches('relay-tumbling-fire-trail');
    assert.equal(streak.staged[0].geometry,streak.live.geometry);
    assert.deepEqual(hit.staged.map(o=>o.geometry.name).sort(),[0,1,2,3].map(i=>'relay-hit-cel-'+i));
    assert.deepEqual(wake.staged.map(o=>o.geometry.name).sort(),[0,1,2,3].map(i=>'relay-wake-cel-'+i));
    assert.ok(hit.staged.every(o=>!o.isInstancedMesh && o.material.side===THREE.FrontSide));
    assert.ok(wake.staged.every(o=>!o.isInstancedMesh && o.material.side===THREE.DoubleSide));
    assert.ok(trail.staged[0].isInstancedMesh && trail.staged[0].count===1 && !trail.staged[0].instanceColor);
    assert.equal(trail.staged[0].geometry,trail.live.geometry);
    if(process.argv[2]) {
      const {replayRelayShaders}=await import('./fixtures/replay-relay-shaders.mjs');
      await replayRelayShaders(process.argv[2],[streak.staged[0],trail.staged[0],wake.staged[0]]);
    }
    assert.ok([streak,hit,wake,trail].every(({live})=>!live.visible),'Preflighting must not play the cutscene');
    assert.deepEqual([disposedWarmupTargets, disposedWarmupInstances], [1,7]);
    assert.equal(resourceDisposals, 0, 'Proxy disposal must not release shared live geometry, material or texture');
    for (let i = 0; i < 755; i++) frame(1 / 30);
    assert.ok(scene.getObjectByName('campaign-airlift').userData.flightTime < 25.2);
    assert.equal(smoke.visible, false, 'Preflight must not advance the scenic cue');
    for (let i = 0; i < 5; i++) frame(1 / 30);
    assert.equal(smoke.visible, true);
    assert.ok(smoke.count > 0 && smoke.instanceColor, 'The real mounted effect still begins on its normal ridge-hit clock');
    assert.equal(proxy.geometry, smoke.geometry);
    assert.equal(proxy.material, smoke.material, 'The first live puff reuses the exact prepared shader and texture');
    assert.equal(warmups.length, 1, 'Do not repeat preparation at the hit or during smoke animation');
    assert.equal(resourceDisposals, 0);
    assertRendererRestored(false);
  } finally {
    release();
    assert.deepEqual(armedFileRenderBatch(scene),[],'No resources are retained for the next field');
    warning.dispose();
    await act(async () => reconciler.updateContainer(null, root, null, null));
    gl.shadowMap.enabled = true;
    warmups.length = disposedWarmupTargets = disposedWarmupInstances = elapsed = 0;
  }
}

const active = { id:7, position:[3, .03, 11], rotation:1.8 };
const later = { id:24, position:[-5, .03, 2], rotation:-.5 };
assert.equal(selectNapalmLightCue([active, later], new Map([[active.id, 0], [30,100]])), undefined);
assert.equal(selectNapalmLightCue([active, later], new Map([[active.id, 2], [later.id, 5]])), later);

const disposals = new Map();
function inspectStrikeAssets(strikeGroup) {
  const [, , jet, bomb, fire] = strikeGroup.children;
  const jetMeshes = [], bombMeshes = [], fireMeshes = fire.children.filter(object => object.isInstancedMesh);
  jet.traverse(object => { if (object.isMesh) jetMeshes.push(object); });
  bomb.traverse(object => { if (object.isMesh) bombMeshes.push(object); });
  const geometries = [];
  strikeGroup.traverse(object => { if (object.geometry) geometries.push(object.geometry); });
  return [...geometries, ...[...jetMeshes, ...bombMeshes, ...fireMeshes].map(mesh => mesh.material)];
}

try {
  await checkFirstFrameEnvironment();
  await checkHiddenCampaignSmoke();
  await mountEffects([]);
  const light = scene.getObjectByName('napalm-ground-light');
  const debris = scene.getObjectByName('impact-debris-pool');
  frame(0);
  assert.equal(warmups.length, 0, 'A late-mounting sun must not warm the wrong shader variant');
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  scene.add(sun);
  frame(0);
  assert.equal(warmups.length, 0, 'A mounted caster without a shadow map is not ready');
  const depth = new THREE.DepthTexture(16, 16);
  sun.shadow.map = new THREE.WebGLRenderTarget(16, 16, { depthTexture:depth });
  frame(0);
  assert.equal(warmups.length, 0, 'PCF must not draw with a depth texture lacking comparison mode');
  depth.compareFunction = THREE.LessEqualCompare; // The first normal renderer or composer draw.
  frame(0);
  frame(0);
  assert.deepEqual([warmups.length, disposedWarmupTargets, disposedWarmupInstances], [1,1,5]);
  assertWarmup(warmups[0], sun);
  scene.remove(sun);
  sun.shadow.map.dispose();
  assertRendererRestored();
  // Restore state and release only staging resources even if the driver fails.
  const render = gl.render;
  gl.render = () => { throw Error('driver failure'); };
  const probe = new THREE.InstancedMesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial(), 1);
  let disposeProbe = 0;
  probe.addEventListener('dispose', () => disposeProbe++);
  assert.throws(() => prepareNapalmRender(gl, scene, camera, [probe]), /driver failure/);
  assertRendererRestored();
  assert.equal(disposeProbe, 1);
  probe.geometry.dispose();
  probe.material.dispose();
  gl.render = render;
  const checkLight = () => {
    const visibleLights = [];
    scene.traverseVisible(object => { if (object.isLight) visibleLights.push(object); });
    assert.deepEqual(visibleLights, [light], 'The same light object participates in every frame and effect phase');
  };
  assert.ok(light?.isPointLight);
  checkLight();
  assert.equal(light.intensity, 0);
  assert.ok(debris?.isMesh && debris.geometry.isInstancedBufferGeometry);
  const pool=debris.geometry, births=pool.getAttribute('aSparkBirth'),flights=pool.getAttribute('aSparkFlight'),
    sizes=pool.getAttribute('aSparkSize'),colors=pool.getAttribute('color'),stream=births.data;
  assert.equal(pool.instanceCount, 0);
  assert.ok([births,flights,colors,sizes].every(a=>a.isInterleavedBufferAttribute&&a.data===stream&&a.count===2000));
  assert.deepEqual([births.itemSize,flights.itemSize,colors.itemSize,sizes.itemSize],[4,4,3,1]);
  assert.ok(stream.isInstancedInterleavedBuffer&&stream.stride===12&&stream.usage===THREE.DynamicDrawUsage);
  assert.equal(pool.index.count,36,'Same twelve triangles per box');
  assert.ok(debris.material.isMeshBasicMaterial && debris.material.vertexColors && !debris.material.toneMapped);

  await mountEffects([active]);
  const jet = scene.getObjectByName('napalm-phantom');
  const [targetPlane, targetBorder] = jet.parent.children;
  const spirit = jet.parent.getObjectByName('napalm-laughing-flame');
  assert.ok(spirit?.isMesh && spirit.visible, 'The floating face appears at designation');
  assert.equal(spirit.material.map.magFilter, THREE.NearestFilter);
  assert.equal(targetBorder.material.customProgramCacheKey(), 'napalm-border-code');
  const rim=targetBorder.geometry.getAttribute('position');
  assert.equal(rim.count,8,'Only the four perimeter strips are submitted');
  const spiritHeight=spirit.position.y;
  assert.equal(targetPlane.material.transparent, true);
  assert.equal(targetPlane.material.blending, THREE.NormalBlending);
  assert.equal(targetPlane.material.depthWrite, false);
  assert.equal(targetPlane.material.stencilWrite, false);
  assert.equal(targetPlane.castShadow, false);
  assert.equal(targetPlane.onBeforeRender, THREE.Object3D.prototype.onBeforeRender);
  assert.equal(targetPlane.onAfterRender, THREE.Object3D.prototype.onAfterRender);
  assert.equal(jet.visible, false);
  const moving = jet.parent.children[4].children.filter(m => m.isInstancedMesh && m.renderOrder >= 54);
  assert.equal(moving.length, 3);
  assert.ok(moving.every(m => m.count === 0 && m.instanceMatrix.version === 0));
  for (const m of moving) {
    for (let i = 0; i < m.instanceMatrix.count; i++) {
      const a = m.instanceMatrix.array.subarray(i * 16, i * 16 + 16);
      assert.deepEqual([...a], [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1],
        'Unreached seeds have zero area even inside a partially lit draw prefix');
    }
  }
  frame(NAPALM_TIMELINE.jetIngressSeconds + .01);
  assert.equal(warmups.length, 1, 'First strike does not repeat offscreen preparation');
  assert.equal(jet.visible, true);
  assert.notEqual(spirit.position.y,spiritHeight,'The flame bobs during the inbound flight');
  assert.ok(targetPlane.visible && targetPlane.material.opacity > 0, 'The inbound target marker is drawn');
  assert.equal(light.intensity, 0);
  checkLight();
  frame(NAPALM_TIMELINE.impactSeconds - NAPALM_TIMELINE.jetIngressSeconds + .17);
  const openingSmoke=moving.find(m=>m.name==='napalm-cel-smoke');
  assert.ok(openingSmoke.count>0 && openingSmoke.count<8,'Only the first swept fuel pockets emit smoke at ignition');
  assert.ok(moving.filter(m=>m.renderOrder===57).every(m=>m.count===0 && m.instanceMatrix.version===0),
    'Embers keep their own birth time');
  assert.ok(targetPlane.visible && targetPlane.material.opacity > 0, 'Keep the final nonzero-opacity frames');
  frame(.01);
  assert.equal(targetPlane.material.opacity, 0);
  const visibleAtFadeEnd = new Set();
  scene.traverseVisible(object => visibleAtFadeEnd.add(object));
  assert.equal(visibleAtFadeEnd.has(targetPlane), false, 'An exhausted target plane is excluded from rendering');
  assert.ok(visibleAtFadeEnd.has(targetBorder) && targetBorder.material.opacity > 0, 'Do not change the independently fading border');
  frame(.02);
  assert.deepEqual(impactIds, [active.id]);
  assert.deepEqual(burnTicks, [[active.id,1]]);
  assert.ok(light.intensity > 3 && light.intensity < 6);
  assert.deepEqual(light.position.toArray(), [3, .03 + 3.1, 11]);
  checkLight();
  const fireMeshes = [];
  scene.traverseVisible(object => { if (object.isInstancedMesh && object !== debris) fireMeshes.push(object); });
  assert.equal(fireMeshes.length, 4);
  assert.ok(fireMeshes.every(mesh => mesh.boundingSphere?.containsPoint(new THREE.Vector3(13,10,4))),
    'The bounds cover the full future sweep and billowing smoke, not just first visible particles');
  const owned = inspectStrikeAssets(jet.parent);
  for (const resource of new Set(owned)) {
    disposals.set(resource, 0);
    resource.addEventListener('dispose', () => { disposals.set(resource, disposals.get(resource) + 1); });
  }
  const firstOuter = fireMeshes.find(mesh => mesh.renderOrder === 55);
  let instanceBufferReleased = 0;
  firstOuter.addEventListener('dispose', () => { instanceBufferReleased++; });
  const time = firstOuter.material.uniforms.time;
  assert.deepEqual(firstOuter.material.uniforms.grid.value.toArray(), [44,56,24]);
  assert.equal(firstOuter.material.uniforms.atlas.value.minFilter, THREE.NearestFilter);
  assert.equal(time.value, elapsed);
  assert.ok(firstOuter.count > 0 && firstOuter.count < firstOuter.instanceMatrix.count);
  const smoke = scene.getObjectByName('napalm-cel-smoke');
  const atlas = smoke.material.uniforms.uGhostCels.value;
  assert.equal(atlas.minFilter, THREE.NearestFilter);
  assert.equal(atlas.magFilter, THREE.NearestFilter);
  assert.deepEqual([atlas.image.width, atlas.image.height], [144, 56]);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < firstOuter.count; i++) {
    firstOuter.getMatrixAt(i, matrix);
    assert.ok(Math.abs(matrix.elements[13] + .045) < 1e-6, 'Every growing volume starts at the ground');
    assert.ok([0,5,10].every(axis => matrix.elements[axis] > 0), 'The active pocket has width, height and depth');
  }
  frame(NAPALM_TIMELINE.jetExitSeconds - NAPALM_TIMELINE.impactSeconds);
  assert.ok(moving.filter(m=>m!==smoke).every(m=>m.count===m.instanceMatrix.count && m.instanceMatrix.version>0),
    'All flame and ember slots are active at the full rolling sweep');
  assert.ok(smoke.count>0 && smoke.count<smoke.instanceMatrix.count,
    'Smoke keeps building after the flames have spread across the strike');
  assert.equal(jet.visible, false);
  assert.deepEqual(impactIds, [active.id], 'Impact fires once');
  checkLight();
  const plumeFillSeconds=3.9;
  frame(plumeFillSeconds);
  assert.equal(smoke.count,smoke.instanceMatrix.count,'Every painted fold enters before cleanup');
  frame(NAPALM_TIMELINE.cleanupSeconds - NAPALM_TIMELINE.jetExitSeconds - plumeFillSeconds + .6);
  assert.deepEqual(completeIds, [active.id]);
  assert.equal(light.intensity, 0);
  await mountEffects([]);
  checkLight();
  assert.equal(instanceBufferReleased, 1, 'Each strike cleans up its own instance buffers');
  assert.ok([...disposals.values()].every(count => count === 0), 'Completing a strike preserves warm resources');

  // A late call-in can overlap another strike's clock, but its animation
  // must never change the first strike's target opacity or matrix buffer.
  await mountEffects([later]);
  frame(.14);
  await mountEffects([later, active]);
  frame(.22);
  const laterGroup = scene.getObjectByName('napalm-phantom').parent;
  const activeGroup = scene.children.find(object => object.isGroup && object.position.x === active.position[0]);
  assert.ok(activeGroup && activeGroup !== laterGroup);
  const sharedAgain = inspectStrikeAssets(laterGroup);
  assert.equal(owned.length, sharedAgain.length);
  assert.ok(sharedAgain.every((resource, index) => resource === owned[index]),
    'A repeat call uses the exact same materials and geometry, not clones');
  assert.notEqual(laterGroup.children[0].material, activeGroup.children[0].material);
  assert.ok(laterGroup.children[0].visible && activeGroup.children[0].visible, 'Each new strike starts with a visible marker');
  assert.notEqual(laterGroup.children[0].material.opacity, activeGroup.children[0].material.opacity);
  const secondOuter = laterGroup.children[4].children.find(mesh => mesh.renderOrder === 55);
  const overlapOuter = activeGroup.children[4].children.find(mesh => mesh.renderOrder === 55);
  assert.notEqual(secondOuter.instanceMatrix, firstOuter.instanceMatrix);
  assert.notEqual(secondOuter.instanceMatrix, overlapOuter.instanceMatrix);
  assert.equal(secondOuter.material, overlapOuter.material);
  assert.equal(secondOuter.material.uniforms.time.value, elapsed);
  await mountEffects([]);

  const fire = (id, x) => ({ id, position:new THREE.Vector3(x,0,2), spawnTime:performance.now(), scale:.25, color:'#f49a55' });
  const first = fire(31,1);
  await mountEffects([], [first]);
  const random=Math.random;
  try {Math.random=()=>.5;frame(.016);} finally {Math.random=random;}
  assert.equal(pool.instanceCount, 50);
  assert.deepEqual(stream.updateRanges.at(-1), { start:0, count:50 * 12 });
  const shader={vertexShader:THREE.ShaderLib.basic.vertexShader,uniforms:{}};
  debris.material.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/gl_InstanceID % 3/);
  assert.match(shader.vertexShader,/lane == 0 \? 2\.45 : 1\.0, lane == 1 \? 1\.9 : 1\.0/);
  assert.match(shader.vertexShader,/center\.y -= 2\.45 \* \(age \* age \+ uSparkClock\.y\)/);
  assert.match(shader.vertexShader,/aSparkSize \* max\(0\.0, 1\.0 - age \/ life\)/);
  const close=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} != ${b}`);
  const clock=shader.uniforms.uSparkClock.value;
  const sample=i=>{const t=Math.max(0,clock.x-births.getW(i));return [
    births.getX(i)+flights.getX(i)*t,births.getY(i)+flights.getY(i)*t-2.45*(t*t+clock.y),
    births.getZ(i)+flights.getZ(i)*t,sizes.getX(i)*Math.max(0,1-t/flights.getW(i))];};
  close(clock.x,.016);close(clock.y,.016*.016);
  const paths=[];
  for(let i=0;i<pool.instanceCount;i++) {
    const vx=flights.getX(i),vy=flights.getY(i),vz=flights.getZ(i),life=flights.getW(i),scale=sizes.getX(i);
    const speed=Math.hypot(vx,vz),base=i%9===0?.34:.16;
    assert.ok(speed>=1.999999&&speed<=5.000001&&vy>=.5&&vy<=2&&life>=1&&life<=1.5&&scale>=base-.000001&&scale<=base+.120001);
    const point=sample(i);
    close(point[0],1+vx*.016);close(point[1],(vy-4.9*.016)*.016);
    close(point[2],2+vz*.016);close(point[3],scale*(1-.016/life));
    paths.push({x:point[0],y:point[1],z:point[2],vx,vy:vy-4.9*.016,vz});
    const c=new THREE.Color('#f49a55');
    if(i%9===0)c.lerp(new THREE.Color('#ffe9a1'),.75);else if(i%3===0)c.lerp(new THREE.Color('#9b563f'),.48);
    close(colors.getX(i),c.r);close(colors.getY(i),c.g);close(colors.getZ(i),c.b);
  }
  assert.ok(new Set(paths.map(({vx,vz})=>Math.atan2(vz,vx).toFixed(2))).size>15,'Keep a full 3D scatter, not copied trails');
  const version=stream.version;
  for(const dt of [.012,.037,.019,.104,0,.024]){
    frame(dt);
    for(let i=0;i<paths.length;i++){const p=paths[i],point=sample(i);
      p.vy-=4.9*dt;p.y+=p.vy*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;
      close(point[0],p.x);close(point[1],p.y);close(point[2],p.z);}
    assert.equal(stream.version,version,'Even a long frame moves every spark without uploading a pose');
  }
  const next=fire(33,5);
  await mountEffects([], [first,next]);frame(.021);
  assert.equal(pool.instanceCount,100);
  const second=sample(50);
  close(second[0],5+flights.getX(50)*.021);close(second[1],(flights.getY(50)-4.9*.021)*.021);
  close(second[2],2+flights.getZ(50)*.021);
  await mountEffects([], [next]);frame(.01);
  assert.equal(sizes.getX(0),0,'Explicit early removal hides holes without overwriting the other burst');
  assert.ok(sample(50)[3]>0);
  // Recover the actual three-file Boot Camp workload from its HUD receipt
  // (+2490 pts = 2490 MiB). This tests the render stream, not device timing.
  await mountEffects([]);frame(.016);
  const fixture=createTrainingEntries(), matches=[];
  for(let i=0;i<fixture.length;i++)for(let j=i+1;j<fixture.length;j++)for(let k=j+1;k<fixture.length;k++){
    const triple=[fixture[i],fixture[j],fixture[k]];
    if(triple.reduce((n,f)=>n+f.size,0)===2490*1024**2)matches.push(triple);
  }
  assert.equal(matches.length,1);
  await mountEffects([], matches[0].map((f,i)=>({...fire(40+i,i*3),scale:fileToScale(f.size)})));
  let birthBytes=0,poseBytes=0;
  try {
    Math.random=()=>.5;
    for(let i=0;i<60;i++){stream.clearUpdateRanges();frame(1/60);
      assert.equal(pool.instanceCount,1446);const bytes=stream.updateRanges.reduce((n,r)=>n+r.count*4,0);
      if(i===0)birthBytes=bytes;else poseBytes+=bytes;}
  } finally {Math.random=random;}
  assert.equal(birthBytes,1446*12*4);assert.equal(poseBytes,0);
  console.log('Boot Camp confirmation (1446 sparks, 60 frames): '+birthBytes+' birth bytes once; zero animation uploads. Prior dynamic pose bytes: 1388160. Same box count.');
  await mountEffects([]);
  frame(.016);
  assert.equal(pool.instanceCount, 0, 'Reset removes all active fragments immediately');
  assert.equal(scene.getObjectByName('impact-debris-pool'), debris, 'Reset keeps the same GPU buffers');
  const reused=fire(32,-3);
  await mountEffects([], [reused]);
  frame(.016);
  assert.equal(pool.instanceCount, 50, 'Previously occupied particle slots are reusable');
  const finished=[];
  await mountEffects([], [{...reused,spawnTime:performance.now()-2600}],id=>finished.push(id));
  frame(.90);assert.deepEqual(finished,[],'Long wall time cannot prematurely kill a paused or slow-rendering burst');
  frame(.66);assert.equal(pool.instanceCount,0);assert.deepEqual(finished,[32]);
  frame(.016);assert.deepEqual(finished,[32],'An unacknowledged completion is not emitted again');
  await mountEffects([]);frame(.016);
  const full=Array.from({length:4},(_,i)=>({...fire(60+i,3*i),scale:3}));
  await mountEffects([],full);frame(.05);assert.equal(pool.instanceCount,2000);
  frame(1.20);
  const liveBefore=new Map();
  for(let i=0;i<2000;i++)if(sample(i)[3]>0)liveBefore.set(i,[births.getX(i),flights.getX(i)]);
  assert.ok(liveBefore.size>500&&liveBefore.size<1800);
  await mountEffects([], [...full,{...fire(64,-8),scale:3}]);frame(0);
  for(const [i,pair] of liveBefore)assert.deepEqual([births.getX(i),flights.getX(i)],pair,'Replacement cannot evict a living spark');
  const newborn=Array.from({length:pool.instanceCount},(_,i)=>births.getX(i)).filter(x=>x===-8).length;
  assert.equal(newborn,Math.min(500,2000-liveBefore.size),'Reuse precisely the available holes below the cap');
} finally {
  await act(async () => reconciler.updateContainer(null, root, null, null));
}
assert.equal(subscribers.size, 0);
assert.ok(disposals.size > 20);
assert.ok([...disposals.values()].every(count => count === 1), 'Only session exit releases shared resources, once');
console.log('Impact effects checks passed: stable light and strike sequencing, rooted and bounded flames, warm resource identity across strikes, private opacity and instance buffers, disposal on exit, and reusable debris uploads.');
