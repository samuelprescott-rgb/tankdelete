// CPU replay of the installed surface atlas and the two water-only GLSL
// coordinate statements. This measures registration, not rendered framerate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/components/Scene/wetlandGeometry.ts',import.meta.url),'utf8');
const atlasSource=await readFile(new URL('../src/components/Scene/surfaceCipher.ts',import.meta.url),'utf8');
const js=ts.transpileModule(atlasSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
  .replace(/from ['"]three['"]/g,'from '+JSON.stringify(import.meta.resolve('three')));
const {bakeSurfaceCipher,WATER_CELLS_PER_METRE:[w,h],CIPHER_GRID:n,CIPHER_CELL:c}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const bytes=bakeSurfaceCipher(true),sz=n*c;
const lines=source.match(/typeUV\.x\+=([^;]+);\s*typeUV\.y\+=([^;]+);/);
assert(lines);const make=new Function('p','typeUV','wetlandTime','sin','typeUV.x+='+lines[1]+';typeUV.y+='+lines[2]+';return typeUV');
const current=(x,z,t=0)=>make({x,y:z},{x:x*w,y:z*h},t,Math.sin);
const old=(x,z,t=0)=>({x:x*w+.38*Math.sin(z*3.3+t*.51),y:z*h+.51*Math.sin(x*4.7+z*.82+t*.48)});
const mod=(a,m)=>(a%m+m)%m;
function tex(q,channel){return bytes[2*(mod(Math.floor(q.y*c),sz)*sz+mod(Math.floor(q.x*c),sz))+channel];}
function compare(fn,dx,dz,channel){
  let a=0,b=0,aa=0,bb=0,ab=0,N=0;
  // Multiple strips across the bridge/river positions, fine grid offset
  // irrationally so it never locks to one digit's rows or gutter columns.
  for(let j=0;j<167;j++)for(let i=0;i<149;i++){
    const x=-23+i*.09931,z=3+j*.09173,t=4.2;
    const u=tex(fn(x,z,t),channel),v=tex(fn(x+dx,z+dz,t),channel);
    N++;a+=u;b+=v;aa+=u*u;bb+=v*v;ab+=u*v;
  }
  return (N*ab-a*b)/Math.sqrt((N*aa-a*a)*(N*bb-b*b));
}
const registered=[];
for(const [dx,dz] of [[n/w,0],[0,n/h]])for(const channel of [1,0]){
  const before=compare(old,dx,dz,channel),after=compare(current,dx,dz,channel);
  if(channel===1)assert(before>.95&&after<.65,`Atlas island correlation: ${before} -> ${after}`);
  else assert(after<before-.13,`Actual printed glyph intensity correlation: ${before} -> ${after}`);
  registered.push({shift:[dx,dz],channel:channel?'island':'digit',before:+before.toFixed(3),after:+after.toFixed(3)});
}
let minArea=Infinity,maxArea=0,maxStretch=0,furthestRipple=0;
for(let i=0;i<4000;i++){
  const x=-29+mod(i*3.013,33),z=1+mod(i*5.143,25),t=i*.007,e=1e-5;
  const q=current(x,z,t),qx=current(x+e/w,z,t),qz=current(x,z+e/h,t);
  const a=(qx.x-q.x)/e,b=(qz.x-q.x)/e,c0=(qx.y-q.y)/e,d=(qz.y-q.y)/e,D=a*d-b*c0;
  minArea=Math.min(minArea,D);maxArea=Math.max(maxArea,D);
  const tr=a*a+b*b+c0*c0+d*d;maxStretch=Math.max(maxStretch,Math.sqrt((tr+Math.sqrt(Math.max(0,tr*tr-4*D*D)))/2));
  const p=current(x,z,0);furthestRipple=Math.max(furthestRipple,Math.hypot(q.x-p.x,q.y-p.y));
}
assert(minArea>.99999&&maxArea<1.00001&&maxStretch<1.75&&furthestRipple<1.70,'Legible area-preserving local coordinates and anchored flow');
assert(!lines[0].includes('texture'));assert(source.includes('vec2 glyph=cipherField(typeUV)'));
console.log(JSON.stringify({registered,minArea,maxArea,maxStretch,furthestRippleCells:furthestRipple,actualCellsPerM2:w*h}));
