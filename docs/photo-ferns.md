# Bounded photographic fern integration

`PhotoFerns.tsx` adds Poly Haven's CC0 Fern 02 as a small close-range quality
layer. All six upstream files are unmodified; source/license evidence and
checksums live beside them in `public/models/fern-02/`.

## Rendering budget

- Source contains four variants and 6,232 triangles total.
- Use `fern_02_b` (2,384 triangles) and `fern_02_a` (784 triangles).
- At most four large and eight compact instances: 15,808 added triangles.
- Two instanced draws, one shared PBR material, no shadow casting.
- 1K diffuse, normal, packed ARM and alpha: 1,260,950 downloaded bytes including
  geometry. Rough texture-memory estimate is 21.3 MiB with uncompressed RGBA
  storage and mipmaps; actual driver storage may differ.
- Matrices upload once. One shared time uniform moves leaf tips in the vertex
  shader. The GLTFLoader cache owns original meshes/maps; only the owned material
  and alpha clone are disposed on unmount.
- A local Suspense boundary keeps the existing world visible while ferns load.
- The four large ferns scale 1.30–1.48 (about 0.52–0.59m tall); compact variants
  retain their original 1.12–1.32 scale. Scale changes do not add triangles.
- Grass below each actual accepted fern is shortened to 20% of its usual height,
  with irregular 0.5–0.7m large-fern footprints and 0.28m feathered transitions.
  The small ferns use tighter footprints. No grass is deleted or moved, so this
  remains a low overlapping carpet rather than a round bare garden plot. The
  composition is computed only during seeded placement, not in the render loop.

## Transparency correction

Upstream glTF declares MASK, cutoff 0.5 and double-sided surfaces, but its base
color is a JPEG: despite its internal name mentioning alpha, it has no alpha
channel. Load the separate upstream alpha PNG as `alphaMap`, explicitly set
`flipY=false` for glTF UV orientation, and use non-color data. Keep alpha testing
and depth writing; do not enable transparent blending. The original normal and
roughness maps remain in place, with normal strength 0.8 and AO strength 0.65.

## Locations for inspection

Coordinates receive only +/-0.15m seeded jitter and obey the scene's live road,
objective, paddy and river exclusions. No plant adds a collider.

- Forest review view: large ferns near (-26.1, -4.5), (-29.7, -5.3), compact
  ferns near (-27.8, -3.2), (-25.8, -2.4). These are in front of the Forest camera,
  on the near bank, not in the remote perimeter.
- Wreck margin: (-12.4, -18.4), (-10.6, -20.3), (-13.3, -20.6).
- Outer paddy/drive shoulders: (13.2, -12.5), (12.8, -10.5), (-13.1, -12).
- Dry rear spawn verge: (3.1, -18.3), (-3.1, -18.4).

Training's unobstructed close review: camera (-31.1, 1.15, -7.15), target
(-29.65, 0.16, -5.25). The older view from (-23, 1.3, -8) looks through a tree
trunk and cannot validate the imported fern silhouette.

Do not replace the whole forest with these meshes. Check alpha edges, native
brightness and scale in Forest/Wreck views, then drive past the margins. Keep
the overall forest/grass/fern budget below 600k triangles and 24 batches.

Run `node scripts/check-scene-assets.mjs` for source checksums, actual glTF
geometry, PBR/alpha hooks, seeded placement/exclusions and the combined budget.
