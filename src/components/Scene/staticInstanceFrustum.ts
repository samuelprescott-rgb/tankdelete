import { Box3, Frustum, Matrix4, type Camera, type InstancedBufferAttribute, type InstancedMesh } from 'three';

// Inspection/chase cameras settle before this; the real composer renders at 1.
// Updating in onBeforeRender is too late: Three has already uploaded attributes.
export const STATIC_FOLIAGE_CULL_PRIORITY = 0.99;
const CELL_SIZE = 20;
const MIN_COUNT = 192;
const MIN_TRIANGLES = 20_000; // Only the high-submit cohorts found by the real scene census.
// Except for the taller rice gust, foliage shaders displace x/z in local space
// by at most 0.08/0.044 before the instance transform. Pad there, not after a
// large nonuniform scale. Cell margin keeps near-edge placements submitted.
const LOCAL_WIND_PAD = 0.125;
const CELL_MARGIN = 0.75;
// Only after a new exact-visible cell is needed: submit a little beyond the
// actual viewport to cover ordinary subsequent motion without repacking again.
// Exact visibility is still tested on EVERY changed camera/mesh projection.
const GUARD_SCALE = 1 / 1.25;
const GUARD_TRANSLATION = 2;
const PRUNE_FRACTION = 0.15;
const MAX_MOVING_RICE_BYTES = 64 * 1024;

function markChanged(attribute: InstancedBufferAttribute, first: number, end: number, width: number) {
  // If global bounds hid this mesh, Three may not have uploaded the previous
  // edit yet. Union with the outstanding range, never discard it.
  let start = first * width, stop = end * width;
  for (const range of attribute.updateRanges) { start = Math.min(start, range.start); stop = Math.max(stop, range.start + range.count); }
  attribute.clearUpdateRanges(); attribute.addUpdateRange(start, stop - start); attribute.needsUpdate = true;
}

/** Only for explicitly static, non-interactive, opaque
 * scenery owned by the caller. One draw and original instance order; the source
 * is never rewritten. A changed camera mask uploads just the new live prefix.
 * Shadow casters require a separate, explicit mode and the complete same-pass
 * camera union. A missing shadow camera restores every original placement. */
export function createStaticInstanceFrustum(mesh: InstancedMesh, mode: 'compact' | 'bounded-tail' | 'color-and-key-shadow' | 'static-jungle' = 'compact') {
  const count = mesh.count, matrix = mesh.instanceMatrix, color = mesh.instanceColor;
  const casting = mode === 'color-and-key-shadow';
  // The two small caster cohorts cover 134 m; tighter cells reduce waste in
  // their 48 m shadow map without creating new draws or large instance uploads.
  const cellSize = casting ? 10 : CELL_SIZE;
  // Some spreading stands have few plants but hundreds of triangles per
  // plant; other outer-ring foliage has many inexpensive plants. Both had
  // thousands of strictly offscreen triangles at the live embassy turnout.
  // Bound the extra repack to 38 KiB, never opt in casters/other scenery.
  const mediumStand = mode === 'static-jungle' && count >= 40 && count <= 512;
  if ((!mediumStand && count < MIN_COUNT) || mesh.castShadow !== casting || !mesh.frustumCulled || mesh.morphTexture ||
    Array.isArray(mesh.material) || mesh.material.transparent || !mesh.material.depthWrite ||
    !(matrix.array instanceof Float32Array) || matrix.itemSize !== 16 ||
    (color && (!(color.array instanceof Float32Array) || color.itemSize !== 3))) return null;
  const geometry = mesh.geometry;
  if (count * (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3 < (mediumStand ? 14_000 : MIN_TRIANGLES)) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return null;
  const padded = geometry.boundingBox.clone().expandByScalar(mode === 'bounded-tail' ? .32 : LOCAL_WIND_PAD);
  // Rice is already planted field-by-field, with remote paddies at the end.
  // Keep its long central prefix immutable instead of trading the occasional
  // offscreen central tuft for a 224 KB attribute rewrite on a quick turn.
  const fixed = mode === 'bounded-tail' ? Math.max(0, count - Math.floor(MAX_MOVING_RICE_BYTES / (4 * (16 + (color ? 3 : 0))))) : 0;
  const mutable = count - fixed;
  const originalMatrices = matrix.array.slice(fixed * 16, count * 16);
  const originalColors = color?.array.slice(fixed * 3, count * 3) as Float32Array | undefined;
  const slotCell = new Uint32Array(count), ids = new Map<string, number>();
  const cells: Box3[] = [], box = new Box3(), transform = new Matrix4();
  for (let i = fixed; i < count; i++) {
    transform.fromArray(originalMatrices, (i-fixed) * 16);
    const e = transform.elements, key = `${Math.floor(e[12] / cellSize)}:${Math.floor(e[14] / cellSize)}`;
    let cell = ids.get(key);
    if (cell === undefined) { cell = cells.length; ids.set(key, cell); cells.push(new Box3()); }
    slotCell[i] = cell;
    cells[cell].union(box.copy(padded).applyMatrix4(transform));
  }
  if (cells.length < 2) return null;
  for (const cell of cells) cell.expandByScalar(CELL_MARGIN);
  const live = new Uint8Array(cells.length).fill(1), exact = new Uint8Array(cells.length), weights = new Uint32Array(cells.length);
  const packed = new Uint32Array(mutable);
  for (let i = fixed; i < count; i++) { weights[slotCell[i]]++; packed[i-fixed] = i; }
  const frustum = new Frustum(), guard = new Frustum(), guardedClip = new Matrix4(), clip = new Matrix4(), lastClip = new Matrix4();
  const shadowClip = new Matrix4(), lastShadowClip = new Matrix4(), shadowFrustum = new Frustum();
  let hasCamera = false, initialGuardExcess = 0, lastSpace: Camera['coordinateSystem']|undefined, lastReversed = false;
  let lastShadowSpace: Camera['coordinateSystem']|undefined, lastShadowReversed = false;
  const dirty = (first: number, end: number) => {
    if (end <= first) return;
    markChanged(matrix, first, end, 16); if (color) markChanged(color, first, end, 3);
  };
  return {
    update(camera: Camera, shadowCamera?: Camera) {
      if (casting && !shadowCamera) { if (hasCamera) this.restore(); return false; }
      // Account for parent transforms and same-frame camera teleports before
      // Three updates its render list. All cell bounds are mesh-local.
      // Casters run inside scene.onBeforeRender: use the matrices Three has
      // already selected, including manually managed alternate-view matrices.
      if (!casting) { camera.updateWorldMatrix(true, false); mesh.updateWorldMatrix(true, false); }
      clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
      if (shadowCamera) shadowClip.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse).multiply(mesh.matrixWorld);
      if (hasCamera && clip.equals(lastClip) && camera.coordinateSystem === lastSpace && camera.reversedDepth === lastReversed &&
        (!shadowCamera || (shadowClip.equals(lastShadowClip) && lastShadowSpace === shadowCamera.coordinateSystem && lastShadowReversed === shadowCamera.reversedDepth))) return false;
      const first = !hasCamera; hasCamera = true; lastClip.copy(clip);
      lastSpace = camera.coordinateSystem; lastReversed = camera.reversedDepth;
      frustum.setFromProjectionMatrix(clip, camera.coordinateSystem, camera.reversedDepth);
      if (shadowCamera) {
        lastShadowClip.copy(shadowClip); lastShadowSpace = shadowCamera.coordinateSystem; lastShadowReversed = shadowCamera.reversedDepth;
        shadowFrustum.setFromProjectionMatrix(shadowClip, lastShadowSpace, lastShadowReversed);
      }
      let missing = 0, needed = fixed;
      for (let cell = 0; cell < cells.length; cell++) {
        exact[cell] = frustum.intersectsBox(cells[cell]) || (shadowCamera && shadowFrustum.intersectsBox(cells[cell])) ? 1 : 0;
        if (exact[cell]) { needed += weights[cell]; if (!live[cell]) missing += weights[cell]; }
      }
      if (!first && !missing && mesh.count - needed <= initialGuardExcess + mutable * PRUNE_FRACTION) return false;
      const ahead = !first && missing < mutable * 0.16 && mesh.count - needed < mutable * 0.45;
      if (ahead) {
        guardedClip.copy(clip); const e = guardedClip.elements;
        for (let col = 0; col < 16; col += 4) { e[col] *= GUARD_SCALE; e[col + 1] *= GUARD_SCALE; }
        guard.setFromProjectionMatrix(guardedClip, camera.coordinateSystem, camera.reversedDepth);
        for (const plane of guard.planes) plane.constant += GUARD_TRANSLATION;
      }
      let changed = false;
      for (let cell = 0; cell < cells.length; cell++) {
        const keep = exact[cell] || (ahead && guard.intersectsBox(cells[cell]) ? 1 : 0);
        if (keep !== live[cell]) { live[cell] = keep; changed = true; }
      }
      if (!changed) return false;
      let n = fixed, start = count, end = 0;
      for (let i = fixed; i < count; i++) {
        if (!live[slotCell[i]]) continue;
        if (packed[n-fixed] !== i) {
          packed[n-fixed] = i; start = Math.min(start, n); end = n + 1;
          const from = (i-fixed) * 16, to = n * 16;
          for (let k = 0; k < 16; k++) matrix.array[to + k] = originalMatrices[from + k];
          if (color && originalColors) for (let k = 0; k < 3; k++) color.array[n * 3 + k] = originalColors[(i-fixed) * 3 + k];
        }
        n++;
      }
      mesh.count = n; initialGuardExcess = n - needed; dirty(start, end); return end > start;
    },
    restore() {
      if (mesh.count !== count) {
        matrix.array.set(originalMatrices, fixed * 16); if (color && originalColors) color.array.set(originalColors, fixed * 3);
        mesh.count = count; dirty(fixed, count);
      }
      initialGuardExcess = 0; hasCamera = false;
      live.fill(1); for (let i = fixed; i < count; i++) packed[i-fixed] = i;
    },
  };
}
