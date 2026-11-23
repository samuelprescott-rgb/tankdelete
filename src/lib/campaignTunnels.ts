import { safeVillageLeg, type VillageObstacle } from './villageCover';
import type { RiverStation } from '../components/Scene/riverLayout';
import type { EnemyCombatant } from './combat';

export const TUNNEL_BATCH=6, TUNNEL_BATCHES=2, TUNNEL_WARNING=4, FIELD_LIVE_CAP=16;
type Point={x:number;z:number};
export type TunnelPlayer=Point & {yaw:number};
export type TunnelSite=Point & {slots:Point[]};
export interface TunnelClock {
  repeat:boolean; batch:number; elapsed:number; warning:number; site:TunnelSite|null; last:Point|null;
}
export const newTunnelClock=(active:boolean,repeat=false):TunnelClock=>({
  repeat:active&&repeat,batch:active?0:TUNNEL_BATCHES,elapsed:0,warning:0,site:null,last:null,
});
export const tunnelDebt=(c:TunnelClock)=>c.repeat?0:Math.max(0,TUNNEL_BATCHES-c.batch)*TUNNEL_BATCH;

/** Pick a visible dry patch when possible, not a spawn on the other side of
 * the tank. Distance, structure footprints and actual river/bridge clearance
 * are hard constraints; facing is a preference, even at the edge of the map. */
export function chooseTunnelSite(player:TunnelPlayer, obstacles:readonly VillageObstacle[],
  river:RiverStation[], occupied:readonly Point[], last:Point|null, batch:number):TunnelSite|null{
  const candidates:{x:number;z:number;score:number}[]=[];
  for(const z of [7,13,21,28,35,41])for(const x of [-24,-16,-8,0,8,16,24]){
    const dx=x-player.x,dz=z-player.z,r=Math.hypot(dx,dz);
    if(r<13)continue;
    const facing=(-Math.sin(player.yaw)*dx-Math.cos(player.yaw)*dz)/r;
    candidates.push({x,z,score:Math.abs(r-22)+20*(1-facing)+(last&&Math.hypot(x-last.x,z-last.z)<10?18:0)});
  }
  candidates.sort((a,b)=>a.score-b.score);
  for(const {x,z} of candidates){
    if(!safeVillageLeg(x,z,x,z,obstacles,river))continue;
    const slots:Point[]=[];
    for(let i=0;i<30&&slots.length<TUNNEL_BATCH;i++){
      const a=batch*.83+i*2.39996,r=1.15+Math.sqrt(i)*.47;
      const sx=x+r*Math.sin(a),sz=z+r*Math.cos(a);
      if(!safeVillageLeg(x,z,sx,sz,obstacles,river)||
        occupied.some(p=>Math.hypot(sx-p.x,sz-p.z)<1.18)||
        slots.some(p=>Math.hypot(sx-p.x,sz-p.z)<1.23))continue;
      slots.push({x:sx,z:sz});
    }
    if(slots.length===TUNNEL_BATCH)return {x,z,slots};
  }
  return null;
}

/** Active simulation seconds only. No repeat spawns, timers or proximity gate.
 * A disabled/entirely obstructed tunnel is sealed rather than holding the radio
 * hostage; a tank camping a warned spot receives a fresh warning elsewhere. */
export function stepTunnels(clock:TunnelClock,dt:number,living:number,
  pick:()=>TunnelSite|null,valid:(s:TunnelSite)=>boolean){
  if(!Number.isFinite(dt)||dt<=0)return null;
  if(!tunnelDebt(clock)&&!(clock.repeat&&(living<2||clock.site)))return null;
  clock.elapsed+=Math.min(dt,.2);
  if(clock.site){
    clock.warning+=Math.min(dt,.2);
    if(clock.warning<TUNNEL_WARNING)return null;
    if(valid(clock.site)){
      const site=clock.site,batch=++clock.batch;
      clock.last=site;clock.site=null;clock.warning=0;clock.elapsed=0;
      return {kind:'emerge' as const,site,batch};
    }
    clock.site=null;clock.warning=0;
  }else if(living+TUNNEL_BATCH>FIELD_LIVE_CAP||
    clock.elapsed<(living<2?1:living<=6?5:14))return null;
  clock.site=pick();clock.warning=0;
  if(clock.site)return {kind:'warning' as const,site:clock.site,batch:clock.batch+1};
  clock.batch++;clock.elapsed=0;
  return {kind:'sealed' as const,batch:clock.batch};
}

export function tunnelFighters(seed:number,batch:number,site:TunnelSite):EnemyCombatant[]{
  return site.slots.map(({x,z},i)=>({
    id:`tunnel-${seed}-${batch}-${i}`,tunnel:true,tunnelMouth:{x:site.x,z:site.z},position:[x,.02,z],
    health:100,maxHealth:100,alive:true,stance:'standing',headwear:i%4===0?'pith':'boonie',
    uniformVariant:(i+batch)%3,fireInterval:2.45+(i%3)*.27,initialFireDelay:1.6+i*.27,
    accuracy:.072+(i%3)*.009,
  }));
}
