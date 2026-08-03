import { useEffect, useMemo, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import toast, { Toaster } from 'react-hot-toast';
import { KeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import './App.css';
import { commands } from './lib/tauri-commands';
import { FileEntry, ScanProgress } from './lib/types';
import { formatBytes } from './lib/format';
import { DirectoryPicker } from './components/DirectoryPicker';
import { HUD } from './components/HUD';
import { Minimap } from './components/HUD/Minimap';
import { Scene } from './components/Scene/Scene';
import { FileBlocks } from './components/Scene/FileBlocks';
import { FolderPortal } from './components/Scene/FolderPortal';
import { BackPortal } from './components/Scene/BackPortal';
import { PortalCollision } from './components/Scene/PortalCollision';
import { Particles } from './components/Scene/Particles';
import { Tank } from './components/Scene/Tank';
import { CameraRig } from './components/Scene/CameraRig';
import { Crosshair } from './components/Scene/Crosshair';
import { useFileBlocks } from './hooks/useFileBlocks';
import { Projectile, useProjectilePool } from './hooks/useProjectilePool';
import { useMarkedFiles } from './hooks/useMarkedFiles';
import { ProjectileManager } from './components/Scene/ProjectileManager';
import { layoutFilesInGrid } from './lib/layout';
import { folderToScale } from './lib/scale';
import { useScore } from './hooks/useScore';
import { useAchievements } from './hooks/useAchievements';
import { useExplosionPool } from './hooks/useExplosionPool';
import { ExplosionParticles } from './components/Scene/ExplosionParticles';
import { createTrainingEntries, TRAINING_DIRECTORY } from './lib/training';
import { useFieldRadio } from './hooks/useFieldRadio';
import { useGameAudio } from './hooks/useGameAudio';
import { useZombieAmbience } from './hooks/useZombieAmbience';
import { useBossVoice } from './hooks/useBossVoice';
import { NightmareWaveTakeover } from './components/HUD/NightmareWaveTakeover';
import { OrdnanceEffects } from './components/Scene/OrdnanceEffects';
import { TankWaterEffects } from './components/Scene/TankWaterEffects';
import { VietCongCombatants } from './components/Scene/VietCongCombatants';
import {
  USInfantrySquad,
  US_FIGHTING_POSITIONS,
} from './components/Scene/USInfantrySquad';
import { CRASHED_HUEY_TRANSFORM } from './components/Scene/VietnamEnvironment';
import { useEnemyCombat } from './hooks/useEnemyCombat';
import { useZombieEpilogue } from './hooks/useZombieEpilogue';
import { useFinalBossAllies } from './hooks/useFinalBossAllies';
import { ZombieHorde } from './components/Scene/ZombieHorde';
import { FinalBossAllies } from './components/Scene/FinalBossAllies';
import { BaldEagleSupport } from './components/Scene/BaldEagleSupport';
import {
  type CannonReloadState,
  FLAMETHROWER_CONE_DOT,
  FLAMETHROWER_RANGE,
  type MachineGunHeatState,
  MACHINE_GUN_BURST_SECONDS,
  NapalmStrike,
  NAPALM_COOLDOWN_SECONDS,
  NAPALM_HAZARD_DAMAGE_INTERVAL_SECONDS,
  NAPALM_HAZARD_DAMAGE_PER_TICK,
  NAPALM_HAZARD_FRIENDLY_DAMAGE_PER_TICK,
  NAPALM_STRIKE_LENGTH,
  NAPALM_STRIKE_WIDTH,
  isPointInsideNapalmStrike,
  WeaponMode,
} from './lib/weapons';
import {
  type EagleAudioCue,
  type EagleStrafe,
  EAGLE_COOLDOWN_SECONDS,
  EAGLE_STRIKE_DAMAGE,
  EAGLE_STRIKE_LENGTH,
  EAGLE_STRIKE_WIDTH,
} from './lib/eagleSupport';
import {
  findLivingZombiesInRectangle,
  type FriendlyZombieHitEvent,
  type ZombieFriendlyBreachEvent,
  type ZombieTankBreachEvent,
} from './lib/zombieEpilogue';
import { hashCombatSession } from './lib/combat';
import {
  createFileObjective,
  getFileObjectiveProgress,
  type FileObjective,
} from './lib/mission';
import type { TankCollider } from './lib/worldCollision';
import { createSectorPage } from './lib/sectorPaging';

type AppState = 'checking' | 'picking' | 'scanning' | 'ready';

// Keyboard controls map
const CONTROLS_MAP = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'batchDelete', keys: ['Delete', 'KeyX'] },
];

function App() {
  const [state, setState] = useState<AppState>('checking');
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [lastDirectory, setLastDirectory] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState<number>(0);
  const [deletedBytes, setDeletedBytes] = useState<number>(0);
  const [tankStartPosition, setTankStartPosition] = useState<[number, number, number]>([0, 0, -12]);
  const [isTraining, setIsTraining] = useState(false);
  const [weaponMode, setWeaponMode] = useState<WeaponMode>('cannon');
  const [cannonReload, setCannonReload] = useState<CannonReloadState>({
    progress: 1,
    remainingSeconds: 0,
    ready: true,
  });
  const [machineGunHeat, setMachineGunHeat] = useState<MachineGunHeatState>({
    heat: 0,
    firing: false,
    overheated: false,
    burstRemainingSeconds: MACHINE_GUN_BURST_SECONDS,
    recoveryRemainingSeconds: 0,
  });
  const [flameFuel, setFlameFuel] = useState(1);
  const [napalmStrikes, setNapalmStrikes] = useState<NapalmStrike[]>([]);
  const [napalmCooldown, setNapalmCooldown] = useState(0);
  const [eagleStrikes, setEagleStrikes] = useState<EagleStrafe[]>([]);
  const [eagleCooldown, setEagleCooldown] = useState(0);
  const [eagleBusy, setEagleBusy] = useState(false);
  const [eagleTargeting, setEagleTargeting] = useState(false);
  const [combatSessionKey, setCombatSessionKey] = useState(0);
  const [tankIntegrity, setTankIntegrity] = useState(100);
  const [damageFlash, setDamageFlash] = useState(false);
  const [nightmareTakeover, setNightmareTakeover] = useState<{
    token: number;
    wave: number;
    boss: boolean;
  } | null>(null);
  const [fileObjective, setFileObjective] = useState<FileObjective | null>(null);
  const [sectorPageIndex, setSectorPageIndex] = useState(0);
  const trainingUndoStackRef = useRef<FileEntry[]>([]);
  const ordnanceIdRef = useRef(0);
  const napalmReadyAtRef = useRef(0);
  const eagleReadyAtRef = useRef(0);
  const eagleTargetingRef = useRef(false);
  const worldSessionRef = useRef(0);
  const automaticHitTriggerByPathRef = useRef(new Map<string, number>());
  const napalmPayloadsRef = useRef(new Map<number, {
    session: number;
    filePaths: string[];
    enemyIds: string[];
    position: [number, number, number];
    rotation: number;
    impacted: boolean;
    lastBurnDamageAt: Map<string, number>;
  }>());
  const eaglePayloadsRef = useRef(new Map<number, {
    session: number;
    position: [number, number, number];
    rotation: number;
  }>());
  const tankHitCooldownRef = useRef(0);
  const damageFlashTimeoutRef = useRef<number | null>(null);
  const nightmareTakeoverTokenRef = useRef(0);
  const missionSnapshotRef = useRef({ id: null as string | null, remaining: 0 });
  const bonusAnnouncementRef = useRef({ phase: 'locked', wave: 0 });
  const pendingHordeStartRef = useRef(false);

  // Tank ref for camera tracking
  const tankRef = useRef<THREE.Group>(null);

  // Tank state for minimap (updated by Tank component each frame)
  const tankStateRef = useRef({ position: [0, 0, 0] as [number, number, number], rotation: 0 });

  // Projectile pool
  const { spawn, despawn, pool } = useProjectilePool();

  // Marked files hook
  const {
    markedFiles,
    deletingFiles,
    markFile,
    unmarkFile,
    clearMarked,
    resetMarkedState,
    isMarked,
    startDeletion,
    finishDeletion,
    deleteAllMarked,
    markedCount,
  } = useMarkedFiles();

  // Game polish hooks
  const { score, totalBytesFreed, addPoints, removePoints } = useScore();
  useAchievements(totalBytesFreed);
  const { explosions, spawn: spawnExplosion, despawn: despawnExplosion } = useExplosionPool();
  const fieldRadio = useFieldRadio();
  const gameAudio = useGameAudio();
  const zombieAmbience = useZombieAmbience(
    gameAudio.setNightmareRainMix,
    gameAudio.setNightmareRainDuck,
  );
  const bossVoice = useBossVoice({
    setMusicDuck: fieldRadio.setBossVoiceDuck,
    setZombieAmbienceDuck: zombieAmbience.setBossVoiceDuck,
  });
  const {
    enemies,
    enemiesRef,
    livingEnemies,
    aliveCount: hostileCount,
    friendlies,
    livingFriendlies,
    friendliesRef,
    friendlyPosesRef,
    friendlyAliveCount,
    damageEnemy,
    killEnemy,
    damageFriendly,
    resetFriendlies,
  } = useEnemyCombat({ sessionKey: combatSessionKey, count: 12 });
  const horde = useZombieEpilogue({
    sessionKey: combatSessionKey,
    seed: hashCombatSession(currentDirectory ?? TRAINING_DIRECTORY),
  });
  const nightmareBoss = horde.livingZombies.find(zombie => zombie.archetype === 'boss');
  const finalBossEncounterActive = state === 'ready'
    && horde.phase === 'combat'
    && horde.wave === horde.maxWaves
    && Boolean(nightmareBoss?.alive);
  const bossAllies = useFinalBossAllies({
    enabled: finalBossEncounterActive,
    encounterKey: `${combatSessionKey}:${horde.wave}`,
    bossHealth: nightmareBoss?.health,
    bossMaxHealth: nightmareBoss?.maxHealth,
    baseFriendliesRef: friendliesRef,
    posesRef: friendlyPosesRef,
    onDefeat: event => {
      if (event.position) {
        spawnExplosion(event.position.clone().add(new THREE.Vector3(0, 0.55, 0)), '#a86a3d', 0.3);
      }
      toast.error(`${event.name} is down`, { duration: 2200, icon: '✦' });
    },
  });

  useEffect(() => {
    if (!pendingHordeStartRef.current
      || state !== 'ready'
      || horde.phase !== 'locked'
      || !fileObjective?.id) return;

    if (horde.begin(fileObjective.id)) {
      pendingHordeStartRef.current = false;
    }
  }, [fileObjective?.id, horde.begin, horde.phase, state]);

  useEffect(() => {
    const finalWaveIsNext = state === 'ready'
      && horde.phase === 'intermission'
      && horde.wave === horde.maxWaves - 1;
    if (finalWaveIsNext) bossVoice.prepare();
  }, [bossVoice.prepare, horde.maxWaves, horde.phase, horde.wave, state]);

  useEffect(() => {
    const finalBossIsLive = state === 'ready'
      && horde.phase === 'combat'
      && horde.wave === horde.maxWaves
      && Boolean(nightmareBoss?.alive);
    if (!finalBossIsLive) bossVoice.stop();
  }, [
    bossVoice.stop,
    horde.maxWaves,
    horde.phase,
    horde.wave,
    nightmareBoss?.alive,
    state,
  ]);

  useEffect(() => {
    if (state !== 'ready'
      || horde.phase !== 'combat'
      || horde.wave !== horde.maxWaves
      || !nightmareBoss?.alive
      || nightmareBoss.maxHealth <= 0) return;
    if (nightmareBoss.health / nightmareBoss.maxHealth <= 0.35) {
      bossVoice.cueEnraged();
    }
  }, [
    bossVoice.cueEnraged,
    horde.maxWaves,
    horde.phase,
    horde.wave,
    nightmareBoss?.alive,
    nightmareBoss?.health,
    nightmareBoss?.maxHealth,
    state,
  ]);

  useEffect(() => {
    if (state === 'ready') {
      gameAudio.setBattlefieldActive(true);
      void fieldRadio.launch();
    } else {
      zombieAmbience.stop();
      gameAudio.stopAllLoops();
      if (state === 'scanning') fieldRadio.suspend();
      else fieldRadio.stop();
    }
  }, [
    state,
    fieldRadio.launch,
    fieldRadio.stop,
    fieldRadio.suspend,
    gameAudio.setBattlefieldActive,
    gameAudio.stopAllLoops,
    zombieAmbience.stop,
  ]);

  useEffect(() => {
    if (state === 'ready' && horde.phase !== 'locked' && horde.phase !== 'victory') return;
    zombieAmbience.stop();
  }, [horde.phase, state, zombieAmbience.stop]);

  useEffect(() => {
    bossVoice.stop();
    setTankIntegrity(100);
    setDamageFlash(false);
    setNapalmStrikes([]);
    setNapalmCooldown(0);
    setEagleStrikes([]);
    setEagleCooldown(0);
    setEagleBusy(false);
    setEagleTargeting(false);
    setNightmareTakeover(null);
    eagleTargetingRef.current = false;
    napalmReadyAtRef.current = 0;
    eagleReadyAtRef.current = 0;
    napalmPayloadsRef.current.clear();
    eaglePayloadsRef.current.clear();
    tankHitCooldownRef.current = 0;
    if (damageFlashTimeoutRef.current !== null) {
      window.clearTimeout(damageFlashTimeoutRef.current);
      damageFlashTimeoutRef.current = null;
    }
  }, [bossVoice.stop, combatSessionKey]);

  useEffect(() => {
    if (tankIntegrity > 0 || state !== 'ready' || horde.phase === 'defeat') return;
    toast.error('Tank disabled · recovery crew inbound', { duration: 2400 });
    const recoveryTimer = window.setTimeout(() => {
      setTankIntegrity(100);
      setTankStartPosition([0, 0, -12]);
      toast.success('Armor restored · back in the fight', { duration: 2200 });
    }, 2200);
    return () => window.clearTimeout(recoveryTimer);
  }, [horde.phase, state, tankIntegrity]);

  // File block mesh refs for hit detection (populated by FileBlocks component)
  const fileBlockRefsRef = useRef<React.RefObject<THREE.InstancedMesh | null>[]>([]);

  // Check for last directory on mount
  useEffect(() => {
    const isTauriRuntime = '__TAURI_INTERNALS__' in window;
    if (!isTauriRuntime) {
      setState('picking');
      return;
    }

    async function checkLastDirectory() {
      try {
        const last = await commands.getLastDirectory();
        setLastDirectory(last);

        if (last) {
          // Show reopen prompt
          setState('picking');
        } else {
          setState('picking');
        }
      } catch (err) {
        console.error('Failed to get last directory:', err);
        setState('picking');
      }
    }

    checkLastDirectory();

    // Listen for scan progress events
    const unlisten = listen<ScanProgress>('scan_progress', (event) => {
      setScanProgress(event.payload);
    }).catch(() => () => {});

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, (napalmReadyAtRef.current - Date.now()) / 1000);
      setNapalmCooldown(remaining);
      const eagleRemaining = Math.max(0, (eagleReadyAtRef.current - Date.now()) / 1000);
      setEagleCooldown(eagleRemaining);
    }, 100);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (horde.phase === 'combat' || !eagleTargetingRef.current) return;
    eagleTargetingRef.current = false;
    setEagleTargeting(false);
  }, [horde.phase]);

  // Keyboard listener for Ctrl+Z (Cmd+Z on macOS) and batch delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (state === 'ready' && horde.phase === 'defeat') {
        if (!e.repeat && (e.key === 'r' || e.key === 'R')) {
          e.preventDefault();
          handleRetryZombieDefense();
        } else if (e.key === 'm' || e.key === 'M') {
          fieldRadio.toggleMute();
        }
        return;
      }

      // Check for Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault(); // Prevent browser default undo
        handleUndoLastTrash();
      }

      // Check for Delete or X key for batch delete
      if ((e.key === 'Delete' || e.key === 'x' || e.key === 'X') && markedCount > 0) {
        e.preventDefault();
        handleBatchDelete();
      }

      if (e.key === 'Escape' && (markedCount > 0 || eagleTargetingRef.current)) {
        e.preventDefault();
        if (markedCount > 0) clearMarked();
        if (eagleTargetingRef.current) {
          eagleTargetingRef.current = false;
          setEagleTargeting(false);
          toast('Eagle Strafe designation cancelled', { duration: 1500 });
        } else {
          toast('Targets disarmed', { duration: 1800 });
        }
      }

      if (e.key === '1') setWeaponMode('cannon');
      if (e.key === '2') setWeaponMode('machinegun');
      if (e.key === '3') setWeaponMode('flamethrower');
      if (e.key === '4') setWeaponMode('napalm');
      if (state === 'ready' && (e.key === 'm' || e.key === 'M')) fieldRadio.toggleMute();
      if (state === 'ready' && !e.repeat && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        handleCallEagle();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentDirectory,
    markedCount,
    state,
    fieldRadio.toggleMute,
    horde.phase,
    horde.aliveCount,
    eagleCooldown,
    eagleBusy,
    eagleTargeting,
    resetFriendlies,
  ]); // Re-attach when relevant controls change

  async function pickDirectory() {
    void fieldRadio.prime();
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    resetMarkedState();
    setIsTraining(false);
    setFileObjective(null);
    setSectorPageIndex(0);
    setState('picking');
    setError(null);

    try {
      const result = await commands.pickDirectory();

      if (result === null) {
        // User cancelled - remain on the picker screen.
        fieldRadio.stop();
        return;
      }

      // Valid directory selected
      setCurrentDirectory(result);
      await commands.saveLastDirectory(result);
      setLastDirectory(null);
      setState('scanning');
      await scanDirectory(result);
    } catch (err) {
      // System directory blocked or other error
      fieldRadio.stop();
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function startTraining() {
    pendingHordeStartRef.current = false;
    void fieldRadio.prime();
    gameAudio.setBattlefieldActive(true);
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    setIsTraining(true);
    setCurrentDirectory(TRAINING_DIRECTORY);
    setLastDirectory(null);
    const trainingEntries = createTrainingEntries();
    setEntries(trainingEntries);
    setFileObjective(createFileObjective(trainingEntries, `${TRAINING_DIRECTORY}:${worldSessionRef.current}`));
    setSectorPageIndex(0);
    setDeletedCount(0);
    setDeletedBytes(0);
    setTankStartPosition([0, 0, -12]);
    setWeaponMode('cannon');
    setFlameFuel(1);
    setNapalmStrikes([]);
    napalmReadyAtRef.current = 0;
    setNapalmCooldown(0);
    trainingUndoStackRef.current = [];
    resetMarkedState();
    setError(null);
    setState('ready');
    void fieldRadio.launch();
  }

  function startHordeMode() {
    pendingHordeStartRef.current = true;
    void fieldRadio.prime();
    gameAudio.setBattlefieldActive(true);
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    setIsTraining(true);
    setCurrentDirectory(TRAINING_DIRECTORY);
    setLastDirectory(null);

    const trainingEntries = createTrainingEntries();
    const objective = createFileObjective(
      trainingEntries,
      `${TRAINING_DIRECTORY}:horde:${worldSessionRef.current}`,
    );
    const completedTargetPaths = new Set(objective.targets.map(target => target.path));
    setEntries(trainingEntries.filter(entry => !completedTargetPaths.has(entry.path)));
    setFileObjective(objective);
    setSectorPageIndex(0);
    setDeletedCount(0);
    setDeletedBytes(0);
    setTankStartPosition([0, 0, -12]);
    setWeaponMode('cannon');
    setFlameFuel(1);
    setNapalmStrikes([]);
    napalmReadyAtRef.current = 0;
    setNapalmCooldown(0);
    trainingUndoStackRef.current = [];
    resetMarkedState();
    setError(null);
    setState('ready');
    void fieldRadio.launch();
  }

  async function scanDirectory(path: string) {
    setSectorPageIndex(0);
    setState('scanning');
    setScanProgress(null);
    setError(null);

    try {
      const result = await commands.scanDirectory(path);
      setEntries(result);
      setFileObjective(createFileObjective(result, `${path}:${worldSessionRef.current}`));
      setState('ready');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Failed to scan directory:', errorMsg);
      setError(`Scan failed: ${errorMsg}`);
      // Stay on scanning screen briefly so user sees the error
      setTimeout(() => {
        setState('picking');
      }, 3000);
    }
  }

  async function reopenLastDirectory() {
    if (!lastDirectory) return;

    void fieldRadio.prime();
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    resetMarkedState();
    setSectorPageIndex(0);
    setCurrentDirectory(lastDirectory);
    setLastDirectory(null);
    setState('scanning');
    await scanDirectory(lastDirectory);
  }

  function changeDirectory() {
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    resetMarkedState();
    setIsTraining(false);
    setFileObjective(null);
    setSectorPageIndex(0);
    setNapalmStrikes([]);
    setLastDirectory(null);
    setState('picking');
  }

  async function navigateToDirectory(dirPath: string) {
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    resetMarkedState();
    setSectorPageIndex(0);
    setCurrentDirectory(dirPath);
    await commands.saveLastDirectory(dirPath);
    // Reset tank position to spawn near back portal when entering new directory
    setTankStartPosition([0, 0, -12]);
    await scanDirectory(dirPath);
  }

  async function navigateUp() {
    if (isTraining) {
      changeDirectory();
      return;
    }

    if (!currentDirectory) return;
    const parent = currentDirectory.replace(/\/[^/]+\/?$/, '') || '/';
    if (parent !== currentDirectory) {
      await navigateToDirectory(parent);
    }
  }

  async function handleUndoLastTrash() {
    if (isTraining) {
      const restoredEntry = trainingUndoStackRef.current.pop();
      if (!restoredEntry) return;

      // Cancel any active de-rez synchronously. If the hut is still present,
      // keep that existing entry instead of introducing a duplicate.
      finishDeletion(restoredEntry.path);
      setEntries(prev => prev.some(entry => entry.path === restoredEntry.path)
        ? prev
        : [...prev, restoredEntry]);
      setDeletedCount(prev => Math.max(0, prev - 1));
      setDeletedBytes(prev => Math.max(0, prev - restoredEntry.size));
      removePoints(restoredEntry.size);
      toast.success(`Restored ${restoredEntry.name} in training`, { duration: 2500 });
      return;
    }

    try {
      const action = await commands.undoLastTrash();

      if (action) {
        finishDeletion(action.file_path);
        removePoints(action.original_size);
        // Show success toast
        toast.success(`Restored ${action.file_name}`, { duration: 3000 });

        // Update session stats
        const [count, bytes] = await commands.getSessionStats();
        setDeletedCount(count);
        setDeletedBytes(bytes);

        // Re-add file to list (scan the directory again to get fresh list)
        if (currentDirectory) {
          const result = await commands.scanDirectory(currentDirectory);
          setEntries(result);
        }
      }
      // If nothing to undo, just ignore (don't show toast)
    } catch (err) {
      toast.error(`Failed to undo: ${err}`);
    }
  }

  // Shoot handler for Tank component
  function applyEnemyDamage(
    enemyId: string,
    amount: number,
    source: 'cannon' | 'machinegun' | 'flamethrower' | 'napalm' | 'friendly-rifle',
  ) {
    const result = damageEnemy(enemyId, amount, source);
    if (!result?.killed) return;

    const [x, y, z] = result.enemy.position;
    if (source === 'friendly-rifle') {
      spawnExplosion(new THREE.Vector3(x, y + 0.45, z), '#8b7454', 0.18);
      return;
    }
    spawnExplosion(new THREE.Vector3(x, y + 0.45, z), '#d75b32', 0.52);
    toast.success('Hostile position neutralized', { duration: 1500 });
  }

  function handleFriendlyInfantryHit(friendlyId: string, damage: number) {
    const result = damageFriendly(friendlyId, damage);
    if (!result?.killed) return;
    const livePose = friendlyPosesRef.current.get(friendlyId)?.position;
    const [x, y, z] = result.friendly.position;
    spawnExplosion(
      livePose?.clone().add(new THREE.Vector3(0, 0.5, 0))
        ?? new THREE.Vector3(x, y + 0.5, z),
      '#79654b',
      0.18,
    );
  }

  function handleEnemyProjectileHit(enemyId: string, projectile: Projectile) {
    if (projectile.kind === 'machinegun') {
      const enemy = enemies.find(candidate => candidate.id === enemyId && candidate.alive);
      if (enemy) {
        const [x, y, z] = enemy.position;
        spawnExplosion(new THREE.Vector3(x, y + 0.58, z), '#ffc46b', 0.12);
      }
    }
    applyEnemyDamage(
      enemyId,
      projectile.kind === 'cannon' ? 100 : 42,
      projectile.kind,
    );
  }

  function handleZombieProjectileHit(
    zombieId: string,
    projectile: Projectile,
    hitPoint: THREE.Vector3,
  ) {
    const result = horde.damageZombie(
      zombieId,
      projectile.kind === 'cannon' ? 140 : 40,
      projectile.kind,
    );
    if (!result) return;

    spawnExplosion(
      hitPoint,
      result.killed ? '#c66a38' : '#e5c56b',
      result.killed ? (projectile.kind === 'cannon' ? 0.52 : 0.3) : 0.1,
    );
  }

  function handleFriendlyZombieHit(event: FriendlyZombieHitEvent) {
    const result = horde.damageZombie(event.zombieId, event.damage, 'friendly-rifle');
    if (!result?.killed) return;
    spawnExplosion(result.position.clone().add(new THREE.Vector3(0, 0.48, 0)), '#776f4d', 0.16);
  }

  function handleZombieTankBreach(event: ZombieTankBreachEvent) {
    const isBossAttack = horde.zombiesRef.current.some(zombie => (
      zombie.id === event.zombieId && zombie.alive && zombie.archetype === 'boss'
    ));
    const outcome = horde.registerBreach();
    if (!outcome.accepted) return;
    handleTankHit(event.damage);
    if (isBossAttack && !outcome.defeated) bossVoice.cueMajorAttack();
    if (!outcome.defeated) return;

    // Terminal means terminal for this attempt: bypass the ordinary recovery
    // crew and leave the tank frozen for the explicit retry/exit outcome.
    setTankIntegrity(0);
    eagleTargetingRef.current = false;
    setEagleTargeting(false);
    toast.error('Defensive line overrun · tank lost', { duration: 4200 });
  }

  function handleZombieFriendlyBreach(event: ZombieFriendlyBreachEvent) {
    const isBossAttack = horde.zombiesRef.current.some(zombie => (
      zombie.id === event.zombieId && zombie.alive && zombie.archetype === 'boss'
    ));
    if (isBossAttack) bossVoice.cueMajorAttack();
    if (bossAllies.handleFriendlyBreach(event)) return;
    handleFriendlyInfantryHit(event.friendlyId, event.damage);
  }

  function handleRetryZombieDefense() {
    if (!horde.retry()) return;
    resetFriendlies();
    setTankIntegrity(100);
    setTankStartPosition([0, 0, -12]);
    setDamageFlash(false);
    tankHitCooldownRef.current = 0;
    if (damageFlashTimeoutRef.current !== null) {
      window.clearTimeout(damageFlashTimeoutRef.current);
      damageFlashTimeoutRef.current = null;
    }
    toast('Defensive line reformed · contacts inbound', { duration: 2500 });
  }

  function handleTankHit(damage: number) {
    const now = performance.now();
    if (now < tankHitCooldownRef.current || tankIntegrity <= 0) return;
    tankHitCooldownRef.current = now + 260;

    setTankIntegrity(current => Math.max(0, current - damage));
    setDamageFlash(true);
    if (damageFlashTimeoutRef.current !== null) window.clearTimeout(damageFlashTimeoutRef.current);
    damageFlashTimeoutRef.current = window.setTimeout(() => {
      setDamageFlash(false);
      damageFlashTimeoutRef.current = null;
    }, 180);
  }

  function handleShoot(position: THREE.Vector3, direction: THREE.Vector3) {
    gameAudio.playCannon();
    spawn(position, direction, 'cannon');
  }

  function handleMachineGun(position: THREE.Vector3, direction: THREE.Vector3, triggerId: number) {
    spawn(position, direction, 'machinegun', triggerId);
  }

  function handleAutomaticHit(filePath: string, triggerId: number) {
    if (automaticHitTriggerByPathRef.current.get(filePath) === triggerId) return;
    automaticHitTriggerByPathRef.current.set(filePath, triggerId);
    void handleProjectileHit(filePath);
  }

  function handleProjectileCollision(filePath: string, projectile: Projectile) {
    if (projectile.kind === 'machinegun') {
      handleAutomaticHit(filePath, projectile.triggerId);
      return;
    }
    void handleProjectileHit(filePath);
  }

  function handleFlamethrower(position: THREE.Vector3, direction: THREE.Vector3, triggerId: number) {
    const normalizedDirection = direction.clone().normalize();

    const targets = allBlocks
      .filter(block => !deletingFiles.has(block.path))
      .map(block => {
        const blockPosition = new THREE.Vector3(...block.position);
        const offset = blockPosition.sub(position);
        const distance = offset.length();
        const alignment = distance > 0 ? offset.normalize().dot(normalizedDirection) : 1;
        return { block, distance, alignment };
      })
      .filter(target => target.distance <= FLAMETHROWER_RANGE && target.alignment >= FLAMETHROWER_CONE_DOT)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6);

    for (const { block } of targets) {
      handleAutomaticHit(block.path, triggerId);
    }

    for (const enemy of livingEnemies) {
      const enemyPosition = new THREE.Vector3(...enemy.position);
      enemyPosition.y += enemy.stance === 'kneeling' ? 0.48 : 0.62;
      const offset = enemyPosition.sub(position);
      const distance = offset.length();
      const alignment = distance > 0 ? offset.normalize().dot(normalizedDirection) : 1;
      if (distance <= FLAMETHROWER_RANGE && alignment >= FLAMETHROWER_CONE_DOT) {
        applyEnemyDamage(enemy.id, 28, 'flamethrower');
      }
    }

    const zombieTargets: string[] = [];
    for (const zombie of horde.zombiesRef.current) {
      if (!zombie.alive) continue;
      const pose = horde.posesRef.current.get(zombie.id);
      if (!pose?.active) continue;
      const offsetX = pose.position.x - position.x;
      const offsetY = pose.position.y + 0.62 - position.y;
      const offsetZ = pose.position.z - position.z;
      const distance = Math.hypot(offsetX, offsetY, offsetZ);
      const alignment = distance > 0
        ? (offsetX * normalizedDirection.x
          + offsetY * normalizedDirection.y
          + offsetZ * normalizedDirection.z) / distance
        : 1;
      if (distance <= FLAMETHROWER_RANGE && alignment >= FLAMETHROWER_CONE_DOT) {
        zombieTargets.push(zombie.id);
      }
    }
    const zombieResults = horde.damageZombies(zombieTargets, 18, 'flamethrower');
    for (const result of zombieResults) {
      if (!result.killed) continue;
      spawnExplosion(result.position.clone().add(new THREE.Vector3(0, 0.55, 0)), '#d75b32', 0.3);
    }
  }

  function handleNapalm(target: THREE.Vector3, runDirection: THREE.Vector3) {
    const remaining = (napalmReadyAtRef.current - Date.now()) / 1000;
    if (remaining > 0) {
      toast(`Napalm support reloading · ${remaining.toFixed(1)}s`, { duration: 1600 });
      return;
    }

    napalmReadyAtRef.current = Date.now() + NAPALM_COOLDOWN_SECONDS * 1000;
    setNapalmCooldown(NAPALM_COOLDOWN_SECONDS);

    const id = ordnanceIdRef.current++;
    const strikeSession = worldSessionRef.current;
    const flatAimDirection = new THREE.Vector2(runDirection.x, runDirection.z).normalize();
    const strikeDirection = new THREE.Vector2(flatAimDirection.y, -flatAimDirection.x).normalize();
    const strikeRotation = Math.atan2(-strikeDirection.y, strikeDirection.x);

    const targets = allBlocks
      .filter(block => !deletingFiles.has(block.path))
      .map(block => {
        const offsetX = block.position[0] - target.x;
        const offsetZ = block.position[2] - target.z;
        const alongRun = offsetX * strikeDirection.x + offsetZ * strikeDirection.y;
        const acrossRun = -offsetX * strikeDirection.y + offsetZ * strikeDirection.x;
        return { block, alongRun, acrossRun };
      })
      .filter(candidate => (
        Math.abs(candidate.alongRun) <= NAPALM_STRIKE_LENGTH / 2
        && Math.abs(candidate.acrossRun) <= NAPALM_STRIKE_WIDTH / 2
      ))
      .sort((a, b) => Math.abs(a.alongRun) - Math.abs(b.alongRun));

    const enemyTargets = livingEnemies
      .map(enemy => {
        const offsetX = enemy.position[0] - target.x;
        const offsetZ = enemy.position[2] - target.z;
        const alongRun = offsetX * strikeDirection.x + offsetZ * strikeDirection.y;
        const acrossRun = -offsetX * strikeDirection.y + offsetZ * strikeDirection.x;
        return { enemy, alongRun, acrossRun };
      })
      .filter(candidate => (
        Math.abs(candidate.alongRun) <= NAPALM_STRIKE_LENGTH / 2
        && Math.abs(candidate.acrossRun) <= NAPALM_STRIKE_WIDTH / 2
      ));
    const zombieTargetsAtDesignation = findLivingZombiesInRectangle(
      horde.zombiesRef.current,
      horde.posesRef.current,
      target.x,
      target.z,
      strikeDirection.x,
      strikeDirection.y,
      NAPALM_STRIKE_LENGTH,
      NAPALM_STRIKE_WIDTH,
    );

    napalmPayloadsRef.current.set(id, {
      session: strikeSession,
      filePaths: targets.map(({ block }) => block.path),
      enemyIds: enemyTargets.map(({ enemy }) => enemy.id),
      position: [target.x, 0.03, target.z],
      rotation: strikeRotation,
      impacted: false,
      lastBurnDamageAt: new Map(),
    });

    const beginSynchronizedStrike = () => {
      if (worldSessionRef.current !== strikeSession) {
        napalmPayloadsRef.current.delete(id);
        return;
      }

      setNapalmStrikes(prev => [...prev, {
        id,
        position: [target.x, 0.03, target.z],
        rotation: strikeRotation,
      }]);
      const targetCount = targets.length + enemyTargets.length + zombieTargetsAtDesignation.length;
      toast(
        targetCount > 0
          ? `Phantom inbound · ${targetCount} targets in strike zone`
          : 'Phantom inbound · strike zone is clear',
        { duration: 2000 },
      );
    };

    // Audio and ordnance clocks begin in the same input frame so the authored
    // 8.45-second impact transient and the visible fireball stay aligned.
    gameAudio.playNapalmSequence(beginSynchronizedStrike);
  }

  function handleNapalmImpact(id: number) {
    const payload = napalmPayloadsRef.current.get(id);
    if (!payload || payload.session !== worldSessionRef.current) return;
    // HMR can preserve a payload created before the lingering-burn fields were
    // introduced. Normalize it at the event boundary before either handler
    // touches the map so an in-flight strike cannot crash a wave transition.
    payload.lastBurnDamageAt ??= new Map<string, number>();
    payload.impacted = true;
    const impactAt = performance.now();

    const liveFilePaths = new Set(
      allBlocks
        .filter(block => !deletingFiles.has(block.path))
        .map(block => block.path),
    );
    const filePathsAtImpact = payload.filePaths.filter(filePath => liveFilePaths.has(filePath));

    let enemyCasualties = 0;
    for (const enemyId of payload.enemyIds) {
      payload.lastBurnDamageAt.set(`enemy:${enemyId}`, impactAt);
      const result = killEnemy(enemyId, 'napalm');
      if (!result?.killed) continue;
      enemyCasualties += 1;
      const [x, y, z] = result.enemy.position;
      spawnExplosion(new THREE.Vector3(x, y + 0.4, z), '#ff6a28', 0.65);
    }

    const zombieTargets = findLivingZombiesInRectangle(
      horde.zombiesRef.current,
      horde.posesRef.current,
      payload.position[0],
      payload.position[2],
      Math.cos(payload.rotation),
      -Math.sin(payload.rotation),
      NAPALM_STRIKE_LENGTH,
      NAPALM_STRIKE_WIDTH,
    );
    const zombieResults = horde.killZombies(
      zombieTargets.map(zombie => zombie.id),
      'napalm',
    );
    for (const zombie of zombieTargets) {
      payload.lastBurnDamageAt.set(`zombie:${zombie.id}`, impactAt);
    }
    for (const result of zombieResults.slice(0, 8)) {
      spawnExplosion(result.position.clone().add(new THREE.Vector3(0, 0.45, 0)), '#ff6a28', 0.48);
    }

    const totalTargets = filePathsAtImpact.length + enemyCasualties + zombieResults.length;
    toast(
      totalTargets > 0
        ? `Napalm impact · ${totalTargets} targets caught in the burn`
        : 'Napalm impact · strike zone clear',
      { duration: 2500 },
    );

    void (async () => {
      for (const filePath of filePathsAtImpact) {
        await handleProjectileHit(filePath);
      }
    })();
  }

  function handleNapalmBurnTick(id: number, burnStrength: number) {
    const payload = napalmPayloadsRef.current.get(id);
    if (!payload || payload.session !== worldSessionRef.current) return;
    payload.lastBurnDamageAt ??= new Map<string, number>();
    payload.impacted ??= false;
    if (!payload.impacted) return;

    const strength = THREE.MathUtils.clamp(burnStrength, 0, 1);
    if (strength <= 0) return;
    const now = performance.now();
    const damageIntervalMs = NAPALM_HAZARD_DAMAGE_INTERVAL_SECONDS * 1000;
    const reserveDamageTick = (targetKey: string) => {
      const lastDamageAt = payload.lastBurnDamageAt.get(targetKey) ?? -Infinity;
      if (now - lastDamageAt < damageIntervalMs) return false;
      payload.lastBurnDamageAt.set(targetKey, now);
      return true;
    };
    const hostileDamage = Math.max(1, NAPALM_HAZARD_DAMAGE_PER_TICK * strength);
    const friendlyDamage = Math.max(
      1,
      NAPALM_HAZARD_FRIENDLY_DAMAGE_PER_TICK * strength,
    );

    for (const enemy of enemiesRef.current) {
      if (!enemy.alive
        || !isPointInsideNapalmStrike(
          enemy.position[0],
          enemy.position[2],
          payload,
          0.35,
        )
        || !reserveDamageTick(`enemy:${enemy.id}`)) continue;
      applyEnemyDamage(enemy.id, hostileDamage, 'napalm');
    }

    const zombieTargets = findLivingZombiesInRectangle(
      horde.zombiesRef.current,
      horde.posesRef.current,
      payload.position[0],
      payload.position[2],
      Math.cos(payload.rotation),
      -Math.sin(payload.rotation),
      NAPALM_STRIKE_LENGTH,
      NAPALM_STRIKE_WIDTH,
    ).filter(zombie => reserveDamageTick(`zombie:${zombie.id}`));
    const zombieResults = horde.damageZombies(
      zombieTargets.map(zombie => zombie.id),
      hostileDamage,
      'napalm',
    );
    for (const result of zombieResults) {
      if (!result.killed) continue;
      spawnExplosion(
        result.position.clone().add(new THREE.Vector3(0, 0.45, 0)),
        '#ff6a28',
        0.34,
      );
    }

    const [tankX, , tankZ] = tankStateRef.current.position;
    if (tankIntegrity > 0
      && isPointInsideNapalmStrike(tankX, tankZ, payload, 0.9)
      && reserveDamageTick('tank')) {
      handleTankHit(friendlyDamage);
    }

    for (const friendly of friendliesRef.current) {
      if (!friendly.alive) continue;
      const pose = friendlyPosesRef.current.get(friendly.id)?.position;
      const x = pose?.x ?? friendly.position[0];
      const z = pose?.z ?? friendly.position[2];
      if (!isPointInsideNapalmStrike(x, z, payload, 0.4)
        || !reserveDamageTick(`friendly:${friendly.id}`)) continue;
      handleFriendlyInfantryHit(friendly.id, friendlyDamage);
    }

    for (const ally of bossAllies.alliesRef.current) {
      if (!ally.alive) continue;
      const pose = bossAllies.posesRef.current.get(ally.id)?.position;
      const x = pose?.x ?? ally.position[0];
      const z = pose?.z ?? ally.position[2];
      if (!isPointInsideNapalmStrike(x, z, payload, 0.55)
        || !reserveDamageTick(`boss-ally:${ally.id}`)) continue;
      bossAllies.damageAlly(ally.id, friendlyDamage);
    }
  }

  function handleNapalmComplete(id: number) {
    napalmPayloadsRef.current.delete(id);
    setNapalmStrikes(prev => prev.filter(strike => strike.id !== id));
  }

  function handleCallEagle() {
    if (eagleTargetingRef.current) {
      eagleTargetingRef.current = false;
      setEagleTargeting(false);
      toast('Eagle Strafe designation cancelled', { duration: 1500 });
      return;
    }
    if (horde.phase !== 'combat' || horde.aliveCount === 0) return;
    if (eagleBusy) {
      toast('Eagle Strafe already active', { duration: 1400 });
      return;
    }

    const remaining = (eagleReadyAtRef.current - Date.now()) / 1000;
    if (remaining > 0) {
      toast(`Eagle Strafe rearming · ${remaining.toFixed(1)}s`, { duration: 1500 });
      return;
    }

    eagleTargetingRef.current = true;
    setEagleTargeting(true);
    toast('Eagle Strafe designator active · click terrain to mark the lane', {
      duration: 2200,
      icon: '⌖',
    });
  }

  function handleEagleTarget(target: THREE.Vector3, aimDirection: THREE.Vector3) {
    if (!eagleTargetingRef.current) return;
    eagleTargetingRef.current = false;
    setEagleTargeting(false);

    if (horde.phase !== 'combat' || horde.aliveCount === 0 || eagleBusy) return;
    const remaining = (eagleReadyAtRef.current - Date.now()) / 1000;
    if (remaining > 0) return;

    const flatAimDirection = new THREE.Vector2(aimDirection.x, aimDirection.z);
    if (flatAimDirection.lengthSq() < 0.0001) flatAimDirection.set(0, -1);
    flatAimDirection.normalize();
    // Match the napalm designator: the support asset crosses the player's
    // current line of aim, making the chosen lane readable from the tank.
    const strikeDirection = new THREE.Vector2(
      flatAimDirection.y,
      -flatAimDirection.x,
    ).normalize();
    const strike: EagleStrafe = {
      id: ordnanceIdRef.current++,
      position: [target.x, 0.03, target.z],
      rotation: Math.atan2(-strikeDirection.y, strikeDirection.x),
    };

    const strikeSession = worldSessionRef.current;
    eaglePayloadsRef.current.set(strike.id, {
      session: strikeSession,
      position: strike.position,
      rotation: strike.rotation,
    });
    eagleReadyAtRef.current = Date.now() + EAGLE_COOLDOWN_SECONDS * 1000;
    setEagleCooldown(EAGLE_COOLDOWN_SECONDS);
    setEagleBusy(true);
    setEagleStrikes([strike]);
    toast('Target fixed · Eagle Strafe inbound with twin .50s', { duration: 1900, icon: '🦅' });
  }

  function handleEagleImpact(id: number) {
    const payload = eaglePayloadsRef.current.get(id);
    if (!payload || payload.session !== worldSessionRef.current) return;

    const targets = findLivingZombiesInRectangle(
      horde.zombiesRef.current,
      horde.posesRef.current,
      payload.position[0],
      payload.position[2],
      Math.cos(payload.rotation),
      -Math.sin(payload.rotation),
      EAGLE_STRIKE_LENGTH,
      EAGLE_STRIKE_WIDTH,
    );
    const results = horde.damageZombies(
      targets.map(zombie => zombie.id),
      EAGLE_STRIKE_DAMAGE,
      'eagle',
    );
    const kills = results.filter(result => result.killed);
    for (const result of kills.slice(0, 8)) {
      spawnExplosion(result.position.clone().add(new THREE.Vector3(0, 0.5, 0)), '#f0b04d', 0.34);
    }
    toast(
      kills.length > 0
        ? `Eagle Strafe · ${kills.length} undead cut down`
        : 'Eagle Strafe · lane clear',
      { duration: 2100 },
    );
  }

  function handleEagleComplete(id: number) {
    eaglePayloadsRef.current.delete(id);
    setEagleStrikes(current => current.filter(strike => strike.id !== id));
  }

  function handleEagleAudioCue(cue: EagleAudioCue) {
    if (cue === 'approach') {
      gameAudio.playEagleApproach();
    } else {
      gameAudio.setEagleGunsActive(cue === 'guns-start');
      if (cue === 'guns-stop') {
        // The outbound silhouette is cosmetic after the firing pass. Releasing
        // support here lets a newly-ready wave replace that visual immediately.
        setEagleBusy(false);
      }
    }
  }

  function getProtectedObjectiveOriginalPaths() {
    const livePaths = new Set(entries.filter(entry => !entry.is_dir).map(entry => entry.path));
    return new Set(
      (fileObjective?.targets ?? [])
        .filter(target => livePaths.has(target.path))
        .map(target => target.duplicateOfPath),
    );
  }

  // Projectile hit handler with two-shot deletion logic
  async function handleProjectileHit(filePath: string) {
    if (getProtectedObjectiveOriginalPaths().has(filePath)) {
      unmarkFile(filePath);
      toast('Retained original protected · destroy the highlighted copy', {
        duration: 2600,
        icon: '◆',
      });
      return;
    }

    if (isMarked(filePath)) {
      // Second hit: delete the file
      try {
        const trainingEntry = isTraining ? entries.find(entry => entry.path === filePath) : undefined;
        const duplicateTarget = fileObjective?.targets.find(target => (
          target.path === filePath
          && entries.some(entry => entry.path === target.duplicateOfPath && !entry.is_dir)
        ));
        const action = isTraining
          ? {
              file_path: filePath,
              file_name: trainingEntry?.name || filePath,
              original_size: trainingEntry?.size || 0,
              trash_timestamp: Date.now(),
            }
          : await commands.moveToTrash(filePath, duplicateTarget?.duplicateOfPath);

        if (trainingEntry) {
          trainingUndoStackRef.current.push(trainingEntry);
        }

        // Add score points for the deletion
        const points = addPoints(action.original_size);

        // Spawn explosion at file location
        const block = allBlocks.find(b => b.path === filePath);
        if (block) {
          spawnExplosion(
            new THREE.Vector3(block.position[0], block.position[1], block.position[2]),
            block.color,
            block.scale
          );
        }

        // Show success toast with points
        toast.success(
          `Deleted ${action.file_name} (+${points} pts)`,
          { duration: 3000 }
        );

        // Update session stats
        if (isTraining) {
          setDeletedCount(prev => prev + 1);
          setDeletedBytes(prev => prev + action.original_size);
        } else {
          const [count, bytes] = await commands.getSessionStats();
          setDeletedCount(count);
          setDeletedBytes(bytes);
        }

        // Start de-rez animation
        startDeletion(filePath);

        // Remove from entries after animation completes (handled by FileBlocks onDeletionComplete)
      } catch (err) {
        toast.error(`Failed to delete file: ${err}`);
      }
    } else {
      // First hit: mark the file
      markFile(filePath);
    }
  }

  // Callback to receive mesh refs from FileBlocks
  function handleMeshRefsReady(refs: React.RefObject<THREE.InstancedMesh | null>[]) {
    fileBlockRefsRef.current = refs;
  }

  // Batch delete all marked files
  async function handleBatchDelete() {
    if (markedCount === 0) return;

    const protectedOriginalPaths = getProtectedObjectiveOriginalPaths();
    const filesToDelete = Array.from(markedFiles).filter(path => !protectedOriginalPaths.has(path));
    const protectedMarkedCount = markedCount - filesToDelete.length;
    if (protectedMarkedCount > 0) {
      toast('Retained objective original disarmed and protected', {
        duration: 2600,
        icon: '◆',
      });
    }
    if (filesToDelete.length === 0) {
      clearMarked();
      return;
    }

    try {
      if (isTraining) {
        const fileBlocks = filesToDelete
          .map(filePath => allBlocks.find(block => block.path === filePath))
          .filter((block): block is NonNullable<typeof block> => block !== undefined);
        const entriesToDelete = filesToDelete
          .map(filePath => entries.find(entry => entry.path === filePath))
          .filter((entry): entry is FileEntry => entry !== undefined);
        const bytesFreed = entriesToDelete.reduce((total, entry) => total + entry.size, 0);

        await deleteAllMarked(async () => {}, protectedOriginalPaths);
        trainingUndoStackRef.current.push(...entriesToDelete);
        setDeletedCount(prev => prev + entriesToDelete.length);
        setDeletedBytes(prev => prev + bytesFreed);
        addPoints(bytesFreed);

        fileBlocks.forEach((block, index) => {
          setTimeout(() => {
            spawnExplosion(
              new THREE.Vector3(block.position[0], block.position[1], block.position[2]),
              block.color,
              block.scale,
            );
          }, index * 80);
        });

        toast.success(`Purged ${entriesToDelete.length} training targets`, { duration: 3000 });
        return;
      }

      // Capture current session bytes for point calculation
      const [, prevBytes] = await commands.getSessionStats();

      // Capture marked files and their block data before deletion
      const fileBlocks = filesToDelete.map(filePath =>
        allBlocks.find(b => b.path === filePath)
      ).filter(block => block !== undefined);

      // Delete all marked files and keep failed targets armed for another attempt.
      const successfulPaths = await deleteAllMarked(filePath => {
        const duplicateTarget = fileObjective?.targets.find(target => (
          target.path === filePath
          && entries.some(entry => entry.path === target.duplicateOfPath && !entry.is_dir)
        ));
        return commands.moveToTrash(filePath, duplicateTarget?.duplicateOfPath);
      }, protectedOriginalPaths);
      const successfulPathSet = new Set(successfulPaths);
      const successfulBlocks = fileBlocks.filter(block => successfulPathSet.has(block.path));
      const failedCount = filesToDelete.length - successfulPaths.length;

      // Stagger explosions for chain reaction feel (80ms apart)
      successfulBlocks.forEach((block, index) => {
        setTimeout(() => {
          spawnExplosion(
            new THREE.Vector3(block.position[0], block.position[1], block.position[2]),
            block.color,
            block.scale
          );
        }, index * 80);
      });

      // Update session stats after batch delete
      const [count, bytes] = await commands.getSessionStats();
      setDeletedCount(count);
      setDeletedBytes(bytes);

      // Add points based on bytes freed in this batch
      const bytesFreed = bytes - prevBytes;
      addPoints(bytesFreed);

      if (successfulPaths.length > 0) {
        toast.success(`Deleted ${successfulPaths.length} marked files`, { duration: 3000 });
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} targets could not be deleted and remain armed`, { duration: 4000 });
      }
    } catch (err) {
      toast.error(`Failed to batch delete: ${err}`);
    }
  }

  // Called when a file's de-rez animation completes
  function handleDeletionComplete(filePath: string) {
    // Undo may have synchronously cancelled this animation in the same frame.
    // Only a still-pending deletion is allowed to remove the live entry.
    if (!finishDeletion(filePath)) return;
    // Remove file from entries
    setEntries(prev => prev.filter(e => e.path !== filePath));
  }

  // Prepare data for 3D scene (needs to be before early returns so handlers can reference allBlocks)
  const environmentSeed = useMemo(
    () => hashCombatSession(currentDirectory ?? TRAINING_DIRECTORY),
    [currentDirectory],
  );
  const missionProgress = useMemo(
    () => getFileObjectiveProgress(fileObjective, entries),
    [entries, fileObjective],
  );
  const visibleFileObjective = missionProgress.phase === 'unavailable'
    ? null
    : fileObjective;
  const activeObjectivePath = missionProgress.phase === 'active'
    ? missionProgress.remainingPaths[0]
    : undefined;
  const sectorPage = useMemo(
    () => createSectorPage(entries, sectorPageIndex, activeObjectivePath),
    [activeObjectivePath, entries, sectorPageIndex],
  );
  const { blocksByCategory, folders, allBlocks } = useFileBlocks(
    sectorPage.entries,
    visibleFileObjective,
  );
  const missionTarget = useMemo(() => {
    const nextPath = missionProgress.remainingPaths[0];
    return fileObjective?.targets.find(target => target.path === nextPath);
  }, [fileObjective, missionProgress.remainingPaths]);
  const tankColliders = useMemo<TankCollider[]>(() => {
    const colliders: TankCollider[] = [];
    const rotatePoint = (
      originX: number,
      originZ: number,
      rotation: number,
      localX: number,
      localZ: number,
    ) => ({
      x: originX + Math.cos(rotation) * localX + Math.sin(rotation) * localZ,
      z: originZ - Math.sin(rotation) * localX + Math.cos(rotation) * localZ,
    });

    // Mission huts are the only file structures that block the vehicle. Keeping
    // this set bounded avoids turning a huge directory into a per-frame collision
    // scan while ensuring the actual objective compound cannot be ghosted through.
    for (const block of allBlocks) {
      if (!block.isObjective) continue;
      colliders.push({
        kind: 'circle',
        id: `objective-hut-${block.path}`,
        x: block.position[0],
        z: block.position[2],
        radius: THREE.MathUtils.clamp(block.scale * 0.62, 0.48, 1.05),
      });
    }

    for (const fightingPosition of US_FIGHTING_POSITIONS) {
      const [originX, , originZ] = fightingPosition.position;
      const halfWidth = fightingPosition.width * 0.5;
      const left = rotatePoint(originX, originZ, fightingPosition.rotation, -halfWidth, 0);
      const right = rotatePoint(originX, originZ, fightingPosition.rotation, halfWidth, 0);
      colliders.push({
        kind: 'capsule',
        id: `us-${fightingPosition.id}-front`,
        ax: left.x,
        az: left.z,
        bx: right.x,
        bz: right.z,
        radius: 0.25,
      });
      for (const side of [-1, 1]) {
        const mouth = rotatePoint(originX, originZ, fightingPosition.rotation, side * halfWidth, -0.08);
        const rear = rotatePoint(originX, originZ, fightingPosition.rotation, side * halfWidth, -1.12);
        colliders.push({
          kind: 'capsule',
          id: `us-${fightingPosition.id}-wing-${side}`,
          ax: mouth.x,
          az: mouth.z,
          bx: rear.x,
          bz: rear.z,
          radius: 0.23,
        });
      }
    }

    // Low VC fighting-position lips remain after casualties and provide genuine
    // vehicle cover without making the surrounding brush an invisible wall.
    for (const enemy of enemies) {
      const approachX = -enemy.position[0];
      const approachZ = -12 - enemy.position[2];
      const approachLength = Math.hypot(approachX, approachZ) || 1;
      const forwardX = approachX / approachLength;
      const forwardZ = approachZ / approachLength;
      const sideX = -forwardZ;
      const sideZ = forwardX;
      const centerX = enemy.position[0] + forwardX * 0.3;
      const centerZ = enemy.position[2] + forwardZ * 0.3;
      colliders.push({
        kind: 'capsule',
        id: `${enemy.id}-fighting-position`,
        ax: centerX - sideX * 0.52,
        az: centerZ - sideZ * 0.52,
        bx: centerX + sideX * 0.52,
        bz: centerZ + sideZ * 0.52,
        radius: 0.2,
      });
    }

    const [wreckX, , wreckZ] = CRASHED_HUEY_TRANSFORM.position;
    const wreckYaw = CRASHED_HUEY_TRANSFORM.rotation[1];
    const airframeYaw = wreckYaw + 0.18;
    const cabin = rotatePoint(wreckX, wreckZ, airframeYaw, 0, -0.15);
    const tailStart = rotatePoint(wreckX, wreckZ, airframeYaw, 0, 0.72);
    const tailEnd = rotatePoint(wreckX, wreckZ, airframeYaw, 0, 4.18);
    const rotorStart = rotatePoint(wreckX, wreckZ, wreckYaw, -5.35, 1.85);
    const rotorEnd = rotatePoint(wreckX, wreckZ, wreckYaw, -2.25, 1.85);
    colliders.push(
      { kind: 'circle', id: 'crashed-huey-cabin', x: cabin.x, z: cabin.z, radius: 1.2 },
      { kind: 'capsule', id: 'crashed-huey-tail', ax: tailStart.x, az: tailStart.z, bx: tailEnd.x, bz: tailEnd.z, radius: 0.36 },
      { kind: 'capsule', id: 'crashed-huey-rotor', ax: rotorStart.x, az: rotorStart.z, bx: rotorEnd.x, bz: rotorEnd.z, radius: 0.13 },
    );

    return colliders;
  }, [allBlocks, enemies]);

  useEffect(() => {
    const objectiveId = fileObjective?.id ?? null;
    const previous = missionSnapshotRef.current;
    if (previous.id === objectiveId
      && previous.remaining > 0
      && missionProgress.remaining === 0
      && missionProgress.total > 0) {
      const nightmareStarted = objectiveId ? horde.begin(objectiveId) : false;
      toast.success(nightmareStarted
        ? 'Cleanup complete · anomalous contacts inbound'
        : 'Bonus cleanup complete · confirmed duplicate eliminated', {
        duration: 4200,
        icon: '★',
      });
    }
    missionSnapshotRef.current = {
      id: objectiveId,
      remaining: missionProgress.remaining,
    };
  }, [fileObjective?.id, horde.begin, missionProgress.remaining, missionProgress.total]);

  useEffect(() => {
    const previous = bonusAnnouncementRef.current;
    if (horde.phase === 'locked') {
      bonusAnnouncementRef.current = { phase: 'locked', wave: 0 };
      return;
    }

    const showTakeover = (wave: number, boss = false) => {
      nightmareTakeoverTokenRef.current += 1;
      setNightmareTakeover({
        token: nightmareTakeoverTokenRef.current,
        wave,
        boss,
      });
    };

    if (horde.phase === 'warning' && previous.phase !== 'warning') {
      showTakeover(1);
    }

    if (previous.phase === 'locked') {
      // The warning ambience begins here. The separate tank-radio Change cue is
      // anchored to first-wave combat at T+0 and never shares the intro clock.
      resetFriendlies();
      setTankIntegrity(100);
      zombieAmbience.start();
      zombieAmbience.playIntro();
      fieldRadio.beginBonusRound();
    }

    if (horde.phase === 'combat'
      && (previous.phase !== 'combat' || previous.wave !== horde.wave)) {
      const isBossWave = horde.wave === horde.maxWaves;
      if (horde.wave === 1) fieldRadio.cueBonusTrack();
      if (horde.wave > 1) showTakeover(horde.wave, isBossWave);
      if (isBossWave) {
        fieldRadio.cueFinalBossTrack();
        bossVoice.prepare();
        zombieAmbience.playBossScreech();
      }

      // Every wave begins with support available; a long wave can earn another
      // pass after the normal cooldown without growing a new upgrade system.
      eagleReadyAtRef.current = 0;
      setEagleCooldown(0);
      toast(`Nightmare wave ${horde.wave}/${horde.maxWaves} · ${horde.aliveCount} contacts`, {
        duration: 2300,
        icon: '⚠',
      });
    } else if (horde.phase === 'victory' && previous.phase !== 'victory') {
      zombieAmbience.stop();
      toast.success(`Nightmare survived · ${horde.totalKills} undead neutralized`, {
        duration: 4200,
        icon: '🦅',
      });
    }

    bonusAnnouncementRef.current = { phase: horde.phase, wave: horde.wave };
  }, [
    bossVoice.prepare,
    fieldRadio.beginBonusRound,
    fieldRadio.cueBonusTrack,
    fieldRadio.cueFinalBossTrack,
    horde.aliveCount,
    horde.maxWaves,
    horde.phase,
    horde.totalKills,
    horde.wave,
    resetFriendlies,
    zombieAmbience.playBossScreech,
    zombieAmbience.playIntro,
    zombieAmbience.start,
    zombieAmbience.stop,
  ]);

  useEffect(() => {
    // Deleting the final item on the final page can shrink the grid count. The
    // current rendered slice is already clamped; mirror it back into state so
    // navigation remains monotonic after the de-rez animation completes.
    setSectorPageIndex(current => (
      current === sectorPage.pageIndex ? current : sectorPage.pageIndex
    ));
  }, [sectorPage.pageIndex]);

  const sectorPagingLocked = horde.phase === 'warning'
    || horde.phase === 'combat'
    || horde.phase === 'intermission';

  function changeSectorPage(direction: -1 | 1) {
    if (sectorPagingLocked) return;
    // Avoid unmounting a hut during its short de-rez animation. Clear marks that
    // would become hidden, but retain the pinned bonus target's armed state.
    if (deletingFiles.size > 0) return;
    clearMarked(activeObjectivePath ? [activeObjectivePath] : []);
    // Folder portals are centered within each bounded page. Return the tank to
    // the clear approach lane before swapping the slice so a newly materialized
    // portal can never overlap the stationary vehicle and navigate immediately.
    setTankStartPosition([0, 0, -12]);
    setSectorPageIndex(current => Math.max(
      0,
      Math.min(sectorPage.pageCount - 1, current + direction),
    ));
  }
  const combatObstacles = allBlocks.map(block => ({
    position: block.position,
    radius: Math.max(0.62, block.scale * 0.74),
  }));

  // Calculate folder positions (folders get front rows in grid layout)
  const folderPositions = new Map<string, [number, number, number]>();
  const folderEntries = folders;
  const allPositions = layoutFilesInGrid(folderEntries);

  for (const folder of folderEntries) {
    const pos = allPositions.get(folder.path);
    if (pos) {
      folderPositions.set(folder.path, [pos.x, pos.y, pos.z]);
    }
  }

  // Compute child counts for folders
  const folderChildCounts = new Map<string, number>();
  for (const folder of folderEntries) {
    // Count immediate children visible in current entries list
    const childCount = entries.filter(e => {
      const parentPath = e.path.substring(0, e.path.lastIndexOf('/'));
      return parentPath === folder.path;
    }).length;
    folderChildCounts.set(folder.path, childCount || 1);
  }

  // Parent path for back portal
  const parentPath = currentDirectory ? currentDirectory.replace(/\/[^/]+\/?$/, '') || '/' : '/';
  const isAtRoot = isTraining || currentDirectory === '/' || !currentDirectory;

  // Prepare portal data for collision detection
  const folderPortalData = folders.flatMap((folder) => {
    const position = folderPositions.get(folder.path);
    if (!position) return [];

    const childCount = folderChildCounts.get(folder.path) || 0;
    return [{
      path: folder.path,
      position,
      scale: folderToScale(childCount, folder.size),
    }];
  });

  const backPortalPosition: [number, number, number] | null = !isAtRoot ? [0, 0.5, -15] : null;

  // Prepare minimap data
  const minimapFileBlocks = allBlocks.map(block => ({
    position: block.position,
    color: block.color,
    isMarked: markedFiles.has(block.path),
    isObjective: block.isObjective,
  }));

  const minimapFolderPortals = folderPortalData.map(portal => ({
    position: portal.position,
  }));

  const markedBytes = entries.reduce(
    (total, entry) => total + (!entry.is_dir && markedFiles.has(entry.path) ? entry.size : 0),
    0,
  );

  if (state === 'checking') {
    return (
      <div className="container">
        <div className="loading">Checking for last directory...</div>
      </div>
    );
  }

  if (state === 'picking') {
    return (
      <div className="container">
        <DirectoryPicker
          onPick={pickDirectory}
          lastDirectory={lastDirectory}
          onReopenLast={lastDirectory ? reopenLastDirectory : undefined}
          onStartTraining={startTraining}
          onStartHordeMode={startHordeMode}
          error={error}
        />
      </div>
    );
  }

  if (state === 'scanning') {
    return (
      <div className="container">
        <div className="loading">
          <h2>Scanning directory...</h2>
          {error && <div className="error-message">{error}</div>}
          {scanProgress && (
            <div className="scan-progress">
              <p>Files scanned: {scanProgress.files_scanned}</p>
              <p>Total size: {formatBytes(scanProgress.total_bytes)}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="scene-container">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#12180e',
            color: '#e6e0bd',
            border: '1px solid #879b63',
            borderRadius: '2px',
          },
          success: {
            iconTheme: {
              primary: '#a8bf78',
              secondary: '#12180e',
            },
          },
          error: {
            iconTheme: {
              primary: '#e36d32',
              secondary: '#12180e',
            },
          },
        }}
      />

      <HUD
        deletedCount={deletedCount}
        deletedBytes={deletedBytes}
        score={score}
        fileCount={sectorPage.totalFiles}
        folderCount={sectorPage.totalFolders}
        markedCount={markedCount}
        markedBytes={markedBytes}
        onClearMarked={() => clearMarked()}
        weaponMode={weaponMode}
        onWeaponChange={setWeaponMode}
        flameFuel={flameFuel}
        napalmCooldown={napalmCooldown}
        cannonReload={cannonReload}
        machineGunHeat={machineGunHeat}
        tankIntegrity={tankIntegrity}
        hostileCount={hostileCount + horde.aliveCount}
        friendlyCount={friendlyAliveCount + (bossAllies.active ? bossAllies.livingCount : 0)}
        missionTotal={missionProgress.total}
        missionRemaining={missionProgress.remaining}
        missionTargetName={missionTarget?.name}
        missionOriginalName={missionTarget?.duplicateOfName}
        damageFlash={damageFlash}
        radioMuted={fieldRadio.muted}
        radioPlaying={fieldRadio.playing}
        radioTrackName={fieldRadio.trackName}
        onToggleRadioMute={fieldRadio.toggleMute}
        radioSourceLabel={fieldRadio.sourceLabel}
        bonusPhase={horde.phase}
        bonusWave={horde.wave}
        bonusTotalWaves={horde.maxWaves}
        bonusRemaining={horde.aliveCount}
        bonusBreaches={horde.breachCount}
        bonusMaxBreaches={horde.maxBreaches}
        bonusBossHealth={nightmareBoss?.health}
        bonusBossMaxHealth={nightmareBoss?.maxHealth}
        onRetryBonus={handleRetryZombieDefense}
        eagleCooldown={eagleCooldown}
        eagleActive={eagleBusy}
        eagleTargeting={eagleTargeting}
        onCallEagle={handleCallEagle}
        bossAllies={bossAllies.allies}
        bossAlliesVisible={finalBossEncounterActive && !nightmareTakeover}
      />

      {nightmareTakeover && (
        <NightmareWaveTakeover
          key={nightmareTakeover.token}
          active
          wave={nightmareTakeover.wave}
          boss={nightmareTakeover.boss}
          onComplete={() => {
            if (nightmareTakeover.boss
              && horde.phase === 'combat'
              && horde.wave === horde.maxWaves) {
              bossVoice.startBossFight();
            }
            setNightmareTakeover(current => (
              current?.token === nightmareTakeover.token ? null : current
            ));
          }}
        />
      )}

      <Crosshair weaponMode={weaponMode} eagleTargeting={eagleTargeting} />

      <Minimap
        tankStateRef={tankStateRef}
        fileBlocks={minimapFileBlocks}
        folderPortals={minimapFolderPortals}
        backPortalPosition={backPortalPosition}
        enemies={livingEnemies}
        friendlies={livingFriendlies}
        zombiePosesRef={horde.posesRef}
      />

      <div className="header" data-game-ui>
        <div className="header-left">
          <button
            onClick={isTraining ? changeDirectory : navigateUp}
            className="btn-back"
            title={isTraining ? 'Exit training' : 'Go up one directory'}
          >
            ◂
          </button>
          <h2>{currentDirectory}</h2>
          {isTraining && <span className="training-badge">Simulation</span>}
        </div>
        <div className="header-actions">
          {sectorPage.pageCount > 1 && (
            <nav className="sector-grid-controls" aria-label="Sector grid pages">
              <button
                type="button"
                onClick={() => changeSectorPage(-1)}
                disabled={sectorPage.pageIndex === 0
                  || deletingFiles.size > 0
                  || sectorPagingLocked}
                aria-label="Previous sector grid"
              >
                Prev
              </button>
              <span>Sector grid <b>{sectorPage.pageIndex + 1}/{sectorPage.pageCount}</b></span>
              <button
                type="button"
                onClick={() => changeSectorPage(1)}
                disabled={sectorPage.pageIndex === sectorPage.pageCount - 1
                  || deletingFiles.size > 0
                  || sectorPagingLocked}
                aria-label="Next sector grid"
              >
                Next
              </button>
            </nav>
          )}
          <button onClick={changeDirectory} className="btn-secondary">
            {isTraining ? 'Exit Training' : 'Change Directory'}
          </button>
        </div>
      </div>

      <KeyboardControls map={CONTROLS_MAP}>
        <Scene
          environmentSeed={environmentSeed}
          tankRef={tankRef}
          nightmareActive={horde.phase !== 'locked' && horde.phase !== 'victory'}
        >
          <Tank
            ref={tankRef}
            initialPosition={tankStartPosition}
            tankStateRef={tankStateRef}
            weaponMode={weaponMode}
            onShoot={handleShoot}
            onMachineGun={handleMachineGun}
            onFlamethrower={handleFlamethrower}
            onFlameFuelChange={setFlameFuel}
            onNapalm={handleNapalm}
            eagleTargeting={eagleTargeting}
            onEagleTarget={handleEagleTarget}
            onMachineGunAudioChange={gameAudio.setMachineGunActive}
            onCannonReloadChange={setCannonReload}
            onMachineGunHeatChange={setMachineGunHeat}
            onFlamethrowerAudioChange={gameAudio.setFlamethrowerActive}
            onMovementAudioChange={gameAudio.setMovementActive}
            environmentSeed={environmentSeed}
            colliders={tankColliders}
            disabled={horde.phase === 'defeat'}
          />
          <TankWaterEffects
            tankRef={tankRef}
            seed={environmentSeed}
            onRiverStateChange={gameAudio.setRiverState}
          />
          <CameraRig
            tankRef={tankRef}
            napalmCinematic={napalmStrikes.length > 0 && napalmCooldown > 0.5}
          />

          <USInfantrySquad
            enemies={enemies}
            zombies={horde.zombies}
            zombiePosesRef={horde.posesRef}
            friendlies={friendlies}
            friendlyPosesRef={friendlyPosesRef}
            obstacles={combatObstacles}
            enabled={(hostileCount > 0 || horde.phase === 'combat')
              && horde.phase !== 'defeat'
              && friendlyAliveCount > 0}
            onEnemyHit={({ enemyId, damage }) => applyEnemyDamage(enemyId, damage, 'friendly-rifle')}
            onZombieHit={handleFriendlyZombieHit}
            onFriendlyFire={gameAudio.playFriendlyRifle}
          />

          <VietCongCombatants
            enemies={enemies}
            friendliesRef={friendliesRef}
            friendlyPosesRef={friendlyPosesRef}
            tankRef={tankRef}
            obstacles={combatObstacles}
            enabled={horde.phase !== 'defeat'
              && hostileCount > 0
              && (tankIntegrity > 0 || friendlyAliveCount > 0)}
            tankTargetEnabled={tankIntegrity > 0}
            onTankHit={event => handleTankHit(event.damage)}
            onFriendlyHit={event => handleFriendlyInfantryHit(event.friendlyId, event.damage)}
            onEnemyFire={gameAudio.playEnemyRifle}
          />

          <ZombieHorde
            zombies={horde.zombies}
            posesRef={horde.posesRef}
            tankRef={tankRef}
            friendliesRef={bossAllies.friendliesRef}
            friendlyPosesRef={bossAllies.posesRef}
            obstacles={combatObstacles}
            active={horde.phase === 'combat' && !nightmareTakeover}
            tankTargetEnabled={tankIntegrity > 0}
            onTankBreach={handleZombieTankBreach}
            onFriendlyBreach={handleZombieFriendlyBreach}
          />

          <FinalBossAllies
            allies={bossAllies.allies}
            posesRef={bossAllies.posesRef}
            zombies={horde.zombies}
            zombiePosesRef={horde.posesRef}
            obstacles={combatObstacles}
            enabled={finalBossEncounterActive && !nightmareTakeover}
            onZombieHit={handleFriendlyZombieHit}
            onFire={event => {
              if (event.weapon !== 'cavalry-saber') gameAudio.playFriendlyRifle(event);
            }}
          />

          <PortalCollision
            tankRef={tankRef}
            folderPortals={folderPortalData}
            backPortalPosition={backPortalPosition}
            onEnterFolder={navigateToDirectory}
            onEnterBackPortal={navigateUp}
          />

          <ProjectileManager
            pool={pool}
            despawn={despawn}
            onHit={handleProjectileCollision}
            onEnemyHit={handleEnemyProjectileHit}
            onZombieHit={handleZombieProjectileHit}
            allBlocks={allBlocks}
            enemies={livingEnemies}
            zombies={horde.zombies}
            zombiePosesRef={horde.posesRef}
          />

          {explosions.length > 0 && (
            <ExplosionParticles explosions={explosions} onExplosionComplete={despawnExplosion} />
          )}

          {napalmStrikes.length > 0 && (
            <OrdnanceEffects
              napalmStrikes={napalmStrikes}
              onNapalmImpact={handleNapalmImpact}
              onNapalmBurnTick={handleNapalmBurnTick}
              onNapalmComplete={handleNapalmComplete}
            />
          )}

          {eagleStrikes.length > 0 && (
            <BaldEagleSupport
              strikes={eagleStrikes}
              onImpact={handleEagleImpact}
              onComplete={handleEagleComplete}
              onAudioCue={handleEagleAudioCue}
            />
          )}

          <FileBlocks
            blocks={blocksByCategory}
            onHover={() => {}}
            onMeshRefsReady={handleMeshRefsReady}
            markedFiles={markedFiles}
            deletingFiles={deletingFiles}
            onDeletionComplete={handleDeletionComplete}
          />

          {folders.map((folder) => {
            const position = folderPositions.get(folder.path);
            const childCount = folderChildCounts.get(folder.path) || 0;
            if (!position) return null;

            return (
              <FolderPortal
                key={folder.path}
                folder={folder}
                position={position}
                scale={folderToScale(childCount, folder.size)}
                childCount={childCount}
                totalSize={folder.size}
                onHover={() => {}}
              />
            );
          })}

          {!isAtRoot && (
            <BackPortal parentPath={parentPath} />
          )}

          <Particles />
        </Scene>
      </KeyboardControls>
    </div>
  );
}

export default App;
