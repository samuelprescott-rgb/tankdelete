import { useMemo, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ghostSliceWeight } from '../../lib/ghostSignal';
import {
  CAMERA_OFFSET,
  CAMERA_LERP_SPEED,
} from '../../lib/constants';
import {
  ARENA_TANK_PADDING,
  clampArenaX,
  clampArenaZ,
} from '../../lib/arenaBounds';

interface CameraRigProps {
  tankRef: React.RefObject<THREE.Group | null>;
  napalmCinematic?: boolean;
  embassy?: boolean;
  rearView?: boolean;
}

// How far the mouse can orbit the camera (radians)
const MAX_YAW = Math.PI * 0.4;   // ~72° left/right
const MAX_PITCH = Math.PI * 0.25; // ~45° up/down
const PITCH_MIN = -0.1;           // slight look-down limit

export function CameraRig({ tankRef, napalmCinematic = false, embassy = false, rearView = false }: CameraRigProps) {
  const { camera } = useThree();

  // Pre-allocate objects to avoid GC
  const desiredPosition = useMemo(() => new THREE.Vector3(), []);
  const baseOffset = useMemo(() => new THREE.Vector3(...CAMERA_OFFSET), []);
  const lookAtTarget = useMemo(() => new THREE.Vector3(), []);
  const rotatedOffset = useMemo(() => new THREE.Vector3(), []);
  const worldUpAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  // Mouse orbit state — right-click drag to look around
  const orbitYaw = useRef(0);   // horizontal orbit offset
  const orbitPitch = useRef(0); // vertical orbit offset
  const isDragging = useRef(false);
  // Keep a strip of horizon in the chase view so distant aircraft and the
  // layered jungle remain visible instead of being hidden behind the top HUD.
  const previousTank = useRef<THREE.Group|null>(null);
  const previousRearView = useRef(rearView);
  const lookHeight = useRef(2.75);

  useEffect(() => {
    function handleContextMenu(e: Event) {
      e.preventDefault(); // prevent right-click menu
    }

    function handlePointerDown(e: PointerEvent) {
      if (e.button === 2) { // right click
        isDragging.current = true;
      }
    }

    function handlePointerUp(e: PointerEvent) {
      if (e.button === 2) {
        isDragging.current = false;
      }
    }

    function handlePointerMove(e: PointerEvent) {
      if (!isDragging.current) return;

      const sensitivity = 0.003;
      orbitYaw.current = Math.max(-MAX_YAW, Math.min(MAX_YAW,
        orbitYaw.current - e.movementX * sensitivity
      ));
      orbitPitch.current = Math.max(PITCH_MIN, Math.min(MAX_PITCH,
        orbitPitch.current - e.movementY * sensitivity
      ));
    }

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointermove', handlePointerMove);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  useFrame((_state, delta) => {
    if (!tankRef.current) return;

    const tank = tankRef.current;
    const entering = previousTank.current !== tank;
    previousTank.current = tank;
    const switched = previousRearView.current !== rearView;
    previousRearView.current = rearView;
    if (entering || switched) {
      orbitYaw.current = orbitPitch.current = 0;
      lookHeight.current = embassy ? 2.75 : 1.82;
    }

    // Smoothly return orbit to center when not dragging
    if (!isDragging.current) {
      const orbitDecay = Math.exp(-5 * delta);
      orbitYaw.current *= orbitDecay;
      orbitPitch.current *= orbitDecay;
    }

    // Apply yaw and pitch to camera offset
    rotatedOffset.copy(baseOffset);
    // Open the shoulder over the bridge/entry lane so the tank no longer masks
    // the approach. Use the same feather as the inks; do not steer the turret.
    const slice = ghostSliceWeight(tank.position.x, tank.position.z, embassy);
    // A near three-quarter shoulder gives the tank a flank and opens a
    // diagonal into the village. Night keeps the smaller objective-local
    // offset. Orbit, clamps and aiming still share this camera.
    // In daylight the vehicle is a foreground subject, not a square of
    // engine grilles centered under the crosshair. Keep the lane free on its
    // right; orbit and point-to-world aiming still use the real camera.
    rotatedOffset.x += embassy ? 2.05 * slice : 2.95 + .40 * slice;
    rotatedOffset.z -= embassy ? .66 * slice : 1.95 + .38 * slice;
    rotatedOffset.y -= embassy ? .40 * slice : 1.08 + .18 * slice;

    // Rotate offset around Y axis (yaw) relative to tank
    if (rearView) {
      rotatedOffset.x *= -1;
      rotatedOffset.z *= -1;
    }
    if (orbitYaw.current !== 0) {
      rotatedOffset.applyAxisAngle(worldUpAxis, orbitYaw.current);
    }

    // Adjust height for pitch (raise/lower camera)
    rotatedOffset.y += Math.sin(orbitPitch.current) * baseOffset.length();

    // Compute desired camera position: rotated offset applied in tank-local space
    desiredPosition.copy(rotatedOffset);
    desiredPosition.applyQuaternion(tank.quaternion);
    desiredPosition.add(tank.position);

    // The chase offset can otherwise carry the camera through the perimeter
    // when the tank turns near an edge. Clamp both the destination and the
    // interpolated position so normal follow remains smooth along the berm,
    // while long frames can never overshoot beyond the combat sector.
    desiredPosition.x = clampArenaX(desiredPosition.x, ARENA_TANK_PADDING);
    desiredPosition.z = clampArenaZ(desiredPosition.z, ARENA_TANK_PADDING);

    // Smoothly lerp camera position
    if (entering || switched) camera.position.copy(desiredPosition);
    else camera.position.lerp(desiredPosition, 1 - Math.exp(-CAMERA_LERP_SPEED * delta));
    camera.position.x = clampArenaX(camera.position.x, ARENA_TANK_PADDING);
    camera.position.z = clampArenaZ(camera.position.z, ARENA_TANK_PADDING);

    // A subtle cinematic tilt reveals the horizon pass without taking control
    // away from the player. It eases back to the normal chase view afterward.
    lookHeight.current = THREE.MathUtils.damp(
      lookHeight.current,
      napalmCinematic ? 3.45 : embassy ? 2.75 : 1.82,
      napalmCinematic ? 2.6 : 3.8,
      delta,
    );

    // Look at a point ahead of the tank, shifted by orbit
    lookAtTarget.set(embassy ? 1.12*slice : 1.03+.34*slice,0,embassy ? -1.28*slice : -2.7-.42*slice);
    if (rearView) lookAtTarget.negate();
    lookAtTarget.applyQuaternion(tank.quaternion).add(tank.position);
    lookAtTarget.y += lookHeight.current;

    camera.lookAt(lookAtTarget);
  });

  return null;
}
