import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createUSInfantryCombatants,
  createVietCongCombatants,
  EnemyCombatant,
  EnemyDamageSource,
  FriendlyCombatant,
  FriendlyCombatPose,
  hashCombatSession,
} from '../lib/combat';

export interface UseEnemyCombatOptions {
  /** Change this whenever a directory/world session changes to rebuild the formation. */
  sessionKey?: string | number;
  seed?: number;
  /** Clamped to the designed encounter size of six through twelve fighters. */
  count?: number;
}

export interface EnemyDamageResult {
  enemy: EnemyCombatant;
  previousHealth: number;
  killed: boolean;
  source: EnemyDamageSource;
}

export interface FriendlyDamageResult {
  friendly: FriendlyCombatant;
  previousHealth: number;
  killed: boolean;
}

export interface EnemyCombatState {
  enemies: EnemyCombatant[];
  livingEnemies: EnemyCombatant[];
  enemiesRef: React.RefObject<EnemyCombatant[]>;
  aliveCount: number;
  friendlies: FriendlyCombatant[];
  livingFriendlies: FriendlyCombatant[];
  friendliesRef: React.RefObject<FriendlyCombatant[]>;
  friendlyPosesRef: React.RefObject<Map<string, FriendlyCombatPose>>;
  friendlyAliveCount: number;
  damageEnemy: (
    enemyId: string,
    amount: number,
    source?: EnemyDamageSource,
  ) => EnemyDamageResult | null;
  killEnemy: (enemyId: string, source?: EnemyDamageSource) => EnemyDamageResult | null;
  damageFriendly: (friendlyId: string, amount: number) => FriendlyDamageResult | null;
  resetEnemies: () => EnemyCombatant[];
}

export function useEnemyCombat({
  sessionKey = 'default',
  seed = 1968,
  count = 12,
}: UseEnemyCombatOptions = {}): EnemyCombatState {
  const encounterSeed = useMemo(
    () => (hashCombatSession(sessionKey) ^ Math.trunc(seed)) >>> 0,
    [seed, sessionKey],
  );
  const createEncounter = useCallback(
    () => createVietCongCombatants(encounterSeed, count),
    [count, encounterSeed],
  );
  const [enemies, setEnemies] = useState<EnemyCombatant[]>(createEncounter);
  const enemiesRef = useRef(enemies);
  const [friendlies, setFriendlies] = useState<FriendlyCombatant[]>(createUSInfantryCombatants);
  const friendliesRef = useRef(friendlies);
  const friendlyPosesRef = useRef<Map<string, FriendlyCombatPose>>(new Map(
    friendlies.map(friendly => [
      friendly.id,
      { position: new THREE.Vector3(...friendly.position) },
    ]),
  ));

  const commitEnemies = useCallback((next: EnemyCombatant[]) => {
    enemiesRef.current = next;
    setEnemies(next);
  }, []);

  const commitFriendlies = useCallback((next: FriendlyCombatant[]) => {
    friendliesRef.current = next;
    setFriendlies(next);
  }, []);

  const resetEnemies = useCallback(() => {
    const next = createEncounter();
    const nextFriendlies = createUSInfantryCombatants();
    commitEnemies(next);
    friendlyPosesRef.current = new Map(nextFriendlies.map(friendly => [
      friendly.id,
      { position: new THREE.Vector3(...friendly.position) },
    ]));
    commitFriendlies(nextFriendlies);
    return next;
  }, [commitEnemies, commitFriendlies, createEncounter]);

  useEffect(() => {
    resetEnemies();
  }, [resetEnemies]);

  const damageEnemy = useCallback((
    enemyId: string,
    amount: number,
    source: EnemyDamageSource = 'machinegun',
  ): EnemyDamageResult | null => {
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const current = enemiesRef.current;
    const targetIndex = current.findIndex(enemy => enemy.id === enemyId && enemy.alive);
    if (targetIndex < 0) return null;

    const target = current[targetIndex];
    const nextHealth = Math.max(0, target.health - amount);
    const updatedTarget: EnemyCombatant = {
      ...target,
      health: nextHealth,
      alive: nextHealth > 0,
    };
    const next = current.slice();
    next[targetIndex] = updatedTarget;
    commitEnemies(next);

    return {
      enemy: updatedTarget,
      previousHealth: target.health,
      killed: target.alive && !updatedTarget.alive,
      source,
    };
  }, [commitEnemies]);

  const killEnemy = useCallback((
    enemyId: string,
    source: EnemyDamageSource = 'cannon',
  ) => {
    const target = enemiesRef.current.find(enemy => enemy.id === enemyId && enemy.alive);
    if (!target) return null;
    return damageEnemy(enemyId, target.health, source);
  }, [damageEnemy]);

  const damageFriendly = useCallback((
    friendlyId: string,
    amount: number,
  ): FriendlyDamageResult | null => {
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const current = friendliesRef.current;
    const targetIndex = current.findIndex(friendly => friendly.id === friendlyId && friendly.alive);
    if (targetIndex < 0) return null;

    const target = current[targetIndex];
    const nextHealth = Math.max(0, target.health - amount);
    const updatedTarget: FriendlyCombatant = {
      ...target,
      health: nextHealth,
      alive: nextHealth > 0,
    };
    const next = current.slice();
    next[targetIndex] = updatedTarget;
    commitFriendlies(next);

    return {
      friendly: updatedTarget,
      previousHealth: target.health,
      killed: target.alive && !updatedTarget.alive,
    };
  }, [commitFriendlies]);

  const livingEnemies = useMemo(() => enemies.filter(enemy => enemy.alive), [enemies]);
  const livingFriendlies = useMemo(
    () => friendlies.filter(friendly => friendly.alive),
    [friendlies],
  );

  return {
    enemies,
    livingEnemies,
    enemiesRef,
    aliveCount: livingEnemies.length,
    friendlies,
    livingFriendlies,
    friendliesRef,
    friendlyPosesRef,
    friendlyAliveCount: livingFriendlies.length,
    damageEnemy,
    killEnemy,
    damageFriendly,
    resetEnemies,
  };
}
