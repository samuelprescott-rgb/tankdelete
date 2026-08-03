import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FriendlyCombatant, FriendlyCombatPose } from '../lib/combat';
import type { ZombieFriendlyBreachEvent } from '../lib/zombieEpilogue';
import {
  createFinalBossAllyCombatants,
  FINAL_BOSS_ALLY_CONTACT_DAMAGE_COOLDOWN_MS,
  FINAL_BOSS_ALLY_CONTACT_DAMAGE_MULTIPLIER,
  FINAL_BOSS_ALLY_CONTACT_HEALTH_FLOOR_RATIO,
  FINAL_BOSS_ALLY_DEFEAT_ANIMATION_MS,
  FINAL_BOSS_ALLY_DEFINITIONS,
  type FinalBossAllyCombatant,
  type FinalBossAllyDamageResult,
  type FinalBossAllyDefeatCause,
  type FinalBossAllyDefeatEvent,
  type FinalBossAlliesSnapshot,
} from '../lib/finalBossAllies';

export interface UseFinalBossAlliesOptions {
  enabled: boolean;
  encounterKey: string | number;
  bossHealth?: number;
  bossMaxHealth?: number;
  /** Existing infantry can share one target roster with the boss allies. */
  baseFriendliesRef?: React.RefObject<FriendlyCombatant[]>;
  /** Pass the scene's existing pose map so ZombieHorde can target both groups. */
  posesRef?: React.RefObject<Map<string, FriendlyCombatPose>>;
  onSnapshot?: (snapshot: FinalBossAlliesSnapshot) => void;
  onDefeat?: (event: FinalBossAllyDefeatEvent) => void;
}

export interface FinalBossAlliesController extends FinalBossAlliesSnapshot {
  alliesRef: React.RefObject<FinalBossAllyCombatant[]>;
  /** Combined base-infantry + boss-ally roster, ready for ZombieHorde. */
  friendliesRef: React.RefObject<FriendlyCombatant[]>;
  posesRef: React.RefObject<Map<string, FriendlyCombatPose>>;
  damageAlly: (allyId: string, amount: number) => FinalBossAllyDamageResult | null;
  /** Returns true when the breach belonged to a boss ally and was consumed. */
  handleFriendlyBreach: (event: ZombieFriendlyBreachEvent) => boolean;
  reset: () => void;
}

function snapshotFor(
  active: boolean,
  encounterKey: string,
  allies: readonly FinalBossAllyCombatant[],
): FinalBossAlliesSnapshot {
  return {
    active,
    encounterKey,
    allies,
    livingCount: allies.reduce((count, ally) => count + (ally.alive ? 1 : 0), 0),
  };
}

export function useFinalBossAllies({
  enabled,
  encounterKey,
  bossHealth = 0,
  bossMaxHealth = 0,
  baseFriendliesRef,
  posesRef: sharedPosesRef,
  onSnapshot,
  onDefeat,
}: UseFinalBossAlliesOptions): FinalBossAlliesController {
  const normalizedEncounterKey = String(encounterKey);
  const [allies, setAllies] = useState<FinalBossAllyCombatant[]>(
    createFinalBossAllyCombatants,
  );
  const alliesRef = useRef(allies);
  const internalPosesRef = useRef<Map<string, FriendlyCombatPose>>(new Map());
  const posesRef = sharedPosesRef ?? internalPosesRef;
  const friendliesRef = useRef<FriendlyCombatant[]>([]);
  const activeRef = useRef(enabled);
  const encounterKeyRef = useRef(normalizedEncounterKey);
  const phaseDefeatLatchesRef = useRef(new Set<string>());
  const lastContactDamageAtRef = useRef(new Map<string, number>());
  const cleanupTimersRef = useRef(new Map<string, number>());
  const onDefeatRef = useRef(onDefeat);
  onDefeatRef.current = onDefeat;

  const commitAllies = useCallback((updater: (
    current: FinalBossAllyCombatant[],
  ) => FinalBossAllyCombatant[]) => {
    const next = updater(alliesRef.current);
    if (next === alliesRef.current) return next;
    alliesRef.current = next;
    setAllies(next);
    return next;
  }, []);

  const clearCleanupTimers = useCallback(() => {
    for (const timer of cleanupTimersRef.current.values()) window.clearTimeout(timer);
    cleanupTimersRef.current.clear();
  }, []);

  const clearAllyPoses = useCallback(() => {
    for (const ally of alliesRef.current) posesRef.current.delete(ally.id);
  }, [posesRef]);

  const reset = useCallback(() => {
    clearCleanupTimers();
    phaseDefeatLatchesRef.current.clear();
    lastContactDamageAtRef.current.clear();
    clearAllyPoses();
    const fresh = createFinalBossAllyCombatants();
    alliesRef.current = fresh;
    setAllies(fresh);
  }, [clearAllyPoses, clearCleanupTimers]);

  const stageDefeat = useCallback((allyId: string, cause: FinalBossAllyDefeatCause) => {
    let defeatedName = '';
    commitAllies(current => {
      const index = current.findIndex(ally => ally.id === allyId && ally.alive);
      if (index < 0) return current;
      const next = current.slice();
      defeatedName = current[index].name;
      next[index] = {
        ...current[index],
        health: 0,
        alive: false,
        status: 'defeating',
        defeatCause: cause,
      };
      return next;
    });
    if (!defeatedName) return false;

    const existingTimer = cleanupTimersRef.current.get(allyId);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
      cleanupTimersRef.current.delete(allyId);
      commitAllies(current => {
        const index = current.findIndex(ally => ally.id === allyId);
        if (index < 0 || current[index].status !== 'defeating') return current;
        const next = current.slice();
        next[index] = { ...current[index], status: 'defeated' };
        return next;
      });
    }, FINAL_BOSS_ALLY_DEFEAT_ANIMATION_MS);
    cleanupTimersRef.current.set(allyId, timer);

    const livePose = posesRef.current.get(allyId)?.position.clone() ?? null;
    onDefeatRef.current?.({
      allyId,
      name: defeatedName,
      cause,
      position: livePose,
    });
    return true;
  }, [commitAllies]);

  const damageAlly = useCallback((allyId: string, amount: number) => {
    if (!activeRef.current || !Number.isFinite(amount) || amount <= 0) return null;
    let result: FinalBossAllyDamageResult | null = null;
    let shouldDefeat = false;
    commitAllies(current => {
      const index = current.findIndex(ally => ally.id === allyId && ally.alive);
      if (index < 0) return current;
      const previous = current[index];
      const nextHealth = Math.max(0, previous.health - amount);
      shouldDefeat = nextHealth <= 0;
      const nextAlly = {
        ...previous,
        health: shouldDefeat ? 1 : nextHealth,
      };
      result = {
        ally: shouldDefeat ? { ...nextAlly, health: 0, alive: false } : nextAlly,
        previousHealth: previous.health,
        killed: shouldDefeat,
      };
      if (shouldDefeat) return current;
      const next = current.slice();
      next[index] = nextAlly;
      return next;
    });
    if (shouldDefeat) stageDefeat(allyId, 'combat');
    return result;
  }, [commitAllies, stageDefeat]);

  const handleFriendlyBreach = useCallback((event: ZombieFriendlyBreachEvent) => {
    const ally = alliesRef.current.find(candidate => (
      candidate.id === event.friendlyId && candidate.alive
    ));
    if (!ally) return alliesRef.current.some(candidate => candidate.id === event.friendlyId);

    const now = performance.now();
    const lastDamageAt = lastContactDamageAtRef.current.get(ally.id) ?? -Infinity;
    if (now - lastDamageAt < FINAL_BOSS_ALLY_CONTACT_DAMAGE_COOLDOWN_MS) return true;
    lastContactDamageAtRef.current.set(ally.id, now);

    const healthFloor = ally.maxHealth * FINAL_BOSS_ALLY_CONTACT_HEALTH_FLOOR_RATIO;
    const scaledDamage = event.damage * FINAL_BOSS_ALLY_CONTACT_DAMAGE_MULTIPLIER;
    const damageBeforeFloor = Math.max(0, ally.health - healthFloor);
    const appliedDamage = Math.min(scaledDamage, damageBeforeFloor);
    if (appliedDamage > 0) damageAlly(event.friendlyId, appliedDamage);
    return true;
  }, [damageAlly]);

  useEffect(() => {
    const keyChanged = encounterKeyRef.current !== normalizedEncounterKey;
    const enabling = enabled && !activeRef.current;
    encounterKeyRef.current = normalizedEncounterKey;
    activeRef.current = enabled;
    if (keyChanged || enabling) reset();
    if (!enabled) {
      clearCleanupTimers();
      lastContactDamageAtRef.current.clear();
      clearAllyPoses();
    }
  }, [clearAllyPoses, clearCleanupTimers, enabled, normalizedEncounterKey, reset]);

  useEffect(() => {
    if (!enabled || bossMaxHealth <= 0 || bossHealth <= 0) return;
    const healthRatio = bossHealth / bossMaxHealth;
    for (const ally of alliesRef.current) {
      if (!ally.alive || phaseDefeatLatchesRef.current.has(ally.id)) continue;
      const definition = FINAL_BOSS_ALLY_DEFINITIONS.find(candidate => (
        candidate.id === ally.id
      ));
      if (!definition || healthRatio > definition.defeatBossHealthRatio) continue;
      phaseDefeatLatchesRef.current.add(ally.id);
      stageDefeat(ally.id, 'boss-phase');
    }
  }, [bossHealth, bossMaxHealth, enabled, stageDefeat]);

  useEffect(() => () => {
    activeRef.current = false;
    clearCleanupTimers();
    lastContactDamageAtRef.current.clear();
    clearAllyPoses();
  }, [clearAllyPoses, clearCleanupTimers]);

  const snapshot = useMemo(
    () => snapshotFor(enabled, normalizedEncounterKey, allies),
    [allies, enabled, normalizedEncounterKey],
  );

  useEffect(() => {
    onSnapshot?.(snapshot);
  }, [onSnapshot, snapshot]);

  friendliesRef.current = enabled
    ? [...(baseFriendliesRef?.current ?? []), ...allies]
    : [...(baseFriendliesRef?.current ?? [])];

  return {
    ...snapshot,
    alliesRef,
    friendliesRef,
    posesRef,
    damageAlly,
    handleFriendlyBreach,
    reset,
  };
}
