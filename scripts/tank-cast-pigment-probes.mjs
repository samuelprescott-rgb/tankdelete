import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import * as T from 'three';

// Read the real opaque baked RGB pixels, without a browser/native image
// dependency in the drive test. PNG row filters precede sRGB decoding.
function castPixels(){
  const b=readFileSync(new URL('../public/images/textures/ghost-cast-enamel-v1.png',import.meta.url));
  assert.equal(b.toString('ascii',1,4),'PNG');
  const w=b.readUInt32BE(16),h=b.readUInt32BE(20);assert.deepEqual([w,h,b[24],b[25],b[28]],[512,512,8,2,0]);
  const chunks=[];for(let o=8;o<b.length;){const n=b.readUInt32BE(o);
    if(b.toString('ascii',o+4,o+8)==='IDAT')chunks.push(b.subarray(o+8,o+8+n));o+=12+n;}
  const src=inflateSync(Buffer.concat(chunks)),out=Buffer.alloc(w*h*3);
  const paeth=(a,b,c)=>{const n=a+b-c,A=Math.abs(n-a),B=Math.abs(n-b),C=Math.abs(n-c);return A<=B&&A<=C?a:B<=C?b:c;};
  for(let y=0;y<h;y++){const start=y*(w*3+1),mode=src[start];assert.ok(mode<=4);
    for(let x=0;x<w*3;x++){const i=y*w*3+x,a=x>=3?out[i-3]:0,b=y?out[i-w*3]:0,c=y&&x>=3?out[i-w*3-3]:0;
      out[i]=src[start+1+x]+(mode===0?0:mode===1?a:mode===2?b:mode===3?(a+b)>>1:paeth(a,b,c));}}
  return out;
}
export function checkCastPigment(root,cheek,hull,jaw,cloth,fender){
  const programs=new Map(),path='/images/textures/ghost-cast-enamel-v1.png';
  const read=material=>{
    if(programs.has(material))return programs.get(material);
    const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(s);programs.set(material,s);return s;
  };
  const sig=read(cheek.material),coat=sig.uniforms.uTankCastCoat?.value;
  assert.ok(coat&&coat.image.currentSrc===path&&coat.colorSpace===T.SRGBColorSpace&&coat.wrapS===T.RepeatWrapping&&coat.wrapT===T.RepeatWrapping);
  assert.ok(coat.anisotropy>=2&&coat.minFilter===T.LinearMipmapLinearFilter);
  const owners=[];root.traverse(o=>{if(o.isMesh&&o.material?.isMeshStandardMaterial&&read(o.material).uniforms.uTankCastCoat?.value===coat)owners.push(o);});
  assert.deepEqual(owners.map(n=>n.uuid).sort(),[cheek,...hull,jaw].map(n=>n.uuid).sort(),'Only true hull, glacis, turret and fixed shark casting share the new authored base');
  const old=read(fender.material).uniforms.uTankPlateStudy.value;
  assert.ok(old!==coat&&old.colorSpace===T.NoColorSpace&&old.image.currentSrc.endsWith('/tank-armor-v1.png'));
  assert.ok(!read(cloth.material).uniforms.uTankCastCoat);
  for(const [m,sites] of [[cheek,5],[hull[0],2],[jaw,2],[fender,3]]){
    const s=read(m.material),text=s.fragmentShader;
    assert.equal((text.match(/texture2D\(|textureGrad\(/g)||[]).length,sites,'Do not exceed the actual R11 fetch count');
    if(m===fender)continue;
    assert.equal((text.match(/texture2D\(uTankCastCoat,/g)||[]).length,1);
    assert.ok(!s.uniforms.uTankPlateStudy&&text.includes('fold*.64')&&!text.includes('value * .48,.91,1.10'));
    assert.ok(text.indexOf('castEnamelGround(')<text.indexOf('#include <lights_physical_fragment>'));
  }
  const jawProgram=read(jaw.material).fragmentShader;
  assert.ok(jawProgram.includes('mix(coat,drawnCoat,olive)')&&jawProgram.includes('*(1.-red)'),'Grin, iris and tooth enamel are not replaced');
  assert.ok(sig.fragmentShader.indexOf('= castEnamelGround')<sig.fragmentShader.indexOf('texture2D(uTankUnitStamp'),'23 must lie over the base coat');
  const rgb=castPixels(),luma=[],ranges=[];
  const lin=b=>T.ColorManagement.colorSpaceToWorking(new T.Color(b/255,b/255,b/255),T.SRGBColorSpace).r;
  const lut=Array.from({length:256},(_,i)=>lin(i));
  for(let i=0;i<rgb.length;i+=3)luma.push(.24*lut[rgb[i]]+.60*lut[rgb[i+1]]+.16*lut[rgb[i+2]]);
  luma.sort((a,b)=>a-b);const qs=[.01,.10,.50,.90,.99].map(q=>luma[Math.floor(q*luma.length)]);
  assert.ok(qs[0]>.030&&qs[4]<.23&&qs[2]>.078&&qs[2]<.130,'Actual painted tile should remain brushed olive, not soot or bright sand');
  // Tinted by typical R11 top vertex paint, then by a full opaque crown
  // chart. Read the real fit coefficients from the bound standard program.
  const f=sig.fragmentShader,blend=Number(f.match(/mix\(under,enamel,([.\d]+)\)/)?.[1]),
    width=f.match(/\*\(([.\d]+)\+([.\d]+)\*smoothstep\(([.\d]+),([.\d]+),value\)\)/),ink=Number(f.match(/cover\*mix\(([.\d]+),[.\d]+,oxideInk\)/)?.[1]);
  assert.ok(width&&blend>.72&&ink<.5);
  for(const y of [qs[1],qs[3]]){
    const under=.181,shade=.55+under*2.55;
    const dyed=y*shade*(Number(width[1])+Number(width[2])*T.MathUtils.smoothstep(y,Number(width[3]),Number(width[4])));
    const underInk=T.MathUtils.lerp(under,dyed,blend);ranges.push(T.MathUtils.lerp(underInk,under,.97*ink));
  }
  assert.ok(ranges[1]/ranges[0]>1.24,'10th/90th baked pigments must survive even beneath a broad roof chart');
  console.log('Cast albedo (linear Y P01/P10/P50/P90/P99):',qs.map(x=>+x.toFixed(4)),'; beneath full chart P10/P90:',ranges.map(x=>+x.toFixed(4)));
}
