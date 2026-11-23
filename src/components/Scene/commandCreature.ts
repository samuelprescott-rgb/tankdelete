import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {commandBonePaint,skullPaintUv} from './commandBonePaint';

type V = [number,number,number];
type Course = [number,number,number,number];
const sat=THREE.MathUtils.smoothstep;
function colored(g:THREE.BufferGeometry,n:number) {
  const rgb=new THREE.Color(n), p=g.getAttribute('position'),normal=g.getAttribute('normal'), c=new Float32Array(3*p.count);
  for(let i=0;i<p.count;i++){
    const up=normal.getY(i),x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const fleck=.5+.5*Math.sin(x*73+y*40+Math.sin(z*38)*1.8);
    const form=.63+.34*(up*.5+.5)+.19*fleck;
    c[i*3]=rgb.r*form;c[i*3+1]=rgb.g*form*(.94+.08*fleck);c[i*3+2]=rgb.b*form*(1.04-.10*fleck);
  }
  g.setAttribute('color',new THREE.BufferAttribute(c,3));g.deleteAttribute('uv');
  return g;
}
function solid(parts:THREE.BufferGeometry[]) {
  const tri=parts.map(p=>p.index?p.toNonIndexed():p);
  const g=mergeGeometries(tri)!;
  for(const p of new Set([...parts,...tri]))p.dispose();
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function mass(pos:V,scale:V,col:number,roll=0,pitch=0,cols=14,rows=10){
  return colored(new THREE.SphereGeometry(1,cols,rows).scale(...scale).rotateZ(roll).rotateX(pitch).translate(...pos),col);
}
/** Tapered, curved anatomy. Parallel-transported rings keep the highlight
 * running down the tendon/claw instead of breaking at cylinder joints. */
function cord(course:Course[],color:number,flatten=1,sides=8) {
  const pos:number[]=[],ix:number[]=[],pts=course.map(k=>new THREE.Vector3(k[0],k[1],k[2]));
  const axis=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3(),p=new THREE.Vector3();
  for(let i=0;i<course.length;i++){
    axis.subVectors(pts[Math.min(i+1,pts.length-1)],pts[Math.max(0,i-1)]).normalize();
    if(i===0)u.set(Math.abs(axis.x)>.8?0:1,Math.abs(axis.x)>.8?1:0,0);
    u.addScaledVector(axis,-u.dot(axis)).normalize();v.crossVectors(axis,u);
    for(let k=0;k<sides;k++){
      const a=k*2*Math.PI/sides,r=course[i][3];
      p.copy(pts[i]).addScaledVector(u,r*Math.cos(a)).addScaledVector(v,r*flatten*Math.sin(a));
      pos.push(p.x,p.y,p.z);
      if(i>0){const j=(i-1)*sides+k,n=(i-1)*sides+(k+1)%sides;ix.push(j,n,j+sides,n,n+sides,j+sides);}
    }
  }
  for(let k=1;k<sides-1;k++)ix.push(0,k+1,k,(pts.length-1)*sides,(pts.length-1)*sides+k,(pts.length-1)*sides+k+1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(ix);g.computeVertexNormals();return colored(g,color);
}
const hide=0x706d66,plum=0x665a61,flesh=0x96847e,light=0xb6a79a,horn=0x938b80;
// Damp relief is evaluated only on the monster itself. One already-sampled
// repeat tile feeds pigment, roughness and this few-millimetre ridge. Its
// mip chain averages the slope at distance; no pixel noise or extra draw.
function tissueRelief(height:string){
  return `#include <normal_fragment_maps>
    float commandH=${height};
    vec3 commandDx=dFdx(-vViewPosition),commandDy=dFdy(-vViewPosition);
    vec3 commandTx=cross(commandDy,normal),commandTy=cross(normal,commandDx);
    float commandDet=dot(commandDx,commandTx);
    normal=normalize(max(abs(commandDet),1e-8)*normal-sign(commandDet)*
      (commandTx*dFdx(commandH)+commandTy*dFdy(commandH)));`;
}
// Closed, pleated ribbons. Both sides have thickness and the taper splits
// into individual points, like the torn field coat in the night concept.
function shred(x:number,y:number,z:number,w:number,len:number,turn:number,hue:number,seed:number){
  const p:number[]=[],ix:number[]=[],nc=5,nr=6;
  for(let face=0;face<2;face++)for(let j=0;j<=nr;j++)for(let i=0;i<=nc;i++){
    const t=j/nr,u=i/nc-.5,taper=1-.86*t*t,f=(.009*Math.sin(11*u+.8*t+seed)+.006*Math.sin(4*u+3*t))*(1+t);
    const dx=u*w*taper+.021*Math.sin(t*3.8+seed)*t,dz=f+(face?-.005:.005)+.035*t*t;
    p.push(x+dx*Math.cos(turn)+dz*Math.sin(turn),
      y-len*t+.023*t*t*Math.sin(i*2.1+seed),z-dx*Math.sin(turn)+dz*Math.cos(turn));
    const k=(face*(nr+1)+j)*(nc+1)+i;
    if(j<nr&&i<nc){const n=k+nc+1;if(!face)ix.push(k,n,k+1,k+1,n,n+1);else ix.push(k,k+1,n,k+1,n+1,n);}
  }
  const off=(nr+1)*(nc+1);
  for(let j=0;j<nr;j++)for(const i of [0,nc]){
    const k=j*(nc+1)+i,n=k+nc+1;
    ix.push(k,k+off,n,k+off,n+off,n);
  }
  const g=new THREE.BufferGeometry();g.setIndex(ix);g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.computeVertexNormals();return colored(g,hue);
}
/** One folded surface from each jaw insertion through the shoulder to the
 * pectoral tear. The fibres spread with the surface; they are not separate
 * floating tubes. The left and right hems uncover different ribs. */
function commandPectoral(s:number){
  type Row=[V,V];
  const near=s<0;
  const rows:Row[]=[
    near?[[.119,1.408,-.128],[.158,1.394,-.128]]:[[.150,1.293,.159],[.210,1.305,.145]],
    near?[[.094,1.290,-.131],[.183,1.268,-.090]]:[[.089,1.213,.012],[.212,1.222,.063]],
    near?[[.059,1.169,-.146],[.228,1.170,-.057]]:[[.051,1.141,-.146],[.240,1.156,-.031]],
    [[.033,near?1.078:1.055,-.197],[.285,near?1.121:1.101,-.066]],
    [[.016,near?1.012:.987,-.234],[.317,near?1.074:1.046,-.068]],
    [[.028,near?.973:.948,-.219],[.285,near?1.037:1.021,-.081]],
    [[.063,near?.955:.924,-.197],[.251,near?1.015:.993,-.116]]
  ];
  // The outer five columns turn over the deltoid and descend the arm.
  // They share the same vertices as the neck/pectoral fan; this is one
  // surface under load even when the lower and upper insertion points turn.
  const fanCols=22,cols=fanCols+5,stride=cols+1,offset=rows.length*stride;
  // Both sheets physically meet along the same sinuous centre seam. At
  // rest it is a narrow ridge; under a strike one fan stretches while the
  // other buckles. A dark gap between two disconnected capes cannot do this.
  const sternum:V[]=[[.003,1.071,-.207],[-.009,1.010,-.246],[.004,.971,-.242],[.008,.941,-.216]];
  const pos:number[]=[],colors:number[]=[],ix:number[]=[];
  const wine=new THREE.Color(near?0x6e555b:0x66565a),skin=new THREE.Color(near?0x98847a:0x88756f);
  const tendon=new THREE.Color(0xae9984),ink=new THREE.Color();
  for(let back=0;back<2;back++)for(let j=0;j<rows.length;j++)for(let i=0;i<=cols;i++){
    const u=Math.min(1,i/fanCols),edge=Math.max(0,(i-fanCols)/5),t=j/(rows.length-1),a=rows[j][0],b=rows[j][1],arch=Math.sin(Math.PI*u);
    const fan=2*Math.PI*(u*(near?4.1:3.6)+.33*Math.sin(t*4.4+u*2)+s*.12);
    const ridge=Math.pow(.5+.5*Math.cos(fan),3)*arch;
    const torn=Math.sin(5*u+.8*s)**2*(i%4===1?.041:i%4===2?.026:.008);
    const end=j===rows.length-1?torn*sat(u,0,.11):0;
    const cap=sat(t,.32,.77),scallop=Math.sin(edge*Math.PI),groove=.5+.5*Math.cos(13*edge-5*t);
    const start=j<3?[s*a[0],a[1],a[2]]:sternum[j-3];
    pos.push(THREE.MathUtils.lerp(start[0],s*b[0],u)+s*(edge*(.010+cap*.043)+cap*.023*scallop),
      THREE.MathUtils.lerp(start[1],b[1],u)+.009*arch*(1-t)-end-edge*cap*(.050+.058*t),
      THREE.MathUtils.lerp(start[2],b[2],u)-arch*(.008+.051*Math.sin(t*Math.PI*.86))-.024*ridge
        +edge*(.013+.035*cap)-.015*scallop*cap*groove+back*.006);
    ink.copy(wine).lerp(skin,.14+.31*arch+.12*Math.sin(u*9+t*5+s)).lerp(tendon,.73*ridge*(1-.38*t)+.20*cap*scallop*groove);
    if(back)ink.multiplyScalar(.66);
    colors.push(ink.r,ink.g,ink.b);
  }
  const tri=(a:number,b:number,c:number)=>{if(s>0)ix.push(a,b,c);else ix.push(a,c,b);};
  const rim=(a:number,b:number)=>{tri(a,a+offset,b);tri(b,a+offset,b+offset);};
  const missing=(i:number,j:number)=>(j===2&&(i===7||i===15))||(j===3&&(i===6||i===15))||(j===4&&i===15);
  for(let j=0;j<rows.length-1;j++)for(let i=0;i<cols;i++){
    if(missing(i,j))continue;
    const a=j*stride+i,b=a+1,c=a+stride,d=c+1;
    tri(a,b,c);tri(b,d,c);tri(a+offset,c+offset,b+offset);tri(b+offset,c+offset,d+offset);
    if(j===0||missing(i,j-1))rim(a,b);if(j===rows.length-2||missing(i,j+1))rim(d,c);
    if(i===0&&j<3||missing(i-1,j))rim(c,a);if(i===cols-1||missing(i+1,j))rim(b,d);
  }
  const g=new THREE.BufferGeometry();g.setIndex(ix);
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();return g;
}
// Rest sites for the two separate jaw-to-neck insertions. The near skull
// sits forward over the torn shoulder; the watcher cranes up from behind.
export const COMMAND_HEAD_SEATS:readonly [V,V]=[[-.267,1.355,-.229],[.279,1.458,-.092]];
// Rest pivots in the common chest coordinate system. Head/upper/elbow meshes
// remain independently inspectable. Their *actual* matrices drive the skin.
export const COMMAND_ARM_SEATS:readonly [V,V]=[[-.302,.939,-.049],[.293,1.052,.015]];
const armSize=[1.16,1.12],headSize:V[]=[[.505,.575,.54],[.495,.55,.52]];
// Thin wet folds with an actual ragged edge and missing triangles. These
// live inside the existing rigid/skinned draws (no alpha card or decal).
function frayedSheet(side:number,nx:number,ny:number,point:(u:number,v:number,i:number)=>V,
    tint:(u:number,v:number)=>THREE.Color,cell:(i:number,j:number)=>boolean){
  const pos:number[]=[],rgb:number[]=[],idx:number[]=[],stride=nx+1,off=stride*(ny+1);
  for(let b=0;b<2;b++)for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const u=i/nx,v=j/ny,[x,y,z]=point(u,v,i),c=tint(u,v);pos.push(x,y,z+b*.004);rgb.push(c.r,c.g,c.b);
  }
  const tri=(a:number,b:number,c:number)=>{if(side>0)idx.push(a,b,c);else idx.push(a,c,b);};
  const cut=(a:number,b:number)=>{tri(a,a+off,b);tri(b,a+off,b+off);};
  const have=(i:number,j:number)=>i>=0&&i<nx&&j>=0&&j<ny&&cell(i,j);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(have(i,j)){
    const a=j*stride+i,b=a+1,c=a+stride,d=c+1;
    tri(a,b,c);tri(b,d,c);tri(a+off,c+off,b+off);tri(b+off,c+off,d+off);
    if(!have(i,j-1))cut(a,b);if(!have(i+1,j))cut(b,d);if(!have(i,j+1))cut(d,c);if(!have(i-1,j))cut(c,a);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function ribDrape(s:number){
  const c=new THREE.Color(),dark=new THREE.Color(0x423a46),ridge=new THREE.Color(0x846454);
  const rip=(u:number,v:number)=>Math.pow(.5+.5*Math.sin(27*u-6.7*v+1.4*Math.sin(8*u+5*v+s)),3);
  return frayedSheet(s,12,6,(u,v,i)=>{
    // A split leaf of tissue grows out from under the pectoral, wraps the
    // broken cartilage, then pitches inward in three unequal hanging tips.
    const cut=[.02,.03,.005,.09,.022,.008,.054,.081,.015,.034,.01,.043,.014][i];
    const x=.039+.210*u+.014*v*Math.sin(3.6*u+s)-.048*v*v;
    const depth=-.253+.132*u*u+.033*v*v-.019*rip(u,v);
    return [s*x,1.015+.042*u-.012*Math.sin(5*u+s)-v*((s<0?.104:.081)+cut*v+.042*Math.sin(3*u+s)**2),depth];
  },(u,v)=>c.copy(dark).lerp(ridge,.17+.74*rip(u,v)*(.79-.35*v)).multiplyScalar(.81+.22*Math.sin(9*u+2*v+s)),
    (i,j)=>!(j>2&&i===(s<0?4:8)||j>3&&(i===1||i===10)||j===2&&i===6||j===5&&(i===5||i===7||i===11)));
}
const elbowDrop=-.312;
function armElbowBind(side:number){
  const v=COMMAND_ARM_SEATS[side],k=armSize[side];
  return new THREE.Matrix4().makeScale(k,k,k).setPosition(v[0],v[1]+elbowDrop*k,v[2]);
}
export function commandFasciaRig(){
  const bones=Array.from({length:7},()=>new THREE.Bone());
  const binds=[new THREE.Matrix4(),
    ...COMMAND_HEAD_SEATS.map((v,i)=>new THREE.Matrix4().makeScale(...headSize[i]).setPosition(...v)),
    ...COMMAND_ARM_SEATS.map((v,i)=>new THREE.Matrix4().makeScale(armSize[i],armSize[i],armSize[i]).setPosition(...v)),
    armElbowBind(0),armElbowBind(1)];
  bones.forEach((b,i)=>b.matrixWorld.copy(binds[i]));
  return new THREE.Skeleton(bones,binds.map(m=>m.invert()));
}
export function poseCommandFascia(rig:THREE.Skeleton,heads:(THREE.Mesh|null)[],arms:(THREE.Mesh|null)[],elbows:(THREE.Mesh|null)[]){
  // Detached bind: no world/eye/camera matrices enter the solve. The
  // existing chest parent already accounts for body position, size & sway.
  for(let i=0;i<2;i++){
    const h=heads[i],a=arms[i],e=elbows[i];if(!h||!a||!e)continue;
    h.updateMatrix();a.updateMatrix();e.updateMatrix();
    rig.bones[1+i].matrixWorld.copy(h.matrix);rig.bones[3+i].matrixWorld.copy(a.matrix);
    rig.bones[5+i].matrixWorld.multiplyMatrices(a.matrix,e.matrix);
  }
}
function weightSkin(g:THREE.BufferGeometry,weight:(x:number,y:number,z:number)=>readonly number[]){
  const p=g.getAttribute('position'),w=new Float32Array(p.count*4),id=new Uint16Array(p.count*4);
  for(let i=0;i<p.count;i++){const a=weight(p.getX(i),p.getY(i),p.getZ(i)),k=i*4;
    for(let j=0;j<a.length;j+=2){id[k+j/2]=a[j];w[k+j/2]=a[j+1];}}
  g.setAttribute('skinWeight',new THREE.BufferAttribute(w,4));g.setAttribute('skinIndex',new THREE.BufferAttribute(id,4));return g;
}
function elbowSleeve(i:number){
  // The bridge runs from the triceps into the extensor of the forearm.
  // Unlike two sausage ends meeting at the pivot, axial rows through the
  // joint are shared and fold as a function of both neighbouring bones.
  const s=i?1:-1,courses=[
    [-.171,.045,.046,.003],[-.209,.056,.050,.001],[-.253,.052,.048,.003],[-.287,.044,.044,.008],
    [-.308,.044,.047,.012],[-.325,.045,.045,.009],[-.351,.048,.045,.009],[-.386,.049,.047,.012],[-.425,.039,.040,.013]];
  const pos:number[]=[],idx:number[]=[],cols=14;
  courses.forEach(([y,rx,rz,z],j)=>{for(let k=0;k<cols;k++){
    const a=2*Math.PI*k/cols,f=.88+.12*Math.sin(a*4+y*13+i),x=s*(.004+(j<3?(.012-.004*j):.003));
    pos.push(x+Math.sin(a)*rx*f,y+.006*Math.sin(a+i)*Math.sin(j*Math.PI/8),z+Math.cos(a)*rz*f);
    if(j){const b=(j-1)*cols+k,c=(j-1)*cols+(k+1)%cols;idx.push(b,b+cols,c,c,b+cols,c+cols);}
  }});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();colored(g,i?0x70615d:0x655c59);
  weightSkin(g,(_x,y)=>{const t=sat(-y,.24,.388);return [3+i,1-t,5+i,t];});
  return g.scale(armSize[i],armSize[i],armSize[i]).translate(...COMMAND_ARM_SEATS[i]);
}
export function commandMantle(){
  // A narrow load-bearing spine, not a filled ellipsoid in the rib cage.
  // The left/right bars span air between their vertebral and sternal roots.
  const p=[cord([[.005,.572,.018,.079],[-.029,.695,.067,.060],[-.043,.829,.098,.053],
    [-.015,.976,.109,.082],[.029,1.076,.076,.088]],0x685e5c,.87,12),
    // The keel and one oblique can be seen through the missing right ribs.
    // Leave actual daylight on either side instead of filling the barrel.
    cord([[-.061,.609,-.060,.038],[-.071,.711,-.043,.040],[-.030,.847,-.100,.044],[.030,.950,-.158,.023]],0x645954,.63),
    cord([[.058,.740,-.108,.016],[.029,.825,-.171,.023],[-.007,.932,-.199,.028],
      [.011,1.008,-.218,.038],[.015,1.067,-.18,.025]],0x8a7770,.60)];
  for(const s of [-1,1]){
    p.push(commandPectoral(s));
    // Both neck roots share the keel and trapezius, not a shirt collar.
    const stem:Course[]=s<0?[[-.342,1.011,.056,.080],[-.22,1.125,.069,.097],[-.157,1.211,.009,.072],
        [-.146,1.284,-.064,.052],[-.139,1.399,-.095,.064]]:
      [[.33,1.032,.071,.087],[.238,1.107,.101,.117],[.193,1.179,.132,.083],
        [.168,1.234,.119,.056],[.169,1.312,.116,.055]];
    p.push(cord(stem,hide,1.04,11));
    // The lifted watcher's jaw swings across its own throat when it scans.
    // Its muscular sling has to sweep behind the ramus before climbing to
    // the mastoid, not rise in front of the teeth and reverse at the nose.
    const sling:Course[]=s<0?[[-.208,.976,-.120,.073],[-.162,1.13,-.104,.060],[-.118,1.289,-.083,.046],[-.129,1.365,-.156,.036]]:
      [[.208,.976,-.120,.073],[.162,1.129,-.097,.056],[.189,1.203,.021,.049],
        [.204,1.253,.121,.039],[.205,1.291,.158,.027],[.206,1.319,.162,.014]];
    p.push(cord(sling,plum,.72));
    for(let j=0;j<4;j++){
      const off=.018*j;
      const fibre:Course[]=s<0?[[-(.274-off),1.046,-.049,.021],[-(.174-off*.25),1.113,-.097-off*.56,.026],
        [-(.108+off*.31),1.247,-.107-off*.48,.015],[-.122,1.445,-.123,.012]]:
        [[.274-off,1.046,-.049,.021],[.174-off*.25,1.113,-.097-off*.56,.026],
         [.187+off*.40,1.224,.003-off*.40,.015],[.179+off*.42,1.300,.088+off*.26,.010],[.177+off*.46,1.319,.120,.006]];
      p.push(cord(fibre,[0x90847b,0x6f6466,0x9d8c7f,0x756468][j],.57));
    }
    // A small subcutaneous clavicle climbs outwards to the deltoid; its
    // medial and lateral ends disappear under the sheet and the shoulder.
    p.push(cord([[s*.020,.990,-.192,.004],[s*.088,1.010,-.192,.009],
      [s*.156,1.059,-.156,.014],[s*.232,1.079,-.103,.012],
      [s*.287,1.076,-.064,.009],[s*.320,1.058,-.020,.004]],s<0?0x9c8c81:0x918077,.54,8));
    p.push(cord([[s*.058,.977,.132,.040],[s*.177,1.064,.162,.076],[s*.307,1.061,.125,.067]],0x566662,.57));
    p.push(ribDrape(s));
    const levels=s<0?[1.006,.954,.888,.812,.752]:[1.037,.961,.907,.849,.767];
    levels.forEach((y,i)=>{
      const w=.265-i*.013+.014*Math.sin(i+s),tip=[.064,.149,.112,.033,.162][s<0?i:4-i];
      const broken=tip>.09,z=-.163+.005*Math.abs(i-2);
      // A rib descends at the flank, then rises into the sternum. The lower
      // bars end in staggered cartilage splinters instead of horizontal belts.
      const tilt=(s<0?1:-1)*[.088,.021,.115,.059,-.016][i],at=(x:number)=>y+tilt*(x/.23-.52);
      // Two ribs end out at the flank; the opposite front arc has a sharp
      // kink into the sternum. Break the repeating reflective ladder itself.
      const stump=i===(s<0?1:3)||i===4;
      const arc:Course[]=[[s*.052,at(.052)+.007,.108,.010],[s*(w-.059),at(w-.059)+.010,.132,.013],
        [s*(w+.002),at(w+.002)+.005,.059,.016],[s*(w-.012),at(w-.012)-.003,stump?-.033:-.061,stump?.008:.013]];
      if(!stump)arc.push([s*(w-.071),at(w-.071)-.015-.014*Math.cos(i+s),-.134,i<2?.012:.016],
        [s*tip,at(tip)-(broken?.035:.009),z-(broken?.000:.035),broken?.003:.006]);
      p.push(cord(arc,[0x66575b,0x514754,0x806c64,0x685750,0x4d4750][(i+(s>0?1:0))%5],s<0?.49:.61,8));
    });
    // Flayed flank: two oblique slips overlap the edge of the ribs. They
    // terminate at the iliac crest; the gut stays concave rather than filled.
    if(s>0)p.push(cord([[s*.249,.960,.028,.022],[s*.232,.882,.010,.030],[s*.188,.800,-.017,.029],
      [s*.138,.721,-.044,.015],[s*.101,.667,-.050,.010]],0x71635f,.46,7));
    p.push(cord([[s*.224,.858,.027,.013],[s*.199,.804,.017,.021],[s*.162,.737,-.014,.017],
      [s*.119,.682,-.025,.006]],0x5c524f,.43,7));
    p.push(cord([[s*.191,.813,.045,.021],[s*.173,.753,-.049,.020],[s*.119,.674,-.087,.017],
      [s*.068,.605,-.114,.009]],s<0?0x9a867c:0x827369,.63));
    // Blade of the shoulder carries the arm; the chips follow it, not a row of horns.
    for(let i=0;i<2;i++){
      const x=s*(.218+i*.072),y=1.096-i*.039,z=.079+i*.019;
      p.push(cord([[x-s*.04,y-.077,z,.057],[x+s*.018,y+.002,z+.034,.047],
        [x+s*.053,y+.057,z+.061,.023],[x+s*.079,y+.091-i*.024,z+.064,.006]],i===1?0x93887d:horn,.53));
    }
    p.push(cord([[s*.075,.819,.125,.013],[s*.118,.927,.151,.021],[s*.169,1.014,.162,.032],[s*.233,1.083,.142,.022]],0x879182,.49));
  }
  p.push(cord([[-.008,1.04,-.201,.024],[.008,.985,-.24,.025],[-.024,.915,-.254,.025],
    [.006,.845,-.244,.018],[.009,.795,-.224,.01]],0x916e6a,.77));
  // The two heads pull on the same collar sling. Three divergent folds
  // cross the formerly empty V toward the opposite insertion, not two
  // disconnected vertical cylinders. Outside strands blend onto the jaw.
  for(let j=0;j<3;j++){
    const d=j*.014;
    p.push(cord([[-.129,1.333+d,-.138+d,.010],[-.104,1.219+d,-.171+d,.014],[-.068,1.144+d,-.190+d,.012],
      [-.006,1.101+d,-.199+d,.011],[.070,1.136+d,-.153+d,.012],[.113,1.193+d,-.072+d,.010],
      [.151,1.244+d*.48,.139+d,.006]],[0x746a62,0x514847,0x83786e][j],.57,7));
  }
  for(let j=0;j<7;j++){
    const y=.70+j*.070,z=.162+.050*Math.sin(j*.49);
    p.push(cord([[0,y-.042,z-.041,.051],[.005,y+.004,z+.009,.051],[.006,y+.036,z+.043,.030],
      [-.007,y+.046+j*.003,z+.059+j*.004,.012]],j%2?0x978b81:0xb1a798,.57));
  }
  const g=solid(p),points=g.getAttribute('position');
  // The two forks diverge out of the same upper back. Mapping the whole
  // tapered end keeps all four neck tendons attached to the moving skull.
  const normals=g.getAttribute('normal'),n=new THREE.Vector3();
  for(let i=0;i<points.count;i++){
    const x=points.getX(i),y=points.getY(i),z=points.getZ(i),near=x<0;
    const a=1.085,b=near?1.39:1.31,t=THREE.MathUtils.clamp((y-a)/(b-a),0,1),w=t*t*(3-2*t),dw=6*t*(1-t)/(b-a);
    const dx=near?-.124:.113,dy=near?-.060:.130,dz=near?-.116:-.146;
    // Shearing the original normals as well as the positions prevents the
    // clean patch of rain on the side of a neck from looking stamped on.
    n.fromBufferAttribute(normals,i);
    n.y=(n.y-dw*(dx*n.x+dz*n.z))/(1+dy*dw);n.normalize();normals.setXYZ(i,n.x,n.y,n.z);
    points.setXYZ(i,x+dx*w,y+dy*w,z+dz*w);
  }
  weightSkin(g,(x,y)=>{
    const i=x<0?0:1,seat=COMMAND_HEAD_SEATS[i];
    const neck=sat(y,1.06,seat[1]-.025)*sat(Math.abs(x),.052,.125);
    const arm=(1-neck)*sat(Math.abs(x),.17,.338)*(1-sat(y,1.086,1.224))*sat(y,.912,.974);
    // Trapezius blends a third way between skull, shoulder and fixed sternum.
    return [0,1-neck-arm,1+i,neck,3+i,arm];
  });
  // Same one mantle draw, including both deforming elbow sleeves.
  return solid([g,elbowSleeve(0),elbowSleeve(1)]);
}
export function commandWaist(){
  const p=[mass([0,.59,.006],[.155,.121,.12],0x393a33)];
  for(const s of [-1,1]){
    p.push(cord([[s*.096,.497,.110,.086],[s*.157,.581,.060,.078],[s*.142,.642,-.035,.060],[s*.073,.713,-.090,.023]],hide,.67));
    for(let j=0;j<3;j++)p.push(cord([[s*.19,.66-j*.037,-.066,.020],[s*.107,.651-j*.04,-.126,.025],
      [s*.018,.623-j*.035,-.142,.014]],j%2?plum:0x937169,.76));
    for(let j=0;j<5;j++){
      const a=s*(.42+j*.55),y=.594+j*.008;
      p.push(shred(Math.sin(a)*.187,y,-Math.cos(a)*.133,.064-(j%2)*.017,
        .154+((j+(s<0?2:0))%3)*.086+(s>0&&j===3?.145:0),-a, [0x596458,0x766f61,0x504f4d,0x686955,0x494d49][j],3*j+s));
    }
  }
  return solid(p);
}

/** Canvas panels pinned to the back and hips. Open chest, missing cells and
 * stepped hem are holes in both skins, not opacity or painted black tears. */
export function commandCoat(){
  const parts:THREE.BufferGeometry[]=[];
  function panel(start:number,end:number,upper:boolean,seed:number,n:number,rows:number){
    const pos:number[]=[],colors:number[]=[],ix:number[]=[],dye=new THREE.Color();
    const palette=upper?[0x444447,0x59524e,0x6d6860,0x80776b]:[0x3a4143,0x525450,0x66655a,0x786e5e];
    const worn=new THREE.Color(0x9e9278);
    const cell=(i:number,j:number)=>{
      if(i<0||i>=n||j<0||j>=rows)return false;
      const k=(i+seed)%11;
      if(j===rows-1&&(k===0||k===1||k===6))return false;
      if(j>=rows-2&&k===1)return false;
      if(j>=rows-3&&k===5)return false;
      return !(j===2&&(k===3||k===4)||j===3&&k===3);
    };
    const index=(i:number,j:number,f:number)=>f*(n+1)*(rows+1)+j*(n+1)+i;
    for(let f=0;f<2;f++)for(let j=0;j<=rows;j++)for(let i=0;i<=n;i++){
      const t=j/rows,a=THREE.MathUtils.lerp(start,end,i/n)+.032*Math.sin(4*t+i*.8+seed)*t;
      const hem=.035*Math.sin(i*2.32+seed)+.036*Math.sin(i*.85+seed);
      const span=upper?.121+.041*Math.cos(a*2):.204+.046*Math.cos(a+seed)+.12*Math.pow(Math.max(0,Math.sin(i*1.12+seed)),3);
      const top=upper?1.068+.030*Math.sin(a):.654+.022*Math.sin(a*2+.7);
      const fold=(.014*Math.sin(i*2.21+seed+t*.77)+.008*Math.sin(1.18*i-t*3.))*(upper?.9:1.1);
      const r=fold-f*.008+(upper?.296-.063*t:.205+.041*t*t);
      const d=fold-f*.008+(upper?.222-.015*t:.156+.048*t*t);
      pos.push(Math.sin(a)*r+(upper?0:.055*t*t*Math.cos(a*2)),top-span*t+hem*t*t,-Math.cos(a)*d+.022+(upper?0:.115*t*t));
      // Canvas faces away in broad, matte panels. Light edging follows the
      // actual torn hem and punched holes rather than every grid boundary.
      const plane=.5+.5*Math.cos(i*1.14-t*.78+seed),outside=!cell(i,j)||!cell(i-1,j);
      const tear=outside&&j>1&&((i+2*j+seed)%5!==0);
      dye.setHex(palette[Math.min(3,Math.floor(plane*3.99))])
        .lerp(worn,tear?(f?.17:.46):0).multiplyScalar(f?.60:.90+.08*plane);
      colors.push(dye.r,dye.g,dye.b);
    }
    function rim(a:number,b:number){
      const off=(n+1)*(rows+1);
      ix.push(a,a+off,b,b,a+off,b+off);
    }
    for(let j=0;j<rows;j++)for(let i=0;i<n;i++)if(cell(i,j)){
      const a=index(i,j,0),b=a+1,c=index(i,j+1,0),d=c+1;
      const aa=index(i,j,1),bb=aa+1,cc=index(i,j+1,1),dd=cc+1;
      ix.push(a,b,c,b,d,c,aa,cc,bb,bb,cc,dd);
      if(!cell(i,j-1))rim(a,b);if(!cell(i+1,j))rim(b,d);
      if(!cell(i,j+1))rim(d,c);if(!cell(i-1,j))rim(c,a);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(ix);g.computeVertexNormals();parts.push(g);
  }
  panel(1.12,2.49,true,3,16,7);
  panel(3.78,5.01,true,6,11,6);
  panel(.32,2.92,false,4,15,7);
  panel(3.15,5.87,false,2,16,7);
  // Three broad tears, not a closed skirt: one spills off the near hip,
  // two taper behind the long leg. Ragged strips leave open air at the knee.
  for(const [i,[x,y,z,width,drop,angle]] of ([
    [-.173,.612,-.068,.119,.285,.91],[-.18,.64,.021,.086,.368,1.21],
    [.139,.621,.092,.091,.403,-.72],[.063,.613,.139,.066,.32,-.49],
    [.215,1.077,.055,.098,.212,-.88],[-.252,1.060,.015,.077,.193,1.34]
  ] as const).entries())parts.push(shred(x,y,z,width,drop,angle,[0x4c453a,0x343931,0x474034][i%3],1.93*i));
  return solid(parts);
}

/** A low, splayed weight-bearing pad, not five sticks glued to a sphere.
 * Heel, ball, and individual claw pads have genuinely flat bearing faces.
 * The rising arch and the gaps between toes remain physically open. */
export function commandFoot(side:number){
  type Section=[number,number,number,number,number]; // z, x, half-width, bottom, crown
  const p:number[]=[],c:number[]=[],ix:number[]=[],mat=new THREE.Color();
  const deep=new THREE.Color(0x423a48),skin=new THREE.Color(0x968277),lip=new THREE.Color(0xad998b),horn=new THREE.Color(0xb5a794);
  const outline=[[-.46,.93],[0,1],[.58,.87],[.91,.62],[1,.31],[.85,0],[.16,0],[-.60,0],[-.89,.08],[-1,.37],[-.85,.68]] as const;
  function sections(rows:Section[],toe=-1){
    const base=p.length/3,n=outline.length;
    rows.forEach(([z,x,w,low,high],j)=>{outline.forEach(([u,v],i)=>{
      const curl=.9+.1*Math.sin(9*u+z*31+side),t=j/(rows.length-1);
      p.push(x+u*w,low+(high-low)*v*(v>.8?curl:1),z);
      const ridge=.5+.5*Math.cos(6*u+17*z+toe*.8),top=sat(v,.22,.84);
      mat.copy(deep).lerp(skin,.24+.66*top).lerp(lip,.41*ridge*top);
      if(toe>=0&&t>.65)mat.lerp(horn,.22+.57*top);
      if(v<.12)mat.multiplyScalar(.77);
      c.push(mat.r,mat.g,mat.b);
      if(j){const a=base+(j-1)*n+i,b=base+(j-1)*n+(i+1)%n;ix.push(a,b,a+n,b,b+n,a+n);}
    });});
    const end=base+(rows.length-1)*n;
    for(let i=1;i<n-1;i++)ix.push(base,base+i+1,base+i,end,end+i,end+i+1);
  }
  const x=side*.008;
  sections([[.146,x,.032,.012,.068],[.126,x,.062,.001,.091],[.083,x,.073,.001,.099],
    [.039,x,.070,.004,.107],[-.008,x,.062,.017,.105],[-.054,-x,.076,.014,.092],
    [-.104,-x,.098,.002,.072],[-.136,-x,.112,.001,.060],[-.162,-x,.102,.001,.046],
    [-.181,-x,.083,.007,.037]]);
  for(let i=0;i<5;i++){
    const axis=(i-2)*.046*side-side*.008,len=[.179,.192,.169,.143,.115][i],w=[.030,.025,.024,.022,.019][i];
    sections([[-.104,axis*.76,w*.66,.030,.065],[-.143,axis*.93,w*.98,.015,.070],
      [-.165,axis*1.08,w,.002,.055],[-.156-len*.33,axis*1.21,w*.80,.001,.043],
      [-.152-len*.55,axis*1.31,w*.78,.007,.046],[-.148-len*.70,axis*1.36,w*.69,.001,.033],
      [-.147-len*.82,axis*1.38,w*.57,.002,.037],[-.147-len*.94,axis*1.35,w*.32,.009,.025],
      [-.149-len,axis*1.33,w*.05,.003,.007]],i);
  }
  const g=new THREE.BufferGeometry();g.name='command-broad-planted-claw';
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  g.setIndex(ix);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}

const bell=(x:number,m:number,s:number)=>Math.exp(-(((x-m)/s)**2));
const fields=(x:number,y:number,mx:number,my:number,sx:number,sy:number)=>bell(x,mx,sx)*bell(y,my,sy);
function interpolate(x:number,r:readonly (readonly number[])[],k:number){
  let i=0;while(i<r.length-2&&x>r[i+1][0])i++;
  const a=r[i],b=r[i+1],t=THREE.MathUtils.clamp((x-a[0])/(b[0]-a[0]),0,1);
  return THREE.MathUtils.lerp(a[k],b[k],t);
}
// Horizontal skull sections. Unequal cheek shelves, brow, pitted parietal
// bone and recessed orbits are all modeled here, from no likeness or photo.
const contour=[[-.227,.034,.058],[-.198,.089,.119],[-.144,.129,.153],[-.078,.157,.167],
  [-.018,.178,.174],[.048,.193,.181],[.10,.194,.191],[.18,.192,.193],[.245,.163,.167],
  [.286,.114,.118],[.312,.064,.066],[.32,.006,.006]] as const;
const JAW_HINGE:V=[0,-.035,.062];
export const COMMAND_JAW_HINGE=JAW_HINGE;
const socketA=(s:number,second:boolean)=>s*((second?.505:.485)+(s>0?.037:-.033));
const socketY=(s:number,second:boolean)=>(second?.073:.089)+s*(second?.009:-.008);
function skullSection(a:number,y:number,second:boolean){
  const sn=Math.sin(a),cs=Math.cos(a),s=sn<0?-1:1,f=sat(cs,.03,.73);
  const ind=second?1:0,side=s*(second?-1:1),ry=interpolate(y,contour,1)*(second?1.04:.92);
  const x=sn*ry,ax=Math.abs(x),oy=socketY(s,second),oa=Math.abs(socketA(s,second));
  const orbit=f*fields(Math.acos(THREE.MathUtils.clamp(cs,-1,1)),y,oa,oy,.251,.029);
  const cheek=fields(ax,y,.122,.009+side*.016,.049,.031);
  const hollow=fields(ax,y,.113,-.038-side*.014,.046,.042);
  const brow=fields(ax,y,.079,oy+.046+side*.011+ax*.095,.060,.019);
  const nose=fields(x,y,second?.009:-.011,.033,.033,.087);
  const notch=fields(x,y,side*.017,-.007,.020,.027);
  const fissure=f*bell(x,(second?-.072:.088)+.44*(y-.152)+.005*Math.sin(y*75+ind),.009)
    * bell(y,second?.167:.180,.096);
  const ridge=Math.cos(7*a+14*y+ind)*Math.cos(3*a-36*y);
  const skirt=sat(y,-.21,-.13)*(1-sat(y,.254,.32));
  const rips=.006*ridge*skirt*(.32+.68*(1-orbit));
  const xx=x*(1-.105*skirt)+.011*Math.sin(y*10+ind)*skirt + sn*(rips+.016*cheek*side-.025*hollow);
  let z=-cs*interpolate(y,contour,2)*(second?.98:1.02)+.015+.027*sat(y,.12,.29);
  const nostril=fields(ax,y,.023,-.008+side*.004,.011,.012);
  const lipfold=fields(ax,y,.057,.001,.012,.042);
  z+=orbit*(second?.062:.071);
  z-=f*(.058*cheek-.031*hollow+.037*brow+.070*nose
      +.054*fields(x,y,second?-.014:.008,-.002,.033,.025)-.024*notch-.026*nostril-.010*lipfold
      +.047*fields(ax,y,.052,-.063,.062,.033)+.038*fields(ax,y,.038,-.176,.073,.035));
  z+=.012*fissure+cs*rips;
  // The original head shape and real cornea stay put. A short supraorbital
  // plane and the alar wings give the painted values actual thickness when
  // the face turns; the lower skull squints and the watcher cocks a brow.
  const ar=Math.abs(Math.atan2(sn,cs));
  const lid=fields(ar,y,oa+.027,oy+.019+(.006+side*.005)*(ar-oa),.243,.014);
  const bridge=fields(x,y,second?.015:-.019,.048,.020,.061);
  z-=f*(.0073*lid+.0054*bridge+.0057*fields(ax,y,.035,-.006,.014,.016));
  return {x:xx,y,z,orbit,brow,cheek,hollow,fissure,ridge,side,notch:Math.max(notch*.76,nostril)*f,face:f};
}
function dentalSeam(a:number,second:boolean){
  const sn=Math.sin(a),cs=Math.cos(a);
  return -.069-.051*bell(Math.abs(sn),second?.71:.64,.23)+.044*bell(Math.abs(sn),.96,.20)
    -.096*sat(-cs,.12,.86)+sn*(second?.024:-.022);
}
export function commandSkull(second=false,jaw=false) {
  const p:number[]=[],c:number[]=[],ember:number[]=[],pigment:number[]=[],ix:number[]=[];
  const ink=new THREE.Color(),tmp=new THREE.Color(),cols=64,rows=jaw?17:40;
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const a=(i/cols-.5)*Math.PI*2,cs=Math.cos(a);
    // A narrow broken vertical gape on the watcher; a pulled-down mouth
    // corner on the low skull. No straight transverse row of exposed teeth.
    const seam=dentalSeam(a,second);
    const y=jaw?THREE.MathUtils.lerp(-.227,seam,j/rows):THREE.MathUtils.lerp(seam,.32,j/rows);
    const q=skullSection(a,y,second);
    p.push(q.x,q.y,q.z);
    pigment.push(...skullPaintUv(i/cols,y,second));
    const cap=sat(y,.192+.040*cs+.018*Math.cos(5*a),.256+.042*cs+.014*Math.sin(3*a));
    const lichen=.5+.24*Math.sin(7*a+19*y+1.7*Math.sin(2*a-31*y))+.22*Math.cos(6*a-27*y+2*Math.sin(20*y));
    ink.setHex(second?0x564e4d:0x514d50).lerp(tmp.setHex(second?0x8a8580:0x868887),.47*lichen);
    ink.lerp(tmp.setHex(0x9b8b87),Math.min(.85,q.face*(.74*q.cheek+.60*q.brow)));
    ink.lerp(tmp.setHex(0x50484c),.70*q.hollow*q.face);
    ink.lerp(tmp.setHex(second?0x252826:0x282427),cap*(.72+.25*lichen));
    ink.lerp(tmp.setHex(0x211d24),sat(q.orbit,.19,.80));
    ink.lerp(tmp.setHex(0x343139),Math.min(.94,q.notch*.86+.65*q.fissure));
    ink.lerp(tmp.setHex(0x493e40),.54*q.face*bell(y,seam,.012));
    ink.multiplyScalar(.89+.15*q.ridge);
    c.push(ink.r,ink.g,ink.b);ember.push(0);
    if(j<rows&&i<cols){const k=j*(cols+1)+i,n=k+cols+1;ix.push(k,n,k+1,k+1,n,n+1);}
  }
  const cap=jaw?0:rows*(cols+1);
  for(let k=1;k<cols-1;k++){
    if(jaw)ix.push(cap,cap+k,cap+k+1);else ix.push(cap,cap+k+1,cap+k);
  }
  // Real corneal nuggets sit inside the recess. Their isolated emissive
  // vertex channel shares the skull draw/fade; the surrounding skin is lit.
  if(!jaw)for(const s of [-1,1]){
    const a=socketA(s,second),q=skullSection(a,socketY(s,second),second);
    const pupil=new THREE.SphereGeometry(1,12,7).scale(second?.0115:.0125,.009,.0098)
      .rotateZ(s*.19).translate(q.x,q.y,q.z-.013);
    const v=pupil.getAttribute('position'),n=pupil.getAttribute('normal'),idx=pupil.index!,start=p.length/3;
    for(let j=0;j<v.count;j++){
      p.push(v.getX(j),v.getY(j),v.getZ(j));c.push(.26,.028,.004);
      pigment.push(...skullPaintUv(.5+a/(Math.PI*2),q.y,second));
      ember.push(.36+.64*Math.max(0,-n.getZ(j)));
    }
    for(let j=0;j<idx.count;j++)ix.push(start+idx.getX(j));
    pupil.dispose();
  }
  const g=new THREE.BufferGeometry();g.setIndex(ix);
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  g.setAttribute('commandEmber',new THREE.Float32BufferAttribute(ember,1));
  g.setAttribute('commandPigmentCoord',new THREE.Float32BufferAttribute(pigment,2));
  g.computeVertexNormals();if(jaw)g.translate(-JAW_HINGE[0],-JAW_HINGE[1],-JAW_HINGE[2]);
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function commandHeadTrim(second=false,lower=false){
  const p:THREE.BufferGeometry[]=[];
  const y=lower?-.087:-.064;
  // A real dark palate behind the enamel, all fully opaque. At rest the two
  // arches interlock; as the jaw opens one can see through the side gaps.
  if(lower){
    // A U-shaped alveolar shelf follows the actual teeth; the old broad
    // flat ellipsoid filled the entire open mouth like a dark metal plate.
    const gum:Course[]=[-1.22,-.92,-.62,-.31,0,.31,.62,.92,1.22].map(a=>{
      const y=dentalSeam(a,second)-.019,q=skullSection(a,y,second);
      return [q.x*.91,y,q.z+.025,.0115+.005*Math.abs(Math.sin(a))];
    });
    p.push(cord(gum,0x674b4d,.70,8));
  }else p.push(mass([0,y+.014,-.085],[.099,.020,.069],0x392e37,0,0,10,6));
  if(!lower){
    p.push(mass([0,-.065,.030],[.125,.074,.111],second?0x8b7167:0x855e61,0,0,10,7));
    for(const s of [-1,1])p.push(cord([[s*.119,-.018,.069,.047],[s*.134,-.044,.031,.045],
      [s*.119,-.083,-.031,.028]],second?0xa58677:0x996f65,.69));
  }
  // Lining is deep inside the arch. Its edge never becomes the front
  // outline or reflects as one broad streak in the open/side view.
  if(lower){
    const floor=mass([0,0,0],[1,1,1],0x624a4d,0,0,16,8),v=floor.attributes.position,vc=floor.attributes.color;
    const a=new THREE.Color(),well=new THREE.Color(0x443745),fold=new THREE.Color(0x976f62);
    for(let i=0;i<v.count;i++){
      const x=v.getX(i),up=v.getY(i),z=v.getZ(i),tip=Math.max(0,-z);
      const groove=Math.exp(-((x-.06+.09*z)**2)/.032)*Math.max(0,up);
      const lobes=Math.exp(-((Math.abs(x)-.36)**2)/.070)*Math.max(0,up);
      v.setXYZ(i,x*(.095-.021*tip),-.093+up*.032-groove*.015+.007*lobes-.013*tip,-.099+z*.064);
      a.copy(well).lerp(fold,Math.max(0,.17+.45*lobes-.18*groove+.12*x-.13*z));vc.setXYZ(i,a.r,a.g,a.b);
    }
    floor.computeVertexNormals();p.push(floor);
  }
  // Each crown grows from the real, crooked maxillary rim. The old fixed-z
  // row was behind the muzzle, exposing only the dark palate as a single plate.
  const dental=lower?(second?[-.51,.12,.48]:[-.38,.035,.45]):
    (second?[-.57,-.26,.05,.62]:[-.59,-.25,.19,.60]);
  for(const [i,a] of dental.entries()){
    const seam=dentalSeam(a,second),sgn=lower?1:-1,yy=seam-sgn*.010;
    const edge=skullSection(a,seam,second),x=edge.x,z=edge.z;
    const outer=Math.abs(a)>.45,w=outer?.013:.015,l=(outer?.045:i%2?.026:.034)*(lower?.70:1);
    const tooth=cord([[x,yy,z+.004,w*.77],[x+.002*a,yy+sgn*.010,z-.002,w],
      [x+.003*a,yy+sgn*l*.76,z-.003,w*(outer?.56:.78)],
      [x+.007*a,yy+sgn*l,z+.001,w*(outer?.20:.56)]],
      [0xa29b8a,0x938b7c,0xa29b8e,0x908678][i],.58,7);
    const tp=tooth.attributes.position,tn=tooth.attributes.normal,tc=tooth.attributes.color;
    const stain=new THREE.Color(0x766559),glaze=new THREE.Color(0xb2ad98),tint=new THREE.Color();
    for(let k=0;k<tp.count;k++){
      const root=1-sat((tp.getY(k)-yy)*sgn,0,l*.48),plane=Math.max(0,-tn.getZ(k)*.70-tn.getX(k)*.24);
      tint.fromBufferAttribute(tc,k).lerp(stain,.67*root).lerp(glaze,.25*plane*(1-root));
      tc.setXYZ(k,tint.r,tint.g,tint.b);
    }
    p.push(tooth);
  }
  const onSkin=(path:readonly (readonly [number,number,number,number])[],col:number,flat:number)=>{
    const course:Course[]=path.map(([a,h,r,proud])=>{
      const q=skullSection(a,h,second);return [q.x+Math.sin(a)*proud,h,q.z-Math.cos(a)*proud,r];
    });
    p.push(cord(course,col,flat,7));
  };
  if(lower)for(const s of [-1,1]){
    onSkin([[s*.22,-.177,.015,.000],[s*.62,-.160,.019,.006],[s*.98,-.129,.022,.003],
      [s*1.34,-.077,.023,.000],[s*1.65,-.048,.011,.001]],s>0?0xac9c8f:0x887d75,.65);
  }
  if(!lower)for(const s of [-1,1]){
    // The upper lip still carries the shredded buccal muscle. It falls over
    // the outer dental arch all the way to the mandible, not a black grin
    // painted across the solid face. Different missing sections on each jaw.
    const c=new THREE.Color(),shade=new THREE.Color(0x433841),crest=new THREE.Color(0x8f7970);
    p.push(frayedSheet(s,7,4,(u,v,i)=>{
      // A broken medial corner leaves a genuine opening around the incisors;
      // the heavier hanging folds still define the jaw against the sky.
      const a=s*(.51+.88*u),y=.012+.011*Math.sin(u*4+s)-v*(.064+.085*u+
        [0,.006,.035,.015,.042,.004,.022,.011][i]+(second?.013:.028));
      const q=skullSection(a,y,second),fold=.008+.012*Math.sin(8*u-2*v+s)**2+.008*v;
      return [q.x+Math.sin(a)*fold,y,q.z-Math.cos(a)*fold];
    },(u,v)=>c.copy(shade).lerp(crest,.22+.58*(Math.sin(10*u+3*v+s)**2)*(1-.5*v)),
      (i,j)=>!(j===3&&(i===(s<0?1:4)||i===6))));
  }
  if(!lower)for(const s of [-1,1]){
    // Thin, folded pinna instead of an ear-shaped button on the temple.
    p.push(mass([s*.182,.052,.003],[.020,.049,.028],0x88776c,-s*.16),
      cord([[s*.194,.017,-.001,.008],[s*.196,.035,-.020,.008],[s*.199,.070,-.023,.011],
        [s*.198,.095,-.007,.012],[s*.199,.091,.017,.011],[s*.202,.071,.025,.009],
        [s*.201,.041,.023,.007],[s*.197,.022,.007,.005]],0xa39380,.67),
      cord([[s*.199,.030,-.003,.005],[s*.202,.051,.008,.007],[s*.204,.072,-.002,.006]],0xa18c7d,.72));
    const oy=socketY(s,second);
    // Broken brow, zygomatic hook and hooked mandibular ramus. Their
    // unequal arcs turn away around the temple even without a texture.
    onSkin([[s*.13,oy+.017,.006,.001],[s*.31,oy+.038,.011,.004],[s*.55,oy+.044,.014,.003],
      [s*.78,oy+.036,.010,.002],[s*1.01,oy+.012,.007,.003]],s<0?0x988779:0x8e7c72,.52);
    onSkin([[s*.38,oy-.036,.005,.001],[s*.62,oy-.049,.009,.002],[s*.79,oy-.055,.012,.004],
      [s*1.05,oy-.034,.014,.004],[s*1.24,oy-.009,.008,.004]],0x938278,.52);
    // Thin fleshy lower lid and a broken bony bridge down to the tooth bed.
    // The creased far socket stays under the brow rather than a helmet-like band.
    onSkin([[s*.29,oy-.014,.004,.001],[s*.44,oy-.019,.005,.002],[s*.62,oy-.017,.004,.002],
      [s*.72,oy-.006,.002,.001]],0x90746b,.54);
    onSkin([[s*.15,.006,.005,.002],[s*.25,-.007,.008,.003],[s*.30,-.031,.006,.002],[s*.37,-.055,.003,.001]],0x9d8476,.56);
    onSkin([[s*1.42,.052,.018,.001],[s*1.25,-.019,.024,.006],[s*1.14,-.045,.019,.009],
      [s*.88,-.076,.012,.011],[s*.72,-.082,.005,.006]],0x716665,.56);
    // Scattered, matted filament clumps split against the sky (no wig or
    // symmetrical curtain). Anchor every root to the sagittal/parietal bone.
    const count=second?(s>0?9:11):(s>0?14:9);
    for(let i=0;i<count;i++){
      // Forehead is broken by SHORT wet roots; long locks start at the
      // temple, outside the two recessed sockets and their oblique sightlines.
      const turn=s*(.69+2.30*i/count)+.029*Math.sin(i*4.3),tip=(i%4)*.013;
      const h=(second?.265:.286)-.076*Math.abs(Math.sin(1.43*i+s))-(Math.abs(turn)>2?.027:0);
      const across=turn+s*.14,len=(second?.104:.141)*(Math.abs(turn)<1.22?.27:1)+tip;
      // Roped, soaked locks, not thin engraved strokes on a smooth dome.
      // Broken clumps emerge from the crown and hang outside the head.
      const a=skullSection(turn,h+.009,second),b=skullSection(across,h-.052,second);
      p.push(cord([[a.x,h+.018,a.z,.014],
        [a.x+.020*Math.sin(turn),h+.027+tip*.25,a.z-.021*Math.cos(turn),.025],
        [b.x+.026*Math.sin(across),h-.041,b.z-.030*Math.cos(across),.021],
        [b.x+.036*Math.sin(across)+.016*s,h-len,b.z+.024-.019*Math.cos(across),.012],
        [b.x+.046*Math.sin(across),h-len-.035,b.z+.039,.0012]],
        [0x282729,0x393738,0x444440,0x302d2c][i%4],.43,6));
    }
  }
  const g=solid(p);if(lower)g.translate(-JAW_HINGE[0],-JAW_HINGE[1],-JAW_HINGE[2]);return g;
}
/** One repeatable tissue plate for the two skulls and the body. The red
 * field is chipped edges, green is soft pigment, blue is recessed grain.
 * Wrapped lattice noise, not repetitive bright parallel bands. */
let tissuePlate:THREE.DataTexture|undefined;
function commandTissue(){
  if(tissuePlate)return tissuePlate;
  const n=96,texels=new Uint8Array(n*n*4);
  const fract=(x:number)=>x-Math.floor(x);
  const noise=(u:number,v:number,fx:number,fy:number,seed:number)=>{
    const x=u*fx,y=v*fy,ix=Math.floor(x),iy=Math.floor(y);
    const node=(i:number,j:number)=>fract(Math.sin((((i%fx)+fx)%fx)*63.27+(((j%fy)+fy)%fy)*17.19+seed*8.53)*8954.117);
    const fu=fract(x),fv=fract(y),a=fu*fu*(3-2*fu),b=fv*fv*(3-2*fv);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(node(ix,iy),node(ix+1,iy),a),THREE.MathUtils.lerp(node(ix,iy+1),node(ix+1,iy+1),a),b);
  };
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=x/n,v=y/n,curl=noise(u,v,4,3,5),u1=u+.11*curl,v1=v+.085*noise(u,v,3,4,9);
    const m=noise(u1,v1,5,6,11),coarse=noise(u1,v1,9,8,2);
    const fine=noise(u1,v1,23,21,7),grit=noise(u,v,48,48,4);
    const fault=noise(u1,v1,13,7,12)+.21*(fine-.5);
    const lip=(1-sat(Math.abs(fault-.52),.025,.115))*sat(coarse+.21*grit,.27,.75);
    const chip=.66*sat(fine+.30*grit+.34*m,.83,1.13)+.34*lip;
    const grain=sat(.50*coarse+.31*fine+.19*grit,.18,.82);
    const crevice=sat(fault+.29*(grit-.5),.54,.86)*(.46+.54*(1-m));
    const i=(y*n+x)*4;
    texels[i]=Math.round(255*chip);texels[i+1]=Math.round(255*grain);
    texels[i+2]=Math.round(255*crevice);
    // Five stable connected pigment shapes per patch. Anatomical folds turn
    // under moving light separately; there is no quantization of the screen.
    const broad=.62*m+.38*coarse+.14*lip;
    texels[i+3]=broad<.33?18:broad<.47?65:broad<.61?135:broad<.72?189:238;
  }
  const tissue=new THREE.DataTexture(texels,n,n);tissue.wrapS=tissue.wrapT=THREE.RepeatWrapping;
  tissue.magFilter=THREE.LinearFilter;tissue.minFilter=THREE.LinearMipmapLinearFilter;
  tissue.generateMipmaps=true;tissue.needsUpdate=true;tissue.name='command-weathered-tissue';
  return tissuePlate=tissue;
}
/** Only the four small convex irises get any emission. No photographic
 * albedo, skin-wide ambient lift, billboard or extra draw for either face. */
export function commandFaceMaterial(){
  const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:0,transparent:true});
  m.onBeforeCompile=shader=>{
    shader.uniforms.uCommandTissue={value:commandTissue()};
    shader.uniforms.uBonePaint={value:commandBonePaint()};
    const vary='varying float vCommandEmber; varying vec3 vSculptP; varying vec2 vBoneInk;';
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float commandEmber; attribute vec2 commandPigmentCoord; '+vary)
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvCommandEmber=commandEmber; vSculptP=position; vBoneInk=commandPigmentCoord;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uCommandTissue; uniform sampler2D uBonePaint; '+vary)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec2 sc=vec2(vSculptP.x+.47*vSculptP.z,vSculptP.y-.31*vSculptP.z)*5.80;
        vec3 pat=texture2D(uCommandTissue,sc).rgb;
        vec4 boneInk=texture2D(uBonePaint,vBoneInk);
        diffuseColor.rgb=mix(diffuseColor.rgb,boneInk.rgb,boneInk.a*(1.-step(.01,vCommandEmber)));
        diffuseColor.rgb*=mix(vec3(.86,.88,.91),vec3(1.04,1.05,1.07),pat.g)*(.98-.11*pat.b);
        diffuseColor.rgb+=min(diffuseColor.rgb,vec3(.20))*(.26*pat.r);`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=mix(.94,.50,smoothstep(.52,.86,pat.g+.17*pat.r-.29*pat.b)*(.72+.28*boneInk.a));`)
      .replace('#include <normal_fragment_maps>',tissueRelief('.004*(pat.r-.54*pat.b)*smoothstep(.30,.73,pat.g)'))
      .replace('#include <opaque_fragment>',`outgoingLight+=vCommandEmber*vec3(2.38,.014,.029);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey=()=>'command-raincut-skull-v4';
  return m;
}
/** A single filtered plate for the creature, not a light or another pass.
 * Furrows run along the limb axis while larger dark/ash clusters break big
 * smooth volumes. The generated atlas is shared by all four arm chains. */
export function commandHideFinish(material:THREE.MeshStandardMaterial,rake=false){
  const tissue=commandTissue();
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,r)=>{
    previous.call(material,shader,r);shader.uniforms.uCommandTissue={value:tissue};
    shader.fragmentShader='uniform sampler2D uCommandTissue;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 skinChart=vec2(vPaintPosition.x+.62*vPaintPosition.z,vPaintPosition.y+.25*vPaintPosition.z);
      vec4 rind=texture2D(uCommandTissue,skinChart*vec2(4.6,2.6));
      float form=clamp(dot(normalize(vPaintNormal),vec3(-.36,.71,-.51))*.5+.5,0.,1.);
      diffuseColor.rgb*=mix(vec3(.63,.70,.86),vec3(1.04,1.04,1.01),form)*(.72+.38*rind.a+.14*rind.y-.20*rind.z);
      diffuseColor.rgb+=min(diffuseColor.rgb,vec3(.22))*rind.r*(.26+.54*form);`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=mix(.96,.48,smoothstep(.56,.87,rind.y+.24*rind.r-.32*rind.z)*smoothstep(.29,.82,form));`)
      .replace('#include <normal_fragment_maps>',tissueRelief('.007*(rind.r-.65*rind.b)*smoothstep(.32,.73,rind.g)'));
    if(rake){
      // Local constituent ID, load-bearing pad and worn growth face. The
      // shared hide dye otherwise tints the nail and the flesh brown twice.
      shader.vertexShader='attribute vec3 commandRakePigment; varying vec3 vRakeInk;\n'+
        shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRakeInk=commandRakePigment;');
      shader.fragmentShader='varying vec3 vRakeInk;\n'+shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
        float horn=vRakeInk.r, pad=vRakeInk.g, wear=vRakeInk.b;
        float bar=fract((vPaintPosition.z+.32*vPaintPosition.y+.16*vPaintPosition.x)*257.);
        float stria=smoothstep(.12,.27,bar)*(1.-smoothstep(.52,.74,bar));
        vec3 oldIvory=mix(vec3(.138,.100,.067),vec3(.80,.69,.49),.16+.78*wear);
        diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.129,.035,.036),vec3(.358,.105,.064),form),.86*pad);
        diffuseColor.rgb=mix(diffuseColor.rgb,oldIvory*(1.-.16*stria*wear),horn);`)
        .replace('#include <metalnessmap_fragment>',`roughnessFactor=mix(roughnessFactor,.92,horn);
          #include <metalnessmap_fragment>`)
        .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          // Restrained painted sky return on the worn tip ONLY. The black
          // underside, body and coat do not pick up an outline or halo.
          reflectedLight.indirectDiffuse+=horn*oldIvory*(.030+.145*wear)*(1.-.15*stria);
          reflectedLight.indirectDiffuse+=pad*vec3(.021,.0051,.0043);`);
    }
  };
  material.customProgramCacheKey=()=>key+'/command-raincut-hide-v4'+(rake?'/keratin-v1':'');
  return material;
}
// Hand-shaped pigment islands, continuous along a muscle rather than a
// bright wash over every cylinder. Pigment is baked into existing vertices:
// only a few frayed ridges catch muted copper; recesses stay violet-umber.
function stainCommandLimb(g:THREE.BufferGeometry,s:number,seed:number){
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),ink=g.getAttribute('color');
  const c=new THREE.Color(),cold=new THREE.Color(0x37313f),shale=new THREE.Color(0x736b70),earth=new THREE.Color(0x987765);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(s*x,-z);
    const scar=.5+.5*Math.cos(a*3.1+y*8.4+1.62*Math.sin(13*y-seed)+seed);
    const tip=sat(.35*n.getY(i)-.40*n.getZ(i)+.2*s*n.getX(i)+.44*scar,.34,.85);
    c.fromBufferAttribute(ink,i).lerp(cold,.34+.39*(1-scar)).lerp(shale,.31*scar).lerp(earth,.68*tip*scar);
    ink.setXYZ(i,c.r,c.g,c.b);
  }
  return g;
}
// Continuous dorsal palm and thumb saddle; four metacarpals fan from the
// wrist into the uneven tops of the finger joints. The reverse side is a
// broad folded pad instead of four floating tendons behind a round mitten.
function commandPalm(s:number,folded:boolean){
  // y, half breadth, thickness, knuckle fan
  const rows=[[.022,.031,.022,0],[.004,.039,.024,.03],[-.024,.052,.030,.22],[-.051,.065,.038,.48],
    [-.076,.070,.037,.73],[-.092,.066,.032,.93],[-.108,.051,.024,1]];
  const pos:number[]=[],col:number[]=[],ix:number[]=[],N=20,c=new THREE.Color();
  const dark=new THREE.Color(0x493e48),surface=new THREE.Color(0x776a68),lit=new THREE.Color(0xab9880);
  for(let j=0;j<rows.length;j++)for(let i=0;i<N;i++){
    const [y,r,d,fan]=rows[j],a=i/N*2*Math.PI,sn=Math.sin(a),cs=Math.cos(a);
    const across=sn*(.80+.20*Math.abs(sn)),x=across*r,front=Math.max(0,cs),
      ridge=Math.pow(.5+.5*Math.cos((across*1.65+.05+fan*.12)*Math.PI*2),4);
    const centerZ=folded?-.020-fan*.022:-.008-fan*.009,
      crease=cs<0?(.004*Math.cos(across*3.2+fan*3.9)+(folded?.030:0)*(-cs))*Math.sin(fan*Math.PI):0;
    pos.push(x+(folded?-.008*fan:s*.003*fan),y+fan*.010*across*s,centerZ-
      cs*d-Math.pow(front,2)*(.004+.010*fan)*ridge+crease);
    c.copy(dark).lerp(surface,.19+.44*Math.max(0,-cs)+.39*front+.15*ridge)
      .lerp(lit,Math.min(.90,(.12+.75*fan)*ridge*front+.19*fan*Math.max(0,s*sn)));
    col.push(c.r,c.g,c.b);
    if(j){const b=(j-1)*N+i,n=(j-1)*N+(i+1)%N;ix.push(b,n,b+N,n,n+N,b+N);}
  }
  const end=(rows.length-1)*N;
  for(let i=1;i<N-1;i++)ix.push(0,i+1,i,end,end+i,end+i+1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
// Broad translucent-looking keratin, painted but NON-emissive. Three dorsal
// planes across each small nail catch the moving practical at different
// angles. All pieces are merged into the current animated wrist draw.
function clawPlate(root:V,crown:V,tip:V,width:number,aged:boolean){
  const [x,y,z]=root,[m,n,k]=crown,[u,v,w]=tip;
  const p=[x-width*.58,y,z,x+width*.58,y,z,x,y-.001,z-.003,
    m-width,n,k,m+width,n,k,m,n-.001,k-.006,u,v,w,u,v+.002,w+.0027];
  const c:number[]=[],t=new THREE.Color();
  for(const h of [0x514749,0x7c6d64,0x9d8a71,0x756559,0x99816a,aged?0xae9781:0x9e907f,0x897760,0x53494c]){
    t.setHex(h);c.push(t.r,t.g,t.b);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  g.setIndex([0,2,3,2,5,3,2,1,5,1,4,5,3,5,6,5,4,6,0,3,7,3,6,7,1,7,4,4,7,6,0,7,1,0,1,2]);
  g.userData.hornPlate=true;
  g.computeVertexNormals();return g;
}
export function commandArm(side:number,rear:boolean,stage:'upper'|'fore'|'hand'){
  const s=side,p:THREE.BufferGeometry[]=[];
  const dark=rear?0x526562:0x765362,mid=rear?0x798880:flesh;
  if(stage==='upper'){
    p.push(cord([[0,.045,.006,.060],[s*.029,-.032,0,.112],[s*.038,-.143,.011,.095],
      [s*.021,-.252,-.001,.069],[0,-.321,0,.058]],dark,.89));
    p.push(cord([[s*.027,.047,.031,.060],[s*.066,-.041,.021,.095],[s*.085,-.113,-.001,.065],
      [s*.039,-.199,-.010,.022]],rear?hide:0x896d6c,.73));
    p.push(cord([[s*.011,-.050,-.068,.039],[s*.016,-.151,-.072,.059],[0,-.244,-.047,.035],
      [-s*.023,-.313,-.029,.016]],mid,.66));
    for(let j=0;j<4;j++){
      const x=s*(.018+.019*j);
      p.push(cord([[x*.65,.017,-.064+j*.006,.012],[x*1.19,-.053,-.084+j*.003,.018],
        [x*1.22,-.141,-.075+j*.004,.014],[x*.72,-.232,-.048+j*.003,.007]],
        [0x96857a,0x726365,0x8e7871,0x756c68][j],.55));
    }
  }else if(stage==='fore'){
    p.push(cord([[0,.025,.002,.045],[s*.018,-.053,.012,.083],[s*.038,-.115,.002,.092],
      [s*.023,-.216,-.019,.068],[0,-.342,-.034,.040],[0,-.37,-.041,.044]],dark,.85));
    for(let j=0;j<3;j++){
      const x=s*(j-1)*.030;
      p.push(cord([[x,-.025,-.045,.020],[x+s*.027,-.108,-.069,.028],
        [x*.8+s*.018,-.213,-.065,.020],[x*.59,-.345,-.064,.008]],j===1?light:mid,.71));
    }
    p.push(cord([[s*.045,-.199,.025,.024],[s*.088,-.141,.047,.034],[s*.108,-.069,.055,.021],
      [s*(rear?.126:.136),-.034,.051,.006]],0x695f62,.54));
    if(!rear){
      // A diagonal torn sleeve over the leading forearm hides the segment
      // line while two stringers hang behind it. Silhouette, not mottling.
      const c=new THREE.Color(),dye=new THREE.Color(0x473e49),lip=new THREE.Color(0x967f74);
      p.push(frayedSheet(s,8,5,(u,v,i)=>{
        const a=-1.03+2.55*u+.34*v,y=-.029-.045*u-v*(.113+[.028,.097,.047,.016,.078,.028,.112,.086,.025][i]);
        const r=.081-.020*v+.009*Math.sin(11*u+2*v)**2;
        return [s*(.018+.022*Math.sin(-y*10)+Math.sin(a)*r),y,-.012-Math.cos(a)*r-.008*v];
      },(u,v)=>c.copy(dye).lerp(lip,.11+.68*(Math.sin(15*u+2*v+s)**6)*(1-.48*v)),
        (i,j)=>!(j>2&&i===(s<0?2:5)||j===4&&(i===0||i===7))));
    }
  }else{
    if(!rear&&s<0){
      // Loaded hanging fist. A broad metacarpal plane feeds separate
      // knuckles; the fingers fold UNDER the heel of the hand, not into
      // four sticks. The ring and little finger still hang partly open.
      p.push(commandPalm(s,true));
      for(let i=0;i<4;i++){
        const x=(i-1.5)*.032,drop=[.040,.059,.089,.125][i],y=-.111-drop;
        p.push(cord([[x*.72,-.025,-.049,.008],[x,-.080,-.061,.015],[x*1.11,-.107,-.066,.022],
          [x*1.17,y+.018,-.064,.018],[x*1.18,y-.002,-.066,.026],[x*1.11,y-.016,-.045,.021],
          [x*1.08,y-.015,-.032,.016],[x*.91,y+.015,-.011,.012]],
          [0x857c77,0x7a6e69,0x6e6463,0x68605f][i],.86,8));
        p.push(clawPlate([x*1.15,y-.019,-.052],[x*1.10,y-.023,-.033],
          [x*.94,y-.001,-.014],.011,i===1));
      }
      p.push(cord([[.047,-.043,-.016,.031],[.073,-.082,-.046,.031],
        [.058,-.112,-.076,.024],[.021,-.128,-.082,.014]],0x776d67,.81));
      return solid(p);
    }
    p.push(commandPalm(s,false));
    for(let i=0;i<4;i++){
      const x=s*(i-1.5)*.026,len=[.165,.207,.187,.122][i],curl=[.10,.046,.076,.120][i];
      const knuckle=-.083-len*.78;
      p.push(cord([[x*.57,-.045,-.036,.008],[x,-.087,-.042,.022],[x*1.19,-.113,-.036,.014],
        [x*1.36,-.110-len*.22,-.032,.017],[x*1.61,knuckle+.021,-.037-.21*curl,.012],
        [x*1.72,knuckle,-.044-.28*curl,.017],[x*1.78,knuckle-.016,-.061-.58*curl,.011],
        [x*1.76,knuckle-.022,-.078-.78*curl,.011],[x*1.54,knuckle+.006+curl*.40,-.095-curl,.002]],i%2?mid:dark,.82,7));
      p.push(clawPlate([x*1.76,knuckle-.024,-.057-.59*curl],[x*1.75,knuckle-.028,-.080-.78*curl],
        [x*1.54,knuckle+.006+curl*.40,-.096-curl],rear?.009:.012,i===2));
    }
    p.push(cord([[-s*.047,-.018,-.006,.026],[-s*.084,-.051,-.033,.026],[-s*.089,-.084,-.075,.018],
      [-s*.075,-.093,-.106,.002]],horn));
  }
  if(stage==='hand'&&!rear&&s>0)for(const piece of p){
    const pt=piece.attributes.position,nt=piece.attributes.normal,marks=new Float32Array(pt.count*3);
    for(let i=0;i<pt.count;i++){
      const x=pt.getX(i),y=pt.getY(i),z=pt.getZ(i),rise=sat(-z,.082,.171),atTip=sat(-y,.110,.159);
      const facing=sat(-.54*nt.getZ(i)+.59*nt.getX(i)-.10*nt.getY(i),-.55,.74);
      const horn=piece.userData.hornPlate?.94+.06*rise:atTip*sat(-z,.094,.147)*(.46+.53*rise);
      // One burgundy dorsal saddle instead of a uniform purple hand.
      const pad=Math.max(Math.exp(-(((y+.081)/.049)**2)-(((x+.026)/.043)**2)),
        .53*Math.exp(-(((y+.169)/.040)**2)))*(1-horn)*(.31+.69*facing);
      marks.set([horn,pad,Math.min(.99,.18+.53*rise+.38*facing)],i*3);
    }
    piece.setAttribute('commandRakePigment',new THREE.BufferAttribute(marks,3));
  }
  const g=solid(p);
  if(stage==='hand'&&!rear&&s>0){
    // One real pose target on the already merged striking hand. The root of
    // every knuckle stays seated; the long fingers abduct and begin to
    // uncurl before contact, rather than turning the whole hand as a card.
    const base=g.attributes.position,n=g.attributes.normal,c=g.attributes.color;
    const spread=base.clone(),shade=new THREE.Color(0x535767),edge=new THREE.Color(0xac9278),tint=new THREE.Color();
    for(let i=0;i<base.count;i++){
      const x=base.getX(i),y=base.getY(i),z=base.getZ(i);
      const load=sat(-y,.077,.204),hook=sat(-z,.050,.169),splay=Math.tanh(x*17);
      spread.setXYZ(i,x+load*(.057*splay+.010*hook),y-load*(.012+.052*hook),z+load*(.016+.031*hook-.014*splay));
      if(y>-.079)continue;
      const knuckle=Math.exp(-(((y+.171)/.043)**2))+.65*Math.exp(-(((y+.218)/.022)**2));
      const ridge=sat(.63*n.getX(i)-.68*n.getZ(i)+.13*n.getY(i),.20,.84);
      tint.fromBufferAttribute(c,i).lerp(shade,.43*(1-ridge))
        .lerp(edge,Math.min(.74,ridge*(.24+.51*knuckle)));
      c.setXYZ(i,tint.r,tint.g,tint.b);
    }
    const open=g.clone();open.setAttribute('position',spread);open.computeVertexNormals();
    g.morphAttributes.position=[spread];g.morphAttributes.normal=[open.attributes.normal];
    open.dispose();g.computeBoundingBox();g.computeBoundingSphere();
  }
  if(stage!=='hand'){
    stainCommandLimb(g,s,stage==='upper'?1.2:3.5);
    g.scale(stage==='upper'?.65:.63,1,stage==='upper'?.73:.75);
  }
  return g;
}
