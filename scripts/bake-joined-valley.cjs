// Offline material build. The two original paintings stay unchanged. All
// three receivers (dome, river and mud) use ONE identically registered map:
// no extra texture samples, new sky pass or foreground light during play.
const sharp=require('sharp'),path=require('node:path'),fs=require('node:fs');
const base=path.resolve(__dirname,'../public/images/textures'),W=2048,H=704;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),mix=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,v)=>{let t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const fract=a=>a-Math.floor(a),wrap=d=>d-Math.round(d),lum=(r,g,b)=>.242*r+.632*g+.126*b;
async function read(file){return sharp(path.join(base,file)).resize(W,H,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();}
(async()=>{
 const [dawn,old]=await Promise.all([read('ghost-dawn-uplands-v2.png'),read('ghost-horizon-river.png')]);
 const sample=(u,y)=>((clamp(Math.round(y),0,H-1)*W+Math.floor(fract(u)*W))*3);
 const result=Buffer.alloc(W*H*3);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const u=(x+.5)/W,v=(y+.5)/H;
   // The sunrise gap is shared. Preserve the new painted distant hills
   // across the warm saddle; flank them with the older, much taller range.
   const oldU=fract(u-.035),dx=wrap(u-.695);
   const gap=Math.exp(-(dx*dx)/.00250),lateral=1-gap;
   const oldV=(v-(.649+.046*gap+.014*Math.sin(u*6.283*3+.7)))*.87+.758;
   const ix=sample(oldU,oldV*H),k=(y*W+x)*3;
   // Continuous luminance matte: a skyline picked independently per column
   // cuts artificial vertical slots through a mountain where clouds overlap.
   const low=ss(.91,.56,v), dr=dawn[k],dg=dawn[k+1],db=dawn[k+2];
   const sr=old[ix],sg=old[ix+1],sb=old[ix+2],val=lum(sr,sg,sb);
   // Windward vapour is warm; shadow mass keeps mauve/granite hues instead
   // of becoming a green pasted-on cutout. Trunks/hut stay live 3D.
   const stone=ss(.63,.85,oldV)*(.45+.55*(1-ss(86,174,val)));
   const bright=ss(105,212,val),vapor=.48+.30*lateral+.13*bright;
   const lit=Math.exp(-((dx+.026)**2)/.016)*bright;
   const cloud=[val*.50+sr*.50+9+15*bright+26*lit,val*.61+sg*.39+4+3*lit,val*.61+sb*.39+9-bright*8-14*lit];
   const mountain=[val*.81+31,val*.79+40,val*.82+53];
   const native=[dr,dg,db];for(let c=0;c<3;c++){
     const bank=mix(native[c],cloud[c],vapor*low*(1-.68*gap));
     const rock=mix(native[c],mountain[c],(.82-.56*gap)*(1-.33*ss(.78,.98,v)));
     result[k+c]=clamp(Math.round(mix(bank,rock,stone)),0,255);
   }
 }
 for(let x=0;x<32;x++)for(let y=0;y<H;y++)for(let c=0;c<3;c++){
   const a=(y*W+x)*3+c,b=(y*W+W-1-x)*3+c,t=.5*(1-x/32)**2,p=result[a],q=result[b];
   result[a]=mix(p,q,t);result[b]=mix(q,p,t);
 }
 const out=path.join(base,'ghost-joined-valley-v3.png');
 await sharp(result,{raw:{width:W,height:H,channels:3}}).png({palette:true,colours:252,dither:.27}).toFile(out);
 console.log(path.basename(out),W,H,fs.statSync(out).size);
})().catch(e=>{console.error(e);process.exitCode=1;});
