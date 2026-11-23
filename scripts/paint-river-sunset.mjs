import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
// The project's own monsoon underpainting supplies the nonrepeating cloud relief.
// Read only this known 8-bit RGB PNG. No network or imaging dependency.
function monsoon(){
  const png=readFileSync(new URL('../public/images/textures/vietnam-monsoon-panorama-v1.png',import.meta.url));
  const w=png.readUInt32BE(16),h=png.readUInt32BE(20),c=3,ch=[];
  if(png[24]!==8||png[25]!==2||png[28]!==0)throw Error('Expected noninterlaced RGB underpainting');
  for(let o=8;o<png.length;){const n=png.readUInt32BE(o);if(png.toString('ascii',o+4,o+8)==='IDAT')ch.push(png.subarray(o+8,o+8+n));o+=12+n;}
  const raw=inflateSync(Buffer.concat(ch)),pix=Buffer.alloc(w*h*c),row=w*c;
  const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
  for(let y=0;y<h;y++){
    const off=y*(row+1),f=raw[off];
    for(let i=0;i<row;i++){const at=y*row+i,a=i>=3?pix[at-3]:0,b=y?pix[at-row]:0,c=y&&i>=3?pix[at-row-3]:0;
      pix[at]=raw[off+i+1]+(f===0?0:f===1?a:f===2?b:f===3?(a+b)>>1:paeth(a,b,c));}
  }
  return {w,h,pix};
}
const tau=2*Math.PI,pi=Math.PI,unit=v=>Math.max(0,Math.min(1,v)),ease=v=>(v=unit(v),v*v*(3-2*v));
const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const mix=(a,b,t)=>(t=unit(t),[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
function ramp(cs,t){const v=unit(t)*(cs.length-1),i=Math.min(cs.length-2,Math.floor(v));return mix(cs[i],cs[i+1],v-i);}
const dusk=[[29,53,61],[53,72,75],[83,93,91],[123,125,110],[165,158,133],[200,186,148],[229,213,167]];
const sourceSide=[[56,62,63],[87,80,77],[126,92,76],[170,109,78],[213,144,91],[242,181,112],[255,224,159],[255,246,203]];
const solarAz=.93,solarEl=.273;
// Three authored 360-degree silhouettes in angular space. The village (+Z)
// looks through a low river cut with a hanging bench, a deep fault, and one
// saw-tooth shoulder. Profiles were drawn independently; the front ridge is
// not the back ridge rescaled. Endpoints match around the full panorama.
const ranges=[
  [[-pi,.12],[-2.75,.15],[-2.51,.261],[-2.36,.234],[-2.17,.32],[-2.12,.21],[-1.77,.19],[-1.5,.12],[-1.14,.125],[-.82,.26],[-.68,.22],[-.44,.28],[-.23,.27],[.04,.18],[.31,.27],[.39,.327],[.46,.297],[.55,.265],[.63,.265],[.68,.195],[.80,.17],[.92,.125],[1.07,.116],[1.19,.17],[1.30,.205],[1.36,.201],[1.40,.168],[1.53,.134],[1.68,.167],[1.83,.174],[1.97,.258],[2.04,.247],[2.12,.31],[2.18,.298],[2.29,.352],[2.36,.281],[2.54,.272],[2.65,.21],[2.85,.175],[pi,.12]],
  [[-pi,.08],[-2.83,.10],[-2.55,.067],[-2.29,.178],[-1.94,.13],[-1.67,.175],[-1.48,.164],[-1.36,.084],[-1.08,.078],[-.89,.14],[-.63,.125],[-.50,.176],[-.36,.139],[-.13,.075],[.17,.108],[.30,.154],[.41,.166],[.49,.214],[.55,.196],[.64,.201],[.73,.131],[.82,.126],[.94,.083],[1.11,.062],[1.24,.077],[1.39,.103],[1.52,.102],[1.59,.076],[1.75,.083],[1.89,.142],[2.01,.166],[2.08,.195],[2.13,.186],[2.17,.233],[2.27,.241],[2.37,.20],[2.46,.202],[2.56,.146],[2.81,.112],[pi,.08]],
  [[-pi,.047],[-2.67,.067],[-2.44,.041],[-2.19,.084],[-1.89,.092],[-1.55,.052],[-1.23,.071],[-.84,.03],[-.47,.106],[-.34,.097],[-.16,.05],[.09,.062],[.37,.09],[.51,.101],[.73,.06],[.91,.047],[1.13,.028],[1.36,.056],[1.48,.06],[1.65,.035],[1.84,.054],[2.03,.107],[2.15,.111],[2.39,.077],[2.61,.094],[2.88,.062],[pi,.047]]
];
// Periodic value fields preserve the horizon seam while breaking the very
// regular frequency of sine stripes. The octaves are baked, never sampled
// in the runtime shader.
function unitHash(i,s){
  let h=Math.imul(i^Math.imul(s,1376312589),1597334677);
  h=Math.imul(h^(h>>>16),2246822519);return ((h^(h>>>13))>>>0)/4294967295;
}
function cycle(a,n,s){
  const x=(a/tau+.5)*n,cell=Math.floor(x),f=x-cell,i=((cell%n)+n)%n;
  const p=unitHash(i,s);return p+(unitHash((i+1)%n,s)-p)*ease(f);
}
function contour(a,layer){
  a=Math.atan2(Math.sin(a),Math.cos(a));
  const knots=ranges[layer];let i=1;while(i<knots.length-1&&a>knots[i][0])i++;
  const [x,y]=knots[i-1],[x1,y1]=knots[i],t=(a-x)/(x1-x);
  const fractured=(cycle(a,163,18+layer)-.5)*.013+(cycle(a,361,58+layer)-.5)*.005+
    (cycle(a,54,103+layer)-.5)*.019;
  return y+(y1-y)*(.70*t+.30*ease(t))+fractured;
}
const massDark=[[67,77,79],[40,58,54],[26,42,39]],massLight=[[127,133,122],[93,103,85],[63,77,59]];
function spur(a,d,k){
  // A trunk ravine bends gently, then receives oblique tributaries; uneven
  // rib spacing avoids a comb-like cliff. The displaced field is periodic.
  const x=a+d*(.28+.65*Math.sin(a*7+.8*k))+.022*Math.sin(a*14+13*d+k);
  const broad=cycle(x,43,5+k);
  const fork=x+.033*broad+d*(.19+.42*Math.sin(12*x+2.1*k));
  const branch=cycle(fork,132,23+k),tiny=cycle(fork+d*.44,317,72+k);
  return .58*broad+.31*branch+.11*tiny;
}
function ridgePaint(a,e,rims,corona){
  let k=2;while(k>=0 && e>rims[k])k--;if(k<0)return null;
  const drop=rims[k]-e,lee=contour(a+.017,k)-contour(a-.017,k);
  // Drainage folds start at the ridge and fork down its face, not vertical
  // stripes. Large planes carry detail off into tone at distance.
  const cut=ease((drop+.005)/.038)*(1-.45*ease((drop-.14)/.13));
  const bro=spur(a,drop,k),normal=(spur(a-.0045,drop,k)-spur(a+.0045,drop,k))*4.9;
  const gully=1-ease((bro-.16)/.16);
  const base=unit(.45-lee*4.5+cut*(normal*.67+(bro-.49)*.51-gully*.35));
  const scrub=cycle(a+.43*drop+.021*Math.sin(58*drop+a*13),850,36+k);
  const light=unit((Math.floor(base*11+.5)/11)+(scrub-.5)*.15*cut);
  let range=mix(massDark[k],massLight[k],light);
  // Outcrops at the broken top; scrub collects in the sheltered channels.
  const rock=ease((normal+.45)/.95)*ease((bro-.31)/.36)*(1-ease((drop-.011)/.075));
  range=mix(range,[139,133,111],rock*(k===0?.18:.24));
  const vapour=corona*(k===0?.65:k===1?.40:.16);
  let ink=mix(range,k===0?[179,133,104]:[138,113,81],vapour);
  const key=ease((light-.59)/.39)*corona;
  ink=mix(ink,[205,144,89],key*(k===0?.47:.34)*(1-ease((drop-.005)/.14)));
  return ink;
}
export function paintRiverSunset(W,H,lo,hi){
  const source=monsoon(),raw=Buffer.alloc((3*W+1)*H),stride=3*W+1;
  const luma=(u,v)=>{
    const ix=((Math.floor(u*source.w)%source.w)+source.w)%source.w,iy=Math.floor(unit(v)*(source.h-1)),i=(iy*source.w+ix)*3;
    return (source.pix[i]*.25+source.pix[i+1]*.60+source.pix[i+2]*.15)/255;
  };
  for(let x=0;x<W;x++){
    const a=((x+.5)/W-.5)*tau,da=angle(a,solarAz),rims=ranges.map((_,i)=>contour(a,i));
    // At negative elevations low hills must exist between the camera and
    // the far ridges, rather than stretching one final distant triangle.
    for(let j=0;j<H;j++){
      const e=hi-(j+.5)/H*(hi-lo),v=.455-(e-solarEl)*.365,u=.3915+da/tau;
      const unwound=u+.0033*Math.sin(e*9+3*a)-.0033*Math.sin(solarEl*9+3*solarAz);
      const value=luma(unwound,v),wide=(luma(unwound+.003,v+.004)+luma(unwound-.003,v-.004)+luma(unwound,v))*.3333;
      const relief=luma(unwound+.0016,v+.0022)-luma(unwound-.0016,v-.0022);
      const dist=Math.hypot(da*Math.cos(e),e-solarEl),corona=Math.exp(-Math.pow(dist/.61,1.34));
      const base=unit((value-.12)*1.18+relief*.32),level=Math.floor(base*27+.5)/27;
      let ink=mix(ramp(dusk,level),ramp(sourceSide,level),unit(.095+.89*corona+.14*ease((.52-e)/.43)));
      // Differently coloured linings on sunward cloud relief; bright scud
      // between these marks stays translucent. Far side remains green-blue.
      const lining=ease((relief+.016)*7)*ease((wide-.33)*2.65)*corona;
      ink=mix(ink,[253,183,106],lining*.42);
      const optical=ease((wide-.29)*2.55),open=ease((value-.42)*2.65);
      const aureole=Math.exp(-dist*dist/.012)*optical;
      ink=mix(ink,[255,210,133],aureole*.72);
      // A fraction of the solar disc is actually in front of a dark sliver of
      // cloud, others are behind the veil. Only the narrow opening is ivory.
      if(dist<.034)ink=mix(ink,[255,247,206],ease((.034-dist)/.005)*open);
      if(e<Math.max(...rims))ink=ridgePaint(a,e,rims,corona)??ink;
      const k=j*stride+1+3*x;for(let c=0;c<3;c++)raw[k+c]=Math.round(ink[c]);
    }
  }
  return raw;
}
