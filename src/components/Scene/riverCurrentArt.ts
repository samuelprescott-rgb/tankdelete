import {useMemo} from 'react';
import {useLoader} from '@react-three/fiber';
import * as T from 'three';
import {scaledStationIndexAtZ,type RiverStation} from './riverLayout';

export function useRiverInkAtlas() {
  const texture=useLoader(T.TextureLoader,'/images/textures/river-current-ink.png');
  return useMemo(()=>{
    texture.colorSpace=T.SRGBColorSpace;
    texture.minFilter=texture.magFilter=T.NearestFilter;
    texture.generateMipmaps=false;
    texture.needsUpdate=true;
    return texture;
  },[texture]);
}

// The river widens into the village outlet at increasing Z. Average across a
// short reach so individual eroded nicks in the bank don't turn the current.
export function downstreamAt(stations:RiverStation[],z:number,out:T.Vector2) {
  const lo=Math.floor(scaledStationIndexAtZ(stations,Math.max(stations[0].z,z-1.5)));
  const hi=Math.ceil(scaledStationIndexAtZ(stations,Math.min(stations[stations.length-1].z,z+1.5)));
  const a=stations[Math.max(0,lo)],b=stations[Math.min(stations.length-1,hi)];
  return out.set(b.centerX-a.centerX,b.z-a.z).normalize();
}

export function makeRiverInkBatch(count:number,map:T.Texture,day:boolean,foam:boolean) {
  const cel=new T.InstancedBufferAttribute(new Float32Array(count),1);
  const geometry=new T.PlaneGeometry(1,1);
  geometry.setAttribute('inkCel',cel);
  const clock={value:0};
  const material=new T.MeshBasicMaterial({map,color:day?'#ffffff':'#8897a3',
    transparent:true,depthWrite:false,toneMapped:false});
  material.onBeforeCompile=shader=>{
    shader.uniforms.inkClock=clock;
    shader.vertexShader='attribute float inkCel; uniform float inkClock;\n'+shader.vertexShader.replace(
      '#include <uv_vertex>',`#include <uv_vertex>
      float frame=${foam?'16.+mod(inkCel+floor(inkClock*9.),16.)':'inkCel'};
      vec2 tile=vec2(mod(frame,8.),3.-floor(frame/8.));
      vMapUv=(tile+clamp(vMapUv,.5/64.,1.-.5/64.))/vec2(8.,4.);`);
  };
  material.customProgramCacheKey=()=>foam?'pier-foam-cels':'track-silt-cels';
  const mesh=new T.InstancedMesh(geometry,material,count);
  // Render the clay through the transparent water, with the foam on top.
  mesh.renderOrder=foam?3.5:2.9;
  return {mesh,cel,clock,dispose(){mesh.dispose(); geometry.dispose(); material.dispose();}};
}
