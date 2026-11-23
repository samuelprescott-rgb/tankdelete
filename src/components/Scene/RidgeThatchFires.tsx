import {useMemo} from 'react';
import {CharcoalCloud} from './CharcoalCloud';
import {StandingPixelFires,pixelFlameScale,type StandingFire} from './StandingPixelFires';
import type {FuelPocket} from './burningFuel';

type Point=[number,number,number];
export type RoofCombustionSite={breach:Point;eave:Point;size:number;seed:number};

export function roofFuelPockets({breach,eave,size,seed}:RoofCombustionSite):FuelPocket[]{
  return [{position:[0,0,0],size:.60,phase:seed},
    {position:[(eave[0]-breach[0])/size,(eave[1]-breach[1])/size,(eave[2]-breach[2])/size],size:.31,phase:seed+13}];
}
export function RidgeThatchFires({sites}:{sites:RoofCombustionSite[]}){
  const roofs=useMemo(()=>sites.map(site=>({...site,sources:roofFuelPockets(site).map((p):StandingFire=>({
    position:[...p.position],scale:pixelFlameScale(p.size),frame:p.phase,
  }))})),[sites]);
  return <group name="distant-ridge: thatch smoke and roof fires">
    {roofs.map(({breach,size,seed,sources},i)=><group key={i} position={breach} scale={size}>
      <StandingPixelFires name="fuel-flames" sources={sources} phase={seed*.17}/>
      {/* Thin thatch smoke, not the dense rolling debris cloud of a nearby
          wreck. It begins in the main ember and gives up contrast as it rises. */}
      <CharcoalCloud name="fuel-cloud" position={[0,.19,0]} size={[1.56,4.35,1.56]}
        wind={i<2?[-2.75,-.35]:[-1.95,.75]} phase={seed*.17} airInk={i<2?'#697675':'#788581'}
        preburnSeconds={i<2?6.2+seed*.28:0}/>
    </group>)}
  </group>;
}
