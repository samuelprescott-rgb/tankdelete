# Vietnam world / embassy nightmare pass

This is original procedural game art informed by historical references, not a
survey-accurate reconstruction and not a claim of AAA asset quality. Ordinary
cleanup remains a fictional 1968 combat sector. The separate nightmare defense
uses a fictional 1975-inspired Saigon compound; zombies are not depictions of
the civilians who were evacuated or left behind.

## References and decisions

- [Australian War Memorial, Binh Ba aerial, 1 September 1969](https://www.awm.gov.au/collection/C1196183): courtyards, gardens, banana cover and varied repaired iron roofs informed the stable village parcels. The photograph was inspected as a reference, not copied into the game. This one hamlet is not treated as a universal Vietnamese layout.
- [National Museum of the USAF, F-4C Phantom II](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/2929390/mcdonnell-douglas-f-4c-phantom-ii/): tandem canopy, paired exhausts, outer-wing dihedral and stabilator anhedral. The museum rear photograph was visually inspected.
- [Smithsonian NASM, Bell UH-1H reference image](https://ids.si.edu/ids/deliveryService?id=NASM-A19960005000cp06&max_w=1200): broad divided windscreen/chin glazing, long troop cabin, tapered tail boom, two-blade rotor and tubular skids. No photograph textures were imported.
- [U.S. Army ODIN, M48 Patton](https://odin.t2com.army.mil/WEG/Asset/M48_Patton_American_Main_Battle_Tank_%28MBT%29): six road-wheel pairs with separate end wheels. Existing 90mm M41 gun identity and gameplay sockets remain.
- [Marine Corps History Division, Withdrawal, printed p.72/PDF p.76](https://www.govinfo.gov/content/pkg/GOVPUB-D214-PURL-gpo255714/pdf/GOVPUB-D214-PURL-gpo255714.pdf): embassy rooftop and parking-lot landing zones, multistory buildings, walls and gates. Text/caption verified; the PDF image renderer was unavailable during this pass.
- [Brian Dell's photograph of the Ho Chi Minh City Museum embassy model](https://commons.wikimedia.org/wiki/File:Model_of_US_embassy_in_Saigon_1975.JPG): visually inspected secondary reconstruction for the concrete grillwork, flat roof, lower columns and courtyard relationship. Not used as an asset or sole historical authority.
- [Naval History and Heritage Command, Frequent Wind](https://www.history.navy.mil/about-us/leadership/director/directors-corner/h-grams/h-gram-090/h-090-1.html): 29–30 April 1975 context. The famous Air America Huey rooftop photograph is not the embassy; no Huey rooftop scene is presented here as historical fact.
- [Call of Duty official Zombies guide, The Tomb](https://www.callofduty.com/guides/blackops6/zombies/call-of-duty-guides-black-ops-6-round-based-zombies-the-tomb): gaunt jaw, skeletal silhouette, layered torn clothing and eye contrast are visual cues only. Models/materials are original; proprietary characters, textures and armor are not copied.

## Implementation boundaries

- Perimeter foliage uses the same alpha-cutout canopy map with a safe fallback, not untextured white cards. Irregular depth/height clusters replace regimented rows and giant berm primitives.
- A shared, deterministic southwest-to-northeast river route drives water, banks, reeds, scenery exclusion, crossings and tank water effects. The central road has a continuous north/south bridge. The fixed spawn, embassy apron, objective and hill geometry remain protected.
- Permanent file plot manifests/tombstones remain authoritative: deleting or undoing one file cannot recenter neighboring huts. Variety is path/plot seeded, not re-randomized each render.
- Horde mode replaces file huts with three in-memory archive proxies around an embassy-inspired compound. Names can represent sector files, but archive damage has no filesystem API. Central single/batch file-hit paths reject delayed impacts while horde mode is active. Portals and ordinary file hit volumes are absent during defense.
- One third of ordinary zombies may raid the nearest intact archive; a defender within 7m draws them back into combat. Boss behavior remains the existing player/ally duel. All archives lost ends the run; the existing three-hit tank loss remains independent.
- Archive health persists between waves, resets on retry/new session, and accepts damage only during combat. US squad poses, cover and hit positions share a 10m rearward defensive offset. Night lighting remains continuous through the horde sequence.
- Fourteen overlapping building proxies reuse the existing infantry navigation and rifle-trace API. Intact archives block ordinary undead and rifle fire; lost archives release their volumes. Target approaches and the front defensive firing lane stay clear. Tank/boss low-prop traversal remains unchanged.
- Standard undead have original torn-uniform, hand and boot geometry. The first procedural head was rejected in live review as too cartoon-like; the replacement reuses the project's existing CC0 MakeHuman/Mindfront mesh and original diffuse with a corpse-colour shader. The 2,452-triangle shared head adds no draw or texture download; the full actor is 3,575 triangles (1,607 with its failure fallback). Portrait-boss geometry is unchanged.
- Critic-found retry gaps were corrected: each retry invalidates old ordnance callbacks/payloads, clears projectiles and active strike effects, recreates tank/US runtime state, and resets both radio phase latches and the zombie intro. Undo is rejected during proxy defense as well as single/batch trash hits. Courtyard geometry is explicitly disposed with the owned building meshes.
- The same ordnance boundary applies when entering defense from cleanup. Defeat/victory suspend the radio and stop combat/zombie audio; the existing menu/exit cleanup remains. Archive failure has its own HUD wording and lost-count display.
- Live aircraft review exposed the old 7m horizon pass cutting through the rebuilt canopy. The Phantom now uses a 30m/26m/34m ingress/pass/exit floor and farther camera-relative framing. Its four geometry batches and 0.52 scale are unchanged. The same Hermite path still joins with continuous velocity, releases at 7.3 seconds and impacts at 8.45 seconds; three timed inspection captures show it above the forest. This is not a terrain-following aircraft simulator.

## Configurable gameplay and budgets

`src/lib/embassyDefense.ts`:200HP per archive,8 damage per accepted melee,
7m defender distraction range, one-in-three raider policy, compound bounds and
shared defensive offset. Global zombie attack throttling is unchanged. These
numbers require play-balance tuning; automated checks do not prove fun or fairness.
The subsequent fairness correction adds a 2.25s arrival warning and a 1.25s
per-building damage gate, removes rear spawns and removes the force-loss QA
button. See `COMBAT_FIXES.md` for the current values and evidence; it supersedes
the original immediate-contact attack behaviour.

`src/lib/weapons.ts`: `NAPALM_FLIGHT_ENVELOPE` holds the camera-relative flight
points and world-height floors, independently of `NAPALM_TIMELINE`. The latter
must stay aligned with the supplied audio. The aircraft regression samples both
real interpolation segments under several camera heights/pitches and verifies
canopy clearance, nonzero movement, continuous junction velocity and normal
chase-view framing.

Masonry uses shared merged geometry; fire reuses the existing shader effect.
The old Huey wreck provides one fire and the annex adds one, avoiding a light
per window/building. No new postprocessing pass was introduced.

## Verification record

Automated checks cover archive targeting/damage, no-filesystem boundaries,
all-wave lifecycle, archive loss/retry, hill clearance and finite geometry.
The separate river/village/aircraft checks cover stable placement, bridge route,
model bounds and budgets. Mapped-head checks cover cold and warm cached loads,
host-ref timing, failure fallback, instanced-buffer reuse and source-safe disposal.
Live visual/performance acceptance is recorded in
`VISUAL_REVIEW.md`; build success alone is not visual acceptance.
