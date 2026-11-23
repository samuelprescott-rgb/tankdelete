import { useMemo } from 'react';
import * as T from 'three';
import { ARCHIVED_RIDGE_HUTS, createArchivedRidgeHut } from './archivedRidgeHuts';
import { CharcoalCloud } from './CharcoalCloud';
import { roofFuelPockets } from './RidgeThatchFires';
import { StandingPixelFires, pixelFlameScale, type StandingFire } from './StandingPixelFires';

// Surveyed on the original R3 painting, slightly below three separate crests.
// Coordinates specify the ground contact, not the roof. Air is sampled from
// the same part of the painting and affects only the hut, never the backdrop.
export const RIVER_ROOF_SITES = [
  {name:'left',   bearing:1.068189, altitude:.178330, air:0xb7916c, size:.89},
  {name:'middle', bearing:1.387759, altitude:.234603, air:0x787262, size:.93},
  {name:'right',  bearing:1.780522, altitude:.201833, air:0x58635d, size:1.02},
] as const;
const radius=198;

function houseArt(i:number){
  const h=ARCHIVED_RIDGE_HUTS[i],site=RIVER_ROOF_SITES[i],g=createArchivedRidgeHut(i);
  const p=g.getAttribute('position'),rgb=g.getAttribute('color'),air=new T.Color(site.air),c=new T.Color();
  for(let v=0;v<p.count;v++){
    const y=p.getY(v);
    // Bury the ends of the piles in the painted slope. No cap, pedestal,
    // shadow card or extra ground polygon is visible behind the house.
    if(y<-.12)p.setY(v,-.12);
    const soil=1-T.MathUtils.smoothstep(y,-.12,.13);
    c.fromBufferAttribute(rgb,v).lerp(air,.44+.50*soil);
    rgb.setXYZ(v,c.r,c.g,c.b);
  }
  g.computeBoundingSphere();
  const flat=radius*Math.cos(site.altitude);
  const position:[number,number,number]=[flat*Math.cos(site.bearing),
    radius*Math.sin(site.altitude)+.12*site.size,flat*Math.sin(site.bearing)];
  const fire=h.fire;
  const sources:StandingFire[]=roofFuelPockets(fire).map(s=>({
    position:[...s.position],scale:pixelFlameScale(s.size*.92),frame:s.phase,
  }));
  return {g,position,site,fire,sources,smokeColor:'#'+air.clone().lerp(new T.Color(0x646965),.53).getHexString()};
}

// This is a distant scenery layer, not a structure in the playable area.
// Being in the dome's coordinate frame prevents parallax from lifting the
// huts off the painted slopes. Actual nearer branches still occlude them.
export function RiverRidgeHuts(){
  const houses=useMemo(()=>RIVER_ROOF_SITES.map((_,i)=>houseArt(i)),[]);
  return <group name="R3 ridge hamlets">
    {houses.map(({g,site,position,fire,sources,smokeColor})=>
      <group key={site.name} name={'R3 ridge hut '+site.name} position={position} scale={site.size}>
        <mesh name={'R3 thatch '+site.name} geometry={g} raycast={()=>{}}>
          <meshBasicMaterial vertexColors side={T.DoubleSide} fog={false}/>
        </mesh>
        <group position={fire.breach} scale={fire.size}>
          <StandingPixelFires name={'R3 roof embers '+site.name} sources={sources} emission={.57} phase={fire.seed*.17}/>
          <CharcoalCloud name={'R3 roof smoke '+site.name} position={[0,.16,0]} size={[1.24,3.15,1.24]}
            wind={[-1.68,.32]} phase={fire.seed*.17} airInk={smokeColor} preburnSeconds={6.2+fire.seed*.28}/>
        </group>
      </group>)}
  </group>;
}
