# Burning debris

Place `BurningDebris` at the centre of the fuel bed. `size` scales both the flames and smoke. `wind` sets the horizontal displacement at the crown in local units. `phase` offsets the animation for neighbouring sources.

```tsx
<BurningDebris position={[x, y, z]} size={1.6} wind={[1.1, -.4]} phase={.37}/>
```

For multiple patches on one prop, pass `pockets` with local positions, sizes and frame offsets. `RidgeThatchFires` places a second patch on the damaged eave this way. Use `StandingPixelFires` for a group of persistent sources. The embassy courtyard and Dispatch use this component. `CharcoalCloud` supplies smoke on its own and supports instanced transforms for flamethrower-lit huts. Napalm supplies its own ignition and burnout clocks to `createSmokeFoldArt` and `writeSmokeFold`. Both renderers use the same `rollingSmokeGLSL` artwork, motion and ember-light palette.

## Smoke artwork

The four smoke drawings in `public/images/textures/charcoal-cloud.png` came from built-in ImageGen. The shader samples two drawings on a fixed pixel grid. It rotates and deforms them in opposite directions, joins their shaded faces, and applies orange underlighting using height above the fuel. The six-frame strike silhouette also shapes the outdoor standing fires.

### Generation prompt

Original pixel-art game VFX sprite sheet. On transparent background draw exactly FOUR isolated compact, billowing clumps of heavy carbon smoke, one centered in each quadrant of an evenly spaced 2 by 2 square atlas. Each is just one detached cloud parcel, approximately as wide as tall. No entire plumes, long tails, fire, sparks, ground, scenery, or text. Four related but differently shaped folded masses, faces tumbling and curling into deeply carved pockets, with broad scalloped protrusions, irregular broken silhouettes, overlapping dark lobes, two or three readable half-moon creases and little negative-space air bites. Hand-pixeled 1990s cinematic arcade art. Start with a charcoal-black silhouette, paint large intentional stepped 2-4 pixel clusters using six discrete muted values, very dark aubergine shadows, smoky slate violet body, restrained dusty mauve on broad planes facing upper left, small ember-copper bounced accents underneath. Chunky solid areas and some fine broken dither on just the shadow turns. No smooth blends, soft haze, blur, translucent veils, highlights on every outline, uniform balls, greasy ribbons, or vector smoothness. Each shape has volume and weight. Designed to read at 48x48 gameplay pixels per sprite. All four completely inside their quadrants with clear margins.
