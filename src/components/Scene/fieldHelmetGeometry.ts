import { BufferGeometry, Color, Float32BufferAttribute, MathUtils, Vector3 } from 'three';

type FieldHelmetOptions = { headY: number; variant: number; crewman?: boolean; fieldUniform?: boolean };
type Ring = {
  width: number;
  depth: number;
  height: number;
  sweep: number;
  finish: 'canvas' | 'webbing' | 'binding' | 'steel' | 'liner';
};

// Front is -Z. The upper plates spread into a shallow crown; the inward turn
// beneath the steel lip leaves a real aperture instead of capping it with a disc.
const RINGS: readonly Ring[] = [
  {width: .023, depth: .032, height: .155, sweep: .01, finish: 'canvas'},
  {width: .046, depth: .060, height: .148, sweep: .02, finish: 'canvas'},
  {width: .066, depth: .087, height: .137, sweep: .045, finish: 'canvas'},
  {width: .086, depth: .108, height: .121, sweep: .08, finish: 'canvas'},
  {width: .102, depth: .125, height: .100, sweep: .19, finish: 'canvas'},
  {width: .112, depth: .135, height: .081, sweep: .45, finish: 'canvas'},
  {width: .117, depth: .140, height: .064, sweep: .69, finish: 'canvas'},
  {width: .119, depth: .142, height: .051, sweep: .81, finish: 'canvas'},
  {width: .121, depth: .143, height: .050, sweep: .82, finish: 'webbing'},
  {width: .122, depth: .144, height: .041, sweep: .91, finish: 'webbing'},
  {width: .120, depth: .142, height: .040, sweep: .92, finish: 'canvas'},
  {width: .122, depth: .143, height: .031, sweep: 1, finish: 'binding'},
  {width: .122, depth: .143, height: .028, sweep: 1, finish: 'steel'},
  {width: .117, depth: .138, height: .025, sweep: 1, finish: 'steel'},
  {width: .110, depth: .131, height: .026, sweep: 1, finish: 'liner'},
  {width: .103, depth: .119, height: .061, sweep: .68, finish: 'liner'},
];

// Section cut through the regular field shell (width/depth changes in metres).
// The cover pulls in beneath its elastic and rolls out again over stamped
// steel. A short shelf at the brow matters more than widening the entire dome.
// The inner liner at the bail is the original fit used by the chinstrap.
const FIELD_SECTION = [
  [ .009,  .010], [ .012,  .011], [ .014,  .013], [.013, .013],
  [ .010,  .010], [ .008,  .005], [ .006,  .003], [ .005,  .002],
  [ .005,  .002], [ .005,  .002], [ .004, .002],
  [ .016, .011], [ .016,  .012], [ .013, .008], [.005, .004], [0, 0],
] as const;
const FIELD_RINGS = RINGS.map((ring, i) => ({
  ...ring, width: ring.width + FIELD_SECTION[i][0], depth: ring.depth + FIELD_SECTION[i][1],
}));

const FOLIAGE_COLORS = ['#3f4d36', '#807b54', '#8b704e', '#56634a'].map(value => new Color(value));
const FIELD_LEAVES = ['#384532','#ac9868','#795a3b','#65704e'].map(value=>new Color(value));

// Hand-placed two-dimensional shapes on the shell. Overlapping lobes break up
// the paint along the crown and brow, with much of the ground cloth left clear.
// [angle, height, angular reach, vertical reach, tilt, swatch]
const CAMOUFLAGE = [
  [-.22, .123, .49, .027, -.44, 1], [.15, .095, .37, .022, .55, 0],
  [-.60, .073, .52, .026, -.29, 2], [-1.15, .108, .38, .027, .46, 0],
  [-1.65, .082, .46, .024, -.65, 1], [-2.30, .123, .38, .021, -.57, 2],
  [-2.67, .083, .54, .027, .48, 0], [-3.08, .056, .49, .018, -.63, 3],
  [.78, .132, .48, .021, .56, 2], [.71, .054, .47, .024, -.34, 0],
  [1.39, .101, .50, .027, -.57, 1], [1.96, .054, .55, .019, .48, 3],
  [2.23, .089, .43, .027, .37, 2], [2.73, .131, .45, .019, -.45, 0],
] as const;

function leafCoverage(azimuth: number, height: number, entry: typeof CAMOUFLAGE[number]) {
  const [centerAngle, centerHeight, breadth, reach, lean] = entry;
  const difference = azimuth - centerAngle;
  const x = Math.atan2(Math.sin(difference), Math.cos(difference)) / breadth;
  const y = (height - centerHeight) / reach - x * lean;
  const leaf = 1.03 - x * x * (1.25 + Math.abs(y) * .22) - y * y;
  const lobes = Math.cos(y * 8.0 + Math.abs(x) * 5.5) * .23;
  return MathUtils.smoothstep(leaf + lobes, .03, .20);
}

export function createFieldHelmetGeometry({ headY, variant, crewman = false, fieldUniform = false }: FieldHelmetOptions): BufferGeometry {
  const segments = crewman ? 32 : 34;
  const field = fieldUniform && !crewman;
  const rings = field ? FIELD_RINGS : RINGS;
  const position: number[] = [], colors: number[] = [], indices: number[] = [];
  const canvas = new Color(crewman ? '#535741' : variant % 3 === 1 ? '#626644' : '#666e4e');
  const webbing = new Color(variant % 3 === 2 ? '#645e40' : '#515437');
  const binding = new Color('#827b54');
  const steel = new Color('#565b47'), abrasions = new Color('#a49b75');
  const liner = new Color('#5d5a43');
  // Field covers bleach on the convex crown; the elastic below stays olive.
  // This broad/small pairing survives when the whole helmet is a few pixels.
  const thread = new Color(fieldUniform ? '#c3c09c' : '#96916d');
  const crownWear = field ? .29 : fieldUniform ? .55 : .18;
  const crease = new Color('#393b29');
  const patchEdge = new Color('#85795a');
  const pigment = new Color();

  function point(ring: Ring, angle: number, lift = 0) {
    const lateral = Math.sin(angle), forward = Math.cos(angle);
    const templeDip = Math.abs(lateral) ** 2.3 * .022;
    const rearDip = Math.max(0, -forward) ** 2 * (field?.032:.020);
    const visor = Math.max(0, forward) ** 3;
    // Fit the front curve independently of the rear/temple skirt. A lifted
    // brow arc exposes the eye socket; it isn't a long visor cast in shadow.
    const fittedBrow = MathUtils.smoothstep(forward, .19, .97) * ring.sweep;
    const bias = lateral * .0019 - forward * .0027;
    const cuffPull = (center: number, spread: number) => {
      const distance = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
      return Math.exp(-((distance / spread) ** 2));
    };
    const fold = cuffPull(-1.22 - ring.height * 3.6, .29) * .0019 + cuffPull(1.03, .22) * .0012;
    const canvasPull = Math.sin(angle * 3 + ring.height * 19) * .00105;
    // Fullness shifts between the four sewn panels instead of reading
    // as a steel dome with a thin elastic strip. Keep the fitted brim.
    const ease = field && ring.finish==='canvas'
      ? MathUtils.smoothstep(ring.height,.051,.076)*(1-MathUtils.smoothstep(ring.height,.124,.150))
      : 0;
    const pleats = .0046*Math.sin(5*angle+19*ring.height) + .0023*Math.sin(9*angle-28*ring.height);
    const drape = (ring.finish === 'canvas' ? (canvasPull - fold) * ring.sweep : 0) + ease*(.0015+pleats);
    const rim = field && (ring.finish === 'binding' || ring.finish === 'steel') ? 1 : 0;
    // Flatten the metal pot above the temples, not the brow channel or liner.
    // Two gathered skirt returns lift and dent local arcs of the edge; the
    // rim still wraps the head, but no longer reads as a circular extrusion.
    const crownCompression = field ? .022 * MathUtils.smoothstep(ring.height, .078, .15715) : 0;
    const hem=field?ring.sweep**2*(.0062*cuffPull(-.82,.26)-.0046*cuffPull(2.30,.31)+.0025*cuffPull(.64,.20)):0;
    const dent=field?ring.sweep*(.0050*cuffPull(-1.96,.26)+.0024*cuffPull(.66,.29)):0;
    return new Vector3(
      .010 + lateral * (ring.width + drape + lift-dent) + (field?.0041*Math.sin(angle*2)*ease:0),
      headY + ring.height + (visor * .018 - templeDip - rearDip + bias) * ring.sweep
        + .0136 * fittedBrow + lift * .4 - crownCompression - rim * .0021 * visor + hem,
      -.022 - forward * (ring.depth - visor * .004 * ring.sweep + drape + lift-dent + rim * .008 * visor) + .0150 * fittedBrow,
    );
  }

  function write(vertex: Vector3, color: Color) {
    const index = position.length / 3;
    position.push(vertex.x, vertex.y, vertex.z);
    colors.push(color.r, color.g, color.b);
    return index;
  }

  for (const [row, ring] of rings.entries()) {
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const pointOnShell = point(ring, angle);
      const canopyLight = MathUtils.smoothstep(ring.height, .03, .155);
      const faceLight = .86 + .15 * (.5 + .5 * Math.cos(angle + .67));
      if (ring.finish === 'canvas') {
        pigment.copy(canvas);
        const rotation = variant * .46;
        for (const patch of CAMOUFLAGE) {
          const opacity = leafCoverage(angle + rotation, ring.height, patch);
          pigment.lerp((field?FIELD_LEAVES:FOLIAGE_COLORS)[patch[5]], opacity * (crewman ? .55 : .98));
        }
        // Sun-faded painted crown and restrained cool shade on the skirt.
        // Vary sun wash BY cloth panel, retaining the subdued dyed pattern on
        // the lit side. An even bleached cap loses almost all its pattern.
        const fade = field ? .85 + .15 * Math.cos(angle * 2 - .78) : 1;
        pigment.lerp(thread, canopyLight * crownWear * fade * (field ? .54 : 1));
        const clothTuck = MathUtils.smoothstep(ring.height, .054, .070)
          * (1 - MathUtils.smoothstep(ring.height, .080, .106));
        pigment.lerp(crease, clothTuck * (.08 + .07 * Math.cos(angle - .73) ** 2));
        pigment.multiplyScalar((.93 + canopyLight * .15) * faceLight);
      } else if (ring.finish === 'webbing') {
        pigment.copy(webbing).multiplyScalar((row === 8 ? 1.12 : .94) * faceLight);
        // A few rubbed areas along the sewn canvas band, weighted to the brow.
        const fray = Math.max(0, Math.cos(angle * 7 + 1.8)) ** 7;
        pigment.lerp(patchEdge, fray * (.14 + .26 * Math.max(0, Math.cos(angle))));
      } else if (ring.finish === 'binding') {
        const browWear = Math.max(0, Math.cos(angle + .27)) ** 3;
        pigment.copy(binding).multiplyScalar(faceLight * (.67 + .25 * browWear));
      } else {
        pigment.copy(ring.finish === 'steel' ? steel : liner).multiplyScalar(faceLight);
        if (row === 12) pigment.lerp(abrasions, .21 * Math.max(0, Math.cos(angle + .32)) ** 2
          + .31 * Math.max(0, Math.cos(angle * 2.3 + 2.1)) ** 5);
        if (row === 13) pigment.multiplyScalar(.91);
      }
      write(pointOnShell, pigment);
      if (row === rings.length - 1) continue;
      const a = row * segments + i, b = row * segments + (i + 1) % segments;
      indices.push(a, b, a + segments, b, b + segments, a + segments);
    }
  }

  const pole = write(new Vector3(.010, headY + .15715 - (field ? .022 : 0), -.022), pigment.copy(canvas).lerp(thread, crownWear));
  for (let i = 0; i < segments; i++) indices.push(pole, (i + 1) % segments, i);

  // Sample directly on a face of the low-poly shell. Select paint accents can
  // then have a deliberate edge without raising the whole shell's mesh density.
  const inkNormals: {vertex: number; base: number[]; weights: number[]}[] = [];
  function paintedPoint(angle: number, height: number) {
    const rotation = MathUtils.euclideanModulo(angle, Math.PI * 2) / (Math.PI * 2) * segments;
    const column = Math.floor(rotation);
    const u = rotation - column;
    const upper = rings.findIndex((ring, row) => row < 7 && ring.height >= height && rings[row + 1].height < height);
    const row = Math.max(0, upper);
    const v = MathUtils.clamp(MathUtils.inverseLerp(rings[row].height, rings[row + 1].height, height), 0, 1);
    const a = row * segments + column;
    const b = row * segments + (column + 1) % segments;
    const c = (row + 1) * segments + column;
    const d = (row + 1) * segments + (column + 1) % segments;
    const base = [u + v <= 1 ? a : d, b, c];
    const weights = u + v <= 1 ? [1 - u - v, u, v] : [u + v - 1, 1 - v, 1 - u];
    const shell = new Vector3();
    const sample = new Vector3();
    const cloth = new Color(0, 0, 0);
    for (let i = 0; i < 3; i++) {
      const offset = base[i] * 3;
      shell.addScaledVector(sample.fromArray(position, offset), weights[i]);
      cloth.r += colors[offset] * weights[i];
      cloth.g += colors[offset + 1] * weights[i];
      cloth.b += colors[offset + 2] * weights[i];
    }
    const outward = new Vector3(Math.sin(angle), .42, -Math.cos(angle)).normalize();
    return {shell: shell.addScaledVector(outward, .0015), base, weights, cloth};
  }

  function writeInk(angle: number, height: number, color: Color, soften: number) {
    const {shell, base, weights, cloth} = paintedPoint(angle, height);
    const vertex = write(shell, color.lerp(cloth, soften));
    inkNormals.push({vertex, base, weights});
    return vertex;
  }

  const patternEdge = new Color('#948358');
  const motif = [[-.91, -.11], [-.73, .14], [-.52, .14], [-.42, .33], [-.17, .32], [.02, .64],
    [.33, .49], [.56, .53], [.92, .29], [.72, .09], [.56, .10], [.29, -.25], [.04, -.32],
    [-.18, -.44], [-.46, -.25], [-.76, -.27]];
  for (const [angle, y, width, height, color] of [
    [-.36, .089, .20, .019, 2], [-1.76, .101, .23, .024, 1], [.94, .112, .22, .023, 0], [2.55, .090, .23, .026, 3],
  ]) {
    const shift = angle - variant * .39;
    // Two pieces of gathered cover tucked into the elastic. These are solid
    // folded cloth, not flat camo decals or floating leaves. Their two turned
    // corners attach to the shell, with a shadowed centre fold and a worn
    // selvage. Re-spend two existing sixteen-triangle paint stamps on these.
    if(field && (color===1 || color===0)){
      const sections=[[.0513,.021,.0002],[.065,.100,.0022],[.083,.106,.0045],
        [.103,.068,.0060],[.114,.012,.0011]];
      const tape=new Color(variant%2?'#8a805a':'#8a865e');
      const verts:number[][]=[];
      for(const [j,[alt,w,bulge]] of sections.entries()){
        const az=shift-.25+(j/4)*.41;
        const stripe:number[]=[];
        for(const u of [-1,0,1]){
          const {shell,base,weights}=paintedPoint(az+w*u,alt+.002*u);
          const n=new Vector3(Math.sin(az+w*u),.33,-Math.cos(az+w*u)).normalize();
          shell.addScaledVector(n,bulge*(u===0?1:.08)-.0009);
          const shade=u===0?1.08:u===-1?.69:.80;
          const v=write(shell,pigment.copy(tape).multiplyScalar(shade*(j===0?.69:1)));
          inkNormals.push({vertex:v,base,weights});stripe.push(v);
        }
        verts.push(stripe);
        if(j)for(let u=0;u<2;u++){
          const lo=verts[j-1],hi=stripe;
          indices.push(lo[u],hi[u],lo[u+1],lo[u+1],hi[u],hi[u+1]);
        }
      }
      continue;
    }
    const swatch = (field?FIELD_LEAVES:FOLIAGE_COLORS)[color];
    const middle = writeInk(shift, y, pigment.copy(swatch), field ? .09 : crewman ? .51 : .13);
    for (const [x, z] of motif) {
      pigment.copy(swatch).lerp(patternEdge, z > .30 ? .14 : .025).multiplyScalar(z < -.14 ? .83 : 1.03);
      writeInk(shift + x * width*(field?1.54:1), y + z * height*(field?1.45:1), pigment, field ? .13 + Math.abs(x) * .12 : crewman ? .57 : .16 + Math.abs(x) * .10);
    }
    for (let i = 0; i < motif.length; i++) indices.push(middle, middle + 1 + i, middle + 1 + (i + 1) % motif.length);
  }

  // Twin cloth panel seams pass over the crown, with a narrow raised stitch
  // edge over a shaded butt seam. Both tracks conform to the sculpted shell.
  const seamLift = .0011;
  for (const side of [0, Math.PI]) {
    for (let row = 0; row < 8; row++) {
      const ring = rings[row];
      const center = side + .11 - Math.sin(row / 8 * Math.PI) * .12 +
        (field?(side===0?-.28:.23)*row/7 + .075*Math.sin(row*.84+side):0);
      const delta = (field?.0015+.00055*Math.sin(row*1.45+side):.00135) / ring.width;
      const i = write(point(ring, center - delta, seamLift), crease);
      write(point(ring, center + delta, seamLift), pigment.copy(thread).lerp(canvas, row % 3 === 1 ? .56 : .25));
      if (row < 7) indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }

  // Four short foliage slits with painted shadow and one highlighted cloth edge.
  for (const [row, center] of [[3, -1.09], [4, .91], [4, 2.31], [5, -2.55]]) {
    const ring = rings[row];
    const width = .013 / ring.width;
    const a = write(point(ring, center - width, .0015), patchEdge);
    write(point(ring, center + width * .88, .0015), thread);
    const lower = { ...ring, height: ring.height - .0028, width: ring.width + .00115, depth: ring.depth + .0011 };
    write(point(lower, center - width * .8, .0016), crease);
    write(point(lower, center + width, .0016), crease);
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const shared = new BufferGeometry();
  shared.setAttribute('position', new Float32BufferAttribute(position, 3));
  shared.setAttribute('color', new Float32BufferAttribute(colors, 3));
  shared.setIndex(indices);
  shared.computeVertexNormals();
  const normals = shared.getAttribute('normal');
  const normal = new Vector3();
  const current = new Vector3();
  for (const {vertex, base, weights} of inkNormals) {
    normal.set(0, 0, 0);
    for (let i = 0; i < 3; i++) normal.addScaledVector(current.fromBufferAttribute(normals, base[i]), weights[i]);
    normal.normalize();
    normals.setXYZ(vertex, normal.x, normal.y, normal.z);
  }
  const geometry = shared.toNonIndexed();
  shared.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
