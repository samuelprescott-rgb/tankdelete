import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// US colors in use in 1975: 13 alternating stripes and nine staggered
// rows (6/5) of five-point stars. Albedo only; rain and scene lamps do the rest.
export function createEmbassyColors(){
  const w=384,h=208,pixels=new Uint8Array(w*h*4),ox=-4.48,oz=-20.68,tip=8.33,
    stars:[number,number][]=[];
  for(let row=0;row<9;row++)for(let col=0;col<(row%2?5:6);col++)
    stars.push([(.4/12)*(1+col*2+row%2),(7/13/10)*(row+1)]);
  const star=(x:number,y:number)=>{
    const r=.0145,r2=r*.382;
    let inside=false;
    for(let i=0,j=9;i<10;j=i++){
      const a=i*Math.PI/5-Math.PI/2,b=j*Math.PI/5-Math.PI/2;
      const xi=Math.cos(a)*(i%2?r2:r),yi=Math.sin(a)*(i%2?r2:r);
      const xj=Math.cos(b)*(j%2?r2:r),yj=Math.sin(b)*(j%2?r2:r);
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
    }return inside;
  };
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const u=(i+.5)/w,v=1-(j+.5)/h,canton=u<.4&&v<7/13;
    const ivory=[203,193,169],red=[141,53,47],blue=[48,64,86];
    let ink=canton?blue:Math.floor(v*13)%2?ivory:red;
    if(canton && stars.some(([x,y])=>Math.abs(u-x)<.015&&Math.abs(v-y)<.027&&star(u-x,(v-y)/1.9)))ink=ivory;
    const weather=.94+.04*Math.sin(i*.67)*Math.cos(j*.49)+.025*Math.sin(.09*i+.13*j);
    pixels.set(ink.map(k=>Math.round(k*weather)),(j*w+i)*4);pixels[(j*w+i)*4+3]=255;
  }
  const map=new T.DataTexture(pixels,w,h,T.RGBAFormat);map.name='1975 US colors - woven 50-star muster flag';
  map.colorSpace=T.SRGBColorSpace;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;
  map.magFilter=T.LinearFilter;map.anisotropy=2;map.needsUpdate=true;
  const cloth=new T.PlaneGeometry(1,1,22,9),p=cloth.attributes.position,uv=cloth.attributes.uv;
  for(let i=0;i<p.count;i++){
    const u=uv.getX(i),v=uv.getY(i);
    p.setXYZ(i,ox+.047+2.40*u-.062*u*(1-v),tip-.17-(1-v)*1.27-.27*u-.13*Math.sin(Math.PI*u),
      oz+.29*u);
  }
  cloth.computeVertexNormals();cloth.computeBoundingSphere();cloth.boundingSphere!.radius+=.75;
  const parts:T.BufferGeometry[]=[];
  const hardware=(g:T.BufferGeometry,x:number,y:number,z:number,hex:string)=>{
    g.translate(x,y,z);const c=new T.Color(hex),rgb=Array.from({length:g.attributes.position.count},()=>c.toArray()).flat();
    g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));parts.push(g);
  };
  hardware(new T.CylinderGeometry(.042,.078,tip,12),ox,tip/2-.04,oz,'#a3a199');
  hardware(new T.CylinderGeometry(.21,.36,.26,10),ox,.09,oz,'#837e6f');
  hardware(new T.CylinderGeometry(.091,.118,.37,12),ox,.34,oz,'#989383');
  hardware(new T.SphereGeometry(.091,10,7),ox,tip-.01,oz,'#bb9965');
  hardware(new T.CylinderGeometry(.009,.009,tip-1.15,5),ox-.095,(tip+1.12)/2-.14,oz+.032,'#ada389');
  const pole=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());
  const time={value:0},material=new T.MeshStandardMaterial({map,roughness:.99,side:T.DoubleSide,
    emissive:'#706862',emissiveMap:map,emissiveIntensity:.37});
  material.onBeforeCompile=s=>{
    s.uniforms.flagTime=time;
    s.vertexShader='uniform float flagTime;\n'+s.vertexShader
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        float uFlag=uv.x, vFlag=uv.y;
        float phase=7.6*uFlag+.72*vFlag-2.85*flagTime;
        float lift=phase+.94;
        float wave=sin(phase),roll=sin(lift);
        vec3 along=vec3(2.40-.062*(1.-vFlag)-.09*(wave+7.6*uFlag*cos(phase)),
          -.27-.13*3.14159*cos(3.14159*uFlag)+.24*(roll+7.6*uFlag*cos(lift)),
          .29+.53*(wave+7.6*uFlag*cos(phase)));
        vec3 across=vec3(.062*uFlag-.09*.72*uFlag*cos(phase),
          1.27+.24*.72*uFlag*cos(lift),.53*.72*uFlag*cos(phase));
        objectNormal=normalize(cross(along,across));`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        transformed+=uFlag*vec3(-.09*wave,.24*roll,.53*wave);`);
  };
  material.customProgramCacheKey=()=>'embassy-travelling-cloth-wave-v2';
  return {cloth,pole,map,material,time,stars};
}
