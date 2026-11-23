// Offline composite from the game's two retained original daylight paintings.
// The distant ridges come from the detailed dawn, not the earlier striped
// mountain painting. Only the cloud deck is borrowed from the latter. No new
// image download, extra runtime sample, or view-dependent billboard.
const sharp=require('sharp'),path=require('node:path');
const dir=path.join(__dirname,'../public/images/textures'),W=2048,H=704;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),mix=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const fract=x=>x-Math.floor(x);
async function read(name){return sharp(path.join(dir,name)).resize(W,H,{fit:'fill'}).toColourspace('srgb').removeAlpha().raw().toBuffer();}
// With a relief mask, expose the same dawn/sky division to later paint passes.
// A value of zero removes only the historical artificial vertical enlargement.
async function paintDawn(relief=()=>1){
 const [dawn,storm]=await Promise.all(['ghost-dawn-uplands-v2.png','ghost-horizon-river.png'].map(read));
 const out=Buffer.alloc(W*H*3),oldTop=new Float32Array(W);
 const index=(u,v)=>3*(clamp(Math.floor((1-v)*H),0,H-1)*W+Math.floor(fract(u)*W));
 // Follow the connected silhouette in the original dawn. Using colour alone
 // for the matte would leave a lavender halo over the cool-facing peaks.
 const top=Math.floor(.705*H),rows=Math.floor(.895*H)-top,steps=2*W;
 const parents=new Int8Array(steps*rows),ridge=new Float32Array(W);
 let prev=new Float32Array(rows),next=new Float32Array(rows);
 for(let i=0;i<steps;i++){
   const x=i%W;
   for(let k=0;k<rows;k++){
     const y=top+k,a=((y-2)*W+x)*3,b=((y+2)*W+x)*3;
     const dr=dawn[a]-dawn[b],dg=dawn[a+1]-dawn[b+1],db=dawn[a+2]-dawn[b+2];
     const edge=dr*.75+dg*.36+db*.07+.28*Math.max(0,dr-db)-.008*Math.abs(k-rows*.51);
     let best=-Infinity,link=0;
     for(let dj=-3;dj<=3;dj++)if(k+dj>=0&&k+dj<rows){
       const s=prev[k+dj]-Math.abs(dj)*(4.8+.8*Math.abs(dj));
       if(s>best){best=s;link=dj;}
     }
     next[k]=best+edge;parents[i*rows+k]=link;
   }
   [prev,next]=[next,prev];
 }
 let k=prev.indexOf(Math.max(...prev));
 for(let i=steps-1;i>=W;i--){ridge[i%W]=1-(top+k+.5)/H;k+=parents[i*rows+k];}
 for(let x=0;x<W;x++){
   const u=(x+.5)/W,dx=u-.695-Math.round(u-.695),d=Math.abs(dx),near=Math.exp(-((d/.122)**2));
   // Lift selected headlands, not an entire 360° rim. A notch remains at the
   // sun, and a second lower basin opposite it opens the reverse approach.
   const bump=(c,w)=>Math.exp(-(((dx-c-Math.round(dx-c))/w)**2));
   const extra=.85*bump(.100,.066)+.84*bump(-.142,.077)+.45*bump(.316,.052)
     +.36*bump(-.351,.063);
   const lift=1+extra*relief(u);
   oldTop[x]=(ridge[x]+.003)*(1+extra);
   for(let y=0;y<H;y++){
     const v=1-(y+.5)/H,srcV=v/lift;
     // Confine height displacement to the massif. Preserve the sun's native
     // aspect and position in the opening, and the dawn's lower amber vapour.
     const disc=1-ss(.7,2,Math.hypot(dx/.017,(v-.244)/.043));
     const hill=index(u,srcV),base=index(u+.46*dx*disc,v+.38*(v-.244)*disc);
     const nearRidge=1-ss(ridge[x]-.003,ridge[x]+.0025,srcV);
     const slopeMix=ss(.008,.08,lift-1)*nearRidge;
     const ground=[0,1,2].map(c=>mix(dawn[base+c],dawn[hill+c],slopeMix));
     const yl=ground[0]*.24+ground[1]*.61+ground[2]*.15;
     const humid=[yl*.94+10+12*near,yl*.94+11+3*near,yl*.95+12];
     for(let c=0;c<3;c++)ground[c]=mix(ground[c],humid[c],nearRidge*.49);
     // The old cloud paint contains its own disc and mountains at V<.35.
     // Never import those: the native dawn supplies the only real sun.
     // Register the broken quarter of the old cloud study above the village,
     // not its largely featureless cloud belly at .65. Sample less vertical
     // distance per sky degree so a cloud turret keeps its height in the
     // shallow driving lens. The reverse shoulder has its own silver gap.
     const cu=u-.135+.014*Math.sin(12.566*u+.9);
     const cv=.515+.30*v+.125*near+.040*Math.sin(12.566*u+.4);
     const k=index(cu,cv),r=storm[k],g=storm[k+1],b=storm[k+2],l=.25*r+.58*g+.17*b;
     const relief=ss(72,203,l),warm=.21+.79*near;
     const shade=[l*.68+40+12*warm,l*.64+43+4*warm,l*.65+52];
     const edge=[l*.91+34+31*warm,l*.85+35+13*warm,l*.79+45-11*warm];
     // Frayed shelf, lighter at its tongue and visibly cooler underneath.
     const cloud=[0,1,2].map(c=>mix(shade[c],edge[c],relief));
     const sunCore=Math.exp(-((d/.057)**2)-(((v-.244)/.154)**2));
     // Individual low lobes interrupt the light, while a break can stay
     // open farther up: no latitude-wide grey shelf parallel to the horizon.
     const hanging=.111*(.58-relief)+.057*Math.sin(Math.PI*12*u+.6*Math.sin(Math.PI*8*u));
     const deck=ss(.145,.37,v+hanging)*(1-nearRidge)*(1-sunCore);
     const j=3*(y*W+x);
     for(let c=0;c<3;c++)out[j+c]=clamp(Math.round(mix(ground[c],cloud[c],deck*.96)),0,255);
   }
 }
 // Inputs are seamless; the small chromatic seam left by resampling is
 // feathered offline so the far hillside still meets at arbitrary headings.
 for(let x=0;x<16;x++)for(let y=0;y<H;y++)for(let c=0;c<3;c++){
   const l=(y*W+x)*3+c,r=(y*W+W-1-x)*3+c,k=.5*(1-x/16)**2,a=out[l],b=out[r];
   out[l]=mix(a,b,k);out[r]=mix(b,a,k);
 }
 return {out,oldTop,dawn,ridge,W,H};
}
module.exports={paintDawn};
if(require.main===module)paintDawn().then(({out})=>sharp(out,{raw:{width:W,height:H,channels:3}})
 .png({palette:true,colours:256,dither:.20}).toFile(path.join(dir,'ghost-river-cloudbreak-v5.png')))
 .catch(e=>{console.error(e);process.exitCode=1;});
