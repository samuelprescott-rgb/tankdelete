export type PickupKind='patch'|'plate';
export type PickupMode='village'|'embassy';
export type FieldPickup={kind:PickupKind;x:number;z:number;atKills:number};
export const PATCH_HP=22, PLATE_HP=16, PICKUP_RADIUS=2.0;
// Road shoulders and embassy service courtyard, away from spawn, huts and the archive console.
export const FIELD_PICKUPS:Record<PickupMode, readonly FieldPickup[]>={
  village:[{kind:'patch',x:-2.5,z:5.5,atKills:0},{kind:'plate',x:2.5,z:28.5,atKills:5}],
  embassy:[{kind:'plate',x:-6.4,z:-7,atKills:0},{kind:'patch',x:5.8,z:-11.2,atKills:8}],
};
export function collectSupply(kind:PickupKind,hp:number,plate:number){
  if(hp<=0 || (kind==='patch'?hp>=100:plate>0))return null;
  return kind==='patch'?{hp:Math.min(100,hp+PATCH_HP),plate}:{hp,plate:PLATE_HP};
}
export function splitFieldDamage(damage:number,plate:number){
  const absorbed=Math.min(Math.max(0,damage),Math.max(0,plate));
  return {plate:Math.max(0,plate-absorbed),hull:Math.max(0,damage-absorbed)};
}
