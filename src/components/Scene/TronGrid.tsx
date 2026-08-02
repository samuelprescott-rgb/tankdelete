import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROAD_GRID_SPACING } from '../../lib/constants';
import { GRID_COLOR } from '../../lib/colors';

const vertexShader = /* glsl */ `
  varying vec2 vWorldPos;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uGridSpacing;
  uniform vec3 uColor;

  varying vec2 vWorldPos;

  void main() {
    float spacing = uGridSpacing;

    // Distance to nearest grid line
    float dX = abs(mod(vWorldPos.x + spacing * 0.5, spacing) - spacing * 0.5);
    float dZ = abs(mod(vWorldPos.y + spacing * 0.5, spacing) - spacing * 0.5);

    // Broad dirt roads preserve the original tactical grid layout.
    float nearestRoad = min(dX, dZ);
    float road = 1.0 - smoothstep(1.05, 1.72, nearestRoad);
    float shoulder = 1.0 - smoothstep(1.55, 2.28, nearestRoad);

    // Twin vehicle ruts plus shallow animated water sheen.
    float rutA = 1.0 - smoothstep(0.1, 0.24, abs(nearestRoad - 0.42));
    float rutB = 1.0 - smoothstep(0.1, 0.24, abs(nearestRoad - 0.86));
    float ruts = max(rutA, rutB) * road;
    float wet = (sin(vWorldPos.x * 0.47 + vWorldPos.y * 0.31 + uTime * 0.18) * 0.5 + 0.5) * ruts;

    float grain = sin(vWorldPos.x * 2.7 + sin(vWorldPos.y * 1.8)) * 0.5 + 0.5;
    vec3 dryMud = vec3(0.035, 0.022, 0.01);
    vec3 wetMud = vec3(0.008, 0.014, 0.007);
    vec3 roadColor = mix(dryMud, wetMud, clamp(ruts * 0.75 + wet * 0.2, 0.0, 1.0));
    roadColor += uColor * grain * 0.006;

    // Distance fade
    float dist = length(vWorldPos) / 120.0;
    float fade = 1.0 - smoothstep(0.55, 1.0, dist);
    float alpha = max(road * 0.72, shoulder * 0.06) * fade;

    if (alpha < 0.005) discard;
    gl_FragColor = vec4(roadColor, alpha);
  }
`;

export function TronGrid() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uGridSpacing: { value: ROAD_GRID_SPACING },
    uColor: { value: new THREE.Color(GRID_COLOR) },
  }), []);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <planeGeometry args={[250, 250]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
