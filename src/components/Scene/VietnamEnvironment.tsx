import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROAD_GRID_SPACING } from '../../lib/constants';
import { TERRAIN_MOUNDS } from '../../lib/terrain';
import { coordinateNoise, createDeterministicScatter } from './environmentGeneration';

const DEFAULT_ENVIRONMENT_SEED = 1968;

function finalizeInstanceMatrices(mesh: THREE.InstancedMesh, dynamic = false) {
  mesh.instanceMatrix.setUsage(dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 91.719 + salt * 17.173) * 43758.5453;
  return value - Math.floor(value);
}

function distanceToRoad(value: number) {
  const half = ROAD_GRID_SPACING * 0.5;
  return Math.abs(((value + half) % ROAD_GRID_SPACING + ROAD_GRID_SPACING) % ROAD_GRID_SPACING - half);
}

type PaddyDrainSide = 'north' | 'south' | 'east' | 'west';

interface PaddyField {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  waterLevel: number;
  drainSide: PaddyDrainSide;
  drainOffset: number;
}

// These cells form three readable terrace groups while preserving the road grid
// and all existing gameplay collision data.
const PADDY_FIELDS: PaddyField[] = [
  { x: -6.35, z: -12.15, width: 10.05, depth: 5.55, rotation: -0.036, waterLevel: -0.058, drainSide: 'east', drainOffset: -0.62 },
  { x: 6.2, z: -12.2, width: 9.72, depth: 5.92, rotation: 0.042, waterLevel: -0.052, drainSide: 'west', drainOffset: 0.58 },
  { x: -6.15, z: -4.25, width: 9.42, depth: 5.82, rotation: 0.031, waterLevel: -0.048, drainSide: 'south', drainOffset: 1.05 },
  { x: 6.3, z: -4.1, width: 9.68, depth: 6.08, rotation: -0.04, waterLevel: -0.042, drainSide: 'north', drainOffset: -0.92 },
  { x: -6.1, z: 3.92, width: 9.85, depth: 5.42, rotation: -0.025, waterLevel: -0.037, drainSide: 'east', drainOffset: -0.74 },
  { x: 6.15, z: 4.08, width: 10.02, depth: 5.7, rotation: 0.028, waterLevel: -0.032, drainSide: 'west', drainOffset: 0.82 },
  { x: -20.1, z: 4.25, width: 8.4, depth: 6.32, rotation: 0.075, waterLevel: -0.03, drainSide: 'south', drainOffset: -1.1 },
  { x: 20.05, z: 4.15, width: 8.75, depth: 6.05, rotation: -0.068, waterLevel: -0.026, drainSide: 'north', drainOffset: 1.18 },
];

function paddyLocalToWorld(field: PaddyField, localX: number, localZ: number) {
  const cosine = Math.cos(field.rotation);
  const sine = Math.sin(field.rotation);
  return {
    x: field.x + cosine * localX + sine * localZ,
    z: field.z - sine * localX + cosine * localZ,
  };
}

function isInsidePaddy(x: number, z: number, padding = 0) {
  return PADDY_FIELDS.some(field => {
    const dx = x - field.x;
    const dz = z - field.z;
    const cosine = Math.cos(field.rotation);
    const sine = Math.sin(field.rotation);
    const localX = cosine * dx - sine * dz;
    const localZ = sine * dx + cosine * dz;
    return Math.abs(localX) <= field.width * 0.5 + padding
      && Math.abs(localZ) <= field.depth * 0.5 + padding;
  });
}

function createPaddyOutline(field: PaddyField, index: number): Array<[number, number]> {
  const halfWidth = field.width * 0.5;
  const halfDepth = field.depth * 0.5;
  return [
    [-halfWidth * (0.68 + seeded(index, 301) * 0.12), -halfDepth],
    [halfWidth * 0.04, -halfDepth * (0.92 + seeded(index, 302) * 0.08)],
    [halfWidth * (0.7 + seeded(index, 303) * 0.13), -halfDepth * 0.94],
    [halfWidth, -halfDepth * (0.38 + seeded(index, 304) * 0.12)],
    [halfWidth * (0.88 + seeded(index, 305) * 0.1), halfDepth * 0.16],
    [halfWidth, halfDepth * (0.55 + seeded(index, 306) * 0.14)],
    [halfWidth * (0.58 + seeded(index, 307) * 0.16), halfDepth],
    [-halfWidth * 0.1, halfDepth * (0.88 + seeded(index, 308) * 0.1)],
    [-halfWidth * (0.7 + seeded(index, 309) * 0.14), halfDepth],
    [-halfWidth, halfDepth * (0.42 + seeded(index, 310) * 0.15)],
    [-halfWidth * (0.9 + seeded(index, 311) * 0.08), -halfDepth * 0.08],
    [-halfWidth, -halfDepth * (0.62 + seeded(index, 312) * 0.12)],
  ];
}

function createPaddyShape(field: PaddyField, index: number) {
  const points = createPaddyOutline(field, index);
  const shape = new THREE.Shape();
  points.forEach(([x, z], pointIndex) => {
    if (pointIndex === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  return shape;
}

function isInsideOutline(x: number, z: number, outline: Array<[number, number]>) {
  let inside = false;
  for (let current = 0, previous = outline.length - 1; current < outline.length; previous = current, current += 1) {
    const [currentX, currentZ] = outline[current];
    const [previousX, previousZ] = outline[previous];
    const crosses = (currentZ > z) !== (previousZ > z)
      && x < (previousX - currentX) * (z - currentZ) / (previousZ - currentZ) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function createGrassClumpGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const baseColor = new THREE.Color('#263918');
  const tipColor = new THREE.Color('#82925a');
  const bladeCount = 7;

  const pushVertex = (x: number, y: number, z: number, color: THREE.Color) => {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  };

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = (blade / bladeCount) * Math.PI * 2 + seeded(blade, 70) * 0.5;
    const offsetRadius = blade === 0 ? 0 : 0.14 + seeded(blade, 71) * 0.24;
    const centerX = Math.cos(angle) * offsetRadius;
    const centerZ = Math.sin(angle) * offsetRadius;
    const sideX = Math.cos(angle + Math.PI * 0.5);
    const sideZ = Math.sin(angle + Math.PI * 0.5);
    const width = 0.045 + seeded(blade, 72) * 0.035;
    const height = 0.68 + seeded(blade, 73) * 0.32;
    const lean = 0.12 + seeded(blade, 74) * 0.24;
    const tipX = centerX + Math.cos(angle) * lean;
    const tipZ = centerZ + Math.sin(angle) * lean;

    const leftBase: [number, number, number] = [centerX - sideX * width, 0, centerZ - sideZ * width];
    const rightBase: [number, number, number] = [centerX + sideX * width, 0, centerZ + sideZ * width];
    const rightTip: [number, number, number] = [tipX + sideX * width * 0.12, height, tipZ + sideZ * width * 0.12];
    const leftTip: [number, number, number] = [tipX - sideX * width * 0.12, height, tipZ - sideZ * width * 0.12];

    pushVertex(...leftBase, baseColor);
    pushVertex(...rightBase, baseColor);
    pushVertex(...rightTip, tipColor);
    pushVertex(...leftBase, baseColor);
    pushVertex(...rightTip, tipColor);
    pushVertex(...leftTip, tipColor);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function ElephantGrass({ seed }: { seed: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const grass = useMemo(() => {
    const points = createDeterministicScatter({
      width: 150,
      depth: 150,
      cellSize: 2.5,
      minDistance: 1.7,
      seed: seed ^ 0x45a1,
      maxPoints: 480,
      accept: (x, z) => (
        distanceToRoad(x) >= 2.4
        && distanceToRoad(z) >= 2.4
        && !(Math.abs(x) < 7 && z > -18 && z < 8)
        && !isInsidePaddy(x, z, 0.7)
      ),
    });

    return points.map(point => {
      const height = 0.9 + coordinateNoise(point.cellX, point.cellZ, seed, 11) * 1.3;
      return {
        position: [point.x, -0.03, point.z] as [number, number, number],
        scale: [
          0.95 + coordinateNoise(point.cellX, point.cellZ, seed, 12),
          height,
          0.95 + coordinateNoise(point.cellX, point.cellZ, seed, 13),
        ] as [number, number, number],
        rotation: coordinateNoise(point.cellX, point.cellZ, seed, 14) * Math.PI,
        lean: (coordinateNoise(point.cellX, point.cellZ, seed, 15) - 0.5) * 0.055,
      };
    });
  }, [seed]);
  const grassGeometry = useMemo(() => createGrassClumpGeometry(), []);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    grass.forEach((blade, index) => {
      dummy.position.set(...blade.position);
      dummy.scale.set(...blade.scale);
      dummy.rotation.set(blade.lean, blade.rotation, blade.lean * 0.35);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(meshRef.current);
  }, [dummy, grass]);

  return (
    <instancedMesh ref={meshRef} args={[grassGeometry, undefined, grass.length]} castShadow={false} receiveShadow={false}>
      <meshStandardMaterial
        vertexColors
        side={THREE.DoubleSide}
        emissive="#1f3115"
        emissiveIntensity={0.2}
        roughness={1}
      />
    </instancedMesh>
  );
}

function TerrainRelief() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const rocksRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const ridgeRocks = useMemo(() => TERRAIN_MOUNDS.slice(0, 24).flatMap((mound, moundIndex) => (
    [0, 1].map((rockIndex) => {
      const angle = mound.rotation + (rockIndex === 0 ? 0.75 : -1.05);
      const distance = (rockIndex === 0 ? mound.sx : mound.sz) * (0.38 + seeded(moundIndex, 111 + rockIndex) * 0.2);
      return {
        x: mound.x + Math.cos(angle) * distance,
        y: Math.max(0.03, mound.y + mound.sy * (0.56 + seeded(moundIndex, 115 + rockIndex) * 0.14)),
        z: mound.z + Math.sin(angle) * distance,
        rotation: seeded(moundIndex, 119 + rockIndex) * Math.PI,
        scale: 0.28 + seeded(moundIndex, 123 + rockIndex) * 0.58,
      };
    })
  )), []);

  useLayoutEffect(() => {
    if (!meshRef.current || !rocksRef.current) return;
    TERRAIN_MOUNDS.forEach((mound, index) => {
      dummy.position.set(mound.x, mound.y, mound.z);
      dummy.rotation.set(0, mound.rotation, 0);
      dummy.scale.set(mound.sx, mound.sy, mound.sz);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(meshRef.current);

    ridgeRocks.forEach((rock, index) => {
      dummy.position.set(rock.x, rock.y, rock.z);
      dummy.rotation.set(0.12, rock.rotation, -0.08);
      dummy.scale.set(rock.scale * 1.25, rock.scale * 0.76, rock.scale);
      dummy.updateMatrix();
      rocksRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(rocksRef.current);
  }, [dummy, ridgeRocks]);

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, TERRAIN_MOUNDS.length]} castShadow receiveShadow>
        <sphereGeometry args={[1, 10, 6]} />
        <meshStandardMaterial color="#46573a" emissive="#1e2c1a" emissiveIntensity={0.22} roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={rocksRef} args={[undefined, undefined, ridgeRocks.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#3b4034" roughness={0.94} metalness={0.06} flatShading />
      </instancedMesh>
    </>
  );
}

function GroundPatches({ seed }: { seed: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => [
    new THREE.Color('#53603b'),
    new THREE.Color('#353d27'),
    new THREE.Color('#5a5131'),
    new THREE.Color('#2b432d'),
  ], []);
  const patches = useMemo(() => createDeterministicScatter({
    width: 150,
    depth: 150,
    cellSize: 9.2,
    minDistance: 6.4,
    seed: seed ^ 0x2b17,
    maxPoints: 58,
  }).map(point => ({
    x: point.x,
    z: point.z,
    sx: 2.2 + coordinateNoise(point.cellX, point.cellZ, seed, 92) * 6.5,
    sz: 1.4 + coordinateNoise(point.cellX, point.cellZ, seed, 93) * 4.3,
    rotation: coordinateNoise(point.cellX, point.cellZ, seed, 94) * Math.PI,
    color: Math.floor(coordinateNoise(point.cellX, point.cellZ, seed, 95) * colors.length),
  })), [colors.length, seed]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    patches.forEach((patch, index) => {
      dummy.position.set(patch.x, -0.072, patch.z);
      dummy.rotation.set(-Math.PI / 2, 0, patch.rotation);
      dummy.scale.set(patch.sx, patch.sz, 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
      meshRef.current!.setColorAt(index, colors[patch.color]);
    });
    finalizeInstanceMatrices(meshRef.current);
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [colors, dummy, patches]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, patches.length]}>
      <circleGeometry args={[1, 7]} />
      <meshBasicMaterial vertexColors transparent opacity={0.26} depthWrite={false} />
    </instancedMesh>
  );
}

function createPalmCrownGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const heartColor = new THREE.Color('#56733a');
  const tipColor = new THREE.Color('#243f24');

  const push = (x: number, y: number, z: number, color: THREE.Color) => {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  };

  for (let frond = 0; frond < 10; frond += 1) {
    const angle = (frond / 10) * Math.PI * 2;
    const sideX = Math.cos(angle + Math.PI * 0.5);
    const sideZ = Math.sin(angle + Math.PI * 0.5);
    const midX = Math.cos(angle) * 1.25;
    const midZ = Math.sin(angle) * 1.25;
    const tipX = Math.cos(angle) * (2.5 + (frond % 3) * 0.16);
    const tipZ = Math.sin(angle) * (2.5 + (frond % 3) * 0.16);
    const width = 0.28;

    push(0, 0.08, 0, heartColor);
    push(midX + sideX * width, 0.08, midZ + sideZ * width, heartColor);
    push(tipX, -0.55 - (frond % 2) * 0.12, tipZ, tipColor);
    push(0, 0.08, 0, heartColor);
    push(tipX, -0.55 - (frond % 2) * 0.12, tipZ, tipColor);
    push(midX - sideX * width, 0.08, midZ - sideZ * width, heartColor);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function LayeredJungle({ seed }: { seed: number }) {
  const broadTrunksRef = useRef<THREE.InstancedMesh>(null);
  const broadCanopyRef = useRef<THREE.InstancedMesh>(null);
  const palmTrunksRef = useRef<THREE.InstancedMesh>(null);
  const palmCrownsRef = useRef<THREE.InstancedMesh>(null);
  const windPalmCrownsRef = useRef<THREE.InstancedMesh>(null);
  const vinesRef = useRef<THREE.InstancedMesh>(null);
  const understoryStemsRef = useRef<THREE.InstancedMesh>(null);
  const understoryLeavesRef = useRef<THREE.InstancedMesh>(null);
  const lastWindUpdateRef = useRef(-1);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const palmGeometry = useMemo(() => createPalmCrownGeometry(), []);
  const trees = useMemo(() => {
    const placements: Array<{
      x: number;
      z: number;
      height: number;
      crown: number;
      lean: number;
      rotation: number;
      palm: boolean;
    }> = [];

    // A jittered perimeter supplies a dense horizon without placing hundreds
    // of trees in the active combat corridor.
    const perimeterCount = 96;
    for (let index = 0; index < perimeterCount; index += 1) {
      const angle = (index / perimeterCount) * Math.PI * 2
        + (coordinateNoise(index, 0, seed, 10) - 0.5) * 0.12;
      const radius = 55 + coordinateNoise(index, 0, seed, 11) * 31;
      placements.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        height: 5.8 + coordinateNoise(index, 0, seed, 12) * 8.8,
        crown: 1.05 + coordinateNoise(index, 0, seed, 13) * 0.7,
        lean: (coordinateNoise(index, 0, seed, 14) - 0.5) * 0.12,
        rotation: coordinateNoise(index, 0, seed, 15) * Math.PI,
        palm: coordinateNoise(index, 0, seed, 16) > 0.56,
      });
    }

    const innerTrees = createDeterministicScatter({
      width: 124,
      depth: 116,
      cellSize: 5.15,
      minDistance: 4.35,
      seed: seed ^ 0x1c6d,
      maxPoints: 86,
      accept: (x, z) => (
        distanceToRoad(x) >= 2.45
        && distanceToRoad(z) >= 2.45
        && !(Math.abs(x) < 12 && z > -22 && z < 18)
        && !(Math.abs(x) < 22 && z > 7 && z < 26)
        && !isInsidePaddy(x, z, 1.35)
      ),
    });
    innerTrees.forEach(point => {
      placements.push({
        x: point.x,
        z: point.z,
        height: 4.8 + coordinateNoise(point.cellX, point.cellZ, seed, 22) * 7.5,
        crown: 0.88 + coordinateNoise(point.cellX, point.cellZ, seed, 23) * 0.62,
        lean: (coordinateNoise(point.cellX, point.cellZ, seed, 24) - 0.5) * 0.16,
        rotation: coordinateNoise(point.cellX, point.cellZ, seed, 25) * Math.PI,
        palm: coordinateNoise(point.cellX, point.cellZ, seed, 26) > 0.64,
      });
    });

    return placements;
  }, [seed]);
  const broadleafTrees = useMemo(() => trees.filter(tree => !tree.palm), [trees]);
  const palmTrees = useMemo(() => trees.filter(tree => tree.palm), [trees]);
  const windPalmTrees = useMemo(() => palmTrees.filter((_, index) => index % 9 === 0), [palmTrees]);
  const staticPalmTrees = useMemo(() => palmTrees.filter((_, index) => index % 9 !== 0), [palmTrees]);
  const vineTrees = useMemo(() => broadleafTrees.filter((_, index) => index % 3 === 0), [broadleafTrees]);
  const understory = useMemo(() => {
    return createDeterministicScatter({
      width: 122,
      depth: 108,
      cellSize: 3.75,
      minDistance: 2.75,
      seed: seed ^ 0x6f31,
      maxPoints: 96,
      accept: (x, z) => (
        distanceToRoad(x) >= 2.05
        && distanceToRoad(z) >= 2.05
        && !(Math.abs(x) < 8 && z > -20 && z < 12)
        && !(Math.abs(x) < 22 && z > 7 && z < 26)
        && !isInsidePaddy(x, z, 0.85)
      ),
    }).map(point => ({
      x: point.x,
      z: point.z,
      height: 1.1 + coordinateNoise(point.cellX, point.cellZ, seed, 203) * 1.2,
      scale: 0.34 + coordinateNoise(point.cellX, point.cellZ, seed, 204) * 0.28,
      rotation: coordinateNoise(point.cellX, point.cellZ, seed, 205) * Math.PI,
    }));
  }, [seed]);

  useLayoutEffect(() => {
    if (
      !broadTrunksRef.current
      || !broadCanopyRef.current
      || !palmTrunksRef.current
      || !palmCrownsRef.current
      || !windPalmCrownsRef.current
      || !vinesRef.current
      || !understoryStemsRef.current
      || !understoryLeavesRef.current
    ) return;

    broadleafTrees.forEach((tree, index) => {
      dummy.position.set(tree.x, tree.height * 0.5, tree.z);
      dummy.rotation.set(tree.lean, tree.rotation, tree.lean * 0.55);
      dummy.scale.set(0.34 + tree.crown * 0.08, tree.height, 0.34 + tree.crown * 0.08);
      dummy.updateMatrix();
      broadTrunksRef.current!.setMatrixAt(index, dummy.matrix);

      for (let lobe = 0; lobe < 3; lobe += 1) {
        const lobeIndex = index * 3 + lobe;
        const angle = tree.rotation + lobe * Math.PI * 2 / 3;
        dummy.position.set(
          tree.x + Math.cos(angle) * tree.crown * 0.7,
          tree.height + (lobe === 0 ? tree.crown * 0.55 : 0),
          tree.z + Math.sin(angle) * tree.crown * 0.7,
        );
        dummy.rotation.set(tree.lean * 0.55, angle, -tree.lean * 0.35);
        dummy.scale.set(tree.crown * 1.75, tree.crown * (lobe === 0 ? 1.25 : 1.05), tree.crown * 1.5);
        dummy.updateMatrix();
        broadCanopyRef.current!.setMatrixAt(lobeIndex, dummy.matrix);
      }
    });

    palmTrees.forEach((tree, index) => {
      dummy.position.set(tree.x, tree.height * 0.5, tree.z);
      dummy.rotation.set(tree.lean, tree.rotation, tree.lean * 0.5);
      dummy.scale.set(0.27, tree.height, 0.27);
      dummy.updateMatrix();
      palmTrunksRef.current!.setMatrixAt(index, dummy.matrix);
    });

    staticPalmTrees.forEach((tree, index) => {
      dummy.position.set(tree.x, tree.height, tree.z);
      dummy.rotation.set(tree.lean * 0.7, tree.rotation, -tree.lean * 0.45);
      dummy.scale.set(tree.crown, tree.crown, tree.crown);
      dummy.updateMatrix();
      palmCrownsRef.current!.setMatrixAt(index, dummy.matrix);
    });

    windPalmTrees.forEach((tree, index) => {
      dummy.position.set(tree.x, tree.height, tree.z);
      dummy.rotation.set(tree.lean * 0.7, tree.rotation, -tree.lean * 0.45);
      dummy.scale.set(tree.crown, tree.crown, tree.crown);
      dummy.updateMatrix();
      windPalmCrownsRef.current!.setMatrixAt(index, dummy.matrix);
    });

    vineTrees.forEach((tree, index) => {
      const vineLength = 1.4 + seeded(index, 33) * 2.8;
      dummy.position.set(
        tree.x + (seeded(index, 34) - 0.5) * tree.crown * 1.7,
        tree.height - vineLength * 0.22,
        tree.z + (seeded(index, 35) - 0.5) * tree.crown * 1.7,
      );
      dummy.rotation.set(tree.lean * 0.45, seeded(index, 36) * Math.PI, tree.lean * 0.55);
      dummy.scale.set(0.028, vineLength, 0.028);
      dummy.updateMatrix();
      vinesRef.current!.setMatrixAt(index, dummy.matrix);
    });

    understory.forEach((plant, index) => {
      dummy.position.set(plant.x, plant.height * 0.5, plant.z);
      dummy.rotation.set(0, plant.rotation, 0);
      dummy.scale.set(0.09, plant.height, 0.09);
      dummy.updateMatrix();
      understoryStemsRef.current!.setMatrixAt(index, dummy.matrix);

      dummy.position.set(plant.x, plant.height, plant.z);
      dummy.rotation.set(0.025 * Math.sin(index * 1.7), plant.rotation, 0.018 * Math.cos(index));
      dummy.scale.set(plant.scale, plant.scale * 0.72, plant.scale);
      dummy.updateMatrix();
      understoryLeavesRef.current!.setMatrixAt(index, dummy.matrix);
    });

    finalizeInstanceMatrices(broadTrunksRef.current);
    finalizeInstanceMatrices(broadCanopyRef.current);
    finalizeInstanceMatrices(palmTrunksRef.current);
    finalizeInstanceMatrices(palmCrownsRef.current);
    finalizeInstanceMatrices(windPalmCrownsRef.current, true);
    finalizeInstanceMatrices(vinesRef.current);
    finalizeInstanceMatrices(understoryStemsRef.current);
    finalizeInstanceMatrices(understoryLeavesRef.current);
  }, [broadleafTrees, dummy, palmTrees, staticPalmTrees, understory, vineTrees, windPalmTrees]);

  useFrame(({ clock }) => {
    if (!windPalmCrownsRef.current) return;
    const time = clock.elapsedTime;
    // A small accent set is enough to sell wind. Updating it at 18 Hz avoids
    // uploading every tree matrix on a 60/120 Hz display.
    if (time - lastWindUpdateRef.current < 1 / 18) return;
    lastWindUpdateRef.current = time;
    const sway = Math.sin(time * 0.42) * 0.045;
    windPalmTrees.forEach((tree, index) => {
      dummy.position.set(tree.x, tree.height, tree.z);
      dummy.rotation.set(sway + tree.lean * 0.7, tree.rotation + sway * 0.45, -sway * 0.7);
      dummy.scale.set(tree.crown, tree.crown, tree.crown);
      dummy.updateMatrix();
      windPalmCrownsRef.current!.setMatrixAt(index, dummy.matrix);
    });
    windPalmCrownsRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={broadTrunksRef} args={[undefined, undefined, broadleafTrees.length]} receiveShadow>
        <cylinderGeometry args={[0.28, 0.48, 1, 7]} />
        <meshStandardMaterial color="#463b27" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={broadCanopyRef} args={[undefined, undefined, broadleafTrees.length * 3]} receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#2b522b" emissive="#173119" emissiveIntensity={0.15} roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={palmTrunksRef} args={[undefined, undefined, palmTrees.length]} receiveShadow>
        <cylinderGeometry args={[0.24, 0.42, 1, 8]} />
        <meshStandardMaterial color="#66583a" roughness={0.98} />
      </instancedMesh>
      <instancedMesh ref={palmCrownsRef} args={[palmGeometry, undefined, staticPalmTrees.length]}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.96} />
      </instancedMesh>
      <instancedMesh ref={windPalmCrownsRef} args={[palmGeometry, undefined, windPalmTrees.length]}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.96} />
      </instancedMesh>
      <instancedMesh ref={vinesRef} args={[undefined, undefined, vineTrees.length]}>
        <cylinderGeometry args={[1, 1.25, 1, 5]} />
        <meshStandardMaterial color="#38552c" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={understoryStemsRef} args={[undefined, undefined, understory.length]}>
        <cylinderGeometry args={[0.6, 1, 1, 6]} />
        <meshStandardMaterial color="#50613b" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={understoryLeavesRef} args={[palmGeometry, undefined, understory.length]}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.98} />
      </instancedMesh>
    </>
  );
}

const SMOKE_SOURCES: Array<[number, number, number]> = [
  [-38, 0, 22],
  [34, 0, 45],
  [52, 0, -30],
];

function SmokeColumns() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lastUpdateRef = useRef(-1);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const countPerSource = 10;

  useLayoutEffect(() => {
    if (meshRef.current) meshRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const time = clock.elapsedTime;
    if (time - lastUpdateRef.current < 1 / 24) return;
    lastUpdateRef.current = time;

    SMOKE_SOURCES.forEach((source, sourceIndex) => {
      for (let particleIndex = 0; particleIndex < countPerSource; particleIndex += 1) {
        const index = sourceIndex * countPerSource + particleIndex;
        const phase = (particleIndex / countPerSource + time * (0.035 + sourceIndex * 0.006)) % 1;
        const drift = Math.sin(time * 0.42 + particleIndex * 0.9) * phase * 2.2;
        position.set(
          source[0] + drift + (seeded(index, 30) - 0.5) * phase * 2,
          0.5 + phase * 18,
          source[2] + phase * 3 + (seeded(index, 31) - 0.5) * phase * 1.5,
        );
        const particleScale = 0.35 + phase * 2.8;
        scale.set(particleScale, particleScale * 0.8, particleScale);
        matrix.compose(position, quaternion, scale);
        meshRef.current!.setMatrixAt(index, matrix);
      }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SMOKE_SOURCES.length * countPerSource]} frustumCulled={false}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#403e31" transparent opacity={0.22} depthWrite={false} roughness={1} />
    </instancedMesh>
  );
}

function FieldFortifications() {
  const sandbags = useMemo(() => [-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8], []);
  const barrelPositions = useMemo<Array<[number, number, number]>>(() => [
    [-9, 0.08, -3],
    [9.6, 0.08, -1],
    [-11, 0.08, 6],
  ], []);
  const sandbagsRef = useRef<THREE.InstancedMesh>(null);
  const cratesRef = useRef<THREE.InstancedMesh>(null);
  const barrelsRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const barrelColors = useMemo(() => [
    new THREE.Color('#495432'),
    new THREE.Color('#6f3f24'),
    new THREE.Color('#495432'),
  ], []);

  useLayoutEffect(() => {
    if (!sandbagsRef.current || !cratesRef.current || !barrelsRef.current) return;

    sandbags.forEach((x, index) => {
      dummy.position.set(x, index % 2 === 0 ? 0 : 0.18, 0);
      dummy.rotation.set(0, (index % 3 - 1) * 0.06, 0);
      dummy.scale.set(0.54, 0.22, 0.34);
      dummy.updateMatrix();
      sandbagsRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(sandbagsRef.current);

    [[0, 0, 0], [0.7, 0, 0], [0.35, 0.7, 0]].forEach((position, index) => {
      dummy.position.set(position[0], position[1], position[2]);
      dummy.rotation.set(0, index * 0.08, 0);
      dummy.scale.setScalar(0.62);
      dummy.updateMatrix();
      cratesRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(cratesRef.current);

    barrelsRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    barrelColors.forEach((color, index) => {
      dummy.position.set(...barrelPositions[index]);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.scale.set(0.32, 0.38, 0.32);
      dummy.updateMatrix();
      barrelsRef.current!.setMatrixAt(index, dummy.matrix);
      barrelsRef.current!.setColorAt(index, color);
    });
    finalizeInstanceMatrices(barrelsRef.current);
    if (barrelsRef.current.instanceColor) barrelsRef.current.instanceColor.needsUpdate = true;
  }, [barrelColors, barrelPositions, dummy, sandbags]);

  return (
    <>
      <group position={[-7.4, 0.12, -8]} rotation={[0, 0.28, 0]}>
        <instancedMesh ref={sandbagsRef} args={[undefined, undefined, sandbags.length]} receiveShadow>
          <sphereGeometry args={[1, 7, 4]} />
          <meshStandardMaterial color="#77704a" roughness={1} flatShading />
        </instancedMesh>
      </group>
      <group position={[7.8, 0.22, -6.7]} rotation={[0, -0.24, 0]}>
        <instancedMesh ref={cratesRef} args={[undefined, undefined, 3]} receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#5f5936" roughness={0.9} />
        </instancedMesh>
      </group>
      <instancedMesh ref={barrelsRef} args={[undefined, undefined, barrelPositions.length]} receiveShadow>
        <cylinderGeometry args={[1, 1, 2, 10]} />
        <meshStandardMaterial vertexColors color="#ffffff" metalness={0.35} roughness={0.72} />
      </instancedMesh>
    </>
  );
}

interface HueyAirframeProps {
  mainRotorRef?: RefObject<THREE.Group | null>;
  tailRotorRef?: RefObject<THREE.Group | null>;
  wrecked?: boolean;
}

/** A low-poly UH-1 silhouette shared by the airborne formation and the wreck. */
function HueyAirframe({ mainRotorRef, tailRotorRef, wrecked = false }: HueyAirframeProps) {
  const olive = wrecked ? '#3b3c27' : '#39462f';
  const shadowOlive = wrecked ? '#24251a' : '#263321';

  return (
    <group>
      <mesh scale={[1.02, 0.8, 1.42]}>
        <sphereGeometry args={[1, 10, 7]} />
        <meshStandardMaterial
          color={olive}
          emissive={wrecked ? '#100d08' : '#11190d'}
          emissiveIntensity={wrecked ? 0.04 : 0.2}
          roughness={0.88}
          metalness={0.14}
          flatShading
        />
      </mesh>

      {/* The broad divided windscreen is what makes the tiny silhouette read as a Huey. */}
      <mesh position={[0, 0.19, -1.05]} scale={[0.88, 0.56, 0.54]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial
          color={wrecked ? '#171b17' : '#60736b'}
          emissive={wrecked ? '#080807' : '#15251f'}
          emissiveIntensity={wrecked ? 0.02 : 0.26}
          metalness={0.56}
          roughness={0.23}
        />
      </mesh>
      <mesh position={[0, 0.25, -1.58]} scale={[0.045, 0.48, 0.1]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={shadowOlive} roughness={0.86} />
      </mesh>

      {/* Open troop-bay doors keep the fuselage from reading as a generic bubble aircraft. */}
      {[-1, 1].map(side => (
        <group key={side} position={[side * 0.98, -0.03, 0.42]}>
          <mesh scale={[0.055, 0.57, 0.72]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#111811" roughness={0.96} />
          </mesh>
          <mesh position={[side * 0.035, 0.51, 0]} scale={[0.08, 0.08, 0.76]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={shadowOlive} roughness={0.92} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 0.12, 3.08]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.34, 4.42, 6]} />
        <meshStandardMaterial color={olive} roughness={0.9} metalness={0.12} flatShading />
      </mesh>
      <mesh position={[0, 0.64, 5.02]} scale={[0.1, 0.88, 0.68]} rotation={[0.08, 0, -0.08]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={shadowOlive} roughness={0.94} />
      </mesh>

      <mesh position={[0, 0.92, 0]} scale={[0.12, 0.5, 0.12]}>
        <cylinderGeometry args={[1, 1.18, 1, 7]} />
        <meshStandardMaterial color="#1c2119" metalness={0.5} roughness={0.55} />
      </mesh>

      {wrecked ? (
        <>
          <group position={[0, 1.2, 0.08]} rotation={[0, 0.44, 0.08]}>
            <mesh position={[-1.75, 0, 0]} scale={[3.5, 0.045, 0.12]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#25271d" roughness={0.93} />
            </mesh>
            <mesh position={[1.1, -0.16, 0]} scale={[1.55, 0.045, 0.12]} rotation={[0, 0, -0.1]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#25271d" roughness={0.93} />
            </mesh>
          </group>
          <mesh position={[0.93, 0.26, -0.38]} scale={[0.08, 0.38, 0.48]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#0d0c09" roughness={1} />
          </mesh>
          <mesh position={[-0.58, 0.57, 1.1]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.33, 0.07, 5, 9]} />
            <meshStandardMaterial color="#15130d" roughness={1} />
          </mesh>
        </>
      ) : (
        <group ref={mainRotorRef} position={[0, 1.29, 0]}>
          <mesh scale={[6.8, 0.028, 0.105]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#5b6250" transparent opacity={0.54} depthWrite={false} />
          </mesh>
          <mesh scale={[0.105, 0.028, 6.8]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#5b6250" transparent opacity={0.54} depthWrite={false} />
          </mesh>
        </group>
      )}

      {!wrecked && (
        <group ref={tailRotorRef} position={[0.12, 0.62, 5.15]}>
          <mesh scale={[1.05, 0.06, 0.045]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#737867" />
          </mesh>
          <mesh scale={[0.06, 1.05, 0.045]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#737867" />
          </mesh>
        </group>
      )}

      {[-0.76, 0.76].map(side => (
        <group key={side} position={[side, -0.75, 0.02]}>
          <mesh scale={[0.055, 0.72, 0.055]} rotation={[0, 0, side > 0 ? -0.24 : 0.24]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#171c14" metalness={0.34} roughness={0.68} />
          </mesh>
          <mesh position={[0, -0.34, 0.08]} scale={[0.075, 0.065, 1.78]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#171c14" metalness={0.34} roughness={0.68} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

interface FlyoverConfig {
  altitude: number;
  direction: 1 | -1;
  phase: number;
  scale: number;
  speed: number;
  z: number;
}

const DISTANT_FLYOVERS: FlyoverConfig[] = [
  { altitude: 17.5, direction: 1, phase: 0.08, scale: 0.5, speed: 0.014, z: 48 },
  { altitude: 17.8, direction: -1, phase: 0.61, scale: 0.43, speed: 0.011, z: 46 },
];

/** Minimal silhouette for distant aircraft: eight meshes instead of the
 * detailed wreck airframe's eighteen-plus. At this scale the strong cabin,
 * boom, rotor, and skid shapes carry the read more effectively than detail. */
function DistantHueyAirframe({
  mainRotorRef,
  tailRotorRef,
}: Pick<HueyAirframeProps, 'mainRotorRef' | 'tailRotorRef'>) {
  return (
    <group>
      <mesh scale={[1.02, 0.78, 1.42]}>
        <sphereGeometry args={[1, 8, 5]} />
        <meshStandardMaterial color="#39462f" emissive="#162011" emissiveIntensity={0.22} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.18, -1.04]} scale={[0.86, 0.54, 0.5]}>
        <sphereGeometry args={[1, 7, 4]} />
        <meshStandardMaterial color="#60736b" emissive="#15251f" emissiveIntensity={0.28} metalness={0.45} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.1, 3.06]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.33, 4.38, 5]} />
        <meshStandardMaterial color="#34412c" roughness={0.92} flatShading />
      </mesh>
      <mesh position={[0, 0.61, 5.02]} scale={[0.1, 0.85, 0.66]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#263321" roughness={0.94} />
      </mesh>
      <group ref={mainRotorRef} position={[0, 1.28, 0]}>
        <mesh scale={[6.9, 0.03, 0.12]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#717867" transparent opacity={0.56} depthWrite={false} />
        </mesh>
      </group>
      <group ref={tailRotorRef} position={[0.12, 0.62, 5.14]}>
        <mesh scale={[1.14, 0.065, 0.05]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#858a79" />
        </mesh>
      </group>
      {[-0.72, 0.72].map(side => (
        <mesh key={side} position={[side, -0.88, 0.12]} scale={[0.07, 0.07, 1.72]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#171c14" roughness={0.76} />
        </mesh>
      ))}
    </group>
  );
}

function FlyingHuey({ config, index }: { config: FlyoverConfig; index: number }) {
  const helicopterRef = useRef<THREE.Group>(null);
  const mainRotorRef = useRef<THREE.Group>(null);
  const tailRotorRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!helicopterRef.current || !mainRotorRef.current || !tailRotorRef.current) return;
    const time = clock.elapsedTime;
    const progress = (time * config.speed + config.phase) % 1;
    const corridorX = THREE.MathUtils.lerp(-82, 82, config.direction === 1 ? progress : 1 - progress);
    const rotorBeat = time * (22 + index * 1.7);

    helicopterRef.current.position.set(
      corridorX,
      config.altitude + Math.sin(time * 0.24 + index * 1.8) * 0.55,
      config.z + Math.sin(time * 0.1 + index) * 1.8,
    );
    helicopterRef.current.rotation.y = config.direction === 1 ? -Math.PI * 0.5 : Math.PI * 0.5;
    helicopterRef.current.rotation.z = Math.sin(time * 0.18 + index * 1.3) * 0.035 - config.direction * 0.025;
    mainRotorRef.current.rotation.y = rotorBeat;
    tailRotorRef.current.rotation.z = rotorBeat * 1.82;
  });

  return (
    <group ref={helicopterRef} scale={config.scale}>
      <DistantHueyAirframe mainRotorRef={mainRotorRef} tailRotorRef={tailRotorRef} />
    </group>
  );
}

function DistantHelicopterFormation() {
  return (
    <>
      {DISTANT_FLYOVERS.map((config, index) => (
        <FlyingHuey key={`${config.z}-${config.phase}`} config={config} index={index} />
      ))}
    </>
  );
}

const WRECK_BUSHES = [
  [-3.1, -1.4, 1.25],
  [-2.2, -1.9, 1.05],
  [-1.1, -1.8, 1.42],
  [0.5, -1.85, 1.18],
  [2.05, -1.55, 1.38],
  [3.45, -0.9, 1.08],
  [3.65, 1.2, 1.32],
  [-3.35, 1.15, 1.18],
  [-1.65, 0.05, 0.84],
  [1.25, 0.3, 0.92],
  [-0.45, 3.05, 1.14],
  [0.55, 4.15, 1.06],
] as const;

const WRECK_VINES = [
  [-0.82, 0.22, 1.45, 0.92],
  [0.66, 0.48, 1.1, 0.74],
  [-0.18, 2.45, 1.25, 1.08],
  [0.35, 3.5, 0.92, 0.78],
] as const;

function CrashedHuey() {
  const debrisRef = useRef<THREE.InstancedMesh>(null);
  const bushesRef = useRef<THREE.InstancedMesh>(null);
  const vineStemsRef = useRef<THREE.InstancedMesh>(null);
  const vineLeavesRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bushColors = useMemo(() => [
    new THREE.Color('#2f572e'),
    new THREE.Color('#3d6836'),
    new THREE.Color('#315a30'),
  ], []);
  const debris = useMemo(() => [
    [-2.4, 0.12, 2.45, 0.22],
    [2.9, 0.16, 1.75, -0.5],
    [4.3, 0.11, 0.15, 0.78],
  ] as const, []);

  useLayoutEffect(() => {
    if (!debrisRef.current || !bushesRef.current || !vineStemsRef.current || !vineLeavesRef.current) return;

    debris.forEach(([x, y, z, rotation], index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.scale.set(0.38 + index * 0.025, 0.13, 0.26 + index * 0.02);
      dummy.updateMatrix();
      debrisRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(debrisRef.current);

    WRECK_BUSHES.forEach(([x, z, size], bushIndex) => {
      const groupRotation = seeded(bushIndex, 840) * Math.PI;
      const cosine = Math.cos(groupRotation);
      const sine = Math.sin(groupRotation);
      [-0.42, 0, 0.42].forEach((offset, stemIndex) => {
        const index = bushIndex * 3 + stemIndex;
        const localX = offset * size;
        const localZ = (stemIndex - 1) * 0.2;
        dummy.position.set(
          x + cosine * localX + sine * localZ,
          size * (0.42 + stemIndex * 0.08),
          z - sine * localX + cosine * localZ,
        );
        dummy.rotation.set(0.08, groupRotation + stemIndex * 1.7, offset * 0.16);
        dummy.scale.set(size * 0.67, size * (0.58 + stemIndex * 0.08), size * 0.58);
        dummy.updateMatrix();
        bushesRef.current!.setMatrixAt(index, dummy.matrix);
        bushesRef.current!.setColorAt(index, bushColors[stemIndex]);
      });
    });
    finalizeInstanceMatrices(bushesRef.current);
    if (bushesRef.current.instanceColor) bushesRef.current.instanceColor.needsUpdate = true;

    WRECK_VINES.forEach(([x, z, height, lean], vineIndex) => {
      dummy.position.set(x, 0.08 + height * 0.5, z);
      dummy.rotation.set(lean * 0.16, vineIndex * 1.3, lean * 0.12);
      dummy.scale.set(0.035, height, 0.035);
      dummy.updateMatrix();
      vineStemsRef.current!.setMatrixAt(vineIndex, dummy.matrix);

      [0.36, 0.7, 0.94].forEach((progress, leafIndex) => {
        const index = vineIndex * 3 + leafIndex;
        dummy.position.set(x + (leafIndex % 2 === 0 ? 0.15 : -0.15), 0.08 + height * progress, z);
        dummy.rotation.set(0, vineIndex * 1.3 + leafIndex * 1.7, leafIndex % 2 === 0 ? -0.6 : 0.6);
        dummy.scale.set(0.25, 0.09, 0.13);
        dummy.updateMatrix();
        vineLeavesRef.current!.setMatrixAt(index, dummy.matrix);
      });
    });
    finalizeInstanceMatrices(vineStemsRef.current);
    finalizeInstanceMatrices(vineLeavesRef.current);
  }, [bushColors, debris, dummy]);

  return (
    <group position={[13.2, 0, 33.4]} rotation={[0, -0.5, 0]}>
      <mesh position={[0.2, -0.045, 0.1]} rotation={[-Math.PI / 2, 0, 0]} scale={[4.7, 2.15, 1]} receiveShadow>
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial color="#15130e" transparent opacity={0.52} depthWrite={false} />
      </mesh>

      <group position={[0, 0.95, 0]} rotation={[-0.09, 0.18, -0.27]} scale={0.78}>
        <HueyAirframe wrecked />
      </group>

      {/* A blade and door torn clear of the airframe make the damage readable at tank speed. */}
      <mesh position={[-3.85, 0.12, 1.85]} rotation={[0.09, -0.42, -0.05]} scale={[3.2, 0.045, 0.13]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#27281d" roughness={0.96} />
      </mesh>
      <mesh position={[2.25, 0.2, -1.75]} rotation={[0.04, 0.7, 0.12]} scale={[0.78, 0.08, 0.72]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#303424" roughness={0.94} metalness={0.12} />
      </mesh>
      <instancedMesh ref={debrisRef} args={[undefined, undefined, debris.length]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#343526" roughness={1} flatShading />
      </instancedMesh>

      <instancedMesh ref={bushesRef} args={[undefined, undefined, WRECK_BUSHES.length * 3]} receiveShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          vertexColors
          color="#ffffff"
          emissive="#173318"
          emissiveIntensity={0.13}
          roughness={1}
          flatShading
        />
      </instancedMesh>

      {/* Creepers crossing the cabin and tail sell that the wreck has been reclaimed by jungle. */}
      <instancedMesh ref={vineStemsRef} args={[undefined, undefined, WRECK_VINES.length]}>
        <cylinderGeometry args={[1, 1.25, 1, 5]} />
        <meshStandardMaterial color="#56713c" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={vineLeavesRef} args={[undefined, undefined, WRECK_VINES.length * 3]}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshStandardMaterial color="#68834b" emissive="#23381f" emissiveIntensity={0.12} roughness={1} />
      </instancedMesh>
    </group>
  );
}

function createRiceShootGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const rootColor = new THREE.Color('#29451f');
  const leafColor = new THREE.Color('#7f9b4d');

  const push = (x: number, y: number, z: number, color: THREE.Color) => {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  };

  for (let blade = 0; blade < 6; blade += 1) {
    const angle = blade / 6 * Math.PI * 2;
    const sideX = Math.cos(angle + Math.PI * 0.5);
    const sideZ = Math.sin(angle + Math.PI * 0.5);
    const baseX = Math.cos(angle) * 0.08;
    const baseZ = Math.sin(angle) * 0.08;
    const tipX = baseX + Math.cos(angle) * (0.2 + seeded(blade, 401) * 0.18);
    const tipZ = baseZ + Math.sin(angle) * (0.2 + seeded(blade, 402) * 0.18);
    const height = 0.72 + seeded(blade, 403) * 0.28;
    const width = 0.045;

    push(baseX - sideX * width, 0, baseZ - sideZ * width, rootColor);
    push(baseX + sideX * width, 0, baseZ + sideZ * width, rootColor);
    push(tipX + sideX * width * 0.12, height, tipZ + sideZ * width * 0.12, leafColor);
    push(baseX - sideX * width, 0, baseZ - sideZ * width, rootColor);
    push(tipX + sideX * width * 0.12, height, tipZ + sideZ * width * 0.12, leafColor);
    push(tipX - sideX * width * 0.12, height, tipZ - sideZ * width * 0.12, leafColor);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBananaPlantGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const heartColor = new THREE.Color('#738e45');
  const edgeColor = new THREE.Color('#2d552c');

  const push = (x: number, y: number, z: number, color: THREE.Color) => {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  };

  for (let leaf = 0; leaf < 7; leaf += 1) {
    const angle = leaf / 7 * Math.PI * 2 + 0.2;
    const sideX = Math.cos(angle + Math.PI * 0.5);
    const sideZ = Math.sin(angle + Math.PI * 0.5);
    const midX = Math.cos(angle) * 0.58;
    const midZ = Math.sin(angle) * 0.58;
    const tipX = Math.cos(angle) * (1.08 + (leaf % 2) * 0.14);
    const tipZ = Math.sin(angle) * (1.08 + (leaf % 2) * 0.14);
    const width = 0.25;

    push(0, 0.38, 0, heartColor);
    push(midX + sideX * width, 0.98, midZ + sideZ * width, heartColor);
    push(tipX, 0.68 - (leaf % 3) * 0.08, tipZ, edgeColor);
    push(0, 0.38, 0, heartColor);
    push(tipX, 0.68 - (leaf % 3) * 0.08, tipZ, edgeColor);
    push(midX - sideX * width, 0.98, midZ - sideZ * width, heartColor);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function RicePaddies({ seed }: { seed: number }) {
  const riceRef = useRef<THREE.InstancedMesh>(null);
  const bermRef = useRef<THREE.InstancedMesh>(null);
  const channelRef = useRef<THREE.InstancedMesh>(null);
  const rippleRef = useRef<THREE.InstancedMesh>(null);
  const bananaStemsRef = useRef<THREE.InstancedMesh>(null);
  const bananaLeavesRef = useRef<THREE.InstancedMesh>(null);
  const lastAnimationUpdateRef = useRef(-1);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const riceGeometry = useMemo(() => createRiceShootGeometry(), []);
  const bananaGeometry = useMemo(() => createBananaPlantGeometry(), []);
  const waterShapes = useMemo(() => PADDY_FIELDS.map(createPaddyShape), []);
  const bermColors = useMemo(() => [
    new THREE.Color('#604a2d'),
    new THREE.Color('#705a35'),
    new THREE.Color('#4f422a'),
    new THREE.Color('#7b6339'),
  ], []);

  const paddyDetails = useMemo(() => {
    const seedlings: Array<{ x: number; y: number; z: number; rotation: number; scale: number }> = [];
    const berms: Array<{
      x: number;
      y: number;
      z: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
      scaleZ: number;
      color: number;
    }> = [];
    const channels: Array<{
      x: number;
      y: number;
      z: number;
      rotation: number;
      scaleX: number;
      scaleZ: number;
    }> = [];
    const ripples: Array<{ x: number; y: number; z: number; rotation: number; phase: number; size: number }> = [];
    const fringe: Array<{ x: number; y: number; z: number; rotation: number; scale: number }> = [];

    PADDY_FIELDS.forEach((field, fieldIndex) => {
      const noise = (index: number, channel: number) => coordinateNoise(index, fieldIndex, seed, channel);
      const outline = createPaddyOutline(field, fieldIndex);
      const columns = Math.max(7, Math.floor(field.width / 0.62));
      const rows = Math.max(7, Math.floor(field.depth / 0.62));
      const usableWidth = field.width - 0.9;
      const usableDepth = field.depth - 0.9;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const seedlingIndex = row * columns + column;
          if ((seedlingIndex + fieldIndex * 5) % 23 === 0) continue;
          const localX = -usableWidth * 0.5
            + column * (usableWidth / Math.max(columns - 1, 1))
            + (row % 2) * 0.045
            + (noise(seedlingIndex, 430) - 0.5) * 0.08;
          const localZ = -usableDepth * 0.5
            + row * (usableDepth / Math.max(rows - 1, 1))
            + (noise(seedlingIndex, 440) - 0.5) * 0.07;
          if (!isInsideOutline(localX, localZ, outline)) continue;
          const world = paddyLocalToWorld(field, localX, localZ);
          seedlings.push({
            x: world.x,
            y: field.waterLevel + 0.012,
            z: world.z,
            rotation: field.rotation + (noise(seedlingIndex, 450) - 0.5) * 0.34,
            scale: 0.27 + noise(seedlingIndex, 460) * 0.08,
          });
        }
      }

      const addBerm = (
        localX: number,
        localZ: number,
        scaleX: number,
        scaleZ: number,
        segmentIndex: number,
        baseRotation = field.rotation,
      ) => {
        const world = paddyLocalToWorld(field, localX, localZ);
        berms.push({
          x: world.x,
          y: field.waterLevel + 0.055 + noise(segmentIndex, 470) * 0.025,
          z: world.z,
          rotation: baseRotation + (noise(segmentIndex, 480) - 0.5) * 0.035,
          scaleX,
          scaleY: 0.075 + noise(segmentIndex, 490) * 0.035,
          scaleZ,
          color: Math.floor(noise(segmentIndex, 500) * bermColors.length),
        });
      };

      outline.forEach((start, edgeIndex) => {
        const end = outline[(edgeIndex + 1) % outline.length];
        const edgeX = end[0] - start[0];
        const edgeZ = end[1] - start[1];
        const edgeLength = Math.hypot(edgeX, edgeZ);
        const segmentCount = Math.max(1, Math.ceil(edgeLength / 1.22));
        const segmentLength = edgeLength / segmentCount;
        const edgeMidX = (start[0] + end[0]) * 0.5;
        const edgeMidZ = (start[1] + end[1]) * 0.5;
        const drainEdge = (
          (field.drainSide === 'east' && edgeMidX > field.width * 0.38)
          || (field.drainSide === 'west' && edgeMidX < -field.width * 0.38)
          || (field.drainSide === 'north' && edgeMidZ > field.depth * 0.38)
          || (field.drainSide === 'south' && edgeMidZ < -field.depth * 0.38)
        );
        const edgeRotation = field.rotation + Math.atan2(-edgeZ, edgeX);

        for (let segment = 0; segment < segmentCount; segment += 1) {
          const progress = (segment + 0.5) / segmentCount;
          const localX = THREE.MathUtils.lerp(start[0], end[0], progress);
          const localZ = THREE.MathUtils.lerp(start[1], end[1], progress);
          const alongDrain = field.drainSide === 'east' || field.drainSide === 'west' ? localZ : localX;
          const isSluiceGap = drainEdge && Math.abs(alongDrain - field.drainOffset) < segmentLength * 0.82;
          const isNaturalBreak = noise(segment + edgeIndex * 17, 710) < 0.115;
          if (isSluiceGap || isNaturalBreak) continue;

          const segmentSeed = segment + edgeIndex * 23 + fieldIndex * 149;
          addBerm(
            localX,
            localZ,
            segmentLength * (0.46 + noise(segmentSeed, 720) * 0.045),
            0.19 + noise(segmentSeed, 721) * 0.045,
            segmentSeed,
            edgeRotation,
          );
        }
      });

      const channelLength = 1.65 + noise(fieldIndex, 550) * 0.45;
      const channelWidth = 0.38 + noise(fieldIndex, 551) * 0.08;
      const eastWest = field.drainSide === 'east' || field.drainSide === 'west';
      const direction = field.drainSide === 'east' || field.drainSide === 'north' ? 1 : -1;
      const channelLocalX = eastWest
        ? direction * (field.width * 0.5 + channelLength * 0.5 - 0.08)
        : field.drainOffset;
      const channelLocalZ = eastWest
        ? field.drainOffset
        : direction * (field.depth * 0.5 + channelLength * 0.5 - 0.08);
      const channelWorld = paddyLocalToWorld(field, channelLocalX, channelLocalZ);
      channels.push({
        x: channelWorld.x,
        y: field.waterLevel - 0.004,
        z: channelWorld.z,
        rotation: field.rotation,
        scaleX: eastWest ? channelLength : channelWidth,
        scaleZ: eastWest ? channelWidth : channelLength,
      });

      for (const bankDirection of [-1, 1]) {
        const bankOffset = channelWidth * 0.5 + 0.2;
        addBerm(
          channelLocalX + (eastWest ? 0 : bankDirection * bankOffset),
          channelLocalZ + (eastWest ? bankDirection * bankOffset : 0),
          eastWest ? channelLength * 0.53 : 0.16,
          eastWest ? 0.16 : channelLength * 0.53,
          80 + bankDirection + fieldIndex * 3,
          field.rotation,
        );
      }

      for (let rippleIndex = 0; rippleIndex < 2; rippleIndex += 1) {
        const localX = (noise(rippleIndex, 560) - 0.5) * field.width * 0.48;
        const localZ = (noise(rippleIndex, 570) - 0.5) * field.depth * 0.45;
        const world = paddyLocalToWorld(field, localX, localZ);
        ripples.push({
          x: world.x,
          y: field.waterLevel + 0.018,
          z: world.z,
          rotation: field.rotation,
          phase: noise(rippleIndex, 580),
          size: 0.42 + noise(rippleIndex, 590) * 0.35,
        });
      }

      for (let plantIndex = 0; plantIndex < 2; plantIndex += 1) {
        const sideX = (fieldIndex + plantIndex) % 2 === 0 ? 1 : -1;
        const sideZ = (fieldIndex * 2 + plantIndex) % 3 === 0 ? 1 : -1;
        const world = paddyLocalToWorld(
          field,
          sideX * (field.width * 0.5 - 0.34),
          sideZ * (field.depth * 0.5 - 0.48),
        );
        fringe.push({
          x: world.x,
          y: field.waterLevel + 0.12,
          z: world.z,
          rotation: field.rotation + noise(plantIndex, 600) * Math.PI,
          scale: 0.48 + noise(plantIndex, 610) * 0.24,
        });
      }
    });

    return { seedlings, berms, channels, ripples, fringe };
  }, [bermColors.length, seed]);

  useLayoutEffect(() => {
    if (!riceRef.current || !bermRef.current || !channelRef.current || !bananaStemsRef.current || !bananaLeavesRef.current || !rippleRef.current) return;

    paddyDetails.seedlings.forEach((seedling, index) => {
      dummy.position.set(seedling.x, seedling.y, seedling.z);
      dummy.rotation.set(0, seedling.rotation, 0);
      dummy.scale.set(seedling.scale, seedling.scale, seedling.scale);
      dummy.updateMatrix();
      riceRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(riceRef.current);

    paddyDetails.berms.forEach((berm, index) => {
      dummy.position.set(berm.x, berm.y, berm.z);
      dummy.rotation.set(0, berm.rotation, 0);
      dummy.scale.set(berm.scaleX, berm.scaleY, berm.scaleZ);
      dummy.updateMatrix();
      bermRef.current!.setMatrixAt(index, dummy.matrix);
      bermRef.current!.setColorAt(index, bermColors[berm.color]);
    });
    finalizeInstanceMatrices(bermRef.current);
    if (bermRef.current.instanceColor) bermRef.current.instanceColor.needsUpdate = true;

    paddyDetails.channels.forEach((channel, index) => {
      dummy.position.set(channel.x, channel.y, channel.z);
      dummy.rotation.set(0, channel.rotation, 0);
      dummy.scale.set(channel.scaleX, 0.025, channel.scaleZ);
      dummy.updateMatrix();
      channelRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(channelRef.current);

    paddyDetails.fringe.forEach((plant, index) => {
      dummy.position.set(plant.x, plant.y + plant.scale * 0.38, plant.z);
      dummy.rotation.set(0, plant.rotation, 0);
      dummy.scale.set(0.075 * plant.scale, plant.scale * 0.76, 0.075 * plant.scale);
      dummy.updateMatrix();
      bananaStemsRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(bananaStemsRef.current);

    paddyDetails.fringe.forEach((plant, index) => {
      dummy.position.set(plant.x, plant.y, plant.z);
      dummy.rotation.set(0, plant.rotation, 0);
      dummy.scale.setScalar(plant.scale);
      dummy.updateMatrix();
      bananaLeavesRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(bananaLeavesRef.current, true);

    paddyDetails.ripples.forEach((ripple, index) => {
      dummy.position.set(ripple.x, ripple.y, ripple.z);
      dummy.rotation.set(-Math.PI / 2, 0, ripple.rotation);
      dummy.scale.setScalar(0.01);
      dummy.updateMatrix();
      rippleRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(rippleRef.current, true);
  }, [bermColors, dummy, paddyDetails]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (time - lastAnimationUpdateRef.current < 1 / 20) return;
    lastAnimationUpdateRef.current = time;

    if (rippleRef.current) {
      paddyDetails.ripples.forEach((ripple, index) => {
        const life = (time * 0.12 + ripple.phase) % 1;
        const fadeScale = Math.sin(life * Math.PI);
        const scale = ripple.size * (0.3 + life * 1.5) * fadeScale;
        dummy.position.set(ripple.x, ripple.y, ripple.z);
        dummy.rotation.set(-Math.PI / 2, 0, ripple.rotation);
        dummy.scale.set(scale * 1.45, scale, 1);
        dummy.updateMatrix();
        rippleRef.current!.setMatrixAt(index, dummy.matrix);
      });
      rippleRef.current.instanceMatrix.needsUpdate = true;
    }

    if (bananaLeavesRef.current) {
      const sway = Math.sin(time * 0.55) * 0.035;
      paddyDetails.fringe.forEach((plant, index) => {
        dummy.position.set(plant.x, plant.y, plant.z);
        dummy.rotation.set(sway * (0.65 + seeded(index, 620)), plant.rotation + sway, -sway * 0.6);
        dummy.scale.setScalar(plant.scale);
        dummy.updateMatrix();
        bananaLeavesRef.current!.setMatrixAt(index, dummy.matrix);
      });
      bananaLeavesRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {PADDY_FIELDS.map((field, fieldIndex) => (
        <group key={`${field.x}-${field.z}`} position={[field.x, 0, field.z]} rotation={[0, field.rotation, 0]}>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, Math.max(field.waterLevel - 0.022, -0.082), 0]}
            scale={[1.025, 1.025, 1]}
            receiveShadow
          >
            <shapeGeometry args={[waterShapes[fieldIndex]]} />
            <meshStandardMaterial color="#493b28" roughness={0.92} metalness={0.02} />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, field.waterLevel, 0]}
            receiveShadow
            renderOrder={2}
          >
            <shapeGeometry args={[waterShapes[fieldIndex]]} />
            <meshPhysicalMaterial
              color={fieldIndex % 3 === 0 ? '#6f8674' : '#657e6d'}
              emissive="#18251e"
              emissiveIntensity={0.1}
              metalness={0.31}
              roughness={0.13}
              clearcoat={0.92}
              clearcoatRoughness={0.12}
              transparent
              opacity={0.72}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}

      <instancedMesh ref={channelRef} args={[undefined, undefined, paddyDetails.channels.length]} renderOrder={2}>
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial
          color="#334b42"
          metalness={0.38}
          roughness={0.16}
          clearcoat={0.8}
          transparent
          opacity={0.78}
          depthWrite={false}
        />
      </instancedMesh>

      <instancedMesh ref={bermRef} args={[undefined, undefined, paddyDetails.berms.length]} receiveShadow>
        <sphereGeometry args={[1, 8, 5]} />
        <meshStandardMaterial
          vertexColors
          color="#ffffff"
          emissive="#21170d"
          emissiveIntensity={0.08}
          roughness={1}
          flatShading
        />
      </instancedMesh>

      <instancedMesh ref={riceRef} args={[riceGeometry, undefined, paddyDetails.seedlings.length]} castShadow={false} receiveShadow={false}>
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          roughness={0.92}
          emissive="#29401e"
          emissiveIntensity={0.14}
        />
      </instancedMesh>

      <instancedMesh ref={rippleRef} args={[undefined, undefined, paddyDetails.ripples.length]} renderOrder={3}>
        <ringGeometry args={[0.78, 1, 16]} />
        <meshBasicMaterial
          color="#c3d4bd"
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh ref={bananaStemsRef} args={[undefined, undefined, paddyDetails.fringe.length]}>
        <cylinderGeometry args={[1, 1.35, 1, 6]} />
        <meshStandardMaterial color="#62713b" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={bananaLeavesRef} args={[bananaGeometry, undefined, paddyDetails.fringe.length]}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.94} />
      </instancedMesh>
    </>
  );
}

function MudAndPuddles({ seed }: { seed: number }) {
  const puddlesRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const puddles = useMemo(() => createDeterministicScatter({
    width: 148,
    depth: 148,
    cellSize: 9.4,
    minDistance: 6.2,
    seed: seed ^ 0x7a2f,
    maxPoints: 18,
    accept: (x, z) => distanceToRoad(x) < 1.9 || distanceToRoad(z) < 1.9,
  }).map(point => ({
    x: point.x,
    z: point.z,
    scaleX: 0.45 + coordinateNoise(point.cellX, point.cellZ, seed, 44) * 1.35,
    scaleZ: 0.22 + coordinateNoise(point.cellX, point.cellZ, seed, 45) * 0.65,
    rotation: coordinateNoise(point.cellX, point.cellZ, seed, 46) * Math.PI,
  })), [seed]);

  useLayoutEffect(() => {
    if (!puddlesRef.current) return;
    puddles.forEach((puddle, index) => {
      dummy.position.set(puddle.x, -0.038, puddle.z);
      dummy.rotation.set(-Math.PI / 2, 0, puddle.rotation);
      dummy.scale.set(puddle.scaleX, puddle.scaleZ, 1);
      dummy.updateMatrix();
      puddlesRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(puddlesRef.current);
  }, [dummy, puddles]);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
        <planeGeometry args={[260, 260]} />
        <meshStandardMaterial color="#405036" roughness={1} metalness={0} />
      </mesh>
      <instancedMesh ref={puddlesRef} args={[undefined, undefined, puddles.length]}>
        <circleGeometry args={[1, 12]} />
        <meshStandardMaterial color="#1c261e" metalness={0.45} roughness={0.24} transparent opacity={0.7} />
      </instancedMesh>
    </>
  );
}

interface VietnamEnvironmentProps {
  seed?: number;
}

export function VietnamEnvironment({ seed = DEFAULT_ENVIRONMENT_SEED }: VietnamEnvironmentProps) {
  const environmentSeed = Number.isFinite(seed) ? Math.trunc(seed) : DEFAULT_ENVIRONMENT_SEED;

  return (
    <>
      <MudAndPuddles seed={environmentSeed} />
      <GroundPatches seed={environmentSeed} />
      <RicePaddies seed={environmentSeed} />
      <TerrainRelief />
      <ElephantGrass seed={environmentSeed} />
      <LayeredJungle seed={environmentSeed} />
      <SmokeColumns />
      <FieldFortifications />
      <CrashedHuey />
      <DistantHelicopterFormation />
    </>
  );
}
