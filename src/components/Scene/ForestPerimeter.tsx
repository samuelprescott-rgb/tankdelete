import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_HALF_DEPTH, ARENA_HALF_WIDTH } from '../../lib/arenaBounds';
import { terrainReliefHeight } from '../../lib/terrain';
import { coordinateNoise, createDeterministicScatter } from './environmentGeneration';
import { createJungleCanopyMaterial, createJungleCrownGeometry,
  createJungleTrunkGeometry } from './jungleGeometry';
import { applyFoliageSightline, useFoliageSightline } from './FoliageSightline';
import { createPaintedBarkMaterial, useJungleBark } from './useJungleBark';
import {createStaticInstanceFrustum, STATIC_FOLIAGE_CULL_PRIORITY} from './staticInstanceFrustum';
import { BRANCH_SPRAY_URL, configureBranchSpray, createSignalCrownTexture } from './signalCrown';
import {shadeDistantTree,useCrossingWeather} from './crossingWeather';

interface PerimeterPlacement {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: number;
  tint: number;
}

/** An irregular ecotone, not three parallel hedges around the combat square.
 * The ground already continues 28m beyond the sector; every trunk stays on it.
 * Independent depth/height varies silhouette while low crown pockets conceal
 * the soil edge. These are scenery only; arena and hill collisions are unchanged. */
export function createForestPerimeterPlacements(seed: number) {
  const crowns: PerimeterPlacement[] = [];
  const trunks: PerimeterPlacement[] = [];
  const edge = (x: number, z: number) => Math.max(Math.abs(x) - ARENA_HALF_WIDTH,
    Math.abs(z) - ARENA_HALF_DEPTH);
  const points = createDeterministicScatter({
    width: (ARENA_HALF_WIDTH + 24) * 2, depth: (ARENA_HALF_DEPTH + 24) * 2,
    cellSize: 4.15, minDistance: 3.45, seed: seed ^ 0x19a743, maxPoints: 360,
    accept: (x, z) => {
      const boundary = edge(x, z);
      if (boundary < -2 || boundary > 23) return false;
      // Broad seeded density pockets break continuous walls without an empty
      // straight exit: successive depth layers have independently scattered trees.
      const density = coordinateNoise(Math.floor(x / 15), Math.floor(z / 15), seed, 941);
      return boundary > 5 || coordinateNoise(Math.floor(x * 2), Math.floor(z * 2), seed, 942) < 0.48 + density * 0.35;
    },
  });
  for (const point of points) {
    const n = (channel: number) => coordinateNoise(point.cellX, point.cellZ, seed, channel);
    const depth = edge(point.x, point.z);
    // Mature crowns grow in belts, not an evenly randomized comb. Both the
    // bole and its tier inherit habitat; no billboard geometry or new draw.
    const belt=.5+.5*Math.sin(point.x*.086+Math.sin(point.z*.090+seed%11)*1.8);
    const emergent=belt>.59&&n(957)>.64,fan=belt<.43&&n(958)>.31;
    const height = (4.6 + n(943) * 7.9 + Math.max(0, depth) * 0.065)*(emergent?1.19:fan?.92:1);
    const rotation = n(944) * Math.PI * 2;
    const size = (1.05 + n(945) * .65)*(fan?1.15:1);
    const tint = .742+n(946)*.17+belt*.062;
    const rooted=Math.max(-.07,terrainReliefHeight(point.x,point.z));
    trunks.push({ position: [point.x, rooted, point.z], scale: [0.68 + n(947) * 0.32, height, 0.68 + n(947) * 0.32],
      rotation, tint });
    for (let layer = 0; layer < 2; layer++) {
      const angle = rotation + layer*(2.07+.75*n(956));
      crowns.push({ position: [point.x + Math.cos(angle) * 0.8, rooted+.07+height - 2.7 + layer * 1.45,
        point.z + Math.sin(angle) * 0.8], scale: [size*(fan&&layer===0?1.34:emergent?.82:1),(.98+n(949+layer)*.35)*(fan&&layer===0?.66:emergent?1.28:1),size*(fan?.94:emergent?.84:1)],
      rotation: angle, tint });
    }
    // Uneven low growth closes glimpses of bare ground without a solid berm or
    // opaque card wall. Outer pockets overlap the crown-level gaps above them.
    if (depth > 8 || n(951) < 0.42) {
      const x=point.x+(n(952)-.5)*2,z=point.z+(n(954)-.5)*2;
      crowns.push({ position: [x,Math.max(-.07,terrainReliefHeight(x,z))+.35+n(953)*.48,z], scale: [size * 0.91, 0.8 + n(955) * 0.32, size * 0.91],
      rotation: rotation + 1.7, tint: tint * 0.93 });
    }
  }
  return { crowns, trunks };
}

export function createForestPerimeterResources(time: { value: number }, atlas?: THREE.Texture, barkMaterial?: THREE.MeshStandardMaterial) {
  // Always supply genuine RGBA coverage, including while optional bark loads.
  // Folded edge geometry must never be shown without a leaf mask.
  const texture = atlas ?? createSignalCrownTexture();
  const crown = createJungleCrownGeometry('far');
  const trunk = createJungleTrunkGeometry(false, 'far');
  const canopy = createJungleCanopyMaterial(time, texture, true);
  const bark = createPaintedBarkMaterial(barkMaterial);
  return { crown, trunk, canopy, bark, texture,
    dispose: () => {
      crown.dispose(); trunk.dispose(); canopy.dispose(); bark.dispose();
      if (!atlas) texture.dispose(); // A supplied texture belongs to its caller.
    } };
}

export function ForestPerimeterGeometry({ seed, atlas, barkMaterial }: { seed: number; atlas?: THREE.Texture; barkMaterial?: THREE.MeshStandardMaterial }) {
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const crownCompactor = useRef<ReturnType<typeof createStaticInstanceFrustum>>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const time = useMemo(() => ({ value: 0 }), []);
  const sightline = useFoliageSightline();
  const weather = useCrossingWeather();
  const resources = useMemo(() => {
    const result = createForestPerimeterResources(time, atlas, barkMaterial);
    applyFoliageSightline(shadeDistantTree(result.canopy,weather), sightline);
    applyFoliageSightline(shadeDistantTree(result.bark,weather), sightline);
    return result;
  }, [time, atlas, barkMaterial, sightline,weather]);
  useEffect(() => () => resources.dispose(), [resources]);
  const placements = useMemo(() => createForestPerimeterPlacements(seed), [seed]);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (const [mesh, instances] of [[crownRef.current, placements.crowns],
      [trunkRef.current, placements.trunks]] as const) {
      if (!mesh) continue;
      instances.forEach((instance, index) => {
        dummy.position.set(...instance.position); dummy.rotation.set(0, instance.rotation, 0);
        dummy.scale.set(...instance.scale); dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        mesh.setColorAt(index, color.setRGB(instance.tint * 0.96, instance.tint, instance.tint * 0.92));
      });
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      mesh.boundingBox?.expandByScalar(0.2);
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.2;
    }
    // The cutouts receive no gameplay hits and cast no shadows. Leave trunk
    // and all actor/caster rosters untouched.
    crownCompactor.current = crownRef.current ? createStaticInstanceFrustum(crownRef.current) : null;
    return () => { crownCompactor.current?.restore(); crownCompactor.current = null; };
  }, [placements, resources]);
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });
  useFrame(({camera}) => { crownCompactor.current?.update(camera); }, STATIC_FOLIAGE_CULL_PRIORITY);
  return <group name="layered-sector-perimeter" dispose={null}>
    <instancedMesh name="perimeter-trunks" ref={trunkRef}
      args={[resources.trunk, resources.bark, placements.trunks.length]} />
    <instancedMesh name="perimeter-leaf-cutouts" ref={crownRef}
      args={[resources.crown, resources.canopy, placements.crowns.length]} />
  </group>;
}

function BarkDetailedPerimeter({ seed }: { seed: number }) {
  const barkMaterial = useJungleBark();
  const photo = useLoader(THREE.TextureLoader, BRANCH_SPRAY_URL);
  const atlas = useMemo(() => configureBranchSpray(photo), [photo]);
  return <ForestPerimeterGeometry seed={seed} atlas={atlas} barkMaterial={barkMaterial} />;
}

class PerimeterAtlasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function CombatSectorPerimeter({ seed }: { seed: number }) {
  const fallback = <ForestPerimeterGeometry seed={seed} />;
  return <PerimeterAtlasBoundary fallback={fallback}>
    <Suspense fallback={fallback}><BarkDetailedPerimeter seed={seed} /></Suspense>
  </PerimeterAtlasBoundary>;
}
