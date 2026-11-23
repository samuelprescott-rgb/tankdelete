import {inflateSync} from 'node:zlib';
// Validate the actual Chromium PNG, rather than assuming a visible Three
// object was visible after the DOM/compositor finished painting it. Sample
// clear playfield only (no corner panels), including its central title band.
export function inspectRookFilm(png) {
  const w=png.readUInt32BE(16),h=png.readUInt32BE(20),c=png[25]===2?3:png[25]===6?4:0,parts=[];
  if(!c||png[24]!==8||png[28]!==0||w*h>24e6)throw Error('Unsupported Chrome PNG');
  for(let i=8;i<png.length;){const n=png.readUInt32BE(i);if(png.toString('ascii',i+4,i+8)==='IDAT')parts.push(png.subarray(i+8,i+8+n));i+=n+12;}
  const raw=inflateSync(Buffer.concat(parts)),stride=w*c;
  if(raw.length!==(stride+1)*h)throw Error('Unexpected Chrome PNG size');
  let prev=Buffer.alloc(stride),row=Buffer.alloc(stride),samples=0,coloured=0,light=0,red=0,titleN=0;
  for(let y=0;y<h*.88;y++){
    const off=y*(stride+1),f=raw[off];
    if(f>4)throw Error('Invalid PNG filter');
    for(let i=0;i<stride;i++){
      const a=i>=c?row[i-c]:0,b=prev[i],d=i>=c?prev[i-c]:0,p=a+b-d;
      const pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-d);
      row[i]=raw[off+i+1]+(f===0?0:f===1?a:f===2?b:f===3?(a+b)>>1:(pa<=pb&&pa<=pc?a:pb<=pc?b:d));
    }
    if(y>h*.12&&y%6===0)for(let x=Math.ceil(.11*w);x<w*.8;x+=6){
      const i=x*c,r=row[i],g=row[i+1],b=row[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
      samples++;if(max-min>8&&max>=24)coloured++;if(max>=42)light++;
      if(y>h*.36&&y<h*.63){titleN++;if(r>72&&r>1.75*g&&r>1.6*b)red++;}
    }
    [prev,row]=[row,prev];
  }
  const worldColour=coloured/samples,worldLight=light/samples,titleRed=red/titleN;
  return {worldColour,worldLight,titleRed,clear:worldColour>.12&&worldLight>.16&&titleRed<.012};
}
