import type { CombatObstacle } from './combat';

/** Fictional 1975-inspired nightmare compound. These are game-state proxies,
 * never filesystem entries: losing an archive cannot invoke Trash or deletion. */
export const EMBASSY_ARCHIVE_HEALTH = 200;
export const EMBASSY_MELEE_DAMAGE = 8;
export const EMBASSY_ATTACK_WINDUP_MS = 2250;
export const EMBASSY_DAMAGE_INTERVAL_MS = 1250;
export const EMBASSY_THREAT_HOLD_MS = 3500;
export const EMBASSY_DEFENSE_OFFSET_Z = -10;
// The guard position looks across the entry road rather than away from the
// archive doors. This is only a spawn pose; never pull the camera or player's
// steering toward a raid after control has been handed over.
export const EMBASSY_GUARD_POSITION: [number, number, number] = [-14, 0, -11.5];
export const EMBASSY_GUARD_YAW = Math.PI + 76 * Math.PI / 180;
// Two maintained sightlines through the overgrown grounds: the tank turnout
// to the entry road, and the door-side service lane. Only large vegetation
// is excluded here; the verges, low grass, surroundings and day map remain.
const DEFENSE_SIGHTLINES = [
  [-24.0,-14.0,-9.0,-10.0,4.4],
  [-17.5,-11.6,15.6,10.6,2.9],
  [-16.4,-12.5,11.5,-17.8,2.2],
  [10.2,-18.5,12.4,4.8,1.9],
] as const;
export function inEmbassyServiceLane(x:number,z:number,padding=0) {
  return DEFENSE_SIGHTLINES.some(([ax,az,bx,bz,width])=>{
    const dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    return (x-ax-t*dx)**2+(z-az-t*dz)**2 < (width+padding)**2;
  });
}
export const EMBASSY_COURTYARD_BOUNDS = Object.freeze({minX:-14.5,maxX:14.5,minZ:-30,maxZ:-13});
export function isInEmbassyClearing(x:number,z:number,padding=0) {
  const b=EMBASSY_COURTYARD_BOUNDS;
  return x>=b.minX-padding && x<=b.maxX+padding && z>=b.minZ-padding && z<=b.maxZ+padding;
}
export interface EmbassyArchive {
  id: string;
  label: string;
  position: [number, number, number];
  approach: [number, number, number];
  health: number;
  maxHealth: number;
  underAttackUntil: number;
  damageReadyAt: number;
}
export const EMBASSY_ARCHIVE_SLOTS = [
  { id: 'chancery', label: 'Chancery files', position: [0, 0, -26], approach: [0, 0, -22.5] },
  { id: 'records', label: 'Records annex', position: [-11.85, 0, -20.25], approach: [-11.85, 0, -16.95] },
  { id: 'dispatch', label: 'Dispatch annex', position: [11.68, 0, -17.68], approach: [11.43, 0, -14.38] },
] as const;

/** Coarse overlapping building volumes use the existing infantry/horde API.
 * The approach points and north courtyard remain outside the inflated footprint.
 * Only ordinary infantry/navigation and rifle traces consume these: the tank
 * and final boss deliberately retain their established low-prop traversal. */
export const EMBASSY_BUILDING_OBSTACLES: readonly (CombatObstacle & { archiveId: string })[] = Object.freeze(
  EMBASSY_ARCHIVE_SLOTS.flatMap(slot => {
    const main = slot.id === 'chancery';
    const columns = main ? [-2.5, 0, 2.5] : [-1.2, 1.2];
    const rows = main ? [-0.8, 0.8] : [-0.55, 0.55];
    return columns.flatMap(x => rows.map(z => Object.freeze({
      archiveId: slot.id,
      position: [slot.position[0] + x, 1.05, slot.position[2] + z] as [number, number, number],
      radius: main ? 2.35 : 2.05,
    })));
  }),
);

export function embassyCombatObstacles(archives: readonly EmbassyArchive[]): readonly CombatObstacle[] {
  return EMBASSY_BUILDING_OBSTACLES.filter(obstacle => archives.some(archive =>
    archive.id === obstacle.archiveId && archive.health > 0));
}

export function createEmbassyArchives(count: number = EMBASSY_ARCHIVE_SLOTS.length): EmbassyArchive[] {
  return EMBASSY_ARCHIVE_SLOTS.slice(0, Math.max(0, count)).map(slot => ({
    ...slot, position: [...slot.position], approach: [...slot.approach],
    health: EMBASSY_ARCHIVE_HEALTH, maxHealth: EMBASSY_ARCHIVE_HEALTH,
    underAttackUntil: 0, damageReadyAt: 0,
  }));
}

export function damageEmbassyArchive(archives: readonly EmbassyArchive[], id: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return archives;
  const index = archives.findIndex(archive => archive.id === id && archive.health > 0);
  if (index < 0) return archives;
  const next = archives.slice();
  next[index] = { ...next[index], health: Math.max(0, next[index].health - amount) };
  return next;
}

/** An arrival starts a visible siege warning, never a one-touch failure.
 * This clock is shared per building: a pile-up cannot multiply damage within
 * one frame. Even a continuously surrounded archive takes over 30s to lose.
 * Losing contact for the warning hold restarts the response-time windup. */
export function attackEmbassyArchive(archives: readonly EmbassyArchive[], id: string, amount: number, now: number) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(now)) return archives;
  const index = archives.findIndex(archive => archive.id === id && archive.health > 0);
  if (index < 0) return archives;
  const archive = archives[index];
  const startingAttack = (archive.underAttackUntil ?? 0) <= now;
  const readyAt = startingAttack ? now + EMBASSY_ATTACK_WINDUP_MS : archive.damageReadyAt;
  const canDamage = !startingAttack && now >= readyAt;
  const nextThreatUntil = now + EMBASSY_THREAT_HOLD_MS;
  if (!canDamage && !startingAttack && archive.underAttackUntil > nextThreatUntil - 500) return archives;
  const next = archives.slice();
  next[index] = { ...archive,
    health: canDamage ? Math.max(0, archive.health - Math.min(amount, EMBASSY_MELEE_DAMAGE)) : archive.health,
    damageReadyAt: canDamage ? now + EMBASSY_DAMAGE_INTERVAL_MS : readyAt,
    underAttackUntil: nextThreatUntil,
  };
  return next;
}

/** A subset of the horde raids files while the rest pressures the defenders.
 * Nearby player/squad intervention draws raiders away from the building. */
export function selectEmbassyTarget(
  archives: readonly EmbassyArchive[], x: number, z: number,
  actorIndex: number, nearestDefenderDistanceSq: number, boss: boolean,
) {
  if (boss || (actorIndex % 3 !== 0 && Number.isFinite(nearestDefenderDistanceSq))
    || nearestDefenderDistanceSq < 7 * 7) return null;
  // Assign the first three raiders separate lanes. Otherwise the farther-back
  // central building is almost never threatened before both annexes fall.
  // Prefer the same lane throughout a pursuit, even when other archives fall.
  const assigned = EMBASSY_ARCHIVE_SLOTS[Math.floor(actorIndex / 3) % EMBASSY_ARCHIVE_SLOTS.length];
  const assignedTarget = archives.find(archive => archive.id === assigned?.id && archive.health > 0);
  if (assignedTarget) return assignedTarget;
  let target: EmbassyArchive | null = null;
  let closest = Infinity;
  for (const archive of archives) {
    if (archive.health <= 0) continue;
    const distance = (archive.approach[0] - x) ** 2 + (archive.approach[2] - z) ** 2;
    if (distance < closest) { closest = distance; target = archive; }
  }
  return target;
}
