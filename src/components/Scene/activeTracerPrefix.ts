import type { InstancedBufferAttribute, InstancedMesh } from 'three';

const ranges = new WeakMap<InstancedBufferAttribute, {start: number; count: number}>();

/** Every live tracer has just been written, in pool order, to the start of
 * the instance buffer. Stale slots are outside the draw count, even if we
 * skipped rendering the previous frame. Keep the buffer allocation stable. */
export function submitActiveTracers(mesh: InstancedMesh | null, count: number) {
  if (!mesh) return;
  mesh.count = count;
  if (count === 0) return;
  const attribute = mesh.instanceMatrix;
  let range = ranges.get(attribute);
  if (!range) {range = {start: 0, count: 0}; ranges.set(attribute, range);}
  range.count = count * attribute.itemSize;
  attribute.clearUpdateRanges();
  attribute.updateRanges.push(range);
  attribute.needsUpdate = true;
}
