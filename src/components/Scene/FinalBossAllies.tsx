import { RoundTracers, useRoundTracers } from './RoundTracers';
import {useEjectBrass} from './SpentBrass';
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FinalBossAllyPresentation, syncFinalBossAllyPresentation, type AllyPresentationUpdate } from './FinalBossAllyPresentation';
import { AllySummoning, summoningSpill, type AllyArrival } from './AllySummoning';
import { PILLAR_TOUCHDOWN, REVEAL_END } from './summoningLight';
import { isInsideArena } from '../../lib/arenaBounds';
import {
  findNearestObstacleHit,
  terrainBlocksCombatSegment,
  firstTerrainCombatHit,
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
const TARGET_ACQUISITION_INTERVAL = 1 / 12;
const STEERING_DIRECTIONS = [
  0, 0.42, -0.42, 0.85, -0.85, 1.28, -1.28,
  1.7, -1.7, 2.25, -2.25, Math.PI,
].map(angle => ({ cosine: Math.cos(angle), sine: Math.sin(angle) }));
const ALLY_DEFINITION_BY_ID = new Map(
  FINAL_BOSS_ALLY_DEFINITIONS.map(definition => [definition.id, definition]),
);

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

interface AllyRuntime extends AllyArrival {
  position: THREE.Vector3;
  yaw: number;
  orbitDirection: -1 | 1;
  nextShotAt: number;
  nextTargetAt: number;
  targetId: string | null;
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
  prepareSummoning?: boolean;
  onCoverHit?: (position: THREE.Vector3) => void;
  onZombieHit?: (event: FriendlyZombieHitEvent) => void;
  onFire?: (event: FinalBossAllyFireEvent) => void;
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
  for (const { cosine, sine } of STEERING_DIRECTIONS) {
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
  prepareSummoning = false,
  onCoverHit,
  onZombieHit,
  onFire,
}: FinalBossAlliesProps) {
  const groupRefs = useRef<Array<THREE.Group | null>>([]);
  const ejectBrass = useEjectBrass();
  const flashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const aimPitchRef = useRef<number[]>([]);
  const firePulseRef = useRef<number[]>([]);
  const presentationRefs = useRef<Array<AllyPresentationUpdate | null>>([]);
  const runtimeByIdRef = useRef(new Map<string, AllyRuntime>());
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;
  const tracers = useRoundTracers();
  const projectileCursorRef = useRef(0);
  const idleCleanedRef = useRef(false);
  const zombieById = useMemo(
    () => new Map(zombies.map(zombie => [zombie.id, zombie])),
    [zombies],
  );
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
  const coverContact=useMemo(()=>new THREE.Vector3(),[]);
  const aimPosition = useMemo(() => new THREE.Vector3(), []);
  const muzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const shotDirection = useMemo(() => new THREE.Vector3(), []);
  const formationKey = useMemo(
    () => allies.map(ally => `${ally.id}:${ally.role}`).join('|'),
    [allies],
  );
  const allyIdsKey = useMemo(() => allies.map(ally => ally.id).join('|'), [allies]);

  useLayoutEffect(() => {
    idleCleanedRef.current = false;
    const retainedIds = new Set(allies.map(ally => ally.id));
    for (const [id] of runtimeByIdRef.current) {
      if (retainedIds.has(id)) continue;
      runtimeByIdRef.current.delete(id);
      posesRef.current.delete(id);
    }
    allies.forEach((ally, index) => {
      let runtime = runtimeByIdRef.current.get(ally.id);
      if (!runtime) {
        const definition = ALLY_DEFINITION_BY_ID.get(ally.id);
        runtime = {
          position: new THREE.Vector3(...ally.position),
          yaw: index * Math.PI * 0.55,
          orbitDirection: index % 2 === 0 ? 1 : -1,
          nextShotAt: 0.55 + index * 0.28,
          nextTargetAt: 0,
          targetId: null,
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
          arrivalAge: null,
          arrivalPosition: new THREE.Vector3(),
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
    tracers.submit(0);
  }, [formationKey, posesRef, tracers]);

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
      if (!idleCleanedRef.current) {
        for (const projectile of projectilePool) projectile.active = false;
        for (let index = 0; index < allies.length; index += 1) {
          const ally = allies[index];
          const runtime = runtimes.get(ally.id);
          if (runtime) {
            runtime.wasAlive = false;
            runtime.arrivalAge = null;
            runtime.targetId = null;
            runtime.nextTargetAt = 0;
          }
          const model = groupRefs.current[index];
          if (model) model.visible = false;
          const flash = flashRefs.current[index];
          if (flash) flash.visible = false;
          aimPitchRef.current[index] = 0;
          firePulseRef.current[index] = -Infinity;
          presentationRefs.current[index]?.(now, 0);
          posesRef.current.delete(ally.id);
        }
        tracers.submit(0);
        idleCleanedRef.current = true;
      }
      return;
    }
    idleCleanedRef.current = false;

    for (let allyIndex = 0; allyIndex < allies.length; allyIndex += 1) {
      const ally = allies[allyIndex];
      const runtime = runtimes.get(ally.id);
      const model = groupRefs.current[allyIndex];
      const flash = flashRefs.current[allyIndex];
      if (!runtime || !model) continue;
      let presentationUpdated = false;
      if (runtime.arrivalAge !== null && runtime.arrivalAge < 4) runtime.arrivalAge += movementDelta;
      model.userData.summoningLight = runtime.arrivalAge !== null && runtime.arrivalAge < 2.75
        ? summoningSpill(runtime.arrivalAge) * Math.max(0, 1 - runtime.position.distanceToSquared(runtime.arrivalPosition) / 9)
        : 0;
      if (flash) flash.visible = false;

      if (ally.status === 'defeated') {
        model.visible = false;
        posesRef.current.delete(ally.id);
        runtime.wasAlive = false;
        presentationRefs.current[allyIndex]?.(now, movementDelta);
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
        presentationRefs.current[allyIndex]?.(now, movementDelta);
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
        runtime.nextTargetAt = 0;
        runtime.targetId = null;
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

      if (runtime.arrivalAge === null) {
        runtime.arrivalAge = 0;
        runtime.arrivalPosition.copy(runtime.position);
      }
      const reveal = THREE.MathUtils.smoothstep(runtime.arrivalAge, PILLAR_TOUCHDOWN, REVEAL_END);
      model.userData.arrivalReveal = reveal;
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

      let target = runtime.targetId ? zombieById.get(runtime.targetId) ?? null : null;
      let targetPose = target ? zombiePosesRef.current.get(target.id) ?? null : null;
      let chargeLocked = false;
      if (ally.role === 'mounted-cavalry'
        && runtime.combatPhase === 'attack'
        && runtime.chargeState === 'charge'
        && runtime.chargeTargetId) {
        const lockedTarget = zombieById.get(runtime.chargeTargetId);
        const lockedPose = lockedTarget
          ? zombiePosesRef.current.get(lockedTarget.id)
          : null;
        if (lockedTarget?.alive && lockedPose?.active) {
          target = lockedTarget;
          targetPose = lockedPose;
          chargeLocked = true;
        } else {
          runtime.chargeState = 'setup';
          runtime.chargeTargetId = null;
        }
      }

      // Aim and movement follow live poses every frame. Only the choice of
      // target is sampled; death/deactivation immediately invalidates the cache.
      const targetInvalid = runtime.targetId !== null && (!target?.alive || !targetPose?.active);
      if (!chargeLocked && (now >= runtime.nextTargetAt || targetInvalid)) {
        target = null;
        targetPose = null;
        let targetScore = Number.POSITIVE_INFINITY;
        let livingTargetIndex = 0;
        const laneCount = Math.max(1, allies.length);
        for (const candidate of zombies) {
          if (!candidate.alive) continue;
          const pose = zombiePosesRef.current.get(candidate.id);
          if (!pose?.active) continue;
          const dx = pose.position.x - runtime.position.x;
          const dz = pose.position.z - runtime.position.z;
          const assignedLane = livingTargetIndex % laneCount;
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
        runtime.targetId = target?.id ?? null;
        runtime.nextTargetAt = now + TARGET_ACQUISITION_INTERVAL;
      }

      // Keep the charging horse at the landing sigil until the rider has formed.
      const canEngage = ally.role !== 'mounted-cavalry' || reveal === 1;
      if (target && targetPose && canEngage) {
        const targetPosition = targetPose.position;
        const dx = targetPosition.x - runtime.position.x;
        const dz = targetPosition.z - runtime.position.z;
        const distance = Math.hypot(dx, dz);
        const definition = ALLY_DEFINITION_BY_ID.get(ally.id) ?? FINAL_BOSS_ALLY_DEFINITIONS[0];

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
            aimPitchRef.current[allyIndex] = THREE.MathUtils.clamp(Math.atan2(
              aimPosition.y - muzzlePosition.y, horizontalLength,
            ), -0.24, 0.35);
            // The rendered low-ready weapon owns the origin; its neutral socket
            // retains the established .72 forward and .94/.90 height offsets.
            if (flash) {
              syncFinalBossAllyPresentation(model, runtime.position, runtime.yaw,
                presentationRefs.current[allyIndex], now, movementDelta);
              presentationUpdated = true;
              flash.getWorldPosition(muzzlePosition);
            }
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
              if (reveal > .6 && spawnProjectile(ally, muzzlePosition, shotDirection, damage)) {
                firePulseRef.current[allyIndex] = now;
                if (flash) { flash.visible = true; ejectBrass(flash, 'soldier'); }
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
      } else if (!target || !targetPose) {
        runtime.yaw += movementDelta * 0.16 * runtime.orbitDirection;
      }

      if (!presentationUpdated) syncFinalBossAllyPresentation(model, runtime.position, runtime.yaw,
        presentationRefs.current[allyIndex], now, movementDelta);
      model.visible = reveal > 0;
      const pose = posesRef.current.get(ally.id);
      if (pose) pose.position.copy(runtime.position);
      else posesRef.current.set(ally.id, { position: runtime.position });
    }

    let tracerCount = 0;
    for (const projectile of projectilePool) {
      if (!projectile.active) continue;
      projectile.previousPosition.copy(projectile.position);
      projectile.position.addScaledVector(projectile.direction, PROJECTILE_SPEED * movementDelta);
      projectile.lifetime += movementDelta;
      const expired=projectile.lifetime >= PROJECTILE_LIFETIME;
      const moundT=expired?null:firstTerrainCombatHit(projectile.previousPosition,projectile.position);
      if (expired || moundT!==null) {
        if(moundT!==null)onCoverHit?.(coverContact.lerpVectors(projectile.previousPosition,projectile.position,moundT));
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
            bulletDirection: projectile.direction,
            position: hit.point.clone(),
            damage,
          });
        }
        projectile.active = false;
        continue;
      }
      if (obstacleT !== null) {
        onCoverHit?.(coverContact.lerpVectors(projectile.previousPosition,projectile.position,obstacleT));
        projectile.active = false;
        continue;
      }
      tracers.write(tracerCount++, projectile.position, projectile.direction, projectile.lifetime * PROJECTILE_SPEED);
    }

    tracers.submit(tracerCount);
  });

  return (
    <group dispose={null} visible={enabled}>
      {allies.map((ally, index) => (
        <group
          key={ally.id}
          name={ally.id}
          ref={node => { groupRefs.current[index] = node; }}
          position={ally.position}
          visible={ally.status !== 'defeated'}
        >
          <FinalBossAllyPresentation key={ally.role} role={ally.role} index={index} aimPitchRef={aimPitchRef}
            firePulseRef={firePulseRef} presentationRefs={presentationRefs}
            setFlashRef={node => { flashRefs.current[index] = node; }} />
        </group>
      ))}
      <RoundTracers batch={tracers} capacity={PROJECTILE_CAPACITY} />
      {(enabled || prepareSummoning) && <Suspense fallback={null}>
        {allies.map(ally => <AllySummoning key={ally.id} id={ally.id} arrivals={runtimeByIdRef} />)}
      </Suspense>}
    </group>
  );
}
