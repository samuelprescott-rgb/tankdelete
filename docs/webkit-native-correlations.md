# Isolated macOS WebKit: native clock and physical presentation

This is a system `WKWebView` simulation, not a packaged Tauri acceptance test. It uses a nonpersistent web data store, binds only to loopback, ignores physical input, and routes generated events to the QA panel. No OS file operations are exposed. The installed `/Applications/TankDelete.app` is an older 0.1.0 binary, not this frozen 0.1.1 artifact. Command Line Tools include Swift; the selected developer directory does not contain Instruments' `xctrace`.

## Baseline results

Frozen `tmp/production-qa/hero-playable-VKgisx`, `assets/GameSession-BjGN9Wag.js` SHA-256 `a3ff203767c0ef3d7fbff855c2b9fcc55ff49a30d251889cfe7d61437d3685e1`.

| Route | Evidence | Result |
| --- | --- | --- |
| Strict two strikes, original Retina-points panel | `wk-1080p-bcZo4j` | 2,347 intervals, p50/p95/p99/max 17/18/20/84 ms; failed. Both strikes registered 3 targets; files armed and then confirmed. Only two over-budget intervals, 84 and 45 ms, both in first inbound. |
| Strict sustained 16-instance peak, original panel | `wk-peak-XOgl3W` | 419 intervals, 59.86 Hz, 17/22/24/39 ms; failed p95 and max. |
| Correlated diagnostic, original panel | `wk-diagnostic-0eeth6` | Both strikes registered the real 3 targets; three over-budget intervals, described below. This is not an acceptance rerun. |
| First fitted-pixel panel boot, two-job Rust build concurrently active | `wk-diagnostic-seHEcR` | Native backing 1920×1080, whole frame on active screen, CSS viewport and canvas 1920×1080. Two startup callbacks took 23,171 and 2,305 ms. No verified mounted scene draws before the original 28-second limit; no strikes or valid timing. Cannot infer what those callbacks did. |
| Fitted 16-instance baseline peak | `wk-peak-6C42y0` | Actual backing/CSS/FBO 1920×1080, page DPR 1; all 16 for 7,015 ms. 408 intervals, 58.16 Hz, p50/p95/p99/max 17/19/32/105 ms; four above 33.4 ms. Strict failure. Rust link idle; short separate TS check possibly overlapped. |
| Fitted correlated baseline double | `wk-diagnostic-Ss8Rgz` | Both strikes caught three. Launch/inbound/center/ignite/rolling first 20/46/46/46/24 ms, repeat 18/52/52/52/22 ms. A separate frontend build overlapped; diagnostic not acceptance. |

Evidence directories are under `tmp/production-qa/`. The old target requests a 1920×1080 native-**point** surface at 2× on the 1710×1107-point main display; the WebGL surface was 1920×1080 but the panel was not designed to guarantee the entire physical surface fit. The alternate `front-physical` target fits 1920×1080 **native backing pixels** and sets WebKit page zoom inversely to the window's backing scale so the game must still prove its original CSS viewport, WebGL dimensions, positive real camera draws, actor checks and trusted aim. The target records `NSView.convertToBacking` and whether the entire window fits the active screen. The original `front` target remains available, unmodified in presentation, and must not be renamed as the fitted run.

### What the correlated diagnostic established

| Window | rAF gap | Measured simulation/composer | After last rAF callback | Longest overlapping 12 ms page timer / 20 ms native main timer |
| --- | ---: | ---: | ---: | ---: |
| First inbound +659 ms | 39 ms | 0/1 ms | 38 ms | 42/20.33 ms |
| Second impact, including actual three-file confirmation | 53 ms | 7/2 ms | 44 ms | 42/20.41 ms |
| Second impact +503 ms, rolling fire | 43 ms | 0/1 ms | 42 ms | 30/20.78 ms |

Across these intervals, no synchronous `HTMLMediaElement.play`, decoded source start, shader compile/link, or measured timer/React `MessagePort` callback of at least 6 ms was observed. Only the middle interval covered the deletion/HUD commit. The 12 ms heartbeat measures main-page delivery, not CPU occupancy. No WebGL GPU timer extension was available. These data distinguish a delayed WebContent frame from a general AppKit main-loop stall; they **do not** prove GPU saturation, GC, or a specific game subsystem. Native 20 ms ticks use system uptime; 25 browser→native→browser exchanges bounded clock alignment to ±1 ms around these intervals. Raw timestamps and the full workload remain in `raw.json`.

The fitted diagnostic showed four long intervals (46/46/38/52 ms) with 36–42 ms outside observed rAF callbacks; the overlapping 20 ms native timer never exceeded 21.8 ms. Its first world callback took 14,373 ms. Only ~186 ms lay in the wrapped startup GL calls, chiefly texture uploads and buffer allocation; unobserved CPU, driver reflection or scheduling cannot be partitioned from this trace. The three genuine startup submissions had 1.17–1.19 million triangles apiece.

## Targeted candidate, not a timing claim

The real **post-peak** camera submitted 1,119,465 triangles in 162 main-scene draws. Among immutable, opaque, non-shadow casters, 30 m cells conservatively rejected an estimated 39,424 submitted perimeter-cutout triangles, plus 36,736 / 21,504 / 17,280 / 13,824 across heavy procedural jungle batches. Naively turning every cell into a draw would add numerous calls. The candidate instead compacts only the in-frustum cells into each existing draw, preserving original matrix/color bytes, relative ordering, geometry, material and full-mesh bounds. Source-local wind envelopes are expanded before instance transforms. Casting, interactive and low-work meshes are excluded. Actual post-change submission counts and final timing still require an on-device retained-build comparison; this is not proof the baseline spikes were GPU-bound.

`node scripts/check-static-instance-frustum.mjs` checked 29,440 individual maximal-wind OBBs through rapid reversals, changing FOV/aspect, inspector camera and moving parents, validating exact visible source records, restoration and no idle uploads. Project TypeScript, `check-jungle-composition.mjs` and `check-grass-lod.mjs` also passed.

## Reproduction

Compile the independent host to a temporary location with `xcrun swiftc scripts/qa-wk-host.swift -o /path/to/qa-host`. Run only one timed GPU process at a time, during no high-CPU build, on a locally frozen Vite production output.

```text
node scripts/diagnose-wk-cadence.mjs /path/to/qa-host FROZEN_DIST front correlate
node scripts/diagnose-wk-cadence.mjs /path/to/qa-host FROZEN_DIST front-physical correlate
node scripts/capture-webkit-qa.mjs /path/to/qa-host FROZEN_DIST front-physical
node scripts/capture-webkit-peak.mjs /path/to/qa-host FROZEN_DIST EARNED_CHROME_REPORT front-physical post-budget
```

`correlate` is an opt-in diagnostic, including startup driver-call timings (removed before strike measurement), rAF callback and real simulation/composer wall time, timer/selected MessageChannel work and audio lifecycle. The draw census, when requested, observes one normal main-camera submission **after** the last timed interval, and reports actual triangle count and conservative X/Z tile estimates separately. It never changes camera, scene placement, material, target fidelity or draw calls. The untouched peak uses three earned *fictional* archive names from the explicitly identified seed report; waves 1/2 are staged, not counted as campaign verification; the real 16 slots must remain nonzero throughout wave 3's full seven seconds.
