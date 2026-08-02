import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  NapalmStrike,
  NAPALM_STRIKE_LENGTH,
  NAPALM_STRIKE_WIDTH,
} from '../../lib/weapons';

const NAPALM_PARTICLES = 80;
const JET_PASS_SECONDS = 4.2;
const BOMB_RELEASE_SECONDS = 1.7;
const NAPALM_IMPACT_SECONDS = 2.75;

interface NapalmStrikeVisualProps {
  strike: NapalmStrike;
  onComplete: (id: number) => void;
}

function NapalmStrikeVisual({ strike, onComplete }: NapalmStrikeVisualProps) {
  const flameRefs = useRef<Array<THREE.Mesh | null>>([]);
  const strikeGroupRef = useRef<THREE.Group>(null);
  const jetRef = useRef<THREE.Group>(null);
  const bombRef = useRef<THREE.Group>(null);
  const fireGroupRef = useRef<THREE.Group>(null);
  const targetMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const fireBorderMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);
  const bombReleasePositionRef = useRef<THREE.Vector3 | null>(null);

  const wingShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(1.45, 0);
    shape.lineTo(-0.65, 3.15);
    shape.lineTo(-1.55, 2.85);
    shape.lineTo(-1.15, 0.55);
    shape.lineTo(-1.15, -0.55);
    shape.lineTo(-1.55, -2.85);
    shape.lineTo(-0.65, -3.15);
    shape.closePath();
    return shape;
  }, []);

  const tailplaneShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-1.9, 0);
    shape.lineTo(-2.8, 1.45);
    shape.lineTo(-3.35, 1.25);
    shape.lineTo(-2.8, 0);
    shape.lineTo(-3.35, -1.25);
    shape.lineTo(-2.8, -1.45);
    shape.closePath();
    return shape;
  }, []);

  const verticalTailShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-3.15, 0);
    shape.lineTo(-2.55, 1.65);
    shape.lineTo(-1.85, 1.55);
    shape.lineTo(-2.25, 0);
    shape.closePath();
    return shape;
  }, []);

  const particles = useMemo(() => Array.from({ length: NAPALM_PARTICLES }, (_, index) => ({
    x: (Math.random() - 0.5) * NAPALM_STRIKE_LENGTH * 0.94,
    z: (Math.random() - 0.5) * NAPALM_STRIKE_WIDTH * 0.86,
    phase: Math.random() * 1.25,
    rise: 0.8 + Math.random() * 2.1,
    size: 0.08 + Math.random() * 0.23,
    sway: Math.random() * Math.PI * 2,
    color: new THREE.Color(index % 5 === 0 ? '#fff0a6' : index % 2 === 0 ? '#ff9a32' : '#ed421f'),
  })), []);

  const bombImpactPosition = useMemo(() => new THREE.Vector3(0, 0.22, 0), []);
  const cameraLocalPosition = useMemo(() => new THREE.Vector3(), []);
  const flightWorldPosition = useMemo(() => new THREE.Vector3(), []);
  const flightLocalPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraRight = useMemo(() => new THREE.Vector3(), []);
  const localFlightDirection = useMemo(() => new THREE.Vector3(), []);
  const parentWorldQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const jetForward = useMemo(() => new THREE.Vector3(1, 0, 0), []);

  useFrame(({ camera }, delta) => {
    elapsedRef.current += delta;
    const age = elapsedRef.current;
    const jetProgress = Math.min(age / JET_PASS_SECONDS, 1);

    if (jetRef.current && strikeGroupRef.current) {
      cameraLocalPosition.set(THREE.MathUtils.lerp(-6.5, 6.5, jetProgress), 3.5, -10);
      flightWorldPosition.copy(cameraLocalPosition);
      camera.localToWorld(flightWorldPosition);
      flightWorldPosition.y = Math.max(flightWorldPosition.y, 4);
      flightLocalPosition.copy(flightWorldPosition);
      strikeGroupRef.current.worldToLocal(flightLocalPosition);
      jetRef.current.position.copy(flightLocalPosition);
      cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      strikeGroupRef.current.getWorldQuaternion(parentWorldQuaternion).invert();
      localFlightDirection.copy(cameraRight).applyQuaternion(parentWorldQuaternion).normalize();
      jetRef.current.quaternion.setFromUnitVectors(jetForward, localFlightDirection);
      jetRef.current.rotateX(Math.sin(jetProgress * Math.PI) * -0.06);

      if (age >= BOMB_RELEASE_SECONDS && !bombReleasePositionRef.current) {
        bombReleasePositionRef.current = jetRef.current.position.clone();
      }
    }

    if (bombRef.current) {
      const bombProgress = THREE.MathUtils.clamp(
        (age - BOMB_RELEASE_SECONDS) / (NAPALM_IMPACT_SECONDS - BOMB_RELEASE_SECONDS),
        0,
        1,
      );
      bombRef.current.visible = age >= BOMB_RELEASE_SECONDS && age < NAPALM_IMPACT_SECONDS;
      const releasePosition = bombReleasePositionRef.current ?? bombImpactPosition;
      bombRef.current.position.copy(releasePosition).lerp(bombImpactPosition, bombProgress);
      bombRef.current.position.y -= Math.sin(bombProgress * Math.PI) * 1.2;
      bombRef.current.rotation.z = age * 5;
    }

    if (targetMaterialRef.current) {
      targetMaterialRef.current.opacity = age < NAPALM_IMPACT_SECONDS
        ? 0.12 + Math.sin(age * 8) * 0.045
        : Math.max(0, 0.18 - (age - NAPALM_IMPACT_SECONDS) * 0.3);
    }

    const fireAge = age - NAPALM_IMPACT_SECONDS;
    if (fireGroupRef.current) fireGroupRef.current.visible = fireAge >= 0;
    if (fireAge < 0) return;

    particles.forEach((particle, index) => {
      const flame = flameRefs.current[index];
      if (!flame) return;
      const localAge = (fireAge + particle.phase) % 1.25;
      const life = localAge / 1.25;
      const lick = Math.sin(fireAge * 11 + particle.sway) * 0.22;
      flame.position.set(
        particle.x + lick,
        0.12 + life * particle.rise,
        particle.z - lick * 0.25,
      );
      const particleScale = particle.size * (1 - life) * (0.8 + Math.sin(fireAge * 17 + index) * 0.2);
      flame.scale.set(particleScale, particleScale * 3, particleScale);
    });

    if (fireBorderMaterialRef.current) {
      fireBorderMaterialRef.current.opacity = Math.max(0.18, 0.92 - fireAge * 0.1);
    }
    if (flashRef.current) {
      flashRef.current.scale.set(
        1 + Math.min(fireAge, 0.45) * 12,
        1 + Math.min(fireAge, 0.45) * 3,
        1 + Math.min(fireAge, 0.45) * 4,
      );
      const material = flashRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.9 - fireAge * 2.1);
    }

    if (fireAge >= 4.5 && !completedRef.current) {
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
          color="#e3b341"
          transparent
          opacity={0.14}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <lineSegments position={[0, 0.055, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(NAPALM_STRIKE_LENGTH, 0.04, NAPALM_STRIKE_WIDTH)]} />
        <lineBasicMaterial color="#ffd05c" transparent opacity={0.86} toneMapped={false} />
      </lineSegments>

      <group ref={jetRef} scale={0.22}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.38, 0.52, 6.4, 12]} />
          <meshBasicMaterial color="#adb4aa" toneMapped={false} />
        </mesh>
        <mesh position={[3.9, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.39, 1.7, 12]} />
          <meshBasicMaterial color="#c3c8bc" toneMapped={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[-0.2, -0.02, 0]}>
          <shapeGeometry args={[wingShape]} />
          <meshBasicMaterial color="#929b91" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[tailplaneShape]} />
          <meshBasicMaterial color="#98a097" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <shapeGeometry args={[verticalTailShape]} />
          <meshBasicMaterial color="#858e85" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh position={[1.2, 0.34, 0]} scale={[1.45, 0.38, 0.55]}>
          <sphereGeometry args={[1, 10, 7]} />
          <meshBasicMaterial color="#294a4d" toneMapped={false} />
        </mesh>
        {[-0.43, 0.43].map(z => (
          <group key={z}>
            <mesh position={[-1.05, -0.18, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.27, 0.34, 3.7, 10]} />
              <meshBasicMaterial color="#747e75" toneMapped={false} />
            </mesh>
            <mesh position={[-2.95, -0.18, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.23, 0.29, 0.25, 10]} />
              <meshBasicMaterial color="#ff8738" toneMapped={false} />
            </mesh>
            <mesh position={[-6.2, -0.18, z]} scale={[6.2, 0.055, 0.055]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color="#e8dfbf" transparent opacity={0.26} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        ))}
        {[-1.55, 1.55].map(z => (
          <mesh key={z} position={[-0.45, -0.42, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.13, 0.16, 2.1, 8]} />
            <meshBasicMaterial color="#465440" toneMapped={false} />
          </mesh>
        ))}
      </group>

      <group ref={bombRef} visible={false}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.22, 1.35, 8]} />
          <meshStandardMaterial color="#323a2b" emissive="#171d13" emissiveIntensity={0.5} metalness={0.55} roughness={0.5} />
        </mesh>
        <mesh position={[-0.78, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.23, 0.35, 8]} />
          <meshStandardMaterial color="#323a2b" />
        </mesh>
      </group>

      <group ref={fireGroupRef} visible={false}>
        <pointLight position={[0, 3.5, 0]} color="#ff682a" intensity={5} distance={20} decay={2} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
          <planeGeometry args={[NAPALM_STRIKE_LENGTH, NAPALM_STRIKE_WIDTH]} />
          <meshBasicMaterial color="#7f1f11" transparent opacity={0.48} depthWrite={false} />
        </mesh>
        <lineSegments position={[0, 0.075, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(NAPALM_STRIKE_LENGTH, 0.06, NAPALM_STRIKE_WIDTH)]} />
          <lineBasicMaterial ref={fireBorderMaterialRef} color="#ff8b32" transparent opacity={0.9} toneMapped={false} />
        </lineSegments>
        <mesh ref={flashRef} position={[0, 0.6, 0]}>
          <sphereGeometry args={[0.8, 12, 10]} />
          <meshBasicMaterial color="#ffe36a" transparent opacity={0.9} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
        {particles.map((particle, index) => (
          <mesh
            key={index}
            ref={node => { flameRefs.current[index] = node; }}
            renderOrder={70}
          >
            <sphereGeometry args={[1, 7, 6]} />
            <meshBasicMaterial
              color={particle.color}
              transparent
              opacity={0.94}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

interface OrdnanceEffectsProps {
  napalmStrikes: NapalmStrike[];
  onNapalmComplete: (id: number) => void;
}

export function OrdnanceEffects({
  napalmStrikes,
  onNapalmComplete,
}: OrdnanceEffectsProps) {
  return (
    <>
      {napalmStrikes.map(strike => (
        <NapalmStrikeVisual key={strike.id} strike={strike} onComplete={onNapalmComplete} />
      ))}
    </>
  );
}
