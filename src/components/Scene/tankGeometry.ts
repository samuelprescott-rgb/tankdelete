import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// M48-pattern running gear: six road-wheel pairs plus distinct end wheels.
// These centres are in the existing hull frame, before its 1.35 Z stretch.
export const TANK_ROAD_WHEEL_CENTERS = [-0.60, -0.36, -0.12, 0.12, 0.36, 0.60] as const;
export const TANK_ROAD_WHEEL_RADIUS = 0.15;
export const TANK_END_WHEEL_RADIUS = 0.176;
// Render geometry only: the soil plane is at -.070 in the hull's frame.
// The shoe crown (+.025) just touches it while its steel link remains visible.
export const TANK_TRACK_AXLE_Y = .152;
export const TANK_TRACK_RADIUS = .197;
const TANK_TRACK_BORE = .175;
export const TANK_ROAD_WHEEL_Y = TANK_TRACK_AXLE_Y - TANK_TRACK_BORE + TANK_ROAD_WHEEL_RADIUS;

// Major color shapes remain readable under the rain/night lighting, before
// small brush marks or directional light are applied.
function paintArmorPlanes(geometry: THREE.BufferGeometry, casting: 'hull' | 'deck' | 'turret') {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.count * 3);
  const shadow = new THREE.Color(casting === 'hull' ? '#353b32' : '#373e32');
  const olive = new THREE.Color(casting === 'turret' ? '#91865e' : casting === 'deck' ? '#8a825a' : '#75734f');
  const foldedEdge = new THREE.Color(casting === 'turret' ? '#cbbb8b' : '#b5aa7c');
  const wetSill = new THREE.Color('#48544a');
  const ochre = new THREE.Color('#82745a');
  const dirt = new THREE.Color('#a18760');
  const pigment = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const nx = normals.getX(i), up = normals.getY(i), nz = normals.getZ(i);
    const top = THREE.MathUtils.smoothstep(up, -.64, .84);
    const broad = THREE.MathUtils.smoothstep(y, casting === 'deck' ? -.085 : -.12, casting === 'turret' ? .27 : .20);
    const bakedLight = THREE.MathUtils.clamp(.32 + .43 * top + .35 * broad - nx * .041 - nz * .052, 0, 1);
    pigment.copy(shadow).lerp(olive, bakedLight);
    if (casting === 'turret') {
      const shoulder = 1 - THREE.MathUtils.smoothstep(Math.abs(y - .17), .018, .11);
      const behind = THREE.MathUtils.smoothstep(z, .14, .61);
      pigment.lerp(foldedEdge, shoulder * (.14 + .19 * top) * (1 - behind * .26));
      pigment.lerp(wetSill, (1 - THREE.MathUtils.smoothstep(y, -.13, -.01)) * .36);
      const scuffedSide = THREE.MathUtils.smoothstep(Math.abs(x), .31, .58) *
        (1 - THREE.MathUtils.smoothstep(Math.hypot(z - .15, (y - .09) * 2.3), .06, .32));
      pigment.lerp(ochre, scuffedSide * .12);
      // A thin amount of dust survives on the crown outside the cupola base.
      // Offset the heavier accumulation toward the rear of the ring.
      const hatchRadius = Math.hypot(x + .17, z - .17);
      const hatchDust = (1 - THREE.MathUtils.smoothstep(Math.abs(hatchRadius - .25), .013, .083))
        * THREE.MathUtils.smoothstep(y, .11, .25) * (.36 + .64 * behind);
      pigment.lerp(dirt, hatchDust * .53);
    } else {
      const plateY = casting === 'deck' ? .097 : .204;
      const lip = 1 - THREE.MathUtils.smoothstep(Math.abs(y - plateY), .005, .050);
      const leadingEdge = THREE.MathUtils.smoothstep(Math.abs(z), .38, casting === 'deck' ? .63 : .99);
      pigment.lerp(foldedEdge, lip * (leadingEdge * .22 + .10) * (top * .55 + .45));
      if (casting === 'hull') {
        const splash = (1 - THREE.MathUtils.smoothstep(y, -.16, .1)) * (.30 + .18 * Math.abs(nx));
        pigment.lerp(ochre, splash);
        pigment.lerp(wetSill, THREE.MathUtils.smoothstep(z, .7, 1.05) * (1 - top) * .3);
      } else {
        const packedEdge = Math.max(THREE.MathUtils.smoothstep(Math.abs(x), .32, .56),
          THREE.MathUtils.smoothstep(Math.abs(z), .42, .64));
        const openPaint = .56 + .44 * Math.sin(9 * z - 11 * x) ** 2;
        pigment.lerp(dirt, packedEdge * openPaint * (.23 + .17 * top));
      }
    }
    pigment.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Cross-sections are enumerated counter-clockwise looking toward the bow.
// Adjacent sections share normals; end closures have their own hard break.
function sweptPlate(sections: THREE.Vector3[][]) {
  const p: number[] = [], uv: number[] = [], index: number[] = [];
  const n = sections[0].length;
  const put = (v: THREE.Vector3) => { p.push(v.x,v.y,v.z); uv.push(v.x,v.z + v.y); };
  for (let s = 0; s < sections.length; s++) {
    sections[s].forEach(put);
    if (!s) continue;
    for (let i = 0; i < n; i++) {
      const a = (s - 1) * n + i, b = (s - 1) * n + (i+1)%n;
      index.push(a,b,b+n,a,b+n,a+n);
    }
  }
  for (const [s,reverse] of [[0,true],[sections.length-1,false]] as const) {
    const start = p.length / 3;
    const center = new THREE.Vector3();
    sections[s].forEach(v=>center.add(v)); put(center.divideScalar(n));
    sections[s].forEach(put);
    for (let i = 0; i < n; i++) {
      const a = start + 1 + i, b = start + 1 + (i+1)%n;
      index.push(start,reverse ? b:a,reverse ? a:b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(index); geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

export function createTankDeckGeometry() {
  // A cast glacis: the narrow leading edge blends up to the driver's hatch;
  // the side shoulders roll off much earlier than the crown under the hatch.
  const geometry = sweptPlate([
    [-.70,.368,-.091,-.123],[-.675,.411,-.066,-.13],[-.598,.482,-.010,-.13],
    [-.507,.522,.078,-.13],[-.446,.548,.124,-.13],[-.35,.563,.13,-.13],
    [-.12,.58,.13,-.13],[.25,.58,.13,-.13],[.55,.56,.12,-.13],[.67,.522,.097,-.12],
  ].map(([z,w,h,b]) => {
    const depth=h-b;
    return [[-w*.82,b],[w*.82,b],[w*.955,b+.09*depth],[w,b+.26*depth],
      [w*.985,b+.47*depth],[w*.926,b+.75*depth],[w*.82,b+.91*depth],
      [w*.60,h-.004],[w*.39,h],[0,h],[-w*.39,h],[-w*.60,h-.004],
      [-w*.82,b+.91*depth],[-w*.926,b+.75*depth],[-w*.985,b+.47*depth],
      [-w,b+.26*depth],[-w*.955,b+.09*depth]].map(([x,y])=>new THREE.Vector3(x,y,z));
  }));
  paintArmorPlanes(geometry, 'deck');
  return geometry;
}

/** Sloped lower casting instead of a rectangular toy chassis. */
export function createTankHullGeometry() {
  const positions: number[] = [];
  const rings = [[-0.20, 0.51, 0.88], [0.01, 0.69, 1.06], [0.24, 0.57, 0.87]];
  const corners = rings.map(([y, x, z]) => [
    new THREE.Vector3(-x,y,-z), new THREE.Vector3(x,y,-z),
    new THREE.Vector3(x,y,z), new THREE.Vector3(-x,y,z),
  ]);
  const push = (...points: THREE.Vector3[]) => {
    for (const point of points) positions.push(point.x, point.y, point.z);
  };
  const form=(p:THREE.Vector3)=>{
    const bow=1-THREE.MathUtils.smoothstep(p.z,-1.03,-.40);
    const lateral=Math.abs(p.x)/(.51+.18*Math.max(0,1-Math.abs(p.y-.01)/.23));
    p.z+=bow*.158*lateral**2.35;
    p.x*=1-bow*(.038+.065*Math.abs(p.y-.01)/.24);
    return p;
  };
  // Keep the original combat hull profile and planar casting breaks. Only the
  // render faces are divided to give the baked color a few intermediate values.
  for (let ring=0;ring<2;ring++) for (let side=0;side<4;side++) {
    const next = (side + 1) % 4;
    const lowerA = corners[ring][side], lowerB = corners[ring][next];
    const upperA = corners[ring + 1][side], upperB = corners[ring + 1][next];
    const cell = (u: number, v: number) => {
      const p=lowerA.clone().lerp(lowerB,u).lerp(upperA.clone().lerp(upperB,u),v);
      // A cast bow is an egg in plan: maximum projection at its chin,
      // receding around each flank. Preserve the carrier, ring and back.
      return form(p);
    };
    const across = 8, climb = 3;
    for (let i = 0; i < across; i++) for (let j = 0; j < climb; j++) {
      const a = cell(i / across, j / climb), b = cell((i + 1) / across, j / climb);
      const c = cell(i / across, (j + 1) / climb), d = cell((i + 1) / across, (j + 1) / climb);
      push(a, c, b, b, c, d);
    }
  }
  for(const r of [0,2])for(let side=0;side<4;side++)for(let i=0;i<8;i++){
    const p=corners[r][side],q=corners[r][(side+1)%4];
    const a=form(p.clone().lerp(q,i/8)),b=form(p.clone().lerp(q,(i+1)/8));
    const mid=new THREE.Vector3(0,p.y,0);push(mid,r===0?a:b,r===0?b:a);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  const p=geometry.getAttribute('position'), n=geometry.getAttribute('normal');
  const uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++) {
    uv[i*2]=(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))*1.2;
    uv[i*2+1]=(Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i))*1.2;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  paintArmorPlanes(geometry, 'hull');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createTankTurretGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,-.15,0), new THREE.Vector3(.43,-.15,0),
    new THREE.Vector3(.537,-.102,0), new THREE.Vector3(.588,-.014,0),
    new THREE.Vector3(.590,.071,0), new THREE.Vector3(.564,.161,0),
    new THREE.Vector3(.511,.233,0), new THREE.Vector3(.421,.282,0),
    new THREE.Vector3(.25,.309,0), new THREE.Vector3(0,.312,0),
  ], false, 'centripetal');
  const profile = curve.getPoints(30).map(p=>new THREE.Vector2(Math.max(0,p.x),p.y));
  const geometry=new THREE.LatheGeometry(profile,40);
  geometry.scale(1,1,1.12);
  // Cast cheeks are full on either side of the mantlet, then pull inward
  // toward a longer, flatter bustle. Leave the mount and ring untouched.
  const p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const side=THREE.MathUtils.smoothstep(Math.abs(x),.14,.47);
    const upper=THREE.MathUtils.smoothstep(y,-.114,.14);
    const rear=THREE.MathUtils.smoothstep(z,-.18,.59);
    // Elliptical haunches swell just behind the mantlet then tuck under
    // the rear basket. Keep the centre-axis gun and cupola seats unchanged.
    const haunch=1-THREE.MathUtils.smoothstep(Math.abs(z+.225),.09,.413);
    const waist=1-THREE.MathUtils.smoothstep(Math.abs(y-.12),.036,.237);
    const r=Math.hypot(x,z/1.12),rho=(Math.abs(x)**2.52+Math.abs(z/1.12)**2.52)**(1/2.52);
    const shoulder=rho>1e-5?1+(r/rho-1)*(.35+.65*upper):1;
    // A single broad casting carries the commander. Its aft shoulder rises
    // and projects behind the ring, with no box edge dividing the silhouette.
    const aft=THREE.MathUtils.smoothstep(z,.035,.44);
    const crown=THREE.MathUtils.smoothstep(y,-.095,.20);
    p.setXYZ(i,x*shoulder*(1+side*(.069*haunch*waist-.035*rear)+.18*aft*waist),
      y+upper*side*(.025+.014*haunch-.028*rear)+.075*aft*crown,
      z*shoulder+upper*rear*.066+.19*aft*(.34+.66*crown));
  }
  geometry.computeVertexNormals();
  paintArmorPlanes(geometry, 'turret');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** A physical fold over either forward track, and dark returns at the tail.
 * Triangles on each face share the same object-space pixel chart; the fore
 * and aft strokes are distinct. Nothing is attached to the camera or wheels. */
export function createTankSignalGuards(){
  type Point=[number,number,number];
  type UV=[number,number];
  type Station=readonly [z:number,inner:number,outer:number,bottom:number,top:number];
  const jaw={p:[] as number[],uv:[] as number[]}, sheet={p:[] as number[],uv:[] as number[]};
  const geometry=(data:typeof jaw)=>{
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(data.p,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));
    geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();return geo;
  };
  // A half-texel inset prevents the rim from sampling the opposite edge.
  const quad=(bin:typeof sheet,vertices:Point[],tex:UV[],normal:Point,tile=0)=>{
    const cross=new THREE.Vector3().crossVectors(
      new THREE.Vector3(...vertices[1]).sub(new THREE.Vector3(...vertices[0])),
      new THREE.Vector3(...vertices[2]).sub(new THREE.Vector3(...vertices[0])));
    const forward=cross.dot(new THREE.Vector3(...normal))>=0;
    const order=vertices.length===3?(forward?[0,1,2]:[2,1,0]):(forward?[0,1,2,0,2,3]:[2,1,0,3,2,0]);
    const width=bin===sheet?512:256;
    for(const i of order){bin.p.push(...vertices[i]);bin.uv.push((tile*128+.5+tex[i][0]*127)/width,.5/64+tex[i][1]*(63/64));}
  };
  const corner:UV[]=[[0,0],[1,0],[1,1],[0,1]];
  const strip=(side:number,stations:Station[],paintJaw:boolean,oxidePanel=false)=>{
    const start=stations[0][0], length=stations[stations.length-1][0]-start;
    const section=([z,inside,out,low,high]:Station):Point[]=>[
      [side*(out-.017),low,z],[side*out,low+.028,z],[side*(out-.023),high-.016,z],
      [side*(out-.042),high,z],[side*inside,high+.008,z],[side*inside,low+.018,z],
    ];
    for(let i=1;i<stations.length;i++){
      const a=section(stations[i-1]),b=section(stations[i]);
      const ua=1-(stations[i-1][0]-start)/length,ub=1-(stations[i][0]-start)/length;
      for(let j=0;j<6;j++){
        if(oxidePanel&&j>=4)continue; // pressed onto the existing closed field case
        const k=(j+1)%6;
        const normal:Point=j===5?[0,-1,0]:j===4?[-side,0,0]:j===3?[0,1,0]:[side,j===2?1:0,0];
        const v0=j===0?.0:j===1?.0:j===2?.91:j===3?.14:.04;
        const v1=j===0?.13:j===1?1:j===2?.99:j===3?.91:.67;
        quad(paintJaw&&j===1?jaw:sheet,[a[j],b[j],b[k],a[k]],[[ua,v0],[ub,v0],[ub,v1],[ua,v1]],normal,oxidePanel&&j<4?1:0);
      }
    }
    for(const n of [0,stations.length-1]){
      if(paintJaw&&n===0)continue; // joined to the wraparound bow
      const pts=section(stations[n]),norm:Point=[0,0,n===0?-1:1];
      quad(sheet,[pts[0],pts[2],pts[4],pts[5]],corner,norm);
      quad(sheet,[pts[0],pts[1],pts[2]],corner,norm);
      quad(sheet,[pts[2],pts[3],pts[4]],corner,norm);
    }
  };
  for(const side of [-1,1]){
    // Bent outer lid on the established fender/tool chest. It sits back
    // from the rolled lip, and the black tire / articulated track stay free.
    strip(side,[[.055,.676,.848,.417,.535],[.092,.670,.862,.414,.575],
      [.302,.670,.865,.412,.579],[.516,.670,.864,.414,.571],
      [.640,.676,.849,.422,.536]],false,true);
    // A stepped stamped mudguard curls over the back of the track. Its
    // angled return and underside are visible from the real driving camera.
    strip(side,[[.66,.606,.877,.419,.460],[.77,.605,.898,.427,.489],
      [.925,.604,.911,.420,.492],[1.034,.603,.911,.372,.461],
      [1.105,.607,.900,.296,.385],[1.132,.622,.882,.273,.343]],false);
  }
  // One continuous cast volume from cheek through chin. In plan it turns
  // through an ellipse; in section its crown rolls inward and chin undercuts.
  // There is no flat front bumper with a row of teeth attached to it.
  const sideEnd=.58,tileChange=.94;
  const silhouette=(t:number,v:number)=>{
    const run=Math.min(1,t/sideEnd),ang=Math.max(0,(t-sideEnd)/(1-sideEnd))*Math.PI/2;
    const cs=t===1?0:Math.cos(ang),sn=Math.sin(ang), q=THREE.MathUtils.smoothstep(run,0,1);
    const x=(.846+.061*q+.010*Math.sin(run*Math.PI))*cs;
    const z=.024-.792*run-.402*sn;
    const d=Math.hypot(cs/.907,sn/.402),nx=cs/.907/d,nz=-sn/.402/d;
    const lo=.420-.137*q-.093*sn, hi=.579+.097*Math.sin(run*Math.PI*.85)-.049*sn+.042*Math.sin(2*ang);
    // Sweep the *painted* cheek back up toward the lamp deck, as on the
    // scale model. The old upright rim left most of the enamel underneath
    // a thick brow; a nose seen from above could show only the tooth tips.
    const fold=.077+.054*q+.083*sn;
    const setback=(.099+.031*sn)*(1-v)**3+fold*v**2.16;
    return new THREE.Vector3(x-nx*setback,lo+v*(hi-lo),z-nz*setback);
  };
  const ts=[0,.28,.46,.58,.68,.80,.87,.94,1];
  const vs=[0,.20,.49,.78,1];
  const normals:number[]=[];
  for(const side of [-1,1]){
    const vertex=(t:number,v:number,tail:boolean)=>{
      const p=silhouette(t,v);
      const dt=silhouette(Math.min(1,t+.001),v).sub(silhouette(Math.max(0,t-.001),v));
      const dv=silhouette(t,Math.min(1,v+.001)).sub(silhouette(t,Math.max(0,v-.001)));
      const n=dt.cross(dv).normalize();
      // Leave the original brush line intact on the side, but pull the
      // large canine, iris and forward teeth around the shoulder and up onto
      // its actual turned surface. Keep the middle of the chin toothless.
      const u=tail ? (.5+.5*side*((1-t)/(1-tileChange)))
        : t<=sideEnd ? t*.40/sideEnd : .4+.60*(t-sideEnd)/(tileChange-sideEnd);
      jaw.p.push(side*p.x,p.y,p.z);
      jaw.uv.push(((tail?128:0)+.5+u*127)/256,(.5+v*63)/64);
      normals.push(side*n.x,n.y,n.z);
    };
    const seams=(t:number):[Point,Point,Point,Point]=>{
      const top=silhouette(t,1),bottom=silhouette(t,0);
      const run=Math.min(1,t/sideEnd),ang=Math.max(0,(t-sideEnd)/(1-sideEnd))*Math.PI/2;
      const sn=Math.sin(ang);
      const inner:Point=[side*top.x*(.66+.04*sn),.545+.048*Math.sin(Math.PI*run)-.095*sn,top.z+.181*sn];
      // Rounded bridge from high knuckle to the existing rolled glacis.
      const mid:Point=[side*top.x*.85,(top.y+inner[1])*.5+.017,top.z+.094*sn];
      return [[side*top.x,top.y,top.z],mid,inner,[side*bottom.x,bottom.y,bottom.z]];
    };
    for(let i=0;i<ts.length-1;i++){
      const a=ts[i],b=ts[i+1],tail=a>=tileChange;
      for(let j=0;j<vs.length-1;j++){
        const c=vs[j],d=vs[j+1];
        for(const [t,v] of (side>0?[[a,c],[b,c],[b,d],[a,c],[b,d],[a,d]]:
          [[a,c],[b,d],[b,c],[a,c],[a,d],[b,d]]))vertex(t,v,tail);
      }
      const A=seams(a),B=seams(b);
      // Project once along the full piece: the rim never repeats the rust
      // tile for each quad and never forms a graphic border around the jaw.
      for(let k=0;k<2;k++)quad(sheet,[A[k],B[k],B[k+1],A[k+1]],
        [[a,k*.50],[b,k*.50],[b,(k+1)*.50],[a,(k+1)*.50]],[0,1,0],side>0?2:3);
      const inward=(q:Point):Point=>[q[0]*.66,q[1]+.028,q[2]+.16*(1-Math.min(1,Math.abs(q[0])/.82))];
      quad(sheet,[A[3],B[3],inward(B[3]),inward(A[3])],
        [[a,.06],[b,.06],[b,.10],[a,.10]],[0,-1,0]);
      if(i===0)quad(sheet,[A[3],A[0],A[1],A[2]],corner,[0,0,1]);
    }
  }
  const casting=geometry(jaw);
  casting.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  return {jaw:casting,guard:geometry(sheet)};
}

function mergeDetail(parts: THREE.BufferGeometry[]) {
  const flat = parts.map(part=>part.index ? part.toNonIndexed() : part);
  const geometry = mergeGeometries(flat,false)!;
  for (const part of new Set([...parts,...flat])) part.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function rodBetween(a: THREE.Vector3, b: THREE.Vector3, radius=.012, segments=8) {
  const direction = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius,radius,direction.length(),segments);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
  return geometry.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
}

function paintFitting(geometry: THREE.BufferGeometry, base: string, light: string, minimum = .05) {
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  const shadow = new THREE.Color(base), top = new THREE.Color(light), pigment = new THREE.Color();
  for (let i = 0; i < normals.count; i++) {
    // A thin painted glint on upward and forward shoulders, not a white outline.
    const lift = THREE.MathUtils.smoothstep(normals.getY(i) - .22 * normals.getZ(i), -.15, .65);
    pigment.copy(shadow).lerp(top, minimum + lift * (1 - minimum));
    pigment.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function glazeFitting(geometry: THREE.BufferGeometry, color: string,
  presence: (x: number, y: number, z: number, up: number) => number) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const colors = geometry.getAttribute('color');
  const glaze = new THREE.Color(color), pigment = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    pigment.fromBufferAttribute(colors, i).lerp(glaze,
      THREE.MathUtils.clamp(presence(positions.getX(i), positions.getY(i), positions.getZ(i), normals.getY(i)), 0, 1));
    colors.setXYZ(i, pigment.r, pigment.g, pigment.b);
  }
  return geometry;
}

export function createTankFenderGeometry() {
  // Folded sheet with a rolled edge and a clipped, downward-facing nose.
  // It should read as thin steel following the track, not a heavy shelf.
  const sheet=sweptPlate([
    [-.984,.070,-.126],[-.968,.095,-.102],[-.943,.119,-.057],[-.903,.141,-.006],
    [-.85,.15,.029],[-.35,.15,.029],[.34,.15,.026],[.91,.15,.024],[1.087,.147,.012],[1.13,.137,-.018],
  ].map(([z,w,h])=>[
    [-w+.01,h-.041],[w-.01,h-.041],[w,h-.031],[w,h-.004],
    [w-.005,h+.002],[w-.014,h+.004],[w-.026,h],[w*.62,h],[0,h],[-w*.62,h],
    [-w+.026,h],[-w+.014,h+.004],[-w+.005,h+.002],[-w,h-.004],[-w,h-.031],
  ].map(([x,y])=>new THREE.Vector3(x,y,z))));
  const fender = paintFitting(sheet, '#36392e', '#6b7257', .14);
  glazeFitting(fender, '#a58b62', (x, _y, z, up) => {
    const shoulder = THREE.MathUtils.smoothstep(Math.abs(x), .132,.15);
    const bed = THREE.MathUtils.smoothstep(up, -.12,.44);
    return bed * (.15 + .34 * shoulder) * (z < 0 ? 1 : .66);
  });
  return glazeFitting(fender, '#b3a680', (x, _y, z, up) => {
    const rollover = THREE.MathUtils.smoothstep(Math.abs(x), .133,.148)
      * THREE.MathUtils.smoothstep(up,.048,.67);
    return rollover * (z < 0 ? .20 : .09) * (x < 0 ? .54 : 1);
  });
}

export function createTankTurretRingGeometry() {
  const ring = paintFitting(new THREE.CylinderGeometry(.55,.61,.22,32), '#343a2f', '#5b5d45', .16);
  return glazeFitting(ring, '#9a754a', (x, y, z, up) => {
    const angle = Math.atan2(z,x);
    // Left as dry-olive intervals between discrete pockets at the mounts.
    const fore = THREE.MathUtils.smoothstep(Math.cos(angle + .53), .86, .99);
    const left = THREE.MathUtils.smoothstep(Math.cos(angle - 2.76), .88, .99);
    const aft = THREE.MathUtils.smoothstep(Math.cos(angle - 1.22), .90, .995);
    const deposit = Math.max(fore * .79, left * .71, aft * .32);
    return deposit * (1 - THREE.MathUtils.smoothstep(y,-.10,.12))
      * THREE.MathUtils.smoothstep(up,-.66,-.05) * THREE.MathUtils.smoothstep(Math.hypot(x,z),.32,.60);
  });
}

export function createTankCupolaGeometry() {
  const hatchFace=(g:THREE.BufferGeometry) => g.rotateX(Math.PI / 2.08).translate(.18, .43, .53);
  const parts=[
    paintFitting(new THREE.TorusGeometry(.21,.045,8,18)
      .rotateX(Math.PI / 2).translate(.18, .4, .33), '#444636', '#978962', .12),
    paintFitting(hatchFace(new THREE.CylinderGeometry(.166,.17,.031,24)), '#394237', '#6d725a', .22),
  ];
  // The upright lid shows its liner, lip and hinge when seen from the rear.
  // Keep the rim hollow around the crew instead of adding a solid hatch disk.
  parts.push(paintFitting(hatchFace(new THREE.TorusGeometry(.151,.007,5,24)
    .rotateX(Math.PI/2).translate(0,.016,0)),'#505442','#908870',.26));
  parts.push(paintFitting(hatchFace(new THREE.CylinderGeometry(.121,.127,.013,24)
    .translate(0,.019,0)),'#3d4138','#64654f',.28));
  for(const x of [-.092,.092]) {
    parts.push(paintFitting(hatchFace(new THREE.CylinderGeometry(.008,.008,.015,6)
      .translate(x,.031,.054)),'#565648','#93947a',.38));
  }
  parts.push(paintFitting(hatchFace(new THREE.CylinderGeometry(.017,.017,.156,10)
    .rotateZ(Math.PI/2).translate(0,.017,.129)),'#3b4137','#87856c',.24));
  return mergeDetail(parts);
}

export function createTankAccessoryHousingGeometry(radio: boolean) {
  if(!radio) {
    // Cosmetic stamped cover: the narrow lower case and raised upper cover
    // break up the old monolithic silhouette without moving any game socket.
    const lower=paintFitting(new RoundedBoxGeometry(.155,.128,.405,1,.014)
      .translate(0,-.022,0),'#283334','#4f5a52',.17);
    const lid=paintFitting(new RoundedBoxGeometry(.179,.066,.419,1,.019)
      .translate(0,.050,0),'#3e483d','#787c64',.24);
    const trim=[lower,lid];
    for(const side of [-1,1]) {
      trim.push(paintFitting(new THREE.BoxGeometry(.006,.031,.126).translate(side*.081,-.007,-.036),
        '#283033','#4a534b',.20));
      for(const z of [-.137,.119]) trim.push(paintFitting(new THREE.CylinderGeometry(.009,.009,.016,8)
        .rotateZ(Math.PI/2).translate(side*.079,-.017,z),'#515c54','#9c9d89',.42));
    }
    return mergeDetail(trim);
  }
  const parts=[
    paintFitting(new RoundedBoxGeometry(.253,.201,.270,1,.020),'#414a3e','#717865',.25),
    paintFitting(new RoundedBoxGeometry(.264,.025,.283,1,.008).translate(0,.100,0),'#38463d','#84846a',.24),
    paintFitting(new RoundedBoxGeometry(.193,.124,.012,1,.008).translate(0,.007,.138),'#363e34','#5a6351',.23),
  ];
  // Cooling ribs on the back, strap catches and socket boss on the lid.
  for(let i=0;i<5;i++) parts.push(paintFitting(new THREE.BoxGeometry(.115,.008,.008)
    .translate(-.017,-.035+i*.018,.147),'#2e3831','#77806a',.18));
  for(const side of [-1,1]) {
    parts.push(paintFitting(new THREE.BoxGeometry(.011,.051,.022).translate(side*.128,.060,.072),
      '#3d4339','#91876b',.31));
    parts.push(paintFitting(new THREE.BoxGeometry(.014,.011,.032).translate(side*.131,.073,.072),
      '#515449','#a3977a',.40));
  }
  parts.push(paintFitting(new THREE.CylinderGeometry(.031,.041,.030,12).translate(-.067,.122,0),
    '#363e37','#797d67',.26));
  return mergeDetail(parts);
}

/** Mesh-authored fittings, not flat painted details. All static steel is merged. */
export function createTankHullFittingsGeometry() {
  const parts: THREE.BufferGeometry[]=[];
  const rails = new Set<THREE.BufferGeometry>();
  // Lamp guards, fender rails and split engine-deck grilles.
  for (const side of [-1,1]) {
    const x=side*.445;
    // One continuous bent bar, swept back over the glass. The ends land on
    // the bow casting; an angled rear stay braces the outboard shoulder.
    const hoop=new THREE.CatmullRomCurve3([
      [-.090,.327,-.914],[-.098,.409,-.965],[-.083,.530,-.981],
      [-.049,.564,-.962],[.014,.571,-.948],[.065,.553,-.948],
      [.089,.506,-.956],[.097,.408,-.947],[.093,.336,-.886],
    ].map(([dx,y,z])=>new THREE.Vector3(x+side*dx,y,z)));
    parts.push(new THREE.TubeGeometry(hoop,16,.008,6,false));
    parts.push(rodBetween(new THREE.Vector3(x+side*.077,.532,-.952),
      new THREE.Vector3(x+side*.087,.375,-.823),.007,6));
    // Feet are embedded in steel, not suspended in front of the glacis.
    parts.push(new THREE.CylinderGeometry(.038,.052,.078,10).translate(x,.356,-.893));
    parts.push(rodBetween(new THREE.Vector3(x,.364,-.893),
      new THREE.Vector3(x,.443,-.927),.028,8));
    const rail = rodBetween(new THREE.Vector3(side*.84,.44,-.8),new THREE.Vector3(side*.84,.44,.95),.016);
    parts.push(rail);
    rails.add(rail);
    for(const z of [-.76,-.25,.35,.91]) {
      parts.push(rodBetween(new THREE.Vector3(side*.67,.31,z),new THREE.Vector3(side*.84,.43,z),.018));
    }
    // Handles on the transmission access covers.
    for(const z of [.38,.68,.95]) {
      parts.push(new THREE.TorusGeometry(.034,.009,5,10,Math.PI).rotateX(-Math.PI/2).translate(side*.3,.603,z));
    }
    // Suspension arms are visible in the gaps between road wheels.
    for(const z of TANK_ROAD_WHEEL_CENTERS) {
      parts.push(rodBetween(new THREE.Vector3(side*.70,.248,z+.091),new THREE.Vector3(side*.76,TANK_ROAD_WHEEL_Y,z),.029,8));
    }
  }
  for (const part of parts) {
    paintFitting(part, '#3b4136', rails.has(part) ? '#96927a' : '#82806c');
    if (rails.has(part)) glazeFitting(part, '#ada588', (_x, _y, z, up) =>
      THREE.MathUtils.smoothstep(up,.18,.82) * (z < 0 ? .22 : .10));
  }
  // Return rollers bear the underside of the high run. Keep them inboard so
  // daylight is still visible above/between the six lower wheels.
  for(const side of [-1,1]) for(const z of [-.48,0,.48]) {
    parts.push(paintFitting(new THREE.CylinderGeometry(.053,.053,.106,12)
      .rotateZ(Math.PI/2).translate(side*.747,.274,z),'#2a2e2c','#514f45',.2));
    parts.push(paintFitting(new THREE.CylinderGeometry(.030,.034,.117,10)
      .rotateZ(Math.PI/2).translate(side*.75,.274,z),'#363c39','#736e55',.25));
  }
  // Two sheet-metal tool compartments sit on each fender. The overhanging
  // lid, centre split and bright catches survive the normal chase distance.
  for(const side of [-1,1]) for(const [z,len] of [[.206,.320],[.57,.368]]) {
    parts.push(paintFitting(new RoundedBoxGeometry(.205,.070,len,1,.014)
      .translate(side*.716,.452,z),'#3a433a','#70745d',.20));
    parts.push(paintFitting(new RoundedBoxGeometry(.218,.025,len+.011,1,.008)
      .translate(side*.716,.488,z),'#495146','#8b896b',.23));
    parts.push(paintFitting(new THREE.BoxGeometry(.009,.036,.028)
      .translate(side*.822,.467,z-.047),'#333a34','#8b8065',.29));
  }
  // Split, raked rear cooling grille follows the sloping rear face. A dark
  // backing separates the dirty louvre edges, rather than a row of loose teeth.
  const grate=(g:THREE.BufferGeometry,x:number)=>g.rotateX(-.64).translate(x,.294,1.029);
  for(const side of [-1,1]) {
    const center=side*.254;
    parts.push(paintFitting(grate(new THREE.BoxGeometry(.485,.175,.022),center),'#2f3430','#424537',.12));
    for(let i=0;i<13;i++) {
      parts.push(paintFitting(grate(new THREE.BoxGeometry(.016,.142,.035)
        .rotateY(.46).translate(-.212+i*.035,0,.024),center),'#413e34',
      i%4===1?'#857960':'#756d56',.24));
    }
    for(const y of [-.084,.084]) parts.push(paintFitting(grate(new THREE.BoxGeometry(.49,.014,.040)
      .translate(0,y,.019),center),'#45493c','#8a8165',.17));
  }
  return mergeDetail(parts);
}

type WheelSection = readonly [radius: number, axle: number, paint: string];

/** Revolved wheel cross-section. Both faces have a rolled lip, a deep
 * dish and a central hub. One indexed mesh, no coplanar discs or decals. */
function pressedWheel(face: WheelSection[], segments: number | number[], teeth=false, dimples=false) {
  const stations: WheelSection[] = [
    ...face.map(([r,d,c])=>[r,-d,c] as const),...face.slice().reverse(),
  ];
  const pos:number[] = [], colors:number[] = [], uv:number[] = [], indices:number[] = [];
  let priorStart=0, priorCount=0;
  for(let j=0;j<stations.length;j++) {
    const [baseR,axle,col]=stations[j], tint=new THREE.Color(col);
    const start=pos.length/3, section=Math.min(j,stations.length-1-j);
    const count=baseR===0?1:typeof segments==='number'?segments:segments[section];
    for(let i=0;i<count;i++) {
      const a=i*Math.PI*2/count;
      const lobe=dimples && baseR>.066 && baseR<.099 ? (.5+.5*Math.cos(a*6))**2 : 0;
      const tooth=teeth && baseR>.15 ? (i%2 ? -.015:.012) : 0;
      const r=baseR+tooth;
      pos.push(axle - Math.sign(axle)*lobe*.016,r*Math.cos(a),r*Math.sin(a));
      const grub=(1-.47*lobe)*(1+.055*Math.cos(a*3+.6)+.029*Math.sin(a*5));
      colors.push(tint.r*grub,tint.g*grub,tint.b*grub);
      uv.push(.5+r*Math.cos(a)*2.6,.5+r*Math.sin(a)*2.6);
    }
    if(priorCount===1) {
      for(let i=0;i<count;i++) indices.push(priorStart,start+(i+1)%count,start+i);
    } else if(count===1) {
      for(let i=0;i<priorCount;i++) indices.push(priorStart+i,priorStart+(i+1)%priorCount,start);
    } else if(priorCount) {
      // Spend the segments on the outer silhouette, not inside the small hub.
      let a=0,b=0;
      while(a<priorCount || b<count) {
        const left=priorStart+a%priorCount,right=start+b%count;
        if((a+1)*count<=(b+1)*priorCount && a<priorCount) {
          indices.push(left,priorStart+(a+1)%priorCount,right);a++;
        } else {
          indices.push(left,start+(b+1)%count,right);b++;
        }
      }
    }
    priorStart=start;priorCount=count;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();
  return geo;
}

export function createTankEndWheelGeometry(sprocket = false) {
  if(sprocket) return pressedWheel([
    [0,.080,'#615f4c'],[.044,.075,'#8a8061'],[.061,.054,'#554c40'],
    [.104,.026,'#413e34'],[.140,.054,'#82775f'],[.158,.056,'#958771'],
  ],[1,8,8,10,12,24],true);
  return pressedWheel([
    [0,.078,'#797461'],[.038,.077,'#9b8c69'],[.057,.056,'#68634e'],
    [.095,.026,'#4a483b'],[.134,.047,'#625f4d'],[.150,.064,'#958971'],
    [.158,.062,'#585549'],[TANK_END_WHEEL_RADIUS,.051,'#3b3b35'],
  ],[1,6,8,8,12,16,16,18]);
}

export function createTankRoadWheelGeometry() {
  const wheel = pressedWheel([
    [0,.078,'#ae9062'],[.026,.078,'#cfaa73'],[.038,.070,'#9b845a'],
    [.044,.060,'#535140'],[.058,.056,'#7c704e'],[.073,.044,'#736248'],
    [.087,.033,'#554c3a'],[.098,.039,'#796949'],[.110,.053,'#a48b63'],
    [.116,.064,'#c0a27a'],[.123,.062,'#6e6049'],[.127,.056,'#30332d'],
    [.143,.056,'#41413a'],[TANK_ROAD_WHEEL_RADIUS,.046,'#2c302c'],
  ],24,false,true);
  const parts=[wheel];
  // Six flats catch light as the wheel rotates. The bolt circle stays
  // separate from the centre grease cover and from the scalloped web.
  for(let i=0;i<6;i++) {
    const a=(i+.5)*Math.PI/3, y=.052*Math.cos(a), z=.052*Math.sin(a);
    parts.push(paintFitting(new THREE.CylinderGeometry(.0065,.0065,.123,6)
      .rotateZ(Math.PI/2).translate(0,y,z),'#615e4d','#a3967b',.58));
  }
  return mergeDetail(parts);
}

// The short pack hangs low on the port corner. Use the same baked rig for
// its basket, belt loops, folded cloth and sewn texture coordinates.
export const TANK_BUSTLE_MOUNT = {
  scale:[.51,.72,.78], offset:[-.295,-.074,.24],
} as const;
function packOnPortRail(part:THREE.BufferGeometry) {
  return part.scale(...TANK_BUSTLE_MOUNT.scale).translate(...TANK_BUSTLE_MOUNT.offset);
}

/** Open bustle basket, hatch grab handles, periscopes and restraint straps. */
export function createTankTurretFittingsGeometry() {
  const parts: THREE.BufferGeometry[]=[];
  for(const y of [.13,.32]) {
    parts.push(rodBetween(new THREE.Vector3(-.52,y,.61),new THREE.Vector3(-.52,y,.94)));
    parts.push(rodBetween(new THREE.Vector3(.52,y,.61),new THREE.Vector3(.52,y,.94)));
    parts.push(rodBetween(new THREE.Vector3(-.52,y,.94),new THREE.Vector3(.52,y,.94)));
  }
  for(let i=0;i<6;i++) {
    const x=-.5+i*.2;
    parts.push(rodBetween(new THREE.Vector3(x,.13,.94),new THREE.Vector3(x,.32,.94),.009));
    parts.push(rodBetween(new THREE.Vector3(x,.13,.63),new THREE.Vector3(x,.13,.94),.009));
  }
  for(const p of parts)packOnPortRail(p);
  // Fasten the offset pack to the steel itself; the old full-width box is gone.
  for(const x of [-.46,-.17]) parts.push(
    rodBetween(new THREE.Vector3(x,.108,.445),new THREE.Vector3(x,.020,.745),.014));
  const grabStart = parts.length;
  for(const side of [-1,1]) {
    for(const z of [-.16,.10]) {
      parts.push(rodBetween(new THREE.Vector3(side*.583,.00,z-.064),new THREE.Vector3(side*.631,.063,z-.064),.013));
      parts.push(rodBetween(new THREE.Vector3(side*.631,.063,z-.064),new THREE.Vector3(side*.631,.063,z+.064),.013));
      parts.push(rodBetween(new THREE.Vector3(side*.631,.063,z+.064),new THREE.Vector3(side*.583,.00,z+.064),.013));
    }
  }
  const tubeCount = parts.length;
  for(let i=0;i<5;i++) {
    const angle=i/5*Math.PI*2;
    parts.push(new RoundedBoxGeometry(.082,.046,.06,1,.009)
      .rotateY(-angle).translate(-.17+Math.sin(angle)*.18,.466,.12+Math.cos(angle)*.18));
  }
  for (let i = 0; i < parts.length; i++) {
    const tubes = i < tubeCount;
    const grabContact = tubes && i >= grabStart && (i - grabStart) % 3 === 1;
    paintFitting(parts[i], tubes ? '#313b38' : '#475042',
      grabContact ? '#929486' : tubes ? '#757e70' : '#8e916b');
  }
  // The canvas bedroll is secured with dark webbing, and sits inside the basket.
  for(const x of [-.30,.30]) parts.push(packOnPortRail(new THREE.CylinderGeometry(.151,.151,.041,16,1,true)
    .rotateZ(Math.PI/2).scale(1,.88,1).translate(x,.300,.863)));
  for (const part of parts.slice(-2)) paintFitting(part, '#332f27', '#70583e', .16);
  // A pressed-steel field box clipped to the bustle rail. Stepped lid, deep
  // lip, and two stepped clasps read even when the tank is only a small sprite.
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,lo:string,hi:string)=>{
    parts.push(packOnPortRail(paintFitting(new THREE.BoxGeometry(w,h,d).translate(x,y,z),lo,hi,.20)));
  };
  box(-.35,.218,.886,.285,.147,.132,'#384740','#7f8761');
  box(-.35,.295,.886,.304,.028,.151,'#34453d','#a3a27b');
  for(const x of [-.441,-.257]){
    box(x,.228,.956,.026,.076,.014,'#3c4a41','#bfab79');
    box(x,.201,.964,.038,.017,.009,'#5a624b','#b6a378');
  }
  // Cast lifting eyes punctuate the broad turret roof. Each arch is a real
  // hollow forging with two welded feet set into the curved shoulder.
  for (const side of [-1,1]) for (const [z,y] of [[-.35,.293],[.24,.282]]) {
    const x=side*.47;
    const crown=new THREE.CatmullRomCurve3([
      [x,y-.019,z-.058],[x+side*.006,y+.033,z-.055],
      [x+side*.011,y+.065,z-.033],[x+side*.013,y+.069,z+.022],
      [x+side*.006,y+.047,z+.052],[x,y-.019,z+.062],
    ].map(q=>new THREE.Vector3(...q)));
    const loop=paintFitting(new THREE.TubeGeometry(crown,10,.012,6,false),'#42473b','#999781',.19);
    parts.push(glazeFitting(loop,'#b0a38b',(_x,py,pz,up)=>
      THREE.MathUtils.smoothstep(py,y+.045,y+.071)*THREE.MathUtils.smoothstep(up,.20,.84)
      *(1-THREE.MathUtils.smoothstep(Math.abs(pz-z+.015),.012,.061))*.68));
    for(const dz of [-.055,.057]) parts.push(paintFitting(
      new THREE.CylinderGeometry(.025,.034,.030,8).rotateZ(-side*.30).translate(x,y-.014,z+dz),
      '#444339','#6c705b',.13));
  }
  return mergeDetail(parts);
}

export function createTankCanvasGeometry() {
  const parts: THREE.BufferGeometry[]=[];
  const paintCompression = (geometry: THREE.BufferGeometry, glaze: (x: number, y: number, z: number) => number) => {
    const pos = geometry.getAttribute('position'), paint = geometry.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      const shade = glaze(pos.getX(i), pos.getY(i), pos.getZ(i));
      paint.setXYZ(i, paint.getX(i) * (1 - shade * .74), paint.getY(i) * (1 - shade), paint.getZ(i) * (1 - shade));
    }
    return geometry;
  };
  const roll=new THREE.CylinderGeometry(.149,.154,.986,24,24,true).rotateZ(Math.PI/2);
  const positions=roll.getAttribute('position');
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const rollFold = 1 - THREE.MathUtils.smoothstep(Math.abs(Math.abs(x) - .30), .008, .058);
    const wrinkle = Math.sin(x * 19 + z * 34) * Math.cos(z * 12 - y * 33);
    const rumple=1.105-rollFold*.171+wrinkle*.047;
    positions.setXYZ(i,x,y*rumple*.88,z*rumple);
  }
  roll.computeVertexNormals();roll.translate(0,.300,.863);
  // Darken the soft cloth where the ties compress it. Leave the big crown
  // planes warm and matte; do not try to paint a full-resolution weave.
  parts.push(paintCompression(paintFitting(roll, '#71694e', '#b5aa82', .13), (x, y, z) => {
    const tie = 1 - THREE.MathUtils.smoothstep(Math.abs(Math.abs(x) - .30), .019, .087);
    const tuck = 1 - THREE.MathUtils.smoothstep(y + (z - .863) * .35, .228, .32);
    return tie * .32 + tuck * .11;
  }));
  // A rolled tarp doesn't end in a flat coin. Take the actual rumpled
  // boundary vertices and grow two corrugated end faces from them. Each
  // turning lip has a lighter facing, a recessed dark tuck and a real edge
  // in depth: a raking light travels across it as the turret rotates.
  for(const row of [0,24]){
    const side=Math.sign(positions.getX(row*25));
    const p:number[]=[], colors:number[]=[],uv:number[]=[], index:number[]=[];
    const dark=new THREE.Color('#4d4936'),hemp=new THREE.Color('#a99c73'),color=new THREE.Color();
    const rings=9, sectors=24;
    for(let j=0;j<=rings;j++) for(let i=0;i<=sectors;i++){
      const r=j/rings,k=row*25+i,yy=positions.getY(k)-.300,zz=positions.getZ(k)-.863;
      const a=Math.atan2(zz,yy), spiral=r*2.12 + (a/(2*Math.PI))*(side>0?1:-1)
        + .073*Math.sin(a*3.0+.7) + .035*Math.sin(a*5+r*2);
      const s=spiral-Math.floor(spiral),lip=1-THREE.MathUtils.smoothstep(Math.abs(s-.62),.05,.31);
      const soften=Math.min(1,r*3,(1-r)*8);
      p.push(side*(.457+.036*r+.036*lip*soften),
        .300+yy*r+.006*(1-r)*side,.863+zz*r-.010*(1-r));
      color.copy(dark).lerp(hemp,(.19+.73*lip)*Math.min(1,r*3)+.07*r);
      colors.push(color.r,color.g,color.b);uv.push(i/sectors,r);
      if(i<sectors&&j<rings){
        const k0=j*(sectors+1)+i,k1=k0+sectors+1;
        if(side>0)index.push(k0,k0+1,k1,k0+1,k1+1,k1);
        else index.push(k0,k1,k0+1,k0+1,k1,k1+1);
      }
    }
    const cap=new THREE.BufferGeometry();
    cap.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    cap.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    cap.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));cap.setIndex(index);cap.computeVertexNormals();parts.push(cap);
  }
  // An overlapping loose weather flap over the aft roll. It goes OVER the
  // crown and drops back down under gravity, rather than painting a wavy edge
  // on the cylinder. Cut slots beneath the existing two retaining belts.
  const positionsCloth:number[]=[],uvCloth:number[]=[],indices:number[]=[];
  const nc=44, nr=10;
  for(let j=0;j<=nr;j++)for(let i=0;i<=nc;i++){
    const u=i/nc,v=j/nr,x=-.47+.94*u;
    const clampTie=1-THREE.MathUtils.smoothstep(Math.abs(Math.abs(x)-.30),.008,.080);
    const hem=.48+.49*Math.sin(8.4*u-.63)+.18*Math.sin(17.1*u+.53);
    const a=.45+v*(1.91+hem*.66);
    const crease=(.012*Math.cos(u*55+v*1.19)+.008*Math.sin(u*31-v*1.64))*(.34+.66*v);
    const radius=.174-clampTie*.028+crease+saturatedHem(v);
    positionsCloth.push(x,.300+Math.cos(a)*radius*.89,.863+Math.sin(a)*radius);
    uvCloth.push(u,v);
    if(j<nr&&i<nc&&Math.abs(Math.abs(x+.94/nc/2)-.30)>.025){
      const k=j*(nc+1)+i,h=k+nc+1;
      indices.push(k,h,k+1,k+1,h,h+1);
    }
  }
  function saturatedHem(v:number){return .0035*THREE.MathUtils.smoothstep(v,.76,.90)-.003*THREE.MathUtils.smoothstep(v,.91,1);}
  const fly=new THREE.BufferGeometry();fly.setAttribute('position',new THREE.Float32BufferAttribute(positionsCloth,3));
  fly.setAttribute('uv',new THREE.Float32BufferAttribute(uvCloth,2));fly.setIndex(indices);fly.computeVertexNormals();
  parts.push(paintFitting(fly,'#554f40','#aa9a72',.095));
  for(const p of parts)packOnPortRail(p);
  for(const side of [-1,1]) {
    const pouch = new RoundedBoxGeometry(.16,.21,.24,3,.046).rotateZ(side*.13).translate(side*.59,.10,.475);
    parts.push(paintCompression(paintFitting(pouch, '#78644b', '#ad946d', .13), (x, y) => {
      const underFlap = 1 - THREE.MathUtils.smoothstep(Math.abs(y - .171 - (Math.abs(x) - .61) * .13), .014, .050);
      const baseFold = 1 - THREE.MathUtils.smoothstep(y, .043, .105);
      return underFlap * .25 + baseFold * .12;
    }));
    parts.push(paintFitting(new RoundedBoxGeometry(.174,.055,.235,2,.020).rotateZ(side*.13).translate(side*.59,.192,.475),
      '#806b50', '#c3ad82', .21));
  }
  return mergeDetail(parts);
}

export function createTankHeadlampsGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1,1]) {
    const x=side*.445, y=.47, z=-.920;
    const shell=new THREE.LatheGeometry([
      [.052,-.048],[.055,-.056],[.060,-.059],[.065,-.059],[.070,-.055],
      [.073,-.047],[.074,-.020],[.069,.008],[.055,.035],[.036,.047],[0,.051],
    ].map(([r,d])=>new THREE.Vector2(r,d)),24).rotateX(Math.PI/2).translate(x,y,z);
    parts.push(paintFitting(shell,'#394238','#81826c',.11));
    // A silver retainer catches the sky; below it the rubber seal falls into
    // shadow. The glass sits *behind* both, with no opaque cap in front.
    for(const [r,wire,d,c0,c1] of [
      [.059,.0038,-.058,'#515852','#aaa998'],[.054,.0041,-.054,'#222c2e','#39413c'],
    ] as const) parts.push(paintFitting(new THREE.TorusGeometry(r,wire,5,24)
      .translate(x,y,z+d),c0,c1,.28));
    const p:number[]=[], colors:number[]=[], uv:number[]=[], indices:number[]=[];
    const rows=12, columns=24;
    const smoked=new THREE.Color('#293237'), sky=new THREE.Color('#a3b9b5');
    const bounce=new THREE.Color('#ccc3a6'), glint=new THREE.Color('#e1e6d7');
    const color=new THREE.Color();
    for(let i=0;i<=columns;i++) for(let j=0;j<=rows;j++) {
      const u=i/columns*2-1, v=(j/rows*2-1)*Math.sqrt(Math.max(0,1-u*u));
      const crown=1-u*u-v*v;
      // Molded vertical flutes refract a cool strip of sky above a dark
      // horizon and a shorter warm bounce beneath. The lamps remain unlit.
      const ribs=i%3===1?1:0;
      const reflection=v+.48*u+.12*u*u;
      color.copy(smoked).lerp(sky,THREE.MathUtils.smoothstep(reflection,-.12,.49)*.70)
        .lerp(bounce,(1-THREE.MathUtils.smoothstep(Math.abs(reflection+.46),.055,.29))*(.23+.36*ribs))
        .lerp(glint,(1-THREE.MathUtils.smoothstep(Math.abs(reflection-.48),.05,.23))*(.46+.40*ribs));
      color.multiplyScalar((.84+.16*crown)*(.88+.12*ribs));
      p.push(x+u*.054,y+v*.054,z-.047-.006*crown-.0008*ribs*crown);
      uv.push(i/columns,j/rows);colors.push(color.r,color.g,color.b);
      if(i && j) {
        const d=i*(rows+1)+j, a=d-rows-2;
        indices.push(a,a+1,d,a,d,d-1);
      }
    }
    const lens=new THREE.BufferGeometry();
    lens.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    lens.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    lens.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    lens.setIndex(indices);lens.computeVertexNormals();
    parts.push(lens);
  }
  return mergeDetail(parts);
}

export function createTankStencilGeometry() {
  // Shape is built as a fan for an understated worn paint gradient to the
  // ragged tips rather than a bright and perfectly clean overlay badge.
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  const worn = new THREE.Color('#95916d'), intact = new THREE.Color('#c5be98');
  const rear = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(.48, .573, .70);
  const vertex = new THREE.Vector3(), pigment = new THREE.Color();
  const tip = (i: number) => {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? .95 + .05 * Math.cos(i * 1.7) : .41;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  };
  const add = (x: number, y: number, wear: number) => {
    vertex.set(x * .062, y * .062, 0).applyMatrix4(rear);
    positions.push(vertex.x, vertex.y, vertex.z);
    pigment.copy(intact).lerp(worn, wear);
    colors.push(pigment.r, pigment.g, pigment.b);
    uvs.push(x * .5 + .5, y * .5 + .5);
  };
  // The nose now carries the shark paint in its armor material. The rear
  // deck still has the original star in its original position.
  for (let i = 0; i < 10; i++) {
    add(0, 0, .17);
    for (const point of [i, i + 1]) add(...tip(point), .57 + .25 * Math.sin(point * 5.7));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export const CANNON_BARREL_MOUNT_Z = -.61;
/** Discrete olive segments, dark collar breaks and pale rubbed shoulders as
 * one lathed shell. The breech, recoil group and actual end socket stay put. */
export function createTankSignalBarrel(){
  const rings=[
    [0,.085],[-.11,.085],[-.118,.077],[-.36,.077],[-.366,.086],[-.392,.086],[-.398,.072],
    [-.72,.070],[-.73,.076],[-.755,.076],[-.765,.066],[-1.12,.062],[-1.13,.070],[-1.17,.070],[-1.18,.059],[-1.34,.056],
  ];
  const shell=new THREE.LatheGeometry(rings.slice().reverse().map(([d,r])=>new THREE.Vector2(r,d)),14).rotateX(Math.PI/2);
  const positions=shell.attributes.position,colors=new Float32Array(positions.count*3);
  const c=new THREE.Color();
  for(let i=0;i<positions.count;i++){
    const y=positions.getY(i),z=positions.getZ(i),r=Math.hypot(y,positions.getX(i));
    const collar=(z<=-.36&&z>=-.399)||(z<=-.72&&z>=-.766)||(z<=-1.12&&z>=-1.181);
    c.set(collar?(y/r>.46?'#c1ad78':'#484b3b'):y/r>.67?'#b7a36d':y/r>-.20?'#86815a':'#535842');
    c.toArray(colors,i*3);
  }
  shell.setAttribute('color',new THREE.BufferAttribute(colors,3));return shell;
}
export function cannonRecoilPosition(recoil: number) {
  return CANNON_BARREL_MOUNT_Z + Math.max(0,Math.min(1,recoil))*.16;
}

export function createTrackBeltGeometry(lengthScale=1) {
  const run=.86*lengthScale;
  const radius=TANK_TRACK_RADIUS, bore=TANK_TRACK_BORE;
  const shape=new THREE.Shape();
  shape.moveTo(-run,-radius); shape.lineTo(run,-radius);
  shape.absarc(run,0,radius,-Math.PI/2,Math.PI/2,false);
  shape.lineTo(-run,radius); shape.absarc(-run,0,radius,Math.PI/2,Math.PI*1.5,false);
  const hole=new THREE.Path();
  // Only the inner guide remains continuous. From the flank there must be
  // daylight above the dish and actual separation between the shoes.
  hole.moveTo(-run,-bore); hole.absarc(-run,0,bore,-Math.PI/2,-Math.PI*1.5,true);
  hole.lineTo(run,bore); hole.absarc(run,0,bore,Math.PI/2,-Math.PI/2,true);
  hole.closePath(); shape.holes.push(hole);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.167,bevelEnabled:false,curveSegments:14});
  geometry.translate(0,0,-.0835).rotateY(Math.PI/2);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** A replaceable shallow-chevron rubber pad cradled by a forged shoe, with
 * relieved outer corners and smaller link ends. Instanced on the old loop. */
export function createTankTrackShoeGeometry() {
  const p:number[]=[], colors:number[]=[], uv:number[]=[];
  const vertex=(v:readonly number[], c:THREE.Color) => {
    p.push(v[0],v[1],v[2]); colors.push(c.r,c.g,c.b); uv.push(v[0]*3.5+.5,v[2]*10+.5);
  };
  const stamp=(outline:number[][],low:number,high:number,shrink:number,edge:string,bevel:string,face:string) => {
    const middle=(low+high)*.5, n=outline.length;
    const dark=new THREE.Color(edge), bright=new THREE.Color(bevel), crown=new THREE.Color(face);
    const rim=outline.map(([x,z])=>[x,middle,z]);
    const bottom=outline.map(([x,z])=>[x,low,z]);
    const top=outline.map(([x,z])=>[x*shrink,high,z*shrink]);
    // Camera sees this inner surface on the bottom run and around end wheels.
    if(low<0) for(let i=1;i<n-1;i++) {
      vertex(bottom[0],dark);vertex(bottom[i],dark);vertex(bottom[i+1],dark);
    }
    for(let i=0;i<n;i++) {
      const k=(i+1)%n;
      // Outline clockwise viewed from above; the tab and cap shade separately.
      vertex(bottom[i],dark);vertex(rim[i],bright);vertex(rim[k],bright);
      vertex(bottom[i],dark);vertex(rim[k],bright);vertex(bottom[k],dark);
      vertex(rim[i],bright);vertex(top[i],crown);vertex(top[k],crown);
      vertex(rim[i],bright);vertex(top[k],crown);vertex(rim[k],bright);
      vertex([0,high,0],crown);vertex(top[k],crown);vertex(top[i],crown);
    }
  };
  stamp([[-.131,-.024],[-.114,-.038],[.110,-.038],[.131,-.022],
    [.131,.027],[.112,.039],[-.109,.039],[-.131,.025]],-.015,.007,.94,'#39352f','#b49a76','#8e7452');
  stamp([[-.102,-.021],[-.086,-.034],[0,-.015],[.085,-.034],[.101,-.021],
    [.091,.013],[.004,.034],[-.090,.013]],.005,.025,.89,'#242823','#45473d','#333930');
  // Worn track pins lie on the inward side of the shoe between the
  // neighboring castings. Both end faces read as riveted rather than square.
  const pin=paintFitting(new THREE.CylinderGeometry(.013,.013,.263,6)
    .rotateZ(Math.PI/2).translate(0,-.008,.033),'#555145','#a09171',.49);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();
  return mergeDetail([geo,pin]);
}

/** Welds, louvres, towing eyes and bolt heads share one static detail draw. */
export function createTankHardwareGeometry() {
  const parts: THREE.BufferGeometry[]=[];
  const bolt=new THREE.CylinderGeometry(.015,.015,.012,6);
  for(const side of [-1,1]) for(let i=0;i<9;i++) {
    parts.push(paintFitting(bolt.clone().translate(side*.60,.51,-.84+i*.21), '#424637', '#91875e'));
  }
  bolt.dispose();
  for(let i=0;i<11;i++) {
    const rib = paintFitting(new RoundedBoxGeometry(.77,.018,.025,1,.006).translate(0,.57,.36+i*.05),
      '#3d3b30', '#757257');
    parts.push(glazeFitting(rib,'#a78459',(x,_y,_z,up)=> {
      const settled = Math.max(0,1-Math.abs(i-2)*.26)*THREE.MathUtils.smoothstep(x,-.05,.31);
      const ventEnd = Math.max(0,1-Math.abs(i-8)*.42)*(1-THREE.MathUtils.smoothstep(x,-.34,-.095));
      return Math.max(settled * .62,ventEnd * .53) * THREE.MathUtils.smoothstep(up,.04,.77);
    }));
  }
  for(const x of [-.48,.48]) for(const z of [-1.075,1.07]) {
    parts.push(paintFitting(new THREE.TorusGeometry(.048,.012,5,10).translate(x,.21,z), '#3a4037', '#897c55'));
  }
  // Driver's access panel is seated on the upper glacis, with a dark gasket
  // under the fitted plate. Same placement as the independent upper deck.
  const onDeck = (part: THREE.BufferGeometry) => part.rotateX(.1).translate(0, .46, -.18);
  parts.push(paintFitting(onDeck(new RoundedBoxGeometry(.34, .027, .286, 1, .011).translate(-.04, .128, -.39)),
    '#343930', '#535540'));
  parts.push(paintFitting(onDeck(new RoundedBoxGeometry(.311, .029, .258, 1, .011).translate(-.04, .143, -.39)),
    '#53583f', '#82825c'));
  parts.push(paintFitting(onDeck(new RoundedBoxGeometry(.112, .041, .050, 1, .007).translate(-.04, .167, -.49)),
    '#333d36', '#626e5a'));
  // Cargo belongs to the hull, not the turning turret. Keep the centre
  // grille and star open: near port is a lumpy lashed cover, near starboard
  // is a shallow hard case with distinct lid, catches and folded handle.
  const fixedBox=(x:number,y:number,z:number,w:number,h:number,d:number,lo:string,hi:string)=>{
    parts.push(paintFitting(new THREE.BoxGeometry(w,h,d).translate(x,y,z),lo,hi,.17));
  };
  parts.push(paintFitting(new RoundedBoxGeometry(.209,.135,.341,1,.015).translate(.705,.547,.796),
    '#464a3b','#847e5e',.16));
  parts.push(paintFitting(new RoundedBoxGeometry(.222,.022,.354,1,.009).translate(.705,.617,.796),
    '#41473a','#99977a',.19));
  for(const z of [.680,.907]){
    fixedBox(.811,.568,z,.012,.053,.029,'#3f4137','#9e997e');
    fixedBox(.818,.577,z,.009,.013,.034,'#585b4f','#bbb095');
    fixedBox(.601,.610,z,.017,.021,.046,'#484b3d','#91896e');
  }
  fixedBox(.705,.640,.795,.018,.014,.079,'#535447','#9c967b');
  for(const z of [.760,.829])fixedBox(.705,.634,z,.020,.015,.016,'#4a4f42','#797c67');
  // A continuous rounded bundle sags between its two cloth straps. Use the
  // same fitted cross-section for strap and parcel so there is no floating
  // torus or flat cap visible at the edge of the real rear mudguard.
  const bundlePoint=(x:number,y:number,t:number,extra:number)=>{
    const tie=Math.min(Math.abs(t+.255),Math.abs(t-.265));
    const waist=1-THREE.MathUtils.smoothstep(tie,.014,.099);
    const end=THREE.MathUtils.smoothstep(Math.abs(t),.33,.52);
    const rumple=.043*Math.cos(19*t+1.9*x-.6*y)+.021*Math.sin(32*t-3*y);
    const sx=.114*(1.0-.13*waist-.30*end+rumple)+extra;
    const sy=.085*(1.0-.21*waist-.33*end+rumple)+extra;
    return [-.725+Math.sign(x)*Math.abs(x)**.74*sx+.009*t,
      .553+Math.sign(y)*Math.abs(y)**.68*sy-.018*end+.009*x+.006*Math.sin(t*5),
      .813+t*.496+.006*x-.009*y] as const;
  };
  const bundle=(strap?:number)=>{
    const shape=new THREE.CylinderGeometry(1,1,1,14,strap===undefined?16:1,strap!==undefined).rotateX(Math.PI/2);
    const p=shape.getAttribute('position');
    for(let i=0;i<p.count;i++){
      const t=strap===undefined?p.getZ(i):strap+p.getZ(i)*.053;
      p.setXYZ(i,...bundlePoint(p.getX(i),p.getY(i),t,strap===undefined?0:.0030));
    }
    shape.computeVertexNormals();
    return paintFitting(shape,strap===undefined?'#494e40':'#49422e',strap===undefined?'#979676':'#a08b62',.19);
  };
  parts.push(bundle(),bundle(-.255),bundle(.265));
  for(const z of [.683,.940])fixedBox(-.827,.570,z,.009,.021,.032,'#625b46','#aaa78d');
  // Exhaust screens are shallow guards over the engine, not upended plates.
  for(const x of [-.30,.30]){
    fixedBox(x,.593,.674,.019,.027,.31,'#4b5141','#8b896b');
    for(const z of [.525,.825])fixedBox(x,.583,z,.041,.022,.026,'#45483b','#807b61');
  }
  return mergeDetail(parts);
}

export function trackLoopLength(lengthScale=1) {return 3.44*lengthScale+Math.PI*2*TANK_TRACK_RADIUS;}
export const TRACK_LOOP_LENGTH=trackLoopLength();
export function trackPadPose(distance:number,lengthScale=1) {
  const loop=trackLoopLength(lengthScale),run=1.72*lengthScale,half=run/2,r=TANK_TRACK_RADIUS;
  let d=((distance%loop)+loop)%loop;
  if(d<run) return {z:-half+d,y:r,angle:0};
  d-=run;
  if(d<Math.PI*r) { const a=d/r;return {z:half+Math.sin(a)*r,y:Math.cos(a)*r,angle:a}; }
  d-=Math.PI*r;
  if(d<run) return {z:half-d,y:-r,angle:Math.PI};
  d-=run;
  const a=d/r;
  return {z:-half-Math.sin(a)*r,y:-Math.cos(a)*r,angle:Math.PI+a};
}
