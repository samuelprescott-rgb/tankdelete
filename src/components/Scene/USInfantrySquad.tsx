import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CombatObstacle,
  EnemyCombatant,
  findNearestLivingEnemyHit,
  findNearestObstacleHit,
  FriendlyEnemyHitEvent,
  FriendlyFireEvent,
  hashCombatSession,
  terrainBlocksCombatSegment,
} from '../../lib/combat';

const FRIENDLY_PROJECTILE_CAPACITY = 40;
const FRIENDLY_RIFLE_SPEED = 27;
const FRIENDLY_RIFLE_LIFETIME = 2.7;
// The squad sustains the firefight without clearing the whole encounter before
// the player can engage; concentrated rifle fire still finishes exposed targets.
const FRIENDLY_RIFLE_DAMAGE = 9;
const FRIENDLY_MAX_RANGE = 58;
const TRACER_LENGTH = 0.68;

interface FriendlyProjectile {
  active: boolean;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  direction: THREE.Vector3;
  lifetime: number;
  soldierId: string;
}

interface SquadMember {
  id: string;
  position: [number, number, number];
  kneeling: boolean;
  radioOperator: boolean;
  fireInterval: number;
  initialDelay: number;
  accuracy: number;
}

interface SoldierRuntime {
  nextShotAt: number;
  shotIndex: number;
  flashUntil: number;
}

export interface USInfantrySquadProps {
  enemies: readonly EnemyCombatant[];
  obstacles?: readonly CombatObstacle[];
  onEnemyHit?: (event: FriendlyEnemyHitEvent) => void;
  onFriendlyFire?: (event: FriendlyFireEvent) => void;
  enabled?: boolean;
}

const SQUAD: readonly SquadMember[] = [
  { id: 'us-rifle-1', position: [-4.8, 0.02, -5.4], kneeling: true, radioOperator: false, fireInterval: 1.18, initialDelay: 0.7, accuracy: 0.022 },
  { id: 'us-rifle-2', position: [4.5, 0.02, -4.1], kneeling: false, radioOperator: false, fireInterval: 1.36, initialDelay: 1.05, accuracy: 0.028 },
  { id: 'us-rifle-3', position: [-7.1, 0.02, 2.4], kneeling: true, radioOperator: false, fireInterval: 1.28, initialDelay: 1.35, accuracy: 0.024 },
  { id: 'us-rto-4', position: [6.7, 0.02, 2.2], kneeling: false, radioOperator: true, fireInterval: 1.52, initialDelay: 1.7, accuracy: 0.03 },
  { id: 'us-rifle-5', position: [0.3, 0.02, 4.8], kneeling: true, radioOperator: false, fireInterval: 1.42, initialDelay: 2.05, accuracy: 0.025 },
];

export const US_INFANTRY_MINIMAP_CONTACTS = SQUAD.map(member => ({ position: member.position }));

function deterministicNoise(id: string, index: number, salt: number) {
  const seed = hashCombatSession(id);
  const value = Math.sin(seed * 0.00017 + index * 73.317 + salt * 23.113) * 43758.5453;
  return value - Math.floor(value);
}

function SoldierModel({
  member,
  index,
  soldierRefs,
  bodyRefs,
  flashRefs,
}: {
  member: SquadMember;
  index: number;
  soldierRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  bodyRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  flashRefs: React.MutableRefObject<Array<THREE.Mesh | null>>;
}) {
  const bodyY = member.kneeling ? 0.49 : 0.62;
  const headY = member.kneeling ? 0.76 : 0.9;
  const rifleY = member.kneeling ? 0.57 : 0.71;
  const uniform = index % 2 === 0 ? '#546444' : '#5d6947';

  return (
    <group
      ref={node => { soldierRefs.current[index] = node; }}
      position={member.position}
      scale={0.96}
    >
      <group ref={node => { bodyRefs.current[index] = node; }}>
        {member.kneeling ? (
          <>
            <mesh position={[-0.09, 0.17, 0.02]} rotation={[0.7, 0, 0.08]} castShadow>
              <cylinderGeometry args={[0.052, 0.066, 0.34, 7]} />
              <meshStandardMaterial color="#48533b" roughness={0.98} />
            </mesh>
            <mesh position={[0.1, 0.14, 0.12]} rotation={[1.17, 0, -0.1]} castShadow>
              <cylinderGeometry args={[0.052, 0.066, 0.29, 7]} />
              <meshStandardMaterial color="#48533b" roughness={0.98} />
            </mesh>
            <mesh position={[0.1, 0.05, 0.24]} castShadow>
              <boxGeometry args={[0.11, 0.075, 0.23]} />
              <meshStandardMaterial color="#312f24" roughness={1} />
            </mesh>
          </>
        ) : (
          [-0.09, 0.09].map(legX => (
            <group key={legX}>
              <mesh position={[legX, 0.22, 0]} castShadow>
                <cylinderGeometry args={[0.052, 0.066, 0.39, 7]} />
                <meshStandardMaterial color="#48533b" roughness={0.98} />
              </mesh>
              <mesh position={[legX, 0.04, -0.045]} castShadow>
                <boxGeometry args={[0.105, 0.075, 0.2]} />
                <meshStandardMaterial color="#312f24" roughness={1} />
              </mesh>
            </group>
          ))
        )}

        <mesh position={[0, bodyY - 0.16, 0.015]} castShadow>
          <boxGeometry args={[0.26, 0.2, 0.19]} />
          <meshStandardMaterial color="#48533b" roughness={0.96} />
        </mesh>
        <mesh position={[0, bodyY, 0]} castShadow>
          <boxGeometry args={[0.35, 0.35, 0.22]} />
          <meshStandardMaterial color={uniform} roughness={0.95} />
        </mesh>
        <mesh position={[0, bodyY + 0.015, -0.122]} castShadow>
          <boxGeometry args={[0.3, 0.28, 0.055]} />
          <meshStandardMaterial color="#6f714f" roughness={0.98} />
        </mesh>

        {/* M1956-style webbing, canteen and ammunition pouches. */}
        <mesh position={[-0.07, bodyY + 0.005, -0.154]} rotation={[0, 0, -0.25]}>
          <boxGeometry args={[0.032, 0.36, 0.018]} />
          <meshStandardMaterial color="#8a8058" roughness={1} />
        </mesh>
        <mesh position={[0.07, bodyY + 0.005, -0.154]} rotation={[0, 0, 0.25]}>
          <boxGeometry args={[0.032, 0.36, 0.018]} />
          <meshStandardMaterial color="#8a8058" roughness={1} />
        </mesh>
        {[-0.11, 0.11].map(pouchX => (
          <mesh key={pouchX} position={[pouchX, bodyY - 0.15, -0.17]} castShadow>
            <boxGeometry args={[0.1, 0.11, 0.065]} />
            <meshStandardMaterial color="#6f6848" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0.18, bodyY - 0.14, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 0.17, 8]} />
          <meshStandardMaterial color="#5f694a" roughness={1} />
        </mesh>

        {member.radioOperator && (
          <group position={[0, bodyY, 0.16]}>
            <mesh castShadow>
              <boxGeometry args={[0.27, 0.32, 0.17]} />
              <meshStandardMaterial color="#3f4b34" roughness={0.94} />
            </mesh>
            <mesh position={[0.1, 0.55, 0.03]} rotation={[0.03, 0, -0.04]}>
              <cylinderGeometry args={[0.007, 0.012, 1.05, 6]} />
              <meshStandardMaterial color="#272d26" metalness={0.3} roughness={0.68} />
            </mesh>
          </group>
        )}

        <mesh position={[0, headY - 0.1, 0]}>
          <cylinderGeometry args={[0.055, 0.065, 0.1, 7]} />
          <meshStandardMaterial color="#8c6849" roughness={1} />
        </mesh>
        <mesh position={[0, headY, -0.015]} castShadow>
          <sphereGeometry args={[0.11, 9, 6]} />
          <meshStandardMaterial color="#956f50" roughness={1} />
        </mesh>

        {/* M1 helmet with subdued cloth cover and elastic band. */}
        <group position={[0, headY + 0.09, 0]}>
          <mesh scale={[1.16, 0.57, 1.1]} castShadow>
            <sphereGeometry args={[0.135, 11, 7, 0, Math.PI * 2, 0, Math.PI * 0.68]} />
            <meshStandardMaterial color={index % 2 === 0 ? '#4b5940' : '#596047'} roughness={0.98} />
          </mesh>
          <mesh position={[0, -0.007, 0]}>
            <torusGeometry args={[0.122, 0.011, 5, 14]} />
            <meshStandardMaterial color="#323b2d" roughness={1} />
          </mesh>
        </group>

        {/* Both arms are visibly planted on the rifle. */}
        <mesh position={[-0.19, rifleY + 0.01, -0.09]} rotation={[1.15, 0, -0.23]} castShadow>
          <cylinderGeometry args={[0.043, 0.053, 0.34, 7]} />
          <meshStandardMaterial color={uniform} roughness={0.96} />
        </mesh>
        <mesh position={[0.18, rifleY + 0.01, -0.08]} rotation={[1.08, 0, 0.24]} castShadow>
          <cylinderGeometry args={[0.043, 0.053, 0.32, 7]} />
          <meshStandardMaterial color={uniform} roughness={0.96} />
        </mesh>
        {[-0.105, 0.105].map(handX => (
          <mesh key={handX} position={[handX, rifleY - 0.01, -0.25]}>
            <sphereGeometry args={[0.052, 7, 5]} />
            <meshStandardMaterial color="#956f50" roughness={1} />
          </mesh>
        ))}

        {/* Early M16 silhouette: stock, carry handle, triangular fore-end and long barrel. */}
        <group position={[0, rifleY, -0.11]}>
          <mesh position={[0, 0, 0.1]} castShadow>
            <boxGeometry args={[0.09, 0.105, 0.26]} />
            <meshStandardMaterial color="#282e29" roughness={0.72} metalness={0.24} />
          </mesh>
          <mesh position={[0, 0, -0.09]} castShadow>
            <boxGeometry args={[0.085, 0.1, 0.18]} />
            <meshStandardMaterial color="#1d2321" roughness={0.56} metalness={0.48} />
          </mesh>
          <mesh position={[0, 0.09, -0.075]} castShadow>
            <boxGeometry args={[0.045, 0.07, 0.15]} />
            <meshStandardMaterial color="#222824" roughness={0.62} metalness={0.4} />
          </mesh>
          <mesh position={[0, -0.085, -0.1]} rotation={[0.18, 0, 0]} castShadow>
            <boxGeometry args={[0.065, 0.18, 0.09]} />
            <meshStandardMaterial color="#202622" roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.015, -0.28]} rotation={[Math.PI / 2, 0, 0]} scale={[0.07, 0.085, 0.24]} castShadow>
            <coneGeometry args={[1, 1, 4]} />
            <meshStandardMaterial color="#30372f" roughness={0.74} />
          </mesh>
          <mesh position={[0, 0.015, -0.49]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.013, 0.017, 0.36, 7]} />
            <meshStandardMaterial color="#1a201e" roughness={0.55} metalness={0.58} />
          </mesh>
          <mesh position={[0, 0.015, -0.69]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.021, 0.014, 0.07, 6]} />
            <meshStandardMaterial color="#171c1b" roughness={0.52} metalness={0.6} />
          </mesh>
          <mesh
            ref={node => { flashRefs.current[index] = node; }}
            position={[0, 0.015, -0.76]}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
            renderOrder={87}
          >
            <coneGeometry args={[0.075, 0.2, 7]} />
            <meshBasicMaterial
              color="#ffe28b"
              transparent
              opacity={0.94}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function USInfantrySquad({
  enemies,
  obstacles = [],
  onEnemyHit,
  onFriendlyFire,
  enabled = true,
}: USInfantrySquadProps) {
  const soldierRefs = useRef<Array<THREE.Group | null>>([]);
  const bodyRefs = useRef<Array<THREE.Group | null>>([]);
  const flashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const tracerRefs = useRef<Array<THREE.Group | null>>([]);
  const runtimeRef = useRef(new Map<string, SoldierRuntime>());

  const projectilePool = useMemo<FriendlyProjectile[]>(() => (
    Array.from({ length: FRIENDLY_PROJECTILE_CAPACITY }, () => ({
      active: false,
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      lifetime: 0,
      soldierId: '',
    }))
  ), []);
  const muzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const shotDirection = useMemo(() => new THREE.Vector3(), []);
  const impactPosition = useMemo(() => new THREE.Vector3(), []);
  const tracerForward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const tracerQuaternion = useMemo(() => new THREE.Quaternion(), []);

  const spawnFriendlyRound = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    soldierId: string,
  ) => {
    const projectile = projectilePool.find(candidate => !candidate.active);
    if (!projectile) return false;
    projectile.active = true;
    projectile.position.copy(position);
    projectile.previousPosition.copy(position);
    projectile.direction.copy(direction).normalize();
    projectile.lifetime = 0;
    projectile.soldierId = soldierId;
    return true;
  };

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    for (const tracer of tracerRefs.current) if (tracer) tracer.visible = false;

    if (!enabled) {
      for (const projectile of projectilePool) projectile.active = false;
      for (const flash of flashRefs.current) if (flash) flash.visible = false;
      return;
    }

    SQUAD.forEach((member, memberIndex) => {
      let runtime = runtimeRef.current.get(member.id);
      if (!runtime) {
        runtime = { nextShotAt: now + member.initialDelay, shotIndex: 0, flashUntil: 0 };
        runtimeRef.current.set(member.id, runtime);
      }

      const soldier = soldierRefs.current[memberIndex];
      const body = bodyRefs.current[memberIndex];
      const flash = flashRefs.current[memberIndex];
      if (body) {
        body.rotation.z = Math.sin(now * 1.3 + memberIndex * 1.9) * 0.012;
        body.position.y = Math.sin(now * 1.05 + memberIndex) * 0.007;
      }
      if (flash) {
        flash.visible = now < runtime.flashUntil;
        if (flash.visible) flash.scale.setScalar(0.82 + Math.sin(now * 157 + memberIndex) * 0.18);
      }

      if (enemies.length === 0) return;
      const orderedTargets = Array.from(enemies)
        .filter(enemy => enemy.alive)
        .sort((left, right) => {
          const leftDistance = Math.hypot(left.position[0] - member.position[0], left.position[2] - member.position[2]);
          const rightDistance = Math.hypot(right.position[0] - member.position[0], right.position[2] - member.position[2]);
          return leftDistance - rightDistance;
        });
      if (orderedTargets.length === 0) return;

      const aimTarget = orderedTargets[memberIndex % Math.min(orderedTargets.length, 3)];
      if (soldier) {
        soldier.rotation.y = Math.atan2(
          -(aimTarget.position[0] - member.position[0]),
          -(aimTarget.position[2] - member.position[2]),
        );
      }
      if (now < runtime.nextShotAt) return;

      muzzlePosition.set(
        member.position[0],
        member.position[1] + (member.kneeling ? 0.57 : 0.71),
        member.position[2],
      );

      let selectedTarget: EnemyCombatant | null = null;
      for (let offset = 0; offset < orderedTargets.length; offset += 1) {
        const candidate = orderedTargets[(offset + memberIndex) % orderedTargets.length];
        targetPosition.set(
          candidate.position[0],
          candidate.position[1] + (candidate.stance === 'kneeling' ? 0.52 : 0.68),
          candidate.position[2],
        );
        const distance = muzzlePosition.distanceTo(targetPosition);
        if (distance > FRIENDLY_MAX_RANGE) continue;
        const obstacleT = findNearestObstacleHit(muzzlePosition, targetPosition, obstacles);
        if (obstacleT !== null && obstacleT < 0.9) continue;
        if (terrainBlocksCombatSegment(muzzlePosition, targetPosition)) continue;
        selectedTarget = candidate;
        break;
      }

      if (!selectedTarget) {
        runtime.nextShotAt = now + 0.45;
        return;
      }

      targetPosition.set(
        selectedTarget.position[0],
        selectedTarget.position[1] + (selectedTarget.stance === 'kneeling' ? 0.52 : 0.68),
        selectedTarget.position[2],
      );
      shotDirection.copy(targetPosition).sub(muzzlePosition).normalize();
      const shotIndex = runtime.shotIndex++;
      shotDirection.x += (deterministicNoise(member.id, shotIndex, 1) - 0.5) * member.accuracy * 2;
      shotDirection.y += (deterministicNoise(member.id, shotIndex, 2) - 0.5) * member.accuracy;
      shotDirection.z += (deterministicNoise(member.id, shotIndex, 3) - 0.5) * member.accuracy * 2;
      shotDirection.normalize();
      muzzlePosition.addScaledVector(shotDirection, 0.76);

      if (spawnFriendlyRound(muzzlePosition, shotDirection, member.id)) {
        runtime.flashUntil = now + 0.065;
        onFriendlyFire?.({
          soldierId: member.id,
          targetEnemyId: selectedTarget.id,
          position: muzzlePosition.clone(),
          direction: shotDirection.clone(),
        });
      }
      runtime.nextShotAt = now + member.fireInterval * (
        0.86 + deterministicNoise(member.id, shotIndex, 4) * 0.28
      );
    });

    projectilePool.forEach((projectile, projectileIndex) => {
      if (!projectile.active) return;
      projectile.previousPosition.copy(projectile.position);
      projectile.position.addScaledVector(projectile.direction, FRIENDLY_RIFLE_SPEED * delta);
      projectile.lifetime += delta;

      if (projectile.lifetime >= FRIENDLY_RIFLE_LIFETIME
        || terrainBlocksCombatSegment(projectile.previousPosition, projectile.position)) {
        projectile.active = false;
        return;
      }

      const obstacleHitT = projectile.lifetime > 0.08
        ? findNearestObstacleHit(projectile.previousPosition, projectile.position, obstacles)
        : null;
      const enemyHit = findNearestLivingEnemyHit(
        projectile.previousPosition,
        projectile.position,
        enemies,
      );

      if (enemyHit && (obstacleHitT === null || enemyHit.t < obstacleHitT)) {
        impactPosition.copy(enemyHit.point);
        onEnemyHit?.({
          soldierId: projectile.soldierId,
          enemyId: enemyHit.enemy.id,
          position: impactPosition.clone(),
          damage: FRIENDLY_RIFLE_DAMAGE,
        });
        projectile.active = false;
        return;
      }
      if (obstacleHitT !== null) {
        projectile.active = false;
        return;
      }

      const tracer = tracerRefs.current[projectileIndex];
      if (!tracer) return;
      tracer.visible = true;
      tracer.position.copy(projectile.position);
      tracerQuaternion.setFromUnitVectors(tracerForward, projectile.direction);
      tracer.quaternion.copy(tracerQuaternion);
    });
  });

  return (
    <group>
      {SQUAD.map((member, index) => (
        <SoldierModel
          key={member.id}
          member={member}
          index={index}
          soldierRefs={soldierRefs}
          bodyRefs={bodyRefs}
          flashRefs={flashRefs}
        />
      ))}

      {Array.from({ length: FRIENDLY_PROJECTILE_CAPACITY }, (_, index) => (
        <group
          key={`friendly-tracer-${index}`}
          ref={node => { tracerRefs.current[index] = node; }}
          visible={false}
          renderOrder={86}
          frustumCulled={false}
        >
          <mesh position={[0, 0, -TRACER_LENGTH * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.021, 0.011, TRACER_LENGTH, 6]} />
            <meshBasicMaterial
              color="#ffe39b"
              transparent
              opacity={0.96}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, -TRACER_LENGTH * 0.52]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.052, 0.022, TRACER_LENGTH * 1.08, 6]} />
            <meshBasicMaterial
              color="#e0a64f"
              transparent
              opacity={0.22}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.057, 8, 6]} />
            <meshBasicMaterial
              color="#fff4c6"
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
