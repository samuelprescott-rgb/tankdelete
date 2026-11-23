// Deterministic CPU exercise of the shipped sampler, terrain query, mesh and
// R3F lifecycle. No renderer, asset fetch, live gameplay input or screenshot.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import * as THREE from 'three';
import { act, context, extend, reconciler } from '@react-three/fiber';
import { build } from 'vite';

const dir = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const entry = dir + '/virtual-tread-fixture.mjs';
const fixture = ['lib/tankTreadImprints', 'lib/tankGroundProfile', 'lib/tankSuspension', 'components/Scene/riverLayout',
  'components/Scene/TankTreadImprints'].map(p => 'export * from ' + JSON.stringify(dir + '/src/' + p))
  .concat('export {isInsidePaddy} from ' + JSON.stringify(dir + '/src/components/Scene/VietnamEnvironment')).join(';');
const built = await build({ root: dir, configFile: false, publicDir: false, logLevel: 'silent',
  plugins: [{ name: 'tread-fixture', resolveId: id => id === entry ? id : null, load: id => id === entry ? fixture : null }],
  esbuild: { jsx: 'automatic' }, build: { ssr: entry, write: false, minify: false, rollupOptions: { output: { format: 'es' } } } });
const code = built.output.find(c => c.isEntry).code.replace(/from "([^"]+)"/g, (_, id) => 'from ' + JSON.stringify(import.meta.resolve(id)));
const g = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const step = g.TREAD_TILE_STEP, half = g.TANK_SUSPENSION.halfTrack;
const near = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) < tolerance, label + ': ' + a + ' vs ' + b);
const soil = () => true;
function trace(hz, pose, accepts = soil) {
  const out = [], s = g.createImprintState();
  const write = (slot, x, z, yaw) => out.push({slot, x, z, yaw});
  for (let i = 0; i <= hz * 3; i++) g.stepImprints(s, ...pose(i / hz), accepts, write);
  return out;
}
const rates = [20, 60, 120];
for (const sign of [-1, 1]) {
  for (const hz of rates) {
    const out = trace(hz, t => [2, sign * t * 4, 0]);
    for (const side of [-1, 1]) {
      const lane = out.filter(p => Math.sign(p.x - 2) === side);
      assert.equal(lane.length, Math.floor(12 / step));
      lane.forEach((p, i) => {
        near(p.x, 2 + side * half, 1e-8, 'Actual track center');
        near(p.z, sign * (i + 1) * step, 1e-8, 'Forward/reverse pitch at ' + hz + ' Hz');
        assert.equal(p.yaw, 0, 'Reversing never flips a shoe');
      });
    }
  }
}
for (const radius of [0, 2.8]) {
  const a = 1.16, path = t => [radius * (Math.cos(a*t) - 1), -radius * Math.sin(a*t), a*t];
  for (const hz of rates) {
    const out = trace(hz, path);
    for (const laneRadius of [radius - half, radius + half]) {
      const lane = out.filter(p => Math.sign((p.x + radius) * Math.cos(p.yaw) - p.z * Math.sin(p.yaw)) === Math.sign(laneRadius)
        && Math.abs(Math.hypot(p.x + radius, p.z) - Math.abs(laneRadius)) < .005);
      assert.equal(lane.length, Math.floor(Math.abs(laneRadius) * a * 3 / step), 'Each side follows its own arc');
      lane.forEach((p, i) => {
        const angle = (i + 1) * step / Math.abs(laneRadius);
        near(p.x, laneRadius * Math.cos(angle) - radius, .0025, 'Curve/pivot x');
        near(p.z, -laneRadius * Math.sin(angle), .0025, 'Curve/pivot z');
        near(p.yaw, angle, .001, 'Contact follows hull through yaw wrap');
      });
    }
  }
}
const wrapped = trace(60, t => [0, 0, (t + 2.6 + Math.PI) % (2 * Math.PI) - Math.PI]);
const unwrapped = trace(60, t => [0, 0, t + 2.6]);
assert.equal(wrapped.length, unwrapped.length);
wrapped.forEach((p,i)=>{ near(p.x,unwrapped[i].x,1e-8,'Wrapped yaw x'); near(p.z,unwrapped[i].z,1e-8,'Wrapped yaw z'); });
const denied = trace(20, t => [0, t * 4, 0], (_x,z) => z < 3 || z > 9);
assert.ok(denied.some(p => p.z < 3) && denied.some(p => p.z > 9) && !denied.some(p => p.z >= 3 && p.z <= 9));

const river = g.createRiverStations(1968), profile = g.createTankGroundProfile(river, 1968);
const land = g.createImprintSoil(river, 1968, true, g.isInsidePaddy);
const day = g.createImprintSoil(river, 1968, false, g.isInsidePaddy);
assert.ok(land.accepts(0, 0) && day.accepts(0, -20), 'Campaign dirt stays dirt where no defense slab exists');
assert.ok(!land.accepts(0,-20) && !land.accepts(14.58,-20), 'Embassy concrete and straddling shoes rejected');
for (const [x,z] of [[-6.35,-10.6],[6.2,-10.6],[-6.15,-4.25],[6.3,-4.1],[-6.1,3.3],[6.15,4.08],[-35,-4],[20.05,4.15]])
  assert.ok(!land.accepts(x,z), 'Flooded paddy');
const deck = g.createRiverCrossings(river).find(c=>c.kind === 'bridge');
assert.ok(!land.accepts(deck.centerX, deck.z - deck.length / 2 - .10), 'Bridge abutment');
assert.ok(!land.accepts(deck.centerX, deck.z + deck.length / 2 - .01), 'Far deck');
const station = g.sampleRiverStation(river,-16);
assert.ok(!land.accepts(station.centerX, station.z), 'Submerged ford');
assert.ok(!land.accepts(station.centerX + station.waterHalfWidth + .02, station.z), 'Footprint grazes open water');
const bx = station.centerX + (station.waterHalfWidth + station.mudHalfWidth) / 2 + .12;
assert.ok(land.accepts(bx, station.z), 'Exposed silt above water remains writable');
const bank = new Float32Array(27);
g.writeImprintVertices(bank, 0, bx, station.z, .44, land.height);
for (let i=0; i<27; i+=3) near(bank[i+1], profile.height(bank[i],bank[i+2])+.008, .00001,'Conforms to bank triangle');
assert.ok(bank[1] !== bank[4] && Math.abs(bank[1]-g.TANK_GROUND_Y)>.01, 'Follows the real eroded bank instead of hovering on the dry plain');

const s = g.createImprintState(), slots = new Set();
let total = 0, previous;
const writing = (slot, x, z, yaw) => {
  assert.ok(slot >= 0 && slot < g.TREAD_CAPACITY && slot === total % g.TREAD_CAPACITY);
  slots.add(slot); total++; previous = {x,z,yaw};
};
for (let i=0;i<600;i++) g.stepImprints(s,0,i*.31,0,soil,writing);
assert.equal(s.count,g.TREAD_CAPACITY); assert.equal(slots.size,g.TREAD_CAPACITY); assert.ok(total>3*g.TREAD_CAPACITY);
const unexpected = () => { throw new Error('Stationary pose should not sample or write'); };
for (let i=0;i<1000;i++) assert.equal(g.stepImprints(s,0,599*.31,0,unexpected,unexpected),0);
const end = previous;
assert.equal(g.stepImprints(s,99,99,1,unexpected,unexpected),0);
assert.equal(s.count,0); assert.equal(end,previous);
assert.equal(g.stepImprints(s,99,99.05,1,soil,unexpected),0);
g.resetImprints(s); assert.ok(!s.ready && !s.count && !s.cursor && s.carry.every(n=>n===0));

// Mount the actual component without WebGL; verify its real buffer version,
// empty draw range, one-mesh budget, respawn and explicit resource disposal.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE);
const scene = new THREE.Scene(), subscribers = new Set();
const state = {scene, invalidate(){}, internal:{active:false, frames:0, interaction:[], initialHits:[], hovered:new Map(),
  capturedMap:new Map(), subscribe(ref){ subscribers.add(ref); return ()=>subscribers.delete(ref); }}};
const store=Object.assign((select=x=>x)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail = e=>{throw e;};
const root = reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const tankRef = {current:new THREE.Group()};
const render = content=>act(async()=>reconciler.updateContainer(React.createElement(context.Provider,{value:store},content),root,null,null));
const mount = at=>render(React.createElement(g.TankTreadImprints,{tankRef,river,seed:1968,embassy:false,resetPosition:at}));
const frame=(dt=1/60)=>{ for(const cb of subscribers) cb.current({},dt); };
const at = [0,0,0];
await mount(at);
const mesh = scene.getObjectByName('tank-mud-impressions'), attr=mesh.geometry.attributes.position;
const versions = () => [attr.version,mesh.geometry.attributes.uv.version,mesh.geometry.index.version,mesh.material.map.version];
assert.equal(scene.children.length,1); assert.equal(mesh.material.blending,THREE.MultiplyBlending);
frame(); assert.equal(mesh.visible,false); assert.equal(mesh.geometry.drawRange.count,0);
let idle=versions(); for(let i=0;i<50;i++) frame(); assert.deepEqual(idle,versions());
for(let i=0;i<30;i++) { tankRef.current.position.z+=.06; frame(); }
assert.ok(mesh.visible && mesh.geometry.drawRange.count>0 && attr.version>0);
idle=versions(); for(let i=0;i<120;i++) frame(); assert.deepEqual(idle,versions());
await mount([...at]); frame(); assert.ok(!mesh.visible && mesh.geometry.drawRange.count===0); assert.deepEqual(idle,versions());
tankRef.current.position.z+=.45; frame(); assert.ok(mesh.visible);
tankRef.current.position.set(40,0,0); frame(); assert.equal(mesh.visible,false);
tankRef.current.rotation.y+=.04; frame();
for(let i=0;i<600;i++){ tankRef.current.rotation.y+=.04; frame(); }
const pivotCount=mesh.geometry.drawRange.count;
assert.ok(pivotCount > 20*24 && pivotCount < 65*24,'Full earthen pivot circle, not blackened by repeated passes');
for(let i=0;i<600;i++){ tankRef.current.rotation.y+=.04; frame(); }
assert.ok(mesh.geometry.drawRange.count<=pivotCount+2*24,'Contact ring converged, not piling up wash');
tankRef.current.position.x=32; frame(); assert.ok(!mesh.visible && mesh.geometry.drawRange.count===0,'Teleport clears old batch, no bridge');
tankRef.current.position.z+=.4; frame(); assert.ok(mesh.visible);
frame(1); assert.ok(!mesh.visible && mesh.geometry.drawRange.count===0,'Background/time jump');
let disposed=0;
for(const resource of [mesh.geometry,mesh.material,mesh.material.map]) resource.addEventListener('dispose',()=>disposed++);
await render(null); assert.equal(disposed,3); assert.equal(subscribers.size,0); assert.equal(scene.children.length,0);
console.log('Treads passed: 20/60/120Hz forward, reverse, curves, pivot; real water/bridge/paddies/court and bank heights; 640-slot wrap; one mounted mesh, no stationary uploads, reset, teleport, pause and disposal.');
