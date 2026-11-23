import { ROAD_GRID_SPACING } from './constants';

export interface TerrainMound {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotation: number;
}

interface TerrainMoundCollisionData {
  mound: TerrainMound;
  cosine: number;
  sine: number;
  baseRadiusX: number;
  baseRadiusZ: number;
}

interface TerrainCollisionIndex {
  cells: TerrainMoundCollisionData[][];
  minCellX: number;
  maxCellX: number;
  minCellZ: number;
  maxCellZ: number;
  width: number;
  minBaseRadius: number;
  maxBaseRadius: number;
}

const TERRAIN_COLLISION_CELL_SIZE = 16;
const TERRAIN_COLLISION_BOUND_EPSILON = 1e-12;

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 91.719 + salt * 17.173) * 43758.5453;
  return value - Math.floor(value);
}

function distanceToRoad(value: number) {
  const half = ROAD_GRID_SPACING * 0.5;
  return Math.abs(((value + half) % ROAD_GRID_SPACING + ROAD_GRID_SPACING) % ROAD_GRID_SPACING - half);
}

function createTerrainMounds(): TerrainMound[] {
  const placements: TerrainMound[] = [
    { x: -15, y: -0.72, z: -5, sx: 4.8, sy: 1.35, sz: 3.4, rotation: 0.3 },
    { x: 15, y: -0.78, z: 5, sx: 4.2, sy: 1.25, sz: 4.8, rotation: 1.1 },
    { x: -16, y: -0.82, z: 15, sx: 5.4, sy: 1.4, sz: 4.2, rotation: 0.7 },
    { x: 16, y: -0.74, z: -5, sx: 4.5, sy: 1.3, sz: 3.8, rotation: 2.2 },
  ];
  let candidate = 0;

  while (placements.length < 42 && candidate < 1000) {
    const x = (seeded(candidate, 80) - 0.5) * 176;
    const z = (seeded(candidate, 81) - 0.5) * 176;
    candidate += 1;
    if (Math.hypot(x, z) < 24) continue;
    if (distanceToRoad(x) < 2.7 || distanceToRoad(z) < 2.7) continue;
    const sx = 3.5 + seeded(candidate, 82) * 6.5;
    const sy = 0.7 + seeded(candidate, 83) * 2.2;
    placements.push({
      x,
      y: -0.8 + sy * 0.12,
      z,
      sx,
      sy,
      sz: 3.5 + seeded(candidate, 84) * 6.5,
      rotation: seeded(candidate, 85) * Math.PI,
    });
  }

  return placements;
}

export const TERRAIN_MOUNDS = createTerrainMounds();

// The original space reservations are also used by hut placement, tank tracks
// and the hand-routed river. Keep those envelopes. INSIDE them sculpt individual
// cut banks, split spurs, and long slip-faces instead of ellipsoids. Shared
// triangle heights are the authority for foliage, rock dressing and arcade FX.
export const RELIEF_STEPS = 16;
const SIDE = RELIEF_STEPS + 1;
const FOOT = -.085;
const ramp = (a:number,b:number,x:number) => {
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);
};
function sculptBank(u:number,v:number,m:TerrainMound,i:number) {
  const r=Math.hypot(u,v), apron=1-ramp(.39,.872,r);
  if(!apron)return FOOT;
  const p=seeded(i,131)*6.28,sign=i%2?1:-1;
  const a=u*(i%3===1?-1:1), b=v*sign;
  const bend=.115*Math.sin(a*4+p)+.14*a;
  const side=b-bend;
  const worn=.12*Math.sin(8.5*a+2*b+p)+.055*Math.sin(15*a-4*b+p*1.7);
  // Four kinds of landform with distinct watershed lines. The lee face and
  // scarp have different lengths. No radial term determines the crest height.
  let section:number;
  switch(i%4){
    case 0: section=.32+.75*ramp(-.63,-.09,side)*(1-ramp(.00,.70,side))*(1-.34*ramp(.0,.72,a));break;
    case 1: section=.28+.78*(1-ramp(.025,.52,Math.abs(side+.18*a)))*(1-.47*ramp(-.55,.49,a));break;
    case 2: section=.25+.54*(1-ramp(.02,.49,Math.abs(side-.22)))+.44*(1-ramp(.0,.31,Math.abs(side+.33+.23*a)));break;
    default: section=.29+.68*ramp(-.51,-.12,side+.24*a)*(1-ramp(.2,.79,side))+.19*ramp(.20,.53,a);break;
  }
  const channel=1-ramp(.02,.19,Math.abs(a+.35*b+.14*Math.sin(5*b+p)-.26));
  const height=.29+m.sy*(i%4===0?.84:i%4===1?.93:i%4===2?.71:1.02);
  return FOOT+apron*height*Math.max(.13, section + worn*(.58+.32*b)-channel*.29*ramp(-.38,.30,b));
}
export const RELIEF_PATCHES=TERRAIN_MOUNDS.map((m,i)=>{
  const heights=new Float32Array(SIDE*SIDE);
  for(let j=0;j<SIDE;j++)for(let k=0;k<SIDE;k++)heights[j*SIDE+k]=sculptBank(k*2/RELIEF_STEPS-1,j*2/RELIEF_STEPS-1,m,i);
  return {m,heights,cs:Math.cos(m.rotation),sn:Math.sin(m.rotation),bound:Math.max(m.sx,m.sz),maxY:Math.max(...heights)};
});
type ReliefPatch = typeof RELIEF_PATCHES[number];
function patchHeight(p:ReliefPatch,gx:number,gz:number){
  if(gx<0||gx>=RELIEF_STEPS||gz<0||gz>=RELIEF_STEPS)return FOOT;
  const i=Math.floor(gx),j=Math.floor(gz),s=gx-i,t=gz-j,o=j*SIDE+i,h=p.heights;
  return s+t<=1?h[o]+s*(h[o+1]-h[o])+t*(h[o+SIDE]-h[o]):
    h[o+SIDE+1]+(1-s)*(h[o+SIDE]-h[o+SIDE+1])+(1-t)*(h[o+1]-h[o+SIDE+1]);
}
export function terrainReliefHeight(x:number,z:number){
  let y=-.075;
  for(const p of RELIEF_PATCHES){
    const dx=x-p.m.x,dz=z-p.m.z;
    if(Math.abs(dx)>p.bound||Math.abs(dz)>p.bound)continue;
    const gx=(1+(p.cs*dx-p.sn*dz)/p.m.sx)*RELIEF_STEPS*.5;
    const gz=(1+(p.sn*dx+p.cs*dz)/p.m.sz)*RELIEF_STEPS*.5;
    y=Math.max(y,patchHeight(p,gx,gz));
  }
  return y;
}

interface Point3 {x:number;y:number;z:number;}
export function firstReliefContact(a:Point3,b:Point3,best:number){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
  for(const p of RELIEF_PATCHES){
    const {m,cs,sn,bound,heights:h}=p;
    if(Math.min(a.y,b.y)>p.maxY||Math.max(a.x,b.x)<m.x-bound||Math.min(a.x,b.x)>m.x+bound
      ||Math.max(a.z,b.z)<m.z-bound||Math.min(a.z,b.z)>m.z+bound)continue;
    const x=a.x-m.x,z=a.z-m.z;
    const gx=(1+(cs*x-sn*z)/m.sx)*RELIEF_STEPS*.5,gz=(1+(sn*x+cs*z)/m.sz)*RELIEF_STEPS*.5;
    const vx=(cs*dx-sn*dz)/m.sx*RELIEF_STEPS*.5,vz=(sn*dx+cs*dz)/m.sz*RELIEF_STEPS*.5;
    if(a.y<=patchHeight(p,gx,gz))return 0;
    const x0=Math.max(0,Math.floor(Math.min(gx,gx+vx))),x1=Math.min(RELIEF_STEPS-1,Math.floor(Math.max(gx,gx+vx)));
    const z0=Math.max(0,Math.floor(Math.min(gz,gz+vz))),z1=Math.min(RELIEF_STEPS-1,Math.floor(Math.max(gz,gz+vz)));
    for(let j=z0;j<=z1;j++)for(let i=x0;i<=x1;i++){
      const o=j*SIDE+i;
      // Intersect the affine plane of each of the two visible triangles,
      // then check its cell and diagonal. A full step cannot tunnel a crest.
      for(let k=0;k<2;k++){
        const hx=k?h[o+SIDE+1]-h[o+SIDE]:h[o+1]-h[o],hz=k?h[o+SIDE+1]-h[o+1]:h[o+SIDE]-h[o];
        const plane=k?h[o+SIDE+1]+(gx-i-1)*hx+(gz-j-1)*hz:h[o]+(gx-i)*hx+(gz-j)*hz;
        const delta=dy-hx*vx-hz*vz;
        if(delta>=-1e-10)continue;
        const t=(plane-a.y)/delta;
        if(t<0||t>1||t>=best)continue;
        const s=gx+t*vx-i,v=gz+t*vz-j;
        if(s>=-1e-8&&s<=1+1e-8&&v>=-1e-8&&v<=1+1e-8&&(k?s+v>=1-1e-8:s+v<=1+1e-8))best=t;
      }
    }
  }
  return best;
}

const TERRAIN_MOUND_COLLISION_DATA: TerrainMoundCollisionData[] = TERRAIN_MOUNDS.map(mound => ({
  mound,
  cosine: Math.cos(mound.rotation),
  sine: Math.sin(mound.rotation),
  baseRadiusX: mound.sx * 0.88,
  baseRadiusZ: mound.sz * 0.88,
}));

function createTerrainCollisionIndex(data: TerrainMoundCollisionData[]): TerrainCollisionIndex {
  let minCellX = Infinity;
  let maxCellX = -Infinity;
  let minCellZ = Infinity;
  let maxCellZ = -Infinity;
  let minBaseRadius = Infinity;
  let maxBaseRadius = -Infinity;

  for (const collision of data) {
    const cellX = Math.floor(collision.mound.x / TERRAIN_COLLISION_CELL_SIZE);
    const cellZ = Math.floor(collision.mound.z / TERRAIN_COLLISION_CELL_SIZE);
    minCellX = Math.min(minCellX, cellX);
    maxCellX = Math.max(maxCellX, cellX);
    minCellZ = Math.min(minCellZ, cellZ);
    maxCellZ = Math.max(maxCellZ, cellZ);
    minBaseRadius = Math.min(minBaseRadius, collision.baseRadiusX, collision.baseRadiusZ);
    maxBaseRadius = Math.max(maxBaseRadius, collision.baseRadiusX, collision.baseRadiusZ);
  }

  const width = maxCellX - minCellX + 1;
  const height = maxCellZ - minCellZ + 1;
  const cells = Array.from(
    { length: width * height },
    () => [] as TerrainMoundCollisionData[],
  );

  for (const collision of data) {
    const cellX = Math.floor(collision.mound.x / TERRAIN_COLLISION_CELL_SIZE);
    const cellZ = Math.floor(collision.mound.z / TERRAIN_COLLISION_CELL_SIZE);
    cells[(cellZ - minCellZ) * width + cellX - minCellX].push(collision);
  }

  return {
    cells,
    minCellX,
    maxCellX,
    minCellZ,
    maxCellZ,
    width,
    minBaseRadius,
    maxBaseRadius,
  };
}

const TERRAIN_COLLISION_INDEX = createTerrainCollisionIndex(TERRAIN_MOUND_COLLISION_DATA);

function intersectsCollisionData(
  collision: TerrainMoundCollisionData,
  x: number,
  z: number,
  padding: number,
) {
  const { mound, cosine, sine, baseRadiusX, baseRadiusZ } = collision;
  const dx = x - mound.x;
  const dz = z - mound.z;
  // Inverse of Three's positive Y rotation (the rendered mound transform).
  const localX = cosine * dx - sine * dz;
  const localZ = sine * dx + cosine * dz;
  const radiusX = baseRadiusX + padding;
  const radiusZ = baseRadiusZ + padding;
  return (localX * localX) / (radiusX * radiusX)
    + (localZ * localZ) / (radiusZ * radiusZ) < 1;
}

export function intersectsTerrainMound(x: number, z: number, padding = 0.5) {
  // Retain the exhaustive path for non-finite inputs so edge-case arithmetic
  // remains identical to the original implementation.
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(padding)) {
    return TERRAIN_MOUND_COLLISION_DATA.some(collision => (
      intersectsCollisionData(collision, x, z, padding)
    ));
  }

  // A rotated ellipse always fits inside a circle whose radius is its largest
  // absolute semi-axis. Since every base radius lies between these extrema,
  // this gives a conservative lookup radius for any (including negative)
  // padding without changing the exact ellipse test below.
  const maxCollisionRadius = Math.max(
    Math.abs(TERRAIN_COLLISION_INDEX.minBaseRadius + padding),
    Math.abs(TERRAIN_COLLISION_INDEX.maxBaseRadius + padding),
  );
  const searchRadius = maxCollisionRadius
    + Math.max(1, maxCollisionRadius) * TERRAIN_COLLISION_BOUND_EPSILON;

  if (!Number.isFinite(searchRadius)) {
    return TERRAIN_MOUND_COLLISION_DATA.some(collision => (
      intersectsCollisionData(collision, x, z, padding)
    ));
  }

  const minCellX = Math.max(
    TERRAIN_COLLISION_INDEX.minCellX,
    Math.floor((x - searchRadius) / TERRAIN_COLLISION_CELL_SIZE),
  );
  const maxCellX = Math.min(
    TERRAIN_COLLISION_INDEX.maxCellX,
    Math.floor((x + searchRadius) / TERRAIN_COLLISION_CELL_SIZE),
  );
  const minCellZ = Math.max(
    TERRAIN_COLLISION_INDEX.minCellZ,
    Math.floor((z - searchRadius) / TERRAIN_COLLISION_CELL_SIZE),
  );
  const maxCellZ = Math.min(
    TERRAIN_COLLISION_INDEX.maxCellZ,
    Math.floor((z + searchRadius) / TERRAIN_COLLISION_CELL_SIZE),
  );

  if (minCellX > maxCellX || minCellZ > maxCellZ) return false;

  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const cellIndex = (cellZ - TERRAIN_COLLISION_INDEX.minCellZ)
        * TERRAIN_COLLISION_INDEX.width
        + cellX - TERRAIN_COLLISION_INDEX.minCellX;
      const candidates = TERRAIN_COLLISION_INDEX.cells[cellIndex];
      for (let index = 0; index < candidates.length; index += 1) {
        if (intersectsCollisionData(candidates[index], x, z, padding)) return true;
      }
    }
  }

  return false;
}
