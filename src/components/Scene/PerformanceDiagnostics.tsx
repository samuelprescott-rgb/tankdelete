import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ADAPTIVE_RESOLUTION } from './adaptiveResolution';
import { createGpuFrameTimer } from './gpuFrameTimer';
import type * as THREE from 'three';

const SAMPLE_SECONDS = 1;

/**
 * Development-only, non-visual frame telemetry for repeatable browser smoke
 * tests. Production builds eliminate the caller behind import.meta.env.DEV.
 */
export function PerformanceDiagnostics({tankRef}:{tankRef?:React.RefObject<THREE.Group|null>}) {
  const renderer = useThree(state => state.gl);
  const graphics = useRef({ timer: null as ReturnType<typeof createGpuFrameTimer> | null,
    nextQuery: 0, nextReport: 0, gpuSum: 0, gpuSamples: 0 });
  useEffect(() => {
    const previousAutoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    const timer = createGpuFrameTimer(renderer.getContext() as WebGL2RenderingContext);
    graphics.current = { timer, nextQuery: 0, nextReport: 0, gpuSum: 0, gpuSamples: 0 };
    return () => {
      timer.dispose(); graphics.current.timer = null;
      renderer.info.autoReset = previousAutoReset;
      for (const key of ['tankGpuMs', 'tankDrawCalls', 'tankTriangles', 'tankGrassFarChunks', 'tankCameraPose']) delete document.documentElement.dataset[key];
    };
  }, [renderer]);
  // Existing composer renders at priority1. Count its complete frame, including
  // shadows and postprocessing, instead of only its last fullscreen pass.
  useFrame(({ clock }) => {
    renderer.info.reset();
    const state = graphics.current;
    const result = state.timer?.poll();
    if (result !== undefined && result !== null) { state.gpuSum += result; state.gpuSamples++; }
    if (!document.hidden && clock.elapsedTime >= state.nextQuery) {
      state.nextQuery = clock.elapsedTime + 0.25;
      state.timer?.begin();
    }
  }, 0.75);
  useFrame(({ clock, camera, scene }) => {
    const state = graphics.current;
    state.timer?.end();
    if (document.hidden || clock.elapsedTime < state.nextReport) return;
    state.nextReport = clock.elapsedTime + 1;
    const root = document.documentElement;
    root.dataset.tankDrawCalls = String(renderer.info.render.calls);
    root.dataset.tankTriangles = String(renderer.info.render.triangles);
    root.dataset.tankGpuMs = state.gpuSamples ? (state.gpuSum / state.gpuSamples).toFixed(2)
      : state.timer?.supported ? 'pending' : 'unavailable';
    root.dataset.tankCameraPose = `${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)},${camera.position.z.toFixed(2)}`;
    let farChunks = 0;
    scene.getObjectByName('dense-ground-cover')?.children.forEach(chunk => {
      if (chunk.visible && chunk.userData.grassLod === 'far') farChunks++;
    });
    root.dataset.tankGrassFarChunks = String(farChunks);
    state.gpuSum = 0; state.gpuSamples = 0;
  }, 1.5);
  const sampleRef = useRef({
    elapsed: 0,
    frames: 0,
    maxFrameMs: 0,
    frameTimes: [] as number[],
  });

  useFrame(({ gl }, delta) => {
    const sample = sampleRef.current;
    if (document.hidden || !Number.isFinite(delta) || delta <= 0 || delta >= ADAPTIVE_RESOLUTION.interruptionSeconds) {
      sample.elapsed = 0;
      sample.frames = 0;
      sample.maxFrameMs = 0;
      sample.frameTimes.length = 0;
      return;
    }
    sample.elapsed += delta;
    sample.frames += 1;
    sample.maxFrameMs = Math.max(sample.maxFrameMs, delta * 1_000);
    sample.frameTimes.push(delta*1_000);
    if (sample.elapsed < SAMPLE_SECONDS) return;

    const root = document.documentElement;
    root.dataset.tankFps = (sample.frames / sample.elapsed).toFixed(1);
    root.dataset.tankFrameMs = (sample.elapsed * 1_000 / sample.frames).toFixed(2);
    root.dataset.tankMaxFrameMs = sample.maxFrameMs.toFixed(2);
    sample.frameTimes.sort((a,b)=>a-b);
    root.dataset.tankP95FrameMs = sample.frameTimes[Math.min(sample.frameTimes.length-1,Math.floor(sample.frameTimes.length*.95))].toFixed(2);
    if(tankRef?.current) {
      root.dataset.tankPose = `${tankRef.current.position.x.toFixed(2)},${tankRef.current.position.z.toFixed(2)},${tankRef.current.rotation.y.toFixed(2)}`;
    }
    root.dataset.tankGeometries = String(gl.info.memory.geometries);
    root.dataset.tankTextures = String(gl.info.memory.textures);
    root.dataset.tankDpr = gl.getPixelRatio().toFixed(2);

    sample.elapsed = 0;
    sample.frames = 0;
    sample.maxFrameMs = 0;
    sample.frameTimes.length = 0;
  });

  useEffect(() => {
    const clearSample = () => {
      sampleRef.current.elapsed = 0;
      sampleRef.current.frames = 0;
      sampleRef.current.maxFrameMs = 0;
      sampleRef.current.frameTimes.length = 0;
    };
    document.addEventListener('visibilitychange', clearSample);
    return () => {
      document.removeEventListener('visibilitychange', clearSample);
      const root = document.documentElement;
      delete root.dataset.tankFps;
      delete root.dataset.tankFrameMs;
      delete root.dataset.tankMaxFrameMs;
      delete root.dataset.tankP95FrameMs;
      delete root.dataset.tankPose;
      delete root.dataset.tankGeometries;
      delete root.dataset.tankTextures;
      delete root.dataset.tankDpr;
    };
  }, []);

  return null;
}
