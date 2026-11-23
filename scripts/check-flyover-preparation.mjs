// CPU-only: exercise the production scene registration and lifetime with real
// Three geometries, ink, materials and scratch meshes, not a mocked GL context.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { build } from 'vite';

async function loadLocal(name) {
  const entry = fileURLToPath(new URL('../src/components/Scene/' + name + '.ts', import.meta.url));
  const bundle = await build({configFile:false, publicDir:false, logLevel:'silent',
    build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
  const code = bundle.output.find(o=>o.isEntry).code.replace(/from "([^"]+)"/g,
    (_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}

const {createHueyResources,registerFlyoverResources,flyoverRenderBatch}=await loadLocal('flyoverResources');
const {createHueyAirframeGeometries}=await loadLocal('hueyGeometry');
const {createVehicleInk}=await loadLocal('ghostVehicleInk');
const {prepareNapalmRender}=await loadLocal('prepareNapalmRender');
const pairs=[['body','paint'],['dark','trim'],['glass','glazing'],['mainRotor','rotorPaint'],['tailRotor','rotorPaint']];
const bundle=createHueyResources(false,true), second=createHueyResources(false,true);
const a=bundle.assets,b=second.assets;
const tick=()=>new Promise(r=>setImmediate(r));
function disposalReceipts(assets) {
  const items=Object.values(assets);
  assert.equal(new Set(items).size,11,'five geometries, four material instances and two textures');
  const counts=new Map(items.map(item=>[item,0]));
  for(const item of items)item.addEventListener('dispose',()=>counts.set(item,counts.get(item)+1));
  return n=>assert.ok([...counts.values()].every(v=>v===n),'each resource should have exactly '+n+' disposal events');
}
const counts=disposalReceipts(a), counts2=disposalReceipts(b);
const scene=new THREE.Scene(),other=new THREE.Scene();
assert.deepEqual(flyoverRenderBatch(scene),[]);
// A synchronous StrictMode effect teardown/reacquisition must not dispose
// resources already visible to two child airframes.
const rehearsal=bundle.retain();rehearsal();
const firstRig=bundle.retain(),secondRig=bundle.retain(),otherRig=second.retain();
await tick();counts(0);counts2(0);
const firstRegistration=registerFlyoverResources(scene,bundle);
const otherRegistration=registerFlyoverResources(other,second);
function assertBatch(batch,assets) {
  assert.equal(batch.length,5);
  for(const [geo,mat] of pairs){
    const matches=batch.filter(m=>m.geometry===assets[geo]&&m.material===assets[mat]);
    assert.equal(matches.length,1,'exact live resources for '+geo);
    const mesh=matches[0];assert.ok(mesh.isMesh);assert.equal(mesh.parent,null);
    assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);
  }
}
assertBatch(flyoverRenderBatch(scene),a);assertBatch(flyoverRenderBatch(other),b);
const liveRigs=[new THREE.Group(),new THREE.Group()];
for(const rig of liveRigs)for(const [g,m] of pairs)rig.add(new THREE.Mesh(a[g],a[m]));
for(let i=0;i<5;i++){
  const [left,right]=liveRigs.map(r=>r.children[i]);
  assert.notEqual(left,right);assert.equal(left.geometry,right.geometry);assert.equal(left.material,right.material);
}
scene.add(...liveRigs);
const scratch=flyoverRenderBatch(scene),liveCamera=new THREE.PerspectiveCamera();
const gl={target:null,autoClear:false,xr:{enabled:true},shadowMap:{autoUpdate:true,needsUpdate:false},
  getRenderTarget(){return this.target;},getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,
  setRenderTarget(target){this.target=target;},render(stage,camera){
    assert.notEqual(stage,scene);assert.notEqual(camera,liveCamera);
    assert.deepEqual([this.target.width,this.target.height,this.target.texture.type,this.target.samples],
      [16,16,THREE.HalfFloatType,0]);
    assert.deepEqual(stage.children.filter(o=>o.isMesh),scratch);
    assert.ok(scratch.every(o=>!o.frustumCulled&&!o.castShadow&&!o.receiveShadow));
    this.calls++;
  },calls:0};
prepareNapalmRender(gl,scene,liveCamera,scratch);
assert.equal(gl.calls,1);assert.equal(gl.target,null);assert.equal(gl.xr.enabled,true);
assert.ok(liveRigs.every(r=>r.children.length===5&&r.parent===scene&&r.children.every(o=>o.frustumCulled)),
  'scratch preflight must never reparent/uncull live rig meshes');
// No reduced-fidelity substitutes in the preflight: match the previous
// authored geometry buffers, and exercise the actual ink shader bindings.
const expected=createHueyAirframeGeometries(false,true);
for(const [g] of pairs){
  const actual=a[g];assert.deepEqual(Object.keys(actual.attributes).sort(),Object.keys(expected[g].attributes).sort());
  for(const name of Object.keys(actual.attributes)){
    assert.equal(actual.attributes[name].itemSize,expected[g].attributes[name].itemSize);
    assert.deepEqual(actual.attributes[name].array,expected[g].attributes[name].array);
  }
  assert.deepEqual(actual.index?.array,expected[g].index?.array);expected[g].dispose();
}
for(const [slot,material,kind] of [['shellInk','paint','huey'],['paneInk','glazing','glazing']]){
  const tex=a[slot],expectedInk=createVehicleInk(kind);
  for(const field of ['colorSpace','magFilter','minFilter','generateMipmaps'])assert.equal(tex[field],expectedInk[field]);
  assert.deepEqual(tex.image.data,expectedInk.image.data);expectedInk.dispose();
  const shader={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <alphamap_fragment>',uniforms:{}};
  a[material].onBeforeCompile(shader,{});assert.equal(shader.uniforms.uVehicleInk.value,tex);
}
firstRig();await tick();counts(0);assertBatch(flyoverRenderBatch(scene),a);
const replace=registerFlyoverResources(scene,second);firstRegistration();
assertBatch(flyoverRenderBatch(scene),b);assertBatch(flyoverRenderBatch(other),b);
replace();assert.deepEqual(flyoverRenderBatch(scene),[]);assertBatch(flyoverRenderBatch(other),b);
secondRig();await tick();counts(1);counts2(0);
otherRegistration();otherRig();await tick();counts(1);counts2(1);
firstRig();secondRig();otherRig();await tick();counts(1);counts2(1);
assert.throws(()=>bundle.retain(),/retired/);
assert.deepEqual(flyoverRenderBatch(other),[]);
console.log('Flyover preparation: exact five authored draw pairs, byte-identical shape/ink, detached proxies, isolated registrations and once-only deferred disposal passed.');
