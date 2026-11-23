// Paint in compass degrees, not evenly spaced texture columns. The campaign
// sky has an intentionally nonlinear latitude/longitude near the sun: a
// triangular silhouette in texture space can become a flat shelf in the lens.
// This is an offline plate. Sky, wet mud and river keep their single fetch.
const sharp=require('sharp'),path=require('node:path');
const {paintDawn}=require('./bake-crossing-sky.cjs');
const SUN=1.245*180/Math.PI,D=Math.PI/180,dir=path.join(__dirname,'../public/images/textures');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const fract=v=>v-Math.floor(v);
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7+1.349)*43758.5453);
function noise(x,y){
 const i=Math.floor(x),j=Math.floor(y),a=ss(0,1,x-i),b=ss(0,1,y-j);
 return lerp(lerp(hash(i,j),hash(i+1,j),a),lerp(hash(i,j+1),hash(i+1,j+1),a),b);
}
function bearing(u){
 let v=(u-.695)-Math.round(u-.695),t=v*2*Math.PI;
 for(let j=0;j<6;j++)t-=(t+.52*Math.sin(t)-2*Math.PI*v)/(1+.52*Math.cos(t));
 return SUN+t/D;
}
function latitude(deg,elev){
 const side=1-Math.cos((deg-SUN)*D),d=elev*D-.246+.075*ss(.04,.80,side)+.038*side,b=Math.max(0,d);
 const v=.244+.91*Math.min(d,0)+.20*(1-Math.exp(-4.8*b))+.46*ss(.004,.149,b)+.10*b/(b+.38);
 const join=.244+.20*(1-Math.exp(-4.8*.07))+.46*ss(.004,.149,.07)+.10*.07/.45;
 const cap=join+.51*(1-Math.exp(-5.4*Math.max(0,b-.07)));
 return clamp(lerp(Math.min(v,cap),.244+.91*Math.min(d,0)+.82*(1-Math.exp(-2.85*b)),ss(.72,1.62,side)),.0015,.9985);
}
// The 1582 cloud deck, including its breaks between the karsts, is retained.
// Do not drag the existing rounded "mountain + empty sky" image into a fin.
// First take out its artificial lift at these two shoulders. v<.142 is locked
// too: the physical nearer saddle reads this portion as its material atlas.
const sector=b=>Math.max(ss(-13,12,b)*(1-ss(60.8,65.4,b)),ss(76.9,82,b)*(1-ss(130,154,b)));
const readPoints=s=>s.split(/\s+/).map(s=>s.split(':').map(Number));
// A massif is a set of connected, uneven limestone walls. Keep low approach
// spurs, sheer sides, a true cleft, interrupted crowns and a long dip at the
// river; not a repeated peaked waveform or a continuous rim around the map.
const strips=[
 [0,15,'-15:3 1:6 9:10 15:9 21:12 28:13.3 32:12 37:14.8 40:14 43:14.9 46:13.3 51:14.3 54:13.1 56:13.4 60:11 65:8 69:6'],
 [0,23,'75:7 80:10.9 84:12 87:14.6 91:14.1 95:15.4 98:15.9 101.7:15.6 103.7:16.5 108:15.1 112:13.5 117:15 122:13.1 129:12.5 135:9.4 146:8 157:5'],
 [1,36,'-14:3 -4:6 3:6.7 8:9 11:13.4 13.2:14.2 14.3:13.4 15:10.3 17.2:10.8 20:9 23:8 25.4:10.6 27.1:10.9 28.4:13.7 30:14.4 31.9:12.1 33.1:12.6 34.7:10.2 36.4:10 38:12.8 40.6:13.6 41.2:15.5 42.4:15.7 43.5:15.2 44.2:12.9 45.2:13.2 46.4:14.7 47.3:14.8 48.1:16.6 49.6:17.6 50.4:16.9 51.2:16.6 52.3:14.3 53.3:14 54.9:11.4 57.3:10.4 60.7:9.5 64:7.6 68:5.7'],
 [1,47,'75:6.4 79:8.4 81.8:9.8 83.6:11.7 84.35:13.75 85.6:14.2 86.5:13.65 87.2:13.95 88.35:16.1 89.25:16.4 90.6:17.55 91.25:17.0 92.1:16.6 92.8:16.7 93.75:14.15 94.35:14.45 95.25:13.2 96.5:11 98.7:9.4 101.8:9.85 103.2:11.3 104.8:11.7 106:14.5 107.6:15.1 109.35:16.9 110.1:16.3 111:16.15 112.2:13.3 114:12.5 115:10.9 118.3:11.6 120:13.25 122.6:13.6 124:12.5 124.6:10.6 128.7:9.7 133:7.9 141:6.8 150:5'],
 [2,61,'-12:2 1:4.1 13:6.6 16:6.2 23:7.9 28:8.9 31:7.9 34:9.2 37.1:11.2 38.2:11.5 39.4:10 41.8:10.4 43.1:8.5 47:7.2 50.3:8.4 54:9.45 56:9.05 60:7.3 66:5.3'],
 [2,77,'76:5 81:6.3 85:9.0 88:8.35 91.4:9.8 94:10.1 96.2:9.1 99.5:6.6 102.3:6.5 105.3:7.5 109.4:9.5 111:9.6 112:9.1 115:10.7 117:11.2 120:9.7 126:7.3 134:6 147:4.2']
].map(([layer,id,points])=>({layer,id,points:readPoints(points)}));
function profile(pts,b){
 if(b<pts[0][0]||b>pts.at(-1)[0])return -30;
 let i=1;while(i<pts.length-1&&pts[i][0]<b)i++;
 const [a,lo]=pts[i-1],[z,hi]=pts[i],t=(b-a)/(z-a);
 return lerp(lo,hi,lerp(t,ss(0,1,t),.12));
}
function rim(s,b){
 const h=profile(s.points,b);
 const detail=(noise(b*1.8,s.id)-.50)*.35+(noise(b*6.4,s.id+6)-.48)*.19
  +(noise(b*.48,s.id+3)-.5)*.38;
 // R1 stock bridge/hill turns: the top HUD ate the left blade and grazed
 // the right one. Lower their crowns, not the valley or the game camera.
 const bell=(c,w)=>Math.exp(-(( (b-c)/w )**2));
 const clearance=b<SUN?(s.layer===1?.73+1.61*bell(49.7,5.8):s.layer===0?1.28:0):
  (s.layer===1?.65*bell(90.6,3.8)+2.0*bell(109.4,5.8):s.layer===0?1.5*bell(108,5.3):0);
 return h+detail*(s.layer===0?.7:1)-clearance;
}
// Separate muted mineral and forest pigments. More humid/paler down-valley,
// cool shadows, muted rose on the actual sun-facing walls; no white ridge.
// Trace three brushwork regions in the retained 1300-wide dawn study. This
// controls the LOCAL rock coordinates, not our silhouette. Copying full
// columns of the source would stretch every canopy mark into vertical lines.
const forestLip=readPoints('355:132 398:120 429:109 457:96 475:91 496:94 521:85 548:82 569:70 575:69 590:78 607:82 621:79 643:76 657:72 672:69 683:73 697:80 712:84 733:96 753:100 775:105 792:100 807:96 826:101 846:107 873:112 900:118');
const spectral=[[145,143,148],[109,117,117],[83,101,99]];
function swatch(s,b,e,top,ctx){
 const {dawn,W,H,ridge}=ctx,l=s.layer,id=s.id,fall=Math.max(0,top-e);
 const warm=1-ss(6,64,Math.abs(SUN-b)),bench=ss(.5,5,fall),root=Math.sin(b*.46+id);
 let sx,sy;
 if(!l){
  sx=Math.floor(W*fract((b<SUN?.18:.51)+b*.009+fall*.0009));
  sy=clamp(Math.floor((1-ridge[sx])*H+2+fall*5.2),0,H-1);
 }else{
  const a=b<SUN?(l===1?682-(b-37)*5.85:584+(b-36)*3.7):(l===1?568+(b-90.6)*6.25:735-(b-95)*4.46);
  // Shear the talus a little, retaining the original painted forest fingers,
  // slab fractures and patches of blush limestone beneath the overgrowth.
  const ax=clamp(a+fall*(.64+.88*root)+noise(b*.23,id)*1.2,356,899);
  sx=Math.floor(ax/1300*W);
  sy=Math.min(H-1,Math.floor(495+(profile(forestLip,ax)+2.1+fall*(l===1?5.5:6.1))*209/164));
 }
 const i=(sy*W+sx)*3,r=dawn[i],g=dawn[i+1],bb=dawn[i+2],value=.22*r+.63*g+.15*bb;
 const stone=ss(-12,9,r-g),sunSide=ss(-.8,.8,Math.sign(SUN-b)*(profile(s.points,b+.35)-profile(s.points,b-.35)));
 const facet=(sunSide-.5)*(l===0?3:8)*(.55+.45*bench);
 // The original forest margin sometimes exposes the brighter plane behind a
 // crown. Don't let that isolated texel expand into a snowy summit cap.
 const pigmentValue=l===1?Math.min(value,lerp(115,164,ss(.45,1.8,fall))):value;
 const relief=(pigmentValue-(l===0?132:105))*(l===0?.56:1.11),weather=(noise(b*.5,e*.55+id)-.5)*(l===0?2:4);
 const litStone=stone*(.55+.45*sunSide)*warm,air=ss(14,6,e)*warm*(l===0?4:7);
 // Tree cover descends in hanging fingers from ledges, split by drainage
 // cuts and bare stone faces. Keep the next wall subdued behind the roof.
 const shelf=noise(b*.31+fall*.23,id+fall*.70)*.60+noise(b*1.27-fall*.62,id+e*.82)*.40;
 const wood=l===0?0:ss(1.05,3.6,fall)*ss(.39,.68,shelf+.13*(1-stone));
 const shade=l===0?0:wood*(l===1?.85:1);
 const depth=ss(2,7.0,fall)*shelf;
 return spectral[l].map((c,k)=>c+relief+facet+weather+air+[-18,-11,-16][k]*shade+
   (l===1?[-7,-5,-7][k]*depth:0)+
  [7,1,-1][k]*warm+[11,3,-4][k]*litStone+([r,g,bb][k]-value)*.16);
}
function capBlend(b,e){
 const side=Math.abs((b-SUN+540)%360-180);
 return (1-ss(52,91,side))*ss(18.8,23.8,e);
}
async function bake(){
 const data=await paintDawn(u=>1-sector(bearing(u))),{W,H,out,oldTop}=data;
 const old=await sharp(path.join(dir,'ghost-river-cloudbreak-v5.png')).removeAlpha().toColourspace('srgb').raw().toBuffer();
 const result=Buffer.from(old);
 for(let x=0;x<W;x++){
  const b=bearing((x+.5)/W),mask=sector(b);if(!mask)continue;
  const active=strips.map(s=>({s,h:rim(s,b)})).filter(({h})=>h>0);
  const curve=Array.from({length:706},(_,i)=>latitude(b,-9+i*.05));let j=1;
  for(let y=H-1;y>=0;y--){
   const v=1-(y+.5)/H;if(v<.138)continue;
   while(j<curve.length-1&&curve[j]<v)j++;
   const e=-9+(j-1+clamp((v-curve[j-1])/(curve[j]-curve[j-1]||1)))*.05;
   const ink=mask*ss(.138,.203+.013*Math.sin(b*.31),v),p=(y*W+x)*3;
   const remove=ink*(1-ss(oldTop[x]-.001,oldTop[x]+.005,v));
   let col=[old[p],old[p+1],old[p+2]].map((c,k)=>lerp(c,out[p+k],remove));
   for(const {s,h} of active){
    const edge=1-ss(h-.030,h+.030,e);if(!edge)continue;
    const pigment=swatch(s,b,e,h,data);
    col=col.map((c,k)=>lerp(c,pigment[k],edge*ink));
   }
   for(let k=0;k<3;k++)result[p+k]=Math.round(col[k]);
  }
 }
 // Higher-angle cloud bodies are painted in viewing degrees. The old plate
 // used a narrow sliver of the illustrated sky for the whole upper vault:
 // the sky looked fine on level ground but became vertical bars on the ramp.
 // Here only the forward vault uses the original broad thunderhead painting;
 // retain the cloud bases, sun disc, horizon, rear sky and night panorama.
 const storm=await sharp(path.join(dir,'ghost-horizon-river.png')).resize(W,H,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
 for(let x=0;x<W;x++){
  const u=(x+.5)/W,b=bearing(u);if(!capBlend(b,50))continue;
  const angles=Array.from({length:361},(_,i)=>latitude(b,18+i*.20));
  let j=1;const near=Math.exp(-(((u-.695-Math.round(u-.695))/.155)**2));
  for(let y=H-1;y>=0;y--){
   const v=1-(y+.5)/H;if(v<angles[0])continue;
   while(j<angles.length-1&&angles[j]<v)j++;
   const e=18+(j-1+clamp((v-angles[j-1])/(angles[j]-angles[j-1]||1)))*.20;
   const cover=capBlend(b,e);if(!cover)continue;
   const cu=fract(u-.15+.017*Math.sin(2*Math.PI*u+.65)+(e-22)*.00072);
   const cv=.56+.41*(1-Math.exp(-.043*Math.max(0,e-15)))+.018*Math.sin(4*Math.PI*u+.4);
   const k=(Math.min(H-1,Math.floor((1-cv)*H))*W+Math.floor(cu*W))*3;
   const value=storm[k]*.25+storm[k+1]*.58+storm[k+2]*.17,light=ss(76,198,value),warm=.21+.79*near;
   const body=[value*.68+40+12*warm,value*.64+43+4*warm,value*.65+52];
   const silver=[value*.91+34+31*warm,value*.85+35+13*warm,value*.79+45-11*warm];
   const p=(y*W+x)*3;for(let k=0;k<3;k++)result[p+k]=clamp(Math.round(lerp(result[p+k],lerp(body[k],silver[k],light),cover)),0,255);
  }
 }
 // True-colour encoding locks unchanged cloud, sun and saddle-atlas texels
 // byte-for-byte, rather than re-quantising all of v5 to make room for rock.
 await sharp(result,{raw:{width:W,height:H,channels:3}}).png({compressionLevel:9,adaptiveFiltering:true})
  .toFile(path.join(dir,'ghost-river-karst-v6.png'));
}
module.exports={bearing,latitude,sector,rim,strips,capBlend};
if(require.main===module)bake().catch(e=>{console.error(e);process.exitCode=1;});
