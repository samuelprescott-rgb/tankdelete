import { useEffect, useMemo } from 'react';
import * as T from 'three';
import { createPaintedBarkMaterial } from './useJungleBark';
import { createJungleCanopyMaterial } from './jungleGeometry';
import { applyFoliageSightline, useFoliageSightline } from './FoliageSightline';
import { terrainReliefHeight } from '../../lib/terrain';
import {DAY_PAD,transportPose} from '../../lib/campaignFlights';
import {LIFT_PAD,embassyTransportPose} from '../../lib/embassyLift';

// East, on dry ground past the paddy lip. +X reads as left in the ordinary
// chase. Only the long, high river-facing limb reaches in toward the sky.
export const BANK_FIG_FOOT: [number, number, number] = [11.94, 0, 6.22];
const COURT_FIG_FOOT: [number,number,number]=[-22.3,terrainReliefHeight(-22.3,-20.7),-20.7];
const PADDY_FIG_FOOT: [number,number,number]=[-13.15,terrainReliefHeight(-13.15,-2.25),-2.25];
type Knot = [x:number, y:number, z:number, radius:number];
const xyz=(k:Knot)=>new T.Vector3(k[0],k[1],k[2]);
const tau=Math.PI*2;
const wiggle=(n:number)=>{const v=Math.sin(n*48.179+.41)*42136.461;return v-Math.floor(v);};
class Skin {
  pos:number[]=[]; uv:number[]=[]; tint:number[]=[]; ix:number[]=[];
  vert(p:T.Vector3,u:number,v:number,r:number,g:number,b:number) {
    const i=this.pos.length/3;
    this.pos.push(p.x,p.y,p.z);this.uv.push(u,v);this.tint.push(r,g,b);return i;
  }
  finish() {
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(this.pos,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(this.uv,2));
    g.setAttribute('color',new T.Float32BufferAttribute(this.tint,3));
    g.setIndex(this.ix);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
    return g;
  }
}

// One indexed bark skin, one cutout crown. The painted sprays start at woody
// tips, bend at their midribs, and turn over in space; no camera-facing quads.
export function createBankFigGeometry(court=false){
  const wood=new Skin(),leaf=new Skin();
  const stem=(knots:Knot[],sides:number,flute:number,seed:number)=>{
    const first=wood.pos.length/3, axis=new T.Vector3(), side=new T.Vector3(),cross=new T.Vector3();
    let distance=0;
    for(let i=0;i<knots.length;i++){
      const p=xyz(knots[i]),prev=xyz(knots[Math.max(0,i-1)]);
      distance+=p.distanceTo(prev);
      axis.subVectors(xyz(knots[Math.min(knots.length-1,i+1)]),prev).normalize();
      if(!i)side.set(0,0,1);
      side.addScaledVector(axis,-side.dot(axis));
      if(side.lengthSq()<1e-6)side.set(1,0,0).addScaledVector(axis,-axis.x);
      side.normalize();cross.crossVectors(axis,side).normalize();
      for(let j=0;j<=sides;j++){
        const a=j*tau/sides, r=knots[i][3], phase=a+seed*.7;
        const cord=.60*Math.cos(5*phase+distance*.34)+.40*Math.sin(3*phase-distance*.45);
        const radius=r*(1+flute*cord);
        const point=p.clone().addScaledVector(side,Math.cos(a)*radius)
          .addScaledVector(cross,Math.sin(a)*radius);
        const grain=.81+.17*cord+.12*wiggle(seed+7*(j%sides)+13*i);
        // Existing bark texture repeats twice around U and nine times in V;
        // store physical arclength, not ring count, to avoid stretched limbs.
        wood.vert(point,j/sides,distance*.087+seed*.113,grain*1.08,grain,grain*.88);
        if(i&&j){const n=wood.pos.length/3-1,b=n-(sides+1);
          wood.ix.push(b-1,b,n,n-1,b-1,n);}
      }
    }
    // Cap only small tips. The buttress feet end under soil; forks overlap.
    const last=knots[knots.length-1], end=first+(knots.length-1)*(sides+1);
    const cap=wood.vert(xyz(last),.5,.5,.78,.68,.53);
    for(let j=0;j<sides;j++)wood.ix.push(end+j,end+j+1,cap);
  };

  // A fluted, slightly hollow-waisted bole. The opposite fork is set well
  // behind the leading arm instead of flattening both into the same plane.
  const trunk:Knot[]=[[0,-.23,0,.78],[-.06,.12,.04,.79],[-.14,.58,.12,.65],
    [-.23,1.22,.05,.54],[-.42,2.06,.09,.51],[-.77,2.95,.20,.52],
    [-1.15,3.57,.29,.58],[-1.65,4.13,.37,.53],[-2.38,4.62,.46,.43],
    [-3.27,5.09,.49,.38],[-4.41,5.42,.67,.30],[-5.38,5.93,.66,.23],
    [-6.12,6.51,.58,.18],[-6.95,6.87,.66,.13],[-7.96,7.13,.69,.085],[-8.76,7.32,.83,.025]];
  stem(trunk,20,.205,2);
  // Wide, bent buttresses (tall and thin near the collar; spreading low at
  // the foot). Their ends and the small split toes disappear below the earth.
  for(let i=0;i<7;i++){
    const a=tau*i/7+.21*wiggle(i+2), length=1.12+.49*wiggle(i+13);
    const dir=new T.Vector3(Math.cos(a),0,Math.sin(a)*.79),wide=new T.Vector3(-dir.z,0,dir.x).normalize();
    const rows=[[.29,1.29,.14],[.46,.85,.17],[.65,.48,.20],[1.01,.25,.15],[length,.12,.07],[length+.24,-.025,.025]];
    let prev=0;
    for(let j=0;j<rows.length;j++){
      const [d,h,w]=rows[j],base=dir.clone().multiplyScalar(d).addScaledVector(wide,.13*Math.sin(j*.95+i));
      const first=wood.pos.length/3;
      for(const [s,y] of [[-1,-.11],[-.56,h*.66],[.12,h],[.66,h*.55],[1,-.11]]){
        const p=base.clone().addScaledVector(wide,s*w);p.y=y;
        wood.vert(p,s*.24+.4,j*.087,.93+.09*s,.89+.08*s,.78);
      }
      if(j)for(let k=0;k<4;k++)wood.ix.push(prev+k,prev+k+1,first+k,prev+k+1,first+k+1,first+k);
      prev=first;
    }
  }
  // Thin fused fig cords, embedded along the face of the bole. As the
  // cylinder twists, the highlights enter and leave the underlying surface.
  for(let i=0;i<5;i++){
    const ks=trunk.slice(1,9).map((p,j):Knot=>{
      const a=tau*i/5-.45+j*.105+.08*Math.sin(j*.9+i);
      return [p[0]+Math.cos(a)*p[3]*.93,p[1],p[2]+Math.sin(a)*p[3]*.93,
        (.095+.038*wiggle(i+4))*(.72+.28*Math.sin(j*.6+i))*(j===7?.49:1)];
    });
    stem(ks,5,.11,i+11);
  }
  const forks:Knot[][]=[
    [[-1.23,3.64,.35,.435],[-1.44,4.42,.63,.38],[-1.39,5.22,1.13,.31],[-1.91,6.01,1.52,.235],[-2.82,6.53,1.94,.175],[-3.72,6.80,2.26,.09],[-4.38,7.30,2.65,.029]],
    [[-1.49,4.52,.83,.275],[-.79,5.33,1.10,.215],[.10,5.77,1.29,.155],[.96,6.30,1.26,.095],[1.57,6.88,1.54,.026]],
    [[-2.58,4.74,.47,.237],[-3.05,5.46,-.17,.18],[-3.19,6.21,-.70,.126],[-3.94,6.74,-1.12,.072],[-4.63,7.19,-1.53,.025]],
    [[-4.43,5.44,.65,.19],[-4.98,5.43,.74,.135],[-5.52,5.61,.84,.097],[-5.98,5.85,.79,.057],[-6.38,6.10,.67,.021]],
    [[-6.35,6.60,.57,.117],[-6.88,7.15,-.05,.09],[-7.72,7.49,-.36,.052],[-8.12,7.96,-.6,.021]],
    [[-7.99,7.13,.71,.078],[-8.56,7.12,1.16,.058],[-9.05,7.40,1.57,.034],[-9.55,7.46,1.81,.015]],
    [[-2.87,6.54,1.96,.13],[-2.70,7.28,2.49,.093],[-2.25,7.69,3.12,.06],[-2.31,8.26,3.58,.021]],
    [[-.78,5.32,1.10,.15],[-.65,6.17,.69,.11],[-.90,6.91,.45,.058],[-.68,7.72,.62,.02]],
  ];
  const spray=(base:T.Vector3,heading:number,len:number,rise:number,roll:number,tone:number)=>{
    const fwd=new T.Vector3(Math.cos(heading),0,Math.sin(heading)), ortho=new T.Vector3(-fwd.z,0,fwd.x);
    const j0=leaf.pos.length/3;
    for(let j=0;j<3;j++)for(let i=0;i<3;i++){
      // A hand turns edge-on at the heel, spreads about its knuckle, then
      // curls to one side. A flat, equally broad cuff read as a pennant.
      const t=j*.5,s=i-1, ang=roll+t*.44, span=len*(j===0?.29:j===1?.49:.37);
      const p=base.clone().addScaledVector(fwd,t*len).addScaledVector(ortho,s*span*Math.cos(ang));
      p.addScaledVector(ortho,Math.sin(roll)*len*.16*t*t);
      p.y+=rise*t+.16*len*Math.sin(t*Math.PI)+s*span*Math.sin(ang)-s*s*span*.25;
      const face=tone*(.82+.13*t+.10*s*Math.cos(roll));
      leaf.vert(p,i*.5,t,face*(1.05+.06*t),face,face*(.78-.10*t));
      if(i&&j){const n=j0+j*3+i;leaf.ix.push(n-4,n-3,n,n-4,n,n-1);}
    }
  };
  if(!court){
    // The dry-bank tree carries a shorter, weight-bearing arm on the dark
    // (camera-facing) side of the elbow. Its thumb bends out toward the
    // viewer, then back across the bole. Read the masses first: one high
    // shoulder, one broad skirt and a low pendant, not a necklace of tips
    // along the long river-facing arm. The sun is on the *opposite* side.
    const knuckle:Knot[]=[[-1.57,4.10,.29,.33],[-1.86,4.81,-.18,.28],
      [-1.73,5.52,-.87,.21],[-1.89,6.20,-1.85,.18],[-2.56,6.63,-2.62,.13],
      [-3.57,6.78,-3.28,.078],[-4.31,6.62,-3.57,.027]];
    stem(knuckle,7,.12,63);
    const hook:Knot[]=[knuckle[3],[-1.32,6.25,-2.77,.096],
      [-.85,6.07,-3.49,.053],[-.56,5.71,-3.79,.019]];
    stem(hook,4,.08,64);
    const place=(k:Knot,a:number,l:number,h:number,roll:number,tone:number)=>spray(xyz(k),a,l,h,roll,tone);
    // The crown occupies the middle of the new arm: its foremost, mostly
    // shadowed hand overlaps the back of the sun-facing shoulder, while the
    // twig and the bend at the two extremes can still be followed by eye.
    place(knuckle[2],-1.33,2.45,.71,-.57,.80);
    place(knuckle[3],-2.18,2.82,.50,.50,1.02);
    place(knuckle[3],-.98,2.64,-.45,-.55,.90);
    place(knuckle[4],-2.50,2.68,.54,.40,.96);
    place(knuckle[4],-1.80,2.61,-.91,-.64,.85);
    place(knuckle[4],-.91,2.15,-1.10,.87,.70);
    place(knuckle[5],-2.76,2.17,-.44,.64,.88);
    place(knuckle[5],-1.92,1.94,-1.14,-.84,.74);
    place(hook[1],-.54,2.32,-.48,-.48,.89);
    place(hook[2],-.94,1.97,-1.15,.76,.78);
    place(hook[2],-1.82,1.55,-1.29,-.74,.70);
  }
  // Alternating woody pencils structure the silhouette. Sparse downswept tips
  // and broad gaps between fans keep the sunset visible through the crown.
  [...forks,trunk.slice(-4)].forEach((arm,i)=>{
    if(court&&(i===2||i===6)){
      // A storm-lost lateral at the Records verge. Two broken woody
      // spurs remain as witnesses below the open V; the flag-side hand
      // and the shade-side cluster now frame *sky*, not each other.
      const stub=arm.slice(0,i===2?3:2).map(k=>[...k] as Knot);
      stub[stub.length-1][3]=i===2?.044:.036;
      stem(stub,i===2?8:6,.135,3+i);
      return;
    }
    if(i<forks.length)stem(arm,arm[0][3]>.17?12:8,.135,3+i);
    for(let j=0;j<3;j++){
      const tipIndex=arm.length-1-j, p=xyz(arm[tipIndex]);
      const back=xyz(arm[Math.max(0,tipIndex-1)]),angle=Math.atan2(p.z-back.z,p.x-back.x)
        +(j===0?.15:(j===1?1:-1)*(.61+.39*wiggle(i+j)));
      const size=.61+.36*wiggle(13*i+j), end=p.clone().add(new T.Vector3(Math.cos(angle)*size,.06+.31*wiggle(i*11+j),Math.sin(angle)*size));
      const mid=p.clone().lerp(end,.55);mid.y+=.10;
      const k=(v:T.Vector3,r:number):Knot=>[v.x,v.y,v.z,r];
      stem([k(p,.047),k(mid,.031),k(end,.011)],4,.06,25+i+j);
      if(court&&i===0&&j!==2)continue;
      if(court&&j===0&&i!==3&&i!==5){
        // Unpruned rain-tree canopy. A long parent, the shorter side hand,
        // and a few hanging ends overlap in *depth*, leaving openings at
        // the outermost pencil and in the crook above the large fork.
        // Broad on the high windward limbs, trailing on a lower branch.
        const flip=(i+j)%2?-1:1,span=1.62+.58*wiggle(23*i+13*j);
        spray(p,angle+flip*.36,span*1.17,.24,flip*.56,.93);
        spray(mid,angle-flip*(.54+.18*wiggle(i+5)),span,-.69+.20*wiggle(11*i+j),-flip*.80,.74);
        if(i%3===1)spray(end,angle+flip*.79,span*.71,-.84-.25*wiggle(i+3),flip*.92,.78);
      }
      // Each pencil carries a fan, not one small upright tuft isolated at
      // the very tip. Lay the longest spray with its parent wrist, then
      // turn two shorter sprays out of plane. The underside folds and
      // pendant ends read against the sky without closing the gap *between*
      // the fork and the long slanting arm.
      const shortTwig=(i===0&&j===0)||(i===3&&j!==1)||(i===5&&j===2)
        ||(i===6&&j<2)||(i===8&&j===2);
      if(shortTwig){
        // Open up the stream-facing notch. These small perimeter twigs
        // preserve the sun aperture and six metres of headroom; the fuller
        // fans grow back towards the crown, not across the crossing.
        const drop=j===1?-.38:.13;
        spray(end,angle,.65+.38*wiggle(i+30*j),drop+.24*wiggle(i+j),.39+.66*wiggle(13*i+j),.73+.18*wiggle(i*11+j));
        continue;
      }
      const sizeClass=(i===4||i===5||i===8)?.83:1.15;
      const fan=sizeClass*(1.05+.37*wiggle(i+30*j)), hand=(i+j)%2?1:-1;
      const drop=j===1?-.66:.10;
      spray(end,angle,fan*1.31,drop+.34*wiggle(i+j),hand*(.24+.53*wiggle(13*i+j)),.86+.11*wiggle(i*11+j));
      spray(mid,angle+hand*(.81+.25*wiggle(i+9)),fan*(j===0?1.12:.80),-.40+.37*wiggle(i+47),-.84*hand,.74);
      if(j===0)spray(p,angle-hand*.62,fan*1.05,-.53-.13*wiggle(i+68),.55*hand,.84);
    }
    // Some leaves grow from the interior half of the limb, not every spray
    // from its terminal node. These islands close the large bare triangle
    // over the Records verge while sky still separates adjoining hands.
    if((court?[0,1,2,6,7]:[0,1,2,7]).includes(i)){
      const fork=xyz(arm[Math.max(0,arm.length-4)]),tip=xyz(arm[arm.length-2]);
      const dir=Math.atan2(tip.z-fork.z,tip.x-fork.x),sign=i%2?-1:1;
      // In daylight these inner leaves are on the *back* forks behind the
      // bent leading arm. The naked elbow and long high finger still read.
      spray(fork,dir+sign*.66,court?2.29:1.79,.55,sign*.53,.97);
      spray(fork.clone().lerp(tip,.38),dir-sign*.69,court?1.83:1.57,-.43,-sign*.78,.74);
    }
  });
  return {bark:wood.finish(),sprays:leaf.finish()};
}

// Two fixed trees straddle the original flight paths. Bend only the upper
// fingers reaching into the occupied flight strip back toward their own
// forest verge. The base and other branches keep their original positions;
// wood, fused cords and leaf fans share the same continuous deformation.
function relievedFig(source:ReturnType<typeof createBankFigGeometry>,court:boolean){
  const pad=court?LIFT_PAD:DAY_PAD,pose=court?embassyTransportPose:transportPose,first=pose(court?0:.6);
  const side=new T.Vector2(pad[2]-first.z,first.x-pad[0]).normalize();
  if(!court)side.negate();
  const foot=court?COURT_FIG_FOOT:PADDY_FIG_FOOT,angle=court?-2.73:1.40,
    scale=court?new T.Vector3(1.22,1.46,1.05):new T.Vector3(.75,.86,.78);
  const world=new T.Matrix4().compose(new T.Vector3(...foot),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle),scale);
  const local=world.clone().invert(),pt=new T.Vector3(),approach=new T.Vector2(first.x-pad[0],first.z-pad[2]).normalize();
  const moments=Array.from({length:50},(_,i)=>{const p=pose((court?0:.6)+i*(court?5.75:7)/49);
    return {along:(p.x-pad[0])*approach.x+(p.z-pad[2])*approach.y,y:p.y};});
  const bend=(g:T.BufferGeometry)=>{
    const out=g.clone(),attr=out.getAttribute('position');
    for(let i=0;i<attr.count;i++){
      pt.fromBufferAttribute(attr,i).applyMatrix4(world);
      const dx=pt.x-pad[0],dz=pt.z-pad[2],d=dx*side.x+dz*side.y,along=dx*approach.x+dz*approach.y;
      const excess=d+4.30;if(excess<=0||pt.y<2)continue;
      let low=Infinity,high=-Infinity;
      for(const m of moments)if(Math.abs(m.along-along)<4.15){low=Math.min(low,m.y);high=Math.max(high,m.y);}
      if(low>high)continue;
      const influence=T.MathUtils.smoothstep(pt.y,1.8,3.0)*
        (1-T.MathUtils.smoothstep(Math.max(low-pt.y,pt.y-high),1.15,4.1));
      const push=influence*(excess-2.25*(1-Math.exp(-excess/2.25)));
      pt.x-=side.x*push;pt.z-=side.y*push;pt.applyMatrix4(local);attr.setXYZ(i,pt.x,pt.y,pt.z);
    }
    attr.needsUpdate=true;out.computeVertexNormals();out.computeBoundingBox();out.computeBoundingSphere();return out;
  };
  return {bark:bend(source.bark),sprays:bend(source.sprays)};
}

export function OldBankFig({ barkMaterial, canopyMap, court=false,dayLanding=false }:{barkMaterial:T.Material;canopyMap:T.Texture;court?:boolean;dayLanding?:boolean}){
  const sightline=useFoliageSightline();
  const geo=useMemo(()=>createBankFigGeometry(court),[court]);
  const verge=useMemo(()=>court||dayLanding?relievedFig(geo,court):geo,[geo,court,dayLanding]);
  const mats=useMemo(()=>{
    const bark=createPaintedBarkMaterial(barkMaterial);
    bark.vertexColors=true;
    return {bark:applyFoliageSightline(bark,sightline),
      leaves:applyFoliageSightline(createJungleCanopyMaterial({value:0},canopyMap),sightline)};
  },[barkMaterial,canopyMap,sightline]);
  useEffect(()=>()=>{geo.bark.dispose();geo.sprays.dispose();},[geo]);
  useEffect(()=>()=>{if(verge!==geo){verge.bark.dispose();verge.sprays.dispose();}},[verge,geo]);
  useEffect(()=>()=>{mats.bark.dispose();mats.leaves.dispose();},[mats]);
  // Different habit at the courtyard: tall bole and an asymmetric limb
  // leaning along the verge. Root it outside the pavement; only the high
  // fingers enter the upper-left corner of the regular horde chase.
  return <>{!court&&<group name="paddy-verge-rain-tree" position={PADDY_FIG_FOOT} rotation-y={1.40} scale={[.75,.86,.78]} dispose={null}>
    <mesh geometry={verge.bark} material={mats.bark} receiveShadow/>
    <mesh geometry={verge.sprays} material={mats.leaves}/>
  </group>}<group name={court?'west-verge-rain-tree':'old-fig-at-east-bank'} position={court?COURT_FIG_FOOT:BANK_FIG_FOOT}
    rotation-y={court?-2.73:0} scale={court?[1.22,1.46,1.05]:1} dispose={null}>
    <mesh name="fig-buttresses-and-fork" geometry={(court?verge:geo).bark} material={mats.bark} receiveShadow/>
    <mesh name="fig-cutout-branch-sprays" geometry={(court?verge:geo).sprays} material={mats.leaves}/>
  </group></>;
}
