# Static foliage on moving cameras: CPU submission replay

The retained candidate tests the exact wind-padded camera frustum on every changed camera, projection or parent transform. Ordinary motion may keep extra cells in the existing instance buffer; whenever a currently visible cell is missing it repacks immediately. New guarded sets extend beyond the viewport during smooth changes; abrupt reveals use tighter sets. Only the changed range of source-ordered matrix/color records is uploaded. Outstanding dirty ranges survive frames in which Three did not upload the mesh.

Rice remains one opaque, non-shadow-casting draw. Seeded placement, material, wind, field order and lane-specific height are unmodified by this optimization. The central prefix never moves; only the trailing fields can be compacted, with a 64 KiB maximum per rice matrix+color upload. On the tested seed, the 2,949-tuft buffer kept its first 2,087 records immutable. An attempted count-only cutoff skipped **no** rice on the driving route; unrestricted compaction shipped more data for a smaller incremental triangle reduction. Neither was retained.

The A/B replays actual production-seeded geometry, instance matrices, colors, and Three's WebGL attribute upload/render-list/draw code against a memory GL backend. This measures submissions and bytes, **not frame time or driver performance**. Pose-by-pose readback proves that each potentially visible wind-displaced OBB is present, with byte-identical transforms, colors and seeded order. Old and new inputs have matching per-cohort digests and identical camera and oracle counts. Unrelated native runs were not used.

| Input route | Metric | Frozen prior culler | Candidate with bounded rice |
| --- | --- | ---: | ---: |
| 10 seconds, 600 poses: straight/turn/reverse at 60 Hz | Frames uploading after initialization | 291 / 599 | 99 / 599 |
| | Transferred / maximum in one frame | 15,212,160 / 179,588 bytes | 3,698,844 / 128,136 bytes |
| | Submitted triangles / draw calls | 266,851,016 / 6,000 | 264,555,696 / 6,000 |
| 300 adversarial camera poses, including repeated reversals/FOV jumps | Frames uploading after initialization | 288 / 299 | 216 / 299 |
| | Transferred / maximum in one frame | 27,011,692 / 235,980 bytes | 21,380,624 / **270,028 bytes** |
| | Submitted triangles / draw calls | 105,063,760 / 2,894 | 104,786,184 / 2,894 |

Ordinary drive transfers fell 75.7%. The worst adversarial simultaneous upload **grew**: the candidate's frame 152 uploaded 106,400 shrub bytes and 30,324 rice bytes among several cohorts. No peak-memory-transfer or native 60 fps pass is claimed. The rice treatment alone avoided 14,489,136 actual triangle submissions on the drive for 60,648 added bytes across its entire ten seconds. The conservative lookahead in other vegetation retains some additional valid-but-offscreen rows; the table reports the **net**.

The drive checked 5,322,000 OBBs, the adversarial run 2,348,406, plus 2,348,406 on the defense-offset −10 rice profile. The separate synthetic suite exercises transformed parents, orthographic inspection, wind near the viewport boundary, restoration and delayed/sparse uploads. TypeScript, `check-wetlands.mjs` and `check-jungle-composition.mjs` passed.

Artifacts: `tmp/production-qa/frustum-cpu-baseline-MJqgP9/` contains both source snapshots (old SHA-256 `c49639b97b5ae457932f532e8d0cf3988de59076c8ecfafe433b9df4ae2d803b`, candidate `8f483838ffa148800f1f5a49fe7c7bea8f452941064b2a1b0154a08162133ff0`), compiled modules, and `final-{old,new}-{drive,adversarial}.json` / `final-new-defense.json`. Each JSON includes raw poses, draw counts, triangle counts and bytes per frame, worst-frame cohort attribution and initial content hashes. Run from the checkout with `node scripts/check-static-foliage-moving.cjs drive candidate bounded` (or `adversarial`; use the frozen old TS path with `full` for the original comparator).

## Near-tree color and shadow submissions

The two high-detail, immutable batches of near trunks and crowns now keep the union of the actual color camera and the current 2048² directional shadow map. They still render with their original geometry, foliage wind, materials, instance order, and shadow settings. No character, moving object, interactive ID or cached shadow is involved. The collector runs at the world scene's pre-render callback after camera/scene world matrices settle and before Three uploads attributes. It checks the visible shadow-casting lights; missing, uninitialized, multiple, frozen, XR or unsupported shadow configurations revert to the full batch. Preparation uses a separate scratch scene. The single key camera is reconstructed privately, leaving the active light and its target/map untouched.

`node scripts/check-jungle-shadow-frustum.cjs` replays 360 chase poses per route using live production triangle layouts, the training and fictional campaign seeds, river/embassy clearings and their distinct moving key lights. It cross-checks every retained matrix/color against a memory WebGL uploader and every potentially visible wind-padded OBB against independent main and Three directional shadow frusta. Additional cases include a stationary color camera with a moving light, parent transforms, alternate orthographic cameras, skipped uploads, complete-buffer fallbacks and owner cleanup.

| Near trunks + crowns, color + shadow passes | Without compaction | With compaction | Transfer volume / max per frame |
| --- | ---: | ---: | ---: |
| River, training | 63,745,920 triangles | 40,094,640 (−37.10%) | 449,692 / 21,356 bytes; 53 changing frames |
| Embassy, training | 63,745,920 triangles | 36,244,176 (−43.14%) | 370,956 / 18,848 bytes; 44 changing frames |
| River, campaign root | 61,102,080 triangles | 42,242,304 (−30.87%) | 243,276 / 11,628 bytes; 28 changing frames |
| Embassy, campaign Vault | 59,927,040 triangles | 39,734,400 (−33.70%) | 135,280 / 10,260 bytes; 19 changing frames |

Stationary poses produced **zero** subsequent uploads. The two 217-row training buffers together cap any single full matrix + color rewrite at 32,984 bytes for that seed. A sub-threshold crown cohort in the two campaign routes stays entirely intact; both numerator and denominator include it. These are CPU submission bounds for just these two batches, **not** overall GPU timings, a visual comparison or a native 60 fps result.
