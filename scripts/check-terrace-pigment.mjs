// CPU pigment regression, not a rendered screenshot. Check the actual mesh,
// and sample the rocks and connected in-texture woodland in the stock lens.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {build} from 'vite';

const entry=fileURLToPath(new URL('../src/components/Scene/InhabitedTerraces.tsx',import.meta.url));
const bundle=await build({configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},
  build:{ssr:entry,write:false,minify:false}});
const src=bundle.output.find(c=>c.type==='chunk'&&c.isEntry).code
  .replace(/from (['"])([^'"]+)\1/g,(_,q,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {createInhabitedTerraces,createWoodlandPaint}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const g=createInhabitedTerraces(),material=new T.MeshBasicMaterial({side:T.DoubleSide}),land=new T.Mesh(g,material),
  p=g.attributes.position,color=g.attributes.color,map=createWoodlandPaint(),{data,width,height}=map.image;
g.setDrawRange(0,g.userData.groundVertices);
const key=new T.Vector3(Math.cos(1.14)*Math.cos(.246),Math.sin(.246),Math.sin(1.14)*Math.cos(.246)),
  point=i=>new T.Vector3().fromBufferAttribute(p,i),read=i=>new T.Color().fromBufferAttribute(color,i),
  srgb=c=>c.clone().convertLinearToSRGB().toArray().map(v=>v*255),
  q=(xs,f)=>xs.toSorted((a,b)=>a-b)[Math.floor((xs.length-1)*f)];
let lee=0,sun=0;
for(let i=0;i<g.userData.groundVertices;i+=3){
  const face=new T.Triangle(point(i),point(i+1),point(i+2)),n=face.getNormal(new T.Vector3());
  if(n.y<0)n.negate();
  for(let j=i;j<i+3;j++){
    const [r,g,b]=srgb(read(j));
    assert(r-g<4&&g-b<25&&g-r<16,'Tawny soil or vivid green is outside the hillside palette');
    if(n.dot(key)<.12){
      assert(g-r>6,'Sunlit olive spilled across a shadow-facing plane');
      lee++;
    }else if(n.dot(key)>.7&&g-r<5&&r-b>16)sun++;
  }
}
assert(lee>200&&sun>30,'Both skylit shade and a genuinely sun-facing olive plane must survive');
const camera=new T.PerspectiveCamera(60,16/9,.1,340);
camera.position.set(-2.949996,3.120013,-16.849945);
camera.quaternion.set(.01025462,.98886985,.08193138,-.123768);camera.updateMatrixWorld();
const ray=new T.Raycaster(),faces=[],woods=[];
for(let y=65;y<385;y+=7)for(let x=1135;x<1780;x+=8){
  ray.setFromCamera(new T.Vector2(x/960-1,1-y/540),camera);
  const hit=ray.intersectObject(land)[0];
  if(!hit||hit.uv.x<.5)continue; // near shoulder; foreground trees not in this CPU survey
  const ink=new T.Color(0,0,0),w=hit.barycoord.toArray();
  for(let i=0;i<3;i++)ink.add(read(hit.faceIndex*3+i).multiplyScalar(w[i]));
  const off=4*(Math.min(height-1,Math.floor(hit.uv.y*height))*width+Math.min(width-1,Math.floor(hit.uv.x*width))),
    alpha=data[off+3]/255,canopy=new T.Color().setRGB(data[off]/255,data[off+1]/255,data[off+2]/255,T.SRGBColorSpace);
  if(alpha>.55)woods.push(srgb(ink.lerp(canopy,alpha)));
  else if(alpha<.05)faces.push(srgb(ink));
}
assert(faces.length>100&&woods.length>25,'Near-shoulder soil and woodland must both be measurable in the stock lens');
const value=([r,g,b])=>r*.21+g*.72+b*.07;
const faceValues=faces.map(value),canopyValues=woods.map(value);
const contrast=q(faceValues,.90)-q(faceValues,.10),woodDip=q(faceValues,.5)-q(canopyValues,.5);
assert(q(faces.map(([r,g])=>r-g),.95)<-4,'The near face reads as the yellow highlight');
assert(contrast>5&&contrast<21,'Clipped polygon lights or a flat solid wash on the near face: '+contrast);
assert(woodDip>5&&woodDip<23,'Woodland should read as attached shade, not a black cutout: '+woodDip);
console.log(JSON.stringify({stockSoilSamples:faces.length,stockWoodSamples:woods.length,
  faceP90MinusP10:+contrast.toFixed(2),woodlandToFaceValueStep:+woodDip.toFixed(2),
  shadowVertices:lee,sunwardOliveVertices:sun}));
g.dispose();material.dispose();map.dispose();
