import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  Vignette,
} from '@react-three/postprocessing';

export function PostProcessing() {
  return (
    <EffectComposer>
      <HueSaturation saturation={0.17} />
      <BrightnessContrast brightness={0.045} contrast={0.045} />
      <Bloom
        intensity={0.52}
        luminanceThreshold={0.72}
        luminanceSmoothing={0.72}
        mipmapBlur
      />
      <Vignette offset={0.3} darkness={0.24} />
    </EffectComposer>
  );
}
