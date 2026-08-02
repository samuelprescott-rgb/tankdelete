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
      <HueSaturation saturation={0.14} />
      <BrightnessContrast brightness={0.01} contrast={0.09} />
      <Bloom
        intensity={0.52}
        luminanceThreshold={0.72}
        luminanceSmoothing={0.72}
        mipmapBlur
      />
      <Vignette offset={0.24} darkness={0.38} />
    </EffectComposer>
  );
}
