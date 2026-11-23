/** Conservative quality steps: never exceed the existing native-resolution cap. */
export const ADAPTIVE_RESOLUTION = Object.freeze({
  levels: [0.75, 0.8, 0.9, 1] as readonly number[],
  warmupSeconds: 3,
  windowSeconds: 1,
  cooldownSeconds: 5,
  slowFrameSeconds: 1 / 48,
  fastFrameSeconds: 1 / 57,
  slowWindows: 3,
  fastWindows: 8,
  interruptionSeconds: 0.25,
});

/** Pure pacing policy, independent of React, WebGL, and wall-clock timers. */
export function createAdaptiveResolution() {
  const config = ADAPTIVE_RESOLUTION;
  let level = config.levels.length - 1;
  let settleSeconds: number = config.warmupSeconds;
  let elapsed = 0;
  let frames = 0;
  let slowWindows = 0;
  let fastWindows = 0;

  function clearWindow() {
    elapsed = 0;
    frames = 0;
  }

  function reset() {
    settleSeconds = config.warmupSeconds;
    slowWindows = 0;
    fastWindows = 0;
    clearWindow();
  }

  return {
    reset,
    /** Returns a DPR only when a sustained pacing trend warrants a change. */
    sample(delta: number): number | undefined {
      // A loading stall or resumed tab is not evidence of sustained GPU load.
      if (!Number.isFinite(delta) || delta <= 0 || delta >= config.interruptionSeconds) {
        reset();
        return;
      }
      if (settleSeconds > 0) {
        settleSeconds = Math.max(0, settleSeconds - delta);
        return;
      }

      elapsed += delta;
      frames += 1;
      if (elapsed < config.windowSeconds) return;

      const meanFrameSeconds = elapsed / frames;
      clearWindow();
      slowWindows = meanFrameSeconds > config.slowFrameSeconds ? slowWindows + 1 : 0;
      fastWindows = meanFrameSeconds < config.fastFrameSeconds ? fastWindows + 1 : 0;

      const nextLevel = slowWindows >= config.slowWindows
        ? Math.max(0, level - 1)
        : fastWindows >= config.fastWindows
          ? Math.min(config.levels.length - 1, level + 1)
          : level;
      if (nextLevel === level) return;

      level = nextLevel;
      slowWindows = 0;
      fastWindows = 0;
      settleSeconds = config.cooldownSeconds;
      return config.levels[level];
    },
  };
}

interface RenderLoopState {
  frameloop: 'always' | 'demand' | 'never';
  clock: { elapsedTime: number };
  internal: { frames: number };
  setFrameloop: (mode: 'always' | 'never') => void;
  invalidate: () => void;
}

/** Keep AI/animation timestamps monotonic while excluding hidden-tab time. */
export function setRenderingSuspended(state: RenderLoopState, suspended: boolean) {
  const mode = suspended ? 'never' : 'always';
  if (state.frameloop !== mode) {
    const elapsedTime = state.clock.elapsedTime;
    // Fiber stops/restarts the clock here, but also resets elapsedTime to zero.
    state.setFrameloop(mode);
    state.clock.elapsedTime = elapsedTime;
  }
  if (suspended) {
    // Fiber 9.5 can drain an already-invalidated frame even in `never` mode.
    // Clear that pending work to prevent a manual-clock update while hidden.
    state.internal.frames = 0;
  } else {
    state.invalidate();
  }
}
