import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(await readFile(new URL('../src/components/Scene/surfaceCipher.ts',import.meta.url),'utf8'))
  .replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {bakeSurfaceCipher,CIPHER_CELL:c,CIPHER_GRID:n,WATER_CELLS_PER_METRE:w,PRIOR_WATER_CELLS_PER_METRE:b,surfaceCipherAtlas}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const tex=bakeSurfaceCipher(),stride=n*c,mask=new Uint8Array(n*n);
assert.equal(tex.length,stride**2);
for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  for(let j=0;j<c;j++)for(let i=0;i<c;i++)if(tex[(y*c+j)*stride+x*c+i]>32)mask[y*n+x]=1;
}
let busiest=0;
for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  let hits=0;for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++)hits+=mask[((y+dy)%n)*n+(x+dx)%n];
  busiest=Math.max(busiest,hits);
}
const localGlyphs=w[0]*w[1]*busiest/64,priorMax=b[0]*b[1],quiet=1-mask.reduce((a,b)=>a+b)/mask.length;
assert(localGlyphs/priorMax>=10,'active ink patch exceeds previous full grid by at least ten');
assert(quiet>.35 && quiet<.88,'patches separated by quiet intact material');
assert(surfaceCipherAtlas()===surfaceCipherAtlas() && surfaceCipherAtlas().generateMipmaps);
console.log(JSON.stringify({busiest8x8:busiest,localGlyphsPerM2:localGlyphs,priorPossibleSlotsPerM2:priorMax,densityRatio:localGlyphs/priorMax,quietFraction:quiet}));
