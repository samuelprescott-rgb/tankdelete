import {coordinateNoise} from './environmentGeneration';
import {RIVER_CROSSINGS,estuaryMargins,type RiverCrossing,type RiverStation} from './riverLayout';

export const DRY_SOIL=-.07, RIVER_WATER_Y=-.60, RIVER_BANK_COLUMNS=11;
const smooth=(x:number)=>{const t=Math.min(1,Math.max(0,x));return t*t*(3-2*t);};
// Upper cut lives in the actual dry terrain, *outside* the fixed hydraulic
// survey. Width is expressed along X and deliberately reaches several
// metres: a 0.9m X strip on this diagonal is barely 0.4m across the flow.
// This profile is shared by dry mesh, bed mesh and the suspension probes.
export function riverApron(s:RiverStation,side:number){
  const z=s.z,edge=s.centerX+side*s.mudHalfWidth,
    reach=smooth((z-.65)/2.55)*(1-smooth((z-10.8)/3.9)),
    ripple=.5+.5*Math.sin(z*1.06+side*.72),hollow=.5+.5*Math.cos(z*.76-side*1.28);
  let width=side<0?reach*(2.2+2.05*hollow+.75*ripple):reach*(1.7+1.42*hollow+.74*ripple);
  if(side>0){
    // The entry tracks, flooded paddy bund and the ordinary embassy front
    // rank keep their existing ground. The sheltered east wash tapers
    // away before these fixed sites; the opposite slip-bank carries on.
    width*=1-smooth((z-6.05)/1.83);
    if(z<5.6)width=Math.min(width,Math.max(0,-11.65-edge),
      Math.max(0,-15+1.955*(z-2.5)-2.18-edge));
  }
  // A splayed mud terrace on the inside and an undercut far shore, not
  // another raised levee around the new outlet. No dry grading on either
  // timber sill, the original estuary hamlet foundation or the patrol point.
  if(z>23.8&&z<41.2){
    const mouth=estuaryMargins(z),fan=smooth((z-23.8)/3.2)*(1-smooth((z-37.1)/4.1));
    const promontory=smooth((z-28.8)/1.8)*(1-smooth((z-30.6)/1.4));
    width+=fan*(side<0?(.87+.63*hollow+.82*promontory)*Math.min(1,mouth.west*.35):
      (.54+.51*ripple)*Math.min(1,mouth.east*.45));
    if(side<0)width*=1-smooth((z-28.2)/.9)*(1-smooth((z-30.45)/1.05));
  }
  const mass=smooth(width/1.85),drop=mass*(side<0?.338+.036*ripple:.287+.065*hollow),
    inner=.27+.11*hollow,outer=.60+.12*ripple;
  // A bowed upper shoulder, a low reed bench and a shallow wet toe.
  // No part of this upper apron floods; the old hydraulic edge is exact.
  return {edge,width,mass,drop,offsets:[width,width*outer,width*inner,0],
    heights:[DRY_SOIL,DRY_SOIL-drop*(.20+.08*hollow),DRY_SOIL-drop*(.82+.09*ripple),DRY_SOIL-drop],
    wash:[0,.20*mass,.77*mass,.91*mass]};
}
/** Shared baked cross-section. The river occupies a real opening in the dry
 * soil, not a decal. The broad ford is shallow below the same LEVEL waterline. */
export function riverSection(station:RiverStation,seed:number){
  const z=station.z,w=station.waterHalfWidth,m=station.mudHalfWidth,ford=RIVER_CROSSINGS[0],
    shallow=1-smooth((Math.abs(z-ford.z)-ford.width*.5)/2.8),rim=m-w,
    bend=Math.sin(z*.41+seed%43),reach=1-smooth(Math.abs(z-16)/15),
    bottom=RIVER_WATER_Y-.46+.40*shallow-(.046*bend+.24*reach)*(1-shallow),
    shore=(side:number)=>{
      const scour=.48+.31*Math.sin(z*.62+side*.83+seed%17)+.16*Math.sin(z*1.14-side*1.32),
        bluff=.012+(.085+.095*reach)*(1-shallow)*scour,
        // Slumped alluvium along the upstream turnout rather than a raised
        // knife edge above water. Preserve horizontal shores and depth.
        beach=smooth((z+.5)/3.6)*(1-smooth((z-10)/4.2)),
        shoulder=DRY_SOIL+bluff*(1-beach)-.051*beach,apron=riverApron(station,side);
      // The breaks vary independently down each bank. Their feet meet the
      // nominal waterline, which also drives placement, wake and movement.
      return {off:[m,w+rim*(.79+.07*scour),w+rim*(.34+.20*scour),w+rim*(.08+.07*scour),w-.006],
        y:[DRY_SOIL-apron.drop,
          shoulder*(1-apron.mass)+(DRY_SOIL-apron.drop-.032)*apron.mass,
          (-.27+scour*.115+shallow*.040-.044*beach)*(1-apron.mass)+(-.512+.017*scour)*apron.mass,
          (RIVER_WATER_Y+.090+.094*scour-.051*beach)*(1-apron.mass)+(-.556+.012*scour)*apron.mass,
          RIVER_WATER_Y-.005]};
    },left=shore(-1),right=shore(1),offsets=[...left.off.map(x=>-x),0,...right.off.reverse()],
    heights=[...left.y,bottom,...right.y.reverse()];
  return {heights,offsets,shallow};
}
export const bridgeRampLength=(bridge:RiverCrossing)=>Math.min(5.9,bridge.length*.37);
export function bridgeRise(z:number,bridge:RiverCrossing){
  const edge=bridge.length*.5-Math.abs(z-bridge.z),t=Math.min(1,Math.max(0,edge/bridgeRampLength(bridge)));
  // Short eased changes of grade at the sill and crown, constant grade in
  // between. Raising a whole smoothstep on the former short ramp would put
  // a 25-degree hump under the hull and sink the front track into the boards.
  const k=.15,profile=t<k?t*t/(2*k):t>1-k?1-k-(1-t)*(1-t)/(2*k):t-k*.5;
  return 1.20*profile/(1-k);
}
export function bridgeBoard(crossing:RiverCrossing,index:number,count:number,seed:number){
  const spacing=crossing.length/count,z=crossing.z+crossing.length*.5-(index+.5)*spacing,
    far=bridgeRise(z+spacing*.5,crossing),near=bridgeRise(z-spacing*.5,crossing),
    pitch=Math.atan2(near-far,spacing),halfHeight=.050,top=.022+coordinateNoise(index,0,seed,830)*.006+(far+near)*.5;
  return {z,pitch,top,halfHeight,width:spacing*.990/Math.cos(pitch),y:top-halfHeight/Math.cos(pitch)};
}
