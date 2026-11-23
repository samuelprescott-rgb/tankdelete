import * as T from 'three';

// x, filled half-height, filled half-width, lifted-mouth centre. Longitudinal
// sections deliberately resolve the knot; a UV sphere puts its poles on top
// and leaves very few samples to distinguish twine from stuffing at either end.
const sections=[
  [-.980,.12,.38,.03],[-.93,.62,.69,.015],[-.79,.86,.88,0],
  [-.57,.97,.97,0],[-.27,1.,1.,0],[.09,.99,1.,0],[.38,.96,.98,-.018],
  [.55,.86,.87,-.025],[.66,.66,.70,.02],[.738,.48,.52,.075],
  [.778,.315,.35,.134],[.802,.365,.393,.132],[.826,.287,.306,.145],
  [.885,.445,.44,.19],[.955,.54,.53,.23],
] as const;
const walls=12,soft=(n:number,p:number)=>Math.sign(n)*Math.abs(n)**p;
export function createFieldSackShell(){
  const p:number[]=[],idx:number[]=[],uv:number[]=[],feature:number[]=[];
  const vertex=(x:number,y:number,z:number,shade:number,cord:number)=>{
    const i=p.length/3;p.push(x,y,z);uv.push((1+x)*.5,(1+y)*.5);feature.push(shade,cord);return i;
  };
  for(let i=0;i<sections.length;i++){
    const [x,h,w,cy]=sections[i],tail=Math.max(0,(x-.826)/.129),gus=Math.max(0,(-x-.75)/.23);
    const gather=Math.max(0,1-Math.abs(x-.77)/.31);
    for(let j=0;j<walls;j++){
      const a=j*2*Math.PI/walls,c=Math.cos(a),s=Math.sin(a),crown=soft(c,.76),side=soft(s,.59);
      // Folded ears: a V-shaped cloth mouth turns back on itself above
      // the neck. The opposite end is a boxed gusset with a mitred corner.
      const tuck=.5+.5*Math.cos(3*a+5*x+.51),wave=.5+.5*Math.cos(2*a-.72);
      const press=(.5+.5*Math.cos(a*2+x*5.9+.31))**5*(.025+.045*soft(Math.abs(x),1));
      const xx=x+tail*(.05*(2*wave-1)-.026*s)+gus*.021*(1.+c*s);
      const yy=cy+h*(crown*(1-gather*.19*tuck)-press)+tail*(.14*s-.11*(1-wave))
        -.058*(1-x*x)*Math.max(0,crown);
      const zz=w*side*(1-gather*.20*tuck-press*.73)+.031*Math.sin(x*3.8)+tail*.077*c;
      const ring=i===11?1:0,sharp=i===10||i===12;
      vertex(xx,Math.max(-.84,yy),zz,.996-.12*gather*tuck-.08*gus*(1-wave)-.12*Number(sharp),ring);
      if(i){const prev=(i-1)*walls+j,k=(i-1)*walls+(j+1)%walls;
        idx.push(prev,k,prev+walls,k,k+walls,prev+walls);}
    }
  }
  for(const upper of [false,true]){
    const start=upper?(sections.length-1)*walls:0;
    // Recess interior of the rolled lip; the sack stays fully closed, even underneath.
    const cap=upper?vertex(.887,.21,.018,.64,0):vertex(-.998,.012,0,.79,0);
    for(let j=0;j<walls;j++){const a=start+j,b=start+(j+1)%walls;idx.push(a,upper?b:cap,upper?cap:b);}
  }
  // A knotted tail laid over the front of the mouth, one tapered 4-sided
  // folded strand. Same index buffer, instance, material, and shadow caster.
  const path=[[.797,.19,.378,.045],[.792,.222,.446,.068],[.755,.154,.513,.047],
    [.742,.044,.533,.036],[.693,-.121,.587,.032],[.661,-.199,.579,.013]];
  const from=p.length/3;
  path.forEach(([x,y,z,r],k)=>{
    for(let j=0;j<4;j++){const a=j*Math.PI*.5+.3;vertex(x+r*Math.cos(a),y+.19*r*Math.sin(a),z+r*Math.sin(a),.89+.16*(j===0?1:0),1);
      if(k){const l=from+4*(k-1)+j,m=from+4*(k-1)+(j+1)%4;idx.push(l,m,l+4,m,m+4,l+4);}}
  });
  const end=from+4*(path.length-1);idx.push(from,from+2,from+1,from,from+3,from+2,end,end+1,end+2,end,end+2,end+3);
  const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute('position',new T.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('sackFinish',new T.Float32BufferAttribute(feature,2));
  g.computeBoundingBox();const a=g.boundingBox!.min.y,b=g.boundingBox!.max.y,attr=g.getAttribute('position');
  for(let i=0;i<attr.count;i++)attr.setY(i,-1+2*(attr.getY(i)-a)/(b-a)); // same actual stack height
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
