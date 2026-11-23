import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import * as T from 'three';

async function load(file) {
  const r=await build({configFile:false,logLevel:'silent',publicDir:false,build:{
    ssr:fileURLToPath(new URL('../src/components/Scene/'+file,import.meta.url)),write:false,minify:false,
  }});
  const s=r.output.find(o=>o.type==='chunk'&&o.isEntry).code.replace(/from "([^"]+)"/g,(_,p)=>'from '+JSON.stringify(import.meta.resolve(p)));
  return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
}
const model=await load('tankGeometry.ts'),art=await load('tankTextile.ts');
const cloth=new T.Mesh(model.createTankCanvasGeometry()), fittings=new T.Mesh(model.createTankTurretFittingsGeometry()),
  casting=new T.Mesh(model.createTankTurretGeometry()), hullGear=new T.Mesh(model.createTankHardwareGeometry());
casting.position.set(0,.02,-.05);casting.updateMatrixWorld();
const {scale,offset}=model.TANK_BUSTLE_MOUNT;
const onRail=(...xyz)=>xyz.map((v,i)=>v*scale[i]+offset[i]);
const cast=new T.Raycaster();
function ray(mesh,origin,direction,far=Infinity) {
  cast.set(new T.Vector3(...origin),new T.Vector3(...direction));cast.far=far;
  return cast.intersectObject(mesh)[0];
}
for(const side of [-1,1]){
  const depths=[];
  for(const dy of [.015,.056,.08])for(const dz of [.018,.055,.075]){
    const hit=ray(cloth,onRail(side*.54,.300+dy,.863+dz),[-side,0,0],.135*scale[0]);
    assert.ok(hit&&hit.face.normal.x*side>.12,'Both actual rolled end faces must face the camera');
    depths.push((hit.point.x-offset[0])/scale[0]*side);
  }
  assert.ok(Math.max(...depths)-Math.min(...depths)>.012,'The rolled cloth lips cannot be a flat disk or decal');
  for(const [z,y] of [[-.35,.293],[.24,.282]]){
    assert.ok(ray(fittings,[side*.55,y+.067,z],[-side,0,0],.13),'Cast lifting arch needs a crown');
    assert.ok(!ray(fittings,[side*.55,y+.036,z],[-side,0,0],.13),'There must be daylight beneath each actual arch');
  }
}
const roof=cloth.geometry.getAttribute('position'), rollBox=new T.Box3();
for(let i=0;i<roof.count;i++)if(roof.getZ(i)>.65)rollBox.expandByPoint(new T.Vector3().fromBufferAttribute(roof,i));
assert.ok(rollBox.max.x<0 && rollBox.max.x-rollBox.min.x<.55,'Aft roll cannot span the turret or cross its centre');
assert.ok(casting.geometry.boundingBox.max.y+casting.position.y-rollBox.max.y>.086,'Exposed cast brow must clear the highest fold');
const cupolaSeat=ray(casting,[-.17,1,.12],[0,-1,0]);
assert.ok(cupolaSeat && cupolaSeat.point.y<.423,'Cast dome must not obscure the crew-station roof seat');
// Project the assembled visible surfaces, not just their bounding boxes. The
// two real fuel-cell cylinders can also occlude the casting, so count them.
const cells=[-.43,.43].map(x=>{
  const mesh=new T.Mesh(new T.CylinderGeometry(.14,.14,.56,10));
  mesh.rotation.x=Math.PI/2;mesh.position.set(x,.05,.48);mesh.updateMatrixWorld();return mesh;
});
const dominance=[];
for(const az of [-.65,0,.65]){
  const dir=new T.Vector3(Math.sin(az),-.46,-Math.cos(az)).normalize();
  const along=new T.Vector3(Math.cos(az),0,Math.sin(az));
  const up=new T.Vector3().crossVectors(along,dir).normalize();
  let metal=0,bag=0,occupied=0;
  for(let j=-5;j<=6;j++)for(let i=-13;i<=13;i++){
    const origin=new T.Vector3(0,.135,.27).addScaledVector(along,i*.041).addScaledVector(up,j*.048).addScaledVector(dir,-2);
    cast.set(origin,dir);cast.far=3;
    const hit=cast.intersectObjects([casting,cloth,fittings,...cells],false)[0];
    if(!hit)continue;
    occupied++;if(hit.object===casting)metal++;if(hit.object===cloth)bag++;
  }
  dominance.push([Math.round(metal/occupied*100),Math.round(bag/occupied*100)]);
  assert.ok(occupied>100 && metal/occupied>.73 && metal>bag*3,
    'Cast metal must be the main visible turret mass from rear and both quarters: '+JSON.stringify({az,metal,bag,occupied}));
}
const caseLid=ray(hullGear,[.704,1,.862],[0,-1,0]);
const soft=ray(hullGear,[-.725,1,.813],[0,-1,0]);
const waist=ray(hullGear,[-.725,1,.813-.255*.496],[0,-1,0]);
assert.ok(caseLid&&caseLid.point.y>.622,'Closed field case needs a separate raised lid');
assert.ok(soft&&waist&&soft.point.y-waist.point.y>.009,'The lashed parcel must physically compress under the strap');
const tex=art.createTankSurfaceStudy();
assert.equal(tex.image.width,64);assert.equal(tex.image.height,64);
assert.ok(tex.generateMipmaps && tex.minFilter===T.LinearMipmapLinearFilter && tex.magFilter===T.NearestFilter);
for(const channel of [0,1,2]){
  const levels=new Set(tex.image.data.filter((_,i)=>i%4===channel));
  assert.ok(levels.size>=(channel===2?2:16),'Do not flatten warp, chipped paint or steel contact channels');
}
for(const m of [cloth,fittings,hullGear,casting,...cells]){m.geometry.dispose();m.material.dispose();}tex.dispose();
console.log('River tank art: cast/cloth coverage (%) '+JSON.stringify(dominance)+'; both sculpted cloth ends, four hollow eyes, asymmetric case/parcel and mipmapped surface study verified.');
