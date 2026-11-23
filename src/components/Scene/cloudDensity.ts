import type { InstancedMesh } from 'three';
import { SMOKE_DRIFT_RATE } from './smokeMotion';
import { SMOKE_FOLDS, smokeFoldDelay, writeSmokeFold } from './pixelSmokeFold';

/** Local-space plume. Wind is the horizontal displacement at full height. */
export function createFireSmokePlume(phase:number, windX:number, windZ:number, riverbank=false) {
  const lifetime = 4.1 + (phase % 4) * .23;
  return Array.from({length:SMOKE_FOLDS}, (_, i) => {
    const angle = i * 2.40 + phase * 1.73;
    const fold={x:.20*Math.cos(angle), z:.16*Math.sin(angle), lifetime, rise:6.5+.48*Math.sin(angle),
      size:.90+.12*Math.cos(angle), sway:angle, driftX:windX+.22*Math.cos(angle), driftZ:windZ,
      delay:smokeFoldDelay(i,lifetime,phase)};
    if(!riverbank)return fold;
    // The jetty is already smouldering when the tank arrives. Evenly spaced births keep the
    // nearest rolling shoulder within reach of the smoke rooted in the fire bed.
    const period=9.65;
    return {...fold, lifetime:period, rise:5.7+.85*Math.cos(angle),
      riseDrag:.64, driftX:windX*(1+.24*Math.cos(angle)), driftZ:windZ+.54*Math.sin(angle),
      delay:-(i+.42)*period/(SMOKE_FOLDS*SMOKE_DRIFT_RATE), size:fold.size*(1+.15*Math.sin(angle))};
  });
}

/** Age starts at ignition, independently of the scene clock or pooled mesh slot. */
export function updateFireSmokePlume(mesh:InstancedMesh, folds:ReturnType<typeof createFireSmokePlume>,
  age:number, time:number, strength=1) {
  let count=0;
  for(const fold of folds){
    const localAge=age-fold.delay;
    if(localAge<=0)break;
    writeSmokeFold(mesh,count++,fold,localAge,time,strength);
  }
  mesh.count=count;
  if(count)mesh.instanceMatrix.needsUpdate=true;
}
