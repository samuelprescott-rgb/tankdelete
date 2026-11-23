# Mounted crew, running gear and Mac frame pacing

Run started Nov 19 at 20:46 Mountain. Keep the existing playable preview and the user's file system untouched. No uploads, purchases, asset licensing, accounts or deployment. All gameplay tests below are Boot Camp/Horde simulations. Bound: 12 builder/critic rounds or 90 min, whichever comes first. No more than three repeats of a gap without a materially different strategy. A timing pass on one engine never overrules a failure on another.

References stay fixed: [Blizzard's Hallowfall](https://blizzard.gamespress.com/World-of-Warcraft-The-War-Within-Alpha) for readable painted forms; [2K's Borderlands 3 gameplay reveal](https://newsroom.2k.com/news/see-the-full-borderlands-3-gameplay-reveal-presentation-and-catch-the-new-gameplay-reveal-event-trailer-now) for moving combat feedback. The user's three model-tank pictures are the specific references for shark nose paint, contact wear on olive armor, running gear and crew. [Weston Reid's character breakdown](https://www.creativebloq.com/how-to/create-stylish-hand-painted-character-art-in-3d) informs the material/detail hierarchy; [Seele's texture guide](https://www.seeles.ai/resources/blogs/what-is-a-game-texture) distinguishes pigment from roughness. The reference art is not embedded in the build.

## Evidence and decisions

Frozen builds, raw 1920×1080 screenshots and telemetry live under `tmp/production-qa/`. Inspection cameras use real mounted game actors; they do not spawn display models, edit lights, reveal hidden actors, or change AI. The additional field portrait cameras record which live soldier supplied the pose. Use the chase camera to judge ordinary scale. Matched views are not claims of identical animation.

| Workstream | First inspection | Correction / independent verdict |
| --- | --- | --- |
| Running gear and fixtures | Lights/guards and road-wheel profile improved; contact run disappeared into ground visually. | Re-seated the visible tread and shoes without changing drive bounds. Critic inspected R2 side: continuous tread under road wheels; passed. |
| Cupola crew | Face no longer blank, but large exterior hid face/hands and elbow read pinched. | Lowered/rebuilt the mount's exterior, modeled grips, softened crown/arm and reduced socket shadow. Critic inspected actual hands and face; passed readable grip, clearance and seated silhouette. |
| Weathered armor | First finish had too much grain and a hard turret stripe; revised simpler local values. | R2 won the comparison but the yellow 23 sat on a plastic-looking shoulder; front fenders also too smooth. A localized, hand-placed wear correction followed. No reason to restore blanket noise. |
| Field / paddy | In chase view greens competed across figures, rice and banks. | Group rice values in contiguous patches, break up berm crest, give regular US/VC field kit distinct localized cloth values. Mounted close-ups exposed that the face, particularly the eyes, was still behind the material standard. |
| Impact rendering / controls | Cold and repeat Chrome profiles passed the *previous* build. System WebKit simulation did not: even the pre-click baseline stalled; matching clicks gave a clear first strike and 3 targets on repeat. | Reduced off-screen bloom work, water face passes and redundant grass vertices; no reduction of the measured main framebuffer. Use real pointerdown coordinates for designation. R2 now hit 3/3 in both strikes in WK; timing still failed. |

- Baseline freeze: `village-playable-ZQO3li`; normal/inspection: `sector-photos-1920x1080-XrNE82`; additional actual field and operator cameras: `sector-photos-1920x1080-YcRSxX`.
- Rejected/partial passes: R1 `hero-playable-biOAbw` / `sector-photos-1920x1080-r28sFW`; R2 `hero-playable-fuSe4X` / `sector-photos-1920x1080-rG0YO2`. Intermediate field-color freeze `hero-playable-pWzkG7` / chase and unassisted bridge drive `sector-photos-1920x1080-tRBFuN`. Incomplete or mismatched cameras are explicitly marked incomplete and are not before/after evidence.
- Baseline controlled WebKit: `wk-1080p-blXMcV` whole-route p95 172 ms, max 738 ms, first strike missed the designated files. R2 `wk-1080p-hoDsmn`: clean input, 1920×1080 render buffer, 3 targets each time; p95 247 ms, max 672 ms. First/repeat centered impact max 672/80 ms (33.4 ms allowed). These are not packaged Tauri measurements or GPU timer queries.
- The installed desktop binary is older than this source. The standalone QA panel uses the system WKWebView with a nonpersistent website data store and no Tauri bridge. The distinction matters: input success is not frame pacing, window visibility is not guaranteed by document.visibilityState, and neither browser's GPU name establishes the frame rate.

## Cause isolated on the native engine

The same visible WKWebView cycled from menu to live Boot Camp to menu. Thermal state was nominal. A separate diagnostic (not the acceptance test) measured JS callback entry/exit, a 50 ms heartbeat, the simulation update, the actual composer submission, and synchronous media calls. No fidelity toggle:

| Frozen build, local WK route | Idle p50 / p95 / max | Strike p95 / max | Evidence |
| --- | --- | --- | --- |
| Before audio fix | 345 / 593 / 596 ms | 175 / 397 ms | `wk-diagnostic-KNrrCB`. On one strike frame a single HTML media `play()` call for an AI burst blocked for 204 ms. Renderer submission was at most 7 ms during idle. |
| After audio fix | 17 / 18 / 53 ms | 18 / 31 ms | `wk-diagnostic-ndNs7W`. Six nonempty decoded clips; 89 original buffer starts. Normal groups, volume and pitch, fallback and stop/restart behavior retained; no silent benchmark. |

Fresh uninstrumented two-strike route `wk-1080p-tLvdVF`: 3 targets twice, retained 1920×1080, 2,353 intervals, median 17 ms, p95 18 ms, p99 21 ms, worst 53 ms. This is a large improvement but **not** a pass of the 33.4 ms per-window maximum. First launch 53 ms, repeat centered impact 41 ms. Also distinguish the initial 2.1 s compositor warmup from either strike.

The field-photo blind pairs `hero-comparison-6HF0n7/blind/` use separately randomized columns, without builder explanations. The reviewer preferred both updated faces, slightly preferred the revised US webbing, and tied the VC rear shot. They rejected the dark eye sockets and the absence of a load at the strap ends. The matching key preserves source SHA-256s and actor/camera identity.

The movement pass found that scenery used the actual session river while local infantry detours used only seed 1968. Both squads now use the rendered sector's river. Four seeded bank tests rejected 259 candidate legs previously misclassified as dry and restored 142 actually dry legs. Mounted wall occlusion, stopping in-flight rounds and walking around a screened hut remain separate tests.
