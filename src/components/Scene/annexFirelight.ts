import * as T from 'three';
import {EMBASSY_ARCHIVE_SLOTS} from '../../lib/embassyDefense';
import {ANNEX_CROWNS} from './ruinedAnnex';
import {OFFICE_JAMB} from './annexStreetMasonry';
import {COMPOUND_BURN_PILE} from './embassyGroundworks';
type P=[number,number,number];
export interface EmbassyFirePocket {
  id:'courtyard'|'dispatch-lower'|'dispatch-upper'; position:P; size:number;
}
/** Shared hinge between the flames and the ash column, in building space. */
export const UPPER_BURN={records:[.79,3.31,.45],dispatch:[2.32,3.174,.56]} satisfies Record<string,P>;
// Physical fuel pockets and heights; the flame geometry and its receivers
// must not drift apart when art direction moves a fire within either wing.
export const LOWER_BURN={records:[-1.42,.44,1.78],dispatch:[-1.13,.44,1.64]} satisfies Record<string,P>;
export const ANNEX_FIRE_SCALE={records:[1.63,1.63],dispatch:[1.53,2.30]} as const;
/** Opaque room lighting and translucent flames need separate depth behavior. */
export function createAnnexFirelight(){
  const pos:number[]=[],rgb:number[]=[],paint=new T.Color();
  const [cx,cy,cz]=COMPOUND_BURN_PILE;
  const pockets:EmbassyFirePocket[]=[{id:'courtyard',position:[cx,cy+.14,cz],size:2.62}];
  for(const slot of EMBASSY_ARCHIVE_SLOTS.slice(1)){
    const records=slot.id==='records',side=records?1:-1,ox=slot.position[0],oz=slot.position[2];
    const tri=(a:P,b:P,c:P,tints:string[])=>{
      for(const [i,p] of [a,b,c].entries()){pos.push(ox+side*p[0],p[1],oz+p[2]);paint.set(tints[i]??tints[0]);
        rgb.push(paint.r,paint.g,paint.b);}
    };
    const rect=(x:number,y:number,z:number,w:number,h:number,left:string,right=left)=>{
      const a:P=[x,y,z],b:P=[x+w,y,z],c:P=[x+w,y+h,z],d:P=[x,y+h,z];
      tri(a,b,c,[left,right,right]);tri(a,c,d,[left,right,left]);
    };
    // Actual front room of the old townhouses, set 1.2 m BEHIND the
    // exterior shutters. The front and return form one lit corner, so
    // crossing the gate changes the visible source and the amount of light.
    // Copper walls in Dispatch face its fire; Records is lit from one desk.
    const low=records?-2.535:-2.205,hi=records?-.865:-.707,baseY=records?3.49:3.36,zRoom=.373;
    const heights=records?[5.56,5.55]:[4.89,4.51];
    const l:P=[low,baseY,zRoom],r:P=[hi,baseY,zRoom],rt:P=[hi,heights[1],zRoom],lt:P=[low,heights[0],zRoom],
      hip:P=[hi-.28,baseY+.69,zRoom];
    const tone=records?['#615348','#805f42','#635747','#5c5a4c','#c08c50']:
      ['#a56844','#764336','#a65e3a','#b76f4d','#de8d53'];
    tri(l,r,hip,[tone[0],tone[1],tone[4]]);tri(r,rt,hip,[tone[1],tone[2],tone[4]]);
    tri(rt,lt,hip,[tone[2],tone[3],tone[4]]);tri(lt,l,hip,[tone[3],tone[0],tone[4]]);
    // The lamp is a point of light under a real shade, behind an upright
    // and the nearer cold shutter. The right remains the only visible fire.
    if(records){
      rect(-2.10,3.68,.387,.99,.077,'#4c4740','#746249');
      rect(-1.48,3.74,.394,.045,.31,'#5f4d3c','#91795b');
      tri([-1.69,4.05,.398],[-1.22,4.05,.398],[-1.34,4.34,.398],['#ffe39f','#dfaa62','#b58354']);
      tri([-1.69,4.05,.398],[-1.34,4.34,.398],[-1.55,4.32,.398],['#ffe39f','#b58354','#cf9b61']);
      rect(-1.68,4.033,.40,.452,.030,'#ffe7a8','#efb970');
      rect(-2.34,4.72,.379,.38,.47,'#64523e','#927751');
      rect(-2.29,4.77,.383,.28,.36,'#ac956e','#7c7260');
    }else{
      // Torn shelving and fractured muntins cast long dark shapes in
      // the lit recess. Never let the source become one orange rectangle.
      for(const [a,b,w,h] of [[-2.11,3.41,.64,.15],[-2.05,3.81,.61,.078],[-1.90,3.50,.11,.32],[-1.73,3.52,.16,.26],[-1.01,3.39,.059,.74]])
        rect(a,b,.38,w,h,'#5c483a','#79583e');
      tri([-1.70,3.52,.379],[-1.59,3.53,.379],[-1.02,4.61,.379],['#976341','#8a583a','#835136']);
    }
    // The former two-sided desk cards filled both open rear windows from
    // BEHIND the building. Warm spill now lives only on the interior face
    // of the remaining masonry jamb; the rear sees its actual cold brick.
    const {x:jx,y:jy,z:jz}=OFFICE_JAMB;
    const j=(dx:number,dy:number):P=>[jx+dx,jy+dy,jz+.0018];
    tri(j(-.056,-.53),j(.079,-.33),j(.074,.16),['#584837','#a47249','#b78755']);
    tri(j(-.056,-.53),j(.074,.16),j(-.078,.05),['#584837','#b78755','#796044']);
    tri(j(-.078,.05),j(.074,.16),j(.055,.40),['#796044','#b78755','#6b5241']);
    // The far plaster is scorched ABOVE each fire, golden at desk height,
    // and falls back to soot at its broken top. Follow the physical wall:
    // do not put a square of light behind a region with open sky.
    const crown=ANNEX_CROWNS[records?'records':'dispatch'],z=-1.286;
    const paintAt=(x:number,h:number):[P,P,P,string,string]=>{
      const reach=Math.max(0,1-Math.abs(x-(records?1.56:.80))/2);
      return [[x,3.27,z],[x,3.27+(h-3.27)*.38,z],[x,Math.max(3.29,h-.11-.05*Math.sin(x*12)),z],
        records?(reach>.68?'#a58156':reach>.36?'#79644e':'#464d4d'):
          (reach>.68?'#ed9452':reach>.36?'#bc633a':'#714736'),
        records?(reach>.75?'#8d7454':reach>.42?'#6c6053':'#465052'):
          (reach>.75?'#bb724b':reach>.42?'#90573e':'#62493f')];
    };
    for(let i=1;i<crown.length;i++){
      const [a,b,c,lo,mid]=paintAt(...crown[i-1]),[d,e,f,ro,rim]=paintAt(...crown[i]);
      tri(a,d,e,[lo,ro,rim]);tri(a,e,b,[lo,rim,mid]);
      tri(b,e,f,[mid,rim,'#574339']);tri(b,f,c,[mid,'#574339','#574339']);
      // A thin chip and an irregular band of rafter shadow interrupt the
      // smooth gradient without masking its jagged sky silhouette.
      if(c[1]>4.24&&f[1]>4.24){
        const depth=z+.005,low=(p:P):P=>[p[0],3.80+.17*p[0],depth];
        const l=low(b),r=low(e);
        tri(l,r,[r[0],r[1]+.080,depth],['#7b4f35','#866042','#896045']);
        tri(l,[r[0],r[1]+.080,depth],[l[0],l[1]+.064,depth],['#7b4f35','#896045','#7b523b']);
        if(i%3===1)tri([c[0],c[1]-.08,depth],[f[0],f[1]-.10,depth],[c[0]+.03,c[1]-.34,depth],
          ['#8f7460','#705440','#84634d']);
      }
    }
    // Records has two remaining framed files; Dispatch a faded, pinned
    // chart. All physically behind the table, lamp and broken foreground.
    const picture=records?1.51:.35,py=records?4.45:4.24;
    rect(picture,py,-1.25,.44,.52,'#604736');
    rect(picture+.035,py+.04,-1.245,.37,.44,records?'#b28253':'#ba8c62','#cc9963');
    for(let i=0;i<4;i++)rect(picture+.09,py+.13+i*.058,-1.24,.12+(i%3)*.048,.023,'#8a674b');
    // A desk lamp, not an emissive square painted over an entire room.
    // Place it forward of the rear wall but behind the broken front rail.
    const lamp=records?1.73:1.77,lz=records?-.12:-1.44,base=records?3.958:3.707;
    rect(lamp-.034,base,lz,.068,.28,'#795639','#e4a35c');
    rect(lamp-.13,base+.002,lz,.26,.036,'#bc7950');
    const shade:P[]=[[lamp-.20,base+.262,lz],[lamp+.20,base+.262,lz],[lamp+.098,base+.482,lz],[lamp-.096,base+.482,lz]];
    tri(shade[0],shade[1],shade[2],['#ffc680','#ffcb87','#c4824c']);
    tri(shade[0],shade[2],shade[3],['#ffd798','#c4824c','#d09251']);
    rect(lamp-.186,base+.253,lz+.003,.372,.028,'#ffe2a3','#ffcc79');
    if(records)tri([.74,3.314,1.33],[2.49,3.314,1.32],[1.55,3.315,-1.27],['#665142','#806043','#a47146']);
    else tri([1.42,3.314,-.73],[2.49,3.314,-.69],[1.84,3.315,-1.58],['#665142','#806043','#a47146']);
    // Warm, broken spill facing the exposed wall, ending within the ruin.
    const wing=records?'records':'dispatch',[fireX,fireY,fireZ]=LOWER_BURN[wing];
    for(let j=0;!records&&j<12;j++){
      const a=j*Math.PI/6,b=(j+1)*Math.PI/6,dx=.79,dz=.58;
      tri([fireX,.384,fireZ],[fireX+dx*Math.cos(a),.386,fireZ+dz*Math.sin(a)],
        [fireX+dx*Math.cos(b),.386,fireZ+dz*Math.sin(b)],['#ad653a','#524537','#594838']);
    }
    if(!records){
      pockets.push({id:'dispatch-lower',position:[ox+side*fireX,fireY,oz+fireZ],size:ANNEX_FIRE_SCALE[wing][0]});
      const [x,y,z]=UPPER_BURN[wing];
      pockets.push({id:'dispatch-upper',position:[ox+side*x,y,oz+z],size:ANNEX_FIRE_SCALE[wing][1]});
    }
    // Fragments on the court nearest each hot room, left and right of the
    // intact central entry. Broken facets rather than continuous orange paths.
    for(let j=0;j<8;j++){
      const x=1.48+.32*Math.sin(j*2.34),z=2.71+j*.233+.06*Math.cos(j*1.92),w=.52+.20*Math.sin(j*2.13),y=.061;
      tri([x-w,y,z],[x+w,y,z+.028],[x+.11,y,z+.085],['#645950',j%3?'#a98155':'#b38551','#716455']);
    }
  }
  const interiorGeometry=new T.BufferGeometry();
  interiorGeometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  interiorGeometry.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
  const interiorMaterial=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,toneMapped:false});
  return {pockets,interiorGeometry,interiorMaterial};
}
