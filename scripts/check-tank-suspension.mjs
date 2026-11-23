import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { build } from 'vite';

async function loadSource(path) {
  const result = await build({ configFile:false, logLevel:'silent', publicDir:false,
    esbuild:{jsx:'automatic'}, build:{ssr:fileURLToPath(new URL(path,import.meta.url)),write:false,minify:false,
      rollupOptions:{output:{format:'es'}}} });
  const source=result.output.find(chunk=>chunk.type==='chunk'&&chunk.isEntry).code
    .replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const river=await loadSource('../src/components/Scene/riverLayout.ts');
const terrain=await loadSource('../src/components/Scene/VietnamEnvironment.tsx');
const {cutGroundAroundRiver}=await loadSource('../src/components/Scene/TerrainSurface.tsx');
const {createTankGroundProfile,TANK_GROUND_Y}=await loadSource('../src/lib/tankGroundProfile.ts');
const {createTankSuspension,stepTankSuspension,sampleSuspendedTrackPose,trackSuspensionOffset,TANK_SUSPENSION}=await loadSource('../src/lib/tankSuspension.ts');
const {TANK_BODY_LENGTH_SCALE}=await loadSource('../src/lib/tankFootprint.ts');
const {TANK_TRACK_RADIUS,trackPadPose,trackLoopLength}=await loadSource('../src/components/Scene/tankGeometry.ts');
// Flat courtyard isolates load transfer from terrain lean. All rates must
// give the same settled contact and the same sign while starting/stopping.
for (const fps of [30,60,120]) {
  const flat={height:()=>TANK_GROUND_Y}, s=createTankSuspension(TANK_BODY_LENGTH_SCALE);
  const step=(surge,corner)=>stepTankSuspension(s,flat,0,0,0,1/fps,surge,corner);
  step(0,0);
  for(let i=0;i<fps;i++)step(1.4,.75);
  assert.ok(s.pitch>.02 && s.pitch<.026 && s.roll<-.012 && s.roll>-.016);
  assert.ok(s.travel[0]!==s.travel[8],'outside and inside track compression differ');
  for(let i=0;i<fps;i++)step(-1.8,0);
  assert.ok(s.pitch<-.028 && Math.abs(s.roll)<.001,'brake dip releases the corner load');
  for(let i=0;i<3*fps;i++)step(0,0);
  assert.ok(s.settled && Math.abs(s.pitch)+Math.abs(s.roll)<.00002);
  assert.equal(step(0,0),false,'parked chassis does not keep uploading running gear');
}
const summaries=[];
for(const seed of [1968,70921,0,-1968]) {
  const stations=river.createRiverStations(seed),ground=createTankGroundProfile(stations,seed);
  const bank=new THREE.Mesh(terrain.createRiverSurfaceGeometry(stations,seed),new THREE.MeshBasicMaterial());
  const soil=new THREE.Mesh(cutGroundAroundRiver(stations),new THREE.MeshBasicMaterial());
  const box=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial();
  const pieces=terrain.createRiverBridgePlanks(stations,seed);
  // The deck and buried stringers carry tracks; the side ropes and posts
  // deliberately do not. A ray from above a handrail is not a ground probe.
  const shoulder=pieces.find(p=>p.kind==='post');
  assert.ok(shoulder && ground.height(shoulder.x,shoulder.z)<shoulder.y+shoulder.scaleY*.5-.45,'drive past railing, never ride on the post');
  const planks=pieces.filter(p=>!p.kind).map(p=>{
    const mesh=new THREE.Mesh(box,material);mesh.position.set(p.x,p.y,p.z);mesh.rotation.set(0,p.rotation,p.pitch??0);
    mesh.scale.set(p.scaleX,p.scaleY,p.scaleZ);return mesh;
  });
  const meshes=[soil,bank,...planks];meshes.forEach(mesh=>mesh.updateMatrixWorld());
  const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
  let samples=0;
  function compare(x,z) {
    ray.set(origin.set(x,2,z),down);
    const hit=ray.intersectObjects(meshes,false)[0];
    assert.ok(hit);
    assert.ok(Math.abs(hit.point.y-ground.height(x,z))<2e-6,
      `Ground query must match actual rendered triangles/boards, seed=${seed}, x=${x}, z=${z}: ${hit.point.y} vs ${ground.height(x,z)}`);
    samples++;
  }
  for(let row=0;row<stations.length-1;row+=2) {
    const z=stations[row].z+.47,station=river.sampleRiverStation(stations,z);
    for(let side=-1;side<=1;side+=.125) compare(station.centerX+side*station.mudHalfWidth,z);
  }
  const bridge=river.createRiverCrossings(stations).find(c=>c.kind==='bridge');
  for(let along=-.52;along<=.52;along+=.025) for(const across of [-2.3,-1.8,-.76,0,.76,1.8,2.3]) {
    compare(across,bridge.z+along*bridge.length);
  }
  const state=createTankSuspension(TANK_BODY_LENGTH_SCALE),south=bridge.z-bridge.length/2;
  const step=(x,z,dt=1/60)=>stepTankSuspension(state,ground,x,z,Math.PI,dt);
  step(0,south-2);
  assert.ok(Math.abs(state.heave)<1e-12,'Dry soil cannot invent vertical rumble');
  assert.ok(Math.abs(state.pitch)+Math.abs(state.roll)<1e-12);
  const restVersion=state.version;step(0,south-2);
  assert.equal(state.version,restVersion,'Parked, settled tank stops all running-gear uploads');
  step(.1,south-2);
  assert.equal(state.version,restVersion,'Driving over flat soil does not rebuild the track carrier vertices');
  const restPose={y:0,z:0,angle:0};
  for(let pad=0;pad<128;pad++) {
    const distance=pad/128*trackLoopLength(TANK_BODY_LENGTH_SCALE);
    const original=trackPadPose(distance,TANK_BODY_LENGTH_SCALE);
    sampleSuspendedTrackPose(restPose,state,0,distance,TANK_TRACK_RADIUS);
    assert.ok(Math.abs(restPose.y-original.y)<1e-12&&Math.abs(restPose.z-original.z)<1e-12);
    assert.ok(Math.abs(Math.sin(restPose.angle-original.angle))<1e-12,'Flat-ground shoe orientation remains authored');
  }
  // Drive into the real south deck edge, then stop with unequal front/rear support.
  const parkedZ=south-.20;
  for(let frame=1;frame<=90;frame++) step(0,south-2+Math.min(1.8,frame/60*2));
  for(let frame=0;frame<180;frame++) step(0,parkedZ);
  const foreAft=Math.abs(state.heights[0]-state.heights[7]);
  assert.ok(foreAft>.08,'Actual bridge approach has unequal front/rear contact heights');
  assert.ok(Math.abs(state.pitch)>.02,'Hull pitches on a real deck approach');
  assert.ok(Math.max(...state.travel)-Math.min(...state.travel)>.025,'Road stations absorb the non-planar step independently');
  for(let side=0;side<2;side++)for(let station=0;station<8;station++) {
    const index=side*8+station,localX=side?TANK_SUSPENSION.halfTrack:-TANK_SUSPENSION.halfTrack;
    const contactY=state.heave+Math.cos(state.pitch)*Math.sin(state.roll)*localX
      -Math.sin(state.pitch)*state.stationZ[station]
      +Math.cos(state.pitch)*Math.cos(state.roll)*(TANK_GROUND_Y+state.travel[index]);
    assert.ok(Math.abs(contactY-state.heights[index])<.001,'Settled contact shoes must meet sampled real surfaces');
  }
  const bottom=Array.from(state.stationZ,z=>trackSuspensionOffset(state,0,z,-TANK_TRACK_RADIUS,TANK_TRACK_RADIUS));
  assert.ok(Math.max(...bottom)-Math.min(...bottom)>.012,'Lower carrier has distinct station travel on the slope');
  // Park with only one track supported by the deck; no made-up test bump.
  state.initialized=false;
  step(bridge.width/2-.10,bridge.z);
  assert.ok(Math.abs(state.roll)>.02,'One-track bridge edge produces visible, bounded hull roll');
  assert.ok(Math.abs(state.roll)<=TANK_SUSPENSION.maxPitchRoll);

  const outcomes=[];
  const motionSamples=[];
  for(const fps of [30,60,120]) {
    const motion=createTankSuspension(TANK_BODY_LENGTH_SCALE);
    stepTankSuspension(motion,ground,0,south-2,Math.PI,1/fps);
    let maxPitch=0,maxHeave=0;
    const snapshots=[];
    for(let frame=1;frame<=fps*4;frame++) {
      const t=frame/fps,z=south-2+Math.min(1.8,t*2);
      const previousHeave=motion.heave,previousPitch=motion.pitch;
      stepTankSuspension(motion,ground,0,z,Math.PI,1/fps);
      maxPitch=Math.max(maxPitch,Math.abs(motion.pitch));maxHeave=Math.max(maxHeave,motion.heave);
      assert.ok(Number.isFinite(motion.heave+motion.pitch+motion.roll));
      assert.ok(motion.travel.every(v=>v>=-TANK_SUSPENSION.maxExtension-.001&&v<=TANK_SUSPENSION.maxCompression+.001));
      assert.ok(Math.abs(motion.heave-previousHeave)<.018&&Math.abs(motion.pitch-previousPitch)<.02,
        'Crossing and stopping on the deck cannot snap the hull pose');
      if(frame%(fps/2)===0)snapshots.push({heave:motion.heave,pitch:motion.pitch,travel:[...motion.travel]});
    }
    outcomes.push({fps,heave:motion.heave,pitch:motion.pitch,maxPitch,maxHeave});
    motionSamples.push(snapshots);
    assert.ok(motion.settled,'Hull and wheel motion settles while parked');
  }
  for(const value of outcomes.slice(1)) {
    assert.ok(Math.abs(value.heave-outcomes[0].heave)<.0001&&Math.abs(value.pitch-outcomes[0].pitch)<.0001,
      '30/60/120 Hz converge to the same real support pose');
    assert.ok(Math.abs(value.maxPitch-outcomes[0].maxPitch)<.005,'Motion envelope remains close across frame rates');
  }
  for(const samples of motionSamples.slice(1))for(let i=0;i<samples.length;i++) {
    const baseline=motionSamples[0][i],actual=samples[i];
    assert.ok(Math.abs(actual.heave-baseline.heave)<.008&&Math.abs(actual.pitch-baseline.pitch)<.01,
      'Moving hull response remains consistent at common 30/60/120 Hz timestamps');
    for(let j=0;j<actual.travel.length;j++)assert.ok(Math.abs(actual.travel[j]-baseline.travel[j])<.02,
      'Independent wheel response remains consistent across frame rates');
  }
  summaries.push({seed,matchedSurfaceQueries:samples,southApproachZ:south,foreAftDifference:foreAft,outcomes});
  meshes.forEach(mesh=>{if(mesh!==soil&&mesh!==bank)return;mesh.geometry.dispose();mesh.material.dispose();});
  box.dispose();material.dispose();
}
console.log('Tank suspension passed: exact rendered bank/bridge support, independent contacts, pitched/rolled real approaches, deforming tracks, stationary upload cutoff, and 30/60/120 Hz settle.',JSON.stringify(summaries));
