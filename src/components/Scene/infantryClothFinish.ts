import {LinearFilter, LinearMipmapLinearFilter, NoColorSpace, TextureLoader, type Texture, type MeshStandardMaterial} from 'three';

const fieldPlate={value:null as Texture|null}, plateReady={value:0};
let requested=false;
// Permanent shared asset, like the issued field geometry. An unavailable
// image simply leaves the working vertex paint. No failing render or recompile.
function loadFieldPlate(){
  if(requested || typeof Image==='undefined' || typeof document==='undefined')return;
  requested=true;
  new TextureLoader().load('/images/textures/ghost-field-gear-v1.png',map=>{
    // Relative sRGB swatches are used as pigment multipliers, not emission.
    map.name='ghost-signal-issued-textiles';map.colorSpace=NoColorSpace;
    map.magFilter=LinearFilter;map.minFilter=LinearMipmapLinearFilter;map.anisotropy=2;
    fieldPlate.value=map;plateReady.value=1;
  },undefined,()=>{plateReady.value=0;});
}

// Keep these values stable across all pieces in the merged skinned draw.
export const INFANTRY_SURFACE = {
  cloth: 0,
  skin: 1,
  face: 2,
  headwear: 3,
  canvas: 4,
  leather: 5,
  hardware: 6,
} as const;

/**
 * A finish on top of the sculpt's baked palette. The job of the shader is to
 * distinguish cloth, webbing, and leather, not to counterfeit seams that
 * belong in the geometry. Bind-space marks travel with the animated character.
 */
export function applyInfantryClothFinish<T extends MeshStandardMaterial>(material: T): T {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    loadFieldPlate();
    shader.uniforms.fieldGearPlate=fieldPlate;
    shader.uniforms.fieldGearReady=plateReady;
    const normal = 'varying vec3 vInfantryBindNormal;';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${normal}\nattribute float garmentPanel; varying float vGarmentPanel;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfantryBindNormal = normal;vGarmentPanel = garmentPanel;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${normal}
        varying float vGarmentPanel;
        uniform sampler2D fieldGearPlate;
        uniform float fieldGearReady;
        float kitPigment(vec2 cell) {
          vec3 q = fract(vec3(cell.xyx) * vec3(.1031,.0973,.1099));
          q += dot(q,q.yzx+19.37);
          return fract((q.x+q.y)*q.z);
        }
        float kitBrush(vec2 q) {
          vec2 i=floor(q), r=fract(q);
          r=r*r*(3.0-2.0*r);
          return mix(mix(kitPigment(i),kitPigment(i+vec2(1.0,0.0)),r.x),
            mix(kitPigment(i+vec2(0.0,1.0)),kitPigment(i+vec2(1.0)),r.x),r.y);
        }
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float kitKind = vInfantrySurface;
          vec3 kitP = vInfantryLocal;
          vec3 kitN = vInfantryBindNormal * inversesqrt(max(1e-6,dot(vInfantryBindNormal,vInfantryBindNormal)));
          vec2 field = vec2(kitP.x + .57 * kitP.z, kitP.y + .23 * kitP.z);
          vec2 weaveUV = field * vec2(55.0,83.0);
          // Footprint is evaluated outside the material branches; threads
          // disappear completely before they can sparkle in the chase view.
          float weaveVisible = 1.0 - smoothstep(.19,.65,length(fwidth(weaveUV)));
          float up = smoothstep(-.24,.78,kitN.y - .13 * kitN.x);
          float corner = 1.0 - smoothstep(.76,.97,max(abs(kitN.x),max(abs(kitN.y),abs(kitN.z))));
          // One filtered, bind-space sample per dressed pixel. Chart ID zero
          // excludes faces, hands, weapons, cans, horse and hardware. Screen
          // derivatives come from the *unwrapped* chart so repeats and
          // distance do not create bright seams. Stay inside each quadrant.
          float id=vGarmentPanel;
          vec3 axis=abs(kitN);
          vec2 chart=axis.y>max(axis.x,axis.z)?kitP.xz:(axis.x>axis.z?kitP.zy:kitP.xy);
          if(id>.5&&id<1.5)chart=(kitP.xz+kitN.xz*.096)*2.80+vec2(.47,.41);
          else chart=chart*(id<2.5?3.12:id<3.5?5.8:3.44)+vec2(.32,.16);
          vec2 dx=dFdx(chart)*.47,dy=dFdy(chart)*.47;
          if(id>.5 && id<4.5 && fieldGearReady>.5) {
            vec2 quadrant=id<1.5?vec2(0.,.5):id<2.5?vec2(.5,.5):id<3.5?vec2(0.):vec2(.5,0.);
            vec3 swatch=textureGrad(fieldGearPlate,quadrant+.015+fract(chart)*.47,dx,dy).rgb;
            vec3 mean=(id<1.5?vec3(103.,88.,49.):id<2.5?vec3(93.,81.,47.):
              id<3.5?vec3(99.,84.,47.):vec3(68.,68.,43.))/255.;
            vec3 ink=clamp(swatch/mean,vec3(.41),vec3(1.77));
            float luma=dot(ink,vec3(.24,.65,.11));
            float chroma=id<1.5?.94:id<2.5?.32:.13;
            float strength=id<1.5?1.14:id<2.5?.84:id<3.5?.72:.83;
            diffuseColor.rgb*=clamp(1.+(mix(vec3(luma),ink,chroma)-1.)*strength,vec3(.29),vec3(1.9));
          }
          if (kitKind < .5) {
            // Paint a broad warm-facing fold and a cool return plane, rather
            // than running one gloss-like highlight along the entire sleeve.
            float raised = smoothstep(.30,.78,dot(kitN,vec3(-.28,.82,-.50)));
            vec2 stroke = vec2(field.x - .115 * field.y,field.y + .37 * field.x);
            float tint = kitBrush(stroke * vec2(10.4,5.1) + 13.6);
            float scumble = (smoothstep(.29,.74,tint) - .54) * (.54 + .46 * raised);
            vec3 dye = mix(vec3(.841,.900,1.014),vec3(1.061,1.038,.967),up);
            dye += scumble * vec3(.26,.225,.18);
            // Dark untagged interior/utility pieces should not inherit an
            // artificial textile highlight even when their default tag is 0.
            float fiberDye = smoothstep(.026,.072,max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)));
            diffuseColor.rgb *= mix(vec3(1.0),dye,fiberDye);
          } else if (kitKind > 3.5 && kitKind < 4.5) {
            // Flat webbing faces are dry and soft; turned binding and flap
            // edges carry the strongest warm thread color.
            float face = smoothstep(.22,.8,up);
            float rubbed = corner * (.40 + .60 * face);
            float fabricWeave = sin(weaveUV.x * 6.2832 + weaveUV.y * .4);
            vec3 canvasTone = mix(vec3(.98,.874,.776),vec3(1.119,1.041,.904),up);
            diffuseColor.rgb *= canvasTone * (1.0 + fabricWeave * weaveVisible * face * .034);
            diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.326,.235,.128),rubbed * .19);
          } else if (kitKind > 4.5 && kitKind < 5.5) {
            // Oiled uppers keep a cool cast. Road dirt gathers near the
            // welt and the raised toe takes a drier, muted brown rub.
            float welt = 1.0 - smoothstep(.019,.081,kitP.y);
            float vamp = 1.0 - smoothstep(.104,.191,kitP.y);
            float dryToe = up * vamp * smoothstep(.0,.70,-kitN.z);
            diffuseColor.rgb *= mix(vec3(.88,.93,.983),vec3(1.10,1.047,.970),up);
            diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.119,.087,.052),
              clamp(welt * (.13 + .19 * corner) + dryToe * .18,0.0,.31));
          } else if (kitKind > 5.5 && kitKind < 6.5) {
            diffuseColor.rgb *= mix(vec3(.88,.92,.96),vec3(1.12,1.09,.98),up);
            diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.20,.18,.128),corner * up * .17);
          }
        }
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          float kitKind = vInfantrySurface;
          if (kitKind < .5 || (kitKind > 3.5 && kitKind < 4.5)) roughnessFactor = .98;
          else if (kitKind > 4.5 && kitKind < 5.5) roughnessFactor = mix(.94,.82,smoothstep(.032,.14,vInfantryLocal.y));
          else if (kitKind > 5.5 && kitKind < 6.5) roughnessFactor = .86;
          else if (kitKind > .5 && kitKind < 2.5) roughnessFactor = .90;
          else if (kitKind > 2.5 && kitKind < 3.5) roughnessFactor = .98;
        }
      `);
  };
  material.customProgramCacheKey = () => `${previousKey}:infantry-kit-paint-v4-painted-field-atlas`;
  material.needsUpdate = true;
  return material;
}
