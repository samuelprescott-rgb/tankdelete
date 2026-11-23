# Compact floating file labels

The village roofline shows at most **four unmarked file names within 18 world units of the camera**. These are the nearest candidates, not random files. Equal-distance ties use file paths for stable ordering.

Armed/marked targets retain their orange **ARMED · filename** label even beyond the ordinary proximity radius and take priority within the existing **16-label total cap**. If more than16 files are armed, the nearest16 are shown. Armed labels do not consume the four ordinary-name allowance unless the global cap is reached.

This is a presentation-only budget. Hut placement, file IDs, selection, hit detection, two-stage deletion confirmation and objective markers are unchanged. Hovering still exposes the full name and size independently of the floating-name budget. No new input controls are required.

Tuning values live in `src/lib/fileLabelSelection.ts`:

- Ordinary name cap: `MAX_NEARBY_FILE_LABELS = 4`.
- Global name cap: `MAX_FLOATING_FILE_LABELS = 16`.
- Camera proximity radius: `FILE_LABEL_VISIBILITY_RADIUS = 18`.
- Spatial index cells: **12 units**, unchanged.
- Query throttle: **0.4 seconds**, unchanged; block/marked changes bypass the timer.
- Camera refresh cells: **2 units**, tightened from6. A stationary camera does not continually sort files; moving to another refresh cell updates at the next throttled query. The18-unit rule applies at each query, not continuously every rendered frame.

The index rebuilds only when blocks change. Queries inspect at most25 neighboring cells and directly retrieve explicit remote marked paths; they never scan every distant file. Only changed path lists cause a React label update.

Run `node scripts/check-file-labels.mjs` for direct production-helper checks covering radius/caps, marked visibility, equal-distance stability, stale marks, deletion/restore, negative cell boundaries and bounded work in a10,000-file remote directory. `scripts/check-stable-layout.mjs` independently verifies that the underlying file plots/pages remain stable.
