import * as THREE from 'three';

// The eighth frame of the 12 fps Holy Pillar atlas is its first ground contact.
export const PILLAR_FPS = 12;
export const PILLAR_TOUCHDOWN = 8 / PILLAR_FPS;
export const REVEAL_END = PILLAR_TOUCHDOWN + .46;
export const PILLAR_COUNT = 3;

export interface PillarSource {
  position: THREE.Vector3;
  age: number;
  atlas: THREE.Texture;
}

const sources = new WeakMap<THREE.Scene, Set<PillarSource>>();
export function scenePillars(scene: THREE.Scene) {
  let pillars = sources.get(scene);
  if (!pillars) {
    pillars = new Set();
    sources.set(scene, pillars);
  }
  return pillars;
}

export function pillarUniforms() {
  return {
    uPillarCount: {value: 0},
    uPillars: {value: new Float32Array(4 * PILLAR_COUNT)},
  };
}

export function readPillars(scene: THREE.Scene, uniforms: ReturnType<typeof pillarUniforms>) {
  let count = 0;
  let atlas: THREE.Texture | null = null;
  for (const pillar of scenePillars(scene)) {
    if (pillar.age < 0 || count === PILLAR_COUNT) continue;
    const offset = count++ * 4;
    pillar.position.toArray(uniforms.uPillars.value, offset);
    uniforms.uPillars.value[offset + 3] = pillar.age;
    atlas = pillar.atlas;
  }
  uniforms.uPillarCount.value = count;
  return atlas;
}

export const pillarGLSL = `
  uniform int uPillarCount;
  uniform vec4 uPillars[${PILLAR_COUNT}];
  float pillarSpill(float age) {
    return smoothstep(.35, .70, age) * (1. - smoothstep(2.05, 2.85, age));
  }
`;

// Reflect the same atlas frame as the upright sprite. Intersect the water ray
// with its camera-facing plane, then break its reflection across ripple crests.
export const pillarWaterGLSL = `
  ${pillarGLSL}
  uniform sampler2D uPillarAtlas;
  vec3 pillarReflection(vec3 point, float time) {
    vec3 ink = vec3(0.);
    vec3 ray = point - cameraPosition;
    ray.y = -ray.y;
    if (ray.y <= .001) return ink;
    for (int i = 0; i < ${PILLAR_COUNT}; ++i) {
      if (i >= uPillarCount) break;
      vec4 source = uPillars[i];
      vec3 forward = normalize(vec3(cameraPosition.x-source.x, 0., cameraPosition.z-source.z));
      float denom = dot(ray, forward);
      if (denom >= -.001) continue;
      float t = dot(source.xyz-point, forward) / denom;
      if (t < 0.) continue;
      vec3 hit = point + ray*t - source.xyz;
      float x = dot(hit, vec3(forward.z,0.,-forward.x));
      if (abs(x)>4.4 || hit.y>6.6) continue;
      vec2 cell = floor(point.xz*22.)/22.;
      float wave = sin(dot(cell,vec2(4.6,18.)) + 1.3*sin(cell.x*6.) + time*3.8);
      float crest = .3+.7*smoothstep(-.4,.85,wave);
      float height = max(0.,hit.y);
      vec2 uv = vec2(.5 + (x+.22*wave)/5.76, 28./232.+(hit.y-.12+.09*wave)/6.96);
      vec3 image = vec3(0.);
      if (all(greaterThan(uv,vec2(0.))) && all(lessThan(uv,vec2(1.)))) {
        float frame = floor(source.w*${PILLAR_FPS}.);
        vec2 tile = vec2(mod(frame,8.),5.-floor(frame/8.));
        vec4 texel = texture2D(uPillarAtlas,(tile+uv)/vec2(8.,6.));
        image = texel.rgb * texel.a;
      }
      float spread = .72 + height*.31;
      float across = (x+.28*wave)/spread;
      float sheen = exp2(-2.*across*across)
        * (1.-smoothstep(4.6,6.6,height)) * pillarSpill(source.w);
      ink += crest*(3.1*image + vec3(.92,.57,.17)*sheen);
    }
    return ink;
  }`;
