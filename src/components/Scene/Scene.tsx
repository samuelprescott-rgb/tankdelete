import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { TronGrid } from './TronGrid';
import { Lighting } from './Lighting';
import { PostProcessing } from './PostProcessing';
import { VietnamEnvironment } from './VietnamEnvironment';

interface SceneProps {
  children?: React.ReactNode;
}

export function Scene({ children }: SceneProps) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <Canvas
        camera={{ position: [0, 12, 20], fov: 60, near: 0.1, far: 500 }}
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <color attach="background" args={['#10160e']} />
        <fog attach="fog" args={['#242819', 46, 125]} />
        <Lighting />
        <VietnamEnvironment />
        <TronGrid />
        {children}
        <PostProcessing />
      </Canvas>
    </div>
  );
}
