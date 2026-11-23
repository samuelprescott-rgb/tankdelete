import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createEmbassyArchives, attackEmbassyArchive, type EmbassyArchive } from '../lib/embassyDefense';
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
  onKilled?: (result: ZombieDamageResult) => void;
  warningMs?: number;
  warningReady?: boolean;
  intermissionMs?: number;
}

export interface FieldKitUse {
  target: string;
  type: 'plate' | 'brace' | 'patch';
  amount: number;
}
export interface FieldProtection {target: string; spent: boolean}
export const FIELD_PATCH_POINTS = 24;

export interface ZombieEpilogueSnapshot {
  phase: ZombieEpiloguePhase;
  objectiveId: string | null;
  wave: 0 | ZombieWaveNumber;
  zombies: ZombieCombatant[];
  totalKills: number;
  waveKills: number;
  breachCount: number;
  archives: readonly EmbassyArchive[];
  defeatReason: 'tank' | 'archives' | null;
  kit: FieldKitUse | null;
  protection: FieldProtection | null;
  intermissionEndsAt: number;
}

export interface ZombieEpilogueController extends ZombieEpilogueSnapshot {
  maxWaves: number;
  maxBreaches: number;
  livingZombies: ZombieCombatant[];
  aliveCount: number;
  zombiesRef: React.RefObject<ZombieCombatant[]>;
  posesRef: React.RefObject<Map<string, ZombieCombatPose>>;
  /** Latches once per session; repeated completion notifications are ignored. */
  begin: (objectiveId: string, archiveCount?: number) => boolean;
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
  damageArchive: (id: string, amount: number) => boolean;
  spendKit: (target: string) => boolean;
  beginNextWave: () => boolean;
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
    archives: [],
    defeatReason: null,
    kit: null, protection: null, intermissionEndsAt: 0,
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
  onKilled,
  warningMs = ZOMBIE_WARNING_MS,
  warningReady = true,
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

  const begin = useCallback((objectiveId: string, archiveCount?: number) => {
    const normalizedObjectiveId = objectiveId.trim();
    if (!normalizedObjectiveId || snapshotRef.current.phase !== 'locked') return false;
    const archives = createEmbassyArchives(archiveCount);
    if (!archives.length) return false;

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
      archives,
      defeatReason: null,
    }));
    return true;
  }, [commitSnapshot]);

  const startWave = useCallback((wave: ZombieWaveNumber) => {
    const current = snapshotRef.current;
    if (!current.objectiveId || !(
      (current.phase === 'warning' && wave === 1) ||
      (current.phase === 'intermission' && wave === current.wave + 1)
    )) return false;

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
      kit: null, intermissionEndsAt: 0,
    }));
    return true;
  }, [commitSnapshot, sessionSeed]);

  const beginNextWave = useCallback(() => {
    const current = snapshotRef.current;
    return current.phase === 'intermission' && current.wave < ZOMBIE_MAX_WAVES
      && startWave((current.wave + 1) as ZombieWaveNumber);
  }, [startWave]);

  const spendKit = useCallback((target: string) => {
    const current = snapshotRef.current;
    if (current.phase !== 'intermission' || current.kit || Date.now() >= current.intermissionEndsAt) return false;
    if (target === 'hull') {
      commitSnapshot(p => ({...p, kit: {type:'plate', target, amount:1}, protection: {target, spent:false}}));
      return true;
    }
    const i = current.archives.findIndex(a => a.id === target && a.health > 0);
    if (i < 0) return false; // never recreate a lost file
    const archive = current.archives[i];
    const amount = Math.min(FIELD_PATCH_POINTS, archive.maxHealth - archive.health);
    if (amount > 0) {
      const archives = current.archives.slice(); archives[i] = {...archive, health:archive.health + amount};
      commitSnapshot(p => ({...p, archives, kit: {type:'patch', target, amount}}));
    } else {
      commitSnapshot(p => ({...p, kit: {type:'brace', target, amount:1}, protection: {target, spent:false}}));
    }
    return true;
  }, [commitSnapshot]);

  useEffect(() => {
    if (snapshot.phase !== 'warning' || !warningReady) return;
    const generation = timerGenerationRef.current;
    const timeout = window.setTimeout(() => {
      if (generation !== timerGenerationRef.current) return;
      startWave(1);
    }, Math.max(0, warningMs));
    return () => window.clearTimeout(timeout);
  }, [snapshot.phase, startWave, warningMs, warningReady]);

  useEffect(() => {
    if (snapshot.phase !== 'intermission' || snapshot.wave >= ZOMBIE_MAX_WAVES) return;
    const generation = timerGenerationRef.current;
    const nextWave = (snapshot.wave + 1) as ZombieWaveNumber;
    const timeout = window.setTimeout(() => {
      if (generation !== timerGenerationRef.current) return;
      startWave(nextWave);
    }, Math.max(0, snapshot.intermissionEndsAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [snapshot.intermissionEndsAt, snapshot.phase, snapshot.wave, startWave]);

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
        playerChallenge: zombie.playerChallenge + (source === 'cannon' || source === 'machinegun' ? 1 : 0),
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
    if (onKilled && killCount) {
      for (const result of results) if (result.killed) onKilled(result);
    }
    return results;
  }, [commitSnapshot, onKilled]);

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

    if (current.protection?.target === 'hull' && !current.protection.spent) {
      commitSnapshot(p => ({...p, protection: {target:'hull', spent:true}}));
      return { accepted:false, breachCount:current.breachCount, maxBreaches:ZOMBIE_MAX_BREACHES, defeated:false };
    }
    const breachCount = Math.min(ZOMBIE_MAX_BREACHES, current.breachCount + 1);
    const defeated = breachCount >= ZOMBIE_MAX_BREACHES;
    commitSnapshot(previous => ({
      ...previous,
      breachCount,
      phase: defeated ? 'defeat' : previous.phase,
      defeatReason: defeated ? 'tank' : previous.defeatReason,
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

  const damageArchive = useCallback((id: string, amount: number) => {
    const current = snapshotRef.current;
    if (current.phase !== 'combat') return false;
    let archives = attackEmbassyArchive(current.archives, id, amount, Date.now());
    if (archives === current.archives) return false;
    let protection = current.protection;
    if (protection?.target === id && !protection.spent) {
      const i = archives.findIndex(a => a.id === id);
      // The approach/windup is NOT a hit. Cancel exactly the first health
      // change; keep its cooldown so a second actor cannot immediately stack.
      if (i >= 0 && archives[i].health < current.archives[i].health) {
        archives = archives.map((a, index) => index === i ? {...a, health:current.archives[i].health} : a);
        protection = {target:id, spent:true};
      }
    }
    const defeated = archives.every(archive => archive.health <= 0);
    commitSnapshot(previous => ({ ...previous, archives, protection,
      phase: defeated ? 'defeat' : previous.phase,
      defeatReason: defeated ? 'archives' : previous.defeatReason,
    }));
    if (defeated) for (const pose of posesRef.current.values()) pose.active = false;
    return true;
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
      archives: createEmbassyArchives(previous.archives.length),
      defeatReason: null,
      kit: null, protection: null, intermissionEndsAt: 0,
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
        kit: null, protection: null, intermissionEndsAt: 0,
      }));
      return;
    }

    commitSnapshot(current => ({
      ...current,
      phase: 'intermission',
      zombies: [],
      kit: null, protection: null, intermissionEndsAt: Date.now() + Math.max(0, intermissionMs),
    }));
  }, [commitSnapshot, livingZombies.length, snapshot.phase, snapshot.wave, snapshot.zombies.length, intermissionMs]);

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
    damageArchive,
    spendKit, beginNextWave,
    retry,
    reset,
  };
}
