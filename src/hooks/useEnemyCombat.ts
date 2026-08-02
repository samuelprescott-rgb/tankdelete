import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createVietCongCombatants,
  EnemyCombatant,
  EnemyDamageSource,
  hashCombatSession,
} from '../lib/combat';

export interface UseEnemyCombatOptions {
  /** Change this whenever a directory/world session changes to rebuild the patrol. */
  sessionKey?: string | number;
  seed?: number;
  /** Clamped to the designed encounter size of six through eight fighters. */
  count?: number;
}

export interface EnemyDamageResult {
  enemy: EnemyCombatant;
  previousHealth: number;
  killed: boolean;
  source: EnemyDamageSource;
}

export interface EnemyCombatState {
  enemies: EnemyCombatant[];
  livingEnemies: EnemyCombatant[];
  enemiesRef: React.RefObject<EnemyCombatant[]>;
  aliveCount: number;
  damageEnemy: (
    enemyId: string,
    amount: number,
    source?: EnemyDamageSource,
  ) => EnemyDamageResult | null;
  killEnemy: (enemyId: string, source?: EnemyDamageSource) => EnemyDamageResult | null;
  resetEnemies: () => EnemyCombatant[];
}

export function useEnemyCombat({
  sessionKey = 'default',
  seed = 1968,
  count = 8,
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

  const commitEnemies = useCallback((next: EnemyCombatant[]) => {
    enemiesRef.current = next;
    setEnemies(next);
  }, []);

  const resetEnemies = useCallback(() => {
    const next = createEncounter();
    commitEnemies(next);
    return next;
  }, [commitEnemies, createEncounter]);

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

  const livingEnemies = useMemo(() => enemies.filter(enemy => enemy.alive), [enemies]);

  return {
    enemies,
    livingEnemies,
    enemiesRef,
    aliveCount: livingEnemies.length,
    damageEnemy,
    killEnemy,
    resetEnemies,
  };
}
