import * as THREE from 'three';
import {buildStreetlampMetal} from './embassyStreetlamp';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Directly beneath the chancery's torn eastern bays. The leaning concrete
// fins and scorched remains identify what is actually smoking from the gate.
export const COMPOUND_BURN_PILE:[number,number,number]=[3.82,0,-22.82];

// Original painted concrete, old brick cores and monsoon drainage. Baked
// once, two static draws. The holes below are the same playable breaches;
// there are no new colliders, transparent decals or per-frame updates.
export function createEmbassyGroundworks() {
  const wall:THREE.BufferGeometry[]=[], pavement:THREE.BufferGeometry[]=[];
  const shade=new THREE.Color(), tint=new THREE.Color(), wet=new THREE.Color('#958f7c');
  const deposit=(pieces:THREE.BufferGeometry[],g:THREE.BufferGeometry,color:string)=>{
    const mesh=g.index?g.toNonIndexed():g;
    if(mesh!==g)g.dispose();
    const p=mesh.getAttribute('position'),n=mesh.getAttribute('normal'),rgb=new Float32Array(p.count*3);
    tint.set(color);
    for(let i=0;i<p.count;i++){
      const crown=Math.max(0,n.getY(i));
      const grit=.92+.08*Math.sin(p.getX(i)*.43+p.getZ(i)*.68+p.getY(i)*.72);
      shade.copy(tint).lerp(wet,.18*crown).multiplyScalar(grit*(.82+crown*.18)).toArray(rgb,i*3);
    }
    mesh.setAttribute('color',new THREE.BufferAttribute(rgb,3));pieces.push(mesh);
  };
  const box=(pieces:THREE.BufferGeometry[],x:number,y:number,z:number,w:number,h:number,d:number,color:string,angle=0)=>{
    deposit(pieces,new THREE.BoxGeometry(w,h,d).rotateY(angle).translate(x,y,z),color);
  };
  function panel(x:number,z:number,width:number,h:number,angle:number,i:number){
    const local=(s:number,t:number)=>[x+Math.cos(angle)*s+Math.sin(angle)*t,z-Math.sin(angle)*s+Math.cos(angle)*t];
    const detail=(s:number,y:number,t:number,w:number,height:number,d:number,ink:string)=>{
      const [xx,zz]=local(s,t);box(wall,xx,y,zz,w,height,d,ink,angle);
    };
    const half=width/2, chip=.13+(i%3)*.08;
    const outline=new THREE.Shape();
    outline.moveTo(-half,0);outline.lineTo(half,0);outline.lineTo(half,h*.74);
    outline.lineTo(half-chip,h*.89);outline.lineTo(half-chip-.09,h);
    outline.lineTo(-half+.12,h-.04*(i%3));outline.lineTo(-half,h-.09);outline.closePath();
    const skin=new THREE.ExtrudeGeometry(outline,{depth:.27,bevelEnabled:false,steps:1});
    skin.translate(0,0,-.135).rotateY(angle).translate(x,.035,z);
    deposit(wall,skin,['#867f6c','#959381','#8d8c7c'][i%3]);
    detail(0,.09,0,width+.06,.14,.35,'#615c50');
    detail(-chip*.5,h+.037,0,width-chip-.12,.075,.32,'#b4ac8f');
    // A handful of missing plaster islands reveal distinct, staggered courses.
    if(i%3!==1)for(let course=0;course<3;course++)for(let j=0;j<(course===2?1:2);j++){
      const s=half-.31-j*.26-(course%2)*.10;
      for(const side of [-1,1])detail(s,.24+course*.115,side*.141,.232,.087,.018,
        ['#9f785e','#835f4d','#ab8066'][(i+j+course)%3]);
    }
  }
  for(const side of [-1,1]){
    for(let i=0;i<9;i++)if(i!==3&&i!==7 && !(side===1&&i>=4))
      panel(side*14,-28+i*1.6,1.5,.6+(i%3)*.23,Math.PI*.5,i);
    // The garrison actually occupies the recesses on the two inner returns.
    // Don't bury their sacks and knees inside an uninterrupted waist wall.
    // Service breaches at each forward annex also connect its front door
    // to the public ground; the curb ends before the melee/contact point.
    panel(side*7.63,-13.72,1.20,.55,0,3);
    panel(side*10.19,-13.78,1.20,.67,side*.095,5);
    panel(side*13.45,-13.98,.90,.42,side*.38,6);
    for(const [w,h,y,ink] of [[.68,.21,.105,'#666355'],[.52,1.68,1.01,'#908e7d'],
      [.64,.10,1.83,'#747165'],[.73,.12,1.94,'#b0a68e']] as const)
      box(wall,side*7.08,y,-13.79,w,h,w,ink);
  }
  // A toppled pair of east fence sections makes room for the final contact's
  // shoulders. Rubble stays at the two lips, never a waist-high panel that
  // its feet would appear to tunnel through.
  for(const [z,angle] of [[-19.45,-.42],[-14.45,.61]]){
    box(wall,14.15,.13,z,1.17,.19,.56,'#858477',angle);
    box(wall,13.72,.22,z+.12,.53,.23,.27,'#a09381',-angle);
    box(wall,14.62,.13,z-.16,.37,.17,.30,'#806351',angle*.55);
  }
  const [bx,,bz]=COMPOUND_BURN_PILE;
  for(let i=0;i<6;i++)box(wall,bx+Math.sin(i*2.1)*.58,.13+(i%3)*.11,bz+Math.cos(i*2.5)*.40,
    1.26+.1*(i%3),.16,.19,['#363332','#4e4137','#40382e'][i%3],i*1.57+.36);
  deposit(wall,new THREE.BoxGeometry(.22,1.21,.22).rotateZ(-.38).translate(bx+.62,.56,bz-.21),'#4b4037');
  deposit(wall,new THREE.BoxGeometry(1.03,.075,.62).rotateZ(.28).rotateY(.41).translate(bx-.47,.32,bz+.28),'#625b50');

  // The broken eastern bay sheds THIS building's precast screen and slab
  // tongues, not generic rocks. The collapse fan thins before the intact
  // drive/across the central threshold. All pieces share the wall batch.
  const fallen=(points:number[],pigment:string)=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(points.length/3*2),2));g.computeVertexNormals();
    deposit(wall,g,pigment);
  };
  type XYZ=readonly [number,number,number];
  const quad=(arr:number[],a:XYZ,b:XYZ,c:XYZ,d:XYZ)=>arr.push(...a,...b,...c,...a,...c,...d);
  // Spalled slab fragments with chipped corners, sloped top and dark raw
  // edges. The fan is longest in the original outward fall direction;
  // leave intervals of visible old paving instead of a gravel blanket.
  const slabs=[ // x,z, width,depth,height,yaw
    [2.82,-23.15,.86,.49,.26,-.45],[4.78,-23.48,1.18,.64,.32,.19],[3.23,-21.97,.74,.43,.18,-.73],
    [5.31,-22.48,.83,.46,.17,.42],[4.71,-21.23,1.06,.45,.15,.65],[2.65,-21.37,.45,.29,.10,-.21],
    [5.72,-20.62,.65,.44,.14,-.17],[3.68,-20.37,.51,.23,.09,-.95],[6.4,-20.28,.49,.26,.083,.84],
    [5.56,-19.36,.37,.19,.071,.24],[4.19,-19.53,.28,.17,.065,-.53],[6.98,-19.49,.33,.18,.08,-.27],
    [4.43,-22.12,.46,.33,.19,-.40],[6.48,-18.82,.25,.17,.057,.73],[3.29,-20.82,.23,.14,.076,.14],
  ];
  for(let i=0;i<slabs.length;i++){
    const [x,z,w,d,h,r]=slabs[i],c=Math.cos(r),s=Math.sin(r);
    const footprint=[[-.50,-.28],[-.22,-.50],[.39,-.47],[.50,.14],[.17,.47],[-.42,.37]];
    const row=(upper:boolean):XYZ[]=>footprint.map(([u,v],k)=>[x+u*w*c-v*d*s,
      upper?.038+h*(.64+.30*(u+.5)+.10*Math.cos(k*2+i)):.037,z+u*w*s+v*d*c]);
    const hi=row(true),lo=row(false),top:number[]=[],sides:number[]=[];
    for(let j=1;j<hi.length-1;j++)top.push(...hi[0],...hi[j+1],...hi[j]);
    for(let j=0;j<hi.length;j++){const n=(j+1)%hi.length;quad(sides,hi[j],hi[n],lo[n],lo[j]);}
    fallen(top,['#a6a9a5','#a8adbb','#8c95a1','#b2ad9f'][i%4]);
    fallen(sides,i%3?'#766758':'#64646a');
  }
  // Three recognizably angled holes echo the intact upper terrazzo screen.
  // It lies half-buried against the pile, with a chunk missing at one end.
  const concrete:number[]=[],cut:number[]=[],local=(x:number,y:number,z:number):XYZ=>[
    4.74+x*.81-z*.59,.059+y+(.78-x)*.12,-22.48+x*.59+z*.81];
  for(let i=0;i<3;i++){
    const x=(i-1)*.48,u=.24,v=.24;
    const out=[[-u,-v],[u,-v],[u,i===2?.11:v],[-u,v]], hole=[[-.08,-.15],[.15,-.09],[.09,.15],[-.15,.09]];
    for(let j=0;j<4;j++){
      const n=(j+1)%4;const o=(k:number)=>local(x+out[k][0],.18,out[k][1]);
      const a=(k:number,h:number)=>local(x+hole[k][0],h,hole[k][1]);
      quad(concrete,o(j),a(j,.18),a(n,.18),o(n));quad(cut,a(j,.18),a(j,0),a(n,0),a(n,.18));
      if(j===0||j===2||(i===0&&j===3)||(i===2&&j===1)){
        quad(cut,o(j),o(n),local(x+out[n][0],0,out[n][1]),local(x+out[j][0],0,out[j][1]));
      }
    }
  }
  fallen(concrete,'#babcc1');fallen(cut,'#727781');
  // Broad value islands, shallow slab joints and a retaining lip give the
  // old floating grey rectangle a visible surface and thickness at tank scale.
  box(pavement,0,-.039,-21.5,29,.106,17,'#4b5260');
  const nx=9,nz=6,sw=29/nx,sd=17/nz;
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x=-14.5+(i+.5)*sw,z=-30+(j+.5)*sd;
    const aged=(Math.sin(.77*i+1.14*j)*.5+.5)*3.95|0;
    box(pavement,x,.021,z,sw-.035,.024,sd-.037,['#737e8c','#788593','#818a97','#74808c'][aged]);
  }
  for(const side of [-1,1]){
    // A trench and inset bars cross only the two sheltered stretches, never
    // a painted black line all the way across the drivable opening.
    for(let j=0;j<3;j++){
      const x=side*(5.6+j*2.55),z=-13.43;
      box(pavement,x,.042,z,2.2,.017,.24,'#454841');
      for(let k=0;k<11;k++)box(pavement,x-.98+k*.196,.058,z,.053,.016,.19,'#858375');
    }
  }
  buildStreetlampMetal((g,color)=>deposit(wall,g,color));
  const bake=(pieces:THREE.BufferGeometry[])=>{
    const g=mergeGeometries(pieces,false)!;
    pieces.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();return g;
  };
  return {walls:bake(wall),court:bake(pavement)};
}
