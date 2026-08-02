import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROAD_GRID_SPACING } from '../../lib/constants';
import { TERRAIN_MOUNDS } from '../../lib/terrain';

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 91.719 + salt * 17.173) * 43758.5453;
  return value - Math.floor(value);
}

function distanceToRoad(value: number) {
  const half = ROAD_GRID_SPACING * 0.5;
  return Math.abs(((value + half) % ROAD_GRID_SPACING + ROAD_GRID_SPACING) % ROAD_GRID_SPACING - half);
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

function ElephantGrass() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const grass = useMemo(() => {
    const placements: Array<{ position: [number, number, number]; scale: [number, number, number]; rotation: number }> = [];
    let candidate = 0;

    while (placements.length < 620 && candidate < 7000) {
      const x = (seeded(candidate, 1) - 0.5) * 150;
      const z = (seeded(candidate, 2) - 0.5) * 150;
      candidate += 1;
      if (distanceToRoad(x) < 2.4 || distanceToRoad(z) < 2.4) continue;
      if (Math.abs(x) < 7 && z > -18 && z < 8) continue;

      const height = 0.9 + seeded(candidate, 3) * 1.3;
      placements.push({
        position: [x, -0.03, z],
        scale: [0.95 + seeded(candidate, 4) * 1.0, height, 0.95 + seeded(candidate, 5) * 1.0],
        rotation: seeded(candidate, 6) * Math.PI,
      });
    }

    return placements;
  }, []);
  const grassGeometry = useMemo(() => createGrassClumpGeometry(), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const wind = Math.sin(clock.elapsedTime * 0.7) * 0.055;
    grass.forEach((blade, index) => {
      dummy.position.set(...blade.position);
      dummy.scale.set(...blade.scale);
      dummy.rotation.set(wind * (0.5 + seeded(index, 8)), blade.rotation, wind * 0.35);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

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

  useEffect(() => {
    if (!meshRef.current || !rocksRef.current) return;
    TERRAIN_MOUNDS.forEach((mound, index) => {
      dummy.position.set(mound.x, mound.y, mound.z);
      dummy.rotation.set(0, mound.rotation, 0);
      dummy.scale.set(mound.sx, mound.sy, mound.sz);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;

    ridgeRocks.forEach((rock, index) => {
      dummy.position.set(rock.x, rock.y, rock.z);
      dummy.rotation.set(0.12, rock.rotation, -0.08);
      dummy.scale.set(rock.scale * 1.25, rock.scale * 0.76, rock.scale);
      dummy.updateMatrix();
      rocksRef.current!.setMatrixAt(index, dummy.matrix);
    });
    rocksRef.current.instanceMatrix.needsUpdate = true;
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

function GroundPatches() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => [
    new THREE.Color('#53603b'),
    new THREE.Color('#353d27'),
    new THREE.Color('#5a5131'),
    new THREE.Color('#2b432d'),
  ], []);
  const patches = useMemo(() => Array.from({ length: 58 }, (_, index) => ({
    x: (seeded(index, 90) - 0.5) * 150,
    z: (seeded(index, 91) - 0.5) * 150,
    sx: 2.2 + seeded(index, 92) * 6.5,
    sz: 1.4 + seeded(index, 93) * 4.3,
    rotation: seeded(index, 94) * Math.PI,
    color: Math.floor(seeded(index, 95) * colors.length),
  })), [colors.length]);

  useEffect(() => {
    if (!meshRef.current) return;
    patches.forEach((patch, index) => {
      dummy.position.set(patch.x, -0.072, patch.z);
      dummy.rotation.set(-Math.PI / 2, 0, patch.rotation);
      dummy.scale.set(patch.sx, patch.sz, 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
      meshRef.current!.setColorAt(index, colors[patch.color]);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
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

function LayeredJungle() {
  const broadTrunksRef = useRef<THREE.InstancedMesh>(null);
  const broadCanopyRef = useRef<THREE.InstancedMesh>(null);
  const palmTrunksRef = useRef<THREE.InstancedMesh>(null);
  const palmCrownsRef = useRef<THREE.InstancedMesh>(null);
  const vinesRef = useRef<THREE.InstancedMesh>(null);
  const understoryStemsRef = useRef<THREE.InstancedMesh>(null);
  const understoryLeavesRef = useRef<THREE.InstancedMesh>(null);
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

    for (let index = 0; index < 112; index += 1) {
      const angle = (index / 112) * Math.PI * 2 + seeded(index, 10) * 0.1;
      const radius = 55 + seeded(index, 11) * 31;
      placements.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        height: 5.8 + seeded(index, 12) * 8.8,
        crown: 1.05 + seeded(index, 13) * 0.7,
        lean: (seeded(index, 14) - 0.5) * 0.12,
        rotation: seeded(index, 15) * Math.PI,
        palm: seeded(index, 16) > 0.56,
      });
    }

    let candidate = 0;
    while (placements.length < 208 && candidate < 3000) {
      const x = (seeded(candidate, 20) - 0.5) * 124;
      const z = (seeded(candidate, 21) - 0.5) * 116;
      candidate += 1;
      if (distanceToRoad(x) < 2.45 || distanceToRoad(z) < 2.45) continue;
      if (Math.abs(x) < 12 && z > -22 && z < 18) continue;
      if (Math.abs(x) < 22 && z > 7 && z < 26) continue;

      placements.push({
        x,
        z,
        height: 4.8 + seeded(candidate, 22) * 7.5,
        crown: 0.88 + seeded(candidate, 23) * 0.62,
        lean: (seeded(candidate, 24) - 0.5) * 0.16,
        rotation: seeded(candidate, 25) * Math.PI,
        palm: seeded(candidate, 26) > 0.64,
      });
    }

    return placements;
  }, []);
  const broadleafTrees = useMemo(() => trees.filter(tree => !tree.palm), [trees]);
  const palmTrees = useMemo(() => trees.filter(tree => tree.palm), [trees]);
  const vineTrees = useMemo(() => broadleafTrees.filter((_, index) => index % 3 === 0), [broadleafTrees]);
  const understory = useMemo(() => {
    const placements: Array<{ x: number; z: number; height: number; scale: number; rotation: number }> = [];
    let candidate = 0;
    while (placements.length < 118 && candidate < 3000) {
      const x = (seeded(candidate, 201) - 0.5) * 122;
      const z = (seeded(candidate, 202) - 0.5) * 108;
      candidate += 1;
      if (distanceToRoad(x) < 2.05 || distanceToRoad(z) < 2.05) continue;
      if (Math.abs(x) < 8 && z > -20 && z < 12) continue;
      if (Math.abs(x) < 22 && z > 7 && z < 26) continue;
      if (PADDY_POSITIONS.some(([paddyX, paddyZ]) => Math.abs(x - paddyX) < 2.75 && Math.abs(z - paddyZ) < 2.75)) continue;
      placements.push({
        x,
        z,
        height: 1.1 + seeded(candidate, 203) * 1.2,
        scale: 0.34 + seeded(candidate, 204) * 0.28,
        rotation: seeded(candidate, 205) * Math.PI,
      });
    }
    return placements;
  }, []);

  useFrame(({ clock }) => {
    if (!broadTrunksRef.current || !broadCanopyRef.current || !palmTrunksRef.current || !palmCrownsRef.current || !vinesRef.current || !understoryStemsRef.current || !understoryLeavesRef.current) return;
    const sway = Math.sin(clock.elapsedTime * 0.38) * 0.022;

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
        dummy.rotation.set(sway * (lobe + 1), angle, -sway * 0.65);
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

      dummy.position.set(tree.x, tree.height, tree.z);
      dummy.rotation.set(sway, tree.rotation + sway, -sway * 0.7);
      dummy.scale.set(tree.crown, tree.crown, tree.crown);
      dummy.updateMatrix();
      palmCrownsRef.current!.setMatrixAt(index, dummy.matrix);
    });

    vineTrees.forEach((tree, index) => {
      const vineLength = 1.4 + seeded(index, 33) * 2.8;
      dummy.position.set(
        tree.x + (seeded(index, 34) - 0.5) * tree.crown * 1.7,
        tree.height - vineLength * 0.22,
        tree.z + (seeded(index, 35) - 0.5) * tree.crown * 1.7,
      );
      dummy.rotation.set(sway * 0.7, seeded(index, 36) * Math.PI, sway);
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
      dummy.rotation.set(sway * 1.8, plant.rotation + sway, -sway);
      dummy.scale.set(plant.scale, plant.scale * 0.72, plant.scale);
      dummy.updateMatrix();
      understoryLeavesRef.current!.setMatrixAt(index, dummy.matrix);
    });

    broadTrunksRef.current.instanceMatrix.needsUpdate = true;
    broadCanopyRef.current.instanceMatrix.needsUpdate = true;
    palmTrunksRef.current.instanceMatrix.needsUpdate = true;
    palmCrownsRef.current.instanceMatrix.needsUpdate = true;
    vinesRef.current.instanceMatrix.needsUpdate = true;
    understoryStemsRef.current.instanceMatrix.needsUpdate = true;
    understoryLeavesRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={broadTrunksRef} args={[undefined, undefined, broadleafTrees.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.48, 1, 7]} />
        <meshStandardMaterial color="#463b27" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={broadCanopyRef} args={[undefined, undefined, broadleafTrees.length * 3]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#244525" emissive="#132713" emissiveIntensity={0.12} roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={palmTrunksRef} args={[undefined, undefined, palmTrees.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.42, 1, 8]} />
        <meshStandardMaterial color="#66583a" roughness={0.98} />
      </instancedMesh>
      <instancedMesh ref={palmCrownsRef} args={[palmGeometry, undefined, palmTrees.length]} castShadow>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.96} />
      </instancedMesh>
      <instancedMesh ref={vinesRef} args={[undefined, undefined, vineTrees.length]} castShadow>
        <cylinderGeometry args={[1, 1.25, 1, 5]} />
        <meshStandardMaterial color="#38552c" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={understoryStemsRef} args={[undefined, undefined, understory.length]} castShadow>
        <cylinderGeometry args={[0.6, 1, 1, 6]} />
        <meshStandardMaterial color="#50613b" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={understoryLeavesRef} args={[palmGeometry, undefined, understory.length]} castShadow>
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
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const countPerSource = 16;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const time = clock.elapsedTime;

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
  const sandbags = [-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8];

  return (
    <>
      <group position={[-7.4, 0.12, -8]} rotation={[0, 0.28, 0]}>
        {sandbags.map((x, index) => (
          <mesh key={x} position={[x, index % 2 === 0 ? 0 : 0.18, 0]} scale={[0.54, 0.22, 0.34]}>
            <sphereGeometry args={[1, 8, 5]} />
            <meshStandardMaterial color="#77704a" roughness={1} />
          </mesh>
        ))}
      </group>
      <group position={[7.8, 0.22, -6.7]} rotation={[0, -0.24, 0]}>
        {[[0, 0, 0], [0.7, 0, 0], [0.35, 0.7, 0]] .map((position, index) => (
          <mesh key={index} position={position as [number, number, number]}>
            <boxGeometry args={[0.62, 0.62, 0.62]} />
            <meshStandardMaterial color="#5f5936" roughness={0.9} />
          </mesh>
        ))}
      </group>
      {[
        [-9, 0.08, -3],
        [9.6, 0.08, -1],
        [-11, 0.08, 6],
      ].map((position, index) => (
        <group key={index} position={position as [number, number, number]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.32, 0.32, 0.76, 12]} />
            <meshStandardMaterial color={index === 1 ? '#6f3f24' : '#495432'} metalness={0.35} roughness={0.72} />
          </mesh>
          <lineSegments rotation={[0, 0, Math.PI / 2]}>
            <edgesGeometry args={[new THREE.CylinderGeometry(0.32, 0.32, 0.76, 12)]} />
            <lineBasicMaterial color="#a6945d" transparent opacity={0.38} />
          </lineSegments>
        </group>
      ))}
    </>
  );
}

function DistantHelicopter() {
  const helicopterRef = useRef<THREE.Group>(null);
  const rotorRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!helicopterRef.current || !rotorRef.current) return;
    const time = clock.elapsedTime;
    helicopterRef.current.position.set(
      Math.cos(time * 0.045) * 58,
      14 + Math.sin(time * 0.16) * 1.4,
      Math.sin(time * 0.045) * 48 + 12,
    );
    helicopterRef.current.rotation.y = -time * 0.045 + Math.PI * 0.5;
    helicopterRef.current.rotation.z = Math.sin(time * 0.13) * 0.04;
    rotorRef.current.rotation.y = time * 18;
  });

  return (
    <group ref={helicopterRef} scale={0.72}>
      <mesh scale={[1.6, 0.78, 0.8]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#20281b" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.1, 2.4]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.3, 3.8, 5]} />
        <meshStandardMaterial color="#20281b" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.6, 4.15]} scale={[0.08, 0.72, 0.62]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#20281b" roughness={0.9} />
      </mesh>
      <group ref={rotorRef} position={[0, 1.15, 0]}>
        <mesh scale={[6.2, 0.035, 0.11]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#444936" transparent opacity={0.65} />
        </mesh>
        <mesh scale={[0.11, 0.035, 6.2]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#444936" transparent opacity={0.65} />
        </mesh>
      </group>
      {[-0.72, 0.72].map(x => (
        <group key={x} position={[x, -0.8, 0]}>
          <mesh position={[0, 0, 0]} scale={[0.04, 0.72, 0.04]} rotation={[0, 0, x > 0 ? -0.28 : 0.28]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#181d15" />
          </mesh>
          <mesh position={[0, -0.36, 0]} scale={[0.05, 0.05, 1.5]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#181d15" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const PADDY_POSITIONS: Array<[number, number]> = [
  [-4, -4],
  [4, -4],
  [-4, 4],
  [4, 4],
  [-12, -12],
  [12, -12],
  [-20, 4],
  [20, 4],
];

function RicePaddies() {
  const riceRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const riceGeometry = useMemo(() => createGrassClumpGeometry(), []);
  const seedlings = useMemo(() => PADDY_POSITIONS.flatMap(([paddyX, paddyZ], paddyIndex) => (
    Array.from({ length: 36 }, (_, seedlingIndex) => {
      const row = Math.floor(seedlingIndex / 6);
      const column = seedlingIndex % 6;
      return {
        x: paddyX - 1.75 + column * 0.7 + (seeded(seedlingIndex, 150 + paddyIndex) - 0.5) * 0.1,
        z: paddyZ - 1.75 + row * 0.7 + (seeded(seedlingIndex, 160 + paddyIndex) - 0.5) * 0.1,
        rotation: seeded(seedlingIndex, 170 + paddyIndex) * Math.PI,
        scale: 0.19 + seeded(seedlingIndex, 180 + paddyIndex) * 0.05,
      };
    })
  )), []);

  useEffect(() => {
    if (!riceRef.current) return;
    seedlings.forEach((seedling, index) => {
      dummy.position.set(seedling.x, 0.015, seedling.z);
      dummy.rotation.set(0, seedling.rotation, 0);
      dummy.scale.set(seedling.scale, seedling.scale * 1.25, seedling.scale);
      dummy.updateMatrix();
      riceRef.current!.setMatrixAt(index, dummy.matrix);
    });
    riceRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy, seedlings]);

  return (
    <>
      {PADDY_POSITIONS.map(([x, z], paddyIndex) => (
        <group key={`${x}-${z}`} position={[x, 0, z]} rotation={[0, (paddyIndex % 3 - 1) * 0.018, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, 0]} receiveShadow>
            <planeGeometry args={[4.55, 4.55, 1, 1]} />
            <meshPhysicalMaterial
              color="#4f6658"
              emissive="#1b2821"
              emissiveIntensity={0.12}
              metalness={0.34}
              roughness={0.18}
              clearcoat={0.62}
              clearcoatRoughness={0.18}
              transparent
              opacity={0.82}
            />
          </mesh>
          {[-2.42, 2.42].map((edgeX) => (
            <mesh key={`x-${edgeX}`} position={[edgeX, 0.07, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.32, 0.22, 5.18]} />
              <meshStandardMaterial color="#665633" roughness={1} />
            </mesh>
          ))}
          {[-2.42, 2.42].map((edgeZ) => (
            <mesh key={`z-${edgeZ}`} position={[0, 0.07, edgeZ]} castShadow receiveShadow>
              <boxGeometry args={[5.18, 0.22, 0.32]} />
              <meshStandardMaterial color="#71613b" roughness={1} />
            </mesh>
          ))}
          <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.16, 0.15, 4.72]} />
            <meshStandardMaterial color="#5f5132" roughness={1} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={riceRef} args={[riceGeometry, undefined, seedlings.length]} castShadow={false} receiveShadow={false}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.92} emissive="#263c1d" emissiveIntensity={0.12} />
      </instancedMesh>
    </>
  );
}

function MudAndPuddles() {
  const puddles = useMemo(() => Array.from({ length: 18 }, (_, index) => ({
    x: (Math.floor(seeded(index, 40) * 11) - 5) * ROAD_GRID_SPACING + (seeded(index, 41) - 0.5) * 2.5,
    z: (Math.floor(seeded(index, 42) * 11) - 5) * ROAD_GRID_SPACING + (seeded(index, 43) - 0.5) * 2.5,
    scaleX: 0.45 + seeded(index, 44) * 1.35,
    scaleZ: 0.22 + seeded(index, 45) * 0.65,
    rotation: seeded(index, 46) * Math.PI,
  })), []);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
        <planeGeometry args={[260, 260]} />
        <meshStandardMaterial color="#405036" roughness={1} metalness={0} />
      </mesh>
      {puddles.map((puddle, index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, puddle.rotation]}
          position={[puddle.x, -0.038, puddle.z]}
          scale={[puddle.scaleX, puddle.scaleZ, 1]}
        >
          <circleGeometry args={[1, 20]} />
          <meshStandardMaterial color="#1c261e" metalness={0.45} roughness={0.24} transparent opacity={0.7} />
        </mesh>
      ))}
    </>
  );
}

export function VietnamEnvironment() {
  return (
    <>
      <MudAndPuddles />
      <GroundPatches />
      <RicePaddies />
      <TerrainRelief />
      <ElephantGrass />
      <LayeredJungle />
      <SmokeColumns />
      <FieldFortifications />
      <DistantHelicopter />
    </>
  );
}
