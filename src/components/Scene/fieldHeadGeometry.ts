import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = [number, number, number];
type Section = [height: number, width: number, face: number, back: number];
type Paint = (position: Point, normal: THREE.Vector3) => THREE.Color;

// Cross sections through anatomical landmarks, from the throat to crown.
// X is the half-width, Z is depth, and the neutral gaze points along -Z.
const CRANIAL_SECTIONS: Section[] = [
  [-.128, .024, -.046, .021], [-.120, .031, -.067, .030],
  [-.107, .041, -.099, .042], [-.092, .051, -.109, .052],
  [-.077, .057, -.110, .061], [-.066, .063, -.112, .066],
  [-.057, .069, -.113, .069], [-.047, .074, -.114, .071],
  [-.036, .079, -.113, .072], [-.026, .083, -.110, .073],
  [-.016, .086, -.109, .073], [-.006, .088, -.108, .074],
  [ .004, .088, -.107, .075], [ .014, .087, -.108, .075],
  [ .023, .086, -.110, .074], [ .033, .086, -.112, .073],
  [ .043, .086, -.111, .072], [ .057, .087, -.111, .071],
  [ .077, .083, -.107, .064], [ .096, .072, -.095, .056],
  [ .110, .053, -.077, .046], [ .119, .027, -.056, .030],
];
const AXIS_X = .012;
// Only the rear of the low VC neck carries this overlap into the collar.
// Keep the new forward jaw clear of the larger underlying neck connector.
const REAR_COLLAR_ALLOWANCE = [
  [.002, .003], [.006, .007], [.008, .007], [.007, .006],
  [.006, .002], [.004, .001], [.002, 0], [.001, 0],
] as const;

interface FaceDesign {
  width: number; jaw: number; chin: number; nose: number; noseWidth: number;
  cheek: number; brow: number; set: number; eyeY: number; eyeWidth: number;
  openL: number; openR: number; expression: number; gaze: number;
  lipWidth: number; mouthY: number; corner: number; parting: number;
}

// Faces are authored profiles, not one neutral mask recolored by faction.
// A single gaze direction is shared across both eyes; brow/lid tension isn't.
const DESIGNS: Record<'us' | 'vc', FaceDesign[]> = {
  us: [
    {width: 1.015, jaw: 1.04, chin: -.002, nose: 1.02, noseWidth: .98, cheek: 1.08, brow: 1.17,
      set: .0334, eyeY: .012, eyeWidth: .0165, openL: .86, openR: 1.02, expression: .87, gaze: -.002,
      lipWidth: .0254, mouthY: -.058, corner: .0027, parting: .0006},
    {width: 1.046, jaw: 1.15, chin: .001, nose: .79, noseWidth: 1.22, cheek: .74, brow: .91,
      set: .0347, eyeY: .0143, eyeWidth: .0162, openL: 1.04, openR: .99, expression: .42, gaze: .0014,
      lipWidth: .0268, mouthY: -.060, corner: -.0014, parting: .0021},
    {width: .961, jaw: .95, chin: -.004, nose: 1.16, noseWidth: .81, cheek: 1.20, brow: 1.09,
      set: .0315, eyeY: .014, eyeWidth: .0163, openL: 1.03, openR: .78, expression: .68, gaze: -.0033,
      lipWidth: .0234, mouthY: -.058, corner: -.003, parting: .0011},
  ],
  vc: [
    {width: .965, jaw: .89, chin: .006, nose: .90, noseWidth: 1.08, cheek: 1.24, brow: .97,
      set: .0321, eyeY: .014, eyeWidth: .0164, openL: 1.01, openR: .88, expression: .65, gaze: .0013,
      lipWidth: .0259, mouthY: -.058, corner: .0026, parting: .0011},
    {width: 1.012, jaw: .99, chin: .004, nose: .78, noseWidth: 1.23, cheek: .82, brow: .87,
      set: .0338, eyeY: .0157, eyeWidth: .0165, openL: 1.06, openR: 1.09, expression: .41, gaze: -.0018,
      lipWidth: .0275, mouthY: -.061, corner: .0014, parting: .0023},
    {width: .964, jaw: .87, chin: .002, nose: 1.04, noseWidth: .92, cheek: 1.22, brow: 1.22,
      set: .0310, eyeY: .012, eyeWidth: .0159, openL: .82, openR: .98, expression: 1.0, gaze: .0024,
      lipWidth: .0237, mouthY: -.060, corner: -.0019, parting: .0006},
  ],
};

function gaussian(value: number, center: number, width: number) {
  return Math.exp(-(((value - center) / width) ** 2));
}

function featureDepth(x: number, y: number, angle: number, design: FaceDesign) {
  const cos = Math.cos(angle);
  if (cos <= 0) return 0;
  const side = Math.abs(x);
  const squeeze = (x < 0 ? design.openL : design.openR);
  const noseX = x - design.corner * .54;
  const root = (.004 + design.expression * .001) * gaussian(noseX, 0, .014) * gaussian(y, .032, .016);
  const noseBridge = .0145 * gaussian(noseX, 0, .0145 * design.noseWidth - Math.max(0, y) * .06) * gaussian(y, .005, .034);
  const noseTip = .0225 * gaussian(noseX, 0, .0143 * design.noseWidth) * gaussian(y, -.024, .0145);
  const noseWings = .0078 * gaussian(Math.abs(noseX), .0149 * design.noseWidth, .0083) * gaussian(y, -.029, .012);
  const eyeSocket = .0107 * gaussian(side, design.set, .0195)
    * gaussian(y + (side - design.set) * .08, design.eyeY, .0175 + .003 * squeeze);
  const temple = .005 * gaussian(side, .075, .014) * gaussian(y, .027, .028);
  const browY = design.eyeY + .019 + (side - design.set) * (.15 + design.expression * .11)
    - (1 - squeeze) * .0049;
  const brow = .0105 * gaussian(side, design.set - .003, .026) * gaussian(y, browY, .0162);
  const orbitalRim = .0034 * gaussian(side, .055, .015) * gaussian(y, .014, .0165);
  // A round high cheekbone links to the lower lid and falls on a diagonal
  // toward the mouth; the inner pad has a distinct and softer return.
  const cheek = design.cheek * (.0128 * gaussian(side, .053, .0195)
    * gaussian(y - (side - .0495) * .46, -.012, .0165)
    + .0059 * gaussian(side, .042, .020) * gaussian(y, -.034, .023));
  const noseFold = .0023 * gaussian(side, .025 - .30 * (y + .038), .009) * gaussian(y, -.048, .022);
  const hollow = .0054 * gaussian(side, .0675, .0165) * gaussian(y, -.051 + (side - .06) * .36, .022);
  const jowl = .0021 * gaussian(side, .050, .019) * gaussian(y, -.075, .021);
  const mouthX = x - design.corner * .35;
  const lipCorner = .0045 * design.expression * gaussian(side, design.lipWidth, .0095)
    * gaussian(y, design.mouthY - .0025 - Math.sign(x) * design.corner, .0105);
  const muzzle = .0070 * gaussian(mouthX, 0, .0275) * gaussian(y, design.mouthY + .002, .020);
  const philtrum = .0026 * gaussian(mouthX, 0, .006) * gaussian(y, -.044, .010);
  const lowerLipBreak = .0043 * gaussian(mouthX, 0, .0235) * gaussian(y, design.mouthY - .017, .012);
  const chin = .0077 * gaussian(x, 0, .024) * gaussian(y, -.097, .017);
  return (eyeSocket + temple + hollow + lowerLipBreak + philtrum + noseFold + lipCorner - design.brow * brow
    - orbitalRim - cheek - jowl - design.nose * (root + noseBridge + noseTip + noseWings)
    - muzzle - chin) * THREE.MathUtils.smoothstep(cos, 0, .66);
}

function createPolygonMesh(vertices: Point[], triangles: number[], paint: Paint, cranialColumns = 0) {
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  mesh.setIndex(triangles);
  mesh.computeVertexNormals();
  const normals = mesh.getAttribute('normal');
  if (cranialColumns > 0) {
    // The face places more columns around the eyes than behind the ear.
    // Equal-weight tangents keep larger back triangles from flattening the
    // temple normals; indexed topology and the hand-placed shapes are intact.
    const center = new THREE.Vector3(), point = new THREE.Vector3(), edge = new THREE.Vector3();
    const across = new THREE.Vector3(), up = new THREE.Vector3();
    const rows = vertices.length / cranialColumns;
    for (let row = 1; row < rows - 1; row++) for (let column = 0; column < cranialColumns; column++) {
      const ring = row * cranialColumns;
      const index = ring + column;
      const before = ring + (column + cranialColumns - 1) % cranialColumns;
      const after = ring + (column + 1) % cranialColumns;
      center.fromArray(vertices[index]);
      across.copy(center).sub(point.fromArray(vertices[before])).normalize()
        .add(edge.fromArray(vertices[after]).sub(center).normalize());
      up.copy(center).sub(point.fromArray(vertices[index - cranialColumns])).normalize()
        .add(edge.fromArray(vertices[index + cranialColumns]).sub(center).normalize());
      up.cross(across).normalize();
      normals.setXYZ(index, up.x, up.y, up.z);
    }
  }
  const color = new Float32Array(vertices.length * 3);
  const normal = new THREE.Vector3();
  for (let i = 0; i < vertices.length; i++) {
    normal.fromBufferAttribute(normals, i);
    paint(vertices[i], normal).toArray(color, i * 3);
  }
  mesh.setAttribute('color', new THREE.BufferAttribute(color, 3));
  const geometry = mesh.toNonIndexed();
  mesh.dispose();
  return geometry;
}

function assembleRings(rowCount: number, columnCount: number, inward = false) {
  const triangles: number[] = [];
  for (let row = 1; row < rowCount; row++) {
    for (let col = 0; col < columnCount; col++) {
      const bottom = (row - 1) * columnCount + col;
      const bottomNext = (row - 1) * columnCount + (col + 1) % columnCount;
      const top = bottom + columnCount, topNext = bottomNext + columnCount;
      if (inward) triangles.push(bottom, bottomNext, top, top, bottomNext, topNext);
      else triangles.push(bottom, top, bottomNext, top, topNext, bottomNext);
    }
  }
  return triangles;
}

/** Original low-resolution sculpt with contour-aligned paint; one draw with the infantry body. */
export function createFieldHeadGeometry(headY: number, skin: string, variant: number, faction: 'us' | 'vc') {
  const style = ((variant % 3) + 3) % 3;
  const local = faction === 'vc';
  const design = DESIGNS[faction][style];
  const widthScale = design.width;
  const eyeSlope = [.047, .08, .025][style] + (local ? .025 : 0);
  const stubbleStrength = [.48, .12, .34][style] * (local ? .49 : 1);
  const base = new THREE.Color(skin);
  const warm = base.clone().lerp(new THREE.Color(local ? '#b77153' : '#c87563'), .47);
  const lit = base.clone().lerp(new THREE.Color(local ? '#e9b88b' : '#eac2a3'), .41);
  const recess = base.clone().lerp(new THREE.Color(local ? '#584842' : '#52444e'), .49).multiplyScalar(.86);
  const shadowPlane = base.clone().lerp(new THREE.Color(local ? '#7c6656' : '#7e6770'), .47);
  const beardPlane = base.clone().lerp(new THREE.Color(local ? '#656656' : '#596370'), .46);
  const templePlane = base.clone().lerp(new THREE.Color(local ? '#797b66' : '#887383'), .44);
  const ink = base.clone().lerp(new THREE.Color('#312a27'), .81);
  const stubble = base.clone().lerp(new THREE.Color('#484146'), .48);
  const hair = new THREE.Color(local ? '#252923' : ['#3b3324', '#252723', '#4c392a'][style]);
  const hairEdge = hair.clone().lerp(new THREE.Color(local ? '#595646' : '#64564e'), .54);
  const hairPaint = new THREE.Color();
  const cheekAccent = base.clone().lerp(new THREE.Color(local ? '#eaad7a' : '#e7aa91'), .47);
  const redPlane = base.clone().lerp(new THREE.Color(local ? '#a75d49' : '#ad5c55'), .51);
  // Spend the topology on the visible look and lip shapes, not covered scalp.
  const columns = 31;
  const frontColumns = 22;
  const pointColors = new THREE.Color();
  const sections = CRANIAL_SECTIONS.map(([y, width, front, back], row) => {
    const jaw = 1 + (design.jaw - 1 - (local ? .032 : 0)) * gaussian(y, -.089, .042);
    const chin = design.chin * gaussian(y, -.100, .031);
    const centerZ = (front + back + chin) * .5;
    const collar = local ? REAR_COLLAR_ALLOWANCE[row] : undefined;
    return Array.from({ length: columns }, (_, col): Point => {
      const angle = col < frontColumns
        ? -Math.PI / 2 + Math.PI * col / frontColumns
        : Math.PI / 2 + Math.PI * (col - frontColumns) / (columns - frontColumns);
      const cos = Math.cos(angle);
      const asymmetry = design.corner * .57 * gaussian(y, -.086, .055);
      const contact = collar ? THREE.MathUtils.smoothstep(-cos, -.23, .32) : 0;
      const x = Math.sin(angle) * (width + contact * (collar?.[0] ?? 0)) * widthScale * jaw + asymmetry;
      const frontCurve = .76 + .13 * gaussian(y, -.087, .031);
      const faceProfile = Math.abs(cos) ** (cos >= 0 ? frontCurve : .86);
      const z = centerZ + (cos >= 0 ? front + chin - centerZ : back - centerZ) * faceProfile
        + contact * (collar?.[1] ?? 0) * (.5 + .5 * faceProfile);
      return [x, y, z + featureDepth(x, y, angle, design)];
    });
  });
  const rings = sections.flat();
  const tris = assembleRings(sections.length, columns);
  // Caps close the neck and scalp outside the visible face.
  for (let col = 1; col < columns - 1; col++) {
    tris.push(0, col, col + 1);
    const top = rings.length - columns;
    tris.push(top, top + col + 1, top + col);
  }

  function paintSkin([x, y, z]: Point, normal: THREE.Vector3) {
    const a = Math.abs(x);
    const face = THREE.MathUtils.smoothstep(-z, .036, .098);
    const cheek = gaussian(a, .051, .025) * gaussian(y, -.018, .025) * face;
    const nose = gaussian(x, 0, .025) * gaussian(y, -.027, .025) * face;
    const socket = gaussian(a, design.set, .021) * gaussian(y, design.eyeY + .005, .019) * face;
    const underNose = gaussian(x, 0, .025) * gaussian(y, -.038, .006) * face;
    const underLip = gaussian(x, 0, .035) * gaussian(y, -.077, .010) * face;
    const brow = gaussian(a, .031, .028) * gaussian(y, .043, .015) * face;
    const cheekRidge = gaussian(a, .051, .021) * gaussian(y - (a - .049) * .43, -.013, .0129) * face;
    const jawRecess = .32 * (1 - THREE.MathUtils.smoothstep(y, -.114, -.083));
    const browRecess = .29 * THREE.MathUtils.smoothstep(y, .031, .080) * face;
    const sidePlane = THREE.MathUtils.smoothstep(a, .049, .084) * .43;
    const zygoma = gaussian(a, .059, .020) * gaussian(y, -.046 + .31 * (a - .052), .019) * face;
    const bridgeLight = gaussian(a, .009, .009) * gaussian(y, -.006, .031) * face;
    const noseTipLight = gaussian(x + .0025, 0, .014) * gaussian(y, -.023, .012) * face;
    const chinLight = gaussian(x, 0, .027) * gaussian(y, -.096, .011) * face;
    const templeGlaze = gaussian(a, .073, .017) * gaussian(y, .032, .033);
    const coldCheek = gaussian(a, .049, .036) * gaussian(y, -.077 - (a - .05) * .32, .021) * face;
    const lowerLid = gaussian(a, design.set, .024) * gaussian(y, design.eyeY - .013 - a * .05, .006) * face;
    const noseFold = gaussian(a, .024 - .33 * (y + .038), .007) * gaussian(y, -.047, .022) * face;
    const cheekPlane = gaussian(y - (a - .05) * .34, -.015, .016)
      * gaussian(a, .048, .021) * face;
    const sideOrbital = gaussian(a, .06, .018) * gaussian(y, .012, .016) * face;
    const noseTurn = gaussian(a, .019, .008) * gaussian(y, -.027, .014) * face;
    const hairline = .081 - .028 * THREE.MathUtils.smoothstep(z, -.090, -.031)
      - .073 * THREE.MathUtils.smoothstep(z, -.028, .028);
    const shortHair = THREE.MathUtils.smoothstep(y, hairline - .010, hairline + .012);
    const facialHair = THREE.MathUtils.smoothstep(-y, .059, .095) * face * stubbleStrength;
    const hairSide = THREE.MathUtils.smoothstep(a, .056, .078) * THREE.MathUtils.smoothstep(z, -.049, -.029)
      * gaussian(y, .023, .030) * .78;
    hairPaint.copy(hairEdge).lerp(hair, THREE.MathUtils.smoothstep(y, hairline, hairline + .033));
    return pointColors.copy(base).lerp(warm, Math.max(cheek, nose) * .75)
      .lerp(lit, .24 * Math.max(0, normal.y)
        + Math.max(brow * .33, cheekRidge * .52, bridgeLight * .51, noseTipLight * .43, chinLight * .39))
      .lerp(cheekAccent, cheekPlane * (x < 0 ? .51 : .36))
      .lerp(redPlane, Math.max(lowerLid * .31, noseTurn * .25))
      .lerp(shadowPlane, Math.max(zygoma * .48, sidePlane * .83, sideOrbital * .27, noseFold * .17))
      .lerp(beardPlane, coldCheek * (local ? .36 : .55))
      .lerp(templePlane, templeGlaze * .44)
      .lerp(recess, Math.max(.49 * socket, .38 * underNose, .48 * underLip, jawRecess, browRecess))
      .lerp(stubble, facialHair).lerp(hairPaint, Math.max(shortHair, hairSide));
  }

  const parts = [createPolygonMesh(rings, tris, paintSkin, columns)];

  // Interpolate the actual front triangles so the small eye and lip surfaces
  // follow this mesh with no reliance on depth bias or a projected texture.
  function surfaceZ(x: number, y: number) {
    let row = 1;
    while (row < sections.length - 1 && sections[row][0][1] < y) row++;
    const lo = sections[row - 1], hi = sections[row];
    const factor = THREE.MathUtils.clamp((y - lo[0][1]) / (hi[0][1] - lo[0][1]), 0, 1);
    for (let i = 0; i < frontColumns; i++) {
      const [a, b, c, d] = [lo[i], lo[i + 1], hi[i], hi[i + 1]];
      const left = THREE.MathUtils.lerp(a[0], c[0], factor), diagonal = THREE.MathUtils.lerp(b[0], c[0], factor);
      const right = THREE.MathUtils.lerp(b[0], d[0], factor);
      if (x > right) continue;
      const middle = THREE.MathUtils.lerp(b[2], c[2], factor);
      if (x < diagonal) return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a[2], c[2], factor), middle,
        THREE.MathUtils.clamp((x - left) / Math.max(.000001, diagonal - left), 0, 1));
      return THREE.MathUtils.lerp(middle, THREE.MathUtils.lerp(b[2], d[2], factor),
        THREE.MathUtils.clamp((x - diagonal) / Math.max(.000001, right - diagonal), 0, 1));
    }
    return THREE.MathUtils.lerp(lo[frontColumns][2], hi[frontColumns][2], factor);
  }

  // Low-relief ribbons for brows, lids and lips. Their per-column curvature
  // describes the feature in silhouette and bakes its local light hierarchy.
  const skinNormal = new THREE.Vector3();
  const detailPaint = new THREE.Color();
  function surroundingPaint(point: Point) {
    const [x, y] = point;
    const step = .0005;
    skinNormal.set(
      (surfaceZ(x + step, y) - surfaceZ(x - step, y)) / (2 * step),
      (surfaceZ(x, y + step) - surfaceZ(x, y - step)) / (2 * step),
      -1,
    ).normalize();
    return paintSkin(point, skinNormal);
  }

  function ribbon(centerX: number, halfWidth: number, steps: number, rows: number,
    profile: (u: number, t: number) => [number, number], color: (u: number, t: number, p: Point) => THREE.Color) {
    const vertices: Point[] = [], indices: number[] = [], colors: THREE.Color[] = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col <= steps; col++) {
      const u = 2 * col / steps - 1, t = row / (rows - 1);
      const [localY, lift] = profile(u, t);
      const x = centerX + u * halfWidth;
      const z = surfaceZ(x, localY);
      vertices.push([x, localY, z - lift]);
      colors.push(color(u, t, [x, localY, z]).clone());
      const i = row * (steps + 1) + col;
      if (row < rows - 1 && col < steps) indices.push(i, i + steps + 1, i + 1, i + 1, i + steps + 1, i + steps + 2);
    }
    let i = 0;
    parts.push(createPolygonMesh(vertices, indices, () => colors[i++]));
  }

  for (const side of [-1, 1]) {
    const eyeX = side * design.set;
    const open = side < 0 ? design.openL : design.openR;
    const eyeWidth = design.eyeWidth * .927;
    const eyeCenter = (u: number) => design.eyeY - side * u * eyeWidth * eyeSlope
      + side * design.corner * .23;
    const curve = (u: number) => .014 + .986 * Math.max(0, 1 - u * u) ** .81;
    const upper = (u: number) => (.0062 - .00095 * side * u) * curve(u) * open;
    const lower = (u: number) => (.00365 + .00077 * side * u) * curve(u) * Math.sqrt(open);
    const apertureY = (u: number, t: number) => eyeCenter(u) + THREE.MathUtils.lerp(-lower(u), upper(u), t);
    const sclera = new THREE.Color(local ? '#a79a85' : '#b5aa98');
    const iris = new THREE.Color(local || style === 1 ? '#544233' : ['#535a48', '#554638', '#506362'][style]);
    const irisEdge = iris.clone().lerp(ink, .57);
    const pupil = new THREE.Color('#24221d');
    const lash = ink.clone().lerp(warm, .48);
    const lidEdge = warm.clone().lerp(lit, .29);
    const tearDuct = warm.clone().lerp(new THREE.Color('#9d685d'), .43);
    const eyeColor = new THREE.Color();
    ribbon(eyeX, eyeWidth, 18, 5, (u, t) => {
      const arc = curve(u);
      // Expose only an almond of the spherical lens. Iris pigment uses actual
      // world units inside the aperture, so the limbus doesn't stretch with t.
      const lens = Math.sqrt(Math.max(0, 1 - u * u)) * Math.sin(Math.PI * t) * .00123;
      return [apertureY(u, t), .00082 + lens * arc];
    }, (u, t, point) => {
      const x = u * eyeWidth - design.gaze * .36;
      const y = apertureY(u, t) - eyeCenter(0) - .00113;
      const r = Math.hypot(x, y) / .00560;
      const innerCorner = THREE.MathUtils.smoothstep(-side * u, .71, 1);
      const paint = eyeColor.copy(sclera).lerp(ink, Math.max(0, (t - .42) * .87) + Math.abs(u) * .20)
        .lerp(tearDuct, innerCorner * .56)
        .lerp(irisEdge, 1 - THREE.MathUtils.smoothstep(r, .84, 1.14))
        .lerp(iris, (1 - THREE.MathUtils.smoothstep(r, .71, .93)) * (.79 + .21 * Math.max(0, -y * 165)))
        .lerp(pupil, 1 - THREE.MathUtils.smoothstep(r, .29, .51))
        .lerp(sclera, gaussian(x, -.00162, .00116) * gaussian(y, .00183, .00115) * .27);
      return Math.abs(u) > .74
        ? paint.lerp(surroundingPaint(point), THREE.MathUtils.smoothstep(Math.abs(u), .74, 1) * .61) : paint;
    });
    ribbon(eyeX, eyeWidth * 1.055, 12, 3, (u, t) => {
      const arch = curve(u);
      return [eyeCenter(u) + upper(u) + (-.0010 + .0053 * t) * arch,
        .00049 + arch * (t === 0 ? .00125 : t < .8 ? .0014 : .00050)];
    }, (u, t, p) => detailPaint.copy(t === 0 ? lash : lidEdge)
      .lerp(surroundingPaint(p), Math.max(t * .93 + .05, Math.abs(u) ** 2 * .91)));
    ribbon(eyeX, eyeWidth * 1.015, 11, 3, (u, t) => {
      const arch = curve(u);
      return [eyeCenter(u) - lower(u) + (-.00385 + .0044 * t) * arch,
        .00049 + arch * (t === 0 ? .00048 : t < .9 ? .00113 : .00119)];
    }, (u, t, p) => detailPaint.copy(t < .8 ? lidEdge : tearDuct)
      .lerp(surroundingPaint(p), Math.max(1 - t * .51, Math.abs(u) ** 2 * .75)));
    ribbon(eyeX - side * .0008, .0204, 11, 2, (u, t) => {
      const arch = Math.max(0, 1 - Math.abs(u) ** 1.36);
      const inward = (1 - side * u) * .5;
      const asymmetry = (open - .91) * .0103;
      const shape = design.eyeY + .0164 + arch * .0028 + side * u * .0021
        - inward * design.expression * .0032 + asymmetry;
      const thickness = .00042 + arch * (.0024 + inward * .0027);
      return [shape + t * thickness, .00083 + arch * .00018];
    }, (u, t, p) => detailPaint.copy(hair).lerp(surroundingPaint(p), .38 + .41 * Math.abs(u) + t * .12));

    // Ear shell, helix and concha are a sculpted surface along the side of the jaw.
    const earVertices: Point[] = [], n = 12;
    const earOuter = .006 * (style === 2 ? .86 : 1);
    const earRadius = [.22, .48, .80, 1];
    for (let ring = 0; ring < earRadius.length; ring++) {
      for (let col = 0; col < n; col++) {
        const angle = col / n * Math.PI * 2;
        const h = Math.cos(angle), depth = Math.sin(angle), radius = earRadius[ring];
        const bowl = [.002, .009, .014, .0065][ring];
        const concha = (1 - radius) * .007;
        const lower = h < 0 ? .67 + (h + 1) * .24 : 1;
        const tragus = .0034 * gaussian(angle, Math.PI * 1.53, .48) * (1 - radius);
        earVertices.push([
          side * (.081 * widthScale + bowl - depth * .003 + h * earOuter + tragus),
          -.009 + h * radius * .024 + depth * radius * .002 - concha * .45,
          -.008 + depth * radius * .014 * lower + h * radius * .008 - concha,
        ]);
      }
    }
    const earTris = assembleRings(earRadius.length, n, side < 0);
    for (let col = 1; col < n - 1; col++) {
      if (side > 0) earTris.push(0, col, col + 1);
      else earTris.push(0, col + 1, col);
    }
    parts.push(createPolygonMesh(earVertices, earTris, ([x, y, z]) => pointColors.copy(warm)
      .lerp(recess, gaussian(z, -.013, .009) * gaussian(y, -.014, .014) * .74)
      .lerp(lit, THREE.MathUtils.smoothstep(Math.abs(x), .088, .098) * .29)));
  }

  const lip = base.clone().lerp(new THREE.Color('#86514b'), .36);
  const innerLip = base.clone().lerp(new THREE.Color('#553a34'), .63);
  const lipHighlight = base.clone().lerp(new THREE.Color('#c48a78'), .20);
  ribbon(design.corner * .35, design.lipWidth * (local ? 1.045 : 1), 16, 5, (u, t) => {
    const envelope = .016 + Math.max(0, 1 - u * u) * .984;
    const d = Math.abs(u);
    const cupid = gaussian(d, .295, .23);
    const split = design.mouthY + design.corner * u - d * (.0019 + design.expression * .0027);
    const row = Math.round(t * 4);
    const lipLines = [-.0052, -.0028, -design.parting * .57, design.parting * .43, .0032 + cupid * .0018];
    const lipRelief = [.00034, .00123, .00091, .00101, .00032];
    return [split + envelope * lipLines[row], .00045 + lipRelief[row] * envelope];
  }, (u, t, p) => {
    detailPaint.copy(t <= .25 ? lipHighlight : t <= .5 ? innerLip : lip);
    if (t === .75) detailPaint.lerp(innerLip, .45);
    return detailPaint.lerp(surroundingPaint(p),
      Math.max(t === 0 || t === 1 ? .94 : .27, THREE.MathUtils.smoothstep(Math.abs(u), .49, 1) * .94));
  });
  for (const side of [-1, 1]) {
    ribbon(design.corner * .54 + side * .013 * design.noseWidth, .0062, 8, 2, (u, t) => [
      -.034 - side * u * .0014 + (t - .5) * .0031 * (.03 + .97 * (1 - u * u)), .00085,
    ], (u, t) => pointColors.copy(ink).lerp(recess, .34 + Math.abs(u) * .48 + t * .11));
  }

  const result = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!result) throw new Error('Unable to merge painted head geometry');
  result.translate(AXIS_X, headY, 0);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
