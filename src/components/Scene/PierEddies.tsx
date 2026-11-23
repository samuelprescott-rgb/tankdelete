import {useEffect,useMemo} from 'react';
import {useFrame} from '@react-three/fiber';
import * as T from 'three';
import type {BridgePiece} from './bridgeTimber';
import {distanceToRiverWater,sampleRiverStation,type RiverStation} from './riverLayout';
import {RIVER_WATER_Y} from './riverVerticalSection';
import {downstreamAt,makeRiverInkBatch,useRiverInkAtlas} from './riverCurrentArt';

export function PierEddies({stations,pieces,day}:{
  stations:RiverStation[];pieces:readonly BridgePiece[];day:boolean;
}) {
  const atlas=useRiverInkAtlas();
  const art=useMemo(()=>{
    const piles=pieces.filter(p=>{
      if(p.kind!=='pile'||p.y-p.scaleY*.5>=RIVER_WATER_Y||distanceToRiverWater(p.x,p.z,stations)>0)return false;
      const bank=sampleRiverStation(stations,p.z)!;
      return bank.waterHalfWidth-Math.abs(p.x-bank.centerX)>.18;
    });
    const batch=makeRiverInkBatch(piles.length,atlas,day,true);
    const stamp=new T.Object3D(),flow=new T.Vector2();
    piles.forEach((p,i)=>{
      downstreamAt(stations,p.z,flow);
      const lee=.72+p.scaleZ*.5;
      stamp.position.set(p.x+flow.x*lee,RIVER_WATER_Y+.012,p.z+flow.y*lee);
      stamp.rotation.set(-Math.PI/2,Math.atan2(flow.x,flow.y),0,'YXZ');
      stamp.scale.set(1.33,1.86,1);
      stamp.updateMatrix();batch.mesh.setMatrixAt(i,stamp.matrix);
      batch.cel.setX(i,(i*7+Math.round(p.z))%16);
    });
    batch.mesh.name='bridge-pier-foam-eddies';
    batch.mesh.computeBoundingSphere();
    return batch;
  },[atlas,day,pieces,stations]);
  useFrame(({clock})=>{art.clock.value=clock.elapsedTime;});
  useEffect(()=>()=>art.dispose(),[art]);
  return <primitive object={art.mesh}/>;
}
