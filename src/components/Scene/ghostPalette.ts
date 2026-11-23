import { Data3DTexture, RGBAFormat, UnsignedByteType } from 'three';

// Display-space inks, ordered in small material ramps: night concrete, river,
// vegetation, canvas/steel, timber, fire and the tank's shark-mouth paint.
const INKS = [
  0x0b1119,0x151e2b,0x232d43,0x34425d,0x52647b,0x78899a,0xa6b6bf,0xd4dcd4,
  0x102629,0x1b4445,0x326969,0x5a9284,0x91b7a3,0xc5d6b4,
  // Far walls of humid air and clear openings in the storm. Without a
  // sky ramp the LUT mapped high-altitude blue into khaki canvas or steel.
  0x44697b,0x608b9a,0x81abb8,0xa3c8cf,0xc5dedd,0xe2e9db,
  0x142b23,0x254533,0x406044,0x617d49,0x89a050,0xb7bd70,0xd8d898,
  0x242a25,0x3c4335,0x575b45,0x76795b,0x93977c,0xb9b89c,
  0x312821,0x514035,0x74563c,0x977452,0xb89569,0xd8ba89,0xf2deb2,
  0x542b31,0x884239,0xb65d43,0xcb824f,0xe6af64,0xf6cd88,0xf6f1d8,
] as const;

/** One 128 KiB color cube (32³ RGBA cells), not a full-screen glyph overlay.
 * Baked once per mounted renderer. Keep some source color for skin and painted markings. */
export function createGhostPalette(sunset=false) {
  const size = 32, bytes = new Uint8Array(size ** 3 * 4);
  // A dedicated river ramp keeps the charcoal cloud undersides, peach smoke
  // and pale sunbeams distinct in the palette resolve. The monsoon keeps
  // its original inks exactly; do not regrade the whole game at night.
  const colors = [...INKS,...(sunset?[0x293c43,0x445357,0x586266,0x6a706c,0x7a756d,
    0x74665f,0x8d7568,0xa7816e,0xb98f74,0xd8a47b,0xeeb78b,0xf5ceb0,
    0xfce0b7,0xffecd0,0x71877f,0x8d9e91,0xa8af9a,0xbcbba3]:[])].map(n => [n >> 16, (n >> 8) & 255, n & 255]);
  let i = 0;
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const R = 255*r/(size-1), G = 255*g/(size-1), B = 255*b/(size-1);
    let best = colors[0], score = Infinity;
    for (const color of colors) {
      const dr = color[0]-R, dg = color[1]-G, db = color[2]-B;
      const distance = .30*dr*dr + .52*dg*dg + .18*db*db;
      if (distance < score) { best = color; score = distance; }
    }
    bytes[i++] = Math.round(.89*best[0]+.11*R); bytes[i++] = Math.round(.89*best[1]+.11*G);
    bytes[i++] = Math.round(.89*best[2]+.11*B); bytes[i++] = 255;
  }
  const texture = new Data3DTexture(bytes,size,size,size);
  texture.name = 'ghost-signal-material-inks'; texture.format = RGBAFormat;
  texture.type = UnsignedByteType; texture.needsUpdate = true;
  return texture;
}
