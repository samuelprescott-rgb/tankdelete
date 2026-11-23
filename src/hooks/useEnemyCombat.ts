import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { liftCombatant } from '../lib/embassyLift';
import { campaignPassenger } from '../lib/campaignFlights';
import {chooseTunnelSite,newTunnelClock,stepTunnels,tunnelDebt,tunnelFighters,type TunnelPlayer,type TunnelSite} from '../lib/campaignTunnels';
import {safeVillageLeg} from '../lib/villageCover';
import type {RiverStation} from '../components/Scene/riverLayout';
import type {RiverFlankPost} from '../lib/riverFlankPost';
import {
  createUSInfantryCombatants,
  createVietCongCombatants,
  fitVietCongToVillage,
  type CombatObstacle,
  EnemyCombatant,
  type EnemyCombatPose,
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
  campaignTunnels?: boolean;
  repeatRelief?:boolean;
  riverFlank?:RiverFlankPost;
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
  enemyPosesRef: React.RefObject<Map<string, EnemyCombatPose>>;
  aliveCount: number;
  reserves: number;
  getRemainingHostiles: () => number;
  tunnelCue: {site:TunnelSite;batch:number}|null;
  advanceTunnels: (dt:number,player:TunnelPlayer,obstacles:readonly CombatObstacle[],river:RiverStation[])=>number;
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
  resetFriendlies: (offsetZ?: number) => FriendlyCombatant[];
  admitPassenger:(actor:FriendlyCombatant|null)=>boolean;
  deployPassenger: (slot: number) => boolean;
  deployCampaignPassenger: (slot: number) => boolean;
  resetEnemies: () => EnemyCombatant[];
  fitVillage: (obstacles: readonly CombatObstacle[]) => void;
}

export function useEnemyCombat({
  sessionKey = 'default',
  seed = 1968,
  count = 12,
  campaignTunnels = false,repeatRelief=false,
  riverFlank,
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
  const tunnelExit=useRef({waiting:[] as EnemyCombatant[],delay:0});
  const clock=useRef(newTunnelClock(campaignTunnels,repeatRelief));
  const [reserves,setReserves]=useState(()=>tunnelDebt(clock.current));
  const [tunnelCue,setTunnelCue]=useState<EnemyCombatState['tunnelCue']>(null);
  const enemyPosesRef = useRef<Map<string, EnemyCombatPose>>(new Map(
    enemies.map(enemy=>[enemy.id,{position:new THREE.Vector3(...enemy.position),yaw:0}]),
  ));
  const [friendlies, setFriendlies] = useState<FriendlyCombatant[]>(()=>createUSInfantryCombatants(0,riverFlank));
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

  const resetFriendlies = useCallback((offsetZ = 0) => {
    const nextFriendlies = createUSInfantryCombatants(offsetZ,riverFlank);
    friendlyPosesRef.current = new Map(nextFriendlies.map(friendly => [
      friendly.id,
      { position: new THREE.Vector3(...friendly.position) },
    ]));
    commitFriendlies(nextFriendlies);
    return nextFriendlies;
  }, [commitFriendlies,riverFlank]);

  const admitPassenger = useCallback((actor:FriendlyCombatant|null)=>{
    const roster=friendliesRef.current;
    if(!actor || roster.some(s=>s.id===actor.id))return false;
    friendlyPosesRef.current.set(actor.id,{position:new THREE.Vector3(...actor.position)});
    const keep=roster.filter(a=>{
      if(!a.relief||a.alive||performance.now()-(a.diedAt??Infinity)<6000)return true;
      friendlyPosesRef.current.delete(a.id);return false;
    });
    commitFriendlies([...keep,actor]);
    return true;
  },[commitFriendlies]);
  const deployPassenger = useCallback((slot:number)=>admitPassenger(liftCombatant(slot)),[admitPassenger]);
  const deployCampaignPassenger = useCallback((slot:number)=>admitPassenger(campaignPassenger(slot)),[admitPassenger]);

  const resetEnemies = useCallback(() => {
    const next = createEncounter();
    tunnelExit.current={waiting:[],delay:0};
    clock.current=newTunnelClock(campaignTunnels,repeatRelief);
    setReserves(tunnelDebt(clock.current)); setTunnelCue(null);
    enemyPosesRef.current = new Map(next.map(enemy=>[
      enemy.id,{position:new THREE.Vector3(...enemy.position),yaw:0},
    ]));
    commitEnemies(next);
    resetFriendlies();
    return next;
  }, [commitEnemies, createEncounter, resetFriendlies,campaignTunnels,repeatRelief]);

  const getRemainingHostiles=useCallback(()=>tunnelDebt(clock.current)+tunnelExit.current.waiting.length+
    enemiesRef.current.reduce((n,e)=>n+Number(e.alive),0),[]);
  const advanceTunnels=useCallback((dt:number,player:TunnelPlayer,obstacles:readonly CombatObstacle[],river:RiverStation[])=>{
    const c=clock.current;
    const exit=tunnelExit.current;
    function releaseNext(){
      const actor=exit.waiting.shift();
      if(!actor)return;
      const mouth=actor.tunnelMouth!;
      enemyPosesRef.current.set(actor.id,{position:new THREE.Vector3(mouth.x,-1.26,mouth.z),yaw:0});
      commitEnemies([...enemiesRef.current.filter(e=>!e.tunnel||e.alive||performance.now()-(e.diedAt??Infinity)<6000),actor]);
      exit.delay=.58;
      setReserves(tunnelDebt(c)+exit.waiting.length);
    }
    if(exit.waiting.length){
      exit.delay-=Math.min(dt,.2);
      if(exit.delay<=0)releaseNext();
      return 0;
    }
    if(!tunnelDebt(c)&&!c.repeat)return 0;
    const current=enemiesRef.current,living=current.reduce((n,e)=>n+Number(e.alive),0);
    const occupied=()=>current.filter(e=>e.alive).map(e=>enemyPosesRef.current.get(e.id)?.position??{x:e.position[0],z:e.position[2]});
    const event=stepTunnels(c,dt,living,
      ()=>chooseTunnelSite(player,obstacles,river,occupied(),c.last,c.batch),
      site=>Math.hypot(site.x-player.x,site.z-player.z)>9&&site.slots.every(p=>
        Math.hypot(p.x-player.x,p.z-player.z)>7&&safeVillageLeg(site.x,site.z,p.x,p.z,obstacles,river)));
    if(event?.kind==='warning')setTunnelCue({site:event.site,batch:event.batch});
    else if(event){
      if(event.kind==='emerge'){
        exit.waiting=tunnelFighters(encounterSeed,event.batch,event.site);
        releaseNext();
      }else setReserves(tunnelDebt(c));
      setTunnelCue(null);
    }
    return c.warning;
  },[commitEnemies,encounterSeed]);

  const fitVillage = useCallback((obstacles: readonly CombatObstacle[]) => {
    const current = enemiesRef.current;
    const next = fitVietCongToVillage(current, obstacles, encounterSeed);
    if (next === current) return;
    for (let i=0; i<next.length; i++) if (next[i] !== current[i]) {
      enemyPosesRef.current.get(next[i].id)?.position.set(...next[i].position);
    }
    commitEnemies(next);
  }, [commitEnemies, encounterSeed]);

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
      crushed: nextHealth===0 && source==='runover',
      diedAt: nextHealth===0?performance.now():undefined,
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
      diedAt: nextHealth===0?performance.now():undefined,
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
    enemyPosesRef,
    aliveCount: livingEnemies.length,
    reserves,getRemainingHostiles,tunnelCue,advanceTunnels,
    friendlies,
    livingFriendlies,
    friendliesRef,
    friendlyPosesRef,
    friendlyAliveCount: livingFriendlies.length,
    damageEnemy,
    killEnemy,
    damageFriendly,
    resetFriendlies,
    admitPassenger,deployPassenger,
    deployCampaignPassenger,
    resetEnemies,
    fitVillage,
  };
}
