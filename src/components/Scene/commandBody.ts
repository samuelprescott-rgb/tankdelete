import * as THREE from 'three';
const Y=new THREE.Vector3(0,1,0);
const newFoot=()=>({world:new THREE.Vector3(),from:new THREE.Vector3(),local:new THREE.Vector3(),goal:new THREE.Vector3(),yaw:0,roll:0,landing:0});
export const newCommandWalk=()=>({key:'',previous:new THREE.Vector3(),feet:[newFoot(),newFoot()],swing:0,phase:0,walking:false,
  carried:new THREE.Object3D(),carryReady:false,lookYaw:0,floorY:0,
  braced:false,braceTime:0,braceYaw:0,plant:0,load:0,loadX:0,loadZ:0,carryHipX:0,carryHipZ:0,carryHipRoll:0,
  lastYaw:0,inverse:new THREE.Matrix4(),hip:new THREE.Vector3(),ankle:new THREE.Vector3(),knee:new THREE.Vector3(),
  line:new THREE.Vector3(),perp:new THREE.Vector3(),work:new THREE.Vector3(),sway:0,bob:0,distance:0});
type Walk=ReturnType<typeof newCommandWalk>;
const STEP=2.2;
// Local distance from the old coat hem/hips; IK and the two upper masses
// share this measure so the knees articulate under the visible pelvis.
export const COMMAND_HIP_RISE=.198;
// The load describes body height as well as horizontal transfer. Hips used
// to RISE on a strike, tucking both shins underneath an upright pelvis.
export const commandPelvisY=(w:Walk)=>COMMAND_HIP_RISE+w.bob-.106*w.load-(w.walking?.036*Math.sin(w.phase*Math.PI):.012);
function landing(out:THREE.Vector3,world:THREE.Vector3,yaw:number,foot:number,ahead:number,spread=.90,travel=yaw) {
  const s=Math.sin(yaw),c=Math.cos(yaw),width=foot===0?-spread:spread;
  return out.set(world.x+c*width-Math.sin(travel)*ahead,world.y,world.z-s*width-Math.cos(travel)*ahead);
}
/** Exactly one support foot stays fixed in world space; the other recovers
 * and heel-strikes. Stopping mid-stride finishes the swing before resting. */
export function walkCommand(w:Walk,key:string,world:THREE.Vector3,yaw:number,dt:number,commit=false,tank?:THREE.Vector3) {
  w.floorY=world.y;
  const distance=w.previous.distanceTo(world);
  // A crab step advances along the physical route, but the two sockets and
  // landing lanes belong to the ACTOR'S current pelvis, not its travel yaw.
  // Previously an about-face to a defender could swap the lanes and cross
  // both shins. No foot slides and no camera coordinates are consulted.
  const body=w.key===key&&w.carryReady?w.carried.rotation.y:tank?commandStanceYaw(world,yaw,tank):yaw;
  const cross=Math.abs(Math.sin(yaw-body)),step=STEP-.72*cross;
  if(w.key!==key||distance>2.5){
    w.key=key;w.phase=0;w.swing=0;w.walking=false;w.previous.copy(world);
    w.feet.forEach((f,i)=>{landing(f.world,world,body,i,0);f.from.copy(f.world);f.yaw=body;f.roll=f.landing=0;});
    w.braced=false;w.carryReady=false;w.braceTime=w.load=w.loadX=w.loadZ=w.carryHipX=w.carryHipZ=w.carryHipRoll=0;
    w.lastYaw=yaw;w.sway=w.bob=w.distance=0;return;
  }
  w.previous.copy(world);w.distance+=distance;
  const moving=distance>.00001;
  // A running last step can leave both feet almost on the same screen/world
  // line when the target cuts across the boss. Keep the foot already on the
  // ground, and set the free one down on a wider, staggered base. Its actual
  // world toe progresses through an arc; neither foot follows target yaw.
  if(commit&&!w.braced){
    w.braced=true;w.braceTime=0;w.braceYaw=body;w.plant=w.walking?1-w.swing:0;
    const side=1-w.plant,free=w.feet[side],fixed=w.feet[w.plant],sgn=side===1?1:-1;
    free.from.copy(free.world);landing(free.goal,world,body,side,sgn*1.74,1.61);
    w.work.subVectors(free.goal,fixed.world);w.work.y=0;
    // If a stale support is already at that mark, place the recovery foot a
    // measured diagonal away instead. No sliding either foot to widen it.
    const lateral=sgn*(w.work.x*Math.cos(body)-w.work.z*Math.sin(body)),extra=Math.max(0,2.52-lateral);
    free.goal.x+=sgn*Math.cos(body)*extra;free.goal.z-=sgn*Math.sin(body)*extra;
    w.walking=false;w.phase=0;
  }
  if(w.braced){
    w.braceTime+=dt;
    const side=1-w.plant,free=w.feet[side],t=Math.min(1,w.braceTime/.34),ease=t*t*(3-2*t);
    if(t<1||w.braceTime-dt<.34){
      free.world.lerpVectors(free.from,free.goal,ease);
      free.world.y+=Math.sin(t*Math.PI)*.37;
      free.roll=Math.sin(t*Math.PI)*(.23*t-.16*(1-t));
      if(t===1){free.landing++;free.roll=0;}
      free.yaw+=Math.atan2(Math.sin(w.braceYaw-free.yaw),Math.cos(w.braceYaw-free.yaw))*Math.min(1,dt*11);
    }
    w.sway=w.bob=0;
    if(commit||(!moving&&t<1))return;
    // Push off from the former support. If pursuit interrupted the step
    // before touchdown, finish that same foot's swing instead.
    w.braced=false;w.swing=t<1?side:w.plant;w.walking=false;w.phase=0;
  }
  if(!w.walking&&moving){w.walking=true;w.phase=0;w.feet[w.swing].from.copy(w.feet[w.swing].world);}
  if(!w.walking)return;
  const current=w.feet[w.swing],support=w.feet[1-w.swing];
  w.phase=Math.min(1,w.phase+(moving?distance/step:dt*3.4));
  // The horizon shortens as the swing completes; for constant velocity this
  // resolves to the same touchdown point throughout the step.
  const turn=Math.abs(Math.atan2(Math.sin(yaw-w.lastYaw),Math.cos(yaw-w.lastYaw)));
  if(w.phase<.82||turn>.5||!moving)
    {landing(current.goal,world,body,w.swing,moving?step*(1.5-w.phase):0,1.08+.36*cross,yaw);
      const lead=w.swing===0?-.48:.48;current.goal.x-=Math.sin(body)*lead;current.goal.z-=Math.cos(body)*lead;}
  const eased=w.phase*w.phase*(3-2*w.phase);
  current.world.lerpVectors(current.from,current.goal,eased);
  current.world.y+=Math.sin(w.phase*Math.PI)*.54;
  current.roll=Math.sin(Math.PI*w.phase)*(-.25+.62*w.phase);
  current.yaw+=Math.atan2(Math.sin(body-current.yaw),Math.cos(body-current.yaw))*Math.min(1,dt*12);
  w.sway=(1-w.swing===0?-1:1)*Math.sin(w.phase*Math.PI)*.054;
  w.bob=(-.026*Math.cos(2*Math.PI*w.phase)+.006)*Math.min(1,distance/(dt*2)||0);
  w.lastYaw=yaw;
  if(w.phase===1){
    current.world.copy(current.goal);current.world.y=world.y;current.landing++;current.roll=0;
    w.swing=1-w.swing;w.phase=0;support.from.copy(support.world);w.walking=moving;w.sway=w.bob=0;
  }
}
const turnDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function commandStanceYaw(world:THREE.Vector3,travel:number,tank:THREE.Vector3){
  const dx=world.x-tank.x,dz=world.z-tank.z,d=Math.hypot(dx,dz),threat=d>.15?Math.atan2(dx,dz):travel;
  const residual=turnDelta(travel,threat),alert=1-THREE.MathUtils.smoothstep(d,24,38);
  return threat+THREE.MathUtils.lerp(residual,THREE.MathUtils.clamp(residual*.105,-.17,.17),alert);
}
/** The two-headed command creature skirts a defender while keeping the tank
 * in sight. Hips can crab-step under the planted contacts; the lead shoulder
 * and blade still reach into the actual attack lane. No screen/camera input.
 * This is a separate visual transform: collision and projectile origin retain
 * the encounter's physical transform and timing, regardless of camera mode. */
export function commandCarriage(w:Walk,physical:THREE.Object3D,tank:THREE.Vector3,dt:number){
  const c=w.carried,travel=physical.rotation.y,dx=physical.position.x-tank.x,dz=physical.position.z-tank.z;
  const d=Math.hypot(dx,dz),threat=d>.15?Math.atan2(dx,dz):travel;
  const alert=1-THREE.MathUtils.smoothstep(d,24,38);
  // Present the shoulder girdle in a three-quarter stance to the primary
  // threat, not rigidly square-on. A passing ally cannot spin the two faces
  // through 180 degrees in the middle of a planted swing.
  const desired=commandStanceYaw(physical.position,travel,tank);
  if(!w.carryReady){c.rotation.y=desired;w.carryReady=true;}
  else c.rotation.y+=turnDelta(desired,c.rotation.y)*(1-Math.exp(-dt*5.2));
  w.lookYaw=THREE.MathUtils.clamp(turnDelta(threat,c.rotation.y),-.66,.66)*alert;
  c.position.copy(physical.position);c.scale.copy(physical.scale);
  c.scale.x*=1.02;c.scale.y*=.78;c.scale.z*=.97;c.updateMatrix();
  return c.matrix;
}
/** Shift the actual hip sockets and chest together toward the planted ankle.
 * World plants remain intact while the trunk turns, not merely the boots. */
export function loadCommandStance(w:Walk,matrix:THREE.Matrix4,dt:number){
  const rate=1-Math.exp(-dt*10);
  w.load+=(Number(w.braced)-w.load)*rate;
  w.inverse.copy(matrix).invert();w.work.copy(w.feet[w.plant].world).applyMatrix4(w.inverse);
  const lead=w.plant===0?-1:1;
  w.loadX+=(THREE.MathUtils.clamp(.60*w.work.x-.066*lead,-.15,.15)*w.load-w.loadX)*rate;
  w.loadZ+=(THREE.MathUtils.clamp(.57*w.work.z,-.19,.19)*w.load-w.loadZ)*rate;
  // A second, strictly pelvic transfer: the R29 chest retains its original
  // carriage. Transfer toward the actual stationary pad during heel/toe
  // roll, and overlap the next support smoothly instead of snapping sides.
  const support=w.braced?w.plant:1-w.swing,s=support?1:-1;
  w.work.copy(w.feet[support].world).applyMatrix4(w.inverse);
  const wish=w.braced?.78:w.walking?.35+.65*Math.sin(Math.PI*w.phase):0;
  const x=THREE.MathUtils.clamp((w.work.x-(s*.152+w.sway+w.loadX))*.62,-.126,.126);
  const z=THREE.MathUtils.clamp((w.work.z-(.024+w.loadZ))*.44,-.092,.092);
  w.carryHipX+=(x*wish-w.carryHipX)*rate;w.carryHipZ+=(z*wish-w.carryHipZ)*rate;
  w.carryHipRoll+=(-s*.075*wish-w.carryHipRoll)*rate;
}
function joint(mesh:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,scratch:THREE.Vector3){
  scratch.subVectors(a,b);const len=scratch.length();
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(Y,scratch.multiplyScalar(1/Math.max(.0001,len)));
  mesh.scale.y=len;
}
export function poseCommandLeg(w:Walk,side:number,rootMatrix:THREE.Matrix4,thigh:THREE.Object3D,shin:THREE.Object3D,boot:THREE.Object3D){
  const foot=w.feet[side];w.inverse.copy(rootMatrix).invert();
  foot.local.copy(foot.world).applyMatrix4(w.inverse);boot.position.copy(foot.local);
  const e=rootMatrix.elements;boot.rotation.y=foot.yaw-Math.atan2(e[8],e[10]);
  const sole=boot.children[0] as THREE.Mesh|undefined;
  if(sole?.geometry&&e[5]>.5){
    sole.rotation.x=foot.roll;
    const floor=onCommandWetApron(foot.world.x,foot.world.z)?COMMAND_SLAB_TOP:w.floorY;
    sole.position.y=(floor-w.floorY)/e[5]-commandSoleLow(sole.geometry,foot.roll);
  }
  const sign=side===0?-1:1;
  w.hip.set(sign*.152+w.sway+w.loadX+w.carryHipX,.557+commandPelvisY(w)+sign*(.023+.152*w.carryHipRoll),.024+w.loadZ+w.carryHipZ);
  w.ankle.copy(foot.local);w.ankle.y+=.079;
  w.line.subVectors(w.ankle,w.hip);const span=Math.max(.001,w.line.length());w.line.multiplyScalar(1/span);
  w.perp.set(sign*(side===w.plant?.19:.54),0,-1);w.perp.addScaledVector(w.line,-w.perp.dot(w.line)).normalize();
  const mid=span*(side===w.plant?.48:.55);
  const bend=Math.sqrt(Math.max(.0018,.406**2-(span*.5)**2))*(side===w.plant?1-.85*w.load:1+.12*w.load);
  w.knee.copy(w.hip).addScaledVector(w.line,mid).addScaledVector(w.perp,bend);
  joint(thigh,w.hip,w.knee,w.work);joint(shin,w.knee,w.ankle,w.work);
}

// The broad slab tops in embassyGroundworks are at .021 + .024 / 2.
// Only the exposed central lane is reliably wet, clear of the roofed wings,
// burning bay, stepped pavement, trench lips and edges by a full ripple radius.
export const COMMAND_SLAB_TOP=.033;
export const onCommandWetApron=(x:number,z:number)=>Math.abs(x)<7.55&&z> -21.5&&z< -14.73;
const soleSupports=new WeakMap<THREE.BufferGeometry,number[]>();
/** Heel/toe support of the actual sculpt, not the pivot or its empty box.
 * Cache the support samples once per foot; a few multiply-adds thereafter. */
export function commandSoleLow(g:THREE.BufferGeometry,roll:number){
  const v=g.getAttribute('position');let indices=soleSupports.get(g);
  if(!indices){
    const set=new Set<number>();
    for(let j=-16;j<=16;j++){const a=j*.025,c=Math.cos(a),s=Math.sin(a);let low=Infinity,ix=0;
      for(let i=0;i<v.count;i++){const h=v.getY(i)*c-v.getZ(i)*s;if(h<low){low=h;ix=i;}}
      set.add(ix);}
    indices=[...set];soleSupports.set(g,indices);
  }
  const c=Math.cos(roll),s=Math.sin(roll);let y=Infinity;
  for(const i of indices)y=Math.min(y,v.getY(i)*c-v.getZ(i)*s);return y;
}
