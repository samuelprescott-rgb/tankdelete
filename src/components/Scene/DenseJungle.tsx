import {bendCrossingTips,shadeDistantTree,useCrossingWeather} from './crossingWeather';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useStore } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainReliefHeight } from '../../lib/terrain';
import { isVillagePlotArea } from '../../lib/layout';
import { coordinateNoise, createDeterministicScatter } from './environmentGeneration';
import { createBridgePlantExclusion, createRiverCrossings, createRiverStations, distanceToRiverWater, isInsideRiverCorridor, sampleRiverStation } from './riverLayout';
import { PhotoFerns } from './PhotoFerns';
import { AuthoredJunglePlants, selectAuthoredShrubPlacements } from './AuthoredJunglePlants';
import { applyFoliageSightline, useFoliageSightline } from './FoliageSightline';
import { BRANCH_SPRAY_URL, configureBranchSpray, createSignalCrownTexture } from './signalCrown';
import { createPaintedBarkMaterial } from './useJungleBark';
import {createStaticInstanceFrustum, STATIC_FOLIAGE_CULL_PRIORITY} from './staticInstanceFrustum';
import { attachJungleCaster } from './jungleShadowFrustum';
import {
  createJungleBroadleafGeometry,
  createJungleBananaGeometry,
  createJungleCrownGeometry,
  createJungleCanopyMaterial,
  createJungleSurfaceLeafMaterial,
  createJungleShrubGeometry,
  createJungleFernGeometry,
  createJungleUnderstoryMaterial,
  createJunglePalmGeometry,
  createJungleTrunkGeometry,
  createJungleVineGeometry,
} from './jungleGeometry';

interface Placement {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotation: number;
  tint: number;
}

interface JungleTree {
  x: number;
  y: number;
  z: number;
  height: number;
  crown: number;
  rotation: number;
  palm: boolean;
  near: boolean;
  sapling: boolean;
  tint: number;
}

export interface JungleClearings {
  seed: number;
  distanceToRoad: (value: number) => number;
  isInsideObjectiveClearing: (x: number, z: number, padding?: number) => boolean;
  isInsidePaddy: (x: number, z: number, padding?: number) => boolean;
  stageRiverBank?: boolean;
  dayLanding?: boolean;
}

interface DenseJungleProps extends JungleClearings {
  /** Optional shared textured bark supplied by the scene's material library. */
  barkMaterial?: THREE.Material;
  canopyMap?: THREE.Texture;
  /** A scene-owned static plan, shared with local ground-cover composition. */
  placements?: ReturnType<typeof createDenseJunglePlacements>;
  authoredShrubs?: ReturnType<typeof selectAuthoredShrubPlacements>;
}

export const jungleGroundHeight = terrainReliefHeight;

function JungleBatch({ placements, geometry, material, castShadow = false }:
  { placements: Placement[]; geometry: THREE.BufferGeometry; material: THREE.Material; castShadow?: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const store = useStore();
  const compactor = useRef<ReturnType<typeof createStaticInstanceFrustum>>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    placements.forEach((placement, index) => {
      dummy.position.set(placement.x, placement.y, placement.z);
      dummy.rotation.set(0, placement.rotation, 0);
      dummy.scale.set(placement.sx, placement.sy, placement.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      tint.setRGB(placement.tint * 0.98, placement.tint, placement.tint * 0.91);
      mesh.setColorAt(index, tint);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    // Include the tiny shader wind displacement in the static culling bounds.
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.3;
    if (castShadow) {
      const caster = createStaticInstanceFrustum(mesh, 'color-and-key-shadow');
      return caster ? attachJungleCaster(store.getState().scene, caster) : undefined;
    }
    compactor.current = createStaticInstanceFrustum(mesh, 'static-jungle');
    return () => { compactor.current?.restore(); compactor.current = null; };
  }, [castShadow, geometry, material, placements, store]);
  useFrame(({camera}) => { compactor.current?.update(camera); }, STATIC_FOLIAGE_CULL_PRIORITY);
  return <instancedMesh ref={meshRef} args={[geometry, material, placements.length]}
    castShadow={castShadow} receiveShadow dispose={null} />;
}

export function createDenseJunglePlacements({ seed, distanceToRoad, isInsideObjectiveClearing, isInsidePaddy,stageRiverBank=true,dayLanding=false }: JungleClearings) {
    const river = createRiverStations(seed);
    const bridge = createRiverCrossings(river).find(crossing => crossing.kind === 'bridge')!;
    const overlapsBridge = createBridgePlantExclusion(river);
    const isCombatPocket = (x: number, z: number) => (
      (Math.abs(x) < 8 && z > -23 && z < 9)
      || (Math.abs(x) < 26 && z > 9 && z < 54)
      || isVillagePlotArea(x, z, 1.3)
      || ((x + 9) ** 2 + (z + 17) ** 2 < 18)
    );
    const canPlace = (x: number, z: number, padding: number) => (
      distanceToRoad(x) >= padding && distanceToRoad(z) >= padding
      && !isCombatPocket(x, z)
      && !isInsideObjectiveClearing(x, z, 1.1)
      && !isInsidePaddy(x, z, 0.7)
      && !isInsideRiverCorridor(x, z, river, 0.8)
    );
    const nearPoints = createDeterministicScatter({
      width: 134, depth: 134, cellSize: 2.85, minDistance: 3.35,
      seed: seed ^ 0x1c6d, maxPoints: 260,
      accept: (x, z) => canPlace(x, z, 1.8),
    });
    // Three overlapping outer layers close the view through the forest. They
    // use cheap leaf silhouettes, while the playable sector gets branched trees.
    const farPoints = createDeterministicScatter({
      width: 182, depth: 182, cellSize: 3.55, minDistance: 3.05,
      seed: seed ^ 0x2e71, maxPoints: 200,
      accept: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > 66
        && !isInsideRiverCorridor(x, z, river, 1.7),
    });
    // A separate age layer fills the empty view beneath mature crowns. It
    // shares the same exclusions and keeps a gap from existing tree bases.
    const saplingPoints = createDeterministicScatter({
      width: 140, depth: 140, cellSize: 2.05, minDistance: 1.65,
      seed: seed ^ 0x3d8a, maxPoints: 220,
      accept: (x, z) => canPlace(x, z, 2.1)
        && nearPoints.every(point => (point.x - x) ** 2 + (point.z - z) ** 2 > 1.4),
    });
    const trees: JungleTree[] = [...nearPoints.map(point => ({ ...point, near: true, sapling: false })),
      ...farPoints.map(point => ({ ...point, near: false, sapling: false })),
      ...saplingPoints.map(point => ({ ...point, near: true, sapling: true }))].map(point => ({
      x: point.x, y: jungleGroundHeight(point.x, point.z), z: point.z,
      height: point.sapling ? 1.8 + coordinateNoise(point.cellX, point.cellZ, seed, 22) * 2.6
        : (point.near ? 4.8 : 9.2) + coordinateNoise(point.cellX, point.cellZ, seed, 22) * (point.near ? 5 : 6.4),
      crown: point.sapling ? 0.65 + coordinateNoise(point.cellX, point.cellZ, seed, 23) * 0.42
        : 1.28 + coordinateNoise(point.cellX, point.cellZ, seed, 23) * (point.near ? 0.7 : 0.9),
      rotation: coordinateNoise(point.cellX, point.cellZ, seed, 25) * Math.PI * 2,
      palm: !point.sapling && coordinateNoise(point.cellX, point.cellZ, seed, 26) > (point.near ? 0.8 : 0.9),
      near: point.near,
      sapling: point.sapling,
      tint: 0.83 + coordinateNoise(point.cellX, point.cellZ, seed, 27) * 0.26,
    }));
    if(stageRiverBank)for(const tree of trees){
      // Root pockets at the public turnout and inside elbow: the survey
      // found a foreground bole 1.5–2.5m from the eye in both live seeds.
      // Replant the whole tree, including later crown, vines and root skirt,
      // AFTER scatter so the rest of the field retains the same random plan.
      if(!tree.near || (((tree.x+19.65)/1.95)**2+((tree.z-5.15)/1.85)**2>1
        && ((tree.x+12.15)/1.10)**2+((tree.z-4.15)/.96)**2>1))continue;
      let replacement: {x:number;z:number}|undefined,best=Infinity;
      for(let dz=-12;dz<=4;dz+=.5)for(let dx=-18;dx<=7;dx+=.5){
        const x=-18+dx,z=-6.2+dz,d=dx*dx+dz*dz;
        if(d>=best||!canPlace(x,z,tree.sapling?2.1:1.8)||Math.hypot(x+10.1,z+.55)<7.7||
          trees.some(other=>other!==tree&&Math.hypot(other.x-x,other.z-z)<(tree.sapling?1.65:3.4)))continue;
        replacement={x,z};best=d;
      }
      if(replacement){tree.x=replacement.x;tree.z=replacement.z;tree.y=jungleGroundHeight(tree.x,tree.z);}
    }
    if(dayLanding)for(const tree of trees){
      if(!tree.near||tree.sapling||tree.palm)continue;
      // Surveyed trees along the campaign lay-by. Lower/narrow only the
      // affected tree; its crown, attached forks and vines stay together.
      if(Math.hypot(tree.x+28.736,tree.z-11.046)<.18){
        tree.height*=.77;tree.crown*=.93;
      }else if(Math.hypot(tree.x+12.138,tree.z+2.533)<.18){
        tree.height*=.63;tree.crown*=.25;
      }else if(Math.hypot(tree.x+29.165,tree.z-3.146)<.18){
        // At the western shoulder the uppermost spray grazed the occupied
        // cabin as Kestrel banked away. Keep the root and branching habit.
        tree.height*=.94;
      }
    }
    const trunk = (tree: JungleTree): Placement => ({
      x: tree.x, y: tree.y, z: tree.z, rotation: tree.rotation,
      sx: tree.crown, sy: tree.height, sz: tree.crown, tint: tree.tint,
    });
    const crown = (tree: JungleTree): Placement => ({
      // Match the curved palm stem's endpoint so the crown never floats.
      x: tree.x + (tree.palm ? Math.cos(tree.rotation) * 0.4 * Math.sin(2.1) * tree.crown : 0),
      y: tree.y + tree.height,
      z: tree.z - (tree.palm ? Math.sin(tree.rotation) * 0.4 * Math.sin(2.1) * tree.crown : 0),
      sx: tree.crown, sy: tree.crown * 0.92, sz: tree.crown,
      rotation: tree.rotation, tint: tree.tint,
    });
    const crownLayers = (tree: JungleTree): Placement[] => {
      const morph = coordinateNoise(Math.round(tree.x * 2), Math.round(tree.z * 2), seed, 257);
      const tilt = coordinateNoise(Math.round(tree.x), Math.round(tree.z), seed, 258);
      if (tree.near && !tree.sapling) {
        // Buttressed spreading hardwood vs. slender upright forest trees:
        // differences live in existing per-tree transforms, so the canopy
        // still draws in the same three batches. Keep a neck of light
        // between a mature tree's raised top and lower, wider fork.
        const spreading=morph>.53;
        return [
          { height: 0.47, reach: 0.85, scale: 0.68 },
          { height: 0.77, reach: 0.56, scale: 1.12 },
          { height: 1.01, reach: 0.18, scale: 1 },
        ].map((tier, layer) => {
          // Seat each tier in the actual woody fork. Three's positive Y
          // rotation takes local +X toward world -Z (not +Z). Reversing it
          // used to strand the tip cluster opposite its supporting branch.
          const branch = [0, 2, 5][layer], fork = branch * 2.39996;
          const lx = .19 * Math.sin(tier.height * 2.1) + Math.cos(fork) * tier.reach;
          const lz = .14 * Math.sin(tier.height * 3.5) + Math.sin(fork) * tier.reach;
          const c = Math.cos(tree.rotation), s = Math.sin(tree.rotation);
          const angle = tree.rotation - fork;
          const scale = tree.crown * tier.scale;
          return { x: tree.x + (c * lx + s * lz) * tree.crown,
            y: tree.y + tree.height * (tier.height + (tilt-.5)*.045) - scale*.05,
            z: tree.z + (-s * lx + c * lz) * tree.crown,
            sx: scale*(spreading?(layer===0?1.14:1.47):.84+morph*.27),
            sy: scale*(spreading?.81+tilt*.13:1.22+tilt*.19),
            sz: scale*(spreading?1.17-.11*tilt:.89+tilt*.13), rotation: angle,
            tint: tree.tint * (0.91 + layer * 0.035) };
        });
      }
      const count = tree.sapling ? 1 : 2;
      const shelf=.5+.5*Math.sin(tree.z*.112+1.6*Math.sin(tree.x*.081+seed%13));
      const wide=!tree.sapling&&shelf>.61&&morph>.46,spire=!tree.sapling&&shelf<.45&&morph<.6;
      return Array.from({ length: count }, (_, layer) => {
        const angle = tree.rotation + layer * 2.39996;
        const top = layer === count - 1;
        const offset = top ? 0.3 : tree.crown * 0.83;
        const scale = tree.crown * (top ? 1 : 1.12);
        return {
          x: tree.x + Math.cos(angle) * offset,
          y: tree.y + tree.height - (tree.sapling ? 0.7 : 1.9)
            + layer * (tree.near ? 1.4 : 1.65),
          z: tree.z + Math.sin(angle) * offset,
          sx: scale*(.91+morph*.46)*(wide&&!top?1.21:spire?.86:1), sy: scale*(tree.sapling ? 1.18 : .86+tilt*.36)*(wide?.72:spire?1.29:1), sz: scale*(1.13-morph*.22)*(wide?1.09:spire?.90:1),
          rotation: angle, tint: tree.tint * (0.95 + layer * 0.025),
        };
      });
    };
    const broadTrees = trees.filter(tree => !tree.palm);
    const palms = trees.filter(tree => tree.palm);
    const vines: Placement[] = [];
    broadTrees.filter(tree => tree.near && !tree.sapling).forEach((tree, treeIndex) => {
      for (let strand = 0; strand < 2; strand += 1) {
        const angle = coordinateNoise(treeIndex, strand, seed, 33) * Math.PI * 2;
        const length = 2.1 + coordinateNoise(treeIndex, strand, seed, 35) * 3.7;
        vines.push({ x: tree.x + Math.cos(angle) * tree.crown * 1.4,
          y: tree.y + tree.height - 0.3, z: tree.z + Math.sin(angle) * tree.crown * 1.4,
          sx: 1, sy: length, sz: 1, rotation: angle, tint: tree.tint });
      }
    });
    const floorPoints = createDeterministicScatter({
      width: 150, depth: 150, cellSize: 1.55, minDistance: 0.82,
      seed: seed ^ 0x6f31, maxPoints: 700,
      accept: (x, z) => distanceToRoad(x) >= 1.55 && distanceToRoad(z) >= 1.55
        && !isInsideObjectiveClearing(x, z, 0.9) && !isInsidePaddy(x, z, 0.5)
        && !isInsideRiverCorridor(x, z, river, 0.65)
        && !(Math.abs(x) < 5 && z > -22 && z < 9),
    });
    const undergrowth = floorPoints.map(point => {
      const scale = 0.85 + coordinateNoise(point.cellX, point.cellZ, seed, 204) * 0.9;
      const village = (Math.abs(point.x) < 26 && point.z > 8 && point.z < 54)
        || isVillagePlotArea(point.x, point.z, 0.8);
      return { x: point.x, y: jungleGroundHeight(point.x, point.z), z: point.z,
        sx: scale, sy: scale * (village ? 0.4 : 0.8 + coordinateNoise(point.cellX, point.cellZ, seed, 206) * 0.7), sz: scale,
        rotation: coordinateNoise(point.cellX, point.cellZ, seed, 205) * Math.PI * 2,
        tint: 0.84 + coordinateNoise(point.cellX, point.cellZ, seed, 207) * 0.27 };
    });
    const rootSkirts: Placement[] = [];
    broadTrees.filter(tree => tree.near && !tree.sapling).forEach((tree, treeIndex) => {
      for (let clump = 0; clump < 3; clump++) {
        const angle = tree.rotation + clump * 2.39996;
        const x = tree.x + Math.cos(angle) * tree.crown * 0.64;
        const z = tree.z + Math.sin(angle) * tree.crown * 0.64;
        if (distanceToRoad(x) < 0.95 || distanceToRoad(z) < 0.95 || isInsidePaddy(x, z, 0.2)) continue;
        const scale = 0.82 + coordinateNoise(treeIndex, clump, seed, 218) * 0.3;
        rootSkirts.push({ x, y: jungleGroundHeight(x, z), z, sx: scale, sy: scale * 0.84,
          sz: scale, rotation: angle, tint: tree.tint * 0.93 });
      }
    });
    const shrubs: Placement[] = [];
    // Photographic fans are dense at several small connected offsets. The
    // offsets vary by cluster, avoiding both a plantation grid and lone weeds.
    [...undergrowth, ...rootSkirts].forEach((anchor, index) => {
      const clumps = index < undergrowth.length ? 2 : 1;
      for (let clump = 0; clump < clumps; clump++) {
        const angle = anchor.rotation + clump * 2.39996;
        const offset = clump === 0 ? 0 : 0.48 + coordinateNoise(index, clump, seed, 225) * 0.45;
        const x = anchor.x + Math.cos(angle) * offset;
        const z = anchor.z + Math.sin(angle) * offset;
        if (distanceToRoad(x) < 1.15 || distanceToRoad(z) < 1.15
          || isInsideObjectiveClearing(x, z, 0.8) || isInsidePaddy(x, z, 0.32)
          || isInsideRiverCorridor(x, z, river, 0.4)) continue;
        const scale = 0.8 + coordinateNoise(index, clump, seed, 226) * 0.54;
        const sightline = (Math.abs(x) < 26 && z > 8 && z < 54)
          || isVillagePlotArea(x, z, 0.8)
          || (Math.abs(x) < 7 && z > -22 && z < 8);
        shrubs.push({ x, y: jungleGroundHeight(x, z), z, rotation: angle,
          sx: scale, sy: scale * (sightline ? 0.36 : 0.66 + coordinateNoise(index, clump, seed, 227) * 0.42),
          sz: scale, tint: anchor.tint });
      }
    });
    // Keep the original forest plan intact. Re-seat existing local plants
    // around the four bridge shoulders, never generate a new forest-wide roll.
    const safeShoulder = (x: number, z: number) => Math.abs(x - bridge.centerX) > bridge.width / 2 + 1.4
      && distanceToRoad(x) >= 1.55 && distanceToRoad(z) >= 1.55
      && !isInsideObjectiveClearing(x, z, .9) && !isInsidePaddy(x, z, .5)
      && !isInsideRiverCorridor(x, z, river, .65) && !isVillagePlotArea(x, z, -.75)
      && !(Math.abs(x) < 5 && z > -22 && z < 9);
    const banks: {x: number; z: number; size: number}[][] = [];
    // A ribbon along the river can be severed by a road or small inlet.
    // Fill one genuinely connected set of six roots before using its fringe.
    const connectedSpine = (sites: typeof banks[number]) => {
      const grow = (root: typeof sites[number], candidates: typeof sites) => {
        const planted = [root];
        while (planted.length < 6) {
          const next = candidates.find(p => !planted.includes(p) &&
            planted.some(q => (p.x-q.x)**2 + (p.z-q.z)**2 < 1.1**2));
          if (!next) break;
          planted.push(next);
        }
        return planted;
      };
      if (grow(sites[0],sites.slice(0,6)).length === 6) return sites;
      for (const root of sites) {
        const spine = grow(root,sites);
        if (spine.length === 6) return [...spine,...sites.filter(p => !spine.includes(p))];
      }
      return [];
    };
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const guideX = bridge.centerX + side * (bridge.width / 2 + 3.8);
      const guideZ = bridge.z + end * bridge.length / 2;
      let best: {x: number; z: number; size: number}[] = [], bestScore = -Infinity;
      // A wide outlet can swallow the whole 8m shoulder search square.
      // Only in that case walk the same dry verge a little farther from the
      // abutment; never relax the water, building or deck exclusions.
      for (const radius of [4, 7]) {
        if (best.length) break;
        for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
          const x = guideX + dx, z = guideZ + dz;
          if ((x - bridge.centerX) * side <= 0 || (z - bridge.z) * end <= 0) continue;
          const tangent = sampleRiverStation(river, z + 1)!.centerX - sampleRiverStation(river, z - 1)!.centerX;
          const length = Math.hypot(tangent, 2), tx = tangent / length, tz = 2 / length;
          const sites: typeof best = [];
          // Build the touching spine first; shorter staggered rows swell its
          // belly and leave small tapered tips, rather than repeated rosettes.
          for (const row of [0, 1, -1]) for (let column = -3 + Math.abs(row); column <= 3 - Math.abs(row); column++) {
            const t = column / 3, along = column * .68 + row * .17;
            const sway = side * .42 * t * t + row * .58 * (1 - .5 * t * t);
            const px = x + tx * along + tz * sway, pz = z + tz * along - tx * sway;
            if (safeShoulder(px, pz)) sites.push({ x: px, z: pz, size: 1.34 - .47 * t * t - .12 * Math.abs(row) });
          }
          const score = sites.length - .39 * Math.hypot(dx, dz) - .50 * Math.abs(distanceToRiverWater(x, z, river) - 2.6);
          if (sites.length >= 6 && score > bestScore) {
            const connected = connectedSpine(sites);
            if (connected.length) { best = connected; bestScore = score; }
          }
        }
      }
      if (best.length) banks.push(best);
    }
    const shoulderSlots = Array.from({length: 17}, (_, i) => banks.flatMap(bank => bank[i] ? [bank[i]] : [])).flat();
    // Maximum swept radii include leaf-tip wind; shrub minimum also bounds its optional OBJ replacement.
    const leafRadius = [1.03, 1.26, .71, 1.96];
    const insideDeck = (p: Placement, layer: number) => overlapsBridge(p.x, p.z,
      Math.max(layer === 0 ? 1 : 0, leafRadius[layer] * Math.max(p.sx, p.sz)));
    const banked = (original: Placement[], layer: number) => {
      const rank = (plant:Placement) => Math.hypot((plant.x-bridge.centerX)/(layer===0?18:15),
        (plant.z-bridge.z)/(bridge.length*.5+(layer===0?16:13)));
      const donors = new Set<number>();
      const spares: {index:number;edge:number}[] = [];
      original.forEach((plant,index)=>{
        const dx=plant.x-bridge.centerX,dz=plant.z-bridge.z,edge=rank(plant);
        const apron=(Math.abs(dx)<3.05&&Math.abs(dz)<bridge.length*.5+5.1)||insideDeck(plant,layer);
        if(apron || (edge<1&&coordinateNoise(index,layer,seed,238)>=THREE.MathUtils.smoothstep(edge,.64,1))) donors.add(index);
        else if(layer===0&&edge<1.32)spares.push({index,edge});
      });
      // Each pocket gets a touching spine before a second row thickens any
      // one pocket. Sparse scatters may need a few more *existing* shrubs
      // from the neighboring dry belt; never mint an instance to fill a quota.
      if(layer===0&&donors.size<banks.length*6){
        spares.sort((a,b)=>a.edge-b.edge);
        for(const p of spares.slice(0,banks.length*6-donors.size))donors.add(p.index);
      }
      let moved = 0;
      return original.flatMap((plant, index) => {
        if(!donors.has(index))return [plant];
        const slot = shoulderSlots[(layer * 13 + moved++) % Math.max(1, shoulderSlots.length)];
        // No extra instances, and no repeated overlay if this seed has few
        // safe sites. Root skirts, remote understorey and ground cover stay put.
        if (!slot || moved > shoulderSlots.length) return [];
        const movedPlant = { ...plant, x: slot.x, y: jungleGroundHeight(slot.x, slot.z), z: slot.z,
          sx: plant.sx * slot.size, sz: plant.sz * slot.size, sy: Math.min(plant.sy, .45) * Math.min(1, slot.size) };
        return insideDeck(movedPlant, layer) ? [] : [movedPlant];
      });
    };
    // Dry bund ends and courtyard margins were left bare by the deliberately
    // wide combat clearing. Choose the nearest legal dry planting pocket at
    // each composed anchor, never put a plant on a house, deck, road or crop.
    const margins: Placement[] = [];
    const plantMargin = (ax:number, az:number, width:number, height:number, yaw:number, palm:boolean) => {
      let x=0,z=0,best=Infinity;
      for(let ix=-6;ix<=6;ix++) for(let iz=-6;iz<=6;iz++){
        const px=ax+ix*.43,pz=az+iz*.43, d=ix*ix+iz*iz;
        if(d>=best || Math.abs(px)<6 || distanceToRoad(px)<1.2 || distanceToRoad(pz)<1.2
          || isInsideObjectiveClearing(px,pz,.8) || isInsidePaddy(px,pz,.10)
          || isVillagePlotArea(px,pz,palm?.85:.48) || isInsideRiverCorridor(px,pz,river,.24)
          || overlapsBridge(px,pz,palm?3.8:width*2.06+.12)) continue;
        x=px;z=pz;best=d;
      }
      if(!Number.isFinite(best))return;
      if(palm){
        palms.push({x,y:jungleGroundHeight(x,z),z,height,crown:width,rotation:yaw,palm:true,near:true,sapling:false,tint:1.02});
      }else{
        margins.push({x,y:jungleGroundHeight(x,z),z,sx:width,sz:width,sy:height,rotation:yaw,tint:.99});
      }
    };
    // These were formerly the edges of a head-on approach. From the
    // playable upstream turnout BOTH fans hid the crosshair and the bents.
    // Keep both mature plantings, now at the southern dry margin.
    plantMargin(stageRiverBank?-18.8:-11.9,stageRiverBank?-11.9:6.7,2.25,2.55,.2,false);
    plantMargin(stageRiverBank?-21.7:-13.9,stageRiverBank?-13.2:5.8,1.20,1.30,2.6,false);
    plantMargin(12.2,7.1,2.05,2.35,1.7,false);
    plantMargin(14.4,6.7,1.15,1.34,.9,false);
    plantMargin(-10.6,19.3,1.48,7.8,2.25,true);
    plantMargin(10.3,22.1,1.68,8.9,.7,true);
    plantMargin(12.4,22.6,1.15,5.6,4.1,true);
    plantMargin(-12.2,30.2,1.32,6.5,2.7,true);
    const bananas=[...banked(undergrowth.filter((_,index)=>index%10!==0&&index%13===0),3),...margins];
    // The wider outlet changes the accepted scatter sequence in campaign:
    // preserve this one displaced fan but move its whole root out of the
    // campaign's settled camera socket, onto the southern dry bank.
    if(stageRiverBank)for(const p of bananas)if(Math.hypot(p.x+13.30,p.z-2.99)<.20){
      const site=[[-18.15,-11.4],[-20.8,-12.2],[-25.7,-10.3],[-26.1,-18.3]].find(([x,z])=>canPlace(x,z,.7));
      if(site){p.x=site[0];p.z=site[1];p.y=jungleGroundHeight(p.x,p.z);}
    }
    return {
      nearTrunks: broadTrees.filter(tree => tree.near && !tree.sapling).map(trunk),
      farTrunks: broadTrees.filter(tree => !tree.near || tree.sapling).map(trunk),
      palmTrunks: palms.map(trunk),
      // Detailed leaf tips sit above a denser, cheaper lower crown. Adding real
      // crown area and more tree bases closes the forest without doubling cost.
      nearCrowns: broadTrees.filter(tree => tree.near && !tree.sapling)
        .flatMap(tree => crownLayers(tree).slice(-1)),
      midCrowns: [...broadTrees.filter(tree => tree.sapling).flatMap(crownLayers),
        ...broadTrees.filter(tree => tree.near && !tree.sapling)
          .flatMap(tree => crownLayers(tree).slice(0, -1))],
      farCrowns: broadTrees.filter(tree => !tree.near && !tree.sapling).flatMap(crownLayers),
      palms: palms.map(crown), vines,
      ferns: banked(undergrowth.filter((_, index) => index % 10 === 0), 1),
      broadleaf: [...banked(undergrowth.filter((_, index) => index % 5 === 0 && index % 10 !== 0), 2),
        ...rootSkirts.filter(plant => !insideDeck(plant, 2))],
      bananas,
      shrubs: banked(shrubs, 0),
    };
}

export function DenseJungle({ seed, distanceToRoad, isInsideObjectiveClearing, isInsidePaddy, barkMaterial, canopyMap,
  placements: suppliedPlacements, authoredShrubs: suppliedAuthoredShrubs }: DenseJungleProps) {
  const sightline = useFoliageSightline();
  const weather=useCrossingWeather();
  const windTime = useMemo(() => ({ value: 0 }), []);
  const canopyTexture = useMemo(() => canopyMap ?? createSignalCrownTexture(), [canopyMap]);
  useEffect(() => () => { if (!canopyMap) canopyTexture.dispose(); }, [canopyMap, canopyTexture]);
  const resources = useMemo(() => ({
    trunk: createJungleTrunkGeometry(),
    farTrunk: createJungleTrunkGeometry(false, 'far'),
    palmTrunk: createJungleTrunkGeometry(true),
    crown: createJungleCrownGeometry(),
    midCrown: createJungleCrownGeometry('mid'),
    farCrown: createJungleCrownGeometry('far'),
    palm: createJunglePalmGeometry(),
    fern: createJungleFernGeometry(),
    broadleaf: createJungleBroadleafGeometry(),
    shrub: createJungleShrubGeometry(),
    banana: createJungleBananaGeometry(),
    vine: createJungleVineGeometry(),
    // Own this configured clone: never modify a caller's shared bark material.
    bark: applyFoliageSightline(shadeDistantTree(createPaintedBarkMaterial(barkMaterial),weather), sightline),
    canopy: applyFoliageSightline(shadeDistantTree(createJungleCanopyMaterial(windTime, canopyTexture),weather), sightline),
    shrubLeaf: applyFoliageSightline(createJungleCanopyMaterial(windTime, canopyTexture), sightline),
    fronds: applyFoliageSightline(shadeDistantTree(bendCrossingTips(createJungleSurfaceLeafMaterial(windTime, canopyTexture, 0.075),weather,'frond'),weather), sightline),
    surfaceLeaf: applyFoliageSightline(createJungleSurfaceLeafMaterial(windTime, canopyTexture, 0.035), sightline),
    understory: applyFoliageSightline(createJungleUnderstoryMaterial(windTime), sightline),
  }), [canopyTexture, windTime, sightline, barkMaterial,weather]);
  useEffect(() => () => {
    Object.values(resources).forEach(resource => resource.dispose());
  }, [resources]);
  useEffect(() => {
    if (canopyMap) return;
    let disposed = false;
    const photographicSpray = new THREE.TextureLoader().load(
      BRANCH_SPRAY_URL,
      texture => {
        if (disposed) return;
        for (const material of [resources.canopy, resources.fronds, resources.surfaceLeaf, resources.shrubLeaf]) {
          material.map = texture;
          material.needsUpdate = true;
        }
      },
    );
    configureBranchSpray(photographicSpray);
    return () => {
      disposed = true;
      for (const material of [resources.canopy, resources.fronds, resources.surfaceLeaf, resources.shrubLeaf]) material.map = canopyTexture;
      photographicSpray.dispose();
    };
  }, [canopyMap, canopyTexture, resources.canopy, resources.fronds, resources.surfaceLeaf, resources.shrubLeaf]);
  useFrame(({ clock }) => { windTime.value = clock.elapsedTime; });
  const placements = useMemo(() => suppliedPlacements ?? createDenseJunglePlacements({
    seed, distanceToRoad, isInsideObjectiveClearing, isInsidePaddy,
  }), [suppliedPlacements, distanceToRoad, isInsideObjectiveClearing, isInsidePaddy, seed]);
  const authoredShrubs = useMemo(() => suppliedAuthoredShrubs ?? selectAuthoredShrubPlacements(placements.shrubs),
    [suppliedAuthoredShrubs, placements]);

  return (
    <group name="layered-jungle">
      <JungleBatch placements={placements.nearTrunks} geometry={resources.trunk} material={resources.bark} castShadow />
      <JungleBatch placements={placements.farTrunks} geometry={resources.farTrunk} material={resources.bark} />
      <AuthoredJunglePlants kind="palm" placements={placements.palmTrunks} fallback={<>
        <JungleBatch placements={placements.palmTrunks} geometry={resources.palmTrunk} material={resources.bark} />
        <JungleBatch placements={placements.palms} geometry={resources.palm} material={resources.fronds} />
      </>} />
      <JungleBatch placements={placements.nearCrowns} geometry={resources.crown} material={resources.canopy} castShadow />
      <JungleBatch placements={placements.midCrowns} geometry={resources.midCrown} material={resources.canopy} />
      <JungleBatch placements={placements.farCrowns} geometry={resources.farCrown} material={resources.canopy} />
      <JungleBatch placements={placements.vines} geometry={resources.vine} material={resources.understory} />
      <JungleBatch placements={placements.ferns} geometry={resources.fern} material={resources.surfaceLeaf} />
      <JungleBatch placements={placements.broadleaf} geometry={resources.broadleaf} material={resources.surfaceLeaf} />
      <JungleBatch placements={placements.bananas} geometry={resources.banana} material={resources.understory} />
      <AuthoredJunglePlants kind="shrub" placements={authoredShrubs.selected} fallback={
        <JungleBatch placements={placements.shrubs} geometry={resources.shrub} material={resources.shrubLeaf} />
      }>
        <JungleBatch placements={authoredShrubs.remaining} geometry={resources.shrub} material={resources.shrubLeaf} />
      </AuthoredJunglePlants>
      <Suspense fallback={null}>
        <PhotoFerns seed={seed} distanceToRoad={distanceToRoad}
          isInsideObjectiveClearing={isInsideObjectiveClearing} isInsidePaddy={isInsidePaddy}
          groundHeight={jungleGroundHeight} />
      </Suspense>
    </group>
  );
}
