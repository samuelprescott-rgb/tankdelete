# Clothing and material gauntlet

**Objective:** The game close-up should read as layered field clothing, not
one smooth mannequin shell. Establish the silhouette and construction first;
paint should reinforce folds, seams, and wear rather than substitute for them.

**Review evidence:** Compare the same in-game kit and sleeve views before and
after, with the existing game lights and exposure. Inspect both factions,
a bent arm, the jacket/waist, and the boot/hem junction. Also inspect a
normal-distance view and the darker Horde lighting. Do not count a crop
where grass or an occluding prop hides the relevant junction. Compare the
shape hierarchy and edge treatment to the supplied hand-painted turnarounds.

**Pass bar:** The main fold groups have a visible direction and taper; sleeve
and cuff are joined; the pocket flap and webbing sit on the cloth; canvas,
fatigues, and leather have distinguishable value and finish. No distracting
seams, float, through-mesh cuts, or fine shimmer as the camera pulls away.

**Boundary:** Keep the established skeleton, anchored rifle pose, head
sculpt, and movement. Add no texture downloads or clothing draw calls.
Check build, geometry/rig regressions, and rendered shader compilation.
The builder and independent critic must see the current images before
closing a rejected detail.

## Review record

- Baseline, `cloth-before-*`: the sleeves read as tubes, the webbing and
  case did not read as layers, and the hard case looked attached to an
  inflated pack.
- Round 1, `cloth-r1-*`: the collar, pocket flaps, and joined shoulder
  improved. The critic rejected the smooth outer elbow and thigh, the
  raised placket strip, and the pack's nearly featureless side. A prop
  occluded the original boot view; it did not verify the hem.
- Round 2, `cloth-r2-*`: the folded cuff, carrier construction, and localized
  knee shape improved. The painted elbow did not carry through at matching
  distance. The new front boot view reveals the sole, but not reliable lacing.
- Round 3, `cloth-r3-*`: directionally placed crease geometry, joined belt
  pouches and color accents survive the live scene. The fresh critic still
  chose the reference over the sleeve shape. Pause tweaking the same profile;
  a new pass should structure the elbow as a dedicated folded surface with
  matching highlight and shadow paint. Do not claim close-up parity.

For live review, open the dev build with `?sceneReview=1`, launch Boot Camp,
and use **US kit**, **US sleeve**, **US chest**, **US hems**, and **VC kit**.
The camera follows the actual rendered actor with that actor's in-world
pose and lighting. **Infantry** is the normal-distance comparison.
