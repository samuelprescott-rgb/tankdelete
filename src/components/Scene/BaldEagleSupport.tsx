import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {createStrikePerimeter,terminalMarkerInk,createTerminalAlphabet} from './terminalMarkers';
import {createEagleMarkerAtlas} from './eagleMarker';
import { createPaintedEagleBody, createPaintedEagleWing } from './eagleGeometry';
import { applyPaintedFinish } from './paintedMaterials';
import {
  EagleAudioCue,
  EagleStrafe,
  EAGLE_STRIKE_LENGTH,
  EAGLE_STRIKE_WIDTH,
  EAGLE_TIMELINE,
} from '../../lib/eagleSupport';

const EAGLE_TRACER_CAPACITY = 32;
const EAGLE_TRACER_SPEED = 72;
const EAGLE_TRACER_LIFETIME = 0.6;
const EAGLE_GUN_INTERVAL = 0.075;
const EAGLE_VISUAL_SCALE = 2.05;
const EAGLE_GOLD = '#ffc84f';
const WING_POSES = [0,1,2,3,2,1];

interface CosmeticTracer {
  active: boolean;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  lifetime: number;
}

export interface BaldEagleSupportProps {
  strikes: readonly EagleStrafe[];
  onImpact: (id: number) => void;
  onComplete: (id: number) => void;
  onAudioCue?: (cue: EagleAudioCue) => void;
}

interface EagleStrafeVisualProps {
  strike: EagleStrafe;
  onImpact: (id: number) => void;
  onComplete: (id: number) => void;
  onAudioCue?: (cue: EagleAudioCue) => void;
}

function setHermitePosition(
  result: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startVelocity: THREE.Vector3,
  endVelocity: THREE.Vector3,
  duration: number,
  progress: number,
) {
  const progressSquared = progress * progress;
  const progressCubed = progressSquared * progress;
  const startWeight = 2 * progressCubed - 3 * progressSquared + 1;
  const startVelocityWeight = progressCubed - 2 * progressSquared + progress;
  const endWeight = -2 * progressCubed + 3 * progressSquared;
  const endVelocityWeight = progressCubed - progressSquared;

  result
    .copy(start)
    .multiplyScalar(startWeight)
    .addScaledVector(startVelocity, startVelocityWeight * duration)
    .addScaledVector(end, endWeight)
    .addScaledVector(endVelocity, endVelocityWeight * duration);
}

function setHermiteDirection(
  result: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startVelocity: THREE.Vector3,
  endVelocity: THREE.Vector3,
  duration: number,
  progress: number,
) {
  const progressSquared = progress * progress;
  const startWeight = 6 * progressSquared - 6 * progress;
  const startVelocityWeight = 3 * progressSquared - 4 * progress + 1;
  const endWeight = -6 * progressSquared + 6 * progress;
  const endVelocityWeight = 3 * progressSquared - 2 * progress;

  result
    .copy(start)
    .multiplyScalar(startWeight)
    .addScaledVector(startVelocity, startVelocityWeight * duration)
    .addScaledVector(end, endWeight)
    .addScaledVector(endVelocity, endVelocityWeight * duration)
    .normalize();
}

function deterministicUnit(seed: number, index: number, salt: number) {
  const value = Math.sin(seed * 0.0173 + index * 71.719 + salt * 19.193) * 43758.5453;
  return value - Math.floor(value);
}

function EagleStrafeVisual({
  strike,
  onImpact,
  onComplete,
  onAudioCue,
}: EagleStrafeVisualProps) {
  const eagleRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const leftFlashRef = useRef<THREE.Mesh>(null);
  const rightFlashRef = useRef<THREE.Mesh>(null);
  const tracerMeshRef = useRef<THREE.InstancedMesh>(null);
  const laneMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const markerRef=useRef<THREE.Sprite>(null);
  const windstreamMaterialRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const elapsedRef = useRef(0);
  const gunClockRef = useRef(0);
  const shotIndexRef = useRef(0);
  const approachCueRef = useRef(false);
  const gunsStartedRef = useRef(false);
  const gunsStoppedRef = useRef(false);
  const impactTriggeredRef = useRef(false);
  const completedRef = useRef(false);
  const audioCueCallbackRef = useRef(onAudioCue);

  const plumage = useMemo(() => ({
    body: createPaintedEagleBody(),
    leftWing: createPaintedEagleWing(1),
    rightWing: createPaintedEagleWing(-1),
    material: applyPaintedFinish(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }),
      { scale: 1.9, strength: 0.57, edge: 0.46 }),
  }), []);
  useEffect(() => () => Object.values(plumage).forEach(asset => asset.dispose()), [plumage]);
  const windstreamShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.72, 0.12);
    shape.lineTo(-7.1, 0.015);
    shape.lineTo(-7.1, -0.015);
    shape.lineTo(-0.72, -0.12);
    shape.closePath();
    return shape;
  }, []);

  const tracerGeometry = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(0.027, 0.055, 2.05, 6);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, -1.025);
    return geometry;
  }, []);
  const tracerMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#fff0a8',
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }), []);
  const marker=useMemo(()=>{
    const clock={value:0},alphabet=createTerminalAlphabet(),map=createEagleMarkerAtlas();
    const geometry=createStrikePerimeter('eagle'),ink=terminalMarkerInk(alphabet,clock,'eagle');
    return {clock,map,geometry,ink,dispose(){alphabet.dispose();map.dispose();geometry.dispose();ink.dispose();}};
  },[]);
  useEffect(()=>()=>marker.dispose(),[marker]);

  const flightStart = useMemo(() => new THREE.Vector3(-62, 15.5, 0), []);
  const flightPass = useMemo(() => new THREE.Vector3(0, 9, 0), []);
  const flightExit = useMemo(() => new THREE.Vector3(66, 16, 0), []);
  const approachDuration = EAGLE_TIMELINE.impactSeconds;
  const exitDuration = EAGLE_TIMELINE.exitSeconds - EAGLE_TIMELINE.impactSeconds;
  const approachVelocity = useMemo(
    () => flightPass.clone().sub(flightStart).multiplyScalar(1 / approachDuration),
    [flightPass, flightStart, approachDuration],
  );
  const exitVelocity = useMemo(
    () => flightExit.clone().sub(flightPass).multiplyScalar(1 / exitDuration),
    [flightExit, flightPass, exitDuration],
  );
  const passVelocity = useMemo(() => {
    const passSpeed = (approachVelocity.length() + exitVelocity.length()) * 0.5;
    return approachVelocity.clone().add(exitVelocity).normalize().multiplyScalar(passSpeed);
  }, [approachVelocity, exitVelocity]);

  const flightDirection = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const eagleForward = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const tracerForward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const tracerQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tracerMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tracerScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const muzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const shotDirection = useMemo(() => new THREE.Vector3(), []);
  const gunOffset = useMemo(() => new THREE.Vector3(), []);

  const tracerPool = useMemo<CosmeticTracer[]>(() => (
    Array.from({ length: EAGLE_TRACER_CAPACITY }, () => ({
      active: false,
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(0, -1, 0),
      lifetime: 0,
    }))
  ), []);
  const tracerCursorRef = useRef(0);

  useLayoutEffect(() => {
    const mesh = tracerMeshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
  }, []);

  useEffect(() => {
    audioCueCallbackRef.current = onAudioCue;
  }, [onAudioCue]);

  useEffect(() => () => {
    if (gunsStartedRef.current && !gunsStoppedRef.current) {
      audioCueCallbackRef.current?.('guns-stop');
    }
  }, []);

  const spawnTracer = (side: -1 | 1, gunProgress: number) => {
    const eagle = eagleRef.current;
    if (!eagle) return;

    let tracer: CosmeticTracer | null = null;
    for (let offset = 0; offset < tracerPool.length; offset += 1) {
      const index = (tracerCursorRef.current + offset) % tracerPool.length;
      if (tracerPool[index].active) continue;
      tracerCursorRef.current = (index + 1) % tracerPool.length;
      tracer = tracerPool[index];
      break;
    }
    if (!tracer) return;

    const shotIndex = shotIndexRef.current++;
    gunOffset
      .set(0.68, -0.2, side * 0.72)
      .multiplyScalar(EAGLE_VISUAL_SCALE)
      .applyQuaternion(eagle.quaternion);
    muzzlePosition.copy(eagle.position).add(gunOffset);
    targetPosition.set(
      THREE.MathUtils.lerp(-EAGLE_STRIKE_LENGTH * 0.5, EAGLE_STRIKE_LENGTH * 0.5, gunProgress)
        + (deterministicUnit(strike.id, shotIndex, 1) - 0.5) * 2.2,
      0.08,
      (deterministicUnit(strike.id, shotIndex, 2) - 0.5) * EAGLE_STRIKE_WIDTH * 0.82,
    );
    shotDirection.copy(targetPosition).sub(muzzlePosition).normalize();

    tracer.active = true;
    tracer.position.copy(muzzlePosition);
    tracer.direction.copy(shotDirection);
    tracer.lifetime = 0;
  };

  useFrame((_state, delta) => {
    elapsedRef.current += delta;
    const age = elapsedRef.current;
    const eagle = eagleRef.current;
    const tracerMesh = tracerMeshRef.current;

    if (!approachCueRef.current) {
      approachCueRef.current = true;
      onAudioCue?.('approach');
    }

    if (eagle) {
      const approaching = age <= EAGLE_TIMELINE.impactSeconds;
      if (approaching) {
        const progress = THREE.MathUtils.clamp(age / approachDuration, 0, 1);
        setHermitePosition(
          eagle.position,
          flightStart,
          flightPass,
          approachVelocity,
          passVelocity,
          approachDuration,
          progress,
        );
        setHermiteDirection(
          flightDirection,
          flightStart,
          flightPass,
          approachVelocity,
          passVelocity,
          approachDuration,
          progress,
        );
      } else {
        const progress = THREE.MathUtils.clamp(
          (age - EAGLE_TIMELINE.impactSeconds) / exitDuration,
          0,
          1,
        );
        setHermitePosition(
          eagle.position,
          flightPass,
          flightExit,
          passVelocity,
          exitVelocity,
          exitDuration,
          progress,
        );
        setHermiteDirection(
          flightDirection,
          flightPass,
          flightExit,
          passVelocity,
          exitVelocity,
          exitDuration,
          progress,
        );
      }
      eagle.quaternion.setFromUnitVectors(eagleForward, flightDirection);
      eagle.rotateX(Math.sin(age * 1.45) * 0.055);
      eagle.visible = age < EAGLE_TIMELINE.exitSeconds;
    }

    const firing = age >= EAGLE_TIMELINE.gunsStartSeconds
      && age < EAGLE_TIMELINE.gunsStopSeconds;
    if (firing && !gunsStartedRef.current) {
      gunsStartedRef.current = true;
      onAudioCue?.('guns-start');
    }
    if (age >= EAGLE_TIMELINE.gunsStopSeconds
      && gunsStartedRef.current
      && !gunsStoppedRef.current) {
      gunsStoppedRef.current = true;
      onAudioCue?.('guns-stop');
    }

    if (leftWingRef.current && rightWingRef.current) {
      const attackBlend = firing ? 0.55 : 1;
      const flap = Math.sin(age * 6.4) * 0.17 * attackBlend;
      leftWingRef.current.rotation.x = flap;
      rightWingRef.current.rotation.x = -flap;
    }
    windstreamMaterialRefs.current.forEach((material, index) => {
      if (!material) return;
      const pulse = 0.17 + (Math.sin(age * 5.2 + index * 1.7) + 1) * 0.045;
      material.opacity = pulse;
    });
    if (leftFlashRef.current && rightFlashRef.current) {
      const flashVisible = firing && Math.sin(age * 126) > -0.08;
      leftFlashRef.current.visible = flashVisible;
      rightFlashRef.current.visible = flashVisible;
      if (flashVisible) {
        const flashScale = 0.82 + Math.sin(age * 211) * 0.18;
        leftFlashRef.current.scale.setScalar(flashScale);
        rightFlashRef.current.scale.setScalar(flashScale);
      }
    }

    if (firing) {
      gunClockRef.current += delta;
      while (gunClockRef.current >= EAGLE_GUN_INTERVAL) {
        gunClockRef.current -= EAGLE_GUN_INTERVAL;
        const gunProgress = THREE.MathUtils.clamp(
          (age - EAGLE_TIMELINE.gunsStartSeconds)
            / (EAGLE_TIMELINE.gunsStopSeconds - EAGLE_TIMELINE.gunsStartSeconds),
          0,
          1,
        );
        spawnTracer(-1, gunProgress);
        spawnTracer(1, gunProgress);
      }
    }

    if (age >= EAGLE_TIMELINE.impactSeconds && !impactTriggeredRef.current) {
      impactTriggeredRef.current = true;
      onImpact(strike.id);
    }

    if (laneMaterialRef.current && markerRef.current) {
      const fade = age < EAGLE_TIMELINE.impactSeconds
        ? 1
        : 1 - THREE.MathUtils.smoothstep(
          age,
          EAGLE_TIMELINE.impactSeconds,
          EAGLE_TIMELINE.gunsStopSeconds,
        );
      laneMaterialRef.current.opacity = fade * (0.1 + Math.sin(age * 8) * 0.025);
      marker.clock.value=age;
      marker.ink.opacity=fade*.88;
      const pose=WING_POSES[Math.floor(age*9)%WING_POSES.length];
      marker.map.offset.x=pose*.25;
      markerRef.current.position.y=1.28+.095*Math.cos(age*6.);
      markerRef.current.material.opacity=fade;
      markerRef.current.visible=fade>0;
    }

    let visibleTracerCount = 0;
    for (let index = 0; index < tracerPool.length; index += 1) {
      const tracer = tracerPool[index];
      if (tracer.active) {
        tracer.position.addScaledVector(tracer.direction, EAGLE_TRACER_SPEED * delta);
        tracer.lifetime += delta;
        if (tracer.lifetime >= EAGLE_TRACER_LIFETIME || tracer.position.y <= 0.06) {
          tracer.active = false;
        }
      }

      if (!tracerMesh || !tracer.active) continue;
      tracerQuaternion.setFromUnitVectors(tracerForward, tracer.direction);
      tracerMatrix.compose(tracer.position, tracerQuaternion, tracerScale);
      tracerMesh.setMatrixAt(visibleTracerCount, tracerMatrix);
      visibleTracerCount += 1;
    }
    if (tracerMesh) {
      // Pack only live cosmetic shots; count hides the stale tail with no writes.
      tracerMesh.count = visibleTracerCount;
      if (visibleTracerCount > 0) {
        tracerMesh.instanceMatrix.clearUpdateRanges();
        tracerMesh.instanceMatrix.addUpdateRange(0, visibleTracerCount * 16);
        tracerMesh.instanceMatrix.needsUpdate = true;
      }
    }

    if (age >= EAGLE_TIMELINE.cleanupSeconds && !completedRef.current) {
      completedRef.current = true;
      onComplete(strike.id);
    }
  });

  return (
    <group position={strike.position} rotation={[0, strike.rotation, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
        <planeGeometry args={[EAGLE_STRIKE_LENGTH, EAGLE_STRIKE_WIDTH]} />
        <meshBasicMaterial
          ref={laneMaterialRef}
          color="#e6a52e"
          transparent
          opacity={0.1}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh name="eagle-code-perimeter" geometry={marker.geometry} material={marker.ink}
        rotation-x={-Math.PI/2} position-y={.045} dispose={null}/>
      <sprite name="eagle-designator" ref={markerRef} position-y={1.28} scale={[2.05,1.40,1]}>
        <spriteMaterial map={marker.map} transparent depthWrite={false} toneMapped={false}/>
      </sprite>
      {[-0.36, -0.18, 0, 0.18, 0.36].map(fraction => (
        <mesh
          key={`run-mark-${fraction}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[EAGLE_STRIKE_LENGTH * fraction, 0.058, 0]}
          renderOrder={87}
        >
          <planeGeometry args={[2.4, 0.15]} />
          <meshBasicMaterial
            color="#ffd468"
            transparent
            opacity={0.56}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh
        position={[EAGLE_STRIKE_LENGTH * 0.5 - 1.7, 0.075, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={87}
      >
        <circleGeometry args={[0.82, 3]} />
        <meshBasicMaterial
          color="#fff0a6"
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <group ref={eagleRef} scale={EAGLE_VISUAL_SCALE}>
        {[
          { z: 0, scale: 1 },
          { z: -1.82, scale: 0.72 },
          { z: 1.82, scale: 0.72 },
        ].map((stream, index) => (
          <mesh
            key={`gold-windstream-${stream.z}`}
            position={[0, 0.04, stream.z]}
            rotation={index === 0 ? [0, 0, 0] : [Math.PI / 2, 0, 0]}
            scale={[stream.scale, stream.scale, stream.scale]}
            renderOrder={90}
          >
            <shapeGeometry args={[windstreamShape]} />
            <meshBasicMaterial
              ref={material => { windstreamMaterialRefs.current[index] = material; }}
              color={EAGLE_GOLD}
              transparent
              opacity={0.15}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        ))}
        <mesh geometry={plumage.body} material={plumage.material} dispose={null} />
        <group ref={leftWingRef}>
          <mesh geometry={plumage.leftWing} material={plumage.material} dispose={null} />
        </group>
        <group ref={rightWingRef}>
          <mesh geometry={plumage.rightWing} material={plumage.material} dispose={null} />
        </group>

        {[-1, 1].map(side => (
          <group key={`gun-${side}`} position={[0.24, -0.2, side * 0.72]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.09, 0.12, 0.72, 7]} />
              <meshBasicMaterial color="#313631" toneMapped={false} />
            </mesh>
            <mesh position={[0.68, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.026, 0.026, 0.72, 6]} />
              <meshBasicMaterial color="#171b19" toneMapped={false} />
            </mesh>
            <mesh
              ref={side < 0 ? leftFlashRef : rightFlashRef}
              position={[1.08, 0, 0]}
              rotation={[0, 0, -Math.PI / 2]}
              visible={false}
              renderOrder={92}
            >
              <coneGeometry args={[0.11, 0.46, 6]} />
              <meshBasicMaterial
                color="#fff0a4"
                transparent
                opacity={0.9}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        ))}
      </group>

      <instancedMesh
        ref={tracerMeshRef}
        args={[tracerGeometry, tracerMaterial, EAGLE_TRACER_CAPACITY]}
        frustumCulled={false}
        renderOrder={91}
      />
    </group>
  );
}

export function BaldEagleSupport({
  strikes,
  onImpact,
  onComplete,
  onAudioCue,
}: BaldEagleSupportProps) {
  return (
    <>
      {strikes.map(strike => (
        <EagleStrafeVisual
          key={strike.id}
          strike={strike}
          onImpact={onImpact}
          onComplete={onComplete}
          onAudioCue={onAudioCue}
        />
      ))}
    </>
  );
}
