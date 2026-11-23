# Impact and rice-paddy gauntlet

This round continues the [TankDelete quality gauntlet](tank-game-gauntlet.md).
The fixed product references are still Blizzard's Hallowfall and 2K's
Borderlands 3 reveal. For this round, judge readable visual groups, material
quality in the chase view, and whether the strike cue is legible at speed.

Target: this Mac at **1920×1080 and 60 fps**, nominal 16.67 ms per frame.
No spending, credentials, publishing or native file operations. All QA uses
simulated files. Limit the run to 12 builder–critic rounds or 90 minutes; do
not repeat the same unresolved gap for three rounds without changing strategy.

## Evidence gates

- **First and second strike in the same built session:** trusted input from
  the same chase pose; align raw frame intervals and WebGL program requests
  to inbound and impact separately. Check ignition, sustained fire and
  cleanup. Report render-buffer size, p95/p99, worst frame and missed-frame
  counts. A warmed browser playback proxy is not native release sign-off.
- **Live paddy plants:** matched full-resolution close-up, mid-distance and
  default chase frames, plus motion if available. The rice should read in
  clusters of continuous leaves, without broken bright dashes, undulation at
  the roots or visual noise that competes with combat. Keep channels visible.
- **Impact art and gameplay:** compare the actual fire, smoke and scorch from
  the same camera and age; preserve cue timing, file safety, repeated strikes,
  lingering damage and cleanup. No new full-screen passes or quality drop to
  win the frame test. Check stable shader/light variants and scene lifecycle.
- **Integration:** rerun the production build and regressions. Ask a fresh
  critic to check both matched visuals and the warmed native-resolution
  browser report before claiming this pass. Keep full native sign-off separate.

## Ledger

| Round | Owner / target | Evidence | State |
| --- | --- | --- | --- |
| Baseline | Integration / paddy and impact | Real 1080p `rice-pre-*` and `fire-pre-napalm.png`; built `zwS38F` (clear), `Ewst1C` (3 targets both strikes); full render buffers. | Thin/angular bright stems. Worst centered frame 416.7 ms (66 program links) clear or 366.7 ms (67 links) loaded. |
| 1 | Impact builder | Session-stable fire light + local jet emission, conservative moving bounds and dormant pooled debris. Built `IdjlBI` target route. | First impact 16.8 ms / 4 links. Repeat still had a late 166.8 ms gap, outside the link burst. |
| 2 | Paddy builder | Real `rice-r1-*` beats baseline at all 3 distances in blind critique. 2,983 seeded tufts, 72 triangles / 66 unique vertices each, one draw. | Pass for static leaf quality. Need clearance around sandbags. |
| 3 | Integration / attribution | R1 frozen source: `b0J9yk` target repeat peaked at 33.4 ms; file count fell +833.2 ms. `0us1LD` same targets with trusted disarm re-armed and did not trash; 16.8 ms centered repeat, 66.6 ms elsewhere during approach. | No repeated 167 ms gap or evidence for a de-rez removal cause. Do not recycle that hypothesis as a fix. |
| 4 | Paddy builder | `rice-r2-*`: soften plant height around the active, shared sandbag footprint only. Blind critic preferred both R2 day angles; night still keeps crossing/water legible. | Pass scoped static visuals; night crew clearance and motion shimmer not isolated. |
| 5 | Impact builder + integration | Persist compatible strike assets between uses. Anchor and soften flame feet. Independent blind critic preferred `fire-r2-napalm.png` over the flat-bottom R1, retaining the diagonal cue and smoke. | Scoped art pass. |
| 6 | Fresh integration critic | Hash-verified candidate target, clear and Horde reports; checked actual 1080p rice and fire. | Visible improvement, severe hitch removed in sampled routes; not a locked native 60 fps verdict. |
| 7 | Integration / repeatability | Matched target rerun with the baseline's probe settings, plus real chase-camera `rice-r2-paddy-motion.webm`. | Both centered impacts 16.8 ms max; first approach had a 33.4 ms interval. Motion clip is visual evidence, not timing evidence. |

## Exact final build at 1080p

`GameSession-B3iWhyfs.js` on Apple M5 Chrome/Metal. All impact windows kept
the full 1920×1080 buffer. Times below are the worst **browser cadence**
intervals overlapping the ±0.5 s window around the actual impact cue, not
GPU execution times. The target route hit three simulated targets per strike.

| Scenario | Before: first / repeat | Final: first / repeat | WebGL program links: before → final |
| --- | --- | --- | --- |
| Target strike | 366.7 / 200.0 ms (`Ewst1C`) | 16.7 / 33.3 ms (`aqHaMa`) | 67 / 8 → 4 / 0 |
| Matched target rerun (no extra attribution) | Same baseline | 16.8 / 16.8 ms (`mVfKL9`) | 67 / 8 → 4 / 0 |
| Clear-ground strike | 416.7 / 50.0 ms (`zwS38F`) | 16.8 / 16.8 ms (`Z5WjpJ`) | 66 / 9 → 4 / 0 |
| Active first-wave Horde drive/fire | 16.8 ms worst (`2mPWHw`) | 16.8 ms worst (`UI7vJU`, 528 samples) | No timed impact on this route |

The first target approach still had an isolated 33.4 ms interval. Both final
target runs and the clear-ground/Horde runs reported no shader/runtime errors
or failed requests. TypeScript, the production build, and all 26 regression
scripts passed. These warm, local browser runs show a substantial fix to
the concentrated hitch, not an all-frame or full-game guarantee. No file
processing behavior was changed; simulations proved first-hit marks and
repeat completion. Actual native release performance under sustained
late-wave load and an exhaustive motion/aliasing comparison remain open.

## Reproducing

Use the production `dist` on an isolated local preview at port 1423 and a
dedicated Chrome debug profile. `scripts/capture-production-qa.mjs` accepts
`--cdp-port 9227 --existing-preview-port 1423 --width 1920 --height 1080
--mode boot --napalm-impact`. Leave the default aim for the clear-ground
control. Add `--impact-aim-x 960 --impact-aim-y 489 --impact-expect targets`
for the matched target route. This is only accepted in browser Boot Camp,
with no native bridge. The script requires both actual impact notices; the
target route confirmed three simulated targets on each strike. Use
`--impact-attribution` for long animation frame/DOM notes, or
`--impact-disarm-between` to re-arm, not trash, the same virtual targets on
the second strike. No screenshots are taken inside the timed windows.

Development-only `Paddies`, `Rice close`, and `Chase` are the paddy reference
angles. For the fire close-up, the simulated strike must emit its impact
notice before the `Napalm` camera is captured. The old first render could
cull evolving smoke/flame because its instance bounds captured only the
first sparks. The fire art comparison is phase-aligned by the notice, not
bit-identical flicker animation.
