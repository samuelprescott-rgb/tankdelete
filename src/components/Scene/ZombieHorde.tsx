import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {seatCharacterFlame,type CharacterBurns} from './CharacterFires';
import { makeGhostDoomSundae } from './ghostDoomSundae';
import { PixelFireVolume } from './PixelFireVolume';
import { AuthoredZombieHead, ZOMBIE_EYE_LOCAL } from './AuthoredZombieHead';
import { commandCarriage, commandPelvisY, loadCommandStance, newCommandWalk, poseCommandLeg, walkCommand } from './commandBody';
import { COMMAND_ARM_SEATS, COMMAND_HEAD_SEATS, COMMAND_JAW_HINGE, commandArm, commandCoat, commandFaceMaterial, commandFasciaRig, commandFoot, commandHeadTrim, commandHideFinish, commandMantle, commandSkull, commandWaist, poseCommandFascia } from './commandCreature';
import {commandLegMantle,commandLegRig,poseCommandLegMantle} from './commandLegMantle';
import { undeadEyeMaterial } from './undeadEyes';
import { commandFireBounce } from './commandFireBounce';
import { CommandFootWater } from './CommandFootWater';
import { createCommandPortraitMasks } from './commandPortraitMasks';
import { createUndeadUpperPose, writeUndeadUpperPose } from './undeadUpperPose';
import { applyPaintedFinish } from './paintedMaterials';
import { applyUndeadReadability } from './undeadReadability';
import { createZombieTorsoGeometry, createZombieArmGeometry, createZombieLegGeometry,
  createZombieHeadGeometry, createZombieHelmetGeometry, createZombieMaterial } from './zombieGeometry';
import { isInsideArena } from '../../lib/arenaBounds';
import type { CombatObstacle } from '../../lib/combat';
import type { FriendlyCombatant, FriendlyCombatPose } from '../../lib/combat';
import { intersectsTerrainMound } from '../../lib/terrain';
import type { TankGroundProfile } from '../../lib/tankGroundProfile';
import { undeadSupportY } from '../../lib/undeadGround';
import { selectEmbassyTarget, EMBASSY_MELEE_DAMAGE, type EmbassyArchive } from '../../lib/embassyDefense';
import {
  hashZombieSession,
  COMMAND_ENTRY,
  COMMAND_INGRESS,
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
const FLAME_UP = new THREE.Vector3(0,1,0);
// A close boss swing is an animation commitment, not touch damage. The
// player can drive clear during the shoulder lift; ranged telegraphs keep
// their independent rules and do not share this clock.
const BOSS_SWING_LIFT = .70;
const BOSS_SWING_FOLLOW = .23;
const ZOMBIE_VISUAL_HIDDEN = 0;
const ZOMBIE_VISUAL_STANDARD = 1;
const ZOMBIE_VISUAL_BOSS = 2;

// Ordered shallow-to-deep detours. A zombie commits to the first clear heading
// for a short window instead of reconsidering the blocked direct line every frame.
const AVOIDANCE_ANGLES = [0.58, 0.94, 1.3, 1.7, 2.12, 2.55, Math.PI] as const;

const UNIFORM_COLORS = ['#85805e', '#617863', '#626b7a'] as const;
const TROUSER_COLORS = ['#57533f', '#465646', '#4d5660'] as const;
const HELMET_COLORS = ['#979263', '#78805b', '#84826b'] as const;
const CORPSE_SKIN_COLORS = ['#9b9f79', '#859273', '#a5a08d'] as const;
const BOSS_UNIFORM_COLOR = '#302b22';
const BOSS_TROUSER_COLOR = '#1e2018';
const BOSS_SKIN_COLOR = '#4f5d47';

const TORSO_GEOMETRY = createZombieTorsoGeometry();
const ARM_GEOMETRY = createZombieArmGeometry();
const LEG_GEOMETRY = createZombieLegGeometry();
const STANDARD_HEAD_GEOMETRY = createZombieHeadGeometry();
const HELMET_GEOMETRY = createZombieHelmetGeometry().scale(.74, .79, .72)
  .translate(0, .088, 0);
const HEAD_GEOMETRY=commandSkull();
const BOSS_HEADS=[HEAD_GEOMETRY,commandSkull(true)];
const BOSS_JAWS=[commandSkull(false,true),commandSkull(true,true)];
const BOSS_CROWNS=[commandHeadTrim(),commandHeadTrim(true)];
const BOSS_ENAMEL=[commandHeadTrim(false,true),commandHeadTrim(true,true)];
const BOSS_ARMS=Array.from({length:4},(_,i)=>{
  const s=i%2?1:-1,rear=i>1;
  return {upper:commandArm(s,rear,'upper'),fore:commandArm(s,rear,'fore'),hand:commandArm(s,rear,'hand')};
});
const EYE_GEOMETRY = new THREE.PlaneGeometry(1,1);
const SHADOW_GEOMETRY = new THREE.CircleGeometry(0.42, 12);
const BOSS_MANTLE = commandMantle();
const BOSS_LEG_MANTLE=commandLegMantle();
const BOSS_FEET=[commandFoot(-1),commandFoot(1)];
const BOSS_WAIST = commandWaist();
const BOSS_TORSO_GEOMETRY = commandCoat();
const BOSS_WOUND_GEOMETRY = new THREE.IcosahedronGeometry(0.056, 1);
const BOSS_FIREBALL_CONE_GEOMETRY = makeGhostDoomSundae('wafer');
const BOSS_FIREBALL_SCOOP_GEOMETRY = makeGhostDoomSundae('scoop');
const BOSS_FIREBALL_GLOW_GEOMETRY = makeGhostDoomSundae('sparks');

const TORSO_MATERIAL = applyUndeadReadability(applyPaintedFinish(createZombieMaterial('cloth'), {
  scale: 2.8, strength: 0.95, edge: 0.8, direction: 'vertical',
}), 'cloth');
const LIMB_MATERIAL = TORSO_MATERIAL;
const HEAD_MATERIAL = applyUndeadReadability(applyPaintedFinish(createZombieMaterial('skin'), {
  scale: 4.1, strength: 0.75, edge: 0.55,
}), 'skin');
const HELMET_MATERIAL = applyUndeadReadability(applyPaintedFinish(createZombieMaterial('helmet'), {
  scale: 3.1, strength: 0.9, edge: 0.65,
}), 'helmet');
const EYE_MATERIAL=undeadEyeMaterial();
const SHADOW_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#10150f',
  transparent: true,
  opacity: 0.36,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const BOSS_TORSO_MATERIAL = applyPaintedFinish(new THREE.MeshStandardMaterial({
  color: '#707773',
  emissive: '#14140e',
  emissiveIntensity: 0.22,
  roughness: 1,
  metalness: 0,
  vertexColors: true,
  side: THREE.DoubleSide,
}), { scale: 1.9, strength: 1.15, edge: .9, direction: 'vertical' });
const bossHideMaterial = (rake=false)=>commandHideFinish(applyPaintedFinish(new THREE.MeshStandardMaterial({
  color: '#969796',
  emissive: '#11110c',
  emissiveIntensity: 0.18,
  roughness: 1,
  metalness: 0,
  vertexColors: true,
}), { scale: 4.6, strength: .53, edge: .36, direction: 'vertical' }),rake);
const BOSS_LIMB_MATERIAL=bossHideMaterial(),BOSS_RAKE_MATERIAL=bossHideMaterial(true);
const BOSS_FACE=commandFaceMaterial();
const BOSS_WOUND_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#61444c',
  emissive: '#54252d',
  emissiveIntensity: 0.29,
  roughness: 0.72,
  metalness: 0,
});
const SUNDAE_INK = new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,side:THREE.DoubleSide});

const BOSS_OCCLUSION_MATERIALS = [
  BOSS_TORSO_MATERIAL,
  BOSS_LIMB_MATERIAL,
  BOSS_RAKE_MATERIAL,
  BOSS_FACE,
  BOSS_WOUND_MATERIAL,
] as const;

for (const material of BOSS_OCCLUSION_MATERIALS) {
  material.transparent = true;
  commandFireBounce(material,material===BOSS_FACE?'skull':material===BOSS_LIMB_MATERIAL||material===BOSS_RAKE_MATERIAL?'hide':
    material===BOSS_TORSO_MATERIAL?'coat':'wound');
}



interface ZombieRuntime {
  position: THREE.Vector3;
  spawnElapsed: number;
  active: boolean;
  pausedByTakeover: boolean;
  yaw: number;
  gaitPhase: number;
  nextAttackAt: number;
  swingLift: number;
  lastTankSwing: number;
  heldSoldier: string | null;
  armWindup: number;
  lastSoldierSwing: number;
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
  seenChallenge: number;
  challengingUntil: number;
  suppressionRemaining: number;
  crossingPaddy: boolean;
  commandWaypoint: number;
  commandCounterUntil: number;
  commandCounterReadyAt: number;
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
  burns?:CharacterBurns;
  ground?: TankGroundProfile;
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
  archives?: readonly EmbassyArchive[];
  onArchiveHit?: (id: string, damage: number) => void;
}

function deterministicUnit(id: string, salt: number) {
  let value = (hashZombieSession(id) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

export function isStepBlocked(
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
export function recoverToSafePosition(
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
  burns,
  ground,
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
  archives = [],
  onArchiveHit,
}: ZombieHordeProps) {
  const hordeRootRef = useRef<THREE.Group | null>(null);
  // Start in the rendered state so an initial active=false mount still runs
  // the one-time pause/pose cleanup on its first frame.
  const renderingActiveRef = useRef(true);
  const bossVisualActiveRef = useRef(false);
  const visualStateByIndexRef = useRef(new Uint8Array(ZOMBIE_MAX_ACTIVE));
  const torsoRef = useRef<THREE.InstancedMesh | null>(null);
  const armRef = useRef<THREE.InstancedMesh | null>(null);
  const legRef = useRef<THREE.InstancedMesh | null>(null);
  const headRef = useRef<THREE.InstancedMesh | null>(null);
  const helmetRef = useRef<THREE.InstancedMesh | null>(null);
  const eyeRef = useRef<THREE.InstancedMesh | null>(null);
  const bossDetailsRef = useRef<THREE.Group | null>(null);
  const portraitMasks=useMemo(createCommandPortraitMasks,[]);
  const maskWearer=zombies.find(z=>z.archetype==='boss');
  const hasMaskWearer=!!maskWearer;
  useEffect(()=>hasMaskWearer?portraitMasks.load():undefined,[portraitMasks,hasMaskWearer]);
  useEffect(()=>()=>portraitMasks.dispose(),[portraitMasks]);
  const bossChestRef = useRef<THREE.Group | null>(null);
  const bossWalk = useMemo(newCommandWalk,[]);
  const bossFascia=useMemo(()=>{
    const rig=commandFasciaRig(),mesh=new THREE.SkinnedMesh(BOSS_MANTLE,BOSS_LIMB_MATERIAL);
    mesh.name='command-living-shoulder-net';mesh.castShadow=true;mesh.bindMode=THREE.DetachedBindMode;
    mesh.bind(rig,new THREE.Matrix4());mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.99,0),1.40);
    return {rig,mesh};
  },[]);
  useEffect(()=>()=>bossFascia.rig.dispose(),[bossFascia]);
  const bossLegMantle=useMemo(()=>{
    const rig=commandLegRig(),mesh=new THREE.SkinnedMesh(BOSS_LEG_MANTLE,BOSS_LIMB_MATERIAL);
    mesh.name='command-continuous-lower-body';mesh.castShadow=true;mesh.bindMode=THREE.DetachedBindMode;
    mesh.bind(rig,new THREE.Matrix4());mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.40,0),1.55);
    return {rig,mesh};
  },[]);
  useEffect(()=>()=>bossLegMantle.rig.dispose(),[bossLegMantle]);
  const bossWaistRef=useRef<THREE.Mesh|null>(null);
  const bossWoundRef = useRef<THREE.Mesh | null>(null);
  const upperBones=useRef<Array<THREE.Mesh|null>>([]);
  const elbowBones=useRef<Array<THREE.Mesh|null>>([]);
  const wristBones=useRef<Array<THREE.Mesh|null>>([]);
  const skullBones=useRef<Array<THREE.Mesh|null>>([]);
  const jawBones=useRef<Array<THREE.Mesh|null>>([]);
  const bossThighs = useRef<Array<THREE.Group|null>>([]);
  const bossShins = useRef<Array<THREE.Group|null>>([]);
  const bossBoots = useRef<Array<THREE.Group|null>>([]);
  const bossFireballRef = useRef<THREE.Group | null>(null);
  const bossFireAreaRef = useRef<THREE.Group | null>(null);
  const bossGroundFlamesRef = useRef<THREE.InstancedMesh | null>(null);
  const bossCometFlameRef = useRef<THREE.InstancedMesh | null>(null);
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
  // Separate defensive positions must not share a single damage token with
  // each other or with the tank. Preserve protection against a same-frame pile-on.
  const soldierReadyAt = useRef(new Map<string,number>());
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;

  const tankPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraToTank = useMemo(() => new THREE.Vector3(), []);
  const cameraToBoss = useMemo(() => new THREE.Vector3(), []);
  const cameraLinePoint = useMemo(() => new THREE.Vector3(), []);
  const rootObject = useMemo(() => new THREE.Object3D(), []);
  const partObject = useMemo(() => new THREE.Object3D(), []);
  const bodySockets = useMemo(() => ({
    neck: new THREE.Vector3(),
    leftShoulder: new THREE.Vector3(),
    rightShoulder: new THREE.Vector3(),
  }), []);
  const upperPose = useMemo(createUndeadUpperPose, []);
  const fireballObject = useMemo(() => new THREE.Object3D(), []);
  const fireballPosition = useMemo(() => new THREE.Vector3(), []);
  const fireAreaObject = useMemo(() => new THREE.Object3D(), []);
  const fireParticleObject = useMemo(() => new THREE.Object3D(), []);
  const flameDirection = useMemo(() => new THREE.Vector3(), []);
  const inverseCometRotation = useMemo(() => new THREE.Quaternion(), []);
  const partMatrix = useMemo(() => new THREE.Matrix4(), []);
  const headPartMatrix = useMemo(() => new THREE.Matrix4(), []);
  const hiddenMatrix = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const bossFireParticles = useMemo<readonly BossFireParticle[]>(() => (
    Array.from({ length: BOSS_FIRE_PARTICLE_COUNT }, (_, index) => {
      const unitRadius = Math.sqrt((index + 0.45) / BOSS_FIRE_PARTICLE_COUNT);
      const angle = index * 2.399963229728653;
      const radialJitter = 0.78 + deterministicUnit('boss-fire-ring', index) * 0.22;
      const radius = unitRadius * BOSS_FIREBALL_BLAST_RADIUS * radialJitter;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        delay: unitRadius * .26 + deterministicUnit('boss-fire-delay', index) * .08,
        phase: deterministicUnit('boss-fire-phase', index),
        rise: 0.72 + deterministicUnit('boss-fire-rise', index) * 1.15,
        size: 0.18 + deterministicUnit('boss-fire-size', index) * 0.13,
      };
    })
  ).sort((a,b)=>a.delay-b.delay), []);
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
          swingLift: 0,
          lastTankSwing: -Infinity,
          heldSoldier: null, armWindup: 0, lastSoldierSwing: -Infinity,
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
          seenChallenge: zombie.playerChallenge, challengingUntil: -Infinity,
          suppressionRemaining: 0,
          crossingPaddy: !!zombie.openingPaddyApproach,
          commandWaypoint: zombie.commandIngress && Math.hypot(position.x-COMMAND_ENTRY[0],position.z-COMMAND_ENTRY[1])<.6 ? 0 : -1,
          commandCounterUntil: -Infinity, commandCounterReadyAt: -Infinity,
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
    visualStateByIndexRef.current.fill(ZOMBIE_VISUAL_HIDDEN);
    for (let index = 0; index < count; index += 1) {
      const zombie = zombies[index];
      const isBoss = zombie.archetype === 'boss';
      const uniformColor = isBoss ? BOSS_UNIFORM_COLOR : UNIFORM_COLORS[zombie.variant];
      const trouserColor = isBoss ? BOSS_TROUSER_COLOR : TROUSER_COLORS[zombie.variant];
      const skinColor = isBoss ? BOSS_SKIN_COLOR : CORPSE_SKIN_COLORS[zombie.variant];
      torsoRef.current?.setColorAt(index, new THREE.Color(uniformColor));
      headRef.current?.setColorAt(index, new THREE.Color(skinColor));
      helmetRef.current?.setColorAt(index, new THREE.Color(HELMET_COLORS[zombie.variant]));
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
    partObject.position.set(x, y, z);
    partObject.rotation.set(rotationX, rotationY, rotationZ);
    partObject.scale.set(...scale);
    partObject.updateMatrix();
    if (!mesh) return;
    partMatrix.multiplyMatrices(rootObject.matrix, partObject.matrix);
    mesh.setMatrixAt(index, partMatrix);
  };


  const hideStandardZombieParts = (index: number) => {
    torsoRef.current?.setMatrixAt(index, hiddenMatrix);
    headRef.current?.setMatrixAt(index, hiddenMatrix);
    helmetRef.current?.setMatrixAt(index, hiddenMatrix);
    eyeRef.current?.setMatrixAt(index * 2, hiddenMatrix);
    eyeRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
    armRef.current?.setMatrixAt(index * 2, hiddenMatrix);
    armRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
    legRef.current?.setMatrixAt(index * 2, hiddenMatrix);
    legRef.current?.setMatrixAt(index * 2 + 1, hiddenMatrix);
  };

  const hideZombie = (index: number) => {
    const previousState = visualStateByIndexRef.current[index];
    if (previousState === ZOMBIE_VISUAL_STANDARD) {
      hideStandardZombieParts(index);
    }
    if (previousState !== ZOMBIE_VISUAL_HIDDEN) {
      shadowRef.current?.setMatrixAt(index, hiddenMatrix);
    }
    visualStateByIndexRef.current[index] = ZOMBIE_VISUAL_HIDDEN;
    return previousState;
  };

  const hideBossVisuals = () => {
    bossFireballRuntimeRef.current.active = false;
    bossWalk.key='';
    if (bossFireballRef.current) bossFireballRef.current.visible = false;
    if (bossFireAreaRef.current) bossFireAreaRef.current.visible = false;
    if (bossDetailsRef.current) bossDetailsRef.current.visible = false;
    for (const material of BOSS_OCCLUSION_MATERIALS) {
      material.opacity = 1;
      material.depthWrite = true;
    }
    bossVisualActiveRef.current = false;
  };

  useFrame(({ clock, camera }, delta) => {
    const count = Math.min(zombies.length, ZOMBIE_MAX_ACTIVE);
    if (!active) {
      // A lethal crossing may finish combat on the same commit. Only the
      // two inert props can finish their flight; no defeated actor or combat
      // AI is kept alive. Ordinary pause/takeover hides and freezes them.
      if(!maskWearer || !maskWearer.alive){
        portraitMasks.sync(maskWearer,null,Math.min(delta,MAX_MOVEMENT_DELTA),1,
          maskWearer?runtimeByIdRef.current.get(maskWearer.id)?.position.y??0:0,ground);
      }else portraitMasks.root.visible=false;
      if (renderingActiveRef.current) {
        // A takeover pauses the entire horde. Hide the common parent and mark
        // combat poses once, then leave the instance buffers untouched until
        // rendering resumes instead of uploading hidden matrices every frame.
        renderingActiveRef.current = false;
        if (hordeRootRef.current) hordeRootRef.current.visible = false;
        for (let index = 0; index < count; index += 1) {
          const zombie = zombies[index];
          const runtime = runtimeByIdRef.current.get(zombie.id);
          const pose = posesRef.current.get(zombie.id);
          if (!pose) continue;
          if (runtime?.active && pose.active) runtime.pausedByTakeover = true;
          pose.active = false;
        }
        hideBossVisuals();
      }
      return;
    }

    if (!renderingActiveRef.current) {
      renderingActiveRef.current = true;
      if (hordeRootRef.current) hordeRootRef.current.visible = true;
    }

    const now = clock.elapsedTime;
    const impactTime = performance.now() / 1000;
    const movementDelta = Math.min(delta, MAX_MOVEMENT_DELTA);
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
    let standardBuffersDirty = false;
    let shadowBufferDirty = false;

    for (let index = 0; index < count; index += 1) {
      const zombie = zombies[index];
      const runtime = runtimeByIdRef.current.get(zombie.id);
      const pose = posesRef.current.get(zombie.id);
      if (!runtime || !pose || !zombie.alive) {
        if (pose) pose.active = false;
        const previousVisualState = hideZombie(index);
        standardBuffersDirty ||= previousVisualState === ZOMBIE_VISUAL_STANDARD;
        shadowBufferDirty ||= previousVisualState !== ZOMBIE_VISUAL_HIDDEN;
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
        const previousVisualState = hideZombie(index);
        standardBuffersDirty ||= previousVisualState === ZOMBIE_VISUAL_STANDARD;
        shadowBufferDirty ||= previousVisualState !== ZOMBIE_VISUAL_HIDDEN;
        continue;
      }

      runtime.spawnElapsed += movementDelta;
      if (runtime.spawnElapsed < zombie.spawnDelay) {
        pose.active = false;
        const previousVisualState = hideZombie(index);
        standardBuffersDirty ||= previousVisualState === ZOMBIE_VISUAL_STANDARD;
        shadowBufferDirty ||= previousVisualState !== ZOMBIE_VISUAL_HIDDEN;
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
          : zombie.archiveRunner ? 0.88 : ALLIED_SUPPRESSION_SPEED
        : 1;
      const collisionRadius = zombie.collisionRadius;
      // The final boss ignores huts, cover, wreckage, vegetation, and other
      // low scenery while retaining the shared hill and arena-bound checks.
      // Ordinary undead continue to navigate around the full obstacle set.
      const movementObstacles = zombie.archetype === 'boss'
        ? BOSS_MOVEMENT_OBSTACLES
        : currentObstacles;

      let targetX = tankPosition.x;
      let targetZ = tankPosition.z;
      let targetFriendlyId: string | null = null;
      let targetArchiveId: string | null = null;
      let nearestTargetDistanceSq = Infinity;
      let bestSoldierScore = Infinity;
      if (friendliesRef && friendlyPosesRef) {
        for (const friendly of friendliesRef.current) {
          if (!friendly.alive) continue;
          const friendlyPose = friendlyPosesRef.current.get(friendly.id);
          if (!friendlyPose) continue;
          const offsetX = friendlyPose.position.x - runtime.position.x;
          const offsetZ = friendlyPose.position.z - runtime.position.z;
          const distanceSq = offsetX * offsetX + offsetZ * offsetZ;
          // A running soldier can be followed across another soldier's path
          // without flickering between targets on every rendered frame.
          const score = friendly.id === runtime.heldSoldier ? distanceSq * .72 : distanceSq;
          if (score >= bestSoldierScore) continue;
          bestSoldierScore = score;
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
      // A nearby tank can draw off file raiders even while squad members live.
      const playerDistanceSq = tank && tankTargetEnabled
        ? runtime.position.distanceToSquared(tankPosition) : Infinity;
      if(zombie.archetype==='boss' && zombie.playerChallenge!==runtime.seenChallenge){
        runtime.seenChallenge=zombie.playerChallenge;
        // A deliberate hit in the courtyard draws the giant's attention. No
        // remote taunt from the map edge and no permanent target lock.
        if(playerDistanceSq<23**2)runtime.challengingUntil=now+3.2;
      }
      const canIntercept = targetFriendlyId !== null && nearestTargetDistanceSq <= (runtime.heldSoldier === targetFriendlyId ? 3.1**2 : 2.1**2);
      const archive = !canIntercept && selectEmbassyTarget(archives, runtime.position.x, runtime.position.z,
        index, zombie.archiveRunner ? playerDistanceSq : Math.min(nearestTargetDistanceSq, playerDistanceSq),
        zombie.archetype === 'boss');
      if (archive) {
        targetArchiveId = archive.id;
        targetFriendlyId = null;
        targetX = archive.approach[0];
        targetZ = archive.approach[2];
        nearestTargetDistanceSq = (targetX - runtime.position.x) ** 2 + (targetZ - runtime.position.z) ** 2;
      } else if ((zombie.archetype==='boss' && now<runtime.challengingUntil && playerDistanceSq<25**2)
        || (!canIntercept && playerDistanceSq < (zombie.openingPaddyApproach && runtime.spawnElapsed>8 ? 2.85**2 : 49) && playerDistanceSq < nearestTargetDistanceSq)) {
        targetFriendlyId = null;
        targetX = tankPosition.x;
        targetZ = tankPosition.z;
        nearestTargetDistanceSq = playerDistanceSq;
      }
      const opening = zombie.openingPaddyApproach;
      // Only this wave-four monster has a way in through the broken wall.
      // Player interruption always wins. A cavalryman can still draw a real
      // counter-swing in the lane, but a circling horse cannot pin the giant
      // far offscreen indefinitely; it shoulders on after that exchange.
      if(runtime.commandWaypoint>=0 && (now<runtime.challengingUntil || playerDistanceSq<zombie.breachRange**2))runtime.commandWaypoint=-1;
      if(runtime.commandWaypoint>=0 && targetFriendlyId && nearestTargetDistanceSq<2.25**2 &&
        now>=runtime.commandCounterReadyAt && now>=runtime.nextAttackAt){
        runtime.commandCounterUntil=now+.48;
        runtime.commandCounterReadyAt=now+3.8;
      }
      let waypoint:readonly [number,number]|undefined=COMMAND_INGRESS[runtime.commandWaypoint];
      if(waypoint && Math.hypot(waypoint[0]-runtime.position.x,waypoint[1]-runtime.position.z)<.16){
        runtime.commandWaypoint++;
        if(runtime.commandWaypoint===COMMAND_INGRESS.length)runtime.commandWaypoint=-1;
        waypoint=COMMAND_INGRESS[runtime.commandWaypoint];
      }
      const countering=!!waypoint && now<runtime.commandCounterUntil;
      if(countering)waypoint=undefined;
      if(waypoint){
        targetFriendlyId=targetArchiveId=null;
        [targetX,targetZ]=waypoint;
        nearestTargetDistanceSq=(targetX-runtime.position.x)**2+(targetZ-runtime.position.z)**2;
      }
      if (opening && runtime.crossingPaddy) {
        const dx = opening.turn[0] - runtime.position.x, dz = opening.turn[1] - runtime.position.z;
        // A nearby defender can interrupt the run; never restore the waypoint
        // after contact. Reaching a bend is navigation, not a melee attack.
        if (dx*dx + dz*dz <= .15*.15 || playerDistanceSq < 49 || nearestTargetDistanceSq < 36)
          runtime.crossingPaddy = false;
        else {
          targetFriendlyId = targetArchiveId = null;
          [targetX,targetZ] = opening.turn;
          nearestTargetDistanceSq = dx*dx + dz*dz;
        }
      }
      if (runtime.heldSoldier !== targetFriendlyId) runtime.armWindup = 0;
      runtime.heldSoldier = targetFriendlyId;
      pose.pursuingSoldier = targetFriendlyId;
      // A weighted stalking turn on the inside of the breach; attacks and
      // ordinary pursuit retain their old speed and cooldowns.
      const pace = waypoint && runtime.commandWaypoint>=3 ? zombie.speed*.67 : opening ? (runtime.crossingPaddy ? opening.pace : runtime.spawnElapsed>8 ? Math.max(zombie.speed, 3.15) : zombie.speed) : zombie.speed;
      const breachRange = waypoint || runtime.crossingPaddy ? 0 : targetFriendlyId && zombie.archetype !== 'boss'
        ? .92 : zombie.breachRange;
      // An actor already within a few ULPs of striking range is not stuck.
      const contactRange = breachRange + .001;
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
        const tankSwing = !waypoint && zombie.archetype === 'boss' && !targetArchiveId && !targetFriendlyId && tankTargetEnabled;
        // Commit the feet during the raised-claw cue: the swing still finishes,
        // but a retreating tank can leave the impact volume behind.
        const plantedAttack=tankSwing&&runtime.swingLift>0;
        if (distanceToTarget > contactRange && !plantedAttack) {
          const inverseDistance = 1 / Math.max(distanceToTarget, 0.001);
          const step = Math.min(
            pace * movementSpeedScale * movementDelta *
              (targetFriendlyId && runtime.armWindup >= .28 && distanceToTarget < 1.98 ? 1.85 : 1),
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
          const heading=Math.atan2(-facingX,-facingZ);
          // Let shoulders and planted feet carry the monster through the
          // turn in the breach, instead of snapping sideways on one frame.
          runtime.yaw=waypoint ? runtime.yaw+THREE.MathUtils.clamp(
            Math.atan2(Math.sin(heading-runtime.yaw),Math.cos(heading-runtime.yaw)),-3.4*movementDelta,3.4*movementDelta) : heading;
        }

        // A raised sleeve is readable before the silhouettes overlap.
        // Then physically close the remaining stride; never deal ranged melee damage.
        const engagingSoldier = !!targetFriendlyId && !runtime.crossingPaddy && distanceToTarget <= Math.max(contactRange,1.85);
        runtime.armWindup = engagingSoldier && now >= runtime.nextAttackAt
          ? Math.min(.28, runtime.armWindup+movementDelta) : 0;
        runtime.swingLift = tankSwing && now >= runtime.nextAttackAt && (plantedAttack || distanceToTarget <= contactRange)
          ? Math.min(BOSS_SWING_LIFT, runtime.swingLift + movementDelta) : 0;
        if(tankSwing && runtime.swingLift>=BOSS_SWING_LIFT && distanceToTarget>contactRange){
          runtime.lastTankSwing=now;runtime.swingLift=0;runtime.nextAttackAt=now+zombie.attackInterval;
        }
        if (!waypoint && !runtime.crossingPaddy && distanceToTarget <= contactRange
          && (!tankSwing || runtime.swingLift >= BOSS_SWING_LIFT)
          && (targetArchiveId !== null || targetFriendlyId !== null || tankTargetEnabled)
          && now >= runtime.nextAttackAt
          && (targetArchiveId !== null || (targetFriendlyId !== null
            ? runtime.armWindup >= .28 && now >= (soldierReadyAt.current.get(targetFriendlyId) ?? 0)
            : now >= breachWindow.nextGlobalAt && breachWindow.count < ZOMBIE_MAX_BREACHES_PER_SECOND))) {
          // A building has its own windup and pile-up cap. Let independent
          // sieges sound the alarm together; a distant raider must not consume
          // the one-per-second damage window protecting the tank and squad.
          runtime.nextAttackAt = now + zombie.attackInterval;
          if (targetFriendlyId) {
            soldierReadyAt.current.set(targetFriendlyId,now+1.0);
            runtime.lastSoldierSwing=now;
          } else if (!targetArchiveId) {
            breachWindow.nextGlobalAt = now + MIN_GLOBAL_BREACH_GAP;
            breachWindow.count += 1;
          }
          const breachPosition = runtime.position.clone();
          breachPosition.y += 0.72 * zombie.visualScale;
          if (targetArchiveId) {
            onArchiveHit?.(targetArchiveId, EMBASSY_MELEE_DAMAGE);
          } else if (targetFriendlyId) {
            onFriendlyBreach?.({
              zombieId: zombie.id,
              friendlyId: targetFriendlyId,
              position: breachPosition,
              damage: ZOMBIE_FRIENDLY_BREACH_DAMAGE,
            });
          } else {
            if (tankSwing) { runtime.lastTankSwing = now; runtime.swingLift = 0; }
            onTankBreach?.({
              zombieId: zombie.id,
              position: breachPosition,
              damage: ZOMBIE_BREACH_DAMAGE,
            });
          }
        }
      }

      // Hit tests and every instanced body part share this runtime position.
      // Ground the moving actor after all detours/recoveries, not just the
      // displayed mesh or the point where it initially emerged.
      if (ground && zombie.archetype !== 'boss') {
        runtime.position.y = undeadSupportY(ground, runtime.position.x, runtime.position.z);
      }
      runtime.recoveryBlend = Math.min(
        1,
        runtime.recoveryBlend + movementDelta / RECOVERY_EMERGENCE_SECONDS,
      );

      const isBoss = zombie.archetype === 'boss';
      const soldierDraw=runtime.armWindup/.28, soldierRake=Math.max(0,1-(now-runtime.lastSoldierSwing)/.34);
      pose.soldierSwing=soldierRake>0?'strike':soldierDraw>0?'windup':'ready';
      const lift = isBoss ? Math.max(soldierDraw,THREE.MathUtils.smoothstep(runtime.swingLift, 0, BOSS_SWING_LIFT)) : 0;
      const strike = isBoss ? Math.max(soldierRake,1 - (now - runtime.lastTankSwing) / BOSS_SWING_FOLLOW) : 0;
      if (isBoss) walkCommand(bossWalk,zombie.id,runtime.position,runtime.yaw,movementDelta,
        !waypoint&&!runtime.crossingPaddy&&(distanceToTarget<=contactRange+.045||runtime.swingLift>0),tankPosition);
      const gaitSpeed = isBoss ? 8.4 : 5.1 + pace * 2.05;
      const gait = Math.sin(now * gaitSpeed + runtime.gaitPhase);
      const moving = distanceToTarget > contactRange;
      const stride = moving
        ? isBoss ? Math.sin((bossWalk.swing+bossWalk.phase)*Math.PI)*.52 : gait*.47
        : Math.sin(now * 2.2 + runtime.gaitPhase) * (isBoss ? 0.045 : 0.08);
      const bob = moving
        ? Math.abs(gait) * (isBoss ? 0.018 : 0.033)
        : Math.sin(now * 1.8 + runtime.gaitPhase) * 0.009;
      const lurch = isBoss
        ? -.14 + Math.sin(now * 1.05 + runtime.gaitPhase) * 0.025 + lift * .19 - strike * .34
        : -0.064 + Math.sin(now * 1.35 + runtime.gaitPhase) * 0.025;
      const headTwitch = isBoss
        ? Math.sin(now * 7.7 + runtime.gaitPhase) * 0.075
          + Math.sin(now * 1.9 + runtime.gaitPhase) * 0.03
        : Math.sin(now * (5.2 + zombie.variant * 0.7) + runtime.gaitPhase) * 0.055;
      const stagger = runtime.suppressionRemaining > 0
        ? Math.sin((suppressionDuration - runtime.suppressionRemaining) * 31) * 0.11
        : 0;

      // A round throws the upper body along its flight path. Leave the planted
      // legs, movement and melee contact positions under the combat simulation.
      let kick = 0, kickX = 0, kickZ = 0;
      const impact = pose.rifleImpact;
      if (impact) {
        const age = impactTime - impact.at;
        if (age < .46) {
          const snap = (.65 + .35 * THREE.MathUtils.smoothstep(age, 0, .045))
            * (1 - THREE.MathUtils.smoothstep(age, .09, .30));
          const rebound = THREE.MathUtils.smoothstep(age, .18, .30)
            * (1 - THREE.MathUtils.smoothstep(age, .30, .46));
          kick = snap - .18 * rebound;
          const sin = Math.sin(runtime.yaw), cos = Math.cos(runtime.yaw);
          const lateral = cos * impact.direction.x - sin * impact.direction.z;
          const shoulder = Math.abs(lateral) > .2 ? Math.sign(lateral) : zombie.variant === 1 ? -1 : 1;
          kickX = kick * (.55 * lateral + .45 * shoulder);
          kickZ = kick * (sin * impact.direction.x + cos * impact.direction.z);
        }
      }

      const recoveryBlend = runtime.recoveryBlend * runtime.recoveryBlend
        * (3 - 2 * runtime.recoveryBlend);

      rootObject.position.set(
        runtime.position.x,
        runtime.position.y - (1 - emergenceBlend) * 0.48 + (isBoss ? 0 : bob),
        runtime.position.z,
      );
      rootObject.rotation.set(isBoss ? 0 : lurch + stagger * 0.35, runtime.yaw, isBoss ? 0 : gait * 0.028 + stagger,'YXZ');
      const silhouetteScale = (0.96 + zombie.variant * 0.045) * zombie.visualScale;
      const bossWidthScale = isBoss ? 0.86 : 1;
      const bossDepthScale = isBoss ? 0.89 : 1;
      rootObject.scale.set(
        emergenceBlend * recoveryBlend * silhouetteScale * bossWidthScale,
        emergenceBlend * recoveryBlend
          * (1.03 + zombie.variant * 0.025)
          * zombie.visualScale,
        emergenceBlend * recoveryBlend * silhouetteScale * bossDepthScale,
      );
      rootObject.updateMatrix();

      if (isBoss && bossDetailsRef.current) {
        if (!bossVisualActive) {
          if (bossFireballRef.current) bossFireballRef.current.visible = false;
          if (bossFireAreaRef.current) bossFireAreaRef.current.visible = false;
        }
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
        const carriage=commandCarriage(bossWalk,rootObject,tankPosition,movementDelta);
        bossDetailsRef.current.matrix.copy(carriage);
        bossDetailsRef.current.matrixWorldNeedsUpdate = true;
        bossDetailsRef.current.visible = true;
        loadCommandStance(bossWalk,carriage,movementDelta);
        const chest=bossChestRef.current;
        const breath=Math.sin(now*2.34+runtime.gaitPhase), swing=2*stride;
        const waist=bossWaistRef.current;
        if(waist){
          waist.position.set(bossWalk.sway+bossWalk.loadX+bossWalk.carryHipX,commandPelvisY(bossWalk)-lift*.012,bossWalk.loadZ+bossWalk.carryHipZ);
          waist.rotation.set(.072+.014*breath,-swing*.169-.17*bossWalk.load,-.073-bossWalk.sway*.81+bossWalk.carryHipRoll);
        }
        if(chest){
          chest.position.set(-.061+bossWalk.sway*1.35+bossWalk.loadX,.581+commandPelvisY(bossWalk)-lift*.037-strike*.058,-.043+bossWalk.loadZ);
          // Lead with the striking shoulder, opening the chest past the hips
          // instead of turning both skulls edge-on when a defender crosses.
          // This is target/body relative; the camera is never consulted.
          chest.rotation.set(lurch-.233+stagger*.28+.13*kickZ+.024*breath,.116+swing*.31+lift*.19-strike*.14-.047*bossWalk.load,
            .147-bossWalk.sway*1.42-strike*.07+.084*bossWalk.load-.11*kickX);
        }
        for(let h=0;h<2;h++){
          const head=skullBones.current[h],jaw=jawBones.current[h];
          if(!head||!jaw)continue;
          const s=h?1:-1,scan=Math.sin(now*(h?1.23:1.49)+runtime.gaitPhase+h*1.7);
          const seat=COMMAND_HEAD_SEATS[h];
          head.position.set(seat[0],seat[1]+s*swing*.015+breath*.006,seat[2]);
          head.rotation.set(-lurch*.54+(h?.528:.255)+.034*breath+lift*.12-strike*.18,
            (h?-.30:.13)+bossWalk.lookYaw*(h?.58:.83)+(h?.14:.12)*scan-swing*.17+s*lift*.10,
            s*((h?.12:.29)+.055*swing)+headTwitch*.38);
          jaw.rotation.x=-(h?.37:.070)-.075*(1+Math.sin(now*(h?3.5:2.7)+h))
            -.060*Math.max(0,-s*swing)-lift*(h?.29:.42)-strike*.21;
          jaw.rotation.z=h?.025:-.069+.025*scan;
        }
        if (bossWoundRef.current) {
          const pulse = 1 + Math.sin(now * 5.4 + runtime.gaitPhase) * 0.09;
          bossWoundRef.current.scale.set(0.40 * pulse, .98 * pulse, 0.22);
          BOSS_WOUND_MATERIAL.emissiveIntensity = 0.20 + pulse * 0.12;
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

              const flames = bossGroundFlamesRef.current;
              if (flames) {
                if (flames.instanceMatrix.usage!==THREE.DynamicDrawUsage) flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                // A rooted patch ignites outward. Keep instance indices stable so
                // each pocket keeps its own animation cel as its neighbors ignite.
                let count = 0;
                for (const patch of bossFireParticles) {
                  const spread = THREE.MathUtils.smoothstep(burnAge-patch.delay,0,.19)*burnDown;
                  if (spread < .012) break;
                  fireParticleObject.position.set(patch.x,0,patch.z);
                  fireParticleObject.rotation.set(0,patch.phase*Math.PI*2,0);
                  const width=patch.size*6.2*spread;
                  fireParticleObject.scale.set(width,patch.rise*1.12*spread,width*.84);
                  fireParticleObject.updateMatrix();
                  flames.setMatrixAt(count++,fireParticleObject.matrix);
                }
                flames.count=count;
                flames.instanceMatrix.needsUpdate=true;
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
            const plume=bossCometFlameRef.current;
            if (plume) {
              flameDirection.copy(FLAME_UP);
              if (fireball.phase==='flight') {
                // Oppose the tangent of the actual throw, including the descent.
                flameDirection.subVectors(fireball.launchPosition,fireball.targetPosition);
                flameDirection.y-=Math.PI*BOSS_FIREBALL_ARC_HEIGHT*Math.cos(Math.PI*phaseProgress);
                flameDirection.normalize().addScaledVector(FLAME_UP,.22).normalize();
              }
              flameDirection.applyQuaternion(inverseCometRotation.copy(fireballObject.quaternion).invert());
              plume.quaternion.setFromUnitVectors(FLAME_UP,flameDirection);
              plume.scale.set(.98,fireball.phase==='flight'?2.05:1.19,.91);
            }
            bossFireballRef.current.matrix.copy(fireballObject.matrix);
            bossFireballRef.current.matrixWorldNeedsUpdate = true;
            bossFireballRef.current.visible = true;
          }
        }
      }

      if (isBoss) {
        if (visualStateByIndexRef.current[index] === ZOMBIE_VISUAL_STANDARD) {
          hideStandardZombieParts(index);
          standardBuffersDirty = true;
        }
        visualStateByIndexRef.current[index] = ZOMBIE_VISUAL_BOSS;
        const sway=stride*2,breath=Math.sin(now*2.34+runtime.gaitPhase);
        for(let i=0;i<4;i++){
          const upper=upperBones.current[i],elbow=elbowBones.current[i],wrist=wristBones.current[i];
          if(!upper||!elbow||!wrist)continue;
          const s=i%2?1:-1,rear=i>1,step=s*sway;
          // Different reaches: a leading cleaver and a hooked guard. The rear
          // pair trail the sternum, catching up through their elbows and wrists.
          const seat=COMMAND_ARM_SEATS[i%2];
          upper.position.set(rear?s*.222:seat[0],(rear?.910:seat[1])+step*.021,rear?.191:seat[2]);
          upper.rotation.set(rear?-.49+step*.51+lift*.36-strike*.31:
            (s>0?.33:-.10)-step*(s>0?.43:.27)+lift*(s>0?1.65:.37)-strike*(s>0?.86:.26)
              +(s>0?.12*THREE.MathUtils.smoothstep(lift,0,.22):0),
            rear?-s*.57:s*.18+s*(lift*.43-strike*.47),
            s*((rear?.17:s>0?.72:.40)+(rear?.09:.14)*step+lift*(rear?.25:.18)-strike*.15));
          elbow.rotation.set((rear?.76:s>0?1.05:.33)+step*(rear?.32:.21)+lift*(s>0?.36:.20)-strike*(rear?.52:.62),
            s*(.17+step*.13+strike*.21),s*(rear?-.25:s>0?-1.75:-.21)-s*lift*.17);
          wrist.rotation.set(-.23-step*.28-lift*.57+strike*.58+breath*.047,
            s*(.13+.14*step),s*(.16+.10*step+lift*.19));
          if(i===1){
            // Bring the striking elbow OUT of the rib/coat silhouette before
            // the rake. Arm load leads the opening hand; the fingers hold
            // tension into the sweep, then close as the shoulder recovers.
            // Only bone matrices and this hand's morph change, never contact.
            const draw=THREE.MathUtils.smoothstep(lift,0,.85);
            const release=THREE.MathUtils.smoothstep(strike,0,1);
            const turn=THREE.MathUtils.smoothstep(lift,.81,1);
            upper.rotation.x+=.32*release-1.38*turn;
            upper.rotation.z+=.59*draw+.34*turn+.46*release;
            upper.rotation.y-=.41*draw+.21*release;
            elbow.rotation.z+=1.29*draw+.26*turn+.96*release;
            elbow.rotation.y+=.17*draw-.28*release;
            wrist.rotation.y+=.52*draw+.19*release;
            wrist.rotation.z-=.31*draw+.18*release;
            if(!wrist.morphTargetInfluences)wrist.updateMorphTargets();
            if(wrist.morphTargetInfluences)wrist.morphTargetInfluences[0]=
              Math.max(THREE.MathUtils.smoothstep(lift,.12,.91),.87*release);
          }
        }
        for(let side=0; side<2; side++){
          const thigh=bossThighs.current[side],shin=bossShins.current[side],boot=bossBoots.current[side];
          if(thigh&&shin&&boot&&emergenceBlend*recoveryBlend>.001)poseCommandLeg(bossWalk,side,bossWalk.carried.matrix,thigh,shin,boot);
        }
        poseCommandFascia(bossFascia.rig,skullBones.current,upperBones.current,elbowBones.current);
        const burn=burns?.get(zombie.id);
        const chest=bossChestRef.current;
        if(burn&&chest){
          chest.updateWorldMatrix(true,false);
          seatCharacterFlame(burn,chest.matrixWorld,.26,.18,.05);
        }
        poseCommandLegMantle(bossLegMantle.rig,bossWaistRef.current,bossThighs.current,bossShins.current,bossBoots.current);
      } else {
        visualStateByIndexRef.current[index] = ZOMBIE_VISUAL_STANDARD;
        standardBuffersDirty = true;
        writeUndeadUpperPose(upperPose, zombie.variant, !!zombie.archiveRunner, gait, stride);
        // Anticipation turns the chest away; the following diagonal rake
        // reaches across the defender rather than idle-walking into them.
        upperPose.lx+=.51*soldierDraw+.82*soldierRake;
        upperPose.ly+=.61*soldierDraw-.73*soldierRake;
        upperPose.lz-=.46*soldierDraw;
        upperPose.rx+=.33*soldierRake;
        upperPose.pitch+=.19*soldierDraw-.27*soldierRake;
        const swim = Math.cos(now * gaitSpeed + runtime.gaitPhase);
        upperPose.pitch += .64 * kickZ;
        upperPose.roll -= .64 * kickX;
        upperPose.neckTilt -= .31 * kickZ;
        upperPose.neckRoll += .36 * kickX;
        upperPose.lx -= .66 * kick;
        upperPose.rx -= .48 * kick;
        upperPose.lz -= .38 * kick;
        upperPose.rz += .46 * kick;
        setPartMatrix(torsoRef.current, index, .13 * kickX, .78 - .07 * kick, .12 * kickZ,
          upperPose.pitch, .24 * kickX, upperPose.roll);
        const burn=burns?.get(zombie.id);
        if(burn)seatCharacterFlame(burn,partMatrix,.21,.26,.03);
        const { neck, leftShoulder, rightShoulder } = bodySockets;
        // Reuse the last local part matrix to carry upper-body pivots with
        // the shirt, keeping sleeves and collar connected during torso sway.
        neck.set(-0.018, 0.484, -0.052).applyMatrix4(partObject.matrix);
        leftShoulder.set(-0.204, 0.208, 0.002).applyMatrix4(partObject.matrix);
        rightShoulder.set(0.209, 0.228, 0.017).applyMatrix4(partObject.matrix);
        setPartMatrix(headRef.current, index, neck.x, neck.y, neck.z, upperPose.neckTilt, headTwitch, upperPose.neckRoll);
        setPartMatrix(helmetRef.current, index, neck.x, neck.y, neck.z, upperPose.neckTilt, headTwitch, upperPose.neckRoll);
        if (headRef.current && eyeRef.current) {
          headRef.current.getMatrixAt(index, headPartMatrix);
          const authored = headRef.current.userData.authoredUndead === true;
          // The shader keeps the tiny radiance attached to the moving socket;
          // no light is contributed to the face, foliage, fog or the player.
          for (let side = 0; side < 2; side++) {
            const sign = side === 0 ? -1 : 1;
            partObject.position.set(sign*(authored?ZOMBIE_EYE_LOCAL[0]:.071),
              authored?ZOMBIE_EYE_LOCAL[1]:.038,authored?ZOMBIE_EYE_LOCAL[2]:-.147);
            partObject.rotation.set(0,-sign*.12,sign*.055);partObject.scale.setScalar(1);
            partObject.updateMatrix();
            partMatrix.multiplyMatrices(headPartMatrix, partObject.matrix);
            eyeRef.current.setMatrixAt(index * 2 + side, partMatrix);
          }
        }
        // Match the upper sleeve origins to the sloping shirt shoulder. One
        // reach stays high while the trailing hand swings lower with the gait.
        setPartMatrix(armRef.current, index * 2, leftShoulder.x, leftShoulder.y, leftShoulder.z,
          upperPose.lx, upperPose.ly, upperPose.lz);
        setPartMatrix(armRef.current, index * 2 + 1, rightShoulder.x, rightShoulder.y, rightShoulder.z,
          upperPose.rx, upperPose.ry, upperPose.rz);
        const step = moving ? stride : stride * 0.65;
        const lift = moving ? Math.max(0, swim) * 0.048 : 0;
        const drag = moving ? Math.max(0, -swim) * 0.025 : 0;
        setPartMatrix(legRef.current, index * 2, -0.108, 0.286 + lift, -step * 0.29, step, -0.07, -0.035);
        setPartMatrix(legRef.current, index * 2 + 1, 0.117, 0.285 + drag, step * 0.24, -step * 0.82, 0.14, 0.04);
      }
      shadowBufferDirty = true;
      setPartMatrix(shadowRef.current, index, 0, 0.015, 0, -Math.PI / 2, 0, 0);
    }

    portraitMasks.sync(maskWearer,bossVisualActive?skullBones.current:null,movementDelta,
      BOSS_FACE.opacity,maskWearer?runtimeByIdRef.current.get(maskWearer.id)?.position.y??0:0,ground);
    if (!bossVisualActive) {
      if (bossVisualActiveRef.current || bossFireballRuntimeRef.current.active) {
        hideBossVisuals();
      }
    } else {
      bossVisualActiveRef.current = true;
    }

    if (standardBuffersDirty) {
      if (torsoRef.current) torsoRef.current.instanceMatrix.needsUpdate = true;
      if (armRef.current) armRef.current.instanceMatrix.needsUpdate = true;
      if (legRef.current) legRef.current.instanceMatrix.needsUpdate = true;
      if (headRef.current) headRef.current.instanceMatrix.needsUpdate = true;
      if (helmetRef.current) helmetRef.current.instanceMatrix.needsUpdate = true;
      if (eyeRef.current) eyeRef.current.instanceMatrix.needsUpdate = true;
    }
    if (shadowBufferDirty) {
      if (shadowRef.current) shadowRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <primitive object={portraitMasks.root} />
      <group ref={hordeRootRef} visible={active} dispose={null}>
      <AuthoredZombieHead headRef={headRef} />
      <instancedMesh
        ref={torsoRef}
        args={[TORSO_GEOMETRY, TORSO_MATERIAL, ZOMBIE_MAX_ACTIVE]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={armRef}
        args={[ARM_GEOMETRY, TORSO_MATERIAL, ZOMBIE_MAX_ACTIVE * 2]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={legRef}
        args={[LEG_GEOMETRY, LIMB_MATERIAL, ZOMBIE_MAX_ACTIVE * 2]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={headRef}
        name="nightmare-undead-heads"
        args={[STANDARD_HEAD_GEOMETRY, HEAD_MATERIAL, ZOMBIE_MAX_ACTIVE]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={helmetRef}
        args={[HELMET_GEOMETRY, HELMET_MATERIAL, ZOMBIE_MAX_ACTIVE]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={eyeRef}
        name="nightmare-undead-red-eyes"
        args={[EYE_GEOMETRY, EYE_MATERIAL, ZOMBIE_MAX_ACTIVE * 2]}
        frustumCulled={false}
        renderOrder={3}
      />
      <group
        ref={bossDetailsRef}
        name="nightmare-boss-sculpt"
        matrixAutoUpdate={false}
        visible={false}
      >
        {[0,1].map(i=><group key={i} name={i===0?'command-leg-left':'command-leg-right'}>
          <group name="thigh" ref={m=>{bossThighs.current[i]=m;}} />
          <group name="shin" ref={m=>{bossShins.current[i]=m;}} />
          <group name="boot" ref={m=>{bossBoots.current[i]=m;}}><mesh name={'command-sole-'+i} geometry={BOSS_FEET[i]} material={BOSS_LIMB_MATERIAL} castShadow /></group>
        </group>)}
        <primitive object={bossLegMantle.mesh} />
        <mesh ref={bossWaistRef} name="command-pelvis" geometry={BOSS_WAIST} material={BOSS_LIMB_MATERIAL} castShadow />
        <group ref={bossChestRef} name="command-weight-bearing-chest"><group position={[0,-.62,0]}>
        <mesh name="command-ripped-coat" geometry={BOSS_TORSO_GEOMETRY} material={BOSS_TORSO_MATERIAL} castShadow />
        {[0,1].map(h=><mesh key={h} ref={m=>{skullBones.current[h]=m;}}
          name={h?'command-watchers-skull':'command-double-faced-skull'} geometry={BOSS_HEADS[h]}
          material={BOSS_FACE} scale={h?[.495,.55,.52]:[.505,.575,.54]} castShadow>
          <mesh name={h?'command-watcher-crown':'command-lead-crown'} geometry={BOSS_CROWNS[h]} material={BOSS_LIMB_MATERIAL} castShadow />
          <mesh ref={m=>{jawBones.current[h]=m;}} name={h?'command-rear-jaw':'command-front-jaw'}
            position={COMMAND_JAW_HINGE} geometry={BOSS_JAWS[h]} material={BOSS_FACE} castShadow>
            <mesh geometry={BOSS_ENAMEL[h]} material={BOSS_LIMB_MATERIAL} castShadow />
          </mesh>
        </mesh>)}
        {BOSS_ARMS.map((arm,i)=><mesh key={i} ref={m=>{upperBones.current[i]=m;}}
          geometry={arm.upper} material={BOSS_LIMB_MATERIAL} name={i===1?'command-striking-arm':'command-upper-'+i}
          scale={i>1?.61:i===1?1.12:1.16} castShadow>
          <mesh ref={m=>{elbowBones.current[i]=m;}} name={'command-elbow-'+i} position={[0,-.312,0]} geometry={arm.fore} material={BOSS_LIMB_MATERIAL} castShadow>
            <mesh ref={m=>{wristBones.current[i]=m;}} name={'command-wrist-'+i}
              position={[0,-.357,-.04]} geometry={arm.hand} material={i===1?BOSS_RAKE_MATERIAL:BOSS_LIMB_MATERIAL} castShadow />
          </mesh>
        </mesh>)}
        <primitive object={bossFascia.mesh} />
        <mesh
          ref={bossWoundRef}
          geometry={BOSS_WOUND_GEOMETRY}
          material={BOSS_WOUND_MATERIAL}
          position={[0, 0.89, -0.292]}
          frustumCulled={false}
        />
        </group></group>
      </group>
      {zombies[0]?.archetype==='boss'&&<CommandFootWater walk={bossWalk} boss={bossDetailsRef}/>}
      <group
        name="boss-fireball"
        ref={bossFireballRef}
        matrixAutoUpdate={false}
        visible={false}
        frustumCulled={false}
      >
        <mesh
          geometry={BOSS_FIREBALL_CONE_GEOMETRY}
          material={SUNDAE_INK}
          position={[0, -0.12, 0]}
          rotation={[0, 0, Math.PI]}
        />
        <mesh
          geometry={BOSS_FIREBALL_SCOOP_GEOMETRY}
          material={SUNDAE_INK}
          position={[0, 0.22, 0]}
          renderOrder={5}
        >
          {hasMaskWearer && <Suspense fallback={null}><PixelFireVolume meshRef={bossCometFlameRef} name="boss-comet-flame"
            position={[0,.09,0]} renderOrder={7}/></Suspense>}
        </mesh>
        <mesh
          geometry={BOSS_FIREBALL_GLOW_GEOMETRY}
          material={SUNDAE_INK}
          position={[0, 0.22, 0]}
          renderOrder={6}
        />
      </group>
      <group
        name="boss-fire-impact"
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
        {hasMaskWearer && <Suspense fallback={null}><PixelFireVolume meshRef={bossGroundFlamesRef} name="boss-ground-flames"
          capacity={BOSS_FIRE_PARTICLE_COUNT} count={0} renderOrder={6}/></Suspense>}
      </group>
      <instancedMesh
        ref={shadowRef}
        args={[SHADOW_GEOMETRY, SHADOW_MATERIAL, ZOMBIE_MAX_ACTIVE]}
        frustumCulled={false}
        renderOrder={1}
      />
      </group>
    </>
  );
}
