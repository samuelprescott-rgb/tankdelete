// Exercise the same React/Three instance batch and projectile manager as the
// playable crossing. No QA damage calls, stand-in collider or filesystem IO.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import React from 'react';
import { act,context,extend,reconciler } from '@react-three/fiber';
import * as THREE from 'three';
async function load(path) {
  const buildResult=await build({configFile:false,logLevel:'silent',publicDir:false,esbuild:{jsx:'automatic'},
    build:{ssr:fileURLToPath(new URL(path,import.meta.url)),write:false,minify:false}});
  const code=buildResult.output.find(c=>c.type==='chunk'&&c.isEntry).code
    .replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const { InstancedCategoryBlocks }=await load('../src/components/Scene/FileBlocks.tsx');
const { createArmedFileInk }=await load('../src/components/Scene/armedFileInk.ts');
const { ProjectileManager }=await load('../src/components/Scene/ProjectileManager.tsx');
const { createGhostHutProbe }=await load('../src/components/Scene/ghostHutSurface.ts');
globalThis.IS_REACT_ACT_ENVIRONMENT=true; extend(THREE);
const scene=new THREE.Scene(), refs=new Set(), v=(x,y,z)=>new THREE.Vector3(x,y,z);
const state={scene,camera:new THREE.PerspectiveCamera(),clock:{elapsedTime:0},invalidate(){},internal:{active:false,
  frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
  subscribe(ref){refs.add(ref);return ()=>refs.delete(ref);}}};
const store=Object.assign((f=x=>x)=>f(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;};
const root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const {createZeroTile}=await load('../src/components/Scene/runningZeros.ts');
const zeroTile=createZeroTile(), warningInk=createArmedFileInk(), surfaces={colorMap:new THREE.Texture(),bumpMap:new THREE.Texture()};
const block=(path,x,z)=>({path,name:path,position:[x,.5,z],scale:1.66,category:'other'});
const a=block('fixture:/a',-5,8), b=block('fixture:/b',7,9), c=block('fixture:/outside',30,8);
let blocks=[a,b,c], markedFiles=new Set(), deletingFiles=new Set(), campaignSurfaces=false;
let restoreDeadlines=new Map();
const meshRef={current:null}, fileMeshRefs={current:[meshRef]}, gun={current:[]}, received=[], done=[];
const probe=createGhostHutProbe();
async function render(unmount=false) {
  const children=React.createElement(React.Fragment,null,
    React.createElement(InstancedCategoryBlocks,{blocks,category:'other',variant:0,onHover:()=>{},
      meshRef,markedFiles,deletingFiles,restoreDeadlines,onDeletionComplete:p=>done.push(p),surfaces,zeroTile,warningInk,allHutsHaveSurface:campaignSurfaces}),
    React.createElement(ProjectileManager,{pool:gun,despawn:i=>{gun.current[i].active=false;},allBlocks:blocks,
      enemies:[],fileMeshRefs,allHutsHaveSurface:campaignSurfaces,onEnemyHit:()=>assert.fail(),onHit:(path,_,hit)=>{
        assert.ok(hit?.skin); received.push({path,point:hit.point.clone()});
        hit.skin.strike(hit.index,hit.point,hit.normal);
      }}));
  await act(async()=>reconciler.updateContainer(unmount?null:React.createElement(context.Provider,{value:store},children),root,null,null));
  scene.updateMatrixWorld(true);
}
function advance(n) {for(let i=0;i<n;i++){state.clock.elapsedTime+=1/60; for (const ref of refs) ref.current(state,1/60);}}
try {
  await render(); const mesh=meshRef.current, pose=new THREE.Matrix4(); mesh.getMatrixAt(0,pose);
  // A simultaneous area mark still has independently sorted shapes for each
  // file, but creates no per-hit warning geometry, wireframe indices or paint.
  markedFiles=new Set([a.path,b.path,c.path]); await render();
  const shapes=[];scene.traverse(o=>{if(o.isMesh && [warningInk.ring.material,warningInk.cage.material].includes(o.material))shapes.push(o);});
  assert.equal(shapes.length,6);
  for(const o of shapes){
    const art=o.material===warningInk.cage.material?warningInk.cage:warningInk.ring;
    assert.equal(o.geometry,art.geometry);assert.equal(o.scale.x,1.66);
    assert.equal(o.scale.x,o.scale.y);assert.equal(o.scale.x,o.scale.z);
  }
  markedFiles=new Set();await render();
  const w=p=>p.clone().applyMatrix4(pose), hit=(from,to)=>probe(fileMeshRefs.current,w(from),w(to));
  assert.deepEqual(mesh.userData.ghostHutSkin.entries.map(e=>e.block.path),[a.path,b.path],'only crossing files');
  for (const [start,end,axis,sign] of [
    [v(.30,.35,-2),v(.30,.35,1),'z',-1],[v(-.28,.35,-2),v(-.28,.35,1),'z',-1],
    [v(.1,.32,2),v(.1,.32,-1),'z',1],[v(-2,.35,-.28),v(1,.35,-.28),'x',-1],
    [v(2,.35,-.28),v(-1,.35,-.28),'x',1]]) {
    const h=hit(start,end); assert.equal(h?.path,a.path); assert.ok(h.normal[axis]*sign>.9);
    assert.ok(h.point.distanceTo(start.clone().lerp(end,h.t))<1e-5,'actual local triangle and travel fraction agree');
  }
  const throughDoor=hit(v(0,.29,-2),v(0,.29,1));
  assert.ok(throughDoor.point.z>.1,'door opening hits the inset interior, not the porch bounding volume');
  assert.equal(hit(v(-1.01,.50,-1.45),v(-1.01,.50,1.45)),null,'empty space beside hut stays empty');
  function shoot(x) {
    const origin=w(v(x,.35,-1.39)), target=w(v(x,.35,1)), direction=target.sub(origin).normalize();
    gun.current=[{position:origin,direction,active:true,lifetime:0,kind:'cannon',triggerId:0}];
    advance(6); assert.equal(gun.current[0].active,false);
  }
  shoot(-.28); assert.equal(received.length,1); markedFiles=new Set([a.path]); await render(); advance(100);
  const scar=mesh.geometry.getAttribute('ghostScar'), face=mesh.geometry.getAttribute('ghostFace');
  const siding=mesh.geometry.getAttribute('ghostPlank');
  assert.equal(siding.count,mesh.geometry.getAttribute('position').count);
  const frontPanels=[...siding.array].filter(x=>x===1).length;
  assert.equal(frontPanels,6*24,'only six authored wall-siding boxes get the plank course finish');
  assert.ok(frontPanels<siding.count/5,'thatch, openings, porch and posts use their own materials');
  assert.ok(Math.abs(scar.getX(0)+.28)<.001 && face.getW(0)===1,'first localized contact stays armed');
  assert.equal(scar.getW(1),-1); assert.equal(scar.getW(2),-1);
  assert.equal(face.getW(1),0); assert.equal(face.getW(2),-1,'outside plot in same draw keeps its original siding');
  markedFiles=new Set(); await render();
  assert.equal(scar.getW(0),-1,'disarm restores planks immediately');
  shoot(-.28); markedFiles=new Set([a.path]); await render();
  for(const [material,shaderLib] of [[mesh.material,THREE.ShaderLib.standard],[mesh.customDepthMaterial,THREE.ShaderLib.depth]]) {
    const shader={uniforms:{},vertexShader:shaderLib.vertexShader,fragmentShader:shaderLib.fragmentShader};
    material.onBeforeCompile(shader); assert.equal(shader.uniforms.uGhostZeros.value,zeroTile);
    assert.match(shader.fragmentShader,/runningZeros\(uGhostZeros,glyph,dx,dy/);
    assert.ok(shader.fragmentShader.includes('uv.x/.00046,(uv.y+.08)/.00064'));
    assert.equal(zeroTile.minFilter,THREE.LinearMipmapLinearFilter);
    if(material===mesh.material) assert.match(shader.fragmentShader,/if\(vHutPlank>.5 && vHutAxis\.w>=0\.0\)/);
  }
  shoot(.30); assert.equal(received.length,3); assert.ok(received[2].point.distanceTo(received[1].point)>.57);
  // A second hit can land at the low point of the warning pulse.
  warningInk.ring.material.opacity=.44;
  deletingFiles=new Set([a.path]); markedFiles=new Set([b.path]); await render();
  assert.equal(scene.getObjectByName('releasing-hut-ring').material.opacity,.44);
  warningInk.ring.material.opacity=.96;
  advance(17);
  const fading=scene.getObjectByName('releasing-hut-ring'), chips=scene.getObjectByName('hut-breakup-zeros');
  assert.ok(fading && fading.material.opacity>0 && fading.material.opacity<.44,'Ring fades during confirmed destruction after the armed flag clears');
  assert.equal(scene.getObjectByName('armed-hut-ring').material.opacity,.96,'Neighboring marks keep their own opacity');
  assert.equal(chips,undefined,'The dissolve stays on the hut surface');
  const phaseStart=scar.getW(0);
  shoot(-.28);
  assert.equal(face.getW(0),2);assert.equal(scar.getW(0),phaseStart,'Late rounds cannot restart the breakup');
  assert.ok(Math.abs(scar.getX(0)-.3)<.001 && face.getW(0)===2,'confirmation wave starts at the second actual impact');
  const during=new THREE.Matrix4(); mesh.getMatrixAt(0,during); assert.ok(during.equals(pose),'structure stays still while unloading');
  deletingFiles=new Set(); markedFiles=new Set(); await render(); advance(52);
  assert.equal(scar.getW(0),-1); assert.deepEqual(done,[],'undo during the release cancels removal and restores all planks');
  assert.equal(scene.getObjectByName('hut-breakup-zeros'),undefined);assert.equal(scene.getObjectByName('releasing-hut-ring'),undefined);
  shoot(-.28); markedFiles=new Set([a.path]); await render();
  shoot(.30); deletingFiles=new Set([a.path]); await render(); advance(17);
  advance(45); assert.deepEqual(done,[a.path]);
  blocks=[b,c]; markedFiles=new Set(); deletingFiles=new Set(); await render();
  assert.equal(meshRef.current.geometry.getAttribute('ghostScar').getW(0),-1,'repacked neighbor never inherits file damage');
  blocks=[b,c,a];restoreDeadlines=new Map([[a.path,performance.now()+850]]);await render();
  assert.equal(face.getW(2),3,'only the confirmed Undo path reassembles after removal');
  assert.equal(face.getW(0),0,'repacking keeps neighbors intact');
  restoreDeadlines=new Map();await render();
  assert.equal(face.getW(2),0,'expired restoration returns to ordinary siding');
  deletingFiles=new Set([b.path]);await render();
  assert.equal(face.getW(0),2,'batch confirmation without a surface strike gets a release wave');
  blocks=[b,c];deletingFiles=new Set();await render();
  campaignSurfaces=true; await render(); advance(2);
  assert.deepEqual(meshRef.current.userData.ghostHutSkin.entries.map(e=>e.block.path),[b.path,c.path]);
  const farPose=new THREE.Matrix4();meshRef.current.getMatrixAt(1,farPose);
  const farOrigin=v(-.28,.35,-1.39).applyMatrix4(farPose),farDirection=v(-.28,.35,1).applyMatrix4(farPose).sub(farOrigin).normalize();
  gun.current=[{position:farOrigin,direction:farDirection,active:true,lifetime:0,kind:'cannon',triggerId:32}]; advance(6);
  assert.equal(received.at(-1)?.path,c.path,'the real projectile must hit the wall of a campaign hut outside the former crossing-only zone');
  console.log('Ghost hut: campaign outlier hit + actual mounted cannon + rotated/scaled mesh, five wall rays, doorway/near miss, independent impacts, surface and shadow discard, disarm/undo repair, stationary de-rez and clean slot reuse passed.');
} finally {
  await render(true); zeroTile.dispose(); warningInk.dispose(); surfaces.colorMap.dispose(); surfaces.bumpMap.dispose();
}
