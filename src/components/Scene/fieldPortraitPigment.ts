import * as THREE from 'three';

// Four hand-plotted pigment separations on the two actors' shared cranial
// landmarks. Coordinates below are millimetres on the actual CC0 face, not
// screen coordinates. Large masses have quiet interiors and broken pixel
// edges, like the cheek and brow in the Ghost Signal crossing portrait.
export function makeFieldPortraitInks() {
  const size=96,pixels=new Uint8Array(size*size*4);
  type Point=readonly [number,number];
  function mark(channel:number,power:number,points:Point[],paired=false) {
    for(const side of paired?[-1,1]:[1]){
      const v=points.map(([x,y])=>[side*x,y+(paired&&side<0&&x>16?2:0)] as const);
      const lo=Math.max(0,Math.floor((Math.min(...v.map(p=>p[0]))+96)/2));
      const hi=Math.min(size-1,Math.ceil((Math.max(...v.map(p=>p[0]))+96)/2));
      for(let j=0;j<size;j++)for(let i=lo;i<=hi;i++){
        const x=-95+2*i,y=9+2*j;let inside=false;
        for(let k=0,last=v.length-1;k<v.length;last=k++){
          const [a,b]=v[k],[c,d]=v[last];
          if((b>y)!==(d>y)&&x<a+(c-a)*(y-b)/(d-b))inside=!inside;
        }
        if(inside){const n=4*(j*size+i)+channel;pixels[n]=Math.max(pixels[n],power);}
      }
    }
  }
  // R: connected flesh turns; G: broken key planes; B: deepest folds;
  // A: blood-bearing cartilage/lip. Never stamp the cornea or bare teeth.
  mark(0,165,[[12,157],[31,160],[57,150],[51,145],[39,148],[26,149],[14,143]],true);
  mark(0,135,[[19,136],[39,136],[52,141],[57,137],[43,128],[28,125],[17,130]],true);
  mark(0,205,[[46,115],[59,119],[73,132],[69,107],[57,88],[39,75],[31,75],[42,93]],true);
  mark(0,158,[[7,135],[14,141],[15,125],[10,108],[5,103]],true);
  mark(0,201,[[1,99],[9,102],[18,98],[16,91],[7,90],[-1,92]],true);
  mark(0,162,[[24,82],[30,75],[39,67],[32,59],[25,62],[20,69]],true);
  mark(0,162,[[-28,55],[-12,53],[7,54],[21,56],[13,46],[-6,42],[-19,47]]);
  mark(1,143,[[9,161],[17,166],[33,167],[47,160],[33,162],[21,160],[11,157]],true);
  mark(1,209,[[28,124],[41,130],[57,133],[65,130],[53,124],[47,119],[36,117]],true);
  mark(1,118,[[46,117],[58,121],[50,113],[39,108]],true);
  mark(1,210,[[-6,145],[0,146],[2,137],[-1,114],[-5,111],[-3,131]]);
  mark(1,242,[[-9,106],[-2,111],[6,109],[9,105],[2,103],[-7,103]]);
  mark(1,150,[[-17,64],[-7,66],[11,65],[15,62],[5,60],[-9,61]]);
  mark(1,158,[[-16,52],[-5,55],[10,53],[15,48],[5,49],[-12,47]]);
  mark(2,202,[[13,155],[24,160],[34,161],[49,157],[55,151],[41,154],[25,155],[16,151]],true);
  mark(2,146,[[15,144],[26,148],[38,148],[48,144],[36,145],[26,145]],true);
  mark(2,180,[[7,98],[13,99],[16,96],[13,94],[8,94]],true);
  mark(2,124,[[19,86],[23,84],[28,76],[26,75],[22,81]],true);
  mark(2,220,[[-26,71],[-17,73],[-6,73],[1,71],[8,73],[18,72],[26,74],[19,69],[4,68],[-10,70],[-23,68]]);
  mark(3,106,[[23,124],[37,129],[56,127],[49,121],[34,117],[24,118]],true);
  mark(3,143,[[-16,104],[-8,108],[6,106],[16,103],[13,99],[-8,97],[-17,99]]);
  mark(3,187,[[-22,69],[-10,70],[3,68],[19,70],[15,64],[-1,62],[-16,65]]);
  // Skin turns around bone; unlike a brow hair or lash, the edge of the
  // cheek shadow is not an ink line. Feather the three translucent washes
  // across a few native texels, retaining their broken 2mm silhouette.
  const cuts=pixels.slice();
  for(let j=2;j<size-2;j++)for(let i=2;i<size-2;i++)for(const k of [0,1,3]){
    let sum=0;
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)
      sum+=cuts[4*((j+y)*size+i+x)+k]*(3-Math.abs(x))*(3-Math.abs(y));
    const q=4*(j*size+i)+k;pixels[q]=Math.round(cuts[q]*.29+sum*.71/81);
  }
  const tex=new THREE.DataTexture(pixels,size,size);
  tex.name='field-portrait-four-ink-separations';tex.magFilter=THREE.NearestFilter;
  tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;
  tex.colorSpace=THREE.NoColorSpace;tex.needsUpdate=true;return tex;
}

export const fieldPortraitInks=makeFieldPortraitInks();
export const FIELD_PORTRAIT_GLSL=`
  uniform sampler2D fieldPortraitInks;
  vec3 fieldCutPortrait(vec3 skin,vec3 point){
    vec2 uv=(point.xy+vec2(.096,-.008))/.192;
    vec4 cut=texture2D(fieldPortraitInks,uv);
    // Front and front-three-quarter only; no mirrored eyes on the skull.
    cut*=smoothstep(.042,.094,-point.z)*step(0.,uv.y)*step(uv.y,1.);
    float l=dot(skin,vec3(.27,.61,.12));
    skin=mix(skin,skin*.45+l*vec3(.27,.29,.33),cut.r*.69);
    skin=mix(skin,skin*vec3(1.19,1.20,1.14)+vec3(.069,.051,.028),cut.g*.77);
    skin=mix(skin,skin*vec3(.36,.37,.37),cut.b*.84);
    skin=mix(skin,skin*vec3(1.16,.86,.78),cut.a*.74);
    return skin;
  }
`;
