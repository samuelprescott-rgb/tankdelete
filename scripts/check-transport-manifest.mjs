// Both mounted flights + real admission hook + real squad; no WebGL or browser.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import React from 'react';
import {act,context,extend,reconciler} from '@react-three/fiber';
import * as T from 'three';
import {stationMin,stationMax,stationPivot,stationReach,trayMin,trayMax} from './transport-station-bounds.mjs';
const rootPath=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),entry=rootPath+'/virtual-manifest.mjs';
const names=['components/Scene/CampaignFlights','components/Scene/EmbassyLift','components/Scene/USInfantrySquad',
  'hooks/useEnemyCombat','lib/campaignFlights','lib/embassyLift','lib/infantryMetrics','components/Scene/infantryGeometry'];
const built=await build({root:rootPath,configFile:false,logLevel:'silent',publicDir:false,esbuild:{jsx:'automatic'},
  plugins:[{name:'cabintest',resolveId:p=>p===entry?p:null,load:p=>p===entry?names.map(n=>'export * from "./src/'+n+'"').join(';'):null}],
  build:{ssr:entry,write:false}});
const code=built.output.find(c=>c.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const G=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(T);
const el=React.createElement,camera=new T.PerspectiveCamera(60,16/9,.1,340),scene=new T.Scene(),subs=new Map(),clock={elapsedTime:0};
const state={scene,camera,clock,invalidate(){},internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),
  capturedMap:new Map(),subscribe(r,p){subs.set(r,p);return ()=>subs.delete(r);}}};
const store=Object.assign((select=v=>v)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const bail=e=>{throw e;},renderer=reconciler.createContainer(store,1,null,false,null,'',bail,bail,bail,null);
const render=n=>act(async()=>reconciler.updateContainer(n&&el(context.Provider,{value:store},n),renderer,null,null));
const empty=[],noop=()=>{};let corps,admissions;
function verifyStation(hangar,crew,mounts,tray){
  const held=hangar.getObjectByName('door-crew-field-prop'),cue=hangar.getObjectByName('door-projector-signal'),gear=held.parent;
  const spine=crew.skeleton.bones.find(b=>b.name==='spine'),root=spine.parent,bindSpine=spine.position.clone();
  const rig={spine,root,bindSpine},turn=spine.quaternion.clone(),cueScale=cue.scale.clone();
  const vp=new T.Vector3(),M=new T.Matrix4(),bounds=new T.Box3(),trayBounds=new T.Box3();
  const center=mounts.worldToLocal(spine.getWorldPosition(new T.Vector3()));
  assert.ok(Math.hypot(center.x-stationPivot[0],center.z-stationPivot[1])<.025,'spine inside real seat');
  let reach=0,radius=0;
  function sample(o,b,articulated){
    M.copy(mounts.matrixWorld).invert().multiply(o.matrixWorld);
    for(let i=0;i<o.geometry.attributes.position.count;i++){
      o.getVertexPosition(i,vp).applyMatrix4(M);b.expandByPoint(vp);
      if(articulated){
        reach=Math.max(reach,Math.hypot(vp.x-stationPivot[0],vp.z-stationPivot[1]));radius=Math.max(radius,vp.distanceTo(center));
      }
    }
  }
  sample(tray,trayBounds,false);
  assert.ok(new T.Box3(new T.Vector3(...trayMin),new T.Vector3(...trayMax)).containsBox(trayBounds),'full boot tray');
  // The production permits ANY interpolated yaw/pitch in this rectangle.
  // Include its corners, the largest possible cue and every skinned vertex.
  const ny=28,np=17;
  cue.scale.set(.151,.137,.34);
  for(let j=0;j<=ny;j++)for(let k=0;k<=np;k++){
    spine.rotation.set(-.78+1.18*k/np,-1.43+2.15*j/ny,0,'YXZ');G.applyInfantryWeaponPose(gear,rig);
    hangar.updateMatrixWorld(true);for(const o of [crew,held,cue])sample(o,bounds,true);
  }
  // The furthest untested orientation is half a grid step in each axis.
  // Rotating by angle a moves a vertex by at most radius*a (arc length).
  const between=radius*(2.15/ny+1.18/np)/2;
  assert.ok(reach+between<stationReach,'complete moving station radius '+[reach,between,stationReach]);
  assert.ok(new T.Box3(new T.Vector3(...stationMin),new T.Vector3(...stationMax)).containsBox(bounds.expandByScalar(between)),
    'complete moving gunner, field prop and projector within corridor bounds');
  spine.quaternion.copy(turn);G.applyInfantryWeaponPose(gear,rig);cue.scale.copy(cueScale);hangar.updateMatrixWorld(true);
  console.log('Mounted station sweep',JSON.stringify({orientations:(ny+1)*(np+1),maxReach:reach,between,certifiedReach:stationReach}));
}
function Game({port}){
  corps=G.useEnemyCombat({sessionKey:'passengers-'+port,seed:1968});
  const deploy=slot=>{const accepted=(port?corps.deployPassenger:corps.deployCampaignPassenger)(slot);assert.ok(accepted);admissions.push(slot);return accepted;};
  return el(React.Fragment,null,el(port?G.EmbassyLift:G.CampaignFlights,{roster:corps.friendlies,wave:2,deploy,onCall:noop,running:true}),
    el(G.USInfantrySquad,{defenseOffsetZ:port?-10:0,enemies:empty,friendlies:corps.friendlies,friendlyPosesRef:corps.friendlyPosesRef,enabled:false}));
}
for(const port of [false,true]){
  clock.elapsedTime=0;admissions=[];await render(el(Game,{port}));
  const tickets=port?G.LIFT_TEAM:G.DAY_CREW,door=port?G.LIFT_DOOR:G.DAY_DOOR,hangar=scene.getObjectByName(port?'rook-relief-transport':'kestrel-campaign-transport');
  assert.deepEqual(hangar.getWorldScale(new T.Vector3()).toArray(),[1,1,1],'corridors use production airframe world scale');
  const first=port?G.LIFT_START_DROP:G.DAY_FIRST_STEP,interval=port?G.LIFT_DROP_INTERVAL:G.DAY_STEP_INTERVAL;
  const before=new Map(),after=new Map(),frame=1/30;
  let seatedMetrics;
  for(let n=0;n<(first+tickets.length*interval+.8)/frame;n++){
    clock.elapsedTime+=frame;await act(async()=>{for(const [cb] of [...subs].sort((a,b)=>a[1]-b[1]))cb.current(state,frame);});
    scene.updateMatrixWorld(true);
    const t=hangar.userData.flightTime;
    for(const [index,ticket] of tickets.entries()){
      const seated=hangar.getObjectByName('aboard-'+ticket.id),foot=scene.getObjectByName(ticket.id);
      assert.equal(Number(Boolean(seated))+Number(Boolean(foot)),1,'owner count for '+ticket.id+' at '+t);
      if(seated){
        assert.equal(seated.scale.x,G.INFANTRY_WORLD_SCALE);const skin=seated.getObjectByName('embarked-field-volume');
        assert.ok(skin.isSkinnedMesh&&(skin.geometry===G.passengerBody(ticket.body)
          ||(ticket.body===3&&skin.geometry.userData.cabinSource===G.passengerBody(3).uuid)));
        before.set(ticket.id,seated.getWorldPosition(new T.Vector3()));
      }else if(!after.has(ticket.id)){
        assert.ok(Math.abs(t-(first+index*interval))<=frame+.00001,'unchanged ticket deadline');
        assert.ok(foot.getObjectByName('us-field-infantry-volume').geometry===G.passengerBody(ticket.body));
        const p=foot.getWorldPosition(new T.Vector3());
        assert.ok(p.distanceTo(new T.Vector3(...door))<.004 && before.get(ticket.id).distanceTo(p)<.075,
          'the same real adult crosses the near sill without a relocation: '+ticket.id+' '+before.get(ticket.id).distanceTo(p));after.set(ticket.id,p);
      }
    }
    if(!seatedMetrics && t>2){
      seatedMetrics=[];const inside=new T.Box3(),headPoints=[];
      const solids=hangar.children.find(o=>o.name==='huey-flying-airframe').children.filter(o=>o.isMesh);
      const crew=hangar.getObjectByName('seated-door-gunner'),platform=hangar.getObjectByName('gunner-folding-seat-and-boot-tray'),
        mounts=hangar.getObjectByName('transport-door-crew'),cq=new T.Vector3(),helmet=new T.Box3(),boots=[new T.Box3(),new T.Box3()];
      assert.equal(mounts.scale.x,port?1:-1,'gunner is opposite the passenger door');
      if(port)verifyStation(hangar,crew,mounts,platform);
      const cpos=crew.geometry.attributes.position,weights=crew.geometry.attributes.skinIndex,kinds=crew.geometry.attributes.surfaceKind;
      for(let i=0;i<cpos.count;i+=2){const group=weights.getX(i),surface=kinds.getX(i);
        if(surface!==3&&surface!==5)continue;crew.getVertexPosition(i,cq);crew.localToWorld(cq);mounts.worldToLocal(cq);
        if(surface===3)helmet.expandByPoint(cq);else if(group===4||group===7)boots[group===4?0:1].expandByPoint(cq);}
      const hc=helmet.getCenter(new T.Vector3());assert(hc.x<.75&&hc.x>.46&&helmet.max.y<.55,'operator seated inside near aperture: '+[hc.x,helmet.max.y]);
      const solidBelow=p=>{
        const start=mounts.localToWorld(p.clone()),end=mounts.localToWorld(p.clone().add(new T.Vector3(0,-1,0)));
        const hit=new T.Raycaster(start,end.sub(start).normalize()).intersectObject(platform)[0];return hit&&mounts.worldToLocal(hit.point).y;};
      for(const [i,boot] of boots.entries()){
        const mid=boot.getCenter(new T.Vector3()),top=solidBelow(mid);
        assert.ok(Number.isFinite(top)&&Math.abs(boot.min.y-top)<.028,'gunner boot '+i+' is unsupported: '+[mid.x,mid.z,boot.min.y,top]);}
      assert.ok(Math.abs(solidBelow(new T.Vector3(.626,-.075,-.367))+.1465)<.015,'hinged pan under actual pelvis');
      for(const ticket of tickets){
        const child=hangar.getObjectByName('aboard-'+ticket.id),skin=child.getObjectByName('embarked-field-volume');
        const p=skin.geometry.attributes.position,part=skin.geometry.attributes.surfaceKind,box=new T.Box3(),head=new T.Box3(),q=new T.Vector3();
        for(let i=0;i<p.count;i+=2){skin.getVertexPosition(i,q);skin.localToWorld(q);hangar.worldToLocal(q);
          box.expandByPoint(q);if(part.getX(i)===3)head.expandByPoint(q);}
        assert.ok(box.min.y>-.44 && box.min.y<-.37 && box.max.y<.625 && box.max.y>.46,
          'full-size seated body must have feet on floor and head under cabin roof '+ticket.id+' '+[box.min.y,box.max.y]);
        const bones=skin.skeleton.bones,knee=(a,b,c)=>{
          const h=bones[a].getWorldPosition(new T.Vector3()),k=bones[b].getWorldPosition(new T.Vector3()),f=bones[c].getWorldPosition(new T.Vector3());
          return T.MathUtils.radToDeg(h.sub(k).angleTo(f.sub(k)));};
        assert.ok([knee(2,3,4),knee(5,6,7)].every(b=>b>65&&b<125),'both knees must actually bend on the canvas bench');
        const center=head.getCenter(new T.Vector3());headPoints.push(center);inside.union(box);
        const eye=hangar.localToWorld(new T.Vector3(port?-4.4:4.4,.04,.35));
        let exposed=0;
        for(const sx of [-.72,0,.72])for(const sy of [-.65,0,.65]){const v=center.clone();
          v.z+=sx*(head.max.z-head.min.z)*.5;v.y+=sy*(head.max.y-head.min.y)*.5;
          hangar.localToWorld(v);const ray=new T.Raycaster(eye,v.clone().sub(eye).normalize(),0,eye.distanceTo(v)-.01);
          if(!ray.intersectObjects(solids,false).length)exposed++;}
        assert.ok(exposed>=4,'not enough helmet visible through OPEN near door: '+ticket.id+' '+exposed);
        seatedMetrics.push({ticket:ticket.id,height:+(box.max.y-box.min.y).toFixed(3),exposed});
      }
      for(let i=0;i<headPoints.length;i++)for(let k=0;k<i;k++)assert.ok(headPoints[i].distanceTo(headPoints[k])>.49,'stacked cabin occupants');
    }
  }
  assert.deepEqual(admissions,tickets.map((_,i)=>i));assert.equal(corps.friendlies.length,5+tickets.length);assert.equal(after.size,tickets.length);
  assert.equal(hangar.getObjectByName('embarked-manifest').children.length,0);assert.ok(hangar.getObjectByName('seated-door-gunner'));
  assert.equal((port?corps.deployPassenger:corps.deployCampaignPassenger)(0),false,'an already deployed ticket cannot return');
  console.log((port?'Rook':'Kestrel')+' finite full-size manifest / unbroken ground transfer:',JSON.stringify(seatedMetrics));
  await render(null);assert.equal(subs.size,0);
}

// Independently ray-test the mounted animated skin and prop against BOTH real
// airframes while they bank, land and leave. These fixtures change only the
// hostile pose feed: no damage, spawns or aircraft movement are overridden.
for(const embassy of [false,true]){
  const make=(id,alive=true)=>({id,alive,...(embassy?{visualScale:1}:{stance:'standing'})});
  const actors=[make('contact'),make('spent',false),make('not-emerged'),make('behind-door')];
  const poses={current:new Map(actors.map(({id})=>[id,{position:new T.Vector3(),active:id!=='not-emerged'}]))};
  const feed={actors,poses},identity=embassy?'rook-relief-transport':'kestrel-campaign-transport',dt=1/60;
  await render(el(embassy?G.EmbassyLift:G.CampaignFlights,{wave:2,running:true,roster:[],contacts:feed,deploy:()=>false,onCall:noop}));
  const craft=scene.getObjectByName(identity),seat=craft.getObjectByName('door-gunner-pivot'),signal=craft.getObjectByName('door-projector-signal');
  const held=craft.getObjectByName('door-crew-field-prop'),head=craft.getObjectByName('seated-door-gunner').skeleton.bones.find(b=>b.name==='head');
  const north=new T.Vector3(0,0,-1),aim=new T.Vector3(),ray=new T.Raycaster(),shoulder=new T.Vector3(...G.infantryRifleBind('service',false).pad);
  const solids=craft.getObjectByName('huey-flying-airframe').children;
  const rounds=craft.getObjectByName('door-gunner-rounds'),matrix=new T.Matrix4();
  let flashes=0,turns=0,worst=0,stages=new Set(),launched=0;

  for(let n=0;n<20/dt;n++){
    const t=n*dt,good=poses.current.get('contact'),mount=seat.parent;
    // Two distinct normal map positions for this contact; the authored spawn
    // never moves. Only the live world position changes during tracking.
    good.position.set(embassy?5:-3,.025,t<9?16:8);
    // During the negative interval all slots are invalid, including a closer
    // contact that would require pointing right through the cabin.
    good.active=t<12||t>=15;
    poses.current.get('behind-door').position.copy(mount.localToWorld(new T.Vector3(-4,0,.1)));
    poses.current.get('spent').position.copy(mount.localToWorld(new T.Vector3(3,0,.1)));
    poses.current.get('not-emerged').position.copy(poses.current.get('spent').position);
    clock.elapsedTime+=dt;await act(async()=>{for(const [cb] of subs)cb.current(state,dt);});
    scene.updateMatrixWorld(true);
    if(!craft.visible||n===0)continue; // First update places the just-mounted aircraft on its route.
    if(!good.active){assert.ok(!seat.userData.contactId&&!signal.visible,'no contact/flash into closed cabin or dead/inactive slot');continue;}
    if(seat.userData.contactId){assert.equal(seat.userData.contactId,'contact');turns++;}
    if(!signal.visible)continue;
    assert.equal(seat.userData.contactId,'contact');flashes++;
    const muzzle=signal.getWorldPosition(new T.Vector3()),start=signal.parent.localToWorld(shoulder.clone());
    const axis=held.localToWorld(north.clone()).sub(held.getWorldPosition(new T.Vector3())).normalize();
    const face=head.localToWorld(north.clone()).sub(head.getWorldPosition(new T.Vector3())).normalize();
    assert.ok(rounds.visible&&rounds.count>0);
    for(let i=0;i<rounds.count;i++){
      rounds.getMatrixAt(i,matrix);matrix.premultiply(rounds.matrixWorld);
      if(new T.Vector3().setFromMatrixPosition(matrix).distanceTo(muzzle)<.002){
        assert.ok(new T.Vector3(0,1,0).transformDirection(matrix).dot(axis)>.999);
        launched++;
      }
    }
    aim.copy(good.position);aim.y+=embassy?.72:G.infantryAimHeight(false);
    const dir=aim.clone().sub(muzzle).normalize(),angle=T.MathUtils.radToDeg(dir.angleTo(axis));worst=Math.max(worst,angle);
    assert.ok(angle<1&&face.dot(dir)>.995,'actual prop and actual face must point at the active slot: '+angle);
    ray.set(start,axis);ray.far=start.distanceTo(aim);
    const hit=ray.intersectObjects(solids,true)[0];
    assert.ok(!hit,'prop/flash line went through '+hit?.object?.name+' at '+t);
    stages.add(t<5?'arrival':t<15?'ground':'departure');
  }
  assert.ok(launched>=5,'distinct rounds spawn at the actual muzzle on both mirrored mounts');
  assert.ok(flashes>8&&turns>100&&stages.size>=2,'insufficient samples: '+[flashes,turns,...stages]);
  console.log(identity+': '+flashes+' clear aligned flash frames, '+turns+' tracking frames, maximum prop angle '+worst.toFixed(3)+' degrees; phases '+[...stages].join(', '));
  await render(null);assert.equal(subs.size,0);
}
