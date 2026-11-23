import * as THREE from 'three';

type Point = [number, number, number];
// Bottom to top: height, half width, half depth, depth offset, width offset.
type Ring = [number, number, number, number, number?];

/** Original low-budget undead geometry. Every part remains in the established
 * instance-local frame; no new actor, skeleton, light or gameplay socket. */
function finish(geometry: THREE.BufferGeometry, tint: number | string = '#ffffff', localPigment = false) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  result.deleteAttribute('uv');
  const positions = result.getAttribute('position'), color = new THREE.Color(tint);
  const normals = result.getAttribute('normal');
  const colors = new Float32Array(positions.count * 3), surfaces = new Float32Array(positions.count);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const x = positions.getX(vertex), y = positions.getY(vertex), z = positions.getZ(vertex);
    const upper = THREE.MathUtils.smoothstep(normals.getY(vertex), -0.75, 0.8);
    const pigment = 0.93 + Math.sin(x * 13 + y * 17 + z * 22) * 0.10
      + Math.sin(x * 10 - y * 19 + z * 17) * 0.045;
    colors.set([
      color.r * pigment * (0.78 + 0.46 * upper),
      color.g * pigment * (0.84 + 0.35 * upper),
      color.b * pigment * (1.05 + 0.02 * upper),
    ], vertex * 3);
    surfaces[vertex] = localPigment ? 1 : 0;
  }
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setAttribute('zombieLocalPigment', new THREE.Float32BufferAttribute(surfaces, 1));
  return result;
}

function merge(parts: THREE.BufferGeometry[]) {
  const arrays: Record<string, number[]> = { position: [], normal: [], color: [], zombieLocalPigment: [] };
  for (const geometry of parts) {
    for (const name of Object.keys(arrays)) arrays[name].push(...geometry.getAttribute(name).array);
    geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, array] of Object.entries(arrays)) geometry.setAttribute(name,
    new THREE.Float32BufferAttribute(array, name === 'zombieLocalPigment' ? 1 : 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function ringsGeometry(rings: Ring[], sides = 10, ragged = false) {
  const vertices: number[] = [], indices: number[] = [];
  rings.forEach(([y, rx, rz, z, x = 0], row) => {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const fold = 1 + Math.sin(angle * 3 + row * 1.1) * 0.045
        + Math.cos(angle * 5 - row * 0.95) * 0.026;
      const tear = ragged && row === 0 ? (side % 3 === 0 ? -0.022 : side % 3 === 1 ? 0.012 : -0.007) : 0;
      vertices.push(x + Math.sin(angle) * rx * fold, y + tear, z + Math.cos(angle) * rz * fold);
      if (row < rings.length - 1) {
        const a = row * sides + side, b = row * sides + (side + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  });
  const last = (rings.length - 1) * sides;
  for (let side = 1; side < sides - 1; side++) indices.push(0, side + 1, side, last, last + side, last + side + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function oval(position: Point, scale: Point, tint: number | string, flesh = false, width = 8, height = 5) {
  const geometry = new THREE.SphereGeometry(1, width, height);
  geometry.scale(...scale).translate(...position);
  return finish(geometry, tint, flesh);
}

function rod(a: Point, b: Point, r1: number, r2: number, tint: number | string, flesh = false, sides = 6) {
  const first = new THREE.Vector3(...a), second = new THREE.Vector3(...b), delta = second.clone().sub(first);
  const geometry = new THREE.CylinderGeometry(r2, r1, delta.length(), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  const centre = first.add(second).multiplyScalar(0.5);
  geometry.translate(centre.x, centre.y, centre.z);
  return finish(geometry, tint, flesh);
}

function patch(points: Point[], tint: number | string, flesh = false) {
  const positions: number[] = [];
  for (let vertex = 1; vertex < points.length - 1; vertex++) positions.push(...points[0], ...points[vertex + 1], ...points[vertex]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return finish(geometry, tint, flesh);
}

// Torn, unbleached web canvas caught over one shoulder. The ridge turns over
// the shoulder into a shorter, dirty back flap. Its large quiet plane survives
// the far-bank chase scale, unlike individual stitches or a rim highlight.
function shoulderCanvas() {
  const rails: [Point, Point, Point][] = [
    [[-.047, .025, -.133], [.003, -.002, -.147], [.105, .082, -.145]],
    [[-.017, .167, -.155], [.070, .148, -.160], [.181, .163, -.111]],
    [[.065, .316, -.085], [.149, .285, -.089], [.251, .218, -.028]],
    [[.077, .329, -.009], [.178, .293, .006], [.255, .223, .039]],
    [[.072, .289, .095], [.159, .265, .105], [.234, .202, .084]],
    [[.026, .103, .159], [.088, .084, .158], [.194, .151, .107]],
  ];
  const swatches = ['#d3c4af', '#f4e3cd', '#ecddc6', '#d7cbb5', '#aea796'];
  const parts: THREE.BufferGeometry[] = [];
  for (let row = 0; row < rails.length - 1; row++) {
    for (let col = 0; col < 2; col++) {
      // Each fold gets its own painted value; no new material or render batch.
      parts.push(patch([rails[row][col], rails[row][col + 1],
        rails[row + 1][col + 1], rails[row + 1][col]], swatches[row], true));
    }
  }
  return merge(parts);
}

export function createZombieTorsoGeometry() {
  const geometry = ringsGeometry([
    [-0.33, 0.174, 0.112, 0.024], [-0.26, 0.184, 0.121, 0.020],
    [-0.185, 0.162, 0.095, 0.014, -0.014], [-0.106, 0.159, 0.111, 0.01, -0.015],
    [-0.02, 0.184, 0.129, 0.006, -0.008], [0.14, 0.223, 0.147, 0.003],
    [0.228, 0.245, 0.125, 0.011], [0.278, 0.185, 0.101, 0.008],
    [0.34, 0.062, 0.058, -0.024],
  ], 12, true);
  const p = geometry.getAttribute('position');
  for (let vertex = 0; vertex < p.count; vertex++) {
    const x = p.getX(vertex), y = p.getY(vertex);
    // One collapsed shoulder and unequal ragged hem break mannequin symmetry.
    if (y > 0.19 && x < -0.09) p.setY(vertex, y - 0.037);
  }
  geometry.computeVertexNormals();
  const shirt = finish(geometry);
  const positions = shirt.getAttribute('position'), colors = shirt.getAttribute('color');
  // Faded canvas is lighter on the outside of folds and dark under the belt.
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i), z = positions.getZ(i);
    const crease = y < -0.20 ? 0.73 : z < -0.115 && y > -0.05 ? 1.11 : 0.94;
    colors.setXYZ(i, colors.getX(i) * crease, colors.getY(i) * crease, colors.getZ(i) * crease);
  }
  const parts = [shirt, shoulderCanvas()];
  // Neck and split collar join the pitched torso to the head, with separate
  // inward and outward folds cut into the same silhouette.
  parts.push(finish(ringsGeometry([
    [0.288, 0.065, 0.061, -0.025], [0.365, 0.049, 0.044, -0.024],
    [0.425, 0.053, 0.049, -0.048],
  ], 8), '#b7bd99', true));
  parts.push(patch([[-0.065, 0.344, -0.071], [-0.125, 0.252, -0.103], [-0.066, 0.177, -0.146],
    [-0.029, 0.253, -0.145]], '#827f63'));
  parts.push(patch([[0.057, 0.344, -0.075], [0.026, 0.256, -0.15],
    [0.073, 0.227, -0.150], [0.133, 0.27, -0.106]], '#727861'));
  parts.push(patch([[-0.033, 0.253, -0.153], [-0.003, 0.211, -0.158], [-0.01, -0.188, -0.108],
    [-0.035, -0.2, -0.108]], '#788678'));
  // An open pocket and folded flap sit on the shape of the chest.
  parts.push(patch([[0.071, 0.115, -0.142], [0.079, 0.032, -0.124], [0.153, 0.041, -0.113],
    [0.184, 0.125, -0.096]], '#b0b49c'));
  parts.push(patch([[0.067, 0.127, -0.149], [0.113, 0.105, -0.143], [0.18, 0.12, -0.108],
    [0.177, 0.148, -0.101], [0.075, 0.159, -0.146]], '#d4cfac'));
  // The rip is dark painted textile with pale frayed edges.
  parts.push(patch([[-0.166, 0.113, -0.116], [-0.141, 0.094, -0.135], [-0.121, 0.106, -0.145],
    [-0.118, 0.016, -0.142], [-0.084, -0.017, -0.144], [-0.167, 0.019, -0.117]], '#59443b'));
  parts.push(patch([[-0.166, 0.113, -0.119], [-0.142, 0.091, -0.138],
    [-0.123, 0.106, -0.148], [-0.143, 0.104, -0.137]], '#d7c293'));
  parts.push(finish(ringsGeometry([[-0.26, 0.178, 0.119, 0.019], [-0.217, 0.176, 0.119, 0.018]], 10), '#7b7257'));
  parts.push(patch([[-0.048, -0.21, -0.105], [-0.048, -0.262, -0.115],
    [0.022, -0.26, -0.115], [0.027, -0.211, -0.106]], '#c9b981'));
  return merge(parts);
}

export function createZombieArmGeometry() {
  // The pivot sits inside the shoulder. One continuous canvas volume bends
  // through the elbow and gathers at a torn cuff.
  const sleeve = finish(ringsGeometry([
    [-0.377, 0.031, 0.042, -0.217], [-0.351, 0.036, 0.041, -0.201],
    [-0.29, 0.043, 0.049, -0.165], [-0.236, 0.047, 0.054, -0.115],
    [-0.197, 0.056, 0.05, -0.078],
    [-0.061, 0.067, 0.066, -0.008], [-0.005, 0.073, 0.075, 0.003],
    [0.049, 0.052, 0.058, 0.005],
  ], 8, true));
  const parts = [
    sleeve,
    finish(ringsGeometry([
      [-0.466, 0.035, 0.028, -0.288, 0.005], [-0.44, 0.037, 0.033, -0.271],
      [-0.408, 0.023, 0.024, -0.255], [-0.355, 0.026, 0.027, -0.215],
    ], 7), '#9ca888', true),
  ];
  for (const [x, length] of [[-0.021, 0.047], [-0.005, 0.064], [0.013, 0.057], [0.029, 0.04]]) {
    parts.push(rod([x, -0.462, -0.294], [x * 1.12, -0.462 - length, -0.326],
      0.009, 0.005, '#bbc09d', true, 4));
  }
  parts.push(rod([-0.026, -0.434, -0.262], [-0.045, -0.463, -0.305],
    0.011, 0.006, '#a8b28b', true, 4));
  parts.push(patch([[-0.032, -0.337, -0.227], [-0.019, -0.381, -0.252],
    [0.012, -0.345, -0.244], [0.016, -0.329, -0.24]], '#d4cca8'));
  return merge(parts);
}

export function createZombieLegGeometry() {
  const parts = [finish(ringsGeometry([
    [-0.23, 0.043, 0.046, 0.010], [-0.194, 0.049, 0.05, 0.013],
    [-0.135, 0.056, 0.065, 0.019], [-0.083, 0.047, 0.049, 0.007],
    [-0.012, 0.058, 0.064, -0.03], [0.036, 0.064, 0.056, -0.038],
    [0.107, 0.069, 0.066, -0.016], [0.215, 0.081, 0.080, 0.015],
    [0.315, 0.089, 0.081, 0.020],
  ], 8, true))];
  parts.push(patch([[-0.033, 0.037, -0.087], [-0.034, 0.002, -0.091], [0.013, -0.024, -0.091],
    [0.036, 0.028, -0.09], [0.012, 0.022, -0.099]], '#c1a788'));
  parts.push(finish(ringsGeometry([[-0.289, 0.055, 0.103, -0.042], [-0.269, 0.059, 0.108, -0.041],
    [-0.245, 0.056, 0.102, -0.039], [-0.2, 0.047, 0.064, -0.001],
    [-0.163, 0.047, 0.056, 0.012]], 8), '#626356'));
  return merge(parts);
}

export function createZombieHeadGeometry() {
  const parts = [finish(ringsGeometry([
    [-0.112, 0.084, 0.089, 0.027], [-0.04, 0.125, 0.119, 0.025],
    [0.04, 0.139, 0.142, 0.014], [0.135, 0.131, 0.131, 0.02],
    [0.186, 0.075, 0.08, 0.022], [0.202, 0.012, 0.014, 0.026],
  ], 10), '#e2e0d0')];
  parts.push(finish(ringsGeometry([[-0.203, 0.047, 0.05, -0.027], [-0.164, 0.082, 0.076, -0.043],
    [-0.112, 0.101, 0.083, -0.044]], 8), '#b4b49d'));
  for (const side of [-1, 1]) {
    const cheek = new THREE.OctahedronGeometry(1).scale(0.041, 0.059, 0.036)
      .translate(side * 0.097, -0.025, -0.103);
    parts.push(finish(cheek, side < 0 ? '#c4c3ab' : '#9b9f87'));
    const socketX = side * 0.071;
    parts.push(patch([[socketX - 0.042, 0.043, -0.141], [socketX - 0.025, 0.018, -0.153],
      [socketX + 0.025, 0.016, -0.151], [socketX + 0.042, 0.037, -0.139],
      [socketX + 0.024, 0.064, -0.145], [socketX - 0.022, 0.067, -0.149]], '#454a3c'));
    parts.push(oval([side * 0.14, 0.005, 0.02], [0.022, 0.037, 0.018], '#adb299', false, 6, 4));
  }
  parts.push(patch([[-0.023, 0.069, -0.153], [-0.021, -0.025, -0.184],
    [0.015, -0.031, -0.188], [0.023, 0.062, -0.151]], '#b8b79e'));
  parts.push(oval([0.013, -0.094, -0.127], [0.066, 0.042, 0.014], '#292b24', false, 7, 4));
  for (const x of [-0.036, -0.012, 0.014, 0.037]) {
    parts.push(finish(new THREE.BoxGeometry(0.015, 0.027, 0.012).translate(x, -0.080, -0.139), '#e0d9b8'));
  }
  return merge(parts);
}

export function createZombieHelmetGeometry() {
  const liner = finish(ringsGeometry([
    [-0.013, 0.198, 0.211, 0.021], [0.012, 0.202, 0.215, 0.023],
  ], 12), '#5a594b');
  const cloth = finish(ringsGeometry([
    [0.006, 0.203, 0.216, 0.022], [0.029, 0.208, 0.212, 0.026],
    [0.087, 0.177, 0.189, 0.032], [0.132, 0.117, 0.14, 0.039],
    [0.152, 0.035, 0.076, 0.034],
  ], 12), '#e2ddb6');
  const positions = cloth.getAttribute('position'), colors = cloth.getAttribute('color');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = positions.getY(i);
    const mottling = Math.sin(x * 24 + z * 18) + Math.cos(z * 20 - x * 7 + y * 20) * 0.76;
    const highlight = THREE.MathUtils.smoothstep(mottling, -0.5, 0.65);
    colors.setXYZ(i, colors.getX(i) * (0.66 + 0.44 * highlight),
      colors.getY(i) * (0.77 + 0.27 * highlight), colors.getZ(i) * (0.9 + 0.08 * highlight));
  }
  return merge([liner, cloth]);
}

export function createBossCoatGeometry() {
  const coat = finish(ringsGeometry([
    [-0.50, 0.231, 0.156, 0.038, 0.02], [-0.37, 0.248, 0.182, 0.039, 0.015],
    [-0.24, 0.174, 0.121, 0.037, -0.022], [-0.12, 0.168, 0.135, 0.024, -0.03],
    [0.04, 0.245, 0.19, 0.012], [0.178, 0.32, 0.202, 0.01],
    [0.294, 0.345, 0.168, 0.021], [0.36, 0.205, 0.154, 0.03],
    [0.444, 0.082, 0.076, -0.021],
  ], 14, true), '#beb494');
  // Ragged lapels fold away from the exposed ribs. Their lighter wear runs
  // down the front and anchors the silhouette to a recognizable coat shape.
  const leftLapel = patch([[-0.084, 0.396, -0.098], [-0.206, 0.277, -0.15], [-0.18, 0.138, -0.191],
    [-0.086, -0.105, -0.17], [-0.115, 0.153, -0.207], [-0.043, 0.298, -0.153]], '#e3d0a5');
  const rightLapel = patch([[0.092, 0.39, -0.101], [0.072, 0.275, -0.158], [0.121, 0.142, -0.214],
    [0.073, -0.111, -0.167], [0.207, 0.177, -0.169], [0.205, 0.315, -0.139]], '#a7a18b');
  const fold = patch([[-0.17, -0.128, -0.102], [-0.19, -0.352, -0.141], [-0.104, -0.492, -0.116],
    [-0.126, -0.285, -0.13]], '#786f60');
  const collar = finish(ringsGeometry([[0.354, .106, .087, -.027], [0.423, .093, .072, -.036],
    [0.474, .082, .064, -.043]], 9), '#a19b7b');
  return merge([coat, leftLapel, rightLapel, fold, collar]);
}

export function createBossRibGeometry() {
  const rib = ringsGeometry([
    [-0.145, .009, .011, 0, .029], [-0.115, .017, .014, 0, .012],
    [-0.07, .019, .017, 0, -.008], [0, .021, .017, 0, -.017],
    [0.075, .021, .017, 0, -.006], [0.115, .014, .012, 0, .014],
    [0.145, .008, .009, 0, .031],
  ], 6);
  return rib.rotateZ(Math.PI / 2);
}

export function createZombieMaterial(kind: 'cloth' | 'skin' | 'helmet') {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true,
    roughness: kind === 'helmet' ? 0.92 : 0.98, metalness: 0,
    side: THREE.DoubleSide });
  // Existing per-instance uniform/head colours still select each variant.
  // Skin and the torn canvas carry their own pigment instead of being dyed
  // the uniform colour. The same brush pass, world lights and fog shade both.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nattribute float zombieLocalPigment; varying float vUseZombiePigment; varying vec3 vZombiePigment;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUseZombiePigment = zombieLocalPigment; vZombiePigment = color;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying float vUseZombiePigment; varying vec3 vZombiePigment;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 localInk = vec3(0.71, 0.82, 0.73) * vZombiePigment;
        diffuseColor.rgb = mix(diffuseColor.rgb, localInk, vUseZombiePigment);`);
  };
  material.customProgramCacheKey = () => `zombie-shared-anatomy-v4-${kind}`;
  return material;
}
