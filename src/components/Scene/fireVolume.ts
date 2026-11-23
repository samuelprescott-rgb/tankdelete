import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as T from 'three';

const sizes = {jet:[24,80,24], flame:[44,56,24], smoke:[32,36,20]} as const;

// Each cel contains a complete 3D grid of painted pixels. Draw its depth
// slices back to front on the best-sampled axis for the current view. Every
// sample has a world position, so cover can cut through the middle of the jet.
export function useFireVolume(form: keyof typeof sizes, frameOffsets?: readonly number[], daylightHaze = false) {
  const atlas = useLoader(T.TextureLoader, `/images/textures/field-fire-${form}.png`);
  const art = useMemo(()=>{
    atlas.minFilter=atlas.magFilter=T.NearestFilter;
    atlas.generateMipmaps=false;
    atlas.colorSpace=T.SRGBColorSpace;
    atlas.needsUpdate=true;
    const dimensions=sizes[form];
    const positions:number[]=[],indices:number[]=[];
    for(let slice=0;slice<Math.max(...dimensions);slice++){
      const i=positions.length/3;
      positions.push(0,0,slice,1,0,slice,0,1,slice,1,1,slice);
      indices.push(i,i+1,i+2,i+2,i+1,i+3);
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);
    if (frameOffsets) geometry.setAttribute('fireFrame',new T.InstancedBufferAttribute(new Float32Array(frameOffsets),1));
    const material=new T.ShaderMaterial({
      fog:daylightHaze,
      uniforms:{...(daylightHaze?T.UniformsUtils.clone(T.UniformsLib.fog):{}),atlas:{value:atlas},grid:{value:new T.Vector3(...dimensions)},time:{value:0},
        rate:{value:form==='smoke'?3.5:16},emission:{value:form==='smoke'?1:1.48}},
      transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,toneMapped:false,
      vertexShader:`
        #include <fog_pars_vertex>
        ${frameOffsets?'attribute float fireFrame;':''}
        uniform vec3 grid;uniform float time,rate;
        varying vec3 cell;varying float frame;
        void main(){
          mat4 world=modelMatrix*instanceMatrix;
          vec3 eye=(inverse(world)*vec4(cameraPosition,1.)).xyz-vec3(0.,.5,0.);
          vec3 weight=abs(eye)*grid;
          int axis=weight.x>weight.y && weight.x>weight.z?0:(weight.y>weight.z?1:2);
          float bank=position.z;
          if(bank>=grid[axis]){gl_Position=vec4(2.,2.,2.,1.);return;}
          float depth=(bank+.5)/grid[axis];if(eye[axis]<0.)depth=1.-depth;
          cell=axis==0?vec3(depth,position.x,position.y):axis==1?vec3(position.x,depth,position.y):vec3(position.xy,depth);
          float pose=time*rate+${frameOffsets?'fireFrame':'float(gl_InstanceID)*7.'};
          frame=mod(${form==='smoke'?'pose':'floor(pose)'},24.);
          vec4 mvPosition=viewMatrix*world*vec4(cell-vec3(.5,0.,.5),1.);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader:`
        #include <fog_pars_fragment>
        uniform sampler2D atlas;uniform vec3 grid;uniform float emission;
        varying vec3 cell;varying float frame;
        void main(){
          vec3 p=floor(clamp(cell,0.,.999999)*grid);
          vec2 texel=vec2(p.z*grid.x+p.x,(23.-floor(frame))*grid.y+p.y);
          vec4 ink=texture2D(atlas,(texel+.5)/vec2(grid.x*grid.z,24.*grid.y));
          ${form==='smoke'?`
            vec2 next=vec2(texel.x,(23.-mod(floor(frame)+1.,24.))*grid.y+p.y);
            vec4 other=texture2D(atlas,(next+.5)/vec2(grid.x*grid.z,24.*grid.y));
            ink=mix(ink,other,smoothstep(0.,1.,fract(frame)));
            // Each nearest-sampled voxel keeps its depth as the tank rounds the jetty.
            // Bounce is strongest under the lobes just over the hot timber.
            float face=floor(clamp(ink.r*14.+.18*(1.-cell.z),0.,1.)*5.+.5)/5.;
            vec3 lit=mix(vec3(.12,.031,.012),vec3(.55,.19,.065),face);
            float bounce=(1.-smoothstep(.05,.84,cell.y))*.88;
            #if defined(USE_FOG) && !defined(FOG_EXP2)
              bounce*=mix(1.,.20,smoothstep(fogNear*.75,mix(fogNear,fogFar,.42),vFogDepth));
            #endif
            ink.rgb=mix(ink.rgb,lit,bounce);
            ink.a*=1.45*(1.-smoothstep(.70,1.,cell.y));
          `:''}
          if(ink.a<.008)discard;
          gl_FragColor=vec4(ink.rgb*emission,ink.a);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    return {geometry,material};
  },[atlas,form,frameOffsets,daylightHaze]);
  useEffect(()=>()=>{art.geometry.dispose();art.material.dispose();},[art]);
  return art;
}
