// Authored arcade weight: input moves the tank on its first frame, then pulls
// up to the unchanged 8u/s chase speed over 720ms. Releasing coasts 1.28 units
// from full speed; deliberate reverse input brakes harder for an escape turn.
// Modal, focus, teleport and collision stops still clear momentum immediately.
export const DRIVE_ENVELOPE = { rise: 0.720, release: 0.320, reverseBrake: 0.180 } as const;
export const PIVOT_ENVELOPE = { rise: 0.140, release: 0.042, reverseBrake: 0.060 } as const;
const MAX_DRIVE_DELTA = 0.25;
// Game animation only: a half-turn takes about one second. A stalled frame
// cannot skip through a whole flank on resume. Exact arrival leaves no jitter
// or dead zone when the pointer is close to its previous heading.
export const TURRET_TRAVERSE_RATE = Math.PI;
export function stepTurretYaw(yaw: number, target: number, delta: number) {
  const error = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  const max = TURRET_TRAVERSE_RATE * (Number.isFinite(delta) ? Math.min(Math.max(0, delta), .10) : 0);
  return yaw + Math.min(max, Math.max(-max, error));
}

export const TURRET_SWEEP_EVENT = 'tankdelete:turret-sweep';

interface Envelope { rise: number; release: number; reverseBrake: number }
const REST = { rate: 0, travel: 0 } as const;

/**
 * Integrate the area under a piecewise-linear rate curve, including the portion
 * of a frame spent stopped or cruising. During a reversal, brake to zero first
 * and spend only the remaining time accelerating in the new direction.
 */
export function stepDriveAxis(rate: number, input: number, delta: number, envelope: Envelope) {
  const target = Math.sign(input);
  let time = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_DRIVE_DELTA) : 0;
  if (rate === 0 && target === 0) return REST;
  let travel = 0;
  if (rate * target < 0) {
    const brakingTime = Math.abs(rate) * envelope.reverseBrake;
    const step = Math.min(time, brakingTime);
    const next = step >= brakingTime ? 0 : rate - Math.sign(rate) * step / envelope.reverseBrake;
    travel = (rate + next) * 0.5 * step;
    time -= step;
    rate = next;
  }
  const ramp = target === 0 ? envelope.release : envelope.rise;
  const rampTime = Math.abs(target - rate) * ramp;
  const step = Math.min(time, rampTime);
  const next = step >= rampTime ? target : rate + Math.sign(target - rate) * step / ramp;
  travel += (rate + next) * 0.5 * step + next * (time - step);
  return { rate: next, travel };
}

// Track physical codes rather than just actions: W + Up remains forward when
// one alias is released. Clearing cannot leave behind a stale held action.
const driveCodes = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
export function createDriveKeys() {
  const held = new Set<string>();
  return {
    press(code: string, repeat: boolean) {
      if (!repeat && driveCodes.has(code)) held.add(code);
    },
    release(code: string) { held.delete(code); },
    clear() { held.clear(); },
    get forward() { return held.has('KeyW') || held.has('ArrowUp'); },
    get backward() { return held.has('KeyS') || held.has('ArrowDown'); },
    get left() { return held.has('KeyA') || held.has('ArrowLeft'); },
    get right() { return held.has('KeyD') || held.has('ArrowRight'); },
  };
}
