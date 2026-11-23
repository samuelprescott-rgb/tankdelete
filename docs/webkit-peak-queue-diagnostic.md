# What stalled during the real 16-actor peak?

## Expanded 22-actor R9 replay: first Dispatch alarm

The [windowless R9 receipt](../tmp/production-qa/headless-webkit-peak-W6UiOK/report.json)
and its [raw intervals](../tmp/production-qa/headless-webkit-peak-W6UiOK/frames.json)
record one 88 ms gap, 4,933–5,021 ms after all 22 distinct standard head
transforms were submitted. The roster mask stayed 4,194,303 at 1920×1080
for the entire seven-second window. This receipt has no CPU/GL phase split.

Run `node scripts/check-horde-playthrough.mjs --peak-archive-correlation`
for the offline, mounted 60 Hz simulation: same 22 identities, same 10/18
setup hits, no interventions on wave 3. From the first nondegenerate full
head roster, Dispatch first raised its alarm at +4,883 ms (50 ms before
the recorded WebKit gap started). Simulation and WebKit are **separate
runs**; this timing makes the first on-demand alarm submission a candidate,
not a GPU attribution. The nearby archive HUD and live rifles are not
excluded. The original game artifact is `GameSession-BHl1tE5M.js`.

The candidate submits the exact mounted paddle, material and instanced
attribute once, beyond the game cameras' far plane, on the first normal
compound render. That first draw restores ordinary culling and zero idle
instances; an actual threat always takes priority. No additional render
pass, geometry replacement or ongoing dummy draw. `check-embassy-defense.mjs`
checks restoration, exact subsequent matrices and a live alarm arriving
before preparation completes. Only a new uninstrumented hardware run can
test the change against the unchanged timing gate.

In the [R11 uninstrumented window](../tmp/production-qa/headless-webkit-peak-OiPFi4/report.json)
the 22 actors sustained 59.94 Hz, maximum 25 ms and no intervals over
33.4 ms. The separate p95 gate **still failed** (19 ms > 18.5 ms).
This does not establish where the remaining frame variance originates.

### R12 candidate: off-camera static foliage, unchanged plants and actors

R9's main-world census included four expensive noncasting stands bypassing
the existing spatial compactor. The seated guard-turnout CPU replay matches
the old cohort counts and conservatively skips only cells completely outside
the camera, with the established wind envelope and original paint/matrices.
See `node scripts/check-static-foliage-moving.cjs embassy-turnout candidate omit`;
replace `candidate` with `previous-eligibility` for the control. `omit` here
means the **CPU comparison does not measure rice**; the game still renders it.

| Stand | Prior → candidate submitted instances | Triangles not submitted |
| --- | ---: | ---: |
| Far crowns | 350 → 130 | 10,560 |
| Ferns | 69 → 32 | 11,396 |
| Bananas | 50 → 20 | 12,840 |
| Outer trunks | 395 → 167 | 9,120 |

43,916 fewer triangles per stationary main-world frame; no additional
draws or recurring uploads over 300 frames. On the 600-frame steering and
reversing control (`drive`), the candidate submitted 25,726,640 fewer
triangles across the run at the cost of 519,308 extra upload bytes in
total. Largest single frame upload across all measured cohorts increased
from 117,876 to 119,928 bytes. 3,622,800 independently wind-padded
oriented-box tests found no missing visible plants on this route; fast
turns and FOV changes passed a further 1,811,400. These are CPU submission
counts and transfer checks, not WebKit frame timings.

This is an **opt-in diagnostic**, not release timing or packaged-app validation. Run the ordinary uninstrumented peak route separately on the exact same frozen distribution. No preference, scene, effect, resolution or renderer setting is changed.

The isolated host, earned virtual archive seed, three verified prior 1080p submissions and seven-second untouched wave-three roster are the same as in [the existing native route](webkit-native-correlations.md). The probe adds:

- Simulation and priority-1 composer entry/return wall clocks, joined to the exact WebKit animation timestamp of each measured interval; unmatched times are not guessed.
- At most one outstanding WebGL2 fence, inserted *after* the composer. A timer roughly 6 ms later and subsequent frame entries may call `clientWaitSync(sync, 0, 0)`. No flush, positive timeout, busy waiting, `finish`, readback, draw-state changes or resubmission. The fence itself is diagnostic GPU work. Its first observed signal only gives an upper bound on completion of the preceding WebGL queue; it does not timestamp GPU execution, compositing or a display flip.
- In optional `queue-passes` mode, wall time within top-level `renderer.render` and `setRenderTarget` calls of the live composer. The real world+camera are identified by identity; full-screen work requires a single three-vertex textured mesh. Destination is Three's existing JS target reference (null for final screen), not a GL query. Nested method calls stay attributed to their outer call. Material and target names are recorded. Per-frame residual means time **outside these two timed methods within the composer**, not necessarily CPU overhead. Wall time can include preemption or graphics-driver waits.
- Optionally `queue-world` additionally counts and brackets `renderBufferDirect` only inside the real main-camera world call. Only per-frame count and sum are kept for normal draws. At most 32 draws taking 4 ms or more record object/parent/material/geometry identity. Millisecond clock quantization is significant for individual short calls. Pre-sample synthetic clock/wrapper calibration gives a JS overhead reference, **not** an upper bound on actual pipeline disturbance. This heavier mode is not suitable for acceptance. The two below on-device runs did not use this mode.

## Reproduce

### Follow-up: isolate the first Huey flyover

The corrected forest build `DLkSdfVG` reproduced the same spike in two
separate instrumented, physically fitted 1080p wave-three runs. In the
[second control](../tmp/production-qa/wk-queue-diagnostic-1h4kvk/report.json)
the main world call took 38 ms; four direct draws on the distant Huey body,
trim, glazing and rotor took 12, 9, 8 and 8 ms. None of the four meshes
or geometries had previously been submitted in the probe's measurement window.
Later frames containing the helicopter returned to ordinary draw times.

The `mNaU6w_n` candidate shares a single immutable set of flying geometry
and materials between the two rigs, and primes the real draw variants in the
existing startup scratch pass. Rigs keep independent poses and flight paths;
there is no new render pass, world-visibility override or change to their art.
In the [candidate diagnostic](../tmp/production-qa/wk-queue-diagnostic-lqIZaG/report.json),
the first jump to 206 or more world submissions cost 1 ms summed across
direct draws (38 ms in the control). World render wall time never exceeded
3 ms in the seven-second candidate interval. It still had a 55 ms frame,
with 52 ms after composer return, so this is evidence for fixing the specific
flyover entry cost, **not** a general 60 fps certificate. Without a hardware
timer we cannot split that remaining gap between GPU, driver and scheduling.

### Running the script

Use the project's Node 22+ runtime, a compiled local QA host, frozen production output, and a report with three earned fictional archives. Run one GPU process at a time.

```text
node scripts/check-wk-queue-probe.mjs
node scripts/capture-webkit-peak.mjs HOST FROZEN_DIST EARNED_REPORT front-physical queue-diagnostic
node scripts/capture-webkit-peak.mjs HOST FROZEN_DIST EARNED_REPORT front-physical queue-passes
node scripts/capture-webkit-peak.mjs HOST FROZEN_DIST EARNED_REPORT front-physical queue-world
```

The reports use their own `wk-queue-diagnostic-*` directory and `diagnostic-complete` / `diagnostic-incomplete` statuses. The ordinary `checks.timing` is retained for context only; diagnostic completion never means a timing gate passed. Local frozen files are compared against bytes fetched from the loopback server by the existing artifact verification path.

## November 21 frozen landing build — not a retained-art verdict

Both receipts identify game bundle SHA-256 `e6d4ce4e0ea902f9672b3c48d8b817d6270d68f4e119fc1fccade02e80970db0`.

| Run | What it actually showed |
| --- | --- |
| Strict `tmp/production-qa/wk-peak-hF4jIF/report.json` | Seven seconds with 16/16 slots; fitted 1920×1080; 419 intervals; p95 18 ms, one 50 ms gap. No attribution inside that uninstrumented gap. |
| Instrumented `tmp/production-qa/wk-queue-diagnostic-LL7ZqM/report.json` | Seven seconds with 16/16 slots; fitted 1920×1080; all 418 intervals joined exactly; p95 18 ms, one **55 ms** gap. Its measured split was **0 ms simulation / 42 ms inside composer / 13 ms after composer**. Composer p95 was 2 ms, simulation p95/max 1/1 ms. Hardware GPU timer extension unavailable. |

For the diagnostic outlier the fence was still pending at WebKit clock 36,656 ms and had signaled by next frame entry at 36,662 ms. No mid-gap poll returned a signal early enough to separate queue completion from presentation. Insertion/poll call maxima were each 1 ms; these are not measurements of GPU time or proof that instrumentation was free. The measured long interval falls mainly **inside the composer**, not in measured gameplay simulation. This does not identify a specific shader, establish GPU saturation, or prove that the earlier uninstrumented gap had the same cause.

## Forest R1 — individual render-call attribution

`tmp/production-qa/wk-queue-diagnostic-lRFr4W/report.json` measured frozen game bundle SHA-256 `62c9966ea7d95e727359c8762ace32692ad780a75d4625da5647894d6f88bc45`, using the nested `queue-passes` probe. R1 is a **different** pre-final artifact. All 418 intervals joined exactly, all 16 slots remained active at fitted 1920×1080 for 7,002 ms; p95 18 ms, one 41 ms gap, hardware GPU timer unavailable.

In that interval (5,853 ms after reaching 16 active slots), the real world/main-camera `renderer.render()` into `EffectComposer.Buffer` accounted for **38 ms**. Ten intermediate full-screen effects, the final screen pass, 13 top-level target changes and the rest of the composer accounted for zero *observed* milliseconds at this timer's precision. The measured simulation bracket was 0 ms and 3 ms elapsed after the composer until next frame entry. Over the entire window the world render p95 was 2 ms; intermediate and final effects each had a maximum aggregate of 1 ms per frame.

The post-composer fence was still pending at next frame entry and only observed signaled later. This trace localizes one stall to world-render wall time, **not** to a particular mesh, material, GPU shader or JS operation. Frame-level graphics backpressure and thread preemption are still possible. Cutting full-screen effects is not supported by this observation. Retained release timing must come from a normal, uninstrumented route.

## Retained forest: repeated draw-level signature and an isolated candidate

Two subsequent isolated `queue-world` runs on game bundle `b17b97cfdfa2a1206322a202a4fefef841792f815ce97c1a02bcf011b849b97f` recorded the same pattern. In `wk-queue-diagnostic-cF04PM`, world draw count increased from 201 to 206 as a distant Huey entered. Four direct draws took 14/9/8/7 ms; adjacent frames at the new count took 0–1 ms in all direct draws combined. In `wk-queue-diagnostic-1h4kvk`, a 58 ms frame contained 12/9/8/8 ms draws. The shell, cabin trim and glazing were identified by the airframe parent; the fourth material/ancestor matched a rotor. None of those four meshes or geometries had an earlier observed submission **during the measured period**. These are wall-clock measurements with instrumentation; they do not establish driver internals or exclude unrelated delays elsewhere.

The isolated candidate shares the five authored geometries, four materials and two ink textures under one mounted formation owner; its two flight paths and rotors stay independent. Its five detached mesh proxies borrow those same immutable resources and join the existing one-shot, 16×16 HDR/lighting-matched startup preparation. There is no new render pass or persistent render-loop work. The wreck remains separately owned and scorched. `node scripts/check-flyover-preparation.mjs` checks geometry/ink byte parity, proxy and live-resource identities, one offscreen submission with state restoration, independent live rigs, scene isolation and exact disposal under owner replay. The fix is a candidate until a separately frozen build is measured; non-Huey hitches do not become a pass.
