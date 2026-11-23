import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as T from 'three';
import {paintCharacterFlame,relayCombustionCel} from './relayCombustionCel';

interface CharacterBurn {
  started:number; until:number; anchor:T.Vector3; scale:number; posed:boolean;
}
export type CharacterBurns=Map<string,CharacterBurn>;

/** Refresh one visual on an accepted flame hit. Damage remains owned by combat. */
export function igniteCharacter(burns:CharacterBurns,id:string,alive:boolean){
  if(!alive){burns.delete(id);return;}
  const now=performance.now();
  const current=burns.get(id);
  if(current)current.until=now+1450;
  else burns.set(id,{started:now,until:now+1450,anchor:new T.Vector3(),scale:1,posed:false});
}

/** Called with the same transform that draws this actor's shoulder this frame. */
export function seatCharacterFlame(burn:CharacterBurn,matrix:T.Matrix4,x:number,y:number,z:number){
  burn.anchor.set(x,y,z).applyMatrix4(matrix);
  burn.scale=matrix.getMaxScaleOnAxis();
  burn.posed=true;
}

export function CharacterFires({burns,capacity}:{burns:CharacterBurns;capacity:number}){
  const meshes=useRef<(T.InstancedMesh|null)[]>([]);
  const art=useMemo(()=>Array.from({length:4},(_,i)=>relayCombustionCel('wake',i)),[]);
  const ink=useMemo(()=>new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,toneMapped:false,fog:false}),[]);
  const stamp=useMemo(()=>new T.Object3D(),[]);
  useEffect(()=>()=>{art.forEach(g=>g.dispose());ink.dispose();},[art,ink]);
  useFrame(({camera})=>{
    const now=performance.now();
    for(const mesh of meshes.current)if(mesh)mesh.count=0;
    for(const [id,burn] of burns){
      if(now>=burn.until){burns.delete(id);continue;}
      if(!burn.posed)continue;
      burn.posed=false;
      const age=(now-burn.started)/1000,fade=T.MathUtils.smoothstep(burn.until-now,0,340);
      stamp.position.copy(burn.anchor);
      const cel=paintCharacterFlame(stamp,camera,age,burn.scale*fade);
      const mesh=meshes.current[cel];
      if(!mesh||mesh.count>=capacity)continue;
      stamp.updateMatrix();mesh.setMatrixAt(mesh.count++,stamp.matrix);
    }
    for(const mesh of meshes.current)if(mesh){
      mesh.visible=mesh.count>0;
      if(mesh.visible)mesh.instanceMatrix.needsUpdate=true;
    }
  });
  return <>{art.map((g,i)=><instancedMesh key={i} name={'burning-character-cel-'+i} count={0}
    args={[g,ink,Math.max(1,capacity)]} visible={false} frustumCulled={false}
    ref={mesh=>{meshes.current[i]=mesh;}} raycast={()=>{}}/>)}</>;
}
