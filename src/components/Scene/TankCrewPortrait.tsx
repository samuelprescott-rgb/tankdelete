import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AUTHORED_HEAD_PATH, createAuthoredInfantryEyes } from './AuthoredInfantryHead';
import { createFieldHeadGeometry } from './fieldHeadGeometry';
import { applyPaintedFinish } from './paintedMaterials';
import { createTankCrewPortrait, CREW_NECK, CREW_HEAD_ROTATION } from './tankCrewSculpt';
import { fieldPortraitInks, FIELD_PORTRAIT_GLSL } from './fieldPortraitPigment';
import {fieldHandInk,HAND_PAINT_GLSL} from './handPaintPlate';
import {FIELD_LIGHT_GROUPS} from './fieldLightGroups';

const body = createTankCrewPortrait();
const cloth = applyPaintedFinish(new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: .97, metalness: 0,
}), {scale: 2.8, strength: .85, edge: .33});
// Close camera: a diagonal twill on webbing, broken finish on the covered
// shell. Chase camera: only the large worn patches survive. The lens, metal
// receivers and skin have independent surfaces within the same indexed draw.
const baseKitCompile=cloth.onBeforeCompile,baseKitKey=cloth.customProgramCacheKey();
cloth.onBeforeCompile=(shader,renderer)=>{
  baseKitCompile.call(cloth,shader,renderer);
  shader.uniforms.fieldHandInk={value:fieldHandInk};
  shader.vertexShader='attribute float crewSurface; varying float vCrewSurface;attribute vec3 crewDetail;varying vec3 vCrewDetail;\n'+
    shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCrewSurface=crewSurface;vCrewDetail=crewDetail;');
  shader.fragmentShader='varying float vCrewSurface;varying vec3 vCrewDetail;\n'+HAND_PAINT_GLSL+shader.fragmentShader.replace('#include <alphamap_fragment>',`
    {
      vec2 clothUV=vec2(vPaintPosition.x*.78+vPaintPosition.z*.72,vPaintPosition.y-vPaintPosition.z*.29);
      float weave=(1.-step(.5,vCrewSurface));
      float cover=step(1.5,vCrewSurface)*(1.-step(2.5,vCrewSurface));
      float mass=paintedNoise(clothUV*vec2(21.,30.)+1.7);
      float flecks=paintedNoise(clothUV*vec2(110.,155.)+mass*1.33);
      vec2 rope=vec2(clothUV.x+clothUV.y*.63,clothUV.y-clothUV.x*.39)*vec2(1170.,960.);
      vec2 band=1.-smoothstep(vec2(1.6),vec2(3.15),fwidth(rope));
      float fibre=(sin(rope.x)*band.x*.060+sin(rope.y)*band.y*.046);
      float wear=smoothstep(.44,.70,mass+.19*(flecks-.5));
      diffuseColor.rgb*=1.+(weave+cover)*((wear-.5)*.34+(flecks-.5)*.23+fibre);
      diffuseColor.rgb+=vec3(.022,.019,.011)*wear*cover;
      // Broad worn dye islands, bounded in model space. Unlike an all-over
      // noise treatment these form value shapes that survive the chase view.
      vec2 cell=floor(clothUV*154.+.5)/154.;
      float flank=paintedNoise(cell*vec2(15.,28.)+vec2(4.5,8.2));
      float island=smoothstep(.53,.58,flank), valley=1.-smoothstep(.34,.39,flank);
      diffuseColor.rgb*=1.+(cover+weave)*(.23*island-.27*valley);
      diffuseColor.rgb+=vec3(.021,.020,.012)*island*cover;
      // All charts below live on the sculpt. The same crease follows the
      // same finger around the handle, including its occluded back side.
      vec3 d=vCrewDetail;float lum=dot(diffuseColor.rgb,vec3(.24,.64,.12));
      if(d.x>=1.&&d.x<=2.){
        float t=d.x-1.,outer=d.z,up=d.y;
        float mound=smoothstep(.16,.76,outer+.6*up);
        float join=1.-smoothstep(.025,.26,abs(t-.47));
        float wrinkle=(1.-smoothstep(.025,.071,abs(t-.46-.039*up)))*
          smoothstep(.14,.65,outer+up*.48);
        float lobe=.28+.72*smoothstep(-.58,.73,outer+.47*up);
        diffuseColor.rgb=mix(lum*vec3(.82,.77,.75),diffuseColor.rgb,lobe);
        diffuseColor.rgb*=.78+.30*mound+.13*join*mound-.29*wrinkle;
        float nail=smoothstep(.72,.78,t)*(1.-smoothstep(.93,.99,t))*
          smoothstep(.60,.84,outer+.29*up);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.43,.29,.21),.60*nail);
        diffuseColor.rgb+=vec3(.035,.025,.017)*mound*join;
        // Project across the front/side of the wrapped digit, not merely
        // its upward normal (hidden behind the grip in the control camera).
        diffuseColor.rgb=fieldHandPrint(diffuseColor.rgb,fieldHandTile(1.,vec2(t,.52+.45*d.y+.13*d.z)));
      }else if(d.x>=3.&&d.x<=4.){
        float t=d.x-3.,dorsum=d.y*.62+d.z*.65;
        float warm=smoothstep(-.38,.7,dorsum);
        float muscle=smoothstep(.10,.85,dorsum+.42*t)*smoothstep(.43,.62,t)*(1.-smoothstep(.80,.98,t));
        float extensor=(1.-smoothstep(.04,.27,abs(d.y-.24+.60*(t-.6))))*
          smoothstep(.55,.78,t)*smoothstep(-.5,.4,d.z);
        diffuseColor.rgb=mix(lum*vec3(.75,.78,.83),diffuseColor.rgb,.64+.33*warm);
        diffuseColor.rgb*=.72+.23*warm+.19*muscle;diffuseColor.rgb+=vec3(.037,.026,.018)*extensor;
      }else if(d.x>=7.&&d.x<=8.){
        float t=d.x-7.;
        float tendon=(1.-smoothstep(.04,.27,abs(d.z-.29-.38*t)))*smoothstep(.20,.66,t)*smoothstep(.0,.62,d.y);
        diffuseColor.rgb*=.83+.14*smoothstep(-.56,.54,d.y)+.13*tendon;
        diffuseColor.rgb=fieldHandPrint(diffuseColor.rgb,fieldHandTile(0.,vec2(.50+.5*d.z,t)));
      }else if(d.x>5.60&&d.x<=6.){
        // A cool broken sky pane, a much dimmer second pane, and warm
        // earth along the lower edge. No emission and no chrome outline.
        vec2 glass=floor(d.yz*32.)/32.;
        float a=glass.y+.48*glass.x;
        float sky=step(.20,a)*step(a,.39)*step(-.50,glass.x)*step(glass.x,.08);
        float veil=step(.17,a)*step(a,.28)*step(.14,glass.x)*step(glass.x,.46);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.090,.148,.155),sky*.86+veil*.44);
        diffuseColor.rgb*=1.-.21*smoothstep(.06,.47,-glass.y);
      }
      if(d.x>10.){
        vec3 field=fieldLightGroup(vNormal);
        if(d.x>20.){
          float crown=smoothstep(.19,.58,d.y);
          vec3 basin=diffuseColor.rgb*mix(.65,1.0,crown);
          diffuseColor.rgb=fieldWornDye(basin,field,crown*.97,vec3(.36,.287,.154),vec3(.071,.094,.090));
        }else if(d.x>18.){
          float outside=1.-smoothstep(.48,1.,d.y);
          diffuseColor.rgb=fieldWornDye(diffuseColor.rgb*.84,field,.62+.32*outside,
            vec3(.298,.225,.124),vec3(.081,.091,.078));
        }else if(d.x>16.){
          diffuseColor.rgb*=vec3(.47,.56,.56); // dark stand collar supports the helmet
        }else if(d.x>12.&&d.x<14.){
          diffuseColor.rgb=fieldWornDye(diffuseColor.rgb*.76,field,.36+.56*smoothstep(.3,.86,d.y),
            vec3(.29,.224,.124),vec3(.079,.088,.074));
        }else{
          float upper=smoothstep(.17,.31,vPaintPosition.y);
          diffuseColor.rgb=fieldWornDye(diffuseColor.rgb*vec3(.56,.65,.64),field,.71*upper,
            vec3(.23,.179,.097),vec3(.067,.081,.074));
        }
      }
    }
    #include <alphamap_fragment>`).replace('#include <lights_pars_begin>','#include <lights_pars_begin>\n'+FIELD_LIGHT_GROUPS).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=vCrewSurface>2.5?.52:(vCrewSurface>.5&&vCrewSurface<1.5?.86:.98);`);
};
cloth.customProgramCacheKey=()=>baseKitKey+':crew-separated-field-pigment-3';
const fallbackHead = createFieldHeadGeometry(.134, '#b89170', 1, 'us').translate(-.012, 0, -.016);
// Fallback uses the kit material, so explicitly identify it as skin, too.
fallbackHead.setAttribute('crewSurface',new THREE.Float32BufferAttribute(
  new Float32Array(fallbackHead.attributes.position.count).fill(1),1));
fallbackHead.setAttribute('crewDetail',new THREE.Float32BufferAttribute(new Float32Array(fallbackHead.attributes.position.count*3),3));
const eyes = createAuthoredInfantryEyes(true);
const sclera = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .84});

function AssetFace() {
  const gltf = useLoader(GLTFLoader, AUTHORED_HEAD_PATH);
  const {geometry, material} = useMemo(() => {
    // Only a single crewman exists. Use the intact eyelid/lip contours for
    // this hero portrait. The texture and original mesh stay loader-owned.
    const source = gltf.scene.getObjectByName('head-near') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    if (!source?.isMesh || !source.material.map) throw new Error('Crew portrait asset missing');
    const material = source.material.clone();
    material.roughness = .96; material.metalness = 0;
    material.onBeforeCompile = shader => {
      shader.uniforms.fieldPortraitInks={value:fieldPortraitInks};
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCrewFace;')
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          // Represent sub-pixel socket planes more like a painted portrait;
          // lights still turn across the face and there is no emissive fill.
          float lidPlane = (1.-smoothstep(.012,.038,abs(position.y-.141))) *
            (1.-smoothstep(.013,.042,abs(abs(position.x)-.033))) * smoothstep(.06,.11,-position.z);
          objectNormal=normalize(mix(objectNormal,normalize(vec3(sign(position.x)*.20,.21,-1.)),.66*lidPlane));`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrewFace = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCrewFace;\n'+FIELD_PORTRAIT_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // Local touches only: visor shade, warmth in sun-exposed cheeks,
          // and the cooler, rougher jaw below. Leave the eyes and mouth clear.
          float visor = smoothstep(.161,.201,vCrewFace.y + .045 * vCrewFace.x);
          float stubble = (1.0-smoothstep(.055,.095,vCrewFace.y)) * smoothstep(.025,.093,-vCrewFace.z);
          float orbit = (1.-smoothstep(.012,.036,abs(vCrewFace.y-.139))) *
            (1.-smoothstep(.013,.044,abs(abs(vCrewFace.x)-.032))) * smoothstep(.065,.11,-vCrewFace.z);
          // Lift low-values in the photographic socket pigment only. This
          // avoids a red-black rim without bleaching the rest of the face.
          float lowInk=1.-smoothstep(.053,.259,dot(diffuseColor.rgb,vec3(.213,.715,.072)));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.310,.184,.132),orbit*lowInk*.83);
          // The source scan has a wine-red shadow in one socket. Preserve
          // the actual eyelid geometry but take that baked shadow out before
          // applying the deliberately paired brows and current scene light.
          float socketDye=orbit*(1.-smoothstep(.07,.22,diffuseColor.g));
          vec3 orbitalFloor=vec3(.282,.164,.126);
          diffuseColor.rgb=mix(diffuseColor.rgb,max(diffuseColor.rgb,orbitalFloor),socketDye*.88);
          diffuseColor.rgb *= mix(vec3(1.00,.986,.957),vec3(.73,.76,.72),visor);
          diffuseColor.rgb *= mix(vec3(1.),vec3(.62,.71,.72),stubble*.83);
          // Settled dirt and sweat break the portrait's old uniform peach
          // base before the wet nose, matte cheek and brow ink are printed.
          diffuseColor.rgb*=vec3(.80,.78,.76);
          diffuseColor.rgb=fieldCutPortrait(diffuseColor.rgb,vCrewFace);`);
    };
    material.customProgramCacheKey = () => 'tank-crew-four-ink-field-face-v3';
    applyPaintedFinish(material, {scale: 4, strength: .44, edge: .18});
    return {geometry: source.geometry, material};
  }, [gltf]);
  useEffect(() => () => material.dispose(), [material]);
  // A 48m shadow map can't describe eyelids. Helmet shade is painted above.
  return <><mesh name="tank-crew-authored-face" geometry={geometry} material={material} />
    <mesh geometry={eyes} material={sclera} /></>;
}

const backup = <mesh name="tank-crew-fallback-face" geometry={fallbackHead} material={cloth} />;
class FaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? backup : this.props.children; }
}

export function TankCrewPortrait() {
  return <group dispose={null}>
    <mesh name="tank-crew-garments-and-kit" geometry={body} material={cloth} castShadow receiveShadow />
    <group position={CREW_NECK} rotation={CREW_HEAD_ROTATION}>
      <FaceBoundary><Suspense fallback={backup}><AssetFace /></Suspense></FaceBoundary>
    </group>
  </group>;
}
