import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ARENA_DEPTH,
  ARENA_HALF_DEPTH,
  ARENA_HALF_WIDTH,
  ARENA_PERIMETER_DEPTH,
  ARENA_WIDTH,
} from '../../lib/arenaBounds';
import { coordinateNoise } from './environmentGeneration';

const SKY_RADIUS = 260;

const skyVertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = /* glsl */ `
  uniform float uSeed;
  uniform float uTime;
  varying vec3 vDirection;

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + vec2(45.32 + uSeed));
    return fract(point.x * point.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 fraction = fract(point);
    fraction = fraction * fraction * (3.0 - 2.0 * fraction);
    return mix(
      mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), fraction.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), fraction.x),
      fraction.y
    );
  }

  float cloudNoise(vec2 point) {
    float value = valueNoise(point) * 0.58;
    value += valueNoise(point * 2.03 + vec2(3.1, -2.4)) * 0.28;
    value += valueNoise(point * 4.11 - vec2(5.7, 1.9)) * 0.14;
    return value;
  }

  void main() {
    vec3 direction = normalize(vDirection);
    float elevation = smoothstep(-0.1, 0.78, direction.y);
    vec3 rainHorizon = vec3(0.31, 0.38, 0.36);
    vec3 stormZenith = vec3(0.105, 0.16, 0.2);
    vec3 sky = mix(rainHorizon, stormZenith, elevation);

    // Two projected cloud decks create the deep, shelf-like monsoon ceiling
    // visible over the mountain references. They drift very slowly so the sky
    // feels alive without drawing attention away from combat.
    vec2 wind = vec2(uTime * 0.0021, -uTime * 0.0007);
    float lowProjection = max(0.19, direction.y + 0.33);
    vec2 lowUv = direction.xz / lowProjection * 0.72
      + vec2(uSeed * 9.0, -uSeed * 5.0) + wind;
    float lowWarp = valueNoise(lowUv * 0.32 + vec2(-2.7, 4.3));
    float lowField = cloudNoise(lowUv + (lowWarp - 0.5) * 0.78);
    float lowBand = smoothstep(0.015, 0.11, direction.y)
      * (1.0 - smoothstep(0.55, 0.78, direction.y));
    float cloudMass = smoothstep(0.44, 0.64, lowField) * lowBand;
    float cloudCore = smoothstep(0.59, 0.75, lowField) * lowBand;
    float cloudRelief = smoothstep(0.48, 0.66,
      lowField + valueNoise(lowUv * 3.1 + 7.4) * 0.12) * lowBand;
    float cloudRim = clamp(cloudRelief - cloudCore * 0.62, 0.0, 1.0);
    sky += vec3(0.055, 0.06, 0.055) * (lowField - 0.5) * lowBand;
    sky = mix(sky, vec3(0.125, 0.17, 0.185), cloudMass * 0.86);
    sky = mix(sky, vec3(0.33, 0.36, 0.345), cloudRim * 0.32);
    sky = mix(sky, vec3(0.075, 0.105, 0.125), cloudCore * 0.48);

    float highProjection = max(0.25, direction.y + 0.62);
    vec2 highUv = direction.xz / highProjection * 1.18
      + vec2(-uSeed * 6.0, uSeed * 8.0) - wind * 0.42;
    float highWarp = valueNoise(highUv * 0.38 + vec2(9.1, -3.7));
    float highField = cloudNoise(highUv + (highWarp - 0.5) * 0.36);
    float highBand = smoothstep(0.16, 0.34, direction.y);
    float highClouds = smoothstep(0.53, 0.69, highField) * highBand;
    float highCloudRim = smoothstep(0.49, 0.62, highField)
      * (1.0 - smoothstep(0.66, 0.79, highField)) * highBand;
    sky = mix(sky, vec3(0.11, 0.15, 0.17), highClouds * 0.5);
    sky = mix(sky, vec3(0.315, 0.345, 0.34), highCloudRim * 0.26);

    // Vertical rain curtains beneath the lowest cloud shelf add distant scale
    // without introducing particle or transparency cost inside the play area.
    float rainNoise = valueNoise(direction.xz * 18.0 + vec2(uSeed * 3.0, 2.4));
    float rainCurtain = smoothstep(0.48, 0.7, rainNoise)
      * (1.0 - smoothstep(0.03, 0.28, direction.y))
      * smoothstep(-0.07, 0.025, direction.y);
    sky = mix(sky, vec3(0.24, 0.3, 0.3), rainCurtain * 0.5);

    // The sun is diffused through cloud cover rather than rendered as a bright
    // disk, keeping the scene overcast while retaining readable directionality.
    vec3 sunDirection = normalize(vec3(-0.55, 0.68, 0.28));
    float sunAlignment = max(dot(direction, sunDirection), 0.0);
    float sunGlow = pow(sunAlignment, 7.0) * (1.0 - cloudMass * 0.72);
    sky += vec3(0.32, 0.35, 0.29) * sunGlow * 0.13;

    // Cool humid haze separates the forest, foothills, and remote ridgelines.
    float horizonHaze = 1.0 - smoothstep(-0.045, 0.2, direction.y);
    sky = mix(sky, rainHorizon, horizonHaze * 0.68);
    gl_FragColor = vec4(sky, 1.0);
  }
`;

interface HorizonBandOptions {
  amplitude: number;
  baseY: number;
  channel: number;
  detailFrequency?: number;
  detailStrength?: number;
  minimumHeight: number;
  peakPower?: number;
  radius: number;
  samples: number;
  seed: number;
}

function createHorizonBandGeometry({
  amplitude,
  baseY,
  channel,
  detailFrequency = 17,
  detailStrength = 0.1,
  minimumHeight,
  peakPower = 2.4,
  radius,
  samples,
  seed,
}: HorizonBandOptions) {
  const positions: number[] = [];
  const indices: number[] = [];
  const phaseA = coordinateNoise(channel, 0, seed, 901) * Math.PI * 2;
  const phaseB = coordinateNoise(channel, 0, seed, 902) * Math.PI * 2;
  const phaseC = coordinateNoise(channel, 0, seed, 903) * Math.PI * 2;
  const phaseD = coordinateNoise(channel, 0, seed, 904) * Math.PI * 2;

  for (let index = 0; index <= samples; index += 1) {
    const angle = index / samples * Math.PI * 2;
    const broad = Math.sin(angle * 2 + phaseA) * 0.5 + 0.5;
    const medium = Math.sin(angle * 5 + phaseB) * 0.5 + 0.5;
    const peaks = Math.pow(Math.sin(angle * 9 + phaseC) * 0.5 + 0.5, peakPower);
    const detail = Math.pow(
      Math.sin(angle * detailFrequency + phaseD) * 0.5 + 0.5,
      peakPower * 0.72,
    );
    const height = minimumHeight + amplitude * (
      broad * 0.4 + medium * 0.27 + peaks * 0.23 + detail * detailStrength
    );
    const radialNoise = Math.sin(angle * 7 + phaseB) * 1.4
      + Math.sin(angle * 13 + phaseC) * 0.65
      + Math.sin(angle * detailFrequency + phaseD) * detailStrength * 2.2;
    const sampleRadius = radius + radialNoise;
    const x = Math.cos(angle) * sampleRadius;
    const z = Math.sin(angle) * sampleRadius;
    positions.push(x, baseY, z, x, height, z);

    if (index < samples) {
      const lowerLeft = index * 2;
      const upperLeft = lowerLeft + 1;
      const lowerRight = lowerLeft + 2;
      const upperRight = lowerLeft + 3;
      indices.push(
        lowerLeft, lowerRight, upperLeft,
        lowerRight, upperRight, upperLeft,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

interface PerimeterCluster {
  color: number;
  position: [number, number, number];
  rotation: number;
  scale: [number, number, number];
}

function createPerimeterClusters(seed: number) {
  const clusters: PerimeterCluster[] = [];
  const countPerSide = Math.ceil(ARENA_WIDTH / 4.35);

  for (let side = 0; side < 4; side += 1) {
    for (let row = 0; row < 3; row += 1) {
      for (let index = 0; index < countPerSide; index += 1) {
        const key = side * 1000 + row * 100 + index;
        const progress = (index + 0.5) / countPerSide;
        const tangentialJitter = (coordinateNoise(key, row, seed, 930) - 0.5) * 2.2;
        const normalJitter = (coordinateNoise(key, row, seed, 931) - 0.5) * 1.35;
        const widthAxis = -ARENA_HALF_WIDTH + progress * ARENA_WIDTH + tangentialJitter;
        const depthAxis = -ARENA_HALF_DEPTH + progress * ARENA_DEPTH + tangentialJitter;
        const edgeOffset = -ARENA_PERIMETER_DEPTH * 0.28
          + row * ARENA_PERIMETER_DEPTH * 0.72
          + normalJitter;
        const sideSign = side < 2 ? -1 : 1;
        const x = side % 2 === 0
          ? widthAxis
          : sideSign * (ARENA_HALF_WIDTH + edgeOffset);
        const z = side % 2 === 0
          ? sideSign * (ARENA_HALF_DEPTH + edgeOffset)
          : depthAxis;
        const scaleY = 2.5 + coordinateNoise(key, row, seed, 932) * 3.7;
        clusters.push({
          color: Math.min(3, Math.floor(coordinateNoise(key, row, seed, 933) * 4)),
          position: [x, scaleY * 0.66 - 0.48, z],
          rotation: coordinateNoise(key, row, seed, 934) * Math.PI,
          scale: [
            2.7 + coordinateNoise(key, row, seed, 935) * 2.4,
            scaleY,
            2.7 + coordinateNoise(key, row, seed, 936) * 2.4,
          ],
        });
      }
    }
  }

  return clusters;
}

function SkyDome({ seed }: { seed: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    uSeed: { value: (Math.abs(seed) % 997) / 997 },
    uTime: { value: 0 },
  }), [seed]);

  useFrame(({ camera, clock }) => {
    if (meshRef.current) meshRef.current.position.copy(camera.position);
    uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh ref={meshRef} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

function LayeredHorizon({ seed }: { seed: number }) {
  const outerMountains = useMemo(() => createHorizonBandGeometry({
    amplitude: 27,
    baseY: -5,
    channel: 0,
    detailFrequency: 19,
    detailStrength: 0.08,
    minimumHeight: 14,
    peakPower: 2.8,
    radius: 148,
    samples: 128,
    seed,
  }), [seed]);
  const innerMountains = useMemo(() => createHorizonBandGeometry({
    amplitude: 17,
    baseY: -4,
    channel: 1,
    detailFrequency: 23,
    detailStrength: 0.11,
    minimumHeight: 9,
    peakPower: 3.1,
    radius: 121,
    samples: 112,
    seed,
  }), [seed]);
  const forestSilhouette = useMemo(() => createHorizonBandGeometry({
    amplitude: 9,
    baseY: -2,
    channel: 2,
    detailFrequency: 47,
    detailStrength: 0.22,
    minimumHeight: 8,
    peakPower: 1.65,
    radius: 98,
    samples: 160,
    seed,
  }), [seed]);

  useEffect(() => () => {
    outerMountains.dispose();
    innerMountains.dispose();
    forestSilhouette.dispose();
  }, [forestSilhouette, innerMountains, outerMountains]);

  return (
    <>
      <mesh geometry={outerMountains} renderOrder={-30}>
        <meshBasicMaterial color="#52635e" side={THREE.DoubleSide} fog />
      </mesh>
      <mesh geometry={innerMountains} renderOrder={-20}>
        <meshBasicMaterial color="#3c5548" side={THREE.DoubleSide} fog />
      </mesh>
      <mesh geometry={forestSilhouette} renderOrder={-10}>
        <meshBasicMaterial color="#1d3928" side={THREE.DoubleSide} fog />
      </mesh>
    </>
  );
}

function CombatSectorPerimeter({ seed }: { seed: number }) {
  const foliageRef = useRef<THREE.InstancedMesh>(null);
  const bermRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const clusters = useMemo(() => createPerimeterClusters(seed), [seed]);
  const foliageColors = useMemo(() => [
    new THREE.Color('#183923'),
    new THREE.Color('#24482a'),
    new THREE.Color('#31542f'),
    new THREE.Color('#3e6135'),
  ], []);

  useLayoutEffect(() => {
    if (!foliageRef.current || !bermRef.current) return;

    clusters.forEach((cluster, index) => {
      dummy.position.set(...cluster.position);
      dummy.rotation.set(0, cluster.rotation, 0);
      dummy.scale.set(...cluster.scale);
      dummy.updateMatrix();
      foliageRef.current!.setMatrixAt(index, dummy.matrix);
      foliageRef.current!.setColorAt(index, foliageColors[cluster.color]);
    });
    foliageRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    foliageRef.current.instanceMatrix.needsUpdate = true;
    if (foliageRef.current.instanceColor) foliageRef.current.instanceColor.needsUpdate = true;
    foliageRef.current.computeBoundingBox();
    foliageRef.current.computeBoundingSphere();

    const berms = [
      { x: 0, z: -ARENA_HALF_DEPTH, sx: ARENA_HALF_WIDTH + 4, sz: ARENA_PERIMETER_DEPTH * 0.72 },
      { x: 0, z: ARENA_HALF_DEPTH, sx: ARENA_HALF_WIDTH + 4, sz: ARENA_PERIMETER_DEPTH * 0.72 },
      { x: -ARENA_HALF_WIDTH, z: 0, sx: ARENA_PERIMETER_DEPTH * 0.72, sz: ARENA_HALF_DEPTH + 4 },
      { x: ARENA_HALF_WIDTH, z: 0, sx: ARENA_PERIMETER_DEPTH * 0.72, sz: ARENA_HALF_DEPTH + 4 },
    ];
    berms.forEach((berm, index) => {
      dummy.position.set(berm.x, -0.2, berm.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(berm.sx, 0.84, berm.sz);
      dummy.updateMatrix();
      bermRef.current!.setMatrixAt(index, dummy.matrix);
    });
    bermRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    bermRef.current.instanceMatrix.needsUpdate = true;
    bermRef.current.computeBoundingBox();
    bermRef.current.computeBoundingSphere();
  }, [clusters, dummy, foliageColors]);

  return (
    <>
      <instancedMesh ref={bermRef} args={[undefined, undefined, 4]} receiveShadow>
        <sphereGeometry args={[1, 12, 5]} />
        <meshStandardMaterial color="#34432b" emissive="#182318" emissiveIntensity={0.05} roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={foliageRef} args={[undefined, undefined, clusters.length]} receiveShadow={false} castShadow={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#ffffff"
          vertexColors
          emissive="#112b18"
          emissiveIntensity={0.09}
          roughness={1}
          flatShading
        />
      </instancedMesh>
    </>
  );
}

export function VietnamSkybox({ seed }: { seed: number }) {
  return (
    <>
      <SkyDome seed={seed} />
      <LayeredHorizon seed={seed} />
      <CombatSectorPerimeter seed={seed} />
    </>
  );
}
