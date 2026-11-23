import {BufferGeometry,Color,Float32BufferAttribute,Vector3} from 'three';

type P=[number,number,number];
const v=(p:P)=>new Vector3(...p);
const palmOutline=[[-1,0],[-.82,-.72],[-.12,-.89],[.68,-.72],[1,.02],[.81,.71],[.18,1],[-.64,.80]];
const fingerOutline=Array.from({length:5},(_,i)=>[Math.cos(i*Math.PI*.4),Math.sin(i*Math.PI*.4)]);
const scoutDigit=[[1,0],[.58,.91],[-.50,.95],[-1,.04],[-.55,-.80],[.53,-.88]];

/** Thumb-side heel and four unequal, curled digits. All points are in the
 * artwork's bind space; no sockets, bone updates or additional draw calls. */
export function createPropContactHand(wrist:P,anchor:P,support:boolean,skin:string,fieldPaint=false) {
  const p:number[]=[],c:number[]=[],idx:number[]=[],art:number[]=[];
  const tissue=new Color(skin),warm=tissue.clone().lerp(new Color('#b17559'),.22),dye=new Color();
  const nailInk=new Color('#a38977'),knuckle=new Color('#bd8d70');
  const at=(x:number,y:number,z:number)=>new Vector3(anchor[0]+x,anchor[1]+y,anchor[2]+z);
  const add=(q:Vector3,value:number,blush=0,tile=0,u=0,w=0)=>{
    const i=p.length/3;p.push(q.x,q.y,q.z);
    dye.copy(tissue).lerp(warm,blush).multiplyScalar(value);c.push(dye.r,dye.g,dye.b);
    if(fieldPaint){const f=(v:number)=>Math.max(0,Math.min(1,v));
      art.push(Math.round(255*((tile*32+.5+31*f(u))/64)),Math.round(255*((.5+31*f(w))/32)));}
    return i;
  };
  const join=(a:number[],b:number[])=>{for(let i=0;i<a.length;i++){
    const j=(i+1)%a.length;idx.push(a[i],a[j],b[i],a[j],b[j],b[i]);
  }};
  const cap=(l:number[],forward:boolean)=>{for(let i=1;i<l.length-1;i++)
    idx.push(l[0],l[forward?i:i+1],l[forward?i+1:i]);};
  const axis=new Vector3(),wide=new Vector3(),high=new Vector3();
  const frame=(dir:Vector3,across:Vector3)=>{
    axis.copy(dir).normalize();wide.copy(across).addScaledVector(axis,-across.dot(axis)).normalize();
    high.crossVectors(axis,wide).normalize();
  };
  // On one hand the fingers spread along the object's length; on the other
  // the knuckle arc is upright. Shape the heel *back into* the wrist and
  // let the thumb mound lift the inner palm, rather than capping a tube.
  const breadth=support?v([0,-.06,1]):v([0,1,.24]);
  const centers=[v(wrist),support?at(-.031,-.045,.012):at(.044,-.025,.012),
    support?at(-.014,-.045,.003):at(.044,-.003,-.011),
    support?at(.010,-.040,-.001):at(.033,-.001,-.032)];
  const widths=[.025,.036,.046,.039], depths=[.022,.025,.023,.019];
  let last:number[]=[];
  for(let j=0;j<centers.length;j++){
    frame(centers[Math.min(j+1,3)].clone().sub(centers[Math.max(0,j-1)]),breadth);
    const row=palmOutline.map(([u,h])=>{
      const mound=j===1 || j===2 ? Math.max(0,u+.12)*Math.max(0,-h)*.009 : 0;
      const crease=j===2 ? Math.max(0,1-Math.abs(u+.12))*Math.max(0,-h)*.004 : 0;
      const q=centers[j].clone().addScaledVector(wide,u*widths[j])
        .addScaledVector(high,h*depths[j]-mound+crease);
      return add(q,.76+.17*(1+h)+.08*(1-Math.abs(u))-(crease>0?.07:0),j>0?.6:0,0,.5+.5*u,j/3);
    });
    if(j)join(last,row);else cap(row,false);
    if(j===3)cap(row,true);last=row;
  }
  function digit(track:Vector3[],span:Vector3,radii:number[],thumb=false) {
    if(fieldPaint){
      const edge=radii.length-1;
      track.splice(edge,0,track[edge-1].clone().lerp(track[edge],.62));
      radii.splice(edge,0,radii[edge]*1.22);
    }
    let old:number[]=[];
    for(let j=0;j<radii.length;j++){
      frame(track[j+1].clone().sub(track[Math.max(0,j-1)]),span);
      const loop=(fieldPaint?scoutDigit:fingerOutline).map(([u,h])=>{
        // A two-plane knuckle, shade under the folded joint, quieter pale
        // nail at the end. Only the scout gets this art; not all US hands.
        const q=track[j].clone().addScaledVector(wide,u*radii[j])
          .addScaledVector(high,h*radii[j]*(j===0?1.03:.86));
        const value=.82+.19*(h+1)*.5+(j===1?.15:j===2?-.08:.035);
        const i=add(q,fieldPaint?value*(j===1&&h>.15?1.18:j===2&&h<0?.61:.93):value,thumb?.9:.65,
          1,j/radii.length,.50+.40*u+.14*h);
        if(fieldPaint&&h>.67){
          // high is transverse to both the longitudinal bend and the fan
          // of fingers: this is the nail side, not the side of the finger.
          const end=j>=radii.length-2;
          dye.fromArray(c,3*i).lerp(end?nailInk:knuckle,end?(j===radii.length-1?.68:.43):j===1?.38:.08).toArray(c,3*i);
        }
        return i;
      });
      if(j)join(old,loop);old=loop; // Hidden digit roots are buried in the palm.
    }
    const tip=add(track[track.length-1],.99,.8,1,1,.55);
    for(let i=0;i<old.length;i++)idx.push(old[i],old[(i+1)%old.length],tip);
  }
  const fan=[-.028,-.010,.009,.028]; // little, ring, middle, index
  for(let i=0;i<4;i++){
    const s=fan[i],reach=[.74,.91,1,.96][i],r=[.0078,.0087,.0092,.0086][i];
    const track=support?[
      at(.005,-.040,s),at(.022,-.041,s-.002),at(.035,-.030,s-.003),
      at(.034,-.010-.006*(1-reach),s-.003),at(.027,-.004-.010*(1-reach),s-.002),
    ]:[
      at(.033,s-.002,-.024),at(.042+.004*reach,s,-.039),
      at(.028,s-.002,-.044-.009*reach),at(.010,s-.005,-.048+.006*(1-reach)),at(-.001,s-.005,-.036+.010*(1-reach)),
    ];
    if(fieldPaint){
      if(support){
        // Pads rise above the nearest stock side; all four bend down into
        // the supporting palm, rather than disappearing inside the wood.
        for(let j=1;j<track.length;j++){track[j].x+=(.006+.003*reach)*Math.sin(j*.58);
          track[j].y+=(.008+.012*reach)*(j/4);track[j].z+=s*(j/4)*.24;}
      }else if(i===3){
        // The index reaches separately ahead of the three curled fingers.
        for(let j=1;j<track.length;j++){const t=j/4;track[j].z-=.029*t;track[j].y+=.011*t;}
      }
    }
    digit(track,breadth,[r*.92,r*(fieldPaint?1.26:1.15),r*.98,r*.72]);
  }
  const thumb=support?[at(-.031,-.041,.025),at(-.036,-.024,.033),at(-.030,.001,.030),at(-.016,.010,.018)]:
    [at(.040,.011,.001),at(.035,.036,.010),at(.018,.043,.006),at(.002,.030,-.003)];
  digit(thumb,support?v([0,.28,1]):v([0,.24,1]),[.017,.013,.009],true);
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute(p,3));
  g.setAttribute('color',new Float32BufferAttribute(c,3));g.setIndex(idx);g.computeVertexNormals();
  if(fieldPaint)g.setAttribute('handInkChart',new Float32BufferAttribute(art,2));
  const out=g.toNonIndexed();g.dispose();
  if(fieldPaint){out.userData.handInkUv=Uint8Array.from(out.attributes.handInkChart.array);out.deleteAttribute('handInkChart');}
  out.userData.infantrySurface=1;return out;
}
