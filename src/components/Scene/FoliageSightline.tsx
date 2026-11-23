import {eclipseBearingGLSL} from './hordeEclipse';
import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function createFoliageSightlineUniforms() {
  return { foliageEye: { value: new THREE.Vector3() }, foliageSubject: { value: new THREE.Vector3() },
    foliageSightlineEnabled: { value: 0 }, rainOnCanopy: { value: 0 } };
}
const FoliageSightlineContext = createContext<ReturnType<typeof createFoliageSightlineUniforms> | null>(null);
export const useFoliageSightline = () => useContext(FoliageSightlineContext);

/** One scene-local update after camera following; no per-tree tests or uploads. */
function ActiveFoliageSightline({ tankRef, enabled, raining, children }: {
  tankRef?: RefObject<THREE.Group | null>; enabled: boolean; raining?: boolean; children: ReactNode;
}) {
  const uniforms = useMemo(createFoliageSightlineUniforms, []);
  useLayoutEffect(() => { uniforms.rainOnCanopy.value = raining ? 1 : 0; }, [raining, uniforms]);
  useFrame(({ camera }, delta) => {
    uniforms.foliageSightlineEnabled.value = THREE.MathUtils.damp(
      uniforms.foliageSightlineEnabled.value, enabled && tankRef?.current ? 1 : 0, 12, delta);
    camera.getWorldPosition(uniforms.foliageEye.value);
    if (tankRef?.current) {
      tankRef.current.getWorldPosition(uniforms.foliageSubject.value);
      uniforms.foliageSubject.value.y += 0.85;
    }
  }, 0.6);
  return <FoliageSightlineContext.Provider value={uniforms}>{children}</FoliageSightlineContext.Provider>;
}

/** Enabled after day/night driving checks. A development-only opt-out retains
 * a reproducible baseline; production never exposes test switches. */
export function FoliageSightline(props: {
  tankRef?: RefObject<THREE.Group | null>; enabled: boolean; raining?: boolean; children: ReactNode;
}) {
  const disabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has('foliageOff');
  return disabled ? <>{props.children}</> : <ActiveFoliageSightline {...props} />;
}

/** View-only narrow, feathered forest cutout. Buildings, ground, enemies and
 * shadow materials are deliberately unchanged. No sorted transparency. */
export function applyFoliageSightline(material: THREE.MeshStandardMaterial,
  uniforms: ReturnType<typeof createFoliageSightlineUniforms> | null) {
  if (!uniforms) return material;
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vFoliageSightlineWorld;\n${shader.vertexShader}`
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 foliageWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          foliageWorld = instanceMatrix * foliageWorld;
        #endif
        vFoliageSightlineWorld = (modelMatrix * foliageWorld).xyz;`);
    shader.fragmentShader = `${eclipseBearingGLSL}
      uniform float rainOnCanopy;
      uniform vec3 foliageEye;
      uniform vec3 foliageSubject;
      uniform float foliageSightlineEnabled;
      varying vec3 vFoliageSightlineWorld;\n${shader.fragmentShader}`
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        // Blue-green, rain-dark broadleaves frame the warm court. Preserve
        // the crown's painted facets and relative values (not an emissive
        // blue wash), and never recolour skin, uniforms, objectives or fire.
        float wetLeafValue=dot(diffuseColor.rgb,vec3(.27,.63,.10));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.39,.65,.81)*wetLeafValue,rainOnCanopy*.77);
        if (foliageSightlineEnabled > 0.001) {
          vec3 sightline = foliageSubject - foliageEye;
          float progress = dot(vFoliageSightlineWorld - foliageEye, sightline) / max(dot(sightline, sightline), 0.01);
          if (progress > 0.0 && progress < 0.97) {
            float separation = length(vFoliageSightlineWorld - (foliageEye + sightline * progress));
            float radius = mix(0.8, 1.6, clamp(progress, 0.0, 1.0));
            float coverage = smoothstep(radius * 0.7, radius + 0.45, separation);
            // Fixed screen-space interleaved pattern: no animated noise or new texture.
            float threshold = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
            if (threshold >= mix(1.0, coverage, foliageSightlineEnabled)) discard;
          }
        }`)
      .replace('#include <opaque_fragment>', `
        if(rainOnCanopy>.5 && vFoliageSightlineWorld.y>2.5){
          vec3 toTree=vFoliageSightlineWorld-cameraPosition;
          float range=length(toTree);
          float bearing=smoothstep(.48,.94,dot(toTree,eclipseRay)/max(.001,range));
          float face=dot(normal,mat3(viewMatrix)*eclipseRay);
          float tips=smoothstep(-.10,.58,face)*smoothstep(.018,.13,wetLeafValue);
          float crown=smoothstep(2.5,5.2,vFoliageSightlineWorld.y)*smoothstep(8.,22.,range);
          outgoingLight+=vec3(.029,.008,.047)*bearing*crown*tips;
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${cacheKey}-tank-sightline-v2`;
  return material;
}
