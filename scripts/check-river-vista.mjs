// CPU sight survey, not a screenshot: measure the reachable water surface
// through the real settled chase and both live file manifests. The old plot
// is reconstructed only as a counterfactual in this test.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import * as T from 'three';
import React from 'react';
import {renderToString} from 'react-dom/server';

const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),entry=root+'/virtual-river-vista.mjs';
const exportsFrom={
  'lib/ghostSignal':'GHOST_RIVER_START,GHOST_RIVER_YAW,startsOnRiverBank,DOWNSTREAM_HUT_PLOT,inGhostRiverHutPlot,atDownstreamHut',
  'lib/training':'TRAINING_DIRECTORY,createTrainingEntries','lib/campaignFixtures':'CAMPAIGN_ROOT,createCampaignFixtures',
  'lib/combat':'hashCombatSession,createUSInfantryCombatants,createVietCongCombatants,fitVietCongToVillage','lib/villageCover':'createVillageObstacle','lib/mission':'createFileObjective','lib/sectorPaging':'createSectorPage',
  'lib/tankGroundProfile':'createTankGroundProfile','lib/layout':'villageStructureVariant,villageHutYaw',
  'lib/zombieEpilogue':'createZombieWave',
  'hooks/useFileBlocks':'useFileBlocks','components/Scene/CameraRig':'CameraRig',
  'components/Scene/FileBlocks':'createStructureGeometry','components/Scene/riverLanding':'createRiverLanding',
  'components/Scene/riverLayout':'createRiverStations,riverWaterImmersion,createRiverCrossings,isInsideRiverCorridor','components/Scene/riverVerticalSection':'RIVER_WATER_Y',
  'components/Scene/VietnamEnvironment':'createRiverBridgePlanks,createRiverSurfaceGeometry,isInsidePaddy,distanceToRoad,isInsideObjectiveClearing,isInsideOutpostClearing',
  'components/Scene/TerrainSurface':'cutGroundAroundRiver','components/Scene/riverTalus':'createRiverTalus',
  'components/Scene/DenseJungle':'createDenseJunglePlacements',
  'components/Scene/jungleGeometry':'createJungleTrunkGeometry,createJungleBananaGeometry,createJungleBroadleafGeometry',
  'lib/terrain':'intersectsTerrainMound','lib/tankFootprint':'tankFootprintBlocked',
  'lib/rearStronghold':'REAR_RADIO,rearStrongholdBlocksDrive','lib/arenaBounds':'isInsideArena,ARENA_TANK_PADDING',
};
const out=await build({root,configFile:false,publicDir:false,logLevel:'silent',plugins:[{
  name:'cpu-river-survey',enforce:'pre',resolveId(id){
    if(id===entry||id==='virtual:vista-camera-hooks')return id;
  },transform(source,id){
    if(id.endsWith('/riverLayout.ts?r23Survey'))return source.replace('const detailed:RiverStation[]=[];','createRiverCrossings(stations); return stations; const detailed:RiverStation[]=[];');
    if(id.endsWith('/DenseJungle.tsx?r23Survey'))return "import {createRiverStations as oldStations} from './riverLayout.ts?r23Survey';\n"+source.replace('const river = createRiverStations(seed);','const river = oldStations(seed);');
    if(id.endsWith('/tankGroundProfile.ts?r12Survey'))return source.replace("../components/Scene/riverVerticalSection'","../components/Scene/riverVerticalSection.ts?r12Survey'");
    if(id.endsWith('/riverVerticalSection.ts?r12Survey'))return source.replace('const mass=smooth(width/1.85)','const mass=0');
    if(id.endsWith('/CameraRig.tsx'))return source.replace("'@react-three/fiber'","'virtual:vista-camera-hooks'");
    if(id.endsWith('/VietnamEnvironment.tsx'))return source+'\nexport {distanceToRoad,isInsideObjectiveClearing,isInsideOutpostClearing};';
  },load(id){
    if(id===entry)return Object.entries(exportsFrom).map(([path,names])=>'export {'+names+'} from '+JSON.stringify(root+'/src/'+path)).join('\n')+'\nexport {createTankGroundProfile as createR12Ground} from '+JSON.stringify(root+'/src/lib/tankGroundProfile.ts?r12Survey')+'\nexport {createDenseJunglePlacements as historicFootprintJungle} from '+JSON.stringify(root+'/src/components/Scene/DenseJungle.tsx?r23Survey');
    if(id==='virtual:vista-camera-hooks')return 'export const useThree=()=>globalThis.vistaState,useFrame=fn=>globalThis.vistaState.frame=fn;';
  }}],esbuild:{jsx:'automatic'},build:{ssr:entry,write:false}});
const code=out.output.find(c=>c.type==='chunk'&&c.isEntry).code.replace(/from "([^"]+)"/g,(_,p)=>'from '+JSON.stringify(import.meta.resolve(p)));
const game=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
// These are the physical opening horde trajectories, not invented shore
// safety coordinates. Compare all 99,716 centerline samples to the actual
// pre-apron (R12) soil, including the old slightly raised levee in some seeds.
let rankSamples=0,maxRankDelta=0;
for(const seed of [...Array.from({length:512},(_,i)=>i),1968,0xffffffff]){
  const stations=game.createRiverStations(seed),ground=game.createTankGroundProfile(stations,seed),original=game.createR12Ground(stations,seed);
  if(seed===1968){const s=stations.find(s=>s.z>=7&&s.z<=9),px=s.centerX-s.mudHalfWidth-.34;
    assert.ok(original.height(px,s.z)-ground.height(px,s.z)>.23,'Counterfactual detects the broad west bench; it is not the same terrain twice');}
  for(const actor of game.createZombieWave(seed,1).filter(a=>a.openingPaddyApproach)){
    const {entry:[x,z],turn:[xx,zz]}=actor.openingPaddyApproach;
    for(let i=0;i<=96;i++){const t=i/96;
      const a=x+(xx-x)*t,b=z+(zz-z)*t;
      maxRankDelta=Math.max(maxRankDelta,Math.abs(ground.height(a,b)-original.height(a,b)));
      rankSamples++;}
  }
}
console.log('Embassy opening formation: pre-apron route samples / largest ground delta in metres',rankSamples,maxRankDelta);
assert.ok(maxRankDelta<.001,'Horde route must retain its R12 soil height (not simply remain out of the water)');
// Geometric reachability (not a live playthrough). Conservatively wrap ALL
// possible track yaws, retaining actual arena, solid relief, rear hut/guard.
function canDrive(x,z){
  const radius=.82+.66;
  return game.isInsideArena(x,z,game.ARENA_TANK_PADDING)&&!game.intersectsTerrainMound(x,z,radius)&&!game.rearStrongholdBlocksDrive(x,z,radius);
}
function driveDistance(start,target){
  const queue=[[...start,0]],seen=new Set([start.join(':')]);
  for(let i=0;i<queue.length;i++){
    const [x,z,steps]=queue[i];if(x===target[0]&&z===target[1])return steps;
    for(const [dx,dz] of [[0,1],[1,0],[0,-1],[-1,0]]){
      const a=x+dx,b=z+dz,key=a+':'+b;if(seen.has(key))continue;
      if(canDrive(x+dx/2,z+dz/2)&&canDrive(a,b)){seen.add(key);queue.push([a,b,steps+1]);}
    }
  }
  return Infinity;
}
const [bx,,bz]=game.GHOST_RIVER_START,[rx,,rz]=game.REAR_RADIO,gridZ=Math.round(bz);
for(let i=0;i<=10;i++)assert.ok(canDrive(bx,bz+(gridZ-bz)*i/10));
const leg1=driveDistance([bx,gridZ],[0,16]),leg2=driveDistance([0,16],[rx,rz]);
assert.ok(Number.isFinite(leg1+leg2),'Bank → actual village bridge → rear station: full-width connected tank route');
console.log('Collision-checked bank → bridge → rear station, metres:',Math.abs(gridZ-bz)+leg1,leg2);
const material=new T.MeshBasicMaterial({side:T.DoubleSide}),unit=new T.BoxGeometry(1,1,1);
const mesh=(g,x=0,y=0,z=0)=>{const m=new T.Mesh(g,material);m.position.set(x,y,z);return m;};
const point=new T.Vector3(),direction=new T.Vector3(),ray=new T.Raycaster(),hits=[];
const blocked=(meshes)=>{hits.length=0;ray.intersectObjects(meshes,false,hits);return hits.length>0;};
function cameraAt(z,x=0,yaw=Math.PI) {
  const tank=new T.Group(),camera=new T.PerspectiveCamera(60,16/9,.1,320);
  tank.position.set(x,0,z);tank.rotation.y=yaw;
  globalThis.vistaState={camera};
  renderToString(React.createElement(game.CameraRig,{tankRef:{current:tank}}));
  for(let i=0;i<150;i++)globalThis.vistaState.frame({},1/60);
  camera.updateMatrixWorld();return camera;
}
function house(block,x,z) {
  const m=mesh(game.createStructureGeometry(block.category,game.villageStructureVariant(block.path)),x,block.position[1],z);
  m.scale.setScalar(block.scale);m.rotation.y=game.villageHutYaw(block.path,x,z);m.updateMatrixWorld();return m;
}
const campaigns=game.createCampaignFixtures();
for(const [dir,entries] of [[game.TRAINING_DIRECTORY,game.createTrainingEntries()],[game.CAMPAIGN_ROOT,campaigns.directories.get(game.CAMPAIGN_ROOT).children]]) {
  const objective=game.createFileObjective(entries,dir),page=game.createSectorPage(entries,0,objective?.targets[0].path);
  let blocks;function Capture(){blocks=game.useFileBlocks(page.entries,objective,page.layoutEntries).allBlocks;return null;}
  renderToString(React.createElement(Capture));
  assert.equal(blocks.length,entries.filter(e=>!e.is_dir).length);
  const huts=blocks.map(b=>house(b,b.position[0],b.position[2]));
  const moved=blocks.map((b,i)=>game.atDownstreamHut(b.position[0],b.position[2])?i:-1).filter(i=>i!==-1);
  assert.equal(moved.length,1);
  const i=moved[0],b=blocks[i],plot=game.DOWNSTREAM_HUT_PLOT;
  assert.ok(game.inGhostRiverHutPlot(b.position[0],b.position[2]),'Moved home retains its practice impact skin');
  const previous=house(b,-5.5+b.position[0]-plot.x,7+b.position[2]-plot.z);
  const original=huts.map((h,k)=>k===i?previous:h);
  const seed=game.hashCombatSession(dir),stations=game.createRiverStations(seed),ground=game.createTankGroundProfile(stations,seed);
  const landing=mesh(game.createRiverLanding(stations));landing.updateMatrixWorld();
  const timber=game.createRiverBridgePlanks(stations,seed).map(p=>{
    const m=mesh(unit,p.x,p.y,p.z);m.rotation.set(0,p.rotation,p.pitch??0);
    m.scale.set(p.scaleX,p.scaleY,p.scaleZ);m.updateMatrixWorld();return m;
  });
  {
    const bridge=game.createRiverCrossings(stations).find(s=>s.kind==='bridge');
    const launchable=(x,z,yaw)=>!game.tankFootprintBlocked(x,z,yaw,(px,pz,r)=>
      game.intersectsTerrainMound(px,pz,r)||game.isInsidePaddy(px,pz,r)||game.isInsideRiverCorridor(px,pz,stations,r));
    const actorSeed=(game.hashCombatSession(dir===game.TRAINING_DIRECTORY?1:0)^1968)>>>0,actors=[...game.createUSInfantryCombatants(),...game.fitVietCongToVillage(game.createVietCongCombatants(actorSeed,12),blocks.map(game.createVillageObstacle),actorSeed)];
    const [x,,z]=game.GHOST_RIVER_START,yaw=game.GHOST_RIVER_YAW;
    assert.ok(game.startsOnRiverBank('training','river'));
    for(const mode of ['directory','training','cleanup','horde'])assert.ok(!game.startsOnRiverBank(mode));
    if(dir===game.CAMPAIGN_ROOT){
      const spawn=new T.Vector3(0,0,-12),forward=new T.Vector3(0,0,-1).applyAxisAngle(new T.Vector3(0,1,0),Math.PI);
      const toward=new T.Vector3(bridge.centerX,0,bridge.z).sub(spawn).normalize();
      assert.ok(forward.dot(toward)>.9999,'Stock hull heading points along the bridge centerline');
      const camera=cameraAt(spawn.z,spawn.x,Math.PI),deck=new T.Vector3(bridge.centerX,1,bridge.z).project(camera);
      assert.ok(Math.abs(deck.x)<.25&&Math.abs(deck.y)<.75&&Math.abs(deck.z)<1,'Main trestle is visible ahead in the settled stock chase camera');
      console.log('Campaign bridge road: start, hull alignment, bridge center in chase frame (NDC)',spawn.toArray(),forward.dot(toward),deck.toArray());
    }
    for(let d=0;d<=2.3;d+=.1)assert.ok(launchable(x-Math.sin(yaw)*d,z-Math.cos(yaw)*d,yaw),'Dry clear start and ordinary forward input');
    assert.ok(actors.every(a=>Math.hypot(a.position[0]-x,a.position[2]-z)>4.2));
    assert.ok(blocks.every(b=>Math.hypot(b.position[0]-x,b.position[2]-z)>b.scale*1.6+1.5));
    const cam=cameraAt(z,x,yaw),v=new T.Vector3(0,1,bridge.z).project(cam),eyes=cam.position;
    {
      const patches=[game.cutGroundAroundRiver(stations),game.createRiverSurfaceGeometry(stations,seed),game.createRiverTalus(stations,seed),game.createRiverSurfaceGeometry(stations,seed,true)].map((g,i)=>{const m=mesh(g);m.name=['soil','bed','stones','water'][i];m.updateMatrixWorld();return m;});
      const shelfWidths=[];
      for(const py of [990,900,795,700,620]){
        const run=[],width=[0,0];let last='',pastWater=false;
        for(let px=760;px<1680;px+=6){ray.setFromCamera(new T.Vector2(px/960-1,1-py/540),cam);ray.far=120; const surfaceHits=ray.intersectObjects(patches,false),h=surfaceHits[0];if(!h)continue;
          if(h.object.name==='water')pastWater=true;
          // Exposed clay and its rooted grass/embedded gravel are the same
          // bank. Do not accidentally subtract the actual discharge fans
          // from the shelf simply because a decorative triangle is on top.
          const support=h.object.name==='stones'?surfaceHits.find(q=>q.object.name!=='stones'):h;
          if(support?.object.name==='soil'&&support.point.y<-.113){width[pastWater?1:0]+=6;
            assert.ok(Math.abs(support.point.y-ground.height(support.point.x,support.point.z))<.00002,'Dry collar triangles must carry the actual tank');}
          if(h.object.name===last)continue;
          last=h.object.name;run.push([px,last,...h.point.toArray().map(a=>+a.toFixed(1))]);}
        shelfWidths.push(width);if(process.argv.includes('--shore-sample'))console.log('shore raster',dir,py,JSON.stringify(run));
      }patches.forEach(m=>m.geometry.dispose());
      console.log(dir,'physically lowered dry shelf visible [left,right] px at rows 990/900/795/700/620:',shelfWidths);
      assert.ok(shelfWidths.slice(0,2).every(([left,right])=>left>=48&&right>=132),'Both foreground shelves remain substantial in the playable lens');
      // At the centre of the new inset pool we should actually lose some
      // dry margin to water, but not erase either physical clay transition.
      assert.ok(shelfWidths[2][0]>0&&shelfWidths[2][1]>=78,'An exposed clay toe on the depositing bank and a continuous terrace still frame the wider mid-pool');
      assert.ok(shelfWidths.every(([,right])=>right>=48),'Western silt bench stays visible along the reach');
      for(let d=0;d<=2.3;d+=.1)for(const lx of [-.76,.76])for(const lz of [-1,0,1]){
        const tx=x-Math.sin(yaw)*d+Math.cos(yaw)*lx+Math.sin(yaw)*lz,tz=z-Math.cos(yaw)*d-Math.sin(yaw)*lx+Math.cos(yaw)*lz;
        assert.ok(Math.abs(ground.height(tx,tz)+.07)<.001,'Both launch tracks retain the flat dry turnout');}
      for(const obj of [...blocks,...actors]){
        const [ox,,oz]=obj.position;
        assert.ok(Math.abs(ground.height(ox,oz)+.07)<.001,'Every opening house and actor retains its original level ground: '+(obj.id??obj.path)+' '+[ox,oz,ground.height(ox,oz)]);
      }
    }
    {
      const plans=[false,true].map(stageRiverBank=>game.createDenseJunglePlacements({seed,distanceToRoad:game.distanceToRoad,
        stageRiverBank,isInsidePaddy:game.isInsidePaddy,isInsideObjectiveClearing:dir===game.TRAINING_DIRECTORY?game.isInsideObjectiveClearing:game.isInsideOutpostClearing}));
      const oldControl=game.historicFootprintJungle({seed,distanceToRoad:game.distanceToRoad,stageRiverBank:false,isInsidePaddy:game.isInsidePaddy,
        isInsideObjectiveClearing:dir===game.TRAINING_DIRECTORY?game.isInsideObjectiveClearing:game.isInsideOutpostClearing});
      const tally=[[0,0],[0,0]],targeted=[];
      for(const [key,g] of [['bananas',game.createJungleBananaGeometry()],['broadleaf',game.createJungleBroadleafGeometry()],
        ['nearTrunks',game.createJungleTrunkGeometry()],['farTrunks',game.createJungleTrunkGeometry(false,'far')]]){
        // Root skirts have up to three small leaf fans per adult tree. A
        // moved tree can lose a fan to the ordinary road/paddy clearance at
        // its new site. Every actual tree and every banana must still exist.
        if(key==='broadleaf') assert.ok(Math.abs(plans[0][key].length-plans[1][key].length)<=3);
        else assert.equal(plans[0][key].length,plans[1][key].length,'Re-site the focal plants; preserve every tree and banana');
        const posKey=p=>p.x+':'+p.z,afterRoots=new Set(plans[1][key].map(posKey));
        const localChanges=plans[0][key].filter(p=>!afterRoots.has(posKey(p)));
        assert.ok(localChanges.every(p=>p.x>=-21.8&&p.x<=-10.4&&p.z>=2&&p.z<=7.8),'No unrelated plant anchors moved');
        // Reconstruct the old control on its ORIGINAL banks. The post-pool
        // river correctly excludes old trees that would be standing in water.
        for(const [stage,plan] of [oldControl,plans[1]].entries())for(const p of plan[key]){
          if(Math.hypot(p.x-eyes.x,p.z-eyes.z)>20)continue;
          const w=mesh(g,p.x,p.y,p.z);w.rotation.y=p.rotation;w.scale.set(p.sx,p.sy,p.sz);w.updateMatrixWorld();let center=0,right=0;
          for(let sy=270;sy<960;sy+=30)for(let sx=740;sx<1800;sx+=30){
            ray.setFromCamera(new T.Vector2(sx/960-1,1-sy/540),cam);ray.far=20;
            if(!blocked([w]))continue;if(sx<1490)center++;else right++;
          }
          tally[stage][0]+=center;tally[stage][1]+=right;
          if(stage===1&&center&&process.env.ESTUARY_SIGHT)console.log('remaining sight blocker',dir,key,p.x,p.z,center);
          if(stage===0&&(center>8||right>16))targeted.push([key,+p.x.toFixed(2),+p.z.toFixed(2)]);
        }g.dispose();
      }
      console.log(dir,'R11 → replanted focal aperture intersections [aim/bridge, right edge]',tally,'R11 blockers',targeted);
      assert.ok(tally[0][0]>=75&&tally[0][1]>=85,'Control reproduces the R11 obstruction');
      assert.ok(tally[1][0]<tally[0][0]*.16&&tally[1][1]<tally[0][1]*.12,'Root relocation clears both actual lens regions');
    }
    const end=(sign)=>new T.Vector3(0,1,bridge.z+sign*bridge.length/2).project(cam).x;
    assert.ok(v.x>.19&&v.x<.52&&Math.abs(end(1)-end(-1))>.48,'Trestle presents its long side to the right of center');
    let wet=0,side=0,cols=new Set();
    for(let py=420;py<994;py+=19)for(let px=244;px<1680;px+=19){
      direction.set(px/960-1,1-py/540,.2).unproject(cam).sub(eyes).normalize();
      if(direction.y>=0)continue;
      const len=(game.RIVER_WATER_Y-eyes.y)/direction.y;
      point.copy(eyes).addScaledVector(direction,len);
      if(point.z<0||point.z>27||game.riverWaterImmersion(point.x,point.z,stations)<.2)continue;
      let behindBank=false;
      for(let d=.2;d<len-.025;d+=.15)if(ground.height(eyes.x+direction.x*d,eyes.z+direction.z*d)>eyes.y+direction.y*d+.001){behindBank=true;break;}
      ray.set(eyes,direction);ray.far=len;
      if(behindBank||blocked(huts)||blocked([landing])||blocked(timber))continue;
      wet++;cols.add(px);if(px>950)side++;
    }
    console.log(dir,'real bank launch: water samples',wet,'right',side,'screen span',cols.size*19,'bridge normalized span',Math.abs(end(1)-end(-1)).toFixed(2));
    assert.ok(wet>=90&&side>wet*.78&&cols.size*19>380,'Visible real channel beyond the tank, not just flooded rice');
  }
  // Preserve the previous real drive-through from the center lane too.
  for(const tankZ of [2.5,5.5]) {
    const camera=cameraAt(tankZ),counts=[0,0],spans=[new Set(),new Set()];
    // Off the tank and outside the HUD panels: the intended open elbow between
    // the bridge mouth and the right margin, not paddy reflections or sky.
    for(let y=425;y<840;y+=7)for(let x=1090;x<=1645;x+=7){
      direction.set(x/960-1,1-y/540,.2).unproject(camera).sub(camera.position).normalize();
      if(direction.y>=0)continue;
      const length=(game.RIVER_WATER_Y-camera.position.y)/direction.y;
      point.copy(camera.position).addScaledVector(direction,length);
      if(point.z<3||point.z>24||game.riverWaterImmersion(point.x,point.z,stations)<.05)continue;
      // Reject water hidden by the dry bank, rendered bridge (including all
      // ropes/posts) or the fixed stilt landing before testing hut triangles.
      let hidden=false;
      for(let d=.1;d<length-.025;d+=.11){
        if(ground.height(camera.position.x+direction.x*d,camera.position.z+direction.z*d)>camera.position.y+direction.y*d+.001){hidden=true;break;}
      }
      ray.set(camera.position,direction);ray.far=length;
      if(hidden||blocked(timber)||blocked([landing]))continue;
      for(const [k,group] of [original,huts].entries())if(!blocked(group)){counts[k]++;spans[k].add(x);}
    }
    const fraction=counts[1]/Math.max(1,counts[0]);
    console.log(dir,'chase at z='+tankZ,'visible river grid samples, R5 → now',counts,'horizontal columns',spans.map(s=>s.size));
    assert.ok(counts[1]>=130&&spans[1].size>=46,'A broad open bend must reach beyond the timber deck');
    if(tankZ===2.5)assert.ok(fraction>1.65,'The central approach must still reveal substantially more water than the original R5 plot');
  }
  [...huts,previous,landing].forEach(m=>m.geometry.dispose());
}
unit.dispose();material.dispose();delete globalThis.vistaState;
