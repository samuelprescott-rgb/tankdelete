import { useRef, useMemo, forwardRef, memo, useEffect, useLayoutEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createWeaponSurfaceProbe, type WeaponContact } from './weaponSurfaces';
import { shellSag } from '../../lib/arcadeShell';
import { PROJECTILE_SPEED } from '../../lib/constants';
import { FLAMETHROWER_RANGE } from '../../lib/weapons';
import {useEjectBrass} from './SpentBrass';
import { GhostMuzzleArt } from './GhostMuzzleArt';
import { TANK_SPEED, TANK_ROTATION_SPEED } from '../../lib/constants';
import { createDriveKeys, DRIVE_ENVELOPE, PIVOT_ENVELOPE, stepDriveAxis, stepTurretYaw, TURRET_SWEEP_EVENT } from '../../lib/tankDrive';
import {
  CANNON_RELOAD_SECONDS,
  FLAMETHROWER_CAPACITY_SECONDS,
  FLAMETHROWER_HIT_INTERVAL,
  FLAMETHROWER_RECHARGE_SECONDS,
  MACHINE_GUN_BURST_SECONDS,
  MACHINE_GUN_FIRE_INTERVAL,
  MACHINE_GUN_OVERHEAT_RECOVERY_SECONDS,
  type CannonReloadState,
  type MachineGunHeatState,
  WeaponMode,
} from '../../lib/weapons';
import { useTankPresentation, TankRunningGear } from './TankPresentation';
import { TankImpactFeedback } from './TankImpactFeedback';
import type { TankImpactFeed } from '../../lib/tankImpactFeedback';
import { CANNON_BARREL_MOUNT_Z, cannonRecoilPosition } from './tankGeometry';
import { CANNON_MUZZLE_SOCKET, MACHINE_GUN_MUZZLE_SOCKET, sampleTankMuzzle } from '../../lib/tankWeapons';
import { TANK_BODY_LENGTH_SCALE, tankFootprintBlocked } from '../../lib/tankFootprint';
import { createTankGroundProfile } from '../../lib/tankGroundProfile';
import { createTankSuspension, stepTankSuspension } from '../../lib/tankSuspension';
import { useSceneReviewDrive } from './SceneReviewControls';
import { FlameStream } from './FlameStream';
import { intersectsTerrainMound } from '../../lib/terrain';
import type { TankCollider } from '../../lib/worldCollision';
import {
  ARENA_TANK_PADDING,
  clampArenaX,
  clampArenaZ,
  isInsideArena,
} from '../../lib/arenaBounds';
import { createRiverStations, riverWaterImmersion } from './riverLayout';
import { TankCrewPortrait } from './TankCrewPortrait';
import { createCrewStationShroud, createCrewStationPost, createCrewHatch, createCrewRoofPanel, createCrewGrip, crewStationFinish } from './tankCrewStation';
import { INFANTRY_WORLD_SCALE } from '../../lib/infantryMetrics';

const CREW_STATION_ART = {
  cover: createCrewStationShroud(), post: createCrewStationPost(), hatch: createCrewHatch(), roof: createCrewRoofPanel(), grip: createCrewGrip(),
};
import { rearStrongholdBlocksDrive,type RearGuardPose } from '../../lib/rearStronghold';
import { faceDesignation, readDesignationPress } from '../../lib/designationPointer';

const TANK_WEAPON_COLOR = '#e3b341';
const DEFAULT_TANK_POSITION: [number, number, number] = [0, 0, 0];
const MAX_MOVEMENT_SUBSTEP = 0.28;
const HUD_TELEMETRY_INTERVAL_MS = 100;

function isTankPositionBlocked(x: number, z: number, yaw: number, rear:boolean,guard?:RearGuardPose,hutDestroyed=false) {
  // The tracked vehicle rolls through low battlefield scenery. Only authored
  // terrain mounds and the sector perimeter remain hard movement blockers.
  return !isInsideArena(x, z, ARENA_TANK_PADDING)
    || tankFootprintBlocked(x, z, yaw, intersectsTerrainMound)
    || (rear && tankFootprintBlocked(x,z,yaw,(a,b,r)=>rearStrongholdBlocksDrive(a,b,r,guard,hutDestroyed)));
}

interface TankProps {
  onShoot?: (position: THREE.Vector3, direction: THREE.Vector3) => void;
  onMachineGun?: (position: THREE.Vector3, direction: THREE.Vector3, triggerId: number) => void;
  onFlamethrower?: (position: THREE.Vector3, direction: THREE.Vector3, triggerId: number, reach: number, contact: WeaponContact | null) => void;
  onFlameFuelChange?: (fuel: number) => void;
  onNapalm?: (target: THREE.Vector3, direction: THREE.Vector3) => void;
  onEagleTarget?: (target: THREE.Vector3, direction: THREE.Vector3) => void;
  onMachineGunAudioChange?: (active: boolean) => void;
  onCannonReloadChange?: (state: CannonReloadState) => void;
  onMachineGunHeatChange?: (state: MachineGunHeatState) => void;
  onFlamethrowerAudioChange?: (active: boolean) => void;
  onMovementAudioChange?: (active: boolean) => void;
  weaponMode?: WeaponMode;
  initialPosition?: [number, number, number];
  initialHeading?: number;
  impactFeed?: TankImpactFeed;
  tankStateRef?: React.RefObject<{ position: [number, number, number]; rotation: number }>;
  colliders?: readonly TankCollider[];
  environmentSeed?: number;
  eagleTargeting?: boolean;
  disabled?: boolean;
  blockRearStronghold?: boolean;
  rearGuardPoseRef?:React.RefObject<RearGuardPose>;
  rearHutDestroyed?:boolean;
  fieldSurface?:(from:THREE.Vector3,to:THREE.Vector3,structuresOnly?:boolean)=>WeaponContact|null;
}

export const Tank = memo(forwardRef<THREE.Group, TankProps>(({ onShoot, onMachineGun, onFlamethrower, onFlameFuelChange, onNapalm, onEagleTarget, onMachineGunAudioChange, onCannonReloadChange, onMachineGunHeatChange, onFlamethrowerAudioChange, onMovementAudioChange, weaponMode = 'cannon', initialPosition = DEFAULT_TANK_POSITION, initialHeading = Math.PI, impactFeed, tankStateRef, environmentSeed = 1968, eagleTargeting = false, disabled = false, blockRearStronghold = false,rearGuardPoseRef,rearHutDestroyed=false,fieldSurface }, tankRef) => {
  const presentation = useTankPresentation();
  const reviewDrive = useSceneReviewDrive();
  const turretRef = useRef<THREE.Group>(null);
  const turretWorldYaw = useRef<number | null>(null);
  const sweeping = useRef(false);
  const cannonBarrelRef = useRef<THREE.Group>(null);
  const cannonMuzzleRef = useRef<THREE.Group>(null);
  const machineGunRecoilRef = useRef<THREE.Group>(null);
  const machineGunMuzzleRef = useRef<THREE.Group>(null);
  const machineGunFlashRef = useRef<THREE.Mesh>(null);
  const cannonFlashRef = useRef<THREE.Mesh>(null);
  const cannonFlashUntilRef = useRef(0);
  const flameMount = useRef<THREE.Group>(null);
  const flameMuzzleRef = useRef<THREE.Group>(null);
  const gunnerRef = useRef<THREE.Group>(null);
  const [flameActive, setFlameActive] = useState(false);
  const flameActiveRef = useRef(false);
  const { scene, camera, pointer, size, gl } = useThree();
  const designationPointer = useMemo(() => new THREE.Vector2(), []);
  const triggerHeldRef = useRef(false);
  const triggerIdRef = useRef(0);
  const ejectBrass = useEjectBrass();
  const mgFlashEnd = useRef(0);
  const machineGunClockRef = useRef(0);
  const machineGunBurstElapsedRef = useRef(0);
  const machineGunOverheatedRef = useRef(false);
  const machineGunRecoveryRemainingRef = useRef(0);
  const cannonReadyAtRef = useRef(0);
  const lastCannonReloadReportRef = useRef<CannonReloadState>({
    progress: 1,
    remainingSeconds: 0,
    ready: true,
  });
  const lastMachineGunHeatReportRef = useRef<MachineGunHeatState>({
    heat: 0,
    firing: false,
    overheated: false,
    burstRemainingSeconds: MACHINE_GUN_BURST_SECONDS,
    recoveryRemainingSeconds: 0,
  });
  const flameHitClockRef = useRef(0);
  const flameFuelRef = useRef(FLAMETHROWER_CAPACITY_SECONDS);
  const flameLockedRef = useRef(false);
  const lastFuelReportRef = useRef(1);
  const lastCannonReportAtRef = useRef(-Infinity);
  const lastMachineGunReportAtRef = useRef(-Infinity);
  const lastFuelReportAtRef = useRef(-Infinity);
  const movementAudioActiveRef = useRef(false);
  const machineGunVisualActiveRef = useRef(false);
  const cannonRecoilRef = useRef(0);

  // Pre-allocate reusable objects to avoid GC pressure
  const direction = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);
  const sightEnd=useMemo(()=>new THREE.Vector3(),[]);
  const probeSurface = useMemo(createWeaponSurfaceProbe, []);
  const trace = useMemo(() => (from: THREE.Vector3, to: THREE.Vector3) => {
    const field = probeSurface(scene, from, to, true);
    const target = fieldSurface?.(from, to);
    return target && (!field || target.t < field.t) ? target : field;
  }, [probeSurface, scene, fieldSurface]);
  const resolveSight = useMemo(() => (ray: THREE.Ray, out: THREE.Vector3) => {
    ray.at(185, sightEnd);
    const hit = trace(ray.origin, sightEnd);
    out.copy(sightEnd);
    if (hit) out.lerpVectors(ray.origin, sightEnd, hit.t);
    return !!hit;
  }, [trace, sightEnd]);
  const flamePose = useMemo(() => ({origin:new THREE.Vector3(), direction:new THREE.Vector3(0,0,-1), reach:0}), []);
  const flameEnd = useMemo(() => new THREE.Vector3(), []);
  const aimFromMuzzle = useMemo(() => (from: THREE.Vector3, mark: THREE.Vector3, dir: THREE.Vector3, cannon: boolean) => {
    dir.subVectors(mark, from);
    if (cannon) {
      // Offset the game's hand-animated drop so its descending arc meets the mark.
      const offsetY = dir.y;
      for (let i = 0; i < 3; i++) dir.y = offsetY + shellSag(dir.length() / PROJECTILE_SPEED);
    }
    return dir.normalize();
  }, []);
  const traceFlame = useMemo(() => (from: THREE.Vector3, dir: THREE.Vector3) => {
    flameEnd.copy(from).addScaledVector(dir, FLAMETHROWER_RANGE);
    const hit = trace(from, flameEnd);
    flamePose.origin.copy(from);
    flamePose.direction.copy(dir);
    flamePose.reach = FLAMETHROWER_RANGE * (hit?.t ?? 1);
    return hit;
  }, [trace, flamePose, flameEnd]);
  const localAimTarget = useMemo(() => new THREE.Vector3(), []);
  const aimWorldQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const aimInverseQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const aimUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tempWorldPos = useMemo(() => new THREE.Vector3(), []);
  const tempWorldDir = useMemo(() => new THREE.Vector3(), []);
  const nextPosition = useMemo(() => new THREE.Vector3(), []);
  const slidePosition = useMemo(() => new THREE.Vector3(), []);
  const riverStations = useMemo(
    () => createRiverStations(Number.isFinite(environmentSeed) ? Math.trunc(environmentSeed) : 1968),
    [environmentSeed],
  );
  const groundProfile = useMemo(() => createTankGroundProfile(riverStations,
    Number.isFinite(environmentSeed) ? Math.trunc(environmentSeed) : 1968), [riverStations, environmentSeed]);
  const suspension = useMemo(() => createTankSuspension(TANK_BODY_LENGTH_SCALE), []);
  const driveKeys = useMemo(createDriveKeys, []);
  const drive = useRef({ speed: 0, yawRate: 0, suspended: false });
  const movementAudioSink = useRef(onMovementAudioChange);
  useLayoutEffect(() => { movementAudioSink.current = onMovementAudioChange; }, [onMovementAudioChange]);

  useLayoutEffect(() => {
    function resetDrive() {
      driveKeys.clear();
      drive.current.speed = 0;
      drive.current.yawRate = 0;
      if (movementAudioActiveRef.current) {
        movementAudioActiveRef.current = false;
        movementAudioSink.current?.(false);
      }
    }
    function suspend() { drive.current.suspended = true; resetDrive(); }
    function focus() { drive.current.suspended = document.hidden; }
    function visibility() {
      if (document.hidden) suspend();
      else drive.current.suspended = !document.hasFocus();
    }
    function keydown(event: KeyboardEvent) {
      if (!drive.current.suspended) driveKeys.press(event.code || event.key, event.repeat);
    }
    function keyup(event: KeyboardEvent) { driveKeys.release(event.code || event.key); }

    // A teleport, respawn, or modal must discard both momentum and held keys.
    resetDrive();
    drive.current.suspended = disabled || document.hidden;
    if (disabled) return;
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', suspend);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', suspend);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [driveKeys, disabled, initialPosition]);

  function reportCannonReload(now: number, force = false) {
    const remainingSeconds = Math.max(0, (cannonReadyAtRef.current - now) / 1_000);
    const ready = remainingSeconds === 0;
    const previous = lastCannonReloadReportRef.current;
    if (!force
      && previous.ready === ready
      && now - lastCannonReportAtRef.current < HUD_TELEMETRY_INTERVAL_MS) return;
    const nextState: CannonReloadState = {
      progress: THREE.MathUtils.clamp(1 - remainingSeconds / CANNON_RELOAD_SECONDS, 0, 1),
      remainingSeconds,
      ready,
    };
    lastCannonReportAtRef.current = now;
    lastCannonReloadReportRef.current = nextState;
    onCannonReloadChange?.(nextState);
  }

  function reportMachineGunHeat(force = false, now = performance.now()) {
    const firing = machineGunVisualActiveRef.current;
    const overheated = machineGunOverheatedRef.current;
    const recoveryRemainingSeconds = overheated
      ? Math.max(0, machineGunRecoveryRemainingRef.current)
      : 0;
    const heat = overheated
      ? THREE.MathUtils.clamp(
          recoveryRemainingSeconds / MACHINE_GUN_OVERHEAT_RECOVERY_SECONDS,
          0,
          1,
        )
      : firing
        ? THREE.MathUtils.clamp(
            machineGunBurstElapsedRef.current / MACHINE_GUN_BURST_SECONDS,
            0,
            1,
          )
        : 0;
    const previous = lastMachineGunHeatReportRef.current;
    if (!force
      && previous.firing === firing
      && previous.overheated === overheated
      && now - lastMachineGunReportAtRef.current < HUD_TELEMETRY_INTERVAL_MS) return;
    const nextState: MachineGunHeatState = {
      heat,
      firing,
      overheated,
      burstRemainingSeconds: firing
        ? Math.max(0, MACHINE_GUN_BURST_SECONDS - machineGunBurstElapsedRef.current)
        : overheated
          ? 0
          : MACHINE_GUN_BURST_SECONDS,
      recoveryRemainingSeconds,
    };
    lastMachineGunReportAtRef.current = now;
    lastMachineGunHeatReportRef.current = nextState;
    onMachineGunHeatChange?.(nextState);
  }

  function stopMachineGunBurst(overheated = false) {
    const wasFiring = machineGunVisualActiveRef.current;
    machineGunVisualActiveRef.current = false;
    if (wasFiring) onMachineGunAudioChange?.(false);

    if (overheated) {
      machineGunBurstElapsedRef.current = MACHINE_GUN_BURST_SECONDS;
      machineGunOverheatedRef.current = true;
      machineGunRecoveryRemainingRef.current = MACHINE_GUN_OVERHEAT_RECOVERY_SECONDS;
      // A held pointer cannot buffer the next burst. The player must release
      // and press again after the weapon has recovered.
      triggerHeldRef.current = false;
    } else if (!machineGunOverheatedRef.current) {
      machineGunBurstElapsedRef.current = 0;
    }
    reportMachineGunHeat(true);
  }

  function resetWeaponCycles() {
    triggerHeldRef.current = false;
    onMachineGunAudioChange?.(false);
    cannonReadyAtRef.current = 0;
    machineGunClockRef.current = 0;
    machineGunBurstElapsedRef.current = 0;
    machineGunOverheatedRef.current = false;
    machineGunRecoveryRemainingRef.current = 0;
    machineGunVisualActiveRef.current = false;
    reportCannonReload(performance.now(), true);
    reportMachineGunHeat(true);
  }

  // Reset tank position when initialPosition changes (directory navigation)
  useLayoutEffect(() => {
    if (tankRef && 'current' in tankRef && tankRef.current) {
      tankRef.current.position.set(initialPosition[0], initialPosition[1], initialPosition[2]);
      tankRef.current.rotation.set(0, initialHeading, 0, 'YXZ'); // Heading stays independent of terrain lean.
      suspension.initialized = false;
      suspension.settled = false;
      turretWorldYaw.current = null;
    }
    resetWeaponCycles();
    // The tuple is the authoritative tank-session reset signal. Callback
    // identities intentionally do not restart weapon cycles mid-encounter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPosition, initialHeading, tankRef, suspension]);

  useEffect(() => {
    reportCannonReload(performance.now(), true);
    reportMachineGunHeat(true);
    // These callbacks only publish the current snapshot when a HUD consumer
    // mounts; changing them must not alter any gameplay clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCannonReloadChange, onMachineGunHeatChange]);

  useEffect(() => {
    triggerHeldRef.current = false;
    flameActiveRef.current = false;
    stopMachineGunBurst(false);
    setFlameActive(false);
    onFlamethrowerAudioChange?.(false);
    // Weapon selection must not clear an active overheat recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weaponMode, onMachineGunAudioChange, onFlamethrowerAudioChange]);

  useEffect(() => {
    if (!disabled) return;
    triggerHeldRef.current = false;
    flameActiveRef.current = false;
    movementAudioActiveRef.current = false;
    setFlameActive(false);
    stopMachineGunBurst(false);
    resetWeaponCycles();
    onFlamethrowerAudioChange?.(false);
    onMovementAudioChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, onFlamethrowerAudioChange, onMachineGunAudioChange, onMovementAudioChange]);

  useEffect(() => () => {
    onMachineGunAudioChange?.(false);
    onFlamethrowerAudioChange?.(false);
    onMovementAudioChange?.(false);
  }, [onMachineGunAudioChange, onFlamethrowerAudioChange, onMovementAudioChange]);

  // Mouse click handler for shooting
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      // Only fire on left click (button 0)
      if (disabled || event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest?.('[data-game-ui]')) return;
      if (!tankRef || !('current' in tankRef) || !tankRef.current || !turretRef.current) return;
      // Reject duplicate pointerdown delivery while a physical press is still
      // active. This closes the input-buffer path for cannon and automatic fire.
      if (triggerHeldRef.current) return;
      if (event.target !== gl.domElement || !readDesignationPress(designationPointer,event,size)) return;

      const now = performance.now();
      if (!eagleTargeting && weaponMode === 'cannon' && now < cannonReadyAtRef.current) {
        reportCannonReload(now, true);
        return;
      }
      if (!eagleTargeting && weaponMode === 'machinegun' && machineGunOverheatedRef.current) {
        reportMachineGunHeat(true);
        return;
      }

      triggerHeldRef.current = true;
      triggerIdRef.current += 1;
      machineGunClockRef.current = 0;
      flameHitClockRef.current = 0;

      const activeMuzzle = eagleTargeting
        ? turretRef.current
        : weaponMode === 'machinegun'
          ? machineGunMuzzleRef.current
          : weaponMode === 'flamethrower'
            ? flameMuzzleRef.current
            : weaponMode === 'cannon'
              ? cannonMuzzleRef.current
              : turretRef.current;
      if (!activeMuzzle) {
        triggerHeldRef.current = false;
        return;
      }

      sampleTankMuzzle(activeMuzzle, tempWorldPos, tempWorldDir);

      raycaster.setFromCamera(designationPointer, camera);
      if (!eagleTargeting && weaponMode !== 'napalm') {
        resolveSight(raycaster.ray, intersection);
        aimFromMuzzle(tempWorldPos, intersection, tempWorldDir, weaponMode === 'cannon');
      }
      const spawnPosition = tempWorldPos.clone();

      if (eagleTargeting) {
        raycaster.setFromCamera(designationPointer, camera);
        if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
          intersection.x = clampArenaX(intersection.x, ARENA_TANK_PADDING);
          intersection.z = clampArenaZ(intersection.z, ARENA_TANK_PADDING);
          onEagleTarget?.(intersection.clone(), tempWorldDir.clone());
        }
        triggerHeldRef.current = false;
      } else if (weaponMode === 'cannon') {
        // Arm the lock before invoking application code so a synchronous or
        // duplicated input event cannot squeeze in a second shot.
        cannonReadyAtRef.current = now + CANNON_RELOAD_SECONDS * 1_000;
        reportCannonReload(now, true);
        cannonRecoilRef.current = 1;
        cannonFlashUntilRef.current = now + 75;
        onShoot?.(spawnPosition, tempWorldDir.clone());
      } else if (weaponMode === 'machinegun') {
        machineGunBurstElapsedRef.current = 0;
        machineGunClockRef.current = 0;
        machineGunVisualActiveRef.current = true;
        onMachineGunAudioChange?.(true);
        mgFlashEnd.current = performance.now() + 58;
        ejectBrass(activeMuzzle, 'tank');
        onMachineGun?.(spawnPosition, tempWorldDir.clone(), triggerIdRef.current);
        reportMachineGunHeat(true);
      } else if (weaponMode === 'flamethrower' && !flameLockedRef.current && flameFuelRef.current > 0) {
        flameActiveRef.current = true;
        setFlameActive(true);
        onFlamethrowerAudioChange?.(true);
        const contact = traceFlame(spawnPosition, tempWorldDir);
        onFlamethrower?.(spawnPosition, tempWorldDir.clone(), triggerIdRef.current, flamePose.reach, contact);
      } else if (weaponMode === 'napalm') {
        raycaster.setFromCamera(designationPointer, camera);
        const floor = raycaster.ray.intersectPlane(groundPlane, intersection);
        raycaster.ray.at(floor ? Math.min(185, raycaster.ray.origin.distanceTo(intersection)) : 185, sightEnd);
        const structure = blockRearStronghold ? fieldSurface?.(raycaster.ray.origin, sightEnd, true) : null;
        if (structure) intersection.lerpVectors(raycaster.ray.origin, sightEnd, structure.t);
        if (floor || structure) {
          intersection.y=0;
          // Keep air support inside the authored combat sector even if the
          // pointer ray lands on the procedural horizon beyond the perimeter.
          intersection.x = clampArenaX(intersection.x, ARENA_TANK_PADDING);
          intersection.z = clampArenaZ(intersection.z, ARENA_TANK_PADDING);
          onNapalm?.(intersection.clone(), faceDesignation(tankRef.current.position,intersection,tempWorldDir.clone()));
        }
        triggerHeldRef.current = false;
      }
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.button !== 0) return;
      triggerHeldRef.current = false;
      flameActiveRef.current = false;
      setFlameActive(false);
      stopMachineGunBurst(false);
      onFlamethrowerAudioChange?.(false);
    }

    function handleWindowBlur() {
      triggerHeldRef.current = false;
      flameActiveRef.current = false;
      setFlameActive(false);
      stopMachineGunBurst(false);
      onFlamethrowerAudioChange?.(false);
    }

    // Use capture phase to ensure we receive the event before R3F Canvas
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [tankRef, onShoot, onMachineGun, onFlamethrower, onNapalm, onEagleTarget, onMachineGunAudioChange, onCannonReloadChange, onMachineGunHeatChange, onFlamethrowerAudioChange, weaponMode, eagleTargeting, disabled, tempWorldPos, tempWorldDir, raycaster, designationPointer, size, gl, camera, groundPlane, intersection, ejectBrass, resolveSight, aimFromMuzzle, traceFlame, flamePose, sightEnd, blockRearStronghold, fieldSurface]);

  useFrame(({ clock }, delta) => {
    if (!tankRef || !('current' in tankRef) || !tankRef.current || !turretRef.current) return;
    if (disabled) return;

    reportCannonReload(performance.now());
    if (machineGunOverheatedRef.current) {
      machineGunRecoveryRemainingRef.current = Math.max(
        0,
        machineGunRecoveryRemainingRef.current - delta,
      );
      if (machineGunRecoveryRemainingRef.current === 0) {
        machineGunOverheatedRef.current = false;
        machineGunBurstElapsedRef.current = 0;
      }
      reportMachineGunHeat();
    }

    const tank = tankRef.current;
    const controls = reviewDrive(clock.elapsedTime) ?? driveKeys;
    const throttle = drive.current.suspended ? 0 : Number(controls.forward) - Number(controls.backward);
    const steer = drive.current.suspended ? 0 : Number(controls.left) - Number(controls.right);
    const previousDriveSpeed = drive.current.speed;
    const longitudinal = stepDriveAxis(previousDriveSpeed, throttle, delta, DRIVE_ENVELOPE);
    const pivot = stepDriveAxis(drive.current.yawRate, steer, delta, PIVOT_ENVELOPE);
    drive.current.speed = longitudinal.rate;
    drive.current.yawRate = pivot.rate;
    const startX = tank.position.x, startZ = tank.position.z, startYaw = tank.rotation.y;
    const riverImmersion = riverWaterImmersion(tank.position.x, tank.position.z, riverStations);

    cannonRecoilRef.current = Math.max(0, cannonRecoilRef.current - delta * 4.8);
    if (cannonBarrelRef.current) {
      cannonBarrelRef.current.position.z = cannonRecoilPosition(cannonRecoilRef.current);
    }
    if (machineGunRecoilRef.current) {
      machineGunRecoilRef.current.position.z = machineGunVisualActiveRef.current
        ? Math.sin(clock.elapsedTime * 95) * 0.022
        : 0;
    }
    if (machineGunFlashRef.current) {
      machineGunFlashRef.current.visible = !disabled && weaponMode === 'machinegun' && performance.now() < mgFlashEnd.current;
      machineGunFlashRef.current.scale.setScalar(0.75 + Math.sin(clock.elapsedTime * 117) * 0.2);
    }
    if (cannonFlashRef.current) cannonFlashRef.current.visible = !disabled && performance.now() < cannonFlashUntilRef.current;
    if (gunnerRef.current) {
      gunnerRef.current.rotation.x = machineGunVisualActiveRef.current
        ? -0.055 + Math.sin(clock.elapsedTime * 28) * 0.012
        : 0;
    }

    // Tank body rotation (A/D keys)
    const waterTurnFactor = THREE.MathUtils.lerp(1, 0.72, riverImmersion);
    const turn = TANK_ROTATION_SPEED * pivot.travel * waterTurnFactor;
    if (turn !== 0) {
      const steps = Math.max(1, Math.ceil(Math.abs(turn) / 0.08));
      for (let step = 0; step < steps; step++) {
        const yaw = tank.rotation.y + turn / steps;
        if (isTankPositionBlocked(tank.position.x, tank.position.z, yaw, blockRearStronghold,rearGuardPoseRef?.current,rearHutDestroyed)) {
          drive.current.yawRate = 0;
          break;
        }
        tank.rotation.y = yaw;
      }
    }

    // Tank body movement (W/S keys)
    // The drive integrator caps long frames; keep the existing footprint sweep
    // for the entire travel, including braking after the player releases W/S.
    if (longitudinal.travel !== 0) {
      // Get forward direction based on tank body rotation
      // Visual pitch/roll never changes the existing ground-plane drive or footprint.
      direction.set(-Math.sin(tank.rotation.y), 0, -Math.cos(tank.rotation.y));

      const dryMove = TANK_SPEED * longitudinal.travel;
      const candidateImmersion = riverWaterImmersion(
        tank.position.x + direction.x * dryMove,
        tank.position.z + direction.z * dryMove,
        riverStations,
      );
      const waterDrag = THREE.MathUtils.lerp(
        1,
        0.58,
        Math.max(riverImmersion, candidateImmersion),
      );
      const signedMove = dryMove * waterDrag;

      if (signedMove !== 0) {
        const substepCount = Math.max(1, Math.ceil(Math.abs(signedMove) / MAX_MOVEMENT_SUBSTEP));
        const substepMove = signedMove / substepCount;
        const deltaX = direction.x * substepMove;
        const deltaZ = direction.z * substepMove;

        for (let substep = 0; substep < substepCount; substep += 1) {
          nextPosition.set(tank.position.x + deltaX, tank.position.y, tank.position.z + deltaZ);
          if (!isTankPositionBlocked(nextPosition.x, nextPosition.z, tank.rotation.y, blockRearStronghold,rearGuardPoseRef?.current,rearHutDestroyed)) {
            tank.position.copy(nextPosition);
            continue;
          }

          const canSlideX = !isTankPositionBlocked(
            tank.position.x + deltaX,
            tank.position.z,
            tank.rotation.y, blockRearStronghold,rearGuardPoseRef?.current,rearHutDestroyed,
          );
          const canSlideZ = !isTankPositionBlocked(
            tank.position.x,
            tank.position.z + deltaZ,
            tank.rotation.y, blockRearStronghold,rearGuardPoseRef?.current,rearHutDestroyed,
          );
          if (canSlideX && (!canSlideZ || Math.abs(deltaX) >= Math.abs(deltaZ))) {
            slidePosition.set(tank.position.x + deltaX, tank.position.y, tank.position.z);
            tank.position.copy(slidePosition);
          } else if (canSlideZ) {
            slidePosition.set(tank.position.x, tank.position.y, tank.position.z + deltaZ);
            tank.position.copy(slidePosition);
          }
        }
      }
    }

    // Audio, like the tread animation and water spray, follows actual travel
    // after collision resolution. Report only start/stop edges, not every RAF.
    const translated = Math.abs(tank.position.x - startX) + Math.abs(tank.position.z - startZ) > 1e-7;
    if (longitudinal.travel !== 0 && !translated) drive.current.speed = 0;
    const movementActive = translated || Math.abs(tank.rotation.y - startYaw) > 1e-7;
    if (movementAudioActiveRef.current !== movementActive) {
      movementAudioActiveRef.current = movementActive;
      onMovementAudioChange?.(movementActive);
    }
    const surge = delta > 0 && !drive.current.suspended ? (drive.current.speed - previousDriveSpeed) / delta : 0;
    const corner = translated && tank.rotation.y !== startYaw ? drive.current.speed * drive.current.yawRate : 0;
    stepTankSuspension(suspension, groundProfile, tank.position.x, tank.position.z, tank.rotation.y, delta, surge, corner);
    tank.position.y = initialPosition[1] + suspension.heave;
    tank.rotation.x = suspension.pitch;
    tank.rotation.z = suspension.roll;
    if (tankStateRef?.current) {
      const position = tankStateRef.current.position;
      position[0] = tank.position.x;
      position[1] = tank.position.y;
      position[2] = tank.position.z;
      tankStateRef.current.rotation = tank.rotation.y;
    }

    // Turret aiming with mouse
    raycaster.setFromCamera(pointer, camera);
    resolveSight(raycaster.ray,intersection);
    // Stabilize the turret against terrain lean while it tracks the cursor.
    turretRef.current.getWorldPosition(localAimTarget);
    localAimTarget.subVectors(intersection, localAimTarget);
    const angle = Math.atan2(-localAimTarget.x, -localAimTarget.z);
    const yaw = stepTurretYaw(turretWorldYaw.current ?? angle, angle, delta);
    turretWorldYaw.current = yaw;
    const difference = Math.abs(Math.atan2(Math.sin(angle - yaw), Math.cos(angle - yaw)));
    // Hysteresis avoids flashing the player cue while tracking a small target.
    const nextSweep = difference > (sweeping.current ? .018 : .065);
    if (nextSweep !== sweeping.current) {
      sweeping.current = nextSweep;
      document.dispatchEvent(new CustomEvent(TURRET_SWEEP_EVENT, {detail:nextSweep}));
    }
    aimWorldQuaternion.setFromAxisAngle(aimUp, yaw);
    tank.getWorldQuaternion(aimInverseQuaternion).invert();
    turretRef.current.quaternion.copy(aimInverseQuaternion).multiply(aimWorldQuaternion);
    for (const mount of [cannonBarrelRef.current, machineGunRecoilRef.current, flameMount.current]) {
      if (!mount) continue;
      mount.getWorldPosition(localAimTarget);
      const span = Math.hypot(intersection.x-localAimTarget.x, intersection.z-localAimTarget.z);
      const pitch = Math.atan2(intersection.y-localAimTarget.y, Math.max(.001,span));
      mount.rotation.x = stepTurretYaw(mount.rotation.x, pitch, delta);
    }

    if (weaponMode === 'machinegun'
      && triggerHeldRef.current
      && machineGunVisualActiveRef.current
      && !machineGunOverheatedRef.current) {
      const burstDelta = Math.min(
        delta,
        Math.max(0, MACHINE_GUN_BURST_SECONDS - machineGunBurstElapsedRef.current),
      );
      machineGunBurstElapsedRef.current += burstDelta;
      machineGunClockRef.current += burstDelta;
      if (machineGunClockRef.current >= MACHINE_GUN_FIRE_INTERVAL) {
        machineGunClockRef.current %= MACHINE_GUN_FIRE_INTERVAL;
        const muzzle = machineGunMuzzleRef.current;
        if (muzzle) {
          sampleTankMuzzle(muzzle, tempWorldPos, tempWorldDir);
          aimFromMuzzle(tempWorldPos, intersection, tempWorldDir, false);
          mgFlashEnd.current = performance.now() + 58;
          ejectBrass(muzzle, 'tank');
          onMachineGun?.(tempWorldPos.clone(), tempWorldDir.clone(), triggerIdRef.current);
        }
      }
      if (machineGunBurstElapsedRef.current >= MACHINE_GUN_BURST_SECONDS) {
        stopMachineGunBurst(true);
      } else {
        reportMachineGunHeat();
      }
    }

    const canFireFlame = weaponMode === 'flamethrower'
      && triggerHeldRef.current
      && !flameLockedRef.current
      && flameFuelRef.current > 0;

    if (canFireFlame) {
      flameFuelRef.current = Math.max(0, flameFuelRef.current - delta);
      if (!flameActiveRef.current) {
        flameActiveRef.current = true;
        setFlameActive(true);
        onFlamethrowerAudioChange?.(true);
      }
      const muzzle = flameMuzzleRef.current;
      if (muzzle) {
        muzzle.getWorldPosition(tempWorldPos);
        aimFromMuzzle(tempWorldPos, intersection, tempWorldDir, false);
        const contact = traceFlame(tempWorldPos, tempWorldDir);
        flameHitClockRef.current += delta;
        if (flameHitClockRef.current >= FLAMETHROWER_HIT_INTERVAL) {
          flameHitClockRef.current %= FLAMETHROWER_HIT_INTERVAL;
          onFlamethrower?.(tempWorldPos.clone(), tempWorldDir.clone(), triggerIdRef.current, flamePose.reach, contact);
        }
      }
      if (flameFuelRef.current <= 0) {
        flameLockedRef.current = true;
        flameActiveRef.current = false;
        setFlameActive(false);
        onFlamethrowerAudioChange?.(false);
      }
    } else {
      if (flameActiveRef.current) {
        flameActiveRef.current = false;
        setFlameActive(false);
        onFlamethrowerAudioChange?.(false);
      }
      const rechargeRate = FLAMETHROWER_CAPACITY_SECONDS / FLAMETHROWER_RECHARGE_SECONDS;
      flameFuelRef.current = Math.min(
        FLAMETHROWER_CAPACITY_SECONDS,
        flameFuelRef.current + rechargeRate * delta,
      );
      if (flameFuelRef.current >= FLAMETHROWER_CAPACITY_SECONDS) {
        flameLockedRef.current = false;
      }
    }

    const fuelRatio = flameFuelRef.current / FLAMETHROWER_CAPACITY_SECONDS;
    const now = performance.now();
    if ((now - lastFuelReportAtRef.current >= HUD_TELEMETRY_INTERVAL_MS
      && Math.abs(fuelRatio - lastFuelReportRef.current) >= 0.005)
      || (fuelRatio === 0 && lastFuelReportRef.current !== 0)
      || (fuelRatio === 1 && lastFuelReportRef.current !== 1)) {
      lastFuelReportAtRef.current = now;
      lastFuelReportRef.current = fuelRatio;
      onFlameFuelChange?.(fuelRatio);
    }
  }, -1); // Resolve the hull before running gear, wakes and other pose consumers sample it.

  const cannonSelected = weaponMode === 'cannon';
  const machineGunSelected = weaponMode === 'machinegun';
  const flameSelected = weaponMode === 'flamethrower';
  const napalmSelected = weaponMode === 'napalm';

  return (
    <group ref={tankRef} name="player-tank" position={[0, 0.2, 0]}>
      {impactFeed&&<TankImpactFeedback feed={impactFeed} resetPosition={initialPosition}/>}
      <group scale={[1,1,TANK_BODY_LENGTH_SCALE]}>
      {/* Sloped armor, cast surfaces and exposed running gear share worn paint. */}
      <mesh position={[0, 0.18, 0.04]} geometry={presentation.hull} material={presentation.platedArmor} castShadow receiveShadow />
      <mesh position={[0, 0.46, -0.18]} rotation={[0.1, 0, 0]} geometry={presentation.deck} material={presentation.platedArmor} castShadow receiveShadow />
      <mesh name="tank-engine-cover" position={[0, 0.48, 0.63]} material={presentation.engineCover} receiveShadow>
        <boxGeometry args={[1.14, 0.18, 0.5]} />
      </mesh>
      <mesh geometry={presentation.hardware} material={presentation.fittings} castShadow receiveShadow />
      <mesh geometry={presentation.hullFittings} material={presentation.fittings} castShadow receiveShadow />
      <mesh name="signal-forward-jaw" geometry={presentation.signalJaw} material={presentation.jawFinish} castShadow receiveShadow />
      <mesh name="signal-folded-track-guards" geometry={presentation.signalGuard} material={presentation.guardFinish} castShadow receiveShadow />
      <TankRunningGear tankRef={tankRef as React.RefObject<THREE.Group | null>} resetPosition={initialPosition} fenderMaterial={presentation.fenderFinish} lengthScale={TANK_BODY_LENGTH_SCALE} suspension={suspension} />

      {/* Tow cable, headlamps, and deck details add a readable front/rear silhouette. */}
      <mesh geometry={presentation.headlamps} material={presentation.fittings} receiveShadow />
      <mesh geometry={presentation.stencil} material={presentation.markings} receiveShadow />
      </group>

      {/* Unified turret: all weapon systems stay mounted while selection changes their readiness lights. */}
      <group ref={turretRef} name="tank-turret" position={[0, 0.72, 0.02]}>
        <mesh position={[0, -0.08, 0]} geometry={presentation.turretRing} material={presentation.fittings} castShadow receiveShadow />
        <mesh position={[0, 0.02, -0.05]} geometry={presentation.turret} material={presentation.turretArmor} castShadow receiveShadow />
        <mesh geometry={presentation.turretFittings} material={presentation.fittings} castShadow receiveShadow />
        <mesh geometry={presentation.canvasGear} material={presentation.canvas} castShadow receiveShadow />
        <mesh position={[-0.17, 0.423, 0.12]} geometry={CREW_STATION_ART.roof} material={crewStationFinish} receiveShadow dispose={null} />

        {/* M32 cannon and mantlet. */}
        <mesh position={[0, 0.1, -0.57]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.19, 0.23, 0.3, 28]} />
          <primitive attach="material" object={presentation.armor} />
        </mesh>
        <group ref={cannonBarrelRef} position={[0, 0.1, CANNON_BARREL_MOUNT_Z]}>
          <mesh geometry={presentation.signalBarrel} material={presentation.fittings} castShadow receiveShadow />
          <mesh position={[0, 0, -1.34]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.085, 0.2, 20]} />
            <primitive attach="material" object={presentation.darkArmor} />
          </mesh>
          <group ref={cannonMuzzleRef} position={CANNON_MUZZLE_SOCKET}>
            <mesh ref={cannonFlashRef} position={[0, 0, -0.21]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
              <GhostMuzzleArt width={.32} length={.42}/>
            </mesh>
          </group>
        </group>

        {/* Coaxial flame projector and permanent armored fuel cells. */}
        <group ref={flameMount} position={[-0.27, 0.02, -0.48]}>
          <mesh position={[0, 0, -0.1]}>
            <boxGeometry args={[0.22, 0.2, 0.38]} />
            <primitive attach="material" object={presentation.darkArmor} />
          </mesh>
          <mesh position={[0, 0, -0.53]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.075, 0.72, 9]} />
            <primitive attach="material" object={presentation.steel} />
          </mesh>
          <group ref={flameMuzzleRef} position={[0, 0, -0.92]}>
            <FlameStream active={flameActive} pose={flamePose} />
          </group>
        </group>
        {[-0.43, 0.43].map((x) => (
          <group key={x} position={[x, 0.05, 0.48]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 0.56, 10]} />
              <primitive attach="material" object={presentation.armor} />
            </mesh>
            <mesh position={[0, 0, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.14, 0.022, 6, 10]} />
              <meshStandardMaterial color={flameSelected ? TANK_WEAPON_COLOR : '#32392c'} emissive={flameSelected ? '#8f6c25' : '#000000'} emissiveIntensity={0.5} />
            </mesh>
          </group>
        ))}

        {/* M37 pintle machine gun. */}
        <group position={[0.42, 0.48, -0.02]}>
          <mesh name="crew-station-open-pedestal" geometry={CREW_STATION_ART.post} material={crewStationFinish} castShadow receiveShadow dispose={null} />
          <group ref={machineGunRecoilRef}>
            {[-0.065, 0.065].map(x => (
              <mesh key={x} name="tank-crew-hand-contact" position={[x, 0.08, 0.16]} geometry={CREW_STATION_ART.grip} material={crewStationFinish} dispose={null}/>
            ))}
            <mesh name="crew-station-cover-and-satchel" geometry={CREW_STATION_ART.cover} material={crewStationFinish} castShadow receiveShadow dispose={null} />
            <mesh position={[0, 0.08, -0.58]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.021, 0.025, 0.72, 14]} />
              <meshStandardMaterial color="#39423e" roughness={0.77} metalness={0.16} />
            </mesh>
            <mesh position={[0, 0.08, -0.95]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.028, 0.029, 0.13, 14]} />
              <meshStandardMaterial color="#303934" metalness={0.20} roughness={0.68} />
            </mesh>
            <group ref={machineGunMuzzleRef} position={MACHINE_GUN_MUZZLE_SOCKET}>
              <mesh name="tank-automatic-flash" ref={machineGunFlashRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <GhostMuzzleArt automatic width={.27} length={.40}/>
              </mesh>
            </group>
          </group>
        </group>

        {/* Low-profile commander's cupola and open hatch anchor the gunner to the turret. */}
        <mesh name="crew-station-lined-hatch" geometry={CREW_STATION_ART.hatch} material={crewStationFinish} receiveShadow dispose={null} />

        {/* Adult crew proportions; cupola hides the lower body, hands grip the M37. */}
        <group ref={gunnerRef} name="tank-crew-station" position={[0.18, 0.36, 0.33]}>
          <group scale={INFANTRY_WORLD_SCALE}><TankCrewPortrait /></group>
        </group>

        {/* Radio/air-support station for the napalm strike. */}
        <group position={[-0.42, 0.42, 0.38]}>
          <mesh geometry={presentation.radioHousing} material={presentation.fittings} receiveShadow />
          <mesh position={[0, 0.14, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.03, 10]} />
            <meshBasicMaterial color={napalmSelected ? '#ffd457' : '#403c24'} toneMapped={false} />
          </mesh>
          <mesh position={[-0.08, 0.72, 0]} rotation={[0, 0, -0.055]}>
            <cylinderGeometry args={[0.009, 0.016, 1.34, 6]} />
            <meshStandardMaterial color="#242a24" metalness={0.7} roughness={0.34} />
          </mesh>
        </group>

        {/* Four station lights make weapon switching legible without hiding the hardware. */}
        {[
          { x: -0.27, active: cannonSelected, color: '#dbe89b' },
          { x: -0.09, active: machineGunSelected, color: '#ffe27b' },
          { x: 0.09, active: flameSelected, color: '#ff7138' },
          { x: 0.27, active: napalmSelected, color: '#e64832' },
        ].map((light) => (
          <mesh key={light.x} position={[light.x, 0.32, 0.67]}>
            <sphereGeometry args={[0.035, 8, 6]} />
            <meshBasicMaterial color={light.active ? light.color : '#252a21'} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}));

Tank.displayName = 'Tank';
