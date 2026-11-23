import {useEffect,useMemo} from 'react';
import {useFrame} from '@react-three/fiber';
import {MathUtils} from 'three';
import type {ArmedFileInk} from './armedFileInk';

export function HutReleaseRing({ink,scale,groundY,progress,path}:{
  ink:ArmedFileInk;scale:number;groundY:number;progress:Map<string,number>;path:string;
}){
  const {material,initialOpacity}=useMemo(()=>{
    const fade=ink.ring.material.clone();
    fade.onBeforeCompile=ink.ring.material.onBeforeCompile;
    fade.customProgramCacheKey=ink.ring.material.customProgramCacheKey;
    return {material:fade,initialOpacity:fade.opacity};
  },[ink]);
  useEffect(()=>()=>material.dispose(),[material]);
  useFrame(()=>{
    material.opacity=initialOpacity*(1.-MathUtils.smoothstep(progress.get(path)??0,0,1));
  });
  return <mesh name="releasing-hut-ring" position-y={groundY} rotation-x={-Math.PI/2}
    scale={scale} geometry={ink.ring.geometry} material={material} dispose={null}/>;
}
