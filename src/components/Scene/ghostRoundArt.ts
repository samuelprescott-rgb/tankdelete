import * as THREE from 'three';
// Each row is a small facet of the designed sprite swept into depth; from
// above, behind, or the side it still has a blunt bright nose and a torn tail.
type Stamp=[x:number,y:number,z:number,width:number,height:number,depth:number,tint:string];
const inkedCore:Stamp[]=[
  [0,.38,0,1.64,.24,1.64,'#ffdb74'],[0,.19,0,1.40,.14,1.40,'#ffb14a'],
  [0,.05,0,1.02,.14,1.02,'#ff943d'],[.18,-.075,-.1,.76,.11,.76,'#ef7233'],
  [-.28,-.21,.18,.48,.09,.48,'#d85231'],[.36,-.40,.22,.32,.065,.32,'#af4531'],
];
const tail:Stamp[]=[
  [-.36,.18,.14,.53,.16,.45,'#f27b36'],[.34,-.08,-.16,.44,.11,.38,'#da4d2e'],
  [-.32,-.30,.29,.33,.08,.29,'#cc4b32'],[.14,-.47,-.28,.24,.06,.23,'#a13931'],
];
const nose:Stamp[]=[
  [0,0,-.60,1.65,1.38,.74,'#ffaa3b'],[0,.02,-.24,1.28,1.13,.50,'#ffe283'],
  [-.13,.17,-.06,.58,.49,.12,'#fff5b1'],[.63,-.15,-.51,.41,.48,.51,'#f18b39'],
];
const flash:Stamp[]=[
  [0,-.36,0,.68,.28,.66,'#ffdf7b'],[-.09,-.15,.03,.74,.19,.53,'#ffba4f'],
  [-.1,.015,.04,.49,.17,.38,'#fda146'],[-.17,.17,.015,.24,.15,.18,'#ec7437'],
  [-.21,.34,0,.14,.09,.12,'#d85535'],[-.36,-.075,.17,.27,.14,.23,'#e68040'],
  [-.47,.09,.20,.15,.12,.14,'#e5813d'],[.32,-.19,-.12,.26,.17,.20,'#ffa347'],
  [.43,-.04,-.15,.14,.09,.14,'#ef803a'],[.14,-.35,.26,.25,.11,.15,'#fff0ad'],
];
const chips:Stamp[]=[
  [0,-.15,0,.62,1.05,.51,'#ffd385'],[-.10,.52,.02,.34,.36,.28,'#ffedb3'],
  [.13,-.85,-.04,.29,.25,.22,'#aa6139'],
];
export function makeGhostRoundGeo(kind:'core'|'tail'|'nose'|'flash'|'chip') {
  const positions:number[]=[], colors:number[]=[];
  for(const [x,y,z,w,h,d,tint] of kind==='core'?inkedCore:kind==='tail'?tail:kind==='flash'?flash:kind==='chip'?chips:nose){
    const block=new THREE.BoxGeometry(w,h,d).translate(x,y,z);
    const pos=block.attributes.position, index=block.index!;
    const color=new THREE.Color(tint);
    for(let i=0;i<index.count;i++){
      const j=index.getX(i);positions.push(pos.getX(j),pos.getY(j),pos.getZ(j));
      colors.push(color.r,color.g,color.b);
    }
    block.dispose();
  }
  const out=new THREE.BufferGeometry();
  out.name='ghost-signal-round-'+kind;
  out.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  out.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));out.computeBoundingSphere();return out;
}

// PixelFX muzzle-smg's central spike and shorter oblique lobes, sampled as
// solid voxels along local +Y so the flash keeps its depth from a chase camera.
export function makeSmgFlash(width: number, length: number) {
  const rays = [
    [0,1,0,9,2.6], [.02,1,-.06,19,1.4], [.7,.76,.28,9,1.5],
    [-.72,.64,-.28,8,1.6], [.12,.36,-.94,6,1.3], [-.12,.18,.98,5,1.4],
  ];
  const positions: number[] = [], colors: number[] = [];
  const tile = new THREE.BoxGeometry(1,1,1), pos = tile.attributes.position, index = tile.index!;
  const palette = ['#f2561d','#ffab32','#ffe26b','#fff5c7'].map(hex => new THREE.Color(hex));
  // Cache occupancy first so adjacent cells only submit their outside faces.
  const cells = new Uint8Array(24*17*15);
  const at = (x:number,y:number,z:number) => ((y+2)*17+x+8)*15+z+7;
  for (let y = -1; y <= 20; y++) for (let x = -7; x <= 7; x++) for (let z = -6; z <= 6; z++) {
    let depth = -1;
    for (const [dx,dy,dz,reach,radius] of rays) {
      const u = x*dx + y*dy + z*dz;
      if (u < -1 || u > reach) continue;
      const r = .64 + radius * (1 - Math.max(0,u) / reach) ** .8;
      depth = Math.max(depth, 1 - Math.hypot(x-u*dx,y-u*dy,z-u*dz) / r);
    }
    if (depth < 0) continue;
    cells[at(x,y,z)] = depth > .63 || (y < 5 && depth > .28) ? 4 : depth > .30 ? 3 : y < 12 ? 2 : 1;
  }
  const neighbor = [15,-15,17*15,-17*15,1,-1]; // BoxGeometry face order
  for (let y=-1; y<=20; y++) for (let x=-7; x<=7; x++) for (let z=-6; z<=6; z++) {
    const cell=at(x,y,z);
    if (!cells[cell]) continue;
    const ink=palette[cells[cell]-1];
    for (let face=0; face<6; face++) {
      if (cells[cell+neighbor[face]]) continue;
      for (let k=0; k<6; k++) {
        const j=index.getX(face*6+k);
        positions.push((x+pos.getX(j))*width/11,(y+pos.getY(j))*length/20,(z+pos.getZ(j))*width/11);
        colors.push(ink.r,ink.g,ink.b);
      }
    }
  }
  tile.dispose();
  const geo=new THREE.BufferGeometry();
  geo.name='pixelfx-smg-burst';
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.computeBoundingSphere();
  return geo;
}
