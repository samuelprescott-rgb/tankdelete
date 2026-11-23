import * as THREE from 'three';

export const ASH_W=80, ASH_H=112, ASH_CELS=6;
export const ASH_PROFILE={wreck:0,loft:1,smoulder:2,breaker:3} as const;
export const ASH_ROWS=4;
// Contours follow one ascending turbulent mass; curls merge, slide into the
// slipstream, and sometimes tear away entirely. These are NOT twelve copies
// of a puff laid out at a fixed step. Units are normalized to the column.
const knots=[
  [-.02,.045,.105,.095],[.036,.124,.15,.12],[-.11,.203,.19,.106],
  [-.015,.251,.216,.14],[.13,.313,.187,.123],[-.11,.368,.242,.132],
  [-.265,.429,.155,.081],[-.02,.455,.253,.143],[.17,.512,.238,.123],
  [-.065,.582,.277,.128],[-.265,.594,.178,.094],[-.375,.644,.14,.071],
  [.126,.677,.312,.139],[.347,.72,.227,.103],[.202,.786,.287,.120],
  [-.110,.816,.249,.094],[-.283,.842,.18,.070],[.273,.879,.262,.078],
  [.53,.900,.18,.068],[.444,.951,.139,.041],[-.46,.744,.115,.047],
] as const;
function hash(x:number,y:number){let h=Math.imul(x,119954089)^Math.imul(y,-1640531527);
  h=Math.imul(h^(h>>>15),-2048144789);return ((h^(h>>>13))>>>0)/4294967295;}
function noise(x:number,y:number){const ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy;
  const u=a*a*(3-2*a),v=b*b*(3-2*b),p=hash(ix,iy),q=hash(ix,iy+1);
  return (p+u*(hash(ix+1,iy)-p))*(1-v)+(q+u*(hash(ix+1,iy+1)-q))*v;}
const sat=(x:number)=>Math.min(1,Math.max(0,x));
const ease=THREE.MathUtils.smoothstep;

// Daylight rows are streams, not piles of individually shaded balls. The
// cross-section is torn lengthwise: a dense folded ribbon, a leeward gauze
// and narrow gaps that advect together between consecutive cels.
function paintDayRows(data:Uint8Array,stride:number){
  for(let row=1;row<=ASH_PROFILE.smoulder;row++)for(let k=0;k<ASH_CELS;k++){
    const p=k/ASH_CELS*2*Math.PI,cs=Math.cos(p),sn=Math.sin(p);
    const loft=row===ASH_PROFILE.loft;
    for(let j=1;j<ASH_H-1;j++){
      const t=(j+.5)/ASH_H;
      const bow=noise(t*(loft?4.1:2.7)+row*3.4,cs*.21+row*5)-.5;
      const center=bow*.35*(.32+.68*t)+sn*.035*Math.sin(7.3*t+row);
      // Rolling shoulders build up over the buoyant column; the wind tears
      // it thin between rolls. The upper cap has body and real air gaps,
      // rather than a conical pencil stroke disappearing into the sky.
      const rolls=1+.22*Math.sin(t*24+2.4*foldPhase(t,row,cs))+.11*Math.sin(t*39+row);
      const width=(loft?.095+.64*ease(t,.04,.75):.106+.45*ease(t,.05,.69))*rolls;
      const envelope=ease(t,0,.042)*(1-ease(t,.78,1));
      for(let i=1;i<ASH_W-1;i++){
        const u=(i+.5)/ASH_W*2-1;
        const fold=noise(u*3.7+t*1.5+row*8+cs*.16,t*7.3-sn*.24);
        const eddy=noise(u*8.7-t*1.9+sn*.40,t*16.8+cs*.29+row*8);
        const dust=noise(u*21+cs*.53,t*32-sn*.43+row);
        const across=(u-center)/width+(fold-.5)*1.10+(eddy-.5)*.40;
        const core=1-ease(Math.abs(across),.08,1.0);
        const gauze=1-ease(Math.abs(across+.80+.22*Math.sin(12*t+row)),0,.48);
        const split=1-ease(Math.abs(across+.33+(eddy-.5)*.75),.05,.27);
        const torn=loft?.43:.69;
        const density=sat((core*(.57+.43*fold)*(1-torn*split*ease(t,.13,.56))+
          .33*gauze*ease(t,.09,.42))*(.50+.56*eddy+.20*dust));
        const breach=ease(t,.45,.64)*ease(Math.abs(across),.32,.76)*ease(eddy+.23*dust,.54,.80);
        const alpha=sat(density*1.21-.60*breach)*envelope*(loft?.99:.86);
        if(alpha<.01)continue;
        const ix=((row*ASH_H+j)*stride+k*ASH_W+i)*4;
        const light=sat(.18+.32*fold+.20*eddy+.23*gauze+.14*(1-core)+.08*dust);
        data[ix]=Math.round(Math.round(light*15)/15*255);
        data[ix+1]=Math.round(255*sat(.33+t*2.5));
        // Separate pigment from density. B follows the rising fold and
        // sunward lip, leaving cold pockets *inside* a single opaque curl.
        // It is a mask for incident light, not orange baked into the sheet.
        const lip=ease(fold+.35*eddy-.28*core,.32,.83);
        data[ix+2]=Math.round(255*sat(.14+.57*lip+.27*gauze+.12*(1-split)-.08*core));
        data[ix+3]=Math.round(255*alpha);
      }
    }
  }
}
// Reuse the former horizontal haze row. A detached boiling roll has an
// uneven, undercut base; three shoulders break away on the rising side.
// R carries shadow/rim light, not alpha: sky holes are really transparent.
function paintBreakers(data:Uint8Array,stride:number){
  // A wind-torn mass with a common shear field; do not light each curl as a separate ball.
  for(let k=0;k<ASH_CELS;k++){
    const ph=k/ASH_CELS*Math.PI*2,c=Math.cos(ph),s=Math.sin(ph);
    for(let j=1;j<ASH_H-1;j++)for(let i=1;i<ASH_W-1;i++){
      const x=2*(i+.5)/ASH_W-1,y=2*(j+.5)/ASH_H-1;
      const f=noise(3.9*x+c*.25+23,4.5*y+s*.30+4), e=noise(x*10+s*.40+5,y*9-c*.32+9);
      const micro=noise(x*22-c*.38,y*26+s*.22);
      const u=x+.23*y+(f-.5)*.50,v=y-.19*Math.sin(3.9*u+.61)+(e-.5)*.17;
      const slip=noise(3.20*u+2.8*v+14+c*.21,6.4*v-1.3*u+5+s*.28);
      const lip=noise(7.8*u+3.5*v+4,9.2*v-2.5*u+.3*s);
      const envelope=1.-1.32*Math.pow(Math.abs(u+.055),1.62)-1.38*Math.pow(Math.abs(v-.02),1.79);
      const across=v+.28*Math.sin(4.*u+2.7*f)+.49*u;
      const slit=(1-ease(Math.abs(across-.18),.019,.13))*ease(u+.62*e,-.30,.37);
      const field=envelope+.95*(slip-.53)+.46*(lip-.46)+.22*(micro-.54)-.55*slit;
      const density=ease(field,.045,.79)*(.34+.33*f+.20*lip)*(1-.65*slit);
      const light=.26+.22*slip+.18*lip+.14*v-.11*u+.12*ease(across,.07,.43);
      if(density<.025)continue;
      const p=((ASH_PROFILE.breaker*ASH_H+j)*stride+k*ASH_W+i)*4;
      data[p]=Math.round(Math.round(15*sat(light+.19*f+.15*e+.16*(1-density)))/15*255);
      data[p+1]=255;
      data[p+2]=Math.round(255*sat(.12+.54*ease(slip-.28*across,.27,.79)+.24*lip+.11*(1-slit)));
      data[p+3]=Math.round(255*density);
    }
  }
}
function foldPhase(t:number,row:number,c:number){return noise(t*4.4+row,c*.29+3.4);}
let bytes:Uint8Array<ArrayBuffer>|undefined;
// Six hand-grouped cel silhouettes. R is lighting, G is cooling with height,
// A is density. Store linear control channels, not display RGB.
export function paintSmokeVolumeCels(){
  if(bytes)return bytes;
  const stride=ASH_W*ASH_CELS,data=new Uint8Array(stride*ASH_H*ASH_ROWS*4);
  for(let k=0;k<ASH_CELS;k++){
    const phase=k/ASH_CELS*2*Math.PI, cs=Math.cos(phase),sn=Math.sin(phase);
    for(let j=1;j<ASH_H-1;j++)for(let i=1;i<ASH_W-1;i++){
      const u=(i+.5)/ASH_W*2-1, t=(j+.5)/ASH_H;
      const n=noise(u*11.1+t*4+sn*.78,t*27.3-cs*.66), f=noise(u*23.7-cs*.71,t*49.9+sn*.52);
      const x=u+.054*(n-.5)+.073*sn*Math.sin(t*18.2+.45)*t;
      const y=t+.013*(f-.5)+.012*cs*Math.sin(u*6+t*3.2)*t;
      let mass=0, rim=0;
      for(const [cx,cy,rx,ry] of knots){
        const dx=(x-cx)/rx,dy=(y-cy)/ry, d=1.-dx*dx-dy*dy;
        if(d<-.14)continue;
        const puff=sat(d);mass+=puff*puff;
        rim=Math.max(rim,puff*(.50-.37*dx+.38*dy));
      }
      // Air scoops two asymmetric curls OUT of the core. Actual background
      // must show between the lobes on the close facade camera, not just
      // darker painted marks on a continuous sheet.
      const a=1-((x-.055)/.155)**2-((y-.578)/.046)**2;
      const b=1-((x+.083)/.129)**2-((y-.807)/.055)**2;
      const tear=THREE.MathUtils.smoothstep(Math.max(a,b)+(n-.5)*.51,-.02,.81);
      const density=sat(mass*1.72+(n-.5)*.73+(f-.5)*.22-.14)*(1.-tear*.96);
      if(density<.056||mass<.045)continue;
      const fade=1-THREE.MathUtils.smoothstep(t,.72,1);
      const shade=sat(rim*.62 + .38*n + .10*f + .12*(1-density));
      const index=(j*stride+k*ASH_W+i)*4;
      data[index]=Math.round(Math.floor(shade*8)/8*255);
      data[index+1]=Math.round(sat((t-.018)*7.1)*255);
      data[index+2]=0;data[index+3]=Math.round(255*Math.min(.80,(.22+.58*density)*fade)*sat(t/.075));
    }
  }
  paintDayRows(data,stride);paintBreakers(data,stride);
  bytes=data;return data;
}
let atlas:THREE.DataTexture|undefined,users=0;
export function ownSmokeAtlas(material:THREE.ShaderMaterial){
  if(!atlas){atlas=new THREE.DataTexture(paintSmokeVolumeCels(),ASH_W*ASH_CELS,ASH_H*ASH_ROWS);
    atlas.name='ghost-signal-whole-plume-six-cel-ash';atlas.minFilter=atlas.magFilter=THREE.NearestFilter;
    atlas.generateMipmaps=false;atlas.needsUpdate=true;}
  users++;material.uniforms.ashAtlas={value:atlas};
  const dispose=()=>{material.removeEventListener('dispose',dispose);if(!--users){atlas?.dispose();atlas=undefined;}};
  material.addEventListener('dispose',dispose);return material;
}
