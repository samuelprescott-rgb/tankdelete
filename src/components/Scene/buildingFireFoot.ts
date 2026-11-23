import * as T from 'three';

/** Find the closest timber or masonry at the bottom of this particular mesh.
 * A horizontal cut preserves door gaps, separate stilts and breached walls.
 * This runs once when a building catches fire, or when its walls collapse. */
export function buildingFireFoot(geometry: T.BufferGeometry, world: T.Matrix4, hit: T.Vector3) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!.clone().applyMatrix4(world);
  const baseY = Math.max(0, bounds.min.y);
  const cutY = Math.min(baseY + .06, bounds.max.y - .001);
  const foot = new T.Vector3(hit.x, baseY, hit.z);
  const positions = geometry.getAttribute('position'), indices = geometry.index;
  const count = indices?.count ?? positions.count;
  const corners = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
  const ends = [new T.Vector3(), new T.Vector3()];
  const segment = new T.Line3(), candidate = new T.Vector3();
  const target = new T.Vector3(hit.x, cutY, hit.z);
  let best = Infinity;
  for (let i = 0; i < count; i += 3) {
    for (let j = 0; j < 3; j++) {
      corners[j].fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j).applyMatrix4(world);
    }
    let crossings = 0;
    for (let j = 0; j < 3; j++) {
      const a = corners[j], b = corners[(j + 1) % 3];
      if ((a.y > cutY) === (b.y > cutY)) continue;
      ends[crossings++].lerpVectors(a, b, (cutY - a.y) / (b.y - a.y));
    }
    if (crossings !== 2 || ends[0].equals(ends[1])) continue;
    segment.set(ends[0], ends[1]).closestPointToPoint(target, true, candidate);
    const distance = candidate.distanceToSquared(target);
    if (distance < best) {
      best = distance;
      foot.set(candidate.x, baseY, candidate.z);
    }
  }
  return foot;
}
