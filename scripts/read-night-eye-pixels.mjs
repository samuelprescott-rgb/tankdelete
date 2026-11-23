// Read unmodified PNG pixels. A red-biased patch near a projected eye is not
// a guarantee of a visible pair: the second peak and a dark valley must exist.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('sharp');
for(const dir of process.argv.slice(2)){
  const rec=JSON.parse(await readFile(join(dir,'receipt.json')));
  for(const [k,v] of Object.entries(rec.shots)){
    if(!v.sockets)continue;
    const {data,info}=await sharp(join(dir,k+'.png')).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const rgb=(x,y)=>Array.from(data.subarray((Math.floor(y)*info.width+Math.floor(x))*3,(Math.floor(y)*info.width+Math.floor(x))*3+3));
    const strength=c=>c[0]-Math.max(c[1],c[2]);
    const peaks=v.sockets.map(([x,y],j)=>{
      const list=[];
      for(let py=Math.floor(y)-2;py<=Math.floor(y)+2;py++)for(let px=Math.floor(x)-2;px<=Math.floor(x)+2;px++){
        const ds=v.sockets.map(([u,w])=>Math.hypot(px+.5-u,py+.5-w));
        if(ds[j]>2.4||ds[j]>=ds[1-j])continue;
        const c=rgb(px,py);list.push({pos:[px,py],color:c,strength:strength(c)});
      }
      return list.sort((a,b)=>b.strength-a.strength)[0];
    });
    if(peaks.some(x=>!x))continue;
    const [a,b]=peaks.map(x=>x.pos),seg=[];for(let i=1;i<16;i++){
      const px=Math.round(a[0]+(b[0]-a[0])*i/16),py=Math.round(a[1]+(b[1]-a[1])*i/16);
      if((px!==a[0]||py!==a[1])&&(px!==b[0]||py!==b[1]))seg.push(strength(rgb(px,py)));
    }
    const valley=seg.length?Math.min(...seg):null;
    console.log(rec.expected,k,v.distance.toFixed(1)+'m',JSON.stringify({rgb:peaks.map(x=>x.color),peakSpacing:Math.hypot(a[0]-b[0],a[1]-b[1]),valley,distinct:peaks.every(x=>x.strength>=58)&&valley!==null&&valley<Math.min(...peaks.map(x=>x.strength))*.55}));
  }
}
