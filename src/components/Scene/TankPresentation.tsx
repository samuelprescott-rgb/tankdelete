import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { createTankHullGeometry, createTankDeckGeometry, createTankTurretGeometry, createTrackBeltGeometry,
  createTankHardwareGeometry, createTankHullFittingsGeometry, createTankTurretFittingsGeometry,
  createTankCanvasGeometry, createTankRoadWheelGeometry, createTankEndWheelGeometry,
  createTankHeadlampsGeometry, createTankStencilGeometry, createTankCupolaGeometry, createTankFenderGeometry,
  createTankTurretRingGeometry, createTankTrackShoeGeometry, createTankSignalGuards, createTankSignalBarrel,
  createTankAccessoryHousingGeometry, TANK_BUSTLE_MOUNT, TANK_ROAD_WHEEL_CENTERS,
  TANK_ROAD_WHEEL_RADIUS, TANK_END_WHEEL_RADIUS, TANK_TRACK_AXLE_Y, TANK_TRACK_RADIUS, TANK_ROAD_WHEEL_Y, trackLoopLength } from './tankGeometry';
import { sampleSuspendedTrackPose, trackSuspensionOffset, type TankSuspension } from '../../lib/tankSuspension';
import { applyPaintedFinish } from './paintedMaterials';
import { applyTankCanvasFinish, applyTankComponentPaint, applyTankSurface, applyWheelFieldPaint,TANK_CAST_ENAMEL_PATH } from './tankSurface';
import { createVehicleInk, inkVehicle } from './ghostVehicleInk';
import { createTankSurfaceStudy,dressTankCastContact,finishTankEnamel } from './tankTextile';

// GameSession is lazy: when the field is requested, start its art load while
// the scene initializes. Pass the identical URL tuple to Fiber so mount uses
// the prewarmed cache entry rather than fetching a separate texture object.
const tankArtURLs=[
  '/images/textures/tank-armor-v1.png', '/images/textures/tank-unit-23.svg',
  '/images/textures/tank-field-wear-v1.svg',TANK_CAST_ENAMEL_PATH,
];
if(typeof window!=='undefined'&&typeof document!=='undefined')useLoader.preload(THREE.TextureLoader,tankArtURLs);

export function useTankPresentation() {
  const [pigment, unitStamp, fieldWear,castCoat] = useLoader(THREE.TextureLoader,tankArtURLs);
  const assets=useMemo(()=>{
    unitStamp.colorSpace = THREE.SRGBColorSpace;
    unitStamp.anisotropy = 4;
    fieldWear.colorSpace = THREE.SRGBColorSpace;
    fieldWear.anisotropy = 4;
    // A raw pigment/height study, not sRGB albedo: the shaders use its
    // deviations around a neutral sample to preserve authored part colors.
    pigment.colorSpace = THREE.NoColorSpace;
    pigment.wrapS = pigment.wrapT = THREE.RepeatWrapping;
    pigment.anisotropy = 4;
    castCoat.name='tank-original-cast-enamel';castCoat.colorSpace=THREE.SRGBColorSpace;
    castCoat.wrapS=castCoat.wrapT=THREE.RepeatWrapping;
    castCoat.minFilter=THREE.LinearMipmapLinearFilter;castCoat.anisotropy=4;
    const armor = applyTankComponentPaint(new THREE.MeshStandardMaterial({
      color: '#656e54', roughness: .87, metalness: .06,
    }), pigment, 'drum');
    const castingParameters = { vertexColors: true, roughness: .82, metalness: .065 };
    // The enclosed U-shaped nose now owns the whole jaw. Do not also paint
    // the older separate front-facing grin on the bare glacis underneath.
    const platedArmor = applyTankSurface(new THREE.MeshStandardMaterial(castingParameters), 'casting', undefined, castCoat);
    const turretArmor = applyTankSurface(new THREE.MeshStandardMaterial(castingParameters), 'turret', undefined, castCoat, unitStamp, fieldWear);
    const fittings = applyTankComponentPaint(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: .91, metalness: .065,
    }), pigment, 'fittings');
    const fenderFinish = applyTankComponentPaint(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: .88, metalness: .06,
    }), pigment, 'fender', fieldWear);
    const engineCover = applyTankComponentPaint(new THREE.MeshStandardMaterial({
      color: '#646951', roughness: .88, metalness: .055,
    }), pigment, 'cover');
    const darkArmor = applyTankComponentPaint(new THREE.MeshStandardMaterial({
      color: '#515845', roughness: .90, metalness: .07,
    }), pigment, 'auxiliary');
    const surfaceStudy=createTankSurfaceStudy();
    const canvas = applyTankCanvasFinish(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0,
    }),surfaceStudy,TANK_BUSTLE_MOUNT);
    const steel = applyPaintedFinish(new THREE.MeshStandardMaterial({
      color: '#464b3c', roughness: .87, metalness: .08,
    }), { scale: 1.3, strength: .59, edge: .70 });
    const markings = applyPaintedFinish(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: .97,
    }), { scale: 1.25, strength: .49, edge: .11 });
    const cheekInk=createVehicleInk('cheek'),deckInk=createVehicleInk('deck'),fenderInk=createVehicleInk('fender');
    const jawInk=createVehicleInk('sideJaw'),skirtInk=createVehicleInk('skirtSteel');
    const guards=createTankSignalGuards();
    const makePanel=(map:THREE.Texture,part:'guard'|'jaw')=>finishTankEnamel(
      new THREE.MeshStandardMaterial({map,roughness:.87,metalness:.047}),surfaceStudy,part,part==='jaw'?castCoat:undefined);
    finishTankEnamel(inkVehicle(turretArmor,'cheek',cheekInk),surfaceStudy,'cheek');inkVehicle(platedArmor,'deck',deckInk);
    inkVehicle(fenderFinish,'fender',fenderInk);inkVehicle(engineCover,'engine',skirtInk);
    return {armor,platedArmor,turretArmor,fittings,fenderFinish,engineCover,darkArmor,canvas,steel,markings,cheekInk,deckInk,fenderInk,
      jawInk,skirtInk,surfaceStudy,signalJaw:guards.jaw,signalGuard:guards.guard,jawFinish:makePanel(jawInk,'jaw'),guardFinish:makePanel(skirtInk,'guard'),signalBarrel:createTankSignalBarrel(),
      hull:createTankHullGeometry(),turret:dressTankCastContact(createTankTurretGeometry()),
      deck:createTankDeckGeometry(),turretRing:createTankTurretRingGeometry(),
      hardware:createTankHardwareGeometry(),hullFittings:createTankHullFittingsGeometry(),
      turretFittings:createTankTurretFittingsGeometry(),canvasGear:createTankCanvasGeometry(),
      headlamps:createTankHeadlampsGeometry(),stencil:createTankStencilGeometry(),cupola:createTankCupolaGeometry(),
      radioHousing:createTankAccessoryHousingGeometry(true),receiverHousing:createTankAccessoryHousingGeometry(false)};
  },[pigment,unitStamp,fieldWear,castCoat]);
  useEffect(()=>()=>Object.values(assets).forEach(resource=>resource.dispose()),[assets]);
  return assets;
}

const TRACK_SHOES_PER_SIDE=64;
const ROAD_WHEEL_CENTERS=TANK_ROAD_WHEEL_CENTERS;

function sidedFender(side: -1 | 1) {
  const sheet = createTankFenderGeometry();
  sheet.setAttribute('tankHand', new THREE.Float32BufferAttribute(
    new Float32Array(sheet.getAttribute('position').count).fill(side), 1));
  return sheet;
}

/** The paired tracks follow real travel and independent terrain-contact stations.
 * Settled running gear uploads nothing until movement or terrain support changes. */
export function TankRunningGear({tankRef,resetPosition,fenderMaterial,lengthScale=1,suspension}:{tankRef:RefObject<THREE.Group|null>;resetPosition?:readonly number[];fenderMaterial:THREE.Material;lengthScale?:number;suspension:TankSuspension}) {
  const padsRef=useRef<THREE.InstancedMesh>(null);
  const wheelsRef=useRef<THREE.InstancedMesh>(null);
  const idlersRef=useRef<THREE.InstancedMesh>(null);
  const sprocketsRef=useRef<THREE.InstancedMesh>(null);
  const phase=useRef(new Float64Array(2));
  const last=useRef({x:0,z:0,yaw:0,initialized:false,suspensionVersion:-1});
  const assets=useMemo(()=>{
    const leftBelt=createTrackBeltGeometry(lengthScale).scale(1,1,1/lengthScale);
    const rightBelt=leftBelt.clone();
    for(const belt of [leftBelt,rightBelt]) {
      (belt.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
      // The bounded travel cannot escape this conservative, once-built volume.
      belt.boundingBox!.min.y-=.15; belt.boundingBox!.max.y+=.15;
      belt.boundingSphere!.radius+=.15;
    }
    return {
    leftBelt,rightBelt,beltRest:new Float32Array(leftBelt.getAttribute('position').array),pad:createTankTrackShoeGeometry(),
    wheel:createTankRoadWheelGeometry(),
    idler:createTankEndWheelGeometry(),sprocket:createTankEndWheelGeometry(true),
    leftFender:sidedFender(-1),rightFender:sidedFender(1),
    rubber:new THREE.MeshStandardMaterial({color:'#33342d',roughness:1}),
    pads:applyTankSurface(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:.035}),'track'),
    wheels:applyWheelFieldPaint(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91,metalness:.055})),
    transform:new THREE.Object3D(),
    pose:{y:0,z:0,angle:0},
    undoLengthScale:new THREE.Matrix4().makeScale(1,1,1/lengthScale),
  };},[lengthScale]);
  useLayoutEffect(()=>{
    last.current.initialized=false;
    last.current.suspensionVersion=-1;
    phase.current[0]=0;
    phase.current[1]=0;
    // Break the long tread silhouette into short steel contacts / dark runs
    // as the reference does. Colors are per SHOE, fixed through suspension
    // and rotation, and uploaded only when constructing/resetting the track.
    const pads=padsRef.current;
    if(pads){
      const tone=new THREE.Color();
      for(let i=0;i<pads.count;i++){
        const slot=(i+Math.floor(i/TRACK_SHOES_PER_SIDE)*3)%11;
        const value=slot===0||slot===1||slot===6?1.38:slot===4||slot===8?.52:.88;
        pads.setColorAt(i,tone.setRGB(value,value*.97,value*.91));
      }
      if(pads.instanceColor)pads.instanceColor.needsUpdate=true;
    }
  },[assets,resetPosition]);
  useEffect(()=>()=>{
    for(const item of Object.values(assets)) if('dispose' in item) item.dispose();
  },[assets]);
  useFrame(()=>{
    const tank=tankRef.current,pads=padsRef.current,wheels=wheelsRef.current;
    const idlers=idlersRef.current,sprockets=sprocketsRef.current;
    if(!tank||!pads||!wheels||!idlers||!sprockets)return;
    const {x,z}=tank.position,yaw=tank.rotation.y;
    const old=last.current;
    const distance=old.initialized?-(x-old.x)*Math.sin(yaw)-(z-old.z)*Math.cos(yaw):0;
    const turn=old.initialized?Math.atan2(Math.sin(yaw-old.yaw),Math.cos(yaw-old.yaw)):0;
    const terrainChanged=old.suspensionVersion!==suspension.version;
    if(old.initialized&&Math.abs(distance)+Math.abs(turn)<.00001&&!terrainChanged)return;
    // Directory changes teleport the tank: reset track phase rather than
    // feeding a discontinuity into the visual wheel animation.
    if(Math.abs(distance)>3){phase.current[0]=0;phase.current[1]=0;}
    else {phase.current[0]+=distance-turn*.76;phase.current[1]+=distance+turn*.76;}
    old.x=x;old.z=z;old.yaw=yaw;old.initialized=true;old.suspensionVersion=suspension.version;
    for(let side=0;side<2;side++) {
      const x=(side===0?-1:1)*.76;
      for(let i=0;i<TRACK_SHOES_PER_SIDE;i++) {
        const pose=sampleSuspendedTrackPose(assets.pose,suspension,side,
          i/TRACK_SHOES_PER_SIDE*trackLoopLength(lengthScale)+phase.current[side],TANK_TRACK_RADIUS);
        assets.transform.position.set(x,TANK_TRACK_AXLE_Y+pose.y,pose.z);
        assets.transform.rotation.set(pose.angle,0,0);assets.transform.updateMatrix();
        pads.setMatrixAt(side*TRACK_SHOES_PER_SIDE+i,assets.transform.matrix.premultiply(assets.undoLengthScale));
      }
      for(let i=0;i<ROAD_WHEEL_CENTERS.length;i++) {
        assets.transform.position.set(x,TANK_ROAD_WHEEL_Y+suspension.travel[side*8+i+1],ROAD_WHEEL_CENTERS[i]*lengthScale);
        assets.transform.rotation.set(phase.current[side]/TANK_ROAD_WHEEL_RADIUS,0,0);assets.transform.updateMatrix();
        wheels.setMatrixAt(side*ROAD_WHEEL_CENTERS.length+i,assets.transform.matrix.premultiply(assets.undoLengthScale));
      }
      for(let end=0;end<2;end++) {
        const mesh=end===0?idlers:sprockets,z=end===0?-.86:.86;
        assets.transform.position.set(x,TANK_TRACK_AXLE_Y+suspension.travel[side*8+(end===0?0:7)],z*lengthScale);
        assets.transform.rotation.set(phase.current[side]/TANK_END_WHEEL_RADIUS,0,0);assets.transform.updateMatrix();
        mesh.setMatrixAt(side,assets.transform.matrix.premultiply(assets.undoLengthScale));
      }
      if(terrainChanged) {
        const belt=side===0?assets.leftBelt:assets.rightBelt,position=belt.getAttribute('position');
        for(let vertex=0;vertex<position.count;vertex++) {
          const y=assets.beltRest[vertex*3+1],z=assets.beltRest[vertex*3+2];
          position.setY(vertex,y+trackSuspensionOffset(suspension,side,z*lengthScale,y,TANK_TRACK_RADIUS));
        }
        position.needsUpdate=true;
      }
    }
    pads.instanceMatrix.needsUpdate=true;wheels.instanceMatrix.needsUpdate=true;
    idlers.instanceMatrix.needsUpdate=true;sprockets.instanceMatrix.needsUpdate=true;
  });
  return <>
    <instancedMesh name="tank-track-shoes" ref={padsRef} args={[assets.pad,assets.pads,TRACK_SHOES_PER_SIDE*2]} frustumCulled={false} castShadow receiveShadow />
    <instancedMesh name="tank-road-wheels" ref={wheelsRef} args={[assets.wheel,assets.wheels,ROAD_WHEEL_CENTERS.length*2]} frustumCulled={false} castShadow receiveShadow />
    <instancedMesh ref={idlersRef} args={[assets.idler,assets.wheels,2]} frustumCulled={false} castShadow receiveShadow />
    <instancedMesh ref={sprocketsRef} args={[assets.sprocket,assets.wheels,2]} frustumCulled={false} castShadow receiveShadow />
    {[-.76,.76].map(x=><group key={x}>
      <mesh name={x<0?'tank-left-carrier':'tank-right-carrier'} geometry={x<0?assets.leftBelt:assets.rightBelt} material={assets.rubber} position={[x,TANK_TRACK_AXLE_Y,0]} castShadow receiveShadow />
      <mesh name={x<0?'tank-left-fender':'tank-right-fender'} geometry={x < 0 ? assets.leftFender : assets.rightFender} material={fenderMaterial} position={[x,.395,0]} castShadow receiveShadow />
    </group>)}
  </>;
}
