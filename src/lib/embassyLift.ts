import type { FriendlyCombatant } from './combat';

type Point = [number,number,number];
export const LIFT_WAVE = 2;
export const LIFT_PAD: Point = [-4.42, 1.105, -16.79];
// Park across the courtyard: at the old diagonal the descending tail
// crossed the west gatepost. Keep the skids at the original court height.
export const LIFT_YAW=-1.12;
const c=Math.cos(LIFT_YAW),s=Math.sin(LIFT_YAW),exitX=-c,exitZ=s;
// The port door opens into the Records court. Rotating the whole aircraft
// puts the tail outside both the regular and art-practice aim lines.
export const LIFT_SILL:Point=[-.86,-.42,.22];
export const LIFT_DOOR:Point=[LIFT_PAD[0]+c*LIFT_SILL[0]+s*LIFT_SILL[2],
  LIFT_PAD[1]+LIFT_SILL[1],LIFT_PAD[2]-s*LIFT_SILL[0]+c*LIFT_SILL[2]];
export const LIFT_STEP:Point=[LIFT_DOOR[0]+1.88*exitX,.025,LIFT_DOOR[2]+1.88*exitZ];
export const LIFT_FOOTDOWN=1.02;
const unit=(x:number)=>Math.min(1,Math.max(0,x));
const ease=(x:number)=>{const t=unit(x);return t*t*(3-2*t);};
// One low dismount, not a slow glide followed by a teleport. First brace at
// the opening, pass the outer skid, then step down onto the cleared verge.
export const liftStepTravel=(time:number)=>.62*ease((time-.055)/.43)+.38*ease((time-.48)/.54);
export const liftBootHeight=(time:number,sillHeight=LIFT_DOOR[1])=>{
  if(time>=.96)return .025;
  const k=unit((time-.43)/.53);
  return .025+(sillHeight-.025)*(1-k*k*(2-k))+.047*Math.sin(Math.PI*unit((time-.08)/.42));
};
export const dismountBeat=(time:number)=>.61*(1-ease((time-.13)/.33))+
  .84*ease((time-.78)/.19)*(1-ease((time-.97)/.28));
/** Only trim the small, trampled roadside lay-by around the near skid. */
export function liftGrassHeight(x:number,z:number){
  const nx=(x-LIFT_PAD[0]+.60)/3.75,nz=(z-LIFT_PAD[2]-.2)/2.4;
  if(Math.abs(nx)>1||Math.abs(nz)>1)return 1;
  return .075+.925*ease((nx*nx+nz*nz-.34)/.65);
}
export const LIFT_TOUCHDOWN=5.75;
export const LIFT_START_DROP = 6.28;
export const LIFT_DROP_INTERVAL = .96;
export const LIFT_DEPART = 15.6;
export const LIFT_END = 22.2;
export function embassyTransportPose(t:number){
  const track=ease(t/3.2),settle=ease((t-3.0)/(LIFT_TOUCHDOWN-3.0));
  const climb=ease((t-LIFT_DEPART)/3),out=ease((t-LIFT_DEPART-2.25)/(LIFT_END-LIFT_DEPART-2.25));
  // Cross the 8.3 m flagstaff high; descend on the open side of its cloth
  // and ease back onto the skids. The same offset grows smoothly on climb.
  const altitude=(1-settle)*10+(1-track)*6.8+climb*10+out*8;
  return {x:LIFT_PAD[0]-(1-track)*16-out*20, y:LIFT_PAD[1]+altitude,
    z:LIFT_PAD[2]-(1-track)*20-out*23+1.25*ease((altitude-1.1)/2.8), yaw:LIFT_YAW-.50*(1-track)+out*.55,
    pitch:-.09*Math.sin(track*Math.PI)-.10*Math.sin(out*Math.PI),roll:.11*Math.sin(track*Math.PI)+.19*Math.sin(out*Math.PI),
    visible:t>=0&&t<LIFT_END};
}
export const LIFT_TEAM = [
  {id:'lift-amber',post:[-9.1,.025,-15.6] as Point,body:0},
  {id:'lift-wren',post:[-10.8,.025,-16.0] as Point,body:3},
  {id:'lift-cedar',post:[-11.7,.025,-15.15] as Point,body:2},
  {id:'lift-moss',post:[-7.2,.025,-17.35] as Point,body:4},
] as const;
export function liftCombatant(slot:number):FriendlyCombatant | null {
  const ticket=LIFT_TEAM[slot];
  if(!ticket)return null;
  // Finite health; this one ticket cannot resurrect a fallen passenger.
  return {id:ticket.id,position:[...LIFT_DOOR],health:70,maxHealth:70,alive:true,kneeling:ticket.body!==3};
}
export type LiftCall = 'approach' | 'unload' | 'away' | null;
export const LIFT_CALLS = {
  approach:'Rook inbound · four aboard, Records courtyard',
  unload:'Rook on the skids · squad disembarking',
  away:'Rook outbound · relief is on foot',
} as const;
