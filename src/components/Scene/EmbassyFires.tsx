import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as T from 'three';
import type { EmbassyFirePocket } from './annexFirelight';
import { StandingPixelFires, pixelFlameScale, type StandingFire } from './StandingPixelFires';

export function EmbassyFires({pockets}:{pockets:readonly EmbassyFirePocket[]}) {
  const light = useRef<T.PointLight>(null);
  const sources = useMemo(() => pockets.map(({id,position,size}, phase):StandingFire => {
    const scale = size/2.4;
    return {position, scale:pixelFlameScale(size), smoke:{name:id+'-pixel-smoke', offset:size*.20,
      scale:[scale,scale,scale], wind:[1.7*scale,-2.2*scale], phase}};
  }), [pockets]);
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    if (light.current) light.current.intensity = 10.8 + Math.sin(t*6.7)*.63 + Math.sin(t*9.2)*.31;
  });
  const courtyard = pockets.find(p => p.id === 'courtyard');
  return <>
    <StandingPixelFires sources={sources} name="embassy-and-dispatch-flames"/>
    {courtyard && <group position={courtyard.position}>
      <pointLight ref={light} position={[.08,1.03,.52]} color="#ff9b58" intensity={10.8} distance={13} decay={2}/>
    </group>}
  </>;
}
