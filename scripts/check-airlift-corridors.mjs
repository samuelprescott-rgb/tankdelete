// Production mesh clearance, not a pad-center distance assertion. No WebGL,
// filesystem gameplay, or test-only world edits: sample both authored flights.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import * as T from 'three';
import {stationMin,stationMax,stationPivot,stationReach,trayMin,trayMax} from './transport-station-bounds.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const entry=root+'/virtual-airlift-clearance.mjs';
const modules=['lib/campaignFlights','lib/embassyLift','lib/layout','lib/scale','lib/embassyDefense','lib/terrain','lib/combat','lib/ghostSignal','lib/infantryMetrics',
  'components/Scene/embassyGroundworks','components/Scene/embassyCheckpoint','components/Scene/EmbassyDefense',
  'components/Scene/embassyColors','components/Scene/ghostSignalArchive','components/Scene/embassyNeon',
  'components/Scene/FileBlocks','components/Scene/hueyGeometry'];
const buildResult=await build({root,configFile:false,publicDir:false,logLevel:'silent',
  plugins:[{name:'corridors',resolveId(id){if(id===entry)return id;},load(id){if(id===entry)return modules
    .map(m=>'export * from '+JSON.stringify(root+'/src/'+m)+';').join('\n');}}],
  esbuild:{jsx:'automatic'},build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
const source=buildResult.output.find(x=>x.type==='chunk'&&x.isEntry).code.replace(/from "([^"]+)"/g,(_,s)=>'from '+JSON.stringify(import.meta.resolve(s)));
const game=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),box=(lo,hi)=>new T.Box3(vec(...lo),vec(...hi));
function visitFaces(g,fn){
  const p=g.getAttribute('position'),n=g.index?.count??p.count;
  for(let i=0;i<n;i+=3)fn(...[0,1,2].map(k=>vec().fromBufferAttribute(p,g.index?g.index.getX(i+k):i+k)));
}
const parts=game.createHueyAirframeGeometries(false,true),segments=new Map(),air=[];
for(const id of ['body','dark','glass'])visitFaces(parts[id],(a,b,c)=>{
  // Every triangle wholly inside its test envelope. Binning by position
  // keeps tall tail details from incorrectly extending down to the skids.
  const key=[id,Math.floor((a.z+b.z+c.z)/3/.48),Math.floor((a.y+b.y+c.y)/3/.48)].join(':');
  if(!segments.has(key))segments.set(key,new T.Box3());
  segments.get(key).expandByPoint(a).expandByPoint(b).expandByPoint(c);
});
for(const b of segments.values())air.push(b.expandByScalar(.065));
// Enclose the *entire* spinning rotor disk, not just blades at sampled angles.
const rotor=game.HUEY_ANCHORS,R=rotor.mainRotorDiameter/2+.12,bladeSubdivisions=new Map();
for(let i=0;i<16;i++){
  const lo=-R+2*R*i/16,hi=lo+2*R/16,nearest=Math.max(0,lo,-hi);
  const dz=Math.sqrt(R*R-nearest*nearest);
  const parent=box([lo,rotor.mainRotor[1]-.13,-dz],[hi,rotor.mainRotor[1]+.19,dz]);
  air.push(parent);
  // A thin vertical pole can occupy the empty corner of a broad strip.
  // Each refined strip still encloses every blade angle plus the same
  // 12 cm margin, including both ends of that strip; never sample a blade.
  bladeSubdivisions.set(parent,Array.from({length:16},(_,j)=>{
    const a=lo+(hi-lo)*j/16,b=lo+(hi-lo)*(j+1)/16,near=Math.max(0,a,-b),d=Math.sqrt(Math.max(0,R*R-near*near));
    return box([a,parent.min.y,-d],[b,parent.max.y,d]);
  }));
}
const [tx,ty,tz]=rotor.tailRotor,r=rotor.tailRotorDiameter/2+.12;
air.push(box([tx-.15,ty-r,tz-r],[tx+.15,ty+r,tz+r]));
// Encloses the fully animated near-side gunner and his short projector cue.
const starboardCrew=box([.48,-1.05,-1.48],[2.47,.74,.58]),portCrew=box([-2.47,-1.05,-1.48],[-.48,.74,.58]);
// The gunner sits OPPOSITE the passenger door. Keep the original outer
// doorway exclusions as well as the true station on the other flank.
air.push(box([-.91,-.445,-.66],[.91,.62,1.04]));
function station(side){
  const mirror=(lo,hi)=>side===1?box(lo,hi):box([-hi[0],lo[1],lo[2]],[-lo[0],hi[1],hi[2]]);
  const hull=[mirror(trayMin,trayMax)],[cx,cz]=stationPivot;
  for(let i=0;i<16;i++){
    const a=stationMin[0]+i*(stationMax[0]-stationMin[0])/16,b=a+(stationMax[0]-stationMin[0])/16;
    const near=Math.max(0,a-cx,cx-b),d=Math.sqrt(Math.max(0,stationReach**2-near**2));
    hull.push(mirror([a,stationMin[1],Math.max(stationMin[2],cz-d)],[b,stationMax[1],Math.min(stationMax[2],cz+d)]));
  }return hull;
}
const nightAir=[...air,portCrew,...station(1)];
const dayAir=[...air,starboardCrew,...station(-1)];
const flightRadius=Math.max(...[...nightAir,...dayAir].map(b=>Math.hypot(
  Math.max(Math.abs(b.min.x),Math.abs(b.max.x)),Math.max(Math.abs(b.min.y),Math.abs(b.max.y)),
  Math.max(Math.abs(b.min.z),Math.abs(b.max.z)))))+.001;

const assets=[];
const westPostRegion=box([-7.46,-.01,-14.17],[-6.70,2.03,-13.41]);
function addGeometry(label,g,offset=[0,0,0]){
  const v=vec(...offset);
  visitFaces(g,(a,b,c)=>{
    a.add(v);b.add(v);c.add(v);
    const tri=new T.Triangle(a,b,c),bounds=new T.Box3().setFromPoints([a,b,c]);
    assets.push({label:label==='compound walls'&&westPostRegion.containsBox(bounds)?'western gatepost':label,tri,bounds});
  });
}
for(const [key,g] of Object.entries(game.createEmbassyCheckpoint()))addGeometry(key,g);
addGeometry('compound walls',game.createEmbassyGroundworks().walls);
for(const slot of game.EMBASSY_ARCHIVE_SLOTS){
  addGeometry(slot.id,game.createEmbassyBuildingGeometry(slot.id==='chancery',false,slot.id),slot.position);
  addGeometry(slot.id+' archive signal',game.createGhostSignalArchive(slot.id),slot.position);
  if(slot.id==='chancery')addGeometry('chancery sign',game.createEmbassyNeon(),slot.position);
}
const colors=game.createEmbassyColors();
addGeometry('embassy flagstaff',colors.pole);
// Enclose the real sewn silhouette plus its maximum shader-driven sway.
colors.cloth.computeBoundingBox();
const flagBounds=colors.cloth.boundingBox.clone();flagBounds.min.z-=.152;flagBounds.max.z+=.152;
addGeometry('embassy colors',new T.BoxGeometry(...flagBounds.getSize(vec()).toArray()).translate(...flagBounds.getCenter(vec()).toArray()));
// Ground-level crate stack: conservative envelope of both available models.
const crates=box([7.30,0,-7.16],[8.98,1.29,-6.07]);
const gCrate=new T.BoxGeometry(...crates.getSize(vec()).toArray()).translate(...crates.getCenter(vec()).toArray());
addGeometry('supply crates',gCrate);
const fieldProps=assets.filter(a=>a.label==='supply crates');
const nightStructure=assets.slice();
function coverFor(offset){
  const geo=(bounds)=>new T.BoxGeometry(...bounds.getSize(vec()).toArray()).translate(...bounds.getCenter(vec()).toArray());
  const count=assets.length;
  for(const cover of game.getUSFightingPositions(offset)){
    const [x,,z]=cover.position;
    addGeometry('friendly cover '+cover.id,geo(box([-cover.width*.5-.12,0,-.30],[cover.width*.5+.12,.60,.30]))
      .rotateY(cover.rotation),[x,0,z]);
  }
  addGeometry('western sandbags',geo(box([-2.17,0,-.23],[2.17,.35,.23])).rotateY(.28),[-7.4,0,-8]);
  for(const [x,z] of [[-9,-3],[9.6,-1],[-11,6]])addGeometry('field drum',geo(box([x-.35,0,z-.35],[x+.35,.94,z+.35])));
  return assets.splice(count);
}
const dayProp=[...fieldProps,...coverFor(0)],nightProp=[...nightStructure,...coverFor(game.EMBASSY_DEFENSE_OFFSET_Z)];
const size=game.fileToScale(1e15);
let hutR=0,hutTop=0;
for(let variant=0;variant<4;variant++)for(const category of ['document','image','video','other']){
  // File category supplies color; expand the largest projected roof radius
  // for ALL azimuths, plot jitter (+/-.12) and the full maximum file scale.
  const p=game.createStructureGeometry(category,variant).getAttribute('position');
  for(let i=0;i<p.count;i++){
    hutR=Math.max(hutR,Math.hypot(p.getX(i),p.getZ(i))*size+.18);
    hutTop=Math.max(hutTop,p.getY(i)*size+.5);
  }
}
const huts=[];
for(const z of [12,20,28,36,44,52,-28,-36,-44,-52])for(const col of game.VILLAGE_COLUMN_ORDER)
  for(const p of game.villageParcelPlots((col+.5)*8,z))huts.push(box([p.x-hutR,-.2,p.z-hutR],[p.x+hutR,hutTop,p.z+hutR]));
const mat=new T.Matrix4(),inverse=new T.Matrix4(),q=new T.Quaternion(),ang=new T.Euler(),one=vec(1,1,1);
const sceneBox=new T.Box3(),localTri=new T.Triangle();
function clear(label,pose,seconds,structures=label==='night'?nightProp:dayProp){
  let samples=0,triangleTests=0,boxesTested=0;
  const envelopes=label==='night'?nightAir:dayAir;
  for(let i=0;i<seconds*60;i++){
    const time=i/60,p=pose(time);if(!p.visible)continue;
    const center=vec(p.x,p.y,p.z);
    const localStructures=structures.filter(s=>s.bounds.distanceToPoint(center)<flightRadius);
    const localHuts=label==='day'?huts.filter(h=>h.distanceToPoint(center)<flightRadius):[];
    mat.compose(center,q.setFromEuler(ang.set(p.pitch,p.yaw,p.roll,'YXZ')),one);inverse.copy(mat).invert();
    for(const b of envelopes){
      sceneBox.copy(b).applyMatrix4(mat);
      boxesTested+=localHuts.length+localStructures.length;
      for(const h of localHuts){const center=h.getCenter(vec());
        const gap=Math.hypot(Math.max(sceneBox.min.x-center.x,center.x-sceneBox.max.x,0),
          Math.max(sceneBox.min.z-center.z,center.z-sceneBox.max.z,0));
        assert.ok(!sceneBox.intersectsBox(h)||gap>hutR,label+' intersects max-scale village envelope at '+time+
        ' centre '+h.getCenter(vec()).toArray()+' radius '+hutR+' air '+sceneBox.min.toArray()+' to '+sceneBox.max.toArray());
      }
      for(const s of localStructures)if(sceneBox.intersectsBox(s.bounds)){
        localTri.copy(s.tri);localTri.a.applyMatrix4(inverse);localTri.b.applyMatrix4(inverse);localTri.c.applyMatrix4(inverse);
        triangleTests++;
        const detailed=s.label.startsWith('embassy flag')||s.label==='embassy colors'?bladeSubdivisions.get(b):undefined;
        assert.ok(!(detailed?detailed.some(part=>part.intersectsTriangle(localTri)):b.intersectsTriangle(localTri)),label+' intersects '+s.label+' at '+time.toFixed(3)
          +' (airframe-local envelope '+b.min.toArray().map(v=>v.toFixed(2))+' to '+b.max.toArray().map(v=>v.toFixed(2))+')');
      }
    }
    samples++;
  }
  return {samples,boxesTested,triangleTests};
}
const results={day:clear('day',game.transportPose,game.DAY_OUT),night:clear('night',game.embassyTransportPose,game.LIFT_END)};
// The default player and art-practice cameras differ substantially at night.
// Ignore points beyond the eye, but never allow either transport to sweep
// through the middle while in front. The separate ridge crash intentionally does.
function lens(eye,aim){
  const c=new T.PerspectiveCamera(60,16/9,.1,340);
  c.position.copy(eye);c.lookAt(aim);c.updateMatrixWorld();return c;
}
const nightLens=(spawn,yaw)=>{const turn=v=>v.applyAxisAngle(vec(0,1,0),yaw).add(vec(...spawn));
  return lens(turn(vec(2.05,3.8,6.14)),turn(vec(1.12,2.75,-1.28)));};
const cameras={day:lens(vec(-2.95,3.12,-16.85),vec(-1.03,1.82,-9.3)),
  guard:nightLens(game.EMBASSY_GUARD_POSITION,game.EMBASSY_GUARD_YAW),practice:nightLens(game.GHOST_EMBASSY_START,game.GHOST_EMBASSY_YAW)};
const side={};
for(const [view,camera] of Object.entries(cameras)){
  const day=view==='day',pose=day?game.transportPose:game.embassyTransportPose,sign=day?1:-1;
  let nearest=Infinity;
  for(let i=0;i<60*(day?game.DAY_OUT:game.LIFT_END);i++){
    const p=pose(i/60),v=vec(p.x,p.y,p.z).project(camera);
    if(p.visible&&v.z>0&&v.z<1&&Math.abs(v.y)<1)nearest=Math.min(nearest,sign*v.x);
  }
  const width=Math.min(...(day?game.DAY_CREW:game.LIFT_TEAM).map(s=>sign*vec(...s.post).project(camera).x));
  const sill=sign*vec(...(day?game.DAY_DOOR:game.LIFT_DOOR)).project(camera).x;
  const parked=pose(day?game.DAY_FIRST_STEP:game.LIFT_START_DROP);
  mat.compose(vec(parked.x,parked.y,parked.z),q.setFromEuler(ang.set(0,parked.yaw,0)),one);
  let nearestCorner=Infinity;
  for(const b of (day?dayAir:nightAir))for(const x of [b.min.x,b.max.x])
    for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])
      nearestCorner=Math.min(nearestCorner,sign*vec(x,y,z).applyMatrix4(mat).project(camera).x);
  assert.ok(nearestCorner>(view==='practice'?.06:.18),view+' parked rotor or tail intrudes on aim line: '+nearestCorner);
  const min=view==='practice'?.28:.40;
  assert.ok(nearest>min&&width>min&&sill>min,view+' crosses chase middle: '+[nearest,width,sill]);
  side[view]={closestCenter:+nearest.toFixed(3),nearestPost:+width.toFixed(3),door:+sill.toFixed(3),airframeEdge:+nearestCorner.toFixed(3)};
}
// Make sure the checks would actually catch the original classes of defect:
// the hull is outside, but the rotor tip overlaps a maximum-scale side hut;
// then embed a transport in the embassy's real wall geometry.
const p=(x,y,z)=>()=>({x,y,z,yaw:0,pitch:0,roll:0,visible:true});
assert.throws(()=>clear('day',p(.45,1.10,7),.01),/intersects max-scale/);
assert.throws(()=>clear('night',p(14,.66,-28),.01),/intersects compound walls/);
const postTriangles=nightProp.filter(s=>s.label==='western gatepost'),flagTriangles=nightProp.filter(s=>s.label.startsWith('embassy '));
assert.ok(postTriangles.length>=48&&flagTriangles.length>100);
// Freeze the OLD path numerically: future choreography changes must never
// silently move these positive controls away from the reported defect.
const ease=x=>{const a=Math.min(1,Math.max(0,x));return a*a*(3-2*a);};
function oldRook(t){
  const track=ease(t/3.2),settle=ease((t-3)/2.75),climb=ease((t-15.6)/3),out=ease((t-17.85)/4.35);
  return {x:-4.42-(1-track)*16-out*20,y:1.105+(1-settle)*6.1+(1-track)*6.8+climb*7.9+out*8,z:-16.84-(1-track)*20-out*23,
    yaw:-.80-.50*(1-track)+out*.55,pitch:-.09*Math.sin(track*Math.PI)-.10*Math.sin(out*Math.PI),
    roll:.11*Math.sin(track*Math.PI)+.19*Math.sin(out*Math.PI),visible:t>=0&&t<22.2};
}
assert.throws(()=>clear('night',oldRook,5.1,postTriangles),/intersects western gatepost at 5\.067/);
assert.throws(()=>clear('night',oldRook,5.1,flagTriangles),/intersects embassy (colors|flagstaff)/);
const frameMatrix=(p)=>new T.Matrix4().compose(vec(p.x,p.y,p.z),q.setFromEuler(ang.set(p.pitch,p.yaw,p.roll,'YXZ')),one);
// The original warning was not just two generous boxes touching: intersect
// the authored boom/fin triangles with the actual concrete triangles.
function firstOldMeshContact(){
  const tail=[],bounds=new T.Box3(),a=new T.Triangle(),direction=vec(),hit=vec(),ray=new T.Ray();
  for(const part of ['body','dark'])visitFaces(parts[part],(u,v,w)=>{if(Math.min(u.z,v.z,w.z)>1.20)tail.push(new T.Triangle(u,v,w));});
  function edgesTouch(first,second){
    for(const [u,v] of [[first.a,first.b],[first.b,first.c],[first.c,first.a]]){
      direction.subVectors(v,u);const length=direction.length();if(length<1e-8)continue;
      ray.set(u,direction.multiplyScalar(1/length));
      if(ray.intersectTriangle(second.a,second.b,second.c,false,hit)&&u.distanceToSquared(hit)<=length*length+1e-9)return true;
    }return false;
  }
  for(let i=4*120;i<=6*120;i++){
    const m=frameMatrix(oldRook(i/120));
    for(const face of tail){
      a.copy(face);a.a.applyMatrix4(m);a.b.applyMatrix4(m);a.c.applyMatrix4(m);bounds.setFromPoints([a.a,a.b,a.c]);
      for(const s of postTriangles)if(bounds.intersectsBox(s.bounds)&&(edgesTouch(a,s.tri)||edgesTouch(s.tri,a)))return i/120;
    }
  }
  assert.fail('Original tail mesh should physically intersect the west gatepost');
}
const oldTailMeshAt=firstOldMeshContact();
function postClearance(){
  const answer={},expanded=new T.Box3(),world=new T.Box3(),limit=3;
  for(let i=0;i<game.LIFT_END*120;i++){
    const t=i/120,pose=game.embassyTransportPose(t),phase=t<game.LIFT_TOUCHDOWN?'descent':t<=game.LIFT_DEPART?'parked':'departure';
    let best=answer[phase]??{meters:limit,at:t};
    if(phase==='parked'&&i>Math.ceil(game.LIFT_TOUCHDOWN*120))continue;
    const matrix=frameMatrix(pose);inverse.copy(matrix).invert();
    for(const b of nightAir){
      world.copy(b).expandByScalar(best.meters).applyMatrix4(matrix);
      for(const s of postTriangles){
        if(!world.intersectsBox(s.bounds))continue;
        localTri.copy(s.tri);localTri.a.applyMatrix4(inverse);localTri.b.applyMatrix4(inverse);localTri.c.applyMatrix4(inverse);
        if(!expanded.copy(b).expandByScalar(best.meters).intersectsTriangle(localTri))continue;
        let lo=0,hi=best.meters;
        for(let k=0;k<15;k++){
          const mid=(lo+hi)/2;if(expanded.copy(b).expandByScalar(mid).intersectsTriangle(localTri))hi=mid;else lo=mid;
        }
        best={meters:lo,at:t};
      }
    }
    answer[phase]=best;
  }
  // This is a lower bound on Euclidean clearance: the grown boxes include
  // the round Minkowski padding, in addition to the existing mesh margins.
  for(const phase of Object.values(answer))assert.ok(phase.meters>.15,'west post margin '+JSON.stringify(answer));
  return Object.fromEntries(Object.entries(answer).map(([k,v])=>[k,{at:+v.at.toFixed(3),atLeastMeters:Math.floor(v.meters*1000)/1000}]));
}
const westernGatepost=postClearance();
for(const t of [game.LIFT_TOUCHDOWN,game.LIFT_DEPART]){
  const mid=game.embassyTransportPose(t),before=game.embassyTransportPose(t-.001),after=game.embassyTransportPose(t+.001);
  for(const axis of ['x','y','z','pitch','roll','yaw']){
    assert.ok(Math.max(Math.abs(mid[axis]-before[axis]),Math.abs(mid[axis]-after[axis]))/.001<.008,
      'Rook must settle and lift without a pose or velocity jump');
  }
}
for(const [label,pad,door,step,team,pose,start,depart] of [
  ['day',game.DAY_PAD,game.DAY_DOOR,game.DAY_STEP,game.DAY_CREW,game.transportPose,game.DAY_FIRST_STEP,game.DAY_AWAY],
  ['night',game.LIFT_PAD,game.LIFT_DOOR,game.LIFT_STEP,game.LIFT_TEAM,game.embassyTransportPose,game.LIFT_START_DROP,game.LIFT_DEPART]]){
  for(let t=start;t<depart;t+=.05){const p=pose(t);assert.ok(vec(p.x,p.y,p.z).distanceTo(vec(...pad))<1e-5);}
  for(const member of team){
    const feet=vec(...door),outside=vec(...step),post=vec(...member.post);
    for(let i=-40;i<=40;i++){
      const elapsed=(i+40)/40*game.LIFT_FOOTDOWN;
      const point=i<0?vec().lerpVectors(feet,outside,game.liftStepTravel(elapsed)):vec().lerpVectors(outside,post,i/40);
      if(i<0)point.y=game.liftBootHeight(elapsed,feet.y);
      const person=box([point.x-.28,point.y+.005,point.z-.28],
        [point.x+.28,point.y+game.INFANTRY_STANDING_HEIGHT*game.INFANTRY_WORLD_SCALE,point.z+.28]);
      const obstruction=(label==='night'?nightProp:dayProp).find(o=>person.intersectsBox(o.bounds)&&person.intersectsTriangle(o.tri));
      assert.ok(!obstruction,label+' '+member.id+' walked into '+obstruction?.label+' at '+point.toArray());
      assert.ok(point.y>=game.terrainReliefHeight(point.x,point.z),label+' feet below surface');
      if(label==='day')assert.ok(huts.every(h=>h.distanceToPoint(point)>.33),'walk crossed a roof');
    }
    assert.equal(game.liftBootHeight(0,feet.y),feet.y);
    assert.equal(game.liftBootHeight(game.LIFT_FOOTDOWN,feet.y),outside.y);
  }
}
console.log(JSON.stringify({frames:results,side,maximumVillageRoofRadius:+hutR.toFixed(2),worstCasePlots:huts.length,
  embassyTriangles:assets.length,fullRotorSweepDiameter:rotor.mainRotorDiameter,westernGatepost,
  oldTailMeshAt:+oldTailMeshAt.toFixed(3),verifiedPassengerRoutes:7,rejectedBadRoutes:4}));
