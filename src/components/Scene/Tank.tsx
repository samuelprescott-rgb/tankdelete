import { useRef, useMemo, forwardRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { TANK_SPEED, TANK_ROTATION_SPEED } from '../../lib/constants';
import {
  FLAMETHROWER_CAPACITY_SECONDS,
  FLAMETHROWER_HIT_INTERVAL,
  FLAMETHROWER_RECHARGE_SECONDS,
  MACHINE_GUN_FIRE_INTERVAL,
  WeaponMode,
} from '../../lib/weapons';
import { FlameStream } from './FlameStream';
import { intersectsTerrainMound } from '../../lib/terrain';

const TANK_ARMOR_COLOR = '#a8bf78';
const TANK_WEAPON_COLOR = '#e3b341';

// Controls enum
export enum Controls {
  forward = 'forward',
  backward = 'backward',
  left = 'left',
  right = 'right',
}

interface TankProps {
  onShoot?: (position: THREE.Vector3, direction: THREE.Vector3) => void;
  onMachineGun?: (position: THREE.Vector3, direction: THREE.Vector3, triggerId: number) => void;
  onFlamethrower?: (position: THREE.Vector3, direction: THREE.Vector3, triggerId: number) => void;
  onFlameFuelChange?: (fuel: number) => void;
  onNapalm?: (target: THREE.Vector3, direction: THREE.Vector3) => void;
  onMachineGunAudioChange?: (active: boolean) => void;
  onFlamethrowerAudioChange?: (active: boolean) => void;
  onMovementAudioChange?: (active: boolean) => void;
  weaponMode?: WeaponMode;
  initialPosition?: [number, number, number];
  tankStateRef?: React.RefObject<{ position: [number, number, number]; rotation: number }>;
}

export const Tank = forwardRef<THREE.Group, TankProps>(({ onShoot, onMachineGun, onFlamethrower, onFlameFuelChange, onNapalm, onMachineGunAudioChange, onFlamethrowerAudioChange, onMovementAudioChange, weaponMode = 'cannon', initialPosition = [0, 0, 0], tankStateRef }, tankRef) => {
  const turretRef = useRef<THREE.Group>(null);
  const cannonBarrelRef = useRef<THREE.Group>(null);
  const cannonMuzzleRef = useRef<THREE.Group>(null);
  const machineGunRecoilRef = useRef<THREE.Group>(null);
  const machineGunMuzzleRef = useRef<THREE.Group>(null);
  const machineGunFlashRef = useRef<THREE.Mesh>(null);
  const flameMuzzleRef = useRef<THREE.Group>(null);
  const gunnerRef = useRef<THREE.Group>(null);
  const [flameActive, setFlameActive] = useState(false);
  const flameActiveRef = useRef(false);
  const { camera, pointer } = useThree();
  const triggerHeldRef = useRef(false);
  const triggerIdRef = useRef(0);
  const machineGunClockRef = useRef(0);
  const flameHitClockRef = useRef(0);
  const flameFuelRef = useRef(FLAMETHROWER_CAPACITY_SECONDS);
  const flameLockedRef = useRef(false);
  const lastFuelReportRef = useRef(1);
  const movementAudioActiveRef = useRef(false);
  const machineGunVisualActiveRef = useRef(false);
  const cannonRecoilRef = useRef(0);

  // Pre-allocate reusable objects to avoid GC pressure
  const direction = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);
  const tempWorldPos = useMemo(() => new THREE.Vector3(), []);
  const tempWorldDir = useMemo(() => new THREE.Vector3(), []);
  const nextPosition = useMemo(() => new THREE.Vector3(), []);
  const slidePosition = useMemo(() => new THREE.Vector3(), []);

  // Get keyboard controls (use transient reads with get() to avoid re-renders)
  const [, get] = useKeyboardControls<Controls>();

  // Reset tank position when initialPosition changes (directory navigation)
  useEffect(() => {
    if (tankRef && 'current' in tankRef && tankRef.current) {
      tankRef.current.position.set(initialPosition[0], initialPosition[1], initialPosition[2]);
      tankRef.current.rotation.y = Math.PI; // Face toward files (+Z direction)
    }
  }, [initialPosition, tankRef]);

  useEffect(() => {
    triggerHeldRef.current = false;
    flameActiveRef.current = false;
    machineGunVisualActiveRef.current = false;
    setFlameActive(false);
    onMachineGunAudioChange?.(false);
    onFlamethrowerAudioChange?.(false);
  }, [weaponMode, onMachineGunAudioChange, onFlamethrowerAudioChange]);

  useEffect(() => () => {
    onMachineGunAudioChange?.(false);
    onFlamethrowerAudioChange?.(false);
    onMovementAudioChange?.(false);
  }, [onMachineGunAudioChange, onFlamethrowerAudioChange, onMovementAudioChange]);

  // Mouse click handler for shooting
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      // Only fire on left click (button 0)
      if (event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest?.('[data-game-ui]')) return;
      if (!tankRef || !('current' in tankRef) || !tankRef.current || !turretRef.current) return;

      triggerHeldRef.current = true;
      triggerIdRef.current += 1;
      machineGunClockRef.current = 0;
      flameHitClockRef.current = 0;

      const activeMuzzle = weaponMode === 'machinegun'
        ? machineGunMuzzleRef.current
        : weaponMode === 'flamethrower'
          ? flameMuzzleRef.current
          : weaponMode === 'cannon'
            ? cannonMuzzleRef.current
            : turretRef.current;
      if (!activeMuzzle) return;

      activeMuzzle.getWorldPosition(tempWorldPos);
      activeMuzzle.getWorldDirection(tempWorldDir);

      // getWorldDirection returns -Z axis direction, but tank body is rotated PI
      // so we negate to get the actual barrel-forward direction in world space
      tempWorldDir.negate();

      const spawnPosition = tempWorldPos.clone();

      if (weaponMode === 'cannon') {
        cannonRecoilRef.current = 1;
        onShoot?.(spawnPosition, tempWorldDir.clone());
      } else if (weaponMode === 'machinegun') {
        machineGunVisualActiveRef.current = true;
        onMachineGunAudioChange?.(true);
        onMachineGun?.(spawnPosition, tempWorldDir.clone(), triggerIdRef.current);
      } else if (weaponMode === 'flamethrower' && !flameLockedRef.current && flameFuelRef.current > 0) {
        flameActiveRef.current = true;
        setFlameActive(true);
        onFlamethrowerAudioChange?.(true);
        onFlamethrower?.(spawnPosition, tempWorldDir.clone(), triggerIdRef.current);
      } else if (weaponMode === 'napalm') {
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
          onNapalm?.(intersection.clone(), tempWorldDir.clone());
        }
        triggerHeldRef.current = false;
      }
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.button !== 0) return;
      triggerHeldRef.current = false;
      flameActiveRef.current = false;
      machineGunVisualActiveRef.current = false;
      setFlameActive(false);
      onMachineGunAudioChange?.(false);
      onFlamethrowerAudioChange?.(false);
    }

    function handleWindowBlur() {
      triggerHeldRef.current = false;
      flameActiveRef.current = false;
      machineGunVisualActiveRef.current = false;
      setFlameActive(false);
      onMachineGunAudioChange?.(false);
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
  }, [tankRef, onShoot, onMachineGun, onFlamethrower, onNapalm, onMachineGunAudioChange, onFlamethrowerAudioChange, weaponMode, tempWorldPos, tempWorldDir, raycaster, pointer, camera, groundPlane, intersection]);

  useFrame(({ clock }, delta) => {
    if (!tankRef || !('current' in tankRef) || !tankRef.current || !turretRef.current) return;

    const tank = tankRef.current;
    const controls = get();
    const movementActive = controls.forward || controls.backward;

    cannonRecoilRef.current = Math.max(0, cannonRecoilRef.current - delta * 4.8);
    if (cannonBarrelRef.current) {
      cannonBarrelRef.current.position.z = cannonRecoilRef.current * 0.16;
    }
    if (machineGunRecoilRef.current) {
      machineGunRecoilRef.current.position.z = machineGunVisualActiveRef.current
        ? Math.sin(clock.elapsedTime * 95) * 0.022
        : 0;
    }
    if (machineGunFlashRef.current) {
      machineGunFlashRef.current.visible = machineGunVisualActiveRef.current
        && Math.sin(clock.elapsedTime * 82) > -0.15;
      machineGunFlashRef.current.scale.setScalar(0.75 + Math.sin(clock.elapsedTime * 117) * 0.2);
    }
    if (gunnerRef.current) {
      gunnerRef.current.rotation.x = machineGunVisualActiveRef.current
        ? -0.055 + Math.sin(clock.elapsedTime * 28) * 0.012
        : 0;
    }

    if (movementAudioActiveRef.current !== movementActive) {
      movementAudioActiveRef.current = movementActive;
      onMovementAudioChange?.(movementActive);
    }

    // Update tank state ref for minimap (if provided)
    if (tankStateRef?.current) {
      tankStateRef.current.position = [tank.position.x, tank.position.y, tank.position.z];
      tankStateRef.current.rotation = tank.rotation.y;
    }

    // Tank body rotation (A/D keys)
    if (controls.left) {
      tank.rotation.y += TANK_ROTATION_SPEED * delta;
    }
    if (controls.right) {
      tank.rotation.y -= TANK_ROTATION_SPEED * delta;
    }

    // Tank body movement (W/S keys)
    const moveAmount = TANK_SPEED * delta;
    if (controls.forward || controls.backward) {
      // Get forward direction based on tank body rotation
      direction.set(0, 0, -1);
      direction.applyQuaternion(tank.quaternion);
      direction.normalize();

      const signedMove = controls.forward && !controls.backward
        ? moveAmount
        : controls.backward && !controls.forward
          ? -moveAmount
          : 0;

      if (signedMove !== 0) {
        nextPosition.copy(tank.position).addScaledVector(direction, signedMove);
        if (!intersectsTerrainMound(nextPosition.x, nextPosition.z, 0.65)) {
          tank.position.copy(nextPosition);
        } else {
          const deltaX = direction.x * signedMove;
          const deltaZ = direction.z * signedMove;
          const canSlideX = !intersectsTerrainMound(tank.position.x + deltaX, tank.position.z, 0.65);
          const canSlideZ = !intersectsTerrainMound(tank.position.x, tank.position.z + deltaZ, 0.65);

          if (canSlideX && (!canSlideZ || Math.abs(deltaX) >= Math.abs(deltaZ))) {
            slidePosition.copy(tank.position);
            slidePosition.x += deltaX;
            tank.position.copy(slidePosition);
          } else if (canSlideZ) {
            slidePosition.copy(tank.position);
            slidePosition.z += deltaZ;
            tank.position.copy(slidePosition);
          }
        }
      }
    }

    // Turret aiming with mouse
    // Cast ray from camera through pointer position to find ground intersection
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(groundPlane, intersection);

    if (intersection) {
      // Convert world position to tank local space
      const localTarget = tank.worldToLocal(intersection.clone());

      // Make turret look at the local target (only Y-axis rotation)
      // Barrel points along turret's local -Z axis
      // To aim -Z toward (x, z): angle = atan2(-x, -z)
      const angle = Math.atan2(-localTarget.x, -localTarget.z);
      turretRef.current.rotation.y = angle;
    }

    const continuousMuzzle = weaponMode === 'machinegun'
      ? machineGunMuzzleRef.current
      : weaponMode === 'flamethrower'
        ? flameMuzzleRef.current
        : cannonMuzzleRef.current;
    if (!continuousMuzzle) return;
    continuousMuzzle.getWorldPosition(tempWorldPos);
    continuousMuzzle.getWorldDirection(tempWorldDir);
    tempWorldDir.negate();
    const spawnPosition = tempWorldPos.clone();

    if (weaponMode === 'machinegun' && triggerHeldRef.current) {
      machineGunClockRef.current += delta;
      if (machineGunClockRef.current >= MACHINE_GUN_FIRE_INTERVAL) {
        machineGunClockRef.current %= MACHINE_GUN_FIRE_INTERVAL;
        onMachineGun?.(spawnPosition, tempWorldDir.clone(), triggerIdRef.current);
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
      flameHitClockRef.current += delta;
      if (flameHitClockRef.current >= FLAMETHROWER_HIT_INTERVAL) {
        flameHitClockRef.current %= FLAMETHROWER_HIT_INTERVAL;
        onFlamethrower?.(spawnPosition, tempWorldDir.clone(), triggerIdRef.current);
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
    if (Math.abs(fuelRatio - lastFuelReportRef.current) >= 0.015 || fuelRatio === 0 || fuelRatio === 1) {
      lastFuelReportRef.current = fuelRatio;
      onFlameFuelChange?.(fuelRatio);
    }
  });

  const cannonSelected = weaponMode === 'cannon';
  const machineGunSelected = weaponMode === 'machinegun';
  const flameSelected = weaponMode === 'flamethrower';
  const napalmSelected = weaponMode === 'napalm';

  return (
    <group ref={tankRef} position={[0, 0.2, 0]}>
      {/* M41 lower hull and running gear. */}
      <mesh position={[0, 0.18, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[1.38, 0.44, 2.12]} />
        <meshStandardMaterial color="#485638" roughness={0.82} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.46, -0.18]} rotation={[0.1, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.16, 0.28, 1.34]} />
        <meshStandardMaterial color="#65734b" roughness={0.78} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.48, 0.63]} castShadow receiveShadow>
        <boxGeometry args={[1.14, 0.18, 0.5]} />
        <meshStandardMaterial color="#3d4a31" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.42, -0.93]} rotation={[0.44, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.18, 0.34, 0.44]} />
        <meshStandardMaterial color="#748058" roughness={0.74} metalness={0.16} />
      </mesh>

      {[-0.76, 0.76].map((trackX) => (
        <group key={trackX} position={[trackX, 0.12, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.25, 0.42, 2.2]} />
            <meshStandardMaterial color="#242921" roughness={0.96} metalness={0.12} />
          </mesh>
          {[-0.76, -0.38, 0, 0.38, 0.76].map((wheelZ) => (
            <mesh key={wheelZ} position={[trackX < 0 ? -0.14 : 0.14, -0.02, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.18, 0.18, 0.08, 12]} />
              <meshStandardMaterial color="#566047" roughness={0.84} metalness={0.2} />
            </mesh>
          ))}
          <mesh position={[trackX < 0 ? -0.14 : 0.14, 0.02, 0]}>
            <boxGeometry args={[0.045, 0.3, 2.04]} />
            <meshStandardMaterial color="#1e231c" roughness={1} />
          </mesh>
          <mesh position={[0, 0.28, 0]} castShadow>
            <boxGeometry args={[0.3, 0.08, 2.26]} />
            <meshStandardMaterial color="#66714d" roughness={0.82} />
          </mesh>
        </group>
      ))}

      {/* Tow cable, headlamps, and deck details add a readable front/rear silhouette. */}
      <mesh position={[-0.43, 0.53, -1.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.085, 0.085, 0.08, 10]} />
        <meshStandardMaterial color="#d6c98a" emissive="#cabd73" emissiveIntensity={0.28} />
      </mesh>
      <mesh position={[0.43, 0.53, -1.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.085, 0.085, 0.08, 10]} />
        <meshStandardMaterial color="#d6c98a" emissive="#cabd73" emissiveIntensity={0.28} />
      </mesh>
      {[-0.34, 0, 0.34].map((x) => (
        <mesh key={x} position={[x, 0.59, 0.58]} rotation={[-Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.23, 0.05, 0.33]} />
          <meshStandardMaterial color="#2d3726" roughness={0.92} />
        </mesh>
      ))}

      {/* Unified turret: all weapon systems stay mounted while selection changes their readiness lights. */}
      <group ref={turretRef} position={[0, 0.72, 0.02]}>
        <mesh position={[0, -0.08, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.55, 0.61, 0.22, 12]} />
          <meshStandardMaterial color="#4e5d3d" roughness={0.8} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.12, -0.05]} scale={[0.72, 0.38, 0.83]} castShadow receiveShadow>
          <dodecahedronGeometry args={[0.78, 0]} />
          <meshStandardMaterial color="#66754d" roughness={0.76} metalness={0.18} flatShading />
        </mesh>
        <mesh position={[0, 0.15, 0.47]} castShadow receiveShadow>
          <boxGeometry args={[0.82, 0.28, 0.5]} />
          <meshStandardMaterial color="#465438" roughness={0.88} metalness={0.15} />
        </mesh>
        <mesh position={[-0.17, 0.42, 0.12]} rotation={[0, 0, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.23, 0.08, 12]} />
          <meshStandardMaterial color="#35422e" roughness={0.86} />
        </mesh>

        {/* M32 cannon and mantlet. */}
        <mesh position={[0, 0.1, -0.57]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.19, 0.23, 0.3, 12]} />
          <meshStandardMaterial
            color={cannonSelected ? TANK_ARMOR_COLOR : '#4b573d'}
            emissive={cannonSelected ? '#70884f' : '#000000'}
            emissiveIntensity={cannonSelected ? 0.34 : 0}
            roughness={0.7}
            metalness={0.25}
          />
        </mesh>
        <group ref={cannonBarrelRef} position={[0, 0.1, -0.61]}>
          <mesh position={[0, 0, -0.67]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.078, 1.34, 10]} />
            <meshStandardMaterial color="#394238" roughness={0.54} metalness={0.46} />
          </mesh>
          <mesh position={[0, 0, -1.34]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.085, 0.2, 10]} />
            <meshStandardMaterial
              color={cannonSelected ? TANK_ARMOR_COLOR : '#3c4438'}
              emissive={cannonSelected ? '#9eb56a' : '#000000'}
              emissiveIntensity={cannonSelected ? 0.45 : 0}
              metalness={0.45}
              roughness={0.48}
            />
          </mesh>
          <group ref={cannonMuzzleRef} position={[0, 0, -1.46]} />
        </group>

        {/* Coaxial flame projector and permanent armored fuel cells. */}
        <group position={[-0.27, 0.02, -0.48]}>
          <mesh position={[0, 0, -0.1]} castShadow>
            <boxGeometry args={[0.22, 0.2, 0.38]} />
            <meshStandardMaterial color="#3c4635" roughness={0.72} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0, -0.53]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.075, 0.72, 9]} />
            <meshStandardMaterial
              color={flameSelected ? '#bd632f' : '#4b4e3b'}
              emissive={flameSelected ? '#ff6a24' : '#000000'}
              emissiveIntensity={flameSelected ? 1.15 : 0}
              toneMapped={!flameSelected}
              roughness={0.55}
              metalness={0.3}
            />
          </mesh>
          <group ref={flameMuzzleRef} position={[0, 0, -0.92]}>
            <FlameStream active={flameActive} />
          </group>
        </group>
        {[-0.43, 0.43].map((x) => (
          <group key={x} position={[x, 0.05, 0.48]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.14, 0.14, 0.56, 10]} />
              <meshStandardMaterial color="#4d5a40" roughness={0.68} metalness={0.34} />
            </mesh>
            <mesh position={[0, 0, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.14, 0.022, 6, 10]} />
              <meshStandardMaterial color={flameSelected ? TANK_WEAPON_COLOR : '#32392c'} emissive={flameSelected ? '#8f6c25' : '#000000'} emissiveIntensity={0.5} />
            </mesh>
          </group>
        ))}

        {/* M37 pintle machine gun. */}
        <group position={[0.42, 0.48, -0.02]}>
          <mesh position={[0, -0.16, 0.02]} castShadow>
            <cylinderGeometry args={[0.12, 0.15, 0.1, 10]} />
            <meshStandardMaterial color="#30392e" metalness={0.35} roughness={0.68} />
          </mesh>
          <mesh position={[0, -0.04, 0.02]} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 0.25, 8]} />
            <meshStandardMaterial color="#252b27" metalness={0.55} roughness={0.5} />
          </mesh>
          <group ref={machineGunRecoilRef}>
            <mesh position={[0, 0.08, -0.1]} castShadow>
              <boxGeometry args={[0.18, 0.18, 0.42]} />
              <meshStandardMaterial
                color={machineGunSelected ? '#75815f' : '#30372f'}
                emissive={machineGunSelected ? '#7d8c5d' : '#000000'}
                emissiveIntensity={machineGunSelected ? 0.34 : 0}
                roughness={0.52}
                metalness={0.45}
              />
            </mesh>
            <mesh position={[0, 0.08, -0.58]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.026, 0.038, 0.72, 8]} />
              <meshStandardMaterial color="#252b29" roughness={0.44} metalness={0.62} />
            </mesh>
            <mesh position={[-0.14, 0.02, -0.03]} castShadow>
              <boxGeometry args={[0.18, 0.22, 0.28]} />
              <meshStandardMaterial color="#5a6045" roughness={0.66} metalness={0.28} />
            </mesh>
            <mesh position={[0, 0.1, -0.95]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.055, 0.055, 0.13, 8]} />
              <meshStandardMaterial color="#171c1a" metalness={0.68} roughness={0.35} />
            </mesh>
            <group ref={machineGunMuzzleRef} position={[0, 0.1, -1.04]}>
              <mesh ref={machineGunFlashRef} position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
                <coneGeometry args={[0.11, 0.28, 7]} />
                <meshBasicMaterial color="#fff3a1" toneMapped={false} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Commander/gunner seated behind the pintle mount. */}
        <group ref={gunnerRef} position={[0.18, 0.64, 0.34]}>
          <mesh position={[0, 0.04, 0]} scale={[0.24, 0.32, 0.18]} castShadow>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#405437" roughness={0.94} />
          </mesh>
          <mesh position={[0, 0.35, -0.03]} castShadow>
            <sphereGeometry args={[0.15, 12, 8]} />
            <meshStandardMaterial color="#8d6848" roughness={0.98} />
          </mesh>
          <mesh position={[0, 0.43, -0.02]} scale={[1.18, 0.45, 1.16]} castShadow>
            <sphereGeometry args={[0.17, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial color="#52613d" roughness={0.9} />
          </mesh>
          <mesh position={[0.03, 0.37, -0.16]} rotation={[0.1, 0, 0]}>
            <boxGeometry args={[0.22, 0.045, 0.08]} />
            <meshStandardMaterial color="#252d24" roughness={0.72} />
          </mesh>
          {[-0.13, 0.13].map((x) => (
            <group key={x} position={[x, 0.12, -0.13]} rotation={[-0.72, 0, x < 0 ? -0.18 : 0.18]}>
              <mesh position={[0, -0.12, 0]} castShadow>
                <cylinderGeometry args={[0.055, 0.065, 0.34, 8]} />
                <meshStandardMaterial color="#61724a" roughness={0.92} />
              </mesh>
              <mesh position={[0, -0.31, -0.01]}>
                <sphereGeometry args={[0.065, 8, 6]} />
                <meshStandardMaterial color="#8d6848" roughness={1} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Radio/air-support station for the napalm strike. */}
        <group position={[-0.42, 0.42, 0.38]}>
          <mesh castShadow>
            <boxGeometry args={[0.26, 0.22, 0.28]} />
            <meshStandardMaterial color="#303a2d" roughness={0.7} metalness={0.28} />
          </mesh>
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
});

Tank.displayName = 'Tank';
