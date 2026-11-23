import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TILE = 48;
export const WAKE_CELS = 12;

// Bake Ripple Pond's damped wave and directional slope into a small indexed
// set of water colors. Transparent texels leave the actual river visible.
export function makeTrackWakeAtlas() {
  const rgba = new Uint8Array(TILE * TILE * WAKE_CELS * 4);
  for (let cel = 0; cel < WAKE_CELS; cel++) {
    const age = cel / (WAKE_CELS - 1);
    const front = 2 + 13 * (1 - (1 - age) ** 2);
    function height(x: number, y: number) {
      const r = Math.hypot(x, y);
      const bearing = Math.atan2(y, x);
      const u = r - front + .45 * Math.sin(3 * bearing + .4) + .32 * Math.sin(5 * bearing - .7);
      if (u > 2 || u < -9) return 0;
      return Math.exp(-(((u + 2) / 3.8) ** 2)) * Math.sin(u * 1.38) / Math.sqrt(1 + r * .12);
    }
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const px = ((x + .5) / TILE - .5) * 32, py = ((y + .5) / TILE - .5) * 32;
      const bearing = Math.atan2(py, px);
      // Let a few facets catch the light while the rest merge into the river.
      const facet = Math.sin(5 * bearing + .25 * px) + .62 * Math.sin(9 * bearing - .2 * py);
      if (facet < -.34 || (py < -4 && facet < .6)) continue;
      const h = height(px, py);
      const slope = (.8 * (h - height(px + 1, py)) + 1.1 * (h - height(px, py + 1))) * (1 - .65 * age);
      const fade = (1 - age) ** .7;
      const i = ((cel * TILE + y) * TILE + x) * 4;
      if (slope > .38) rgba.set([162, 191, 175, Math.round(158 * fade)], i);
      else if (slope > .14) rgba.set([100, 145, 137, Math.round(126 * fade)], i);
      else if (slope < -.18) rgba.set([33, 61, 64, Math.round(124 * fade)], i);
    }
  }
  const map = new THREE.DataTexture(rgba, TILE, TILE * WAKE_CELS);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

export function setWakeCel(shader: Parameters<THREE.Material['onBeforeCompile']>[0]) {
  shader.vertexShader = 'attribute float wakeCel;\n' + shader.vertexShader.replace(
    '#include <uv_vertex>',
    `#include <uv_vertex>
     vMapUv.y = (clamp(vMapUv.y, 0.5 / ${TILE}., 1. - 0.5 / ${TILE}.) + wakeCel) / ${WAKE_CELS}.;`,
  );
}

// PixelFX's bright bead over a darker short tail, built in volume so the
// highlight and silhouette remain legible from either side of the tank.
export function makeTrackSprayBead() {
  function block(width: number, height: number, y: number, shades: string[]) {
    const box = new THREE.BoxGeometry(width, height, width).translate(0, y, 0);
    const colors: number[] = [];
    for (const shade of shades) {
      const color = new THREE.Color(shade);
      for (let vertex = 0; vertex < 4; vertex++) colors.push(color.r, color.g, color.b);
    }
    box.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return box;
  }
  const head = block(1.05, 1, .45, ['#b9d4c6','#92b6ac','#ebefd7','#668f8a','#d0dfcd','#8cafa5']);
  const tail = block(.56, 1, -.55, ['#70978f','#628b87','#95b6a9','#547e7b','#88aca1','#63867f']);
  const bead = mergeGeometries([head, tail]);
  head.dispose();
  tail.dispose();
  return bead;
}
