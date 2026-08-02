import { EffectComposer, Bloom } from '@react-three/postprocessing';

export function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        intensity={1.45}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
    </EffectComposer>
  );
}
