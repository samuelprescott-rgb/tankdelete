import * as THREE from 'three';

// Twelve coarse, slightly uneven yarns each way. An over-pick hides the
// under-pick; gaps are dark instead of belonging to a flat checker pattern.
// Tileable pigment/relief swatch; baked once, never generated per bag/frame.
let cached:THREE.DataTexture|undefined;
export function sackWeave(){
  if(cached)return cached;
  const n=192, cloth=new Uint8Array(n*n*4),tau=2*Math.PI;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=(x+.5)/n,v=(y+.5)/n;
    const a=u*12+.13*Math.sin(tau*(2*v+u))+.065*Math.cos(tau*3*v);
    const b=v*12+.11*Math.sin(tau*(u-v))+.08*Math.cos(tau*3*u);
    const i=Math.floor(a),j=Math.floor(b);
    const warp=.5-.5*Math.cos(tau*a),weft=.5-.5*Math.cos(tau*b);
    const vertical=((i+j)&1)===0,top=vertical?warp:weft,under=vertical?weft:warp;
    const rim=vertical?Math.sin(tau*(a+.04)):Math.sin(tau*(b+.02));
    const slub=.12*Math.sin(tau*(vertical?u+2*v:2*u-v))+.055*Math.cos(tau*(6*u+5*v));
    const strand=Math.max(top,under*.63);
    const dye=.15+.66*strand+.13*rim*Math.min(1,top*3)+slub;
    const k=4*(y*n+x),byte=(v:number)=>Math.round(Math.max(0,Math.min(1,v))*255);
    cloth[k]=byte(dye);cloth[k+1]=byte(strand);cloth[k+2]=byte(.5+slub*2.4);cloth[k+3]=255;
  }
  cached=new THREE.DataTexture(cloth,n,n,THREE.RGBAFormat);
  cached.name='Ghost Signal | warp and weft of field sacking';
  cached.wrapS=cached.wrapT=THREE.RepeatWrapping;cached.generateMipmaps=true;
  cached.magFilter=THREE.LinearFilter;cached.minFilter=THREE.LinearMipmapLinearFilter;
  cached.anisotropy=4;cached.needsUpdate=true;return cached;
}
