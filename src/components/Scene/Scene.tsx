import {CrossingWeatherProvider} from './CrossingWeatherProvider';
import {RotorGust} from './rotorGust';
import { SpentBrass } from './SpentBrass';
import { Canvas, useFrame } from '@react-three/fiber';
import { useState, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EMBASSY_DEFENSE_OFFSET_Z } from '../../lib/embassyDefense';
import { TerrainSurface } from './TerrainSurface';
import { Lighting } from './Lighting';
import { PostProcessing } from './PostProcessing';
import { VietnamEnvironment } from './VietnamEnvironment';
import { VietnamSkybox } from './VietnamSkybox';
import { PerformanceDiagnostics } from './PerformanceDiagnostics';
import { AdaptiveResolution, useRenderControls } from './RenderControls';
import { SceneReviewCamera, SCENE_REVIEW_VIEWS, type SceneReviewView } from './SceneReviewCamera';
import { SceneReviewControls } from './SceneReviewControls';
import { FoliageSightline } from './FoliageSightline';
import { createSceneEvents } from './sceneEvents';
import { GhostHordeRain } from './GhostHordeRain';
import { CheckpointFog } from './CheckpointFog';
import { GhostAir } from './GhostAir';

// A Canvas can exist before its first world frame or post-processing pass.
function FieldReady({onReady}:{onReady:()=>void}) {
  const frames=useRef(0);
  useFrame(() => { if (++frames.current === 3) onReady(); });
  return null;
}

interface SceneProps {
  onReady?:()=>void;
  children?: React.ReactNode;
  environmentSeed?: number;
  effectsKey?: string;
  tankRef?: React.RefObject<THREE.Group | null>;
  /** Holds one continuous atmosphere for the full nightmare-defense sequence. */
  nightmareActive?: boolean;
  campaignClearing?:boolean;
  rearOutpost?:boolean;
  landingDestroyed?:boolean;
  /** User-facing display exposure multiplier. */
  brightness?: number;
}

export const NIGHTMARE_ATMOSPHERE = Object.freeze({
  background: '#121929',
  fogColor: '#223847',
  fogNear: 15,
  fogFar: 89,
});

export function Scene({
  children,
  onReady,
  environmentSeed = 1968,
  effectsKey = '',
  tankRef,
  nightmareActive = false,
  campaignClearing = false,
  rearOutpost = false,
  landingDestroyed=false,
  brightness = 1.3,
}: SceneProps) {
  const rotorGust = useMemo(()=>({value:new THREE.Vector4(0,0,0,0)}),[]);
  const renderControls = useRenderControls();
  const [reviewView, setReviewView] = useState<SceneReviewView>('Chase');
  const reviewEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has('sceneReview');
  const [reviewDriveRun, setReviewDriveRun] = useState(0);

  return (
    <SceneReviewControls.Provider value={reviewEnabled ? {run:reviewDriveRun,stop:()=>setReviewDriveRun(0)} : null}>
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <Canvas
        camera={{ position: [0, 12, 20], fov: 60, near: 0.1, far: 340 }}
        events={createSceneEvents}
        shadows="percentage"
        dpr={renderControls.dpr}
        frameloop={renderControls.frameloop}
        // Geometry tests depth in the composer's HDR target. The display
        // surface receives one fullscreen triangle and needs no depth store.
        gl={{ antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' }}
        onCreated={(state) => {
          const { gl } = state;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          renderControls.onCreated(state);
        }}
      >
        <color
          attach="background"
          args={[nightmareActive ? NIGHTMARE_ATMOSPHERE.background : '#495450']}
        />
        <fog
          attach="fog"
          args={nightmareActive
            ? [NIGHTMARE_ATMOSPHERE.fogColor, NIGHTMARE_ATMOSPHERE.fogNear, NIGHTMARE_ATMOSPHERE.fogFar]
            : ['#495450', 28, 138]}
        />
        <CrossingWeatherProvider day={!nightmareActive}>
        <RotorGust.Provider value={rotorGust}>
        <FoliageSightline tankRef={tankRef} raining={nightmareActive} enabled={!reviewEnabled || reviewView === 'Chase'}>
        <VietnamSkybox seed={environmentSeed} nightmareActive={nightmareActive} />
        <Lighting nightmareActive={nightmareActive} tankRef={tankRef}
          inspectFromCamera={reviewEnabled && reviewView !== 'Chase'} />
        <VietnamEnvironment seed={environmentSeed} tankRef={tankRef} campaignClearing={campaignClearing} rearOutpost={rearOutpost} landingDestroyed={landingDestroyed}
          fightingPositionOffsetZ={nightmareActive ? EMBASSY_DEFENSE_OFFSET_Z : 0} />
        <TerrainSurface seed={environmentSeed} raining={nightmareActive} />
        <GhostAir night={nightmareActive} />
        {nightmareActive && <><CheckpointFog /><GhostHordeRain /></>}
        <SpentBrass seed={environmentSeed} resetKey={effectsKey}>{children}</SpentBrass>
        {onReady && <FieldReady key={effectsKey} onReady={onReady}/>}
        <PostProcessing brightness={brightness} embassy={nightmareActive} />
        <AdaptiveResolution sample={renderControls.sample} />
        {import.meta.env.DEV && <PerformanceDiagnostics tankRef={tankRef} />}
        {reviewEnabled && <SceneReviewCamera view={reviewView} />}
        </FoliageSightline>
        </RotorGust.Provider>
        </CrossingWeatherProvider>
      </Canvas>
      {reviewEnabled && <nav data-game-ui aria-label="Scene inspection views"
        onMouseDown={event => event.stopPropagation()}
        onMouseUp={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        onPointerUp={event => event.stopPropagation()} style={{
        position: 'absolute', left: 180, bottom: 92, zIndex: 30,
        display: 'flex', flexWrap: 'wrap', maxWidth: 'calc(100vw - 200px)', gap: 4, padding: 5, background: '#111d',
      }}>
        {(Object.keys(SCENE_REVIEW_VIEWS) as SceneReviewView[]).map(view =>
          <button key={view} onClick={() => setReviewView(view)} aria-pressed={reviewView === view}
            style={{ color: '#e7e7cc', background: reviewView === view ? '#475338' : '#242820', padding: '5px 8px', fontSize: 12 }}>
            {view}
          </button>)}
        <button onClick={()=>{setReviewView('Chase');setReviewDriveRun(reviewDriveRun ? 0 : Date.now());}}
          style={{color:'#e7e7cc',background:'#242820',padding:'5px 8px',fontSize:12}}>
          {reviewDriveRun ? 'Stop drive check' : 'Drive check · 20s'}
        </button>
      </nav>}
    </div>
    </SceneReviewControls.Provider>
  );
}
