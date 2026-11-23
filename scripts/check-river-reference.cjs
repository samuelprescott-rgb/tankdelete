const {graded:active,source,referenceSHA,read,sample,front,stoneShoulder,SUN,ALT}=require('./bake-river-reference.cjs');
const {latitude,rim,strips,bearing}=require('./bake-river-karst.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=path.join(__dirname,'../public/images/textures'),D=Math.PI/180;
async function verify(){
 const [ref,day,previous]=await Promise.all([read(source),read(path.join(root,active)),read(path.join(root,'ghost-river-karst-v6.png'))]);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),referenceSHA);
 assert.deepEqual([day.info.width,day.info.height],[previous.info.width,previous.info.height]);
 const W=day.info.width,H=day.info.height;
 // Test the color of rays under the actual UV transform, not a thumbnail
 // histogram. Repainting a pink gradient over the right sun position fails.
 const pixel=(b,e,img=day)=>{
  const delta=b*D-1.245,u=.695+(delta+.52*Math.sin(delta))/(2*Math.PI);
  const x=Math.floor((u-Math.floor(u))*W),y=Math.floor((1-latitude(b,e))*H);
  const off=(y*W+x)*3;return Array.from(img.data.subarray(off,off+3));
 };
 let dif=0,oldDif=0,total=0,locked=0,brights=0,dark=0;
 const luma=c=>.24*c[0]+.61*c[1]+.15*c[2];
 for(let b=24;b<120;b+=.37){
  const h=Math.max(...strips.map(s=>stoneShoulder(s,b)));
  for(let e=Math.max(12,h+.67);e<35;e+=.36){
   const target=sample(ref,b,e),got=pixel(b,e),old=pixel(b,e,previous);
   for(let k=0;k<3;k++){dif+=Math.abs(got[k]-target[k]);oldDif+=Math.abs(old[k]-target[k]);total++;}
   if(luma(got)>195&&got[0]-got[2]>48)brights++;
   if(luma(got)<102)dark++;
  }
 }
 assert(dif/total<4&&dif<oldDif*.15,'The forward cloud bodies and disc must match the exact R3 paint in their correct angular positions');
 assert(brights>40&&dark>1000,'Keep warm broken light and the dark overcast around it');
 const disc=pixel(SUN,ALT/D);
 assert(disc[0]>248&&disc[1]>232&&disc[2]<219,'Keep R3 ivory disc; no white procedural bulb');
 // Unchanged real foothill UV source and opposite sky. This check also
 // protects the embassy-independent rear hemisphere from an all-map grade.
 for(let x=0;x<W;x+=3)for(let y=0;y<H;y+=3){
  if(1-(y+.5)/H>.123&&front(bearing((x+.5)/W))>0)continue;
  const i=(y*W+x)*3;for(let k=0;k<3;k++)assert.equal(day.data[i+k],previous.data[i+k]);locked++;
 }
 const rock=pixel(90.4,13.5),haze=pixel(99.5,12.5),farSamples=[];
 for(let b=98.8;b<105;b+=.4)for(let e=8.9;e<16;e+=.4){const a=pixel(b,e),t=sample(ref,b,e);
  farSamples.push(a.reduce((s,c,k)=>s+Math.abs(c-t[k]),0)/3);}
 const farError=farSamples.reduce((a,b)=>a+b,0)/farSamples.length;
 assert(farError<3&&haze[0]>haze[2]+3,'Replace the pale wall behind the burning hut with the actual archived tiers');
 console.log({active,registeredSkyRays:total/3,R3MeanChannelError:+(dif/total).toFixed(2),previousMeanChannelError:+(oldDif/total).toFixed(2),behindHutR3Error:+farError.toFixed(2),disc,brightWarmSamples:brights,darkSamples:dark,frozenFoothillOrRearSamples:locked,frontCrag:rock,farRidge:haze});
}
module.exports={verify};if(require.main===module)verify().catch(e=>{console.error(e);process.exitCode=1;});
