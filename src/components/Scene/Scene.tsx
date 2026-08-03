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
}

export function Scene({ children, environmentSeed = 1968, tankRef }: SceneProps) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <Canvas
        camera={{ position: [0, 12, 20], fov: 60, near: 0.1, far: 340 }}
        shadows
        dpr={[0.85, 1.25]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.26;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <color attach="background" args={['#718273']} />
        <fog attach="fog" args={['#7b8977', 50, 154]} />
        <VietnamSkybox seed={environmentSeed} />
        <Lighting />
        <VietnamEnvironment seed={environmentSeed} tankRef={tankRef} />
        <TronGrid />
        {children}
        <PostProcessing />
      </Canvas>
    </div>
  );
}
