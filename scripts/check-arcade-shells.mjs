// A real mounted ProjectileManager using controlled frames. No desktop file,
// network connection, fake collision function or GL browser is required.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import React from 'react';
import { act,context,extend,reconciler } from '@react-three/fiber';
import * as THREE from 'three';

async function load(path) {
  const result=await build({configFile:false,logLevel:'silent',publicDir:false,
    esbuild:{jsx:'automatic'}, build:{ssr:fileURLToPath(new URL(path,import.meta.url)),write:false,minify:false}});
  const source=result.output.find(c=>c.type==='chunk'&&c.isEntry).code
    .replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const { ProjectileManager }=await load('../src/components/Scene/ProjectileManager.tsx');
const { CRAWLER,firstFieldContact,FIELD_FLOOR_Y }=await load('../src/lib/arcadeShell.ts');
const {terrainReliefHeight}=await load('../src/lib/terrain.ts');
globalThis.IS_REACT_ACT_ENVIRONMENT=true; extend(THREE);
const v=(...a)=>new THREE.Vector3(...a);
const close=(a,b,margin)=>assert.ok(Math.abs(a-b)<margin,`${a} outside ${b} ±${margin}`);
assert.equal(firstFieldContact(v(-15,3,-5),v(-15,2.5,-5)),null,'High clear sweep over actual raised mound');
close(firstFieldContact(v(-15,2,-5),v(-15,-1,-5)),(2-terrainReliefHeight(-15,-5))/3,1e-8);
const block=(path,x,y,z)=>({path,position:[x,y,z]});
let serial=0;
async function shoot({rate,origin,direction=[0,0,1],kind='cannon',blocks=[],enemies=[],shields=true,
  duration=3.3,passAt=.62,sequence=[]}) {
  const scene=new THREE.Scene(), callbacks=new Set();
  const state={scene,camera:new THREE.PerspectiveCamera(),invalidate(){},internal:{active:false,frames:0,
    interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
    subscribe(ref){ callbacks.add(ref);return ()=>callbacks.delete(ref); }}};
  const store=Object.assign((f=x=>x)=>f(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
  scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
  const fail=e=>{throw e;};
  const root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
  const shot={position:v(...origin),direction:v(...direction).normalize(),active:true,lifetime:0,kind,triggerId:1};
  const files=[],actors=[],samples=[];
  if(sequence.length)shot.active=false;
  let killed=0, sawPulse=false, sawScreens=false, flightSample=null, firstPulse=null, peakEcho=null, struckFace=null;
  const tr=new THREE.Matrix4(),pos=v();
  async function mount(element) {
    await act(async()=>reconciler.updateContainer(React.createElement(context.Provider,{value:store},element),root,null,null));
  }
  try {
    await mount(React.createElement(ProjectileManager,{key:serial++,pool:{current:[shot]},
      despawn:i=>{assert.equal(i,0);shot.active=false;killed++;},onHit:p=>files.push(p),
      onEnemyHit:id=>actors.push(id),allBlocks:blocks,enemies,showPracticeShields:shields}));
    const cart=scene.getObjectByName('arcade-range-crawler');
    sawScreens=!!cart;
    for(let i=0;i<Math.ceil(duration*rate);i++) {
      for(const [time,bay] of sequence)if(i===Math.round(time*rate)){
        const aim=cart.getObjectByName(bay==='cell'?'arcade-range-crawler-aim':'arcade-range-crawler-empty-aim');
        const worldAim=aim.getWorldPosition(v());
        // Same ground-plane bearing as a normal trusted canvas click from spawn.
        shot.position.set(0,.82,-12);
        shot.direction.set(worldAim.x,0,worldAim.z+12).normalize();
        shot.position.addScaledVector(shot.direction,2.02);
        shot.lifetime=0;shot.active=true;
      }
      for(const ref of callbacks)ref.current({},1/rate);
      if(cart)samples.push({power:cart.userData.power,response:cart.userData.shieldResponse,hits:cart.userData.hits,resets:cart.userData.reboots,
        x:cart.position.x,live:cart.getObjectByName('arcade-crawler-powered-plate').visible,
        ring:cart.getObjectByName('arcade-crawler-reboot-ring').visible});
      if(i+1===Math.round(passAt*rate))flightSample=shot.position.clone();
      const fx=scene.getObjectByName('arcade-contact-echoes');
      if(fx?.count>0) {
        assert.equal(fx.count,5,'One small pooled response only');
        fx.getMatrixAt(0,tr);pos.setFromMatrixPosition(tr);
        if(!sawPulse){
          firstPulse=pos.clone();
          const skin=cart?.getObjectByName('arcade-crawler-contact-skin');
          if(skin){
            skin.updateWorldMatrix(true,false);
            const probe=new THREE.Raycaster(pos.clone().addScaledVector(shot.direction,-.04),shot.direction,0,.08);
            const hit=probe.intersectObject(skin,false)[0];
            if(hit)struckFace={point:hit.point,normal:hit.face.normal.clone().transformDirection(skin.matrixWorld)};
          }
        }
        else if(!peakEcho || firstPulse.distanceToSquared(pos)>firstPulse.distanceToSquared(peakEcho))peakEcho=pos.clone();
        sawPulse=true;
      }
    }
    return {files,actors,killed,sawPulse,sawScreens,flightSample,firstPulse,peakEcho,struckFace,samples,position:shot.position.clone()};
  } finally {await mount(null);}
}
let comparable=null;
for(const rate of [30,60,120]) {
  const skinX=CRAWLER.x-.72;
  const direct=await shoot({rate,origin:[skinX,.80,CRAWLER.z-1.2],duration:.8});
  assert.ok(direct.struckFace && direct.samples.some(s=>s.response==='pass'&&s.power==='cell-drained'));
  assert.ok(direct.struckFace.point.distanceTo(direct.firstPulse)<.01,'Flash begins on rendered shield triangle');
  close(direct.peakEcho.z-direct.firstPulse.z,.39,.005);
  assert.ok(direct.struckFace.normal.z<-.98,'Direct front contact sends the bounded pulse into the shell');
  for(const [side,forward] of [[1,1],[-1,1],[1,-1]]) {
    const heading=v(side*.935,0,forward*.355).normalize();
    const skim=await shoot({rate,origin:[skinX-side*.66,.80,CRAWLER.z-forward*.824],direction:heading.toArray(),
      duration:.8,blocks:[block('past-cart',skinX+side*3,.8,CRAWLER.z-forward*.6)]});
    assert.ok(skim.struckFace && skim.samples.some(s=>s.response==='bend'&&s.power==='shielded'));
    const echo=skim.peakEcho.clone().sub(skim.firstPulse), normal=skim.struckFace.normal;
    assert.ok(skim.struckFace.point.distanceTo(skim.firstPulse)<.01,'Skip starts on the actual mesh, not its coarse box');
    assert.ok(heading.dot(normal)<0 && echo.dot(normal)>0,'Return leaves the surface actually entered');
    assert.ok(echo.length()<=1.561 && echo.normalize().dot(heading.clone().reflect(normal))>.999);
    assert.deepEqual(skim.files,[]);assert.equal(skim.killed,1);
  }
  const cart=await shoot({rate,origin:[0,.82,-12],duration:7.5,sequence:[[.2,'cell'],[1.35,'cell'],[2.55,'cell']],
    blocks:[block('behind-crawler',-5.0,.82,3.6),block('behind-crawler2',-5.8,.82,6)]});
  assert.ok(cart.sawScreens && cart.sawPulse);assert.equal(cart.killed,3);
  assert.deepEqual(cart.files,[],'Neither blocked shot, forward echo, nor an offline hit reaches a file');
  const changing=cart.samples.filter((q,i,a)=>i===0 || q.power!==a[i-1].power);
  assert.deepEqual(changing.map(s=>s.power),['shielded','cell-drained','offline','shielded']);
  assert.deepEqual(changing.map(s=>s.live),[true,false,false,true],'Actual plate swaps match the gameplay state');
  assert.equal(cart.samples.at(-1).resets,1);assert.equal(cart.samples.at(-1).hits,2,'Offline hit is inert, not another drain');
  const dark=cart.samples.filter(s=>s.power==='offline');
  assert.ok(dark.some(s=>s.ring),'Shutdown has a visible large pulse');
  assert.ok(Math.abs(dark.length/rate-CRAWLER.reboot)<2/rate,'Offline shots do not extend the reboot');
  close(dark[0].x,dark.at(-1).x,1e-6);assert.ok(Math.abs(cart.samples[0].x-dark[0].x)>.1,'Crawler moves before shutdown');
  const empty=await shoot({rate,origin:[0,.82,-12],duration:2,sequence:[[.2,'empty']]});
  assert.ok(empty.samples.some(s=>s.power==='offline') && !empty.samples.some(s=>s.power==='cell-drained'),
    'The independently marked empty bay powers down in one direct hit');
  const front=await shoot({rate,origin:[200,.90,40],blocks:[block('first',200,.90,46),block('second',200,.90,49)]});
  assert.deepEqual(front.files,['first']);assert.equal(front.killed,1);
  const earlyFile=await shoot({rate,origin:[CRAWLER.x,.89,-12],
    blocks:[block('before-screen',CRAWLER.x,.89,-9),block('behind-screen',CRAWLER.x,.89,3.6)]});
  assert.deepEqual(earlyFile.files,['before-screen']);assert.equal(earlyFile.sawPulse,false);
  const hidden=await shoot({rate,origin:[CRAWLER.x,.89,-11],shields:false,blocks:[block('sim',CRAWLER.x,.89,3.6)]});
  assert.deepEqual(hidden.files,['sim']);assert.equal(hidden.sawScreens,false);
  const clear=await shoot({rate,origin:[200,.82,0],passAt:.6});
  assert.ok(clear.flightSample.y<.78 && clear.flightSample.y>.50);
  assert.ok(clear.sawPulse && clear.killed===1,'Hanging tracer ends at real ground');
  close(clear.firstPulse.y,FIELD_FLOOR_Y+.045,.0002);
  const mound=await shoot({rate,origin:[-15,.26,-11],blocks:[block('hidden-by-mound',-15,.25,-3)]});
  assert.ok(mound.sawPulse && !mound.files.length,'Actual raised terrain stops the shot before file');
  assert.ok(mound.firstPulse.y>FIELD_FLOOR_Y+.18);
  const mg=await shoot({rate,kind:'machinegun',origin:[200,.82,0],passAt:.6});
  close(mg.flightSample.y,.82,1e-8);assert.equal(mg.sawPulse,false,'Existing straight automatic path is intact');
  const limit=await shoot({rate,kind:'machinegun',origin:[200,.82,0],blocks:[block('beyond-range',200,.82,32)]});
  assert.deepEqual(limit.files,[]);close(limit.position.z,30,.0001);
  const inside=await shoot({rate,kind:'machinegun',origin:[200,.82,0],blocks:[block('inside-range',200,.82,29)]});
  assert.deepEqual(inside.files,['inside-range']);
  if(comparable) {
    assert.ok(comparable.sample.distanceTo(clear.flightSample)<1e-7,'Flight shape independent of frame rate');
    assert.ok(comparable.contact.distanceTo(clear.firstPulse)<.004,'Field contact independent of frame rate');
  } else comparable={sample:clear.flightSample,contact:clear.firstPulse};
}
const resumed=await shoot({rate:1,origin:[200,.90,0],blocks:[block('never-replay',200,.90,6)]});
assert.equal(resumed.killed,1);assert.deepEqual(resumed.files,[],'Suspended frame cannot deliver an unseen file hit');
console.log('Mounted arcade shells: 30/60/120 Hz shell/terrain, moving cargo crawler, bright/spent plates, shutdown, stationary reboot, inert echoes and file isolation passed.');
