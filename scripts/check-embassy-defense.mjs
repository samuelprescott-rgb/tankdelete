import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import {checkEmbassyStaging} from './embassy-staging-probes.mjs';
const cache=new Map();
async function loadURL(url) {
  if(cache.has(url.href))return cache.get(url.href);
  let source=ts.transpileModule(await readFile(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,
    target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  if(url.pathname.endsWith('/EmbassyDefense.tsx'))source+='\nexport {createWetCourt as testWetCourt, paintConcrete as testPaintConcrete};';
  if(url.pathname.endsWith('/USInfantrySquad.tsx'))source+='\nexport {buildCoverInstances as coverInstances, COVER_GEOMETRY as coverGeometry, SQUAD as deployed};';
  for(const match of [...source.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
    let target=import.meta.resolve(match[2].startsWith('.')?'three':match[2]);
    if(match[2].startsWith('.')) {
      let local=new URL(`${match[2]}.ts`,url);
      if(!ts.sys.fileExists(fileURLToPath(local)))local=new URL(`${match[2]}.tsx`,url);
      target=await loadURL(local);
    }
    source=source.replace(match[0],`from '${target}'`);
  }
  const result=`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  cache.set(url.href,result);return result;
}
const load=async path=>import(await loadURL(new URL(path,import.meta.url)));
const lib=await load('../src/lib/embassyDefense.ts');
const {intersectsTerrainMound}=await load('../src/lib/terrain.ts');
const {createEmbassyBuildingGeometry}=await load('../src/components/Scene/EmbassyDefense.tsx');
const signs=await load('../src/components/Scene/archiveDoorSigns.ts');
const {createGhostSignalArchive}=await load('../src/components/Scene/ghostSignalArchive.ts');
const {GHOST_EMBASSY_START,GHOST_EMBASSY_YAW}=await load('../src/lib/ghostSignal.ts');
const {CAMERA_OFFSET}=await load('../src/lib/constants.ts');
const {US_INFANTRY_DEPLOYMENT,findNearestObstacleHit}=await load('../src/lib/combat.ts');
const {isStepBlocked,recoverToSafePosition}=await load('../src/components/Scene/ZombieHorde.tsx');
const archives=lib.createEmbassyArchives();
// Verify the cinematic entrance actually has depth in the retained model.
// A texture painted onto the intact front wall cannot pass this gate. Probe
// away from the elevated file sign and the portico's outer columns.
{
  const geometry=createEmbassyBuildingGeometry(true,false), material=new THREE.MeshBasicMaterial();
  const shell=new THREE.Mesh(geometry,material);shell.updateMatrixWorld();
  const hit=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,9),new THREE.Vector3(0,0,-1)).intersectObject(shell,false)[0]?.point.z;
  const interior=hit(0,1.13), west=hit(-3.15,1.13), scar=hit(3.31,4.07), intact=hit(-3.31,4.07);
  assert.ok(Number.isFinite(interior)&&west-interior>1.1,'two-storey lobby is recessed, not a flat amber card');
  assert.ok(intact>2.81 && (scar===undefined||intact-scar>.9),'positive-x structural scar removes a real section of facade');
  // Ray-test a single actual casting: one open hub, four separate petal
  // openings, a concrete rim and four joining stems. The top-center run is
  // open for its lit clerestory, with wings broadening the silhouette.
  const {createPerforatedGallery}=await load('../src/components/Scene/embassyPerforatedScreen.ts');
  const tile=createPerforatedGallery(2,0,0,.49),screen=new THREE.Mesh(tile,material);
  const cast=(u,v)=>new THREE.Raycaster(new THREE.Vector3((u+.5)*.49,2*1.14+.425+(v+.5)*.54,9),
    new THREE.Vector3(0,0,-1)).intersectObject(screen,false)[0]?.point.z;
  for(const [u,v] of [[0,0],[-.28,0],[.28,0],[0,.28],[0,-.28]])assert.equal(cast(u,v),undefined);
  for(const [u,v] of [[0,-.49],[-.26,-.28],[.28,-.26],[.26,.28],[-.28,.26]])assert.ok(cast(u,v)>2.81);
  assert.ok(geometry.boundingBox.max.x-geometry.boundingBox.min.x>13 && !geometry.groups.length,
    'the full-width galleries are integrated into the one masonry draw');
  tile.dispose();
  geometry.dispose();material.dispose();
  const {COMPOUND_BURN_PILE,createEmbassyGroundworks}=await load('../src/components/Scene/embassyGroundworks.ts');
  assert.ok(archives.every(a=>Math.abs(COMPOUND_BURN_PILE[0]-a.position[0])>(a.id==='chancery'?4.2:2.7)
    ||Math.abs(COMPOUND_BURN_PILE[2]-a.position[2])>(a.id==='chancery'?2.5:2.1)),
    'visible fire is not buried in a protected file');
  const works=createEmbassyGroundworks(),skin=new THREE.MeshBasicMaterial(),fall=new THREE.Mesh(works.walls,skin);
  const level=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0)).intersectObject(fall,false)[0]?.point.y;
  for(const [x,z] of [[4.71,-21.23],[3.68,-20.37],[6.4,-20.28]])assert.ok(level(x,z)>.04&&level(x,z)<.21,'fallen east wing tapers into grounded, low debris');
  for(const x of [-.7,0,.7])assert.equal(level(x,-20),undefined,'no new wall debris across the file doorway');
  assert.ok(works.walls.getAttribute('position').count/3<4000,'standing compound and collapse fan stay within one bounded draw');
  skin.dispose();works.walls.dispose();works.court.dispose();
}
// The digital reading is architecture-bound, not an emissive scene pass:
// all three stencil/reflection meshes are immutable, finite and front-facing.
for(const archive of archives) {
  const g=createGhostSignalArchive(archive.id), p=g.getAttribute('position'), c=g.getAttribute('color');
  assert.equal(p.count,c.count);
  assert.ok(g.index.count/3<=(archive.id==='chancery'?330:180) && g.groups.length===0,'One bounded active-light batch per live archive; the breeze screen belongs to solid masonry');
  assert.ok([...p.array,...c.array].every(Number.isFinite));
  let glyphFloorQuads=0;
  for(let i=0;i<p.count;i+=4) {
    if(p.getY(i)>.1)continue;
    for(let j=i;j<i+4;j++){
      const x=p.getX(j)+archive.position[0], z=p.getZ(j)+archive.position[2];
      assert.ok(x>lib.EMBASSY_COURTYARD_BOUNDS.minX && x<lib.EMBASSY_COURTYARD_BOUNDS.maxX
        && z>lib.EMBASSY_COURTYARD_BOUNDS.minZ && z<lib.EMBASSY_COURTYARD_BOUNDS.maxZ);
      assert.ok(Math.abs(p.getX(j))<1.6,'No bright texture over the rest of the charge lane');
      assert.ok(p.getY(j)>.033 && p.getY(j)<.06,'Mark sits above the apron, not the actors');
    }
    const a=new THREE.Vector3().fromBufferAttribute(p,i), b=new THREE.Vector3().fromBufferAttribute(p,i+1),
      d=new THREE.Vector3().fromBufferAttribute(p,i+3);
    assert.ok(b.sub(a).cross(d.sub(a)).y>0,'Glyph is visible from above the wet surface');
    glyphFloorQuads++;
  }
  assert.ok(glyphFloorQuads>=18);
  g.dispose();
}
// Actual front porch attachment and flank legibility; no renderer or mocks.
const guard=new THREE.Vector3(...lib.EMBASSY_GUARD_POSITION), eye=new THREE.Vector3(...CAMERA_OFFSET)
  .applyAxisAngle(new THREE.Vector3(0,1,0),lib.EMBASSY_GUARD_YAW).add(guard);
const chase=new THREE.PerspectiveCamera(60,1920/1080,.1,340);
chase.position.copy(eye); chase.lookAt(guard.clone().add(new THREE.Vector3(0,2.75,0))); chase.updateMatrixWorld();
const previewEye=new THREE.Vector3(...CAMERA_OFFSET).applyAxisAngle(new THREE.Vector3(0,1,0),GHOST_EMBASSY_YAW)
  .add(new THREE.Vector3(...GHOST_EMBASSY_START));
const previewCam=chase.clone();
previewCam.position.copy(previewEye);previewCam.lookAt(new THREE.Vector3(...GHOST_EMBASSY_START).add(new THREE.Vector3(0,2.75,0)));
previewCam.updateMatrixWorld();
// Recorded 1080p chase pixels on the unmodified camera, before the art pass.
// Ray-test the actual triangles, not a diagram of where a road should be.
const {createEmbassyCheckpoint}=await load('../src/components/Scene/embassyCheckpoint.ts');
const {createEmbassyServiceTrack,trackGrassHeight}=await load('../src/components/Scene/embassyServiceTrack.ts');
const cp=createEmbassyCheckpoint(), track=createEmbassyServiceTrack();
const checkpointMesh=new THREE.Mesh(cp.checkpoint),trackMesh=new THREE.Mesh(track);
for(const [px,py,x,z,backdrop] of [[1248,407,19.93,11.31,trackMesh],[1108,438,10.08,.18,checkpointMesh]]){
  const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(px/960-1,1-py/540),chase);
  const hits=ray.intersectObjects([checkpointMesh,trackMesh],false);
  assert.equal(hits[0]?.object,backdrop,'The recorded approach sees the intended road / plaster backdrop');
  assert.ok(hits[0].distance>Math.hypot(x-eye.x,z-eye.z)+2,'The new backdrop cannot cover the approaching actor');
}
// Second pursuer's recorded before/after 8-second poses. Test the silhouette
// box around the knee, shoulders and head over this segment, not a single ray
// threaded through an accidental gap between the wicket mullions.
for(const t of [0,.25,.50,.75,1])for(const y of [.48,.90,1.32])for(const dz of [-.22,0,.22]) {
  const target=new THREE.Vector3(18.73+.53*t,y,7.71-.46*t+dz);
  const ray=new THREE.Raycaster(eye,target.clone().sub(eye).normalize(),0,eye.distanceTo(target)-.08);
  assert.equal(ray.intersectObject(checkpointMesh,false).length,0,'No kiosk crossing second pursuer at '+target.toArray());
}
const pos=track.getAttribute('position'), paint=track.getAttribute('color');
assert.equal(paint.itemSize,4,'The service track edge fades into the actual soil');
assert.ok(track.index.count/3<900 && track.groups.length===0,'One small static ground draw');
for(let i=0;i<pos.count;i++){
  assert.ok(Math.abs(pos.getY(i)+.07)<.01,'No raised deck or floating pavement');
  assert.ok(paint.getW(i)>=0 && paint.getW(i)<=.85,'Non-opaque paint preserves ground detail');
}
assert.ok(trackGrassHeight(31,17.3)<.32 && trackGrassHeight(31,25)===1 && trackGrassHeight(0,0)===1,
  'Only low growth on the narrow far approach is shortened');
track.dispose();cp.checkpoint.dispose();cp.practicals.dispose();trackMesh.material.dispose();checkpointMesh.material.dispose();
const buildings=archives.map(a=>{
  const b=new THREE.Mesh(createEmbassyBuildingGeometry(a.id==='chancery',false,a.id));
  b.position.fromArray(a.position); b.updateMatrixWorld(); return b;
});
await checkEmbassyStaging({load,lib,archives,buildings,GHOST_EMBASSY_START,GHOST_EMBASSY_YAW,CAMERA_OFFSET});
// Test the lit glass, not merely the sign's named parent. The nine separate
// strokes must fit BOTH actual 16:9 chase rigs and lie in front of masonry.
{
  const {createEmbassyNeon,CHANCERY_NEON}=await load('../src/components/Scene/embassyNeon.ts');
  assert.equal(CHANCERY_NEON.text,'US EMBASSY');
  const g=createEmbassyNeon(),pos=g.getAttribute('position'),color=g.getAttribute('color');
  const light=[];
  for(let i=0;i<pos.count;i++)if(color.getX(i)>2.0&&color.getY(i)>.4)
    light.push(new THREE.Vector3().fromBufferAttribute(pos,i).add(buildings[0].position));
  assert.ok(light.length>120 && g.groups.length===0 && g.index.count/3<2500,'single static, bounded tube batch');
  assert.equal(g.userData.glyphs.map(s=>s.letter).join(''),'USEMBASSY');
  let previousRight=-Infinity;
  for(const [index,{first,end}] of g.userData.glyphs.entries()){
    const core=[];
    for(let i=first;i<end;i++)if(color.getX(i)>2&&color.getY(i)>.4)core.push(pos.getX(i));
    assert.ok(core.length>=5 && Math.max(...core)-Math.min(...core)>.35,'each canopy letter is lit');
    assert.ok(Math.min(...core)-previousRight>(index===2?.34:.078),'separate letters and generous word space');
    previousRight=Math.max(...core);
  }
  const capMin=Math.min(...light.map(p=>p.y)), capMax=Math.max(...light.map(p=>p.y));
  assert.ok(capMax-capMin>.60 && capMax<4 && capMin>2.55 && CHANCERY_NEON.width<6.2,
    'name is legible and mounted over the entrance, not on the roof');
  const widths=[];
  for(const [spawn,yaw] of [[GHOST_EMBASSY_START,GHOST_EMBASSY_YAW],[lib.EMBASSY_GUARD_POSITION,lib.EMBASSY_GUARD_YAW]]){
    const subject=new THREE.Vector3(...spawn),up=new THREE.Vector3(0,1,0);
    const cam=new THREE.PerspectiveCamera(60,1920/1080,.1,340);
    cam.position.set(CAMERA_OFFSET[0]+2.05,CAMERA_OFFSET[1]-.40,CAMERA_OFFSET[2]-.66).applyAxisAngle(up,yaw).add(subject);
    cam.lookAt(new THREE.Vector3(1.12,2.75,-1.28).applyAxisAngle(up,yaw).add(subject));cam.updateMatrixWorld();
    const printed=light.map(p=>p.clone().project(cam));
    assert.ok(printed.every(p=>Math.abs(p.x)<1&&Math.abs(p.y)<1),'the entire embassy name fits the unmodified player camera');
    const w=(Math.max(...printed.map(p=>p.x))-Math.min(...printed.map(p=>p.x)))*960;
    assert.ok(w>155,'embassy canopy name must remain useful at native 1080p, measured '+w);widths.push(Math.round(w));
    for(let i=0;i<light.length;i+=7){
      const p=light[i],ray=new THREE.Raycaster(cam.position,p.clone().sub(cam.position).normalize(),0,cam.position.distanceTo(p)-.015);
      const intercept=ray.intersectObjects(buildings,false)[0];
      assert.ok(!intercept,'no glass hidden in the facade or behind an annex: '+JSON.stringify({eye:cam.position.toArray(),
        point:p.toArray(),wall:intercept&&archives[buildings.indexOf(intercept.object)].id,hit:intercept?.point.toArray()}));
    }
  }
  console.log('Physical US EMBASSY tube: art / campaign chase ink widths '+widths.join(' / ')+' px at 1080p.');
  // Verify receiver shaders use the same REAL world-space source as the
  // raised letters. A profile inferred from a head-on scene image is not
  // sufficient at the other two camera heights or on the western flank.
  const {testWetCourt,testPaintConcrete}=await load('../src/components/Scene/EmbassyDefense.tsx');
  const shader=()=>({...THREE.ShaderLib.lambert,uniforms:{}});
  const sourcePoint=new THREE.Vector3(CHANCERY_NEON.x,CHANCERY_NEON.y,CHANCERY_NEON.z).add(buildings[0].position);
  const sourceGLSL='vec3('+sourcePoint.toArray().map(n=>n.toFixed(3)).join(',')+')';
  const emit=shader(),floor=shader(),mask=new THREE.Texture(),court=testWetCourt(mask);
  testPaintConcrete(emit,mask);court.material.onBeforeCompile(floor,{});
  assert.ok(emit.fragmentShader.includes(sourceGLSL+'-vCompound')&&emit.fragmentShader.includes('vArchiveNormal.z'));
  assert.ok(floor.fragmentShader.includes('vec3 signSource='+sourceGLSL)&&floor.fragmentShader.includes('normalize(lampRay-incident)'));
  const {WET_CREST_GLSL}=await load('../src/components/Scene/wetCourtFracture.ts');
  assert.ok(floor.fragmentShader.includes(WET_CREST_GLSL)&&floor.fragmentShader.includes('waterCrest(vWetCourt.xz,3.7)'));
  const rainSource=await readFile(new URL('../src/components/Scene/GhostHordeRain.tsx',import.meta.url),'utf8');
  assert.ok(rainSource.includes('waterCrest(world,key.x+13.)')&&!rainSource.includes('hash(vec2(floor(px.y*15.)'),
    'water overlay cannot restore full-width constant strokes on top of fractured reflections');
  assert.ok(floor.fragmentShader.includes(')*joint;')&&floor.fragmentShader.includes('totalEmissiveRadiance+=image*sheet'));
  assert.equal(floor.uniforms.uLitLobby,court.online);
  // Independently reflect the ACTUAL source into the actual normal-chase
  // eye: lowering the sign brings its true mirror inside the modeled slab.
  // A nearby rippled facet must also return it toward the same eye.
  const viewer=new THREE.Vector3(CAMERA_OFFSET[0]+2.05,CAMERA_OFFSET[1]-.40,CAMERA_OFFSET[2]-.66)
    .applyAxisAngle(new THREE.Vector3(0,1,0),GHOST_EMBASSY_YAW).add(new THREE.Vector3(...GHOST_EMBASSY_START));
  const virtual=sourcePoint.clone();virtual.y=.066-sourcePoint.y;
  const perfect=viewer.clone().lerp(virtual,(.033-viewer.y)/(virtual.y-viewer.y));
  assert.ok(perfect.z<lib.EMBASSY_COURTYARD_BOUNDS.maxZ && perfect.z>-19 &&
    Math.abs(perfect.x)<lib.EMBASSY_COURTYARD_BOUNDS.maxX);
  const onSlab=viewer.clone().lerp(sourcePoint,(-16.3-viewer.z)/(sourcePoint.z-viewer.z));onSlab.y=.033;
  const L=sourcePoint.clone().sub(onSlab).normalize(),V=viewer.clone().sub(onSlab).normalize(),half=L.clone().add(V).normalize();
  assert.ok(half.angleTo(new THREE.Vector3(0,1,0))>.05&&half.angleTo(new THREE.Vector3(0,1,0))<.30);
  assert.ok(L.negate().reflect(half).distanceTo(V)<1e-10,'ripple direction returns signage light toward the viewer');
  mask.dispose();court.material.dispose();
  g.dispose();
}
let minFaceWidth=Infinity;
for(const [i,a] of archives.entries()) {
  const header=signs.createArchiveDoorHeader(a.id);
  assert.ok(header.index.count/3<450 && header.groups.length===0,'Fixed lettering merges into the normal masonry draw');
  header.dispose();
  const toWorld=(x,y,z)=>new THREE.Vector3(x,y,z).applyMatrix4(signs.archiveSignFace(a.id)).add(buildings[i].position);
  const target=toWorld(0,0,0), direction=target.clone().sub(eye).normalize();
  const hits=new THREE.Raycaster(eye,direction).intersectObjects(buildings,false);
  assert.ok(hits.length>0 && hits[0].object===buildings[i] && hits[0].point.distanceTo(target)<.12,
    a.id+' west face must be outside and visible from the real guard chase through all building meshes; first hit '+JSON.stringify(hits[0]?.point.toArray())+' target '+JSON.stringify(target.toArray()));
  const ndc=target.clone().project(chase);
  assert.ok(Math.abs(ndc.x)<1 && Math.abs(ndc.y)<1,a.id+' west face center in default view');
  for(const x of [-1.18,0,1.18]) {
    const print=toWorld(x,-.32,0), pt=print.clone().project(chase);
    const printHits=new THREE.Raycaster(eye,print.clone().sub(eye).normalize()).intersectObjects(buildings,false);
    assert.ok(Math.abs(pt.x)<1 && Math.abs(pt.y)<1 && printHits[0]?.point.distanceTo(print)<.12,
      a.id+' full name must be on-screen and in front of the other signs: '+JSON.stringify(pt.toArray()));
  }
  const normal=new THREE.Vector3(0,0,1).transformDirection(signs.archiveSignFace(a.id));
  assert.ok(normal.dot(direction)<-.65,a.id+' sign is not edge-on at the west guard flank');
  const frontDir=target.clone().sub(previewEye).normalize();
  const frontHit=new THREE.Raycaster(previewEye,frontDir).intersectObjects(buildings,false)[0];
  const previewInkPx=Math.abs(toWorld(-1.225,0,0).project(previewCam).x-toWorld(1.225,0,0).project(previewCam).x)*960;
  assert.ok(normal.dot(frontDir)<0&&previewInkPx>34&&frontHit?.object===buildings[i]&&frontHit.point.distanceTo(target)<.12,
    a.id+' same mounted plaque faces the centered Ghost Signal practice camera');
  // 35m at the real flank bearing, 1080p/60-degree vertical FOV, independently
  // of camera offset. Test the ink, not an artificially enlarged bounding box.
  const cam=new THREE.PerspectiveCamera(60,1920/1080,.1,340);
  cam.position.copy(target).addScaledVector(direction,-35); cam.lookAt(target);cam.updateMatrixWorld();
  const left=toWorld(-1.225,0,0).project(cam),right=toWorld(1.225,0,0).project(cam);
  const projectedWidth=Math.abs(left.x-right.x)*960;
  minFaceWidth=Math.min(minFaceWidth,projectedWidth);
  assert.ok(projectedWidth>40 && Math.abs(toWorld(0,-.53,0).project(cam).y-toWorld(0,-.14,0).project(cam).y)*540>9,
    a.id+' name must occupy actual pixels at the 35m flank');
  // Across the masonry, a wall/roof must occlude this physical sign.
  const rear=new THREE.Vector3(a.position[0],2.8,a.position[2]-9);
  const backHits=new THREE.Raycaster(rear,target.clone().sub(rear).normalize()).intersectObjects(buildings,false);
  assert.ok(backHits[0].point.distanceTo(target)>1,a.id+' no through-wall sign');
}
const paddle=signs.createArchiveAlarmPaddle(),batch=new THREE.InstancedMesh(paddle,new THREE.MeshStandardMaterial(),3);
// Exercise the mounted preparation path rather than just the unprimed state
// machine. The game might enter the compound *after* the startup GPU pass.
{
  const roster=lib.createEmbassyArchives(),live=new THREE.InstancedMesh(paddle,batch.material,3);
  const attr=live.instanceMatrix, originalCull=live.frustumCulled, parked=new THREE.Matrix4();
  let observed=0;const originalAfter=live.onAfterRender=function(){assert.equal(this,live);observed++;};
  const update=signs.createPreparedArchiveAlarmDriver(live);
  update(roster,1000);
  assert.equal(live.visible,true);assert.equal(live.count,1);assert.equal(live.frustumCulled,false);
  assert.equal(live.geometry,paddle);assert.equal(live.material,batch.material);assert.equal(live.instanceMatrix,attr);
  live.getMatrixAt(0,parked);
  paddle.computeBoundingSphere();const volume=paddle.boundingSphere.clone().applyMatrix4(parked);
  assert.ok(volume.center.distanceTo(new THREE.Vector3())-volume.radius>900_000,'entire one-shot placement beyond playable cameras');
  const v=attr.version;update(roster,1017);assert.equal(attr.version,v,'do not repeat the upload awaiting actual rendering');
  live.onAfterRender();assert.equal(observed,1);assert.equal(live.onAfterRender,originalAfter);
  assert.equal(live.visible,false);assert.equal(live.count,0);assert.equal(live.frustumCulled,originalCull);
  update(roster,1060);assert.equal(live.visible,false);assert.equal(attr.version,v);
  const threatened=lib.attackEmbassyArchive(roster,'dispatch',8,1100);
  const cold=new THREE.InstancedMesh(paddle,batch.material,3),normal=signs.createArchiveAlarmDriver(cold);
  for(const t of [1100,1180,1320,1540,1900,4601]){
    normal(threatened,t);update(threatened,t);
    assert.deepEqual([live.visible,live.count],[cold.visible,cold.count]);
    if(live.count)assert.deepEqual(live.instanceMatrix.array.slice(0,16),cold.instanceMatrix.array.slice(0,16));
  }
  // If an alarm arrives before a renderer saw the parked submission, the
  // real signal still shows on that frame and survives the after-draw hook.
  const late=new THREE.InstancedMesh(paddle,batch.material,3),lateUpdate=signs.createPreparedArchiveAlarmDriver(late);
  lateUpdate(roster,1070);lateUpdate(threatened,1100);normal(threatened,1100);
  assert.deepEqual(late.instanceMatrix.array.slice(0,16),cold.instanceMatrix.array.slice(0,16));
  late.onAfterRender();assert.ok(late.visible&&late.count===1&&late.frustumCulled);
  late.dispose();cold.dispose();live.dispose();
}
const tick=signs.createArchiveAlarmDriver(batch),m1=new THREE.Matrix4(),m2=new THREE.Matrix4();
assert.equal(batch.visible,false);
for(let count=1;count<=3;count++) {
  let roster=lib.createEmbassyArchives(count);
  tick(roster,1000); assert.equal(batch.count,0);
  for(const a of roster) roster=lib.attackEmbassyArchive(roster,a.id,8,1100);
  tick(roster,1100);
  assert.equal(batch.count,count,'Each earned/intact door gets exactly one mounted warning, not a double face');
  batch.getMatrixAt(0,m1); tick(roster,1540);batch.getMatrixAt(0,m2);
  assert.ok(new THREE.Vector3(0,.59,0).applyMatrix4(m2).y-new THREE.Vector3(0,.59,0).applyMatrix4(m1).y>1,
    'The mechanical flag actually rises above the static header');
  const version=batch.instanceMatrix.version; tick(roster,1700);
  assert.equal(batch.instanceMatrix.version,version,'The flag holds still with no repeated GPU matrix uploads');
  if(count===3) for(const [i,a] of roster.entries()) {
    batch.getMatrixAt(i,m2);
    const alert=new THREE.Vector3(0,.59,.047).applyMatrix4(m2);
    const hits=new THREE.Raycaster(eye,alert.clone().sub(eye).normalize()).intersectObjects([...buildings,batch],false);
    assert.ok(hits[0]?.object===batch && hits[0].instanceId===i, a.id+' raised signal visible even with all three warning');
    const name=new THREE.Vector3(0,-.32,.018).applyMatrix4(signs.archiveSignFace(a.id)).add(buildings[i].position);
    const nameHits=new THREE.Raycaster(eye,name.clone().sub(eye).normalize()).intersectObjects([...buildings,batch],false);
    assert.ok(nameHits[0]?.point.distanceTo(name)<.13, a.id+' still identifiable with all three signals up');
  }
  tick(roster,4600);assert.equal(batch.visible,false,'Threat expires at deadline, even on identical roster object');
  for(const a of roster)roster=lib.attackEmbassyArchive(roster,a.id,8,4700);
  tick(roster,5140);roster=lib.damageEmbassyArchive(roster,roster[0].id,200);
  tick(roster,5141);assert.equal(batch.count,count-1,'Lost door cannot keep an alarm');
  tick(lib.createEmbassyArchives(count),5142);assert.equal(batch.visible,false,'Fresh retry clears alarms without a component remount');
}
assert.ok(paddle.index.count/3<150 && batch.material.depthTest && batch.material.depthWrite && !batch.material.transparent);
batch.material.dispose();batch.dispose();paddle.dispose();
buildings.forEach(b=>{b.geometry.dispose();b.material.dispose();});
console.log('Archive signs: three mounted/facing doors, minimum 35m name width '+minFaceWidth.toFixed(1)+'px; GATE/earned warning, loss, retry, timeout and one-batch hold verified.');
assert.equal(archives.length,3);
assert.notEqual(archives,lib.createEmbassyArchives());
assert.equal(lib.damageEmbassyArchive(archives,'missing',10),archives);
assert.equal(lib.damageEmbassyArchive(archives,'chancery',Infinity),archives);
assert.equal(lib.damageEmbassyArchive(archives,'chancery',-1),archives);
assert.equal(lib.damageEmbassyArchive(archives,'chancery',10)[0].health,190);
assert.equal(archives[0].health,200,'Damage is immutable');
let siege=lib.attackEmbassyArchive(archives,'chancery',10000,1000);
assert.equal(siege[0].health,200,'Arrival has a visible windup');
siege=lib.attackEmbassyArchive(siege,'chancery',10000,3249);
assert.equal(siege[0].health,200,'Full 2250ms response window');
siege=lib.attackEmbassyArchive(siege,'chancery',10000,3250);
assert.equal(siege[0].health,192,'Damage is capped to eight per attack window');
for(let index=0;index<30;index++)siege=lib.attackEmbassyArchive(siege,'chancery',10000,3250);
assert.equal(siege[0].health,192,'Simultaneous attackers do not stack');
siege=lib.attackEmbassyArchive(siege,'chancery',8,8000);
assert.equal(siege[0].health,192,'Returning after the siege breaks restarts the warning');
const {createZombieWave,ZOMBIE_SPAWN_MIN_Z,COMMAND_ENTRY,COMMAND_INGRESS}=await load('../src/lib/zombieEpilogue.ts');
{
  const spawn=createZombieWave(19,4)[0],path=[COMMAND_ENTRY,...COMMAND_INGRESS];
  assert.deepEqual([spawn.position[0],spawn.position[2]],COMMAND_ENTRY);
  const buildings=lib.embassyCombatObstacles(archives);
  for(let n=1;n<path.length;n++)for(let i=0;i<=60;i++){
    const t=i/60,[a,b]=path[n-1],[c,d]=path[n],x=a+(c-a)*t,z=b+(d-b)*t;
    assert.ok(!intersectsTerrainMound(x,z,spawn.collisionRadius),`East ingress cuts through hill at ${x},${z}`);
    assert.ok(buildings.every(o=>Math.hypot(o.position[0]-x,o.position[2]-z)>spawn.collisionRadius+o.radius),'Command crossing clips an archive');
  }
  for(const [pos,yaw] of [[GHOST_EMBASSY_START,GHOST_EMBASSY_YAW],[lib.EMBASSY_GUARD_POSITION,lib.EMBASSY_GUARD_YAW]]){
    const base=new THREE.Vector3(...pos),world=p=>p.applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(base);
    const cam=new THREE.PerspectiveCamera(60,16/9,.1,340);
    cam.position.copy(world(new THREE.Vector3(2.05,3.8,6.14)));cam.lookAt(world(new THREE.Vector3(1.12,2.75,-1.28)));cam.updateMatrixWorld();
    for(const [x,z] of path.slice(-2)){
      const top=new THREE.Vector3(x,8,z).project(cam),foot=new THREE.Vector3(x,.02,z).project(cam);
      assert.ok(Math.abs(top.x)<.64 && top.y<.87 && top.z>0 && top.z<1 && foot.y>-.42 && (top.y-foot.y)*540>270,'Full silhouette inside ordinary 1080p player chase');
    }
  }
}
const {createRiverStations,createRiverCrossings,riverCrossingAmount,sampleRiverStation}=await load('../src/components/Scene/riverLayout.ts');
for(const seed of [0,1,1968,0xffffffff]) {
  const river=createRiverStations(seed),bridge=createRiverCrossings(river).find(c=>c.kind==='bridge');
  const firstWave=createZombieWave(seed,1),rank=firstWave.filter(z=>z.openingPaddyApproach);
  assert.equal(rank.length,2);assert.ok(rank[0].spawnDelay<rank[1].spawnDelay);
  const ordinary=firstWave.filter(z=>z.archetype==='standard'&&!z.openingPaddyApproach&&!z.archiveRunner);
  assert.ok(ordinary.length>0&&ordinary.every(z=>z.health===80&&z.maxHealth===80),'Ordinary first-wave enemies retain 80 HP');
  for(const z of rank){
    assert.ok(!z.archiveRunner && z.health===125 && z.maxHealth===125 && z.archetype==='standard','Opening paddy pair withstands 125 HP');
    const {entry,turn}=z.openingPaddyApproach;
    for(let i=0;i<=48;i++){
      const t=i/48,x=entry[0]+(turn[0]-entry[0])*t,v=entry[1]+(turn[1]-entry[1])*t;
      const r=sampleRiverStation(river,v);
      assert.ok(Math.abs(x-r.centerX)>r.waterHalfWidth+z.collisionRadius,'Playable front rank stays on the dry bank');
      assert.equal(riverCrossingAmount(x,v,bridge),0,'No access through the bridge deck');
      assert.equal(intersectsTerrainMound(x,v,z.collisionRadius),false,'No recovery shortcut through a hill');
      assert.equal(lib.isInEmbassyClearing(x,v,z.collisionRadius),false,'Formation stays outside the compound');
    }
  }
  for(const n of [2,3,4])assert.ok(createZombieWave(seed,n).every(z=>!z.openingPaddyApproach),'Other waves keep their normal routes');
}
for(let seed=0;seed<512;seed++)for(const wave of [1,2,3,4]) {
  for(const zombie of createZombieWave(seed,wave)) {
    assert.ok(zombie.position[2]>=ZOMBIE_SPAWN_MIN_Z,'Every wave and terrain-search fallback spawns in front of the compound');
    assert.equal(lib.isInEmbassyClearing(zombie.position[0],zombie.position[2],8),false,'No spawn inside or behind an archive');
  }
}
assert.ok(lib.selectEmbassyTarget(archives,0,0,0,100,false));
assert.equal(lib.selectEmbassyTarget(archives,0,0,0,36,false),null,'Close defenders pull file raiders');
assert.equal(lib.selectEmbassyTarget(archives,0,0,1,100,false),null,'Not every zombie raids files');
assert.equal(lib.selectEmbassyTarget(archives,0,0,0,100,true),null,'Boss retains its player/ally duel');
assert.equal(lib.selectEmbassyTarget(archives.map(a=>({...a,health:0})),0,0,0,100,false),null);
const obstacles=lib.embassyCombatObstacles(archives);
assert.equal(obstacles.length,14,'Intact compound uses bounded overlapping collision proxies');
assert.equal(lib.embassyCombatObstacles(archives.map(a=>({...a,health:0}))).length,0,'Ruins release their full building volumes');
for(const archive of archives) {
  assert.equal(isStepBlocked(...[archive.approach[0],archive.approach[2],obstacles]),false,`${archive.id} remains reachable`);
  assert.equal(isStepBlocked(archive.position[0],archive.position[2],obstacles),true,'Living buildings block ordinary undead');
  const start=new THREE.Vector3(archive.position[0]-7,1.1,archive.position[2]);
  const end=new THREE.Vector3(archive.position[0]+7,1.1,archive.position[2]);
  assert.notEqual(findNearestObstacleHit(start,end,obstacles),null,'Rifle traces cannot pass through intact archives');
  const runtime={position:new THREE.Vector3(...archive.position),recoveryCount:0,steeringSide:1};
  assert.equal(recoverToSafePosition(runtime,'qa-'+archive.id,archive.approach[0],archive.approach[2],obstacles,false,.34,1.4),true);
  assert.equal(isStepBlocked(runtime.position.x,runtime.position.z,obstacles),false,'Embedded spawns recover outside the actual building volumes');
}
assert.equal(findNearestObstacleHit(new THREE.Vector3(-5,1.1,-14),new THREE.Vector3(5,1.1,-14),obstacles),null,'Front defensive line has a clear firing lane');
let triangles=0;
for(const [main,ruined] of [[true,false],[false,false],[false,true]]) {
  const geometry=createEmbassyBuildingGeometry(main,ruined);
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
  assert.ok([...position.array,...normal.array,...geometry.getAttribute('color').array].every(Number.isFinite));
  assert.ok(geometry.boundingSphere.radius>0);
  const count=(geometry.index?.count??position.count)/3;
  // Only the chancery has three full banks of real four-aperture castings;
  // the ancillary buildings retain their previous individual ceiling.
  assert.ok(count<(main?6900:4000),`Masonry geometry budget ${count}`);triangles+=count;
  geometry.dispose();
}
for(const archive of archives) {
  assert.equal(intersectsTerrainMound(archive.approach[0],archive.approach[2],.5),false,`${archive.id} approach terrain clearance`);
  const halfWidth=archive.id==='chancery'?4.4:2.9;
  for(let x=-halfWidth;x<=halfWidth;x+=.5)for(let z=-2.7;z<=2.7;z+=.5) {
    assert.equal(intersectsTerrainMound(archive.position[0]+x,archive.position[2]+z,0),false,`${archive.id} clips a hill at ${x},${z}`);
  }
}
for(const member of US_INFANTRY_DEPLOYMENT)assert.equal(
  intersectsTerrainMound(member.position[0],member.position[2]+lib.EMBASSY_DEFENSE_OFFSET_Z,.3),false);
const session=await readFile(new URL('../src/GameSession.tsx',import.meta.url),'utf8');
assert.doesNotMatch(session,/QA: overrun archives/,'One-click forced loss must not be exposed in the play-test HUD');
assert.match(session,/async function handleProjectileHit\(filePath: string[^\n]*\)\s*\{\s*if \(embassyModeRef.current\) return/);
assert.match(session,/async function handleBatchDelete\(\)\s*\{\s*if \(embassyModeRef.current\) return/);
assert.match(session,/async function handleUndoLastTrash\(\)\s*\{\s*if \(embassyModeRef.current\) return/);
assert.match(session,/embassyMode \? embassyCombatObstacles\(horde.archives\)/,'Scene must use the tested building volumes');
for(const marker of ['function handleFlamethrower','function handleNapalm','function handleNapalmImpact']) {
  const start=session.indexOf(marker);
  if(start>=0)assert.ok(session.slice(start,start+11000).includes('embassyModeRef.current'),'Hidden normal-sector targets are gated');
}
const retry=session.slice(session.indexOf('function handleRetryZombieDefense()'),session.indexOf('function handleTankHit('));
const clearOrdnance=session.slice(session.indexOf('function clearEncounterOrdnance()'),session.indexOf('function handleRetryZombieDefense()'));
for(const operation of ['worldSessionRef.current += 1','napalmPayloadsRef.current.clear()',
  'eaglePayloadsRef.current.clear()','projectile.active = false'])assert.ok(clearOrdnance.includes(operation),operation);
for(const operation of ['clearEncounterOrdnance()','fieldRadio.stop()',
  'fieldRadio.beginBonusRound()','zombieAmbience.playIntro()','setDefenseAttempt'])assert.ok(retry.includes(operation),operation);
const module=await readFile(new URL('../src/lib/embassyDefense.ts',import.meta.url),'utf8');
assert.doesNotMatch(module,/tauri|moveToTrash|commands\./,'Archive AI never receives a filesystem API');
console.log(`Embassy defense checks passed: pure proxy damage/targeting, terrain clearance, file-write guards, finite masonry (${triangles} shared triangles).`);
