import * as THREE from 'three';
import {liftGrassHeight} from '../../lib/embassyLift';

// The lost cinema's service road skirts the back of the eastern paddy, then
// runs out into the trees. This stretch has no raised terrain or water; the
// paint sits on the existing soil, not a raised deck. No navigation uses it.
const near = 16.5, far = 42, width = 3.15;
function centerZ(x: number) {
  return 8.1 + (x - near) * .65 + .40 * Math.sin((x-near)*.24);
}
export function trackWear(x: number, z: number) {
  if (x <= near || x >= far) return 0;
  const edge = Math.abs(z-centerZ(x)) / width;
  return (1-THREE.MathUtils.smoothstep(edge,.61,1))
    * THREE.MathUtils.smoothstep(x,near,near+2.6)
    * (1-THREE.MathUtils.smoothstep(x,far-3.8,far));
}
// A single foot-worn cut follows the western toe of the checkpoint mound,
// through two eastern rice beds and out onto the lane nearest Dispatch.
// Wrinkles along the edge keep a few tufts upright; never remove the roots.
export function paddyCrossingHeight(x:number,z:number) {
  const bay=liftGrassHeight(x,z);
  if(x<6.6 || x>16.6 || z<=-12.6 || z>=11.4) return bay;
  const center=9.00+.37*Math.sin(.57*z)+Math.max(0,z-1.7)*.61;
  const halfWidth=1.13+.13*Math.sin(.91*z+.45);
  const edge=Math.abs(x-center)/halfWidth;
  const wear=(1-THREE.MathUtils.smoothstep(edge,.50,1.50))
    *THREE.MathUtils.smoothstep(z,-12.6,-10.9)*(1-THREE.MathUtils.smoothstep(z,9.9,11.4));
  return Math.min(bay,1-.84*wear);
}
export function trackGrassHeight(x:number,z:number) {
  return Math.min(1-.83*trackWear(x,z),paddyCrossingHeight(x,z));
}

export function createEmbassyServiceTrack() {
  const xyz:number[]=[], rgba:number[]=[], indices:number[]=[];
  const soil=new THREE.Color('#998b73'), shell=new THREE.Color('#c0ae8e');
  const damp=new THREE.Color('#85745c'), mix=new THREE.Color();
  const columns=[-1,-.84,-.61,-.45,-.34,-.18,.05,.31,.42,.56,.73,1];
  const rows=36;
  for (let j=0;j<=rows;j++) {
    const t=j/rows, x=near+(far-near)*t;
    const shoulder=width*(.94+.06*Math.sin(t*11.7));
    for(const [i,u] of columns.entries()) {
      const drift=.10*Math.sin(j*.65+u*2)+.095*Math.cos(j*.33-u*3);
      const z=centerZ(x)+u*(shoulder+Math.abs(u)*drift);
      // Dragged pale aggregate, two dark compacted grooves and cooler broken
      // verges. No hard boundary, repeated white dashes or emissive pigment.
      const groove=Math.exp(-(((Math.abs(u)-.415)/.13)**2));
      const scuff=.54+.20*Math.sin(j*.31+u*1.4)+.13*Math.sin(j*.87+u*4);
      mix.copy(soil).lerp(shell,scuff).lerp(damp,groove*.59);
      const feather=(1-THREE.MathUtils.smoothstep(Math.abs(u),.63,1))
        * THREE.MathUtils.smoothstep(t,0,.135)*(1-THREE.MathUtils.smoothstep(t,.81,1));
      xyz.push(x,-.063,z); rgba.push(mix.r,mix.g,mix.b,.84*feather);
      if(i>0 && j>0) {
        const d=j*columns.length+i, a=d-columns.length-1;
        indices.push(a,a+1,d, a,d,d-1);
      }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(rgba,4));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
