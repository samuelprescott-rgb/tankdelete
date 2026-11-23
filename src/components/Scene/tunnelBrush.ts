import * as T from 'three';
type V = T.Vector3;
const vec=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
// One vertex-coloured mesh per moving part: no alpha-sorted leaf cards,
// atlas requests, dynamic lights or per-frond animation.
function painter(){
  const xyz:number[]=[],rgb:number[]=[], color=new T.Color();
  function tri(a:V,b:V,c:V,ink:string,shade=1){
    color.set(ink).multiplyScalar(shade);
    for(const p of [a,b,c]){xyz.push(p.x,p.y,p.z);rgb.push(color.r,color.g,color.b);}
  }
  function stick(a:V,b:V,r:number,top:number,ink:string,pigment=1){
    const axis=b.clone().sub(a).normalize(),side=axis.clone().cross(Math.abs(axis.y)>.9?vec(1,0,0):vec(0,1,0)).normalize(),
      back=axis.clone().cross(side),sides=5;
    const ring=(i:number,p:V,w:number)=>p.clone().addScaledVector(side,w*Math.cos(i*2*Math.PI/sides))
      .addScaledVector(back,w*Math.sin(i*2*Math.PI/sides));
    for(let i=0;i<sides;i++){
      const q=ring(i,a,r),u=ring(i+1,a,r),v=ring(i+1,b,top),w=ring(i,b,top);
      // Damp staining is in the object, not the sky light: keep the soil-facing
      // side dark when the hinge exposes it to the low afternoon sun.
      const lower=1-Math.max(0,(a.y-(q.y+u.y)*.5)/r)*.48;
      tri(q,u,v,ink,lower*pigment);tri(q,v,w,ink,lower*pigment);
    }
  }
  function leaf(base:V,angle:number,length:number,width:number,rise:number,ink:string,glint:string){
    const f=vec(Math.cos(angle),0,Math.sin(angle)),side=vec(-f.z,0,f.x);
    const mid=base.clone().addScaledVector(f,length*.42);mid.y+=rise*.72+.065;
    const tip=base.clone().addScaledVector(f,length);tip.y+=rise;
    const left=mid.clone().addScaledVector(side,width),right=mid.clone().addScaledVector(side,-width);
    left.y-=width*.45;right.y-=width*.63;
    tri(base,left,mid,ink);tri(left,tip,mid,ink);tri(mid,tip,right,glint);tri(base,mid,right,glint);
  }
  function finish(name:string){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
    g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));g.computeVertexNormals();
    g.computeBoundingBox();g.computeBoundingSphere();g.name=name;return g;
  }
  return {tri,stick,leaf,finish};
}
export function buildTunnelBrush(){
  const lid=painter(),bank=painter(),litter=['#584c3f','#4c4437','#625544','#484a39'];
  // Neighbouring soil/moss are #625244 / #4b6145. Cut foliage has a
  // folded rim like the local brush, without the mint/yellow tips of dry straw.
  const leaves=[['#304b3b','#47624a'],['#3a503b','#546747'],['#354a35','#5a6649'],
    ['#424e37','#606747'],['#334a3f','#486452'],['#484c38','#646448']];
  // Hinge-space origin is the rear edge. Closely split canes overlap their
  // cross ties; alternating heights leave the weave visible on the underside.
  // Split cane reflects more of the bank light than the cut leaves. This
  // is diffuse pigment only: shadow, orientation and fog still apply.
  const splitCane=1.58;
  for(let i=0;i<15;i++){
    const x=-1.03+i*.148,lo=.008*Math.cos(i*7),hi=1.69+.053*Math.sin(i*3.8);
    const a=vec(x,.027,lo),b=vec(x+.022*Math.sin(i),.018,hi);
    lid.stick(a,b,.065,.060,['#5a5842','#625c47','#4f5542','#58513f'][i%4],splitCane);
    for(const f of [.25,.57,.82]){
      const v=a.clone().lerp(b,f);lid.stick(v,v.clone().add(vec(0,0,.040)),.071,.07,'#424b38',splitCane);
    }
  }
  for(let j=0;j<8;j++){
    const z=.10+j*.21;
    for(let i=0;i<7;i++){
      const x=-1.075+i*.308,y=(i+j)%2?-.058:.069;
      lid.stick(vec(x,y,z),vec(x+.315,-y,z+.014*Math.sin(i*3)),.038,.033,j%3?'#6c6048':'#4c503c',splitCane);
    }
  }
  // Arching sprays with alternating folded leaf blades. Each side has a
  // differently lit plane rather than a tuft of identical upward triangles.
  for(let i=0;i<32;i++){
    const phi=i*2.399963,root=vec(.71*Math.cos(phi)*Math.sqrt((i+.5)/32),.085,
      .84+.52*Math.sin(phi)*Math.sqrt((i+.5)/32)),len=.34+.32*(.5+.5*Math.sin(i*8.17)),
      h=.39+.36*(.5+.5*Math.sin(i*1.79)),axis=vec(Math.cos(phi),0,Math.sin(phi));
    const crown=root.clone().addScaledVector(axis,len*.66);crown.y+=h;
    const tip=crown.clone().addScaledVector(axis,len*.48);tip.y-=.11;
    lid.stick(root,crown,.024,.013,i%3?'#485840':'#555f45');
    lid.stick(crown,tip,.014,.005,'#54644b');
    for(let j=0;j<7;j++){
      const q=j/7,base=root.clone().lerp(crown,.13+.84*q),turn=(j%2?1:-1)*(.57+.58*(1-q));
      const [dark,light]=leaves[(i+j*2)%leaves.length];
      lid.leaf(base,phi+turn,.31+.21*(1-q),.055+.042*(1-q),.10-.15*q,dark,light);
    }
    lid.leaf(crown,phi,.39,.074,-.16,...leaves[i%6] as [string,string]);
  }
  // A bent central spray crosses the hub so the shallow weave is not left
  // bald when looked at from above.
  lid.stick(vec(-.27,.09,.76),vec(-.17,.54,.85),.024,.012,'#48553f');
  lid.leaf(vec(-.25,.48,.86),.08,.52,.12,-.04,'#3a503b','#526748');
  lid.leaf(vec(-.14,.54,.84),.99,.39,.078,.029,'#3d5240','#5c7054');
  // Dark earth beneath and an uneven raised rim: when the mat opens there
  // is a visible shaft, soil layers and embedded roots, not a glowing portal.
  const N=22,c=vec(0,.005,0);
  const rim=(i:number,r:number,h:number)=>{const a=i*2*Math.PI/N,ir=1+.04*Math.sin(a*5);
    return vec(Math.cos(a)*1.27*r*ir,h,Math.sin(a)*1.04*r*ir);};
  for(let i=0;i<N;i++){
    const a=rim(i,.83,.012),b=rim(i+1,.83,.012),u=rim(i,.96,.146),v=rim(i+1,.96,.146);
    bank.tri(c,a,b,'#171b17');bank.tri(a,u,b,'#3c352c');bank.tri(u,v,b,'#504637');
    const e=rim(i,1.21,.012),f=rim(i+1,1.21,.012);
    bank.tri(u,e,v,litter[i%4]);bank.tri(e,f,v,litter[(i+2)%4]);
    const phi=i*2*Math.PI/N;
    if(i%3!==0){
      const base=rim(i,1.12,.07);
      for(let j=0;j<3;j++)bank.leaf(base,phi+(j-1)*.70,.27+j*.068,.057,.04+j*.049,...leaves[i%6] as [string,string]);
    }
  }
  return {cover:lid.finish('bamboo-weave-and-leafy-brush'),earth:bank.finish('root-lined-tunnel-mouth')};
}
export function hatchOpening(age:number,warning:number){
  const t=Math.min(1,Math.max(0,(age/warning-.16)/.74)),ease=t*t*(3-2*t);
  return -.025-1.55*ease-.038*Math.sin(age*15)*Math.sin(Math.min(1,age/(warning*.42))*Math.PI);
}
