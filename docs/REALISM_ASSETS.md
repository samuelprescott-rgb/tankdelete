# Original realism assets and tuning

This pass combines original generated textures, authored procedural meshes and independently documented CC0 imports. Reference game screenshots guided art direction only; their pixels/models were not copied into the shipped assets. This is not a licensed AAA character/vehicle asset library or a claim of equivalent visual quality.

## Saved assets

- `public/images/textures/jungle-ground-v1.png`: soil/leaf litter, shared by ground and hills.
- `public/images/textures/vietnam-monsoon-panorama-v1.png`: monsoon sky and distant ridges, also shared environment lighting.
- `public/images/textures/jungle-bark-v1.png`: wet weathered bark.
- `public/images/textures/tank-armor-v1.png`: worn olive-drab steel.
- `public/images/textures/jungle-branch-spray-v1.png`: alpha-cut photographic leaf clusters.
- `public/images/textures/jungle-grass-clump-v1.png`: original transparent grass clump, bent onto crossed cards with supporting blade geometry.

Original generated files remain in the Codex generated-images directory. PNGs retain source resolution and alpha; foliage uses alpha testing rather than sorted transparent layers.

The additional imported Fern 02 geometry and PBR maps are freely reusable CC0 assets from Poly Haven, not generated textures. See [photo-ferns.md](photo-ferns.md) and the source/license/checksum records alongside `public/models/fern-02/`. User direction for further imports: free assets only.

Additional openly reusable imports:

- `public/models/us-infantry-head/`: CC0 MakeHuman base-head derivative with Mindfront Aksel's original diffuse skin map. Near/far geometry uses 8,452/2,452 triangles and a shared original 2K image. Only three compatible US squad variants currently use it; the existing complete procedural model remains during loading or failure. The head follows the original neck bone. A 52-vertex lower boundary is extended inside the collar to remove the sawtooth seam; facial UVs/positions are unchanged. See the adjacent provenance, source licenses and `scripts/prepare-infantry-head.mjs`.
- `public/models/yughues-crates/`: original CC0 wooden crate04 OBJ and diffuse/normal TGA maps, three static instances of a 768-triangle mesh. One batch replaces the previous plain cubes, with a local loading/error fallback. Normal strength0.35, roughness0.93. Source/checksums in `PROVENANCE.md`.
- `public/models/yughues-palm-low/` and `yughues-shrub-05/`: original CC0 Yughues/Julius palm and six existing shrub replacements; see [authored-jungle-plants.md](authored-jungle-plants.md). Original source textures remain unmodified.

No Megascans/Fab assets are included. The user confirmed there are no existing entitlements and requested openly reusable sources instead. Horse source/rig experiments, download archives and screenshots stay in ignored `/tmp/`; the horse is **not integrated** because moving-skin deformation and real charge-speed behavior are not visually approved.

## Important controls

- Default display brightness: 1.3, real exposure; user range 0.7–1.8.
- Environment fill: 0.42 day / 0.16 nightmare, eased over time. Visible sky and reflections share orientation.
- Ground litter tile: 2.5 world units; macro soil noise breaks repetition, worn tracks reduce litter.
- Bark map repetition: 2 across / 9 vertically, anisotropy 4.
- Tree branch alpha cutoff: 0.48; mipmaps and instanced spatial batches.
- Dense ground cover: 10,000 clumps, 17 triangles per clump, plus seeded low shrubs. Current jungle/grass/fern totals are approximately575–579k triangles across three tested seeds,23 loaded batches and at most24 during partial asset loading. Rice is separately budgeted:3,470clumps ×78triangles at the training seed. Grass alpha cutoff0.55, mipmaps and anisotropy4. Existing fern footprints locally shorten competing grass with an irregular feathered edge.
- One shadow-casting key light: 2,048-pixel map over a 48-unit region following the tank. The region is snapped to shadow texels to reduce movement shimmer.
- Tank body/track hardware: 10,996 triangles in shared authored geometries, excluding instances and legacy fittings. Chassis length factor 1.35; wheel radii remain circular and track end radii stay fixed. Moving shoe matrices update only during travel/turning.
- Dev-only inspection: launch `?sceneReview=1`, select Boot Camp, then Chase/Tank/Wreck/Squad/Forest/Paddies. Fixed camera views do not alter actors or combat state. The explicitly labeled 20-second drive check supplies ordinary movement inputs, uses normal collisions, then stops. In simulated horde mode only, `QA: clear wave` exercises normal damage/transition handlers to inspect later encounter rendering without replaying earlier combat; this is not proof of a player-completed run. All QA controls carry the game-UI input guard and are absent from production.
- Infantry shares one nine-bone skinned geometry per actor, with support-foot anchoring, bounded stride IK and shared weapon/muzzle transforms. Visible enemy positions now drive both combat queries and napalm impacts; authored cover positions remain fixed.
- Water uses analytic two-scale noise gradients instead of coherent repeating sine bands, derivative-faded fine ripples, existing sky reflections and no additional render pass. Roughness0.19, indirect reflection multiplier2.8, diffuse multiplier0.42 remain tuning values.
- Floating file labels show at most four ordinary names within18m. Armed targets retain distance-independent priority under the16-label global cap. See [file-labels.md](file-labels.md); deletion/confirmation/hut positions are unchanged.

## QA measurements and camera visibility

Development-only diagnostics expose one-second frame cadence/P95/max plus full-frame draws/triangles and optional asynchronous GPU timer averages on the document dataset. The GPU timer samples at most4Hz, bounds pending queries at4, never waits for unavailable results, and handles missing extension/disjoint/context loss. Counters surround the existing composer, including shadows and postprocessing. These helpers and visible QA controls are removed from production.

The20-second ordinary-input route now includes reversing and both pivot directions. New Face/Arnold/Rambo/Roosevelt views follow rendered actors; Palm/Shrub views support inspecting the imported plants. Close mapped-head, crates, water and fern captures are accepted local improvements. Daylight round7 drive:8 sampled one-second windows at1231×891/DPR1,60.5–61.0FPS,4.95–10.51ms GPU window averages. This is not a continuous-run percentile or cross-hardware guarantee.

The critic found that nearby foliage and tree trunks can obscure the tank during pivots. `FoliageSightline.tsx` now enables a narrow, feathered, view-only forest cutout by default after day/night driving checks. It includes leaf cards, vines, understory, palms and cloned trunk materials; buildings, enemies, ground, collision and shadow materials are unchanged. Only forest fragments between the camera and tank are affected, with a0.8–1.6m corridor and0.45m feather. Scene-local uniforms update once per frame without per-tree work, additional draws or sorted transparency. Development-only `foliageOff` retains an unmodified A/B baseline; non-chase inspection views disable the cutout.

Round9 camera A/B used fresh simulated Boot Camp runs, brightness1.3,1231×891/DPR1 and the same20-second ordinary-input route. Excluding the first two loading windows,18 sampled GPU windows averaged6.77ms off and7.38ms on (observed difference approximately0.61ms). Sampled frame cadence stayed above60FPS in those windows. Capture timing/positions vary by approximately1m; this is not a bit-identical or statistically controlled benchmark. The initial loading window included a162.8ms frame, so these are not all-frame guarantees. Screenshots demonstrate that the bounded cutout clears the player in branch/trunk obstruction cases while retaining surrounding forest. A further12 sampled nighttime driving frames also retained player visibility, with no captured console errors. Static samples cannot establish the absence of shimmer during every camera movement. Evidence is stored locally in ignored `tmp/visual-review/camera-ab-*` and `night-camera-round9-*`.

The optional whole-chunk distant-grass candidate remains development-only pending its own visual acceptance; see [grass-lod-review.md](grass-lod-review.md). Its geometry savings must not be reported as measured frame-rate gains.

The independent comparison and remaining quality gaps are recorded in [VISUAL_REVIEW.md](VISUAL_REVIEW.md). Performance samples there describe this machine and render scale, not a cross-hardware frame-rate guarantee.

## Final generation prompts (built-in mode)

### Grass clump

Use case: photorealistic-natural. Asset type: original photorealistic grass clump cutout for a Vietnam jungle game, one square RGBA PNG with genuinely transparent background. Single broad dense irregular clump of tropical jungle verge grass, rooted together at the very bottom center, dozens of long thin bent blades and shorter broad grasses, natural varied heights and arching tips, slight wiry dried tan undergrowth mixed among muted olive and deep green blades. Photographic botanical scan, diffuse neutral overcast illumination, fine veins, soft natural color variation, convincing tapered blade edges, no black outlines, no glossy highlights. Fill 90 percent of width and 90 percent of height with 5 percent transparent margin, tallest blades near center but irregular asymmetric crown, blade bases at y95 percent, side-on orthographic view. No earth or soil patch, no background, no roots hanging beneath, no text, no watermark, no frame, no visible checkerboard. Keep actual transparent alpha between every thin blade. No light halos, flat green cones, plastic appearance, flower stalks or seed heads. This texture is to be placed on crossed curved cards, not a scene illustration.

### Ground

Use case: photorealistic-natural. Asset type: seamless tileable PBR base-color game ground texture for a realistic Vietnam jungle combat game. Orthographic photograph looking directly down at 2 x 2 metres of damp tropical brown earth, compact clay, tiny stones, decaying brown and olive jungle leaves, thin roots and scattered fine short grass. Extremely realistic natural small-scale texture, like a scan, sharp microdetail, flat diffuse overcast illumination, no baked cast shadows, no specular hotspot, no perspective, no depth of field. Muted warm mud browns with subtle moss green, well exposed midtones, not black. Fill every edge uniformly; seamlessly tileable horizontally and vertically. Leaves varied 3-12cm, irregular mottling, no obvious central object. No text, labels, border, human, weapons, buildings, interface or watermark. Square 1024x1024 texture, entire image is the material.

### Monsoon panorama

Use case: photorealistic-natural. Asset type: high-resolution 360-degree equirectangular environment panorama for a realistic Vietnam jungle game. Original cinematic photorealistic view across a remote Vietnamese tropical rainforest valley beneath huge layered monsoon clouds, diffuse late-afternoon overcast illumination, stormy charcoal/slate clouds with silver-gray edges and soft bright breaks, humid atmospheric depth. Equirectangular spherical skybox, 2:1 aspect, full seamless 360 horizontal field of view, zenith at top, horizon at vertical center. Dense continuous distant forest ridges only in a thin band around the horizon, mist between receding layers, no close trees. The upper half dominated by richly detailed turbulent storm cloud forms, not featureless gray; lower half deep olive forest valley falling away. Natural desaturated colors but readable, high dynamic-range photographic feel without crushed blacks or pure white sky. No sun disc, sunset, roads, buildings, vehicles, people, HUD, lettering, logos or watermark. No Battlefield game assets, make an original photographic panorama. Target 2048x1024.

### Bark

Use case: photorealistic-natural. A seamless, tileable base-color material texture for wet Vietnamese tropical jungle tree bark. Straight-on orthographic close-up filling whole square, 1 metre high by 60 centimetres across. Mature dark grey-brown dipterocarp bark, vertically elongated fissures, fine fibrous ridges, small irregular lichen and muted olive moss specks. Photographic scan microdetail, flat diffuse overcast light, no baked cast shadows or glossy hotspot, no tree outline or background, no roots or branches, no large knots. Seamlessly tileable vertically and horizontally, no text, labels, border, watermarks, no geometric stylization. Realistic dark weathered bark but readable midtones. Entire image is the texture.

### Tank armor

Use case photorealistic-natural. Asset type seamless tileable game PBR base-color material. Orthographic flat scan of worn US Vietnam-era olive-drab tank painted steel, muted desaturated gray-olive green, small paint chips exposing dark dull steel, fine scuffs and scratches, scattered shallow pitting, slight dried muddy dust and rain streaks, subtle cloudy grime. Material viewed at half-metre scale. Mostly intact paint, restrained wear, no rust orange blocks. Flat diffuse neutral lighting, no baked shadows, no bevel, no perspective. Fill whole square uniformly. No tank shapes, no panels or large seams, no bolts, no insignia, text, logos, watermark or border. Seamlessly tileable horizontally and vertically. Photographic microdetail, well exposed dark midtones, not glossy or black.

### Foliage spray

Use case: isolated photorealistic natural game foliage asset. A single dense fan-shaped small branch spray from a Vietnamese tropical evergreen broadleaf tree, cut out on a fully TRANSPARENT background with accurate alpha. Photorealistic botanical scan quality, no background at all. Thin branching woody stems carry MANY dozens of overlapping small lance-shaped and oval leaves, irregular varied orientations, medium/dark desaturated natural green with a few young lighter leaves, crisp detailed venation, slight wear, soft diffuse overcast lighting, no cast shadow or glossy hotspots. Branch fan fills most of square image, slender main twig runs from lower center toward upper center and branches left and right across image. Dense enough that central region has substantial connected leaf coverage, delicate irregular silhouette at edges, small transparent gaps between leaves. Leaves 4-12cm relative to an 80cm branch spray. Leaves have subtle convex 3D curvature and tiny individual serrations, not broad blank geometric polygons. No pot, soil, ground, roots, mountains, text, labels, watermark, frame, checkerboard or colored background. True transparent PNG. Square asset with 5% transparent padding all around.
