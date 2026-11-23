import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { JUNGLE_KEY_LIGHT } from './jungleShadowFrustum';
import { DAY_SUN_RAY } from './crossingSun';
import { CHECKPOINT_FLOOD, CHECKPOINT_LAMPS, checkpointBulb } from './checkpointLamps';

export const DAYLIGHT = Object.freeze({ ambient: 0.13, sky: 1.34, sun: 3.27, fill: 0.38 });
export const NIGHTMARE_LIGHTING = Object.freeze({ ambient: 0.035, sky: 0.36, sun: 0.94, fill: 0.20 });
// The shadows on the tank, the rim on the trees and the painted openings in
// the clouds share world bearings. No extra shadow map for the moon or fill.
const SUN_OFFSET = new THREE.Vector3(...DAY_SUN_RAY).multiplyScalar(50.42);
const MOON_OFFSET = new THREE.Vector3(-16.60, 25.88, -45.58);
const SHADOW_WIDTH = 48;
const SHADOW_RESOLUTION = 2048;

// A projected shutter cuts the same diagonal across coats, foliage and paving.
// Repeating the profile in each colour channel keeps the sodium bulb's hue.
function shutterTexture() {
  const size = 128, data = new Uint8Array(size * size * 4);
  const { shutterSlope, shutterHalfHeight, shutterFeather } = CHECKPOINT_FLOOD;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = 2 * (x + .5) / size - 1, v = 2 * (y + .5) / size - 1;
    const distance = Math.abs(v - shutterSlope*u);
    const transmission = 1 - THREE.MathUtils.smoothstep(distance, shutterHalfHeight-shutterFeather, shutterHalfHeight);
    const i = (y*size+x)*4;
    data[i] = data[i+1] = data[i+2] = Math.round(255*transmission);
    data[i+3] = 255;
  }
  const map = new THREE.DataTexture(data,size,size);
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

function CheckpointLights() {
  const flood = useMemo(() => {
    const lamp = CHECKPOINT_FLOOD;
    const light = new THREE.SpotLight(lamp.color, lamp.intensity, lamp.range, lamp.angle, lamp.penumbra);
    light.map = shutterTexture();
    light.position.fromArray(lamp.position);
    light.target.position.fromArray(lamp.aim);
    const housing = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),
      light.target.position.clone().sub(light.position).normalize());
    return { light, housing };
  }, []);
  useEffect(() => () => { flood.light.map?.dispose(); }, [flood]);
  const spots = useMemo(() => CHECKPOINT_LAMPS.map(lamp => {
    const light = new THREE.SpotLight('#ffb35e', lamp.intensity, 11, .66, .72, 2);
    light.position.set(...checkpointBulb(lamp));
    light.target.position.fromArray(lamp.aim);
    return light;
  }), []);
  return <group name="checkpoint-sodium-lamps">
    <group name="east-post-crosslight">
      <primitive object={flood.light} />
      <primitive object={flood.light.target} />
      <group position={CHECKPOINT_FLOOD.position} quaternion={flood.housing}>
        <mesh position={[0,0,-.14]}><boxGeometry args={[.73,.43,.34]}/><meshStandardMaterial color="#49473b" /></mesh>
        <mesh position={[0,0,.036]}><planeGeometry args={[.59,.30]}/><meshBasicMaterial color={[2.9,1.28,.35]}/></mesh>
      </group>
    </group>
    {spots.map((light, index) => <group key={index}>
      <primitive object={light} />
      <primitive object={light.target} />
    </group>)}
  </group>;
}

interface LightingProps {
  nightmareActive?: boolean;
  tankRef?: React.RefObject<THREE.Group | null>;
  inspectFromCamera?: boolean;
}

export function Lighting({ nightmareActive = false, tankRef, inspectFromCamera = false }: LightingProps) {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const lastShadowAt = useRef(-Infinity);
  const target = useMemo(() => new THREE.Object3D(), []);
  const keyOffset = nightmareActive ? MOON_OFFSET : SUN_OFFSET;
  const shadow = useMemo(() => {
    const forward = keyOffset.clone().normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(forward).normalize();
    return { forward, right, up: forward.clone().cross(right), center: new THREE.Vector3(), subject: new THREE.Vector3() };
  }, [keyOffset]);
  const mix = nightmareActive ? NIGHTMARE_LIGHTING : DAYLIGHT;

  useFrame(({ camera, clock }) => {
    if (!sunRef.current) return;
    const map = sunRef.current.shadow;
    map.autoUpdate = !nightmareActive;
    shadow.subject.copy(inspectFromCamera ? camera.position : tankRef?.current?.position ?? target.position);
    shadow.subject.y = 0;
    // Reuse the moon's depth map between updates. Keep its light and target
    // together until the next capture so a moving tank cannot slide the shadows.
    if (nightmareActive) {
      if (map.map && clock.elapsedTime >= lastShadowAt.current &&
          clock.elapsedTime - lastShadowAt.current < 1 / 24 &&
          shadow.subject.distanceToSquared(shadow.center) < 1) return;
      map.needsUpdate = true;
    }
    lastShadowAt.current = clock.elapsedTime;
    // Local texel-snapped shadows keep contacts crisp while driving. Only this
    // key light casts shadows, independent of the number of plants.
    const texel = SHADOW_WIDTH / SHADOW_RESOLUTION;
    shadow.center.copy(shadow.right)
      .multiplyScalar(Math.round(shadow.subject.dot(shadow.right) / texel) * texel)
      .addScaledVector(shadow.up, Math.round(shadow.subject.dot(shadow.up) / texel) * texel)
      .addScaledVector(shadow.forward, shadow.subject.dot(shadow.forward));
    target.position.copy(shadow.center);
    sunRef.current.position.copy(shadow.center).add(keyOffset);
  });

  return (
    <>
      <primitive object={target} />
      <ambientLight intensity={mix.ambient} color={nightmareActive ? '#bec5d9' : '#c9c7af'} />
      <hemisphereLight args={nightmareActive
        ? ['#a2bbc9', '#484157', mix.sky]
        : ['#cbd4df', '#74604f', mix.sky]} />
      <directionalLight
        name={JUNGLE_KEY_LIGHT}
        userData={{ scheduledMoonShadow: nightmareActive }}
        ref={sunRef}
        target={target}
        position={keyOffset}
        intensity={mix.sun}
        color={nightmareActive ? '#b5d8f2' : '#ffc892'}
        castShadow
        shadow-mapSize-width={SHADOW_RESOLUTION}
        shadow-mapSize-height={SHADOW_RESOLUTION}
        shadow-camera-near={1}
        shadow-camera-far={115}
        shadow-camera-left={-SHADOW_WIDTH / 2}
        shadow-camera-right={SHADOW_WIDTH / 2}
        shadow-camera-top={SHADOW_WIDTH / 2}
        shadow-camera-bottom={-SHADOW_WIDTH / 2}
        shadow-bias={-0.0002}
        shadow-normalBias={0.018}
        shadow-radius={2}
      />
      <directionalLight position={nightmareActive ? [18, 16, 24] : [-22, 15, -28]} intensity={mix.fill} color={nightmareActive ? '#a5bdd3' : '#aacbcc'} />
      {nightmareActive && <CheckpointLights />}
    </>
  );
}
