import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import React from 'react';
import {act,context,extend,reconciler} from '@react-three/fiber';
import * as T from 'three';

const cache=new Map();
async function load(path){
  if(cache.has(path))return cache.get(path);
  const result=await build({configFile:false,logLevel:'silent',publicDir:false,esbuild:{jsx:'automatic'},
    build:{ssr:fileURLToPath(new URL('../src/'+path,import.meta.url)),write:false,minify:false}});
  const code=result.output.find(x=>x.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  const promise=import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));cache.set(path,promise);return promise;
}
const combat=await load('lib/combat.ts'),river=await load('components/Scene/riverLayout.ts');
const {createTankGroundProfile}=await load('lib/tankGroundProfile.ts'),{safeVillageLeg}=await load('lib/villageCover.ts');
const {GHOST_RIVER_START,GHOST_RIVER_YAW,ghostSliceWeight}=await load('lib/ghostSignal.ts');
const {CAMERA_OFFSET}=await load('lib/constants.ts'),{INFANTRY_WORLD_SCALE}=await load('lib/infantryMetrics.ts');
const {CAMPAIGN_ROOT}=await load('lib/campaignFixtures.ts'),{TRAINING_DIRECTORY}=await load('lib/training.ts');
const sites=[CAMPAIGN_ROOT,TRAINING_DIRECTORY].map(dir=>{
  const seed=combat.hashCombatSession(dir),r=river.createRiverStations(seed);
  return {dir,seed,r,profile:createTankGroundProfile(r,seed)};
});
// Same settled, non-orbited CameraRig as the opening; use the ordinary FOV.
const tank=new T.Vector3(...GHOST_RIVER_START),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),GHOST_RIVER_YAW);
const s=ghostSliceWeight(tank.x,tank.z,false),cam=new T.PerspectiveCamera(60,1920/1080,.1,340);
cam.position.set(CAMERA_OFFSET[0]+2.95+.40*s,CAMERA_OFFSET[1]-1.08-.18*s,CAMERA_OFFSET[2]-1.95-.38*s).applyQuaternion(q).add(tank);
cam.lookAt(new T.Vector3(1.03+.34*s,1.82,-2.7-.42*s).applyQuaternion(q).add(tank));cam.updateMatrixWorld();
const screen=(x,y,z)=>{const v=new T.Vector3(x,y,z).project(cam);return [(v.x+1)*960,(1-v.y)*540];};
function survey(x,z){
  const points=sites.map(({r,profile})=>{const st=river.sampleRiverStation(r,z);
    return {dry:Math.abs(x-st.centerX)-st.mudHalfWidth,clear:safeVillageLeg(x,z,x,z,[],r),floor:profile.height(x,z)};});
  const foot=screen(x,points[0].floor,z),head=screen(x,points[0].floor+1.71*INFANTRY_WORLD_SCALE,z);
  return {x,z,px:Math.round((head[0]+foot[0])/2),top:Math.round(head[1]),bottom:Math.round(foot[1]),height:Math.round(foot[1]-head[1]),
    floor:points.map(v=>v.floor.toFixed(3)).join('/'),dry:+Math.min(...points.map(v=>v.dry)).toFixed(2),safe:points.every(v=>v.clear)};
}
if(process.argv.includes('--survey')){
  console.log('First candidate:',survey(-16.5,7));
  const candidates=[];
  for(let z=4;z<=10;z+=.25)for(let x=-17.5;x<=-12;x+=.25){
    const a=survey(x,z);if(a.safe && a.dry>=1.0 && a.px>=1230 && a.px<=1535 && a.height>=200 && a.height<=270)candidates.push(a);
  }
  console.table(candidates.sort((a,b)=>Math.abs(a.px-1405)+Math.abs(a.height-237)*2-Math.min(a.dry,2)*10-
    (Math.abs(b.px-1405)+Math.abs(b.height-237)*2-Math.min(b.dry,2)*10)).slice(0,18));
}

const {createRiverFlankPost,RIVER_FLANK_ID,riverFlankEnabled}=await load('lib/riverFlankPost.ts');
const {patrolWaypoint}=await load('lib/infantryPatrol.ts'),{createScouredBank}=await load('components/Scene/scouredBank.ts');
const {layoutFilesInGrid}=await load('lib/layout.ts'),{createVillageObstacle}=await load('lib/villageCover.ts');
const {createCampaignFixtures}=await load('lib/campaignFixtures.ts'),{TRAINING_ENTRIES}=await load('lib/training.ts');
const {FILE_OBJECTIVE_RESERVED_ZONE}=await load('lib/mission.ts'),{fileToScale}=await load('lib/scale.ts');
const {USInfantrySquad}=await load('components/Scene/USInfantrySquad.tsx');
const {createDenseJunglePlacements}=await load('components/Scene/DenseJungle.tsx');
const {isInsidePaddy}=await load('components/Scene/VietnamEnvironment.tsx'),{isInEmbassyClearing}=await load('lib/embassyDefense.ts');
const {ROAD_GRID_SPACING:S}=await load('lib/constants.ts');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(T);
const standard=combat.createUSInfantryCombatants();
assert.equal(riverFlankEnabled('training'),false);assert.equal(riverFlankEnabled('training','embassy'),false);
assert.equal(riverFlankEnabled('horde'),false);assert.equal(riverFlankEnabled('cleanup'),false);
assert.equal(riverFlankEnabled('directory'),true);assert.equal(riverFlankEnabled('training','river'),true);
for(const {dir,r,profile,seed} of sites){
  const post=createRiverFlankPost(r,seed),units=combat.createUSInfantryCombatants(0,post),who=units.find(u=>u.id===RIVER_FLANK_ID);
  assert.equal(units.length,5);assert.equal(who.kneeling,false);
  assert.deepEqual(units.filter(v=>v.id!==who.id),standard.filter(v=>v.id!==who.id));
  assert.deepEqual(combat.createUSInfantryCombatants(13,post),combat.createUSInfantryCombatants(13));
  const [hx,,hz]=who.position,frame=survey(hx,hz);
  assert.ok(frame.safe&&frame.dry>1 && frame.height>=200 && frame.height<=270&&frame.px>1250&&frame.px<1525&&frame.bottom<1050);
  const files=(dir===CAMPAIGN_ROOT?createCampaignFixtures().directories.get(dir).children:TRAINING_ENTRIES).filter(f=>!f.is_dir);
  const plots=layoutFilesInGrid(files,{reservedZones:[FILE_OBJECTIVE_RESERVED_ZONE],preserveSlots:true});
  const obstacles=files.map(f=>{const p=plots.get(f.path);return createVillageObstacle({path:f.path,position:[p.x,p.y,p.z],scale:fileToScale(f.size)});});
  const grove=createDenseJunglePlacements({seed,distanceToRoad:v=>Math.abs(((v+S/2)%S+S)%S-S/2),isInsidePaddy,
    isInsideObjectiveClearing:(x,z,p=0)=>isInEmbassyClearing(x,z,p)||
      (Math.abs(x-FILE_OBJECTIVE_RESERVED_ZONE.centerX)<=FILE_OBJECTIVE_RESERVED_ZONE.halfWidth+p&&Math.abs(z-FILE_OBJECTIVE_RESERVED_ZONE.centerZ)<=FILE_OBJECTIVE_RESERVED_ZONE.halfDepth+p)||
      (dir===CAMPAIGN_ROOT&&((Math.abs(x+32)<4+p&&z>36-p&&z<51+p)||(Math.abs(x+34.1)<5.7+p&&z>32.1-p&&z<43.6+p))),
    stageRiverBank:true});
  const trunks=[...grove.nearTrunks,...grove.palmTrunks,...grove.farTrunks];
  let trunkGap=Infinity;
  const bank=createScouredBank(r,seed),geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(bank.pos,3));
  const mesh=new T.Mesh(geom,new T.MeshBasicMaterial({side:T.DoubleSide})),ray=new T.Raycaster(),down=new T.Vector3(0,-1,0);
  if(process.argv.includes('--footprint')){
    console.log(dir+': each col +.1 x from -18, each row +.1 z; blocked terrain, water or protruding shore');
    for(let j=0;j<=30;j++){
      let row='';for(let i=0;i<=40;i++){
        const x=-18+i*.1,z=6+j*.1;
        ray.set(new T.Vector3(x,2,z),down);
        const h=ray.intersectObject(mesh)[0],g=profile.height(x,z);
        row+=!safeVillageLeg(x,z,x,z,obstacles,r)?'~':h&&h.point.y>g+.035?'X':'.';
      }
      console.log((6+.1*j).toFixed(1),row);
    }
    continue;
  }
  // Check the entire allowed lane, including near-foot soil and imported
  // shore geometry, not just the hand-selected first point.
  for(let dx=-.82;dx<=.83;dx+=.12)for(let dz=-.82;dz<=.83;dz+=.12){
    const x=hx+dx,z=hz+dz;if(!post.allows(x,z))continue;
    trunkGap=Math.min(trunkGap,...trunks.map(t=>Math.hypot(x-t.x,z-t.z)));
    assert.ok(safeVillageLeg(hx,hz,x,z,obstacles,r),dir+' flank leg crossed terrain/huts/water');
    for(const d of [[0,0],[-.12,0],[.12,0],[0,-.12],[0,.12]]){
      const a=x+d[0],b=z+d[1],ground=profile.height(a,b);
      assert.ok(ground>-.51,'Boot entered water');ray.set(new T.Vector3(a,2,b),down);
      const hit=ray.intersectObject(mesh)[0];assert.ok(!hit||hit.point.y<=ground+.050,'Boot crosses a rock/root '+dir+' '+[a,b,ground,hit?.point.y]);
    }
  }
  assert.ok(trunkGap>.72,'The actual planted grove crosses the foot lane: '+trunkGap);
  let x=hx,z=hz,walk=0;for(let leg=0;leg<8;leg++){
    const p=patrolWaypoint(x,z,hx,hz,.91,combat.hashCombatSession(who.id),leg,obstacles,r,post.allows);
    if(p){walk+=Math.hypot(p.x-x,p.z-z);x=p.x;z=p.z;}
  }
  assert.ok(walk>3,'Not enough actual navigable patrol on '+dir);
  const scene=new T.Scene(),subscriptions=new Set(),state={scene,camera:cam,clock:{elapsedTime:0},invalidate(){},
    internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
      subscribe(ref){subscriptions.add(ref);return()=>subscriptions.delete(ref);}}};
  const store=Object.assign((sel=v=>v)=>sel(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
  scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
  const fail=e=>{throw e;},root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
  const poses={current:new Map(units.map(v=>[v.id,{position:new T.Vector3(...v.position)}]))};
  const render=el=>act(async()=>reconciler.updateContainer(el&&React.createElement(context.Provider,{value:store},el),root,null,null));
  await render(React.createElement(USInfantrySquad,{riverFlank:post,navigationRiver:r,friendlies:units,enemies:[],obstacles,
    friendlyPosesRef:poses,enemyPosesRef:{current:new Map()}}));
  const actor=scene.getObjectByName(who.id),body=actor.getObjectByName('us-field-infantry-volume');
  assert.ok(actor.visible&&body.isSkinnedMesh&&body.geometry.boundingBox.max.y>1.69,'The standing rig must have its standing field geometry');
  assert.ok(actor.getObjectByName('us-field-rifle'));assert.equal(scene.getObjectsByProperty('name','us-field-infantry-volume').length,5);
  let travel=0;for(let i=0;i<660;i++){
    state.clock.elapsedTime+=1/30;for(const f of subscriptions)f.current(state,1/30);
    const p=actor.position;assert.ok(p.distanceTo(poses.current.get(who.id).position)<1e-6);
    assert.ok(Math.abs(p.y-post.height(p.x,p.z))<1e-6);travel=Math.max(travel,Math.hypot(p.x-hx,p.z-hz));
  }
  assert.ok(travel>.40,'Mounted rifleman never began walking');
  console.log(dir+': same five, third rifleman standing; '+frame.height+'px at x='+frame.px+', dry margin '+frame.dry+
    'm, floor '+profile.height(hx,hz).toFixed(3)+'m, nearest trunk '+trunkGap.toFixed(2)+'m; moved '+travel.toFixed(2)+'m, boots/roots/huts/pose verified.');
  await render(null);geom.dispose();mesh.material.dispose();
}
