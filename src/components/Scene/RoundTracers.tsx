import { createRef, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { WaterLightBatch, registerWaterLights } from './weaponWater';
import * as THREE from 'three';
import { tankTracerLength } from '../../lib/tankWeapons';
import { submitActiveTracers } from './activeTracerPrefix';
import { makeGhostRoundGeo } from './ghostRoundArt';

const layers = ['tail', 'core', 'nose'] as const;
const rifleInk = new THREE.Color('#fff1cb');
const shellInk = new THREE.Color('white');
const forward = new THREE.Vector3(0, 0, 1);
const trailRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

export function useRoundTracers(mixedAmmo = false) {
  return useMemo(() => {
    const refs = {
      tail: createRef<THREE.InstancedMesh>(),
      core: createRef<THREE.InstancedMesh>(),
      nose: createRef<THREE.InstancedMesh>(),
    };
    const waterLights=new WaterLightBatch();
    const transform = new THREE.Object3D();
    const heading = new THREE.Quaternion();

    function write(index: number, tip: THREE.Vector3, direction: THREE.Vector3, distance: number, machineGun = true) {
      const { tail, core, nose } = refs;
      if (!tail.current || !core.current || !nose.current) return;

      const length = tankTracerLength(machineGun, distance);
      const width = machineGun ? 0.068 : 0.12;
      waterLights.write(index,tip,direction,-length,machineGun ? .12 : .26,machineGun?0:1);
      heading.setFromUnitVectors(forward, direction);
      transform.position.copy(tip).addScaledVector(direction, -length / 2);
      transform.quaternion.copy(heading).multiply(trailRotation);
      transform.scale.set(width, length, width);
      transform.updateMatrix();
      core.current.setMatrixAt(index, transform.matrix);

      transform.scale.set(width * 2.4, length, width * 2.4);
      transform.updateMatrix();
      tail.current.setMatrixAt(index, transform.matrix);

      transform.position.copy(tip);
      transform.quaternion.copy(heading);
      transform.scale.setScalar(machineGun ? 0.10 : 0.165);
      transform.updateMatrix();
      nose.current.setMatrixAt(index, transform.matrix);

      if (mixedAmmo) {
        const color = machineGun ? rifleInk : shellInk;
        for (const layer of layers) refs[layer].current!.setColorAt(index, color);
      }
    }

    function submit(count: number) {
      waterLights.count=refs.core.current ? count : 0;
      for (const layer of layers) {
        const mesh = refs[layer].current;
        submitActiveTracers(mesh, count);
        if (count && mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }

    return { refs, mixedAmmo, write, submit, waterLights };
  }, [mixedAmmo]);
}

interface RoundTracersProps {
  batch: ReturnType<typeof useRoundTracers>;
  capacity: number;
}

export function RoundTracers({ batch, capacity }: RoundTracersProps) {
  const scene=useThree(s=>s.scene);
  useLayoutEffect(()=>registerWaterLights(scene,batch.waterLights),[scene,batch]);
  const geometry = useMemo(() => ({
    tail: makeGhostRoundGeo('tail'),
    core: makeGhostRoundGeo('core'),
    nose: makeGhostRoundGeo('nose'),
  }), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: batch.mixedAmmo ? shellInk : rifleInk,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  }), [batch.mixedAmmo]);

  useLayoutEffect(() => {
    for (const layer of layers) {
      const mesh = batch.refs[layer].current!;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
    }
  }, [batch, capacity]);

  useLayoutEffect(() => () => {
    for (const layer of layers) geometry[layer].dispose();
    material.dispose();
  }, [geometry, material]);

  return <>{layers.map((layer, index) => (
    <instancedMesh key={layer} name={'round-tracer-' + layer} ref={batch.refs[layer]}
      args={[geometry[layer], material, capacity]} frustumCulled={false} renderOrder={80 + index} />
  ))}</>;
}
