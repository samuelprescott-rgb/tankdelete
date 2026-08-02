import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NapalmStrike } from '../../lib/weapons';

const NAPALM_PARTICLES = 120;
const JET_PASS_SECONDS = 3.6;
const BOMB_RELEASE_SECONDS = 1.12;
const NAPALM_IMPACT_SECONDS = 2.1;

interface NapalmStrikeVisualProps {
  strike: NapalmStrike;
  onComplete: (id: number) => void;
}

function NapalmStrikeVisual({ strike, onComplete }: NapalmStrikeVisualProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const strikeGroupRef = useRef<THREE.Group>(null);
  const jetRef = useRef<THREE.Group>(null);
  const bombRef = useRef<THREE.Group>(null);
  const fireGroupRef = useRef<THREE.Group>(null);
  const targetRingRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);
  const bombReleasePositionRef = useRef<THREE.Vector3 | null>(null);
  const particles = useMemo(() => Array.from({ length: NAPALM_PARTICLES }, (_, index) => ({
    angle: Math.random() * Math.PI * 2,
    radius: Math.sqrt(Math.random()) * 6.5,
    phase: Math.random() * 1.25,
    rise: 0.7 + Math.random() * 1.7,
    size: 0.07 + Math.random() * 0.22,
    color: new THREE.Color(index % 4 === 0 ? '#ffe07a' : index % 2 === 0 ? '#ff8a32' : '#e43f20'),
  })), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const cameraForward = useMemo(() => new THREE.Vector3(), []);
  const cameraRight = useMemo(() => new THREE.Vector3(), []);
  const flightWorldPosition = useMemo(() => new THREE.Vector3(), []);
  const flightLocalPosition = useMemo(() => new THREE.Vector3(), []);
  const impactPosition = useMemo(() => new THREE.Vector3(0, 0.2, 0), []);
  const jetForward = useMemo(() => new THREE.Vector3(1, 0, 0), []);

  useFrame(({ camera }, delta) => {
    if (!meshRef.current) return;

    elapsedRef.current += delta;
    const age = elapsedRef.current;
    const jetProgress = Math.min(age / JET_PASS_SECONDS, 1);

    if (jetRef.current && strikeGroupRef.current) {
      camera.getWorldDirection(cameraForward);
      cameraRight.crossVectors(camera.up, cameraForward).normalize();
      flightWorldPosition.copy(camera.position)
        .addScaledVector(cameraForward, 22 + (jetProgress - 0.5) * 6)
        .addScaledVector(camera.up, 5.2)
        .addScaledVector(cameraRight, -19 + jetProgress * 38);
      flightLocalPosition.copy(flightWorldPosition);
      strikeGroupRef.current.worldToLocal(flightLocalPosition);
      jetRef.current.position.copy(flightLocalPosition);
      jetRef.current.quaternion.setFromUnitVectors(jetForward, cameraRight);
      jetRef.current.rotation.z = Math.sin(jetProgress * Math.PI) * -0.08;

      if (age >= BOMB_RELEASE_SECONDS && !bombReleasePositionRef.current) {
        bombReleasePositionRef.current = flightLocalPosition.clone();
      }
    }

    if (bombRef.current) {
      const bombProgress = THREE.MathUtils.clamp(
        (age - BOMB_RELEASE_SECONDS) / (NAPALM_IMPACT_SECONDS - BOMB_RELEASE_SECONDS),
        0,
        1,
      );
      bombRef.current.visible = age >= BOMB_RELEASE_SECONDS && age < NAPALM_IMPACT_SECONDS;
      const releasePosition = bombReleasePositionRef.current ?? flightLocalPosition;
      bombRef.current.position.copy(releasePosition).lerp(impactPosition, bombProgress);
      bombRef.current.position.y += Math.sin(bombProgress * Math.PI) * -1.4;
      bombRef.current.rotation.z = age * 7;
    }

    if (targetRingRef.current) {
      targetRingRef.current.opacity = age < NAPALM_IMPACT_SECONDS
        ? 0.2 + Math.sin(age * 8) * 0.08
        : Math.max(0, 0.24 - (age - NAPALM_IMPACT_SECONDS) * 0.35);
    }

    const fireAge = age - NAPALM_IMPACT_SECONDS;
    if (fireGroupRef.current) fireGroupRef.current.visible = fireAge >= 0;
    if (fireAge < 0) return;

    particles.forEach((particle, index) => {
      const localAge = (fireAge + particle.phase) % 1.25;
      const life = localAge / 1.25;
      const lick = Math.sin(fireAge * 12 + particle.angle * 3) * 0.16;

      position.set(
        Math.cos(particle.angle) * particle.radius + lick,
        0.1 + life * particle.rise,
        Math.sin(particle.angle) * particle.radius - lick,
      );
      const particleScale = particle.size * (1 - life) * (0.75 + Math.sin(fireAge * 18 + index) * 0.25);
      scale.set(particleScale, particleScale * 2.4, particleScale);
      matrix.compose(position, quaternion, scale);
      meshRef.current!.setMatrixAt(index, matrix);
      meshRef.current!.setColorAt(index, particle.color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;

    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = Math.max(0, 0.6 - fireAge * 0.12);
    }
    if (flashRef.current) {
      const flashScale = 1 + Math.min(fireAge, 0.5) * 8;
      flashRef.current.scale.setScalar(flashScale);
      const material = flashRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.75 - fireAge * 1.8);
    }

    if (fireAge >= 4.5 && !completedRef.current) {
      completedRef.current = true;
      onComplete(strike.id);
    }
  });

  return (
    <group ref={strikeGroupRef} position={strike.position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <ringGeometry args={[6.2, 6.65, 48]} />
        <meshBasicMaterial ref={targetRingRef} color="#e3b341" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>

      <group ref={jetRef} scale={1.5}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.42, 0.58, 4.8, 10]} />
          <meshStandardMaterial color="#c1c2a5" emissive="#74785e" emissiveIntensity={0.55} metalness={0.62} roughness={0.34} />
        </mesh>
        <mesh position={[2.75, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.43, 1.35, 10]} />
          <meshStandardMaterial color="#cbc8a7" emissive="#7e7b5f" emissiveIntensity={0.5} metalness={0.68} roughness={0.3} />
        </mesh>
        <mesh position={[-0.35, -0.05, 0]} scale={[1.3, 0.08, 3.8]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#aeb398" emissive="#626b50" emissiveIntensity={0.48} metalness={0.58} roughness={0.42} />
        </mesh>
        <mesh position={[-2.25, 0.55, 0]} scale={[0.7, 1.15, 0.1]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#a7ac91" emissive="#5d654b" emissiveIntensity={0.48} metalness={0.56} roughness={0.44} />
        </mesh>
        <mesh position={[-2.55, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.42, 0.22, 10]} />
          <meshBasicMaterial color="#ff9a43" toneMapped={false} />
        </mesh>
        <mesh position={[-5.2, 0, 0]} scale={[5.2, 0.09, 0.09]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#e8d6a2" transparent opacity={0.36} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0.9, 0.32, 0]} scale={[0.8, 0.34, 0.55]}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial color="#48645e" emissive="#1c2d2b" emissiveIntensity={0.7} metalness={0.55} roughness={0.22} />
        </mesh>
        <mesh position={[-0.4, 0.04, 3.5]}>
          <sphereGeometry args={[0.09, 6, 6]} />
          <meshBasicMaterial color="#ff3d2e" toneMapped={false} />
        </mesh>
        <mesh position={[-0.4, 0.04, -3.5]}>
          <sphereGeometry args={[0.09, 6, 6]} />
          <meshBasicMaterial color="#62ff75" toneMapped={false} />
        </mesh>
      </group>

      <group ref={bombRef} visible={false}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.2, 1.2, 8]} />
          <meshStandardMaterial color="#31382a" metalness={0.6} roughness={0.5} />
        </mesh>
        <mesh position={[-0.7, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.22, 0.3, 8]} />
          <meshStandardMaterial color="#31382a" />
        </mesh>
      </group>

      <group ref={fireGroupRef} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <circleGeometry args={[6.8, 48]} />
          <meshBasicMaterial color="#6f2418" transparent opacity={0.34} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[5.8, 6.7, 48]} />
          <meshBasicMaterial ref={ringMaterialRef} color="#ff8a32" transparent opacity={0.6} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={flashRef} position={[0, 0.45, 0]}>
          <sphereGeometry args={[0.8, 12, 12]} />
          <meshBasicMaterial color="#ffd15c" transparent opacity={0.75} depthWrite={false} toneMapped={false} />
        </mesh>
        <instancedMesh ref={meshRef} args={[undefined, undefined, NAPALM_PARTICLES]} frustumCulled={false}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshStandardMaterial
            vertexColors
            emissive="#ff551f"
            emissiveIntensity={2.4}
            transparent
            opacity={0.9}
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
