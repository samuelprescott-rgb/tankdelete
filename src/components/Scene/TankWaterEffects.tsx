import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coordinateNoise } from './environmentGeneration';
import {
  createRiverStations,
  distanceToRiverWater,
  riverWaterImmersion,
} from './riverLayout';

const DROPLET_POOL_SIZE = 28;
const RIPPLE_POOL_SIZE = 10;
const WATER_UPDATE_INTERVAL = 1 / 30;

interface TankWaterEffectsProps {
  tankRef: RefObject<THREE.Group | null>;
  seed?: number;
  onRiverStateChange?: (proximity: number, movingInWater: boolean) => void;
}

interface DropletParticle {
  active: boolean;
  age: number;
  life: number;
  baseScale: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface RippleParticle {
  active: boolean;
  age: number;
  life: number;
  baseScale: number;
  position: THREE.Vector3;
}

/**
 * A small, fixed world-space pool for track spray and wake rings. It samples
 * the exact route used by the river mesh and never allocates in the frame loop.
 */
export function TankWaterEffects({
  tankRef,
  seed = 1968,
  onRiverStateChange,
}: TankWaterEffectsProps) {
  const dropletsRef = useRef<THREE.InstancedMesh>(null);
  const ripplesRef = useRef<THREE.InstancedMesh>(null);
  const initializedRef = useRef(false);
  const updateClockRef = useRef(0);
  const spawnClockRef = useRef(0);
  const dropletCursorRef = useRef(0);
  const rippleCursorRef = useRef(0);
  const spawnSerialRef = useRef(0);
  const stations = useMemo(() => createRiverStations(seed), [seed]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const hiddenMatrix = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const currentPosition = useMemo(() => new THREE.Vector3(), []);
  const lastPosition = useMemo(() => new THREE.Vector3(), []);
  const movementDirection = useMemo(() => new THREE.Vector3(), []);
  const rightDirection = useMemo(() => new THREE.Vector3(), []);
  const worldQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const dropletColors = useMemo(() => [
    new THREE.Color('#b9d9cd'),
    new THREE.Color('#709d92'),
    new THREE.Color('#d4e3cc'),
  ], []);
  const droplets = useMemo<DropletParticle[]>(() => Array.from(
    { length: DROPLET_POOL_SIZE },
    () => ({
      active: false,
      age: 0,
      life: 0,
      baseScale: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }),
  ), []);
  const ripples = useMemo<RippleParticle[]>(() => Array.from(
    { length: RIPPLE_POOL_SIZE },
    () => ({
      active: false,
      age: 0,
      life: 0,
      baseScale: 0,
      position: new THREE.Vector3(),
    }),
  ), []);

  useLayoutEffect(() => {
    const dropletMesh = dropletsRef.current;
    const rippleMesh = ripplesRef.current;
    if (!dropletMesh || !rippleMesh) return;

    dropletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rippleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < DROPLET_POOL_SIZE; index += 1) {
      dropletMesh.setMatrixAt(index, hiddenMatrix);
      dropletMesh.setColorAt(index, dropletColors[index % dropletColors.length]);
    }
    for (let index = 0; index < RIPPLE_POOL_SIZE; index += 1) {
      rippleMesh.setMatrixAt(index, hiddenMatrix);
    }
    dropletMesh.instanceMatrix.needsUpdate = true;
    rippleMesh.instanceMatrix.needsUpdate = true;
    if (dropletMesh.instanceColor) dropletMesh.instanceColor.needsUpdate = true;
    dropletMesh.visible = false;
    rippleMesh.visible = false;
  }, [dropletColors, hiddenMatrix]);

  useEffect(() => () => {
    onRiverStateChange?.(0, false);
  }, [onRiverStateChange]);

  useFrame((_, delta) => {
    const tank = tankRef.current;
    const dropletMesh = dropletsRef.current;
    const rippleMesh = ripplesRef.current;
    if (!tank || !dropletMesh || !rippleMesh) return;

    updateClockRef.current += Math.min(delta, 0.1);
    if (updateClockRef.current < WATER_UPDATE_INTERVAL) return;
    const step = Math.min(updateClockRef.current, 0.1);
    updateClockRef.current = 0;

    tank.getWorldPosition(currentPosition);
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastPosition.copy(currentPosition);
      return;
    }

    movementDirection.subVectors(currentPosition, lastPosition);
    const travel = movementDirection.length();
    const speed = travel / Math.max(step, 0.001);
    const validMovement = travel < 3;
    if (travel > 0.0001) movementDirection.multiplyScalar(1 / travel);
    else movementDirection.set(0, 0, 0);
    lastPosition.copy(currentPosition);

    const immersion = riverWaterImmersion(
      currentPosition.x,
      currentPosition.z,
      stations,
    );
    const churning = validMovement && speed > 0.38 && immersion > 0.08;
    const riverDistance = distanceToRiverWater(currentPosition.x, currentPosition.z, stations);
    const proximity = Number.isFinite(riverDistance)
      ? THREE.MathUtils.clamp(1 - riverDistance / 8, 0, 1)
      : 0;
    onRiverStateChange?.(proximity, churning);

    if (churning) {
      spawnClockRef.current += step * THREE.MathUtils.clamp(speed / 4.5, 0.7, 1.8);
      tank.getWorldQuaternion(worldQuaternion);
      rightDirection.set(1, 0, 0).applyQuaternion(worldQuaternion).setY(0).normalize();

      let bursts = 0;
      while (spawnClockRef.current >= 0.095 && bursts < 2) {
        spawnClockRef.current -= 0.095;
        bursts += 1;
        const serial = spawnSerialRef.current;
        spawnSerialRef.current += 1;

        for (const side of [-1, 1]) {
          const trackX = currentPosition.x + rightDirection.x * side * 0.68
            - movementDirection.x * 0.48;
          const trackZ = currentPosition.z + rightDirection.z * side * 0.68
            - movementDirection.z * 0.48;

          const ripple = ripples[rippleCursorRef.current];
          rippleCursorRef.current = (rippleCursorRef.current + 1) % RIPPLE_POOL_SIZE;
          ripple.active = true;
          ripple.age = 0;
          ripple.life = 0.78 + coordinateNoise(serial, side, seed, 920) * 0.38;
          ripple.baseScale = (0.38 + coordinateNoise(serial, side, seed, 921) * 0.2)
            * (0.55 + immersion * 0.45);
          ripple.position.set(trackX, 0.018, trackZ);

          for (let spray = 0; spray < 2; spray += 1) {
            const droplet = droplets[dropletCursorRef.current];
            dropletCursorRef.current = (dropletCursorRef.current + 1) % DROPLET_POOL_SIZE;
            const noiseX = coordinateNoise(serial, side * (spray + 1), seed, 922);
            const noiseZ = coordinateNoise(serial, side * (spray + 1), seed, 923);
            droplet.active = true;
            droplet.age = 0;
            droplet.life = 0.34 + noiseX * 0.3;
            droplet.baseScale = (0.045 + noiseZ * 0.055) * (0.6 + immersion * 0.55);
            droplet.position.set(
              trackX + (noiseX - 0.5) * 0.2,
              0.08 + noiseZ * 0.08,
              trackZ + (noiseZ - 0.5) * 0.18,
            );
            droplet.velocity.set(
              rightDirection.x * side * (0.32 + noiseX * 0.72) - movementDirection.x * 0.28,
              0.62 + noiseZ * 0.72,
              rightDirection.z * side * (0.32 + noiseX * 0.72) - movementDirection.z * 0.28,
            );
          }
        }
      }
    } else {
      spawnClockRef.current = Math.min(spawnClockRef.current, 0.095);
    }

    let activeDroplets = 0;
    let dropletMatricesChanged = false;
    droplets.forEach((droplet, index) => {
      if (!droplet.active) return;
      droplet.age += step;
      if (droplet.age >= droplet.life) {
        droplet.active = false;
        dropletMesh.setMatrixAt(index, hiddenMatrix);
        dropletMatricesChanged = true;
        return;
      }

      activeDroplets += 1;
      dropletMatricesChanged = true;
      droplet.velocity.y -= 3.8 * step;
      droplet.position.addScaledVector(droplet.velocity, step);
      const life = droplet.age / droplet.life;
      const scale = droplet.baseScale * Math.sin(life * Math.PI);
      dummy.position.copy(droplet.position);
      dummy.rotation.set(life * 2.4, index * 1.7, life * 1.3);
      dummy.scale.set(scale, scale * 1.65, scale);
      dummy.updateMatrix();
      dropletMesh.setMatrixAt(index, dummy.matrix);
    });

    let activeRipples = 0;
    let rippleMatricesChanged = false;
    ripples.forEach((ripple, index) => {
      if (!ripple.active) return;
      ripple.age += step;
      if (ripple.age >= ripple.life) {
        ripple.active = false;
        rippleMesh.setMatrixAt(index, hiddenMatrix);
        rippleMatricesChanged = true;
        return;
      }

      activeRipples += 1;
      rippleMatricesChanged = true;
      const life = ripple.age / ripple.life;
      const envelope = Math.sin(life * Math.PI);
      const scale = ripple.baseScale * (0.3 + life * 1.8) * envelope;
      dummy.position.copy(ripple.position);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(scale * 1.65, scale, 1);
      dummy.updateMatrix();
      rippleMesh.setMatrixAt(index, dummy.matrix);
    });

    dropletMesh.visible = activeDroplets > 0;
    rippleMesh.visible = activeRipples > 0;
    if (dropletMatricesChanged) dropletMesh.instanceMatrix.needsUpdate = true;
    if (rippleMatricesChanged) rippleMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={dropletsRef}
        args={[undefined, undefined, DROPLET_POOL_SIZE]}
        frustumCulled={false}
        renderOrder={4}
      >
        <sphereGeometry args={[1, 4, 3]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.72}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={ripplesRef}
        args={[undefined, undefined, RIPPLE_POOL_SIZE]}
        frustumCulled={false}
        renderOrder={3}
      >
        <ringGeometry args={[0.72, 1, 14]} />
        <meshBasicMaterial
          color="#b6d2c4"
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </>
  );
}
