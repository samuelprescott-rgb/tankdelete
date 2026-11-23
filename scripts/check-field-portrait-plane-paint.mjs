// CPU witness: read actual shipping pigment through the compact mesh's UVs,
// not the authoring helper or rendered/golden screenshot.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const load=createRequire(import.meta.url);
let sharp;try {sharp=load('sharp');}catch {sharp=createRequire(process.execPath)('sharp');}
const file=p=>new URL('../'+p,import.meta.url);
const src=await readFile(file('src/components/Scene/bakedFieldPortrait.ts'),'utf8');
const charts=await readFile(file('src/components/Scene/bakedFieldPortraitUV.ts'),'utf8');
const unpack=(s,key)=>Buffer.from(s.match(new RegExp(key+'\\s*=\\s*"([^"]+)"'))[1],'base64');
const pos=unpack(src,'PORTRAIT_VERTICES'),tri=unpack(src,'PORTRAIT_TRIANGLES'),uv=unpack(charts,'PORTRAIT_UV16');
const img=await sharp(file('public/images/textures/field-portrait-wash-v1.png').pathname).removeAlpha().raw().toBuffer({resolveWithObject:true});
const {width:n,height,channels}=img.info;
assert.deepEqual([n,height,channels],[1024,1024,3]);
const face=[];
for(let j=0;j<tri.length;j+=6){
  const verts=[0,2,4].map(k=>{
    const i=tri.readUInt16LE(j+k);
    return [0,2,4].map(a=>pos.readInt16LE(12*i+a)/100)
      .concat([0,2].map(a=>uv.readUInt16LE(4*i+a)*n/65535));
  });
  if(verts.every(q=>q[3]>=n*.61))face.push(verts);
}
function pick(x,y){
  let front=Infinity,pixel=null;
  for(const [a,b,c] of face){
    const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(d)<1e-6)continue;
    const l=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d;
    const m=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d,f=1-l-m;
    if(Math.min(l,m,f)<0)continue;
    const interp=i=>(l*a[i]+m*b[i]+f*c[i]),z=interp(2);
    if(z>=front)continue;
    front=z;const k=3*(Math.floor(interp(4))*n+Math.floor(interp(3)));pixel=img.data.subarray(k,k+3);
  }
  assert.ok(pixel,'Missing exterior skin coverage at '+[x,y]);return pixel;
}
const patch=(x,y)=>{
  const light=[],beard=[];
  for(let j=-4;j<=4;j++)for(let i=-4;i<=4;i++){
    const [,g,b]=pick(x+i,y+j);light.push(g);beard.push(b);
  }
  const avg=xs=>Math.round(xs.reduce((s,e)=>s+e)/xs.length);
  return {plane:avg(light),stubble:avg(beard),bristlePeak:Math.max(...beard)};
};
const probes={};
for(const side of [-1,1]){
  const ledge=patch(side*42,123),returnPlane=patch(side*52,104),
    jaw=patch(side*47,62),temple=patch(side*54,149);
  probes[side]={ledge,returnPlane,jaw,temple};
  assert.ok(ledge.plane>returnPlane.plane+52,'Cheekbone and cheek return must separate');
  assert.equal(ledge.bristlePeak,0,'Beard must not stipple the malar ledge');
  assert.equal(temple.bristlePeak,0,'Beard must not stipple the temple');
  assert.ok(jaw.bristlePeak>70&&jaw.stubble<92,'Jaw has sparse, directional bristles rather than a dark beard mask');
}
const skin=await readFile(file('src/components/Scene/ghostInfantrySurface.ts'),'utf8');
assert.equal(skin.split('texture2D(fieldPortraitPlate,vFieldFaceUV)').length-1,1);
assert.match(skin,/if\(cornea\)\{diffuseColor.rgb=source;\}/);
console.log('Actual compact UV face probes (raw channels; 128 is a neutral plane):',JSON.stringify(probes));
