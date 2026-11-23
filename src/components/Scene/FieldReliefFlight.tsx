import {useRef,useState,type RefObject} from 'react';
import {useFrame} from '@react-three/fiber';
import type {Group} from 'three';
import {DAY_FIRST_STEP,DAY_OUT,DAY_PAD,DAY_STEP_INTERVAL,transportPose} from '../../lib/campaignFlights';
import {chooseReliefLanding,type ReliefLanding,type ReliefTicket} from '../../lib/fieldRelief';
import type {FriendlyCombatant,FriendlyCombatPose,CombatObstacle} from '../../lib/combat';
import type {RiverStation} from './riverLayout';
import {HueyMeshes,useOwnedHuey} from './HueyAirframe';
import {TransportManifest} from './TransportManifest';
import {TransportDoorGunner,type DoorContacts,type DoorPose} from './TransportDoorGunner';

export function FieldReliefFlight({running,tank,friendlies,poses,contacts,deploy,river,ground,obstacles}:{
  running:boolean;tank:RefObject<Group|null>;friendlies:RefObject<FriendlyCombatant[]>;contacts:DoorContacts;poses:RefObject<Map<string,FriendlyCombatPose>>;
  deploy:(t:ReliefTicket)=>boolean;river:RiverStation[];ground:(x:number,z:number)=>number;obstacles:readonly CombatObstacle[];
}){
  const [site,setSite]=useState<ReliefLanding|null>(null);
  const previous=useRef<ReliefLanding|null>(null);
  const clock=useRef({wait:DAY_OUT,t:0,next:0,batch:0}),craft=useRef<Group>(null),main=useRef<Group>(null),tail=useRef<Group>(null),gun=useRef<DoorPose>(null);
  const huey=useOwnedHuey(false,false);
  useFrame((_,dt)=>{
    if(!running||!tank.current)return;
    const c=clock.current,step=Math.min(dt,.1);
    if(!site){
      c.wait=Math.max(0,c.wait-step);
      if(c.wait||friendlies.current.filter(a=>a.alive).length>=2)return;
      const occupied=friendlies.current.filter(a=>a.alive).map(a=>poses.current.get(a.id)?.position??{x:a.position[0],z:a.position[2]});
      const chosen=chooseReliefLanding(c.batch+1,previous.current,tank.current.position,obstacles,river,ground,Math.random,occupied);
      if(!chosen){c.wait=2;return;}
      previous.current=chosen;c.t=0;c.next=0;c.batch++;setSite(chosen);
      return;
    }
    if(!craft.current)return;
    c.t+=step;
    const a=transportPose(c.t);
    craft.current.visible=a.visible;craft.current.userData.flightTime=c.t;
    craft.current.position.set(site.x-(a.x-DAY_PAD[0]),site.height+a.y,site.z-(a.z-DAY_PAD[2]));
    craft.current.rotation.set(a.pitch,a.yaw+Math.PI,a.roll,'YXZ');
    if(main.current)main.current.rotation.y=c.t*28;
    if(tail.current)tail.current.rotation.x=c.t*47;
    gun.current?.(c.t,a.visible);
    while(c.next<site.tickets.length&&c.t>=DAY_FIRST_STEP+c.next*DAY_STEP_INTERVAL)deploy(site.tickets[c.next++]);
    if(c.t>=DAY_OUT){setSite(null);c.wait=1;}
  });
  return site?<group ref={craft} name="us-relief-helicopter" visible={false}>
    <HueyMeshes assets={huey.assets} mainRotorRef={main} tailRotorRef={tail}/>
    <TransportManifest flight={craft} roster={friendlies.current} tickets={site.tickets}/>
    <TransportDoorGunner port contacts={contacts} poseRef={gun}/>
  </group>:null;
}
