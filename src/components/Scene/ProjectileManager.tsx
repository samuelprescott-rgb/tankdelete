import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeGhostRoundGeo } from './ghostRoundArt';
import { Projectile } from '../../hooks/useProjectilePool';
import { PROJECTILE_MAX_LIFETIME, PROJECTILE_SPEED } from '../../lib/constants';
import { BlockData } from '../../hooks/useFileBlocks';
import { inGhostRiverHutPlot } from '../../lib/ghostSignal';
import { createGhostHutProbe, type GhostContact } from './ghostHutSurface';
import { RoundTracers, useRoundTracers } from './RoundTracers';
import { firstRearContact,type RearGuardPose } from '../../lib/rearStronghold';
import { advanceCrawler, firstFieldContact, firstCrawlerContact, newCrawlerState,
  signalCrawler, shellSag, type ArcadePulse } from '../../lib/arcadeShell';
import { CannonContactArt, type CannonContact } from './CannonContactArt';
import { ArcadeRangeGlyphs } from './ArcadeRangeGlyphs';
import {
  EnemyCombatant,
  type EnemyCombatPose,
  ENEMY_HIT_RADIUS,
  findNearestLivingEnemyHit,
  segmentSphereIntersection,
} from '../../lib/combat';
import {
  findNearestLivingZombieHit,
  type ZombieCombatant,
  type ZombieCombatPose,
  ZOMBIE_HIT_RADIUS,
} from '../../lib/zombieEpilogue';

import { createWeaponSurfaceProbe } from './weaponSurfaces';
import { MACHINE_GUN_RANGE } from '../../lib/weapons';

const MAX_PROJECTILES = 48;
const HIT_RADIUS = 1.5;
const MACHINE_GUN_SPEED = PROJECTILE_SPEED * 1.65;

interface ProjectileManagerProps {
  pool: React.RefObject<Projectile[]>;
  despawn: (index: number) => void;
  onHit: (filePath: string, projectile: Projectile, contact?: GhostContact) => void;
  onEnemyHit: (enemyId: string, projectile: Projectile) => void;
  /** Omit outside the campaign. A defeated guard remains physical cover. */
  rearGuardAlive?: boolean;
  rearGuardPoseRef?:React.RefObject<RearGuardPose>;
  rearHutDestroyed?:boolean;
  onRearHutHit?:(projectile:Projectile)=>void;
  sceneryContact?:(from:THREE.Vector3,to:THREE.Vector3)=>number|null;
  onSceneryHit?:(projectile:Projectile)=>void;
  onGroundBurst?:(position:THREE.Vector3)=>void;
  onRearGuardHit?: (projectile: Projectile) => void;
  onZombieHit?: (
    zombieId: string,
    projectile: Projectile,
    hitPoint: THREE.Vector3,
  ) => void;
  allBlocks: BlockData[];
  fileMeshRefs?: React.RefObject<React.RefObject<THREE.InstancedMesh | null>[]>;
  allHutsHaveSurface?:boolean;
  enemies: readonly EnemyCombatant[];
  enemyPosesRef?: React.RefObject<Map<string, EnemyCombatPose>>;
  zombies?: readonly ZombieCombatant[];
  zombiePosesRef?: React.RefObject<Map<string, ZombieCombatPose>>;
  fieldImpactArt?: boolean;
  showPracticeShields?: boolean;
}

export function ProjectileManager({
  pool,
  despawn,
  onHit,
  onEnemyHit,
  rearGuardAlive,
  rearGuardPoseRef,rearHutDestroyed=false,onRearHutHit,sceneryContact,onSceneryHit,onGroundBurst,
  onRearGuardHit,
  onZombieHit,
  allBlocks,
  fileMeshRefs,
  allHutsHaveSurface=false,
  enemies,
  enemyPosesRef,
  zombies = [],
  zombiePosesRef,
  fieldImpactArt = false,
  showPracticeShields = false,
}: ProjectileManagerProps) {
  const tracers = useRoundTracers(true);
  const probeHut = useMemo(createGhostHutProbe, []);
  const coarseFiles = useMemo(() => fileMeshRefs
    ? allHutsHaveSurface ? [] : allBlocks.filter(block => !inGhostRiverHutPlot(block.position[0], block.position[2]))
    : allBlocks, [allBlocks, fileMeshRefs, allHutsHaveSurface]);
  const exactFiles = useMemo(() => new Map(allBlocks
    .filter(block => allHutsHaveSurface || inGhostRiverHutPlot(block.position[0], block.position[2]))
    .map(block => [block.path, block])), [allBlocks, allHutsHaveSurface]);
  const pulseRef=useRef<THREE.InstancedMesh>(null);
  const crawler=useMemo(newCrawlerState,[]);
  const cargoSkin=useRef<THREE.Mesh>(null);
  const probeField = useMemo(createWeaponSurfaceProbe, []);
  const pulses=useMemo(()=>Array.from({length:12},()=>({age:1,kind:'ground' as ArcadePulse,art:null as CannonContact|null,small:false,
    origin:new THREE.Vector3(),direction:new THREE.Vector3()})),[]);
  const nextPulse=useRef(0);
  const tangent=useMemo(()=>new THREE.Vector3(),[]);
  const pulseColors=useMemo(()=>({ground:new THREE.Color('#ffb44e'),pass:new THREE.Color('#76f3d2'),
    bend:new THREE.Color('#f2b3ff')}),[]);

  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const previousPosition = useMemo(() => new THREE.Vector3(), []);
  const instanceTransform = useMemo(() => new THREE.Object3D(), []);
  const impactChip = useMemo(() => makeGhostRoundGeo('chip'), []);
  useLayoutEffect(() => () => impactChip.dispose(), [impactChip]);
  const cannonColor = useMemo(() => new THREE.Color('#ffffff'), []);
  useLayoutEffect(()=>{
    Object.assign(crawler,newCrawlerState());for(const pulse of pulses)pulse.age=1;
  },[showPracticeShields,crawler,pulses]);

  useLayoutEffect(() => {
    const mesh = pulseRef.current;
    if (mesh) {
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }, []);

  useFrame((_state, delta) => {
    if (!pool.current) return;

    let instanceCount = 0;

    const elapsed=Number.isFinite(delta)?Math.max(0,delta):0;
    if(showPracticeShields && elapsed<=.33)advanceCrawler(crawler,elapsed);
    for(const pulse of pulses)pulse.age+=elapsed;
    shot: for (let i = 0; i < pool.current.length; i++) {
      const projectile = pool.current[i];
      if (!projectile.active) continue;
      // A backgrounded or suspended tab must not replay a long, unseen sweep
      // into a file when the player returns.
      if(elapsed>.33){despawn(i);continue;}

      const speed = projectile.kind === 'machinegun' ? MACHINE_GUN_SPEED : PROJECTILE_SPEED;
      const lifetimeLimit = projectile.kind === 'machinegun' ? MACHINE_GUN_RANGE / speed : PROJECTILE_MAX_LIFETIME;
      let remaining=Math.min(elapsed,lifetimeLimit-projectile.lifetime);
      tangent.copy(projectile.direction);
      // Subdivide the animated cannon curve. Swept contact ordering remains
      // shared by files, actors, the field and the optional virtual range.
      while(remaining>1e-9) {
        const step=projectile.kind==='machinegun'?remaining:Math.min(remaining,1/60);
        remaining-=step;
        previousPosition.copy(projectile.position);
        projectile.position.addScaledVector(projectile.direction, speed * step);
        if(projectile.kind==='cannon')
          projectile.position.y-=shellSag(projectile.lifetime+step)-shellSag(projectile.lifetime);
        projectile.lifetime+=step;
        tangent.subVectors(projectile.position,previousPosition).normalize();

        let hitBlock: BlockData | null = null;
        let hitEnemyId: string | null = null;
        let hitZombieId: string | null = null;
        let nearestHitT = Infinity;

        const contact=fileMeshRefs && exactFiles.size ? probeHut(fileMeshRefs.current,previousPosition,projectile.position) : null;
        if(contact) {
          hitBlock=exactFiles.get(contact.path) ?? null;
          if(hitBlock) nearestHitT=contact.t;
        }
        for (const block of coarseFiles) {
          tempPosition.set(...block.position);
          const hitT = segmentSphereIntersection(
            previousPosition,
            projectile.position,
            tempPosition,
            HIT_RADIUS,
          );
          if (hitT !== null && hitT < nearestHitT) {
            nearestHitT = hitT;
            hitBlock = block;
            hitEnemyId = null;
            hitZombieId = null;
          }
        }

        const enemyHit = findNearestLivingEnemyHit(
          previousPosition,
          projectile.position,
          enemies,
          projectile.kind === 'machinegun' ? ENEMY_HIT_RADIUS * 1.18 : ENEMY_HIT_RADIUS,
          enemyPosesRef?.current,
        );
        if (enemyHit && enemyHit.t < nearestHitT) {
          nearestHitT = enemyHit.t;
          hitEnemyId = enemyHit.enemy.id;
          hitBlock = null;
          hitZombieId = null;
        }

        const zombieHit = zombiePosesRef?.current
          ? findNearestLivingZombieHit(
            previousPosition,
            projectile.position,
            zombies,
            zombiePosesRef.current,
            projectile.kind === 'machinegun' ? ZOMBIE_HIT_RADIUS * 1.16 : ZOMBIE_HIT_RADIUS,
          )
          : null;
        if (zombieHit && zombieHit.t < nearestHitT) {
          nearestHitT = zombieHit.t;
          hitZombieId = zombieHit.zombie.id;
          hitEnemyId = null;
          hitBlock = null;
        }

        const rear = rearGuardAlive === undefined ? null : firstRearContact(previousPosition,projectile.position,rearGuardPoseRef?.current,rearHutDestroyed,!rearGuardAlive);
        const hitRear = rear !== null && rear.t < nearestHitT;
        if (hitRear) nearestHitT = rear.t;
        const scenic=sceneryContact?.(previousPosition,projectile.position);
        const hitScenery=scenic!=null && scenic>=0 && scenic<=1 && scenic<nearestHitT;
        if(hitScenery)nearestHitT=scenic;

        const surface = fieldImpactArt ? probeField(_state.scene, previousPosition, projectile.position) : null;
        const field = fieldImpactArt ? surface?.t ?? null : firstFieldContact(previousPosition,projectile.position);
        const glyph=showPracticeShields ? firstCrawlerContact(previousPosition,projectile.position,crawler,cargoSkin.current) : null;
        // A crawler or soil contact ends the live shot. The short colored echo
        // created below has NO collision, damage, file path, or gameplay callback.
        if((field!==null && field<=nearestHitT) || (glyph && glyph.t<=nearestHitT)) {
          const screen=glyph && (field===null || glyph.t<field);
          const t=screen ? glyph.t : field!;
          const pulse=pulses[nextPulse.current++%pulses.length];
          pulse.age=0;pulse.kind=screen?signalCrawler(crawler,glyph.bay,glyph.inward):'ground';
          pulse.origin.copy(previousPosition).lerp(projectile.position,t);
          pulse.direction.copy(tangent);
          pulse.art = null;
          pulse.small = projectile.kind === 'machinegun';
          if (fieldImpactArt) {
            if (screen) pulse.art = 'metal';
            else if (surface?.kind !== 'wood') pulse.art = surface?.kind === 'water' ? 'water' : 'soil';
          } else if (!screen && !pulse.small) onGroundBurst?.(pulse.origin);
          if(screen) {
            if(pulse.kind==='bend')pulse.direction.reflect(glyph.normal);
            crawler.contact.copy(glyph.point);crawler.into.copy(pulse.direction);crawler.outcome=pulse.kind;
          }
          despawn(i);continue shot;
        }
        if(Number.isFinite(nearestHitT)) projectile.position.lerp(previousPosition,1-nearestHitT);
        if(hitScenery){despawn(i);onSceneryHit?.(projectile);continue shot;}
        if (hitRear) {
          // Hut and wreck are occluders, never files. The still-live guardian
          // receives one impact at the clipped contact, only after retirement.
          despawn(i);
          if (fieldImpactArt && rear.kind === 'guard') {
            const pulse = pulses[nextPulse.current++ % pulses.length];
            pulse.age = 0;
            pulse.kind = 'ground';
            pulse.art = 'metal';
            pulse.small = projectile.kind === 'machinegun';
            pulse.origin.copy(projectile.position);
          }
          if (rear.kind === 'guard' && rearGuardAlive) onRearGuardHit?.(projectile);
          if (rear.kind === 'hut' && !rearHutDestroyed) onRearHutHit?.(projectile);
          continue shot;
        }
        if (hitZombieId) {
          despawn(i);
          onZombieHit?.(hitZombieId, projectile, zombieHit?.point.clone() ?? projectile.position.clone());
          continue shot;
        }

        if (hitEnemyId) {
          despawn(i);
          onEnemyHit(hitEnemyId, projectile);
          continue shot;
        }

        if (hitBlock) {
          // Retire before invoking any external mark/confirm handler, including
          // one that fails or synchronously transitions the current sector.
          despawn(i);
          onHit(hitBlock.path, projectile, contact?.path===hitBlock.path ? contact : undefined);
          continue shot;
        }
      }
      if(projectile.lifetime>=lifetimeLimit-1e-8){despawn(i);continue;}

      if (instanceCount < MAX_PROJECTILES) {
        tracers.write(instanceCount++, projectile.position, tangent, projectile.lifetime * speed, projectile.kind === 'machinegun');
      }
    }
    const fx=pulseRef.current;
    if(fx) {
      let count=0;
      for(const pulse of pulses) {
        const t=pulse.age/.44;
        if(t>=1 || (pulse.art && pulse.kind==='ground'))continue;
        const ground=pulse.kind==='ground', bend=pulse.kind==='bend';
        for(let j=0;j<5;j++) {
          const a=j*Math.PI*2/5, fade=Math.max(.014,1-t);
          instanceTransform.position.copy(pulse.origin);
          instanceTransform.quaternion.identity();
          if(ground) {
            instanceTransform.position.x+=Math.cos(a)*(.045+t*.37);
            instanceTransform.position.z+=Math.sin(a)*(.045+t*.37);
            instanceTransform.position.y+=.045+.28*Math.sin(t*Math.PI);
            instanceTransform.rotation.set(Math.sin(a)*.87,a*.5,-Math.cos(a)*.87);
            instanceTransform.scale.set((.07+.10*t)*fade,(.17+.16*t)*fade,(.09+.08*t)*fade);
          } else {
            // A lit cell throws an inert colored arc; an exhausted cell
            // plays the forward power-off streak. Neither has collision.
            const q=Math.max(0,t*1.22-j*.085);
            instanceTransform.position.addScaledVector(pulse.direction,Math.min(1,q)*(bend?1.56:.39));
            const s=(.128-j*.011)*fade;
            instanceTransform.scale.set(s,bend?s:s*.76,s);
          }
          instanceTransform.updateMatrix();fx.setMatrixAt(count,instanceTransform.matrix);
          fx.setColorAt(count++,ground && j%2===0 ? cannonColor : pulseColors[pulse.kind]);
        }
      }
      fx.count=count;
      if(count){fx.instanceMatrix.needsUpdate=true;if(fx.instanceColor)fx.instanceColor.needsUpdate=true;}
    }

    tracers.submit(instanceCount);
  });

  return (
    <>
      {fieldImpactArt && <CannonContactArt pulses={pulses} />}
      {showPracticeShields&&<ArcadeRangeGlyphs state={crawler} skinRef={cargoSkin}/>}
      <instancedMesh name="arcade-contact-echoes" ref={pulseRef} args={[undefined,undefined,60]}
        frustumCulled={false} renderOrder={79}>
        <primitive object={impactChip} attach="geometry"/>
        <meshBasicMaterial color="white" vertexColors toneMapped={false} depthTest depthWrite={false}/>
      </instancedMesh>
      <RoundTracers batch={tracers} capacity={MAX_PROJECTILES} />
    </>
  );
}
