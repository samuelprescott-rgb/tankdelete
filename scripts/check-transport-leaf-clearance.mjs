// No WebGL: mount the real scene, including the actual imported plant meshes,
// and intersect their transformed triangles with the moving cabin.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import assert from 'node:assert/strict';
import React from 'react';
import {act,context,extend,reconciler} from '@react-three/fiber';
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js';
import {TGALoader} from 'three/examples/jsm/loaders/TGALoader.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as T from 'three';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),entry=root+'/virtual-leaves.mjs';
const files=['components/Scene/VietnamEnvironment','components/Scene/OldBankFig','lib/campaignFlights','lib/embassyLift','lib/combat','lib/campaignFixtures','lib/training','lib/embassyDefense'];
const built=await build({root,configFile:false,logLevel:'silent',publicDir:false,esbuild:{jsx:'automatic'},plugins:[{
  name:'leaf-clearance',resolveId:p=>p===entry?p:null,load:p=>p===entry?files.map(f=>'export * from "./src/'+f+'"').join(';'):null}],
  build:{ssr:entry,write:false}});
const code=built.output.find(x=>x.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const G=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const asset=u=>path.join(root,'public',u);
// The renderer only needs image URLs to identify painted cutouts. Read every
// real model, including glTF accessors via its original binary buffers.
T.TextureLoader.prototype.load=function(url,ok){const t=new T.Texture();t.name=url;ok?.(t);return t;};
TGALoader.prototype.load=function(url,ok){const t=new T.Texture();t.name=url;ok(t);return t;};
OBJLoader.prototype.load=function(url,ok){ok(this.parse(fs.readFileSync(asset(url),'utf8')));};
GLTFLoader.prototype.load=function(url,ok,_progress,fail){const j=JSON.parse(fs.readFileSync(asset(url),'utf8'));
  for(const b of j.buffers)b.uri='data:application/octet-stream;base64,'+fs.readFileSync(path.join(path.dirname(asset(url)),b.uri)).toString('base64');
  delete j.images;delete j.textures;delete j.samplers;j.materials=j.materials?.map(m=>({name:m.name}));
  this.parse(JSON.stringify(j),'',ok,fail);};
globalThis.ProgressEvent??=class{constructor(type,init){this.type=type;Object.assign(this,init);}};
const canvasStub=new Proxy({},{get:(_t,k)=>k==='getImageData'||k==='createImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray((w??x)*(h??y)*4)}):k==='createRadialGradient'||k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}});
globalThis.document={createElement:()=>({getContext:()=>canvasStub})};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(T);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,16/9,.1,340),clock={elapsedTime:0};
const state={scene,camera,clock,invalidate(){},internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
  subscribe(){return ()=>{};}}};
const store=Object.assign((s=v=>v)=>s(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;},rec=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null),el=React.createElement;
const render=n=>act(async()=>reconciler.updateContainer(n&&el(context.Provider,{value:store},el(React.Suspense,{fallback:null},n)),rec,null,null));
const tankRef={current:new T.Group()};
const worldOnly=process.argv[2]==='--world-only';
// Offline/default CI uses the measured lenses; an external full capture
// receipt can still be supplied explicitly to verify a particular build.
const capturePath=path.resolve(root,process.argv[2]??'scripts/fixtures/transport-cabin-lenses.json');
const snapshot=!worldOnly&&fs.existsSync(capturePath)?JSON.parse(fs.readFileSync(capturePath,'utf8')):null;
if(!worldOnly)assert.ok(snapshot?.pass&&snapshot.captureComplete,'A completed strict cabin-camera receipt is required: '+capturePath);
const vec=a=>new T.Vector3(...a),box=(a,b)=>new T.Box3(vec(a),vec(b));
// Conservatively enclose all four physically seated adult rigs and the
// hinged gunner; covers the whole doorway during the move to the sill.
const berth=box([-.91,-.445,-.66],[.91,.62,1.04]),mat=new T.Matrix4(),im=new T.Matrix4(),tri=new T.Triangle();
const wind=.17;
const fit=(g,n=0)=>{const a=g.getAttribute('position'),ix=g.index;
  return [0,1,2].map(j=>new T.Vector3().fromBufferAttribute(a,ix?ix.getX(n+j):n+j));};
function ship(t,port){const a=(port?G.embassyTransportPose:G.transportPose)(t);
  return new T.Matrix4().compose(vec([a.x,a.y,a.z]),new T.Quaternion().setFromEuler(new T.Euler(a.pitch,a.yaw,a.roll,'YXZ')),vec([1,1,1]));}
function gather(zone){
  const candidates=[],all={meshes:0,instances:0};
  scene.traverse(o=>{
    if(!o.isMesh||!o.geometry.attributes.position)return;
    const paths=[];for(let p=o;p;p=p.parent)if(p.name)paths.unshift(p.name);
    const tag=paths.join('/')+' '+(o.material?.name??'')+' '+(o.material?.map?.name??'')+' '+(o.material?.customProgramCacheKey?.().slice(0,82)??'').split('\n')[0];
    // Terrain/aircraft/structures are not plants; include all imported,
    // instanced bed plants and every leaf, bark, crown or grass group.
    if(!/jungle|fig|grass|rice|photo-fern|banana|rain-tree|reeds|understory|foliage|leaf/i.test(tag))return;
    all.meshes++;const g=o.geometry;g.computeBoundingBox();
    const n=o.isInstancedMesh?o.count:1;all.instances+=n;
    for(let i=0;i<n;i++){if(o.isInstancedMesh){o.getMatrixAt(i,im);mat.multiplyMatrices(o.matrixWorld,im);}else mat.copy(o.matrixWorld);
      if(!g.boundingBox.clone().applyMatrix4(mat).expandByScalar(wind).intersectsBox(zone))continue;
      const count=g.index?.count??g.attributes.position.count,tris=[];
      for(let j=0;j<count;j+=3){const [a,b,c]=fit(g,j).map(v=>v.applyMatrix4(mat));
        if(zone.intersectsTriangle(tri.set(a,b,c)))tris.push({a,b,c,j});}
      if(tris.length)candidates.push({tag:tag.trim(),i,at:new T.Vector3().setFromMatrixPosition(mat).toArray(),
        bbox:g.boundingBox.clone().applyMatrix4(mat).expandByScalar(wind),tris});
    }
  });return {all,candidates};}
for(const port of [false,true]){
  const seed=G.hashCombatSession(port?G.TRAINING_DIRECTORY:G.CAMPAIGN_ROOT);
  await render(el(G.VietnamEnvironment,{seed,tankRef,campaignClearing:!port,rearOutpost:!port,fightingPositionOffsetZ:port?G.EMBASSY_DEFENSE_OFFSET_Z:0}));
  for(let i=0;i<5&&!scene.getObjectByName('authored-jungle-palm-batch');i++)await act(async()=>{await new Promise(r=>setTimeout(r,15));});
  assert.ok(scene.getObjectByName('authored-jungle-palm-batch'));scene.updateMatrixWorld(true);
  const r=snapshot?.runs.find(x=>x.mode===(port?'embassy':'campaign')),shot=r?.shots.find(s=>s.label==='seated-near');
  if(!worldOnly){
    assert.ok(shot,'Cabin receipt is missing the '+(port?'embassy':'campaign')+' seated-near camera');
    assert.ok(vec(shot.air).distanceTo(new T.Vector3().setFromMatrixPosition(ship(shot.t,port)))<.03,
      'Captured air position differs from the live route; record the new optical view before testing it');
  }
  const zone=new T.Box3(),frames=[];
  // Both crews remain aboard during departure, even after the passengers
  // reach their posts. Check the entire visible flight, not only unloading.
  for(let k=0,t0=port?0:.6;t0+k/30<(port?G.LIFT_END:G.DAY_OUT);k++){
    const t=t0+k/30,m=ship(t,port);zone.union(berth.clone().applyMatrix4(m));frames.push({t,m});}
  for(const s of r?.shots??[])zone.expandByPoint(vec(s.camera));zone.expandByScalar(.8);
  const {all,candidates}=gather(zone);assert.ok(all.meshes>=25&&all.instances>14000&&candidates.length>0);
  const fig=scene.getObjectByName(port?'west-verge-rain-tree':'paddy-verge-rain-tree'),before=G.createBankFigGeometry(port);
  let vertexCount=0,unchanged=0;for(const [index,key] of ['bark','sprays'].entries()){
    const orig=before[key],modified=fig.children[index].geometry,pa=orig.attributes.position,pb=modified.attributes.position;
    assert.equal(pa.count,pb.count);assert.deepEqual(orig.index.array,modified.index.array);
    for(let i=0;i<pa.count;i++){
      const v=new T.Vector3().fromBufferAttribute(pa,i),w=new T.Vector3().fromBufferAttribute(pb,i),d=v.distanceTo(w);
      vertexCount++;if(d<.025)unchanged++;if(v.y<1.3)assert.ok(d<1e-6,'fig root moved');}
    orig.dispose();}
  console.log(port?'Embassy':'Campaign',all,'candidate placements',candidates.length,'fig vertex positions retained within 2.5cm:',unchanged+'/'+vertexCount);
  const hits=new Map(),sampleHits=[];
  if(shot)frames.push({t:shot.t,m:ship(shot.t,port)});
  for(const {t,m} of frames){const inv=m.clone().invert();
    const shell=berth.clone().expandByScalar(wind),worldBounds=shell.clone().applyMatrix4(m);
    for(const p of candidates){if(!worldBounds.intersectsBox(p.bbox))continue;let exact=0,close=0;for(const {a,b,c} of p.tris){
      tri.a.copy(a).applyMatrix4(inv);tri.b.copy(b).applyMatrix4(inv);tri.c.copy(c).applyMatrix4(inv);
      if(berth.intersectsTriangle(tri))exact++;else if(shell.intersectsTriangle(tri))close++;}
      if(!exact&&!close)continue;
      const id=p.tag+' #'+p.i;
      if(!hits.has(id))hits.set(id,{at:p.at,min:t,max:t,maxTriangles:0,maxWindOnly:0});
      const event=hits.get(id);event.min=Math.min(event.min,t);event.max=Math.max(event.max,t);event.maxTriangles=Math.max(event.maxTriangles,exact);event.maxWindOnly=Math.max(event.maxWindOnly,close);
      if(t===shot?.t)sampleHits.push({id,exact,close});
    }}
  console.log('Sweep',frames.length,'frames',JSON.stringify(Object.fromEntries(hits)),shot?'at actual seated still '+JSON.stringify(sampleHits):'(physical geometry only; no optical claim)');
  if(hits.size){
    const wood=scene.getObjectByName('layered-jungle')?.children[0];
    if(wood?.isInstancedMesh){
      const roots=Array.from({length:wood.count},(_,i)=>{wood.getMatrixAt(i,im);
        return new T.Vector3().setFromMatrixPosition(mat.multiplyMatrices(wood.matrixWorld,im));});
      for(const v of hits.values()){const [x,,z]=v.at,d=p=>(p.x-x)**2+(p.z-z)**2;
        console.log('Nearest mature root to affected foliage:',roots.reduce((a,b)=>d(a)<d(b)?a:b).toArray());}
    }
  }
  assert.equal(hits.size,0,'World vegetation enters occupied cabin or its 17cm wind tolerance.');
  if(!shot){await render(null);continue;}
  const lens=new T.PerspectiveCamera(shot.fov,shot.canvas[0]/shot.canvas[1],.1,340);lens.position.fromArray(shot.camera);lens.quaternion.fromArray(shot.quaternion);lens.updateMatrixWorld();
  const ray=new T.Raycaster(),hp=new T.Vector3(),proj=[];
  for(const [x,y] of [[650,340],[760,300],[835,300],[950,230],[1000,190],[733,320]]){ray.setFromCamera(new T.Vector2(x/960-1,1-y/540),lens);const rs=[];
    for(const p of candidates)for(const {a,b,c} of p.tris){if(ray.ray.intersectTriangle(a,b,c,false,hp)){const d=hp.distanceTo(ray.ray.origin);if(d<4)rs.push({id:p.tag+' #'+p.i,d:+d.toFixed(3),pt:hp.toArray().map(v=>+v.toFixed(3))});}}
    const loc=ray.ray.clone().applyMatrix4(ship(shot.t,port).invert()),near=loc.intersectBox(berth,new T.Vector3());
    proj.push({pixel:[x,y],berth:near?+near.distanceTo(loc.origin).toFixed(3):null,hits:rs.sort((a,b)=>a.d-b.d).slice(0,2)});}
  console.log('Sight lines',JSON.stringify(proj));
  // In the pinned R20 campaign shot these six rays struck mid-crown #239
  // at 1.27–1.57m while the cabin's near side was 1.23–1.30m from the eye.
  assert.ok(proj.every(p=>p.berth),'Receipt camera rays miss the occupied cabin: stale lens or route');
  assert.ok(proj.every(p=>!p.hits.length),'Entry sightline obscured by close vegetation');
  if(!port){
    // Positive control: temporarily mount the same campaign seed WITHOUT
    // its landing-specific foliage staging. This restores the two unpruned
    // source crowns, proving the narrow phase catches the reported contact.
    await render(el(G.VietnamEnvironment,{seed,tankRef,campaignClearing:false,rearOutpost:true}));
    scene.updateMatrixWorld(true);
    // The precise contact instant moves with the shape of the modeled
    // leaves. Use the same flight and triangle test as the staged scene.
    const crowns=gather(zone).candidates.filter(p=>p.tag.includes('layered-jungle')&&p.tag.includes('branch-spray'));
    let peak=0,peakTime=0;
    for(const {t,m} of frames){
      const inv=m.clone().invert(),bounds=berth.clone().applyMatrix4(m);
      let contacts=0;
      for(const p of crowns)if(bounds.intersectsBox(p.bbox))for(const {a,b,c} of p.tris){
        tri.a.copy(a).applyMatrix4(inv);tri.b.copy(b).applyMatrix4(inv);tri.c.copy(c).applyMatrix4(inv);
        if(berth.intersectsTriangle(tri))contacts++;}
      if(contacts>peak){peak=contacts;peakTime=t;}
    }
    console.log('Unpruned campaign control: peak',peak,'intersecting crown triangles at',peakTime.toFixed(3),'s; corrected scene 0.');
    assert.ok(peak>=3,'Unpruned source must reproduce the physical leaf collision');
  }
  await render(null);
}
