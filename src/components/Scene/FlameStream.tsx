import { useLayoutEffect, useMemo, useRef } from 'react';
import { WaterLightBatch, registerWaterLights } from './weaponWater';
import { useFrame, useThree } from '@react-three/fiber';
import * as T from 'three';
import { PixelFireVolume } from './PixelFireVolume';

interface Pose { origin:T.Vector3; direction:T.Vector3; reach:number }
const UP = new T.Vector3(0, 1, 0);
export function FlameStream({active, pose}:{active:boolean; pose:Pose}) {
  const mesh = useRef<T.InstancedMesh>(null);
  const stamp = useMemo(()=>new T.Object3D(),[]);
  const scene=useThree(s=>s.scene);
  const water=useMemo(()=>new WaterLightBatch(),[]);
  useLayoutEffect(()=>registerWaterLights(scene,water),[scene,water]);
  const strength = useRef(0);


  useFrame((_,dt)=>{
    const m=mesh.current;
    water.count=0;
    if(!m || !m.parent)return;
    strength.current=T.MathUtils.damp(strength.current,active?1:0,active?23:19,dt);
    const reach=pose.reach*strength.current;
    m.visible=reach>.045 && strength.current>.035;
    m.count=m.visible?1:0;
    if(!m.visible)return;
    // Pose is in world coordinates; the socket's parent can pitch, recoil
    // and turn. Cancel that transform once for the entire instanced jet.
    m.parent.updateWorldMatrix(true,false);
    stamp.position.copy(pose.origin);
    stamp.quaternion.setFromUnitVectors(UP,pose.direction);
    stamp.scale.setScalar(1);stamp.updateMatrix();
    m.matrix.copy(m.parent.matrixWorld).invert().multiply(stamp.matrix);
    m.matrixWorldNeedsUpdate=true;
    const width=Math.min(2.5,.48+reach*.23)*strength.current;
    water.write(0,pose.origin,pose.direction,reach,Math.max(.06,width*.49),2);water.count=1;
    stamp.position.set(0,0,0);stamp.quaternion.identity();
    stamp.scale.set(width,reach,width);stamp.updateMatrix();
    m.setMatrixAt(0,stamp.matrix);
    m.instanceMatrix.needsUpdate=true;
  });
  return <PixelFireVolume form="jet" meshRef={mesh} name="painted-flame-stream"
    renderOrder={7} matrixAutoUpdate={false} visible={false}/>;
}
