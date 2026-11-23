import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = [x: number, y: number, z: number];

const WING_ROOT = new THREE.Color('#694b35');
const WING_SHADE = new THREE.Color('#3c3229');
const FEATHER_RIDGE = new THREE.Color('#b4895d');
const FEATHER_TIP = new THREE.Color('#3a3027');

/** The upper wing is a shaped surface, with individually painted primary
 * feathers breaking the silhouette. Both faces carry color for the flyover. */
export function createPaintedEagleWing(side: -1 | 1) {
  const positions: number[] = [], colors: number[] = [];
  const triangle = (a: Point, b: Point, c: Point, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color) => {
    positions.push(...a, ...(side > 0 ? b : c), ...(side > 0 ? c : b));
    colors.push(ca.r, ca.g, ca.b);
    for (const color of side > 0 ? [cb, cc] : [cc, cb]) colors.push(color.r, color.g, color.b);
  };

  // Span, leading edge, trailing edge, elevation, and thickness of each section.
  const stations = [
    [0.04, 0.66, -0.53, 0.01, 0.13],
    [0.61, 0.39, -0.66, 0.025, 0.15],
    [1.23, 0.02, -0.71, 0.035, 0.11],
    [1.93, -0.43, -0.89, 0.05, 0.075],
    [2.55, -0.72, -1.03, 0.06, 0.03],
  ];
  const wingSection = ([span, front, back, y, depth]: number[], upper: number): Point[] => [
    [front, y, span * side],
    [THREE.MathUtils.lerp(front, back, 0.37), y + upper * depth, span * side],
    [back, y - 0.02, span * side],
  ];
  for (const upper of [1, -0.65]) {
    const tone = upper > 0 ? FEATHER_RIDGE : WING_ROOT;
    const rim = upper > 0 ? WING_ROOT : WING_SHADE;
    for (let section = 1; section < stations.length; section++) {
      const a = wingSection(stations[section - 1], upper), b = wingSection(stations[section], upper);
      for (let chord = 0; chord < 2; chord++) {
        const inner = chord === 0 ? rim : tone, outer = chord === 0 ? tone : rim;
        if (upper > 0) {
          triangle(a[chord], a[chord + 1], b[chord + 1], inner, outer, outer);
          triangle(a[chord], b[chord + 1], b[chord], inner, outer, inner);
        } else {
          triangle(a[chord], b[chord + 1], a[chord + 1], inner, outer, outer);
          triangle(a[chord], b[chord], b[chord + 1], inner, inner, outer);
        }
      }
    }
  }

  for (let feather = 0; feather < 11; feather++) {
    const progress = feather / 10;
    const span = THREE.MathUtils.lerp(0.48, 2.52, progress);
    const rootX = THREE.MathUtils.lerp(-0.12, -0.81, progress);
    const tipSpan = span + 0.05 + progress * 0.51;
    const tipX = THREE.MathUtils.lerp(-0.98, -1.44, Math.sin(progress * Math.PI * 0.5));
    const width = THREE.MathUtils.lerp(0.19, 0.10, progress);
    const y = 0.038 + progress * 0.027;
    const root: Point = [rootX, y, span * side];
    const ridge: Point = [THREE.MathUtils.lerp(rootX, tipX, 0.47), y + 0.018, (span + progress * 0.19) * side];
    const leading: Point = [ridge[0] + width * 0.31, y - 0.02, ridge[2] + width * side];
    const trailing: Point = [ridge[0] - width * 0.31, y - 0.016, ridge[2] - width * side];
    const tip: Point = [tipX, y - 0.025, tipSpan * side];
    const light = WING_ROOT.clone().lerp(FEATHER_RIDGE, feather % 3 === 1 ? 0.43 : 0.25);
    triangle(root, trailing, ridge, WING_ROOT, WING_SHADE, light);
    triangle(trailing, tip, ridge, WING_SHADE, FEATHER_TIP, light);
    triangle(root, ridge, leading, WING_ROOT, light, WING_SHADE);
    triangle(ridge, tip, leading, light, FEATHER_TIP, WING_SHADE);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function bodyPart(geometry: THREE.BufferGeometry, pigment: string, highlight: string) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  if (source !== geometry) geometry.dispose();
  source.deleteAttribute('uv');
  const normals = source.getAttribute('normal');
  const base = new THREE.Color(pigment), warm = new THREE.Color(highlight), shade = new THREE.Color();
  const colors = new Float32Array(normals.count * 3);
  for (let vertex = 0; vertex < normals.count; vertex++) {
    const up = normals.getX(vertex) * 0.22 + normals.getY(vertex) * 0.85 - normals.getZ(vertex) * 0.37;
    shade.copy(base).lerp(warm, THREE.MathUtils.smoothstep(up, -0.27, 0.83));
    colors.set([shade.r, shade.g, shade.b], vertex * 3);
  }
  source.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return source;
}

/** Baked directional color keeps the bird readable in the night waves. */
export function createPaintedEagleBody() {
  const parts = [
    bodyPart(new THREE.SphereGeometry(1, 14, 8).scale(1.12, 0.36, 0.33), '#4b3427', '#99714e'),
    bodyPart(new THREE.SphereGeometry(1, 12, 8).scale(0.47, 0.34, 0.30).translate(0.79, 0.13, 0), '#a59f8f', '#efe6cb'),
    bodyPart(new THREE.SphereGeometry(1, 9, 6).scale(0.25, 0.127, 0.135).translate(1.18, 0.103, 0), '#9a642b', '#e7b64d'),
    bodyPart(new THREE.ConeGeometry(0.11, 0.24, 7).rotateZ(Math.PI).translate(1.34, 0.015, 0), '#93612b', '#c48d36'),
  ];
  for (const side of [-1, 1]) {
    parts.push(bodyPart(new THREE.SphereGeometry(1, 7, 5).scale(0.058, 0.044, 0.026)
      .translate(1.025, 0.20, side * 0.262), '#422c1c', '#d5a254'));
    parts.push(bodyPart(new THREE.SphereGeometry(1, 7, 5).scale(0.022, 0.025, 0.014)
      .translate(1.041, 0.20, side * 0.281), '#191813', '#38271e'));
  }
  for (let tail = -2; tail <= 2; tail++) {
    parts.push(bodyPart(new THREE.SphereGeometry(1, 8, 4).scale(0.44, 0.053, 0.09)
      .rotateY(tail * 0.17).translate(-1.02, -0.04, tail * 0.115), '#9c9485', '#e1dbc5'));
  }
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (!geometry) throw new Error('Unable to assemble eagle body');
  return geometry;
}
