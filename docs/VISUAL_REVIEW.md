# Visual review: Vietnam realism pass

## Verdict

**Round 3 is accepted as a substantially improved playable prototype. It is not accepted as matching the supplied Battlefield / Call of Duty / Hell Let Loose visual benchmark.**

The improvement is visible in the rendered game, particularly the textured forest crowns, storm sky, burning Huey, restored hut entrances and less artificial infantry proportions. The remaining gap is not something that another global brightness change or a larger polygon count will solve. Characters, hero vehicles, animation, ground coverage and material detail still need a dedicated art-production pass for genuinely realistic close views.

This was a builder/critic loop: the critic inspected the supplied reference images and actual in-game captures, rejected visible problems, and sent specific changes back to the builders. The critic did not operate the browser or modify artwork during review. Reference images supplied art direction; they were not treated as downloadable game assets or authoritative equipment references. Original generated texture provenance is recorded in [REALISM_ASSETS.md](REALISM_ASSETS.md).

## Evidence and scope

Local review captures are under `tmp/visual-review/`; they are inspection artifacts, not shipped game assets.

- Baseline: `squad-before.png`, `forest-round1.png`. `wreck-round1.png` actually showed the chase camera and was rejected as evidence of wreck-fire quality.
- Round 2: `chase-round2.png`, `squad-round2.png`, `wreck-round2.png`, `forest-round2.png`, `paddies-round2.png`.
- Final daylight review: `chase-round3.png`, `squad-round3.png`, `wreck-round3.png`, `forest-round3.png`, `paddies-round3.png`.
- Nightmare review: `nightmare-chase-round3.png` and `nightmare-wreck-round3.png`, at the default brightness of 1.3.
- Closing forest check: `forest-final.png`, captured after the trunk-ring fixes. This supersedes the earlier pinched-trunk observations, not the remaining forest-floor density criticism.

The five fixed views expose both the normal chase presentation and close geometry that a distant camera can hide. A far inspection camera can fall outside the tank-following shadow region; contact-shadow quality should also be checked while actually driving to that position. Still images do not certify animation, temporal aliasing, collision, sound or a complete boss encounter.

## What the loop caught and corrected

| Area | Rejected observation | Round 3 result |
| --- | --- | --- |
| Forest | Detached black leaf triangles, bare trunks and oversized lime leaf plates | Textured branch clusters and lower canopy layers read as foliage. Near broadleaf scale is less intrusive. |
| Trunk geometry | Tall instance scaling and discontinuous ring orientation produced pinched triangular bark wedges | The closing forest capture shows continuous trunks without those wedges; the correction added no triangles. |
| Infantry | Inflated tubular arms, spherical chest/belt pouches and protruding facial blobs | Slimmer sleeves, flatter canvas pockets, smaller facial features and fuller helmet covers improve proportions. Rifle grips remain attached; the apparent pitch in one frontal view was not used to arbitrarily tilt weapons. |
| Sandbags | Old giant faceted shapes; replacement bags initially looked like concrete bricks | Soft, pinched sacks replace both extremes. Their local bounds were normalized to preserve authored grounding and cover placement. |
| Rice paddies | Thick garden-bed borders and almost white water sheets | Lower earthen edges and dark silt-colored water remove the strongest artificial contrast. |
| Huts | A facade rotation change exposed plain rear walls from the player approach | Entrances again face the approach; dark doorways, porches and roof edges give more depth. Plot positions were not changed to fix the facade. |
| Huey | Missing/unclear fire and distracting surrounding polygon blobs | Cabin flames and rising smoke are clearly visible; surrounding foliage replaces the prominent blob shapes. |
| Tank and sky | Clean block-like hero surfaces and flat background treatment | Sloped/cast vehicle forms, weathered surface detail and a textured monsoon sky improve the chase view. These are still prototype assets. |

No new blocking visual regression was identified in the five round-3 daylight captures. Nightmare captures retain a readable driving route and nearby tank outline, a distinctly darker storm sky, and clearly visible cabin fire and smoke. These particular views do not show an advancing zombie close enough to certify enemy readability at combat range. This is a relative improvement gate, not a declaration that every item in the user's realism ambition is complete.

## Performance evidence

The builder reported these local browser measurements at **1280 × 720 and render scale 1.00**:

| Run | Average FPS | Average frame time | Observed encounter state |
| --- | --- | --- | --- |
| Final daylight | 60.2 | 16.60 ms | 11 hostiles and 5 friendlies active |
| Nightmare chase | 60.3 | 16.57 ms | First wave inbound, default brightness 1.3 |

The separate active nightmare-wreck capture shows 10 undead remaining, 21 hostiles, 4 friendlies and zero tank breaches in its HUD. No WebGL warnings or errors were reported in these runs. Render scale 1.00 is not a claim that a Retina display is being rendered at its device-native pixel ratio.

These are local browser measurements, not guarantees for other hardware, native builds, long sessions or worst-case simultaneous combat effects. The inbound-wave sample must not be presented as a completed final-boss stress test.

The builder separately reported a passing production build, TypeScript check and all eight project check scripts. The menu bundle remains approximately 72.0 KB gzip; the deferred gameplay chunk is approximately 1.45 MB raw / 418.7 KB gzip. Those checks support integration and loading budgets, but do not replace the missing full four-wave/final-boss playthrough.

## Remaining gap to the reference benchmark

1. **Characters and animation.** Human outlines are improved but still visibly procedural. The next substantial step is properly authored, UV-mapped, rigged infantry with cloth/skin normal and roughness detail, grounded locomotion, recoil and hand/foot constraints. More overlapping primitives would mostly add cost without eliminating the mannequin appearance.
2. **Ground and vegetation composition.** The forest floor still exposes broad areas of sparsely tufted soil. Improve irregular low ground cover and verge transitions while keeping actual driving and firing lanes clear. Tree spacing and distant crown shapes remain repetitive in some views, despite the corrected trunk-ring defects. Use a small reusable plant/branch library and spatial LOD instead of uniformly multiplying density everywhere.
3. **Hero assets and materials.** The tank, wreck, crates and some cover remain simplified. Dedicated vehicle topology, damaged panels, track detail and consistent albedo/normal/roughness maps would contribute more than extra bloom. Close prop surfaces need the same treatment as the newly detailed ground and bark.
4. **Water and terrain.** Paddy contrast is corrected, but the water still lacks the convincing reflected vegetation, shoreline variation and depth cues in the supplied wetland reference. Terrain mounds and field boundaries also remain recognizably authored procedural shapes.
5. **Motion and stress verification.** Inspect camera movement for foliage shimmer, wind/culling transitions and effect-layer artifacts. Measure sustained full horde/boss combat, not only daylight infantry. Preserve the file-objective game, stable hut positions, existing audio and input behavior throughout further art work.

## Next acceptance gate

Reuse the same five camera views and normal gameplay rather than selecting only flattering angles. Keep the brightness preset consistent, record active actor counts, and require no geometry clipping, floating actors, oversized foreground leaves, disappearing flames, blank approach-facing hut walls or shader errors. Compare actual movement as well as stills. The user should approve the resulting art direction before expanding an expensive asset replacement across the whole game.

## Continuing pass: acceptance checklist (not yet a result)

The next pass starts from `production-chase-final.png` and `forest-final.png`. The normal production chase view still exposes the most important remaining problems: a plain, stacked vehicle silhouette, repetitive isolated grass spikes, broad bare strips between trees and huts, and visibly regular wetland plots. The close forest view confirms that fixing trunk geometry did not by itself make the understory dense. Those are concrete composition/material problems, not a reason to add indiscriminate polygons or hide the scene with fog.

### Visible quality gates

- **Tank:** inspect chase, front three-quarter and rear three-quarter views while stopped and moving. The turret/mantlet, hull slopes and open running gear must remain legible at the actual player camera distance. Track shoes must stay attached to the belt and move correctly when driving, reversing and pivoting. A dirty color texture alone does not establish believable armor; paint, rubber and worn metal need distinguishable, restrained light response. No oversized cannon glow, floating gunner, disconnected weapon mounts or excessive bloom.
- **Ground:** add irregular overlapping ankle- and knee-height plants around the left-hand chase-view trees, the strip before the hut row, and the near river-bank forest. Keep genuine wheel tracks, door approaches and firing corridors readable. Require multiple plant scales and patch boundaries, not another uniform grid or hedge. Paddy water must retain open patches instead of being covered by the same forest-floor plants.
- **Infantry:** inspect side and front views plus a complete cover-to-cover movement. Boots should stay grounded when idle, alternate during locomotion, and settle when movement ends. Kneeling figures must not ice-skate in a rigid pose. Shoulder, elbow and hip articulation must not separate limbs, cuffs or rifle grips. The upper body may breathe or recoil; rotating the whole figure about its ground origin should not lift planted feet. Cloth, webbing and skin should not all respond as the same smooth clay material.
- **Lighting and framing:** use the same default brightness and fair camera positions in day and nightmare conditions. Enemies must be distinguishable from nearby plants at engagement range, not only from an inspector close-up. Preserve a readable tank-game chase view; extreme zoom, shallow depth of field or heavier fog cannot substitute for asset improvement.

### Temporal and performance gates

1. Capture 10–20 seconds of normal driving and turning, including reversing and a stationary camera interval. Look for leaf-card edge flashes, texture shimmer, abrupt grass/LOD disappearance, unstable shadow edges, ground clipping and track/wheel phase jumps. A still image cannot pass this check.
2. Capture at least one US and one VC start–move–stop cycle, including a kneeling actor, followed by firing. Confirm muzzle flash and tracer origins remain at the visible barrel and that shots hit the current visible character location. Preserve the existing high-mounted tank machine-gun hit forgiveness.
3. Compare the same daylight and nightmare positions, actor counts, resolution and render scale against the previous measurements. Record average and high-percentile frame times during motion and combat, not only average FPS while idle. Distinguish the loading/first-shader warm-up sample from the settled sample. Report browser/GPU errors and any sustained budget overrun rather than silently lowering resolution for the comparison.
4. Exercise simultaneous infantry, horde and major attack effects, then restart and leave the encounter. Check for stale geometry, audio, animation state or growing resource counts. A first-wave inbound capture still does not certify the final boss or all four waves.

Read-only source review for this continuing pass confirmed that camera orbit decay and follow damping now use delta-based exponential interpolation. It also caught a pre-existing mismatch between VC cosmetic cover shifts and fixed enemy hit capsules. The builders added shared live enemy poses for direct projectile hits, friendly aim and persistent burn queries while leaving physical cover fixed. The original mismatch was not attributed to the new artwork.

## Round 4 interim review

This is an additional improvement pass, **not an upgrade of the verdict to AAA-equivalent**. Paddy artwork is still being revised at the time of this review.

Valid stills are `tank-clean-round4.png`, `forest-clean-round4.png` and `squad-clean-round4.png`, at a 1231 × 891 viewport. Earlier `tank-round4.png` and `tank-detail-round4.png` were discarded: the user was playing during capture, so weapons, actor positions, camera selection and viewport were not controlled. The opaque white shape in that mixed-state capture was not accepted as proof of a persistent graphics defect.

The tank's longer hull, seated cannon, running gear and mounted crew are substantially more legible. The critic caught that simply stretching the hull also made rotating road wheels oval; the builder corrected the matrix ordering, retained circular wheels and track-end radii, and used physical travel for track phase. The compact HUD exposes more of the game without obscuring this hero view. Forest root skirts and layered ground cover are noticeably denser. No obvious floating weapon mount, pinched trunk or missing cabin flames appears in the accepted stills.

The foreground paddies remain the strongest distraction: thick solid spear-like rice bases, a uniform gray water surface and smooth continuous raised borders. The infantry still look like procedural figures, especially in face/cloth response; nine-bone articulation does not replace an authored human asset. The squad still hides the boots behind vegetation, so it cannot demonstrate natural locomotion by itself.

### Rig and driving verification

The critic independently ran the updated `check-infantry.mjs` successfully. In addition to static geometry/scale/hit tests, it checks grounded contacts, alternating foot lift, world-space support-foot drift, matching skin/weapon/muzzle transforms, immutable shared geometry, and StrictMode detach/reattach/disposal. The builder corrected unreachable crouch foot targets by limiting hip rise to actual leg reach. These checks validate transform math, not the visual quality of a full animation cycle.

Four driving stills were inspected from a 20-second normal-movement route: `drive-round4-0.png`, `drive-round4-2.png`, `drive-round4-4.png` and `drive-round4-7.png`. Tank positions and headings change; the final frame shows the route stopped. There is no obvious camera teleport, tank disappearance, mount separation or lost wreck fire in those snapshots. Continuous foliage shimmer, short popping events and subtle foot sliding cannot be certified from separated stills.

The eight samples in `drive-round4-metrics.json` report render scale 1.00, 60.5–60.7 FPS, 16.46–16.53 ms average frame time, sampled one-second-window P95 values of 17.3–18.2 ms, and a highest **sampled** window maximum of 22 ms. Textures stay at 50; geometry counts vary between 197 and 207, which alone does not demonstrate a resource leak or prove that none exists. The screenshots show 5 hostiles and 3 friendlies during this route. This is a larger viewport but a lower actor count than the previous daylight sample; it is not an apples-to-apples full-population comparison or a final-boss stress result. The builder reported no new graphics errors; the log contained an older resolved merge error. The JSON's `running: false` field was a case-sensitive button-label instrumentation mistake and is excluded from the evidence; the visible drive-control state and tank poses were checked instead.

## Optional character-asset investigation

No third-party character was downloaded or added during the initial candidate investigation. One budget-feasible candidate is [BAMEN's FREE Military Soldier RIGGED](https://sketchfab.com/3d-models/free-military-soldier-rigged-e9c56308a67d4a3db62e914fafa4d198). The creator's indexed listing identifies an FBX with a complete skeleton, 11.1k triangles, 6.3k vertices, mostly quad topology and basic materials, under CC Attribution. Direct page access returned 403, so the current downloadable license text, exact license version, bone count, material slots, skin weights and visual quality were not independently inspected. This is a candidate, not clearance to import or a claim that it already meets the realism target.

At the advertised count, sixteen copies would total approximately 178k triangles, versus roughly 125k for sixteen current procedural bodies. That estimated increase is plausible to test with shared geometry, textures and distance LOD; it is not a frame-rate guarantee. Modern tactical equipment would need adaptation to period fatigues/webbing, and basic materials would need a proper cloth/skin surfacing pass. The safe integration gate is one soldier with verified provenance and attribution, a bounded material/texture budget, correct muzzle and grip sockets, and a measured A/B against the current actor before changing the whole squad. Existing AI, roles, hit logic and combat behavior should remain intact.

The more directly themed [Vietnam Soldier by Pieter Ferreira](https://sketchfab.com/3d-models/vietnam-soldier-rigged-35a41ba86fba47f981024f2ce32b1a30) is not a drop-in recommendation: its creator listing advertises 120.7k triangles, one 2048px material and a Mixamo rig, with CC Attribution and a NoAI tag. Sixteen full-resolution copies would be approximately 1.93 million triangles. It needs major LOD/retopology and terms review, not an unexamined import through an AI-assisted asset workflow. No licensing assumption was made about the three.js example Soldier model.

## Round 5 follow-up: reviewed improvements and remaining gates

This is a later, bounded review, not a replacement for the historical measurements above. **The reference-quality verdict remains unmet.** The close ally views now support a relative improvement for the original stylized bonus characters. The separately prepared authored human-head asset still requires in-game fit and LOD validation.

### Paddy and instance-lifecycle review

`paddies-clean-final-round5.png` is valid post-fix evidence at 1231 × 891. The rice now consists of individual slender stems and curved leaves instead of solid tapered cones. Greener panicles, low irregular banks and reflected sky make the field more convincing. The near-right allied sandbags are visible again: the large white origin dome from `paddies-water-final-round5.png` is absent in this capture. The newly seated rusty drum also replaces the earlier half-buried black barrel cap.

The water is improved, but its midground reflection still forms conspicuous parallel gray-white streaks. Close foreground crates remain perfectly plain olive cubes, and repeating roof ridges can read as manufactured roofing rather than thatch. These are specific remaining art gaps; neither a global brightness change nor a larger vegetation count would resolve them.

Two concrete correctness defects were independently checked:

- Hill collision transformed world coordinates with the wrong Y-rotation sign, mirroring an asymmetric collision ellipse relative to its rendered mound. A Three.js-transformed point on the first mound gave an inside value of 0.9025 but the old predicate returned 1.18824, incorrectly outside. The corrected indexed predicate is now compared with actual inverse Three.js render matrices over approximately 15,000 points and four paddings.
- Terrain material identity was passed through `InstancedMesh` constructor arguments while the placement effect did not rerun on material replacement. Fiber reconstructs objects when constructor arguments change; new instance matrices start as identity, which can leave unit spheres at the origin. `TerrainReliefMesh` now keeps constructor arguments stable and updates the material as a property. An actual Fiber/StrictMode regression swaps three terrain materials without unmounting and checks mesh identity, all 42 placed matrices, assigned materials and culling bounds. This proves the specific reconstruction defect is fixed. One clean capture without the dome does not prove every possible effect artifact is eliminated.

The critic independently reran the updated scene checks successfully. The three tested foliage seeds produce approximately 590k–596k triangles, 10,000 grass clumps, about 1,920 low shrubs and 11–12 imported photographic ferns. The rice separately uses 3,470 clumps × 78 triangles = 270,660 triangles in one instanced draw at the training seed. These are geometry budgets, not full-scene or GPU-time totals.

### Fern review

`ferns-clear-round5.png` uses a valid clear camera and demonstrates denser grass, layered ground cover and leaf litter. It does not yet isolate the new imported fern: taller surrounding grass obscures its frond silhouette. Local, irregular grass thinning around existing fern footprints is a reasonable next composition adjustment; a bald circular clearing would create a new artificial pattern. The older `ferns-close-round5.png` was obstructed by a foreground trunk and is not accepted as an imported-fern quality check.

### Boss, allies and verification limits

`nightmare-actual-round5.png`, `boss-transition-round5.png` and `boss-allies-clean-round5.png` show functioning nightmare/boss presentation, the separate Change/My World radio states, the final wave and the three correctly named ally HUD entries. Progression to the final boss used visible developer QA damage/clear-wave controls. It was not a normal player completion or a difficulty/balance test. A reported 60.5 FPS window at render scale 1.00 is not a sustained final-boss stress result.

The first boss capture exposed a genuine style mismatch: the old allies still used flat unlit primitive bodies. Their replacement now uses the shared articulated infantry shapes, role-specific costumes and weapons, a seated mounted rider, directional protected fill and retained halos without aura sprites. Independent geometry/rig checks pass: Arnold's body is 8,174 triangles plus a 904-triangle weapon; Rambo is 7,818 plus 896; Theodore is 7,836, with a 6,044-triangle horse and four 560-triangle legs. Tests cover red headband presence, head/halo clearance, exact neutral barrel-tip sockets, held-weapon transforms and the existing hit/rig/lifecycle invariants.

Those checks alone do not certify the new allies' appearance. In `boss-allies-clean-round5.png`, the actual ally bodies are offscreen or too far away for an anatomy, saddle or material assessment. The `boss-upgraded-round5.png` title overlay hides them. Subsequent `rambo-follow-round5.png` and `roosevelt-follow-round5.png` provide valid close evidence: Rambo has a visible red headband, separated limbs, held rifle and readable halo; Theodore sits across the saddle with his boots outside the horse's body. Some foreground boss geometry occludes the rider's arm/sword, so that grip is not fully assessed. The improvement is accepted relative to the previous unlit primitive bodies, not as realistic characters. Rambo still has a planar chest, uniform tubular arms, simple hands and a procedural face. The horse is recognizably toy-like, with rounded volumes and peg-like legs. An authored body/horse and appropriate materials would produce a larger next gain than additional tiny primitive details.

The critic found that the initial presentation update ran before the parent's current movement. The builder replaced that separate frame subscription with an explicit parent-owned update after translation/yaw and before muzzle sampling. The critic reran the updated checks successfully, including the actual synchronization boundary under moved/turned roots and one presentation update per frame. This fixes the identified update-order defect; it does not make a still image proof of natural locomotion. In particular, the horse's current single-piece leg swings do not provide a fully articulated, planted-hoof gait.

`paddies-after-terrain-fix-round5.png` is explicitly excluded: it captured an intermediate `GuardianHalo is not defined` menu error during the ally builder's hot reload. The stale reference was subsequently removed and checks passed; that image is not evidence of the final environment. Further MakeHuman-based head preparation is not claimed as shipped or visually validated in this review.

### Authored head study and first in-game integration

`free-head-study-round5.png` is a separate asset preview, not an in-game capture. The CC0 MakeHuman/Mindfront study shows substantially better jaw, nose, lips, ears and skin detail than the existing primitive face. It measures approximately 0.177 m wide by 0.250 m high and uses 8,452 triangles with the original 2048 × 2048 diffuse image. The temporary eyeballs are not yet visually accepted: the far eyelid/socket has a dark colored rim and the stare is toy-like. Independently measured eye-helper centers in the morphed source match the preview exactly; changing centers arbitrarily would not solve eyelid occlusion, iris shape or a possible normal-map issue. The jagged open neck cut must remain inside the collar in all head poses.

The initial integration is limited to regular US light-skin variants, preserving the darker existing variant and all VC, tank crew and bonus ally appearances. The mapped head needs a separate material/mesh because the procedural body merger strips UV coordinates. The existing head bone provides the neck-local attachment and the soldier parent already applies the 0.72 world conversion. Helmets, straps, uniforms, weapons, hit volumes and AI must remain unchanged. Acceptance requires no duplicate primitive face, no hat/ear/strap penetration, no collar seam, consistent skin response with the hands, a shared texture, safe loading/failure fallback, and a visually stable near/far LOD transition. A 2K RGBA image is approximately 16 MiB before mipmaps, or 21.3 MiB with its mip chain; it must not be duplicated per actor.

`us-authored-head-round6.png` subsequently confirms that the mapped head is attached beneath the existing US helmet in the actual scene, while the darker procedural variant remains present. No obvious duplicate face or gross head displacement appears. The face occupies only about twenty pixels in that squad view; it does not pass the close eyelid, collar, strap or LOD inspection. The builder has reduced the temporary eyeball radius and made the iris/pupil conform to the globe, but those changes still need the closer capture.

The critic independently ran `check-authored-head.mjs` and `check-hero-assets.mjs` successfully. The head check parses the real binary, verifies the original diffuse hash and absence of a referenced normal map, checks 8,452/2,452-triangle near/far meshes and matching source position/UV pairs, and exercises the actual React Three Fiber component through pending, successful and rejected loads. It also verifies bone attachment, distance hysteresis, original-body fallback and unmount cleanup. Those are concrete integration safeguards, not a claim that the renderer has produced reference-quality anatomy or a seamless animated LOD transition.

The subsequent `us-face-close-round6.png` makes the human jaw, cheeks, lips and nose clearly visible, but the high camera angle and helmet hide both eyes. It also confirms an exposed jagged neck edge above the left collar. The builder is extending only the lower neck boundary into the collar; this close-fit defect is not marked resolved until a new capture verifies it. Compared with the imported face, the existing spherical shoulder caps, flat chest, mitten-like hands and coarse tall rifle handguard are now especially conspicuous. They remain procedural asset limitations, not evidence that the authored face should be removed.

`us-face-seam-fixed-round6.png` then provides the needed lower, three-quarter view. The jagged neck cut is no longer exposed above the collar. Both eyes sit within the eyelids without the original detached-globe appearance. Those aspects pass for this standing view; kneeling motion and visible near/far transitions are not thereby certified. A sharply angular dark patch on the temple/cheek remains worth checking at another yaw. The source uses a 48-unit-wide 2048px shadow map, so a compact face spans only a few shadow texels; coarse helmet shadows are a plausible explanation, not a proven geometry defect. The rest of the soldier still needs authored cloth/weapon refinement to match the new face.

### Optional supply-crate failure verification

The critic found that the initial authored-crate component had a loading fallback but no local error boundary. The builder added the boundary so a missing optional OBJ/TGA cannot propagate to the level error screen. A new independently written `check-supply-crates.mjs` (`check:props`) executes the actual component through React Three Fiber with StrictMode. It parses the real OBJ and TGA data, checks pending model/textures, the 768-triangle merged result, one batch with three correctly placed static instances and valid bounds, then separately rejects the model, diffuse and normal requests. Every rejected-load case retains all three procedural crates. Unmount removes the batch and disposes owned geometry/material/texture wrappers without disposing or mutating cached source geometries and decoded textures. The check passes; appearance of the imported prop still requires an actual view.

That view is supplied by `paddies-authored-props-round6.png`: the crates show distinct woodgrain, plank and diagonal brace detail instead of blank olive boxes. The paddy water also has calmer broken reflections rather than the previous regular white foil-like streaks, and there is no origin dome. These are accepted local improvements, not a benchmark pass for the whole wetland: regular plot rims, repeated rice clumps and roof rows resembling tiles more than loose thatch remain visible. `ferns-revealed-round6.png` is excluded because it caught a menu reload triggered by the announced package-script change, not the fern scene.

### Additional open-asset discovery

A bounded, read-only search of the user-suggested itch.io, OpenGameArt, Free3D and Clara.io sources found two creator-posted CC0 vegetation candidates worth auditioning. No archives were downloaded or new assets integrated by the critic. Neither candidate is claimed to meet the visual benchmark before inspection and an in-game comparison.

- [Yughues Tropical shrubs](https://opengameart.org/content/tropical-shrubs): the original creator's page explicitly lists CC0 and a directly available 4.6 MB 7z archive. It is a candidate for species and understory variety. The page does not publish mesh format, material count or polygon budget; those remain archive-inspection gates.
- [Yughues Palm tree v2](https://opengameart.org/content/palm-tree-v2) and [Julius's reduced edition](https://opengameart.org/content/palm-tree-v2-low-poly-edition): both list CC0. The derivative author reports 451 polygons versus 1,032 in the original, with 512px textures versus the original 1024px. Those are published polygon counts, not independently measured triangle counts. Direct archives are 1.4 MB ZIP and 3 MB 7z; mesh formats are not stated. This offers a potentially economical authored near/far pair, subject to silhouette, alpha, UV and conversion checks.

[CC0's official deed](https://creativecommons.org/publicdomain/zero/1.0/) permits copying, modification and distribution, including commercial use. That is different from merely being priced free. For example, [Free3D's Vietnam soldier](https://free3d.com/3d-model/vietnam-soldier-16683.html) lists Personal Use, unknown authorship, no rig and no textures; it is not a cleared replacement. [The Soldier on itch.io](https://alessio-colabianchi.itch.io/thesoldier) is a 774 MB Unreal 4.20 student project with no explicit reuse license on its page. Other examined itch packs either omit clear licensing, prohibit redistributing asset files, or deliberately use a stylized/low-poly aesthetic. No fully verified realistic, rigged, period-correct infantry replacement emerged from this bounded search. Clara.io could not be accessed and verified here. Fab and Megascans were excluded as the user requested.

## Round 7: authored plants and measured daylight drive

The builder subsequently inspected the original plant archives and integrated the approved reduced palm and six feathered shrub-05 replacements. Independent `check-authored-plants.mjs` execution passes. The actual meshes are 451 and 608 triangles, using unmodified diffuse-alpha maps and creator CC0 provenance. Loaded palms replace their previous trunk/crown batches rather than overlap them; shrubs replace six existing safe plots, with the original batches retained on pending or rejected optional loads. The tested foliage totals are approximately 575k–579k triangles, 23 loaded batches and at most 24 during partial loading. Two shared diffuse mip chains add about 4 MiB. These are plant-subsystem budgets, not complete rendered-frame totals.

The palm in `drive-round7-2.png` has readable ringed bark and a coherent drooping crown, without an obvious detached top or pale alpha fringe. That is a visible local improvement. `forest-authored-palms-round7.png` has no near palm, and the six new shrub silhouettes are not isolated sufficiently to certify their close alpha/scale appearance. The forest still needs more varied authored trunk/ground composition to meet the supplied reference benchmark.

`drive-round7-5.png` exposes a separate important problem: nearby foliage almost completely obscures the player tank during a pivot. The intervening leaves appear to be the broader dense forest vegetation, not necessarily the newly imported palms. Regardless of cause, this fails the player-readability gate and should be checked in adjacent motion frames before accepting camera/foliage interaction. More density is not a solution to this issue. The wreck's flames remain visible and these captures do not show a terrain-origin dome.

The critic read all eight entries in `drive-round7-metrics.json`: render scale 1.00, 60.5–61.0 FPS, 16.39–16.52 ms average frame cadence, one-second-window P95 values of 18.1–18.6 ms, and a highest sampled window maximum of 23.6 ms. GPU-reported window averages range from 4.95–10.51 ms; full-pass counts range from 174–274 draws and approximately 1.145–1.305 million triangles. Textures remain at 59 and geometries range from 200–213, which alone neither proves nor disproves a leak. These are eight sampled windows, not a continuous-run percentile, cross-device guarantee or boss stress test.

Independent render-control checks pass for the new telemetry: bounded asynchronous queries, unavailable-result avoidance, disjoint/context-loss handling and cleanup. The actual diagnostic subscriptions bracket the existing composer render, while CPU frame cadence is measured separately. A near-16.6 ms display cadence must not be presented as the GPU render time.

## Round 9: bounded foliage camera cutout

**Accepted as a local player-readability improvement, with temporal quality still unverified.** This does not upgrade the reference-quality verdict. The critic inspected `camera-ab-off-14.png`, `camera-ab-on-14.png`, `camera-ab-off-16.png`, `camera-ab-on-16.png`, `night-camera-round9-03.png` and `night-camera-round9-08.png`, then read the actual `FoliageSightline.tsx` implementation and material wiring.

In the frame-14 baseline, an enormous nearby leaf spray covers much of the tank and central view. With the cutout, the tank, soil route, paddies and huts are visible again. Surrounding trunks and canopy remain, including the trunk beyond the tank; this is not wholesale removal of the forest. The frame-16 enabled capture retains the wooded enclosure while showing a small feathered/stippled opening in the nearby left trunk. That visible pattern is an aesthetic compromise, but is preferable to a foliage screen covering the player. Neither pair shows a large cleared halo around the vehicle or removal of distant scene detail.

The two night captures show the tank outline and immediate route remaining readable beneath the canopy, with the storm sky, surrounding forest and wreck fire retained. Their HUDs show active wave 1/4, with 10 and 6 undead remaining respectively; they are not final-boss stress evidence. The brighter wreck/open-field view alone would not demonstrate near-foliage behavior. The later wooded view supplies a relevant night camera check, but neither still certifies enemy identification at every combat distance or suitability for a bright physical room.

### Implementation and evidence limits

- The camera-only shader tests a short corridor from the eye to the tank's upper hull, limited to progress `0.0–0.97`. Its nominal radius grows from 0.8 to 1.6 world units, with a 0.45-unit feather. Dense-jungle bark, canopy, fronds and understory, plus the imported plant material, use the same bounded test. Buildings, terrain, actors, collisions and shadow materials are unchanged. Trees beyond the tank are not intentionally made transparent.
- The effect uses opaque fragment discard and a fixed screen-space threshold rather than sorted transparent geometry or an added render pass. One scene-local uniform update follows the camera. The default is enabled in normal play; only the development comparison switch disables it. Isolated inspection cameras do not use the chase cutout.
- The A/B pictures are not exact pose matches: the recorded frame-14 positions differ by approximately **1.75 m**, frame 16 by **1.22 m**, and headings by **0.06 radians**. These comparisons support the obvious visibility improvement, not precise pixel-area or exclusively shader-caused performance claims.
- Independently rerun `check-scene-assets.mjs` passes the current shader, instancing, wind-preservation, finite-input, opaque-depth and scene-asset checks. These tests cannot establish visual motion quality. Still screenshots cannot certify dither shimmer, crawling edges during turns, transient popping, shadow/cutout mismatch or smooth reappearance after camera obstruction. A contiguous driving/pivot/reverse recording through close trunks and leaves remains the acceptance gate for those effects.

### Measured cost, not a frame-rate guarantee

The critic recalculated `camera-ab-metrics.json`. Taking the 18 samples at frames **2–19** to exclude the initial two comparison windows, mean reported GPU time is **6.77 ms off / 7.38 ms on**, an observed difference of **+0.61 ms**. The result depends on the sample boundary: excluding only frame 0 produces +0.52 ms, while including the baseline's initial 162.8 ms cadence hitch makes the whole-run mean comparison misleading. Active rendering counts and camera poses differ between runs; this is not a controlled microbenchmark or proof of identical overhead on other hardware. Both selected runs use render scale 1.00 and approximately 60 FPS display cadence.

The 12 night samples average **9.70 ms reported GPU time** and **16.405 ms frame cadence**, with sampled-window P95 frame times **16.7–18.9 ms** and a highest sampled frame of **21 ms**. These figures describe this local active first-wave route, not sustained boss combat, a complete percentile distribution or a promise that every device remains within budget. Close shrub presentation and authored-head LOD images are a separate pending review, not implicitly accepted by this camera check.

## Round 10: exposed shrub and experimental grass detail

### Shrub: composition passes, material appearance does not

`shrub-before-round10.png` and `shrub-after-round10.png` show the same selected plant and inspection framing. The new local grass shortening exposes the authored shrub's fronds without introducing a bald circular clearing. It fixes the previous inability to inspect the plant, but the revealed shrub is almost black and its layered planes read too sharply against the neighboring green vegetation. **The reveal is accepted; the shrub material is not yet visually accepted.** Combat continued between captures (armor and friendly counts differ), so this is a controlled viewpoint, not an identical full-scene snapshot.

Read-only inspection narrows the likely cause:

- The actual 608-triangle OBJ has finite, approximately unit-length normals (0.99993–1.00007). None of its 1,824 triangle-corner normals oppose the face winding; the minimum normalized agreement is 0.759. There is no evidence here for corrupt/inverted normals, and blindly recomputing them is not justified.
- UVs span 0–1. The decoded 512 × 1024 diffuse-alpha map has approximately 59.6% of texels below the existing 0.5 alpha threshold. Thin feathered frond edges and holes are visible in the screenshot, rather than opaque black rectangular card backgrounds. This does not look like a wholesale alpha-loading failure.
- The retained diffuse pixels are inherently dark: mean source sRGB is approximately **(40.6, 43.6, 10.5)/255**, median luma is **37.2/255**, and about **19.4%** have luma below 20/255. The earlier isolated `shrub-asset-study-round6.png` is also dark without the current forest composition. These values are diagnostic source measurements, not proposed albedo targets.
- The production material preserves the original map, uses sRGB decoding, a non-emissive double-sided standard response and receives forest shadows. The source archive includes a normal-map file, but it is intentionally not used in this integration and was not validated in this review. Dark authored albedo combined with this leaf-light response is the strongest evidenced explanation; the separate contribution of canopy shadows has not been isolated by a material A/B. Valid normals do not mean low-poly cards will never look faceted.

The highest-impact next action is a **same-view, shrub-only material audition**: calibrate a neutral albedo lift first, then test restrained wrapped/back-face leaf illumination only if necessary. Preserve the original alpha silhouette and compare lit and shaded orientations. A temporary shadow-receive A/B can diagnose the shadow contribution but is not an automatic reason to ship shadowless foliage. Do not raise global exposure, remove more surrounding plants, blindly regenerate normals or make the shrub glow. If the layered-card silhouette remains conspicuous after sensible material tuning, audition a better plant variant rather than multiplying this one across the forest.

### Grass LOD: inconclusive; remains development-only

The critic inspected `grass-on-round10-06.png`, `grass-on-round10-15.png`, all 22 entries in `grass-on-round10-metrics.json`, and the actual `DenseGroundCover.tsx` switch. The logged far-chunk sequence is **1 → 3 → 2 → 3 → 1**, so the experimental detail-selection path did execute. It changes a chunk from 17 to 4 triangles per clump beyond 60 m and returns to near detail inside 52 m, using chunk-edge distance and hysteresis. The same instance matrices and batch are retained. The code still requires the development `grassLodReview` switch; production does not enable the far replacement.

**Neither visual transition quality nor a performance benefit is accepted from this run.** Frame 06 is dominated by foreground canopy, hiding the far grass being tested. Frame 15 reveals more ground but does not isolate the same chunk at both sides of a threshold. The builder also reported a late hot reload. Camera motion, actor changes, obscured surfaces and that reload prevent a fair steady-state comparison. The 59.4–61.3 FPS display-cadence range, 5.02–12.79 ms reported GPU windows and approximately 1.297–1.364 million submitted triangles are observations, not attributable LOD savings. Counts switching in telemetry do not prove an imperceptible on-screen transition.

Before enabling it, repeat with source edits paused, a clear view of one identified ground-cover chunk, and matching off/on camera paths through both hysteresis thresholds. Capture continuous motion and matched settled GPU windows. Require unchanged grass coverage/color, no obvious silhouette or shading pop, no flicker during reverse movement, and a measured benefit. Keep it off by default until those gates pass. Authored-head LOD remains a separate unreviewed item in this round.

### Shrub material follow-up: gain 4 accepted locally

The critic compared the same fixed shrub view in `shrub-after-round10.png`, `shrub-albedo2-round10.png` and `shrub-albedo4-round10.png`, with the builder holding brightness at 1.3. **The current gain of 4 is accepted as a bounded material correction in this daylight view**, superseding the earlier near-black material rejection for this captured condition. Gain 2 still buries much of the frond detail. Gain 4 makes outer leaflet ribs and overlapping green fronds legible while retaining a shaded interior. It does not visibly wash the leaves white, flatten them into a uniformly bright mass or make them look self-lit.

Source review confirms `AUTHORED_SHRUB_ALBEDO_GAIN = 4.0` multiplies only the shrub's linear diffuse RGB after map sampling, capped per channel at 0.85. Original alpha, UVs, source textures, normals, shadow reception and scene lights remain unchanged. There is no emissive term, extra lamp or extra rendering pass; the palm material is unaffected. The critic independently reran `check-authored-plants.mjs` successfully, including the gain/clamp, zero-emissive, original-alpha/UV, grounded-instance, fallback and cleanup checks.

This is not scan-quality or all-lighting acceptance. The existing 608-triangle card construction still looks angular in the close view, and the hidden core remains strongly shaded. Dynamic scene time and combat state differ between the captures, so they are not perfectly identical shadow frames. Additional bright-sun, reverse-angle and nightmare views would be needed to rule out localized clipping or an over-bright response elsewhere. No further gain increase, global exposure adjustment or expanded planting is justified by these images alone. The experimental grass-LOD verdict remains unchanged and inconclusive.

## Round 11: M16 and upper sleeve critique

The critic inspected `infantry-face-round11.png` and `infantry-squad-round11.png` against `us-face-seam-fixed-round6.png`. **The M16 silhouette is accepted as a local improvement; the new shirt/sleeve join requires another correction.** The narrower stock and receiver, tapered handguard and sloped open carry handle are visibly less block-like in the close image. This is improved procedural weapon geometry, not an authored/textured weapons benchmark pass. The distant squad view shows held weapons and active tracers, but does not by itself validate every dynamic muzzle transform.

Removing the old spherical shoulder cap eliminates a conspicuous ball-shaped mass. However, the new close image exposes a broad triangular shirt edge over the upper arm, resembling a rigid epaulette rather than a continuous fatigue sleeve. A small dark wedge at the outer-left shoulder may be an exposed open rim or a hard shadow; one still is insufficient to call it a proven hole. The source supplies a plausible join problem: the torso radius narrows abruptly from 0.195 at Y1.405 to 0.071 at Y1.445, while the sleeve begins only 0.029 units inward with a full 0.070 × 0.074 ring and no end cap.

The bounded follow-up sent directly to the builder is to soften the neck-to-shoulder slope with intermediate torso rings, bury/taper the first sleeve ring fully within the shirt and close only its hidden end. Blend the first sleeve rows into a cloth crown instead of restoring the removed sphere. Preserve the elbow, wrist, weapon sockets, actor scale and shared-draw structure. Require close side/rear and changed-pose views before declaring the join seamless; do not conceal it with more vegetation or brighter lighting.

The critic independently reran `check-infantry.mjs`: geometry, nine-bone articulation, planted contacts, weapon sockets, resource lifecycle and swept-hit checks pass. The current regular M16 is 436 triangles; clothed US bodies are 7,426 triangles per tested stance. Those numerical checks do not override the visible shoulder defect. Sleeve refinement remains in progress, while authored-head LOD and full animation naturalness remain separate open gates.

## Bounded regular-squad M16 silhouette pass

The earlier `us-face-seam-fixed-round6.png` exposes an oversized rectangular carry handle and stacked-box receiver beside the more natural authored face. The regular US rifle builder now uses low-segment beveled receiver profiles, a tapered fixed stock, a thinner sloped carry handle with a genuine opening, and a softened triangular handguard. This is a geometry-only change: the existing barrel and flash hider, rifle group origin, hand/grip anchors, muzzle socket, character scale, animation transforms, firing timing and AI remain unchanged. It does not change the separate boss-allied rifles or the soldier body/shoulder meshes.

The actual revised builder produces **436 triangles, up from 260**, within the 600-triangle cap. Five visible rifles add 880 geometry triangles before additional rendering passes, with the same shared geometry/material and no additional draws. The infantry check executes that exact builder and verifies finite unit normals, valid bounds, one merged material batch, unchanged barrel/butt endpoints and narrow width, hand-to-surface proximity, the existing muzzle-to-end-cap offset, and a ray-clear handle opening with a solid top bridge. TypeScript and the full existing infantry articulation/socket/hit/lifecycle checks pass.

**Visual acceptance is pending a fresh Face/Squad capture.** Shape and transform checks do not prove the new profile reads correctly in game, nor do they resolve the remaining procedural clothing/animation gap against the supplied AAA references.

## Aircraft and M48-pattern running-gear correction

This pass authors original geometry using primary museum/reference evidence; it does not import models or textures from a commercial game. The inspected reference captures are `reference-f4-rear.jpg.png` (USAF museum rear photograph: paired circular exhausts and drooped stabilators) and `reference-huey-side.png` (Smithsonian front/side photograph: long utility cabin, divided windscreen, chin glazing, two-blade rotor and curved skids). Sources: [NMUSAF F-4C Phantom II](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/2929390/mcdonnell-douglas-f-4c-phantom-ii/), [Smithsonian UH-1H image](https://airandspace.si.edu/collection-media/NASM-A19960005000cp06), and [US Army M48 reference](https://odin.t2com.army.mil/WEG/Asset/M48_Patton_American_Main_Battle_Tank_%28MBT%29). These support silhouette choices, not a claim of dimension-perfect replicas.

- **Phantom:** the stacked flat wing overlays and primitive fuselage are replaced with a shaped fuselage/radome, separate swept inner and upturned outer wings, downward-angled stabilators, swept vertical fin, tandem canopy frames, side intake/splitter surfaces and closely paired recessed exhausts. The model is 1,252 triangles in four merged batches. Existing +X-forward frame, 0.52 instance scale, Hermite flight path, audio/release/impact timing, bomb effect and napalm collision/area damage are unchanged.
- **Huey:** backward-compatible helpers now provide a long-cabin UH-1D/H-style assembly, open troop-bay apertures, cockpit/chin glazing, engine cowling, rising tapered boom, tail stabilizers, curved tubular skids and genuinely opposed two-blade rotors. Rotor anchors are unchanged; the corrected side-mounted tail rotor lies in YZ and rotates around X. Intact geometry is 1,010 triangles, distant detail 730, and a wreck omits two roof triangles and shortens one rotor blade. Each assembly has five batches including its two movable rotors. Intact paint no longer receives the wreck scorch patch. Consumer wiring is coordinated separately with the owner of `VietnamEnvironment.tsx`.
- **Tank:** six road-wheel pairs replace seven. Distinct front idlers and rear toothed sprockets occupy the existing track end centres, and six suspension arms follow the road-wheel positions. The actual 1.35-length hull leaves clearance between adjacent wheels. Existing track loop/phase, inverse-Z correction, cannon mount, hull bounds and collision system are not changed. Two fewer individual hub draws offset the two end-wheel instanced batches; running-gear draw count is unchanged.

`check-aircraft.mjs` executes the real aircraft helpers and verifies finite unit normals, bounds, merged batch/triangle budgets, upturned wings versus drooped stabilators, paired exhaust caps, open troop bays, rotor axes/two-blade extents, skid grounding envelope and scorch variant. Existing hero/wetland checks also pass, with new six-wheel, spacing, bounded end-wheel and inverse-scale assertions. These are source/geometry checks, **not yet live visual or temporal acceptance**. Fresh aircraft flight, wreck and tank side captures are required, followed by normal in-game motion inspection. The remaining authored-asset, animation and full encounter stress gaps are not resolved by these bounded silhouette corrections.

## Current world-pass QA: river, village, perimeter and embassy defense

This is a progress checkpoint, not acceptance against the AAA reference bar.
The separate critic reviewed the initial defense logic and identified retry
cleanup gaps; those were corrected. The workers then reached their usage limit.
The later images and fixes below were reviewed by the primary builder, not
independently approved by the critic.

### Live evidence and corrections

- `world-edge-alpha.png` and `world-corner-alpha.png`: the inspected boundary
  views no longer show huge unmasked white triangle cards. Seeded tree depth and
  height break up the previous rigid perimeter. Pale far trunks, sparse floor
  pockets and visible card construction remain quality gaps.
- `world-village.png`, `world-river-layout.png` and
  `world-river-bank-final.png`: the river bends through the village instead of
  following a straight map edge. Shared placement clearances keep huts out of
  the water, and the central bridge reaches both banks. The bank was initially
  too black because its vertex mud colours were multiplied by another dark
  material tint; removing that second tint restores a brown bank/water edge.
  Fog and the HUD obscure part of the aerial image, so it is not a complete
  map-layout beauty shot. Huts have varied roof/height and courtyard placement,
  but their roof bands and construction still read as procedural.
- `world-huey-wreck.png`: the revised cabin and two-blade wreck silhouette are
  wired into the scene, and the existing fire remains visible. Fresh intact
  Huey flight and tank-side visual acceptance remain open.
- `world-embassy-clear.png`: the compressed six-floor chancery, annexes,
  grillwork, courtyard and burning rubble form the night defense space.
  `world-embassy-night.png` was tree-occluded and is not an acceptance image.
  The buildings remain simplified rectangular game geometry, not scanned or
  survey-accurate embassy assets.
- The first undead close-up was rejected for a cartoony head and oversized
  spherical eye glow. `world-zombie-authored-fixed.png` verifies the shared CC0
  mapped head after fixing the warm-cache host-ref attachment race. Cold/warm
  load and fallback tests now cover that race. Smaller socket-aligned eye glow
  and a tighter helmet were subsequently applied; the final eye/helmet tuning
  needs another isolated live close-up. Cloth deformation, hands and locomotion
  still fall short of the supplied character references.
- `world-boss-launched.png`: the normal four-wave transition path (using visible
  development-only wave-clear buttons) reached the final boss. All three
  support health bars appeared, allies fired, boss health decreased, and the
  radio HUD switched to My World. This does not replace a complete manual boss
  fight or listening test.
- `world-archive-defeat-final.png`: the real archive-damage handler exhausted
  all three in-memory proxies while the tank still had 100% health and zero
  breaches. The dedicated failure dialog showed 3/3 archives lost, retry/menu
  controls and stopped radio state. Retry restored all archives, tank health,
  the five-person US squad and first-wave Change playback. No real files were
  used or modified by this defense test. One keyboard-driven attempt advanced
  into retry before capture and was excluded from terminal-state evidence.
- The initial aircraft inspection (`world-phantom-actual.png`) exposed a real
  canopy intersection at the old 7m pass height. The new flight envelope moves
  the small jet farther out and keeps it above the mature crowns. Three timed
  captures, `world-phantom-high-0.png` through `world-phantom-high-2.png`, show the
  actual moving model above the forest through approach, release and exit.
  They show a locally improved Phantom silhouette, not detailed AAA aircraft
  materials. The ordinary chase follow-up was foliage-occluded and its gameplay
  state changed, so it is not accepted as a clean aircraft readability test.
  Earlier missed/occluded files named `world-phantom-flight.png` and
  `world-phantom-canopy-clear.png` are not positive acceptance evidence.

### Verification boundaries

All 19 registered non-bundle checks passed after the flight-height correction,
including real hook encounter lifecycle, archive loss/retry, proxy collision and
rifle occlusion, bridge/ford placement, stable village deletion/undo, mapped-head
ownership/fallback and aircraft geometry/continuous-flight checks. TypeScript
and whitespace checks passed. The production build and menu bundle budget are
checked separately; neither proves visual fidelity or subjective audio balance.

The 20-second ordinary movement check reached tank pose `[9.04,-19.93,5.47]`
without a reported runtime error. The inspected boss snapshot reported about
60.3 FPS cadence, 14.4ms GPU time, 269 draws and 1.274 million submitted triangles.
The drive-end snapshot reported 60.6 FPS and 9.27ms GPU time. Earlier boundary
samples were 1280x720; later aircraft/defense captures were 881x913. Different
viewport, actor state and camera make these observations unsuitable as a
controlled optimization comparison or cross-device performance guarantee.
No shader/runtime errors appeared in the inspected browser logs.

Master and Music were both at 0 in the test settings, so playing/paused HUD
states verify lifecycle only, not an audible mix. Those audio settings were
left unchanged. Brightness was restored from the 1.3 QA setting to the user's
previous 1.8 via the visible settings slider. Experimental far-grass LOD remains
development opt-in; it is not enabled for production without a valid visual A/B.

Remaining benchmark gates: richer building/vehicle materials, natural rigged
cloth and locomotion, less visibly card-based distant vegetation, uninterrupted
camera-obstruction motion review, a complete manual final-boss stress run, and
in-game listening. These remain open rather than being marked solved by the
passing automated suite.

### Follow-up: archive fairness, muzzle origin, fire and trees

The user's live defense feedback exposed unfair rear approaches. The current
rules remove rear spawn lanes and add a visible arrival windup plus a shared
damage cap per archive. The force-failure QA button has been removed. A lost
single archive does not end defense. `COMBAT_FIXES.md` records the current values
and regression coverage, superseding the initial archive melee numbers above.

`napalm-soft-final.png` is the accepted local fire/smoke correction for this pass:
broader orange flame sheets, grey drifting billows and softened scorch edges
replace edge-on ribbons and polygonal smoke. An intermediate hot-reload error
was corrected; the clean launch/final capture had no new console errors. The
snapshot does not prove smoke transparency ordering under every camera angle.
`tree-bark-forks-final.png` confirms the shared bark and forked far trunks;
remaining sparse floor pockets and card silhouettes still need work.
`embassy-front-approaches.png` shows wave 2 running with 100% archives, zero tank
breaches and five regular friendlies. Muzzle origin/recoil and first-frame tail
bounds pass geometry tests; a close manual firing capture remains unverified.
