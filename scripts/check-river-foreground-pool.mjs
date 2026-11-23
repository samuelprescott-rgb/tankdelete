// Reproject the real level water plane, per-triangle bed / bank and resurveyed
// stones through the R23 production chase camera. This measures visible
// hydraulic geometry, not colours in photographs or a synthetic lower lens.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import * as T from 'three';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const entry=root+'/virtual-foreground-river.mjs';
const exportsFrom={'lib/training':'TRAINING_DIRECTORY','lib/combat':'hashCombatSession',
  'lib/tankGroundProfile':'createTankGroundProfile','components/Scene/riverLayout':'createRiverStations,sampleRiverStation,createRiverCrossings',
  'components/Scene/riverVerticalSection':'RIVER_WATER_Y','components/Scene/riverTalus':'createRiverTalus',
  'components/Scene/VietnamEnvironment':'createRiverSurfaceGeometry','components/Scene/TerrainSurface':'cutGroundAroundRiver'};
const buildOut=await build({root,configFile:false,publicDir:false,logLevel:'silent',plugins:[{name:'real-foreground-river',
  resolveId:id=>id===entry?entry:null,load:id=>id===entry?Object.entries(exportsFrom).map(([p,n])=>'export {'+n+'} from '+JSON.stringify(root+'/src/'+p)).join('\n'):null}],build:{ssr:entry,write:false}});
const code=buildOut.output.find(c=>c.type==='chunk'&&c.isEntry).code.replace(/\b(from|import) "([^"]+)"/g,(_,op,p)=>op+' '+JSON.stringify(import.meta.resolve(p)));
const game=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const artifactRoot=new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/game/',import.meta.url);
const rec=JSON.parse(await readFile(process.argv[2]||new URL('micro-r23/receipt.json',artifactRoot),'utf8'));
const shot=rec.shots.find(s=>s.id==='river-chase');
assert.equal(shot.camera,'production chase');assert.deepEqual(shot.canvas,[1920,1080]);
const seed=game.hashCombatSession(game.TRAINING_DIRECTORY),river=game.createRiverStations(seed),
  ground=game.createTankGroundProfile(river,seed),deck=game.createRiverCrossings(river).find(b=>b.kind==='bridge'),
  talus=new T.Mesh(game.createRiverTalus(river,seed),new T.MeshBasicMaterial({side:T.DoubleSide}));
const pos=new T.Vector3(...shot.eye),q=new T.Quaternion(...shot.quaternion),fov=Math.tan(shot.verticalFov*Math.PI/360);
const ray=new T.Raycaster(),raydir=new T.Vector3(),hits=[];
function sample(x,y){
  const dir=raydir.set((x/960-1)*fov*16/9,(1-y/540)*fov,-1).normalize().applyQuaternion(q);
  const len=(game.RIVER_WATER_Y-pos.y)/dir.y,wx=pos.x+len*dir.x,wz=pos.z+len*dir.z;
  const s=game.sampleRiverStation(river,wz);
  if(!s||Math.abs(wx-s.centerX)>=s.waterHalfWidth)return 0;
  for(let d=.1;d<len-.025;d+=.07)
    if(ground.height(pos.x+dir.x*d,pos.z+dir.z*d)>pos.y+dir.y*d+.001)return 0;
  ray.set(pos,dir);ray.far=len;hits.length=0;ray.intersectObject(talus,false,hits);
  return hits.length?1:2;
}
const result=[];
for(const y of [650,700,760,820,900,975]){
  const channel=[],open=[];
  for(let x=765;x<=1850;x+=3){const value=sample(x,y);if(value)channel.push(x);if(value===2)open.push(x);}
  result.push({y,left:channel[0],right:channel.at(-1),span:channel.at(-1)-channel[0],unblocked:open.length*3});
}
console.log('Ordinary production lens; actual terrain line of sight + real shoreline stones, pixels at 1920×1080:',result,deck);
// Measured with this same lens, survey, occlusion and quantization before
// changing any geometry. Pixel span includes gaps behind the patrol spur;
// unblocked counts only true open water after visible shore rocks.
const baseline=[201,210,201,183,168,168],oldOpen=[204,213,204,186,99,171];
assert.ok(result[0].span>baseline[0]*.78&&result[0].span<baseline[0]*1.18,'Bridge throat stays narrow');
for(const k of [2,3,4,5])assert.ok(result[k].span>baseline[k]*1.62&&result[k].unblocked>oldOpen[k]*1.48,'Physically visible open water increases, not just its bounding box');
assert.ok(result[4].span>result[5].span*1.65,'The remaining foot-patrol point interrupts the bank outline');
assert.deepEqual([deck.centerX,deck.z,deck.length,deck.width],[0,15.39,13.08,4.7],'Original trestle sills and run-ons');
const meshes=[game.cutGroundAroundRiver(river),game.createRiverSurfaceGeometry(river,seed),game.createRiverSurfaceGeometry(river,seed,true)]
  .map((g,i)=>{const m=new T.Mesh(g,talus.material);m.name=['soil','bed','water'][i];return m;});
meshes.push(talus);talus.name='talus';const receivers={};
for(const stage of ['micro-r14','micro-r23']){
  const shore=JSON.parse(await readFile(new URL(stage+'/shore/receipt.json',artifactRoot),'utf8')).shots;
  const wet=JSON.parse(await readFile(new URL(stage+'/surface-receipt.json',artifactRoot),'utf8')).shots.find(s=>s.id==='water');
  for(const s of [...shore,wet]){
    const nm=s.id,cam=new T.PerspectiveCamera(s.verticalFov??s.fov,16/9,.1,340);
    cam.position.fromArray(s.eye);cam.quaternion.fromArray(s.quaternion);cam.updateMatrixWorld();
    const lens=[...s.eye,...s.quaternion,s.verticalFov??s.fov];
    if(receivers[nm]){assert.deepEqual(lens,receivers[nm],'Retained R14/R23 camera must remain reproducible');continue;}
    receivers[nm]=lens;const count={water:0,stone:0,root:0};
    for(let y=28;y<1080;y+=48)for(let x=38;x<1920;x+=64){
      ray.setFromCamera(new T.Vector2(x/960-1,1-y/540),cam);ray.far=45;hits.length=0;ray.intersectObjects(meshes,false,hits);
      const h=hits[0];if(h?.object.name==='water')count.water++;
      if(h?.object===talus){const type=talus.geometry.attributes.bankFigure.getX(h.face.a);
        if(type===1)count.stone++;if(type===2)count.root++;}
    }
    console.log('Unchanged R14/R23 gallery camera onto R24 first-hit targets:',nm,count);
    assert.ok(count.water>20);
    if(nm==='bank-fig-roots')assert.ok(count.root>25,'Old gallery must actually see the fig stool');
    if(nm==='bank-wet-ledge')assert.ok(count.stone>25,'Old gallery must actually see the wet stone');
  }
}
for(const m of meshes)m.geometry.dispose();talus.material.dispose();
