# Bamboo material and 1080p strike gauntlet

Keep the [project's fixed visual references](tank-game-gauntlet.md): Hallowfall
for readable painted forms and Borderlands 3 for legibility during combat.
For bamboo, judge the crossings, matte planes, and separation from wood and
thatch in real gameplay. For napalm, test two strikes from the same chase pose
in a single session. Require the full 1920×1080 render buffer throughout, a
nominal 60 Hz cadence, and no frame over 33.4 ms around ingress or impact.
Use both a fresh Chrome profile and a warmed control. These are Mac browser
samples, not native WKWebView sign-off. All files targeted are simulations.

## Bamboo pilot

Only the bamboo tile in the existing 768×512 atlas changed. The two texture
views still share the same source; other atlas tiles were pixel-identical in
an offline raster comparison. No additional textures, meshes, or batches.

The 1080p captures are in `tmp/visual-review/bamboo-material-pilot/`:
`before-village.png`, `after-village.png`, `before-oblique.png`, and
`after-oblique.png`. The independent critic was given unlabeled versions.
The new tile won at both distances: clear alternating flat splits where the
old paint read as small mottled squares. The critic noted that lighter joint
shading could make the splits feel flatter. This was a scoped still-frame
pass; it is not a moving or night art sign-off.

## Strike ledger

The measured window centers on the actual on-screen impact cue, not the
player click. In the target test, each strike resolves three targets. The
values are maximum rAF intervals, not per-pass GPU execution times.

| Build and browser profile | Report folder suffix | First ingress / impact | Repeat impact | Verdict |
| --- | --- | --- | --- | --- |
| Original, fresh profile | `aIsQtp` | 466.6 / 266.7 ms | 100.0 ms | Fail |
| Original, warmed profile | `jXDcFY` | 16.8 / 16.8 ms | 16.8 ms | Pass, warm |
| Bamboo, warmed profile | `wHMl0P` | 16.8 / 16.8 ms | 16.8 ms | Pass, warm |
| Bamboo, fresh profile | `KSM0Ty` | 450.0 / 266.7 ms | 183.3 ms | Fail |
| Bamboo, fresh clear-ground control | `H1SOHk` | 33.3 / 33.3 ms | 16.8 ms | Pass, 0 targets |
| Bamboo, fresh three-target disarm control | `WUZ5Q6` | 33.3 / 16.8 ms | 16.8 ms | Pass, no confirmed deletions |
| Bamboo, fresh flat-notice diagnostic | `sd65Pi` | 33.2 / 16.8 ms | 33.3 ms | Pass, non-stock overlay styling |
| Bamboo + startup preparation, fresh profile | `bG94AL` | 33.3 / 16.8 ms | 16.8 ms | Pass, 3 targets and normal notices |
| Same startup-preparation bundle, fresh repeatability check | `XaHriO` | 33.3 / 16.8 ms | 66.7 ms | Fail on confirmed deletion |
| Preparation + one cleanup notice + first material passes | `N2CfbL` | 33.4 / 16.7 ms | 16.8 ms | Pass, 3 targets and confirmed deletion |
| Same bundle, second fresh profile | `1BegNE` | 33.3 / 16.8 ms | 16.8 ms | Pass, same workload |
| Second sleeve pass integrated, fresh profile | `uZb87e` | 33.3 / 16.8 ms | 16.8 ms | Pass, same workload |
| Third sleeve pass integrated, fresh profile | `BCcUJQ` | 16.8 / 16.8 ms | 49.9 ms | Fail; 50.0 ms later during rolling fire |
| CSS notification stack, fresh profile A | `x269zB` | 33.4 / 16.8 ms | 16.8 ms | Pass, 3 targets and confirmed deletion |

Reports are in `tmp/production-qa/napalm-impact-1920x1080-*/report.json`, with
raw frame, cue, and WebGL request timing alongside. Fresh primaries stall
near the same jet/fire GPU programs in both builds. The repeat spike has no
new program links in either failing capture. The same-camera disarm control
proves both hits in the absence of second-hit deletion, and the flat-notice
control still confirms three deletions, with their per-file notices present.
Neither proves a specific cause: the link stalls also varied on fresh
profiles. The startup preparation build passed without either control or a
render-quality reduction. One ingress frame took 33.3 ms; both impact windows
peaked at 16.8 ms. The next tier (tank and infantry) can begin after that stock
target run; repeat the route on the final material bundle.

The repeatability check exposed a shorter deletion hitch after startup
preparation. The trial fix groups successful napalm deletions into a single
static summary, and uses a text shadow instead of an emoji filter in the
achievement badge. First hit, second confirmation, errors, points, undo,
counts, and damage/VFX are unchanged. The production capture adds an explicit
`--impact-max-frame-ms 33.4` gate instead of using functional check status as
a speed verdict.

`BCcUJQ` attributed 56.5 ms of a 74.2 ms repeat-impact long frame to forced
style/layout in a React task, with zero new WebGL program requests in the
repeat window. The game notice presenter measured toast height on mount and
after subtree changes. This points to removing layout reads from notification
presentation, not cutting particle density or changing strike timing.
`GameNotifications` uses the existing notification queue and expiry timers
with CSS stacking. It preserves cue text, achievements and accessible status
roles without the height reads or the observer on every notice.

## Tank and infantry loop

The independent still-frame critic accepted the cooler cast planes, dark
tracks, and warm canvas stowage on the tank at close and chase distances.
No new geometry, texture files, or draws. Local contact wear has room for
further refinement.

The first infantry paint pass was rejected: sleeves still looked inflated and
too smooth, despite the readable kit color. A second pass changed the actual
elbow and cuff shape and won the blind comparison, but was not accepted: the
elbow crease read as one squared-off step with a cuff seam still too subtle.
A fresh integration critic accepted the third pass: two offset tapered folds
read instead of that step, with a quiet outer plane and a legible but subtle
cuff edge. It is a scoped direction pass, not a full uniform sign-off. Final
matched tank and sleeve stills are with the village evidence. The two
`*-motion.webm` clips use the same live camera sweep; they are visual evidence,
not timing traces. No new draw groups, geometry counts or texture maps.

The same second-pass bundle also completed the live Horde drive, steer,
reverse, fire, radio toggle, and menu exit at 1920×1080 (`CtTr9u`). It sampled
525 frames at 59.55 Hz, with p95 and p99 of 16.8 ms and a worst frame of 33.3 ms.
That is a short live Wave 1 smoke test, not a full Horde or native clear.
