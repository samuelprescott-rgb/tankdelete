import {useEffect, useMemo, type RefObject} from 'react';
import {useFrame, useLoader} from '@react-three/fiber';
import * as T from 'three';
import {sampleRiverStation, type RiverStation} from './riverLayout';

const BIRD_COUNT = 7;
const STEP = 1 / 30;
const FLIGHT_SECONDS = 6.8;
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 3;

export function RiverReedFlock({river, tankRef, running}: {
  river: RiverStation[];
  tankRef: RefObject<T.Group | null>;
  running: boolean;
}) {
  const atlas = useLoader(T.TextureLoader, '/images/textures/river-reed-birds.png');
  const flock = useMemo(() => {
    const bank = sampleRiverStation(river, 9)!;
    const roost = new T.Vector3(bank.centerX + bank.mudHalfWidth, .12, bank.z);
    const geometry = new T.PlaneGeometry(1, 1);
    const tile = new T.InstancedBufferAttribute(new Float32Array(BIRD_COUNT * 2), 2)
      .setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('birdTile', tile);
    atlas.colorSpace = T.SRGBColorSpace;
    atlas.magFilter = atlas.minFilter = T.NearestFilter;
    atlas.generateMipmaps = false;
    const material = new T.MeshBasicMaterial({map: atlas, color: '#bebaa7', alphaTest: .5, side: T.DoubleSide});
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute vec2 birdTile;\n' + shader.vertexShader.replace(
        '#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = (vMapUv + birdTile) / vec2(${ATLAS_COLUMNS}.0, ${ATLAS_ROWS}.0);`);
    };
    const mesh = new T.InstancedMesh(geometry, material, BIRD_COUNT);
    mesh.name = 'river-reed-flock';
    mesh.position.copy(roost);
    mesh.visible = false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.boundingSphere = new T.Sphere(new T.Vector3(0, 5, 0), 40);

    const birds = Array.from({length:BIRD_COUNT}, (_, i) => ({
      position: new T.Vector3(), velocity: new T.Vector2(), steer: new T.Vector2(),
      delay: ((i * 5) % BIRD_COUNT) * .065, phase: i * .33,
    }));
    const stamp = new T.Object3D(), cameraRight = new T.Vector3(), escape = new T.Vector2();
    let age = 0, accumulator = 0, armed = true;

    function start(tank: T.Vector3) {
      escape.set(roost.x - tank.x, roost.z - tank.z);
      if (escape.lengthSq() < .01) escape.set(-1, 0);
      escape.normalize();
      birds.forEach((bird, i) => {
        const fan = (i - 3) * .16;
        bird.position.set(Math.sin(i * 2.4) * 1.35, .04, Math.cos(i * 2.4) * .85);
        bird.velocity.set(escape.x - escape.y * fan, escape.y + escape.x * fan).multiplyScalar(3.7);
      });
      age = 0;
      accumulator = 0;
      armed = false;
      mesh.visible = true;
    }

    function step() {
      age += STEP;
      // Local separation, alignment and cohesion from Boids Over Meadow.
      // Read the same positions for every bird before advancing the flock.
      for (const bird of birds) {
        const steer = bird.steer.set(0, 0);
        if (age < bird.delay) continue;
        let neighbors = 0;
        for (const other of birds) {
          if (other === bird || age < other.delay) continue;
          const dx = other.position.x - bird.position.x, dz = other.position.z - bird.position.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 16) continue;
          const pull = .38 - (d2 < 1.8 ? 3.5 / (.12 + d2) : 0);
          steer.x += dx * pull + .65 * (other.velocity.x - bird.velocity.x);
          steer.y += dz * pull + .65 * (other.velocity.y - bird.velocity.y);
          neighbors++;
        }
        if (neighbors) steer.multiplyScalar(1 / neighbors);
        steer.x += .62 * (4.6 * escape.x - bird.velocity.x);
        steer.y += .62 * (4.6 * escape.y - bird.velocity.y);
      }
      for (const bird of birds) {
        const flight = age - bird.delay;
        if (flight < 0) continue;
        bird.velocity.addScaledVector(bird.steer, STEP);
        bird.position.x += bird.velocity.x * STEP;
        bird.position.z += bird.velocity.y * STEP;
        bird.position.y = .04 + 2.7 * (1 - Math.exp(-flight * 1.45)) + flight * (.62 + .22 * bird.phase)
          + .10 * Math.sin(flight * 7 + bird.phase);
      }
    }

    function update(dt: number, tank: T.Vector3, camera: T.Camera) {
      const distance = (tank.x - roost.x) ** 2 + (tank.z - roost.z) ** 2;
      if (!mesh.visible) {
        if (distance > 15 ** 2) armed = true;
        if (!armed || distance > 8 ** 2) return;
        start(tank);
      }
      accumulator += Math.min(dt, .1);
      while (accumulator >= STEP) { step(); accumulator -= STEP; }
      if (age >= FLIGHT_SECONDS) { mesh.visible = false; return; }
      cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
      birds.forEach((bird, i) => {
        const flight = age - bird.delay;
        const frame = Math.floor((Math.max(0, flight) + bird.phase) * 10) % (ATLAS_COLUMNS * ATLAS_ROWS);
        tile.setXY(i, frame % ATLAS_COLUMNS, ATLAS_ROWS - 1 - Math.floor(frame / ATLAS_COLUMNS));
        const size = (.46 + .025 * (i % 3)) * T.MathUtils.smoothstep(flight, 0, .18)
          * (1 - T.MathUtils.smoothstep(age, FLIGHT_SECONDS - .9, FLIGHT_SECONDS));
        const left = bird.velocity.x * cameraRight.x + bird.velocity.y * cameraRight.z < 0;
        stamp.position.copy(bird.position);
        stamp.quaternion.copy(camera.quaternion);
        stamp.scale.set(left ? -size : size, size, 1);
        stamp.updateMatrix();
        mesh.setMatrixAt(i, stamp.matrix);
      });
      tile.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    }

    return {mesh, update, dispose() { mesh.dispose(); geometry.dispose(); material.dispose(); }};
  }, [atlas, river]);

  useEffect(() => () => flock.dispose(), [flock]);
  useFrame(({camera}, dt) => {
    if (running && tankRef.current) flock.update(dt, tankRef.current.position, camera);
  });
  return <primitive object={flock.mesh} />;
}
