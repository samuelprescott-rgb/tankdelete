import {useRotorWash} from './rotorWash';
import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {HueyMeshes,useOwnedHuey} from './HueyAirframe';
import {TransportDoorGunner,type DoorContacts,type DoorPose} from './TransportDoorGunner';
import {TransportManifest} from './TransportManifest';
import {createRelayStreak,makeRelayStoryboard,RELAY_STREAK_SECONDS} from './relayStoryboard';
import { SMOKE_DRIFT_RATE } from './smokeMotion';
import {coalShadow,coalRim} from './sootPigment';
import {createRelayGunnerFall,GUNNER_RELEASE} from './relayGunnerFall';
import {relayCombustionCel} from './relayCombustionCel';
import {relayChinFairing} from './relayChinFairing';
import {registerRelayInk} from './flyoverResources';
import {advanceCampaignFlight,DAY_PAD,DAY_YAW,newCampaignFlight,createRelayPass,rimCrest,rimRadius,
  RELAY_SCALE,RELAY_SHELF_EDGE,RIDGE_CLEAR,RIDGE_IN,RIDGE_HIT,RIDGE_LOST,ridgePose,ridgeGroundHeight,transportPose,type DayCall,type RelayPass} from '../../lib/campaignFlights';

const clamp=(n:number)=>Math.min(1,Math.max(0,n));
const TRAIL=30,COLUMN=13,SMOKE=TRAIL+COLUMN,FIRE=22;
const RELAY_FX_SCALE=.88;
// Indexed, translucent smoke ink. The scalloped crown, sheared lower edge
// and small holes leave real sky between curls, rather than opaque spheres.
function paintSlipstream(){
  const n=48,pixels=new Uint8Array(n*n*4);
  const shadow=new THREE.Color(...coalShadow),rim=new THREE.Color(...coalRim);
  const ramp=Array.from({length:7},(_,i)=>shadow.clone().lerp(rim,(i/6)**2)
    .convertLinearToSRGB().toArray().map(v=>Math.round(v*255)));
  const lobes=[[-.39,-.05,.38,.33],[-.16,-.26,.50,.36],[.30,-.18,.45,.32],[.48,.13,.39,.31],
    [.22,.41,.33,.38],[-.13,.36,.36,.42],[-.43,.19,.31,.32],[-.04,.02,.54,.43]];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const x=(i+.5)/n*2-1,y=(j+.5)/n*2-1;
    const grain=Math.sin(x*21.3+y*9.1)*.50+Math.sin(y*27.7-x*12.8)*.34+Math.sin(x*38.8+y*35.3)*.16;
    const u=x+grain*.043,v=y+Math.sin(x*17+y*9)*.029;
    let density=0,light=0;
    for(const [cx,cy,rx,ry] of lobes){
      const dx=(u-cx)/rx,dy=(v-cy)/ry,k=1-dx*dx-dy*dy;
      if(k<=0)continue;density+=k*k;light=Math.max(light,k*(.62-.35*dx+.48*dy));
    }
    const curl=1-((u+.42)/.20)**2-((v+.11)/.095)**2;
    const value=clamp(density*.98+(grain*.08))* (1-.82*clamp(curl*2.2));
    if(value<.045)continue;
    const ink=ramp[Math.round(clamp(.14+.64*light+.16*v-.10*u+.09*grain)*6)],k=(j*n+i)*4;
    pixels[k]=ink[0];pixels[k+1]=ink[1];pixels[k+2]=ink[2];pixels[k+3]=Math.round(202*Math.sqrt(value));
  }
  const tex=new THREE.DataTexture(pixels,n,n,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=tex.magFilter=THREE.NearestFilter;tex.generateMipmaps=false;
  tex.name='kestrel-sheared-smoke-ink';tex.needsUpdate=true;return tex;
}
function makeSkidBed(){
  const vertices:number[]=[],colors:number[]=[],indices:number[]=[];
  const tint=new THREE.Color(),earth=new THREE.Color('#8b8260'),scar=new THREE.Color('#616343');
  const slices=38;
  for(let i=0;i<=slices;i++){
    const a=Math.PI*2*i/slices,irregular=1+.049*Math.sin(7*a)+.041*Math.cos(11*a+.8);
    for(let band=0;band<5;band++){
      const d=[.01,.44,.75,.93,1][band];
      vertices.push(DAY_PAD[0]+.25+3.7*d*irregular*Math.cos(a),.007,DAY_PAD[2]-.7+2.35*d*irregular*Math.sin(a));
      tint.copy(earth).lerp(scar,.34+.24*Math.sin(a*7+band*.65));
      colors.push(tint.r,tint.g,tint.b,[.77,.78,.68,.34,0][band]);
      if(i&&band){const q=i*5+band;indices.push(q-6,q-5,q,q-6,q,q-1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));g.setIndex(indices);return g;
}
// An irregular continuous rim around the playable sector. No moving/deforming
// scenery when the player turns; only the plane's course is chosen at entry.
function makeSpur(){
  const vertices:number[]=[],inks:number[]=[],idx:number[]=[];
  const rgb=new THREE.Color();
  for(let i=0;i<=192;i++){
    const a=i*Math.PI*2/192,r= rimRadius(a),crest=rimCrest(a);
    for(let row=0;row<4;row++){
      const radius=row===3?RELAY_SHELF_EDGE:r+row;
      vertices.push(Math.cos(a)*radius,row===0?-.5:row===1?crest*(.48+.09*Math.sin(i*.95)):row===2?crest:.8,Math.sin(a)*radius);
      rgb.set(row>=2?'#3f514c':row===1?(i%7<3?'#334540':'#394b44'):'#2c3936');
      inks.push(rgb.r,rgb.g,rgb.b);
    }
    if(i) for(let j=0;j<3;j++){const k=i*4+j;idx.push(k-4,k-3,k,k,k-3,k+1);}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(inks,3));g.setIndex(idx);return g;
}

export function CampaignFlights({running,deploy,onCall,roster=[],contacts}:{running:boolean;deploy:(slot:number)=>boolean;onCall:(call:DayCall)=>void;roster?:readonly {id:string}[];contacts?:DoorContacts}){
  const root=useRef<THREE.Group>(null),transport=useRef<THREE.Group>(null),relay=useRef<THREE.Group>(null);
  const main=useRef<THREE.Group>(null),tail=useRef<THREE.Group>(null),otherMain=useRef<THREE.Group>(null),otherTail=useRef<THREE.Group>(null);
  const crewPose=useRef<DoorPose>(null),relayCrewPose=useRef<DoorPose>(null);
  const flash=useRef<THREE.Mesh>(null),ember=useRef<THREE.Mesh>(null);
  const wash=useRotorWash('verge');
  const impact=useRef<THREE.Group>(null),impactFlame=useRef<THREE.Mesh>(null);
  const smoke=useRef<THREE.InstancedMesh>(null),dash=useRef<THREE.Mesh>(null);
  const fire=useRef<THREE.InstancedMesh>(null),board=useRef<ReturnType<typeof makeRelayStoryboard>|null>(null);
  const clock=useRef(newCampaignFlight());
  const gunnerFlame=useRef<THREE.Mesh>(null),gunner=useRef<THREE.Group|null>(null);
  const updateGunnerFall=useMemo(createRelayGunnerFall,[]);
  const pass=useRef<RelayPass|null>(null);
  const {assets}=useOwnedHuey(false,true);
  // The scene's ordinary fog is almost opaque at this distance. Pre-haze
  // four large value shapes instead: light windshield, olive upper shell,
  // cool belly and dark rotor. Keep the actual lit 3-D mesh and open door;
  // the near transport and ambient aircraft still use their own materials.
  const horizonInk=useMemo(()=>{
    const pigment=(color:string)=>new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide,fog:false});
    return {paint:pigment('#32403a'),trim:pigment('#27312e'),glazing:pigment('#8c9c99'),rotorPaint:pigment('#293531')};
  },[]);
  const horizonAssets=useMemo(()=>({...assets,...horizonInk}),[assets,horizonInk]);
  useEffect(()=>()=>Object.values(horizonInk).forEach(m=>m.dispose()),[horizonInk]);
  const spur=useMemo(makeSpur,[]),bed=useMemo(makeSkidBed,[]),smokeInk=useMemo(paintSlipstream,[]);
  const paint=useMemo(()=>({streak:createRelayStreak(),chin:relayChinFairing(),hits:[0,1,2,3].map(i=>relayCombustionCel('hit',i)),
    wakes:[0,1,2,3].map(i=>relayCombustionCel('wake',i))}),[]);
  const scene=useThree(state=>state.scene);
  useLayoutEffect(()=>{
    gunner.current=relay.current?.getObjectByName('door-gunner-pivot') as THREE.Group ?? null;
    const hull=relay.current?.getObjectByName('huey-body');
    if(!(hull instanceof THREE.Mesh)||!smoke.current||!fire.current||!dash.current||!flash.current||!ember.current||!impactFlame.current)return;
    return registerRelayInk(scene,{smoke:smoke.current,fire:fire.current,streak:dash.current,
      hull,flash:flash.current,wake:ember.current,groundFlame:impactFlame.current,hits:paint.hits,wakes:paint.wakes});
  },[paint,scene]);
  useEffect(()=>()=>[paint.streak,paint.chin,...paint.hits,...paint.wakes].forEach(g=>g.dispose()),[paint]);
  useEffect(()=>()=>{spur.dispose();bed.dispose();smokeInk.dispose();},[spur,bed,smokeInk]);
  const scratch=useMemo(()=>({obj:new THREE.Object3D(),color:new THREE.Color(),dir:new THREE.Vector3()}),[]);

  useFrame(({camera},dt)=>{
    if(!root.current||!transport.current||!relay.current||!smoke.current)return;
    const c=clock.current;
    if(c.time>=RIDGE_CLEAR)return;
    advanceCampaignFlight(c,dt,running,deploy,onCall);
    const t=c.time,a=transportPose(t);
    if(t>=RIDGE_IN&&!pass.current){
      const d=camera.getWorldDirection(scratch.dir),p=camera.position,lens=camera as THREE.PerspectiveCamera;
      pass.current=createRelayPass(p.x,p.y,p.z,d.x,d.y,d.z,lens.fov??60,lens.aspect??16/9);
      board.current=makeRelayStoryboard(pass.current);
    }
    const shot=pass.current??undefined,b=ridgePose(t,shot);
    root.current.userData.flightTime=t;
    transport.current.userData.flightTime=t;
    transport.current.visible=a.visible;transport.current.position.set(a.x,a.y,a.z);transport.current.rotation.set(a.pitch,a.yaw,a.roll,'YXZ');
    crewPose.current?.(t,a.visible);
    relay.current.visible=b.visible;relay.current.position.set(b.x,b.y,b.z);relay.current.rotation.set(b.pitch,b.yaw,b.roll,'YXZ');
    relayCrewPose.current?.(t,b.visible,t<RIDGE_HIT,Math.max(0,t-GUNNER_RELEASE));
    if(shot&&gunner.current&&gunnerFlame.current){
      updateGunnerFall(t,shot,relay.current,gunner.current,gunnerFlame.current,camera,paint.wakes);
    }
    if(main.current)main.current.rotation.y=t*28;
    if(tail.current)tail.current.rotation.x=t*47;
    const damageAge=Math.max(0,t-RIDGE_HIT);
    if(otherMain.current)otherMain.current.rotation.y=Math.min(t,RIDGE_HIT)*23+damageAge*12;
    if(otherTail.current)otherTail.current.rotation.x=t*42;
    wash.update(a.x,a.z,a.y-DAY_PAD[1],a.visible,t);
    // A brief painted streak terminating directly on the SECOND aircraft.
    // Fully predetermined: no launch source, aim input, raycast or collision.
    if(dash.current&&board.current){
      const k=clamp((t-RIDGE_HIT+RELAY_STREAK_SECONDS)/RELAY_STREAK_SECONDS);
      dash.current.visible=k>0&&k<1;
      dash.current.position.lerpVectors(board.current.start,board.current.end,k);
      dash.current.quaternion.copy(board.current.rotation);
    }
    if(flash.current&&board.current){
      const k=(t-RIDGE_HIT)/.82;
      flash.current.visible=k>=0&&k<1;
      flash.current.position.copy(board.current.end);flash.current.quaternion.copy(camera.quaternion);
      flash.current.geometry=paint.hits[Math.min(3,Math.floor(clamp(k)*4))];
      const beat=.60+Math.sin(clamp(k*3.6)*Math.PI*.5)*(1-clamp((k-.35)/.65))*.45;
      flash.current.scale.setScalar(RELAY_FX_SCALE*beat);
    }
    if(ember.current){
      ember.current.visible=damageAge>.14 &&b.visible;
      if(ember.current.visible){
        ember.current.geometry=paint.wakes[Math.floor(damageAge*10)%4];
        ember.current.quaternion.copy(relay.current.quaternion).invert().multiply(camera.quaternion);
        ember.current.rotateZ(-.12+.13*Math.sin(damageAge*6));
        const flick=(.91+Math.sin(t*15)*.10)*RELAY_FX_SCALE/RELAY_SCALE;
        ember.current.scale.set(-flick,flick,1);
      }
    }
    // Each puff remembers where the aircraft was, not where it is now. The
    // spent trail lingers, rises and drifts after the bird drops behind cover.
    const obj=scratch.obj,batch=smoke.current;
    if(fire.current){
      // Short-lived, tumbling fragments at *previous* locations; the relay
      // pulls away from them as it rolls. Cold smoke outlives the fire.
      const bits=fire.current;let n=0;
      for(let i=0;i<FIRE;i++){
        const born=RIDGE_HIT+.11+i*(RIDGE_LOST-RIDGE_HIT-.16)/(FIRE-1),age=t-born;
        if(age<0||age>1.16)continue;
        const p=ridgePose(born,shot),fraction=age/1.16,seed=i*2.39996,scale=RELAY_FX_SCALE;
        const roll=Math.sin(seed),side=Math.cos(seed)*fraction*1.50*scale;
        obj.position.set(p.x+side*Math.cos(p.yaw)+age*.49,p.y+scale*(.29+roll*.28)+age*.48-age*age*1.9,
          p.z-side*Math.sin(p.yaw));
        obj.quaternion.copy(camera.quaternion);obj.rotateZ(Math.PI+.27*roll+fraction*.53*roll);
        const size=scale*(.52+.13*Math.sin(seed+age*8))*(1-fraction*.92);
        obj.scale.set(size,size,1);obj.updateMatrix();bits.setMatrixAt(n++,obj.matrix);
      }
      bits.count=n;bits.visible=n>0;if(n)bits.instanceMatrix.needsUpdate=true;
    }
    let count=0;
    for(let i=0;i<TRAIL;i++){
      const birth=RIDGE_HIT+i*(RIDGE_LOST-RIDGE_HIT)/(TRAIL-1),age=t-birth;
      if(age<0||age>11)continue;
      const p=ridgePose(birth,shot),life=age/11,swirl=Math.sin(i*2.77+age*.39);
      // The engine starts with a narrow outlet, clear of the 78 px hull.
      // Once detached, the 1571 charcoal billows expand independently of
      // airframe scale. At the new ridge distance this recovers their
      // original overlap and projected breadth, without moving the flight.
      const aft=RELAY_SCALE*1.10;
      obj.position.set(p.x+aft*Math.sin(p.yaw)+age*.96+swirl*life*1.7,p.y+.42+age*SMOKE_DRIFT_RATE*1.07+Math.sin(i*1.4)*.40,
        p.z+aft*Math.cos(p.yaw)+age*.11);
      const swell=THREE.MathUtils.smoothstep(age,0,.45);
      const size=(1.68+age*.79)*(.58+.80*swell)*(1-clamp((life-.67)/.33));
      obj.scale.set(size*1.34,size*(.94+.15*swirl),1);
      obj.quaternion.copy(camera.quaternion);obj.rotateZ(.47*swirl+i*.63+age*.10);obj.updateMatrix();
      batch.setMatrixAt(count,obj.matrix);
      scratch.color.setScalar(.75+.45*life+.09*swirl);
      batch.setColorAt(count,scratch.color);count++;
    }
    // A separate, short orange crown and a slower mushroom of dust mark
    // WHERE it came down, while the airborne trail continues drifting.
    const end=ridgePose(RIDGE_LOST,shot),age=t-RIDGE_LOST;
    const ground=ridgeGroundHeight(end.x,end.z);
    if(impact.current){
      impact.current.visible=age>=0&&age<1.85;
      impact.current.position.set(end.x,ground+.12,end.z);
      impact.current.scale.setScalar(.81+1.45*easeFlare(age));
      if(impactFlame.current){
        impactFlame.current.quaternion.copy(camera.quaternion);
        impactFlame.current.geometry=paint.hits[Math.min(3,Math.floor(clamp(age/1.85)*4))];
      }
    }
    if(age>=0)for(let i=0;i<COLUMN;i++){
      const life=age-i*.26;
      if(life<0||life>=7.8)continue;
      const swell=(1.15+.59*life)*(1-clamp((life-4.8)/3));
      obj.position.set(end.x+Math.sin(i*2.3)*(1.7+.27*life)+.52*life,
        ground+.18+life*1.38+i*.17,end.z+.15*life+1.3*Math.cos(i*3.04));
      obj.scale.set(1.48*swell,swell,1);obj.quaternion.copy(camera.quaternion);obj.rotateZ(i+life*.1);obj.updateMatrix();
      batch.setMatrixAt(count,obj.matrix);scratch.color.setRGB(.86+life*.027,.76+life*.035,.63+life*.04);
      batch.setColorAt(count,scratch.color);count++;
    }
    batch.count=count;batch.visible=count>0;
    if(count){batch.instanceMatrix.needsUpdate=true;if(batch.instanceColor)batch.instanceColor.needsUpdate=true;}
    root.current.userData.phase=t<RIDGE_HIT?'patrol':t<RIDGE_LOST?'falling':'afterglow';
  });
  return <group name="campaign-airlift" ref={root}>
    <mesh geometry={spur} name="relay-ridge-spur"><meshBasicMaterial vertexColors side={THREE.DoubleSide}/></mesh>
    <mesh geometry={bed} name="trampled-kestrel-bay" renderOrder={1}>
      <meshBasicMaterial vertexColors transparent depthWrite={false} side={THREE.DoubleSide} forceSinglePass/>
    </mesh>
    <group ref={transport} name="kestrel-campaign-transport" visible={false}>
      <TransportManifest flight={transport} roster={roster}/>
      <HueyMeshes assets={assets} distant mainRotorRef={main} tailRotorRef={tail}/>
      <TransportDoorGunner poseRef={crewPose} contacts={contacts} port/>
    </group>
    <primitive object={wash.mesh}/>
    <group position={[DAY_PAD[0],.034,DAY_PAD[2]]} rotation-y={DAY_YAW} name="kestrel-ground-panels">
      {[-1,1].map(side=><mesh key={side} position={[1.45,0,side*1.48]} rotation-x={-Math.PI/2}>
        <planeGeometry args={[.34,1.14]}/><meshBasicMaterial color="#ba9253" transparent opacity={.72} depthWrite={false}/>
      </mesh>)}
    </group>
    <group ref={relay} name="relay-damaged-aircraft" scale={RELAY_SCALE} visible={false}>
      <HueyMeshes assets={horizonAssets} distant mainRotorRef={otherMain} tailRotorRef={otherTail}/>
      <TransportDoorGunner poseRef={relayCrewPose} ridge/>
      <mesh geometry={paint.chin} material={horizonInk.trim} dispose={null} name="relay-rounded-chin"/>
      <mesh ref={ember} name="relay-damaged-engine-wake" visible={false} position={[.81,.49,.71]} geometry={paint.wakes[0]}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} toneMapped={false} fog={false}/></mesh>
    </group>
    <mesh name="falling-gunner-fire" ref={gunnerFlame} geometry={paint.wakes[0]} visible={false}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} toneMapped={false} fog={false}/>
    </mesh>
    <mesh ref={dash} name="relay-impact-streak" scale={.46} geometry={paint.streak} visible={false}>
      <meshBasicMaterial vertexColors toneMapped={false} fog={false}/>
    </mesh>
    <mesh ref={flash} name="relay-strike-flash" geometry={paint.hits[0]} visible={false}>
      <meshBasicMaterial vertexColors toneMapped={false} fog={false}/>
    </mesh>
    <group ref={impact} name="relay-ground-impact" visible={false}>
      <mesh ref={impactFlame} scale={[.92,1.28,1]} geometry={paint.hits[0]}><meshBasicMaterial vertexColors toneMapped={false} fog={false}/></mesh>
    </group>
    <instancedMesh ref={smoke} name="relay-drifting-smoke" visible={false} frustumCulled={false} args={[undefined,undefined,SMOKE]}>
      <planeGeometry args={[2,2]}/><meshBasicMaterial transparent depthWrite={false} fog={false} map={smokeInk}/>
    </instancedMesh>
    <instancedMesh ref={fire} name="relay-tumbling-fire-trail" visible={false} frustumCulled={false} args={[paint.wakes[2],undefined,FIRE]}>
      <meshBasicMaterial vertexColors toneMapped={false} fog={false}/>
    </instancedMesh>
  </group>;
}
const easeFlare=(age:number)=>Math.sin(clamp(age/1.85)*Math.PI)**.70;
