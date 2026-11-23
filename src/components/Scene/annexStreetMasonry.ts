import * as T from 'three';
type P=[number,number,number];
type Section=[number,number,number];
type Writer=(a:P,b:P,c:P,color:string)=>void;
const lime=['#aaa593','#a09e90','#909086','#b7b19e'],earth=['#785c4c','#8c6751','#9d795f','#6a554d'];
// Coordinates are in the original canonical wing; its single fixed mirror
// is applied by the geometry writer. z=-2 faces the west/rear boss camera.
export const OFFICE_JAMB={x:1.23,z:-1.60,y:2.42} as const;

/** Two floors of broken bonded masonry. No opaque window or black filled
 * "hole": the secondary sill, inside jamb, deep returns and joists are
 * separate opaque solids. Draw every face into the existing masonry batch. */
export function writeAnnexStreetMasonry(records:boolean,tri:Writer){
  const v=(a:P)=>new T.Vector3(...a);
  const face=(a:P,b:P,c:P,d:P,normal:P,color:string)=>{
    if(v(b).sub(v(a)).cross(v(c).sub(v(a))).dot(v(normal))<0){tri(a,c,b,color);tri(a,d,c,color);}
    else{tri(a,b,c,color);tri(a,c,d,color);}
  };
  // A stripped wall exposes a rough brown core immediately behind the
  // flaking outer lime layer. Warping its two faces differently preserves
  // reveal depth and avoids extruding a single jagged cardboard outline.
  const ribbon=(data:Section[],z:number,depth:number,axis:'rear'|'side',seed:number,upper=false)=>{
    const map=(u:number,y:number,w:number):P=>axis==='rear'?[u,y,z+w]:[z-w,y,u];
    const n=(u:number,y:number,w:number):P=>axis==='rear'?[u,y,w]:[-w,y,u];
    const pos=(i:number,which:number):P=>{
      const [u,b,t]=data[i],noise=Math.sin(2.7*i+seed),isOuter=which<2;
      return map(u+(isOuter?0:.036*noise),which%2?t-(isOuter?0:.052+.034*noise):b+(isOuter?0:.011),
        (isOuter?-.035-.016*noise:depth+.012*noise));};
    for(let i=1;i<data.length;i++){
      const a=pos(i-1,0),b=pos(i,0),c=pos(i,1),d=pos(i-1,1),e=pos(i-1,2),f=pos(i,2),g=pos(i,3),h=pos(i-1,3);
      face(a,b,c,d,n(0,0,-1),lime[(i+seed)%4]);face(e,h,g,f,n(0,0,1),upper?'#645b56':'#635e55');
      face(d,c,g,h,n(0,1,0),earth[(i+seed)%4]);if(upper)face(a,e,f,b,n(0,-1,0),'#50443b');
      if(i===1)face(a,d,h,e,n(-1,0,0),'#846b58');
      if(i===data.length-1)face(b,f,g,c,n(1,0,0),'#755e4f');
    }
  };
  const skew=records?-.13:.06;
  // The outside sill lost a large stepped bite at one end. Curled render
  // and bed joints expose different heights on either side of the opening.
  ribbon([[-.19,.36,.96],[.05,.36,1.18],[.29,.36,1.11],[.41,.36,.76],[.73,.36,.80],[.85,.36,.56],
    [1.18,.36,.60],[1.34,.36,.85],[1.68,.36,.72],[1.82,.36,.90],[2.42,.36,.95],[2.69,.36,1.18]],-1.97,.35,'rear',2);
  ribbon([[-.15,1.49,2.13],[.11,1.49,2.16],[.26,1.49,1.89],[.51,1.49,1.92],[.63,1.49,1.72],
    [1.02,1.49,1.65],[1.31,1.49,1.91],[1.58,1.49,1.77],[2.04,1.49,1.84],[2.61,1.49,1.91]],-1.99,.36,'rear',3);
  ribbon([[-.12,2.66,3.17],[.21,2.70,3.16],[.42,2.85+skew,3.19],[.61,2.82+skew,3.21],
    [1.06,3.01,3.19],[1.26,2.78,3.21],[1.54,2.86,3.18],[1.67,3.00,3.18],[2.23,2.86,3.19],[2.64,2.65,3.19]],
    -2.00,.40,'rear',1,true);
  // Stocky jambs flare at the base and chip inwards in reach of the fire.
  // The back of the narrow central jamb is flat and supports the actual
  // practical's warm gradient. There is no lamp colour in the holes.
  const jamb=(x:number,half:number,phase:number)=>{
    const rings:P[][]=[];
    for(const [i,y] of [.38,.79,1.44,1.70,2.02,2.40,2.69,3.18].entries()){
      const k=Math.sin(i*1.87+phase),l=half*(i===0?1.19:i===4?.65:i===6?.78:1);
      rings.push([[x-l-.027*k,y,-2.04+.022*k],[x+l,y,-2.04-.020*k],[x+l+.036,y,-1.60],[x-l-.018,y,-1.60]]);
    }
    for(let i=1;i<rings.length;i++){const a=rings[i-1],b=rings[i];
      for(let j=0;j<4;j++)face(a[j],a[(j+1)%4],b[(j+1)%4],b[j],[[0,0,-1],[1,0,0],[0,0,1],[-1,0,0]][j] as P,
        j===2?'#655c4e':j===0?(i===3||i===5?earth[(i+phase)%4]:lime[(i+phase)%4]):earth[(i+j+phase)%4]);
    }
  };
  jamb(.015,.17,1);jamb(1.23,.14,2);jamb(2.47,.20,3);
  // Exposed side return: a high surviving corner and a lower, collapsed
  // party wall. This is masonry, not another line of identical sashes.
  ribbon([[-1.92,.36,1.68],[-1.63,.36,1.78],[-1.40,.36,1.31],[-1.09,.36,1.40],[-.91,.36,.94],[-.41,.36,.99],
    [-.22,.36,.74],[.23,.36,.82],[.56,.36,.67],[.94,.36,.89],[1.22,.36,.95],[1.71,.36,1.29]],2.57,.31,'side',3);
  // Ragged patch of sunken brick courses against each jamb. These show
  // the warm bond through ripped plaster, rather than graphic fault lines.
  const chip=(x:number,y:number,z:number,w:number,h:number,ink:string)=>{
    const a:P=[x,y,z],b:P=[x+w,y+.008,z],c:P=[x+w*.96,y+h,z-.010],d:P=[x+.014,y+h-.008,z-.012];
    face(a,b,c,d,[0,0,-1],ink);
    face(d,c,[c[0],c[1]+.014,z+.10],[d[0],d[1]+.016,z+.10],[0,1,0],'#b1a28b');
  };
  for(const [x,y,num] of [[-.11,.56,4],[.03,.72,3],[.06,.88,2],[-.12,1.75,2],[1.12,1.74,3],[2.21,.68,3],[2.35,.85,2],[2.37,2.78,2]])
    for(let j=0;j<num;j++)chip(x+j*.143,y,-2.067,.133,.104,earth[(j+num)%4]);
  // Interrupted lime/soot islands on the front fractured gable. Each
  // polygon has its own torn outline, nested brick-colour core and lip.
  const peel=(x:number,y:number,w:number,h:number,z:number)=>{
    const uv=[[-.50,.35],[-.24,.51],[.08,.43],[.38,.48],[.50,.19],[.31,-.05],[.38,-.31],[.08,-.28],
      [-.13,-.51],[-.26,-.16],[-.46,-.19],[-.39,.08]];
    const a:P=[x,y,z+.008];
    for(let i=0;i<uv.length;i++){const p=uv[i],q=uv[(i+1)%uv.length],b:P=[x+p[0]*w,y+p[1]*h,z],c:P=[x+q[0]*w,y+q[1]*h,z];
      if(v(b).sub(v(a)).cross(v(c).sub(v(a))).z>0)tri(a,b,c,earth[i%4]);else tri(a,c,b,earth[i%4]);}
  };
  peel(-2.25,1.94,.55,.64,1.686);peel(-1.81,1.32,.39,.48,1.688);
}
