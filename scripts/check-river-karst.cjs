// Test pixels loaded from the actual runtime asset. R1 production camera
// quaternions below only project the angular crests of that plate. A driver
// screenshot is a separate requirement for validating visibility behind trees.
const assert=require('node:assert/strict'),sharp=require('sharp'),T=require('three'),path=require('node:path');
const {latitude,rim,strips,bearing,capBlend}=require('./bake-river-karst.cjs');
const dir=path.join(__dirname,'../public/images/textures'),RAD=Math.PI/180;
async function verify(){
 const files=['ghost-river-cloudbreak-v5.png','ghost-river-karst-v6.png'];
 const [old,now]=await Promise.all(files.map(file=>sharp(path.join(dir,file)).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true})));
 assert.deepEqual([now.info.width,now.info.height,now.info.channels],[2048,704,3]);
 const {width:w,height:h}=now.info;let locked=0;
 for(let x=0;x<w;x++){
  const b=bearing((x+.5)/w);
  for(let y=0;y<h;y++){
   const v=1-(y+.5)/h;
   // Existing upper cloud shelf, both deep lateral/rear fields, the entire
   // solar notch and the atlas used by the physical foothill are unchanged.
   const overhead=capBlend(b,50)>0&&v>=latitude(b,18.8);
   if(!overhead&&(v<=.138||v>.84||b>65.4&&b<76.9||b>154||b< -13)){
    const i=(y*w+x)*3;
    assert(old.data[i]===now.data[i]&&old.data[i+1]===now.data[i+1]&&old.data[i+2]===now.data[i+2],'Protected sky or saddle changed');locked++;
   }
  }
 }
 assert(locked>w*h*.43,'Large untouched regions including sun, lower foothills and rear sky must remain bit-identical');
 const pixel=(b,e,buf=now.data)=>{
  const a=b*RAD-1.245,u=.695+(a+.52*Math.sin(a))/(Math.PI*2),v=latitude(b,e);
  const i=3*(Math.floor((1-v)*h)*w+Math.floor((u-Math.floor(u))*w));return Array.from(buf.subarray(i,i+3));
 };
 const delta=(a,b)=>a.reduce((s,c,i)=>s+Math.abs(c-b[i]),0);
 const crest=b=>Math.max(...strips.map(s=>rim(s,b)));
 function project(b,e,q){
  const cam=new T.PerspectiveCamera(60,16/9,.1,340);cam.quaternion.fromArray(q);cam.updateMatrixWorld();
  const p=new T.Vector3(Math.cos(b*RAD)*Math.cos(e*RAD),Math.sin(e*RAD),Math.sin(b*RAD)*Math.cos(e*RAD)).project(cam);
  return [Math.round((1+p.x)*960),Math.round((1-p.y)*540)];
 }
 const sunView=[.0102523,.9888711,.0819104,-.1237720],hillView=[.0418044,.9125203,.0965075,-.3952790];
 const vanes=[[90.6,sunView],[49.6,hillView]],px=[];
 for(const [b,rotation] of vanes){
  const height=crest(b),at=project(b,height,rotation);px.push(at);
  assert(at[0]>650&&at[0]<1500&&at[1]>49&&at[1]<110,'Hero crest lost behind the stock HUD or too low in the trees');
  assert(delta(pixel(b,height-.4),pixel(b,height+.32))>21,'Actual paint has lost its silhouette');
 }
 const luma=c=>c[0]*.22+c[1]*.63+c[2]*.15;
 const meter=(b,e)=>{let n=0,sum=0;
  for(let i=-.55;i<.56;i+=.1)for(let j=-.55;j<.56;j+=.1){n++;sum+=luma(pixel(b+i,e+j));}
  return sum/n;};
 const wall=meter(90.4,13.5),behindRoof=meter(99.5,12.5);
 assert(behindRoof-wall>17&&behindRoof<172,'The open back wall no longer separates from the forward blade');
 let different=0;for(let b=86;b<95;b+=.25)for(let e=12;e<17;e+=.25){
  if(delta(pixel(b,e),pixel(b,e,old.data))>16)different++;
 }
 assert(different>360,'The retained baseline was copied into the hero range');
 console.log({protectedTexels:locked,heroSummitPixels:px,wallLuma:+wall.toFixed(1),roofBackdropLuma:+behindRoof.toFixed(1)});
}
module.exports={verify};if(require.main===module)verify().catch(e=>{console.error(e);process.exitCode=1;});
