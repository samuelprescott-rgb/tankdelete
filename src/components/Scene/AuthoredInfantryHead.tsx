import { Component, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { InfantryRig } from './infantryGeometry';
import { applyPaintedFinish } from './paintedMaterials';

export const AUTHORED_HEAD_PATH = '/models/us-infantry-head/us-male-head.gltf';
export const AUTHORED_HEAD_NEAR_DISTANCE = 5.5;
export const AUTHORED_HEAD_FAR_DISTANCE = 7;
// Neck-local, before the soldier parent's existing 0.72 world conversion.
export const AUTHORED_HEAD_OFFSET: [number, number, number] = [0.01, 0, 0.014];

export function authoredHeadLod(near: boolean, distanceSquared: number) {
  return near ? distanceSquared < AUTHORED_HEAD_FAR_DISTANCE ** 2
    : distanceSquared < AUTHORED_HEAD_NEAR_DISTANCE ** 2;
}

/** Native orbital centers, with iris/pupil following the globe, not floating discs. */
export function createAuthoredInfantryEyes(crew=false) {
  const parts: THREE.BufferGeometry[] = [];
  const sclera = new THREE.Color(crew?'#c4b99f':'#bab8a4'), iris = new THREE.Color(crew?'#43402c':'#494431'), pupil = new THREE.Color('#151916');
  const radius = 0.0118;
  for (const sign of [-1, 1]) {
    const origin = new THREE.Vector3(sign * 0.0293125, 0.14164, -0.115405);
    const globe = new THREE.SphereGeometry(radius, 16, 12);
    globe.scale(1, 0.92, 1); globe.translate(...origin.toArray());
    const colors = new Float32Array(globe.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set(sclera.toArray(), i);
    globe.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(globe.toNonIndexed()); globe.dispose();
    // A crew-only sight line: the rider gazes slightly toward his pintle.
    // A convex forward cap, not a sprite or whole-globe black eye.
    for (const [angle, color, lift] of [[crew?.52:.43, iris, crew?.00018:.000035], [crew?.235:.19, pupil, crew?.00028:.000065]] as const) {
      const xyz: number[] = [], rgb: number[] = [], uv: number[] = [];
      const point = (a: number, theta: number) => new THREE.Vector3(
        Math.sin(a) * Math.cos(theta) * (radius + lift),
        Math.sin(a) * Math.sin(theta) * (radius + lift) * 0.92,
        -Math.cos(a) * (radius + lift)).applyAxisAngle(new THREE.Vector3(0,1,0),crew?-.12:0).add(origin);
      for (let sector = 0; sector < 16; sector++) {
        const a = sector / 16 * Math.PI * 2, b = (sector + 1) / 16 * Math.PI * 2;
        for (const p of [point(0, a), point(angle, b), point(angle, a)]) {
          xyz.push(...p.toArray()); rgb.push(...color.toArray()); uv.push(0, 0);
        }
      }
      const cap = new THREE.BufferGeometry();
      cap.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
      cap.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
      cap.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      cap.computeVertexNormals(); parts.push(cap);
    }
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

const EYE_GEOMETRY = createAuthoredInfantryEyes();
const EYE_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.77, metalness: 0 });

interface Props { rig: InfantryRig; onReady: (ready: boolean) => void }

function LoadedInfantryHead({ rig, onReady }: Props) {
  const gltf = useLoader(GLTFLoader, AUTHORED_HEAD_PATH);
  const meshRef = useRef<THREE.Mesh>(null);
  const runtime = useMemo(() => ({ near: true, nextCheck: 0,
    position: new THREE.Vector3(), camera: new THREE.Vector3() }), []);
  const assets = useMemo(() => {
    const near = gltf.scene.getObjectByName('head-near') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const far = gltf.scene.getObjectByName('head-far') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    if (!near?.isMesh || !far?.isMesh) throw new Error('Authored infantry head LODs are missing');
    const material = near.material.clone();
    material.roughness = 0.96;
    material.metalness = 0;
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nvarying vec3 vHeadPigment;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeadPigment = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        '#include <common>\nvarying vec3 vHeadPigment;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float helmetShade = smoothstep(0.127, 0.168, vHeadPigment.y + vHeadPigment.x * 0.058);
          float warmth = 1.0 - smoothstep(0.018, 0.058, abs(abs(vHeadPigment.x) - 0.047));
          warmth *= 1.0 - smoothstep(0.014, 0.062, abs(vHeadPigment.y - 0.101));
          vec3 skinPigment = mix(vec3(1.05, 0.99, 0.94), vec3(0.67, 0.71, 0.73), helmetShade);
          diffuseColor.rgb *= skinPigment * mix(vec3(1.0), vec3(1.05, 0.93, 0.87), warmth * 0.65);`);
    };
    material.customProgramCacheKey = () => 'painted-infantry-head';
    applyPaintedFinish(material, { scale: 4.4, strength: 0.42, edge: 0.25 });
    return { near: near.geometry, far: far.geometry, material };
  }, [gltf]);
  useLayoutEffect(() => () => assets.material.dispose(), [assets]);
  useLayoutEffect(() => { onReady(true); return () => onReady(false); }, [onReady]);
  useFrame(({ camera, clock }) => {
    if (!meshRef.current || clock.elapsedTime < runtime.nextCheck) return;
    runtime.nextCheck = clock.elapsedTime + 0.2;
    rig.head.getWorldPosition(runtime.position); camera.getWorldPosition(runtime.camera);
    const near = authoredHeadLod(runtime.near, runtime.position.distanceToSquared(runtime.camera));
    if (near !== runtime.near) {
      meshRef.current.geometry = near ? assets.near : assets.far;
      runtime.near = near;
    }
  });
  // The loader owns the shared head geometry and texture. The painted material
  // is a local clone. Parenting to the bone preserves all pose transforms.
  // The painted helmet shadow avoids angular shadow-map edges across small faces.
  return createPortal(<group name="authored-infantry-head" position={AUTHORED_HEAD_OFFSET} dispose={null}>
    <mesh ref={meshRef} geometry={assets.near} material={assets.material} />
    <mesh geometry={EYE_GEOMETRY} material={EYE_MATERIAL} />
  </group>, rig.head);
}

class HeadAssetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Pending or failed optional art leaves the original complete soldier intact. */
export function AuthoredInfantryHead(props: Props) {
  return <HeadAssetBoundary><Suspense fallback={null}><LoadedInfantryHead {...props} /></Suspense></HeadAssetBoundary>;
}
