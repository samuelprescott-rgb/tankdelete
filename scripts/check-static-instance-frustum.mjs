import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as T from 'three';
const file=new URL('../src/components/Scene/staticInstanceFrustum.ts',import.meta.url);
const js=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText.replace(/from ['"]three['"]/g,`from '${import.meta.resolve('three')}'`);
const {createStaticInstanceFrustum,STATIC_FOLIAGE_CULL_PRIORITY}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const capacity=320,matrix=new T.Matrix4(),placement=new T.Object3D(),tint=new T.Color();
const geometry=new T.BoxGeometry(2,2,2,5,4,3),material=new T.MeshStandardMaterial(),mesh=new T.InstancedMesh(geometry,material,capacity);
for(let i=0;i<capacity;i++){
  placement.position.set(((i*47)%153)-76,(i%7)*.4,((i*37)%167)-83);
  placement.rotation.set((i%9)*.12,(i%13)*.35,0);placement.scale.set(.25+i%9,.5+i%5,.8+i%4);placement.updateMatrix();
  mesh.setMatrixAt(i,placement.matrix);mesh.setColorAt(i,tint.setRGB((i+1)/512, i%8/16+.1, i%9/23));
}
const parent=new T.Group();parent.add(mesh);parent.position.set(4,1,8);parent.rotation.y=.13;parent.scale.set(1.2,.93,.87);
mesh.computeBoundingBox();mesh.computeBoundingSphere();const initialSphere=mesh.boundingSphere.clone();
const original=mesh.instanceMatrix.array.slice(),colors=mesh.instanceColor.array.slice(),indices=new Map();for(let i=0;i<capacity;i++)indices.set(colors[i*3],i);
const gpuM=original.slice(),gpuC=colors.slice();function upload(attribute,gpu){for(const {start,count} of attribute.updateRanges){
  assert.ok(start>=0&&count>0&&start+count<=attribute.array.length);gpu.set(attribute.array.subarray(start,start+count),start);
}attribute.clearUpdateRanges();}
const hook=createStaticInstanceFrustum(mesh);assert.ok(hook);const eye=new T.PerspectiveCamera(56,16/9,.1,180);
let checked=0,culled=0,masks=0;
function verify(camera){
  const version=mesh.instanceMatrix.version,cv=mesh.instanceColor.version;
  const changed=hook.update(camera);masks+=+changed;
  upload(mesh.instanceMatrix,gpuM);upload(mesh.instanceColor,gpuC);
  const ids=[];for(let j=0;j<mesh.count;j++){
    const source=indices.get(gpuC[j*3]);assert.notEqual(source,undefined);ids.push(source);
    assert.deepEqual(gpuM.subarray(j*16,j*16+16),original.subarray(source*16,source*16+16));
    assert.deepEqual(gpuC.subarray(j*3,j*3+3),colors.subarray(source*3,source*3+3));
    if(j)assert.ok(source>ids[j-1],'visible order remains seeded order');
  }
  if(changed&&mesh.count){assert.equal(mesh.instanceMatrix.version,version+1);assert.equal(mesh.instanceColor.version,cv+1);}
  const retained=new Set(ids),frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
  const bounds=geometry.boundingBox.clone();bounds.min.x-=.08;bounds.max.x+=.08;bounds.min.z-=.044;bounds.max.z+=.044;
  const corner=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corner.push(new T.Vector3(x,y,z));
  for(let i=0;i<capacity;i++){
    matrix.fromArray(original,i*16).premultiply(mesh.matrixWorld);
    const world=corner.map(p=>p.clone().applyMatrix4(matrix));
    // Independent six-plane OBB oracle, including maximum signed wind BEFORE
    // a nonuniform instance transform. No reliance on the production cell map.
    if(!frustum.planes.some(p=>world.every(v=>p.distanceToPoint(v)<0)))assert.ok(retained.has(i),'lost potentially visible/wind-displaced instance '+i);
    checked++;
  }
  culled+=capacity-retained.size;
  assert.equal(hook.update(camera),false);assert.equal(mesh.instanceMatrix.version,version+(changed&&mesh.count?1:0));
}
for(let i=0;i<90;i++){
  const a=.21*i+(i%3===0?Math.PI:0);eye.position.set(Math.sin(i*.21)*42,2+i%7,Math.cos(i*.21)*39);
  eye.fov=[34,60,93][i%3];eye.aspect=[1,16/9,.64,2.5][i%4];eye.updateProjectionMatrix();
  eye.lookAt(eye.position.x+Math.sin(a)*45,1,eye.position.z+Math.cos(a)*45);
  if(i===45){parent.rotation.y+=.65;parent.position.z-=11;}
  verify(eye);
}
const inspection=new T.OrthographicCamera(-24,24,18,-18,.1,180);inspection.position.set(24,50,24);inspection.lookAt(0,0,0);verify(inspection);
// Three may skip this mesh for several render passes. Its next partial upload
// must include ALL outstanding row changes, not only the most recent edit.
for(let i=0;i<7;i++){eye.position.set(20-i*7,8,i*4);eye.lookAt(i%2?45:-45,0,0);hook.update(eye);}verify(eye);
assert.ok(culled>10000&&masks>50);assert.deepEqual(mesh.boundingSphere,initialSphere,'never shrink full global bound');
hook.restore();assert.equal(mesh.count,capacity);assert.deepEqual(mesh.instanceMatrix.array,original);assert.deepEqual(mesh.instanceColor.array,colors);
hook.restore();assert.deepEqual(mesh.instanceColor.array,colors);verify(inspection);hook.restore();
const bare=new T.InstancedMesh(geometry,material,capacity);assert.ok(createStaticInstanceFrustum(mesh));
mesh.castShadow=true;assert.equal(createStaticInstanceFrustum(mesh),null);mesh.castShadow=false;
material.transparent=true;assert.equal(createStaticInstanceFrustum(mesh),null);material.transparent=false;
assert.equal(createStaticInstanceFrustum(bare),null,'one cell is not worth compacting');
assert.equal(createStaticInstanceFrustum(new T.InstancedMesh(new T.BoxGeometry(),material,capacity)),null,'skip low-work batches');
const crown=new T.InstancedMesh(new T.BoxGeometry(.01,.1,.01,5,4,3),material,capacity);
for(let i=0;i<capacity;i++){matrix.makeScale(15,1,1).setPosition(i===0?61.1:80+i,0,0);crown.setMatrixAt(i,matrix);}
const wind=createStaticInstanceFrustum(crown),ortho=new T.OrthographicCamera(-60,60,5,-5,.1,100);
ortho.position.z=5;ortho.lookAt(0,0,0);assert.ok(wind);wind.update(ortho);
assert.ok(crown.count>0&&crown.count<capacity);crown.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.elements[12]-61.1)<.001,'scaled leaf outside camera at rest but its swaying edge is visible');wind.restore();
const cameraSource=await readFile(new URL('../src/components/Scene/SceneReviewCamera.tsx',import.meta.url),'utf8');
assert.ok(STATIC_FOLIAGE_CULL_PRIORITY>Number(cameraSource.match(/},\s*(0\.\d+)\);\s*\/\/ After chase controls/)?.[1])&&STATIC_FOLIAGE_CULL_PRIORITY<1,'inspection/chase before compaction before composer');
console.log(`Static foliage: ${checked} independent wind-padded OBB checks, ${culled} off-frustum slots skipped, ${masks} mask uploads; exact original matrices/colors/order across fast turns, FOV/aspect/inspection and parent changes.`);
