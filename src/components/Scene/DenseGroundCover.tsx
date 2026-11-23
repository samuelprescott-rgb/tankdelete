import {RotorGust} from './rotorGust';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coordinateNoise } from './environmentGeneration';
import { jungleGroundHeight, type JungleClearings } from './DenseJungle';
import { createBridgePlantExclusion, createRiverStations, isInsideRiverCorridor } from './riverLayout';
import { createPhotoFernPlacements, photoFernGrassHeightScale } from './PhotoFerns';
import type { AuthoredJunglePlacement } from './AuthoredJunglePlants';
import { PAINTED_LEAF_GLSL } from './jungleGeometry';

interface GroundCoverPlanConfig extends JungleClearings {
  /** The six existing shrub replacements from the scene's shared jungle plan. */
  shrubFootprints?: readonly AuthoredJunglePlacement[];
  /** Static, localized wear after scatter; does not replace or reroll a tuft. */
  wornHeight?: (x:number,z:number)=>number;
}

interface GroundCoverProps extends GroundCoverPlanConfig {
  tankRef?: RefObject<THREE.Group | null>;
  /** Optional caller-owned alpha-clump atlas; procedural blades remain a fallback. */
  grassMap?: THREE.Texture;
}

interface GrassPlacement {
  x: number;
  y: number;
  z: number;
  rotation: number;
  width: number;
  height: number;
  tint: number;
}

interface GrassChunk {
  x: number;
  z: number;
  placements: GrassPlacement[];
}

const COVER_EXTENT = 144;
const CHUNK_SIZE = COVER_EXTENT / 3;
const COVER_CAPACITY = 10000;
export const GRASS_LOD_FAR_DISTANCE = 60;
export const GRASS_LOD_NEAR_DISTANCE = 52;

// Half the measured Shrub 05 source width/depth divided by source height.
// Imported plants are normalized to unit height before their .62–.86m scale.
export const AUTHORED_SHRUB_RADIUS_PER_HEIGHT = 193.42320251464844 / 116.57249641418457 / 2;
const SHRUB_GRASS_FLOOR = 0.24;
const SHRUB_GRASS_FEATHER = 0.25;
const SHRUB_GRASS_IRREGULARITY = 0.08;

export function createAuthoredShrubGrassFootprints(placements: readonly AuthoredJunglePlacement[]) {
  return placements.map(placement => ({
    x: placement.x, z: placement.z, rotation: placement.rotation,
    radius: THREE.MathUtils.clamp(placement.sy * 0.8, 0.62, 0.86) * AUTHORED_SHRUB_RADIUS_PER_HEIGHT,
  }));
}

/** Irregular feathered shortening, never removing a clump or making a bald ring. */
export function authoredShrubGrassHeightScale(x: number, z: number,
  footprints: ReturnType<typeof createAuthoredShrubGrassFootprints>) {
  let scale = 1;
  for (const footprint of footprints) {
    const dx = x - footprint.x, dz = z - footprint.z;
    const outer = footprint.radius + SHRUB_GRASS_IRREGULARITY + SHRUB_GRASS_FEATHER;
    if (Math.abs(dx) >= outer || Math.abs(dz) >= outer) continue;
    const angle = Math.atan2(dz, dx) - footprint.rotation;
    const radius = footprint.radius + Math.sin(angle * 3 + footprint.rotation) * 0.05
      + Math.cos(angle * 5 - footprint.rotation * 0.7) * 0.03;
    const t = THREE.MathUtils.clamp((Math.hypot(dx, dz) - radius) / SHRUB_GRASS_FEATHER, 0, 1);
    scale = Math.min(scale, SHRUB_GRASS_FLOOR + (1 - SHRUB_GRASS_FLOOR) * t * t * (3 - 2 * t));
  }
  return scale;
}

export function grassLodReviewEnabled(development: boolean, search: string) {
  return development && new URLSearchParams(search).has('grassLodReview');
}

export function grassChunkDistanceSquared(chunk: Pick<GrassChunk, 'x' | 'z'>, cameraX: number, cameraZ: number) {
  const dx = Math.max(0, Math.abs(cameraX - chunk.x) - CHUNK_SIZE / 2);
  const dz = Math.max(0, Math.abs(cameraZ - chunk.z) - CHUNK_SIZE / 2);
  return dx * dx + dz * dz;
}

export function grassChunkUsesFarGeometry(wasFar: boolean, distanceSquared: number, enabled: boolean) {
  if (!enabled || !Number.isFinite(distanceSquared)) return false;
  return wasFar ? distanceSquared >= GRASS_LOD_NEAR_DISTANCE ** 2
    : distanceSquared > GRASS_LOD_FAR_DISTANCE ** 2;
}

/** Bent painted clumps with a few real blades to retain near-camera depth. */
export function createGroundCoverGeometry(detail: 'near' | 'far' = 'near') {
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const surfaces: number[] = [];
  const base = new THREE.Color('#3b5538');
  const tip = new THREE.Color('#879b51');
  const dry = new THREE.Color('#a3915b');
  const push = (point: THREE.Vector3, color: THREE.Color, u = 0, v = 0, surface = 0) => {
    const index = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    colors.push(color.r, color.g, color.b);
    uvs.push(u, v);
    surfaces.push(surface);
    return index;
  };
  for (let blade = 0; blade < (detail === 'near' ? 3 : 0); blade++) {
    const angle = blade * 2.39996 + coordinateNoise(blade, 0, 1968, 1) * 0.4;
    const radius = Math.sqrt(coordinateNoise(blade, 0, 1968, 2)) * 0.38;
    const side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const origin = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    const height = 0.2 + coordinateNoise(blade, 0, 1968, 3) * 0.3;
    const width = 0.012 + coordinateNoise(blade, 0, 1968, 4) * 0.011;
    const lean = 0.11 + coordinateNoise(blade, 0, 1968, 5) * 0.21;
    const middle = origin.clone().add(new THREE.Vector3(Math.cos(angle) * lean * 0.34,
      height * 0.57, Math.sin(angle) * lean * 0.34));
    const end = origin.clone().add(new THREE.Vector3(Math.cos(angle) * lean,
      height * 0.9, Math.sin(angle) * lean));
    const left = origin.clone().addScaledVector(side, width);
    const right = origin.clone().addScaledVector(side, -width);
    const middleLeft = middle.clone().addScaledVector(side, width * 0.59);
    const middleRight = middle.clone().addScaledVector(side, -width * 0.59);
    const middleColor = base.clone().lerp(tip, 0.56);
    const tipColor = blade % 7 === 0 ? dry : tip;
    const l = push(left, base), mr = push(middleRight, middleColor), r = push(right, base);
    const ml = push(middleLeft, middleColor);
    indices.push(l, mr, r, l, ml, mr);
    // Keep the normal discontinuity where the blade bends to its tip.
    indices.push(push(middleLeft, middleColor), push(end, tipColor), push(middleRight, middleColor));
  }
  const photoTint = new THREE.Color('#ffffff');
  for (let spray = 0; spray < 2; spray++) {
    const angle = spray * 1.83 + 0.27;
    const side = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const forward = new THREE.Vector3(-side.z, 0, side.x);
    const width = spray === 0 ? 0.62 : 0.55;
    const height = spray === 0 ? 0.81 : 0.68;
    // Far cards use the exact near-card endpoints/UVs, omitting only the bent
    // middle row and tiny solid blades that are subpixel beyond an entire chunk.
    const levels = detail === 'near' ? [0, 0.49, 1] : [0, 1];
    const rows = levels.map(t => {
      const center = forward.clone().multiplyScalar(t * t * 0.2 + (spray ? -0.075 : 0.065));
      center.y = t * height;
      return [center.clone().addScaledVector(side, -width), center.clone().addScaledVector(side, width)];
    });
    for (let segment = 0; segment < levels.length - 1; segment++) {
      const v0 = levels[segment];
      const v1 = levels[segment + 1];
      // Each bent card segment is planar. Index its corners locally: adjacent
      // segments retain their original hard fold and texture orientation.
      const l = push(rows[segment][0], photoTint, 0, v0, 1);
      const tr = push(rows[segment + 1][1], photoTint, 1, v1, 1);
      const r = push(rows[segment][1], photoTint, 1, v0, 1);
      const tl = push(rows[segment + 1][0], photoTint, 0, v1, 1);
      indices.push(l, tr, r, l, tl, tr);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('coverSurface', new THREE.Float32BufferAttribute(surfaces, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Stratified terrain carpet; no quadratic Poisson scan for thousands of tufts. */
export function createGroundCoverPlacements({ seed, distanceToRoad, isInsideObjectiveClearing, isInsidePaddy,
  shrubFootprints, wornHeight }: GroundCoverPlanConfig) {
  const river = createRiverStations(seed);
  const overlapsBridge = createBridgePlantExclusion(river);
  const photoFerns = createPhotoFernPlacements({ seed, distanceToRoad, isInsideObjectiveClearing,
    isInsidePaddy, groundHeight: jungleGroundHeight });
  const shrubs = createAuthoredShrubGrassFootprints(shrubFootprints ?? []);
  const candidates: Array<GrassPlacement & { priority: number }> = [];
  const cellSize = 0.74;
  const cells = Math.floor(COVER_EXTENT / cellSize);
  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      const x = -COVER_EXTENT / 2 + (ix + 0.1 + coordinateNoise(ix, iz, seed, 601) * 0.8) * cellSize;
      const z = -COVER_EXTENT / 2 + (iz + 0.1 + coordinateNoise(ix, iz, seed, 602) * 0.8) * cellSize;
      const laneDistance = Math.min(distanceToRoad(x), distanceToRoad(z));
      const inWheelRut = laneDistance >= 0.4 && laneDistance <= 0.88;
      if (inWheelRut || isInsideObjectiveClearing(x, z, 0.65)
        || isInsidePaddy(x, z, -0.06) || isInsideRiverCorridor(x, z, river, -0.25)) continue;
      const noise = coordinateNoise(ix, iz, seed, 603);
      const patch = coordinateNoise(Math.floor(ix / 5), Math.floor(iz / 5), seed, 604);
      const bank = isInsidePaddy(x, z, 1.2) || isInsideRiverCorridor(x, z, river, 1.1);
      const betweenRuts = laneDistance < 0.4;
      if (betweenRuts && noise > 0.34) continue;
      if (!bank && noise > 0.64 + patch * 0.32) continue;
      const inVillage = Math.abs(x) < 18 && z > 8 && z < 54;
      const spawnSightline = Math.abs(x) < 7 && z > -22 && z < 8;
      const low = inVillage || spawnSightline;
      const width = (betweenRuts ? 0.32 : 0.78) + coordinateNoise(ix, iz, seed, 606) * (betweenRuts ? 0.13 : 0.62);
      // .675m rest radius + .052m gust + .43m tank-contact bend (all in instance space).
      if (overlapsBridge(x, z, width * 1.16)) continue;
      candidates.push({
        x, z, y: jungleGroundHeight(x, z) + 0.015,
        rotation: coordinateNoise(ix, iz, seed, 605) * Math.PI * 2,
        width,
        height: (betweenRuts ? 0.14 + noise * 0.16 : low ? 0.26 + noise * 0.27
          : (bank ? 0.8 : 0.48) + patch * (bank ? 0.56 : 0.62))
          * Math.min(photoFernGrassHeightScale(x, z, photoFerns), authoredShrubGrassHeightScale(x, z, shrubs))
          * (wornHeight?.(x,z) ?? 1),
        tint: 0.86 + coordinateNoise(ix, iz, seed, 607) * 0.22,
        // Preserve dense bank fringes before spending the remaining budget on
        // forest-floor clumps. Seeded ranking distributes any cap evenly.
        priority: (bank ? -1 : 0) + coordinateNoise(ix, iz, seed, 608)
          + Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - 45) / 27) * 1.2,
      });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  const chunks: GrassChunk[] = Array.from({ length: 9 }, (_, index) => ({
    x: -COVER_EXTENT / 2 + ((index % 3) + 0.5) * CHUNK_SIZE,
    z: -COVER_EXTENT / 2 + (Math.floor(index / 3) + 0.5) * CHUNK_SIZE,
    placements: [],
  }));
  for (const placement of candidates.slice(0, COVER_CAPACITY)) {
    const cx = Math.min(2, Math.floor((placement.x + COVER_EXTENT / 2) / CHUNK_SIZE));
    const cz = Math.min(2, Math.floor((placement.z + COVER_EXTENT / 2) / CHUNK_SIZE));
    chunks[cz * 3 + cx].placements.push(placement);
  }
  return chunks;
}

export function createGroundCoverMaterial(time: { value: number }, tank: { value: THREE.Vector3 }, grassMap?: THREE.Texture,
  rotor = {value:new THREE.Vector4(0,0,0,0)}) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    side: THREE.DoubleSide, metalness: 0, map: grassMap ?? null, alphaTest: 0.55 });
  material.onBeforeCompile = shader => {
    shader.uniforms.coverTime = time;
    shader.uniforms.coverTank = tank;
    shader.uniforms.rotorGust = rotor;
    shader.vertexShader = `uniform float coverTime;
      uniform vec3 coverTank;
      uniform vec4 rotorGust;
      attribute float coverSurface;
      varying float vCoverSurface;
      varying float vCoverVisibility;
      ${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      vCoverSurface = coverSurface;
      vec4 coverAnchor = vec4(0.0, 0.0, 0.0, 1.0);
      mat4 coverTransform = modelMatrix;
      #ifdef USE_INSTANCING
        coverTransform = modelMatrix * instanceMatrix;
      #endif
      coverAnchor = coverTransform * coverAnchor;
      float coverDistance = length(cameraPosition.xz - coverAnchor.xz);
      float coverRandom = fract(sin(dot(coverAnchor.xz, vec2(12.9898, 78.233))) * 43758.5453);
      vCoverVisibility = 1.0 - smoothstep(43.0 + coverRandom * 9.0, 76.0 + coverRandom * 9.0, coverDistance);
      float coverTip = clamp(position.y / 0.58, 0.0, 1.0);
      float coverPhase = coverTime * 1.1 + coverAnchor.x * 0.37 + coverAnchor.z * 0.29;
      transformed.x += sin(coverPhase + position.y) * coverTip * coverTip * 0.045;
      transformed.z += cos(coverPhase * 0.63) * coverTip * 0.025;
      vec2 coverAway = coverAnchor.xz - coverTank.xz;
      float coverTankDistance = length(coverAway);
      float coverBend = 1.0 - smoothstep(0.65, 2.05, coverTankDistance);
      vec3 coverWorldAway = vec3(coverAway.x, 0.0, coverAway.y) / max(0.05, coverTankDistance);
      vec2 coverLocalAway = vec2(dot(coverWorldAway, normalize(coverTransform[0].xyz)),
        dot(coverWorldAway, normalize(coverTransform[2].xyz)));
      vec2 bendOffset = coverLocalAway * coverBend * coverTip;
      if (rotorGust.z > 0.0) {
        vec2 away = coverAnchor.xz - rotorGust.xy;
        float dist = length(away);
        if (dist < 5.4) {
          vec3 dir = vec3(away.x, 0., away.y) / max(dist, .08);
          vec2 local = vec2(dot(dir,normalize(coverTransform[0].xyz)),dot(dir,normalize(coverTransform[2].xyz)));
          float gust = rotorGust.z * (1. - smoothstep(2.1,5.4,dist))
            * (.80 + .20*sin(2.8*dist - rotorGust.w*4. + coverRandom*1.4));
          // Wind Through Grass bends the blade in proportion to its squared height.
          bendOffset = mix(bendOffset,local*coverTip*coverTip,gust);
          coverBend = max(coverBend,gust);
        }
      }
      transformed.xz += bendOffset * 0.43;
      transformed.y *= (1.0 - coverBend * 0.72) * vCoverVisibility;
    `);
    shader.fragmentShader = PAINTED_LEAF_GLSL + `varying float vCoverVisibility;
      varying float vCoverSurface;
      ${shader.fragmentShader}`.replace('#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\nif (vCoverVisibility < 0.012) discard;')
      .replace('#include <map_fragment>', material.map ? `#ifdef USE_MAP
        vec4 grassTexel = texture2D(map, vMapUv);
        grassTexel.rgb = paintedLeafColor(grassTexel.rgb, (vMapUv.y - 0.45) * 1.6);
        diffuseColor *= mix(vec4(1.0), grassTexel, step(0.5, vCoverSurface));
      #endif` : 'if (vCoverSurface > 0.5) discard;');
  };
  material.customProgramCacheKey = () => `dense-ground-cover-painted-v2-${material.map ? 'atlas' : 'blades'}`;
  return material;
}

/** Keep the nine original draws/LOD regions. Within each immutable buffer,
 * place central cells first: when its outer cells are off screen we can stop
 * the draw at the last intersecting cell, with no compaction or GPU uploads. */
function initializeGrassBatch(mesh: THREE.InstancedMesh, chunk: GrassChunk, geometry: THREE.BufferGeometry) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  // Vertex shader adds .045/.025 wind and up to .43 tank bend to each
  // geometry-local horizontal axis. Height only contracts toward zero.
  const envelope = geometry.boundingBox!.clone();
  envelope.min.x -= .476; envelope.max.x += .476;
  envelope.min.z -= .456; envelope.max.z += .456;
  envelope.min.y = Math.min(0, envelope.min.y) - .001;
  envelope.max.y = Math.max(0, envelope.max.y) + .001;
  const divisions = 8, size = CHUNK_SIZE / divisions;
  const cells = Array.from({ length: divisions * divisions }, (_, i) => {
    const x = chunk.x - CHUNK_SIZE / 2 + (i % divisions + .5) * size;
    const z = chunk.z - CHUNK_SIZE / 2 + (Math.floor(i / divisions) + .5) * size;
    return { order: x*x + z*z, placements: [] as GrassPlacement[], bounds: new THREE.Box3(), end: 0 };
  });
  for (const p of chunk.placements) {
    const x = THREE.MathUtils.clamp(Math.floor((p.x - chunk.x + CHUNK_SIZE / 2) / size), 0, divisions - 1);
    const z = THREE.MathUtils.clamp(Math.floor((p.z - chunk.z + CHUNK_SIZE / 2) / size), 0, divisions - 1);
    cells[z * divisions + x].placements.push(p);
  }
  const occupied = cells.filter(c => c.placements.length).sort((a,b) => a.order - b.order);
  const transform = new THREE.Object3D(), tint = new THREE.Color(), box = new THREE.Box3();
  const fullBounds = new THREE.Box3();
  let slot = 0;
  for (const cell of occupied) {
    for (const p of cell.placements) {
      transform.position.set(p.x, p.y, p.z);
      transform.rotation.set(0, p.rotation, 0);
      transform.scale.set(p.width, p.height, p.width);
      transform.updateMatrix();
      mesh.setMatrixAt(slot, transform.matrix);
      tint.setRGB(p.tint * .98, p.tint, p.tint * .94);
      mesh.setColorAt(slot++, tint);
      cell.bounds.union(box.copy(envelope).applyMatrix4(transform.matrix));
    }
    cell.end = slot;
    fullBounds.union(cell.bounds);
  }
  mesh.count = slot;
  mesh.boundingBox = fullBounds;
  mesh.boundingSphere = fullBounds.getBoundingSphere(new THREE.Sphere());
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // onBeforeRender gets the actual render pass camera *after* world transforms
  // have settled. No attribute updates here: drawElementsInstanced reads count
  // after this callback, and Three skips the GL call for zero instances.
  const ranges = occupied.map(({bounds, end}) => ({bounds, end}));
  const clip = new THREE.Matrix4(), lastClip = new THREE.Matrix4(), frustum = new THREE.Frustum();
  let lastSpace: THREE.Camera['coordinateSystem'] | undefined, lastReversed = false;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    if (camera.coordinateSystem === lastSpace && lastReversed === camera.reversedDepth && clip.equals(lastClip)) return;
    lastClip.copy(clip); lastSpace = camera.coordinateSystem; lastReversed = camera.reversedDepth;
    frustum.setFromProjectionMatrix(clip, lastSpace, lastReversed);
    let n = ranges.length;
    while (n > 0 && !frustum.intersectsBox(ranges[n - 1].bounds)) n--;
    mesh.count = n ? ranges[n - 1].end : 0;
  };
}

export function GroundCoverChunk({ chunk, geometry, farGeometry, material }: {
  chunk: GrassChunk; geometry: THREE.BufferGeometry; farGeometry?: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const farRef = useRef(false);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    farRef.current = false;
    mesh.geometry = geometry;
    mesh.userData.grassLod = 'near';
    initializeGrassBatch(mesh, chunk, geometry);
  }, [chunk, geometry, material]);
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Nine cheap chunk checks, not a per-blade update or matrix-buffer upload.
    const distanceSquared = grassChunkDistanceSquared(chunk, camera.position.x, camera.position.z);
    mesh.visible = distanceSquared < 86 * 86;
    const far = grassChunkUsesFarGeometry(farRef.current, distanceSquared, Boolean(farGeometry && material.map));
    const nextGeometry = far && farGeometry ? farGeometry : geometry;
    if (mesh.geometry !== nextGeometry) {
      // Swapping the property preserves this InstancedMesh and its static GPU
      // matrix/color buffers. Never pass changing LOD geometry to JSX args.
      mesh.geometry = nextGeometry;
      mesh.userData.grassLod = far ? 'far' : 'near';
    }
    farRef.current = far;
    // Static near-geometry bounds contain every far vertex and remain valid;
    // no per-instance bounding-box rebuild is needed when switching detail.
  });
  return <instancedMesh ref={meshRef} name={`ground-cover-chunk-${chunk.x}:${chunk.z}`}
    args={[geometry, material, chunk.placements.length]} receiveShadow dispose={null} />;
}

export function DenseGroundCover({ seed, distanceToRoad, isInsideObjectiveClearing, isInsidePaddy, tankRef, grassMap,
  shrubFootprints, wornHeight }: GroundCoverProps) {
  const lodReview = grassLodReviewEnabled(import.meta.env.DEV,
    typeof window === 'undefined' ? '' : window.location.search);
  const rotor = useContext(RotorGust);
  const time = useMemo(() => ({ value: 0 }), []);
  const tank = useMemo(() => ({ value: new THREE.Vector3(10000, 0, 10000) }), []);
  const resources = useMemo(() => ({
    geometry: createGroundCoverGeometry(),
    farGeometry: lodReview ? createGroundCoverGeometry('far') : undefined,
    material: createGroundCoverMaterial(time, tank, grassMap, rotor ?? undefined),
  }), [grassMap, tank, time, rotor, lodReview]);
  const chunks = useMemo(() => createGroundCoverPlacements({
    seed, distanceToRoad, isInsideObjectiveClearing, isInsidePaddy, shrubFootprints,wornHeight,
  }), [distanceToRoad, isInsideObjectiveClearing, isInsidePaddy, seed, shrubFootprints,wornHeight]);
  useEffect(() => () => {
    resources.geometry.dispose(); resources.farGeometry?.dispose(); resources.material.dispose();
  }, [resources]);
  useEffect(() => {
    if (grassMap) return;
    let disposed = false;
    const texture = new THREE.TextureLoader().load('/images/textures/jungle-grass-clump-v1.png', loaded => {
      if (disposed) return;
      resources.material.map = loaded;
      resources.material.needsUpdate = true;
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    return () => {
      disposed = true;
      resources.material.map = null;
      texture.dispose();
    };
  }, [grassMap, resources.material]);
  useFrame(({ clock }) => {
    time.value = clock.elapsedTime;
    if (tankRef?.current) tankRef.current.getWorldPosition(tank.value);
  });
  return <group name="dense-ground-cover">{chunks.map((chunk, index) => (
    <GroundCoverChunk key={index} chunk={chunk} geometry={resources.geometry}
      farGeometry={resources.farGeometry} material={resources.material} />
  ))}</group>;
}
