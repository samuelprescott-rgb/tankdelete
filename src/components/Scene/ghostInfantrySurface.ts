import * as THREE from 'three';
import { SCOUT_CLOTH_PIGMENT } from './VCInfantryKit';
import {fieldPortraitInks,FIELD_PORTRAIT_GLSL} from './fieldPortraitPigment';
import {fieldHandInk,HAND_PAINT_GLSL} from './handPaintPlate';
import {FIELD_LIGHT_GROUPS} from './fieldLightGroups';

type Faction = 'us' | 'vc';

// Four hand-cut pigment masks in one small texture. Red = the connected
// shadow/high edge of a cloth fold; green = broad helmet-cover islands;
// blue = frayed canvas; alpha = rubbed leather/metal. Values are signed
// around 128. Leave large quiet areas: the 3D pockets and seams do the work.
function makeInkPlate() {
  const n=32, pixels=new Uint8Array(n*n*4).fill(128);
  const patch=(channel:number, value:number, x:number,y:number,rows:readonly string[])=>{
    rows.forEach((line,j)=>{for(let i=0;i<line.length;i++)if(line[i]==='#')
      pixels[(((y+j)%n)*n+(x+i)%n)*4+channel]=value;});
  };
  patch(0,66,4,7,['       #####','    #######','  ######','####']);
  patch(0,183,5,8,['       ####','    ####','  ###','##']);
  patch(0,83,20,23,['     ####','  #####','####']);
  patch(0,167,21,24,['    ###','  ###','##']);
  patch(1,43,2,3,['     ###','  #######','###########','###########','########','  ####','   ##']);
  patch(1,83,0,9,['###','#####','  ####','   ###']);
  patch(1,188,17,14,['   ###',' #######','#########',' #######','  ###']);
  patch(1,72,23,26,['    ######','  #######','########',' ######','   ##']);
  patch(1,171,7,24,['  ####','#####',' ##']);
  patch(2,74,3,5,['######',' ##']);
  patch(2,194,4,7,['#####']);
  patch(2,90,18,23,[' ####','###']);
  patch(2,171,21,24,['##']);
  patch(3,185,5,7,['    ###','  ####','###']);
  patch(3,77,4,9,[' ####','###']);
  patch(3,159,22,19,['    ##','  ###','##']);
  // All grain is painted once into the same four-channel swatch, rather
  // than sampled from a second noise texture per soldier. Staggered twill
  // runs over the cloth and canvas; helmet pigment forms interlocking,
  // stepped leaf silhouettes with a worn edge, not smooth green plastic.
  const layers=pixels.slice();
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=(y*n+x)*4, phase=(x+2*y)%5;
    const wear=((x*17+y*31+(x*y)%11)%17)-8;
    const tow=phase===0?32:phase===1?11:phase===3?-29:-8;
    const scuff=((x+3+Math.floor(y/5)*7)%17 < 5 && y%11<8);
    if(layers[i]!==128 || scuff) pixels[i]=Math.max(12,Math.min(242,layers[i]+tow+wear));
    if(layers[i+2]!==128 || scuff) pixels[i+2]=Math.max(9,Math.min(247,layers[i+2]+tow*1.55+wear));
    const leaf=layers[i+1], above=layers[(((y+n-1)%n)*n+(x+n-1)%n)*4+1];
    const verge=above!==leaf && leaf<110;
    if(leaf!==128) pixels[i+1]=Math.max(7,Math.min(248,(leaf-128)*1.48+128+(verge?32:0)+tow*.37+wear));
  }
  const tex=new THREE.DataTexture(pixels,n,n);
  tex.name='ghost-infantry-bind-space-ink';
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.magFilter=THREE.NearestFilter; tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps=true;tex.colorSpace=THREE.NoColorSpace;tex.needsUpdate=true;
  return tex;
}
// Same material/texture lifetime as the shared infantry geometries. No actor
// owns a copy; no texture uploads in the animation or render loops.
let inkPlate:THREE.DataTexture|undefined;
const portraitWash={map:{value:null as THREE.Texture|null},ready:{value:0},status:'not-requested'};
function loadPortraitWash(){
  if(portraitWash.status!=='not-requested'||typeof Image==='undefined'||typeof document==='undefined')return;
  portraitWash.status='loading';
  new THREE.TextureLoader().load('/images/textures/field-portrait-wash-v1.png?paint=profile-2',t=>{
    t.name='field-portrait-CC0-planes-stubble';t.colorSpace=THREE.NoColorSpace;
    // glTF UVs measure from the TOP of the source image.
    t.flipY=false;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.anisotropy=2;
    portraitWash.map.value=t;t.needsUpdate=true;portraitWash.ready.value=1;portraitWash.status='ready';
  },undefined,()=>{portraitWash.status='vertex-paint-fallback';});
}
const linear=(hex:number)=>{
  const c=new THREE.Color(hex);
  return 'vec3('+c.toArray().map(v=>v.toFixed(5)).join(',')+')';
};
const colors=(values:number[])=>values.map(linear).join(',');

export function createGhostInfantryMaterial(base:THREE.MeshStandardMaterial, faction:Faction) {
  const material=base.clone();
  material.name='ghost-signal-solid-infantry-'+faction;
  const sourceCompile=base.onBeforeCompile, sourceKey=base.customProgramCacheKey();
  const inks=inkPlate??=makeInkPlate();
  loadPortraitWash();material.userData.fieldPortraitWash=portraitWash;
  const issue=faction==='us'
    ? [0x292f2b,0x414b39,0x656d4d,0x848866,0xb3ab83]
    : [0x1e2a33,0x33494c,0x4d6864,0x708c80,0x9da995];
  material.onBeforeCompile=(s,renderer)=>{
    // Three clones material settings but not custom shader callbacks. Chain
    // the real body finish to retain anatomical paint, skinning and shadows.
    sourceCompile.call(material,s,renderer);
    s.uniforms.ghostInfantryInk={value:inks};
    if(faction==='vc')s.uniforms.fieldPortraitInks={value:fieldPortraitInks};
    if(faction==='vc')s.uniforms.fieldHandInk={value:fieldHandInk};
    s.uniforms.fieldPortraitPlate=portraitWash.map;s.uniforms.fieldPortraitReady=portraitWash.ready;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\n#ifdef USE_SKINNING\nattribute vec2 fieldFaceUV;\n#endif\nvarying vec2 vFieldFaceUV;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_SKINNING\nvFieldFaceUV=fieldFaceUV;\n#else\nvFieldFaceUV=vec2(0.);\n#endif');
    if(faction==='vc')s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 fieldHandArt;varying vec2 vHandInkChart;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvHandInkChart=fieldHandArt;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D ghostInfantryInk;
      ${faction==='vc'?FIELD_PORTRAIT_GLSL:''}
      ${faction==='vc'?'varying vec2 vHandInkChart;'+HAND_PAINT_GLSL:''}
      uniform sampler2D fieldPortraitPlate;uniform float fieldPortraitReady;varying vec2 vFieldFaceUV;
      float fieldBell(float a){return exp(-a*a);}
      vec3 ghostRamp(float v,vec3 a,vec3 b,vec3 c,vec3 d,vec3 e){
        if(v<.215)return a;if(v<.315)return b;if(v<.425)return c;if(v<.555)return d;return e;
      }
    `).replace('#include <alphamap_fragment>',`
      {
        float k=vInfantrySurface;
        bool skin=k>.5&&k<2.5, lid=k>2.5&&k<3.5;
        bool canvas=k>3.5&&k<4.5, leather=k>4.5&&k<5.5, metal=k>5.5;
        // Box-map the pigment in actual bind coordinates: a sleeve bends
        // WITH its original paint. Never use camera azimuth or screen UV.
        vec3 p=vInfantryLocal, n=normalize(vInfantryBindNormal);
        vec3 normalWeight=abs(n);
        vec2 chart,dx,dy;
        vec3 px=dFdx(p),py=dFdy(p);
        if(normalWeight.y>max(normalWeight.x,normalWeight.z)){chart=p.xz;dx=px.xz;dy=py.xz;}
        else if(normalWeight.x>normalWeight.z){chart=p.zy;dx=px.zy;dy=py.zy;}
        else{chart=p.xy;dx=px.xy;dy=py.xy;}
        // ~37 samples across a head, ~35 across a jacket: different texel
        // budgets by anatomy; animation, pitch and camera zoom never rescale it.
        float density=skin?218.0:(lid?142.0:(canvas?138.0:92.0));
        vec2 grid=chart*density, gx=dx*density, gy=dy*density;
        float footprint=max(length(gx),length(gy));
        float resolved=1.-smoothstep(.48,1.55,footprint);
        vec4 marks=textureGrad(ghostInfantryInk,grid/32.,gx/32.,gy/32.);
        float dab=(lid?marks.g:(canvas?marks.b:((leather||metal)?marks.a:marks.r)))-.502;
        // Reconstruct interpolated vertex color at the model texel center.
        // Bounded correction preserves sub-texel eyelids and tiny fittings.
        vec3 source=diffuseColor.rgb;
        vec3 cx=dFdx(source),cy=dFdy(source);
        float det=gx.x*gy.y-gy.x*gx.y;
        if(abs(det)>.00001){
          vec2 offset=.5-fract(grid);
          vec2 shift=vec2(gy.y*offset.x-gy.x*offset.y,gx.x*offset.y-gx.y*offset.x)/det;
          vec3 limit=.25*source+.006;
          source+=clamp(cx*shift.x+cy*shift.y,-limit,limit)*resolved;
        }
        // An indexed albedo, not an unlit override. The original vertex
        // dye keeps skin/eyes/variant differences; live lighting still wraps
        // around the mesh and the rifle still occludes the body.
        float val=sqrt(max(.0001,dot(source,vec3(.213,.715,.072))));
        float form=dot(n,vec3(-.32,.80,-.32));
        float anchor=val+(skin?.016:.030)*form+(skin?0.0:dab*.18*resolved);
        vec3 ink=ghostRamp(anchor,${colors(issue)});
        if(skin)ink=ghostRamp(anchor*.86,${colors([0x382927,0x68483b,0x966549,0xc18b64,0xe0b38a])});
        else if(canvas)ink=ghostRamp(anchor,${colors([0x302e2b,0x514c3f,0x716850,0x968767,0xbca87f])});
        else if(leather||metal)ink=ghostRamp(anchor,${colors([0x22292a,0x38403e,0x505854,0x76807b,0xa2a497])});
        // Keep the darkest features (hair, lash and nostril) as ink;
        // don't tint sclera, markings or existing bright metal like flesh.
        float inRange=smoothstep(.085,.16,val)*(1.-smoothstep(.64,.84,val));
        // Preserve the portrait's painted skin planes. A globe in the same
        // skinned batch must not inherit the orange face ramp; its neutral
        // sclera/iris/lash values are already authored on the curved tissue.
        float portrait=k>1.5&&k<2.5?1.:0.;
        float fleshChroma=smoothstep(.012,.105,source.r-source.b);
        float weight=mix(skin?.45:.61,.13*fleshChroma,portrait)*inRange*(.73+.27*resolved);
        diffuseColor.rgb=mix(source,ink,weight)*(1.+(skin?0.:dab*.25*resolved));
        if(portrait>.5&&vFieldFaceUV.x+vFieldFaceUV.y>.001){
          // UV=(1,1) is exclusive to the two true curved corneas; never
          // put a photographic iris or an olive/flesh ramp on a globe.
          bool cornea=min(vFieldFaceUV.x,vFieldFaceUV.y)>.9995;
          vec2 face=vec2(p.x-.012,p.y-(p.y>1.35?1.568:1.128)+.128);
          float ax=abs(face.x),front=smoothstep(.021,.089,-p.z);
          if(cornea){diffuseColor.rgb=source;}
          else{
            // One existing fetch: R = source follicle/fold pigment, G = the
            // painted zygomatic, temple and jaw return, B = growth tied
            // to actual beard topography. Eye, mouth interior and garments
            // never enter this exterior skin branch.
            vec3 plate=fieldPortraitReady>.5?texture2D(fieldPortraitPlate,vFieldFaceUV).rgb:vec3(.502,.502,0.);
            float dye=plate.r-.502,planes=(plate.g-.502)*2.;
            float lum=dot(source,vec3(.26,.63,.11));
            // Cool olive/umber halftones under a warm key; allow the
            // photographed pores, beard and folded lip pigment to survive.
            vec3 flesh=mix(source,lum*vec3(1.18,1.10,1.01),.32)*clamp(1.+2.15*dye,.42,1.58);
            float side=sign(face.x);
            float browHeight=.1575+.004*fieldBell((ax-.032)/.014)-.009*smoothstep(.036,.056,ax)+side*.0017;
            float arch=smoothstep(.010,.019,ax)*(1.-smoothstep(.046,.057,ax))*front;
            float brow=arch*(1.-smoothstep(.0018,.0046,abs(face.y-browHeight)));
            float cheek=fieldBell((ax-.052)/.022)*fieldBell((face.y-.117)/.013)*front;
            float jaw=fieldBell((face.y-.061)/.019)*(.28+.72*smoothstep(.012,.051,ax));
            float phil=fieldBell((face.y-.082)/.005)*fieldBell((ax-.014)/.012);
            float grain=.5+.5*sin(181.*face.x+257.*face.y+sin(119.*face.y));
            flesh=mix(flesh,vec3(.027,.026,.022),brow*(.63+.26*grain));
            flesh=mix(flesh,lum*vec3(.69,.76,.72),front*(.20*jaw+.17*phil)*(.66+.34*grain));
            float lip=fieldBell((face.y-.069)/.0025)*fieldBell((ax-.009)/.018)*front;
            flesh*=1.+.18*cheek-.25*lip;
            // A broad warm dry ledge above a cooler half-tone, with a
            // second, smaller reflected ledge at the edge of the jaw.
            // These are matte local pigments, not highlights in screen
            // space or emissive dabs: they still turn away from the light.
            float lit=max(planes,0.),turn=max(-planes,0.);
            flesh=mix(flesh,flesh*vec3(1.28,1.34,1.28)+vec3(.087,.071,.052),lit);
            flesh=mix(flesh,.61*flesh+.14*lum*vec3(.92,1.18,1.21),turn);
            float whisker=plate.b;
            flesh=mix(flesh,lum*vec3(.43,.50,.49)+vec3(.012,.011,.009),whisker*.89);
            diffuseColor.rgb=${faction==='vc'?'fieldCutPortrait(flesh,vec3(face,p.z-.020))':'flesh'};
          }
        }
        ${faction==='us'?`
        // Compressed cotton around the elbow/knee and waist breaks into
        // small stepped ridges. Work in the bind pose so the same patch
        // goes around with its sleeve or trouser leg, not across the screen.
        if(k<.5){
          float knee=1.-smoothstep(.045,.15,abs(p.y-.46));
          float elbow=(1.-smoothstep(.040,.14,abs(p.y-1.16)))*smoothstep(.16,.24,abs(p.x));
          float waist=1.-smoothstep(.025,.092,abs(p.y-.93));
          float folds=max(knee,max(elbow,waist));
          vec2 snapped=floor(chart*139.)/139.;
          float seam=.5+.5*sin(123.*snapped.y+25.*snapped.x+2.1*sin(23.*snapped.x+26.*snapped.y));
          float ridge=smoothstep(.68,.97,seam),valley=1.-smoothstep(.045,.30,seam);
          float dry=folds*(.35+.65*smoothstep(-.6,.7,n.y-n.z*.32))*resolved;
          diffuseColor.rgb*=1.+dry*(ridge*.24-valley*.21);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.34,.29,.18),dry*ridge*.105);
        }`:''}
        ${faction==='vc'?SCOUT_CLOTH_PIGMENT:''}
        ${faction==='vc'?'if(k>.5&&k<1.5&&vHandInkChart.x>.001)diffuseColor.rgb=fieldHandPrint(diffuseColor.rgb,vHandInkChart);':''}
      }
      #include <alphamap_fragment>
    `);
    if(faction==='vc')s.fragmentShader=s.fragmentShader.replace('#include <lights_pars_begin>','#include <lights_pars_begin>\n'+FIELD_LIGHT_GROUPS);
  };
  material.customProgramCacheKey=()=>sourceKey+':ghost-solid-UV-portrait-plane-v4-'+(faction==='vc'?'scout-cotton-v1-field-ink-v2-':'')+faction;
  return material;
}
