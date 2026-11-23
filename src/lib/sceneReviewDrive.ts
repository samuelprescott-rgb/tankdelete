export const SCENE_REVIEW_DRIVE_SECONDS = 20;
/** A bounded QA route uses the same movement/collision path as keyboard input. */
export function sceneReviewDriveInput(elapsed: number) {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= SCENE_REVIEW_DRIVE_SECONDS) return null;
  const cycle = elapsed % 6;
  const backward = elapsed >= 8 && elapsed < 10 || elapsed >= 14 && elapsed < 16;
  const forward = !backward && (cycle < 1.4 || (cycle >= 2 && cycle < 3.4) || (cycle >= 4 && cycle < 5.4));
  const turning = !forward && !backward;
  return {forward,backward,left:turning && elapsed < 12,right:turning && elapsed >= 12};
}
