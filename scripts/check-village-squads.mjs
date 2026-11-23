// Advance the actual mounted infantry components, skeletons, muzzle sockets,
// pooled tracer meshes and hit callbacks. No browser, WebGL or filesystem bridge.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import React from 'react';
import * as THREE from 'three';
import { WebGLAttributes } from 'three/src/renderers/webgl/WebGLAttributes.js';
import { act, context, extend, reconciler } from '@react-three/fiber';
import { build } from 'vite';

// A single virtual entry keeps both mounted components on the same production
// module instances and loads no UI, Tauri bridge, textures or diagnostic hooks.
const rootDir = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/,'');
const sources = {
  'components/Scene/activeTracerPrefix': ['submitActiveTracers'],
  'components/Scene/USInfantrySquad': ['USInfantrySquad'],
  'components/Scene/VietCongCombatants': ['VietCongCombatants'],
  'lib/combat': ['createUSInfantryCombatants', 'createVietCongCombatants'],
  'lib/villageCover': ['createVillageObstacle','segmentVillageHut','villageBlocksWalk','safeVillageLeg'],
  'lib/infantryMetrics': ['infantryAimHeight'],
};
const entry = rootDir+'/virtual-mounted-village-squads.mjs';
const bundle = await build({
  root:rootDir, configFile:false, logLevel:'silent', publicDir:false,
  plugins:[{name:'squad-fixture', resolveId(id) { if (id === entry) return id; },
    load(id) { if (id === entry) return Object.entries(sources).map(([path, names]) =>
      'export { '+names.join(',')+' } from '+ JSON.stringify(rootDir+'/src/'+path)+';').join('\n'); } }],
  esbuild:{jsx:'automatic'},
  build:{ssr:entry, write:false, minify:false, rollupOptions:{output:{format:'es'}}},
});
const bundled = bundle.output.find(c => c.type === 'chunk' && c.isEntry).code
  .replace(/from "([^"]+)"/g, (_, id) => 'from '+ JSON.stringify(import.meta.resolve(id)));
const {USInfantrySquad,VietCongCombatants,submitActiveTracers,createUSInfantryCombatants,createVietCongCombatants,
  createVillageObstacle,segmentVillageHut,villageBlocksWalk,safeVillageLeg,infantryAimHeight} =
  await import('data:text/javascript;base64,'+Buffer.from(bundled).toString('base64'));

// A deterministic buffer sink (not a GL context or frame-time test). Three's
// real WebGLAttributes code controls version checks and the requested ranges.
function tracerUploadSink(){
  let bytes=0, bound;
  const stream=WebGLAttributes({createBuffer:()=>({}),bindBuffer(_type,b){bound=b;},
    bufferData(_type,array){bound.words=array.slice();},
    bufferSubData(_type,offset,array,start=0,size=array.length){
      bound.words.set(array.subarray(start,start+size),offset/array.BYTES_PER_ELEMENT);
      bytes+=size*array.BYTES_PER_ELEMENT;
    }});
  return { get bytes(){return bytes;}, flush(mesh){
    const attr=mesh.instanceMatrix, end=mesh.count*attr.itemSize;
    stream.update(attr,0);
    assert.deepEqual(stream.get(attr).buffer.words.subarray(0,end),attr.array.subarray(0,end));
  }};
}
{
  const sink=tracerUploadSink(), mesh=new THREE.InstancedMesh(undefined,undefined,48);
  const mat=new THREE.Matrix4();
  mesh.count=0;sink.flush(mesh); // Initial fixed buffer allocation is not a subdata update.
  let tick=0;
  function fill(n){
    for(let i=0;i<n;i++)mesh.setMatrixAt(i,mat.makeTranslation(++tick,i*2,-i));
    submitActiveTracers(mesh,n);assert.equal(mesh.count,n);
  }
  for(const count of [0,1,5,2,0,48,0,3]){
    const before=sink.bytes;fill(count);sink.flush(mesh);
    assert.equal(sink.bytes-before,count*64);
  }
  // Two simulation steps without a render. The second visible prefix is
  // complete; the earlier range must not leak into a smaller or larger draw.
  for(const [earlier,later] of [[27,1],[2,47]]){
    const before=sink.bytes;fill(earlier);fill(later);sink.flush(mesh);
    assert.equal(sink.bytes-before,later*64);
  }
  mesh.dispose();
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE);
const scene = new THREE.Scene(), subscribers = new Map();
const state = { scene, camera:new THREE.PerspectiveCamera(), invalidate() {},
  internal:{active:false, frames:0, interaction:[], initialHits:[], hovered:new Map(), capturedMap:new Map(),
    subscribe(ref, priority) { subscribers.set(ref, priority); return () => subscribers.delete(ref); }},
};
const store = Object.assign((select = v => v) => select(state), {
  getState:() => state, getInitialState:() => state, subscribe:() => () => {},
});
scene.__r3f = {root:store, type:'scene', parent:null, children:[], props:{}, object:scene, eventCount:0, handlers:{}, isHidden:false};
const fail = e => {throw e;};
const root = reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const render = child => act(async () => reconciler.updateContainer(
  React.createElement(context.Provider,{value:store},child),root,null,null));
const ref = current => ({current});
const v3 = a => new THREE.Vector3(...a);

async function exercise(side, scenario) {
  const us = createUSInfantryCombatants()[0];
  const vc = {...createVietCongCombatants(1968,1)[0], position:[us.position[0],.02,7],
    initialFireDelay:.4, fireInterval:1.3, accuracy:0, stance:'kneeling'};
  const american = side === 'US';
  const actor = american ? us : vc, target = american ? vc : us;
  const friendlyPosesRef = ref(new Map([[us.id,{position:v3(us.position)}]])), enemyPosesRef = ref(new Map());
  const actorPoses = american ? friendlyPosesRef : enemyPosesRef;
  const targetAim = v3(target.position); targetAim.y += infantryAimHeight(true);
  const at = v3(actor.position), direction = american ? 1 : -1;
  const hut = createVillageObstacle({path:'/simulated/regular-rifle-lane.txt', scale:1.45,
    position:[at.x,.5,at.z+direction*3]});
  const getPose = () => actorPoses.current.get(actor.id).position;
  const counter = { shots:0, hits:0, peakTracers:0, peakTravel:0, firstShotAt:null };
  let obstacles = scenario === 'flank' ? [hut] : [], elapsed=0, prev=at.clone();
  let model, flash, tracers, flashed=false;
  // Exercise Three's actual range/version upload decisions on a CPU buffer
  // sink. Count dynamic subdata separately from the initial pool allocation.
  const tracerMeshes=[],visibleSHA=createHash('sha256');
  const traffic={frames:0,submitted:0,subBytes:0,idleBytes:0};
  const sink=tracerUploadSink();
  const muzzle = new THREE.Vector3(), meshPose = new THREE.Vector3();
  function shot(e) {
    const origin = getPose().clone(); origin.y = e.position.y;
    assert.ok(flash.getWorldPosition(muzzle).distanceTo(e.position)<1e-6, side+' actor callback must launch from the mounted animated socket');
    for (const {hut:h} of obstacles) {
      assert.equal(segmentVillageHut(h,origin,e.position),null,side+' a protruding barrel must not spawn a tracer on the far side');
      assert.equal(segmentVillageHut(h,e.position,targetAim),null,side+' cannot launch at a contact occluded by the hut');
    }
    counter.shots++; counter.firstShotAt ??= elapsed;
  }
  const hit = () => counter.hits++;
  const props = american ? {enemies:[vc],friendlies:[us],enemyPosesRef,friendlyPosesRef,onFriendlyFire:shot,onEnemyHit:hit}
    : {enemies:[vc],friendliesRef:ref([us]),friendlyPosesRef,enemyPosesRef,tankRef:ref(null),onEnemyFire:shot,onFriendlyHit:hit};
  const mount = () => render(React.createElement(american ? USInfantrySquad : VietCongCombatants, {...props,obstacles}));
  const matrix = new THREE.Matrix4();
  function visibleTracers() {
    let visible=0;
    for (let i=0;i<tracers.count;i++) {
      tracers.getMatrixAt(i,matrix);
      if (Math.abs(matrix.determinant())>1e-8) visible++;
    }
    return visible;
  }
  function step(delta) {
    elapsed+=delta;
    for (const [cb] of [...subscribers].sort((a,b)=>a[1]-b[1])) cb.current({...state,clock:{elapsedTime:elapsed}},delta);
    const pose=getPose();
    assert.ok(model.getWorldPosition(meshPose).distanceTo(pose)<1e-7,side+' world pose must match the mounted soldier');
    assert.equal(villageBlocksWalk(prev.x,prev.z,pose.x,pose.z,obstacles),false,side+' traversed a wall or its infantry clearance');
    prev.copy(pose);
    const rendered=visibleTracers();
    const bytesBefore=sink.bytes;
    for(const mesh of tracerMeshes){
      assert.equal(mesh.count,rendered, side+' must submit only live projectiles on each layer');
      traffic.submitted+=mesh.count;
      sink.flush(mesh);
    }
    traffic.subBytes=sink.bytes;
    assert.equal(traffic.subBytes-bytesBefore,rendered*64*tracerMeshes.length,
      side+' uploads precisely one current matrix per visible tracer and layer');
    traffic.frames++;
    if(!rendered)traffic.idleBytes+=traffic.subBytes-bytesBefore;
    visibleSHA.update(String(rendered)+':');
    for(let i=0;i<tracers.count;i++){
      tracers.getMatrixAt(i,matrix);
      if(Math.abs(matrix.determinant())>1e-8)visibleSHA.update(new Uint8Array(tracers.instanceMatrix.array.buffer,i*64,64));
    }
    counter.peakTravel=Math.max(counter.peakTravel,at.distanceTo(pose));
    counter.peakTracers=Math.max(counter.peakTracers,rendered);
    flashed ||= flash.visible;
    return rendered;
  }
  try {
    await mount();
    model=scene.getObjectByName(american ? us.id : 'enemy-infantry-review');
    model.traverse(obj => { if (obj.renderOrder === (american ? 87 : 85)) flash=obj; });
    scene.traverse(obj => {
      if (obj.isInstancedMesh && obj.name.startsWith('round-tracer-')) {
        tracerMeshes.push(obj);
        sink.flush(obj);
      }
    });
    assert.deepEqual(tracerMeshes.map(mesh => mesh.name).sort(), ['round-tracer-core', 'round-tracer-nose', 'round-tracer-tail']);
    tracers = scene.getObjectByName('round-tracer-nose');
    assert.ok(model && flash && tracers);
    const eye=at.clone(); eye.y=targetAim.y;
    assert.notEqual(segmentVillageHut(hut.hut,eye,targetAim),null,'baseline hut must screen this lane');
    // Show that an accessible sidestep really does reveal the target; a soldier
    // boxed in by other obstacles would not be expected to recover here.
    const open=eye.clone(); open.x+=3.5;
    assert.equal(villageBlocksWalk(at.x,at.z,open.x,open.z,[hut]),false);
    assert.equal(segmentVillageHut(hut.hut,open,targetAim),null);
    if (scenario === 'flank') {
      for(let f=0;f<2*60;f++) assert.equal(step(1/60),0,side+' initial occlusion should leave the pool invisible');
      assert.equal(counter.shots,0); assert.equal(counter.hits,0); assert.equal(flashed,false);
      for(let f=0;f<43*60;f++) step(1/60);
    } else {
      // With no wall, establish that an ordinary rifle actually fires and
      // publishes the first tracer. Add the wall in flight without remounting.
      while(!counter.shots && elapsed<2) step(1/120);
      assert.equal(counter.shots,1); assert.equal(visibleTracers(),1); assert.equal(counter.hits,0);
      obstacles=[hut]; await mount();
      assert.equal(step(.55),0,side+' large first update across the new wall must retire the in-flight tracer');
      assert.equal(counter.hits,0,side+' a target behind the new wall cannot receive the earlier round');
      const fired=counter.shots;
      for(let f=0;f<1*60;f++) assert.equal(step(1/60),0);
      assert.equal(counter.shots,fired,side+' stale selected target must not fire through the new hut');
      obstacles=[]; await mount();
      for(let f=0;f<4*60;f++) step(1/60);
      assert.ok(counter.shots>fired && flashed && counter.hits>0,side+' must resume fire, flash and hit a target after hut removal');
    }
  } finally {
    await render(null);
    assert.equal(subscribers.size,0);
  }
  console.log(side,scenario,JSON.stringify({...counter,traffic,visibleTransformSha:visibleSHA.digest('hex')}));
  return counter;
}

for (const side of ['US','VC']) await exercise(side,'in-flight wall');
const failures=[];
for (const side of ['US','VC']) {
  const result = await exercise(side,'flank');
  if (!result.shots || !result.peakTracers || result.peakTravel<.4)
    failures.push(side+' never reopened the screened lane ('+JSON.stringify(result)+')');
}
assert.deepEqual(failures,[]);
console.log('Mounted regular infantry: blocked and clear launches, tracer meshes, live wall insertion/removal, continuous safe bounds and autonomous flank recovery passed.');

// Independently clock a live company rather than only testing the path picker.
// No enemy or damage callback for the friends: the village should not freeze
// just because the player finished a fight.
{
  const us=createUSInfantryCombatants(),vc=createVietCongCombatants(1968,8);
  const up=ref(new Map(us.map(a=>[a.id,{position:v3(a.position)}]))),vp=ref(new Map());
  const wall=createVillageObstacle({path:'marker-screen.txt',scale:2,position:[vc[0].position[0],.50,vc[0].position[2]-3]});
  let obstacles=[],t=0;
  const mount=()=>render(React.createElement(React.Fragment,null,
    React.createElement(USInfantrySquad,{enemies:[],friendlies:us,friendlyPosesRef:up,enabled:false,obstacles}),
    React.createElement(VietCongCombatants,{enemies:vc,friendliesRef:ref([]),friendlyPosesRef:up,enemyPosesRef:vp,tankRef:ref(null),obstacles})));
  const step=()=>{t+=1/30;for(const [r] of [...subscribers].sort((a,b)=>a[1]-b[1]))r.current({...state,clock:{elapsedTime:t}},1/30);};
  await mount();const marker=scene.getObjectByName('field-hostile-chevron'),ally=scene.getObjectByName('field-ally-dash');
  assert(marker.isSprite && ally.isSprite && marker.material.map!==ally.material.map && marker.material.depthTest && marker.material.depthWrite);
  state.camera.position.set(vc[0].position[0],1.05,vc[0].position[2]-8);
  step();assert(marker.visible,'An exposed hostile must carry a local depth-tested shape.');
  obstacles=[wall];await mount();step();assert(!marker.visible,'A building between the eye and actor hides its mark.');
  obstacles=[];await mount();step();assert(marker.visible);
  const units=[...us,...vc].map((a,i)=>({a,side:i<us.length?0:1,p:v3(a.position),peak:0,course:0}));
  const simultaneous=[0,0];
  for(let f=0;f<35*30;f++){
    step();const walkers=[0,0];
    for(const u of units){
      const pose=(u.side?vp:up).current.get(u.a.id).position;
      const stride=u.p.distanceTo(pose);
      assert(stride<.065,'A moving soldier must not jump between route endpoints.');
      if(stride>.006){
        assert(safeVillageLeg(u.p.x,u.p.z,pose.x,pose.z,obstacles),'New footstep clips water, bridge, mound or wall.');
        walkers[u.side]++;u.course+=stride;
      }
      u.p.copy(pose);u.peak=Math.max(u.peak,pose.distanceTo(v3(u.a.position)));
    }
    walkers.forEach((n,i)=>simultaneous[i]=Math.max(simultaneous[i],n));
  }
  for(const side of [0,1]){
    assert(simultaneous[side]>=2,'Squad circulation must overlap, not share a global mover slot.');
    const moved=units.filter(u=>u.side===side&&u.peak>=1.8&&u.course>=3);
    assert(moved.length>=(side?5:3),'At least a majority should leave their initial pocket.');
  }
  console.log('Quiet field, actual independently clocked actors:',JSON.stringify({simultaneous,
    travel:units.map(u=>[u.a.id,+u.peak.toFixed(1),+u.course.toFixed(1)])}));
  await render(null);
}
