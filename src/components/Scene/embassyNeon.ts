import * as THREE from 'three';

/** World-space signwriter's pattern. Dimensions in the chancery's local metres.
 * Mounted across the front of the public entrance, below the patterned
 * galleries. This is a sign on a building, not a building-sized billboard. */
const RACEWAY={width:8.18,height:1.39,sx:.73,sy:.69};
export const CHANCERY_NEON = Object.freeze({
  text: 'US EMBASSY', x: .10, y: 3.31, z: 3.95,
  width:RACEWAY.width*RACEWAY.sx,height:RACEWAY.height*RACEWAY.sy,
});
type Point = readonly [number, number];
// One continuous bent glass run where a signmaker could make it. Open returns
// on the two S terminals and visibly different bowls on B hold up in chase.
const SCRIPT: Record<string, readonly (readonly Point[])[]> = {
  U: [[[0,1],[0,.22],[.11,.075],[.27,0],[.72,0],[.89,.07],[1,.22],[1,1]]],
  S: [[[.98,.90],[.84,.99],[.26,.99],[.08,.91],[0,.78],[.01,.66],[.11,.56],[.31,.51],[.74,.47],[.93,.39],[1,.27],[.98,.15],[.85,.04],[.67,0],[.19,.01],[.02,.10]]],
  E: [[[.98,.99],[.01,.99],[.01,.01],[1,.01]],[[.07,.52],[.79,.52]]],
  M: [[[0,0],[0,1],[.13,1],[.51,.40],[.88,1],[1,1],[1,0]]],
  B: [[[0,0],[0,1],[.63,1],[.84,.96],[.96,.85],[.96,.71],[.87,.61],[.69,.53],[.15,.53]],
      [[.68,.53],[.88,.47],[1,.35],[.99,.18],[.87,.065],[.68,0],[.09,0]]],
  A: [[[0,0],[.40,.99],[.60,.99],[1,0]],[[.22,.38],[.77,.38]]],
  Y: [[[0,1],[.48,.54],[1,1]],[[.48,.54],[.48,0]]],
};

export function createEmbassyNeon() {
  const xyz:number[]=[], rgb:number[]=[], ix:number[]=[], color=new THREE.Color();
  const point=(x:number,y:number,z:number,hex:string,level=1)=>{
    xyz.push(x,y,z);color.set(hex).multiplyScalar(level);rgb.push(color.r,color.g,color.b);
    return xyz.length/3-1;
  };
  const face=(l:number,b:number,r:number,t:number,z:number,ink:string,top=ink)=>{
    const i=point(l,b,z,ink);point(r,b,z,ink);point(r,t,z,top);point(l,t,z,top);
    ix.push(i,i+1,i+2,i,i+2,i+3);
  };
  function metal(x:number,y:number,z:number,w:number,h:number,d:number,front:string,lip:string,side:string){
    const l=x-w*.5,r=x+w*.5,b=y-h*.5,t=y+h*.5,f=z+d*.5,k=z-d*.5;
    face(l,b,r,t,f,front); // Back, top, underside and returns also read on orbit.
    let i=point(r,b,k,side);point(l,b,k,side);point(l,t,k,side);point(r,t,k,side);ix.push(i,i+1,i+2,i,i+2,i+3);
    for(const [a,c] of [[l,1],[r,-1]]){
      i=point(a,b,k,side);point(a,b,f,side);point(a,t,f,side);point(a,t,k,side);
      if(c>0)ix.push(i,i+1,i+2,i,i+2,i+3);else ix.push(i,i+2,i+1,i,i+3,i+2);
    }
    for(const [y0,c] of [[t,1],[b,-1]]){
      i=point(l,y0,f,lip);point(r,y0,f,lip);point(r,y0,k,lip);point(l,y0,k,lip);
      if(c>0)ix.push(i,i+1,i+2,i,i+2,i+3);else ix.push(i,i+2,i+1,i,i+3,i+2);
    }
  }
  // A long folded-metal raceway, with bolted feet and two levels of trim.
  const w=RACEWAY.width,h=RACEWAY.height;
  for(const x of [-3.48,-1.10,1.16,3.34]){
    metal(x,-.48,-.38,.112,.96,.20,'#494447','#847168','#352e32');
    metal(x,-.79,-.35,.15,.10,.77,'#64564e','#95867c','#493c39');
  }
  metal(0,0,-.09,w,h,.18,'#38282c','#695051','#32282e');
  face(-w*.5+.049,-h*.5+.045,w*.5-.049,h*.5-.045,.002,'#40272a','#572c31');
  metal(0,.67,.035,w+.055,.050,.137,'#815e55','#a98871','#523e3a');
  metal(0,-.666,.037,w+.055,.055,.145,'#654438','#8a6b5b','#443439');
  for(const x of [-3.96,-2.09,-.02,2.12,3.96]){
    face(x-.013,-.60,x+.013,.60,.004,'#33272e','#50333a');
    face(x-.025,-.578,x+.025,-.546,.006,'#906f63');
    face(x-.024,.548,x+.024,.579,.006,'#947b6d');
  }
  const line=(x:number,y:number,z:number,points:readonly Point[],gw:number,gh:number)=>{
    // One shallow section, extruded along the tube. Oxide edge and red spill
    // are confined to the enamel. The glass stands 8 cm proud; its hot core
    // drives existing threshold bloom, with no scene-wide emissive light.
    const profile=[
      [-.094,.008,'#472d32',1],[-.078,.017,'#8f3035',1],
      [-.060,.041,'#df3029',1.30],[-.047,.065,'#ff3823',2.05],
      [-.026,.083,'#ff852f',2.65],[.025,.085,'#ff983c',2.80],
      [.047,.067,'#ff4928',2.10],[.061,.039,'#e23c2d',1.30],
      [.078,.017,'#883436',1],[.094,.008,'#472d32',1],
    ] as const;
    const start=xyz.length/3;
    const norm=(a:Point,b:Point)=>{const vx=(b[0]-a[0])*gw,vy=(b[1]-a[1])*gh,len=Math.hypot(vx,vy);
      return [-vy/len,vx/len];};
    for(let j=0;j<points.length;j++){
      const p=points[j],n=norm(points[Math.max(0,j-1)],j===0?points[1]:p);
      const m=j===points.length-1?n:norm(p,points[j+1]);
      const mx=(n[0]+m[0])*.5,my=(n[1]+m[1])*.5,inv=1/Math.max(.28,mx*m[0]+my*m[1]);
      for(const [offset,relief,ink,gain] of profile){
        point(x+p[0]*gw+mx*inv*offset,y+p[1]*gh+my*inv*offset,z+relief,ink,gain);
      }
      if(j>0)for(let k=0;k<profile.length-1;k++){
        const a=start+(j-1)*profile.length+k,b=a+profile.length;
        ix.push(a,b,b+1,a,b+1,a+1);
      }
    }
  };
  const runWidth=(c:string)=>c===' '?.36:c==='M'?.79:c==='E'?.55:.598;
  const spacing=.204,word=CHANCERY_NEON.text;
  const width=[...word].reduce((sum,c)=>sum+runWidth(c),0)+(word.length-1)*spacing;
  let left=-width*.5;
  const glyphs:{letter:string;first:number;end:number}[]=[];
  for(const c of word){
    const gw=runWidth(c),first=xyz.length/3;
    for(const path of SCRIPT[c]??[])line(left,-.451,.009,path,gw,.903);
    if(c!==' ')glyphs.push({letter:c,first,end:xyz.length/3});
    left+=gw+spacing;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));g.setIndex(ix);
  g.scale(RACEWAY.sx,RACEWAY.sy,1).translate(CHANCERY_NEON.x,CHANCERY_NEON.y,CHANCERY_NEON.z);
  g.userData.glyphs=glyphs; // Geometry receipt, not nine extra meshes.
  g.computeBoundingBox();g.computeBoundingSphere();g.name='US EMBASSY / raised ruby-neon glass and enamel';
  return g;
}
