import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyPaintedFinish } from './paintedMaterials';

type Part = T.BufferGeometry;
type Pt = [number,number,number];
type Tint = (x:number,y:number,z:number,n:T.Vector3)=>number;
const iron = '#364344', ironEdge = '#788277', seam = '#333b38';
const v = (p:Pt)=>new T.Vector3(...p);

function paint(g:Part, ground:string, lifted:string, accent?:Tint) {
  const p=g.getAttribute('position'),normal=g.getAttribute('normal'),n=new T.Vector3();
  const dark=new T.Color(ground),light=new T.Color(lifted),mixed=new T.Color();
  const rgb=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++) {
    n.fromBufferAttribute(normal,i);
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const upper=T.MathUtils.smoothstep(n.y+n.x*.15-n.z*.16,-.30,.91);
    const mark=.047*Math.sin(z*20+x*31)+.026*Math.sin(y*79+z*9.2);
    mixed.copy(dark).lerp(light,T.MathUtils.clamp(.075+.49*upper+mark+(accent?.(x,y,z,n)??0),.02,.97)).toArray(rgb,i*3);
  }
  g.setAttribute('color',new T.BufferAttribute(rgb,3));g.deleteAttribute('uv');
  return g;
}
function batch(parts:Part[]) {
  const buffers=parts.map(p=>p.index?p.toNonIndexed():p);
  const g=mergeGeometries(buffers)!;
  for(const p of new Set([...parts,...buffers]))p.dispose();
  g.computeBoundingBox();g.computeBoundingSphere();
  return g;
}
function box(size:Pt,at:Pt,r:number) {
  return new RoundedBoxGeometry(...size,1,r).translate(...at);
}
function profile(rows:number[][],at:Pt,steps=36) {
  return new T.LatheGeometry(rows.map(([r,y])=>new T.Vector2(r,y)),steps).translate(...at);
}
function piping(points:Pt[],r:number) {
  return new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v)),(points.length-1)*3,r,7,false);
}
function casing(rows:number[][]) {
  const values:number[]=[],indices:number[]=[];
  // Individual chamfered strips keep flat sheet faces flat while allowing the
  // shoulders to narrow along the length of this fictional prop's cover.
  const cross=([z,w,y,h]:number[])=>[[-w*.78,y+h], [w*.78,y+h],[w,y+h*.62],[w,y-h*.66],
    [w*.76,y-h],[-w*.76,y-h],[-w,y-h*.66],[-w,y+h*.62]].map(([x,y])=>[x,y,z]);
  const sections=rows.map(cross);
  for(let j=0;j<sections.length-1;j++)for(let k=0;k<8;k++) {
    const l=(k+1)%8,i=values.length/3;
    for(const pt of [sections[j][k],sections[j][l],sections[j+1][k],sections[j+1][l]])values.push(...pt);
    indices.push(i,i+2,i+1,i+1,i+2,i+3);
  }
  for(const [j,reverse] of [[0,false],[sections.length-1,true]] as const) {
    const i=values.length/3;
    for(const pt of sections[j])values.push(...pt);
    for(let k=1;k<7;k++)indices.push(i,reverse?i+k+1:i+k,reverse?i+k:i+k+1);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(values,3));
  geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

/** Exterior-only model for the game miniature. It contains no action,
 * ammunition, animation, hit, trajectory or effect data. */
export function createCrewStationShroud() {
  const parts:Part[]=[];
  parts.push(paint(casing([[-.315,.023,.080,.020],[-.286,.034,.078,.029],[-.244,.040,.077,.031],
    [-.019,.043,.077,.030],[.078,.037,.077,.024],[.102,.029,.078,.022]]),iron,ironEdge));
  parts.push(paint(casing([[-.279,.025,.106,.0045],[-.246,.039,.110,.0073],[-.169,.045,.113,.0074],
    [-.017,.047,.111,.008],[.068,.035,.105,.006]]),'#535b50','#939582',(_x,_y,z,n)=>Math.abs(n.x)*.20*(.5+.5*Math.sin(z*26))));
  // Overhanging hem reads as a distinct thin sheet; the empty area below its
  // rear is genuine negative space through both lateral views.
  for(const s of [-1,1]) {
    parts.push(paint(piping([[s*.040,.106,-.245],[s*.046,.109,-.143],[s*.047,.107,-.014],[s*.037,.102,.065]],.0026),
      '#545b51','#adb09c'));
    parts.push(paint(piping([[s*.023,.065,.080],[s*.026,.059,.099],[s*.053,.044,.138],[s*.065,.043,.158]],.006),
      '#344044','#81877c'));
  }
  // Low, soft-sided stowage. Shaped bellows replace the tall square mass that
  // used to mask both the hand and open space below the cover.
  const sack=new RoundedBoxGeometry(.075,.104,.156,3,.015);
  const xyz=sack.attributes.position;
  for(let i=0;i<xyz.count;i++) {
    const x=xyz.getX(i),y=xyz.getY(i),z=xyz.getZ(i);
    const fold=Math.sin(z*64+y*21)*.004*(1-T.MathUtils.smoothstep(Math.abs(y),.029,.055));
    xyz.setXYZ(i,-.078+x+Math.sign(x)*fold, -.007+y-.005*Math.cos(z*24),-.130+z+.005*Math.sin(y*26));
  }
  sack.computeVertexNormals();
  parts.push(paint(sack,'#625a43','#a99b72',(x,y,z)=>.13*Math.sin(z*61+y*22)+.045*Math.sin(x*69)));
  parts.push(paint(box([.080,.018,.160],[-.079,.042,-.131],.008),'#69664e','#b9aa80'));
  for(const z of [-.177,-.086])parts.push(paint(piping([[-.054,.048,z],[-.090,.050,z],
    [-.116,.044,z],[-.120,.021,z],[-.118,-.027,z]],.0031),'#505642','#918c69'));
  return batch(parts);
}

export function createCrewStationPost() {
  const parts=[
    paint(profile([[.074,-.199],[.094,-.193],[.096,-.182],[.089,-.173],[.059,-.169],[.049,-.158],
      [.039,-.148],[.034,-.127],[.031,-.053],[.032,-.033]], [0,0,.012],24),'#39453e','#858777'),
  ];
  for(const s of [-1,1]) {
    parts.push(paint(piping([[s*.020,-.106,.014],[s*.024,-.074,.013],[s*.049,-.039,.012],
      [s*.052,.019,.003],[s*.043,.054,-.017]],.0074),iron,ironEdge));
  }
  return batch(parts);
}

// Oiled, worn handle and small metal ferrules. Same axis, reach and outer
// radius as the two gameplay prop handles; both instances share one mesh.
export function createCrewGrip() {
  const wood=profile([[.022,-.041],[.025,-.037],[.024,-.030],[.023,-.013],[.022,.010],
    [.022,.025],[.023,.035],[.021,.040]],[0,0,0],16);
  const grain=(x:number,y:number,z:number)=>.23*Math.sin(7*Math.atan2(z,x)+27*y)+.12*Math.cos(Math.atan2(z,x)*3-.4);
  return batch([paint(wood,'#392d26','#8b7053',grain),
    paint(profile([[0,-.045],[.021,-.045],[.026,-.041],[.025,-.036]],[0,0,0],16),'#262f32','#83877a'),
    paint(profile([[.023,.036],[.024,.040],[.022,.044],[.018,.045],[.005,.045],[.003,.043],[0,.043]],[0,0,0],16),'#303738','#9c9a82')]);
}

export function createCrewHatch() {
  // Flat flanged metal with a dark inner reveal, not a doughnut-shaped pad.
  const rim=profile([[.173,.360],[.226,.360],[.234,.370],[.234,.383],[.228,.391],[.221,.397],
    [.216,.406],[.204,.412],[.190,.413],[.179,.408],[.173,.395],[.173,.360]],[.18,0,.33],56);
  const parts=[paint(rim,'#39463e','#898a6d',(x,y,z,n)=>.18*T.MathUtils.smoothstep(y,.393,.413)*
    (.5+.5*Math.sin((x+z)*18))*Math.abs(n.y))];
  const lid=(g:Part)=>g.rotateX(Math.PI*.455).translate(.18,.426,.537);
  parts.push(paint(lid(profile([[.001,-.014],[.147,-.014],[.158,-.010],[.161,.002],[.157,.010],
    [.144,.015],[.119,.015],[.113,.009],[.001,.009]],[0,0,0],44)),'#414b3e','#939175'));
  for(const sign of [-1,1]) {
    parts.push(paint(lid(box([.079,.006,.009],[sign*.057,-.015,.036],.002).rotateY(sign*.36)),
      '#4e5746','#95937b'));
    parts.push(paint(lid(box([.029,.024,.046],[sign*.071,.002,.135],.008)),seam,ironEdge));
  }
  return batch(parts);
}

export function createCrewRoofPanel() {
  return batch([
    paint(profile([[.002,-.030],[.198,-.030],[.222,-.021],[.221,-.012],[.208,-.005],
      [.202,.014],[.189,.024],[.152,.024],[.144,.018],[.001,.018]],[0,0,0],48),'#4e574a','#83876b'),
    paint(piping([[-.049,.024,-.011],[-.041,.031,-.010],[-.013,.034,-.009],[.044,.030,-.010],[.050,.023,-.011]],.004),
      '#495348','#929483'),
  ]);
}

export const crewStationFinish=applyPaintedFinish(new T.MeshStandardMaterial({
  vertexColors:true,roughness:.90,metalness:.045,
}),{scale:3.1,strength:.53,edge:.32});
