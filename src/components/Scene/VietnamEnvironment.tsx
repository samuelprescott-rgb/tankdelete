import {eclipseReflectionGLSL} from './hordeEclipse';
import { reflectWeapons } from './weaponWater';
import {helicopterRoundGeometry,helicopterRoundInk,createFlyoverBurst,FLYOVER_ROUNDS} from './helicopterRounds';
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_DEPTH, ARENA_WIDTH } from '../../lib/arenaBounds';
import { ROAD_GRID_SPACING } from '../../lib/constants';
import { dayPadGrass } from '../../lib/campaignFlights';
import { FILE_OBJECTIVE_RESERVED_ZONE } from '../../lib/mission';
import { isInEmbassyClearing, inEmbassyServiceLane } from '../../lib/embassyDefense';
import { getUSFightingPositions } from '../../lib/combat';
import { TERRAIN_MOUNDS, terrainReliefHeight } from '../../lib/terrain';
import { TerrainReliefMesh } from './TerrainReliefMesh';
import {PierEddies} from './PierEddies';
import {shadeFloodedPlot,useCrossingWeather} from './crossingWeather';
import {paddyCrossingHeight,trackGrassHeight} from './embassyServiceTrack';
import { coordinateNoise, createDeterministicScatter } from './environmentGeneration';
import {trestleReflection} from './trestleReflection';
import { DenseJungle, createDenseJunglePlacements } from './DenseJungle';
import {createStaticInstanceFrustum, STATIC_FOLIAGE_CULL_PRIORITY} from './staticInstanceFrustum';
import { DenseGroundCover } from './DenseGroundCover';
import { selectAuthoredShrubPlacements } from './AuthoredJunglePlants';
import { useJungleBark } from './useJungleBark';
import { createCanvasSandbagGeometry, createCanvasSandbagMaterial } from './infantryGeometry';
import { createTerrainMaterial, useTerrainDetail } from './TerrainSurface';
import { createPaddyBankGeometry, createPaddyBankMaterial, createPaddyWaterGeometry, createPaddyBedMaterial, createFieldRiceGeometry, createRiceShootMaterial, createRiceCoverHeightProfile, createWetlandWaterMaterial, createFieldDrumGeometry, createFieldDrumMaterial } from './wetlandGeometry';
import { createJungleFernGeometry, createJungleBroadleafGeometry, createJungleBananaGeometry, createJungleUnderstoryMaterial } from './jungleGeometry';
import { WreckFire, DistantBattleSmoke } from './WreckFire';
import { createBridgeTimber, crossingShoulders, type BridgePiece } from './bridgeTimber';
import {createRiverLanding} from './riverLanding';
import {configureVillageAtlas,VILLAGE_MATERIAL_ATLAS} from '../../lib/hutMaterials';
import {bridgeBoard,bridgeRise,bridgeRampLength,riverSection,riverApron,RIVER_WATER_Y,RIVER_BANK_COLUMNS} from './riverVerticalSection';
import {createTankGroundProfile} from '../../lib/tankGroundProfile';
import { RIVER_SKY_TEXTURES } from './riverDawnAsset';
import {OldBankFig} from './OldBankFig';
import {createRiverTalus,createTalusMaterial} from './riverTalus';
import {createScouredBank,bankContactTexture,bakeBankCanopy,type CrownSurvey} from './scouredBank';
import { crossingInkBounds } from './ghostSignalCrossing';
import { HueyAirframe, HueyMeshes, useOwnedHuey, type HueyAssets } from './HueyAirframe';
export { HueyAirframe } from './HueyAirframe';
import { registerFlyoverResources } from './flyoverResources';
import { SupplyCrates } from './SupplyCrates';
import {
  createRiverStations,
  createBridgePlantExclusion,
  createRiverCrossings,
  sampleRiverStation,
  riverCrossingAmount,
  RIVER_BASE_STATIONS,RIVER_MIN_Z,RIVER_MAX_Z,estuaryTongue,
  isInsideRiverCorridor,
  type RiverStation,
} from './riverLayout';

const DEFAULT_ENVIRONMENT_SEED = 1968;

function finalizeInstanceMatrices(mesh: THREE.InstancedMesh, dynamic = false) {
  mesh.instanceMatrix.setUsage(dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 91.719 + salt * 17.173) * 43758.5453;
  return value - Math.floor(value);
}

function distanceToRoad(value: number) {
  const half = ROAD_GRID_SPACING * 0.5;
  return Math.abs(((value + half) % ROAD_GRID_SPACING + ROAD_GRID_SPACING) % ROAD_GRID_SPACING - half);
}

// Preserve a readable approach and firing pocket around the rear-center file
// objective while letting the jungle close in tightly around its perimeter.
function isInsideObjectiveClearing(x: number, z: number, padding = 0) {
  return isInEmbassyClearing(x, z, padding) || (Math.abs(x - FILE_OBJECTIVE_RESERVED_ZONE.centerX)
      <= FILE_OBJECTIVE_RESERVED_ZONE.halfWidth + padding
    && Math.abs(z - FILE_OBJECTIVE_RESERVED_ZONE.centerZ)
      <= FILE_OBJECTIVE_RESERVED_ZONE.halfDepth + padding);
}
function isInsideOutpostClearing(x:number,z:number,padding=0) {
  // Keep the doorway and the west patrol circuit clear of planted trunks.
  return isInsideObjectiveClearing(x,z,padding) || (Math.abs(x+32)<4+padding && z>36-padding && z<51+padding)
    || (Math.abs(x+34.1)<5.7+padding && z>32.1-padding && z<43.6+padding);
}
function isInsideDefenseClearing(x:number,z:number,padding=0) {
  return isInsideObjectiveClearing(x,z,padding)||inEmbassyServiceLane(x,z,padding);
}

type PaddyDrainSide = 'north' | 'south' | 'east' | 'west';

interface PaddyField {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  waterLevel: number;
  drainSide: PaddyDrainSide;
  drainOffset: number;
}

// These cells form three readable terrace groups while preserving the road grid
// and all existing gameplay collision data.
const PADDY_FIELDS: PaddyField[] = [
  { x: -6.35, z: -10.6, width: 10.05, depth: 3.2, rotation: -0.036, waterLevel: -0.058, drainSide: 'east', drainOffset: -0.62 },
  { x: 6.2, z: -10.6, width: 9.72, depth: 3.2, rotation: 0.042, waterLevel: -0.052, drainSide: 'west', drainOffset: 0.58 },
  { x: -6.15, z: -4.25, width: 9.42, depth: 5.82, rotation: 0.031, waterLevel: -0.048, drainSide: 'south', drainOffset: 1.05 },
  { x: 6.3, z: -4.1, width: 9.68, depth: 6.08, rotation: -0.04, waterLevel: -0.042, drainSide: 'north', drainOffset: -0.92 },
  { x: -6.1, z: 3.3, width: 9.85, depth: 4.1, rotation: -0.025, waterLevel: -0.037, drainSide: 'east', drainOffset: -0.74 },
  { x: 6.15, z: 4.08, width: 10.02, depth: 5.7, rotation: 0.028, waterLevel: -0.032, drainSide: 'west', drainOffset: 0.82 },
  { x: -35, z: -4, width: 8.4, depth: 6.32, rotation: 0.075, waterLevel: -0.03, drainSide: 'south', drainOffset: -1.1 },
  { x: 20.05, z: 4.15, width: 8.75, depth: 6.05, rotation: -0.068, waterLevel: -0.026, drainSide: 'north', drainOffset: 1.18 },
];

function paddyLocalToWorld(field: PaddyField, localX: number, localZ: number) {
  const cosine = Math.cos(field.rotation);
  const sine = Math.sin(field.rotation);
  return {
    x: field.x + cosine * localX + sine * localZ,
    z: field.z - sine * localX + cosine * localZ,
  };
}

export function isInsidePaddy(x: number, z: number, padding = 0) {
  return PADDY_FIELDS.some(field => {
    const dx = x - field.x;
    const dz = z - field.z;
    const cosine = Math.cos(field.rotation);
    const sine = Math.sin(field.rotation);
    const localX = cosine * dx - sine * dz;
    const localZ = sine * dx + cosine * dz;
    return Math.abs(localX) <= field.width * 0.5 + padding
      && Math.abs(localZ) <= field.depth * 0.5 + padding;
  });
}

function createPaddyOutline(field: PaddyField, index: number): Array<[number, number]> {
  const halfWidth = field.width * 0.5;
  const halfDepth = field.depth * 0.5;
  const corners: Array<[number, number]> = [
    [-halfWidth * (0.68 + seeded(index, 301) * 0.12), -halfDepth],
    [halfWidth * 0.04, -halfDepth * (0.92 + seeded(index, 302) * 0.08)],
    [halfWidth * (0.7 + seeded(index, 303) * 0.13), -halfDepth * 0.94],
    [halfWidth, -halfDepth * (0.38 + seeded(index, 304) * 0.12)],
    [halfWidth * (0.88 + seeded(index, 305) * 0.1), halfDepth * 0.16],
    [halfWidth, halfDepth * (0.55 + seeded(index, 306) * 0.14)],
    [halfWidth * (0.58 + seeded(index, 307) * 0.16), halfDepth],
    [-halfWidth * 0.1, halfDepth * (0.88 + seeded(index, 308) * 0.1)],
    [-halfWidth * (0.7 + seeded(index, 309) * 0.14), halfDepth],
    [-halfWidth, halfDepth * (0.42 + seeded(index, 310) * 0.15)],
    [-halfWidth * (0.9 + seeded(index, 311) * 0.08), -halfDepth * 0.08],
    [-halfWidth, -halfDepth * (0.62 + seeded(index, 312) * 0.12)],
  ];
  // Paddies are worked plots, but the inside turns silt up and a foot-cut
  // for a sluice makes a short square shoulder. The water, soil and crops
  // use this same contour: the indentation is real from every viewpoint.
  const cuts=[(1+index*5)%12,(7+index*3)%12];
  const shore:Array<[number,number]>=[];
  corners.forEach(([x,z],i)=>{
    shore.push([x,z]);
    if(!cuts.includes(i))return;
    const [nx,nz]=corners[(i+1)%corners.length],dx=nx-x,dz=nz-z;
    const length=Math.max(.1,Math.hypot(dx,dz));
    const depth=Math.min(.62,length*.23,halfWidth*.14,halfDepth*.14);
    for(const [t,k] of [[.25,0],[.38,.63],[.61,1],[.80,.16]]){
      shore.push([x+t*dx-dz*depth*k/length,z+t*dz+dx*depth*k/length]);
    }
  });
  return shore;
}

function isInsideOutline(x: number, z: number, outline: Array<[number, number]>) {
  let inside = false;
  for (let current = 0, previous = outline.length - 1; current < outline.length; previous = current, current += 1) {
    const [currentX, currentZ] = outline[current];
    const [previousX, previousZ] = outline[previous];
    const crosses = (currentZ > z) !== (previousZ > z)
      && x < (previousX - currentX) * (z - currentZ) / (previousZ - currentZ) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function createGrassClumpGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const baseColor = new THREE.Color('#414936');
  const tipColor = new THREE.Color('#848260');
  const bladeCount = 7;

  const pushVertex = (x: number, y: number, z: number, color: THREE.Color) => {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  };

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = (blade / bladeCount) * Math.PI * 2 + seeded(blade, 70) * 0.5;
    const offsetRadius = blade === 0 ? 0 : 0.045 + seeded(blade, 71) * 0.105;
    const centerX = Math.cos(angle) * offsetRadius;
    const centerZ = Math.sin(angle) * offsetRadius;
    const sideX = Math.cos(angle + Math.PI * 0.5);
    const sideZ = Math.sin(angle + Math.PI * 0.5);
    const width = 0.044 + seeded(blade, 72) * 0.021;
    const height = blade<3 ? 0.83+seeded(blade,73)*0.17 : 0.44+seeded(blade,73)*0.29;
    const lean = blade<3 ? 0.14+seeded(blade,74)*0.15 : 0.37+seeded(blade,74)*0.10;
    // Three tapered sections make the blade arch instead of reading as a
    // rigid spike. The geometry stays shared across every clump and reed.
    for (let segment = 0; segment < 3; segment += 1) {
      const lower = segment / 3;
      const upper = (segment + 1) / 3;
      const widthAt = (t:number) => width*(.09*(1-t)+Math.sin(Math.PI*t)**.92);
      const lowerWidth = widthAt(lower), upperWidth = widthAt(upper);
      const lowerX = centerX + Math.cos(angle) * lean * lower * lower;
      const lowerZ = centerZ + Math.sin(angle) * lean * lower * lower;
      const upperX = centerX + Math.cos(angle) * lean * upper * upper;
      const upperZ = centerZ + Math.sin(angle) * lean * upper * upper;
      const riseAt = (t:number) => height * (blade<3 ? 1.3*t-.33*t*t : 2.30*t-1.58*t*t);
      const lowerY = riseAt(lower), upperY = riseAt(upper);
      const lowerColor = baseColor.clone().lerp(tipColor, lower);
      const upperColor = baseColor.clone().lerp(tipColor, upper);
      const leftBase: [number, number, number] = [lowerX - sideX * lowerWidth, lowerY, lowerZ - sideZ * lowerWidth];
      const rightBase: [number, number, number] = [lowerX + sideX * lowerWidth, lowerY, lowerZ + sideZ * lowerWidth];
      const rightTip: [number, number, number] = [upperX + sideX * upperWidth, upperY, upperZ + sideZ * upperWidth];
      const leftTip: [number, number, number] = [upperX - sideX * upperWidth, upperY, upperZ - sideZ * upperWidth];
      pushVertex(...leftBase, lowerColor);
      pushVertex(...rightBase, lowerColor);
      pushVertex(...rightTip, upperColor);
      if(segment<2){
        pushVertex(...leftBase, lowerColor);
        pushVertex(...rightTip, upperColor);
        pushVertex(...leftTip, upperColor);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function riverTerrainClearance(stations: RiverStation[]) {
  // A mud segment extends across X, not a circle with the bank radius in
  // every direction. Test the complete rendered trapezoids, continuously,
  // against the rotated, buffered hill ellipses (including edge tangencies).
  for(const m of TERRAIN_MOUNDS){
    const cs=Math.cos(m.rotation),sn=Math.sin(m.rotation),guard=1+.45/Math.min(m.sx,m.sz);
    const rx=m.sx*guard,rz=m.sz*guard,bound=Math.max(rx,rz);
    const local=(x:number,z:number)=>[(cs*(x-m.x)-sn*(z-m.z))/rx,(sn*(x-m.x)+cs*(z-m.z))/rz];
    for(let i=1;i<stations.length;i++){
      const a=stations[i-1],b=stations[i],al=a.centerX-a.mudHalfWidth,ar=a.centerX+a.mudHalfWidth,
        bl=b.centerX-b.mudHalfWidth,br=b.centerX+b.mudHalfWidth;
      if(a.z>m.z+bound||b.z<m.z-bound||Math.min(al,bl)>m.x+bound||Math.max(ar,br)<m.x-bound)continue;
      const q=[local(al,a.z),local(ar,a.z),local(br,b.z),local(bl,b.z)];
      let contains=true;
      for(let j=0;j<4;j++){
        const [x,z]=q[j],[u,v]=q[(j+1)%4],dx=u-x,dz=v-z;
        if(dx*z-dz*x>0)contains=false;
        const t=Math.max(0,Math.min(1,-(x*dx+z*dz)/(dx*dx+dz*dz||1)));
        if((x+t*dx)**2+(z+t*dz)**2<=1)return false;
      }
      if(contains)return false;
    }
  }
  return true;
}


function TerrainRelief({ seed }: { seed: number }) {
  const rocksRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const detail = useTerrainDetail();
  const surface = useMemo(() => createTerrainMaterial(seed, 0, detail, 'relief'), [seed, detail]);
  useEffect(() => () => surface.dispose(), [surface]);
  const ridgeRocks = useMemo(() => TERRAIN_MOUNDS.slice(0, 24).flatMap((mound, moundIndex) => (
    [0, 1].map((rockIndex) => {
      const angle = mound.rotation + (rockIndex === 0 ? 0.75 : -1.05);
      const distance = (rockIndex === 0 ? mound.sx : mound.sz) * (0.38 + seeded(moundIndex, 111 + rockIndex) * 0.2);
      const x=mound.x+Math.cos(angle)*distance,z=mound.z+Math.sin(angle)*distance;
      return {
        x, y: terrainReliefHeight(x,z)+.035, z,
        rotation: seeded(moundIndex, 119 + rockIndex) * Math.PI,
        scale: 0.28 + seeded(moundIndex, 123 + rockIndex) * 0.58,
      };
    })
  )), []);

  useLayoutEffect(() => {
    if (!rocksRef.current) return;
    ridgeRocks.forEach((rock, index) => {
      dummy.position.set(rock.x, rock.y, rock.z);
      dummy.rotation.set(0.12, rock.rotation, -0.08);
      dummy.scale.set(rock.scale * 1.25, rock.scale * 0.76, rock.scale);
      dummy.updateMatrix();
      rocksRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(rocksRef.current);
  }, [dummy, ridgeRocks]);

  return (
    <>
      <TerrainReliefMesh material={surface.material} />
      <instancedMesh ref={rocksRef} args={[undefined, undefined, ridgeRocks.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#3b4034" roughness={0.94} metalness={0.06} flatShading />
      </instancedMesh>
    </>
  );
}


/** Continuous bank/bed ribbon and a matching five-column water surface. */
export function createRiverSurfaceGeometry(stations: RiverStation[], seed: number, water = false) {
  const positions: number[] = [], colors: number[] = [], depths: number[] = [], uvs: number[] = [], indices: number[] = [];
  const columns = water ? 5 : RIVER_BANK_COLUMNS;
  stations.forEach((station, row) => {
    const section=riverSection(station,seed),shallow=section.shallow,w=station.waterHalfWidth;
    const offsets = water ? [-w, -w * 0.72, 0, w * 0.72, w] : section.offsets;
    const heights = water ? offsets.map(() => RIVER_WATER_Y) : section.heights;
    for (let column = 0; column < columns; column++) {
      const x = station.centerX + offsets[column];
      positions.push(x, heights[column], station.z);
      uvs.push(x * 0.4, station.z * 0.4);
      const edge = column === 0 || column === columns - 1;
      const depth = (edge ? 0 : column === 2 ? 1 : 0.65) * (1 - shallow * 0.8);
      depths.push(depth);
      const ring=Math.min(column,columns-column-1);
      const color = new THREE.Color(water?(edge?'#71654e':column===3?'#474a39':'#655b45'):
        ['#837153','#86734e','#9d805c','#b39772','#787b68','#53584c'][ring]);
      if (!water) {
        const silt = THREE.MathUtils.smoothstep(Math.sin(station.z * .27 + column * 2.55 + seed % 29), -.36, .86);
        color.lerp(new THREE.Color(ring<2?'#596345':'#837d67'), silt * (ring<2?.66:.38) * (1 - shallow));
        const side=column<columns/2?-1:1,apron=riverApron(station,side);
        // Where deposited clay continues the land bench, the lower ribbon
        // is a dark damp toe, not the exposed pale interior of a cut plane.
        const toes=side<0?['#615b44','#6b6350','#68634e','#596051','#565e52','#4c5349']:
          ['#705f46','#796b4f','#76694e','#696953','#58604f','#505948'];
        color.lerp(new THREE.Color(toes[ring]),apron.mass*(.88+.10*silt));
      }
      color.multiplyScalar(0.94 + Math.sin(station.z * 0.71 + column) * 0.06 + shallow * 0.10);
      colors.push(color.r, color.g, color.b);
      if (row < stations.length - 1 && column < columns - 1) {
        const a = row * columns + column, b = a + columns;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  // The north sill is a retained dry tongue with actual cut faces. Append
  // only its affected rows to the existing bed, keeping a single bank draw.
  if(!water)for(let row=1;row<stations.length;row++){
    const a=stations[row-1],b=stations[row];if(!a.cut&&!b.cut)continue;
    const t=[estuaryTongue(a),estuaryTongue(b)],rows=[a,b];
    const send=(r:number,j:number)=>{const x=t[r].xs[j],y=t[r].hs[j],z=rows[r].z;
      indices.push(positions.length/3);positions.push(x,y,z);uvs.push(x*.4,z*.4);
      const c=new THREE.Color(j===0||j===3?'#575c50':j===1?'#827359':'#7e7156');colors.push(c.r,c.g,c.b);
    };
    for(let k=0;k<3;k++){
      if(t[0].xs[k+1]-t[0].xs[k]>.001){send(0,k);send(1,k);send(0,k+1);}
      if(t[1].xs[k+1]-t[1].xs[k]>.001){send(0,k+1);send(1,k);send(1,k+1);}
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (water) geometry.setAttribute('wetlandDepth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createRiverReeds(stations: RiverStation[], seed: number) {
  const placements: Array<{ x: number; y:number; z: number; rotation: number; scaleX: number; scaleY: number; scaleZ: number }> = [];
  const ground=createTankGroundProfile(stations,seed);
  const crossings = createRiverCrossings(stations);
  const overlapsBridge = createBridgePlantExclusion(stations);
  // Keep the original small instance budget even though the smoother route has
  // more stations. Re-sample each jittered Z so reeds follow the rendered bank.
  for (let row = 2; row < RIVER_BASE_STATIONS - 2; row += 2) {
    for (const side of [-1, 1]) {
      // Reeds occupy scallops in the bank. Broken runs of roots give way
      // to long bare stretches, instead of ticking off every river station.
      const bankGrowth = Math.sin(row*.43+side*1.75+seed*.012)+.44*Math.sin(row*.18-side*.82);
      if(bankGrowth<-.33)continue;
      const clumps = bankGrowth>.55 ? 3 : 1;
      for (let clump = 0; clump < clumps; clump++) {
        const key = row * 3 + clump;
        const z = RIVER_MIN_Z+(RIVER_MAX_Z-RIVER_MIN_Z)*row/(RIVER_BASE_STATIONS-1) + (clump-(clumps-1)*.5)*.48 + (coordinateNoise(key, side, seed, 822) - 0.5) * .58;
        const station = sampleRiverStation(stations, z)!;
        const x = station.centerX + side * (station.waterHalfWidth + 0.27 + coordinateNoise(key, side, seed, 821) * 0.35);
        if (crossings.some(crossing => riverCrossingAmount(x, z, crossing, 0.9) > 0)) continue;
        const scale = 0.40 + coordinateNoise(key, side, seed, 823) * 0.29;
        const scaleX = scale * (0.85 + coordinateNoise(key, side, seed, 825) * 0.3);
        if (overlapsBridge(x, z, .75 * Math.max(scaleX, scale))) continue;
        placements.push({
          x,y:ground.height(x,z)-.012,
          z, rotation: coordinateNoise(key, side, seed, 824) * Math.PI,
          scaleX,
          scaleY: 0.48 + coordinateNoise(key, side, seed, 826) * 0.50, scaleZ: scale,
        });
      }
    }
  }
  return placements;
}

export function createRiverBridgePlanks(stations: RiverStation[], seed: number) {
  const crossing = createRiverCrossings(stations).find(item => item.kind === 'bridge');
  if (!crossing) return [];
  const count = Math.ceil(crossing.length / 0.38), spacing = crossing.length / count;
  const cosine = Math.cos(crossing.rotation), sine = Math.sin(crossing.rotation);
  const planks: BridgePiece[] = Array.from({ length: count }, (_, index) => {
    const board=bridgeBoard(crossing,index,count,seed);return ({
    x: crossing.centerX + cosine * (-crossing.length * 0.5 + (index + 0.5) * spacing),
    y: board.y, pitch:board.pitch,
    z: crossing.z - sine * (-crossing.length * 0.5 + (index + 0.5) * spacing), rotation: crossing.rotation,
    scaleX: board.width, scaleY: 2*board.halfHeight, scaleZ: crossing.width,
  });});
  // Preserve end-deck/stringer indices used by driving diagnostics.
  planks.splice(planks.length-1,0,...crossingShoulders(crossing,seed));
  for (const side of [-1, 1]) planks.push({
    x: crossing.centerX + sine * side * (crossing.width * 0.5 - 0.30), y: bridgeRise(crossing.z,crossing)-.13,
    z: crossing.z + cosine * side * (crossing.width * 0.5 - 0.30), rotation: crossing.rotation,
    scaleX: Math.max(1,crossing.length-2*bridgeRampLength(crossing)), scaleY: .18, scaleZ: .21,
  });
  return planks;
}

export function SmallRiver({ seed, showLanding=true, landingDestroyed=false, crowns, barkMap }: { seed: number; showLanding?: boolean; landingDestroyed?:boolean; crowns?:readonly CrownSurvey[]; barkMap?:THREE.Texture }) {
  const reedsRef = useRef<THREE.InstancedMesh>(null), bridgeRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const detail = useTerrainDetail();
  const time = useMemo(() => ({ value: 0 }), []);
  // Share the exact loader cache entry used by the sky; no reflection camera or extra draw.
  const [,dayPaint]=useLoader(THREE.TextureLoader,RIVER_SKY_TEXTURES);
  const weather=useCrossingWeather();
  const stations = useMemo(() => createRiverStations(seed), [seed]);
  const clearsTerrain = useMemo(() => riverTerrainClearance(stations), [stations]);
  const reeds = useMemo(() => createRiverReeds(stations, seed), [stations, seed]);
  const planks = useMemo(() => createRiverBridgePlanks(stations, seed), [stations, seed]);
  const villagePaint=configureVillageAtlas(useLoader(THREE.TextureLoader,VILLAGE_MATERIAL_ATLAS));
  const landing = useMemo(() => showLanding ? {
    geometry:createRiverLanding(stations,landingDestroyed), material:new THREE.MeshStandardMaterial({map:villagePaint,vertexColors:true,roughness:1,side:THREE.DoubleSide})
  } : null, [stations,showLanding,landingDestroyed,villagePaint]);
  useEffect(()=>()=>{landing?.geometry.dispose();landing?.material.dispose();},[landing]);
  const resources = useMemo(() => {
    const slice=showLanding?createScouredBank(stations,seed):null;
    const contact=slice?bankContactTexture(slice):undefined;
    const canopy=showLanding&&crowns?bakeBankCanopy(stations,crowns):undefined;
    const bankMaterial = createPaddyBedMaterial(detail,contact);
    bankMaterial.vertexColors = true;
    const deck=createRiverCrossings(stations).find(c=>c.kind==='bridge')!;
    // The ribbon already carries authored mud colour. Multiplying it by the
    // paddy bed's dark base again makes the river read as a black trench.
    bankMaterial.color.set('#ffffff');
    return {
      bank: createRiverSurfaceGeometry(stations, seed),
      shorePlates:createRiverTalus(stations,seed,slice),
      shoreMaterial:createTalusMaterial(detail,barkMap),...(contact?{bankContact:contact}:{}),...(canopy?{canopy}:{}),
      water: createRiverSurfaceGeometry(stations, seed, true),
      reed: createGrassClumpGeometry(), ...createBridgeTimber(seed, planks, showLanding),
      bankMaterial, waterMaterial: createWetlandWaterMaterial(time, true, {bounds:crossingInkBounds(stations),sunlit:showLanding,dayPaint,weather,contact,canopy,bridge:showLanding?trestleReflection(deck,planks):undefined}),
      reedMaterial: new THREE.MeshStandardMaterial({ color: showLanding?'#c9be9a':'#929fa6', side: THREE.DoubleSide, roughness: 0.97, vertexColors: true }),
    };
  }, [detail, seed, stations, time, planks, showLanding, dayPaint,crowns,barkMap,weather]);
  useEffect(() => () => { Object.values(resources).forEach(resource => resource.dispose()); }, [resources]);
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });
  useLayoutEffect(() => {
    if (!reedsRef.current || !bridgeRef.current) return;
    reeds.forEach((reed, index) => {
      dummy.position.set(reed.x, reed.y, reed.z); dummy.rotation.set(0, reed.rotation, 0);
      dummy.scale.set(reed.scaleX, reed.scaleY, reed.scaleZ); dummy.updateMatrix();
      reedsRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(reedsRef.current);
    planks.forEach((plank, index) => {
      dummy.position.set(plank.x, plank.y, plank.z); dummy.rotation.set(0, plank.rotation, plank.pitch ?? 0);
      dummy.scale.set(plank.scaleX, plank.scaleY, plank.scaleZ); dummy.updateMatrix();
      bridgeRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(bridgeRef.current);
  }, [dummy, reeds, planks]);
  // Development regression validates all seeded bank envelopes against actual
  // hills. Retain the visual guard against future uncoordinated terrain edits.
  if (!clearsTerrain) return null;
  return <group name="winding-river" dispose={null}>
    <PierEddies stations={stations} pieces={planks} day={showLanding}/>
    <mesh name="winding-river-banks" geometry={resources.bank} material={resources.bankMaterial} receiveShadow />
    <mesh name="low-shale-and-wet-river-stones" geometry={resources.shorePlates} material={resources.shoreMaterial} receiveShadow />
    <mesh name="winding-river-water" userData={{contactSurface:"water"}} geometry={resources.water} material={resources.waterMaterial} renderOrder={3} />
    <instancedMesh name="winding-river-reeds" ref={reedsRef}
      args={[resources.reed, resources.reedMaterial, reeds.length]} />
    <instancedMesh name="winding-river-bridge" userData={{contactSurface:"wood"}} ref={bridgeRef}
      args={[resources.plank, resources.bridgeMaterial, planks.length]} receiveShadow />
    {landing && <mesh userData={{contactSurface:"wood"}} name={landingDestroyed ? "far-bank-landing-ruins" : "far-bank-fishing-landing"} geometry={landing.geometry} material={landing.material} receiveShadow />}
  </group>;
}


export const CRASHED_HUEY_TRANSFORM = Object.freeze({
  position: [-9, 0, -17] as [number, number, number],
  rotation: [0, 0.18, 0] as [number, number, number],
});

function FieldFortifications() {
  const sandbagGeometry = useMemo(createCanvasSandbagGeometry, []);
  const drumGeometry = useMemo(createFieldDrumGeometry, []);
  const drumMaterial = useMemo(createFieldDrumMaterial, []);
  useEffect(() => () => { drumGeometry.dispose(); drumMaterial.dispose(); }, [drumGeometry, drumMaterial]);
  const sandbagMaterial = useMemo(() => {
    const material = createCanvasSandbagMaterial();
    material.color.set('#777967');
    return material;
  }, []);
  useEffect(() => () => { sandbagGeometry.dispose(); sandbagMaterial.dispose(); }, [sandbagGeometry, sandbagMaterial]);
  const sandbags = useMemo(() => [-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8], []);
  const barrelPositions = useMemo<Array<[number, number, number]>>(() => [
    [-9, 0.08, -3],
    [9.6, 0.08, -1],
    [-11, 0.08, 6],
  ], []);
  const sandbagsRef = useRef<THREE.InstancedMesh>(null);
  const barrelsRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const barrelColors = useMemo(() => [
    new THREE.Color('#495432'),
    new THREE.Color('#6f3f24'),
    new THREE.Color('#495432'),
  ], []);

  useLayoutEffect(() => {
    if (!sandbagsRef.current || !barrelsRef.current) return;

    sandbags.forEach((x, index) => {
      dummy.position.set(x, 0, 0);
      dummy.rotation.set(0, (index % 3 - 1) * 0.06+(index%3===1?Math.PI:0), 0);
      dummy.scale.set(0.29, 0.115, 0.17);
      dummy.updateMatrix();
      sandbagsRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(sandbagsRef.current);

    barrelsRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    barrelColors.forEach((color, index) => {
      dummy.position.set(barrelPositions[index][0], -0.046, barrelPositions[index][2]);
      dummy.rotation.set(0, index * 1.63, 0);
      dummy.scale.setScalar(index === 1 ? 0.92 : 1);
      dummy.updateMatrix();
      barrelsRef.current!.setMatrixAt(index, dummy.matrix);
      barrelsRef.current!.setColorAt(index, color);
    });
    finalizeInstanceMatrices(barrelsRef.current);
    if (barrelsRef.current.instanceColor) barrelsRef.current.instanceColor.needsUpdate = true;
  }, [barrelColors, barrelPositions, dummy, sandbags]);

  return (
    <>
      <group position={[-7.4, 0.12, -8]} rotation={[0, 0.28, 0]}>
        <instancedMesh ref={sandbagsRef} args={[sandbagGeometry, sandbagMaterial, sandbags.length]} receiveShadow />
      </group>
      <SupplyCrates />
      <instancedMesh ref={barrelsRef} args={[drumGeometry, drumMaterial, barrelPositions.length]} receiveShadow />
    </>
  );
}


interface FlyoverConfig {
  altitude: number;
  direction: 1 | -1;
  phase: number;
  scale: number;
  speed: number;
  z: number;
}

const DISTANT_FLYOVERS: FlyoverConfig[] = [
  { altitude: 17.5, direction: 1, phase: 0.08, scale: 0.5, speed: 0.014, z: 48 },
  { altitude: 17.8, direction: -1, phase: 0.61, scale: 0.43, speed: 0.011, z: 46 },
];


function FlyingHuey({ config, index, assets }: { config: FlyoverConfig; index: number; assets: HueyAssets }) {
  const helicopterRef = useRef<THREE.Group>(null);
  const mainRotorRef = useRef<THREE.Group>(null);
  const tailRotorRef = useRef<THREE.Group>(null);

  const rounds=useRef<THREE.InstancedMesh>(null);
  const burst=useMemo(()=>createFlyoverBurst(index,config.direction),[index,config.direction]);

  useFrame(({ clock }) => {
    if (!helicopterRef.current || !mainRotorRef.current || !tailRotorRef.current) return;
    const time = clock.elapsedTime;
    const progress = (time * config.speed + config.phase) % 1;
    const corridorX = THREE.MathUtils.lerp(-82, 82, config.direction === 1 ? progress : 1 - progress);
    const rotorBeat = time * (22 + index * 1.7);

    helicopterRef.current.position.set(
      corridorX,
      config.altitude + Math.sin(time * 0.24 + index * 1.8) * 0.55,
      config.z + Math.sin(time * 0.1 + index) * 1.8,
    );
    helicopterRef.current.rotation.y = config.direction === 1 ? -Math.PI * 0.5 : Math.PI * 0.5;
    helicopterRef.current.rotation.z = Math.sin(time * 0.18 + index * 1.3) * 0.035 - config.direction * 0.025;
    mainRotorRef.current.rotation.y = rotorBeat;
    tailRotorRef.current.rotation.x = rotorBeat * 1.82;
    if(rounds.current)burst(time,helicopterRef.current,rounds.current);
  });

  return (
    <><group ref={helicopterRef} name={`overhead-huey-${index}`} scale={config.scale}>
      <HueyMeshes distant assets={assets} mainRotorRef={mainRotorRef} tailRotorRef={tailRotorRef} />
    </group>
    <instancedMesh ref={rounds} name={`overhead-tracers-${index}`} args={[helicopterRoundGeometry,helicopterRoundInk,FLYOVER_ROUNDS]}
      count={0} frustumCulled={false} dispose={null}/>
    </>
  );
}

function DistantHelicopterFormation() {
  const scene = useThree(state => state.scene);
  const bundle = useOwnedHuey(false, true);
  useLayoutEffect(() => registerFlyoverResources(scene, bundle), [scene, bundle]);
  return (
    <>
      {DISTANT_FLYOVERS.map((config, index) => (
        <FlyingHuey key={`${config.z}-${config.phase}`} config={config} index={index} assets={bundle.assets} />
      ))}
    </>
  );
}

const WRECK_BUSHES = [
  [-3.1, -1.4, 1.25],
  [-2.2, -1.9, 1.05],
  [-1.1, -1.8, 1.42],
  [0.5, -1.85, 1.18],
  [2.05, -1.55, 1.38],
  [3.45, -0.9, 1.08],
  [3.65, 1.2, 1.32],
  [-3.35, 1.15, 1.18],
  [-1.65, 0.05, 0.84],
  [1.25, 0.3, 0.92],
  [-0.45, 3.05, 1.14],
  [0.55, 4.15, 1.06],
  [-2.75, 2.55, 1.12],
  [2.72, 2.34, 1.24],
  [-2.05, 3.75, 0.98],
  [2.08, 3.42, 1.08],
] as const;

const WRECK_VINES = [
  [-0.82, 0.22, 1.45, 0.92],
  [0.66, 0.48, 1.1, 0.74],
  [-0.18, 2.45, 1.25, 1.08],
  [0.35, 3.5, 0.92, 0.78],
  [-0.7, 1.62, 1.18, 0.86],
  [0.84, 1.82, 1.34, 0.96],
  [-1.12, 3.08, 0.88, 0.72],
  [0.92, 3.72, 1.06, 0.84],
] as const;

function wreckPlantHitsCourtyard(x: number, z: number, radius: number) {
  const angle = CRASHED_HUEY_TRANSFORM.rotation[1];
  return isInEmbassyClearing(CRASHED_HUEY_TRANSFORM.position[0] + Math.cos(angle) * x + Math.sin(angle) * z,
    CRASHED_HUEY_TRANSFORM.position[2] - Math.sin(angle) * x + Math.cos(angle) * z, radius);
}

function CrashedHuey() {
  const debrisRef = useRef<THREE.InstancedMesh>(null);
  const bushesRef = useRef<THREE.InstancedMesh>(null);
  const vineStemsRef = useRef<THREE.InstancedMesh>(null);
  const vineLeavesRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bushes = useMemo(() => WRECK_BUSHES.filter(([x, z, size]) => !wreckPlantHitsCourtyard(x, z, size)), []);
  const vines = useMemo(() => WRECK_VINES.filter(([x, z]) => !wreckPlantHitsCourtyard(x, z, 0.55)), []);
  const fernGeometry = useMemo(createJungleFernGeometry, []);
  const vineGeometry = useMemo(createJungleBroadleafGeometry, []);
  useEffect(() => () => { fernGeometry.dispose(); vineGeometry.dispose(); }, [fernGeometry, vineGeometry]);
  const bushColors = useMemo(() => [
    new THREE.Color('#2f572e'),
    new THREE.Color('#3d6836'),
    new THREE.Color('#315a30'),
  ], []);
  const debris = useMemo(() => [
    [-2.4, 0.12, 2.45, 0.22],
    [2.9, 0.16, 1.75, -0.5],
    [4.3, 0.11, 0.15, 0.78],
  ] as const, []);

  useLayoutEffect(() => {
    if (!debrisRef.current) return;

    debris.forEach(([x, y, z, rotation], index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.scale.set(0.38 + index * 0.025, 0.13, 0.26 + index * 0.02);
      dummy.updateMatrix();
      debrisRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(debrisRef.current);

    bushes.forEach(([x, z, size], bushIndex) => {
      const groupRotation = seeded(bushIndex, 840) * Math.PI;
      const cosine = Math.cos(groupRotation);
      const sine = Math.sin(groupRotation);
      [-0.42, 0, 0.42].forEach((offset, stemIndex) => {
        const index = bushIndex * 3 + stemIndex;
        const localX = offset * size;
        const localZ = (stemIndex - 1) * 0.2;
        dummy.position.set(
          x + cosine * localX + sine * localZ,
          0.005,
          z - sine * localX + cosine * localZ,
        );
        dummy.rotation.set(0.08, groupRotation + stemIndex * 1.7, offset * 0.16);
        dummy.scale.set(size * 0.7, size * (0.65 + stemIndex * 0.1), size * 0.7);
        dummy.updateMatrix();
        bushesRef.current!.setMatrixAt(index, dummy.matrix);
        bushesRef.current!.setColorAt(index, bushColors[stemIndex]);
      });
    });
    if (bushesRef.current) {
      finalizeInstanceMatrices(bushesRef.current);
      if (bushesRef.current.instanceColor) bushesRef.current.instanceColor.needsUpdate = true;
    }

    vines.forEach(([x, z, height, lean], vineIndex) => {
      dummy.position.set(x, 0.08 + height * 0.5, z);
      dummy.rotation.set(lean * 0.16, vineIndex * 1.3, lean * 0.12);
      dummy.scale.set(0.035, height, 0.035);
      dummy.updateMatrix();
      vineStemsRef.current!.setMatrixAt(vineIndex, dummy.matrix);

      [0.36, 0.7, 0.94].forEach((progress, leafIndex) => {
        const index = vineIndex * 3 + leafIndex;
        dummy.position.set(x + (leafIndex % 2 === 0 ? 0.15 : -0.15), 0.08 + height * progress, z);
        dummy.rotation.set(0, vineIndex * 1.3 + leafIndex * 1.7, leafIndex % 2 === 0 ? -0.6 : 0.6);
        dummy.scale.set(0.23, 0.28, 0.23);
        dummy.updateMatrix();
        vineLeavesRef.current!.setMatrixAt(index, dummy.matrix);
      });
    });
    if (vineStemsRef.current) finalizeInstanceMatrices(vineStemsRef.current);
    if (vineLeavesRef.current) finalizeInstanceMatrices(vineLeavesRef.current);
  }, [bushColors, bushes, vines, debris, dummy]);

  return (
    // Centered behind the left/forward US fighting positions. Its conservative
    // 6.2m wreck footprint clears every mound's conservative bounding circle
    // by at least 2.4m and sits over 10m from the tank spawn.
    <group
      position={CRASHED_HUEY_TRANSFORM.position}
      rotation={CRASHED_HUEY_TRANSFORM.rotation}
    >
      <mesh position={[0.2, -0.045, 0.1]} rotation={[-Math.PI / 2, 0, 0]} scale={[4.7, 2.15, 1]} receiveShadow>
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial color="#15130e" transparent opacity={0.52} depthWrite={false} />
      </mesh>

      <group position={[0, 1.08, 0]} rotation={[-0.09, 0.18, -0.27]} scale={0.98}>
        <HueyAirframe wrecked />
      </group>
      <WreckFire />

      {/* A blade and door torn clear of the airframe make the damage readable at tank speed. */}
      <mesh position={[-3.85, 0.12, 1.85]} rotation={[0.09, -0.42, -0.05]} scale={[3.2, 0.045, 0.13]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#27281d" roughness={0.96} />
      </mesh>
      <mesh position={[2.25, 0.2, -1.75]} rotation={[0.04, 0.7, 0.12]} scale={[0.78, 0.08, 0.72]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#303424" roughness={0.94} metalness={0.12} />
      </mesh>
      <instancedMesh ref={debrisRef} args={[undefined, undefined, debris.length]}>
        <boxGeometry args={[1.65, 0.12, 1.15]} />
        <meshStandardMaterial color="#32352c" roughness={0.7} metalness={0.48} />
      </instancedMesh>

      {bushes.length > 0 && <instancedMesh ref={bushesRef} args={[fernGeometry, undefined, bushes.length * 3]} receiveShadow>
        <meshStandardMaterial
          vertexColors
          color="#ffffff"
          roughness={0.88}
          side={THREE.DoubleSide}
        />
      </instancedMesh>}

      {/* Creepers crossing the cabin and tail sell that the wreck has been reclaimed by jungle. */}
      {vines.length > 0 && <><instancedMesh ref={vineStemsRef} args={[undefined, undefined, vines.length]}>
        <cylinderGeometry args={[1, 1.25, 1, 5]} />
        <meshStandardMaterial color="#56713c" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={vineLeavesRef} args={[vineGeometry, undefined, vines.length * 3]}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.9} />
      </instancedMesh></>}
    </group>
  );
}

function RicePaddies({ seed, fightingPositionOffsetZ, campaignClearing }: {
  seed: number; fightingPositionOffsetZ: number;campaignClearing:boolean;
}) {
  const terrainDetail = useTerrainDetail();
  const weather=useCrossingWeather();
  const riceRef = useRef<THREE.InstancedMesh>(null);
  const riceCulling = useRef<ReturnType<typeof createStaticInstanceFrustum>>(null);
  const bananaStemsRef = useRef<THREE.InstancedMesh>(null);
  const bananaLeavesRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const time = useMemo(() => ({ value: 0 }), []);
  const riceGeometry = useMemo(createFieldRiceGeometry, []);
  const bananaGeometry = useMemo(createJungleBananaGeometry, []);
  const waterGeometries = useMemo(() => PADDY_FIELDS.map((field, index) =>
    createPaddyWaterGeometry(createPaddyOutline(field, index))), []);
  const bankGeometries = useMemo(() => PADDY_FIELDS.map((field, index) =>
    createPaddyBankGeometry(createPaddyOutline(field, index), field.waterLevel, index + seed)), [seed]);
  const waterMaterial = useMemo(() => shadeFloodedPlot(createWetlandWaterMaterial(time),weather), [time,weather]);
  const bankMaterial = useMemo(() => createPaddyBankMaterial(terrainDetail), [terrainDetail]);
  const bedMaterial = useMemo(() => shadeFloodedPlot(createPaddyBedMaterial(terrainDetail),weather), [terrainDetail,weather]);
  const riceMaterial = useMemo(() => shadeFloodedPlot(createRiceShootMaterial(time),weather), [time,weather]);
  const riceCoverHeight = useMemo(() => {
    const bySandbags = createRiceCoverHeightProfile(getUSFightingPositions(fightingPositionOffsetZ), 0);
    // A linked strip of freshly cut stubble on the western wet plots leads
    // from the ordinary training line toward the open water. Keep full rice
    // on the opposite bank; this is fixed on the ground and not a camera cut.
    if(fightingPositionOffsetZ===0)return (x:number,z:number)=>{
      const center=-5.9-1.65*Math.sin(z*.205+.2);
      const broad=2.75+.52*Math.cos(z*.29);
      const within=1-THREE.MathUtils.smoothstep(Math.abs(x-center),broad-.83,broad+.35);
      const length=THREE.MathUtils.smoothstep(z,-13.2,-11.6)*(1-THREE.MathUtils.smoothstep(z,5.1,6.3));
      return Math.min(bySandbags(x,z),campaignClearing?dayPadGrass(x,z):1,1-.958*within*length);
    };
    return (x:number,z:number)=>Math.min(bySandbags(x,z),paddyCrossingHeight(x,z));
  }, [fightingPositionOffsetZ,campaignClearing]);
  // These are broad banana blades, not little canopy leaves squeezed into
  // six oversized UV islands. Use the blade's own spine, tears and side ribs.
  const leafMaterial = useMemo(() => createJungleUnderstoryMaterial(time), [time]);

  useEffect(() => () => {
    riceGeometry.dispose();
    bananaGeometry.dispose();
    waterGeometries.forEach(geometry => geometry.dispose());
  }, [riceGeometry, bananaGeometry, waterGeometries]);
  useEffect(() => () => {
    waterMaterial.dispose();
    riceMaterial.dispose();
  }, [waterMaterial, riceMaterial]);
  useEffect(() => () => bankMaterial.dispose(), [bankMaterial]);
  useEffect(() => () => bedMaterial.dispose(), [bedMaterial]);
  useEffect(() => () => leafMaterial.dispose(), [leafMaterial]);
  useEffect(() => () => bankGeometries.forEach(geometry => geometry.dispose()), [bankGeometries]);

  const details = useMemo(() => {
    const river = createRiverStations(seed);
    const overlapsBridge = createBridgePlantExclusion(river);
    const seedlings: Array<{ x: number; y: number; z: number; rotation: number; scale: number }> = [];
    const fringe: Array<{ x: number; y: number; z: number; rotation: number; scale: number }> = [];
    PADDY_FIELDS.forEach((field, fieldIndex) => {
      const noise = (index: number, channel: number) => coordinateNoise(index, fieldIndex, seed, channel);
      const outline = createPaddyOutline(field, fieldIndex);
      const columns = Math.floor(field.width / 0.32);
      const rows = Math.floor(field.depth / 0.33);
      // First read: two or three reed beds, not thousands of separate strokes.
      // The large outer shelf and broken opposing tongue leave a clear flooded
      // mouth toward the lane. Mirror alternate ends to avoid identical plots.
      const outside = Math.sign(field.x), end = fieldIndex % 3 === 1 ? -1 : 1;
      const growthAt = (x: number,z: number) => {
        const u = 2 * x * outside / field.width, v = 2 * z * end / field.depth;
        const r = (a:number,b:number) => 1-Math.hypot(a,b);
        const shoulder = fieldIndex===3 ? .70 : field.drainSide==='west' ? .22 : .48;
        const shelf = r((u-shoulder)/.64,(v-.26-.28*Math.sin(u*3+fieldIndex))/.80);
        const tongue = r((u+.25)/.88,(v+.75+.25*u)/.39);
        const toe = r((u+.69)/.32,(v-.66)/.56);
        const growth = Math.max(shelf,tongue,toe) + .09*Math.sin(x*2.3+z+fieldIndex)*Math.cos(z*1.35);
        return Math.min(growth, Math.hypot((u+.66)/.42,(v+.02)/.26)-1);
      };
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const index = row * columns + column;
          // Grouped transplanted shoots leave water and the occasional missing
          // plant visible, rather than a perfectly tiled miniature garden.
          const x = -field.width * 0.5 + 0.2 + column * 0.32 + .075*Math.sin(row*.85+fieldIndex) + (noise(index, 431) - 0.5) * 0.22;
          const z = -field.depth * 0.5 + 0.2 + row * 0.33 + (noise(index, 432) - 0.5) * 0.22;
          const growth = growthAt(x,z);
          if (growth <= -.10 || noise(index,430) > .96*THREE.MathUtils.smoothstep(growth,-.15,.26)) continue;
          if (!isInsideOutline(x, z, outline)) continue;
          const world = paddyLocalToWorld(field, x, z);
          const scale = .40 + .43*THREE.MathUtils.smoothstep(growth,-.10,.75) + .12*noise(index,460);
          if (isInEmbassyClearing(world.x, world.z, 0.25) || isInsideRiverCorridor(world.x, world.z, river, 0.12)
            || overlapsBridge(world.x, world.z, .52 * scale)) continue;
          seedlings.push({ ...world, y: field.waterLevel + 0.004,
            rotation: .85+.60*Math.sin(x*.64+z*.37+fieldIndex)+1.65*(noise(index,450)-.5),
            scale });
        }
      }
      const edge = new THREE.CatmullRomCurve3(outline.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
      for (let plant = 0; plant < 72; plant++) {
        if (noise(plant, 482) < 0.28 || Math.sin(plant * 0.32 + fieldIndex) < -0.38) continue;
        const point = edge.getPointAt((plant + noise(plant, 483) * 0.7) / 72);
        if(growthAt(point.x,point.z)<-.18)continue;
        const world = paddyLocalToWorld(field, point.x + (noise(plant, 484) - 0.5) * 0.17,
          point.z + (noise(plant, 485) - 0.5) * 0.17);
        const scale = 0.18 + noise(plant, 487) * 0.22;
        if (isInEmbassyClearing(world.x, world.z, 0.25) || isInsideRiverCorridor(world.x, world.z, river, 0.12)
          || overlapsBridge(world.x, world.z, .52 * scale)) continue;
        seedlings.push({ ...world, y: field.waterLevel + 0.026,
          rotation: noise(plant, 486) * Math.PI * 2, scale });
      }
      for (let plant = 0; plant < 3; plant++) {
        const side = (plant + fieldIndex) % 2 === 0 ? 1 : -1;
        const world = paddyLocalToWorld(field,
          side * (field.width * 0.5 + 0.15),
          (noise(plant, 601) - 0.5) * field.depth * 0.8);
        const scale = 0.35 + noise(plant, 610) * 0.2;
        if (overlapsBridge(world.x, world.z, 1.97 * scale) || (Math.abs(world.x) < 3.4 && world.z > -24 && world.z < 12)
          || distanceToRoad(world.x) < 1.6 || distanceToRoad(world.z) < 1.6
          || isInEmbassyClearing(world.x, world.z, 0.8) || isInsideRiverCorridor(world.x, world.z, river, 0.8)) continue;
        fringe.push({ ...world, y: field.waterLevel + 0.05,
          rotation: noise(plant, 600) * Math.PI * 2,
          scale });
      }
    });
    return { seedlings, fringe };
  }, [seed]);

  useLayoutEffect(() => {
    const rice = riceRef.current;
    if (!rice) return;
    const tint = new THREE.Color();
    details.seedlings.forEach((plant, index) => {
      const height = riceCoverHeight(plant.x, plant.z);
      const width = plant.scale * (0.72 + 0.28 * height);
      dummy.position.set(plant.x, plant.y, plant.z);
      dummy.rotation.set(0, plant.rotation, 0);
      dummy.scale.set(width, plant.scale * height, width);
      dummy.updateMatrix();
      rice.setMatrixAt(index, dummy.matrix);
      // Value islands span several tufts. Keep the eye on the soldier rather
      // than independently highlighting every folded blade behind their head.
      const island = .5 + .5*Math.sin(plant.x*.66+Math.sin(plant.z*.57)) * Math.cos(plant.z*.74);
      const leafValue = .69+.28*island, clearance = .82+.18*height;
      // Coherent pools of straw-coloured side light on the near, daylit
      // water's edge. Keep the far trees, crouched defenders and wet night
      // unchanged. Baked once per plant; no new draw or fragment work.
      const sun=fightingPositionOffsetZ===0 ?
        THREE.MathUtils.smoothstep(Math.sin(plant.x*.32+plant.z*.19)*.69+
          Math.cos(plant.z*.46-plant.x*.15)*.31,.23,.76)*
          (1-THREE.MathUtils.smoothstep(Math.abs(plant.x),12,20))*
          (1-THREE.MathUtils.smoothstep(Math.abs(plant.z-8),15,25))*height : 0;
      const night = fightingPositionOffsetZ!==0;
      rice.setColorAt(index,tint.setRGB((leafValue+(night?-.13:.48*sun))*clearance,
        (.76+.19*island+(night?-.10:.18*sun))*clearance,
        (.80+.17*island+(night ? .14 : -.21*sun))*clearance));
    });
    if(rice.instanceColor)rice.instanceColor.needsUpdate=true;
    finalizeInstanceMatrices(rice);
    // Keep the rice's complete world bound valid through its shader sway.
    if (rice.boundingSphere) rice.boundingSphere.radius += 0.32;
    riceCulling.current = createStaticInstanceFrustum(rice, 'bounded-tail');
    return () => { riceCulling.current?.restore(); riceCulling.current = null; };
  }, [details, dummy, riceCoverHeight, fightingPositionOffsetZ]);
  useFrame(({camera}) => { riceCulling.current?.update(camera); }, STATIC_FOLIAGE_CULL_PRIORITY);
  useLayoutEffect(() => {
    if (!bananaStemsRef.current || !bananaLeavesRef.current) return;
    details.fringe.forEach((plant, index) => {
      dummy.position.set(plant.x, plant.y + plant.scale * 0.38, plant.z);
      dummy.rotation.set(0, plant.rotation, 0);
      dummy.scale.set(0.075 * plant.scale, plant.scale * 0.76, 0.075 * plant.scale);
      dummy.updateMatrix();
      bananaStemsRef.current!.setMatrixAt(index, dummy.matrix);
      dummy.position.y = plant.y;
      dummy.scale.setScalar(plant.scale);
      dummy.updateMatrix();
      bananaLeavesRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(bananaStemsRef.current);
    finalizeInstanceMatrices(bananaLeavesRef.current);
  }, [dummy, details]);
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });

  return (
    <>
      <group name="rice-paddy-surfaces">
      {PADDY_FIELDS.map((field, index) => (
        <group key={index} position={[field.x, 0, field.z]} rotation={[0, field.rotation, 0]}>
          <mesh geometry={waterGeometries[index]} material={bedMaterial} rotation={[-Math.PI / 2, 0, 0]}
            position={[0, Math.max(field.waterLevel - 0.016, -0.065), 0]} receiveShadow />
          <mesh userData={{contactSurface:"water"}} geometry={waterGeometries[index]} material={waterMaterial}
            rotation={[-Math.PI / 2, 0, 0]} position={[0, field.waterLevel + 0.001, 0]}
            receiveShadow renderOrder={2} />
          <mesh geometry={bankGeometries[index]} material={bankMaterial} receiveShadow />
        </group>
      ))}
      </group>
      <instancedMesh name="paddy-rice-shoots" ref={riceRef} args={[riceGeometry, riceMaterial, details.seedlings.length]} receiveShadow />
      <instancedMesh ref={bananaStemsRef} args={[undefined, undefined, details.fringe.length]}>
        <cylinderGeometry args={[1, 1.35, 1, 7]} />
        <meshStandardMaterial color="#657049" roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={bananaLeavesRef} args={[bananaGeometry, leafMaterial, details.fringe.length]} receiveShadow />
    </>
  );
}
function MudAndPuddles({ seed, defense }: { seed: number; defense:boolean }) {
  const puddlesRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const riverStations = useMemo(() => createRiverStations(seed), [seed]);
  const waterMaterial=useMemo(()=>{
    const material=new THREE.MeshStandardMaterial({
      color:'#1c261e',metalness:.45,roughness:.24,transparent:true,opacity:.7,
    });
    if(defense){
      // reflectWeapons supplies the instanced world position for both glints.
      material.onBeforeCompile=shader=>{
        shader.fragmentShader=eclipseReflectionGLSL+shader.fragmentShader.replace('#include <opaque_fragment>',`
          vec2 p=floor(vRoadWater.xz*20.)/20.;
          float ripple=sin(p.y*8.+sin(p.x*2.7))*cos(p.x*3.8+p.y);
          vec3 mirror=reflect(normalize(vRoadWater-cameraPosition),normalize(vec3(.04*ripple,1.,.06*ripple)));
          outgoingLight+=wetEclipse(mirror,smoothstep(.12,.65,ripple))*(1.-smoothstep(.22,.8,outgoingLight.r));
          #include <opaque_fragment>`);
      };
      material.customProgramCacheKey=()=>'horde-road-water';
    }
    return reflectWeapons(material);
  },[defense]);
  useEffect(()=>()=>waterMaterial.dispose(),[waterMaterial]);
  const puddles = useMemo(() => createDeterministicScatter({
    width: ARENA_WIDTH,
    depth: ARENA_DEPTH,
    cellSize: 9.4,
    minDistance: 6.2,
    seed: seed ^ 0x7a2f,
    maxPoints: 18,
    accept: (x, z) => distanceToRoad(x) < 1.9 || distanceToRoad(z) < 1.9,
  }).map(point => ({
    x: point.x,
    z: point.z,
    scaleX: 0.45 + coordinateNoise(point.cellX, point.cellZ, seed, 44) * 1.35,
    scaleZ: 0.22 + coordinateNoise(point.cellX, point.cellZ, seed, 45) * 0.65,
    rotation: coordinateNoise(point.cellX, point.cellZ, seed, 46) * Math.PI,
  })).filter(puddle => !isInsideRiverCorridor(
    puddle.x,
    puddle.z,
    riverStations,
    Math.max(puddle.scaleX, puddle.scaleZ) + 0.18,
  )), [riverStations, seed]);

  useLayoutEffect(() => {
    if (!puddlesRef.current) return;
    puddles.forEach((puddle, index) => {
      dummy.position.set(puddle.x, -0.038, puddle.z);
      dummy.rotation.set(-Math.PI / 2, 0, puddle.rotation);
      dummy.scale.set(puddle.scaleX, puddle.scaleZ, 1);
      dummy.updateMatrix();
      puddlesRef.current!.setMatrixAt(index, dummy.matrix);
    });
    finalizeInstanceMatrices(puddlesRef.current);
  }, [dummy, puddles]);

  return (
    <>
      <instancedMesh name="road-puddles" userData={{contactSurface:"water"}} ref={puddlesRef} args={[undefined, undefined, puddles.length]}>
        <circleGeometry args={[1, 12]} />
        <primitive object={waterMaterial} attach="material" />
      </instancedMesh>
    </>
  );
}

interface VietnamEnvironmentProps {
  seed?: number;
  tankRef?: RefObject<THREE.Group | null>;
  fightingPositionOffsetZ?: number;
  campaignClearing?:boolean;
  rearOutpost?:boolean;
  landingDestroyed?:boolean;
}

export function VietnamEnvironment({
  seed = DEFAULT_ENVIRONMENT_SEED,
  tankRef,
  fightingPositionOffsetZ = 0,
  campaignClearing = false,
  rearOutpost = false,
  landingDestroyed = false,
}: VietnamEnvironmentProps) {
  const environmentSeed = Number.isFinite(seed) ? Math.trunc(seed) : DEFAULT_ENVIRONMENT_SEED;
  const defense = fightingPositionOffsetZ !== 0;
  const tallPlantClearing = defense ? isInsideDefenseClearing : rearOutpost ? isInsideOutpostClearing : isInsideObjectiveClearing;
  const barkMaterial = useJungleBark();
  const loadedCanopy = useLoader(THREE.TextureLoader, '/images/textures/jungle-branch-spray-v1.png');
  const canopyMap = useMemo(() => {
    loadedCanopy.colorSpace = THREE.SRGBColorSpace;
    loadedCanopy.anisotropy = 4;
    loadedCanopy.generateMipmaps = true;
    loadedCanopy.minFilter = THREE.LinearMipmapLinearFilter;
    loadedCanopy.needsUpdate = true;
    return loadedCanopy;
  }, [loadedCanopy]);
  // One static scatter feeds both the plants and grass beneath those plants.
  // Defer until the textures are ready so suspended initial renders do no scatter.
  const junglePlacements = useMemo(() => {
    const plan=createDenseJunglePlacements({
      seed: environmentSeed, distanceToRoad, isInsideObjectiveClearing:tallPlantClearing, isInsidePaddy,stageRiverBank:!defense,
      dayLanding:campaignClearing&&!defense,
    });
    if(defense) {
      // The old shell track has been driven over. Trim only its own growth,
      // after scattering: no new tree positions, collision, or broad clearing.
      for(const key of ['ferns','broadleaf','bananas','shrubs'] as const)
        plan[key]=plan[key].map(plant=>{
          const h=trackGrassHeight(plant.x,plant.z);
          return h===1?plant:{...plant,sy:plant.sy*h,sx:plant.sx*(.5+.5*h),sz:plant.sz*(.5+.5*h)};
        });
    }
    return plan;
  }, [environmentSeed,tallPlantClearing,defense,campaignClearing]);
  const authoredShrubs = useMemo(() => selectAuthoredShrubPlacements(junglePlacements.shrubs), [junglePlacements]);
  const mirrorCrowns=useMemo(()=>defense?undefined:[...junglePlacements.nearCrowns,...junglePlacements.midCrowns,...junglePlacements.farCrowns,...junglePlacements.palms],[defense,junglePlacements]);

  return (
    <>
      <MudAndPuddles seed={environmentSeed} defense={defense} />
      <SmallRiver seed={environmentSeed} showLanding={!defense} landingDestroyed={landingDestroyed} crowns={mirrorCrowns} barkMap={barkMaterial.map??undefined}/>
      <OldBankFig barkMaterial={barkMaterial} canopyMap={canopyMap} court={defense} dayLanding={campaignClearing&&!defense}/>
      <RicePaddies seed={environmentSeed} fightingPositionOffsetZ={fightingPositionOffsetZ} campaignClearing={campaignClearing} />
      <TerrainRelief seed={seed} />
      <DenseGroundCover seed={environmentSeed} tankRef={tankRef}
        distanceToRoad={distanceToRoad} isInsideObjectiveClearing={rearOutpost ? isInsideOutpostClearing : isInsideObjectiveClearing}
        isInsidePaddy={isInsidePaddy} shrubFootprints={authoredShrubs.selected}
        wornHeight={defense?trackGrassHeight:campaignClearing?dayPadGrass:undefined} />
      <DenseJungle seed={environmentSeed} distanceToRoad={distanceToRoad}
        isInsideObjectiveClearing={tallPlantClearing} isInsidePaddy={isInsidePaddy}
        barkMaterial={barkMaterial} canopyMap={canopyMap}
        placements={junglePlacements} authoredShrubs={authoredShrubs} />
      <DistantBattleSmoke seed={environmentSeed} daylight={!defense}/>
      <FieldFortifications />
      {/* The campaign wreck occupies the Records doorstep in the embassy
          layout. Use the compound's own burning wreckage for this level. */}
      {!defense && <CrashedHuey />}
      <DistantHelicopterFormation />
    </>
  );
}
