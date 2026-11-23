import * as T from 'three';
import {paintCharacterFlame} from './relayCombustionCel';
import { RIDGE_HIT, ridgeGroundHeight, ridgePose, type RelayPass } from '../../lib/campaignFlights';

export const GUNNER_RELEASE = RIDGE_HIT + .34;

// The seated actor and its skeleton stay mounted. After release its pose is
// expressed in the flight scene's coordinates, so the banking cabin leaves it behind.
export function createRelayGunnerFall(){
  const cabin=new T.Matrix4(),seat=new T.Matrix4(),pose=new T.Matrix4(),inverse=new T.Matrix4();
  const origin=new T.Vector3(),position=new T.Vector3(),velocity=new T.Vector3(),scale=new T.Vector3();
  const torso=new T.Vector3(0,.65,0),shoulder=new T.Vector3(.27,1.12,.12),offset=new T.Vector3(),spin=new T.Quaternion(),rotation=new T.Quaternion();
  const departure=new T.Quaternion(),angles=new T.Euler();
  let released=false;
  return (t:number,pass:RelayPass,relay:T.Group,actor:T.Group,flame:T.Mesh,camera:T.Camera,cels:T.BufferGeometry[])=>{
    const age=t-GUNNER_RELEASE;
    if(age<0)return;
    if(!released){
      // Recover the precise door transform at the release time, including the seat yaw and model scale.
      relay.updateWorldMatrix(true,false);actor.updateWorldMatrix(true,false);
      seat.copy(relay.matrixWorld).invert().multiply(actor.matrixWorld);
      const at=ridgePose(GUNNER_RELEASE,pass),before=ridgePose(GUNNER_RELEASE-.05,pass);
      rotation.setFromEuler(angles.set(at.pitch,at.yaw,at.roll,'YXZ'));
      cabin.compose(position.set(at.x,at.y,at.z),rotation,relay.scale);
      pose.multiplyMatrices(cabin,seat).decompose(origin,departure,scale);
      origin.copy(torso).applyMatrix4(pose);
      velocity.set(3.1,1.0,0).applyQuaternion(rotation);
      velocity.x+=(at.x-before.x)/.05;velocity.z+=(at.z-before.z)/.05;
      released=true;
    }
    const drift=1.35*(1-Math.exp(-age/1.35));
    position.copy(origin).addScaledVector(velocity,drift);
    position.y=origin.y+velocity.y*age-3.9*age*age;
    const airborne=position.y>ridgeGroundHeight(position.x,position.z)+.5;
    actor.visible=airborne;flame.visible=airborne;
    if(!airborne)return;
    flame.geometry=cels[paintCharacterFlame(flame,camera,age,1)];
    rotation.copy(departure).multiply(spin.setFromEuler(angles.set(.52*age,.30*age,-2.65*age)));
    position.sub(offset.copy(torso).multiply(scale).applyQuaternion(rotation));
    pose.compose(position,rotation,scale);
    flame.position.copy(shoulder).applyMatrix4(pose);
    actor.parent!.updateWorldMatrix(true,false);
    inverse.copy(actor.parent!.matrixWorld).invert();
    pose.premultiply(relay.parent!.matrixWorld).premultiply(inverse).decompose(actor.position,actor.quaternion,actor.scale);
  };
}
