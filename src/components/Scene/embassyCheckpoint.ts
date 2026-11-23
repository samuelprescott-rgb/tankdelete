import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {ARENA_HALF_DEPTH} from '../../lib/arenaBounds';
import { CHECKPOINT_LAMPS, checkpointBulb } from './checkpointLamps';

// An abandoned outer checkpoint frames the existing playable approach. Only
// wires cross the road, high above the tank; bases sit outside the traffic lane.
// Pigment and bulbs are baked into two static batches, no point lights or loops.
export function createEmbassyCheckpoint(){
  const body:THREE.BufferGeometry[]=[], lamps:THREE.BufferGeometry[]=[];
  function pigment(g:THREE.BufferGeometry,ink:string,list=body){
    const n=g.getAttribute('normal'),p=g.getAttribute('position'),col=new THREE.Color(ink),rgb=[];
    for(let i=0;i<p.count;i++){
      const v=.86+.12*n.getY(i)+.025*Math.sin(5*p.getX(i)+1.7*p.getY(i));
      rgb.push(col.r*v,col.g*v,col.b*v);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));list.push(g);
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,c:string,angle=0)=>
    pigment(new THREE.BoxGeometry(w,h,d).rotateZ(angle).translate(x,y,z),c);
  const beam=(a:THREE.Vector3,b:THREE.Vector3,r:number,s:string,list=body)=>{
    const vec=b.clone().sub(a),g=new THREE.CylinderGeometry(r*.92,r,vec.length(),7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),vec.normalize()));
    const mid=a.clone().lerp(b,.5);pigment(g.translate(mid.x,mid.y,mid.z),s,list);
  };
  const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
  const [a,b]=CHECKPOINT_LAMPS.map(({pole})=>new THREE.Vector3(...pole));
  for(const [i,p] of [a,b].entries()){
    const lamp=CHECKPOINT_LAMPS[i],side=lamp.side;
    beam(V(p.x-side*.2,-.08,p.z),p,.14,'#62503e');
    box(p.x,p.y-.28,p.z,1.72,.12,.14,'#716344',-.05*side);
    box(p.x+.48*side,p.y-.82,p.z,.78,.13,.50,'#544c37');
    box(p.x+.48*side,p.y-.92,p.z,.56,.16,.26,'#383b35');
    pigment(new THREE.BoxGeometry(.45,.10,.2).translate(...checkpointBulb(lamp)),'#ffdfa4',lamps);
    for(const dx of [-.68,0,.68]){
      beam(V(p.x+dx,p.y-.23,p.z),V(p.x+dx,p.y+.02,p.z),.075,'#8b9483');
    }
    // Small weathered concrete foot and two short, broken wings.
    box(p.x,.27,p.z,.74,.57,.72,'#756f5c');
    for(let j=1;j<3;j++)box(p.x+side*(.95+j*.91),.25+j*.05,p.z+.45*j,1.3,.6,.32,j===1?'#736a55':'#625d4e',side*.055*j);
  }
  for(const dx of [-.68,.68]){
    let prev=V(a.x+dx,a.y,a.z);
    for(let j=1;j<=10;j++){
      const t=j/10,next=a.clone().lerp(b,t);
      next.x+=dx;next.y-=(.65+.15*dx)*4*t*(1-t);
      beam(prev,next,.022,'#443c32');prev=next;
    }
  }
  // Street-left: the cinema's surviving ticket wicket. The guard approaches
  // from the west, so he sees its rounded corner, dark ticket recess and
  // plaster return rather than the narrow END of a large orange overhead slab.
  // All solid work is seated on the existing impassable mound at (15,5).
  const tube=(x:number,y:number,z:number,w:number,h:number,d:number,ink:string,angle=0)=>
    pigment(new THREE.BoxGeometry(w,h,d).rotateZ(angle).translate(x,y,z),ink,lamps);
  // Set the round end into the southern shoulder rather than across the
  // gap between the two eastern field lanes. Both pursuers can pass in view.
  const kioskX=16.2,kioskZ=3.38;
  function drum(y:number,height:number,radius:number,depth:number,ink:string){
    const g=new THREE.CylinderGeometry(radius,radius,height,12).scale(1,1,depth);
    pigment(g.translate(kioskX,y,kioskZ),ink);
  }
  drum(.46,1.12,1.35,1.23,'#adab93'); // Through the soil at the base.
  drum(1.025,.13,1.42,1.23,'#baac88');
  drum(1.59,1.02,1.18,1.22,'#364747');
  for(const angle of [-2.84,-1.70,-.56,.58,1.72,2.86]) {
    const x=kioskX+1.18*Math.cos(angle), z=kioskZ+1.43*Math.sin(angle);
    beam(V(x,1.04,z),V(x,2.12,z),.065,'#a9a58c');
  }
  drum(2.15,.20,1.34,1.22,'#85765f');
  drum(2.31,.18,1.57,1.17,'#9c8974');
  drum(2.44,.09,1.51,1.17,'#b6ae91');
  box(kioskX+.49,1.42,kioskZ+.72,1.05,2.72,1.49,'#a1a38d');
  // A stepped folded fin keeps the old cinema profile at building scale;
  // the roof moulding and cornice land flush on the wall below them.
  for(const [i,h] of [3.09,3.52,3.29].entries()){
    box(kioskX+.41+i*.235,(h+2.41)/2,kioskZ+.79,.24,h-2.41,.65,'#a78e72');
  }
  // The limewashed return sits right down on the paddy-side earth. Its
  // quieter, uninterrupted lower value sits BEHIND a runner, not on him.
  box(15.21,.54,2.76,3.48,1.22,.37,'#aaa991');
  box(15.21,1.16,2.76,3.53,.085,.43,'#bab18f');
  box(16.78,.44,3.27,.34,1.00,1.36,'#91917c');
  box(kioskX-1.04,2.07,kioskZ-.83,.36,.115,.24,'#5e6052');
  tube(kioskX-1.05,2.00,kioskZ-.87,.18,.075,.13,'#c3ab83');
  // Street-right: a lower military aid bivouac. Narrow feet and equipment
  // stay within the blocked (-16,15) earthwork; pitched eaves remain open.
  const tentX=-15.8,tentZ=15.1,ridge=4.32,eave=2.78;
  for(const side of [-1,1]){
    for(const z of [tentZ-1.35,tentZ+1.35])
      beam(V(tentX+side*2.1,.08,z),V(tentX+side*2.1,eave+.20,z),.085,'#a39373');
    const pitchRun=2.8,drop=ridge-eave;
    const angle=-side*Math.atan2(drop,pitchRun);
    // Broad alternating cloth panels produce painted fold planes, not a flat
    // solid box. Warm canvas binding separates its silhouette from the palms.
    for(let panel=0;panel<4;panel++){
      const z=tentZ-1.62+panel*1.08;
      box(tentX+side*1.4,(ridge+eave)*.5,z,Math.hypot(pitchRun,drop),.085,1.10,
        ['#a19166','#b1a379','#ac9b72','#92855e'][panel],angle);
    }
    box(tentX+side*1.4,(ridge+eave)*.5-.035,tentZ-2.19,Math.hypot(pitchRun,drop),.15,.11,'#c9b08a',angle);
    box(tentX+side*2.78,eave-.15,tentZ,.10,.34,4.36,'#8e7351');
  }
  beam(V(tentX,ridge+.05,tentZ-2.3),V(tentX,ridge+.05,tentZ+2.3),.09,'#6d5b41');
  beam(V(tentX,ridge-.04,tentZ-1.50),V(tentX,3.32,tentZ-1.50),.035,'#575644');
  box(tentX,3.26,tentZ-1.50,.56,.12,.42,'#586260');
  tube(tentX,3.12,tentZ-1.50,.36,.18,.22,'#a8bcaa');
  for(let i=0;i<4;i++) {
    const bag=new THREE.SphereGeometry(1,8,5).scale(.60,.24,.35).rotateY(i*.23);
    pigment(bag.translate(tentX-1.29+i*.76,.59+((i%2)*.07),tentZ-.85),'#88836a');
  }
  // Beyond the playable boundary: an interrupted strip of original shophouse
  // and office silhouettes. Real openings, recessed windows and parapets
  // survive the night grade; no collision impostors or lights in the lanes.
  const skyline=[
    [-27,7.2,3,0],[-20,5.6,4,2],[-14.1,5.2,3,0],
    [5,8,3,3],[14,6,4,0],[21,5.6,3,3],
  ];
  for(const [i,[x,w,floors,back]] of skyline.entries()){
    const z=ARENA_HALF_DEPTH+3.8+back, floorHeight=2.75,top=floors*floorHeight,depth=4.5;
    const stucco=i%2?'#897e68':'#657470';
    box(x,top*.5,z+depth*.5,w-.25,top,depth,'#485653');
    for(let floor=0;floor<floors;floor++){
      const y=floor*floorHeight;
      box(x,y+.35,z-.17,w,.72,.55,stucco);
      box(x,y+floorHeight-.15,z-.21,w+.2,.24,.92,'#9c947d');
      for(let bay=0;bay<4;bay++){
        const xx=x-w*.5+.15+(w-.30)*bay/3;
        box(xx,y+1.55,z-.16,.24,2.08,.64,stucco);
        if(bay<3 && (i+floor+bay*3)%11===2)
          pigment(new THREE.BoxGeometry(.62,1.15,.08).translate(xx+w/6,y+1.67,z-.05),'#a88b64',lamps);
      }
    }
    box(x,top+.28,z+1.38,w+.22,.55,3.34,stucco);
    if(i===3){
      // Stepped clock/exhaust tower: open belfry above its offset shoulder.
      // Negative sky between the piers is visible even at full distance fog.
      box(x-1.23,top+1.35,z+1.9,5.25,2.7,3.6,'#797765');
      box(x-1.64,top+3.16,z+1.6,3.56,.99,2.80,'#979583');
      const crownX=x-1.76;
      for(const dx of [-1.34,1.34]){
        box(crownX+dx,top+5.25,z+1.30,.42,3.33,1.83,'#a3997b');
        box(crownX+dx,top+6.72,z+1.18,.63,.28,2.14,'#999280');
      }
      box(crownX,top+7.03,z+1.28,3.47,.50,2.22,'#ae9d7a');
      box(crownX-.28,top+7.50,z+1.38,2.39,.42,1.73,'#807b6b');
      box(crownX-.55,top+7.86,z+1.44,1.48,.36,1.19,'#807b6b');
      tube(x-.39,top+1.57,z+.055,.95,.87,.11,'#ad9874');
      tube(x-1.69,top+1.57,z+.055,.48,.87,.11,'#937350');
    }else if(i===1){
      box(x-w*.18,top+1.1,z+1.6,w*.45,1.2,1.8,'#606962');
      beam(V(x+w*.18,top+.5,z+1.35),V(x+w*.18,top+3.5,z+1.35),.06,'#585b54');
    }
  }
  const merge=(list:THREE.BufferGeometry[])=>{const g=mergeGeometries(list,false)!;list.forEach(x=>x.dispose());g.computeBoundingSphere();return g;};
  return {checkpoint:merge(body),practicals:merge(lamps)};
}
