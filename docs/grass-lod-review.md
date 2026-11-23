# Optional distant grass geometry review

The production/default game is unchanged. This candidate is enabled only in development with `?grassLodReview` (combine with `?sceneReview=1&grassLodReview` for inspection).

The existing nine 48-unit spatial chunks keep the same 10,000 clumps, positions, scale, tint, texture and material. A whole chunk switches from the original **17-triangle** mesh to **four triangles** only when its nearest edge is **more than 60 units** from the camera. It returns to near detail below **52 units**, preventing rapid toggling near the threshold. Existing visibility culling beyond 86 units remains unchanged.

The reduced mesh retains the two photographic crossed sprays with identical UVs and top/bottom positions. Only the curved intermediate row and three tiny solid blades are omitted. All shader attributes, photographic color, alpha cutoff, wind, tank bending and existing distance fade are shared with the near mesh. If the atlas is absent, the system keeps the original solid-blade fallback instead of selecting invisible photo cards.

Geometry switches assign `mesh.geometry` directly; constructor arguments never track the selected LOD. Static matrix/color buffers, instance counts and original near-geometry culling bounds are retained. The far vertices are a subset of near endpoints, so the existing bounds are conservative. There are no per-clump distance checks, additional draws, textures, material programs or frame subscriptions. One extra shared geometry uses 576 bytes of vertex attributes; the parent disposes it on exit while preserving caller-owned textures.

## Expected savings, not measured frame-rate gains

The training-seed test estimates the following grass triangles after existing whole-chunk visibility culling but before camera-frustum rejection. Each rejected near triangle saves corresponding vertex work; actual GPU savings require the same-camera A/B capture.

| Camera X/Z | Original | Candidate | Potential reduction |
| --- | ---: | ---: | ---: |
| 0 / -12 | 170,000 | 170,000 | 0 |
| 20 / -20 | 170,000 | 159,132 | 10,868 |
| 36 / -30 | 170,000 | 143,025 | 26,975 |
| 48 / 0 | 170,000 | 132,196 | 37,804 |
| -48 / -48 | 155,176 | 102,227 | 52,949 |

There is intentionally no reduction in the central spawn view: no whole chunk is sufficiently far. Density is never reduced. The existing worst-case near geometry budget remains the ceiling.

## Checks and pending visual acceptance

Run `node scripts/check-grass-lod.mjs`. It checks actual near/far geometry, endpoint/UV preservation, unit normals, shader attributes, conservative bounds, strict 60/52 thresholds, deterministic seed budgets, real R3F instance/buffer reuse through repeated switches, missing-atlas fallback, restart reset, all nine batches and resource cleanup. Scene and TypeScript checks remain required.

Before enabling by default, drive past a distant chunk boundary in both directions at the same resolution and camera route. Watch for a whole strip popping, altered card brightness/silhouette and disappearing near grass. Compare warmed GPU timings. The feature stays development-only until that visual and performance review passes.
