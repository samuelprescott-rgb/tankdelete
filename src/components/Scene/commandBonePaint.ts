import * as THREE from 'three';

// An unwrapped, indexed pigment study for the two actual skull sculpts. A
// point is (azimuth in radians from the nose, height in skull-local metres);
// unlike a photograph projected from the front, the cheek strokes continue
// onto the side plane. Jaw and skull sample the same coordinate at their seam.
type Point=readonly [number,number];
type Stroke={polygon:Point[];rgb:number;strength:number};
const W=192,H=96, PAD=2;
let plate:THREE.DataTexture|undefined;
export function skullPaintUv(t:number,y:number,watcher:boolean):[number,number]{
  return [((watcher?W:0)+PAD+.5+t*(W-1-2*PAD))/(2*W),
    (PAD+.5+(y+.227)/.547*(H-1-2*PAD))/H];
}
function inkDrawing(high:boolean){
  const shapes:Stroke[]=[];
  function fill(rgb:number,strength:number,...polygon:Point[]){shapes.push({polygon,rgb,strength});}
  const sockets=0x342e39,shale=0x60616b,earth=0x756459,umber=0x594a4b,
    bone=high?0xb4ab99:0xb4a797,pewter=high?0x9a9da0:0x979aa1,
    ochre=high?0xaa8972:0xa38b76,chin=high?0x817571:0x87796f;
  for(const side of [-1,1]){
    const q=side*(high?-1:1), eye=(high?.073:.089)+side*(high?.009:-.008),
      of=high?.505:.485;
    function mirror(rgb:number,strength:number,...vertices:Point[]){
      fill(rgb,strength,...vertices.map(([a,y]):Point=>[side*a,y]));
    }
    // Brow is one projecting volume with an inner lit ridge, a broken outer
    // facet and a very dark underside. Eye shapes taper toward the temple.
    mirror(shale,.65,[.07,eye+.133],[.31,eye+.142],[.61,eye+.113],[.91,eye+.072],
      [1.01,eye+.032],[.59,eye+.061],[.38,eye+.069],[.15,eye+.053]);
    mirror(umber,.91,[.06,eye+.039],[.22,eye+.076],[.53,eye+.070+q*.010],[.89,eye+.036],
      [1.08,eye+.009],[.73,eye+.012],[of,eye+.027],[.25,eye+.009],[.12,eye-.011]);
    mirror(sockets,.92,[.17,eye+.004],[.34,eye+.032],[of,eye+.029],[.81,eye+.009],
      [.91,eye-.008],[.66,eye-.025],[.36,eye-.024],[.21,eye-.013]);
    mirror(q<0?bone:ochre,.88,[.18,eye+.048],[.32,eye+.081],[.59,eye+.069+q*.010],
      [.81,eye+.041],[.56,eye+.048],[.36,eye+.057],[.24,eye+.038]);
    mirror(pewter,.73,[of-.16,eye-.021],[of+.02,eye-.023],[.75,eye-.011],
      [.67,eye-.028],[.48,eye-.035],[.36,eye-.030]);
    // Three broad, unequal value planes, not little stripes covering cheeks.
    mirror(q<0?pewter:ochre,.87,[.44,eye-.053],[.76,eye-.041],[1.07,eye-.013],
      [1.20,eye+.023],[1.18,eye-.033],[.96,eye-.058],[.69,eye-.079],[.50,eye-.084]);
    mirror(umber,.78,[.54,eye-.086],[.78,eye-.082],[1.11,eye-.053],[.98,-.040],
      [.84,-.071],[.75,-.078],[.75,-.039],[.59,-.019]);
    mirror(q>0?shale:chin,.80,[1.25,.088],[1.48,.079],[1.56,.031],[1.48,-.038],
      [1.25,-.103],[1.12,-.110],[1.21,-.048],[1.34,-.001]);
    mirror(ochre,.76,[.35,-.038],[.48,-.057],[.63,-.091],[.72,-.112],
      [.65,-.109],[.48,-.084],[.37,-.064]);
    mirror(sockets,.74,[.05,-.008],[.125,-.013],[.213,-.004],[.24,.007],
      [.21,-.012],[.12,-.024],[.063,-.020]);
    mirror(chin,.88,[.18,-.161],[.40,-.151],[.78,-.117],[1.00,-.100],
      [.91,-.126],[.69,-.153],[.39,-.180],[.20,-.185]);
    mirror(q>0?ochre:pewter,.66,[.12,-.183],[.29,-.175],[.54,-.158],[.46,-.173],[.2,-.199],[.10,-.198]);
    // Broken scalp sutures and a cool temple plane sit outside the face. No
    // emissive stroke and no script, screen grid, or random grit across eyes.
    mirror(shale,.70,[.80,.174],[1.09,.233],[1.48,.244],[1.64,.212],[1.30,.198],[1.04,.153]);
    mirror(sockets,.65,[.23+q*.06,.261],[.32+q*.06,.234],[.29+q*.06,.218],[.40+q*.06,.198],
      [.36+q*.06,.201],[.24+q*.06,.219],[.27+q*.06,.235]);
  }
  // Off-centre nose bridge, a short broken reflected edge and the menton.
  const lean=high?.04:-.05;
  fill(ochre,.83,[lean-.09,.118],[lean+.035,.084],[lean+.076,.023],[lean+.055,-.004],
    [lean-.03,-.008],[lean-.10,.025],[lean-.067,.068]);
  fill(bone,.87,[lean-.031,.082],[lean+.016,.065],[lean+.059,.019],[lean+.04,.010],
    [lean+.002,.017],[lean-.043,.054]);
  fill(earth,.68,[-.12,-.117],[.06,-.111],[.21,-.132],[.12,-.153],[-.03,-.15],[-.13,-.142]);
  return shapes;
}
function inside(a:number,y:number,polygon:Point[]){
  let inPatch=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,ay]=polygon[i],[bx,by]=polygon[j];
    if((ay>y)!==(by>y)&&a<(bx-ax)*(y-ay)/(by-ay)+ax)inPatch=!inPatch;
  }
  return inPatch;
}
export function commandBonePaint(){
  if(plate)return plate;
  const pixels=new Uint8Array(W*2*H*4);
  for(const v of [0,1]){
    const shapes=inkDrawing(!!v);
    for(let j=0;j<H;j++)for(let i=0;i<W;i++){
      const t=THREE.MathUtils.clamp((i-PAD)/(W-1-2*PAD),0,1), h=THREE.MathUtils.clamp((j-PAD)/(H-1-2*PAD),0,1);
      const a=(t-.5)*2*Math.PI,y=h*.547-.227;
      // Only a few connected, multi-texel base shapes below the drawn accents.
      const cut=.59*Math.cos(a*2.0-.50+y*6.4+v*.6)+.24*Math.sin(a*3.1+y*18+v)+.17*Math.sin(a*.7+y*37);
      let rgb=cut>.67?0x8d8580:cut>.22?0x756f70:cut>-.3?0x696269:0x504b54;
      let strength=.45;
      if(y>.191+.029*Math.cos(a*2.7+v)){rgb=cut>.20?0x515158:0x3c3743;strength=.59;}
      for(const patch of shapes)if(inside(a,y,patch.polygon)){rgb=patch.rgb;strength=patch.strength;}
      const k=(j*2*W+v*W+i)*4;
      pixels[k]=rgb>>16&255;pixels[k+1]=rgb>>8&255;pixels[k+2]=rgb&255;pixels[k+3]=Math.round(255*strength);
    }
  }
  plate=new THREE.DataTexture(pixels,2*W,H);plate.name='command-two-skull-pigment-study';plate.colorSpace=THREE.SRGBColorSpace;
  plate.magFilter=THREE.NearestFilter;plate.minFilter=THREE.LinearMipmapLinearFilter;plate.generateMipmaps=true;
  plate.needsUpdate=true;return plate;
}
