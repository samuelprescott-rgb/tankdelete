import * as T from 'three';

// One zero per repeat, with a blank row and column around the strokes.
// Mips average the painted coverage of a digit when it projects below a pixel.
export function createZeroTile() {
  const rows=['00111000','01000100','01001100','01010100','01100100','01000100','00111000','00000000'];
  const bytes=Uint8Array.from(rows.reverse().join(''),p=>p==='1'?255:0);
  const tile=new T.DataTexture(bytes,8,8,T.RedFormat);
  tile.wrapS=tile.wrapT=T.RepeatWrapping;
  tile.magFilter=T.NearestFilter;
  tile.minFilter=T.LinearMipmapLinearFilter;
  tile.generateMipmaps=true;
  tile.needsUpdate=true;
  return tile;
}

// Coordinates and derivatives are supplied by the receiver. Keeping the
// trail envelope larger than its constituent zeros lets the motion read at range.
export const runningZerosGLSL = /* glsl */ `
float zeroCoverage(sampler2D tile, vec2 glyph, vec2 dx, vec2 dy, vec2 offset) {
  float digit=textureGrad(tile,glyph+vec2(0.,offset.x),dx,dy).r;
  float packetInk=textureGrad(tile,glyph/24.+vec2(0.,offset.y),dx/24.,dy/24.).r;
  float grouping=smoothstep(.05,.60,max(length(dx),length(dy)));
  return digit*mix(1.,.09+2.8*packetInk,grouping);
}
vec2 runningZeros(sampler2D tile, vec2 glyph, vec2 dx, vec2 dy, vec2 streams, float time) {
  float column=floor(streams.x);
  float seed=fract(sin(mod(column,271.)*53.71+1.4)*1597.31);
  float tick=floor(time*12.)/12.;
  float scroll=tick*(.52+.54*seed);
  float behind=fract(streams.y+scroll+seed*11.);
  float tail=(1.-smoothstep(.035,.64,behind));
  float head=1.-smoothstep(.015,.11,behind);
  float glow=(.045+.57*tail*tail+.38*head)*(.42+.58*seed);

  return vec2(zeroCoverage(tile,glyph,dx,dy,floor(scroll*vec2(56.,32.))/8.),glow);
}`;
