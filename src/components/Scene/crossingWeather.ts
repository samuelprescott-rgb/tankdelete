import {createContext, useContext} from 'react';
import * as T from 'three';
import {DAY_SUN_RAY} from './crossingSun';

export type CrossingWeather = {deck: {value: T.Texture}; weatherTime: {value: number}};
export const CrossingWeatherContext = createContext<CrossingWeather | null>(null);
export const useCrossingWeather = () => useContext(CrossingWeatherContext);
const sun = `vec3(${DAY_SUN_RAY.map(x=>x.toFixed(7)).join(',')})`;
const wind = 'vec2(1.65,.49)';

/** Aerial perspective on actual tree surfaces, not a screen veil. All three
 * crown geometries share the same continuous falloff; the embassy keeps its
 * original shader. No new texture, draw call, alpha rule or light. */
export function shadeDistantTree(material:T.MeshStandardMaterial, weather:CrossingWeather|null) {
  if (!weather) return material;
  const compile=material.onBeforeCompile, key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    shader.vertexShader='varying vec2 vTreeAir;\n'+shader.vertexShader.replace('#include <project_vertex>',`
      #include <project_vertex>
      float treeRange=length(mvPosition.xyz);
      float towardSun=dot(mvPosition.xyz,(viewMatrix*vec4(${sun},0.)).xyz)/max(treeRange,.001);
      vTreeAir=vec2(smoothstep(30.,78.,treeRange),smoothstep(.70,.985,towardSun));`);
    shader.fragmentShader='varying vec2 vTreeAir;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
      // Work on the lit colour. A dark bough below the sunrise stays blue-gray;
      // the lit part of the same crown retains a trace of the amber opening.
      // Flatten the light/dark excursion without clipping all tops to one value.
      const vec3 treeLuma=vec3(.2126,.7152,.0722);
      float treeY=max(0.,dot(outgoingLight,treeLuma));
      float narrowY=.041+.155*treeY/(.19+treeY);
      float directShare=dot(reflectedLight.directDiffuse,treeLuma)/max(.009,treeY);
      float sunlit=vTreeAir.y*smoothstep(.25,.76,directShare)*smoothstep(.06,.19,treeY);
      vec3 distantInk=narrowY*mix(vec3(.82,.99,1.13),vec3(1.19,1.00,.81),sunlit);
      outgoingLight=mix(outgoingLight,distantInk,.88*vTreeAir.x);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>key+':river-tree-air-v1';
  return material;
}

export const cloudDeckGLSL = /* glsl */ `
uniform sampler2D deck;
uniform float weatherTime;
// A single horizontal sheet. Sky rays and rays from the flooded plots
// towards the dawn sun hit the same moving ink cells.
vec2 crossingCloud(vec3 origin, vec3 ray) {
  vec2 hit = origin.xz + ray.xz * ((42. - origin.y) / max(.085, ray.y));
  vec2 uv = (hit - ${wind} * weatherTime) / 142. + vec2(.31,.13);
  return texture2D(deck,uv).rg;
}
`;
export const paintedCloudGLSL = cloudDeckGLSL + /* glsl */ `
vec3 crossingCloudPaint(vec3 paint,vec2 paintUv,vec3 eye,vec3 ray) {
  float ridge = texture2D(deck,vec2(paintUv.x,.5)).b;
  float openSky = smoothstep(ridge+.003,ridge+.024,paintUv.y)*smoothstep(.086,.16,ray.y);
  // The bridge looks into an authored break in the cloud bank. Preserve the
  // registered amber plate here, both above the hills and in reflections.
  // The moving weather can cross the flanks and the sky behind the driver.
  float opening = dot(normalize(ray.xz+vec2(.000001)),normalize(${sun}.xz));
  openSky *= 1. - smoothstep(.14,.46,opening);
  if(openSky<=0.) return paint;
  vec2 bank = crossingCloud(eye,ray);
  vec2 crown = crossingCloud(eye-vec3(0.,3.8,0.),ray);
  float glow = smoothstep(.75,.99,dot(ray,${sun}));
  vec3 belly = mix(vec3(.090,.095,.11),vec3(.22,.137,.102),glow);
  vec3 rim = mix(vec3(.40,.409,.40),vec3(.88,.59,.34),glow);
  float top=crown.x*(1.-.64*bank.x);
  float light=(.24*bank.y+.46*crown.y)*top;
  vec3 pigment=mix(belly,rim,light);
  // Keep the old brushwork inside the new cel. The brightest ochre around
  // the sun shines through the thin upper edge instead of going chalk white.
  pigment=mix(pigment,paint*.86,.36);
  return mix(paint,pigment,openSky*max(bank.x,top)*.75);
}
`;

export function shadeFloodedPlot<M extends T.MeshStandardMaterial>(material:M, weather:CrossingWeather|null) {
  if (!weather) return material;
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=(s,r)=>{
    compile.call(material,s,r);
    Object.assign(s.uniforms,weather);
    s.vertexShader='varying vec3 plotPosition;\n'+s.vertexShader.replace('#include <project_vertex>',`
      vec4 plotVertex=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        plotVertex=instanceMatrix*plotVertex;
      #endif
      plotPosition=(modelMatrix*plotVertex).xyz;
      #include <project_vertex>`);
    s.fragmentShader=cloudDeckGLSL+'varying vec3 plotPosition;\n'+s.fragmentShader.replace('#include <opaque_fragment>',`
      float cover=crossingCloud(plotPosition,${sun}).x;
      outgoingLight *= mix(vec3(1.),vec3(.52,.60,.72),cover);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>key+'-cloud-shadow';
  return material;
}

export function bendCrossingTips(material:T.MeshStandardMaterial, weather:CrossingWeather|null, plant:'palm'|'frond') {
  if (!weather) return material;
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  const flex={
    palm:'smoothstep(.54,.78,position.y)*smoothstep(.028,.23,length(position.xz))',
    frond:'.30*smoothstep(.1,2.7,length(position.xz))',
  }[plant];
  material.onBeforeCompile=(s,r)=>{
    compile.call(material,s,r);
    s.uniforms.weatherTime=weather.weatherTime;
    s.vertexShader='uniform float weatherTime;\n'+s.vertexShader.replace('#include <project_vertex>',`
      #ifdef USE_INSTANCING
        mat4 plantWorld=modelMatrix*instanceMatrix;
        vec3 tip=(plantWorld*vec4(position,1.)).xyz;
        vec2 windDir=normalize(${wind});
        float travel=dot(plantWorld[3].xz,windDir);
        float pulse=.5+.5*cos(travel*.14-weatherTime*.94);
        float reach=1.-smoothstep(26.,48.,distance(plantWorld[3].xz,vec2(-1.,9.)));
        float gust=pulse*pulse*pulse*reach;
        vec3 displacement=vec3(windDir.x,-.22,windDir.y)*gust*(${flex})
          *(.50+.11*sin(dot(tip.xz,vec2(.8,.34))-weatherTime*2.4));
        transformed+=vec3(dot(displacement,plantWorld[0].xyz)/dot(plantWorld[0].xyz,plantWorld[0].xyz),
          dot(displacement,plantWorld[1].xyz)/dot(plantWorld[1].xyz,plantWorld[1].xyz),
          dot(displacement,plantWorld[2].xyz)/dot(plantWorld[2].xyz,plantWorld[2].xyz));
      #endif
      #include <project_vertex>`);
  };
  material.customProgramCacheKey=()=>key+'-crossing-gust-'+plant;
  return material;
}
