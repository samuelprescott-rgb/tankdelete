import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NapalmStrike } from '../../lib/weapons';

const NAPALM_PARTICLES = 120;

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
