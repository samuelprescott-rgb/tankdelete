// Test the actual posed skin against the watcher's cheek/mouth, in skull
// coordinates. A muzzle that is visible only from a special review lens is
// not a fix; compare the actual triangle depths across several sight lines.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as T from 'three';
const compile=async(name,change=(v)=>v)=>{
  const src=await readFile(new URL('../src/components/Scene/'+name+'.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(change(src),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
    .replace(/from '(three[^']*)'/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
};
const ink=await compile('commandBonePaint');
const m=await import(await compile('commandCreature',s=>s.replace("from './commandBonePaint'",'from '+JSON.stringify(ink))));
const mat=new T.MeshBasicMaterial({side:T.DoubleSide}),rig=m.commandFasciaRig(),heads=m.COMMAND_HEAD_SEATS.map((p,i)=>{
  const h=new T.Mesh(m.commandSkull(!!i),mat);h.position.fromArray(p);h.scale.fromArray(i?[.495,.55,.52]:[.505,.575,.54]);return h;});
const arms=m.COMMAND_ARM_SEATS.map((p,i)=>{const a=new T.Mesh();a.position.fromArray(p);a.scale.setScalar(i?1.12:1.16);return a;});
const elbows=arms.map(()=>{const e=new T.Mesh();e.position.y=-.312;return e;});
const mesh=new T.SkinnedMesh(m.commandMantle(),mat);mesh.bindMode=T.DetachedBindMode;mesh.bind(rig,new T.Matrix4());mesh.updateMatrixWorld();
const jaw=new T.Mesh(m.commandSkull(true,true),mat);jaw.position.fromArray(m.COMMAND_JAW_HINGE);heads[1].add(jaw);
const trim=new T.Mesh(m.commandHeadTrim(true),mat),enamel=new T.Mesh(m.commandHeadTrim(true,true),mat);jaw.add(enamel);heads[1].add(trim);
const skinGeo=new T.BufferGeometry(),rest=mesh.geometry.getAttribute('position');
skinGeo.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(rest.count*3),3));
const net=new T.Mesh(skinGeo,mat),ray=new T.Raycaster(),v=new T.Vector3(),eye=new T.Vector3(),dir=new T.Vector3();
let tests=0,obscured=0;
for(const [pitch,yaw,roll,open] of [[.42,-.3,.12,-.45],[.66,-.69,.19,-.80],[.25,.36,.09,-.65],[.51,-.47,.11,-.53]]){
  heads[0].rotation.set(.27,.18,-.25);heads[1].rotation.set(pitch,yaw,roll);jaw.rotation.set(open,0,.025);
  heads.forEach(h=>h.updateMatrixWorld(true));m.poseCommandFascia(rig,heads,arms,elbows);rig.update();
  if(process.env.ORAL_STUDY&&pitch===.42){
    const e=new T.Vector3(.33,-.002,-.83).applyMatrix4(heads[1].matrixWorld);
    for(const y of [-.070,-.088,-.105,-.122,-.142,-.160,-.177]){
      const row=[];for(const x of [-.07,-.035,0,.035,.07]){
        const q=new T.Vector3(x,y,-.16).applyMatrix4(heads[1].matrixWorld);
        ray.set(e,q.sub(e).normalize());const hit=ray.intersectObject(heads[1],true)[0];
        if(!hit){row.push('empty');continue;}const obj=hit.object;
        row.push((obj===jaw?'jaw':obj===trim?'maxilla':obj===enamel?'mandible':'skull')+':'+hit.faceIndex);
      }console.log(y,row.join(' '));
    }
  }
  for(let k=0;k<rest.count;k++){v.fromBufferAttribute(rest,k);mesh.applyBoneTransform(k,v);skinGeo.attributes.position.setXYZ(k,v.x,v.y,v.z);}
  skinGeo.computeBoundingSphere();skinGeo.computeBoundingBox();
  for(const ex of [-.29,-.18,.02,.21])for(const y of [-.169,-.123,-.078,-.039,-.008,.028])for(const x of [-.074,-.035,0,.035,.074]){
    eye.set(ex,.065,-1.01).applyMatrix4(heads[1].matrixWorld);dir.set(x,y,-.175).applyMatrix4(heads[1].matrixWorld).sub(eye).normalize();
    ray.set(eye,dir);const h=ray.intersectObject(heads[1],true)[0];if(!h)continue;
    const n=ray.intersectObject(net,false)[0];tests++;
    if(n&&n.distance<h.distance-.0005){
      obscured++;
      if(process.env.DETAIL)console.log({pitch,ex,x,y,face:n.faceIndex,hit:heads[1].worldToLocal(n.point.clone()).toArray()});
    }
  }
}
console.log({tests,obscured});
assert(tests>=440,'Enough rays must hit the jaw, palate, teeth, muzzle or cheek in the first place.');
assert(obscured===0,'Tongue, teeth and facial planes must draw in front of the neck under jaw/scan animation.');
