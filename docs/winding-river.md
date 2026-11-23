# Winding sector tributary

The former nearly straight west-edge channel is replaced by a compact S-shaped tributary. It enters the southwest forest, approaches the western play space, bends around the existing hills and paddies, then passes the village's western margin before leaving the north edge. This is a gameplay composition inspired by Vietnam's delta waterways, not a reconstruction of a named river or historic battlefield.

## Primary photographic references

- [Vietnam National Authority of Tourism — Drift, cycle, explore: Vietnam's Mekong Delta](https://vietnam.travel/things-to-do/how-to-travel-mekong-delta), photographs credited to **Aaron Joel Santos**. Its riverbank villages, palm/mangrove margins and small bridges informed the vegetated banks and compact crossing. Representative original page photographs: [river market](https://vietnam.travel/sites/default/files/inline-images/Mekong%20Delta%20Travel%20Guide-6_0.jpg), [riverbank local life](https://vietnam.travel/sites/default/files/inline-images/Mekong%20Delta%20Travel%20Guide-4.jpg), [floating home/waterway](https://vietnam.travel/sites/default/files/inline-images/Mekong%20Delta%20Travel%20Guide.jpg).
- [NASA — astronaut photograph STS075-732-18, Mekong Delta](https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?frame=18&mission=STS075&roll=732), March 2, 1996. Broad channel curves and sediment distribution informed gradual width changes and muddy shallow margins, not bright blue water or jagged noise at each station.
- [Library of Congress — Bridge over branch of many-mouthed Mekong, and native craft, Saigon](https://www.loc.gov/pictures/item/98507423/), Underwood & Underwood, 1915. The catalog lists no known publication restrictions. This is an older geographic/river-life reference, **not** evidence of a specific Vietnam War-era military bridge.

These are reference links only. No external photographs were copied into the shipped game, and no blanket reuse license is asserted for the tourism photography.

## Shared layout and access

`riverLayout.ts` defines 97 evenly spaced stations across Z **-64..64**. A fixed low-ground spine uses smooth cubic interpolation, with at most **0.30m** seeded center drift and smooth width variation. Typical water width is **2.74–4.06m**; both banks expand by another **0.59–0.85m**. The maximum centerline lateral span exceeds 30m instead of the old near-straight edge route.

The same station data drives the rendered surfaces, reeds, tree/grass/fern rejection, puddle rejection, tank drag and wakes. Frame-time queries remain allocation-free. Reeds sample their final jittered Z before calculating the bank edge; this fixes normal-offset placements drifting into water on stronger bends.

- A **3.8m-wide timber bridge at Z=-16** crosses the full bank envelope, including curvature over the deck's width. Planks span continuously with small seams instead of the former half-plank gaps. Immersion/drag is zero on the deck, feathering at its ends.
- A **4.4m-wide shallow ford at Z=32** lightens and raises the submerged silt shelf slightly; it keeps 20% immersion so wakes and drag remain mild. Both crossings align to the existing road grid and introduce no collision barrier.
- Spawn `[0,-12]`, the central route, objective and the permanent four-column file/hut plots remain dry and unmoved. The outer river bank stays west of **X=-17** through **Z=-33..-20**, preserving the embassy's southern apron and annex approach.
- No hill/terrain/collision geometry changes. The route is checked against the actual rotated hill envelopes, conservatively enlarged by the complete bank width plus 45cm. The existing renderer guard still prevents a future uncoordinated terrain edit from drawing water across a hill.

## Render cost and tuning

The river retains **four draws**: shared bank/bed ribbon, water, instanced reeds and instanced bridge. Surfaces total **1,920 triangles** (1,152 bank/bed + 768 water). The live training seed has **120 reed clumps and 23 bridge pieces**. Static matrices upload only when seed/placement changes. One frame callback updates only the existing wetland shader's time uniform; no reflection pass or simulation is added.

Water reuses the existing wetland material and storm-sky response. Banks reuse the existing ground-detail texture and silt material. The water stays level at **Y=-0.012**; shallow low banks crest around **Y=0.012**. Material, generated geometry and the wind subscription are cleaned up locally; loader-owned ground detail is retained.

Run `node scripts/check-winding-river.mjs` for deterministic curves, 256-seed terrain clearance, exact query/render edges, finite/upward normals, unchanged target/terrain data, connected bridge spans, ford/deck immersion, bounded instance counts and real four-draw renderer lifecycle/static-buffer checks. The script does not establish visual quality or measured frame-rate improvement. Inspect the main bridge near `(-22,-16)` and the north bend near `(-24,36)` from the actual game before accepting the composition.
