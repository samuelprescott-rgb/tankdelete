// Advance the actual mounted airframes, infantry rigs, and owning combat hook.
// No WebGL, browser, native bridge, timers, or game-file inputs required.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import * as THREE from 'three';
import {act,context,extend,reconciler} from '@react-three/fiber';
import {build} from 'vite';

const dir=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const entry=dir+'/virtual-campaign-flights-test.mjs';
const modules=['lib/campaignFlights','components/Scene/CampaignFlights','components/Scene/USInfantrySquad','hooks/useEnemyCombat'];
const bundle=await build({root:dir,configFile:false,publicDir:false,logLevel:'silent',
  plugins:[{name:'flight-test',resolveId(id){if(id===entry)return id;},load(id){if(id===entry)
    return modules.map(m=>'export * from '+JSON.stringify(dir+'/src/'+m)+';').join('\n');}}],
  esbuild:{jsx:'automatic'},build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
const source=bundle.output.find(x=>x.type==='chunk'&&x.isEntry).code
  .replace(/from "([^"]+)"/g,(_,s)=>'from '+JSON.stringify(import.meta.resolve(s)));
const {CampaignFlights,USInfantrySquad,useEnemyCombat,DAY_CREW,DAY_DOOR,DAY_PAD,DAY_STEP,RIDGE_CLEAR,
  RIDGE_IN,RIDGE_HIT,RIDGE_LOST,rimRadius,RELAY_SCALE,RELAY_RADIUS,ridgeGroundHeight,createRelayPass,canRunCampaignFlights,ridgePose}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const el=React.createElement;
for(const [launch,on] of [[{mode:'directory',directory:'sim://campaign'},true],[{mode:'training'},true],
  [{mode:'training',preview:'embassy'},false],[{mode:'training',preview:'river'},false],
  [{mode:'horde'},false],[{mode:'cleanup',fieldFiles:[]},false]]){
  assert.equal(canRunCampaignFlights(launch,false),on);
  assert.equal(canRunCampaignFlights(launch,true),false);
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(THREE);
const scene=new THREE.Scene(),subs=new Map(),cam=new THREE.PerspectiveCamera(60,16/9,.1,340);
// Unmodified start and heading of the live campaign's CameraRig.
cam.position.set(-2.95,3.12,-16.85);cam.lookAt(-1.03,1.82,-9.3);cam.updateMatrixWorld();
const state={scene,camera:cam,invalidate(){},internal:{active:false,frames:0,interaction:[],initialHits:[],
  hovered:new Map(),capturedMap:new Map(),subscribe(ref,p){subs.set(ref,p);return ()=>subs.delete(ref);}}};
const store=Object.assign((select=v=>v)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;};
const root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const render=child=>act(async()=>reconciler.updateContainer(el(context.Provider,{value:store},child),root,null,null));
let combat,now=0;const calls=[],shots=[],hits=[],admitted=[];
function Harness({sector,running=true}){
  combat=useEnemyCombat({sessionKey:sector});
  const enemy=combat.enemies[0];
  const target={...enemy,position:[8.3,.025,9],stance:'kneeling',alive:true};
  return el(React.Fragment,null,el(CampaignFlights,{key:'flight'+sector,running,roster:combat.friendlies,
    contacts:{actors:combat.enemies,poses:combat.enemyPosesRef},
    deploy:slot=>{const success=combat.deployCampaignPassenger(slot);admitted.push([slot,success]);return success;},
    onCall:call=>calls.push(call)}),el(USInfantrySquad,{key:'squad'+sector,friendlies:combat.friendlies,
    friendlyPosesRef:combat.friendlyPosesRef,enemies:[target],onFriendlyFire:e=>{if(e.soldierId.startsWith('kestrel-'))shots.push(e.soldierId);},
    onEnemyHit:e=>{if(e.soldierId.startsWith('kestrel-')){
      const result=combat.damageEnemy(e.enemyId,e.damage,'friendly-rifle');
      if(result)hits.push([e.soldierId,result.previousHealth,result.enemy.health]);
    }}}));
}
async function ticks(n,dt=.05){
  for(let i=0;i<n;i++)await act(async()=>{now+=dt;
    for(const [cb] of [...subs].sort((a,b)=>a[1]-b[1]))cb.current({...state,clock:{elapsedTime:now}},dt);
    scene.updateMatrixWorld(true);
  });
}
const obj=name=>scene.getObjectByName(name),vec=a=>new THREE.Vector3(...a);
// The player can turn before the call. The route locks once, works in both
// narrow and wide windows, and must traverse the player's screen LEFT→RIGHT.
const projected=[];
for(const [x,z,heading,aspect] of [[-2.95,-16.85,.249,16/9],[12,-6,1.44,4/3],[-20,12,-.86,16/10],[5,21,2.74,1.35]]){
  const lens=new THREE.PerspectiveCamera(60,aspect,.1,340),eye=new THREE.Vector3(x,3.12,z);
  lens.position.copy(eye);lens.lookAt(x+Math.sin(heading)*8,1.75,z+Math.cos(heading)*8);lens.updateMatrixWorld();
  const dir=lens.getWorldDirection(new THREE.Vector3()),route=createRelayPass(x,eye.y,z,dir.x,dir.y,dir.z,lens.fov,aspect);
  const ndc=t=>{const p=ridgePose(t,route);return new THREE.Vector3(p.x,p.y,p.z).project(lens);};
  const left=ndc(RIDGE_IN+.9),hit=ndc(RIDGE_HIT),fall=ndc(RIDGE_LOST-.45);
  assert.ok(left.x<-.7&&left.x>-1.06&&hit.x>.1&&hit.x<.3&&fall.x>.44,'broad left-right crossing '+JSON.stringify([left,hit,fall]));
  const earlyFall=ndc(RIDGE_HIT+2);
  assert.ok(hit.y>.79&&hit.y<.87&&left.y>.72&&earlyFall.y>.72&&earlyFall.y<hit.y-.025&&fall.y<hit.y-.25,
    'open upper strip through two seconds of falling, then behind hills '+[left.y,hit.y,earlyFall.y,fall.y]);
  assert.equal(route.scale,RELAY_SCALE,'turning the camera cannot enlarge the helicopter');
  for(let t=RIDGE_IN;t<RIDGE_LOST+.08;t+=.08){
    const p=ridgePose(t,route),radius=Math.hypot(p.x,p.z),lip=rimRadius(Math.atan2(p.z,p.x))+2;
    assert.ok(radius>=RELAY_RADIUS-.001&&radius-lip>15,'ALL flight samples must be on the far side of the world ridge');
    assert.ok(Math.max(Math.abs(p.x),Math.abs(p.z))>72,'never enters or lands in the 128-unit playable square');
    assert.ok(Math.hypot(p.x-DAY_PAD[0],p.z-DAY_PAD[2])>95,'never crosses near the reinforcement pad');
  }
  projected.push([left.x,hit.x,fall.x].map(v=>+v.toFixed(2)));
}
const assertOnScreen=(v,label)=>{const p=v.clone().project(cam);
  assert.ok(p.z>0&&p.z<1&&Math.abs(p.x)<.82&&p.y<.86&&p.y>-.75,label+' on normal chase: '+p.toArray());};
function blockedBySpur(v){const ray=new THREE.Raycaster(cam.position,v.clone().sub(cam.position).normalize(),0,v.distanceTo(cam.position));
  return ray.intersectObject(obj('relay-ridge-spur')).length>0;}
try{
  await render(el(Harness,{sector:1}));
  await ticks(90);const field=obj('campaign-airlift'),bird=obj('kestrel-campaign-transport'),other=obj('relay-damaged-aircraft');
  assert.ok(bird.visible&&!other.visible);assertOnScreen(bird.position,'approach');
  const operator=bird.getObjectByName('seated-door-gunner'),pivot=bird.getObjectByName('door-gunner-pivot'),flare=bird.getObjectByName('door-projector-signal');
  assert.ok(operator?.isSkinnedMesh&&operator.geometry.getAttribute('color')&&operator.parent===pivot&&flare.parent.parent===pivot);
  // Measure the actually mounted bodies, excluding the standing radio
  // operator's antenna. The helmet and boot extrema carry head/foot weights.
  const ordinary=obj('us-rto-4').getObjectByName('us-field-infantry-volume');
  assert.equal(operator.geometry.userData.cabinSource,ordinary.geometry.uuid);assert.equal(operator.material,ordinary.material);
  function bodyHeight(o){
    const g=o.geometry,p=g.getAttribute('position'),index=g.getAttribute('skinIndex'),kind=g.getAttribute('surfaceKind');
    let lo=Infinity,hi=-Infinity;
    for(let i=0;i<p.count;i++){
      if(index.getX(i)===4||index.getX(i)===7)lo=Math.min(lo,p.getY(i));
      if(kind.getX(i)===3)hi=Math.max(hi,p.getY(i));
    }
    return o.getWorldScale(new THREE.Vector3()).y*(hi-lo);
  }
  const crewHeight=bodyHeight(operator),fieldHeight=bodyHeight(ordinary);
  assert.ok(crewHeight>1.19&&crewHeight<1.34&&Math.abs(crewHeight-fieldHeight)<.001,'gunner and standing squad helmet-to-boot sizes: '+[crewHeight,fieldHeight]);
  assert.ok(other.getObjectByName('seated-door-gunner')?.isSkinnedMesh,'the relay has its own seated gunner');
  const upper=operator.skeleton.bones.find(b=>b.name==='spine'),firstYaw=upper.rotation.y;
  assert.equal(combat.friendlies.length,5);
  const beforePause=field.userData.flightTime;
  await render(el(Harness,{sector:1,running:false}));await ticks(80);
  assert.equal(upper.rotation.y,firstYaw,'its aircrew must pause with the aircraft');
  assert.equal(field.userData.flightTime,beforePause);assert.deepEqual(admitted,[]);
  await render(el(Harness,{sector:1}));await ticks(66);
  assert.ok(bird.position.distanceTo(vec(DAY_PAD))<1e-8);
  assert.notEqual(upper.rotation.y,firstYaw,'seated crew track the live contacts as the transport moves');
  assertOnScreen(bird.position,'grounded skids');
  await ticks(13);
  assert.equal(combat.friendlies.length,6);assert.deepEqual(admitted,[[0,true]]);
  const passenger=obj(DAY_CREW[0].id);assert.ok(passenger?.visible);
  assert.ok(passenger.position.distanceTo(vec(DAY_DOOR))<.1);
  await ticks(21);assert.ok(passenger.position.distanceTo(vec(DAY_STEP))<.22);
  await ticks(114);
  assert.deepEqual(admitted,[[0,true],[1,true],[2,true]]);assert.equal(combat.friendlies.length,8);
  for(const member of DAY_CREW){
    const soldier=obj(member.id);assert.ok(soldier?.visible);
    assert.ok(combat.friendlyPosesRef.current.get(member.id).position.distanceTo(soldier.position)<1e-8);
  }
  await act(async()=>combat.damageFriendly(DAY_CREW[0].id,1000));
  assert.equal(combat.deployCampaignPassenger(0),false);
  assert.equal(combat.friendliesRef.current.filter(s=>s.id===DAY_CREW[0].id&&s.alive).length,0);
  // Sample the actual world-space rounds during the relay pass and after the
  // hit. A muzzle flash alone, or a streak welded to the aircraft, fails.
  const rounds=other.getObjectByName('door-gunner-rounds'),roundMatrix=new THREE.Matrix4();
  const firstRound=()=>{rounds.getMatrixAt(0,roundMatrix);return new THREE.Vector3()
    .setFromMatrixPosition(roundMatrix).applyMatrix4(rounds.matrixWorld);};
  let travel=0,previous,previousTime;
  for(let frame=0;frame<189;frame++){
    await ticks(1);
    if(!other.visible||!rounds.visible||!rounds.count){previous=undefined;continue;}
    const head=firstRound(),time=field.userData.flightTime;
    if(previous&&Math.abs(head.distanceTo(previous)/(time-previousTime)-46)<.02)travel++;
    previous=head;previousTime=time;
  }
  assert.ok(travel>15,'rounds leave the moving relay at their authored world-space speed');
  assert.ok(obj('relay-impact-streak').visible&&!obj('relay-strike-flash').visible&&!obj('relay-tumbling-fire-trail').visible);
  const fallingActor=other.getObjectByName('door-gunner-pivot'),gunnerFire=obj('falling-gunner-fire');
  assert.ok(fallingActor.visible && !gunnerFire.visible && !bird.getObjectByName('falling-gunner-fire'));
  const incoming=obj('relay-impact-streak').position.clone();
  await ticks(13); // t = 25.30, actual flash, both airs independent
  assert.ok(!bird.visible&&other.visible);assert.ok(obj('relay-strike-flash').visible);
  const smoke=obj('relay-drifting-smoke'),matrix=new THREE.Matrix4(),puffCenter=new THREE.Vector3();
  const image=smoke.material.map.image,inkPoint=new THREE.Vector3(),viewCenter=new THREE.Vector3();
  function paintedPuff(i){
    smoke.getMatrixAt(i,matrix);let left=Infinity,right=-Infinity,top=-Infinity,bottom=Infinity;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
      if(image.data[4*(y*image.width+x)+3]<90)continue;
      inkPoint.set((x+.5)/image.width*2-1,(y+.5)/image.height*2-1,0).applyMatrix4(matrix).project(cam);
      left=Math.min(left,inkPoint.x*960);right=Math.max(right,inkPoint.x*960);
      top=Math.max(top,inkPoint.y*540);bottom=Math.min(bottom,inkPoint.y*540);
    }
    viewCenter.setFromMatrixPosition(matrix).project(cam);
    return {left,right,width:right-left,height:top-bottom,x:viewCenter.x*960};
  }
  assert.ok(smoke.count>0);assertOnScreen(other.position,'struck patrol');
  const outlet=paintedPuff(0);
  assert.ok(outlet.width<28,'a narrow initial outlet keeps the 78 px hull readable');
  assert.ok(image.data.some((channel,i)=>i%4===0&&channel>0&&channel<40&&image.data[i+3]>96),
    'the restored charcoal shadows are present in painted smoke, not only the transparent border');
  assert.equal(blockedBySpur(other.position),false);
  const crestStart=other.position.y;
  assert.ok(!obj('relay-impact-streak').visible&&incoming.distanceTo(obj('relay-strike-flash').position)>4);
  assert.ok(obj('relay-strike-flash').position.distanceTo(other.position)<2.8,'flash terminates on the aircraft');
  // Measure real, mounted geometry in the ordinary 1920x1080 chase view.
  // A few white-hot pixels can sell a flash; a polygon larger than the
  // cabin or a plate covering every transparent channel must fail.
  const burst=obj('relay-strike-flash'),celAtContact=burst.geometry;
  const pixel=(o,i)=>{
    const q=new THREE.Vector3().fromBufferAttribute(o.geometry.attributes.position,i);
    q.applyMatrix4(o.matrixWorld).project(cam);return [q.x*960,q.y*540];
  };
  const spans=new Map(),cols=burst.geometry.attributes.color;
  let inkArea=0,hot=0,dark=0;
  for(let i=0;i<cols.count;i+=4){
    const [x,y]=pixel(burst,i),[r,t]=pixel(burst,i+2),area=Math.abs((r-x)*(t-y));
    const value=new THREE.Color().fromBufferAttribute(cols,i).getHex();
    spans.set(value,(spans.get(value)??0)+area);inkArea+=area;
    if(value===0xfff4bd||value===0xffe385)hot+=area;
    if(value===0x252b29||value===0x393731)dark+=area;
  }
  const hull=other.getObjectByName('huey-body'),bounds=o=>{
    const xs=[],ys=[];for(let i=0;i<o.geometry.attributes.position.count;i++){const [x,y]=pixel(o,i);xs.push(x);ys.push(y);}
    return [Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];
  };
  const [fw,fh]=bounds(burst),[hw,hh]=bounds(hull);
  assert.ok(spans.size>=10&&hot>=4&&hot<inkArea*.16&&dark>inkArea*.14,
    'readable incandescent core, orange tongues and separate coal inks '+[spans.size,hot,dark,inkArea]);
  assert.ok(fw<hw*.58&&inkArea/(fw*fh)<.62&&inkArea/(hw*hh)<.17,
    'cut-away shape stays subordinate to actual visible hull '+[fw,fh,hw,hh,inkArea]);
  assert.ok(other.getObjectByName('relay-rounded-chin')&&!bird.getObjectByName('relay-rounded-chin'));
  await ticks(8);assert.notEqual(burst.geometry,celAtContact,'contact and breakup use different authored cels');
  assert.ok(gunnerFire.visible && fallingActor.visible,'The existing door crew leaves the seat on fire');
  const releaseHeight=gunnerFire.position.y;
  await ticks(28);
  assert.ok(other.position.y-gunnerFire.position.y>3 && gunnerFire.position.y<releaseHeight-2,'Gunner drops clear of the rolling cabin');
  assert.ok(fallingActor.localToWorld(new THREE.Vector3(.27,1.12,.12)).distanceTo(gunnerFire.position)<.001,
    'Flame follows the tumbling shoulder after it leaves the aircraft');
  await ticks(55);
  assert.ok(!fallingActor.visible && !gunnerFire.visible,'The fall ends at the far-side terrain');
  assert.ok(obj('relay-tumbling-fire-trail').count>=3&&Math.abs(other.rotation.z)>1.8,'separate falling cinders and an actual airframe roll');
  assert.ok(other.visible&&other.position.y<crestStart-8);
  const route=(()=>{const e=cam.position,d=cam.getWorldDirection(new THREE.Vector3());
    return createRelayPass(e.x,e.y,e.z,d.x,d.y,d.z,cam.fov,cam.aspect);})();
  const approach=ridgePose(RIDGE_LOST-.1,route),endpoint=ridgePose(RIDGE_LOST,route),endV=new THREE.Vector3(endpoint.x,endpoint.y,endpoint.z);
  assert.equal(blockedBySpur(new THREE.Vector3(approach.x,approach.y,approach.z)),true,'still-falling airframe passes behind the physical ridge');
  assert.ok(hw>=70&&hw<=88&&fw>=10&&fw<=30,'recognizable distant 1080p hull / restrained flash pixel budget: '+[hw,fw]);
  assert.ok(other.scale.x===RELAY_SCALE&&bird.scale.x===1,'distant look is not a resize of the transport');
  assert.ok(!hull.material.fog&&bird.getObjectByName('huey-body').material.fog,'the distant hull retains its own value against the sky without changing the transport fog');
  assert.ok(other.getObjectByName('huey-glazing').material.color.getHex()>hull.material.color.getHex(),'cockpit is lighter than its silhouette');
  const groundRay=new THREE.Raycaster(endV.clone().add(new THREE.Vector3(0,6,0)),new THREE.Vector3(0,-1,0),0,8);
  const groundHit=groundRay.intersectObject(obj('relay-ridge-spur'))[0];
  assert.ok(groundHit&&Math.abs(groundHit.point.y-ridgeGroundHeight(endpoint.x,endpoint.z))<.24,'end of flight lands on the actual far-slope mesh');
  assert.equal(rounds.count,0,'the gunner ceases fire after the hit and the final rounds expire');
  assert.ok(obj('relay-drifting-smoke').count>=15);
  const oldBillow=paintedPuff(0),youngBillow=paintedPuff(smoke.count-1);
  assert.ok(oldBillow.height>60&&oldBillow.height<150&&oldBillow.width>youngBillow.width*2.5,
    'older smoke rolls into a substantial plume behind the small aircraft '+JSON.stringify({oldBillow,youngBillow}));
  for(let i=0;i<smoke.count;i++){
    smoke.getMatrixAt(i,matrix);puffCenter.setFromMatrixPosition(matrix);
    assert.ok(Math.hypot(puffCenter.x,puffCenter.z)>103,'airborne trail stays on the distant side');
    if(i>0&&i<smoke.count-3){
      assert.ok(paintedPuff(i-1).right>paintedPuff(i).left,'mature billows overlap in the actual camera, not a dotted line');
    }
  }
  await ticks(28);assert.ok(!other.visible&&obj('relay-ground-impact').visible&&obj('relay-drifting-smoke').visible);
  assert.ok(obj('relay-ground-impact').position.distanceTo(endV)<.02,'ground flash begins at final flight position');
  await ticks(28);assert.ok(!other.visible&&obj('relay-drifting-smoke').visible);
  smoke.getMatrixAt(smoke.count-1,matrix);puffCenter.setFromMatrixPosition(matrix);
  assert.ok(puffCenter.distanceTo(endV)<6,'the new dust is emitted on the far side of the ridge at the impact site');
  await ticks(260);assert.equal(field.userData.flightTime,RIDGE_CLEAR);assert.equal(obj('relay-drifting-smoke').count,0);
  assert.equal(admitted.length,3);assert.deepEqual(calls,['inbound','skids',null,'crossing','hit',null]);
  assert.ok(shots.length>0&&hits.some(([,a,b])=>a>b),'disembarked AI must fire from a live socket AND cause real damage');
  assert.ok(ridgePose(RIDGE_CLEAR).y>0);
  await render(el(Harness,{sector:2}));await ticks(1);
  assert.equal(combat.friendlies.length,5);assert.equal(combat.friendlyPosesRef.current.has(DAY_CREW[0].id),false);
  assert.ok(!obj('relay-strike-flash').visible&&!obj('relay-damaged-aircraft').visible&&!obj('relay-drifting-smoke').visible);
  assert.ok(obj('campaign-airlift').userData.flightTime<.1);
  await ticks(220);assert.deepEqual(admitted.slice(3),[[0,true],[1,true],[2,true]]);
  console.log(JSON.stringify({dayTickets:admitted.slice(0,3),crewShots:shots.length,healthDecreasingHits:hits.length,paused:true,
    gunnerHelmetToBoot:crewHeight,fieldHelmetToBoot:fieldHeight,leftHitAndFallNdc:projected,chaseFraming:true,
    patrolHullWidthPx:Math.round(hw),patrolWorldRadius:Math.round(Math.hypot(endpoint.x,endpoint.z)),airframeScale:RELAY_SCALE,
    contactCel:{widthPx:Math.round(fw),heightPx:Math.round(fh),hotPx:Math.round(hot),sootPx:Math.round(dark),
      pigments:spans.size,hullBoxCoverage:+(inkArea/(hw*hh)).toFixed(3)},
    smokeAt1080p:{contactWidth:Math.round(outlet.width),bankOldestHeight:Math.round(oldBillow.height),bankOutletWidth:Math.round(youngBillow.width)},
    incomingStreak:true,fallingFire:true,ridgeOcclusion:true,groundImpact:true,smokeOutlivedAircraft:true,secondSectorRedeployed:true}));
}finally{await render(null);assert.equal(subs.size,0);}
