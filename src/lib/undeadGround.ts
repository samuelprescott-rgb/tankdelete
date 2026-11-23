import type { TankGroundProfile } from './tankGroundProfile';

// The defensive plaza is a hard slab over the terrain, whereas the river
// is open water: infantry stand on its bed, not on the reflection plane.
// A board or bank higher than the slab remains valid foot support.
export function undeadSupportY(profile: TankGroundProfile, x: number, z: number) {
  const floor = profile.height(x, z);
  return Math.abs(x) <= 14.5 && z >= -30 && z <= -13 ? Math.max(.033, floor) : floor;
}
