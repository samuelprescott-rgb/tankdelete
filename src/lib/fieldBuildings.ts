/** Ordinary campaign scenery, separate from the simulated files and native Cleanup Desk. */
export type FieldBuilding='landing'|'radioHut';
export type FieldDamage='cannon'|'machinegun'|'napalm'|'flame';
export const BUILDING_INTEGRITY=2;
export const fieldBuildingDamage=(hp:number,kind:FieldDamage)=>Math.max(0,hp-({cannon:1,machinegun:.25,napalm:2,flame:.5}[kind]));
type Point={x:number;y:number;z:number};
/** Oriented structure volume in the art's shore-local frame, with pitched roof caps.
 * The stilt foundation can take damage even from a low, level shot underneath the floor. */
export function createLandingContact({cx,z,yaw}:{cx:number;z:number;yaw:number}){
  const co=Math.cos(yaw),si=Math.sin(yaw);
  return (start:Point,end:Point):number|null=>{
    if(Math.min(start.x,end.x)>cx+3.6||Math.max(start.x,end.x)<cx-3.6||
       Math.min(start.z,end.z)>z+3.6||Math.max(start.z,end.z)<z-3.6)return null;
    const wx=start.x-cx,wz=start.z-z,dx=end.x-start.x,dz=end.z-start.z;
    const x=wx*co-wz*si,s=wx*si+wz*co,y=start.y;
    const vx=dx*co-dz*si,vs=dx*si+dz*co,vy=end.y-y;
    let near=0,far=1;
    const clip=(offset:number,speed:number)=>{
      if(Math.abs(speed)<1e-8)return offset<=0;
      const at=-offset/speed;
      if(speed>0)far=Math.min(far,at);else near=Math.max(near,at);
      return near<=far;
    };
    if(!clip(x-2.71,vx)||!clip(-x-2.71,-vx)||!clip(s-2.05,vs)||!clip(-s-2.05,-vs)||
       !clip(.02-y,-vy)||!clip(y-4.25,vy)||
       !clip(y+.71*s-4.26,vy+.71*vs)||!clip(y-.71*s-4.26,vy-.71*vs))return null;
    return near;
  };
}
