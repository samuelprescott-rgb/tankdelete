import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame,useLoader} from '@react-three/fiber';
import * as T from 'three';
import { CHARCOAL_TEXTURE } from './rollingSmoke';
import { createSmokeFoldArt, SMOKE_FOLDS } from './pixelSmokeFold';
import { createFireSmokePlume, updateFireSmokePlume } from './cloudDensity';

type Point=readonly [number,number,number];

type SmokeArtOptions = {airInk?:string; rollRate?:number; airStrength?:number; daylightHaze?:boolean};

export function useFireSmokeArt({airInk, rollRate=1, airStrength=1, daylightHaze=false}:SmokeArtOptions={}){
  const atlas=useLoader(T.TextureLoader,CHARCOAL_TEXTURE);
  const art=useMemo(()=>{
    const time={value:0};
    const fold=createSmokeFoldArt(SMOKE_FOLDS,time,atlas,airInk);
    if(daylightHaze){
      fold.material.fog=true;
      Object.assign(fold.material.uniforms,T.UniformsUtils.clone(T.UniformsLib.fog));
    }
    if(airInk)fold.material.uniforms.airStrength.value=airStrength;
    return {time,rollRate,...fold};
  },[atlas,airInk,rollRate,airStrength,daylightHaze]);
  useEffect(()=>()=>{art.geometry.dispose();art.material.dispose();},[art]);
  useFrame(({clock})=>{art.time.value=clock.elapsedTime*rollRate;});
  return art;
}

/** Fixed fuel pocket. Instances move locally so their painted undersides track height above the fire. */
export function FloatingFireSmoke({art,name,position,scale,wind,phase,renderOrder=4,riverbank=false,preburnSeconds=0}:{
  art:ReturnType<typeof useFireSmokeArt>;name?:string;position?:Point;scale:Point;
  wind:readonly [number,number];phase:number;renderOrder?:number;riverbank?:boolean;preburnSeconds?:number;
}){
  const mesh=useRef<T.InstancedMesh>(null), ignition=useRef<number|null>(null);
  const dx=wind[0]/scale[0], dz=wind[1]/scale[2];
  const folds=useMemo(()=>createFireSmokePlume(phase,dx,dz,riverbank),[phase,dx,dz,riverbank]);
  useLayoutEffect(()=>{
    const plume=mesh.current;
    if(!plume)return;
    plume.instanceMatrix.setUsage(T.DynamicDrawUsage);
    plume.boundingSphere=new T.Sphere(new T.Vector3(dx*.5,3.7,dz*.5),Math.hypot(dx*.5,3.7,dz*.5)+7);
  },[dx,dz]);
  useFrame(({clock})=>{
    if(!mesh.current)return;
    ignition.current??=clock.elapsedTime;
    updateFireSmokePlume(mesh.current,folds,preburnSeconds+clock.elapsedTime-ignition.current,clock.elapsedTime*art.rollRate+phase);
  });
  return <instancedMesh ref={mesh} name={name} position={position} scale={scale} count={0}
    args={[art.geometry,art.material,SMOKE_FOLDS]} renderOrder={renderOrder}/>;
}

/** Standalone plume sized in world units. Use a shared art handle for batches of fires. */
export function CharcoalCloud({position,size,wind,phase,name,airInk,riverbank=false,preburnSeconds=0}:{
  name?:string;position:Point;size:Point;wind:readonly [number,number];phase:number;airInk?:string;riverbank?:boolean;preburnSeconds?:number;
}){
  const art=useFireSmokeArt({airInk, rollRate:riverbank ? .42 : 1, airStrength:riverbank ? .54 : 1});
  return <FloatingFireSmoke art={art} name={name} position={position}
    scale={[size[0]/3.4,size[1]/6.5,size[2]/3.4]} wind={wind} phase={phase} riverbank={riverbank} preburnSeconds={preburnSeconds} renderOrder={riverbank?4:2}/>;
}
