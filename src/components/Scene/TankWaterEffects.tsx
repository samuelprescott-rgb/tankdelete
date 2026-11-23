import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TANK_SUSPENSION } from '../../lib/tankSuspension';
import { coordinateNoise } from './environmentGeneration';
import {RIVER_WATER_Y} from './riverVerticalSection';
import {
  createRiverStations,
  distanceToRiverWater,
  riverWaterImmersion,
} from './riverLayout';

import {createTrackSilt} from './trackSilt';
import {useRiverInkAtlas} from './riverCurrentArt';
import { makeTrackSprayBead, makeTrackWakeAtlas, setWakeCel, WAKE_CELS } from './trackWaterArt';

const DROPLET_POOL_SIZE = 28;
const RIPPLE_POOL_SIZE = 16;
const WATER_UPDATE_INTERVAL = 1 / 30;

interface TankWaterEffectsProps {
  tankRef: RefObject<THREE.Group | null>;
  resetPosition?: readonly number[];
  seed?: number;
  night?: boolean;
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
  yaw: number;
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
  resetPosition,
  seed = 1968,
  night = false,
  onRiverStateChange,
}: TankWaterEffectsProps) {
  const dropletsRef = useRef<THREE.InstancedMesh>(null);
  const ripplesRef = useRef<THREE.InstancedMesh>(null);
  const sampledTankRef = useRef<THREE.Group | null>(null);
  const updateClockRef = useRef(0);
  const spawnClockRef = useRef(0);
  const dropletCursorRef = useRef(0);
  const rippleCursorRef = useRef(0);
  const spawnSerialRef = useRef(0);
  const stations = useMemo(() => createRiverStations(seed), [seed]);
  const ink=useRiverInkAtlas();
  const silt=useMemo(()=>createTrackSilt(stations,ink,!night),[stations,ink,night]);
  useEffect(()=>()=>silt.dispose(),[silt]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const hiddenMatrix = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const currentPosition = useMemo(() => new THREE.Vector3(), []);
  const lastPosition = useMemo(() => new THREE.Vector3(), []);
  const movementDirection = useMemo(() => new THREE.Vector3(), []);
  const rightDirection = useMemo(() => new THREE.Vector3(), []);
  const worldQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const sprayGeometry = useMemo(makeTrackSprayBead, []);
  const wakeAtlas = useMemo(makeTrackWakeAtlas, []);
  const wakeCels = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(RIPPLE_POOL_SIZE), 1)
    .setUsage(THREE.DynamicDrawUsage), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const sprayDirection = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => { wakeAtlas.dispose(); sprayGeometry.dispose(); }, [wakeAtlas, sprayGeometry]);
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
      yaw: 0,
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

    silt.reset();
    sampledTankRef.current = null;
    updateClockRef.current = 0;
    spawnClockRef.current = 0;
    for (const droplet of droplets) droplet.active = false;
    for (const ripple of ripples) ripple.active = false;
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
  }, [dropletColors, droplets, hiddenMatrix, resetPosition, ripples, silt]);

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
    if (sampledTankRef.current !== tank) {
      silt.reset();
      sampledTankRef.current = tank;
      lastPosition.copy(currentPosition);
      spawnClockRef.current = 0;
    }

    movementDirection.subVectors(currentPosition, lastPosition).setY(0);
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

    tank.getWorldQuaternion(worldQuaternion);
    rightDirection.set(1, 0, 0).applyQuaternion(worldQuaternion).setY(0).normalize();
    silt.update(step,currentPosition,travel,movementDirection,rightDirection);

    if (churning) {
      spawnClockRef.current += step * THREE.MathUtils.clamp(speed / 4.5, 0.7, 1.8);

      let bursts = 0;
      while (spawnClockRef.current >= 0.095 && bursts < 2) {
        spawnClockRef.current -= 0.095;
        bursts += 1;
        const serial = spawnSerialRef.current;
        spawnSerialRef.current += 1;

        for (const side of [-1, 1]) {
          const trackX = currentPosition.x + rightDirection.x * side * TANK_SUSPENSION.halfTrack
            - movementDirection.x * .94;
          const trackZ = currentPosition.z + rightDirection.z * side * TANK_SUSPENSION.halfTrack
            - movementDirection.z * .94;

          if (riverWaterImmersion(trackX, trackZ, stations) <= 0) continue;
          if (serial % 3 === 0) {
            const ripple = ripples[rippleCursorRef.current];
            rippleCursorRef.current = (rippleCursorRef.current + 1) % RIPPLE_POOL_SIZE;
            ripple.active = true;
            ripple.age = 0;
            ripple.life = 0.86 + coordinateNoise(serial, side, seed, 920) * 0.25;
            ripple.baseScale = (1.35 + coordinateNoise(serial, side, seed, 921) * 0.32)
              * (0.55 + immersion * 0.45);
            ripple.yaw = Math.atan2(movementDirection.x, movementDirection.z) + side * .18;
            ripple.position.set(trackX, RIVER_WATER_Y + .032, trackZ);
          }

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
              RIVER_WATER_Y+.075+noiseZ*.08,
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
      if (droplet.age >= droplet.life || droplet.position.y < RIVER_WATER_Y) {
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
      dummy.quaternion.setFromUnitVectors(up, sprayDirection.copy(droplet.velocity).normalize());
      dummy.scale.set(scale * .88, scale * 1.25, scale * .88);
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
      wakeCels.setX(index, Math.min(WAKE_CELS - 1, Math.floor(life * WAKE_CELS)));
      dummy.position.copy(ripple.position);
      dummy.rotation.set(-Math.PI / 2, ripple.yaw, 0, 'YXZ');
      dummy.scale.set(ripple.baseScale, ripple.baseScale * 1.25, 1);
      dummy.updateMatrix();
      rippleMesh.setMatrixAt(index, dummy.matrix);
    });

    dropletMesh.visible = activeDroplets > 0;
    rippleMesh.visible = activeRipples > 0;
    if (dropletMatricesChanged) dropletMesh.instanceMatrix.needsUpdate = true;
    if (rippleMatricesChanged) {
      rippleMesh.instanceMatrix.needsUpdate = true;
      wakeCels.needsUpdate = true;
    }
  });

  return (
    <>
      <primitive object={silt.mesh}/>
      <instancedMesh
        ref={dropletsRef}
        name="track-pixel-spray"
        args={[undefined, undefined, DROPLET_POOL_SIZE]}
        frustumCulled={false}
        renderOrder={5}
      >
        <primitive object={sprayGeometry} attach="geometry" />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.78}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={ripplesRef}
        name="track-pixel-wake"
        args={[undefined, undefined, RIPPLE_POOL_SIZE]}
        frustumCulled={false}
        renderOrder={4}
      >
        <planeGeometry>
          <primitive object={wakeCels} attach="attributes-wakeCel" />
        </planeGeometry>
        <meshBasicMaterial
          map={wakeAtlas}
          onBeforeCompile={setWakeCel}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}
