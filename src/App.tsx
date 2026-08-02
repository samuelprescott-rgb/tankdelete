import { useEffect, useState, useRef } from 'react';
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
import { OrdnanceEffects } from './components/Scene/OrdnanceEffects';
import { VietCongCombatants } from './components/Scene/VietCongCombatants';
import {
  USInfantrySquad,
  US_INFANTRY_MINIMAP_CONTACTS,
} from './components/Scene/USInfantrySquad';
import { useEnemyCombat } from './hooks/useEnemyCombat';
import {
  FLAMETHROWER_CONE_DOT,
  FLAMETHROWER_RANGE,
  NapalmStrike,
  NAPALM_COOLDOWN_SECONDS,
  NAPALM_STRIKE_LENGTH,
  NAPALM_STRIKE_WIDTH,
  WeaponMode,
} from './lib/weapons';
import { hashCombatSession } from './lib/combat';

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
  const [flameFuel, setFlameFuel] = useState(1);
  const [napalmStrikes, setNapalmStrikes] = useState<NapalmStrike[]>([]);
  const [napalmCooldown, setNapalmCooldown] = useState(0);
  const [combatSessionKey, setCombatSessionKey] = useState(0);
  const [tankIntegrity, setTankIntegrity] = useState(100);
  const [damageFlash, setDamageFlash] = useState(false);
  const trainingUndoStackRef = useRef<FileEntry[]>([]);
  const ordnanceIdRef = useRef(0);
  const napalmReadyAtRef = useRef(0);
  const worldSessionRef = useRef(0);
  const automaticHitTriggerByPathRef = useRef(new Map<string, number>());
  const napalmPayloadsRef = useRef(new Map<number, {
    session: number;
    filePaths: string[];
    enemyIds: string[];
  }>());
  const tankHitCooldownRef = useRef(0);
  const damageFlashTimeoutRef = useRef<number | null>(null);

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
  const {
    enemies,
    livingEnemies,
    aliveCount: hostileCount,
    damageEnemy,
    killEnemy,
  } = useEnemyCombat({ sessionKey: combatSessionKey, count: 8 });

  useEffect(() => {
    if (state === 'ready') gameAudio.setBattlefieldActive(true);
    else gameAudio.stopAllLoops();
  }, [state, gameAudio.setBattlefieldActive, gameAudio.stopAllLoops]);

  useEffect(() => {
    setTankIntegrity(100);
    setDamageFlash(false);
    setNapalmStrikes([]);
    setNapalmCooldown(0);
    napalmReadyAtRef.current = 0;
    napalmPayloadsRef.current.clear();
    tankHitCooldownRef.current = 0;
    if (damageFlashTimeoutRef.current !== null) {
      window.clearTimeout(damageFlashTimeoutRef.current);
      damageFlashTimeoutRef.current = null;
    }
  }, [combatSessionKey]);

  useEffect(() => {
    if (tankIntegrity > 0 || state !== 'ready') return;
    toast.error('Tank disabled · recovery crew inbound', { duration: 2400 });
    const recoveryTimer = window.setTimeout(() => {
      setTankIntegrity(100);
      setTankStartPosition([0, 0, -12]);
      toast.success('Armor restored · back in the fight', { duration: 2200 });
    }, 2200);
    return () => window.clearTimeout(recoveryTimer);
  }, [state, tankIntegrity]);

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
    }, 100);

    return () => window.clearInterval(interval);
  }, []);

  // Keyboard listener for Ctrl+Z (Cmd+Z on macOS) and batch delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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

      if (e.key === 'Escape' && markedCount > 0) {
        e.preventDefault();
        clearMarked();
        toast('Targets disarmed', { duration: 1800 });
      }

      if (e.key === '1') setWeaponMode('cannon');
      if (e.key === '2') setWeaponMode('machinegun');
      if (e.key === '3') setWeaponMode('flamethrower');
      if (e.key === '4') setWeaponMode('napalm');
      if (e.key === 'm' || e.key === 'M') fieldRadio.toggle();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentDirectory, markedCount, fieldRadio.toggle]); // Re-attach when relevant controls change

  async function pickDirectory() {
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    resetMarkedState();
    setIsTraining(false);
    setState('picking');
    setError(null);

    try {
      const result = await commands.pickDirectory();

      if (result === null) {
        // User cancelled - remain on the picker screen.
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
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function startTraining() {
    gameAudio.setBattlefieldActive(true);
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    setIsTraining(true);
    setCurrentDirectory(TRAINING_DIRECTORY);
    setLastDirectory(null);
    setEntries(createTrainingEntries());
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
  }

  async function scanDirectory(path: string) {
    setState('scanning');
    setScanProgress(null);
    setError(null);

    try {
      const result = await commands.scanDirectory(path);
      setEntries(result);
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

    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    resetMarkedState();
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
    fieldRadio.stop();
    setIsTraining(false);
    setNapalmStrikes([]);
    setLastDirectory(null);
    setState('picking');
  }

  async function navigateToDirectory(dirPath: string) {
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    resetMarkedState();
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

      setEntries(prev => [...prev, restoredEntry]);
      setDeletedCount(prev => Math.max(0, prev - 1));
      setDeletedBytes(prev => Math.max(0, prev - restoredEntry.size));
      removePoints(restoredEntry.size);
      toast.success(`Restored ${restoredEntry.name} in training`, { duration: 2500 });
      return;
    }

    try {
      const action = await commands.undoLastTrash();

      if (action) {
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
    source: 'cannon' | 'machinegun' | 'flamethrower' | 'napalm',
  ) {
    const result = damageEnemy(enemyId, amount, source);
    if (!result?.killed) return;

    const [x, y, z] = result.enemy.position;
    spawnExplosion(new THREE.Vector3(x, y + 0.45, z), '#d75b32', 0.52);
    toast.success('Hostile position neutralized', { duration: 1500 });
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

    napalmPayloadsRef.current.set(id, {
      session: strikeSession,
      filePaths: targets.map(({ block }) => block.path),
      enemyIds: enemyTargets.map(({ enemy }) => enemy.id),
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
      const targetCount = targets.length + enemyTargets.length;
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
    napalmPayloadsRef.current.delete(id);

    const liveFilePaths = new Set(
      allBlocks
        .filter(block => !deletingFiles.has(block.path))
        .map(block => block.path),
    );
    const filePathsAtImpact = payload.filePaths.filter(filePath => liveFilePaths.has(filePath));

    let enemyCasualties = 0;
    for (const enemyId of payload.enemyIds) {
      const result = killEnemy(enemyId, 'napalm');
      if (!result?.killed) continue;
      enemyCasualties += 1;
      const [x, y, z] = result.enemy.position;
      spawnExplosion(new THREE.Vector3(x, y + 0.4, z), '#ff6a28', 0.65);
    }

    const totalTargets = filePathsAtImpact.length + enemyCasualties;
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

  function handleNapalmComplete(id: number) {
    napalmPayloadsRef.current.delete(id);
    setNapalmStrikes(prev => prev.filter(strike => strike.id !== id));
  }

  // Projectile hit handler with two-shot deletion logic
  async function handleProjectileHit(filePath: string) {
    if (isMarked(filePath)) {
      // Second hit: delete the file
      try {
        const trainingEntry = isTraining ? entries.find(entry => entry.path === filePath) : undefined;
        const action = isTraining
          ? {
              file_path: filePath,
              file_name: trainingEntry?.name || filePath,
              original_size: trainingEntry?.size || 0,
              trash_timestamp: Date.now(),
            }
          : await commands.moveToTrash(filePath);

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

    try {
      if (isTraining) {
        const filesToDelete = Array.from(markedFiles);
        const fileBlocks = filesToDelete
          .map(filePath => allBlocks.find(block => block.path === filePath))
          .filter((block): block is NonNullable<typeof block> => block !== undefined);
        const entriesToDelete = filesToDelete
          .map(filePath => entries.find(entry => entry.path === filePath))
          .filter((entry): entry is FileEntry => entry !== undefined);
        const bytesFreed = entriesToDelete.reduce((total, entry) => total + entry.size, 0);

        await deleteAllMarked(async () => {});
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
      const filesToDelete = Array.from(markedFiles);
      const fileBlocks = filesToDelete.map(filePath =>
        allBlocks.find(b => b.path === filePath)
      ).filter(block => block !== undefined);

      // Delete all marked files and keep failed targets armed for another attempt.
      const successfulPaths = await deleteAllMarked();
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
    finishDeletion(filePath);
    // Remove file from entries
    setEntries(prev => prev.filter(e => e.path !== filePath));
  }

  // Prepare data for 3D scene (needs to be before early returns so handlers can reference allBlocks)
  const { blocksByCategory, folders, allBlocks } = useFileBlocks(entries);
  const combatObstacles = allBlocks.map(block => ({
    position: block.position,
    radius: Math.max(0.62, block.scale * 0.74),
  }));

  // Calculate folder positions (folders get front rows in grid layout)
  const folderPositions = new Map<string, [number, number, number]>();
  const folderEntries = entries.filter(e => e.is_dir);
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
  }));

  const minimapFolderPortals = folderPortalData.map(portal => ({
    position: portal.position,
  }));

  const markedBytes = allBlocks.reduce(
    (total, block) => total + (markedFiles.has(block.path) ? block.size : 0),
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
        fileCount={allBlocks.length}
        folderCount={folders.length}
        markedCount={markedCount}
        markedBytes={markedBytes}
        onClearMarked={clearMarked}
        weaponMode={weaponMode}
        onWeaponChange={setWeaponMode}
        flameFuel={flameFuel}
        napalmCooldown={napalmCooldown}
        tankIntegrity={tankIntegrity}
        hostileCount={hostileCount}
        damageFlash={damageFlash}
        radioEnabled={fieldRadio.enabled}
        radioTrackName={fieldRadio.trackName}
        onToggleRadio={fieldRadio.toggle}
        onNextTrack={fieldRadio.nextTrack}
        onLoadLocalTrack={fieldRadio.loadLocalTrack}
        radioSourceLabel={fieldRadio.sourceLabel}
      />

      <Crosshair weaponMode={weaponMode} />

      <Minimap
        tankStateRef={tankStateRef}
        fileBlocks={minimapFileBlocks}
        folderPortals={minimapFolderPortals}
        backPortalPosition={backPortalPosition}
        enemies={livingEnemies}
        friendlies={US_INFANTRY_MINIMAP_CONTACTS}
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
        <button onClick={changeDirectory} className="btn-secondary">
          {isTraining ? 'Exit Training' : 'Change Directory'}
        </button>
      </div>

      <KeyboardControls map={CONTROLS_MAP}>
        <Scene environmentSeed={hashCombatSession(currentDirectory ?? TRAINING_DIRECTORY)}>
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
            onMachineGunAudioChange={gameAudio.setMachineGunActive}
            onFlamethrowerAudioChange={gameAudio.setFlamethrowerActive}
            onMovementAudioChange={gameAudio.setMovementActive}
          />
          <CameraRig
            tankRef={tankRef}
            napalmCinematic={napalmStrikes.length > 0 && napalmCooldown > 0.5}
          />

          <USInfantrySquad
            enemies={livingEnemies}
            obstacles={combatObstacles}
            enabled={livingEnemies.length > 0}
            onEnemyHit={({ enemyId, damage }) => applyEnemyDamage(enemyId, damage, 'machinegun')}
          />

          <VietCongCombatants
            enemies={enemies}
            tankRef={tankRef}
            obstacles={combatObstacles}
            enabled={tankIntegrity > 0}
            onTankHit={event => handleTankHit(event.damage)}
            onEnemyFire={gameAudio.playEnemyRifle}
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
            allBlocks={allBlocks}
            enemies={livingEnemies}
          />

          {explosions.length > 0 && (
            <ExplosionParticles explosions={explosions} onExplosionComplete={despawnExplosion} />
          )}

          {napalmStrikes.length > 0 && (
            <OrdnanceEffects
              napalmStrikes={napalmStrikes}
              onNapalmImpact={handleNapalmImpact}
              onNapalmComplete={handleNapalmComplete}
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
