// Three yaw is a rotation about +Y; the top of the radar is hull-local -Z.
// Reuse the result object so radar redraws allocate nothing per contact.
export function setRadarOffset(out:{x:number;y:number},dx:number,dz:number,cosYaw:number,sinYaw:number) {
  out.x=cosYaw*dx-sinYaw*dz;
  out.y=sinYaw*dx+cosYaw*dz;
}
