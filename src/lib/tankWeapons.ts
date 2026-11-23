import { type Object3D, type Vector3 } from 'three';

// Two millimetres beyond the rendered end caps, in each recoiling gun's frame.
export const CANNON_MUZZLE_SOCKET = [0, 0, -1.442] as const;
export const MACHINE_GUN_MUZZLE_SOCKET = [0, 0.08, -1.017] as const;

export function sampleTankMuzzle(muzzle: Object3D, position: Vector3, direction: Vector3) {
  muzzle.updateWorldMatrix(true, false);
  position.setFromMatrixPosition(muzzle.matrixWorld);
  // Object3D's forward convention is +Z; these physical barrels point -Z.
  direction.set(0, 0, -1).transformDirection(muzzle.matrixWorld);
}

/** The first tracer tail starts at the muzzle, never behind it inside the hull.
 * A short bounded streak becomes visible as the round actually travels. */
export function tankTracerLength(machineGun: boolean, distanceTravelled: number) {
  return Math.min(machineGun ? 0.9 : 1.35, Math.max(0, distanceTravelled));
}
