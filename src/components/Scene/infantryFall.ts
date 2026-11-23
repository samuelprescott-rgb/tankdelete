import {fieldBlood} from './FieldBlood';
import {MathUtils, Matrix4, Vector3, type InstancedMesh, type Group} from 'three';
import type {InfantryRig} from './infantryGeometry';

// Sample the actual rendered bags once at impact, including their staggered upper row.
function findBag(body:Group,feet:Vector3){
  let root=body.parent;
  while(root?.parent)root=root.parent;
  const bags=root?.getObjectByName('us-field-sandbags') as InstancedMesh|undefined;
  if(!bags)return null;
  bags.updateWorldMatrix(true,false);bags.geometry.computeBoundingBox();
  const box=bags.geometry.boundingBox!,mat=new Matrix4(),p=new Vector3();
  let best=1.28**2,rest:Vector3|null=null;
  for(let i=0;i<bags.count;i++){
    bags.getMatrixAt(i,mat);mat.premultiply(bags.matrixWorld);
    p.setFromMatrixPosition(mat);
    const dx=p.x-feet.x,dz=p.z-feet.z,d=dx*dx+dz*dz;
    if(d>best||Math.abs(p.y-feet.y)>.65)continue;
    best=d;rest=p.set(0,box.max.y,0).applyMatrix4(mat).clone();
  }
  return rest;
}
export function beginInfantryFall(body:Group, rig:InfantryRig|null, time:number) {
  body.rotation.reorder('YXZ');
  const feet=body.getWorldPosition(new Vector3()),bag=findBag(body,feet);
  return {
    feet,bag,marked:false, time, x:body.position.x, y:body.position.y, z:body.position.z,
    yaw:body.rotation.y, pitch:body.rotation.x, roll:body.rotation.z,
    chest:rig && {bone:rig.spine, pitch:rig.spine.rotation.x, y:rig.spine.position.y},
    head:rig && {bone:rig.head,roll:rig.head.rotation.z},
    legs:rig?.legs.map(({upper,lower})=>({upper,lower,hip:upper.rotation.x,knee:lower.rotation.x})),
  };
}

export function poseInfantryFall(body:Group, fall:ReturnType<typeof beginInfantryFall>, now:number, index:number) {
  const age=now-fall.time,side=index%2?1:-1;
  const buckle=MathUtils.smoothstep(age,0,.27),tip=MathUtils.smoothstep(age,.12,.84);
  const settle=MathUtils.smoothstep(age,.65,1.12);
  const support=fall.bag;
  const dx=support?support.x-fall.feet.x:-side*Math.cos(fall.yaw)*.42;
  const dz=support?support.z-fall.feet.z:side*Math.sin(fall.yaw)*.42;
  const yaw=support?Math.atan2(side*dz,-side*dx):fall.yaw;
  body.visible=age<4.4;
  if(!body.visible)return false;
  body.rotation.y=fall.yaw+Math.atan2(Math.sin(yaw-fall.yaw),Math.cos(yaw-fall.yaw))*tip;
  body.rotation.x=fall.pitch*(1-tip)-.14*buckle+.09*settle;
  body.rotation.z=fall.roll*(1-tip)+side*(1.32*tip+.19*settle);
  // Rest the ribcage on the lip. Hips and bent legs stay on the near side.
  const length=Math.hypot(dx,dz),travel=support?Math.max(0,length-.51):length;
  body.position.set(fall.x+dx*travel/Math.max(.001,length)*tip,
    fall.y-.15*buckle+(support?Math.max(.18,support.y-fall.feet.y+.08):.30)*tip,
    fall.z+dz*travel/Math.max(.001,length)*tip);
  if(fall.chest){
    fall.chest.bone.rotation.x=fall.chest.pitch*(1-tip)-.24*buckle-.13*settle;
    fall.chest.bone.rotation.z=-side * (support ? .39 : .15)*settle;
  }
  if(fall.head)fall.head.bone.rotation.z=fall.head.roll-side*.24*settle;
  fall.legs?.forEach(({upper,lower,hip,knee},i)=>{
    const bend=(i === index % 2 ? .77 : .38)*buckle*(1-.23*tip);
    upper.rotation.x=hip+bend;lower.rotation.x=knee-1.55*bend;
  });
  if(age>.72&&!fall.marked){
    const at=fall.feet.clone();at.x+=dx;at.z+=dz;
    fieldBlood(body,at,yaw+(index%3)*.7);fall.marked=true;
  }
  return true;
}

// A struck defender takes a lost step back, buckles, then lands on one shoulder.
// Sample from the last live pose so recoil and stagger agree at any frame rate.
export function poseHordeDefenderFall(body: Group, fall: ReturnType<typeof beginInfantryFall>, now: number, index: number) {
  if(fall.bag){poseInfantryFall(body,fall,now,index);return;}
  const age = now - fall.time;
  body.visible = age < 4.4;
  if (!body.visible) return;

  const side = index % 2 ? 1 : -1;
  const stagger = MathUtils.smoothstep(age, 0, 0.20);
  const buckle = MathUtils.smoothstep(age, 0.19, 0.52);
  const drop = MathUtils.smoothstep(age, 0.36, 0.92);
  const settle = MathUtils.smoothstep(age, 0.92, 1.22);
  const back = 0.24 * stagger + 0.53 * drop + 0.09 * settle;
  const sideways = -side * (0.47 * stagger + 0.69 * drop + 0.11 * settle);
  const sin = Math.sin(fall.yaw), cos = Math.cos(fall.yaw);
  body.position.set(
    fall.x + sin * back + cos * sideways,
    fall.y - 0.14 * buckle + 0.35 * drop - 0.07 * settle,
    fall.z + cos * back - sin * sideways,
  );
  body.rotation.y = fall.yaw + side * (0.10 * stagger + 0.04 * drop);
  // The shoulder takes the final roll. Let forward pitch unwind so the
  // rifle carried across the chest finishes along the ground.
  body.rotation.x = (fall.pitch + .28 * stagger) * (1 - drop) - .08 * settle;
  body.rotation.z = fall.roll * (1 - drop) + side * (0.35 * stagger + 1.22 * drop - 0.04 * settle);

  if(age>.8&&!fall.marked){
    const at=body.getWorldPosition(new Vector3());at.y=fall.feet.y;
    fieldBlood(body,at,fall.yaw);fall.marked=true;
  }
  if (fall.chest) {
    fall.chest.bone.position.y = fall.chest.y + 0.20 * stagger * (1 - buckle);
    fall.chest.bone.rotation.x = fall.chest.pitch + 0.29 * stagger - 0.48 * buckle + 0.12 * settle;
  }
  fall.legs?.forEach(({upper, lower, hip, knee}, i) => {
    const bend = (i === index % 2 ? 0.85 : 0.44) * buckle * (1 - 0.52 * drop);
    upper.rotation.x = hip + bend;
    lower.rotation.x = knee - 1.55 * bend;
  });
}
