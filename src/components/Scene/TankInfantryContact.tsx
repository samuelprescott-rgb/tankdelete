import {useRef,type RefObject} from 'react';
import {useFrame} from '@react-three/fiber';
import type {Group} from 'three';
import {tankFootprintBlocked} from '../../lib/tankFootprint';
import type {EnemyCombatant,EnemyCombatPose} from '../../lib/combat';
import {fieldBlood} from './FieldBlood';

export function TankInfantryContact({tankRef,enemies,poses,running,crush}:{
  tankRef:RefObject<Group|null>;enemies:RefObject<EnemyCombatant[]>;poses:RefObject<Map<string,EnemyCombatPose>>;
  running:boolean;crush:(id:string)=>boolean;
}){
  const previous=useRef<{x:number;z:number;yaw:number}|null>(null);
  useFrame(()=>{
    const tank=tankRef.current;
    if(!tank||!running){previous.current=null;return;}
    const {x,y,z}=tank.position,yaw=tank.rotation.y,old=previous.current;
    if(!old){previous.current={x,z,yaw};return;}
    const dx=x-old.x,dz=z-old.z,d=Math.hypot(dx,dz),turn=Math.atan2(Math.sin(yaw-old.yaw),Math.cos(yaw-old.yaw));
    if(d>.0001&&d<5){
      const steps=Math.max(1,Math.ceil(d/.3));
      for(const enemy of enemies.current){
        const p=poses.current.get(enemy.id)?.position;
        if(!enemy.alive||!p||Math.abs(p.y-y)>.9||Math.hypot(x-p.x,z-p.z)>d+1.8)continue;
        for(let j=1;j<=steps;j++){
          const t=j/steps;
          if(!tankFootprintBlocked(old.x+dx*t,old.z+dz*t,old.yaw+t*turn,(cx,cz,r)=>(p.x-cx)**2+(p.z-cz)**2<=r*r))continue;
          if(crush(enemy.id))fieldBlood(tank,p,yaw,true);
          break;
        }
      }
    }
    old.x=x;old.z=z;old.yaw=yaw;
  });
  return null;
}
