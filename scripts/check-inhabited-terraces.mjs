// CPU-only: raycasts and projects the ACTUAL terrain/house triangles. Optional
// --study path renders a labeled triangle study, never claimed as a game frame.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {build} from 'vite';
async function component(name){
  const entry=fileURLToPath(new URL('../src/components/Scene/'+name+'.tsx',import.meta.url));
  const result=await build({configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},build:{ssr:entry,write:false,minify:false}});
  const js=result.output.find(c=>c.type==='chunk'&&c.isEntry).code
    .replace(/from (['"])([^'"]+)\1/g,(_,q,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const {createInhabitedTerraces,createWoodlandPaint}=await component('InhabitedTerraces'),{createValleySaddle}=await component('valleySaddle');
const g=createInhabitedTerraces(),p=g.attributes.position,color=g.attributes.color;
const mat=new T.MeshBasicMaterial({side:T.DoubleSide}),terrain=g.clone();terrain.setDrawRange(0,g.userData.groundVertices);
const hill=new T.Mesh(terrain,mat),other=new T.Mesh(createValleySaddle(),mat);
const {dwellings}=g.userData,feet=[],plateaus=new Set(),v=id=>new T.Vector3().fromBufferAttribute(p,id);
const triangles=p.count/3,report={triangles,homes:[],anchors:0,roofCoverage:[],clearance:Infinity};
assert.equal(dwellings.length,3);
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
// The two distant cultivated spurs still use exactly the 1606 triangles.
// The near shoulder deliberately departs from that freeze; assert its
// driver's-view contour below, as well as protecting the houses themselves.
assert.equal(hash(p.array.subarray(0,3*6600)),'a0e2ae14cdbd19c34f998f735a78da56a6e5fb7697413f5b6a2621435da9245e','Changed a distant field to soften the near shoulder');
const protectedHuts=[
  ['0dbad3287132c336435034697a65765af6db602e9cb9732362c27b651a0d35e9','54b1d12c3aad61e9d26f44b641427615fd929585ccceeff07ba98d68cadcb858'],
  ['8f8b1cc63f3c8f4f69e7d57629dd73c5bd48a05df8107f1f0dae3c70bb13e4a5','ccbd4462f6acd4bd03993354941740c41fbf3ed732cad8a983db6103f6575a4c'],
  ['76cf84085484eefeb6d19be7d3dd00e416c776bf6c4a40d2cb7dea31fbaf4fde','3e39465f6a1e07104e0f3997f0811dde04add90154b279c90565d69c0f04e9f7']
];
for(const [i,d] of dwellings.entries())assert.deepEqual([p,color].map(a=>hash(a.array.subarray(3*d.begin,3*d.end))),protectedHuts[i]);
assert.equal(p.count,dwellings.at(-1).end,'No protruding crown stamps beyond the roofs');
assert(triangles<4200&&g.groups.length===0,'One slope batch without scattered spot geometry');
const painted=createWoodlandPaint(),{width:W,height:H,data:rgba}=painted.image,uv=g.getAttribute('uv');
assert.equal(W,512);assert.equal(H,128);assert.equal(uv.count,p.count);
assert.equal(painted.wrapS,T.ClampToEdgeWrapping);assert.equal(painted.wrapT,T.ClampToEdgeWrapping);
for(const d of dwellings)for(let i=d.begin;i<d.end;i++){
  assert.equal(rgba[4*(Math.floor(uv.getY(i)*H)*W+Math.floor(uv.getX(i)*W))+3],0,'Never paint over a roof');
}
// Check the artwork itself. Reject the old tile of isolated dots AND a
// blank slab. Each painted hill has two large, connected areas, and more
// exposed stone than canopy in the window seen above the driver.
const islands=(bank)=>{
  const w=W/2,mask=new Uint8Array(w*H);
  for(let y=0;y<H;y++)for(let x=0;x<w;x++)mask[y*w+x]=+(rgba[(y*W+bank*w+x)*4+3]>120);
  const bodies=[];
  for(let at=0;at<mask.length;at++)if(mask[at]){
    mask[at]=0;const todo=[at];
    for(let i=0;i<todo.length;i++){const p=todo[i],x=p%w;
      for(const n of [p-w,p+w,x?p-1:-1,x<w-1?p+1:-1])if(mask[n]){mask[n]=0;todo.push(n);}}
    bodies.push(todo.length);
  }
  return bodies.sort((a,b)=>b-a);
};
report.woodlandBodies=[islands(0),islands(1)];
for(const a of report.woodlandBodies)assert(a.length<=5&&a[0]>380&&a[1]>100&&(a[2]??0)<10,'Crown spots, blank stone, or disconnected noise: '+a);
let covered=0,samples=0;
for(let x=12;x<25;x+=.18)for(let y=13;y<20;y+=.14){
  const px=Math.floor((1+(x+6)/56)*W/2),py=Math.floor((y+2)/40*H);
  covered+=+(rgba[4*(py*W+px)+3]>120);samples++;
}
report.rightFaceCoverage=+(covered/samples).toFixed(3);
assert(report.rightFaceCoverage>.19&&report.rightFaceCoverage<.46,'Bare longhouse face or wall-to-wall canopy');
painted.dispose();
const fields=dwellings.filter(d=>d.role==='field-house'),hero=dwellings.find(d=>d.role==='ridge-longhouse');
assert.equal(fields.length,2);assert(hero,'The occupied near shoulder must have an identifiable longhouse.');
assert(p.array.every(Number.isFinite)&&color.array.every(Number.isFinite)&&color.count===p.count);
for(let i=0;i<p.count;i++){
  const q=v(i);report.clearance=Math.min(report.clearance,Math.max(Math.abs(q.x),Math.abs(q.z))-64);
}
assert(report.clearance>4.5,'Terraces overlap the arena or its authored perimeter margin');
let riserArea=0,bedArea=0;
for(let i=0;i<g.userData.groundVertices;i+=3){
  const points=[v(i),v(i+1),v(i+2)],t=new T.Triangle(...points),a=t.getArea(),n=t.getNormal(new T.Vector3()),c=t.getMidpoint(new T.Vector3());
  if(Math.abs(n.y)>.985&&c.y>9&&a>.45){plateaus.add(Math.round(c.y));bedArea+=a;}
  if(Math.abs(n.y)<.67&&c.y>9&&a>.45)riserArea+=a;
}
assert(plateaus.size>=10&&bedArea>600&&riserArea>280,'Real level beds and earthen risers, not pigment on a slope');
const ray=new T.Raycaster();for(const d of dwellings)for(const anchor of d.footings){
  ray.set(new T.Vector3(anchor[0],65,anchor[2]),new T.Vector3(0,-1,0));
  const hit=ray.intersectObject(hill)[0];assert(hit&&Math.abs(hit.point.y-anchor[1])<.002,'Foot is not on visible ground surface');
  feet.push(hit.point);report.anchors++;
}
const parentHill=terrain.clone();parentHill.setDrawRange(0,g.userData.groundVertices-8*7*6);
const noRib=new T.Mesh(parentHill,mat);
const relief=(x,z)=>{
  ray.set(new T.Vector3(x,70,z),new T.Vector3(0,-1,0));
  const base=ray.intersectObject(noRib)[0]?.point.y??-1.5;
  return ray.intersectObject(hill)[0].point.y-base;
};
const folds=[[-26.8,81],[-29.3,79.2],[-32.6,77.6],[-35.7,76.9],[-38.1,75.2],[-46.4,73.4]].map(([x,z])=>relief(x,z));
assert(folds[0]>1.5&&folds[1]>3&&folds[2]>3.2&&folds[3]>2.6&&folds[4]>1.9&&folds[5]<folds[2]*.56,'Near rock rib relief: '+folds.map(v=>v.toFixed(2)));
report.woodedRibRelief=folds.map(n=>+n.toFixed(2));
// The roofs stay on their original bench and visible from the bank.
const bankEye=new T.Vector3(-10.3,2.4,10.1),bank=new T.PerspectiveCamera(60,16/9,.1,340);
bank.position.copy(bankEye);bank.lookAt(3,1.85,18);bank.updateMatrixWorld();
const fixed=[[1013.3,342.1],[1204.4,296.5]];
for(const [i,d] of fields.entries()){
  const roof=new T.Vector3(...d.roofPeak),s=roof.clone().project(bank);
  // Keep the two ORIGINAL hillside parcels, but no longer require the
  // exact ray that was screened by an arena tree in the bridge drive.
  const reference=[[91.63714480183839,78.72330328945466],[85.08702091739288,106.27155997801178]][i];
  assert(Math.hypot(d.center[0]-reference[0],d.center[2]-reference[1])<4.4,'Field hut cannot move to a different parcel');
  // These extents and linear color averages come from the shipped 1602
  // geometry, not an artist-camera screenshot. Buried stilt lengths may
  // change to meet the soil; the visible roof, crown height and XZ extents
  // must not grow and the field house must not be lit brighter as a cue.
  const original=i===0?[3.568932,3.558601,1.40640,.20015]:[2.649521,2.999069,1.31850,.21459];
  const shape=new T.Box3();let luma=0;
  for(let j=d.begin;j<d.end;j++){shape.expandByPoint(v(j));luma+=.2126*color.getX(j)+.7152*color.getY(j)+.0722*color.getZ(j);}
  const size=shape.getSize(new T.Vector3()),height=shape.max.y-d.center[1];
  assert(Math.abs(size.x-original[0])<.001&&Math.abs(size.z-original[1])<.001&&Math.abs(height-original[2])<.001,'Field hut footprint or crown changed');
  assert(luma/(d.end-d.begin)<original[3],'Do not raise the material luminance of the distant field house');
  assert(Math.abs((s.x+1)*960-fixed[i][0])<32&&(1-s.y)*540-fixed[i][1]>7&&(1-s.y)*540-fixed[i][1]<26,'House departed the original level bench: '+[(s.x+1)*960,(1-s.y)*540]);
  ray.set(bankEye,roof.clone().sub(bankEye).normalize());
  assert(!ray.intersectObjects([hill,other]).some(h=>h.distance<roof.distanceTo(bankEye)-.3),'Bank roof occluded');
}
// Survey actual land color, including the small modeled field/trail pieces.
const atSoil=(x,z)=>{
  ray.set(new T.Vector3(x,70,z),new T.Vector3(0,-1,0));
  const hit=ray.intersectObject(hill)[0],weights=hit.barycoord.toArray(),ink=new T.Color(0,0,0);
  weights.forEach((w,k)=>ink.add(new T.Color().fromBufferAttribute(color,hit.faceIndex*3+k).multiplyScalar(w)));
  return ink;
};
const light=c=>.24*c.r+.61*c.g+.15*c.b;
const reliefInk=[[-31,85],[-26,85],[-24,85],[-18,84],[-14,84],[-8,85]].map(([x,z])=>atSoil(x,z));
// The mineral planes now share the river's olive light. Pigment contrast,
// hue and separation from the foreground are tested in check-terrace-pigment.mjs.
for(let i=g.userData.groundVertices;i<dwellings[0].begin;i+=3){
  const base=atSoil(p.getX(i),p.getZ(i)),top=new T.Color().fromBufferAttribute(color,i);
  assert(Math.abs(top.r/top.g-base.r/base.g)<.004&&Math.abs(top.b/top.g-base.b/base.g)<.004,'Detached jade switchback crossing the face');
  assert(Math.abs(light(top)/light(base)-1)<.07,'Path or field lip reads as a stripe');
}
Object.assign(report,{fieldShoulderValues:reliefInk.map(c=>+light(c).toFixed(3)),fixedBankRoofs:fixed});
// These are readbacks of the stock gameplay camera, in the retained 1582
// spawn and W-only drive receipts. A made-up bank composition does not pass.
// Keep the longhouse OUT of the tree/smoke mass, reticle, sun and HUD.
const stockFrames=[
  ['campaign-spawn',[-2.949996,3.120013,-16.849945],[.01025462,.98886985,.08193138,-.123768]],
  ['campaign-roadside',[-3.002894,3.096330,-6.431822],[.01009657,.98894446,.08040283,-.12418655]],
  ['campaign-bridge-center',[-3.34999998,4.240370,11.093214],[.00906039,.98935591,.07063962,-.12689694]],
];
// Native 1606 approach still, SHA e51a772f…; measure the skyline of the
// actual triangles above the longhouse bluff. The old square tip was at
// (1456,192) and its deep V at (1492,237); the erosion starts before the
// first point and the rubble fan eases the second back into the next ridge.
{
  const approach=new T.PerspectiveCamera(60,16/9,.1,340);
  approach.position.fromArray([-3.3480067565417992,2.9407340680991845,1.8878073480919804]);
  approach.quaternion.fromArray([.006713973371755671,.9921110384361618,.0609049465097787,-.10936725956759175]);
  approach.updateMatrixWorld();
  const crest=(px)=>{
    for(let py=180;py<254;py+=.5){
      ray.setFromCamera(new T.Vector2(px/960-1,1-py/540),approach);
      if(ray.intersectObject(hill).length)return py;
    }
    throw Error('No visible bluff on approach at '+px);
  };
  const xs=[1424,1440,1456,1472,1492],ys=xs.map(crest);
  assert(ys[0]<ys[1]&&ys[1]<ys[2]-4&&ys[2]>=204&&ys[2]<=215&&ys[3]>ys[2]+4&&
    ys[4]>=ys[3]&&ys[4]<229&&ys[4]-ys[2]<23,'Longhouse pad ends in a pointed slab or deep V: '+ys);
  report.approachShoulder=xs.map((x,i)=>[x,ys[i]]);
}
report.stockLonghouse={};
for(const [key,pos,rot] of stockFrames){
  const cam=new T.PerspectiveCamera(60,16/9,.1,340);cam.position.fromArray(pos);cam.quaternion.fromArray(rot);cam.updateMatrixWorld();
  const project=q=>{const s=q.clone().project(cam);return [(1+s.x)*960,(1-s.y)*540];};
  const pixels=Array.from({length:hero.end-hero.begin},(_,i)=>project(v(hero.begin+i))),
    xs=pixels.map(c=>c[0]),ys=pixels.map(c=>c[1]),l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys);
  const peak=new T.Vector3(...hero.roofPeak),floor=new T.Vector3(...hero.center);
  assert(l>1300&&r<1615&&t>55&&b<231, key+' violates the retained clear aperture: '+[l,t,r,b]);
  const min=key==='campaign-spawn'?34:key==='campaign-roadside'?38:49,max=key==='campaign-spawn'?50:key==='campaign-roadside'?57:70;
  assert(r-l>=min&&r-l<=max&&b-t>16&&b-t<44,key+' wrong distant house dimensions: '+[r-l,b-t]);
  for(const target of [peak,floor.clone().add(new T.Vector3(0,.46,-1.03))]){
    ray.set(cam.position,target.clone().sub(cam.position).normalize());
    assert(!ray.intersectObjects([hill,other]).some(h=>h.distance<target.distanceTo(cam.position)-.4),key+' longhouse occluded');
  }
  if(key==='campaign-spawn'){
    const terrainAt=(px,py)=>{
      const d=new T.Vector3(px/960-1,1-py/540,.5).unproject(cam).sub(cam.position).normalize();
      ray.set(cam.position,d);return ray.intersectObject(hill).some(hit=>hit.distance<175);
    };
    for(const [x,y] of [[1470,222],[1511,229],[1581,240],[1635,255]]){
      assert(terrainAt(x,y)&&!terrainAt(x,y-55),'Shoulder falls behind the stock canopy or blocks the high skyline at '+[x,y]);
    }
  }
  assert(hero.footings.every(q=>floor.y-q[1]>.37&&floor.y-q[1]<.64),'Short or unsupported far longhouse stilts');
  report.stockLonghouse[key]={bounds:[l,t,r,b].map(Math.round),roof:project(peak).map(Math.round),footings:hero.footings.length};
}
// The canonical dry-bank opening can be overridden when comparing approaches.
const eye=new T.Vector3(...(process.env.TERRACE_EYE??'-20.52,2.95,3.41').split(',').map(Number)),
  at=new T.Vector3(...(process.env.TERRACE_AIM??'-12.86,1.82,5.16').split(',').map(Number));
const camera=new T.PerspectiveCamera(60,16/9,.1,340);camera.position.copy(eye);camera.lookAt(at);camera.updateMatrixWorld();
const screen=q=>{const z=q.clone().project(camera);return [(1+z.x)*960,(1-z.y)*540];};
for(const d of fields){
  const roof=new T.Vector3(...d.roofPeak),dir=roof.clone().sub(eye),range=dir.length();
  ray.set(eye,dir.normalize());const obstacles=ray.intersectObjects([hill,other]).filter(h=>h.distance<range-.4);
  assert(!obstacles.length,'House hidden behind its own spur or existing physical foothills');
  const coords=Array.from({length:d.end-d.begin},(_,i)=>screen(v(d.begin+i))),[x,y]=screen(roof),
    w=Math.max(...coords.map(c=>c[0]))-Math.min(...coords.map(c=>c[0])),
    h=Math.max(...coords.map(c=>c[1]))-Math.min(...coords.map(c=>c[1]));
  assert(x>160&&x<1820&&y>50&&y<840&&w>18&&w<35&&h>10&&h<31,'Cottage is offscreen, oversized or illegible in the approach projection: '+[x,y,w,h]);
  const legRise=d.footings.map(a=>+(d.center[1]-a[1]).toFixed(2));
  assert(legRise.every(n=>n>=.24&&n<=.86),'Dwelling spans a riser or floats above its own shelf: '+JSON.stringify([d.center,legRise]));
  report.homes.push({center:d.center,roof:[+x.toFixed(1),+y.toFixed(1)],width:+w.toFixed(1),height:+h.toFixed(1),legRise});
  // The first intersection with the square arena perimeter gives an honest
  // proxy for canopy clearance; it is not a rendered-frame visibility claim.
  const travel=roof.clone().sub(eye),exit=Math.min(...['x','z'].map(k=>((travel[k]>0?64:-64)-eye[k])/travel[k]));
  report.roofCoverage.push(+eye.clone().lerp(roof,exit).y.toFixed(2));
}
const burns=g.userData.roofBurns;
assert.equal(burns.length,3);
const {roofFuelPockets}=await component('RidgeThatchFires');
for(const [i,site] of burns.entries()){
  const d=dwellings[i],house=g.clone();house.setDrawRange(d.begin,d.end-d.begin);
  const roofing=new T.Mesh(house,mat);
  const pockets=roofFuelPockets(site);
  assert.equal(pockets.length,2);
  for(const [index,p] of [site.breach,site.eave].entries()){
    assert.ok(new T.Vector3(...pockets[index].position).multiplyScalar(site.size)
      .add(new T.Vector3(...site.breach)).distanceTo(new T.Vector3(...p))<1e-6);
    ray.set(new T.Vector3(p[0],60,p[2]),new T.Vector3(0,-1,0));
    const hit=ray.intersectObject(roofing)[0];
    assert(hit&&Math.abs(hit.point.y-p[1]-.055)<.01&&p[1]>d.center[1]+.4,'Fire must emerge through actual thatch, not hover above the house.');
  }
  house.dispose();
}

console.log(JSON.stringify({...report,firePockets:burns.length*2,smokeColumns:burns.length,terraceLevels:plateaus.size,bedArea:Math.round(bedArea),riserArea:Math.round(riserArea),eye:eye.toArray(),at:at.toArray()},null,2));
if(process.argv[2]==='--study'){
  const sharp=createRequire(import.meta.url)('sharp'),lines=[],allPoints=g.attributes.position.count;
  assert(process.argv[3]);
  for(let i=0;i<allPoints;i+=3){
    const a=v(i),b=v(i+1),c=v(i+2),points=[a,b,c].map(screen).map(s=>s.map(k=>(k*.625).toFixed(2)).join(',')).join(' ');
    const ink=new T.Color().fromBufferAttribute(color,i).lerp(new T.Color().fromBufferAttribute(color,i+1),.3);
    lines.push({depth:a.add(b).add(c).divideScalar(3).distanceTo(eye),svg:'<polygon points="'+points+'" fill="#'+ink.getHexString()+'"/>'});
  }
  const svg='<svg width="1200" height="675" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#9899a4"/>'+
    lines.sort((a,b)=>b.depth-a.depth).map(l=>l.svg).join('')+'<text x="25" y="640" fill="white" font-size="18">CPU composition study · terraces and dwellings only · NOT a game frame</text></svg>';
  await sharp(Buffer.from(svg)).png().toFile(process.argv[3]);
}
