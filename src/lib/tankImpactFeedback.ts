import { MathUtils, type Object3D, type Vector3 } from 'three';

/** Cosmetic only: no health, mobility penalty, weapon state, or file writes. */
export type TankImpactPanel = 'left-track' | 'right-track' | 'engine';
export interface TankImpactContact {
  panel: TankImpactPanel;
  /** Presentation anchor in the unscaled hull frame, not world coordinates. */
  x: number; y: number; z: number;
}
export interface TankImpactFeed { revision: number; epoch: number; contact: TankImpactContact | null }
export const newTankImpactFeed = ():TankImpactFeed => ({revision:0,epoch:0,contact:null});
export function resetTankImpact(feed:TankImpactFeed) { feed.epoch++;feed.revision++;feed.contact=null; }

/** The combat systems supply a swept contact or a nearby melee position.
 * Area damage, a blast centered on the tank, and remote positions don't
 * identify a panel: the existing general HUD response is sufficient. */
export function publishTankImpact(feed:TankImpactFeed, tank:Object3D|null, world?:Vector3) {
  feed.revision++; feed.contact=null;
  if(!tank || !world || ![world.x,world.y,world.z].every(Number.isFinite))return;
  const local=tank.worldToLocal(world.clone());
  const {x,y,z}=local, side=Math.abs(x), reach=Math.hypot(x,z);
  if(y<-.4 || y>1.85 || reach<.43 || reach>2.32)return;
  if(z>.52 && z>side*1.28) {
    feed.contact={panel:'engine',x:MathUtils.clamp(x,-.34,.34),y:.589,z:1.05};
  } else if(side>.39 && side>Math.abs(z)*.67) {
    feed.contact={panel:x<0?'left-track':'right-track',x:Math.sign(x)*.861,
      y:.429,z:MathUtils.clamp(z,-1.03,.98)};
  }
}
