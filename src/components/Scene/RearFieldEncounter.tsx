import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {REAR_GUARD,REAR_HUT,REAR_GUARD_MAX_HP,REAR_GUARD_PULSE_SECONDS,
  newRearGuardCycle,newRearGuardPose,rearGuardHasSight,rearPulseHasCover,stepRearGuard,
  advanceRearPatrol,approachRearYaw,type RearGuardPose} from '../../lib/rearStronghold';
import type {VillageObstacle} from '../../lib/villageCover';
import {advanceRearPursuit,createRearGuardMap,crossedRearBridge,newRearPursuit,inRearEntranceLane,nearRearEntrance} from '../../lib/rearGuardPursuit';
import type {RiverStation} from './riverLayout';
import {RearFieldStronghold} from './RearFieldStronghold';

interface Props {
  hp:number;ready:boolean;running:boolean;tankRef:React.RefObject<THREE.Group|null>;
  obstacles:readonly VillageObstacle[];
  navigationRiver:RiverStation[];landing?:{cx:number;z:number;yaw:number};
  rearGuardPoseRef?:React.RefObject<RearGuardPose>;hutDestroyed?:boolean;
  onSpotted:()=>void;onTankHit:()=>void;
}
export function RearFieldEncounter({hp,ready,running,tankRef,obstacles,onSpotted,onTankHit,
  navigationRiver,landing,rearGuardPoseRef,hutDestroyed=false}:Props) {
  const scene=useRef<THREE.Group>(null),mark=useRef<THREE.Mesh>(null),pulse=useRef<THREE.Group>(null);
  const ownPose=useRef(newRearGuardPose()),pose=rearGuardPoseRef??ownPose;
  const field=useMemo(()=>createRearGuardMap(navigationRiver,obstacles,hutDestroyed,landing),
    [navigationRiver,obstacles,hutDestroyed,landing]);
  const s=useRef({cycle:newRearGuardCycle(),chase:newRearPursuit(),seen:false,entrance:0,prevX:NaN,prevZ:NaN,cover:false,scan:0,
    chassis:null as THREE.Object3D|null,turret:null as THREE.Object3D|null,muzzle:null as THREE.Object3D|null,
    slide:null as THREE.Object3D|null,launch:new THREE.Vector3(),socket:new THREE.Vector3(),end:new THREE.Vector3()}).current;
  useFrame((_,dt)=>{
    const tank=tankRef.current;if(!tank)return;
    const {position:player}=tank,p=pose.current,c=s.cycle;
    if(!running||!Number.isFinite(dt)||dt<=0||dt>.33)return;
    if(!s.chassis && scene.current){
      s.chassis=scene.current.getObjectByName('rear-field-armored-guard')??null;
      s.turret=s.chassis?.getObjectByName('rear-guard-turret')??null;
      s.muzzle=s.turret?.getObjectByName('rear-field-muzzle-flash')??null;
      s.slide=s.turret?.getObjectByName('rear-guard-barrel-slide')??null;
    }
    const visible=hp>0&&rearGuardHasSight(player.x,player.z,obstacles,p,hutDestroyed,field.landingContact);
    const crossed=!s.seen&&crossedRearBridge(field.bridge,s.prevX,s.prevZ,player.x,player.z);
    if(hp>0&&!s.seen&&(visible||hp<REAR_GUARD_MAX_HP||crossed)){
      if(crossed)s.entrance=10;
      s.seen=true;onSpotted();
    }
    s.prevX=player.x;s.prevZ=player.z;
    if(s.entrance>0){
      s.entrance=nearRearEntrance(player,field)&&!(visible&&inRearEntranceLane(p,player))
        &&Math.hypot(p.x-player.x,p.z-player.z)>7?Math.max(0,s.entrance-dt):0;
    }
    const event=stepRearGuard(c,dt,hp>0,player.x,player.z,visible&&s.entrance===0,p);
    if(hp>0){
      s.scan+=dt;
      const tracking=c.phase==='warning'||c.phase==='pulse';
      if(!tracking){
        if(s.seen)advanceRearPursuit(p,s.chase,dt,player,tank.rotation.y,visible,field,s.entrance>0);
        else advanceRearPatrol(p,dt,false,player.x,player.z,tank.rotation.y,obstacles);
      }
      const tx=tracking?c.aimX:player.x,tz=tracking?c.aimZ:player.z;
      const angle=s.seen||tracking
        ?Math.atan2(p.x-.14*Math.sin(p.yaw)-tx,p.z-.14*Math.cos(p.yaw)-tz)
        :p.yaw+.34*Math.sin(s.scan*1.12);
      p.turretYaw=approachRearYaw(p.turretYaw,angle,dt*3.25);
    }
    if(s.chassis){s.chassis.position.set(p.x,0,p.z);s.chassis.rotation.y=p.yaw;}
    if(s.turret)s.turret.rotation.y=p.turretYaw-p.yaw;
    // Flash and recoil are socket-local. Neither animation changes attack
    // cadence or causes a React update while the field is running.
    const flash=c.phase==='pulse'&&c.time<.13;
    if(s.muzzle){s.muzzle.visible=flash;s.muzzle.scale.setScalar(flash?1.4-c.time*4:1);}
    if(s.slide)s.slide.position.z=flash?.16*(1-c.time/.13):0;
    if(mark.current){
      mark.current.visible=c.phase==='warning'||c.phase==='pulse';
      mark.current.position.set(c.aimX,.09,c.aimZ);
      mark.current.scale.setScalar(c.phase==='warning'?1+.14*Math.sin(c.time*13):1);
    }
    if(event==='fire'){
      s.socket.set(p.x,1.44,p.z);
      if(s.muzzle)s.muzzle.getWorldPosition(s.launch);else s.launch.copy(s.socket);
      s.cover=rearPulseHasCover(s.socket,s.launch,obstacles,hutDestroyed,field.landingContact);
      s.end.set(c.aimX,.70,c.aimZ);
    }
    const flying=c.phase==='pulse'||event==='hit'||event==='miss';
    if(flying&&!s.cover){
      const t=c.phase==='pulse'?Math.min(1,c.time/REAR_GUARD_PULSE_SECONDS):1;
      s.socket.copy(s.launch).lerp(s.end,t);
      s.cover=rearPulseHasCover(s.launch,s.socket,obstacles,hutDestroyed,field.landingContact);
    }
    if(pulse.current){
      pulse.current.visible=c.phase==='pulse'&&!s.cover;
      if(pulse.current.visible){pulse.current.position.copy(s.socket);pulse.current.lookAt(s.end);}
    }
    if(event==='hit'&&!s.cover)onTankHit();
  });
  return <group ref={scene} name="rear-field-encounter">
    <RearFieldStronghold hutPosition={REAR_HUT} guardPosition={REAR_GUARD} guardHealth={hp}
      guardMaxHealth={REAR_GUARD_MAX_HP} turretYaw={0} firing={false} ready={ready} opened={false} hutDestroyed={hutDestroyed}/>
    <mesh name="rear-guard-warning-mark" ref={mark} visible={false} rotation-x={-Math.PI/2} renderOrder={2}>
      <ringGeometry args={[1.48,1.73,24]}/><meshBasicMaterial color="#f29b4e" transparent opacity={.9} depthWrite={false}/>
    </mesh>
    <group name="rear-guard-signal-pulse" ref={pulse} visible={false}>
      <mesh><octahedronGeometry args={[.27,0]}/><meshBasicMaterial color="#fff2a4" toneMapped={false}/></mesh>
      <mesh position-z={-.46}><boxGeometry args={[.12,.12,.80]}/><meshBasicMaterial color="#ff8342" toneMapped={false}/></mesh>
    </group>
  </group>;
}
