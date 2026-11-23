# Infantry art gauntlet

**Objective.** From the shoulder-side view, each stock ends at the jacket
and both hands meet the prop. At portrait and normal game scale, troops look
alert and individually recognizable, with a coherent gaze and no detached
lip, lid, or headgear geometry.

**Evidence.** The builder runs the mesh/pose checks, then captures the same
views in a clean local simulation. The critic compares the resulting frames
with the previous pass and the hand-painted character references. A clean
build is necessary but not a visual pass. Track rejected details against the
new renders rather than reusing a favorable old frame.

The regression script probes the real stock and jacket surfaces, samples
skinned hand vertices against the posed prop, and checks the muzzle socket
through standing, kneeling, recoil, and motion. Each model stays within its
existing geometry and material budgets. Use **Rifle profile**, **Enemy rifle
profile**, **Face**, and **Enemy face** in the local scene review.

**Boundary.** Work in the simulated level. Keep the existing hit volumes,
cadence, real-file behavior, and encounter rules. Do not publish or import
external assets on the strength of a visual review. A pass closes only when
the independent reviewer can inspect both factions and the contact tests
pass; blocked or unverified cases remain open.

This applies the objective / metric / boundary split from the
[Gauntlet Loop guide](https://www.thepromptindex.com/ai-loop-engineering-gauntlet-loop-guide.html#three-elements)
to the actual art build.

## Rejection ledger

- **Expression A:** separated the head shapes, but the critic still saw a
  raised lip ridge and eye outlines. Expression B softened those edges.
  The final Boot Camp portraits resolved both subjects in live lighting.
- **Pose R1:** stopped the stocks at the jacket, but the wooden silhouettes
  were blocky and heads read too upright. R2 tapered the wood and added a
  modest head tuck. The independent review then checked both sides, recoil,
  and motion against the real mesh and the current game captures.
- **Browser rerun:** rejected the first R2 browser run because a fallback
  crate shader composed two declarations named `wash`. The painted finish
  now isolates its variables, and the fallback-material regression exercises
  that composition before the authored model loads.
