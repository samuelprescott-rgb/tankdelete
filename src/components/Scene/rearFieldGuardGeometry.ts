import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type P = [number,number,number];
const OLIVE='#71805a', SHADE='#414c40', EDGE='#a7a475', DEEP='#303a36', SOIL='#816853';
const ZERO:P=[0,0,0];

// Each moving subassembly is one colored mesh; its fittings share the draw.
function batch() {
  const pieces:T.BufferGeometry[]=[];
  const part=(g:T.BufferGeometry, color:string, pos:P=ZERO, rot:P=ZERO) => {
    g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]).translate(...pos);
    const geo=g.index?g.toNonIndexed():g;
    if(geo!==g)g.dispose();
    geo.deleteAttribute('uv');
    const pts=geo.getAttribute('position'), ns=geo.getAttribute('normal'), c=new T.Color(color);
    const colors=new Float32Array(pts.count*3);
    for(let i=0;i<pts.count;i++) {
      const n=ns.getY(i), face=.89+.15*Math.max(0,n)-.11*Math.max(0,-n);
      colors[i*3]=c.r*face; colors[i*3+1]=c.g*face; colors[i*3+2]=c.b*(face+.035*(1-n));
    }
    geo.setAttribute('color',new T.BufferAttribute(colors,3)); pieces.push(geo);
  };
  const box=(pos:P,size:P,color:string,rot:P=ZERO)=>part(new T.BoxGeometry(...size),color,pos,rot);
  const cyl=(pos:P,top:number,bottom:number,length:number,color:string,rot:P=ZERO,segments=12)=>
    part(new T.CylinderGeometry(top,bottom,length,segments),color,pos,rot);
  const rod=(a:P,b:P,r:number,color:string)=>{
    const from=new T.Vector3(...a), to=new T.Vector3(...b), v=to.clone().sub(from);
    const g=new T.CylinderGeometry(r*.86,r,v.length(),6);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));
    part(g,color,from.lerp(to,.5).toArray());
  };
  const finish=(name:string)=>{
    const g=mergeGeometries(pieces,false); for(const p of pieces)p.dispose();
    g.name=name; g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  };
  return {part,box,cyl,rod,finish};
}

// Low, cut-corner hull rising from the dark tread line to a narrow glacis.
function hullPlates() {
  const rows=[ [.32,.74,-1.32,1.32], [.72,.94,-1.59,1.55], [1.00,.84,-1.13,1.30] ];
  const p:number[]=[],idx:number[]=[];
  for(const [y,w,front,rear] of rows){
    for(const [x,z] of [[-w+.17,front],[w-.17,front],[w,front+.23],[w,rear-.22],
      [w-.16,rear],[-w+.17,rear],[-w,rear-.22],[-w,front+.23]]) p.push(x,y,z);
  }
  for(let k=0;k<2;k++)for(let i=0;i<8;i++){
    const a=k*8+i,b=k*8+(i+1)%8;idx.push(a,a+8,b,b,a+8,b+8);
  }
  for(let i=1;i<7;i++)idx.push(16,16+i+1,16+i,0,i,i+1);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return flat;
}

function sideBadge(side:number) {
  // Low-relief enamel designation on a small rectangular plate. The star is
  // geometry, so it's legible at a glancing angle and uses no texture upload.
  const p:number[]=[];
  for(let j=0;j<10;j++){
    const point=(i:number):P=>{const a=i*Math.PI/5,r=i%2?.061:.148;return [side*.717,.32+r*Math.cos(a),.07+r*Math.sin(a)];};
    const a=point(j),b=point(j+1);p.push(side*.717,.32,.07,...(side>0?a:b),...(side>0?b:a));
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}

export function createRearFieldGuardArt(){
  const hull=batch();hull.part(hullPlates(),OLIVE);
  // Paint follows the actual sloping bow plane. Irregular stepped edges read
  // as scuffed clay/primer, not a graphic shared with the player's tank.
  const bowChip=(x:number,y:number,scale:number,color:string,lift:number)=>{
    const p:number[]=[];
    const point=(u:number,v:number):P=>{const h=y+v*scale;return [x+u*scale,h,-1.59+(h-.72)*(.46/.28)-lift];};
    const edge=[[0,0],[.11,.003],[.13,.014],[.27,.013],[.30,.022],[.22,.030],[.10,.021],[.045,.022]];
    for(let i=1;i<edge.length-1;i++) p.push(...point(0,0),...point(edge[i+1][0],edge[i+1][1]),...point(edge[i][0],edge[i][1]));
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();hull.part(g,color);
  };
  bowChip(-.54,.803,1.02,'#866d4e',.006);bowChip(-.50,.816,.64,EDGE,.009);
  bowChip(.22,.75,.72,'#8d7150',.006);bowChip(.29,.765,.34,EDGE,.01);
  // Three spare links clipped to the glacis cast their own short shadows.
  const bowTilt=Math.atan(.46/.28);
  for(let i=0;i<3;i++){
    const x=.12+i*.129; hull.box([x,.89,-1.32],[.116,.235,.036],'#4e5245',[bowTilt,0,0]);
    hull.box([x,.899,-1.335],[.097,.048,.026],i===2?SOIL:'#8a896c',[bowTilt,0,0]);
  }
  for(const side of [-1,1]){
    const x=.87*side;
    // The belt is a stretched faceted loop; five overlapping rubber-rimmed
    // wheels land inside it, ending short of the higher return wheels.
    hull.box([x,.46,0],[.38,.48,2.62],DEEP);
    for(const end of [-1,1]){
      hull.box([x,.43,end*1.32],[.38,.52,.30],DEEP,[end*.34,0,0]);
      hull.cyl([x,.52,end*1.31],.225,.225,.40,'#393c35',[0,0,Math.PI/2]);
      hull.cyl([side*1.073,.52,end*1.31],.15,.15,.025,SOIL,[0,0,Math.PI/2]);
    }
    for(let j=0;j<5;j++){
      const z=(j-2)*.502;
      hull.cyl([x,.36,z],.315,.315,.39,'#343934',[0,0,Math.PI/2],16);
      hull.cyl([side*1.07,.36,z],.250,.250,.035,j%2?OLIVE:'#66765a',[0,0,Math.PI/2],14);
      hull.cyl([side*1.091,.36,z],.105,.128,.038,SHADE,[0,0,Math.PI/2],9);
    }
    for(let i=0;i<16;i++){
      const z=-1.27+i*.17, rise=.14*Math.max(0,(Math.abs(z)-1.05)/.22);
      hull.box([x,.034+rise,z],[.41,.058,.123],i%3?'#514d42':SOIL,[-Math.sign(z)*rise*4,0,0]);
    }
    for(let i=0;i<3;i++){
      const z=-1.08+i*1.06;
      hull.box([x,.775,z],[.45,.076,1.02],i===1?'#737b59':OLIVE);
      hull.box([side*1.088,.759,z-.04],[.04,.073,.79],i===2?SOIL:EDGE);
      hull.box([side*1.011,.817,z-.18],[.087,.008,.23],i===0?'#8b7655':'#78805e',[0,side*.10,0]);
    }
    hull.box([x,.77,-1.50],[.43,.067,.27],OLIVE,[-.34,0,0]);
    hull.box([side*.61,.949,-1.19],[.25,.16,.14],DEEP,[-.32,0,0]);
    hull.box([side*.61,.957,-1.265],[.16,.096,.022],'#e4cc91',[-.32,0,0]);
    hull.rod([side*.35,.997,-1.12],[side*.65,.92,-1.23],.026,EDGE);
    // Broad fuel drums and straps at the tail keep its rear distinct from its nose.
    hull.cyl([side*.50,.88,1.46],.225,.225,.69,'#5e6a4e',[0,0,Math.PI/2]);
    for(const off of [-.21,.21]) hull.cyl([side*.50+off,.88,1.46],.234,.234,.043,DEEP,[0,0,Math.PI/2]);
  }
  hull.box([0,1.005,.98],[1.09,.08,.59],SHADE);
  for(let j=0;j<7;j++)hull.box([0,1.056,.77+j*.067],[.85,.027,.036],j%3===0?'#858a6b':'#646e55');
  hull.cyl([0,1.065,-.14],.65,.70,.15,DEEP);

  const turret=batch();
  const rings=[ [.45,0],[.66,.09],[.70,.26],[.665,.38],[.53,.49],[.32,.55],[0,.56] ];
  turret.part(new T.LatheGeometry(rings.map(([r,y])=>new T.Vector2(r,y)),20).scale(1,1,1.18),OLIVE);
  turret.cyl([-.25,.54,.09],.204,.218,.083,SHADE);
  turret.cyl([-.25,.597,.09],.178,.196,.035,'#87916a');
  turret.box([-.25,.629,.09],[.15,.032,.045],DEEP);
  turret.cyl([.237,.52,.12],.174,.201,.078,'#677456');
  turret.box([.238,.579,.09],[.132,.045,.065],SHADE);
  turret.rod([.427,.459,.38],[.504,1.22,.51],.014,SHADE);
  turret.cyl([.427,.464,.38],.040,.057,.07,DEEP);
  for(const side of [-1,1]){
    turret.box([side*.69,.321,.07],[.048,.304,.43],'#9b4439');
    turret.part(sideBadge(side),'#f3d479');
    turret.rod([side*.59,.394,-.32],[side*.53,.424,-.43],.015,EDGE);
    turret.rod([side*.60,.394,.32],[side*.52,.42,.52],.017,EDGE);
  }
  const barrel=batch();
  barrel.box([0,0,-.36],[.43,.274,.36],SHADE);
  const along:P=[Math.PI/2,0,0];
  barrel.cyl([0,0,-.75],.138,.16,.51,OLIVE,along);
  barrel.cyl([0,0,-1.55],.083,.101,1.23,'#768064',along);
  barrel.cyl([0,0,-1.12],.103,.109,.12,EDGE,along);
  barrel.cyl([0,0,-1.96],.105,.105,.22,'#5c6851',along);
  barrel.cyl([0,0,-2.225],.093,.092,.147,EDGE,along);
  barrel.cyl([0,0,-2.301],.065,.065,.01,'#272f2e',along);

  const coals=batch();
  for(const [x,y,z,w] of [[.26,1.08,.96,.26],[-.24,1.09,1.12,.15],[.09,1.095,.89,.20],[-.05,1.10,.79,.10]])
    coals.box([x,y,z],[w,.032,.08],w>.22?'#de7544':'#9d4e38',[0,x,0]);
  return {hull:hull.finish('Rear guard | swept hull, tread, lamps and drums'),
    turret:turret.finish('Rear guard | low cast turret with enamel stars'),
    barrel:barrel.finish('Rear guard | cannon and dark bore'),coals:coals.finish('Rear guard | smouldering deck')};
}

export function createFieldHutKit(){
  const fittings=batch(),door=batch(),rubble=batch();
  // Door geometry is authored about its left hinge, not its centre. Real
  // space opens up between the threshold and the village mesh's inner wall.
  for(let j=0;j<5;j++)door.box([.096+j*.187,.72,0],[.179,1.43,.054],['#685e47','#797053','#685c46'][j%3]);
  for(const y of [.18,1.20])door.box([.466,y,-.048],[.94,.07,.046],'#564635');
  door.rod([.08,.23,-.057],[.836,1.166,-.057],.037,'#94805b');
  door.box([.794,.663,-.073],[.092,.13,.044],'#3c4240');
  fittings.rod([-1.93,-.14,.38],[-1.91,3.52,.42],.067,'#74654a');
  fittings.rod([-1.91,3.48,.42],[-1.88,4.18,.43],.024,'#535e58');
  fittings.rod([-2.25,3.99,.43],[-1.49,3.99,.43],.025,'#a29973');
  fittings.rod([-1.89,4.12,.43],[-.66,3.36,.54],.012,'#545a4c');
  // A field telephone/radio beside the jamb: hood, weatherproof case, speaker
  // bars and dial. Just the dial lights; there is no beacon above the canopy.
  fittings.box([.79,1.22,-1.27],[.40,.47,.21],'#3e4c44');
  // The radio is independently bolted to a buried post: a collapsed roof
  // leaves the same receiver at exactly the same reachable world location.
  fittings.box([.79,.57,-1.217],[.14,1.28,.12],'#71684e');
  fittings.box([.79,.12,-1.217],[.30,.24,.24],'#716d53');
  fittings.box([.79,1.47,-1.30],[.46,.048,.28],'#958968',[-.12,0,0]);
  for(let k=0;k<4;k++)fittings.box([.75,1.17+k*.040,-1.382],[.23,.012,.012],'#afb08a');
  fittings.cyl([.68,1.063,-1.386],.033,.033,.026,'#b4ac82',[Math.PI/2,0,0],8);
  // Broken sill/stove plinth is the last solid; scattered flat boards outside
  // it are low drive-over dressing. Stepped split ends and half a roof frame
  // retain the outline and colors of the station after a hit.
  rubble.box([0,.11,0],[.96,.22,.84],'#575447');
  rubble.box([-.15,.265,.06],[.48,.11,.46],'#756948',[.04,.06,0]);
  const boards=[
    [-1.04,.08,-.38,1.30,-.31],[-.80,.10,-.68,1.05,-.48],[-.61,.055,-.98,.78,-.65],
    [.83,.06,.29,1.01,.54],[1.05,.08,.49,1.18,.58],[.77,.055,.80,.73,.45],
    [-.52,.08,1.06,1.26,1.43],[-.11,.12,.97,1.36,1.57],[.18,.08,1.02,.91,1.68],
    [-1.12,.07,.26,.61,-.18],[.5,.07,-.59,.67,.94],[-.17,.10,-.47,.85,.68],
  ];
  for(const [i,[x,y,z,l,yaw]] of boards.entries()){
    const wood=['#766449','#645644','#887554','#554d3c'][i%4];
    rubble.box([x,y,z],[.165,.078,l],wood,[0,yaw,0]);
    rubble.box([x+Math.sin(yaw)*l*.50+.02,y+.001,z+Math.cos(yaw)*l*.50],[.076,.075,.15],'#9b8159',[0,yaw,0]);
  }
  rubble.rod([-.98,.12,.31],[.32,.12,.78],.059,'#403f35');
  rubble.rod([-.98,.12,.31],[-.28,.17,1.04],.053,'#5c503a');
  return {door:door.finish('Rear hut | braced plank door'),fittings:fittings.finish('Rear hut | field radio mast and receiver'),
    rubble:rubble.finish('Rear hut | split planks, plinth and broken roof frame')};
}
