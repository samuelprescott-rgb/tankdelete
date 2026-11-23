// Full-resolution CPU proof of which rays changed; driving films verify
// what actually remains visible beyond foliage and the real forward hills.
const path=require('node:path'),crypto=require('node:crypto'),fs=require('node:fs'),assert=require('node:assert/strict'),T=require('three');
const {graded,active:previous,source,read,SUN,ALT,sample,front,stoneShoulder,ridgeHeightV8}=require('./bake-river-reference.cjs');
const {latitude,bearing,sector,strips}=require('./bake-river-karst.cjs');
const dir=path.join(__dirname,'../public/images/textures'),D=Math.PI/180;
const fixedQ=[.003215583084754878,.9937656270175216,.029754288833519688,-.10739749010060148];
async function verify(){
 const [old,now,historic]=await Promise.all([read(path.join(dir,previous)),read(path.join(dir,graded)),read(source)]);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,previous))).digest('hex'),'931b67769724f1ff70c47f1d862aab089c2b857b36d0b295d15836070de7d615');
 const {width:W,height:H}=now.info,ka=strips.find(s=>s.id===47);
 let locked=0,changed=0,restored=0,backError=0,softened=0,n=0,hue0=0,hue1=0;
 const highs=[[],[]],lum=(buf,i=0)=>.24*buf[i]+.61*buf[i+1]+.15*buf[i+2];
 function worldPixel(b,e){
   const a=b*D-1.245,u=.695+(a+.52*Math.sin(a))/(2*Math.PI);
   return 3*(W*Math.floor((1-latitude(b,e))*H)+Math.floor((u-Math.floor(u))*W));
 }
 for(let x=0;x<W;x++){
   const b=bearing((x+.5)/W),heights=strips.map(s=>stoneShoulder(s,b)),prior=Math.max(...heights),next=Math.max(...strips.map(s=>ridgeHeightV8(s,b)));
   const top=latitude(b,prior+.058),valid=prior>2.01&&front(b)>0&&sector(b)>0;
   for(let y=0;y<H;y++){
     const i=(W*y+x)*3,v=1-(y+.5)/H;
     const diff=now.data[i]!==old.data[i]||now.data[i+1]!==old.data[i+1]||now.data[i+2]!==old.data[i+2];
     if(diff)changed++;
     if(!valid||v>top||v<=.123){
       assert(!diff,'Repaint escaped the original near rock mask: '+[x,y,b.toFixed(3),v.toFixed(5)]);
       locked++;
     }
   }
   if(next>prior-.15||prior<14)continue;
   for(let e=next+.11;e<prior-.14;e+=.07){
     const i=worldPixel(b,e),h=sample(historic,b,e);
     backError+=Math.abs(h[0]-now.data[i])+Math.abs(h[1]-now.data[i+1])+Math.abs(h[2]-now.data[i+2]);restored++;
   }
 }
 for(const [lo,hi] of [[37,51],[85,93],[112,117]])for(let b=lo;b<hi;b+=.19){
   const roof=Math.max(...strips.map(s=>ridgeHeightV8(s,b)));
   for(let e=9.8;e<roof-.45;e+=.23){
     const i=worldPixel(b,e),lo0=lum(old.data,i),lo1=lum(now.data,i);
     hue0+=old.data[i]-old.data[i+1];hue1+=now.data[i]-now.data[i+1];
     highs[0].push(lo0);highs[1].push(lo1);softened+=lo0-lo1;n++;
   }
 }
 const Q=(k,q)=>highs[k].sort((a,b)=>a-b)[Math.floor(n*q)];
 assert(locked>W*H*.85&&changed>4000,'Local near-rock change with vast majority of original registered paint byte-locked');
 assert(restored>50&&backError/(3*restored)<2.5,'Exposed crescent must restore the underlying archive ray');
 assert(softened/n>3&&hue1/n-hue0/n>6&&Q(1,.90)<Q(0,.90)-6,'Dampen pale sage highlights and warm the nearer rock');
 const oldH=stoneShoulder(ka,90.6),newH=ridgeHeightV8(ka,90.6),smallH=ridgeHeightV8(ka,85.5),notch=ridgeHeightV8(ka,86.8);
 assert(Math.abs((newH-9.5)/(oldH-9.5)-.72)<.001&&newH>smallH+.4&&notch+.5<smallH);
 for(let b=-180;b<230;b+=.2)for(const s of strips){
   if(s!==ka||b<=85.5||b>=94.6)assert.equal(ridgeHeightV8(s,b),stoneShoulder(s,b));
 }
 const cam=new T.PerspectiveCamera(60,16/9,.1,340);cam.quaternion.fromArray(fixedQ);cam.updateMatrixWorld();
 const midY=e=>{const b=90.6*D,h=e*D;return Math.round((1-new T.Vector3(Math.cos(b)*Math.cos(h),Math.sin(h),Math.sin(b)*Math.cos(h)).project(cam).y)*540);};
 console.log({active:graded,unchangedOutsideRock:locked,changed,uncoveredArchiveError:+(backError/(3*restored)).toFixed(3),sunUnchanged:now.data[worldPixel(SUN,ALT/D)]===old.data[worldPixel(SUN,ALT/D)],nearRminusG:[+(hue0/n).toFixed(1),+(hue1/n).toFixed(1)],nearP90:[Math.round(Q(0,.9)),Math.round(Q(1,.9))],needleDegrees:[+oldH.toFixed(2),+newH.toFixed(2)],unchangedSideToothDeg:+smallH.toFixed(2),midpointCrestY:[midY(oldH),midY(newH)]});
}
module.exports={verify};if(require.main===module)verify().catch(e=>{console.error(e);process.exitCode=1;});
