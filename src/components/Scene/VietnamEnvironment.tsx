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

function JunglePerimeter() {
  const trunksRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const trees = useMemo(() => Array.from({ length: 76 }, (_, index) => {
    const angle = (index / 76) * Math.PI * 2 + seeded(index, 10) * 0.12;
    const radius = 67 + seeded(index, 11) * 24;
    const height = 5.5 + seeded(index, 12) * 7;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      height,
      crown: 2.8 + seeded(index, 13) * 3.4,
      lean: (seeded(index, 14) - 0.5) * 0.11,
    };
  }), []);

  useFrame(({ clock }) => {
    if (!trunksRef.current || !canopyRef.current) return;
    const sway = Math.sin(clock.elapsedTime * 0.33) * 0.025;

    trees.forEach((tree, index) => {
      dummy.position.set(tree.x, tree.height * 0.5, tree.z);
      dummy.rotation.set(tree.lean, 0, tree.lean * 0.6);
      dummy.scale.set(0.65, tree.height, 0.65);
      dummy.updateMatrix();
      trunksRef.current!.setMatrixAt(index, dummy.matrix);

      dummy.position.set(tree.x, tree.height + tree.crown * 0.18, tree.z);
      dummy.rotation.set(sway * (index % 3), seeded(index, 15) * Math.PI, -sway);
      dummy.scale.set(tree.crown * 1.25, tree.crown * 0.82, tree.crown);
      dummy.updateMatrix();
      canopyRef.current!.setMatrixAt(index, dummy.matrix);
    });

    trunksRef.current.instanceMatrix.needsUpdate = true;
    canopyRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={trunksRef} args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[0.18, 0.34, 1, 5]} />
        <meshStandardMaterial color="#403b22" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, trees.length]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#1d351c" emissive="#0e190d" emissiveIntensity={0.26} roughness={1} />
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
      <TerrainRelief />
      <ElephantGrass />
      <JunglePerimeter />
      <SmokeColumns />
      <FieldFortifications />
      <DistantHelicopter />
    </>
  );
}
