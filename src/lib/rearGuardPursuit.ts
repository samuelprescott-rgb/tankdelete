import { isInsideArena } from './arenaBounds';
import { intersectsTerrainMound } from './terrain';
import { villageBlocksWalk, type VillageObstacle } from './villageCover';
import { tankFootprintBlocked } from './tankFootprint';
import { approachRearYaw, rearGuardBodyBlocksDrive, rearHutBlocksDrive, rearGuardHasSight,
  type RearGuardPose } from './rearStronghold';
import { createRiverCrossings, isInsideRiverCorridor, type RiverStation, type RiverCrossing } from '../components/Scene/riverLayout';
import { createLandingContact } from './fieldBuildings';

type Spot={x:number;z:number};
type Landing=Parameters<typeof createLandingContact>[0];
export function createRearGuardMap(river:RiverStation[],obstacles:readonly VillageObstacle[],hutDestroyed:boolean,landing?:Landing) {
  return {river,obstacles,hutDestroyed,landing,landingContact:landing&&createLandingContact(landing),
    bridge:createRiverCrossings(river).find(b=>b.kind==='bridge')};
}
type Field=ReturnType<typeof createRearGuardMap>;

// A one-way tripwire exactly across the last plank, not a half-plane covering
// the village. Interpolate the crossing point so a long frame can't skip it.
export function crossedRearBridge(bridge:RiverCrossing|undefined,ax:number,az:number,bx:number,bz:number){
  if(!bridge)return false;
  const exit=bridge.z+bridge.length*.5;
  if(!(az<exit && bz>=exit))return false;
  const x=ax+(bx-ax)*(exit-az)/(bz-az);
  return Math.abs(x-bridge.centerX)<=bridge.width*.5;
}

const PAD=Math.hypot(1.11,1.69), STRIDE=4.6, ENTRANCE_STRIDE=7.2, HOLD=13.5, GRID=2.5;
// Stage the first reveal on the road *ahead* of the crossing. The ordinary
// nearest in-range point is almost due west and completely off the stock
// chase camera. Once seen in this lane, it pursues normally anywhere else.
export function inRearEntranceLane(p:Spot,player:Spot){
  return Math.abs(p.x-player.x)<=6 && p.z-player.z>=6;
}
export function nearRearEntrance(player:Spot,field:Field){
  const b=field.bridge;if(!b)return false;
  const forward=player.z-(b.z+b.length*.5);
  return Math.abs(player.x-b.centerX)<=7 && forward>=-2 && forward<=17;
}
function openStep(a:Spot,b:Spot,field:Field){
  const {x,z}=b;
  if(!isInsideArena(x,z,PAD)||intersectsTerrainMound(x,z,PAD)||rearHutBlocksDrive(x,z,PAD,field.hutDestroyed)
    ||isInsideRiverCorridor(x,z,field.river,PAD)||villageBlocksWalk(a.x,a.z,x,z,field.obstacles,PAD))return false;
  if(field.landing&&Math.hypot(x-field.landing.cx,z-field.landing.z)<PAD+3.5)return false;
  return !field.obstacles.some(o=>!o.hut&&Math.hypot(x-o.position[0],z-o.position[2])<PAD+o.radius);
}
function clearLeg(a:Spot,b:Spot,field:Field,player:Spot){
  const dx=b.x-a.x,dz=b.z-a.z,n=Math.ceil(Math.hypot(dx,dz)/.6);
  const dist2=dx*dx+dz*dz;
  const u=dist2?Math.max(0,Math.min(1,((player.x-a.x)*dx+(player.z-a.z)*dz)/dist2)):0;
  // Never plan a shortcut through the occupied hull. A close but non-touching
  // guard may still move away; the exact rotating hull check runs on each step.
  if(u>0&&Math.hypot(a.x+dx*u-player.x,a.z+dz*u-player.z)<PAD+1.5)return false;
  let from=a;
  for(let i=1;i<=n;i++){
    const to={x:a.x+i*dx/n,z:a.z+i*dz/n};
    if(!openStep(from,to,field))return false;
    from=to;
  }
  return true;
}
function seesPlayer(from:Spot,target:Spot,field:Field){
  return rearGuardHasSight(target.x,target.z,field.obstacles,from,field.hutDestroyed,field.landingContact);
}
const directions=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
type Node=Spot&{ix:number;iz:number;cost:number;score:number;parent:Node|null};
// Look for a reachable *firing spot*, not the cell occupied by the player.
// The enemy stays on dry ground; a player in the river or inside a hut cannot
// force clipping or stall the approach back at the original patrol.
function chaseRoute(start:Spot,target:Spot,field:Field,entrance:boolean):Spot[]{
  const destination=entrance?{x:target.x-2,z:target.z+11}:target;
  const goal=(s:Spot)=>Math.hypot(s.x-destination.x,s.z-destination.z);
  const distance=goal(start);
  // The common run across the open rear yard needs no grid search at all.
  if(distance>.1){
    const fraction=entrance?1:Math.max(0,1-(HOLD-.5)/distance);
    const spot={x:start.x+(destination.x-start.x)*fraction,z:start.z+(destination.z-start.z)*fraction};
    if(seesPlayer(spot,target,field)&&clearLeg(start,spot,field,target))return [spot];
  }
  const first:Node={x:start.x,z:start.z,ix:0,iz:0,cost:0,score:0,parent:null};
  const distances=new Map<number,number>([[0,0]]),frontier=[first];
  let best=first,bestGap=goal(first);
  for(let i=0;i<420&&frontier.length;i++){
    let index=0;
    for(let j=1;j<frontier.length;j++)if(frontier[j].score<frontier[index].score)index=j;
    const [p]=frontier.splice(index,1),gap=goal(p);
    if(p.cost!==distances.get(p.ix*256+p.iz))continue;
    if(gap<bestGap){best=p;bestGap=gap;}
    if((entrance?inRearEntranceLane(p,target):gap<=HOLD)&&seesPlayer(p,target,field)){best=p;break;}
    for(const [dx,dz] of directions){
      const ix=p.ix+dx,iz=p.iz+dz,key=ix*256+iz,cost=p.cost+Math.hypot(dx,dz)*GRID;
      if(cost>=(distances.get(key)??Infinity)-.001)continue;
      const next:Node={x:start.x+ix*GRID,z:start.z+iz*GRID,ix,iz,cost,score:0,parent:p};
      if(!clearLeg(p,next,field,target))continue;
      distances.set(key,cost);next.score=cost+1.35*goal(next);frontier.push(next);
    }
  }
  const reversed:Spot[]=[];
  for(let p:Node|null=best;p?.parent;p=p.parent)reversed.push(p);
  const path:Spot[]=[];let from=start;
  for(let i=reversed.length-1;i>=0;){
    let last=i;while(last>0&&clearLeg(from,reversed[last-1],field,target))last--;
    from=reversed[last];path.push(from);i=last-1;
  }
  return path;
}

export function newRearPursuit(){
  return {route:[] as Spot[],index:0,goalX:Infinity,goalZ:Infinity,map:null as Field|null,retry:0,entrance:false};
}
export function advanceRearPursuit(p:RearGuardPose,chase:ReturnType<typeof newRearPursuit>,
  dt:number,player:Spot,playerYaw:number,visible:boolean,field:Field,entrance=false){
  if(!Number.isFinite(dt)||dt<=0||dt>.33)return;
  if(!entrance&&visible&&Math.hypot(p.x-player.x,p.z-player.z)<=HOLD)return;
  chase.retry-=dt;
  if(chase.map!==field||chase.entrance!==entrance||Math.hypot(player.x-chase.goalX,player.z-chase.goalZ)>3.5
    ||(chase.index>=chase.route.length&&chase.retry<=0)){
    chase.route=chaseRoute(p,player,field,entrance);chase.index=0;chase.map=field;chase.entrance=entrance;
    chase.goalX=player.x;chase.goalZ=player.z;chase.retry=1.75;
  }
  const steps=Math.ceil(dt/(1/30)),t=dt/steps;
  for(let i=0;i<steps;i++){
    const w=chase.route[chase.index];if(!w)return;
    const dx=w.x-p.x,dz=w.z-p.z,d=Math.hypot(dx,dz);
    if(d<.015){chase.index++;continue;}
    const target=Math.atan2(-dx,-dz),yaw=approachRearYaw(p.yaw,target,2.3*t);
    const stride=Math.abs(Math.sin((yaw-target)*.5))<.02?Math.min(d,(entrance?ENTRANCE_STRIDE:STRIDE)*t):0;
    const next={x:p.x+dx*stride/d,z:p.z+dz*stride/d};
    if(tankFootprintBlocked(player.x,player.z,playerYaw,(x,z,r)=>rearGuardBodyBlocksDrive(x,z,r,next.x,next.z,yaw))){
      // If the player cuts across a previously clear leg, find a new one;
      // don't keep pressing into the same occupied point indefinitely.
      chase.index=chase.route.length;chase.retry=Math.max(.35,chase.retry);return;
    }
    // Every leg had full swept clearance on this exact map. Pivot inside the
    // same conservative hull radius before translating along its tested line.
    p.yaw=yaw;p.x=next.x;p.z=next.z;p.travel+=stride;
  }
}
