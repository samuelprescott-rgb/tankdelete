import * as T from 'three';
import {TANK_SUSPENSION} from '../../lib/tankSuspension';
import {createRiverCrossings,riverCrossingAmount,riverWaterImmersion,type RiverStation} from './riverLayout';
import {RIVER_WATER_Y} from './riverVerticalSection';
import {downstreamAt,makeRiverInkBatch} from './riverCurrentArt';

export function createTrackSilt(stations:RiverStation[],atlas:T.Texture,day:boolean) {
  const capacity=88, spacing=.43;
  const art=makeRiverInkBatch(capacity,atlas,day,false);
  const {mesh,cel}=art;
  mesh.name='tank-track-silt';
  mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);cel.setUsage(T.DynamicDrawUsage);
  const spots=Array.from({length:capacity},()=>({
    x:0,z:0,yaw:0,age:0,life:0,size:0,flow:new T.Vector2(),
  }));
  const stamp=new T.Object3D(), bridge=createRiverCrossings(stations).find(c=>c.kind==='bridge');
  let next=0, carry=0;
  function reset(){
    for(const spot of spots)spot.life=0;
    next=0;carry=0;mesh.count=0;mesh.visible=false;
  }
  reset();

  function update(dt:number,pos:T.Vector3,travel:number,move:T.Vector3,right:T.Vector3) {
    if(travel>=3){reset();return;}
    const moving=travel>dt*.12;
    if(!moving && mesh.count===0){carry=0;return;}
    const onDeck=moving && bridge && riverCrossingAmount(pos.x,pos.z,bridge,0)>0;
    if(moving&&!onDeck){
      // Use the trailing end of each tread, including when backing into water.
      const sign=Math.sign(move.x*(-right.z)+move.z*right.x);
      const tailX=right.z*sign*.94,tailZ=-right.x*sign*.94;
      carry+=travel;
      while(carry>=spacing){
        carry-=spacing;
        for(let side=-1;side<=1;side+=2){
          const x=pos.x-move.x*carry+tailX+side*right.x*TANK_SUSPENSION.halfTrack;
          const z=pos.z-move.z*carry+tailZ+side*right.z*TANK_SUSPENSION.halfTrack;
          const wet=riverWaterImmersion(x,z,stations);
          if(wet<.06)continue;
          const spot=spots[next];
          const variation=((next*17)%29)/28;
          next=(next+1)%capacity;
          spot.x=x;spot.z=z;spot.age=0;
          spot.life=2.45+variation*.55;
          spot.size=(.78+.20*variation)*(.75+.25*wet);
          spot.yaw=Math.atan2(move.x,move.z)+side*(.10+.19*variation);
          downstreamAt(stations,z,spot.flow);
        }
      }
    }else carry=0;

    let count=0;
    for(const spot of spots){
      if(spot.life===0)continue;
      spot.age+=dt;
      if(spot.age>=spot.life){spot.life=0;continue;}
      const u=spot.age/spot.life;
      const drift=spot.age*(.16+.12*u);
      stamp.position.set(spot.x+spot.flow.x*drift,RIVER_WATER_Y-.016,spot.z+spot.flow.y*drift);
      stamp.rotation.set(-Math.PI/2,spot.yaw,0,'YXZ');
      stamp.scale.set((.78+1.30*u)*spot.size,(1.35+1.35*u)*spot.size,1);
      stamp.updateMatrix();mesh.setMatrixAt(count,stamp.matrix);
      cel.setX(count,Math.min(15,Math.floor(u*16)));count++;
    }
    mesh.count=count;mesh.visible=count>0;
    if(count){mesh.instanceMatrix.needsUpdate=true;cel.needsUpdate=true;}
  }
  return {mesh,reset,update,dispose:art.dispose};
}
