import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {act, context, extend, reconciler, useLoader} from '@react-three/fiber';
import {build} from 'vite';
import ts from 'typescript';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

const asset = name => new URL(name, import.meta.url);
const source = await readFile(asset('../src/components/Scene/tankCrewSculpt.ts'),'utf8');
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}})
  .outputText.replace("from 'three'",`from '${import.meta.resolve('three')}'`);
const {createTankCrewPortrait,CREW_GRIPS,CREW_NECK,CREW_HEAD_ROTATION} = await import(
  'data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const g=createTankCrewPortrait(), p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color;
assert.equal(g.groups.length,0,'Cloth, skin, radio kit and helmet are one draw');
assert.ok(g.index.count/3<10000,'Single operator geometry budget');
assert.equal(n.count,p.count); assert.equal(c.count,p.count);
for(let i=0;i<p.count;i++) {
  assert.ok([p.getX(i),p.getY(i),p.getZ(i),c.getX(i),c.getY(i),c.getZ(i)].every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<.00001);
}
assert.ok(g.boundingBox.min.y>-.08&&g.boundingBox.min.y<-.065,'Seated waist stays down in the hatch');
assert.ok(g.boundingBox.max.y>.55&&g.boundingBox.max.y<.61,'Rim-to-helmet exposure stays compact with the adult head intact (R26 was .79)');
// Independent transforms from Tank.tsx: pintle group, rear handle, crew
// station and world conversion. A hand placed on the wrong side must fail.
const turret=new T.Vector3(.42,.48,-.02), seat=new T.Vector3(.18,.36,.33);
const {armsStart,helmetStart}=g.userData.surfaceStations;
const hatchRad=.173,waistR=[],shoulderX=[],elbowSide=[],forearmMid=[];
for(let i=0;i<helmetStart;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  if(i<armsStart){
    if(y*.72+seat.y>=.362&&y*.72+seat.y<=.409)waistR.push(Math.hypot(x,z)*.72);
    if(y>.222&&y<.320)shoulderX.push(x);
  }else if(c.getX(i)>c.getY(i)*1.23&&x>.29){
    if(z>-.015&&z<.080)elbowSide.push(y);
    if(z<-.10&&z>-.17)forearmMid.push(y);
  }
}
assert.ok(waistR.length>40&&Math.max(...waistR)<hatchRad-.006,'Entire visible vest clears the actual hatch bore through the rim');
assert.ok(Math.max(...shoulderX)-Math.min(...shoulderX)>.43,'Wide back and shoulders retain adult mass even though the chest sits deeper');
assert.ok(elbowSide.length>10&&forearmMid.length>10&&Math.max(...forearmMid)>Math.min(...elbowSide)+.075,'Near forearm bends upward from its exposed elbow to the control');
const local=new T.Vector3(),color=new T.Color();
for (const [side,grip] of CREW_GRIPS.entries()) {
  const expected = turret.clone().add(new T.Vector3(side ? .065 : -.065,.08,.16)).sub(seat).divideScalar(.72);
  assert.ok(expected.distanceTo(new T.Vector3(...grip))<1e-6);
  const touched=new Set(), knuckles=new Set();
  const triangle=new T.Triangle(), near=new T.Vector3();
  let nearest=Infinity;
  for(let i=0;i<g.index.count;i+=3) {
    const ids=[0,1,2].map(j=>g.index.getX(i+j));
    color.fromBufferAttribute(c,ids[0]);
    if(color.r<color.g*1.22)continue; // skin only, not uniform/helmet
    [triangle.a,triangle.b,triangle.c].forEach((point,k)=>point.fromBufferAttribute(p,ids[k]).sub(expected));
    if(triangle.a.length()>.095)continue;
    triangle.closestPointToPoint(new T.Vector3(),near);
    const r=Math.hypot(near.x,near.z);
    nearest=Math.min(nearest,Math.abs(.023/.72-r));
    if(Math.abs(near.y)<.055 && Math.abs(.023/.72-r)<.012) {
      touched.add(Math.abs(near.z)>Math.abs(near.x) ? (near.z>0?'rear':'front'):(near.x>0?'right':'left'));
      knuckles.add(Math.floor((near.y+.045)/.014));
    }
  }
  assert.ok(nearest<.001,`Hand ${side} must contact its actual handle`);
  assert.ok(touched.has('front') && touched.has('rear') && touched.size>=3,'Palm, curled fingers and thumb surround the handle');
  assert.ok(knuckles.size>=4,'Contact must extend over a hand-height span');
}
const headFrame=new T.Matrix4().compose(new T.Vector3(...CREW_NECK),new T.Quaternion().setFromEuler(
  new T.Euler(...CREW_HEAD_ROTATION)),new T.Vector3(1,1,1)).invert();
let yTop=-Infinity,frontLip=Infinity;const frontYs=[],rearYs=[];
for(let i=helmetStart;i<p.count;i++) {
  local.fromBufferAttribute(p,i).applyMatrix4(headFrame);
  if(local.y>.10)yTop=Math.max(yTop,local.y);
  if(Math.abs(local.x)<.014&&local.z<-.165&&local.y>.15)frontYs.push(local.y);
  if(Math.abs(local.x)<.014&&local.z>.078&&local.y>.10)rearYs.push(local.y);
  if(Math.abs(local.x)<.014&&local.y>.17&&local.y<.197)frontLip=Math.min(frontLip,local.z);
}
assert.ok(yTop>.276&&yTop<.295,'Crown encloses the full-size authored skull');
assert.ok(Math.min(...frontYs)>.17&&Math.min(...rearYs)<.15,'Rear skirt below brow; eyes remain exposed');
assert.ok(frontLip<-.205,'Rolled rim projects markedly beyond the forehead');
// A lens painted onto the dome, or an earpiece hidden by the head turn,
// would still pass the bounding box above. Check true front-face visibility
// from the retained R26 photo and from the normal river chase heading.
const previewCrew=new T.Mesh(g,new T.MeshBasicMaterial());
const sightlines=[new T.Vector3(.83,.73,.53).divideScalar(.72),new T.Vector3(3.17,2.34,4.15).divideScalar(.72)];
for(const eye of sightlines)for(const feature of ['receiver1','goggle1']) {
  const [first,last]=g.userData.landmarks[feature];
  const visible=[], depth=[];
  for(let i=first;i<last;i+=2){
    const pt=new T.Vector3().fromBufferAttribute(p,i),direction=pt.clone().sub(eye);
    const hit=new T.Raycaster(eye,direction.clone().normalize(),0,direction.length()+.002).intersectObject(previewCrew)[0];
    if(hit&&[hit.face.a,hit.face.b,hit.face.c].every(k=>k>=first&&k<last)&&Math.abs(hit.distance-direction.length())<.002)
      visible.push(pt);
    depth.push(pt.applyMatrix4(headFrame).x);
  }
  assert.ok(visible.length>=8,feature+' must face the existing camera, not disappear behind the dome: '+visible.length);
  assert.ok(Math.max(...depth)-Math.min(...depth)>.038,feature+' must be modeled relief');
}
for(const eye of sightlines) {
  const rayTo=xyz=>new T.Raycaster(eye,new T.Vector3(...xyz).sub(eye).normalize()).intersectObject(previewCrew)[0];
  for(const gap of [[.38,.24,-.07],[.35,.26,-.091],[.32,.26,-.13]])
    assert.equal(rayTo(gap),undefined,'A real open interval must separate near arm and chest');
  for(const edge of [[.33,.26,-.05],[.43,.19,-.11]])
    assert.ok(rayTo(edge)?.face.a>=armsStart,'Near sleeve and forearm must bound the negative space');
}
previewCrew.material.dispose();
const tank=await readFile(asset('../src/components/Scene/Tank.tsx'),'utf8');
assert.match(tank,/ref=\{gunnerRef\} name="tank-crew-station" position=\{\[0\.18, 0\.36, 0\.33\]\}/);
assert.match(tank,/scale=\{INFANTRY_WORLD_SCALE\}><TankCrewPortrait/);
const face=await readFile(asset('../src/components/Scene/TankCrewPortrait.tsx'),'utf8');
assert.match(face,/useLoader\(GLTFLoader, AUTHORED_HEAD_PATH\)/);
assert.match(face,/Suspense fallback=\{backup\}/);
assert.match(face,/FaceBoundary/);
// Headless mount of the production adapter, with a controlled asynchronous
// loader. The separate check-authored-head test validates the actual CC0 mesh
// and PNG bytes; here the important behavior is ownership and fallbacks.
async function productionModule(path) {
  const result=await build({configFile:false,logLevel:'silent',publicDir:false,esbuild:{jsx:'automatic'},
    build:{ssr:fileURLToPath(asset(path)),write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
  const code=result.output.find(piece=>piece.type==='chunk'&&piece.isEntry).code
    .replace(/from "([^"]+)"/g,(_match,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const station=await productionModule('../src/components/Scene/tankCrewStation.ts');
const cover=station.createCrewStationShroud(),base=station.createCrewStationPost(),rim=station.createCrewHatch();
const dimensions=cover.boundingBox.getSize(new T.Vector3());
assert.ok(dimensions.x<.20&&dimensions.y<.19,'Cover plus canvas bag must remain slim next to human arms');
const compact=cover.attributes.position, pigment=cover.attributes.color;
let gunmetal=0,khaki=0;
for(let i=0;i<compact.count;i++) {
  if(pigment.getX(i)<pigment.getY(i)&&compact.getY(i)>.065)gunmetal++;
  if(pigment.getX(i)>pigment.getZ(i)*1.35&&compact.getY(i)<.045)khaki++;
}
assert.ok(gunmetal>50&&khaki>50,'Painted metal exterior must differ from canvas stowage');
// Ray to the outer knuckles/palm pads in the actual two review views. This
// catches reintroducing the giant side box even if the grips still coincide.
const previewMat=new T.MeshBasicMaterial({side:T.DoubleSide});
const externals=[cover,base].map(g=>{
  const m=new T.Mesh(g,previewMat);m.position.copy(turret).sub(seat);m.updateMatrixWorld(true);return m;
});
const handVisibility=[];
for(const [i,grip] of CREW_GRIPS.entries()) {
  const sign=i?1:-1; let best=0;
  for(const eye of [new T.Vector3(.45,.61,-.86),new T.Vector3(-.75,.65,-.52)]) {
    let seen=0;
    for(const pad of [[.048,.015,.017],[.048,-.015,.026],[.032,.025,-.030],[.025,-.017,-.029],[-.008,.029,.026]]) {
      const target=new T.Vector3(...grip).add(new T.Vector3(sign*pad[0],pad[1],pad[2])).multiplyScalar(.72);
      const direction=target.clone().sub(eye), distance=direction.length();
      const ray=new T.Raycaster(eye,direction.normalize(),0,distance-.002);
      if(!ray.intersectObjects(externals).length)seen++;
    }
    best=Math.max(best,seen);
  }
  handVisibility.push(best);
}
assert.ok(handVisibility.every(k=>k>=3),'Each hand must have a readable view past the actual shroud: '+handVisibility);
for(const part of [cover,base,rim]) {
  assert.ok(part.attributes.normal.array.every(Number.isFinite));part.dispose();
}
previewMat.dispose();
const {TankCrewPortrait}=await productionModule('../src/components/Scene/TankCrewPortrait.tsx');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
extend({Group:T.Group,Mesh:T.Mesh});
const scene=new T.Scene(), state={scene,invalidate(){},internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map()}};
const store={getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}};
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
let caught=0,resolve,reject;
const fail=error=>{throw error;};
const root=reconciler.createContainer(store,1,null,false,null,'',fail,()=>caught++,fail,null);
const render=element=>act(async()=>reconciler.updateContainer(React.createElement(context.Provider,{value:store},element),root,null,null));
const headUrl='/models/us-infantry-head/us-male-head.gltf',originalLoad=GLTFLoader.prototype.load;
const fixture=new T.Group(),sourceHead=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({map:new T.Texture()}));
sourceHead.name='head-near';fixture.add(sourceHead);
GLTFLoader.prototype.load=(url,success,_progress,failure)=>{assert.equal(url,headUrl);resolve=success;reject=failure;};
try {
  await render(React.createElement(TankCrewPortrait));
  const kit=scene.getObjectByName('tank-crew-garments-and-kit');
  assert.ok(kit&&scene.getObjectByName('tank-crew-fallback-face'));
  await act(async()=>resolve({scene:fixture}));
  const faceMesh=scene.getObjectByName('tank-crew-authored-face');
  assert.equal(faceMesh.geometry,sourceHead.geometry);
  assert.equal(faceMesh.material.map,sourceHead.material.map);
  assert.notEqual(faceMesh.material,sourceHead.material);assert.equal(scene.getObjectByName('tank-crew-fallback-face'),undefined);
  assert.equal(kit,scene.getObjectByName('tank-crew-garments-and-kit'));
  const makeShader=()=>({uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader});
  const skinShader=makeShader(),kitShader=makeShader();
  faceMesh.material.onBeforeCompile(skinShader,null);kit.material.onBeforeCompile(kitShader,null);
  assert.match(skinShader.fragmentShader,/fieldCutPortrait\(diffuseColor.rgb,vCrewFace\)/);
  const pigment=skinShader.uniforms.fieldPortraitInks.value;
  assert.equal(pigment.image.width,96);assert.equal(pigment.image.height,96);
  assert.equal(pigment.magFilter,T.NearestFilter);assert.ok(pigment.generateMipmaps);
  // Sample a few real ink features on the source head from bind-space mm:
  // nose highlight, cheek return, strong brow, lower lip, quiet forehead.
  const at=(x,y,k)=>pigment.image.data[4*(Math.floor((y-8)/2)*96+Math.floor((x+96)/2))+k];
  assert.ok(at(1,106,1)>185&&at(52,102,0)>158&&at(32,157,2)>171&&at(1,65,3)>155);
  for(let channel=0;channel<4;channel++)assert.equal(at(0,180,channel),0);
  assert.match(kitShader.fragmentShader,/roughnessFactor=vCrewSurface/);
  assert.match(kitShader.fragmentShader,/directionalLights\[0\]\.direction/);
  assert.match(kitShader.fragmentShader,/fieldLightGroup\(vNormal\)/);
  assert.match(kitShader.fragmentShader,/fieldWornDye\(basin,field,crown/);
  const groupIds=new Set();
  for(let i=0;i<g.attributes.crewDetail.count;i++)groupIds.add(g.attributes.crewDetail.getX(i));
  for(const group of [11,13,15,17,19,21])assert(groupIds.has(group),'Worn dye must have a real mesh region: '+group);
  const handles=station.createCrewGrip(); const hd=handles.boundingBox.getSize(new T.Vector3());
  assert.ok(hd.y>.088&&hd.y<.092&&hd.x>.049&&hd.x<.053);
  const ferrule=[],wood=[],v=new T.Vector3(),rgb=new T.Color();
  for(let i=0;i<handles.attributes.position.count;i++){
    v.fromBufferAttribute(handles.attributes.position,i);rgb.fromBufferAttribute(handles.attributes.color,i);
    if(v.y>.038)ferrule.push(rgb.g/rgb.r);else if(Math.abs(v.y)<.034)wood.push(rgb.g/rgb.r);
  }
  assert.ok(Math.min(...wood)<.65&&Math.max(...ferrule)>1.0);
  // Visible triangles from the real gunner-control camera: never credit a
  // painted thumbnail buried in a handle or a swatch on the back of a palm.
  const ray=new T.Raycaster(),mat=new T.MeshBasicMaterial(),gm=new T.Mesh(g,mat),obstacles=[gm];
  for(const grip of CREW_GRIPS){const h=new T.Mesh(handles,mat);h.position.fromArray(grip);h.scale.setScalar(1/.72);h.updateMatrixWorld();obstacles.push(h);}
  const eye=new T.Vector3(.28+.25,.202+.105,-.192-.14).divideScalar(.72),detail=g.attributes.crewDetail,
    brush=kitShader.uniforms.fieldHandInk.value.image.data,vis=[0,0,0,0],point=new T.Vector3(),d=new T.Vector3(),tmp=new T.Vector3();
  const sat=n=>Math.max(0,Math.min(1,n));
  for(let i=0;i<g.index.count;i+=3){
    const ids=[0,1,2].map(s=>g.index.getX(i+s)),s=detail.getX(ids[0]);
    if(!(s>=1&&s<=2||s>=7&&s<=8))continue;
    for(const coef of [[.33,.34,.33],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){
      point.set(0,0,0);d.set(0,0,0);
      for(let j=0;j<3;j++){point.addScaledVector(tmp.fromBufferAttribute(p,ids[j]),coef[j]);
        d.addScaledVector(tmp.fromBufferAttribute(detail,ids[j]),coef[j]);}
      ray.set(eye,tmp.copy(point).sub(eye).normalize());ray.far=eye.distanceTo(point)+.0002;
      const first=ray.intersectObjects(obstacles,false)[0];
      if(first?.object!==gm||first.faceIndex!==i/3)continue;
      const digit=s<3,tx=digit?d.x-1:.5+.5*d.z,ty=digit?.52+.45*d.y+.13*d.z:d.x-7;
      const q=(Math.floor(31*sat(ty)+.5)*64+(digit?32:0)+Math.floor(31*sat(tx)+.5))*4;
      for(let k=0;k<4;k++)if(brush[q+k]>98)vis[k]++;
    }
  }
  assert.ok(vis.every(n=>n>1));console.log('Gunner-control: unoccluded triangle samples with shadow, crease, knuckle and nail:',vis);
  handles.dispose();mat.dispose();
  let disposed=0,sharedDisposed=0;
  faceMesh.material.addEventListener('dispose',()=>disposed++);
  sourceHead.material.map.addEventListener('dispose',()=>sharedDisposed++);
  await render(null);assert.equal(disposed,1);assert.equal(sharedDisposed,0);
  useLoader.clear(GLTFLoader,headUrl);
  await render(React.createElement(TankCrewPortrait));
  await act(async()=>reject(new Error('Intentional optional asset failure')));
  assert.ok(caught>0&&scene.getObjectByName('tank-crew-garments-and-kit')&&scene.getObjectByName('tank-crew-fallback-face'));
} finally {
  await render(null);GLTFLoader.prototype.load=originalLoad;useLoader.clear(GLTFLoader,headUrl);
  sourceHead.geometry.dispose();sourceHead.material.map.dispose();sourceHead.material.dispose();
}
console.log(`Tank crew: ${g.index.count/3} indexed triangles, one kit draw; both hand contacts, helmet/eye clearance, seat frame, shared face, load failure fallback and cleanup pass.`);
g.dispose();
