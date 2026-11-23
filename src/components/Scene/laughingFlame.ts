import * as T from 'three';

const W=24,H=30,FRAMES=8;
// Sprite coordinates run top to bottom. The two laugh beats change the
// mouth, cheeks and eyes while the flame tips curl on their own eight-cel loop.
export function createLaughingFlameAtlas() {
  const pixels=new Uint8Array(W*H*FRAMES*4);
  const palette=[0x72321c,0xe98517,0xffc529,0xffe956,0xfff7ac,0x49221d,0xf97735];
  for(let frame=0;frame<FRAMES;frame++) {
    const phase=frame*Math.PI/4, laugh=[0,1,2,2,1,0,1,0][frame];
    function dot(x:number,y:number,ink:number) {
      const i=((H-1-y)*W*FRAMES+frame*W+x)*4,c=palette[ink];
      pixels[i]=c>>16; pixels[i+1]=(c>>8)&255; pixels[i+2]=c&255; pixels[i+3]=255;
    }
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      const belly=Math.hypot((x-11.5)/9.4,(y-18)/9.7);
      let inside=belly<1,core=belly<.85;
      for(const [base,tip,wide,bend] of [[9,2,5,4],[16,6,3.6,2],[5,11,3,-2]]){
        const top=tip+Math.round(Math.sin(phase+base)*1.6);
        const u=(y-top)/(19-top);
        if(u<0||u>1)continue;
        const dx=Math.abs(x-base-(1-u)*(bend+2.6*Math.sin(phase+u*4+base)));
        inside ||= dx<.7+u*wide;
        core ||= dx<Math.max(0,u*wide-.6);
      }
      if(!inside)continue;
      let ink=core?(x<9&&y<21?3:2):1;
      if(belly>.89&&y>19)ink=0;
      if(belly<.68&&y>18)ink=3;
      if((x===7||x===16)&&y===15-laugh%2)ink=4;
      const eyeX=x<12?x-7:x-16;
      if(Math.abs(eyeX)<=2 && y===16+Math.floor(Math.abs(eyeX)*.75)-laugh%2)ink=5;
      const jaw=Math.abs(x-11.5), lip=20-Math.floor(jaw*.36);
      if(jaw<5.2 && y>=lip && y<=22+laugh-Math.floor(jaw*.65)){
        ink=y===lip&&jaw<4?4:y>=22+laugh-Math.floor(jaw*.65)&&jaw<2.5?6:5;
      }
      dot(x,y,ink);
    }
    dot(18+frame%2,3+frame%4,3);
    dot(4,7-frame%3,2);
  }
  const map=new T.DataTexture(pixels,W*FRAMES,H);
  map.minFilter=map.magFilter=T.NearestFilter;map.generateMipmaps=false;
  map.colorSpace=T.SRGBColorSpace;map.needsUpdate=true;
  return map;
}

export function laughingFlameMaterial(map:T.Texture,clock:{value:number}) {
  const material=new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false});
  material.onBeforeCompile=s=>{
    s.uniforms.flameCelTime=clock;
    s.vertexShader='uniform float flameCelTime;\n'+s.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vMapUv.x=(mod(floor(flameCelTime*9.),8.)+clamp(vMapUv.x,.5/24.,1.-.5/24.))/8.;`);
  };
  material.customProgramCacheKey=()=>'laughing-flame-cels';
  return material;
}
