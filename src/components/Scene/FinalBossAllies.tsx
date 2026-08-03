import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { isInsideArena } from '../../lib/arenaBounds';
import {
  findNearestObstacleHit,
  terrainBlocksCombatSegment,
  type CombatObstacle,
  type FriendlyCombatPose,
} from '../../lib/combat';
import {
  FINAL_BOSS_ALLY_ASSIST_FLOOR_RATIO,
  FINAL_BOSS_ALLY_DEFINITIONS,
  type FinalBossAllyCombatant,
  type FinalBossAllyFireEvent,
  type FinalBossAllyRole,
} from '../../lib/finalBossAllies';
import { intersectsTerrainMound } from '../../lib/terrain';
import {
  findNearestLivingZombieHit,
  type FriendlyZombieHitEvent,
  type ZombieCombatant,
  type ZombieCombatPose,
} from '../../lib/zombieEpilogue';

const ALLY_COLLISION_RADIUS = 0.56;
const CAVALRY_COLLISION_RADIUS = 0.82;
const ALLY_ARENA_PADDING = 4;
const MAX_FRAME_DELTA = 0.08;
const PROJECTILE_CAPACITY = 48;
const PROJECTILE_SPEED = 38;
const PROJECTILE_LIFETIME = 2.1;
const MAX_RANGED_DISTANCE = 48;

/** Low by design: the player's weapons remain the encounter's deciding force. */
export const FINAL_BOSS_ALLY_TUNING = Object.freeze({
  attackPhaseSeconds: 3,
  repositionPhaseSeconds: 2,
  heavyDamage: 7,
  heavyBurstSize: 6,
  heavyShotInterval: 0.105,
  heavyBurstRecovery: 0.92,
  rifleDamage: 5,
  rifleBurstSize: 3,
  rifleShotInterval: 0.18,
  rifleBurstRecovery: 1.18,
  cavalryDamage: 22,
  cavalrySlashInterval: 0.82,
  cavalryChargeSpeed: 9.8,
  cavalryStuckRecoverySeconds: 0.7,
  cavalryProgressTimeoutSeconds: 2,
} as const);

interface AllyRuntime {
  position: THREE.Vector3;
  yaw: number;
  orbitDirection: -1 | 1;
  nextShotAt: number;
  shotIndex: number;
  burstRemaining: number;
  nextManeuverAt: number;
  combatPhase: 'attack' | 'reposition';
  combatPhaseUntil: number;
  chargeState: 'setup' | 'charge' | 'withdraw';
  chargeTargetId: string | null;
  blockedSeconds: number;
  lastProgressAt: number;
  lastProgressPosition: THREE.Vector3;
  recoverySequence: number;
  wasAlive: boolean;
  defeatElapsed: number;
}

interface AllyProjectile {
  active: boolean;
  allyId: string;
  role: Exclude<FinalBossAllyRole, 'mounted-cavalry'>;
  damage: number;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  direction: THREE.Vector3;
  lifetime: number;
}

export interface FinalBossAlliesProps {
  allies: readonly FinalBossAllyCombatant[];
  posesRef: RefObject<Map<string, FriendlyCombatPose>>;
  zombies: readonly ZombieCombatant[];
  zombiePosesRef: RefObject<Map<string, ZombieCombatPose>>;
  obstacles?: readonly CombatObstacle[];
  enabled?: boolean;
  onZombieHit?: (event: FriendlyZombieHitEvent) => void;
  onFire?: (event: FinalBossAllyFireEvent) => void;
}

const GEOMETRY = {
  head: new THREE.SphereGeometry(0.2, 9, 7),
  torso: new THREE.BoxGeometry(0.5, 0.7, 0.3),
  limb: new THREE.CylinderGeometry(0.07, 0.085, 0.58, 6),
  boot: new THREE.BoxGeometry(0.13, 0.12, 0.25),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
  horseBody: new THREE.SphereGeometry(0.5, 10, 7),
  horseHead: new THREE.BoxGeometry(0.35, 0.48, 0.58),
  hatBrim: new THREE.CylinderGeometry(0.32, 0.32, 0.035, 12),
  hatCrown: new THREE.CylinderGeometry(0.17, 0.2, 0.22, 10),
  tracer: new THREE.BoxGeometry(0.036, 0.036, 0.5),
  tracerGlow: new THREE.BoxGeometry(0.09, 0.09, 0.56),
  guardianHalo: new THREE.TorusGeometry(0.29, 0.026, 6, 20),
  shadow: new THREE.CircleGeometry(0.7, 14),
};

const makeUnlitMaterial = (color: string) => (
  new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
  })
);

const MATERIAL = {
  jungle: makeUnlitMaterial('#31452d'),
  jungleDark: makeUnlitMaterial('#233529'),
  khaki: makeUnlitMaterial('#777047'),
  khakiLight: makeUnlitMaterial('#96885a'),
  skin: makeUnlitMaterial('#9b6a4b'),
  skinLight: makeUnlitMaterial('#aa7655'),
  hair: makeUnlitMaterial('#241c17'),
  leather: makeUnlitMaterial('#35271e'),
  horse: makeUnlitMaterial('#5b3925'),
  horseDark: makeUnlitMaterial('#36261d'),
  steel: makeUnlitMaterial('#252a29'),
  steelLight: makeUnlitMaterial('#686c63'),
  brass: makeUnlitMaterial('#9b7a36'),
  red: makeUnlitMaterial('#a51e18'),
  white: makeUnlitMaterial('#d7d0b8'),
  shadow: new THREE.MeshBasicMaterial({
    color: '#0d120d', transparent: true, opacity: 0.34, depthWrite: false,
    side: THREE.DoubleSide,
  }),
  tracer: new THREE.MeshBasicMaterial({
    color: '#ffe6a4', transparent: true, opacity: 0.98,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }),
  tracerGlow: new THREE.MeshBasicMaterial({
    color: '#f0a33f', transparent: true, opacity: 0.26,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }),
  flash: new THREE.MeshBasicMaterial({
    color: '#fff2ad', transparent: true, opacity: 0.92,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }),
  guardianHalo: new THREE.MeshBasicMaterial({
    color: '#ffd76a', transparent: true, opacity: 0.82,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }),
};

function GuardianHalo({ role }: { role: FinalBossAllyRole }) {
  const mounted = role === 'mounted-cavalry';
  return (
    <mesh
      geometry={GEOMETRY.guardianHalo}
      material={MATERIAL.guardianHalo}
      position={[0, mounted ? 2.72 : 1.82, -0.01]}
      rotation-x={Math.PI / 2}
      frustumCulled={false}
      renderOrder={4}
    />
  );
}

function PrimitiveLimb({
  position,
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  material = MATERIAL.jungle,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  material?: THREE.Material;
}) {
  return (
    <mesh
      geometry={GEOMETRY.limb}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
    />
  );
}

function HeavyGunnerModel({
  setFlashRef,
}: {
  setFlashRef: (node: THREE.Mesh | null) => void;
}) {
  return (
    <group>
      <mesh geometry={GEOMETRY.shadow} material={MATERIAL.shadow} rotation-x={-Math.PI / 2} position-y={0.012} />
      <mesh geometry={GEOMETRY.torso} material={MATERIAL.jungle} position={[0, 0.9, 0]} scale={[1.18, 1.08, 1.08]} castShadow />
      <mesh geometry={GEOMETRY.box} material={MATERIAL.brass} position={[0, 0.94, -0.17]} rotation-z={-0.55} scale={[0.1, 0.84, 0.07]} />
      <mesh geometry={GEOMETRY.head} material={MATERIAL.skin} position={[0, 1.48, -0.04]} scale={[1.02, 1.04, 0.98]} castShadow />
      <mesh geometry={GEOMETRY.box} material={MATERIAL.hair} position={[0, 1.62, -0.02]} scale={[0.36, 0.1, 0.34]} />
      <PrimitiveLimb position={[-0.35, 0.91, -0.17]} rotation={[-1.02, 0, -0.15]} scale={[1.28, 1.08, 1.28]} material={MATERIAL.skin} />
      <PrimitiveLimb position={[0.35, 0.91, -0.17]} rotation={[-1.02, 0, 0.15]} scale={[1.28, 1.08, 1.28]} material={MATERIAL.skin} />
      <PrimitiveLimb position={[-0.17, 0.35, 0]} scale={[1.2, 1.18, 1.2]} material={MATERIAL.jungleDark} />
      <PrimitiveLimb position={[0.17, 0.35, 0]} scale={[1.2, 1.18, 1.2]} material={MATERIAL.jungleDark} />
      <mesh geometry={GEOMETRY.boot} material={MATERIAL.leather} position={[-0.17, 0.08, -0.06]} />
      <mesh geometry={GEOMETRY.boot} material={MATERIAL.leather} position={[0.17, 0.08, -0.06]} />
      <group position={[0, 0.9, -0.48]}>
        <mesh geometry={GEOMETRY.box} material={MATERIAL.steel} scale={[0.48, 0.2, 0.28]} castShadow />
        {[-0.07, 0, 0.07].map(offset => (
          <mesh
            key={offset}
            geometry={GEOMETRY.cylinder}
            material={MATERIAL.steelLight}
            position={[offset, 0, -0.48]}
            rotation-x={Math.PI / 2}
            scale={[0.022, 0.78, 0.022]}
          />
        ))}
        <mesh geometry={GEOMETRY.cylinder} material={MATERIAL.steel} position={[0, 0, -0.22]} rotation-x={Math.PI / 2} scale={[0.12, 0.24, 0.12]} />
        <mesh ref={setFlashRef} geometry={GEOMETRY.head} material={MATERIAL.flash} position={[0, 0, -0.92]} scale={[0.25, 0.14, 0.4]} visible={false} />
      </group>
    </group>
  );
}

function MountedCavalryModel() {
  return (
    <group>
      <mesh geometry={GEOMETRY.shadow} material={MATERIAL.shadow} rotation-x={-Math.PI / 2} position-y={0.012} scale={[1.45, 1, 1]} />
      <mesh geometry={GEOMETRY.horseBody} material={MATERIAL.horse} position={[0, 0.84, 0]} scale={[1.28, 0.72, 1.7]} castShadow />
      <mesh geometry={GEOMETRY.horseHead} material={MATERIAL.horse} position={[0, 1.2, -0.85]} rotation-x={-0.25} castShadow />
      <PrimitiveLimb position={[-0.31, 0.36, -0.45]} scale={[1.2, 1.35, 1.2]} material={MATERIAL.horseDark} />
      <PrimitiveLimb position={[0.31, 0.36, -0.45]} scale={[1.2, 1.35, 1.2]} material={MATERIAL.horseDark} />
      <PrimitiveLimb position={[-0.31, 0.36, 0.45]} scale={[1.2, 1.35, 1.2]} material={MATERIAL.horseDark} />
      <PrimitiveLimb position={[0.31, 0.36, 0.45]} scale={[1.2, 1.35, 1.2]} material={MATERIAL.horseDark} />
      <mesh geometry={GEOMETRY.box} material={MATERIAL.leather} position={[0, 1.16, 0.15]} scale={[0.7, 0.12, 0.72]} />
      <mesh geometry={GEOMETRY.torso} material={MATERIAL.khaki} position={[0, 1.65, 0.05]} scale={[0.92, 0.92, 0.9]} castShadow />
      <mesh geometry={GEOMETRY.head} material={MATERIAL.skinLight} position={[0, 2.12, -0.02]} castShadow />
      <mesh geometry={GEOMETRY.hatBrim} material={MATERIAL.khakiLight} position={[0, 2.27, -0.02]} />
      <mesh geometry={GEOMETRY.hatCrown} material={MATERIAL.khakiLight} position={[0, 2.39, -0.02]} />
      <PrimitiveLimb position={[-0.3, 1.68, -0.1]} rotation={[-0.65, 0, -0.12]} material={MATERIAL.khaki} />
      <PrimitiveLimb position={[0.31, 1.75, -0.17]} rotation={[-1.05, 0, 0.22]} material={MATERIAL.khaki} />
      <group position={[0.53, 1.76, -0.43]} rotation={[0.18, 0, -0.12]}>
        <mesh geometry={GEOMETRY.cylinder} material={MATERIAL.steelLight} rotation-x={Math.PI / 2} scale={[0.025, 0.82, 0.025]} />
        <mesh geometry={GEOMETRY.box} material={MATERIAL.brass} position={[0, 0, 0.43]} scale={[0.11, 0.05, 0.16]} />
      </group>
    </group>
  );
}

function RifleScoutModel({
  setFlashRef,
}: {
  setFlashRef: (node: THREE.Mesh | null) => void;
}) {
  return (
    <group>
      <mesh geometry={GEOMETRY.shadow} material={MATERIAL.shadow} rotation-x={-Math.PI / 2} position-y={0.012} />
      <mesh geometry={GEOMETRY.torso} material={MATERIAL.jungleDark} position={[0, 0.85, 0]} scale={[0.92, 1.02, 0.9]} castShadow />
      <mesh geometry={GEOMETRY.head} material={MATERIAL.skin} position={[0, 1.36, -0.04]} scale={[0.95, 1.04, 0.94]} castShadow />
      <mesh geometry={GEOMETRY.box} material={MATERIAL.hair} position={[0, 1.51, 0]} scale={[0.35, 0.11, 0.34]} />
      <mesh geometry={GEOMETRY.box} material={MATERIAL.red} position={[0, 1.47, -0.18]} scale={[0.43, 0.075, 0.045]} />
      <mesh geometry={GEOMETRY.box} material={MATERIAL.red} position={[0.22, 1.45, -0.02]} rotation-y={-0.35} scale={[0.16, 0.045, 0.07]} />
      <PrimitiveLimb position={[-0.3, 0.88, -0.14]} rotation={[-0.95, 0, -0.12]} material={MATERIAL.jungle} />
      <PrimitiveLimb position={[0.3, 0.88, -0.14]} rotation={[-0.95, 0, 0.12]} material={MATERIAL.jungle} />
      <PrimitiveLimb position={[-0.14, 0.32, 0]} material={MATERIAL.jungleDark} />
      <PrimitiveLimb position={[0.14, 0.32, 0]} material={MATERIAL.jungleDark} />
      <mesh geometry={GEOMETRY.boot} material={MATERIAL.leather} position={[-0.14, 0.07, -0.07]} />
      <mesh geometry={GEOMETRY.boot} material={MATERIAL.leather} position={[0.14, 0.07, -0.07]} />
      <group position={[0, 0.88, -0.42]}>
        <mesh geometry={GEOMETRY.box} material={MATERIAL.steel} scale={[0.13, 0.12, 0.72]} />
        <mesh geometry={GEOMETRY.box} material={MATERIAL.leather} position={[0, -0.1, 0.2]} rotation-x={-0.4} scale={[0.1, 0.24, 0.12]} />
        <mesh geometry={GEOMETRY.cylinder} material={MATERIAL.steelLight} position={[0, 0, -0.63]} rotation-x={Math.PI / 2} scale={[0.018, 0.55, 0.018]} />
        <mesh ref={setFlashRef} geometry={GEOMETRY.head} material={MATERIAL.flash} position={[0, 0, -0.93]} scale={[0.18, 0.11, 0.28]} visible={false} />
      </group>
    </group>
  );
}

function isMovementBlocked(
  x: number,
  z: number,
  role: FinalBossAllyRole,
  allyId: string,
  obstacles: readonly CombatObstacle[],
  runtimes: ReadonlyMap<string, AllyRuntime>,
) {
  const collisionRadius = role === 'mounted-cavalry'
    ? CAVALRY_COLLISION_RADIUS
    : ALLY_COLLISION_RADIUS;
  if (!isInsideArena(x, z, ALLY_ARENA_PADDING)
    || intersectsTerrainMound(x, z, collisionRadius)) return true;
  for (const obstacle of obstacles) {
    const radius = Math.max(0, obstacle.radius) + collisionRadius;
    const dx = x - obstacle.position[0];
    const dz = z - obstacle.position[2];
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  for (const [otherId, runtime] of runtimes) {
    if (otherId === allyId || !runtime.wasAlive) continue;
    const spacing = role === 'mounted-cavalry' ? 2.1 : 1.45;
    const dx = x - runtime.position.x;
    const dz = z - runtime.position.z;
    if (dx * dx + dz * dz < spacing * spacing) return true;
  }
  return false;
}

function recoverAllyPosition(
  runtime: AllyRuntime,
  ally: FinalBossAllyCombatant,
  obstacles: readonly CombatObstacle[],
  runtimes: ReadonlyMap<string, AllyRuntime>,
  force = false,
  preferredDirectionX = 0,
  preferredDirectionZ = 0,
) {
  if (!force && !isMovementBlocked(
    runtime.position.x,
    runtime.position.z,
    ally.role,
    ally.id,
    obstacles,
    runtimes,
  )) return false;
  const rolePhase = ally.role === 'heavy-gunner'
    ? 0.4
    : ally.role === 'mounted-cavalry'
      ? 2.3
      : 4.2;
  const preferredLength = Math.hypot(preferredDirectionX, preferredDirectionZ);
  const phase = preferredLength > 0.0001
    ? Math.atan2(preferredDirectionZ, preferredDirectionX)
      + runtime.recoverySequence * 0.713
    : rolePhase + runtime.recoverySequence * 0.713;
  const originX = runtime.position.x;
  const originZ = runtime.position.z;
  for (let attempt = 1; attempt <= 64; attempt += 1) {
    const radius = 0.75 + Math.sqrt(attempt) * 0.9;
    const angle = phase + attempt * 2.399963229728653;
    const x = originX + Math.cos(angle) * radius;
    const z = originZ + Math.sin(angle) * radius;
    if (isMovementBlocked(x, z, ally.role, ally.id, obstacles, runtimes)) continue;
    runtime.position.x = x;
    runtime.position.z = z;
    runtime.recoverySequence += 1;
    return true;
  }
  runtime.recoverySequence += 1;
  return false;
}

function moveRuntime(
  runtime: AllyRuntime,
  ally: FinalBossAllyCombatant,
  directionX: number,
  directionZ: number,
  distance: number,
  obstacles: readonly CombatObstacle[],
  runtimes: ReadonlyMap<string, AllyRuntime>,
) {
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength <= 0.0001 || distance <= 0) return false;
  const normalizedX = directionX / directionLength;
  const normalizedZ = directionZ / directionLength;
  const steeringAngles = [
    0,
    0.42, -0.42,
    0.85, -0.85,
    1.28, -1.28,
    1.7, -1.7,
    2.25, -2.25,
    Math.PI,
  ] as const;
  for (const angle of steeringAngles) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const stepX = normalizedX * cosine - normalizedZ * sine;
    const stepZ = normalizedX * sine + normalizedZ * cosine;
    const nextX = runtime.position.x + stepX * distance;
    const nextZ = runtime.position.z + stepZ * distance;
    if (isMovementBlocked(nextX, nextZ, ally.role, ally.id, obstacles, runtimes)) continue;
    runtime.position.x = nextX;
    runtime.position.z = nextZ;
    runtime.yaw = Math.atan2(-stepX, -stepZ);
    return true;
  }
  return false;
}

function moveCavalryWithRecovery(
  runtime: AllyRuntime,
  ally: FinalBossAllyCombatant,
  directionX: number,
  directionZ: number,
  distance: number,
  movementDelta: number,
  now: number,
  obstacles: readonly CombatObstacle[],
  runtimes: ReadonlyMap<string, AllyRuntime>,
) {
  const moved = moveRuntime(
    runtime,
    ally,
    directionX,
    directionZ,
    distance,
    obstacles,
    runtimes,
  );
  if (moved) {
    runtime.blockedSeconds = 0;
  } else {
    runtime.blockedSeconds += movementDelta;
  }

  if (runtime.position.distanceToSquared(runtime.lastProgressPosition) >= 0.36) {
    runtime.lastProgressPosition.copy(runtime.position);
    runtime.lastProgressAt = now;
  }

  const stalled = runtime.blockedSeconds
      >= FINAL_BOSS_ALLY_TUNING.cavalryStuckRecoverySeconds
    || now - runtime.lastProgressAt
      >= FINAL_BOSS_ALLY_TUNING.cavalryProgressTimeoutSeconds;
  if (!stalled) return moved;

  const recovered = recoverAllyPosition(
    runtime,
    ally,
    obstacles,
    runtimes,
    true,
    directionX,
    directionZ,
  );
  runtime.blockedSeconds = 0;
  runtime.lastProgressAt = now;
  runtime.lastProgressPosition.copy(runtime.position);
  runtime.orbitDirection = runtime.orbitDirection === 1 ? -1 : 1;
  runtime.chargeState = 'setup';
  runtime.chargeTargetId = null;
  return recovered;
}

function safeAllyDamage(target: ZombieCombatant, requestedDamage: number) {
  if (target.archetype !== 'boss') return requestedDamage;
  const floorHealth = target.maxHealth * FINAL_BOSS_ALLY_ASSIST_FLOOR_RATIO;
  if (target.health <= floorHealth + 0.5) return 0;
  return Math.min(requestedDamage, target.health - floorHealth);
}

export function FinalBossAllies({
  allies,
  posesRef,
  zombies,
  zombiePosesRef,
  obstacles = [],
  enabled = true,
  onZombieHit,
  onFire,
}: FinalBossAlliesProps) {
  const groupRefs = useRef<Array<THREE.Group | null>>([]);
  const flashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const runtimeByIdRef = useRef(new Map<string, AllyRuntime>());
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;
  const tracerRef = useRef<THREE.InstancedMesh | null>(null);
  const tracerGlowRef = useRef<THREE.InstancedMesh | null>(null);
  const projectileCursorRef = useRef(0);
  const projectilePool = useMemo<AllyProjectile[]>(() => (
    Array.from({ length: PROJECTILE_CAPACITY }, () => ({
      active: false,
      allyId: '',
      role: 'rifle-scout',
      damage: 0,
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      lifetime: 0,
    }))
  ), []);
  const tracerObject = useMemo(() => new THREE.Object3D(), []);
  const tracerForward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const aimPosition = useMemo(() => new THREE.Vector3(), []);
  const muzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const shotDirection = useMemo(() => new THREE.Vector3(), []);
  const formationKey = useMemo(
    () => allies.map(ally => `${ally.id}:${ally.role}`).join('|'),
    [allies],
  );
  const allyIdsKey = useMemo(() => allies.map(ally => ally.id).join('|'), [allies]);

  useLayoutEffect(() => {
    const retainedIds = new Set(allies.map(ally => ally.id));
    for (const [id] of runtimeByIdRef.current) {
      if (retainedIds.has(id)) continue;
      runtimeByIdRef.current.delete(id);
      posesRef.current.delete(id);
    }
    allies.forEach((ally, index) => {
      let runtime = runtimeByIdRef.current.get(ally.id);
      if (!runtime) {
        const definition = FINAL_BOSS_ALLY_DEFINITIONS.find(candidate => candidate.id === ally.id);
        runtime = {
          position: new THREE.Vector3(...ally.position),
          yaw: index * Math.PI * 0.55,
          orbitDirection: index % 2 === 0 ? 1 : -1,
          nextShotAt: 0.55 + index * 0.28,
          shotIndex: 0,
          burstRemaining: ally.role === 'heavy-gunner'
            ? FINAL_BOSS_ALLY_TUNING.heavyBurstSize
            : FINAL_BOSS_ALLY_TUNING.rifleBurstSize,
          nextManeuverAt: 2.5 + index,
          combatPhase: 'attack',
          combatPhaseUntil: -1,
          chargeState: 'setup',
          chargeTargetId: null,
          blockedSeconds: 0,
          lastProgressAt: 0,
          lastProgressPosition: new THREE.Vector3(...ally.position),
          recoverySequence: 0,
          wasAlive: ally.alive,
          defeatElapsed: 0,
        };
        if (definition) runtime.position.set(...definition.position);
        runtime.lastProgressPosition.copy(runtime.position);
        runtimeByIdRef.current.set(ally.id, runtime);
      }
      if (!posesRef.current.has(ally.id)) {
        posesRef.current.set(ally.id, { position: runtime.position });
      }
    });
    for (const ally of allies) {
      const runtime = runtimeByIdRef.current.get(ally.id);
      if (runtime) recoverAllyPosition(
        runtime,
        ally,
        obstaclesRef.current,
        runtimeByIdRef.current,
      );
    }
    if (tracerRef.current) {
      tracerRef.current.count = 0;
      tracerRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    if (tracerGlowRef.current) {
      tracerGlowRef.current.count = 0;
      tracerGlowRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }, [formationKey, posesRef]);

  useLayoutEffect(() => () => {
    for (const ally of allies) posesRef.current.delete(ally.id);
    for (const projectile of projectilePool) projectile.active = false;
    runtimeByIdRef.current.clear();
  }, [allyIdsKey, posesRef, projectilePool]);

  const spawnProjectile = (
    ally: FinalBossAllyCombatant,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    damage: number,
  ) => {
    for (let offset = 0; offset < projectilePool.length; offset += 1) {
      const index = (projectileCursorRef.current + offset) % projectilePool.length;
      const projectile = projectilePool[index];
      if (projectile.active) continue;
      projectileCursorRef.current = (index + 1) % projectilePool.length;
      projectile.active = true;
      projectile.allyId = ally.id;
      projectile.role = ally.role === 'heavy-gunner' ? 'heavy-gunner' : 'rifle-scout';
      projectile.damage = damage;
      projectile.position.copy(origin);
      projectile.previousPosition.copy(origin);
      projectile.direction.copy(direction).normalize();
      projectile.lifetime = 0;
      return true;
    }
    return false;
  };

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    const movementDelta = Math.min(delta, MAX_FRAME_DELTA);
    const runtimes = runtimeByIdRef.current;

    if (!enabled) {
      for (const projectile of projectilePool) projectile.active = false;
    }

    for (let allyIndex = 0; allyIndex < allies.length; allyIndex += 1) {
      const ally = allies[allyIndex];
      const runtime = runtimes.get(ally.id);
      const model = groupRefs.current[allyIndex];
      const flash = flashRefs.current[allyIndex];
      if (!runtime || !model) continue;
      if (flash) flash.visible = false;

      if (!enabled || ally.status === 'defeated') {
        model.visible = false;
        posesRef.current.delete(ally.id);
        runtime.wasAlive = false;
        continue;
      }
      model.visible = true;
      if (!ally.alive) {
        runtime.defeatElapsed += movementDelta;
        const fallBlend = THREE.MathUtils.smoothstep(runtime.defeatElapsed, 0, 1.25);
        model.position.copy(runtime.position);
        model.position.y -= fallBlend * 0.2;
        model.rotation.set(0, runtime.yaw, -fallBlend * 1.28);
        model.scale.setScalar(1 - fallBlend * 0.12);
        posesRef.current.delete(ally.id);
        runtime.wasAlive = false;
        continue;
      }

      if (!runtime.wasAlive) {
        runtime.position.set(...ally.position);
        runtime.defeatElapsed = 0;
        runtime.chargeState = 'setup';
        runtime.chargeTargetId = null;
        runtime.combatPhase = 'attack';
        runtime.combatPhaseUntil = -1;
        runtime.blockedSeconds = 0;
        runtime.wasAlive = true;
        // The scene stays mounted while the encounter is disabled. Re-enabling
        // previously restored Theodore to his authored point inside the east
        // terrain mound, after the mount-only spawn recovery had already run.
        recoverAllyPosition(
          runtime,
          ally,
          obstacles,
          runtimes,
        );
        runtime.lastProgressAt = now;
        runtime.lastProgressPosition.copy(runtime.position);
      }

      if (runtime.combatPhaseUntil < 0) {
        runtime.combatPhase = 'attack';
        runtime.combatPhaseUntil = now + FINAL_BOSS_ALLY_TUNING.attackPhaseSeconds;
        runtime.nextShotAt = now;
      } else if (now >= runtime.combatPhaseUntil) {
        if (runtime.combatPhase === 'attack') {
          runtime.combatPhase = 'reposition';
          runtime.combatPhaseUntil = now
            + FINAL_BOSS_ALLY_TUNING.repositionPhaseSeconds;
          runtime.chargeState = 'withdraw';
          runtime.chargeTargetId = null;
        } else {
          runtime.combatPhase = 'attack';
          runtime.combatPhaseUntil = now + FINAL_BOSS_ALLY_TUNING.attackPhaseSeconds;
          runtime.nextShotAt = now;
          runtime.burstRemaining = ally.role === 'heavy-gunner'
            ? FINAL_BOSS_ALLY_TUNING.heavyBurstSize
            : FINAL_BOSS_ALLY_TUNING.rifleBurstSize;
          runtime.chargeState = 'setup';
        }
      }

      let target: ZombieCombatant | null = null;
      let targetPose: ZombieCombatPose | null = null;
      let targetScore = Number.POSITIVE_INFINITY;
      let livingTargetIndex = 0;
      for (const candidate of zombies) {
        if (!candidate.alive) continue;
        const pose = zombiePosesRef.current.get(candidate.id);
        if (!pose?.active) continue;
        const dx = pose.position.x - runtime.position.x;
        const dz = pose.position.z - runtime.position.z;
        const assignedLane = livingTargetIndex % Math.max(1, allies.length);
        const assignmentPenalty = assignedLane === allyIndex ? 0 : 26;
        const bossBias = candidate.archetype === 'boss'
          ? ally.role === 'rifle-scout' ? 38 : -42
          : ally.role === 'rifle-scout' ? -34 : 0;
        const score = dx * dx + dz * dz + assignmentPenalty + bossBias;
        livingTargetIndex += 1;
        if (score >= targetScore) continue;
        target = candidate;
        targetPose = pose;
        targetScore = score;
      }

      if (ally.role === 'mounted-cavalry'
        && runtime.combatPhase === 'attack'
        && runtime.chargeState === 'charge'
        && runtime.chargeTargetId) {
        const lockedTarget = zombies.find(candidate => (
          candidate.id === runtime.chargeTargetId && candidate.alive
        ));
        const lockedPose = lockedTarget
          ? zombiePosesRef.current.get(lockedTarget.id)
          : null;
        if (lockedTarget && lockedPose?.active) {
          target = lockedTarget;
          targetPose = lockedPose;
        } else {
          runtime.chargeState = 'setup';
          runtime.chargeTargetId = null;
        }
      }

      if (target && targetPose) {
        const targetPosition = targetPose.position;
        const dx = targetPosition.x - runtime.position.x;
        const dz = targetPosition.z - runtime.position.z;
        const distance = Math.hypot(dx, dz);
        const definition = FINAL_BOSS_ALLY_DEFINITIONS.find(candidate => (
          candidate.id === ally.id
        )) ?? FINAL_BOSS_ALLY_DEFINITIONS[0];

        if (now >= runtime.nextManeuverAt && ally.role !== 'mounted-cavalry') {
          runtime.orbitDirection = runtime.orbitDirection === 1 ? -1 : 1;
          runtime.nextManeuverAt = now + 4.2 + ((runtime.shotIndex * 1.73) % 2.8);
        }

        if (ally.role === 'mounted-cavalry') {
          const attacking = runtime.combatPhase === 'attack';
          if (attacking) {
            runtime.chargeState = 'charge';
            runtime.chargeTargetId = target.id;
            const strikeDistance = Math.max(2.3, target.collisionRadius + 1.05);
            if (distance > strikeDistance * 0.82) {
              moveCavalryWithRecovery(
                runtime,
                ally,
                dx,
                dz,
                FINAL_BOSS_ALLY_TUNING.cavalryChargeSpeed * movementDelta,
                movementDelta,
                now,
                obstacles,
                runtimes,
              );
            }
            const postMoveDx = targetPosition.x - runtime.position.x;
            const postMoveDz = targetPosition.z - runtime.position.z;
            const postMoveDistance = Math.hypot(postMoveDx, postMoveDz);
            runtime.yaw = Math.atan2(-postMoveDx, -postMoveDz);
            if (postMoveDistance <= strikeDistance
              && now >= runtime.nextShotAt) {
              const damage = safeAllyDamage(target, FINAL_BOSS_ALLY_TUNING.cavalryDamage);
              shotDirection.set(postMoveDx, 0, postMoveDz).normalize();
              muzzlePosition.copy(runtime.position).addScaledVector(shotDirection, 0.75);
              muzzlePosition.y += 1.55;
              if (damage > 0) {
                onZombieHit?.({
                  soldierId: ally.id,
                  zombieId: target.id,
                  position: targetPosition.clone().setY(
                    targetPosition.y + target.visualScale * 0.72,
                  ),
                  damage,
                });
              }
              onFire?.({
                allyId: ally.id,
                soldierId: ally.id,
                targetEnemyId: target.id,
                weapon: ally.weapon,
                position: muzzlePosition.clone(),
                direction: shotDirection.clone(),
              });
              runtime.nextShotAt = now + FINAL_BOSS_ALLY_TUNING.cavalrySlashInterval;
            }
          } else {
            const tangentX = -dz * runtime.orbitDirection;
            const tangentZ = dx * runtime.orbitDirection;
            const rangeError = distance - definition.preferredRange;
            const radialX = Math.abs(rangeError) <= 0.7
              ? 0
              : rangeError > 0 ? dx : -dx;
            const radialZ = Math.abs(rangeError) <= 0.7
              ? 0
              : rangeError > 0 ? dz : -dz;
            moveCavalryWithRecovery(
              runtime,
              ally,
              radialX + tangentX * 0.52,
              radialZ + tangentZ * 0.52,
              definition.moveSpeed * movementDelta,
              movementDelta,
              now,
              obstacles,
              runtimes,
            );
          }
        } else {
          const preferredRange = definition.preferredRange;
          if (runtime.combatPhase === 'reposition') {
            let moveX = 0;
            let moveZ = 0;
            if (distance > preferredRange + 1.25) {
              moveX = dx;
              moveZ = dz;
            } else if (distance < preferredRange - 1.25) {
              moveX = -dx;
              moveZ = -dz;
            } else {
              const radialCorrection = (distance - preferredRange) * 0.3;
              moveX = -dz * runtime.orbitDirection + dx * radialCorrection;
              moveZ = dx * runtime.orbitDirection + dz * radialCorrection;
            }
            moveRuntime(
              runtime,
              ally,
              moveX,
              moveZ,
              definition.moveSpeed * movementDelta,
              obstacles,
              runtimes,
            );
          }

          runtime.yaw = Math.atan2(
            -(targetPosition.x - runtime.position.x),
            -(targetPosition.z - runtime.position.z),
          );
          if (runtime.combatPhase === 'attack'
            && now >= runtime.nextShotAt
            && distance <= MAX_RANGED_DISTANCE) {
            aimPosition.copy(targetPosition);
            aimPosition.y += target.archetype === 'boss'
              ? target.visualScale * 0.72
              : 0.72;
            shotDirection.copy(aimPosition).sub(runtime.position);
            const horizontalLength = Math.hypot(shotDirection.x, shotDirection.z) || 1;
            muzzlePosition.set(
              runtime.position.x + shotDirection.x / horizontalLength * 0.72,
              runtime.position.y + (ally.role === 'heavy-gunner' ? 0.94 : 0.9),
              runtime.position.z + shotDirection.z / horizontalLength * 0.72,
            );
            shotDirection.copy(aimPosition).sub(muzzlePosition).normalize();
            const lineBlocked = terrainBlocksCombatSegment(muzzlePosition, aimPosition)
              || (() => {
                const obstacleT = findNearestObstacleHit(muzzlePosition, aimPosition, obstacles);
                return obstacleT !== null && obstacleT < 0.92;
              })();
            if (!lineBlocked) {
              const shotIndex = runtime.shotIndex++;
              const spread = ally.role === 'heavy-gunner' ? 0.026 : 0.015;
              shotDirection.x += Math.sin(shotIndex * 17.13 + allyIndex) * spread;
              shotDirection.y += Math.sin(shotIndex * 9.71 + allyIndex) * spread * 0.42;
              shotDirection.z += Math.cos(shotIndex * 13.27 + allyIndex) * spread;
              shotDirection.normalize();
              const damage = ally.role === 'heavy-gunner'
                ? FINAL_BOSS_ALLY_TUNING.heavyDamage
                : FINAL_BOSS_ALLY_TUNING.rifleDamage;
              if (spawnProjectile(ally, muzzlePosition, shotDirection, damage)) {
                if (flash) flash.visible = true;
                onFire?.({
                  allyId: ally.id,
                  soldierId: ally.id,
                  targetEnemyId: target.id,
                  weapon: ally.weapon,
                  position: muzzlePosition.clone(),
                  direction: shotDirection.clone(),
                });
              }
              runtime.burstRemaining -= 1;
              if (runtime.burstRemaining > 0) {
                runtime.nextShotAt = now + (ally.role === 'heavy-gunner'
                  ? FINAL_BOSS_ALLY_TUNING.heavyShotInterval
                  : FINAL_BOSS_ALLY_TUNING.rifleShotInterval);
              } else {
                runtime.burstRemaining = ally.role === 'heavy-gunner'
                  ? FINAL_BOSS_ALLY_TUNING.heavyBurstSize
                  : FINAL_BOSS_ALLY_TUNING.rifleBurstSize;
                runtime.nextShotAt = now + (ally.role === 'heavy-gunner'
                  ? FINAL_BOSS_ALLY_TUNING.heavyBurstRecovery
                  : FINAL_BOSS_ALLY_TUNING.rifleBurstRecovery);
              }
            } else {
              runtime.nextShotAt = now + 0.22;
            }
          }
        }
      } else {
        runtime.yaw += movementDelta * 0.16 * runtime.orbitDirection;
      }

      model.position.copy(runtime.position);
      model.position.y += Math.abs(Math.sin(now * (
        ally.role === 'mounted-cavalry' ? 7.4 : 4.1
      ) + allyIndex)) * (ally.role === 'mounted-cavalry' ? 0.055 : 0.018);
      model.rotation.set(0, runtime.yaw, 0);
      model.scale.setScalar(1);
      const pose = posesRef.current.get(ally.id);
      if (pose) pose.position.copy(runtime.position);
      else posesRef.current.set(ally.id, { position: runtime.position });
    }

    let tracerCount = 0;
    for (const projectile of projectilePool) {
      if (!enabled || !projectile.active) continue;
      projectile.previousPosition.copy(projectile.position);
      projectile.position.addScaledVector(projectile.direction, PROJECTILE_SPEED * movementDelta);
      projectile.lifetime += movementDelta;
      if (projectile.lifetime >= PROJECTILE_LIFETIME
        || terrainBlocksCombatSegment(projectile.previousPosition, projectile.position)) {
        projectile.active = false;
        continue;
      }
      const obstacleT = projectile.lifetime > 0.06
        ? findNearestObstacleHit(projectile.previousPosition, projectile.position, obstacles)
        : null;
      const hit = findNearestLivingZombieHit(
        projectile.previousPosition,
        projectile.position,
        zombies,
        zombiePosesRef.current,
      );
      if (hit && (obstacleT === null || hit.t < obstacleT)) {
        const damage = safeAllyDamage(hit.zombie, projectile.damage);
        if (damage > 0) {
          onZombieHit?.({
            soldierId: projectile.allyId,
            zombieId: hit.zombie.id,
            position: hit.point.clone(),
            damage,
          });
        }
        projectile.active = false;
        continue;
      }
      if (obstacleT !== null) {
        projectile.active = false;
        continue;
      }
      tracerObject.position.copy(projectile.position);
      tracerObject.quaternion.setFromUnitVectors(tracerForward, projectile.direction);
      tracerObject.scale.set(1, 1, projectile.role === 'heavy-gunner' ? 1.1 : 0.82);
      tracerObject.updateMatrix();
      tracerRef.current?.setMatrixAt(tracerCount, tracerObject.matrix);
      tracerGlowRef.current?.setMatrixAt(tracerCount, tracerObject.matrix);
      tracerCount += 1;
    }

    if (tracerRef.current) {
      tracerRef.current.count = tracerCount;
      if (tracerCount > 0) tracerRef.current.instanceMatrix.needsUpdate = true;
    }
    if (tracerGlowRef.current) {
      tracerGlowRef.current.count = tracerCount;
      if (tracerCount > 0) tracerGlowRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group dispose={null} visible={enabled}>
      {allies.map((ally, index) => (
        <group
          key={ally.id}
          ref={node => { groupRefs.current[index] = node; }}
          position={ally.position}
          visible={ally.status !== 'defeated'}
        >
          <GuardianHalo role={ally.role} />
          {ally.role === 'heavy-gunner' && (
            <HeavyGunnerModel
              setFlashRef={node => { flashRefs.current[index] = node; }}
            />
          )}
          {ally.role === 'mounted-cavalry' && <MountedCavalryModel />}
          {ally.role === 'rifle-scout' && (
            <RifleScoutModel
              setFlashRef={node => { flashRefs.current[index] = node; }}
            />
          )}
        </group>
      ))}
      <instancedMesh
        ref={tracerRef}
        args={[GEOMETRY.tracer, MATERIAL.tracer, PROJECTILE_CAPACITY]}
        frustumCulled={false}
        renderOrder={4}
      />
      <instancedMesh
        ref={tracerGlowRef}
        args={[GEOMETRY.tracerGlow, MATERIAL.tracerGlow, PROJECTILE_CAPACITY]}
        frustumCulled={false}
        renderOrder={3}
      />
    </group>
  );
}
