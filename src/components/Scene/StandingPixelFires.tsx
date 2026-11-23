import { useLayoutEffect, useMemo, useRef } from 'react';
import * as T from 'three';
import { PixelFireVolume } from './PixelFireVolume';
import { FloatingFireSmoke, useFireSmokeArt } from './CharcoalCloud';

type Point = [number, number, number];
export interface StandingFire {
  position: Point;
  scale: Point;
  yaw?: number;
  frame?: number;
  smoke?: {
    name: string;
    offset: number;
    scale: Point;
    wind: readonly [number, number]; // Displacement in parent space at full height.
    phase: number;
  };
}

export function pixelFlameScale(size:number): Point {
  return [size * 1.42, size * 1.35, size * .90];
}

function StandingSmoke({sources, daylightHaze}:{sources:readonly StandingFire[]; daylightHaze:boolean}) {
  const art=useFireSmokeArt({daylightHaze});
  return <>{sources.map(({position,smoke})=>smoke && <FloatingFireSmoke key={smoke.name} name={smoke.name}
    art={art} position={[position[0],position[1]+smoke.offset,position[2]]}
    scale={smoke.scale} wind={smoke.wind} phase={smoke.phase}/>)}</>;
}

type StandingBatchProps = {sources:readonly StandingFire[]; name:string; phase?:number; daylightHaze?:boolean; emission?:number};

/** Batched, world-anchored volumes share their atlas and camera-dependent depth slices. */
export function StandingFireVolumes({sources, name, phase=0, daylightHaze=false, emission, form='flame'}:
  StandingBatchProps & {form?:'flame'|'smoke'}) {
  const volume = useRef<T.InstancedMesh>(null);
  const frameOffsets = useMemo(() => sources.some(p => p.frame !== undefined)
    ? sources.map((p,i) => p.frame ?? i*7) : undefined, [sources]);
  useLayoutEffect(() => {
    const mesh = volume.current;
    if (!mesh) return;
    const matrix = new T.Matrix4(), scale = new T.Vector3();
    const bounds = new T.Box3();
    const local = new T.Box3(new T.Vector3(-.5,0,-.5), new T.Vector3(.5,1,.5)), box = new T.Box3();
    sources.forEach((source, i) => {
      matrix.makeRotationY(source.yaw ?? 0).scale(scale.fromArray(source.scale)).setPosition(...source.position);
      mesh.setMatrixAt(i, matrix);
      bounds.union(box.copy(local).applyMatrix4(matrix));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = bounds.getBoundingSphere(new T.Sphere());
    mesh.frustumCulled = true;
  }, [sources]);
  return <PixelFireVolume form={form} meshRef={volume} name={name} capacity={sources.length} timeOffset={phase}
    frameOffsets={frameOffsets} daylightHaze={daylightHaze} emission={emission} renderOrder={form==='smoke'?2.5:3}/>;
}

export function StandingPixelFires(props:StandingBatchProps) {
  return <>
    <StandingFireVolumes {...props}/>
    {props.sources.some(source=>source.smoke) && <StandingSmoke sources={props.sources} daylightHaze={!!props.daylightHaze}/>}
  </>;
}
