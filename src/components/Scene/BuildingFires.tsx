import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as T from 'three';
import { useFireSmokeArt } from './CharcoalCloud';
import { SMOKE_FOLDS } from './pixelSmokeFold';
import { createFireSmokePlume, updateFireSmokePlume } from './cloudDensity';
import { PixelFireVolume } from './PixelFireVolume';
import { buildingFireFoot } from './buildingFireFoot';
import type { GhostSkin } from './ghostHutSurface';

export interface BurningSurface {point:T.Vector3; outward:T.Vector3; started:number; until:number}
const MAX_BUILDINGS=8;
const smokeSlots=Array.from({length:MAX_BUILDINGS},(_,i)=>i);
const hutSmokeScale=[3.1/3.4,3.55/6.5,2.1/3.4] as const;
type FileMeshRef = {current:T.InstancedMesh | null};

function findFireFoot(scene:T.Scene, key:string, rubble:boolean, hit:T.Vector3, huts:readonly FileMeshRef[]) {
  if (key.startsWith('file:')) {
    const path = key.slice(5);
    for (const {current:batch} of huts) {
      if (!batch) continue;
      const skin:GhostSkin | undefined = batch.userData.ghostHutSkin;
      const entry = skin?.entries.find(e => e.block.path === path);
      if (!entry) continue;
      batch.updateWorldMatrix(true, false);
      const world = new T.Matrix4();
      batch.getMatrixAt(entry.index, world);
      return buildingFireFoot(batch.geometry, world.premultiply(batch.matrixWorld), hit);
    }
    return;
  }
  const name = key === 'landing' ? (rubble ? 'far-bank-landing-ruins' : 'far-bank-fishing-landing')
    : key === 'radioHut' ? (rubble ? 'rear-radio-collapsed-walls' : 'rear-radio-intact-walls') : key;
  const mesh = scene.getObjectByName(name) as T.Mesh | undefined;
  if (!mesh?.isMesh) return;
  mesh.updateWorldMatrix(true, false);
  return buildingFireFoot(mesh.geometry, mesh.matrixWorld, hit);
}

export function BuildingFires({fires,blocks,ruins,fileMeshes}:{fires:Map<string,BurningSurface>;
  blocks:readonly {path:string}[]; fileMeshes:{current:readonly FileMeshRef[]}; ruins:{landing:boolean;radioHut:boolean}}) {
  const flames=useRef<T.InstancedMesh>(null);
  const smoke=useRef<(T.InstancedMesh|null)[]>([]);
  const art=useFireSmokeArt();
  const glow=useRef<T.PointLight>(null);
  const paths=useMemo(()=>new Set(blocks.map(b=>b.path)),[blocks]);
  const feet=useMemo(()=>new WeakMap<BurningSurface,{point:T.Vector3; rubble:boolean; folds:ReturnType<typeof createFireSmokePlume>}>(),[]);
  const stamp=useMemo(()=>new T.Object3D(),[]);
  useLayoutEffect(()=>{
    for(const mesh of smoke.current)mesh?.instanceMatrix.setUsage(T.DynamicDrawUsage);
  },[art]);
  useEffect(()=>()=>fires.clear(),[fires]);
  useFrame(({clock,camera,scene})=>{
    if(!flames.current || !glow.current)return;
    const now=performance.now(), time=clock.elapsedTime;
    let fireCount=0, nearest=Infinity;
    glow.current.intensity=0;
    for(const [key,fire] of fires){
      const remaining=(fire.until-now)/1000, age=(now-fire.started)/1000;
      if(remaining<=0 || (key.startsWith('file:')&&!paths.has(key.slice(5)))){fires.delete(key);continue;}
      if(fireCount>=MAX_BUILDINGS)continue;
      const rubble=(key==='landing'&&ruins.landing)||(key==='radioHut'&&ruins.radioHut);
      let foot = feet.get(fire);
      if (!foot || foot.rubble !== rubble) {
        const point = findFireFoot(scene, key, rubble, fire.point, fileMeshes.current);
        if (!point) continue;
        const phase=Math.abs(Math.sin(point.x*.73+point.z*.39))*4;
        foot = {point,rubble,folds:createFireSmokePlume(phase,.30/hutSmokeScale[0],.12/hutSmokeScale[2])};
        feet.set(fire, foot);
      }
      const base = foot.point;
      const nx=fire.outward.x,nz=fire.outward.z;
      const growth=.30+.70*T.MathUtils.smoothstep(age,0,.72);
      const fade=Math.min(1,remaining);
      // The broad bed lies along the hit wall; each cel carries its own
      // rising tongues, torn-off sparks and openings through to the timber.
      stamp.rotation.set(0,Math.atan2(nx,nz),0);
      stamp.position.copy(base);
      stamp.scale.set(3.15*growth*fade,3.30*growth*fade,1.52*growth*fade);
      stamp.updateMatrix();flames.current.setMatrixAt(fireCount,stamp.matrix);
      const plume=smoke.current[fireCount++];
      if(plume){
        plume.position.set(base.x,base.y+1.28*growth,base.z);
        plume.rotation.y=stamp.rotation.y;
        updateFireSmokePlume(plume,foot.folds,age,time,Math.min(1,remaining));
        plume.visible=plume.count>0;
      }
      const distance=camera.position.distanceToSquared(base);
      if(distance<nearest){
        nearest=distance;
        glow.current.position.set(base.x+nx*.48,base.y+.65,base.z+nz*.48);
        glow.current.intensity=(8+.8*Math.sin(time*8.4))*growth*fade;
      }
    }
    flames.current.count=fireCount;
    for(let i=fireCount;i<smoke.current.length;i++){
      const mesh=smoke.current[i];
      if(mesh){mesh.count=0;mesh.visible=false;}
    }
    if(fireCount)flames.current.instanceMatrix.needsUpdate=true;
  });
  return <>
    <PixelFireVolume meshRef={flames} name="building-contact-flames" capacity={MAX_BUILDINGS} count={0}/>
    {smokeSlots.map(i=><instancedMesh key={i} name={i===0?'building-contact-soot':`building-contact-soot-${i}`}
      ref={mesh=>{smoke.current[i]=mesh;}} args={[art.geometry,art.material,SMOKE_FOLDS]} scale={hutSmokeScale}
      visible={false} count={0} frustumCulled={false} renderOrder={5}/>)}
    <pointLight ref={glow} color="#ffa34d" intensity={0} distance={6} decay={2}/>
  </>;
}
