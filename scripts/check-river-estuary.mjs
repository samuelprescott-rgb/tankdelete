// Measure downstream of the trestle itself, not the foreground pool.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {build} from 'vite';
import * as T from 'three';
import React from 'react';
import {renderToString} from 'react-dom/server';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),entry=root+'/virtual-estuary.mjs';
const mods={'lib/training':'TRAINING_DIRECTORY,createTrainingEntries','lib/combat':'hashCombatSession','lib/terrain':'TERRAIN_MOUNDS',
  'lib/layout':'villageHutYaw,villageStructureVariant,layoutFilesInGrid','lib/mission':'createFileObjective,FILE_OBJECTIVE_RESERVED_ZONE',
  'hooks/useFileBlocks':'useFileBlocks','lib/sectorPaging':'createSectorPage','lib/tankGroundProfile':'createTankGroundProfile',
  'components/Scene/riverLayout':'createRiverStations,sampleRiverStation,createRiverCrossings,riverWaterImmersion,distanceToRiverWater',
  'components/Scene/riverVerticalSection':'RIVER_WATER_Y','components/Scene/riverLanding':'createRiverLanding,riverLandingSite',
  'components/Scene/FileBlocks':'createStructureGeometry','components/Scene/VietnamEnvironment':'createRiverBridgePlanks,createRiverSurfaceGeometry',
  'components/Scene/TerrainSurface':'cutGroundAroundRiver'};
const out=await build({root,configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},plugins:[{name:'estuary',enforce:'pre',
  resolveId:id=>id===entry?entry:null,transform(src,id){
    if(id.endsWith('/layout.ts?r24Survey'))return src.replace("'../components/Scene/riverLayout'","'../components/Scene/riverLayout.ts?r24Survey'");
    if(id.endsWith('/riverLayout.ts?r24Survey')||(process.env.ESTUARY_BEFORE&&id.endsWith('/riverLayout.ts')))return src
      .replace('FIRST_OUTLET_ROW=58,LAST_OUTLET_ROW=80','FIRST_OUTLET_ROW=58,LAST_OUTLET_ROW=58')
      .replace('let {west,east}=estuaryMargins(s.z);','let west=0,east=0;');
    if(process.env.ESTUARY_BEFORE&&id.endsWith('/riverVerticalSection.ts'))return src.replace('if(z>23.8&&z<41.2)','if(false)');
  },load:id=>id===entry?Object.entries(mods).map(([p,n])=>'export {'+n+'} from '+JSON.stringify(root+'/src/'+p)).join('\n')+'\nexport {layoutFilesInGrid as oldLayout} from '+JSON.stringify(root+'/src/lib/layout.ts?r24Survey'):null}],build:{ssr:entry,write:false}});
const code=out.output.find(c=>c.isEntry).code.replace(/\b(from|import) "([^"]+)"/g,(_,op,p)=>op+' '+JSON.stringify(import.meta.resolve(p)));
const g=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const receipt=JSON.parse(await readFile(process.argv[2]||new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/game/micro-r24/receipt.json',import.meta.url),'utf8'));
const dir=g.TRAINING_DIRECTORY,seed=g.hashCombatSession(dir),entries=g.createTrainingEntries(),r=g.createRiverStations(seed),ground=g.createTankGroundProfile(r,seed),
  objective=g.createFileObjective(entries,dir),page=g.createSectorPage(entries,0,objective?.targets[0].path);
let blocks;
function Site(){blocks=g.useFileBlocks(page.entries,objective,page.layoutEntries).allBlocks;return null;}renderToString(React.createElement(Site));
const mat=new T.MeshBasicMaterial({side:T.DoubleSide}),unit=new T.BoxGeometry(1,1,1),blockers=[];
const mesh=(geo,x,y,z)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);blockers.push(m);return m;};
for(const b of blocks){const [x,y,z]=b.position,m=mesh(g.createStructureGeometry(b.category,g.villageStructureVariant(b.path)),x,y,z);m.scale.setScalar(b.scale);m.rotation.y=g.villageHutYaw(b.path,x,z);}
for(const p of g.createRiverBridgePlanks(r,seed)){const m=mesh(unit,p.x,p.y,p.z);m.rotation.set(0,p.rotation,p.pitch??0);m.scale.set(p.scaleX,p.scaleY,p.scaleZ);}
mesh(g.createRiverLanding(r),0,0,0).name='landing';
mesh(g.cutGroundAroundRiver(r),0,0,0).name='earth';mesh(g.createRiverSurfaceGeometry(r,seed),0,0,0).name='bed';
for(const m of blockers)m.updateMatrixWorld();
{
  const fs=Array.from({length:256},(_,i)=>({path:'/river-test/file-'+i+'.txt',name:'file-'+i+'.txt',is_dir:false,extension:'txt',size:i}));
  const opts={preserveSlots:true,reservedZones:[g.FILE_OBJECTIVE_RESERVED_ZONE]};
  const old=g.oldLayout(fs,opts),cur=g.layoutFilesInGrid(fs,opts);
  assert.deepEqual(cur,old,'Respect all original file/address pairs, not just the thirteen houses in the capture');
  console.log('Identical assigned permanent addresses for 256-file control:',cur.size);
}
const eye=new T.Vector3(),d=new T.Vector3(),q=new T.Quaternion(),ray=new T.Raycaster(),hits=[];
if(!process.env.ESTUARY_BEFORE){
  const soils=blockers.filter(m=>['earth','bed'].includes(m.name)),sill=g.riverLandingSite(r);
  assert.ok(sill.cx===6.85&&sill.z===22.23&&Math.abs(sill.yaw+.4845243760343143)<1e-10);
  let dry=0,wet=0;for(const z of [22.05,22.16,22.27,22.38])for(let x=-5.5;x<1.9;x+=.09){
    ray.set(eye.set(x,3,z),d.set(0,-1,0));hits.length=0;ray.intersectObjects(soils,false,hits);assert.ok(hits.length);
    assert.ok(Math.abs(hits[0].point.y-ground.height(x,z))<.0001,'Dry point/bed must have the same height as mounted rendered triangles');
    if(x>-.7&&x<1.3){assert.ok(ground.height(x,z)>-.09&&g.riverWaterImmersion(x,z,r)===0);dry++;}
    if(x< -4.2){assert.ok(ground.height(x,z)<g.RIVER_WATER_Y&&g.riverWaterImmersion(x,z,r)>.75);wet++;}
  }
  console.log('Independent road/split-channel first hits:',{dry,wet});
}
for(const s of receipt.shots.filter(s=>s.id==='river-chase'||s.id==='river-bank')){
  eye.fromArray(s.eye);q.fromArray(s.quaternion);const f=Math.tan(s.verticalFov*Math.PI/360),rows=[],sum=[0,0],blockedBy={};
  if(process.env.ESTUARY_SIGHT)for(const y of [477,521,550,575,600,625,655])console.log(s.id,y,[850,1050,1250,1450,1650,1810].map(x=>{
    d.set((x/960-1)*f*16/9,(1-y/540)*f,-1).normalize().applyQuaternion(q);
    const t=(g.RIVER_WATER_Y-eye.y)/d.y;return [eye.x+t*d.x,eye.z+t*d.z].map(n=>+n.toFixed(1));
  }));
  for(let y=390;y<=900;y+=3){
    let shore=0,open=0,l=2000,h=0,farReach=0;
    for(let x=360;x<=1872;x+=3){
      d.set((x/960-1)*f*16/9,(1-y/540)*f,-1).normalize().applyQuaternion(q);if(d.y>=-.015)continue;
      const t=(g.RIVER_WATER_Y-eye.y)/d.y,xx=eye.x+t*d.x,zz=eye.z+t*d.z;
      if(zz<14||zz>42||(xx<2.75&&!(zz>19.5&&xx< -2.55)))continue;
      const st=g.sampleRiverStation(r,zz);if(!st||Math.abs(xx-st.centerX)>st.waterHalfWidth)continue;
      shore++;ray.set(eye,d);ray.far=t;hits.length=0;ray.intersectObjects(blockers,false,hits);if(hits.length){const i=blockers.indexOf(hits[0].object),cat=i<blocks.length?'hut'+i:hits[0].object.name||'deck';blockedBy[cat]=(blockedBy[cat]||0)+1;continue;}open++;if(zz>=23.4)farReach++;
      l=Math.min(l,x);h=Math.max(h,x);
    }
    if(open){rows.push({y,shore:shore*3,open:open*3,far:farReach*3,span:h-l});sum[0]+=open*9;sum[1]+=farReach*9;}
  }
  const prior=s.id==='river-bank'?[2097,531]:[1611,288];
  if(process.env.ESTUARY_BEFORE)assert.deepEqual(sum,prior,'Reconstructed R24 survey and fixed camera');
  else{
    assert.ok(sum[0]>prior[0]*(s.id==='river-bank'?4:1.2)&&sum[1]>prior[1]*1.75,'The projected river / distant register grows after actual occlusion');
    if(s.id==='river-bank')assert.ok(rows.some(p=>p.y>730&&p.open>=190),'Side outlet reaches around the original timber sill');
  }
  console.log(s.id,'open-water area / beyond landing, R24 → current (3px grid):',prior,sum,'visible widths',rows.filter(p=>[459,471,576,588,750].includes(p.y)));
  if(process.env.ESTUARY_SIGHT)console.log(s.id,'most frequent blocking bank/hut/deck:',Object.entries(blockedBy).sort((a,b)=>b[1]-a[1]).slice(0,20));
}
for(const m of blockers)if(m.geometry!==unit)m.geometry.dispose();unit.dispose();mat.dispose();
