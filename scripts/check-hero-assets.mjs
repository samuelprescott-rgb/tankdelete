import assert from 'node:assert/strict';
import {checkCompoundBow} from './tank-bow-probes.mjs';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const source=await readFile(new URL('../src/components/Scene/tankGeometry.ts',import.meta.url),'utf8');
let {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
for(const match of [...outputText.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
  outputText=outputText.replace(match[0],`from '${import.meta.resolve(match[2])}'`);
}
const model=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
// Check the authored nose texture on its native grid: two separate pupils,
// negative space, and opaque tooth enamel, not a global color-grade effect.
const inkSource=await readFile(new URL('../src/components/Scene/ghostVehicleInk.ts',import.meta.url),'utf8');
const inkJS=ts.transpileModule(inkSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
  .replace(/from (['"])three\1/, 'from '+JSON.stringify(import.meta.resolve('three')));
const ink=await import(`data:text/javascript;base64,${Buffer.from(inkJS).toString('base64')}`);
const shark=ink.createVehicleInk('shark'),{data,width,height}=shark.image;
assert.deepEqual([width,height,shark.magFilter,shark.generateMipmaps],[128,64,THREE.NearestFilter,true]);
const color=(x,y)=>[...data.slice(4*(y*width+x),4*(y*width+x)+4)];
for(const x of [31,96])assert.deepEqual(color(x,50),[32,47,50,255],'Inset pupil must remain dark in both eyes');
for(const x of [26,101])assert.deepEqual(color(x,51),[223,171,87,255],'Both eyes retain amber enamel');
assert.equal(color(63,61)[3],0,'Forehead and original vehicle armor show through the livery');
assert.deepEqual(color(35,34),[231,222,182,255],'Upper fang is ivory');
shark.dispose();
for(const kind of ['sideJaw','cheek','skirtSteel']){
  const tex=ink.createVehicleInk(kind),bytes=tex.image.data;
  const tally=new Map();
  for(let i=0;i<bytes.length;i+=4){
    if(bytes[i+3]!==255)continue;
    const k=(bytes[i]<<16)|(bytes[i+1]<<8)|bytes[i+2];tally.set(k,(tally.get(k)??0)+1);
  }
  assert.equal(tex.magFilter,THREE.NearestFilter);
  assert.equal(tex.colorSpace,THREE.SRGBColorSpace);
  if(kind==='sideJaw'){
    assert.ok(tex.image.width===256&&tally.get(0xfff0cb)+tally.get(0xcbbb8b)>1200&&tally.get(0x842a32)>1000&&tally.get(0xbb3935)>550,'Ivory tooth faces AND lower edges, dark throat and real red gum on the curved cheeks');
    assert.ok(tally.get(0xec4938)>24&&tally.get(0x1c2425)>250,'Fixed hull face carries its eye above the gum and under the dark brow');
    const rgba=(x,y)=>Array.from(bytes.subarray((y*256+x)*4,(y*256+x)*4+4));
    for(const y of [20,30,39]){
      assert.deepEqual(rgba(127,y),rgba(128,y),'Throat/color continues through the port fold');
      assert.deepEqual(rgba(127,y),rgba(255,y),'Throat/color continues through the starboard fold');
    }
  }else if(kind==='cheek'){
    assert.ok(!tally.get(0xec4938)&&!tally.get(0xfff0cb),'Rotating turret cannot carry a second pair of eyes');
  }else{
    assert.ok(tally.get(0xad6340)>160&&tally.get(0x80774e)>1700,'Oxide stays in localized islands on olive sheet stock');
    assert.equal(tex.image.width,512,'The hull return needs its own port and starboard paint charts');
    const colors=new Set();let distinctSides=0;
    for(let y=0;y<64;y++)for(let x=0;x<128;x++){
      const i=(y*512+256+x)*4,j=i+128*4;
      if(bytes[i]!==bytes[j]||bytes[i+1]!==bytes[j+1]||bytes[i+2]!==bytes[j+2])distinctSides++;
      for(const at of [i,j]){
        colors.add((bytes[at]<<16)|(bytes[at+1]<<8)|bytes[at+2]);
        assert.ok(bytes[at]-bytes[at+1]<27,'No orange/red angular stamp on the steel crown');
      }
    }
    assert.ok(colors.size>95&&distinctSides>2000,'Two independently weathered olive crowns, not a flat fill');
  }
  tex.dispose();
}
const guards=model.createTankSignalGuards();
const jawStudy=ink.createVehicleInk('sideJaw'),fixedJaw=new THREE.Mesh(guards.jaw,new THREE.MeshBasicMaterial({map:jawStudy}));
checkCompoundBow(fixedJaw);jawStudy.dispose();fixedJaw.material.dispose();
assert.ok(guards.jaw.boundingBox.max.z<.04&&guards.jaw.boundingBox.min.z<-1,'Jaws only above the forward tracks; no eyes on the tail');
const guardP=guards.guard.attributes.position;
const guardUV=guards.guard.attributes.uv,field=[0,0];
for(let i=0;i<guardP.count;i++){
  if(guardP.getZ(i)>-.29||guardP.getY(i)<.48)continue;
  const tile=Math.floor(guardUV.getX(i)*4);
  if(tile===2||tile===3)field[tile-2]++;
}
assert.ok(field.every(n=>n>45),'Dedicated rub paintings must be mounted on the two actual upper cast returns');
assert.ok(Array.from({length:guardP.count},(_,i)=>i).every(i=>Math.abs(guardP.getX(i))<.84||guardP.getZ(i)<-.94||guardP.getY(i)>.26),'Outer returns above the road wheels clear suspension; the front lip curls outside the idler');
assert.ok(Object.values(guards).reduce((sum,g)=>sum+g.attributes.position.count/3,0)<450,'Two material batches for both jaws, joined front, oxide tool panels, rear flaps and their returns');
for(const g of Object.values(guards)){
  assert.ok(g.attributes.normal.array.every(Number.isFinite));
  g.dispose();
}
let total=0;
for(const name of ['createTankHullGeometry','createTankTurretGeometry','createTrackBeltGeometry','createTankHardwareGeometry','createTankHullFittingsGeometry','createTankTurretFittingsGeometry','createTankCanvasGeometry']) {
  const geometry=model[name]();
  for(const attr of ['position','normal','uv']) {
    const data=geometry.getAttribute(attr);
    assert.ok(data?.array.every(Number.isFinite),`${name}: missing/invalid ${attr}`);
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.x>0&&size.y>0&&size.z>0&&size.length()<4,`${name}: wrong tank-scale bounds`);
  const triangles=(geometry.index?.count??geometry.getAttribute('position').count)/3;
  total+=triangles;
  assert.ok(triangles<5000,`${name}: excess geometry ${triangles}`);
  geometry.dispose();
}
assert.ok(total<18000,`Tank shared hardware budget exceeded ${total}`);
// The artist's eye centres and teeth on either side of the casting ridge
// must land on real forward-facing armor, not the turret, deck, or a card.
const hullForPaint=new THREE.Mesh(model.createTankHullGeometry());
const cast=new THREE.Raycaster(), towardNose=new THREE.Vector3(0,0,1);
for(const [u,v] of [[270,55],[755,54],[510,125],[514,274],[160,112],[862,98]]) {
  const point=new THREE.Vector3((u/1024-.5)*1.30,(1-v/384)*.409-.18,-2);
  cast.set(point,towardNose);
  const hit=cast.intersectObject(hullForPaint)[0];
  assert.ok(hit&&hit.point.z<-.8&&hit.face.normal.z<-.50,`Shark pigment ${u},${v} misses forward armor`);
}
hullForPaint.geometry.dispose(); hullForPaint.material.dispose();
const rearStencil=model.createTankStencilGeometry();
assert.ok(rearStencil.boundingBox.min.z>0,'Original rear star remains, with no overlapping bow star');
rearStencil.dispose();
const surfaceSrc=await readFile(new URL('../src/components/Scene/tankSurface.ts',import.meta.url),'utf8');
const surfaceJS=ts.transpileModule(surfaceSrc,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {applyTankSurface}=await import(`data:text/javascript;base64,${Buffer.from(surfaceJS).toString('base64')}`);
const enamel=new THREE.Texture();
for(const type of ['casting','turret','track']) {
  const mat=applyTankSurface(new THREE.MeshStandardMaterial(),type,enamel);
  const shader={ uniforms:{},fragmentShader:THREE.ShaderLib.standard.fragmentShader,vertexShader:THREE.ShaderLib.standard.vertexShader };
  mat.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uTankBowPaint?.value,type==='casting'?enamel:undefined,'Only hull casting samples shark paint');
  if(type==='casting') {
    const paint=shader.fragmentShader.indexOf('textureGrad(uTankBowPaint,cell,dFdx(bowUV),dFdy(bowUV))');
    assert.ok(paint>=0&&paint<shader.fragmentShader.indexOf('clamp(settledDust'),'Bow paint must weather under the existing silt');
  }
  mat.dispose();
}
enamel.dispose();
const bowSVG=await readFile(new URL('../public/images/textures/tank-shark-bow-v1.svg',import.meta.url),'utf8');
assert.match(bowSVG, /viewBox="0 0 1024 384"/);
assert.doesNotMatch(bowSVG, /<(?:image|script|foreignObject)\b/);
assert.ok(Buffer.byteLength(bowSVG)<12*1024,'Shark paint must stay a small local asset');
assert.equal(model.TANK_ROAD_WHEEL_CENTERS.length,6,'M48 running gear has six road-wheel pairs, not seven');
assert.deepEqual([...model.TANK_ROAD_WHEEL_CENTERS].reverse().map(value=>-value),[...model.TANK_ROAD_WHEEL_CENTERS],
  'Road wheels must remain symmetric within the existing hull frame');
for(let wheel=1;wheel<model.TANK_ROAD_WHEEL_CENTERS.length;wheel++) {
  const separation=(model.TANK_ROAD_WHEEL_CENTERS[wheel]-model.TANK_ROAD_WHEEL_CENTERS[wheel-1])*1.35;
  assert.ok(separation>model.TANK_ROAD_WHEEL_RADIUS*2,'Road wheels must not overlap in the actual stretched hull');
}
for(const sprocket of [false,true]) {
  const geometry=model.createTankEndWheelGeometry(sprocket);
  assert.ok(geometry.getAttribute('position').array.every(Number.isFinite));
  assert.ok(geometry.getAttribute('normal').array.every(Number.isFinite));
  assert.ok(geometry.getAttribute('uv').array.every(Number.isFinite));
  assert.ok((geometry.index?.count??geometry.getAttribute('position').count)/3<350,'Distinct end wheels stay inexpensive');
  assert.ok(geometry.boundingBox.max.y<.19&&geometry.boundingBox.max.z<.19,'End wheels stay inside the existing track loop');
  geometry.dispose();
}
// Inspect actual surface intersections, not just one bounding box per object.
// A stack of filled cylinders should fail the recessed-dish and glass tests.
const sample = (mesh, start, direction) => {
  cast.set(new THREE.Vector3(...start), new THREE.Vector3(...direction));
  const hit=cast.intersectObject(mesh)[0];
  assert.ok(hit,'Expected a front-facing authored surface at '+JSON.stringify(start));
  return hit.point;
};
const wheelMesh=new THREE.Mesh(model.createTankRoadWheelGeometry());
for(const side of [-1,1]){
  const faceAt=r=>Math.abs(sample(wheelMesh,[side,r,0],[-side,0,0]).x);
  assert.ok(faceAt(.114)-faceAt(.087)>.020,'Road-wheel dish cuts behind the rolled rim');
  assert.ok(faceAt(.006)-faceAt(.087)>.028,'Centre grease cover stands proud of the recessed web');
}
wheelMesh.geometry.dispose();wheelMesh.material.dispose();
const lampMesh=new THREE.Mesh(model.createTankHeadlampsGeometry());
for(const cx of [-.445,.445]){
  const lensHit=sample(lampMesh,[cx,.47,-2],[0,0,1]);
  const rimHit=sample(lampMesh,[cx+.059,.47,-2],[0,0,1]);
  assert.ok(lensHit.z>rimHit.z+.004,'Headlamp retainer must sit in front of actual glass');
}
lampMesh.geometry.dispose();lampMesh.material.dispose();
const shoeMesh=new THREE.Mesh(model.createTankTrackShoeGeometry());
const padTop=sample(shoeMesh,[0,1,0],[0,-1,0]).y;
const linkTop=sample(shoeMesh,[.114,1,0],[0,-1,0]).y;
assert.ok(padTop-linkTop>.012,'Rubber contact pad stands clear of the smaller cast end link');
assert.ok(shoeMesh.geometry.getAttribute('position').count/3<=110,'Repeated shoes stay inside the per-instance budget');
const fieldFloor=-.070;
const bottomShoe=model.trackPadPose(model.TRACK_LOOP_LENGTH/2).y+model.TANK_TRACK_AXLE_Y;
assert.ok(Math.abs(bottomShoe-padTop-fieldFloor)<.001,'Bottom contact pads touch the gameplay terrain instead of disappearing below it');
const insideShoe=sample(shoeMesh,[.097,-1,0],[0,1,0]).y;
assert.ok(bottomShoe-insideShoe>fieldFloor+.029,'Lower run has a closed inboard face visible above ground');
assert.ok(model.TANK_ROAD_WHEEL_Y-model.TANK_ROAD_WHEEL_RADIUS>bottomShoe,
  'Road wheels sit on the lower links, not directly on the terrain');
shoeMesh.geometry.dispose();shoeMesh.material.dispose();
const runningGearSource=await readFile(new URL('../src/components/Scene/TankPresentation.tsx',import.meta.url),'utf8');
assert.match(runningGearSource,/const ROAD_WHEEL_CENTERS=TANK_ROAD_WHEEL_CENTERS/);
// Axle orientation and counter-stretch are asserted on mounted rotating
// instances in check-tank-drive-scene.mjs, not by matching loop syntax.
assert.match(runningGearSource,/mesh\.setMatrixAt\(side,assets\.transform\.matrix\.premultiply\(assets\.undoLengthScale\)\)/,
  'End-wheel rotation must cancel the parent stretch before rotation');
assert.equal(model.cannonRecoilPosition(0),-.61,'Cannon must remain seated in its mantlet at rest');
assert.ok(Math.abs(model.cannonRecoilPosition(1)+.45)<1e-10,'Cannon recoil must retract from its authored mount');
assert.equal(model.cannonRecoilPosition(-1),-.61,'Recoil cannot extend through the muzzle');
const footprintSource=await readFile(new URL('../src/lib/tankFootprint.ts',import.meta.url),'utf8');
const footprintJS=ts.transpileModule(footprintSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const footprint=await import(`data:text/javascript;base64,${Buffer.from(footprintJS).toString('base64')}`);
const probes=[];
assert.equal(footprint.tankFootprintBlocked(0,0,0,(x,z,r)=>{probes.push([x,z,r]);return false;}),false);
assert.equal(probes.length,3,'Whole tracked hull needs front, middle and rear clearance');
assert.ok(probes.some(([x,z])=>Math.abs(x)<1e-9&&z>.6),'Fore/aft clearance follows tank heading');
assert.equal(footprint.tankFootprintBlocked(0,0,0,(_x,z)=>z>.6),true,'Front hull cannot enter a hill');
assert.equal(footprint.tankFootprintBlocked(0,0,Math.PI/2,(x)=>x>.6),true,'Rotated hull cannot sweep through a hill');
assert.equal(footprint.tankFootprintBlocked(0,0,0,(x)=>x>.6),false,'Clear turns remain possible');
for(let index=-200;index<200;index++) {
  const distance=index*.034;
  const pose=model.trackPadPose(distance),again=model.trackPadPose(distance+model.TRACK_LOOP_LENGTH);
  assert.ok(Object.values(pose).every(Number.isFinite),'Track pose cannot become non-finite');
  assert.ok(Math.abs(pose.y)<=.221&&Math.abs(pose.z)<=1.081,'Shoes must follow the belt');
  assert.ok(Math.hypot(pose.y-again.y,pose.z-again.z)<1e-10,'Track wrap must be continuous');
}
for(const lengthScale of [1,1.35]) {
  const loop=model.trackLoopLength(lengthScale);
  for(let i=-50;i<100;i++) {
    const pose=model.trackPadPose(i*.047,lengthScale);
    const wrapped=model.trackPadPose(i*.047+loop,lengthScale);
    assert.ok(Math.abs(pose.z)<=.86*lengthScale+.22001,'Track bounds lengthen only the straight runs');
    assert.ok(Math.abs(pose.y)<=.22001,'Track end radius must stay circular');
    assert.ok(Math.hypot(pose.y-wrapped.y,pose.z-wrapped.z)<1e-10,'Long-track wrap remains continuous');
  }
  for(const angle of [0,Math.PI/4,Math.PI/2]) {
    const matrix=new THREE.Matrix4().makeScale(1,1,lengthScale)
      .multiply(new THREE.Matrix4().makeScale(1,1,1/lengthScale))
      .multiply(new THREE.Matrix4().makeTranslation(0,.105,.76*lengthScale))
      .multiply(new THREE.Matrix4().makeRotationX(angle));
    const y=new THREE.Vector3().setFromMatrixColumn(matrix,1),z=new THREE.Vector3().setFromMatrixColumn(matrix,2);
    assert.ok(Math.abs(y.length()-1)<1e-10&&Math.abs(z.length()-1)<1e-10,'Road wheels cannot become oval while rotating');
    assert.ok(Math.abs(y.dot(z))<1e-10,'Wheel frame cannot shear');
  }
}
for(const name of ['jungle-ground-v1.png','vietnam-monsoon-panorama-v1.png','jungle-bark-v1.png','tank-armor-v1.png','jungle-branch-spray-v1.png','jungle-grass-clump-v1.png']) {
  const bytes=await readFile(new URL(`../public/images/textures/${name}`,import.meta.url));
  assert.equal(bytes.subarray(1,4).toString(),'PNG',`${name}: must import as PNG`);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  assert.ok(width<=2048&&height<=2048&&width>=512&&height>=512,`${name}: bounded texture resolution`);
  assert.ok(bytes.length<6*1024*1024,`${name}: texture download budget`);
  if(name.includes('branch')||name.includes('clump')) assert.equal(bytes[25],6,'Foliage needs real RGBA alpha, not a painted background');
}
console.log(`Hero asset checks passed: ${total} shared tank triangles, finite geometry, seated cannon recoil, periodic track shoes, six bounded PNG assets and true foliage alpha.`);
