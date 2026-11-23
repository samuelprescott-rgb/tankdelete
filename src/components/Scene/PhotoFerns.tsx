import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { JungleClearings } from './DenseJungle';
import { coordinateNoise } from './environmentGeneration';
import { createRiverStations, isInsideRiverCorridor } from './riverLayout';
import { PAINTED_LEAF_GLSL } from './jungleGeometry';

export const PHOTO_FERN_MODEL_PATH = '/models/fern-02/fern_02_1k.gltf';
export const PHOTO_FERN_ALPHA_PATH = '/models/fern-02/textures/fern_02_alpha_1k.png';
export const PHOTO_FERN_VARIANTS = { large: 'fern_02_b', compact: 'fern_02_a' } as const;
export const PHOTO_FERN_TRIANGLES = { large: 2384, compact: 784 } as const;

interface PhotoFernProps extends JungleClearings {
  groundHeight: (x: number, z: number) => number;
}

interface FernPlacement {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
}

// Deliberately visible review/drive margins: the near forest bank, wreck edge,
// outer paddy shoulders and spawn's dry rear verge. These are not random plants
// lost in the distant perimeter. All candidates still obey the live exclusions.
const FERN_ANCHORS = [
  { x: -26.1, z: -4.5, variant: 'large' },
  { x: -27.8, z: -3.2, variant: 'compact' },
  { x: -25.8, z: -2.4, variant: 'compact' },
  { x: -29.7, z: -5.3, variant: 'large' },
  { x: -12.4, z: -18.4, variant: 'large' },
  { x: -10.6, z: -20.3, variant: 'compact' },
  { x: -13.3, z: -20.6, variant: 'compact' },
  { x: 13.2, z: -12.5, variant: 'large' },
  { x: 12.8, z: -10.5, variant: 'compact' },
  { x: -13.1, z: -12, variant: 'compact' },
  { x: 3.1, z: -18.3, variant: 'compact' },
  { x: -3.1, z: -18.4, variant: 'compact' },
] as const;

export function createPhotoFernPlacements({ seed, distanceToRoad, isInsideObjectiveClearing,
  isInsidePaddy, groundHeight }: PhotoFernProps) {
  const result: Record<keyof typeof PHOTO_FERN_VARIANTS, FernPlacement[]> = { large: [], compact: [] };
  const river = createRiverStations(seed);
  FERN_ANCHORS.forEach((anchor, index) => {
    const x = anchor.x + (coordinateNoise(index, 0, seed, 930) - 0.5) * 0.3;
    const z = anchor.z + (coordinateNoise(index, 0, seed, 931) - 0.5) * 0.3;
    if (distanceToRoad(x) < 1.7 || distanceToRoad(z) < 1.7
      || isInsideObjectiveClearing(x, z, 1.2) || isInsidePaddy(x, z, 0.8)
      || isInsideRiverCorridor(x, z, river, 0.9)) return;
    result[anchor.variant].push({ x, y: groundHeight(x, z) + 0.006, z,
      rotation: coordinateNoise(index, 0, seed, 932) * Math.PI * 2,
      scale: (anchor.variant === 'large' ? 1.3 : 1.12)
        + coordinateNoise(index, 0, seed, 933) * (anchor.variant === 'large' ? 0.18 : 0.2) });
  });
  return result;
}

/** Static composition: keep a soft ankle-height carpet beneath real fronds. */
export function photoFernGrassHeightScale(x: number, z: number,
  ferns: ReturnType<typeof createPhotoFernPlacements>) {
  let scale = 1;
  for (const variant of ['large', 'compact'] as const) {
    for (const fern of ferns[variant]) {
      const dx = x - fern.x, dz = z - fern.z;
      // Tiny fixed population; avoid trig/distance work outside the footprint.
      if (Math.abs(dx) > 1.2 || Math.abs(dz) > 1.2) continue;
      const angle = Math.atan2(dz, dx) - fern.rotation;
      const radius = (variant === 'large' ? 0.64 : 0.4)
        + Math.sin(angle * 3 + fern.rotation) * 0.055
        + Math.cos(angle * 5 - fern.rotation * 0.7) * 0.035;
      const feather = variant === 'large' ? 0.28 : 0.22;
      const t = THREE.MathUtils.clamp((Math.hypot(dx, dz) - radius) / feather, 0, 1);
      const smooth = t * t * (3 - 2 * t);
      scale = Math.min(scale, 0.2 + 0.8 * smooth);
    }
  }
  return scale;
}

/** Retain the source alpha silhouettes and bring the fronds into the jungle palette. */
export function createPhotoFernMaterial(source: THREE.MeshStandardMaterial,
  alpha: THREE.Texture, time: { value: number }) {
  const material = source.clone();
  material.name = 'photo-fern-cc0';
  material.alphaMap = alpha;
  material.alphaTest = 0.5;
  material.transparent = false;
  material.depthWrite = true;
  material.side = THREE.DoubleSide;
  material.metalness = 0;
  material.roughness = 1;
  material.normalScale.set(0.23, 0.23);
  // Poly Haven's packed ARM map already carries AO in R. Both the authored
  // normal and roughness maps continue to use the original glTF UV orientation.
  material.aoMap = source.roughnessMap;
  material.aoMapIntensity = 0.65;
  material.onBeforeCompile = shader => {
    shader.uniforms.photoFernTime = time;
    shader.vertexShader = `uniform float photoFernTime;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 fernAnchor = vec3(0.0);
        #ifdef USE_INSTANCING
          fernAnchor = instanceMatrix[3].xyz;
        #endif
        float fernTip = smoothstep(0.025, 0.39, position.y);
        float fernWind = photoFernTime * 0.73 + fernAnchor.x * 0.31 + fernAnchor.z * 0.17;
        transformed.x += sin(fernWind + position.z * 2.4) * fernTip * 0.013;
        transformed.z += cos(fernWind * 0.67 + position.x) * fernTip * 0.009;
      `);
    shader.fragmentShader = PAINTED_LEAF_GLSL + shader.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>
       diffuseColor.rgb = mix(diffuseColor.rgb, paintedLeafColor(diffuseColor.rgb, 0.0), 0.72);`);
  };
  material.customProgramCacheKey = () => 'photo-fern-painted-v1';
  return material;
}

export function createPhotoFernAlphaTexture(source: THREE.Texture) {
  const alpha = source.clone();
  alpha.flipY = false;
  alpha.colorSpace = THREE.NoColorSpace;
  alpha.minFilter = THREE.LinearMipmapLinearFilter;
  alpha.magFilter = THREE.LinearFilter;
  alpha.generateMipmaps = true;
  alpha.anisotropy = 4;
  alpha.needsUpdate = true;
  return alpha;
}

function PhotoFernBatch({ geometry, material, placements }: {
  geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; placements: FernPlacement[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    placements.forEach((placement, index) => {
      transform.position.set(placement.x, placement.y, placement.z);
      transform.rotation.set(0, placement.rotation, 0);
      transform.scale.setScalar(placement.scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.03;
  }, [geometry, material, placements]);
  // No shadow casting: the two additional instanced draws must not multiply
  // into the directional shadow pass. Cached glTF geometry stays caller-owned.
  return <instancedMesh ref={meshRef} args={[geometry, material, placements.length]}
    receiveShadow dispose={null} />;
}

export function PhotoFerns(props: PhotoFernProps) {
  const gltf = useLoader(GLTFLoader, PHOTO_FERN_MODEL_PATH);
  const loadedAlpha = useLoader(THREE.TextureLoader, PHOTO_FERN_ALPHA_PATH);
  const time = useMemo(() => ({ value: 0 }), []);
  const meshes = useMemo(() => {
    const large = gltf.scene.getObjectByName(PHOTO_FERN_VARIANTS.large) as
      THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const compact = gltf.scene.getObjectByName(PHOTO_FERN_VARIANTS.compact) as
      THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    if (!large?.isMesh || !compact?.isMesh) throw new Error('Photo fern variants are missing from the local CC0 asset.');
    return { large, compact };
  }, [gltf]);
  const resources = useMemo(() => {
    // TextureLoader defaults to flipY=true, unlike glTF. An owned alpha clone
    // prevents inverted cutouts and avoids mutating/discarding cached textures.
    const alpha = createPhotoFernAlphaTexture(loadedAlpha);
    return { alpha, material: createPhotoFernMaterial(meshes.large.material, alpha, time) };
  }, [loadedAlpha, meshes, time]);
  const placements = useMemo(() => createPhotoFernPlacements(props), [props.seed,
    props.distanceToRoad, props.isInsideObjectiveClearing, props.isInsidePaddy, props.groundHeight]);
  useEffect(() => () => {
    resources.material.dispose();
    resources.alpha.dispose();
  }, [resources]);
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });
  return <group name="photo-ferns-cc0" dispose={null}>
    <PhotoFernBatch geometry={meshes.large.geometry} material={resources.material} placements={placements.large} />
    <PhotoFernBatch geometry={meshes.compact.geometry} material={resources.material} placements={placements.compact} />
  </group>;
}
