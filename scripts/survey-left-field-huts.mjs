// Authoring tool, no game state: project nearby candidate sites onto actual
// driver captures and estimate ground/footing clearance. No scene rendered.
import {build} from 'vite';
import * as T from 'three';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const folder=process.argv[2],list=JSON.parse(fs.readFileSync(folder+'/route.json')).frames,tab=JSON.parse(fs.readFileSync(folder+'/comparison-receipt.json')).stills.map(s=>list.find(f=>f.file===s.after.frame));
const sharp=(await import('node:module')).createRequire(import.meta.url)('sharp');
const pixels=await Promise.all(tab.map((_,i)=>sharp(folder+'/'+['approach','midspan','far-bank'][i]+'-after.jpg').removeAlpha().raw().toBuffer()));
const entry=fileURLToPath(new URL('../src/components/Scene/InhabitedTerraces.tsx',import.meta.url));
const result=await build({configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},plugins:[{name:'survey',transform(src,id){if(id===entry)return {code:src+'\nexport {spurs,shape};'}}}],build:{ssr:entry,write:false,minify:false}});
const js=result.output.find(c=>c.type==='chunk'&&c.isEntry).code.replace(/from (['"])([^'"]+)\1/g,(_,q,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {createInhabitedTerraces,spurs,shape}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const g=createInhabitedTerraces();g.setDrawRange(0,g.userData.groundVertices);const hill=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide})),ray=new T.Raycaster();
const gr=(x,z)=>{ray.set(new T.Vector3(x,75,z),new T.Vector3(0,-1,0));return ray.intersectObject(hill)[0]?.point.y??NaN};
const cameras=tab.map(f=>{const cam=new T.PerspectiveCamera(f.fov,16/9,.1,400);cam.position.fromArray(f.camera);cam.quaternion.fromArray(f.q);cam.updateMatrixWorld();return cam;});
for(let id=0;id<2;id++){
 const marks=[],oldF=[.17,-.23][id],t0=[3.47,6.50][id]/8,h=g.userData.dwellings[id],origRoof=h.roofPeak[1]-h.center[1],ori=new T.Vector3(...h.center); 
 for(let j=-4;j<=9;j++)for(let i=-10;i<=10;i++){
  const f=oldF+i*.028,t=t0+j*.016,[x,z]=shape(spurs[0],f,t);
  const legs=[[1.24,.55],[-1.24,.55],[1.24,-.55],[-1.24,-.55]].map(([u,v])=>gr(x+u,z+v));
  if(legs.some(y=>!Number.isFinite(y)))continue;
  const y=Math.max(...legs)+.28+origRoof,roof=new T.Vector3(x,y,z),travel=Math.hypot(x-ori.x,z-ori.z);
  if(travel>13||Math.max(...legs)-Math.min(...legs)>.57)continue;
  let score=0;const samples=[];
  for(let n=0;n<cameras.length;n++){
   const cam=cameras[n],s=roof.clone().project(cam);const u=Math.round((s.x+1)*960),v=Math.round((1-s.y)*540);
   ray.set(cam.position,roof.clone().sub(cam.position).normalize());const clear=!(ray.intersectObject(hill)[0]?.distance<cam.position.distanceTo(roof)-.35);
   let good=0,sil=0;
   for(let dx=-14;dx<=14;dx+=2)for(let dy=-2;dy<=12;dy+=2){const k=3*((v+dy)*1920+u+dx),p=pixels[n];if(u>55&&v>45&&u<1700&&p[k]>78&&p[k+1]>78&&Math.abs(p[k]-p[k+1])<26)good++;sil++;}
   const hitsLabel=id===0&&n===0&&u>98&&u<291&&v>214&&v<265;
   const pct=clear&&!hitsLabel?good/sil:0;score+=pct*(n===0?.39:n===1?.41:.20);
   samples.push([u,v,Math.round(pct*100)]);
  }
  score-=travel*.006;marks.push({i,j,f,t,travel:+travel.toFixed(1),score:+score.toFixed(3),y:+y.toFixed(2),samples});
 }
 console.log(id,JSON.stringify(marks.filter(m=>m.i===0&&m.j===0)),JSON.stringify(marks.sort((a,b)=>b.score-a.score).slice(0,8)));
}
