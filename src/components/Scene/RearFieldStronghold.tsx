import { memo, useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as T from 'three';
import { createStructureGeometry } from './FileBlocks';
import { configureVillageAtlas, VILLAGE_MATERIAL_ATLAS } from '../../lib/hutMaterials';
import { makeGhostRoundGeo } from './ghostRoundArt';
import { createFieldHutKit, createRearFieldGuardArt } from './rearFieldGuardGeometry';

type Point = [number,number,number];
export interface RearFieldStrongholdProps {
  hutPosition:Point; guardPosition:Point; guardHealth:number; guardMaxHealth:number;
  /** Absolute world yaw; the barrel points down -Z at zero. */
  turretYaw:number; firing:boolean; ready:boolean; opened:boolean;hutDestroyed?:boolean;
}

/** Presentation only. Discovery, radio permission, enemy hits and movement
 * all remain in the field runtime. This prop is never a simulated file. */
export const RearFieldStronghold=memo(function RearFieldStronghold({hutPosition,guardPosition,
  guardHealth,guardMaxHealth,turretYaw,firing,ready,opened,hutDestroyed=false}:RearFieldStrongholdProps){
  const paint=configureVillageAtlas(useLoader(T.TextureLoader,VILLAGE_MATERIAL_ATLAS));
  const art=useMemo(()=>({
    ...createRearFieldGuardArt(),...createFieldHutKit(),hut:createStructureGeometry('other',0),
    flash:makeGhostRoundGeo('flash').scale(.58,1.14,.58).rotateX(-Math.PI/2),
    machine:new T.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:.07}),
    timber:new T.MeshStandardMaterial({vertexColors:true,roughness:1}),
    hutPaint:new T.MeshStandardMaterial({map:paint,bumpMap:paint,bumpScale:.004,vertexColors:true,roughness:1}),
    lamp:new T.BoxGeometry(.106,.067,.027),dial:new T.MeshBasicMaterial({toneMapped:false}),
    hot:new T.MeshBasicMaterial({vertexColors:true,toneMapped:false}),
  }),[paint]);
  useEffect(()=>()=>{for(const resource of Object.values(art)) resource.dispose();},[art]);

  const wrecked=guardHealth<=0;
  const scorched=!wrecked && guardHealth/Math.max(1,guardMaxHealth)<=.5;
  useEffect(()=>{art.machine.color.set(wrecked?'#655c55':scorched?'#bcaa97':'#ffffff');},[art,wrecked,scorched]);
  useEffect(()=>{art.dial.color.set(opened?'#a8d398':ready?'#ffd47d':'#916c4b');},[art,opened,ready]);
  const hutYaw=Math.atan2(hutPosition[0]-guardPosition[0],hutPosition[2]-guardPosition[2]);
  const firingShot=firing&&!wrecked;
  return <group name="field-rear-stronghold" dispose={null}>
    <group name="rear-radio-hut" position={hutPosition} rotation-y={hutYaw}>
      <mesh name="rear-radio-intact-walls" visible={!hutDestroyed} geometry={art.hut} material={art.hutPaint} position-y={.31} scale={[2.65,1.80,2.45]} castShadow receiveShadow/>
      <mesh name="rear-radio-collapsed-walls" visible={hutDestroyed} geometry={art.rubble} material={art.timber} castShadow receiveShadow/>
      <mesh geometry={art.fittings} material={art.timber} castShadow receiveShadow/>
      <mesh name="rear-field-hinged-door" visible={!hutDestroyed} position={[-.476,.167,-1.212]} rotation-y={opened?1.38:ready?.22:0}
        scale={[1,.752,1]} geometry={art.door} material={art.timber} castShadow receiveShadow/>
      <mesh name="rear-field-radio-lamp" position={[.882,1.062,-1.395]} geometry={art.lamp} material={art.dial}/>
    </group>
    <group name="rear-field-armored-guard" position={guardPosition}>
      <group rotation-y={hutYaw}>
        <mesh geometry={art.hull} material={art.machine} castShadow receiveShadow/>
        <mesh visible={wrecked} geometry={art.coals} material={art.hot}/>
      </group>
      <group name="rear-guard-turret" position={[wrecked?-.08:0,wrecked?1.03:1.105,-.14]} rotation-y={turretYaw}>
        <group rotation-z={wrecked?.13:0}>
          <mesh geometry={art.turret} material={art.machine} castShadow receiveShadow/>
          <group name="rear-guard-barrel-slide" position={[0,.33,firingShot?.10:0]} rotation-x={wrecked?-.25:0}>
            <mesh geometry={art.barrel} material={art.machine} castShadow receiveShadow/>
            <mesh name="rear-field-muzzle-flash" visible={firingShot} geometry={art.flash} material={art.hot} position-z={-2.84}/>
          </group>
        </group>
      </group>
    </group>
  </group>;
});
