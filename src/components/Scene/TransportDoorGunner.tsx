import {helicopterRoundGeometry,helicopterRoundInk} from './helicopterRounds';
import {useEjectBrass} from './SpentBrass';
import {makeSmgFlash} from './ghostRoundArt';
import {useEffect,useImperativeHandle,useLayoutEffect,useMemo,useRef,type RefObject} from 'react';
import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { INFANTRY_WORLD_SCALE, infantryAimHeight, infantryRifleBind } from '../../lib/infantryMetrics';
import { DOOR_CREW_INK, M16_GEOMETRY } from './USInfantrySquad';
import {poseEmbarkedRig,travelBody} from './TransportManifest';
import {createInfantryRig,bindInfantryRig,releaseInfantryRig,applyInfantryWeaponPose} from './infantryGeometry';

const prop=infantryRifleBind('service',false);
function buildStation(){
  const parts:T.BufferGeometry[]=[];
  const cuboid=(x:number,y:number,z:number,w:number,h:number,d:number,ink:string,tilt=0)=>{
    const g=new T.BoxGeometry(w,h,d).rotateZ(tilt).translate(x,y,z),c=new T.Color(ink);
    const rgb=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<g.attributes.position.count;i++)c.toArray(rgb,i*3);
    g.setAttribute('color',new T.BufferAttribute(rgb,3));parts.push(g);
  };
  // The canvas pan folds out from a steel hinge over the pilot-side floor.
  // A separate, braced tread carries BOTH boots, just below the door floor.
  cuboid(.626,-.173,-.367,.34,.053,.36,'#666846');
  cuboid(.496,-.196,-.37,.06,.055,.38,'#444b41');
  for(const z of [-.512,-.245]){
    cuboid(.598,-.285,z,.27,.033,.026,'#505649',.61);
    cuboid(.776,-.50,z-.052,.44,.041,.034,'#51574b',.24);
  }
  cuboid(.932,-.456,-.519,.49,.042,.47,'#525b54');
  for(const z of [-.70,-.59,-.48,-.37])cuboid(.951,-.433,z,.38,.009,.018,'#6f7665');
  // Flecks of the paint-pen service number on the parked door panel:
  // not a rectangular self-lit sign suspended outside the open aperture.
  for(const [y,z,h,d] of [[-.079,.880,.010,.045],[-.094,.899,.024,.008],[-.109,.880,.008,.044],
    [-.103,.867,.015,.008],[-.079,.934,.010,.030],[-.096,.942,.027,.009]]){
    cuboid(.806,y,z,.009,h,d,'#a29d7c');
  }
  const g=mergeGeometries(parts,false)!;for(const p of parts)p.dispose();return g;
}
const station=buildStation(),steel=new T.MeshStandardMaterial({vertexColors:true,roughness:.95,metalness:.08});
export interface DoorContacts {
  actors:readonly {id:string;alive:boolean;stance?:'standing'|'kneeling';visualScale?:number}[];
  poses:RefObject<ReadonlyMap<string,{position:T.Vector3;active?:boolean}>>;
}
export type DoorPose=(time:number,visible:boolean,canFire?:boolean,fallAge?:number)=>void;

const up=new T.Vector3(0,1,0);
const ROUND_SLOTS=8;
const doorFlash=makeSmgFlash(1,1);
const flashInk=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false,depthWrite:false});
const muzzle=new T.Vector3(...prop.muzzle),pad=new T.Vector3(...prop.pad);
const seatYaw=-1.16;
export function TransportDoorGunner({poseRef,contacts,port=false,ridge=false}:{
  poseRef:RefObject<DoorPose|null>;contacts?:DoorContacts;port?:boolean;ridge?:boolean
}){
  const ejectBrass=useEjectBrass();
  const doorway=useRef<T.Group>(null);
  const figure=useRef<T.Group>(null),flare=useRef<T.Mesh>(null);
  const rounds=useRef<T.InstancedMesh>(null);
  const pool=useMemo(()=>Array.from({length:ROUND_SLOTS},()=>({
    born:-Infinity,from:new T.Vector3(),dir:new T.Vector3(),reach:0,long:false,
  })),[]);
  const trail=useMemo(()=>({stamp:new T.Object3D(),inverse:new T.Matrix4(),next:0,lastBeat:-1}),[]);
  // At ridge distance normal ground fog washes the uniform into the mountain.
  const fallingInk=useMemo(()=>ridge?new T.MeshBasicMaterial({vertexColors:true,color:'#8d886f',fog:false}):null,[ridge]);
  useEffect(()=>()=>fallingInk?.dispose(),[fallingInk]);
  const rig=useMemo(()=>createInfantryRig(false),[]),body=useRef<T.SkinnedMesh>(null),gear=useRef<T.Group>(null);
  const s=useMemo(()=>({inverse:new T.Matrix4(),euler:new T.Euler(0,0,0,'YXZ'),turn:new T.Quaternion(),
    point:new T.Vector3(),center:new T.Vector3(),tip:new T.Vector3(),heel:new T.Vector3(),direction:new T.Vector3(),
    yaw:0,pitch:0,time:0,id:''}),[]);
  useLayoutEffect(()=>{
    if(!body.current||!gear.current)return;
    body.current.updateMorphTargets();if(body.current.morphTargetInfluences)body.current.morphTargetInfluences[0]=1;
    const off=bindInfantryRig(body.current,rig);poseEmbarkedRig(rig,1,0,3);applyInfantryWeaponPose(gear.current,rig);return off;
  },[rig]);
  useImperativeHandle(poseRef,()=>(time,visible,canFire=true,fallAge=0)=>{
    const actor=figure.current,lamp=flare.current,held=gear.current;
    const batch=rounds.current;
    if(!actor||!lamp||!held||!batch)return;
    lamp.visible=false;
    if(!visible){s.id='';batch.visible=false;return;}
    actor.updateWorldMatrix(true,false);s.inverse.copy(actor.matrixWorld).invert();
    s.center.copy(rig.spine.position).add(rig.root.position);
    const socket=(out:T.Vector3,bind:T.Vector3)=>out.copy(bind).sub(rig.bindSpine).applyQuaternion(s.turn).add(s.center);
    let best=Infinity,reach=0,id='',yaw=ridge?.34:-.37,pitch=ridge?-.39:-.12;
    for(const contact of contacts?.actors??[]){
      const live=contacts!.poses.current.get(contact.id);
      if(!contact.alive||!live||live.active===false)continue;
      s.point.copy(live.position);
      s.point.y+=contact.visualScale===undefined?infantryAimHeight(contact.stance==='kneeling'):.72*contact.visualScale;
      s.point.applyMatrix4(s.inverse);
      const distance=s.point.distanceToSquared(s.center)*(contact.id===s.id?.70:1);
      if(distance>=best)continue;
      // Work in the actor's real (possibly reflected) local frame. -Z is the
      // front of the face and the prop. Correct for its offset from the spine.
      s.tip.copy(s.center);
      let y=0,p=0;
      for(let i=0;i<3;i++){
        const v=s.direction.copy(s.point).sub(s.tip);
        y=Math.atan2(-v.x,-v.z);p=Math.atan2(v.y,Math.hypot(v.x,v.z));
        s.turn.setFromEuler(s.euler.set(p,y,0,'YXZ'));socket(s.tip,muzzle);
      }
      if(y< -1.43||y>.72||p<-.78||p>.40)continue;
      socket(s.heel,pad).applyMatrix4(actor.matrix);s.tip.applyMatrix4(actor.matrix);
      const dx=s.tip.x-s.heel.x;
      if(dx<.12)continue;
      // Check both faces of the actual opening, allowing for the jambs, low
      // sill, roof and door parked aft. Never flash through the airframe.
      let clear=true;
      for(const edge of [.77,.85]){
        const u=(edge-s.heel.x)/dx;
        const z=T.MathUtils.lerp(s.heel.z,s.tip.z,u),h=T.MathUtils.lerp(s.heel.y,s.tip.y,u);
        if(z<-.443||z>.69||h<-.316||h>.46){clear=false;break;}
      }
      if(!clear)continue;
      reach=s.point.distanceTo(socket(s.tip,muzzle))*actor.matrixWorld.getMaxScaleOnAxis();
      best=distance;id=contact.id;yaw=y;pitch=p;
    }
    const step=Math.min(.1,Math.max(0,time-s.time))*4.8;s.time=time;s.id=id;
    s.yaw+=T.MathUtils.clamp(yaw-s.yaw,-step,step);s.pitch+=T.MathUtils.clamp(pitch-s.pitch,-step,step);
    // The hips/boots remain planted; the actual head, hands and held mesh all
    // follow the same spine turn instead of animating a disconnected effect.
    if(fallAge>0){
      if(fallingInk && body.current)body.current.material=fallingInk;
      const unfold=T.MathUtils.smoothstep(fallAge,0,.62);
      poseEmbarkedRig(rig,1-unfold,time,3);
      rig.legs[1].upper.rotateX(.57*unfold);
      rig.legs[0].lower.rotateX(-.38*unfold);
    }else{
      rig.spine.rotation.set(s.pitch,s.yaw,0,'YXZ');rig.head.rotation.set(0,0,0);
    }
    applyInfantryWeaponPose(held,rig);actor.userData.contactId=id;
    const cycle=Math.floor(time/1.45), within=time-cycle*1.45;
    const beat=Math.floor(within/.14), serial=cycle*4+beat;
    const aligned=Math.abs(s.yaw-yaw)+Math.abs(s.pitch-pitch)<.016;
    const firing=canFire&&(ridge||!!id)&&aligned&&beat<4;
    if(firing&&serial!==trail.lastBeat){
      trail.lastBeat=serial;
      const round=pool[trail.next++%ROUND_SLOTS];
      round.born=time;round.long=beat%2===0;
      held.updateWorldMatrix(true,false);
      round.from.copy(muzzle).applyMatrix4(held.matrixWorld);
      round.dir.set(0,0,-1).transformDirection(held.matrixWorld);
      round.reach=ridge?32:reach;
      ejectBrass(lamp,'door',doorway.current ?? undefined);
    }
    const latest=pool[(trail.next+ROUND_SLOTS-1)%ROUND_SLOTS];
    lamp.visible=firing&&time-latest.born<.085;
    if(lamp.visible){
      if(ridge)lamp.scale.set(.43,.83,.43);
      else lamp.scale.set(.25,.48,.25);
    }

    // Store flights in world coordinates. A departing or banking Huey must
    // never drag rounds it already fired along with its door.
    batch.updateWorldMatrix(true,false);trail.inverse.copy(batch.matrixWorld).invert();
    let count=0;
    for(const round of pool){
      const distance=(time-round.born)*(ridge?46:35);
      if(distance>round.reach)continue;
      // The ridge pass is silhouetted against bright sky; give its copper tail
      // enough projected width to survive the pixel-resolution render.
      const width=ridge?.43:.088;
      const length=Math.min(distance+.12,round.long?(ridge?5.2:1.75):(ridge?1.2:.38));
      const stamp=trail.stamp;
      stamp.position.copy(round.from).addScaledVector(round.dir,distance);
      stamp.quaternion.setFromUnitVectors(up,round.dir);stamp.scale.set(width,length,width);
      stamp.updateMatrix();stamp.matrix.premultiply(trail.inverse);batch.setMatrixAt(count++,stamp.matrix);
    }
    batch.count=count;batch.visible=count>0;
    if(count)batch.instanceMatrix.needsUpdate=true;
  },[contacts,rig,ridge,pool,trail,s,ejectBrass]);
  useEffect(()=>()=>releaseInfantryRig(rig),[rig]);
  return <group ref={doorway} name="transport-door-crew" scale-x={port?-1:1}>
    <instancedMesh name="door-gunner-rounds" ref={rounds} args={[helicopterRoundGeometry,helicopterRoundInk,ROUND_SLOTS]}
      visible={false} frustumCulled={false} dispose={null}/>
    <mesh name="gunner-folding-seat-and-boot-tray" geometry={station} material={steel} dispose={null}/>
    <group ref={figure} name="door-gunner-pivot" position={[.585,-.435,-.335]} rotation-y={seatYaw} scale={INFANTRY_WORLD_SCALE}>
      <skinnedMesh ref={body} name="seated-door-gunner" geometry={travelBody(3)} material={DOOR_CREW_INK} dispose={null} frustumCulled={false}/>
      <group ref={gear}><mesh name="door-crew-field-prop" position={prop.origin} scale-z={prop.scaleZ}
        geometry={M16_GEOMETRY} material={DOOR_CREW_INK} dispose={null}/>
      <mesh name="door-projector-signal" ref={flare} position={prop.muzzle} rotation-x={-Math.PI/2}
        geometry={doorFlash} material={flashInk} dispose={null} visible={false}/>
      </group>
    </group>
  </group>;
}
