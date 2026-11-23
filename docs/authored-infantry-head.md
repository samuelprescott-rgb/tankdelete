# Optional mapped infantry head pipeline

Regular U.S. and VC field actors use a vertex-painted bake of the bundled CC0
MakeHuman/Mindfront Aksel source, not a runtime glTF or texture request. Run
`node scripts/bake-field-portrait.mjs` to regenerate its packed source mesh.
The offline reduction keeps 1,760 skin triangles, including actual lip and
eyelid edges; 260 more form the two globes recessed inside their sockets. The
game varies jaw, cheek, brow, gaze and skin, and merges the result into the
existing skinned body draw. The original no-asset sculpt remains the fallback.
The cupola, undead and named boss allies keep their own presentation paths.

The field heads, M1 covers, pith helmets and woven hats carry their diffuse
paint in vertex colors, merged into the existing body draw. Authored skin
retains scene lighting with reduced world-shadow contrast so a large shadow
texel cannot cut a hard shape across a small eye or nose. The boots, weapon
sockets, navigation and nine-bone rig are unchanged.

## Original mapped asset and optional near/far renderer

- Near: 8,452 triangles / 4,444 UV-split vertices.
- Far: 2,452 triangles / 1,444 vertices, prepared offline with the existing Three
  mesh simplifier. UVs are retained; far-LOD lips/eyelids and seam quality still
  require the actual in-game visual review, not just an attribute-count check.
- Combined binary: 253,840 bytes. One original 2048² diffuse PNG: 4,247,107 bytes.
- No normal/specular images are referenced or downloaded by the shipped glTF.
- Both LOD meshes share one cached material and diffuse texture; the source PNG
  is not modified. A 2K RGBA texture with mipmaps is roughly 21.3 MiB before any
  driver compression; this is shared, not allocated per actor.
- Eye geometry/material is shared and has a separate small draw, with muted
  ivory sclera and brown iris/pupil curved onto the globe. There is no emission.

## Placement and lifecycle

The head is already in metres and faces -Z, with a neck-local origin. Attach it
to `rig.head` at offset (0.01, 0, 0.014). The existing soldier parent applies the
0.72 compact-world scale once. The retained procedural neck bridges the cropped
head into the collar; only the old skull/jaw/nose/ears/eyes/lips are omitted.
Helmets, straps and neck motion continue to use the same head bone.

A local Suspense boundary leaves the original complete soldier visible until
the head and its texture are ready. A local error boundary also keeps that
fallback on a rejected request. The `omitProceduralHead` geometry option defaults
to false for all existing callers. Bone parent removal cleans up the added head
on encounter exit; cached meshes/textures are not disposed accidentally.

Near/far selection checks every 0.2 seconds using reusable vectors. Enter near
LOD below 5.5 world metres; return to far beyond 7 metres. The hysteresis prevents
boundary flicker. No simplification, matrix-array uploads, or vector allocations
run in the frame loop.

## Reproduction and checks

Download the verified CC0 sources into `tmp/asset-source/makehuman` as documented
in its source study. Run `node scripts/prepare-infantry-head.mjs` to reproduce
the shipped model, then `node scripts/check-authored-head.mjs` and
`node scripts/check-infantry.mjs`. Provenance and license files are beside the
public model. Do not ship the full source skin archive.

For the optional mapped variant, visual tuning includes eyelid coverage, the
collar seam and the facial silhouette across the 5.5–7m transition.
