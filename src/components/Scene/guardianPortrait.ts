import * as T from 'three';
import {createFieldPortrait} from './fieldPortraitGeometry';
import {addInfantrySkinAttributes} from './infantryGeometry';
import type {FinalBossAllyRole} from '../../lib/finalBossAllies';

const smooth=T.MathUtils.smoothstep;
const bell=(x:number,m:number,w:number)=>Math.exp(-(((x-m)/w)**2));
const HX=.012,HZ=-.024;
/** MakeHuman / Mindfront Aksel CC0; same baked orbital mesh, pupils, lid rims
 * and hand-painted skin as the deployed field soldiers. Only these copies
 * receive guardian-specific jaw/temple planes, hair silhouette and pigment.
 * Generic faces, not likeness reconstructions. */
export function createGuardianPortrait(role:FinalBossAllyRole){
  const mounted=role==='mounted-cavalry',heavy=role==='heavy-gunner',style=heavy?1:mounted?0:2;
  const face=createFieldPortrait(1.568,['#d3aa8d','#c19376','#c7a081'][style],style,'us',false);
  const p=face.attributes.position,n=face.attributes.normal,c=face.attributes.color,col=new T.Color();
  const hair=new T.Color(mounted?'#584b3e':heavy?'#504437':'#353633'),shine=new T.Color(mounted?'#978b73':heavy?'#81745e':'#655b4a');
  const shadow=new T.Color('#755f52'),camouflage=new T.Color('#505d49'),gray=new T.Color('#ac9e88');
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)-HX,y=p.getY(i),z=p.getZ(i),a=Math.abs(x),side=Math.sign(x),front=smooth(-z,.044,.100);
    const jaw=bell(y,1.500,.029),cheek=bell(y,1.550,.020)*bell(a,.052,.022),chin=jaw*bell(a,0,.035);
    const temple=bell(y,1.594,.031)*smooth(a,.048,.071)*smooth(z,-.088,-.020);
    const width=1+(heavy?.105:mounted?.052:-.065)*jaw+(mounted?.046:heavy?.032:-.018)*cheek;
    // The orbits, upper lids and eye globes are transformed together. No
    // dark discs pasted in front of the eyes or synthetic lash planes.
    const sx=x*width-side*temple*(mounted?.0036:.0019),sy=y+(heavy?-.004:mounted?.001:.004)*chin,sz=z-(heavy?.005:mounted?.003:.0005)*chin*front;
    let nx=n.getX(i)/width,ny=n.getY(i),nz=n.getZ(i);
    const norm=Math.hypot(nx,ny,nz)||1;nx/=norm;ny/=norm;nz/=norm;
    const rear=smooth(z,-.073,.036),ear=bell(a,.081,.012)*bell(y,1.557,.025);
    const angle=Math.atan2(x,z-HZ);
    const hairline=(mounted?1.634:heavy?1.633:1.620)-rear*(mounted?.066:heavy?.061:.107)
      +.006*Math.sin(2*angle+.6)+.004*Math.sin(5*angle+.25);
    const growth=smooth(y,hairline-.005,hairline+.003)*(1-.96*ear);
    // Low swept crop vs. longer dark hair at the nape. Because this is on
    // the original scalp surface, the skull can't show through a loose cap.
    const comb=.5+.5*Math.cos(angle*(heavy?9:7)+32*(y-1.62)+.56*Math.sin(angle*3));
    const length=growth*(mounted?.003:heavy?.006+.006*comb:.008+.010*comb);
    p.setXYZ(i,HX+sx+nx*length,sy+ny*length-(mounted||heavy?0:.018*rear*growth),sz+nz*length);
    n.setXYZ(i,nx,ny,nz);
    col.fromBufferAttribute(c,i);
    if(mounted){
      const templeGray=temple*smooth(z,-.04,-.012);
      const creases=bell(a,.058,.013)*bell(y,1.576-.13*(a-.048),.0028)*front;
      col.lerp(gray,templeGray*.31).lerp(shadow,.27*creases);
    }else if(heavy){
      // Two broken pigment smears lie ON the curved cheek surface, not
      // floating rods. Keep the eyes, lips and nostrils clear.
      const area=bell(x,.050,.020)*front;
      const mark=area*(bell(y,1.548+.28*(x-.045),.0042)+.72*bell(y,1.532+.37*(x-.045),.0035));
      col.lerp(camouflage,Math.min(.85,mark*.90));
    }else{
      col.lerp(shadow,.13*jaw*front).multiplyScalar(1+.055*cheek);
    }
    const glint=comb*(.11+.17*smooth(ny,.16,.83))*(mounted?.72:1);
    col.lerp(hair,growth*.95).lerp(shine,growth*glint);c.setXYZ(i,col.r,col.g,col.b);
  }
  const faceCount=p.count/3;
  face.userData.infantrySurface=2;addInfantrySkinAttributes(face,8);face.computeBoundingBox();face.computeBoundingSphere();
  face.userData.authoredPortraitTriangles=faceCount;
  return face;
}

// Slice exactly once per row and cache its edges. The generic orbital asset
// has a real cranium and ears, so a nominal elliptic headband or a fixed z for
// a lip/cheek accessory visibly floats. Work in the actual final bind pose.
export function guardianSurface(geo:T.BufferGeometry){
  const p=geo.getAttribute('position'),cache=new Map<number,[number,number,number,number][]>();
  return (y:number,dx:number,dz:number):[number,number,number]=>{
    const len=Math.hypot(dx,dz);dx/=len;dz/=len;
    let section=cache.get(y);if(!section){
      section=[];
      for(let i=0;i<p.count;i+=3){
        const edges:[number,number][]=[];
        for(let j=0;j<3;j++){
          const A=i+j,B=i+(j+1)%3,ay=p.getY(A),by=p.getY(B);
          if((ay<=y&&by>y)||(by<=y&&ay>y)){
            const t=(y-ay)/(by-ay);edges.push([p.getX(A)+(p.getX(B)-p.getX(A))*t-HX,p.getZ(A)+(p.getZ(B)-p.getZ(A))*t-HZ]);
          }
        }if(edges.length===2)section.push([...edges[0],...edges[1]]);
      }cache.set(y,section);
    }
    let dist=0;
    for(const [x,z,x2,z2] of section){
      const ex=x2-x,ez=z2-z,den=dx*ez-dz*ex;
      if(Math.abs(den)<1e-10)continue;
      const t=(x*ez-z*ex)/den,k=(x*dz-z*dx)/den;
      if(k>=-.0001&&k<=1.0001)dist=Math.max(dist,t);
    }
    return [HX+dx*dist,y,HZ+dz*dist];
  };
}

export function createGuardianBand(face:T.BufferGeometry){
  const hit=guardianSurface(face),pos:number[]=[],rgb:number[]=[],index:number[]=[],count=28;
  const cloth=new T.Color('#994237'),edge=new T.Color('#c05845'),ink=new T.Color();
  for(let row=0;row<4;row++){
    for(let i=0;i<count;i++){
      const a=Math.PI*2*i/count,dx=Math.sin(a),dz=-Math.cos(a),roll=Math.sin(Math.PI*row/3);
      // Small vertical waves instead of a single tilted rigid tube. Row
      // lookup reuses levels without changing their apparent contour.
      const y=1.616+row*.007+Math.round((.003*Math.sin(a*3+.5)+.002*Math.cos(a*2))/.001)*.001;
      const q=hit(+y.toFixed(3),dx,dz),gap=.0015+roll*.0014;
      pos.push(q[0]+dx*gap,y,q[2]+dz*gap);
      ink.copy(cloth).lerp(edge,.25+roll*.23+.14*Math.sin(a*3.4+row)).toArray(rgb,rgb.length);
      if(row){const A=(row-1)*count+i,B=(row-1)*count+(i+1)%count;index.push(A,A+count,B,B,A+count,B+count);}
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
  g.setIndex(index);g.computeVertexNormals();const flat=g.toNonIndexed();g.dispose();flat.userData.infantrySurface=3;return addInfantrySkinAttributes(flat,8);
}

export function createGuardianMoustache(face:T.BufferGeometry){
  const sample=guardianSurface(face),pos:number[]=[],rgb:number[]=[],idx:number[]=[],ink=new T.Color();
  const root=new T.Color('#4d453a'),silk=new T.Color('#866d53'),steps=9;
  for(const side of [-1,1]){
    const start=pos.length/3;
    for(let k=0;k<=steps;k++){
      const t=k/steps,dx=side*(.012+.39*t),center=1.529-.010*t**1.3+.0018*Math.sin(Math.PI*t),width=.0009+.0055*Math.sin(Math.PI*t)**.61;
      for(let row=0;row<3;row++){
        const y=center+(row-1)*width,q=sample(+y.toFixed(4),dx,-1),puff=.0008+.0025*(1-Math.abs(row-1))*Math.sin(Math.PI*t);
        pos.push(q[0]+dx*puff,q[1],q[2]-puff);
        ink.copy(root).lerp(silk,.11+.28*row/2+.11*Math.sin(k*.9)).toArray(rgb,rgb.length);
        if(k&&row){const a=start+k*3+row,triangles=[a-4,a-1,a-3,a-3,a-1,a];
          idx.push(...(side>0?triangles.reverse():triangles));}
      }
    }
  }
  const surface=new T.BufferGeometry();surface.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  surface.setAttribute('color',new T.Float32BufferAttribute(rgb,3));surface.setIndex(idx);surface.computeVertexNormals();
  const mesh=surface.toNonIndexed();surface.dispose();mesh.userData.infantrySurface=3;return addInfantrySkinAttributes(mesh,8);
}
