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
const FRIENDLY_RIFLE_SPEED = 31;
const FRIENDLY_RIFLE_LIFETIME = 2.7;
// The squad sustains the firefight without clearing the whole encounter before
// the player can engage; concentrated rifle fire still finishes exposed targets.
const FRIENDLY_RIFLE_DAMAGE = 1;
const FRIENDLY_MAX_RANGE = 58;
const TRACER_LENGTH = 0.58;

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
  burstSize: number;
}

interface SoldierRuntime {
  nextShotAt: number;
  shotIndex: number;
  flashUntil: number;
  recoilUntil: number;
  burstRemaining: number;
}

export interface USInfantrySquadProps {
  enemies: readonly EnemyCombatant[];
  obstacles?: readonly CombatObstacle[];
  onEnemyHit?: (event: FriendlyEnemyHitEvent) => void;
  onFriendlyFire?: (event: FriendlyFireEvent) => void;
  enabled?: boolean;
}

const SQUAD: readonly SquadMember[] = [
  { id: 'us-rifle-1', position: [-5.65, 0.02, -5.35], kneeling: true, radioOperator: false, fireInterval: 1.42, initialDelay: 0.42, accuracy: 0.024, burstSize: 3 },
  { id: 'us-rifle-2', position: [-4.12, 0.02, -5.18], kneeling: true, radioOperator: false, fireInterval: 1.55, initialDelay: 0.86, accuracy: 0.03, burstSize: 2 },
  { id: 'us-rifle-3', position: [4.18, 0.02, -3.96], kneeling: true, radioOperator: false, fireInterval: 1.48, initialDelay: 1.16, accuracy: 0.026, burstSize: 3 },
  { id: 'us-rto-4', position: [5.72, 0.02, -3.78], kneeling: false, radioOperator: true, fireInterval: 1.72, initialDelay: 1.48, accuracy: 0.032, burstSize: 2 },
  { id: 'us-rifle-5', position: [0.25, 0.02, 1.82], kneeling: true, radioOperator: false, fireInterval: 1.62, initialDelay: 1.82, accuracy: 0.027, burstSize: 2 },
];

const FIGHTING_POSITIONS = [
  { id: 'left', position: [-4.9, 0.02, -4.7] as [number, number, number], rotation: -0.08, width: 3.15 },
  { id: 'right', position: [4.95, 0.02, -3.28] as [number, number, number], rotation: 0.08, width: 3.15 },
  { id: 'forward', position: [0.25, 0.02, 2.48] as [number, number, number], rotation: 0, width: 1.85 },
] as const;

export const US_INFANTRY_MINIMAP_CONTACTS = SQUAD.map(member => ({ position: member.position }));

function deterministicNoise(id: string, index: number, salt: number) {
  const seed = hashCombatSession(id);
  const value = Math.sin(seed * 0.00017 + index * 73.317 + salt * 23.113) * 43758.5453;
  return value - Math.floor(value);
}

function Sandbag({
  position,
  rotation = 0,
  shade = 0,
}: {
  position: [number, number, number];
  rotation?: number;
  shade?: number;
}) {
  const colors = ['#8c8257', '#756d49', '#9a8c5c'];

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh scale={[0.29, 0.115, 0.17]} castShadow receiveShadow>
        <sphereGeometry args={[1, 10, 6]} />
        <meshStandardMaterial color={colors[shade % colors.length]} roughness={1} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.17, 0.1, 0.17]}>
        <torusGeometry args={[1, 0.035, 4, 10]} />
        <meshStandardMaterial color="#5d563b" roughness={1} />
      </mesh>
    </group>
  );
}

function WetGrassClump({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  const blades = [-0.16, -0.08, 0, 0.09, 0.17];

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {blades.map((x, index) => {
        const height = 0.38 + (index % 3) * 0.11;
        return (
          <mesh
            key={x}
            position={[x, height * 0.5, Math.sin(index * 1.8) * 0.08]}
            rotation={[0.03 * (index - 2), 0, (x / 0.17) * -0.14]}
            castShadow
          >
            <coneGeometry args={[0.035, height, 4]} />
            <meshStandardMaterial
              color={index % 2 === 0 ? '#394b2d' : '#536238'}
              roughness={0.86}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function FightingPosition({
  position,
  rotation,
  width,
}: {
  position: [number, number, number];
  rotation: number;
  width: number;
}) {
  const lowerCount = Math.max(3, Math.round(width / 0.5));
  const lower = Array.from({ length: lowerCount }, (_, index) => (
    -width * 0.5 + (index + 0.5) * (width / lowerCount)
  ));
  const upper = lower.slice(0, -1).map((value, index) => (
    value + width / lowerCount * 0.5 + Math.sin(index * 2.3) * 0.025
  ));

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Dark churned soil grounds the emplacement and keeps the wall from floating. */}
      <mesh position={[0, -0.004, -0.18]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[width * 0.55, 18]} />
        <meshStandardMaterial color="#3c3a24" roughness={1} />
      </mesh>
      <mesh
        position={[-width * 0.08, 0.004, -0.45]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.9, 0.36, 1]}
        receiveShadow
      >
        <circleGeometry args={[width * 0.43, 18]} />
        <meshStandardMaterial
          color="#30483d"
          roughness={0.32}
          metalness={0.08}
          transparent
          opacity={0.72}
        />
      </mesh>

      <group position={[0, 0, 0]}>
        {lower.map((x, index) => (
          <Sandbag key={`lower-${index}`} position={[x, 0.13, 0]} shade={index} />
        ))}
        {upper.map((x, index) => (
          <Sandbag key={`upper-${index}`} position={[x, 0.32, 0.015]} rotation={index % 2 === 0 ? 0.025 : -0.025} shade={index + 1} />
        ))}
        {[-1, 1].flatMap(side => [0, 1, 2].map(step => (
          <Sandbag
            key={`wing-${side}-${step}`}
            position={[side * (width * 0.5 - 0.05), 0.13 + (step === 2 ? 0.17 : 0), -0.32 - step * 0.38]}
            rotation={Math.PI * 0.5}
            shade={step + (side > 0 ? 1 : 0)}
          />
        )))}
      </group>

      {/* A few practical details sell a hastily occupied Vietnam-era fire base. */}
      <group position={[width * 0.31, 0.14, -0.68]} rotation={[0, -0.08, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.48, 0.28, 0.35]} />
          <meshStandardMaterial color="#4d5634" roughness={0.94} />
        </mesh>
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[0.5, 0.035, 0.37]} />
          <meshStandardMaterial color="#6c7245" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.12, 0.012, 5, 12, Math.PI]} />
          <meshStandardMaterial color="#2d3328" metalness={0.35} roughness={0.65} />
        </mesh>
      </group>
      <mesh position={[-width * 0.29, 0.08, -0.74]} rotation={[0, 0.16, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.34, 9]} />
        <meshStandardMaterial color="#4c5736" roughness={0.85} metalness={0.18} />
      </mesh>
      <WetGrassClump position={[-width * 0.48, 0, 0.1]} rotation={0.12} />
      <WetGrassClump position={[width * 0.46, 0, -0.08]} rotation={-0.18} />
      {width > 2 && <WetGrassClump position={[-width * 0.18, 0, -0.96]} rotation={0.4} />}
    </group>
  );
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
  const uniform = index % 2 === 0 ? '#3f4c35' : '#46543a';

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
              <meshStandardMaterial color="#343f30" roughness={0.88} />
            </mesh>
            <mesh position={[0.1, 0.14, 0.12]} rotation={[1.17, 0, -0.1]} castShadow>
              <cylinderGeometry args={[0.052, 0.066, 0.29, 7]} />
              <meshStandardMaterial color="#343f30" roughness={0.88} />
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
                <meshStandardMaterial color="#343f30" roughness={0.88} />
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
          <meshStandardMaterial color="#343f30" roughness={0.86} />
        </mesh>
        <mesh position={[0, bodyY, 0]} castShadow>
          <boxGeometry args={[0.35, 0.35, 0.22]} />
          <meshStandardMaterial color={uniform} roughness={0.84} />
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
            <meshStandardMaterial color={index % 2 === 0 ? '#44523b' : '#505b40'} roughness={0.82} />
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
            <pointLight color="#ffbf54" intensity={2.6} distance={2.2} decay={2} />
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
    }

    SQUAD.forEach((member, memberIndex) => {
      let runtime = runtimeRef.current.get(member.id);
      if (!runtime) {
        runtime = {
          nextShotAt: now + member.initialDelay,
          shotIndex: 0,
          flashUntil: 0,
          recoilUntil: 0,
          burstRemaining: member.burstSize,
        };
        runtimeRef.current.set(member.id, runtime);
      }

      const soldier = soldierRefs.current[memberIndex];
      const body = bodyRefs.current[memberIndex];
      const flash = flashRefs.current[memberIndex];
      if (soldier) {
        // Small foot/weight shifts stop the fire team reading as five static props,
        // while staying tight enough to their fighting positions to preserve cover.
        soldier.position.x = member.position[0]
          + Math.sin(now * (0.34 + memberIndex * 0.025) + memberIndex * 1.7) * 0.045;
        soldier.position.z = member.position[2]
          + Math.sin(now * 0.27 + memberIndex * 2.1) * 0.026;
      }
      if (body) {
        const recoil = now < runtime.recoilUntil
          ? Math.sin((runtime.recoilUntil - now) * 62) * 0.034
          : 0;
        body.rotation.x = recoil + (member.kneeling ? -0.012 : 0.045);
        body.rotation.z = Math.sin(now * 1.3 + memberIndex * 1.9) * 0.018;
        body.position.y = Math.sin(now * 1.05 + memberIndex) * 0.009
          - (member.kneeling ? (Math.sin(now * 0.42 + memberIndex) + 1) * 0.008 : 0);
        body.position.z = recoil * 0.6;
      }
      if (flash) {
        flash.visible = now < runtime.flashUntil;
        if (flash.visible) flash.scale.setScalar(0.82 + Math.sin(now * 157 + memberIndex) * 0.18);
      }

      if (!enabled || enemies.length === 0) {
        if (soldier) {
          soldier.rotation.y = Math.PI
            + Math.sin(now * 0.24 + memberIndex * 1.3) * (member.radioOperator ? 0.34 : 0.22);
        }
        return;
      }
      const orderedTargets = Array.from(enemies)
        .filter(enemy => enemy.alive)
        .sort((left, right) => {
          const leftDistance = Math.hypot(left.position[0] - member.position[0], left.position[2] - member.position[2]);
          const rightDistance = Math.hypot(right.position[0] - member.position[0], right.position[2] - member.position[2]);
          return leftDistance - rightDistance;
        });
      if (orderedTargets.length === 0) return;

      const preferredTargetIndex = memberIndex % Math.min(orderedTargets.length, 3);
      const aimTarget = orderedTargets[preferredTargetIndex];
      if (soldier) {
        soldier.rotation.y = Math.atan2(
          -(aimTarget.position[0] - member.position[0]),
          -(aimTarget.position[2] - member.position[2]),
        );
      }
      if (now < runtime.nextShotAt) return;

      // Read the actual rendered rifle muzzle after aim/stance animation. This
      // keeps every flash and tracer attached to the barrel instead of appearing
      // beside the soldier when the fire team turns toward an off-axis target.
      if (soldier && flash) {
        soldier.updateWorldMatrix(true, true);
        flash.getWorldPosition(muzzlePosition);
      } else {
        muzzlePosition.set(
          member.position[0],
          member.position[1] + (member.kneeling ? 0.57 : 0.71),
          member.position[2],
        );
      }

      let selectedTarget: EnemyCombatant | null = null;
      let suppressionTarget: EnemyCombatant | null = null;
      for (let offset = 0; offset < orderedTargets.length; offset += 1) {
        const candidate = orderedTargets[(offset + preferredTargetIndex) % orderedTargets.length];
        targetPosition.set(
          candidate.position[0],
          candidate.position[1] + (candidate.stance === 'kneeling' ? 0.52 : 0.68),
          candidate.position[2],
        );
        const distance = muzzlePosition.distanceTo(targetPosition);
        if (distance > FRIENDLY_MAX_RANGE) continue;
        suppressionTarget ??= candidate;
        const obstacleT = findNearestObstacleHit(muzzlePosition, targetPosition, obstacles);
        if (obstacleT !== null && obstacleT < 0.9) continue;
        if (terrainBlocksCombatSegment(muzzlePosition, targetPosition)) continue;
        selectedTarget = candidate;
        break;
      }

      // The team still lays visible suppressive fire when vegetation, huts, or a
      // mound masks every direct lane. Collision checks below continue to stop the
      // projectile at that cover, so this improves feedback without wall-hacking.
      selectedTarget ??= suppressionTarget;
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

      if (spawnFriendlyRound(muzzlePosition, shotDirection, member.id)) {
        runtime.flashUntil = now + 0.075;
        runtime.recoilUntil = now + 0.11;
        onFriendlyFire?.({
          soldierId: member.id,
          targetEnemyId: selectedTarget.id,
          position: muzzlePosition.clone(),
          direction: shotDirection.clone(),
        });
      }
      runtime.burstRemaining -= 1;
      if (runtime.burstRemaining > 0) {
        runtime.nextShotAt = now + 0.105 + deterministicNoise(member.id, shotIndex, 5) * 0.065;
      } else {
        runtime.burstRemaining = member.burstSize;
        runtime.nextShotAt = now + member.fireInterval * (
          0.9 + deterministicNoise(member.id, shotIndex, 4) * 0.25
        );
      }
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
      {FIGHTING_POSITIONS.map(position => (
        <FightingPosition
          key={position.id}
          position={position.position}
          rotation={position.rotation}
          width={position.width}
        />
      ))}

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
