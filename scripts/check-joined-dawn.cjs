// Measure the actual authored sky bytes, not screenshots after independent grading.
// The new saddle is a local preservation target, not a mandate to put the
// old mountains in every part of the wrap.
const assert=require('node:assert/strict'),path=require('node:path'),sharp=require('sharp');
const dir=path.join(__dirname,'../public/images/textures'),wrap=x=>x-Math.round(x);
const sample=async file=>sharp(path.join(dir,file)).resize(1024,352,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
(async()=>{
  const [newer,union]=await Promise.all(['ghost-dawn-uplands-v2.png','ghost-joined-valley-v3.png'].map(sample));
  let core=0,side=0,nc=0,ns=0,seam=0,ny=0;const slices=[[],[]];
  for(let y=150;y<275;y++)for(let x=0;x<1024;x++){
    const u=(x+.5)/1024,dist=Math.abs(wrap(u-.695)),i=(y*1024+x)*3;
    const d=(Math.abs(union[i]-newer[i])+Math.abs(union[i+1]-newer[i+1])+Math.abs(union[i+2]-newer[i+2]))/3;
    if(dist<.024){core+=d;nc++;}
    if(dist>.10&&dist<.27){side+=d;ns++;slices[+(wrap(u-.695)>0)].push(union[i]*.21+union[i+1]*.72+union[i+2]*.07);}
    if(!x){for(let c=0;c<3;c++){seam+=Math.abs(union[i+c]-union[i+1023*3+c]);ny++;}}
  }
  const spread=slices.map(slice=>{slice.sort((a,b)=>a-b);return slice[Math.floor(slice.length*.90)]-slice[Math.floor(slice.length*.10)];});
  const stats={saddleChangeRGB:core/nc,flankChangeRGB:side/ns,flankLightSpread:spread,wrapError:seam/ny};console.log(stats);
  assert(stats.flankChangeRGB>stats.saddleChangeRGB*1.13&&stats.flankChangeRGB>6,'Do not replace the occupied new saddle with the old panorama');
  assert(spread.every(x=>x>29)&&stats.wrapError<4,'Both flanking ranges retain tonal structure and the panorama wraps cleanly');
  // Historical v9 archive: verify its pigment, cloud relief and wrap
  // without requiring the current campaign to mount that derivative.
  const active='ghost-river-olive-karst-v9.png',paint=await sample(active);
  const pixel=(x,y)=>Array.from(paint.subarray((y*1024+x)*3,(y*1024+x)*3+3));
  const uv=(u,v)=>pixel(Math.floor(u*1024),Math.floor((1-v)*352));
  const luma=c=>c[0]*.21+c[1]*.72+c[2]*.07;
  const {SUN,ALT}=require('./bake-river-reference.cjs'),chart=require('./bake-river-karst.cjs'),
    angle=SUN*Math.PI/180-1.245,at=.695+(angle+.52*Math.sin(angle))/(Math.PI*2),e=chart.latitude(SUN,ALT*180/Math.PI);
  const disc=uv(at,e),wings=[uv(at-.013,e),uv(at+.010,e)];
  assert(disc[0]>235&&disc[0]-disc[2]>43&&wings.every(c=>luma(disc)-luma(c)>16),'warm narrow centre must remain discernible against the break');
  const cloudSpread=[[.60,.39],[.04,.50],[.46,.52]].map(([u,v])=>{
    const l=[];for(let x=0;x<70;x++)for(let y=0;y<35;y++)l.push(luma(uv(u+x*.0014,v+y*.0045)));
    l.sort((a,b)=>a-b);return l[Math.floor(l.length*.9)]-l[Math.floor(l.length*.1)];
  });
  // The reference places darker thunderheads across two of those patches.
  // Test the unchanged reverse patch here; forward angular fidelity to the
  // actual source, all the way up the bridge, is checked independently below.
  assert(cloudSpread[1]>38,'Retain the reverse opening and its cloud contrast');
  let error=0;for(let y=0;y<352;y++)for(let c=0;c<3;c++)error+=Math.abs(pixel(0,y)[c]-pixel(1023,y)[c]);
  assert(error/(352*3)<4,'active painting visibly jumps at the seam');
  console.log({active,paintedDiscRGB:disc,driverSkyPaintSpreads:cloudSpread,meanSeamRGB:error/(352*3)});
  // The retained game now binds the original R3 paint, not these historic derivatives.
  require('./check-crossing-sky.cjs').verify();
  await require('./check-river-karst.cjs').verify();
  await require('./check-river-reference.cjs').verify();
  await require('./check-river-umber.cjs').verify();
  await require('./check-river-olive.cjs').verify();
})().catch(e=>{console.error(e);process.exitCode=1;});
