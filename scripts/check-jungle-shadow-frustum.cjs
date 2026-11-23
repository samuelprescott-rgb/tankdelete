// Real seeded production near-tree matrices/geometry, real Three shadow camera
// and a memory-backed WebGL attribute uploader. Measures triangles/bytes, not ms.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const T=require('three'),ts=require('typescript'), base=path.resolve(__dirname,'..');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>{
  let s=fs.readFileSync(f,'utf8').replaceAll('import.meta.env.DEV','false');
  s=s.replace(/import (\w+) from '([^']+)\?url';/g,(_match,name,asset)=>{
    const resolved=require.resolve(path.resolve(path.dirname(f),asset));
    return 'const '+name+'='+JSON.stringify(resolved)+';';
  });
  if(f.endsWith('/VietnamEnvironment.tsx'))s+='\nexport {distanceToRoad,isInsideDefenseClearing,isInsideObjectiveClearing};';
  m._compile(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);
};
const load=s=>require(base+'/src/components/Scene/'+s);
const env=load('VietnamEnvironment.tsx'),{createDenseJunglePlacements}=load('DenseJungle.tsx'),g=load('jungleGeometry.ts');
const {createStaticInstanceFrustum}=load('staticInstanceFrustum.ts'),{attachJungleCaster,JUNGLE_KEY_LIGHT}=load('jungleShadowFrustum.ts');
const {WebGLAttributes}=require(base+'/node_modules/three/src/renderers/webgl/WebGLAttributes.js');
const hash=require(base+'/src/lib/combat.ts').hashCombatSession;
const {TRAINING_DIRECTORY}=require(base+'/src/lib/training.ts'),{CAMPAIGN_ROOT,CAMPAIGN_FINALE}=require(base+'/src/lib/campaignFixtures.ts');
const {EMBASSY_GUARD_POSITION,EMBASSY_GUARD_YAW}=require(base+'/src/lib/embassyDefense.ts');
const route=[...Array(360).keys()];
for(const [night,directory,startX,startZ,startYaw] of [[false,TRAINING_DIRECTORY,0,-12,Math.PI],[true,TRAINING_DIRECTORY,0,-12,Math.PI],
  [false,CAMPAIGN_ROOT,0,2.5,Math.PI],[true,CAMPAIGN_FINALE,EMBASSY_GUARD_POSITION[0],EMBASSY_GUARD_POSITION[2],EMBASSY_GUARD_YAW]]){
 const seed=hash(directory);
 const trees=createDenseJunglePlacements({seed,distanceToRoad:env.distanceToRoad,isInsidePaddy:env.isInsidePaddy,
   isInsideObjectiveClearing:night?env.isInsideDefenseClearing:env.isInsideObjectiveClearing});
 const scene=new T.Scene(),parent=new T.Group(),light=new T.DirectionalLight(),lightRig=new T.Group(); scene.add(parent,lightRig);lightRig.add(light,light.target);
 light.name=JUNGLE_KEY_LIGHT;light.castShadow=true;Object.assign(light.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:115});
 light.shadow.camera.updateProjectionMatrix();
 const camera=new T.PerspectiveCamera(60,16/9,.1,340),inspect=new T.OrthographicCamera(-16,16,9,-9,.1,340);
 const renderer={xr:{isPresenting:false},shadowMap:{enabled:true,type:T.PCFShadowMap,autoUpdate:true}};
 const dummy=new T.Object3D(),col=new T.Color(),m=new T.Matrix4(),center=new T.Vector3(),extents=new T.Vector3(),matrix=new T.Matrix4();
 let buffer,bytes=0,peak=0,changed=0,total=0,full=0,live=0,offCameraCasters=0;
 const attributes=WebGLAttributes({FLOAT:5126,createBuffer(){return{}},bindBuffer(t,b){buffer=b},bufferData(t,a){buffer.a=a.slice()},
   bufferSubData(t,off,src,start=0,len=src.length){buffer.a.set(src.subarray(start,start+len),off/4);bytes+=len*4;}});
 const before=scene.onBeforeRender;
 const batches=[[trees.nearTrunks,g.createJungleTrunkGeometry()],[trees.nearCrowns,g.createJungleCrownGeometry()]].map(([rows,geom])=>{
   const mesh=new T.InstancedMesh(geom,new T.MeshStandardMaterial(),rows.length);mesh.castShadow=true;parent.add(mesh);
   for(const [i,r] of rows.entries()){dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,r.rotation,0);dummy.scale.set(r.sx,r.sy,r.sz);
     dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,col.setRGB(r.tint*.98,r.tint,r.tint*.91));}
   mesh.computeBoundingBox();mesh.computeBoundingSphere();
   const mats=mesh.instanceMatrix.array.slice(),cols=mesh.instanceColor.array.slice(), originalCount=mesh.count;
   const idByX=new Map(rows.map((_,i)=>[mats[i*16+12]+','+mats[i*16+14],i]));
   assert.equal(idByX.size,rows.length);
   const ctrl=createStaticInstanceFrustum(mesh,'color-and-key-shadow');
   const detach=ctrl?attachJungleCaster(scene,ctrl):()=>{}, bounds=geom.boundingBox.clone();
   bounds.min.x-=.08;bounds.max.x+=.08;bounds.min.z-=.044;bounds.max.z+=.044;
   return {mesh,cols,mats,idByX,bounds,originalCount,optimized:!!ctrl,detach,tris:(geom.index?.count??geom.attributes.position.count)/3};
 });
 const frustum=cam=>new T.Frustum().setFromProjectionMatrix(matrix.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse),cam.coordinateSystem,cam.reversedDepth);
 function draw(cam,expectFull=false,omitUpload=false){
   scene.updateMatrixWorld();cam.updateMatrixWorld();scene.onBeforeRender(renderer,scene,cam,null);
   light.shadow.updateMatrices(light);const color=frustum(cam),shadow=light.shadow.getFrustum();
   for(const b of batches){
     const {mesh,cols,mats,idByX,bounds,originalCount}=b;
     if(expectFull){assert.equal(mesh.count,originalCount);assert.deepEqual(mesh.instanceMatrix.array,mats);assert.deepEqual(mesh.instanceColor.array,cols);}
     if(omitUpload)continue;
     attributes.update(mesh.instanceMatrix,34962);attributes.update(mesh.instanceColor,34962);
     const gpu=attributes.get(mesh.instanceMatrix).buffer.a,ink=attributes.get(mesh.instanceColor).buffer.a;
     const ids=new Set();let last=-1;
     for(let i=0;i<mesh.count;i++){const id=idByX.get(gpu[i*16+12]+','+gpu[i*16+14]);assert(id>last);last=id;ids.add(id);
       for(let j=0;j<16;j++)assert.equal(gpu[i*16+j],mats[id*16+j]);for(let j=0;j<3;j++)assert.equal(ink[i*3+j],cols[id*3+j]);}
     // Independent OBB-plane oracle: not the culler's cells, guards or AABBs.
     for(let i=0;i<originalCount;i++){
       m.fromArray(mats,i*16).premultiply(mesh.matrixWorld);const e=m.elements;
       bounds.getCenter(center).applyMatrix4(m);bounds.getSize(extents).multiplyScalar(.5);
       const hits=f=>!f.planes.some(p=>{const n=p.normal;
         return p.distanceToPoint(center)+Math.abs(n.x*e[0]+n.y*e[1]+n.z*e[2])*extents.x+
           Math.abs(n.x*e[4]+n.y*e[5]+n.z*e[6])*extents.y+Math.abs(n.x*e[8]+n.y*e[9]+n.z*e[10])*extents.z<0;});
       const a=hits(color),s=hits(shadow);if(a||s)assert(ids.has(i),'lost visible color or off-camera shadow caster '+i);if(s&&!a)offCameraCasters++;
     }
   }
 }
 light.position.set(...(night?[-16.60,25.88,-45.58]:[43.27,13.59,22.05]));const offset=light.position.clone();
 camera.position.set(0,4.2,-18.8);camera.lookAt(0,2.75,-12);draw(camera,true);
 light.shadow.map=new T.WebGLRenderTarget(2048,2048);light.shadow.map.depthTexture=new T.DepthTexture(2048,2048);light.shadow.map.depthTexture.compareFunction=T.LessEqualCompare;
 const forward=offset.clone().normalize(),right=new T.Vector3(0,1,0).cross(forward).normalize(),up=forward.clone().cross(right),subject=new T.Vector3();
 let tx=startX,tz=startZ,yaw=startYaw;
 camera.position.set(tx+6.8*Math.sin(yaw),4.2,tz+6.8*Math.cos(yaw));camera.lookAt(tx,2.75,tz);
 for(const frame of route){const turn=frame<90?0:frame<190?.65:frame<250?2.3:-.55,speed=frame<250?7.2:-4;
   tx-=Math.sin(yaw)*speed/60;tz-=Math.cos(yaw)*speed/60;yaw+=turn/60;subject.set(tx,0,tz);
   const texel=48/2048;light.target.position.copy(right).multiplyScalar(Math.round(subject.dot(right)/texel)*texel)
     .addScaledVector(up,Math.round(subject.dot(up)/texel)*texel).addScaledVector(forward,subject.dot(forward)); light.position.copy(light.target.position).add(offset);
   camera.position.lerp(new T.Vector3(tx+6.8*Math.sin(yaw),4.2,tz+6.8*Math.cos(yaw)),1-Math.exp(-6/60));camera.lookAt(tx,2.75,tz);
   bytes=0;draw(camera);peak=Math.max(peak,bytes);total+=bytes;if(bytes)changed++;
   for(const b of batches){const draws=Number(frustum(camera).intersectsObject(b.mesh))+Number(light.shadow.getFrustum().intersectsObject(b.mesh));
     full+=draws*b.originalCount*b.tris;live+=draws*b.mesh.count*b.tris;}
 }
 const saving=1-live/full;assert(saving>.18);assert(peak<=batches.reduce((n,b)=>n+b.originalCount*76,0));assert(offCameraCasters>100);
 bytes=0;draw(camera);draw(camera);assert.equal(bytes,0,'stationary projection must not transfer anything');
 // Camera-stationary shadow moves, camera replacement, parent motion, skipped
 // uploads and multiple light/renderer fallback must restore complete records.
 for(let i=0;i<24;i++){lightRig.position.set(i*3,0,-i);light.target.position.x+=2;
   inspect.position.set(-40+i,31,25);inspect.lookAt(4,0,17);parent.rotation.y+=.05;parent.scale.set(1.2,.95,1);draw(i%3?camera:inspect,false,i%4!==0);}
 draw(camera);
 const second=new T.PointLight();second.castShadow=true;scene.add(second);draw(camera,true);scene.remove(second);
 renderer.xr.isPresenting=true;draw(camera,true);renderer.xr.isPresenting=false;draw(camera);
 light.shadow.autoUpdate=false;draw(camera,true);
 light.userData.scheduledMoonShadow=true;draw(camera);
 delete light.userData.scheduledMoonShadow;light.shadow.autoUpdate=true;draw(camera);
 light.visible=false;draw(camera,true);light.visible=true;draw(camera);
 const stage=new T.Scene();const counts=batches.map(b=>b.mesh.count);stage.onBeforeRender(renderer,stage,inspect,null);assert.deepEqual(batches.map(b=>b.mesh.count),counts);
 for(const b of batches)b.detach();assert.equal(scene.onBeforeRender,before);
 console.log(JSON.stringify({scene:night?'embassy':'river',directory,seed,frames:route.length,cohorts:batches.map(b=>({instances:b.originalCount,trianglesPerInstance:b.tris,compaction:b.optimized})),baseline:full,submitted:live,savedPercent:+(saving*100).toFixed(2),uploadBytes:total,uploadFrames:changed,maxBytes:peak,offCameraCasterChecks:offCameraCasters}));
}
