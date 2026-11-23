import {useMemo, type ReactNode} from 'react';
import {useFrame,useLoader} from '@react-three/fiber';
import * as T from 'three';
import {CrossingWeatherContext} from './crossingWeather';

export function CrossingWeatherProvider({day,children}:{day:boolean;children:ReactNode}) {
  const texture=useLoader(T.TextureLoader,'/images/textures/crossing-cloud-deck.png');
  const weather=useMemo(()=>{
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.magFilter=T.NearestFilter;
    texture.minFilter=T.LinearMipMapLinearFilter;
    texture.needsUpdate=true;
    return {deck:{value:texture},weatherTime:{value:0}};
  },[texture]);
  useFrame(({clock})=>{weather.weatherTime.value=Math.floor(clock.elapsedTime*12)/12;},-2);
  return <CrossingWeatherContext.Provider value={day?weather:null}>{children}</CrossingWeatherContext.Provider>;
}
