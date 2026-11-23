import { TANK_GROUND_Y, type TankGroundProfile } from './tankGroundProfile';

/** Visual terrain following, not a rigid-body or drivetrain simulation. */
export const TANK_SUSPENSION = Object.freeze({
  halfTrack: 0.76,
  stations: [-0.86, -0.60, -0.36, -0.12, 0.12, 0.36, 0.60, 0.86] as readonly number[],
  hullResponse: 13,
  wheelResponse: 38,
  maxPitchRoll: 0.12,
  maxCompression: 0.14,
  maxExtension: 0.12,
  contactHalfLength: 0.075,
  // Arcade load transfer: enough to read at chase distance, never enough
  // to break ground contact or change the movement/steering footprint.
  surgePitch: .017,
  cornerRoll: .019,
  settleEpsilon: 0.000015,
});

export function createTankSuspension(lengthScale: number) {
  return {
    lengthScale,
    stationZ: Float64Array.from(TANK_SUSPENSION.stations, z => z * lengthScale),
    heights: new Float64Array(16),
    travel: new Float64Array(16),
    velocity: new Float64Array(16),
    heave: 0, pitch: 0, roll: 0,
    heaveVelocity: 0, pitchVelocity: 0, rollVelocity: 0,
    x: 0, z: 0, yaw: 0, surge: 0, corner: 0,
    initialized: false, settled: false, version: 0,
  };
}
export type TankSuspension = ReturnType<typeof createTankSuspension>;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Critically damped exact step for a fixed target, invariant to 30/60/120 Hz. */
function dampPosition(value: number, velocity: number, target: number, response: number, dt: number) {
  const error = value - target;
  return target + (error + (velocity + response * error) * dt) * Math.exp(-response * dt);
}
function dampVelocity(value: number, velocity: number, target: number, response: number, dt: number) {
  const impulse = velocity + response * (value - target);
  return (velocity - response * impulse * dt) * Math.exp(-response * dt);
}

/** Reuses its sixteen contact samples; heading/collision remain owned by Tank. */
export function stepTankSuspension(state: TankSuspension, ground: TankGroundProfile,
  x: number, z: number, yaw: number, delta: number, surge = 0, corner = 0) {
  surge = Number.isFinite(surge) ? clamp(surge, -2, 2) : 0;
  corner = Number.isFinite(corner) ? clamp(corner, -1, 1) : 0;
  if (state.initialized && state.settled && x === state.x && z === state.z && yaw === state.yaw
    && state.surge === surge && state.corner === corner) return false;
  const dt = Number.isFinite(delta) ? clamp(delta, 0, 0.1) : 0;
  const c = Math.cos(yaw), s = Math.sin(yaw), halfTrack = TANK_SUSPENSION.halfTrack;
  const patchX = s * TANK_SUSPENSION.contactHalfLength, patchZ = c * TANK_SUSPENSION.contactHalfLength;
  let sum = 0, sumX = 0, sumZ = 0, squaredZ = 0;
  for (let side = 0; side < 2; side++) {
    const localX = side === 0 ? -halfTrack : halfTrack;
    for (let station = 0; station < 8; station++) {
      const localZ = state.stationZ[station];
      const worldX = x + c * localX + s * localZ, worldZ = z - s * localX + c * localZ;
      // The shoe's short footprint spans board seams; do not sink into a 5mm gap.
      const height = Math.max(ground.height(worldX, worldZ),
        ground.height(worldX + patchX, worldZ + patchZ), ground.height(worldX - patchX, worldZ - patchZ));
      state.heights[side * 8 + station] = height;
      sum += height; sumX += localX * height; sumZ += localZ * height; squaredZ += localZ * localZ;
    }
  }
  const heave = sum / 16 - TANK_GROUND_Y;
  const reset = !state.initialized || Math.hypot(x - state.x, z - state.z) > 3;
  // Bow rises as the tracks take load, dips on braking; outside wheels
  // compress only if the tank is actually translating through a turn.
  if (reset) { surge = 0; corner = 0; }
  const pitch = clamp(-Math.atan(sumZ / squaredZ) + surge*TANK_SUSPENSION.surgePitch,
    -TANK_SUSPENSION.maxPitchRoll, TANK_SUSPENSION.maxPitchRoll);
  const roll = clamp(Math.atan(sumX / (16 * halfTrack * halfTrack)) - corner*TANK_SUSPENSION.cornerRoll,
    -TANK_SUSPENSION.maxPitchRoll, TANK_SUSPENSION.maxPitchRoll);
  state.surge = surge; state.corner = corner;
  const previousHeave = state.heave, previousPitch = state.pitch, previousRoll = state.roll;
  let changed = reset;
  if (reset) {
    state.heave = heave; state.pitch = pitch; state.roll = roll;
    state.heaveVelocity = state.pitchVelocity = state.rollVelocity = 0;
  } else {
    const nextHeave = dampPosition(state.heave, state.heaveVelocity, heave, TANK_SUSPENSION.hullResponse, dt);
    const nextPitch = dampPosition(state.pitch, state.pitchVelocity, pitch, TANK_SUSPENSION.hullResponse, dt);
    const nextRoll = dampPosition(state.roll, state.rollVelocity, roll, TANK_SUSPENSION.hullResponse, dt);
    state.heaveVelocity = dampVelocity(state.heave, state.heaveVelocity, heave, TANK_SUSPENSION.hullResponse, dt);
    state.pitchVelocity = dampVelocity(state.pitch, state.pitchVelocity, pitch, TANK_SUSPENSION.hullResponse, dt);
    state.rollVelocity = dampVelocity(state.roll, state.rollVelocity, roll, TANK_SUSPENSION.hullResponse, dt);
    state.heave = nextHeave; state.pitch = nextPitch; state.roll = nextRoll;
  }
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch), cr = Math.cos(state.roll), sr = Math.sin(state.roll);
  let unsettled = Math.abs(heave - state.heave) + Math.abs(pitch - state.pitch) + Math.abs(roll - state.roll)
    + Math.abs(state.heaveVelocity) + Math.abs(state.pitchVelocity) + Math.abs(state.rollVelocity);
  for (let side = 0; side < 2; side++) {
    const localX = side === 0 ? -halfTrack : halfTrack;
    for (let station = 0; station < 8; station++) {
      const index = side * 8 + station;
      const previousTravel = state.travel[index];
      const planeY = cp * sr * localX - sp * state.stationZ[station];
      const target = clamp((state.heights[index] - state.heave - planeY) / (cp * cr) - TANK_GROUND_Y,
        -TANK_SUSPENSION.maxExtension, TANK_SUSPENSION.maxCompression);
      if (reset) { state.travel[index] = target; state.velocity[index] = 0; }
      else {
        const next = dampPosition(state.travel[index], state.velocity[index], target, TANK_SUSPENSION.wheelResponse, dt);
        state.velocity[index] = dampVelocity(state.travel[index], state.velocity[index], target, TANK_SUSPENSION.wheelResponse, dt);
        state.travel[index] = next;
      }
      unsettled += Math.abs(target - state.travel[index]) + Math.abs(state.velocity[index]);
      if (Math.abs(state.travel[index] - previousTravel) > 1e-8) changed = true;
    }
  }
  state.x = x; state.z = z; state.yaw = yaw; state.initialized = true;
  state.settled = unsettled < TANK_SUSPENSION.settleEpsilon;
  changed ||= Math.abs(state.heave - previousHeave) + Math.abs(state.pitch - previousPitch)
    + Math.abs(state.roll - previousRoll) > 1e-8;
  if (changed) state.version++;
  return changed;
}

function lowerTravel(state: TankSuspension, side: number, z: number) {
  const offset = side * 8;
  if (z <= state.stationZ[0]) return state.travel[offset];
  for (let station = 0; station < 7; station++) {
    if (z > state.stationZ[station + 1]) continue;
    const t = (z - state.stationZ[station]) / (state.stationZ[station + 1] - state.stationZ[station]);
    return state.travel[offset + station] * (1 - t) + state.travel[offset + station + 1] * t;
  }
  return state.travel[offset + 7];
}

/** The lower carrier follows stations; the upper return stays taut between ends. */
export function trackSuspensionOffset(state: TankSuspension, side: number, z: number, y: number, radius: number) {
  const t = clamp((z - state.stationZ[0]) / (state.stationZ[7] - state.stationZ[0]), 0, 1);
  const upper = state.travel[side * 8] * (1 - t) + state.travel[side * 8 + 7] * t;
  const lowerWeight = clamp((radius - y) / (2 * radius), 0, 1);
  return upper * (1 - lowerWeight) + lowerTravel(state, side, z) * lowerWeight;
}

export interface SuspendedTrackPose { y: number; z: number; angle: number }
/** Caller-owned pose avoids allocating 128 temporary objects every frame. */
export function sampleSuspendedTrackPose(out: SuspendedTrackPose, state: TankSuspension,
  side: number, distance: number, radius: number) {
  const run = 1.72 * state.lengthScale, half = run / 2, loop = run * 2 + Math.PI * 2 * radius;
  let d = ((distance % loop) + loop) % loop, y: number, z: number, angle: number;
  if (d < run) { z = -half + d; y = radius; angle = 0; }
  else if ((d -= run) < Math.PI * radius) {
    angle = d / radius; z = half + Math.sin(angle) * radius; y = Math.cos(angle) * radius;
  } else if ((d -= Math.PI * radius) < run) { z = half - d; y = -radius; angle = Math.PI; }
  else { angle = Math.PI + (d - run) / radius; z = -half - Math.sin(angle - Math.PI) * radius; y = Math.cos(angle) * radius; }
  const offset = trackSuspensionOffset(state, side, z, y, radius);
  // Differentiate the deformation along the original path for shoe orientation.
  const dz = Math.cos(angle) * 0.001, dy = -Math.sin(angle) * 0.001;
  const slope = (trackSuspensionOffset(state, side, z + dz, y + dy, radius)
    - trackSuspensionOffset(state, side, z - dz, y - dy, radius)) / 0.002;
  out.y = y + offset; out.z = z;
  out.angle = Math.atan2(Math.sin(angle) - slope, Math.cos(angle));
  return out;
}
