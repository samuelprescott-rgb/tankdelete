// Geometry and mounted-pose evidence only: does not render, measure frame time,
// stage a victory or substitute for the four-wave player-camera film.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import * as THREE from 'three';
import {act,context,extend,reconciler} from '@react-three/fiber';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {build} from 'vite';

const dir=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const entry=dir+'/command-pose-fixture.mjs';
const probeEntry=`export {ZombieHorde} from '${dir}/src/components/Scene/ZombieHorde';
export {COMMAND_HEAD_SEATS,commandCoat,commandMantle,commandFoot} from '${dir}/src/components/Scene/commandCreature';
export {COMMAND_SLAB_TOP,onCommandWetApron} from '${dir}/src/components/Scene/commandBody';
export {COMMAND_FIRE_POCKETS} from '${dir}/src/components/Scene/commandFireBounce';
export {createZombieWave} from '${dir}/src/lib/zombieEpilogue';`;
const bundle=await build({root:dir,configFile:false,publicDir:false,logLevel:'silent',
  plugins:[{name:'command-fixture',resolveId:id=>id===entry?id:null,load:id=>id===entry?probeEntry:null}],
  esbuild:{jsx:'automatic'},build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
const js=bundle.output.find(x=>x.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const game=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}), coat=game.commandCoat(),mantle=game.commandMantle();
const meshes=[coat,mantle].map(g=>new THREE.Mesh(g,mat)),ray=new THREE.Raycaster();
// A pile of touching neck poles and bone bars can pass the hole count.
// Weld the actual merged triangles by position and require each jaw, front
// shoulder and sternum to belong to one continuous, outward-facing surface.
{
  const pts=mantle.getAttribute('position'),keys=new Map(),coords=[],parent=[];
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  function at(i){
    const p=[pts.getX(i),pts.getY(i),pts.getZ(i)],key=p.join(',');
    if(keys.has(key))return keys.get(key);
    const id=coords.length;coords.push(p);parent.push(id);keys.set(key,id);return id;
  }
  assert.equal(mantle.index,null);
  assert.equal(mantle.groups.length,0,'Chest must remain one merged material/draw');
  for(let i=0;i<pts.count;i+=3){const a=at(i),b=at(i+1),c=at(i+2);parent[root(b)]=root(a);parent[root(c)]=root(a);}
  const both=[];
  for(const side of [-1,1]){
    const hits=new Map();
    for(let i=0;i<coords.length;i++){
      const [x,y,z]=coords[i],w=x*side;if(w<.005)continue;
      // The lead jaw now projects forward off the LOW shoulder; the watcher
      // sits further back on a taller neck. Test contact at the actual seat.
      const id=root(i),seat=game.COMMAND_HEAD_SEATS[side<0?0:1];
      const jaw=Math.hypot(x-seat[0],y-seat[1],z-seat[2])<.085;
      const shoulder=w>.29&&y>1.026&&y<1.105&&z<-.043;
      const sternum=w<.053&&y>.93&&y<1.042&&z<-.199;
      hits.set(id,(hits.get(id)??0)|(jaw?1:0)|(shoulder?2:0)|(sternum?4:0));
    }
    const ids=[...hits].filter(([,mask])=>mask===7).map(([id])=>id),connected=ids.length;both.push(ids);
    assert(connected>=1,`Chest side ${side}: no continuous jaw-to-shoulder-and-sternum skin`);
    ray.set(new THREE.Vector3(side*.146,1.064,-.75),new THREE.Vector3(0,0,1));
    const face=ray.intersectObject(meshes[1])[0];
    assert(face&&face.point.z<-.13&&face.face.normal.z<0,`Chest side ${side}: no front face over pectoral`);
    console.log('Jaw to shoulder and sternum',{side,connected,frontDepth:face.point.z});
  }
  assert(both[0].some(id=>both[1].includes(id)),'Both jaw insertions and deltoids must share the same welded sternum, not two overlapping sheets');
}
for(const side of [-1,1])for(const turn of [0,.26]){
  const dir=new THREE.Vector3(Math.sin(turn),0,Math.cos(turn));let through=0,blocked=0;
  for(let row=0;row<12;row++)for(let col=0;col<10;col++){
    const origin=new THREE.Vector3(side*(.095+col*.016),.775+row*.018,0).addScaledVector(dir,-.9);
    ray.set(origin,dir);
    if(ray.intersectObjects(meshes).length)blocked++;else through++;
  }
  assert(through>=16&&blocked>=45,`Chest side ${side} at ${turn}: ${through} through / ${blocked} blocked`);
  console.log('Coat + chest holes', {side,angle:turn,through,blocked});
}
for(const s of [-1,1]){
  const g=game.commandFoot(s);assert(Math.abs(g.boundingBox.min.y-.001)<1e-6);
  assert(g.boundingBox.min.z<-.275&&g.groups.length===0);
  const p=g.getAttribute('position'),pads=[[],[],[]];
  for(let i=0;i<p.count;i++)if(p.getY(i)<.00101){
    const z=p.getZ(i);if(z>.06)pads[0].push(p.getX(i));if(z<-.1&&z>-.165)pads[1].push(p.getX(i));if(z<-.2)pads[2].push(p.getX(i));
  }
  const widths=pads.map(xs=>Math.max(...xs)-Math.min(...xs));const size=g.boundingBox.getSize(new THREE.Vector3());
  assert(widths[0]>.10&&widths[1]>.15&&widths[2]>.21&&size.z>.46&&size.x>.25,'Heel, ball and splayed toe pads have distinct, broad bearing surfaces');
  console.log('Ground-plane pad width (heel, ball, toes)',s,widths.map(n=>+n.toFixed(3)),'foot length',size.z);g.dispose();
}
mat.dispose();mantle.dispose();coat.dispose();

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window=new EventTarget();
globalThis.document=Object.assign(new EventTarget(),{hidden:false,hasFocus:()=>true,createElement(tag){assert.equal(tag,'canvas');return {getContext:()=>null};}});
GLTFLoader.prototype.load=function(url){assert.equal(url,'/models/us-infantry-head/us-male-head.gltf');};
extend(THREE);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,16/9,.1,340),subs=new Map();
const state={scene,camera,invalidate(){},internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
  subscribe(r,p){subs.set(r,p);return ()=>subs.delete(r);}}};
const store=Object.assign((select=v=>v)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;},reconciled=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const render=o=>act(async()=>reconciler.updateContainer(React.createElement(context.Provider,{value:store},o),reconciled,null,null));
const pt=new THREE.Vector3(),headA=new THREE.Vector3(),headB=new THREE.Vector3(),tankRef={current:new THREE.Group()};
const pocket=game.COMMAND_FIRE_POCKETS;
const generated=m=>{const sh={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  m.onBeforeCompile(sh,{});return sh;};
// Same finite escape cone, solid-angle falloff and one-sided response as the
// baked-in vertex shader. Independently exercise the actual transformed normals
// below, not just fictitious spheres. This is NOT a GPU or visual sign-off.
const smooth=THREE.MathUtils.smoothstep;
function incident(src,wp,n){
  const delta=new THREE.Vector3(...src.p).sub(wp),ds=delta.lengthSq(),d=Math.sqrt(ds),l=delta.divideScalar(d||1);
  const launch=smooth(-l.dot(new THREE.Vector3(...src.escape)),-.35,.30),range=(1-smooth(d,.34*src.reach,src.reach))/(1+.025*ds);
  return launch*src.energy*range*Math.max(0,n.dot(l));
}
assert.equal(pocket.length,5);
for(const s of pocket){
  const src=new THREE.Vector3(...s.p),exit=new THREE.Vector3(...s.escape).normalize(),n=exit.clone().negate();
  const near=src.clone().addScaledVector(exit,2),far=src.clone().addScaledVector(exit,s.reach+.01),side=src.clone().addScaledVector(exit,-2);
  assert(incident(s,near,n)>.50&&incident(s,near,n.clone().negate())===0,'Warm surface must have an actual fire-facing normal');
  assert.equal(incident(s,far,n),0);assert.equal(incident(s,side,exit),0,'No through-wall light behind the opening');
}
camera.position.set(0,5,-19);
for(const hz of [20,60]){
  const dt=1/hz,sample=[],posesRef={current:new Map()},boss={...game.createZombieWave(97,4)[0],position:[0,.02,18]};
  tankRef.current.position.set(0,0,-25);
  await render(React.createElement(game.ZombieHorde,{zombies:[boss],posesRef,tankRef,active:true}));
  const root=scene.getObjectByName('nightmare-boss-sculpt'),get=n=>root.getObjectByName(n);
  const hips=get('command-pelvis'),chest=get('command-weight-bearing-chest'),front=get('command-double-faced-skull'),watcher=get('command-watchers-skull');
  const net=get('command-living-shoulder-net'),arm=[get('command-upper-0'),get('command-striking-arm')],elbow=[get('command-elbow-0'),get('command-elbow-1')];
  assert(net.isSkinnedMesh&&net.geometry.groups.length===0&&net.skeleton.bones.length===7);
  const bind=net.geometry.getAttribute('position'),bi=net.geometry.getAttribute('skinIndex'),bw=net.geometry.getAttribute('skinWeight');
  const cases=new Map();
  for(let i=0;i<bind.count;i++){
    let sum=0;const weights=new Map();
    for(let k=0;k<4;k++){const id=bi.getComponent(i,k),weight=bw.getComponent(i,k);sum+=weight;if(weight>.001)weights.set(id,weight);}
    assert(Math.abs(sum-1)<2e-5);
    for(const [id,w] of weights){
      if(w>.999&&!cases.has('pin'+id))cases.set('pin'+id,i);
      if(w>.22&&w<.77&&!cases.has('mix'+id))cases.set('mix'+id,i);
    }
  }
  for(const id of [0,1,2,3,4,5,6])assert(cases.has('pin'+id)&&cases.has('mix'+id),'Each physical bone needs attached and continuously blended surface');
  const deltaMatrices=net.skeleton.bones.map(()=>new THREE.Matrix4()),rest=new THREE.Vector3(),v=new THREE.Vector3(),expect=new THREE.Vector3(),actual=new THREE.Vector3();
  const departures=new Map();
  const feet=['left','right'].map(side=>get('command-leg-'+side).getObjectByName('boot'));
  const lower=get('command-continuous-lower-body'),lp=lower.geometry.getAttribute('position'),lw=lower.geometry.getAttribute('skinWeight'),li=lower.geometry.getAttribute('skinIndex');
  const lt=feet.map(o=>o.parent.getObjectByName('thigh')),ls=feet.map(o=>o.parent.getObjectByName('shin'));
  assert(lower.isSkinnedMesh&&lower.skeleton.bones.length===7&&lower.geometry.groups.length===0&&lt.every(o=>o.isGroup)&&ls.every(o=>o.isGroup));
  const lowTris=(lower.geometry.index.count+feet[0].children[0].geometry.index.count+feet[1].children[0].geometry.index.count)/3;
  assert(lowTris<6140,'Replace, do not layer over the prior 6,140 lower-body triangles');const weighted=[],regions=new Set();
  const parent=Array.from({length:lp.count},(_,i)=>i);const at=i=>{while(parent[i]!==i)i=parent[i];return i;};
  const idx=lower.geometry.index;for(let i=0;i<idx.count;i+=3){
    const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);parent[at(b)]=at(a);parent[at(c)]=at(a);
  }
  assert.equal(new Set(parent.map(at)).size,2,'Exactly one connected surface from each hip across its knee into the foot');
  for(let i=0;i<lp.count;i++){const pairs=[];for(let j=0;j<4;j++)if(lw.getComponent(i,j)>.10)pairs.push(li.getComponent(i,j));
    const id=pairs.join(':');if(pairs.length===2&&!regions.has(id)){regions.add(id);weighted.push(i);}}
  assert.equal(regions.size,6,'Both hips, knees and ankles must genuinely blend their adjacent joints');
  const transfers=[[],[]];
  assert.equal(front.children.filter(c=>c.name==='command-front-jaw').length,1);
  assert.equal(watcher.children.filter(c=>c.name==='command-rear-jaw').length,1);
  for(let i=0;i<3*hz;i++){
    for(const [cb] of [...subs].sort((a,b)=>a[1]-b[1]))cb.current({...state,clock:{elapsedTime:(i+1)*dt}},dt);
    scene.updateMatrixWorld();if(!root.visible||i<.55*hz)continue;
    // Compare the real native Three skin with the separately published
    // rigid joint matrices: neither a planted static web nor proxy-only
    // motion can pass. (These are model coordinates before the chest parent.)
    deltaMatrices[0].identity();
    [front,watcher,...arm].forEach((o,j)=>deltaMatrices[j+1].copy(o.matrix).multiply(net.skeleton.boneInverses[j+1]));
    for(let j=0;j<2;j++)deltaMatrices[5+j].multiplyMatrices(arm[j].matrix,elbow[j].matrix).multiply(net.skeleton.boneInverses[5+j]);
    for(const [region,k] of cases){
      rest.fromBufferAttribute(bind,k);expect.set(0,0,0);
      for(let b=0;b<4;b++)expect.addScaledVector(v.copy(rest).applyMatrix4(deltaMatrices[bi.getComponent(k,b)]),bw.getComponent(k,b));
      net.getVertexPosition(k,actual);
      assert(actual.distanceTo(expect)<1e-5,'Deforming vertex must follow the real moving jaw/shoulder/elbow');
      departures.set(region,Math.max(departures.get(region)??0,rest.distanceTo(actual)));
    }
    const separation=front.getWorldPosition(headA).distanceTo(watcher.getWorldPosition(headB));
    assert(separation>1.75,'Separate neck roots/supports must not overlap at final scale');
    deltaMatrices[0].copy(hips.matrix);
    for(let j=0;j<2;j++){const k=1+3*j;
      deltaMatrices[k].copy(lt[j].matrix);deltaMatrices[k+1].copy(ls[j].matrix);deltaMatrices[k+2].multiplyMatrices(feet[j].matrix,feet[j].children[0].matrix);}
    deltaMatrices.forEach((m,j)=>m.multiply(lower.skeleton.boneInverses[j]));
    for(const k of weighted){rest.fromBufferAttribute(lp,k);expect.set(0,0,0);
      for(let j=0;j<4;j++)expect.addScaledVector(v.copy(rest).applyMatrix4(deltaMatrices[li.getComponent(k,j)]),lw.getComponent(k,j));
      assert(lower.getVertexPosition(k,actual).distanceTo(expect)<1e-5,'Actual blended skin must follow pelvis, IK thigh/shin and rolled sole');}
    for(let support=0;support<2;support++){
      if(feet[support].getWorldPosition(pt).y>.025||feet[1-support].getWorldPosition(pt).y<.40)continue;
      const spread=feet[support].position.x-feet[1-support].position.x;
      if(Math.abs(spread)>.15)transfers[support].push((hips.position.x-.5*(feet[support].position.x+feet[1-support].position.x))/(.5*spread));
    }
    sample.push({feet:feet.map(o=>o.getWorldPosition(pt).clone()),chest:chest.rotation.y,pelvis:hips.rotation.y,
      relativeScan:front.rotation.y-watcher.rotation.y,jawSplit:front.getObjectByName('command-front-jaw').rotation.x-
        watcher.getObjectByName('command-rear-jaw').rotation.x});
  }
  const planted=[0,0],alternating=[];let drift=0,opposed=0;
  for(let i=1;i<sample.length;i++)for(let foot=0;foot<2;foot++){
    const a=sample[i-1].feet[foot],b=sample[i].feet[foot];
    if(a.y<.025&&b.y<.025){planted[foot]++;drift=Math.max(drift,a.distanceTo(b));}
    if(b.y>.39&&alternating.at(-1)!==foot)alternating.push(foot);
    if(!foot&&Math.abs(sample[i].chest)>.10&&sample[i].pelvis*sample[i].chest<0)opposed++;
  }
  assert(Math.min(...planted)>.45*hz&&drift<.012&&alternating.length>=5);
  const carry=transfers.map(xs=>xs.sort((a,b)=>a-b)[Math.floor(xs.length/2)]);
  assert(transfers.every(xs=>xs.length>6)&&carry.every(x=>x>.17),'During swing the pelvis moves off the midpoint onto either actual bearing foot');
  console.log('Single planted-leg shell and hip transfer',{hz,lowTris,draws:3,blendRegions:[...regions],supportFraction:carry});
  assert(opposed>hz,'The real mounted pelvis/chest turn in opposite directions during a stride');
  assert(departures.get('pin0')<1e-6&&[1,2,3,4,5,6].every(i=>departures.get('mix'+i)>.002),
    'Keep the sternum anchored while each side of the moving web actually deforms.');
  for(const key of ['relativeScan','jawSplit']){
    const angle=sample.map(s=>s[key]);
    assert(Math.max(...angle)-Math.min(...angle)>.09,'Each skull and its own jaw must move independently');
  }
  console.log('Mounted opposite gait',{hz,planted,drift,alternating,opposed});
  await render(null);assert.equal(subs.size,0);
}

// Verify the visible pad vertices rather than merely the tracking bone.
// Crossing the wet apron raises both a real rolling sole and discrete,
// world-stationary wet marks; inactive and ordinary horde allocate none.
for(const [x,wet] of [[0,true],[11.68,false]]){
  const boss={...game.createZombieWave(67,4)[0],position:[x,.02,-14.5]};
  tankRef.current.position.set(x,0,-25);
  await render(React.createElement(game.ZombieHorde,{zombies:[boss],posesRef:{current:new Map()},tankRef,active:true,obstacles:[],archives:[]}));
  const root=scene.getObjectByName('nightmare-boss-sculpt'),o=scene.getObjectByName('command-sole-water-contact');
  const soles=[0,1].map(i=>root.getObjectByName('command-sole-'+i));let roll=0,stable=0,worst=0;
  const mantle=root.getObjectByName('command-continuous-lower-body'),lp=mantle.geometry.getAttribute('position'),pv=new THREE.Vector3();
  const distal=[[],[]];for(let i=0;i<lp.count;i++)if(lp.getY(i)<.25)distal[Number(lp.getX(i)>0)].push(i);
  let skinClear=Infinity,skinSamples=0;
  let stamps=0,pressureSamples=0,clearSwings=0;const last=[1,1],lastSole=[.02,.02],old=[null,null],m=new THREE.Matrix4();
  for(let tick=1;tick<=140;tick++){
    for(const [cb] of [...subs].sort((a,b)=>a[1]-b[1]))cb.current({...state,clock:{elapsedTime:tick/30}},1/30);
    scene.updateMatrixWorld();if(tick<18)continue;
    for(let i=0;i<2;i++){
      const s=soles[i],foot=s.parent.getWorldPosition(pt),onTile=game.onCommandWetApron(foot.x,foot.z);
      roll=Math.max(roll,Math.abs(s.rotation.x));if(onTile&&Math.abs(s.rotation.x)<.0001&&Math.abs(foot.y-.02)<.001){
        const attr=s.geometry.getAttribute('position'),e=s.matrixWorld.elements;let min=Infinity;
        for(let j=0;j<attr.count;j++)min=Math.min(min,e[1]*attr.getX(j)+e[5]*attr.getY(j)+e[9]*attr.getZ(j)+e[13]);
        worst=Math.max(worst,Math.abs(min-game.COMMAND_SLAB_TOP));stable++;
        for(const j of distal[i]){
          mantle.getVertexPosition(j,pv).applyMatrix4(mantle.matrixWorld);
          skinClear=Math.min(skinClear,pv.y-game.COMMAND_SLAB_TOP);skinSamples++;
        }
      }
      const age=o.geometry.getAttribute('commandStepAge').getX(i),pressure=o.geometry.getAttribute('commandPressure').getX(i);
      if(pressure>.5){pressureSamples++;o.getMatrixAt(i,m);const mark=new THREE.Vector3().setFromMatrixPosition(m);
        // The contact component and gait register independent render callbacks;
        // either this simulation step or its immediately preceding pose may have published first.
        assert(game.onCommandWetApron(mark.x,mark.z)&&Math.min(foot.y,lastSole[i])<.14,
          `Contact shade at ${mark.toArray()} must be under a bearing sole, observed Y ${lastSole[i]} → ${foot.y}`);}
      if(Math.min(foot.y,lastSole[i])>.22){clearSwings++;assert.equal(pressure,0);}lastSole[i]=foot.y;
      if(age<1){
        o.getMatrixAt(i,m);const position=new THREE.Vector3().setFromMatrixPosition(m);
        assert(game.onCommandWetApron(position.x,position.z));
        if(age<last[i]){stamps++;old[i]=position;}
        else if(old[i])assert(old[i].distanceTo(position)<1e-6,'An expanding wavelet must not follow the next foot swing');
      }last[i]=age;
    }
  }
  console.log('Physical sole / wet apron',{x,wet,stamps,roll,stable,worst,pressureSamples,clearSwings});
  if(wet){assert(skinSamples>1000&&skinClear>0,'The deformed Achilles/instep must remain above the actual planted sole, not intersect the slab');
    console.log('Minimum planted Achilles/instep clearance (metres)',skinClear,skinSamples);}
  assert(roll>.055&&clearSwings>1);
  if(wet)assert(stamps>=2&&stable>35&&worst<.001&&pressureSamples>15,'Visible sole must land on the actual slab and create finite world-space marks');
  else assert.equal(stamps+pressureSamples,0,'No indoor or covered-annex water');
  await render(null);assert.equal(subs.size,0);
}
await render(React.createElement(game.ZombieHorde,{zombies:game.createZombieWave(67,1),posesRef:{current:new Map()},tankRef,active:true,obstacles:[],archives:[]}));
assert.equal(scene.getObjectByName('command-sole-water-contact'),undefined);
assert(!generated(scene.getObjectByName('nightmare-undead-heads').material).vertexShader.includes('commandPocket('),'Ordinary undead must use their original shader');
let engineLights=0;scene.traverse(o=>{if(o.isLight)engineLights++;});assert.equal(engineLights,0);
await render(null);assert.equal(subs.size,0);
// The lead arm still telegraphs a real, avoidable running-game hit. Its
// presentation must neither add damage nor conceal the inbound warning.
for(const evade of [false,true]){
  const dt=1/60,boss={...game.createZombieWave(67,4)[0],position:[0,.02,-7.44]};
  let t=0,raised=null,struck=null;const hits=[];
  tankRef.current.position.set(0,0,-12);
  await render(React.createElement(game.ZombieHorde,{zombies:[boss],posesRef:{current:new Map()},tankRef,active:true,
    obstacles:[],archives:[],onTankBreach:()=>hits.push(t)}));
  const root=scene.getObjectByName('nightmare-boss-sculpt'),arm=root.getObjectByName('command-striking-arm');
  const hand=root.getObjectByName('command-wrist-1'),geo=hand.geometry,bindP=geo.attributes.position;
  const probes=[[0,-.074,-.052],...[.165,.207,.187,.122].map((l,i)=>{
    const c=[.10,.046,.076,.120][i];return [(i-1.5)*.026*1.54,-.083-l*.78+.006+c*.40,-.096-c];
  })].map(p=>{let key=-1,dist=Infinity;const q=new THREE.Vector3(),a=new THREE.Vector3(...p);
    for(let j=0;j<bindP.count;j++){const d=q.fromBufferAttribute(bindP,j).distanceToSquared(a);if(d<dist){dist=d;key=j;}}return key;});
  const paintedBody=['command-ripped-coat','command-pelvis','command-continuous-lower-body','command-living-shoulder-net']
    .map(n=>root.getObjectByName(n)),ray=new THREE.Raycaster(),at=new THREE.Vector3(),dir=new THREE.Vector3();
  const view=new THREE.PerspectiveCamera(49,16/9,.1,300);
  let drawnSamples=0,clearPalm=0,clearDigits=0,minGap=Infinity;
  for(let i=0;i<150;i++){
    t=(i+1)*dt;if(evade&&raised!==null)tankRef.current.position.z-=8*dt;
    for(const [cb] of [...subs].sort((a,b)=>a[1]-b[1]))cb.current({...state,clock:{elapsedTime:t}},dt);
    scene.updateMatrixWorld();if(root.visible&&arm.rotation.x>.57)raised??=t;
    if(raised!==null&&arm.rotation.x<-.08)struck??=t;
    if(!evade&&root.visible&&!struck&&hand.morphTargetInfluences?.[0]>.72&&i%2===0){
      // Guard planted facing the boss. The mount's real arm, actual morphed
      // surface vertices and projected triangle geometry are used. A point
      // in front of the torso is not enough: trace behind it too.
      const bp=root.getWorldPosition(at),tp=tankRef.current.getWorldPosition(new THREE.Vector3());
      dir.copy(tp).sub(bp);dir.y=0;dir.normalize();view.position.copy(bp).addScaledVector(dir,14);view.position.y=3.8;
      view.lookAt(bp.x,bp.y+3.5,bp.z);view.updateMatrixWorld();
      let dig=0;const projected=[];
      probes.forEach((k,j)=>{const world=hand.localToWorld(hand.getVertexPosition(k,new THREE.Vector3()));
        dir.copy(world).sub(view.position).normalize();ray.set(view.position,dir);
        const silhouette=ray.intersectObjects(paintedBody,false),isolated=!silhouette.length;
        if(process.env.RAKE_TRACE&&!isolated)console.log('Rake overlap',i,j,silhouette[0].object.name);
        if(!j){if(isolated)clearPalm++;}else{if(isolated)dig++;const ndc=world.project(view);projected.push(new THREE.Vector2(ndc.x*960,ndc.y*540));}
      });
      drawnSamples++;clearDigits+=dig;
      for(let j=1;j<4;j++)minGap=Math.min(minGap,projected[j-1].distanceTo(projected[j]));
    }
  }
  if(!evade){console.log('Rake / unobstructed player-side negative space',{drawnSamples,clearPalm,clearDigits,minGap});
    assert(drawnSamples>=2&&clearPalm===drawnSamples&&clearDigits>=3*drawnSamples&&minGap>4,
      'At anticipation, palm and at least three separated fingertips must read off the leg/coat/torso at player distance.');}
  assert(raised!==null&&struck!==null&&struck-raised>=(evade?.5:.53),JSON.stringify({evade,raised,struck,hits}));
  assert.deepEqual(hits,evade?[]:[struck]);console.log('Mounted telegraph',{evade,raised,struck,hits});
  await render(null);assert.equal(subs.size,0);
}
// An actual close defender rush, not just a free-walking skeleton test. Use
// the retained chase's world camera and a defender crossing the attack lane;
// projection is measurement only and is not passed to the stance solver.
for(const hz of [30,60]){
  const dt=1/hz,boss={...game.createZombieWave(67,4)[0],position:[6.42,.02,-17.9]};
  const rider={position:new THREE.Vector3(-3.55,.02,-17.62)},id='crossing-defender',samples=[],hits=[];
  camera.position.set(6.229,3.8,-2.89);
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(-.315913,-.139047,-.938544)));camera.updateMatrixWorld();
  tankRef.current.position.set(7,0,2);let t=0;
  await render(React.createElement(game.ZombieHorde,{zombies:[boss],posesRef:{current:new Map()},tankRef,active:true,
    friendliesRef:{current:[{id,alive:true}]},friendlyPosesRef:{current:new Map([[id,rider]])},
    obstacles:[],archives:[],onFriendlyBreach:e=>{assert.equal(e.friendlyId,id);hits.push(t);}}));
  const root=scene.getObjectByName('nightmare-boss-sculpt'),obj=n=>root.getObjectByName(n);
  const legs=['left','right'].map(s=>obj('command-leg-'+s)),heads=[obj('command-double-faced-skull'),obj('command-watchers-skull')];
  const from=(m,y)=>new THREE.Vector3(0,y,0).applyMatrix4(m.matrixWorld);
  for(let i=0;i<3.8*hz;i++){
    t=(i+1)*dt;const cross=THREE.MathUtils.smoothstep(t,1.28,2.18);
    rider.position.set(-3.55+cross*2.85,.02,-17.62+cross*1.05);
    for(const [cb] of [...subs].sort((a,b)=>a[1]-b[1]))cb.current({...state,clock:{elapsedTime:t}},dt);
    scene.updateMatrixWorld();if(t<.65||!root.visible)continue;
    const toes=legs.map(l=>from(l.getObjectByName('boot'),0)),straight=legs.map(l=>{
      const thigh=l.getObjectByName('thigh'),shin=l.getObjectByName('shin');
      const hip=from(thigh,.5),knee=from(thigh,-.5),ankle=from(shin,-.5);
      return hip.distanceTo(ankle)/(hip.distanceTo(knee)+knee.distanceTo(ankle));
    });
    const separation=m=>Math.abs(m[0].clone().project(camera).x-m[1].clone().project(camera).x)*960;
    const knees=legs.map(l=>from(l.getObjectByName('thigh'),-.5)),projectX=v=>v.clone().project(camera).x*960;
    // Screen-handed ordering matters: absolute separations alone let the legs
    // cross and then swap sides, the failure visible in the R27 normal chase.
    samples.push({t,toes,straight,headPx:separation(heads.map(m=>from(m,0))),footPx:separation(toes),
      kneeOrder:projectX(knees[0])-projectX(knees[1]),toeOrder:projectX(toes[0])-projectX(toes[1])});
  }
  assert(hits.length>=2,'Defender must actually take the rake, then the next attack');
  // Include the real second contact, after the defender has crossed the
  // incoming stride, and its reach/recovery on either side of the hit.
  const contact=samples.filter(s=>s.t>=hits[1]-.19&&s.t<=hits[1]+.21);
  const leg=[0,1].find(k=>contact.every(s=>s.toes[k].y<.025&&s.toes[k].distanceTo(contact[0].toes[k])<.008&&s.straight[k]>.97));
  const footWidth=Math.min(...contact.map(s=>s.toes[0].distanceTo(s.toes[1]))),headPx=Math.min(...contact.map(s=>s.headPx));
  const footPx=Math.min(...contact.map(s=>s.footPx));
  const kneeOrder=Math.min(...contact.map(s=>s.kneeOrder)),toeOrder=Math.min(...contact.map(s=>s.toeOrder));
  console.log('Mounted crossing defender contact',{hz,hits,leg,footWidth,footPx,headPx,kneeOrder,toeOrder});
  assert(kneeOrder>40&&toeOrder>50,'The two knees and two toes must stay on their own respective sides through the rake');
  assert(leg!==undefined&&footWidth>2.25&&footPx>39&&headPx>36,
    'Strike must keep a long support leg still, a separate toe silhouette and two visible skull centers');
  await render(null);assert.equal(subs.size,0);
}
// Real 1080p R21 chase transform and root locations from the retained
// player-chase.json. Replay combat poses from each mark with a defender on
// either flank; the unchanged camera is only used to measure projection.
// The separate real-film run records these metrics on unmodified wave four.
const traceMarks=[['turn',6.50,-18.2],['breach',4.50,-17.9],['crossing',2.50,-17.9],['contact',.8942,-17.8998]];
const direction=new THREE.Vector3(-.3159129494,-.1390468714,-.9385440725);
camera.position.set(6.2289662,3.8,-2.88966334);camera.lookAt(camera.position.clone().add(direction));camera.updateMatrixWorld();
tankRef.current.position.set(3,0,-8.5);
for(const [name,x,z] of traceMarks)for(const flank of [-1,1]){
  const dt=1/30,defender={position:new THREE.Vector3(x+flank*.8,.02,z+.13)},id='guard';
  const boss={...game.createZombieWave(67,4)[0],position:[x,.02,z]},hits=[];
  await render(React.createElement(game.ZombieHorde,{zombies:[boss],posesRef:{current:new Map()},tankRef,active:true,
    friendliesRef:{current:[{id,alive:true}]},friendlyPosesRef:{current:new Map([[id,defender]])},
    obstacles:[],archives:[],onFriendlyBreach:()=>hits.push(true)}));
  const root=scene.getObjectByName('nightmare-boss-sculpt');
  const heads=['command-double-faced-skull','command-watchers-skull'].map(n=>root.getObjectByName(n));
  const upper=['command-upper-0','command-striking-arm'].map(n=>root.getObjectByName(n));
  const hands=[0,1].map(i=>root.getObjectByName('command-wrist-'+i));
  const surfaces=heads.map(o=>{
    const list=[];o.traverse(m=>{if(m.geometry)list.push(m);});return list;
  });
  const projection=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse),clip=new THREE.Matrix4();
  const pixel=v=>{v.project(camera);return {x:(1+v.x)*960,y:(1-v.y)*540};};
  let top=Infinity,gap=Infinity,jawShoulder=Infinity,eyeFacing=1;
  let minCrownTier=Infinity,hangRange=[Infinity,-Infinity],minTierWorld=Infinity,minArmClearance=Infinity;
  for(let tick=1;tick<=75;tick++){
    for(const [cb] of [...subs].sort((a,b)=>a[1]-b[1]))cb.current({...state,clock:{elapsedTime:tick*dt}},dt);
    scene.updateMatrixWorld();if(tick<28)continue;
    if(tick===40&&flank===1&&(name==='turn'||name==='contact')){
      const world=new THREE.Vector3(),normal=new THREE.Vector3(),eyeDir=new THREE.Vector3(),nm=new THREE.Matrix3();
      for(const o of [...heads,root.getObjectByName('command-front-jaw'),upper[1],root.getObjectByName('command-ripped-coat')]){
        const s=generated(o.material);assert.equal((s.vertexShader.match(/\bvCommandFireResponse\+=commandPocket/g)||[]).length,5);
        assert(s.fragmentShader.includes('reflectedLight.directDiffuse+=diffuseColor.rgb')&&!s.fragmentShader.includes('baySource='));
        const a=o.geometry.getAttribute('position'),b=o.geometry.getAttribute('normal'),samples=[];nm.getNormalMatrix(o.matrixWorld);
        for(let k=0;k<a.count;k+=5){
          world.fromBufferAttribute(a,k).applyMatrix4(o.matrixWorld);normal.fromBufferAttribute(b,k).applyMatrix3(nm).normalize();
          eyeDir.copy(camera.position).sub(world).normalize();if(eyeDir.dot(normal)<.10)continue;
          samples.push(pocket.reduce((sum,src)=>sum+incident(src,world,normal),0));
        }
        samples.sort((a,b)=>a-b);const q=x=>+samples[Math.floor(x*(samples.length-1))].toFixed(3);
        assert(samples.length>12&&q(.85)>.12&&q(.85)>q(.15)+.10,'The actual visible model needs bright contours AND an unlit side');
        console.log('Mounted, camera-visible practical response',{name,part:o.name,q15:q(.15),q85:q(.85)});
      }
    }
    const faces=heads.map((o,j)=>{
      // Exact projected limits across every visible head/jaw/crown vertex,
      // not the enclosing rotated 3D cuboid (its empty corners can overlap).
      let t=Infinity,l=Infinity,r=-Infinity;
      for(const m of surfaces[j]){
        const v=m.geometry.getAttribute('position').array,e=clip.multiplyMatrices(projection,m.matrixWorld).elements;
        for(let k=0;k<v.length;k+=3){
          const x=v[k],y=v[k+1],z=v[k+2],w=1/(e[3]*x+e[7]*y+e[11]*z+e[15]);
          const px=(1+(e[0]*x+e[4]*y+e[8]*z+e[12])*w)*960,py=(1-(e[1]*x+e[5]*y+e[9]*z+e[13])*w)*540;
          l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,py);
        }
      }
      const centre=o.getWorldPosition(headA),axis=headB.set(0,0,-1).transformDirection(o.matrixWorld);
      eyeFacing=Math.min(eyeFacing,axis.dot(pt.copy(camera.position).sub(centre).normalize()));
      const shoulder=pixel(upper[j].getWorldPosition(pt));
      const eye=pixel(o.localToWorld(pt.set(0,.071,-.11)));
      jawShoulder=Math.min(jawShoulder,shoulder.y-eye.y);
      return {top:t,left:l,right:r};
    });
    minCrownTier=Math.min(minCrownTier,faces[0].top-faces[1].top);
    const tier=heads[1].getWorldPosition(headA).y-heads[0].getWorldPosition(headB).y;
    minTierWorld=Math.min(minTierWorld,tier);
    const palm=hands.map(o=>pixel(o.localToWorld(pt.set(0,-.105,-.035))));
    const hang=palm[0].y-palm[1].y;
    hangRange[0]=Math.min(hangRange[0],hang);hangRange[1]=Math.max(hangRange[1],hang);
    minArmClearance=Math.min(minArmClearance,Math.abs(palm[0].x-pixel(root.getObjectByName('command-pelvis').localToWorld(pt.set(0,.59,0))).x));
    faces.sort((a,b)=>a.left-b.left);gap=Math.min(gap,faces[1].left-faces[0].right);top=Math.min(top,...faces.map(f=>f.top));
  }
  console.log('R21 camera/mark × mounted defender flank',{name,flank,top:Math.floor(top),gap:Math.floor(gap),jawShoulder:Math.floor(jawShoulder),eyeFacing:+eyeFacing.toFixed(2)});
  console.log('Loaded silhouette at player distance',{name,flank,crownTierPx:Math.round(minCrownTier),
    minTierWorld:+minTierWorld.toFixed(2),hangingPalmDyPx:hangRange.map(Math.round),lateralHandPx:Math.round(minArmClearance)});
  assert(minCrownTier>10&&minTierWorld>.60&&hangRange[0]>24&&minArmClearance>80&&gap>42,
    'Both separate skulls need unequal heights throughout the contact, with the heavy fist hanging below the striking hand');
  assert(hits.length&&top>=72&&gap>10&&jawShoulder>60&&eyeFacing>.17,
    'Both whole crowns must clear the title bar, separate from each other and the shoulder, and show at least profile');
  await render(null);assert.equal(subs.size,0);
}
