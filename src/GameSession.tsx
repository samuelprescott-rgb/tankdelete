import {FieldCurtain,type CurtainStage} from './components/FieldCurtain';
import {FieldReliefFlight} from './components/Scene/FieldReliefFlight';
import {reliefPassenger} from './lib/fieldRelief';
import {FieldBlood} from './components/Scene/FieldBlood';
import {TankInfantryContact} from './components/Scene/TankInfantryContact';
import { createUndeadDeathMarks, UndeadDeathMarks } from './components/Scene/UndeadDeathMarks';
import { createInfantryContacts, InfantryContactArt } from './components/Scene/InfantryContactArt';
import { infantryAimHeight } from './lib/infantryMetrics';
import { undeadSupportY } from './lib/undeadGround';
import { CharacterFires,igniteCharacter,type CharacterBurns } from './components/Scene/CharacterFires';
import { BuildingFires, type BurningSurface } from './components/Scene/BuildingFires';
import type { WeaponContact } from './components/Scene/weaponSurfaces';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { Html, KeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { commands, CAMPAIGN_ROOT } from './lib/tauri-commands';
import { FileEntry } from './lib/types';
import { HUD } from './components/HUD';
import { useSupportCooldown } from './hooks/useSupportCooldown';
import { GameNotifications } from './components/HUD/GameNotifications';
import { Minimap } from './components/HUD/Minimap';
import { Scene } from './components/Scene/Scene';
import { FileBlocks } from './components/Scene/FileBlocks';
import type { GhostContact } from './components/Scene/ghostHutSurface';
import { VirtualDrivePanel } from './components/VirtualDrivePanel';
import { RearFieldEncounter } from './components/Scene/RearFieldEncounter';
import {createGhostHutProbe, HUT_RESTORE_SECONDS} from './components/Scene/ghostHutSurface';
import {firstRearContact} from './lib/rearStronghold';
import {riverLandingSite} from './components/Scene/riverLanding';
import {FieldPickups} from './components/Scene/FieldPickups';
import {collectSupply,splitFieldDamage,type PickupKind} from './lib/fieldPickups';
import {fieldBuildingDamage,createLandingContact,BUILDING_INTEGRITY,type FieldDamage,type FieldBuilding} from './lib/fieldBuildings';
import { REAR_HUT, newRearGuardPose, REAR_GUARD_MAX_HP, REAR_GUARD_PULSE_DAMAGE, damageRearGuard } from './lib/rearStronghold';
import { Particles } from './components/Scene/Particles';
import { Tank } from './components/Scene/Tank';
import { newTankImpactFeed, publishTankImpact, resetTankImpact } from './lib/tankImpactFeedback';
import { CameraRig } from './components/Scene/CameraRig';
import { Crosshair } from './components/Scene/Crosshair';
import { useFileBlocks, useStableSectorPage } from './hooks/useFileBlocks';
import { Projectile, useProjectilePool } from './hooks/useProjectilePool';
import { useMarkedFiles } from './hooks/useMarkedFiles';
import { ProjectileManager } from './components/Scene/ProjectileManager';
import { createVillageObstacle } from './lib/villageCover';
import { createRiverStations } from './components/Scene/riverLayout';
import { createTankGroundProfile } from './lib/tankGroundProfile';
import { createRiverFlankPost,riverFlankEnabled } from './lib/riverFlankPost';
import { useExplosionPool } from './hooks/useExplosionPool';
import { ExplosionParticles } from './components/Scene/ExplosionParticles';
import { createTrainingEntries, TRAINING_DIRECTORY } from './lib/training';
import { GHOST_RIVER_START, GHOST_RIVER_YAW, startsOnRiverBank, GHOST_EMBASSY_START, GHOST_EMBASSY_YAW } from './lib/ghostSignal';
import type { GameSessionProps } from './lib/gameSession';
import {nominatedChoices} from './lib/cleanupDesk';
import { useGameAudio } from './hooks/useGameAudio';
import { useZombieAmbience } from './hooks/useZombieAmbience';
import { useBossVoice } from './hooks/useBossVoice';
import { NightmareWaveTakeover } from './components/HUD/NightmareWaveTakeover';
import { OrdnanceEffects } from './components/Scene/OrdnanceEffects';
import { TankWaterEffects } from './components/Scene/TankWaterEffects';
import { TankTreadImprints } from './components/Scene/TankTreadImprints';
import { VietCongCombatants } from './components/Scene/VietCongCombatants';
import { CampaignTunnels } from './components/Scene/CampaignTunnels';
import {
  USInfantrySquad,
} from './components/Scene/USInfantrySquad';
import { CRASHED_HUEY_TRANSFORM } from './components/Scene/VietnamEnvironment';
import { useEnemyCombat } from './hooks/useEnemyCombat';
import { useZombieEpilogue } from './hooks/useZombieEpilogue';
import { useFinalBossAllies } from './hooks/useFinalBossAllies';
import { ZombieHorde } from './components/Scene/ZombieHorde';
import { FinalBossAllies } from './components/Scene/FinalBossAllies';
import { EmbassyLift } from './components/Scene/EmbassyLift';
import { CampaignFlights } from './components/Scene/CampaignFlights';
import { canRunCampaignFlights,DAY_CALLS,type DayCall } from './lib/campaignFlights';
import type { LiftCall } from './lib/embassyLift';
import { BaldEagleSupport } from './components/Scene/BaldEagleSupport';
import { EmbassyDefense } from './components/Scene/EmbassyDefense';
import { EMBASSY_DEFENSE_OFFSET_Z, EMBASSY_GUARD_POSITION, EMBASSY_GUARD_YAW, embassyCombatObstacles } from './lib/embassyDefense';
import {
  type CannonReloadState,
  FLAMETHROWER_CONE_DOT,
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
  findLivingZombiesInRectangle, findNearestLivingZombieHit,
  type FriendlyZombieHitEvent,
  type ZombieFriendlyBreachEvent,
  type ZombieTankBreachEvent,
} from './lib/zombieEpilogue';
import { findNearestLivingEnemyHit, getUSFightingPositions, hashCombatSession } from './lib/combat';
import {
  createFileObjective,
  getFileObjectiveProgress,
  type FileObjective,
} from './lib/mission';
import type { TankCollider } from './lib/worldCollision';

type AppState = 'starting' | 'scanning' | 'ready';

// Drive keys are scoped to the tank so focus and session changes can disarm them.
const CONTROLS_MAP = [
  { name: 'batchDelete', keys: ['Delete', 'KeyX'] },
];

const NOOP_HOVER = () => {};
const NO_PORTALS: {position:[number,number,number]}[]=[];

/** Stable callback identity with the latest render's implementation. */
function useStableEvent<T extends (...args: any[]) => any>(handler: T): T {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  return useCallback(((...args: Parameters<T>) => (
    handlerRef.current(...args)
  )) as T, []);
}

function GameSession({ launch, achievementNotice, onFieldReady, launchTransitionActive=false, onExit, onReviewCleanup, identifiedCleanupId, onUnlockDefense, defenseFiles, fieldRadio, settings, settingsOpen, scoreState, worldGunBank }: GameSessionProps) {
  const [state, setState] = useState<AppState>('starting');
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [driveOpen, setDriveOpen] = useState(false);
  const [rearView, setRearView] = useState(false);
  const [guardHealth,setGuardHealth]=useState(REAR_GUARD_MAX_HP);
  const guardHpRef=useRef(REAR_GUARD_MAX_HP);
  const rearGuardPoseRef=useRef(newRearGuardPose());
  const structures=useRef({radioHut:BUILDING_INTEGRITY,landing:BUILDING_INTEGRITY});
  const [ruins,setRuins]=useState({radioHut:false,landing:false});
  const signalReleased=useRef(false);
  const [guardSpotted,setGuardSpotted]=useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState<number>(0);
  const [deletedBytes, setDeletedBytes] = useState<number>(0);
  const [restoreDeadlines,setRestoreDeadlines]=useState<ReadonlyMap<string,number>>(()=>new Map());
  function showRestoredHut(path:string) {
    const now=performance.now();
    setRestoreDeadlines(previous=>{
      const active=new Map([...previous].filter(([,end])=>end>now));
      active.set(path,now+1000*HUT_RESTORE_SECONDS);
      return active;
    });
  }
  const bankEntry=startsOnRiverBank(launch.mode,launch.mode==='training'?launch.preview:undefined);
  // The route is known before scanning the simulated drive; derive the
  // initial combat and render post from the same immutable map seed.
  const fieldMap=launch.mode==='directory'?CAMPAIGN_ROOT:TRAINING_DIRECTORY;
  const environmentSeed=useMemo(()=>hashCombatSession(currentDirectory??fieldMap),[currentDirectory,fieldMap]);
  const navigationRiver=useMemo(()=>createRiverStations(environmentSeed),[environmentSeed]);
  const hasFlank=riverFlankEnabled(launch.mode,launch.mode==='training'?launch.preview:undefined);
  const riverFlank=useMemo(()=>hasFlank?createRiverFlankPost(navigationRiver,environmentSeed):undefined,
    [hasFlank,navigationRiver,environmentSeed]);
  const [tankStartPosition, setTankStartPosition] = useState<[number, number, number]>(()=>bankEntry?GHOST_RIVER_START:[0,0,-12]);
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
  const burning = useMemo(() => new Map<string, BurningSurface>(), [currentDirectory, launch]);
  const [flameFuel, setFlameFuel] = useState(1);
  const [napalmStrikes, setNapalmStrikes] = useState<NapalmStrike[]>([]);
  const {until:napalmUntil,readyAt:napalmReadyAtRef,start:setNapalmCooldown,cinematic:napalmCamera} = useSupportCooldown(500);
  const [eagleStrikes, setEagleStrikes] = useState<EagleStrafe[]>([]);
  const {until:eagleUntil,readyAt:eagleReadyAtRef,start:setEagleCooldown} = useSupportCooldown();
  const [eagleBusy, setEagleBusy] = useState(false);
  const [eagleTargeting, setEagleTargeting] = useState(false);
  const [combatSessionKey, setCombatSessionKey] = useState(0);
  const [defenseAttempt, setDefenseAttempt] = useState(0);
  const [liftCall,setLiftCall]=useState<LiftCall>(null);
  const [dayRadio,setDayRadio]=useState<{sector:number;call:DayCall}|null>(null);
  const [tankIntegrity, setTankIntegrity] = useState(100);
  const [armorPlate,setArmorPlate]=useState(0),plateRef=useRef(0);
  function setPlate(n:number){plateRef.current=n;setArmorPlate(n);}
  const takeSupply=useStableEvent((kind:PickupKind)=>{
    const gain=collectSupply(kind,tankIntegrity,plateRef.current);
    if(!gain)return false;
    if(kind==='patch')setTankIntegrity(gain.hp);else setPlate(gain.plate);
    toast.success(kind==='patch'?'Patch kit · +'+(gain.hp-tankIntegrity)+' hull':'Armor plate fitted · 16 shield',{duration:1800});
    return true;
  });
  const [damageFlash, setDamageFlash] = useState(false);
  const [nightmareTakeover, setNightmareTakeover] = useState<{
    token: number;
    wave: number;
    boss: boolean;
  } | null>(null);
  const [fileObjective, setFileObjective] = useState<FileObjective | null>(null);
  const [sectorPageIndex, setSectorPageIndex] = useState(0);
  const launchStartedRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const scanRequestRef = useRef(0);
  const pendingEffectsRef = useRef(new Set<number>());
  const trainingUndoStackRef = useRef<FileEntry[]>([]);
  const ordnanceIdRef = useRef(0);
  const eagleTargetingRef = useRef(false);
  const worldSessionRef = useRef(0);
  const automaticHitTriggerByPathRef = useRef(new Map<string, number>());
  const napalmPayloadsRef = useRef(new Map<number, {
    session: number;
    filePaths: string[];
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
  const tankImpactFeed=useMemo(newTankImpactFeed,[]);
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
  const { score, addPoints, removePoints } = scoreState;
  const { explosions, spawn: spawnExplosion, despawn: despawnExplosion } = useExplosionPool();
  const gameAudio = useGameAudio(worldGunBank);
  const zombieAmbience = useZombieAmbience(
    gameAudio.setNightmareRainMix,
    gameAudio.setNightmareRainDuck,
  );
  const bossVoice = useBossVoice({
    setMusicDuck: fieldRadio.setBossVoiceDuck,
    setZombieAmbienceDuck: zombieAmbience.setBossVoiceDuck,
  });

  useEffect(() => {
    gameAudio.setAudioGains({
      master: settings.masterVolume,
      weapons: settings.weaponsVolume,
      ambience: settings.ambienceVolume,
      effects: settings.voiceEffectsVolume,
    });
    fieldRadio.setAudioGains({
      master: settings.masterVolume,
      music: settings.musicVolume,
    });
    zombieAmbience.setAudioGains({
      master: settings.masterVolume,
      ambience: settings.ambienceVolume,
      effects: settings.voiceEffectsVolume,
    });
    bossVoice.setAudioGains({
      master: settings.masterVolume,
      voice: settings.voiceEffectsVolume,
    });
  }, [
    bossVoice.setAudioGains,
    fieldRadio.setAudioGains,
    gameAudio.setAudioGains,
    settings.ambienceVolume,
    settings.masterVolume,
    settings.musicVolume,
    settings.voiceEffectsVolume,
    settings.weaponsVolume,
    zombieAmbience.setAudioGains,
  ]);
  const {
    enemies,
    enemiesRef,
    enemyPosesRef,
    livingEnemies,
    aliveCount: hostileCount,
    reserves, tunnelCue, advanceTunnels,
    friendlies,
    livingFriendlies,
    friendliesRef,
    friendlyPosesRef,
    friendlyAliveCount,
    damageEnemy,
    killEnemy,
    damageFriendly,
    resetFriendlies,
    deployPassenger,
    admitPassenger, deployCampaignPassenger,
    fitVillage,
  } = useEnemyCombat({ sessionKey: combatSessionKey, count: 12, campaignTunnels:launch.mode==='directory',repeatRelief:currentDirectory===CAMPAIGN_ROOT,riverFlank });
  const deathMarks = useMemo(createUndeadDeathMarks, [combatSessionKey, defenseAttempt]);
  const directDefense = launch.mode==='horde' || (launch.mode==='training' && launch.preview==='embassy');
  const [handoff,setHandoff]=useState<CurtainStage|null>(null);
  const [presentedDefense,setPresentedDefense]=useState<string|null>(null);
  const defenseKey=combatSessionKey+':'+defenseAttempt;
  const defenseReady=presentedDefense===defenseKey;
  const horde = useZombieEpilogue({
    warningReady: defenseReady,
    onKilled: deathMarks.onKilled,
    sessionKey: combatSessionKey,
    seed: hashCombatSession(currentDirectory ?? TRAINING_DIRECTORY),
  });
  const nightmareBoss = horde.livingZombies.find(zombie => zombie.archetype === 'boss');
  const embassyMode = horde.phase !== 'locked';
  const drivingDisabled = launchTransitionActive || !!handoff || settingsOpen || driveOpen || horde.phase === 'defeat';
  useEffect(() => { setRearView(false); }, [combatSessionKey, defenseAttempt, embassyMode]);
  const infantryContacts=useMemo(createInfantryContacts,[combatSessionKey,defenseAttempt,embassyMode]);
  const showRifleCoverHit=(point:THREE.Vector3)=>infantryContacts.emit('cover',point);
  const characterBurns=useMemo<CharacterBurns>(()=>new Map(),[combatSessionKey,defenseAttempt,embassyMode,horde.wave]);
  const fieldFloor=useMemo(()=>createTankGroundProfile(navigationRiver,environmentSeed),[navigationRiver,environmentSeed]);
  const hordeGround=embassyMode?fieldFloor:undefined;
  const campaignField=launch.mode==='directory'&&!embassyMode;
  const fieldOutstanding=hostileCount+reserves;
  const standingHuts=entries.reduce((count,f)=>count+Number(!f.is_dir),0);
  const standing=standingHuts+Number(!ruins.radioHut)+Number(!ruins.landing);
  const nextStructure=standingHuts ? 'Clear the marked file huts.' : !ruins.landing
    ? 'The riverside fishing shelter is still standing.' : !ruins.radioHut
    ? 'The rear mast hut is still standing.' : 'Field cleared.';
  const campaignOrder=(tunnelCue?`TUNNEL OPENING · wave ${tunnelCue.batch}/2. `:'')
    +`Structures standing: ${standing}. ${nextStructure}`
    +(guardSpotted&&guardHealth>0?' Guard tank active.':'');
  const spotRearGuard=useCallback(()=>setGuardSpotted(true),[]);
  const stableRearAttack=useStableEvent(()=>handleTankHit(REAR_GUARD_PULSE_DAMAGE,new THREE.Vector3(rearGuardPoseRef.current.x,1.1,rearGuardPoseRef.current.z)));
  const hurtRearGuard=useStableEvent((kind: 'cannon'|'machinegun'|'napalm')=>{
    if(!campaignField||!sessionActiveRef.current||guardHpRef.current<=0)return;
    const previous=guardHpRef.current, remaining=damageRearGuard(previous,kind);
    guardHpRef.current=remaining;setGuardHealth(remaining);setGuardSpotted(true);
    if (!remaining || kind !== 'cannon') spawnExplosion(new THREE.Vector3(rearGuardPoseRef.current.x,1.1,rearGuardPoseRef.current.z),remaining?'#e1a554':'#e87f36',remaining > 0 ? .28 : 1.2);
    if(!remaining)toast.success('Guard tank disabled · radio hut exposed',{duration:2600});
  });
  const damageStructure=useStableEvent((key:FieldBuilding,kind:FieldDamage,contact?:THREE.Vector3)=>{
    if(!sessionActiveRef.current||embassyMode||launch.mode==='cleanup'||(key==='radioHut'&&!campaignField))return;
    const before=structures.current[key];if(!before)return;
    const hp=fieldBuildingDamage(before,kind);structures.current[key]=hp;
    const where=key==='radioHut'?REAR_HUT:[landingSite.cx,0,landingSite.z];
    if(!hp){
      setRuins(prev=>({...prev,[key]:true}));
      if(key==='radioHut')toast('Rear mast hut down',{duration:1600});
    }
    if (hp && kind === 'flame') return;
    spawnExplosion(contact ?? new THREE.Vector3(where[0], .88, where[2]),
      hp ? '#aa8452' : '#be8b50', hp ? .32 : 1.08, 'timber');
  });
  const onRearHutHit=useStableEvent((p:Projectile)=>damageStructure('radioHut',p.kind,p.position));
  const onLandingHit=useStableEvent((p:Projectile)=>damageStructure('landing',p.kind,p.position));
  const handleRearHit=useStableEvent((projectile:Projectile)=>hurtRearGuard(projectile.kind));
  // Only the fictional field participates. Wait for the last visible de-rez
  // (entries removal), not an armed marker or an empty loading scan. No key,
  // radio range, remaining troop or tank is an additional progression gate.
  useEffect(()=>{
    if(!campaignField || currentDirectory!==CAMPAIGN_ROOT || state!=='ready' || !sessionActiveRef.current ||
       settingsOpen || driveOpen || tankIntegrity<=0 || standing!==0 || signalReleased.current)return;
    signalReleased.current=true;
    fieldRadio.beginBonusRound();
    setHandoff('covering');
  },[campaignField,currentDirectory,state,standing,settingsOpen,driveOpen,tankIntegrity,fieldRadio.beginBonusRound]);

  function enterDefenseUnderCover() {
    if(!sessionActiveRef.current)return;
    const files=['outpost-radio-transcript.txt'];
    if(horde.begin('field-demolished',files.length)){
      setHandoff('covered');
      onUnlockDefense(files);
    }else{
      signalReleased.current=false;
      setHandoff('revealing');
    }
  }
  const fieldPresented=useStableEvent(()=>{
    if(embassyMode){
      setPresentedDefense(defenseKey);
      setHandoff(stage=>stage==='covered'?'revealing':stage);
    } else {
      gameAudio.setBattlefieldActive(true);
      void fieldRadio.launch();
    }
    onFieldReady?.();
  });
  const daytimeFlights=canRunCampaignFlights(launch,embassyMode);
  const reportDayCall=useCallback((call:DayCall)=>setDayRadio({sector:combatSessionKey,call}),[combatSessionKey]);
  const previewDefense = launch.mode === 'training' && launch.preview === 'embassy';
  const spawnPosition = embassyMode ? (previewDefense ? GHOST_EMBASSY_START : EMBASSY_GUARD_POSITION) : tankStartPosition;
  const embassyModeRef = useRef(embassyMode);
  embassyModeRef.current = embassyMode;
  const finalBossEncounterActive = state === 'ready'
    && horde.phase === 'combat'
    && horde.wave === horde.maxWaves
    && Boolean(nightmareBoss?.alive);
  const bossAllies = useFinalBossAllies({
    enabled: finalBossEncounterActive,
    encounterKey: `${combatSessionKey}:${defenseAttempt}:${horde.wave}`,
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

    if (horde.begin(fileObjective.id, defenseFiles.length)) {
      pendingHordeStartRef.current = false;
    }
  }, [defenseFiles.length, fileObjective?.id, horde.begin, horde.phase, state]);

  useEffect(() => {
    const finalWaveIsNext = state === 'ready'
      && horde.phase === 'intermission'
      && horde.wave === horde.maxWaves - 1;
    if (finalWaveIsNext) {
      bossVoice.prepare();
      fieldRadio.prepareFinalBossTrack();
    }
  }, [
    bossVoice.prepare,
    fieldRadio.prepareFinalBossTrack,
    horde.maxWaves,
    horde.phase,
    horde.wave,
    state,
  ]);

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
    if (state !== 'ready') {
      zombieAmbience.stop();
      gameAudio.stopAllLoops();
      if (state === 'scanning' || state === 'starting') fieldRadio.suspend();
      else fieldRadio.stop();
    }
  }, [
    state,
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
    resetTankImpact(tankImpactFeed);
    setPlate(0);
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
    napalmPayloadsRef.current.clear();
    eaglePayloadsRef.current.clear();
    tankHitCooldownRef.current = 0;
    if (damageFlashTimeoutRef.current !== null) {
      window.clearTimeout(damageFlashTimeoutRef.current);
      damageFlashTimeoutRef.current = null;
    }
  }, [bossVoice.stop, combatSessionKey, tankImpactFeed]);

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

  // All sectors are simulated. Defer one microtask so StrictMode's discarded
  // mount cannot start a scan that the surviving mount waits on forever.
  useEffect(() => {
    sessionActiveRef.current = true;
    let disposed = false;
    function start() {
      if (disposed) return;
      if (launchStartedRef.current) return;
      launchStartedRef.current = true;
      if (launch.mode === 'horde' || (launch.mode === 'training' && launch.preview === 'embassy')) startHordeMode();
      else if (launch.mode === 'training' || launch.mode === 'cleanup') startTraining();
      else {
        setCurrentDirectory(CAMPAIGN_ROOT);
        void scanDirectory(CAMPAIGN_ROOT);
      }
    }
    queueMicrotask(start);
    return () => {
      disposed = true;
      sessionActiveRef.current = false;
      resetTankImpact(tankImpactFeed);
      scanRequestRef.current += 1;
      for (const timer of pendingEffectsRef.current) window.clearTimeout(timer);
      pendingEffectsRef.current.clear();
      if (damageFlashTimeoutRef.current !== null) {
        window.clearTimeout(damageFlashTimeoutRef.current);
        damageFlashTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (horde.phase === 'combat' || !eagleTargetingRef.current) return;
    eagleTargetingRef.current = false;
    setEagleTargeting(false);
  }, [horde.phase]);

  // Keyboard listener for Ctrl+Z (Cmd+Z on macOS) and batch delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (launchTransitionActive || handoff || settingsOpen) return;

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

      if (e.code === 'KeyV' && state === 'ready' && !drivingDisabled && !e.repeat &&
          !e.ctrlKey && !e.altKey && !e.metaKey && !(e.target instanceof HTMLElement &&
            (e.target.isContentEditable || e.target.matches('input, textarea, select')))) {
        e.preventDefault();
        setRearView(active => !active);
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
    handoff, launchTransitionActive, drivingDisabled,
    currentDirectory,
    markedCount,
    settingsOpen,
    state,
    fieldRadio.toggleMute,
    horde.phase,
    horde.aliveCount,
    eagleUntil,
    eagleBusy,
    eagleTargeting,
    resetFriendlies,
  ]); // Re-attach when relevant controls change

  function startTraining() {
    pendingHordeStartRef.current = false;
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    setIsTraining(true);
    setCurrentDirectory(TRAINING_DIRECTORY);
    const trainingEntries = launch.mode === 'cleanup' ? launch.fieldFiles : createTrainingEntries();
    setEntries(trainingEntries);
    setFileObjective(launch.mode==='cleanup'?null:createFileObjective(trainingEntries, `${TRAINING_DIRECTORY}:${worldSessionRef.current}`));
    setSectorPageIndex(0);
    setDeletedCount(0);
    setDeletedBytes(0);
    setTankStartPosition(bankEntry ? GHOST_RIVER_START : [0, 0, -12]);
    setWeaponMode('cannon');
    setFlameFuel(1);
    setNapalmStrikes([]);
    setNapalmCooldown(0);
    trainingUndoStackRef.current = [];
    resetMarkedState();
    setError(null);
    setState('ready');
  }

  function startHordeMode() {
    pendingHordeStartRef.current = true;
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    setIsTraining(true);
    setCurrentDirectory(TRAINING_DIRECTORY);

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
    setNapalmCooldown(0);
    trainingUndoStackRef.current = [];
    resetMarkedState();
    setError(null);
    setState('ready');
  }

  async function scanDirectory(path: string) {
    if (!sessionActiveRef.current) return;
    const request = ++scanRequestRef.current;
    setSectorPageIndex(0);
    setState('scanning');
    setError(null);

    try {
      const [result, stats] = await Promise.all([
        commands.scanDirectory(path),
        commands.getSessionStats().catch(() => null),
      ]);
      if (scanRequestRef.current !== request) return;
      if (stats) {
        setDeletedCount(stats[0]);
        setDeletedBytes(stats[1]);
      }
      const fieldFiles=result.filter(entry=>!entry.is_dir);
      setEntries(fieldFiles);
      setFileObjective(createFileObjective(fieldFiles, `${path}:${worldSessionRef.current}`));
      setState('ready');
    } catch (err) {
      if (scanRequestRef.current !== request) return;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Failed to scan directory:', errorMsg);
      onExit(`Scan failed: ${errorMsg}`);
    }
  }

  function changeDirectory() {
    sessionActiveRef.current = false;
    scanRequestRef.current += 1;
    worldSessionRef.current += 1;
    setCombatSessionKey(prev => prev + 1);
    automaticHitTriggerByPathRef.current.clear();
    resetMarkedState();
    setIsTraining(false);
    setFileObjective(null);
    setSectorPageIndex(0);
    setNapalmStrikes([]);
    if(launch.mode==='cleanup') onReviewCleanup(nominatedChoices(launch.fieldFiles,markedFiles));
    else onExit();
  }

  async function handleUndoLastTrash() {
    if (embassyModeRef.current) return;
    if(launch.mode==='cleanup') return;
    const session = worldSessionRef.current;
    const undoIsCurrent = () => sessionActiveRef.current && worldSessionRef.current === session;
    if (isTraining) {
      const restoredEntry = trainingUndoStackRef.current.pop();
      if (!restoredEntry) return;

      // Cancel any active de-rez synchronously. If the hut is still present,
      // keep that existing entry instead of introducing a duplicate.
      finishDeletion(restoredEntry.path);
      setEntries(prev => prev.some(entry => entry.path === restoredEntry.path)
        ? prev
        : [...prev, restoredEntry]);
      showRestoredHut(restoredEntry.path);
      setDeletedCount(prev => Math.max(0, prev - 1));
      setDeletedBytes(prev => Math.max(0, prev - restoredEntry.size));
      removePoints(restoredEntry.size);
      toast.success(`Restored ${restoredEntry.name} in training`, { duration: 2500 });
      return;
    }

    try {
      const action = await commands.undoLastTrash();
      if (!undoIsCurrent()) return;

      if (action) {
        finishDeletion(action.file_path);
        removePoints(action.original_size);
        // Show success toast
        toast.success(`Restored ${action.file_name}`, { duration: 3000 });

        // Update session stats
        const [count, bytes] = await commands.getSessionStats();
        if (!undoIsCurrent()) return;
        setDeletedCount(count);
        setDeletedBytes(bytes);

        // Re-add file to list (scan the directory again to get fresh list)
        if (currentDirectory) {
          const result = await commands.scanDirectory(currentDirectory);
          if (!undoIsCurrent()) return;
          setEntries(result.filter(entry=>!entry.is_dir));
          showRestoredHut(action.file_path);
        }
      }
      // If nothing to undo, just ignore (don't show toast)
    } catch (err) {
      if (undoIsCurrent()) toast.error(`Failed to undo: ${err}`);
    }
  }

  // Shoot handler for Tank component
  function applyEnemyDamage(
    enemyId: string,
    amount: number,
    source: 'cannon' | 'machinegun' | 'flamethrower' | 'napalm' | 'friendly-rifle',
    contact?: THREE.Vector3,
  ) {
    const result = damageEnemy(enemyId, amount, source);
    if(result && source==='friendly-rifle' && contact) infantryContacts.emit('rifle',contact);
    if(result && source==='flamethrower')igniteCharacter(characterBurns,enemyId,!result.killed);
    if (!result?.killed) return;

    const [x, y, z] = result.enemy.position;
    const hitPosition = enemyPosesRef.current.get(enemyId)?.position.clone() ?? new THREE.Vector3(x,y,z);
    hitPosition.y += .45;
    if (source === 'friendly-rifle') return;
    spawnExplosion(hitPosition, '#d75b32', 0.52);
    toast.success('Hostile position neutralized', { duration: 1500 });
  }

  function handleFriendlyInfantryHit(friendlyId: string, damage: number, bulletContact?:THREE.Vector3) {
    const result = damageFriendly(friendlyId, damage);
    if(result && bulletContact){ infantryContacts.emit('rifle',bulletContact); return; }
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
        const hitPosition = enemyPosesRef.current.get(enemyId)?.position.clone() ?? new THREE.Vector3(x,y,z);
        hitPosition.y += .58;
        spawnExplosion(hitPosition, '#ffc46b', 0.12);
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
    if (!result) return;
    infantryContacts.emit(event.bulletDirection ? 'undeadRifle' : 'rifle', event.position);
    const pose = horde.posesRef.current.get(event.zombieId);
    if (pose && !result.killed && event.bulletDirection) {
      const impact = pose.rifleImpact ??= { at: 0, direction: new THREE.Vector3() };
      impact.at = performance.now() / 1000;
      impact.direction.copy(event.bulletDirection);
    }
  }

  function handleZombieTankBreach(event: ZombieTankBreachEvent) {
    const isBossAttack = horde.zombiesRef.current.some(zombie => (
      zombie.id === event.zombieId && zombie.alive && zombie.archetype === 'boss'
    ));
    const outcome = horde.registerBreach();
    if (!outcome.accepted) return;
    handleTankHit(event.damage,event.position,true);
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
    const showStrike=(soldier:{id:string;position:readonly number[];kneeling:boolean},killed:boolean)=>{
      const feet=friendlyPosesRef.current.get(soldier.id)?.position ??
        new THREE.Vector3(soldier.position[0],soldier.position[1],soldier.position[2]);
      const towards=event.position.clone().sub(feet).setY(0).normalize();
      const hit=feet.clone().addScaledVector(towards,.22);
      hit.y+=infantryAimHeight(soldier.kneeling);
      infantryContacts.emit(killed ? 'fatal' : 'claw',hit);
      if(killed && hordeGround){
        const {x,z}=feet, floor=(u:number,v:number)=>undeadSupportY(hordeGround,u,v);
        const soil=floor(x,z);
        // Authored guard posts can sit on thin paving or mud over the terrain.
        // Use the planted boot height there, and the ground below an airborne troop.
        const y=feet.y-soil<.25?Math.max(soil,feet.y):soil;
        infantryContacts.emit('stain',new THREE.Vector3(x,y+.022,z),
          (floor(x+.25,z)-floor(x-.25,z))/.5,(floor(x,z+.25)-floor(x,z-.25))/.5);
      }
    };
    if (bossAllies.handleFriendlyBreach(event,hit=>showStrike(hit.ally,hit.killed))) return;
    const hit=damageFriendly(event.friendlyId,event.damage);
    if(hit)showStrike(hit.friendly,hit.killed);
  }

  function clearEncounterOrdnance() {
    setPlate(0);
    // Neither the transition out of cleanup nor a retry may inherit an old
    // pending audio callback, projectile, or area-damage payload.
    worldSessionRef.current += 1;
    for (const timer of pendingEffectsRef.current) window.clearTimeout(timer);
    pendingEffectsRef.current.clear();
    for (const projectile of pool.current) projectile.active = false;
    for (const explosion of explosions) despawnExplosion(explosion.id);
    napalmPayloadsRef.current.clear();
    eaglePayloadsRef.current.clear();
    setNapalmStrikes([]); setEagleStrikes([]);
    setNapalmCooldown(0); setEagleCooldown(0); setEagleBusy(false);
    eagleTargetingRef.current = false; setEagleTargeting(false);
    automaticHitTriggerByPathRef.current.clear();
  }

  function handleRetryZombieDefense() {
    if (!horde.retry()) return;
    clearEncounterOrdnance();
    gameAudio.stopAllLoops();
    gameAudio.setBattlefieldActive(true);
    bossVoice.stop();
    zombieAmbience.stop();
    fieldRadio.stop(); fieldRadio.beginBonusRound();
    setDefenseAttempt(attempt => attempt + 1);
    setLiftCall(null);
    resetFriendlies(EMBASSY_DEFENSE_OFFSET_Z);
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

  function handleTankHit(damage: number,worldContact?:THREE.Vector3, kinetic=false) {
    const now = performance.now();
    if (now < tankHitCooldownRef.current || tankIntegrity <= 0) return;
    tankHitCooldownRef.current = now + 260;

    publishTankImpact(tankImpactFeed,tankRef.current,worldContact);
    if(kinetic && worldContact && tankRef.current){
      const tank=tankRef.current, local=tank.worldToLocal(worldContact.clone());
      local.x=THREE.MathUtils.clamp(local.x,-.89,.89);
      local.y=THREE.MathUtils.clamp(local.y,.42,1.04);
      local.z=THREE.MathUtils.clamp(local.z,-1.16,1.16);
      infantryContacts.emit('armor',tank.localToWorld(local));
    }
    const hit=splitFieldDamage(damage,plateRef.current);
    if(plateRef.current!==hit.plate)setPlate(hit.plate);
    if(hit.hull)setTankIntegrity(current => Math.max(0, current - hit.hull));
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

  function handleAutomaticHit(filePath: string, triggerId: number, hasSurfaceContact=false) {
    if (automaticHitTriggerByPathRef.current.get(filePath) === triggerId) return;
    automaticHitTriggerByPathRef.current.set(filePath, triggerId);
    void handleProjectileHit(filePath,undefined,hasSurfaceContact);
  }

  function handleProjectileCollision(filePath: string, projectile: Projectile, contact?: GhostContact) {
    if (embassyModeRef.current || deletingFiles.has(filePath)) return;
    if(launch.mode==='cleanup') {
      if(projectile.kind==='cannon'&&entries.some(f=>f.path===filePath)&&!isMarked(filePath)){
        markFile(filePath); toast('Nominated for review · no file moved',{duration:1600});
      }
      return;
    }
    // The struck triangle belongs to the current render batch; copy it before
    // any async confirmation. A held trigger may mark only once, as before.
    if (contact && !getProtectedObjectiveOriginalPaths().has(filePath)
        && (projectile.kind!=='machinegun' || automaticHitTriggerByPathRef.current.get(filePath)!==projectile.triggerId)) {
      contact.skin?.strike(contact.index,contact.point,contact.normal);
    }
    if (projectile.kind === 'machinegun') {
      handleAutomaticHit(filePath, projectile.triggerId, !!contact);
      return;
    }
    void handleProjectileHit(filePath,undefined,!!contact);
  }

  function handleFlamethrower(position: THREE.Vector3, direction: THREE.Vector3, triggerId: number,
    reach: number, contact: WeaponContact | null) {
    if (contact?.kind === 'building' && contact.key && launch.mode !== 'cleanup') {
      const key = contact.key;
      const point = position.clone().addScaledVector(direction, Math.max(0, reach - .09));
      const previous = burning.get(key);
      if (previous) {
        previous.until = performance.now() + 6200;
        // Leave an established seat of fire on the wall as the nozzle sweeps away.
      } else {
        const outward = new THREE.Vector3(-direction.x, 0, -direction.z);
        if (outward.lengthSq() < .0001) outward.set(0, 0, 1);
        const started = performance.now();
        burning.set(key, {point, outward:outward.normalize(), started, until:started + 6200});
      }
      if (key === 'landing' || key === 'radioHut') damageStructure(key, 'flame', point);
      else if (!embassyModeRef.current && key.startsWith('file:')) handleAutomaticHit(key.slice(5), triggerId, true);
    }
    for (const enemy of embassyModeRef.current ? [] : livingEnemies) {
      const enemyPosition = enemyPosesRef.current.get(enemy.id)?.position.clone() ?? new THREE.Vector3(...enemy.position);
      enemyPosition.y += enemy.stance === 'kneeling' ? 0.48 : 0.62;
      const offset = enemyPosition.sub(position);
      const distance = offset.length();
      const alignment = distance > 0 ? offset.normalize().dot(direction) : 1;
      if (distance <= reach + (contact?.kind === 'actor' ? 1 : 0) && alignment >= FLAMETHROWER_CONE_DOT) {
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
        ? (offsetX * direction.x
          + offsetY * direction.y
          + offsetZ * direction.z) / distance
        : 1;
      if (distance <= reach + (contact?.kind === 'actor' ? 1 : 0) && alignment >= FLAMETHROWER_CONE_DOT) {
        zombieTargets.push(zombie.id);
      }
    }
    const zombieResults = horde.damageZombies(zombieTargets, 18, 'flamethrower');
    for (const result of zombieResults) {
      igniteCharacter(characterBurns,result.zombie.id,!result.killed);
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

    setNapalmCooldown(NAPALM_COOLDOWN_SECONDS);

    const id = ordnanceIdRef.current++;
    const strikeSession = worldSessionRef.current;
    const flatAimDirection = new THREE.Vector2(runDirection.x, runDirection.z).normalize();
    const strikeDirection = new THREE.Vector2(flatAimDirection.y, -flatAimDirection.x).normalize();
    const strikeRotation = Math.atan2(-strikeDirection.y, strikeDirection.x);

    const targets = (embassyModeRef.current ? [] : allBlocks)
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

    const enemyTargets = (embassyModeRef.current ? [] : livingEnemies)
      .map(enemy => {
        const pose = enemyPosesRef.current.get(enemy.id)?.position;
        const offsetX = (pose?.x ?? enemy.position[0]) - target.x;
        const offsetZ = (pose?.z ?? enemy.position[2]) - target.z;
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
      position: [target.x, 0.03, target.z],
      rotation: strikeRotation,
      impacted: false,
      lastBurnDamageAt: new Map(),
    });

    const beginSynchronizedStrike = (audibleAtMs: number) => {
      if (worldSessionRef.current !== strikeSession) {
        napalmPayloadsRef.current.delete(id);
        return;
      }

      setNapalmStrikes(prev => [...prev, {
        id, audibleAtMs,
        position: [target.x, 0.03, target.z],
        rotation: strikeRotation,
      }]);
      const targetCount = (embassyModeRef.current ? 0 : targets.length + enemyTargets.length)
        + zombieTargetsAtDesignation.length;
      toast(
        targetCount > 0
          ? `Phantom inbound · ${targetCount} targets in strike zone`
          : 'Phantom inbound · strike zone is clear',
        { duration: 2000 },
      );
    };

    // Anchor the flyover and impact to sample zero at the audio output.
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
      (embassyModeRef.current ? [] : allBlocks)
        .filter(block => !deletingFiles.has(block.path))
        .map(block => block.path),
    );
    const filePathsAtImpact = payload.filePaths.filter(filePath => liveFilePaths.has(filePath));
    const gp=rearGuardPoseRef.current;
    if(campaignField && isPointInsideNapalmStrike(gp.x,gp.z,payload,.8))hurtRearGuard('napalm');
    if(campaignField && isPointInsideNapalmStrike(REAR_HUT[0],REAR_HUT[2],payload,1.2))damageStructure('radioHut','napalm');
    if(!embassyMode && isPointInsideNapalmStrike(landingSite.cx,landingSite.z,payload,1.4))damageStructure('landing','napalm');

    let enemyCasualties = 0;
    // Resolve moving actors at impact, not at designation eight seconds ago.
    for (const enemy of embassyModeRef.current ? [] : enemiesRef.current) {
      const pose = enemyPosesRef.current.get(enemy.id)?.position;
      if (!enemy.alive || !isPointInsideNapalmStrike(
        pose?.x ?? enemy.position[0],
        pose?.z ?? enemy.position[2],
        payload,
        0.35,
      )) continue;
      const enemyId = enemy.id;
      const hitPosition = pose?.clone() ?? new THREE.Vector3(...enemy.position);
      payload.lastBurnDamageAt.set(`enemy:${enemyId}`, impactAt);
      const result = killEnemy(enemyId, 'napalm');
      if (!result?.killed) continue;
      enemyCasualties += 1;
      spawnExplosion(hitPosition.add(new THREE.Vector3(0, 0.4, 0)), '#ff6a28', 0.65);
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
      let deleted = 0;
      let lastName = '';
      let earned = 0;
      const tally = (name: string, points: number) => {
        deleted++;
        lastName = name;
        earned += points;
      };
      if(isTraining){
        // Fictional hits run synchronously through their training branch.
        // Start them together so one visible impact is one React update
        // batch rather than a chain of microtask-separated HUD commits.
        // Native/single-file confirmations remain strictly serial below.
        await Promise.all(filePathsAtImpact.map(filePath=>handleProjectileHit(filePath,tally)));
      }else for (const filePath of filePathsAtImpact) {
        await handleProjectileHit(filePath, tally);
      }
      if (deleted === 0 || payload.session !== worldSessionRef.current) return;
      // One lightweight confirmation for a strike, not an animated icon and
      // stacked toast for every hut. Marks, scores and errors are unchanged.
      toast(deleted === 1
        ? `Deleted ${lastName} (+${earned} pts)`
        : `Deleted ${deleted} files (+${earned} pts)`,
      { duration: 3000, removeDelay: 0, style: { animation: 'none' } });
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

    for (const enemy of embassyModeRef.current ? [] : enemiesRef.current) {
      const enemyPose = enemyPosesRef.current.get(enemy.id)?.position;
      if (!enemy.alive
        || !isPointInsideNapalmStrike(
          enemyPose?.x ?? enemy.position[0],
          enemyPose?.z ?? enemy.position[2],
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
    if(campaignField)return new Set<string>(); // The training duplicate exercise is not a campaign demolition restriction.
    const livePaths = new Set(entries.filter(entry => !entry.is_dir).map(entry => entry.path));
    return new Set(
      (fileObjective?.targets ?? [])
        .filter(target => livePaths.has(target.path))
        .map(target => target.duplicateOfPath),
    );
  }

  // Projectile hit handler with two-shot deletion logic
  async function handleProjectileHit(filePath: string, reportDeletion?: (name: string, points: number) => void, hasSurfaceContact=false) {
    if (embassyModeRef.current) return; // Also guards delayed impacts from the preceding sector.
    if(launch.mode==='cleanup') return; // Area and automatic weapons cannot even nominate.
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
          : await commands.moveToTrash(filePath,campaignField ? undefined : duplicateTarget?.duplicateOfPath);

        if (trainingEntry) {
          trainingUndoStackRef.current.push(trainingEntry);
        }

        // Add score points for the deletion
        const points = addPoints(action.original_size);

        // Spawn explosion at file location
        const block = allBlocks.find(b => b.path === filePath);
        if (block && !hasSurfaceContact) {
          spawnExplosion(
            new THREE.Vector3(block.position[0], block.position[1], block.position[2]),
            block.color,
            block.scale
          );
        }

        if (reportDeletion) reportDeletion(action.file_name, points);
        else toast.success(`Deleted ${action.file_name} (+${points} pts)`, { duration: 3000 });

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
  function scheduleSessionEffect(callback: () => void, delay: number) {
    if (!sessionActiveRef.current) return;
    const timer = window.setTimeout(() => {
      pendingEffectsRef.current.delete(timer);
      if (sessionActiveRef.current) callback();
    }, delay);
    pendingEffectsRef.current.add(timer);
  }

  async function handleBatchDelete() {
    if (embassyModeRef.current) return;
    if(launch.mode==='cleanup') return;
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
          scheduleSessionEffect(() => {
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
        return commands.moveToTrash(filePath,campaignField ? undefined : duplicateTarget?.duplicateOfPath);
      }, protectedOriginalPaths);
      const successfulPathSet = new Set(successfulPaths);
      const successfulBlocks = fileBlocks.filter(block => successfulPathSet.has(block.path));
      const failedCount = filesToDelete.length - successfulPaths.length;

      // Stagger explosions for chain reaction feel (80ms apart)
      successfulBlocks.forEach((block, index) => {
        scheduleSessionEffect(() => {
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

  // High-frequency HUD state belongs to App, but it must not force the large
  // tank and file-scene subtrees to reconcile or reinstall input listeners.
  const stableHandleShoot = useStableEvent(handleShoot);
  const showGroundBurst=useStableEvent((at:THREE.Vector3)=>{spawnExplosion(at,'#975f38',.80);});
  const stableHandleMachineGun = useStableEvent(handleMachineGun);
  const stableHandleFlamethrower = useStableEvent(handleFlamethrower);
  const stableHandleNapalm = useStableEvent(handleNapalm);
  const stableHandleEagleTarget = useStableEvent(handleEagleTarget);
  const stableHandleMeshRefsReady = useStableEvent(handleMeshRefsReady);
  const stableHandleDeletionComplete = useStableEvent(handleDeletionComplete);

  // Prepare data for 3D scene (needs to be before early returns so handlers can reference allBlocks)
  const landingSite=useMemo(()=>riverLandingSite(navigationRiver),[navigationRiver]);
  const landingContact=useMemo(()=>createLandingContact(landingSite),[landingSite]);
  const aimHutProbe=useMemo(createGhostHutProbe,[]);
  // The reticle and the projectile see the same buildings, including current ruins and guard pose.
  const fieldSurface=useStableEvent((from:THREE.Vector3,to:THREE.Vector3,structuresOnly=false): WeaponContact | null => {
    let nearest: WeaponContact | null = null;
    const consider = (t:number|undefined|null, kind:WeaponContact['kind'], key?:string) => {
      if (t != null && (!nearest || t < nearest.t)) nearest = {t,kind,key};
    };
    if (embassyMode) {
      consider(findNearestLivingZombieHit(from,to,horde.zombiesRef.current,horde.posesRef.current)?.t,'actor');
      return nearest;
    }
    if (campaignField) {
      const rear = firstRearContact(from,to,rearGuardPoseRef.current,ruins.radioHut,guardHpRef.current<=0);
      if (rear) consider(rear.t, rear.kind === 'hut' && !ruins.radioHut ? 'building' : 'actor', 'radioHut');
    }
    if (!ruins.landing && launch.mode !== 'cleanup') consider(landingContact(from,to), 'building', 'landing');
    const file=aimHutProbe(fileBlockRefsRef.current,from,to);
    if(file) consider(file.t,'building','file:'+file.path);
    if (!structuresOnly) consider(findNearestLivingEnemyHit(from,to,livingEnemies,undefined,enemyPosesRef.current)?.t,'actor');
    return nearest;
  });
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
  const sectorPage = useStableSectorPage(
    entries,
    sectorPageIndex,
    fileObjective?.targets[0]?.path,
    currentDirectory,
    state === 'ready',
  );
  const { blocksByCategory, allBlocks } = useFileBlocks(
    sectorPage.entries,
    campaignField ? null : visibleFileObjective,
    sectorPage.layoutEntries,
    fileObjective,
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

    for (const fightingPosition of getUSFightingPositions(embassyMode?EMBASSY_DEFENSE_OFFSET_Z:0)) {
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
      if(enemy.tunnel)continue;
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
  }, [allBlocks, enemies, embassyMode]);

  useEffect(() => {
    const objectiveId = fileObjective?.id ?? null;
    const previous = missionSnapshotRef.current;
    if (previous.id === objectiveId
      && previous.remaining > 0
      && missionProgress.remaining === 0
      && missionProgress.total > 0) {
      toast.success(isTraining ? 'Training cleanup complete' : 'Optional file cleanup complete', {duration: 2400});
    }
    missionSnapshotRef.current = {
      id: objectiveId,
      remaining: missionProgress.remaining,
    };
  }, [isTraining,fileObjective,missionProgress.remaining,missionProgress.total]);

  useEffect(()=>{
    if(defenseReady && horde.phase==='warning'){
      zombieAmbience.start();
      zombieAmbience.playIntro();
    }
  },[defenseReady,horde.phase,zombieAmbience.start,zombieAmbience.playIntro]);

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
      clearEncounterOrdnance();
      gameAudio.stopAllLoops();
      gameAudio.setBattlefieldActive(true);
      resetFriendlies(EMBASSY_DEFENSE_OFFSET_Z);
      setTankStartPosition([0, 0, -12]);
      setTankIntegrity(100);
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
      setEagleCooldown(0);
      toast(`Nightmare wave ${horde.wave}/${horde.maxWaves} · ${horde.aliveCount} contacts`, {
        duration: 2300,
        icon: '⚠',
      });
    } else if ((horde.phase === 'victory' || horde.phase === 'defeat') && previous.phase !== horde.phase) {
      clearEncounterOrdnance();
      zombieAmbience.stop();
      gameAudio.stopAllLoops();
      fieldRadio.suspend();
      if (horde.phase === 'victory') toast.success(`Nightmare survived · ${horde.totalKills} undead neutralized`, {
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
    zombieAmbience.stop,
  ]);

  useEffect(() => {
    // Reservations keep the page count stable when a hut is destroyed. Clamp
    // only when entering a different directory, not after an ordinary deletion.
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
    // Paging a manifest never moves the vehicle.
    setSectorPageIndex(current => Math.max(
      0,
      Math.min(sectorPage.pageCount - 1, current + direction),
    ));
  }
  const villageObstacles = useMemo(() => allBlocks.map(createVillageObstacle), [allBlocks]);
  const tunnelObstacles=useMemo(()=>[...villageObstacles,
    {position:[landingSite.cx,0,landingSite.z] as [number,number,number],radius:3.6},
    {position:REAR_HUT,radius:2.7},
  ],[villageObstacles,landingSite]);
  const combatObstacles = useMemo(() => embassyMode ? embassyCombatObstacles(horde.archives) : villageObstacles,
    [villageObstacles, embassyMode, horde.archives]);
  useEffect(() => {
    if (!embassyMode) fitVillage(villageObstacles);
  }, [embassyMode, fitVillage, villageObstacles]);

  const labeledArchives = useMemo(()=>horde.archives.map((archive,i)=>({...archive,
    label:defenseFiles[i] ? archive.label+' · '+defenseFiles[i] : archive.label})),[horde.archives,defenseFiles]);

  // Prepare minimap data
  const minimapFileBlocks = useMemo(() => allBlocks.map(block => ({
    position: block.position,
    color: block.color,
    isMarked: markedFiles.has(block.path),
    isObjective: block.isObjective,
  })), [allBlocks, markedFiles]);


  const markedBytes = useMemo(() => entries.reduce(
    (total, entry) => total + (!entry.is_dir && markedFiles.has(entry.path) ? entry.size : 0),
    0,
  ), [entries, markedFiles]);

  if (directDefense && !embassyMode) return null;
  if (state === 'starting') {
    return (
      <div className="container">
        <div className="loading" role="status">Preparing the sector…</div>
      </div>
    );
  }

  if (state === 'scanning') {
    return (
      <div className="container">
        <div className="loading">
          <h2>Preparing the battlefield…</h2>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="scene-container">
      {handoff && <FieldCurtain stage={handoff} onCovered={enterDefenseUnderCover} onRevealed={()=>setHandoff(null)}/>}
      {import.meta.env.DEV && isTraining && horde.phase === 'locked'
        && new URLSearchParams(window.location.search).has('sceneReview') && (
        <button data-game-ui disabled={napalmUntil > 0}
          onPointerDown={event => event.stopPropagation()}
          onPointerUp={event => event.stopPropagation()}
          onClick={() => handleNapalm(new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 0, -1))}
          style={{position:'absolute',left:180,top:56,zIndex:31,fontSize:11,padding:'4px 7px'}}>
          QA: napalm pass
        </button>
      )}
      {import.meta.env.DEV && isTraining
        && new URLSearchParams(window.location.search).has('sceneReview')
        && horde.phase === 'combat' && (
        <div style={{position:'absolute',left:180,top:56,zIndex:31,display:'flex',gap:6}}>
        <button data-game-ui
          title="QA only: clear simulated enemies through normal damage and wave-transition handlers"
          onPointerDown={event => event.stopPropagation()}
          onPointerUp={event => event.stopPropagation()}
          onClick={() => horde.damageZombies(
            horde.livingZombies.map(zombie => zombie.id), 1_000_000, 'cannon',
          )}
          style={{fontSize:11,padding:'4px 7px'}}>
          QA: clear wave {horde.wave}
        </button>
        </div>
      )}
      <GameNotifications achievement={achievementNotice} />

      <HUD
        cleanupDesk={launch.mode==='cleanup'}
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
        napalmUntil={napalmUntil}
        cannonReload={cannonReload}
        machineGunHeat={machineGunHeat}
        tankIntegrity={tankIntegrity} armorPlate={armorPlate}
        hostileCount={(embassyMode ? 0 : fieldOutstanding + Number(campaignField && guardHealth>0)) + horde.aliveCount}
        friendlyCount={friendlyAliveCount + (bossAllies.active ? bossAllies.livingCount : 0)}
        missionTotal={missionProgress.total}
        missionRemaining={missionProgress.remaining}
        campaignBrief={campaignField ? campaignOrder : undefined}
        missionTargetName={missionTarget?.name}
        missionOriginalName={missionTarget?.duplicateOfName}
        damageFlash={damageFlash}
        radioMuted={fieldRadio.muted}
        radioPlaying={fieldRadio.playing}
        radioTrackName={fieldRadio.trackName}
        aircraftRadio={daytimeFlights&&dayRadio?.sector===combatSessionKey&&dayRadio.call?DAY_CALLS[dayRadio.call]:undefined}
        onToggleRadioMute={fieldRadio.toggleMute}
        radioSourceLabel={fieldRadio.sourceLabel}
        bonusPhase={horde.phase}
        liftCall={horde.wave===2?liftCall:null}
        fieldKit={{kit:horde.kit, deadline:horde.intermissionEndsAt, onSpend:horde.spendKit, onProceed:horde.beginNextWave}}
        fieldProtection={horde.protection}
        bonusWave={horde.wave}
        bonusTotalWaves={horde.maxWaves}
        bonusRemaining={horde.aliveCount}
        bonusBreaches={horde.breachCount}
        bonusMaxBreaches={horde.maxBreaches}
        defenseArchives={labeledArchives}
        defenseFailed={horde.defeatReason === 'archives'}
        bonusBossHealth={nightmareBoss?.health}
        bonusBossMaxHealth={nightmareBoss?.maxHealth}
        onRetryBonus={handleRetryZombieDefense}
        onExitSession={changeDirectory}
        eagleUntil={eagleUntil}
        eagleActive={eagleBusy}
        eagleTargeting={eagleTargeting}
        onCallEagle={handleCallEagle}
        bossAllies={bossAllies.allies}
        bossAlliesVisible={finalBossEncounterActive && !nightmareTakeover}
      />

      {nightmareTakeover && defenseReady && (
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
        fileBlocks={embassyMode ? horde.archives.map(archive => ({position: archive.position,
          color: archive.health > 0 ? '#bcd799' : '#a35342', isObjective: archive.health>0,
          underAttackUntil: archive.underAttackUntil})) : minimapFileBlocks}
        folderPortals={NO_PORTALS}
        campaignRadar={campaignField}
        enemyPosesRef={enemyPosesRef}
        tunnelFix={campaignField?tunnelCue?.site:undefined}
        radioFix={campaignField && !ruins.radioHut && !standingHuts}
        backPortalPosition={null}
        enemies={embassyMode ? [] : livingEnemies}
        friendlies={livingFriendlies}
        zombiePosesRef={horde.posesRef}
      />

      <div className="header" data-game-ui>
        <div className="header-left">
          <button
            onClick={changeDirectory}
            className="btn-back"
            title={embassyMode ? 'Exit defense' : isTraining ? 'Exit training' : 'Exit campaign'}
          >
            ◂
          </button>
          <h2>{embassyMode ? 'Saigon // Embassy defense · fictional nightmare'
            : launch.mode === 'training' && launch.preview === 'river' ? 'Ghost Signal // River crossing'
            : launch.mode==='cleanup'?'Cleanup Desk':isTraining ? 'Boot Camp' : 'Ghost Signal // Village clearing'}</h2>
          <span className="training-badge">{launch.mode==='cleanup'?(launch.source==='sample'?'Rehearsal':'Real file shortlist'):'Simulation'}</span>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary rear-view-button" aria-pressed={rearView}
            aria-keyshortcuts="V" title="Toggle rear view (V)" disabled={drivingDisabled}
            onClick={() => setRearView(active => !active)}>Rear view · V</button>
          {!embassyMode&&!isTraining&&<button type="button" className="btn-secondary" aria-expanded={driveOpen}
            onClick={()=>setDriveOpen(open=>!open)}>Field files</button>}
          {!embassyMode && sectorPage.pageCount > 1 && (
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
          <button onClick={changeDirectory} className="btn-secondary" data-session-exit>
            {launch.mode==='cleanup'?`Review shortlist (${markedCount})`:embassyMode ? 'Exit Defense' : isTraining ? 'Exit Training' : 'Exit Campaign'}
          </button>
        </div>
      </div>

      {driveOpen&&campaignField&&<VirtualDrivePanel entries={entries} marked={markedFiles} removing={deletingFiles}
        trashed={deletedCount} objectives={missionProgress.remainingPaths} close={()=>setDriveOpen(false)} undo={handleUndoLastTrash}/>} 
      <KeyboardControls map={CONTROLS_MAP}>
        <Scene onReady={fieldPresented}
          effectsKey={`${combatSessionKey}:${embassyMode}:${defenseAttempt}`}
          environmentSeed={environmentSeed}
          tankRef={tankRef}
          nightmareActive={embassyMode}
          campaignClearing={daytimeFlights} rearOutpost={campaignField} landingDestroyed={ruins.landing}
          brightness={settings.brightness}
        >
          <Tank
            key={`${combatSessionKey}:${embassyMode}:${defenseAttempt}`}
            ref={tankRef}
            initialPosition={spawnPosition}
            impactFeed={tankImpactFeed}
            initialHeading={embassyMode ? (previewDefense ? GHOST_EMBASSY_YAW : EMBASSY_GUARD_YAW) : tankStartPosition===GHOST_RIVER_START ? GHOST_RIVER_YAW : undefined}
            tankStateRef={tankStateRef}
            weaponMode={weaponMode}
            onShoot={stableHandleShoot}
            onMachineGun={stableHandleMachineGun}
            onFlamethrower={stableHandleFlamethrower}
            onFlameFuelChange={setFlameFuel}
            onNapalm={stableHandleNapalm}
            eagleTargeting={eagleTargeting}
            onEagleTarget={stableHandleEagleTarget}
            onMachineGunAudioChange={gameAudio.setMachineGunActive}
            onCannonReloadChange={setCannonReload}
            onMachineGunHeatChange={setMachineGunHeat}
            onFlamethrowerAudioChange={gameAudio.setFlamethrowerActive}
            onMovementAudioChange={gameAudio.setMovementActive}
            environmentSeed={environmentSeed}
            colliders={tankColliders}
            fieldSurface={fieldSurface}
            blockRearStronghold={campaignField} rearGuardPoseRef={rearGuardPoseRef} rearHutDestroyed={ruins.radioHut}
            disabled={drivingDisabled}
          />
          {(campaignField || embassyMode) && <FieldPickups key={'supplies:'+combatSessionKey+':'+embassyMode+':'+defenseAttempt}
            mode={embassyMode?'embassy':'village'} kills={embassyMode?horde.totalKills:enemies.reduce((n,e)=>n+Number(!e.alive),0)}
            tankRef={tankRef} running={state==='ready' && tankIntegrity>0 && !settingsOpen && !driveOpen && (!embassyMode||horde.phase==='combat')} onCollect={takeSupply}/>}
          <TankTreadImprints tankRef={tankRef} river={navigationRiver} seed={environmentSeed}
            embassy={embassyMode} resetPosition={spawnPosition} />
          <TankWaterEffects night={embassyMode}
            tankRef={tankRef}
            resetPosition={spawnPosition}
            seed={environmentSeed}
            onRiverStateChange={gameAudio.setRiverState}
          />
          <CameraRig
            rearView={rearView}
            tankRef={tankRef}
            embassy={embassyMode}
            napalmCinematic={napalmStrikes.length > 0 && napalmCamera}
          />

          {daytimeFlights && <CampaignFlights key={`kestrel:${combatSessionKey}`}
            contacts={{actors:enemies,poses:enemyPosesRef}}
            running={!settingsOpen&&!driveOpen&&tankIntegrity>0} deploy={deployCampaignPassenger} onCall={reportDayCall} roster={friendlies}/>}
          {embassyMode && horde.phase!=='victory' && horde.phase!=='defeat' && <EmbassyLift
            contacts={{actors:horde.zombies,poses:horde.posesRef}}
            key={`rook:${combatSessionKey}:${defenseAttempt}`} wave={horde.wave}
            running={!nightmareTakeover} deploy={deployPassenger} onCall={setLiftCall} roster={friendlies}/>}
          {campaignField&&currentDirectory===CAMPAIGN_ROOT&&<FieldReliefFlight key={`relief:${combatSessionKey}`}
            running={!settingsOpen&&!driveOpen&&tankIntegrity>0} tank={tankRef} friendlies={friendliesRef} poses={friendlyPosesRef}
            contacts={{actors:enemies,poses:enemyPosesRef}} deploy={ticket=>admitPassenger(reliefPassenger(ticket))}
            river={navigationRiver} obstacles={tunnelObstacles} ground={fieldFloor.height}/>}
          <FieldBlood key={`blood:${combatSessionKey}:${embassyMode}:${defenseAttempt}`} ground={fieldFloor.height}/>
          {!embassyMode&&<TankInfantryContact key={`overrun:${combatSessionKey}`} tankRef={tankRef} poses={enemyPosesRef} enemies={enemiesRef}
            running={!settingsOpen&&!driveOpen&&tankIntegrity>0} crush={id=>!!killEnemy(id,'runover')?.killed}/>}
          <USInfantrySquad
            navigationRiver={navigationRiver}
            riverFlank={embassyMode?undefined:riverFlank}
            key={`${combatSessionKey}:${embassyMode ? 'embassy' : 'village'}:${defenseAttempt}`}
            defenseOffsetZ={embassyMode ? EMBASSY_DEFENSE_OFFSET_Z : 0}
            enemies={embassyMode ? [] : enemies}
            enemyPosesRef={enemyPosesRef}
            zombies={horde.zombies}
            zombiePosesRef={horde.posesRef}
            friendlies={friendlies}
            friendlyPosesRef={friendlyPosesRef}
            obstacles={combatObstacles}
            enabled={(hostileCount > 0 || horde.phase === 'combat')
              && horde.phase !== 'defeat'
              && friendlyAliveCount > 0}
            onCoverHit={showRifleCoverHit}
            onEnemyHit={({ enemyId, damage, position }) => applyEnemyDamage(enemyId, damage, 'friendly-rifle',position)}
            onZombieHit={handleFriendlyZombieHit}
            onFriendlyFire={gameAudio.playFriendlyRifle}
          />

          {campaignField && <CampaignTunnels running={!settingsOpen&&!driveOpen&&tankIntegrity>0}
            tankRef={tankRef} obstacles={tunnelObstacles} river={navigationRiver} cue={tunnelCue} advance={advanceTunnels}/>}
          {!embassyMode && <VietCongCombatants burns={characterBurns} fieldAdvance={campaignField}
            navigationRiver={navigationRiver}
            enemies={enemies}
            enemyPosesRef={enemyPosesRef}
            friendliesRef={friendliesRef}
            friendlyPosesRef={friendlyPosesRef}
            tankRef={tankRef}
            obstacles={campaignField?tunnelObstacles:combatObstacles}
            enabled={!embassyMode
              && hostileCount > 0
              && (tankIntegrity > 0 || friendlyAliveCount > 0)}
            tankTargetEnabled={tankIntegrity > 0}
            onCoverHit={showRifleCoverHit}
            onTankHit={event => handleTankHit(event.damage,event.position,true)}
            onFriendlyHit={event => handleFriendlyInfantryHit(event.friendlyId, event.damage,event.position)}
            onEnemyFire={gameAudio.playEnemyRifle}
          />}

          <ZombieHorde burns={characterBurns}
            ground={hordeGround}
            archives={horde.archives}
            onArchiveHit={horde.damageArchive}
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

          <FinalBossAllies onCoverHit={showRifleCoverHit}
            allies={bossAllies.allies}
            posesRef={bossAllies.posesRef}
            zombies={horde.zombies}
            zombiePosesRef={horde.posesRef}
            obstacles={combatObstacles}
            enabled={finalBossEncounterActive && !nightmareTakeover}
            prepareSummoning={horde.wave === horde.maxWaves - 1 || horde.wave === horde.maxWaves}
            onZombieHit={handleFriendlyZombieHit}
            onFire={event => {
              if (event.weapon !== 'cavalry-saber') gameAudio.playFriendlyRifle(event);
            }}
          />

          {campaignField && <RearFieldEncounter hp={guardHealth} ready={false} rearGuardPoseRef={rearGuardPoseRef} hutDestroyed={ruins.radioHut}
            navigationRiver={navigationRiver} landing={ruins.landing?undefined:landingSite}
            running={!settingsOpen&&!driveOpen&&tankIntegrity>0} tankRef={tankRef} obstacles={villageObstacles}
            onSpotted={spotRearGuard} onTankHit={stableRearAttack}/>} 

          <InfantryContactArt feed={infantryContacts}/>
          {embassyMode && <UndeadDeathMarks feed={deathMarks} />}
          <CharacterFires burns={characterBurns} capacity={embassyMode?horde.zombies.length:enemies.length}/>
          <BuildingFires key={`burn:${combatSessionKey}:${embassyMode}:${defenseAttempt}`} fires={burning}
            blocks={allBlocks} ruins={ruins} fileMeshes={fileBlockRefsRef} />
          <ProjectileManager
            fileMeshRefs={fileBlockRefsRef}
            fieldImpactArt={launch.mode !== 'cleanup'}
            showPracticeShields={!embassyMode && launch.mode === 'training' && !launch.preview}
            rearGuardAlive={campaignField ? guardHealth>0 : undefined}
            onRearGuardHit={handleRearHit} rearGuardPoseRef={rearGuardPoseRef} rearHutDestroyed={ruins.radioHut}
            onRearHutHit={onRearHutHit} allHutsHaveSurface={launch.mode !== 'cleanup'}
            sceneryContact={!embassyMode && !ruins.landing && launch.mode!=='cleanup' ? landingContact : undefined}
            onSceneryHit={onLandingHit}
            onGroundBurst={launch.mode!=='cleanup'?showGroundBurst:undefined}
            pool={pool}
            despawn={despawn}
            onHit={handleProjectileCollision}
            onEnemyHit={handleEnemyProjectileHit}
            onZombieHit={handleZombieProjectileHit}
            allBlocks={embassyMode ? [] : allBlocks}
            enemies={embassyMode ? [] : livingEnemies}
            enemyPosesRef={enemyPosesRef}
            zombies={horde.zombies}
            zombiePosesRef={horde.posesRef}
          />

          <ExplosionParticles explosions={explosions} onExplosionComplete={despawnExplosion} />

          <OrdnanceEffects
            napalmStrikes={napalmStrikes}
            onNapalmImpact={handleNapalmImpact}
            onNapalmBurnTick={handleNapalmBurnTick}
            onNapalmComplete={handleNapalmComplete}
          />

          {eagleStrikes.length > 0 && (
            <BaldEagleSupport
              strikes={eagleStrikes}
              onImpact={handleEagleImpact}
              onComplete={handleEagleComplete}
              onAudioCue={handleEagleAudioCue}
            />
          )}

          {embassyMode ? <EmbassyDefense archives={horde.archives} /> : <FileBlocks
            blocks={blocksByCategory} allHutsHaveSurface={launch.mode !== 'cleanup'}
            onHover={NOOP_HOVER}
            onMeshRefsReady={stableHandleMeshRefsReady}
            markedFiles={markedFiles}
            deletingFiles={deletingFiles}
            onDeletionComplete={stableHandleDeletionComplete}
            restoreDeadlines={restoreDeadlines}
          />}

          {launch.mode==='cleanup'&&allBlocks.map(block=>{
            const number=launch.fieldFiles.findIndex(f=>f.path===block.path)+1;
            return <Html key={block.path} center zIndexRange={[32,16]} pointerEvents="none" style={{pointerEvents:'none'}}
              position={[block.position[0],block.position[1]+1.35*block.scale,block.position[2]]}>
              <span aria-hidden="true" className={'cleanup-beacon'+(block.path==='pick:'+identifiedCleanupId?' is-found':'')+(markedFiles.has(block.path)?' is-marked':'')}>
                {String(number).padStart(2,'0')}{markedFiles.has(block.path)?' ✓':''}
              </span></Html>;
          })}

          <Particles />
        </Scene>
      </KeyboardControls>
    </div>
  );
}

export default GameSession;
