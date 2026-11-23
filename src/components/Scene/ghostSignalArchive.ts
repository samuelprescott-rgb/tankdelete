import * as THREE from 'three';
import type { EMBASSY_ARCHIVE_SLOTS } from '../../lib/embassyDefense';
import { FACADE_LAMPS } from './embassyFacadeLamps';

type ArchiveId = typeof EMBASSY_ARCHIVE_SLOTS[number]['id'];

/** Amber on solid surfaces only. All marks for one archive (including the
 * reflected glyphs directly on its approach) live in a single static mesh.
 * Taking an archive offline therefore switches off its reflections too. */
export function createGhostSignalArchive(id: ArchiveId) {
  const xyz:number[]=[], rgb:number[]=[], indices:number[]=[];
  const color=new THREE.Color(), v=new THREE.Vector3();
  const main=id==='chancery', depth=main?2.5:2.1;
  const world=new THREE.Matrix4(), floor=new THREE.Matrix4().makeRotationX(-Math.PI/2);
  const amber=main?'#f8bd64':'#d8a969', lit='#f4d79a', shadow='#273340';
  let basis=world, exposure=1;
  // Quads use proper front winding. The apron's +Y and sign's +Z keep the
  // signal subject to depth, occlusion and camera angle; no billboard text.
  function rect(x:number,y:number,z:number,w:number,h:number,ink:string,endInk=ink) {
    const start=xyz.length/3;
    for(const [a,b] of [[0,0],[1,0],[1,1],[0,1]]) {
      color.set(a?endInk:ink).multiplyScalar(exposure);
      v.set(x+a*w,y+b*h,z).applyMatrix4(basis);
      xyz.push(v.x,v.y,v.z);rgb.push(color.r,color.g,color.b);
    }
    indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  // Three lengths of glass separated by the black straps of the rain hood.
  const lamp=FACADE_LAMPS[id], section=lamp.width/3;
  for(let i=0;i<3;i++){
    const start=lamp.x-lamp.width*.5+i*section;
    rect(start,lamp.y-.085,lamp.z+.009,section-.038,.11,lamp.glass);
    rect(start,lamp.y-.008,lamp.z+.010,section-.038,.032,'#fff1cc');
  }

  // The inner door is physically recessed behind the porch. Its pane,
  // mullions and light under the threshold give raiders a warm background;
  // the roof and columns are allowed to occlude it.
  basis=world;
  const z=main?depth-1.408:depth+.356;
  if(main){
    // Geometry-bound radiance, not a billboard or a point light. A cut-back
    // lobby has two sidewalls, back glass, jambs and a lit vestibule floor.
    // They occlude each other as the tank passes: no light leaks onto actors.
    rect(-1.716,.37,z,3.432,1.96,'#73513c','#876245');
    rect(-1.61,.56,z+.006,.72,1.52,'#a67a50','#b48756');
    rect(.89,.56,z+.006,.72,1.52,'#ab7c4d','#74533d');
    rect(-1.65,2.06,z+.009,3.30,.16,'#bb8954','#d7a869');
    rect(-1.53,2.16,z+.012,1.38,.045,'#f2c27a');
    for(const side of [-1,1]){
      basis=new THREE.Matrix4().makeRotationY(-side*Math.PI*.5).setPosition(side*1.714,0,0);
      const start=side<0?-(depth+.018):z;
      rect(start,.41,.002,depth+.018-z,1.94,side<0?'#574b42':'#ac8051',side<0?'#b08a5e':'#514940');
      rect(start,2.16,.006,depth+.018-z,.08,side<0?'#786449':'#d2a36b',side<0?'#c69c65':'#786449');
      // Only the inner cheeks of the two freestanding columns catch light.
      basis=new THREE.Matrix4().makeRotationY(-side*Math.PI*.5).setPosition(side*1.922,0,0);
      rect(side<0?-depth-.958:depth+.682,.56,.002,.276,1.83,side<0?'#61503f':'#95744d',side<0?'#9d7a4e':'#685642');
    }
    basis=floor;
    rect(-1.68,-depth-1.286,.553,3.36,1.76,'#846644','#71624d');
    rect(-1.26,-depth-.48,.556,2.31,.76,'#b38c58','#a58050');
    rect(-1.62,-depth-1.28,.557,2.37,.055,'#bca074','#93816a');
    basis=world;
    rect(-1.69,2.395,depth+1.343,3.38,.064,'#8b7558','#a28761');
    rect(-1.58,2.396,depth+1.345,2.58,.031,'#b09163','#d5b17a');
    for(const s of [-1,1]){
      const x=s*2.04-.115;
      rect(x,.56,depth+.965,.23,1.87,s<0?'#4d4b42':'#806c52',s<0?'#948260':'#514b40');
      rect(s<0?x+.176:x+.005,.56,depth+.968,.047,1.86,s<0?'#c3a678':'#b49366');
    }
  }
  if(id==='dispatch'){
    // A sliver of lit corridor behind an ajar steel door. Every fitting
    // below uses the leaf's hinge basis, including the wired-glass inset.
    rect(-.67,.55,1.508,1.34,1.68,'#292e32','#62442e');
    rect(.33,.56,1.512,.19,1.64,'#946841','#cd9557');
    rect(.49,.56,1.516,.035,1.64,'#473c31');
    basis=floor;
    rect(-.72,-2.45,.547,1.44,.44,'#666b64','#444c49');
    // Clear the broken mezzanine behind the door all the way to the latch.
    basis=new THREE.Matrix4().makeRotationY(.31).setPosition(-.68,.55,2.34);
    rect(0,0,.010,1.32,1.68,'#38484d','#293438');
    rect(.085,.33,.016,.91,.38,'#2d383b','#414b4a');
    rect(.10,.35,.018,.88,.34,'#394548','#303b3f');
    for(const y of [.20,1.33])rect(-.012,y,.027,.045,.17,'#64675e');
    rect(1.282,.015,.018,.033,1.64,'#67706a','#897653');
    rect(.09,.08,.018,1.14,.23,'#596363','#404c50');
    rect(.13,.86,.019,.56,.65,'#263337');
    rect(.17,.90,.025,.48,.57,'#5a5949','#b28a58');
    rect(.17,1.18,.030,.48,.035,'#3a4140');
    rect(.39,.90,.031,.032,.57,'#3a4140');
    rect(1.08,.65,.021,.085,.23,'#343d3a');
    rect(.97,.78,.038,.17,.045,'#bfbdab');
    basis=world;
  }else{
    rect(-.75,.38,z+.015,1.50,1.44,shadow);
    rect(-.65,.42,z+.018,1.30,1.31,'#875c40');
    for(const x of [-.60,.035]) {
      if(main){
        rect(x,.47,z+.021,.565,.91,'#ad7950');
        rect(x,.83,z+.023,.565,.55,'#edb868');
        rect(x+.022,1.32,z+.025,.52,.055,amber);
      }else{
        // Not two enormous luminous rectangles stuck on the street facade.
        // Dark wet door leaves with glazing above the kick-panel. Only a
        // portion of the opened blind catches the practical behind the door.
        rect(x,.47,z+.021,.565,.91,'#3a433e','#49514a');
        rect(x+.047,.84,z+.023,.463,.48,'#5e6051','#a38c68');
        for(let row=0;row<3;row++)rect(x+.046,.92+row*.107,z+.025,.466,.041,'#4b524c');
        rect(x+.06,.53,z+.026,.441,.046,'#414a42','#6b6956');
        rect(x+.067,1.321,z+.026,.424,.032,'#918165','#a49777');
      }
    }
    for(let i=0;i<4;i++) rect(-.62+i*.321,1.51,z+.027,.279,.143,main?(i===1?lit:amber):i===2?'#b69c75':'#878471');
    rect(-.66,.39,z+.028,1.32,.047,lit);
  }
  if(main){
    // Actual rooms behind the retained deep fins, not lit rectangles
    // pasted over the columns. Broken Venetian slats, curtain edges and
    // the archive shelves interrupt the strongest light. The floor above
    // stays entirely dark. A different frame reads through each opening.
    const face=2.556;
    function room(x:number,y:number,w:number,h:number,warm:boolean){
      exposure=1;
      rect(x,y,face,w,h,warm?'#834823':'#374d5a',warm?'#da8841':'#567686');
      rect(x+.03,y+h*.35,face+.003,w-.06,h*.61,warm?'#b8662d':'#576d74',warm?'#fcb869':'#91b6ba');
      exposure=warm?2.28:1.34;
      rect(x+w*.36,y+h*.86,face+.008,w*.53,.032,warm?'#ffe0a3':'#d5e5d7');
      exposure=1;
      for(let i=0;i<5;i++){
        const start=x+w*(i<2?.01:.48);
        rect(start,y+h*(.66+.060*i),face+.014,w*(i<2?.54:.44),.025,
          warm?'#805432':'#3c545a');
      }
      // Rack with staggered document boxes, seen as a dark lower silhouette.
      rect(x+.04,y+.06,face+.018,w*.60,.045,'#343a39');
      for(let i=0;i<5;i++){
        const hBox=.10+.035*((3*i+1)%4);
        rect(x+w*(.04+i*.115),y+.092,face+.020,w*.101,hBox,
          warm?['#544336','#6d513a','#4a3d34'][i%3]:'#657676');
      }
      rect(x+w*.70,y,face+.024,w*.08,h*(warm?.66:.48),warm?'#86532e':'#34474e');
      rect(x+w*.035,y+.02,face+.018,.036,h-.04,warm?'#cc9b65':'#b1bb9a');
    }
    // The brighter glass is in the continuous clerestory behind the lattice.
    // Deep window heads, uneven blinds, file boxes and separate bars break
    // the light into rooms, instead of a solid illuminated floor stripe.
    room(-1.79,5.532,3.55,.49,true);
    room(-3.84,3.93,1.33,.72,false);
    for(let i=0;i<4;i++)rect(-1.79+i*.89,5.528,face+.036,.067,.55,'#504a44');
    // Low tungsten interior light catches selected open castings above the
    // lobby and under both shaded wing roofs. The dark gaps between rooms
    // and the real fins in front of them stay completely opaque.
    for(const [x,y,w,h,d,base,glow] of [
      [-3.20,4.23,1.17,.96,2.27,'#263842','#778c8a'],
      [-1.99,3.51,1.42,1.78,2.26,'#49301f','#e0a05b'],
      [-.52,3.52,1.25,1.88,2.23,'#bd7842','#402f2d'],
      [.78,3.49,1.28,1.83,2.25,'#28373e','#435258'],
      [2.14,4.84,.87,1.07,2.22,'#36454b','#232e35'],
      [-6.50,3.35,1.31,2.55,1.28,'#58412e','#e1a258'],
      [-5.10,3.39,.49,2.49,1.29,'#bc8050','#69482c'],
      [4.34,3.03,1.33,2.80,1.27,'#42525d','#628181'],
      [5.77,3.47,.63,2.38,1.24,'#38454c','#242d34']
    ] as const)rect(x,y,d,w,h,base,glow);
    // A single adjacent stairwell dimmer than the busy work room.
    rect(2.32,1.63,face,.97,.64,'#5c4032','#946037');
    rect(2.38,2.12,face+.012,.82,.05,'#c99459','#d3a06c');
    // Grazing the soffit and the deep concrete returns, not a glowing border
    // around the building. Rows remain interrupted by the broken east bay.
    for(const [a,b] of [[-.21,.58],[.82,1.66],[1.83,2.43]]){
      rect(a,3.635,2.516,b-a,.042,'#9a6b48','#685244');
    }
    // Give the big lobby a human-scale depth cue through the door's glass.
    for(const [x,y,w,h] of [[-.59,.56,.37,.067],[-.57,.63,.09,.15],[-.42,.63,.14,.10],
      [.21,.66,.34,.048],[.23,.71,.11,.108],[.38,.71,.12,.14],[-.058,.47,.042,.88]]){
      rect(x,y,z+.031,w,h,'#67503c');
    }
  }else if(id==='records'){
    const a=.90,glass=depth+.052;
    rect(a,1.64,glass,1.54,.74,'#89533e','#bd8062');
    rect(a+.032,1.76,glass+.006,1.46,.53,'#cd8157','#f3b57a');
    for(let i=0;i<5;i++)rect(a+.35+i*.19,1.72+Math.max(0,i-2)*.08,glass+.015,
      .107,.39-Math.max(0,i-2)*.10,'#725245');
    for(let i=0;i<3;i++)rect(a+.04,2.02+i*.091,glass+.024,.68,.033,'#976747');
    rect(a+.02,1.61,depth+.39,1.53,.041,'#bb9573');
  }else{
    // The surviving lamp grazes a recess on the BACK of the broken room.
    // Leave the front window genuinely open; no sheet of luminous "glass".
    rect(-2.47,1.80,-1.781,.13,.89,'#40535b','#5c6971');
    rect(-2.39,2.766,-1.780,.60,.05,'#779291','#b0b8ad');
    rect(-1.26,1.90,-1.782,.067,.66,'#475358','#6e7b78');
  }

  // An old monsoon apron never becomes a grid of flashing characters.
  // Dark stepped reflection islands align with the door, and only their
  // most saturated parts resolve into the ':', '=' and '~' forms.
  basis=floor;
  const puddle=(x:number,relativeZ:number,w:number,d:number,ink:string,y=.042)=>{
    const first=xyz.length;
    // Forward annexes only have a short wet approach before the curb.
    const run=main?1:.54;
    rect(x-w/2,-depth-run*(relativeZ+d),y,w,run*d,ink);
    if(w>.10){
      // These tiny signal fragments still suggest '=' and '~'. Nip opposite
      // corners so their ends read as tapering water, not square timber.
      const nick=.16+.13*Math.sin(relativeZ*4.1+x*2.6)**2;
      xyz[first]+=.88*w*nick;xyz[first+8]+=.33*d;
      xyz[first+6]-=w*nick;xyz[first+2]-=.34*d;
    }
  };
  const wave=(x:number,rel:number,px:number,ink:string)=>{
    puddle(x-px,rel,px*2,px,ink,.052);
    puddle(x+px,rel+px,px*2,px,ink,.052);
    puddle(x+px*2.5,rel,px,px,ink,.052);
  };
  const puddles=[
    [-.08,1.44,1.34,.36], [.31,2.26,1.65,.44],
    [-.37,3.40,1.91,.36], [.51,4.57,1.24,.51],
    [-.12,5.95,1.68,.39]
  ];
  for(let i=0;i<(main?5:3);i++){
    const [x,rel,w,d]=puddles[i], offset=id==='records'?.13:id==='dispatch'?-.11:0;
    // Place only tiny signal shards over the wet ground. An opaque blue
    // backing rectangle would cut the physical lobby reflection in two.
    if(!main){
      puddle(x-w*.20,rel-.09,w*.24,.065,'#59616a');
      puddle(x+w*.12,rel+d+.004,w*.21,.05,'#475261');
    }
    puddle(x-w*.19,rel+d*.39,w*.19,.065,i<2?'#bc8e5c':'#9f7955',.05);
    if(i%2===0){
      puddle(x+.13+offset,rel+d*.18,.31,.070,amber,.052);
      puddle(x+.13+offset,rel+d*.18+.15,.31,.070,amber,.052);
      for(const dz of [0,.113])puddle(x+.39+offset,rel+d*.18+dz,.057,.055,'#d6a571',.052);
    }else wave(x+.15+offset,rel+.095,.073,'#bd9062');
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  g.setIndex(indices);g.computeBoundingBox();g.computeBoundingSphere();
  g.name='ghost-signal-'+id;
  return g;
}
