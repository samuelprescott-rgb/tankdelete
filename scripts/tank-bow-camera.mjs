import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';

// Use the actual production photographer's preset (also recorded in R8's
// field-heroes.json), rather than an independently adjustable test camera.
// Never move the camera to chase a UV marker. Sample in screen space, then use
// the nearest visible triangle of the *entire mounted vehicle* at each sample.
const capture=readFileSync(new URL('./capture-command-rig.mjs',import.meta.url),'utf8');
const preset=capture.match(/\['tank-bow','player-tank',\[([^\]]+)\],\[([^\]]+)\]\]/);
const viewport=capture.match(/viewport:\{width:(\d+),height:(\d+)\}/);
const lens=readFileSync(new URL('../src/components/Scene/Scene.tsx',import.meta.url),'utf8').match(/camera=\{\{[^\n]+?fov:\s*(\d+)/);
assert.ok(preset&&viewport&&lens,'The production hero camera and viewport must be verified before measuring');
const eye=preset[1].split(',').map(Number),aim=preset[2].split(',').map(Number);
const W=Number(viewport[1]),H=Number(viewport[2]),FOV=Number(lens[1]),STEP=2;
assert.deepEqual([W,H,FOV],[1920,1080,60],'Remeasure baseline if the production camera lens/viewport changes');
const ivory=new Set([0xfff0cb,0xcbbb8b]),redEye=0xec4938;
function pigmentGroups(tex){
  const {data,width:w,height:h}=tex, pigment=new Uint32Array(w*h),group=new Int32Array(w*h);
  const eyes=new Set();let n=0;
  for(let k=0;k<w*h;k++)pigment[k]=data[k*4]<<16|data[k*4+1]<<8|data[k*4+2];
  // Separate each actual tooth or eye white by its connected paint. Red iris
  // is the semantic seed for its sclera, independent of position or styling.
  const live=k=>ivory.has(pigment[k])||pigment[k]===redEye;
  for(let k=0;k<group.length;k++){
    if(group[k]||!live(k))continue;
    const id=++n,q=[k];group[k]=id;let eye=false;
    for(let j=0;j<q.length;j++){
      const p=q[j],x=p%w,y=Math.floor(p/w);if(pigment[p]===redEye)eye=true;
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){
        const a=x+dx,b=y+dy,m=b*w+a;if(a<0||a>=w||b<0||b>=h||group[m]||!live(m))continue;
        group[m]=id;q.push(m);
      }
    }
    if(eye)eyes.add(id);
  }
  return {pigment,group,eyes};
}
export function measureBowCamera(jaw,root,side=1){
  root.updateWorldMatrix(true,true);
  const cam=new T.PerspectiveCamera(FOV,W/H,.1,340);
  cam.position.copy(root.localToWorld(new T.Vector3(side*eye[0],eye[1],eye[2])));
  cam.lookAt(root.localToWorld(new T.Vector3(side*aim[0],aim[1],aim[2])));cam.updateMatrixWorld();
  const meshList=[];root.traverseVisible(o=>{if(o.isMesh&&o!==jaw&&
    (!o.material?.transparent||o.material?.opacity>.8)&&o.material?.visible!==false)meshList.push(o);});
  const ray=new T.Raycaster(),ndc=new T.Vector2(),scratch=new T.Vector3(),
    pixels=jaw.material.map.image,groups=pigmentGroups(pixels),counts=new Map(),forwardCounts=new Map();
  let eyeArea=0,iris=0,forwardEye=0,teeth=0,frontTeeth=0;
  const rect=new T.Box2();
  for(let i=0,p=jaw.geometry.attributes.position;i<p.count;i++){
    scratch.fromBufferAttribute(p,i).applyMatrix4(jaw.matrixWorld).project(cam);
    rect.expandByPoint(ndc.set((1+scratch.x)*W/2,(1-scratch.y)*H/2));
  }
  // A broad-phase per occluder keeps hundreds of parked track instances out
  // of unrelated rays; Three still decides the real first triangle.
  const boxes=meshList.map(o=>{
    if(o.isInstancedMesh){o.computeBoundingSphere();return o.boundingSphere.clone().applyMatrix4(o.matrixWorld);}
    if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();
    return o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
  });
  const inverse=jaw.matrixWorld.clone().invert(), collisions=[];
  for(let y=Math.max(STEP/2,Math.floor(rect.min.y/STEP)*STEP+STEP/2);y<Math.min(rect.max.y,H);y+=STEP){
    for(let x=Math.max(STEP/2,Math.floor(rect.min.x/STEP)*STEP+STEP/2);x<Math.min(rect.max.x,W);x+=STEP){
      ray.setFromCamera(ndc.set(x/W*2-1,1-y/H*2),cam);ray.far=Infinity;
      const hit=ray.intersectObject(jaw,false)[0];if(!hit)continue;
      scratch.copy(hit.point).applyMatrix4(inverse);if(side*scratch.x<=0)continue;
      const front=scratch.z<-.935;
      const ix=Math.min(pixels.width-1,Math.floor(hit.uv.x*pixels.width)),
        iy=Math.min(pixels.height-1,Math.floor(hit.uv.y*pixels.height)),k=iy*pixels.width+ix;
      const id=groups.group[k];if(!id)continue;
      ray.far=hit.distance-1e-4;let blocked=false;
      for(let i=0;i<meshList.length;i++){
        if(!ray.ray.intersectsSphere(boxes[i]))continue;
        collisions.length=0;ray.intersectObject(meshList[i],false,collisions);
        if(collisions.length){blocked=true;break;}
      }
      if(blocked)continue;
      const area=STEP*STEP;
      if(groups.eyes.has(id)){eyeArea+=area;if(front)forwardEye+=area;if(groups.pigment[k]===redEye)iris+=area;}
      else{teeth+=area;counts.set(id,(counts.get(id)??0)+area);if(front){frontTeeth+=area;forwardCounts.set(id,(forwardCounts.get(id)??0)+area);}}
    }
  }
  const largest=m=>[...m.values()].sort((a,b)=>b-a).slice(0,2);
  return {eye:eyeArea,iris,forwardEye,teeth,frontTeeth,largest:largest(counts),frontLargest:largest(forwardCounts)};
}
export function checkBowCamera(jaw,root){
  const sides=[measureBowCamera(jaw,root),measureBowCamera(jaw,root,-1)];
  console.log('Projected pigment area in px² at 1920x1080 (2px grid; retained bow camera, then its mirror):',JSON.stringify(sides));
  // R8 before this repair: 1,160 eye, 0 forward eye, 4,724 teeth,
  // 1,932 forward enamel, 1,188 and 216 in the two largest forward teeth.
  // Areas are solid paint coverage, not assertions about GPU lighting.
  for(const view of sides){
    assert.ok(view.eye>1500&&view.iris>335&&view.forwardEye>350,
      'Eye white and red iris must be visible on the forward cheek, not just along the body side');
    assert.ok(view.teeth>6900&&view.frontTeeth>4100&&view.frontLargest[0]>1600&&view.frontLargest[1]>750,
      'Both distinct tooth groups must present readable area on the rounded forebody from the normal camera');
  }
}
