import * as THREE from 'three';

// Authored 5×7 punctuation and alphanumeric register. The atlas contains the marks AND their irregular
// island boundaries; filtering them together keeps oblique/distant surfaces quiet.
const strokes = [
  [0,0,4,0,0,4,0], [0,0,4,0,0,4,8], [0,4,4,31,4,4,0],
  [0,10,31,10,31,10,0], [1,2,2,4,8,8,16], [4,4,4,4,4,4,4],
  [0,0,31,0,31,0,0], [0,0,0,9,22,0,0], [14,17,19,21,25,17,14],
  [4,12,4,4,4,4,14], [6,4,4,4,4,4,6], [0,0,0,0,0,0,4],
  [0,0,0,14,0,0,0], [16,8,8,4,2,2,1], [0,0,0,0,0,0,31],
];
const digits=[
  [14,17,19,21,25,17,14],[4,12,4,4,4,4,14],[14,17,1,2,4,8,31],[30,1,1,14,1,1,30],
  [2,6,10,18,31,2,2],[31,16,16,30,1,1,30],[6,8,16,30,17,17,14],[31,1,2,4,8,8,8],
  [14,17,17,14,17,17,14],[14,17,17,15,1,2,12],[14,17,17,31,17,17,17],[30,17,17,30,17,17,30],
  [15,16,16,16,16,16,15],[28,18,17,17,17,18,28],[31,16,16,30,16,16,31],[31,16,16,30,16,16,16]
];
export const CIPHER_GRID = 64, CIPHER_CELL = 8;
export const WATER_CELLS_PER_METRE = [44,32] as const;
export const PRIOR_WATER_CELLS_PER_METRE = [4.15,3.7] as const;
const tau = 2 * Math.PI;
function hash(x:number,y:number){
  let v = Math.imul(x + 73, 0x6a09e667) ^ Math.imul(y + 419, 0x27d4eb2d);
  v = Math.imul(v ^ (v >>> 16), 0x85ebca6b);
  return ((v ^ (v >>> 13)) >>> 0) / 4294967296;
}
export function bakeSurfaceCipher(layered=false){
  const size=CIPHER_GRID*CIPHER_CELL, bytes=new Uint8Array(size*size*(layered?2:1));
  for(let y=0;y<CIPHER_GRID;y++)for(let x=0;x<CIPHER_GRID;x++){
    const u=(x+.5)/CIPHER_GRID*tau,v=(y+.5)/CIPHER_GRID*tau;
    const island=.45*Math.sin(2*u+Math.sin(3*v))+.32*Math.cos(2*v-u+.8)
      +.16*Math.sin(4*u+3*v)+.12*Math.cos(5*v-3*u);
    const mask=Math.min(1,Math.max(0,(island-.13)*3.8));
    if(!mask)continue;
    const block=hash(x+813,y), roll=hash(x,y);
    if(layered)for(let j=0;j<8;j++)for(let i=0;i<8;i++)bytes[2*((y*8+j)*size+x*8+i)+1]=Math.round(255*mask);
    if(block<.04)continue;
    // Digit-dominant columns with occasional punctuation: resolve numbers,
    // not a scatter of single-pixel dots. Stable per-surface variation.
    const symbolic=roll>.87;
    const chars=symbolic?strokes:digits;
    const glyph=chars[Math.floor(hash(x+521,y+15)*chars.length)];
    const pigment=Math.round(255*mask*(.68+.32*hash(x+233,y)));
    for(let row=0;row<7;row++)for(let col=0;col<5;col++)
      if(glyph[row] & (16>>col))bytes[((y*8+6-row)*size+x*8+1+col)*(layered?2:1)]=pigment;
  }
  return bytes;
}
let sheet:THREE.DataTexture|undefined;
export function surfaceCipherAtlas(){
  if(sheet)return sheet;
  const size=CIPHER_GRID*CIPHER_CELL;
  sheet=new THREE.DataTexture(bakeSurfaceCipher(true),size,size,THREE.RGFormat);
  sheet.name='Ghost Signal | shared material-grain cipher';
  sheet.wrapS=sheet.wrapT=THREE.RepeatWrapping;
  sheet.generateMipmaps=true;sheet.minFilter=THREE.LinearMipmapLinearFilter;
  sheet.magFilter=THREE.LinearFilter;sheet.anisotropy=4;sheet.needsUpdate=true;
  return sheet;
}
export const cipherGLSL = `
uniform sampler2D surfaceCipherMap;
vec2 cipherField(vec2 cells) {
  vec2 dcx=dFdx(cells),dcy=dFdy(cells);
  float footprint2=max(dot(dcx,dcx),dot(dcy,dcy));
  // Both ink lobes are identically zero outside this support. Avoid even
  // the anisotropic read on distant trunks, cloth and grazing-angle water.
  if(footprint2>=2.35*2.35)return vec2(0.);
  float footprint=sqrt(footprint2);
  // Mip-filter first, then lose the entire ink pass below readable size.
  // Never leave a bright checkerboard or the average gray of distant glyphs.
  vec2 micro=vec2(0.);
  if(footprint<.76)micro=textureGrad(surfaceCipherMap,cells/64.,dcx/64.,dcy/64.).rg*(1.-smoothstep(.19,.76,footprint));
  // A few legible registers sit INSIDE the dense type islands. The earlier
  // micro-only texture vanished into an average at ordinary player distance.
  // Both scales follow the material, share its pigment and mip out long
  // before the skyline. No changing seed, neon emission or screen mask.
  if(footprint>.075 && footprint<2.35){
    vec2 coarser=cells*.235+vec2(13.7,5.3);
    vec2 imprint=textureGrad(surfaceCipherMap,coarser/64.,dcx*(.235/64.),dcy*(.235/64.)).rg;
    float run=smoothstep(.16,.72,sin(coarser.y*.79+sin(coarser.x*.31))+
      .42*cos(coarser.x*.74-coarser.y*.32));
    float readable=smoothstep(.075,.24,footprint)*(1.-smoothstep(.82,2.35,footprint))*run;
    micro.r=max(micro.r,imprint.r*readable*.91);
    micro.g=max(micro.g,imprint.g*readable*.76);
  }
  return micro;
}
float cipherPigment(vec2 cells){return cipherField(cells).r;}`;

// Different bags and trees get different stable slices, without another
// instance buffer or a screen-space effect. Coordinates stay attached to
// the mesh and respect the nonuniform physical scale of instances.
export const cipherVertex = `
vec3 cs=vec3(1.); vec2 co=modelMatrix[3].xz;
#ifdef USE_INSTANCING
  cs=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
  co+=instanceMatrix[3].xz;
#endif
vCipherLocal=position*cs;
vCipherPhase=fract(co*vec2(.139,.213)+co.yx*vec2(.173,.047))*64.;`;
export const cipherVaryings='varying vec3 vCipherLocal; varying vec2 vCipherPhase;\n';
