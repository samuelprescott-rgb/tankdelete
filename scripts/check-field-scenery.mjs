// Geometric regression for the stage art, independent of wave composition.
import assert from 'node:assert/strict';
import {build} from 'vite';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {checkFallFans} from './annex-fan-probes.mjs';
const dir=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),entry=dir+'/virtual-stage-art.mjs';
const bundle=await build({root:dir,configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},
  plugins:[{name:'stage-art',resolveId:id=>id===entry?id:null,load:id=>id===entry?
    ['components/Scene/buildingFireFoot','components/Scene/EmbassyDefense','components/Scene/StandingPixelFires','components/Scene/ruinedAnnex','components/Scene/ghostSignalArchive','components/Scene/annexFirelight','components/Scene/burningFuel','components/Scene/tunnelBrush','lib/embassyDefense','lib/campaignTunnels'].map(f=>'export * from "./src/'+f+'"').join(';'):null}],
  build:{ssr:entry,write:false}});
const src=bundle.output.find(c=>c.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {buildingFireFoot,createEmbassyBuildingGeometry,createAnnexBreakage,createGhostSignalArchive,EMBASSY_ARCHIVE_SLOTS,EMBASSY_BUILDING_OBSTACLES,
  pixelFlameScale,createAnnexFirelight,EMBASSY_FUEL_TEXTURE,FUEL_FRAME,buildTunnelBrush,hatchOpening,TUNNEL_WARNING}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
checkFallFans(createEmbassyBuildingGeometry,createAnnexBreakage,createGhostSignalArchive,EMBASSY_ARCHIVE_SLOTS,EMBASSY_BUILDING_OBSTACLES);
const material=new T.MeshBasicMaterial({side:T.DoubleSide}),down=new T.Vector3(0,-1,0);
const first=(obj,x,z)=>new T.Raycaster(new T.Vector3(x,9,z),down).intersectObject(obj,false)[0]?.point.y??0;
const annex=[];
for(const id of ['records','dispatch'])for(const offline of [false,true]){
  const g=createEmbassyBuildingGeometry(false,offline,id),mesh=new T.Mesh(g,material),s=id==='records'?1:-1;
  const world = new T.Matrix4().makeRotationY(.7).setPosition(8, 2, -12);
  const high = new T.Vector3(.8, 6, 3.4).applyMatrix4(world);
  const foot = buildingFireFoot(g, world, high);
  const low = high.clone(); low.y = 2.4;
  assert.ok(foot.distanceTo(buildingFireFoot(g, world, low)) < .00001, 'Ignition height moved the foot');
  assert.ok(Math.abs(foot.y - (2 + g.boundingBox.min.y)) < .00001);
  assert.ok(Math.hypot(foot.x - high.x, foot.z - high.z) > .01, 'Overhang should project onto a support');
  let roof=0,total=0;
  for(let x=-2.5;x<=2.5;x+=.25)for(let z=-1.8;z<=1.8;z+=.25){total++;roof+=first(mesh,x,z)>2.9?1:0;}
  const ratio=roof/total;
  assert.ok(ratio>.4&&ratio<.6,id+' shell needs a standing and a genuinely missing half: '+ratio);
  if(id==='records')assert.ok(first(mesh,s*1.7,-.5)>3.2&&first(mesh,-s*1.8,-.5)<1.45);
  else assert.ok(first(mesh,1.42,-.53)>6.05 && first(mesh,-1.03,-.53)<4.55 && first(mesh,-.29,.10)<3.4,
    'Dispatch now has a high outward sheet, a torn collapsing low end, and an open room between them');
  // The courtyard should see *through* the front of the burnt upper room to
  // its interior wall, with an actual thickness-bearing broken pier beside it.
  const face=(x,y)=>new T.Raycaster(new T.Vector3(s*x,y,5),new T.Vector3(0,0,-1))
    .intersectObject(mesh,false)[0]?.point.z??-Infinity;
  const interior=id==='records'?face(1.40,3.98):face(.17,3.91),pier=face(.66,3.84);
  assert.ok(interior<-.95&&interior>-1.5&&pier>1.1&&pier<1.5,id+' open room or torn pier was filled: '+[interior,pier]);
  // The new outer street facades must survive taking the associated file
  // offline. A pair of intact piers in front of *open* windows must not
  // regress to an isolated scaffolding rail or an opaque texture card.
  if(id==='records'){
    assert.ok(face(-2.40,4.67)>1.54&&face(-.95,4.67)>1.54&&face(-1.48,4.67)<.6,
      'Records: two tangible plaster piers with a recessed upper window between them');
    assert.ok(face(-1.22,4.06)>1.79&&face(-1.52,5.85)>1.57,'Records: retained street balcony and eave');
  }else{
    assert.ok(face(-2.39,4.69)>1.98&&face(-1.5,2.87)>1.99&&face(-1.2,4.19)<1.20,
      'Dispatch: the forward corner and torn story belt must frame a broken open bay');
  }
  const stair=first(mesh,s*.68,-1.44),end=first(mesh,s*2.44,-1.44);
  assert.ok(id==='records'?end>stair+.85:stair>end+.85,
    'Records retains its pitched end and Dispatch lost that corner: '+[stair,end]);
  assert.ok(g.boundingBox.max.y>5.9,'upper storey must break the old horizontal roof line');
  assert.ok(g.groups.length===0&&g.index.count/3<2900,'one bounded masonry draw');
  annex.push({id,offline,roofCoverage:+ratio.toFixed(2),height:+g.boundingBox.max.y.toFixed(2),
    visibleRoomDepth:+(pier-interior).toFixed(2),rearHeights:[stair,end].map(n=>+n.toFixed(2)),
    masonryTriangles:g.index.count/3});g.dispose();
}
// The riverbank and ridge fires still use the painted fuel sheet.
const {width,height,columns,rows}=FUEL_FRAME;
const sheet=execFileSync('ffmpeg',['-v','error','-i',dir+'/public'+EMBASSY_FUEL_TEXTURE,'-frames:v','1','-pix_fmt','rgba','-f','rawvideo','pipe:1']);
assert.equal(sheet.length,width*height*rows*columns*4);
function pigment(u,v,frame){
  const x=(frame%columns)*width+T.MathUtils.clamp(Math.floor(u*width),0,width-1);
  const y=Math.floor(frame/columns)*height+height-1-T.MathUtils.clamp(Math.floor(v*height),0,height-1);
  const k=(y*columns*width+x)*4;
  return sheet[k+3]<4?0:sheet[k+3]<105?1:sheet[k+1]<190?2:3;
}
const poses=new Set();
for(let frame=0;frame<rows*columns;frame++){
  const colors=[0,0,0,0],mask=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const value=pigment((x+.5)/width,(y+.5)/height,frame);
    colors[value]++;mask.push(value);
    if(y===height-1||x===0||x===width-1)assert.equal(value,0,'no clipped atlas edge');
  }
  assert.ok(colors.every(n=>n>150),'every pose carries open air, translucent wisps, orange and a hot core');
  poses.add(mask.join(''));
}
assert.equal(poses.size,32);
const {pockets, interiorGeometry, interiorMaterial} = createAnnexFirelight();
assert.deepEqual(pockets.map(p => p.id), ['courtyard','dispatch-lower','dispatch-upper']);
assert.ok(pockets[0].position[0] > 2 && pockets[0].position[0] < 7);
assert.ok(pockets.slice(1).every(p => p.position[0] > 7), 'Dispatch burns on both floors; Records has lamplight');
const fires = pockets.map(p => p.position[1] + pixelFlameScale(p.size)[1]);
assert.ok(pockets[1].position[1] < .5 && fires[1] > 1.42 && pockets[2].position[1] > 3 && fires[2] > 4.25);
assert.ok(!interiorMaterial.transparent);
const firelightTriangles = interiorGeometry.attributes.position.count / 3;

// Sample the actual napalm volume through the surviving upper Dispatch window
// from the chase camera. Stop each ray at the nearest painted interior or wall.
const cam = new T.PerspectiveCamera(60,16/9,.1,340);
cam.position.set(6.228966,3.80,-2.889663);
cam.quaternion.set(-.0687765,.1612382,.0112645,.9844517).normalize(); cam.updateMatrixWorld();
const dispatch = EMBASSY_ARCHIVE_SLOTS.find(s => s.id === 'dispatch');
const shell = new T.Mesh(createEmbassyBuildingGeometry(false,false,'dispatch'),material);
shell.position.fromArray(dispatch.position); shell.updateMatrixWorld();
const interior = new T.Mesh(interiorGeometry,interiorMaterial);
const upper = pockets[2], size = new T.Vector3(...pixelFlameScale(upper.size));
const min = new T.Vector3(...upper.position).add(new T.Vector3(-size.x/2,0,-size.z/2));
const bounds = new T.Box3(min,min.clone().add(size)), screen = new T.Box2();
for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const q = new T.Vector3(x,y,z).project(cam);
  screen.expandByPoint(new T.Vector2((1+q.x)*960,(1-q.y)*540));
}
const voxels = execFileSync('ffmpeg',['-v','error','-i',dir+'/public/images/textures/field-fire-flame.png',
  '-frames:v','1','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:8*1024*1024});
const ray = new T.Raycaster(), entryPoint = new T.Vector3(), samplePoint = new T.Vector3(), cell = new T.Vector3();
const visible = [0,0,0,0];
for(let y=Math.ceil(screen.min.y);y<screen.max.y;y+=3)for(let x=Math.ceil(screen.min.x);x<screen.max.x;x+=3){
  ray.setFromCamera(new T.Vector2(x/960-1,1-y/540),cam);
  if(!ray.ray.intersectBox(bounds,entryPoint))continue;
  const wall = ray.intersectObjects([interior,shell],false)[0]?.distance ?? Infinity;
  let pigment = 0;
  for(let d=entryPoint.distanceTo(cam.position)+.001;d<wall;d+=.025){
    ray.ray.at(d,samplePoint); if(!bounds.containsPoint(samplePoint))break;
    cell.copy(samplePoint).sub(min).divide(size);
    // Upper Dispatch is the third instance, seven animation frames apart.
    const row=14*56+55-Math.floor(cell.y*56);
    const at=4*(row*44*24+Math.floor(cell.z*24)*44+Math.floor(cell.x*44));
    if(voxels[at+3])pigment=Math.max(pigment,voxels[at+3]<105?1:voxels[at+1]<190?2:3);
  }
  visible[pigment]++;
}
assert.ok(visible.every(n=>n>2),'Dispatch window must expose open air, wisps, amber and hot cores: '+visible);
shell.geometry.dispose(); interiorGeometry.dispose(); interiorMaterial.dispose();
const {cover,earth}=buildTunnelBrush(),lid=new T.Mesh(cover,material),bank=new T.Mesh(earth,material);
lid.position.set(0,.13,-.89);
const sample=age=>{lid.rotation.x=hatchOpening(age,TUNNEL_WARNING);lid.updateMatrixWorld();return first(lid,0,0);};
const closed=sample(0),open=sample(TUNNEL_WARNING);
assert.ok(closed>.38&&open===0&&first(bank,0,0)<.03,'the canopy must physically uncover the shaft: '+[closed,open,first(bank,0,0)]);
const terrain=cover.getAttribute('color');let green=0,bamboo=0;
for(let i=0;i<terrain.count;i++){const r=terrain.getX(i),g=terrain.getY(i),b=terrain.getZ(i);
  if(g>r*1.38&&g>b*1.38)green++;if(r>g&&g>b*1.8)bamboo++;}
assert.ok(green>1300&&bamboo>800,'foliage AND a contrasting woven bed');
assert.ok(cover.getAttribute('position').count/3<4200,'one bounded moving batch');
console.log(JSON.stringify({annex,fireTipHeights:fires,firelightTriangles,closedCrown:closed,openShaft:open,angle:lid.rotation.x,
  brushTriangles:terrain.count/3,greenVertices:green,bambooVertices:bamboo}));
cover.dispose();earth.dispose();material.dispose();
