# Armor weathering and infantry head gauntlet

This round uses the [fixed product references](tank-game-gauntlet.md) and
the supplied painted model tanks as construction references. The priority
on armor is broad cast-steel volumes with localized wear; on infantry it is
a fitted shell and natural features that remain clear at portrait distance.
Do not import the photos or apply a uniform grime filter. Do not change
weapons, hit volumes, stance, rig, or combat behavior.

## Acceptance gates

- Compare actual 1920×1080 Boot Camp front/side portraits for both factions,
  tank three-quarter/deck/rear views, and normal chase. Keep the cameras
  matched and give the critic hidden version labels. Lighting and actors
  remain live, so transient muzzle light and foliage are not art evidence.
- Faces should separate eye sockets, cheeks, noses and lips without pasted
  outlines or hard shelves. Helmet rims and crowns should read as rounded,
  fitted construction; the two factions should remain distinct.
- Armor should read as matte painted metal from chase distance. In close
  views, broken chips, asymmetric shallow impact marks, scuffs and settled
  grime should follow the panels. Keep broad paint areas calm and preserve
  canvas, rubber, and exposed-metal separation.
- Verify the exact production build at full 1920×1080 on the M5 Mac: the
  normal two-strike target route marks three simulated files first and
  confirms three on the repeat. Meet the 33.4 ms max browser-frame gate in
  the launch, ingress, centered impact, ignition, and rolling-fire windows.
  Check fresh browser profiles, no buffer scaling, and no runtime or shader
  failures. Chrome/Metal is not native Tauri sign-off.

## Ledger

- Baseline: actual Boot Camp close-ups and chase (`K6-*`, under
  `tmp/visual-review/armor-and-heads-gauntlet/`); the last verified production
  bundle is `GameSession-DEmuqOcN.js` (`x269zB`, `8VVdwl` two-strike reports).
- Constraints: follow the existing gauntlet's 12-round/90-minute rule and
  preserve the live play preview on 1460. All new browser checks run in a
  separate local profile against simulated files.
- The unchanged bundle's fresh run in this round (`tZRixh`) hit 100.0 ms
  at first launch/approach and 116.6 ms during repeat impact. The repeat
  trace had no new WebGL links or attributed blocking scripts. That is a
  failed baseline rerun, not a regression attributable to either art edit.
- Revision `V2`: the plate wear and tighter helmets won relative to `K6`,
  but a blind reviewer rejected both for scope. Tank spot marks read as
  paint dots and the broad plates stayed clean; the M1 rim still crowded
  the eye and the cheek/eyelid connection looked flat. Correction: build
  stronger recess/contact-edge wear and a shaped gouge; refit the front
  helmet opening and preserve distinct continuous orbital and cheek planes.
- Revision `V2`'s exact `GameSession-DI-v1kVw.js` production test (`eO1yP4`)
  passed the 33.4 ms cap. First and repeat impact peaks were 16.8 and 33.2 ms;
  both struck three simulated targets without resized buffers or errors.
- Portrait revision `H4` passed the independent close-up review: the M1
  cleared the full eyebrow in profile, the VC brim kept a distinct shape,
  and cheek/eye transitions were less angular than either prior version.
  The final `Y7` pass adjusts posterior VC overlap at the collar only. All
  three US head variants' position/normal/color buffers remained byte-for-byte
  unchanged from `H4` and no triangles or weights were added.
- Tank revision `D8` removed stamped circular dents and gave the scars
  shallow relief. It still failed the blind material critique: stripes on the
  raised deck read as highlights and the ochre ring formed a continuous band.
  The next and last correction round targets individual chipped contact areas
  and separates dirt into small deposits at construction joins.
- Retained close-ups: `K6` is the before set, `Y7` the final infantry heads,
  and `R9` the final armor. The fixed-view Boot Camp comparisons are in
  `tmp/visual-review/armor-and-heads-gauntlet/`. Keep the visual verdict
  separate from the frame-budget verdict.
- The retained art bundle on play port 1464 did **not** pass repeated timing:
  `txV3k2` hit 49.9 ms at first impact; `oEN8wt` hit 66.7 ms at the repeat.
  The native WebView/Tauri artifact was not measured.
- On that same bundle, `WsBVAC` hit 83.4 ms at first launch and at repeat
  ignition. In control `XgyBWn` the player disarmed the first three marks;
  both strikes still caught three targets but the repeat re-armed rather than
  confirmed them, and both strikes met the cap. One control pair is not
  enough to establish which impact-time operation caused the stall.
- Diagnostic-only `oeZzcl` aligned browser, compositor, and WebGL host events
  with the strike cues. Its 66.7 ms repeat launch gap included 26.5 ms of
  forced style/layout in Fiber's pointer handler, 8.66 seconds before impact.
  Both ignitions uploaded 20,864 bytes in five WebGL allocations, with no
  single host call over 0.2 ms. This trace does not reproduce the earlier
  ignition spike and is not a timing sign-off.
- Input correction round 1: the fresh critic rejected skipping the pick.
  It dropped stock aim and late click behavior in the fixture, and Fiber's
  installed Canvas always supplies a missed-event wrapper that prevented
  the optimization from activating in the real browser. Correction target:
  retain stock picking and remove only the forced event-coordinate lookup
  on the known canvas path; prove fallback parity before timed retesting.
- `sPukom` and `EyMHA6` both met the frame cap on the rejected first input
  candidate. Treat them as controls, not improvement attributable to it:
  the fast path did not activate in production. Baseline `sWt8y6` then
  counted six native offset reads and two native layer reads on **each**
  trusted canvas press in the original bundle. This diagnostic is not a
  frame-budget run.
- Input correction round 2: the installed-Fiber differential confirmed
  the same aim, initial picks, late click, miss and original event identity.
  Integer mouse presses on the untransformed canvas use measured coordinates
  without layout reads, and fractional/other targets and registered down
  callbacks keep the native event. Up and click routing are unchanged.
- Independent wasted-work correction: `OrdnanceEffects` stops submitting
  the transparent target plane once alpha reaches zero (~185 ms after
  impact). The border, burn timing and damage are unchanged. A mounted
  scene critic verified the exact fade boundary; this is not a claimed
  explanation of an ignition-frame spike.
- The combined input/marker artifact (`GameSession-B3EAN8aA.js`, SHA-256
  `c729e27b12d28bd3f16bfd6e5423425d454d71b45b8e7cf2de525164ce2b5e5b`)
  confirmed zero native offset/layer reads on both real Chrome presses
  (`T3crln`, diagnostic only). The 1280×800 ordinary drive/aim/orbit/cannon/
  mark-disarm check passed (`hysBPL`, 527 timed intervals, 16.8 ms max).
- Two fresh full-size untraced trials of this artifact confirmed all three
  simulated file marks and second-hit deletions. Only `zYDffF` passed timing
  (16.8 ms maximum on each strike). `HhArCx` hit 50.0 ms just **before** the
  first impact and 16.8 ms maximum on the repeat. Neither had a slowing
  launch sample. A new program linked near first impact in both (API time
  0.1–0.2 ms); identify the specific variant rather than assume that driver
  compilation alone explains the missed frame. No promotion to 1464.
- Shader probe `lAuCiX` captured 141 program links with no dropped samples.
  The first-impact program is the instanced scorch material (`vScorchUv`):
  startup fragment fingerprint `f7ab4ceb:72426` had no environment map;
  live fragment fingerprint `522a2357:72650` added `USE_ENVMAP` and CubeUV
  reflection. Three painted aircraft programs also linked during ingress.
  Correction target: install the sky reflection before the isolated first
  render warm-up, without changing material shading or shifting work into
  the strike. Repeat probes must show the correct variant at startup and
  no new strike-time links; timing still requires separate unprobed runs.
- Correction: the loaded panorama is assigned in the layout commit, before
  the napalm warm-up and composer frame. The mounted regression uses Fiber's
  browser layout branch, suspends on the sky texture, and verifies the
  exact environment identity on the first staged draw, one warm-up under
  StrictMode, and restoration on unmount. Switching only the sky back to
  a passive effect fails the regression.
- The frozen corrected build (`GameSession-BrvdHweI.js`, SHA-256
  `d4c709945d3009005ed899b18fe4a61ed73c58ab2bc821bfa25546f112f49cf6`)
  passed both independent Chrome ANGLE/Metal 1080p Boot Camp profiles:
  `2cW0Mz` first/repeat maxima 16.8/16.8 ms, `Fweyyr` 16.8/33.3 ms.
  Full size throughout; three simulated files armed then three trashed in
  each run; no strike-time program links or shader/runtime/load errors.
  A 33.3 ms frame is still a missed refresh, not a claim of locked 60 FPS.
  The coarse menu click to first visible GL sample was 2.62/1.96 seconds;
  profiling the startup work is separate from the strike acceptance gate.
- Diagnostic `TpXKGP` captured the exact live reflection vertex/fragment
  pair at startup (`4568daa2:19193` / `522a2357:72650`). It counted 92 program
  links before inbound and zero afterward, with no dropped probe events.
  The fresh integration critic verified the frozen manifest hashes, the
  raw overlapping frame windows and the actual 1080p afterglow captures.
- Horde smoke `4mW7nV` served the same build at 1920×1080; tested Wave 1
  driving, aiming, cannon, reload and exit. Its warmed 8.8-second route
  averaged 60.002 Hz and peaked at 16.8 ms. Distant silhouettes still blend
  with the forest; do not infer full Horde clear, nighttime readability,
  or native performance sign-off. The exact browser build is open on 1466;
  the older play preview was left untouched.
