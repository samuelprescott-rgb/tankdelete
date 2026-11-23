import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = [number, number, number];
type Station = [number, number, number, number];

/** F-4C presentation frame: +X is forward, matching the existing flight path.
 * Ratios follow the NMUSAF F-4C photographs, not an imported game asset.
 * World scale, strike release point and flight timing belong to the caller. */
export const PHANTOM_SHAPE = {
  noseX: 4.8,
  nozzleX: -3.48,
  halfSpan: 2.64,
  outerWingRise: 0.17,
  stabilatorDrop: 0.55,
  canopyCenters: [0.57, 1.57] as const,
  exhaustOffsets: [-0.32, 0.32] as const,
};

function loftX(stations: Station[], sides = 12) {
  const positions: number[] = [], indices: number[] = [];
  for (const [x, radiusY, radiusZ, centreY] of stations) {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      positions.push(x, centreY + Math.cos(angle) * radiusY, Math.sin(angle) * radiusZ);
    }
  }
  for (let ring = 0; ring < stations.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side, b = ring * sides + (side + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const last = (stations.length - 1) * sides;
  for (let side = 1; side < sides - 1; side++) {
    indices.push(0, side + 1, side, last, last + side, last + side + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A thin, closed convex panel, with the second surface behind `normal`. */
function panel(points: Point[], normal: Point, thickness = 0.036) {
  const direction = new THREE.Vector3(...normal).normalize();
  const positions: number[] = [], indices: number[] = [];
  for (const layer of [0.5, -0.5]) for (const point of points) {
    positions.push(point[0] + direction.x * thickness * layer,
      point[1] + direction.y * thickness * layer, point[2] + direction.z * thickness * layer);
  }
  const count = points.length;
  const a = new THREE.Vector3(...points[0]), b = new THREE.Vector3(...points[1]), c = new THREE.Vector3(...points[2]);
  const reverse = b.sub(a).cross(c.sub(a)).dot(direction) < 0;
  for (let side = 1; side < count - 1; side++) {
    if (reverse) indices.push(0, side + 1, side, count, count + side, count + side + 1);
    else indices.push(0, side, side + 1, count, count + side + 1, count + side);
  }
  for (let side = 0; side < count; side++) {
    const next = (side + 1) % count;
    if (reverse) indices.push(side, next, side + count, next, next + count, side + count);
    else indices.push(side, side + count, next, next, side + count, next + count);
  }
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  source.setIndex(indices);
  const geometry = source.toNonIndexed(); source.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

function painted(geometry: THREE.BufferGeometry, color?: string) {
  geometry.deleteAttribute('uv');
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.count * 3);
  const olive = new THREE.Color('#697457'), tan = new THREE.Color('#8a7958');
  const green = new THREE.Color('#415847'), underside = new THREE.Color('#8f9787');
  const warm = new THREE.Color('#c3b58c'), cool = new THREE.Color('#344b46');
  const base = new THREE.Color(), fixed = color ? new THREE.Color(color) : null;
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const x = positions.getX(vertex), y = positions.getY(vertex), z = positions.getZ(vertex);
    const up = normals.getY(vertex);
    const field = Math.sin(x * 1.45 + Math.sin(z * 1.9)) + Math.cos(z * 2.3 - x * 0.6 + y);
    base.copy(fixed ?? olive);
    if (!fixed) {
      base.lerp(tan, THREE.MathUtils.smoothstep(field, 0.12, 0.74));
      base.lerp(green, 1 - THREE.MathUtils.smoothstep(field, -0.66, -0.11));
      base.lerp(underside, (1 - THREE.MathUtils.smoothstep(up, -0.64, -0.2)) * (1 - THREE.MathUtils.smoothstep(y, 0.08, 0.18)));
    }
    base.lerp(warm, Math.max(0, up) * 0.12);
    base.lerp(cool, Math.max(0, -up) * 0.08);
    colors.set([base.r, base.g, base.b], vertex * 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]) {
  const flat = parts.map(part => part.index ? part.toNonIndexed() : part);
  const geometry = mergeGeometries(flat, false);
  for (const part of new Set([...parts, ...flat])) part.dispose();
  if (!geometry) throw new Error('Unable to merge Phantom airframe');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function canopyBand(x: number, y: number, radiusY: number, radiusZ: number) {
  const points: THREE.Vector3[] = [];
  for (let step = 0; step <= 8; step++) {
    const angle = step / 8 * Math.PI;
    points.push(new THREE.Vector3(x, y + Math.sin(angle) * radiusY, Math.cos(angle) * radiusZ));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, 0.018, 5, false);
}

export function createPhantomGeometries() {
  const body: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [];
  body.push(painted(loftX([
    [-3.30, 0.23, 0.56, 0.01], [-2.62, 0.32, 0.60, 0.04],
    [-1.45, 0.38, 0.63, 0.025], [0, 0.40, 0.58, 0.015],
    [1.30, 0.35, 0.46, 0], [2.38, 0.30, 0.335, -0.025], [2.88, 0.245, 0.275, -0.055],
  ])));
  dark.push(painted(loftX([
    [2.87, 0.246, 0.276, -0.055], [3.55, 0.19, 0.22, -0.065],
    [4.30, 0.105, 0.12, -0.095], [PHANTOM_SHAPE.noseX, 0.006, 0.006, -0.11],
  ]), '#293630'));

  for (const side of [-1, 1]) {
    // The outer panels turn upward; only the horizontal stabilators droop.
    body.push(painted(panel([[0.68, -0.15, side * 0.46], [-0.55, -0.15, side * 1.85],
      [-1.64, -0.15, side * 1.85], [-1.53, -0.15, side * 0.46]], [0, 1, 0])));
    body.push(painted(panel([[-0.55, -0.15, side * 1.85], [-1.18, 0.02, side * 2.64],
      [-1.95, 0.02, side * 2.56], [-1.64, -0.15, side * 1.85]], [0, 1, 0])));
    body.push(painted(panel([[-2.14, 0.24, side * 0.40], [-3.08, -0.31, side * 1.70],
      [-3.62, -0.31, side * 1.62], [-3.04, 0.24, side * 0.40]], [0, 1, 0], 0.027)));

    const intake = loftX([[-1.35, 0.245, 0.245, -0.065], [0.18, 0.305, 0.245, -0.025],
      [1.15, 0.275, 0.175, 0.005]], 8).translate(0, 0, side * 0.57);
    body.push(painted(intake));
    // Dark inset intake mouth faces forward; splitter is separate from the fuselage.
    dark.push(painted(new THREE.PlaneGeometry(0.29, 0.43).rotateY(Math.PI / 2)
      .translate(1.16, 0.005, side * 0.57), '#101916'));
    body.push(painted(panel([[1.38, -0.21, side * 0.405], [1.23, 0.29, side * 0.405],
      [0.41, 0.28, side * 0.405], [0.38, -0.22, side * 0.405]], [0, 0, side], 0.025)));

    const exhaustZ = side * 0.32;
    body.push(painted(loftX([[-3.21, 0.258, 0.27, -0.14], [-2.47, 0.29, 0.30, -0.115],
      [-1.2, 0.30, 0.30, -0.09]], 10).translate(0, 0, exhaustZ)));
    dark.push(painted(new THREE.CylinderGeometry(0.285, 0.30, 0.37, 12, 1, true)
      .rotateZ(Math.PI / 2).translate(-3.30, -0.14, exhaustZ), '#303530'));
    dark.push(painted(new THREE.CircleGeometry(0.252, 12).rotateY(-Math.PI / 2)
      .translate(-3.476, -0.14, exhaustZ), '#111816'));
    // An emissive core stays local to the existing light mesh at altitude;
    // no temporary scene light changing all terrain/actor shader programs.
    const glow = painted(new THREE.CircleGeometry(0.104, 10).rotateY(-Math.PI / 2)
      .translate(PHANTOM_SHAPE.nozzleX, -0.14, exhaustZ), '#ff9450');
    const glowColors = glow.getAttribute('color');
    for (let i = 0; i < glowColors.count; i++) {
      glowColors.setXYZ(i, glowColors.getX(i) * 1.65, glowColors.getY(i) * 1.65, glowColors.getZ(i) * 1.65);
    }
    lights.push(glow);

    body.push(painted(loftX([[-1.27, 0.025, 0.025, -0.51], [-1.06, 0.15, 0.15, -0.51],
      [0.76, 0.155, 0.155, -0.51], [1.07, 0.022, 0.022, -0.51]], 8)
      .translate(-0.16, 0, side * 1.30), '#586147'));
    body.push(painted(new THREE.BoxGeometry(0.72, 0.23, 0.06).translate(-0.28, -0.28, side * 1.30), '#3b4738'));
    lights.push(painted(new THREE.SphereGeometry(0.045, 6, 4)
      .translate(-1.62, 0.045, side * 2.60), side < 0 ? '#d9553c' : '#87b798'));
  }

  body.push(painted(panel([[-3.38, 0.12, 0], [-3.43, 1.56, 0], [-2.76, 1.48, 0],
    [-1.93, 0.22, 0]], [0, 0, 1], 0.055)));
  for (const [front, rear] of [[0.13, 1.02], [1.02, 2.31]]) {
    const mid = (front + rear) * 0.5;
    glass.push(painted(loftX([[front, 0.16, 0.245, 0.38], [mid, 0.32, 0.285, 0.39],
      [rear, front > 1 ? 0.10 : 0.22, front > 1 ? 0.18 : 0.25, 0.38]], 12), '#4f7372'));
  }
  for (const [x, radiusY, radiusZ] of [[0.15, 0.18, 0.25], [1.03, 0.24, 0.26], [2.25, 0.13, 0.21]]) {
    body.push(painted(canopyBand(x, 0.39, radiusY, radiusZ), '#414b3f'));
  }
  return { body: merge(body), dark: merge(dark), glass: merge(glass), lights: merge(lights) };
}
