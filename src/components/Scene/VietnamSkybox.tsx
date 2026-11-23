import {eclipseBearingGLSL} from './hordeEclipse';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CombatSectorPerimeter } from './ForestPerimeter';

import { RIVER_SKY_TEXTURES } from './riverDawnAsset';
import { RiverRidgeHuts } from './RiverRidgeHuts';
import { gradeDawnGLSL } from './crossingSun';

const SKY_RADIUS = 260;

const skyVertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = /* glsl */ `
  ${gradeDawnGLSL}
  uniform sampler2D uDayPaint;
  uniform sampler2D uPanorama;
  uniform float uTime;
  uniform float uNightmare;
  varying vec3 vDirection;

  // Project onto a tangent plane so the disc stays circular through the
  // panorama seam. The pixel grid belongs to the sky and follows its bearing.
  // Opening above the tree line to the right of the embassy approach.
  ${eclipseBearingGLSL}
  vec3 hordeEclipse(vec3 sky,vec3 ray,float cloudValue) {
    float facing=dot(ray,eclipseRay);
    float cone=smoothstep(.956,.998,facing);
    float exposed=smoothstep(.37,.79,cloudValue);
    sky+=vec3(.047,.013,.079)*cone*exposed;
    if(facing<.984)return sky;
    vec3 east=normalize(cross(eclipseRay,vec3(0.,1.,0.)));
    vec3 up=cross(east,eclipseRay);
    vec2 uv=vec2(dot(ray,east),dot(ray,up))/facing;
    vec2 pixel=(floor(uv*342.)+.5)/342.;
    float radius=length(pixel)/.058;
    if(radius>2.35)return sky;
    if(radius<.96) return mix(vec3(.008,.008,.018),sky,.09+.10*smoothstep(.55,.74,cloudValue));
    float angle=atan(pixel.y,pixel.x);
    float tick=floor(uTime*8.)/8.;
    float breath=.5+.5*sin(tick*1.02);
    float stream=.5+.5*cos(angle*7.+1.5*sin(angle*3.)+.10*breath);
    float rays=.5+.5*cos(angle*21.+sin(angle*7.)*1.7);
    float reach=1.22+.64*pow(stream,3.)+.17*rays+.07*breath;
    float corona=1.-smoothstep(1.,reach,radius);
    corona=floor(corona*4.+.5)/4.;
    vec3 pearl=mix(vec3(.22,.048,.52),vec3(.68,.20,1.12),rays);
    vec3 lit=mix(sky,pearl,corona*.67);
    float rim=(1.-smoothstep(.029,.072,abs(radius-1.)))*(.61+.39*rays);
    lit=mix(lit,vec3(.98,.39,1.37),rim*.91);
    vec2 bead=(pixel/.058)-vec2(-.80,.60);
    lit+=vec3(.72,.47,.83)*(1.-smoothstep(.04,.14,length(bead)))*(.77+.23*breath);
    lit+=vec3(.16,.025,.32)*(1.-smoothstep(1.,2.32,radius))*(.70+.14*breath);
    // Let the painted storm scallops interrupt both the rim and the disc.
    float veil=.14+.72*smoothstep(.40,.74,cloudValue);
    return mix(lit,sky,veil);
  }

  // Keep the old photographed thunderheads, not a procedural colour ramp.
  // The negative-Z street looks into the side of a bank, with the silver
  // opening off the left shoulder and a dark belly behind the embassy name.
  vec3 embassyMonsoon(vec3 direction, float azimuth, float angle) {
    float elevation = angle / 3.14159265 + 0.5;
    float lift=max(0.,elevation-.5);
    float midDeck=1.-smoothstep(.16,.50,lift);
    float latitude=elevation+midDeck*(.61*lift+.041*smoothstep(.0,.14,angle));
    vec2 uv=vec2(fract(azimuth+.108+uTime*.000016*smoothstep(.02,.23,angle)),latitude);
    vec3 paint=texture2D(uPanorama,uv).rgb;
    float seam=1.-smoothstep(0.,.012,min(uv.x,1.-uv.x));
    if(seam>.0)paint=mix(paint,texture2D(uPanorama,vec2(1.-uv.x,uv.y)).rgb,seam*.5);
    float value=sqrt(max(.0,dot(paint,vec3(.24,.64,.12))));
    vec3 ridge=mix(vec3(.006,.011,.016),vec3(.030,.041,.053),smoothstep(.09,.71,value));
    float moon=smoothstep(.49,.97,dot(direction,normalize(vec3(-.60,.32,-.73))));
    vec3 body=mix(vec3(.009,.015,.024),vec3(.040,.054,.077),smoothstep(.19,.55,value));
    float relief=smoothstep(.40,.81,value);
    body=mix(body,vec3(.081,.106,.153),relief*(.40+.60*moon));
    // Only the backlit scallops on the upper bank catch the pale blue light;
    // the panoramic sunset along the foot must never read as a strip of day.
    float underDeck=smoothstep(.045,.22,angle);
    float rim=smoothstep(.59,.92,value)*(.12+.88*moon)*(.17+.83*underDeck);
    body=mix(body,vec3(.176,.203,.253),rim);
    vec3 sky=mix(ridge,body,smoothstep(-.055,.105,angle));
    return hordeEclipse(sky,direction,value);
  }

  void main() {
    vec3 direction = normalize(vDirection);
    float azimuth = atan(direction.z, direction.x) / 6.2831853 + 0.5;
    float elevation = asin(clamp(direction.y, -1.0, 1.0));
    vec3 sky;
    if (uNightmare >= .999) {
      sky = embassyMonsoon(direction, azimuth, elevation);
    } else {
      vec2 paintUv = signalDawnUv(azimuth,elevation);
      sky = signalGradeDawn(texture2D(uDayPaint, paintUv).rgb, direction);
      if (uNightmare > .001) sky = mix(sky, embassyMonsoon(direction, azimuth, elevation), uNightmare);
    }
    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface NightmareSkyProps {
  nightmareActive: boolean;
}

function SkyDome({ nightmareActive }: NightmareSkyProps) {
  const scene = useThree(state => state.scene);
  const [panorama, dayPaint] = useLoader(THREE.TextureLoader, RIVER_SKY_TEXTURES);
  useMemo(() => {
    panorama.colorSpace = THREE.SRGBColorSpace;
    panorama.mapping = THREE.EquirectangularReflectionMapping;
    panorama.wrapS = THREE.RepeatWrapping;
    panorama.minFilter = THREE.LinearMipmapLinearFilter;
    panorama.needsUpdate = true;
    dayPaint.colorSpace = THREE.SRGBColorSpace;
    dayPaint.wrapS = THREE.RepeatWrapping;
    dayPaint.magFilter = THREE.NearestFilter;
    dayPaint.minFilter = THREE.LinearMipmapLinearFilter;
    dayPaint.needsUpdate = true;
  }, [panorama, dayPaint]);
  useLayoutEffect(() => {
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    // Shared image-based fill ties wet soil, water and metal to the same sky.
    // Three caches its prefiltered environment; no per-frame reflection render.
    // Install it in the commit so the first frame warms the real shader variants.
    scene.environment = panorama;
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
    };
  }, [scene, panorama]);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const initialNight = useRef(nightmareActive);
  const uniforms = useMemo(() => ({
    uDayPaint: { value: dayPaint }, uPanorama: { value: panorama }, uTime: { value: 0 },
    uNightmare: { value: initialNight.current ? 1 : 0 },
  }), [dayPaint, panorama]);

  useFrame(({ camera, clock }, delta) => {
    if (meshRef.current) meshRef.current.position.copy(camera.position);
    // Animate the live material: Fiber may copy uniform descriptors when
    // reconciling the JSX object. Mutating that descriptor alone is not enough.
    const liveUniforms = materialRef.current?.uniforms;
    if (!liveUniforms) return;
    liveUniforms.uTime.value = clock.elapsedTime;
    scene.environmentIntensity = THREE.MathUtils.damp(scene.environmentIntensity, nightmareActive ? 0.10 : 0.23, 2.2, delta);
    liveUniforms.uNightmare.value = THREE.MathUtils.damp(
      liveUniforms.uNightmare.value,
      nightmareActive ? 1 : 0,
      2.2,
      delta,
    );
  });

  // Shade clouds only where opaque terrain has not already filled depth.
  return (
    <mesh ref={meshRef} renderOrder={1000} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
      {!nightmareActive && <RiverRidgeHuts/>}
    </mesh>
  );
}

export function VietnamSkybox({
  seed,
  nightmareActive = false,
}: { seed: number; nightmareActive?: boolean }) {
  return (
    <>
      <SkyDome nightmareActive={nightmareActive} />
      <CombatSectorPerimeter seed={seed} />
    </>
  );
}
