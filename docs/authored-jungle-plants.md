# Authored CC0 palms and six foreground shrubs

`AuthoredJunglePlants.tsx` replaces the existing procedural palms with Yughues/Julius's 451-triangle palm, and exactly six existing shrub plots with Yughues's 608-triangle feathered shrub 05. There are no additional trees, no changed scatter seeds, and no added gameplay collision.

## Sources and shipped assets

- [Palm tree v2 low-poly edition](https://opengameart.org/content/palm-tree-v2-low-poly-edition): original author Yughues/Nobiax, reduction Julius, **CC0**. `public/models/yughues-palm-low/` contains the unmodified OBJ (45,676 bytes), original 512×512 diffuse-alpha TGA (484,280 bytes), original readme, license and SHA-256 provenance.
- [Tropical shrubs](https://opengameart.org/content/tropical-shrubs): Yughues/Nobiax, **CC0**. `public/models/yughues-shrub-05/` contains only variant 05's unmodified OBJ (40,043 bytes), original 512×1024 diffuse-alpha TGA (2,097,196 bytes), original readme, license and provenance.

No normal/specular maps are shipped or fetched. No accounts, paid assets or runtime dependencies were added. OBJ/TGA loaders come from the existing Three package. The source TGA alpha is preserved; no conversion, painting or color normalization is applied to the files.

## Scale and placement

The local source geometry is cloned and uniformly normalized to unit height with its lowest point at local ground. Original UVs are unchanged. Matrices use the exact existing tree/shrub ground anchors and Y rotations.

- Palm height is exactly the pre-existing seeded `palmTrunks.sy`. Horizontal scale uses `height × seededCrown / 1.65`, retaining authored proportions with the existing natural crown variation. It does not reproduce the old oversized procedural frond span.
- Six shrub candidates are selected from **existing** safe plots nearest six forest-margin anchors. No candidate within the central combat pocket is eligible. New shrub height is `clamp(original.sy × 0.8, 0.62, 0.86)`, below a standing soldier's eyeline. Remaining original shrub placements are unchanged, not re-scattered.
- Suggested training checks: palm near `(12, -19)` and forest-side palm near `(-21, -3.5)`; authored shrubs near `(-25, -5)`, `(-13, -14)`, `(-13.5, -21)`, `(14.5, -11)`, `(-26, 12.5)`, `(20, 11)`. Exact acceptance follows the live clearing callbacks; these approximate coordinates are from the training-seed regression setup.

## Rendering and lifecycle

Both assets share one material per kind and one static instance batch. Matrices/colors upload only on placement/resource changes. Standard `MeshStandardMaterial` retains lighting, fog and receiving shadows; alpha cutoff **0.50**, roughness **0.88**, metallic **0**, `DoubleSide`, depth writing on, transparent sorting off. Texture SRGB/OBJ `flipY=true`, mipmaps, anisotropy **4**. No shader deformation or shadow casting is added, avoiding inconsistent depth silhouettes or extra shadow work.

Each asset has a local Suspense + error boundary. While its model/texture is pending or rejected, the original complete plant batch(es) remain. Only a successful load removes corresponding originals. This applies independently to palm and shrub failures. The original `JungleBatch` now explicitly leaves shared geometry/material disposal to its owning `DenseJungle` resource lifecycle, so replacing a fallback cannot accidentally dispose materials still used by other vegetation.

Owned normalized geometry, texture clone and material are disposed on unmount. Cached source OBJ/texture objects remain loader-owned and reusable on restart. No frame subscription or per-frame allocations are introduced.

## Cost and verification

- Palms: 451 triangles instead of 80+612 = **241 fewer per tree**, one draw instead of two.
- Six shrubs: +3,504 triangles relative to six 24-triangle source sprays, one additional draw after load.
- Both ready: total foliage draw count remains **23**; partial-loading/failure worst case **24**.
- Three regression seeds: **575,099**, **579,089**, **574,738** total jungle/grass/fern triangles, lower than the previous pass. Even partial successful loads stay below the existing **600k** budget.
- Shared diffuse GPU storage is about **4 MiB** including mipmaps, excluding small source/instance geometry. Original compressed/source file size is not confused with GPU storage.

Run `node scripts/check-authored-plants.mjs` for actual asset hashes/alpha/geometry/UVs, deterministic transforms and six-plot selection, real R3F pending/success/model-failure/texture-failure behavior, static instance reuse, and disposal. `node scripts/check-scene-assets.mjs` checks full and partial-load geometry/draw budgets. TypeScript checks remain required.

The isolated source assets were approved in Three previews. Final in-game composition, dense canopy visibility and dark-scene alpha edges still require the integrated scene capture; tests are not a substitute for that visual review.

## Shared ground-cover composition

`VietnamEnvironment` now memoizes one jungle scatter and one six-shrub selection after its existing bark/canopy textures are ready. `DenseJungle` consumes those exact arrays; standalone uses still generate the same original plan. `DenseGroundCover` receives the same six selected positions, without running another forest scatter. No tree, shrub, road clearing, or gameplay collision changes.

Grass directly beneath those shrubs keeps its original position, width, tint, rotation, instance count and geometry. Only height is shortened, with a 24% floor and an irregular 25cm feather. Footprint radius is derived from Shrub 05's actual source maximum width/height ratio (approximately 0.8296 × rendered height); small angular offsets break up circular outlines. Existing fern shortening is combined by minimum, not multiplied into an excessively short patch. Grass remains present under a pending/failed optional shrub asset, so the procedural fallback does not expose a bald plot.

`node scripts/check-jungle-composition.mjs` validates actual source dimensions, repeated deterministic output, byte-identical outside-footprint grass and all non-height fields, exact shared array identity, suspended-load ordering, seed changes, single scatter on normal mount, no rescatter on unrelated re-renders, standalone fallback and wind cleanup using real React/R3F hooks. Four seeds shorten **13 / 15 / 14 / 13** of **10,000** clumps; the last is the live training seed `4277391332`. Triangle and draw budgets are unchanged. The separate distant-grass LOD experiment remains **DEV opt-in** and is not enabled by this composition pass.
