import {getUSFightingPositions} from './combat';
import type {FootprintLine} from './infantryPatrol';

// Stow loose supplies beside the outer end of the sandbags, not on the
// floor of the manned pocket. The inner road, crew posts and guards stay put.
type Post={position:readonly number[];rotation:number;width:number};
export const KIT_BOX={width:.48,height:.28,depth:.35,lidWidth:.50,lidDepth:.37,yaw:-.08} as const;
export function fieldKitPlacement(post:Post){
  const x=(post.position[0]<0?-1:1)*(post.width*.5+.56);
  return {crate:[x,.14,-.36] as [number,number,number],can:[x,.08,-1.04] as [number,number,number]};
}

// Outside edge of the prop plus room for a loaded/kneeling actor's boots as
// the actor turns. Tested against rendered boot vertices, not only root points.
const BOOT_ROOM=.60;
export function fieldSupplyFootprints(offsetZ:number):FootprintLine[]{
  return getUSFightingPositions(offsetZ).flatMap(post=>{
    const {crate,can}=fieldKitPlacement(post);
    const line=(p:readonly number[],angle:number,halfLength:number,depth:number):FootprintLine=>{
      const c=Math.cos(post.rotation),s=Math.sin(post.rotation);
      const x=post.position[0]+c*p[0]+s*p[2],z=post.position[2]-s*p[0]+c*p[2];
      const dx=Math.cos(post.rotation+angle)*halfLength,dz=-Math.sin(post.rotation+angle)*halfLength;
      return {ax:x-dx,az:z-dz,bx:x+dx,bz:z+dz,radius:depth+BOOT_ROOM};
    };
    return [line(crate,KIT_BOX.yaw,KIT_BOX.lidWidth/2,KIT_BOX.lidDepth/2),line(can,.16,.17,.11)];
  });
}

export function fieldBagFootprints(defenseOffsetZ:number):FootprintLine[]{
  return getUSFightingPositions(defenseOffsetZ).flatMap(({position:[x,,z],rotation:r,width:w})=>{
    const c=Math.cos(r),s=Math.sin(r);
    const line=(ax:number,az:number,bx:number,bz:number):FootprintLine=>({ax:x+c*ax+s*az,az:z-s*ax+c*az,
      bx:x+c*bx+s*bz,bz:z-s*bx+c*bz,radius:.31});
    return [line(-w/2,0,w/2,0),line(-w/2,-.25,-w/2,-1.10),line(w/2,-.25,w/2,-1.10)];
  });
}
