/**
 * Deterministic environment generation helpers.
 *
 * The generator is deliberately coordinate based: the same seed and cell
 * coordinates always produce the same candidate, so scenery never shuffles
 * when React remounts the scene. Candidates are considered in a seeded order
 * and rejected when they violate the requested spacing, giving us a cheap
 * blue-noise / Poisson-disc-style scatter without a runtime dependency.
 */

export interface ScatterPoint {
  cellX: number;
  cellZ: number;
  x: number;
  z: number;
}

interface ScatterOptions {
  width: number;
  depth: number;
  cellSize: number;
  minDistance: number;
  seed: number;
  maxPoints: number;
  centerX?: number;
  centerZ?: number;
  accept?: (x: number, z: number) => boolean;
}

function mix32(value: number) {
  let mixed = value | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

/** Stable [0, 1) noise keyed by integer coordinates, channel, and scene seed. */
export function coordinateNoise(x: number, z: number, seed: number, channel = 0) {
  const value = mix32(
    Math.imul(x, 0x1f123bb5)
      ^ Math.imul(z, 0x5f356495)
      ^ Math.imul(seed, 0x6c8e9cf5)
      ^ Math.imul(channel, 0x27d4eb2d),
  );
  return value / 0x100000000;
}

export function createDeterministicScatter({
  width,
  depth,
  cellSize,
  minDistance,
  seed,
  maxPoints,
  centerX = 0,
  centerZ = 0,
  accept = () => true,
}: ScatterOptions): ScatterPoint[] {
  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(depth / cellSize);
  const candidates: Array<ScatterPoint & { priority: number }> = [];

  for (let cellZ = 0; cellZ < rows; cellZ += 1) {
    for (let cellX = 0; cellX < columns; cellX += 1) {
      // Keep points away from cell edges so adjacent cells cannot collapse
      // into an accidental clump after jitter is applied.
      const jitterX = 0.14 + coordinateNoise(cellX, cellZ, seed, 1) * 0.72;
      const jitterZ = 0.14 + coordinateNoise(cellX, cellZ, seed, 2) * 0.72;
      const x = centerX - width * 0.5 + (cellX + jitterX) * cellSize;
      const z = centerZ - depth * 0.5 + (cellZ + jitterZ) * cellSize;
      if (x > centerX + width * 0.5 || z > centerZ + depth * 0.5 || !accept(x, z)) continue;

      candidates.push({
        cellX,
        cellZ,
        x,
        z,
        priority: coordinateNoise(cellX, cellZ, seed, 3),
      });
    }
  }

  // A seeded priority avoids the directional bias of accepting cells in rows.
  candidates.sort((a, b) => a.priority - b.priority);
  const accepted: ScatterPoint[] = [];
  const minimumDistanceSquared = minDistance * minDistance;

  for (const candidate of candidates) {
    if (accepted.length >= maxPoints) break;
    const overlaps = accepted.some(point => {
      const dx = point.x - candidate.x;
      const dz = point.z - candidate.z;
      return dx * dx + dz * dz < minimumDistanceSquared;
    });
    if (!overlaps) accepted.push(candidate);
  }

  return accepted;
}
