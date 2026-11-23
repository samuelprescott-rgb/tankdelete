import {useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as T from 'three';

type Stamp=(x:number,y:number,z:number,yaw:number,track:boolean)=>void;
const fields=new WeakMap<T.Object3D,Stamp>();
export function fieldBlood(parent:T.Object3D,at:T.Vector3,yaw:number,track=false){
  let root=parent;
  while(root.parent)root=root.parent;
  fields.get(root)?.(at.x,at.y,at.z,yaw,track);
}

export function FieldBlood({ground}:{ground:(x:number,z:number)=>number}){
  const scene=useThree(s=>s.scene),mesh=useRef<T.InstancedMesh>(null);
  const pool=useMemo(()=>Array.from({length:64},()=>({age:Infinity,x:0,y:0,z:0,yaw:0,track:false,seed:0})),[]);
  const stamp=useMemo(()=>new T.Object3D(),[]);
  const geometry=useMemo(()=>{
    const g=new T.PlaneGeometry(1,1).rotateX(-Math.PI/2);
    g.setAttribute('mark',new T.InstancedBufferAttribute(new Float32Array(pool.length*3),3));
    return g;
  },[pool]);
  useLayoutEffect(()=>{
    let serial=0;
    fields.set(scene,(x,y,z,yaw,track)=>{
      const mark=pool[serial%pool.length];
      Object.assign(mark,{age:0,x,y:Math.max(y,ground(x,z))+.019,z,yaw,track,seed:++serial});
    });
    return ()=>{fields.delete(scene);};
  },[scene,pool,ground]);
  useFrame((_,dt)=>{
    const m=mesh.current;if(!m)return;
    const attr=geometry.getAttribute('mark') as T.InstancedBufferAttribute;
    let count=0;
    for(const p of pool){
      if(p.age>=7)continue;
      p.age+=dt;
      const size=.56+.44*T.MathUtils.smoothstep(p.age,0,.58);
      stamp.position.set(p.x,p.y,p.z);stamp.rotation.y=p.yaw;
      stamp.scale.set((p.track?1.30:1.02)*size,1,(p.track?1.83:.81)*size);
      stamp.updateMatrix();m.setMatrixAt(count,stamp.matrix);
      attr.setXYZ(count++,1-T.MathUtils.smoothstep(p.age,5,7),p.seed,Number(p.track));
    }
    m.count=count;m.visible=count>0;
    if(count){attr.needsUpdate=true;m.instanceMatrix.needsUpdate=true;}
  });
  return <instancedMesh ref={mesh} name="field-blood-marks" args={[geometry,undefined,pool.length]} count={0} frustumCulled={false} renderOrder={2}>
    <shaderMaterial transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2}
      vertexShader={`attribute vec3 mark;varying vec3 paint;varying vec2 cell;
      void main(){paint=mark;cell=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`}
      fragmentShader={`varying vec3 paint;varying vec2 cell;
      void main(){vec2 p=(floor(cell*24.)+.5)/24.*2.-1.;
      float a=atan(p.y,p.x),r=length(p),s=paint.y;
      float edge=.60+.12*sin(3.*a+s)+.08*cos(5.*a+s*.7)+.06*sin(9.*a+s);
      float scuff=paint.z*step(.40,abs(p.x))*step(.54,fract(p.y*4.+.2))*0.19;
      if(r+scuff>edge && !(r<edge+.22 && fract(sin(dot(floor(cell*24.),vec2(13.1,87.3))+s)*1024.)>.92))discard;
      vec3 ink=mix(vec3(.088,.007,.010),vec3(.175,.017,.018),step(edge*.66,r+.06*sin(p.y*12.)));
      gl_FragColor=vec4(ink,paint.x*.90);
      #include <colorspace_fragment>
      }`}/>
  </instancedMesh>;
}
