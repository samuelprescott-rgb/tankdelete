import {FieldCurtain,type CurtainStage} from './components/FieldCurtain';
import { Component, useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { DirectoryPicker } from './components/DirectoryPicker';
import {CleanupDesk,CleanupRoster, type DeskReview} from './components/CleanupDesk';
import {cleanupFieldEntries,forgetReal,type CleanupSelection} from './lib/cleanupDesk';
import { SettingsControl } from './components/SettingsControl';
import { useFieldRadio } from './hooks/useFieldRadio';
import { useGameSettings } from './hooks/useGameSettings';
import { useScore } from './hooks/useScore';
import { AchievementToast } from './components/HUD/AchievementToast';
import { useAchievements } from './hooks/useAchievements';
import { CAMPAIGN_ROOT, commands } from './lib/tauri-commands';
import { loadDefenseManifest, awardDefenseReplay } from './lib/defenseManifest';
import { ghostPreviewFromSearch, GHOST_PRACTICE_ARCHIVES } from './lib/ghostSignal';
import type { GameLaunch, GameSessionProps } from './lib/gameSession';
import { primeWorldGunBank, type WorldGunBank } from './lib/worldGunAudio';
import './App.css';

let sessionModule: Promise<typeof import('./GameSession')> | null = null;

function loadSession() {
  sessionModule ??= import('./GameSession').catch((error: unknown) => {
    // A failed download can be retried from the menu without reloading the app.
    sessionModule = null;
    throw error;
  });
  return sessionModule;
}

class SessionBoundary extends Component<{
  children: ReactNode;
  onExit: (error?: string) => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onExit(`The game could not start: ${error.message}`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SessionLoader(props: GameSessionProps) {
  const [Session, setSession] = useState<ComponentType<GameSessionProps> | null>(null);
  useEffect(() => {
    let active = true;
    void loadSession().then((module) => {
      if (active) setSession(() => module.default);
    }).catch((error: unknown) => {
      if (active) props.onExit(`Could not load the game: ${String(error)}`);
    });
    return () => { active = false; };
  }, [props.onExit]);

  return Session ? <Session {...props} /> : null;
}

export default function App() {
  const [launch, setLaunch] = useState<GameLaunch | null>(null);
  const [curtain,setCurtain] = useState<CurtainStage|null>(null);
  const [preview, setPreview] = useState(() => ghostPreviewFromSearch(window.location.search));
  const [defenseFiles, setDefenseFiles] = useState(loadDefenseManifest);
  const [error, setError] = useState<string | null>(null);
  const [desk,setDesk]=useState(false);
  const [deskReview,setDeskReview]=useState<DeskReview|null>(null);
  const deskSelection=useRef<CleanupSelection|null>(null);
  const [identifiedCleanupId,setIdentifiedCleanupId]=useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeLaunchRef = useRef<GameLaunch | null>(null);
  const worldGunBank = useRef<WorldGunBank | null>(null);
  useEffect(() => () => { worldGunBank.current?.dispose(); worldGunBank.current = null; }, []);
  const { settings, updateSetting, resetSettings } = useGameSettings();
  // Keep the one radio element across the lazy boundary so the launch click
  // unlocks playback even when loading or a native directory scan takes time.
  const fieldRadio = useFieldRadio();
  const scoreState = useScore();
  const { current: achievement } = useAchievements(scoreState.totalBytesFreed, launch !== null && curtain === null);

  const unlockDefense = useCallback((files: string[]) => {
    const earned = awardDefenseReplay(activeLaunchRef.current, launch, files);
    if (earned) setDefenseFiles(earned);
  }, [launch]);

  useEffect(() => {
    fieldRadio.setAudioGains({ master: settings.masterVolume, music: settings.musicVolume });
  }, [fieldRadio.setAudioGains, settings.masterVolume, settings.musicVolume]);

  const exitSession = useCallback((message?: string) => {
    // A delayed scan/error from an old session must never close a newer one.
    if (activeLaunchRef.current !== launch || launch === null) return;
    activeLaunchRef.current = null;
    worldGunBank.current?.dispose();
    worldGunBank.current = null;
    fieldRadio.stop();
    toast.remove();
    setSettingsOpen(false);
    setLaunch(null);
    setCurtain(null);
    setError(message ?? null);
    if(message && launch.mode==='cleanup') {forgetReal();deskSelection.current=null;setDeskReview(null);setDesk(true);}
  }, [fieldRadio.stop, launch]);

  const revealSession = useCallback(() => {
    setCurtain(stage => stage === 'covered' ? 'revealing' : stage);
  }, []);

  function startSession(next: GameLaunch) {
    if (activeLaunchRef.current || (next.mode==='horde'&&!next.secret&&!defenseFiles.length)) return;
    if (next.mode==='directory') commands.resetSession();
    setError(null);
    setSettingsOpen(false);
    void fieldRadio.prime();
    worldGunBank.current = primeWorldGunBank();
    activeLaunchRef.current = next;
    setCurtain('covering');
  }

  return (
    <>
      {launch ? (
        <SessionBoundary onExit={exitSession}>
          <SessionLoader
            launch={launch}
            onFieldReady={revealSession}
            launchTransitionActive={curtain !== null}
            defenseFiles={((launch.mode==='horde' && launch.secret && !defenseFiles.length) || (launch.mode==='training' && launch.preview==='embassy')) ? GHOST_PRACTICE_ARCHIVES : defenseFiles}
            onUnlockDefense={unlockDefense}
            onExit={exitSession}
            onReviewCleanup={ids=>{const s=deskSelection.current;if(launch.mode!=='cleanup'||!s)return;setDeskReview({selection:s,ids:s.files.filter(f=>ids.includes(f.id)).map(f=>f.id)});setDesk(true);exitSession();}}
            identifiedCleanupId={identifiedCleanupId}
            fieldRadio={fieldRadio}
            worldGunBank={worldGunBank.current}
            settings={settings}
            settingsOpen={settingsOpen}
            achievementNotice={achievement && <AchievementToast key={achievement.id} achievement={achievement} visible />}
            scoreState={scoreState}
          />
        </SessionBoundary>
      ) : (
        <div className="container">
          {desk ? <CleanupDesk review={deskReview} start={selection=>{deskSelection.current=selection;setIdentifiedCleanupId(selection.files[0]?.id??'');setDeskReview(null);startSession({mode:'cleanup',source:selection.source,fieldFiles:cleanupFieldEntries(selection.files)});}}
            exit={()=>{deskSelection.current=null;setDesk(false);setDeskReview(null);}}/> : preview ? <div className="directory-picker ghost-signal-picker">
            <span className="era-stamp">BOOT CAMP ART TEST // SIMULATED FILES</span>
            <h1>Ghost Signal</h1>
            <p className="subtitle">Practice scenes · riverbank and archive doors</p>
            <div className="ghost-test-options">
              {(preview === 'river' ? ['river','embassy'] as const : ['embassy','river'] as const).map(slice =>
                <button key={slice} type="button" className={slice === preview ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => startSession({mode:'training',preview:slice})}>
                  <strong>{slice === 'river' ? 'River crossing' : 'Embassy approach'}</strong>
                  <span>{slice === 'river' ? 'WASD to drive. Click a plank wall to mark the file and see the hit unravel. Click again to confirm.'
                    : 'Defend the three sample files. Watch the alarm signs above the archive doors.'}</span>
                </button>)}
            </div>
            <button type="button" className="btn-secondary" onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('ghostSignal');
              window.history.replaceState(window.history.state, '', url);
              setPreview(undefined);
            }}>Return to main menu</button>
            {error && <p role="alert">{error}</p>}
          </div> : <DirectoryPicker
            onStartCampaign={() => startSession({ mode: 'directory', directory: CAMPAIGN_ROOT })}
            onSecretHorde={()=>startSession({mode:'horde',secret:true})}
            onOpenCleanup={()=>{setDeskReview(null);setDesk(true);}}
            onStartTraining={() => startSession({ mode: 'training' })}
            onStartHordeMode={defenseFiles.length ? () => startSession({ mode: 'horde' }) : undefined}
            error={error}
          />}
        </div>
      )}
      {curtain && <FieldCurtain stage={curtain}
        onCovered={() => {setCurtain('covered');setLaunch(activeLaunchRef.current);}}
        onRevealed={() => setCurtain(null)}
        onCancel={() => {
          if (launch) {exitSession();return;}
          activeLaunchRef.current=null;
          worldGunBank.current?.dispose();
          worldGunBank.current=null;
          fieldRadio.stop();
          setCurtain(null);
        }}/>}
      {launch?.mode==='cleanup'&&deskSelection.current&&!settingsOpen&&<CleanupRoster selection={deskSelection.current} identified={identifiedCleanupId} identify={setIdentifiedCleanupId}/>}
      <div className={launch ? 'scene-settings' : undefined}>
        <SettingsControl
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          brightness={settings.brightness}
          onBrightnessChange={(value) => updateSetting('brightness', value)}
          masterVolume={settings.masterVolume}
          onMasterVolumeChange={(value) => updateSetting('masterVolume', value)}
          musicVolume={settings.musicVolume}
          onMusicVolumeChange={(value) => updateSetting('musicVolume', value)}
          weaponsVolume={settings.weaponsVolume}
          onWeaponsVolumeChange={(value) => updateSetting('weaponsVolume', value)}
          ambienceVolume={settings.ambienceVolume}
          onAmbienceVolumeChange={(value) => updateSetting('ambienceVolume', value)}
          voiceEffectsVolume={settings.voiceEffectsVolume}
          onVoiceEffectsVolumeChange={(value) => updateSetting('voiceEffectsVolume', value)}
          onResetDefaults={resetSettings}
        />
      </div>
    </>
  );
}
