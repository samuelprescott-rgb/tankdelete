import { reflectWeapons } from './weaponWater';
import { pillarUniforms, pillarWaterGLSL, readPillars } from './summoningLight';
import {paddyGustGLSL} from './paddyGust';
import type {CrossingWeather} from './crossingWeather';
import * as THREE from 'three';
import {trestleMirrorGLSL,type TrestleReflection} from './trestleReflection';
import { surfaceCipherAtlas, cipherGLSL, WATER_CELLS_PER_METRE } from './surfaceCipher';
import { crossingSunFunction, daySunAxisGLSL, gradeDawnGLSL } from './crossingSun';
import {BANK_MAP_FRAME} from './scouredBank';
import {riverSunGlintsGLSL} from './riverSunGlints';

const bankMapGLSL=`
uniform sampler2D bankRelief;
uniform vec4 bankMapFrame;
vec2 bankUV(vec2 p){return (p-bankMapFrame.xy)*bankMapFrame.zw;}
`;

/** One continuous cross-section around each field, rather than separate rocks. */
export function createPaddyBankGeometry(outline: Array<[number, number]>, level: number, seed: number) {
  const curve = new THREE.CatmullRomCurve3(outline.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const sections = 112;
  const crossSection = [-1, -0.7, -0.42, 0.33, 0.68, 1];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const mud = new THREE.Color('#73664d');
  const moss = new THREE.Color('#4b6247');
  const edge = new THREE.Color('#465348');
  for (let segment = 0; segment <= sections; segment++) {
    const t = segment === sections ? 0 : segment / sections;
    const phase = t * Math.PI * 2;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    // Long damp breaks in the crest group the field into masses rather
    // than running an uninterrupted pale pipe around every paddy.
    const shelf = THREE.MathUtils.smoothstep(Math.sin(phase * 3 + seed) + .44*Math.sin(phase*5-seed), -.55,.82);
    const channel = THREE.MathUtils.smoothstep(Math.sin(phase*4+seed*.53)+.46*Math.sin(phase*9-seed*.78),.18,.92);
    const width = .095 + .22*shelf + .14*channel + Math.sin(phase * 7 + seed) * .035;
    const height = (.020 + .026*shelf + Math.sin(phase * 13) * .007)*(1.-channel) - .026*channel;
    crossSection.forEach((across, section) => {
      const crown = [0, 0.5, 1, 0.96, 0.46, 0][section];
      const lip=across*width*(across>0 ? 1.15+.67*channel : .84+.42*shelf);
      positions.push(point.x + normal.x * lip,
        level - 0.012 + height * crown, point.z + normal.z * lip);
      const color = edge.clone().lerp(mud, crown * (.33+.67*shelf)).lerp(moss,
        (.26+.28*Math.sin(phase*3+seed+.6)) * (.3+.7*crown));
      color.lerp(edge,.70*channel).multiplyScalar(0.96 + Math.sin((segment % sections) * 2.17 + section) * 0.04);
      colors.push(color.r, color.g, color.b);
      if (segment < sections && section < crossSection.length - 1) {
        const a = segment * crossSection.length + section;
        const b = a + crossSection.length;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let section = 0; section < crossSection.length; section++) {
    const end = sections * crossSection.length + section;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, section)
      .add(new THREE.Vector3().fromBufferAttribute(normals, end)).normalize();
    normals.setXYZ(section, normal.x, normal.y, normal.z);
    normals.setXYZ(end, normal.x, normal.y, normal.z);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** Interior vertices carry shallow-to-deep shoreline response. Subdivision is
 * static and bounded; no scene-depth readback or per-field reflection pass. */
export function createPaddyWaterGeometry(outline: Array<[number, number]>) {
  const curve = new THREE.CatmullRomCurve3(outline.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const contour = curve.getSpacedPoints(112).slice(0, -1).map(point => new THREE.Vector2(point.x, -point.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions: number[] = [], depths: number[] = [], uvs: number[] = [];
  const edgeDistance = (x: number, y: number) => {
    let distance = Infinity;
    for (let index = 0; index < contour.length; index++) {
      const a = contour[index], b = contour[(index + 1) % contour.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
      distance = Math.min(distance, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
    }
    return THREE.MathUtils.smoothstep(distance, 0, 0.72);
  };
  const push = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, i: number, j: number) => {
    const x = a.x + (b.x - a.x) * i / 4 + (c.x - a.x) * j / 4;
    const y = a.y + (b.y - a.y) * i / 4 + (c.y - a.y) * j / 4;
    positions.push(x, y, 0); depths.push(edgeDistance(x, y)); uvs.push(x * 0.2, y * 0.2);
  };
  for (const [aIndex, bIndex, cIndex] of triangles) {
    const a = contour[aIndex], b = contour[bIndex], c = contour[cIndex];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4 - i; j++) {
      push(a, b, c, i, j); push(a, b, c, i + 1, j); push(a, b, c, i, j + 1);
      if (i + j < 3) {
        push(a, b, c, i + 1, j); push(a, b, c, i + 1, j + 1); push(a, b, c, i, j + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('wetlandDepth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Six roof-folded leaves per tuft, rooted in separate narrow bases. Draw the
 * curved leaf itself rather than subpixel stem lines and floating grain tips. */
export function createRiceShootGeometry() {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const base = new THREE.Color('#444b38');
  const pigments = ['#7e8059','#8d875c','#697658','#88855c','#677351','#737b59'].map(hex => new THREE.Color(hex));
  const paint = new THREE.Color();
  const heights = [0.89, 0.80, 0.77, 0.69, 0.61, 0.54];
  const reaches = [0.22, 0.32, 0.28, 0.42, 0.35, 0.40];
  const angles = [-0.18,0.48,2.84,-1.06,2.33,1.11];
  const stations = [0.16, 0.46, 0.77];
  for (let leaf = 0; leaf < heights.length; leaf++) {
    const angle = angles[leaf];
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const radius = 0.037 + (leaf % 3) * 0.012;
    const arch = leaf >= 3;
    const first = positions.length / 3;
    const push = (along: number, across: number, y: number, tone: number, value: number) => {
      positions.push(dx * along - dz * across, y, dz * along + dx * across);
      paint.copy(base).lerp(pigments[leaf], tone).multiplyScalar(value);
      colors.push(paint.r, paint.g, paint.b);
    };
    const yAt = (t: number) => heights[leaf] * (arch ? 2.57 * t - 1.91 * t * t : 1.60 * t - 0.60 * t * t);
    const alongAt = (t: number) => radius + reaches[leaf] * Math.pow(t, arch ? 1.65 : 2.25);
    push(radius, 0, 0, 0, 1);
    for (let row = 0; row < stations.length; row++) {
      const t = stations[row], along = alongAt(t), y = yAt(t);
      // A generous midblade retains coverage in motion while the waterline
      // stays slender. The asymmetric fold supplies two quiet painted planes.
      const width = [0.0075, 0.035, 0.023][row] * (0.88 + (leaf % 3) * 0.10);
      const tone = Math.min(1, t * 1.38);
      push(along, -width, y, tone, 0.89);
      push(along + width * 0.49, width * 0.10, y, tone, 1.02);
      push(along, width, y, tone, 0.96);
    }
    push(alongAt(1), 0, yAt(1), 0.93, 0.97);
    const a = first + 1;
    indices.push(first, a + 1, a, first, a + 2, a + 1);
    for (let row = 0; row < stations.length - 1; row++) {
      for (let side = 0; side < 2; side++) {
        const l = a + row * 3 + side, h = l + 3;
        indices.push(l, l + 1, h + 1, l, h + 1, h);
      }
    }
    const b = a + (stations.length - 1) * 3, tip = b + 3;
    indices.push(b, b + 1, tip, b + 1, b + 2, tip);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** The side contours of these narrow leaves carry the silhouette. Keep every
 * contour station and its original baked fold normal. One raised midrib at the
 * widest station describes the cross-section, without a strip of tiny facets
 * tapering into each tip. No distance switch, density cut, or alpha texture. */
export function createFieldRiceGeometry() {
  const source = createRiceShootGeometry();
  const result = new THREE.BufferGeometry();
  const picked = [0, 1, 3, 4, 5, 6, 7, 9, 10];
  const topology = [0,2,1, 1,2,4, 1,4,3, 2,5,4, 3,4,6, 4,7,6, 4,5,7, 6,7,8];
  for (const key of ['position', 'normal', 'color']) {
    const attribute = source.getAttribute(key), values: number[] = [];
    for (let leaf = 0; leaf < 6; leaf++) for (const local of picked) {
      const i = leaf * 11 + local;
      values.push(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
    }
    result.setAttribute(key, new THREE.Float32BufferAttribute(values, 3));
  }
  result.setIndex(Array.from({length:6}, (_,leaf) => topology.map(i => leaf * picked.length + i)).flat());
  result.computeBoundingBox(); result.computeBoundingSphere();
  source.dispose();
  return result;
}

/** Rooted sway on the same opaque draw; no UV strokes or alpha cutouts. */
export function createRiceShootMaterial(time: { value: number }) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.98, metalness: 0,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.riceTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      uniform float riceTime;
      ${paddyGustGLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          mat4 stand=modelMatrix*instanceMatrix;
          vec2 wind=paddyWindCoords(stand[3].xz);
          float tick=floor(riceTime*12.)/12.;
          float gust=paddyGust(wind,tick);
          float riceFlex = min(position.y * position.y, 1.0);
          // Project the world wind onto each yawed tuft. Cut stubble bends
          // proportionally to its own height, even on the shortest stands.
          vec2 localWind=vec2(dot(paddyWind,stand[0].xz)/dot(stand[0].xz,stand[0].xz),
                              dot(paddyWind,stand[2].xz)/dot(stand[2].xz,stand[2].xz));
          float bend=.018*sin(wind.x+tick*1.3)+gust*(.30+.035*sin(wind.y*2.-tick*3.));
          transformed.xz += localWind * length(stand[1].xyz) * bend * riceFlex;
          transformed.y -= gust*.048*riceFlex;
          #ifdef USE_COLOR
            vColor.rgb *= vec3(1.)+vec3(.30,.23,.10)*gust*riceFlex;
          #endif
        #endif`);
  };
  material.customProgramCacheKey = () => 'wetland-gust-rice-v2';
  return material;
}

interface RiceCoverFootprint {
  position: readonly [number, number, number];
  rotation: number;
  width: number;
}

/** Short rice under the sandbags opens the infantry silhouette. Return to
 * full height gradually outside the U-shaped position, including its rear. */
export function createRiceCoverHeightProfile(cover: readonly RiceCoverFootprint[], offsetZ: number) {
  const footprints = cover.map(({ position: [x, , z], rotation, width }) => ({
    x, z: z + offsetZ, halfWidth: width * 0.5,
    cosine: Math.cos(rotation), sine: Math.sin(rotation),
  }));
  const vergeWidth = 0.90;
  return (x: number, z: number) => {
    let heightScale = 1;
    for (const footprint of footprints) {
      const xOffset = x - footprint.x, zOffset = z - footprint.z;
      const localX = footprint.cosine * xOffset - footprint.sine * zOffset;
      const localZ = footprint.sine * xOffset + footprint.cosine * zOffset;
      const across = Math.max(0, Math.abs(localX) - footprint.halfWidth);
      const along = Math.max(0, -1.42 - localZ, localZ - 0.30);
      const distanceSq = across * across + along * along;
      if (distanceSq >= vergeWidth * vergeWidth) continue;
      const t = Math.sqrt(distanceSq) / vergeWidth;
      heightScale = Math.min(heightScale, 0.28 + 0.72 * t * t * (3 - 2 * t));
    }
    return heightScale;
  };
}

export function createWetlandWaterMaterial(time: { value: number }, river = false,
  crossing?: { map?: THREE.DataTexture; bounds: THREE.Vector4; sunlit?:boolean; weather?:CrossingWeather|null; dayPaint?:THREE.Texture; bridge?:TrestleReflection; contact?:THREE.DataTexture; canopy?:THREE.DataTexture }) {
  const material = new THREE.MeshPhysicalMaterial({
    color: river ? '#416b6b' : '#425e56', roughness: river ? .32 : .46, metalness: 0, ior: 1.333,
    transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide,
    // These are open water sheets, not closed volumes. Submit both windings
    // together; there is no rear layer to composite before the front one.
    forceSinglePass: true,
  });
  const pillarLight = {...pillarUniforms(), uPillarAtlas: {value: null as THREE.Texture | null}};
  material.onBeforeRender = (_renderer, scene) => {
    pillarLight.uPillarAtlas.value = readPillars(scene, pillarLight);
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, pillarLight);
    shader.uniforms.wetlandTime = time;
    shader.uniforms.surfaceCipherMap={value:surfaceCipherAtlas()};
    if (crossing) {
      shader.uniforms.crossingInkBounds = { value: crossing.bounds };
      if(crossing.contact)Object.assign(shader.uniforms,{bankRelief:{value:crossing.contact},bankMapFrame:{value:BANK_MAP_FRAME}});
      if(crossing.canopy)shader.uniforms.bankCanopy={value:crossing.canopy};
      if(crossing.bridge){
        const m=crossing.bridge;
        Object.assign(shader.uniforms,{mirrorFrame:{value:m.frame},mirrorDeck:{value:m.deck},mirrorStations:{value:m.stations},
          mirrorPile:{value:m.pile},mirrorPost:{value:m.post},mirrorHead:{value:m.head},mirrorDeckThickness:{value:m.thickness}});
      }
      if(crossing.weather)Object.assign(shader.uniforms,crossing.weather);
      if(crossing.dayPaint) shader.uniforms.riverDawnPaint={value:crossing.dayPaint};
    }
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nattribute float wetlandDepth;\nvarying float vWetlandDepth;\nvarying vec3 vWetlandWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWetlandDepth = wetlandDepth;\nvWetlandWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      `#include <common>
      uniform float wetlandTime;
      ${river ? '' : paddyGustGLSL}
      ${crossing ? 'uniform vec4 crossingInkBounds;'+crossingSunFunction : ''}
      ${crossing?.dayPaint ? 'uniform sampler2D riverDawnPaint;'+gradeDawnGLSL : ''}
      ${crossing?.bridge ? trestleMirrorGLSL : ''}
      ${crossing?.contact ? bankMapGLSL : ''}
      ${crossing?.canopy ? 'uniform sampler2D bankCanopy;' : ''}
      varying float vWetlandDepth;
      varying vec3 vWetlandWorld;
      ${cipherGLSL}
      float wetlandHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      // Analytic gradient of smooth value noise. Independent x/z slopes avoid
      // the coherent stripe reflections produced by whole-field sine waves.
      vec2 wetlandSlope(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        vec2 du = 6.0 * f * (1.0 - f);
        float a = wetlandHash(cell);
        float b = wetlandHash(cell + vec2(1.0, 0.0));
        float c = wetlandHash(cell + vec2(0.0, 1.0));
        float d = wetlandHash(cell + vec2(1.0, 1.0));
        return du * vec2(mix(b - a, d - c, u.y), mix(c - a, d - b, u.x));
      }
      ${crossing?.dayPaint && crossing.sunlit ? riverSunGlintsGLSL : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 ripplePoint = vWetlandWorld.xz;
        vec2 broad = wetlandSlope(ripplePoint * 1.65 + vec2(wetlandTime * 0.10, -wetlandTime * 0.08));
        vec2 fine = wetlandSlope(ripplePoint * 5.6 + vec2(-wetlandTime * 0.22, wetlandTime * 0.14));
        float fineVisibility = 1.0 - smoothstep(0.08, 0.4, length(fwidth(ripplePoint * 5.6)));
        vec2 slope = broad * 0.021 + fine * (0.006 * fineVisibility);
        vec3 wetlandNormal = normalize(vec3(slope.x, 1.0, slope.y));
        normal = normalize(mat3(viewMatrix) * wetlandNormal);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 waterPoint = vWetlandWorld.xz;
        float silt = smoothstep(-0.52, 0.66, sin(waterPoint.x * 0.67 + sin(waterPoint.y * 0.83)));
        vec3 shallows = vec3(1.19, 1.08, 0.85);
        diffuseColor.rgb *= mix(shallows, vec3(0.84, 1.00, 1.09), vWetlandDepth) * (0.94 + silt * 0.12);
        // Short, broken brush glints flow across the muted water planes.
        float meander = sin(waterPoint.x * 1.12 + waterPoint.y * 0.63) * 1.46
          + cos(waterPoint.x * 3.2 - waterPoint.y * 1.1) * 0.48;
        float crest = waterPoint.y * 7.2 + waterPoint.x * 0.75 + meander;
        float dab = smoothstep(0.83, 1.0, sin(crest + wetlandTime * 0.28));
        float gap = smoothstep(0.18, 0.86, sin(waterPoint.x * 2.41 + waterPoint.y * 1.17 + meander));
        float visibleDab = 1.0 - smoothstep(0.38, 1.25, fwidth(crest));
        ${crossing?.sunlit ? '' : 'diffuseColor.rgb += vec3(0.027, 0.046, 0.052) * dab * gap * visibleDab;'}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // This surface borrows the shared storm sky, including its night fade.
        // Compensate alpha-blended specular loss locally; scene.environment
        // overrides material.envMapIntensity, so changing that value is inert.
        reflectedLight.directDiffuse *= 0.42;
        reflectedLight.indirectDiffuse *= 0.53;
        ${river ? `vec3 skyKey=reflectedLight.indirectSpecular+reflectedLight.directSpecular;
        float specPeak=max(skyKey.r,max(skyKey.g,skyKey.b));
        float wetShoulder=1./(1.+specPeak*3.4);
        reflectedLight.indirectSpecular*=1.2*wetShoulder;
        reflectedLight.directSpecular*=wetShoulder;` : `
        // These are muddy, planted puddles: keep glints under the contrast of
        // the route and tank. A color-preserving shoulder tames a grazing key
        // without dimming the moonlit diffuse, rice itself, or river lettering.
        vec3 paddySpec = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
        float paddyGlint = max(max(paddySpec.r, paddySpec.g), paddySpec.b);
        float paddyShoulder = 1.0 / (1.0 + paddyGlint * 4.0);
        reflectedLight.directSpecular *= paddyShoulder;
        reflectedLight.indirectSpecular *= paddyShoulder;`}`)
      .replace('#include <opaque_fragment>', `
        float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float fresnel = 0.025 + 0.975 * pow(1.0 - facing, 5.0);
        diffuseColor.a = mix(0.28, 0.62, vWetlandDepth) + fresnel * 0.28;
        // Dense glyphs follow ripples. They disappear into the wet material
        // at driving distance rather than turning into floating luminous type.
        vec2 p=vWetlandWorld.xz;
        vec2 typeUV=p*vec2(${WATER_CELLS_PER_METRE[0]}.,${WATER_CELLS_PER_METRE[1]}.);
        // The 64-cell type plate formerly registered every 1.45 x 2 metres.
        // Bend its courses, then its cross-courses. Each smooth shear has
        // unit determinant: the local glyph density stays exactly the same
        // and no cell flips or splits. Only a sub-cell ripple moves in time.
        typeUV.x+=21.2*sin(typeUV.y*.0227+1.18)+.38*sin(p.y*3.3+wetlandTime*.51);
        typeUV.y+=16.8*sin(typeUV.x*.0263-.71)+.51*sin(typeUV.x*(4.7/44.)+wetlandTime*.48);
        vec2 glyph=cipherField(typeUV);
        // Reuse the actual bed/riffle signals rather than tiling another
        // square mask. Long eddies can run through multiple atlas patches.
        float inkReach=smoothstep(.14,.87,.45+.18*meander+.27*silt-.19*gap);
        glyph*=.18+.82*inkReach;
        float depth=clamp(vWetlandDepth,0.,1.);
        float crowns=.5+.5*sin(p.y*.78+.75*sin(p.y*1.7));
        float canopy=1.-smoothstep(.22+.15*crowns,.46+.19*crowns,depth);
        float reflected=clamp(dot(outgoingLight,vec3(.21,.72,.07)),0.,1.);
        vec3 shade=mix(vec3(.039,.102,.135),vec3(.012,.045,.061),canopy);
        // Keep the color of reflected sky; preserve dark banks around the bright lane.
        outgoingLight=mix(outgoingLight,shade*(.77+.68*reflected),.64+.12*canopy);
        diffuseColor.a=max(diffuseColor.a,mix(.58,.74,canopy));
        ${crossing?.dayPaint && crossing.sunlit?`
        // Same sky painting and angular registration as the dome, reflected
        // about the animated surface normal. No grid of world-space glitter.
        vec3 toWater=normalize(vWetlandWorld-cameraPosition);
        vec2 riffle=wetlandSlope(vec2(p.x*4.6+p.y*9.2,p.x*1.23-p.y*.95)+vec2(-wetlandTime*.63,0.));
        float localRiffle=1.-smoothstep(.18,.94,length(fwidth(vec2(p.x*4.6+p.y*9.2,p.x*1.23-p.y*.95))));
        vec2 mirrorSlope=slope*1.41+riffle*vec2(.024,.039)*localRiffle;
        vec3 reflectedRay=reflect(toWater,normalize(vec3(mirrorSlope.x,1.,mirrorSlope.y)));
        float bearing=atan(reflectedRay.z,reflectedRay.x)/6.2831853+.5;
        float alt=asin(clamp(reflectedRay.y,-1.,1.));
        vec3 cloud=texture2D(riverDawnPaint,signalDawnUv(bearing,alt)).rgb;
        cloud=signalGradeDawn(cloud,reflectedRay);
        // A higher bank blocks more sky at the edge than at midstream.
        // An uneven silhouette breaks the bank's reflection, not the whole sheet.
        float waved=p.y*.86+p.x*.17+reflectedRay.z*2.7;
        float branches=.47*sin(waved)+.27*sin(waved*2.57+.7)+.15*cos(waved*6.31);
        float bankHeight=mix(.48,.025,smoothstep(.04,.82,depth))+.067*branches;
        float openSky=smoothstep(bankHeight-.11,bankHeight+.105,reflectedRay.y);
        vec3 bankInk=vec3(.022,.046,.045)+vec3(.006,.010,.009)*branches;
        ${crossing.canopy?`
        vec3 crownField=texture2D(bankCanopy,vec2(bearing,(p.y-2.)/22.)).rgb;
        float crownTop=1.-smoothstep(crownField.r-.024,crownField.r+.017,reflectedRay.y);
        float crownBase=smoothstep(crownField.g-.07,crownField.g+.013,reflectedRay.y);
        // Clearings between these real crowns retain the open silver sky.
        openSky*=1.-crownField.b*crownTop*(.43+.53*crownBase);
        `:''}
        float skyY=dot(cloud,vec3(.21,.72,.07));
        // Unbroken water keeps the blue-grey cloud body but does not mirror
        // a whole white opening. Warm energy belongs on its few tilted lips.
        float shoulder=1./(1.+1.45*skyY);
        vec3 quietSky=vec3(.011,.021,.028)+shoulder*(vec3(skyY)*vec3(.115,.180,.222)+cloud*vec3(.057,.047,.046));
        vec3 reflectedPaint=mix(bankInk,quietSky,openSky);
        float reflectedOpening=openSky;
        // Reflect the seeded crossing footprint without submitting the world again.
        ${crossing.bridge?`
        vec2 trestle=traceTrestle(vWetlandWorld,reflectedRay);
        reflectedPaint=mix(reflectedPaint,vec3(.045,.041,.031),trestle.x*.79);
        reflectedPaint=mix(reflectedPaint,vec3(.026,.029,.023),trestle.y*.90);
        reflectedOpening*=1.-max(trestle.x,trestle.y);`:''}
        ${crossing.contact?`
        // A ray travels along the moving water normal into a small elevation
        // map rasterized from the visible stones and roots, in metres.
        vec2 surfUV=bankUV(p);
        vec4 shoreContact=vec4(0.);
        if(all(greaterThan(surfUV,vec2(0.)))&&all(lessThan(surfUV,vec2(1.)))){
          shoreContact=texture2D(bankRelief,surfUV);
          float blocked=0.,rockTone=0.;
          for(int i=0;i<7;i++){
            float stepI=float(i)+1.;float t=.082*stepI+.045*stepI*stepI;
            vec2 h=texture2D(bankRelief,bankUV(p+t*reflectedRay.xz)).rg;
            float hit=smoothstep(.006,.083,h.r*1.4-max(.0,reflectedRay.y*t));
            rockTone+=h.g*hit*(1.-blocked);blocked+=hit*(1.-blocked);
          }
          vec3 rockMirror=mix(vec3(.020,.027,.030),vec3(.113,.100,.080),rockTone);
          reflectedPaint=mix(reflectedPaint,rockMirror,blocked*.94);
          reflectedOpening*=1.-blocked;
        }`:''}
        // Divide the river into visible sky, near bank wood/rock, canopy and
        // bridge masses before adding any glint. No unmasked copper paint.
        float mirror=.67+.22*pow(1.-facing,1.5);
        outgoingLight=mix(outgoingLight*.72+vec3(.009,.025,.029),reflectedPaint,mirror);
        vec2 solarAxis=${daySunAxisGLSL};
        float solarBearing=dot(normalize(reflectedRay.xz+vec2(.00001)),solarAxis);
        float sunOpen=riverSunOpening(solarBearing,reflectedRay.y,reflectedOpening);
        // The long axis of every short wavelet is across the solar ray.
        // Filter in wave-depth metres BEFORE any row-address discontinuity.
        float across=dot(p,vec2(-solarAxis.y,solarAxis.x)),toward=dot(p,solarAxis);
        float pixel=max(fwidth(toward),.28*fwidth(across));
        float warmFacet=riverCrestInk(across,toward,wetlandTime,pixel)*sunOpen;
        outgoingLight+=warmFacet*vec3(.72,.394,.154);
        ${crossing.contact?`
        // Retain R21's low-amplitude nearshore froth, driven by the actual
        // contact atlas, regardless of whether it can see the sunrise.
        vec2 brush=vec2(dot(p,vec2(-.61,.79))*4.8,dot(p,vec2(.79,.61))*18.8+wetlandTime*.39);
        brush.x+=wetlandHash(vec2(floor(brush.y),7.17))*2.3;
        vec2 cell=floor(brush),offset=fract(brush)-.5;
        float reservoir=wetlandHash(cell),cut=wetlandHash(cell+vec2(11.,5.));
        float edge=dot(offset*vec2(2.6+cut*1.7,4.3),offset*vec2(2.6+cut*1.7,4.3));
        float wax=(1.-smoothstep(.43,1.,edge))*smoothstep(.40,.82,reservoir)*(1.-smoothstep(.32,1.48,fwidth(brush.y)));
        float froth=shoreContact.b*(.25+.49*wax+.20*smoothstep(-.08,.09,mirrorSlope.y));
        outgoingLight*=1.-.27*shoreContact.a;
        outgoingLight=mix(outgoingLight,vec3(.26,.30,.29),froth*.57);
        `:''}
        diffuseColor.a=max(diffuseColor.a,.80+.12*(1.-facing));`:''}
        // Silver only survives on the facing side of a moving ripple. The
        // quiet trough optically swallows code, rather than showing an ink band.
        float rippleReveal=.27+.73*smoothstep(-.65,.82,sin(crest+wetlandTime*.28)*.76+.32*gap);
        vec3 pewter=outgoingLight*vec3(.56,.53,.44)+vec3(.035,.044,.048);
        outgoingLight=outgoingLight*(1.-.12*glyph.g*rippleReveal)+glyph.r*pewter*rippleReveal*(1.27-.29*canopy);
        ${river ? '' : `
        float gustTick=floor(wetlandTime*12.)/12.;
        vec2 wind=paddyWindCoords(p);
        float cellWidth=max(fwidth(wind.x),fwidth(wind.y));
        // Small stepped silver-olive strokes. Sample the wind a fraction
        // behind the leaves so each ruffled patch settles after they lift.
        vec2 cell=floor(wind*26.)/26.;
        float gust=paddyGust(cell,gustTick-.24);
        float wave=cell.x*16.-gustTick*5.8+1.55*cos(cell.y*3.7+cell.x*.76);
        float broken=smoothstep(.30,.85,cos(cell.y*6.8+cell.x*1.8-gustTick*.39));
        float stroke=smoothstep(.64,.94,cos(wave))*broken*gust;
        stroke*=1.-smoothstep(.034,.16,cellWidth);
        outgoingLight+=stroke*(outgoingLight*vec3(.24,.30,.27)+vec3(.055,.071,.060));`}
        if (uPillarCount > 0) outgoingLight += pillarReflection(vWetlandWorld, wetlandTime);
        #include <opaque_fragment>`);
    shader.fragmentShader = pillarWaterGLSL + '\n' + shader.fragmentShader;
  };
  material.customProgramCacheKey = () => crossing ? 'wetland-water-ghost-crossing-micro-'+(crossing.sunlit?'v14-flow-sun':'v14-flow-storm')+(crossing.bridge?'-trestle':'')+(crossing.contact?'-relief':'')+(crossing.canopy?'-crowns':'')+(crossing.weather?'-weather':'')
    : river ? 'wetland-water-flow-type-v3' : 'wetland-paddy-flow-glint-v4';
  return reflectWeapons(material,'vWetlandWorld','(.78+.42*depth)');
}

export function createPaddyBedMaterial(detail?: THREE.Texture,contact?:THREE.DataTexture) {
  const material = new THREE.MeshStandardMaterial({ color: '#435649', roughness: 1 });
  material.onBeforeCompile = shader => {
    if (detail) shader.uniforms.paddySiltMap = { value: detail };
    if(contact)Object.assign(shader.uniforms,{bankRelief:{value:contact},bankMapFrame:{value:BANK_MAP_FRAME}});
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSiltWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSiltWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSiltWorld;' + (detail ? '\nuniform sampler2D paddySiltMap;' : '')+(contact?bankMapGLSL:''))
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wash = smoothstep(-0.54, 0.72, sin(vSiltWorld.x * 1.7 + sin(vSiltWorld.z * 1.3) * 1.8));
        float softSilt = smoothstep(-0.3, 0.92, sin(vSiltWorld.z * 3.2 + vSiltWorld.x * 0.7));
        diffuseColor.rgb *= mix(vec3(0.77, 0.83, 0.88), vec3(1.18, 1.1, 0.91), wash) + softSilt * 0.08;
        ${detail ? 'diffuseColor.rgb *= mix(vec3(1.0), clamp((texture2D(paddySiltMap, vSiltWorld.xz * 0.32).rgb-vec3(.135,.088,.055))*4.8+.86,.35,1.55), .75);' : ''}
        ${contact ? 'diffuseColor.rgb*=1.-.45*texture2D(bankRelief,bankUV(vSiltWorld.xz)).a;' : ''}`);
  };
  material.customProgramCacheKey = () => `wetland-silt-painted-v3-${detail ? 'detail' : 'plain'}${contact?'-relief':''}`;
  return material;
}

/** A seated steel drum with real rolled rims and filler caps, shared by the
 * three existing dressing instances. Its bottom is authored at ground zero. */
export function createFieldDrumGeometry() {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const append = (source: THREE.BufferGeometry, tint: THREE.ColorRepresentation) => {
    const geometry = source.index ? source.toNonIndexed() : source;
    const color = new THREE.Color(tint);
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    for (let vertex = 0; vertex < position.count; vertex++) {
      positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
      colors.push(color.r, color.g, color.b);
    }
    if (geometry !== source) geometry.dispose();
    source.dispose();
  };
  const body = new THREE.CylinderGeometry(0.303, 0.301, 0.82, 20, 3);
  body.translate(0, 0.423, 0); append(body, '#ffffff');
  for (const [height, radius] of [[0.016, 0.3], [0.18, 0.305], [0.65, 0.305], [0.831, 0.3]]) {
    const band = new THREE.TorusGeometry(radius, 0.012, 5, 20);
    band.rotateX(Math.PI / 2); band.translate(0, height, 0); append(band, '#a5a699');
  }
  for (const [x, z, radius] of [[-0.125, 0.055, 0.035], [0.15, -0.06, 0.017]]) {
    const filler = new THREE.CylinderGeometry(radius, radius, 0.015, 10);
    filler.translate(x, 0.845, z); append(filler, '#aeb09f');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createFieldDrumMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.87, metalness: 0.12 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDrumLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDrumLocal = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDrumLocal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rustPatch = sin(vDrumLocal.x * 32.0 + sin(vDrumLocal.y * 23.0)) * sin(vDrumLocal.z * 29.0 + vDrumLocal.y * 13.0);
        float grain = fract(sin(dot(floor(vDrumLocal * 260.0), vec3(12.9898,78.233,39.425))) * 43758.5453);
        float rust = smoothstep(0.1, 0.76, rustPatch + grain * 0.28);
        float rain = sin(atan(vDrumLocal.x, vDrumLocal.z) * 31.0 + sin(vDrumLocal.y * 9.0)) * 0.045;
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.87 + grain * 0.17 + rain), vec3(0.16, 0.065, 0.023), rust * 0.74);`);
  };
  material.customProgramCacheKey = () => 'field-drum-rolled-rim-rust-v1';
  return material;
}

/** Fine soil grain stays world-scaled on the narrow raised banks. */
export function createPaddyBankMaterial(detail?: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    if (detail) shader.uniforms.bankDetailMap = { value: detail };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBankWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBankWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBankWorld;' + (detail ? '\nuniform sampler2D bankDetailMap;' : ''))
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wash = sin(vBankWorld.x * 2.8 + sin(vBankWorld.z * 3.5));
        float stroke = smoothstep(-0.48, 0.68, wash);
        diffuseColor.rgb *= mix(vec3(.90,.93,.95), vec3(1.08,1.05,.98), stroke);
        ${detail ? 'diffuseColor.rgb *= mix(vec3(1.0), texture2D(bankDetailMap, vBankWorld.xz * 0.28).rgb * 2.6, 0.17);' : ''}`);
  };
  material.customProgramCacheKey = () => `paddy-bank-painted-v2-${detail ? 'detail' : 'plain'}`;
  return material;
}
