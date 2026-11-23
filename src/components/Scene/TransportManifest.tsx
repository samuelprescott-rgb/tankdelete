import {useEffect,useLayoutEffect,useMemo,useRef,type RefObject} from 'react';
import {useFrame} from '@react-three/fiber';
import * as T from 'three';
import {INFANTRY_WORLD_SCALE,infantryRifleBind} from '../../lib/infantryMetrics';
import {DAY_CREW,DAY_FIRST_STEP,DAY_STEP_INTERVAL} from '../../lib/campaignFlights';
import {LIFT_TEAM,LIFT_START_DROP,LIFT_DROP_INTERVAL,LIFT_SILL} from '../../lib/embassyLift';
import {passengerBody,DOOR_CREW_INK,M16_GEOMETRY} from './USInfantrySquad';
import {createInfantryRig,bindInfantryRig,releaseInfantryRig,applyInfantryWeaponPose,type InfantryRig} from './infantryGeometry';

const unit=(v:number)=>Math.max(0,Math.min(1,v)),ease=(v:number)=>{const k=unit(v);return k*k*(3-2*k);};
type Ticket={id:string;body:number};
const q0=new T.Quaternion(),q1=new T.Quaternion(),q2=new T.Quaternion(),v=new T.Vector3();
let tiedWhip:T.BufferGeometry|undefined;
export function travelBody(body:number){
  const source=passengerBody(body);
  if(body!==3)return source;
  if(tiedWhip)return tiedWhip;
  // Lash the long flexible radio aerial sideways under the roof. Only its
  // ten tip-ring vertices move; the issued radio, base and body are intact.
  const g=source.clone(),p=g.attributes.position,delta=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++)if(p.getY(i)>1.91&&p.getZ(i)>.24){
    delta.set([.558,-.34,.012],i*3);
  }
  g.userData={...source.userData,cabinSource:source.uuid};g.morphTargetsRelative=true;
  g.morphAttributes.position=[new T.Float32BufferAttribute(delta,3)];return tiedWhip=g;
}
/** Full-size thighs lift forward from their real hip joints; knees and ankles
 * stay articulated, with boot soles on the cabin floor, not through the hull.
 * The skin, paint, backpack, hands and prop are exactly the ground actor's. */
export function poseEmbarkedRig(rig:InfantryRig,fold:number,t:number,slot:number){
  const k=fold,hipDrop=(rig.kneeling?0:-.43)*k;
  rig.root.position.y=hipDrop;
  rig.spine.position.copy(rig.bindSpine);rig.spine.position.y-=.0366*(1-k);
  rig.spine.rotation.set(.116*(1-k)-.19*k, .045*k*Math.sin(.89*t+slot),.0335*(1-k));
  rig.head.position.set(.037,1.413-(rig.kneeling?.44:0),-.015).sub(rig.bindSpine);
  rig.head.rotation.set(-.15+.17*k,(.09*Math.sin(.84*t+slot*1.9)+.045)*k,0);
  for(const [i,leg] of rig.legs.entries()){
    // Both soles finish at their original authored height. Resolve the
    // thigh pitch from the shin length instead of scaling either limb.
    const sy=-.989,dy=T.MathUtils.clamp((leg.ankle.y-leg.lowerLength*sy-(leg.hip.y+(rig.kneeling?0:-.43)))/leg.upperLength,-.38,.38);
    v.set(i?.10:-.10,dy,-Math.sqrt(Math.max(.01,1-dy*dy-.01)));
    q1.setFromUnitVectors(leg.upperDirection,v).slerp(q0,1-k);
    v.set(i?.045:-.045,sy,-Math.sqrt(1-sy*sy-.045*.045));
    q2.setFromUnitVectors(leg.lowerDirection,v).slerp(q0,1-k);
    leg.upper.quaternion.copy(q1);
    leg.lower.quaternion.copy(q1).invert().multiply(q2);
    leg.foot.quaternion.copy(q2).invert();
  }
  rig.root.updateMatrixWorld(true);
}

export function manifestSeatPose(port:boolean,slot:number,t:number){
  const sign=port?-1:1,near=slot%2===0,back=slot<2;
  const deadline=(port?LIFT_START_DROP:DAY_FIRST_STEP)+slot*(port?LIFT_DROP_INTERVAL:DAY_STEP_INTERVAL);
  const progress=unit((t-deadline+.86)/.86),turn=ease(progress/.68),advance=ease((progress-.12)/.88);
  const stand=ease((progress-.50)/.50),homeX=(near?(back?.35:.225):-.32)*sign,homeZ=back?.57:-.245;
  const homeAngle=back?-sign*.19:-sign*(Math.PI-.19),doorAngle=-sign*Math.PI*.5;
  return {x:T.MathUtils.lerp(homeX,-sign*LIFT_SILL[0],advance),y:T.MathUtils.lerp(-.402,LIFT_SILL[1],advance),
    z:T.MathUtils.lerp(homeZ,LIFT_SILL[2],advance)+.09*Math.sin(Math.PI*advance),
    yaw:T.MathUtils.lerp(homeAngle,doorAngle,turn),fold:1-stand,deadline};
}

function Passenger({ticket,slot,port,flight}:{ticket:Ticket;slot:number;port:boolean;flight:RefObject<T.Group|null>}){
  const rig=useMemo(()=>createInfantryRig(ticket.body!==3),[ticket.body]);
  const root=useRef<T.Group>(null),body=useRef<T.SkinnedMesh>(null),prop=useRef<T.Group>(null);
  const rifle=infantryRifleBind('service',ticket.body!==3),seat=manifestSeatPose(port,slot,0);
  useLayoutEffect(()=>{
    if(!body.current)return;
    body.current.updateMorphTargets();
    const unbind=bindInfantryRig(body.current,rig);poseEmbarkedRig(rig,1,0,slot);
    if(body.current.morphTargetInfluences)body.current.morphTargetInfluences[0]=1;
    if(prop.current)applyInfantryWeaponPose(prop.current,rig);return unbind;
  },[rig,slot]);
  useEffect(()=>()=>releaseInfantryRig(rig),[rig]);
  useFrame(()=>{
    const craft=flight.current,o=root.current;if(!craft?.visible||!o||!prop.current)return;
    const t=craft.userData.flightTime??0,p=manifestSeatPose(port,slot,t);
    o.position.set(p.x,p.y,p.z);o.rotation.y=p.yaw;
    if(body.current?.morphTargetInfluences)body.current.morphTargetInfluences[0]=p.fold;
    poseEmbarkedRig(rig,p.fold,t,slot);applyInfantryWeaponPose(prop.current,rig);
  });
  return <group name={'aboard-'+ticket.id} ref={root} position={[seat.x,seat.y,seat.z]} rotation-y={seat.yaw}
    scale={INFANTRY_WORLD_SCALE} userData={{ticketId:ticket.id,body:ticket.body}} dispose={null}>
    <skinnedMesh name="embarked-field-volume" ref={body} geometry={travelBody(ticket.body)} material={DOOR_CREW_INK}
      frustumCulled={false} receiveShadow/>
    <group ref={prop}><mesh geometry={M16_GEOMETRY} material={DOOR_CREW_INK} position={rifle.origin} scale-z={rifle.scaleZ}/></group>
  </group>;
}

/** Ownership switches with the ground squad's exact roster commit, not
 * via a second clock. A dead ticket is still consumed and never reappears. */
export function TransportManifest({flight,roster,port=false,tickets}:{tickets?:readonly Ticket[];flight:RefObject<T.Group|null>;roster:readonly {id:string}[];port?:boolean}){
  const seats=tickets??(port?LIFT_TEAM:DAY_CREW);
  return <group name="embarked-manifest">{seats.map((ticket,slot)=>roster.some(r=>r.id===ticket.id)?null:
    <Passenger key={ticket.id} {...{ticket,slot,port,flight}}/>)}</group>;
}
