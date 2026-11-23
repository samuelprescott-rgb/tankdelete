import * as THREE from 'three';

// This sheet is drawn on a 128 x 64 integer lattice; its coordinates belong to
// a particular vehicle panel. Nothing reads the framebuffer, camera or time.
export type VehicleInk = 'huey' | 'cheek' | 'deck' | 'fender' | 'glazing' | 'shark' | 'sideJaw' | 'skirtSteel';
const W=128,H=64;
const colors = {
  ink:'#202f32', deep:'#344a48', olive:'#60715a', field:'#82905f',
  light:'#a7a771', sun:'#c6b783', clay:'#986b4a', pale:'#d9cda0',
  glass:'#294952', water:'#436873', sky:'#749997', flash:'#acb6a0',
  ember:'#b95d46', soot:'#453d36', red:'#b83932', throat:'#623034', enamel:'#e7deb6', ivory:'#cbbb8b', gold:'#dfab57',
  black:'#1c2425', plate:'#80774e', lowPlate:'#57563e', crown:'#aa9a62', edge:'#d6bb83',
  rust:'#ad6340', oxide:'#754b39', jaw:'#bb3935', jawDark:'#842a32', tooth:'#fff0cb', eyeRed:'#ec4938',
};
type C=keyof typeof colors;
type Pt=[number,number];
export function createVehicleInk(kind:VehicleInk){
  const width=kind==='skirtSteel'?4*W:kind==='sideJaw'?2*W:W;
  const height=kind==='cheek'?2*H:H;
  let yOffset=0;
  const px=new Uint8Array(width*height*4);
  const rgb=Object.fromEntries(Object.entries(colors).map(([k,s])=>[k,[1,3,5].map(i=>parseInt(s.slice(i,i+2),16))])) as Record<C,number[]>;
  const dot=(x:number,y:number,c:C,a=255)=>{if(x<0||y<0||x>=width||y>=H)return;const i=((y+yOffset)*width+x)*4;px.set(rgb[c],i);px[i+3]=a;};
  const rect=(x:number,y:number,w:number,h:number,c:C,a=255)=>{for(let v=y;v<y+h;v++)for(let u=x;u<x+w;u++)dot(u,v,c,a);};
  const polygon=(c:C,p:Pt[],a=255)=>{
    const minY=Math.max(0,Math.min(...p.map(q=>q[1]))), maxY=Math.min(H-1,Math.max(...p.map(q=>q[1])));
    for(let y=minY;y<=maxY;y++){const cuts:number[]=[];for(let i=0;i<p.length;i++){
      const [x0,y0]=p[i], [x1,y1]=p[(i+1)%p.length],v=y+.5;
      if((y0<=v&&v<y1)||(y1<=v&&v<y0))cuts.push(x0+(x1-x0)*(v-y0)/(y1-y0));
    }cuts.sort((a,b)=>a-b);for(let i=0;i<cuts.length;i+=2){
      const left=Math.ceil(cuts[i]-.5), right=Math.ceil(cuts[i+1]-.5);rect(left,y,right-left,1,c,a);
    }}
  };
  // Disconnected steps; don't turn all flat steel into pixel confetti.
  const flake=(x:number,y:number,w:number,h:number,c:C)=>{
    rect(x,y,w,h,c);rect(x+2,y+h,w-2,2,c);rect(x-2,y+1,2,Math.max(1,h-2),c);
  };
  if(kind==='sideJaw'){
    // One painted mouth on a rounded casting. The aft corner pinches to a
    // brush point, the gums arc up on the cheek, then dive UNDER the chin.
    // A few tapering teeth turn the corner, none form a transverse grille.
    rect(0,0,256,H,'plate');
    const upper=(u:number)=>22+23*Math.sin(Math.PI*u*.97)+8*u+3*u**3;
    const lower=(u:number)=>upper(u)-(3+31*Math.sin(Math.PI*u*.74));
    const lip=(x:number,top:number,bottom:number)=>{
      const hi=Math.round(top),lo=Math.round(bottom);
      rect(x,0,1,Math.max(1,lo-3),'lowPlate');
      if(hi<=lo)return;
      rect(x,lo,1,hi-lo+1,'black');
      if(hi-lo>2)rect(x,lo+1,1,hi-lo-1,'jaw');
      if(hi-lo>7)rect(x,lo+3,1,hi-lo-5,'jawDark');
    };
    for(let x=0;x<128;x++){
      const u=Math.max(0,(x-11)/116);
      if(x>=11)lip(x,upper(u),lower(u));
    }
    const cornerTop=Math.round(upper(1)),cornerBottom=Math.round(lower(1));
    const nose=(d:number)=>{
      const k=Math.min(1,d/64), edge=1-THREE.MathUtils.smoothstep(k,0,1);
      return [7+(cornerTop-7)*edge,3+(cornerBottom-3)*edge];
    };
    for(let x=0;x<128;x++){
      const [hi,lo]=nose(Math.min(x,127-x));lip(x+128,hi,lo);
    }
    // Separate silhouettes, shoulder tick, belly and swept needle; the long
    // canines occupy the open pocket rather than repeating like zigzag trim.
    for(const [x,w,h,lean] of [[17,6,5,2],[25,8,7,4],[35,9,11,5],[47,11,14,6],[59,11,12,5],[71,13,22,8],[87,12,19,7],[101,11,14,4],[113,10,17,6],[123,4,6,1]]){
      const y=Math.round(upper((x-11)/116))-2, tip=x+lean;
      polygon('ivory',[[x,y],[x+w,y+1],[x+w-1,y-3],[tip+1,y-h-1],[tip-1,y-h],[x+2,y-4]]);
      polygon('tooth',[[x+1,y],[x+w-1,y+1],[x+w-2,y-3],[tip+1,y-h+2],[x+2,y-4]]);
    }
    for(const [x,w,h,lean] of [[30,6,4,3],[42,8,7,3],[54,9,9,4],[65,9,13,4],[77,9,10,3],[90,10,16,5],[104,9,11,4],[117,7,8,3]]){
      const y=Math.round(lower((x-11)/116))+2;
      polygon('ivory',[[x,y],[x+w,y-1],[x+w-2,y+3],[x+lean,y+h],[x+lean-1,y+h],[x+1,y+3]]);
      polygon('tooth',[[x+1,y+1],[x+w-2,y],[x+lean,y+h-2],[x+2,y+3]]);
    }
    for(const [d,w,h] of [[4,7,9],[14,6,7],[23,5,4]])for(const dir of [-1,1]){
      const ori=dir===1?128:255, y=Math.round(nose(d)[0])-2;
      polygon('ivory',[[d,y],[d+w,y-1],[d+w-1,y-3],[d+3,y-h],[d+1,y-3]].map(([x,v])=>[ori+dir*x,v]));
    }
    for(const [x,y,w,h] of [[4,10,5,3],[9,14,4,3],[44,9,4,2],[56,8,3,2],[116,43,5,2]])flake(x,y,w,h,'oxide');
    // Small angry eye immediately above its OWN mouth — it no longer
    // rotates off the vehicle's face when the turret turns.
    polygon('black',[[63,63],[69,63],[79,61],[93,57],[110,54],[115,51],[110,49],[102,48],[92,48],[80,50],[73,53],[68,58]]);
    polygon('ivory',[[68,61],[80,59],[94,56],[105,53],[108,51],[100,49],[90,49],[79,51],[74,54]]);
    polygon('tooth',[[70,61],[80,59],[94,56],[102,53],[94,51],[85,52],[76,55]]);
    polygon('eyeRed',[[88,56],[98,54],[102,53],[102,51],[97,50],[91,51],[88,53]]);
    polygon('black',[[94,55],[101,53],[101,51],[97,51],[94,52]]);
    dot(95,54,'tooth');
  }else if(kind==='skirtSteel'){
    // Large flat olive masses with two oxide fields at the fold, rather
    // than equally spaced procedural spots or noise across a new panel.
    rect(0,0,W,H,'plate');
    polygon('lowPlate',[[0,0],[128,0],[128,19],[97,13],[77,17],[65,14],[34,20],[14,19],[0,26]]);
    polygon('crown',[[0,46],[20,46],[28,51],[45,51],[51,54],[81,54],[98,49],[117,47],[128,50],[128,64],[0,64]]);
    for(const [x,y,w,h] of [[2,4,14,10],[9,13,12,5],[17,7,13,8],[22,17,7,6],[31,13,6,4],[6,29,9,7],[13,34,4,3],[63,17,14,8],[71,23,10,8],[80,28,8,4],[91,15,9,6],[103,36,8,6],[110,40,5,4],[117,10,7,5]]) flake(x,y,w,h,'oxide');
    for(const [x,y,w,h] of [[4,4,9,6],[11,11,9,6],[19,10,8,6],[23,17,4,5],[6,29,6,5],[65,18,10,5],[74,23,7,5],[90,16,6,4],[107,38,4,4]]) flake(x,y,w,h,'rust');
    rect(0,59,37,2,'edge');rect(42,59,28,1,'edge');rect(81,58,11,2,'edge');rect(115,57,12,2,'edge');
    rect(0,2,128,2,'black');rect(13,5,23,1,'clay');rect(84,5,15,1,'clay');
    for(const x of [8,55,112]){rect(x,48,4,4,'lowPlate');rect(x,50,3,2,'edge');}
    // One warm, worn steel panel above the centre return run. A thumb of
    // olive bites through the oxide; the rest of the tank remains quiet.
    const patch=(c:C,p:Pt[])=>polygon(c,p.map(([x,y])=>[128+x,y]));
    rect(128,0,128,64,'plate');rect(128,0,128,7,'lowPlate');
    patch('clay',[[4,8],[8,19],[17,22],[17,31],[23,31],[26,40],[36,40],[41,48],[58,48],[62,43],[72,44],[80,50],[105,49],[113,45],[120,47],[119,25],[111,22],[105,14],[87,14],[78,18],[62,14],[45,10],[33,13],[20,8]]);
    patch('rust',[[8,9],[13,20],[21,23],[21,29],[29,31],[31,38],[41,39],[46,45],[57,45],[62,39],[70,40],[73,32],[82,31],[89,39],[104,41],[111,40],[113,27],[107,25],[100,18],[86,18],[75,22],[60,18],[44,13],[33,16],[20,11]]);
    patch('oxide',[[8,9],[13,11],[28,14],[38,11],[59,15],[72,16],[82,21],[99,17],[103,16],[98,12],[87,13],[77,15],[61,11],[47,9],[32,11],[20,7]]);
    patch('crown',[[1,52],[23,51],[30,53],[45,53],[52,56],[82,55],[92,52],[111,52],[127,55],[127,63],[1,63]]);
    rect(132,58,34,2,'edge');rect(178,58,11,1,'edge');rect(219,57,25,2,'edge');
    rect(135,48,5,4,'black');rect(135,50,4,2,'edge');rect(245,47,5,4,'black');rect(245,49,4,2,'edge');
    rect(146,3,28,1,'edge');rect(207,4,11,1,'clay');
    // Two independent rubbing charts for the narrow steel return above the
    // jaw. The old fender chart pasted enormous orange stamps on these folds.
    // Brush pressure is organized around the rolled edge and the lamp feet:
    // soft gray-green enamel, rubbed-through primer and only a few bare pits.
    const hash=(x:number,y:number)=>{const v=Math.sin(x*73.7+y*27.17)*1738.17;return v-Math.floor(v);};
    for(let hand=0;hand<2;hand++)for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const seed=hand*211,grain=hash(x+seed,y),grain2=hash((x+seed)>>1,y>>1);
      const footprint=(cx:number,cy:number,rx:number,ry:number,tilt:number)=>{
        const dx=(x-cx)/rx,dy=(y-cy-tilt*(x-cx))/ry;
        return Math.max(0,1-dx*dx-dy*dy)**1.65;
      };
      const rimY=7+3*Math.sin((x+seed)*.064)+2*Math.sin(x*.16+hand);
      const rub=footprint(hand?92:105,rimY,hand?27:21,6.3,-.12)
         +footprint(hand?61:49,rimY+3,16,5.1,.25);
      const lug=footprint(hand?93:101,hand?28:31,12,11,.52)
        +footprint(hand?75:84,hand?48:48,8,6,-.40);
      const ledge=footprint(hand?51:38,55,44,13,-.14)+footprint(hand?109:98,59,17,13,.32);
      const fine=.48*grain+.33*grain2+.19*hash(x>>2,(y+seed)>>1);
      const faded=(.5+.5*Math.sin(x*.058+.6*Math.sin(y*.09)+hand))*(.57+.43*Math.sin(y*.079));
      const dust=.18*ledge+(.085+.045*grain)*faded;
      const peel=THREE.MathUtils.smoothstep((rub*.85+lug*.62)*(.35+.98*fine),.23,.71);
      const high=THREE.MathUtils.smoothstep(rub*(.32+.90*fine),.69,.93);
      const p=4*(y*width+(2+hand)*W+x),delta=(grain-.50)*(1.6+11*peel+5*ledge);
      for(let c=0;c<3;c++){
        const olive=[126,119,80][c],dustHue=[172,153,110][c],primer=[99,91,70][c],metal=[158,154,132][c];
        const base=olive+(dustHue-olive)*dust;
        const old=base+(primer-base)*peel;
        px[p+c]=Math.round(old+(metal-old)*high+delta);
      }
      px[p+3]=255;
    }
  }else if(kind==='shark'){
    // Armor nose, straight-on. Left half is drawn by hand, then mirrored;
    // teeth are irregular stepped islands separated by dark crimson, not
    // a thin band of noisy highlights. An unshadowed pair of golden eyes.
    const bilateral=(c:C,half:Pt[])=>{polygon(c,half);polygon(c,half.map(([x,y])=>[128-x,y]));};
    bilateral('ink',[[6,49],[10,49],[22,44],[35,42],[51,42],[65,39],[65,5],[55,5],[42,8],[29,13],[20,19],[14,28],[10,38]]);
    bilateral('red',[[9,46],[23,41],[39,39],[54,40],[65,37],[65,8],[54,8],[39,12],[25,19],[17,28]]);
    bilateral('throat',[[15,40],[27,37],[46,36],[65,35],[65,14],[49,14],[36,19],[25,25]]);
    bilateral('ember',[[10,46],[25,41],[44,40],[64,38],[64,36],[44,38],[25,39],[15,42]]);
    for(const [x,y,w,d] of [[15,40,6,6],[23,38,7,9],[32,37,8,14],[42,37,6,9],[50,37,7,15],[58,36,5,10]]){
      bilateral('enamel',[[x,y],[x+w,y],[x+w-1,y-4],[x+w,y-d],[x+2,y-4]]);
      bilateral('ivory',[[x+2,y-4],[x+w,y-d],[x+w-1,y-6]]);
    }
    for(const [x,y,w,d] of [[23,23,6,5],[33,18,7,8],[45,14,8,7],[56,11,6,10]]){
      bilateral('ivory',[[x,y+d],[x+w,y],[x+2,y-1]]);bilateral('enamel',[[x,y+d],[x+w-2,y+1],[x+1,y+1]]);
    }
    bilateral('ink',[[13,60],[17,60],[29,58],[41,52],[49,48],[48,45],[40,44],[29,45],[21,49],[16,54]]);
    bilateral('gold',[[18,57],[26,56],[36,52],[44,48],[43,47],[34,47],[27,49],[22,52]]);
    bilateral('ink',[[29,54],[33,53],[35,50],[34,47],[30,48]]);
    bilateral('enamel',[[21,56],[27,55],[31,53],[26,53]]);
  }else if(kind==='huey'){
    // Nose to tail on the horizontal axis. A low blue sill, a broad sunlit
    // shoulder and an interrupted service stripe give the cabin three large masses.
    polygon('deep',[[0,5],[10,9],[25,8],[36,12],[58,13],[74,22],[96,27],[124,29],[124,21],[48,2],[0,0]],240);
    polygon('light',[[0,33],[9,42],[37,44],[49,33],[76,33],[83,35],[120,39],[120,35],[74,30],[49,29],[37,39],[10,38],[0,29]],210);
    polygon('field',[[0,22],[7,23],[15,19],[44,19],[49,23],[62,23],[61,19],[45,15],[14,15],[6,19],[0,18]],224);
    // Stepped cockpit side glass (the region also underneath the physical window).
    polygon('ink',[[4,26],[11,38],[22,38],[22,23],[4,22]]);
    polygon('glass',[[6,26],[12,36],[20,36],[20,25]]);
    polygon('sky',[[7,27],[12,35],[16,35],[10,27]]);
    rect(20,13,1,24,'ink'); rect(21,14,1,11,'light');rect(16,21,3,1,'pale');
    rect(35,14,10,2,'ink');rect(36,16,9,1,'light');
    rect(59,26,2,9,'deep');rect(73,27,2,12,'sun');rect(75,27,2,12,'deep');
    rect(104,30,2,15,'sun');rect(106,31,1,15,'deep');
    // Three flight marks, tail-end identification flash, and two parallel rivet runs.
    for(const x of [25,28,31]){rect(x,14,1,3,'pale');rect(x+1,14,1,1,'sun');}
    polygon('field',[[111,35],[119,48],[124,50],[121,41],[117,37]]);
    rect(118,49,7,2,'sun');
    for(const x of [3,7,12,24,30,37,42,48,55,64,79,86,94,101]) {dot(x,18,x%2?'sun':'light');dot(x+1,17,'deep');}
  }else if(kind==='glazing'){
    rect(0,0,W,H,'glass');polygon('water',[[0,13],[0,63],[128,63],[128,49],[73,29],[41,31],[15,17]]);
    polygon('sky',[[0,47],[0,63],[104,63],[74,52],[48,51],[29,43],[12,40]]);
    polygon('flash',[[22,38],[29,39],[57,61],[49,60]]);
    polygon('sky',[[32,34],[36,35],[55,49],[49,48]]);
    rect(0,0,128,4,'ink');rect(0,59,128,4,'deep');
  }else if(kind==='cheek'){
    // Deliberately broad disconnected facets, not grit spread equally across the metal.
    polygon('deep',[[0,0],[0,18],[14,19],[26,14],[45,15],[64,9],[74,12],[97,11],[105,17],[128,20],[128,0]],218);
    polygon('field',[[0,29],[19,31],[25,34],[38,32],[49,36],[72,34],[93,39],[108,40],[128,45],[128,55],[94,48],[72,43],[48,42],[22,37],[0,36]],190);
    polygon('light',[[3,47],[20,53],[38,56],[48,55],[69,55],[82,59],[108,56],[124,61],[122,55],[106,52],[80,55],[68,52],[35,52],[15,47],[3,44]],190);
    for(const [x,y,w] of [[5,26,12],[13,27,5],[46,34,9],[53,35,6],[83,19,13],[95,20,4],[66,50,9],[108,28,5]]){
      rect(x,y,w,1,'clay');rect(x+1,y+1,w-2,1,'sun');
    }
    // Staggered shell nicks: lifted lower lip and a short cool shoulder.
    for(const [x,y] of [[43,27],[48,23],[87,36]]){
      rect(x,y,4,2,'ink');rect(x+1,y+2,3,1,'clay');rect(x+1,y-1,3,1,'pale');
    }
    // The low turret wall has a quiet centre, a broken rust shoulder at its
    // front, a dark base and a broad warm top plane. Chart front is LEFT.
    polygon('lowPlate',[[1,12],[19,11],[29,13],[35,10],[52,13],[75,11],[87,14],[100,13],[105,29],[97,34],[70,31],[50,33],[29,29],[1,33]]);
    polygon('plate',[[3,32],[17,30],[28,33],[43,31],[67,34],[79,31],[101,35],[110,44],[102,51],[68,49],[51,52],[34,53],[20,49],[4,45]]);
    polygon('crown',[[4,46],[23,49],[36,53],[67,51],[77,54],[105,52],[109,55],[72,58],[51,56],[33,58],[15,53]]);
    for(const [x,y,w,h] of [[4,19,7,9],[11,22,8,7],[18,18,5,5],[26,24,8,4],[30,21,5,3],[39,18,6,4],[61,27,5,3],[79,18,7,5]])flake(x,y,w,h,'oxide');
    for(const [x,y,w,h] of [[3,18,6,7],[13,24,6,4],[22,19,4,5],[29,24,4,3],[72,20,5,3]])flake(x,y,w,h,'rust');
    // The actual shark eye now resides above its jaw on the fixed bow;
    // turret paint and the unit number remain separate from the moving face.
    rect(69,52,16,2,'edge');rect(93,53,8,1,'edge');
    // Separate top chart: long, irregular panels around the roof fittings.
    // Keep the bold color clusters off the cheek emblem and crew.
    yOffset=H;
    rect(0,0,W,H,'plate');
    polygon('crown',[[0,15],[13,11],[31,13],[46,9],[68,9],[81,12],[97,14],[118,12],[128,18],[128,39],[109,36],[86,39],[66,34],[43,35],[26,29],[17,31],[0,25]]);
    polygon('lowPlate',[[0,46],[13,43],[26,47],[41,45],[57,50],[78,49],[85,43],[101,44],[111,40],[128,39],[128,64],[0,64]]);
    for(const [x,y,w,h] of [[9,36,8,5],[14,42,5,4],[24,37,4,3],[39,51,9,4],[45,48,5,4],[73,32,5,3],[92,41,13,4],[100,38,5,4],[110,27,8,4],[115,25,5,2]])flake(x,y,w,h,'oxide');
    for(const [x,y,w,h] of [[10,38,5,3],[40,51,6,3],[94,41,7,4],[110,28,5,2]])flake(x,y,w,h,'rust');
    rect(7,19,13,2,'edge');rect(19,18,8,1,'edge');rect(49,13,15,2,'edge');rect(95,20,8,1,'edge');
    yOffset=0;
  }else if(kind==='deck'){
    polygon('deep',[[0,0],[128,0],[128,12],[95,14],[87,10],[55,15],[33,14],[20,22],[0,23]],180);
    polygon('field',[[4,30],[26,36],[47,31],[70,34],[83,40],[104,40],[123,49],[121,54],[102,45],[81,45],[67,40],[43,36],[23,41],[3,35]],185);
    for(const [x,y,l] of [[8,44,17],[32,47,9],[74,27,13],[82,28,6],[101,34,10],[52,15,8],[16,55,15]]){
      rect(x,y,l,1,'deep');rect(x+2,y+1,l-3,1,'sun');
    }
  }else{
    rect(0,5,128,5,'deep',190);rect(0,11,128,2,'light',205);
    for(const x of [8,36,67,96]){
      polygon('field',[[x,15],[x+20,15],[x+22,22],[x+21,52],[x+18,56],[x+2,54],[x,47]],194);
      rect(x,15,1,37,'ink');rect(x+2,54,16,2,'sun');rect(x+2,19,2,2,'pale');rect(x+16,49,2,2,'deep');
    }
  }
  const texture=new THREE.DataTexture(px,width,height,THREE.RGBAFormat);
  texture.name='ghost-signal-vehicle-ink:'+kind;texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

export function inkVehicle<T extends THREE.MeshStandardMaterial>(m:T,kind:Exclude<VehicleInk,'shark'|'sideJaw'|'skirtSteel'>|'engine',chart:THREE.Texture,wreck=false):T{
  const previous=m.onBeforeCompile,previousKey=m.customProgramCacheKey();
  const coords={
    huey:'vec2((g.z+1.95)/7.51,(g.y+.61)/1.90)',
    cheek:'g.y>.252 && n.y>.69 ? vec2((g.z+.71)/1.45,.502+.490*abs(g.x)/.64) : vec2((g.z+.70)/1.47,clamp((g.y+.16)/.49,.006,.994)*.50)',
    deck:'vec2((g.z+1.08)/2.16,abs(g.x)/.71)',
    engine:'vec2(.0005+.2485*(g.x+.57)/1.14,n.y>.44 ? .13+.85*(g.z+.25)/.5 : (g.y+.09)/.18)',
    fender:'vec2((g.z+1.17)/2.34,abs(g.x+.16)/.32)',
    glazing:'abs(n.x)>.8 ? vec2(g.z<0.?(g.z+1.09)/.55:(g.z-.78)/.24,(g.y+.078)/.423) : vec2(clamp(abs(g.x)/.53,0.,1.),clamp((g.y+.06)/.73,0.,1.))',
  }[kind];
  const visibility={huey:'1.',cheek:'g.y>.252 && n.y>.69 ? .97 : smoothstep(.18,.55,abs(n.x))',deck:'smoothstep(.2,.65,n.y)',engine:'.82',fender:'smoothstep(.15,.55,n.y)',glazing:'1.'}[kind];
  m.name='ghost-signal-'+kind+(wreck?'-wreck':'');
  m.onBeforeCompile=(s,r)=>{
    previous.call(m,s,r);s.uniforms.uVehicleInk={value:chart};
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 ghostVehicleLocal; varying vec3 ghostVehicleNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nghostVehicleLocal=position;ghostVehicleNormal=normal;');
    const ink=`
      {vec3 g=ghostVehicleLocal,n=normalize(ghostVehicleNormal);vec2 uv=${coords};
       vec4 ink=texture2D(uVehicleInk,clamp(uv,vec2(0.),vec2(1.)));
       float cover=ink.a*(${visibility});
       ${kind==='deck'?'if(n.z<-.50 && g.z<-.80)cover=0.;':''}
       ${kind==='cheek'?'if(abs(g.z+.411)<.094 && g.y>-.051 && g.y<.055)cover=0.;':''}
       ${kind==='huey'&&wreck?'ink.rgb=mix(ink.rgb,vec3(.054,.046,.038),.70*(1.-smoothstep(.25,1.38,length(g-vec3(.0,.32,.45)))));':''}
       ${kind==='cheek'||kind==='deck'?`
       // These charts group broad values over the newly painted steel.
       // Their solid olive shapes must not blanket the underlying brushwork.
       float oxideInk=smoothstep(.035,.14,ink.r-1.43*ink.g);
       diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,cover*mix(.37,.82,oxideInk));
       `:`diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,cover*.93);`}
       ${kind==='cheek'||kind==='deck'||kind==='fender'?`
       // Dried field dust settles into rough casting rather than replacing
       // the shark art, glass, hot barrel, or broad paint panels. Small
       // chipped clusters follow the authored edge envelope in object space.
       vec2 metalChart=abs(n.y)>.67?g.xz:(abs(n.x)>.54?g.zy:g.xy);
       vec2 grain=metalChart*196.;
       float readable=1.-smoothstep(.58,1.5,max(length(dFdx(grain)),length(dFdy(grain))));
       vec2 cell=floor(grain);vec2 group=floor((grain+vec2(2.,0.))/vec2(6.,3.));
       float nest=fract(sin(dot(group,vec2(19.19,41.23)))*2349.43);
       float flake=fract(sin(dot(cell,vec2(41.2,16.6)))*1329.12);
       float lip=smoothstep(.37,.84,abs(n.x)*.72+abs(n.z)*.32+max(0.,n.y)*.25);
       float wear=smoothstep(.72,.96,nest)*smoothstep(.31,.70,flake)*(.35+.65*lip)*readable;
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.225,.178,.111),wear*.47);
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.40,.37,.29),wear*smoothstep(.86,1.,flake)*.34);
       `:''}}
    `;
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uVehicleInk;varying vec3 ghostVehicleLocal; varying vec3 ghostVehicleNormal;')
      .replace('#include <alphamap_fragment>',ink+'\n#include <alphamap_fragment>');
  };
  m.customProgramCacheKey=()=>previousKey+'/ghost-vehicle-v1:'+kind+(wreck?':wreck':'');return m;
}
