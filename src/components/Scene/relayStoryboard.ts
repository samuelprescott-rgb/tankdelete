import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RIDGE_HIT,ridgePose,type RelayPass} from '../../lib/campaignFlights';

// This is a locked, scripted sky vignette: a brush stroke in empty sky, then
// a fixed flash at a known mesh socket. It has no source actor or gameplay hit.
export function makeRelayStoryboard(pass:RelayPass){
  const contact=ridgePose(RIDGE_HIT,pass),end=new T.Vector3(.70,.34,.04).multiplyScalar(pass.scale)
    .applyEuler(new T.Euler(contact.pitch,contact.yaw,contact.roll,'YXZ'))
    .add(new T.Vector3(contact.x,contact.y,contact.z));
  const width=Math.min(27,pass.halfWidth*.27),c=Math.cos(pass.yaw),s=Math.sin(pass.yaw),
    start=end.clone().add(new T.Vector3(width*c,-4.2,-width*s)),
    rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),end.clone().sub(start).normalize());
  return {start,end,rotation};
}
export const RELAY_STREAK_SECONDS=1.08;
// Low-poly painted shapes, each baked to one static draw. Their direction
// is legible against both a pale cloud and the dark ridge.
export function createRelayStreak(){
  const pieces:T.BufferGeometry[]=[];
  const cut=(x:number,y:number,z:number,l:number,h:number,w:number,ink:string,angle=0,bank=0)=>{
    const g=new T.OctahedronGeometry(1).scale(l,h,w).rotateZ(angle).rotateX(bank).translate(x,y,z),
      p=g.getAttribute('position'),color=new T.Color(ink),rgb=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++)color.toArray(rgb,i*3);
    g.setAttribute('color',new T.BufferAttribute(rgb,3));pieces.push(g);
  };
    cut(-6.2,-.17,0,2.0,.20,.17,'#625e55');
    cut(-3.59,-.06,0,2.5,.23,.18,'#a47755');
    cut(-2.07,0,0,2.01,.23,.20,'#ee8852');
    cut(-1.40,.027,0,1.32,.14,.235,'#ffdd89');
    cut(-.27,.023,0,.68,.23,.25,'#494e4e');
    cut(.13,.04,0,.43,.12,.26,'#fff1aa');
  const mesh=mergeGeometries(pieces)!;for(const p of pieces)p.dispose();
  mesh.name='relay-painted-streak';mesh.computeBoundingSphere();return mesh;
}
