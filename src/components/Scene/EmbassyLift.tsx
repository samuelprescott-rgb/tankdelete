import {useRotorWash} from './rotorWash';
import {useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {HueyAirframe} from './HueyAirframe';
import {TransportDoorGunner,type DoorContacts,type DoorPose} from './TransportDoorGunner';
import {TransportManifest} from './TransportManifest';
import {LIFT_WAVE,LIFT_START_DROP,LIFT_DROP_INTERVAL,LIFT_DEPART,LIFT_END,LIFT_TEAM,LIFT_PAD,LIFT_SILL,LIFT_STEP,
  LIFT_TOUCHDOWN,embassyTransportPose,type LiftCall} from '../../lib/embassyLift';

/** One continuous flight. The existing animated squad takes ownership of each actor
 * at the actual door sill. No DOM timers or cosmetic copies of the four passengers. */
export function EmbassyLift({wave,running,deploy,onCall,roster=[],contacts}:{
  wave:number; running:boolean; deploy:(slot:number)=>boolean; onCall:(call:LiftCall)=>void;roster?:readonly {id:string}[];contacts?:DoorContacts;
}){
  const aircraft=useRef<THREE.Group>(null),main=useRef<THREE.Group>(null),tail=useRef<THREE.Group>(null);
  const wash=useRotorWash('road');
  const lamp=useRef<THREE.Mesh>(null);
  const crewPose=useRef<DoorPose>(null);
  const pool=useRef<THREE.Mesh>(null);
  const flight=useRef({started:false,time:0,next:0,call:null as LiftCall,done:false});
  useFrame((_,delta)=>{
    const f=flight.current,g=aircraft.current;
    if(!g||!running||f.done)return;
    if(!f.started){if(wave!==LIFT_WAVE)return;f.started=true;}
    const t=f.time+=Math.min(delta,.08);
    g.userData.flightTime=t;
    const pose=embassyTransportPose(t);
    g.visible=pose.visible;g.position.set(pose.x,pose.y,pose.z);g.rotation.set(pose.pitch,pose.yaw,pose.roll,'YXZ');
    crewPose.current?.(t,pose.visible);
    if(main.current)main.current.rotation.y=t*27;
    if(tail.current)tail.current.rotation.x=t*44;
    if(lamp.current)lamp.current.visible=Math.sin(t*5.4)>.16;
    wash.update(pose.x,pose.z,pose.y-LIFT_PAD[1],pose.visible,t);
    if(pool.current)pool.current.visible=g.visible&&pose.y<2.9;
    const call:LiftCall=t>=LIFT_END?null:t>=LIFT_DEPART?'away':t>=LIFT_TOUCHDOWN?'unload':'approach';
    if(call!==f.call){f.call=call;onCall(call);}
    while(f.next<LIFT_TEAM.length && t>=LIFT_START_DROP+f.next*LIFT_DROP_INTERVAL)deploy(f.next++);
    f.done=!g.visible;
  });
  return <group name="embassy-relief-flight">
    <group ref={aircraft} name="rook-relief-transport" visible={false}>
      <HueyAirframe mainRotorRef={main} tailRotorRef={tail} distant/>
      <TransportManifest flight={aircraft} roster={roster} port/>
      <TransportDoorGunner poseRef={crewPose} contacts={contacts}/>
      <group name="rook-near-sill" position={LIFT_SILL}/>
      <mesh ref={lamp} position={[0,1.23,5.18]}><sphereGeometry args={[.068,6,4]}/><meshBasicMaterial color="#fc8367"/></mesh>
    </group>
    <primitive object={wash.mesh}/>
    <mesh ref={pool} name="rook-door-work-lamp-pool" visible={false} position={[LIFT_STEP[0],.038,LIFT_STEP[2]]}
      rotation-x={-Math.PI/2} scale={[1.7,2.35,1]} renderOrder={1}>
      <planeGeometry args={[2,2]}/><shaderMaterial transparent depthWrite={false} toneMapped={false}
        vertexShader={'varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}'}
        fragmentShader={`varying vec2 p;void main(){float r=length(p+vec2(.025*sin(p.y*11.),0.));
          float sand=.83+.15*sin(floor(p.y*34.)*.6+floor(p.x*32.)*1.7);
          gl_FragColor=vec4(.58,.42,.22,(1.-smoothstep(.16,1.,r))*.36*sand);
          #include <colorspace_fragment>
        }`}/>
    </mesh>
  </group>;
}
