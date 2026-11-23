import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { createAdaptiveResolution, setRenderingSuspended } from './adaptiveResolution';

/** Canvas props stay in sync with imperative changes across ordinary HUD renders. */
export function useRenderControls() {
  const [dpr, setDpr] = useState(1);
  const [suspended, setSuspended] = useState(() => document.hidden);
  const rendererRef = useRef<(() => RootState) | null>(null);
  const [resolution] = useState(createAdaptiveResolution);

  const onCreated = useCallback((state: RootState) => {
    // Fiber/Zustand replaces snapshots; retain the getter, not a stale frameloop.
    rendererRef.current = state.get;
    setRenderingSuspended(state.get(), document.hidden);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      const hidden = document.hidden;
      resolution.reset();
      if (rendererRef.current) setRenderingSuspended(rendererRef.current(), hidden);
      setSuspended(hidden);
    };
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [resolution]);

  const sample = useCallback((delta: number) => {
    if (document.hidden) return;
    const nextDpr = resolution.sample(delta);
    if (nextDpr === undefined) return;
    rendererRef.current?.().setDpr(nextDpr);
    setDpr(nextDpr);
  }, [resolution]);

  return { dpr, frameloop: suspended ? 'never' as const : 'always' as const, onCreated, sample };
}

export function AdaptiveResolution({ sample }: { sample: (delta: number) => void }) {
  useFrame((_, delta) => sample(delta));
  return null;
}
