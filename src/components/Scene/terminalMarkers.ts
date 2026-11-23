import * as T from 'three';
import {NAPALM_STRIKE_LENGTH, NAPALM_STRIKE_WIDTH} from '../../lib/weapons';
import {EAGLE_STRIKE_LENGTH,EAGLE_STRIKE_WIDTH} from '../../lib/eagleSupport';

const strikes={
  napalm:{length:NAPALM_STRIKE_LENGTH,width:NAPALM_STRIKE_WIDTH,color:'#ffd568'},
  eagle:{length:EAGLE_STRIKE_LENGTH,width:EAGLE_STRIKE_WIDTH,color:'#fff0a6'},
};
type Strike=keyof typeof strikes;

// Eight vertices leave the center of the strike open before rasterization.
export function createStrikePerimeter(strike:Strike) {
  const x=strikes[strike].length/2, y=strikes[strike].width/2, w=.58;
  const frame=new T.BufferGeometry();
  frame.setAttribute('position',new T.Float32BufferAttribute([
    -x,-y,0, x,-y,0, x,y,0, -x,y,0,
    -x+w,-y+w,0, x-w,-y+w,0, x-w,y-w,0, -x+w,y-w,0,
  ],3));
  frame.setIndex([0,1,5,0,5,4, 1,2,6,1,6,5, 2,3,7,2,7,6, 3,0,4,3,4,7]);
  return frame;
}

// The rectangle runs two rows of Matrix-style code along its four edges.
export function terminalMarkerInk(atlas:T.Texture, clock:{value:number}, strike:Strike) {
  const material = new T.MeshBasicMaterial({color:strikes[strike].color,transparent:true,depthWrite:false,toneMapped:false});
  material.onBeforeCompile = shader => {
    shader.uniforms.markTime=clock;
    shader.uniforms.markAlphabet={value:atlas};
    shader.vertexShader='varying vec2 markXY;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nmarkXY=position.xy;');
    shader.fragmentShader='uniform sampler2D markAlphabet; uniform float markTime; varying vec2 markXY;\n'+
      shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float tick=floor(markTime*9.);
        const vec2 halfSize=vec2(${strikes[strike].length/2},${strikes[strike].width/2});
        vec2 edge=halfSize-abs(markXY);
        float inset=min(edge.x,edge.y);
        if(inset>.58)discard;
        float along=edge.x<edge.y ? (markXY.x>0.?halfSize.y-markXY.y:halfSize.y+markXY.y)
                                     : (markXY.y>0.?halfSize.x+markXY.x:halfSize.x-markXY.x);
        vec2 cellUV=vec2(along/.228,(.58-inset)/.29);
        float column=floor(cellUV.x);
        float fall=mod(floor(tick*(.37+.11*mod(column,4.)))+floor(cellUV.y)+column*3.,7.);
        float head=1.-smoothstep(0.,4.,fall);
        vec3 ink=diffuseColor.rgb*mix(.32,1.0,head);
        float strength=(.77+.23*cos(markTime*5.))*(.74+.26*head);
        vec2 cell=floor(cellUV);
        float code=mod(cell.x*7.+cell.y*3.+floor(tick*.35+mod(cell.x,4.)),${TERMINAL_GLYPH_COUNT}.);
        vec2 glyphUV=vec2((code+fract(cellUV.x))/${TERMINAL_GLYPH_COUNT}.,fract(cellUV.y));
        float bit=texture2D(markAlphabet,glyphUV).r;
        if(bit<.5)discard;
        diffuseColor.rgb=ink;
        diffuseColor.a*=strength;`);
  };
  material.customProgramCacheKey=()=>strike+'-border-code';
  return material;
}

// 5 × 7 hand-drawn terminal sorts, with a blank column/row between cells.
// Nearest filtering keeps the glyph strokes crisp on each strike perimeter.
const SORTS = [
  [10,10,31,10,31,10,10], [14,8,8,8,8,8,14], [14,2,2,2,2,2,14],
  [0,0,31,0,31,0,0], [0,4,4,0,4,4,0], [0,0,0,0,0,4,4],
  [14,17,19,21,25,17,14], [4,12,4,4,4,4,14], [30,1,1,14,16,16,31],
  [14,17,17,31,17,17,17], [31,16,16,30,16,16,16], [17,10,4,4,4,10,17],
  [1,2,4,8,16,0,0], [4,4,4,31,4,4,4], [17,25,21,19,17,17,17], [31,1,2,4,8,16,31],
] as const;
const TERMINAL_GLYPH_COUNT = SORTS.length;
export function createTerminalAlphabet() {
  const width=SORTS.length*6, height=8, data=new Uint8Array(width*height*4);
  SORTS.forEach((rows,sort)=>rows.forEach((bits,row)=>{
    for(let x=0;x<5;x++) if(bits&(16>>x)) {
      const i=((6-row)*width+sort*6+x)*4;
      data.fill(255,i,i+4);
    }
  }));
  const atlas=new T.DataTexture(data,width,height);
  atlas.minFilter=atlas.magFilter=T.NearestFilter; atlas.generateMipmaps=false; atlas.needsUpdate=true;
  return atlas;
}
