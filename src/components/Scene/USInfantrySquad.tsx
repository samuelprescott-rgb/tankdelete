import {beginInfantryFall,poseHordeDefenderFall,poseInfantryFall} from './infantryFall';
import {useEjectBrass} from './SpentBrass';
import {makeSmgFlash} from './ghostRoundArt';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundTracers, useRoundTracers } from './RoundTracers';
import * as THREE from 'three';
import { createGhostInfantryMaterial } from './ghostInfantrySurface';
import { LIFT_DOOR, LIFT_STEP, LIFT_FOOTDOWN, liftBootHeight, liftStepTravel, dismountBeat, LIFT_TEAM } from '../../lib/embassyLift';
import { DAY_CREW, DAY_DOOR, DAY_STEP } from '../../lib/campaignFlights';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chooseVillageWaypoint, safeVillageLeg, villageBlocksRifle, villageBlocksSight } from '../../lib/villageCover';
import {footLaneClear,footLegDuration,patrolWaypoint,turnFootActor,type FootprintLine} from '../../lib/infantryPatrol';
import {fieldBagFootprints,fieldKitPlacement,fieldSupplyFootprints,KIT_BOX} from '../../lib/fieldSupplyFootprint';
import {InfantryInsignia} from './InfantryInsignia';
import type { RiverStation } from './riverLayout';
import { createInfantryGeometry, createCanvasSandbagGeometry, createCanvasSandbagMaterial, createInfantryRig, bindInfantryRig, releaseInfantryRig, updateInfantryRig, applyInfantryWeaponPose, type InfantryRig, INFANTRY_MATERIAL } from './infantryGeometry';
import { INFANTRY_WORLD_SCALE, infantryAimHeight, infantryRifleHeight, infantryRifleBind } from '../../lib/infantryMetrics';
import {
  CombatObstacle,
  EnemyCombatant,
  EnemyCombatPose,
  enemyWorldPosition,
  findNearestLivingEnemyHit,
  findNearestObstacleHit,
  FriendlyCombatant,
  FriendlyCombatPose,
  FriendlyEnemyHitEvent,
  FriendlyFireEvent,
  hashCombatSession,
  terrainBlocksCombatSegment,
  firstTerrainCombatHit,
  US_FIGHTING_POSITIONS,
  US_INFANTRY_DEPLOYMENT,
  US_FORWARD_POST,
  getUSForwardPost,
  getUSMemberPost,
  getUSFightingPositions,
} from '../../lib/combat';
import {RIVER_FLANK_ID,type RiverFlankPost} from '../../lib/riverFlankPost';
import {
  findNearestLivingZombieHit,
  type FriendlyZombieHitEvent,
  type ZombieCombatant,
  type ZombieCombatPose,
  ZOMBIE_MAX_ACTIVE,
} from '../../lib/zombieEpilogue';

const FRIENDLY_PROJECTILE_CAPACITY = 40;
const FRIENDLY_RIFLE_SPEED = 31;
const FRIENDLY_RIFLE_LIFETIME = 2.7;
// The squad sustains the firefight without clearing the whole encounter before
// the player can engage; concentrated rifle fire still finishes exposed targets.
const FRIENDLY_RIFLE_DAMAGE = 3;
const FRIENDLY_ZOMBIE_RIFLE_DAMAGE = 4;
const FRIENDLY_MAX_RANGE = 58;
const SOLDIER_SCALE = INFANTRY_WORLD_SCALE;
const TARGET_DECISION_INTERVAL = 1 / 12;

interface FriendlyProjectile {
  active: boolean;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  direction: THREE.Vector3;
  lifetime: number;
  soldierId: string;
}

interface SquadMember {
  id: string;
  position: [number, number, number];
  alternatePosition?: [number, number, number];
  kneeling: boolean;
  radioOperator: boolean;
  fireInterval: number;
  initialDelay: number;
  accuracy: number;
  burstSize: number;
  riverFlank?:RiverFlankPost;
  /** Door sill and shared body geometry for the finite, one-way relief flight. */
  arrival?: {body:number;coverId?:string;runSpeed?:number;post:readonly [number,number,number];step:readonly [number,number,number]};
}

interface SoldierRuntime {
  lastHealth:number;
  contact:DefenderContact|null;
  aimPitch: number;
  nextShotAt: number;
  shotIndex: number;
  flashUntil: number;
  recoilUntil: number;
  burstRemaining: number;
  baseX: number;
  baseZ: number;
  moveFromX: number;
  moveFromZ: number;
  moveToX: number;
  moveToZ: number;
  moveStartedAt: number;
  moveEndsAt: number;
  moving: boolean;
  disembarking: boolean;
  patrolLeg:number;
  nextPatrolAt:number;
  routeObstacles:readonly CombatObstacle[];
  atGuardAlternate:boolean;
  wasAlive: boolean;
  fall: ReturnType<typeof beginInfantryFall>|null;
  preferredTargetId: string | null;
  selectedTargetId: string | null;
  nextTargetAcquisitionAt: number;
  nextLineOfSightDecisionAt: number;
  nextDetourAt: number;
}

interface DefenderContact {
  sequence:number; startedAt:number; fromHealth:number; toHealth:number;
  attackerId:string|null; awayX:number; awayZ:number; strength:number; weight:number;
}
const CONTACT_SETTLE=.64;
function defenderContact(previous:DefenderContact|null,fromHealth:number,toHealth:number,now:number,soldier:THREE.Group,
  memberId:string,poses:ReadonlyMap<string,ZombieCombatPose>|undefined):DefenderContact {
  // Only a committed swing on THIS defender supplies a directional melee
  // contact. A nearby bystander or an arm still winding up is not a hitter.
  const yaw=soldier.rotation.y;
  let awayX=Math.sin(yaw),awayZ=Math.cos(yaw),attackerId:string|null=null,nearest=3.0**2;
  if(poses)for(const [id,p] of poses){
    if(!p.active||p.pursuingSoldier!==memberId||p.soldierSwing!=='strike')continue;
    const dx=soldier.position.x-p.position.x,dz=soldier.position.z-p.position.z,d=dx*dx+dz*dz;
    if(d<=.0001||d>=nearest)continue;
    nearest=d;attackerId=id;const inv=1/Math.sqrt(d);awayX=dx*inv;awayZ=dz*inv;
  }
  return {sequence:(previous?.sequence??0)+1,startedAt:now,fromHealth,toHealth,attackerId,awayX,awayZ,
    strength:Math.min(1,.30+.70*(fromHealth-toHealth)/40),weight:0};
}
function applyDefenderContact(rig:InfantryRig,hit:DefenderContact,yaw:number,now:number){
  // Fast take, a readable braced frame, then a longer ease into the guard.
  // updateInfantryRig restores the bind pose each tick, so none of these
  // secondary rotations accumulate. Hips, boots and the world pose stay put.
  const age=now-hit.startedAt;
  if(age>=CONTACT_SETTLE){hit.weight=0;return;}
  const pulse=age<.096?.30+.70*THREE.MathUtils.smoothstep(age,0,.096):
    1-THREE.MathUtils.smoothstep(age,.15,CONTACT_SETTLE);
  const k=hit.weight=pulse*hit.strength;
  const c=Math.cos(yaw),s=Math.sin(yaw),x=c*hit.awayX-s*hit.awayZ,z=s*hit.awayX+c*hit.awayZ;
  rig.spine.position.x+=.17*x*k;rig.spine.position.y-=.112*k;rig.spine.position.z+=.16*z*k;
  rig.spine.rotation.x+=.50*z*k;rig.spine.rotation.z-=.51*x*k;
  rig.spine.rotation.y+=.095*(x<0?-1:1)*k;
  // Chin tucks and the helmet lags the struck shoulder instead of rotating
  // the entire model like a hinged target.
  rig.head.rotation.x+=(-.14+.12*z)*k;rig.head.rotation.z-=.15*x*k;
}

function startFriendlyLeg(runtime:SoldierRuntime,x:number,z:number,now:number){
  runtime.moveFromX=runtime.baseX; runtime.moveFromZ=runtime.baseZ;
  runtime.moveToX=x;runtime.moveToZ=z;runtime.moveStartedAt=now;
  runtime.moveEndsAt=now+footLegDuration(runtime.baseX,runtime.baseZ,x,z,1.06);
  runtime.nextShotAt=runtime.moveEndsAt+.22;runtime.moving=true;
}
function beginVillageDetour(runtime: SoldierRuntime, member:SquadMember, memberIndex:number, now:number,
  origin:THREE.Vector3, target:THREE.Vector3, obstacles:readonly CombatObstacle[], kitLines:readonly FootprintLine[],navigationRiver?:RiverStation[]) {
  if (member.radioOperator || member.arrival || runtime.moving || now<runtime.nextDetourAt) return;
  runtime.nextDetourAt=now+1.6+memberIndex*.09;
  const p=chooseVillageWaypoint(origin,target,member.position[0],member.position[2],
    obstacles,memberIndex%2 ? -1 : 1,navigationRiver);
  if (!p || (member.riverFlank&&!member.riverFlank.allows(p.x,p.z)) ||
    !footLaneClear(runtime.baseX,runtime.baseZ,p.x,p.z,kitLines)) return;
  startFriendlyLeg(runtime,p.x,p.z,now);
}

export interface USInfantrySquadProps {
  enemies: readonly EnemyCombatant[];
  enemyPosesRef?: React.RefObject<Map<string, EnemyCombatPose>>;
  zombies?: readonly ZombieCombatant[];
  zombiePosesRef?: React.RefObject<Map<string, ZombieCombatPose>>;
  friendlies: readonly FriendlyCombatant[];
  friendlyPosesRef: React.RefObject<Map<string, FriendlyCombatPose>>;
  obstacles?: readonly CombatObstacle[];
  navigationRiver?: RiverStation[];
  riverFlank?:RiverFlankPost;
  onEnemyHit?: (event: FriendlyEnemyHitEvent) => void;
  onCoverHit?: (position: THREE.Vector3) => void;
  onZombieHit?: (event: FriendlyZombieHitEvent) => void;
  onFriendlyFire?: (event: FriendlyFireEvent) => void;
  enabled?: boolean;
  defenseOffsetZ?: number;
}

const SQUAD: readonly SquadMember[] = [
  { ...US_INFANTRY_DEPLOYMENT[0], alternatePosition: [-5.3, 0.02, -5.7], radioOperator: false, fireInterval: 1.42, initialDelay: 0.42, accuracy: 0.024, burstSize: 3 },
  { ...US_INFANTRY_DEPLOYMENT[1], alternatePosition: [-4.48, 0.02, -5.62], radioOperator: false, fireInterval: 1.55, initialDelay: 0.86, accuracy: 0.03, burstSize: 2 },
  { ...US_INFANTRY_DEPLOYMENT[2], alternatePosition: [4.53, 0.02, -4.33], radioOperator: false, fireInterval: 1.48, initialDelay: 1.16, accuracy: 0.026, burstSize: 3 },
  { ...US_INFANTRY_DEPLOYMENT[3], radioOperator: true, fireInterval: 1.72, initialDelay: 1.48, accuracy: 0.032, burstSize: 2 },
  { ...US_INFANTRY_DEPLOYMENT[4], alternatePosition: US_FORWARD_POST.alternate, radioOperator: false, fireInterval: 1.62, initialDelay: 1.82, accuracy: 0.027, burstSize: 2 },
];

export { US_FIGHTING_POSITIONS };

export const US_INFANTRY_MINIMAP_CONTACTS = SQUAD.map(member => ({ position: member.position }));

function deterministicNoise(id: string, index: number, salt: number) {
  const seed = hashCombatSession(id);
  const value = Math.sin(seed * 0.00017 + index * 73.317 + salt * 23.113) * 43758.5453;
  return value - Math.floor(value);
}

interface StaticInstance {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
}

const SANDBAG_COLORS = ['#797965', '#696e5a', '#86846e'];
const GRASS_COLORS = ['#394b2d', '#536238'];
const COVER_GEOMETRY = {
  sandbag: createCanvasSandbagGeometry(),
  tie: new THREE.TorusGeometry(1, 0.035, 4, 10),
  grass: new THREE.ConeGeometry(0.035, 1, 4),
  circle: new THREE.CircleGeometry(1, 18),
  box: new THREE.BoxGeometry(1, 1, 1),
  handle: new THREE.TorusGeometry(0.12, 0.012, 5, 12, Math.PI),
  can: new THREE.CylinderGeometry(0.11, 0.11, 1, 9),
};
const COVER_MATERIAL = {
  sandbag: createCanvasSandbagMaterial(),
  tie: new THREE.MeshStandardMaterial({ color: '#5d563b', roughness: 1 }),
  grass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86 }),
  mud: new THREE.MeshStandardMaterial({ color: '#3c3a24', roughness: 1 }),
  water: new THREE.MeshStandardMaterial({
    color: '#30483d', roughness: 0.32, metalness: 0.08, transparent: true, opacity: 0.72,
  }),
  crate: new THREE.MeshStandardMaterial({ color: '#4d5634', roughness: 0.94 }),
  crateLid: new THREE.MeshStandardMaterial({ color: '#6c7245', roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: '#2d3328', metalness: 0.35, roughness: 0.65 }),
  can: new THREE.MeshStandardMaterial({ color: '#4c5736', roughness: 0.85, metalness: 0.18 }),
};

const composeMatrix = (
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
) => new THREE.Matrix4().compose(
  new THREE.Vector3(...position),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
  new THREE.Vector3(...scale),
);

function buildCoverInstances(offsetZ=0) {
  const sandbags: StaticInstance[] = [];
  const ties: StaticInstance[] = [];
  const grass: StaticInstance[] = [];
  const mud: StaticInstance[] = [];
  const water: StaticInstance[] = [];
  const crates: StaticInstance[] = [];
  const crateLids: StaticInstance[] = [];
  const handles: StaticInstance[] = [];
  const cans: StaticInstance[] = [];

  const addInstance = (
    target: StaticInstance[],
    parent: THREE.Matrix4,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number],
    color?: string,
  ) => {
    target.push({
      matrix: parent.clone().multiply(composeMatrix(position, rotation, scale)),
      color: color ? new THREE.Color(color) : undefined,
    });
  };

  getUSFightingPositions(offsetZ).forEach(fightingPosition => {
    const { position, rotation, width } = fightingPosition;
    const emplacement = composeMatrix(position, [0, rotation, 0]);
    const lowerCount = Math.max(3, Math.round(width / 0.5));
    const lower = Array.from({ length: lowerCount }, (_, index) => (
      -width * 0.5 + (index + 0.5) * (width / lowerCount)
    ));
    const upper = lower.slice(0, -1).map((value, index) => (
      value + width / lowerCount * 0.5 + Math.sin(index * 2.3) * 0.025
    ));
    const bags = [
      ...lower.map((x, index) => ({ position: [x, 0.13, 0] as [number, number, number], rotation: 0, shade: index })),
      ...upper.map((x, index) => ({
        position: [x, 0.32, 0.015] as [number, number, number],
        rotation: index % 2 === 0 ? 0.025 : -0.025,
        shade: index + 1,
      })),
      ...[-1, 1].flatMap(side => [0, 1, 2].map(step => ({
        position: [
          side * (width * 0.5 - 0.05),
          0.13 + (offsetZ===0 && step===2 ? 0.17 : 0),
          -0.32 - step * 0.38,
        ] as [number, number, number],
        rotation: Math.PI * 0.5,
        shade: step + (side > 0 ? 1 : 0),
      }))),
    ];
    bags.forEach((bag, index) => {
      const variation = deterministicNoise(fightingPosition.id, index, 812);
      const widthVariation = deterministicNoise(fightingPosition.id, index, 813);
      const bagParent = emplacement.clone().multiply(composeMatrix(
        bag.position,
        [0, bag.rotation + (variation - 0.5) * 0.065, 0],
      ));
      addInstance(
        sandbags,
        bagParent,
        [0, 0, 0],
        [0, deterministicNoise(fightingPosition.id, index, 819)<.46 ? Math.PI : 0, 0],
        [0.29 * (0.95 + widthVariation * 0.1), 0.115, 0.17 * (0.95 + variation * 0.1)],
        SANDBAG_COLORS[bag.shade % SANDBAG_COLORS.length],
      );
      addInstance(ties, bagParent, [0, 0.002, 0], [Math.PI / 2, 0, 0], [0.17, 0.1, 0.17]);
    });

    addInstance(mud, emplacement, [0, -0.004, -0.18], [-Math.PI / 2, 0, 0], [width * 0.55, width * 0.55, 1]);
    addInstance(
      water,
      emplacement,
      [-width * 0.08, 0.004, -0.45],
      [-Math.PI / 2, 0, 0],
      [width * 0.43 * 0.9, width * 0.43 * 0.36, 1],
    );

    const kit=fieldKitPlacement(fightingPosition);
    const crateParent = emplacement.clone().multiply(composeMatrix(kit.crate,[0,KIT_BOX.yaw,0]));
    addInstance(crates, crateParent, [0, 0, 0], [0, 0, 0], [KIT_BOX.width,KIT_BOX.height,KIT_BOX.depth]);
    addInstance(crateLids, crateParent, [0, 0.15, 0], [0, 0, 0], [KIT_BOX.lidWidth,.035,KIT_BOX.lidDepth]);
    addInstance(handles, crateParent, [0, 0.18, 0], [-Math.PI / 2, 0, 0], [1, 1, 1]);
    addInstance(cans, emplacement, kit.can, [0, 0.16, Math.PI / 2], [1, 0.34, 1]);

    const clumps = [
      { position: [-width * 0.48, 0, 0.1] as [number, number, number], rotation: 0.12 },
      { position: [width * 0.46, 0, -0.08] as [number, number, number], rotation: -0.18 },
      ...(width > 2
        ? [{ position: [-width * 0.18, 0, -0.96] as [number, number, number], rotation: 0.4 }]
        : []),
    ];
    clumps.forEach(clump => {
      const clumpParent = emplacement.clone().multiply(composeMatrix(
        clump.position,
        [0, clump.rotation, 0],
      ));
      [-0.16, -0.08, 0, 0.09, 0.17].forEach((x, index) => {
        const height = 0.38 + (index % 3) * 0.11;
        addInstance(
          grass,
          clumpParent,
          [x, height * 0.5, Math.sin(index * 1.8) * 0.08],
          [0.03 * (index - 2), 0, (x / 0.17) * -0.14],
          [1, height, 1],
          GRASS_COLORS[index % GRASS_COLORS.length],
        );
      });
    });
  });

  return { sandbags, ties, grass, mud, water, crates, crateLids, handles, cans };
}

function StaticFightingPositions({offsetZ}:{offsetZ:number}) {
  const COVER_INSTANCES=useMemo(()=>buildCoverInstances(offsetZ),[offsetZ]);
  const sandbagRef = useRef<THREE.InstancedMesh>(null);
  const tieRef = useRef<THREE.InstancedMesh>(null);
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const mudRef = useRef<THREE.InstancedMesh>(null);
  const waterRef = useRef<THREE.InstancedMesh>(null);
  const crateRef = useRef<THREE.InstancedMesh>(null);
  const lidRef = useRef<THREE.InstancedMesh>(null);
  const handleRef = useRef<THREE.InstancedMesh>(null);
  const canRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const batches: Array<[React.RefObject<THREE.InstancedMesh | null>, StaticInstance[]]> = [
      [sandbagRef, COVER_INSTANCES.sandbags],
      [tieRef, COVER_INSTANCES.ties],
      [grassRef, COVER_INSTANCES.grass],
      [mudRef, COVER_INSTANCES.mud],
      [waterRef, COVER_INSTANCES.water],
      [crateRef, COVER_INSTANCES.crates],
      [lidRef, COVER_INSTANCES.crateLids],
      [handleRef, COVER_INSTANCES.handles],
      [canRef, COVER_INSTANCES.cans],
    ];
    batches.forEach(([ref, instances]) => {
      const mesh = ref.current;
      if (!mesh) return;
      instances.forEach((instance, index) => {
        mesh.setMatrixAt(index, instance.matrix);
        if (instance.color) mesh.setColorAt(index, instance.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    });
  }, [COVER_INSTANCES]);

  return (
    <group>
      <instancedMesh name="us-field-sandbags" ref={sandbagRef} args={[COVER_GEOMETRY.sandbag, COVER_MATERIAL.sandbag, COVER_INSTANCES.sandbags.length]} castShadow receiveShadow />
      <instancedMesh ref={tieRef} args={[COVER_GEOMETRY.tie, COVER_MATERIAL.tie, COVER_INSTANCES.ties.length]} receiveShadow />
      <instancedMesh ref={grassRef} args={[COVER_GEOMETRY.grass, COVER_MATERIAL.grass, COVER_INSTANCES.grass.length]} />
      <instancedMesh ref={mudRef} args={[COVER_GEOMETRY.circle, COVER_MATERIAL.mud, COVER_INSTANCES.mud.length]} receiveShadow />
      <instancedMesh ref={waterRef} args={[COVER_GEOMETRY.circle, COVER_MATERIAL.water, COVER_INSTANCES.water.length]} receiveShadow />
      <instancedMesh name="field-kit-crates" ref={crateRef} args={[COVER_GEOMETRY.box, COVER_MATERIAL.crate, COVER_INSTANCES.crates.length]} castShadow />
      <instancedMesh name="field-kit-lids" ref={lidRef} args={[COVER_GEOMETRY.box, COVER_MATERIAL.crateLid, COVER_INSTANCES.crateLids.length]} />
      <instancedMesh ref={handleRef} args={[COVER_GEOMETRY.handle, COVER_MATERIAL.metal, COVER_INSTANCES.handles.length]} />
      <instancedMesh name="field-kit-cans" ref={canRef} args={[COVER_GEOMETRY.can, COVER_MATERIAL.can, COVER_INSTANCES.cans.length]} />
    </group>
  );
}

// Bodies are baked once per stance/palette. Five soldiers now share one smooth
// anatomical mesh each, instead of many individually drawn primitive body parts.
const SOLDIER_GEOMETRY = {
  flash: makeSmgFlash(.20,.32),
};
const SOLDIER_FLASH_MATERIAL = new THREE.MeshBasicMaterial({
  vertexColors: true, depthWrite: false, toneMapped: false,
});
const SQUAD_BODY_GEOMETRIES = SQUAD.map((member, index) => createInfantryGeometry({
  faction: 'us', kneeling: member.kneeling, variant: index % 3,
  radioOperator: member.radioOperator, fieldUniform: true,
}));
const US_FIELD_INK = createGhostInfantryMaterial(INFANTRY_MATERIAL, 'us');
let flankBody:THREE.BufferGeometry|undefined;
function getFlankBody(){
  return flankBody??=createInfantryGeometry({faction:'us',kneeling:false,variant:2,fieldUniform:true});
}
// The flight crew is the same visible adult as the standing relief passenger.
// The transport borrows these immutable GPU assets; it must not dispose them.
export const DOOR_CREW_BODY = SQUAD_BODY_GEOMETRIES[3];
export const DOOR_CREW_INK = US_FIELD_INK;
export const passengerBody=(body:number)=>SQUAD_BODY_GEOMETRIES[body];

type SoldierVectorTuple = [number, number, number];

function asNonIndexedGeometry(geometry: THREE.BufferGeometry) {
  if (!geometry.index) return geometry;
  const nonIndexed = geometry.toNonIndexed();
  geometry.dispose();
  return nonIndexed;
}

function colorizeSoldierPart(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const vertexCount = positions.count;
  const colors = new Float32Array(vertexCount * 3);
  const resolved = new THREE.Color(color);
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 3;
    const facing = THREE.MathUtils.smoothstep(normals.getY(index) + normals.getX(index) * 0.32, -0.7, 0.95);
    const wear = (0.5 + 0.5 * Math.sin(positions.getZ(index) * 28 + positions.getY(index) * 41)) * facing;
    colors[offset] = resolved.r * (0.74 + 0.59 * facing + 0.22 * wear);
    colors[offset + 1] = resolved.g * (0.83 + 0.45 * facing + 0.17 * wear);
    colors[offset + 2] = resolved.b * (0.94 + 0.38 * facing + 0.1 * wear);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function transformedSoldierPart(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  position: SoldierVectorTuple,
  rotation: SoldierVectorTuple = [0, 0, 0],
) {
  const normalizedGeometry = asNonIndexedGeometry(geometry);
  const transform = new THREE.Object3D();
  transform.position.set(...position);
  transform.rotation.set(...rotation);
  transform.updateMatrix();
  normalizedGeometry.applyMatrix4(transform.matrix);
  return colorizeSoldierPart(normalizedGeometry, color);
}

function mergeSoldierParts(parts: THREE.BufferGeometry[]) {
  // This shared rifle uses vertex colours; custom profiles need no UV channel.
  parts.forEach(part => part.deleteAttribute('uv'));
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Unable to merge infantry geometry');
  for (const part of parts) part.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Small hard-surface lofts keep bevels in the silhouette without subdivision.
 * Each ring is [z, width, height, centreY], in the existing rifle-local frame. */
function rifleLoft(rings: Array<[number, number, number, number]>, triangular = false) {
  const profile = triangular
    ? [[-0.72, -0.72], [0.72, -0.72], [0.96, -0.45], [0.85, -0.05],
      [0.28, 0.88], [0, 1], [-0.28, 0.88], [-0.85, -0.05], [-0.96, -0.45]]
    : [[-0.76, -1], [0.76, -1], [1, -0.65], [1, 0.65],
      [0.76, 1], [-0.76, 1], [-1, 0.65], [-1, -0.65]];
  const sides = profile.length;
  const vertices: number[] = [];
  const indices: number[] = [];
  rings.forEach(([z, width, height, centreY], ring) => {
    profile.forEach(([x, y]) => vertices.push(x * width * 0.5, centreY + y * height * 0.5, z));
    if (ring === 0) return;
    for (let side = 0; side < sides; side++) {
      const a = (ring - 1) * sides + side;
      const b = (ring - 1) * sides + (side + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  });
  const end = (rings.length - 1) * sides;
  for (let side = 1; side < sides - 1; side++) {
    indices.push(0, side + 1, side, end, end + side, end + side + 1);
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  // Hard receiver bevels retain their edge highlights instead of ball shading.
  geometry.computeVertexNormals();
  return geometry;
}

function rifleCarryHandle() {
  // Sloped front support and thin top bridge, with a real open sight channel.
  // Shape X is -rifle Z; rotating the extrusion preserves outward winding.
  const outline = new THREE.Shape();
  outline.moveTo(0.166, 0.061);
  outline.lineTo(0.151, 0.116);
  outline.lineTo(0.13, 0.127);
  outline.lineTo(0.023, 0.127);
  outline.lineTo(0.006, 0.115);
  outline.lineTo(0.006, 0.061);
  outline.closePath();
  const opening = new THREE.Path();
  opening.moveTo(0.133, 0.07);
  opening.lineTo(0.126, 0.11);
  opening.lineTo(0.035, 0.11);
  opening.lineTo(0.028, 0.07);
  opening.closePath();
  outline.holes.push(opening);
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: 0.034, steps: 1, bevelEnabled: false, curveSegments: 1,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-0.017, 0, 0);
  return geometry;
}

/**
 * A tank-scale early M16 silhouette. Every detail is baked into one shared,
 * vertex-coloured geometry so five readable rifles still cost one mesh each.
 */
function buildM16Geometry() {
  const polymer = '#323c35';
  const polymerEdge = '#454c3e';
  const gunmetal = '#263330';
  const steelEdge = '#52615a';
  const parts: THREE.BufferGeometry[] = [
    // A narrow wrist widens into the fixed stock; its lower edge is not a box.
    transformedSoldierPart(rifleLoft([
      [-0.1275, 0.057, 0.064, 0.015], [-0.085, 0.066, 0.083, 0.007],
      [0.1275, 0.09, 0.115, 0],
    ]), polymer, [0, 0, 0.155], [-0.035, 0, 0]),
    transformedSoldierPart(rifleLoft([
      [-0.013, 0.105, 0.132, 0], [0.013, 0.105, 0.132, 0],
    ]), polymerEdge, [0, -0.004, 0.286], [-0.035, 0, 0]),
    transformedSoldierPart(rifleLoft([
      [-0.045, 0.064, 0.059, 0], [0.045, 0.064, 0.059, 0],
    ]), polymer, [0, 0.01, 0.005]),

    // Shaped receiver rails and mag well. The grip/contact anchors do not move.
    transformedSoldierPart(rifleLoft([
      [-0.095, 0.070, 0.075, -0.005], [-0.025, 0.080, 0.079, -0.003],
      [0.095, 0.067, 0.064, 0.004],
    ]), gunmetal, [0, -0.011, -0.075]),
    transformedSoldierPart(rifleLoft([
      [-0.09, 0.061, 0.042, 0], [-0.055, 0.074, 0.048, 0],
      [0.09, 0.066, 0.044, 0],
    ]), steelEdge, [0, 0.044, -0.082]),
    transformedSoldierPart(rifleLoft([
      [-0.029, 0.045, 0.107, 0], [0, 0.052, 0.115, 0],
      [0.029, 0.041, 0.10, 0.005],
    ]), polymer, [0, -0.097, 0.002], [-0.18, 0, 0]),
    transformedSoldierPart(rifleLoft([
      [-0.032, 0.047, 0.171, 0], [0, 0.057, 0.182, 0],
      [0.032, 0.051, 0.173, 0.004],
    ]), gunmetal, [0, -0.139, -0.1], [0.055, 0, 0]),

    transformedSoldierPart(rifleCarryHandle(), gunmetal, [0, 0, 0]),
    transformedSoldierPart(new THREE.BoxGeometry(0.040, 0.012, 0.021), steelEdge, [0, 0.133, -0.028]),

    // Tapered triangular handguard, long pencil barrel, flash hider, and front sight.
    transformedSoldierPart(rifleLoft([
      [-0.125, 0.055, 0.058, 0], [0.125, 0.078, 0.080, 0],
    ], true), polymerEdge, [0, 0.006, -0.3]),
    transformedSoldierPart(new THREE.CylinderGeometry(0.012, 0.015, 0.29, 7), gunmetal, [0, 0.012, -0.565], [Math.PI / 2, 0, 0]),
    transformedSoldierPart(new THREE.CylinderGeometry(0.018, 0.022, 0.055, 6), steelEdge, [0, 0.012, -0.738], [Math.PI / 2, 0, 0]),
    transformedSoldierPart(new THREE.BoxGeometry(0.064, 0.025, 0.027), gunmetal, [0, 0.034, -0.65]),
    transformedSoldierPart(new THREE.BoxGeometry(0.018, 0.075, 0.018), gunmetal, [0, 0.075, -0.65]),
  ];
  return mergeSoldierParts(parts);
}

export const M16_GEOMETRY = buildM16Geometry();
// Receiver and stock widths should read as stamped weapon parts, not blocks.
M16_GEOMETRY.scale(0.68, 1, 1);
// The VC rifle uses this same rigid-prop channel within its skinned batch.
M16_GEOMETRY.setAttribute('surfaceKind', new THREE.Float32BufferAttribute(
  new Float32Array(M16_GEOMETRY.getAttribute('position').count).fill(7), 1));
const M16_MATERIAL = US_FIELD_INK;

function SoldierModel({
  alive,
  member,
  index,
  soldierRefs,
  bodyRefs,
  flashRefs,
  rigRefs,
  obstacles,
}: {
  alive: boolean;
  member: SquadMember;
  index: number;
  soldierRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  bodyRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  flashRefs: React.MutableRefObject<Array<THREE.Mesh | null>>;
  rigRefs: React.MutableRefObject<Array<InfantryRig | null>>;
  obstacles:readonly CombatObstacle[];
}) {
  const rifle = infantryRifleBind('service', member.kneeling);
  const skinRef = useRef<THREE.SkinnedMesh>(null);
  const rig = useMemo(() => {
    const model = createInfantryRig(member.kneeling);
    if (index === 0) model.head.name = 'field-infantry-head-review';
    return model;
  }, [index, member.kneeling]);
  useLayoutEffect(() => {
    if (!skinRef.current) return;
    rigRefs.current[index] = rig;
    const unbind = bindInfantryRig(skinRef.current, rig);
    return () => { unbind(); rigRefs.current[index] = null; };
  }, [index, rig, rigRefs]);
  useEffect(() => () => releaseInfantryRig(rig), [rig]);
  return (
    <group
      ref={node => { soldierRefs.current[index] = node; }}
      name={member.id}
      position={member.position}
      rotation-y={Math.PI}
      scale={SOLDIER_SCALE}
      dispose={null}
    >
      {alive && <InfantryInsignia kneeling={member.kneeling} pelvis={rig.root} obstacles={obstacles}/>}
      <skinnedMesh ref={skinRef} name="us-field-infantry-volume" geometry={member.riverFlank?getFlankBody():SQUAD_BODY_GEOMETRIES[member.arrival?.body ?? index]}
        material={US_FIELD_INK} castShadow={!member.arrival} receiveShadow />
      <group ref={node => { bodyRefs.current[index] = node; }}>
        <group position={rifle.origin}>
          <mesh name="us-field-rifle" geometry={M16_GEOMETRY} material={M16_MATERIAL} scale-z={rifle.scaleZ} receiveShadow />
          <mesh
            ref={node => { flashRefs.current[index] = node; }}
            geometry={SOLDIER_GEOMETRY.flash}
            material={SOLDIER_FLASH_MATERIAL}
            position={[rifle.localMuzzle[0], rifle.localMuzzle[1], rifle.localMuzzle[2] * rifle.scaleZ]}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
            renderOrder={87}
          />
        </group>
      </group>
    </group>
  );
}

export function USInfantrySquad({
  enemies,
  enemyPosesRef,
  zombies = [],
  zombiePosesRef,
  friendlies,
  friendlyPosesRef,
  obstacles = [],
  navigationRiver,
  riverFlank,
  onEnemyHit,
  onCoverHit,
  onZombieHit,
  onFriendlyFire,
  enabled = true,
  defenseOffsetZ = 0,
}: USInfantrySquadProps) {
  // A ticket is appended exactly once (death never removes it). HP changes don't
  // rebuild geometry, reset the soldiers' gait or reorder mounted rig indices.
  const landed=friendlies.filter(s=>s.id.startsWith('lift-')).length;
  const dayLanded=friendlies.filter(s=>s.id.startsWith('kestrel-')).length;
  const squad = useMemo((): SquadMember[] => [...SQUAD.map((member,i) => ({
    ...member,...getUSMemberPost(US_INFANTRY_DEPLOYMENT[i],defenseOffsetZ,riverFlank),
    riverFlank:!defenseOffsetZ&&member.id===RIVER_FLANK_ID?riverFlank:undefined,
    alternatePosition: member.id==='us-rifle-5'?getUSForwardPost(defenseOffsetZ).alternate:
      member.alternatePosition ? [member.alternatePosition[0], member.alternatePosition[1],
        member.alternatePosition[2] + defenseOffsetZ] as [number, number, number] : undefined,
  })),...[
    ...LIFT_TEAM.slice(0,landed).map(t=>({...t,door:LIFT_DOOR,step:LIFT_STEP})),
    ...DAY_CREW.slice(0,dayLanded).map(t=>({...t,door:DAY_DOOR,step:DAY_STEP})),
    ...friendlies.flatMap(f=>f.relief?[f.relief]:[]),
  ].map((ticket,i)=>({
    id:ticket.id, position:ticket.door, arrival:ticket, kneeling:ticket.body!==3,
    radioOperator:false, fireInterval:2.15+i*.13, initialDelay:.45, accuracy:.043, burstSize:2,
  }))], [defenseOffsetZ,landed,dayLanded,riverFlank,friendlies]);
  const soldierRefs = useRef<Array<THREE.Group | null>>([]);
  const bodyRefs = useRef<Array<THREE.Group | null>>([]);
  const rigRefs = useRef<Array<InfantryRig | null>>([]);
  const ejectBrass = useEjectBrass();
  const flashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const tracers = useRoundTracers();
  const runtimeRef = useRef(new Map<string, SoldierRuntime>());
  useEffect(()=>{
    const current=new Set(squad.map(m=>m.id));
    for(const id of runtimeRef.current.keys())if(!current.has(id))runtimeRef.current.delete(id);
  },[squad]);
  const projectileCursorRef = useRef(0);
  const guardShift=useRef({member:-1,cursor:0,at:5.8});
  const kitLines=useMemo(()=>fieldSupplyFootprints(defenseOffsetZ),[defenseOffsetZ]);
  const bagLines=useMemo(()=>fieldBagFootprints(defenseOffsetZ),[defenseOffsetZ]);
  const combatTargetsRef = useRef<EnemyCombatant[]>([]);
  const combatTargetByIdRef = useRef(new Map<string, EnemyCombatant>());
  const combatTargetIndexByIdRef = useRef(new Map<string, number>());

  // Reused adapters let the established cover-aware rifle logic aim at live
  // zombie poses without allocating a fresh target array every animation frame.
  const zombieTargetPool = useMemo<EnemyCombatant[]>(() => (
    Array.from({ length: ZOMBIE_MAX_ACTIVE }, (_, index) => ({
      id: `undead-proxy-${index}`,
      position: [0, 0, 0],
      health: 1,
      maxHealth: 1,
      alive: false,
      stance: 'standing',
      headwear: 'boonie',
      uniformVariant: 0,
      fireInterval: 1,
      initialFireDelay: 0,
      accuracy: 0,
    }))
  ), []);

  const projectilePool = useMemo<FriendlyProjectile[]>(() => (
    Array.from({ length: FRIENDLY_PROJECTILE_CAPACITY }, () => ({
      active: false,
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      lifetime: 0,
      soldierId: '',
    }))
  ), []);
  const muzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const candidateMuzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const sightOrigin = useMemo(() => new THREE.Vector3(), []);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const preferredPosition = useMemo(() => new THREE.Vector3(), []);
  const shotDirection = useMemo(() => new THREE.Vector3(), []);
  const impactPosition = useMemo(() => new THREE.Vector3(), []);
  const spawnFriendlyRound = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    soldierId: string,
  ) => {
    for (let offset = 0; offset < projectilePool.length; offset += 1) {
      const index = (projectileCursorRef.current + offset) % projectilePool.length;
      const projectile = projectilePool[index];
      if (projectile.active) continue;
      projectileCursorRef.current = (index + 1) % projectilePool.length;
      projectile.active = true;
      projectile.position.copy(position);
      projectile.previousPosition.copy(position);
      projectile.direction.copy(direction).normalize();
      projectile.lifetime = 0;
      projectile.soldierId = soldierId;
      return true;
    }
    return false;
  };

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    const combatTargets = combatTargetsRef.current;
    const combatTargetById = combatTargetByIdRef.current;
    const combatTargetIndexById = combatTargetIndexByIdRef.current;
    combatTargets.length = 0;
    combatTargetById.clear();
    combatTargetIndexById.clear();
    let zombieTargetCount = 0;
    if (zombiePosesRef) {
      for (let index = 0; index < zombies.length && zombieTargetCount < ZOMBIE_MAX_ACTIVE; index += 1) {
        const zombie = zombies[index];
        const pose = zombiePosesRef.current.get(zombie.id);
        if (!zombie.alive || !pose?.active) continue;
        const proxy = zombieTargetPool[zombieTargetCount++];
        proxy.id = zombie.id;
        proxy.position[0] = pose.position.x;
        proxy.position[1] = pose.position.y;
        proxy.position[2] = pose.position.z;
        proxy.health = zombie.health;
        proxy.maxHealth = zombie.maxHealth;
        proxy.alive = true;
        combatTargets.push(proxy);
      }
    }
    // During a horde push the squad prioritizes the advancing line. Once it is
    // clear, the same pooled rifles resume their normal Viet Cong engagement.
    if (zombieTargetCount === 0) {
      for (const enemy of enemies) if (enemy.alive) combatTargets.push(enemy);
    }
    for (let targetIndex = 0; targetIndex < combatTargets.length; targetIndex += 1) {
      const target = combatTargets[targetIndex];
      combatTargetById.set(target.id, target);
      combatTargetIndexById.set(target.id, targetIndex);
    }

    if (!enabled) {
      for (const projectile of projectilePool) projectile.active = false;
      for (const flash of flashRefs.current) if (flash) flash.visible = false;
    }

    for (let memberIndex = 0; memberIndex < squad.length; memberIndex += 1) {
      const member = squad[memberIndex];
      const friendlyState = friendlies.find(friendly => friendly.id === member.id);
      const friendlyAlive = friendlyState?.alive === true;
      let runtime = runtimeRef.current.get(member.id);
      if (!runtime) {
        runtime = {
          lastHealth:friendlyState?.health??0,contact:null,
          aimPitch: 0,
          nextShotAt: now + member.initialDelay,
          shotIndex: 0,
          flashUntil: 0,
          recoilUntil: 0,
          burstRemaining: member.burstSize,
          baseX: member.position[0],
          baseZ: member.position[2],
          moveFromX: member.position[0],
          moveFromZ: member.position[2],
          moveToX: member.position[0],
          moveToZ: member.position[2],
          moveStartedAt: 0,
          moveEndsAt: 0,
          moving: false,
          disembarking: Boolean(member.arrival),
          patrolLeg:0,nextPatrolAt:now+2.5+memberIndex*1.33,routeObstacles:obstacles,atGuardAlternate:false,
          wasAlive: friendlyAlive, fall:null,
          preferredTargetId: null,
          selectedTargetId: null,
          nextTargetAcquisitionAt: 0,
          nextLineOfSightDecisionAt: 0,
          nextDetourAt: now+1.7+memberIndex*.18,
        };
        runtimeRef.current.set(member.id, runtime);
        if(member.arrival){
          const [px,,pz]=member.arrival.post;
          runtime.moving=true;
          runtime.moveToX=px;runtime.moveToZ=pz;runtime.moveStartedAt=now;
          runtime.moveEndsAt=now+LIFT_FOOTDOWN+Math.hypot(px-member.arrival.step[0],pz-member.arrival.step[2])/(member.arrival.runSpeed??2.25);
          runtime.nextShotAt=runtime.moveEndsAt+.35;
        }
      }

      // The day field stays populated during quiet intervals. At night the
      // assigned archive posts take priority, including the landed relief crew.
      if(defenseOffsetZ===0 && !member.arrival?.coverId && friendlyAlive && !runtime.disembarking && !runtime.moving && now>=runtime.nextPatrolAt){
        const [postX,,hz]=member.arrival?.post??member.position;
        // Disembarking finishes at the authored meeting mark. Once the day
        // crew has settled, clear the road by circulating on its near verge.
        const hx=member.arrival?Math.sign(postX||1)*Math.max(3.7,Math.abs(postX)):postX;
        const radius=member.riverFlank?.91:member.radioOperator?2.5:member.arrival?2.8:4.1;
        const lines=[...bagLines,...kitLines];
        for(const other of friendlies){
          if(!other.alive||other.id===member.id)continue;
          const r=runtimeRef.current.get(other.id);
          const x=r?.baseX??other.position[0],z=r?.baseZ??other.position[2];
          lines.push({ax:x,az:z,bx:r?.moving?r.moveToX:x,bz:r?.moving?r.moveToZ:z,radius:.58});
        }
        const p=patrolWaypoint(runtime.baseX,runtime.baseZ,hx,hz,radius,hashCombatSession(member.id),
          runtime.patrolLeg++,obstacles,navigationRiver,(x,z)=>x*Math.sign(hx)>2.95 && (!member.riverFlank||member.riverFlank.allows(x,z))
          && footLaneClear(runtime!.baseX,runtime!.baseZ,x,z,lines));
        if(p)startFriendlyLeg(runtime,p.x,p.z,now);
        runtime.nextPatrolAt=now+(p?5:1.35)+memberIndex*.32;
      }
      if(defenseOffsetZ!==0 && enabled && combatTargets.length && guardShift.current.member<0 && now>=guardShift.current.at){
        const guard=guardShift.current;
        for(let k=0;k<SQUAD.length;k++){
          const i=(guard.cursor+k)%SQUAD.length,c=squad[i],p=c.alternatePosition;
          if(!p || !friendlies.some(f=>f.id===c.id&&f.alive) ||
            !safeVillageLeg(c.position[0],c.position[2],p[0],p[2],obstacles,navigationRiver) ||
            !footLaneClear(c.position[0],c.position[2],p[0],p[2],kitLines))continue;
          if(i===memberIndex){
            const goal=runtime.atGuardAlternate?c.position:p;
            runtime.moveFromX=runtime.baseX;runtime.moveFromZ=runtime.baseZ;runtime.moveToX=goal[0];runtime.moveToZ=goal[2];
            runtime.moveStartedAt=now;runtime.moveEndsAt=now+.82+deterministicNoise(c.id,runtime.shotIndex,31)*.28;
            runtime.moving=true;runtime.nextShotAt=Math.max(runtime.nextShotAt,runtime.moveEndsAt+.22);guard.member=i;
          }
          break;
        }
      }

      const soldier = soldierRefs.current[memberIndex];
      const body = bodyRefs.current[memberIndex];
      const flash = flashRefs.current[memberIndex];
      if (!friendlyAlive) {
        runtime.lastHealth=friendlyState?.health??0;
        if(runtime.contact){runtime.contact.weight=0;runtime.contact=null;}
        if (soldier) {
          const rig = rigRefs.current[memberIndex];
          if (runtime.wasAlive) runtime.fall = beginInfantryFall(soldier, rig, now);
          if (runtime.fall) {
            if (defenseOffsetZ) {
              poseHordeDefenderFall(soldier, runtime.fall, now, memberIndex);
            } else poseInfantryFall(soldier, runtime.fall, now, memberIndex);
            if (soldier.visible && rig && body) applyInfantryWeaponPose(body, rig);
            if (!soldier.visible) runtime.fall = null;
          } else soldier.visible = false;
        }
        if (flash) flash.visible = false;
        runtime.moving = false;
        runtime.wasAlive = false;
        if(guardShift.current.member===memberIndex){guardShift.current.member=-1;guardShift.current.at=now+1.5;}
        continue;
      }
      if(soldier&&runtime.wasAlive&&friendlyState&&friendlyState.health<runtime.lastHealth){
        runtime.contact=defenderContact(runtime.contact,runtime.lastHealth,friendlyState.health,now,soldier,member.id,zombiePosesRef?.current);
        soldier.userData.defenderHit=runtime.contact;
      }
      runtime.lastHealth=friendlyState?.health??0;
      if (!runtime.wasAlive) {
        if(soldier){
          soldier.rotation.set(0,Math.PI,0,'XYZ');soldier.position.y=member.position[1];
        }
        runtime.fall=null;
        runtime.aimPitch = 0;
        if (rigRefs.current[memberIndex]) rigRefs.current[memberIndex]!.movement = 0;
        runtime.baseX = member.position[0];
        runtime.baseZ = member.position[2];
        runtime.moveFromX = member.position[0];
        runtime.moveFromZ = member.position[2];
        runtime.moveToX = member.position[0];
        runtime.moveToZ = member.position[2];
        runtime.moving = false;
        runtime.nextPatrolAt=now+2.4+memberIndex*.35;
        runtime.atGuardAlternate=false;
        runtime.nextDetourAt=now+1.7;
        runtime.burstRemaining = member.burstSize;
        runtime.nextShotAt = now + member.initialDelay;
        runtime.preferredTargetId = null;
        runtime.selectedTargetId = null;
        runtime.nextTargetAcquisitionAt = 0;
        runtime.nextLineOfSightDecisionAt = 0;
        runtime.wasAlive = true;
      }
      if (soldier) soldier.visible = true;
      let movementProgress = 0;
      let movementBlend = 0;
      // A changed sector can put a new hut across an already-started leg.
      // Stop before entering it. The next route query starts at the live pose.
      if(runtime.moving && !runtime.disembarking && runtime.routeObstacles!==obstacles){
        runtime.routeObstacles=obstacles;
        if(!safeVillageLeg(runtime.baseX,runtime.baseZ,runtime.moveToX,runtime.moveToZ,obstacles,navigationRiver)){
          runtime.moving=false;runtime.nextPatrolAt=now+1;
        }
      }
      if (runtime.moving) {
        const movementDuration = Math.max(0.001, runtime.moveEndsAt - runtime.moveStartedAt);
        movementProgress = THREE.MathUtils.clamp(
          (now - runtime.moveStartedAt) / movementDuration,
          0,
          1,
        );
        movementBlend = movementProgress * movementProgress * (3 - 2 * movementProgress);
        runtime.baseX = THREE.MathUtils.lerp(runtime.moveFromX, runtime.moveToX, movementBlend);
        runtime.baseZ = THREE.MathUtils.lerp(runtime.moveFromZ, runtime.moveToZ, movementBlend);
        if(member.arrival&&runtime.disembarking){
          const elapsed=now-runtime.moveStartedAt;
          const door=member.position,step=member.arrival.step;
          if(elapsed<LIFT_FOOTDOWN){
            const t=liftStepTravel(elapsed);
            runtime.baseX=THREE.MathUtils.lerp(door[0],step[0],t);
            runtime.baseZ=THREE.MathUtils.lerp(door[2],step[2],t);
          }else{
            const u=THREE.MathUtils.clamp((elapsed-LIFT_FOOTDOWN)/(movementDuration-LIFT_FOOTDOWN),0,1);
            // Short acceleration then an even walk, feathering the last step.
            const edge=.14,t=u<edge?u*u/(2*edge*(1-edge)):u>1-edge?
              1-(1-u)*(1-u)/(2*edge*(1-edge)):(u-edge/2)/(1-edge);
            runtime.baseX=THREE.MathUtils.lerp(step[0],runtime.moveToX,t);
            runtime.baseZ=THREE.MathUtils.lerp(step[2],runtime.moveToZ,t);
          }
        }

        if (movementProgress >= 1) {
          runtime.baseX = runtime.moveToX;
          runtime.baseZ = runtime.moveToZ;
          runtime.moving = false;
          if(runtime.disembarking){runtime.disembarking=false;runtime.nextPatrolAt=now+4.8+memberIndex*.23;}
          else if(guardShift.current.member===memberIndex){
            runtime.atGuardAlternate=!runtime.atGuardAlternate;
            guardShift.current={member:-1,cursor:(memberIndex+1)%SQUAD.length,
              at:now+6.6+deterministicNoise(member.id,runtime.shotIndex,32)*3.2};
          }
          else runtime.nextPatrolAt=now+2.0+deterministicNoise(member.id,runtime.patrolLeg,32)*3.5;
        }
      }
      if (soldier) {
        soldier.position.x = runtime.baseX;
        soldier.position.z = runtime.baseZ;
        if(member.riverFlank)soldier.position.y=member.riverFlank.height(runtime.baseX,runtime.baseZ);
        if(runtime.moving&&!runtime.disembarking)soldier.rotation.y=turnFootActor(soldier.rotation.y,
          Math.atan2(runtime.moveFromX-runtime.moveToX,runtime.moveFromZ-runtime.moveToZ),delta);
        if(member.arrival){
          const elapsed=now-runtime.moveStartedAt;
          const step=member.arrival.step,door=member.position;
          if(member.arrival.coverId && elapsed>=LIFT_FOOTDOWN){
            const post=member.arrival.post;
            const leg=Math.hypot(post[0]-step[0],post[2]-step[2]);
            const travel=runtime.disembarking?Math.min(1,Math.hypot(runtime.baseX-step[0],runtime.baseZ-step[2])/leg):1;
            soldier.position.y=THREE.MathUtils.lerp(step[1],post[1],travel);
          }else soldier.position.y=runtime.disembarking?liftBootHeight(elapsed,door[1]-step[1]+.025)+step[1]-.025:step[1];
          if(runtime.disembarking)soldier.rotation.y=elapsed<LIFT_FOOTDOWN?
            Math.atan2(door[0]-step[0],door[2]-step[2]):
            Math.atan2(step[0]-runtime.moveToX,step[2]-runtime.moveToZ);
        }
      }
      const livePose = friendlyPosesRef.current.get(member.id);
      if (livePose) {
        livePose.position.set(
          soldier?.position.x ?? runtime.baseX,
          soldier?.position.y ?? member.position[1],
          soldier?.position.z ?? runtime.baseZ,
        );
      }
      const rig = rigRefs.current[memberIndex];
      if (rig) {
        const yaw = soldier?.rotation.y ?? Math.PI;
        const elapsed=now-runtime.moveStartedAt,egress=runtime.disembarking?member.arrival:null;
        const stepping=Boolean(egress&&elapsed<LIFT_FOOTDOWN);
        const fromX=egress&&!stepping?egress.step[0]:runtime.moveFromX,fromZ=egress&&!stepping?egress.step[2]:runtime.moveFromZ;
        const toX=egress&&stepping?egress.step[0]:runtime.moveToX,toZ=egress&&stepping?egress.step[2]:runtime.moveToZ;
        const dx=toX-fromX,dz=toZ-fromZ;
        const walked=egress?Math.min(1,Math.hypot(runtime.baseX-fromX,runtime.baseZ-fromZ)/Math.max(.001,Math.hypot(dx,dz))):undefined;
        const brace=egress?dismountBeat(elapsed):0;
        updateInfantryRig(rig, {
          time: now, delta, moving: runtime.moving, progress: movementProgress,
          walked,compression:brace,
          phase: memberIndex * 1.91, recoil: now < runtime.recoilUntil ? (runtime.recoilUntil - now) / 0.11 : 0,
          aimPitch: runtime.aimPitch, holdingRifle: true, fieldStance: true,
          lookYaw: !enabled || combatTargets.length === 0
            ? Math.sin(now * 0.24 + memberIndex * 1.3) * (member.radioOperator ? 0.34 : 0.22) : 0,
          worldX: runtime.baseX, worldZ: runtime.baseZ, worldYaw: yaw, worldScale: SOLDIER_SCALE,
          moveFromX:fromX,moveFromZ:fromZ,moveToX:toX,moveToZ:toZ,
          directionX: Math.cos(yaw) * dx - Math.sin(yaw) * dz,
          directionZ: Math.sin(yaw) * dx + Math.cos(yaw) * dz,
        });
        if(runtime.disembarking){
          // Compress the knees against stationary foot contacts before the
          // weight settles. The carried rifle follows the same braced spine.
          rig.spine.position.y-=.06*brace;rig.spine.rotation.x+=.19*brace;
          rig.spine.rotation.z+=.055*brace;rig.head.rotation.x-=.09*brace;
        }
        if(runtime.contact && (runtime.contact.weight>0 || now-runtime.contact.startedAt<CONTACT_SETTLE))
          applyDefenderContact(rig,runtime.contact,yaw,now);
        if (body) applyInfantryWeaponPose(body, rig);
      }
      if (flash) {
        flash.visible = now < runtime.flashUntil;
        if (flash.visible) flash.scale.setScalar(0.82 + Math.sin(now * 157 + memberIndex) * 0.18);
      }

      if (!enabled || combatTargets.length === 0) {
        continue;
      }

      // Acquisition runs at a fixed decision cadence while aiming continues to
      // follow the live target pose every frame. A missing/dead cached contact
      // bypasses the cadence so target loss is handled immediately.
      let preferredTarget = runtime.preferredTargetId
        ? combatTargetById.get(runtime.preferredTargetId) ?? null
        : null;
      if (!preferredTarget || now >= runtime.nextTargetAcquisitionAt) {
        preferredTarget = null;
        let aimScore = Number.POSITIVE_INFINITY;
        for (let enemyIndex = 0; enemyIndex < combatTargets.length; enemyIndex += 1) {
          const candidate = combatTargets[enemyIndex];
          if (!candidate.alive) continue;
          enemyWorldPosition(targetPosition, candidate, enemyPosesRef?.current);
          const dx = targetPosition.x - (soldier?.position.x ?? runtime.baseX);
          const dz = targetPosition.z - (soldier?.position.z ?? runtime.baseZ);
          const assignmentPenalty = ((enemyIndex + 3 - (memberIndex % 3)) % 3) * 12;
          const score = dx * dx + dz * dz + assignmentPenalty;
          if (score >= aimScore) continue;
          aimScore = score;
          preferredTarget = candidate;
        }
        runtime.preferredTargetId = preferredTarget?.id ?? null;
        runtime.nextTargetAcquisitionAt = now + TARGET_DECISION_INTERVAL;
      }
      if (!preferredTarget) continue;
      enemyWorldPosition(preferredPosition, preferredTarget, enemyPosesRef?.current);
      runtime.aimPitch = THREE.MathUtils.clamp(Math.atan2(
        preferredPosition.y + (zombieTargetCount > 0 ? 0.68 : infantryAimHeight(preferredTarget.stance === 'kneeling'))
          - (soldier?.position.y??member.position[1]) - infantryRifleHeight(member.kneeling) * SOLDIER_SCALE,
        Math.hypot(preferredPosition.x - runtime.baseX, preferredPosition.z - runtime.baseZ),
      ), -0.25, 0.25);

      if (runtime.moving || now < runtime.nextShotAt) {
        if (soldier && !runtime.moving) {
          const yaw=Math.atan2(
            -(preferredPosition.x - soldier.position.x),
            -(preferredPosition.z - soldier.position.z),
          );
          soldier.rotation.y=defenseOffsetZ?yaw:turnFootActor(soldier.rotation.y,yaw,delta);
        }
        continue;
      }

      // Estimate the candidate-specific muzzle location for cover tests. The
      // forward offset mirrors the rendered M16 but does not mutate scene
      // matrices, so the final clear/suppression target can be chosen first.
      const soldierX = soldier?.position.x ?? member.position[0];
      const soldierY = soldier?.position.y ?? member.position[1];
      const soldierZ = soldier?.position.z ?? member.position[2];
      const rifle = infantryRifleBind('service', member.kneeling);
      const candidateMuzzleY = soldierY + (
        (body?.position.y ?? 0) + rifle.muzzle[1]
      ) * SOLDIER_SCALE;
      const muzzleForwardOffset = -(
        rifle.muzzle[2] + (body?.position.z ?? 0)
      ) * SOLDIER_SCALE;
      sightOrigin.set(soldierX,candidateMuzzleY,soldierZ);
      let selectedTarget = runtime.selectedTargetId
        ? combatTargetById.get(runtime.selectedTargetId) ?? null
        : null;
      if (selectedTarget) {
        enemyWorldPosition(targetPosition, selectedTarget, enemyPosesRef?.current);
        targetPosition.y += zombieTargetCount > 0 ? 0.68 : infantryAimHeight(selectedTarget.stance === 'kneeling');
        const targetDx = targetPosition.x - soldierX;
        const targetDz = targetPosition.z - soldierZ;
        const horizontalDistance = Math.sqrt(targetDx * targetDx + targetDz * targetDz);
        const muzzleOffsetScale = horizontalDistance > 0.0001
          ? muzzleForwardOffset / horizontalDistance
          : 0;
        candidateMuzzlePosition.set(
          soldierX + targetDx * muzzleOffsetScale,
          candidateMuzzleY,
          soldierZ + targetDz * muzzleOffsetScale,
        );
        if (candidateMuzzlePosition.distanceToSquared(targetPosition)
          > FRIENDLY_MAX_RANGE * FRIENDLY_MAX_RANGE) {
          selectedTarget = null;
        }
      }
      if (!selectedTarget || now >= runtime.nextLineOfSightDecisionAt) {
        selectedTarget = null;
        let suppressionTarget: EnemyCombatant | null = null;
        let selectedScore = Number.POSITIVE_INFINITY;
        let suppressionScore = Number.POSITIVE_INFINITY;
        const preferredTargetIndex = combatTargetIndexById.get(preferredTarget.id) ?? -1;
        for (let enemyIndex = 0; enemyIndex < combatTargets.length; enemyIndex += 1) {
          const candidate = combatTargets[enemyIndex];
          if (!candidate.alive) continue;
          enemyWorldPosition(targetPosition, candidate, enemyPosesRef?.current);
          targetPosition.y += zombieTargetCount > 0 ? 0.68 : infantryAimHeight(candidate.stance === 'kneeling');
          const targetDx = targetPosition.x - soldierX;
          const targetDz = targetPosition.z - soldierZ;
          const horizontalDistance = Math.sqrt(targetDx * targetDx + targetDz * targetDz);
          const muzzleOffsetScale = horizontalDistance > 0.0001
            ? muzzleForwardOffset / horizontalDistance
            : 0;
          candidateMuzzlePosition.set(
            soldierX + targetDx * muzzleOffsetScale,
            candidateMuzzleY,
            soldierZ + targetDz * muzzleOffsetScale,
          );
          const distanceSq = candidateMuzzlePosition.distanceToSquared(targetPosition);
          if (distanceSq > FRIENDLY_MAX_RANGE * FRIENDLY_MAX_RANGE) continue;
          const assignmentPenalty = ((enemyIndex + 3 - (memberIndex % 3)) % 3) * 12;
          const score = distanceSq
            + assignmentPenalty
            + (enemyIndex === preferredTargetIndex ? -8 : 0);
          if (villageBlocksSight(sightOrigin, targetPosition, obstacles)) continue;
          if (score < suppressionScore) {
            suppressionScore = score;
            suppressionTarget = candidate;
          }
          if (score >= selectedScore) continue;
          const obstacleT = findNearestObstacleHit(candidateMuzzlePosition, targetPosition, obstacles);
          if (obstacleT !== null && obstacleT < 0.9) continue;
          if (terrainBlocksCombatSegment(candidateMuzzlePosition, targetPosition)) continue;
          selectedTarget = candidate;
          selectedScore = score;
        }

        // Low field cover may receive suppressive fire; a solid building never
        // qualifies a contact. Swept projectile collision still handles spread.
        selectedTarget ??= suppressionTarget;
        runtime.selectedTargetId = selectedTarget?.id ?? null;
        runtime.nextLineOfSightDecisionAt = now + TARGET_DECISION_INTERVAL;
      }
      if (!selectedTarget) {
        if (soldier) {
          soldier.rotation.y = turnFootActor(soldier.rotation.y,Math.atan2(
            -(preferredPosition.x - soldier.position.x),
            -(preferredPosition.z - soldier.position.z),
          ),delta);
        }
        runtime.nextShotAt = now + 0.45;
        if (!zombieTargetCount) {
          preferredPosition.y+=infantryAimHeight(preferredTarget.stance==='kneeling');
          beginVillageDetour(runtime,member,memberIndex,now,sightOrigin,preferredPosition,obstacles,kitLines,navigationRiver);
        }
        continue;
      }

      enemyWorldPosition(targetPosition, selectedTarget, enemyPosesRef?.current);
      targetPosition.y += zombieTargetCount > 0 ? 0.68 : infantryAimHeight(selectedTarget.stance === 'kneeling');

      // Rotate to the final selected contact, update the complete model hierarchy,
      // and only then sample the rendered flash socket. This keeps rifle, flash,
      // tracer, and damage ray on the same target even when a nearer lane is blocked.
      if (soldier) {
        const aimYaw = Math.atan2(
          -(targetPosition.x - soldier.position.x),
          -(targetPosition.z - soldier.position.z),
        );
        soldier.rotation.y=defenseOffsetZ?aimYaw:turnFootActor(soldier.rotation.y,aimYaw,delta);
        if(Math.abs(Math.sin((aimYaw-soldier.rotation.y)/2))>.16)continue;
      }
      if (soldier && flash) {
        if (rig && body) {
          const selectedPitch = THREE.MathUtils.clamp(Math.atan2(
            targetPosition.y - soldierY - rifle.origin[1] * SOLDIER_SCALE,
            Math.max(.5, Math.hypot(targetPosition.x - soldierX, targetPosition.z - soldierZ)),
          ), -.25, .25);
          rig.spine.rotation.x += selectedPitch - runtime.aimPitch;
          runtime.aimPitch = selectedPitch;
          applyInfantryWeaponPose(body, rig);
        }
        soldier.updateWorldMatrix(true, true);
        flash.getWorldPosition(muzzlePosition);
      } else {
        const targetDx = targetPosition.x - soldierX;
        const targetDz = targetPosition.z - soldierZ;
        const horizontalDistance = Math.sqrt(targetDx * targetDx + targetDz * targetDz);
        const muzzleOffsetScale = horizontalDistance > 0.0001
          ? muzzleForwardOffset / horizontalDistance
          : 0;
        muzzlePosition.set(
          soldierX + targetDx * muzzleOffsetScale,
          candidateMuzzleY,
          soldierZ + targetDz * muzzleOffsetScale,
        );
      }
      sightOrigin.y=muzzlePosition.y;
      if (villageBlocksRifle(sightOrigin,muzzlePosition,targetPosition,obstacles)) {
        runtime.selectedTargetId=null;
        runtime.nextLineOfSightDecisionAt=now;
        runtime.nextShotAt=now+.32;
        if (!zombieTargetCount) beginVillageDetour(runtime,member,memberIndex,now,sightOrigin,targetPosition,obstacles,kitLines,navigationRiver);
        continue;
      }
      shotDirection.copy(targetPosition).sub(muzzlePosition).normalize();
      const shotIndex = runtime.shotIndex++;
      shotDirection.x += (deterministicNoise(member.id, shotIndex, 1) - 0.5) * member.accuracy * 2;
      shotDirection.y += (deterministicNoise(member.id, shotIndex, 2) - 0.5) * member.accuracy;
      shotDirection.z += (deterministicNoise(member.id, shotIndex, 3) - 0.5) * member.accuracy * 2;
      shotDirection.normalize();

      if (spawnFriendlyRound(muzzlePosition, shotDirection, member.id)) {
        if(member.arrival&&soldier)soldier.userData.reliefRounds=(soldier.userData.reliefRounds??0)+1;
        if (flash) { flash.visible = true; ejectBrass(flash, 'soldier'); }
        runtime.flashUntil = now + 0.075;
        runtime.recoilUntil = now + 0.11;
        onFriendlyFire?.({
          soldierId: member.id,
          targetEnemyId: selectedTarget.id,
          position: muzzlePosition.clone(),
          direction: shotDirection.clone(),
        });
      }
      runtime.burstRemaining -= 1;
      if (runtime.burstRemaining > 0) {
        runtime.nextShotAt = now + 0.105 + deterministicNoise(member.id, shotIndex, 5) * 0.065;
      } else {
        runtime.burstRemaining = member.burstSize;
        runtime.nextShotAt = now + member.fireInterval * (
          0.9 + deterministicNoise(member.id, shotIndex, 4) * 0.25
        );
      }
    }

    let tracerCount = 0;
    for (let projectileIndex = 0; projectileIndex < projectilePool.length; projectileIndex += 1) {
      const projectile = projectilePool[projectileIndex];
      if (!projectile.active) continue;
      projectile.previousPosition.copy(projectile.position);
      projectile.position.addScaledVector(projectile.direction, FRIENDLY_RIFLE_SPEED * delta);
      projectile.lifetime += delta;

      const expired=projectile.lifetime >= FRIENDLY_RIFLE_LIFETIME;
      const moundT=expired?null:firstTerrainCombatHit(projectile.previousPosition,projectile.position);
      if (expired || moundT!==null) {
        if(moundT!==null)onCoverHit?.(impactPosition.lerpVectors(projectile.previousPosition,projectile.position,moundT));
        projectile.active = false;
        continue;
      }

      const obstacleHitT = findNearestObstacleHit(projectile.previousPosition, projectile.position, obstacles);
      const enemyHit = findNearestLivingEnemyHit(
        projectile.previousPosition,
        projectile.position,
        enemies,
        undefined,
        enemyPosesRef?.current,
      );
      const zombieHit = zombiePosesRef
        ? findNearestLivingZombieHit(
            projectile.previousPosition,
            projectile.position,
            zombies,
            zombiePosesRef.current,
          )
        : null;

      if (zombieHit
        && (!enemyHit || zombieHit.t <= enemyHit.t)
        && (obstacleHitT === null || zombieHit.t < obstacleHitT)) {
        impactPosition.copy(zombieHit.point);
        onZombieHit?.({
          soldierId: projectile.soldierId,
          zombieId: zombieHit.zombie.id,
          bulletDirection: projectile.direction,
          position: impactPosition.clone(),
          // The archive sprinter keeps its original one-shell interception
          // window. Regular opponents need covering fire from the player.
          damage: zombieHit.zombie.archiveRunner ? 5 : FRIENDLY_ZOMBIE_RIFLE_DAMAGE,
        });
        projectile.active = false;
        continue;
      }
      if (enemyHit
        && (!zombieHit || enemyHit.t < zombieHit.t)
        && (obstacleHitT === null || enemyHit.t < obstacleHitT)) {
        impactPosition.copy(enemyHit.point);
        onEnemyHit?.({
          soldierId: projectile.soldierId,
          enemyId: enemyHit.enemy.id,
          position: impactPosition.clone(),
          damage: FRIENDLY_RIFLE_DAMAGE,
        });
        projectile.active = false;
        continue;
      }
      if (obstacleHitT !== null) {
        onCoverHit?.(impactPosition.lerpVectors(projectile.previousPosition,projectile.position,obstacleHitT));
        projectile.active = false;
        continue;
      }

      tracers.write(tracerCount++, projectile.position, projectile.direction, projectile.lifetime * FRIENDLY_RIFLE_SPEED);
    }

    tracers.submit(tracerCount);
  });

  return (
    <group dispose={null}>
      <StaticFightingPositions offsetZ={defenseOffsetZ}/>

      {squad.map((member, index) => (
        <SoldierModel
          key={member.id}
          member={member}
          alive={friendlies.some(friendly => friendly.id === member.id && friendly.alive)}
          index={index}
          soldierRefs={soldierRefs}
          bodyRefs={bodyRefs}
          flashRefs={flashRefs}
          rigRefs={rigRefs}
          obstacles={obstacles}
        />
      ))}

      <RoundTracers batch={tracers} capacity={FRIENDLY_PROJECTILE_CAPACITY} />
    </group>
  );
}
