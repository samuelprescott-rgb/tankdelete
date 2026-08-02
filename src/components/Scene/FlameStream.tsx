import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const FLAME_PARTICLES = 96;

interface FlameStreamProps {
  active: boolean;
}

export function FlameStream({ active }: FlameStreamProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const elapsedRef = useRef(0);
  const intensityRef = useRef(0);
  const particles = useMemo(() => Array.from({ length: FLAME_PARTICLES }, (_, index) => ({
    offset: index / FLAME_PARTICLES,
    lane: (Math.random() - 0.5) * 2,
    lift: (Math.random() - 0.35) * 1.1,
    size: 0.07 + Math.random() * 0.18,
    speed: 0.72 + Math.random() * 0.55,
    phase: Math.random(),
    color: new THREE.Color(index % 5 === 0 ? '#fff0a3' : index % 2 === 0 ? '#ff9a32' : '#e34520'),
  })), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    elapsedRef.current += delta;
    intensityRef.current = THREE.MathUtils.damp(intensityRef.current, active ? 1 : 0, active ? 18 : 7, delta);
    const intensity = intensityRef.current;
    meshRef.current.visible = intensity > 0.015;
    if (!meshRef.current.visible) return;

    particles.forEach((particle, index) => {
      const travel = (particle.offset + elapsedRef.current * particle.speed) % 1;
      const distance = 0.35 + travel * 10.4;
      const cone = 0.035 + distance * 0.075;
      const flicker = 0.78 + Math.sin(elapsedRef.current * 29 + particle.phase * 18) * 0.22;

      position.set(
        particle.lane * cone,
        particle.lift * cone + travel * travel * 0.42,
        -distance,
      );

      const tailFade = Math.sin(Math.min(1, travel) * Math.PI) * intensity;
      const particleScale = Math.max(0.001, particle.size * flicker * tailFade);
      scale.set(particleScale, particleScale * 1.65, particleScale * 2.2);
      matrix.compose(position, quaternion, scale);
      meshRef.current!.setMatrixAt(index, matrix);
      meshRef.current!.setColorAt(index, particle.color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, FLAME_PARTICLES]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial
        vertexColors
        emissive="#ff571f"
        emissiveIntensity={2.5}
        transparent
        opacity={0.9}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
