/** Hull-only scale leaves turret sockets and crew anatomy unchanged. */
export const TANK_BODY_LENGTH_SCALE = 1.35;
export const TANK_FOOTPRINT = Object.freeze({ radius: .82, halfSegment: .66 });

/** Three overlapping discs cover the longer tracked hull, independent of props.
 * The caller still decides which terrain is solid; huts/cover remain traversable. */
export function tankFootprintBlocked(
  x: number, z: number, yaw: number,
  intersects: (x: number, z: number, radius: number) => boolean,
) {
  const dx=Math.sin(yaw)*TANK_FOOTPRINT.halfSegment;
  const dz=Math.cos(yaw)*TANK_FOOTPRINT.halfSegment;
  return intersects(x,z,TANK_FOOTPRINT.radius)
    || intersects(x+dx,z+dz,TANK_FOOTPRINT.radius)
    || intersects(x-dx,z-dz,TANK_FOOTPRINT.radius);
}
