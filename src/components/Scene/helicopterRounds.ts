import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The bright leading face and the stepped copper tail share one instanced draw.
// The head is at y=0 and the trail extends behind it along local -Y.
export const helicopterRoundGeometry=(()=>{
  const stamps:[number,number,number,string][]=[
    [0,.9,.11,'#fff2af'],[-.13,.67,.22,'#ffc25a'],
    [-.40,.46,.33,'#ff853d'],[-.73,.24,.34,'#c24d2c'],
  ];
  const parts=stamps.map(([y,width,length,ink])=>{
    const g=new T.BoxGeometry(width,length,width).translate(0,y,0);
    const rgb=new Float32Array(g.attributes.position.count*3),color=new T.Color(ink);
    for(let i=0;i<rgb.length;i+=3)color.toArray(rgb,i);
    g.setAttribute('color',new T.BufferAttribute(rgb,3));return g;
  });
  const merged=mergeGeometries(parts)!;for(const part of parts)part.dispose();return merged;
})();
export const helicopterRoundInk=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false,fog:false});

export const FLYOVER_ROUNDS=3;
const up=new T.Vector3(0,1,0);

// Ambient bursts stay in the formation's parent space after leaving the moving door.
export function createFlyoverBurst(index:number, side:1|-1) {
  const rounds=Array.from({length:FLYOVER_ROUNDS},()=>({
    born:-Infinity,origin:new T.Vector3(),direction:new T.Vector3(),
  }));
  const stamp=new T.Object3D();
  const period=3.1+.23*index, spacing=.14;
  let lastBeat=-1;
  return (time:number,aircraft:T.Group,batch:T.InstancedMesh)=>{
    const phase=time+.92*index;
    const cycle=Math.floor(phase/period);
    const slot=Math.floor((phase-cycle*period)/spacing);
    const beat=cycle*FLYOVER_ROUNDS+slot;
    if(slot<FLYOVER_ROUNDS && beat!==lastBeat){
      lastBeat=beat;
      const round=rounds[slot];
      round.born=time;
      round.origin.set(-side*.83,-.08,-.30).multiply(aircraft.scale)
        .applyQuaternion(aircraft.quaternion).add(aircraft.position);
      round.direction.set(-side*.58,-.72,-.48+.045*slot).normalize().applyQuaternion(aircraft.quaternion);
    }
    let count=0;
    for(const [i,round] of rounds.entries()){
      const age=time-round.born;
      if(age<0||age>.55)continue;
      const travel=age*25;
      stamp.position.copy(round.origin).addScaledVector(round.direction,travel);
      stamp.quaternion.setFromUnitVectors(up,round.direction);
      stamp.scale.set(.18,Math.min(travel+.08,i===1?1.25:2.25),.18);
      stamp.updateMatrix();batch.setMatrixAt(count++,stamp.matrix);
    }
    batch.count=count;batch.visible=count>0;
    if(count)batch.instanceMatrix.needsUpdate=true;
  };
}
