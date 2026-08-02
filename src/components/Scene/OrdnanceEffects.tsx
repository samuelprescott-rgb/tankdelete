import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FlameBurst, NapalmStrike } from '../../lib/weapons';

const FLAME_PARTICLES = 72;
const NAPALM_PARTICLES = 120;

interface FlameBurstVisualProps {
  burst: FlameBurst;
  onComplete: (id: number) => void;
}

function FlameBurstVisual({ burst, onComplete }: FlameBurstVisualProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);

  const origin = useMemo(() => new THREE.Vector3(...burst.origin), [burst.origin]);
  const direction = useMemo(() => new THREE.Vector3(...burst.direction).normalize(), [burst.direction]);
  const right = useMemo(() => {
    const value = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
    return value.lengthSq() < 0.001 ? new THREE.Vector3(1, 0, 0) : value.normalize();
  }, [direction]);
  const up = useMemo(() => new THREE.Vector3().crossVectors(right, direction).normalize(), [right, direction]);
  const particles = useMemo(() => Array.from({ length: FLAME_PARTICLES }, (_, index) => ({
    distance: 1 + Math.random() * 9,
    spreadX: (Math.random() - 0.5) * 0.95,
    spreadY: (Math.random() - 0.25) * 0.65,
    size: 0.08 + Math.random() * 0.2,
    phase: index * 0.37 + Math.random() * Math.PI,
    color: new THREE.Color(index % 3 === 0 ? '#ffd15c' : index % 2 === 0 ? '#ff8a32' : '#e34b24'),
  })), []);

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    elapsedRef.current += delta;
    const age = elapsedRef.current;
    const lifeProgress = Math.min(age / 0.75, 1);
    const reach = Math.min(age * 7, 1);

    particles.forEach((particle, index) => {
      const distance = particle.distance * reach;
      const cone = distance * 0.09;
      const flicker = 0.82 + Math.sin(age * 24 + particle.phase) * 0.18;

      position.copy(origin)
        .addScaledVector(direction, distance)
        .addScaledVector(right, particle.spreadX * cone)
        .addScaledVector(up, particle.spreadY * cone + Math.sin(age * 9 + particle.phase) * 0.06);

      const particleScale = particle.size * flicker * Math.max(0.05, 1 - lifeProgress * 0.85);
      scale.set(particleScale, particleScale * 1.7, particleScale);
      matrix.compose(position, quaternion, scale);
      meshRef.current!.setMatrixAt(index, matrix);
      meshRef.current!.setColorAt(index, particle.color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;

    if (age >= 0.75 && !completedRef.current) {
      completedRef.current = true;
      onComplete(burst.id);
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, FLAME_PARTICLES]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial
        vertexColors
        emissive="#ff5a1f"
        emissiveIntensity={2.3}
        transparent
        opacity={0.88}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

interface NapalmStrikeVisualProps {
  strike: NapalmStrike;
  onComplete: (id: number) => void;
}

function NapalmStrikeVisual({ strike, onComplete }: NapalmStrikeVisualProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);
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

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    elapsedRef.current += delta;
    const age = elapsedRef.current;

    particles.forEach((particle, index) => {
      const localAge = (age + particle.phase) % 1.25;
      const life = localAge / 1.25;
      const lick = Math.sin(age * 12 + particle.angle * 3) * 0.16;

      position.set(
        Math.cos(particle.angle) * particle.radius + lick,
        0.1 + life * particle.rise,
        Math.sin(particle.angle) * particle.radius - lick,
      );
      const particleScale = particle.size * (1 - life) * (0.75 + Math.sin(age * 18 + index) * 0.25);
      scale.set(particleScale, particleScale * 2.4, particleScale);
      matrix.compose(position, quaternion, scale);
      meshRef.current!.setMatrixAt(index, matrix);
      meshRef.current!.setColorAt(index, particle.color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;

    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = Math.max(0, 0.6 - age * 0.12);
    }
    if (flashRef.current) {
      const flashScale = 1 + Math.min(age, 0.5) * 8;
      flashRef.current.scale.setScalar(flashScale);
      const material = flashRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.75 - age * 1.8);
    }

    if (age >= 4.5 && !completedRef.current) {
      completedRef.current = true;
      onComplete(strike.id);
    }
  });

  return (
    <group position={strike.position}>
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
  );
}

interface OrdnanceEffectsProps {
  flameBursts: FlameBurst[];
  napalmStrikes: NapalmStrike[];
  onFlameComplete: (id: number) => void;
  onNapalmComplete: (id: number) => void;
}

export function OrdnanceEffects({
  flameBursts,
  napalmStrikes,
  onFlameComplete,
  onNapalmComplete,
}: OrdnanceEffectsProps) {
  return (
    <>
      {flameBursts.map(burst => (
        <FlameBurstVisual key={burst.id} burst={burst} onComplete={onFlameComplete} />
      ))}
      {napalmStrikes.map(strike => (
        <NapalmStrikeVisual key={strike.id} strike={strike} onComplete={onNapalmComplete} />
      ))}
    </>
  );
}
