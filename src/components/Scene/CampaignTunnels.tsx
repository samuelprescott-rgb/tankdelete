import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {TUNNEL_WARNING} from '../../lib/campaignTunnels';
import type {EnemyCombatState} from '../../hooks/useEnemyCombat';
import type {VillageObstacle} from '../../lib/villageCover';
import type {RiverStation} from './riverLayout';
import {buildTunnelBrush,hatchOpening} from './tunnelBrush';
import {makeTunnelLitter} from './tunnelLitter';

interface Props {
  running:boolean; tankRef:React.RefObject<THREE.Group|null>; obstacles:readonly VillageObstacle[];
  river:RiverStation[]; cue:EnemyCombatState['tunnelCue']; advance:EnemyCombatState['advanceTunnels'];
}
/** A broken-pixel hatch, lifting lid and expanding ring. The clock
 * driving its animation is also the authoritative clock admitting the batch. */
export function CampaignTunnels({running,tankRef,obstacles,river,cue,advance}:Props){
  const wave=useRef<THREE.Mesh>(null),lid=useRef<THREE.Group>(null);
  const brush=useMemo(buildTunnelBrush,[]);
  const litter=useMemo(makeTunnelLitter,[]);
  useEffect(()=>()=>litter.dispose(),[litter]);
  useEffect(()=>()=>{brush.cover.dispose();brush.earth.dispose();},[brush]);
  const viewer=useRef({x:0,z:0,yaw:0});
  const last=useRef<Props['cue']>(null),lidAge=useRef(0);
  useLayoutEffect(()=>{if(cue){last.current=cue;lidAge.current=0;litter.sample(0);}},[cue,litter]);
  useFrame((_,dt)=>{
    const tank=tankRef.current;if(!running||!tank)return;
    const p=viewer.current;p.x=tank.position.x;p.z=tank.position.z;p.yaw=tank.rotation.y;
    const t=advance(dt,p,obstacles,river);
    if(!cue){
      if(lid.current){
        lid.current.rotation.x=hatchOpening(TUNNEL_WARNING,TUNNEL_WARNING);
        litter.sample(TUNNEL_WARNING);
      }
      return;
    }
    if(wave.current)wave.current.scale.setScalar(1+.27*((t*.95)%1));
    // On admission the simulation resets t before React retires the cue.
    // Keep the fully raised mat raised through that one outgoing render.
    lidAge.current=Math.max(t,lidAge.current);
    if(lid.current)lid.current.rotation.x=hatchOpening(lidAge.current,TUNNEL_WARNING);
    litter.sample(lidAge.current);
  });
  const location=cue??last.current;
  if(!location)return null;
  return <group name={cue?'signal-tunnel-warning':'spent-signal-hatch'} position={[location.site.x,.07,location.site.z]}>
    <primitive object={litter.group} />
    <mesh name="tunnel-root-lined-shaft" geometry={brush.earth} receiveShadow>
      <meshLambertMaterial vertexColors side={THREE.DoubleSide}/>
    </mesh>
    <mesh visible={!!cue} ref={wave} position-y={.038} rotation={[-Math.PI/2,0,.32]}>
      <ringGeometry args={[1.57,1.61,18,1,0,3.80]}/><meshBasicMaterial color="#c79045" toneMapped={false}/>
    </mesh>
    <group ref={lid} name="bamboo-hatch-hinge" position={[0,.13,-.89]}>
      <mesh name="leafy-bamboo-camouflage" geometry={brush.cover} receiveShadow>
        <meshLambertMaterial vertexColors side={THREE.DoubleSide}/>
      </mesh>
    </group>
  </group>;
}
