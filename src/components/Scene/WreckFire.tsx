import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {BATTLE_FIRE_SEATS} from './battleSmokeVolume';
import {CharcoalCloud} from './CharcoalCloud';
import {createRiverStations,sampleRiverStation} from './riverLayout';
import {StandingFireVolumes,StandingPixelFires,type StandingFire} from './StandingPixelFires';
import {createCampaignBurnScars,createCampaignCinderMaterial} from './campaignBurnScars';

import { PixelFireVolume } from './PixelFireVolume';
export function WreckFire() {
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    if (lightRef.current) lightRef.current.intensity = 6.5 + Math.sin(t * 6.7) * .63 + Math.sin(t * 9.2) * .31;
  });
  return <>
    <CharcoalCloud name="source-fed-bent-ash" position={[0,1.60,0]}
      size={[5.2,11,4.9]} wind={[5.1,1.3]} phase={.31}/>
    <PixelFireVolume name="huey-engine-fire" position={[0,.63,.21]} scale={[2.65,3.05,1.95]} renderOrder={4}/>
    <pointLight ref={lightRef} position={[.1,1.9,.2]} color="#ff882d" intensity={6.5} distance={8.5} decay={2}/>
  </>;
}

export function DistantBattleSmoke({seed=1968,daylight=true}:{seed?:number;daylight?:boolean}) {
  const time = useMemo(() => ({ value: 0 }), []);
  const sites=useMemo(()=>{
    const z=29,bank=sampleRiverStation(createRiverStations(seed),z)!;
    // Sits within the permanently unbuildable shoreline reserve, well past
    // the bridge. No random file plot is displaced by this burned jetty.
    return [[-66,.52,22],[bank.centerX-bank.mudHalfWidth-.38,.5,z],[66,.52,-30],
      ...BATTLE_FIRE_SEATS[daylight?'day':'night']];
  },[seed,daylight]);
  const scars = useMemo(() => createCampaignBurnScars(sites, seed), [sites, seed]);
  const cinders=useMemo(()=>createCampaignCinderMaterial(time),[time]);
  useEffect(()=>()=>{scars.cinders.dispose();scars.timber.dispose();},[scars]);
  useEffect(()=>()=>cinders.dispose(),[cinders]);
  const sources=useMemo(()=>{
    // The first three sources are the existing shoreside burns. In daylight
    // the last two lie directly below the silhouettes of the karst peaks
    // on the bridge drive. Let their smoke trail over the canopy, not up
    // across the summits. The night jetty has its own cooler, slower plume.
    const shapes=daylight?[
      [5,14,6,2],[4.8,9.5,5.2,1.9],[5,15,7,2],[6.1,14.8,10.2,-3.4],[4.4,11.8,7.4,2.7]
    ]:[
      [5,14,6,2],[4.8,10.3,4.6,1.4],[5,15,7,2],[9.8,20.3,-9.6,-4.7],[8,16.7,-7.5,-4.8]
    ];
    return scars.sites.flatMap(({fire,yaw},i)=>fire.map((p,j):StandingFire=>{
      const [width,height,dx,dz]=shapes[i];
      return {...p,yaw,smoke:j===0&&(daylight||i!==1)?{
        name:i===1?'wind-bent-bank-fire':`perimeter-cloud-${i}`,offset:.42,
        scale:[width/3.4,height/6.5,width/3.4],wind:[dx,dz],phase:i*.387,
      }:undefined};
    }));
  },[scars,daylight]);
  // A low layer of soot connects the flame bed to the first rolling fold of each far fire.
  const farSmokeRoots=useMemo<StandingFire[]>(()=>scars.sites.slice(3).map(({fire,yaw})=>{
    const {position:[x,y,z],scale:[w,h,d]}=fire[0];
    return {position:[x,y+.22,z],scale:[w*1.55,h*2.05,d*1.55],yaw};
  }),[scars]);
  const [bankX,bankY,bankZ]=scars.sites[1].fire[0].position;
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });
  return <><mesh name="shell-burned-perimeter-timbers" geometry={scars.timber} receiveShadow={daylight}>
      {daylight?<meshLambertMaterial vertexColors/>:<meshBasicMaterial vertexColors/>}</mesh>
    <mesh name="campaign-cinders" geometry={scars.cinders} material={cinders} renderOrder={4}/>
    <PixelFireVolume name="jetty-fire-smoke-root" form="smoke" daylightHaze={daylight} position={[bankX,bankY+.32,bankZ]}
      scale={[3.65,5.45,2.95]} renderOrder={2.5}/>
    {daylight&&<StandingFireVolumes name="perimeter-fuel-smoke-roots" form="smoke" sources={farSmokeRoots} daylightHaze/>}
    {!daylight&&<CharcoalCloud name="wind-bent-bank-fire" position={[bankX,bankY+.42,bankZ]}
      size={[4.8,9.3,4.8]} wind={[9.2,-.7]} phase={.387} airInk="#394b59" riverbank/>}
    <StandingPixelFires daylightHaze={daylight} sources={sources} name="campaign-jetty-fuel-cels"/></>;
}
