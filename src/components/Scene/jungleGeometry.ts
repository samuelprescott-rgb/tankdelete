import * as THREE from 'three';

// All plants share a bounded set of geometries. Alpha-tested branch sprays fill
// the canopy while curved leaf surfaces retain close-up depth and silhouettes.
class PlantGeometry {
  private positions: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private leafSurfaces: number[] = [];

  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color,
    uv: readonly number[] = [0, 0, 0, 1, 1, 1], leafSurface = false) {
    for (const point of [a, b, c]) {
      this.positions.push(point.x, point.y, point.z);
      this.colors.push(color.r, color.g, color.b);
      this.leafSurfaces.push(leafSurface ? 1 : 0);
    }
    this.uvs.push(...uv);
  }

  leaf(origin: THREE.Vector3, angle: number, length: number, width: number,
    rise: number, color: THREE.Color, droop = 0.12) {
    const forward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    // Two tapered shoulders make a curved lanceolate leaf, not the old diamond
    // plate. Four triangles retain cheap silhouettes even with many small leaves.
    const shoulder = origin.clone().addScaledVector(forward, length * 0.34);
    shoulder.y += rise * 0.78 + width * 0.2;
    const lower = origin.clone().addScaledVector(forward, length * 0.72);
    lower.y += rise - droop * 0.3;
    const left = shoulder.clone().addScaledVector(side, width);
    const right = shoulder.clone().addScaledVector(side, -width);
    const leftLower = lower.clone().addScaledVector(side, width * 0.59);
    const rightLower = lower.clone().addScaledVector(side, -width * 0.59);
    right.y -= width * 0.17;
    rightLower.y -= width * 0.15;
    const tip = origin.clone().addScaledVector(forward, length);
    tip.y += rise - droop;
    this.triangle(origin, left, right, color.clone().multiplyScalar(0.86), [0.5, 0, 0, 0.34, 1, 0.34], true);
    this.triangle(left, leftLower, right, color, [0, 0.34, 0.2, 0.72, 1, 0.34], true);
    this.triangle(leftLower, rightLower, right, color.clone().multiplyScalar(0.96), [0.2, 0.72, 0.8, 0.72, 1, 0.34], true);
    this.triangle(leftLower, tip, rightLower, color.clone().multiplyScalar(0.89), [0.2, 0.72, 0.5, 1, 0.8, 0.72], true);
  }

  stem(points: THREE.Vector3[], baseRadius: number, tipRadius: number,
    baseColor: THREE.Color, sides = 6, radialYScale = 1, fluted = false) {
    const direction = new THREE.Vector3();
    const side = new THREE.Vector3();
    const cross = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const vertices: THREE.Vector3[][] = [];
    points.forEach((point, index) => {
      direction.subVectors(points[Math.min(points.length - 1, index + 1)],
        points[Math.max(0, index - 1)]).normalize();
      // Transport the previous ring's frame along the curve. Re-selecting a
      // reference axis at a tangent threshold rotates matching ring vertices
      // abruptly, pinching a smooth trunk into large diagonal bark wedges.
      side.addScaledVector(direction, -side.dot(direction));
      if (side.lengthSq() < 1e-8) {
        side.crossVectors(direction, Math.abs(direction.y) > 0.95
          ? new THREE.Vector3(0, 0, 1) : up);
      }
      side.normalize();
      cross.crossVectors(direction, side).normalize();
      const height = index / (points.length - 1);
      const radius = THREE.MathUtils.lerp(baseRadius, tipRadius, height);
      vertices.push(Array.from({ length: sides }, (_, segment) => {
        const angle = segment / sides * Math.PI * 2;
        const rootSplay = fluted ? 1 + .38 * (1 - THREE.MathUtils.smoothstep(point.y, .011, .145)) : 1;
        const ridge = (fluted
          ? 1 + (.19 - height * .09) * Math.cos(angle * 3 + height * 1.35) + .07 * Math.sin(angle * 5 - height * 2.2)
          : 1 + Math.sin(segment * 2.7) * .1) * rootSplay;
        const vertex = point.clone().addScaledVector(side, Math.cos(angle) * radius * ridge)
          .addScaledVector(cross, Math.sin(angle) * radius * ridge);
        // Tree height is normalized while horizontal branch dimensions are in
        // metres. Compensate only cross-sections, not their centreline, before
        // the instance's height scale; otherwise thin limbs become tall wedges.
        vertex.y = point.y + (vertex.y - point.y) * radialYScale;
        return vertex;
      }));
    });
    for (let ring = 1; ring < vertices.length; ring += 1) {
      for (let segment = 0; segment < sides; segment += 1) {
        const next = (segment + 1) % sides;
        const color = baseColor.clone().multiplyScalar(fluted
          ? .90 + Math.cos(segment / sides * Math.PI * 6 + ring * .19) * .13
          : .84 + noise(segment, ring) * .18);
        const u = segment / sides;
        const nextU = (segment + 1) / sides;
        const v = (ring - 1) / (vertices.length - 1) * 4;
        const nextV = ring / (vertices.length - 1) * 4;
        this.triangle(vertices[ring - 1][segment], vertices[ring][next], vertices[ring][segment], color,
          [u, v, nextU, nextV, u, nextV]);
        this.triangle(vertices[ring - 1][segment], vertices[ring - 1][next], vertices[ring][next], color,
          [u, v, nextU, v, nextU, nextV]);
      }
    }
  }

  finish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('leafSurface', new THREE.Float32BufferAttribute(this.leafSurfaces, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function noise(index: number, salt: number) {
  const value = Math.sin(index * 91.719 + salt * 17.173) * 43758.5453;
  return value - Math.floor(value);
}

const leafColors = ['#526e3b', '#698349', '#41674d', '#7a874c', '#3f644b'].map(color => new THREE.Color(color));

// Keep the original alpha silhouettes. The albedo is a set of broad, cool
// green and sunlit olive paint values, with warm seams on the branches.
export const PAINTED_LEAF_GLSL = /* glsl */ `
  vec3 paintedLeafColor(vec3 albedo, float stroke) {
    float value = dot(albedo, vec3(0.24, 0.64, 0.12));
    float pigment = value + stroke * 0.018;
    vec3 body = mix(vec3(0.030, 0.076, 0.060), vec3(0.102, 0.169, 0.084),
      smoothstep(0.033, 0.13, pigment));
    vec3 leaf = mix(body, vec3(0.220, 0.265, 0.119), smoothstep(0.14, 0.26, pigment));
    vec3 twig = mix(vec3(0.058, 0.047, 0.028), vec3(0.18, 0.133, 0.071),
      smoothstep(0.045, 0.182, pigment));
    return mix(twig, leaf, smoothstep(-0.006, 0.027, albedo.g - albedo.r));
  }
`;

/** A forked bough, not a closed crown mesh. Each textured spray grows from
 * the spine of its parent; the clear space between branches is actual sky.
 * Pitch, curl and roll all vary, so these are not horizontal rosette shelves. */
export function createJungleCrownGeometry(detail: 'near' | 'mid' | 'far' = 'near') {
  const builder = new PlantGeometry();
  const spray = (base: THREE.Vector3, angle: number, length: number, halfWidth: number,
    rise: number, arch: number, roll: number, value: number, folds=2) => {
    const along = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const across = new THREE.Vector3(-along.z, 0, along.x);
    const spineAt = (t: number) => {
      const point = base.clone().addScaledVector(along, t * length)
        .addScaledVector(across, Math.sin(roll)*length*.18*t*t);
      point.y += t * rise + Math.sin(t * Math.PI) * arch;
      return point;
    };
    const rim = (t: number, side: number) => {
      const twist = roll + .52 * t;
      const w=halfWidth*(t<=.5?.63+.90*t:1.08-.46*(t-.5));
      const point = spineAt(t).addScaledVector(across, side * w * Math.cos(twist));
      point.y += side*w*Math.sin(twist)-t*t*length*.12;
      return point;
    };
    const color = new THREE.Color(.94 * value, value, .91 * value);
    for (let fold=0;fold<folds;fold++) {
      const start=fold/folds,end=(fold+1)/folds;
      const a = rim(start, -1), b = rim(start, 1), c = rim(end, -1), d = rim(end, 1);
      builder.triangle(a, c, b, color, [0, start, 0, end, 1, start], true);
      builder.triangle(b, c, d, color, [1, start, 0, end, 1, end], true);
    }
    return spineAt;
  };
  const limbs = detail === 'near' ? 6 : detail === 'mid' ? 5 : 4;
  const salt = detail === 'near' ? 51 : detail === 'mid' ? 71 : 89;
  for (let i = 0; i < limbs; i++) {
    const n = (channel: number) => noise(i, salt + channel);
    // A bough grows into available light. Two offset hands reach in
    // opposite directions; the low inward gap stays empty and one spur
    // turns partly toward the viewer. Avoid the radial star/brush head
    // silhouette that identical upright sprays made in profile.
    const plan=[-.33,.25,2.57,3.48,1.15,4.67];
    const angle = plan[i]+(n(1)-.5)*.34;
    const upper = i===1||i===4, lean = i % 2 ? -1 : 1;
    const base = new THREE.Vector3(-.19+i*.055,-.34+i*.095,-.08+i*.024);
    const length = (i===0?1.70:i===2?1.48:i===3?.80:1.0)+n(2)*.36;
    const rise = upper ? .68+n(3)*.48 : i===3?.32:-.08+n(4)*.37;
    // Some crowns open into fingers while the neighboring bough is full.
    // Do not globally thin the jungle or replace distant crowns with blobs.
    const width = (detail === 'far' ? .61 : .51)*(.86+.24*n(37));
    const leading=i===0||i===2||i===4;
    // Spend the near-only faces on the curve of the longest wrists. Their
    // bend survives the driver camera; a third tiny leaf beyond a spur didn't.
    const spine = spray(base, angle, length, width * length, rise, .29, lean*(.24+n(5)*.58),upper?.94:.73,
      detail==='near'&&leading?4:2);
    // Main boughs carry a large hand and a tucked half-hand; the short
    // return spurs terminate early. Leave a wedge of *actual* negative
    // space between families, even in densely planted stands. No extra cards.
    const forks=detail==='near'?(leading?3:2):i===1||i===3?1:2;
    for (let j = 0; j < forks; j++) {
      const side = (j % 2 ? -1 : 1)*lean;
      // Start below the terminal leaf: the photographic stalk at the base
      // overlaps its parent rather than hanging off a vanishing 1px leaf tip.
      const t = j === 0 ? .78 : j === 1 ? .56 : .32;
      const forkLength = (j===0?1.42:j===1?.97:.72) + n(6+j)*.35;
      spray(spine(t), angle + side * (.28 + j * .54 + n(10 + j) * .27), forkLength,
        forkLength * (width + n(13 + j) * .07),
        (upper ? .16 : -.43) + n(16+j)*.55-j*.10, .19+n(20+j)*.14,
        side*(n(23+j)-.19)*1.43, .74+n(26+j)*.23);
    }
  }
  return builder.finish();
}

/** Low branching sprays overlap into a leafy forest floor, not isolated tufts. */
export function createJungleShrubGeometry() {
  const builder=new PlantGeometry();
  const course=(base:THREE.Vector3,a:number,length:number,w:number,tipY:number,twist:number,tone:number)=>{
    const f=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),s=new THREE.Vector3(-f.z,0,f.x);
    const point=(t:number,side:number)=>{
      const width=w*(1-.20*t),roll=twist+.72*t;
      return base.clone().addScaledVector(f,length*t).addScaledVector(s,side*width*Math.cos(roll)+twist*t*t*.10)
        .add(new THREE.Vector3(0,tipY*t+.13*Math.sin(Math.PI*t)+side*width*Math.sin(roll),0));
    };
    const color=new THREE.Color(tone*.94,tone,tone*.93);
    for(const t0 of [0,.5]){const t=t0+.5,a=point(t0,-1),b=point(t0,1),c=point(t,-1),d=point(t,1);
      builder.triangle(a,c,b,color,[0,t0,0,t,1,t0]);builder.triangle(b,c,d,color,[1,t0,0,t,1,t]);}
    return point(.53,0);
  };
  for(let i=0;i<4;i++){
    const a=i*2.39996+noise(i,560)*.47,length=.56+noise(i,563)*.28;
    const base=new THREE.Vector3(Math.cos(a)*.09,.05+noise(i,562)*.14,Math.sin(a)*.09);
    const fork=course(base,a,length,length*(.30+.06*noise(i,564)),.14+.32*noise(i,565),noise(i,566)*.70-.37,.78+.20*noise(i,567));
    if(i%2===0)course(fork,a+.66-(i%4)*.57,length*.51,length*.224,.10+noise(i,568)*.18,-.51+.17*i,.93);
  }
  return builder.finish();
}

/** Original leaf-spray atlas: small pointed leaves and stems on clear alpha. */
export function createJungleCanopyTexture(size = 512) {
  const unit = size / 512;
  const pixels = new Uint8Array(size * size * 4);
  const paint = (x: number, y: number, r: number, g: number, b: number, alpha: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = (y * size + x) * 4;
    if (alpha < pixels[index + 3]) return;
    pixels[index] = r; pixels[index + 1] = g; pixels[index + 2] = b; pixels[index + 3] = alpha;
  };
  const stem = (ax: number, ay: number, bx: number, by: number, thickness: number) => {
    ax *= unit; ay *= unit; bx *= unit; by *= unit;
    thickness = Math.round(thickness * unit);
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let step = 0; step <= steps; step++) {
      const x = Math.round(THREE.MathUtils.lerp(ax, bx, step / steps));
      const y = Math.round(THREE.MathUtils.lerp(ay, by, step / steps));
      for (let oy = -thickness; oy <= thickness; oy++) for (let ox = -thickness; ox <= thickness; ox++) {
        if (ox * ox + oy * oy <= thickness * thickness) paint(x + ox, y + oy, 91, 101, 57, 255);
      }
    }
  };
  stem(256, 13, 264, 494, 2);
  for (let twig = 0; twig < 9; twig++) {
    const originX = 256 + twig * 0.7;
    const originY = 48 + twig * 44;
    const reach = 152 - twig * 5 + noise(twig, 511) * 19;
    for (const sign of [-1, 1]) {
      const tipX = originX + sign * reach;
      const tipY = originY + 69;
      stem(originX, originY, tipX, tipY, 1);
      for (let leaf = 0; leaf < 5; leaf++) {
        const t = 0.18 + leaf * 0.17;
        const ax = THREE.MathUtils.lerp(originX, tipX, t);
        const ay = THREE.MathUtils.lerp(originY, tipY, t);
        const angle = Math.atan2(tipY - originY, tipX - originX)
          + (leaf % 2 ? -1 : 1) * sign * (0.65 + noise(twig, leaf + 513) * 0.45);
        const length = 29 + noise(twig, leaf + 519) * 26;
        const width = 6.5 + noise(twig, leaf + 523) * 5;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const minX = Math.max(0, Math.floor((Math.min(ax, ax + cosine * length) - width) * unit - 1));
        const maxX = Math.min(size - 1, Math.ceil((Math.max(ax, ax + cosine * length) + width) * unit + 1));
        const minY = Math.max(0, Math.floor((Math.min(ay, ay + sine * length) - width) * unit - 1));
        const maxY = Math.min(size - 1, Math.ceil((Math.max(ay, ay + sine * length) + width) * unit + 1));
        const tint = 0.83 + noise(twig, leaf + sign + 531) * 0.27;
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const dx = x / unit - ax;
          const dy = y / unit - ay;
          const along = (dx * cosine + dy * sine) / length;
          if (along <= 0 || along >= 1) continue;
          const across = -dx * sine + dy * cosine;
          const halfWidth = Math.pow(Math.sin(Math.PI * along), 0.78) * width;
          const edge = (halfWidth - Math.abs(across)) * unit;
          if (edge < -0.75) continue;
          const vein = Math.exp(-across * across / 0.8) * 0.2;
          const ribs = Math.max(0, Math.cos(along * 86 + Math.abs(across) * 0.85)) ** 9 * 0.07;
          const light = (0.79 + along * 0.13 + (across > 0 ? 0.1 : 0) + vein + ribs) * tint;
          const alpha = Math.round(THREE.MathUtils.clamp((edge + 0.75) / 1.5, 0, 1) * 255);
          paint(x, y, Math.round(102 * light), Math.round(135 * light), Math.round(64 * light), alpha);
        }
      }
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createJungleCanopyMaterial(time: { value: number }, texture: THREE.Texture, perimeter=false) {
  const material = createJungleFoliageMaterial(time, 0.055);
  material.map = texture;
  material.alphaTest = 0.48;
  material.roughness = 1;
  const compileWind = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compileWind(shader, renderer);
    // Folded crown cards have white tint vertices. If a future caller removes
    // the map, fail closed instead of drawing enormous opaque white triangles.
    shader.fragmentShader = PAINTED_LEAF_GLSL + shader.fragmentShader.replace('#include <map_fragment>',
      `#ifndef USE_MAP
         discard;
       #else
         vec4 branchTexel = texture2D(map, vMapUv);
         diffuseColor *= vec4(paintedLeafColor(branchTexel.rgb, 0.0), branchTexel.a);
       #endif`);
    // Thin leaf tissue admits soft sky light from behind. This small fill uses
    // the actual hemisphere source, so it responds to the scene's day/night mix.
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>',
      `#include <lights_fragment_end>
       #if NUM_HEMI_LIGHTS > 0
         reflectedLight.indirectDiffuse += hemisphereLights[0].skyColor * diffuseColor.rgb * 0.085;
       #endif`);
    // The perimeter is another depth plane, not a row of black twigs at
    // the same contrast as the fig. Use this scene's fog colour and the
    // current eye depth; rain keeps its own cool palette. Alpha holes and
    // the terrain/actors visible through them are completely untouched.
    if(perimeter)shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',
      `#ifdef USE_FOG
         gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, .19*smoothstep(35.,78.,vFogDepth));
       #endif
       #include <fog_fragment>`);
  };
  material.customProgramCacheKey = () => 'jungle-leaf-sprays-painted-v2:'+perimeter;
  return material;
}

/** A UV-cropped leaf from the shared atlas, with painted creases and tip light. */
export function createJungleSurfaceLeafMaterial(time: { value: number }, texture: THREE.Texture, windStrength = 0.055) {
  const material = createJungleFoliageMaterial(time, windStrength);
  material.map = texture;
  material.vertexColors = false;
  material.alphaTest = 0.42;
  material.roughness = 0.98;
  const compileWind = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compileWind(shader, renderer);
    shader.vertexShader = `attribute float leafSurface;\nvarying float vLeafSurface;\n${shader.vertexShader}`
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vLeafSurface = leafSurface;
        #ifdef USE_MAP
          vMapUv = vec2(0.522, 0.81) + uv * vec2(0.104, 0.176);
        #endif`);
    shader.fragmentShader = PAINTED_LEAF_GLSL + `varying float vLeafSurface;\nvarying vec2 vJungleUV;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 leafTexel = texture2D(map, vMapUv);
        float leafRib = 1.0 - smoothstep(0.02, 0.11, abs(vJungleUV.x - 0.5));
        float leafStroke = sin(vJungleUV.y * 22.0 + abs(vJungleUV.x - 0.5) * 17.0);
        leafTexel.rgb = paintedLeafColor(leafTexel.rgb, leafStroke * 0.6 + leafRib * 0.9);
        // Keep the actual curved stems solid; only leaf surfaces use the crop.
        leafTexel = mix(vec4(0.092, 0.12, 0.046, 1.0), leafTexel, step(0.5, vLeafSurface));
        diffuseColor *= leafTexel;
      #endif`);
  };
  material.customProgramCacheKey = () => `jungle-surface-leaf-painted-v1-${windStrength}`;
  return material;
}

export function createJungleTrunkGeometry(palm = false, detail: 'near' | 'far' = 'near') {
  const builder = new PlantGeometry();
  const bark = new THREE.Color(palm ? '#6e6451' : '#665645');
  const trunkCenter = (y: number) => new THREE.Vector3(
    Math.sin(y * 2.1) * (palm ? .4 : .19), y, Math.sin(y * 3.5) * .14);
  const samples = detail === 'far' ? [0, .5, 1] : [0, .2, .4, .6, .8, 1];
  const points = samples.map(trunkCenter);
  // Curvature is authored in a normalized one-unit height, then instanced at
  // full tree height. Keep ring thickness in metre-like units just as we do for
  // branches: scaling the tilted rings' Y radius would create tall bark spikes.
  const heroTrunk = !palm && detail === 'near';
  builder.stem(points, palm ? .19 : .34, palm ? .1 : .13, bark, detail === 'near' ? 8 : 6, .08, heroTrunk);
  if (!palm && detail === 'far') {
    // A forked silhouette replaces telephone-pole trunks. Two tiny branch
    // forks cost less than the two redundant leaf cards removed from each
    // surrounding far crown, preserving the total perimeter triangle budget.
    for (let branch = 0; branch < 2; branch++) {
      const angle = branch * 2.39996 + 0.7;
      const y = 0.64 + branch * 0.14;
      const base = trunkCenter(y);
      builder.stem([base, new THREE.Vector3(base.x + Math.cos(angle) * 1.24, y + 0.2, base.z + Math.sin(angle) * 1.24)],
      0.065, 0.012, bark, 4, 0.08);
    }
  }
  if (!palm && detail === 'near') {
    // Wide roots and high forks break the straight-cylinder silhouette.
    for (let root = 0; root < 4; root += 1) {
      const angle = root * 1.632 + .23;
      const reach = .73 + noise(root, 714) * .25;
      const [x, z] = [Math.cos(angle), Math.sin(angle)];
      builder.stem([new THREE.Vector3(x * reach, .002, z * reach),
        new THREE.Vector3(x * (reach - .23), .013, z * (reach - .23)),
        new THREE.Vector3(x * .37, .046, z * .37),
        trunkCenter(.123)], .065, .109, bark, 4, .078);
    }
    for (let branch = 0; branch < 7; branch += 1) {
      const angle = branch * 2.39996;
      const lower = branch < 3;
      const startY = lower ? 0.34 + branch * 0.12 : 0.72 + (branch - 3) * 0.05;
      const reach = lower ? 1.36 : 1.78;
      const start = trunkCenter(startY);
      const { x: startX, z: startZ } = start;
      const elbow = new THREE.Vector3(startX + Math.cos(angle) * .72, startY + .10, startZ + Math.sin(angle) * .72);
      const end = new THREE.Vector3(startX + Math.cos(angle + .16) * reach, startY + .17, startZ + Math.sin(angle + .16) * reach);
      builder.stem([start, elbow, end], lower ? .102 : .08, .016, bark, 4, .085);
      if (branch % 2 === 0) {
        const fork = angle - .76;
        builder.stem([elbow, new THREE.Vector3(elbow.x + Math.cos(fork) * .82, elbow.y + .102,
          elbow.z + Math.sin(fork) * .82)], .052, .012, bark, 3, .085);
      }
    }
  }
  return builder.finish();
}

export function createJunglePalmGeometry() {
  const builder = new PlantGeometry();
  for (let frond = 0; frond < 9; frond += 1) {
    const angle = frond * Math.PI * 2 / 9 + noise(frond, 201) * 0.26;
    const length = 2.5 + noise(frond, 202) * 0.75;
    builder.leaf(new THREE.Vector3(0, 0.03, 0), angle, length, 0.025,
      0.29, leafColors[(frond + 1) % leafColors.length], 1.12);
    for (let leaflet = 0; leaflet < 8; leaflet += 1) {
      const t = 0.12 + leaflet / 9;
      const origin = new THREE.Vector3(Math.cos(angle) * length * t,
        Math.sin(t * Math.PI) * 0.54 - t * t * 0.9, Math.sin(angle) * length * t);
      for (const side of [-1, 1]) {
        builder.leaf(origin, angle + side * 0.82,
          0.54 * Math.sin(t * Math.PI) + 0.13, 0.055,
          -0.025, leafColors[(frond + leaflet) % leafColors.length], 0.16);
      }
    }
  }
  return builder.finish();
}

export function createJungleFernGeometry() {
  const b=new PlantGeometry(), mid=new THREE.Color('#737641');
  // Staggered pinnae grow off an actual curved midrib, not floating in a ring
  // above a flat blade. Old outer leaves lean downhill; young leaves stand tall.
  // Everything below uses the same instanced batch and existing plant footprint.
  const lengths=[1.11,.73,.91,.56,1.02,.67], heights=[.33,.70,.46,.83,.42,.63];
  for(let j=0;j<6;j++){
    const a=2.39996*j+.30*(noise(j,381)-.5),f=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),right=new THREE.Vector3(-f.z,0,f.x);
    const ribs:THREE.Vector3[]=[],left:THREE.Vector3[]=[],edges:THREE.Vector3[]=[];
    for(let k=0;k<=7;k++){
      const t=k/7;
      const p=f.clone().multiplyScalar(.021+lengths[j]*t*(.70+.30*t)).addScaledVector(right,(noise(j,382)-.5)*.34*t*t);
      p.y=.021+heights[j]*(Math.sin(t*1.92)+.13*t)-(j%2===0?.32:.12)*t*t*t;
      const w=.010*(1.-t)+.0012;
      ribs.push(p);left.push(p.clone().addScaledVector(right,-w));edges.push(p.clone().addScaledVector(right,w));
      if(k){ b.triangle(left[k-1],edges[k-1],left[k],mid); b.triangle(left[k],edges[k-1],edges[k],mid); }
    }
    for(let k=2;k<7;k++)for(const side of [-1,1]){
      if(k===(j%2===0?5:3)) continue; // missing pair at a different height on each rachis
      const t=k/7,span=(.095+.16*Math.sin(Math.PI*t))*(1.02-.57*t)*(j%2===0?1.:.75);
      const origin=ribs[k].clone().lerp(ribs[k+1],side===1?.16:0);
      const outward=right.clone().multiplyScalar(side*span);
      const tip=origin.clone().add(outward).addScaledVector(f,span*(.22+.79*t));
      tip.y+=span*(.48-.92*t+.29*(noise(j*17+k,383)-.5));
      const middle=origin.clone().lerp(tip,.48);middle.y+=span*.19;
      const near=middle.clone().addScaledVector(f,-span*.17),far=middle.clone().addScaledVector(f,span*.20);far.y-=span*.095;
      const rib=middle.clone();rib.y+=span*.073;
      const color=leafColors[(j+k+1)%5];
      b.triangle(origin,near,rib,color,[.5,0,0,.48,.5,.48],true);
      b.triangle(origin,rib,far,color,[.5,0,.5,.48,1,.48],true);
      b.triangle(near,tip,rib,color,[0,.48,.54,1,.5,.48],true);
      b.triangle(rib,tip,far,color,[.5,.48,.54,1,1,.48],true);
    }
  }
  // One curled immature frond in the open centre; five short arcs, not a new mesh.
  const scroll=[new THREE.Vector3(0,.01,0),new THREE.Vector3(.038,.20,.008),
    new THREE.Vector3(.085,.42,.037),new THREE.Vector3(.125,.48,.062),
    new THREE.Vector3(.173,.46,.076),new THREE.Vector3(.151,.413,.060)];
  b.stem(scroll,.014,.006,mid,3);
  return b.finish();
}

export function createJungleBroadleafGeometry() {
  const builder=new PlantGeometry();
  for(let j=0;j<4;j++){
    const a=j*2.39996+.21*noise(j,398),f=new THREE.Vector3(Math.cos(a),0,Math.sin(a));
    const from=f.clone().multiplyScalar(.025),fork=f.clone().multiplyScalar(.20+.025*j);
    const tip=f.clone().multiplyScalar(.28+.038*j);fork.y=.16+.068*j;tip.y=fork.y+.17;
    builder.stem([from,tip],.013,.004,leafColors[(j+1)%5],3);
    for(let k=0;k<(j<2?3:2);k++){
      const origin=from.clone().lerp(tip,.40+k*.26),s=(k%2?1:-1);
      builder.leaf(origin,a+s*(.63+.26*noise(j*4+k,400)),.17+.11*noise(j*4+k,401),
        .029+.029*noise(j*4+k,402),.07+.13*noise(j*4+k,403),
        leafColors[(j+k)%5],.064+.061*noise(j*4+k,404));
    }
  }
  return builder.finish();
}

/** Each blade leaves the pseudostem as a bare petiole, cups on opposite
 * banks of its midrib, twists in the wind and folds down under its weight.
 * The same opaque batch carries the six distinct silhouettes. */
export function createJungleBananaGeometry() {
  const builder=new PlantGeometry(),smooth:THREE.Vector3[]=[];
  builder.stem([new THREE.Vector3(0,0,0),new THREE.Vector3(.025,.75,0),new THREE.Vector3(.039,1.23,.023)],
    .067,.026,new THREE.Color('#62694a'),5);
  for(let leaf=0;leaf<6;leaf++){
    const a=leaf*2.39996+.33*noise(leaf,441),f=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),s=new THREE.Vector3(-f.z,0,f.x);
    const length=[1.70,1.43,1.77,1.31,1.52,.82][leaf],wide=[.188,.256,.235,.195,.224,.079][leaf];
    const age=[1,.66,.83,.38,.66,.12][leaf],open=.13+.053*noise(leaf,442),yaw=noise(leaf,443)-.5;
    const source=new THREE.Vector3(.025,.69+leaf*.099,.014);
    const geometryAt=(t:number,k:number)=>{
      const belly=Math.min(1,Math.max(0,(t-open)/(1-open)));
      const blade=wide*Math.pow(Math.max(0,Math.sin(Math.PI*belly)),.80);
      const width=.006*(1-t)+blade;
      const side=k<0?-1:1,edge=Math.abs(k),wave=Math.sin(4.5*t+leaf*1.6);
      const roll=(yaw*.67+.58*t+(leaf%2?-.41:.21))*side;
      const curl=.20*wave*t*t+yaw*.09*t;
      // Do not chop a triangle from every segment. A thin asymmetric lamina
      // follows two aligned facets from rib to rim; longer tears sit in UV.
      const offset=k*width*(1+(side*.109*wave))*(leaf===5?.69:1);
      return source.clone().addScaledVector(f,length*t+.10*edge*width*t)
        .addScaledVector(s,curl+offset*(1-Math.min(.28,Math.abs(roll)*.28)))
        .add(new THREE.Vector3(0,Math.sin(t*Math.PI*(.68+age*.16))*(.54+.15*noise(leaf,450))
          +t*(.55-age*.54)-age*t*t*.44
          +width*(edge*.16-edge*edge*(.49+age*.36)+edge*roll)+.011*edge*wave*Math.sin(belly*Math.PI),0));
    };
    const stations=[.0,.105,.194,.30,.425,.55,.68,.803,.902,1],lanes=[-1,-.48,0,.47,1];
    const vertex=(t:number,k:number)=>{
      const p=geometryAt(t,k),dt=.001,dk=.004;
      const along=geometryAt(Math.min(1,t+dt),k).sub(geometryAt(Math.max(0,t-dt),k)).normalize();
      const across=geometryAt(Math.min(.999,Math.max(.003,t)),Math.min(1,k+dk))
        .sub(geometryAt(Math.min(.999,Math.max(.003,t)),Math.max(-1,k-dk))).normalize();
      const n=across.cross(along).normalize();
      return {p,n,u:k*.5+.5,v:t};
    };
    const grid=stations.map(t=>lanes.map(k=>vertex(t,k)));
    const base=leafColors[(leaf+2)%leafColors.length].clone(),tint=new THREE.Color();
    const triangle=(aa:typeof grid[0][0],bb:typeof grid[0][0],cc:typeof grid[0][0])=>{
      tint.copy(base).multiplyScalar(.77+.2*(aa.u+bb.u+cc.u)/3+.11*(1-aa.v));
      builder.triangle(aa.p,bb.p,cc.p,tint,[aa.u,aa.v,bb.u,bb.v,cc.u,cc.v],true);
      smooth.push(aa.n,bb.n,cc.n);
    };
    for(let i=0;i<stations.length-1;i++)for(let j=0;j<lanes.length-1;j++){
      const aa=grid[i][j],bb=grid[i][j+1],cc=grid[i+1][j],dd=grid[i+1][j+1];
      triangle(aa,bb,cc);if(i<stations.length-2)triangle(bb,dd,cc);
    }
  }
  const geometry=builder.finish(),normal=geometry.getAttribute('normal'),start=normal.count-smooth.length;
  for(let i=0;i<smooth.length;i++){const n=smooth[i];normal.setXYZ(start+i,n.x,n.y,n.z);}
  geometry.setAttribute('bananaTissue',geometry.getAttribute('leafSurface'));return geometry;
}

export function createJungleVineGeometry() {
  const builder = new PlantGeometry();
  const points = Array.from({ length: 7 }, (_, index) => {
    const t = index / 6;
    return new THREE.Vector3(Math.sin(t * 9) * 0.09, -t, Math.sin(t * 6) * 0.07);
  });
  builder.stem(points, 0.024, 0.01, new THREE.Color('#464a2f'), 4);
  for (let leaf = 0; leaf < 8; leaf += 1) {
    const t = 0.1 + leaf * 0.105;
    builder.leaf(new THREE.Vector3(Math.sin(t * 9) * 0.09, -t, Math.sin(t * 6) * 0.07),
      leaf * 2.39996, 0.19, 0.075, -0.01,
      leafColors[leaf % leafColors.length], 0.06);
  }
  const geometry = builder.finish();
  geometry.setAttribute('bananaTissue', new THREE.Uint8BufferAttribute(
    new Uint8Array(geometry.getAttribute('position').count), 1));
  return geometry;
}

// RGBA = lamina wash, branching veins, dry margin, tissue coverage. Generated
// once into a mip chain so the pinholes/secondary veins don't alias in motion.
// This is a single opaque alpha-tested draw, not overlapping transparent strips.
let tissuePlate:THREE.DataTexture|undefined;
function getBladePlate(){
  if(tissuePlate)return tissuePlate;
  const w=192,h=320,data=new Uint8Array(w*h*4),sat=THREE.MathUtils.smoothstep;
  const cuts=[[-1,.31,.69,.008],[-1,.574,.42,.007],[-1,.76,.63,.014],[1,.433,.39,.009],[1,.66,.73,.012],[1,.861,.51,.008]];
  const byte=(v:number)=>Math.round(255*THREE.MathUtils.clamp(v,0,1));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const t=(y+.5)/h,across=2*(x+.5)/w-1,k=Math.abs(across),side=Math.sign(across);
    const bend=.095+.062*t+.019*Math.sin(t*15+side),flow=t-k*bend-side*.011*k;
    const course=flow*28.+.21*Math.sin(flow*33.+side);
    const main=Math.abs((course-Math.floor(course))-.40),
      faint=Math.abs(((course*3.14+Math.sin(k*8.)*.053)%1+1)%1-.49);
    const capillary=1-sat(faint,.04,.16),vein=(1-sat(main,.035,.13))*(1-k*.59);
    const wave=.52+.18*Math.sin(29*t+2*Math.sin(k*4))+.105*Math.cos(33*k-14*t)+.08*Math.sin(9*k+66*t);
    const mottle=.029*Math.sin(97*k+49*t+9*Math.sin(35*t));
    let coverage=1-sat(k,.962+.019*Math.sin(48.*t+side*3.)+.013*Math.sin(99*t),.995);
    let bruise=.24*sat(k,.76,.97)*(.5+.5*Math.sin(47.*t+3*k));
    for(const [bank,at,reach,gap] of cuts)if(bank===side&&k>reach){
      const progress=(k-reach)/(1-reach),dist=Math.abs(t-at-progress*(.051+.032*at)-.002*Math.sin(k*27+at*23));
      const tear=gap*progress*(.66+.34*Math.sin(21.*k));
      coverage=Math.min(coverage,sat(dist,tear,tear+.0025));
      bruise+=.55*(1-sat(dist,tear+.002,tear+.012))*progress;
    }
    const i=4*(y*w+x);
    data[i]=byte(wave+mottle-.19*vein-.057*capillary);data[i+1]=byte(.71*vein+.29*capillary);
    data[i+2]=byte(bruise+.27*sat(t,.82,1)*sat(k,.41,.96));data[i+3]=byte(coverage);
  }
  const texture=new THREE.DataTexture(data,w,h);texture.name='banana-lamina-and-frayed-edge';
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;return tissuePlate=texture;
}
/** The shared vine/banana batch material. Vines and the stem remain opaque.
 * The blade has filtered tissue, restrained backscatter and localized tears. */
export function createJungleUnderstoryMaterial(time: { value: number }) {
  const material=createJungleFoliageMaterial(time,.035),wind=material.onBeforeCompile,plate=getBladePlate();
  material.onBeforeCompile=(shader,renderer)=>{
    wind(shader,renderer);shader.uniforms.bananaBladePlate={value:plate};
    shader.vertexShader='attribute float bananaTissue; varying float vBananaTissue;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\n vBananaTissue = bananaTissue;');
    shader.fragmentShader='uniform sampler2D bananaBladePlate;varying float vBananaTissue;\n'+shader.fragmentShader
      .replace('#include <alphatest_fragment>',`if(vBananaTissue>.5){
        vec2 uv=vJungleUV;float side=(uv.x-.5)*2.,span=abs(side),along=uv.y,course=along*28.-span*3.;
        vec4 tissue=texture2D(bananaBladePlate,uv);
        if(tissue.a<.48)discard;
        float details=1.-smoothstep(.28,1.2,fwidth(course));
        float central=1.-smoothstep(.012,.035+fwidth(span),span);
        float wash=.19+.48*tissue.r+.12*side+.09*along;
        vec3 blade = mix(vec3(.027,.087,.050),vec3(.139,.218,.086),wash);
        blade*=.89+.20*tissue.r+.09*tissue.g*details;
        blade=mix(blade,vec3(.160,.118,.046),tissue.b*.77);
        blade=mix(blade,vec3(.169,.204,.085),central*(.68-.39*along));
        if(!gl_FrontFacing)blade=mix(blade,vec3(.095,.162,.107),.23);
        diffuseColor.rgb=mix(diffuseColor.rgb,blade,.82);
      }
      #include <alphatest_fragment>`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.88,vBananaTissue);`);
  };
  material.customProgramCacheKey=()=>'jungle-botanical-blade-v2';return material;
}

/** One uniform animates thousands of leaves; instance matrices remain static. */
export function createJungleFoliageMaterial(time: { value: number }, windStrength = 0.08) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.98, metalness: 0,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.jungleTime = time;
    shader.vertexShader = `uniform float jungleTime;\nvarying vec2 vJungleUV;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vJungleUV = uv;
       vec3 jungleAnchor = vec3(0.0);
       #ifdef USE_INSTANCING
         jungleAnchor = instanceMatrix[3].xyz;
       #endif
       float junglePhase = jungleTime * 0.72 + jungleAnchor.x * 0.27 + jungleAnchor.z * 0.19;
       float jungleFlutter = sin(junglePhase + position.x * 1.7) * cos(junglePhase * 0.43 + position.z);
       transformed.x += jungleFlutter * ${windStrength.toFixed(3)};
       transformed.z += sin(junglePhase * 0.67 + position.x) * ${(windStrength * 0.55).toFixed(3)};`,
    );
    if (!material.map) shader.fragmentShader = `varying vec2 vJungleUV;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>', `#include <color_fragment>
       float jungleMidrib = 1.0 - smoothstep(0.025, 0.12, abs(vJungleUV.x - 0.5));
       float jungleBrush = smoothstep(0.23, 0.88, sin(vJungleUV.y * 24.0 + abs(vJungleUV.x - 0.5) * 15.0));
       diffuseColor.rgb *= 0.82 + vJungleUV.y * 0.15 + jungleMidrib * 0.14 + jungleBrush * 0.12;`,
    );
  };
  material.customProgramCacheKey = () => `jungle-foliage-painted-v1-${windStrength}`;
  return material;
}
