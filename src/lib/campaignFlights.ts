import type { FriendlyCombatant } from './combat';
import type { GameLaunch } from './gameSession';

type Point = [number, number, number];
const clamp = (n:number) => Math.min(1, Math.max(0,n));
const ease = (n:number) => { const t=clamp(n); return t*t*(3-2*t); };
const mix = (a:number,b:number,t:number) => a+(b-a)*t;

// Dry verge between the original squad and the first village parcels. The
// near door points toward the spawn; feet leave the actual model's door sill.
export const DAY_PAD:Point = [-10.1,1.105,-.55];
export const DAY_YAW=1.68;
export const DAY_DOOR:Point=[
  DAY_PAD[0]+.86*Math.cos(DAY_YAW)+.22*Math.sin(DAY_YAW),
  DAY_PAD[1]-.42, DAY_PAD[2]-.86*Math.sin(DAY_YAW)+.22*Math.cos(DAY_YAW),
];
export const DAY_STEP:Point=[DAY_DOOR[0]+1.38*Math.cos(DAY_YAW),.025,DAY_DOOR[2]-1.38*Math.sin(DAY_YAW)];
/** Only the short stubble in the actual day landing bay; all other plots,
 * including the embassy, keep their own untouched vegetation profile. */
export function dayPadGrass(x:number,z:number){
  const d=((x-DAY_PAD[0]-.25)/3.8)**2+((z-DAY_PAD[2]+1.0)/3.0)**2;
  return .095+.905*ease((d-.50)/.72);
}
export const DAY_CREW=[
  {id:'kestrel-pip',body:0,post:[-8.6,.025,-5.75] as Point},
  {id:'kestrel-lark',body:3,post:[-10.65,.025,-5.15] as Point},
  {id:'kestrel-fin',body:2,post:[-8.25,.025,-6.65] as Point},
] as const;
export function campaignPassenger(slot:number):FriendlyCombatant|null {
  const p=DAY_CREW[slot];
  return p?{id:p.id,position:[...DAY_DOOR],health:70,maxHealth:70,alive:true,kneeling:p.body!==3}:null;
}

export const canRunCampaignFlights=(launch:GameLaunch,embassy:boolean)=>
  !embassy && (launch.mode==='directory' || (launch.mode==='training'&&!launch.preview));
export const DAY_LAND=7.6, DAY_FIRST_STEP=8.4, DAY_STEP_INTERVAL=1.0, DAY_AWAY=15, DAY_OUT=20.6;
export const RIDGE_IN=18.4, RIDGE_HIT=25.2, RIDGE_LOST=30.6, RIDGE_CLEAR=42;
export const DAY_CALLS={
  inbound:'Kestrel inbound · landing beside the village road.',
  skids:'Kestrel on the skids · three friendlies joining your line.',
  crossing:'Eyes up · relay crossing left to right.',
  hit:'Relay is hit · going down beyond the treeline.',
};
export type DayCall=keyof typeof DAY_CALLS|null;
export function dayCall(t:number):DayCall {
  return t<1.2||t>=35?null:t<DAY_LAND?'inbound':t<DAY_AWAY?'skids':
    t<RIDGE_IN?null:t<RIDGE_HIT?'crossing':'hit';
}
export function newCampaignFlight(){return {time:0,next:0,call:null as DayCall};}
export function advanceCampaignFlight(clock:ReturnType<typeof newCampaignFlight>,dt:number,active:boolean,
  deploy:(slot:number)=>boolean,announce:(call:DayCall)=>void){
  if(!active||!Number.isFinite(dt)||dt<=0||clock.time>=RIDGE_CLEAR)return;
  clock.time=Math.min(RIDGE_CLEAR,clock.time+Math.min(dt,.1));
  while(clock.next<DAY_CREW.length&&clock.time>=DAY_FIRST_STEP+clock.next*DAY_STEP_INTERVAL)deploy(clock.next++);
  const call=dayCall(clock.time);
  if(call!==clock.call){clock.call=call;announce(call);}
}

export function transportPose(t:number){
  // Fly above the village roofs before flaring over the actual empty pad.
  // Reverse the sequence on departure: the tail and rotor clear vertically
  // before the pilot banks out. The aircraft is motionless during transfer.
  const track=ease((t-.6)/3.95),settle=ease((t-4.30)/(DAY_LAND-4.30));
  const climb=ease((t-DAY_AWAY)/2.85),out=ease((t-DAY_AWAY-2.2)/(DAY_OUT-DAY_AWAY-2.2));
  return {x:DAY_PAD[0]-22*(1-track)-out*27,y:DAY_PAD[1]+3.7*(1-settle)+7.4*(1-track)+climb*5.9+out*8.0,
    z:DAY_PAD[2]+11*(1-track)+out*8, yaw:DAY_YAW-.31*(1-track)+.40*out,
    roll:.105*Math.sin(track*Math.PI)-.19*Math.sin(out*Math.PI), pitch:-.13*Math.sin(track*Math.PI),
    visible:t>=.6&&t<DAY_OUT};
}

// A low rim entirely beyond the playable square, not a mountain which
// teleports in front of the viewer when the relay calls. The same profile
// locates the distant, *occluded* crash on any player's initial heading.
export function rimRadius(angle:number){
  return 70.5 / Math.pow(Math.cos(angle)**8+Math.sin(angle)**8,1/8);
}
export function rimCrest(angle:number){
  return 8.4+1.35*Math.sin(7*angle+.7)+.75*Math.cos(15*angle)+.36*Math.sin(31*angle);
}
// Far-side shelf of the same solid rim rendered by CampaignFlights. Nothing
// on this route belongs to the playable square or the transport's landing pad.
export const RELAY_RADIUS=110, RELAY_SCALE=1.32, RELAY_SHELF_EDGE=186;
export function ridgeGroundHeight(x:number,z:number){
  const a=Math.atan2(z,x),lip=rimRadius(a)+2,back=clamp((Math.hypot(x,z)-lip)/(RELAY_SHELF_EDGE-lip));
  return mix(rimCrest(a),.8,back);
}
export interface RelayPass {x:number;z:number;yaw:number;radius:number;wide:number;depth:number;halfWidth:number;height:number;scale:number}
// Cast a horizontal bearing onto a world-space circular corridor. A flat
// screen-parallel chord would send its ends behind the distant mountain mesh.
function relayDepth(x:number,z:number,yaw:number,offset:number,radius:number){
  const s=Math.sin(yaw),c=Math.cos(yaw),vx=s+offset*c,vz=c-offset*s;
  const dot=x*vx+z*vz,len=vx*vx+vz*vz;
  return (-dot+Math.sqrt(dot*dot+len*(radius*radius-x*x-z*z)))/len;
}
export function createRelayPass(x:number,y:number,z:number,dx:number,dy:number,dz:number,fov:number,aspect:number):RelayPass{
  const yaw=Math.atan2(dx,dz),s=Math.sin(yaw),c=Math.cos(yaw),lens=Math.tan(fov*Math.PI/360);
  const wide=lens*Math.max(.65,Math.min(2.4,aspect));
  // If the camera is at the arena edge looking OUT, put the corridor farther
  // away too. Never up-scale the helicopter to maintain a fixed screen size.
  const radius=Math.max(RELAY_RADIUS,Math.hypot(x+s*76,z+c*76));
  const depth=relayDepth(x,z,yaw,-.14*wide,radius);
  const tilt=Math.atan2(dy,Math.hypot(dx,dz));
  // The lower middle of this view contains a real branching fig and two
  // plumes. Cross the open strip ABOVE their tips, not through their crowns.
  const height=y+depth*Math.max(.20,Math.min(.34,Math.tan(tilt+Math.atan(lens*.84))));
  return {x,z,yaw,radius,wide,depth,halfWidth:depth*wide,height,scale:RELAY_SCALE};
}
const defaultRelay=createRelayPass(-2.95,3.12,-16.85,1.92,-1.3,7.55,60,16/9);
export function ridgePose(t:number,pass:RelayPass=defaultRelay){
  const cross=clamp((t-RIDGE_IN)/(RIDGE_HIT-RIDGE_IN)),fall=clamp((t-RIDGE_HIT)/(RIDGE_LOST-RIDGE_HIT));
  const offset=pass.wide*(mix(1.04,-.14,cross)-.48*fall),depth=relayDepth(pass.x,pass.z,pass.yaw,offset,pass.radius),side=depth*offset;
  const s=Math.sin(pass.yaw),c=Math.cos(pass.yaw);
  const x=pass.x+c*side+s*depth,z=pass.z-s*side+c*depth;
  const altitude=pass.height+.24*(depth-pass.depth),ground=ridgeGroundHeight(x,z);
  // The airframe rolls clear against sky through the first two seconds;
  // the steeper final leg is what finally puts it behind the trees.
  return {x,z,y:mix(altitude,ground+.12,Math.pow(fall,2.35))+.35*Math.sin(Math.PI*cross),
    yaw:Math.atan2(z,-x)+.62*fall,
    roll:.055*Math.sin(cross*Math.PI*2)+2.49*ease(fall)+.16*Math.sin(fall*19)*Math.sin(fall*Math.PI),
    pitch:-.71*fall+.10*Math.sin(fall*11)*Math.sin(fall*Math.PI),
    visible:t>=RIDGE_IN&&t<RIDGE_LOST};
}
