import { useRef, useMemo, useEffect, useLayoutEffect, useState, createRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BlockData } from '../../hooks/useFileBlocks';
import { FileCategory } from '../../lib/colors';
import { formatBytes } from '../../lib/format';

const STRUCTURE_ACCENTS: Record<FileCategory, string> = {
  media: '#b7a45e',
  code: '#75906c',
  archive: '#9a633f',
  other: '#8a7b51',
};

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const MAX_FLOATING_LABELS = 44;
const LABEL_VISIBILITY_RADIUS_SQ = 34 * 34;
const LABEL_INDEX_CELL_SIZE = 12;
const LABEL_REFRESH_CELL_SIZE = 6;
const MAX_OUTLINED_BLOCKS_PER_CATEGORY = 120;
const MAX_SHADOWED_BLOCKS_PER_CATEGORY = 160;

function pathNoise(path: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function blockYaw(path: string) {
  return (pathNoise(path, 1968) - 0.5) * 0.11;
}

function labelCellKey(x: number, z: number) {
  return `${x}:${z}`;
}

function colorGeometry(geometry: THREE.BufferGeometry, color: string) {
  const value = new THREE.Color(color);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let index = 0; index < colors.length; index += 3) {
    colors[index] = value.r;
    colors[index + 1] = value.g;
    colors[index + 2] = value.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function createStructureGeometry(category: FileCategory) {
  const parts: THREE.BufferGeometry[] = [];
  const addPart = (
    geometry: THREE.BufferGeometry,
    color: string,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ) => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
    geometry.applyMatrix4(matrix);
    parts.push(colorGeometry(geometry, color));
  };

  const wood = '#59472d';
  const darkWood = '#33291d';
  const bamboo = '#8b7650';
  const thatch = '#9a874c';
  const dryThatch = '#b5a365';
  const earth = '#51452f';
  const accent = STRUCTURE_ACCENTS[category];

  const addThatchedRoof = (width: number, depth: number, eaveY: number, rise: number) => {
    const halfSpan = width * 0.5 + 0.18;
    const roofDepth = depth + 0.42;
    const slopeLength = Math.hypot(halfSpan, rise);
    const slopeAngle = Math.atan2(rise, halfSpan);

    [-1, 1].forEach((side) => {
      addPart(
        new THREE.BoxGeometry(slopeLength, 0.12, roofDepth),
        side < 0 ? thatch : dryThatch,
        [side * halfSpan * 0.5, eaveY + rise * 0.5, 0],
        [0, 0, side < 0 ? slopeAngle : -slopeAngle],
      );
      addPart(
        new THREE.BoxGeometry(slopeLength * 0.94, 0.035, roofDepth + 0.035),
        '#6e633c',
        [side * halfSpan * 0.49, eaveY + rise * 0.48 - 0.055, 0],
        [0, 0, side < 0 ? slopeAngle : -slopeAngle],
      );
    });

    addPart(
      new THREE.CylinderGeometry(0.065, 0.075, roofDepth + 0.14, 8),
      '#c0ad69',
      [0, eaveY + rise + 0.035, 0],
      [Math.PI / 2, 0, 0],
    );

    for (let fringe = 0; fringe < 7; fringe += 1) {
      const z = -roofDepth * 0.42 + fringe * roofDepth * 0.14;
      [-1, 1].forEach((side) => {
        addPart(
          new THREE.CylinderGeometry(0.012, 0.02, 0.18 + (fringe % 2) * 0.045, 5),
          fringe % 2 === 0 ? dryThatch : thatch,
          [side * halfSpan, eaveY - 0.07, z],
          [0, 0, (side * Math.PI) / 18],
        );
      });
    }
  };

  const addStiltHut = (width: number, depth: number, wallHeight: number, roofRise: number) => {
    const wallBase = -0.08;
    const wallCenter = wallBase + wallHeight * 0.5;
    const eaveY = wallBase + wallHeight + 0.08;

    addPart(new THREE.BoxGeometry(width + 0.18, 0.12, depth + 0.22), darkWood, [0, wallBase - 0.09, 0]);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([xSide, zSide]) => {
      addPart(
        new THREE.CylinderGeometry(0.045, 0.065, 0.54, 6),
        darkWood,
        [xSide * width * 0.4, wallBase - 0.34, zSide * depth * 0.38],
      );
    });
    addPart(new THREE.BoxGeometry(width, wallHeight, depth), bamboo, [0, wallCenter, 0]);

    for (let slat = -2; slat <= 2; slat += 1) {
      addPart(
        new THREE.BoxGeometry(width * 0.9, 0.025, 0.018),
        slat % 2 === 0 ? '#6b5738' : '#a08a5b',
        [0, wallCenter + slat * wallHeight * 0.085, -(depth * 0.5 + 0.012)],
      );
    }
    [-1, 1].forEach((side) => {
      addPart(
        new THREE.BoxGeometry(0.025, wallHeight * 0.92, 0.025),
        wood,
        [side * width * 0.43, wallCenter, -(depth * 0.5 + 0.025)],
      );
    });

    addPart(new THREE.BoxGeometry(width * 0.24, wallHeight * 0.72, 0.04), darkWood, [0, wallBase + wallHeight * 0.36, -(depth * 0.5 + 0.035)]);
    [-0.31, 0.31].forEach((x) => {
      addPart(new THREE.BoxGeometry(width * 0.16, wallHeight * 0.24, 0.045), accent, [x * width, wallCenter + wallHeight * 0.08, -(depth * 0.5 + 0.04)]);
      addPart(new THREE.BoxGeometry(width * 0.18, 0.028, 0.055), darkWood, [x * width, wallCenter + wallHeight * 0.08, -(depth * 0.5 + 0.065)]);
    });

    addThatchedRoof(width, depth, eaveY, roofRise);
  };

  if (category === 'media') {
    addStiltHut(1.5, 1.0, 0.62, 0.46);
    addPart(new THREE.BoxGeometry(1.05, 0.08, 0.34), wood, [0, -0.12, -0.66]);
    [-0.32, 0, 0.32].forEach((x) => {
      addPart(new THREE.BoxGeometry(0.26, 0.035, 0.08), dryThatch, [x, 0.63, -0.71]);
    });
  } else if (category === 'code') {
    addStiltHut(1.06, 0.9, 0.72, 0.5);
    addPart(new THREE.CylinderGeometry(0.018, 0.026, 0.94, 6), accent, [0.32, 1.25, 0.18]);
    addPart(new THREE.SphereGeometry(0.06, 6, 4), accent, [0.32, 1.73, 0.18]);
  } else if (category === 'archive') {
    addStiltHut(1.42, 1.08, 0.55, 0.4);
    [-0.46, 0, 0.46].forEach((x) => {
      addPart(new THREE.CylinderGeometry(0.09, 0.1, 0.74, 7), earth, [x, -0.34, -0.68], [0, 0, Math.PI / 2]);
    });
  } else {
    addStiltHut(1.18, 0.96, 0.64, 0.44);
    for (let rung = 0; rung < 3; rung += 1) {
      addPart(new THREE.BoxGeometry(0.28, 0.03, 0.04), wood, [0, -0.22 - rung * 0.12, -0.58]);
    }
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

interface InstancedCategoryBlocksProps {
  blocks: BlockData[];
  category: FileCategory;
  onHover: (block: BlockData | null) => void;
  meshRef?: React.RefObject<THREE.InstancedMesh | null>;
  markedFiles: Set<string>;
  deletingFiles: Set<string>;
  onDeletionComplete?: (filePath: string) => void;
}

function InstancedCategoryBlocks({ blocks, category, onHover, meshRef: externalMeshRef, markedFiles, deletingFiles, onDeletionComplete }: InstancedCategoryBlocksProps) {
  const internalMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const meshRef = externalMeshRef || internalMeshRef;
  const groupRef = useRef<THREE.Group>(null);
  const categoryColor = blocks[0]?.color || '#ffffff';

  // Track deletion animation progress for each deleting file
  const deletionProgressRef = useRef<Map<string, number>>(new Map());
  const DEREZ_DURATION = 0.8; // seconds

  const geometry = useMemo(() => createStructureGeometry(category), [category]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Create merged wireframe geometry for all blocks in this category
  const mergedWireframe = useMemo(() => {
    // A merged outline cannot be culled per instance. Drop the decorative pass
    // for very large directories instead of submitting every edge every frame.
    if (blocks.length > MAX_OUTLINED_BLOCKS_PER_CATEGORY) return null;
    const edgeGeometries: THREE.EdgesGeometry[] = [];
    const baseEdges = new THREE.EdgesGeometry(geometry, 15);

    for (const block of blocks) {
      const edgesGeometry = baseEdges.clone();
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, blockYaw(block.path));
      matrix.compose(
        new THREE.Vector3(...block.position),
        quaternion,
        new THREE.Vector3(block.scale, block.scale, block.scale)
      );
      edgesGeometry.applyMatrix4(matrix);
      edgeGeometries.push(edgesGeometry);
    }

    baseEdges.dispose();

    if (edgeGeometries.length === 0) return null;
    const merged = mergeGeometries(edgeGeometries);

    // Clean up individual geometries
    edgeGeometries.forEach(g => g.dispose());

    return merged;
  }, [blocks, geometry]);

  useEffect(() => () => mergedWireframe?.dispose(), [mergedWireframe]);

  // Pre-allocated objects for frame updates
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const blockIndexByPath = useMemo(
    () => new Map(blocks.map((block, index) => [block.path, index])),
    [blocks],
  );
  const yaws = useMemo(() => blocks.map(block => blockYaw(block.path)), [blocks]);
  const activeDeletions = useMemo(() => {
    const active: Array<{ path: string; blockIndex: number }> = [];
    for (const path of deletingFiles) {
      const blockIndex = blockIndexByPath.get(path);
      if (blockIndex !== undefined) active.push({ path, blockIndex });
    }
    return active;
  }, [blockIndexByPath, deletingFiles]);
  const hasMarkedBlock = useMemo(
    () => blocks.some(block => markedFiles.has(block.path)),
    [blocks, markedFiles],
  );

  // Setup instance matrices
  useEffect(() => {
    if (!meshRef.current) return;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      tempPosition.set(...block.position);
      tempScale.set(block.scale, block.scale, block.scale);
      tempQuaternion.setFromAxisAngle(Y_AXIS, yaws[i]);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current.setMatrixAt(i, tempMatrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [blocks, tempMatrix, tempPosition, tempQuaternion, tempScale, yaws]);

  // A failed/cancelled deletion leaves the file in the directory. Restore its
  // static matrix immediately instead of leaving a partially de-rezzed hut.
  const completedDeletionsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!meshRef.current) return;

    let matricesChanged = false;
    for (const path of deletionProgressRef.current.keys()) {
      if (deletingFiles.has(path)) continue;

      deletionProgressRef.current.delete(path);
      completedDeletionsRef.current.delete(path);
      const blockIndex = blockIndexByPath.get(path);
      if (blockIndex === undefined) continue;

      const block = blocks[blockIndex];
      tempPosition.set(...block.position);
      tempScale.setScalar(block.scale);
      tempQuaternion.setFromAxisAngle(Y_AXIS, yaws[blockIndex]);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current.setMatrixAt(blockIndex, tempMatrix);
      matricesChanged = true;
    }

    for (const path of completedDeletionsRef.current) {
      if (!deletingFiles.has(path)) completedDeletionsRef.current.delete(path);
    }

    if (matricesChanged) meshRef.current.instanceMatrix.needsUpdate = true;
  }, [blocks, blockIndexByPath, deletingFiles, tempMatrix, tempPosition, tempQuaternion, tempScale, yaws]);

  // Animate: gentle bob, pulsing glow, mark visuals, de-rez animation
  useFrame(({ clock }, delta) => {
    if (!meshRef.current) return;

    const time = clock.getElapsedTime();

    // Static structures keep their original GPU instance matrices. Only active
    // de-rez entries touch the buffer, rather than rewriting every file every frame.
    let matricesChanged = false;
    for (const { path, blockIndex } of activeDeletions) {
      if (completedDeletionsRef.current.has(path)) continue;
      const block = blocks[blockIndex];
      const currentProgress = deletionProgressRef.current.get(path) || 0;
      const deletionProgress = Math.min(1, currentProgress + delta / DEREZ_DURATION);
      const scale = block.scale * (1 - deletionProgress);

      deletionProgressRef.current.set(path, deletionProgress);
      tempPosition.set(block.position[0], block.position[1] - deletionProgress * 2, block.position[2]);
      tempScale.set(scale, scale, scale);
      tempQuaternion.setFromAxisAngle(Y_AXIS, yaws[blockIndex]);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current.setMatrixAt(blockIndex, tempMatrix);
      matricesChanged = true;

      if (deletionProgress >= 1) {
        completedDeletionsRef.current.add(path);
        onDeletionComplete?.(path);
      }
    }
    if (matricesChanged) meshRef.current.instanceMatrix.needsUpdate = true;

    // Pulsing glow on material (stronger pulse for marked files)
    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    if (material) {
      if (hasMarkedBlock) {
        material.emissiveIntensity = 0.25 + Math.sin(time * 4) * 0.12;
      } else {
        material.emissiveIntensity = 0.08;
      }
    }

    // Merged outlines cannot animate one entry independently. Hide the category
    // outline during its short deletion pass so a full-size ghost is not left behind.
    if (groupRef.current) {
      groupRef.current.visible = activeDeletions.length === 0;
      groupRef.current.position.y = 0;
    }
  });

  // Hover detection
  const handlePointerOver = (event: any) => {
    event.stopPropagation();
    const instanceId = event.instanceId;
    if (instanceId !== undefined && blocks[instanceId]) {
      onHover(blocks[instanceId]);
    }
  };

  const handlePointerOut = (event: any) => {
    event.stopPropagation();
    onHover(null);
  };

  return (
    <>
      {/* Instanced mesh for transparent faces */}
      <instancedMesh
        ref={meshRef}
        args={[geometry, undefined, blocks.length]}
        castShadow={blocks.length <= MAX_SHADOWED_BLOCKS_PER_CATEGORY}
        receiveShadow
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <meshStandardMaterial
          vertexColors
          color="#ffffff"
          emissive={categoryColor}
          emissiveIntensity={0.08}
          roughness={0.9}
          metalness={0.02}
        />
      </instancedMesh>

      {/* Merged wireframe edges */}
      {mergedWireframe && (
        <group ref={groupRef}>
          <lineSegments geometry={mergedWireframe}>
            <lineBasicMaterial color={categoryColor} transparent opacity={0.56} toneMapped={false} />
          </lineSegments>
        </group>
      )}

      {/* Marked file overlays - pulsing red-orange glow */}
      {blocks.filter(block => markedFiles.has(block.path)).map((block) => (
        <group key={`marked-${block.path}`} position={block.position} rotation={[0, blockYaw(block.path), 0]}>
          <mesh position={[0, block.scale * 0.1, 0]}>
            <boxGeometry args={[block.scale * 1.55, block.scale * 1.55, block.scale * 1.35]} />
            <meshBasicMaterial color="#ff4c1f" wireframe transparent opacity={0.65} toneMapped={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]}>
            <ringGeometry args={[block.scale * 0.72, block.scale * 0.88, 24]} />
            <meshBasicMaterial color="#ff6a28" transparent opacity={0.72} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}

    </>
  );
}

function ProximityFileLabels({
  blocks,
  markedFiles,
}: {
  blocks: BlockData[];
  markedFiles: Set<string>;
}) {
  const [visiblePaths, setVisiblePaths] = useState<string[]>([]);
  const nextRefreshAtRef = useRef(0);
  const lastSelectionKeyRef = useRef('');
  const lastBlocksRef = useRef(blocks);
  const lastMarkedFilesRef = useRef(markedFiles);
  const { blocksByPath, blocksByCell } = useMemo(() => {
    const byPath = new Map<string, BlockData>();
    const byCell = new Map<string, BlockData[]>();

    for (const block of blocks) {
      byPath.set(block.path, block);
      const cellX = Math.floor(block.position[0] / LABEL_INDEX_CELL_SIZE);
      const cellZ = Math.floor(block.position[2] / LABEL_INDEX_CELL_SIZE);
      const key = labelCellKey(cellX, cellZ);
      const cell = byCell.get(key);
      if (cell) cell.push(block);
      else byCell.set(key, [block]);
    }

    return { blocksByPath: byPath, blocksByCell: byCell };
  }, [blocks]);

  useFrame(({ camera, clock }) => {
    const inputsChanged = lastBlocksRef.current !== blocks || lastMarkedFilesRef.current !== markedFiles;
    if (!inputsChanged && clock.elapsedTime < nextRefreshAtRef.current) return;

    lastBlocksRef.current = blocks;
    lastMarkedFilesRef.current = markedFiles;
    nextRefreshAtRef.current = clock.elapsedTime + 0.4;

    const refreshCellX = Math.floor(camera.position.x / LABEL_REFRESH_CELL_SIZE);
    const refreshCellZ = Math.floor(camera.position.z / LABEL_REFRESH_CELL_SIZE);
    const selectionKey = labelCellKey(refreshCellX, refreshCellZ);
    if (!inputsChanged && selectionKey === lastSelectionKeyRef.current) return;
    lastSelectionKeyRef.current = selectionKey;

    const ranked: Array<{ block: BlockData; distanceSq: number; marked: boolean }> = [];
    const seenPaths = new Set<string>();
    const indexCellX = Math.floor(camera.position.x / LABEL_INDEX_CELL_SIZE);
    const indexCellZ = Math.floor(camera.position.z / LABEL_INDEX_CELL_SIZE);
    const indexRadius = Math.ceil(Math.sqrt(LABEL_VISIBILITY_RADIUS_SQ) / LABEL_INDEX_CELL_SIZE);

    for (let x = indexCellX - indexRadius; x <= indexCellX + indexRadius; x += 1) {
      for (let z = indexCellZ - indexRadius; z <= indexCellZ + indexRadius; z += 1) {
        const cell = blocksByCell.get(labelCellKey(x, z));
        if (!cell) continue;

        for (const block of cell) {
          const dx = block.position[0] - camera.position.x;
          const dz = block.position[2] - camera.position.z;
          const distanceSq = dx * dx + dz * dz;
          const marked = markedFiles.has(block.path);
          if (!marked && distanceSq > LABEL_VISIBILITY_RADIUS_SQ) continue;
          seenPaths.add(block.path);
          ranked.push({ block, distanceSq, marked });
        }
      }
    }

    // Marked targets remain identifiable even when they are outside the local
    // label query. This loop scales with selections, not total directory size.
    for (const path of markedFiles) {
      if (seenPaths.has(path)) continue;
      const block = blocksByPath.get(path);
      if (!block) continue;
      const dx = block.position[0] - camera.position.x;
      const dz = block.position[2] - camera.position.z;
      const distanceSq = dx * dx + dz * dz;
      ranked.push({ block, distanceSq, marked: true });
    }

    const nextVisiblePaths = ranked
      .sort((left, right) => {
        if (left.marked !== right.marked) return left.marked ? -1 : 1;
        return left.distanceSq - right.distanceSq;
      })
      .slice(0, MAX_FLOATING_LABELS)
      .map(entry => entry.block.path);

    setVisiblePaths(current => (
      current.length === nextVisiblePaths.length
      && current.every((path, index) => path === nextVisiblePaths[index])
        ? current
        : nextVisiblePaths
    ));
  });

  const visibleBlocks = useMemo(
    () => visiblePaths
      .map(path => blocksByPath.get(path))
      .filter((block): block is BlockData => block !== undefined),
    [blocksByPath, visiblePaths],
  );

  return (
    <>
      {visibleBlocks.map(block => (
        <Text
          key={block.path}
          position={[block.position[0], block.position[1] + block.scale * 1.65 + 0.45, block.position[2]]}
          rotation={[0, Math.PI, 0]}
          fontSize={0.2}
          color={block.color}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {block.name}
        </Text>
      ))}
    </>
  );
}

function ObjectiveFileMarkers({
  blocks,
  deletingFiles,
}: {
  blocks: BlockData[];
  deletingFiles: Set<string>;
}) {
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const flagRef = useRef<THREE.InstancedMesh>(null);
  const lastUpdateRef = useRef(-1);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const activeObjectives = useMemo(
    () => blocks.filter(block => block.isObjective && !deletingFiles.has(block.path)),
    [blocks, deletingFiles],
  );

  useLayoutEffect(() => {
    if (!ringRef.current || !poleRef.current || !flagRef.current) return;
    ringRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    poleRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    flagRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    ringRef.current.count = activeObjectives.length;
    poleRef.current.count = activeObjectives.length;
    flagRef.current.count = activeObjectives.length;

    activeObjectives.forEach((block, index) => {
      const markerX = block.position[0] + block.scale * 0.92;
      const markerZ = block.position[2] - block.scale * 0.68;

      dummy.position.set(block.position[0], 0.028, block.position[2]);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(block.scale * 1.08);
      dummy.updateMatrix();
      ringRef.current!.setMatrixAt(index, dummy.matrix);

      dummy.position.set(markerX, 0.92, markerZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.025, 0.9, 0.025);
      dummy.updateMatrix();
      poleRef.current!.setMatrixAt(index, dummy.matrix);

      dummy.position.set(markerX + 0.2, 1.62, markerZ);
      dummy.rotation.set(0, 0, -0.08);
      dummy.scale.set(0.42, 0.19, 1);
      dummy.updateMatrix();
      flagRef.current!.setMatrixAt(index, dummy.matrix);
    });

    for (const mesh of [ringRef.current, poleRef.current, flagRef.current]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }, [activeObjectives, dummy]);

  useFrame(({ clock }) => {
    const rings = ringRef.current;
    if (!rings || activeObjectives.length === 0) return;
    const now = clock.elapsedTime;
    if (now - lastUpdateRef.current < 1 / 15) return;
    lastUpdateRef.current = now;

    activeObjectives.forEach((block, index) => {
      const pulse = 1 + Math.sin(now * 2.6 + index * 1.4) * 0.08;
      dummy.position.set(block.position[0], 0.03, block.position[2]);
      dummy.rotation.set(-Math.PI / 2, 0, now * 0.22 + index * 0.5);
      dummy.scale.setScalar(block.scale * 1.08 * pulse);
      dummy.updateMatrix();
      rings.setMatrixAt(index, dummy.matrix);
    });
    rings.instanceMatrix.needsUpdate = true;
  });

  if (activeObjectives.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={ringRef} args={[undefined, undefined, activeObjectives.length]} renderOrder={72}>
        <ringGeometry args={[0.82, 1, 28]} />
        <meshBasicMaterial color="#cfe982" transparent opacity={0.82} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={poleRef} args={[undefined, undefined, activeObjectives.length]}>
        <cylinderGeometry args={[1, 1.18, 1, 6]} />
        <meshStandardMaterial color="#574a2c" roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={flagRef} args={[undefined, undefined, activeObjectives.length]} renderOrder={71}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#739b4b" side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

interface FileBlocksProps {
  blocks: Map<FileCategory, BlockData[]>;
  onHover: (block: BlockData | null) => void;
  onMeshRefsReady?: (refs: React.RefObject<THREE.InstancedMesh | null>[]) => void;
  markedFiles?: Set<string>;
  deletingFiles?: Set<string>;
  onDeletionComplete?: (filePath: string) => void;
}

export function FileBlocks({ blocks, onHover, onMeshRefsReady, markedFiles = new Set(), deletingFiles = new Set(), onDeletionComplete }: FileBlocksProps) {
  const [hoveredBlock, setHoveredBlock] = useState<BlockData | null>(null);

  // Collect mesh refs for hit detection
  const meshRefs = useRef<Map<FileCategory, React.RefObject<THREE.InstancedMesh | null>>>(new Map());

  // Report mesh refs when they're ready
  useEffect(() => {
    if (onMeshRefsReady && meshRefs.current.size > 0) {
      const refs = Array.from(meshRefs.current.values());
      onMeshRefsReady(refs);
    }
  }, [onMeshRefsReady, blocks]);

  useEffect(() => {
    if (!hoveredBlock) return;

    const stillExists = Array.from(blocks.values())
      .some(categoryBlocks => categoryBlocks.some(block => block.path === hoveredBlock.path));

    if (!stillExists) {
      setHoveredBlock(null);
      onHover(null);
    }
  }, [blocks, hoveredBlock, onHover]);

  const handleHover = (block: BlockData | null) => {
    setHoveredBlock(block);
    onHover(block);
  };
  const allBlocks = useMemo(() => Array.from(blocks.values()).flat(), [blocks]);

  return (
    <>
      {/* Render instanced blocks per category */}
      {Array.from(blocks.entries()).map(([category, categoryBlocks]) => {
        // Create or get ref for this category
        if (!meshRefs.current.has(category)) {
          meshRefs.current.set(category, createRef<THREE.InstancedMesh>());
        }
        const categoryMeshRef = meshRefs.current.get(category)!;

        return (
          <InstancedCategoryBlocks
            key={category}
            blocks={categoryBlocks}
            category={category}
            onHover={handleHover}
            meshRef={categoryMeshRef}
            markedFiles={markedFiles}
            deletingFiles={deletingFiles}
            onDeletionComplete={onDeletionComplete}
          />
        );
      })}

      <ProximityFileLabels blocks={allBlocks} markedFiles={markedFiles} />
      <ObjectiveFileMarkers blocks={allBlocks} deletingFiles={deletingFiles} />

      {/* Hover tooltip */}
      {hoveredBlock && (
        <Html
          position={[
            hoveredBlock.position[0],
            hoveredBlock.position[1] + hoveredBlock.scale * 1.65 + 0.9,
            hoveredBlock.position[2],
          ]}
          center
          distanceFactor={10}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(5, 5, 16, 0.95)',
              border: '2px solid #879b63',
              borderRadius: '4px',
              padding: '8px 12px',
              color: '#ffffff',
              fontFamily: 'monospace',
              fontSize: '14px',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{hoveredBlock.name}</div>
            <div>{formatBytes(hoveredBlock.size)}</div>
          </div>
        </Html>
      )}
    </>
  );
}
