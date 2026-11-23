/** Deterministic camera-only QA route across both grass LOD thresholds.
 * Gameplay actors, inputs and simulation clocks are never modified. */
export function sceneReviewGrassSweepX(seconds: number) {
  if (!Number.isFinite(seconds)) return -18;
  const progress = Math.min(1, Math.max(0, seconds) / 20);
  return -18 - 34 * Math.sin(progress * Math.PI) ** 2;
}
