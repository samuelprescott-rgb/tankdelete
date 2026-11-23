import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, FXAA, HueSaturation, LUT, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ghostInkStrength } from '../../lib/ghostSignal';
import { createGhostPalette } from './ghostPalette';
import { attachWorldDepthDiscard } from './discardWorldDepth';

interface PostProcessingProps {
  brightness?: number;
  embassy?: boolean;
}

// ToneMappingMode.ACES_FILMIC in the installed postprocessing API. Keep it
// explicit: the library's default changed to AgX in 6.39.
const ACES_FILMIC_MODE = 6;
// Only the soft glow mask uses reduced resolution. Keep geometry, FXAA, grading
// and final output at the scene's drawing-buffer size. The Bloom wrapper's
// top-level resolutionScale applies to its legacy blur, not the luminance pass.
const BLOOM_WORK = { levels: 5, 'luminancePass-resolution-scale': 0.5 } as const;
type Composer = ComponentRef<typeof EffectComposer>;

function useComposerLifetime(composerRef: React.RefObject<Composer | null>, camera: unknown, gl: unknown, scene: unknown) {
  const activeComposerRef = useRef<Composer | null>(null);
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    activeComposerRef.current = composer;
    return () => {
      activeComposerRef.current = null;
      // Passive effects remain mounted while Suspense hides a scene. Layout
      // cleanup does not mean unmount: disposing there loses the render pass.
      // Defer final release through StrictMode's synchronous effect replay.
      queueMicrotask(() => {
        if (activeComposerRef.current !== composer) composer.dispose();
      });
    };
  }, [camera, composerRef, gl, scene]);
}

function useComposerResolution(composerRef: React.RefObject<Composer | null>, width: number, height: number, dpr: number) {
  useLayoutEffect(() => {
    // The wrapper observes CSS size only. Match HDR and bloom targets to the
    // drawing buffer when adaptive resolution changes just the DPR.
    composerRef.current?.setSize(width, height);
  }, [composerRef, dpr, height, width]);
}

export function exposureForBrightness(brightness: number) {
  const safe = Number.isFinite(brightness) ? brightness : 1.3;
  // Exposure, not an additive gray veil. Keep black pixels black and retain
  // highlight roll-off at the brightest user setting.
  return 1.18 * Math.pow(2, (Math.min(1.8, Math.max(0.7, safe)) - 1.3) * 1.45);
}

export const PostProcessing = memo(function PostProcessing({ brightness = 1.3, embassy = false }: PostProcessingProps) {
  const gl = useThree(state => state.gl);
  const camera = useThree(state => state.camera);
  const scene = useThree(state => state.scene);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const dpr = useThree(state => state.viewport.dpr);
  const composerRef = useRef<Composer>(null);
  const palette = useMemo(()=>createGhostPalette(!embassy),[embassy]);
  useEffect(() => () => palette.dispose(), [palette]);
  useComposerLifetime(composerRef, camera, gl, scene);
  useComposerResolution(composerRef, width, height, dpr);
  useLayoutEffect(() => {
    if (composerRef.current) return attachWorldDepthDiscard(composerRef.current, gl, scene, camera);
  }, [gl, scene, camera]);

  useEffect(() => {
    const previous = gl.toneMappingExposure;
    gl.toneMappingExposure = exposureForBrightness(brightness);
    return () => { gl.toneMappingExposure = previous; };
  }, [brightness, gl]);

  // Stable children prevent the wrapper from rebuilding compound effect
  // passes/listeners on HUD updates or each movement of the brightness slider.
  const effects = useMemo(() => [
    // Filter geometry edges before grading so neighborhood samples use the
    // same input as the center pixel. This shares the existing effect pass.
    <FXAA key="edge-aa" samples={8} subpixelQuality={0.5} />,
    <Bloom key="bloom" intensity={0.28} luminanceThreshold={1.05} luminanceSmoothing={0.3} mipmapBlur {...BLOOM_WORK} />,
    // Composer disables renderer tone mapping. Apply ACES once after HDR bloom.
    <ToneMapping key="tone-mapping" mode={ACES_FILMIC_MODE} />,
    <HueSaturation key="color-grade" saturation={0.015} />,
    <LUT key="ghost-inks" ref={effect=>{if(effect)effect.blendMode.opacity.value=ghostInkStrength(embassy);}}
      lut={palette} blendFunction={23 /* NORMAL */} />,
    <Vignette key="vignette" offset={0.32} darkness={0.13} />,
  ], [palette,embassy]);

  return (
    <EffectComposer ref={composerRef} depthBuffer multisampling={0}>
      {effects}
    </EffectComposer>
  );
});
