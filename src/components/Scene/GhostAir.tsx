import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainReliefHeight } from '../../lib/terrain';
import { DAY_SUN_XZ, SUN_BREAKS } from './crossingSun';
import { CHECKPOINT_LAMPS, checkpointBulb } from './checkpointLamps';

// Day shafts in canopy breaks; low mist behind the rain-dark court. One
// local batch, no full-screen fog overlay, depth capture or shadow pass.
// Foot X/Z, height, width at foot/crown, opacity.
const CROSSING = [
  ...SUN_BREAKS,
  [8,31,13,3.,1.35,.15],[5.5,32,12,1.,.55,.12],
  [-21,34,14,3.2,1.8,.12],[20,-4,10,2.2,.9,.13],
  [-17,-24,14,3.1,1.3,.11],[15,-33,13,3.3,1.8,.14],
];
const STORM = [
  [-18,-32,2.3,6.,5.5,.15],[10,-35,3.1,6.5,5.,.13],
  [-7,-39,2.8,5.8,5.3,.13],[21,-20,2.1,4.9,4.1,.11],
  [-16,22,3.1,5.3,3.9,.10],[14,30,3.4,6.,4.1,.10],
];
function makeAir(night:boolean){
  const xyz:number[]=[], style:number[]=[], tint:number[]=[], shafts:number[]=[], drift:number[]=[], index:number[]=[];
  // Each practical emits a different *local* colour into the rain; the
  // enveloping night stays cool. Front particles and infantry occlude it.
  const put=(x:number,y:number,z:number,dx:number,dy:number,dz:number,base:number,top:number,strength:number,r:number,g:number,b:number,bank=0)=>{
    const start=xyz.length/3;
    for(const [edge,t] of [[-1,0],[1,0],[-1,1],[1,1]]){
      xyz.push(x+dx*t,y+dy*t,z+dz*t);shafts.push(dx,dy,dz);tint.push(r,g,b);drift.push(bank);
      style.push(edge,t,t===0?base:top,strength);
    }
    index.push(start,start+1,start+2,start+2,start+1,start+3);
  };
  for(const [x,z,h,base,top,strength] of (night?STORM:CROSSING))
    put(x,.16,z,(night?.82:DAY_SUN_XZ[0]*1.85)*h,h,(night?.06:DAY_SUN_XZ[1]*1.85)*h,night?base:base*.77,night?top:top*.80,strength*(night?1:.32),night?.18:.75,night?.27:.57,night?.35:.28);
  if(night){
    // Looking east from the guard turnout, these sit beyond the approach
    // road at three distances. Gaps leave dark trunks between the banks.
    put(19,-.45,-11,1.2,3.7,0,8.4,7.8,.46,.16,.25,.29,2);
    put(30,-.75,7,1.4,6.1,.8,13.5,12,.67,.20,.32,.37,2);
    put(43,-.8,-16,1.8,8.4,1.6,14,14.8,.64,.16,.25,.34,2);
    put(12,-.65,32,1.6,5.9,.4,12,10,.50,.13,.24,.30,2);
    put(-23,-.65,11,1,4.6,.5,8.5,9.2,.43,.14,.23,.29,2);
    // Shafts follow the moon bearing through the canopy. Only small
    // patches of rain beneath the checkpoint bulbs catch the warm light.
    put(29,.1,9,-6.4,10,-17.6,2.7,1.3,.12,.34,.46,.57);
    put(32,.2,8,-5.1,8,-14.1,.85,.38,.095,.34,.46,.57);
    for(const lamp of CHECKPOINT_LAMPS){
      const [x,y,z]=checkpointBulb(lamp),[fx,,fz]=lamp.aim;
      put(fx,.02,fz,x-fx,y-.02,z-fz,3.1,.24,.33,.62,.34,.15,3);
    }
    // Wind carries the amber vapour a few metres along the burned apron.
    put(5.9,-.15,-21,.9,2.2,.6,3.6,2.7,.25,.43,.23,.12,2);
    // Hang behind the masonry and in front of distant trunks. Slightly
    // offset shelves preserve the dark cut of the canopy on either side.
    put(-18,-1.4,-44,4.,11.,2.,17.,19.,.38,.105,.105,.145,1);
    put(15,-1.2,-39,2.,9.6,1.4,14.,13.,.32,.084,.125,.155,1);
    // A restrained cone below the dispatch worklight. Near wall and infantry
    // depth-test in front. The arresting ruby tubing has no floating halo.
    put(8.30,.18,-18.85,.04,2.25,-.58,.85,.35,.19,.27,.38,.49);
  }else{
    // Three depth slices of the same pool of damp air. Not camera-facing:
    // trunks enter different layers, the village occludes them, and the
    // wisps slide behind the nearby roofs as the driver crosses the bridge.
    // The old R3 daylight plate scatters pearl-sage light below the canopy;
    // let the warm sky show *above* it instead of turning every trunk gold.
    const bed=(distance:number,halfWidth:number,height:number,amount:number,ink:number[],phase:number)=>{
      const start=xyz.length/3,segments=64;
      for(let i=0;i<=segments;i++){
        const u=i/segments*2-1,x=u*halfWidth;
        const z=distance-distance*.28*u*u+3.2*Math.sin(u*5.1+phase)+1.3*Math.cos(u*9.-phase);
        const floor=terrainReliefHeight(x,z)-.32;
        const crown=height*(.93+.10*Math.sin(u*4.+phase)+.07*Math.cos(u*9.4-phase))-1.7-floor;
        for(const v of [0,1]){
          xyz.push(x,floor+v*crown,z);
          style.push(u,v,crown,amount);shafts.push(0,1,0);tint.push(ink[0],ink[1],ink[2]);drift.push(4);
        }
        if(i){const k=start+(i-1)*2;index.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
    };
    // Farthest to nearest for alpha blending; daylight only and still a
    // single draw with the existing canopy shafts. Colors are linear RGB.
    bed(88,111,25,.72,[.35,.46,.445],.3);
    bed(63,88,17.8,.57,[.405,.51,.46],2.6);
    bed(47,69,10.8,.35,[.32,.415,.365],4.4);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  geometry.setAttribute('style',new THREE.Float32BufferAttribute(style,4));geometry.setIndex(index);
  geometry.setAttribute('airTint',new THREE.Float32BufferAttribute(tint,3));
  geometry.setAttribute('shaftAxis',new THREE.Float32BufferAttribute(shafts,3));
  geometry.setAttribute('driftBank',new THREE.Float32BufferAttribute(drift,1));
  const material=new THREE.ShaderMaterial({
    side:THREE.DoubleSide,forceSinglePass:true,transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{elapsed:{value:0},night:{value:night?1:0}},
    vertexShader:`
      attribute vec4 style; attribute vec3 airTint,shaftAxis; attribute float driftBank; varying float mist;
      varying vec2 brush,span; varying float opacity; varying vec2 world; varying vec3 ink;
      void main(){
        vec3 axis=normalize(shaftAxis);ink=airTint;mist=driftBank;
        vec3 eye=position-cameraPosition;
        vec3 sideways=cross(axis,normalize(eye));
        float side=smoothstep(.12,.72,length(sideways));
        vec3 p=position+sideways/max(length(sideways),.001)*style.x*style.z;
        brush=style.xy;span=vec2(style.x*style.z,style.z);
        if(driftBank>3.5)p=position;
        world=p.xz;opacity=style.w*(driftBank>3.5?1.:side*smoothstep(2.,8.,length(eye)));
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
      }`,
    fragmentShader:`
      uniform float elapsed,night; varying vec2 brush,world,span; varying float opacity; varying vec3 ink; varying float mist;
      float mistHash(vec2 cell){
        vec3 p=fract(cell.xyx*vec3(.1031,.1030,.0973));
        p+=dot(p,p.yzx+33.33);
        return fract((p.x+p.y)*p.z);
      }
      float mistNoise(vec2 p){
        vec2 c=floor(p), f=fract(p);
        f=f*f*(3.-2.*f);
        return mix(mix(mistHash(c),mistHash(c+vec2(1,0)),f.x),
                   mix(mistHash(c+vec2(0,1)),mistHash(c+1.),f.x),f.y);
      }
      void main(){
        vec2 p=floor(world*6.)/6.;
        float flow=sin(dot(p,vec2(.45,.76))+elapsed*.19)
          +.46*sin(dot(p,vec2(-.82,1.13))-elapsed*.11);
        float fringe=1.-smoothstep(.09,1.,abs(brush.x+flow*.085));
        float ends=smoothstep(0.,.25,brush.y)*(1.-smoothstep(.68,1.,brush.y));
        float alpha=opacity*fringe*ends*(.77+.22*flow);
        vec3 tint=ink;
        if(mist>3.5){
          // A broad lit bed with a feathered, broken upper surface. Long
          // wavelengths do the composition; the quiet shorter curl exists
          // only to stop a horizontal stripe from following the driver.
          vec2 drift=vec2(-elapsed*.075,elapsed*.027);
          float roll=mistNoise(world*vec2(.042,.051)+drift*.045);
          float curl=mistNoise(world*.13+vec2(roll*.9,brush.y*1.8)+drift*.08);
          float lift=.55+.21*(roll-.5)+.12*(curl-.5);
          float height=1.-smoothstep(lift-.28,lift+.35,brush.y);
          float lip=smoothstep(-.10,.30,brush.y);
          float edge=1.-smoothstep(.64,1.,abs(brush.x));
          float local=smoothstep(8.,23.,length(world-cameraPosition.xz));
          // Each cross-section meets the real ground. A sheet with nonzero
          // density at that contact prints its intersection as a ruler-straight
          // colour change across the road on the far side of the bridge.
          float clearance=brush.y*span.y-.32;
          float toe=smoothstep(.05,2.8+1.9*roll+.9*curl,clearance);
          // Open low gaps through the woods; their axes shear *between*
          // slices rather than cutting matching holes out of all three.
          float a=(world.x+24.-.37*(world.y-61.))/14.;
          float b=(world.x-33.+.51*(world.y-61.))/11.;
          float gap=max(exp2(-a*a),exp2(-b*b));
          float shade=gap*(1.-.37*smoothstep(.29,.70,brush.y));
          alpha=opacity*edge*local*height*toe*(.83+.25*roll)*(1.-.43*shade);
          // The upper thickets break up the air too: offset their spaces
          // from the drainage gaps below so a row of trunks never reads as
          // silhouettes on one evenly filled bright horizontal rectangle.
          float upper=smoothstep(.18,.46,brush.y)*(1.-smoothstep(.69,.91,brush.y));
          float c=(world.x+8.+.41*(world.y-67.)+3.*(roll-.5))/12.;
          float d=(world.x-45.-.19*(world.y-61.))/13.5;
          float wooded=upper*max(exp2(-c*c),exp2(-d*d));
          alpha*=1.-.37*wooded;
          // A trace of straw-coloured transmitted sunlight just to the
          // sunward side, not a second horizon light or a glowing roof.
          float opening=exp2(-.0021*(world.x-15.)*(world.x-15.));
          tint*=vec3(1.+.17*opening,1.+.045*opening,1.-.070*opening)
            *(.87+.10*lip+.10*curl)*(1.-.16*shade);
          // Shift shaded scatter toward blue-sage at constant luminance
          // (dot(delta, Rec.709) is <.0001). This is sky fill between
          // trees, not a brighter bed or a cyan grade over the amber notch.
          float shelter=(1.-.90*opening)*(.60+.40*max(shade,wooded));
          tint+=shelter*vec3(-.038,.001,.102);
        }else if(mist>2.5){
          // Scattering peaks near the bulb and dissolves before the ground
          // pool. The actual spotlight supplies the light on solid objects.
          // Interpolate physical distance across the beam before dividing
          // by its radius. Interpolating -1..1 across a tapered quad kinks
          // the hotspot along the diagonal shared by its two triangles.
          float radial=span.x/span.y;
          float vapour=mistNoise(world*.95+vec2(-elapsed*.20,brush.y*2.6));
          float core=exp2(-5.5*radial*radial)*(1.-smoothstep(.65,1.,abs(radial)));
          alpha=opacity*core*smoothstep(0.,.26,brush.y)*(.38+.7*brush.y)
            *(.45+.74*vapour)*(1.-smoothstep(.91,1.,brush.y));
        }else if(mist>1.5){
          vec2 wind=vec2(-.31,.12)*elapsed;
          vec2 cell=floor(world*8.)*.125+wind;
          float roll=mistNoise(cell*.24+vec2(0.,brush.y*1.8));
          float curl=mistNoise(cell*.57+vec2(roll*1.7,brush.y*3.6));
          float crown=.17+.48*roll+.22*curl;
          float height=1.-smoothstep(crown-.16,crown+.14,brush.y);
          float hem=smoothstep(.01,.22,brush.y);
          float taper=1.-smoothstep(.25,1.,abs(span.x/span.y));
          alpha=opacity*taper*hem*height*(.32+.71*roll+.20*curl);
          tint*=.70+.42*smoothstep(.1,crown,brush.y)+.14*curl;
        }else if(mist>.5){
          vec2 grass=floor(world*2.)*.5;
          float w=sin(grass.x*.20+grass.y*.11+elapsed*.035)+.53*sin(grass.x*.46-grass.y*.13)+.26*cos(grass.x*.81);
          float hill=.43+.085*w+.09*sin(brush.x*5.7);
          float layer=(1.-smoothstep(hill-.10,hill+.47,brush.y))*smoothstep(-.15,.20,brush.y);
          float density=(.67+.12*w)*(.73+.27*smoothstep(-.7,.6,flow));
          alpha=opacity*(1.-smoothstep(.37,1.,abs(brush.x)))*layer*density;
        }
        gl_FragColor=vec4(tint,alpha);
        #include <colorspace_fragment>
      }`,
  });
  return {geometry,material};
}
export function GhostAir({night}:{night:boolean}){
  const {geometry,material}=useMemo(()=>makeAir(night),[night]);
  useEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
  useFrame((_,dt)=>{material.uniforms.elapsed.value+=Math.min(dt,.1);});
  return <mesh name={night?'mist-in-the-tree-breaks':'light-through-canopy-breaks'}
    geometry={geometry} material={material} frustumCulled={false} renderOrder={2} dispose={null}/>;
}
