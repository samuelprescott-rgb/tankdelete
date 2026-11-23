import { reflectWeapons } from './weaponWater';
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {eclipseReflectionGLSL} from './hordeEclipse';
import {WET_CREST_GLSL} from './wetCourtFracture';

/** Rain is scenery in world space. The box wraps outside the view, not on
 * the screen; walls, awnings and the tank can actually hide the drops. */
function createRain() {
  const positions: number[] = [], seeds: number[] = [], indices: number[] = [], families:number[]=[];
  let seed = 1968;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const filament=(sx:number,sy:number,sz:number,jitter:number,family=0)=>{
    const n=positions.length/3;
    for (const [x,y] of [[-1,0],[1,0],[-1,1],[1,1]]) {
      positions.push(x,y,0); seeds.push(sx,sy,sz,jitter);families.push(family);
    }
    indices.push(n,n+1,n+2,n+2,n+1,n+3);
  };
  // One world-space drizzle everywhere. Two independently jittered drops per
  // 2.4 m cell avoid both sparse headings and coincident twins. Wind advects
  // the whole field together, so its horizontal density holds over time.
  for(let z=0;z<20;z++)for(let x=0;x<20;x++)for(let layer=0;layer<2;layer++){
    filament((x+.04+.92*rand())*2.4,(layer+rand())*7.5,(z+.04+.92*rand())*2.4,rand());
  }
  // Only the little pavement impacts are tied to the open paving; the
  // practicals tint drops that are already there rather than spawning more.
  for(let i=0;i<48;i++){
    const x=-11.0+rand()*22,z=-21.0+rand()*7.0,phase=rand(),key=rand();
    filament(x,phase,z,key,2);filament(x,phase,z,key,3);
  }
  seed=3686160304; // Keep the eleven established puddle masks independent of drop counts.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('drop',new THREE.Float32BufferAttribute(seeds,4));
  geo.setAttribute('family',new THREE.Float32BufferAttribute(families,1));
  geo.setIndex(indices);
  const mat = new THREE.ShaderMaterial({
    transparent:true, depthTest:true, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true,
    uniforms:{ elapsed:{value:0} },
    vertexShader:`
      uniform float elapsed;
      attribute vec4 drop;
      attribute float family;
      varying float opacity;
      varying vec2 stroke;
      varying vec3 litRain;
      void main(){
        float speed=6.4+1.8*drop.w;
        vec3 p=drop.xyz+vec3(.68,-speed,.19)*elapsed;
        p.xz=cameraPosition.xz+mod(p.xz-cameraPosition.xz+24.0,48.0)-24.0;
        p.y=mod(p.y,15.0)+.018;
        float b=fract(drop.w*9.37);
        float splash=fract(elapsed*(1.47+b)+drop.y), bounce=4.*splash*(1.-splash);
        if(family>1.5){float dir=family>2.5?1.:-1.;
          p=vec3(drop.x+dir*splash*(.045+.066*b),.049+bounce*(.035+.057*drop.w),drop.z+splash*(b-.5)*.10);}
        vec4 head=viewMatrix*vec4(p,1.);
        float depth=max(.1,-head.z);
        float kind=fract(drop.y*.67+drop.z*.19);
        float span=min(.15+.14*kind+.047*drop.w,depth*(.012+.009*kind));
        vec3 tail=vec3(-.68/speed,1.,-.19/speed)*span*position.y;
        if(family>1.5)tail=vec3((family>2.5?1.:-1.)*.034,.026-bounce*.034,.008)*position.y;
        vec4 mv=head+viewMatrix*vec4(tail,0.);
        // A close drop should not project into a thick post. The cap is
        // angular, not a screen-space rain layer; depth/occlusion stay real.
        float halfWidth=clamp(.0048+.0035*kind,depth*.00042,depth*(.00058+.00024*kind));
        mv.x+=position.x*halfWidth;
        stroke=position.xy;
        float door=1.-smoothstep(0.,1.,length((p-vec3(.05,2.82,-21.3))/vec3(5.8,5.6,5.4)));
        float lamp=1.-smoothstep(0.,1.,length((p-vec3(8.34,2.8,-18.96))/vec3(3.2,4.2,4.0)));
        float fire=1.-smoothstep(0.,1.,length((p-vec3(3.8,2.6,-21.75))/vec3(3.5,5.6,4.2)));
        float sideLight=max(door,max(fire,lamp));
        float sky=smoothstep(.3,7.5,p.y);
        litRain=mix(vec3(.145,.208,.285),vec3(.235,.31,.405),sky);
        litRain=mix(litRain,vec3(.50,.34,.22),max(door,fire));
        litRain=mix(litRain,vec3(.31,.42,.54),lamp);
        float range=distance(cameraPosition.xz,p.xz);
        float visibleRange=1.-smoothstep(16.,23.,range);
        // A minority of nearer drops hold a silver edge. Keep their key
        // tied to the actual drop, not the screen or the direction of view.
        float catchLight=smoothstep(.61,.83,kind)*(1.-smoothstep(12.,19.,depth));
        litRain=mix(litRain,mix(vec3(.59,.68,.79),vec3(.86,.66,.48),max(door,fire)),catchLight*.70);
        opacity=(.30+.28*kind+.10*sideLight)*smoothstep(1.,2.8,depth)*visibleRange*
          smoothstep(.01,.13,p.y)*(1.-smoothstep(14.,15.,p.y));
        if(family>1.5)opacity=(.17+.19*sideLight)*visibleRange*(1.-smoothstep(.26,.58,splash));
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      varying float opacity;
      varying vec2 stroke;
      varying vec3 litRain;
      void main(){
        float taper=smoothstep(0.,.11,stroke.y)*(1.-smoothstep(.25,1.,stroke.y));
        float edge=1.-.64*smoothstep(.32,1.,abs(stroke.x));
        gl_FragColor=vec4(litRain,opacity*edge*taper);
        #include <colorspace_fragment>
      }`,
  });
  // Local gathers on the open apron, not an additive screen sheen. Positions
  // avoid the three archive interiors. Fixed masks ripple in stepped rings;
  // amber is a broken reflection near the already-lit doors only.
  const pondPosition:number[]=[], pondCoord:number[]=[], pondKey:number[]=[], pondIndices:number[]=[];
  for(const [x,z,w,d,lamp] of [
    [-9.4,-17.3,1.95,.73,.56],[-10.5,-15.6,.94,.38,.25],
    [.53,-20.6,1.85,1.13,.82],[-.84,-17.5,1.12,.56,.41],[1.33,-15.65,1.35,.54,.33],
    [9.7,-18.2,1.4,.78,.62],[8.8,-16.3,.9,.45,.22],[-5.6,-15.0,1.55,.59,0],
    [5.15,-18.7,.94,.62,0],[-4.7,-20.25,1.13,.65,0],[3.1,-14.18,.89,.46,0],
  ]){
    const id=pondPosition.length/3, k=rand();
    for(const [u,v] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      pondPosition.push(x+u*w,.042,z+v*d);pondCoord.push(u,v);pondKey.push(k,lamp);
    }
    pondIndices.push(id,id+2,id+1,id+2,id+3,id+1);
  }
  const apron=new THREE.BufferGeometry();
  apron.setAttribute('position',new THREE.Float32BufferAttribute(pondPosition,3));
  apron.setAttribute('pondCoord',new THREE.Float32BufferAttribute(pondCoord,2));
  apron.setAttribute('pondKey',new THREE.Float32BufferAttribute(pondKey,2));
  apron.setIndex(pondIndices);apron.computeBoundingSphere();
  const puddle=new THREE.ShaderMaterial({
    uniforms:mat.uniforms, transparent:true,depthWrite:false,
    vertexShader:`attribute vec2 pondCoord,pondKey; varying vec2 uvP,key,world;
      void main(){uvP=pondCoord;key=pondKey;world=position.xz;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float elapsed;varying vec2 uvP,key,world;
      ${WET_CREST_GLSL}
      ${eclipseReflectionGLSL}
      float hash(vec2 p){return fract(sin(dot(p,vec2(91.3,43.7)))*1564.53);}
      void main(){
        vec2 px=floor(world*24.)/24.;vec2 q=floor(uvP*18.)/18.;
        float shore=dot(q,q)+.19*sin(8.*q.y+15.*key.x)+.11*cos(9.*q.x-5.*q.y);
        if(shore>.88)discard;
        vec2 cells=px*2.4, id=floor(cells); float n=hash(id);
        vec2 delta=fract(cells)-vec2(.36+.22*n,.40+.15*hash(id.yx+.2));
        float phase=fract(elapsed*(.52+n*.24)+n*31.);
        float r=max(abs(delta.x),abs(delta.y))+.42*min(abs(delta.x),abs(delta.y));
        float ring=step(abs(r-(.055+.33*phase)),.06)*step(phase,.52)*step(.52,n);
        float wetLip=(1.-smoothstep(.55,.88,shore))*(.79+.21*hash(floor(px*3.7)));
        float mirror=key.y*max(0.,1.-abs(q.x+.16*sin(q.y*12.+key.x*5.))*1.85)
          *waterCrest(world,key.x+13.)*wetLip*(.72+.28*sin(elapsed*1.3+q.y*8.));
        vec3 ink=mix(vec3(.026,.061,.074),vec3(.37,.215,.085),mirror);
        vec3 eyeRay=normalize(vec3(world.x,.042,world.y)-cameraPosition);
        vec3 reflected=reflect(eyeRay,normalize(vec3(.035*(n-.5),1.,.045*(ring-.3))));
        ink+=wetEclipse(reflected,waterCrest(world,key.x+13.))*wetLip*(1.-mirror);
        gl_FragColor=vec4(mix(ink,vec3(.16,.25,.26),ring*.64),.69*(.46+.54*wetLip));
        #include <colorspace_fragment>
      }`,
  });
  reflectWeapons(puddle,'vec3(world.x,.05,world.y)','wetLip',true);
  return {geo,mat,apron,puddle};
}

export function GhostHordeRain() {
  const {geo,mat,apron,puddle}=useMemo(createRain,[]);
  useEffect(()=>()=>{geo.dispose();mat.dispose();apron.dispose();puddle.dispose();},[geo,mat,apron,puddle]);
  useFrame((_,dt)=>{mat.uniforms.elapsed.value+=Math.min(dt,.1);});
  return <group dispose={null}>
    <mesh name="ghost-signal-horde-rain" geometry={geo} material={mat}
      frustumCulled={false} renderOrder={5} />
    <mesh name="ghost-signal-rain-gathers" geometry={apron} material={puddle} renderOrder={2} />
  </group>;
}
