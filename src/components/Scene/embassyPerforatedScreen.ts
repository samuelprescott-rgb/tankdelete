import * as THREE from 'three';

/** Mid-century cast-cement screen. Each block has four swept fins around a
 * little open diamond, and four larger petal openings between the fins.
 * The back edges are real and recessed; neither alpha masks nor black holes
 * painted onto a solid wall. Gallery, frame and structure share a draw. */
export function createPerforatedGallery(floor:number,bite:number,left=-4.11,limit=4.16-bite,z=2.84){
  const xyz:number[]=[],rgb:number[]=[],uv:number[]=[],ix:number[]=[],ink=new THREE.Color();
  const pitch=.49,rise=.54,cols=Math.round((limit-left)/pitch);
  const cw=(limit-left)/cols,sill=.425+floor*1.14;
  type P=[number,number];
  for(let row=0;row<2;row++)for(let i=0;i<cols;i++){
    const x=left+(i+.5)*cw,y=sill+(row+.5)*rise;
    // Broad, unperforated top-center clerestory: one lamp-lit office behind
    // glass. The decorative screen continues across both flanking galleries.
    if(floor===4 && row===1 && z>2.7 && x>-1.80 && x<1.78)continue;
    const variation=(i*7+floor*5+row*13)%5;
    const lit=['#c2b096','#b1a995','#c6b49d','#aca996','#baa78d'][variation];
    const quad=(v:[number,number,number][],c:string)=>{
      const base=xyz.length/3;ink.set(c);
      for(const [a,b,d] of v){xyz.push(x+a*cw,y+b*rise,z+d);rgb.push(ink.r,ink.g,ink.b);uv.push(x/8+.5,y/8);}
      ix.push(base,base+1,base+2,base,base+2,base+3);
    };
    // Rotate a single quarter turn around the open hub. The square rim and
    // angled stem are a single casting (not four disconnected diamonds).
    for(let q=0;q<4;q++){
      const turn=([a,b]:P):P=>q===0?[a,b]:q===1?[-b,a]:q===2?[-a,-b]:[b,-a];
      const at=(p:P,d=0):[number,number,number]=>[...turn(p),d];
      const face=(a:P,b:P,c:P,d:P)=>quad([at(a),at(b),at(c),at(d)],lit);
      const lip=(a:P,b:P)=>quad([at(b),at(a),at(a,-.083),at(b,-.083)],
        ['#9b8065','#725f51','#686665','#ac9478'][q]);
      // Build the shared rails only once. Interior webs hide the opposite
      // side faces; only the oblique street-side returns need a dark reveal.
      const perimeter=q===0 || q===1 || (q===2&&(row===1||
        (floor===4&&z>2.7&&x>-1.80&&x<1.78))) || (q===3&&(i===0||
        (floor===4&&row===1&&z>2.7&&x>=1.78&&x-cw<1.78)));
      if(perimeter){
        face([-.5,-.521],[.5,-.521],[.5,-.463],[-.5,-.463]);
        if(q===0&&z>2.7)lip([-.5,-.463],[.5,-.463]);
      }
      face([-.465,-.465],[-.368,-.465],[-.047,-.127],[-.108,-.069]);
      if(q===0 || (q===2&&z>2.7))lip([-.465,-.465],[-.108,-.069]);
      face([-.134,0],[0,-.134],[0,-.071],[-.071,0]);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(ix);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
