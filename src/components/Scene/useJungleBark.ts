import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { surfaceCipherAtlas, cipherGLSL, cipherVaryings, cipherVertex } from './surfaceCipher';

/** Shared bark grain under a painted umber and moss palette on the trunk batches. */
export function useJungleBark() {
  const map = useLoader(THREE.TextureLoader, '/images/textures/jungle-bark-v1.png');
  const material = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 9);
    map.anisotropy = 4;
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      color: '#ffffff', map, roughness: 1, metalness: 0, vertexColors: false,
    });
  }, [map]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

// Three's clone does not retain shader hooks. Each owned trunk material gets
// this finish before the caller adds the camera sightline fade.
export function createPaintedBarkMaterial(source?: THREE.Material) {
  const material = source instanceof THREE.MeshStandardMaterial
    ? source.clone() : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  if (!material.map) return material;
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceCipherMap={value:surfaceCipherAtlas()};
    shader.vertexShader = cipherVaryings+'varying float vBarkHeight; varying vec2 vBarkCylinder;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvBarkHeight = position.y;\n'+cipherVertex+'\nvBarkCylinder=vec2(uv.x*max(.38,length(vCipherLocal.xz)*6.28318),vCipherLocal.y);');
    shader.fragmentShader = cipherVaryings+cipherGLSL+'\nvarying float vBarkHeight; varying vec2 vBarkCylinder;\n' + shader.fragmentShader.replace('#include <map_fragment>', /* glsl */ `
      #ifdef USE_MAP
        vec3 barkGrain = texture2D(map, vMapUv).rgb;
        float barkValue = dot(barkGrain, vec3(0.36, 0.53, 0.11));
        float grain = smoothstep(0.047, 0.23, barkValue);
        // Start with the irregular grain; keep the directional accents
        // broken and local so a grove never becomes a row of striped poles.
        float drift = vMapUv.x * 11.7 + sin(vBarkHeight * 8.1 + vMapUv.x * 2.6) * 1.32 + grain * 1.4;
        float paintedFiber = smoothstep(0.32, 0.85, sin(drift)) * grain;
        float fiberBreak = smoothstep(-0.5, 0.79, sin(vBarkHeight * 21.0 + vMapUv.x * 12.7));
        vec3 barkPaint = mix(vec3(0.073, 0.057, 0.043), vec3(0.157, 0.111, 0.073), grain);
        float grooveEdge = paintedFiber * fiberBreak;
        float damp = (1.0 - smoothstep(0.025, 0.21, vBarkHeight)) * (0.42 + 0.58 * grain);
        barkPaint = mix(barkPaint, vec3(0.073, 0.106, 0.061), damp * 0.62);
        // The exposed lip of a fissure is the transition into type. Let
        // the native bark interrupt a line of letters before a new one starts.
        float split=sin(drift+.8*sin(vBarkCylinder.y*3.7+vCipherPhase.x));
        vec2 barkType=vec2(vBarkCylinder.x*68.+sin(vBarkCylinder.y*2.1)*.72+split*.42,
          vBarkCylinder.y*56.+.38*sin(vBarkCylinder.x*17.))+vCipherPhase;
        vec2 barkInk=cipherField(barkType);
        float reveal=smoothstep(.11,.72,.53*grain+.24*(.5+.5*split)+.23*fiberBreak);
        float channel=mix(.26,1.,reveal);
        vec3 scab=barkPaint*(.69+.50*sqrt(clamp(barkValue*4.5,0.,1.)))
          + grooveEdge*vec3(.048,.028,.014);
        diffuseColor.rgb*=scab*(1.-.22*barkInk.g*channel)+barkInk.r*vec3(.31,.18,.089)*channel;
      #endif
    `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      #ifdef USE_MAP
        // The chipped lips of nearby bark catch the same dawn key as the
        // tank. Flatten before the pattern can shimmer on a distant treeline.
        float barkNear=1.-smoothstep(6.,18.,length(vViewPosition));
        float barkRelief=.0065*barkNear*(.70*barkValue+.30*grooveEdge);
        vec3 bx=dFdx(-vViewPosition), by=dFdy(-vViewPosition);
        vec3 rx=cross(by,normal), ry=cross(normal,bx);
        float det=dot(bx,rx);
        vec3 off=(rx*dFdx(barkRelief)+ry*dFdy(barkRelief))*sign(det)/max(.0000001,abs(det));
        normal=normalize(normal-clamp(off,vec3(-.34),vec3(.34)));
      #endif`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      #ifdef USE_MAP
        roughnessFactor=1.-.33*(1.-smoothstep(6.,18.,length(vViewPosition)))*grooveEdge;
      #endif`);
  };
  material.customProgramCacheKey = () => 'painted-jungle-bark-v6:lit-fissure';
  return material;
}
