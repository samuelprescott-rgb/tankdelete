// Original art for the two skies. Run with Node; no external source images,
// runtime noise shaders or baked-in trees/fire. The map uses elevation in
// radians (not latitude UV); the 360-degree hills return to their first pixel.
import {deflateSync} from 'node:zlib';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {paintRiverSunset} from './paint-river-sunset.mjs';
const W=1792,H=352,tau=Math.PI*2,lo=-.15,hi=1.13;
const lerp=(a,b,t)=>a+(b-a)*t;
const unit=x=>Math.max(0,Math.min(1,x));
const smooth=t=>(t=unit(t),t*t*(3-2*t));
const rgb=(a,b,t)=>a.map((v,i)=>Math.round(lerp(v,b[i],unit(t))));
const cyc=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
let seed=14863;
const roll=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
// Distinct groups of lit convection towers, low trailing scud and slender
// upper streaks. Intentional negative space between groups rather than fBm.
const clouds=[];
const bank=(a,base,span,depth,n)=>{
  for(let i=0;i<n;i++){
    const t=(i+.3*roll())/n;
    const mass=.18+.82*Math.pow(Math.sin(t*Math.PI),.65);
    const w=span*(.095+.15*roll());
    const h=depth*mass*(.62+.55*roll());
    clouds.push({a:a+(t-.5)*span,y:base+h*.35+Math.sin(t*6.2)*depth*.08,w,h,
      floor:base-depth*(.037+.095*roll()), lean:(roll()-.45)*.58});
  }
};
for(const [a,b,w,h,n] of [
  [1.09,.22,1.30,.24,18],[2.22,.33,.92,.14,14],[.08,.54,1.09,.15,13],
  [-1.62,.32,1.46,.23,18],[-.83,.18,.76,.08,12],[-2.95,.24,1.14,.19,16],
  [2.92,.65,1.06,.07,13],[1.61,.63,.63,.045,9],[-1.11,.71,1.2,.05,11],
  [2.45,.15,.83,.075,12],[-2.40,.52,.69,.064,9]
])bank(a,b,w,h,n);
// Layers are interrupted mountain masses with long valleys. Tiny angular
// steps resolve to clustered marks rather than a uniform noisy tree line.
const bumps=(a,peaks)=>peaks.reduce((s,[c,w,h])=>s+h*Math.pow(Math.max(0,1-Math.abs(cyc(a,c))/w),1.16),0);
function heights(a){
  const rough=.006*Math.sin(35*a+1)+.004*Math.sin(51*a)+.0025*Math.sin(93*a);
  return [
    .098+bumps(a,[[1.10,.56,.22],[.70,.35,.095],[2.12,.62,.15],[-1.51,.75,.21],[-2.82,.72,.12],[-.36,.77,.15]])+.025*Math.sin(5*a)+rough*.65,
    .076+bumps(a,[[.75,.49,.15],[2.39,.79,.18],[-1.73,.8,.13],[-.72,.56,.12],[-2.97,.6,.17]])+.028*Math.cos(7*a)+rough*.85,
    .046+bumps(a,[[1.96,.57,.093],[-.09,.73,.12],[-2.31,.72,.096],[2.98,.4,.068]])+.019*Math.sin(9*a+.8)+rough
  ];
}
const day={high:[77,142,158],low:[185,206,179],bank:[[145,163,158],[186,190,166],[234,218,165],[255,239,192]],
  ridge:[[[119,161,156],[155,179,161]],[[78,132,134],[115,153,138]],[[42,93,105],[68,115,110]]]};
const night={high:[24,33,55],low:[68,82,104],bank:[[35,46,67],[44,57,79],[58,73,95],[76,89,108]],
  ridge:[[[54,71,92],[66,84,102]],[[40,57,79],[53,71,89]],[[26,43,59],[35,56,71]]]};
function bake(nocturne){
  const p=nocturne?night:day, pixels=Buffer.alloc((W*3+1)*H);
  const lightAz=nocturne?-1.92:.93, lightEl=nocturne?.49:.49;
  for(let x=0;x<W;x++){
    const a=((x+.5)/W-.5)*tau, hills=heights(a);
    const cs=clouds.map(c=>({...c,dx:cyc(a,c.a)/c.w})).filter(c=>Math.abs(c.dx)<1.55);
    for(let y=0;y<H;y++){
      const e=hi-(y+.5)/H*(hi-lo);
      let color=rgb(p.low,p.high,smooth((e-.03)/.95));
      const discDist=Math.hypot(cyc(a,lightAz)*Math.cos(e),e-lightEl);
      const shaft=Math.pow(Math.max(0,1-discDist/(nocturne?.32:.9)),2.8);
      color=rgb(color,nocturne?[128,149,167]:[255,224,156],shaft*(nocturne?.26:.61));
      if(discDist<(nocturne?.020:.036))color=nocturne?[199,212,208]:[255,243,196];
      // Advected humidity field erodes and lights the *whole* bank. No ink
      // boundary follows the individual ellipses used to lay out its mass.
      const q=a+Math.cos(3*a-e*5)*.082+Math.sin(8*a+e*13)*.023;
      const field=.36*Math.sin(7*q+e*16)+.24*Math.cos(12*q-e*21)
        +.16*Math.sin(29*q+e*44)+.10*Math.cos(63*q-e*77)+.052*Math.sin(137*q-e*106);
      if(nocturne){
        // Wind-sheared low storm ceiling with inlet-shaped holes and slanting
        // distant rain. Most of the sky stays in the same dark value family;
        // the entrance, not the weather, owns the brightest mark in the shot.
        const breakUp=.26*Math.cos(2*a+e*5)+.19*Math.sin(5*a-e*7);
        const storm=field+breakUp+e*.56-.17;
        const body=smooth((storm+.15)*2.0);
        const glint=smooth(1-Math.abs(storm+.08)*4.5)*smooth(1-discDist/.58);
        color=rgb(color,rgb(p.bank[0],p.bank[2],unit(.39+(field-storm)*.60)),body*.90);
        color=rgb(color,p.bank[3],glint*.42);
        const rain=smooth(.3+.54*Math.sin(17*q+e*10)+.34*Math.cos(31*q+e*19))
          *smooth(1-Math.abs(e-.2)*6)*smooth(.46+breakUp);
        color=rgb(color,[80,90,105],.20*rain);
      }else{
        let mass=-2;
        for(const c of cs){
          const dy=(e-c.y)/c.h, dx=c.dx-dy*c.lean;
          mass=Math.max(mass,1-dx*dx-dy*dy);
        }
        const body=mass+.48*field;
        if(body>0){
          const top=.50+.52*Math.sin(4*q+e*13)+.38*field+.34*(1-unit(mass));
          const ink=top>.99 ? 3:top>.64 ? 2:top>.23 ? 1:0;
          color=rgb(p.bank[ink],p.bank[Math.min(3,ink+1)],.20*smooth(top));
        }
      }
      for(let l=0;l<hills.length;l++){
        if(e>hills[l])continue;
        // A short opposing spur carved in each face, lost into the valley fog below.
        const gap=hills[l]-e;
        const face=Math.sin(a*(12+l*3)-gap*(18+l*4))+.47*Math.cos(23*a+e*14);
        const lit=face>.52&&gap>.012&&gap<.095 ? .76 : .12;
        color=rgb(p.ridge[l][0],p.ridge[l][1],lit);
      }
      const ix=y*(W*3+1)+1+3*x;
      pixels[ix]=color[0];pixels[ix+1]=color[1];pixels[ix+2]=color[2];
    }
  }
  return pixels;
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
function chunk(name,data){
  const b=Buffer.from(name),out=Buffer.alloc(data.length+12);
  out.writeUInt32BE(data.length);b.copy(out,4);data.copy(out,8);let crc=0xffffffff;
  for(const v of [b,data])for(const n of v)crc=(crc>>>8)^crcTable[(crc^n)&255];
  out.writeUInt32BE((~crc)>>>0,data.length+8);return out;
}
const header=Buffer.alloc(13);header.writeUInt32BE(W);header.writeUInt32BE(H,4);header[8]=8;header[9]=2;
for(const [mode,isNight] of [['river',false],['embassy',true]]){
  const source=isNight?bake(true):paintRiverSunset(W,H,lo,hi),stride=W*3+1;
  let seamError=0;
  for(let y=0;y<H;y++)for(let c=0;c<3;c++)
    seamError+=Math.abs(source[y*stride+1+c]-source[y*stride+1+3*(W-1)+c]);
  assert.ok(seamError/(H*3)<3,'360-degree wrap contains an edge');
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(source,{level:9})),chunk('IEND',Buffer.alloc(0))]);
  const url=new URL('../public/images/textures/ghost-horizon-'+mode+'.png',import.meta.url);
  if(process.argv.includes('--check'))assert.ok(readFileSync(url).equals(png),'Sky bake is stale: '+mode);
  else if(!existsSync(url)||!readFileSync(url).equals(png))writeFileSync(url,png);
}
if(process.argv.includes('--check'))console.log('Day/night horizon assets match the original bake; 360° seams pass.');
