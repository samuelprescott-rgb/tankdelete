// Called by check-tank-drive-scene: actual tank + live squad, real W key
// frames, same virtual Boot Camp centerline as the recorded bridge drive.
import assert from 'node:assert/strict';
import React from 'react';
import * as THREE from 'three';

export async function checkBridgeSquad({loadSource,render,Tank,ref,initial,frames,key,scene}){
  const [{USInfantrySquad},combat,wetland,river,training,embassy,terrain]=await Promise.all([
    '../src/components/Scene/USInfantrySquad.tsx','../src/lib/combat.ts',
    '../src/components/Scene/VietnamEnvironment.tsx','../src/components/Scene/riverLayout.ts',
    '../src/lib/training.ts','../src/lib/embassyDefense.ts','../src/lib/terrain.ts',
  ].map(loadSource));
  const seed=combat.hashCombatSession(training.TRAINING_DIRECTORY), stations=river.createRiverStations(seed);
  const bridge=river.createRiverCrossings(stations).find(c=>c.kind==='bridge');
  const friendlies=combat.createUSInfantryCombatants(),enemy=combat.createVietCongCombatants(1968^1);
  const poses={current:new Map(friendlies.map(f=>[f.id,{position:new THREE.Vector3(...f.position)}]))};
  await render(React.createElement(React.Fragment,null,
    React.createElement(Tank,{ref,initialPosition:initial,environmentSeed:seed}),
    React.createElement(USInfantrySquad,{enemies:enemy,friendlies,friendlyPosesRef:poses,navigationRiver:stations})));
  frames(1);scene.updateMatrixWorld(true);
  const actors=friendlies.map(f=>scene.getObjectByName(f.id));
  assert.ok(actors.length===5&&actors.every(a=>a?.visible),'All five actual allies are active on the route');
  const bag=scene.getObjectByName('us-field-sandbags');
  assert.ok(bag?.count>25,'Read the sandbag meshes actually drawn by the squad');
  bag.geometry.computeBoundingBox();
  const statics=[],matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  let forwardBags=0;
  const cover=combat.US_FORWARD_POST.cover;
  const embassyPost=combat.getUSForwardPost(embassy.EMBASSY_DEFENSE_OFFSET_Z);
  const verifyDry=(x,z)=>{
    assert.ok(!wetland.isInsidePaddy(x,z,.04),'Forward placement must clear the authored water footprint');
    assert.ok(!river.isInsideRiverCorridor(x,z,stations,.20),'Post must not occupy the river');
    assert.ok(!terrain.intersectsTerrainMound(x,z,.08),'Post must not intersect authored mounds');
  };
  for(let i=0;i<bag.count;i++){
    bag.getMatrixAt(i,matrix);matrix.premultiply(bag.matrixWorld);
    statics.push(bag.geometry.boundingBox.clone().applyMatrix4(matrix));
    point.setFromMatrixPosition(matrix);
    if(Math.hypot(point.x-cover[0],point.z-cover[2])>1.85)continue;
    forwardBags++;
    // Check the entire rendered footprint, including both side returns.
    const attr=bag.geometry.getAttribute('position');
    for(let k=0;k<attr.count;k++){point.fromBufferAttribute(attr,k).applyMatrix4(matrix);verifyDry(point.x,point.z);
      verifyDry(point.x-cover[0]+embassyPost.cover[0],point.z-cover[2]+embassyPost.cover[2]);}
  }
  assert.ok(forwardBags>=10);
  for(const p of [combat.US_FORWARD_POST.occupant,combat.US_FORWARD_POST.alternate,embassyPost.occupant,embassyPost.alternate])
    for(const dx of [-.30,.30])for(const dz of [-.28,.28])verifyDry(p[0]+dx,p[2]+dz);
  assert.equal(combat.US_INFANTRY_DEPLOYMENT[4].position,combat.US_FORWARD_POST.occupant);
  const gear=['tank-left-fender','tank-right-fender','tank-left-carrier','tank-right-carrier']
    .map(n=>ref.current.getObjectByName(n));
  assert.ok(gear.every(o=>o?.isMesh));
  const hull=new THREE.Box3(),temp=new THREE.Box3();
  const clearance=(a,b)=>Math.hypot(Math.max(0,a.min.x-b.max.x,b.min.x-a.max.x),
    Math.max(0,a.min.z-b.max.z,b.min.z-a.max.z));
  let oldZ=-12,near=Infinity,n=0;
  key('keydown','KeyW');
  try {
    while(ref.current.position.z<bridge.z+bridge.length/2+1.3 && n++<720){
      frames(1);scene.updateMatrixWorld(true);hull.makeEmpty();
      for(const g of gear)hull.union(temp.setFromObject(g));
      hull.expandByScalar(.08);
      for(const box of statics)near=Math.min(near,clearance(hull,box));
      for(const a of actors)near=Math.min(near,clearance(hull,temp.setFromObject(a)));
      assert.ok(near>.1,'A real soldier or bag intersects the moving vehicle envelope');
      assert.ok(Math.abs(ref.current.position.x)<.01&&ref.current.position.z>=oldZ-.001);
      oldZ=ref.current.position.z;
    }
  } finally {key('keyup','KeyW');}
  assert.ok(oldZ>bridge.z+bridge.length/2+1,'Actual vehicle must cross the entire bridge');
  const defenders=combat.createUSInfantryCombatants(embassy.EMBASSY_DEFENSE_OFFSET_Z);
  await render(React.createElement(USInfantrySquad,{enemies:[],friendlies:defenders,friendlyPosesRef:poses,
    navigationRiver:stations,defenseOffsetZ:embassy.EMBASSY_DEFENSE_OFFSET_Z}));
  frames(1);scene.updateMatrixWorld(true);
  const guard=scene.getObjectByName('us-rifle-5').getWorldPosition(new THREE.Vector3());
  assert.ok(guard.distanceTo(new THREE.Vector3(...embassyPost.occupant))<.03,'Rendered night guard uses the mission assignment');
  assert.deepEqual(defenders[4].position,embassyPost.occupant,'Night combat and rendering use the same home');
  const nightBags=scene.getObjectByName('us-field-sandbags');
  let nightCount=0;
  for(let i=0;i<nightBags.count;i++){nightBags.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix.premultiply(nightBags.matrixWorld));
    if(Math.hypot(point.x-embassyPost.cover[0],point.z-embassyPost.cover[2])<1.85)nightCount++;}
  assert.equal(nightCount,forwardBags,'All forward bags follow the original night post');
  console.log(`Actual Boot Camp hull, 5 active allies + ${bag.count} rendered bags: ${n} W-input frames, minimum clearance ${near.toFixed(2)}u, both deployments dry.`);
}
