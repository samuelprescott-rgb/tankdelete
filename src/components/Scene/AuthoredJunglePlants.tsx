import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import {bendCrossingTips,shadeDistantTree,useCrossingWeather} from './crossingWeather';
import { PAINTED_LEAF_GLSL } from './jungleGeometry';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { applyFoliageSightline, useFoliageSightline } from './FoliageSightline';

export const AUTHORED_JUNGLE_ASSETS = {
  palm: { model: '/models/yughues-palm-low/palm_tree_lowpoly.obj',
    diffuse: '/models/yughues-palm-low/diffus512.tga', triangles: 451 },
  shrub: { model: '/models/yughues-shrub-05/trop_shrub_05.obj',
    diffuse: '/models/yughues-shrub-05/diffuse.tga', triangles: 608 },
} as const;
export type AuthoredJungleKind = keyof typeof AUTHORED_JUNGLE_ASSETS;
// The source shrub's dark photographic albedo otherwise loses its leaf detail
// under the forest canopy. Neutral material-only calibration, not emissive fill.
export const AUTHORED_SHRUB_ALBEDO_GAIN = 4.0;
export interface AuthoredJunglePlacement {
  x: number; y: number; z: number; sx: number; sy: number; sz: number; rotation: number; tint: number;
}

/** Pick existing safe forest-margin plots, never introduce new plant positions. */
export function selectAuthoredShrubPlacements(placements: readonly AuthoredJunglePlacement[]) {
  const chosen = new Set<AuthoredJunglePlacement>();
  for (const [x, z] of [[-25, -4], [-13, -12], [-12, -21], [14, -12], [-25, 12], [25, 12]]) {
    let nearest: AuthoredJunglePlacement | undefined;
    let bestDistance = 8 ** 2;
    for (const plant of placements) {
      if (chosen.has(plant) || (Math.abs(plant.x) < 18 && plant.z > 8 && plant.z < 54)
        || (Math.abs(plant.x) < 8 && plant.z > -23 && plant.z < 9)) continue;
      const distance = (plant.x - x) ** 2 + (plant.z - z) ** 2;
      if (distance < bestDistance) { nearest = plant; bestDistance = distance; }
    }
    if (nearest) chosen.add(nearest);
  }
  return { selected: [...chosen], remaining: placements.filter(placement => !chosen.has(placement)) };
}

/** Normalize the complete authored silhouette; retain original UVs and normals. */
export function createAuthoredJungleResources(source: THREE.Object3D, texture: THREE.Texture,
  kind: AuthoredJungleKind) {
  const meshes: THREE.Mesh<THREE.BufferGeometry>[] = [];
  source.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh<THREE.BufferGeometry>); });
  if (meshes.length !== 1) throw new Error(`Expected one optional ${kind} asset mesh`);
  const original = meshes[0].geometry;
  const positions = original.getAttribute('position');
  if (!positions || !original.hasAttribute('uv') || !original.hasAttribute('normal')
    || !positions.array.every(Number.isFinite)
    || (original.index?.count ?? positions.count) / 3 !== AUTHORED_JUNGLE_ASSETS[kind].triangles) {
    throw new Error(`Invalid optional ${kind} asset geometry`);
  }
  original.computeBoundingBox();
  const bounds = original.boundingBox!;
  const height = bounds.max.y - bounds.min.y;
  if (!(height > 0)) throw new Error(`Invalid optional ${kind} asset height`);
  const geometry = original.clone();
  geometry.translate(0, -bounds.min.y, 0);
  geometry.scale(1 / height, 1 / height, 1 / height);
  if(kind==='palm'){
    // Re-pose the complete 3D fronds, retaining every original rachis,
    // leaflet, UV and triangle. Leeward leaves stretch and bow, windward
    // blades lift and shorten. The movement grows from a common shoulder
    // and the bare palm stem is untouched.
    const p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const reach=THREE.MathUtils.smoothstep(Math.hypot(x,z),.035,.23)*THREE.MathUtils.smoothstep(y,.57,.77);
      if(!reach)continue;
      const windward=x<0;
      p.setXYZ(i,x*(1+(windward?.06:.38)*reach)+.061*reach,
        y+reach*(windward?.022:-.049)-.013*reach*Math.cos(Math.atan2(z,x)*3),
        z*(1+.13*reach)+.020*reach);
    }
    p.needsUpdate=true;geometry.computeBoundingBox();
    geometry.scale(1,1/geometry.boundingBox!.max.y,1);geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  // TGA's native alpha stays in the diffuse; OBJ uses flipY=true, unlike glTF.
  // Own the configured clone, never dispose the shared loader cache's texture.
  const map = texture.clone();
  map.colorSpace = THREE.SRGBColorSpace; map.flipY = true;
  map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ name: `authored-jungle-${kind}-cc0`,
    map, roughness: 0.99, metalness: 0, alphaTest: 0.5, transparent: false,
    depthWrite: true, side: THREE.DoubleSide, fog: true });
  material.onBeforeCompile = shader => {
    if (kind === 'shrub') shader.uniforms.shrubAlbedoGain = { value: AUTHORED_SHRUB_ALBEDO_GAIN };
    shader.fragmentShader = PAINTED_LEAF_GLSL + (kind === 'shrub' ? 'uniform float shrubAlbedoGain;\n' : '')
      + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        ${kind === 'shrub' ? 'diffuseColor.rgb = min(diffuseColor.rgb * shrubAlbedoGain, vec3(0.85));' : ''}
        diffuseColor.rgb = mix(diffuseColor.rgb, paintedLeafColor(diffuseColor.rgb, 0.0), 0.61);`);
  };
  material.customProgramCacheKey = () => `authored-${kind}-paint-v1`;
  return { geometry, map, material,
    dispose() { geometry.dispose(); material.dispose(); map.dispose(); } };
}

/** Called only while baking static instances; there is no per-frame plant scan. */
export function composeAuthoredJungleMatrix(out: THREE.Matrix4, placement: AuthoredJunglePlacement,
  kind: AuthoredJungleKind) {
  const height = kind === 'palm' ? placement.sy : THREE.MathUtils.clamp(placement.sy * 0.8, 0.62, 0.86);
  const sx = kind === 'palm' ? height * placement.sx / 1.65 : height;
  const sz = kind === 'palm' ? height * placement.sz / 1.65 : height;
  const cosine = Math.cos(placement.rotation), sine = Math.sin(placement.rotation);
  return out.set(cosine * sx, 0, sine * sz, placement.x,
    0, height, 0, placement.y,
    -sine * sx, 0, cosine * sz, placement.z,
    0, 0, 0, 1);
}

interface Props {
  kind: AuthoredJungleKind;
  placements: readonly AuthoredJunglePlacement[];
  fallback: ReactNode;
  /** Non-replaced plants can retain one shared original batch after loading. */
  children?: ReactNode;
}

function LoadedAuthoredJunglePlants({ kind, placements, children }: Props) {
  const weather = useCrossingWeather();
  const sightline = useFoliageSightline();
  const asset = AUTHORED_JUNGLE_ASSETS[kind];
  const object = useLoader(OBJLoader, asset.model);
  const texture = useLoader(TGALoader, asset.diffuse);
  const resources = useMemo(() => {
    const result = createAuthoredJungleResources(object, texture, kind);
    // The game deliberately allows driving through trees. Keep both their
    // crown and trunk from covering the tank when they cross the chase lens.
    if(kind==='palm')shadeDistantTree(bendCrossingTips(result.material,weather,'palm'),weather);
    applyFoliageSightline(result.material, sightline);
    return result;
  }, [object, texture, kind, sightline,weather]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => () => resources.dispose(), [resources]);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const transform = new THREE.Matrix4(), tint = new THREE.Color();
    placements.forEach((placement, index) => {
      mesh.setMatrixAt(index, composeAuthoredJungleMatrix(transform, placement, kind));
      tint.setRGB(placement.tint * 0.98, placement.tint, placement.tint * 0.91);
      mesh.setColorAt(index, tint);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage); mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    if(kind==='palm' && mesh.boundingSphere)mesh.boundingSphere.radius+=.65;
  }, [resources, placements, kind]);
  // Palm tips bend in the color pass; the foliage receives the forest shadows.
  return <group name={`authored-jungle-${kind}`} dispose={null}>
    {children}
    <instancedMesh ref={meshRef} name={`authored-jungle-${kind}-batch`}
      args={[resources.geometry, resources.material, placements.length]} receiveShadow />
  </group>;
}

class JungleAssetBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Failed/pending optional art preserves the exact original scene locally. */
export function AuthoredJunglePlants(props: Props) {
  return <JungleAssetBoundary key={props.kind} fallback={props.fallback}>
    <Suspense fallback={props.fallback}><LoadedAuthoredJunglePlants {...props} /></Suspense>
  </JungleAssetBoundary>;
}
