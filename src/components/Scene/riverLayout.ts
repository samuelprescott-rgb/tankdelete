import { coordinateNoise } from './environmentGeneration';

export interface RiverStation {
  centerX: number;
  mudHalfWidth: number;
  waterHalfWidth: number;
  z: number;
  cut?:number;
}

// One deterministic layout drives rendering, scenery rejection, tank handling,
// and water effects. Keeping the route math here prevents those systems from
// slowly drifting out of alignment as the environment evolves.
export const RIVER_BASE_STATIONS = 97;
const FIRST_POOL_ROW=50,LAST_POOL_ROW=57,EXTRA_PER_ROW=3;
const FIRST_OUTLET_ROW=58,LAST_OUTLET_ROW=80;
export const RIVER_STATION_COUNT=RIVER_BASE_STATIONS+(LAST_POOL_ROW-FIRST_POOL_ROW)*EXTRA_PER_ROW+LAST_OUTLET_ROW-FIRST_OUTLET_ROW;
export const RIVER_MIN_Z = -64;
export const RIVER_MAX_Z = 64;
export const RIVER_CROSSING_Z = 16;
export const RIVER_CROSSINGS = [
  { z: -16, kind: 'ford', width: 4.4, axis: 'x' },
  { z: RIVER_CROSSING_Z, kind: 'bridge', width: 4.7, axis: 'z' },
] as const;

// Hydraulic survey of the settlement outlet. The low eastern floodplain
// opens first, beyond the near huts; the opposed margin then sweeps back
// around the still-dry fishing sill. Staggering the two cuts makes a curved
// fairway and preserves a shallow promontory, rather than dilating a line.
const reachEase=(z:number,a:number,b:number)=>.5-.5*Math.cos(Math.PI*Math.min(1,Math.max(0,(z-a)/(b-a))));
export function estuaryMargins(z:number){
  if(z<=13||z>=43)return {west:0,east:0};
  const east=3.10*reachEase(z,13,19)*(1-reachEase(z,35,43))
    +4.2*reachEase(z,24.15,25.95)*(1-reachEase(z,26.1,28.85))
    -1.75*reachEase(z,26.7,28.5)*(1-reachEase(z,29.4,32.5))
    +5.3*reachEase(z,30.2,34.3)*(1-reachEase(z,37.4,43));
  const west=11.40*reachEase(z,24.15,28.4)*(1-reachEase(z,33.5,40.7))
    -3.55*reachEase(z,27.6,30.1)*(1-reachEase(z,30.3,32.9))
    +2.8*reachEase(z,30.8,33.65)*(1-reachEase(z,34.3,37));
  return {west,east};
}

export interface RiverCrossing {
  z: number; centerX: number; length: number; width: number; rotation: number;
  kind: 'bridge' | 'ford'; axis: 'x' | 'z';
}
const crossingCache = new WeakMap<RiverStation[], RiverCrossing[]>();

// Broad bends thread the existing low ground, not the hill mesh. This authored
// safety spine leaves the spawn, central paddy lanes and file objective intact;
// smooth seeded variation changes the banks without rerouting the battlefield.
const RIVER_SPINE = [
  [-54, -64], [-53, -49], [-41, -38], [-26, -26], [-21, -21],
  [-23, -14], [-24, -6], [-21, 2], [-12, 7], [-3, 13],
  [2, 19], [18, 28], [32, 39], [42, 49], [37, 59], [35, 64],
] as const;

function riverSpineX(z: number) {
  let index = 0;
  while (index < RIVER_SPINE.length - 2 && z > RIVER_SPINE[index + 1][1]) index++;
  const a = RIVER_SPINE[index], b = RIVER_SPINE[index + 1];
  const before = RIVER_SPINE[Math.max(0, index - 1)], after = RIVER_SPINE[Math.min(RIVER_SPINE.length - 1, index + 2)];
  const length = b[1] - a[1], t = Math.max(0, Math.min(1, (z - a[1]) / length));
  const slopeA = (b[0] - before[0]) / (b[1] - before[1]);
  const slopeB = (after[0] - a[0]) / (after[1] - a[1]);
  return (2 * t ** 3 - 3 * t ** 2 + 1) * a[0] + (t ** 3 - 2 * t ** 2 + t) * length * slopeA
    + (-2 * t ** 3 + 3 * t ** 2) * b[0] + (t ** 3 - t ** 2) * length * slopeB;
}

export function createRiverStations(seed: number): RiverStation[] {
  const stableSeed = Number.isFinite(seed) ? Math.trunc(seed) : 1968;
  const phase = coordinateNoise(0, 0, stableSeed, 810) * Math.PI * 2;
  const widthPhase = coordinateNoise(0, 0, stableSeed, 811) * Math.PI * 2;
  const deposits:number[]=[], directions:number[]=[];
  const stations = Array.from({ length: RIVER_BASE_STATIONS }, (_, index) => {
    const progress = index / (RIVER_BASE_STATIONS - 1);
    const z = RIVER_MIN_Z + (RIVER_MAX_Z - RIVER_MIN_Z) * progress;
    const seededBend = Math.sin(z * 0.081 + phase) * 0.22 + Math.sin(z * 0.173 - phase) * 0.08;
    // The stream opens into a broad backwater at the village bridge, then
    // pinches back between the hills. It is real water: plots, foliage,
    // deck span, mirrored glyphs, tank drag and suspension share this bank.
    const reach = Math.min(1,Math.abs((z-17)/10.8));
    const backwater = (1+Math.cos(Math.PI*reach))*.5 * 3.35;
    // Cut a second, offset lobe on the *inside* (east) bank of the bend.
    // The opposing, hill-bound margin stays fixed. Water reaches the outer
    // sightline along the approach instead of disappearing behind the bents.
    // Scour the western side of the upstream reach and deposit the beach on
    // its eastern edge. The eastern bank at (-5.4,8) carries the opening
    // embassy infantry: its original dry margin must never recede.
    const beach = 1.1*(1+Math.cos(Math.PI*Math.min(1,Math.abs((z-8.4)/5.3))))*.5;
    const elbow = 1.42*(1+Math.cos(Math.PI*Math.min(1,Math.abs((z-9.5)/5.3))))*.5 + .10*beach;
    const plainWidth = 1.70 + Math.sin(z * 0.092 + widthPhase) * 0.23
      + Math.sin(z * 0.21 - widthPhase * 0.7) * 0.10 + backwater;
    // Erosion takes bites INto the two margins, not out of the safeguarded
    // scenery envelope. The broader shores remain big enough for soil bars.
    const scallop = .16*(.5+.5*Math.sin(z*.74+phase))+.15*(.5+.5*Math.sin(z*1.57-widthPhase));
    // Alternating point bars move only the depositing shore. The opposite
    // bank stays put: losing the offset here gives a canal with symmetrical
    // scallops. Each bar tapers before the span or scripted landing site.
    const bar=(center:number,run:number)=>.5+.5*Math.cos(Math.PI*Math.min(1,Math.abs(z-center)/run));
    const westShelf=.76*bar(4.9,3.4)+.66*bar(23.6,3.45),eastShelf=.85*bar(9.1,3.05);
    const available=plainWidth-scallop+elbow;
    const fit=Math.min(1,Math.max(0.,available-1.09)/Math.max(.001,.5*(westShelf+eastShelf)));
    const deposit=.5*(westShelf+eastShelf)*fit,drift=.5*(westShelf-eastShelf)*fit;
    const waterHalfWidth=plainWidth-scallop+elbow-deposit;
    deposits.push(deposit);directions.push(deposit>0?drift/deposit:0);

    return {
      centerX: riverSpineX(z) + seededBend + backwater*.16+elbow-.82*beach+drift,
      mudHalfWidth: plainWidth + elbow-deposit + 0.72 + Math.sin(z * 0.17 + phase * 0.6) * 0.13,
      waterHalfWidth,
      z,
    };
  });
  // A sediment tongue cannot create a vertical step next to the already steep
  // old backwater. Feather just its deposited edge into the adjacent survey.
  for(const dir of [1,-1])for(let i=dir>0?1:stations.length-2;i>=0&&i<stations.length;i+=dir){
    const a=stations[i],restore=Math.min(deposits[i],Math.max(0,stations[i-dir].waterHalfWidth-a.waterHalfWidth-.93));
    a.waterHalfWidth+=restore;a.mudHalfWidth+=restore;a.centerX-=directions[i]*restore;deposits[i]-=restore;
  }
  // There are two eroded pockets on approach to the trestle. A short,
  // surviving spur between them carries the upper-bank foot patrol.
  // Cross-sections run east/west whereas this reach flows diagonally; an
  // actual three-metre cove normal to the flow needs much more X setback.
  // Move BOTH wet and dry feet, not just the shader/depth or the post-cuts:
  // the clay mesh, wake, contact survey and stone/root frames must all agree.
  const detailed:RiverStation[]=[];
  for(let i=0;i<stations.length;i++){
    const a=stations[i];detailed.push({...a});
    const extra=i>=FIRST_POOL_ROW&&i<LAST_POOL_ROW?EXTRA_PER_ROW:i>=FIRST_OUTLET_ROW&&i<LAST_OUTLET_ROW?1:0;
    if(!extra)continue;
    const b=stations[i+1];
    for(let j=1;j<=extra;j++){
      const t=j/(extra+1);
      detailed.push({z:lerp(a.z,b.z,t),centerX:lerp(a.centerX,b.centerX,t),
        waterHalfWidth:lerp(a.waterHalfWidth,b.waterHalfWidth,t),mudHalfWidth:lerp(a.mudHalfWidth,b.mudHalfWidth,t)});
    }
  }
  for(const s of detailed){
    const z=s.z;if(z<=2.67||z>=11.6)continue;
    const lobe=(centre:number,span:number)=>.5+.5*Math.cos(Math.PI*Math.min(1,Math.abs((z-centre)/span)));
    const west=3.64*lobe(5.17,1.68)+4.33*lobe(9.03,1.49);
    // Opposing gravel bar bows into this reach, but a short upstream
    // return opens the near side. Nothing is cut toward the bridge or
    // toward the old paddy-side formation.
    const east=.63*lobe(5.0,1.56)-.84*lobe(8.4,2.28);
    s.centerX+=(east-west)*.5;
    s.waterHalfWidth+=(east+west)*.5;
    s.mudHalfWidth+=(east+west)*.5;
  }
  // Construct once here, never scan a route when a tank's frame query runs.
  for(const s of detailed){
    let {west,east}=estuaryMargins(s.z);
    if(!west&&!east)continue;
    // Existing hamlet plinths survive as dry rounded points on BOTH banks,
    // even in a directory large enough to use all 256 permanent addresses.
    // Pin a few metres of each shoreline locally, not the centre of the
    // stream: the opposite branch carries the flow around each terrace.
    for(const [x,z,side] of [[6.5,26.1,-1],[12.68,30.45,-1],[17.7,34.1,-1],[19.65,38.2,-1],[22.5,26.1,1]]){
      const weight=1-reachEase(Math.abs(s.z-z),1.0,3.4),edge=s.centerX+side*s.mudHalfWidth,
        room=Math.max(0,(x-edge)*side-3.70);
      if(side<0)west-=Math.max(0,west-room)*weight;
      else east-=Math.max(0,east-room)*weight;
    }
    s.centerX+=(east-west)*.5;s.waterHalfWidth+=(west+east)*.5;s.mudHalfWidth+=(west+east)*.5;
    // Tidal gut curling around the western side of the raised north sill.
    // The old inner edge remains as a real dry peninsula within the expanded
    // hydraulic ribbon; both mouths share the level of the main fairway.
    const toe=s.centerX-s.waterHalfWidth,cut=Math.max(0,toe+6.35)*reachEase(s.z,16.9,20.7)*(1-reachEase(s.z,21.9,26.5));
    if(cut>0){s.cut=cut;s.centerX-=cut*.5;s.waterHalfWidth+=cut*.5;s.mudHalfWidth+=cut*.5;}
  }
  createRiverCrossings(detailed);
  return detailed;
}

export function scaledStationIndexAtZ(stations: RiverStation[], z: number) {
  if (stations.length < 2 || !Number.isFinite(z) || z < RIVER_MIN_Z || z > RIVER_MAX_Z) return -1;
  const progress = Math.max(0, Math.min(1, (z - RIVER_MIN_Z) / (RIVER_MAX_Z - RIVER_MIN_Z)));
  if(stations.length!==RIVER_STATION_COUNT)return progress*(stations.length-1);
  const base=progress*(RIVER_BASE_STATIONS-1);
  // Constant-time exact row for height, wake and collision. All unchanged
  // stretches keep the original sparse spacing and coordinates.
  return base+EXTRA_PER_ROW*Math.min(LAST_POOL_ROW-FIRST_POOL_ROW,Math.max(0,base-FIRST_POOL_ROW))
    +Math.min(LAST_OUTLET_ROW-FIRST_OUTLET_ROW,Math.max(0,base-FIRST_OUTLET_ROW));
}

function lerp(start: number, end: number, mix: number) {
  return start + (end - start) * mix;
}

/** Static construction helper; frame-time corridor tests remain allocation-free. */
export function sampleRiverStation(stations: RiverStation[], z: number): RiverStation | undefined {
  const scaledIndex = scaledStationIndexAtZ(stations, z);
  if (scaledIndex < 0) return undefined;
  const lowerIndex = Math.min(stations.length - 2, Math.floor(scaledIndex));
  const a = stations[lowerIndex], b = stations[lowerIndex + 1], mix = scaledIndex - lowerIndex;
  return { z, centerX: lerp(a.centerX, b.centerX, mix), waterHalfWidth: lerp(a.waterHalfWidth, b.waterHalfWidth, mix),
    mudHalfWidth: lerp(a.mudHalfWidth, b.mudHalfWidth, mix),cut:lerp(a.cut??0,b.cut??0,mix) };
}

/** Finite strip of old alluvium beneath the road and fishing sill. The west
 * lip curves into the mouth, with both lower edges physically below water. */
export function estuaryTongue(s:RiverStation){
  const wet=s.centerX-s.waterHalfWidth,r=wet+(s.cut??0),l=Math.min(r,Math.max(wet-.60,-3.11-.18*Math.cos((s.z-21)*1.36)));
  const w=(s.cut??0)>0?r-l:0,outer=Math.min(.60,w*.34),inner=Math.min(s.mudHalfWidth-s.waterHalfWidth,w*.32),
    top=-.616+.546*reachEase(w,0,.94);
  return {xs:[r-w,r-w+outer,r-inner,r],hs:[-.621,top,top,-.621]};
}
/** Signed distance to the remaining dry point. Positive is protected land. */
function tongueInside(x:number,z:number,stations:RiverStation[]){
  if(z<16.66||z>27.34)return -Infinity;
  const s=sampleRiverStation(stations,z);if(!s?.cut)return -Infinity;
  const {xs}=estuaryTongue(s);return Math.min(x-xs[1],xs[2]-x);
}

/** Road-aligned deck/ford spans the complete bend across its width, not just its midpoint. */
export function createRiverCrossings(stations: RiverStation[]) {
  if (stations.length < 2) return [];
  const cached = crossingCache.get(stations);
  if (cached) return cached;
  const crossings: RiverCrossing[] = RIVER_CROSSINGS.map(crossing => {
    if (crossing.axis === 'z') {
      // The central road runs north/south. Bound the complete river/road
      // intersection, including both deck edges, so neither abutment is wet.
      let start = Infinity, end = -Infinity;
      for (let step = 0; step <= 320; step++) {
        const z = crossing.z - 20 + step * 0.125;
        const station = sampleRiverStation(stations, z)!;
        if (station.centerX + station.mudHalfWidth < -crossing.width * 0.5
          || station.centerX - station.mudHalfWidth+(station.cut??0) > crossing.width * 0.5) continue;
        start = Math.min(start, z); end = Math.max(end, z);
      }
      // Dry timber run-ons beyond both wet margins give the higher carriageway
      // an actual approach grade. Bias the longer run toward the village road.
      start=Math.min(start-.22,Math.max(8.85,start-1.4));end+=.43;
      return { ...crossing, centerX: 0, z: (start + end) * 0.5, length: end - start, rotation: Math.PI * 0.5 };
    }
    let left = Infinity, right = -Infinity;
    for (let step = 0; step <= 12; step++) {
      const station = sampleRiverStation(stations, crossing.z + (step / 12 - 0.5) * crossing.width)!;
      left = Math.min(left, station.centerX - station.mudHalfWidth);
      right = Math.max(right, station.centerX + station.mudHalfWidth);
    }
    return { ...crossing, centerX: (left + right) * 0.5, length: right - left + 1.1, rotation: 0 };
  });
  crossingCache.set(stations, crossings);
  return crossings;
}

/** Bake the bridge's planted-area exclusion once per scenery plan. */
export function createBridgePlantExclusion(stations: RiverStation[]) {
  const bridge = createRiverCrossings(stations).find(crossing => crossing.kind === 'bridge');
  if (!bridge) return (_x: number, _z: number, _radius: number) => false;
  const { centerX, z: centerZ, rotation, length, width } = bridge;
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const halfLength = length / 2 + 2, halfWidth = width / 2 + .08;
  // Circle vs. oriented plank footprint, extended onto dry ground at either end.
  // Test the foliage's full horizontal sweep, not just its root, once at scatter time.
  return (x: number, z: number, radius: number) => {
    const dx = x - centerX, dz = z - centerZ;
    const along = Math.max(0, Math.abs(dx*c - dz*s) - halfLength);
    const across = Math.max(0, Math.abs(dx*s + dz*c) - halfWidth);
    return along*along + across*across <= radius*radius;
  };
}

/** Road/ford occupancy for gameplay and terrain. */
export function riverCrossingAmount(x: number, z: number, crossing: RiverCrossing, feather = 0.35) {
  const along = crossing.axis === 'x' ? Math.abs(x - crossing.centerX) : Math.abs(z - crossing.z);
  const across = crossing.axis === 'x' ? Math.abs(z - crossing.z) : Math.abs(x - crossing.centerX);
  const gap = Math.max(along - crossing.length * 0.5, across - crossing.width * 0.5);
  if (gap <= 0) return 1;
  if (gap >= feather || feather <= 0) return 0;
  const t = 1 - gap / feather;
  return t * t * (3 - 2 * t);
}

/** Exact horizontal corridor test for the piecewise-linear river banks. */
export function isInsideRiverCorridor(
  x: number,
  z: number,
  stations: RiverStation[],
  padding = 0,
) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(padding)) return false;
  if (z < RIVER_MIN_Z - padding || z > RIVER_MAX_Z + padding) return false;
  const clampedZ = Math.max(RIVER_MIN_Z, Math.min(RIVER_MAX_Z, z));
  const scaledIndex = scaledStationIndexAtZ(stations, clampedZ);
  if (scaledIndex < 0) return false;
  const lowerIndex = Math.min(stations.length - 2, Math.floor(scaledIndex));
  const lower = stations[lowerIndex];
  const upper = stations[lowerIndex + 1];
  const mix = scaledIndex - lowerIndex;
  const centerX = lerp(lower.centerX, upper.centerX, mix);
  const halfWidth = lerp(lower.mudHalfWidth, upper.mudHalfWidth, mix);
  return Math.abs(x - centerX) <= halfWidth + padding && tongueInside(x,z,stations)<=padding;
}

/**
 * Returns a soft 0..1 immersion value inside the visible water. The feathered
 * edge makes wake intensity and future handling changes enter without a pop.
 */
export function riverWaterImmersion(
  x: number,
  z: number,
  stations: RiverStation[],
  edgeFeather = 0.32,
) {
  if (!Number.isFinite(x) || !Number.isFinite(edgeFeather)) return 0;
  const scaledIndex = scaledStationIndexAtZ(stations, z);
  if (scaledIndex < 0) return 0;
  const lowerIndex = Math.min(stations.length - 2, Math.floor(scaledIndex));
  const lower = stations[lowerIndex];
  const upper = stations[lowerIndex + 1];
  const mix = scaledIndex - lowerIndex;
  const centerX = lerp(lower.centerX, upper.centerX, mix);
  const halfWidth = lerp(lower.waterHalfWidth, upper.waterHalfWidth, mix);
  const distanceFromEdge = Math.min(halfWidth-Math.abs(x-centerX),-tongueInside(x,z,stations));
  if (distanceFromEdge <= 0) return 0;
  const linear = edgeFeather <= 0 ? 1 : Math.min(1, distanceFromEdge / edgeFeather);
  let immersion = linear * linear * (3 - 2 * linear);
  for (const crossing of createRiverCrossings(stations)) {
    immersion *= 1 - riverCrossingAmount(x, z, crossing) * (crossing.kind === 'bridge' ? 1 : 0.8);
  }
  return immersion;
}

/** Distance from a point to the water edge, or Infinity beyond its endpoints. */
export function distanceToRiverWater(x: number, z: number, stations: RiverStation[]) {
  if (!Number.isFinite(x)) return Number.POSITIVE_INFINITY;
  const scaledIndex = scaledStationIndexAtZ(stations, z);
  if (scaledIndex < 0) return Number.POSITIVE_INFINITY;
  const lowerIndex = Math.min(stations.length - 2, Math.floor(scaledIndex));
  const lower = stations[lowerIndex];
  const upper = stations[lowerIndex + 1];
  const mix = scaledIndex - lowerIndex;
  const centerX = lerp(lower.centerX, upper.centerX, mix);
  const halfWidth = lerp(lower.waterHalfWidth, upper.waterHalfWidth, mix);
  return Math.max(0, Math.abs(x - centerX) - halfWidth,tongueInside(x,z,stations));
}
