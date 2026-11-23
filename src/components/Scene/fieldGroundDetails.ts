import * as THREE from 'three';

type Point = [number, number, number];
type Vertex = { p: Point; color: THREE.Color };
const tint = (hex: string) => new THREE.Color(hex);
const paint = (p: Point, color: THREE.Color): Vertex => ({ p, color });
const between = (a: Point, b: Point, t: number): Point =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Opaque triangles: the pigment belongs to the form, including its underside.
// No texture, alpha sorting, per-instance randomness or render-time work.
function surface() {
  const xyz: number[] = [], rgb: number[] = [];
  function triangle(a: Vertex, b: Vertex, c: Vertex) {
    for (const { p, color } of [a, b, c]) {
      xyz.push(...p); rgb.push(color.r, color.g, color.b);
    }
  }
  function top(a: Vertex, b: Vertex, c: Vertex) {
    const x = b.p[0] - a.p[0], z = b.p[2] - a.p[2];
    if (z * (c.p[0] - a.p[0]) - x * (c.p[2] - a.p[2]) > 0) triangle(a, b, c);
    else triangle(c, b, a);
  }
  function finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  return { triangle, top, finish };
}

export function buildBrushScreenGeometry() {
  const s = surface();
  const reedShadow = tint('#494732'), reedLight = tint('#777348');
  // Bend and taper triangular stalks all the way from the ground to the leaf
  // axils. Each ring is ordered clockwise as seen from above.
  function stalk(nodes: Point[], radii: number[]) {
    const rings = nodes.map(([x, y, z], i) => [0, 1, 2].map(k => {
      const angle = .31 + k * Math.PI * 2 / 3, r = radii[i];
      return paint([x + Math.cos(angle) * r, y, z + Math.sin(angle) * r], k === 0 ? reedLight : reedShadow);
    }));
    for (let i = 1; i < rings.length; i++) for (let k = 0; k < 3; k++) {
      const n = (k + 1) % 3, a = rings[i - 1], b = rings[i];
      s.triangle(a[k], b[k], a[n]); s.triangle(a[n], b[k], b[n]);
    }
    const t = rings[rings.length - 1]; s.top(t[0], t[1], t[2]);
  }
  const shoots: Point[][] = [
    [[-.11, 0, -.052], [-.135, .103, -.068], [-.116, .217, -.093]],
    [[.043, 0, .043], [.033, .127, .079], [.072, .242, .073]],
    [[.127, 0, -.093], [.097, .092, -.107], [.126, .164, -.122]],
  ];
  shoots.forEach(nodes => stalk(nodes, [.011, .007, .004]));
  const branching: Point = [-.053, .182, -.038];
  stalk([shoots[0][1], branching], [.006, .003]);
  const palette = [
    ['#314e37', '#52683d', '#778454', '#415b39'],
    ['#364b33', '#687745', '#93965c', '#506641'],
    ['#2c4535', '#455f3e', '#737e50', '#3d5740'],
  ].map(row => row.map(tint));
  // Axil, blade tip, broadest half-width, arch, twist and wash. Offset
  // shoulders and rolled edges give these ginger-like leaves a handedness:
  // the ridge is not the centre of a symmetrical diamond.
  function blade(from: Point, tip: Point, width: number, arch: number, roll: number, wash: number) {
    const dx = tip[0] - from[0], dz = tip[2] - from[2], reach = Math.hypot(dx, dz);
    const nx = -dz / reach, nz = dx / reach;
    const [shadow, green, rib, margin] = palette[wash];
    const cross = (t: number, span: number, bend: number) => {
      const [x, y, z] = between(from, tip, t);
      const at = (w: number, h: number, color: THREE.Color) =>
        paint([x + nx * w, y + bend + h, z + nz * w], color);
      const w = width * span;
      return [
        at(-w, -.23 * w + roll * t, green),
        at(-w * .10, .16 * w, rib),
        at(.86 * w, -.30 * w - roll * t, margin),
        at(.05 * w, -.24 * w, shadow),
      ];
    };
    const base = paint(from, shadow), end = paint(tip, margin);
    const a = cross(.29, .80, .72 * arch), b = cross(.64, 1, arch);
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      s.triangle(base, a[n], a[k]);
      s.triangle(a[k], a[n], b[k]); s.triangle(a[n], b[n], b[k]);
      s.triangle(b[k], b[n], end);
    }
  }
  blade(shoots[0][1], [-.302,.160,-.026], .052,.070, .008, 2);
  blade(shoots[0][2], [-.246,.298,-.188], .062,.069,-.014, 0);
  blade(shoots[0][2], [-.159,.203,-.287], .053,.066, .009, 1);
  blade(branching,     [-.028,.413,-.139], .038,.041,-.008, 1);
  blade(branching,     [.017,.219,.105],   .051,.064, .010, 2);
  blade(shoots[1][1], [-.077,.170,.238],   .064,.065,-.012, 2);
  blade(shoots[1][2], [.156,.377,.123],    .046,.048,-.006, 0);
  blade(shoots[1][2], [.267,.211,.178],    .062,.075, .015, 1);
  blade(shoots[2][1], [.245,.135,-.034],   .047,.051, .011, 0);
  blade(shoots[2][2], [.214,.240,-.253],   .044,.059,-.007, 2);
  return s.finish();
}

export function buildFightingPositionGeometry() {
  const s = surface();
  // Damp scrape: a raked, irregular floor, fading into the terrain at its
  // open rear. The rings are shallow contour breaks, not a dark flat disc.
  const floorEdge = [
    [-.52,-.07],[-.43,-.24],[-.17,-.31],[.12,-.31],[.38,-.24],[.53,-.09],
    [.51,.14],[.36,.32],[.12,.437],[-.13,.454],[-.38,.34],[-.55,.16],
  ];
  const floorPaint = ['#4b3b2d','#584430','#51412f','#5e4934'].map(tint);
  const middle = paint([-.042,.013,.052], tint('#4d4031'));
  const floorRings = [.46,.82,1].map((r, band) => floorEdge.map(([x,z], i) => {
    const [px,,pz] = between(middle.p, [x,0,z], r);
    return paint([px, [.022,.030,.005][band] + (i % 3) * .0018, pz],
      floorPaint[(i + band + (i >> 2)) % 4]);
  }));
  for (let i = 0; i < floorEdge.length; i++) {
    const j = (i + 1) % floorEdge.length;
    s.top(middle, floorRings[0][i], floorRings[0][j]);
    for (let k = 0; k < 2; k++) {
      const a = floorRings[k], b = floorRings[k + 1];
      s.top(a[i], b[i], a[j]); s.top(b[i], b[j], a[j]);
    }
  }

  // One continuous U-shaped bank. Its cross-sections have independent high
  // points, slumped outer toes, a chipped ledge and a steeper inner cut.
  // x, z, width from ridge to toe, ridge elevation, shoulder offset.
  const path = [
    [-.66,.159,.130,.055,.020],[-.651,.077,.213,.171,-.025],
    [-.643,-.039,.236,.252,.020],[-.581,-.194,.214,.225,-.012],
    [-.475,-.337,.222,.262,.018],[-.314,-.403,.201,.279,-.007],
    [-.163,-.445,.195,.259,.019],[.008,-.463,.198,.311,-.013],
    [.184,-.435,.204,.267,.013],[.326,-.406,.186,.254,-.018],
    [.476,-.314,.206,.272,.019],[.590,-.19,.219,.207,.005],
    [.624,-.057,.242,.250,-.014],[.659,.066,.224,.176,.013],[.651,.153,.128,.069,-.008],
  ];
  const layerPaint = ['#61503b','#776046','#85694b','#977954','#6c533d','#5a4534','#51402f'].map(tint);
  const rings = path.map(([x,z,w,h,shift], i) => {
    const prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
    const dx = next[0] - prev[0], dz = next[1] - prev[1], len = Math.hypot(dx,dz);
    return [[w,.009],[w*.66 + shift,h*.49],[w*.29,h*.86],[shift,h],[-w*.32,h*.85],[-w*.60,h*.39],[-w*.81,.023]]
      .map(([offset,y], k) => paint([x + dz / len * offset, y, z - dx / len * offset],
        layerPaint[k].clone().multiplyScalar([.94,1.05,.99,1.09,.92,1.02][(i + (k >> 1)) % 6])));
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i+1];
    for (let k = 0; k < a.length - 1; k++) {
      s.top(a[k], b[k], a[k+1]); s.top(b[k], b[k+1], a[k+1]);
    }
  }
  for (const cap of [rings[0], rings[rings.length - 1]]) {
    const toe = paint(between(cap[0].p, cap[6].p, .5), layerPaint[6]);
    toe.p[1] = .006;
    for (let k = 0; k < 6; k++) {
      if (cap === rings[0]) s.triangle(toe,cap[k+1],cap[k]);
      else s.triangle(toe,cap[k],cap[k+1]);
    }
  }
  // Address the actual triangle, so flakes and roots sit on the skin rather
  // than floating when the bank changes slope.
  function skin(u: number, v: number, lift = 0): Point {
    const i = Math.floor(u), k = Math.floor(v), a = u-i, b = v-k;
    const n = rings[i][k].p, e = rings[i+1][k].p, f = rings[i][k+1].p, d = rings[i+1][k+1].p;
    const p: Point = [0,0,0];
    for (let j = 0; j < 3; ++j) p[j] = a+b <= 1
      ? (1-a-b)*n[j] + a*e[j] + b*f[j] : (1-b)*e[j] + (1-a)*f[j] + (a+b-1)*d[j];
    p[1] += lift;
    return p;
  }
  // Cracked cap flakes have a sheer broken edge on one side and taper back
  // into the clay. Tilted chips, not detached stones or polygon spheres.
  const flake = [[-.49,-.25],[-.09,-.49],[.48,-.26],[.39,.19],[.06,.48],[-.46,.18]];
  const chips = [[1.86,3.47,.88,1.14],[3.64,2.8,1.3,1.48],[4.88,4.55,.64,1.30],
    [5.5,2.74,1.12,.98],[6.76,3.10,1.20,1.44],[7.73,4.15,.59,.92],
    [8.94,1.93,.73,1.15],[10.15,3.41,1.05,1.23],[11.93,2.89,1.03,1.41],[12.71,4.39,.58,.85]];
  chips.forEach(([u,v,w,h], i) => {
    const cut = tint(i % 2 ? '#68513a' : '#70583e');
    const crust = tint(['#9a7b55','#8b7354','#947557'][i % 3]);
    const rim = flake.map(([a,b],j) => {
      const point = skin(u + a*w, v + (i % 2 ? b : -b)*h, .004);
      return paint(point, j < 3 ? cut : layerPaint[2]);
    });
    const cap = rim.map(({p},j) => paint([p[0],p[1] + [0.014,.024,.021,.009,.003,.004][j],p[2]], crust));
    const crown = paint(skin(u-.07*w,v,.023), crust);
    for (let j = 0; j < rim.length; j++) {
      const k = (j+1)%rim.length;
      s.top(crown,cap[j],cap[k]);
      const a = rim[j], b = rim[k], A = cap[j], B = cap[k];
      // Counterclockwise in x/z has outward sides on the right of each edge.
      if (i % 2) { s.triangle(a,A,b); s.triangle(b,A,B); }
      else { s.triangle(b,A,a); s.triangle(B,A,b); }
    }
  });
  // Roots are painted over the eroded surface with a lit upper fibre and
  // shadowed edge. Broad at emergence, then fork and disappear into the soil.
  function root(points: Point[], fine = false) {
    const fibre = tint(fine ? '#937855' : '#9c7d55'), side = tint('#70543a');
    const row = points.map(([u,v,w]) => [
      paint(skin(u-w,v,.004),side), paint(skin(u,v,.004 + w*.04),fibre), paint(skin(u+w,v,.004),side),
    ]);
    for (let i = 1; i < row.length; i++) for (let k = 0; k < 2; k++) {
      const a = row[i-1], b = row[i];
      s.top(a[k],a[k+1],b[k]); s.top(a[k+1],b[k+1],b[k]);
    }
  }
  root([[2.41,3.52,.10],[2.53,4.06,.082],[2.42,4.55,.065],[2.18,4.95,.058],[2.04,5.63,.013]]);
  root([[2.42,4.55,.052],[2.68,4.84,.030],[2.74,5.19,.009]],true);
  root([[5.97,2.89,.09],[5.80,2.32,.079],[5.54,1.84,.057],[5.49,1.3,.037],[5.21,.96,.010]]);
  root([[5.54,1.84,.046],[5.27,1.76,.025],[5.13,1.46,.010]],true);
  root([[9.91,3.75,.086],[9.70,4.28,.073],[9.61,4.76,.044],[9.39,5.04,.027],[9.27,5.52,.010]]);
  root([[9.61,4.76,.041],[9.88,5.01,.020],[9.98,5.31,.010]],true);
  return s.finish();
}
