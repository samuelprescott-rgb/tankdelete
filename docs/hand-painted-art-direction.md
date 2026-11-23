# Hand-painted direction

The period forms still identify TankDelete. The style comes from how those forms
are sculpted and painted: readable large planes, deliberate warm and cool
transitions, and sharp accents only where construction, wear, or anatomy
calls for them.

- **Faces and kits:** check the jaw, brow, eye opening, and helmet fit in clay
  before painting. Build cloth tension and contact into the actual silhouette.
  Keep fold faces quieter than seams, webbing, pocket flaps, and boot welts.
- **Tank and equipment:** separate painted cast plate, dark steel, rubber, and
  canvas in value before adding wear. Concentrate chipped edges and grime on
  specific fittings. Preserve the established rig, track motion, and sockets.
- **World:** keep ochre route shapes, cool water, and layered foliage distinct.
  Shape roof courses and tree buttresses in geometry; use directional straw and
  bark paint to support those shapes. Keep fine patterns out of distant reads.
- **Night:** preserve the existing dark atmosphere and warm firelight accents.
  Confirm faces and important equipment remain readable without emissive washes.

These principles adapt Weston Reid's
[sculpt and hand-paint workflow](https://www.creativebloq.com/how-to/create-stylish-hand-painted-character-art-in-3d)
to the existing runtime's merged meshes, vertex colors, and shared materials.
The reference model and imagery are not packaged assets.

For visual QA, open the local dev build with `?sceneReview=1`. Use **Face**,
**Enemy face**, **Infantry**, **Tank**, **Village**, **Forest**, and **River**.
Also review the normal chase camera and one live Horde wave. Keep the same
camera, exposure, and scene when comparing revisions. Inspect the silhouettes
in clay and the paint in live lighting; one view cannot establish both.

The geometry and shader checks are regression gates, not a claim of reference
parity. Current assets use a consistent direction, but portrait-grade facial
paint and individual prop authorship remain separate from game-camera checks.
