import {safeVillageLeg,type VillageObstacle} from './villageCover';
import type {RiverStation} from '../components/Scene/riverLayout';

// Static props and other actors reserve a short line in the ground plane.
// Give both boots room while turning a corner; no grid/path rebuild per tick.
export interface FootprintLine {ax:number;az:number;bx:number;bz:number;radius:number}
function pointDistance(x:number,z:number,ax:number,az:number,bx:number,bz:number){
  const dx=bx-ax,dz=bz-az,d=dx*dx+dz*dz,t=d?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/d)):0;
  return (x-ax-t*dx)**2+(z-az-t*dz)**2;
}
export function footLaneClear(ax:number,az:number,bx:number,bz:number,lines:readonly FootprintLine[]){
  for(const l of lines){
    const {ax:x,az:z,bx:u,bz:v,radius:r}=l,dx=bx-ax,dz=bz-az,ex=u-x,ez=v-z;
    const a=dx*(z-az)-dz*(x-ax),b=dx*(v-az)-dz*(u-ax);
    const c=ex*(az-z)-ez*(ax-x),d=ex*(bz-z)-ez*(bx-x);
    if(a*b<0&&c*d<0 || Math.min(pointDistance(ax,az,x,z,u,v),pointDistance(bx,bz,x,z,u,v),
      pointDistance(x,z,ax,az,bx,bz),pointDistance(u,v,ax,az,bx,bz))<r*r) return false;
  }
  return true;
}
type CheckPoint=(x:number,z:number)=>boolean;
// Day campaign only. Move a short, readable leg toward the tank, turn around
// a blocked pocket where possible, and yield a ring of space at the player.
// Don't chase into the deployment area behind the starting friendly line.
export function advanceFieldWaypoint(ax:number,az:number,tx:number,tz:number,seed:number,leg:number,
  obstacles:readonly VillageObstacle[],river:RiverStation[]|undefined,clear:CheckPoint){
  const dx=tx-ax,dz=tz-az,r=Math.hypot(dx,dz),stop=6.3+seed%3;
  if(r<=stop+.6)return null;
  const a=Math.atan2(dx,dz),side=(seed+leg)%2?1:-1;
  for(const offset of [0,.43,-.43,.83,-.83,1.18,-1.18,1.49,-1.49]){
    const turn=a+offset*side;
    for(const length of [Math.min(3.8,r-stop),1.4]){
      const x=ax+Math.sin(turn)*length,z=az+Math.cos(turn)*length;
      if(z<1.4||Math.hypot(x-tx,z-tz)<stop||!clear(x,z))continue;
      if(safeVillageLeg(ax,az,x,z,obstacles,river))return {x,z};
    }
  }
  return null;
}
export function patrolWaypoint(ax:number,az:number,homeX:number,homeZ:number,radius:number,
  seed:number,leg:number,obstacles:readonly VillageObstacle[],river:RiverStation[]|undefined,clear:CheckPoint){
  // Each actor has its own repeating sequence of uneven turning arcs, not one
  // synchronized left/right pose. Endpoints remain inside its assigned area.
  const phase=(seed%4093)*.173+leg*2.399963;
  for(let n=0;n<18;n++){
    const angle=phase+n*2.399963,r=radius*(.50+.49*(.5+.5*Math.sin(phase*1.71+n*1.31)));
    const x=homeX+Math.sin(angle)*r,z=homeZ+Math.cos(angle)*r;
    if(Math.hypot(x-ax,z-az)<Math.min(1.45,radius*.47) || !clear(x,z)) continue;
    if(safeVillageLeg(ax,az,x,z,obstacles,river))return {x,z};
  }
  return null;
}
export function turnFootActor(yaw:number,to:number,dt:number){
  const d=Math.atan2(Math.sin(to-yaw),Math.cos(to-yaw)),limit=Math.max(0,Math.min(dt,.12))*4.8;
  return yaw+Math.max(-limit,Math.min(limit,d));
}
export function footLegDuration(ax:number,az:number,bx:number,bz:number,pace:number){
  return .23+Math.hypot(bx-ax,bz-az)/pace;
}
