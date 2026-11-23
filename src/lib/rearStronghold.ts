import { firstReliefContact, intersectsTerrainMound } from './terrain';
import { villageBlocksSight, villageBlocksWalk, type VillageObstacle } from './villageCover';
import { tankFootprintBlocked } from './tankFootprint';

// Fictional station, guard spawn, and surviving radio. The guard's spawn is
// NOT its ongoing hit/drive address; those use the shared pose below.
export const REAR_HUT: [number, number, number] = [-32, 0, 48];
export const REAR_GUARD: [number, number, number] = [-32, 0, 40];
export const REAR_RADIO: [number, number, number] = [-32, 0, 45];
export const REAR_RADIO_RADIUS = 3;
export const REAR_GUARD_MAX_HP = 120;
export const REAR_GUARD_WARN_SECONDS = 1.4;
export const REAR_GUARD_PULSE_SECONDS = .45;
export const REAR_GUARD_PULSE_DAMAGE = 10;
export const REAR_GUARD_RANGE = 19;
const REAR_GUARD_COOLDOWN = 3;
const REAR_MARK_RADIUS = 1.8;
export interface RearGuardPose {
  x:number; z:number; yaw:number; turretYaw:number;
  waypoint:number; direction:number; blocked:number; travel:number;
}
// A looping patrol west of the radio. Leave its east approach/doorway free,
// including if the player destroys the guardian and leaves the wreck there.
const WAYPOINTS=[[-32,40],[-31,36],[-33.7,34.6],[-37,36.3],[-37.2,40],[-34.5,41.2]] as const;
export function newRearGuardPose():RearGuardPose {
  return {x:REAR_GUARD[0],z:REAR_GUARD[2],yaw:0,turretYaw:0,waypoint:1,direction:1,blocked:0,travel:0};
}
const spawnPose = newRearGuardPose();
const guardRadius=Math.hypot(1.11,1.69);
export function approachRearYaw(yaw:number,target:number,maxTurn:number) {
  const err=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw));
  return yaw+Math.max(-maxTurn,Math.min(err,maxTurn));
}

type DamageKind = 'cannon' | 'machinegun' | 'napalm';
const guardDamage: Record<DamageKind, number> = { cannon: 40, machinegun: 5, napalm: 80 };
export function damageRearGuard(hp: number, kind: DamageKind) {
  return Math.max(0, Math.min(REAR_GUARD_MAX_HP, hp) - guardDamage[kind]);
}

/** The whole field must be clear. Completing a file objective is unrelated. */
export function rearRadioReady(guardHp: number, livingHostiles: number) {
  return guardHp === 0 && livingHostiles === 0;
}

export function inRearRadioRange(x: number, z: number, hutDestroyed=false) {
  const dx = x - REAR_RADIO[0], dz = z - REAR_RADIO[2];
  // Once the walls are down the receiver can also be approached across its own foundations.
  if(hutDestroyed && Math.hypot(x-REAR_HUT[0],z-REAR_HUT[2])<=REAR_RADIO_RADIUS)return true;
  return z <= REAR_HUT[2] - 1.18 && dx * dx + dz * dz <= REAR_RADIO_RADIUS ** 2;
}
export function canUseRearRadio(guardHp: number, livingHostiles: number, x: number, z: number, hutDestroyed=false) {
  return rearRadioReady(guardHp, livingHostiles) && inRearRadioRange(x, z, hutDestroyed);
}

type Point = { x: number; y: number; z: number };
type Box = readonly [number, number, number, number, number, number];
const box = (x: number, z: number, halfX: number, halfZ: number, low: number, high: number): Box =>
  [x - halfX, x + halfX, low, high, z - halfZ, z + halfZ];
const hull = box(0, 0, 1.11, 1.69, .03, 1.14);
const turret = box(0, 0, .72, .80, 1.11, 1.75);
const wreckTurret = box(0, 0, .72, .80, .98, 1.68);
const house = box(REAR_HUT[0], REAR_HUT[2], 1.57, 1.18, -.08, 1.66);
const roof = box(REAR_HUT[0], REAR_HUT[2], 2.23, 1.88, 1.65, 2.59);
const rubble = box(REAR_HUT[0], REAR_HUT[2], .48, .42, -.08, .32);
const axes = ['x', 'y', 'z'] as const;

/** First intersection with a convex game prop, including segments starting
 * inside. The roof clips its box to two pitched planes so high shots miss. */
function firstBox(a: Point, b: Point, bounds: Box, pitched = false) {
  let enter = 0, exit = 1;
  for (let i = 0; i < 3; i++) {
    const axis = axes[i], p = a[axis], d = b[axis] - p;
    const lo = bounds[i * 2], hi = bounds[i * 2 + 1];
    if (Math.abs(d) < 1e-10) { if (p < lo || p > hi) return null; }
    else {
      const t0 = (lo - p) / d, t1 = (hi - p) / d;
      enter = Math.max(enter, Math.min(t0, t1)); exit = Math.min(exit, Math.max(t0, t1));
      if (enter > exit) return null;
    }
  }
  if (pitched) for (let side = -1; side <= 1; side += 2) {
    const slope = side * (roof[3] - roof[2]) / 2.23;
    const sideDistance = roof[3] - a.y - slope * (a.x - REAR_HUT[0]);
    const d = b.y - a.y + slope * (b.x - a.x);
    if (Math.abs(d) < 1e-10) { if (sideDistance < 0) return null; }
    else if (d > 0) exit = Math.min(exit, sideDistance / d);
    else enter = Math.max(enter, sideDistance / d);
    if (enter > exit) return null;
  }
  return enter;
}
function earlier(a: number | null, b: number | null) {
  return a === null ? b : b === null ? a : Math.min(a, b);
}
function firstHouse(a: Point, b: Point, destroyed=false) {
  return destroyed ? firstBox(a,b,rubble) : earlier(firstBox(a, b, house), firstBox(a, b, roof, true));
}

function localPoint(a:Point,x:number,z:number,cs:number,sn:number):Point {
  return {x:cs*(a.x-x)-sn*(a.z-z),y:a.y,z:sn*(a.x-x)+cs*(a.z-z)};
}
function overlapsRect(a:Point,b:Point,x0:number,x1:number,z0:number,z1:number) {
  return Math.max(a.x,b.x)>=x0 && Math.min(a.x,b.x)<=x1 && Math.max(a.z,b.z)>=z0 && Math.min(a.z,b.z)<=z1;
}
export function firstRearContact(a: Point, b: Point, p=spawnPose,hutDestroyed=false,wrecked=false) {
  const wall=overlapsRect(a,b,roof[0],roof[1],roof[4],roof[5])?firstHouse(a,b,hutDestroyed):null;
  let body:number|null=null;
  if(overlapsRect(a,b,p.x-guardRadius,p.x+guardRadius,p.z-guardRadius,p.z+guardRadius)) {
    const cs=Math.cos(p.yaw),sn=Math.sin(p.yaw);
    const shell=firstBox(localPoint(a,p.x,p.z,cs,sn),localPoint(b,p.x,p.z,cs,sn),hull);
    const tx=p.x-.14*sn-(wrecked?.08*cs:0),tz=p.z-.14*cs+(wrecked?.08*sn:0);
    const ct=Math.cos(p.turretYaw),st=Math.sin(p.turretYaw);
    body=earlier(shell,firstBox(localPoint(a,tx,tz,ct,st),localPoint(b,tx,tz,ct,st),wrecked?wreckTurret:turret));
  }
  if (wall !== null && (body === null || wall <= body)) return { t: wall, kind: 'hut' as const };
  return body === null ? null : { t: body, kind: 'guard' as const };
}

function discTouchesBox(x: number, z: number, radius: number, b: Box) {
  const dx = x - Math.max(b[0], Math.min(x, b[1])), dz = z - Math.max(b[4], Math.min(z, b[5]));
  return dx * dx + dz * dz <= radius * radius;
}
/** Opt-in campaign-only hard shapes; leave the tank's ordinary scenery rules alone. */
export function rearGuardBodyBlocksDrive(x:number,z:number,r:number,gx:number,gz:number,yaw:number) {
  const dx=x-gx,dz=z-gz;
  if(Math.abs(dx)>guardRadius+r||Math.abs(dz)>guardRadius+r)return false;
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return discTouchesBox(dx*c-dz*s,dz*c+dx*s,r,hull);
}
export function rearStrongholdBlocksDrive(x: number, z: number, radius: number,p=spawnPose,hutDestroyed=false) {
  return rearGuardBodyBlocksDrive(x,z,radius,p.x,p.z,p.yaw) || rearHutBlocksDrive(x,z,radius,hutDestroyed);
}
export const rearHutBlocksDrive=(x:number,z:number,radius:number,destroyed:boolean)=>discTouchesBox(x,z,radius,destroyed?rubble:house);

/** Pivot and advance in small steps; no animation occurs during the aiming
 * tell or in flight. During cooldown the guard shifts to a new firing spot. */
export function advanceRearPatrol(p:RearGuardPose,dt:number,engaged:boolean,
  px:number,pz:number,playerYaw:number,obstacles:readonly VillageObstacle[]) {
  if(!Number.isFinite(dt)||dt<=0||dt>.33)return;
  const steps=Math.ceil(dt/(1/30));
  for(let j=0;j<steps;j++){
    const t=dt/steps,[wx,wz]=WAYPOINTS[p.waypoint],dx=wx-p.x,dz=wz-p.z,dist=Math.hypot(dx,dz);
    if(dist<.27){p.waypoint=(p.waypoint+p.direction+WAYPOINTS.length)%WAYPOINTS.length;continue;}
    const target=Math.atan2(-dx,-dz),yaw=approachRearYaw(p.yaw,target,1.85*t);
    const stride=(engaged?2.65:1.95)*t*Math.max(0,Math.cos(yaw-target))**4;
    const x=p.x-Math.sin(yaw)*stride,z=p.z-Math.cos(yaw)*stride;
    const playerBlocks=Math.abs(px-x)<4 && Math.abs(pz-z)<4
      && tankFootprintBlocked(px,pz,playerYaw,(a,b,r)=>rearGuardBodyBlocksDrive(a,b,r,x,z,yaw));
    const blocked=playerBlocks||discTouchesBox(x,z,guardRadius,house)||intersectsTerrainMound(x,z,guardRadius)
      ||villageBlocksWalk(p.x,p.z,x,z,obstacles,guardRadius) || obstacles.some(o=>!o.hut&&Math.hypot(x-o.position[0],z-o.position[2])<guardRadius+o.radius);
    if(blocked){
      p.blocked+=t;
      if(p.blocked>.32){p.direction*=-1;p.waypoint=(p.waypoint+p.direction+WAYPOINTS.length)%WAYPOINTS.length;p.blocked=0;}
      continue;
    }
    p.blocked=0;p.x=x;p.z=z;p.yaw=yaw;p.travel+=stride;
  }
}

type SceneryContact=(from:Point,to:Point)=>number|null;
export function rearPulseHasCover(from:Point,to:Point,obstacles:readonly VillageObstacle[],hutDestroyed=false,sceneryContact?:SceneryContact) {
  return firstHouse(from,to,hutDestroyed)!==null || firstReliefContact(from,to,Infinity)!==Infinity
    || villageBlocksSight(from,to,obstacles) || sceneryContact?.(from,to)!=null;
}
export function rearGuardHasSight(x: number, z: number, obstacles: readonly VillageObstacle[],p:Pick<RearGuardPose,'x'|'z'>=spawnPose,hutDestroyed=false,
  sceneryContact?:SceneryContact) {
  const dx = x - p.x, dz = z - p.z;
  if (!(dx * dx + dz * dz <= REAR_GUARD_RANGE ** 2)) return false;
  return !rearPulseHasCover({x:p.x,y:1.44,z:p.z},{x,y:.70,z},obstacles,hutDestroyed,sceneryContact);
}

export interface RearGuardCycle {
  phase: 'idle' | 'warning' | 'pulse' | 'cooldown';
  time: number; aimX: number; aimZ: number;
}
export function newRearGuardCycle(): RearGuardCycle {
  return {phase: 'idle', time: 0, aimX: REAR_GUARD[0], aimZ: REAR_GUARD[2]};
}

/** A visible arcade target circle, then a bounded pulse to that fixed spot.
 * The player can leave the mark or get behind cover, even after the flash. */
export function stepRearGuard(s: RearGuardCycle, dt: number, active: boolean,
  playerX: number, playerZ: number, clearSight: boolean,p=spawnPose): 'warn'|'fire'|'hit'|'miss'|null {
  if (!active) { s.phase = 'idle'; s.time = 0; return null; }
  if (!Number.isFinite(dt) || dt <= 0 || dt > .33) return null;
  s.time += dt;
  switch (s.phase) {
    case 'idle': {
      const dx = playerX - p.x, dz = playerZ - p.z;
      if (clearSight && dx * dx + dz * dz <= REAR_GUARD_RANGE ** 2) {
        s.phase = 'warning'; s.time = 0; s.aimX = playerX; s.aimZ = playerZ; return 'warn';
      }
      break;
    }
    case 'warning':
      if (s.time + 1e-9 >= REAR_GUARD_WARN_SECONDS) {
        s.phase = 'pulse'; s.time = Math.max(0, s.time - REAR_GUARD_WARN_SECONDS); return 'fire';
      }
      break;
    case 'pulse':
      if (s.time + 1e-9 >= REAR_GUARD_PULSE_SECONDS) {
        s.phase = 'cooldown'; s.time = Math.max(0, s.time - REAR_GUARD_PULSE_SECONDS);
        const dx = playerX - s.aimX, dz = playerZ - s.aimZ;
        return clearSight && dx * dx + dz * dz <= REAR_MARK_RADIUS ** 2 ? 'hit' : 'miss';
      }
      break;
    case 'cooldown':
      if (s.time + 1e-9 >= REAR_GUARD_COOLDOWN) { s.phase = 'idle'; s.time = 0; }
      break;
  }
  return null;
}
