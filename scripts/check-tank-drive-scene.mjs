// Mount the actual tank in R3F. The clock and keyboard are controlled here;
// transforms, terrain, hull, controls, aim and subscriptions are the real ones.
import assert from 'node:assert/strict';
import {checkSharkMarkers} from './tank-bow-probes.mjs';
import {checkBowCamera} from './tank-bow-camera.mjs';
import {checkCastPigment} from './tank-cast-pigment-probes.mjs';
import {checkTankLacquer} from './tank-lacquer-probes.mjs';
import {getEventListeners} from 'node:events';
import {checkBridgeSquad} from './bridge-squad-clearance.mjs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { act, context, extend, reconciler } from '@react-three/fiber';
import { build } from 'vite';

async function loadSource(path) {
  const entry = fileURLToPath(new URL(path, import.meta.url));
  const result = await build({
    configFile: false, logLevel: 'silent', publicDir: false,
    esbuild: { jsx: 'automatic' },
    build: { ssr: entry, write: false, minify: false, rollupOptions: { output: { format: 'es' } } },
  });
  const source = result.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry).code
    .replace(/from "([^"]+)"/g, (_, id) => 'from ' + JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const { CameraRig } = await loadSource('../src/components/Scene/CameraRig.tsx');
const { Tank } = await loadSource('../src/components/Scene/Tank.tsx');
const { createTankEndWheelGeometry } = await loadSource('../src/components/Scene/tankGeometry.ts');
const { TankWaterEffects } = await loadSource('../src/components/Scene/TankWaterEffects.tsx');
const river = await loadSource('../src/components/Scene/riverLayout.ts');
const { intersectsTerrainMound } = await loadSource('../src/lib/terrain.ts');
const { tankFootprintBlocked } = await loadSource('../src/lib/tankFootprint.ts');
const impact = await loadSource('../src/lib/tankImpactFeedback.ts');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = new EventTarget();
const tankTextures = new Set([
  '/images/textures/river-current-ink.png', '/images/textures/field-fire-jet.png',
  '/images/textures/tank-armor-v1.png', '/images/textures/tank-unit-23.svg',
  '/images/textures/tank-field-wear-v1.svg','/images/textures/ghost-cast-enamel-v1.png',
]);
const mountedTextures = new Set();
// The crew has its own local boundary. Keep its one authored face request
// pending in this movement fixture; the separate crew test covers resolution.
// Unexpected model URLs still fail; nothing here replaces the actual tank.
const originalHeadLoad = GLTFLoader.prototype.load;
GLTFLoader.prototype.load = function(url) {
  assert.equal(url, '/models/us-infantry-head/us-male-head.gltf');
};
// A browser equates true and {capture:true} on removal. Node 24's standalone
// EventTarget retains the first form, letting an OLD captured pointer handler
// consume a press before the current tank subscriber. Emulate Document here
// and keep the real tank input handler, clock, and one-second reload intact.
class FixtureDocument extends EventTarget {
  removeEventListener(type,cb,options) {
    super.removeEventListener(type,cb,typeof options==='boolean'?{capture:options}:options);
  }
}
globalThis.document = Object.assign(new FixtureDocument(), { hidden: false, hasFocus: () => true,
  // This non-GL movement fixture has no browser image decoder. Complete the
  // texture load through Three's normal event path so the real tank mounts.
  createElementNS(_namespace, tag) {
    assert.equal(tag,'img');
    return new class extends EventTarget {
      set src(url) {
        assert.ok(tankTextures.has(url),'Unexpected mounted tank texture: '+url);
        this.currentSrc=url;
        mountedTextures.add(url);
        queueMicrotask(()=>this.dispatchEvent(new Event('load')));
      }
    }();
  },
});
extend(THREE);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, .1, 150);
camera.position.set(0, 6, -20); camera.lookAt(0, 0, -6); camera.updateMatrixWorld();
// Aim through the mounted camera onto an actual rendered target, including elevation.
const field = new THREE.Mesh(new THREE.PlaneGeometry(180,180));
field.name='dry-ground-cut-around-river';field.rotation.x=-Math.PI/2;
scene.add(field);field.updateMatrixWorld();
const subscribers = new Map();
const state = { scene, camera, size:{width:800,height:600,left:0,top:0}, gl:{domElement:document}, pointer: new THREE.Vector2(), invalidate() {},
  internal: { active:false, frames:0, interaction:[], initialHits:[], hovered:new Map(), capturedMap:new Map(),
    subscribe(ref, priority) { subscribers.set(ref,priority); return () => subscribers.delete(ref); } } };
const store = Object.assign((selector = value => value) => selector(state), {
  getState: () => state, getInitialState: () => state, subscribe: () => () => {},
});
scene.__r3f = { root:store, type:'scene', parent:null, children:[], props:{}, object:scene, eventCount:0, handlers:{}, isHidden:false };
const fail = error => { throw error; };
const root = reconciler.createContainer(store, 1, null, false, null, '', fail, fail, fail, null);
const render = element => act(async () => reconciler.updateContainer(React.createElement(context.Provider, { value:store }, element), root, null, null));
const ref = React.createRef(), audio = [], initial = [0,0,-12];
let churning = false;
const waterAudio = (_proximity, moving) => { churning = moving; };
const props = { ref, initialPosition: initial, onMovementAudioChange: active => audio.push(active),
  colliders:[{kind:'circle', id:'pass-through-prop', x:0,z:-9,radius:1}] };
const mount = overrides => render(React.createElement(React.Fragment, null,
  React.createElement(Tank, { ...props, ...overrides }),
  React.createElement(TankWaterEffects, { tankRef:ref, resetPosition:overrides?.initialPosition ?? initial, onRiverStateChange:waterAudio })));
let elapsed = 0;
function frames(count, dt = 1/60) {
  for (let i = 0; i < count; i++) {
    elapsed += dt;
    for (const [callback] of [...subscribers].sort((a,b)=>a[1]-b[1])) callback.current({ clock: { elapsedTime:elapsed } }, dt);
  }
}
const press = type => document.dispatchEvent(Object.assign(new Event(type), {button:0,
  clientX:(state.pointer.x+1)*400,clientY:(1-state.pointer.y)*300}));
const key = (type, code, repeat=false) => window.dispatchEvent(Object.assign(new Event(type), { code, repeat }));
const z = () => ref.current.position.z;
const close = (a,b,label) => assert.ok(Math.abs(a-b)<1e-8, label + ': ' + a + ' vs ' + b);
try {
  await mount();
  frames(1);
  assert.deepEqual(mountedTextures,tankTextures,'Actual tank requests enamel, unit number and field artwork, not the retired duplicate front grin');
  const tankFinishes = new Map();
  ref.current.traverse(node=>{
    if (!node.isMesh || !node.material?.customProgramCacheKey) return;
    const key = node.material.customProgramCacheKey();
    if (!tankFinishes.has(key)) tankFinishes.set(key,[]);
    tankFinishes.get(key).push(node);
  });
  assert.equal(tankFinishes.get('tank-painted-metal-v8:casting:cast-enamel-v1/ghost-vehicle-v1:deck')?.length,2,'Hull and deck bind original cast pigment; the real folded jaw owns the front paint');
  const castKey='tank-painted-metal-v8:turret:cast-enamel-v1:unit23:field/ghost-vehicle-v1:cheek/field-enamel:cheek/pressed-steel-v1';
  assert.equal(tankFinishes.get(castKey)?.length,1,'Only the actual turret carries 23 and the local pressed steel contacts');
  // Trace both digits from outside the assembled vehicle. A correct UV on a
  // hidden surface is not a passing stencil: rails, bags or a mantlet could
  // otherwise occlude it. Update matrices without advancing the simulation.
  ref.current.updateWorldMatrix(true,true);
  const cheek=tankFinishes.get(castKey)[0];
  const cast=new THREE.Raycaster();
  for (const side of [-1,1]) for (const [u,v] of [[.17,.74],[.34,.24],[.63,.74],[.78,.28]]) {
    const origin=new THREE.Vector3(2*side,-.045+v*.092,-.411+(.5-u)*side*.175).applyMatrix4(cheek.matrixWorld);
    const direction=new THREE.Vector3(-side,0,0).transformDirection(cheek.matrixWorld);
    cast.set(origin,direction);
    const hit=cast.intersectObject(ref.current,true)[0];
    assert.ok(hit?.object===cheek && Math.abs(hit.face.normal.x)>.37,'Unit digits must land on exposed, outward-facing cheeks');
  }
  assert.equal(tankFinishes.get('tank-component-enamel-v1:cover/ghost-vehicle-v1:engine')?.length,1,'Rear grilles sit on a separately weathered engine cover');
  const fenders=tankFinishes.get('tank-component-enamel-v1:fender:field/ghost-vehicle-v1:fender');
  assert.equal(fenders?.length,2,'Both, and only, actual fender sheets carry the fender finish');
  assert.deepEqual(fenders.map(f=>Math.sign(f.position.x)),fenders.map(f=>f.geometry.attributes.tankHand.getX(0)),
    'Outer rolled edges must face away from the hull on both sides');
  assert.equal([...tankFinishes].filter(([key])=>key.split('/ghost-vehicle-')[0].endsWith(':field')).flatMap(([,nodes])=>nodes).length,3,
    'Do not apply the hand-charted marks to the uniform, stowage, deck or wheels');
  const chartHit=(mesh,origin,direction)=>{
    cast.set(origin.applyMatrix4(mesh.matrixWorld),direction.transformDirection(mesh.matrixWorld));
    // Three's CPU raycaster also includes hidden effect pools; a parked
    // muzzle quad cannot occlude a rendered armor mark.
    return cast.intersectObject(ref.current,true).find(hit=>{
      for(let node=hit.object;node;node=node.parent)if(!node.visible)return false;
      return true;
    });
  };
  // The approved bow carries BOTH eyes and the curved mouth in the same
  // hull frame. A turret slew cannot separate a shark's eyes from its teeth.
  const jaw=ref.current.getObjectByName('signal-forward-jaw');
  assert.ok(jaw?.isMesh&&jaw.parent!==cheek.parent&&jaw.material.map?.name.endsWith(':sideJaw'));
  checkSharkMarkers(jaw,ref.current);
  checkBowCamera(jaw,ref.current);
  const textile=[...tankFinishes].find(([key])=>key.startsWith('tank-stowed-woven-canvas-'))?.[1];
  assert.equal(textile?.length,1,'The actual separate cloth batch must be mounted');
  checkCastPigment(ref.current,cheek,tankFinishes.get('tank-painted-metal-v8:casting:cast-enamel-v1/ghost-vehicle-v1:deck'),jaw,textile[0],fenders[0]);
  checkTankLacquer(ref.current,cheek,textile[0],jaw);
  for (const side of [-1,1]) for(const [x,y] of [[429,52],[447,64],[330,62]]) {
    const hit=chartHit(cheek,new THREE.Vector3(side*2,.255-.34*y/256,.18-.78*x/512),new THREE.Vector3(-side,0,0));
    assert.ok(hit?.object===cheek && Math.abs(hit.face.normal.x)>.24,
      `Forward-shoulder wear must land on the exposed casting: side=${side} xy=${x},${y} first=${hit?.object?.geometry?.type}/${hit?.object?.position?.toArray()}/${hit?.object?.parent?.name} normal=${hit?.face?.normal?.toArray()}`);
  }
  for (const sheet of fenders) for(const [x,z] of [[.131,.15],[.127,.35],[.13,.54]]) {
    const side=Math.sign(sheet.position.x);
    const hit=chartHit(sheet,new THREE.Vector3(side*x,.30,z),new THREE.Vector3(0,-1,0));
    assert.ok(hit?.object===sheet && hit.face.normal.y>-.10,
      `Rolled guard ${side} outside the new nose armor must hit visible sheet metal; first hit: ${hit?.object.material.customProgramCacheKey()}`);
  }
  const pads = ref.current.children[0].children.find(child => child.isInstancedMesh && child.count===128);
  assert.ok(pads.material.vertexColors && pads.geometry.attributes.color && pads.material.color.getHex()===0xffffff,
    'Track instances use the authored rubber, steel and hinge colors without an additional brown tint');
  // Check the real instance transforms *and* the real meshes. The geometry
  // tests alone cannot tell if presentation still has the old axle offsets.
  const roads=ref.current.children[0].children.find(child=>child.isInstancedMesh && child.count===12);
  pads.geometry.computeBoundingBox(); roads.geometry.computeBoundingBox();
  const wheelTransform=new THREE.Matrix4();
  roads.getMatrixAt(0,wheelTransform);
  assert.ok(Math.abs(roads.geometry.boundingBox.clone().applyMatrix4(wheelTransform).min.y+.023)<.0003,
    'Mounted road wheel must sit on the inner carrier bed at -.023');
  let lowerLinks=0;
  for(let i=0;i<pads.count;i++) {
    pads.getMatrixAt(i,wheelTransform);
    if(Math.abs(wheelTransform.elements[5]+1)>.00001)continue;
    assert.ok(Math.abs(pads.geometry.boundingBox.clone().applyMatrix4(wheelTransform).min.y+.070)<.0003,
      'Bottom run remains visible and the actual contact pad just touches soil at -.070');
    lowerLinks++;
  }
  assert.ok(lowerLinks>=24,'Both sides must present a continuous bottom run');
  const firstPad = () => Array.from(pads.instanceMatrix.array.slice(0,16));
  const parkedPad = firstPad();
  key('keydown','KeyW'); frames(6); close(z()-initial[2], 1/18, 'Weighted W pullaway at 100 ms');
  assert.notDeepEqual(firstPad(),parkedPad,'Treads follow the eased hull');
  const endShapes=[createTankEndWheelGeometry(false),createTankEndWheelGeometry(true)];
  assert.notEqual(endShapes[0].attributes.position.count,endShapes[1].attributes.position.count);
  ref.current.updateWorldMatrix(true,true);
  const hullInverse=ref.current.matrixWorld.clone().invert();
  for(const [end,shape] of endShapes.entries()){
    const matches=[];
    ref.current.traverse(o=>{if(o.isInstancedMesh&&o.count===2&&o.geometry.attributes.position.count===shape.attributes.position.count)matches.push(o);});
    assert.equal(matches.length,1,'Exactly one mounted pair of matching cast end wheels');
    for(let side=0;side<2;side++){
      const m=new THREE.Matrix4();matches[0].getMatrixAt(side,m);m.premultiply(matches[0].matrixWorld).premultiply(hullInverse);
      const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();m.decompose(p,q,s);
      assert.ok((end===0?p.z<-.85:p.z>.85)&&(side===0?p.x<0:p.x>0),'Actual idlers forward, toothed sprockets aft, on opposite tracks');
      assert.ok(Math.max(...s.toArray().map(v=>Math.abs(v-1)))<.00001 && Math.abs(q.x)>.01,'Rotating wheel stays round in the lengthened hull frame');
    }
    shape.dispose();
  }
  frames(54); close(z()-initial[2], 5.12, 'Real weighted hull passes through scenery prop');
  key('keyup','KeyW'); frames(9); close(z()-initial[2], 6.03875, 'Actual hull retains measured coasting momentum at 150ms');
  frames(11); close(z()-initial[2], 6.4, 'Actual hull settles after the 320ms brake');
  frames(1); close(z()-initial[2], 6.4, 'The next fully stationary frame reports the movement-audio stop');
  assert.deepEqual(audio, [true,false], 'Audio reports just the actual movement edges');
  key('keydown','KeyA'); const yaw = ref.current.rotation.y;
  frames(1, .140); close(ref.current.rotation.y-yaw,.175,'A pivot ramp');
  key('keyup','KeyA'); frames(1,.1); close(ref.current.rotation.y-yaw,.2275,'A pivot brake');

  key('keydown','KeyW'); frames(18);
  await act(async () => window.dispatchEvent(new Event('blur')));
  const blurred = z(); frames(2,.25); close(z(),blurred,'No drift on blur');
  window.dispatchEvent(new Event('focus')); key('keydown','KeyW',true);
  frames(10); close(z(),blurred,'OS key repeat does not resurrect held W');
  key('keydown','ArrowDown'); frames(6); assert.ok(z()<blurred,'Independent reverse binding works after blur');
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  const hidden = z(); frames(1,3); close(z(),hidden,'Hidden-tab delta cannot move hull');
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  frames(10); close(z(),hidden,'Visibility restore cannot reuse stale keys');
  key('keydown','KeyW'); frames(16); assert.notEqual(z(),hidden);
  await mount({ disabled:true }); const paused = z();
  key('keydown','KeyW'); frames(10); close(z(),paused,'Disabled tank stationary');
  await mount(); frames(10); close(z(),paused,'Unpause clears held throttle and momentum');
  key('keydown','KeyW'); frames(8);
  await mount({ initialPosition: [0,0,-2] }); frames(1,.25);
  close(z(),-2,'Teleport discards both held input and momentum');

  // Start just before an authored mound, then press through at a low frame rate.
  await mount({ initialPosition: [-15,0,-12] }); key('keydown','KeyW');
  for (let i=0;i<15;i++) {
    frames(1,.25);
    assert.ok(!tankFootprintBlocked(ref.current.position.x,z(),ref.current.rotation.y,intersectsTerrainMound));
  }
  assert.ok(z()>-12 && z()<-5,'Mound blocks the actual hull');
  await mount({ initialPosition: [0,0,60] }); key('keydown','KeyW'); frames(12,.25);
  assert.ok(z() <= 60.8 && z() >= 60, 'Arena perimeter remains solid');

  // Exact full immersion at a real seeded river station, away from crossings.
  const stations = river.createRiverStations(1968);
  const wet = stations.find(s => s.z > -50 && s.z < 50
    && river.riverWaterImmersion(s.centerX,s.z,stations) === 1
    && river.riverWaterImmersion(s.centerX,s.z+.1,stations) === 1
    && !tankFootprintBlocked(s.centerX,s.z,Math.PI,intersectsTerrainMound));
  assert.ok(wet);
  await mount({ initialPosition:[wet.centerX,0,wet.z] });
  key('keydown','KeyW'); frames(1,.05);
  close(z()-wet.z, .5*(.05/.72)*.05*8*.58, 'Deep water preserves 0.58 translation multiplier');
  key('keyup','KeyW'); key('keydown','KeyA'); frames(1,.05);
  close(ref.current.rotation.y-Math.PI,.5*(.05/.14)*.05*2.5*.72,'Deep water preserves 0.72 pivot multiplier');
  key('keydown','KeyW'); frames(1,.10);
  assert.equal(churning,false,'The weighted 100ms pullaway stays below the existing 0.38u/s water-churn threshold');
  frames(1,.10);
  assert.equal(churning,true,'Water wake follows actual travel once pullaway exceeds the unchanged threshold');
  await mount({ initialPosition:[ref.current.position.x,0,z()+.10] }); frames(1,.05);
  assert.equal(churning,false,'A short reset inside water must not produce a wake');
  close(firstPad()[12],parkedPad[12],'An authoritative hop preserves the reset track side');
  close(firstPad()[14],parkedPad[14],'An authoritative hop resets track phase even under 3 units; Y/angle follow the new ground');

  // Real bridge support must affect the rendered vehicle, not only a pure helper.
  const bridge=river.createRiverCrossings(stations).find(c=>c.kind==='bridge');
  await mount({initialPosition:[0,0,bridge.z-bridge.length/2-.2]});frames(180);
  assert.ok(Math.abs(ref.current.rotation.x)>.02&&ref.current.position.y>.03,
    'The actual tank settles into the real south-deck approach pitch and ride height');
  const mountedWheels=ref.current.getObjectByName('tank-road-wheels');
  const wheelYs=[];
  for(let wheel=0;wheel<mountedWheels.count;wheel++) {
    mountedWheels.getMatrixAt(wheel,wheelTransform);wheelYs.push(wheelTransform.elements[13]);
  }
  assert.ok(Math.max(...wheelYs)-Math.min(...wheelYs)>.025,
    'Actual wheel instances no longer share one rigid Y on uneven support');
  const leftCarrier=ref.current.getObjectByName('tank-left-carrier');
  const rightCarrier=ref.current.getObjectByName('tank-right-carrier');
  assert.notEqual(leftCarrier.geometry,rightCarrier.geometry,'Tracks have independent deformable carriers');
  const buffers=[pads.instanceMatrix,mountedWheels.instanceMatrix,
    leftCarrier.geometry.attributes.position,rightCarrier.geometry.attributes.position];
  const versions=buffers.map(buffer=>buffer.version);frames(120);
  assert.deepEqual(buffers.map(buffer=>buffer.version),versions,'Settled suspension performs no continued matrix/vertex uploads');

  const turret=ref.current.getObjectByName('tank-turret');
  turret.updateWorldMatrix(true,false);
  const gunDirection=new THREE.Vector3(0,0,-1).transformDirection(turret.matrixWorld);
  assert.ok(Math.abs(gunDirection.y)<1e-9,'Terrain lean does not pitch the actual weapon assembly into the soil');
  cast.setFromCamera(state.pointer,camera);
  const target=cast.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
  const aim=target.sub(turret.getWorldPosition(new THREE.Vector3()));aim.y=0;aim.normalize();
  assert.ok(gunDirection.dot(aim)>.999999,'The physical turret keeps its pointer heading while the hull pitches');

  const turnedShot=[], bin=[0,0,-12];
  await mount({initialPosition:bin,onShoot:(p,d)=>turnedShot.push([p,d])});
  frames(60);
  const sweepEvents=[],sweepEvt=e=>sweepEvents.push(e.detail),sight=ref.current.getObjectByName('tank-turret');
  document.addEventListener('tankdelete:turret-sweep',sweepEvt);
  const sightDir=()=>{sight.updateWorldMatrix(true,false);return new THREE.Vector3(0,0,-1).transformDirection(sight.matrixWorld);};
  const oldSight=sightDir();state.pointer.set(.96,-.22);
  frames(1);
  const travellingSight=sightDir();
  press('pointerdown');
  press('pointerup');
  frames(90);
  const newSight=sightDir(),angle=oldSight.angleTo(newSight),firstStep=oldSight.angleTo(travellingSight);
  assert.ok(angle>.45 && firstStep>.04 && firstStep<.056,'A large cursor movement cannot snap the turret');
  assert.equal(turnedShot.length,1);
  cast.setFromCamera(state.pointer,camera);
  const mark=cast.intersectObject(field)[0].point;
  const [muzzle,heading]=turnedShot[0],toMark=mark.clone().sub(muzzle);
  const flight=Math.hypot(toMark.x,toMark.z)/(25*Math.hypot(heading.x,heading.z));
  const {shellSag}=await loadSource('../src/lib/arcadeShell.ts');
  const arrived=muzzle.clone().addScaledVector(heading,flight*25);arrived.y-=shellSag(flight);
  assert.ok(arrived.distanceTo(mark)<.002,'An immediate press lands at the cursor despite visual turret slew and arc');
  assert.ok(heading.angleTo(travellingSight)>.35);
  assert.deepEqual(sweepEvents,[true,false],'Player gets one traversing cue and one alignment edge, not per-frame notifications');
  console.log('Mounted turret slew:',JSON.stringify({firstFrameDeg:firstStep*180/Math.PI,targetTurnDeg:angle*180/Math.PI,
    earlyMuzzleOffsetDeg:turnedShot[0][1].angleTo(newSight)*180/Math.PI}));
  document.removeEventListener('tankdelete:turret-sweep',sweepEvt);
  const burst=[];
  await mount({initialPosition:bin,weaponMode:'machinegun',onMachineGun:(origin,dir)=>burst.push({origin,dir})});
  state.pointer.set(-.25,-.45);frames(1);press('pointerdown');
  const first=burst[0];assert.ok(first);
  state.pointer.set(.48,-.18);frames(18);press('pointerup');
  assert.ok(burst.length>=3);
  const last=burst.at(-1);
  for(const [round,x,y] of [[first,-.25,-.45],[last,.48,-.18]]) {
    cast.setFromCamera(new THREE.Vector2(x,y),camera);
    const mark=cast.intersectObject(field)[0].point;
    const bullet=new THREE.Ray(round.origin,round.dir);
    assert.ok(bullet.distanceToPoint(mark)<1e-5,'Held automatic fire follows the current cursor to the surface');
  }
  state.pointer.set(0,0);

  await mount({initialPosition:[bridge.width/2-.1,0,bridge.z]});frames(180);
  assert.ok(Math.abs(ref.current.rotation.z)>.02,'One track on the actual deck edge produces visible hull roll');
  assert.notDeepEqual(Array.from(leftCarrier.geometry.attributes.position.array),
    Array.from(rightCarrier.geometry.attributes.position.array),'Left/right carriers respond independently on the deck edge');

  // Exercise the new cosmetic-only path on the mounted tank, not a separate
  // scene containing only the effect. Contact data must survive hull rotation.
  window.dispatchEvent(new Event('blur'));
  const feed=impact.newTankImpactFeed();
  const at=[3,0,-11],impactHeading=.82;
  const shotLog=[];
  const prop={initialPosition:at,initialHeading:impactHeading,impactFeed:feed,onShoot:(p,d)=>shotLog.push([p,d])};
  await mount(prop);frames(12);
  const fx=ref.current.getObjectByName('tank-contact-feedback');
  const scuff=fx.getObjectByName('tank-contact-scuffs'), vapor=fx.getObjectByName('tank-contact-vapor');
  const flecks=fx.getObjectByName('tank-contact-flecks'),leftF=ref.current.getObjectByName('tank-left-fender');
  const rightF=ref.current.getObjectByName('tank-right-fender'),motor=ref.current.getObjectByName('tank-engine-cover');
  const hitLocal=(x,y,z)=>impact.publishTankImpact(feed,ref.current,ref.current.localToWorld(new THREE.Vector3(x,y,z)));
  const fire=press;
  const rest=leftF.position.y;
  assert.ok(!scuff.visible&&!vapor.visible&&!flecks.visible,'Unhit vehicle draws no feedback');
  hitLocal(-.83,.53,-.22);frames(1);
  assert.equal(fx.userData.response,'left-track');assert.equal(scuff.count,1);
  assert.ok(flecks.visible&&vapor.visible&&leftF.position.y!==rest&&rightF.position.y===rest);
  assert.ok(flecks.count<=5&&vapor.count<=4,'A hit uses one small bounded cue');
  hitLocal(.82,.51,.21);frames(1);
  assert.equal(fx.userData.response,'right-track');
  assert.equal(leftF.position.y,rest,'Switching sides immediately restores previous fitting');
  assert.ok(rightF.position.y!==rest && scuff.count===2);
  hitLocal(.16,.68,.86);frames(1);
  assert.equal(fx.userData.response,'engine');assert.ok(motor.position.y!==.48 && scuff.count===3);
  hitLocal(.18,.58,.80);frames(1);assert.equal(scuff.count,3,'Repeated hits never accumulate unbounded marks');
  hitLocal(0,.64,0);frames(1);
  assert.equal(feed.contact,null);assert.equal(fx.userData.response,null);
  assert.ok(!flecks.visible && scuff.visible && scuff.count===3,'Centered impact invents no side and does not erase existing paint wear');
  for(const point of [[.14,.58,-.72],[60,1,0],[NaN,0,0]]) {
    hitLocal(...point);frames(1);assert.equal(feed.contact,null);
  }
  impact.publishTankImpact(feed,ref.current);frames(1);assert.equal(feed.contact,null,'Area-only hit stays general');
  hitLocal(-.81,.50,0);frames(1);
  fire('pointerdown');fire('pointerdown');fire('pointerup');
  hitLocal(.82,.50,0);frames(1);fire('pointerdown');fire('pointerup');
  assert.equal(shotLog.length,1,'Incoming hits neither stack fire nor clear the same-second cannon reload');
  hitLocal(.2,.54,.83);frames(1);
  const beforeMove=ref.current.position.clone();key('keydown','KeyW');frames(6);key('keyup','KeyW');
  const traveled=ref.current.position.distanceTo(beforeMove);
  frames(90);assert.equal(fx.userData.response,null);
  assert.ok(!flecks.visible&&!vapor.visible&&scuff.visible&&scuff.count===3,'Transient response recovers; small local scuffs remain');
  assert.equal(motor.position.y,.48);assert.equal(motor.rotation.z,0,'Engine presentation returned to rest');
  const settledVersions=[scuff,flecks,vapor].map(m=>m.instanceMatrix.version);
  frames(30);assert.deepEqual([scuff,flecks,vapor].map(m=>m.instanceMatrix.version),settledVersions,'Inactive feedback has no matrix uploads');
  await mount({...prop,initialPosition:[...at]});frames(12);
  assert.ok(!scuff.visible&&!flecks.visible&&!vapor.visible,'Respawn clears transient and persistent marks');
  const cleanStart=ref.current.position.clone();key('keydown','KeyW');frames(6);key('keyup','KeyW');
  close(ref.current.position.distanceTo(cleanStart),traveled,'Hatch reaction does not reduce normal drive response');
  hitLocal(.87,.60,.21);frames(2);impact.resetTankImpact(feed);frames(1);
  assert.ok(!scuff.visible&&!vapor.visible&&!flecks.visible);
  impact.resetTankImpact(feed);hitLocal(-.83,.53,-.22);frames(1);
  assert.equal(scuff.count,1,'A genuine new contact after an encounter reset is retained');
  await render(null);assert.equal(leftF.position.y,rest,'Exit during a hit restores the affected panel');
  await checkBridgeSquad({loadSource,render,Tank,ref,initial,frames,key,scene});
  const rearShots=[];
  const mountView=rearView=>render(React.createElement(React.Fragment,null,
    React.createElement(Tank,{...props,onShoot:(_origin,direction)=>rearShots.push(direction.clone())}),
    React.createElement(CameraRig,{tankRef:ref,rearView,embassy:true})));
  await mountView(false);frames(2);
  const hullForward=new THREE.Vector3(0,0,-1).applyQuaternion(ref.current.quaternion);
  const facing=()=>camera.getWorldDirection(new THREE.Vector3()).dot(hullForward);
  assert.ok(facing()>.8);
  await mountView(true);frames(1);assert.ok(facing()<-.8,'Rear view reverses on the first frame');
  camera.updateMatrixWorld();state.pointer.set(0,0);
  const start=ref.current.position.clone();
  key('keydown','KeyW');frames(18);press('pointerdown');press('pointerup');key('keyup','KeyW');
  assert.ok(ref.current.position.clone().sub(start).dot(hullForward)>.1,'Forward drive is hull relative');
  assert.ok(rearShots.length===1 && rearShots[0].dot(hullForward)<-.75,'Cannon follows the rear sight');
  await mountView(false);frames(1);assert.ok(facing()>.8,'Switching back restores forward aim');
} finally {
  await render(null);
  GLTFLoader.prototype.load = originalHeadLoad;
}
assert.equal(subscribers.size,0);
assert.equal(getEventListeners(document,'pointerdown').length,0,'Exit removes every captured firing handler');
console.log('Mounted tank passed: real W/A, audio, input rearm, terrain/bridge support, stabilized aim, localized left/right/engine feedback, cosmetic scuffs and reset, bounded idle uploads, and unchanged drive/reload during hits.');
