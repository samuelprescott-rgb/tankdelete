import { createRiverCrossings, distanceToRiverWater, type RiverStation } from '../components/Scene/riverLayout';
import { isInEmbassyClearing } from './embassyDefense';
import { createTankGroundProfile } from './tankGroundProfile';
import { TANK_SUSPENSION } from './tankSuspension';
import { TANK_BODY_LENGTH_SCALE } from './tankFootprint';

// Two actual shoe pitches per paint tile; the metal shoe is .262 wide.
// Mud squeezes just past its edges. 640 tiles preserve ~59 m of paired trail.
export const TREAD_TILE_STEP = (3.44 * TANK_BODY_LENGTH_SCALE + 2 * Math.PI * .197) / 32;
export const TREAD_HALF_WIDTH = .164;
export const TREAD_CAPACITY = 640;
const halfLength = TREAD_TILE_STEP * .51;
const stampRadius = Math.hypot(TREAD_HALF_WIDTH, halfLength);

export function createImprintSoil(river: RiverStation[], seed: number, embassy: boolean,
  insidePaddy: (x: number, z: number, padding: number) => boolean) {
  const profile = createTankGroundProfile(river, seed);
  const deck = createRiverCrossings(river).find(c => c.kind === 'bridge');
  // At diagonal bends distanceToRiverWater is an X (not Euclidean)
  // clearance. Bound the nearby segments once so a rotated shoe cannot
  // overhang a sharp bend without excluding the straight reaches' dry mud.
  const margins = new Float32Array(river.length);
  for (let i = 1; i < river.length; i++) {
    const a = river[i - 1], b = river[i];
    const slope = (Math.abs(b.centerX - a.centerX) + Math.abs(b.waterHalfWidth - a.waterHalfWidth)) / (b.z - a.z);
    const margin = stampRadius * Math.hypot(1, slope) + .012;
    for (let row = Math.max(0, i - 2); row <= Math.min(river.length - 1, i); row++)
      margins[row] = Math.max(margins[row], margin);
  }
  const minZ = river[0]?.z, maxZ = river[river.length - 1]?.z;
  return {
    accepts(x: number, z: number) {
      // Irregular paddy outlines live inside these authored bounds; reserve
      // their raised berm too (not part of the tank's sampled ground profile).
      if (insidePaddy(x, z, stampRadius + .16) || (embassy && isInEmbassyClearing(x, z, stampRadius))) return false;
      if (deck && Math.abs(x - deck.centerX) <= deck.width / 2 + stampRadius
        && Math.abs(z - deck.z) <= deck.length / 2 + stampRadius) return false;
      if (river.length < 2 || z < minZ - stampRadius || z > maxZ + stampRadius) return true;
      const checkZ = Math.max(minZ, Math.min(maxZ, z));
      const row = Math.floor((checkZ - minZ) / (maxZ - minZ) * (river.length - 1));
      return distanceToRiverWater(x, checkZ, river) > margins[row];
    },
    height: profile.height,
  };
}

export function createImprintState() {
  return { x: 0, z: 0, yaw: 0, ready: false, cursor: 0, count: 0, carry: new Float64Array(2) };
}
type ImprintState = ReturnType<typeof createImprintState>;
export function resetImprints(state: ImprintState) {
  state.ready = false;
  state.carry.fill(0);
  state.cursor = state.count = 0;
}
type Stamp = (slot: number, x: number, z: number, yaw: number) => void | false;

/** Independent distance clocks at the two track centers. Never use inputs,
 * velocity, turret yaw, or wheel phase: a blocked attempt leaves no paint. */
export function stepImprints(state: ImprintState, x: number, z: number, yaw: number,
  accepts: (x: number, z: number) => boolean, write: Stamp) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(yaw)) {
    resetImprints(state);
    return 0;
  }
  if (state.ready && x === state.x && z === state.z && yaw === state.yaw) return 0;
  const dx = x - state.x, dz = z - state.z;
  const turn = Math.atan2(Math.sin(yaw - state.yaw), Math.cos(yaw - state.yaw));
  let written = 0;
  if (!state.ready || dx * dx + dz * dz > 2.15 ** 2 || Math.abs(turn) > .72) {
    // Bigger than the existing drive's largest legal capped step: establish
    // a new origin, including a same-place respawn with discontinuous yaw.
    resetImprints(state);
  } else {
    // Approximate the contact arc in small angle slices, not a chord between
    // the two hull endpoints. In-place turns thus mark complementary arcs.
    const slices = Math.max(1, Math.ceil(Math.abs(turn) / .04));
    for (let side = 0; side < 2; side++) {
      const offset = (side === 0 ? -1 : 1) * TANK_SUSPENSION.halfTrack;
      let ax = state.x + Math.cos(state.yaw) * offset;
      let az = state.z - Math.sin(state.yaw) * offset;
      let carry = state.carry[side];
      for (let j = 1; j <= slices; j++) {
        const t = j / slices, localYaw = state.yaw + turn * t;
        const bx = state.x + dx * t + Math.cos(localYaw) * offset;
        const bz = state.z + dz * t - Math.sin(localYaw) * offset;
        const sx = bx - ax, sz = bz - az, length = Math.hypot(sx, sz);
        for (let at = TREAD_TILE_STEP - carry; at <= length + 1e-10 && length > 0; at += TREAD_TILE_STEP) {
          const f = Math.min(1, at / length);
          const px = ax + f * sx, pz = az + f * sz;
          if (accepts(px, pz) && write(state.cursor, px, pz, state.yaw + turn * (j - 1 + f) / slices) !== false) {
            state.cursor = (state.cursor + 1) % TREAD_CAPACITY;
            state.count = Math.min(TREAD_CAPACITY, state.count + 1);
            written++;
          }
        }
        carry = (carry + length + 1e-10) % TREAD_TILE_STEP - 1e-10;
        ax = bx; az = bz;
      }
      state.carry[side] = Math.max(0, carry);
    }
  }
  state.x = x; state.z = z; state.yaw = yaw; state.ready = true;
  return written;
}

// Corners and a central spine follow the existing mud-bank triangles. A
// ground-grain-thin bias clears the painted service lane at y=-.063.
export function writeImprintVertices(out: Float32Array, slot: number, x: number, z: number,
  yaw: number, height: (x: number, z: number) => number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let i = slot * 27;
  for (let row = -1; row <= 1; row++) for (let column = -1; column <= 1; column++) {
    const wx = x + column * TREAD_HALF_WIDTH * c + row * halfLength * s;
    const wz = z - column * TREAD_HALF_WIDTH * s + row * halfLength * c;
    out[i++] = wx;
    out[i++] = height(wx, wz) + .008;
    out[i++] = wz;
  }
}

/** A reverse pass can seat the shoe in its existing print. Coalesce recent
 * parallel contacts; endlessly circling in one spot must not ink the mud
 * black. Crossed tracks and genuine sideways shifts remain distinct. */
export function alreadyPressed(vertices: Float32Array, state: ImprintState, x: number, z: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let slot = state.cursor;
  for (let n = 0, scan = Math.min(state.count, 96); n < scan; n++) {
    slot = (slot + TREAD_CAPACITY - 1) % TREAD_CAPACITY;
    const center = slot * 27 + 12, dx = x - vertices[center], dz = z - vertices[center + 2];
    if (Math.abs(dx) > .11 || Math.abs(dz) > .11 || Math.abs(dx * c - dz * s) > .050
      || Math.abs(dx * s + dz * c) > TREAD_TILE_STEP * .515) continue;
    // Center-right vertex, exactly one half-width along the old side axis.
    const ox = vertices[center + 3] - vertices[center], oz = vertices[center + 5] - vertices[center + 2];
    if (Math.abs(ox * c - oz * s) > TREAD_HALF_WIDTH * .94) return true;
  }
  return false;
}
