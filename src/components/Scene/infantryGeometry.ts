import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyPaintedFinish } from './paintedMaterials';
import {sackWeave} from './sackWeave';
import {surfaceCipherAtlas,cipherGLSL,cipherVertex,cipherVaryings} from './surfaceCipher';
import { createFieldHeadGeometry } from './fieldHeadGeometry';
import { createFieldPortrait } from './fieldPortraitGeometry';
import {createPropContactHand} from './fieldHandGeometry';
import { createFieldHelmetGeometry } from './fieldHelmetGeometry';
import { applyInfantryClothFinish } from './infantryClothFinish';
import { createFieldRadioKit } from './fieldRadioKitGeometry';
import { createFieldBackLoadGeometry } from './fieldBackLoadGeometry';
import { createScoutRiceRoll, createScoutShoulderBag, cutScoutTunic, poseSightingScout, SCOUT_SLEEVE_BANDS, trimScoutHair } from './VCInfantryKit';
import {
  INFANTRY_KNEEL_OFFSET,
  fieldRifleStyle,
  infantryRifleBind,
  infantryRifleHeight,
  type InfantryRifleStyle,
} from '../../lib/infantryMetrics';

type Point = [number, number, number];
type Ring = [number, number, number, number];

export interface InfantryAppearance {
  faction: 'us' | 'vc';
  kneeling: boolean;
  variant?: number;
  headwear?: 'pith' | 'boonie' | 'none';
  radioOperator?: boolean;
  /** Regular field actors only; the cupola and final ally have their own art. */
  fieldUniform?: boolean;
  crewman?: boolean;
  rifleHeight?: number;
  rifleStyle?: InfantryRifleStyle;
  customHands?: { support: Point; firing: Point };
  sleeveless?: boolean;
  /** Optional separate mapped head; default preserves every existing character. */
  omitProceduralHead?: boolean;
  colors?: Partial<{ shirt: string; trousers: string; webbing: string; skin: string }>;
}

const PALETTES = {
  us: [
    { shirt: '#64764d', trousers: '#465942', webbing: '#9e8f61', skin: '#be8965' },
    { shirt: '#727751', trousers: '#535c42', webbing: '#968660', skin: '#926245' },
    { shirt: '#58704e', trousers: '#435640', webbing: '#ac986b', skin: '#c19374' },
  ],
  vc: [
    { shirt: '#3a4f57', trousers: '#29363e', webbing: '#938060', skin: '#b8855f' },
    { shirt: '#3c455a', trousers: '#313750', webbing: '#857255', skin: '#be8c63' },
    { shirt: '#485157', trousers: '#33414a', webbing: '#a58b62', skin: '#ae7b58' },
  ],
} as const;

// Dry jungle fatigues and faded cotton, versus deeper indigo field cloth.
// Leave skin entirely outside this choice: faction reads in the issued kit.
const FIELD_CLOTH = {
  us: [
    { shirt: '#697454', trousers: '#58634c', webbing: '#c2b58b' },
    { shirt: '#74785b', trousers: '#62684e', webbing: '#c7b98f' },
    { shirt: '#627150', trousers: '#53634e', webbing: '#c4b587' },
  ],
  vc: [
    { shirt: '#3d4a4d', trousers: '#354047', webbing: '#988a6c' },
    { shirt: '#434953', trousers: '#363b46', webbing: '#9b8a69' },
    { shirt: '#414d4d', trousers: '#3b4547', webbing: '#a58b62' },
  ],
} as const;

/** Paint warm raised planes and cooler undersides into the shared mesh. */
function finishPart(geometry: THREE.BufferGeometry, color: string) {
  const vertices = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(vertices.count * 3);
  const base = new THREE.Color(color);
  for (let index = 0; index < vertices.count; index += 1) {
    const plane = THREE.MathUtils.smoothstep(normals.getY(index) + normals.getX(index) * 0.22, -0.65, 0.8);
    colors[index * 3] = base.r * (.75 + .51 * plane);
    colors[index * 3 + 1] = base.g * (.83 + .37 * plane);
    colors[index * 3 + 2] = base.b * (.94 + .16 * plane);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (geometry.userData.jacketFitRanges) result.userData.jacketFitRanges=geometry.userData.jacketFitRanges;
  if (geometry.userData.forearmRanges) result.userData.forearmRanges=geometry.userData.forearmRanges;
  if (result !== geometry) geometry.dispose();
  return result;
}

function onBone(geometry: THREE.BufferGeometry, bone: number) {
  geometry.userData.infantryBone = bone;
  return geometry;
}

function authoredHeadPart(geometry: THREE.BufferGeometry, skin = false) {
  geometry.userData.infantrySurface = skin ? 2 : 3;
  return onBone(geometry, 8);
}

export function addInfantrySkinAttributes(geometry: THREE.BufferGeometry, bone = 1) {
  const count = geometry.getAttribute('position').count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  const surface = new Float32Array(count);
  const panel = new Uint8Array(count);
  const colors = geometry.getAttribute('color');
  const packedPanel=geometry.getAttribute('garmentPanel');
  const paintedKinds = geometry.getAttribute('surfaceKind');
  const jointBlend = geometry.getAttribute('jointBlend');
  const sleeveSwivel = geometry.getAttribute('sleeveSwivel');
  for (let vertex = 0; vertex < count; vertex++) {
    indices[vertex * 4] = bone;
    weights[vertex * 4] = 1;
    if (jointBlend) {
      const blend = jointBlend.getX(vertex);
      indices[vertex * 4 + 1] = bone + 1;
      weights[vertex * 4] = 1 - blend;
      weights[vertex * 4 + 1] = blend;
    }
    if (sleeveSwivel) {
      const signed = sleeveSwivel.getX(vertex);
      if (signed !== 0) {
        indices[vertex * 4 + 1] = signed < 0 ? 9 : 10;
        weights[vertex * 4] = 1 - Math.abs(signed);
        weights[vertex * 4 + 1] = Math.abs(signed);
      }
    }
    // Authored skin palettes are warm; fatigues/straps are olive or neutral.
    // Material semantics remain baked and are never inferred per pixel.
    const r = colors.getX(vertex), g = colors.getY(vertex), b = colors.getZ(vertex);
    surface[vertex] = paintedKinds?.getX(vertex) ?? geometry.userData.infantrySurface ?? (r > g * 1.45 && g > b * 1.3 ? 1 : 0);
    if (geometry.userData.issuedClothing) {
      const kind=surface[vertex];
      if(kind===0) panel[vertex]=4;
      if(kind===4) panel[vertex]=packedPanel?.getX(vertex)??geometry.userData.gearPanel??3;
      if(kind===3 && geometry.userData.coverPanel) panel[vertex]=1;
      if(kind===3 && geometry.userData.wovenFieldPanel) panel[vertex]=5;
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setAttribute('surfaceKind', new THREE.Float32BufferAttribute(surface, 1));
  geometry.setAttribute('garmentPanel',new THREE.Uint8BufferAttribute(panel,1));
  geometry.deleteAttribute('jointBlend');
  geometry.deleteAttribute('sleeveSwivel');
  return geometry;
}

function part(geometry: THREE.BufferGeometry, color: string, position: Point, scale: Point = [1, 1, 1], rotation: Point = [0, 0, 0]) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  geometry.applyMatrix4(matrix);
  return finishPart(geometry, color);
}

function oval(color: string, position: Point, scale: Point, rotation: Point = [0, 0, 0], segments = 12) {
  return part(new THREE.SphereGeometry(1, segments, 8), color, position, scale, rotation);
}

/** Thin stitched canvas has corners, a folded flap and a shallow front seam.
 * Merged cloth detail avoids the inflated oval shapes of the old kit. */
function canvasPocket(color: string, position: Point, size: Point, rotation: Point = [0, 0, 0], field = false) {
  const [width, height, depth] = size;
  const pouch = ringSurface([
    [-height * .5, width * .40, depth * .37, .002],
    [-height * .43, width * .46, depth * .44, 0],
    [-height * .12, width * .49, depth * .52, -.002],
    [height * .20, width * .47, depth * .50, -.002],
    [height * .47, width * .44, depth * .43, .001],
  ], field ? 8 : 10);
  const points = pouch.getAttribute('position');
  const squarish = (value: number, extent: number) => Math.sign(value) * Math.pow(Math.abs(value) / extent, .56) * extent;
  for (let i = 0; i < points.count; i++) {
    const x = squarish(points.getX(i), width * .5), y = points.getY(i);
    const z = squarish(points.getZ(i), depth * .5);
    const belly = THREE.MathUtils.smoothstep(-z, 0, depth * .40);
    const gusset = Math.exp(-(((Math.abs(x) - width * .27) / (width * .16)) ** 2)) * belly;
    points.setXYZ(i, x, y + .038 * x + gusset * height * .025, z + gusset * depth * .045);
  }
  pouch.computeVertexNormals();
  const flapColors: number[] = [];
  const positions: number[] = [], indices: number[] = [];
  const base = new THREE.Color(color), paint = new THREE.Color(), edgeThread = new THREE.Color('#b4a57a');
  const foldedFlap: [number, number, number, number][] = [
    // Vertical slices across the return on the bottom hem, face, and tuck.
    [.12, .45, -.030, .55], [.145, .49, -.079, .72], [.183, .49, -.093, 1.21],
    [.265, .495, -.105, 1.10], [.415, .466, -.062, 1.22], [.471, .444, .076, .93],
  ];
  // Spend the two redundant flat flap columns on the shirt's larger bellows
  // instead. Keep both of the turned corners and the fold in the middle.
  const columns = field ? [-1, -.90, .03, .90, 1] : [-1, -.90, -.31, 0, .35, .90, 1];
  for (const [row, [heightFraction, halfWidth, standOut, value]] of foldedFlap.entries()) {
    for (const [column, u] of columns.entries()) {
      const x = u * width * halfWidth;
      const y = height * (heightFraction + Math.abs(u) * .034 + u * .019);
      const z = -depth * (.55 - Math.abs(u) ** 3 * .23) + width * standOut * (1 - Math.abs(u) * .26);
      positions.push(x, y, z);
      paint.copy(base).multiplyScalar(value * (.89 + .11 * (1 - Math.abs(u))));
      if (row === 2 || row === 4) paint.lerp(edgeThread, .18);
      paint.toArray(flapColors, flapColors.length);
      if (row === foldedFlap.length - 1 || column === columns.length - 1) continue;
      const i = row * columns.length + column;
      indices.push(i, i + columns.length, i + 1, i + 1, i + columns.length, i + columns.length + 1);
    }
  }
  const flap = new THREE.BufferGeometry();
  flap.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  flap.setAttribute('color', new THREE.Float32BufferAttribute(flapColors, 3));
  flap.setIndex(indices);
  flap.computeVertexNormals();
  const snaps = new THREE.CylinderGeometry(.0034, .004, .0025, field ? 5 : 7, 1);
  if (field) {
    // A 7 mm snap is flush with the canvas. Its projecting cap matters;
    // the five side walls and buried return don't, even in the close camera.
    const cap=snaps.groups[1];
    snaps.setIndex(Array.from(snaps.index!.array).slice(cap.start,cap.start+cap.count));
  }
  const pouchSurface = finishPart(pouch, color);
  const pouchPoints = pouchSurface.getAttribute('position'), pouchPaint = pouchSurface.getAttribute('color');
  for (let i = 0; i < pouchPaint.count; i++) {
    const wall = THREE.MathUtils.smoothstep(Math.abs(pouchPoints.getX(i)), width * .28, width * .49);
    const skirt = 1 - THREE.MathUtils.smoothstep(pouchPoints.getY(i), -height * .45, -height * .25);
    const crease = THREE.MathUtils.smoothstep(-pouchPoints.getZ(i), depth * .24, depth * .52);
    const cavity = .23 * wall + .15 * skirt - .082 * crease;
    pouchPaint.setXYZ(i, pouchPaint.getX(i) * (1 - cavity),
      pouchPaint.getY(i) * (1 - cavity * .93), pouchPaint.getZ(i) * (1 - cavity * .67));
  }
  const group = [pouchSurface, flap.toNonIndexed(),
    part(snaps, '#494a36', [0, height * .25, -depth * .55 - width * .105 - .0014], [1, 1, 1], [-Math.PI / 2, 0, 0]),
  ];
  flap.dispose();
  const result = merge(group);
  result.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1)));
  result.userData.infantrySurface = 4;
  return result;
}

/** Elliptical ring surfaces give cloth shoulders and waists a human contour. */
function ringSurface(rings: Ring[], sides = 14, undulation = .035) {
  const positions: number[] = [];
  const indices: number[] = [];
  rings.forEach(([y, radiusX, radiusZ, centerZ], row) => {
    for (let side = 0; side <= sides; side += 1) {
      const angle = side / sides * Math.PI * 2;
      const fold = row === 0 || row === rings.length - 1 ? 1
        : 1 + Math.sin(angle * 5 + row * 1.4) * undulation;
      positions.push(Math.sin(angle) * radiusX * fold, y, Math.cos(angle) * radiusZ * fold + centerZ);
      if (row < rings.length - 1 && side < sides) {
        const a = row * (sides + 1) + side;
        const b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Average the duplicated longitudinal seam so lighting remains continuous.
  const normals = geometry.getAttribute('normal');
  for (let row = 0; row < rings.length; row += 1) {
    const a = row * (sides + 1);
    const b = a + sides;
    const n = new THREE.Vector3(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z);
    normals.setXYZ(b, n.x, n.y, n.z);
  }
  return geometry;
}

function limb(start: Point, end: Point, topRadius: number, bottomRadius: number, color: string, cloth = true) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const length = a.distanceTo(b);
  const rings: Ring[] = [
    [-length * 0.5, bottomRadius * 0.72, bottomRadius * 0.7, 0],
    [-length * 0.46, bottomRadius, bottomRadius * 0.91, 0],
    [-length * 0.27, bottomRadius * (cloth ? 1.05 : 1), bottomRadius * 0.95, 0],
    [length * 0.03, (bottomRadius + topRadius) * 0.53, (bottomRadius + topRadius) * 0.47, 0],
    [length * 0.33, topRadius * 1.04, topRadius, 0],
    [length * 0.46, topRadius, topRadius * 0.9, 0],
    [length * 0.5, topRadius * 0.75, topRadius * 0.7, 0],
  ];
  const geometry = ringSurface(rings, 10);
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  geometry.applyMatrix4(new THREE.Matrix4().compose(a.lerp(b, 0.5), orientation, new THREE.Vector3(1, 1, 1)));
  return finishPart(geometry, color);
}

// A row follows the limb centreline. Creases are part of the silhouette, and
// the bend blend spreads deformation across several rows around the joint.
type GarmentRow = [travel: number, width: number, depth: number, crease: number, bendBlend?: number];

function sculptLimb(start: Point, bend: Point, end: Point, rows: GarmentRow[], color: string, cloth: boolean, sides = 14, trousers = false, localScout = false) {
  const anchors = [start, bend, end].map(point => new THREE.Vector3(...point));
  const curve = new THREE.CatmullRomCurve3(anchors);
  const bendPlane = new THREE.Vector3().subVectors(anchors[1], anchors[0])
    .cross(new THREE.Vector3().subVectors(anchors[2], anchors[1]));
  if (bendPlane.lengthSq() < 0.000001) bendPlane.set(0, 0, 1);
  bendPlane.normalize();

  const positions: number[] = [], triangles: number[] = [], bendWeights: number[] = [];
  const highlights: number[] = [];
  for (const [row, [travel, width, depth, crease, blend = 0]] of rows.entries()) {
    const center = curve.getPoint(travel);
    const tangent = curve.getTangent(travel);
    const across = new THREE.Vector3().crossVectors(tangent, bendPlane).normalize();
    const radial = new THREE.Vector3().crossVectors(tangent, across).normalize();
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const pinchedSide = 0.55 + Math.sin(angle + 0.45) * 0.45;
      const taper = Math.sin(Math.PI * travel);
      const fold = crease * (0.25 + 0.75 * pinchedSide) * Math.cos(angle * 2.0 + travel * 5.6);
      const longFold = cloth ? Math.cos(angle * 3 - travel * 5.0) * 0.028 * taper : 0;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      let tailoring = 0, foldTravel = 0, edgeShade = 0;
      if (trousers) {
        const transverse = across.clone().multiplyScalar(cos).addScaledVector(radial, sin);
        const wall = transverse.x * Math.sign(start[0]);
        const face = THREE.MathUtils.smoothstep(wall * .67 - transverse.z * .42, -.02, .72);
        const kneeling = THREE.MathUtils.smoothstep(Math.abs(bend[2] - start[2]), .12, .30);
        const diagonal = travel - (.255 + wall * .092 + transverse.z * .044);
        const compression = travel - (.490 - transverse.z * .095 + wall * .023);
        const peak = (d: number, spread: number) => Math.exp(-((d / spread) ** 2));
        // A single dominant pull crosses the outer thigh, with paired planes
        // where the top of the knee gathers into the bent trouser leg.
        tailoring = face * (
          .14 * peak(diagonal - .036, .066) - .13 * peak(diagonal + .032, .043)
          + (.11 + kneeling * .12) * peak(compression + .047, .047)
          - (.08 + kneeling * .087) * peak(compression - .023, .04)
        );
        const kneeWrap = .28 + .72 * face;
        const sideBreak = .24 + .76 * THREE.MathUtils.smoothstep(wall + transverse.y * .23, -.21, .85);
        // Reserve the bands around the flexed knee for paired crest/valley
        // pairs so those silhouettes and pigments don't smear across rings.
        const kneeBand = [0, 0, 0, .068, .089, -.125, .061, -.029][row] ?? 0;
        const pullBand = [0, .043, -.09, .016][row] ?? 0;
        const seam = kneeBand * kneeWrap * (.68 + kneeling * .64) + pullBand * sideBreak;
        tailoring += seam;
        edgeShade = seam * (seam < 0 ? 1.60 : .89);
        const flexZone = THREE.MathUtils.smoothstep(travel, .12, .38)
          * (1 - THREE.MathUtils.smoothstep(travel, .55, .69));
        foldTravel = flexZone * (transverse.y * .021 + transverse.z * .014 + wall * .004);
        if(localScout && row>0 && row<rows.length-1) {
          // Draw the outside leg up on a bias where the hanging pocket bumps
          // the hip. The other leg has a re-dyed reinforced knee with a
          // raised edge and narrow turn-under. These are the actual trouser
          // rings, so the reinforcement bends with both existing leg bones.
          const repaired=start[0]>0, outside=THREE.MathUtils.smoothstep(.53*wall-.74*transverse.z,-.21,.57);
          const cant=.016*wall+.018*transverse.z;
          const patch=([0,0,0,.03,.13,.19,.16,.02,-.03][row]??0);
          const edge=([0,.07,-.09,.15,-.14,.20,-.16,.13,-.09,.13,-.04][row]??0);
          tailoring+=(edge*(repaired?.84:1.07)+patch*(repaired?.25:0))*outside;
          foldTravel+=cant*outside*(row<9?1:.37)*(repaired?1:-.71);
          edgeShade+=outside*(edge*(edge<0?1.65:1.20)+(repaired?patch*1.13:0));
        }
      }
      const shape = 1 + fold + longFold + tailoring;
      const point = center.clone().addScaledVector(across, cos * width * shape)
        .addScaledVector(radial, sin * depth * shape).addScaledVector(tangent, foldTravel);
      positions.push(point.x, point.y, point.z);
      bendWeights.push(blend);
      const overlap = cloth ? Math.max(0, -fold) * 0.85 : 0;
      const panel = cloth ? Math.max(0, Math.cos(angle + .35)) * .09 : 0;
      highlights.push(Math.max(.47, 1 + fold * (cloth ? 1.48 : .48) - overlap + panel
        + tailoring * (tailoring < 0 ? 1.18 : .83) + edgeShade));
      if (row < rows.length - 1) {
        const a = row * sides + side, next = row * sides + (side + 1) % sides;
        triangles.push(a, next, a + sides, next, next + sides, a + sides);
      }
    }
  }

  const endRow = (rows.length - 1) * sides;
  for (let side = 1; side < sides - 1; side++) {
    triangles.push(0, side + 1, side, endRow, endRow + side, endRow + side + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('foldLight', new THREE.Float32BufferAttribute(highlights, 1));
  if (rows.some(row => row[4] !== undefined)) {
    geometry.setAttribute('jointBlend', new THREE.Float32BufferAttribute(bendWeights, 1));
  }
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  const result = finishPart(geometry, color);
  const pigment = result.getAttribute('color'), foldLight = result.getAttribute('foldLight');
  for (let v = 0; v < pigment.count; v++) {
    const light = foldLight.getX(v);
    pigment.setXYZ(v, pigment.getX(v) * light, pigment.getY(v) * light, pigment.getZ(v) * (0.35 + 0.65 * light));
  }
  result.deleteAttribute('foldLight');
  return result;
}

export function createFatigueSleeve(shoulder: Point, elbow: Point, wrist: Point, color: string) {
  const innerShoulder: Point = [shoulder[0] * .70, shoulder[1] + .006, shoulder[2] + .013];
  return sculptLimb(innerShoulder, elbow, wrist, [
    [0, .034, .045, 0], [.12, .064, .068, .034], [.24, .062, .063, -.077],
    [.36, .054, .057, .13], [.44, .050, .051, -.19], [.51, .051, .050, .18],
    [.58, .046, .050, -.145], [.66, .047, .046, .11], [.78, .038, .040, -.065],
    [.88, .035, .035, .07], [.94, .030, .032, -.035], [.96, .034, .034, .06], [1, .030, .031, 0],
  ], color, true);
}

type JacketArm = { shoulder: Point; elbow: Point; wrist: Point };

/**
 * Use the same indices for the shoulder opening and the first sleeve band.
 * Intersecting two closed tubes here used to cut a visible crescent through
 * the cloth, particularly on the cross-body arm supporting the rifle.
 */
function sewJacketSleeves(torso: THREE.BufferGeometry, arms: JacketArm[], standingOffset: number, field = false, rollBoth = false, swivels = false, rollFiringCuff = false) {
  const columns = 19, firstRow = 8, lastRow = 12;
  const sections = [{ low: 3, high: 6, sign: 1 }, { low: 12, high: 15, sign: -1 }];
  const torsoPositions = torso.getAttribute('position');
  const positions = Array.from(torsoPositions.array);
  const colorWeight = torso.hasAttribute('tailorDye') ? Array.from(torso.getAttribute('tailorDye').array) : Array<number>(torsoPositions.count).fill(0);
  const cuffThread = Array<number>(torsoPositions.count).fill(0);
  const sleeveSwivel = swivels ? Array<number>(torsoPositions.count).fill(0) : null;
  const armPlanes=rollBoth||rollFiringCuff?Array<number>(torsoPositions.count).fill(0):undefined;
  const triangles: number[] = [];
  const point = (i: number) => new THREE.Vector3().fromArray(positions, i * 3);
  const shapeBell = (v: number, width: number) => Math.exp(-((v / width) ** 2));
  const collarDepth = 1.405 - standingOffset;
  for (let row = 0; row < torsoPositions.count / columns - 1; row++) {
    for (let col = 0; col < columns - 1; col++) {
      if (row >= firstRow && row < lastRow
        && sections.some(({low, high}) => col >= low && col < high)) continue;
      const a = row * columns + col, b = a + columns;
      triangles.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const jacketFitRanges:[number,number][]=[[0,triangles.length]];
  const forearmRanges:[number,number][]=[];
  for (const { low, high, sign } of sections) {
    const rolled=rollBoth || (rollFiringCuff && sign>0);
    const sleeveStart=triangles.length;
    const rim: number[] = [];
    for (let col = low; col <= high; col++) rim.push(firstRow * columns + col);
    for (let row = firstRow + 1; row <= lastRow; row++) rim.push(row * columns + high);
    for (let col = high - 1; col >= low; col--) rim.push(lastRow * columns + col);
    for (let row = lastRow - 1; row > firstRow; row--) rim.push(row * columns + low);
    const sides = rim.length;
    // Round the corners of the opening without breaking its shared vertices.
    for (const index of rim) {
      const row = Math.floor(index / columns), col = index % columns;
      if (row === firstRow) positions[index * 3 + 1] += .009 + (col === low || col === high ? .015 : 0);
      if ((row === firstRow || row === lastRow) && (col === low || col === high)) {
        if (row === lastRow) positions[index * 3 + 1] -= .009;
        const d = positions[index * 3 + 2] - .008;
        positions[index * 3 + 2] -= d * .13;
      }
      colorWeight[index] = -.074;
    }
    const center = rim.reduce((sum, index) => sum.add(point(index)), new THREE.Vector3()).multiplyScalar(1 / sides);
    const arm = arms[sign < 0 ? 0 : 1];
    const elbow = new THREE.Vector3(...arm.elbow), wrist = new THREE.Vector3(...arm.wrist);
    const deltoid = new THREE.Vector3(
      sign * (rolled ? .226 : .222 + (sign > 0 ? .004 : 0)),
      Math.min(collarDepth, arm.shoulder[1] - (rolled ? .075 : .052)), arm.shoulder[2] * .66 + elbow.z * (rolled ? .23 : .15),
    );
    const curve = new THREE.CatmullRomCurve3([center, deltoid, elbow, wrist]);
    const insideElbow = deltoid.clone().sub(elbow).normalize().add(wrist.clone().sub(elbow).normalize()).normalize();
    const direction = new THREE.Vector3(sign, 0, -.09).normalize();
    const edge = point(rim[0]).sub(center).addScaledVector(direction,
      -point(rim[0]).sub(center).dot(direction)).normalize();
    const spoke = new THREE.Vector3().crossVectors(direction, edge).normalize();
    const initialAngles = rim.map(index => {
      const delta = point(index).sub(center);
      return THREE.MathUtils.euclideanModulo(Math.atan2(delta.dot(spoke), delta.dot(edge)), Math.PI * 2);
    });
    initialAngles[0] = 0;
    const orientation = new THREE.Quaternion();
    // From the armhole out, reuse the same thirteen courses. Only the US
    // summer coat is rolled. The double turn flares off the upper arm,
    // then turns *under* onto the exposed forearm; no overlapping tubes.
    const sleeveBands = rolled ? [
      [.035,.077,.075,0], [.144,.071,.067,0], [.241,.071,.066,0],
      [.327,.067,.065,0], [.414,.072,.068,0], [.462,.064,.063,0],
      [.480,.077,.074,0], [.516,.077,.072,0], [.537,.076,.073,0],
      [.542,.047,.048,0], [.612,.043,.049,0], [.669,.042,.050,0],
      [.722,.046,.050,0], [.787,.041,.045,0], [.866,.033,.038,0],
      [.940,.027,.028,0], [1,.024,.027,0],
    ] : field ? SCOUT_SLEEVE_BANDS : [
      [.035, .078, .076, 0], [.16, .075, .074, .02], [.31, .069, .069, .021],
      [.478, .058, .062, -.023], [.542, .055, .058, .018], [.583, .053, .055, -.026],
      [.629, .052, .054, .022], [.666, .051, .053, -.019], [.716, .049, .051, .022],
      [.824, .039, .042, -.026], [.914, .032, .0325, -.024], [.941, .035, .0345, .010],
      [1, .034, .035, -.035],
    ];
    // Give the shallow compression field more of the existing ring samples.
    // A separate pigment profile keeps the creases legible without pushing
    // the actual elbow silhouette into a sharp step.
    const foldRelief = [0, 0, 0, 0, .0055, -.0042, .0072, -.0058, .0032, 0, 0, 0, 0];
    const foldPigment = [0, 0, 0, 0, .37, -.48, .43, -.46, .23, 0, 0, 0, 0];
    const foldCants = [0, 0, 0, 0, .52, .67, 1, .87, .51, 0, 0, 0, 0];
    let previous = rim;
    let startSeam = true;
    for (const [band, [travel, width, depth, gather]] of sleeveBands.entries()) {
      // Re-cut four of the long sleeve's thirteen courses for the cuff and
      // forearm instead of importing the more detailed US roll's full count.
      if(rollFiringCuff && rolled && (band===2 || band===5 || band===7 || band===12))continue;
      // Lock the entire suspender fitting region and both hand joins to the
      // chest. Only the already-sewn sleeve between them can change silhouette.
      const freedom = band <= 3 ? 0 : THREE.MathUtils.smoothstep(travel,.33,.60)
        * (1 - THREE.MathUtils.smoothstep(travel,.75,.96));
      const swivelWeight = sign * Math.round(freedom * 256) / 256;
      const ringCenter = curve.getPoint(travel);
      const tangent = curve.getTangent(travel);
      if (!startSeam) {
        orientation.setFromUnitVectors(direction, tangent);
        edge.applyQuaternion(orientation);
        spoke.applyQuaternion(orientation);
        direction.copy(tangent);
      }
      const current: number[] = [];
      for (let column = 0; column < sides; column++) {
        const azimuth = THREE.MathUtils.lerp(initialAngles[column],
          column / sides * Math.PI * 2, THREE.MathUtils.smoothstep(travel, .09, .45));
        const arrow = edge.clone().multiplyScalar(Math.cos(azimuth)).addScaledVector(spoke, Math.sin(azimuth));
        const bendFacing = arrow.dot(insideElbow);
        const innerTension = .12 + .88 * THREE.MathUtils.smoothstep(bendFacing, -.45, .91);
        const diagonal = shapeBell(Math.sin(azimuth + .92 - travel * 3.16), .33);
        const fold = gather * (innerTension + diagonal * .34);
        const exterior = arrow.x * sign;
        // The short approach fold curls towards the front; the lower crease
        // returns farther onto the side. Neither becomes a full-width ring.
        const flank = THREE.MathUtils.smoothstep(arrow.z * (band <= 5 ? -.72 : -.36)
          + exterior * (band <= 5 ? .21 : .49) + arrow.y * .32, -.21, .66);
        const flex = THREE.MathUtils.smoothstep(bendFacing + .10 * arrow.y, -.31, .73);
        const relief = (foldRelief[band]??0) * Math.max(flex * .86, flank * .49);
        const paintedFan = Math.max(flex * .91, flank * (band === 8 ? .64 : .77));
        const cant = (foldCants[band]??0) * (.008 * (arrow.y * .89 - arrow.z * .51)
          + .065 * (travel - .629) * (1 - flex));
        const radial = arrow.clone().multiplyScalar(fold);
        const sample = ringCenter.clone()
          .addScaledVector(edge, width * Math.cos(azimuth))
          .addScaledVector(spoke, depth * Math.sin(azimuth)).addScaledVector(radial, .033)
          .addScaledVector(arrow, relief)
          .addScaledVector(tangent, cant);
        if (startSeam) {
          sample.copy(point(rim[column])).addScaledVector(direction, .0047)
            .addScaledVector(arrow, -.00135);
        } else if (travel === .16) {
          sample.lerp(point(rim[column]).addScaledVector(direction, .020), .31);
        }
        // A broad hanging upper pleat folds OUT of the armhole; a second
        // plane turns back toward the crook. Move the sampling rings with
        // the creases (including along the arm), not just their color.
        const upperFace = THREE.MathUtils.smoothstep(exterior * .72 - arrow.z * .43 + arrow.y * .23, -.54, .66);
        const lowerFace = THREE.MathUtils.smoothstep(exterior * .31 - arrow.z * .67 + bendFacing * .48, -.51, .74);
        const turn = (band < 6 ? upperFace : lowerFace);
        let planeValue=0;
        if (rolled && band>=1 && band<=4) {
          // A raglan-like slope connects the *actual* cut armhole to the
          // downhanging sleeve, rather than pinching between round lobes.
          const outside=THREE.MathUtils.smoothstep(Math.abs(sample.x),.136,.278);
          const top=1.453-standingOffset-.46*Math.max(0,Math.abs(sample.x)-.085)
            +.012*sign;
          const flatten=Math.max(0,sample.y-top);
          sample.y-=flatten*outside*.88;
          const ridge=.006*Math.cos(2*azimuth+travel*1.7-.4*sign)
            -.0035*Math.cos(3*azimuth-travel*.7);
          sample.addScaledVector(arrow,ridge);
          // Let the sleeve fall in a pair of long diagonal troughs instead
          // of an even taper. Both terminate before the rolled edge.
          if(band>=2) {
            const sideFace=THREE.MathUtils.smoothstep(exterior*.84-arrow.z*.41,-.3,.68);
            const drag=Math.cos(2.4*azimuth + travel*8 + .64*sign);
            const pleat=shapeBell(drag-.13,.43)-.69*shapeBell(drag+.45,.26);
            sample.addScaledVector(arrow,(band===3?.014:.008)*pleat*sideFace);
            sample.addScaledVector(tangent,.014*drag*sideFace);
            planeValue=.19*pleat*sideFace;
          }
          // Carry the original armhole directions into the cloth. In
          // particular the first band doesn't sprout from a spherical cap.
          if(band===1 || band===2) {
            const root=point(rim[column]), f=band===1?.54:.19;
            root.x+=sign*(band===1?.017:.037);root.y-=band===1?.014:.029;
            root.z-=band===1?.008:.020;
            sample.lerp(root,f);
          }
        } else if (rolled && band >= 5) {
          // A rolled sleeve doesn't end on a lathed horizontal circle. The
          // outside hangs lower than the armpit, with two unequal fabric
          // bunches. Its inside edge shares the same skew to avoid a gap.
          const rolledCloth = band <= 9;
          const lobe = Math.cos(3*azimuth - .64*sign) + .52*Math.sin(2*azimuth+.7);
          const skew = .009*exterior-.014*arrow.z+.004*lobe;
          sample.addScaledVector(arrow,-relief + (rolledCloth && band!==9 ? .0042*lobe : 0));
          sample.addScaledVector(tangent,-cant + (rolledCloth ? skew : 0));
          if (!rolledCloth) {
            // The elbow point sits opposite its crease; the thumb-side
            // muscle crosses obliquely from the outer elbow onto the wrist.
            // This is volume in the same sewn skin, not painted veins.
            const t=travel;
            const bell=(u:number,k:number,r:number)=>shapeBell(u-k,r);
            const elbowPoint=bell(t,.67,.054)*THREE.MathUtils.smoothstep(-bendFacing,.12,.87);
            const crook=bell(t,.663,.051)*THREE.MathUtils.smoothstep(bendFacing,.11,.89);
            const ridgeDir=.42*exterior+(t-.70)*2.9*arrow.y-.72*arrow.z;
            const ridge=bell(t,.767,.105)*THREE.MathUtils.smoothstep(ridgeDir,.12,.66);
            const gutter=bell(t,.787,.111)*bell(ridgeDir,-.022,.22);
            const ulnar=bell(t,.80,.135)*THREE.MathUtils.smoothstep(exterior*.71+arrow.z*.42- .18*arrow.y,.21,.79);
            const bone=bell(t,.94,.035)*THREE.MathUtils.smoothstep(Math.abs(exterior)*.78+arrow.z*.22,.29,.78);
            sample.addScaledVector(arrow,.012*elbowPoint-.012*crook+.013*ridge-.008*gutter+.005*ulnar+.0045*bone);
            sample.addScaledVector(tangent,-.012*elbowPoint+.012*crook+.026*ridge-.011*ulnar);
            planeValue=.19*ridge+.10*ulnar-.21*gutter-.34*crook+.17*elbowPoint+.14*bone;
          }
        } else if (field && !startSeam) {
          // Smooth shoulder-to-elbow fall. Volume accumulates beneath the
          // elbow, not in horizontal rings evenly spaced around the arm.
          const root=point(rim[column]);
          if(band<4){
            const reach=[0,.014,.035,.056][band];
            root.x+=sign*reach;root.y-=reach*(sign>0?.85:.72);root.z-=reach*.62;
            sample.lerp(root,[0,.63,.34,.12][band]);
            const top=1.450-standingOffset-(Math.abs(sample.x)-.075)*.48;
            sample.y-=Math.max(0,sample.y-top)*.90;
          }
          const hang=[0,0,.005,.015,.032,.035,.022,.009,0][band]??0;
          sample.y-=hang*(.36+.64*THREE.MathUtils.smoothstep(-arrow.y,-.23,.70));
          const sculpt = [0,.002,.006,.008,.009,-.008,.011,-.008,.008,-.004,.002,.005,0][band];
          const slope = [0,.005,.016,.023,.020,.011,-.014,-.019,0,.012,.012,.016,0][band];
          sample.addScaledVector(arrow, sculpt * turn - relief);
          sample.addScaledVector(tangent, slope * (arrow.z * .79 + arrow.y * .46) - cant);
          if (band>=9&&band<=11) {
            // Deep turned-back cotton cuff; its outside droops, its corner
            // pinches at the wrist. The last ring still meets the original hand.
            const twist=.65*exterior-.40*arrow.z+Math.sin(azimuth*2.0+sign*.71)*.32;
            sample.addScaledVector(tangent,.014*twist);
            sample.addScaledVector(arrow,(band===9?-.004:.004)*twist);
          }
          if (band === 8 || band === 9) {
            // A pinched bias fold breaks over the outer forearm just below
            // the bend. Its crest and buried return travel *together* on
            // a diagonal and die into the inner seam, not two radial rings.
            const outer = THREE.MathUtils.smoothstep(exterior*.69-arrow.z*.42+arrow.y*.14,-.46,.72);
            const skew = .026 * (arrow.z*.78-arrow.y*.57);
            sample.addScaledVector(tangent, skew * outer);
            sample.addScaledVector(arrow, (band===8 ? .012 : -.006) * outer);
          }
        }
        current.push(positions.length / 3);
        positions.push(sample.x, sample.y, sample.z);
        sleeveSwivel?.push(swivelWeight);
        armPlanes?.push(planeValue);
        const facing = THREE.MathUtils.smoothstep(exterior * .48 + arrow.y * .56 - arrow.z * .27, -.20, .79);
        const drag = shapeBell(travel - (.24 + arrow.z * .08), .205) * (facing * .074 - .033);
        const creasePaint = (foldPigment[band]??0) * paintedFan;
        const wrap = Math.max(facing, Math.abs(arrow.z) * .76, Math.max(0, exterior) * .82);
        const threadCatch = (column + (sign > 0 ? 0 : 2)) % 4 === 1 ? .055 : 0;
        cuffThread.push(rolled ? (band===6 || band===8 ? .22+.13*wrap : 0)
          : band === 11 ? (field ? .36 + .20 * wrap : .16 + .31 * wrap + threadCatch) : field&&band===10 ? .17+.10*wrap : 0);
        const cuff = band === 10 ? -.28 : band === 11 ? .23 + .12 * wrap : band === 12 ? -.045 : 0;
        if (rolled) {
          const layer=[-.04,-.02,.06,.04,.02,-.13,.23,.07,.27,-.47][band]??0;
          colorWeight.push(layer*(.67+.33*wrap)+(band<5?planeValue:0));
        } else if (field) {
          const plane = [-.12,.11,.40,-.57,.28,-.27,.40,-.54,.35,-.41,.23,.46,-.32][band];
          const bias = THREE.MathUtils.smoothstep(exterior*.69-arrow.z*.42+arrow.y*.14,-.46,.72);
          colorWeight.push(plane * (band >= 10 ? .60 + .40 * wrap : turn) + (band===8 ? .17 : band===9 ? -.37 : 0) * bias);
        } else colorWeight.push(startSeam ? .12 : THREE.MathUtils.clamp(fold * (fold < 0 ? .99 : .61)
          + drag + creasePaint + cuff, -.55, .44));
      }
      if (rolled && band === 10) forearmRanges.push([triangles.length,0]);
      for (let i = 0; i < sides; i++) {
        const n = (i + 1) % sides;
        triangles.push(previous[i], previous[n], current[i], previous[n], current[n], current[i]);
      }
      if(band===3) jacketFitRanges.push([sleeveStart,triangles.length-sleeveStart]);
      previous = current;
      startSeam = false;
    }
    for (let i = 1; i < sides - 1; i++) triangles.push(previous[0], previous[i], previous[i + 1]);
    if (rolled) forearmRanges[forearmRanges.length-1][1]=triangles.length-forearmRanges[forearmRanges.length-1][0];
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('sewnEdge', new THREE.Float32BufferAttribute(colorWeight, 1));
  result.setAttribute('cuffThread', new THREE.Float32BufferAttribute(cuffThread, 1));
  if (sleeveSwivel) result.setAttribute('sleeveSwivel',new THREE.Float32BufferAttribute(sleeveSwivel,1));
  if (armPlanes) result.setAttribute('armPlanes',new THREE.Float32BufferAttribute(armPlanes,1));
  result.setIndex(triangles);
  if(field) result.userData.jacketFitRanges=jacketFitRanges;
  if(armPlanes) result.userData.forearmRanges=forearmRanges;
  result.computeVertexNormals();
  // The back seam is a duplicated latitude in the torso ring lattice.
  const n = new THREE.Vector3(), other = new THREE.Vector3(), normals = result.getAttribute('normal');
  for (let row = 0; row < torsoPositions.count / columns; row++) {
    const a = row * columns, b = a + columns - 1;
    n.fromBufferAttribute(normals, a).add(other.fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z);
    normals.setXYZ(b, n.x, n.y, n.z);
  }
  torso.dispose();
  return result;
}

function createBareArm(shoulder: Point, elbow: Point, wrist: Point, color: string) {
  const innerShoulder: Point = [shoulder[0] * 0.8, shoulder[1] + 0.014, shoulder[2]];
  return sculptLimb(innerShoulder, elbow, wrist, [
    [0, .043, .054, 0], [.13, .064, .065, .035], [.27, .058, .064, -.03],
    [.39, .042, .051, .035], [.50, .043, .038, -.04], [.60, .044, .048, .02],
    [.74, .046, .043, .035], [.89, .031, .032, -.03], [1, .024, .026, 0],
  ], color, false);
}

function createGripHand(wrist: Point, support: boolean, skin: string) {
  const [x, y, z] = wrist;
  const palm: Point = [x + (support ? .013 : -.010), y + .020, z - .020];
  const knuckle: Point = [x + (support ? .036 : -.020), y + .038, z - .031];
  const pieces = [sculptLimb(wrist, palm, knuckle, [
    [0, .024, .022, 0], [.22, .026, .025, .03], [.5, .031, .024, .04],
    [.78, .029, .022, -.04], [1, .020, .018, 0],
  ], skin, false, 10)];
  for (let finger = 0; finger < 3; finger++) {
    const forward = z - .018 + finger * .013;
    const root: Point = [knuckle[0], y + .041 - finger * .003, forward];
    const middle: Point = [knuckle[0] + (support ? .009 : -.014), y + .063 - finger * .004, forward - .008];
    const tip: Point = [middle[0] + (support ? -.014 : .014), middle[1] + .009, forward - .013];
    pieces.push(sculptLimb(root, middle, tip, [
      [0, .008, .008, 0], [.44, .008, .007, 0], [1, .0048, .0054, 0],
    ], skin, false, 8));
  }
  return merge(pieces);
}

function createFatigueLeg(hip: Point, knee: Point, ankle: Point, color: string, field = false, localScout = false) {
  // Tuck the tapered hem inside the boot; the planted foot/socket stays at
  // the original ankle and only the garment overlaps it.
  const hem: Point = [ankle[0], ankle[1] - (knee[1] - ankle[1] > .13 ? .024 : .010), ankle[2]];
  const rows:GarmentRow[]=[
    [0, .091, .100, 0, 0], [.13, .097, .093, .055, 0], [.27, .088, .083, -.065, 0],
    [.40, .084, .076, .125, .0625], [.46, .077, .080, -.13, .25],
    [.50, .075, .078, .12, .50], [.56, .070, .074, -.11, .8125],
    [.64, .070, .076, .08, 1], [.76, .065, .076, -.045, 1],
    [.86, .056, .061, .07, 1], [.94, .053, .055, -.027, 1], [1, .046, .048, 0, 1],
  ];
  if(field) {
    // Room for a bent leg: cloth stands away from the thigh, collapses
    // behind the knee, then gathers again over the narrow boot top.
    const ease=[1.04,1.16,1.11,1.20,1.04,1.14,1.06,1.19,1.11,1.23,1.04,1];
    for (const [i,row] of rows.entries()) {
      row[1]*=ease[i]; row[2]*=1+(ease[i]-1)*.90; row[3]*=1.28;
      if(hip[1]>.7 && i>0 && i<rows.length-1) {
        const load=hip[0]>0 ? 1 : -1;
        const pull=([0,.010,.012,-.011,-.013,-.016,-.006,.011,.016,.007,0][i]??0)*load;
        row[0]+=pull;
        row[1]*=1+load*(i<4?.032:i<8?-.038:.016);
      }
      if(localScout){
        // A straight-hanging trouser wall over the boot, not the sharp
        // bellows of an issued fatigue. The cuff bunches above the welt.
        row[1]*=[1,1.17,1.18,1.12,1.14,1.02,1.03,.94,.91,.89,1.22,1][i];
        row[2]*=[1,1.09,1.16,1.08,1.12,1.05,1.08,1,.96,1.04,1.26,1][i];
        row[3]*=.69;
      }
    }
  }
  return sculptLimb(hip, knee, hem, rows, color, true, 14, true,localScout);
}

/** Raised heel, low toe, wrapped ankle and continuous leather upper and sole. */
function createFieldBoot(ankle: Point, rear: boolean, color: string) {
  const [x, y, z] = ankle;
  const heelZ = z + (rear ? .10 : .066);
  const positions: number[] = [], triangles: number[] = [];
  const rows = [[-.265, .023, .045], [-.238, .055, .055], [-.196, .064, .072],
    [-.160, .065, .091], [-.12, .064, .105], [-.072, .06, y + .042], [-.033, .057, y + .064],
    [.005, .049, y + .033], [.023, .030, y * .76]];
  const sides = 12;
  for (const [row, [length, width, rise]] of rows.entries()) {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const spread = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** .67;
      const cosine = Math.cos(angle), upper = Math.max(0, cosine);
      const crease = row === 4 ? .0044 * upper : 0;
      const cuff = row >= 6 && row < rows.length - 1 ? .55 : .72;
      positions.push(x + width * spread,
        .018 + .014 * (1 - upper) + rise * upper ** cuff - Math.max(0, -cosine) * .020 - crease,
        heelZ + length);
      if (row < rows.length - 1) {
        const a = row * sides + side, next = row * sides + (side + 1) % sides;
        triangles.push(a, a + sides, next, next, a + sides, next + sides);
      }
    }
  }
  const endRow = (rows.length - 1) * sides;
  for (let side = 1; side < sides - 1; side++) {
    triangles.push(0, side, side + 1, endRow, endRow + side + 1, endRow + side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  const result = finishPart(geometry, color);
  const points = result.getAttribute('position'), colors = result.getAttribute('color');
  const swatch = new THREE.Color(), scuff = new THREE.Color('#6a5b44'), heelDye = new THREE.Color('#33342b');
  for (let i = 0; i < colors.count; i++) {
    const welt = THREE.MathUtils.smoothstep(points.getY(i), .030, .065);
    const toe = THREE.MathUtils.smoothstep(heelZ - points.getZ(i), .15, .25);
    const crease = Math.exp(-(((points.getZ(i) - heelZ + .120) / .021) ** 2));
    const heel = THREE.MathUtils.smoothstep(points.getZ(i), heelZ - .056, heelZ + .022);
    const edgeWear = THREE.MathUtils.smoothstep(points.getY(i), .028, .092);
    swatch.fromBufferAttribute(colors, i).lerp(scuff, toe * edgeWear * .26)
      .lerp(heelDye, heel * .19).multiplyScalar((.55 + .45 * welt) * (1 + toe * .12 - crease * .21));
    colors.setXYZ(i, swatch.r, swatch.g, swatch.b);
  }
  // Layered outsole: a dark lug, painted edge, lighter worn rubber at the toe.
  const perimeter: [number, number][] = [
    [-.024, -.267], [.024, -.267], [.058, -.242], [.066, -.202], [.065, -.143],
    [.057, -.080], [.051, -.035], [.044, .007], [.030, .022], [-.030, .022],
    [-.044, .007], [-.051, -.035], [-.058, -.080], [-.065, -.143], [-.066, -.202], [-.058, -.242],
  ];
  const base = new THREE.Color('#282923'), trim = new THREE.Color('#75664d');
  const paint = new THREE.Color(), solePositions: number[] = [], soleColors: number[] = [], soleTriangles: number[] = [];
  const tiers = [[.004, .94, .0], [.014, 1, .05], [.024, 1.019, .52], [.030, .965, .15]];
  for (const [tier, [height, spread, edging]] of tiers.entries()) {
    for (const [index, [dx, dz]] of perimeter.entries()) {
      const heel = THREE.MathUtils.smoothstep(dz, -.085, .018);
      const toe = THREE.MathUtils.smoothstep(-dz, .18, .273);
      solePositions.push(x + dx * spread, height + heel * .003 + toe * toe * .0055, heelZ + dz);
      paint.copy(base).lerp(trim, edging * (.71 + toe * .29));
      paint.toArray(soleColors, soleColors.length);
      if (tier >= tiers.length - 1) continue;
      const a = tier * perimeter.length + index, b = (index + 1) % perimeter.length + tier * perimeter.length;
      soleTriangles.push(a, a + perimeter.length, b, b, a + perimeter.length, b + perimeter.length);
    }
  }
  for (let index = 1; index < perimeter.length - 1; index++) soleTriangles.push(0, index, index + 1);
  const outsole = new THREE.BufferGeometry();
  outsole.setAttribute('position', new THREE.Float32BufferAttribute(solePositions, 3));
  outsole.setAttribute('color', new THREE.Float32BufferAttribute(soleColors, 3));
  outsole.setIndex(soleTriangles);
  outsole.computeVertexNormals();
  const parts = [result, outsole.toNonIndexed()];
  outsole.dispose();
  // Three low relief lace crossings; sampled inside the two center columns
  // of the adjacent vamp planes so they wrap with the boot's silhouette.
  const lacePoints: number[] = [], laceIndices: number[] = [];
  function weltAt(left: number, mix: number, side: number, spread: number) {
    const outside = side < 0 ? sides - 1 : 1;
    const center = new THREE.Vector3().fromArray(positions, left * sides * 3);
    const edge = new THREE.Vector3().fromArray(positions, (left * sides + outside) * 3);
    const nextCenter = new THREE.Vector3().fromArray(positions, (left + 1) * sides * 3);
    const nextEdge = new THREE.Vector3().fromArray(positions, ((left + 1) * sides + outside) * 3);
    return center.lerp(nextCenter, mix).lerp(edge.lerp(nextEdge, mix), spread).add(new THREE.Vector3(0, .00145, 0));
  }
  for (const [ring, along] of [[5, .25], [5, .64], [6, .12]]) {
    const first = lacePoints.length / 3;
    for (const edge of [-.026, .026]) {
      for (const side of [-1, 0, 1]) {
        const p = weltAt(ring, along + edge + side * .048, side, Math.abs(side) * .68);
        lacePoints.push(p.x, p.y, p.z);
      }
    }
    for (let i = first; i < first + 2; i++) laceIndices.push(i, i + 3, i + 1, i + 1, i + 3, i + 4);
  }
  const laces = new THREE.BufferGeometry();
  laces.setAttribute('position', new THREE.Float32BufferAttribute(lacePoints, 3));
  laces.setIndex(laceIndices);
  laces.computeVertexNormals();
  parts.push(finishPart(laces, '#52503e'));
  const boot = merge(parts);
  boot.userData.infantrySurface = 5;
  return boot;
}

function jacketCollar(offset: number, color: string, shirt: THREE.BufferGeometry, field = false) {
  const parts: THREE.BufferGeometry[] = [];
  const fabric = new THREE.Color(color);
  const dark = fabric.clone().lerp(new THREE.Color('#343c35'), field ? .71 : .29).multiplyScalar(field ? .61 : .86);
  const light = fabric.clone().lerp(new THREE.Color('#baac79'), field ? .32 : .22);
  const stand = ringSurface([
    [1.423 - offset, .077, .073, .010], [1.453 - offset, .063, .062, .011],
    [1.474 + (field?.016:0) - offset, field?.065:.059, field?.059:.052, .015],
  ], 16, .012);
  const collar = stand.getAttribute('position');
  for (let i = 0; i < collar.count; i++) {
    const front = THREE.MathUtils.smoothstep(-collar.getZ(i), .012, .05);
    collar.setY(i, collar.getY(i) - front * (field?.043:.039));
  }
  stand.computeVertexNormals();
  parts.push(finishPart(stand, color));
  for (const side of [-1, 1]) {
    const shift = side > 0 ? -.003 : .001;
    const center: Point = [side * .059, (field?1.436:1.424) + shift - offset, field ? -.107 : -.088];
    const rolledEdge: Point[] = [
      [side * .031, field?1.473:1.458, -.043], [side * .061, field?1.475:1.456, .007],
      [side * .092, 1.418, -.047], [side * .106, 1.389, -.093],
      [side * .050, field ? 1.369 : 1.378, field ? -.135 : -.124], [side * .019, 1.395, -.106],
    ].map(([x, y, z]) => [x, y + shift - offset, z]);
    const vertices = [center, ...rolledEdge,
      ...rolledEdge.map(([x, y, z], i) => [
        x + side * (i > 2 ? .0013 : 0), y - (i > 2 ? (field ? .006 : .0038) : .0012), z + .0078,
      ]),
    ];
    const triangles: number[] = [];
    const send = (a: number, b: number, c: number) => triangles.push(a, side > 0 ? b : c, side > 0 ? c : b);
    for (let i = 0; i < rolledEdge.length; i++) {
      const a = i + 1, b = (i + 1) % rolledEdge.length + 1;
      send(0, a, b);
      send(a, a + 6, b);
      send(b, a + 6, b + 6);
    }
    const face = new THREE.BufferGeometry();
    face.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
    face.setAttribute('color', new THREE.Float32BufferAttribute(vertices.flatMap((_, i) =>
      (i === 0 ? fabric : i <= 6 ? light : dark).toArray()), 3));
    face.setIndex(triangles);
    face.computeVertexNormals();
    parts.push(face.toNonIndexed());
    face.dispose();
  }
  const placket = fabric.clone().lerp(dark, .34);
  const fittingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  parts.push(tapeTrim([
    [.016, 1.410 - offset, -.090], [.015, 1.383 - offset, -.110], [.017, 1.342 - offset, -.119],
    [.014, 1.251 - offset, -.123], [.017, 1.162 - offset, -.116], [.014, 1.074 - offset, -.104],
  ], .017, `#${placket.getHexString()}`, true, [new THREE.Mesh(shirt, fittingMaterial)]));
  fittingMaterial.dispose();
  return merge(parts);
}

function finishHatNormals(geometry: THREE.LatheGeometry, rows: number, segments: number) {
  const tip = rows - 1;
  const index = geometry.getIndex()!;
  const triangles: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (Number(a % rows === tip) + Number(b % rows === tip) + Number(c % rows === tip) < 2) {
      triangles.push(a, b, c);
    }
  }
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  // The lathe duplicates its seam and apex. Keep the diffuse normals
  // continuous and avoid sending coincident tip triangles to the GPU.
  const normals = geometry.getAttribute('normal');
  const normal = new THREE.Vector3(), peer = new THREE.Vector3();
  for (let row = 0; row < tip; row++) {
    const other = segments * rows + row;
    normal.fromBufferAttribute(normals, row).add(peer.fromBufferAttribute(normals, other)).normalize();
    normals.setXYZ(row, normal.x, normal.y, normal.z);
    normals.setXYZ(other, normal.x, normal.y, normal.z);
  }
  for (let column = 0; column <= segments; column++) normals.setXYZ(column * rows + tip, 0, 1, 0);
}

/** Low pressed-fiber crown and rolled cloth-covered brim. Profile rings carry
 * the binding and crown shadows rather than adding a detached decorative rim. */
function createPithFieldHat(headY: number, variant: number, fieldUniform: boolean) {
  const segments = 32;
  const profile = [
    [.056, .051], [.104, .058], [.139, .035], [.150, .030], [.153, .034],
    [.152, .040], [.142, .047], [.121, .063], [.113, .075], [.110, .085],
    [.104, .093], [.092, .118], [.077, .137], [.054, .151], [.028, .159],
    [.014, .161], [.008, .164], [0, .164],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(profile, segments);
  const coordinates = geometry.getAttribute('position');
  const colors = new Float32Array(coordinates.count * 3);
  const base = new THREE.Color(variant % 2 ? '#767252' : '#697351');
  const pigment = new THREE.Color();
  const binding = new THREE.Color('#aaa577');
  const shadow = new THREE.Color('#465042');
  const light = new THREE.Color(fieldUniform ? '#c3ad81' : '#a29a6a');
  for (let i = 0; i < coordinates.count; i++) {
    const x = coordinates.getX(i), y = coordinates.getY(i), z = coordinates.getZ(i);
    const radius = Math.hypot(x, z);
    const row = i % profile.length;
    const angle = Math.atan2(x, z);
    const panel = .53 + .26 * Math.cos(angle * 2 + variant * .31)
      + .13 * Math.sin(angle * 5 + radius * 42);
    const brim = THREE.MathUtils.smoothstep(radius, .10, .16);
    const seam = THREE.MathUtils.smoothstep(Math.abs(Math.cos(angle * 2 - .28)), .94, 1);
    const crown = THREE.MathUtils.smoothstep(y, .09, .125);
    const brimTension = Math.sin(angle * 3 + variant * .37) * brim * .0019;
    const browFit = (1 - crown) * brim * THREE.MathUtils.smoothstep(-z / Math.max(radius, .001), .23, .99);
    const worn=fieldUniform && variant===2, spread=worn?1+.13*brim:1;
    coordinates.setXYZ(i, .010 + x * (.885 - .044 * brim) * (1 - crown * seam * .011)*spread,
      headY + y - z * (.104 + .049 * brim) + x * .026 + brimTension + browFit * .012+(worn?crown*.025:0),
      -.012 + z * (1.035 - .045 * brim)*spread + browFit * .013);
    // Bleached cloth across large panels; keep the undercut closed visually
    // with a lighter warm lip where the linen binds the pith shell.
    pigment.copy(base).lerp(light, panel * ((fieldUniform ? .46 : .23) + THREE.MathUtils.smoothstep(y, .06, .17) * .42));
    if (row < 4) pigment.lerp(shadow, row === 3 ? .44 : .66);
    if (row === 4 || row === 5) pigment.lerp(binding, .21 + panel * .22);
    if (row === 8 || row === 10) pigment.lerp(shadow, .47);
    if (row === 9) pigment.lerp(binding, .28);
    if (row >= 11 && row <= 14) pigment.lerp(shadow, seam * .23 * (1 - Math.max(0, y - .137) * 21));
    if (row >= 15) pigment.lerp(shadow, .42).lerp(binding, Math.max(0, row - 15) * .11);
    if(worn)pigment.multiplyScalar(row<4?.79:1.27+.18*panel);
    pigment.toArray(colors, i * 3);
  }
  finishHatNormals(geometry, profile.length, segments);
  geometry.deleteAttribute('uv');
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const result = geometry.toNonIndexed();
  geometry.dispose();
  return result;
}

function createWovenFieldHat(headY: number, variant: number, issued=false) {
  // The scout's bound leaf edge is a thin sandwich, not the rolled brim of
  // the pith helmet. Trade radial courses for spokes within the same budget.
  const segments = issued ? 48 : 32;
  const profile = (issued ? [
    [0,.205],[.036,.186],[.081,.159],[.115,.139],[.131,.130],[.153,.117],
    [.178,.102],[.211,.082],[.217,.0795],[.216,.0765],[.159,.110],[.099,.079],[.090,.045],
  ] : [
    [0, .193], [.026, .188], [.072, .168], [.081, .162], [.089, .158],
    [.119, .141], [.131, .135], [.143, .129], [.163, .118], [.178, .110], [.190, .104], [.203, .097],
    [.215, .086], [.217, .081], [.211, .077], [.162, .085], [.107,.103], [.056, .138], [.025, .173],
  ]).reverse().map(([radius, y]) => new THREE.Vector2(radius, y));
  const geometry = new THREE.LatheGeometry(profile, segments).scale(1, 1, .932);
  const coordinates = geometry.getAttribute('position');
  const ribFlanks = [0,.095,.51,.89];
  for (let i = 0; i < coordinates.count; i++) {
    const x = coordinates.getX(i), y = coordinates.getY(i), z = coordinates.getZ(i);
    const distance = Math.hypot(x, z);
    const ribs = Math.cos(Math.atan2(x, z) * 8 + variant);
    if (issued) {
      const row = i % profile.length, column = Math.floor(i / profile.length);
      const radius = profile[row].x, lane = column % 4;
      // Two closely spaced flanks and one broad leaf face between each pair
      // of ribs. Both sides of the binding follow the same relaxed edge.
      const angle = (Math.floor(column / 4) + ribFlanks[lane]) * Math.PI / 6;
      const phase = variant * .47;
      const rim = THREE.MathUtils.smoothstep(radius,.105,.215);
      const edge = Math.sin(angle * 3 + phase) + .39 * Math.cos(angle * 5 - .41);
      const r = radius * (1 + rim * (.011 * edge + .005 * Math.sin(7 * angle + phase)));
      const rx = r * Math.sin(angle), rz = r * Math.cos(angle) * .932;
      const raised = lane === 0 ? .0019 * THREE.MathUtils.smoothstep(radius,.015,.070) : 0;
      // The top and lip have to remain distinct on the worn variant's field
      // silhouette; its chinstrap seats and lower inner ring do not move.
      const worn=variant===2, flare=worn?1+.22*rim:1;
      const crownLift=worn?.055*THREE.MathUtils.smoothstep(y,.118,.200):0;
      coordinates.setXYZ(i,rx*flare+.006,headY+y+crownLift+rx*.06+rz*.065+rim*.0052*edge+raised,rz*flare-.014);
    } else {
      coordinates.setXYZ(i,x+.006,headY+y+x*.06+z*.065+ribs*.0017*distance/.217,z-.014);
    }
  }
  finishHatNormals(geometry, profile.length, segments);
  const hat = finishPart(geometry, variant === 2 ? '#a28c5b' : '#ad9367');
  const p = hat.getAttribute('position'), n = hat.getAttribute('normal'), paint = hat.getAttribute('color');
  const strawLight = new THREE.Color('#c9ae73'), stalkShadow = new THREE.Color('#79613c');
  const swatch = new THREE.Color();
  const paintedArc = (distance: number, radius: number) =>
    1 - THREE.MathUtils.smoothstep(Math.abs(distance - radius), .002, .011);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - .006, z = (p.getZ(i) + .014) / .932;
    const distance = Math.hypot(x, z), angle = Math.atan2(x, z);
    const crown = THREE.MathUtils.smoothstep(n.getY(i), .05, .67);
    const arcs = Math.max(paintedArc(distance, .081), paintedArc(distance, .131), paintedArc(distance, .178));
    const patch = .60 + .40 * Math.sin(angle * (Math.abs(distance - .13) < .03 ? 7 : 5) + variant + distance * 149);
    const streak = (.10 * Math.cos(angle * 6 + distance * 10) + .04 * Math.cos(angle * 11)) * Math.min(1, distance * 28);
    const boundRim = THREE.MathUtils.smoothstep(distance, .203, .215);
    swatch.fromBufferAttribute(paint, i).multiplyScalar(.81 + streak + .16 * crown)
      .lerp(strawLight, arcs * patch * crown * .31)
      .lerp(stalkShadow, boundRim * .48 + arcs * (1 - patch) * crown * .27);
    if(issued) {
      const seam=(1-THREE.MathUtils.smoothstep(Math.abs(distance-.095),.003,.020))*(1-crown);
      // Paint the light lip and the shadow on opposite sides of an actual
      // raised spoke. Interrupt the ribs where the crosswise binding passes.
      const course = ((angle * 6 / Math.PI) % 1 + 1) % 1;
      const innerLeaf = THREE.MathUtils.smoothstep(distance,.018,.060) * (1 - boundRim);
      const ridge = (1 - THREE.MathUtils.smoothstep(Math.min(course,1-course),.015,.092)) * innerLeaf;
      const shade = 1 - THREE.MathUtils.smoothstep(Math.abs(course-.095),.01,.13);
      swatch.multiplyScalar(1+streak*.64+arcs*patch*.12)
        .lerp(stalkShadow,seam*.77)
        .lerp(stalkShadow,shade*crown*innerLeaf*.24)
        .lerp(strawLight,ridge*crown*(.36-.13*arcs))
        .lerp(strawLight,boundRim*crown*(.12+.13*patch));
      if(variant===2){
        // A broad bleached crown over a dark underside. Both remain lit
        // straw surfaces; the sand bank shouldn't swallow the whole hat.
        const top=THREE.MathUtils.smoothstep(n.getY(i),.02,.48);
        swatch.multiplyScalar(.64+top*(.92+.17*Math.cos(angle-.64)));
      }
    }
    swatch.toArray(paint.array, i * 3);
  }
  hat.userData.wovenFieldPanel=issued;
  return hat;
}

function createFastenedChinstrap(headY: number, woven = false, portrait?: THREE.BufferGeometry) {
  const axis = .012;
  const sidePath: [number, number, number][] = [
    woven ? [.113, .099, .012] : [.114, .012, .012],
    [.101, -.028, -.022], [.081, -.063, -.056],
    [.061, -.092, -.078], [.033, -.115, -.088],
  ];
  const path = new THREE.CatmullRomCurve3([
    ...sidePath.map(([x, y, z]) => new THREE.Vector3(axis - x, headY + y, z)),
    new THREE.Vector3(axis, headY - .125, -.083),
    ...sidePath.slice().reverse().map(([x, y, z]) => new THREE.Vector3(axis + x, headY + y, z)),
  ]);
  const positions: number[] = [], indices: number[] = [];
  const width = woven ? .0028 : .0037;
  const crossSection = [[-width, -.0013], [-width, .0013], [width, .0013], [width, -.0013]];
  const samples = Array.from({length:17},(_,i)=>path.getPointAt(i/16));
  if (portrait) {
    // Keep anchors on the helmet. Seat the flexible middle span on THIS
    // variant's jaw and chin instead of an ellipse sized for the old sculpt.
    const mat = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
    const mesh = new THREE.Mesh(portrait,mat), ray = new THREE.Raycaster();
    const axisAt = new THREE.Vector3(), direction = new THREE.Vector3(), start = new THREE.Vector3();
    for (let i=1;i<16;i++) {
      const p = samples[i];
      axisAt.set(axis,headY+.008,p.z);
      direction.copy(p).sub(axisAt).normalize();
      start.copy(axisAt).addScaledVector(direction,.235);
      ray.set(start,direction.clone().negate());
      const hit = ray.intersectObject(mesh)[0];
      if (hit) p.lerp(hit.point.addScaledVector(direction,.0022), THREE.MathUtils.smoothstep(Math.min(i,16-i),0,3));
    }
    mat.dispose();
  }
  for (let i = 0; i <= 16; i++) {
    const point = samples[i];
    const tangent = portrait ? new THREE.Vector3().subVectors(samples[Math.min(i+1,16)],samples[Math.max(i-1,0)]).normalize()
      : path.getTangentAt(i / 16);
    const outward = new THREE.Vector3((point.x - axis) * 8, (point.y - headY) * 4, -0.7);
    const edge = new THREE.Vector3().crossVectors(outward, tangent).normalize();
    const face = new THREE.Vector3().crossVectors(tangent, edge).normalize();
    for (const [width, thickness] of crossSection) {
      const p = point.clone().addScaledVector(edge, width).addScaledVector(face, thickness);
      positions.push(...p);
    }
    if (i < 16) for (let side = 0; side < 4; side++) {
      const a = i * 4 + side, b = i * 4 + (side + 1) % 4;
      indices.push(a, a + 4, b, b, a + 4, b + 4);
    }
  }
  const webbing = new THREE.BufferGeometry();
  webbing.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  webbing.setIndex(indices);
  webbing.computeVertexNormals();
  return finishPart(webbing, woven ? '#706747' : '#787153');
}

/** Edged webbing with a narrow selvage, formed to the body rather than stacked boxes. */
function tapeTrim(points: Point[], width: number, color: string, clothBody = false, targets?: THREE.Mesh[]) {
  const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const shoulder = Boolean(targets && !clothBody);
  const columns = shoulder ? [-1, -.80, .80, 1] : [-1, -.82, -.27, .82, 1];
  const positions: number[] = [], indices: number[] = [], pigment: number[] = [];
  const spans = points.length - 1;
  const shoulderSamples = [1, 2, 3, 3, 2, 1, 1, 1];
  const samples = [0];
  for (let span = 0; span < spans; span++) {
    const count = shoulder ? (shoulderSamples[span] ?? 1) : 1;
    for (let slice = 1; slice <= count; slice++) samples.push((span + slice / count) / spans);
  }
  const dye = new THREE.Color(color), thread = dye.clone().lerp(new THREE.Color('#c2ab7a'), .28);
  const paint = new THREE.Color();
  const ray = targets ? new THREE.Raycaster(undefined, undefined, 0, .134) : undefined;
  const inward = new THREE.Vector3(), origin = new THREE.Vector3();
  for (const [row, travel] of samples.entries()) {
    const center = path.getPoint(travel), direction = path.getTangent(travel);
    const outward = clothBody
      ? new THREE.Vector3(center.x * 2, .02, -1)
      : new THREE.Vector3(center.x * 3, .65, (center.z - .012) * 9);
    const edge = new THREE.Vector3().crossVectors(direction, outward).normalize();
    const face = new THREE.Vector3().crossVectors(edge, direction).normalize();
    for (const [col, u] of columns.entries()) {
      const contact = Math.abs(u) > .99;
      const taper = clothBody ? 1 - .28 * THREE.MathUtils.smoothstep(travel, .74, 1) : 1;
      const sample = center.clone().addScaledVector(edge, u * width * .5 * taper)
        .addScaledVector(face, contact ? -.0028 : .00085 * Math.sin(Math.PI * (u + 1) * .5));
      if (targets && ray) {
        // The shoulder is convex, so sparse chords can disappear under
        // either the shirt yoke or the sleeve even when their endpoints fit.
        const crest = THREE.MathUtils.smoothstep(travel, .20, .38)
          * (1 - THREE.MathUtils.smoothstep(travel, .59, .76));
        const rear = width >= .049 && travel < .34 ? .0038 * (1-THREE.MathUtils.smoothstep(travel,.22,.34)) : 0;
        const clearance = clothBody ? (contact ? .00125 : .00245) : (contact ? .0028 : .0043) + crest * .0032 + rear;
        ray.set(origin.copy(sample).addScaledVector(face, .064), inward.copy(face).negate());
        const hit = ray.intersectObjects(targets, false)[0];
        if (hit && Math.abs(hit.distance - .064) < .071) {
          sample.copy(hit.point).addScaledVector(face, clearance);
        } else {
          sample.addScaledVector(face, clearance);
        }
      }
      positions.push(sample.x, sample.y, sample.z);
      const selvedge = col === 1 || (!clothBody && col === columns.length - 2);
      // Stretched canvas fades in a broad run at the loaded shoulder. The
      // bound edge holds pigment except where a strap rubs against the collar.
      const scuff = shoulder ? Math.max(0, 1 - Math.abs(travel - .43) * 4.5) : 0;
      paint.copy(dye).multiplyScalar(contact ? clothBody ? .84 : .65
        : .89 + Math.max(0, face.y) * .21 + u * .038 + scuff * .15);
      if (selvedge) paint.lerp(thread, clothBody ? .05 : .34 + scuff * .21);
      paint.toArray(pigment, pigment.length);
      if (row < samples.length - 1 && col < columns.length - 1) {
        const a = row * columns.length + col, b = a + columns.length;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(pigment, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const result = geometry.toNonIndexed();
  geometry.dispose();
  return result;
}

/** Fit the actual left/right yoke, including the cloth's waist gathers.
 * Straight spans between points that touch a surface can still slice
 * through its high points. Allocate the same 84 triangles per strap to the
 * worst-fitting lengths of THIS pose rather than a fixed shoulder grid. */
function fitFieldSuspender(points: Point[], width: number, color: string, targets: THREE.Mesh[], slingSeats?:THREE.Vector3[][]) {
  const path = new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const ray = new THREE.Raycaster(undefined,undefined,0,.35), origin = new THREE.Vector3(), inward = new THREE.Vector3();
  const source: { p: THREE.Vector3[]; face: THREE.Vector3; t: number }[] = [];
  const spans = [18,17,8,8,9,12,12,10], steps=points.length-1;
  const dense = [0];
  spans.forEach((n,i)=>{ for(let j=1;j<=n;j++) dense.push((i+j/n)/steps); });
  for(const t of dense) {
    const center=path.getPoint(t), dir=path.getTangent(t);
    const out=new THREE.Vector3(center.x*2.35,.62,(center.z-.012)*10);
    const widthAxis=new THREE.Vector3().crossVectors(dir,out).normalize();
    const face=new THREE.Vector3().crossVectors(widthAxis,dir).normalize();
    const p=[-1,0,1].map(u=>{
      const s=center.clone().addScaledVector(widthAxis,u*width*.5);
      ray.set(origin.copy(s).addScaledVector(face,.18),inward.copy(face).negate());
      const hit=ray.intersectObjects(targets,false).find(h=>{
        const ranges=(h.object as THREE.Mesh).geometry.userData.jacketFitRanges as [number,number][]|undefined;
        const index=(h.faceIndex??-1)*3;
        // The forearm sometimes crosses IN FRONT of the chest. It can hide
        // a strap from the camera; it cannot be the surface the strap fits.
        return !ranges || ranges.some(([start,count])=>index>=start && index<start+count);
      });
      // Extrude from the cloth itself by sewing thickness. At a convex
      // fold, the tip needs no more loft than the lap on a flat panel.
      const load=width>.045 ? THREE.MathUtils.smoothstep(t,.10,.15)*(1-THREE.MathUtils.smoothstep(t,.23,.28))*.0008 : 0;
      return (hit?.point.clone()??s).addScaledVector(face,(u===0?.0037:.0026)-load);
    });
    source.push({p,face,t});
  }
  const kept=[0,source.length-1], delta=new THREE.Vector3();
  // A wide suspender can span the upper-back fold or lower chest pocket
  // even when a greedy nearest-midpoint allocation has already used every
  // section. Select the best 21 chords across the WHOLE supported path;
  // this is a one-time CPU fit on shared geometry, not a frame-time solve.
  if(width>.045) {
    const count=source.length,cost=new Float64Array(count*count);
    for(let a=0;a<count-1;a++)for(let b=a+1;b<count;b++) {
      let worst=0,rest=0;
      for(let i=a+1;i<b;i++){
        const f=(source[i].t-source[a].t)/(source[b].t-source[a].t);
        for(let k=0;k<3;k++){
          delta.lerpVectors(source[a].p[k],source[b].p[k],f).sub(source[i].p[k]);
          const offset=delta.dot(source[i].face), deviation=delta.lengthSq()*.23+offset*offset*(offset<0?2.6:1.8);
          worst=Math.max(worst,deviation); rest+=deviation;
        }
      }
      cost[a*count+b]=worst*worst+rest*rest*.0004;
    }
    let prev=new Float64Array(count).fill(Infinity);prev[0]=0;
    const origin=new Uint16Array(count*22);
    for(let section=1;section<=21;section++){
      const next=new Float64Array(count).fill(Infinity);
      for(let b=section;b<count;b++)for(let a=section-1;a<b;a++){
        const value=prev[a]+cost[a*count+b];
        if(value<next[b]){next[b]=value;origin[section*count+b]=a;}
      }
      prev=next;
    }
    kept.length=22;kept[21]=count-1;
    for(let j=21;j>0;j--)kept[j-1]=origin[j*count+kept[j]];
  } else while(kept.length<22) {
    let best=-1, split=-1, worst=-1;
    for(let s=0;s<kept.length-1;s++) {
      const lo=kept[s], hi=kept[s+1];
      for(let i=lo+1;i<hi;i++) {
        const f=(source[i].t-source[lo].t)/(source[hi].t-source[lo].t);
        for(let k=0;k<3;k++) {
          delta.lerpVectors(source[lo].p[k],source[hi].p[k],f).sub(source[i].p[k]);
          const push=Math.max(0,-delta.dot(source[i].face));
          const error=delta.lengthSq()+push*push*3.5;
          if(error>worst) {worst=error;best=i;split=s;}
        }
      }
    }
    if(best<0) break;
    kept.splice(split+1,0,best);
  }
  const pos:number[]=[],rgb:number[]=[],index:number[]=[];
  const dyed=new THREE.Color(color),thread=dyed.clone().lerp(new THREE.Color('#b3a786'),.22), paint=new THREE.Color();
  for(const [j,i] of kept.entries()) {
    const row=source[i];
    for(const [k,s] of row.p.entries()) {
      pos.push(s.x,s.y,s.z);
      // Edge binding takes the weight. A subtly dusty ridge wanders across
      // the loaded woven center, leaving a deep return against the coat.
      const rub=.5+.5*Math.sin(row.t*17.4+row.p[k].x*35);
      paint.copy(k===1?thread:dyed).multiplyScalar((k===1?1.01+.15*rub:k===0?.54+.09*rub:.65+.11*rub)
        +Math.max(0,row.face.y)*.105);
      rgb.push(paint.r,paint.g,paint.b);
      if(j && k) {const n=j*3+k;index.push(n-4,n-3,n-1,n-3,n,n-1);}
    }
  }
  // Even a good longitudinal fit can cross a convex diagonal in the
  // *interior* of a facet. Measure there, then lift only offending vertices
  // along that piece of webbing's outward direction. Broad-phase boxes
  // keep these one-time tailoring queries local to the handful of shirt
  // faces beneath each panel, rather than thousands of whole-body traces.
  const fabric:{tri:THREE.Triangle;box:THREE.Box3}[]=[];
  for(const target of targets) {
    const geom=target.geometry, p=geom.getAttribute('position');
    const ranges=geom.userData.jacketFitRanges??[[0,p.count]];
    for(const [first,length] of ranges) for(let i=first;i<first+length;i+=3) {
      const tri=new THREE.Triangle();
      tri.a.fromBufferAttribute(p,i);tri.b.fromBufferAttribute(p,i+1);tri.c.fromBufferAttribute(p,i+2);
      fabric.push({tri,box:new THREE.Box3().setFromPoints([tri.a,tri.b,tri.c])});
    }
  }
  const nodes=Array.from({length:pos.length/3},(_,i)=>new THREE.Vector3().fromArray(pos,i*3));
  const near=new THREE.Box3(), n=new THREE.Vector3(), s=new THREE.Vector3(), hitPoint=new THREE.Vector3();
  const cast=new THREE.Ray(), corners=[[1/3,1/3,1/3],[.10,.45,.45],[.45,.10,.45],[.45,.45,.10],[.8,.1,.1],[.1,.8,.1],[.1,.1,.8]];
  for(let pass=0;pass<3;pass++) {
    const lifts=new Float32Array(nodes.length);
    for(let i=0;i<index.length;i+=3) {
      const ids=index.slice(i,i+3), [a,b,c]=ids.map(v=>nodes[v]);
      THREE.Triangle.getNormal(a,b,c,n);
      near.setFromPoints([a,b,c]).expandByScalar(.020);
      const local=fabric.filter(f=>f.box.intersectsBox(near));
      for(const weights of corners) {
        s.copy(a).multiplyScalar(weights[0]).addScaledVector(b,weights[1]).addScaledVector(c,weights[2]);
        cast.origin.copy(s).addScaledVector(n,.016);cast.direction.copy(n).negate();
        let d=.0173;
        for(const {tri} of local) if(cast.intersectTriangle(tri.a,tri.b,tri.c,true,hitPoint)) d=Math.min(d,hitPoint.distanceTo(cast.origin));
        const lack=.0173-d;
        if(lack<.00015) continue;
        const squares=weights[0]**2+weights[1]**2+weights[2]**2;
        for(let k=0;k<3;k++) {
          const v=ids[k], outward=source[kept[Math.floor(v/3)]].face;
          lifts[v]=Math.max(lifts[v],Math.min(.0055,lack*weights[k]/(squares*Math.max(.50,n.dot(outward)))));
        }
      }
    }
    if(!lifts.some(l=>l>.00015)) break;
    nodes.forEach((v,i)=>v.addScaledVector(source[kept[Math.floor(i/3)]].face,lifts[i]));
  }
  if(slingSeats)for(const [end,[a,b]] of slingSeats.entries()){
    // Stitch the terminal cross-section onto the actual canvas tab edge.
    // The broad sling narrows at the tab. Resolve the edge's handedness
    // against the incoming strap so its last two triangles cannot twist.
    const start=end?nodes.length-3:0,left=nodes[start],right=nodes[start+2];
    const reverse=left.distanceToSquared(b)+right.distanceToSquared(a)<left.distanceToSquared(a)+right.distanceToSquared(b);
    left.copy(reverse?b:a);right.copy(reverse?a:b);nodes[start+1].lerpVectors(left,right,.5);
  }
  nodes.forEach((v,i)=>v.toArray(pos,i*3));
  const indexed=new THREE.BufferGeometry();
  indexed.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  indexed.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  indexed.setIndex(index); indexed.computeVertexNormals();
  const g=indexed.toNonIndexed(); indexed.dispose(); return g;
}

function fittedHarness(offset: number, color: string, textileSurfaces: THREE.BufferGeometry[], fieldSuspenders: boolean, field = false, carriesRiceRoll = false) {
  const belt = new THREE.Color(color).lerp(new THREE.Color('#483e2d'), .46);
  const webbing = `#${belt.getHexString()}`;
  const pieces: THREE.BufferGeometry[] = [];
  const fittingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const fittingSurfaces = textileSurfaces.map(surface => new THREE.Mesh(surface, fittingMaterial));
  const strapRanges: [number,number][]=[];
  const localScout=field&&!fieldSuspenders;
  for (const side of [-1, 1]) {
    const path: Point[] = [
      [side * .107, 1.019 - offset, .144], [side * .117, 1.219 - offset, .117],
      [side * .124, 1.387 - offset, .092], [side * .134, 1.432 - offset, .024],
      [side * .141, 1.412 - offset, -.050], [side * .139, 1.35 - offset, -.101],
      [side * .124, 1.240 - offset, -.119], [side * .111, 1.124 - offset, -.110],
      [side * .102, 1.025 - offset, -.103],
    ];
    // The broad, bleached shoulder suspenders read above the sandbags even
    // from behind. The lower belt and flapped pouches keep their darker dye.
    if(localScout) {
      if(side<0) {
        // One continuous strap runs from the rear eye across the back,
        // over the opposite shoulder, diagonally across the shirt and
        // around the hip to the front eye, hugging the actual coat.
        const diagonal:Point[]=[[.104,1.084,.166],[.013,1.221,.148],[-.102,1.389,.095],
          [-.117,1.437,.015],[-.092,1.394,-.085],[.008,1.322,-.135],
          [.121,1.220,-.122],[.184,1.136,-.072],[.278,1.042,-.006]];
        for(const p of diagonal)p[1]-=offset;
        const sling=fitFieldSuspender(diagonal,.055,color,fittingSurfaces,textileSurfaces[textileSurfaces.length-1]?.userData.scoutSlingSeats);
        strapRanges.push([pieces.reduce((n,p)=>n+p.getAttribute('position').count,0),sling.getAttribute('position').count]);
        pieces.push(sling);
      }
    } else if(field) {
      // Route just inboard of the sleeve-head join, like a loaded suspender.
      for(const [i,p] of path.entries()) p[0]-=side*[0,.004,.014,.019,.018,.014,.008,.002,0][i];
      const strap=fitFieldSuspender(path,fieldSuspenders?.050:.029,fieldSuspenders?color:webbing,fittingSurfaces);
      strapRanges.push([pieces.reduce((n,p)=>n+p.getAttribute('position').count,0),strap.getAttribute('position').count]);
      pieces.push(strap);
    } else pieces.push(tapeTrim(path,.029,webbing,false,fittingSurfaces));
    const keeperY = 1.188 + side * .016 - offset;
    if(!localScout)pieces.push(part(new THREE.BoxGeometry(.034, .014, .007), '#655f43',
      [side * .12, keeperY, -.118], [1, 1, 1], [0, -side * .16, side * -.07]));
    // Load the pouch against the ellipse of the cartridge belt. The old flat
    // front Z left open air at the back of each pouch when seen from the side.
    const beltAngle = .64;
    const normalX = Math.sin(beltAngle) / .172, normalZ = -Math.cos(beltAngle) / .115;
    const outward = new THREE.Vector2(side * normalX, normalZ).normalize();
    const pouchX = side * .172 * Math.sin(beltAngle) + outward.x * .017;
    const pouchZ = .027 - .115 * Math.cos(beltAngle) + outward.y * .017;
    if(!carriesRiceRoll)pieces.push(canvasPocket(webbing, [pouchX, .997 - offset, pouchZ],
      [.084, .122, .038], [.026, Math.atan2(-outward.x, -outward.y), side * .06], field));
  }
  pieces.push(finishPart(ringSurface([
    [.961 - offset, .166, .112, .029], [.966 - offset, .174, .116, .029],
    [1.003 - offset, .173, .115, .026], [1.010 - offset, .167, .110, .026],
  ], 16), webbing));
  const buckleZ = -.100, buckleY = .985 - offset;
  pieces.push(part(new THREE.BoxGeometry(.052, .032, .010), '#3c4237', [.010, buckleY, buckleZ]));
  pieces.push(part(new THREE.BoxGeometry(.052, .005, .005), '#81795b', [.010, buckleY + .0135, buckleZ - .006]));
  pieces.push(part(new THREE.BoxGeometry(.006, .027, .006), '#68674e', [-.012, buckleY, buckleZ - .006]));
  pieces.push(part(new THREE.BoxGeometry(.006, .027, .006), '#79745c', [.032, buckleY, buckleZ - .006]));
  fittingMaterial.dispose();
  const harness = merge(pieces);
  harness.userData.infantrySurface = 4;
  harness.userData.strapRanges=strapRanges;
  return harness;
}

function merge(parts: THREE.BufferGeometry[]) {
  // All parts use position/normal/color only, allowing inexpensive merged draws.
  parts.forEach(geometry => geometry.deleteAttribute('uv'));
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error('Unable to build shared infantry silhouette');
  parts.forEach(item => item.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Recut the existing jacket lattice rather than wrap a second mesh around
 * it. Each shaped row is a pattern line: hem, two waist gathers, blade
 * ease, the underturned edge of the yoke, then the shoulder itself. */
function cutFieldJacket(torso: THREE.BufferGeometry, faction: 'us' | 'vc') {
  const p = torso.getAttribute('position'), dye = new Float32Array(p.count);
  const rearY = [.84,.87,.936,.992,1.043,1.069,1.087,1.161,1.226,1.297,1.308,1.354,1.409,1.431,1.445];
  const frontY = [.84,.87,.932,.993,1.029,1.057,1.081,1.152,1.230,1.281,1.354,1.383,1.409,1.431,1.445];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.abs(x), row = Math.floor(i / 19);
    const back = THREE.MathUtils.smoothstep(z, .038, .100);
    const front = THREE.MathUtils.smoothstep(-z, .021, .079);
    // Shoulder-opening vertices and the belt stay where the underlying
    // tailored shell supports them. Two unequal gathers run into that belt.
    const waist = [0,0,0,0,.64,1,1,.72,.19,0,0,0,0,0,0][row];
    const wing = THREE.MathUtils.smoothstep(x,.005,.117);
    const fan = .58 + .32 * Math.cos(x * 15 + (row < 6 ? .72 : -.54));
    const bias = x * (row < 6 ? -.20 : -.25) + wing * .037;
    const seam = [0,0,0,0,0,0,0,0,.28,1,1,.39,0,0,0][row];
    const backArc = a * .226 + x * .047;
    const shift = back * (rearY[row] - y + waist * bias + seam * backArc)
      + front * (frontY[row] - y + waist * (x * .19 + .020 * (1 - a / .2)));
    const gathers = [0,.001,.004,-.003,.010,-.009,.015,-.009,.003,0,0,0,0,0,0][row];
    const backTurn = [0,0,0,0,0,0,0,0,.004,-.007,.004,.001,0,0,0][row];
    // Flatten the raised yoke where the loaded strap crosses it. On its
    // exposed sides the full fold still casts a clear edge.
    const pressedYoke=faction==='us' ? 1-.57*Math.exp(-(((a-.112)/.036)**2)) : 1;
    const relief = (back + front * .89) * gathers * fan + back * backTurn*pressedYoke;
    const pleat = back * Math.exp(-(((a - (.050 + (1.30 - y) * .21)) / .038) ** 2))
      * THREE.MathUtils.smoothstep(y, 1.06, 1.20) * (1 - THREE.MathUtils.smoothstep(y, 1.277, 1.35));
    const skirt=[.036,.024,.010,0][row]??0;
    const loose=skirt*(.42+.58*Math.abs(Math.sin(x*14.1+z*10.7)));
    const shoulderLoad=faction==='us'?THREE.MathUtils.smoothstep(a,.055,.155)
      *THREE.MathUtils.smoothstep(y,1.31,1.40):0;
    // The clavicle comes out from the neck and falls away at the arm.
    // A rear scapular shelf and a lower front return break up a square yoke.
    const ledge=front*Math.exp(-(((y-1.414+a*.18)/.023)**2));
    const breast=front*Math.exp(-(((y-1.363+a*.13)/.030)**2));
    // Shirt cloth is compressed between the belt and axilla. Two unequal
    // folds descend from the side seam; neither encircles the body like a
    // rib on a cylinder. Their crest, valley and pinched ends have depth.
    const wall=THREE.MathUtils.smoothstep(a,.143,.181)*(1-THREE.MathUtils.smoothstep(z,.000,.042));
    const inner=front*(1-THREE.MathUtils.smoothstep(a,.038,.071));
    const fanOut=.46+.54*THREE.MathUtils.smoothstep(x+.58*z,-.12,.14);
    const spread=wall*(.6+.4*fanOut)+inner*.52;
    const rib=([.005,.010,-.009,.009,-.011,.019,-.014,.017,-.007,.003][row]??0)*spread;
    const cant=([.18,.47,.71,.51,.43,.62,.51,.63,.39,.19][row]??0)
      *spread*(z*.23+x*.147);
    p.setXYZ(i,x + x * (relief * 1.6+loose*4.4)+Math.sign(x)*rib*wall, y + shift + cant - skirt*(.36+.39*Math.sin(x*13-z*16))
      +shoulderLoad*(.007*back-.013*front+.013*Math.sign(x)),
      z + (z > .019 ? 1 : -1)*(relief+loose*.26+rib*inner) + pleat * .010+shoulderLoad*(-.011*ledge+.006*breast));
    const rearPaint = [0,.04,.08,-.10,.23,-.44,.34,-.20,.09,-.38,.22,.07,.10,.06,0][row];
    const chestPaint = [0,.04,.10,-.10,.24,-.36,.27,-.14,.04,0,0,0,0,0,0][row];
    dye[i] = (back * rearPaint + front * chestPaint) * (waist ? fan : .93)
      + pleat * (faction === 'us' ? .15 : .19)+rib*(rib<0?18:11);
    if(faction==='vc' && row>2 && row<12){
      const outer=1-THREE.MathUtils.smoothstep(a,.124,.185);
      const stress=(front*.69+back)*outer;
      const low=([0,0,0,0,.008,-.009,.014,-.010,.005,-.012,.009,.003][row]??0)*stress;
      const cross=(row<8?.13:-.23)*x*stress;
      p.setY(i,p.getY(i)+cross);
      p.setZ(i,p.getZ(i)+Math.sign(z-.016)*low);
      dye[i]+=low*(low<0?24:19)+stress*(row===9?-.18:row===10?.13:0);
    }
  }
  torso.setAttribute('tailorDye', new THREE.BufferAttribute(dye, 1));
}

/** Surface-fit the pockets to the actual cut front panel before the sleeves
 * are joined. The top turns from shirt to lid to a dark underlip; the
 * bottom has cloth to take a load rather than a rectangle of different dye. */
function fieldBreastPockets(torso: THREE.BufferGeometry, offset: number, color: string, faction: 'us' | 'vc') {
  const p = torso.getAttribute('position'), idx = torso.index!;
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0,0,1));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  const xyz: number[] = [], rgb: number[] = [], faces: number[] = [];
  const ground = new THREE.Color(color), dye = new THREE.Color(), us = faction === 'us';
  if(!us)ground.set('#78775a');
  const columns = us?[-1,-.67,.04,.71,1]:[-1,-.58,.52,1];
  for (const side of us ? [-1,1] : [-1,0,1]) {
    for (const [row, [v,width,loft,value]] of [
      [-1,.84,.0009,.74],[-.84,.98,.0052,.93],[.28,1,.0071,1.08],
      [.31,.98,.0026,.54],[.37,.99,.0099,1.20],[.64,.99,.0110,1.12],[1,.94,.0016,.94],
    ].entries()) {
      for (const [col,u] of columns.entries()) {
        const x = (us ? .092 : .088) * side + u * width * (us ? .051 : .045);
        const y = (us ? 1.271 : 1.148) - offset + v * (us ? .080 : .073)
          + (x - side * .090) * (us ? .30 : .17) * side + (row === 4 ? .0027 * Math.abs(u) : 0);
        ray.origin.set(x,y,-.22);
        let z = -.072;
        for (let j = 0; j < idx.count; j += 3) {
          a.fromBufferAttribute(p,idx.getX(j)); b.fromBufferAttribute(p,idx.getX(j+1)); c.fromBufferAttribute(p,idx.getX(j+2));
          if (Math.max(a.z,b.z,c.z) > .012 || !ray.intersectTriangle(a,b,c,false,hit)) continue;
          z = Math.min(z,hit.z);
        }
        const belly = 1 - Math.abs(u) ** 3;
        const gusset = row === 1 || row === 2 ? us && col === 2 ? -.003 : .002 : 0;
        // The outer half of the tall pocket is pressed down by the
        // overlying suspender; only its inner bellows stays fully open.
        const pressure=us?1-.44*THREE.MathUtils.smoothstep(side*u,-.06,.63):1;
        // The local scout's belt carries three small canvas bellows. Their
        // raised flap and dark return follow the ribs beneath the weapon.
        const vcLoft=side===0?2.60:1.04+.88*(1-THREE.MathUtils.smoothstep(side*u,-.85,.23));
        xyz.push(x,y,z - .0012 - (loft + gusset) * belly*pressure*(us?1:vcLoft));
        dye.copy(ground).multiplyScalar(value * (row===3?.72:row===4?1.15:1)
          * (.78 + .22 * belly) * (us && col === 2 && row === 2 ? .82 : 1));
        rgb.push(dye.r,dye.g,dye.b);
        if (!row || !col) continue;
        const i = xyz.length / 3 - 1, w = columns.length;
        faces.push(i-w-1,i-1,i-w,i-w,i-1,i);
      }
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  geom.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  geom.setIndex(faces); geom.computeVertexNormals();
  const pockets = geom.toNonIndexed(); geom.dispose();
  pockets.userData.infantrySurface = us?0:4;
  return onBone(pockets,1);
}

/** Detailed adult infantry, baked per stance/palette, with no character textures. */
export function createInfantryGeometry({ faction, kneeling, variant = 0, headwear = 'boonie', radioOperator = false, crewman = false, fieldUniform = false,
  rifleHeight, rifleStyle, customHands, sleeveless = false, omitProceduralHead = false, colors }: InfantryAppearance) {
  const swatch = variant % PALETTES[faction].length;
  const palette = { ...PALETTES[faction][swatch], ...(fieldUniform && FIELD_CLOTH[faction][swatch]), ...colors };
  const offset = kneeling ? INFANTRY_KNEEL_OFFSET : 0;
  const rifleY = rifleHeight ?? infantryRifleHeight(kneeling);
  const headY = 1.568 - offset;
  const parts: THREE.BufferGeometry[] = [];
  const torso = ringSurface([
    [0.84, 0.15, 0.105, 0.022], [0.87, 0.173, 0.118, 0.025], [0.93, 0.168, 0.110, 0.025],
    [0.99, 0.163, 0.108, 0.021], [1.049, 0.170, 0.109, 0.017], [1.096, 0.173, 0.114, 0.015],
    [1.144, 0.179, 0.115, 0.013], [1.185, 0.186, 0.121, 0.010],
    [1.230, 0.199, 0.124, 0.006], [1.281, 0.204, 0.124, 0.004], [1.354, 0.205, 0.118, 0.002],
    ...(sleeveless ? [[1.405, 0.195, 0.099, 0.012]] as Ring[] : [
      [1.383, 0.208, 0.116, 0.010], [1.409, 0.169, 0.097, 0.011], [1.431, 0.119, 0.078, 0.012],
    ] as Ring[]),
    [1.445, 0.071, 0.068, 0.012],
  ], 18, 0);
  const jacket = torso.getAttribute('position');
  const foldAt = (x: number, y: number, z: number) => {
    const a = Math.abs(x), side = Math.sign(x);
    const front = THREE.MathUtils.smoothstep(-z, -.02, .07);
    const back = THREE.MathUtils.smoothstep(z, .02, .10);
    const seamTension = THREE.MathUtils.smoothstep(a, .04, .174) * front;
    const chestArc = y - (1.307 - a * .58 + side * .011);
    const leftGather = y - (1.041 + a * .73 + side * .020);
    const rightGather = y - (1.049 + a * .36 - side * .031);
    const bell = (v: number, r: number) => Math.exp(-((v / r) ** 2));
    const lift = .009 * bell(chestArc, .034) * seamTension
      + .010 * bell(leftGather, .029) * seamTension
      + .007 * bell(rightGather, .021) * seamTension
      + .008 * bell(y - 1.293 + a * .65, .036) * back;
    const notch = .005 * bell(chestArc + .029, .021) * seamTension
      + .007 * bell(leftGather - .026, .026) * seamTension
      + .003 * bell(rightGather + .019, .017) * seamTension;
    return { lift, notch };
  };
  for (let i = 0; i < jacket.count; i++) {
    const x = jacket.getX(i), y = jacket.getY(i), z = jacket.getZ(i);
    const { lift, notch } = foldAt(x, y, z);
    const pleat = lift - notch;
    const hem = (1 - THREE.MathUtils.smoothstep(y, .84, .93)) * (.015 * Math.cos(x * 16) - x * .1);
    jacket.setXYZ(i, x + Math.sign(x) * pleat * .39, y + hem, z + Math.sign(z - .018) * pleat);
  }
  const fieldJacket = fieldUniform && !sleeveless;
  if (fieldJacket) cutFieldJacket(torso,faction);
  const scoutJacket=fieldJacket && faction==='vc';
  if(scoutJacket)cutScoutTunic(torso);
  torso.computeVertexNormals();
  torso.translate(0, -offset, 0);
  const breastPockets=fieldJacket?fieldBreastPockets(torso,offset,palette.shirt,faction):undefined;
  if (breastPockets) parts.push(breastPockets);
  parts.push(onBone(finishPart(ringSurface([
    [.79 - offset, .10, .075, .04], [.83 - offset, .152, .102, .035],
    [.91 - offset, .161, .102, .032], [.96 - offset, .148, .086, .024],
  ]), palette.trousers), 0));

  const legs = kneeling ? [
    { hip: [-0.105, 0.45, 0.018] as Point, knee: [-0.158, 0.375, -0.34] as Point, ankle: [-0.158, 0.12, -0.38] as Point, rear: false },
    { hip: [0.105, 0.45, 0.065] as Point, knee: [0.17, 0.125, 0.22] as Point, ankle: [0.18, 0.105, 0.55] as Point, rear: true },
  ] : [
    { hip: [-0.103, 0.88, 0.025] as Point, knee: [-0.12, 0.48, -0.027] as Point, ankle: [-0.13, 0.16, -0.06] as Point, rear: false },
    { hip: [0.103, 0.88, 0.045] as Point, knee: [0.127, 0.47, 0.085] as Point, ankle: [0.15, 0.16, 0.12] as Point, rear: false },
  ];
  for (const [legIndex, { hip, knee, ankle, rear }] of legs.entries()) {
    const upperBone = 2 + legIndex * 3, footBone = upperBone + 2;
    parts.push(onBone(createFatigueLeg(hip, knee, ankle, palette.trousers, fieldUniform, fieldUniform&&faction==='vc'), upperBone));
    const boot = faction === 'us' ? '#31372d' : '#4b4935';
    parts.push(onBone(createFieldBoot(ankle, rear, boot), footBone));
    if (faction === 'us') {
      // Flapped jungle-fatigue cargo pockets on the outer thighs.
      const pocketY = (hip[1] + knee[1]) * 0.5;
      parts.push(onBone(canvasPocket('#626849', [(hip[0] + knee[0]) * 0.5 + Math.sign(hip[0]) * (fieldUniform?.089:.073), pocketY, (hip[2] + knee[2]) * 0.5],
        [fieldUniform?.128:.108, 0.15, fieldUniform?.039:.025], [0, -Math.sign(hip[0]) * Math.PI / 2, 0], fieldUniform), upperBone));
    }
  }

  // Continuous clothed shoulders and bent elbows lead into the actual grip.
  const shoulderY = 1.385 - offset;
  const elbowY = rifleHeight === undefined ? rifleY - 0.23 : Math.max(rifleY - 0.23, shoulderY - 0.32);
  const rifle = crewman || customHands ? null : infantryRifleBind(rifleStyle ?? fieldRifleStyle(faction, variant), kneeling);
  const leftShoulder: Point = [-.201, shoulderY, rifle ? -.035 : -.008];
  const rightShoulder: Point = [.201, shoulderY - (rifle ? .009 : 0), -.008];
  const fieldArms=fieldJacket && faction==='us' && !!rifle;
  const leftElbow: Point = crewman ? [-.11, 1.19, -.14] : scoutJacket && rifle ? [-.182,elbowY+.055,-.281] : fieldArms ? [-.158,elbowY+.033,-.278] : rifle ? [-.108, elbowY + .042, -.257] : [-.22, elbowY, -.20];
  const rightElbow: Point = crewman ? [.30, 1.16, -.005] : scoutJacket && rifle ? [.342,elbowY-.009,-.095] : fieldArms ? [.285,elbowY-.024,-.049] : rifle ? [.269, elbowY + .027, -.126] : [.298, elbowY + .01, .033];
  const support: Point = crewman ? [.243, 1.338, -.292] : customHands ? customHands.support
    : [rifle!.support[0] - .046, rifle!.support[1] - .054, rifle!.support[2] + .016];
  const trigger: Point = crewman ? [.424, 1.338, -.292] : customHands ? customHands.firing
    : [rifle!.firing[0] + .038, rifle!.firing[1] - .035, rifle!.firing[2] + .027];
  const arms = [
    { shoulder: leftShoulder, elbow: leftElbow, wrist: support },
    { shoulder: rightShoulder, elbow: rightElbow, wrist: trigger },
  ];
  const rolled=fieldJacket && faction==='us';
  const swivelArms = fieldJacket && !!rifle;
  const sightingScout=scoutJacket && !!rifle && swatch===2;
  const paintedTorso = finishPart(sleeveless ? torso : sewJacketSleeves(torso, arms, offset, fieldJacket, rolled, swivelArms, sightingScout), palette.shirt);
  const jacketPoints = paintedTorso.getAttribute('position'), jacketPaint = paintedTorso.getAttribute('color');
  const seam = paintedTorso.getAttribute('sewnEdge');
  const cuffThread = paintedTorso.getAttribute('cuffThread');
  const threadDye = new THREE.Color(palette.shirt).lerp(new THREE.Color('#aaa47e'), .37);
  for (let i = 0; i < jacketPaint.count; i++) {
    const x = jacketPoints.getX(i), y = jacketPoints.getY(i) + offset, z = jacketPoints.getZ(i);
    const a = Math.abs(x);
    const seamTint = seam?.getX(i) ?? 0;
    const torsoInfluence = 1 - THREE.MathUtils.smoothstep(a, .137, .234);
    const lap = THREE.MathUtils.smoothstep(-z, .043, .117) * torsoInfluence;
    const { lift, notch } = foldAt(x, y, z);
    const shadow = Math.min(.22, notch * 29) * torsoInfluence;
    const ridge = Math.min(.22, lift * 20) * torsoInfluence;
    const sidePanel = THREE.MathUtils.smoothstep(a, .110, .194) * .13 * torsoInfluence;
    const yoke = THREE.MathUtils.smoothstep(y, 1.278, 1.414) * lap * .11;
    const waist = (1 - THREE.MathUtils.smoothstep(y, 1.004, 1.145)) * lap * .15;
    const fold = ridge - shadow + seamTint;
    const thread = cuffThread?.getX(i) ?? 0;
    jacketPaint.setXYZ(i, THREE.MathUtils.lerp(jacketPaint.getX(i) * (1 + fold - sidePanel + yoke - waist), threadDye.r, thread),
      THREE.MathUtils.lerp(jacketPaint.getY(i) * (1 + .86 * fold - .86 * sidePanel + .74 * yoke - waist * .78), threadDye.g, thread),
      THREE.MathUtils.lerp(jacketPaint.getZ(i) * (1 + .55 * fold - .50 * sidePanel + .29 * yoke - .46 * waist), threadDye.b, thread));
  }
  paintedTorso.deleteAttribute('sewnEdge');
  paintedTorso.deleteAttribute('cuffThread');
  paintedTorso.userData.infantrySurface = 0;
  if(rolled || sightingScout) {
    // Material changes at the cuff's underturn, not through the middle
    // of a triangle. The closed surface is still the original jacket draw.
    const kinds=new Float32Array(jacketPoints.count), n=paintedTorso.getAttribute('normal'),planes=paintedTorso.getAttribute('armPlanes');
    const skin=new THREE.Color(palette.skin), earth=new THREE.Color('#685b48'), pigment=new THREE.Color();
    for (const [start,count] of paintedTorso.userData.forearmRanges as [number,number][]) {
      for(let i=start;i<start+count;i++) {
        const x=jacketPoints.getX(i),y=jacketPoints.getY(i)+offset,z=jacketPoints.getZ(i);
        const top=THREE.MathUtils.smoothstep(n.getY(i)-.22*n.getZ(i),-.65,.82);
        const stain=Math.max(0,Math.sin(73*x+42*y-32*z)*Math.sin(47*z+19*x))* .20;
        pigment.copy(skin).lerp(earth,.13+stain).multiplyScalar((.70+.43*top)*(1+planes.getX(i)));
        jacketPaint.setXYZ(i,pigment.r,pigment.g,pigment.b);
        kinds[i]=1;
      }
    }
    paintedTorso.setAttribute('surfaceKind',new THREE.BufferAttribute(kinds,1));
    paintedTorso.deleteAttribute('armPlanes');
  }
  parts.unshift(paintedTorso);
  const textileSurfaces = breastPockets?[paintedTorso,breastPockets]:[paintedTorso];
  for (const [index, {shoulder, elbow, wrist}] of arms.entries()) {
    if (sleeveless) {
      const arm = createBareArm(shoulder, elbow, wrist, palette.skin);
      parts.push(arm);
      textileSurfaces.push(arm);
    }
    parts.push(rifle ? createPropContactHand(wrist, index === 0 ? rifle.support : rifle.firing, index === 0, palette.skin,faction==='vc')
      : createGripHand(wrist, index === 0, palette.skin));
  }

  parts.push(limb([0, 1.407 - offset, 0.008], [0, 1.491 - offset, -0.005], 0.053, 0.057, palette.skin, false));
  if (!sleeveless) parts.push(onBone(jacketCollar(offset, palette.shirt, paintedTorso, fieldJacket), 1));
  const face = omitProceduralHead ? undefined : (fieldUniform ? createFieldPortrait : createFieldHeadGeometry)(headY, palette.skin, variant, faction);
  if(fieldUniform&&faction==='vc'&&face)trimScoutHair(face,headY,variant);
  if (face) parts.push(authoredHeadPart(face, true));

  const scoutBag=fieldUniform&&faction==='vc'&&!radioOperator?createScoutShoulderBag(offset,variant):undefined;
  const harness=fittedHarness(offset,palette.webbing,scoutBag?[...textileSurfaces,scoutBag]:textileSurfaces,fieldUniform && faction === 'us',fieldUniform,sightingScout);
  const harnessStart=parts.reduce((n,p)=>n+p.getAttribute('position').count,0);
  const fieldSuspenderRanges: [number,number][]=harness.userData.strapRanges.map(([start,count]:[number,number])=>[harnessStart+start,count]);
  parts.push(onBone(harness,1));
  let localScoutSatchel:[number,number]|undefined;
  if (fieldUniform && !radioOperator) {
    const load=scoutBag??createFieldBackLoadGeometry(faction,offset,variant);
    if(faction==='vc')localScoutSatchel=[parts.reduce((n,p)=>n+p.getAttribute('position').count,0),load.getAttribute('position').count];
    parts.push(onBone(load,1));
  }
  let scoutRiceRoll:[number,number]|undefined;
  if(sightingScout && !radioOperator){
    const rice=createScoutRiceRoll(offset);
    scoutRiceRoll=[parts.reduce((n,p)=>n+p.getAttribute('position').count,0),rice.attributes.position.count];
    parts.push(onBone(rice,1));
  }
  if (faction === 'us') for (const side of [-1, 1]) {
    parts.push(canvasPocket('#626d4e', [side * .177, .992 - offset, .075], [.072, .118, .047], [0, -side * Math.PI / 2, 0], fieldUniform));
  }
  if (faction === 'us') {
    if(!fieldJacket) for (const side of [-1, 1]) {
      parts.push(canvasPocket('#666d50', [side * 0.091, 1.284 - offset, -0.118], [0.097, 0.094, 0.016]));
    }
    if (headwear !== 'none') {
      const shell=authoredHeadPart(createFieldHelmetGeometry({ headY, variant, crewman, fieldUniform }));
      shell.userData.coverPanel=fieldUniform;
      parts.push(shell);
      if (!crewman) parts.push(authoredHeadPart(createFastenedChinstrap(headY, false, fieldUniform ? face : undefined)));
    }
    if (crewman) {
      // Period tank-crew ear protection and a slender microphone boom.
      for (const side of [-1, 1]) parts.push(oval('#353e2e', [0.012 + side * 0.108, headY - 0.005, -0.016], [0.026, 0.045, 0.028]));
      parts.push(limb([0.119, headY - 0.028, -0.035], [0.037, headY - 0.05, -0.139], 0.004, 0.004, '#293024', false));
      parts.push(oval('#22291e', [0.034, headY - 0.05, -0.143], [0.012, 0.007, 0.008], [0, 0, 0], 8));
    }
  } else if (headwear === 'pith') {
    parts.push(authoredHeadPart(createPithFieldHat(headY, variant, fieldUniform)));
  } else if (headwear !== 'none') {
    parts.push(authoredHeadPart(createWovenFieldHat(headY, variant, fieldUniform)));
    parts.push(authoredHeadPart(createFastenedChinstrap(headY, true, fieldUniform ? face : undefined)));
  }
  for (const geometry of parts) {
    const positions = geometry.getAttribute('position');
    let minY = Infinity, meanY = 0;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      minY = Math.min(minY, positions.getY(vertex)); meanY += positions.getY(vertex);
    }
    if (geometry.userData.infantryBone === undefined && minY > headY - 0.21 && meanY / positions.count > headY - 0.14) onBone(geometry, 8);
  }
  if (radioOperator) parts.push(...createFieldRadioKit(offset));
  for (const geometry of parts) {
    geometry.userData.issuedClothing=true;
    addInfantrySkinAttributes(geometry, geometry.userData.infantryBone ?? 1);
  }
  const result=merge(parts);
  if(fieldUniform&&faction==='vc'){
    const ink=new Uint8Array(result.attributes.position.count*2);
    // X=0 is not a hand UV. Reuse its spare Y byte on fabrics for height
    // above the standing heels, so identical shoulder lighting sits on
    // the shoulder in both crouching and standing bind poses.
    const pos=result.attributes.position,kind=result.attributes.surfaceKind;
    for(let i=0;i<pos.count;i++){const k=kind.getX(i);
      if(k===0||k===4)ink[2*i+1]=Math.round(255*THREE.MathUtils.clamp((pos.getY(i)+offset)/1.85,0,1));}
    let vertex=0;for(const piece of parts){if(piece.userData.handInkUv)ink.set(piece.userData.handInkUv,vertex*2);vertex+=piece.attributes.position.count;}
    result.setAttribute('fieldHandArt',new THREE.Uint8BufferAttribute(ink,2,true));
  }
  if(fieldUniform&&face){
    const count=result.getAttribute('position').count,uv=new Uint16Array(count*2);
    let first=0;for(const p of parts){if(p===face)break;first+=p.getAttribute('position').count;}
    const chart=face.userData.fieldFaceUv;
    if(chart)uv.set(chart,first*2);
    result.setAttribute('fieldFaceUV',new THREE.Uint16BufferAttribute(uv,2,true));
    result.userData.fieldPortrait={...face.userData.fieldPortrait,firstVertex:first,vertexCount:face.getAttribute('position').count};
  }
  if (swivelArms) result.userData.fieldSleeveBinds=arms;
  if(fieldUniform) result.userData.fieldSuspenderRanges=fieldSuspenderRanges;
  if(localScoutSatchel)result.userData.localScoutSatchel=localScoutSatchel;
  if(scoutRiceRoll)result.userData.scoutRiceRoll=scoutRiceRoll;
  if(fieldJacket) result.userData.jacketFitRanges=[...paintedTorso.userData.jacketFitRanges,
    [paintedTorso.getAttribute('position').count,breastPockets!.getAttribute('position').count]];
  if(sightingScout)poseSightingScout(result,offset,arms);
  return result;
}

/** Only the waist-up crew is visible above the existing cupola. No hidden legs
 * are submitted, and the hands are posed against the M37 rear spade grips. */
export function createTankCrewGeometry() {
  const source = createInfantryGeometry({ faction: 'us', kneeling: false, variant: 1, crewman: true });
  const position = source.getAttribute('position');
  const selected: number[] = [];
  for (let vertex = 0; vertex < position.count; vertex += 3) {
    if (Math.max(position.getY(vertex), position.getY(vertex + 1), position.getY(vertex + 2)) < 1.02) continue;
    selected.push(vertex, vertex + 1, vertex + 2);
  }
  const result = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'surfaceKind', 'garmentPanel']) {
    const original = source.getAttribute(name);
    const values = new Float32Array(selected.length * original.itemSize);
    selected.forEach((vertex, index) => {
      for (let component = 0; component < original.itemSize; component++) values[index * original.itemSize + component] = original.array[vertex * original.itemSize + component];
    });
    result.setAttribute(name, new THREE.BufferAttribute(values, original.itemSize));
  }
  source.dispose();
  result.translate(0, -1.06, 0);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export const INFANTRY_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.94,
  metalness: 0,
});

// Local paint follows the built-in skinning path for figures and cupola crew.
INFANTRY_MATERIAL.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>',
    '#include <common>\nattribute float surfaceKind;\nvarying float vInfantrySurface;\nvarying vec3 vInfantryLocal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfantrySurface = surfaceKind;\nvInfantryLocal = position;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
    '#include <common>\nvarying float vInfantrySurface;\nvarying vec3 vInfantryLocal;')
    // The shared 48m world shadow map cannot resolve a nose or eye socket.
    // Keep some direct-shadow response on authored head parts; small contact
    // shadows are painted into the brow and liner. Soften coarse arm-on-jacket
    // shadow steps so the painted contact value and folded planes remain legible.
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
      'directionalLightShadow.shadowIntensity,',
      'directionalLightShadow.shadowIntensity * (0.83 - 0.19 * (1.0 - step(0.5, vInfantrySurface) + step(3.5, vInfantrySurface) - step(6.5, vInfantrySurface)) - 0.73 * (step(1.5, vInfantrySurface) - step(2.5, vInfantrySurface)) - 0.56 * (step(2.5, vInfantrySurface) - step(3.5, vInfantrySurface))),',
    ));
};
INFANTRY_MATERIAL.customProgramCacheKey = () => 'infantry-cloth-skin-shadow-v7';
applyInfantryClothFinish(INFANTRY_MATERIAL);

interface RigLeg {
  upper: THREE.Bone; lower: THREE.Bone; foot: THREE.Bone;
  hip: THREE.Vector3; knee: THREE.Vector3; ankle: THREE.Vector3;
  upperDirection: THREE.Vector3; lowerDirection: THREE.Vector3;
  upperLength: number; lowerLength: number;
  scratch: THREE.Vector3[]; inverse: THREE.Quaternion;
  contact: THREE.Vector3; swingFrom: THREE.Vector3; swingTo: THREE.Vector3;
  swingSegment: number; lift: number;
}
export interface InfantryRig {
  root: THREE.Bone; spine: THREE.Bone; head: THREE.Bone;
  skeleton: THREE.Skeleton; legs: RigLeg[]; bindSpine: THREE.Vector3;
  kneeling: boolean; movement: number; disposed: boolean;
  bound: boolean; contactReady: boolean; lastProgress: number; wasMoving: boolean;
  coverSettle: number; coverRelease: number;
  fieldSleeves?: {bone: THREE.Bone; axis: THREE.Vector3}[];
  scoutNeckSeat?:THREE.Vector3;
  sleeveBeat: number;
}

/** Nine bones / one skinned draw. Bone bind coordinates match the existing
 * authored standing and kneeling meshes, muzzle heights and hit metrics. */
export function createInfantryRig(kneeling: boolean): InfantryRig {
  const root = new THREE.Bone(); root.name = 'infantry-root';
  const spine = new THREE.Bone(); spine.name = 'spine';
  const offset = kneeling ? INFANTRY_KNEEL_OFFSET : 0;
  const bindSpine = new THREE.Vector3(0, 0.89 - offset, 0.025);
  spine.position.copy(bindSpine); root.add(spine);
  const coordinates = kneeling ? [
    [[-0.105, 0.45, 0.018], [-0.158, 0.375, -0.34], [-0.158, 0.12, -0.38]],
    [[0.105, 0.45, 0.065], [0.17, 0.125, 0.22], [0.18, 0.105, 0.55]],
  ] : [
    [[-0.103, 0.88, 0.025], [-0.12, 0.48, -0.027], [-0.13, 0.16, -0.06]],
    [[0.103, 0.88, 0.045], [0.127, 0.47, 0.085], [0.15, 0.16, 0.12]],
  ];
  const legs = coordinates.map((points, index) => {
    const [hip, knee, ankle] = points.map(point => new THREE.Vector3(point[0], point[1], point[2]));
    const upper = new THREE.Bone(), lower = new THREE.Bone(), foot = new THREE.Bone();
    upper.name = `${index ? 'right' : 'left'}-thigh`; lower.name = `${index ? 'right' : 'left'}-shin`; foot.name = `${index ? 'right' : 'left'}-foot`;
    upper.position.copy(hip); lower.position.copy(knee).sub(hip); foot.position.copy(ankle).sub(knee);
    root.add(upper); upper.add(lower); lower.add(foot);
    return { upper, lower, foot, hip, knee, ankle,
      upperDirection: knee.clone().sub(hip).normalize(), lowerDirection: ankle.clone().sub(knee).normalize(),
      upperLength: hip.distanceTo(knee), lowerLength: knee.distanceTo(ankle),
      scratch: Array.from({ length: 6 }, () => new THREE.Vector3()), inverse: new THREE.Quaternion(),
      contact: new THREE.Vector3(), swingFrom: new THREE.Vector3(), swingTo: new THREE.Vector3(),
      swingSegment: -1, lift: 0 };
  });
  const head = new THREE.Bone(); head.name = 'head';
  head.position.set(0, 1.44 - offset, 0.008).sub(bindSpine); spine.add(head);
  const skeleton = new THREE.Skeleton([root, spine,
    legs[0].upper, legs[0].lower, legs[0].foot, legs[1].upper, legs[1].lower, legs[1].foot, head]);
  return { root, spine, head, skeleton, legs, bindSpine, kneeling, movement: 0, disposed: false,
    bound: false, contactReady: false, lastProgress: 0, wasMoving: false, coverSettle: 1, coverRelease: 0, sleeveBeat: 0 };
}

export function bindInfantryRig(mesh: THREE.SkinnedMesh, rig: InfantryRig) {
  const arms: JacketArm[] | undefined=mesh.geometry.userData.fieldSleeveBinds;
  if (!rig.bound && arms) {
    if(mesh.geometry.userData.scoutNeckSeat)rig.scoutNeckSeat=new THREE.Vector3().fromArray(mesh.geometry.userData.scoutNeckSeat);
    // Optional children after the original nine indices. Non-field heroes
    // keep their original skeleton. 9 and 11 both fit Three's 8x8 bone texture.
    rig.fieldSleeves=arms.map(({shoulder,wrist},i)=>{
      const bone=new THREE.Bone();
      bone.name=i===0?'field-sleeve-left':'field-sleeve-right';
      bone.position.set(...shoulder).sub(rig.bindSpine);
      rig.spine.add(bone);
      const axis=new THREE.Vector3(...wrist).sub(new THREE.Vector3(...shoulder)).normalize();
      return {bone,axis};
    });
    const original=rig.skeleton;
    rig.skeleton=new THREE.Skeleton([...original.bones,...rig.fieldSleeves.map(s=>s.bone)]);
    original.dispose();
  }
  mesh.add(rig.root);
  mesh.updateWorldMatrix(true, true);
  // StrictMode and Suspense can detach/re-attach a posed rig. Never redefine
  // its rest matrices from an animated pose on that second attachment.
  if (!rig.bound) { mesh.bind(rig.skeleton); rig.bound = true; }
  return () => { mesh.remove(rig.root); };
}

export function releaseInfantryRig(rig: InfantryRig) {
  // React's immediate StrictMode remount reattaches before this microtask.
  queueMicrotask(() => { if (!rig.root.parent) disposeInfantryRig(rig); });
}

export function disposeInfantryRig(rig: InfantryRig) {
  if (rig.disposed) return;
  rig.skeleton.dispose(); rig.root.removeFromParent(); rig.disposed = true;
}

/** Analytic two-bone IK lets the feet remain level instead of swinging the
 * entire character around a ground-origin pivot. Scratch storage is reused. */
function poseLeg(leg: RigLeg, target: THREE.Vector3, walkingPole = 0, kneeOut = 0) {
  const [direction, bend, knee, lowerDirection, desired] = leg.scratch;
  direction.copy(target).sub(leg.hip);
  const distance = THREE.MathUtils.clamp(direction.length(), 0.025, leg.upperLength + leg.lowerLength - 0.0001);
  direction.normalize();
  target.copy(leg.hip).addScaledVector(direction, distance);
  bend.copy(leg.knee).sub(leg.hip);
  // The rear knee in the cover bind is behind the hip. Once its boot comes
  // under the pelvis, its knee must bend toward the toe, not fold backwards.
  if (walkingPole) bend.lerp(desired.set(Math.sign(leg.hip.x)*.042,0,-.36),walkingPole);
  bend.x+=kneeOut;
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 0.0001) bend.set(0, 0, -1).addScaledVector(direction, direction.z);
  bend.normalize();
  const along = (leg.upperLength ** 2 - leg.lowerLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, leg.upperLength ** 2 - along ** 2));
  knee.copy(leg.hip).addScaledVector(direction, along).addScaledVector(bend, height);
  desired.copy(knee).sub(leg.hip).normalize();
  leg.upper.quaternion.setFromUnitVectors(leg.upperDirection, desired);
  leg.inverse.copy(leg.upper.quaternion).invert();
  lowerDirection.copy(target).sub(knee).normalize().applyQuaternion(leg.inverse);
  leg.lower.quaternion.setFromUnitVectors(leg.lowerDirection, lowerDirection);
  leg.foot.quaternion.copy(leg.upper.quaternion).multiply(leg.lower.quaternion).invert();
}

export interface InfantryMotion {
  time: number; delta: number; moving: boolean; progress: number;
  phase: number; recoil: number; aimPitch?: number; lookYaw?: number;
  directionX?: number; directionZ?: number;
  worldX?: number; worldZ?: number; worldYaw?: number; worldScale?: number;
  moveFromX?: number; moveFromZ?: number; moveToX?: number; moveToZ?: number;
  standingHipDrop?: number;
  holdingRifle?: boolean;
  /** Regular field infantry only: weight over the trailing foot at rest. */
  fieldStance?: boolean;
  /** Distance already covered on a nonstandard (e.g. two-part arrival) leg. */
  walked?:number;compression?:number;
}

export function updateInfantryRig(rig: InfantryRig, pose: InfantryMotion) {
  const response = 1 - Math.exp(-Math.min(0.1, Math.max(0, pose.delta)) * 12);
  rig.movement += ((pose.moving ? 1 : 0) - rig.movement) * response;
  if (rig.movement < 0.0001) rig.movement = 0;
  const coverGait = !!pose.fieldStance && rig.kneeling;
  if (pose.moving) { rig.coverSettle = 0; rig.coverRelease = rig.movement; }
  else if (!rig.contactReady) { rig.coverSettle = 1; rig.coverRelease = 0; }
  else rig.coverSettle = Math.min(1,rig.coverSettle+Math.min(.1,Math.max(0,pose.delta))/.44);
  const takeKnee = rig.coverSettle*rig.coverSettle*(3-2*rig.coverSettle);
  const strideWeight = coverGait && !pose.moving ? rig.coverRelease*(1-takeKnee) : rig.movement;
  const settled=pose.fieldStance && !rig.kneeling ? (1-rig.movement)**2 : 0;
  const weightX=.048*settled;
  let rise = (coverGait ? .277 : rig.kneeling ? .115 : -(pose.standingHipDrop ?? .018)) * strideWeight;
  rise-=.027*settled;
  const breath = Math.sin(pose.time * 1.9 + pose.phase) * 0.005;
  rig.spine.position.copy(rig.bindSpine);
  rig.spine.position.y += breath;
  rig.spine.position.z-=.020*settled;
  rig.spine.rotation.set((pose.aimPitch ?? 0) + pose.recoil * 0.043 + rig.movement * 0.045,
    (pose.lookYaw ?? 0) * 0.48, Math.sin(pose.time * 1.3 + pose.phase) * 0.006-.039*settled);
  const carry = pose.holdingRifle ? 1 - rig.movement * .45 : 0;
  rig.head.position.set(carry * .037, 1.44 - (rig.kneeling ? INFANTRY_KNEEL_OFFSET : 0) - carry * .027, .008 - carry * .023)
    .sub(rig.bindSpine);
  rig.head.rotation.set(-(pose.aimPitch ?? 0) * .18 - carry * .095,
    (pose.lookYaw ?? 0) * .55 + Math.sin(pose.time * .47 + pose.phase) * .045,
    Math.sin(pose.time * .62 + pose.phase) * .007 - carry * .094);
  if(rig.scoutNeckSeat){
    rig.head.position.add(rig.scoutNeckSeat);
    rig.head.rotation.z-=.16;rig.head.rotation.x-=.12;
  }
  const worldX = pose.worldX ?? 0, worldZ = pose.worldZ ?? 0;
  const scale = pose.worldScale ?? 1, yaw = pose.worldYaw ?? 0;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const timeProgress = THREE.MathUtils.clamp(pose.progress, 0, 1);
  const travel = Math.hypot((pose.moveToX ?? worldX)-(pose.moveFromX ?? worldX),
    (pose.moveToZ ?? worldZ)-(pose.moveFromZ ?? worldZ));
  const longLeg=travel>1.3||pose.walked!==undefined;
  const ease = (value: number) => value * value * (3 - 2 * value);
  const progress = pose.walked??(longLeg?ease(timeProgress):timeProgress);
  const starting = pose.moving && (!rig.wasMoving || progress < rig.lastProgress);
  const active = pose.moving || (rig.wasMoving && progress >= 1);
  // Preserve the four planted steps of a short cover shift. Around a building
  // use repeated footfalls instead of stretching four ankle targets for meters.
  const steps = longLeg ? Math.max(4,Math.ceil(travel/(pose.fieldStance ? .33 : .25))) : 4*Math.max(1,Math.ceil(travel/.8));
  const segment = Math.min(steps-1, Math.floor(progress * steps));
  const step = Math.min(1, progress * steps - segment);
  if (rig.fieldSleeves && (active || rig.sleeveBeat)) {
    // Opposing elbow planes follow the actual planted-foot exchange, not an
    // idle clock. This also follows the two-part transport arrival's distance.
    const targetBeat = active && travel>.025 ? Math.sin(Math.PI * (segment + step)) * rig.movement : 0;
    rig.sleeveBeat += (targetBeat-rig.sleeveBeat)*response*(2-response);
    if (Math.abs(rig.sleeveBeat)<.0001) rig.sleeveBeat=0;
    const [left,right]=rig.fieldSleeves;
    left.bone.quaternion.setFromAxisAngle(left.axis, .23*rig.sleeveBeat);
    right.bone.quaternion.setFromAxisAngle(right.axis, -.20*rig.sleeveBeat);
  }
  rig.legs.forEach((leg, index) => {
    // The loaded scout catches weight on a wide forward boot, then brings
    // the other under the bag. Offset landing targets in the actor frame,
    // not an already-planted bone; the world contacts still own each step.
    const staggerX=rig.scoutNeckSeat?(index?.044:-.103):0,staggerZ=rig.scoutNeckSeat?(index?.032:-.063):0;
    const standX=leg.ankle.x+staggerX,standZ=leg.ankle.z+staggerZ;
    const restX = (cos * standX + sin * standZ) * scale;
    const restZ = (-sin * standX + cos * standZ) * scale;
    if (!rig.contactReady || starting) {
      leg.contact.set((starting ? pose.moveFromX ?? worldX : worldX) + restX, 0,
        (starting ? pose.moveFromZ ?? worldZ : worldZ) + restZ);
      leg.swingSegment = -1;
    }
    leg.lift = 0;
    if (active && (segment + Number(coverGait)) % 2 === index) {
      if (leg.swingSegment !== segment) {
        leg.swingFrom.copy(leg.contact);
        // A step lands ahead of the hip so the support boot can stay where it
        // lands through the opposite swing. Neither boot walks in its cover bind.
        const next = Math.min(1,(segment + (pose.fieldStance?1.5:1))/steps);
        const landing = longLeg?next:ease(next);
        const z = (coverGait ? leg.hip.z : leg.ankle.z)+staggerZ*1.5;
        const x = (coverGait ? leg.hip.x : leg.ankle.x)+staggerX;
        leg.swingTo.set(THREE.MathUtils.lerp(pose.moveFromX ?? worldX, pose.moveToX ?? worldX, landing)+(cos*x+sin*z)*scale,0,
          THREE.MathUtils.lerp(pose.moveFromZ ?? worldZ, pose.moveToZ ?? worldZ, landing)+(-sin*x+cos*z)*scale);
        leg.swingSegment = segment;
      }
      leg.contact.lerpVectors(leg.swingFrom, leg.swingTo, ease(step));
      leg.lift = Math.sin(step * Math.PI) * 0.1;
    } else if (active && leg.swingSegment >= 0 && leg.swingSegment < segment) {
      leg.contact.copy(leg.swingTo);
    } else if (!active && coverGait && rig.coverSettle<1) {
      // Root translation has ended. Place the lead boot, then step the other
      // back and lower onto the knee; never slide both soles along the ground.
      const settleStep=THREE.MathUtils.clamp(rig.coverSettle*2-index,0,1);
      if(leg.swingSegment!==-2){leg.swingFrom.copy(leg.contact);leg.swingSegment=-2;}
      leg.swingTo.set(worldX+restX,0,worldZ+restZ);
      leg.contact.lerpVectors(leg.swingFrom,leg.swingTo,ease(settleStep));
      leg.lift=.075*Math.sin(Math.PI*settleStep);
    } else if (!active) {
      // Settle back into the authored kneeling cover pose after the last step.
      // Breathing/recoil never moves the contact point or rotates the whole body.
      const settle = 1 - Math.exp(-Math.max(0, pose.delta) * 12);
      leg.contact.x += (worldX + restX - leg.contact.x) * settle;
      leg.contact.z += (worldZ + restZ - leg.contact.z) * settle;
    }
    const target = leg.scratch[5].copy(leg.ankle);
    const dx = (leg.contact.x - worldX) / scale, dz = (leg.contact.z - worldZ) / scale;
    // Translate the pelvis, not the boots. Compensate in the leg solver
    // before finding each knee, including on the first takeoff frame.
    target.x = cos * dx - sin * dz-weightX; target.z = sin * dx + cos * dz;
    target.y += leg.lift;
    const horizontal = Math.hypot(target.x - leg.hip.x, target.z - leg.hip.z);
    const reach = leg.upperLength + leg.lowerLength - 0.002;
    const vertical = leg.hip.y - target.y;
    // Raise the crouched hips only as far as both planted feet can reach.
    rise = Math.min(rise, Math.sqrt(Math.max(0, reach * reach - horizontal * horizontal)) - vertical);
  });
  rise = Math.max(rig.kneeling ? 0 : -Math.max(0.035, pose.standingHipDrop ?? 0), rise);
  rise-=.105*(pose.compression??0);
  rig.root.position.x=weightX;
  rig.root.position.y = rise;
  rig.legs.forEach((leg,index) => {
    const target = leg.scratch[5];
    target.y -= rise;
    const vertical = leg.hip.y - target.y, reach = leg.upperLength + leg.lowerLength - 0.001;
    const maxHorizontal = Math.sqrt(Math.max(0, reach * reach - vertical * vertical));
    const dx = target.x - leg.hip.x, dz = target.z - leg.hip.z, horizontal = Math.hypot(dx, dz);
    if (horizontal > maxHorizontal) {
      target.x = leg.hip.x + dx * maxHorizontal / horizontal;
      target.z = leg.hip.z + dz * maxHorizontal / horizontal;
    }
    poseLeg(leg, target, coverGait ? strideWeight : 0,rig.scoutNeckSeat?(index?.044:-.101):0);
    if(rig.scoutNeckSeat)leg.foot.rotateY(index?-.09:.19);
  });
  rig.contactReady = true; rig.wasMoving = pose.moving; rig.lastProgress = progress;
  rig.root.updateMatrixWorld(true);
}

/** CPU socket/weapon transform is exactly the skinning matrix of bone1. */
export function applyInfantryWeaponPose(group: THREE.Group, rig: InfantryRig) {
  group.quaternion.copy(rig.spine.quaternion);
  group.position.copy(rig.bindSpine).applyQuaternion(group.quaternion).multiplyScalar(-1)
    .add(rig.spine.position).add(rig.root.position);
}

export function infantrySocketPosition(out: THREE.Vector3, bind: THREE.Vector3, rig: InfantryRig) {
  return out.copy(bind).sub(rig.bindSpine).applyQuaternion(rig.spine.quaternion)
    .add(rig.spine.position).add(rig.root.position);
}

export {createFieldSackShell as createCanvasSandbagGeometry} from './fieldSackShell';

// Five-stroke lot numbers are printed into a few courses of jute, in local
// coordinates. Only the facing, rubbed cloth takes dye. No emissive label,
// geometry, texture reads or screen-aligned pattern added to the world.
const sackLotInk = `
float sackLot(vec2 p,vec2 seed,vec3 local,float fibril){
  vec2 mark=vec2(p.x*129.+13.+(fract(seed.x*.193)-.5)*12.,
     3.-(p.y+.008*sin(p.x*19.+seed.x))*118.);
  vec2 dx=dFdx(mark),dy=dFdy(mark);
  float width=max(length(dx),length(dy));
  if(width>1.2 || mark.x<0. || mark.y<0. || mark.x>=27. || mark.y>=5. || abs(local.x)>.77) return 0.;
  ivec2 cell=ivec2(floor(mark)); int lane=cell.x/4, col=cell.x-lane*4;
  int tag=int(mod(floor(seed.x*.31)+float(lane*7)+floor(seed.y*.29)*float(lane+1),10.));
  const int bits[10]=int[10](31599,29850,29671,31207,18925,31183,31691,9383,31727,27119);
  if(col>2 || (bits[tag] & (1<<(cell.y*3+col)))==0) return 0.;
  float rub=.57+.43*smoothstep(.05,.66,fibril);
  return rub*(1.-smoothstep(.42,1.2,width))*smoothstep(.34,.76,abs(local.z))
    *(.62+.38*fract(seed.y*.257))*(1.-smoothstep(.48,.78,abs(local.y)));
}`;

export function createCanvasSandbagMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.98 });
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceCipherMap={value:surfaceCipherAtlas()};
    shader.uniforms.sackYarns={value:sackWeave()};
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 sackFinish;varying vec2 vBagFinish;varying vec3 vBagLocal;\n'+cipherVaryings)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBagFinish=sackFinish;vBagLocal = position;\n'+cipherVertex);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vBagFinish;varying vec3 vBagLocal; uniform sampler2D sackYarns;\n'+cipherVaryings+cipherGLSL+sackLotInk)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float sewnEnd = 1.0 - smoothstep(0.014, 0.046, abs(abs(vBagLocal.x) - 0.82));
        float creases = sin(vBagLocal.x * 8.0 + sin(vBagLocal.z * 4.2)) * 0.045;
        vec2 sackUV=vec2(vCipherLocal.x,vCipherLocal.y-.73*vCipherLocal.z);
        vec2 biasWeave=mat2(.88,-.475,.475,.88)*sackUV;
        vec2 sag=vec2(.009*sin(sackUV.y*14.+sackUV.x*6.),.014*sin(sackUV.x*13.+vCipherPhase.x));
        vec3 yarn=texture2D(sackYarns,(biasWeave+sag)*vec2(6.9,7.6)+vCipherPhase*.021).rgb;
        float lay=1.-smoothstep(.006,.035,length(fwidth(sackUV)));
        float seam=.50+.065*cos(vBagLocal.x*3.5)+.047*vBagLocal.x;
        float dist=abs(vBagLocal.y-seam);
        float piping=1.-smoothstep(.012,.064,dist);
        float stitch=piping*smoothstep(-.20,.58,cos(vCipherLocal.x*220.))*lay;
        float hemShadow=1.-smoothstep(.009,.073,abs(vBagLocal.y-seam+.073));
        vec2 sackInk=cipherField((biasWeave+sag)*vec2(72.,59.)+vCipherPhase);
        float rub=smoothstep(.20,.82,yarn.g*.82+yarn.b*.25);
        float weave=mix(1.,.57+.79*yarn.r,lay);
        diffuseColor.rgb *= (weave*(.98+creases-.21*sewnEnd-.14*hemShadow)+.17*stitch)
          * (vec3(1.-.16*sackInk.g*mix(.42,1.,rub))+sackInk.r*vec3(.60,.46,.27)*(.32+.88*rub));
        float dye=sackLot(sackUV,vCipherPhase,vBagLocal,yarn.b);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.24,.28,.33),dye);
        diffuseColor.rgb*=vBagFinish.x*mix(vec3(1.),vec3(1.58,1.30,.86),smoothstep(.20,.90,vBagFinish.y));`);
  };
  material.customProgramCacheKey = () => 'painted-canvas-sandbag-folded-mouth-v4';
  return applyPaintedFinish(material, { scale: 0.9, strength: 0.85, edge: 0.5, direction: 'horizontal' });
}
