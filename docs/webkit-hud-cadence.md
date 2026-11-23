# WebKit HUD compositing control

**Decision: reject removing the damage vignette's screen blend as a frame-time fix.** Do not flatten the normal HUD or alter its hit feedback on the basis of this test. It does not rule out other WebKit or WindowServer presentation costs.

Both isolated, back-ordered WKWebView runs served the same frozen `hero-playable-Cs2Rnl` build (gameplay JS SHA-256 `48e95e0ab2857440fa7f9e9bdfeb73c969af3c725e27cebdf309b02fda2868c3`). Each had 1920×1080 viewport and WebGL input, 2× native backing scale, a visible/non-key panel, nominal thermal state, low-power mode off, and two genuine simulated strikes arming then confirming three files. The probe left the actor count, lighting, render size, timing, and all HUD elements intact. Its sole treatment was CSS blend mode `screen` versus `normal` on the full-screen radial damage vignette. The gradient, opacity and transition remained identical. Computed styles confirmed no active backdrop blur in normal Boot Camp; the only other observed HUD filter was a 28×28 radio portrait.

| Observed over the measured two-strike route | Stock screen blend | Normal-blend control |
| --- | ---: | ---: |
| Actual damage flashes | 3 | 2 |
| Frames overlapping a visible flash or its 220 ms fade | 75 | 50 |
| p95 / maximum during those frames | 18 / 19 ms | 18 / 18 ms |
| Frames above 33.4 ms during those frames | 0 | 0 |
| All route intervals; p95 | 2,349; 18 ms | 2,356; 18 ms |
| Over-budget elsewhere; maximum | 5; 61 ms | 1; 40 ms |

The slower frame intervals did **not** coincide with visible damage in either run. Their variable whole-route count is not evidence of a treatment effect. The production CSS is unchanged. These diagnostic observations are not a two-strike acceptance pass, a GPU timer or packaged desktop qualification.

Raw timestamps, HUD class toggles, native window state, actual decoded/audio starts and artifact hashes: `tmp/production-qa/wk-diagnostic-9hrG7M/{raw,report}.json` and `tmp/production-qa/wk-diagnostic-9dBJFb/{raw,report}.json`. The opt-in switches are `hud-screen` and `hud-normal` on `scripts/diagnose-wk-cadence.mjs`; the acceptance harness never sets them.
