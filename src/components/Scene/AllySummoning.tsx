import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { PILLAR_FPS, scenePillars } from './summoningLight';
import * as THREE from 'three';

export interface AllyArrival {
  arrivalAge: number | null;
  arrivalPosition: THREE.Vector3;
}

// Pixel FX holy/holy-pillar, exported at 12 fps. The pivot in each
// 192 × 232 tile is the centre of the sigil, at (96, 204) from the top.
const SHEET = '/images/textures/ally-holy-pillar.png';
const COLUMNS = 8, ROWS = 6, FRAME_COUNT = 43;

// The shafts reach the ground at .66 s and lift off again at 2.75 s.
export function summoningSpill(age: number) {
  return THREE.MathUtils.smoothstep(age, .30, .66) * (1 - THREE.MathUtils.smoothstep(age, 2.05, 2.75));
}

const pool = new THREE.CircleGeometry(1, 40);
const colors = new Float32Array(pool.attributes.position.count * 3);
colors.set([1, .64, .26]); // Additive falloff from the centre to an unlit perimeter.
pool.setAttribute('color', new THREE.BufferAttribute(colors, 3));

export function AllySummoning({ id, arrivals }: {
  id: string;
  arrivals: RefObject<ReadonlyMap<string, AllyArrival>>;
}) {
  const source = useLoader(THREE.TextureLoader, SHEET);
  const atlas = useMemo(() => {
    const texture = source.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(1 / COLUMNS, 1 / ROWS);
    return texture;
  }, [source]);
  useEffect(() => () => atlas.dispose(), [atlas]);
  const scene = useThree(state => state.scene);
  const sourceLight = useMemo(() => ({position: new THREE.Vector3(), age: -1, atlas}), [atlas]);
  useEffect(() => {
    const sources = scenePillars(scene);
    sources.add(sourceLight);
    return () => { sources.delete(sourceLight); };
  }, [scene, sourceLight]);
  const root = useRef<THREE.Group>(null);
  const ground = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const group = root.current;
    const arrival = arrivals.current.get(id);
    if (!group || !ground.current) return;
    const elapsed = arrival?.arrivalAge ?? Infinity;
    const frame = Math.floor(elapsed * PILLAR_FPS);
    group.visible = frame >= 0 && frame < FRAME_COUNT;
    sourceLight.age = group.visible && group.parent?.visible ? elapsed : -1;
    if (!group.visible || !arrival) return;
    group.position.copy(arrival.arrivalPosition);
    sourceLight.position.copy(arrival.arrivalPosition);
    atlas.offset.set(frame % COLUMNS / COLUMNS, 1 - (1 + Math.floor(frame / COLUMNS)) / ROWS);
    ground.current.opacity = .58 * summoningSpill(elapsed);
  });
  return <group ref={root} name={id + '-summoning'} visible={false}>
    <sprite center={[.5, 28 / 232]} position-y={.12} scale={[5.76, 6.96, 1]} renderOrder={4}>
      <spriteMaterial map={atlas} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
    <mesh name="summoning-ground-light" position-y={.05} scale={1.75} rotation-x={-Math.PI / 2}
      geometry={pool} renderOrder={3.5}>
      <meshBasicMaterial ref={ground} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  </group>;
}
