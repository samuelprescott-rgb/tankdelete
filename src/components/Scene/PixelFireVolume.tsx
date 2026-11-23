import type { RefObject } from 'react';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import type { InstancedMesh } from 'three';
import { useFireVolume } from './fireVolume';

type Props = Pick<ThreeElements['instancedMesh'], 'name' | 'position' | 'scale' | 'rotation' |
  'count' | 'visible' | 'renderOrder' | 'matrixAutoUpdate'> & {
  form?: Parameters<typeof useFireVolume>[0];
  capacity?: number;
  daylightHaze?: boolean;
  emission?: number;
  timeOffset?: number;
  frameOffsets?: readonly number[];
  meshRef?: RefObject<InstancedMesh | null>;
};

/** Position is the bottom center in parent space. Scale is [width, height, depth].
 * Use one volume for a prop, or set capacity and write transforms via meshRef for a batch. */
export function PixelFireVolume({ form = 'flame', capacity = 1, timeOffset = 0, frameOffsets, daylightHaze = false, emission, meshRef, renderOrder = 6, ...pose }: Props) {
  const { geometry, material } = useFireVolume(form, frameOffsets, daylightHaze);
  useFrame(({ clock }) => {
    material.uniforms.time.value = clock.elapsedTime + timeOffset;
    material.uniforms.emission.value = emission ?? (form==='smoke'?1:1.48);
  });
  return <instancedMesh ref={meshRef} args={[geometry, material, capacity]} renderOrder={renderOrder}
    raycast={() => {}} frustumCulled={false} {...pose}/>;
}
