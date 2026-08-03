import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  NapalmStrike,
  NAPALM_STRIKE_LENGTH,
  NAPALM_STRIKE_WIDTH,
  NAPALM_TIMELINE,
} from '../../lib/weapons';

const FLAME_PARTICLE_COUNT = 152;
const SMOKE_PARTICLE_COUNT = 52;
const EMBER_PARTICLE_COUNT = 42;
const SCORCH_PATCH_COUNT = 20;

interface FireParticle {
  x: number;
  z: number;
  delay: number;
  phase: number;
  lifetime: number;
  rise: number;
  size: number;
  sway: number;
}

interface SmokeParticle extends FireParticle {
  driftX: number;
  driftZ: number;
}

interface ScorchPatch {
  x: number;
  z: number;
  delay: number;
  scaleX: number;
  scaleZ: number;
  rotation: number;
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

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function createFlameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.beginPath();
  context.moveTo(34, 2);
  context.bezierCurveTo(23, 22, 8, 54, 10, 88);
  context.bezierCurveTo(11, 113, 22, 124, 32, 126);
  context.bezierCurveTo(47, 121, 56, 105, 54, 80);
  context.bezierCurveTo(52, 50, 43, 25, 34, 2);
  context.closePath();
  context.clip();

  const glow = context.createRadialGradient(32, 96, 2, 32, 79, 51);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.3, 'rgba(255,255,255,0.92)');
  glow.addColorStop(0.68, 'rgba(255,255,255,0.58)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

interface NapalmStrikeVisualProps {
  strike: NapalmStrike;
  onImpact: (id: number) => void;
  onComplete: (id: number) => void;
}

function NapalmStrikeVisual({ strike, onImpact, onComplete }: NapalmStrikeVisualProps) {
  const strikeGroupRef = useRef<THREE.Group>(null);
  const jetRef = useRef<THREE.Group>(null);
  const bombRef = useRef<THREE.Group>(null);
  const fireGroupRef = useRef<THREE.Group>(null);
  const outerFlameRef = useRef<THREE.InstancedMesh>(null);
  const innerFlameRef = useRef<THREE.InstancedMesh>(null);
  const smokeRef = useRef<THREE.InstancedMesh>(null);
  const emberRef = useRef<THREE.InstancedMesh>(null);
  const scorchRef = useRef<THREE.InstancedMesh>(null);
  const targetMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const targetBorderMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const flashMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const shockwaveMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const fireLightRef = useRef<THREE.PointLight>(null);
  const elapsedRef = useRef(0);
  const impactTriggeredRef = useRef(false);
  const completedRef = useRef(false);
  const flightPathInitializedRef = useRef(false);
  const bombReleasedRef = useRef(false);

  const wingShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(1.25, 0);
    shape.lineTo(0.05, 0.85);
    shape.lineTo(-1.2, 3.2);
    shape.lineTo(-1.7, 3.02);
    shape.lineTo(-1.28, 0.65);
    shape.lineTo(-1.28, -0.65);
    shape.lineTo(-1.7, -3.02);
    shape.lineTo(-1.2, -3.2);
    shape.lineTo(0.05, -0.85);
    shape.closePath();
    return shape;
  }, []);

  const tailplaneShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-2.15, 0);
    shape.lineTo(-2.7, 1.62);
    shape.lineTo(-3.45, 1.42);
    shape.lineTo(-3.05, 0);
    shape.lineTo(-3.45, -1.42);
    shape.lineTo(-2.7, -1.62);
    shape.closePath();
    return shape;
  }, []);

  const verticalTailShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-3.35, 0);
    shape.lineTo(-2.65, 1.8);
    shape.lineTo(-1.85, 1.65);
    shape.lineTo(-2.35, 0);
    shape.closePath();
    return shape;
  }, []);

  const particleData = useMemo(() => {
    const random = seededRandom(strike.id * 7919 + 104729);
    const flameParticles: FireParticle[] = Array.from({ length: FLAME_PARTICLE_COUNT }, () => {
      const x = (random() - 0.5) * NAPALM_STRIKE_LENGTH * 0.96;
      const runProgress = (x / NAPALM_STRIKE_LENGTH) + 0.5;
      return {
        x,
        z: (random() - 0.5) * NAPALM_STRIKE_WIDTH * (0.72 + random() * 0.24),
        delay: runProgress * NAPALM_TIMELINE.ignitionSweepSeconds + random() * 0.18,
        phase: random(),
        lifetime: 0.78 + random() * 0.72,
        rise: 1.1 + random() * 2.6,
        size: 0.09 + random() * 0.2,
        sway: random() * Math.PI * 2,
      };
    });

    const smokeParticles: SmokeParticle[] = Array.from({ length: SMOKE_PARTICLE_COUNT }, () => {
      const x = (random() - 0.5) * NAPALM_STRIKE_LENGTH * 0.92;
      const runProgress = (x / NAPALM_STRIKE_LENGTH) + 0.5;
      return {
        x,
        z: (random() - 0.5) * NAPALM_STRIKE_WIDTH * 0.78,
        delay: 0.35 + runProgress * NAPALM_TIMELINE.ignitionSweepSeconds + random() * 1.2,
        phase: random(),
        lifetime: 3.4 + random() * 2.8,
        rise: 4.5 + random() * 5.5,
        size: 0.28 + random() * 0.44,
        sway: random() * Math.PI * 2,
        driftX: (random() - 0.35) * 1.9,
        driftZ: (random() - 0.5) * 1.4,
      };
    });

    const emberParticles: FireParticle[] = Array.from({ length: EMBER_PARTICLE_COUNT }, () => {
      const x = (random() - 0.5) * NAPALM_STRIKE_LENGTH * 0.9;
      const runProgress = (x / NAPALM_STRIKE_LENGTH) + 0.5;
      return {
        x,
        z: (random() - 0.5) * NAPALM_STRIKE_WIDTH * 0.72,
        delay: 0.25 + runProgress * NAPALM_TIMELINE.ignitionSweepSeconds + random() * 1.1,
        phase: random(),
        lifetime: 1.4 + random() * 1.5,
        rise: 2.4 + random() * 3.6,
        size: 0.025 + random() * 0.045,
        sway: random() * Math.PI * 2,
      };
    });

    const scorchPatches: ScorchPatch[] = Array.from({ length: SCORCH_PATCH_COUNT }, () => {
      const x = (random() - 0.5) * NAPALM_STRIKE_LENGTH * 0.96;
      const runProgress = (x / NAPALM_STRIKE_LENGTH) + 0.5;
      return {
        x,
        z: (random() - 0.5) * NAPALM_STRIKE_WIDTH * 0.68,
        delay: runProgress * NAPALM_TIMELINE.ignitionSweepSeconds,
        scaleX: 0.65 + random() * 1.65,
        scaleZ: 0.42 + random() * 1.05,
        rotation: random() * Math.PI,
      };
    });

    return { flameParticles, smokeParticles, emberParticles, scorchPatches };
  }, [strike.id]);

  const flameTexture = useMemo(() => createFlameTexture(), []);

  const bombImpactPosition = useMemo(() => new THREE.Vector3(0, 0.18, 0), []);
  const bombReleasePosition = useMemo(() => new THREE.Vector3(), []);
  const flightStart = useMemo(() => new THREE.Vector3(), []);
  const flightPass = useMemo(() => new THREE.Vector3(), []);
  const flightExit = useMemo(() => new THREE.Vector3(), []);
  const flightApproachVelocity = useMemo(() => new THREE.Vector3(), []);
  const flightPassVelocity = useMemo(() => new THREE.Vector3(), []);
  const flightExitVelocity = useMemo(() => new THREE.Vector3(), []);
  const cameraFlightPoint = useMemo(() => new THREE.Vector3(), []);
  const flightDirection = useMemo(() => new THREE.Vector3(), []);
  const jetForward = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const strikeWorldQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const flameBillboardQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ camera, clock }, delta) => {
    elapsedRef.current += delta;
    const age = elapsedRef.current;

    if (!flightPathInitializedRef.current && strikeGroupRef.current && age >= NAPALM_TIMELINE.jetIngressSeconds) {
      const resolveFlightPoint = (
        cameraX: number,
        cameraY: number,
        cameraZ: number,
        minimumWorldY: number,
        result: THREE.Vector3,
      ) => {
        cameraFlightPoint.set(cameraX, cameraY, cameraZ);
        camera.localToWorld(cameraFlightPoint);
        cameraFlightPoint.y = Math.max(cameraFlightPoint.y, minimumWorldY);
        result.copy(cameraFlightPoint);
        strikeGroupRef.current!.worldToLocal(result);
      };

      // Freeze a readable horizon pass after the camera's gentle cinematic tilt.
      resolveFlightPoint(-22, 2.2, -38, 8.5, flightStart);
      resolveFlightPoint(1.5, 0.4, -24, 7, flightPass);
      resolveFlightPoint(30, 4.4, -42, 10, flightExit);

      const approachDuration = NAPALM_TIMELINE.impactSeconds - NAPALM_TIMELINE.jetIngressSeconds;
      const exitDuration = NAPALM_TIMELINE.jetExitSeconds - NAPALM_TIMELINE.impactSeconds;
      flightApproachVelocity.copy(flightPass).sub(flightStart).multiplyScalar(1 / approachDuration);
      flightExitVelocity.copy(flightExit).sub(flightPass).multiplyScalar(1 / exitDuration);

      // Use one physical velocity through the release point so the two authored
      // path sections meet C1-continuously instead of easing the Phantom to a stop.
      const passSpeed = (flightApproachVelocity.length() + flightExitVelocity.length()) * 0.5;
      flightPassVelocity
        .copy(flightApproachVelocity)
        .add(flightExitVelocity)
        .normalize()
        .multiplyScalar(passSpeed);
      flightPathInitializedRef.current = true;
    }

    if (jetRef.current && flightPathInitializedRef.current) {
      const approaching = age <= NAPALM_TIMELINE.impactSeconds;
      const approachDuration = NAPALM_TIMELINE.impactSeconds - NAPALM_TIMELINE.jetIngressSeconds;
      const exitDuration = NAPALM_TIMELINE.jetExitSeconds - NAPALM_TIMELINE.impactSeconds;
      const approachProgress = THREE.MathUtils.clamp(
        (age - NAPALM_TIMELINE.jetIngressSeconds)
          / approachDuration,
        0,
        1,
      );
      const exitProgress = THREE.MathUtils.clamp(
        (age - NAPALM_TIMELINE.impactSeconds)
          / exitDuration,
        0,
        1,
      );

      jetRef.current.visible = age >= NAPALM_TIMELINE.jetIngressSeconds
        && age < NAPALM_TIMELINE.jetExitSeconds;

      if (approaching) {
        setHermitePosition(
          jetRef.current.position,
          flightStart,
          flightPass,
          flightApproachVelocity,
          flightPassVelocity,
          approachDuration,
          approachProgress,
        );
        setHermiteDirection(
          flightDirection,
          flightStart,
          flightPass,
          flightApproachVelocity,
          flightPassVelocity,
          approachDuration,
          approachProgress,
        );
      } else {
        setHermitePosition(
          jetRef.current.position,
          flightPass,
          flightExit,
          flightPassVelocity,
          flightExitVelocity,
          exitDuration,
          exitProgress,
        );
        setHermiteDirection(
          flightDirection,
          flightPass,
          flightExit,
          flightPassVelocity,
          flightExitVelocity,
          exitDuration,
          exitProgress,
        );
      }

      const fullFlightProgress = THREE.MathUtils.clamp(
        (age - NAPALM_TIMELINE.jetIngressSeconds)
          / (NAPALM_TIMELINE.jetExitSeconds - NAPALM_TIMELINE.jetIngressSeconds),
        0,
        1,
      );
      jetRef.current.quaternion.setFromUnitVectors(jetForward, flightDirection);
      jetRef.current.rotateX(THREE.MathUtils.lerp(
        -0.1,
        0.14,
        THREE.MathUtils.smoothstep(fullFlightProgress, 0, 1),
      ));

      if (age >= NAPALM_TIMELINE.bombReleaseSeconds && !bombReleasedRef.current) {
        bombReleasedRef.current = true;
        const releaseProgress = THREE.MathUtils.clamp(
          (NAPALM_TIMELINE.bombReleaseSeconds - NAPALM_TIMELINE.jetIngressSeconds)
            / approachDuration,
          0,
          1,
        );
        setHermitePosition(
          bombReleasePosition,
          flightStart,
          flightPass,
          flightApproachVelocity,
          flightPassVelocity,
          approachDuration,
          releaseProgress,
        );
        bombReleasePosition.y -= 0.55;
      }

    }

    if (bombRef.current) {
      const bombProgress = THREE.MathUtils.clamp(
        (age - NAPALM_TIMELINE.bombReleaseSeconds)
          / (NAPALM_TIMELINE.impactSeconds - NAPALM_TIMELINE.bombReleaseSeconds),
        0,
        1,
      );
      bombRef.current.visible = age >= NAPALM_TIMELINE.bombReleaseSeconds
        && age < NAPALM_TIMELINE.impactSeconds;
      const releasePosition = bombReleasedRef.current ? bombReleasePosition : flightPass;
      bombRef.current.position.lerpVectors(releasePosition, bombImpactPosition, bombProgress);
      bombRef.current.position.y = THREE.MathUtils.lerp(
        releasePosition.y,
        bombImpactPosition.y,
        bombProgress * bombProgress,
      ) + Math.sin(bombProgress * Math.PI) * 0.28;
      bombRef.current.rotation.set(0, 0, -0.08 + bombProgress * 1.7);
    }

    if (targetMaterialRef.current) {
      targetMaterialRef.current.opacity = age < NAPALM_TIMELINE.impactSeconds
        ? 0.085 + Math.sin(age * 7.5) * 0.032
        : Math.max(0, 0.12 - (age - NAPALM_TIMELINE.impactSeconds) * 0.65);
    }
    if (targetBorderMaterialRef.current) {
      targetBorderMaterialRef.current.opacity = age < NAPALM_TIMELINE.impactSeconds
        ? 0.48 + Math.sin(age * 7.5) * 0.13
        : Math.max(0, 0.65 - (age - NAPALM_TIMELINE.impactSeconds) * 3.2);
    }

    if (age >= NAPALM_TIMELINE.impactSeconds && !impactTriggeredRef.current) {
      impactTriggeredRef.current = true;
      onImpact(strike.id);
    }

    const fireAge = age - NAPALM_TIMELINE.impactSeconds;
    if (fireGroupRef.current) fireGroupRef.current.visible = fireAge >= 0;

    if (fireAge >= 0) {
      const totalFireSeconds = NAPALM_TIMELINE.cleanupSeconds - NAPALM_TIMELINE.impactSeconds;
      const burnDown = fireAge <= NAPALM_TIMELINE.rollingFireSeconds
        ? 1
        : 1 - THREE.MathUtils.smoothstep(
          fireAge,
          NAPALM_TIMELINE.rollingFireSeconds,
          totalFireSeconds,
        );
      const flickerTime = clock.elapsedTime;

      const outerFlames = outerFlameRef.current;
      const innerFlames = innerFlameRef.current;
      if (outerFlames && innerFlames) {
        if (strikeGroupRef.current) {
          strikeGroupRef.current.getWorldQuaternion(strikeWorldQuaternion);
          flameBillboardQuaternion.copy(strikeWorldQuaternion).invert().multiply(camera.quaternion);
        }
        particleData.flameParticles.forEach((particle, index) => {
          const localAge = fireAge - particle.delay;
          if (localAge < 0 || burnDown <= 0) {
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
            outerFlames.setMatrixAt(index, dummy.matrix);
            innerFlames.setMatrixAt(index, dummy.matrix);
            return;
          }

          const cycleAge = (localAge + particle.phase * particle.lifetime) % particle.lifetime;
          const life = cycleAge / particle.lifetime;
          const envelope = Math.sin(Math.min(life * 1.08, 1) * Math.PI) * (1 - life * 0.28);
          const gust = Math.sin(flickerTime * 6.3 + particle.sway + index * 0.21);
          const scale = particle.size * envelope * burnDown * (0.82 + gust * 0.18);
          const sway = Math.sin(flickerTime * 5.1 + particle.sway) * (0.12 + life * 0.34);

          dummy.position.set(
            particle.x + sway,
            0.16 + life * particle.rise,
            particle.z + Math.cos(flickerTime * 4.3 + particle.sway) * 0.1,
          );
          dummy.quaternion.copy(flameBillboardQuaternion);
          dummy.rotateZ(gust * 0.09 + sway * 0.08);
          dummy.scale.set(scale * 1.05, scale * (2.05 + particle.rise * 0.22), 1);
          dummy.updateMatrix();
          outerFlames.setMatrixAt(index, dummy.matrix);

          dummy.position.y -= scale * 0.4;
          dummy.scale.set(scale * 0.52, scale * (1.7 + particle.rise * 0.18), 1);
          dummy.updateMatrix();
          innerFlames.setMatrixAt(index, dummy.matrix);
        });
        outerFlames.instanceMatrix.needsUpdate = true;
        innerFlames.instanceMatrix.needsUpdate = true;
      }

      if (smokeRef.current) {
        particleData.smokeParticles.forEach((particle, index) => {
          const localAge = fireAge - particle.delay;
          if (localAge < 0 || burnDown <= 0) {
            dummy.scale.setScalar(0);
          } else {
            const cycleAge = (localAge + particle.phase * particle.lifetime) % particle.lifetime;
            const life = cycleAge / particle.lifetime;
            const smokeFade = Math.sin(Math.min(life, 1) * Math.PI) * Math.sqrt(burnDown);
            const size = particle.size * (0.55 + life * 1.8) * smokeFade;
            dummy.position.set(
              particle.x + particle.driftX * life + Math.sin(flickerTime * 0.9 + particle.sway) * life * 0.6,
              0.55 + life * particle.rise,
              particle.z + particle.driftZ * life,
            );
            dummy.rotation.set(life * 0.7, particle.sway + life * 1.4, life * 0.45);
            dummy.scale.set(size * 1.35, size * (1.15 + life * 0.7), size * 1.25);
          }
          dummy.updateMatrix();
          smokeRef.current?.setMatrixAt(index, dummy.matrix);
        });
        smokeRef.current.instanceMatrix.needsUpdate = true;
      }

      if (emberRef.current) {
        particleData.emberParticles.forEach((particle, index) => {
          const localAge = fireAge - particle.delay;
          if (localAge < 0 || burnDown <= 0) {
            dummy.scale.setScalar(0);
          } else {
            const cycleAge = (localAge + particle.phase * particle.lifetime) % particle.lifetime;
            const life = cycleAge / particle.lifetime;
            const emberScale = particle.size * (1 - life) * burnDown;
            dummy.position.set(
              particle.x + Math.sin(flickerTime * 2.1 + particle.sway) * life * 0.8,
              0.35 + life * particle.rise,
              particle.z + Math.cos(flickerTime * 1.7 + particle.sway) * life * 0.48,
            );
            dummy.rotation.set(0, 0, 0);
            dummy.scale.setScalar(emberScale);
          }
          dummy.updateMatrix();
          emberRef.current?.setMatrixAt(index, dummy.matrix);
        });
        emberRef.current.instanceMatrix.needsUpdate = true;
      }

      if (scorchRef.current) {
        particleData.scorchPatches.forEach((patch, index) => {
          const growth = THREE.MathUtils.smoothstep(fireAge - patch.delay, 0, 0.55);
          dummy.position.set(patch.x, 0.045 + index * 0.0004, patch.z);
          dummy.rotation.set(-Math.PI / 2, 0, patch.rotation);
          dummy.scale.set(patch.scaleX * growth, patch.scaleZ * growth, 1);
          dummy.updateMatrix();
          scorchRef.current?.setMatrixAt(index, dummy.matrix);
        });
        scorchRef.current.instanceMatrix.needsUpdate = true;
      }

      const flashProgress = THREE.MathUtils.clamp(fireAge / 0.68, 0, 1);
      if (flashRef.current) {
        flashRef.current.visible = flashProgress < 1;
        flashRef.current.scale.set(
          1 + flashProgress * 2.2,
          1 + flashProgress * 1.15,
          1 + flashProgress * 1.05,
        );
      }
      if (flashMaterialRef.current) {
        flashMaterialRef.current.opacity = Math.pow(1 - flashProgress, 2) * 0.72;
      }

      const shockwaveProgress = THREE.MathUtils.clamp(fireAge / 0.9, 0, 1);
      if (shockwaveRef.current) {
        shockwaveRef.current.visible = shockwaveProgress < 1;
        shockwaveRef.current.scale.setScalar(1 + shockwaveProgress * 3.8);
      }
      if (shockwaveMaterialRef.current) {
        shockwaveMaterialRef.current.opacity = Math.pow(1 - shockwaveProgress, 2) * 0.52;
      }

      if (fireLightRef.current) {
        const attack = THREE.MathUtils.smoothstep(fireAge, 0, 0.12);
        const lightDecay = 1 - THREE.MathUtils.smoothstep(fireAge, 2.5, totalFireSeconds);
        fireLightRef.current.intensity = attack * lightDecay * (4.7 + Math.sin(flickerTime * 17) * 0.8);
      }
    }

    if (age >= NAPALM_TIMELINE.cleanupSeconds && !completedRef.current) {
      completedRef.current = true;
      onComplete(strike.id);
    }
  });

  return (
    <group ref={strikeGroupRef} position={strike.position} rotation={[0, strike.rotation, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <planeGeometry args={[NAPALM_STRIKE_LENGTH, NAPALM_STRIKE_WIDTH]} />
        <meshBasicMaterial
          ref={targetMaterialRef}
          color="#d9b14a"
          transparent
          opacity={0.1}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <lineSegments position={[0, 0.055, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(NAPALM_STRIKE_LENGTH, 0.04, NAPALM_STRIKE_WIDTH)]} />
        <lineBasicMaterial
          ref={targetBorderMaterialRef}
          color="#ffd568"
          transparent
          opacity={0.6}
          toneMapped={false}
        />
      </lineSegments>

      {/* World-space F-4 Phantom: SEA camouflage, tandem cockpit, twin engines, and stores. */}
      <group ref={jetRef} visible={false} scale={0.52}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.42, 0.58, 6.7, 12]} />
          <meshStandardMaterial color="#6d7455" roughness={0.78} metalness={0.18} flatShading />
        </mesh>
        <mesh position={[3.95, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
          <coneGeometry args={[0.41, 1.75, 12]} />
          <meshStandardMaterial color="#313b37" roughness={0.58} metalness={0.32} flatShading />
        </mesh>
        <mesh position={[-2.95, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.5, 0.58, 1.1, 12]} />
          <meshStandardMaterial color="#74735c" roughness={0.82} metalness={0.18} flatShading />
        </mesh>

        <mesh rotation={[Math.PI / 2, 0, 0]} position={[-0.18, -0.04, 0]} castShadow>
          <shapeGeometry args={[wingShape]} />
          <meshStandardMaterial color="#586343" roughness={0.88} metalness={0.08} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[0.84, 0.84, 0.84]}>
          <shapeGeometry args={[wingShape]} />
          <meshStandardMaterial color="#7b704b" roughness={0.94} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[-0.1, 0.045, 0]} scale={[0.56, 0.98, 0.72]}>
          <shapeGeometry args={[wingShape]} />
          <meshStandardMaterial color="#3f543e" roughness={0.94} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} castShadow>
          <shapeGeometry args={[tailplaneShape]} />
          <meshStandardMaterial color="#70735a" roughness={0.86} metalness={0.12} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, 0]} castShadow>
          <shapeGeometry args={[verticalTailShape]} />
          <meshStandardMaterial color="#5a6648" roughness={0.88} metalness={0.1} side={THREE.DoubleSide} />
        </mesh>

        {[-0.66, 0.66].map(z => (
          <group key={`intake-${z}`} position={[0.55, -0.02, z]}>
            <mesh scale={[1.5, 0.5, 0.34]} castShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#667052" roughness={0.76} metalness={0.18} />
            </mesh>
            <mesh position={[0.79, 0, 0]} scale={[0.045, 0.35, 0.23]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color="#111815" />
            </mesh>
          </group>
        ))}

        {[1.62, 0.72].map((x, index) => (
          <group key={`canopy-${x}`}>
            <mesh position={[x, 0.39, 0]} scale={[0.72, 0.31, 0.48]} castShadow>
              <sphereGeometry args={[1, 12, 7]} />
              <meshStandardMaterial
                color={index === 0 ? '#24494b' : '#1d3c3f'}
                emissive="#10272a"
                emissiveIntensity={0.34}
                roughness={0.2}
                metalness={0.45}
              />
            </mesh>
            <mesh position={[x - 0.38, 0.42, 0]} scale={[0.06, 0.3, 0.5]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#343b32" roughness={0.7} />
            </mesh>
          </group>
        ))}

        <mesh position={[0.25, 0.28, 0.44]} scale={[1.45, 0.13, 0.14]}>
          <sphereGeometry args={[1, 10, 6]} />
          <meshStandardMaterial color="#7b5d3d" roughness={0.98} />
        </mesh>
        <mesh position={[-1.4, 0.18, -0.43]} scale={[1.05, 0.12, 0.14]}>
          <sphereGeometry args={[1, 10, 6]} />
          <meshStandardMaterial color="#334a38" roughness={0.98} />
        </mesh>

        {[-0.4, 0.4].map(z => (
          <group key={`engine-${z}`}>
            <mesh position={[-1.35, -0.18, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.28, 0.35, 3.65, 12]} />
              <meshStandardMaterial color="#525d50" roughness={0.72} metalness={0.28} />
            </mesh>
            <mesh position={[-3.28, -0.18, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.24, 0.31, 0.38, 12, 1, true]} />
              <meshStandardMaterial color="#202723" roughness={0.38} metalness={0.72} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[-3.48, -0.18, z]} rotation={[0, 0, Math.PI / 2]}>
              <circleGeometry args={[0.19, 12]} />
              <meshBasicMaterial color="#d66d2e" transparent opacity={0.72} toneMapped={false} />
            </mesh>
            <mesh position={[-4.12, -0.18, z]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.25, 3.6, 10, 1, true]} />
              <meshBasicMaterial
                color="#e9ddc2"
                transparent
                opacity={0.22}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        ))}

        <pointLight position={[-3.55, -0.18, 0]} color="#ff8a38" intensity={3.4} distance={7} decay={2} />
        <mesh position={[-0.62, 0.02, -3.08]}>
          <sphereGeometry args={[0.09, 8, 6]} />
          <meshBasicMaterial color="#e84535" toneMapped={false} />
        </mesh>
        <mesh position={[-0.62, 0.02, 3.08]}>
          <sphereGeometry args={[0.09, 8, 6]} />
          <meshBasicMaterial color="#75e8a0" toneMapped={false} />
        </mesh>

        {[-1.52, 1.52].map(z => (
          <group key={`store-${z}`} position={[-0.35, -0.42, z]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.15, 0.18, 2.15, 10]} />
              <meshStandardMaterial color="#404d35" roughness={0.78} metalness={0.28} />
            </mesh>
            <mesh position={[1.17, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.15, 0.25, 10]} />
              <meshStandardMaterial color="#303a2b" roughness={0.76} />
            </mesh>
            <mesh position={[0, 0.18, 0]} scale={[0.65, 0.2, 0.08]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#30362d" />
            </mesh>
          </group>
        ))}

        {[-1.85, 1.85].map(z => (
          <group key={`roundel-${z}`} position={[-0.55, 0.075, z]}>
            <mesh>
              <cylinderGeometry args={[0.23, 0.23, 0.025, 18]} />
              <meshBasicMaterial color="#263f66" />
            </mesh>
            <mesh position={[0, 0.014, 0]}>
              <cylinderGeometry args={[0.115, 0.115, 0.027, 18]} />
              <meshBasicMaterial color="#e2dec8" />
            </mesh>
          </group>
        ))}
        <mesh position={[-2.55, 1.08, 0.012]} scale={[0.08, 0.58, 0.03]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#d2c7a3" />
        </mesh>
      </group>

      <group ref={bombRef} visible={false} scale={0.38}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.2, 0.24, 1.55, 10]} />
          <meshStandardMaterial color="#39422e" emissive="#141a10" emissiveIntensity={0.25} metalness={0.48} roughness={0.52} />
        </mesh>
        <mesh position={[0.9, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.2, 0.35, 10]} />
          <meshStandardMaterial color="#2c3526" />
        </mesh>
        <mesh position={[-0.88, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.24, 0.3, 10]} />
          <meshStandardMaterial color="#2c3526" />
        </mesh>
        {[-0.2, 0.2].map(z => (
          <mesh key={z} position={[-0.72, 0, z]} scale={[0.48, 0.04, 0.18]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#31392b" />
          </mesh>
        ))}
      </group>

      <group ref={fireGroupRef} visible={false}>
        <pointLight ref={fireLightRef} position={[0, 3.1, 0]} color="#ff6a24" intensity={0} distance={24} decay={2} />

        <instancedMesh ref={scorchRef} args={[undefined, undefined, SCORCH_PATCH_COUNT]} receiveShadow>
          <circleGeometry args={[1, 16]} />
          <meshStandardMaterial color="#261711" roughness={1} transparent opacity={0.88} depthWrite={false} />
        </instancedMesh>

        <mesh ref={shockwaveRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <ringGeometry args={[0.78, 1, 48]} />
          <meshBasicMaterial
            ref={shockwaveMaterialRef}
            color="#ffd27a"
            transparent
            opacity={0.52}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        <mesh ref={flashRef} position={[0, 0.7, 0]}>
          <sphereGeometry args={[0.48, 14, 10]} />
          <meshBasicMaterial
            ref={flashMaterialRef}
            color="#fff1aa"
            transparent
            opacity={0.72}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        <instancedMesh ref={outerFlameRef} args={[undefined, undefined, FLAME_PARTICLE_COUNT]} renderOrder={55}>
          <planeGeometry args={[1, 2]} />
          <meshBasicMaterial
            map={flameTexture}
            color="#e8441c"
            transparent
            opacity={0.54}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </instancedMesh>
        <instancedMesh ref={innerFlameRef} args={[undefined, undefined, FLAME_PARTICLE_COUNT]} renderOrder={56}>
          <planeGeometry args={[1, 2]} />
          <meshBasicMaterial
            map={flameTexture}
            color="#ffb52f"
            transparent
            opacity={0.72}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </instancedMesh>

        <instancedMesh ref={smokeRef} args={[undefined, undefined, SMOKE_PARTICLE_COUNT]} renderOrder={51} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color="#302e26"
            transparent
            opacity={0.4}
            depthWrite={false}
            roughness={1}
          />
        </instancedMesh>

        <instancedMesh ref={emberRef} args={[undefined, undefined, EMBER_PARTICLE_COUNT]} renderOrder={57}>
          <sphereGeometry args={[1, 5, 4]} />
          <meshBasicMaterial
            color="#ffd36b"
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </instancedMesh>
      </group>
    </group>
  );
}

interface OrdnanceEffectsProps {
  napalmStrikes: NapalmStrike[];
  onNapalmImpact: (id: number) => void;
  onNapalmComplete: (id: number) => void;
}

export function OrdnanceEffects({
  napalmStrikes,
  onNapalmImpact,
  onNapalmComplete,
}: OrdnanceEffectsProps) {
  return (
    <>
      {napalmStrikes.map(strike => (
        <NapalmStrikeVisual
          key={strike.id}
          strike={strike}
          onImpact={onNapalmImpact}
          onComplete={onNapalmComplete}
        />
      ))}
    </>
  );
}
