import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  Vignette,
} from '@react-three/postprocessing';

export function PostProcessing() {
  return (
    <EffectComposer multisampling={2}>
      <HueSaturation saturation={0.1} />
      <BrightnessContrast brightness={-0.008} contrast={0.055} />
      <Bloom
        intensity={0.46}
        luminanceThreshold={0.74}
        luminanceSmoothing={0.72}
        mipmapBlur
      />
      <Vignette offset={0.3} darkness={0.22} />
    </EffectComposer>
  );
}
