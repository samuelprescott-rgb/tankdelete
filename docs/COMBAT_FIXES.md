# Embassy fairness, tank rounds and battlefield presentation

## Changes

- Removed the two rear zombie entry lanes. Every wave uses front/front-flank
  entries at world Z >= 8, including the deterministic terrain-search fallback.
  The embassy occupies Z -13 to -30. Tests cover 512 seeds and all four waves.
- Archive contact now begins an **under attack** HUD warning and a 2.25-second
  windup. Each building has 200 HP, takes at most 8 damage per accepted hit and
  shares a 1.25-second damage gate across all attackers. Even an uninterrupted
  siege cannot destroy a fresh archive before 32.25 seconds. Breaking contact
  for 3.5 seconds resets the windup. Damage persists between waves; retry resets
  health, warnings and attack clocks. A single archive lost does not end the run;
  all three must fall. The previously requested three-hit tank rule is unchanged.
- Removed the development-only **QA: overrun archives** button from the playable
  inspection HUD. Archive failure is now covered by the real hook tests rather
  than a one-click failure control beside the play area.
- Cannon and mounted MG use explicit world muzzle frames, two millimetres beyond
  the visible end caps. MG barrel/brake/flash are now coaxial. Both guns' muzzle
  effects sit in the recoiling gun group. Tracer tails grow only as the projectile
  travels, so the first rendered streak cannot extend backward through the hull.
  All three tracer layers respect scene depth. Maximum streaks are 1.35m cannon
  and 0.9m MG. Cannon reload and MG heat/audio timing were not changed.
- Napalm now uses turbulence-shaped fire sheets, smaller hot cores, soft rising
  smoke and feathered ground scorch. The final camera-facing calculation happens
  in the vertex shader, fixing the edge-on ribbons seen in the first inspection.
  Stable per-instance seeds avoid random noise jumps as a particle drifts.
  112 flame instances per layer replace 152; 40 smoke quads replace 52 polygonal
  smoke meshes. No new point light, texture request or postprocessing pass was
  added. The existing 8.45-second impact and lingering-damage clock are unchanged.
- Boundary trees now share the existing photographic bark map and use forked
  distant trunks. Two redundant cards per far crown were traded for the forks.
  Measured perimeter geometry remains about 80k triangles in two draws, below
  the unchanged 90k cap. The whole foliage asset-transition check remains below
  its unchanged 600k geometry cap. This is a bounded improvement, not a claim
  that the forest or characters meet the AAA reference benchmark.

## Files

- `src/lib/embassyDefense.ts`, `src/lib/zombieEpilogue.ts`,
  `src/hooks/useZombieEpilogue.ts`, `src/GameSession.tsx`
- `src/components/HUD.tsx`, `src/components/HUD.css`
- `src/lib/tankWeapons.ts`, `src/components/Scene/Tank.tsx`,
  `src/components/Scene/ProjectileManager.tsx`
- `src/components/Scene/napalmMaterials.ts`,
  `src/components/Scene/OrdnanceEffects.tsx`, `src/components/Scene/WreckFire.tsx`
- `src/components/Scene/ForestPerimeter.tsx`,
  `src/components/Scene/jungleGeometry.ts`, `src/components/Scene/SceneReviewCamera.tsx`
- `scripts/check-combat-presentation.mjs`, `scripts/check-embassy-defense.mjs`,
  `scripts/check-encounter-lifecycle.mjs`, `package.json`, this document and the
  updated world/visual review records.

## Verification and remaining tuning

Real-hook tests cover first-contact warning, crowd damage caps, persistence,
single-archive survival, total archive loss and clean retry. Muzzle tests cover
rotated turrets, moving/recoiling parents, both barrel end caps and first-frame
tracer bounds. Material tests cover stable seeds, render-camera billboards,
soft scorch, instancing, depth and resource disposal.

Live captures: `napalm-soft-final.png` shows the final broad fire and soft smoke;
`tree-bark-forks-final.png` shows the bark/fork correction; and
`embassy-front-approaches.png` shows a fresh defense in wave 2 with all three
archives at 100% and all five regular friendlies alive. These are in
`tmp/visual-review/`. Earlier `napalm-billow-*` captures are intermediate, not
acceptance images. An intermediate hot-reload reference error occurred during
the material replacement; it was corrected and a clean launch plus final fire
capture produced no new error/warning entries. Historical console entries from
that earlier error were not mistaken for a new failure.

Final fire screenshots are a local visual improvement, not temporal AAA
acceptance. A manual muzzle-firing close-up and a complete player-driven boss run
remain worthwhile checks. Smoke opacity (currently density times 0.40–0.85),
archive siege duration, and tracer visibility at daytime monitor brightness are
the main remaining play-test tuning values. No audio mix was changed in this
pass, and no assets were downloaded or pushed to GitHub.

### Round progression and the three-door siege

The design comparison is [Black Ops 7's round-based and confined Survival modes](https://www.callofduty.com/blog/2025/11/call-of-duty-black-ops-7-launch-zombies):
pressure increases in identifiable rounds, and the player gets time to act on a threat.
Here the four-wave ending, ally support, and three fictional archives are TankDelete rules,
not timings or combat behavior claimed for Call of Duty.

In each regular wave, every third roster slot is a raider. The first three raiders select
different buildings. A dedicated blue-grey runner enters the visible front flank and
presses Dispatch even under rifle fire. The squad still damages and slows it; a nearby
tank can draw it off and one direct cannon hit kills it. Other raiders are also
distracted by nearby infantry. A fallen building prompts redirection. Each building
meters its own siege; a contact at Records no longer blocks a warning at Dispatch or spends
the squad's/tank's protected melee window. The boss keeps its duel instead of raiding files.

Run `node scripts/check-horde-playthrough.mjs` for deterministic CPU-only combat evidence.
It mounts the actual horde, five regular riflemen, final-wave allies, projectile pool, and
moving-projectile collisions. The scripted driver waits seven combat seconds before firing in
ordinary waves, fires at most once per second and kites on the boss wave. This is not
a human input recording or a measure of frame rate; UI takeovers and warning screens are
excluded from combat durations. The successful route measured:

| Wave | Simulated combat | Peak emerged | Ally hits | Cannon hits/shots |
| --- | ---: | ---: | ---: | ---: |
| 1 | 27.85 s | 10 | 68 | 9/21 |
| 2 | 25.80 s | 14 | 66 | 13/19 |
| 3 | 28.40 s | 16 | 111 | 16/22 |
| Boss | 41.60 s | 1 | 251 | 32/41 |

All five regular allies landed hits in each ordinary wave. All three boss reinforcements
landed hits; the tank won with two breaches, two regular soldiers still alive, and all
archives intact. Advancing without firing lost on the third breach at 13.70 s. Retry restored
the ten-actor opening.

The matched archive rescue mounts the real tank, chase camera, keyboard/pointer
handlers, projectile manager and five riflemen. It uses the earned Vault seed and
objective after virtual removal of the safe duplicate. At 11.80 s **Dispatch annex ·
catalog.csv** warned. With the driver stationary and not firing, the file fell to 192/200
at 14.20 s before the squad stopped the attacker. Starting identically and only turning
and firing *after* the warning, one shell stopped the runner at 12.85 s; the file stayed
at 200/200. A second seeded opening showed 184/200 ignored vs. 200/200 defended. Both
runners started inside the chase view and physically traversed the full route (max
displacement 0.212 world units per 50 ms step).

At 60 fixed updates/second the earned Vault warning was at 11.72 s: the passive file
fell to 192/200 at 14.05 s; a single shot after the warning stopped the runner at
12.70 s and preserved 200/200. Using the actual unlocked replay seed also passed:
warning at 12.33 s, damage at 14.90 s if ignored, or runner stopped at 13.32 s
with the file untouched. These update rates are simulation inputs, not measured FPS.

A separate staged contact regression starts an evacuated line with
three enemies at different archive doors and one at the tank at 60 updates/second. All four
contacts registered within 83 ms; first damage followed warnings by 2.30, 2.53 and 3.30
seconds. All three settled just outside nominal melee reach without moving during ten
seconds of siege (1,803 actor frames). Walking, gait, attacking, and obstacle-stuck timers
agree about that arrival threshold. Reverting only the walk/gait comparisons in the
in-memory test bundle reproduces the stuck-recovery warp and fails the regression.
Unanswered sieges destroyed all three archives after 53.28 seconds. Retry restored their health and
cleared every warning. The staged placement does not assert that an ordinary run plays out
that way.

For browser performance, `scripts/peak-horde-qa.mjs` stages the first two waves as a
labelled stress fixture (or uses the optional ordinary-pointer opening). The timed
third wave uses the unmodified production actor and renderer. The sampler tests actual
nonzero head instance transforms, logs the active population and drawing-buffer size on
each frame, and reports time at 16 separately from the rest of the 7-second window. A
Wave 1 screenshot, a roster of 16 waiting to emerge or a headless playthrough is not
peak rendered evidence. Native frame cadence needs its own measurement.
