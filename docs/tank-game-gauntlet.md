# TankDelete quality gauntlet

## Fixed references

- [World of Warcraft: The War Within — Hallowfall](https://blizzard.gamespress.com/World-of-Warcraft-The-War-Within-Alpha) (`Hallowfall_001`–`005`): judge readable shape groups, deliberately painted materials, foreground/midground/background separation, and landmarks that survive the lighting change.
- [Borderlands 3 — 2K's gameplay reveal](https://newsroom.2k.com/news/see-the-full-borderlands-3-gameplay-reveal-presentation-and-catch-the-new-gameplay-reveal-event-trailer-now): judge whether impacts, threats and actionable HUD feedback are distinguishable while the player is moving; not a tank simulation or a palette to copy.

The supplied Weston Reid study remains the local close-up construction check for infantry. References are for review, not assets to import. Prioritize side-by-side outputs with matching crop/action and no builder notes. Franchise footage is recognizable, so a comparison with it cannot honestly be called blind. For before/after TankDelete comparisons, hide revision labels from the critic where practical.

## Checked-in architecture and starting state

| Area | Current implementation | Unproven or starting gap |
| --- | --- | --- |
| Platform/build | Tauri 2 / Rust native shell. Vite builds lazy React 19 and R3F 9 / Three r182 WebGL. Chrome can run the fully bundled Boot Camp and Horde games without native file access. Desktop targets macOS, Windows and Linux; configured minimum 800×600. | Browser results are not desktop-WebView or cross-platform results. The release performance target below is specific to this Mac. |
| Tank/input/camera | WASD ground-plane drive: 8 units/s and 2.5 rad/s nominal; river drag, terrain footprint, substep sliding and arena bounds. Cursor-ground-ray turret aim, right-drag orbit, damped third-person follow and bounded chase camera; foliage cutout separate from collision. | Input jumps immediately to full speed/turn and immediately stops. Preserve cursor/actual shot agreement. |
| Weapons/feedback | M41 one-second reload, M37 duration-bound burst and recovery, flame fuel, F-4 airstrike with lingering hazard, Horde eagle, actual muzzle sockets, pooled projectiles/impacts, armor/damage effects. | Static checks cover several sockets and timings; simultaneous cues, readability in motion and normal play need captured evidence. |
| World & art | 128×128 authored/procedural arena composed around an 8-unit grid, seeded huts/folders, winding river, bridge, paddies, relocatable file sectors, Huey, jungle edge/LOD. Horde swaps to night embassy/archive defense. Custom merged meshes, vertex paint, procedural surface shaders, some licensed open-source OBJ/glTF/images. | Kit/cast metal/foliage close-up parity and action-distance readability are distinct. Independent comparison still required. |
| Encounters | Directory and virtual cleanup share layout/mark UI. Enemy patrols, friendlies, confirmed duplicate bonus, multi-wave Embassy defense, final boss, three allies, mission retry and reset paths. | Reaching a wave via debug controls is not proof of normal progression. |
| Scoring and file safety | In-memory score tracks freed MiB; achievement milestones use the freed-byte total. Separate Rust directory, staging/trash and undo commands serve native runs. Boot Camp has its own virtual entries and undo state, with no native bridge. | Actual files, OS trash/staging and native scanning were deliberately not exercised. |
| HUD & onboarding | Front menu/options, score, minimap, weapons, armor, objectives, target queue and Disarm, wave intro/defeat, ally health, audio/exposure controls. | At small size, radio and inventory can outrank the next mission action or first-hit consequence. Verify actual rectangles/scroll and semantic states. |
| Audio | Persistent field-radio transport with separate track phases and settings, game voice/weapon/ambience banks, river synth, boss stereo cues and ducking. | Browser media lifecycle is observable; stereo, peak headroom, tonal balance and seamless transitions need an actual capture/listening pass. |
| Perf & assets | Static/batched props, LOD/label budgets, lazy menu, adaptive DPR (.75–1), hidden-tab suspend, development frame/GPU counters. Menu budget is 300 kB raw/100 kB gzip, not a real-time frame budget. | Local renderer, viewport, DPR and raw distribution need to accompany any measurement. Do not infer hardware results from headless/software fallback. |

## Acceptance evidence

| Dimension | Evidence required to pass |
| --- | --- |
| Art/material consistency | Matched actual day/night close-ups for human kit and the tank plus unmodified chase shots. The critic can distinguish layered canvas, cloth, leather, oxide/weathered metal and road/foliage; reads materials without glare/noise, floating parts or foreign assets. |
| Handling/camera | Trusted input route (start, release, reverse, pivot, aim/fire, orbit and reposition) in built artifact; acceleration/braking budget, 30/60/120 Hz equivalence checks plus actual short gameplay sequence; no jump, residual hidden input, terrain bypass, lost vehicle or misleading reticle. |
| Combat/encounters | Live ready/fire/reload and overheat, marked/confirm/disarm on simulated targets only, actual Horde entry/continuous light and objective telegraph, final encounter defeat/reset; listen and inspect during concurrent hits, not just idle. |
| Composition | Matched chase and occlusion turn, route forks/river/bridge, village approach and night embassy. Legible route and silhouettes, no world seams, hidden critical objective or competing background detail. |
| HUD | Minimum 800×600 and larger checkout, normal/armed/damaged/Horde states; aim, armor and immediate objective don't collide or need scroll. Keyboard access and existing actions remain available. |
| Audio | Actual isolated capture or listen-through (launch, driving with fire, mix/voice/duck, mute/settings, exit); no clipping or unpleasant stacking; track switch independent of SFX. Code and media state alone do not prove mix. |
| Frame time | Sustain 60 fps at 1920×1080 on this Apple M5 Mac (nominal frame budget 16.67 ms). Verify in the native release build using simulated Boot Camp and Horde with sustained driving and combat, including the boss wave. Separate cold startup from warm play and record median/p95/p99, hitch counts, actual render resolution, renderer, and mode. Label periods of reduced render scale separately from full-resolution evidence. |

**Success:** Every critical check above passes on its evidence and a fresh
integration critic who has opened/run the artifact finds no blocking gap.
Baseline misses or environment limitations remain open; tests alone aren't a
substitute for a visually or audibly acceptable result.

## Ledger and bounds

12 total builder–critic rounds or 90 minutes, whichever comes first; pause a
repeated gap after three unsuccessful rounds unless a materially different
strategy is justified. Keep the current repo; no native file writes, licensed
asset purchases, external accounts, contact, publication or pushes. All
gameplay QA uses simulation. Code/asset license constraints remain unchanged.

| Round | Target / owner | Actual evidence or next correction | Verdict |
| --- | --- | --- | --- |
| 1 | Clothing construction / face artist | Boot Camp `cloth-before-*` → `cloth-r1-*`; shoulder joined, but elbow/cuff and carrier remained too smooth. | Rejected |
| 2 | Contrasting folds and carrier / face + helmet artists | `cloth-r2-*`; visible knee/turn but sleeve still insufficient; boot fastening not verified. | Rejected |
| 3 | Explicit directional folds + pigment / face + helmet artists | `cloth-r3-*`; fresh close-up critic selected Reid over game for uninterrupted sleeve highlight. Contacts and in-play readability improved. | Clothing parity open; pause repeating small profile edits; next approach would be authored fold topology plus paint authored to it. |
| 4 | Production QA / artifact harness | Matched local built resources, real input, runtime errors, HUD/radar and frame cadence. Baselines `boot-800x600-jJLSjK`, `boot-1280x800-rxvJAs`. | Pass for short local tests only |
| 5 | Weight / handling builder | Integral-based easing. 240 ms to 8 units/s, 55 ms / 0.22 units braking; real component and browser controls verified. | Pass measured envelope; no full reference feel verdict |
| 6 | Immediate HUD hierarchy / playability builder | Candidate `boot-800x600-MKR9k9`, `boot-1280x800-PgTpJZ`: single cannon hit arms 820 MB file, readout first, Disarm clears and file count stays intact. `horde-1280x800-u2ikNi`: visible archive state and support control. | Pass tested states; end-wave layouts remain separate |
| 7 | Turret paint / tank paint builder | `gauntlet-day-a/b-tank` and active-wave night views. Fresh masked-label close-up critique preferred revised cooler cheek and matching crown/stowage. | Improvement, not entire tank parity |
| 8 | Road paint / integration owner | Blind village comparison preferred V2, with clearer warm fork; evenly spaced little leaves still compete with routes and water reads flat. | Improvement; undergrowth correction next |
| 9 | Vegetation composition / tank paint builder | Bridge approach guard passed on four seeds; blind critic preferred the earlier fuller village verge and river banks in both pairs. | Rejected broad thinning |
| 10 | Encounter route / integration owner | Ordinary built Wave 1 route. Separately, `gauntlet-boss-final-*` uses dev-only clears of waves 1–3; active Wave 4 renders the boss and three allies, reports `My World` playing, and logs no runtime/shader errors. | Pass render smoke; no normal full-wave clear or stereo/mix claim |
| 11 | Complete-artifact review / fresh integration critic | `horde-1920x1080-mE8yOS`, own built-artifact run at nominal DPR1 on Apple M5 Metal. The bridge/tank/reticle read; moving threats on the far bank blend into the vegetation. | Functional smoke passes; visual sign-off withheld |
| 12 | Local bridge composition / tank paint builder | `gauntlet-day-d-*` restores the broad foliage population and reuses 27–29 existing plants into four shoulder groups on each of four test seeds. Blind daylight comparison found no material regression but little action-distance difference. | Local composition bounded; night threat readability remains open |

Production report folders are under `tmp/production-qa/`; matched art frames are
under `tmp/visual-review/`. For production QA, build `dist`, start a local Vite
preview on 1423, and run `scripts/capture-production-qa.mjs` with a dedicated
loopback CDP port. It verifies served artifact hashes and owns an isolated
browser context. None of these paths operates the user's play tab.

The Boot Camp mark check takes `--mark-x 373 --mark-y 265` at 800×600
or `--mark-x 603 --mark-y 354` at 1280×800, from the initial chase view.
The mark check sends one trusted cannon click, observes the armed HUD and
clicks Disarm without sending a confirmation; it checks the file totals.
`--orbit` captures a held and a released right drag after the timing interval.
The separate Horde route waits for a live Embassy
wave before sampling. The timing interval includes driving and a shot, but
excludes screenshot capture; raw cadence, viewport, GPU, shader errors, and
failed requests are retained in each report.

## Exact final bundle readback

All three runs below served the same `GameSession-BRQ_y48_.js`; the harness
checks its SHA-256 against `dist` on every run. The samples are browser rAF
cadence on this Apple M5/Metal at DPR 1, not GPU busy time or native release
sign-off. The 1080p run reached the requested cadence at full resolution for
8.83 seconds in Chrome during Wave 1.

| Run | Evidence directory | Median / P95 / P99 | Result |
| --- | --- | --- | --- |
| Boot Camp 800×600 | `boot-800x600-1a0rhX` | 16.7 / 16.8 / 16.8 ms | 528 frames; marked/disarmed with unchanged totals, right-drag and recenter captures. |
| Boot Camp 1280×800 | `boot-1280x800-4qXHdS` | 16.7 / 16.8 / 16.8 ms | 529 frames; marked/disarmed with unchanged totals. |
| Active Horde 1920×1080 | `horde-1920x1080-2mPWHw` | 16.7 / 16.7 / 16.8 ms | 530 frames; real live Wave 1 drive/fire/mute/exit. |

No frame exceeded 33.33 ms in these three ~9-second windows; no shader errors,
runtime errors or failed requests were reported. The earlier 800×600 baseline
had an 83.2 ms sample. A small warm route is not evidence that a hitch can't
recur. Next blocker: visually separate far-bank threats in moving night
combat and prove hit confirmation there before spending on generic polish.

A fresh integration readback matched the current built files and reported PNG
hashes, inspected the held/released orbit and marked HUD, and withheld product
sign-off on the actual 1080p night shots: figures blended into ground cover
despite a clear reticle and muzzle cue. TypeScript, the production bundle and
all 24 regression scripts passed. The 12-round boundary ended work on this
run. Native performance, a normal full Horde clear and an audible mix/stereo
review remain unverified.
