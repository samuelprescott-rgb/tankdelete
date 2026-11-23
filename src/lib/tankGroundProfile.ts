import { createRiverCrossings, RIVER_MIN_Z, RIVER_MAX_Z, scaledStationIndexAtZ, estuaryTongue, type RiverStation } from '../components/Scene/riverLayout';
import {riverSection,riverApron,bridgeBoard,bridgeRise,bridgeRampLength,DRY_SOIL,RIVER_BANK_COLUMNS} from '../components/Scene/riverVerticalSection';

export const TANK_GROUND_Y = DRY_SOIL;

/** A small baked height query for the actual soil, river-bank triangles and
 * timber deck. Never treats foliage, huts, or an impassable hill as a ramp. */
export function createTankGroundProfile(stations: RiverStation[], seed: number) {
  const columns = RIVER_BANK_COLUMNS+6;
  // The visible ribbon stores Float32 vertices; use the same rounding at banks.
  const bankX = new Float32Array(stations.length * columns);
  const bankY = new Float32Array(stations.length * columns);
  const bankZ = Float32Array.from(stations, station => station.z);
  const points=stations.map(s=>s.z>15.9&&s.z<27.4?estuaryTongue(s):null);
  for (let row = 0; row < stations.length; row++) {
    const station = stations[row],section=riverSection(station,seed),left=riverApron(station,-1),right=riverApron(station,1);
    const offsets=[...left.offsets.slice(0,3).map(n=>-station.mudHalfWidth-n),...section.offsets,
      ...right.offsets.slice(0,3).reverse().map(n=>station.mudHalfWidth+n)];
    const heights=[...left.heights.slice(0,3),...section.heights,...right.heights.slice(0,3).reverse()];
    for (let column = 0; column < columns; column++) {
      bankX[row * columns + column] = station.centerX + offsets[column];
      bankY[row * columns + column] = heights[column];
    }
  }
  const bridge = createRiverCrossings(stations).find(crossing => crossing.kind === 'bridge');
  const boardCount = bridge ? Math.ceil(bridge.length / 0.38) : 0;
  const spacing = bridge ? bridge.length / boardCount : 1;
  const boards=Array.from({length:boardCount},(_,i)=>{
    const b=bridgeBoard(bridge!,i,boardCount,seed);return {...b,c:Math.cos(b.pitch),s:Math.sin(b.pitch)};
  });

  return {
    /** Allocation-free vertical surface query, matching rendered triangle splits. */
    height(x: number, z: number) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return TANK_GROUND_Y;
      let height = TANK_GROUND_Y;
      if (stations.length > 1 && z >= RIVER_MIN_Z && z <= RIVER_MAX_Z) {
        const scaled = scaledStationIndexAtZ(stations,z);
        let row = Math.min(stations.length - 2, Math.floor(scaled));
        if (row > 0 && z < bankZ[row]) row--;
        if (row < stations.length - 2 && z > bankZ[row + 1]) row++;
        const t = (z - bankZ[row]) / (bankZ[row + 1] - bankZ[row]);
        const a = row * columns, b = a + columns;
        for (let column = 0; column < columns - 1; column++) {
          const ax = bankX[a + column], bx = bankX[b + column];
          const cx = bankX[a + column + 1], dx = bankX[b + column + 1];
          const left = ax + (bx - ax) * t, right = cx + (dx - cx) * t;
          if (x < left || x > right || (cx===ax&&dx===bx)) continue;
          const diagonal = cx + (bx - cx) * t;
          if (x <= diagonal && cx!==ax || dx===bx) {
            const c = (x - left) / (cx - ax);
            height = (1 - t - c) * bankY[a + column]
              + t * bankY[b + column] + c * bankY[a + column + 1];
          } else {
            const bWeight = (right - x) / (dx - bx);
            height = (1 - t) * bankY[a + column + 1]
              + bWeight * bankY[b + column] + (t - bWeight) * bankY[b + column + 1];
          }
          break;
        }
      }
      if(z>16.66&&z<27.34){
        const n=scaledStationIndexAtZ(stations,z),row=Math.floor(n),t=n-row,a=points[row],b=points[row+1];
        if(a&&b)for(let j=0;j<3;j++){
          const ax=a.xs[j],bx=b.xs[j],cx=a.xs[j+1],dx=b.xs[j+1],left=ax+(bx-ax)*t,right=cx+(dx-cx)*t;
          if(x<left||x>right||right-left<1e-7)continue;
          let h;if((x<=cx+(bx-cx)*t&&cx>ax)||dx===bx){const w=(x-left)/(cx-ax);h=(1-t-w)*a.hs[j]+t*b.hs[j]+w*a.hs[j+1];}
          else{const w=(right-x)/(dx-bx);h=(1-t)*a.hs[j+1]+(t-w)*b.hs[j+1]+w*b.hs[j];}
          if(Number.isFinite(h))height=Math.max(height,h);
        }
      }
      if (bridge && Math.abs(x - bridge.centerX) <= bridge.width / 2) {
        // The rendered central bridge is rotated +PI/2: board 0 is its north end.
        const along = bridge.z - z + bridge.length / 2;
        if (along >= 0 && along < bridge.length) {
          const stringerOffset = Math.abs(Math.abs(x - bridge.centerX) - (bridge.width / 2 - 0.30));
          if (stringerOffset <= .105 && Math.abs(z-bridge.z)<=bridge.length*.5-bridgeRampLength(bridge))
            height=Math.max(height,bridgeRise(bridge.z,bridge)-.04);
          const idx=Math.floor(along/spacing),within=along/spacing-idx;
          for(let i=Math.max(0,idx-(within<.12?1:0));i<=Math.min(boards.length-1,idx+(within>.88?1:0));i++){
            const b=boards[i],x=b.z-z,w=b.width/2,h=b.halfHeight;
            if(Math.abs(x+h*b.s)<=w*b.c)height=Math.max(height,b.top+x*b.s/b.c);
            else if(Math.abs(b.s)>.000001){
              const dy=(Math.sign(x)*w-x*b.c)/b.s;
              if(Math.abs(dy*b.c-x*b.s)<=h)height=Math.max(height,b.y+dy);
            }
          }
        }
      }
      return height;
    },
  };
}

export type TankGroundProfile = ReturnType<typeof createTankGroundProfile>;
