import {BufferGeometry,Float32BufferAttribute} from 'three';
import baked from './bakedRidgeHuts.json';
import type {RoofCombustionSite} from './RidgeThatchFires';

type Point=[number,number,number];
const point=(v:number[]):Point=>[v[0],v[1],v[2]];

// Meters at archival scale. Every mesh origin is the center of its raised
// deck: group y=0 is floor height, NOT the foot tips. Baked yaw is preserved.
// Only 'deck' is an archival world-space point; bounds, feet, roof, and fire
// sockets are local to the deck, so one rigid transform keeps them together.
export const ARCHIVED_RIDGE_HUTS=baked.map(h=>({
  role:h.role,deck:point(h.deck),feet:h.feet.map(point),roof:point(h.roof),
  bounds:[point(h.bounds[0]),point(h.bounds[1])] as [Point,Point],
  fire:{breach:point(h.fire.breach),eave:point(h.fire.eave),size:h.fire.size,seed:h.fire.seed} satisfies RoofCombustionSite,
}));

const bytes=(s:string)=>new DataView(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
/** New owned geometry, with the original linear vertex paint and triangle
 * winding. Use an untextured double-sided vertex-colored basic material. */
export function createArchivedRidgeHut(index:number){
  const h=baked[index];
  if(!h)throw new RangeError('No archived hut '+index);
  const xyz=bytes(h.positions),rgb=bytes(h.colors),indices=bytes(h.triangles);
  const count=indices.byteLength/4,p=new Float32Array(count*3),c=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const pi=indices.getUint16(i*4,true)*12,ci=indices.getUint16(i*4+2,true)*12;
    for(let a=0;a<3;a++){p[i*3+a]=xyz.getFloat32(pi+a*4,true);c[i*3+a]=rgb.getFloat32(ci+a*4,true);}
  }
  const g=new BufferGeometry();g.name='archived-1608-'+h.role+'-'+index;
  g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('color',new Float32BufferAttribute(c,3));
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
