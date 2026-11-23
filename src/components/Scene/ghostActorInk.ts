// Original 96-cell actor cels. Coordinates describe ink clusters, not samples
// of an existing model. Silhouette, material ramps and gear change with view.
export type InkActor = 'us'|'vc'|'boss'|'undead';
export const INK_CELL=96;
const N=INK_CELL;
type XY=[number,number];
const COLORS=[0,0x161d22,0x26312e,0x364338,0x526143,0x748155,0x9caa71,
  0x3c2d2c,0x70463a,0xa0664b,0xc78b64,0xe4b184,0xf4cca0,
  0x302e29,0x50453a,0x71614b,0x9d8965,0xc2ac7c,
  0x212c35,0x384651,0x576770,0x85918c,0xb8beb0,
  0x293937,0x40564a,0x587361,0x7d9376,0xb2b798,
  0x482e42,0x714457,0xa55868,0xdb807d,0xf3a184,0xe2d1a7,0x885336,0xca8150,0xe85942,
  0x161d22,0x292220,0x46312f,0x62443e,0x8b5e4a,0xad7b5c,0xca9772,
  0xe0b18a,0xf4d3ac,0xd3cfbb,0x979b95,0x6f7068,0xf8ecd2,
  // Front portrait has its own cooler, lower exposure flesh & hair ramp.
  // The rear portrait keeps the bright silver crown as its own identifier.
  0x1e1a23,0x31232b,0x48313a,0x5e3c3d,0x794746,0x935749,0xb37559,
  0xc98a69,0xd69d76,0xc8ad90,0x746b65,0x9b7970,0xd5bfa3];
export const ACTOR_PALETTE=COLORS;
function canvas() {
 const data=new Uint8Array(N*N);
 const pixel=(x:number,y:number,c:number)=>{x=Math.floor(x);y=Math.floor(y);if(x>=0&&x<N&&y>=0&&y<N)data[y*N+x]=c;};
 const rect=(x:number,y:number,w:number,h:number,c:number)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)pixel(i,j,c);};
 const poly=(c:number,...pts:XY[])=>{
  const min=Math.min(...pts.map(p=>p[1])),max=Math.max(...pts.map(p=>p[1]));
  for(let y=Math.floor(min);y<Math.ceil(max);y++){
   const cuts:number[]=[];
   for(let i=0;i<pts.length;i++){const [x1,y1]=pts[i],[x2,y2]=pts[(i+1)%pts.length],py=y+.5;
    if((y1<=py&&py<y2)||(y2<=py&&py<y1))cuts.push(x1+(x2-x1)*(py-y1)/(y2-y1));}
   cuts.sort((a,b)=>a-b);for(let i=0;i+1<cuts.length;i+=2)for(let x=Math.ceil(cuts[i]-.5);x<cuts[i+1]-.5;x++)pixel(x,y,c);
  }
 };
 const line=(x:number,y:number,x2:number,y2:number,c:number,w=1)=>{const d=Math.max(Math.abs(x2-x),Math.abs(y2-y),1);for(let i=0;i<=d;i++)rect(Math.round(x+(x2-x)*i/d),Math.round(y+(y2-y)*i/d),w,w,c);};
 return {data,pixel,poly,rect,line};
}
type Pen=ReturnType<typeof canvas>;
function helmet(p:Pen,x:number,y:number,side:number,vc:boolean,back:boolean,boonie:boolean){
 const {poly,rect,line}=p;
 let a=vc?24:3,b=vc?25:4,c=vc?26:5;
 const P=(color:number,...pts:XY[])=>poly(color,...pts.map(([i,j]):XY=>[x+i,y+j]));
 P(1,[-12,9],[-11,4],[-7,0],[2,-2],[8,0],[11,4],[12,8],[14+side,9],[14+side,12],[-13,13],[-14,11]);
 P(a,[-11,10],[-10,5],[-7,2],[-1,0],[6,0],[10,4],[11,9],[12+side,10],[-11,12]);
 P(b,[-10,8],[-8,3],[-2,1],[4,1],[7,3],[6,6],[0,8],[-4,6]);
 P(c,[-8,6],[-7,4],[-3,2],[2,2],[0,4],[-4,5],[-4,7]);
 if(vc&&!boonie){
  P(1,[-16,11],[-12,8],[-5,8],[8,8],[16,11],[15,13],[4,12],[-8,14],[-16,13]);
  P(b,[-15,11],[-10,9],[7,9],[14,11],[8,11],[-8,13],[-15,12]);
  line(x+1,y+1,x+4,y+8,a);line(x-6,y+3,x-9,y+8,b);rect(x-1,y-2,3,2,a);rect(x-7,y+8,13,1,c);
 }
 else {P(a,[-10,9],[-5,7],[-1,8],[2,5],[6,5],[5,9]);rect(x+3,y+3,3,1,b);}
 if(boonie){P(1,[-15,10],[-7,8],[5,8],[17,11],[15,13],[6,12],[-8,14],[-16,12]);P(b,[-15,11],[-6,9],[5,9],[14,11],[7,11],[-7,13]);}
 else {rect(x-11,y+10,18,1,vc?26:5);rect(x+7,y+9,5+side,1,b);}
 if(!back&&!vc){rect(x-7,y+7,2,3,15);rect(x-5,y+6,1,4,16);}
}
function soldier(p:Pen,kind:InkActor,angle:number,step:number,kneel:boolean,variant:number){
 const vc=kind==='vc',dead=kind==='undead',back=angle>=3,side=angle===2?1:0;
 const k=kneel?19:0,w=side?3:0,lean=step===1?1:0,dx=[0,4,6,3,0][angle], cx=44+lean, h=3+k;
 const {poly,rect,line}=p;
 const body0=dead?23:vc?23:2,body1=dead?24:vc?24:3,body2=dead?25:vc?25:4,hi=dead?26:vc?26:5;
 const skin0=dead?23:7,s1=dead?24:8,s2=dead?25:9,s3=dead?26:10,s4=dead?27:11;
 const P=(color:number,...pts:XY[])=>poly(color,...pts.map(([a,b]):XY=>[cx+a,h+b]));
 // A planted boot has a welt, toe cap and broken mud highlight; back foot stays darker.
 const leg=(hip:number,kx:number,ky:number,ax:number,ay:number,near:boolean,folded=false)=>{
  const dark=near?body1:body0,mid=near?body2:body1;
  poly(1,[hip-4,48+k],[hip+5,48+k],[kx+5,ky],[ax+4,ay],[ax-5,ay],[kx-5,ky+2]);
  poly(dark,[hip-3,49+k],[hip+4,49+k],[kx+4,ky+1],[ax+3,ay],[ax-3,ay],[kx-4,ky+1]);
  poly(mid,[hip-3,49+k],[hip+3,49+k],[kx+3,ky-2],[kx-1,ky+1],[kx-3,ky-2]);
  line(kx-3,ky+2,kx+1,ky+2,near?hi:mid);line(ax-2,ay-7,ax+1,ay-6,mid);
  poly(1,[ax-5,ay-3],[ax+3,ay-3],[ax+4,ay+2],[ax+(folded?6:8),ay+3],[ax+(folded?6:8),ay+6],[ax-5,ay+6]);
  rect(ax-3,ay-2,6,5,14);rect(ax-2,ay,3,1,16);rect(ax+2,ay+3,4,1,15);
 };
 const walk=[0,-4,3][step],backFoot=back?-1:1;
 if(kneel){leg(cx-5,cx-12,85,cx-19,83,false,true);leg(cx+5,cx+15,66,cx+12,84,true);}
 else {leg(cx-5,cx-6-walk,65,cx-8-walk*backFoot,83,false);leg(cx+5,cx+6+walk,66,cx+7+walk*backFoot,85,true);}
 // Web pack breaks shoulder profile even in front three-quarter views.
 P(1,[-13+w,22],[-18+w,25],[-19+w,41],[-16+w,46],[-8,45],[-6,25]);
 P(14,[-15+w,24],[-17+w,27],[-17+w,40],[-14+w,43],[-10,43],[-9,25]);rect(cx-16+w,h+28,3,7,15);
 if(variant===0&&!vc&&!dead){line(cx-15+w,h+26,cx-17+w,h+10,18);rect(cx-18+w,h+9,2,3,19);}
 P(1,[-13+w,22],[-6,18],[5,18],[12-w,21],[17-w,26],[13-w,34],[10-w,49],[7,52],[-10,51],[-13+w,44],[-15+w,29]);
 P(body1,[-12+w,23],[-5,20],[5,20],[12-w,22],[15-w,27],[10-w,33],[8,49],[-9,49],[-12+w,43]);
 P(body2,[-11+w,24],[-5,21],[3,21],[7,23],[4,28],[6,36],[3,41],[-6,42],[-9,38]);
 P(hi,[-8,24],[-4,22],[0,22],[-3,25],[-4,31],[-6,30]);
 P(body0,[-8,39],[-3,38],[0,40],[6,37],[8,38],[3,43],[-6,45],[-9,44]);
 if(back){
  P(1,[-10,24],[2,22],[9,25],[10,40],[6,45],[-9,43],[-12,37]);
  P(14,[-9,25],[2,24],[7,26],[8,39],[5,43],[-8,42],[-10,35]);
  rect(cx-8,h+26,13,7,15);rect(cx-6,h+27,8,1,16);rect(cx-7,h+35,5,5,13);rect(cx,h+36,6,5,13);
  rect(cx-5,h+31,2,5,16);rect(cx+3,h+31,2,5,16);
 } else {
  line(cx-8+w,h+22,cx-5,h+41,13,3);line(cx-8+w,h+23,cx-5,h+39,16);
  line(cx+8-w,h+22,cx+4,h+40,14,3);line(cx+8-w,h+23,cx+4,h+39,17);
  rect(cx-6,h+31,5,5,body1);rect(cx-6,h+31,5,1,hi);line(cx,h+25,cx+1,h+38,body1);
 }
 rect(cx-10+w,h+43,20-w*2,3,13);rect(cx-9+w,h+43,18-w*2,1,16);rect(cx,h+43,3,2,17);
 for(const x of [-10,5]){rect(cx+x+w/3,h+42,5,7,14);rect(cx+x+w/3,h+42,5,2,16);rect(cx+x+w/3+2,h+44,1,1,17);}
 if(vc&&!back){
  // Distinct canvas chest rig: three tall pockets with individual flap
  // shadows, instead of the US web harness and radio pack silhouette.
  for(const x of [-7,-2,3]){rect(cx+x,h+34,5,9,13);rect(cx+x,h+34,4,7,15);rect(cx+x,h+34,4,2,16);rect(cx+x+1,h+36,2,1,14);}
  line(cx-7,h+24,cx-6,h+33,14,2);line(cx+6-w,h+24,cx+3,h+33,16);
 }
 P(skin0,[-5,17],[4,17],[7,21],[4,25],[-2,24],[-6,20]);
 P(s2,[-3,17],[4,18],[5,20],[3,23],[-2,22]);
 const fx=cx+dx,fy=h-1;
 const F=(c:number,...pts:XY[])=>poly(c,...pts.map(([a,b]):XY=>[fx+a,fy+b]));
 F(1,[-9,9],[-7,5],[5,5],[9,9],[8,14],[10+side,15],[10+side,17],[7,18],[6,21],[2,23],[-4,22],[-7,19],[-8,16],[-10,15]);
 if(back){F(skin0,[-8,10],[7,10],[7,15],[6,19],[1,22],[-4,20],[-7,17]);rect(fx+4,fy+14,3,4,s2);if(angle===3)rect(fx+6,fy+15,2,3,s3);}
 else {
  F(s2,[-8,10],[6,9],[8,12],[7,14],[9+side,15],[9+side,16],[6,17],[6,19],[2,22],[-3,21],[-6,18],[-7,15],[-9,14]);
  F(s3,[-4,11],[4,10],[6,12],[5,14],[7,15],[5,16],[2,15],[3,17],[5,17],[4,19],[1,20],[-2,18],[-4,15]);
  rect(fx-8,fy+13,3,4,s3);rect(fx-7,fy+14,1,1,s1);
  line(fx-5+side,fy+12,fx-2+side,fy+13,s1);rect(fx+2,fy+12,4,1,skin0);
  rect(fx+4,fy+13,2,1,dead?36:skin0);if(!side)rect(fx-3,fy+14,1,1,dead?36:s4);
  rect(fx+5,fy+15,3,1,s4);rect(fx+2,fy+18,4,1,s1);rect(fx+1,fy+20,3,1,s4);
 }
 helmet(p,fx,fy-1,side,vc,back,vc&&variant%2===1);
 const reach=[2,13,24,14,2][angle],gunX=cx-4,gunY=h+25,tip=cx+11+reach;
 // Foreshorten the actual illustrated rifle toward/away from the viewer;
 // its front sight, recessed magwell and walnut or grey furniture remain distinct.
 if(!dead){
  poly(1,[gunX-8,gunY-1],[gunX,gunY-1],[gunX+2,gunY],[tip-5,gunY],[tip-5,gunY+1],[tip,gunY+1],[tip,gunY+3],[gunX+10,gunY+3],[gunX+9,gunY+6],[gunX+6,gunY+7],[gunX+5,gunY+3],[gunX-2,gunY+3],[gunX-7,gunY+5]);
  rect(gunX-7,gunY,6,3,vc?34:19);rect(gunX,gunY,10,2,20);rect(gunX+9,gunY+1,Math.max(2,reach-2),2,vc?34:19);
  rect(tip-5,gunY-2,1,3,19);rect(tip-4,gunY+1,4,1,21);rect(gunX+7,gunY+3,2,3,19);
  if(!vc){rect(gunX+1,gunY-2,5,1,19);rect(gunX+1,gunY-1,1,1,20);rect(gunX+5,gunY-1,1,1,20);}
 }
 const gx=cx+Math.max(4,reach*.53),gy=gunY+3;
 P(1,[-14+w,24],[-9+w,24],[-5,32],[0,29],[4,29],[4,32],[-5,37],[-10,36],[-15+w,30]);
 P(body2,[-13+w,25],[-10+w,25],[-7,29],[-10,32],[-13+w,30]);
 P(s2,[-10,31],[-7,30],[-5,33],[1,29],[4,29],[3,32],[-5,36],[-8,35]);
 line(cx-6,h+34,cx,h+31,s3);rect(cx+1,h+28,3,3,s3);
 line(cx+10-w,h+29,gx-2,gy+3,skin0,3);line(cx+10-w,h+29,gx-2,gy+2,s2,2);rect(gx-1,gy-1,4,3,s3);
}

function nightmare(p:Pen,angle:number,step:number) {
 const {poly,rect,line}=p,profile=angle===2,back=angle>=3,shift=[0,3,5,3,0][angle],move=[0,2,-2][step]??0;
 // Four anatomically separate wrists: the rear pair hang low, framing the
 // ribcage, while the crooked forward claws occupy the outside silhouette.
 function arm(s:number,rear:boolean){
  const x=(n:number)=>48+s*(n-(profile?5:0)),dy=rear?6:0,t=rear?move:-move;
  // Two extra boss cels only: spread/raise the front claws, then drive
  // them down inside the body silhouette. Preserve the rear pair and face.
  const pose=(u:number,v:number):XY=>{
   if(rear||step<3)return [x(u),v+dy];
   const reach=Math.max(0,Math.min(1,(u-15)/27));
   const swing=step===3?-1:1;
   return [x(u-reach*(step===3?2:11)),v+dy+swing*reach*(step===3?32:15)];
  };
  const pts=(pa:XY[]):XY[]=>pa.map(([u,v])=>pose(u,v));
  const P=(c:number,...pa:XY[])=>poly(c,...pts(pa));
  const reach=rear?24:43,elbow=rear?27:34,y=rear?64:43;
  P(1,[9,26],[19,22],[25,24],[27,29],[elbow+2,34+t],[elbow+4,36+t],[reach+1,y-2+t],[reach+3,y+2+t],[reach+2,y+7+t],[reach,y+4+t],[reach-2,y+9+t],[reach-3,y+4+t],[reach-6,y+7+t],[reach-5,y-2+t],[elbow-4,39+t],[15,37]);
  P(rear?23:28,[12,27],[19,24],[24,25],[25,30],[elbow+1,35+t],[reach,y-1+t],[reach+1,y+2+t],[reach-4,y+2+t],[elbow-5,38+t],[16,35]);
  P(rear?24:29,[15,26],[20,24],[23,26],[24,30],[elbow-1,35+t],[elbow-4,36+t],[19,33]);
  P(rear?25:30,[elbow-1,37+t],[elbow+1,37+t],[reach,y-1+t],[reach-1,y+1+t],[reach-3,y-2+t]);
  line(...pose(reach-3,y+1+t),...pose(reach-4,y+3+t),back?26:32);
  line(...pose(16,27),...pose(20,31),rear?25:31);
 }
 function leg(s:number,near:boolean){
  const x=48+s*(profile?4:8),dx=near?move:-move;
  poly(1,[x-5,52],[x+5,52],[x+6,61],[x+4+dx,70],[x+5+dx,74],[x+3+dx,84],[x+6+dx,87],[x+7+dx,91],[x-7+dx,91],[x-7+dx,87],[x-4+dx,83],[x-5+dx,71],[x-6,65]);
  poly(near?23:2,[x-4,54],[x+4,53],[x+4,60],[x+2+dx,69],[x-3+dx,71],[x-4,64]);
  poly(near?25:24,[x-4,57],[x+2,55],[x+3,59],[x,63],[x-2+dx,68],[x-4+dx,65]);
  poly(near?29:23,[x-4+dx,72],[x+3+dx,70],[x+3+dx,75],[x+1+dx,82],[x-3+dx,84]);
  line(x-3+dx,73,x-2+dx,79,near?31:25);rect(x-4+dx,86,7,2,24);rect(x+1+dx,88,4,1,26);
 }
 arm(-1,true);arm(1,true);leg(-1,false);leg(1,true);
 poly(1,[23,27],[25,21],[34,22],[37,19],[42,20],[54,20],[58,18],[66,22],[71,20],[72,27],[66,38],[60,44],[58,53],[63,60],[56,59],[55,63],[49,59],[45,62],[41,58],[36,60],[38,51],[35,42],[30,37]);
 poly(23,[31,27],[38,23],[44,22],[54,22],[61,26],[65,28],[62,37],[57,43],[54,51],[58,57],[50,55],[44,58],[39,56],[41,49],[37,39]);
 poly(24,[31,28],[38,24],[44,24],[42,28],[36,32],[37,37],[34,35]);
 poly(25,[34,27],[40,23],[45,23],[43,25],[38,27],[36,30],[34,30]);
 poly(28,[38,31],[47,28],[57,30],[60,33],[55,42],[51,47],[46,46],[40,42]);
 for(let s=-1;s<=1;s+=2)for(let j=0;j<4;j++){
  const y=31+j*3,x=48+s*(10-j);
  line(x,y,x-s*4,y+2,back?25:15,2);line(x,y,x-s*3,y+1,back?26:17);
 }
 if(back){line(50,26,47,47,23,3);for(let j=0;j<7;j++)rect(48,28+j*3,3,1,26);}
 else {poly(29,[47,30],[51,29],[50,34],[53,35],[49,43],[45,44],[47,37],[45,35]);line(49,32,47,39,30,2);rect(48,34,2,2,32);}
 line(40,51,54,49,2,3);rect(44,50,4,2,15);arm(-1,false);arm(1,false);
 // A torn field mantle spans BOTH shoulders; the rear limbs hang below it.
 for(const s of [-1,1]){
  const x=(off:number)=>48+s*off;
  poly(1,[x(6),25],[x(12),22],[x(21),21],[x(25),19],[x(26),24],[x(30),29],[x(28),32],[x(23),30],[x(21),33],[x(18),29],[x(14),32],[x(11),27]);
  poly(23,[x(9),25],[x(15),23],[x(21),23],[x(25),21],[x(24),25],[x(28),29],[x(23),28],[x(21),30],[x(19),27],[x(15),29]);
  line(x(13),25,x(20),23,25,2);line(x(19),24,x(24),22,26);line(x(22),27,x(26),28,24);
 }
 // Deliberately keep the encounter's two original identities. These compact
 // indexed cutouts are re-inked from its existing front and rear portrait
 // assets, with matte clusters instead of photograph quads over a model.
 const portrait=(mask:string[],center:number,sy:number,width:number,height:number,shade:boolean)=>{
  const srcW=mask[0].length;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const sx=Math.floor(x*srcW/width),yy=Math.floor(y*mask.length/height);
   let ch=mask[yy][sx];
   if(ch==='.')continue;const ix=ch.charCodeAt(0)-65;
   const index=shade?(ix>8?10:Math.max(0,ix-2)):ix;
   p.pixel(center-Math.floor(width/2)+x,sy+y,(mask===FRONT_MASK?50:37)+index);
  }
 };
 if(angle!==0&&angle!==4)portrait(back?FRONT_MASK:REAR_MASK,43-(profile?1:0),4,profile?16:13,24,true);
 portrait(back?REAR_MASK:FRONT_MASK,48+shift,1,profile?17:back?25:29,27,false);
}

const FRONT_MASK_SOURCE=`..........BBAAAAA...........
........BBBBAAAAAAA.........
.......CCBAAAAAAABABB.......
......CCBBBBCDEECBBBB.......
.....CCCCBCFFGGFECBCBB......
....DCCCCCFHHHHGFEBBCB......
....CCDDCDHIIHHHGFCBCCC.....
....BCDDDFIIIIIHHGEBDCC.....
...BCBBDCFHIIIIHGGFBDDCC....
...BBABCDGGGIIHFFGFBDDDC....
...BAABBCEDEHHGEDDFCCDCC....
...AABABDFFFGHGGGGGDBCCDC...
...AABACFHHHHHGHIHGEBBBCC...
..AAAAADGHIHHIGGHHHEBAABC...
...AAACEGHHHHHGGHGGFDAAAB...
...BBADEFGGGGHGGFGGECAAA....
....BAAAEHHFHJJFFHFAAAAA....
....AAAADFHGGJHFHGDABAB.....
....AAAACFGHHGGHGFDABBBC....
..CBAAAACFEGIIIHFEBAAAABC...
.BCBBAAABGFFGHGFFFBAAAABC...
.BCCBAAACFGGFGFFGFBAABBBBCC.
..AABA..EFGGGGGGGFCAABBBBBB.
..AAA...EGGGGGGGGFD.BBBBAABB
.........GGGGGHHHG.....BA...
..........HHHHHHH...........
...........HGHGH............`.split('\n');
// Reinstate the anatomical planes most often lost to the palette pass. Dark
// grouped brows and pupils read from the chase view; teeth do not become a
// white hole and the transition from the jaw to the mantle stays in shadow.
const FRONT_MASK=FRONT_MASK_SOURCE.map((row,y)=>{
 const ret=row.split('');
 const stroke=(x:number,ink:string)=>{for(let i=0;i<ink.length;i++)if(ret[x+i]!=='.')ret[x+i]=ink[i];};
 if(y===3)stroke(7,'DEDC');
 if(y===6)stroke(6,'DED');
 if(y===8){stroke(10,'GGH');stroke(15,'HHG');}
 if(y===9){stroke(9,'CCDE');stroke(15,'DCCE');}
 if(y===10){stroke(9,'EEFE');stroke(15,'FEEG');}
 if(y===11){stroke(9,'CBEC');stroke(15,'CBDD');}
 if(y===12){stroke(10,'FGG');stroke(15,'EGH');}
 if(y===13){stroke(13,'GFFE');stroke(18,'GF');}
 if(y===14)stroke(13,'HFJE');
 if(y===15){stroke(11,'GFEDE');stroke(18,'EF');}
 if(y===16)stroke(10,'DDEEEEED');
 if(y===17)stroke(11,'EJJMJGE');
 if(y===18)stroke(11,'FDDDDCF');
 if(y===19)stroke(11,'GHGFF');
 if(y===20)stroke(11,'FGHGFE');
 if(y===21)stroke(10,'EFFGGFDE');
 if(y===22)stroke(11,'EEEEF');
 if(y>=24)for(let x=0;x<ret.length;x++)if(ret[x]==='G'||ret[x]==='H')ret[x]=y>=25?'E':'F';
 return ret.join('');
});
const REAR_MASK=`.......JJJJJJJJJ........
....JJJMJJJJJJJJJJJ.....
...JJJHHJJJJHHHHHGHHK...
..KHGHGGGGGGGGGGGGGGKK..
.KKGHJGGGGGGGGGGFGGFFKK.
.KKGGGGGGGGHHGGGGFFFFFF.
.KLFFFFGGGGGGGGGFFEEELL.
.KLFFFFFFGFFFGGFFFFEFLL.
.KFKFFFFFGGGGGGFFFFFFKF.
FKKFFFFFFFFFFFFFFFFFFKFE
EFKGFEELDDCEEDDDDEEFFKFE
FDFGFEDDCDEFFEDCDDEFFEDF
FEFFFFFFEFFGFFFFFFFFFEEF
.FEFFFFGGFEGGFFGGFFEEEF.
.FFFEEFFEEEFFEEEFFEEEFF.
..EFEEEEEEDCCDEEEEEEE...
....EEEEEFEEEEFFEEEEE...
....EEEEDDCCCCCDEFEE....
....EEEEDDDDDDDEEFFE....
.....EEEEEEDDDEEEEEE....
.....EDDEEEEEEEEDDEE....
....FEDDDEEEEEEDDDEF....
.....FEDDCCDCCCDDEEF....
.....FFEDDDDDDDDEEF.....
......FFEDDCCCDEEFE.....
.......EEFEDEEEEE.......
.........EEEEFF.........`.split('\n');

// These two original painted portraits are also the pigment source for the
// solid double-faced skull. No camera or sprite frames participate in the rig.
export const COMMAND_FACE_INK = [FRONT_MASK, REAR_MASK] as const;

/** angle 0..4 front, quarter, profile, rear quarter, reverse (opposite side mirrored). */
export function paintGhostActor(kind:InkActor,angle:number,step:number,kneel=false,variant=0){
 const p=canvas(); if(kind==='boss')nightmare(p,angle,step);else soldier(p,kind,angle,step,kneel,variant);
 return p.data;
}
