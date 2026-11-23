import {createTankGroundProfile} from './tankGroundProfile';
import type {RiverStation} from '../components/Scene/riverLayout';

/** Existing third service rifleman works a short stretch of the dry upper
 * bank. Pinning only the home, not the live pose, leaves patrol, aim, hits
 * and unit health with the squad's normal execution path. */
export const RIVER_FLANK_ID='us-rifle-3';
export const riverFlankEnabled=(mode:string,preview?:string)=>mode==='directory'||(mode==='training'&&preview==='river');
export function createRiverFlankPost(stations:RiverStation[],seed:number){
  const floor=createTankGroundProfile(stations,seed),x=-16.46,z=7.36;
  const height=(x:number,z:number)=>floor.height(x,z)-.010;
  return {
    position:[x,height(x,z),z] as [number,number,number],height,
    // Patrol along the cut, on the hull's right, never down into the water
    // or back into the tank's starting footprint. Normal obstacle tests
    // still run on each candidate/leg during gameplay.
    allows:(a:number,b:number)=>{
      const dx=a-x,dz=b-z;
      return Math.abs(dx)<.83 && dz>-.11 && dz<.27;
    },
  };
}
export type RiverFlankPost=ReturnType<typeof createRiverFlankPost>;
