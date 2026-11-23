import { useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

const clips = {
  rifle: {row:0, width:1.55, seconds:.32},
  claw:  {row:1, width:1.66, seconds:.48},
  cover: {row:2, width:1.40, seconds:.31},
  armor: {row:3, width:1.65, seconds:.30},
  undeadRifle: {row:5, width:2.25, seconds:.36},
  fatal: {row:0, width:3.25, seconds:.54},
  stain: {row:4, width:3.75, seconds:Infinity},
} as const;
type Contact = keyof typeof clips;
interface Stamp {kind:Contact; position:THREE.Vector3; born:number; serial:number; slopeX:number; slopeZ:number}

// Separate rings keep a burst of gunfire from recycling the aftermath of a casualty.
export function createInfantryContacts() {
  const slots=(count:number)=>Array.from({length:count},():Stamp=>({
    kind:'rifle',position:new THREE.Vector3(),born:-Infinity,serial:0,slopeX:0,slopeZ:0,
  }));
  const hits=slots(64), stains=slots(48);
  let hitIndex=0, stainIndex=0, serial=0;
  return {slots:[...hits,...stains], emit(kind:Contact,position:THREE.Vector3,slopeX=0,slopeZ=0){
    const slot=kind==='stain'?stains[stainIndex++ % stains.length]:hits[hitIndex++ % hits.length];
    slot.kind=kind; slot.position.copy(position); slot.born=performance.now();
    slot.serial=++serial; slot.slopeX=slopeX; slot.slopeZ=slopeZ;
  }};
}

export function InfantryContactArt({feed}:{feed:ReturnType<typeof createInfantryContacts>}) {
  const atlas=useLoader(THREE.TextureLoader,'/images/textures/infantry-contacts-pixelfx.png');
  const uniforms=useMemo(()=>{
    atlas.colorSpace=THREE.SRGBColorSpace;
    atlas.minFilter=atlas.magFilter=THREE.NearestFilter;
    atlas.generateMipmaps=false; atlas.needsUpdate=true;
    return {atlas:{value:atlas}};
  },[atlas]);
  const geometry=useMemo(()=>{
    const quad=new THREE.PlaneGeometry(1,1), g=new THREE.InstancedBufferGeometry();
    g.setIndex(quad.index); g.setAttribute('position',quad.getAttribute('position')); g.setAttribute('uv',quad.getAttribute('uv'));
    for(const [name,size] of [['contact',4],['style',4],['slope',2]] as const){
      g.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(feed.slots.length*size),size)
        .setUsage(THREE.DynamicDrawUsage));
    }
    g.instanceCount=0;return g;
  },[feed]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useFrame(()=>{
    const now=performance.now(), contact=geometry.getAttribute('contact'), style=geometry.getAttribute('style'), slope=geometry.getAttribute('slope');
    let count=0;
    for(const s of feed.slots){
      const age=(now-s.born)/1000,clip=clips[s.kind];
      if(age>=clip.seconds)continue;
      const mark=s.kind==='stain', frame=mark?s.serial%4:Math.min(11,Math.floor(age/clip.seconds*12));
      const angle=mark?s.serial*2.40:0,width=clip.width*(mark?Math.min(1,.34+age*1.65):1);
      contact.setXYZW(count,s.position.x,s.position.y,s.position.z,frame);
      style.setXYZW(count,clip.row,width,mark?Math.cos(angle):s.serial%2?1:-1,Math.sin(angle));
      slope.setXY(count,s.slopeX,s.slopeZ);count++;
    }
    geometry.instanceCount=count;
    if(count)contact.needsUpdate=style.needsUpdate=slope.needsUpdate=true;
  });
  return <mesh name="infantry-contact-art" frustumCulled={false} renderOrder={77}>
    <primitive object={geometry} attach="geometry"/>
    <shaderMaterial uniforms={uniforms} transparent depthWrite={false} side={THREE.DoubleSide} forceSinglePass
      vertexShader={`
        attribute vec4 contact,style;
        attribute vec2 slope;
        varying vec2 tileUv;
        varying float groundMark, impactLight;
        void main(){
          vec2 p=position.xy*style.y;
          groundMark=float(style.x==4.);
          bool undeadHit=style.x==5.;
          impactLight=undeadHit ? 1.-smoothstep(1.,5.,contact.w) : 0.;
          vec4 eye=modelViewMatrix*vec4(contact.xyz,1.);
          if(groundMark>.5){
            vec2 ground=mat2(style.z,style.w,-style.w,style.z)*(p*vec2(1.22,1.0));
            eye.xyz+=mat3(viewMatrix)*vec3(ground.x,.015+dot(ground,slope),ground.y);
          }else{
            eye.xy+=vec2(p.x*style.z,p.y);
            eye.z+=.13;
          }
          gl_Position=projectionMatrix*eye;
          tileUv=(vec2(contact.w,4.-(undeadHit ? 0. : style.x))+clamp(uv,.0053,.9947))/vec2(12.,5.);
        }`}
      fragmentShader={`
        uniform sampler2D atlas;
        varying vec2 tileUv;
        varying float groundMark, impactLight;
        void main(){
          vec4 ink=texture2D(atlas,tileUv);
          if(ink.a<.04)discard;
          ink.rgb += vec3(.96,.43,.19)*impactLight*smoothstep(.20,.66,ink.r);
          if(groundMark>.5){
            // Preserve the atlas shadow and give the raised wet ridges a warmer catchlight.
            float ridge=smoothstep(.15,.40,ink.r);
            ink.rgb=mix(ink.rgb*vec3(1.30,.77,.63),vec3(.69,.050,.046),ridge*.88);
          }
          gl_FragColor=ink;
          #include <colorspace_fragment>
        }`}/>
  </mesh>;
}
