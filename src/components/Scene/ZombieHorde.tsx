import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { createFlameTexture } from './OrdnanceEffects';
import { isInsideArena } from '../../lib/arenaBounds';
import type { CombatObstacle } from '../../lib/combat';
import type { FriendlyCombatant, FriendlyCombatPose } from '../../lib/combat';
import { intersectsTerrainMound } from '../../lib/terrain';
import {
  hashZombieSession,
  ZombieCombatant,
  ZombieCombatPose,
  ZombieTankBreachEvent,
  ZombieFriendlyBreachEvent,
  ZOMBIE_BREACH_DAMAGE,
  ZOMBIE_FRIENDLY_BREACH_DAMAGE,
  ZOMBIE_MAX_ACTIVE,
  ZOMBIE_MAX_BREACHES_PER_SECOND,
} from '../../lib/zombieEpilogue';

const ZOMBIE_COLLISION_RADIUS = 0.34;
const ZOMBIE_ARENA_PADDING = 3.2;
const MAX_MOVEMENT_DELTA = 0.08;
const MIN_GLOBAL_BREACH_GAP = 0.78;
const ALLIED_SUPPRESSION_SECONDS = 0.68;
const ALLIED_SUPPRESSION_SPEED = 0.62;
const BOSS_ALLIED_SUPPRESSION_SECONDS = 0.22;
const BOSS_ALLIED_SUPPRESSION_SPEED = 0.9;
const IMMOBILE_RECOVERY_SECONDS = 1.35;
const NO_PROGRESS_RECOVERY_SECONDS = 4.25;
const RECOVERY_EMERGENCE_SECONDS = 0.32;
const LAST_RESORT_COLLISION_GRACE_SECONDS = 3;
const BOSS_MOVEMENT_OBSTACLES: readonly CombatObstacle[] = Object.freeze([]);
const BOSS_FACE_TEXTURE_PATH = '/images/nightmare-boss-kamala-texture.png';
const BOSS_REAR_FACE_TEXTURE_PATH = '/images/nightmare-boss-biden-texture.png';
const BOSS_FIREBALL_INITIAL_DELAY_SECONDS = 2.4;
const BOSS_FIREBALL_TELEGRAPH_SECONDS = 0.82;
const BOSS_FIREBALL_FLIGHT_SECONDS = 0.95;
const BOSS_FIREBALL_COOLDOWN_MIN_SECONDS = 5.2;
const BOSS_FIREBALL_COOLDOWN_VARIANCE_SECONDS = 1.8;
const BOSS_FIREBALL_MIN_RANGE = 4.2;
const BOSS_FIREBALL_MAX_RANGE = 22;
const BOSS_FIREBALL_BLAST_RADIUS = 3.2;
const BOSS_FIREBALL_ARC_HEIGHT = 2.4;
const BOSS_FIRE_AOE_SECONDS = 3.8;
const BOSS_FIRE_AOE_SUSTAIN_SECONDS = 2.7;
const BOSS_FIRE_PARTICLE_COUNT = 24;

// Ordered shallow-to-deep detours. A zombie commits to the first clear heading
// for a short window instead of reconsidering the blocked direct line every frame.
const AVOIDANCE_ANGLES = [0.58, 0.94, 1.3, 1.7, 2.12, 2.55, Math.PI] as const;

const UNIFORM_COLORS = ['#35392f', '#29352d', '#31333a'] as const;
const TROUSER_COLORS = ['#292c26', '#233027', '#272a30'] as const;
const HELMET_COLORS = ['#252b26', '#29332b', '#272a30'] as const;
const CORPSE_SKIN_COLORS = ['#7d866e', '#707d68', '#858778'] as const;
const BOSS_UNIFORM_COLOR = '#302b22';
const BOSS_TROUSER_COLOR = '#1e2018';
const BOSS_SKIN_COLOR = '#4f5d47';
const BOSS_EYE_COLOR = '#ff1200';
const STANDARD_EYE_COLOR = '#ff1a08';

const TORSO_GEOMETRY = new THREE.BoxGeometry(0.55, 0.78, 0.3);
const LIMB_GEOMETRY = new THREE.BoxGeometry(0.14, 0.62, 0.15);
const HEAD_GEOMETRY = new THREE.SphereGeometry(0.205, 8, 6);
const HELMET_GEOMETRY = new THREE.SphereGeometry(
  0.255,
  9,
  5,
  0,
  Math.PI * 2,
  0,
  Math.PI * 0.61,
);
// Keep the nightmare glow in the existing instanced eye draw call: enlarging
// this shared low-poly geometry adds no meshes or per-zombie lights.
const EYE_GEOMETRY = new THREE.SphereGeometry(0.04, 6, 4);
const SHADOW_GEOMETRY = new THREE.CircleGeometry(0.42, 12);
const BOSS_SPIKE_GEOMETRY = new THREE.ConeGeometry(0.062, 0.42, 5);
const BOSS_RIB_GEOMETRY = new THREE.BoxGeometry(0.3, 0.048, 0.055);
const BOSS_TORSO_GEOMETRY = new THREE.CylinderGeometry(0.23, 0.31, 0.98, 7, 1);
const BOSS_ARM_GEOMETRY = new THREE.CylinderGeometry(0.07, 0.12, 0.82, 6, 1);
const BOSS_LEG_GEOMETRY = new THREE.CylinderGeometry(0.09, 0.13, 0.72, 6, 1);
const BOSS_WOUND_GEOMETRY = new THREE.DodecahedronGeometry(0.09, 0);
const BOSS_FIREBALL_CONE_GEOMETRY = new THREE.ConeGeometry(0.25, 0.66, 7, 1);
const BOSS_FIREBALL_SCOOP_GEOMETRY = new THREE.IcosahedronGeometry(0.32, 1);
const BOSS_FIREBALL_GLOW_GEOMETRY = new THREE.IcosahedronGeometry(0.43, 1);

const TORSO_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.96,
  metalness: 0.01,
  flatShading: true,
});
const LIMB_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.98,
  metalness: 0,
  flatShading: true,
});
const HEAD_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 1,
  metalness: 0,
  flatShading: true,
});
const HELMET_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.88,
  metalness: 0.08,
  flatShading: true,
});
const EYE_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});
const SHADOW_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#10150f',
  transparent: true,
  opacity: 0.36,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const BOSS_BONE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#d1c091',
  emissive: '#302918',
  emissiveIntensity: 0.18,
  roughness: 0.9,
  metalness: 0,
  flatShading: true,
});
const BOSS_TORSO_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#343328',
  emissive: '#14140e',
  emissiveIntensity: 0.22,
  roughness: 1,
  metalness: 0,
  flatShading: true,
});
const BOSS_LIMB_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#2d2a21',
  emissive: '#11110c',
  emissiveIntensity: 0.18,
  roughness: 1,
  metalness: 0,
  flatShading: true,
});
const BOSS_HEAD_MATERIAL = new THREE.MeshStandardMaterial({
  color: BOSS_SKIN_COLOR,
  emissive: '#151b14',
  emissiveIntensity: 0.16,
  roughness: 1,
  metalness: 0,
  flatShading: true,
});
const BOSS_WOUND_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#350805',
  emissive: '#8e160d',
  emissiveIntensity: 0.78,
  roughness: 0.72,
  metalness: 0,
});
const BOSS_FIREBALL_CONE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#c87520',
  emissive: '#7d2108',
  emissiveIntensity: 1.15,
  roughness: 0.72,
  metalness: 0,
  flatShading: true,
});
const BOSS_FIREBALL_SCOOP_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#ff3a0c',
  toneMapped: false,
});
const BOSS_FIREBALL_GLOW_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#ff1600',
  transparent: true,
  opacity: 0.34,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const BOSS_OCCLUSION_MATERIALS = [
  BOSS_BONE_MATERIAL,
  BOSS_TORSO_MATERIAL,
  BOSS_LIMB_MATERIAL,
  BOSS_HEAD_MATERIAL,
  BOSS_WOUND_MATERIAL,
] as const;

for (const material of BOSS_OCCLUSION_MATERIALS) material.transparent = true;

interface BossDetailTransform {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

const BOSS_SPIKE_TRANSFORMS: readonly BossDetailTransform[] = [
  // Splintered shoulder bones.
  { position: [-0.46, 1.08, 0], rotation: [0.12, 0, -0.82], scale: [1.15, 1.15, 1.15] },
  { position: [0.46, 1.08, 0], rotation: [0.12, 0, 0.82], scale: [1.15, 1.15, 1.15] },
  // Crooked vertebral spines break up the silhouette from every camera angle.
  { position: [0, 1.13, 0.28], rotation: [Math.PI / 2, 0, 0], scale: [0.95, 1.25, 0.95] },
  { position: [0, 0.93, 0.3], rotation: [Math.PI / 2, 0, 0.15], scale: [0.85, 1.08, 0.85] },
  { position: [0, 0.73, 0.27], rotation: [Math.PI / 2, 0, -0.14], scale: [0.72, 0.92, 0.72] },
  // Six uneven finger bones project beyond the elongated hands.
  { position: [-0.43, 0.49, -0.48], rotation: [-Math.PI / 2, 0, -0.12], scale: [0.42, 0.9, 0.42] },
  { position: [-0.36, 0.47, -0.5], rotation: [-Math.PI / 2, 0, 0], scale: [0.4, 1, 0.4] },
  { position: [-0.29, 0.49, -0.47], rotation: [-Math.PI / 2, 0, 0.12], scale: [0.38, 0.82, 0.38] },
  { position: [0.29, 0.49, -0.47], rotation: [-Math.PI / 2, 0, -0.12], scale: [0.38, 0.82, 0.38] },
  { position: [0.36, 0.47, -0.5], rotation: [-Math.PI / 2, 0, 0], scale: [0.4, 1, 0.4] },
  { position: [0.43, 0.49, -0.48], rotation: [-Math.PI / 2, 0, 0.12], scale: [0.42, 0.9, 0.42] },
];

const BOSS_RIB_TRANSFORMS: readonly BossDetailTransform[] = [
  { position: [-0.17, 1.02, -0.265], rotation: [0, 0, 0.2], scale: [0.9, 1, 1] },
  { position: [0.17, 1.02, -0.265], rotation: [0, 0, -0.2], scale: [0.9, 1, 1] },
  { position: [-0.18, 0.91, -0.275], rotation: [0, 0, 0.12] },
  { position: [0.18, 0.91, -0.275], rotation: [0, 0, -0.12] },
  { position: [-0.16, 0.8, -0.26], rotation: [0, 0, 0.04], scale: [0.82, 1, 1] },
  { position: [0.16, 0.8, -0.26], rotation: [0, 0, -0.04], scale: [0.82, 1, 1] },
];

interface ZombieRuntime {
  position: THREE.Vector3;
  spawnElapsed: number;
  active: boolean;
  pausedByTakeover: boolean;
  yaw: number;
  gaitPhase: number;
  nextAttackAt: number;
  nextRangedAttackAt: number;
  rangedAttackCount: number;
  steeringSide: -1 | 1;
  avoidDirectionX: number;
  avoidDirectionZ: number;
  avoidUntil: number;
  immobileElapsed: number;
  noProgressElapsed: number;
  bestTargetDistance: number;
  lastTargetX: number;
  lastTargetZ: number;
  recoveryCount: number;
  recoveryBlend: number;
  collisionGraceRemaining: number;
  seenSuppressionRevision: number;
  suppressionRemaining: number;
}

interface BossFireballRuntime {
  active: boolean;
  phase: 'telegraph' | 'flight' | 'burn';
  bossId: string;
  phaseStartedAt: number;
  launchPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  damageApplied: boolean;
}

interface BossFireParticle {
  x: number;
  z: number;
  delay: number;
  phase: number;
  rise: number;
  size: number;
}

interface BreachWindow {
  startedAt: number;
  count: number;
  nextGlobalAt: number;
}

export interface ZombieHordeProps {
  zombies: readonly ZombieCombatant[];
  posesRef: RefObject<Map<string, ZombieCombatPose>>;
  tankRef: RefObject<THREE.Group | null>;
  friendliesRef?: RefObject<FriendlyCombatant[]>;
  friendlyPosesRef?: RefObject<Map<string, FriendlyCombatPose>>;
  obstacles?: readonly CombatObstacle[];
  active?: boolean;
  tankTargetEnabled?: boolean;
  onTankBreach?: (event: ZombieTankBreachEvent) => void;
  onFriendlyBreach?: (event: ZombieFriendlyBreachEvent) => void;
}

function deterministicUnit(id: string, salt: number) {
  let value = (hashZombieSession(id) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

function isStepBlocked(
  x: number,
  z: number,
  obstacles: readonly CombatObstacle[],
  collisionRadius = ZOMBIE_COLLISION_RADIUS,
) {
  if (!isInsideArena(x, z, ZOMBIE_ARENA_PADDING)
    || intersectsTerrainMound(x, z, collisionRadius)) return true;

  for (let index = 0; index < obstacles.length; index += 1) {
    const obstacle = obstacles[index];
    const radius = Math.max(0, obstacle.radius) + collisionRadius;
    const dx = x - obstacle.position[0];
    const dz = z - obstacle.position[2];
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  return false;
}

/**
 * Bounded deterministic recovery. Local candidates are preferred so ordinary
 * wall following stays visually continuous; target-centered rings guarantee a
 * usable ejection when overlapping structures form a closed pocket.
 */
function recoverToSafePosition(
  runtime: ZombieRuntime,
  zombieId: string,
  targetX: number,
  targetZ: number,
  obstacles: readonly CombatObstacle[],
  requireProgress: boolean,
  collisionRadius: number,
  breachRange: number,
) {
  const originX = runtime.position.x;
  const originZ = runtime.position.z;
  const currentDistance = Math.hypot(targetX - originX, targetZ - originZ);
  if (!requireProgress && !isStepBlocked(originX, originZ, obstacles, collisionRadius)) return true;

  const phase = deterministicUnit(zombieId, 31 + runtime.recoveryCount * 7) * Math.PI * 2;
  let bestX = 0;
  let bestZ = 0;
  let bestScore = Infinity;

  // A golden-angle disc finds the nearest useful free pocket without grid bias.
  for (let attempt = 1; attempt <= 88; attempt += 1) {
    const radius = 0.58 + Math.sqrt(attempt) * 0.82;
    const angle = phase + attempt * 2.399963229728653;
    const candidateX = originX + Math.cos(angle) * radius;
    const candidateZ = originZ + Math.sin(angle) * radius;
    if (isStepBlocked(candidateX, candidateZ, obstacles, collisionRadius)) continue;
    const targetDistance = Math.hypot(targetX - candidateX, targetZ - candidateZ);
    if (requireProgress && targetDistance > currentDistance - 0.65) continue;
    const score = targetDistance + radius * 0.08;
    if (score >= bestScore) continue;
    bestScore = score;
    bestX = candidateX;
    bestZ = candidateZ;
  }

  // Closed obstacle clusters can defeat a local search. Concentric approach
  // rings around the tank provide a finite, deterministic escape destination.
  if (!Number.isFinite(bestScore)) {
    for (let ring = 0; ring < 8; ring += 1) {
      const radius = breachRange + 0.7 + ring * 1.18;
      for (let sample = 0; sample < 24; sample += 1) {
        const angle = phase + sample * (Math.PI * 2 / 24) + ring * 0.19;
        const candidateX = targetX + Math.cos(angle) * radius;
        const candidateZ = targetZ + Math.sin(angle) * radius;
        if (isStepBlocked(candidateX, candidateZ, obstacles, collisionRadius)) continue;
        const targetDistance = Math.hypot(targetX - candidateX, targetZ - candidateZ);
        const score = targetDistance + ring * 0.04;
        if (score >= bestScore) continue;
        bestScore = score;
        bestX = candidateX;
        bestZ = candidateZ;
      }
      if (Number.isFinite(bestScore)) break;
    }
  }

  if (!Number.isFinite(bestScore)) return false;
  runtime.position.x = bestX;
  runtime.position.z = bestZ;
  runtime.recoveryCount += 1;
  runtime.recoveryBlend = 0;
  runtime.immobileElapsed = 0;
  runtime.noProgressElapsed = 0;
  runtime.bestTargetDistance = Math.hypot(targetX - bestX, targetZ - bestZ);
  runtime.avoidUntil = 0;
  runtime.steeringSide = runtime.steeringSide === 1 ? -1 : 1;
  runtime.collisionGraceRemaining = 0;
  return true;
}

export function ZombieHorde({
  zombies,
  posesRef,
  tankRef,
  friendliesRef,
  friendlyPosesRef,
  obstacles = [],
  active = true,
  tankTargetEnabled = true,
  onTankBreach,
  onFriendlyBreach,
}: ZombieHordeProps) {
  const torsoRef = useRef<THREE.InstancedMesh | null>(null);
  const armRef = useRef<THREE.InstancedMesh | null>(null);
  const legRef = useRef<THREE.InstancedMesh | null>(null);
  const headRef = useRef<THREE.InstancedMesh | null>(null);
  const helmetRef = useRef<THREE.InstancedMesh | null>(null);
  const eyeRef = useRef<THREE.InstancedMesh | null>(null);
  const bossFaceRef = useRef<THREE.Mesh | null>(null);
  const bossFaceMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const bossRearFaceRef = useRef<THREE.Mesh | null>(null);
  const bossRearFaceMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const bossDetailsRef = useRef<THREE.Group | null>(null);
  const bossSpikesRef = useRef<THREE.InstancedMesh | null>(null);
  const bossRibsRef = useRef<THREE.InstancedMesh | null>(null);
  const bossWoundRef = useRef<THREE.Mesh | null>(null);
  const bossLeftArmRef = useRef<THREE.Mesh | null>(null);
  const bossRightArmRef = useRef<THREE.Mesh | null>(null);
  const bossRearLeftArmRef = useRef<THREE.Mesh | null>(null);
  const bossRearRightArmRef = useRef<THREE.Mesh | null>(null);
  const bossLeftLegRef = useRef<THREE.Mesh | null>(null);
  const bossRightLegRef = useRef<THREE.Mesh | null>(null);
  const bossHeadRef = useRef<THREE.Mesh | null>(null);
  const bossFireballRef = useRef<THREE.Group | null>(null);
  const bossFireAreaRef = useRef<THREE.Group | null>(null);
  const bossFireOuterRef = useRef<THREE.InstancedMesh | null>(null);
  const bossFireInnerRef = useRef<THREE.InstancedMesh | null>(null);
  const bossFireScorchMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const bossFireShockwaveRef = useRef<THREE.Mesh | null>(null);
  const bossFireShockwaveMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const bossFireballRuntimeRef = useRef<BossFireballRuntime>({
    active: false,
    phase: 'telegraph',
    bossId: '',
    phaseStartedAt: 0,
    launchPosition: new THREE.Vector3(),
    targetPosition: new THREE.Vector3(),
    damageApplied: false,
  });
  const shadowRef = useRef<THREE.InstancedMesh | null>(null);
  const runtimeByIdRef = useRef(new Map<string, ZombieRuntime>());
  const breachWindowRef = useRef<BreachWindow>({ startedAt: 0, count: 0, nextGlobalAt: 0 });
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;
  const bossFaceTexture = useLoader(THREE.TextureLoader, BOSS_FACE_TEXTURE_PATH);
  const bossRearFaceTexture = useLoader(THREE.TextureLoader, BOSS_REAR_FACE_TEXTURE_PATH);
  useLayoutEffect(() => {
    for (const texture of [bossFaceTexture, bossRearFaceTexture]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
    }
  }, [bossFaceTexture, bossRearFaceTexture]);

  useLayoutEffect(() => {
    const detailObject = new THREE.Object3D();
    const writeTransforms = (
      mesh: THREE.InstancedMesh | null,
      transforms: readonly BossDetailTransform[],
    ) => {
      if (!mesh) return;
      mesh.count = transforms.length;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      transforms.forEach((transform, index) => {
        detailObject.position.set(...transform.position);
        detailObject.rotation.set(...transform.rotation);
        detailObject.scale.set(...(transform.scale ?? [1, 1, 1]));
        detailObject.updateMatrix();
        mesh.setMatrixAt(index, detailObject.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    writeTransforms(bossSpikesRef.current, BOSS_SPIKE_TRANSFORMS);
    writeTransforms(bossRibsRef.current, BOSS_RIB_TRANSFORMS);
    for (const mesh of [bossFireOuterRef.current, bossFireInnerRef.current]) {
      mesh?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }, []);

  const tankPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraToTank = useMemo(() => new THREE.Vector3(), []);
  const cameraToBoss = useMemo(() => new THREE.Vector3(), []);
  const cameraLinePoint = useMemo(() => new THREE.Vector3(), []);
  const rootObject = useMemo(() => new THREE.Object3D(), []);
  const partObject = useMemo(() => new THREE.Object3D(), []);
  const fireballObject = useMemo(() => new THREE.Object3D(), []);
  const fireballPosition = useMemo(() => new THREE.Vector3(), []);
  const fireAreaObject = useMemo(() => new THREE.Object3D(), []);
  const fireParticleObject = useMemo(() => new THREE.Object3D(), []);
  const flameBillboardQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const partMatrix = useMemo(() => new THREE.Matrix4(), []);
  const hiddenMatrix = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const bossFlameTexture = useMemo(() => createFlameTexture(), []);
  const bossFireParticles = useMemo<readonly BossFireParticle[]>(() => (
    Array.from({ length: BOSS_FIRE_PARTICLE_COUNT }, (_, index) => {
      const unitRadius = Math.sqrt((index + 0.45) / BOSS_FIRE_PARTICLE_COUNT);
      const angle = index * 2.399963229728653;
      const radialJitter = 0.78 + deterministicUnit('boss-fire-ring', index) * 0.22;
      const radius = unitRadius * BOSS_FIREBALL_BLAST_RADIUS * radialJitter;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        delay: deterministicUnit('boss-fire-delay', index) * 0.34,
        phase: deterministicUnit('boss-fire-phase', index),
        rise: 0.72 + deterministicUnit('boss-fire-rise', index) * 1.15,
        size: 0.18 + deterministicUnit('boss-fire-size', index) * 0.13,
      };
    })
  ), []);
  const formationKey = useMemo(
    () => zombies.map(zombie => (
      `${zombie.id}:${zombie.variant}:${zombie.archetype}:${zombie.visualScale}`
    )).join('|'),
    [zombies],
  );

  useLayoutEffect(() => {
    const tank = tankRef.current;
    if (tank) tank.getWorldPosition(tankPosition);
    else tankPosition.set(0, 0, -12);

    const retainedIds = new Set(zombies.map(zombie => zombie.id));
    for (const [id] of runtimeByIdRef.current) {
      if (retainedIds.has(id)) continue;
      runtimeByIdRef.current.delete(id);
      posesRef.current.delete(id);
    }

    for (const zombie of zombies) {
      if (!runtimeByIdRef.current.has(zombie.id)) {
        const existingPose = posesRef.current.get(zombie.id);
        const position = existingPose?.position ?? new THREE.Vector3(...zombie.position);
        const runtime: ZombieRuntime = {
          position,
          spawnElapsed: 0,
          active: false,
          pausedByTakeover: false,
          yaw: Math.atan2(-position.x, -position.z),
          gaitPhase: deterministicUnit(zombie.id, 1) * Math.PI * 2,
          nextAttackAt: 0,
          nextRangedAttackAt: 0,
          rangedAttackCount: 0,
          steeringSide: deterministicUnit(zombie.id, 3) < 0.5 ? -1 : 1,
          avoidDirectionX: 0,
          avoidDirectionZ: 0,
          avoidUntil: 0,
          immobileElapsed: 0,
          noProgressElapsed: 0,
          bestTargetDistance: Infinity,
          lastTargetX: tankPosition.x,
          lastTargetZ: tankPosition.z,
          recoveryCount: 0,
          recoveryBlend: 1,
          collisionGraceRemaining: 0,
          seenSuppressionRevision: zombie.suppressionRevision,
          suppressionRemaining: 0,
        };
        const spawnObstacles = zombie.archetype === 'boss'
          ? BOSS_MOVEMENT_OBSTACLES
          : obstaclesRef.current;
        if (!recoverToSafePosition(
          runtime,
          zombie.id,
          tankPosition.x,
          tankPosition.z,
          spawnObstacles,
          false,
          zombie.collisionRadius,
          zombie.breachRange,
        )) {
          // The finite sector should always yield a free pocket. This bounded
          // grace is a defensive escape from future fully-overlapping layouts.
          runtime.collisionGraceRemaining = zombie.archetype === 'boss'
            ? 0
            : LAST_RESORT_COLLISION_GRACE_SECONDS;
        }
        runtimeByIdRef.current.set(zombie.id, runtime);
        posesRef.current.set(zombie.id, {
          position,
          active: false,
          archetype: zombie.archetype,
        });
      }
    }

    const singleMeshes = [torsoRef.current, headRef.current, helmetRef.current, shadowRef.current];
    const doubleMeshes = [armRef.current, legRef.current, eyeRef.current];
    for (const mesh of [...singleMeshes, ...doubleMeshes]) {
      if (mesh) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }

    const count = Math.min(zombies.length, ZOMBIE_MAX_ACTIVE);
    for (let index = 0; index < count; index += 1) {
      const zombie = zombies[index];
      const isBoss = zombie.archetype === 'boss';
      const uniformColor = isBoss ? BOSS_UNIFORM_COLOR : UNIFORM_COLORS[zombie.variant];
      const trouserColor = isBoss ? BOSS_TROUSER_COLOR : TROUSER_COLORS[zombie.variant];
      const skinColor = isBoss ? BOSS_SKIN_COLOR : CORPSE_SKIN_COLORS[zombie.variant];
      const eyeColor = isBoss ? BOSS_EYE_COLOR : STANDARD_EYE_COLOR;
      torsoRef.current?.setColorAt(index, new THREE.Color(uniformColor));
      headRef.current?.setColorAt(index, new THREE.Color(skinColor));
      helmetRef.current?.setColorAt(index, new THREE.Color(HELMET_COLORS[zombie.variant]));
      eyeRef.current?.setColorAt(index * 2, new THREE.Color(eyeColor));
      eyeRef.current?.setColorAt(index * 2 + 1, new THREE.Color(eyeColor));
      shadowRef.current?.setMatrixAt(index, hiddenMatrix);
      torsoRef.current?.setMatrixAt(index, hiddenMatrix);
      headRef.current?.setMatrixAt(index, hiddenMatrix);
      helmetRef.current?.setMatrixAt(index, hiddenMatrix);
      eyeRef.current?.setMatrixAt(index * 2, hiddenMatrix);
      eyeRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
      for (let side = 0; side < 2; side += 1) {
        const limbIndex = index * 2 + side;
        armRef.current?.setColorAt(limbIndex, new THREE.Color(uniformColor));
        legRef.current?.setColorAt(limbIndex, new THREE.Color(trouserColor));
        armRef.current?.setMatrixAt(limbIndex, hiddenMatrix);
        legRef.current?.setMatrixAt(limbIndex, hiddenMatrix);
      }
    }

    const meshes = [torsoRef.current, armRef.current, legRef.current, headRef.current, helmetRef.current, eyeRef.current, shadowRef.current];
    for (const mesh of meshes) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [formationKey, hiddenMatrix, posesRef, tankPosition, tankRef]);

  const setPartMatrix = (
    mesh: THREE.InstancedMesh | null,
    index: number,
    x: number,
    y: number,
    z: number,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    scale: readonly [number, number, number] = [1, 1, 1],
  ) => {
    if (!mesh) return;
    partObject.position.set(x, y, z);
    partObject.rotation.set(rotationX, rotationY, rotationZ);
    partObject.scale.set(...scale);
    partObject.updateMatrix();
    partMatrix.multiplyMatrices(rootObject.matrix, partObject.matrix);
    mesh.setMatrixAt(index, partMatrix);
  };

  const setBossPartTransform = (
    mesh: THREE.Mesh | null,
    position: readonly [number, number, number],
    rotation: readonly [number, number, number],
    scale: readonly [number, number, number],
  ) => {
    if (!mesh) return;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
  };

  const hideZombie = (index: number) => {
    torsoRef.current?.setMatrixAt(index, hiddenMatrix);
    headRef.current?.setMatrixAt(index, hiddenMatrix);
    helmetRef.current?.setMatrixAt(index, hiddenMatrix);
    eyeRef.current?.setMatrixAt(index * 2, hiddenMatrix);
    eyeRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
    shadowRef.current?.setMatrixAt(index, hiddenMatrix);
    armRef.current?.setMatrixAt(index * 2, hiddenMatrix);
    armRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
    legRef.current?.setMatrixAt(index * 2, hiddenMatrix);
    legRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
  };

  useFrame(({ clock, camera }, delta) => {
    const now = clock.elapsedTime;
    const movementDelta = Math.min(delta, MAX_MOVEMENT_DELTA);
    const count = Math.min(zombies.length, ZOMBIE_MAX_ACTIVE);
    const tank = tankRef.current;
    const currentObstacles = obstaclesRef.current;
    if (tank) tank.getWorldPosition(tankPosition);

    const breachWindow = breachWindowRef.current;
    if (now - breachWindow.startedAt >= 1) {
      breachWindow.startedAt = now;
      breachWindow.count = 0;
    }

    if (torsoRef.current) torsoRef.current.count = count;
    if (headRef.current) headRef.current.count = count;
    if (helmetRef.current) helmetRef.current.count = count;
    if (eyeRef.current) eyeRef.current.count = count * 2;
    if (shadowRef.current) shadowRef.current.count = count;
    if (armRef.current) armRef.current.count = count * 2;
    if (legRef.current) legRef.current.count = count * 2;
    let bossVisualActive = false;
    if (bossFaceRef.current) bossFaceRef.current.visible = false;
    if (bossRearFaceRef.current) bossRearFaceRef.current.visible = false;
    if (bossFireballRef.current) bossFireballRef.current.visible = false;
    if (bossFireAreaRef.current) bossFireAreaRef.current.visible = false;
    if (bossDetailsRef.current) bossDetailsRef.current.visible = false;
    for (const material of BOSS_OCCLUSION_MATERIALS) {
      material.opacity = 1;
      material.depthWrite = true;
    }
    if (bossFaceMaterialRef.current) {
      bossFaceMaterialRef.current.opacity = 1;
      bossFaceMaterialRef.current.depthWrite = false;
    }
    if (bossRearFaceMaterialRef.current) {
      bossRearFaceMaterialRef.current.opacity = 1;
      bossRearFaceMaterialRef.current.depthWrite = false;
    }

    for (let index = 0; index < count; index += 1) {
      const zombie = zombies[index];
      const runtime = runtimeByIdRef.current.get(zombie.id);
      const pose = posesRef.current.get(zombie.id);
      if (!runtime || !pose || !zombie.alive) {
        if (pose) pose.active = false;
        hideZombie(index);
        continue;
      }

      // Wave takeovers pause combat after the authoritative wave has already
      // spawned. Keep that pause distinct from the pose.active=false marker
      // used by lethal hits, otherwise the zero-delay lead contact is mistaken
      // for a corpse when the takeover releases and blocks wave progression.
      if (!active) {
        if (runtime.active && pose.active) runtime.pausedByTakeover = true;
        pose.active = false;
        hideZombie(index);
        continue;
      }
      if (runtime.pausedByTakeover) {
        runtime.pausedByTakeover = false;
        pose.active = runtime.active;
      }

      // The authoritative hook flips an active pose off synchronously on a
      // lethal hit. Honor that marker even if React has not delivered the new
      // `alive` prop to this frame yet, preventing one-frame resurrection.
      if (runtime.active && !pose.active) {
        hideZombie(index);
        continue;
      }

      runtime.spawnElapsed += movementDelta;
      if (runtime.spawnElapsed < zombie.spawnDelay) {
        pose.active = false;
        hideZombie(index);
        continue;
      }

      const emergence = THREE.MathUtils.clamp(
        (runtime.spawnElapsed - zombie.spawnDelay) / 0.38,
        0,
        1,
      );
      const emergenceBlend = emergence * emergence * (3 - 2 * emergence);
      if (!runtime.active) {
        runtime.active = true;
        runtime.nextAttackAt = now + 0.45 + deterministicUnit(zombie.id, 2) * 0.35;
        runtime.nextRangedAttackAt = now + BOSS_FIREBALL_INITIAL_DELAY_SECONDS;
      }
      pose.active = true;

      const suppressionDuration = zombie.archetype === 'boss'
        ? BOSS_ALLIED_SUPPRESSION_SECONDS
        : ALLIED_SUPPRESSION_SECONDS;
      if (runtime.seenSuppressionRevision !== zombie.suppressionRevision) {
        runtime.seenSuppressionRevision = zombie.suppressionRevision;
        runtime.suppressionRemaining = suppressionDuration;
      } else {
        runtime.suppressionRemaining = Math.max(
          0,
          runtime.suppressionRemaining - movementDelta,
        );
      }
      const movementSpeedScale = runtime.suppressionRemaining > 0
        ? zombie.archetype === 'boss'
          ? BOSS_ALLIED_SUPPRESSION_SPEED
          : ALLIED_SUPPRESSION_SPEED
        : 1;
      const collisionRadius = zombie.collisionRadius;
      const breachRange = zombie.breachRange;
      // The final boss ignores huts, cover, wreckage, vegetation, and other
      // low scenery while retaining the shared hill and arena-bound checks.
      // Ordinary undead continue to navigate around the full obstacle set.
      const movementObstacles = zombie.archetype === 'boss'
        ? BOSS_MOVEMENT_OBSTACLES
        : currentObstacles;

      let targetX = tankPosition.x;
      let targetZ = tankPosition.z;
      let targetFriendlyId: string | null = null;
      let nearestTargetDistanceSq = Infinity;
      if (friendliesRef && friendlyPosesRef) {
        for (const friendly of friendliesRef.current) {
          if (!friendly.alive) continue;
          const friendlyPose = friendlyPosesRef.current.get(friendly.id);
          if (!friendlyPose) continue;
          const offsetX = friendlyPose.position.x - runtime.position.x;
          const offsetZ = friendlyPose.position.z - runtime.position.z;
          const distanceSq = offsetX * offsetX + offsetZ * offsetZ;
          if (distanceSq >= nearestTargetDistanceSq) continue;
          nearestTargetDistanceSq = distanceSq;
          targetX = friendlyPose.position.x;
          targetZ = friendlyPose.position.z;
          targetFriendlyId = friendly.id;
        }
      }
      // The defensive line draws the first rush. Once every squad member is
      // down, remaining contacts converge on the player's tank.
      if (targetFriendlyId === null && tank && tankTargetEnabled) {
        nearestTargetDistanceSq = runtime.position.distanceToSquared(tankPosition);
      }

      let distanceToTarget = Infinity;
      if (Number.isFinite(nearestTargetDistanceSq)) {
        let dx = targetX - runtime.position.x;
        let dz = targetZ - runtime.position.z;
        distanceToTarget = Math.hypot(dx, dz);

        const targetShiftX = targetX - runtime.lastTargetX;
        const targetShiftZ = targetZ - runtime.lastTargetZ;
        if (targetShiftX * targetShiftX + targetShiftZ * targetShiftZ > 9) {
          runtime.bestTargetDistance = distanceToTarget;
          runtime.noProgressElapsed = 0;
        }
        runtime.lastTargetX = targetX;
        runtime.lastTargetZ = targetZ;

        let moved = false;
        let facingX = dx;
        let facingZ = dz;
        if (distanceToTarget > breachRange) {
          const inverseDistance = 1 / Math.max(distanceToTarget, 0.001);
          const step = Math.min(
            zombie.speed * movementSpeedScale * movementDelta,
            Math.max(0, distanceToTarget - breachRange),
          );
          const directX = dx * inverseDistance;
          const directZ = dz * inverseDistance;

          if (runtime.collisionGraceRemaining > 0) {
            runtime.collisionGraceRemaining = Math.max(
              0,
              runtime.collisionGraceRemaining - movementDelta,
            );
            const nextX = runtime.position.x + directX * step;
            const nextZ = runtime.position.z + directZ * step;
            const canAdvanceDuringRecovery = zombie.archetype === 'boss'
              ? !isStepBlocked(nextX, nextZ, movementObstacles, collisionRadius)
              : isInsideArena(
                nextX,
                nextZ,
                Math.max(ZOMBIE_ARENA_PADDING, collisionRadius + 1.25),
              );
            if (canAdvanceDuringRecovery) {
              runtime.position.x = nextX;
              runtime.position.z = nextZ;
              moved = true;
              facingX = directX;
              facingZ = directZ;
            }
          } else if (now < runtime.avoidUntil) {
            const nextX = runtime.position.x + runtime.avoidDirectionX * step;
            const nextZ = runtime.position.z + runtime.avoidDirectionZ * step;
            if (!isStepBlocked(nextX, nextZ, movementObstacles, collisionRadius)) {
              runtime.position.x = nextX;
              runtime.position.z = nextZ;
              moved = true;
              facingX = runtime.avoidDirectionX;
              facingZ = runtime.avoidDirectionZ;
            } else {
              runtime.avoidUntil = 0;
            }
          }

          if (!moved && runtime.collisionGraceRemaining <= 0) {
            const directNextX = runtime.position.x + directX * step;
            const directNextZ = runtime.position.z + directZ * step;
            if (!isStepBlocked(directNextX, directNextZ, movementObstacles, collisionRadius)) {
              runtime.position.x = directNextX;
              runtime.position.z = directNextZ;
              runtime.avoidUntil = 0;
              moved = true;
              facingX = directX;
              facingZ = directZ;
            } else {
              // Rotate consistently around the blocker. Deeper angles include
              // an outward/backoff component, allowing a contact touching an
              // inflated circular volume to establish clearance before tangency.
              for (let turnIndex = 0; turnIndex < AVOIDANCE_ANGLES.length; turnIndex += 1) {
                const angle = AVOIDANCE_ANGLES[turnIndex] * runtime.steeringSide;
                const cosine = Math.cos(angle);
                const sine = Math.sin(angle);
                const steerX = directX * cosine - directZ * sine;
                const steerZ = directX * sine + directZ * cosine;
                const nextX = runtime.position.x + steerX * step;
                const nextZ = runtime.position.z + steerZ * step;
                if (isStepBlocked(nextX, nextZ, movementObstacles, collisionRadius)) continue;
                runtime.position.x = nextX;
                runtime.position.z = nextZ;
                runtime.avoidDirectionX = steerX;
                runtime.avoidDirectionZ = steerZ;
                runtime.avoidUntil = now + 0.62 + turnIndex * 0.055;
                moved = true;
                facingX = steerX;
                facingZ = steerZ;
                break;
              }
            }
          }

          dx = targetX - runtime.position.x;
          dz = targetZ - runtime.position.z;
          distanceToTarget = Math.hypot(dx, dz);
          if (moved) runtime.immobileElapsed = Math.max(0, runtime.immobileElapsed - movementDelta);
          else runtime.immobileElapsed += movementDelta;

          if (distanceToTarget < runtime.bestTargetDistance - 0.18) {
            runtime.bestTargetDistance = distanceToTarget;
            runtime.noProgressElapsed = 0;
          } else {
            runtime.noProgressElapsed += movementDelta;
          }

          if (runtime.immobileElapsed >= IMMOBILE_RECOVERY_SECONDS
            || runtime.noProgressElapsed >= NO_PROGRESS_RECOVERY_SECONDS) {
            const recovered = recoverToSafePosition(
              runtime,
              zombie.id,
              targetX,
              targetZ,
              movementObstacles,
              true,
              collisionRadius,
              breachRange,
            );
            if (!recovered) {
              runtime.recoveryCount += 1;
              runtime.recoveryBlend = 0;
              runtime.immobileElapsed = 0;
              runtime.noProgressElapsed = 0;
              runtime.bestTargetDistance = distanceToTarget;
              runtime.avoidUntil = 0;
              runtime.steeringSide = runtime.steeringSide === 1 ? -1 : 1;
              runtime.collisionGraceRemaining = zombie.archetype === 'boss'
                ? 0
                : LAST_RESORT_COLLISION_GRACE_SECONDS;
            }
            dx = targetX - runtime.position.x;
            dz = targetZ - runtime.position.z;
            distanceToTarget = Math.hypot(dx, dz);
          }
        } else {
          runtime.immobileElapsed = 0;
          runtime.noProgressElapsed = 0;
          runtime.bestTargetDistance = distanceToTarget;
          runtime.avoidUntil = 0;
        }

        if (Math.abs(facingX) + Math.abs(facingZ) > 0.001) {
          runtime.yaw = Math.atan2(-facingX, -facingZ);
        }

        if (distanceToTarget <= breachRange
          && (targetFriendlyId !== null || tankTargetEnabled)
          && now >= runtime.nextAttackAt
          && now >= breachWindow.nextGlobalAt
          && breachWindow.count < ZOMBIE_MAX_BREACHES_PER_SECOND) {
          // Advance both clocks before notifying React so one animation frame can
          // never submit the same melee breach twice during a synchronous update.
          runtime.nextAttackAt = now + zombie.attackInterval;
          breachWindow.nextGlobalAt = now + MIN_GLOBAL_BREACH_GAP;
          breachWindow.count += 1;
          const breachPosition = runtime.position.clone();
          breachPosition.y += 0.72 * zombie.visualScale;
          if (targetFriendlyId) {
            onFriendlyBreach?.({
              zombieId: zombie.id,
              friendlyId: targetFriendlyId,
              position: breachPosition,
              damage: ZOMBIE_FRIENDLY_BREACH_DAMAGE,
            });
          } else {
            onTankBreach?.({
              zombieId: zombie.id,
              position: breachPosition,
              damage: ZOMBIE_BREACH_DAMAGE,
            });
          }
        }
      }

      runtime.recoveryBlend = Math.min(
        1,
        runtime.recoveryBlend + movementDelta / RECOVERY_EMERGENCE_SECONDS,
      );

      const isBoss = zombie.archetype === 'boss';
      const gaitSpeed = isBoss ? 8.4 : 5.1 + zombie.speed * 2.05;
      const gait = Math.sin(now * gaitSpeed + runtime.gaitPhase);
      const moving = distanceToTarget > breachRange;
      const stride = moving
        ? gait * (isBoss ? 0.28 : 0.47)
        : Math.sin(now * 2.2 + runtime.gaitPhase) * (isBoss ? 0.045 : 0.08);
      const bob = moving
        ? Math.abs(gait) * (isBoss ? 0.018 : 0.033)
        : Math.sin(now * 1.8 + runtime.gaitPhase) * 0.009;
      const lurch = isBoss
        ? 0.3 + Math.sin(now * 1.05 + runtime.gaitPhase) * 0.055
        : 0.19 + Math.sin(now * 1.35 + runtime.gaitPhase) * 0.045;
      const headTwitch = isBoss
        ? Math.sin(now * 7.7 + runtime.gaitPhase) * 0.075
          + Math.sin(now * 1.9 + runtime.gaitPhase) * 0.03
        : Math.sin(now * (5.2 + zombie.variant * 0.7) + runtime.gaitPhase) * 0.055;
      const stagger = runtime.suppressionRemaining > 0
        ? Math.sin((suppressionDuration - runtime.suppressionRemaining) * 31) * 0.11
        : 0;

      const recoveryBlend = runtime.recoveryBlend * runtime.recoveryBlend
        * (3 - 2 * runtime.recoveryBlend);

      rootObject.position.set(
        runtime.position.x,
        runtime.position.y - (1 - emergenceBlend) * 0.48 + bob,
        runtime.position.z,
      );
      rootObject.rotation.set(lurch + stagger * 0.35, runtime.yaw, gait * 0.028 + stagger);
      const silhouetteScale = (0.96 + zombie.variant * 0.045) * zombie.visualScale;
      const bossWidthScale = isBoss ? 0.72 : 1;
      const bossDepthScale = isBoss ? 0.66 : 1;
      rootObject.scale.set(
        emergenceBlend * recoveryBlend * silhouetteScale * bossWidthScale,
        emergenceBlend * recoveryBlend
          * (1.03 + zombie.variant * 0.025)
          * zombie.visualScale,
        emergenceBlend * recoveryBlend * silhouetteScale * bossDepthScale,
      );
      rootObject.updateMatrix();

      if (zombie.archetype === 'boss' && bossFaceRef.current) {
        bossVisualActive = true;
        // A five-times-scale boss can cross directly between the chase camera
        // and tank. Fade only the occluding silhouette (not gameplay/hitboxes)
        // so the player retains steering and aiming visibility at close range.
        cameraToTank.copy(tankPosition).sub(camera.position);
        cameraToBoss.copy(runtime.position).sub(camera.position);
        const cameraLineLengthSq = Math.max(0.001, cameraToTank.lengthSq());
        const rawLineProgress = cameraToBoss.dot(cameraToTank) / cameraLineLengthSq;
        const lineProgress = THREE.MathUtils.clamp(
          rawLineProgress,
          0,
          1,
        );
        cameraLinePoint.copy(cameraToTank).multiplyScalar(lineProgress).add(camera.position);
        const lineDistance = cameraLinePoint.distanceTo(runtime.position);
        // Include a small margin beyond the tank. The old 0.98 cutoff restored
        // the full five-times-scale silhouette at the exact moment the boss
        // reached the player, which is when chase-camera visibility matters most.
        const betweenCameraAndTank = rawLineProgress > 0.02 && rawLineProgress < 1.16;
        const lineOcclusion = betweenCameraAndTank
          ? 1 - THREE.MathUtils.smoothstep(lineDistance, 2.4, 6.2)
          : 0;
        const cameraDistance = camera.position.distanceTo(runtime.position);
        const proximityOcclusion = 1 - THREE.MathUtils.smoothstep(cameraDistance, 4.2, 8.6);
        const occlusion = Math.max(lineOcclusion, proximityOcclusion);
        const bodyOpacity = THREE.MathUtils.lerp(1, 0.05, occlusion);
        for (const material of BOSS_OCCLUSION_MATERIALS) {
          material.opacity = bodyOpacity;
          material.depthWrite = bodyOpacity > 0.88;
        }
        if (bossFaceMaterialRef.current) {
          bossFaceMaterialRef.current.opacity = THREE.MathUtils.lerp(1, 0.12, occlusion);
          bossFaceMaterialRef.current.depthWrite = false;
        }
        if (bossRearFaceMaterialRef.current) {
          bossRearFaceMaterialRef.current.opacity = THREE.MathUtils.lerp(1, 0.12, occlusion);
          bossRearFaceMaterialRef.current.depthWrite = false;
        }

        // PlaneGeometry faces +Z; rotate it toward the model's local -Z attack
        // direction, then inherit the same root yaw/lurch/scale as the body.
        partObject.position.set(0, 1.31, -0.345);
        partObject.rotation.set(-0.11, Math.PI + headTwitch, 0);
        partObject.scale.set(1, 1, 1);
        partObject.updateMatrix();
        partMatrix.multiplyMatrices(rootObject.matrix, partObject.matrix);
        bossFaceRef.current.matrix.copy(partMatrix);
        bossFaceRef.current.matrixWorldNeedsUpdate = true;
        bossFaceRef.current.visible = true;

        // The second portrait faces out from the rear (+Z) side of the same
        // head. Its offset clears the head surface so the two planes cannot
        // z-fight, while the shared root matrix keeps both faces synchronized.
        if (bossRearFaceRef.current) {
          partObject.position.set(0, 1.31, 0.305);
          partObject.rotation.set(-0.11, headTwitch, 0);
          partObject.scale.set(1, 1, 1);
          partObject.updateMatrix();
          partMatrix.multiplyMatrices(rootObject.matrix, partObject.matrix);
          bossRearFaceRef.current.matrix.copy(partMatrix);
          bossRearFaceRef.current.matrixWorldNeedsUpdate = true;
          bossRearFaceRef.current.visible = true;
        }

        if (bossDetailsRef.current) {
          bossDetailsRef.current.matrix.copy(rootObject.matrix);
          bossDetailsRef.current.matrixWorldNeedsUpdate = true;
          bossDetailsRef.current.visible = true;
        }
        if (bossHeadRef.current) {
          bossHeadRef.current.position.set(0, 1.3, -0.07);
          bossHeadRef.current.rotation.set(-0.12, headTwitch, 0);
          bossHeadRef.current.scale.set(0.78, 1.02, 0.5);
        }
        if (bossWoundRef.current) {
          const pulse = 1 + Math.sin(now * 5.4 + runtime.gaitPhase) * 0.09;
          bossWoundRef.current.scale.set(0.86 * pulse, 1.28 * pulse, 0.18);
          BOSS_WOUND_MATERIAL.emissiveIntensity = 0.68 + pulse * 0.14;
        }

        const fireball = bossFireballRuntimeRef.current;
        const tankRange = Math.hypot(
          tankPosition.x - runtime.position.x,
          tankPosition.z - runtime.position.z,
        );
        if (!tankTargetEnabled && fireball.bossId === zombie.id) {
          fireball.active = false;
        }
        if (!fireball.active
          && tankTargetEnabled
          && tank
          && tankRange >= BOSS_FIREBALL_MIN_RANGE
          && tankRange <= BOSS_FIREBALL_MAX_RANGE
          && now >= runtime.nextRangedAttackAt) {
          fireball.active = true;
          fireball.phase = 'telegraph';
          fireball.bossId = zombie.id;
          fireball.phaseStartedAt = now;
          fireball.targetPosition.copy(tankPosition);
          const cooldownJitter = deterministicUnit(
            zombie.id,
            41 + runtime.rangedAttackCount,
          );
          runtime.rangedAttackCount += 1;
          runtime.nextRangedAttackAt = now
            + BOSS_FIREBALL_TELEGRAPH_SECONDS
            + BOSS_FIREBALL_FLIGHT_SECONDS
            + BOSS_FIREBALL_COOLDOWN_MIN_SECONDS
            + cooldownJitter * BOSS_FIREBALL_COOLDOWN_VARIANCE_SECONDS;
        }

        if (fireball.active && fireball.bossId === zombie.id && bossFireballRef.current) {
          let phaseProgress = THREE.MathUtils.clamp(
            (now - fireball.phaseStartedAt) / BOSS_FIREBALL_TELEGRAPH_SECONDS,
            0,
            1,
          );
          if (fireball.phase === 'telegraph') {
            // Charge above the forward hand while tracking the tank. The target
            // locks only when the throw begins, giving the player a clear dodge cue.
            fireball.launchPosition.set(0.57, 0.82, -0.48).applyMatrix4(rootObject.matrix);
            fireball.targetPosition.copy(tankPosition);
            fireballPosition.copy(fireball.launchPosition);
            if (phaseProgress >= 1) {
              fireball.phase = 'flight';
              fireball.phaseStartedAt = now;
              phaseProgress = 0;
            }
          }

          if (fireball.phase === 'flight') {
            phaseProgress = THREE.MathUtils.clamp(
              (now - fireball.phaseStartedAt) / BOSS_FIREBALL_FLIGHT_SECONDS,
              0,
              1,
            );
            fireballPosition.lerpVectors(
              fireball.launchPosition,
              fireball.targetPosition,
              phaseProgress,
            );
            fireballPosition.y += Math.sin(phaseProgress * Math.PI) * BOSS_FIREBALL_ARC_HEIGHT;
            if (phaseProgress >= 1) {
              fireball.phase = 'burn';
              fireball.phaseStartedAt = now;
              fireball.damageApplied = false;
            }
          }

          if (fireball.phase === 'burn') {
            const burnAge = now - fireball.phaseStartedAt;
            const burnDown = burnAge <= BOSS_FIRE_AOE_SUSTAIN_SECONDS
              ? 1
              : 1 - THREE.MathUtils.smoothstep(
                burnAge,
                BOSS_FIRE_AOE_SUSTAIN_SECONDS,
                BOSS_FIRE_AOE_SECONDS,
              );
            if (burnAge >= BOSS_FIRE_AOE_SECONDS) {
              fireball.active = false;
            } else {
              if (bossFireAreaRef.current) {
                fireAreaObject.position.set(
                  fireball.targetPosition.x,
                  0.045,
                  fireball.targetPosition.z,
                );
                fireAreaObject.rotation.set(0, 0, 0);
                fireAreaObject.scale.set(1, 1, 1);
                fireAreaObject.updateMatrix();
                bossFireAreaRef.current.matrix.copy(fireAreaObject.matrix);
                bossFireAreaRef.current.matrixWorldNeedsUpdate = true;
                bossFireAreaRef.current.visible = true;
              }

              if (!fireball.damageApplied && tankTargetEnabled && tank) {
                const impactDistance = Math.hypot(
                  tankPosition.x - fireball.targetPosition.x,
                  tankPosition.z - fireball.targetPosition.z,
                );
                if (impactDistance <= BOSS_FIREBALL_BLAST_RADIUS
                  && now >= breachWindow.nextGlobalAt
                  && breachWindow.count < ZOMBIE_MAX_BREACHES_PER_SECOND) {
                  fireball.damageApplied = true;
                  breachWindow.nextGlobalAt = now + MIN_GLOBAL_BREACH_GAP;
                  breachWindow.count += 1;
                  const damagePosition = fireball.targetPosition.clone();
                  damagePosition.y = 0.28;
                  onTankBreach?.({
                    zombieId: zombie.id,
                    position: damagePosition,
                    damage: ZOMBIE_BREACH_DAMAGE,
                  });
                }
              }

              flameBillboardQuaternion.copy(camera.quaternion);
              const outerFlames = bossFireOuterRef.current;
              const innerFlames = bossFireInnerRef.current;
              if (outerFlames && innerFlames) {
                bossFireParticles.forEach((particle, particleIndex) => {
                  const localAge = burnAge - particle.delay;
                  if (localAge < 0 || burnDown <= 0) {
                    fireParticleObject.scale.setScalar(0);
                  } else {
                    const lifetime = 0.68 + particle.phase * 0.42;
                    const cycleAge = (localAge + particle.phase * lifetime) % lifetime;
                    const life = cycleAge / lifetime;
                    const envelope = Math.sin(Math.min(life * 1.08, 1) * Math.PI)
                      * (1 - life * 0.24);
                    const gust = Math.sin(now * 7.2 + particle.phase * Math.PI * 2);
                    const scale = particle.size * envelope * burnDown * (0.9 + gust * 0.1);
                    fireParticleObject.position.set(
                      particle.x + gust * 0.08,
                      0.08 + life * particle.rise,
                      particle.z + Math.cos(now * 5.5 + particle.phase * 8) * 0.07,
                    );
                    fireParticleObject.quaternion.copy(flameBillboardQuaternion);
                    fireParticleObject.rotateZ(gust * 0.08);
                    fireParticleObject.scale.set(scale, scale * 2.25, 1);
                  }
                  fireParticleObject.updateMatrix();
                  outerFlames.setMatrixAt(particleIndex, fireParticleObject.matrix);

                  if (localAge >= 0 && burnDown > 0) {
                    fireParticleObject.position.y -= particle.size * 0.32;
                    fireParticleObject.scale.x *= 0.52;
                    fireParticleObject.scale.y *= 0.74;
                  }
                  fireParticleObject.updateMatrix();
                  innerFlames.setMatrixAt(particleIndex, fireParticleObject.matrix);
                });
                outerFlames.instanceMatrix.needsUpdate = true;
                innerFlames.instanceMatrix.needsUpdate = true;
              }

              if (bossFireScorchMaterialRef.current) {
                const scorchAttack = THREE.MathUtils.smoothstep(burnAge, 0, 0.22);
                bossFireScorchMaterialRef.current.opacity = scorchAttack * burnDown * 0.72;
              }
              const shockwaveProgress = THREE.MathUtils.clamp(burnAge / 0.72, 0, 1);
              if (bossFireShockwaveRef.current) {
                bossFireShockwaveRef.current.visible = shockwaveProgress < 1;
                bossFireShockwaveRef.current.scale.setScalar(
                  THREE.MathUtils.lerp(0.62, BOSS_FIREBALL_BLAST_RADIUS, shockwaveProgress),
                );
              }
              if (bossFireShockwaveMaterialRef.current) {
                bossFireShockwaveMaterialRef.current.opacity = Math.pow(
                  1 - shockwaveProgress,
                  2,
                ) * 0.58;
              }
            }
          }

          if (fireball.active && fireball.phase !== 'burn') {
            const telegraphScale = fireball.phase === 'telegraph'
              ? THREE.MathUtils.lerp(0.34, 1.08, phaseProgress)
              : 1.08;
            const pulse = 1 + Math.sin(now * 15) * 0.07;
            fireballObject.position.copy(fireballPosition);
            fireballObject.rotation.set(
              fireball.phase === 'flight' ? now * 2.8 : 0.08,
              now * (fireball.phase === 'flight' ? 6.4 : 2.2),
              fireball.phase === 'flight' ? now * 3.6 : -0.12,
            );
            fireballObject.scale.setScalar(telegraphScale * pulse);
            fireballObject.updateMatrix();
            bossFireballRef.current.matrix.copy(fireballObject.matrix);
            bossFireballRef.current.matrixWorldNeedsUpdate = true;
            bossFireballRef.current.visible = true;
          }
        }
      }

      if (isBoss) {
        torsoRef.current?.setMatrixAt(index, hiddenMatrix);
        headRef.current?.setMatrixAt(index, hiddenMatrix);
        helmetRef.current?.setMatrixAt(index, hiddenMatrix);
        eyeRef.current?.setMatrixAt(index * 2, hiddenMatrix);
        eyeRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
        armRef.current?.setMatrixAt(index * 2, hiddenMatrix);
        armRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
        legRef.current?.setMatrixAt(index * 2, hiddenMatrix);
        legRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
        setBossPartTransform(
          bossLeftArmRef.current,
          [-0.43, 0.84, -0.2],
          [-1.28 + stride * 0.12, 0, -0.25],
          [1.35, 1.42, 1.4],
        );
        setBossPartTransform(
          bossRightArmRef.current,
          [0.44, 0.81, -0.17],
          [-1.16 - stride * 0.1, 0, 0.34],
          [1.45, 1.55, 1.45],
        );
        setBossPartTransform(
          bossRearLeftArmRef.current,
          [-0.43, 0.8, 0.22],
          [-0.62 - stride * 0.08, 0, -0.38],
          [1.38, 1.48, 1.42],
        );
        setBossPartTransform(
          bossRearRightArmRef.current,
          [0.44, 0.78, 0.22],
          [-0.56 + stride * 0.08, 0, 0.4],
          [1.42, 1.52, 1.45],
        );
        setBossPartTransform(
          bossLeftLegRef.current,
          [-0.17, 0.3, 0.04],
          [stride * 0.58, 0, -0.04],
          [1.18, 1.12, 1.3],
        );
        setBossPartTransform(
          bossRightLegRef.current,
          [0.17, 0.3, 0.04],
          [-stride * 0.58, 0, 0.06],
          [1.18, 1.12, 1.3],
        );
      } else {
        setPartMatrix(torsoRef.current, index, 0, 0.78, 0, 0.16, 0, 0);
        setPartMatrix(headRef.current, index, 0, 1.27, -0.09, -0.11, headTwitch, 0);
        setPartMatrix(helmetRef.current, index, 0, 1.37, -0.09, -0.11, headTwitch, 0);
        setPartMatrix(eyeRef.current, index * 2, -0.072, 1.3, -0.285, -0.11, headTwitch, 0);
        setPartMatrix(eyeRef.current, index * 2 + 1, 0.072, 1.3, -0.285, -0.11, headTwitch, 0);
        setPartMatrix(armRef.current, index * 2, -0.34, 0.82, -0.17, -1.02 + stride * 0.2, 0, -0.13);
        setPartMatrix(armRef.current, index * 2 + 1, 0.34, 0.82, -0.17, -1.02 - stride * 0.2, 0, 0.13);
        setPartMatrix(legRef.current, index * 2, -0.14, 0.29, 0, stride, 0, 0);
        setPartMatrix(legRef.current, index * 2 + 1, 0.14, 0.29, 0, -stride, 0, 0);
      }
      setPartMatrix(shadowRef.current, index, 0, 0.015, 0, -Math.PI / 2, 0, 0);
    }

    if (!bossVisualActive) {
      bossFireballRuntimeRef.current.active = false;
      if (bossFireballRef.current) bossFireballRef.current.visible = false;
      if (bossFireAreaRef.current) bossFireAreaRef.current.visible = false;
    }

    if (count > 0) {
      if (torsoRef.current) torsoRef.current.instanceMatrix.needsUpdate = true;
      if (armRef.current) armRef.current.instanceMatrix.needsUpdate = true;
      if (legRef.current) legRef.current.instanceMatrix.needsUpdate = true;
      if (headRef.current) headRef.current.instanceMatrix.needsUpdate = true;
      if (helmetRef.current) helmetRef.current.instanceMatrix.needsUpdate = true;
      if (eyeRef.current) eyeRef.current.instanceMatrix.needsUpdate = true;
      if (shadowRef.current) shadowRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group dispose={null}>
      <instancedMesh
        ref={torsoRef}
        args={[TORSO_GEOMETRY, TORSO_MATERIAL, ZOMBIE_MAX_ACTIVE]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={armRef}
        args={[LIMB_GEOMETRY, TORSO_MATERIAL, ZOMBIE_MAX_ACTIVE * 2]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={legRef}
        args={[LIMB_GEOMETRY, LIMB_MATERIAL, ZOMBIE_MAX_ACTIVE * 2]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={headRef}
        args={[HEAD_GEOMETRY, HEAD_MATERIAL, ZOMBIE_MAX_ACTIVE]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={helmetRef}
        args={[HELMET_GEOMETRY, HELMET_MATERIAL, ZOMBIE_MAX_ACTIVE]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={eyeRef}
        args={[EYE_GEOMETRY, EYE_MATERIAL, ZOMBIE_MAX_ACTIVE * 2]}
        frustumCulled={false}
        renderOrder={3}
      />
      <mesh
        ref={bossFaceRef}
        matrixAutoUpdate={false}
        visible={false}
        frustumCulled={false}
        renderOrder={10}
      >
        <planeGeometry args={[0.9, 0.82]} />
        <meshStandardMaterial
          ref={bossFaceMaterialRef}
          map={bossFaceTexture}
          transparent
          alphaTest={0.08}
          depthTest={false}
          depthWrite={false}
          side={THREE.FrontSide}
          roughness={0.92}
          metalness={0}
          emissive="#ffffff"
          emissiveMap={bossFaceTexture}
          emissiveIntensity={0.62}
        />
      </mesh>
      <mesh
        ref={bossRearFaceRef}
        matrixAutoUpdate={false}
        visible={false}
        frustumCulled={false}
        renderOrder={10}
      >
        <planeGeometry args={[0.9, 0.82]} />
        <meshStandardMaterial
          ref={bossRearFaceMaterialRef}
          map={bossRearFaceTexture}
          transparent
          alphaTest={0.08}
          depthTest={false}
          depthWrite={false}
          side={THREE.FrontSide}
          roughness={0.92}
          metalness={0}
          emissive="#ffffff"
          emissiveMap={bossRearFaceTexture}
          emissiveIntensity={0.62}
        />
      </mesh>
      <group
        ref={bossDetailsRef}
        matrixAutoUpdate={false}
        visible={false}
      >
        <mesh
          geometry={BOSS_TORSO_GEOMETRY}
          material={BOSS_TORSO_MATERIAL}
          position={[0, 0.8, 0.015]}
          rotation={[0.23, 0, 0]}
          scale={[0.9, 1.12, 0.62]}
          frustumCulled={false}
          castShadow
        />
        <mesh
          ref={bossHeadRef}
          geometry={HEAD_GEOMETRY}
          material={BOSS_HEAD_MATERIAL}
          frustumCulled={false}
          castShadow
        />
        <mesh
          ref={bossLeftArmRef}
          geometry={BOSS_ARM_GEOMETRY}
          material={BOSS_LIMB_MATERIAL}
          frustumCulled={false}
          castShadow
        />
        <mesh
          ref={bossRightArmRef}
          geometry={BOSS_ARM_GEOMETRY}
          material={BOSS_LIMB_MATERIAL}
          frustumCulled={false}
          castShadow
        />
        <mesh
          ref={bossRearLeftArmRef}
          geometry={BOSS_ARM_GEOMETRY}
          material={BOSS_LIMB_MATERIAL}
          frustumCulled={false}
          castShadow
        />
        <mesh
          ref={bossRearRightArmRef}
          geometry={BOSS_ARM_GEOMETRY}
          material={BOSS_LIMB_MATERIAL}
          frustumCulled={false}
          castShadow
        />
        <mesh
          ref={bossLeftLegRef}
          geometry={BOSS_LEG_GEOMETRY}
          material={BOSS_LIMB_MATERIAL}
          frustumCulled={false}
          castShadow
        />
        <mesh
          ref={bossRightLegRef}
          geometry={BOSS_LEG_GEOMETRY}
          material={BOSS_LIMB_MATERIAL}
          frustumCulled={false}
          castShadow
        />
        <instancedMesh
          ref={bossRibsRef}
          args={[BOSS_RIB_GEOMETRY, BOSS_BONE_MATERIAL, BOSS_RIB_TRANSFORMS.length]}
          frustumCulled={false}
          castShadow
        />
        <instancedMesh
          ref={bossSpikesRef}
          args={[BOSS_SPIKE_GEOMETRY, BOSS_BONE_MATERIAL, BOSS_SPIKE_TRANSFORMS.length]}
          frustumCulled={false}
          castShadow
        />
        <mesh
          ref={bossWoundRef}
          geometry={BOSS_WOUND_GEOMETRY}
          material={BOSS_WOUND_MATERIAL}
          position={[0, 0.89, -0.292]}
          frustumCulled={false}
        />
      </group>
      <group
        ref={bossFireballRef}
        matrixAutoUpdate={false}
        visible={false}
        frustumCulled={false}
      >
        <mesh
          geometry={BOSS_FIREBALL_CONE_GEOMETRY}
          material={BOSS_FIREBALL_CONE_MATERIAL}
          position={[0, -0.12, 0]}
          rotation={[0, 0, Math.PI]}
        />
        <mesh
          geometry={BOSS_FIREBALL_SCOOP_GEOMETRY}
          material={BOSS_FIREBALL_SCOOP_MATERIAL}
          position={[0, 0.22, 0]}
          renderOrder={5}
        />
        <mesh
          geometry={BOSS_FIREBALL_GLOW_GEOMETRY}
          material={BOSS_FIREBALL_GLOW_MATERIAL}
          position={[0, 0.22, 0]}
          renderOrder={6}
        />
      </group>
      <group
        ref={bossFireAreaRef}
        matrixAutoUpdate={false}
        visible={false}
        frustumCulled={false}
      >
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[BOSS_FIREBALL_BLAST_RADIUS, BOSS_FIREBALL_BLAST_RADIUS, 1]}
          position={[0, 0.012, 0]}
        >
          <circleGeometry args={[1, 28]} />
          <meshBasicMaterial
            ref={bossFireScorchMaterialRef}
            color="#3b0d08"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
        <mesh
          ref={bossFireShockwaveRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.08, 0]}
        >
          <ringGeometry args={[0.76, 1, 32]} />
          <meshBasicMaterial
            ref={bossFireShockwaveMaterialRef}
            color="#ffd27a"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <instancedMesh
          ref={bossFireOuterRef}
          args={[undefined, undefined, BOSS_FIRE_PARTICLE_COUNT]}
          renderOrder={55}
          frustumCulled={false}
        >
          <planeGeometry args={[1, 2]} />
          <meshBasicMaterial
            map={bossFlameTexture}
            color="#e8441c"
            transparent
            opacity={0.56}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </instancedMesh>
        <instancedMesh
          ref={bossFireInnerRef}
          args={[undefined, undefined, BOSS_FIRE_PARTICLE_COUNT]}
          renderOrder={56}
          frustumCulled={false}
        >
          <planeGeometry args={[1, 2]} />
          <meshBasicMaterial
            map={bossFlameTexture}
            color="#ffb52f"
            transparent
            opacity={0.76}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </instancedMesh>
      </group>
      <instancedMesh
        ref={shadowRef}
        args={[SHADOW_GEOMETRY, SHADOW_MATERIAL, ZOMBIE_MAX_ACTIVE]}
        frustumCulled={false}
        renderOrder={1}
      />
    </group>
  );
}
