import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ZOMBIE_MAX_ACTIVE, type ZombieDamageResult } from '../../lib/zombieEpilogue';

const lifetime = 3.2;
const glyph = [
  '....#####....',
  '...#######...',
  '..#########..',
  '..##..#..##..',
  '..##..#..##..',
  '...###.###...',
  '....#.#.#....',
  '.............',
  '.##.......##.',
  '###.......###',
  '...##...##...',
  '.....###.....',
  '...##...##...',
  '###.......###',
  '.##.......##.',
];

function makeSkullTexture() {
  const width = glyph[0].length + 2, height = glyph.length + 2;
  const pixels = new Uint8Array(width * height * 4);
  const bone = (x: number, y: number) => glyph[y]?.[x] === '#';
  for (let y = -1; y <= glyph.length; y++) {
    for (let x = -1; x <= glyph[0].length; x++) {
      const offset = 4 * ((height - 2 - y) * width + x + 1);
      if (bone(x, y)) {
        pixels.set(bone(x, y - 1) ? [209, 198, 167, 255] : [247, 237, 208, 255], offset);
      } else if (bone(x - 1, y) || bone(x + 1, y) || bone(x, y - 1) || bone(x, y + 1)) {
        pixels.set([43, 39, 43, 240], offset);
      }
    }
  }
  const map = new THREE.DataTexture(pixels, width, height);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;
  return map;
}

export function createUndeadDeathMarks() {
  const slots = Array.from({ length: ZOMBIE_MAX_ACTIVE }, () => ({
    position: new THREE.Vector3(), born: -Infinity,
  }));
  let cursor = 0;
  return {
    slots,
    onKilled({ zombie, position }: ZombieDamageResult) {
      const mark = slots[cursor];
      cursor = (cursor + 1) % slots.length;
      mark.position.copy(position);
      mark.position.y += (zombie.archetype === 'boss' ? 1.94 : 1.64) * zombie.visualScale + 0.20;
      mark.born = performance.now() / 1000;
    },
  };
}

export function UndeadDeathMarks({ feed }: { feed: ReturnType<typeof createUndeadDeathMarks> }) {
  const uniforms = useMemo(() => ({ glyph: { value: makeSkullTexture() } }), []);
  const geometry = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(quad.index);
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    g.setAttribute('mark', new THREE.InstancedBufferAttribute(new Float32Array(ZOMBIE_MAX_ACTIVE * 4), 4)
      .setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    return g;
  }, []);
  useEffect(() => () => { geometry.dispose(); uniforms.glyph.value.dispose(); }, [geometry, uniforms]);

  useFrame(() => {
    const now = performance.now() / 1000, marks = geometry.getAttribute('mark');
    let count = 0;
    for (const slot of feed.slots) {
      const age = now - slot.born;
      if (age >= lifetime) continue;
      const height = 0.16 * age + 0.075 * Math.sin(age * 5.4);
      const opacity = 1 - THREE.MathUtils.smoothstep(age, 0.55, lifetime);
      marks.setXYZW(count++, slot.position.x, slot.position.y + height, slot.position.z, opacity);
    }
    geometry.instanceCount = count;
    if (count) marks.needsUpdate = true;
  });

  return <mesh name="undead-death-marks" frustumCulled={false} renderOrder={83}>
    <primitive object={geometry} attach="geometry" />
    <shaderMaterial uniforms={uniforms} transparent depthTest depthWrite={false} toneMapped={false}
      vertexShader={`
        attribute vec4 mark;
        varying vec2 tile;
        varying float opacity;
        void main(){
          vec4 eye = modelViewMatrix * vec4(mark.xyz, 1.);
          vec4 clip = projectionMatrix * eye;
          // Keep the stamp small close to the tank and legible across the river.
          float height = clamp(.49 * projectionMatrix[1][1] / max(.1, -eye.z), .024, .035);
          vec2 aspect = vec2((15./17.) * projectionMatrix[0][0] / projectionMatrix[1][1], 1.);
          clip.xy += position.xy * aspect * height * clip.w;
          gl_Position = clip;
          tile = uv;
          opacity = mark.w;
        }`}
      fragmentShader={`
        uniform sampler2D glyph;
        varying vec2 tile;
        varying float opacity;
        void main(){
          vec4 ink = texture2D(glyph, tile);
          if (ink.a == 0.) discard;
          gl_FragColor = vec4(ink.rgb, ink.a * opacity);
          #include <colorspace_fragment>
        }`} />
  </mesh>;
}
