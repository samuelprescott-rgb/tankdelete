import { Component, Suspense, useEffect, useMemo, type ReactNode, type RefObject } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AUTHORED_HEAD_PATH } from './AuthoredInfantryHead';
import { applyPaintedFinish } from './paintedMaterials';
import { applyUndeadReadability } from './undeadReadability';

// Reuse the already shipped CC0 MakeHuman/Mindfront head and original UV image.
// One shared far-detail mesh replaces the existing instanced head draw; no
// per-zombie component, new download, extra draw call or per-frame allocation.
export const ZOMBIE_HEAD_SCALE: [number,number,number] = [1.5,1.55,1.25];
// Splayed orbital bones are part of the head sculpt. The original UV follows
// those bones; the two emissive pupils sit at the corresponding new centers.
const ORBIT_SPREAD = .012;
export const ZOMBIE_EYE_LOCAL: [number,number,number] = [.0293125*1.5+ORBIT_SPREAD,(.14164-.121)*1.55,(-.115405+.035)*1.25-.016];

export function createAuthoredZombieHeadAssets(source: THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>) {
  const geometry=source.geometry.clone();
  geometry.translate(0,-.121,.035).scale(...ZOMBIE_HEAD_SCALE);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const lowerCheek = 1 - THREE.MathUtils.smoothstep(Math.abs(y + 0.053), .021, .093);
    const cheekSide = THREE.MathUtils.smoothstep(Math.abs(x), .050, .107);
    const chin = 1 - THREE.MathUtils.smoothstep(y, -.143, -.074);
    // The concave cheeks and narrower jaw alter the actual face profile.
    const orbit = (1-THREE.MathUtils.smoothstep(Math.abs(Math.abs(x)-.044),.014,.047))
      * (1-THREE.MathUtils.smoothstep(Math.abs(y-.032),.022,.062))
      * THREE.MathUtils.smoothstep(-z,.045,.084);
    positions.setXYZ(i, x * (1 - .16 * lowerCheek * cheekSide - .10 * chin) + Math.sign(x)*ORBIT_SPREAD*orbit,
      y - .012 * chin * THREE.MathUtils.smoothstep(-z, .035, .087),
      z + .011 * lowerCheek * cheekSide);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material=source.material.clone();
  material.roughness=.98; material.metalness=0; material.vertexColors=false;
  material.onBeforeCompile=shader=>{
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vUndeadPigment;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUndeadPigment = position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vUndeadPigment;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        #ifdef USE_MAP
          vec3 skin=texture2D(map,vMapUv).rgb;
          float luminance=dot(skin,vec3(.2126,.7152,.0722));
          float cheek = max(0.0, 1.0 - length(vec2((abs(vUndeadPigment.x) - 0.085) / 0.047,
            (vUndeadPigment.y + 0.047) / 0.052)));
          float socket = 1.0 - smoothstep(0.65, 1.35, length(vec2((abs(vUndeadPigment.x) - 0.056) / 0.032,
            (vUndeadPigment.y - 0.031) / 0.033)));
          float faceFront = smoothstep(0.015, 0.088, -vUndeadPigment.z);
          vec3 pigment = mix(vec3(.46,.57,.52),vec3(1.03,1.02,.76),smoothstep(.07,.43,luminance));
          pigment = mix(pigment, pigment * vec3(.38,.48,.47), faceFront * max(cheek * .42, socket * .88));
          diffuseColor.rgb=mix(skin,vec3(luminance),.86)*pigment;
        #endif`);
  };
  material.customProgramCacheKey=()=> 'cc0-painted-undead-head-v3';
  applyPaintedFinish(material, { scale: 3.6, strength: 0.50, edge: 0.4 });
  applyUndeadReadability(material, 'skin');
  return {geometry,material,dispose:()=>{geometry.dispose();material.dispose();}};
}

function LoadedHead({headRef}:{headRef:RefObject<THREE.InstancedMesh|null>}) {
  const gltf=useLoader(GLTFLoader,AUTHORED_HEAD_PATH);
  const assets=useMemo(()=>{
    const source=gltf.scene.getObjectByName('head-far') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    if(!source?.isMesh||!source.material.map)throw new Error('Shared CC0 head asset is incomplete');
    return createAuthoredZombieHeadAssets(source);
  },[gltf]);
  // The cached model can resolve before a later sibling's host ref attaches.
  // A post-commit effect sees the real batch on both warm and cold loads.
  useEffect(()=>{
    const head=headRef.current;
    if(!head)return ()=>assets.dispose();
    const originalGeometry=head.geometry, originalMaterial=head.material;
    head.geometry=assets.geometry; head.material=assets.material; head.userData.authoredUndead=true;
    return ()=>{
      if(head.geometry===assets.geometry){head.geometry=originalGeometry;head.material=originalMaterial;}
      head.userData.authoredUndead=false;
      assets.dispose(); // Loader-owned source geometry, material and image stay alive.
    };
  },[assets,headRef]);
  return null;
}
class HeadBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?null:this.props.children;}
}
export function AuthoredZombieHead({headRef}:{headRef:RefObject<THREE.InstancedMesh|null>}) {
  return <HeadBoundary><Suspense fallback={null}><LoadedHead headRef={headRef}/></Suspense></HeadBoundary>;
}
