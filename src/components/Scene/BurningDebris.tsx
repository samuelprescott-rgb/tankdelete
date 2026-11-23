import {useMemo} from 'react';
import type {FuelPocket} from './burningFuel';
import {StandingPixelFires,pixelFlameScale,type StandingFire} from './StandingPixelFires';

type Point=readonly [number,number,number];
type Props={position:Point;size?:number;phase?:number;wind?:readonly [number,number];pockets?:readonly FuelPocket[]};
const singlePocket:readonly FuelPocket[]=[{position:[0,0,0],size:1,phase:0}];
const defaultWind=[1.3,.4] as const;

/** Place at the fuel bed. Extra pockets and wind are measured locally before scaling. */
export function BurningDebris({position,size=1,phase=0,wind=defaultWind,pockets=singlePocket}:Props){
  const [dx,dz]=wind;
  const sources=useMemo(()=>pockets.map((p,i):StandingFire=>({
    position:[...p.position], scale:pixelFlameScale(p.size), frame:p.phase,
    smoke:i===0?{name:'fuel-cloud',offset:.36,scale:[.82,.80,.82],wind:[dx,dz],phase}:undefined,
  })),[pockets,dx,dz,phase]);
  return <group position={position} scale={size}>
    <StandingPixelFires name="fuel-flames" sources={sources} phase={phase}/>
  </group>;
}
