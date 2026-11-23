import {beginInfantryFall,poseInfantryFall} from './infantryFall';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {seatCharacterFlame,type CharacterBurns} from './CharacterFires';
import { createGhostInfantryMaterial } from './ghostInfantrySurface';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {useEjectBrass} from './SpentBrass';
import { makeSmgFlash } from './ghostRoundArt';
import { RoundTracers, useRoundTracers } from './RoundTracers';
import { applyPaintedFinish } from './paintedMaterials';
import { buildBrushScreenGeometry, buildFightingPositionGeometry } from './fieldGroundDetails';
import { chooseVillageWaypoint, safeVillageLeg, villageBlocksRifle, villageBlocksSight } from '../../lib/villageCover';
import {advanceFieldWaypoint,footLaneClear,footLegDuration,patrolWaypoint,turnFootActor,type FootprintLine} from '../../lib/infantryPatrol';
import {fieldSupplyFootprints} from '../../lib/fieldSupplyFootprint';
import {InfantryInsignia} from './InfantryInsignia';
import type { RiverStation } from './riverLayout';
import { createInfantryGeometry, addInfantrySkinAttributes, createInfantryRig, bindInfantryRig, releaseInfantryRig, updateInfantryRig, infantrySocketPosition, type InfantryRig, INFANTRY_MATERIAL } from './infantryGeometry';
import { INFANTRY_WORLD_SCALE, infantryAimHeight, infantryRifleHeight, infantryRifleBind, fieldRifleStyle } from '../../lib/infantryMetrics';
import {
  CombatObstacle,
  EnemyCombatant,
  EnemyCombatPose,
  EnemyFriendlyHitEvent,
  EnemyFireEvent,
  EnemyTankHitEvent,
  ENEMY_RIFLE_DAMAGE,
  ENEMY_RIFLE_INFANTRY_DAMAGE,
  ENEMY_RIFLE_LIFETIME,
  ENEMY_RIFLE_SPEED,
  findNearestFriendlyCoverHit,
  findNearestLivingFriendlyHit,
  findNearestObstacleHit,
  FriendlyCombatant,
  FriendlyCombatPose,
  hashCombatSession,
  segmentSphereIntersection,
  firstTerrainCombatHit,
} from '../../lib/combat';

const HOSTILE_PROJECTILE_CAPACITY = 48;
const TANK_HIT_RADIUS = 0.95;
const MAX_ENGAGEMENT_RANGE = 48;
const TARGET_DECISION_INTERVAL = 1 / 12;

const UNIFORM_VARIANT_COUNT = 3;
const VC_FIELD_INK = createGhostInfantryMaterial(INFANTRY_MATERIAL, 'vc');

const FIELD_COVER_MATERIAL = applyPaintedFinish(new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 1,
  metalness: 0,
  flatShading: true,
}), { scale: 1.2, strength: 0.75, edge: 0.5 });

const MUZZLE_FLASH_GEOMETRY = makeSmgFlash(.20,.32);
const MUZZLE_FLASH_MATERIAL = new THREE.MeshBasicMaterial({
  vertexColors: true,
  depthWrite: false,
  toneMapped: false,
});

interface HostileProjectile {
  active: boolean;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  direction: THREE.Vector3;
  lifetime: number;
  shooterId: string;
}

interface FighterRuntime {
  appearedAt: number;
  nextShotAt: number;
  shotIndex: number;
  flashUntil: number;
  baseOffsetX: number;
  baseOffsetZ: number;
  moveFromX: number;
  moveFromZ: number;
  moveToX: number;
  moveToZ: number;
  moveStartedAt: number;
  moveEndsAt: number;
  moving: boolean;
  patrolLeg:number;
  nextPatrolAt:number;
  routeObstacles:readonly CombatObstacle[];
  targetFriendlyId: string | null;
  targetShotGroup: number;
  targetsFriendlies: boolean;
  nextTargetDecisionAt: number;
  screened: boolean;
  nextDetourAt: number;
}

function startEnemyLeg(r:FighterRuntime,x:number,z:number,now:number,obstacles:readonly CombatObstacle[],pace=1.2){
  r.moveFromX=r.baseOffsetX;r.moveFromZ=r.baseOffsetZ;r.moveToX=x;r.moveToZ=z;
  r.moveStartedAt=now;r.moveEndsAt=now+footLegDuration(r.baseOffsetX,r.baseOffsetZ,x,z,pace);
  r.moving=true;r.nextShotAt=r.moveEndsAt+.23;r.routeObstacles=obstacles;
}


export interface VietCongCombatantsProps {
  burns?:CharacterBurns;
  enemies: readonly EnemyCombatant[];
  enemyPosesRef?: RefObject<Map<string, EnemyCombatPose>>;
  friendliesRef: RefObject<FriendlyCombatant[]>;
  friendlyPosesRef: RefObject<Map<string, FriendlyCombatPose>>;
  tankRef: RefObject<THREE.Group | null>;
  /** Optional hut/structure volumes. Enemy rounds stop safely without touching file handlers. */
  obstacles?: readonly CombatObstacle[];
  navigationRiver?: RiverStation[];
  onTankHit?: (event: EnemyTankHitEvent) => void;
  onCoverHit?: (position: THREE.Vector3) => void;
  onFriendlyHit?: (event: EnemyFriendlyHitEvent) => void;
  onEnemyFire?: (event: EnemyFireEvent) => void;
  enabled?: boolean;
  tankTargetEnabled?: boolean;
  fieldAdvance?: boolean;
  maxEngagementRange?: number;
}

type VectorTuple = [number, number, number];

function deterministicUnit(seed: number, salt: number) {
  const value = Math.sin(seed * 0.000117 + salt * 93.719) * 43758.5453123;
  return value - Math.floor(value);
}

function colorizeGeometry(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const vertexCount = geometry.getAttribute('position').count;
  const vertexColors = new Float32Array(vertexCount * 3);
  const resolved = new THREE.Color(color);
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 3;
    vertexColors[offset] = resolved.r;
    vertexColors[offset + 1] = resolved.g;
    vertexColors[offset + 2] = resolved.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
  return geometry;
}

function asNonIndexed(geometry: THREE.BufferGeometry) {
  if (!geometry.index) return geometry;
  const nonIndexed = geometry.toNonIndexed();
  geometry.dispose();
  return nonIndexed;
}

function transformedPart(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  position: VectorTuple,
  rotation: VectorTuple = [0, 0, 0],
  scale: VectorTuple = [1, 1, 1],
) {
  const normalizedGeometry = asNonIndexed(geometry);
  const transform = new THREE.Object3D();
  transform.position.set(...position);
  transform.rotation.set(...rotation);
  transform.scale.set(...scale);
  transform.updateMatrix();
  normalizedGeometry.applyMatrix4(transform.matrix);
  return colorizeGeometry(normalizedGeometry, color);
}

function cylinderPart(
  start: VectorTuple,
  end: VectorTuple,
  radius: number,
  color: THREE.ColorRepresentation,
  radialSegments = 6,
) {
  const startPoint = new THREE.Vector3(...start);
  const endPoint = new THREE.Vector3(...end);
  const direction = endPoint.clone().sub(startPoint);
  const length = direction.length();
  const midpoint = startPoint.clone().lerp(endPoint, 0.5);
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  const transform = new THREE.Matrix4().compose(
    midpoint,
    orientation,
    new THREE.Vector3(1, 1, 1),
  );
  const geometry = asNonIndexed(new THREE.CylinderGeometry(radius * 0.86, radius, length, radialSegments));
  geometry.applyMatrix4(transform);
  return colorizeGeometry(geometry, color);
}

function mergeColoredParts(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Unable to merge combatant geometry');
  for (const part of parts) part.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Tapered, bevelled visual wood fitted to the existing prop anchors. */
function carvedFurniture(rings: Array<[number, number, number, number]>, color: string) {
  const chamfer = [[-.68,-1],[.68,-1],[1,-.58],[.93,.60],[.62,1],[-.62,1],[-.93,.60],[-1,-.58]];
  const positions: number[] = [], triangles: number[] = [];
  for (const [r, [z, width, low, high]] of rings.entries()) {
    for (const [cx, cy] of chamfer) positions.push(cx * width * .5, THREE.MathUtils.lerp(low, high, (cy + 1) * .5), z);
    if (r > 0) for (let col = 0; col < 8; ++col) {
      const a = (r - 1) * 8 + col, b = (r - 1) * 8 + (col + 1) % 8;
      triangles.push(a, b, a + 8, b, b + 8, a + 8);
    }
  }
  const back = (rings.length - 1) * 8;
  for (let col = 1; col < 7; ++col) triangles.push(0, col + 1, col, back, back + col, back + col + 1);
  const shape = new THREE.BufferGeometry();
  shape.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shape.setIndex(triangles);
  const wood = asNonIndexed(shape);
  wood.computeVertexNormals();
  colorizeGeometry(wood, color);
  const pos = wood.getAttribute('position'), paint = wood.getAttribute('color');
  for (let i = 0; i < paint.count; ++i) {
    const brush = .93 + .13 * Math.sin(pos.getY(i) * 101 + pos.getZ(i) * 4.5);
    paint.setXYZ(i, paint.getX(i) * brush, paint.getY(i) * (.30 + .70 * brush), paint.getZ(i) * (.54 + .46 * brush));
  }
  return wood;
}

export function buildVietCongRifleParts(sksPattern: boolean) {
  const x = 0, rifleY = 0;
  const wood = sksPattern ? '#80522d' : '#714425';
  const woodHighlight = sksPattern ? '#9a6938' : '#87582c';
  const gunmetal = '#424c50';
  const metalEdge = '#687772';
  const parts: THREE.BufferGeometry[] = [];

  if (sksPattern) {
    // SKS: a continuous wood furniture line, compact fixed magazine, and long barrel.
    parts.push(
      carvedFurniture([[-.148,.074,-.044,.036],[-.071,.090,-.051,.049],[.033,.067,-.050,.032],
        [.159,.098,-.066,.057],[.232,.094,-.061,.054]], wood),
      transformedPart(new RoundedBoxGeometry(0.105, 0.125, 0.025, 1, 0.009), '#463d30', [x, rifleY, 0.237], [-0.025, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.086, 0.09, 0.16), gunmetal, [x, rifleY + 0.012, -0.15]),
      transformedPart(new THREE.BoxGeometry(.076, .009, .137), metalEdge, [x, rifleY + .057, -.15]),
      carvedFurniture([[-.478,.054,-.030,.028],[-.429,.076,-.043,.033],[-.263,.085,-.044,.043],
        [-.192,.079,-.038,.039]], woodHighlight),
      transformedPart(new THREE.BoxGeometry(0.065, 0.09, 0.075), gunmetal, [x, rifleY - 0.077, -0.145], [0.08, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.052, 0.042, 0.058), metalEdge, [x, rifleY - 0.132, -0.12], [0.12, 0, 0]),
    );
  } else {
    // AK: broad wood stock and handguard with a strongly readable curved magazine.
    parts.push(
      carvedFurniture([[-.083,.068,-.038,.039],[-.029,.069,-.039,.039],[.073,.082,-.040,.035],
        [.170,.099,-.068,.055],[.227,.105,-.068,.057]], wood),
      transformedPart(new RoundedBoxGeometry(0.11, 0.128, 0.026, 1, 0.009), '#42392c', [x, rifleY - 0.004, 0.222], [-0.055, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.09, 0.105, 0.19), gunmetal, [x, rifleY + 0.006, -0.14]),
      transformedPart(new THREE.BoxGeometry(.077, .010, .157), metalEdge, [x, rifleY + .058, -.14]),
      carvedFurniture([[-.445,.065,-.033,.031],[-.401,.078,-.046,.038],[-.268,.085,-.047,.044],
        [-.226,.080,-.032,.042]], woodHighlight),
      transformedPart(new RoundedBoxGeometry(0.053, 0.115, 0.055, 1, 0.014), wood, [x, rifleY - 0.1, -0.035], [-0.28, 0, 0]),
      // Three overlapping facets read as the familiar rear-curving AK magazine.
      transformedPart(new THREE.BoxGeometry(0.07, 0.105, 0.07), '#272820', [x, rifleY - 0.092, -0.135], [-0.16, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.068, 0.095, 0.068), '#343126', [x, rifleY - 0.178, -0.106], [-0.4, 0, 0]),
      transformedPart(new THREE.BoxGeometry(0.064, 0.078, 0.064), '#493922', [x, rifleY - 0.242, -0.05], [-0.57, 0, 0]),
      transformedPart(new THREE.CylinderGeometry(0.013, 0.016, 0.255, 6), metalEdge, [x, rifleY + 0.062, -0.37], [Math.PI / 2, 0, 0]),
    );
  }

  // Both patterns share a long blued barrel, rear sight, front sight, and muzzle crown.
  parts.push(
    transformedPart(new THREE.CylinderGeometry(0.013, 0.017, 0.295, 7), gunmetal, [x, rifleY + 0.012, -0.577], [Math.PI / 2, 0, 0]),
    transformedPart(new THREE.CylinderGeometry(0.018, 0.022, 0.052, 6), metalEdge, [x, rifleY + 0.012, -0.742], [Math.PI / 2, 0, 0]),
    transformedPart(new THREE.BoxGeometry(0.06, 0.025, 0.035), gunmetal, [x, rifleY + 0.048, -0.658]),
    transformedPart(new THREE.BoxGeometry(0.017, 0.075, 0.018), gunmetal, [x, rifleY + 0.092, -0.658]),
    transformedPart(new THREE.BoxGeometry(0.055, 0.02, 0.04), metalEdge, [x, rifleY + 0.07, -0.205], [-0.12, 0, 0]),
  );
  // Purely visible set dressing at the two already-fitted hand anchors.
  // The older silhouette, animation sockets, damage, aim and collision
  // remain unchanged. Leave actual air around the index finger rather than
  // painting another dark rectangle straight across its bent tip.
  const contour=sksPattern?
    [[-.024,-.041],[-.033,-.078],[-.058,-.085],[-.088,-.075],[-.101,-.045]]:
    [[-.045,-.046],[-.050,-.097],[-.065,-.110],[-.101,-.112],[-.122,-.094],[-.128,-.043]];
  const rail=contour.map(([z,y])=>new THREE.Vector3(0,y,z));
  parts.push(transformedPart(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail,false,'centripetal'),12,.0065,6,false),
    '#83918d',[0,0,0],[0,0,0],[1.32,1,1]));
  for(const side of [-1,1]){
    // Stamped recess and rubbed crown on the side facing the operator;
    // the small studs turn under real scene light from either azimuth.
    const sideX=sksPattern?.043:.045;
    parts.push(transformedPart(new THREE.BoxGeometry(.002,.004,.117),'#83938d',[side*(sideX+.001),.041,-.144]));
    for(const z of [-.179,-.109])
      parts.push(transformedPart(new THREE.CylinderGeometry(.0055,.0065,.004,6),'#989a81',
        [side*(sideX+.001),.014,z],[0,0,Math.PI*.5]));
  }
  return parts;
}

function buildFighterGeometry(
  kneeling: boolean,
  headwear: EnemyCombatant['headwear'],
  uniformVariant: number,
) {
  const body = createInfantryGeometry({ faction: 'vc', kneeling, variant: uniformVariant, headwear, fieldUniform: true });
  const rifle = infantryRifleBind(fieldRifleStyle('vc', uniformVariant), kneeling);
  const rifleParts = buildVietCongRifleParts(uniformVariant % 3 === 0);
  // Human surfaces are smooth-normal, while each rifle keeps its manufactured
  // hard edges. Merge them once; the runtime still draws one mesh per fighter.
  rifleParts.forEach(part => {
    part.deleteAttribute('uv');
    part.scale(0.68, 1, rifle.scaleZ);
    part.translate(...rifle.origin);
    part.userData.infantrySurface = 7; // Rigid prop, outside the fabric finish.
    addInfantrySkinAttributes(part, 1);
    part.setAttribute('fieldFaceUV',new THREE.Uint16BufferAttribute(new Uint16Array(part.getAttribute('position').count*2),2,true));
    part.setAttribute('fieldHandArt',new THREE.Uint8BufferAttribute(new Uint8Array(part.getAttribute('position').count*2),2,true));
  });
  const result=mergeColoredParts([body, ...rifleParts]);
  result.userData.fieldPortrait=body.userData.fieldPortrait;
  result.userData.fieldSleeveBinds=body.userData.fieldSleeveBinds;
  result.userData.scoutNeckSeat=body.userData.scoutNeckSeat;
  result.userData.scoutRiceRoll=body.userData.scoutRiceRoll;
  result.userData.localScoutSatchel=body.userData.localScoutSatchel;
  result.userData.fieldSuspenderRanges=body.userData.fieldSuspenderRanges;
  return result;
}

function buildCutLogGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const addLog = (y: number, z: number, length: number, angle: number, radius: number) => {
    const halfX = Math.cos(angle) * length * 0.5;
    const halfZ = Math.sin(angle) * length * 0.5;
    parts.push(
      cylinderPart([-halfX, y, z - halfZ], [halfX, y, z + halfZ], radius, '#4b3420', 8),
      cylinderPart([-halfX * 1.01, y, z - halfZ * 1.01], [halfX * 1.01, y, z + halfZ * 1.01], radius * 0.72, '#765331', 8),
    );
  };
  addLog(0.21, -0.48, 1.18, 0.04, 0.085);
  addLog(0.33, -0.45, 1.02, -0.08, 0.072);

  // Short broken branch stubs make the silhouette read as field-cut timber.
  parts.push(
    cylinderPart([-0.35, 0.27, -0.46], [-0.28, 0.39, -0.43], 0.026, '#3b2a1c', 6),
    cylinderPart([0.31, 0.34, -0.46], [0.4, 0.43, -0.42], 0.022, '#3b2a1c', 6),
  );
  return mergeColoredParts(parts);
}

function buildBambooScreenGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const bambooColors = ['#7f7842', '#666936', '#99905a'];
  for (let index = 0; index < 6; index += 1) {
    const x = -0.61 + index * 0.245;
    const height = 0.35 + (index % 3) * 0.055;
    const lean = (index % 2 ? 1 : -1) * 0.055;
    parts.push(cylinderPart(
      [x - lean, 0.06, -0.46 + (index % 2) * 0.035],
      [x + lean, height, -0.46 - (index % 2) * 0.025],
      0.018,
      bambooColors[index % bambooColors.length],
      6,
    ));
  }
  parts.push(
    cylinderPart([-0.67, 0.16, -0.47], [0.67, 0.2, -0.46], 0.017, '#5a5630', 6),
    cylinderPart([-0.66, 0.3, -0.46], [0.66, 0.27, -0.47], 0.016, '#817845', 6),
  );
  return mergeColoredParts(parts);
}

const FIGHTER_GEOMETRIES = Array.from({ length: 2 }, (_, stanceIndex) => (
  Array.from({ length: 2 }, (_, headwearIndex) => (
    Array.from({ length: UNIFORM_VARIANT_COUNT }, (_, paletteIndex) => (
      buildFighterGeometry(
        stanceIndex === 1,
        headwearIndex === 0 ? 'pith' : 'boonie',
        paletteIndex,
      )
    ))
  ))
));

const FIGHTING_POSITION_GEOMETRY = buildFightingPositionGeometry();
const CUT_LOG_GEOMETRY = buildCutLogGeometry();
const BAMBOO_SCREEN_GEOMETRY = buildBambooScreenGeometry();
const BRUSH_SCREEN_GEOMETRY = buildBrushScreenGeometry();

function shotNoise(enemyId: string, shotIndex: number, salt: number) {
  const seed = hashCombatSession(enemyId);
  const value = Math.sin(seed * 0.00013 + shotIndex * 81.721 + salt * 19.117) * 43758.5453;
  return value - Math.floor(value);
}

interface FighterProps {
  enemy: EnemyCombatant;
  obstacles:readonly CombatObstacle[];
  index: number;
  fighterRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  muzzleFlashRefs: React.MutableRefObject<Array<THREE.Mesh | null>>;
  rigRefs: React.MutableRefObject<Array<InfantryRig | null>>;
}

interface CoverPlacement {
  position: VectorTuple;
  rotation: number;
  scale: VectorTuple;
}

interface StaticCoverBatchProps {
  geometry: THREE.BufferGeometry;
  placements: readonly CoverPlacement[];
  castShadow?: boolean;
}

function StaticCoverBatch({ geometry, placements, castShadow = false }: StaticCoverBatchProps) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    placements.forEach((placement, index) => {
      position.set(...placement.position);
      quaternion.setFromAxisAngle(up, placement.rotation);
      scale.set(...placement.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [matrix, placements, position, quaternion, scale, up]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, FIELD_COVER_MATERIAL, placements.length]}
      castShadow={castShadow}
      receiveShadow
      dispose={null}
    />
  );
}

function rotateCoverOffset(
  position: EnemyCombatant['position'],
  localX: number,
  localZ: number,
  rotation: number,
): VectorTuple {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    position[0] + cos * localX + sin * localZ,
    position[1],
    position[2] - sin * localX + cos * localZ,
  ];
}

const VietCongFieldCover = memo(function VietCongFieldCover({
  enemies,
}: Pick<VietCongCombatantsProps, 'enemies'>) {
  const placements = useMemo(() => {
    const fightingPositions: CoverPlacement[] = [];
    const logs: CoverPlacement[] = [];
    const bamboo: CoverPlacement[] = [];
    const brush: CoverPlacement[] = [];

    enemies.forEach((enemy, index) => {
      if(enemy.tunnel)return;
      const seed = hashCombatSession(enemy.id);
      // Static fighting positions face the original southern approach. Players
      // who circle around the flank can bypass the low frontal protection.
      const baseRotation = Math.atan2(enemy.position[0], enemy.position[2] + 12);
      // Keep the earth lip aligned exactly with the inexpensive collision model.
      const rotation = baseRotation;
      fightingPositions.push({
        position: enemy.position,
        rotation,
        scale: [
          0.92 + deterministicUnit(seed, 81) * 0.15,
          0.9 + deterministicUnit(seed, 82) * 0.16,
          0.92 + deterministicUnit(seed, 83) * 0.14,
        ],
      });

      // Alternating timber and bamboo reinforce select cells without producing
      // an implausible identical fortification around every combatant.
      if (index % 3 !== 1) {
        logs.push({
          position: enemy.position,
          rotation: rotation + (deterministicUnit(seed, 84) - 0.5) * 0.08,
          scale: [0.9 + deterministicUnit(seed, 85) * 0.18, 0.92, 1],
        });
      }
      if (Math.abs(enemy.position[0]) > 14 || index < 3 || index >= 10) {
        bamboo.push({
          position: enemy.position,
          rotation: rotation + (deterministicUnit(seed, 86) - 0.5) * 0.12,
          scale: [0.9 + deterministicUnit(seed, 87) * 0.18, 0.88 + deterministicUnit(seed, 88) * 0.18, 1],
        });
      }

      // Two offset brush clumps leave a clean shot window through the middle.
      // Forward and outer-flank cells get a third clump for denser concealment.
      const brushCount = index < 4 || Math.abs(enemy.position[0]) > 14 ? 3 : 2;
      for (let brushIndex = 0; brushIndex < brushCount; brushIndex += 1) {
        const side = brushIndex === 0 ? -1 : brushIndex === 1 ? 1 : (index % 2 ? -1 : 1);
        const localX = side * (0.66 + deterministicUnit(seed, 90 + brushIndex) * 0.24);
        const localZ = brushIndex < 2
          ? 0.02 + deterministicUnit(seed, 94 + brushIndex) * 0.25
          : -0.4 + deterministicUnit(seed, 96) * 0.18;
        brush.push({
          position: rotateCoverOffset(enemy.position, localX, localZ, rotation),
          rotation: rotation + deterministicUnit(seed, 100 + brushIndex) * Math.PI,
          scale: [
            0.84 + deterministicUnit(seed, 104 + brushIndex) * 0.34,
            0.9 + deterministicUnit(seed, 108 + brushIndex) * 0.28,
            0.84 + deterministicUnit(seed, 112 + brushIndex) * 0.3,
          ],
        });
      }
    });

    return { fightingPositions, logs, bamboo, brush };
  }, [enemies]);

  return (
    <group dispose={null}>
      <StaticCoverBatch geometry={FIGHTING_POSITION_GEOMETRY} placements={placements.fightingPositions} castShadow />
      <StaticCoverBatch geometry={CUT_LOG_GEOMETRY} placements={placements.logs} castShadow />
      <StaticCoverBatch geometry={BAMBOO_SCREEN_GEOMETRY} placements={placements.bamboo} />
      <StaticCoverBatch geometry={BRUSH_SCREEN_GEOMETRY} placements={placements.brush} />
    </group>
  );
}, (previous, next) => (
  previous.enemies.length === next.enemies.length
  && previous.enemies.every((enemy, index) => {
    const nextEnemy = next.enemies[index];
    return enemy.id === nextEnemy?.id
      && enemy.position[0] === nextEnemy.position[0]
      && enemy.position[1] === nextEnemy.position[1]
      && enemy.position[2] === nextEnemy.position[2];
  })
));

// Keep the last live rig until its collapse finishes, even if this kill ends combat.
function HostileFall({index,fighterRefs,rigRefs,onFinished}:Pick<FighterProps,'index'|'fighterRefs'|'rigRefs'> & {
  onFinished:(finished:boolean)=>void
}) {
  const fall=useRef<ReturnType<typeof beginInfantryFall>|null>(null);
  useFrame(({clock})=>{
    const body=fighterRefs.current[index];
    if(!body)return;
    fall.current??=beginInfantryFall(body,rigRefs.current[index],clock.elapsedTime);
    if(!poseInfantryFall(body,fall.current,clock.elapsedTime,index))onFinished(true);
  });
  return null;
}

function VietCongFighterSlot(props:FighterProps) {
  const [finished,setFinished]=useState(!props.enemy.alive);
  useLayoutEffect(()=>{if(props.enemy.alive)setFinished(false);},[props.enemy.alive]);
  if(!props.enemy.alive&&(finished||props.enemy.crushed))return null;
  return <>
    <VietCongFighter {...props}/>
    {!props.enemy.alive&&<HostileFall index={props.index} fighterRefs={props.fighterRefs}
      rigRefs={props.rigRefs} onFinished={setFinished}/>}
  </>;
}

const VietCongFighter = memo(function VietCongFighter({
  enemy,
  obstacles,
  index,
  fighterRefs,
  muzzleFlashRefs,
  rigRefs,
}: FighterProps) {
  const kneeling = enemy.stance === 'kneeling';
  const stanceIndex = kneeling ? 1 : 0;
  const headwearIndex = enemy.headwear === 'pith' ? 0 : 1;
  const geometry = FIGHTER_GEOMETRIES[stanceIndex][headwearIndex][
    enemy.uniformVariant % UNIFORM_VARIANT_COUNT
  ];
  const seed = hashCombatSession(enemy.id);
  const bodyWidth = (0.94 + deterministicUnit(seed, 21) * 0.07) * INFANTRY_WORLD_SCALE;
  const bodyHeight = (0.94 + deterministicUnit(seed, 22) * 0.07) * INFANTRY_WORLD_SCALE;
  const rifle = infantryRifleBind(fieldRifleStyle('vc', enemy.uniformVariant), kneeling);
  const skinRef = useRef<THREE.SkinnedMesh>(null);
  const rig = useMemo(() => {
    const model = createInfantryRig(kneeling);
    if (index === 0) model.head.name = 'enemy-field-head-review';
    return model;
  }, [index, kneeling]);
  useLayoutEffect(() => {
    if (!skinRef.current) return;
    rigRefs.current[index] = rig;
    const unbind = bindInfantryRig(skinRef.current, rig);
    return () => { unbind(); rigRefs.current[index] = null; };
  }, [index, rig, rigRefs]);
  useEffect(() => () => releaseInfantryRig(rig), [rig]);

  return (
    <group position={enemy.position} dispose={null}>
      <group
        ref={node => { fighterRefs.current[index] = node; }}
        name={index === 0 ? 'enemy-infantry-review' : enemy.id}
        position-y={enemy.tunnel?-.76:0}
        scale={[bodyWidth, bodyHeight, bodyWidth]}
      >
        <InfantryInsignia hostile kneeling={kneeling} pelvis={rig.root} obstacles={obstacles}/>
        <skinnedMesh
          ref={skinRef}
          name="vc-field-infantry-volume"
          geometry={geometry}
          material={VC_FIELD_INK}
          castShadow receiveShadow
        />
        <mesh
          ref={node => { muzzleFlashRefs.current[index] = node; }}
          geometry={MUZZLE_FLASH_GEOMETRY}
          material={MUZZLE_FLASH_MATERIAL}
          position={rifle.muzzle}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          renderOrder={85}
        />
      </group>
    </group>
  );
}, (previous, next) => (
  previous.index === next.index
  && previous.obstacles===next.obstacles
  && previous.enemy.id === next.enemy.id
  && previous.enemy.alive === next.enemy.alive
  && previous.enemy.stance === next.enemy.stance
  && previous.enemy.headwear === next.enemy.headwear
  && previous.enemy.uniformVariant === next.enemy.uniformVariant
  && previous.enemy.position[0] === next.enemy.position[0]
  && previous.enemy.position[1] === next.enemy.position[1]
  && previous.enemy.position[2] === next.enemy.position[2]
));

export function VietCongCombatants({
  burns,
  enemies,
  enemyPosesRef,
  friendliesRef,
  friendlyPosesRef,
  tankRef,
  obstacles = [],
  navigationRiver,
  onTankHit,
  onCoverHit,
  onFriendlyHit,
  onEnemyFire,
  enabled = true,
  tankTargetEnabled = true,
  fieldAdvance = false,
  maxEngagementRange = MAX_ENGAGEMENT_RANGE,
}: VietCongCombatantsProps) {
  const fighterRefs = useRef<Array<THREE.Group | null>>([]);
  const rigRefs = useRef<Array<InfantryRig | null>>([]);
  const ejectBrass = useEjectBrass();
  const muzzleFlashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const tracers = useRoundTracers();
  const runtimeByEnemyRef = useRef(new Map<string, FighterRuntime>());
  const kitLines=useMemo(()=>fieldSupplyFootprints(0),[]);
  const coverLines=useMemo(()=>enemies.filter(e=>!e.tunnel).map(({position:[x,,z]}):FootprintLine=>{
    // Low timber and bamboo face the entry; leave the open back and sides
    // of the pocket available instead of walking through its front wall.
    const a=Math.atan2(x,z+12),c=Math.cos(a),s=Math.sin(a);
    return {ax:x-.64*c-.46*s,az:z+.64*s-.46*c,bx:x+.64*c-.46*s,bz:z-.64*s-.46*c,radius:.25};
  }),[enemies]);
  const livingFriendliesRef = useRef<FriendlyCombatant[]>([]);
  const livingFriendlyByIdRef = useRef(new Map<string, FriendlyCombatant>());
  useLayoutEffect(() => {
    const poses = enemyPosesRef?.current;
    if (!poses) return;
    poses.clear();
    return () => { poses.clear(); };
  }, [enemyPosesRef, enabled]);
  useLayoutEffect(() => {
    const poses = enemyPosesRef?.current;
    if (!poses) return;
    const present = new Set(enemies.filter(enemy => enemy.alive).map(enemy => enemy.id));
    for (const id of poses.keys()) if (!present.has(id)) poses.delete(id);
    for (const id of runtimeByEnemyRef.current.keys()) if (!present.has(id)) runtimeByEnemyRef.current.delete(id);
  }, [enemies, enemyPosesRef]);

  const projectilePool = useMemo<HostileProjectile[]>(() => (
    Array.from({ length: HOSTILE_PROJECTILE_CAPACITY }, () => ({
      active: false,
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      lifetime: 0,
      shooterId: '',
    }))
  ), []);

  const tankCenter = useMemo(() => new THREE.Vector3(), []);
  const targetCenter = useMemo(() => new THREE.Vector3(), []);
  const sightOrigin = useMemo(() => new THREE.Vector3(), []);
  const muzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const muzzleBind = useMemo(() => new THREE.Vector3(), []);
  const flashRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), []);
  const aimDirection = useMemo(() => new THREE.Vector3(), []);
  const impactPosition = useMemo(() => new THREE.Vector3(), []);
  const spawnHostileRound = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    shooterId: string,
  ) => {
    for (let index = 0; index < projectilePool.length; index += 1) {
      const projectile = projectilePool[index];
      if (projectile.active) continue;
      projectile.active = true;
      projectile.position.copy(position);
      projectile.previousPosition.copy(position);
      projectile.direction.copy(direction).normalize();
      projectile.lifetime = 0;
      projectile.shooterId = shooterId;
      return true;
    }
    return false;
  };

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;

    if (!enabled) {
      for (let index = 0; index < projectilePool.length; index += 1) {
        projectilePool[index].active = false;
      }
      for (const flash of muzzleFlashRefs.current) if (flash) flash.visible = false;
      for (const [index, rig] of rigRefs.current.entries()) if (rig) {
        const fighter = fighterRefs.current[index], enemy = enemies[index];
        if(!enemy?.alive)continue;
        rig.movement = 0;
        rig.contactReady = false;
        updateInfantryRig(rig, { time: now, delta: 0, moving: false, progress: 0, phase: 0, recoil: 0,
          worldX: (enemy?.position[0] ?? 0) + (fighter?.position.x ?? 0),
          worldZ: (enemy?.position[2] ?? 0) + (fighter?.position.z ?? 0),
          worldYaw: fighter?.rotation.y ?? 0, worldScale: fighter?.scale.x ?? INFANTRY_WORLD_SCALE });
      }
      tracers.submit(0);
      return;
    }

    const tank = tankTargetEnabled ? tankRef.current : null;
    const currentFriendlies = friendliesRef.current;
    const livingFriendlies = livingFriendliesRef.current;
    const livingFriendlyById = livingFriendlyByIdRef.current;
    livingFriendlies.length = 0;
    livingFriendlyById.clear();
    for (const friendly of currentFriendlies) {
      if (!friendly.alive) continue;
      livingFriendlies.push(friendly);
      livingFriendlyById.set(friendly.id, friendly);
    }
    if (tank) {
      tank.getWorldPosition(tankCenter);
      tankCenter.y += 0.64;
    }

    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      const fighter = fighterRefs.current[index];
      const flash = muzzleFlashRefs.current[index];
      if (!enemy.alive) {
        enemyPosesRef?.current.delete(enemy.id);
        if (flash) flash.visible = false;
        continue;
      }

      let runtime = runtimeByEnemyRef.current.get(enemy.id);
      if (!runtime) {
        runtime = {
          appearedAt:now,
          nextShotAt: now + enemy.initialFireDelay,
          shotIndex: 0,
          flashUntil: 0,
          baseOffsetX: 0,
          baseOffsetZ: 0,
          moveFromX: 0,
          moveFromZ: 0,
          moveToX: 0,
          moveToZ: 0,
          moveStartedAt: 0,
          moveEndsAt: 0,
          moving: false,
          patrolLeg:0,nextPatrolAt:fieldAdvance?now+.55+(index*.61)%2.9:now+2.8+(index*1.19)%6.2,routeObstacles:obstacles,
          targetFriendlyId: null,
          targetShotGroup: -1,
          targetsFriendlies: false,
          nextTargetDecisionAt: 0,
          screened: false,
          nextDetourAt: now+1.7+index*.18,
        };
        if(enemy.tunnelMouth){
          runtime.baseOffsetX=enemy.tunnelMouth.x-enemy.position[0];
          runtime.baseOffsetZ=enemy.tunnelMouth.z-enemy.position[2];
          startEnemyLeg(runtime,0,0,now+.30,obstacles,1.85);
        }
        runtimeByEnemyRef.current.set(enemy.id, runtime);
      }

      const hx=enemy.position[0],hz=enemy.position[2],ax=hx+runtime.baseOffsetX,az=hz+runtime.baseOffsetZ;
      if(runtime.moving && runtime.routeObstacles!==obstacles){
        runtime.routeObstacles=obstacles;
        if(!safeVillageLeg(ax,az,hx+runtime.moveToX,hz+runtime.moveToZ,obstacles,navigationRiver)){
          runtime.moving=false;runtime.nextPatrolAt=now+1;
        }
      }
      if(!runtime.moving && now>=runtime.nextPatrolAt){
        const lines=[...coverLines,...kitLines];
        for(const other of enemies){
          if(other===enemy||!other.alive)continue;
          const r=runtimeByEnemyRef.current.get(other.id),[x,,z]=other.position;
          lines.push({ax:x+(r?.baseOffsetX??0),az:z+(r?.baseOffsetZ??0),
            bx:x+(r?.moving?r.moveToX:r?.baseOffsetX??0),bz:z+(r?.moving?r.moveToZ:r?.baseOffsetZ??0),radius:.62});
        }
        const seed=hashCombatSession(enemy.id),leg=runtime.patrolLeg++;
        const clear=(x:number,z:number)=>footLaneClear(ax,az,x,z,lines);
        const advancing=fieldAdvance&&tank&&(enemy.tunnel||index%3!==1);
        const p=advancing?advanceFieldWaypoint(ax,az,tankCenter.x,tankCenter.z,seed,leg,obstacles,navigationRiver,clear):
          patrolWaypoint(ax,az,hx,hz,5.1,seed,leg,obstacles,navigationRiver,clear);
        if(p)startEnemyLeg(runtime,p.x-hx,p.z-hz,now,obstacles,advancing?1.92:1.2);
        runtime.nextPatrolAt=now+1.4;
      }
      let movementProgress = 0;
      if (runtime.moving) {
        const movementDuration = Math.max(0.001, runtime.moveEndsAt - runtime.moveStartedAt);
        movementProgress = THREE.MathUtils.clamp(
          (now - runtime.moveStartedAt) / movementDuration,
          0,
          1,
        );
        const movementBlend = movementProgress * movementProgress * (3 - 2 * movementProgress);
        runtime.baseOffsetX = THREE.MathUtils.lerp(runtime.moveFromX, runtime.moveToX, movementBlend);
        runtime.baseOffsetZ = THREE.MathUtils.lerp(runtime.moveFromZ, runtime.moveToZ, movementBlend);

        if (movementProgress >= 1) {
          runtime.baseOffsetX = runtime.moveToX;
          runtime.baseOffsetZ = runtime.moveToZ;
          runtime.moving = false;
          runtime.nextPatrolAt = now + (fieldAdvance ? .95 : 2.2) + deterministicUnit(
            hashCombatSession(enemy.id),
            144 + runtime.patrolLeg,
          ) * (fieldAdvance?1.4:3.8);
        }
      }

      const livingFriendlyCount = livingFriendlies.length;
      const shouldEngageFriendlies = livingFriendlyCount > 0 && (
        !tank || index % 3 !== 0
      );
      const targetShotGroup = Math.floor(runtime.shotIndex / 3);
      let selectedFriendly = runtime.targetFriendlyId
        ? livingFriendlyById.get(runtime.targetFriendlyId) ?? null
        : null;
      const targetInvalidated = !!runtime.targetFriendlyId && !selectedFriendly;
      sightOrigin.set(enemy.position[0]+runtime.baseOffsetX,
        enemy.position[1]+infantryRifleHeight(enemy.stance === 'kneeling')*(fighter?.scale.y ?? INFANTRY_WORLD_SCALE),
        enemy.position[2]+runtime.baseOffsetZ);
      if (targetInvalidated
        || runtime.targetsFriendlies !== shouldEngageFriendlies
        || runtime.targetShotGroup !== targetShotGroup
        || now >= runtime.nextTargetDecisionAt) {
        selectedFriendly = null;
        // Hold a contact for a short three-round engagement before shifting.
        // Focused fire makes casualties possible while the index offset still
        // distributes the squad across the full US line.
        if (shouldEngageFriendlies || (tank && livingFriendlyCount && villageBlocksSight(sightOrigin,tankCenter,obstacles))) {
          const targetOrdinal = (index * 2 + targetShotGroup) % livingFriendlyCount;
          for (let n=0;n<livingFriendlyCount;n++) {
            const candidate=livingFriendlies[(targetOrdinal+n)%livingFriendlyCount];
            const pose=friendlyPosesRef.current.get(candidate.id)?.position;
            targetCenter.set(pose?.x ?? candidate.position[0],(pose?.y ?? candidate.position[1])
              + infantryAimHeight(candidate.kneeling),pose?.z ?? candidate.position[2]);
            if (!villageBlocksSight(sightOrigin,targetCenter,obstacles)) { selectedFriendly=candidate; break; }
          }
        }
        runtime.targetFriendlyId = selectedFriendly?.id ?? null;
        runtime.targetShotGroup = targetShotGroup;
        runtime.targetsFriendlies = shouldEngageFriendlies;
        // World-tested contacts needn't be re-evaluated every animation frame.
        runtime.nextTargetDecisionAt = now + TARGET_DECISION_INTERVAL * (5 + index%3);
      }

      // When every opponent is hidden, remember a contact for planning only.
      // The socket and full sightline still have to clear before a shot.
      const rememberedFriendly = selectedFriendly ?? (!tank ? livingFriendlies[index%Math.max(1,livingFriendlyCount)] : null);
      if (rememberedFriendly) {
        const livePose = friendlyPosesRef.current.get(rememberedFriendly.id)?.position;
        targetCenter.set(
          livePose?.x ?? rememberedFriendly.position[0],
          (livePose?.y ?? rememberedFriendly.position[1])
            + infantryAimHeight(rememberedFriendly.kneeling),
          livePose?.z ?? rememberedFriendly.position[2],
        );
      } else if (tank) {
        targetCenter.copy(tankCenter);
      }
      const hasEngagementTarget = !!rememberedFriendly || tank !== null;

      // Tunnel contacts rise visibly at the announced hatch. Their live hit
      // center follows the mesh throughout this non-firing arrival animation.
      const emergeY=enemy.tunnel ? -1.28*(1-Math.min(1,(now-runtime.appearedAt)/.68))**2 : 0;
      if (fighter) {
        fighter.visible = true;
        if(runtime.moving){
          fighter.rotation.y=turnFootActor(fighter.rotation.y,Math.atan2(runtime.moveFromX-runtime.moveToX,runtime.moveFromZ-runtime.moveToZ),delta);
        }else if (hasEngagementTarget) {
          const dx = targetCenter.x - enemy.position[0] - runtime.baseOffsetX;
          const dz = targetCenter.z - enemy.position[2] - runtime.baseOffsetZ;
          fighter.rotation.y = turnFootActor(fighter.rotation.y,Math.atan2(-dx,-dz),delta);
        }
        fighter.position.set(runtime.baseOffsetX, emergeY, runtime.baseOffsetZ);
        fighter.rotation.x = 0;
        fighter.rotation.z = 0;
      }
      const poses = enemyPosesRef?.current;
      if (poses) {
        let live = poses.get(enemy.id);
        if (!live) { live = { position: new THREE.Vector3(), yaw: 0 }; poses.set(enemy.id, live); }
        live.position.set(enemy.position[0] + runtime.baseOffsetX, enemy.position[1]+emergeY, enemy.position[2] + runtime.baseOffsetZ);
        live.yaw = fighter?.rotation.y ?? 0;
      }
      const rig = rigRefs.current[index];
      if (rig) {
        const yaw = fighter?.rotation.y ?? 0;
        const dx = runtime.moveToX - runtime.moveFromX, dz = runtime.moveToZ - runtime.moveFromZ;
        const aimPitch = hasEngagementTarget ? THREE.MathUtils.clamp(Math.atan2(
          targetCenter.y - enemy.position[1] - infantryRifleHeight(enemy.stance === 'kneeling') * (fighter?.scale.y ?? INFANTRY_WORLD_SCALE),
          Math.hypot(targetCenter.x - enemy.position[0] - runtime.baseOffsetX, targetCenter.z - enemy.position[2] - runtime.baseOffsetZ),
        ), -0.25, 0.25) : 0;
        updateInfantryRig(rig, {
          time: now, delta, moving: runtime.moving, progress: movementProgress,
          phase: index * 1.67, recoil: Math.max(0, runtime.flashUntil - now) / 0.09, aimPitch, holdingRifle: true, fieldStance: true,
          worldX: enemy.position[0] + runtime.baseOffsetX, worldZ: enemy.position[2] + runtime.baseOffsetZ,
          worldYaw: yaw, worldScale: fighter?.scale.x ?? INFANTRY_WORLD_SCALE,
          moveFromX: enemy.position[0] + runtime.moveFromX, moveFromZ: enemy.position[2] + runtime.moveFromZ,
          moveToX: enemy.position[0] + runtime.moveToX, moveToZ: enemy.position[2] + runtime.moveToZ,
          directionX: Math.cos(yaw) * dx - Math.sin(yaw) * dz,
          directionZ: Math.sin(yaw) * dx + Math.cos(yaw) * dz,
        });
        const burn=burns?.get(enemy.id);
        if(burn){
          rig.spine.updateWorldMatrix(true,false);
          seatCharacterFlame(burn,rig.spine.matrixWorld,.20,.26,.06);
        }
        if (flash) {
          muzzleBind.set(...infantryRifleBind(fieldRifleStyle('vc', enemy.uniformVariant), enemy.stance === 'kneeling').muzzle);
          infantrySocketPosition(flash.position, muzzleBind, rig);
          flash.quaternion.copy(rig.spine.quaternion).multiply(flashRotation);
        }
      }
      if (flash) {
        flash.visible = now < runtime.flashUntil;
        if (flash.visible) {
          flash.scale.setScalar(0.82 + Math.sin(now * 145 + index) * 0.18);
        }
      }

      if (!hasEngagementTarget) { runtime.screened = livingFriendlyCount>0; continue; }
      if (runtime.moving || now < runtime.nextShotAt) continue;
      if(fighter && Math.abs(Math.sin((Math.atan2(hx+runtime.baseOffsetX-targetCenter.x,hz+runtime.baseOffsetZ-targetCenter.z)-fighter.rotation.y)/2))>.16)continue;

      // Read the rendered muzzle after stance scaling, idle motion, and yaw.
      // This keeps the flash, tracer origin, and rifle crown on one transform.
      if (fighter && flash) {
        fighter.updateWorldMatrix(true, true);
        flash.getWorldPosition(muzzlePosition);
      } else {
        muzzlePosition.set(
          enemy.position[0],
          enemy.position[1] + infantryRifleHeight(enemy.stance === 'kneeling') * INFANTRY_WORLD_SCALE,
          enemy.position[2],
        );
      }
      aimDirection.copy(targetCenter).sub(muzzlePosition);
      const distance = aimDirection.length();
      if (distance > maxEngagementRange || distance < 3.2) {
        runtime.nextShotAt = now + 0.45;
        continue;
      }

      sightOrigin.y=muzzlePosition.y;
      runtime.screened = villageBlocksRifle(sightOrigin,muzzlePosition,targetCenter,obstacles);
      if (runtime.screened) {
        runtime.nextShotAt = now + .38;
        runtime.nextTargetDecisionAt = now;
        if (now>=runtime.nextDetourAt) {
          runtime.nextDetourAt=now+1.5+index*.09;
          const goal=chooseVillageWaypoint(sightOrigin,targetCenter,enemy.position[0],enemy.position[2],
            obstacles,index%2 ? -1 : 1,navigationRiver);
          if (goal && footLaneClear(ax,az,goal.x,goal.z,kitLines))
            startEnemyLeg(runtime,goal.x-hx,goal.z-hz,now,obstacles);
        }
        continue;
      }

      aimDirection.normalize();
      const shotIndex = runtime.shotIndex++;
      // Fire at the exposed upper profile above the sandbag lip. Infantry aim
      // is a little steadier than anti-armor harassment so the opposing squads
      // can actually trade casualties without turning every burst into a hit.
      const infantryAccuracyScale = selectedFriendly ? 0.42 : 1;
      aimDirection.x += (shotNoise(enemy.id, shotIndex, 1) - 0.5)
        * enemy.accuracy * 2 * infantryAccuracyScale;
      aimDirection.y += (shotNoise(enemy.id, shotIndex, 2) - 0.5)
        * enemy.accuracy * 0.8 * infantryAccuracyScale;
      aimDirection.z += (shotNoise(enemy.id, shotIndex, 3) - 0.5)
        * enemy.accuracy * 2 * infantryAccuracyScale;
      aimDirection.normalize();

      if (spawnHostileRound(muzzlePosition, aimDirection, enemy.id)) {
        if (flash) { flash.visible = true; ejectBrass(flash, 'soldier'); }
        runtime.flashUntil = now + 0.075;
        onEnemyFire?.({
          enemyId: enemy.id,
          position: muzzlePosition.clone(),
          direction: aimDirection.clone(),
        });
      }
      const cadenceVariation = 0.84 + shotNoise(enemy.id, shotIndex, 4) * 0.32;
      runtime.nextShotAt = now + enemy.fireInterval * cadenceVariation;
    }

    let tracerCount = 0;
    for (let index = 0; index < projectilePool.length; index += 1) {
      const projectile = projectilePool[index];
      if (projectile.active) {
        projectile.previousPosition.copy(projectile.position);
        projectile.position.addScaledVector(projectile.direction, ENEMY_RIFLE_SPEED * delta);
        projectile.lifetime += delta;

        const expired=projectile.lifetime >= ENEMY_RIFLE_LIFETIME;
        const moundT=expired?null:firstTerrainCombatHit(projectile.previousPosition,projectile.position);
        if (expired || moundT!==null) {
          if(moundT!==null)onCoverHit?.(impactPosition.lerpVectors(projectile.previousPosition,projectile.position,moundT));
          projectile.active = false;
        } else {
          const obstacleHitT = findNearestObstacleHit(projectile.previousPosition, projectile.position, obstacles);
          const friendlyCoverHitT = projectile.lifetime > 0.08
            ? findNearestFriendlyCoverHit(projectile.previousPosition, projectile.position)
            : null;
          const blockingHitT = obstacleHitT === null
            ? friendlyCoverHitT
            : friendlyCoverHitT === null
              ? obstacleHitT
              : Math.min(obstacleHitT, friendlyCoverHitT);
          const friendlyHit = findNearestLivingFriendlyHit(
            projectile.previousPosition,
            projectile.position,
            friendliesRef.current,
            friendlyPosesRef.current,
          );
          const tankHitT = tank
            ? segmentSphereIntersection(
                projectile.previousPosition,
                projectile.position,
                tankCenter,
                TANK_HIT_RADIUS,
              )
            : null;

          const friendlyHitT = friendlyHit?.t ?? null;
          const friendlyHitsFirst = friendlyHitT !== null
            && (blockingHitT === null || friendlyHitT < blockingHitT)
            && (tankHitT === null || friendlyHitT < tankHitT);
          const tankHitsFirst = tankHitT !== null
            && (blockingHitT === null || tankHitT < blockingHitT)
            && (friendlyHitT === null || tankHitT <= friendlyHitT);

          if (friendlyHitsFirst && friendlyHit) {
            impactPosition.copy(friendlyHit.point);
            onFriendlyHit?.({
              enemyId: projectile.shooterId,
              friendlyId: friendlyHit.friendly.id,
              position: impactPosition.clone(),
              damage: ENEMY_RIFLE_INFANTRY_DAMAGE,
            });
            projectile.active = false;
          } else if (tankHitsFirst && tankHitT !== null) {
            impactPosition.copy(projectile.previousPosition).lerp(projectile.position, tankHitT);
            onTankHit?.({
              enemyId: projectile.shooterId,
              position: impactPosition.clone(),
              damage: ENEMY_RIFLE_DAMAGE,
            });
            projectile.active = false;
          } else if (blockingHitT !== null) {
            onCoverHit?.(impactPosition.lerpVectors(projectile.previousPosition,projectile.position,blockingHitT));
            projectile.active = false;
          }
        }
      }

      if (!projectile.active) continue;
      tracers.write(tracerCount++, projectile.position, projectile.direction, projectile.lifetime * ENEMY_RIFLE_SPEED);
    }
    tracers.submit(tracerCount);
  });

  return (
    <group dispose={null}>
      <VietCongFieldCover enemies={enemies} />

      {enemies.map((enemy, index) => (
        <VietCongFighterSlot
          key={enemy.id}
          enemy={enemy}
          obstacles={obstacles}
          index={index}
          fighterRefs={fighterRefs}
          muzzleFlashRefs={muzzleFlashRefs}
          rigRefs={rigRefs}
        />
      ))}

      <RoundTracers batch={tracers} capacity={HOSTILE_PROJECTILE_CAPACITY} />
    </group>
  );
}
