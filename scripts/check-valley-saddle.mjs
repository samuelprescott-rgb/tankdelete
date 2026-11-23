// Exercise actual rendered indexed triangles, not a separate elevation helper.
import assert from 'node:assert/strict';
import * as T from 'three';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
const result=await build({configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},
  build:{ssr:fileURLToPath(new URL('../src/components/Scene/valleySaddle.tsx',import.meta.url)),write:false,minify:false}});
const code=result.output.find(c=>c.type==='chunk'&&c.isEntry).code.replace(/from (['"])([^'"]+)\1/g,(_,q,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {createValleySaddle}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const g=createValleySaddle(),mesh=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));
const {position:p,uv}=g.attributes;let minRadius=Infinity,minY=Infinity,uvMin=Infinity,uvMax=-Infinity;
for(let i=0;i<p.count;i++){
  minRadius=Math.min(minRadius,Math.hypot(p.getX(i),p.getZ(i)));minY=Math.min(minY,p.getY(i));
  uvMin=Math.min(uvMin,uv.getY(i));uvMax=Math.max(uvMax,uv.getY(i));
}
const triangles=g.index.count/3;assert(triangles<=6720&&g.groups.length===0);assert(minRadius>105&&minY<-25);
assert(uvMin>=0&&uvMax<.15,'must sample the physical foothill toe, not clouds or open sky');
let rays=0;
for(let i=0;i<72;i++)for(const height of [-21,-7,.4,2]){
  const a=i*Math.PI/36,dir=new T.Vector3(Math.cos(a),0,Math.sin(a));
  const hits=new T.Raycaster(new T.Vector3(0,height,0),dir).intersectObject(mesh,false);
  assert(hits.length>=2,'both overlapping closed foothill skirts at '+a+' / '+height);rays++;
}
// From the *ordinary* starting camera a lower 3D foothill must not turn
// into a dark outline across either the break in the painted sun or the
// higher shelf supporting the inhabited outcrop. Check actual triangles
// on both sides of each sightline, not just the mathematical sky map.
const eye=new T.Vector3(-2.95,3.12,-16.85),probe=new T.Raycaster();
for(const [label,bearing,el] of [['sun',1.14,.246],['occupied shelf',1.74,.218]]){
  for(const offset of [-.033,0,.033]){
    const a=bearing+offset,dir=new T.Vector3(Math.cos(el)*Math.cos(a),Math.sin(el),Math.cos(el)*Math.sin(a));
    probe.set(eye,dir);
    assert(!probe.intersectObject(mesh,false).length,label+' hidden by the foothill');
  }
}
console.log({triangles,minRadius,minY,uvMin,uvMax,coveredHorizonRays:rays,clearUpperFoothillSightlines:6});
