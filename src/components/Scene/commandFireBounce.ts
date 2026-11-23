import type {MeshStandardMaterial} from 'three';
import {EMBASSY_ARCHIVE_SLOTS} from '../../lib/embassyDefense';
import {ANNEX_FIRE_SCALE,LOWER_BURN,UPPER_BURN} from './annexFirelight';
import {COMPOUND_BURN_PILE} from './embassyGroundworks';

type XYZ=[number,number,number];
type FireSource={id:string;p:XYZ;escape:XYZ;energy:number;reach:number};
type Surface='skull'|'hide'|'coat'|'wound';
const response:Record<Surface,readonly [number,number,number]>={
  skull:[1.20,.094,12],hide:[.91,.038,18],coat:[.77,.023,9],wound:[.86,.071,14],
};
/** The upper sill glows into the courtyard, not straight through its intact
 * back wall. The front rubble can also throw light up at a jaw passing
 * overhead. Integration over the burning pocket is approximated by its hot
 * centre; the emitters below are mounted on the visible flames themselves. */
export const COMMAND_FIRE_POCKETS:readonly FireSource[]=[
  {id:'bay',p:[COMPOUND_BURN_PILE[0],2.65,COMPOUND_BURN_PILE[2]],escape:[0,.64,.77],energy:1.48,reach:14},
  ...EMBASSY_ARCHIVE_SLOTS.slice(1).flatMap((s):FireSource[]=>{
    const wing=s.id==='records'?'records':'dispatch',side=wing==='records'?1:-1;
    return [LOWER_BURN[wing],UPPER_BURN[wing]].map(([x,y,z],i):FireSource=>({
      id:wing+(i?'-sill':'-rubble'),
      p:[s.position[0]+side*x,s.position[1]+y+.39*ANNEX_FIRE_SCALE[wing][i],s.position[2]+z],
      escape:i?[.64*side,.69,.34]:[.22*side,.62,.75],
      energy:i?(wing==='dispatch'?2.40:2.03):1.06,reach:i?13.6:9.2,
    }));
  }),
];
const fl=(n:number)=>n.toFixed(4);
const vec=(p:XYZ)=>'vec3('+p.map(fl).join(',')+')';

/** Existing boss draw only: integrate spatial diffuse and a restrained
 * rough wet highlight at vertices, then modulate with the painted surface.
 * No halo, outline, extra geometry, engine point light, ambient or shadow pass. */
export function commandFireBounce(material:MeshStandardMaterial,surface:Surface){
  const prev=material.onBeforeCompile,key=material.customProgramCacheKey(),[albedo,sheen,power]=response[surface];
  // This separation belongs to the tall watcher's two exposed bony planes,
  // not all of its silhouette. UV.x selects its half of the existing paired
  // skull chart. The only hide above 1.08 in bind space is neck/trapezius;
  // the strike arm, teeth, palms, hair and lower body have local origins.
  const catchment=surface==='skull'?`step(.5,vBoneInk.x)*(1.-step(.01,vCommandEmber))
          *smoothstep(.046,.145,vSculptP.y)`:surface==='hide'?`.41*smoothstep(.070,.177,vPaintPosition.x)
          *smoothstep(1.083,1.280,vPaintPosition.y)`:'';
  const skyCatch=catchment?`
    #if NUM_HEMI_LIGHTS > 0 && NUM_DIR_LIGHTS > 0
      float crownCatch=${catchment};
      if(crownCatch>.001){
        // Real rain sky/covered moon directions and calibrated sky color,
        // evaluated on the smooth underlying geometric plane (not wet bump
        // noise). Receives nothing on the underside or in a hot fire pocket.
        vec3 rainUp=normalize(hemisphereLights[0].direction);
        vec3 rainOpening=normalize(directionalLights[0].direction+rainUp*.74);
        float skyPlane=smoothstep(-.08,.58,dot(nonPerturbedNormal,rainOpening))
          *smoothstep(-.09,.46,dot(nonPerturbedNormal,rainUp));
        float unlitByFire=1.-smoothstep(.055,.49,vCommandFireResponse.x);
        reflectedLight.indirectDiffuse+=hemisphereLights[0].skyColor*
          (vec3(.159,.184,.212)+.31*diffuseColor.rgb)*crownCatch*skyPlane*unlitByFire;
      }
    #endif
  `:'';
  material.onBeforeCompile=(shader,renderer)=>{
    prev.call(material,shader,renderer);
    const varying='varying vec2 vCommandFireResponse;';
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      ${varying}
      vec2 commandPocket(vec3 wp,vec3 n,vec3 v,vec3 src,vec3 opening,float energy,float reach){
        vec3 delta=src-wp;float ds=dot(delta,delta),invD=inversesqrt(max(.0001,ds));
        vec3 l=delta*invD;float ndl=dot(n,l);
        float launch=smoothstep(-.35,.30,dot(-l,opening));
        float range=(1.-smoothstep(reach*.34,reach,sqrt(ds)))/(1.+.025*ds);
        // Specular and diffuse both vanish on the far side of the cheek.
        float inc=max(ndl,0.);
        vec3 halfDir=l+v;halfDir*=inversesqrt(max(.0001,dot(halfDir,halfDir)));
        float spec=pow(max(dot(n,halfDir),0.),${fl(power)})*smoothstep(0.,.38,inc);
        return launch*energy*range*vec2(inc,spec);
      }`).replace('#include <project_vertex>',`#include <project_vertex>
      vec3 commandWorld=(modelMatrix*vec4(transformed,1.)).xyz;
      vec3 commandN=normalize(inverseTransformDirection(normalize(transformedNormal),viewMatrix));
      vec3 commandV=normalize(cameraPosition-commandWorld);
      vCommandFireResponse=vec2(0.);
      ${COMMAND_FIRE_POCKETS.map(s=>'vCommandFireResponse+=commandPocket(commandWorld,commandN,commandV,'+
        vec(s.p)+','+vec(s.escape)+','+fl(s.energy)+','+fl(s.reach)+');').join('\n')}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+varying)
      .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        float commandTint=smoothstep(.009,.155,dot(diffuseColor.rgb,vec3(.24,.65,.11)));
        reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.74,.78,.32)*${fl(albedo)}*min(1.92,vCommandFireResponse.x);
        reflectedLight.directSpecular+=vec3(1.0,.61,.32)*${fl(sheen)}*(.25+.75*commandTint)*min(1.18,vCommandFireResponse.y);
        ${skyCatch}`);
  };
  material.customProgramCacheKey=()=>key+'/command-practical-pockets-v3/'+surface;
}
