import type { Vector3 } from 'three';
import { villageHutYaw, villageStructureVariant } from './layout';
import { isInsideArena } from './arenaBounds';
import { intersectsTerrainMound } from './terrain';
import { createRiverStations, createBridgePlantExclusion, isInsideRiverCorridor, type RiverStation } from '../components/Scene/riverLayout';

/** Width, depth, woven-wall height, roof rise. Both the mesh and its gameplay
 * proxy consume these; a change to an art variant cannot silently undersize it. */
export const HUT_PROFILES = [
  [1.18, .96, .64, .44], [1.36, .98, .61, .26],
  [.93, 1.23, .7, .52], [1.04, .91, .61, .4],
] as const;

type Plane = readonly [number, number, number, number]; // n · p <= d
type Volume = readonly Plane[];
type Footprint = readonly [number, number, number, number];
type Point = Pick<Vector3, 'x'|'y'|'z'>;
export interface VillageHut {
  ox: number; oy: number; oz: number; cos: number; sin: number; bound: number;
  solids: Volume[]; walk: Footprint[];
}
type Block = { path: string; position: [number,number,number]; scale: number };
export interface VillageObstacle { position: [number,number,number]; radius: number; hut?: VillageHut }

const box = (x0:number, x1:number, y0:number, y1:number, z0:number, z1:number): Plane[] => [
  [-1,0,0,-x0], [1,0,0,x1], [0,-1,0,-y0], [0,1,0,y1], [0,0,-1,-z0], [0,0,1,z1],
];

export function createVillageObstacle({path, position, scale:s}: Block): VillageObstacle {
  const [ox,oy,oz] = position;
  const v = villageStructureVariant(path), yaw = villageHutYaw(path, ox, oz);
  const [w,d,h,r] = HUT_PROFILES[v];
  const x=w*s/2, z=d*s/2, e=h*1.16*s, roofSpan=x+.25*s, slope=r*s/roofSpan;
  const ridge=e+r*s;
  // Closed back/side walls and woven gables. The doorway is a shallow inset
  // ending in an opaque interior panel, not a tunnel through the house.
  const enclosure = box(-x-.02*s,x+.02*s,-.15*s,ridge+.035*s,-z-.022*s,z+.022*s);
  enclosure.push([slope,1,0,ridge+.035*s],[-slope,1,0,ridge+.035*s]);
  const solids: Volume[] = [enclosure, box(-x-.09*s,x+.09*s,-.23*s,-.10*s,-z-.11*s,z+.11*s)];
  const walk: Footprint[] = [[-x-.09*s,x+.09*s,-z-.37*s,z+.11*s]];
  // Thin pitched eaves; preserve the clear air under the overhang.
  for (const side of [-1,1]) {
    const roof = box(side < 0 ? -roofSpan : 0, side < 0 ? 0 : roofSpan,
      e-.06*s,ridge+.12*s,-z-.28*s,z+.28*s);
    roof.push([side*slope,1,0,ridge+.11*s],[-side*slope,-1,0,-ridge+.04*s]);
    solids.push(roof);
  }
  if (v === 3) {
    const shelter = box(.47*s,1.04*s,.56*s,.74*s,-.585*s,.605*s);
    const k = Math.tan(.18), intercept = (.65+.75*k)*s;
    shelter.push([k,1,0,intercept+.03*s],[-k,-1,0,-intercept+.03*s]);
    solids.push(shelter);
    walk.push([.49*s,1.02*s,-.48*s,.50*s]);
  }
  return {position, radius:Math.max(.62,s*.74), hut:{
    ox,oy,oz,cos:Math.cos(yaw),sin:Math.sin(yaw),bound:s*1.6,solids,walk,
  }};
}

function outside(h: VillageHut, ax:number, az:number, bx:number, bz:number, padding=0) {
  const b=h.bound+padding;
  return Math.max(ax,bx)<h.ox-b || Math.min(ax,bx)>h.ox+b
    || Math.max(az,bz)<h.oz-b || Math.min(az,bz)>h.oz+b;
}

/** Exact first contact along a segment, including when its origin is in a wall. */
export function segmentVillageHut(h: VillageHut, a: Point, b: Point) {
  if (outside(h,a.x,a.z,b.x,b.z)) return null;
  const x=h.cos*(a.x-h.ox)-h.sin*(a.z-h.oz), z=h.sin*(a.x-h.ox)+h.cos*(a.z-h.oz);
  const y=a.y-h.oy, dx=h.cos*(b.x-a.x)-h.sin*(b.z-a.z);
  const dz=h.sin*(b.x-a.x)+h.cos*(b.z-a.z), dy=b.y-a.y;
  let nearest: number | null = null;
  for (const volume of h.solids) {
    let lo=0, hi=nearest ?? 1;
    for (const [nx,ny,nz,d] of volume) {
      const remaining=d-(nx*x+ny*y+nz*z), rate=nx*dx+ny*dy+nz*dz;
      if (Math.abs(rate)<1e-9) { if (remaining < -1e-8) { hi=-1; break; } }
      else if (rate>0) hi=Math.min(hi,remaining/rate);
      else lo=Math.max(lo,remaining/rate);
      if (hi<lo) break;
    }
    if (lo<=hi) { nearest=lo; if (lo===0) break; }
  }
  return nearest;
}

export function villageBlocksSight(a: Point,b: Point, obstacles: readonly VillageObstacle[]) {
  for (const obstacle of obstacles) if (obstacle.hut && segmentVillageHut(obstacle.hut,a,b)!==null) return true;
  return false;
}

/** Check the animated socket as well as the sightline. A muzzle protruding
 * through a wall must not launch a projectile from the far side. */
export function villageBlocksRifle(origin: Point, muzzle: Point, target: Point, obstacles: readonly VillageObstacle[]) {
  return villageBlocksSight(origin,muzzle,obstacles) || villageBlocksSight(muzzle,target,obstacles);
}

/** Continuous infantry clearance in the horizontal plane. Tests the entire
 * bound, not just its endpoints; tank navigation deliberately does not use it. */
export function villageBlocksWalk(ax:number,az:number,bx:number,bz:number,
  obstacles:readonly VillageObstacle[], pad=.30) {
  for (const {hut:h} of obstacles) {
    if (!h || outside(h,ax,az,bx,bz,pad*1.42)) continue;
    const x=h.cos*(ax-h.ox)-h.sin*(az-h.oz), z=h.sin*(ax-h.ox)+h.cos*(az-h.oz);
    const dx=h.cos*(bx-ax)-h.sin*(bz-az), dz=h.sin*(bx-ax)+h.cos*(bz-az);
    for (const [x0,x1,z0,z1] of h.walk) {
      let lo=0, hi=1;
      if (Math.abs(dx)<1e-9) { if (x<x0-pad || x>x1+pad) continue; }
      else { const a=(x0-pad-x)/dx,b=(x1+pad-x)/dx; lo=Math.max(lo,Math.min(a,b)); hi=Math.min(hi,Math.max(a,b)); }
      if (Math.abs(dz)<1e-9) { if (z<z0-pad || z>z1+pad) continue; }
      else { const a=(z0-pad-z)/dz,b=(z1+pad-z)/dz; lo=Math.max(lo,Math.min(a,b)); hi=Math.min(hi,Math.max(a,b)); }
      if (lo<=hi) return true;
    }
  }
  return false;
}

// A bounded, infrequent local query, not a navigation rebuild when a file falls.
// Production callers supply the rendered sector's exact river. Isolated
// component fixtures without a level use the default seeded landscape.
const defaultNavigationRiver=createRiverStations(1968);
const bridgeClearance = new WeakMap<RiverStation[], ReturnType<typeof createBridgePlantExclusion>>();
export function safeVillageLeg(ax:number,az:number,bx:number,bz:number,obstacles:readonly VillageObstacle[],navigationRiver:RiverStation[]=defaultNavigationRiver) {
  if (!isInsideArena(bx,bz,.6) || villageBlocksWalk(ax,az,bx,bz,obstacles,.34)) return false;
  let bridge=bridgeClearance.get(navigationRiver);
  if (!bridge) { bridge=createBridgePlantExclusion(navigationRiver); bridgeClearance.set(navigationRiver,bridge); }
  const dx=bx-ax,dz=bz-az,rr=dx*dx+dz*dz;
  for(const obstacle of obstacles){
    if(obstacle.hut)continue;
    const [x,,z]=obstacle.position,t=rr?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/rr)):0;
    if((x-ax-t*dx)**2+(z-az-t*dz)**2<(obstacle.radius+.29)**2)return false;
  }
  const steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/.55));
  for (let i=1;i<=steps;i++) {
    const x=ax+(bx-ax)*i/steps, z=az+(bz-az)*i/steps;
    if (intersectsTerrainMound(x,z,.30) || isInsideRiverCorridor(x,z,navigationRiver,.65) || bridge(x,z,.36)) return false;
  }
  return true;
}

/** Find a reachable lane beside the first screening hut. Evaluate its projected
 * width at the actual crossing depth; a uniform sideways shuffle is too short
 * for most houses. Also consider expanded corners for soldiers next to a wall.
 * The resulting movement uses the live actor rig, not teleportation. */
export function chooseVillageWaypoint(origin:Point, target:Point, homeX:number, homeZ:number,
  obstacles:readonly VillageObstacle[], preferSide:number, river:RiverStation[]=defaultNavigationRiver) {
  let t=1, wall:VillageHut | null=null;
  for (const obstacle of obstacles) {
    if (!obstacle.hut) continue;
    const hit=segmentVillageHut(obstacle.hut,origin,target);
    if (hit!==null && hit<t) { wall=obstacle.hut; t=hit; }
  }
  if (!wall) return null;
  const dx=target.x-origin.x, dz=target.z-origin.z, length=Math.hypot(dx,dz);
  if (length<.01) return null;
  const rx=dz/length, rz=-dx/length;
  const candidates:{x:number;y:number;z:number}[]=[];
  let extentMin=Infinity,extentMax=-Infinity;
  for (const [x0,x1,z0,z1] of wall.walk) for (const x of [x0-.5,x1+.5]) for (const z of [z0-.5,z1+.5]) {
    const wx=wall.ox+wall.cos*x+wall.sin*z,wz=wall.oz-wall.sin*x+wall.cos*z;
    const projection=(wx-origin.x)*rx+(wz-origin.z)*rz;
    extentMin=Math.min(extentMin,projection); extentMax=Math.max(extentMax,projection);
    candidates.push({x:wx,y:origin.y,z:wz});
  }
  const centerT=Math.min(.90,Math.max(t,((wall.ox-origin.x)*dx+(wall.oz-origin.z)*dz)/(length*length)));
  for (const sign of [preferSide,-preferSide]) for (const extra of [.18,.75]) {
    const offset=((sign>0 ? extentMax : extentMin)+sign*extra)/(1-centerT);
    candidates.push({x:origin.x+rx*offset,y:origin.y,z:origin.z+rz*offset});
  }
  let best: Point | null=null,bestCost=Infinity;
  for (const p of candidates) {
    const dist=Math.hypot(p.x-origin.x,p.z-origin.z);
    if (dist<.22 || dist>7 || Math.hypot(p.x-homeX,p.z-homeZ)>7
      || !safeVillageLeg(origin.x,origin.z,p.x,p.z,obstacles,river)
      || villageBlocksSight(p,target,obstacles)) continue;
    const side=(p.x-origin.x)*rx+(p.z-origin.z)*rz;
    const cost=dist+(side*preferSide<0?.18:0);
    if (cost<bestCost) { best=p; bestCost=cost; }
  }
  return best;
}
