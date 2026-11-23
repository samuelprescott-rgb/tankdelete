import * as T from 'three';
import {coordinateNoise} from './environmentGeneration';
import {createRiverCrossings, sampleRiverStation, type RiverStation} from './riverLayout';
import {RIVER_WATER_Y as water} from './riverVerticalSection';
import {createTankGroundProfile} from '../../lib/tankGroundProfile';

type P=[number,number,number];
type Survey=[number,number,number,number,number,number,number,number];
// Stone-by-stone survey: shore, station, setback (negative is in the stream),
// long/short radii, exposed height, bedding angle, lithology. Negative bank
// has a broken ledge and a washed-out fig stool. Opposite is a flatter shingle
// spit with two detached heads. Gaps between families are empty on purpose.
const ledges:Survey[]=[
  [-1,5.42,.28,1.04,.52,.36,-.31,1],[-1,5.69,-.13,.56,.25,.144,.53,0],
  [-1,5.85,.55,.79,.33,.30,-.48,2],[-1,5.91,-.32,.31,.17,.047,.44,0],
  [-1,5.96,-.46,.24,.16,.016,.53,0],[-1,8.86,.32,.85,.48,.24,-.49,2],
  [1,4.79,.16,.70,.28,.14,-.81,0],[1,4.98,-.08,.43,.14,.063,-.68,0],
  [1,5.07,-.19,.39,.15,.027,-.87,0],
  [1,8.63,.35,.94,.36,.29,-.46,2],[1,8.96,-.087,.55,.34,.19,.53,1],
  [1,9.09,-.28,.36,.22,.059,.61,0],
  [-1,12.60,.34,.70,.38,.21,-.23,2],[-1,13.32,.24,1.19,.65,.42,-.25,1],
  [-1,13.57,-.16,.57,.27,.17,.39,0],[-1,13.74,-.41,.37,.17,.041,.48,0],
  [-1,13.84,-.46,.22,.14,.012,.56,0],[-1,13.87,.52,.93,.37,.29,-.51,2],
  [-1,15.64,.39,.71,.40,.25,-.30,2],
  [1,14.56,.36,.64,.32,.18,-.45,2],[1,16.71,.24,.81,.42,.27,-.53,1],
];
// Three real plan outlines: oblique fractured slate, rounded porphyry,
// and a shelf with an angular broken nose. Front and back faces are not mirrors.
const outlines=[
  [[-1,-.23],[-.62,-.86],[.16,-1],[.88,-.64],[1,.15],[.60,.75],[-.36,.89],[-.93,.47]],
  [[-.98,-.36],[-.45,-.96],[.36,-.88],[.88,-.45],[.98,.33],[.48,.88],[-.23,.98],[-.88,.64]],
  [[-.91,-.42],[-.58,-.84],[.26,-.92],[.87,-.33],[1,.49],[.46,.67],[-.12,.92],[-1,.34]],
];
const lithology=[
  ['#4d595b','#627175','#758080','#888985','#96958a'],
  ['#54595a','#677075','#7e807e','#968b80','#a3998c'],
  ['#535951','#606a61','#777969','#8d8975','#97917b'],
];
// CPU bake from the actual upper triangles, not a procedurally painted mask.
// This one small static texture drives bed contact, foam, and reflected rocks.
const X0=-24,Z0=2,DX=34,DZ=18,NX=384,NZ=224,HMAX=1.4;
export const BANK_MAP_FRAME=new T.Vector4(X0,Z0,1/DX,1/DZ);
export function createScouredBank(stations:RiverStation[],seed:number) {
  const pos:number[]=[],color:number[]=[],figure:number[]=[],brush:number[]=[],ink=new T.Color();
  const woodUV=new Map<P,[number,number]>();
  const heights=new Float32Array(NX*NZ).fill(-4),tones=new Float32Array(NX*NZ);
  const samples=Float32Array.from({length:NX*NZ},()=>1e4);
  const ground=createTankGroundProfile(stations,seed);
  const bridge=createRiverCrossings(stations).find(c=>c.kind==='bridge')!;
  const edge=(z:number,side:number)=>{const s=sampleRiverStation(stations,z)!;return s.centerX+side*s.waterHalfWidth;};
  function frame(z:number,side:number,d:number){
    const tangent=new T.Vector2(edge(z+.18,side)-edge(z-.18,side),.36).normalize(),
      normal=new T.Vector2(tangent.y*side,-tangent.x*side);
    return {x:edge(z,side)+d*normal.x,z:z+d*normal.y,tangent,normal};
  }
  const nearBridge=(x:number,z:number,r:number)=>Math.abs(x-bridge.centerX)<bridge.width*.5+r+.12&&Math.abs(z-bridge.z)<bridge.length*.5+r;
  // Rasterize at texel centres in world space. A buried face cannot project
  // foam or a reflection. Highest surface wins when a root crosses a rock.
  function raster(a:P,b:P,c:P,stoneTone:number){
    const det=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);if(Math.abs(det)<1e-8)return;
    const low=(v:number,o:number,d:number,n:number)=>Math.max(0,Math.ceil((v-o)/d*n-.5));
    const hi=(v:number,o:number,d:number,n:number)=>Math.min(n-1,Math.floor((v-o)/d*n-.5));
    for(let j=low(Math.min(a[2],b[2],c[2]),Z0,DZ,NZ);j<=hi(Math.max(a[2],b[2],c[2]),Z0,DZ,NZ);j++)
      for(let i=low(Math.min(a[0],b[0],c[0]),X0,DX,NX);i<=hi(Math.max(a[0],b[0],c[0]),X0,DX,NX);i++){
        const x=X0+(i+.5)*DX/NX,z=Z0+(j+.5)*DZ/NZ,px=x-a[0],pz=z-a[2],
          u=(px*(c[2]-a[2])-pz*(c[0]-a[0]))/det,v=((b[0]-a[0])*pz-(b[2]-a[2])*px)/det;
        if(Math.min(u,v,1-u-v)<0)continue;
        const y=a[1]+(b[1]-a[1])*u+(c[1]-a[1])*v,index=j*NX+i;
        if(y>heights[index]&&y>=ground.height(x,z)-.017){heights[index]=y;tones[index]=stoneTone;}
      }
  }
  function tri(a:P,b:P,c:P,tint:string,light:number,skin:number,tone:number){
    ink.set(tint).multiplyScalar(light);
    for(const p of [a,b,c]){pos.push(...p);color.push(ink.r,ink.g,ink.b);figure.push(skin);brush.push(...(woodUV.get(p)??[0,0]));}
    raster(a,b,c,tone);
  }
  const stoneAnchors:P[]=[];
  for(const [i,[side,station,d,l,w,h,yaw,kind]] of ledges.entries()){
    const f=frame(station,side,d);if(nearBridge(f.x,f.z,Math.max(l,w)))continue;
    const along=f.tangent.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(f.normal,Math.sin(yaw)),
      across=f.normal.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(f.tangent,-Math.sin(yaw)),
      n=(a:number,b:number)=>coordinateNoise(a,i,seed,b+8780),palette=lithology[kind];
    // One dipping bedding plane per stone, NOT a horizontal rock with a
    // black vertical curb and flat light lid. The riverward lip dives under
    // water even when the opposite shoulder is completely swallowed by soil.
    const top=water+h,base=Math.min(water-.27,ground.height(f.x,f.z)-.16),knee=water-.095;
    const p=(x:number,z:number,y:number):P=>{
      const xx=along.x*x*l+across.x*z*w,zz=along.y*x*l+across.y*z*w;
      return [f.x+xx,y+T.MathUtils.clamp((xx*f.normal.x+zz*f.normal.y)*.52,-.28,.22)-.048*x*l,f.z+zz];
    };
    const rings:P[][]=[[],[],[],[]],shape=outlines[kind];stoneAnchors.push([f.x,top,f.z]);
    for(const [j,[a,b]] of shape.entries()){
      const chip=.90+.14*n(j,1),shoulder=.84+.13*n(j,2),slip=n(j,3)-.5;
      rings[0].push(p(a*chip*.84,b*.79,base));
      rings[1].push(p(a*chip,b*.99,knee+h*.10*slip));
      rings[2].push(p(a*chip*shoulder-.067,b*(.65+.14*n(j,4)),top-(h+.09)*(.48+.26*n(j,5)+.16*a)));
      rings[3].push(p(a*(.39+.26*n(j,6))-.19,b*.32+.11,top-(h+.04)*(.08+.16*n(j,7)+.11*a)));
    }
    for(let j=0;j<8;j++){
      const next=(j+1)%8,light=.90+.16*n(j,8);
      for(let k=0;k<3;k++){
        const a=rings[k][j],b=rings[k][next],c=rings[k+1][next],e=rings[k+1][j],
          tint=palette[k===2?(n(j,10)>.68?3:2):k],tone=[.22,.45,.70][k];
        tri(a,b,c,tint,light,1,tone);tri(a,c,e,tint,light*(.96+.07*n(j,11)),1,tone);
      }
      const apex=p(-.22,.14,top);
      tri(rings[3][j],rings[3][next],apex,palette[n(j,12)>.79?4:3],light,1,.84);
    }
  }
  const contacts:P[]=[];
  // Two root stools, each with distinct forks. All coordinates are physical
  // metres along and across a cut, not copied billboard strokes.
  type Knot=[number,number,number,number]; // downstream, inland, lift, half-width
  const makeRoots=(station:number,side:number,flip:number,size:number)=>{
    const f=frame(station,side,0);
    // The first stool points downstream; the second folds into the bank.
    // A broad, thin buttress hides under the inland clay. The lateral forks
    // are unequally long and emerge from its *side*, never four cut logs.
    const ribs:Knot[][]=[
      [[-.91,1.37,-.40,.34],[-.77,1.13,-.13,.35],[-.60,.90,-.016,.32],[-.38,.72,-.017,.27],[-.10,.66,-.013,.209],[.08,.46,-.013,.166],[.37,.32,-.016,.129],[.56,.13,-.012,.090],[.76,.07,-.022,.064],[.93,-.08,-.042,.038],[1.18,-.18,-.13,.009],[1.28,-.23,-.17,.001]],
      [[-.48,.79,-.046,.193],[-.52,.66,-.022,.168],[-.67,.46,-.016,.134],[-.69,.29,-.021,.095],[-.83,.18,-.025,.070],[-.97,.17,-.04,.047],[-1.14,.06,-.09,.022],[-1.30,.08,-.18,.001]],
      [[-.19,.71,-.038,.160],[.05,.75,-.021,.111],[.29,.91,-.024,.086],[.46,.87,-.03,.055],[.72,.95,-.08,.031],[.91,.90,-.16,.002]],
      [[-.56,.62,-.038,.084],[-.42,.47,.018,.068],[-.36,.31,.044,.047],[-.25,.21,.01,.035],[-.20,-.025,-.025,.022],[-.20,-.13,-.12,.002]],
      [[.38,.31,-.030,.083],[.53,.42,-.020,.068],[.70,.38,-.030,.041],[.86,.27,-.04,.021],[1.02,.32,-.11,.001]],
      [[-.63,.46,-.034,.062],[-.81,.47,-.021,.045],[-.97,.42,-.030,.034],[-1.08,.33,-.036,.018],[-1.21,.31,-.09,.001]],
      [[.55,.13,-.038,.050],[.64,.22,-.021,.038],[.82,.22,-.031,.025],[.99,.13,-.041,.016],[1.08,.04,-.11,.001]],
    ];
    const bed=new Float32Array(heights);
    const support=(x:number,z:number)=>{
      const ix=(x-X0)/DX*NX-.5,iz=(z-Z0)/DZ*NZ-.5,i=Math.floor(ix),j=Math.floor(iz),
        g=ground.height(x,z),h=(dx:number,dz:number)=>Math.max(g,bed[(j+dz)*NX+i+dx]??-4);
      return T.MathUtils.lerp(T.MathUtils.lerp(h(0,0),h(1,0),ix-i),T.MathUtils.lerp(h(0,1),h(1,1),ix-i),iz-j);
    };
    if(nearBridge(f.x,f.z,2.05*size))return;
    for(const [k,knots] of ribs.entries()){
      if(flip<0&&k===4)continue;
      const curve=new T.CatmullRomCurve3(knots.map(([l,d,h])=>new T.Vector3(
        f.x+f.tangent.x*l*flip*size+f.normal.x*d*size,h*size,
        f.z+f.tangent.y*l*flip*size+f.normal.y*d*size))),sub=k<2?3:2,steps=(knots.length-1)*sub;
      // Thin irregular flange with a fluted, off-centre keel and a short
      // overhanging lip. The broad edge settles onto local soil/stone for
      // every vertex. A rounded tube can't make this silhouette or contact.
      const cross=[[-1,-.23],[-.76,.13],[-.40,.38],[-.21,.97],[-.05,.62],[.19,.70],[.38,.34],[.85,-.06],[.70,-.29],[-.49,-.28]];
      let prev:P[]=[];
      for(let j=0;j<=steps;j++){
        const u=j/steps,q=curve.getPoint(u),axis=curve.getTangent(u),
          across=new T.Vector3(axis.z,0,-axis.x).normalize(),center=support(q.x,q.z),
          t=j/sub,ii=Math.min(knots.length-2,Math.floor(t)),r=T.MathUtils.lerp(knots[ii][3],knots[ii+1][3],t-ii)*size,
          keel=r*(.34+.43*Math.cos(u*4.2+k*.9)**2),land=1-T.MathUtils.smoothstep(u,.73,1),
          row:P[]=[];
        const rootFoot=ground.height(q.x,q.z);
        if(j===0||j===steps)contacts.push([q.x,rootFoot+q.y,q.z]);
        for(let b=0;b<cross.length;b++){
          const [s,v]=cross[b],w=(s+.12*Math.sin(u*6+k)*Math.max(0,v))*r*(1+.16*Math.sin(u*8.4+k*.72)),
            x=q.x+across.x*w,z=q.z+across.z*w,contact=support(x,z),
            surface=T.MathUtils.lerp(ground.height(x,z),T.MathUtils.lerp(contact,center,.19+.57*Math.max(0,v)),land),
            // Never loft an ankle-height beam between two surveyed knots;
            // only the thin middle withe lifts from its stone by a few cm.
            y=surface+q.y+v*keel,pt:P=[x,y,z];
          row.push(pt);woodUV.set(pt,[s*r*size,u*(flip<0?2.7:2.4)+k*2.31]);
        }
        if(j)for(let b=0;b<cross.length;b++){
          const m=(b+1)%cross.length;
          const tint=['#60594b','#76695a','#877664','#736859','#786b57','#6d6552','#645f50','#534f43','#48473e','#494a40'][b];
          const a=prev[b],c=row[b],e=row[m];tri(a,c,e,tint,1,2,.39);tri(a,e,prev[m],tint,1,2,.39);
        }
        prev=row;
      }
    }
  };
  // First stool belongs to the newly exposed cut upstream of the surviving
  // patrol spur. Carry the entire fork to surveyed stone/soil, not one limb.
  makeRoots(5.83,-1,1,1.08);makeRoots(13.62,-1,-1,1.24);
  const stride=NX;
  for(let k=0;k<samples.length;k++)if(heights[k]>water+.012)samples[k]=0;
  for(const sign of [1,-1])for(let z=sign===1?1:NZ-2;z>=1&&z<NZ-1;z+=sign)
    for(let x=sign===1?1:NX-2;x>=1&&x<NX-1;x+=sign){
      const k=z*NX+x;samples[k]=Math.min(samples[k],samples[k-sign]+DX/NX,samples[k-sign*stride]+DZ/NZ,
        samples[k-sign*stride-sign]+.12,samples[k-sign*stride+sign]+.12);
    }
  const pixels=new Uint8Array(NX*NZ*4);
  for(let k=0;k<samples.length;k++){
    const dist=samples[k],x=X0+(k%NX+.5)*DX/NX,z=Z0+(Math.floor(k/NX)+.5)*DZ/NZ;
    const lee=dist<.47?Math.max(0,(samples[k+stride+1]-samples[k-stride-1])/.19):0;
    const pocket=.5+.5*Math.sin(x*4.7+z*1.68+2.4*Math.sin(z*3.10));
    const lip=.070+.035*pocket,dry=ground.height(x,z)>water+.020;
    pixels[k*4]=Math.round(255*T.MathUtils.clamp((heights[k]-water)/HMAX,0,1));
    pixels[k*4+1]=Math.round(255*tones[k]);
    // Only fragments of the upstream lip whiten. Closed pale collars belong
    // to artificial stepping stones, not to a lee under a bank-attached ledge.
    pixels[k*4+2]=dry?0:Math.round(255*(1-T.MathUtils.smoothstep(Math.abs(dist-lip),.008,.073))*
      T.MathUtils.smoothstep(lee,.12,.78)*T.MathUtils.smoothstep(pocket,.43,.90));
    pixels[k*4+3]=Math.round(255*(1-T.MathUtils.smoothstep(dist,.026,.42)));
  }
  return {pos,color,figure,brush,pixels,stoneAnchors,contacts};
}
export type ScouredBank=ReturnType<typeof createScouredBank>;
export function bankContactTexture(bank:ScouredBank){
  const tex=new T.DataTexture(bank.pixels,NX,NZ,T.RGBAFormat);
  tex.name='river-local-rock-height-contact-and-foam';tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearFilter;tex.needsUpdate=true;
  return tex;
}

export type CrownSurvey={x:number;y:number;z:number;sx:number;sy:number;sz:number};
/** Angular silhouette of the ACTUAL instanced hillside trees, as seen from
 * stations along this river. This is a static angular depth proxy, not a sky
 * photograph or a made-up sine-wave treeline; reflect the usual view ray.
 * R/G are crown top/bottom sines, B is coverage in the water's lower sky. */
export function bakeBankCanopy(stations:RiverStation[],trees:readonly CrownSurvey[]){
  const width=192,rows=48,bytes=new Uint8Array(width*rows*4),tau=Math.PI*2;
  for(let row=0;row<rows;row++){
    const s=sampleRiverStation(stations,2+(row+.5)*22/rows)!;
    for(let i=0;i<width;i++)bytes[(row*width+i)*4+1]=255;
    for(const c of trees){
      const dx=c.x-s.centerX,dz=c.z-s.z,dist=Math.hypot(dx,dz);
      if(dist>58||dist<1.8||c.y<1)continue;
      const radius=Math.max(.32,Math.sqrt(c.sx*c.sz)*1.26),spread=Math.asin(Math.min(.91,radius/dist)),
        az=Math.atan2(dz,dx),lo=Math.floor(((az-spread)/tau+.5)*width),hi=Math.ceil(((az+spread)/tau+.5)*width);
      for(let j=lo;j<=hi;j++){
        const column=(j+width)%width,k=(row*width+column)*4,
          w=1-((((j+.5)/width-.5)*tau-az)/spread)**2;
        if(w<=0)continue;
        const arc=Math.sqrt(w),top=c.y-water+(.36+.28*arc)*c.sy,base=Math.max(.15,c.y-water-c.sy*(.28+.42*arc)),
          a=top/Math.hypot(top,dist),b=base/Math.hypot(base,dist),cover=arc*(.94-.36*Math.min(1,dist/48));
        bytes[k]=Math.max(bytes[k],Math.round(255*a));bytes[k+1]=Math.min(bytes[k+1],Math.round(255*b));
        bytes[k+2]=Math.max(bytes[k+2],Math.round(255*cover));bytes[k+3]=255;
      }
    }
  }
  const map=new T.DataTexture(bytes,width,rows,T.RGBAFormat);
  map.name='registered-jungle-crowns-from-river';map.wrapS=T.RepeatWrapping;map.minFilter=map.magFilter=T.LinearFilter;map.needsUpdate=true;
  return map;
}
