import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createInfantryGeometry, addInfantrySkinAttributes, INFANTRY_MATERIAL } from './infantryGeometry';
import { infantryRifleBind } from '../../lib/infantryMetrics';
import type { FinalBossAllyRole } from '../../lib/finalBossAllies';
import {createGuardianPortrait,createGuardianBand,createGuardianMoustache,guardianSurface} from './guardianPortrait';
import {createFieldBackLoadGeometry} from './fieldBackLoadGeometry';

type Point = [number, number, number];
export const ALLY_PRESENTATION = Object.freeze({ riderOffsetY: 0.74, guardianFill: 0.42 });

function part(source: THREE.BufferGeometry, color: string, position: Point = [0, 0, 0], scale: Point = [1, 1, 1], rotation: Point = [0, 0, 0], bone = 1) {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  geometry.deleteAttribute('uv');
  const transform = new THREE.Object3D(); transform.position.set(...position); transform.scale.set(...scale); transform.rotation.set(...rotation); transform.updateMatrix();
  geometry.applyMatrix4(transform.matrix);
  const base = new THREE.Color(color), positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const highlight = base.clone().lerp(new THREE.Color('#d5b888'), 0.23);
  const shadow = base.clone().multiply(new THREE.Color().setRGB(0.64, 0.72, 0.76));
  const pigment = new THREE.Color();
  const colors = new Float32Array(positions.count * 3);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const lightPlane = normals.getX(vertex) * -0.31 + normals.getY(vertex) * 0.82 + normals.getZ(vertex) * 0.33;
    const stroke = Math.sin(positions.getX(vertex) * 11 + positions.getY(vertex) * 18 + positions.getZ(vertex) * 5);
    const wash = THREE.MathUtils.smoothstep(lightPlane + stroke * 0.17, -0.55, 0.88);
    pigment.copy(shadow).lerp(highlight, wash);
    colors.set([pigment.r, pigment.g, pigment.b], vertex * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  addInfantrySkinAttributes(geometry, bone);
  return geometry;
}

function oval(color: string, position: Point, scale: Point, rotation: Point = [0, 0, 0], bone = 1, detail = 14) {
  return part(new THREE.SphereGeometry(1, detail, Math.round(detail * .7)), color, position, scale, rotation, bone);
}

function box(color: string, position: Point, scale: Point, rotation: Point = [0, 0, 0], bone = 1) {
  return part(new RoundedBoxGeometry(1, 1, 1, 1, 0.08), color, position, scale, rotation, bone);
}

function link(color: string, from: Point, to: Point, radius: number, bone = 1, topRadius = radius) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), center = a.clone().add(b).multiplyScalar(0.5);
  const geometry = new THREE.CylinderGeometry(topRadius, radius, a.distanceTo(b), 7);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()));
  return part(geometry, color, center.toArray() as Point, [1, 1, 1], [0, 0, 0], bone);
}

function merge(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error('Unable to merge ally presentation geometry');
  parts.forEach(part => part.dispose()); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

type LoftSection = readonly [y: number, z: number, width: number, depth: number];

/** Closed sculpted profile. Each station follows the spine of the form rather
 * than stacking spheres at the anatomical landmarks. */
function sculptedProfile(sections: readonly LoftSection[], sides = 16, crease = 0) {
  const path = new THREE.CatmullRomCurve3(sections.map(([y, z]) => new THREE.Vector3(0, y, z)));
  const crossSections = new THREE.CatmullRomCurve3(sections.map(([, , width, depth]) => new THREE.Vector3(width, depth, 0)));
  const rows = (sections.length - 1) * 3;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const center = path.getPoint(t);
    const tangent = path.getTangent(t);
    const radius = crossSections.getPoint(t);
    const shape = Math.sin(Math.PI * t);
    for (let side = 0; side < sides; side++) {
      const angle = side * Math.PI * 2 / sides;
      const plane = Math.cos(angle) * Math.max(0.001, radius.y);
      const profile = 1 + Math.cos(angle * 3 + 0.8) * crease * shape;
      positions.push(
        Math.sin(angle) * Math.max(0.001, radius.x) * profile,
        center.y + tangent.z * plane * profile,
        center.z - tangent.y * plane * profile,
      );
      if (row < rows) {
        const a = row * sides + side, b = row * sides + (side + 1) % sides;
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A curved, colored strip laid on top of the sculpt for straps and panels. */
function strip(color: string, points: readonly Point[], width: number, bone = 1) {
  const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const positions: number[] = [];
  const steps = (points.length - 1) * 3;
  for (let step = 0; step < steps; step++) {
    const cross = (index: number, side: number) => {
      const point = path.getPoint(index / steps);
      const tangent = path.getTangent(index / steps);
      const across = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(1, 0, 0)).normalize();
      return point.addScaledVector(across, width * side / 2);
    };
    const a = cross(step, -1), b = cross(step, 1), c = cross(step + 1, -1), d = cross(step + 1, 1);
    for (const point of [a, b, c, b, d, c, c, b, a, c, d, b]) positions.push(...point.toArray());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return part(geometry, color, undefined, undefined, undefined, bone);
}


function createCampaignHat() {
  const brim = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const count = 28;
  for (let row = 0; row < 4; row++) {
    const radius = [.55, .86, 1, .976][row];
    for (let segment = 0; segment < count; segment++) {
      const a = segment * Math.PI * 2 / count;
      const x = Math.cos(a) * .205 * radius;
      const z = Math.sin(a) * .217 * radius;
      const rise = .027 * Math.sin(a * 2 + .7) * radius ** 3 + .050 * Math.max(0, Math.cos(a)) ** 4;
      positions.push(.012 + x, 1.687 + rise - (row === 3 ? .012 : 0), -.013 + z);
      if (row < 3) {
        const first = row * count + segment, next = row * count + (segment + 1) % count;
        indices.push(first, next, first + count, next, next + count, first + count);
        indices.push(first + count, next, first, first + count, next + count, next);
      }
    }
  }
  brim.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  brim.setIndex(indices);
  const doubleBrim = brim.toNonIndexed(); brim.dispose();
  doubleBrim.computeVertexNormals();
  const crown = sculptedProfile([
    [1.679, -.015, .108, .119], [1.721, -.012, .106, .117],
    [1.769, -.009, .091, .104], [1.803, -.007, .079, .083],
    [1.819, -.004, .034, .041], [1.829, -.004, .004, .004],
  ], 20, .12);
  const crownPoints = crown.getAttribute('position');
  for (let i = 0; i < crownPoints.count; i++) {
    const x = crownPoints.getX(i), y = crownPoints.getY(i), z = crownPoints.getZ(i);
    const dent = THREE.MathUtils.smoothstep(y, 1.75, 1.812) * Math.exp(-((x / .033) ** 2));
    crownPoints.setY(i, y - dent * .020 + .008 * Math.sin(z * 17 + x * 9));
  }
  crown.computeVertexNormals();
  return [
    part(doubleBrim, '#807157', undefined, undefined, undefined, 8),
    part(crown, '#867354', [.012, 0, 0], undefined, undefined, 8),
    part(new THREE.TorusGeometry(.109, .011, 5, 20), '#523e2c', [.012, 1.704, -.014], [1, 1.085, 1], [Math.PI / 2, 0, 0], 8),
  ].map(g=>g.translate(0,-.061,-.004));
}

/** Original stylized likeness cues, not licensed character meshes. Defaults of
 * the common infantry builder remain unchanged for US/VC and the tank crew. */
export function createAllyBodyGeometry(role: FinalBossAllyRole) {
  const cavalry = role === 'mounted-cavalry', heavy = role === 'heavy-gunner';
  const face=createGuardianPortrait(role);
  const parts = [createInfantryGeometry({ faction: 'us', kneeling: false, headwear: 'none',
    ...(cavalry ? { rifleHeight: 1.1, customHands: { support: [-.151, 1.015, -.237], firing: [.056, .980, -.156] } }
      : { rifleStyle: heavy ? 'heavy' : 'scout' }),
    sleeveless: !cavalry, omitProceduralHead: true,
    colors: cavalry ? { shirt: '#ab946b', trousers: '#666553', webbing: '#805d43', skin: '#bf936c' }
      : heavy ? { shirt: '#5b6846', trousers: '#4a5540', webbing: '#94835b', skin: '#b9825c' }
        : { shirt: '#495846', trousers: '#4c5540', webbing: '#82704e', skin: '#bd8b62' } }),
    face];
  // Costume, weapon, hair and hat identify three different allies even from
  // the rear. Keep all this geometry on the original torso bone and draw.
  const load=createFieldBackLoadGeometry('us',0,heavy?0:cavalry?1:2,
    cavalry?'dispatch':heavy?'heavy':'scout');
  parts.push(addInfantrySkinAttributes(load,1));
  if (cavalry) {
    parts.push(...createCampaignHat(),createGuardianMoustache(face));
    for (const side of [-1, 1]) {
      parts.push(part(new THREE.TorusGeometry(.024,.00175,5,20),'#8f8067',[.012+side*.031,1.580,-.123],[1,.85,1],[0,-side*.17,0],8));
      parts.push(link('#796c59',[.012+side*.0545,1.584,-.119],[.012+side*.070,1.582,-.056],.0016,8));
      parts.push(link('#796c59',[.012+side*.070,1.582,-.056],[.012+side*.075,1.574,.002],.0016,8));
      parts.push(box('#b6a07a', [side * .057, 1.413, -.049], [.053, .043, .061], [-.36, side * .26, side * -.30]));
      parts.push(box('#958067', [side * .141, 1.410, .011], [.11, .014, .050], [.12, side * .18, side * -.19]));
    }
    parts.push(link('#8f8067',[.004,1.584,-.127],[.012,1.588,-.129],.0018,8),
      link('#8f8067',[.012,1.588,-.129],[.020,1.584,-.127],.0018,8));
  } else {
    if (!heavy) {
      const hit=guardianSurface(face);parts.push(createGuardianBand(face));
      const knot=hit(1.624,.84,.54);
      parts.push(oval('#863b33',knot,[.010,.012,.012],[0,.15,.20],8,8));
      const [kx,ky,kz]=knot;
      parts.push(strip('#9e493c',[[kx,ky,kz],[kx+.003,ky-.019,kz+.012],[kx+.002,ky-.043,kz+.026],[kx-.005,ky-.079,kz+.034]],.017,8));
      parts.push(strip('#793b34',[[kx,ky,kz],[kx-.011,ky-.015,kz+.016],[kx-.025,ky-.033,kz+.029],[kx-.036,ky-.051,kz+.036]],.013,8));
    }
    // Fit the diagonal carrier into the underlying dressed torso, including
    // both separate selvages. Each shell sits ON the resulting strap instead
    // of balancing in front of the chest at one arbitrary Z.
    const receiver=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const torso=new THREE.Mesh(parts[0],receiver), ray=new THREE.Raycaster();
    const toward=new THREE.Vector3(0,0,1);
    const seat=(x:number,y:number)=>{
      ray.set(new THREE.Vector3(x,y,-.22),toward);
      const h=ray.intersectObject(torso).find(v=>v.point.z<-.025 &&
        (v.face?.normal.z??0)<-.12);
      return h?.point.z??-.080;
    };
    const rows=heavy?13:9, half=heavy?.030:.024;
    const coords:number[]=[],tri:number[]=[];
    for (let i=0;i<=rows;i++) {
      const t=i/rows, x=-.122+.241*t, y=1.397-.415*t;
      for(const u of [-1,-.82,.82,1]) {
        const xx=x+u*half,yy=y+u*half*.56;
        coords.push(xx,yy,seat(xx,yy)-(Math.abs(u)===1?.0011:.0039));
      }
      if(i<rows)for(let c=0;c<3;c++) {
        const a=4*i+c;tri.push(a,a+1,a+4,a+4,a+1,a+5);
      }
      if(i===0 || i===rows) continue;
      const ends=[-.79,.78].map(u=>{const xx=x+u*half, yy=y+u*half*.56;
        return [xx,yy,seat(xx,yy)-.0054] as Point;});
      const shell=link(heavy?'#a48f57':'#83734f',ends[0],ends[1],heavy?.0068:.0059,1,.0050);
      shell.getAttribute('surfaceKind').array.fill(6);parts.push(shell);
    }
    receiver.dispose();
    const carrier=new THREE.BufferGeometry();carrier.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
    carrier.setIndex(tri);carrier.computeVertexNormals();
    const dressed=part(carrier,heavy?'#7e7751':'#735b42');
    dressed.getAttribute('surfaceKind').array.fill(4);dressed.getAttribute('garmentPanel').array.fill(3);parts.push(dressed);
  }
  return merge(parts);
}

/** The persistent fill keeps faces readable. The summoning light picks out
 * upward-facing helmets, shoulders and steel during the entrance. */
function revealAtHeight(shader: Parameters<THREE.Material['onBeforeCompile']>[0], height: {value: number}) {
  shader.uniforms.arrivalHeight = height;
  shader.vertexShader = 'varying vec3 arrivalWorld;\n' + shader.vertexShader.replace('#include <project_vertex>',
    '#include <project_vertex>\narrivalWorld = (modelMatrix * vec4(transformed, 1.)).xyz;');
  shader.fragmentShader = 'uniform float arrivalHeight; varying vec3 arrivalWorld;\n' + shader.fragmentShader.replace(
    '#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
    float arrivalEdge = 1.;
    if (arrivalHeight < 100.) {
      vec3 cell = floor(arrivalWorld * 26.);
      float grain = fract(dot(cell, vec3(.347,.631,.189)));
      arrivalEdge = arrivalHeight - arrivalWorld.y + .12*(grain-.5);
      if (arrivalEdge < 0.) discard;
    }`);
}

export function createAllyDepthMaterial(height: {value: number}) {
  const depth = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking});
  depth.onBeforeCompile = shader => revealAtHeight(shader, height);
  return depth;
}

export function createProtectedAllyMaterial(summoningLight = {value: 0}, height = {value: 1000}) {
  const material = INFANTRY_MATERIAL.clone();
  material.onBeforeCompile = (shader, renderer) => {
    INFANTRY_MATERIAL.onBeforeCompile(shader, renderer);
    revealAtHeight(shader, height);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight += vec3(2.2,1.45,.54)*(1.-smoothstep(0.,.105,arrivalEdge));\n#include <opaque_fragment>');
    shader.uniforms.summoningLight = summoningLight;
    shader.fragmentShader = 'uniform float summoningLight;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      vec3 guardianDirection = normalize(mat3(viewMatrix) * normalize(vec3(-0.4, 0.7, 0.45)));
      float guardianForm = 0.44 + 0.56 * max(dot(normal, guardianDirection), 0.0);
      reflectedLight.indirectDiffuse = max(reflectedLight.indirectDiffuse, diffuseColor.rgb * guardianForm * ${ALLY_PRESENTATION.guardianFill.toFixed(2)});
      float overhead = max(dot(normal, viewMatrix[1].xyz), 0.0);
      reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.9, 1.35, .65) * summoningLight * (.12 + overhead);`);
  };
  material.customProgramCacheKey = () => `ally-protected-fill:${INFANTRY_MATERIAL.customProgramCacheKey()}`;
  return material;
}

export function createAllyWeaponGeometry(role: 'heavy-gunner' | 'rifle-scout') {
  const heavy = role === 'heavy-gunner', y = 0;
  const rifle = infantryRifleBind(heavy ? 'heavy' : 'scout', false);
  const parts = [box('#303933', [0, y, -0.16], [heavy ? 0.125 : 0.069, heavy ? 0.12 : 0.09, 0.3]),
    box('#465047', [0, y + 0.053, -0.17], [heavy ? 0.137 : 0.075, 0.025, 0.26]),
    box('#414539', [0, y - 0.015, 0.078], [heavy ? 0.095 : 0.07, 0.11, 0.18]),
    box('#252d27', [0, y - 0.085, -0.108], [0.044, 0.108, 0.052], [-0.19, 0, 0]),
    link('#343e36', [0, y, -0.30], [0, y, -0.49], heavy ? 0.055 : 0.036),
    link('#252e2b', [0, y, -0.49], [0, y, -0.696], heavy ? 0.02 : 0.011),
    link('#586158', [0, y, -0.693], [0, y, rifle.localMuzzle[2]], heavy ? 0.025 : 0.017)];
  if (heavy) {
    parts.push(box('#626547', [-0.108, y - 0.1, -0.19], [0.13, 0.19, 0.2]));
    parts.push(link('#465044', [0, y - 0.043, -0.38], [0, y - 0.043, -0.69], 0.012));
    parts.push(link('#303a32', [-0.012, y - 0.035, -0.55], [-0.07, y - 0.14, -0.49], 0.006));
    parts.push(link('#303a32', [0.012, y - 0.035, -0.55], [0.07, y - 0.14, -0.49], 0.006));
    for (let round = 0; round < 6; round++) parts.push(link('#a38a4a', [-0.075 - round * 0.012, y + 0.024 - round * 0.012, -0.22], [-0.075 - round * 0.012, y + 0.024 - round * 0.012, -0.175], 0.005));
  } else {
    parts.push(box('#303b34', [0, y - 0.15, -0.216], [0.043, 0.16, 0.064], [0.14, 0, 0]));
    parts.push(link('#404b42', [0, y + 0.10, -0.11], [0, y + 0.10, -0.245], 0.012));
    parts.push(box('#323c34', [0, y + 0.067, -0.12], [0.026, 0.067, 0.025]));
    parts.push(box('#323c34', [0, y + 0.067, -0.235], [0.026, 0.067, 0.025]));
  }
  parts.push(link('#3c4940', [0, y + 0.008, -0.624], [0, y + 0.075, -0.624], 0.008));
  const geometry = merge(parts);
  geometry.scale(1, 1, rifle.scaleZ).translate(...rifle.origin);
  geometry.getAttribute('surfaceKind').array.fill(7);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createHorseBodyGeometry() {
  const barrel = sculptedProfile([
    [1.16, -0.90, 0.008, 0.008], [1.12, -0.74, 0.21, 0.26],
    [1.12, -0.49, 0.31, 0.39], [1.10, -0.16, 0.34, 0.42],
    [1.07, 0.17, 0.35, 0.40], [1.10, 0.43, 0.305, 0.34],
    [1.14, 0.65, 0.36, 0.37], [1.16, 0.86, 0.28, 0.29],
    [1.17, 1.01, 0.009, 0.009],
  ], 22, 0.045);
  const neck = sculptedProfile([
    [1.84, -1.04, 0.033, 0.033], [1.74, -0.94, 0.123, 0.171],
    [1.58, -0.81, 0.149, 0.226], [1.43, -0.68, 0.171, 0.286],
    [1.25, -0.54, 0.231, 0.318], [1.06, -0.44, 0.12, 0.165],
    [0.97, -0.43, 0.006, 0.008],
  ], 20, 0.08);
  const head = sculptedProfile([
    [1.48, -1.53, 0.007, 0.008], [1.49, -1.48, 0.079, 0.066],
    [1.52, -1.36, 0.095, 0.083], [1.61, -1.23, 0.112, 0.108],
    [1.68, -1.10, 0.153, 0.157], [1.73, -1.01, 0.137, 0.149],
    [1.75, -0.92, 0.078, 0.10], [1.76, -0.875, 0.008, 0.008],
  ], 22, 0.055);
  const headMesh = part(head, '#805939');
  const headPoints = headMesh.getAttribute('position');
  const headPaint = headMesh.getAttribute('color');
  const muzzle = new THREE.Color('#322b28');
  const forehead = new THREE.Color('#c7a578');
  const pigment = new THREE.Color();
  for (let vertex = 0; vertex < headPoints.count; vertex++) {
    const x = headPoints.getX(vertex), y = headPoints.getY(vertex), z = headPoints.getZ(vertex);
    const darkMuzzle = 1 - THREE.MathUtils.smoothstep(z + Math.sin(x * 32) * 0.012, -1.47, -1.30);
    const marking = (1 - THREE.MathUtils.smoothstep(Math.abs(x - 0.014 * Math.sin(z * 17)), .014, .053))
      * THREE.MathUtils.smoothstep(y, 1.60, 1.75)
      * (1 - THREE.MathUtils.smoothstep(z, -1.02, -0.94));
    pigment.setRGB(headPaint.getX(vertex), headPaint.getY(vertex), headPaint.getZ(vertex));
    pigment.lerp(muzzle, darkMuzzle * .91).lerp(forehead, marking * .68);
    headPaint.setXYZ(vertex, pigment.r, pigment.g, pigment.b);
  }
  const mane = sculptedProfile([
    [1.92, -0.96, 0.014, 0.012], [1.88, -0.902, 0.066, 0.038],
    [1.79, -0.773, 0.067, 0.045], [1.69, -0.62, 0.082, 0.06],
    [1.59, -0.456, 0.064, 0.041], [1.52, -0.30, 0.008, 0.009],
  ], 12, 0.16);
  const tail = sculptedProfile([
    [1.35, 0.86, 0.010, 0.012], [1.20, 0.97, 0.065, 0.046],
    [0.99, 1.045, 0.08, 0.055], [0.73, 1.075, 0.078, 0.05],
    [0.49, 1.16, 0.036, 0.028], [0.39, 1.24, 0.005, 0.004],
  ], 12, 0.17);
  const parts = [part(barrel, '#785337'), part(neck, '#80573a'), headMesh,
    part(mane, '#302b26', [0.017, 0, 0]), part(tail, '#362b23', [0.025, 0, 0]),
    part(sculptedProfile([
      [1.49, -0.32, .05, .03], [1.52, -0.19, .21, .05],
      [1.52, .06, .25, .066], [1.53, .26, .22, .079], [1.52, .36, .025, .029],
    ], 12), '#4f3628')];
  for (const side of [-1, 1]) {
    const ear = sculptedProfile([
      [1.81, -0.977, .014, .018], [1.88, -0.973, .036, .043],
      [1.97, -0.967, .028, .025], [2.04, -0.993, .003, .004],
    ], 10);
    parts.push(part(ear, '#68482f', [side * 0.081, 0, 0]));
    parts.push(oval('#3d2f28', [side * 0.081, 1.94, -1.001], [.017, .066, .009], [0, 0, side * -.12]));
    parts.push(oval('#382d25', [side * 0.137, 1.716, -1.110], [0.025, 0.026, 0.036], [0, side * 0.24, 0]));
    parts.push(oval('#181917', [side * 0.153, 1.719, -1.116], [0.009, 0.014, 0.019], [0, side * 0.24, 0]));
    parts.push(oval('#b9a079', [side * 0.160, 1.726, -1.123], [.003, .0035, .0045]));
    parts.push(oval('#221f20', [side * .065, 1.525, -1.46], [.021, .015, .026], [.1, side * .70, 0]));
    parts.push(strip('#41302a', [[side * .086, 1.86, -.967], [side * .141, 1.756, -1.063],
      [side * .149, 1.647, -1.187], [side * .110, 1.530, -1.355]], .024));
    parts.push(strip('#584334', [[side * .116, 1.527, -1.35], [side * .198, 1.624, -1.091],
      [side * .198, 1.642, -.790], [side * .125, 1.745, -.356]], .013));
    parts.push(part(new THREE.TorusGeometry(.023, .005, 5, 10), '#a28a62',
      [side * .112, 1.532, -1.356], undefined, [0, Math.PI / 2, 0]));
    const blanket = new THREE.PlaneGeometry(.67, .39, 8, 5);
    const blanketPoints = blanket.getAttribute('position');
    for (let i = 0; i < blanketPoints.count; i++) {
      const section = blanketPoints.getY(i) / .39 + .5;
      const z = blanketPoints.getX(i) + .04;
      const drape = Math.sin(section * Math.PI * .58);
      const fold = Math.sin(z * 16 + section * 2.6) * .017 + Math.sin(z * 31 - section * 3) * .009;
      blanketPoints.setXYZ(i, side * (.165 + drape * .218 + fold * section), 1.51 - section * .37, z);
    }
    if (side < 0) {
      const index = blanket.index!;
      for (let triangle = 0; triangle < index.count; triangle += 3) {
        const second = index.getX(triangle + 1);
        index.setX(triangle + 1, index.getX(triangle + 2));
        index.setX(triangle + 2, second);
      }
    }
    blanket.computeVertexNormals();
    parts.push(part(blanket, '#69735f'));
    parts.push(strip('#afa078', [[side * .375, 1.19, -.285], [side * .398, 1.165, -.08],
      [side * .400, 1.156, .22], [side * .38, 1.167, .36]], .018));
    parts.push(strip('#503529', [[side * .20, 1.49, .005], [side * .36, 1.32, .026],
      [side * .408, 1.095, .054], [side * .421, .974, .064]], .035));
    parts.push(part(new THREE.TorusGeometry(.061, .010, 5, 14, Math.PI * 1.65), '#9b855d',
      [side * .422, .974, .057], [1, .86, 1], [0, Math.PI / 2, Math.PI / 5]));
  }
  return merge(parts);
}

export const HORSE_LEG_JOINTS = Object.freeze({
  fore: { knee: [-.49, -.051], ankle: [-.855, -.027] },
  hind: { knee: [-.49, .132], ankle: [-.855, .020] },
});

/** Weighted continuous limb with shaped tendons and a flat hoof contact plane. */
export function createHorseLegGeometry(hind = false) {
  const { knee, ankle } = hind ? HORSE_LEG_JOINTS.hind : HORSE_LEG_JOINTS.fore;
  const mesh = part(sculptedProfile([
    [.165, hind ? -.032 : .061, .018, .024],
    [.080, hind ? -.052 : .026, .138, .158],
    [-.106, hind ? -.072 : -.003, .117, .128],
    [-.257, hind ? -.052 : -.066, .088, .082],
    [knee[0], knee[1], .056, .058],
    [-.649, hind ? .095 : -.037, .034, .039],
    [ankle[0], ankle[1], .047, .051],
    [-.899, ankle[1] - .019, .052, .065],
    [-.967, ankle[1] - .032, .065, .076],
    [-.978, ankle[1] - .032, .023, .028],
  ], 12, 0.07), hind ? '#69482f' : '#735137');
  const points = mesh.getAttribute('position'), colors = mesh.getAttribute('color');
  const indices = mesh.getAttribute('skinIndex'), weights = mesh.getAttribute('skinWeight');
  const hoof = new THREE.Color('#332d28'), pigment = new THREE.Color();
  for (let i = 0; i < points.count; i++) {
    const y = points.getY(i);
    const hardHoof = 1 - THREE.MathUtils.smoothstep(y, -.919, -.876);
    const stocking = 1 - THREE.MathUtils.smoothstep(y, -.740, -.413);
    pigment.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i)).multiplyScalar(1 - stocking * .38);
    pigment.lerp(hoof, hardHoof);
    colors.setXYZ(i, pigment.r, pigment.g, pigment.b);
    points.setY(i, Math.max(-.988, y));
    if (y > -.70) {
      const kneeWeight = 1 - THREE.MathUtils.smoothstep(y, knee[0] - .10, knee[0] + .105);
      indices.setXYZW(i, 0, 1, 0, 0);
      weights.setXYZW(i, 1 - kneeWeight, kneeWeight, 0, 0);
    } else {
      const ankleWeight = 1 - THREE.MathUtils.smoothstep(y, ankle[0] - .050, ankle[0] + .055);
      indices.setXYZW(i, 1, 2, 0, 0);
      weights.setXYZW(i, 1 - ankleWeight, ankleWeight, 0, 0);
    }
  }
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}

export function createCavalrySwordGeometry() {
  const blade = part(sculptedProfile([
    [1.113, -1.035, .001, .001], [1.095, -.952, .004, .009],
    [1.065, -.786, .006, .016], [1.040, -.520, .007, .019],
    [1.027, -.296, .007, .020], [1.025, -.245, .007, .016],
  ], 6), '#a7afa0', [.03, 0, 0]);
  return merge([link('#66513a', [0.03, 1.015, -0.11], [0.03, 1.015, -0.25], 0.018),
    part(new THREE.TorusGeometry(0.052, 0.006, 5, 16, Math.PI), '#a48d56', [0.03, 1.008, -0.196], [1, 1, 1], [Math.PI / 2, 0, 0]),
    blade]);
}
