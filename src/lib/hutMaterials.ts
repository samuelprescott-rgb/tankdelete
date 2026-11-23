import * as THREE from 'three';

export type HutSurface = 'thatch' | 'bamboo' | 'timber' | 'earth' | 'metal';
export const VILLAGE_MATERIAL_ATLAS = '/images/textures/ghost-hut-materials-v2.png';

/** All structures share Fiber's one cached image, even if the radio hut
 * mounts before the village. Reusing it must not trigger another upload. */
export function configureVillageAtlas(t: THREE.Texture) {
  if (t.colorSpace !== THREE.SRGBColorSpace || t.magFilter !== THREE.NearestFilter ||
      t.minFilter !== THREE.LinearMipmapLinearFilter || t.anisotropy !== 4) {
    t.colorSpace=THREE.SRGBColorSpace; t.magFilter=THREE.NearestFilter;
    t.minFilter=THREE.LinearMipmapLinearFilter; t.anisotropy=4; t.needsUpdate=true;
  }
  return t;
}

const ATLAS_WIDTH = 768;
const ATLAS_HEIGHT = 512;
const TILE_SIZE = 256;
const TILE_PADDING = 8;
const SURFACE_TILES: Record<HutSurface, [number, number]> = {
  thatch: [0, 0],
  bamboo: [1, 0],
  timber: [0, 1],
  earth: [1, 1],
  metal: [2, 0],
};

export function villageSurfaceUV(surface:HutSurface,u:number,v:number):[number,number] {
  const [tx,ty]=SURFACE_TILES[surface], span=TILE_SIZE-2*TILE_PADDING;
  return [(tx*TILE_SIZE+TILE_PADDING+THREE.MathUtils.clamp(u,0,1)*span)/ATLAS_WIDTH,
          ((1-ty)*TILE_SIZE+TILE_PADDING+THREE.MathUtils.clamp(v,0,1)*span)/ATLAS_HEIGHT];
}

// Each construction material occupies one padded tile. All huts can therefore
// retain one material/instanced draw per category, including their roof details.
export function applyHutSurfaceUV(geometry: THREE.BufferGeometry, surface: HutSurface) {
  const uv = geometry.getAttribute('uv');
  const [tileX, tileY] = SURFACE_TILES[surface];
  const usableX = (TILE_SIZE - TILE_PADDING * 2) / ATLAS_WIDTH;
  const usableY = (TILE_SIZE - TILE_PADDING * 2) / ATLAS_HEIGHT;
  const x = (tileX * TILE_SIZE + TILE_PADDING) / ATLAS_WIDTH;
  const y = ((1 - tileY) * TILE_SIZE + TILE_PADDING) / ATLAS_HEIGHT;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, x + uv.getX(index) * usableX, y + uv.getY(index) * usableY);
  }
  return geometry;
}

/** Split bamboo sits between timber and thatch: broad straw-colored facets,
 * muted knots and only enough edge contrast to describe the crossing. */
function paintBambooTile(context: CanvasRenderingContext2D) {
  const ribbonCount = 16;
  const columns = Array.from({ length: ribbonCount + 1 }, (_, i) =>
    i * TILE_SIZE / ribbonCount + (i % ribbonCount ? Math.sin(i * 1.83) * 1.65 : 0));
  const rows = Array.from({ length: ribbonCount + 1 }, (_, i) =>
    i * TILE_SIZE / ribbonCount + (i % ribbonCount ? Math.sin(i * 2.47) * 1.25 : 0));
  const pigment = (tone: number, warmth: number, alpha = 1) =>
    `rgba(${Math.round(tone + warmth)},${Math.round(tone)},${Math.round(tone - warmth * 1.85)},${alpha})`;

  // Each ribbon is painted along the fibre. The soft interior shifts are much
  // broader than the contact edge so the weave holds up when mipmapped.
  const ribbon = (length: number, breadth: number, tone: number, warmth: number, bend: number) => {
    const facet = context.createLinearGradient(0, 0, 0, breadth);
    facet.addColorStop(0, pigment(tone - 15, warmth));
    facet.addColorStop(0.15, pigment(tone + 11, warmth + 2));
    facet.addColorStop(0.42 + bend * 0.055, pigment(tone + 5, warmth));
    facet.addColorStop(0.78, pigment(tone - 2, warmth));
    facet.addColorStop(1, pigment(tone - 19, warmth));
    context.fillStyle = facet;
    context.beginPath();
    context.moveTo(-0.55, 0.65 + bend * 0.26);
    context.bezierCurveTo(length * 0.35, bend, length * 0.70, -bend * 0.55, length + 0.55, 0.55 - bend * 0.19);
    context.lineTo(length + 0.55, breadth - 0.38);
    context.bezierCurveTo(length * 0.68, breadth - 0.1 + bend, length * 0.28,
      breadth - 0.63 - bend * 0.5, -0.55, breadth - 0.23);
    context.closePath();
    context.fill();

    // Broken flat brush marks follow the long fibres. Varying the toe and
    // belly of each stroke avoids a mechanically rubbed edge on every strip.
    const marks = Math.max(1, Math.round(length / 51));
    for (let mark = 0; mark < marks; mark++) {
      const wave = Math.sin(bend * 3.1 + mark * 3.7);
      const from = (mark + 0.10 + wave * 0.09) / marks * length;
      const run = (0.69 + wave * 0.13) / marks * length;
      const height = breadth * (0.37 + wave * 0.12);
      const body = breadth * (0.23 + wave * 0.05);
      context.fillStyle = mark % 3 === 2 || (marks === 1 && wave < -0.56)
        ? 'rgba(108,112,85,0.20)' : pigment(tone + 25, warmth + 3, 0.43);
      context.beginPath();
      context.moveTo(from, height + body * 0.33);
      context.lineTo(from + run * 0.26, height);
      context.quadraticCurveTo(from + run * 0.62, height - body * 0.30, from + run, height + body * 0.16);
      context.lineTo(from + run * 0.49, height + body);
      context.lineTo(from + run * 0.22, height + body * 0.72);
      context.closePath();
      context.fill();
    }
  };

  context.fillStyle = '#9a917a';
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  for (let column = 0; column < ribbonCount; column++) {
    const x = columns[column];
    const breadth = columns[column + 1] - x;
    // Smaller color changes bind adjacent strips into dry or olive groups.
    const tone = 194 + 7 * Math.sin(column * 0.78) + 5 * Math.cos(column * 2.37);
    context.save();
    context.translate(x + breadth, 0);
    context.rotate(Math.PI / 2);
    ribbon(TILE_SIZE, breadth, tone, 6 + 5 * Math.cos(column * 0.81), Math.sin(column * 1.75) * 1.8);
    context.restore();
  }

  // Offset two over / two under on successive rows. Drawing only the upward
  // runs lets the original longer upright blades read beneath the crossbars.
  for (let row = 0; row < ribbonCount; row++) {
    const y = rows[row];
    const breadth = rows[row + 1] - y;
    for (let column = (row % 4) - 4; column < ribbonCount; column += 4) {
      const first = Math.max(0, column);
      const last = Math.min(ribbonCount, column + 2);
      if (first >= last) continue;
      const x = columns[first];
      const length = columns[last] - x;
      const tone = 202 + 7 * Math.sin(row * 0.68 + column * 0.29)
        + 5 * Math.cos(row * 0.45 - column * 0.62);
      const warmth = 10 + 6 * Math.sin(row * 0.31 - column * 0.51);
      context.save();
      context.translate(x, y);
      context.fillStyle = 'rgba(74,65,49,0.17)';
      context.fillRect(0.1, breadth - 0.85, length - 0.2, 2.0);
      ribbon(length, breadth, tone, warmth, Math.sin(row * 1.71 + column * 1.37) * 2.15);
      context.restore();
    }
  }

  // Keep a coherent value shape at hut distance: damp bottom, shaded
  // top under the eave, and a dry sunny middle. The shared bump reads the
  // same low-contrast strokes rather than dark seams traced around every piece.
  const wash = context.createLinearGradient(0, 0, TILE_SIZE * 0.14, TILE_SIZE);
  wash.addColorStop(0, 'rgba(67,76,63,0.28)');
  wash.addColorStop(0.20, 'rgba(255,235,194,0.13)');
  wash.addColorStop(0.62, 'rgba(245,231,189,0.04)');
  wash.addColorStop(1, 'rgba(56,73,64,0.28)');
  context.fillStyle = wash;
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
}

export function createHutSurfaceAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const context = canvas.getContext('2d')!;
  let seed = 1968;
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  const gray = (value: number, alpha = 1) => `rgba(${value},${value},${value},${alpha})`;

  for (const surface of Object.keys(SURFACE_TILES) as HutSurface[]) {
    const [tileX, tileY] = SURFACE_TILES[surface];
    context.save();
    context.translate(tileX * TILE_SIZE, tileY * TILE_SIZE);
    context.beginPath();
    context.rect(0, 0, TILE_SIZE, TILE_SIZE);
    context.clip();

    if (surface === 'bamboo') {
      paintBambooTile(context);
      // Reserve the previous tile's draws on the shared PRNG (grid shading,
      // stains, scumbled dabs) so later tiles retain their original paint.
      const legacyGrid = Math.ceil(TILE_SIZE / 9);
      const legacyBambooDraws = legacyGrid ** 2 + 22 * 3 + 56 * 6;
      for (let draw = 0; draw < legacyBambooDraws; draw++) random();
      context.restore();
      continue;
    }
    context.fillStyle = gray(surface === 'earth' ? 191 : 224);
    context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    if (surface === 'thatch') {
      // The broad stroke grouping follows the thatch slope, with distinct
      // dry faces and folded tips; fiber grain is a quieter secondary layer.
      for (let bundle = 0; bundle < 13; bundle++) {
        const x = bundle * 20 + random() * 4;
        const width = 13 + random() * 15;
        const bend = random() * 11 - 5;
        context.fillStyle = bundle % 4 === 2 ? 'rgba(132,129,104,0.26)' : 'rgba(255,241,202,0.29)';
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + width, 0);
        context.bezierCurveTo(x + width - 5, 85, x + width + bend, 156, x + width + bend * 2, TILE_SIZE);
        context.lineTo(x + bend * 2, TILE_SIZE);
        context.bezierCurveTo(x + bend, 153, x - 3, 80, x, 0);
        context.fill();
      }
      for (let straw = 0; straw < 170; straw += 1) {
        const x = random() * TILE_SIZE;
        const y = random() * TILE_SIZE;
        context.strokeStyle = gray(139 + Math.floor(random() * 106), 0.36);
        context.lineWidth = .7 + random() * 1.6;
        context.beginPath();
        context.moveTo(x, y);
        context.quadraticCurveTo(x + random() * 5 - 2.5, y + 24, x + random() * 6 - 3, y + 35 + random() * 90);
        context.stroke();
      }
    } else if (surface === 'metal') {
      for (let rib = 0; rib < 24; rib++) {
        const x = rib * 11;
        const ridge = context.createLinearGradient(x, 0, x + 11, 0);
        ridge.addColorStop(0, gray(125)); ridge.addColorStop(0.45, gray(221));
        ridge.addColorStop(1, gray(145)); context.fillStyle = ridge;
        context.fillRect(x, 0, 11, TILE_SIZE);
      }
      for (let rust = 0; rust < 90; rust++) {
        const x = random() * TILE_SIZE, y = random() * TILE_SIZE;
        const stain = context.createRadialGradient(x, y, 0, x, y, 2 + random() * 15);
        stain.addColorStop(0, 'rgba(105,61,36,0.65)'); stain.addColorStop(1, 'rgba(105,61,36,0)');
        context.fillStyle = stain; context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      }
      for (const y of [22, 225]) for (let x = 9; x < TILE_SIZE; x += 33) {
        context.fillStyle = gray(77); context.fillRect(x, y, 2, 2);
      }
    } else if (surface === 'timber') {
      for (let grain = 0; grain < 104; grain += 1) {
        const x = random() * TILE_SIZE;
        context.strokeStyle = gray(90 + Math.floor(random() * 160), 0.4);
        context.lineWidth = 0.85 + random() * 2.3;
        context.beginPath();
        context.moveTo(x, 0);
        context.bezierCurveTo(x - 10, 80, x + 9, 165, x + random() * 8 - 4, TILE_SIZE);
        context.stroke();
      }
      for (let knot = 0; knot < 6; knot += 1) {
        context.strokeStyle = gray(105, 0.35);
        context.beginPath();
        context.ellipse(random() * TILE_SIZE, random() * TILE_SIZE, 2 + random() * 4, 8 + random() * 10, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }

    // Broad, tapered strokes remain visible at the chase camera's hut scale.
    // They sit above the fine construction detail like scumbled dry paint.
    for (let dab = 0; dab < (surface === 'thatch' ? 22 : 56); dab += 1) {
      const x = random() * TILE_SIZE, y = random() * TILE_SIZE;
      const width = 2 + random() * 9, length = 11 + random() * 45;
      context.save();
      context.translate(x, y);
      context.rotate((surface === 'earth' ? 0.9 : 0) + (random() - 0.5) * 0.31);
      context.fillStyle = random() > 0.43 ? 'rgba(255,237,193,0.18)' : 'rgba(102,113,82,0.20)';
      context.beginPath();
      context.moveTo(0, -length * 0.48);
      context.lineTo(width * 0.5, -length * 0.22);
      context.lineTo(width * 0.36, length * 0.31);
      context.lineTo(-width * 0.15, length * 0.52);
      context.lineTo(-width * 0.39, length * 0.19);
      context.lineTo(-width * 0.55, -length * 0.29);
      context.fill();
      context.restore();
    }
    // Warm paint on catching edges and cool shadows under the eaves are baked.
    const weather = context.createLinearGradient(0, 0, 0, TILE_SIZE);
    weather.addColorStop(0, surface === 'thatch' ? 'rgba(255,236,180,0.45)' : 'rgba(44,51,42,0.30)');
    weather.addColorStop(0.17, 'rgba(255,233,184,0.16)');
    weather.addColorStop(0.65, 'rgba(127,122,91,0.03)');
    weather.addColorStop(1, 'rgba(34,48,42,0.31)');
    context.fillStyle = weather;
    context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    context.restore();
  }

  const colorMap = new THREE.CanvasTexture(canvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(canvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.anisotropy = 4;
  return { colorMap, bumpMap };
}
