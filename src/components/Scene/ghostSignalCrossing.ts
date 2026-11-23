import * as THREE from 'three';
import { coordinateNoise } from './environmentGeneration';
import { createRiverCrossings, sampleRiverStation, type RiverStation } from './riverLayout';

// This is a map of actual world-space reflections, not a full-screen text
// treatment. Pixels in the data represent areas of the rendered river bed.
const WIDTH = 512, HEIGHT = 384;
const TEXELS_PER_M = 16;
const GLYPHS = [
  ['.....', '.....', '.##.#', '#..#.', '.....'],
  ['.....', '#####', '.....', '#####', '.....'],
  ['.....', '.....', '.....', '.....', '####.'],
  ['.....', '..#..', '.....', '..#..', '.....'],
] as const;

export function bakeCrossingReflections(stations: RiverStation[], seed: number) {
  const bridge = createRiverCrossings(stations).find(item => item.kind === 'bridge');
  if (!bridge) return null;
  const x0 = bridge.centerX - WIDTH / TEXELS_PER_M / 2, z0 = bridge.z - HEIGHT / TEXELS_PER_M / 2;
  const mask = new Uint8Array(WIDTH * HEIGHT);
  const slotW = 8, slotH = 10;
  // Short runs, with an entire clear bank/deck buffer. Spacing and type
  // alternate in phrases rather than randomly speckling the channel.
  for (let row = 1; row < Math.floor(HEIGHT / slotH) - 1; row++) {
    if (coordinateNoise(row, 0, seed, 2180) < .25) continue;
    const rowY = row * slotH, z = z0 + (rowY + 3) / TEXELS_PER_M;
    const station = sampleRiverStation(stations, z);
    if (!station) continue;
    const direction = coordinateNoise(row, 0, seed, 2184) > .5 ? 1 : -1;
    const midX = station.centerX + direction * station.waterHalfWidth * (.04 + .48 * coordinateNoise(row, 0, seed, 2181));
    const len = 2 + Math.floor(coordinateNoise(row, 0, seed, 2183) * 4);
    const firstX = Math.round((midX - x0) * TEXELS_PER_M / slotW - len * .5) * slotW;
    for (let index = 0; index < len; index++) {
      const px = firstX + index * slotW, leftX = x0 + px / TEXELS_PER_M;
      if (px < 0 || px + 5 >= WIDTH || (leftX > bridge.centerX - bridge.width / 2 - .82 && leftX < bridge.centerX + bridge.width / 2 + .5)) continue;
      // Check both edges of the raised, seeded bank at both ends of the glyph.
      if (![rowY, rowY + 5].every(yy => {
        const s = sampleRiverStation(stations, z0 + yy / TEXELS_PER_M);
        return s && leftX > s.centerX - s.waterHalfWidth + .20 && leftX + .32 < s.centerX + s.waterHalfWidth - .20;
      })) continue;
      const choice = coordinateNoise(row, index, seed, 2185);
      const glyph = GLYPHS[choice < .42 ? 0 : choice < .70 ? 1 : choice < .88 ? 2 : 3];
      const intensity = Math.round(174 + 81 * coordinateNoise(row, index, seed, 2187));
      for (let gy = 0; gy < glyph.length; gy++)
        for (let gx = 0; gx < glyph[gy].length; gx++)
          if (glyph[gy][gx] === '#') mask[(rowY + gy) * WIDTH + px + gx] = intensity;
    }
  }
  return { mask, width: WIDTH, height: HEIGHT, x0, z0, widthM: WIDTH / TEXELS_PER_M, heightM: HEIGHT / TEXELS_PER_M };
}

export function createCrossingReflectionMap(stations: RiverStation[], seed: number) {
  const sheet = bakeCrossingReflections(stations, seed);
  if (!sheet) throw Error('Crossing reflection requires the central bridge');
  const map = new THREE.DataTexture(sheet.mask, sheet.width, sheet.height, THREE.RedFormat, THREE.UnsignedByteType);
  map.name = 'Ghost Signal | crossing-only ripple type';
  map.magFilter = THREE.NearestFilter;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return { map, bounds: new THREE.Vector4(sheet.x0, sheet.z0, 1 / sheet.widthM, 1 / sheet.heightM) };
}

export function crossingInkBounds(stations:RiverStation[]){
  const bridge=createRiverCrossings(stations).find(s=>s.kind==='bridge');
  if(!bridge)throw Error('Crossing bounds require the central bridge');
  const w=WIDTH/TEXELS_PER_M,h=HEIGHT/TEXELS_PER_M;
  return new THREE.Vector4(bridge.centerX-w*.5,bridge.z-h*.5,1/w,1/h);
}
