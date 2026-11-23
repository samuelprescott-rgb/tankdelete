import * as T from 'three';

// Left tile: broad dorsal metacarpal fan, dark thumb-side saddle, wrist
// fold and three staggered knuckle lights. Right tile: a lengthwise finger
// with two joints and a distal nail. Not a tiled skin-noise texture.
const size=32, pixels=new Uint8Array(size*size*2*4);
type Pair=[number,number];
function brush(tile:number,ch:number,value:number,pts:Pair[]){
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    let inside=false;
    for(let i=0,j=pts.length-1;i<pts.length;j=i++){
      const [a,b]=pts[i],[c,d]=pts[j];
      if((b>y+.5)!==(d>y+.5)&&x+.5<a+(c-a)*(y+.5-b)/(d-b))inside=!inside;
    }
    if(inside){const q=(y*64+tile*32+x)*4+ch;pixels[q]=Math.max(value,pixels[q]);}
  }
}
brush(0,0,190,[[0,1],[9,0],[13,4],[12,8],[8,12],[8,18],[4,22],[0,25]]);
brush(0,0,136,[[11,6],[21,13],[26,20],[23,24],[19,20],[17,16],[11,10]]);
brush(0,0,112,[[13,12],[17,21],[17,27],[14,25],[14,19],[10,12]]);
brush(0,0,160,[[25,3],[31,6],[32,14],[28,18],[23,14],[25,11]]);
brush(0,0,125,[[3,26],[7,24],[12,26],[18,26],[23,28],[28,27],[30,29],[24,31],[17,29],[10,30]]);
brush(0,1,117,[[2,4],[6,5],[11,5],[15,7],[10,7],[5,7]]);
brush(0,1,132,[[4,9],[7,11],[7,15],[5,17],[5,12]]);
brush(0,1,125,[[11,25],[14,24],[17,25],[17,26],[13,26]]);
brush(0,1,104,[[22,26],[26,25],[28,26],[24,27]]);
brush(0,2,154,[[9,6],[12,8],[13,11],[12,12],[9,9]]);
brush(0,2,159,[[11,11],[14,15],[15,21],[13,23],[12,17],[9,13]]);
brush(0,2,145,[[16,10],[21,14],[24,19],[23,20],[19,16]]);
brush(0,2,199,[[5,22],[9,21],[11,23],[9,25],[5,25]]);
brush(0,2,191,[[13,22],[17,21],[20,23],[18,25],[14,25]]);
brush(0,2,175,[[23,24],[26,22],[29,24],[27,26],[24,26]]);
brush(1,0,166,[[0,0],[32,0],[32,7],[27,10],[21,8],[17,10],[12,8],[7,12],[0,10]]);
brush(1,0,158,[[5,14],[7,11],[11,11],[14,14],[13,22],[11,25],[10,17],[8,15]]);
brush(1,0,172,[[16,13],[19,11],[22,14],[24,17],[23,23],[21,22],[19,17]]);
brush(1,1,153,[[8,13],[10,14],[12,18],[12,23],[11,22],[10,18]]);
brush(1,1,139,[[17,14],[19,14],[21,17],[21,20],[19,17]]);
brush(1,2,183,[[1,14],[4,13],[8,16],[8,21],[6,23],[2,22]]);
brush(1,2,174,[[13,14],[16,13],[18,16],[18,21],[16,23],[14,20]]);
brush(1,1,100,[[22,14],[24,12],[29,13],[30,15],[26,15],[23,17]]);
brush(1,3,216,[[23,15],[26,14],[29,16],[30,22],[28,25],[24,24],[22,21]]);
brush(1,2,110,[[26,15],[29,16],[29,18],[26,17]]);
export const fieldHandInk=new T.DataTexture(pixels,64,32);
fieldHandInk.name='field-hands-dorsum-and-joints';fieldHandInk.colorSpace=T.NoColorSpace;
fieldHandInk.magFilter=T.NearestFilter;fieldHandInk.minFilter=T.LinearMipmapLinearFilter;
fieldHandInk.generateMipmaps=true;fieldHandInk.needsUpdate=true;
export const HAND_PAINT_GLSL=`
  uniform sampler2D fieldHandInk;
  vec3 fieldHandPrint(vec3 base,vec2 chart){
    vec4 ink=texture2D(fieldHandInk,chart);
    float l=dot(base,vec3(.27,.61,.12));
    // Pigments are still albedo under the actual campaign/horde light.
    // Ash-plum is warm enough to read as flesh, not black combat paint.
    vec3 shade=base*.24+l*vec3(.44,.43,.53);
    vec3 flex=base*vec3(.56,.48,.48)+.05*l;
    vec3 dry=base*vec3(1.16,1.22,1.18)+vec3(.048,.031,.021);
    vec3 bone=base*.34+l*vec3(.94,.76,.67)+vec3(.058,.038,.030);
    vec3 skin=mix(base,shade,.91*ink.r);
    skin=mix(skin,flex,.82*ink.g);
    skin=mix(skin,dry,.91*ink.b);
    return mix(skin,bone,.94*ink.a);
  }
  vec2 fieldHandTile(float tile,vec2 uv){
    return vec2(tile*.5,0.)+(clamp(uv,0.,1.)*31.+.5)/vec2(64.,32.);
  }`;
