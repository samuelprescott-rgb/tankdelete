export interface CircleTankCollider {
  kind: 'circle';
  id: string;
  x: number;
  z: number;
  radius: number;
}

export interface CapsuleTankCollider {
  kind: 'capsule';
  id: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  radius: number;
}

/**
 * Low-cost ground-plane collision volumes for scenery the tank cannot cross.
 * Capsules are useful for sandbag walls, fallen trees, and long wreck sections;
 * circles cover huts, crates, and compact vehicle bodies.
 */
export type TankCollider = CircleTankCollider | CapsuleTankCollider;

/**
 * Tests a circular tank footprint against a small set of authored primitives.
 * The implementation deliberately uses scalar math only so it is safe to call
 * several times per frame while resolving low-frame-rate movement substeps.
 */
export function intersectsTankColliders(
  x: number,
  z: number,
  tankRadius: number,
  colliders: readonly TankCollider[],
) {
  for (let index = 0; index < colliders.length; index += 1) {
    const collider = colliders[index];
    const combinedRadius = Math.max(0, tankRadius) + Math.max(0, collider.radius);

    if (collider.kind === 'circle') {
      const dx = x - collider.x;
      const dz = z - collider.z;
      if (dx * dx + dz * dz <= combinedRadius * combinedRadius) return true;
      continue;
    }

    const segmentX = collider.bx - collider.ax;
    const segmentZ = collider.bz - collider.az;
    const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    let alpha = 0;
    if (segmentLengthSquared > Number.EPSILON) {
      alpha = ((x - collider.ax) * segmentX + (z - collider.az) * segmentZ)
        / segmentLengthSquared;
      if (alpha < 0) alpha = 0;
      else if (alpha > 1) alpha = 1;
    }

    const closestX = collider.ax + segmentX * alpha;
    const closestZ = collider.az + segmentZ * alpha;
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz <= combinedRadius * combinedRadius) return true;
  }

  return false;
}
