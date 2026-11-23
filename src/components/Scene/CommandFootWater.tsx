import {useEffect,useMemo,useRef,type RefObject} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {COMMAND_SLAB_TOP,newCommandWalk,onCommandWetApron} from './commandBody';
const LIFE=.46;
// Two tiny depth-tested patches, only mounted in the actual boss wave. Rings
// stay at each physical plant in world space and vanish before the next stride.
export function CommandFootWater({walk,boss}:{walk:ReturnType<typeof newCommandWalk>;boss:RefObject<THREE.Group|null>}){
 const mesh=useRef<THREE.InstancedMesh>(null),clock=useRef({key:'',event:[0,0],elapsed:[LIFE,LIFE],
   x:[Infinity,Infinity],z:[Infinity,Infinity],pressure:[0,0]});
 const ink=useMemo(()=>{
  const g=new THREE.PlaneGeometry(2.6,2.6).rotateX(-Math.PI/2),a=new THREE.InstancedBufferAttribute(new Float32Array([1,1]),1);
  const pressure=new THREE.InstancedBufferAttribute(new Float32Array(2),1);pressure.setUsage(THREE.DynamicDrawUsage);
  a.setUsage(THREE.DynamicDrawUsage);g.setAttribute('commandStepAge',a);g.setAttribute('commandPressure',pressure);
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
   vertexShader:`attribute float commandStepAge;attribute float commandPressure;varying vec2 xy;varying float age;varying float load;
    void main(){xy=2.*uv-1.;age=commandStepAge;load=commandPressure;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec2 xy;varying float age;varying float load;
    void main(){if(age>=1.&&load<.01)discard;vec2 p=xy*vec2(1.18,.96);float a=atan(p.y,p.x),r=length(p);
     float crest=.18+.62*(1.-(1.-age)*(1.-age));float broken=smoothstep(-.24,.34,sin(a*3.+.7)+.41*sin(a*7.));
     float ring=(1.-smoothstep(.015,.064,abs(r-crest)))*broken;
     float lip=(1.-smoothstep(.012,.043,abs(r-(crest-.12))))*smoothstep(.03,.6,sin(2.*a-.9));
     float press=exp(-14.*dot(p,p))*max(0.,1.-age*3.);
     vec2 pad=(p-vec2(0.,-.02))*vec2(3.9,1.68);float contact=load*.52*(1.-smoothstep(.20,1.,length(pad)));
     float crestInk=(ring*.66+lip*.33+press*.48)*(1.-age)*(1.-age*.38);
     float alpha=max(crestInk,contact);
     if(alpha<.015)discard;
     vec3 col=mix(vec3(.034,.038,.043),mix(vec3(.32,.41,.44),vec3(.53,.43,.32),max(0.,sin(a-.45))*.50),max(ring,lip));
     gl_FragColor=vec4(mix(vec3(.014,.017,.019),col,clamp(crestInk/max(alpha,.001),0.,1.)),alpha);
     #include <colorspace_fragment>
    }`});
  return {g,m,a,pressure,d:new THREE.Object3D()};
 },[]);
 useEffect(()=>()=>{ink.g.dispose();ink.m.dispose();},[ink]);
 useFrame((_,dt)=>{
  const o=mesh.current;if(!o)return;const pulse=clock.current;
  if(!boss.current?.visible||walk.key!==pulse.key){pulse.key=walk.key;
   for(let i=0;i<2;i++){pulse.event[i]=walk.feet[i].landing;pulse.elapsed[i]=LIFE;ink.a.setX(i,1);
    pulse.x[i]=Infinity;pulse.pressure[i]=0;ink.pressure.setX(i,0);}
   ink.a.needsUpdate=ink.pressure.needsUpdate=true;o.visible=false;return;
  }
  let active=false,dirty=false;
  for(let i=0;i<2;i++){
   const f=walk.feet[i],x=f.world.x-.30*Math.sin(f.yaw),z=f.world.z-.30*Math.cos(f.yaw);
   if(pulse.event[i]!==f.landing){
    pulse.event[i]=f.landing;
    if(onCommandWetApron(x,z)&&Math.abs(f.world.y-walk.floorY)<.09){
     pulse.elapsed[i]=0;pulse.x[i]=x;pulse.z[i]=z;ink.d.position.set(x,COMMAND_SLAB_TOP+.012,z);ink.d.rotation.y=f.yaw+(i?.09:-.09);
     ink.d.updateMatrix();o.setMatrixAt(i,ink.d.matrix);o.instanceMatrix.needsUpdate=true;
    }
   }
   if(pulse.elapsed[i]<LIFE){
    pulse.elapsed[i]=Math.min(LIFE,pulse.elapsed[i]+Math.min(dt,.06));ink.a.setX(i,pulse.elapsed[i]/LIFE);
    dirty=true;active||=pulse.elapsed[i]<LIFE;
   }
   // A dark wet contact patch remains ONLY under the bearing sole. Both
   // it and the travelling crest use the same two quads, never a trail.
   const load=Math.hypot(x-pulse.x[i],z-pulse.z[i])<.12?1-THREE.MathUtils.smoothstep(Math.abs(f.world.y-walk.floorY),.012,.11):0;
   if(Math.abs(load-pulse.pressure[i])>.01){pulse.pressure[i]=load;ink.pressure.setX(i,load);ink.pressure.needsUpdate=true;}
   active||=load>.01;
  }
  if(dirty)ink.a.needsUpdate=true;o.visible=active;
 });
 return <instancedMesh ref={mesh} args={[ink.g,ink.m,2]} name="command-sole-water-contact" visible={false} frustumCulled={false} renderOrder={3} dispose={null}/>;
}
