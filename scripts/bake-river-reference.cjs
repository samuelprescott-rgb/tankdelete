// Restore the actual R3 cloud painting from the user's AFTER / RIVER board.
// Same angular size as its old live dome, but put its disc on the current
// directional key. Compose once offline; no sky dome behind another dome.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),sharp=require('sharp'),assert=require('node:assert/strict');
const {latitude,rim,strips,bearing,sector}=require('./bake-river-karst.cjs');
const dir=path.join(__dirname,'../public/images/textures');
const source=path.join(__dirname,'../art-source/ghost-signal/river-r3-reference.png');
const referenceSHA='b850e26694e45d5407c00cb350bfc8c84ea72fa72f3f80b0275efdd2051f3583';
const active='ghost-river-amber-karst-v7.png';
const graded='ghost-river-umber-karst-v8.png';
const olive='ghost-river-olive-karst-v9.png';
// The old 53.3° sun is almost entirely behind the living fig at today's
// spawn. Move the key toward its historic bearing, at the opening to the
// right of those leaves, not the middle of the whole valley.
const D=Math.PI/180,SUN=1.14/D,ALT=.246,origSun=.93,origAlt=.273;
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n)),ss=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t,fract=x=>x-Math.floor(x);
const front=b=>1-ss(63,103,Math.abs((b-SUN+540)%360-180));
// The reference already has a back range and two distinct foothill tiers.
// Keep that actual continuous painting, not a re-tinted lavender wall. Only
// the two nearer, asymmetric rock spurs rise clear of the archival horizon.
function stoneShoulder(s,b){
 const lobes=Math.max(ss(26,39,b)*(1-ss(50,60,b)),ss(76,86,b)*(1-ss(91,98.5,b)),
  .60*ss(106,114,b)*(1-ss(119,130,b)));
 return s.layer?lerp(2,rim(s,b),lobes):-30;
}
// Only this needle rises across the sunward view from the middle of the
// bridge. The little tooth at 85.5 degrees and all other mountains stay put.
// Scale relief from its own foot, never by squeezing the whole panorama.
function ridgeHeightV8(s,b){
 const h=stoneShoulder(s,b);
 if(s.id!==47||b<=85.5||b>=94.6)return h;
 const local=ss(85.5,87.7,b)*(1-ss(92.2,94.6,b));
 return h-.28*local*Math.max(0,h-9.5);
}
function mineralPigment(p,b){
 // Pull the old limestone's green channel into ashy umber, not orange
 // paint. Highlights get the strongest value compression; cool seams keep a
 // little of the original color. All numbers here are 8-bit painted sRGB.
 const value=.24*p[0]+.61*p[1]+.15*p[2],level=96+.63*(value-102),
   lit=ss(69,127,value),solar=1-ss(10,66,Math.abs(b-SUN)),
   warmth=.31+.52*lit+.17*solar;
 return [level+13*warmth,level-.9*warmth,level-13.5*warmth].map((ch,k)=>ch+.15*(p[k]-value));
}
const read=file=>sharp(file).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
// Source dimensions, angular bounds and disc position come from the preserved
// IMUH3e07 dome shader and its own texture; no screenshot/UI pixels are used.
function sample(src,b,e){
 const {width:w,height:h}=src.info,omega=(b-SUN)*D,srcEl=e*D+origAlt-ALT;
 const x=Math.floor(fract(.5+(origSun+omega)/(2*Math.PI))*w);
 const y=clamp(Math.floor((1-clamp((srcEl+.15)/1.28,.0015,.9985))*h),0,h-1),i=(y*w+x)*3;
 return [src.data[i],src.data[i+1],src.data[i+2]];
}
// Bevel the small double crest above the occupied bluff. Its two saddles
// and long outside faces still belong to the same mountain; no flat clipping.
function ridgeHeightV9(s,b){
 const h=ridgeHeightV8(s,b);
 if(s.id!==47||b<=83||b>=94)return h;
 const near=Math.max(ss(83,84.7,b)*(1-ss(86.1,87.2,b)),ss(87.2,88.9,b)*(1-ss(92.2,94,b)));
 const eroded=[[-2.2,1],[-1.5,2],[-.8,3],[0,3],[.8,3],[1.5,2],[2.2,1]]
   .reduce((sum,[d,w])=>sum+w*ridgeHeightV8(s,b+d),0)/15;
 return h+near*Math.min(0,eroded-h);
}
function aerialPigment(p,b,e){
 // Atmospheric perspective, in the same displayed color space as the R3
 // painting. Treat value as rock form, not a painted brown highlight. Cool
 // shadow predominates at the valley floor, warm olive near the opening.
 const y=.24*p[0]+.61*p[1]+.15*p[2],facing=1-ss(7,57,Math.abs(b-SUN)),
   lift=ss(5,14,e),warm=facing*(.21+.53*lift),level=99+.39*(y-101);
 return [level-4+10*warm,level+.9+2*warm,level-2-6*warm];
}
async function bake(version=7){
 assert([7,8,9].includes(version));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),referenceSHA,'Not the original R3 panorama');
 const [old,historic]=await Promise.all([read(path.join(dir,'ghost-river-karst-v6.png')),read(source)]);
 const {width:W,height:H}=old.info,out=Buffer.from(old.data);
 for(let x=0;x<W;x++){
  const b=bearing((x+.5)/W),mask=front(b);
  if(mask===0)continue;
  const profile=version===9?ridgeHeightV9:version===8?ridgeHeightV8:stoneShoulder;
  const mass=strips.map(s=>({h:profile(s,b),oldH:stoneShoulder(s,b),l:s.layer})).filter(o=>o.h>2.01);
  const ys=Array.from({length:1201},(_,i)=>latitude(b,-30+i*.1));let j=1;
  for(let y=H-1;y>=0;y--){
   const v=1-(y+.5)/H;
   if(v<=.123)continue; // Preserve the actual physical foothill UVs.
   while(j<ys.length-1&&ys[j]<v)j++;
   const e=-30+(j-1+clamp((v-ys[j-1])/(ys[j]-ys[j-1]||1)))*.1;
   const i=3*(y*W+x),ground=sector(b),ink=mask*ss(.123,.160,v);
   let paint=sample(historic,b,e);
   for(const {h,oldH,l} of mass){
    const coverage=(1-ss(h-.055,h+.055,e))*ground;if(!coverage)continue;
    const fall=Math.max(0,h-e);
    // If the crown moved, carry its original compact fracture shapes down
    // with the rock. Above it paint is the exact revealed historic ray.
    const effective=e+(oldH-h)*ss(9.5,h,e),vRock=latitude(b,effective);
    const kRock=h===oldH?i:3*(x+W*clamp(Math.floor((1-vRock)*H),0,H-1));
    const value=old.data[kRock]*.24+old.data[kRock+1]*.61+old.data[kRock+2]*.15;
    // Repaint the new wall shapes with pigments from the reference hills
    // below them: copper/mist near the gap, layered green-gray elsewhere.
    // The old V6 brush still defines forest fingers, gullies and shelves.
    const sampled=sample(historic,b,[7,4.7,2.0][l]),mean=sampled[0]*.24+sampled[1]*.61+sampled[2]*.15;
    const mist=1-ss(0,63,Math.abs(b-SUN)),illum=[150,115,90][l]+[14,8,6][l]*mist;
    const pigment=sampled.map((q,k)=>lerp(q,illum+[9,3,-7][k]*mist,[.60,.45,.40][l])
     +(value-[149,114,90][l])*[.24,.51,.55][l]+[2,0,-2][k]*(1-ss(2,6,fall))
     +[[-1,0,1],[-4,2,1],[-5,3,0]][l][k]*(1-.6*mist)+.09*(mean-108));
    const rock=version===9?aerialPigment(pigment,b,e):version===8?mineralPigment(pigment,b):pigment;
    paint=paint.map((q,k)=>lerp(q,rock[k],coverage));
   }
   for(let k=0;k<3;k++)out[i+k]=Math.round(clamp(lerp(old.data[i+k],paint[k],ink),0,255));
  }
 }
 await sharp(out,{raw:{width:W,height:H,channels:3}}).png({compressionLevel:9,adaptiveFiltering:true}).toFile(path.join(dir,version===9?olive:version===8?graded:active));
}
module.exports={active,graded,olive,source,referenceSHA,read,sample,front,stoneShoulder,ridgeHeightV8,ridgeHeightV9,SUN,ALT};
if(require.main===module)bake(process.argv.includes('--v7')?7:process.argv.includes('--v8')?8:9).catch(e=>{console.error(e);process.exitCode=1;});
