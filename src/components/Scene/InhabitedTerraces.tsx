import { useEffect, useMemo } from 'react';
import * as T from 'three';
// Archived 1608 terrace: vertex pigments were baked against this sun.
// The live R3 horizon has a different bearing and does not mount this mesh.
const DAY_SUN_XZ=[Math.cos(1.14),Math.sin(1.14)] as const;
const DAY_SUN_RAY=[DAY_SUN_XZ[0]*Math.cos(.246),Math.sin(.246),DAY_SUN_XZ[1]*Math.cos(.246)] as const;
import {RidgeThatchFires,type RoofCombustionSite} from './RidgeThatchFires';

type P = [number, number, number];
type Spur = { x:number; z:number; drift:number; half:number; depth:number; floor:number; rise:number; beds:number; flag:number };
// Two fingers of one watershed, not a stack wrapped around the horizon. In
// particular the low V between their shoulders is deliberately left unplanted.
const spurs: Spur[] = [
  { x:-4, z:96, drift:-29, half:40, depth:47, floor:12.2, rise:2.55, beds:8, flag:1 },
  { x:36, z:109, drift:-7, half:24, depth:37, floor:13.4, rise:2.05, beds:6, flag:3 },
];
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
const noise=(x:number)=>{const n=Math.sin(29.73*x+8.41)*4267.87;return n-Math.floor(n);};
const COLS=20;
const TERRACE_BEARING=.94,cb=Math.cos(TERRACE_BEARING),sb=Math.sin(TERRACE_BEARING);
// Two unique elevation paintings, not a wrapping pattern. On the right
// bank the chart runs across the longhouse bluff (world -X). On the farther
// fingers it follows arc length around the valley. Branches are intervals of
// [across, toe, upper leaf line] in metres. All branches join their parent;
// clearings and scalloped edges are cut into masses, not made of leaf dots.
type Edge=[number,number,number];
const woods:Edge[][][]=[
  [ // Fields farther to the left: one wooded seam spanning several beds.
    [[60,16.2,16.3],[67,15.9,18.7],[75,17.2,21.3],[79,19.4,23.3],[82,19.7,23.2],
      [87,21.4,24.8],[89,22.1,24.7],[92,23.6,26.8],[96,25.3,27.0],[99,26.3,26.6]],
    [[76,18.4,19.2],[81,20.6,22.3],[84,21.8,24.8],[87,22.0,26.0],[89,22.7,25.8],
      [91,24.6,27.4],[94,26.3,27.9],[95,27.5,27.6]],
    [[99,21.3,21.5],[104,20.8,23.5],[108,22.2,25.8],[111,23.3,26.1],[114,25.0,28.1],
      [117,25.8,28.3],[119,27.0,29.5],[122,27.8,29.5],[125,29.2,29.4]]
  ],[ // Occupied bluff: the upper plantation cups an open rock cheek;
    // a second, deeper thicket wraps round the projecting nose into mist.
    [[5.4,11.5,11.6],[8.4,11.7,13.9],[10.5,12.1,15.5],[12.1,12.9,15.4],[13.0,13.4,16.1],
      [15.3,14.1,16.8],[16.3,14.9,16.7],[17.3,15.1,17.4],[19.0,15.8,17.5],
      [20.2,16.4,18.1],[21.5,16.9,18.0],[22.5,17.3,18.5],[23.8,18.1,18.4],[24.2,18.4,18.5]],
    [[11.0,13.6,14.6],[12.4,14.4,16.3],[13.5,15.3,17.2],[14.1,15.8,17.1],
      [14.9,16.1,17.7],[16.5,16.9,17.6],[17.3,17.4,17.5]],
    [[16.5,10.7,10.8],[19.6,10.1,12.4],[22.4,10.9,14.6],[24.0,11.7,14.9],
      [25.1,12.0,15.7],[27.0,13.1,15.9],[28.6,14.1,16.8],[30.4,14.8,16.9],
      [32.1,15.6,17.8],[33.2,16.6,17.7],[34.7,17.4,17.7],[35.1,17.6,17.7]]
  ]
];
const PANEL=256,TEX_H=128;
const chart=(bank:number,u:number,v:number)=>[(bank+clamp(bank?(u+6)/56:(u-42)/98))*.5,clamp((v+2)/40)];
function interval(edge:Edge[],u:number){
  if(u<edge[0][0]||u>edge[edge.length-1][0])return;
  let j=1;while(j<edge.length-1&&u>edge[j][0])j++;
  const [a,b]=[edge[j-1],edge[j]],f=(u-a[0])/(b[0]-a[0]);
  return [a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];
}
export function createWoodlandPaint(){
  const data=new Uint8Array(2*PANEL*TEX_H*4),t=new T.DataTexture(data,2*PANEL,TEX_H);
  for(let bank=0;bank<2;bank++)for(let x=0;x<PANEL;x++){
    const u=bank?-6+(x+.5)*56/PANEL:42+(x+.5)*98/PANEL;
    const rr=woods[bank].map(e=>interval(e,u)).filter((q):q is number[]=>!!q);
    if(!rr.length)continue;
    const curl=.17*Math.sin(.99*u+1.6*Math.sin(.64*u))+.13*Math.sin(2.73*u+.77);
    for(let y=0;y<TEX_H;y++){
      const v=-2+(y+.5)*40/TEX_H;
      let coverage=0,lit=0;
      for(const [toe,cap] of rr){
        // Stepped irregular canopy perimeter at the stock lens. Keep
        // warm patches INSIDE the common mass and away from its rim.
        const hi=cap+curl,lo=toe+.21*Math.sin(u*1.33+toe*.52),depth=(v-lo)/(hi-lo);
        const a=ease((v-lo+.12)/.71)*ease((hi-v+.18)/.34);
        if(a>coverage){
          coverage=a;
          lit=clamp(.23+.55*depth+.17*Math.sin(u*.67+depth*1.3)+.09*Math.cos(u*1.64-depth*.8));
        }
      }
      if(!coverage)continue;
      // A common pool of cool light keeps the woodland attached to the
      // hill. Moss in the interior gains a little olive, not an ochre rim.
      const i=(y*PANEL*2+bank*PANEL+x)*4,k=Math.round(lit*6)/6;
      data[i]=Math.round(81+20*k);data[i+1]=Math.round(91+18*k);
      data[i+2]=Math.round(86+7*k);data[i+3]=Math.round(211*coverage);
    }
  }
  t.name='Two nonrepeating valley woodland murals';t.colorSpace=T.SRGBColorSpace;
  t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.NearestFilter;t.generateMipmaps=true;t.needsUpdate=true;
  return t;
}
// Forest survives in the incised central drainage; crops survive on its
// shoulders. The same catchment controls relief and pigment across several beds.
function drainage(s:Spur,f:number,t:number) {
  const center=-.54+.37*t+.17*Math.sin(4.7*t+s.flag*.8);
  const channel=ease((.31-Math.abs(f-center))/.245);
  const fork=ease((.19-Math.abs(f-center-.44*(1-t)))/.155)*ease((.91-t)/.45);
  const pad=(u:number,v:number)=>ease((Math.hypot((f-u)/.22,(t-v)/.17)-1)/.64);
  const settled=s.flag===1?pad(.17,3.47/8)*pad(-.23,6.50/8):pad(.05,3.49/6);
  return Math.max(channel,.91*fork)*settled*ease((t+.1)/.20)*ease((1.04-t)/.20);
}
function shape(s:Spur,f:number,t:number):[number,number] {
  const bend=.11*Math.sin(t*4.8+s.flag), half=s.half*(.74+.17*Math.sin(t*2.9+.36)+.09*Math.cos(t*4.1+s.flag));
  const x=s.x+s.drift*t+f*half+Math.sign(f)*Math.max(0,Math.abs(f)-.48)**2*63+2.1*Math.sin(t*3.2+s.flag),
    z=s.z+s.depth*t+(f*f-.35)*6.8+f*(3.7+s.flag)+4.9*Math.sin(f*3.25+bend+s.flag)
      +2.7*Math.cos(f*5.8-t*1.8+s.flag)*(.42+t*.3);
  // Align the watershed with the bridge's actual diagonal approach, keeping
  // even its buried toe clear of the square playable perimeter at its corner.
  const radius=Math.hypot(x,z),outside=1+.85*Math.max(0,104-radius)/radius;
  return [(cb*x+sb*z)*outside,(cb*z-sb*x)*outside];
}
function cut(s:Spur,f:number,t:number){
  const left=.81+.09*Math.cos(t*4.7+s.flag),right=.88+.05*Math.sin(t*4.2+s.flag);
  return ease((f+left)/.32)*ease((right-f)/.29);
}
function floorY(s:Spur,j:number){return s.floor+j*s.rise+.47*Math.sin(j*1.53+s.flag);}
function level(s:Spur,f:number,t:number,y:number):P {
  const [x,z]=shape(s,f,t),shoulder=ease((1-Math.abs(f))/.31);
  // Grazing contour ends dissolve into a real sloping, tree-colored spur.
  // The cultivated part stays level along its own contour.
  // The gullies predate cultivation. Within them the flank follows a
  // continuous grade, not a stepped riser tinted the same shade as the bank.
  // Pinch out the beds down two branching watercourses. Keep their fields
  // genuinely level away from the catchment, including the house footings.
  const main=-.56+.42*t+.12*Math.sin(t*5.8+s.flag);
  const gully=ease((.23-Math.abs(f-main))/.19);
  const fork=ease((.15-Math.abs(f-main-.31*(1-t)))/.12)*ease((.96-t)/.55);
  // Settlers cut flat shelves for their stilt-house pads. Preserve those
  // parcels when eroding the drainage either side, so posts remain grounded.
  const pad=(u:number,v:number)=>ease((Math.hypot((f-u)/.20,(t-v)/.14)-1)/.68);
  const settled=s.flag===1?pad(.17,3.47/8)*pad(-.23,6.5/8):pad(.05,3.49/6);
  const wet=settled*Math.max(gully,.84*fork)*ease((t+.08)/.24)*ease((1.27-t)/.23);
  const smoothGrade=s.floor+s.beds*s.rise*t+.29*Math.sin(5*t+.9*s.flag)
    +1.7*Math.sin(f*5+t*2+s.flag)-wet*(4.4+1.9*Math.sin(2.8*t));
  const edge=ease((t+.29)/.29)*ease((1.54-t)/.29);
  const natural=-.76+shoulder*(Math.max(0,y+(smoothGrade-y)*edge)*(.71+.14*Math.cos(f*2.8+s.flag+t))+.26);
  const bed=y+(smoothGrade-y)*wet;
  const ravine=drainage(s,f,t),slope=s.floor+s.beds*s.rise*t-5.5-2.1*Math.sin(3.3*t);
  const surface=natural+(bed-natural)*cut(s,f,t);
  return [x,surface+ravine*(Math.min(surface,slope)-surface),z];
}

export function createInhabitedTerraces(){
  const pos:number[]=[],rgb:number[]=[],colors=new Map<string,T.Color>();
  const pigment=(hex:string)=>{let c=colors.get(hex);if(!c){c=new T.Color(hex);colors.set(hex,c);}return c;};
  const tri=(a:P,b:P,c:P,ca:T.Color,cb=ca,cc=ca)=>{
    pos.push(...a,...b,...c);rgb.push(ca.r,ca.g,ca.b,cb.r,cb.g,cb.b,cc.r,cc.g,cc.b);
  };
  const quad=(a:P,b:P,c:P,d:P,color:string)=>{const ink=pigment(color);tri(a,b,c,ink);tri(a,c,d,ink);};
  // The hills occupy just a thin slice of the driving frame. Paint at the
  // scale of a whole folded spur: one lee, one open rock plane, a few quiet
  // wooded tongues in their watercourses. Geometry, not brush-sized ovals,
  // breaks the light along the shelves. These colors are local to the soil.
  // Below the actual stock-camera solar break, the far range varies from
  // eucalyptus shadow to a grey lichen crest. Keep the nearer hill in that
  // family: gold is an incident-light note, not the color of all bare earth.
  const lee=pigment('#626e67'),earth=pigment('#777e6b'),sunFace=pigment('#918e70'),
    copse=pigment('#596761'),cutFace=pigment('#606b60'),riverAir=pigment('#75877f');
  const rock=(light:number,wood:number,earthCut:number,alt:number)=>{
    const ink=lee.clone().lerp(earth,ease(light/.92));
    return ink.lerp(copse,wood*.53).lerp(cutFace,earthCut)
      .lerp(riverAir,.39*ease((13-alt)/14));
  };
  for(const s of spurs){
    function strip(t0:number,y0:number,t1:number,y1:number,kind:'plot'|'lip'|'wall'|'brush'){
      const sample=(i:number,t:number,y:number):[P,T.Color]=>{
        const f=-1+2*i/COLS,point=level(s,f,t,y),ravine=drainage(s,f,t);
        const fold=f-(-.47+.40*t+.14*Math.sin(t*4.7+s.flag*.8));
        const cheek=ease((fold+.45)/.27)*(1-ease((fold+.12)/.25));
        const escarpment=ease((fold-.02)/.41)*(1-ease((fold-.63)/.54));
        const light=clamp(.25+.14*t+.59*cheek+.38*escarpment-.33*ravine);
        const wood=ravine*ease((.98-t)/.34)*(.83+.17*Math.sin(t*4.2+s.flag));
        const shelved=cut(s,f,t)*(.45+.55*escarpment)*(1-ravine);
        const dark=kind==='wall'?.075*shelved:kind==='brush'?.045:0;
        return [point,rock(light+(kind==='lip'?.012*shelved:0),wood,dark,point[1])];
      };
      for(let i=0;i<COLS;i++){
        const [a,ca]=sample(i,t0,y0),[b,cb]=sample(i+1,t0,y0),
          [c,cc]=sample(i+1,t1,y1),[d,cd]=sample(i,t1,y1);
        tri(a,d,b,ca,cd,cb);tri(b,d,c,cb,cd,cc);
      }
    }
    strip(-.29,-2.8,-.07,floorY(s,0)-2.9,'brush');
    strip(-.07,floorY(s,0)-2.9,0,floorY(s,0),'wall');
    for(let j=0;j<s.beds;j++){
      const y=floorY(s,j),t=j/s.beds,t2=(j+1)/s.beds,
        berm=.16+.05*noise(j+s.flag),rear=t2-.025;
      // The occupied shelves retain their complete lip and original footing
      // triangles. Elsewhere the harvested plot runs directly to its earth edge.
      if(j===3||j===6){
        strip(t,y+.13,t+.011,y+berm,'lip');
        strip(t+.011,y+berm,rear,y,'plot');
      }else strip(t,y+.13,rear,y,'plot');
      const crown=floorY(s,j+1)+.13,fringe=.33+.27*noise(j*2+s.flag);
      strip(rear,y,t2-.0045,crown-fringe,'wall');
      strip(t2-.0045,crown-fringe,t2,crown,'lip');
    }
    const peak=floorY(s,s.beds);
    strip(1,peak+.13,1.09,peak+.58,'brush');
    strip(1.09,peak+.58,1.24,peak-2.1,'brush');
    strip(1.24,peak-2.1,1.54,-1.4,'brush');
  }
  const nearStart=pos.length;
  // The near shoulder is separate from the two distant fields: its ridge
  // runs ACROSS the river, not around the camera. A narrow rock nose shelves
  // up toward the homestead, with a tributary cut breaking the longer flank.
  // Each station is [world x, crest elevation, front of bench]. The metres
  // of level ground in the centre are the actual pad for the longhouse.
  const stations=[
    [-69,3.0,114],[-61,11.5,111],[-54,17.1,108],[-47.8,18.4,103],
    [-44.3,19.0,100],[-40.5,19.8,97],[-37.4,18.65,94],[-34.7,19.7,92],
    [-31.9,20.30,90],[-29.5,19.2,88],[-26.6,19.8,85],[-24.4,20.35,81.3],[-20,20.5,80.4],
    [-14,20.55,81.0],[-10,17.4,83.3],[-6,16.4,85.6],[1,13.8,86.9],
    [7,11.5,91.6],[14,9.8,94.7],[21,6.0,99.8],[28,1.0,104.1],
  ];
  const benchRows=[
    [-11,.00],[-9,.26],[-7,.48],[-5.1,.58],[-4.5,.67],[-2.4,.70],
    [-1.4,.85],[0,.99],[3.8,1.0],[9.4,.994],[17,.86],[28,.53],[39,-.06],
  ];
  const hillFace=(i:number,j:number):[P,T.Color]=>{
    const [x,h,z]=stations[i],[off,r]=benchRows[j],f=clamp(1-Math.abs(j-4)/4.6);
    const drainage=ease(1-Math.abs(x+32+(1-r)*5)/7.8);
    const shoulder=Math.sin(i*1.64+j*.34)*1.25+Math.sin(i*.73-j*.67)*1.35;
    const toe=j<7?Math.pow(1-j/7,1.25)*Math.max(0,z-82)*.78:0;
    const pos:P=[x+f*(shoulder+drainage*1.2),
      j===0?-1.5:h*r-f*(4.7*drainage-.72*shoulder),
      z+off-toe+f*(3.6*drainage+shoulder*.76)];
    // The bank deposits its fan on the outside of the gully, easing the
    // abrupt notch into two smaller, overlapping shoulders in the distance.
    const fan=ease((x+34.7)/5.2)*ease((-26.6-x)/2.9)*ease((j-3)/3)*ease((11-j)/2);
    pos[1]+=1.13*fan;pos[2]-=.92*fan;
    // A warm prow below the homestead runs against a single leaning
    // shadow. Let the rest recede in long planes, not alternating strata.
    const phase=x+24+(1-r)*11,prow=ease((phase+11)/8)*(1-ease((phase-1)/18));
    const spur=ease((x+62+(1-r)*4)/10)*(1-ease((x+47+(1-r)*5)/13));
    const light=clamp(.23+.13*clamp(r)+.52*prow+.25*spur-.35*drainage);
    const ink=rock(light,drainage*ease((1.03-r)/.31),j===4||j===6?.075*prow:0,pos[1]);
    return [pos,ink];
  };
  // At the edge of the cultivated pad the cut bank gives way to loose
  // soil. Insert a seam along that oblique boundary, so the neighbouring
  // roof, veranda and ladder still stand on their exact surveyed triangles.
  type BluffPoint=[P,T.Color];
  const bankLine=([x,,z]:P)=>83.60-.84*(x+22.7)+1.6*ease((-24-x)/4)-z;
  function erode(p:P):P{
    const [x,y,z]=p,rim=ease(bankLine(p)/2.45),high=ease((y-9.5)/8.5);
    const knuckle=ease((x+30.3)/5.9)*ease((-17-x)/7.0);
    return [x,y-2.45*rim*high*knuckle,z+.80*rim*high*knuckle];
  }
  function bankTri(a:BluffPoint,b:BluffPoint,c:BluffPoint){
    const points=[a,b,c],dist=points.map(([p])=>bankLine(p));
    const emit=(q:BluffPoint[])=>tri(q[0][0],q[1][0],q[2][0],q[0][1],q[1][1],q[2][1]);
    if(points.every(([p])=>p[0]<-30.3)||points.every(([p])=>p[0]>-17)||
        points.every(([p])=>p[1]<9.5)||dist.every(d=>d<=0)){emit(points);return;}
    const worn=([p,c]:BluffPoint):BluffPoint=>[erode(p),c];
    if(dist.every(d=>d>=0)){emit(points.map(worn));return;}
    const field:BluffPoint[]=[],bank:BluffPoint[]=[];
    for(let i=0;i<3;i++){
      const k=(i+1)%3,n=points[i],m=points[k];
      if(dist[i]<=0)field.push(n);else bank.push(worn(n));
      if((dist[i]<=0)!==(dist[k]<=0)){
        const t=dist[i]/(dist[i]-dist[k]);
        const seam:BluffPoint=[n[0].map((v,j)=>v+t*(m[0][j]-v)) as P,n[1].clone().lerp(m[1],t)];
        field.push(seam);bank.push(seam);
      }
    }
    for(const side of [field,bank])for(let i=1;i<side.length-1;i++)emit([side[0],side[i],side[i+1]]);
  }
  for(let i=0;i<stations.length-1;i++)for(let j=0;j<benchRows.length-1;j++){
    const a=hillFace(i,j),b=hillFace(i+1,j),c=hillFace(i+1,j+1),d=hillFace(i,j+1);
    if((i+j)%3!==0){bankTri(a,d,b);bankTri(b,d,c);}
    else{bankTri(a,c,b);bankTri(a,d,c);}
  }
  function surfaceAt(x:number,z:number,limit:number,from=0,ink?:T.Color){
    let highest=-Infinity;
    for(let i=from;i<limit;i+=9){
      const a=pos[i],b=pos[i+2],dx1=pos[i+3]-a,dz1=pos[i+5]-b,dx2=pos[i+6]-a,dz2=pos[i+8]-b;
      const D=dx1*dz2-dx2*dz1;if(Math.abs(D)<1e-7)continue;
      const u=((x-a)*dz2-(z-b)*dx2)/D,v=(dx1*(z-b)-dz1*(x-a))/D;
      if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001){
        const h=pos[i+1]+u*(pos[i+4]-pos[i+1])+v*(pos[i+7]-pos[i+1]);
        if(h>highest){
          highest=h;
          if(ink){
            const channel=(k:number)=>(1-u-v)*rgb[i+k]+u*rgb[i+3+k]+v*rgb[i+6+k];
            ink.setRGB(channel(0),channel(1),channel(2));
          }
        }
      }
    }
    return highest;
  }
  // An oblique nearer rib descends into the frame's existing treeline. The
  // old radial shoulder terminated under a sheared-off plateau edge. This
  // limb projects in front of its parent, separated by a short shaded cleft;
  // it is broad at the crest and pinches away well beneath the tree crowns.
  const oldFaceEnd=pos.length;
  const rib=[[-24.6,83.1,1.2,.16],[-26.8,81.0,3.7,1.85],[-29.3,79.2,4.8,3.7],
    [-32.6,77.6,5.6,4.35],[-35.7,76.9,4.7,3.65],[-38.1,75.2,4.15,2.95],
    [-41.8,74.1,3.8,2.4],[-46.4,73.4,2.6,1.7],[-50.3,73.9,1.4,.24]];
  const flank=[[-1,0],[-.81,.17],[-.49,.57],[-.09,.92],[.12,1],[.36,.67],[.7,.24],[1,0]];
  const ribPoint=(i:number,j:number):[P,T.Color]=>{
    const [x,z,w,r]=rib[i],[off,relief]=flank[j],prev=rib[Math.max(0,i-1)],next=rib[Math.min(i+1,rib.length-1)],
      dx=next[0]-prev[0],dz=next[1]-prev[1],norm=Math.hypot(dx,dz),
      px=x-off*w*dz/norm,pz=z+off*w*dx/norm,
      substrate=new T.Color(),base=surfaceAt(px,pz,oldFaceEnd,0,substrate),fit=Number.isFinite(base)?base:-1.5;
    const h=fit+r*relief+.13*Math.sin(i*1.9+j*.4)*relief-.17*(1-relief);
    const ridge=ease((off+.88)/.89)*(1-ease((off-.13)/.44)),
      exposure=.28+.43*ridge+.09*Math.cos(i*.52)-.10*ease((off-.15)/.48);
    const ink=rock(exposure,.55*ease((off-.21)/.48),.045*(1-relief),h);
    if(Number.isFinite(base))ink.lerp(substrate,.65-.15*relief);
    return [[px,h,pz],ink];
  };
  for(let i=0;i<rib.length-1;i++)for(let j=0;j<flank.length-1;j++){
    const [a,ca]=ribPoint(i,j),[b,cb]=ribPoint(i+1,j),[c,cc]=ribPoint(i+1,j+1),[d,cd]=ribPoint(i,j+1);
    tri(a,d,b,ca,cd,cb);tri(b,d,c,cb,cd,cc);
  }
  const groundEnd=pos.length;
  // The broad river-facing cheek is in skylight, even when its elevation
  // reaches the crest. Bake a small brass-olive reflection only on actual
  // planes turned toward the low key. Never trace an altitude or silhouette.
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),key=new T.Vector3(...DAY_SUN_RAY),
    glaze=new T.Color();
  for(let i=0;i<groundEnd;i+=9){
    a.fromArray(pos,i);b.fromArray(pos,i+3).sub(a);c.fromArray(pos,i+6).sub(a);
    const n=b.cross(c).normalize();if(n.y<0)n.negate();
    const gather=.48*ease((n.dot(key)-.13)/.68);
    if(!gather)continue;
    for(let k=i;k<i+9;k+=3)glaze.fromArray(rgb,k).lerp(sunFace,gather).toArray(rgb,k);
  }
  function ground(x:number,z:number){
    const h=surfaceAt(x,z,groundEnd);
    if(!Number.isFinite(h))throw Error('Unrooted terraced valley decoration');
    return h;
  }
  function post(x:number,z:number,bottom:number,top:number,r:number){
    const lo:P[]=[[x-r,bottom,z-r],[x+r,bottom,z-r],[x+r,bottom,z+r],[x-r,bottom,z+r]],
      hi:P[]=lo.map(([px,,pz])=>[px,top,pz]);
    for(let i=0;i<4;i++)quad(lo[i],lo[(i+1)%4],hi[(i+1)%4],hi[i],i<2?'#525f64':'#646866');
  }
  // A real sequence of short raised allotments climbs only the cultivated
  // half of the shoulder. The creek side is left uncut; the ridge must not
  // become a set of concentric cake layers. Each lip returns to the slope.
  const plots:{x:number;end:number;z:number;depth:number;phase:number}[]=[
    {x:-24.5,end:-14.9,z:78.8,depth:.53,phase:1.3},{x:-14.4,end:-6.8,z:80.0,depth:.52,phase:2.7},
    {x:-22.7,end:-11.6,z:77.3,depth:.55,phase:2.2},{x:-13.9,end:-7.3,z:76.9,depth:.44,phase:.4},
    {x:-19.8,end:-11.9,z:75.3,depth:.47,phase:1.7},
  ];
  for(const {x,end,z,depth,phase} of plots){
    const cross=(t:number)=>{
      const px=x+(end-x)*t,back=z+.58*Math.sin(4.2*t+phase)+.56*t,blend=ease(Math.min(t,1-t)/.19),
        front=back-depth*(.22+.78*blend),yb=ground(px,back)+.035,yf=ground(px,front),
        lip=Math.max(yf+.028,yb+Math.min(0,yf-yb)*(.84-.5*blend));
      return [[px,yb,back],[px,lip,front],[px,yf-.06,front]] as [P,P,P];
    };
    for(let j=0;j<9;j++){
      const a=cross(j/9),b=cross((j+1)/9);
      quad(a[0],b[0],b[1],a[1],['#505c4b','#565d4b','#5b604c'][Math.floor(j/3+phase)%3]);
      quad(a[1],b[1],b[2],a[2],j%5===0?'#505343':'#485044');
    }
  }
  // The worn switchback continues from the bottom of the veranda ladder
  // to the worked plots. Thin, irregular, clay-coloured segments follow
  // the true slope; the route is not a floating strip below the horizon.
  const trail=[[-22.1,83.7],[-21.7,82.25],[-19.2,81.15],[-14.4,80.5],[-10.2,81.1],[-8.7,80.2],
    [-10.7,79.25],[-14,78.25],[-17.3,77.1],[-19.3,76.05],[-18.2,75.08],[-16.1,74.08],[-12.1,73.9]];
  for(let i=1;i<trail.length;i++){
    const [x,z]=trail[i-1],[x1,z1]=trail[i],dx=x1-x,dz=z1-z,len=Math.hypot(dx,dz),steps=Math.ceil(len/.75);
    const cut=(t:number,side:number):P=>{const width=.13+.047*Math.sin(i*.8+t);
      const px=x+dx*t-dz/len*side*width,pz=z+dz*t+dx/len*side*width;
      return [px,ground(px,pz)+.045,pz];};
    for(let j=0;j<steps;j++)quad(cut(j/steps,-1),cut((j+1)/steps,-1),cut((j+1)/steps,1),cut(j/steps,1),i%4===0?'#5e604f':'#5b5e4e');
  }
  const dwellings:{role:'field-house'|'ridge-longhouse';center:P;footings:P[];roofPeak:P;begin:number;end:number}[]=[];
  // Only actual planes in the lee of the roof are marked, never a border
  // around a house. Their separation must survive the shared valley pigment.
  const roofShade:{from:number;to:number;value:number}[]=[];
  const shadowPlane=(from:number,value:number)=>roofShade.push({from,to:rgb.length,value});
  function homestead(s:Spur,f:number,t:number,w:number,d:number,yaw:number,hue:number){
    const [cx,cz]=shape(s,f,t),c=Math.cos(yaw-TERRACE_BEARING),n=Math.sin(yaw-TERRACE_BEARING),begin=pos.length/3;
    const Pm=(u:number,y:number,v:number):P=>[cx+c*u-n*v,y,cz+n*u+c*v];
    const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
    const feet=corners.map(([u,v])=>{const [x,,z]=Pm(u,0,v);return [x,ground(x,z),z] as P;});
    // Move the eave DOWN within the original envelope: more sloping thatch
    // and less vertical wall, without raising the ridge or widening the hut.
    const floor=Math.max(...feet.map(p=>p[1]))+.56,eave=floor+1.12,ridge=floor+2.93;
    for(const [x,y,z] of feet)post(x,z,y-.13,floor+.03,.10);
    // Shadow beneath the eaves, sun on woven bamboo walls, no glass or markers.
    const walls=['#514d49','#77624c','#625a50','#454849'],wallStart=rgb.length;
    for(let i=0;i<4;i++){
      const [u,v]=corners[i],[u2,v2]=corners[(i+1)%4];
      quad(Pm(u,floor,v),Pm(u2,floor,v2),Pm(u2,eave,v2),Pm(u,eave,v),walls[(i+hue)%4]);
    }
    shadowPlane(wallStart,.72);
    quad(Pm(-.40,floor,-d/2-.02),Pm(.48,floor,-d/2-.02),Pm(.48,eave-.17,-d/2-.02),Pm(-.40,eave-.17,-d/2-.02),'#4c5a60');
    // Long hipped thatch with sag and a projecting, darker eave; the broken
    // ridge is geometry, not a billboard crossed with a second billboard.
    const xw=w*.5+.48,zd=d*.5+.47;
    const roof=['#9a784d','#826348','#93714c'];
    for(const side of [-1,1]){
      const line=(x:number,k:number):P=>Pm(x,eave+.23+(1-k)*(ridge-eave-.19)-.15*Math.sin(Math.PI*(x+xw)/(2*xw)),
        side*zd*k);
      const end0=Pm(-xw,eave+.07,side*zd),end1=Pm(xw,eave+.07,side*zd);
      const ridge0=line(-xw*.69,0),ridge1=line(xw*.71,0);
      const mid=line(xw*.08,.66),eave0=line(-xw*.08,1);
      const face=rgb.length;
      tri(end0,ridge0,mid,pigment(roof[hue]));tri(ridge0,ridge1,mid,pigment(roof[(hue+1)%3]));
      tri(mid,ridge1,end1,pigment(side<0?'#7a614a':'#565450'));tri(end1,eave0,mid,pigment(roof[hue]));tri(eave0,end0,mid,pigment(roof[hue]));
      // At the stock lens these are ~30-50 px wide. One continuous patch
      // of damp, sheltered thatch reads as a pitched roof; thin stripes and
      // hot ridge-marks merge with the tiny fire. Darken existing pigment,
      // never extend the silhouette or lift its lit half.
      if(side<0)shadowPlane(face,hue===0?.43:.48);
      const edge=rgb.length,drop=side<0?.41:.035;
      quad(end0,end1,Pm(xw,eave-drop,side*zd),Pm(-xw,eave-drop,side*zd),'#494b4a');
      if(side<0)shadowPlane(edge,.30);
    }
    for(const sign of [-1,1]){
      const hip=rgb.length;
      tri(Pm(sign*xw,eave+.07,-zd),Pm(sign*xw,eave+.07,zd),Pm(sign*xw*(sign<0?.69:.71),ridge,0),pigment('#797970'));
      shadowPlane(hip,sign<0?.58:.72);
    }
    // A lower shaded porch breaks one silhouette; two open-front posts are
    // visible below the lighter roof plane and terminate on the actual terrace.
    if(hue!==1){
      const edge=-d/2-.99;
      quad(Pm(-w*.42,eave-.25,-d/2),Pm(w*.32,eave-.25,-d/2),Pm(w*.32,eave-.52,edge),Pm(-w*.42,eave-.52,edge),'#837d72');
      for(const u of [-w*.40,w*.30]){const [x,,z]=Pm(u,0,edge);post(x,z,ground(x,z)-.10,eave-.53,.065);}
    }
    dwellings.push({role:'field-house',center:[cx,floor,cz],footings:feet,roofPeak:Pm(0,ridge,0),begin,end:pos.length/3});
  }
  // The two houses stay on their original contour shelves. Slide them
  // 4.1 m / 2.1 m along the parcels; the old roof rays intersected the
  // foreground jungle on approach / at midspan. No enlargement, raising,
  // vegetation pruning or camera adjustment.
  homestead(spurs[0],.03,.40175,5.7,2.9,.16,0);
  homestead(spurs[0],-.202,.78050,4.7,2.6,-.13,2);
  // Longhouse on the bridge approach: its veranda and underside must read
  // independently below the thatch at the original driving distance. The
  // cane cladding, woven shutter, king post, landing and braces are all
  // surfaces in the same static mesh as the terrain, not decals or sprites.
  {
    const cx=-19.2,cz=86.9,yaw=-.63,c=Math.cos(yaw),s=Math.sin(yaw),begin=pos.length/3;
    const pt=(u:number,y:number,v:number):P=>[cx+c*u-s*v,y,cz+s*u+c*v];
    const anchor=(u:number,v:number):P=>{const [x,,z]=pt(u,0,v);return [x,ground(x,z),z];};
    const feet=[[-4.3,-2.15],[4.3,-2.15],[4.3,1.9],[-4.3,1.9],[-4.3,-2.97],[3.95,-2.97]].map(([u,v])=>anchor(u,v));
    const deck=Math.max(...feet.map(q=>q[1]))+1.14,eave=deck+2.15,top=eave+2.15;
    const box=(x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,palette:string[])=>{
      const lo=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
      for(let i=0;i<4;i++){
        const [u,v]=lo[i],[u2,v2]=lo[(i+1)%4];
        quad(pt(u,y0,v),pt(u2,y0,v2),pt(u2,y1,v2),pt(u,y1,v),palette[i%palette.length]);
      }
      quad(pt(x0,y1,z0),pt(x0,y1,z1),pt(x1,y1,z1),pt(x1,y1,z0),palette[palette.length-1]);
    };
    const timber=['#403a36','#705e48','#49473f','#4e4239','#806e55'];
    const beam=(a:P,b:P,r:number,col:string)=>{
      const u=new T.Vector3(...b).sub(new T.Vector3(...a)).normalize();
      const cross=new T.Vector3(0,0,1);if(Math.abs(u.z)>.9)cross.set(1,0,0);
      const v=u.clone().cross(cross).normalize().multiplyScalar(r),n=u.clone().cross(v).normalize().multiplyScalar(r);
      const band=(p:P,i:number):P=>[p[0]+(i<2?v.x:-v.x)+(i%3?n.x:-n.x),p[1]+(i<2?v.y:-v.y)+(i%3?n.y:-n.y),p[2]+(i<2?v.z:-v.z)+(i%3?n.z:-n.z)];
      for(let i=0;i<4;i++)quad(band(a,i),band(a,(i+1)%4),band(b,(i+1)%4),band(b,i),col);
    };
    for(const [x,y,z] of feet)post(x,z,y-.10,deck+.08,.13);
    for(const side of [-1,1]){
      const u=side*4.22;beam(pt(u,deck-1.0,-2.91),pt(u-side*1.05,deck,-2.91),.075,'#7b6954');
    }
    box(-4.58,4.60,deck-.24,deck,-3.15,2.15,timber);
    // Wall set back behind the verandah. An open entrance and a single
    // shutter are broad enough to survive the frame's pixel grid.
    box(-4.19,4.19,deck,eave,-1.48,1.90,['#655343','#705f4b','#544e40','#544c40','#554838']);
    box(-4.21,4.21,eave-.43,eave-.02,-1.50,1.92,['#584c3f','#71644d','#53483e','#493f37']);
    for(let j=0;j<14;j++){
      const v=-1.44+j*.234,age=noise(j*7+2);
      quad(pt(4.205,deck+.09,v),pt(4.205,deck+.09,v+.023),pt(4.205,eave-.4-.32*age,v+.036),pt(4.205,eave-.37,v),j%5===0?'#93806a':'#594e40');
    }
    box(4.19,4.245,deck+.67,eave-.63,-.68,.40,['#473f36','#403c33','#62513c']);
    box(4.22,4.27,deck+.63,deck+.72,-.75,.46,timber);
    box(-.85,.50,deck,eave-.24,-1.52,-1.48,['#383b3b']);
    box(1.35,2.76,deck+.78,eave-.44,-1.53,-1.49,['#55544b']);
    for(const u of [-3.62,-2.42,-1.38,3.52])box(u,u+.075,deck,eave-.12,-1.56,-1.49,['#9a7e5a']);
    for(let row=0;row<7;row++){
      const y=deck+.13+row*.224;
      for(const [start,end] of [[-4.11,-.96],[.58,1.2],[2.87,4.12]]){
        const k=noise(row*31+start*7);
        quad(pt(start+.2*k,y,-1.512),pt(end-.09*k,y+.02,-1.512),
          pt(end-.11*k,y+.057,-1.512),pt(start+.2*k,y+.044,-1.512),row%3===0?'#917552':'#79634b');
      }
    }
    for(const u of [-4.34,-1.37,4.05]){
      box(u-.085,u+.085,deck,eave-.10,-2.92,-2.75,timber);
    }
    for(const [u1,u2] of [[-4.30,-1.50],[.65,4.05]]){
      box(u1,u2,deck+.53,deck+.65,-2.96,-2.79,timber);
      for(const u of [u1+.65,u2-.50])box(u-.05,u+.05,deck,deck+.61,-2.93,-2.80,timber);
    }
    const eaveX=4.98,ridgeX=3.30,gableX=4.86,front=-3.13,back=2.72;
    // Partial hip with a high central ridge, rolled cap and drooped straw
    // overhang. Pigment follows the planes and their individual bundles;
    // the front stays umber under the edge lit by the (+X,+Z) sunset.
    for(const side of [-1,1]){
      const lip=side<0?front:back;
      const roofP=(t:number,k:number):P=>{
        const sag=.15*Math.sin(t*Math.PI),straw=.076*Math.sin(t*26+side*.82);
        const left=-ridgeX-(eaveX-ridgeX)*k,right=gableX+(eaveX-gableX)*k;
        const u=left+(right-left)*t;
        return pt(u,top+(eave-top)*k-sag*(1-.6*k)+straw*k*k,lip*k+.14*(1-k));
      };
      const straw=side<0?['#796653','#74604e','#816a53','#735f4c','#816b54','#756552']
        :['#9f8863','#978364','#a28a67','#9b8462','#89785d','#9b845e'];
      for(let i=0;i<12;i++){
        const t=i/12,t2=(i+1)/12;
        const face=rgb.length;
        quad(roofP(t,0),roofP(t2,0),roofP(t2,.67),roofP(t,.67),straw[(i*5)%6]);
        quad(roofP(t,.67),roofP(t2,.67),roofP(t2,1),roofP(t,1),straw[(i*5+2)%6]);
        if(side<0)shadowPlane(face,.80);
        const a=roofP(t,1),b=roofP(t2,1);
        // A single sheltered eave reads at driver distance where individual
        // rafter ends disappear. Deepen it inward, never enlarge the roof.
        const edge=rgb.length,drop=side<0?.57:.42;
        quad(a,b,[b[0],b[1]-drop,b[2]],[a[0],a[1]-drop-.04,a[2]],'#303d3e');
        if(side<0)shadowPlane(edge,.46+.11*(i/11));
      }
      // Fine irregular reeds follow the changing pitch rather than repeating
      // the twelve structural roof faces as high-contrast yellow boards.
      for(let i=0;i<68;i++){
        const t=.012+.974*noise(i*4+6),k=.04+.65*noise(i*4+7),end=Math.min(1,k+.14+.41*noise(i*4+8));
        const high=(u:number,v:number):P=>{const a=roofP(u,v);a[1]+=.025;return a;};
        quad(high(t,k),high(t+.0036,k),high(t+.0060,end),high(t+.0008,end),i%4===0?'#a58963':i%3===0?'#665c4c':'#927c5c');
      }
      for(let i=0;i<29;i++){
        const t=(i+.22*noise(i+11))/30,a=roofP(t,1),b=roofP(t+.026,1),d=roofP(t+.010,1);
        d[1]-=.14+.17*noise(13+i*2);tri(a,b,d,pigment(i%4===0?'#a08460':'#7c654d'));
      }
    }
    const hip=pt(-ridgeX,top,.14),tip0=pt(-eaveX,eave,front),tip1=pt(-eaveX,eave,back),hipFold=pt(-eaveX+.36,eave+.48,.4);
    tri(hip,tip0,hipFold,pigment('#76644e'));tri(hip,hipFold,tip1,pigment('#84725a'));tri(tip0,tip1,hipFold,pigment('#716249'));
    // Near end is an inset woven gable, unlike the far hip. The long two
    // roof rakes cast a dark frame across the warm triangular wall; at a
    // three-quarter angle the second surface and open porch are visible.
    const peak=pt(4.29,top-.23,.14),endA=pt(4.29,eave-.07,front+.25),endB=pt(4.29,eave-.07,back-.25);
    const gableShade=rgb.length;tri(peak,endA,endB,pigment('#80694a'));shadowPlane(gableShade,.74);
    beam(pt(gableX,top,.14),pt(eaveX,eave-.035,front),.105,'#6e5b44');
    beam(pt(gableX,top,.14),pt(eaveX,eave-.035,back),.105,'#927951');
    beam(endA,endB,.09,'#65553e');beam(pt(4.31,eave+.12,.14),pt(4.31,top-.29,.14),.08,'#5d5341');
    for(const side of [-1,1])beam(pt(4.31,eave+.12,.14+side*1.73),pt(4.31,eave+1.18,.14+side*.38),.056,'#65573f');
    for(const u of [-.54,.32]){
      const y=eave+.43;quad(pt(4.32,y,u),pt(4.32,y,u+.46),pt(4.32,y+.46,u+.46),pt(4.32,y+.46,u),'#493f32');
    }
    beam(pt(-ridgeX,top+.025,.14),pt(0,top-.10,.14),.10,'#a28b69');
    beam(pt(0,top-.10,.14),pt(gableX,top+.025,.14),.10,'#a28b69');
    for(const u of [-1.26,.41]){
      const a=anchor(u,-4.30);beam(a,pt(u,deck+.05,-3.1),.076,'#78654d');
    }
    const ladderToe=anchor(-.43,-4.30);
    for(const k of [.22,.51,.80]){
      const z=-4.30+1.20*k,y=ladderToe[1];
      beam(pt(-1.26,y+(deck-y)*k,z),pt(.41,y+(deck-y)*k,z),.065,'#9a805d');
    }
    dwellings.push({role:'ridge-longhouse',center:[cx,deck,cz],footings:feet,roofPeak:pt(0,top-.10,.14),begin,end:pos.length/3});
  }
  // Forced perspective belongs to the out-of-bounds settlement, not to the
  // ordinary village or the tank camera. Shrink around each occupied parcel.
  // Re-survey every stilt: scaling toward a single plane on this uneven
  // terrain would leave the downhill supports hanging above the bank.
  const burns:RoofCombustionSite[]=[];
  for(const [id,d] of dwellings.entries()){
    const k=[.48,.45,.355][id],stilt=[.28,.27,.39][id],ox=d.center[0],oz=d.center[2],oldDeck=d.center[1];
    const newXZ=(x:number,z:number):[number,number]=>[ox+(x-ox)*k,oz+(z-oz)*k];
    const feet=d.footings.map(([x,,z]):P=>{const [a,b]=newXZ(x,z);return [a,ground(a,b),b];});
    const newDeck=Math.max(...feet.map(f=>f[1]))+stilt;
    const settled=(x:number,y:number,z:number):P=>{
      const [a,b]=newXZ(x,z);let h=newDeck+(y-oldDeck)*k;
      if(y<oldDeck-.035){const rise=Math.max(.05,oldDeck-ground(x,z));h=newDeck+(y-oldDeck)*(newDeck-ground(a,b))/rise;}
      return [a,h,b];
    };
    d.roofPeak=settled(...d.roofPeak);d.center=[ox,newDeck,oz];d.footings=feet;
    for(let i=d.begin*3;i<3*d.end;i+=3){const [x,y,z]=settled(pos[i],pos[i+1],pos[i+2]);pos[i]=x;pos[i+1]=y;pos[i+2]=z;}
    // Sample the topmost thatch triangles rather than the bounding box or the
    // ridge peak. Both fire pockets must issue THROUGH the roof, including
    // on the 3/4 approach; smoke and fire share the first of these roots.
    const yaw=[.16-TERRACE_BEARING,-.13-TERRACE_BEARING,-.63][id],c=Math.cos(yaw),s=Math.sin(yaw);
    const roofRoot=(u:number,v:number):P=>{
      const x=ox+(u*c-v*s)*k,z=oz+(u*s+v*c)*k,h=surfaceAt(x,z,d.end*3,d.begin*3);
      if(!Number.isFinite(h)||h<=newDeck)throw new Error('Missing thatch beneath distant fire');
      return [x,h-.055,z];
    };
    // Put the small burn to one side of each field roof. The flame and
    // smoke remain joined but do not mask the apex or divide the roof in two.
    const breach=roofRoot(id===2?-1.55:-1.48,id===2?-.72:-.69),eave=roofRoot(id===2?.88:-.80,-1.10);
    const size=[.82,.66,1][id];burns.push({breach,eave,size,seed:id+1});
    const soot=pigment('#423e39'),blueBounce=pigment('#647771');
    for(let i=d.begin*3;i<d.end*3;i+=3){
      const [x,y,z]=[pos[i],pos[i+1],pos[i+2]],dist=Math.min(
        Math.hypot(x-breach[0],z-breach[2],(y-breach[1])*.82),
        1.27*Math.hypot(x-eave[0],z-eave[2],(y-eave[1])*.82));
      const stain=.76*ease(1-dist/(1.25*size));
      rgb[i]+=(soot.r-rgb[i])*stain;rgb[i+1]+=(soot.g-rgb[i+1])*stain;rgb[i+2]+=(soot.b-rgb[i+2])*stain;
      // At 40–60 pixels wide these planes should read as a roof above one
      // shadow, not individual boards punched out against the hill. Cool the
      // reflected light under the thatch more than its sun-facing crest.
      // Fire itself is a separate material, so it keeps its tiny hot core.
      const exposed=clamp((y-newDeck)/Math.max(.1,d.roofPeak[1]-newDeck));
      const bounce=.41-.18*exposed;
      rgb[i]+=(blueBounce.r-rgb[i])*bounce;rgb[i+1]+=(blueBounce.g-rgb[i+1])*bounce;rgb[i+2]+=(blueBounce.b-rgb[i+2])*bounce;
    }
  }
  // The raised plots and the footpath belong to the same hillside. In the
  // old mesh they picked up unmodulated green air and turned into a bright
  // detached chevron. Borrow the underlying triangle's mineral color so a
  // path return remains visible by a small change of value, not by hue.
  const ink=new T.Color(),plotsEnd=dwellings[0].begin*3;
  for(let i=groundEnd;i<plotsEnd;i+=3){
    surfaceAt(pos[i],pos[i+2],groundEnd,0,ink);
    const worn=clamp((rgb[i]-.06)/.08);
    ink.multiplyScalar(.94+.12*worn).toArray(rgb,i);
  }
  // Dwellings keep the original settlement air, exactly. The orchard is
  // represented by branching woodland masses in the soil paint above,
  // not separate inflated crowns clipped against the ridge.
  const smokeAir=pigment('#879589'),solarAir=pigment('#ab986f'),layerInk=new T.Color();
  for(let i=plotsEnd;i<pos.length;i+=3){
    const x=pos[i],y=pos[i+1],z=pos[i+2],distance=Math.hypot(x,z);
    const back=clamp((distance-70)/75),low=clamp(1-y/29);
    const facing=clamp(((x*DAY_SUN_XZ[0]+z*DAY_SUN_XZ[1])/Math.max(1,distance)-.65)/.35);
    layerInk.fromArray(rgb,i).lerp(smokeAir,.18+.22*back+.07*low)
      .lerp(solarAir,(.055+.20*back)*facing*facing).toArray(rgb,i);
  }
  // Preserve the cool air hue already on the roof. A single grouped shadow
  // facing the river — rather than outlining beams, doors and straw — keeps
  // the roof readable as one shape in the unaltered driving view.
  for(const {from,to,value} of roofShade)for(let i=from;i<to;i++)rgb[i]*=value;
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
  const uv:number[]=[];
  for(let i=0;i<pos.length;i+=3){
    if(i>=plotsEnd){uv.push(.5/(PANEL*2),.5/TEX_H);continue;}
    const bank=i<nearStart?0:1;
    uv.push(...chart(bank,bank?-pos[i]:120*Math.atan2(pos[i+2],pos[i]),pos[i+1]));
  }
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.computeBoundingBox();g.computeBoundingSphere();
  g.userData.dwellings=dwellings;g.userData.groundVertices=groundEnd/3;g.userData.roofBurns=burns;
  return g;
}
export function InhabitedTerraces(){
  const ground=useMemo(createInhabitedTerraces,[]),map=useMemo(createWoodlandPaint,[]);
  const material=useMemo(()=>{
    const m=new T.MeshBasicMaterial({map,vertexColors:true,side:T.DoubleSide,fog:false});
    // The paint's alpha is pigment coverage, NOT terrain opacity. Keep all
    // benches opaque, and let their relief remain readable through woods.
    m.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>','')
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec4 woodland=texture2D(map,vMapUv);
        diffuseColor.rgb=mix(diffuseColor.rgb,woodland.rgb,woodland.a);`);};
    m.customProgramCacheKey=()=>'settled-wooded-spurs-01';return m;
  },[map]);
  useEffect(()=>()=>{ground.dispose();map.dispose();material.dispose();},[ground,map,material]);
  return <><mesh name="sunlit-paddy-spurs-and-stilt-homesteads" geometry={ground} material={material}/>
    <RidgeThatchFires sites={ground.userData.roofBurns}/></>;
}
