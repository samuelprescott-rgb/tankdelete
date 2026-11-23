import * as THREE from 'three';

type Point = [number, number, number];

export const HUEY_ANCHORS = {
  mainRotor: [0, 1.29, 0] as Point,
  tailRotor: [0.12, 0.62, 5.14] as Point,
  mainRotorDiameter: 7.30,
  tailRotorDiameter: 1.12,
};

/** Legacy-compatible cabin entry point. The shared full airframe below uses
 * the same axes/rotor anchors, with the long UH-1D/H troop-cabin proportions. */
export function createHueyCabinGeometry(longCabin = false, wrecked = true) {
  const rings = [
    ...(longCabin ? [
      [-1.90, 0.56, 0.34, -0.13], [-1.12, 0.76, 0.65, 0],
      [-0.50, 0.78, 0.65, 0], [1.00, 0.78, 0.62, 0], [1.56, 0.40, 0.36, 0.04],
    ] : [
      [-1.63, 0.30, 0.34, -0.15], [-1.24, 0.82, 0.60, -0.04],
      [-0.55, 1.00, 0.74, 0], [0.72, 0.99, 0.71, 0], [1.36, 0.53, 0.40, 0.02],
    ]),
  ];
  const outline = [[-1, -0.55], [-0.73, -1], [0.73, -1], [1, -0.55],
    [1, 0.56], [0.65, 1], [-0.65, 1], [-1, 0.56]];
  const positions: number[] = [];
  const indices: number[] = [];
  rings.forEach(([z, width, height, offset],i) => outline.forEach(([x, y]) => {
    const header=longCabin&&!wrecked&&(i===2||i===3)&&y===.56?.79:y;
    positions.push(x * width, header * height + offset, z);
  }));
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let side = 0; side < outline.length; side++) {
      // Open troop-bay apertures and a burned-through roof section. The frame
      // and cabin interior are separate visible surfaces, not painted windows.
      if (ring === 2 && (side === 3 || side === 7 || (wrecked && side === 5))) continue;
      const a = ring * 8 + side, b = ring * 8 + (side + 1) % 8;
      indices.push(a, b, a + 8, b, b + 8, a + 8);
    }
  }
  for (let side = 1; side < 7; side++) {
    indices.push(0, side + 1, side, 32, 32 + side, 33 + side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createHueyPaintMaterial(wrecked = true) {
  const material = new THREE.MeshStandardMaterial({ color: '#697252', roughness: 0.94, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHullLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHullLocal = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHullLocal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float roof = smoothstep(0.1, 0.76, vHullLocal.y);
        float underside = 1.0 - smoothstep(-0.56, -0.16, vHullLocal.y);
        float scorch = 1.0 - smoothstep(0.15, 1.7, length(vHullLocal - vec3(0.0, 0.3, 0.4)));
        float cabinFold = 1.0 - smoothstep(0.018, 0.085, abs(vHullLocal.y - 0.43));
        float cabinSection = smoothstep(-1.55, -1.1, vHullLocal.z) * (1.0 - smoothstep(0.9, 1.6, vHullLocal.z));
        float coolerTail = smoothstep(1.25, 3.3, vHullLocal.z);
        float exposedPrimer = smoothstep(0.18, 0.50, scorch) * (1.0 - smoothstep(0.63, 0.85, scorch));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.27, 0.26, 0.145), roof * 0.42);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.071, 0.1, 0.075), underside * 0.46);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.105, 0.15, 0.11), coolerTail * 0.27);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.30, 0.18), cabinFold * cabinSection * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.29, 0.18, 0.092), exposedPrimer * ${wrecked ? '0.45' : '0.0'});
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.027, 0.024, 0.019), scorch * ${wrecked ? '0.84' : '0.0'});`);
  };
  material.customProgramCacheKey = () => `huey-painted-olive-v2-${wrecked ? 'wreck' : 'intact'}`;
  return material;
}

function mergeHueyParts(parts: THREE.BufferGeometry[], trimColors=false) {
  const vertices: number[] = [], normals: number[] = [], paint:number[]=[];
  const ink=new THREE.Color();
  for (const part of parts) {
    const flat = part.index ? part.toNonIndexed() : part;
    vertices.push(...flat.getAttribute('position').array);
    normals.push(...flat.getAttribute('normal').array);
    if(trimColors){ink.set(part.userData.paint ?? '#424f47');
      for(let n=0;n<flat.getAttribute('position').count;n++)paint.push(ink.r,ink.g,ink.b);}
    if (flat !== part) flat.dispose();
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if(trimColors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(paint,3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function hueyRod(a: Point, b: Point, radius: number, sides = 6) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  const midpoint = start.add(end).multiplyScalar(0.5);
  return geometry.translate(midpoint.x, midpoint.y, midpoint.z);
}

function hueyPanel(points: Point[]) {
  const positions: number[] = [];
  for (let point = 1; point < points.length - 1; point++) positions.push(...points[0], ...points[point], ...points[point + 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function hueyLoft(stations: Array<[number, number, number, number]>, sides = 10) {
  const vertices: number[] = [], indices: number[] = [];
  for (const [z, radiusX, radiusY, y] of stations) for (let side = 0; side < sides; side++) {
    const angle = side / sides * Math.PI * 2;
    vertices.push(Math.sin(angle) * radiusX, y + Math.cos(angle) * radiusY, z);
  }
  for (let station = 0; station < stations.length - 1; station++) for (let side = 0; side < sides; side++) {
    const a = station * sides + side, b = station * sides + (side + 1) % sides;
    indices.push(a, a + sides, b, b, a + sides, b + sides);
  }
  const last = (stations.length - 1) * sides;
  for (let side = 1; side < sides - 1; side++) indices.push(0, side, side + 1, last, last + side + 1, last + side);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Two opposed blades, not crossed four-blade geometry. The tail rotor lies
 * in YZ and must rotate around X; main rotor remains in XZ rotating around Y. */
export function createHueyRotorGeometry(tail = false, wrecked = false) {
  const pieces: THREE.BufferGeometry[] = [];
  if (tail) {
    pieces.push(new THREE.BoxGeometry(0.035, HUEY_ANCHORS.tailRotorDiameter, 0.095));
    pieces.push(new THREE.CylinderGeometry(0.065, 0.065, 0.09, 8).rotateZ(Math.PI / 2));
  } else {
    for (const side of [-1, 1]) {
      const end = wrecked && side > 0 ? 1.85 : HUEY_ANCHORS.mainRotorDiameter * 0.5;
      pieces.push(hueyPanel([[side * 0.14, 0, -0.085], [side * end, wrecked ? -0.13 : -0.035, -0.068],
        [side * end, wrecked ? -0.13 : -0.035, 0.068], [side * 0.14, 0, 0.085]]));
    }
    pieces.push(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 10));
    // The short Bell stabilizer bar is visibly smaller than the two main blades.
    pieces.push(hueyRod([0, 0.12, -0.52], [0, 0.12, 0.52], 0.018));
  }
  return mergeHueyParts(pieces);
}

/** Original merged UH-1D/H-shaped airframe. Consumers keep their existing
 * flight path, wreck pose/flames and rotor refs; only presentation is replaced. */
export function createHueyAirframeGeometries(wrecked = false, distant = false) {
  const body = [createHueyCabinGeometry(true, wrecked)];
  const dark: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
  body.push(hueyLoft([[1.30, 0.28, 0.25, 0.14], [2.40, 0.21, 0.20, 0.20],
    [4.25, 0.12, 0.12, 0.35], [5.14, 0.075, 0.09, 0.49]], distant ? 6 : 10));
  body.push(hueyPanel([[0, 0.26, 4.74], [0, 1.25, 5.11], [0, 1.24, 5.48], [0, 0.25, 5.16]]));
  body.push(hueyLoft([[-0.05, 0.27, 0.13, 0.70], [0.40, 0.39, 0.22, 0.75],
    [1.14, 0.31, 0.20, 0.74], [1.42, 0.18, 0.12, 0.70]], distant ? 6 : 10));
  dark.push(hueyRod([0, 0.79, 0], HUEY_ANCHORS.mainRotor, 0.065, 8));
  dark.push(new THREE.CylinderGeometry(0.125, 0.145, 0.22, distant?8:10, 1, true).rotateX(Math.PI / 2).translate(0, 0.77, 1.42));
  dark.push(new THREE.BoxGeometry(1.45, 0.075, 1.53).translate(0, -0.44, 0.25));
  const interior=(color:string,pts:Point[])=>{const panel=hueyPanel(pts);panel.userData.paint=color;dark.push(panel);};
  // Back and ceiling, not a solid card across the door: the view between
  // opposite doorways remains open. A folded buff bench/end frame gives
  // the troop compartment its characteristic visible inner depth.
  interior('#263839',[[-.73,-.42,.92],[.73,-.42,.92],[.73,.34,.92],[-.73,.34,.92]]);
  const ceiling=wrecked?.35:.595,header=wrecked?.40:.50;
  interior('#354541',[[-.67,ceiling,-.46],[.67,ceiling,-.46],[.67,ceiling,.91],[-.67,ceiling,.91]]);
  interior('#9a8863',[[-.66,-.19,.82],[.66,-.19,.82],[.66,-.19,.54],[-.66,-.19,.54]]);
  interior('#5e6251',[[-.66,-.20,.81],[.66,-.20,.81],[.66,.12,.87],[-.66,.12,.87]]);
  // Inward-facing webbing strips stay inside the door (no extra draw call).
  for(const x of [-.36,0,.36])interior('#aa9770',[[x,.10,.854],[x+.044,.10,.854],[x+.044,-.17,.803],[x,-.17,.803]]);
  if(!wrecked){
    // Opposing canvas seat on the actual forward bulkhead. Seat pans and
    // web backs stay well below the sight line through both open doors.
    interior('#99876a',[[-.63,-.166,-.455],[.63,-.166,-.455],[.63,-.166,-.162],[-.63,-.166,-.162]]);
    interior('#717660',[[-.64,-.17,-.45],[.64,-.17,-.45],[.64,.14,-.458],[-.64,.14,-.458]]);
    if(!distant)for(const x of [-.50,-.26,.22,.49])interior('#ab9a78',[[x,-.17,-.436],[x+.044,-.17,-.436],[x+.044,.16,-.453],[x,.16,-.453]]);
  }

  for (const side of [-1, 1]) {
    // Faceted cockpit glazing follows the tapered nose and shares one batch.
    glass.push(hueyPanel([[side * 0.025, 0.657, -1.12], [side * 0.489, 0.657, -1.12],
      [side * 0.358, 0.217, -1.90], [side * 0.025, 0.217, -1.90]]));
    glass.push(new THREE.CircleGeometry(1, 10).scale(0.19, 0.095, 1).rotateY(Math.PI)
      .translate(side * 0.25, -0.20, -1.905));
    // A split crew-door pane stood *inside* the cabin side on the old mesh.
    // Follow its changing half-width, step the leading corner and leave a
    // narrow olive mullion/dark lower seal. This is true glazing, not a decal.
    const sidePane=(z:number,y:number,clearance=.014):Point=>[
      side*(.76+.02*(z+1.12)/.62+clearance),y,z];
    glass.push(hueyPanel([sidePane(-1.09,.26),sidePane(-1.00,.345),sidePane(-.847,.345),
      sidePane(-.847,-.078),sidePane(-1.09,-.078)]));
    glass.push(hueyPanel([sidePane(-.82,.345),sidePane(-.54,.345),sidePane(-.54,-.078),sidePane(-.82,-.078)]));
    // The sliding troop door is still open: its visible shell is parked
    // aft of the opening, never across the forward path through the bay.
    const slide=(z:number,y:number):Point=>[side*.799,y,z];
    body.push(hueyPanel([slide(.73,-.35),slide(1.07,-.35),slide(1.07,.34),slide(.73,.34)]));
    glass.push(hueyPanel([[side*.807,.08,.78],[side*.807,.08,1.02],
      [side*.807,.279,1.02],[side*.807,.279,.78]]));
    const ledge=(x:number,y:number,z:number):Point=>[side*x,y,z];
    interior('#909776',[ledge(.77,-.36,-.46),ledge(.84,-.36,-.46),ledge(.84,-.36,.74),ledge(.77,-.36,.74)]);
    interior('#b3a47a',[ledge(.815,header,-.49),ledge(.815,header+.047,-.43),ledge(.815,header+.047,.99),ledge(.815,header,1.05)]);
    // Boot guard at the nose of the skid, and the broad tapered intake cheek atop the cabin.
    interior('#a6a78d',[ledge(.858,-.89,-1.56),ledge(.858,-.925,-1.55),ledge(.858,-1.047,-1.26),ledge(.858,-1.012,-1.29)]);
    body.push(hueyPanel([ledge(.245,.76,-.49),ledge(.245,.92,-.26),ledge(.245,.91,.08),ledge(.245,.73,.14)]));
    interior('#384744',[ledge(.251,.79,-.40),ledge(.251,.88,-.24),ledge(.251,.87,-.08),ledge(.251,.79,-.14)]);
    body.push(hueyPanel([[side * 0.09, 0.27, 3.43], [side * 0.81, 0.27, 3.64],
      [side * 0.80, 0.27, 3.91], [side * 0.09, 0.27, 3.83]]));
    for (const z of [-0.48, 0.99]) body.push(hueyRod([side * 0.77, -0.34, z], [side * 0.77, header, z], 0.024));
    body.push(hueyRod([side * 0.77, header, -0.48], [side * 0.77, header, 0.99], 0.027));
    const skidPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.84, -0.90, -1.56), new THREE.Vector3(side * 0.84, -1.035, -1.28),
      new THREE.Vector3(side * 0.84, -1.05, 0.70), new THREE.Vector3(side * 0.84, -1.03, 1.34),
    ]);
    dark.push(new THREE.TubeGeometry(skidPath, distant ? 5 : 9, 0.033, 6, false));
    for (const z of [-0.71, 0.76]) dark.push(hueyRod([side * 0.41, -0.35, z], [side * 0.84, -1.03, z], 0.031));
    if (!distant) {
      body.push(hueyRod([side * 0.023, 0.216, -1.90], [side * 0.023, 0.66, -1.12], 0.018));
      body.push(hueyRod([side * 0.025, 0.66, -1.12], [side * 0.494, 0.66, -1.12], 0.019));
      dark.push(new THREE.BoxGeometry(0.44, 0.07, 1.10).translate(side * 0.50, -0.14, 0.28));
    }
  }
  return {
    body: mergeHueyParts(body), dark: mergeHueyParts(dark,true), glass: mergeHueyParts(glass),
    mainRotor: createHueyRotorGeometry(false, wrecked), tailRotor: createHueyRotorGeometry(true),
  };
}
