// Authored in bind-space millimetres, then rasterized to the actual CC0 facial
// triangles' source UVs. G = signed light / turning plane, B = short growth.
// No noise fields run on the actors. Bristles only grow inside a drawn beard
// boundary, and repeated linework is restricted to a handful of named planes.
const sat=x=>Math.max(0,Math.min(1,x)),mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=sat((x-a)/(b-a));return t*t*(3-2*t);};
const bell=(x,w)=>Math.exp(-((x/w)**2));
const hash=(i,j,s)=>{let h=Math.imul(i+91,100183)^Math.imul(j+53,169087)^Math.imul(s,8388617);h=Math.imul(h^(h>>>14),2246822507);return ((h^(h>>>16))>>>0)/4294967296;};
// A tapered brush with an arcing spine, a broad body and two broken ends.
function stroke(x,y,x0,y0,x1,y1,r,bend=0){
  const dx=x1-x0,dy=y1-y0,t=((x-x0)*dx+(y-y0)*dy)/(dx*dx+dy*dy);
  if(t<=0||t>=1)return 0;
  const w=r*(.45+.55*Math.sin(Math.PI*t));
  return bell(y-(y0+dy*t+bend*4*t*(1-t)),w)*smooth(0,.18,t)*(1-smooth(.80,1,t));
}
// Each cheek has a distinct malar ledge, an indented return plane, and the
// turn back into the lower jaw. Not a diagonal cut or symmetrical face paint.
const marks=[
  [19,114,43,126,3.2,1.4,.24], [44,123,62,130,3.8,2,.19],
  [31,106,51,116,3.2,-1.6,-.20], [57,113,78,119,2.1,.9,-.12],
  [38,85,58,99,4.3,1,.13], [49,83,70,96,2.7,-1,.13],
  [20,64,43,68,2.6,-1.5,.15], [45,64,61,73,3.4,-2.2,.13],
  [57,146,80,151,3.2,1.9,-.16], [54,154,75,157,3.4,1.4,.18], [17,132,42,137,1.8,-2,-.25],
  [22,130,49,136,1.8,-1.6,.29], [37,135,54,140,1.15,.1,-.20],
];
// Larger patches are the cross-sections of underlying planes, not stripes.
// The malar highlight runs out onto the front face; the hollow narrows
// towards the mouth and widens beneath the outer cheek. Asymmetric edges
// and unequal softness keep this from reading like symmetrical camouflage.
const facets=[
  [[[19,113],[23,121],[39,128],[53,131],[71,128],[58,119],[39,113],[29,111]],.68,5.2],
  [[[30,102],[40,111],[61,121],[77,123],[75,111],[66,98],[51,85],[41,84],[39,95]],-.54,5.5],
  [[[37,82],[51,93],[73,110],[79,106],[74,88],[63,75],[49,72]],.35,6.2],
  [[[10,47],[26,54],[40,66],[69,74],[65,64],[48,55],[29,48],[16,41]],.48,4.7],
  [[[48,158],[64,170],[77,164],[84,151],[77,136],[66,140]],-.25,7.1],
  [[[13,157],[21,165],[34,167],[49,160],[49,157],[33,160],[21,159]],.33,3.1],
];
function planeAt(x,y,poly,fall){
  let inside=false,near=1e4;
  for(let j=0,k=poly.length-1;j<poly.length;k=j++){
    const [a,b]=poly[j],[c,d]=poly[k],dx=c-a,dy=d-b,t=sat(((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy));
    near=Math.min(near,Math.hypot(x-a-t*dx,y-b-t*dy));
    if(((b>y)!==(d>y))&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
  }
  return smooth(-fall,fall,inside?near:-near);
}
function bristles(x,y,side){
  let ink=0;
  // The swath bends from almost horizontal on the chin to descending
  // obliques over the jaw and sideburn. Sparse pairs overlap, not a grid.
  const cell=3.75,ii=Math.floor(x/cell),jj=Math.floor(y/cell);
  for(let j=jj-1;j<=jj+1;j++)for(let i=ii-1;i<=ii+1;i++){
    const salt=side<0?7:19;if(hash(i,j,salt)<.41)continue;
    const cx=(i+.08+.80*hash(i,j,salt+1))*cell,cy=(j+.09+.82*hash(i,j,salt+2))*cell;
    const angle=-.93+.28*Math.sin(cx*.059+cy*.053)+.33*(hash(i,j,salt+3)-.5);
    const dx=x-cx,dy=y-cy,a=dx*Math.cos(angle)+dy*Math.sin(angle),b=-dx*Math.sin(angle)+dy*Math.cos(angle);
    const h=(1-smooth(.18,.73+.30*hash(i,j,salt+5),Math.abs(b)))*
      (1-smooth(.44,1.01+.83*hash(i,j,salt+6),Math.abs(a)));
    ink=Math.max(ink,h*(.66+.34*hash(i,j,salt+4)));
  }
  return ink;
}
export function facePaintAt(x,y,z){
  // Let x continue around the side of the cheek towards the ear; the jaw
  // strokes must not pile up where its frontal projection turns vertical.
  const s=x<0?-1:1,a=Math.abs(x)+Math.max(0,z+84)*.56,front=smooth(3,43,-z);
  if(y<23||y>193||!front)return [0,0];
  let field=0;const yy=y+(s<0?2.2*Math.sin(a*.052)-1.6:.6*Math.sin(a*.07));
  for(const [poly,v,fall] of facets)field+=v*planeAt(a,yy,poly,fall);
  for(const [x0,y0,x1,y1,r,bend,amp] of marks)
    field+=amp*stroke(a,yy,x0,y0,x1,y1,r,bend);
  // Muzzle crease and the small return of the lower lip. Blend them out
  // towards the mouth so they never look like a moustache painted in ink.
  const t=sat((95-yy)/24),crease=14.8+14*t+2.3*Math.sin(t*Math.PI);
  field+=s*(.055*bell(yy-96,9)*bell(a-31,13));
  field+=bell(yy-84,13)*(.29*bell(a-crease-2.7,2.8)-.26*bell(a-crease,1.35));
  field+=.29*bell(a-4,5)*bell(yy-53,3.8)-.38*bell(a-4,13)*bell(yy-58,2.4);
  const upper=57+35*smooth(15,64,a)+30*smooth(64,96,a)+3*Math.sin(a*.07+s*.3);
  const beard=smooth(25,38,yy)*(1-smooth(upper-7,upper+3,yy))*(1-smooth(95,113,a));
  const moustache=bell(yy-81.5,4.1)*smooth(1.5,7,a)*(1-smooth(15,23,a))*.46;
  const growth=sat(Math.max(beard,moustache))*front;
  const groups=.72+.20*Math.sin(a*.12+yy*.09)+.08*Math.sin(.29*a-.15*yy);
  const whiskers=growth*groups*(.22+.78*bristles(a,yy,s));
  return [Math.max(-1,Math.min(1,front*field)),sat(whiskers)];
}
export function bakePortraitChannels(p,uv,tri,n,relief){
  const out=Buffer.alloc(n*n*3);for(let k=0;k<n*n;k++){out[3*k]=relief[k];out[3*k+1]=128;}
  for(let j=0;j<tri.length;j+=3){
    const ids=[tri[j],tri[j+1],tri[j+2]],s=ids.map(i=>uv[2*i]*n),t=ids.map(i=>uv[2*i+1]*n);
    // Interior ocular/oral islands are NOT an exterior skin chart.
    if(Math.min(...s)<n*.61||Math.max(...t)<n*.12||Math.min(...t)>n*.91)continue;
    const area=(t[1]-t[2])*(s[0]-s[2])+(s[2]-s[1])*(t[0]-t[2]);if(Math.abs(area)<.0001)continue;
    for(let v=Math.max(0,Math.floor(Math.min(...t)));v<=Math.min(n-1,Math.floor(Math.max(...t)));v++)
      for(let u=Math.max(0,Math.floor(Math.min(...s)));u<=Math.min(n-1,Math.floor(Math.max(...s)));u++){
        const a=((t[1]-t[2])*(u+.5-s[2])+(s[2]-s[1])*(v+.5-t[2]))/area,
          b=((t[2]-t[0])*(u+.5-s[2])+(s[0]-s[2])*(v+.5-t[2]))/area,c=1-a-b;
        if(Math.min(a,b,c)<-.0001)continue;
        const coord=d=>(a*p[3*ids[0]+d]+b*p[3*ids[1]+d]+c*p[3*ids[2]+d])*1000;
        const [plane,whisker]=facePaintAt(coord(0),coord(1),coord(2)),k=3*(v*n+u);
        out[k+1]=Math.round(mix(128,plane<0?8:250,Math.abs(plane)));out[k+2]=Math.round(whisker*255);
      }
  }
  return out;
}
