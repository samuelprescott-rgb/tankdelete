import * as THREE from 'three';
import {PORTRAIT_VERTICES, PORTRAIT_TRIANGLES} from './bakedFieldPortrait';
import {PORTRAIT_UV16} from './bakedFieldPortraitUV';
import {createFieldHeadGeometry} from './fieldHeadGeometry';

const smooth = THREE.MathUtils.smoothstep;
const bell = (v: number, center: number, spread: number) => Math.exp(-(((v - center) / spread) ** 2));
const cache = new Map<string, THREE.BufferGeometry>();
function bytes(text: string) {
  return new DataView(Uint8Array.from(atob(text), character => character.charCodeAt(0)).buffer);
}
let asset: {vertices: DataView; indices: DataView; chart:DataView} | undefined;

/** One merged, vertex-painted field portrait. In particular the eyes are not
 * front decals: a small curved globe sits inside each sculpted socket and the
 * *original eyelid edge* occludes the iris. No map, LOD updates or extra draw. */
export function createFieldPortrait(headY: number, skin: string, variant: number, faction: 'us' | 'vc', fieldIssue=true) {
  const style = (variant + (faction === 'vc' ? 2 : 0)) % 3;
  const identity=(variant%3)*2+(faction==='vc'?1:0), key = identity + skin + fieldIssue;
  const cached = cache.get(key);
  if (cached) return cached.clone().translate(0, headY, 0);
  try {
    asset ??= {vertices: bytes(PORTRAIT_VERTICES), indices: bytes(PORTRAIT_TRIANGLES),chart:bytes(PORTRAIT_UV16)};
    const {vertices, indices,chart} = asset;
    if (vertices.byteLength % 12 || indices.byteLength % 6 || indices.byteLength < 6000||chart.byteLength!==vertices.byteLength/3) throw Error('Invalid portrait');
    const positions: number[] = [], normals: number[] = [], colors: number[] = [], triangles: number[] = [];
    const tissue = new THREE.Color(skin), atlasSkin = new THREE.Color('#d8a784');
    const shade = new THREE.Color(), sienna = new THREE.Color('#936e5f'), stubble = new THREE.Color('#575953');
    const normal = new THREE.Vector3(), temple = new THREE.Color('#795e54');
    const planeNormal = new THREE.Vector3(), cool = new THREE.Color('#756f67');
    const hair = new THREE.Color(['#4c443b','#323533','#393531'][style]);
    // A light plane, cool halftone and warm lip wash mixed with each
    // person's own pigment. The old photo has a deep red nasal shadow baked
    // in; relighting that shadow at dusk made a thumbprint across the nose.
    const litTissue=tissue.clone().lerp(new THREE.Color('#c8b5a2'),.26);
    const halfTone=tissue.clone().lerp(new THREE.Color('#817c70'),.43);
    const lipTone=tissue.clone().lerp(new THREE.Color('#865c58'),.41);
    const whisker=new THREE.Color(['#525852','#74675a','#595950'][style]);
    const browHair=new THREE.Color(['#483b31','#393531','#433e38'][style]);
    function vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, rgb: THREE.Color,
      dx = 0, dy = 0, dz = 0) {
      const jaw = bell(y, .050, .037), cheek = bell(y, .114, .023) * bell(Math.abs(x), .057, .03);
      const wider = 1 + [-.027,.032,.009][style] + [.143,.022,-.118][style]*jaw + [0,-.035,.109][style]*cheek;
      const nose = bell(x,0,.023)*bell(y,.104,.026)*smooth(-z,.107,.146);
      const forward = [0,.0045,-.0036][style]*nose;
      // Measurements share the original rig's neck origin and eye line.
      // Lower neck tapers inside the collar independently of the cheek/jaw.
      const neck = 1 - smooth(y,.004,.046);
      // Lids share the same local deformation as the globe. Raise one outer
      // brow and relax the other, varying the expression rather than skin dye.
      const brow = bell(Math.abs(x),.036,.027)*bell(y,.157,.011)*smooth(-z,.07,.118);
      const lip = bell(Math.abs(x),.023,.011)*bell(y,.075,.009)*smooth(-z,.10,.142);
      const chin=bell(y,.042,.019)*bell(x,0,.046)*smooth(-z,.064,.104);
      const tipWidth=bell(y,.098,.014)*bell(Math.abs(x),.012,.011)*smooth(-z,.110,.139);
      positions.push(.012 + x*wider*(1-.23*neck) + Math.sign(x)*[.0014,-.0012,.0025,-.0016,.0002,.0013][identity]*tipWidth + dx,
        y-.128-.033*neck+[.002,-.004,.0005,.0035,-.0028,.0028][identity]*chin
        +brow*([.0002,.0018,.0039][style]+.0018*Math.sign(x))+lip*([-.0018,.0015,.0023][style]*Math.sign(x)) + dy,
        .020 + z*(1-.09*neck)+forward+.0022*brow + dz);
      normal.set(nx/wider, ny, nz).normalize();
      normals.push(normal.x, normal.y, normal.z);
      colors.push(rgb.r,rgb.g,rgb.b);
    }
    for (let i = 0; i < vertices.byteLength; i += 12) {
      const x = vertices.getInt16(i,true)/1e5, y = vertices.getInt16(i+2,true)/1e5, z = vertices.getInt16(i+4,true)/1e5;
      shade.setRGB(vertices.getUint8(i+9)/255, vertices.getUint8(i+10)/255, vertices.getUint8(i+11)/255, THREE.SRGBColorSpace);
      shade.r *= tissue.r/atlasSkin.r; shade.g *= tissue.g/atlasSkin.g; shade.b *= tissue.b/atlasSkin.b;
      const front = smooth(-z,.046,.115), orbit = bell(Math.abs(x),.03,.025)*bell(y,.141,.016)*front;
      // Neutralize the photo's red socket, keeping eyebrow/lash pigment dark
      // and a warm inner lid. The upper cheek and jaw turn as a single mass.
      const red = smooth(shade.r/Math.max(.002,shade.g),2.1,4.5);
      shade.lerp(sienna, orbit * red * .37).lerp(tissue, orbit * .16);
      shade.lerp(temple, .15 * bell(Math.abs(x),.066,.020)*bell(y,.149,.045));
      shade.lerp(stubble, [.26,.14,.31][style]*bell(y,.047,.025)*front);
      const cheek = bell(Math.abs(x),.050,.021)*bell(y,.111,.016)*front;
      shade.multiplyScalar(1 + .12*cheek - .10*bell(Math.abs(x),.058,.020)*bell(y,.080,.018)*front);
      const a = Math.abs(x);
      const side = Math.sign(x);
      // The zygoma slopes from the outer orbit toward the mouth. Build its
      // ledge and the masseter below as contiguous planes, not diagonal ink.
      const cheekAxis = .113 + .014*smooth(a,.019,.067);
      const crest = bell(y,cheekAxis,.014)*bell(a,.051,.026)*smooth(-z,.052,.111);
      const returnPlane = bell(y,cheekAxis-.028,.022)*bell(a,.055,.024)*smooth(-z,.047,.104);
      const temporal = bell(y,.153,.033)*smooth(a,.046,.074)*smooth(-z,.033,.090);
      const jawTurn = bell(y,.064,.027)*bell(a,.051,.032)*smooth(-z,.030,.100);
      const chinPad = bell(y,.040,.022)*bell(a,0,.040)*front;
      const arch = bell(a,.033,.024)*bell(y,.158-.006*smooth(a,.036,.059),.009)*front;
      const glabella = bell(x,0,.014)*bell(y,.154,.017)*front;
      // The actual tissue rim lowers over the existing globe. Canthi remain
      // fixed and the under-eye rolls up by less than a millimetre.
      const eyeSpan = bell(a,.031,.0145)*smooth(-z,.107,.125);
      const upperLid = eyeSpan*bell(y,.144,.0053)*smooth(y,.1395,.143);
      const lowerLid = eyeSpan*bell(y,.136,.0047)*(1-smooth(y,.137,.140));
      const cant = side*([-.00028,.00028,-.00052][style]);
      const browDrop = [.00115,.00165,.00130][style] + cant;
      const bone = [.0036,.0044,.0030][style], hollow = [.0026,.0018,.0031][style];
      const dx = side*(bone*.60*crest-hollow*.81*returnPlane-.0040*temporal
        +[.0040,.0054,.0025][style]*jawTurn);
      // The actual kneeling kit camera is 22 cm above eye level. The old
      // 4–6 mm aperture disappeared to three pixels on its far side.
      // Raise the upper lash fold and open the lower tissue at its centre;
      // keep both canthi seated and leave the guardian/specialist fit alone.
      const dy = -.0016*arch+(fieldIssue?.00195:-browDrop)*upperLid+(fieldIssue?-.00038:.00065)*lowerLid
        + [.0024,.0044,.0030][style]*chinPad;
      const dz = -bone*crest+hollow*returnPlane+.0020*temporal-.0036*arch
        -.0018*glabella-.0008*upperLid;
      // Cooler lower planes and small, broken changes in value survive field
      // light without making a dark outline or stamping a stripe on the face.
      const brush = .86+.14*Math.sin(240*y+133*x+91*z+style);
      const socket = bell(y,.147-.10*(a-.033),.0125)*bell(a,.036,.025)*front;
      const noseReturn = bell(a,.014,.013)*bell(y,.092,.008)*front;
      const lipPart = bell(y,.070,.004)*bell(a,.008,.023)*front;
      const throat = (1-smooth(y,.019,.045)) * smooth(-z,.034,.102);
      // A broad orbital return and a second distinct dark under the nose
      // survive field-sized lighting. The cheekbone, bridge and lower lid
      // remain in sun; no flat eye stripe over the actual eye globe.
      shade.lerp(cool,returnPlane*.21+temporal*.16+jawTurn*.10)
        .lerp(temple,socket*.27+throat*.33)
        .multiplyScalar(1+.21*crest*brush-.27*returnPlane-.15*temporal
          -.29*socket-.27*noseReturn-.26*lipPart-.22*throat);
      // Design a broad cheek light with a restrained cool return and a
      // narrow, local nostril. Inside the old whole-nose stain rebuild the
      // values from the actual bridge, wing and underside instead of
      // multiplying the dark source photo by a second cast shadow.
      const noseBody=bell(a,0,.0235)*bell(y,.106,.026)*front;
      const ridge=bell(a,0,.0076)*bell(y,.123,.031)*front;
      const ala=bell(a,.012,.0083)*bell(y,.102,.009)*front;
      const nostril=bell(a,.0105,.0045)*bell(y,.092,.0036)*front;
      const halfBeard=front*bell(y,.056,.025)*(.33+.67*smooth(a,.016,.054));
      const lipBow=bell(y,.071,.007)*bell(a,.011,.016)*front;
      const part=bell(y,.069,.0027)*bell(a,.010,.019)*front;
      shade.lerp(litTissue,.64*noseBody+.14*crest+.16*ridge)
        .lerp(halfTone,.22*ala+.27*returnPlane+.12*jawTurn)
        .lerp(lipTone,.43*lipBow)
        .lerp(whisker,[.30,.49,.22,.11,.37,.17][identity]*halfBeard*(.72+.28*brush))
        .multiplyScalar(1+.12*crest+.20*ridge-.39*nostril-.21*part);
      const lidHem = bell(y,.144-.003*smooth(a,.033,.047),.0025)*eyeSpan;
      shade.lerp(browHair,lidHem*.54);
      const browLine = .158 + .003*bell(a,.034,.016) - smooth(a,.036,.061)*.010 + Math.sign(x)*.0018;
      const browInk = bell(y,browLine,.0055)*bell(a,.033,.021)*front;
      const hairline = .211 - .033*smooth(z,-.101,-.067) - .067*smooth(z,-.057,-.011) - .024*smooth(z,.006,.057);
      const sideburn = bell(z,-.034,.011)*smooth(a,.056,.075)*smooth(y,.130,.151);
      shade.lerp(browHair, browInk * [.91,.96,.87][style]*brush)
        .lerp(hair, Math.max(smooth(y,hairline-.009,hairline+.006),sideburn*.87)*.90);
      // Short cropped hair turns around the ear rather than leaving a
      // featureless orange temple under the conical hat. Keep the frontal
      // forehead and the ear itself free.
      const clip=smooth(z,-.076,-.034)*smooth(a,.054,.074)
        *smooth(y,.145+.019*smooth(-z,.039,.081),.179+.021*smooth(-z,.039,.081));
      shade.lerp(hair,clip*(.78+.12*Math.sin(410*y-151*z+identity)));
      // Keep the source's lid rolls and silhouette normals. Establish broad,
      // coherent skull planes in the interior rather than flat-shading each
      // triangle (the old orbital normal smoothing erased most of the shelf).
      normal.set(vertices.getInt8(i+6)/127,vertices.getInt8(i+7)/127,vertices.getInt8(i+8)/127)
        .lerp(planeNormal.set(side*.24,.17,-.95),.42*orbit)
        .lerp(planeNormal.set(side*.49,.37,-.79),.49*crest)
        .lerp(planeNormal.set(side*.67,-.27,-.69),.48*returnPlane)
        .lerp(planeNormal.set(side*.86,.08,-.49),.47*temporal)
        .lerp(planeNormal.set(side*.28,.31,-.91),.37*arch)
        .lerp(planeNormal.set(side*.46,.08,-.88),.37*noseBody*(1-nostril));
      vertex(x,y,z,normal.x,normal.y,normal.z,shade,dx,dy,dz);
    }
    for (let i = 0; i < indices.byteLength; i += 2) triangles.push(indices.getUint16(i,true));

    const sclera = new THREE.Color('#c3c1af'), lidShadow = new THREE.Color('#858678');
    const eyePaint = new THREE.Color(), limbus = new THREE.Color('#4d493b');
    const iris = new THREE.Color(['#7c7055','#73624d','#727b65'][style]), pupil = new THREE.Color('#242822');
    const rings: [number, THREE.Color][] = [[fieldIssue?.221:.17,pupil],[fieldIssue?.29:.24,iris],[fieldIssue?.44:.37,iris],[fieldIssue?.49:.43,limbus],[fieldIssue?.55:.51,sclera],[.94,sclera],[1.72,sclera]];
    for (const side of [-1,1]) {
      const radial = 10, center = positions.length/3, radius = .01185;
      function eye(azimuth: number, latitude: number, paint: THREE.Color) {
        const a = Math.sin(latitude)*Math.cos(azimuth), b = Math.sin(latitude)*Math.sin(azimuth), c = -Math.cos(latitude);
        const gaze = [-.108,.099,.033][style], down = (fieldIssue?[.069,.087,.057]:[-.103,-.144,-.117])[style];
        const nx = a*Math.cos(gaze)-c*Math.sin(gaze), turnsZ = c*Math.cos(gaze)+a*Math.sin(gaze);
        const ny = b*Math.cos(down)-turnsZ*Math.sin(down), nz=turnsZ*Math.cos(down)+b*Math.sin(down);
        eyePaint.copy(paint);
        if (paint === sclera) eyePaint.lerp(lidShadow,.09+.33*smooth(ny,-.18,.63));
        if (paint === iris) eyePaint.multiplyScalar(.83+.29*smooth(-ny,-.23,.22));
        vertex(side*.0293125+nx*radius, .14164+ny*radius*.92, -.115405+nz*radius, nx,ny/.92,nz,eyePaint);
      }
      eye(0,0,pupil);
      for (const [row,[latitude,color]] of rings.entries()) for (let col=0; col<radial; col++) {
        eye(col/radial*Math.PI*2,latitude,color);
        const a=center+1+row*radial+col, b=center+1+row*radial+(col+1)%radial;
        if (!row) triangles.push(center,b,a);
        else triangles.push(a-radial,b,a,b-radial,b,a-radial);
      }
    }
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    indexed.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    indexed.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    indexed.setIndex(triangles);
    const baked = indexed.toNonIndexed(); indexed.dispose();
    const uv=new Uint16Array(triangles.length*2),originalVertices=vertices.byteLength/12;
    for(let i=0;i<triangles.length;i++){
      const k=triangles[i];uv[2*i]=k<originalVertices?chart.getUint16(k*4,true):65535;
      uv[2*i+1]=k<originalVertices?chart.getUint16(k*4+2,true):65535;
    }
    baked.userData.fieldPortrait={mode:'baked-CC0-UV-globes',skinTriangles:indices.byteLength/6,eyeTriangles:260};
    baked.userData.fieldFaceUv=uv;
    cache.set(key,baked);
    return baked.clone().translate(0,headY,0);
  } catch {
    const fallback=createFieldHeadGeometry(headY,skin,variant,faction);
    fallback.userData.fieldPortrait={mode:'procedural-fallback',skinTriangles:0,eyeTriangles:0};return fallback;
  }
}
