import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { TronGrid } from './TronGrid';
import { Lighting } from './Lighting';
import { PostProcessing } from './PostProcessing';
import { VietnamEnvironment } from './VietnamEnvironment';
import { VietnamSkybox } from './VietnamSkybox';

interface SceneProps {
  children?: React.ReactNode;
  environmentSeed?: number;
  tankRef?: React.RefObject<THREE.Group | null>;
  /** Holds one continuous atmosphere for the full nightmare-defense sequence. */
  nightmareActive?: boolean;
}

export const NIGHTMARE_ATMOSPHERE = Object.freeze({
  background: '#080d0e',
  fogColor: '#111a18',
  fogNear: 10,
  fogFar: 70,
});

export function Scene({
  children,
  environmentSeed = 1968,
  tankRef,
  nightmareActive = false,
}: SceneProps) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <Canvas
        camera={{ position: [0, 12, 20], fov: 60, near: 0.1, far: 340 }}
        shadows
        dpr={[0.85, 1.25]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <color
          attach="background"
          args={[nightmareActive ? NIGHTMARE_ATMOSPHERE.background : '#42534f']}
        />
        <fog
          attach="fog"
          args={nightmareActive
            ? [NIGHTMARE_ATMOSPHERE.fogColor, NIGHTMARE_ATMOSPHERE.fogNear, NIGHTMARE_ATMOSPHERE.fogFar]
            : ['#566861', 52, 166]}
        />
        <VietnamSkybox seed={environmentSeed} nightmareActive={nightmareActive} />
        <Lighting nightmareActive={nightmareActive} />
        <VietnamEnvironment seed={environmentSeed} tankRef={tankRef} />
        <TronGrid />
        {children}
        <PostProcessing />
      </Canvas>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          zIndex: 1,
          inset: 0,
          pointerEvents: 'none',
          opacity: nightmareActive ? 1 : 0,
          transition: 'opacity 1400ms ease',
          background: `linear-gradient(
            to bottom,
            rgba(0, 4, 8, 0.82) 0%,
            rgba(0, 4, 7, 0.58) 34%,
            rgba(0, 2, 4, 0.18) 68%,
            rgba(0, 0, 0, 0.05) 100%
          )`,
        }}
      />
    </div>
  );
}
