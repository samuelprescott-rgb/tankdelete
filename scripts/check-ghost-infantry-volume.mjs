// Unlike a geometry-factory test, mount the real squads: a hidden 3D rig
// underneath a camera-facing sprite must fail even if its bones still animate.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import React from 'react';
import { act, context, extend, reconciler } from '@react-three/fiber';
import * as THREE from 'three';
import {checkFieldSupplyClearance} from './check-field-supply-clearance.mjs';

async function load(path) {
  const result = await build({ configFile:false, logLevel:'silent', publicDir:false, esbuild:{jsx:'automatic'},
    build:{ssr:fileURLToPath(new URL(path,import.meta.url)), write:false, minify:false} });
  const code = result.output.find(c=>c.type==='chunk' && c.isEntry).code
    .replace(/from "([^"]+)"/g, (_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const [{USInfantrySquad},{VietCongCombatants},combat] = await Promise.all([
  '../src/components/Scene/USInfantrySquad.tsx','../src/components/Scene/VietCongCombatants.tsx',
  '../src/lib/combat.ts'].map(load));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
extend(THREE);
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(), subscriptions=new Set();
const state={scene,camera,clock:{elapsedTime:0},invalidate(){},internal:{active:false,frames:0,interaction:[],
  initialHits:[],hovered:new Map(),capturedMap:new Map(),
  subscribe(ref){subscriptions.add(ref);return ()=>subscriptions.delete(ref);}}};
const store=Object.assign((select=v=>v)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;};
const root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const render=node=>act(async()=>reconciler.updateContainer(node&&React.createElement(context.Provider,{value:store},node),root,null,null));
const allies=combat.createUSInfantryCombatants();
const foes=combat.createVietCongCombatants(1968,2).map((e,i)=>({...e,stance:i?'kneeling':'standing',headwear:i?'boonie':'pith',
  uniformVariant:i}));
const ref=current=>({current}), friendlyPosesRef=ref(new Map()),enemyPosesRef=ref(new Map()),tankRef=ref(null);
function squads(alive,offset=0){
  const friendlies=combat.createUSInfantryCombatants(offset).map(a=>({...a,alive})),enemies=foes.map(e=>({...e,alive}));
  return React.createElement(React.Fragment,null,
    React.createElement(USInfantrySquad,{key:'field-'+offset,defenseOffsetZ:offset,friendlies,enemies,friendlyPosesRef,enemyPosesRef}),
    React.createElement(VietCongCombatants,{enemies,tankRef,friendlyPosesRef,enemyPosesRef,friendliesRef:ref(friendlies)}));
}
const drawables=actor=>{const out=[];actor.traverseVisible(o=>{if(o.isMesh||o.isSprite)out.push(o);});return out;};
const summary=[];
function inspect(actor,faction) {
  assert.ok(actor?.visible, faction+' live actor did not mount');
  const all=drawables(actor),label=faction+':'+actor.name;
  // The separate overhead IFF dash/chevron is intentionally a small HUD
  // sprite. Whitelist that specific direct child only; no body, face, rifle
  // or other display mesh is permitted to masquerade as a billboard.
  const marker=all.filter(o=>o.isSprite&&o.parent===actor&&o.name===(faction==='US'?'field-ally-dash':'field-hostile-chevron'));
  assert.equal(marker.length,1,label+' should have one explicit overhead IFF marker');
  assert(marker[0].position.y>1.25,label+' IFF mark is above the figure');
  const draws=all.filter(o=>o!==marker[0]);
  const bodies=draws.filter(o=>o.isSkinnedMesh);
  assert.equal(bodies.length,1,label+' must draw its skinned body; a hidden rig under a visible billboard is not 3D infantry');
  assert.ok(draws.every(o=>!o.isSprite&&o.geometry?.type!=='PlaneGeometry'&&o.name!=='ghost-actor-pixels'),label+' contains an actor-facing card');
  assert.equal(draws.length,faction==='US'?2:1,label+' unexpected drawables: idle US body + rifle; idle VC body with merged rifle');
  const body=bodies[0],g=body.geometry,pos=g.getAttribute('position'),kind=g.getAttribute('surfaceKind');
  const portrait=g.userData.fieldPortrait,chart=g.getAttribute('fieldFaceUV');
  assert.equal(portrait.mode,'baked-CC0-UV-globes',label+' mounted a fallback portrait');
  assert.equal(portrait.skinTriangles,1760);assert.equal(portrait.eyeTriangles,260);assert.equal(chart.count,pos.count);
  let facialPixels=0,ocularPixels=0;
  for(let j=0;j<chart.count;j++){const u=chart.getX(j),v=chart.getY(j);
    if(Math.min(u,v)>.9995)ocularPixels++;else if(u+v>.001)facialPixels++;
    if(u+v>.001)assert.equal(kind.getX(j),2,'the field skin chart escaped onto clothing/weapon');
  }
  assert.equal(facialPixels,5280);assert.equal(ocularPixels,780);
  assert.equal(body.skeleton.bones.length,11,label+' requires the existing rig plus two sleeve swivels');
  assert.deepEqual(body.skeleton.bones.slice(9).map(b=>b.name),['field-sleeve-left','field-sleeve-right']);
  assert.ok(body.castShadow && body.receiveShadow && !body.customDepthMaterial,
    label+' regular field actors must retain the built-in skinned shadow pass');
  assert.match(THREE.ShaderLib.depth.vertexShader,/#include <skinning_vertex>/);
  body.skeleton.computeBoneTexture();
  assert.equal(body.skeleton.boneTexture.image.width,8);
  assert.equal(body.skeleton.boneTexture.image.height,8);
  assert.equal(kind.count,pos.count);
  assert.equal(g.getAttribute('skinWeight').count,pos.count);
  assert.equal(g.getAttribute('skinIndex').count,pos.count);
  const boxes=new Map(), point=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    const k=kind.getX(i);
    if(!boxes.has(k))boxes.set(k,new THREE.Box3());
    boxes.get(k).expandByPoint(point.fromBufferAttribute(pos,i));
  }
  // Solid portrait and helmet, field gear and boots; each has depth even at
  // exact side profile. A baked-on frontal face or a plane cannot satisfy it.
  for(const [k,name,min] of [[2,'face',[.10,.11,.10]],[3,'helmet',[.18,.07,.18]],[4,'kit',[.12,.12,.08]],[5,'boots',[.10,.05,.14]]]){
    assert.ok(boxes.has(k),label+' missing '+name);
    const xyz=boxes.get(k).getSize(point).toArray();
    assert.ok(xyz.every((n,i)=>Number.isFinite(n)&&n>min[i]),label+' '+name+' has no real volume: '+xyz);
  }
  const weapon=faction==='US'?draws.find(o=>o!==body):body;
  assert.ok(weapon,label+' missing visible rifle');
  if(faction==='US')weapon.geometry.computeBoundingBox();
  const rifle=faction==='VC'?boxes.get(7):weapon.geometry.boundingBox;
  assert.ok(rifle,label+' missing visible rifle surface');
  const size=rifle.getSize(point);
  assert.ok(size.x>.025&&size.y>.10&&size.z>.50,label+' rifle has no side/profile depth');
  const emitters=[];actor.traverse(o=>{if(o.isMesh&&!o.visible&&o.material.isMeshBasicMaterial)emitters.push(o);});
  assert.equal(emitters.length,1,label+' muzzle flash must be mounted but dark at rest');
  const muzzle=weapon.worldToLocal(emitters[0].getWorldPosition(new THREE.Vector3()));
  assert.ok(Math.abs(muzzle.z-rifle.min.z)<.025,label+' rendered barrel misses the flash socket');
  const tri=draws.reduce((n,o)=>n+(o.geometry.index?.count??o.geometry.attributes.position.count)/3,0);
  assert.ok(tri<=9100,label+' exceeds existing 8500 body + 600 rifle triangle budget: '+tri);
  summary.push([faction,tri]);
}
try{
  await render(squads(true));scene.updateMatrixWorld(true);
  const actors=[...allies.map(a=>[a.id,'US']),...foes.map((e,i)=>[i?e.id:'enemy-infantry-review','VC'])];
  for(const [id,faction] of actors)inspect(scene.getObjectByName(id),faction);
  const {footLaneClear}=await load('../src/lib/infantryPatrol.ts');
  const {fieldSupplyFootprints}=await load('../src/lib/fieldSupplyFootprint.ts');
  const {EMBASSY_DEFENSE_OFFSET_Z}=await load('../src/lib/embassyDefense.ts');
  for(const offset of [0,EMBASSY_DEFENSE_OFFSET_Z]){
    if(offset)await render(squads(true,offset));
    checkFieldSupplyClearance({scene,state,subscriptions,offset,footLaneClear,fieldSupplyFootprints});
  }
  await render(squads(false,EMBASSY_DEFENSE_OFFSET_Z));
  await act(async()=>{
    for(let tick=0;tick<150;tick++){
      state.clock.elapsedTime+=1/30;
      for(const sub of subscriptions)sub.current(state,1/30);
    }
  });
  for(const [id] of actors){
    const model=scene.getObjectByName(id);
    assert.equal(model?drawables(model).length:0,0,id+' defeated render leaked after the fall');
  }
}finally{await render(null);}
assert.equal(subscriptions.size,0,'Unmounted infantry must release frame subscriptions');
console.log('PASS: '+summary.length+' visible field infantry with sleeve swivels, stock skinned shadow pass, 8×8 bone textures, volumetric kit and defeat cleanup. Highest triangles / soldier: '+Math.max(...summary.map(s=>s[1])));
