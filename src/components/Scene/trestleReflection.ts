import {Vector4} from 'three';
import type {BridgePiece} from './bridgeTimber';
import type {RiverCrossing} from './riverLayout';
import {bridgeRampLength} from './riverVerticalSection';

/** Bake a water-ray proxy from the actual rendered pieces once, not from a
 * second set of surveyed dimensions. The four bents are exact boxes. Seven
 * slab sections follow the plank undersides; sub-centimetre seams are closed. */
export function trestleReflection(bridge:RiverCrossing,pieces:readonly BridgePiece[]) {
  const boards=pieces.filter(p=>!p.kind&&p.scaleZ>bridge.width*.8).sort((a,b)=>a.z-b.z);
  const heads=pieces.filter(p=>p.kind==='headstock').sort((a,b)=>a.z-b.z);
  const at=(kind:BridgePiece['kind'],z:number,side:number)=>pieces.find(p=>p.kind===kind&&Math.abs(p.z-z)<.01&&Math.sign(p.x-bridge.centerX)===side)!;
  const half=bridge.length*.5,ramp=bridgeRampLength(bridge);
  const cuts=[-half,-half+.15*ramp,-half+.85*ramp,-half+ramp,half-ramp,half-.85*ramp,half-.15*ramp,half];
  const bottom=(localZ:number)=>{
    const z=localZ+bridge.z,p=boards.reduce((a,b)=>Math.abs(b.z-z)<Math.abs(a.z-z)?b:a);
    return p.y-p.scaleY*.5/Math.cos(p.pitch??0)+(p.z-z)*Math.tan(p.pitch??0);
  };
  const deck=cuts.slice(1).map((b,i)=>{
    const a=cuts[i],start=bottom(a);return new Vector4(a,b,start,(bottom(b)-start)/(b-a));
  });
  const top=(p:BridgePiece)=>p.y+p.scaleY*.5,low=(p:BridgePiece)=>p.y-p.scaleY*.5;
  const pile=at('pile',heads[0].z,1),post=at('post',heads[0].z,1),head=heads[0];
  const stations=heads.map(h=>new Vector4(h.z-bridge.z,top(at('pile',h.z,1)),top(at('post',h.z,-1)),top(at('post',h.z,1))));
  const packed=(v:Vector4[])=>Float32Array.from(v.flatMap(t=>t.toArray()));
  return {
    // Typed uniform data is uploaded as-is; no renderer-side per-frame vector flattening.
    frame:new Vector4(bridge.centerX,bridge.z,bridge.width*.5,half),deck:packed(deck),stations:packed(stations),
    // signed X comes from the selected bank; each bent has its own seeded post tops
    pile:new Vector4(pile.x-bridge.centerX,pile.scaleX*.5,pile.scaleZ*.5,low(pile)),
    post:new Vector4(post.scaleX*.5,post.scaleZ*.5,low(post)-top(pile),Math.max(...stations.map(v=>Math.max(v.z,v.w)))),
    head:new Vector4(head.scaleX*.5,head.scaleZ*.5,low(head)-top(pile),top(head)-top(pile)),
    thickness:Math.max(...boards.map(p=>p.scaleY/Math.cos(p.pitch??0))),
  };
}
export type TrestleReflection=ReturnType<typeof trestleReflection>;

export const trestleMirrorGLSL=/* glsl */`
uniform vec4 mirrorFrame,mirrorPile,mirrorPost,mirrorHead;
uniform vec4 mirrorDeck[7],mirrorStations[4];
uniform float mirrorDeckThickness;
// Water rays intersect the actual inclined approaches, not one flat plane.
float mirrorSafeInv(float v){return (v<0.?-1.:1.)/max(abs(v),.000001);}
vec2 mirrorSlab(float o,float inv,float a,float b){
  vec2 t=vec2((a-o)*inv,(b-o)*inv);return vec2(min(t.x,t.y),max(t.x,t.y));
}
vec2 mirrorClip(vec2 x,vec2 y){return vec2(max(x.x,y.x),min(x.y,y.y));}
float mirrorContact(vec2 t){return t.y>=max(0.,t.x)?max(0.,t.x):1.e6;}
vec2 traceTrestle(vec3 world,vec3 dir){
  vec3 o=vec3(world.x-mirrorFrame.x,world.y,world.z-mirrorFrame.y);
  vec3 inv=vec3(mirrorSafeInv(dir.x),mirrorSafeInv(dir.y),mirrorSafeInv(dir.z));
  vec2 reach=mirrorClip(mirrorSlab(o.z,inv.z,-mirrorFrame.w,mirrorFrame.w),mirrorSlab(o.y,inv.y,mirrorPile.w,mirrorPost.w));
  if(mirrorContact(mirrorClip(reach,mirrorSlab(o.x,inv.x,-mirrorHead.x,mirrorHead.x)))>=1.e6)return vec2(0.);
  float roadHit=1.e6,woodHit=1.e6;
  vec2 lane=mirrorSlab(o.x,inv.x,-mirrorFrame.z,mirrorFrame.z);
  for(int i=0;i<7;i++){
    vec4 s=mirrorDeck[i];
    vec2 along=mirrorClip(lane,mirrorSlab(o.z,inv.z,s.x,s.y));
    if(mirrorContact(along)<1.e6){
      float y=o.y-(s.z+s.w*(o.z-s.x)),dy=dir.y-s.w*dir.z;
      roadHit=min(roadHit,mirrorContact(mirrorClip(along,mirrorSlab(y,mirrorSafeInv(dy),0.,mirrorDeckThickness))));
    }
  }
  for(int i=0;i<4;i++){
    vec4 b=mirrorStations[i];float z=o.z-b.x;
    vec2 pier=mirrorSlab(z,inv.z,-mirrorPile.z,mirrorPile.z);
    if(mirrorContact(mirrorClip(pier,reach))<1.e6){
      vec2 cap=mirrorClip(mirrorSlab(o.x,inv.x,-mirrorHead.x,mirrorHead.x),mirrorSlab(z,inv.z,-mirrorHead.y,mirrorHead.y));
      woodHit=min(woodHit,mirrorContact(mirrorClip(cap,mirrorSlab(o.y,inv.y,b.y+mirrorHead.z,b.y+mirrorHead.w))));
      for(int side=0;side<2;side++){
        float x=o.x-(side==0?-mirrorPile.x:mirrorPile.x);
        vec2 foot=mirrorClip(pier,mirrorSlab(x,inv.x,-mirrorPile.y,mirrorPile.y));
        woodHit=min(woodHit,mirrorContact(mirrorClip(foot,mirrorSlab(o.y,inv.y,mirrorPile.w,b.y))));
        vec2 post=mirrorClip(mirrorSlab(z,inv.z,-mirrorPost.y,mirrorPost.y),mirrorSlab(x,inv.x,-mirrorPost.x,mirrorPost.x));
        woodHit=min(woodHit,mirrorContact(mirrorClip(post,mirrorSlab(o.y,inv.y,b.y+mirrorPost.z,side==0?b.z:b.w))));
      }
    }
  }
  return vec2(roadHit<woodHit?1.:0.,woodHit<1.e6&&woodHit<=roadHit?1.:0.);
}`;
