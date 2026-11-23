// CPU-only replay. Three's real attribute uploader, render list and instanced
// draw dispatcher; only the GL calls go to a byte-accurate memory backend.
const fs=require('node:fs'), assert=require('node:assert/strict'), path=require('node:path'),project=process.cwd(), req=require('node:module').createRequire(project+'/package.json'), ts=req('typescript'),T=req('three');
const {createHash}=require('node:crypto'),digest=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const [route='drive',implementation='candidate',rice='bounded',out,defenseOffset='0']=process.argv.slice(2);
assert.ok(['drive','adversarial','embassy-turnout'].includes(route)&&['omit','full','compact','bounded'].includes(rice));
for (const ext of ['.ts','.tsx']) require.extensions[ext]=(m,f)=>{let s=fs.readFileSync(f,'utf8').replaceAll('import.meta.env.DEV','false');
  if(f.endsWith('/VietnamEnvironment.tsx')){
    s=require('./qa-rice-fixture.cjs').instrumentRiceFixture(s,f)+'\nexport {distanceToRoad,isInsideDefenseClearing,isInsidePaddy};';
  }
  m._compile(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,f)};
const load=s=>req('./src/components/Scene/'+s), web=s=>req(project+'/node_modules/three/src/renderers/webgl/'+s+'.js')[s];
const {createStaticInstanceFrustum:compact}=['candidate','previous-eligibility'].includes(implementation)?load('staticInstanceFrustum'):req(path.resolve(implementation)),{createDenseJunglePlacements}=load('DenseJungle'), {createForestPerimeterPlacements}=load('ForestPerimeter'), {selectAuthoredShrubPlacements}=load('AuthoredJunglePlants'),g=load('jungleGeometry'),env=load('VietnamEnvironment');
const {WebGLRenderList}=req(project+'/node_modules/three/src/renderers/webgl/WebGLRenderLists.js');
const seed=req('./src/lib/combat').hashCombatSession('/training/cleanup-sector-01'), j=createDenseJunglePlacements({seed,distanceToRoad:env.distanceToRoad,isInsidePaddy:env.isInsidePaddy,isInsideObjectiveClearing:env.isInsideDefenseClearing}), pr=createForestPerimeterPlacements(seed);
if(route==='embassy-turnout'){
 const {trackGrassHeight}=load('embassyServiceTrack');
 for(const k of ['ferns','broadleaf','bananas','shrubs'])j[k]=j[k].map(p=>{
  const h=trackGrassHeight(p.x,p.z);return h===1?p:{...p,sy:p.sy*h,sx:p.sx*(.5+.5*h),sz:p.sz*(.5+.5*h)};
 });
}
const defs=[
 ['mid',j.midCrowns,g.createJungleCrownGeometry('mid'),.055],
 ['far',j.farCrowns,g.createJungleCrownGeometry('far'),.055],
 ['vine',j.vines,g.createJungleVineGeometry(),.035],
 ['ferns',j.ferns,g.createJungleFernGeometry(),.035],
 ['bananas',j.bananas,g.createJungleBananaGeometry(),.035],
 ['broadleaf',j.broadleaf,g.createJungleBroadleafGeometry(),.035],
 ['trunks',j.farTrunks,g.createJungleTrunkGeometry(false,'far'),0],
 ['shrub',selectAuthoredShrubPlacements(j.shrubs).remaining,g.createJungleShrubGeometry(),.055],
 ['perim',pr.crowns.map(p=>({x:p.position[0],y:p.position[1],z:p.position[2],sx:p.scale[0],sy:p.scale[1],sz:p.scale[2],rotation:p.rotation,tint:p.tint})),g.createJungleCrownGeometry('far'),.055],
 ['casterNear',j.nearCrowns,g.createJungleCrownGeometry(),.055,true],
 ['casterTrunks',j.nearTrunks,g.createJungleTrunkGeometry(),0,true]
];
const dummy=new T.Object3D(),col=new T.Color(),mat=new T.Matrix4(),tr=new T.Vector3();
if(rice!=='omit'){const mesh=env.__rice(seed,Number(defenseOffset));defs.push(['rice',[],mesh.geometry,.035,false,mesh]);}
const batches=defs.map(([name,placements,geom,wind,cast,source])=>{
 const mesh=source??new T.InstancedMesh(geom,new T.MeshStandardMaterial(),placements.length);mesh.name=name;mesh.castShadow=!!cast;
 for(const [i,p] of placements.entries()){dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,col.setRGB(p.tint*(name==='perim'?.96:.98),p.tint,p.tint*(name==='perim'?.92:.91)))}
 mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.boundingSphere.radius+=name==='perim'?.2:.3;mesh.updateMatrixWorld();
 const jungle=implementation==='candidate'&&!cast&&!['rice','perim'].includes(name);
 const mats=mesh.instanceMatrix.array.slice(), colors=mesh.instanceColor.array.slice(), ctrl=name==='rice'&&rice==='full'?null:compact(mesh,name==='rice'&&rice==='bounded'?'bounded-tail':jungle?'static-jungle':'compact');
 if(cast)assert(!ctrl);
 const ids=new Map();const idKey=(m,i)=>`${m[i+12]},${m[i+13]},${m[i+14]},${m[i]}`;for(let i=0;i<mesh.count;i++){const k=idKey(mats,i*16);assert(!ids.has(k));ids.set(k,i);}
 const max=geom.boundingBox.clone();max.min.x-=wind;max.max.x+=wind;max.min.z-=wind*.55+.001;max.max.z+=wind*.55+.001;
 const cent=max.getCenter(new T.Vector3()),size=max.getSize(new T.Vector3()).multiplyScalar(.5);
 const obbs=Array.from({length:mesh.count},(_,i)=>{mat.fromArray(mats,i*16);const c=cent.clone().applyMatrix4(mat),e=mat.elements;
 return [c,...[0,1,2].map(k=>new T.Vector3(e[k*4],e[k*4+1],e[k*4+2]).multiplyScalar(size.getComponent(k)))]});
 return {name,mesh,geom,ctrl,mats,colors,ids,idKey,obbs,full:mesh.count,verts:geom.index?.count??geom.attributes.position.count};
});
const camera=new T.PerspectiveCamera(60,16/9,.1,340),clip=new T.Matrix4(),frust=new T.Frustum(),frames=[];
let curBuffer,transfers=0,transferMax=0,frameBytes=0,maxFrameDetails;const batchUploadTotals={},batchUploadMax={};
const gl={createBuffer(){return {}},bindBuffer(t,b){curBuffer=b},bufferData(t,a){curBuffer.a=a.slice()},bufferSubData(t,byteOff,src,off=0,len=src.length){frameBytes+=len*4;curBuffer.a.set(src.subarray(off,off+len),byteOff/4)},FLOAT:5126,TRIANGLES:4, ARRAY_BUFFER:34962};
const attributes=web('WebGLAttributes')(gl),draws=[],baseline=[],testLists=WebGLRenderList();
const rec=new (web('WebGLBufferRenderer'))({...gl,drawArraysInstanced:(mode,start,vertices,n)=>draws.push([vertices,n])},null,{update(){}});
rec.setMode(gl.TRIANGLES);
const sum=a=>a.reduce((x,[v,n])=>x+v*n/3,0);
let checked=0,retained=0,totalFull=0,totalLive=0,first,uploads=0,extraCalls=0;
let updateMs=0,maxUpdate=0,theta=Math.PI,tx=0,tz=-12,submissions=0,riceSubmissions=0;const offset=new T.Vector3(),poses=route==='drive'?600:300;
for(let frame=0;frame<poses;frame++) {
 if(route==='embassy-turnout'){
  const {EMBASSY_GUARD_POSITION:p,EMBASSY_GUARD_YAW:yaw}=req('./src/lib/embassyDefense');
  // Steady-state world camera reported by W6UiOK's real draw census. Target
  // is the normal embassy shoulder aim from CameraRig in the guard pose.
  camera.position.set(-20.453555645313937,3.8,-10.996294200116168);
  camera.lookAt(offset.set(1.12,2.75,-1.28).applyAxisAngle(tr.set(0,1,0),yaw).add(new T.Vector3(...p)));
 }else if(route==='adversarial'){const turn=frame<150?frame*.02:(frame%3===0?Math.PI:0)+frame*.087, x=frame===0?0:Math.sin(frame*.038)*35,y=4.2+Math.sin(frame*.13)*2,z=frame===0?-18.8:-18.8+Math.sin(frame*.07)*34;camera.fov=frame<180?60:[33,59,88][frame%3];camera.updateProjectionMatrix();
  camera.position.set(x,y,z);camera.lookAt(x+6.8*Math.sin(turn),y-1.45,z+6.8*Math.cos(turn));
 }else{
  // Ten seconds at 60 Hz: straight cruise, broad steering, hard turn,
  // reverse and return. Same 8 m/s / 2.5 rad/s limits and chase lerp as game.
  const turn=frame<120?0:frame<260?.55:frame<335?2.5:frame<440?-.65:0,speed=frame<335?7.2:frame<440?-4:6;
  theta+=turn/60;tx-=Math.sin(theta)*speed/60;tz-=Math.cos(theta)*speed/60;
  offset.set(tx+6.8*Math.sin(theta),4.2,tz+6.8*Math.cos(theta));if(!frame)camera.position.copy(offset);else camera.position.lerp(offset,1-Math.exp(-6/60));
  camera.lookAt(tx,2.75,tz);
 }camera.updateMatrixWorld();
 clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frust.setFromProjectionMatrix(clip);
 testLists.init();let firstData=[];draws.length=0;baseline.length=0;frameBytes=0;const frameUploads={};
 const p0=performance.now(); for(const b of batches)b.ctrl?.update(camera);const delta=performance.now()-p0; updateMs+=delta;maxUpdate=Math.max(maxUpdate,delta);
 for(const b of batches){if(!frust.intersectsObject(b.mesh))continue;
 const previous=frameBytes;attributes.update(b.mesh.instanceMatrix,gl.ARRAY_BUFFER);attributes.update(b.mesh.instanceColor,gl.ARRAY_BUFFER);
 const sent=frameBytes-previous;if(frame&&sent){frameUploads[b.name]=sent;batchUploadTotals[b.name]=(batchUploadTotals[b.name]??0)+sent;batchUploadMax[b.name]=Math.max(batchUploadMax[b.name]??0,sent);}
 if(rice==='bounded'&&b.name==='rice')assert.ok(sent<=64*1024,'bounded rice tail exceeded its matrix+color transfer ceiling');
 const gpuMat=attributes.get(b.mesh.instanceMatrix).buffer.a,gpuCol=attributes.get(b.mesh.instanceColor).buffer.a; const live=new Set(); let prev=-1;
 for(let k=0;k<b.mesh.count;k++){const id=b.ids.get(b.idKey(gpuMat,k*16));assert(id>prev);prev=id;live.add(id);
 if(b.name==='rice'&&rice==='bounded'&&k<b.full-Math.floor(65536/76))assert.equal(id,k,'immutable field rows must remain byte-exact in original slots');
 for(let h=0;h<16;h++)assert.equal(gpuMat[k*16+h],b.mats[id*16+h]);
 for(let h=0;h<3;h++)assert.equal(gpuCol[k*3+h],b.colors[id*3+h]);}
 for(let i=0;i<b.full;i++){const [c,u,v,w]=b.obbs[i];if(!frust.planes.some(p=>p.distanceToPoint(c)+Math.abs(p.normal.dot(u))+Math.abs(p.normal.dot(v))+Math.abs(p.normal.dot(w))<0)){assert(live.has(i),b.name+' lost '+i);retained++;}checked++;}
 if(b.mesh.castShadow){assert.equal(b.mesh.count,b.full);assert.deepEqual(gpuMat,b.mats);}
 tr.copy(b.mesh.boundingSphere.center).applyMatrix4(clip);
 testLists.push(b.mesh,b.geom,b.mesh.material,0,tr.z,null);
 firstData.push([b.name,b.full,b.mesh.count,b.verts/3,!!b.ctrl]);
 }
 testLists.sort();testLists.finish();for(const r of testLists.opaque){const b=batches.find(b=>b.mesh===r.object); assert(b);rec.renderInstances(0,b.verts,b.mesh.count);baseline.push([b.verts,b.full]);}
 extraCalls+=Math.max(0,draws.length-baseline.length);
 if(!frame)first={cohorts:firstData,full:sum(baseline),live:sum(draws),calls:[baseline.length,draws.length]};
 else {if(frameBytes>transferMax){transferMax=frameBytes;maxFrameDetails={frame,uploads:frameUploads};}transfers+=frameBytes;if(frameBytes)uploads++;}
 const drawFull=sum(baseline),drawLive=sum(draws),drawRice=firstData.filter(v=>v[0]==='rice').reduce((n,v)=>n+v[2]*v[3],0);
 totalFull+=drawFull;totalLive+=drawLive;submissions+=draws.length;riceSubmissions+=drawRice;
 camera.getWorldDirection(tr);frames.push([frame,...[...camera.position.toArray(),...tr.toArray()].map(v=>+v.toFixed(5)),camera.fov,drawFull,drawLive,drawRice,draws.length,frameBytes]);
}
const report={scope:'CPU-only real Three submission and byte uploader with memory GL; not a frame-time test.',seed,route,implementation,rice,defenseOffset:Number(defenseOffset),first,poses,actualOBBs:checked,oracleVisible:retained,full:totalFull,live:totalLive,riceSubmissions,submissions,extraCalls,transferFrames:uploads,totalUploadBytesAfterInit:transfers,maxUploadFrame:transferMax,maxFrameDetails,batchUploadTotals,batchUploadMax,meanCompactCpuMs:updateMs/poses,maxCompactCpuMs:maxUpdate};
if(route==='embassy-turnout'){
 assert.equal(extraCalls,0);assert.equal(transfers,0,'no recurring attribute traffic at the peak camera');
 if(implementation==='candidate'){
  const extra=first.cohorts.filter(([name,n,,tris])=>!name.startsWith('caster')&&
    !['rice','perim'].includes(name)&&(n<192||n*tris<20_000));
  assert.ok(extra.reduce((sum,[,n,shown,tris])=>sum+(n-shown)*tris,0)>20_000,'avoid meaningful hidden triangle work without removing visible plants');
 }
}
const hashes=Object.fromEntries(batches.map(b=>[b.name,{matrices:digest(b.mats),colors:digest(b.colors),geometry:digest(b.geom.attributes.position.array),indices:b.geom.index?digest(b.geom.index.array):null}]));
if(out)fs.writeFileSync(out,JSON.stringify({...report,hashes,frameColumns:['frame','x','y','z','directionX','directionY','directionZ','fov','fullTriangles','submittedTriangles','riceTriangles','submissions','uploadedBytes'],frames})+'\n',{flag:'wx'});console.log(JSON.stringify(report));
