import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Projectile } from '../../hooks/useProjectilePool';
import { PROJECTILE_MAX_LIFETIME, PROJECTILE_SPEED } from '../../lib/constants';
import { BlockData } from '../../hooks/useFileBlocks';
import {
  EnemyCombatant,
  ENEMY_HIT_RADIUS,
  findNearestLivingEnemyHit,
  segmentSphereIntersection,
} from '../../lib/combat';

const MAX_PROJECTILES = 48;
const HIT_RADIUS = 1.5;
const MACHINE_GUN_SPEED = PROJECTILE_SPEED * 1.65;

interface ProjectileManagerProps {
  pool: React.RefObject<Projectile[]>;
  despawn: (index: number) => void;
  onHit: (filePath: string, projectile: Projectile) => void;
  onEnemyHit: (enemyId: string, projectile: Projectile) => void;
  allBlocks: BlockData[];
  enemies: readonly EnemyCombatant[];
}

export function ProjectileManager({
  pool,
  despawn,
  onHit,
  onEnemyHit,
  allBlocks,
  enemies,
}: ProjectileManagerProps) {
  const tracerRefs = useRef<Array<THREE.Group | null>>([]);
  const coreRefs = useRef<Array<THREE.Mesh | null>>([]);
  const glowRefs = useRef<Array<THREE.Mesh | null>>([]);
  const headRefs = useRef<Array<THREE.Mesh | null>>([]);

  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const previousPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tracerForward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const cannonColor = useMemo(() => new THREE.Color('#ffb52e'), []);
  const machineGunColor = useMemo(() => new THREE.Color('#fff3bd'), []);

  useFrame((_state, delta) => {
    if (!pool.current) return;

    for (const tracer of tracerRefs.current) {
      if (tracer) tracer.visible = false;
    }

    for (let i = 0; i < pool.current.length; i++) {
      const projectile = pool.current[i];
      if (!projectile.active) continue;

      const speed = projectile.kind === 'machinegun' ? MACHINE_GUN_SPEED : PROJECTILE_SPEED;
      previousPosition.copy(projectile.position);
      projectile.position.addScaledVector(projectile.direction, speed * delta);
      projectile.lifetime += delta;

      if (projectile.lifetime > PROJECTILE_MAX_LIFETIME) {
        despawn(i);
        continue;
      }

      let hitBlock: BlockData | null = null;
      let hitEnemyId: string | null = null;
      let nearestHitT = Infinity;

      for (const block of allBlocks) {
        tempPosition.set(...block.position);
        const hitT = segmentSphereIntersection(
          previousPosition,
          projectile.position,
          tempPosition,
          HIT_RADIUS,
        );
        if (hitT !== null && hitT < nearestHitT) {
          nearestHitT = hitT;
          hitBlock = block;
          hitEnemyId = null;
        }
      }

      const enemyHit = findNearestLivingEnemyHit(
        previousPosition,
        projectile.position,
        enemies,
        projectile.kind === 'machinegun' ? ENEMY_HIT_RADIUS * 1.18 : ENEMY_HIT_RADIUS,
      );
      if (enemyHit && enemyHit.t < nearestHitT) {
        nearestHitT = enemyHit.t;
        hitEnemyId = enemyHit.enemy.id;
        hitBlock = null;
      }

      if (hitEnemyId) {
        onEnemyHit(hitEnemyId, projectile);
        despawn(i);
        continue;
      }

      if (hitBlock) {
        onHit(hitBlock.path, projectile);
        despawn(i);
        continue;
      }

      const tracer = tracerRefs.current[i];
      const core = coreRefs.current[i];
      const glow = glowRefs.current[i];
      const head = headRefs.current[i];
      if (!tracer || !core || !glow || !head) continue;

      const isMachineGun = projectile.kind === 'machinegun';
      const color = isMachineGun ? machineGunColor : cannonColor;
      const trailLength = isMachineGun ? 1.7 : 2.5;
      const coreWidth = isMachineGun ? 0.055 : 0.08;

      tracer.visible = true;
      tracer.position.copy(projectile.position);
      tempQuaternion.setFromUnitVectors(tracerForward, projectile.direction);
      tracer.quaternion.copy(tempQuaternion);

      core.position.z = -trailLength * 0.5;
      core.scale.set(coreWidth, trailLength, coreWidth);
      (core.material as THREE.MeshBasicMaterial).color.copy(color);

      glow.position.z = -trailLength * 0.5;
      glow.scale.set(coreWidth * 2.4, trailLength * 1.08, coreWidth * 2.4);
      (glow.material as THREE.MeshBasicMaterial).color.copy(color);

      const headSize = isMachineGun ? 0.14 : 0.2;
      head.scale.setScalar(headSize);
      (head.material as THREE.MeshBasicMaterial).color.copy(color);
    }
  });

  return (
    <>
      {Array.from({ length: MAX_PROJECTILES }, (_, index) => (
        <group
          key={index}
          ref={node => { tracerRefs.current[index] = node; }}
          visible={false}
          renderOrder={80}
        >
          <mesh ref={node => { glowRefs.current[index] = node; }} rotation={[Math.PI / 2, 0, 0]} renderOrder={80}>
            <cylinderGeometry args={[1, 0.25, 1, 8]} />
            <meshBasicMaterial
              color="#fff3bd"
              transparent
              opacity={0.34}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={node => { coreRefs.current[index] = node; }} rotation={[Math.PI / 2, 0, 0]} renderOrder={81}>
            <cylinderGeometry args={[1, 0.25, 1, 8]} />
            <meshBasicMaterial
              color="#fff3bd"
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={node => { headRefs.current[index] = node; }} renderOrder={82}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.98}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
