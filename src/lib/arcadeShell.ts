import { Matrix3, Raycaster, Vector3, type Mesh } from 'three';
import { firstReliefContact } from './terrain';

// Hand-keyed animation in game time. No gravity, real ammunition parameters,
// armor model, angle test or material response is used by these arcade props.
function ease(time: number, start: number, end: number) {
  const t=Math.max(0,Math.min(1,(time-start)/(end-start)));
  return t*t*(3-2*t);
}
export function shellSag(t: number) {
  return .42*ease(t,.18,1.14)+.68*ease(t,1.55,2.8);
}
export type ArcadePulse = 'ground' | 'pass' | 'bend';
export const FIELD_FLOOR_Y=-.070;
export const CRAWLER={x:-3.8,z:1.5,y:.82,halfLength:1.56,halfWidth:.57,reboot:4.4} as const;
export interface CrawlerState {
  travel:number; x:number; charged:boolean; offline:number; flash:number; hits:number; resets:number;
  contact:Vector3; into:Vector3; outcome:ArcadePulse;
}
export function newCrawlerState():CrawlerState {
  return {travel:0,x:CRAWLER.x,charged:true,offline:0,flash:0,hits:0,resets:0,
    contact:new Vector3(),into:new Vector3(),outcome:'ground'};
}
export function advanceCrawler(s:CrawlerState,dt:number) {
  s.flash=Math.max(0,s.flash-dt);
  const rest=Math.min(s.offline,dt);
  if(s.offline>0 && s.offline-rest<=1e-8){s.charged=true;s.resets++;}
  s.offline=Math.max(0,s.offline-rest);
  if(s.offline<1e-8)s.offline=0;
  s.travel+=dt-rest;
  s.x=CRAWLER.x+.52*Math.sin(s.travel*.78);
}
export function signalCrawler(s:CrawlerState,bay:'cell'|'empty',inward:number):ArcadePulse {
  if(s.offline>0)return 'ground'; // never prolong a reboot
  s.hits++;s.flash=.55;
  if(inward<.58)return 'bend'; // a glancing brush plays a harmless shield skip
  if(bay==='cell' && s.charged){s.charged=false;return 'pass';}
  s.charged=false;s.offline=CRAWLER.reboot;return 'pass';
}
/** Whole little cargo bay, not a real-world armor/anatomy model. Slab sweep
 * means an already offline cart still absorbs a round before any file. */
const cargoCast=new Raycaster(),cargoRay=new Vector3(),cargoNormal=new Matrix3();
export function firstCrawlerContact(a:Vector3,b:Vector3,s:CrawlerState,mesh:Mesh|null) {
  if(!mesh)return null;
  let enter=0,exit=1;
  const limits=[[-1.7+s.x,s.x+1.7],[-.25,1.65],[CRAWLER.z-.69,CRAWLER.z+.69]] as const;
  const axes=['x','y','z'] as const;
  for(let i=0;i<3;i++){
    const axis=axes[i],o=a[axis],d=b[axis]-o,[lo,hi]=limits[i];
    if(Math.abs(d)<1e-10){if(o<lo||o>hi)return null;continue;}
    const p=(lo-o)/d,q=(hi-o)/d;
    enter=Math.max(enter,Math.min(p,q));exit=Math.min(exit,Math.max(p,q));
    if(enter>exit)return null;
  }
  const length=cargoRay.subVectors(b,a).length();
  if(length<1e-8)return null;
  mesh.updateWorldMatrix(true,false);
  cargoCast.set(a,cargoRay.divideScalar(length));cargoCast.far=length;
  const hit=cargoCast.intersectObject(mesh,false)[0];
  if(!hit?.face)return null;
  const normal=hit.face.normal.clone().applyNormalMatrix(cargoNormal.getNormalMatrix(mesh.matrixWorld));
  return {t:hit.distance/length,normal,point:hit.point,inward:-normal.dot(cargoRay),
    bay:hit.point.x<mesh.matrixWorld.elements[12]?'cell' as const:'empty' as const};
}

export function firstFieldContact(a: Vector3,b: Vector3):number | null {
  const floor=a.y<=FIELD_FLOOR_Y?0:b.y<=FIELD_FLOOR_Y?(FIELD_FLOOR_Y-a.y)/(b.y-a.y):Infinity;
  const best=floor===0?0:firstReliefContact(a,b,floor);
  return Number.isFinite(best)?best:null;
}
