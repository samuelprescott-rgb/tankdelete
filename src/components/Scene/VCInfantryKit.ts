import * as THREE from 'three';

// The sighting scout turns the ribcage around the rifle butt, not the rifle
// around the ribcage. Pelvis, wrist seams and butt-seat are hard landmarks.
// Author it in the bind pose; runtime target direction and foot IK stay exact.
type Site=[number,number,number];
const ease=THREE.MathUtils.smoothstep;
export function scoutSightingSite(x:number,y:number,z:number,offset:number,out:THREE.Vector3) {
  const h=y+offset;
  const t=ease(h,.89,1.42)*ease(z,-.265,-.145);
  const theta=-.73*t, c=Math.cos(theta),s=Math.sin(theta);
  const u=x-.154,w=z+.085, upper=ease(h,1.302,1.455)*t;
  return out.set(.154+c*u+s*w+.116*upper,
    y-.081*upper-.25*u*t+.076*w*t,
    -.085-s*u+c*w-.044*upper);
}

export function poseSightingScout(g:THREE.BufferGeometry,offset:number,arms:{shoulder:Site;elbow:Site;wrist:Site}[]){
  const {position:p,normal:n,skinIndex:b,surfaceKind:k,color:dye,garmentPanel:panel}=g.attributes;
  const q=new THREE.Vector3(),f=new THREE.Vector3(),dx=new THREE.Vector3(),dy=new THREE.Vector3(),dz=new THREE.Vector3();
  const normal=new THREE.Vector3(),inverse=new THREE.Matrix3(),site=scoutSightingSite;
  const shirtEnd=g.userData.jacketFitRanges.at(-1)[0];
  for(let i=0;i<p.count;i++){
    if(b.getX(i)!==1)continue; // Legs keep their planted volume; head stays on its own joint.
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),h=y+offset,kind=k.getX(i);
    if(kind===1 && i>=shirtEnd && h<1.38)continue; // the separate mass of each gripping hand
    if(h<.89 || z<-.265)continue;
    site(x,y,z,offset,f);
    site(x+.0003,y,z,offset,dx).sub(f).divideScalar(.0003);
    site(x,y+.0003,z,offset,dy).sub(f).divideScalar(.0003);
    site(x,y,z+.0003,offset,dz).sub(f).divideScalar(.0003);
    inverse.set(dx.x,dy.x,dz.x, dx.y,dy.y,dz.y, dx.z,dy.z,dz.z).invert().transpose();
    normal.fromBufferAttribute(n,i).applyMatrix3(inverse).normalize();
    n.setXYZ(i,normal.x,normal.y,normal.z);p.setXYZ(i,f.x,f.y,f.z);
    if(kind===0 && panel.getX(i)===4){
      // Unbleached indigo inside the forearm / under the load. The outside
      // of the cotton shoulder and sun-facing back have worn to blue-grey.
      // This spans whole pattern pieces, not a rim or screen-space mark.
      const across=ease(-.70*x+.38*z+.30*(h-1.1),-.12,.15);
      const high=ease(h,1.04,1.32),value=.82+high*(.40+1.25*across);
      dye.setXYZ(i,dye.getX(i)*value*(1+.14*across),dye.getY(i)*value*(1+.08*across),dye.getZ(i)*value);
    }else if(kind===4 && panel.getX(i)===3 && h>1.09){
      dye.setXYZ(i,dye.getX(i)*1.46,dye.getY(i)*1.37,dye.getZ(i)*1.20);
    }
  }
  for(const arm of arms)for(const key of ['shoulder','elbow'] as const){
    const v=arm[key];site(...v,offset,q);v[0]=q.x;v[1]=q.y;v[2]=q.z;
  }
  const bind=new THREE.Vector3(0,1.44-offset,.008);
  g.userData.scoutNeckSeat=site(bind.x,bind.y,bind.z,offset,q).sub(bind).toArray();
  g.computeBoundingBox();g.computeBoundingSphere();
}

// Pattern-piece dimensions in figure space, before the standing/kneeling
// lift. The load hangs at the right hip; the sloped shoulder opposite it
// and the longer, free left shirt-tail should still show at field distance.
export function cutScoutTunic(torso:THREE.BufferGeometry) {
  const p=torso.getAttribute('position'), rows=15, stride=p.count/rows;
  const fold=torso.getAttribute('tailorDye');
  const smooth=THREE.MathUtils.smoothstep;
  for(let i=0;i<p.count;i++){
    const row=Math.floor(i/stride), x=p.getX(i),z=p.getZ(i),y=p.getY(i);
    const a=Math.abs(x),side=Math.sign(x),radial=Math.sign(z-.018);
    // Flared panels below the belt, with short side vents. At the packed
    // hip the bag drags the side up. Front and back tails are different
    // lengths; do not make a uniform ring below the waist.
    const skirt=[1,.70,.23,0][row]??0;
    const vent=smooth(a,.145,.197)*(1-smooth(Math.abs(z-.010),.040,.098));
    const loaded=smooth(x,.022,.160),back=smooth(z,.015,.094);
    let dx=side*skirt*(.028+.014*back-.013*loaded);
    let dy=skirt*(-.093-.033*back+.088*vent+.034*loaded);
    let dz=radial*skirt*(.018+.025*back)*(1-.62*vent);
    // A narrow lower ribcage under a wider sleeve makes a real slot for
    // the firing elbow. Leave the shoulder pad and the harness seats.
    const wall=smooth(a,.105,.185), waist=[0,0,0,0,.6,1,1,.92,.54,.12][row]??0;
    dx-=side*waist*wall*.022;
    const pitch=[0,0,0,0,0,0,0,0,.18,.44,.71,1,.85,.45,0][row];
    dy-=pitch*smooth(a,.077,.184)*(.025+.014*loaded);
    // A tension fold runs from the opposite shoulder into the bag. Its
    // valley is local to the back; the front still seats the unchanged prop.
    const pull=Math.exp(-(((x-(1.42-y)*.63+.103)/.051)**2))*back;
    dz-=pull*.011*smooth(y,1.16,1.30);
    p.setXYZ(i,x+dx,y+dy,z+dz);
    fold.setX(i,fold.getX(i)-.24*pull+.13*skirt*back-.19*skirt*vent);
  }
}

export const SCOUT_SLEEVE_BANDS=[
  [.035,.072,.070,0], [.12,.083,.077,0], [.23,.083,.080,0],
  [.34,.083,.076,0], [.41,.082,.070,0], [.50,.073,.075,0],
  [.60,.069,.068,0], [.665,.069,.062,0], [.735,.062,.061,0],
  [.809,.055,.051,0], [.862,.058,.051,0], [.930,.055,.047,0],
  [1,.034,.035,0],
];

/** A filled cloth sling, carried from the loaded shoulder down across the
 * back instead of another identical soldier's box pack. Flatten the inside
 * against the shirt; the gathered ends and two tight lashings carry the
 * load while the unbound body drops away from the ribs. */
export function createScoutRiceRoll(offset:number){
  // x,y,z, half-width, half-depth, dyed value. First end buries in the
  // existing shoulder sling; last is tucked beneath its low bag tab.
  const cuts=[
    [-.110,1.430,.020,.021,.016,.63],[-.149,1.429,.099,.033,.024,.91],
    [-.192,1.401,.160,.077,.068,1.06],[-.211,1.367,.198,.105,.097,1.08],
    [-.208,1.334,.219,.080,.078,.67],[-.206,1.318,.229,.103,.094,1.03],
    [-.163,1.238,.260,.129,.110,1.08],[-.079,1.160,.283,.133,.111,1.06],
    [.012,1.095,.269,.112,.097,.94],[.047,1.079,.260,.082,.069,.61],
    [.075,1.071,.245,.092,.076,1.02],[.117,1.057,.193,.052,.042,.79],
    [.139,1.069,.133,.024,.018,.68],
  ];
  const positions:number[]=[],colors:number[]=[],indices:number[]=[],sides=8;
  const dyed=new THREE.Color('#958960'), light=new THREE.Color('#bdb08b'), tie=new THREE.Color('#62583e'), paint=new THREE.Color();
  const axis=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3(),p=new THREE.Vector3();
  for(const [r,[x,y,z,w,d,value]] of cuts.entries()){
    const prev=cuts[Math.max(0,r-1)],next=cuts[Math.min(cuts.length-1,r+1)];
    axis.set(next[0]-prev[0],next[1]-prev[1],next[2]-prev[2]).normalize();
    // Parallel-transport the first cross-section across the drooping bend.
    if(!r)u.set(1,0,.13);
    u.addScaledVector(axis,-u.dot(axis)).normalize();v.crossVectors(axis,u).normalize();
    for(let j=0;j<sides;j++){
      const a=2*Math.PI*j/sides,cs=Math.cos(a),sn=Math.sin(a);
      const fullness=(1+.11*Math.cos(3*a+.24*r)-.05*Math.sin(2*a-r*.31));
      p.set(x,y-offset,z).addScaledVector(u,w*cs*fullness).addScaledVector(v,d*sn*fullness);
      // A long bias seam returns on the outer, hanging belly. There is
      // less volume on the side pressed against the carrier's shoulder.
      p.y-=(1-Math.abs(cs))*.020*Math.sin(Math.PI*r/(cuts.length-1));
      p.z-=Math.max(0,z-p.z)*.20;
      positions.push(p.x,p.y,p.z);
      const bound=r===4||r===9, daylight=Math.max(0,(p.y-y+offset)*7+(p.z-z)*3.1);
      paint.copy(bound?tie:dyed).lerp(light,bound?.11:.11+.30*daylight)
        .multiplyScalar(value*(.74+.28*daylight+(j===6?.16:j===7?-.13:0)));
      colors.push(paint.r,paint.g,paint.b);
      if(!r)continue;
      const i=r*sides+j,l=r*sides+(j+1)%sides;
      indices.push(i-sides,l-sides,i,l-sides,l,i);
    }
  }
  const end=(cuts.length-1)*sides;
  for(let j=1;j<sides-1;j++)indices.push(0,j+1,j,end,end+j,end+j+1);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(indices);g.computeVertexNormals();
  const out=g.toNonIndexed();g.dispose();out.userData.infantrySurface=4;out.userData.gearPanel=2;
  return out;
}

/** A haircut, not a different facial sculpt. Work on the existing portrait
 * copy only, preserving its eyes, brows, ear, jaw, pigmentation and UVs. */
export function trimScoutHair(face:THREE.BufferGeometry,headY:number,variant:number){
  const p=face.getAttribute('position'),c=face.getAttribute('color'),n=face.getAttribute('normal');
  const clipped=new THREE.Color(['#302c29','#423a31','#35322e'][Math.abs(variant)%3]),old=new THREE.Color();
  const smooth=THREE.MathUtils.smoothstep,cut=[.008,-.004,.003][Math.abs(variant)%3];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)-.012,z=p.getZ(i),y=p.getY(i)-headY+.128;
    const around=smooth(z,-.079,-.048)*smooth(Math.abs(x),.049,.074);
    const neck=smooth(z,.042,.084);
    const ear=1-smooth(Math.abs(x),.070,.086)*Math.exp(-(((z-.002)/.021)**2)-(((y-.131)/.033)**2));
    const edge=.179+cut-.035*smooth(z,-.048,.032)-.018*neck+.006*Math.sin(75*z+42*x+variant*.7);
    const weight=Math.max(around,neck)*smooth(y,edge-.008,edge+.007)*ear;
    if (weight>.001) {
      old.fromBufferAttribute(c,i).lerp(clipped,weight*(.48+.092*Math.sin(257*y+134*z)*(.5+.5*n.getY(i))));
      old.toArray(c.array,i*3);
    }
  }
}

/** Weathered cotton dispatch bag. The long axis wraps forward onto the wearer's
 * right hip, rather than crossing the spine like a US field pack. Construction
 * is in local bag coordinates, from a shared eight-sided gusset pattern. */
export function createScoutShoulderBag(offset:number,variant:number) {
  const pos:number[]=[], rgb:number[]=[], panel:number[]=[], triangles:number[]=[];
  const dye=new THREE.Color(), phase=(variant%3-1)*.005;
  function v(u:number,y:number,w:number,hex:string,light:number,chart=2){
    const i=pos.length/3;
    const hang=THREE.MathUtils.clamp((1.155-y)/.29,0,1);
    // At rest the strap holds the two upper corners against the hip; the
    // bag's contents carry its lower half outwards and toward the free edge.
    pos.push(.197+u*.78+w*.78+.035*hang,
      1.070+(y-1.155)*1.18-offset-u*.235-.014*hang,
      .116-u*.81+w*.69+.025*hang);
    dye.set(hex).multiplyScalar(light);
    rgb.push(dye.r,dye.g,dye.b);panel.push(chart);return i;
  }
  function quad(a:number,b:number,c:number,d:number){triangles.push(a,b,d,b,c,d);}
  // Front of bag is +w: a fuller left lower pocket, flattened mouth and
  // pulled-up nose under the side attachment. Dark return at the real flap lip.
  const outline=[[-1,.64],[-.74,1],[-.26,1.05],[.30,1],[.76,.91],[1,.55],[.95,-.65],[.64,-1],[-.62,-1],[-1,-.56]];
  const courses=[
    [.895,.109,.024,-.008,.70],[.912,.144,.045,-.002,1.10],
    [.993,.150,.060,.003,1.04],[1.066,.140,.046,.002,.82],
    [1.121,.133,.032,-.004,.65],[1.144,.118,.027,-.010,1.03],
  ];
  const cloth=['#79795d','#838064','#7b7960'][Math.abs(variant)%3];
  let last:number[]=[];
  for(const [j,[y,width,depth,dz,light]] of courses.entries()){
    const loop=outline.map(([u,w])=>{
      const sag=1-u*u, lip=w>0?1:.21;
      return v(u*width+phase*.6, y-.023*sag*lip+.010*u*u+phase*u,
        dz+w*depth+(j>0&&j<4?.009:0)*sag*lip,cloth,light*(.70+.19*(w+1))*(u<-.75?.79:1));
    });
    if(j)for(let k=0;k<loop.length;k++)quad(last[k],last[(k+1)%loop.length],loop[(k+1)%loop.length],loop[k]);
    if(j===0||j===courses.length-1){
      const c=v(0,y+(j?-.005:-.020),dz,cloth,light*.76);
      for(let k=0;k<loop.length;k++)triangles.push(c,j?loop[k]:loop[(k+1)%loop.length],j?loop[(k+1)%loop.length]:loop[k]);
    }
    last=loop;
  }
  // Five courses start inside the bag, wrap over its throat, then hang as a
  // real loose flap; weighted centre, darker underturned edge and sloped nose.
  last=[];
  const strips=[[-.85,1.131,-.025,.79],[.00,1.148,-.011,1.18],[.20,1.125,.038,1.08],
    [.70,1.025,.072,1.02],[.95,1.001,.073,1.17],[1,.995,.063,.56]];
  for(const [j,[t,y,w,light]] of strips.entries()){
    const row=[-1,-.74,-.36,.03,.46,.78,1].map(u=>{
      const belly=1-u*u, pinch=Math.exp(-(((u-.40)/.18)**2));
      return v(u*(.131-.019*Math.max(0,t))+.004*t,y-.019*belly+u*.022-.006*pinch,
        w+belly*.009-pinch*.007-.025*u*u,cloth,light*(.84+.20*belly-.16*pinch));
    });
    if(j)for(let k=0;k<row.length-1;k++)quad(last[k],last[k+1],row[k+1],row[k]);
    last=row;
  }
  // Opposing stitch tabs at suspension points, narrow retaining tape and
  // keeper on the body of the bag. All are part of the same skinned draw.
  const slingSeats:THREE.Vector3[][]=[];
  function tape(path:number[][],width:number,hex:string,hang=false){
    let preceding:number[]=[];
    for(const [i,[u,y,w]] of path.entries()){
      const row=[-1,1].map(s=>v(u+s*width,y,w,hex,(s>0?.87:1.12)*(i===0?.78:1),3));
      if(hang&&i===1)slingSeats.push(row.map(k=>new THREE.Vector3().fromArray(pos,k*3)));
      if(i)quad(preceding[0],preceding[1],row[1],row[0]);preceding=row;
    }
  }
  tape([[.048,1.123,.046],[.054,1.077,.061],[.053,1.018,.073],[.048,.979,.072],[.045,.958,.063]],.009,'#655c44');
  tape([[.053,1.014,.077],[.052,1.005,.076]],.013,'#ad9972');
  tape([[-.091,1.116,.017],[-.092,1.174,-.029],[-.090,1.139,-.046]],.015,'#887e5e',true);
  tape([[.115,1.105,.020],[.127,1.161,-.025],[.119,1.127,-.048]],.016,'#8d8263',true);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  g.setAttribute('garmentPanel',new THREE.Uint8BufferAttribute(panel,1));
  // Pattern runs clockwise looking down, so the side rows above are wound
  // inward; reverse only the shell walls (caps retain their separate winding).
  // The lid runs top to bottom with +u right, hence its outside is -cross.
  // Orient each part by its actual outside, avoiding a double-sided material.
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3(),cent=new THREE.Vector3();
  for(let t=0;t<triangles.length;t+=3){
    const ids=triangles.slice(t,t+3),shell=ids.every(i=>i<62);
    a.fromArray(pos,ids[0]*3);b.fromArray(pos,ids[1]*3);c.fromArray(pos,ids[2]*3);
    cent.copy(a).add(b).add(c).multiplyScalar(1/3); n.crossVectors(b.sub(a),c.sub(a));
    if(shell){cent.sub(new THREE.Vector3(.214,.89-offset,.13));}
    else{cent.set(.78,.20,.69);}
    if(n.dot(cent)<0){triangles[t+1]=ids[2];triangles[t+2]=ids[1];}
  }
  g.setIndex(triangles);g.computeVertexNormals();const out=g.toNonIndexed();g.dispose();
  out.userData.infantrySurface=4;out.userData.gearPanel=2;out.userData.scoutSlingSeats=slingSeats;return out;
}

/** Runs after the textile atlas sampling, in the existing VC material's bind-
 * space pigment block. Preserve the sampled textile under real light: mixing
 * it into a solid indigo swatch was erasing both the cloth and the bent elbow. */
export const SCOUT_CLOTH_PIGMENT = `
  if(k>6.5){
    float pigment=dot(source,vec3(.24,.65,.11));
    float timber=smoothstep(.18,.83,(source.r-source.b)/max(.019,pigment));
    float top=smoothstep(-.35,.80,n.y+.21*n.x);
    // A blue-grey rolled sheet beside warm wood, not the same graphic
    // black as the hand's occlusion. The lip and pins have real normals.
    vec3 metalPig=source*vec3(.92,1.05,1.12)+vec3(.005,.008,.009)*(.45+.55*top);
    vec2 brush=floor(p.yz*340.+.5)/340.;
    float band=sin(brush.x*780.+brush.y*12.+2.*sin(brush.y*27.));
    float strand=smoothstep(.57,.91,band)*(.40+.60*smoothstep(-.3,.85,sin(brush.y*35.+brush.x*33.)));
    float detail=1.-smoothstep(.001,.009,length(fwidth(p.yz)));
    vec3 stock=source*(.93+.18*top+.22*strand*detail)+vec3(.012,.006,.002)*strand*detail;
    diffuseColor.rgb=mix(metalPig,stock,timber);
  }
  if(k>.5 && k<1.5 && p.z<-.10){
    float wristL=dot(source,vec3(.25,.63,.12)),outward=smoothstep(-.5,.85,n.y+.55*n.x-.16*n.z);
    vec3 bare=mix(wristL*vec3(.96,.85,.79),source,.68+.25*outward);
    diffuseColor.rgb=mix(diffuseColor.rgb,bare*(.78+.28*outward),.68);
  }
  if(k<.5 && vGarmentPanel>3.5){
    float cool=smoothstep(-.10,.16,(source.b-source.r)/max(.010,val*val));
    float nap=smoothstep(-.4,.63,dot(n,vec3(.20,.70,-.53)));
    float wear=clamp(.42+.34*nap+.33*dab*resolved,0.,1.);
    vec3 bodyDye=mix(source,ink,.12*inRange);
    vec3 cotton=bodyDye*mix(vec3(.90,.96,1.02),vec3(1.42,1.36,1.20),wear);
    // Read the fold before the weave: unbleached indigo under the upper
    // arm, a few slate-blue washed planes, and turned-back lighter cuffs.
    float ledge=smoothstep(.43,.62,n.y-.32*n.z);
    cotton*=mix(vec3(.79,.86,1.00),vec3(1.06,1.09,1.09),ledge);
    cotton+=vec3(.014,.020,.025)*nap*wear;
    diffuseColor.rgb=mix(diffuseColor.rgb,cotton,cool*.96);
  }
  if(lid && (vGarmentPanel<.5||vGarmentPanel>4.5)){
    // Allow pale bast fibres and the dark bound rim to keep their own hue.
    float straw=smoothstep(.08,.30,(source.r-source.b)/max(.016,val*val));
    diffuseColor.rgb=mix(diffuseColor.rgb,source*(1.+dab*.36*resolved),straw*.81);
    if(vGarmentPanel>4.5){
      vec2 radial=p.xz-vec2(.006,-.014);radial.y/=.932;
      float radius=length(radial),angle=atan(radial.x,radial.y);
      // Annular stitching traverses overlapping palm-leaf panels; twelve
      // paired radial ribs rise from the crown. True surface-coordinate
      // frequency fades away before the threads become sub-pixel.
      vec2 strip=vec2(angle*1.90986,radius*149.);
      float sector=fract(strip.x),course=fract(strip.y);
      float fade=1.-smoothstep(.13,.57,max(fwidth(radius)*149.,fwidth(p.x)*26.));
      float stitch=(1.-smoothstep(.07,.23,abs(course-.32)))*
        step(.19,fract(strip.x*4.+floor(strip.y)*.47));
      float spoke=1.-smoothstep(.014,.065,min(sector,1.-sector));
      float seam=1.-smoothstep(.016,.096,abs(sector-.10));
      float leaf=.5+.5*cos(floor(strip.x)*1.9+floor(strip.y*.24)*.31);
      diffuseColor.rgb*=1.+fade*(.27*stitch+.24*spoke-.31*seam)+(.10*leaf-.06);
      diffuseColor.rgb+=vec3(.038,.029,.013)*spoke*fade;
    }
  }
  // One light family for woven brim, rolled cotton shoulder, and pack:
  // sunlit flax and the fading *top* of indigo, quiet cool cloth beneath.
  // Below the elbow/hood or on the hat underside, keep the dark plane.
  if(lid || canvas || (k<.5&&vGarmentPanel>3.5)){
    vec3 field=fieldLightGroup(vNormal);
    if(lid){
      float crown=smoothstep(-.09,.53,field.y);
      vec3 bast=diffuseColor.rgb*mix(vec3(.34,.39,.43),vec3(.97),crown);
      diffuseColor.rgb=fieldWornDye(bast,field,crown*.90,vec3(.43,.330,.175),vec3(.126,.146,.132));
    }else{
      float high=1.85*vHandInkChart.y;
      if(canvas){
        float roll=smoothstep(1.015,1.34,high);
        vec3 pack=diffuseColor.rgb*mix(vec3(.66,.62,.61),vec3(.88),roll);
        diffuseColor.rgb=fieldWornDye(pack,field,.38+.58*roll,vec3(.323,.201,.103),vec3(.096,.095,.074));
      }else{
        float shoulder=smoothstep(1.17,1.366,high);
        vec3 indigo=diffuseColor.rgb*mix(vec3(.68,.75,.91),vec3(.90,.96,1.),shoulder);
        diffuseColor.rgb=fieldWornDye(indigo,field,.95*shoulder,vec3(.197,.216,.180),vec3(.091,.125,.149));
      }
    }
  }
`;
