import {makePixelLeafGeometry} from './pixelLeafGeometry';
import * as T from 'three';
import { TUNNEL_WARNING } from '../../lib/campaignTunnels';
import { hatchOpening } from './tunnelBrush';

const FPS = 18;
const SOIL_COUNT = 48;
const LEAF_COUNT = 12;
const CELL = .079;
const COLS = 29;
const ROWS = 29;
const END = Math.round(TUNNEL_WARNING * FPS);

// Falling Sand's down, then down-diagonal rule, on a narrow strip at each
// side of the shaft. Bake local positions once so a skipped frame or pause
// always shows exactly the same spill at a given warning age.
function bakeSoil() {
  const positions = new Float32Array((END + 1) * SOIL_COUNT * 3);
  positions.fill(NaN);
  const grid = new Int16Array(COLS * ROWS * 2).fill(-1);
  for (let frame = 0; frame <= END; frame++) {
    const age = frame / FPS;
    const tilt = -hatchOpening(age, TUNNEL_WARNING);
    for (let side = 0; side < 2; side++) {
      const start = side * COLS * ROWS;
      for (let row = 1; row < ROWS; row++) for (let k = 0; k < COLS; k++) {
        const col = frame % 2 ? k : COLS - k - 1;
        const i = start + row * COLS + col, grain = grid[i];
        if (grain < 0) continue;
        let next = i - COLS;
        if (grid[next] !== -1) {
          const first = (grain + frame) % 2 ? 1 : -1;
          const free = (d: number) => col + d >= 0 && col + d < COLS && grid[i + d] < 0 && grid[i - COLS + d] < 0;
          if (free(first)) next += first;
          else if (free(-first)) next -= first;
          else continue;
        }
        grid[next] = grain;
        grid[i] = -1;
      }
      // Shed from the moving outer cane, transformed about its actual hinge.
      if (frame >= 5 && (frame - 5) % 2 === 0) {
        const n = (frame - 5) / 2;
        if (n < SOIL_COUNT / 2) {
          const z = .45 + ((n * 11 + side * 5) % 19) * .062;
          const col = Math.round((.24 + z * Math.cos(tilt)) / CELL);
          const row = Math.round((.14 + z * Math.sin(tilt)) / CELL);
          const i = start + row * COLS + col;
          if (grid[i] < 0) grid[i] = n * 2 + side;
        }
      }
      for (let i = 0; i < COLS * ROWS; i++) {
        const id = grid[start + i];
        if (id < 0) continue;
        const j = (frame * SOIL_COUNT + id) * 3;
        const row = Math.floor(i / COLS);
        const z = -1.13 + (i % COLS) * CELL;
        const radius = 1.02 + .12 * (.5 + .5 * Math.sin(id * 8.72));
        const rimX = 1.27 * Math.sqrt(Math.max(0, radius ** 2 - (z / 1.04) ** 2));
        const drift = Math.max(0, 1 - row / 8);
        positions[j] = (side ? 1 : -1) * (1.04 + (rimX - 1.04) * drift);
        positions[j + 1] = .15 - .54 * (radius - .96) + row * CELL;
        positions[j + 2] = z + .017 * Math.sin(id * 3.5);
      }
    }
  }
  return positions;
}

export function makeTunnelLitter() {
  const soilFrames = bakeSoil();
  const soil = new T.InstancedMesh(new T.BoxGeometry(1,1,1), new T.MeshLambertMaterial(), SOIL_COUNT);
  const leaves = new T.InstancedMesh(makePixelLeafGeometry(), new T.MeshLambertMaterial({vertexColors:true}), LEAF_COUNT);
  const group = new T.Group();
  group.name = 'tunnel-hatch-litter';
  soil.name = 'tunnel-spilling-earth';
  leaves.name = 'tunnel-falling-leaves';
  group.add(soil, leaves);
  for (const mesh of [soil, leaves]) {
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
  }
  const pose = new T.Object3D(), tint = new T.Color();
  const earthColors = ['#68543e','#78634b','#574b3c','#826e52'];
  const leafColors = ['#728052','#a19a65','#69764c','#968053'];
  // Allocate instance colors before the first render. Matrices are packed by
  // birth order; there are no hidden zero-scale instances in the draw.
  for (let i = 0; i < SOIL_COUNT; i++) soil.setColorAt(i, tint.set(earthColors[i % 4]));
  for (let i = 0; i < LEAF_COUNT; i++) leaves.setColorAt(i, tint.set(leafColors[i % 4]));
  let last = -1;
  function sample(time: number) {
    const frame = Math.max(0, Math.min(END, Math.floor(time * FPS)));
    if (frame === last) return;
    last = frame;
    soil.count = leaves.count = 0;
    for (let i = 0; i < SOIL_COUNT; i++) {
      const j = (frame * SOIL_COUNT + i) * 3;
      if (!Number.isFinite(soilFrames[j])) continue;
      pose.position.fromArray(soilFrames, j);
      pose.rotation.set(.16 * Math.cos(i), i * 2.4, .24 * Math.sin(i));
      const size = .047 + .007 * (i % 5);
      pose.scale.set(size, size * .78, size * 1.2);
      pose.updateMatrix();
      soil.setMatrixAt(soil.count++, pose.matrix);
    }
    for (let i = 0; i < LEAF_COUNT; i++) {
      const release = .44 + i * .205, elapsed = frame / FPS - release;
      if (elapsed < 0) break;
      const side = i % 2 ? 1 : -1;
      const tilt = -hatchOpening(release, TUNNEL_WARNING);
      const z = .62 + (i * 7 % 11) * .083;
      const y = .28 + z * Math.sin(tilt);
      const life = .66 + y * .36, u = Math.min(1, elapsed / life);
      const phase = i * 2.4 + u * 5.8, swing = Math.sin(Math.PI * u);
      // PixelFX's pendulum drift and rolling leaf face. Each leaf finishes
      // on the earth lip, including at sites where the outer bank slopes away.
      const landingZ = -.89 + z * Math.cos(tilt) + .20;
      const landingX = 1.27 * Math.sqrt(1.12 ** 2 - (landingZ / 1.04) ** 2);
      pose.position.set(side * (.81 + (landingX - .81) * u + .16 * Math.sin(phase) * swing),
        .074 + (y - .074) * (1 - u * u) + .24 * swing,
        landingZ - .20 * (1 - u) + .17 * Math.cos(phase) * swing);
      pose.rotation.set(.76 * Math.cos(phase) * swing, i * 2.4 + u * 1.5, (1.8 + .8 * Math.sin(phase)) * swing);
      pose.scale.setScalar(.030 + .003 * (i % 4));
      pose.updateMatrix();
      leaves.setMatrixAt(leaves.count++, pose.matrix);
    }
    soil.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
  }
  sample(0);
  return {group, sample, dispose() {
    for (const mesh of [soil, leaves]) {
      mesh.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }};
}
