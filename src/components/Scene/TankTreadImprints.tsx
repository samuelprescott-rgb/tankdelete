import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { alreadyPressed, createImprintSoil, createImprintState, resetImprints, stepImprints, TREAD_CAPACITY,
  writeImprintVertices } from '../../lib/tankTreadImprints';
import type { RiverStation } from './riverLayout';
import { isInsidePaddy } from './VietnamEnvironment';

const tileSize = 64;
const saturate = (x: number) => Math.max(0, Math.min(1, x));
const stroke = (distance: number, solid: number, feather: number) =>
  saturate((solid + feather - Math.abs(distance)) / feather);

/** Four original clay impressions. Each shoe pushes an asymmetric lip ahead
 * of the vee, with chipped corners, a damp pad hollow, and broken pin ends.
 * The wash multiplies existing earth/grass-shadow colour; never glows at night. */
function paintShoes() {
  const size = tileSize * 2, rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const variant = (x >= tileSize ? 1 : 0) + (y >= tileSize ? 2 : 0);
    const u = ((x % tileSize + .5) / tileSize - .5) * 2;
    const v = ((y % tileSize + .5) / tileSize - .5) * 2;
    const brush = Math.sin(13 * u + 4 * v + 7 * variant) * Math.sin(9 * v - 3 * u)
      + .37 * Math.sin(25 * u - 16 * v + variant);
    const grain = Math.sin((x * 11.17 + y * 31.42) * 1.43);
    const across = Math.abs(u + .017 * brush);
    const edge = stroke(across, .70 + .025 * brush, .24);
    const shoeZ = v + (v < 0 ? .5 : -.5);
    const vee = shoeZ - (.19 - .45 * across + .038 * brush);
    const clipped = stroke(across, .54 + .035 * brush, .16);
    const channel = clipped * stroke(vee, .092, .12);
    const rolledLip = clipped * stroke(vee - .17, .022, .084);
    const pin = stroke(across - .75, .032, .065) * stroke(shoeZ + .20, .055, .12);
    const dryBreak = saturate(.78 + .19 * brush + .09 * grain);
    const bed = .24 + .065 * Math.cos(6.3 * shoeZ) + .085 * brush;
    const coverage = edge * saturate(bed + (channel * .70 + pin * .48) * dryBreak - rolledLip * .23)
      * stroke(v, .96, .04);
    const i = (y * size + x) * 4;
    // Linear multiplicative pigment. The cooler cavity absorbs more of
    // the warm soil; the ridge is simply the original, uncompressed earth.
    rgba[i] = 123 + 11 * brush - 48 * channel;
    rgba[i + 1] = 113 + 10 * brush - 41 * channel;
    rgba[i + 2] = 100 + 9 * brush - 26 * channel;
    rgba[i + 3] = Math.round(coverage * 255);
  }
  const map = new THREE.DataTexture(rgba, size, size);
  map.name = 'Original pressed-clay shoe studies';
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

export function createImprintBatch() {
  const vertices = new Float32Array(TREAD_CAPACITY * 27);
  const position = new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage);
  const uv = new Float32Array(TREAD_CAPACITY * 18), indices = new Uint16Array(TREAD_CAPACITY * 24);
  for (let slot = 0; slot < TREAD_CAPACITY; slot++) {
    const tile = (slot ^ (slot >>> 2)) & 3;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const v = slot * 9 + row * 3 + col;
      uv[2 * v] = ((tile & 1) + (.5 + col * .5 * (tileSize - 1)) / tileSize) / 2;
      uv[2 * v + 1] = ((tile >>> 1) + (.5 + row * .5 * (tileSize - 1)) / tileSize) / 2;
      if (row < 2 && col < 2) indices.set([v, v + 3, v + 1, v + 1, v + 3, v + 4], slot * 24 + (row * 2 + col) * 6);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const map = paintShoes();
  const material = new THREE.MeshBasicMaterial({
    map, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
    depthWrite: false, fog: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  return { geometry, material, vertices,
    update(first: number, written: number, count: number) {
      geometry.setDrawRange(0, count * 24);
      if (!count) position.clearUpdateRanges();
      if (!written) return;
      const run = Math.min(written, TREAD_CAPACITY - first);
      position.addUpdateRange(first * 27, run * 27);
      if (run < written) position.addUpdateRange(0, (written - run) * 27);
      position.needsUpdate = true;
    },
    dispose() { geometry.dispose(); material.dispose(); map.dispose(); },
  };
}

export function TankTreadImprints({ tankRef, river, seed, embassy, resetPosition }: {
  tankRef: RefObject<THREE.Group | null>; river: RiverStation[]; seed: number;
  embassy: boolean; resetPosition: readonly number[];
}) {
  const mesh = useRef<THREE.Mesh>(null), previous = useRef<THREE.Group | null>(null);
  const batch = useMemo(createImprintBatch, []);
  const state = useMemo(createImprintState, []);
  const soil = useMemo(() => createImprintSoil(river, seed, embassy, isInsidePaddy), [river, seed, embassy]);
  const write = useMemo(() => (slot: number, x: number, z: number, yaw: number) => {
    if (alreadyPressed(batch.vertices, state, x, z, yaw)) return false;
    writeImprintVertices(batch.vertices, slot, x, z, yaw, soil.height);
  }, [batch, soil, state]);
  useLayoutEffect(() => {
    previous.current = null;
    resetImprints(state);
    batch.update(0, 0, 0);
    if (mesh.current) mesh.current.visible = false;
  }, [resetPosition, soil, state, batch]);
  useEffect(() => () => batch.dispose(), [batch]);
  useFrame((_, delta) => {
    const tank = tankRef.current, surface = mesh.current;
    if (!surface) return;
    if (tank !== previous.current || delta > .75) {
      previous.current = tank;
      resetImprints(state);
      batch.update(0, 0, 0);
      surface.visible = false;
    }
    if (!tank) return;
    // Tank writes the gameplay root in priority -1 before this subscriber;
    // it is a world-aligned scene sibling, independent of visual hull tilt.
    const start = state.cursor;
    const written = stepImprints(state, tank.position.x, tank.position.z, tank.rotation.y, soil.accepts, write);
    if (written || (!state.count && surface.visible)) {
      batch.update(start, written, state.count);
      surface.visible = state.count !== 0;
    }
  });
  return <mesh ref={mesh} name="tank-mud-impressions" geometry={batch.geometry} material={batch.material}
    dispose={null} frustumCulled={false} visible={false} renderOrder={1} />;
}
