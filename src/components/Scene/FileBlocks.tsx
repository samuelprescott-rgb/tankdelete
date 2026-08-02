import { useRef, useMemo, useEffect, useState, createRef } from 'react';
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
  const thatch = '#756a3f';
  const earth = '#51452f';
  const accent = STRUCTURE_ACCENTS[category];

  if (category === 'media') {
    addPart(new THREE.BoxGeometry(1.45, 0.62, 0.92), wood, [0, -0.08, 0]);
    addPart(new THREE.ConeGeometry(0.95, 0.52, 4), thatch, [0, 0.49, 0], [0, Math.PI / 4, 0], [1.36, 1, 1]);
    [[-0.52, -0.47], [0.52, -0.47], [-0.52, 0.47], [0.52, 0.47]].forEach(([x, z]) => {
      addPart(new THREE.CylinderGeometry(0.045, 0.06, 0.42, 6), darkWood, [x, -0.47, z]);
    });
    addPart(new THREE.BoxGeometry(0.28, 0.42, 0.035), accent, [0, -0.12, -0.48]);
  } else if (category === 'code') {
    addPart(new THREE.BoxGeometry(0.9, 0.82, 0.82), wood, [0, -0.02, 0]);
    addPart(new THREE.ConeGeometry(0.72, 0.5, 4), thatch, [0, 0.63, 0], [0, Math.PI / 4, 0]);
    addPart(new THREE.CylinderGeometry(0.025, 0.035, 1.55, 6), accent, [0.27, 1.18, 0.12]);
    addPart(new THREE.SphereGeometry(0.09, 6, 4), accent, [0.27, 1.97, 0.12]);
    addPart(new THREE.BoxGeometry(0.24, 0.4, 0.035), darkWood, [0, -0.12, -0.43]);
  } else if (category === 'archive') {
    addPart(new THREE.BoxGeometry(1.25, 0.55, 1.0), earth, [0, -0.19, 0]);
    addPart(new THREE.BoxGeometry(1.42, 0.18, 1.14), thatch, [0, 0.18, 0]);
    [-0.52, 0, 0.52].forEach(x => {
      addPart(new THREE.CylinderGeometry(0.11, 0.11, 0.92, 7), '#76684a', [x, -0.36, -0.56], [0, 0, Math.PI / 2]);
    });
    addPart(new THREE.BoxGeometry(0.34, 0.38, 0.05), accent, [0, -0.18, -0.53]);
  } else {
    addPart(new THREE.BoxGeometry(1.0, 0.7, 0.9), wood, [0, -0.11, 0]);
    addPart(new THREE.ConeGeometry(0.82, 0.52, 4), thatch, [0, 0.47, 0], [0, Math.PI / 4, 0]);
    addPart(new THREE.BoxGeometry(0.25, 0.42, 0.035), darkWood, [0, -0.17, -0.47]);
    addPart(new THREE.BoxGeometry(0.18, 0.18, 0.035), accent, [0.3, 0.03, -0.47]);
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

  // Create merged wireframe geometry for all blocks in this category
  const mergedWireframe = useMemo(() => {
    const edgeGeometries: THREE.EdgesGeometry[] = [];

    for (const block of blocks) {
      const edgesGeometry = new THREE.EdgesGeometry(geometry, 15);
      const matrix = new THREE.Matrix4();
      matrix.compose(
        new THREE.Vector3(...block.position),
        new THREE.Quaternion(),
        new THREE.Vector3(block.scale, block.scale, block.scale)
      );
      edgesGeometry.applyMatrix4(matrix);
      edgeGeometries.push(edgesGeometry);
    }

    if (edgeGeometries.length === 0) return null;
    const merged = mergeGeometries(edgeGeometries);

    // Clean up individual geometries
    edgeGeometries.forEach(g => g.dispose());

    return merged;
  }, [blocks, geometry]);

  // Pre-allocated objects for frame updates
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);

  // Setup instance matrices
  useEffect(() => {
    if (!meshRef.current) return;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      tempPosition.set(...block.position);
      tempScale.set(block.scale, block.scale, block.scale);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current.setMatrixAt(i, tempMatrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [blocks, tempMatrix, tempPosition, tempQuaternion, tempScale]);

  // Animate: gentle bob, pulsing glow, mark visuals, de-rez animation
  useFrame(({ clock }, delta) => {
    if (!meshRef.current || !groupRef.current) return;

    const time = clock.getElapsedTime();

    // Update deletion progress for deleting files
    for (const block of blocks) {
      if (deletingFiles.has(block.path)) {
        const currentProgress = deletionProgressRef.current.get(block.path) || 0;
        const newProgress = currentProgress + delta / DEREZ_DURATION;

        if (newProgress >= 1.0) {
          // Animation complete
          deletionProgressRef.current.delete(block.path);
          if (onDeletionComplete) {
            onDeletionComplete(block.path);
          }
        } else {
          deletionProgressRef.current.set(block.path, newProgress);
        }
      }
    }

    // Update instance matrices with bob animation, mark visuals, and de-rez
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const isDeleting = deletingFiles.has(block.path);
      const deletionProgress = deletionProgressRef.current.get(block.path) || 0;

      // De-rez animation: shrink and sink
      let scale = block.scale;
      let yOffset = 0;
      if (isDeleting) {
        scale = block.scale * (1 - deletionProgress);
        yOffset = -deletionProgress * 2; // Sink into ground
      }

      tempPosition.set(block.position[0], block.position[1] + yOffset, block.position[2]);
      tempScale.set(scale, scale, scale);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current.setMatrixAt(i, tempMatrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;

    // Pulsing glow on material (stronger pulse for marked files)
    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    if (material) {
      const hasMarked = blocks.some(b => markedFiles.has(b.path));
      if (hasMarked) {
        material.emissiveIntensity = 0.25 + Math.sin(time * 4) * 0.12;
      } else {
        material.emissiveIntensity = 0.08;
      }
    }

    groupRef.current.position.y = 0;
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
            <lineBasicMaterial color={categoryColor} toneMapped={false} />
          </lineSegments>
        </group>
      )}

      {/* Marked file overlays - pulsing red-orange glow */}
      {blocks.filter(block => markedFiles.has(block.path)).map((block) => (
        <group key={`marked-${block.path}`} position={block.position}>
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

      {/* Floating filename labels */}
      {blocks.map((block) => (
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
