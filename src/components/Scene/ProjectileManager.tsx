import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Projectile } from '../../hooks/useProjectilePool';
import { PROJECTILE_SPEED, PROJECTILE_MAX_LIFETIME } from '../../lib/constants';
import { BlockData } from '../../hooks/useFileBlocks';

const MAX_PROJECTILES = 48;
const HIT_RADIUS = 1.5; // Distance threshold for projectile-block collision
const MACHINE_GUN_SPEED = PROJECTILE_SPEED * 1.65;

interface ProjectileManagerProps {
  pool: React.RefObject<Projectile[]>;
  despawn: (index: number) => void;
  onHit: (filePath: string, projectile: Projectile) => void;
  allBlocks: BlockData[];
}

export function ProjectileManager({
  pool,
  despawn,
  onHit,
  allBlocks,
}: ProjectileManagerProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const glowMeshRef = useRef<THREE.InstancedMesh>(null);

  // Pre-allocate temp vectors
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const tracerForward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const cannonColor = useMemo(() => new THREE.Color('#e3b341'), []);
  const machineGunColor = useMemo(() => new THREE.Color('#ffe197'), []);

  useFrame((_state, delta) => {
    if (!pool.current || !meshRef.current || !glowMeshRef.current) return;

    let visibleCount = 0;

    for (let i = 0; i < pool.current.length; i++) {
      const projectile = pool.current[i];
      if (!projectile.active) continue;

      // Move projectile
      const speed = projectile.kind === 'machinegun' ? MACHINE_GUN_SPEED : PROJECTILE_SPEED;
      projectile.position.addScaledVector(projectile.direction, speed * delta);
      projectile.lifetime += delta;

      // Despawn if too old
      if (projectile.lifetime > PROJECTILE_MAX_LIFETIME) {
        despawn(i);
        continue;
      }

      // Proximity-based hit detection — find nearest block within hit radius
      let hitBlock: BlockData | null = null;
      let minDist = Infinity;

      for (const block of allBlocks) {
        const dist = tempPosition.set(...block.position).distanceTo(projectile.position);
        if (dist < minDist && dist < HIT_RADIUS) {
          minDist = dist;
          hitBlock = block;
        }
      }

      if (hitBlock) {
        onHit(hitBlock.path, projectile);
        despawn(i);
        continue;
      }

      // Update instance matrix for visible projectile
      tempQuaternion.setFromUnitVectors(tracerForward, projectile.direction);
      if (projectile.kind === 'machinegun') {
        tempScale.set(0.9, 0.9, 1.15);
      } else {
        tempScale.set(1.25, 1.25, 0.85);
      }
      tempMatrix.compose(projectile.position, tempQuaternion, tempScale);
      meshRef.current.setMatrixAt(visibleCount, tempMatrix);
      meshRef.current.setColorAt(
        visibleCount,
        projectile.kind === 'machinegun' ? machineGunColor : cannonColor,
      );

      tempScale.setScalar(projectile.kind === 'machinegun' ? 0.18 : 0.28);
      tempMatrix.compose(projectile.position, tempQuaternion.identity(), tempScale);
      glowMeshRef.current.setMatrixAt(visibleCount, tempMatrix);
      glowMeshRef.current.setColorAt(
        visibleCount,
        projectile.kind === 'machinegun' ? machineGunColor : cannonColor,
      );
      visibleCount++;
    }

    meshRef.current.count = visibleCount;
    glowMeshRef.current.count = visibleCount;
    if (visibleCount > 0) {
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
      glowMeshRef.current.instanceMatrix.needsUpdate = true;
      if (glowMeshRef.current.instanceColor) glowMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PROJECTILES]} frustumCulled={false}>
        <boxGeometry args={[0.16, 0.16, 3.2]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.96}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={glowMeshRef} args={[undefined, undefined, MAX_PROJECTILES]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}
