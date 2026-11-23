import * as T from 'three';
import {writeAnnexStreetMasonry} from './annexStreetMasonry';
type Mason = (x:number,y:number,z:number,w:number,h:number,d:number,ink:string,tilt?:number)=>void;
type Pt=[number,number,number];
// Two different failures. Records kept the high end of its tiled reading
// room. Dispatch lost the seaward corner and its roof fell INTO the room.
// The fire pass samples these SAME breaks so its light never paints open sky.
export const ANNEX_CROWNS={
  records:[[-.28,3.30],[-.16,3.82],[.05,3.74],[.18,4.39],[.42,4.31],[.49,4.81],
    [.72,4.66],[.88,5.31],[1.14,5.21],[1.22,5.75],[1.48,5.61],[1.55,5.94],
    [1.87,5.83],[2.05,6.18],[2.24,6.04],[2.45,6.29],[2.66,6.13]],
  dispatch:[[-.22,5.16],[-.04,5.04],[.15,5.30],[.28,5.52],[.46,5.36],[.58,5.02],
    [.73,5.10],[.81,4.92],[.98,4.84],[1.09,4.55],[1.29,4.68],[1.41,4.31],
    [1.63,4.44],[1.72,3.86],[1.95,4.00],[2.07,3.62],[2.28,3.73],[2.41,3.43],[2.66,3.49]],
} satisfies Record<string,[number,number][]>;

/** Torn concrete has a broken silhouette and raw *thickness*; silhouettes
 * are scaled to read from the road, not hairline cracks in an intact cube. */
export function createAnnexBreakage(id:'records'|'dispatch'){
  const pos:number[]=[],color:number[]=[],indices:number[]=[],ink=new T.Color();
  let side=id==='records'?1:-1;
  const quad=(a:Pt,b:Pt,c:Pt,d:Pt,pigment:string,reverse=false)=>{
    const first=pos.length/3;ink.set(pigment);
    for(const p of [a,b,c,d]){pos.push(side*p[0],p[1],p[2]);color.push(ink.r,ink.g,ink.b);}
    indices.push(...((side<0)!==reverse?[0,2,1,0,3,2]:[0,1,2,0,2,3]).map(i=>first+i));
  };
  const edge=(floor:number,z:number,points:[number,number][],width:number,end=false)=>{
    // Rotate a complete thickness-bearing section onto the side of a room.
    const fix=(p:Pt):Pt=>end?[p[2],p[1],-p[0]]:p;
    const face=(a:Pt,b:Pt,c:Pt,d:Pt,pigment:string,reverse=false)=>quad(fix(a),fix(b),fix(c),fix(d),pigment,reverse);
    for(let i=1;i<points.length;i++){
      const [x,h]=points[i-1],[u,j]=points[i],slip=.025*Math.sin(i*3.2);
      const lo:Pt=[x,floor,z],ro:Pt=[u,floor,z],lt:Pt=[x,h,z+.025*Math.sin((i-1)*3.2)],rt:Pt=[u,j,z+slip],
        back=(p:Pt):Pt=>[p[0],p[1],p[2]-width];
      face(lo,ro,rt,lt,i%3?'#b3afa1':'#a4a59b');
      face(back(lo),back(ro),back(rt),back(lt),'#777368',true);
      face(lt,rt,back(rt),back(lt),i%3?'#c49676':'#a98773');
      const scar=(p:Pt,k:number):Pt=>[p[0],p[1]-.085-.055*(k%2),p[2]+.005];
      face(scar(lt,i-1),scar(rt,i),[rt[0],rt[1],rt[2]+.005],[lt[0],lt[1],lt[2]+.005],'#ac876b');
      if(i===1)face(lo,lt,back(lt),back(lo),'#695e58',true);
      if(i===points.length-1)face(ro,rt,back(rt),back(ro),'#82715f');
    }
  };
  edge(.36,1.66,[[-2.66,2.73],[-2.43,2.88],[-2.28,2.49],[-2.10,2.56],[-1.96,1.96],[-1.68,2.03],
    [-1.55,1.26],[-1.35,1.43],[-1.10,.83],[-.82,.89],[-.61,.48]],.31);
  // Upper burned-out room has a BACK and two unequal, snapped piers, but
  // no front wall. Its roof beam hangs at an angle over open, lit air.
  const records=id==='records';
  edge(3.25,-1.32,ANNEX_CROWNS[id],.28);
  edge(3.24,1.26,records?[[.42,3.57],[.53,4.02],[.66,4.26],[.80,4.11],[.86,3.78]]:
    [[.40,3.60],[.50,4.66],[.63,4.54],[.72,5.21],[.86,5.04]],.23);
  edge(3.24,1.21,records?[[2.19,3.67],[2.28,4.12],[2.39,4.06],[2.44,5.69],[2.66,5.52]]:
    [[2.32,3.46],[2.45,3.94],[2.66,3.86]],.26);
  edge(3.24,2.65,records?[[-1.12,3.61],[-.88,3.99],[-.56,3.86],[-.37,4.61],[-.13,4.45],
    [.02,5.15],[.27,5.02],[.47,5.68],[.78,5.50],[.94,5.94],[1.30,6.07]]:
    [[-1.12,3.52],[-.83,3.80],[-.56,3.70],[-.32,4.26],[-.12,4.04],[.13,4.54],[.38,4.42],
      [.56,4.77],[.76,4.57],[.93,4.93],[1.30,4.68]],.25,true);
  // Strips of scorched roofing: a sharp sawtooth at the foreground lip,
  // with lit undersides and actual thickness. Most of the upper room is
  // uncovered. The dispatch roof is twisted, not a mirror of Records.
  if(records)for(let i=0;i<5;i++){
    const x=1.09+i*.32,u=x+.315,z=-1.67;
    const mouth=[.12,.64,.41,1.15,1.28][i],y=5.40+.32*x;
    const dy=.32*(u-x),sink=.55;
    const a:Pt=[x,y,z],b:Pt=[u,y+dy,z],c:Pt=[u,y+dy-sink,mouth],d:Pt=[x,y-sink,mouth-.13];
    const lower=(p:Pt):Pt=>[p[0],p[1]-.075,p[2]];
    quad(a,d,c,b,i%2?'#715446':'#825c4a');quad(lower(a),lower(b),lower(c),lower(d),'#65432c');
    quad(d,lower(d),lower(c),c,'#ad7960');quad(b,c,lower(c),lower(b),'#5e473b');
  }
  if(!records){
    // Torn sheets hinge at the streetward corner and fall into the former
    // dispatch bay. Leave two genuine holes between the banks of sheets.
    // Their undersides and bent returns make the diagonal legible against sky.
    const yRoof=(x:number,z:number)=>5.26-.79*x-.19*z+.12*Math.sin(1.55*x+.55*z);
    const collapsedSheet=(lo:number,hi:number,front:number,sink:number,count:number)=>{
      for(let i=0;i<count;i++){
        const x=lo+(hi-lo)*i/count,u=lo+(hi-lo)*(i+1)/count;
        const edge=(j:number)=>front+.16*Math.sin(j*2.7+lo)-.09*(j%3);
        const ridge=(j:number)=>j%2?.060:-.032;
        const p=(xx:number,z:number,j:number,drop=0):Pt=>[xx,yRoof(xx,z)+ridge(j)-drop,z];
        const a=p(x,-1.45,i),b=p(u,-1.45,i+1),c=p(u,edge(i+1),i+1,sink),d=p(x,edge(i),i,sink);
        const low=(v:Pt):Pt=>[v[0],v[1]-.105,v[2]];
        quad(a,d,c,b,i%2?'#666765':'#79736c');quad(low(a),low(b),low(c),low(d),'#493d39');
        quad(d,low(d),low(c),c,i%2?'#ab8c72':'#987761');
        if(i===0)quad(a,low(a),low(d),d,'#795f50');
        if(i===count-1)quad(b,c,low(c),low(b),'#68584c');
      }
    };
    collapsedSheet(-1.88,-.76,1.39,.17,6);
    collapsedSheet(-.55,-.13,.44,.43,3);
    collapsedSheet(.62,1.34,.62,.65,4);
  }
  // The concept reads as two STREET HOUSES before it reads as rubble.
  // A thin surviving facade can still stand even when the roof and rear
  // floor behind it are gone. All bays are open, not painted black holes.
  // Local +Z faces the arriving tank; positive X points into the court.
  const block=(x0:number,x1:number,y0:number,y1:number,z:number,depth:number,
    front:string,cheek:string,cap:string,fall=0)=>{
    const a:Pt=[x0,y0,z],b:Pt=[x1,y0+fall,z],c:Pt=[x1,y1+fall,z],d:Pt=[x0,y1,z];
    const back=(p:Pt):Pt=>[p[0],p[1],p[2]-depth];
    quad(a,b,c,d,front);quad(a,d,back(d),back(a),cheek);quad(b,back(b),back(c),c,cheek);
    quad(d,c,back(c),back(d),cap);quad(back(a),back(d),back(c),back(b),cheek);
    quad(a,back(a),back(b),b,'#3b3e40');
  };
  const louver=(x:number,y:number,w:number,h:number,z:number,slip=0)=>{
    // Folded exterior shutter: cool wet slats, no emissive glass, gaps
    // between the slats are actual air. One quad per vane and its lip.
    for(let i=0;i<5;i++){
      const q=y+h*.2*i,dx=(q-y)*slip;
      const a:Pt=[x+dx,q,z+.047],b:Pt=[x+dx+w,q,z+.047],c:Pt=[x+dx+w+.023,q+h*.134,z],d:Pt=[x+dx+.023,q+h*.134,z];
      quad(a,b,c,d,i%2?'#375057':'#41565a');quad(d,c,[c[0],c[1]+.026,z-.018],[d[0],d[1]+.026,z-.018],'#919489');
    }
  };
  if(records){
    // Two pointedly different window bays; the broad, ragged spandrel
    // belongs to the floor below. The tall outer return carries the eave.
    block(-2.62,-2.21,.41,5.88,1.59,.65,'#a3a69b','#6e756c','#b5b298');
    block(-1.13,-.77,.40,5.94,1.58,.43,'#a8a69b','#72756d','#b8aa98');
    block(.20,.51,3.29,5.43,1.56,.39,'#9c9b90','#6d7069','#b8aa98');
    block(-2.58,.46,2.67,3.49,1.63,.32,'#9c9b8d','#62675f','#b2ad9d',-.09);
    block(-2.66,.18,5.72,5.93,1.63,.48,'#8b8c80','#635e53','#b8a58d',-.12);
    block(-2.77,-.36,5.87,6.04,1.88,.79,'#6b6559','#493f38','#847c6d',-.09);
    block(-2.63,-.06,3.45,3.55,1.78,.31,'#7c786c','#4e5654','#b1b0a1',-.06);
    block(-2.57,-.82,3.47,5.62,.37,.09,'#776451','#585750','#797367');
    block(-2.56,-2.46,3.47,5.62,1.52,1.17,'#777568','#6c6354','#858575');
    louver(-2.18,3.60,.56,1.96,1.52,.016);
    louver(-.70,3.62,.40,1.66,1.48,-.056);
    // Tangible balcony remnant: bases and heads articulate a rhythm at 30m.
    const rails=[-1.97,-1.70,-1.42,-.59,-.31,.01];
    block(-2.19,.18,4.02,4.12,1.85,.16,'#8c8b7d','#5c635d','#b3a991',-.045);
    for(const x of rails){
      const z=1.82,lo=3.53,hi=4.02,mid=3.77;
      quad([x-.056,lo,z],[x+.066,lo,z],[x+.046,mid,z+.033],[x-.037,mid,z+.033],'#929386');
      quad([x-.037,mid,z+.033],[x+.046,mid,z+.033],[x+.073,hi,z],[x-.059,hi,z],'#a19f8e');
    }
    // From the normal approach it is the INSIDE corner looking into the
    // court that is seen broadside, not the far, street-facing facade.
    // Two returns of a single thick wall meet at that corner. One sheared
    // progressively down into the room; the opposite jamb still stands.
    // The cutout between is genuine air with the old desk visible beyond.
    const returnWall=(path:[number,number][],inner:boolean)=>{
      const point=(u:number,h:number,d:number):Pt=>inner?[2.65-d,h,u]:[u,h,1.73-d];
      for(let i=1;i<path.length;i++){
        const [x,h]=path[i-1],[u,k]=path[i],wall=.30;
        const a=point(x,.376,0),b=point(u,.376,0),c=point(u,k,0),d=point(x,h,0),
          bb=point(u,.376,wall),aa=point(x,.376,wall),cc=point(u,k,wall),dd=point(x,h,wall);
        quad(a,b,c,d,i%3?'#b8b9ab':'#a6ada3',inner);quad(aa,bb,cc,dd,'#807c70',!inner);
        quad(d,c,cc,dd,'#b39775',inner);
        if(i===1)quad(a,d,dd,aa,'#8c7660',inner);
        if(i===path.length-1)quad(b,bb,cc,c,'#887566',inner);
      }
    };
    returnWall([[-1.36,2.95],[-1.03,2.87],[-.91,1.48],[-.66,1.52],[-.51,.90],
      [.10,.74],[.47,1.34],[.72,1.29],[.83,2.20],[1.07,2.15],[1.23,3.03],[1.43,2.95],[1.72,4.52]],true);
    returnWall([[1.70,1.65],[1.89,1.58],[2.01,2.29],[2.24,2.20],[2.33,3.33],[2.46,3.22],[2.65,4.50]],false);
  }else{
    // Torn street-side frame, NOT an intact flat second roof: the charred
    // diagonal falls across a cold wall, then breaks into the glowing void.
    block(-2.60,-2.16,.38,5.88,2.04,.31,'#8e9894','#585d5d','#aaa18f',.19);
    block(-2.18,-.48,2.72,3.33,2.06,.24,'#8e948a','#596266','#aba58f',-.19);
    block(-2.52,-1.94,5.64,5.94,2.14,.44,'#595b53','#443e36','#8d8170',.16);
    block(-1.64,-1.31,.43,2.72,2.01,.31,'#8d968c','#585e5e','#959d91');
    block(-2.25,-.65,3.33,4.94,.37,.09,'#795d49','#555350','#7c7569',-.40);
    block(-2.22,-2.10,3.34,4.93,1.82,1.51,'#69685e','#956f50','#939180');
    louver(-2.12,.58,.43,1.92,1.96,.058);
    louver(-2.12,3.67,.39,1.64,1.94,.033);
    // Three diagonal fragments of the same truss; avoid a picket roof.
    for(const [x,y,u,v] of [[-1.84,6.19,-1.02,5.22],[-1.04,5.33,-.25,5.77],[-.62,5.41,.16,4.43]]){
      const z=1.31;quad([x,y,z],[u,v,z],[u+.077,v+.105,z],[x+.099,y+.12,z],'#575047');
      quad([x+.099,y+.12,z],[u+.077,v+.105,z],[u+.077,v+.105,z-.15],[x+.099,y+.12,z-.15],'#8b7764');
    }
  }
  // Where facing plaster has delaminated, a patch of staggered old red
  // brick survives. The edge steps in and out rather than covering the
  // entire wall in a uniform procedural brick print.
  for(let r=0;r<6;r++)for(let i=0;i<[6,7,6,5,3,2][r];i++){
    const x=-2.59+i*.176+(r%2)*.075,y=.76+r*.135,z=1.696;
    quad([x,y,z],[x+.162,y+.01,z],[x+.16,y+.121,z],[x+.004,y+.115,z],
      ['#8b6558','#936756','#aa795e','#765b54','#9a715c'][(i*7+r*3)%5]);
  }
  const scarStart=indices.length;
  writeAnnexStreetMasonry(records,(a,b,c,tone)=>{
    const first=pos.length/3;ink.set(tone);
    for(const p of [a,b,c]){pos.push(side*p[0],p[1],p[2]);color.push(ink.r,ink.g,ink.b);}
    indices.push(first,first+(side<0?2:1),first+(side<0?1:2));
  });
  const fallFanIndexStart=indices.length;
  // Splintered roof timbers fell into the torn outside bay, away from the
  // still-working door. A long rafter rests on the stone ridge; two shorter
  // boards lie beneath it. The pale end grain follows the split, not a cube.
  const timber=(a:Pt,b:Pt,w:number,h:number,seed:number)=>{
    const axis=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize(),
      across=new T.Vector3(0,1,0).cross(axis).normalize(),up=axis.clone().cross(across).normalize();
    const ring=(p:Pt,tip:boolean)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v],i)=>{
      const value=new T.Vector3(...p).addScaledVector(across,u*w*.5).addScaledVector(up,v*h*.5);
      if(tip)value.addScaledVector(axis,[.12,.04,-.08,.17][(i+seed)%4]);value.y=Math.max(.366,value.y);return value.toArray() as Pt;});
    const f=ring(a,false),g=ring(b,true);
    for(let i=0;i<4;i++){const j=(i+1)%4;quad(f[i],f[j],g[j],g[i],['#392e29','#67503a','#7c6146','#49413a'][i]);}
    quad(g[0],g[1],g[2],g[3],'#a4825b');quad(f[3],f[2],f[1],f[0],'#574639');
    // Two connected, unequal splinters emerge directly from the cut end.
    const tip=new T.Vector3(...g[3]).addScaledVector(axis,.15);tip.y=Math.max(.367,tip.y);
    const first=pos.length/3;ink.set('#9c7851');
    for(const p of [g[3],g[2],tip.toArray()]){pos.push(side*p[0],p[1],p[2]);color.push(ink.r,ink.g,ink.b);}
    indices.push(first,first+(side<0?2:1),first+(side<0?1:2));
  };
  if(records){
    timber([-2.48,.46,.84],[-1.42,.54,2.16],.27,.15,0);
    timber([-1.50,.43,.89],[-2.07,.80,1.97],.18,.13,1);
    timber([-2.45,1.62,1.52],[-1.55,.51,2.19],.22,.18,3);
    timber([-2.20,.45,2.09],[-1.39,.47,1.82],.13,.10,1);
  }else{
    timber([1.08,.46,1.78],[2.41,.58,.43],.22,.17,2);
    timber([1.46,.51,.02],[2.34,.87,1.41],.18,.12,0);
  }
  // The forward Dispatch gable sheared off on its outer side; the low
  // materials slid inward into its exposed streetward bay, not behind
  // that gable and past the right edge of the courtyard sightline.
  if(!records)side=1;
  // Facing broke towards the court at Records, while the thinner Dispatch
  // floor fell *into* its room. Build the damage below only, without capping
  // either surviving balcony. All pieces live on the old building plinth.
  const vec=(p:Pt)=>new T.Vector3(...p);
  const polygon=(pts:Pt[],tone:string,inside:Pt)=>{
    const first=pos.length/3;ink.set(tone);
    for(const p of pts){pos.push(side*p[0],p[1],p[2]);color.push(ink.r,ink.g,ink.b);}
    const backward=vec(pts[1]).sub(vec(pts[0])).cross(vec(pts[2]).sub(vec(pts[0])))
      .dot(vec(pts[0]).sub(vec(inside)))<0;
    for(let k=1;k<pts.length-1;k++)indices.push(first,first+((side<0)!==backward?k+1:k),first+((side<0)!==backward?k:k+1));
  };
  const centroid=(loop:Pt[]):Pt=>loop.reduce<Pt>((a,p)=>[a[0]+p[0]/loop.length,a[1]+p[1]/loop.length,a[2]+p[2]/loop.length],[0,0,0]);
  // Irregular thick sections: a weathered outer skin over ochre aggregate
  // and dark broken faces. Most far corners are deliberately buried.
  const spall=(top:Pt[],thickness:number,facing:string,core:string,layer=false)=>{
    const mid=centroid(top),inside:Pt=[mid[0],mid[1]-.52*thickness,mid[2]];
    const base=top.map<Pt>((p,i)=>[p[0]+.019*Math.cos(i*2.4),Math.max(.348,p[1]-thickness*(.92+.11*Math.cos(i*1.82))),p[2]-.013*Math.sin(i)]);
    const lip=top.map<Pt>((p,i)=>[p[0],p[1]-.053-.037*(i%3),p[2]]);
    polygon(top,facing,inside);polygon(base,'#494546',inside);
    for(let i=0;i<top.length;i++){
      const j=(i+1)%top.length;
      if(layer)polygon([top[i],top[j],lip[j],lip[i]],i%3===1?'#b0aaa2':'#9a9b98',inside);
      polygon([layer?lip[i]:top[i],layer?lip[j]:top[j],base[j],base[i]],i%3===2?'#8a7868':core,inside);
    }
  };
  // Low noncircular pile whose feathered toe, shoulders and high buried
  // hinge lie in different places. It receives the settled beams and bricks.
  const dirt=(toe:Pt[],ridge:Pt)=>{
    for(let i=0;i<toe.length;i++)polygon([toe[i],toe[(i+1)%toe.length],ridge],
      ['#766c63','#8b7b69','#736e67','#837b72','#928575'][(i*3)%5],[ridge[0],.29,ridge[2]]);
  };
  const brick=(x:number,y:number,z:number,w:number,d:number,turn:number,rise:number,color:string)=>{
    const top=([[-.51,-.41],[.31,-.48],[.54,-.17],[.47,.50],[-.48,.37]] as [number,number][])
      .map<Pt>(([u,v])=>[x+u*w*Math.cos(turn)-v*d*Math.sin(turn),y+u*rise,z+u*w*Math.sin(turn)+v*d*Math.cos(turn)]);
    spall(top,.147,color,'#815647');
  };
  // Three-sided strap steel, with a continuous bent section, never a line
  // painted across the debris. The bright side turns away at its snapped end.
  const lath=(path:Pt[],r:number)=>{
    const rings=path.map((p,i)=>{const t=vec(path[Math.min(i+1,path.length-1)]).sub(vec(path[Math.max(0,i-1)])).normalize();
      const lateral=new T.Vector3(0,0,1).cross(t).normalize(),up=t.clone().cross(lateral).normalize();
      return [0,1,2].map(j=>vec(p).addScaledVector(lateral,Math.cos(j*2*Math.PI/3)*r)
        .addScaledVector(up,Math.sin(j*2*Math.PI/3)*r).toArray() as Pt);});
    for(let i=1;i<rings.length;i++)for(let j=0;j<3;j++){
      const k=(j+1)%3;polygon([rings[i-1][j],rings[i-1][k],rings[i][k],rings[i][j]],
        ['#716054','#9d8873','#49484a'][j],centroid([path[i-1],path[i]]));}
  };
  if(records){
    dirt([[-2.55,.365,1.12],[-2.33,.366,1.84],[-1.98,.367,2.34],[-1.56,.365,2.46],
      [-1.13,.368,2.34],[-.94,.366,1.66],[-1.31,.369,.83],[-2.11,.365,.76]],[-1.77,.78,1.63]);
    spall([[-2.42,1.79,1.55],[-2.05,1.74,1.55],[-1.72,1.24,1.82],[-1.49,.74,2.16],
      [-1.61,.64,2.30],[-1.99,.67,2.26],[-2.39,1.21,1.93]],.30,'#aca89a','#847569',true);
    spall([[-1.71,.93,1.58],[-1.38,1.02,1.52],[-1.15,.79,1.79],[-1.21,.60,1.94],[-1.54,.68,1.90]],
      .20,'#8e8d86','#7c675a',true);
    brick(-1.72,.56,2.33,.61,.16,.19,-.14,'#ab7159');brick(-1.30,.54,2.23,.36,.20,-.67,.19,'#ad785e');
    brick(-2.17,.62,2.06,.37,.20,-.19,.10,'#9b644e');brick(-1.24,.51,1.86,.22,.18,.38,-.09,'#a28670');
    lath([[-2.04,1.67,1.61],[-1.97,1.77,1.71],[-1.77,1.65,1.94],[-1.62,1.23,2.08]],.030);
    lath([[-1.91,1.56,1.69],[-1.74,1.67,1.80],[-1.56,1.47,1.99]],.025);
    // The inward wall shed its large facing slab into the visible bay.
    // Leaning against the standing return, it presents a broad broken face
    // to the driver; its toe and the overrun sill remain clear of the door.
    spall([[1.34,.58,2.39],[1.13,.57,2.06],[1.38,1.51,1.65],[1.94,2.06,1.56],
      [2.37,1.84,1.52],[2.42,.72,2.02],[1.94,.53,2.31]],.33,'#b5b5a5','#886f59',true);
    spall([[1.21,.49,2.41],[1.21,.51,2.16],[1.53,.80,1.78],[1.85,.75,1.77],
      [1.76,.51,2.26]],.18,'#a79e8d','#7c6d5e');
  }else{
    dirt([[-2.52,.365,-.16],[-2.49,.367,.61],[-2.57,.367,1.32],[-2.23,.365,1.93],
      [-1.63,.368,2.12],[-1.09,.365,1.72],[-.80,.366,.84],[-.95,.365,-.25],[-1.82,.365,-.54]],[-1.76,.82,.70]);
    spall([[-2.45,1.89,1.51],[-2.11,1.81,1.64],[-1.79,1.43,1.20],[-1.15,.64,.20],
      [-1.33,.54,-.02],[-1.72,.56,.06],[-2.18,1.23,.84]],.32,'#a3a59e','#80675b',true);
    spall([[-2.36,1.31,.61],[-2.07,1.28,.51],[-1.91,.92,.24],[-2.06,.66,-.19],[-2.34,.72,-.11]],
      .18,'#8d938f','#716b61');
    brick(-1.40,.60,.19,.47,.24,-.74,.10,'#9b6a56');brick(-1.08,.58,.56,.34,.20,.41,-.11,'#b08268');
    // Torn galvanized roofing on the floor, curled back like a scroll. The
    // ridges actually rise and fall across the sheet; the open end faces court.
    const rolls:Pt[]=[[-1.15,.84,.80],[-1.24,1.14,1.15],[-1.35,1.52,1.51],
      [-1.44,1.74,1.73],[-1.48,1.80,1.91],[-1.50,1.72,2.03],[-1.49,1.58,2.04],[-1.46,1.54,1.94]];
    const sheet=rolls.map(([x,y,z],i)=>Array.from({length:9},(_,j):Pt=>[x-.073*j,y+(.05*j/8)+(j%2?.045:0),
      z-.032*j+(i===rolls.length-1?.055*Math.sin(j*1.8):0)]));
    const lining=(p:Pt):Pt=>[p[0],p[1]-.037,p[2]-.024];
    for(let i=1;i<sheet.length;i++)for(let j=0;j<8;j++){
      const a=sheet[i-1][j],b=sheet[i-1][j+1],c=sheet[i][j+1],d=sheet[i][j];
      // The sunken half is embedded. The free half exposes a dark underside
      // and a thin, lighter broken rim against the separate masonry behind it.
      quad(a,b,c,d,j%2?'#777c76':'#93948a');
      if(i>=4)quad(lining(a),lining(b),lining(c),lining(d),j%2?'#514d47':'#67675e',true);
      if(j===0)quad(a,d,lining(d),lining(a),'#8d816d');
      if(j===7)quad(b,lining(b),lining(c),c,'#716d62');
      if(i===sheet.length-1)quad(c,lining(c),lining(d),d,'#aaa38e');
    }
    lath([[-2.18,1.65,1.39],[-2.37,1.91,1.57],[-2.47,2.09,1.51],[-2.50,2.12,1.27]],.033);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new T.Float32BufferAttribute(color,3));g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(pos.length/3*2),2));
  g.setIndex(indices);g.computeVertexNormals();g.userData.fallFanIndexStart=fallFanIndexStart;g.userData.scarStart=scarStart;return g;
}

/** Two dark, inhabited-looking cross sections. The same physical shell stays
 * on the site when a virtual file goes offline; only its working porch changes.
 * The missing outside bay is real sky, through the front AND back walls. */
export function drawRuinedAnnex(id:'records'|'dispatch',live:boolean,brick:Mason){
  const records=id==='records',s=records?1:-1;
  const part:Mason=(x,y,z,w,h,d,color,r=0)=>brick(x*s,y,z,w,h,d,color,r*s);
  const chalk=records?'#a69c8a':'#9ba8a6', face=records?'#8d8479':'#79898b',
    core=records?'#5a5b59':'#54626a', seam='#524c43',lime='#bbb6a1',raw='#bc9477';
  // Top slab / floor slab break at different places; the surviving
  // perpendicular returns show real room depth from either flank.
  part(1.21,1.53,-.12,3.03,.19,3.91,chalk);
  part(1.32,3.19,-1.29,2.86,.23,1.55,chalk);
  if(records){
    part(1.51,3.19,-.12,2.48,.23,.80,chalk);
    part(1.71,3.19,.91,2.08,.23,1.26,chalk);
  }else{
    part(2.24,3.13,-.19,.96,.23,.89,chalk,-.08);
    part(2.39,3.05,.69,.65,.21,.95,raw,-.16);
  }
  part(1.42,3.35,-1.94,2.66,.19,.18,face);
  part(2.62,3.35,-.19,.18,.22,3.71,face);
  part(1.74,3.24,1.56,2.09,.10,.23,lime);
  if(records){
    part(2.46,5.63,-.16,.17,.18,2.87,'#473c37');
    part(1.38,5.31,-.67,.15,.17,1.65,'#554237');
    part(1.59,5.32,1.14,2.13,.18,.19,'#5c4433',.32);
    part(.63,4.86,1.14,.52,.11,.12,'#70503b',.83);
  }else{
    // An oblique, partly detached truss holds the high outer end; there is
    // open night sky where the missing front/second-storey glass used to be.
    part(-1.71,3.52,-1.26,.22,6.43,.26,'#49413c',.036);
    part(-1.74,3.31,.92,.20,5.98,.24,'#51483a',-.056);
    part(-1.61,6.46,-.17,.24,.23,2.51,'#443d39');
    part(-.13,5.27,1.05,4.38,.24,.24,'#6a5749',-.676);
    part(-.17,5.36,1.18,4.13,.053,.072,'#a1846a',-.676);
    part(.98,3.91,.19,1.62,.21,.20,'#50443c',-1.03);
    part(2.20,4.15,1.12,.51,.12,.15,'#916f4d',-.94);
    part(.24,5.40,-1.27,.075,1.09,.066,'#7e6a57',-.61);
  }
  // Hooked exposed steel hanging over AIR rather than cracks drawn on a slab.
  for(const [x,y,z,len,tilt] of records?[[.75,5.08,1.22,.81,.48],[.48,4.78,1.22,.34,.97],
    [2.42,5.90,1.15,.55,-.34]]:[[1.95,4.44,1.17,.91,-.76],[2.27,4.07,1.17,.36,-1.34],
      [.11,5.89,-1.28,.57,.71]]){
    part(x,y,z,len,.046,.053,'#a58465',tilt);
  }
  // A surviving section of the upper balcony and a battered shutter give
  // the broken room a recognizable human scale from across the courtyard.
  if(records){
    part(1.62,3.70,1.32,1.16,.080,.10,'#8b8273');
    part(1.62,3.35,1.32,1.18,.067,.12,'#716b60');
    for(let k=0;k<6;k++)part(1.10+.21*k,3.52,1.32,.052,.33,.075,'#888374',k===4?-.16:0);
  }else{
    part(2.25,3.46,1.12,.83,.065,.13,'#857567',-.28);
    for(let k=0;k<3;k++)part(2.03+.19*k,3.37-.074*k,1.12,.064,.34,.084,'#736b61',-.15*k);
  }
  if(!records){
    const shutterX=.95,slant=.19;
    part(shutterX,2.32,1.97,.48,.88,.075,'#454c4b',slant);
    for(let k=0;k<3;k++)part(shutterX+(1-k)*Math.sin(slant)*.21,2.07+.21*k,2.018,
      .43,.055,.042,k%2?'#697471':'#7c8177',slant);
  }
  if(records){
    part(1.78,3.91,-.32,1.14,.09,.66,'#71543e');
    for(const x of [1.32,2.23])part(x,3.62,-.09,.081,.58,.081,'#69513d');
  }
  // Bonded rear sills and chipped piers are one irregular thick mesh. The
  // outside return kept two posts under its lintel; between them it fell.
  part(2.55,2.29,-1.63,.26,1.92,.32,face);
  part(2.55,2.05,1.45,.24,2.24,.28,face,-.025);
  part(2.54,2.98,-.08,.28,.20,3.63,chalk);
  // Lower ribbon windows on the still-standing end. The upper workroom
  // takes the existing active-only light panes; masonry never emits light.
  if(records){
    part(1.66,.98,1.92,1.90,.83,.18,core);
    part(1.66,1.70,2.04,1.79,.11,.16,core);
    for(const x of [.73,1.32,2.03,2.60]){
      part(x,1.75,2.13,.114,2.64,.28,chalk);
    }
    part(1.67,.54,2.16,2.00,.16,.31,face);
    part(1.67,2.61,2.13,2.02,.16,.39,face);
  }else{
    part(1.65,.52,2.11,1.98,.26,.32,core);
    part(2.53,1.64,2.10,.20,2.28,.30,chalk);
    part(.92,.88,2.11,.24,.70,.29,face,-.09);
    part(2.28,2.69,2.10,.81,.18,.32,raw,.15);
    part(1.94,2.56,2.16,.48,.048,.059,seam,.41);
  }
  // The torn outside edge is layered aggregate with snapped steel showing.
  for(let k=0;k<4;k++){
    const z=-1.72+k*.91,length=.42+(k%3)*.22;
    part(-.27-length*.42,1.49-k*.027,z,length,.19,.49,k%2?raw:face,-.14-k*.035);
    part(-.43-length*.6,1.38-k*.029,z+.066,.49,.039,.047,seam,-.23);
    if(k<3){
      part(.04,3.14-k*.038,z,.39+.08*k,.17,.44,k%2?face:raw,-.28);
      part(-.22,3.07-k*.052,z,.50,.035,.042,seam,-.34);
    }
  }
  // Outer bay lost its second floor: leave one broken knee wall and the
  // floor of a room you can actually see into, with a lower fallen slab.
  part(-2.54,.62,-1.06,.29,.86,1.55,face,-.045);
  part(-2.49,1.10,-1.42,.24,.38,.81,raw,-.11);
  // Fire-stripped joists and a staggered brick return: the far half is
  // collapsed, but fragments still describe its former roof volume.
  for(const [x,y,z,l,d,tilt] of [[-.65,3.02,-1.40,1.43,.12,.18],[-.81,2.73,-.71,1.67,.13,.39],
    [-.40,3.01,.49,.99,.10,.30],[-1.98,1.62,-1.49,1.14,.13,1.19]]){
    part(x,y,z,l,.15,d,'#453d37',tilt);
  }
  for(let row=0;row<3;row++)for(let i=0;i<3-row;i++)
    part(-2.40+i*.35+(row%2)*.13,.49+row*.20,-1.72,.333,.185,.26,
      ['#8f6e57','#a27960','#775b4c'][(i+row)%3]);
  if(!records){
    // A broken aerial and slatted relay box give Dispatch its own skyline.
    part(1.80,3.51,-1.47,.60,.39,.36,core);
    for(let i=0;i<3;i++)part(1.80,3.41+i*.09,-1.28,.53,.035,.035,lime);
    part(-1.81,.82,-1.31,.13,1.17,.15,face,-.39);
  }
  if(live){
    part(0,.44,2.44,2.41,.20,1.02,face);
    // Dispatch has a deep service entrance behind its porch. The door is
    // hung from the left jamb and swings in over the threshold.
    if(records)part(0,1.13,2.06,1.35,1.46,.14,core);
    else {
      part(0,1.39,1.45,1.58,1.72,.11,'#232b2c');
      for(const x of [-.75,.75])part(x,1.40,1.89,.14,1.72,.82,core);
    }
    part(0,records?1.96:2.32,2.45,2.31,.14,1.02,chalk);
    for(const x of [-1.0,1.0])part(x,records?1.16:1.40,2.85,.15,records?1.48:1.72,.16,face);
    if(records)part(1.65,2.52,2.39,1.46,.14,.70,'#907565');
  }
}
