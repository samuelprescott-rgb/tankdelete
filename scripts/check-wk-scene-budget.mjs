import assert from 'node:assert/strict';
import * as T from 'three';
import {inspectDrawBudget} from './qa-wk-scene-budget.mjs';
const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,16/9,.1,3000),tank=new T.Group();tank.name='player-tank';scene.add(tank);
const geometry=new T.BoxGeometry(1,1,1);geometry.computeBoundingSphere();const mesh=new T.InstancedMesh(geometry,new T.MeshBasicMaterial(),256);mesh.name='static-test';scene.add(mesh);
const m=new T.Matrix4();for(let i=0;i<256;i++)mesh.setMatrixAt(i,m.makeTranslation(i<128?0:1000,0,-10));
scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);const gl={info:{render:{calls:0,triangles:0}}};
tank.__r3f={root:{getState:()=>({scene,camera,gl})}};const radar={'__reactFiber$fixture':{memoizedState:{memoizedState:{current:tank}}}};
globalThis.document={querySelector:()=>radar};const oldBefore=mesh.onBeforeRender,oldAfter=scene.onAfterRender;
const response=inspectDrawBudget();scene.onBeforeRender(gl,scene,camera);mesh.onBeforeRender(gl,scene,camera);
gl.info.render.calls+=1;gl.info.render.triangles+=12288;mesh.onAfterRender(gl,scene,camera);scene.onAfterRender(gl,scene,camera);
const report=await response;assert.equal(report.calls,1);assert.equal(report.triangles,12288);assert.equal(report.highest[0].instances,256);
for(const s of report.highest[0].spatialEstimate){assert.equal(s.excludedInstances,128);assert.equal(s.estimatedSkippedTriangles,6144);assert.equal(s.visibleCells,1);}
assert.equal(mesh.onBeforeRender,oldBefore);assert.equal(scene.onAfterRender,oldAfter);
console.log('Post-frame draw accounting, conservative cell exclusion, and callback restoration passed.');
