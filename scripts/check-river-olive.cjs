// Lock every texel that did not previously belong to the near mountains.
// In particular, don't hide a color mismatch by grading the sun or the mist.
const path=require('node:path'),assert=require('node:assert/strict');
const {graded,olive,read,front,ridgeHeightV8,ridgeHeightV9}=require('./bake-river-reference.cjs');
const {strips,bearing,latitude,sector}=require('./bake-river-karst.cjs');
async function verify(){
 const dir=path.join(__dirname,'../public/images/textures');
 const [a,b]=await Promise.all([graded,olive].map(f=>read(path.join(dir,f))));
 const {width:w,height:h}=a.info;
 let unchangedOutside=0,change=0,toneN=0,sums=[0,0],high=[[],[]];
 for(let x=0;x<w;x++){
  const angle=bearing((x+.5)/w),old=Math.max(...strips.map(s=>ridgeHeightV8(s,angle))),next=Math.max(...strips.map(s=>ridgeHeightV9(s,angle)));
  assert(next<=old+.00001);
  const top=latitude(angle,old+.058),upper=latitude(angle,next-.42),foot=latitude(angle,8.5);
  for(let y=0;y<h;y++){
   const i=3*(y*w+x),v=1-(y+.5)/h,changed=[0,1,2].some(k=>a.data[i+k]!==b.data[i+k]);
   if(changed)change++;
   if(old<=2.01||front(angle)<=0||sector(angle)<=0||v>top||v<=.123){
    assert(!changed,'outside original mountain at '+[x,y]);unchangedOutside++;
   }
   if(v>=upper||v<=Math.max(.165,foot)||!((angle>38&&angle<51)||(angle>85&&angle<93)))continue;
   [a,b].forEach((im,k)=>{const [r,g,bl]=im.data.subarray(i,i+3);sums[k]+=r-g;high[k].push(.24*r+.61*g+.15*bl);});toneN++;
  }
 }
 const rg=sums.map(n=>n/toneN),span=high.map(v=>{v.sort((x,y)=>x-y);return v[Math.floor(v.length*.9)]-v[Math.floor(v.length*.1)];});
 assert(toneN>300&&rg[1]<rg[0]-6&&Math.abs(rg[1])<5&&span[1]<span[0],'Near rock should now have a narrow olive-to-smoke range.');
 const mountain=strips.find(s=>s.id===47);
 for(const c of [85.55,90.6]){
  assert(ridgeHeightV9(mountain,c)<ridgeHeightV8(mountain,c)-.28,'No razor point at '+c);
 }
 assert(change>5000&&unchangedOutside>w*h*.90);
 console.log({active:olive,unchangedOutside,change,nearRedMinusGreen:rg.map(n=>+n.toFixed(2)),nearP90MinusP10:span.map(n=>+n.toFixed(2))});
}
module.exports={verify};if(require.main===module)verify().catch(e=>{console.error(e);process.exitCode=1});
