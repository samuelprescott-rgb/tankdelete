export interface EagleStrafe {
  id: number;
  position: [number, number, number];
  /** Rotation around world Y. The local +X axis is the strafe direction. */
  rotation: number;
}

export type EagleAudioCue = 'approach' | 'guns-start' | 'guns-stop';

/** Tuned as a broad, sustained support lane rather than a single-point strike. */
export const EAGLE_STRIKE_LENGTH = 48;
export const EAGLE_STRIKE_WIDTH = 11;
export const EAGLE_STRIKE_DAMAGE = 190;
export const EAGLE_COOLDOWN_SECONDS = 16;

/** One clock keeps the flyover, gun loop, damage event, and cleanup synchronized. */
export const EAGLE_TIMELINE = {
  gunsStartSeconds: 1.1,
  impactSeconds: 2.65,
  gunsStopSeconds: 4.4,
  exitSeconds: 6.4,
  cleanupSeconds: 6.55,
} as const;
