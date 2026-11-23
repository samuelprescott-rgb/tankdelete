// Offline geometric visibility only. The live production rig capture still
// owns the rendered two-eye witnesses at 5, 16 and 25 metres.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import ts from 'typescript';

const base=new URL('../src/components/Scene/',import.meta.url),modules=new Map();
async function moduleUrl(url){
  if(modules.has(url.href))return modules.get(url.href);
  let js=ts.transpileModule(await readFile(url,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for(const m of [...js.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]){
    let id=m[2];if(id.startsWith('.')){
      let f=new URL(id+'.ts',url);if(!ts.sys.fileExists(fileURLToPath(f)))f=new URL(id+'.tsx',url);
      id=await moduleUrl(f);
    }else id=import.meta.resolve(id);
    js=js.replace(m[0],`from '${id}'`);
  }
  const uri='data:text/javascript;base64,'+Buffer.from(js).toString('base64');
  modules.set(url.href,uri);return uri;
}
const load=name=>moduleUrl(new URL(name,base)).then(uri=>import(uri));
const eye=(await load('undeadEyes.ts')).undeadEyeMaterial(),heads=await load('AuthoredZombieHead.tsx');
const zombie=await load('zombieGeometry.ts'),component=await readFile(new URL('ZombieHorde.tsx',base),'utf8');
// Evaluate the production local transform; no hand-picked substitutes.
const pose=component.match(/partObject\.position\.set\(sign\*\(authored\?ZOMBIE_EYE_LOCAL[\s\S]*?partObject\.updateMatrix\(\);/);
assert(pose,'Eye instancing must still use the head-local socket');
const place=new Function('partObject','authored','sign','ZOMBIE_EYE_LOCAL',pose[0]);
const folder=new URL('../public/models/us-infantry-head/',import.meta.url);
const gltf=JSON.parse(await readFile(new URL('us-male-head.gltf',folder))),bin=await readFile(new URL(gltf.buffers[0].uri,folder));
const prim=gltf.meshes.find(m=>m.name==='head-far').primitives[0],source=new T.BufferGeometry();
function attr(i){
  const a=gltf.accessors[i],v=gltf.bufferViews[a.bufferView],n={VEC3:3,VEC2:2,SCALAR:1}[a.type];
  assert(!v.byteStride&&n);return new T.BufferAttribute(new ({5123:Uint16Array,5126:Float32Array}[a.componentType])(
    bin.buffer,bin.byteOffset+(v.byteOffset??0)+(a.byteOffset??0),a.count*n),n);
}
source.setAttribute('position',attr(prim.attributes.POSITION));source.setAttribute('normal',attr(prim.attributes.NORMAL));
source.setAttribute('uv',attr(prim.attributes.TEXCOORD_0));source.setIndex(attr(prim.indices));
const skin=heads.createAuthoredZombieHeadAssets(new T.Mesh(source,new T.MeshStandardMaterial()));
const solid=new T.MeshBasicMaterial({side:T.DoubleSide}),helmet=new T.Mesh(zombie.createZombieHelmetGeometry().scale(.74,.79,.72).translate(0,.088,0),solid);
const numbers=s=>[...s.matchAll(/\.\d+/g)].map(m=>Number(m[0]));
const radii=numbers(eye.vertexShader.match(/vec2 radius=max\([\s\S]+?;/)[0]);assert.equal(radii.length,6);
const lift=Number(eye.vertexShader.match(/scale\*(\.\d+)\*\(1\.-vNear\)/)[1]);
assert(eye.depthTest&&!eye.depthWrite&&eye.blending===T.NormalBlending);
assert(eye.fragmentShader.includes('vFacing*lid*min(1.,iris+aura)'),'Empty corners must not paint over the skin');
assert(eye.vertexShader.includes('center.xyz+=-normalize(eye[0].xyz)')&&eye.vertexShader.includes('smoothstep(.065,.48,facing)'));
const red=eye.fragmentShader.match(/vec3\(([\d.]+),([\d.]+),([\d.]+)\)\*iris/).slice(1).map(Number);
assert(red[0]>1&&red[1]<red[0]*.02&&red[2]>red[1]&&red[2]<red[0]*.04,'Crimson, never orange/yellow');
assert(!eye.lights&&!eye.fragmentShader.includes('gl_FragDepth'),'No world lights; real depth test');
const ray=new T.Raycaster(),toV=(x,y,z)=>new T.Vector3(x,y,z),s=T.MathUtils.smoothstep;
let samples=0,minHits=Infinity;
for(const authored of [false,true]){
  const head=new T.Mesh(authored?skin.geometry:zombie.createZombieHeadGeometry(),solid),occluders=[helmet,head];
  const poses=[-1,1].map(sign=>{const p=new T.Object3D();place(p,authored,sign,heads.ZOMBIE_EYE_LOCAL);return p;});
  for(const p of poses){
    ray.set(toV(p.position.x,p.position.y,-1),toV(0,0,1));const hit=ray.intersectObject(head)[0].point.z;
    assert(p.position.z<hit,'Corneal center is visible from the front');
    if(!authored)assert(hit-p.position.z<.009,'Fallback point must not float outside the face');
    else for(const dy of [-.011,.010]){
      ray.set(toV(p.position.x,p.position.y+dy,-1),toV(0,0,1));
      assert(ray.intersectObject(head)[0].point.z<p.position.z,'The real authored lids are in front of the central reflection');
    }
  }
  for(const d of [5,16,25])for(const yaw of [0,.30])for(const phase of [0,.40]) {
    const cam=new T.PerspectiveCamera(60,16/9,.1,340),target=toV(0,.032,-.10);
    cam.position.set(Math.sin(yaw),.14,-Math.cos(yaw)).normalize().multiplyScalar(d).add(target);cam.lookAt(target);cam.updateMatrixWorld();
    const witnesses=[];
    for(const p of poses){
      const depth=-p.position.clone().applyMatrix4(cam.matrixWorldInverse).z;
      const radius=[0,1].map(i=>Math.max(radii[i],Math.min(radii[2+i],radii[4+i]*depth)));
      const center=toV(0,0,-lift*s(depth,7,17)).applyMatrix4(p.matrix),normal=toV(0,0,-1).applyQuaternion(p.quaternion);
      const screen=center.clone().project(cam),cx=(1+screen.x)*960,cy=(1-screen.y)*540;
      const plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,center),right=toV(-1,0,0).applyQuaternion(p.quaternion),up=toV(0,1,0).applyQuaternion(p.quaternion);
      const hits=new Set();
      for(let y=Math.floor(cy)-7;y<=Math.ceil(cy)+7;y++)for(let x=Math.floor(cx)-8;x<=Math.ceil(cx)+8;x++){
        ray.setFromCamera({x:(x+.5+phase)/960-1,y:1-(y+.5+phase)/540},cam);
        const sample=ray.ray.intersectPlane(plane,new T.Vector3());if(!sample)continue;
        const local=sample.clone().sub(center);if(Math.hypot(local.dot(right)/radius[0],local.dot(up)/radius[1])>.62)continue;
        const block=ray.intersectObjects(occluders)[0];
        if(!block||block.distance>sample.distanceTo(cam.position))hits.add(x+':'+y);
      }
      assert(hits.size>0,`No distinct unoccluded iris pixels: authored=${authored}, d=${d}, yaw=${yaw}, phase=${phase}`);
      witnesses.push(hits);minHits=Math.min(minHits,hits.size);
    }
    assert([...witnesses[0]].every(p=>!witnesses[1].has(p)),'Both socket centers must have distinct core pixels');
    samples++;
  }
}
console.log(`Socket/helmet projection: ${samples} fixed 1080p cases; both red cores unobstructed (minimum ${minHits} distinct pixels/eye), no shared core pixels. This is not a rendered-frame receipt.`);
