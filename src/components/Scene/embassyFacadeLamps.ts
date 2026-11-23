import type { EMBASSY_ARCHIVE_SLOTS } from '../../lib/embassyDefense';

type ArchiveId = typeof EMBASSY_ARCHIVE_SLOTS[number]['id'];

// Local coordinates at the diffuser. The steelwork, luminous glass and
// masonry wash share the same socket when an archive changes state.
export const FACADE_LAMPS = {
  chancery: {x:-4.08, y:5.80, z:2.99, width:.92, glass:'#ffdb8c'},
  records:  {x:-1.97, y:5.62, z:1.97, width:1.19, glass:'#ffcb79'},
  dispatch: {x:-2.30, y:2.78, z:2.42, width:.87, glass:'#bdddd9'},
} satisfies Record<ArchiveId,{x:number;y:number;z:number;width:number;glass:string}>;

type Box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string,angle?:number,faces?:readonly number[])=>void;

export function addFacadeHardware(id:ArchiveId, box:Box) {
  const {x,y,z,width}=FACADE_LAMPS[id];
  // BoxGeometry faces are +X, -X, +Y, -Y, +Z, -Z. The sheet metal
  // is folded onto the wall. Omit buried backs and sub-pixel return faces.
  const front=[4], folded=[0,1,2,4], channel=[1,4];

  // Folded rain hood and junction box bolted to the surviving outer pier.
  const conduitX=x-width*.41;
  box(x,y+.15,z-.22,width+.23,.12,.59,'#596264',0,folded);
  box(x,y+.02,z-.13,width+.09,.22,.26,'#353d40',0,[3,4]);
  for(const end of [-1,1])box(x+end*width*.52,y-.02,z,.10,.17,.085,'#586265',0,channel);
  box(conduitX,y-.82,z-.31,.073,1.50,.083,'#786f60',0,channel);
  box(conduitX,y-1.70,z-.34,.37,.46,.22,'#424b50',0,folded);
  box(conduitX,y-1.53,z-.23,.36,.048,.07,'#879396',0,front);
  for(const yy of [y-.36,y-1.22])box(conduitX,yy,z-.29,.15,.052,.12,'#a69c88',0,front);
  if(id==='chancery'){
    // An enclosed fire stair is seen edge-on through the west gallery.
    // One continuous stringer and handrail join the two landings.
    box(-5.44,4.10,1.44,2.77,.13,.08,'#252d33',.64);
    box(-5.44,4.83,1.44,2.77,.069,.06,'#343b3e',.64);
    for(let i=0;i<7;i++){
      const sx=-6.42+i*.327,sy=3.36+i*.244;
      box(sx,sy,1.42,.35,.095,.25,'#384049');
      if(i%2===0)box(sx,sy+.39,1.44,.056,.78,.062,'#42464a');
    }
  }
}
