import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EMBASSY_ARCHIVE_SLOTS, type EmbassyArchive } from '../../lib/embassyDefense';

type ArchiveId = typeof EMBASSY_ARCHIVE_SLOTS[number]['id'];
type Point = readonly [number, number];
const IVORY = '#d6c9a8', BRASS = '#9a8969', STEEL = '#4d5145';
const W = 2.8, HINGE_Y = .68;
// Use the chancery's taller facade: at the guard turnout the nearer records
// portico overlaps a first-storey sign on this more distant central building.
const signHeight = (id:ArchiveId)=>id==='chancery'?4.52:2.82;
const postX=(id:ArchiveId)=>id==='chancery'?-2.93:-.18;
// The west annex uses longer porch irons. On the closest building this pulls
// even the first letter onto the edge of the default chase, over its threshold.
const porchExtension = (id:ArchiveId)=>id==='records'?.90:0;
// One enamel face per threshold. The fixed angle splits the difference
// between the western guard turnout and the centered practice approach.
export function archiveSignFace(id: ArchiveId) {
  const depth = id === 'chancery' ? 2.5 : 2.1;
  const size=id==='chancery'?.81:.96;
  return new THREE.Matrix4().makeRotationY(id==='dispatch'?-.72:id==='records'?-.43:-.57)
    .scale(new THREE.Vector3(size,id==='chancery'?.97:.92,size)).setPosition(postX(id), signHeight(id), depth+1.41+porchExtension(id));
}

// Authored flat enamel and simple signwriter's capitals, not an atlas. Raised
// paint sits on opaque, backed steel; fog, depth and existing light still apply.
function enamel() {
  const positions:number[] = [], colors:number[] = [], indices:number[] = [];
  const ink = new THREE.Color();
  function polygon(points:readonly Point[], z:number, pigment:string, back=false) {
    const offset = positions.length / 3;
    ink.set(pigment);
    // All silhouettes passed here are convex. Give fronts consistent winding.
    const area = points.reduce((sum,p,i) => { const q=points[(i+1)%points.length];
      return sum + p[0]*q[1] - p[1]*q[0]; }, 0);
    for (const [x,y] of points) {
      positions.push(x,y,z);
      const wash = .95 + .035*Math.sin(x*2.7+y*1.8) + .015*y;
      colors.push(ink.r*wash,ink.g*wash,ink.b*wash);
    }
    for (let i=1;i<points.length-1;i++) {
      if ((area>0)!==back) indices.push(offset,offset+i,offset+i+1);
      else indices.push(offset,offset+i+1,offset+i);
    }
  }
  function rect(x:number,y:number,w:number,h:number,z:number,pigment:string) {
    polygon([[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]],z,pigment);
  }
  function stroke(a:Point,b:Point,w:number,z:number,pigment:string) {
    const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy);
    const ox=-dy/len*w*.5, oy=dx/len*w*.5;
    polygon([[a[0]+ox,a[1]+oy],[a[0]-ox,a[1]-oy],[b[0]-ox,b[1]-oy],[b[0]+ox,b[1]+oy]],z,pigment);
  }
  function plate(points:readonly Point[],front:number,depth:number,pigment:string) {
    polygon(points,front,pigment); polygon(points,front-depth,STEEL,true);
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],offset=positions.length/3;
      positions.push(...a,front-depth,...b,front-depth,...b,front,...a,front);
      ink.set(STEEL); for(let j=0;j<4;j++) colors.push(ink.r,ink.g,ink.b);
      indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
    }
  }
  function word(value:string, x:number, baseline:number, width:number, height:number, z:number, pigment:string) {
    const unit = width/(value.length-.2), thick=height*.142;
    for(let i=0;i<value.length;i++) for(const path of LETTERS[value[i]]) {
      for(let j=1;j<path.length;j++) {
        const p=(c:string):Point=>{ const k=Number(c);return [x-width/2+i*unit+(k%3)*unit*.36,baseline+Math.floor(k/3)*height*.5]; };
        stroke(p(path[j-1]),p(path[j]),thick,z,pigment);
      }
    }
  }
  function finish() {
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
    g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
  return {polygon,rect,stroke,plate,word,finish};
}
// Nine points: 678 (cap), 345 (waist), 012 (baseline).
const LETTERS:Record<string,readonly string[]> = {
  A:['072','35'], C:['8602'], D:['067510'], E:['8602','35'],
  H:['06','35','28'], I:['68','71','02'], L:['602'], M:['06482'], N:['0628'],
  O:['06820'], P:['06853'], R:['06853','42'], S:['863520'],
  T:['68','71'], Y:['648','41'],
};
const cutPlate=(x:number,y:number,w:number,h:number,cut:number):Point[]=>[
  [x-w/2+cut,y-h/2],[x+w/2-cut,y-h/2],[x+w/2,y-h/2+cut],[x+w/2,y+h/2-cut],
  [x+w/2-cut,y+h/2],[x-w/2+cut,y+h/2],[x-w/2,y+h/2-cut],[x-w/2,y-h/2+cut],
];

export function createArchiveDoorHeader(id:ArchiveId) {
  const p=enamel();
  const ground=id==='dispatch'?'#344e54':id==='records'?'#594f3b':'#3c5148';
  // Smaller annex door plates, not second and third marquee signs. Keep
  // the signwriter's full letters, take the excess enamel from the margins.
  const main=id==='chancery',w=main?W:2.58,h=.58,y=-.24;
  p.plate(cutPlate(0,y,w,h,.075),0,.082,BRASS);
  p.polygon(cutPlate(0,y,w-.09,h-.085,.065),.008,ground);
  p.word(id.toUpperCase(),0,-.425,2.45,.32,.018,IVORY);
  const mount=archiveSignFace(id);
  const parts=[p.finish().applyMatrix4(mount)];
  const front=id==='chancery'?2.5:2.1;
  // Two rear box irons enter the wall, a pair of triangular stays carry the
  // nose above the existing porch roof. No support is in the driving lane.
  for(const side of [-1,1]) {
    const pin=new THREE.Vector3(side*.95,-.14,-.10).applyMatrix4(mount);
    const bracket=new THREE.BoxGeometry(.11,.18,pin.z-front).translate(pin.x,pin.y,(front+pin.z)*.5);
    const start=new THREE.Vector3(side*.88+postX(id)+.18,id==='chancery'?3.62:2.025,front+.47);
    const end=new THREE.Vector3(side*.80,-.50,-.10).applyMatrix4(mount);
    const delta=end.clone().sub(start);
    const stay=new THREE.BoxGeometry(.10,.10,delta.length());
    stay.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize()));
    start.lerp(end,.5); stay.translate(start.x,start.y,start.z);
    const metal=new THREE.Color(STEEL);
    for(const part of [bracket,stay]) {
      const rgb=new Float32Array(part.getAttribute('position').count*3);
      for(let i=0;i<rgb.length;i+=3)metal.toArray(rgb,i);
      part.setAttribute('color',new THREE.BufferAttribute(rgb,3)); parts.push(part);
    }
  }
  const fascia=mergeGeometries(parts,false)!; parts.forEach(part=>part.dispose());
  return fascia;
}

// A railway-style quadrant signal. Its paddle folds behind the enamel; when
// raised the deep vermilion wicket breaks the roofline *and* spells out ALARM.
export function createArchiveAlarmPaddle() {
  const p=enamel();
  p.plate(cutPlate(0,.10,.16,.42,.035),0,.065,BRASS);
  p.plate(cutPlate(0,.59,1.89,.73,.13),.028,.065,'#6e3c31');
  p.polygon(cutPlate(0,.59,1.80,.64,.11),.037,'#bd5e43');
  p.rect(0,.805,1.22,.036,.042,'#dba37b');
  p.word('ALARM',0,.428,1.53,.30,.047,'#f2dfb8');
  return p.finish();
}

const OPEN_MS=440;
export function createArchiveAlarmDriver(mesh:THREE.InstancedMesh) {
  const arms=EMBASSY_ARCHIVE_SLOTS.map(slot=>{
    const base=archiveSignFace(slot.id);
    base.premultiply(new THREE.Matrix4().makeTranslation(slot.position[0],slot.position[1],slot.position[2]));
    base.multiply(new THREE.Matrix4().makeTranslation(0,HINGE_Y,-.13));
    return {id:slot.id,base,since:0,deadline:0};
  });
  const hinge=new THREE.Matrix4(),pose=new THREE.Matrix4();
  mesh.count=0; mesh.visible=false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Normal depth testing still applies. An instanced batch changing from zero
  // count has no useful automatic initial sphere; its three fixed hinges bound it.
  mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,3,-22),15);
  return (archives:readonly EmbassyArchive[],now:number)=>{
    let count=0,changed=false;
    for(const arm of arms) {
      const archive=archives.find(a=>a.id===arm.id);
      if(!archive || archive.health<=0 || !(archive.underAttackUntil>now)) {
        arm.deadline=0; continue;
      }
      if(!arm.deadline || arm.deadline<=now) arm.since=now;
      arm.deadline=archive.underAttackUntil;
      const t=THREE.MathUtils.smootherstep(now-arm.since,0,OPEN_MS);
      hinge.makeRotationZ((t-1)*Math.PI);
      pose.multiplyMatrices(arm.base,hinge);
      const offset=count*16,arr=mesh.instanceMatrix.array;
      for(let i=0;i<16;i++) if(arr[offset+i]!==Math.fround(pose.elements[i])) {
        mesh.setMatrixAt(count,pose); changed=true; break;
      }
      count++;
    }
    mesh.count=count; mesh.visible=count>0;
    if(changed) mesh.instanceMatrix.needsUpdate=true;
  };
}

/** Warm the *mounted* alarm VAO, instancing buffer and lit material on the
 * first ordinary compound render. The embassy can mount long after the
 * sector's startup scratch pass. Hiding the object or submitting zero
 * instances would leave first use to the frame when an archive is attacked.
 * No offscreen pass: one instance beyond the game cameras' far plane, then
 * back to zero until an actual alarm. An already-active alarm takes priority. */
export function createPreparedArchiveAlarmDriver(mesh:THREE.InstancedMesh) {
  const advance=createArchiveAlarmDriver(mesh);
  const after=mesh.onAfterRender, culling=mesh.frustumCulled;
  const parkedMatrix=new THREE.Matrix4().makeTranslation(0,-1_000_000,0);
  let submitted=false,parked=false;
  mesh.onAfterRender=function(...args) {
    submitted=true;
    mesh.onAfterRender=after;
    mesh.frustumCulled=culling;
    if(parked){mesh.count=0;mesh.visible=false;}
    after.apply(this,args);
  };
  return (archives:readonly EmbassyArchive[], now:number)=>{
    advance(archives,now);
    if(submitted)return;
    if(mesh.count){parked=false;mesh.frustumCulled=culling;return;}
    if(!parked){
      mesh.setMatrixAt(0,parkedMatrix);mesh.instanceMatrix.needsUpdate=true;parked=true;
    }
    mesh.count=1;mesh.visible=true;mesh.frustumCulled=false;
  };
}
