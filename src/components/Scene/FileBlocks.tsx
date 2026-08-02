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
        castShadow
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
