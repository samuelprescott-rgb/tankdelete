import * as T from 'three';

// Crew coordinates are metres, facing -Z, before the existing 0.72 world
// conversion. The grip axes are measured from the *rendered* pintle controls.
export const CREW_GRIPS = [[.175 / .72, .20 / .72, -.19 / .72],
  [.305 / .72, .20 / .72, -.19 / .72]] as const;
// The painting shows the BACK of a hunched upper torso and a turned profile.
// Drop the pelvis inside the existing bore, lean the ribcage forward, and
// turn the neck independently. Never scale the head or move the controls.
export const CREW_NECK: [number, number, number] = [.121, .300, -.163];
export const CREW_HEAD_ROTATION: [number, number, number] = [-.153, -.855, -.047];
const headFrame = new T.Matrix4().compose(new T.Vector3(...CREW_NECK),
  new T.Quaternion().setFromEuler(new T.Euler(...CREW_HEAD_ROTATION)), new T.Vector3(1, 1, 1));
const bodyTurn = -.38, Y = new T.Vector3(0, 1, 0), TAU = Math.PI * 2;
const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const dye = (hex: string) => new T.Color(hex);
const blend = (a: string, b: string, t: number) => dye(a).lerp(dye(b), T.MathUtils.clamp(t, 0, 1));
const bell = (d: number, r: number) => Math.exp(-((d / r) ** 2));
const sat = (n: number) => Math.max(0, Math.min(1, n));
type Sample = [p: T.Vector3, c: T.Color];

// A single indexed draw for shirt, vest, bare arms, helmet and radio kit.
// Each authored patch gets its own edge normals; no global noise displacement.
class PaintedSculpt {
  p: number[] = []; c: number[] = []; idx: number[] = [];
  surface: number[] = []; kind = 0; // weave, skin, shell, hardware
  detail:number[]=[];chart?: (u:number,t:number)=>[number,number,number];
  readonly landmarks:Record<string,[number,number]>={};
  mark(name:string,draw:()=>void) {
    const start=this.p.length/3;draw();this.landmarks[name]=[start,this.p.length/3];
  }
  sheet(cols: number, rows: number, sample: (u: number, t: number) => Sample, loop = false, flip = false) {
    const start = this.p.length / 3, width = loop ? cols : cols + 1;
    for (let j = 0; j <= rows; j++) for (let i = 0; i < width; i++) {
      const [p, c] = sample(i / cols, j / rows);
      this.p.push(p.x, p.y, p.z); this.c.push(c.r, c.g, c.b); this.surface.push(this.kind);
      this.detail.push(...(this.chart?this.chart(i/cols,j/rows):[-1,0,0]));
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = start + j * width + i, b = start + j * width + (i + 1) % width;
      if (flip) this.idx.push(a, a + width, b, b, a + width, b + width);
      else this.idx.push(a, b, a + width, b, b + width, a + width);
    }
  }
  tube(points: T.Vector3[], widths: number[], depths: number[], paint: (u: number, t: number) => T.Color,
    sides = 12, guide = v(1, 0, 0), radius = (_u:number,_t:number)=>1) {
    const bases = points.map((p, i) => {
      const dir = (points[Math.min(i + 1, points.length - 1)]).clone().sub(points[Math.max(i - 1, 0)]).normalize();
      const seed = Math.abs(dir.dot(guide)) > .97 ? v(0, 0, 1) : guide;
      const x = seed.clone().addScaledVector(dir, -seed.dot(dir)).normalize();
      return { p, x, z: dir.clone().cross(x) };
    });
    this.sheet(sides, points.length - 1, (u, t) => {
      const i = Math.round(t * (points.length - 1)), { p, x, z } = bases[i];
      const r=radius(u,t);
      return [p.clone().addScaledVector(x, Math.cos(TAU * u) * widths[i]*r)
        .addScaledVector(z, Math.sin(TAU * u) * depths[i]*r), paint(u, t)];
    }, true);
  }
  oval(at: T.Vector3, radii: T.Vector3, paint: (u: number, t: number) => T.Color, transform?: T.Matrix4) {
    this.sheet(14, 8, (u, t) => {
      const h = Math.PI * (.001 + .998 * t), a = TAU * u;
      const p = v(Math.sin(a) * Math.sin(h) * radii.x, -Math.cos(h) * radii.y,
        -Math.cos(a) * Math.sin(h) * radii.z).add(at);
      return [transform ? p.applyMatrix4(transform) : p, paint(u, t)];
    }, true, true);
  }
  finish() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.setAttribute('crewSurface',new T.Float32BufferAttribute(this.surface,1));
    g.setAttribute('crewDetail',new T.Float32BufferAttribute(this.detail,3));
    g.setIndex(this.idx); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData.landmarks=this.landmarks;
    return g;
  }
}

// Cross sections are not a barrel: the lower belly disappears inside the
// cupola, the ribcage moves over the rim and one shoulder follows the reach.
const VEST = [
  [-.073, .140, .103], [-.006, .167, .120], [.035, .171, .125], [.077, .169, .123],
  [.125, .180, .136], [.194, .190, .141], [.260, .196, .134], [.298, .198, .125],
  [.318, .184, .117], [.337, .142, .096], [.356, .084, .078], [.360, .065, .065],
];
function torso(a: number, y: number, lift = 0) {
  let i = 1;
  while (i < VEST.length - 1 && y > VEST[i][0]) i++;
  const lo = VEST[i - 1], hi = VEST[i], k = sat((y - lo[0]) / (hi[0] - lo[0]));
  const h = sat((y + .070) / .43), side = Math.sin(a), front = Math.cos(a);
  const fold = .009 * bell(y - .084 - side * .043, .018) - .004 * bell(y - .107 - side * .047, .017)
    + .007 * bell(y - .194 + side * .064, .026) * (1 - Math.abs(front) * .35)
    + .006 * bell(y - .266 - side * .024, .022) * Math.max(-front, 0);
  const exposed=T.MathUtils.smoothstep(y,.05,.29), back=Math.max(0,-front);
  return v(side * (T.MathUtils.lerp(lo[1], hi[1], k) + fold + lift)*(1+.13*exposed),
    y - .038*exposed + .027*back*exposed - .020*side*exposed,
    -front * (T.MathUtils.lerp(lo[2], hi[2], k) + fold + lift)*(1+.27*back*exposed))
    .applyAxisAngle(Y, bodyTurn).add(v(.005 + .098*h*h, -.015*h*h, .020 - .170*h*h));
}

function vest(g: PaintedSculpt) {
  g.chart=(_u,t)=>[11,t,0]; // main tunic and pockets
  const seamLine = (a: number) => .252 - .032 * Math.sin(a + .23) ** 2;
  g.sheet(36, 23, (u, t) => {
    const a = u * TAU, y = -.073 + t * .433, side = Math.sin(a), back = Math.max(0, -Math.cos(a));
    const broad = .43 + .19 * Math.sin(a * 2 + y * 10) + .10 * Math.sin(a * 6.1 + y * 20);
    const crease = bell(y - .085 - side * .045, .017) * .44 - bell(y - .110 - side * .041, .018) * .32;
    const seam = back * (bell(y - seamLine(a), .013) * .39 - bell(y - seamLine(a) + .014, .010) * .47);
    const pocketShade=.18*back*T.MathUtils.smoothstep(y,.10,.16)*(1-T.MathUtils.smoothstep(y,.23,.27));
    const plane=Math.round((broad+crease+seam+.17*t-pocketShade)*5)/5;
    return [torso(a, y), blend('#202c28', '#687053',plane)];
  }, true, true);
  // Lapped shoulder yoke, two stitched webbing columns, quilted pack folds
  // and patch pockets follow the actual turned surface, including at the back.
  function patch(cols: number, rows: number, at: (u: number, t: number) => [number, number, number],
    pigment: (u: number, t: number) => T.Color) {
    g.sheet(cols, rows, (u, t) => [torso(...at(u, t)), pigment(u, t)], false, true);
  }
  for (const sign of [-1, 1]) {
    g.chart=(_u,t)=>[11,t,0];
    const pocket = (u: number, t: number) => sign * .54 + (u - .5) * .71 + sign * t * .046;
    patch(9, 8, (u, t) => [pocket(u, t), .099 + t * .127 + sign * (u - .5) * .020,
      .002 + .010 * Math.sin(Math.PI * u) ** .48 * Math.sin(Math.PI * t) ** .45],
      (u, t) => blend('#435244', '#9a9570', .34 + .43 * bell(u - .49, .095) + .11 * t - .28 * bell(u - .63, .08)));
    patch(9, 3, (u, t) => [pocket(u, t), .195 + t * .043 + sign * (u - .5) * .019 - .017 * Math.sin(Math.PI * u),
      .009 + .006 * (1 - t)],
      (u, t) => blend('#46503b', '#aba480', .30 + .29 * t + .29 * bell(t, .14) + .12 * Math.sin(u * 3)));
    // Back-to-shoulder harness: broad padded rails with an arched crown,
    // piped edges and real thickness at the silhouette. Bridge each strap
    // over the shoulder rather than leaving two painted rectangles.
    for(const back of [false,true]) {
      g.chart=(_u,t)=>[13,t,0]; // raised shoulder webbing
      const center=back?Math.PI+sign*.69:sign*.86;
      patch(7,12,(u,t)=>[center+(u-.5)*(.38+.20*t)+sign*(back?.29:-.22)*(1-t),
        (back?.077:.204)+(back?.266:.139)*t,
        .002+.025*Math.sin(Math.PI*u)**.62*(.67+.33*t)],
        (u,t)=>dye(u<.14?'#252d26':u>.85?'#878264':u>.65?'#555743':t>.78?'#706a4b':'#50533b'));
    }
    // Three fan folds over each scapula: deeply tucked at the armpit,
    // broader and flatter across the trapezius.
    for(let j=0;j<3;j++) {
      g.chart=(_u,t)=>[15,t,0]; // broad scapula layers
      patch(10,4,(u,t)=>[Math.PI+sign*(.22+1.38*u),.143+j*.057+.019*Math.sin(Math.PI*u)-.060*u+(t-.5)*.049,
        .001+.022*Math.sin(Math.PI*u)**.6*Math.sin(Math.PI*t)**.9],
        (u,t)=>blend('#252e27','#737553',.07+.58*Math.sin(Math.PI*t)**2+.17*u));
    }
  }
  g.chart=(_u,t)=>[11,t,0];
  patch(4, 14, (u, t) => [(u - .5) * .16, .04 + t * .285, .004 + .003 * u],
    (u, t) => blend('#3a4235', '#9e9674', .14 + .31 * u + .16 * bell(u - .72, .15) + .11 * t));
  // Stand collar with deep parted front and a worn outer binding.
  g.chart=(_u,t)=>[17,t,0];
  g.sheet(36, 5, (u, t) => {
    const a = (.11 + u * (TAU - .22)), front = Math.cos(a), tip = 1 - bell(a < Math.PI ? a : TAU - a, .66);
    const p = torso(a, .341 - .018 * Math.max(0, front), .002);
    const top = v(CREW_NECK[0] + .073 * Math.sin(a - bodyTurn), CREW_NECK[1] + .010 + .018 * tip,
      CREW_NECK[2] - .073 * Math.cos(a - bodyTurn));
    // torso turns to the right (its frontal axis is +X/-Z)
    p.lerp(top, t);
    return [p, blend('#30382e', '#98916b', .13 + .20 * t + .33 * bell(t - .93, .13))];
  }, false, true);
  g.chart=undefined;
}

function arms(g: PaintedSculpt) {
  const shade = (u: number, t: number) => .5 + .19 * Math.cos(u * TAU - .9) + .10 * Math.sin(u * TAU * 2 + t * 4);
  for (const [index, sign] of [-1, 1].entries()) {
    g.kind=0;
    g.chart=(_u,t)=>[19,t,0]; // sleeve above the rear grip
    const grip = v(...CREW_GRIPS[index]);
    const shoulder = torso(sign * Math.PI * .5, .29, -.046);
    const elbow = sign < 0 ? v(-.128, .143, -.25) : v(.413, .147, .050);
    const wrist = grip.clone().add(v(sign * .040, -.043, .039));
    const lerp = (a: T.Vector3, b: T.Vector3, t: number) => a.clone().lerp(b, t);
    const upper = [shoulder, lerp(shoulder, elbow, .12), lerp(shoulder, elbow, .25), lerp(shoulder, elbow, .39),
      lerp(shoulder, elbow, .49), lerp(shoulder, elbow, .56), lerp(shoulder, elbow, .62), lerp(shoulder, elbow, .65)];
    upper[1].y += .017; upper[2].y += .018;
    g.tube(upper, [.045,.087,.093,.084,.073,.080,.079,.059], [.041,.083,.086,.074,.068,.074,.071,.058],
      (u,t) => t>.73&&t<.92?dye('#77714f'):t>.93?dye('#383d30'):
        blend('#2c362b', '#84805b', .55*shade(u,t)+.17*Math.cos(u*TAU*4+t*5)+.16),20,v(1,0,0),
      (u,t)=>1+.095*Math.cos(u*TAU*4+t*5)*Math.sin(Math.PI*t)
        +.07*Math.cos(u*TAU*3-t*5)*bell(t-.38,.3));
    g.kind=1;
    // Faded rolled sleeve over a tapered upper arm, prominent olecranon,
    // extensor plane and thinner wrist. Path follows two distinct bent arms.
    const skin = (u: number, t: number) => {
      const forearm=.84*shade(u,t)-.20*bell(t-.32,.11);
      const ridge=bell(t-.64,.23)*Math.max(0,Math.cos(TAU*u+.38));
      return blend('#59453e','#c99e7d',forearm+.28*ridge);
    };
    const bent = new T.QuadraticBezierCurve3(lerp(shoulder,elbow,.73),elbow,lerp(elbow,wrist,.20));
    const arm = [lerp(shoulder,elbow,.63), ...bent.getPoints(6),
      lerp(elbow,wrist,.30),lerp(elbow,wrist,.52),lerp(elbow,wrist,.77),lerp(elbow,wrist,.94),wrist];
    // A fixed cross-section axis normal to the arm's bend avoids flipping the
    // two cross sections across the elbow (the old pointed triangular fold).
    const axis=elbow.clone().sub(shoulder).cross(wrist.clone().sub(elbow)).normalize();
    const limbChart=(kind:number)=>(u:number,t:number):[number,number,number]=>
      [kind+t,Math.cos(u*TAU),sign*Math.sin(u*TAU)];
    g.chart=limbChart(3);
    g.tube(arm,[.061,.063,.060,.058,.054,.052,.054,.058,.061,.052,.036,.025,.023],
      [.055,.055,.051,.049,.045,.043,.045,.047,.050,.042,.033,.024,.023], skin,16,axis,
      (u,t)=>1+(.20*Math.max(0,Math.cos(u*TAU+1.1-t*2.1))**5-.12*Math.max(0,Math.cos(u*TAU-1.31+t))**4)*bell(t-.69,.23));
    const palm = [lerp(elbow,wrist,.965),wrist,grip.clone().add(v(sign*.041,-.027,.029)),
      grip.clone().add(v(sign*.044,-.008,.021)),grip.clone().add(v(sign*.041,.009,.013)),
      grip.clone().add(v(sign*.037,.025,.008)),grip.clone().add(v(sign*.036,.028,.005))];
    g.chart=limbChart(7);
    g.tube(palm,[.023,.024,.023,.020,.016,.013,.008],[.024,.025,.028,.032,.033,.025,.014],skin,16,v(sign,0,0),
      (u,t)=>1+.14*Math.cos(u*TAU*2+.7)*bell(t-.48,.26));
    // Four pads curl across the external face, around the front of the grip.
    // Thumb returns above them from behind, leaving a real central opening.
    for (let j=0;j<4;j++) {
      const f=.029-j*.017, radius=[.0088,.0099,.0090,.0079][j];
      // The first two extend around the knurl, the little finger hooks
      // early. Knuckles make a descending arc rather than four stacked
      // parallel sausages. The separate thumb returns over the rear lip.
      const reach=[1.07,1.10,.91,.71][j],pitch=[.003,-.002,-.004,-.008][j];
      const finger=[[.041,.010],[.045,-.003],[.043,-.016],[.030,-.031],[.018,-.037],[.006,-.037],[-.004,-.032]];
      const ps=finger.map(([x,z],k)=>{
        const t=k/6;return grip.clone().add(v(sign*(x+(1-reach)*.043*t),f+pitch*t-.005*Math.sin(t*Math.PI),
          z*reach+.002*j-.002*Math.sin(t*Math.PI)));
      });
      g.chart=limbChart(1);
      g.tube(ps,[radius*.74,radius*1.20,radius*1.03,radius*1.15,radius*.84,radius*.82,radius*.46],
        [radius*.84,radius*1.23,radius*.90,radius*1.13,radius*.83,radius*.77,radius*.50],(u,t)=>{
          const top=Math.cos(u*TAU),outer=Math.sin(u*TAU)*sign;
          if(t>.70&&t<.94&&top>.32)return dye('#b99580'); // rubbed nail plate
          if(t>=.48&&t<=.52&&outer<-.14)return dye('#684c40'); // flexion crease
          return blend('#6b4d40','#d7a583',.34+.27*top+.12*outer+
            (t>.21&&t<.28?.24:0)-(t>.94?.10:0));
        },9,Y);
    }
    g.chart=limbChart(1);
    g.tube([[.035,-.012,.027],[.025,.008,.035],[.012,.023,.038],[-.004,.029,.032],[-.017,.025,.022],[-.021,.019,.015]]
      .map(([x,y,z])=>grip.clone().add(v(sign*x,y,z))),[.015,.015,.013,.012,.010,.004],[.015,.015,.013,.011,.010,.004],skin,10);
    g.chart=undefined;
  }
}

// The CVC-inspired shell has a low back skirt but is scalloped above the
// receiver pads. A separate brow lip and goggle strap interrupt its silhouette.
const SHELL = [
  [.104,.124,.146], [.132,.146,.150], [.139,.155,.158], [.134,.150,.166],
  [.128,.145,.181], [.128,.142,.198], [.121,.138,.216], [.112,.130,.233],
  [.101,.118,.250], [.084,.102,.265], [.059,.074,.277], [.030,.041,.284], [.001,.001,.286],
];
function shell(a:number, row:number, lift=0) {
  const i=Math.min(SHELL.length-2,Math.floor(row)), t=row-i;
  const [w,d,h]=SHELL[i].map((n,k)=>T.MathUtils.lerp(n,SHELL[i+1][k],t));
  const front=Math.cos(a), side=Math.sin(a), edge=(1-sat(row / 9))**1.54;
  const bill=.034*Math.max(0,front)**5 * (1-sat(Math.abs(row-2)/2.5));
  return v(side*(w+lift),h+edge*(.031*Math.max(0,front)**2-.023*Math.max(0,-front)**2
    +.014*Math.abs(side)**4)+.0014*side*w/.115, -.043-front*(d + lift + bill));
}
function helmet(g: PaintedSculpt) {
  const head=(p:T.Vector3)=>p.applyMatrix4(headFrame);
  g.kind=2;
  g.chart=(_u,t)=>[21,t,0];
  g.sheet(36,SHELL.length-1,(u,t)=>{
    const a=u*TAU,row=t*(SHELL.length-1);
    const crown=1-T.MathUtils.smoothstep(t,.45,1);
    const mottle=.40+crown*(.18*Math.sin(3*a+3.7*t)+.12*Math.sin(6*a-11*t)+.08*Math.sin(2*a+13*t));
    // A black lip return and one ochre sun edge hold the broad M1-shaped
    // brim apart from the face. A few large crown planes survive chase scale.
    const az=Math.round(u*24)/24*TAU;
    const sideLight=.45+.35*Math.cos(az+.65)+.18*t+.17*mottle;
    const color=row<1?dye('#232d29'):row<2?dye('#3c3c2d'):row<3?
      dye(Math.cos(az+.4)>-.34?'#8f815a':'#59573f'):row<4?dye('#424536'):
      blend('#303b2d','#797651',Math.round((sideLight-.10)*5)/5);
    return [head(shell(a,row)),color];
  },true,true);
  g.chart=undefined;
  // Raised elastic around the sloping shell. Three band colors make its
  // upper bead, textile face and lower contact shadow read in the rear view.
  g.kind=0;
  g.sheet(36,5,(u,t)=>{
    const a=u*TAU, row=3.4+1.38*Math.cos(a)+t*1.45;
    return [head(shell(a,row,.003+.002*Math.sin(Math.PI*t))),
      dye(t<.15?'#262b24':t>.78?'#776e4a':'#534d38')];
  },true,true);
  // Real panel seams partition the canvas-covered dome like the concept.
  for(const az of [.18,2.20,3.74,5.72]){
    const rows=[5.5,6.5,7.5,8.5,9.5,10.5,11.4];
    g.tube(rows.map((r,i)=>head(shell(az+.07*Math.sin(i*.5),r,.0017))),
      rows.map(()=>.0022),rows.map(()=>.0022),()=>dye('#52543c'),6);
  }
  // Each goggle is a single closed-outline, stepped bezel and convex lens,
  // not a flat decal on the crown. Rubber feet carry it proud of the brow.
  // A blue-grey upper reflection and dark lower half remain legible in profile.
  g.kind=3;
  for(const sign of [-1,1]) {
    const layers=[[.89,.002],[1,.010],[1,.027],[.91,.033],[.78,.031],[.73,.028],[.52,.033],[.02,.037]];
    g.chart=(u,t)=>{
      const j=Math.round(t*(layers.length-1)),rad=layers[j][0],a=u*TAU;
      const corner=(z:number)=>Math.sign(z)*Math.abs(z)**.60;
      return [5+t,corner(Math.cos(a))*rad,corner(Math.sin(a))*rad];};
    g.mark('goggle'+sign,()=>g.sheet(24,layers.length-1,(u,t)=>{
      const j=Math.round(t*(layers.length-1)),[rad,lift]=layers[j], ang=TAU*u;
      const corner=(z:number)=>Math.sign(z)*Math.abs(z)**.60;
      const x=corner(Math.cos(ang))*rad,y=corner(Math.sin(ang))*rad;
      const a=sign*.49+x*.44,row=6.67+y*2.00+sign*x*.37;
      const p=shell(a,row,lift);p.y+=lift*.59;
      const slash=Math.abs(y+.44*x-.35);
      const glass=blend('#18272d','#829e9c',.13+.25*sat(y+.47)+
        (slash<.18&&x>-.45?.42:0)-(y<-.35?.10:0));
      return [head(p),j<2?dye('#292e2a'):j===2?dye('#4e4b37'):j===3?
        dye(y>-.2?'#9f987c':'#625f50'):j===4?dye('#222e30'):glass];
    },true,true));
    g.chart=undefined;
    const bail=[v(sign*.119,.166,-.015),v(sign*.127,.160,-.024),v(sign*.127,.138,-.039)];
    g.tube(bail.map(head),[.008,.008,.007],[.011,.010,.009],()=>dye('#4f4937'),8);
    // Flat-sided receiver shell, raised lip, inset plate and center cap.
    // Width and the asymmetric lower cable outlet interrupt the head outline.
    const cup=[[.085,.79],[.095,1],[.108,1.02],[.119,.91],[.129,.83],[.135,.77],[.135,.60],[.137,.53],[.138,.12],[.139,.02]];
    g.mark('receiver'+sign,()=>g.sheet(20,cup.length-1,(u,t)=>{
      const j=Math.round(t*(cup.length-1)),[x,r]=cup[j],a=u*TAU;
      const y=Math.sin(a)*r,z=Math.cos(a)*r;
      const p=v(sign*x,.124+y*.053,-.023+z*.041+y*.004);
      return [head(p),j<3?dye('#252d29'):j===3?dye('#605c47'):j===4?dye('#303735'):
        j===5?dye('#797967'):j===6?dye('#535a50'):blend('#353d39','#7a7c6c',.32+.26*y)];
    },true,sign>0));
    const keeper=[v(sign*.124,.170,.028),v(sign*.132,.177,.021),v(sign*.131,.191,.020),v(sign*.122,.194,.027)];
    g.tube(keeper.map(head),[.005,.006,.006,.005],[.007,.007,.007,.007],()=>dye('#8c8465'),8);
  }
  g.tube([v(-.013,.219,-.201),v(0,.224,-.205),v(.013,.219,-.201)].map(head),
    [.008,.007,.008],[.007,.006,.007],()=>dye('#48493b'),8);
  // Mount the flexible boom to the visible receiver on the +X side.
  g.tube([v(.129,.105,-.036),v(.136,.094,-.058),v(.124,.076,-.106),v(.098,.070,-.149),v(.066,.069,-.165)]
    .map(head),[.0046,.0045,.004,.004,.004],[.0046,.0045,.004,.004,.004],()=>dye('#292e2a'),8);
  g.oval(v(.061,.069,-.165),v(.014,.008,.009),()=>dye('#333a34'),headFrame);
  const wire=[head(v(.105,.096,-.021)),head(v(.102,.070,.007)),head(v(.091,.046,.032)),
    torso(2.29,.326,.010),torso(2.55,.262,.011),torso(2.38,.206,.010)];
  g.tube(wire,[.004,.004,.004,.004,.004,.004],[.004,.004,.004,.004,.004,.004],
    (u)=>blend('#333a30','#676849',.37+.18*Math.sin(u*TAU)),8);
}

export function createTankCrewPortrait() {
  const sculpt=new PaintedSculpt();
  vest(sculpt);const armsStart=sculpt.p.length/3;
  arms(sculpt);const helmetStart=sculpt.p.length/3;
  helmet(sculpt);const g=sculpt.finish();
  // CPU inspection ranges only. No material groups, skinning or animation.
  g.userData.surfaceStations={armsStart,helmetStart};
  return g;
}
