# Continuous infantry cloth sleeves

The current model extends this earlier shoulder pass into a closed, folded sleeve from shoulder to cuff, and blends the trouser mesh across the thigh and shin bones at each knee. `node scripts/check-infantry-sleeves.mjs` now checks the continuous sleeve surface and blended knee weights. The notes below describe the earlier shoulder-only pass.

Clothed infantry now uses one continuous seven-ring, twelve-sided upper sleeve per arm. Its open shoulder end starts 2.9cm inboard and 1.2cm above the existing shoulder anchor, embedded inside the shirt; the centerline ends at the unchanged elbow. A slightly curved centerline, tapering elliptical section, compressed upper contour and flattened outer edge replace the detached spherical shoulder appearance. Small static cloth folds and smooth shared seam normals use the existing vertex-color material.

The two sleeves total **288 triangles**, replacing **576** for the old two sphere-plus-tube pairs. No additional draw calls, materials, textures, bones, frame updates or animation systems were added. Lower sleeves, elbow surfaces, wrist cuffs, fingers, rifle/socket coordinates, stance offsets and rig behavior are unchanged. Sleeveless characters retain their original skin shoulder/upper-arm geometry byte-for-byte. Tank crew gets the same cloth improvement while retaining its existing cupola trim and hand anchors.

Run `node scripts/check-infantry-sleeves.mjs` for a direct comparison against the prior shoulder path: it checks all unaffected vertices and attributes, all three palettes, both factions and stances, separate-head and raised-rifle variants, sleeveless preservation, chest-bone weights, exact count savings, normal/seam validity and crew trim. Run the existing `check-infantry.mjs` and TypeScript checks as well.

This is a bounded procedural cloth improvement, not an authored uniform asset or an AAA-quality claim. Fixed Face/Squad captures are still required to judge shoulder-to-torso blending and silhouette under the live lighting.
