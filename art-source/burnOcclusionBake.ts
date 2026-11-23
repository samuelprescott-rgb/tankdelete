import * as THREE from 'three';

// Authored collapsed structural members of the east bay, in compound space.
// First three are the actual fallen fins and scorched post. The low concrete
// in the outfall casts the remaining close contact shadows.
const fins=[
  [3.39,.68,-23.28,.47,1.79,.48,-.86,0],[3.88,.58,-23.06,.36,1.64,.39,-.64,0],
  [4.44,.56,-23.03,.22,1.21,.22,-.38,0],
  [3.34,.25,-22.54,.84,.14,.41,.13,-.13],
  [4.71,.12,-21.23,1.02,.16,.43,0,.65],[5.31,.13,-22.48,.80,.16,.44,0,.42],
  [3.23,.13,-21.97,.72,.16,.41,0,-.73],[4.78,.16,-23.48,1.17,.26,.63,0,.19],
  [2.82,.14,-23.15,.85,.24,.48,0,-.45],[5.72,.10,-20.62,.65,.13,.44,0,-.17],
];
// Project from three nearby embers, not from the camera; blocked samples
// give a soft penumbra on the real receiving planes. The tiny lightmap is
// generated once on first use. No dynamic shadow map or per-fragment rays.
const lamps=[[3.74,1.32,-22.27],[3.96,1.04,-22.4],[4.14,1.12,-22.32]];
const size=96;
let baked:Uint8Array<ArrayBuffer>|undefined;
export function burnOcclusionBytes(){
  if(baked)return baked;
  const bytes=new Uint8Array(size*size*2);
  const boxes=fins.map(([x,y,z,w,h,d,rz,ry])=>({x,y,z,half:[w*.50,h*.50,d*.50],
    cz:Math.cos(rz),sz:Math.sin(rz),cy:Math.cos(ry),sy:Math.sin(ry)}));
  const from=new THREE.Vector3(),to=new THREE.Vector3(),ray=new THREE.Ray(),hit=new THREE.Vector3();
  const prepared=boxes.map(b=>({bounds:new THREE.Box3(new THREE.Vector3(-b.half[0],-b.half[1],-b.half[2]),
      new THREE.Vector3(...b.half)),local:new THREE.Matrix4().compose(new THREE.Vector3(b.x,b.y,b.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.atan2(b.sy,b.cy),Math.atan2(b.sz,b.cz),'YZX')),
        new THREE.Vector3(1,1,1)).invert()}));
  for(let j=0;j<size;j++)for(let i=0;i<size;i++)for(let layer=0;layer<2;layer++){
    const u=(i+.5)/size,v=(j+.5)/size,xx=1.0+u*7.8;
    const yy=layer?.17+v*4.9:.056,zz=layer?-23.49:-24.0+v*6.7;
    let sum=0;
    for(const l of lamps){
      let occluded=false;
      for(const b of prepared){
        from.set(l[0],l[1],l[2]).applyMatrix4(b.local);to.set(xx,yy,zz).applyMatrix4(b.local);
        const length=from.distanceTo(to);
        ray.origin.copy(from);ray.direction.subVectors(to,from).normalize();
        if(ray.intersectBox(b.bounds,hit)&&hit.distanceTo(from)<length-.045){occluded=true;break;}
      }
      if(!occluded)sum++;
    }
    bytes[(j*size+i)*2+layer]=Math.round(255*sum/lamps.length);
  }
  baked=bytes;return bytes;
}
