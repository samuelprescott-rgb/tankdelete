import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createZombieWave,
  hashZombieSession,
  ZombieCombatant,
  ZombieCombatPose,
  ZombieDamageResult,
  ZombieDamageSource,
  ZombieEpiloguePhase,
  ZombieBreachOutcome,
  ZOMBIE_INTERMISSION_MS,
  ZOMBIE_MAX_BREACHES,
  ZOMBIE_MAX_WAVES,
  ZOMBIE_WARNING_MS,
  ZombieWaveNumber,
  ZOMBIE_BOSS_NAPALM_DAMAGE,
} from '../lib/zombieEpilogue';

export interface UseZombieEpilogueOptions {
  /** Reset the entire epilogue whenever this changes. */
  sessionKey?: string | number;
  seed?: number;
  warningMs?: number;
  intermissionMs?: number;
}

export interface ZombieEpilogueSnapshot {
  phase: ZombieEpiloguePhase;
  objectiveId: string | null;
  wave: 0 | ZombieWaveNumber;
  zombies: ZombieCombatant[];
  totalKills: number;
  waveKills: number;
  breachCount: number;
}

export interface ZombieEpilogueController extends ZombieEpilogueSnapshot {
  maxWaves: number;
  maxBreaches: number;
  livingZombies: ZombieCombatant[];
  aliveCount: number;
  zombiesRef: React.RefObject<ZombieCombatant[]>;
  posesRef: React.RefObject<Map<string, ZombieCombatPose>>;
  /** Latches once per session; repeated completion notifications are ignored. */
  begin: (objectiveId: string) => boolean;
  damageZombie: (
    zombieId: string,
    amount: number,
    source?: ZombieDamageSource,
  ) => ZombieDamageResult | null;
  damageZombies: (
    zombieIds: readonly string[],
    amount: number,
    source?: ZombieDamageSource,
  ) => ZombieDamageResult[];
  killZombie: (
    zombieId: string,
    source?: ZombieDamageSource,
  ) => ZombieDamageResult | null;
  killZombies: (
    zombieIds: readonly string[],
    source?: ZombieDamageSource,
  ) => ZombieDamageResult[];
  /** Counts a tank-line breach and atomically enters defeat on the third. */
  registerBreach: () => ZombieBreachOutcome;
  /** Restarts the bonus defense after a terminal overrun. */
  retry: () => boolean;
  reset: () => void;
}

function createInitialSnapshot(): ZombieEpilogueSnapshot {
  return {
    phase: 'locked',
    objectiveId: null,
    wave: 0,
    zombies: [],
    totalKills: 0,
    waveKills: 0,
    breachCount: 0,
  };
}

type SnapshotUpdater = (
  current: ZombieEpilogueSnapshot,
) => ZombieEpilogueSnapshot;

function zombieDamageMultiplier(
  zombie: ZombieCombatant,
  source: ZombieDamageSource,
) {
  if (zombie.archetype !== 'boss') return 1;
  if (source === 'machinegun') return 0.35;
  if (source === 'flamethrower') return 0.55;
  if (source === 'eagle') return 3;
  if (source === 'friendly-rifle') return 0.25;
  return 1;
}

export function useZombieEpilogue({
  sessionKey = 'default',
  seed = 1945,
  warningMs = ZOMBIE_WARNING_MS,
  intermissionMs = ZOMBIE_INTERMISSION_MS,
}: UseZombieEpilogueOptions = {}): ZombieEpilogueController {
  const sessionSeed = useMemo(
    () => (hashZombieSession(sessionKey) ^ Math.trunc(seed)) >>> 0,
    [seed, sessionKey],
  );
  const [snapshot, setSnapshot] = useState<ZombieEpilogueSnapshot>(createInitialSnapshot);
  const snapshotRef = useRef(snapshot);
  const zombiesRef = useRef<ZombieCombatant[]>(snapshot.zombies);
  const posesRef = useRef<Map<string, ZombieCombatPose>>(new Map());
  const timerGenerationRef = useRef(0);

  const commitSnapshot = useCallback((updater: SnapshotUpdater) => {
    const next = updater(snapshotRef.current);
    snapshotRef.current = next;
    zombiesRef.current = next.zombies;
    setSnapshot(next);
    return next;
  }, []);

  const reset = useCallback(() => {
    timerGenerationRef.current += 1;
    posesRef.current = new Map();
    const initial = createInitialSnapshot();
    snapshotRef.current = initial;
    zombiesRef.current = initial.zombies;
    setSnapshot(initial);
  }, []);

  useEffect(() => {
    reset();
  }, [reset, sessionSeed]);

  const begin = useCallback((objectiveId: string) => {
    const normalizedObjectiveId = objectiveId.trim();
    if (!normalizedObjectiveId || snapshotRef.current.phase !== 'locked') return false;

    posesRef.current = new Map();
    commitSnapshot(current => ({
      ...current,
      phase: 'warning',
      objectiveId: normalizedObjectiveId,
      wave: 0,
      zombies: [],
      waveKills: 0,
      totalKills: 0,
      breachCount: 0,
    }));
    return true;
  }, [commitSnapshot]);

  const startWave = useCallback((wave: ZombieWaveNumber) => {
    const current = snapshotRef.current;
    if (!current.objectiveId
      || current.phase === 'locked'
      || current.phase === 'victory'
      || current.phase === 'defeat') return;

    const waveSeed = (
      sessionSeed
      ^ hashZombieSession(current.objectiveId)
      ^ Math.imul(wave, 0x9e3779b1)
    ) >>> 0;
    const zombies = createZombieWave(waveSeed, wave);
    posesRef.current = new Map(zombies.map(zombie => [
      zombie.id,
      {
        position: new THREE.Vector3(...zombie.position),
        active: false,
        archetype: zombie.archetype,
      },
    ]));
    commitSnapshot(previous => ({
      ...previous,
      phase: 'combat',
      wave,
      zombies,
      waveKills: 0,
    }));
  }, [commitSnapshot, sessionSeed]);

  useEffect(() => {
    if (snapshot.phase !== 'warning') return;
    const generation = timerGenerationRef.current;
    const timeout = window.setTimeout(() => {
      if (generation !== timerGenerationRef.current) return;
      startWave(1);
    }, Math.max(0, warningMs));
    return () => window.clearTimeout(timeout);
  }, [snapshot.phase, startWave, warningMs]);

  useEffect(() => {
    if (snapshot.phase !== 'intermission' || snapshot.wave >= ZOMBIE_MAX_WAVES) return;
    const generation = timerGenerationRef.current;
    const nextWave = (snapshot.wave + 1) as ZombieWaveNumber;
    const timeout = window.setTimeout(() => {
      if (generation !== timerGenerationRef.current) return;
      startWave(nextWave);
    }, Math.max(0, intermissionMs));
    return () => window.clearTimeout(timeout);
  }, [intermissionMs, snapshot.phase, snapshot.wave, startWave]);

  const applyDamage = useCallback((
    zombieIds: readonly string[],
    resolveDamage: (zombie: ZombieCombatant) => number,
    source: ZombieDamageSource,
  ) => {
    if (snapshotRef.current.phase !== 'combat' || zombieIds.length === 0) return [];

    const uniqueIds = new Set(zombieIds);
    const current = snapshotRef.current;
    const nextZombies = current.zombies.slice();
    const results: ZombieDamageResult[] = [];
    let killCount = 0;
    let changed = false;

    for (let index = 0; index < nextZombies.length; index += 1) {
      const zombie = nextZombies[index];
      if (!zombie.alive || !uniqueIds.has(zombie.id)) continue;
      const requestedDamage = resolveDamage(zombie);
      const amount = requestedDamage * zombieDamageMultiplier(zombie, source);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const nextHealth = Math.max(0, zombie.health - amount);
      const updatedZombie: ZombieCombatant = {
        ...zombie,
        health: nextHealth,
        alive: nextHealth > 0,
        suppressionRevision: source === 'friendly-rifle'
          ? zombie.suppressionRevision + 1
          : zombie.suppressionRevision,
      };
      nextZombies[index] = updatedZombie;
      changed = true;
      const killed = zombie.alive && !updatedZombie.alive;
      if (killed) {
        killCount += 1;
        const pose = posesRef.current.get(zombie.id);
        if (pose) pose.active = false;
      }
      const livePosition = posesRef.current.get(zombie.id)?.position;
      results.push({
        zombie: updatedZombie,
        previousHealth: zombie.health,
        killed,
        source,
        position: livePosition?.clone() ?? new THREE.Vector3(...zombie.position),
      });
    }

    if (changed) {
      commitSnapshot(previous => ({
        ...previous,
        zombies: nextZombies,
        waveKills: previous.waveKills + killCount,
        totalKills: previous.totalKills + killCount,
      }));
    }
    return results;
  }, [commitSnapshot]);

  const damageZombies = useCallback((
    zombieIds: readonly string[],
    amount: number,
    source: ZombieDamageSource = 'machinegun',
  ) => applyDamage(zombieIds, () => amount, source), [applyDamage]);

  const damageZombie = useCallback((
    zombieId: string,
    amount: number,
    source: ZombieDamageSource = 'machinegun',
  ) => damageZombies([zombieId], amount, source)[0] ?? null, [damageZombies]);

  const killZombies = useCallback((
    zombieIds: readonly string[],
    source: ZombieDamageSource = 'cannon',
  ) => applyDamage(zombieIds, zombie => {
    if (zombie.archetype !== 'boss') return zombie.health;
    return ZOMBIE_BOSS_NAPALM_DAMAGE / zombieDamageMultiplier(zombie, source);
  }, source), [applyDamage]);

  const killZombie = useCallback((
    zombieId: string,
    source: ZombieDamageSource = 'cannon',
  ) => killZombies([zombieId], source)[0] ?? null, [killZombies]);

  const registerBreach = useCallback((): ZombieBreachOutcome => {
    const current = snapshotRef.current;
    if (current.phase !== 'combat') {
      return {
        accepted: false,
        breachCount: current.breachCount,
        maxBreaches: ZOMBIE_MAX_BREACHES,
        defeated: current.phase === 'defeat',
      };
    }

    const breachCount = Math.min(ZOMBIE_MAX_BREACHES, current.breachCount + 1);
    const defeated = breachCount >= ZOMBIE_MAX_BREACHES;
    commitSnapshot(previous => ({
      ...previous,
      breachCount,
      phase: defeated ? 'defeat' : previous.phase,
    }));
    if (defeated) {
      for (const pose of posesRef.current.values()) pose.active = false;
    }
    return {
      accepted: true,
      breachCount,
      maxBreaches: ZOMBIE_MAX_BREACHES,
      defeated,
    };
  }, [commitSnapshot]);

  const retry = useCallback(() => {
    const current = snapshotRef.current;
    if (current.phase !== 'defeat' || !current.objectiveId) return false;
    timerGenerationRef.current += 1;
    posesRef.current = new Map();
    commitSnapshot(previous => ({
      ...previous,
      phase: 'warning',
      wave: 0,
      zombies: [],
      totalKills: 0,
      waveKills: 0,
      breachCount: 0,
    }));
    return true;
  }, [commitSnapshot]);

  const livingZombies = useMemo(
    () => snapshot.zombies.filter(zombie => zombie.alive),
    [snapshot.zombies],
  );

  useEffect(() => {
    if (snapshot.phase !== 'combat'
      || snapshot.zombies.length === 0
      || livingZombies.length > 0) return;

    posesRef.current = new Map();
    if (snapshot.wave >= ZOMBIE_MAX_WAVES) {
      commitSnapshot(current => ({
        ...current,
        phase: 'victory',
        zombies: [],
      }));
      return;
    }

    commitSnapshot(current => ({
      ...current,
      phase: 'intermission',
      zombies: [],
    }));
  }, [commitSnapshot, livingZombies.length, snapshot.phase, snapshot.wave, snapshot.zombies.length]);

  return {
    ...snapshot,
    maxWaves: ZOMBIE_MAX_WAVES,
    maxBreaches: ZOMBIE_MAX_BREACHES,
    livingZombies,
    aliveCount: livingZombies.length,
    zombiesRef,
    posesRef,
    begin,
    damageZombie,
    damageZombies,
    killZombie,
    killZombies,
    registerBreach,
    retry,
    reset,
  };
}
