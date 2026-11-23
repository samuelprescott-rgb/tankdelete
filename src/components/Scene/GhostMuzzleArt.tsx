import { useEffect, useMemo } from 'react';
import { makeGhostRoundGeo, makeSmgFlash } from './ghostRoundArt';
// Child of the existing physical muzzle. Sizes are in model units.
export function GhostMuzzleArt({width,length,automatic=false}:{width:number;length:number;automatic?:boolean}){
  const geometry=useMemo(()=>automatic ? makeSmgFlash(width,length) : makeGhostRoundGeo('flash').scale(width,length,width),[width,length,automatic]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <><primitive object={geometry} attach="geometry"/><meshBasicMaterial vertexColors toneMapped={false} depthWrite={false}/></>;
}
