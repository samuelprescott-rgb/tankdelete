import * as THREE from 'three';
import { SMOKE_DRIFT_RATE } from './smokeMotion';
import {createNapalmParticleGeometry,createNapalmParticleMaterial} from './napalmMaterials';

/** Shared by transient strikes and persistent fuel pockets. The caller owns both GPU objects. */
export function createSmokeFoldArt(count:number,time:{value:number},atlas:THREE.Texture, airInk?:string){
  return {geometry:createNapalmParticleGeometry(2,2,count,'smoke'),
    material:createNapalmParticleMaterial(time,'smoke',atlas,airInk)};
}

export interface SmokeFold {
  x:number; z:number; lifetime:number; rise:number; size:number; sway:number; driftX:number; driftZ:number;
  riseDrag?:number;
}

export const SMOKE_FOLDS = 5;

/** Birth time in game seconds, relative to ignition at this fuel pocket. */
export function smokeFoldDelay(layer:number, lifetime:number, phase:number) {
  return .025 + .055*Math.abs(Math.sin(phase*2.73)) + layer * lifetime / (SMOKE_FOLDS * SMOKE_DRIFT_RATE);
}

// Moving particle instances have only scale and translation. Keep their
// original slot (including the matching shader seed and alpha draw order).
// Slots not yet reached by the sweep start degenerate, not identity quads.
export function writeParticle(mesh: THREE.InstancedMesh, index: number,
  x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const a = mesh.instanceMatrix.array, o = index * 16;
  a[o] = sx; a[o + 5] = sy; a[o + 10] = sz;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z;
}

/** Place one fold of the six-cel smoke animation in the emitter's local space. */
export function writeSmokeFold(mesh: THREE.InstancedMesh, index: number, particle: SmokeFold,
  localAge: number, time: number, strength: number) {
  const life = (Math.max(0, localAge) * SMOKE_DRIFT_RATE % particle.lifetime) / particle.lifetime;
  // Show the first small shoulder within a few frames. Broadening it follows
  // the slow plume clock, independently of the brief emergence at ignition.
  const cycleSeconds = life * particle.lifetime / SMOKE_DRIFT_RATE;
  const emergence = THREE.MathUtils.smoothstep(cycleSeconds, 0, .19);
  const growth = .45 + .55 * THREE.MathUtils.smoothstep(life, .025, .23);
  const fade = emergence * growth * (1 - THREE.MathUtils.smoothstep(life, .74, 1));
  const turn = particle.sway + time * SMOKE_DRIFT_RATE * 1.36 - life * 7.7;
  const catchUp = .055 * Math.sin(turn) * Math.sin(Math.PI * life);
  const lift = life + catchUp;
  // Hot river air rises first. As it cools, the same parcel loses lift
  // and travels farther downwind between successive heights.
  const drag = (particle.riseDrag ?? 0) * lift * (1-lift);
  // The new fold stays narrow between the flame tips before it opens into a cloud.
  const spread = .80 + .20 * THREE.MathUtils.smoothstep(life, .10, .36);
  const size = particle.size * (.91 + life * 1.10) * fade * strength;
  writeParticle(mesh, index,
    particle.x + particle.driftX * (lift-drag) + Math.sin(turn) * (.08 + .45 * life),
    .76 + (lift+drag) * particle.rise,
    particle.z + particle.driftZ * (lift-drag) + Math.cos(turn) * (.05 + .30 * life),
    size * spread * (1.85 + .25*Math.sin(turn)), size * (1.93 + life*.48 - .24*Math.sin(turn)), 1);
}
