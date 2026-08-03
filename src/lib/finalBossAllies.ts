import type * as THREE from 'three';
import type { FriendlyCombatant, FriendlyFireEvent } from './combat';

export type FinalBossAllyRole = 'heavy-gunner' | 'mounted-cavalry' | 'rifle-scout';
export type FinalBossAllyStatus = 'active' | 'defeating' | 'defeated';
export type FinalBossAllyWeapon = 'heavy-machine-gun' | 'cavalry-saber' | 'rifle';
export type FinalBossAllyDefeatCause = 'boss-phase' | 'combat' | 'encounter-exit';

export interface FinalBossAllyDefinition {
  id: string;
  name: string;
  shortLabel: string;
  role: FinalBossAllyRole;
  weapon: FinalBossAllyWeapon;
  icon: string;
  portraitSrc: string;
  position: readonly [number, number, number];
  maxHealth: number;
  /** The ally is dramatically removed once the boss reaches this health ratio. */
  defeatBossHealthRatio: number;
  preferredRange: number;
  moveSpeed: number;
}

export interface FinalBossAllyCombatant extends FriendlyCombatant {
  role: FinalBossAllyRole;
  weapon: FinalBossAllyWeapon;
  name: string;
  shortLabel: string;
  icon: string;
  portraitSrc: string;
  status: FinalBossAllyStatus;
  defeatCause: FinalBossAllyDefeatCause | null;
}

export interface FinalBossAlliesSnapshot {
  active: boolean;
  encounterKey: string;
  allies: readonly FinalBossAllyCombatant[];
  livingCount: number;
}

export interface FinalBossAllyDamageResult {
  ally: FinalBossAllyCombatant;
  previousHealth: number;
  killed: boolean;
}

export interface FinalBossAllyFireEvent extends FriendlyFireEvent {
  allyId: string;
  weapon: FinalBossAllyWeapon;
}

export interface FinalBossAllyDefeatEvent {
  allyId: string;
  name: string;
  cause: FinalBossAllyDefeatCause;
  position: THREE.Vector3 | null;
}

export const FINAL_BOSS_ALLY_DEFEAT_ANIMATION_MS = 1_650;

/**
 * Allies stop applying damage at this ratio. This is a second guard in addition
 * to deliberately low DPS, ensuring the player always has to finish the boss.
 */
export const FINAL_BOSS_ALLY_ASSIST_FLOOR_RATIO = 0.12;

/**
 * Boss contact is intentionally attritional, not an alternate defeat clock.
 * Allies still show damage, but the phase thresholds below own their dramatic
 * exits so a fast boss cannot erase the support cast at the start of the wave.
 */
export const FINAL_BOSS_ALLY_CONTACT_DAMAGE_MULTIPLIER = 0.24;
export const FINAL_BOSS_ALLY_CONTACT_DAMAGE_COOLDOWN_MS = 900;
export const FINAL_BOSS_ALLY_CONTACT_HEALTH_FLOOR_RATIO = 0.25;

export const FINAL_BOSS_ALLY_DEFINITIONS: readonly FinalBossAllyDefinition[] = Object.freeze([
  Object.freeze({
    id: 'boss-ally-atlas',
    name: 'Arnold Schwarzenegger',
    shortLabel: 'ARNOLD',
    role: 'heavy-gunner',
    weapon: 'heavy-machine-gun',
    icon: 'AS',
    portraitSrc: '/images/boss-ally-arnold-schwarzenegger.png',
    position: [-10.5, 0.02, -3.5] as const,
    maxHealth: 260,
    defeatBossHealthRatio: 0.44,
    preferredRange: 20,
    moveSpeed: 3.15,
  }),
  Object.freeze({
    id: 'boss-ally-sagamore',
    name: 'Theodore Roosevelt',
    shortLabel: 'ROOSEVELT',
    role: 'mounted-cavalry',
    weapon: 'cavalry-saber',
    icon: 'TR',
    portraitSrc: '/images/boss-ally-theodore-roosevelt.png',
    position: [11.5, 0.02, 4.5] as const,
    maxHealth: 220,
    defeatBossHealthRatio: 0.72,
    preferredRange: 3.25,
    moveSpeed: 7.6,
  }),
  Object.freeze({
    id: 'boss-ally-redwood',
    name: 'Rambo',
    shortLabel: 'RAMBO',
    role: 'rifle-scout',
    weapon: 'rifle',
    icon: 'R',
    portraitSrc: '/images/boss-ally-rambo.png',
    position: [3.5, 0.02, -10.5] as const,
    maxHealth: 190,
    defeatBossHealthRatio: 0.2,
    preferredRange: 10,
    moveSpeed: 4.25,
  }),
]);

export function createFinalBossAllyCombatants(): FinalBossAllyCombatant[] {
  return FINAL_BOSS_ALLY_DEFINITIONS.map(definition => ({
    id: definition.id,
    name: definition.name,
    shortLabel: definition.shortLabel,
    role: definition.role,
    weapon: definition.weapon,
    icon: definition.icon,
    portraitSrc: definition.portraitSrc,
    position: [...definition.position],
    health: definition.maxHealth,
    maxHealth: definition.maxHealth,
    alive: true,
    kneeling: false,
    status: 'active',
    defeatCause: null,
  }));
}

export function isFinalBossAllyId(id: string) {
  return FINAL_BOSS_ALLY_DEFINITIONS.some(definition => definition.id === id);
}
