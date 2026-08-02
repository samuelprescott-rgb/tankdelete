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

  // Pre-allocate reusable objects to avoid GC pressure
  const direction = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);
  const tempWorldPos = useMemo(() => new THREE.Vector3(), []);
  const tempWorldDir = useMemo(() => new THREE.Vector3(), []);

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

      // Get turret world position and direction
      turretRef.current.getWorldPosition(tempWorldPos);
      turretRef.current.getWorldDirection(tempWorldDir);

      // getWorldDirection returns -Z axis direction, but tank body is rotated PI
      // so we negate to get the actual barrel-forward direction in world space
      tempWorldDir.negate();

      // Spawn position: slightly in front of barrel tip
      const spawnPosition = tempWorldPos.clone().addScaledVector(tempWorldDir, 0.8);

      if (weaponMode === 'cannon') {
        onShoot?.(spawnPosition, tempWorldDir.clone());
      } else if (weaponMode === 'machinegun') {
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
      setFlameActive(false);
      onMachineGunAudioChange?.(false);
      onFlamethrowerAudioChange?.(false);
    }

    function handleWindowBlur() {
      triggerHeldRef.current = false;
      flameActiveRef.current = false;
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

  useFrame((_state, delta) => {
    if (!tankRef || !('current' in tankRef) || !tankRef.current || !turretRef.current) return;

    const tank = tankRef.current;
    const controls = get();
    const movementActive = controls.forward || controls.backward;

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

      if (controls.forward) {
        tank.position.addScaledVector(direction, moveAmount);
      }
      if (controls.backward) {
        tank.position.addScaledVector(direction, -moveAmount);
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

    turretRef.current.getWorldPosition(tempWorldPos);
    turretRef.current.getWorldDirection(tempWorldDir);
    tempWorldDir.negate();
    const spawnPosition = tempWorldPos.clone().addScaledVector(tempWorldDir, 0.8);

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

  return (
    <group ref={tankRef} position={[0, 0.2, 0]}>
      {/* Tank body */}
      <group>
        {/* Main chassis - wireframe edges */}
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(1.2, 0.4, 1.8)]} />
          <lineBasicMaterial color={TANK_ARMOR_COLOR} toneMapped={false} />
        </lineSegments>

        {/* Main chassis - transparent face fill */}
        <mesh>
          <boxGeometry args={[1.2, 0.4, 1.8]} />
          <meshStandardMaterial
            color={TANK_ARMOR_COLOR}
            emissive={TANK_ARMOR_COLOR}
            emissiveIntensity={0.5}
            transparent
            opacity={0.1}
          />
        </mesh>

        {/* Left tread */}
        <group position={[-0.6, 0, 0]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(0.15, 0.3, 1.6)]} />
            <lineBasicMaterial color={TANK_ARMOR_COLOR} toneMapped={false} />
          </lineSegments>
          <mesh>
            <boxGeometry args={[0.15, 0.3, 1.6]} />
            <meshStandardMaterial
              color={TANK_ARMOR_COLOR}
              emissive={TANK_ARMOR_COLOR}
              emissiveIntensity={0.5}
              transparent
              opacity={0.1}
            />
          </mesh>
        </group>

        {/* Right tread */}
        <group position={[0.6, 0, 0]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(0.15, 0.3, 1.6)]} />
            <lineBasicMaterial color={TANK_ARMOR_COLOR} toneMapped={false} />
          </lineSegments>
          <mesh>
            <boxGeometry args={[0.15, 0.3, 1.6]} />
            <meshStandardMaterial
              color={TANK_ARMOR_COLOR}
              emissive={TANK_ARMOR_COLOR}
              emissiveIntensity={0.5}
              transparent
              opacity={0.1}
            />
          </mesh>
        </group>
      </group>

      {/* Turret */}
      <group ref={turretRef} position={[0, 0.4, 0]}>
        {/* Turret base - octagonal cylinder */}
        <group>
          <lineSegments>
            <edgesGeometry args={[new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8)]} />
            <lineBasicMaterial color={TANK_ARMOR_COLOR} toneMapped={false} />
          </lineSegments>
          <mesh>
            <cylinderGeometry args={[0.35, 0.35, 0.25, 8]} />
            <meshStandardMaterial
              color={TANK_ARMOR_COLOR}
              emissive={TANK_ARMOR_COLOR}
              emissiveIntensity={0.5}
              transparent
              opacity={0.1}
            />
          </mesh>
        </group>

        {/* Barrel */}
        <group position={[0, 0, -0.5]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(0.08, 0.08, 1.0)]} />
            <lineBasicMaterial color={weaponMode === 'cannon' ? TANK_ARMOR_COLOR : TANK_WEAPON_COLOR} toneMapped={false} />
          </lineSegments>
          <mesh>
            <boxGeometry args={[0.08, 0.08, 1.0]} />
            <meshStandardMaterial
              color={weaponMode === 'cannon' ? TANK_ARMOR_COLOR : TANK_WEAPON_COLOR}
              emissive={weaponMode === 'cannon' ? TANK_ARMOR_COLOR : TANK_WEAPON_COLOR}
              emissiveIntensity={0.5}
              transparent
              opacity={0.1}
            />
          </mesh>
        </group>

        {weaponMode === 'flamethrower' && (
          <>
            <group position={[0, 0.15, -1.12]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.12, 0.08, 0.75, 8]} />
                <meshStandardMaterial color="#d46a2c" emissive="#ff6a24" emissiveIntensity={1.4} toneMapped={false} />
              </mesh>
            </group>
            <group position={[0.42, -0.05, 0.2]} rotation={[0, 0, Math.PI / 2]}>
              <mesh>
                <cylinderGeometry args={[0.18, 0.18, 0.72, 10]} />
                <meshStandardMaterial color="#69734f" metalness={0.5} roughness={0.65} />
              </mesh>
              <lineSegments>
                <edgesGeometry args={[new THREE.CylinderGeometry(0.18, 0.18, 0.72, 10)]} />
                <lineBasicMaterial color={TANK_WEAPON_COLOR} toneMapped={false} />
              </lineSegments>
            </group>
            <group position={[0, 0.15, -1.5]}>
              <FlameStream active={flameActive} />
            </group>
          </>
        )}

        {weaponMode === 'machinegun' && (
          <group position={[0.23, 0.11, -0.66]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.05, 1.15, 8]} />
              <meshStandardMaterial color="#7c805e" emissive="#e3b341" emissiveIntensity={0.35} />
            </mesh>
            <mesh position={[0.15, -0.08, 0.32]}>
              <boxGeometry args={[0.24, 0.22, 0.34]} />
              <meshStandardMaterial color="#676b4d" metalness={0.55} roughness={0.65} />
            </mesh>
          </group>
        )}

        {weaponMode === 'napalm' && (
          <group position={[0, 0.32, 0.15]}>
            {[-0.34, 0.34].map(x => (
              <group key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.11, 0.11, 0.8, 8]} />
                  <meshStandardMaterial color="#6b713f" emissive="#e3b341" emissiveIntensity={0.35} />
                </mesh>
                <lineSegments>
                  <edgesGeometry args={[new THREE.CylinderGeometry(0.11, 0.11, 0.8, 8)]} />
                  <lineBasicMaterial color={TANK_WEAPON_COLOR} toneMapped={false} />
                </lineSegments>
              </group>
            ))}
          </group>
        )}
      </group>
    </group>
  );
});

Tank.displayName = 'Tank';
