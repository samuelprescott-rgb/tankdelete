import {createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode} from 'react';
import {useFrame} from '@react-three/fiber';
import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {createTankGroundProfile} from '../../lib/tankGroundProfile';
import {createRiverStations} from './riverLayout';
import {RIVER_WATER_Y} from './riverVerticalSection';

type Source = 'soldier' | 'tank' | 'door';
type Eject = (socket: T.Object3D, source: Source, doorway?: T.Object3D) => void;
const Ejection = createContext<Eject>(() => {});
export const useEjectBrass = () => useContext(Ejection);
const CAPACITY = 144;
const GRAVITY = 8.8;

// PixelFX's dark mouth, brass body, and pale rim read as the case turns.
// Vertex pigment keeps the brass distinct from the bright projectile tracer.
function caseGeometry() {
  const parts = [
    {g:new T.CylinderGeometry(.14,.155,.88,7,1,true),hex:'#bc8b43'},
    {g:new T.CylinderGeometry(.175,.175,.085,7).translate(0,-.43,0),hex:'#d6ad64'},
    {g:new T.RingGeometry(.095,.14,7,1,Math.PI/2).rotateX(-Math.PI/2).translate(0,.44,0),hex:'#e9c279'},
    {g:new T.CircleGeometry(.12,7,Math.PI/2).rotateX(-Math.PI/2).translate(0,.417,0),hex:'#4c3922'},
  ];
  const pieces = parts.map(({g, hex})=>{
    const colors: number[] = [], tint = new T.Color(hex);
    for(let i=0;i<g.attributes.position.count;i++){
      const face = .78 + .22 * Math.max(0, g.attributes.normal.getX(i));
      colors.push(tint.r*face,tint.g*face,tint.b*face);
    }
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    return g;
  });
  const g = mergeGeometries(pieces)!;
  for(const piece of pieces)piece.dispose();
  return g;
}
const geometry = caseGeometry();
const ink = new T.MeshBasicMaterial({vertexColors:true,toneMapped:false});

function makeBrassPool() {
  const slots = Array.from({length:CAPACITY},()=>({
    position:new T.Vector3(), velocity:new T.Vector3(), age:0,live:false,
    spin:0, angle:0, size:0, hits:0, rest:0,
  }));
  const forward=new T.Vector3(), side=new T.Vector3(), pose=new T.Object3D();
  let serial=0, active=false;
  const eject:Eject=(socket,source,doorway)=>{
    active=true;
    socket.updateWorldMatrix(true,false);
    const n=serial++, item=slots[n % CAPACITY];
    const variation=((n*47+19)%101)/100;
    // The tank muzzle points down local -Z. All rifle flash sockets point up local +Y.
    forward.set(0,source==='tank'?0:1,source==='tank'?-1:0).transformDirection(socket.matrixWorld);
    side.set(1,0,0).transformDirection(doorway?.matrixWorld ?? socket.matrixWorld);
    const modelScale=socket.parent?.matrixWorld.getMaxScaleOnAxis() ?? 1;
    const barrel=source==='tank'?.90:.5;
    item.position.setFromMatrixPosition(socket.matrixWorld)
      .addScaledVector(forward,-barrel*modelScale).addScaledVector(side,.095*modelScale);
    // Door stations eject beyond the sill, including the reflected port station.
    item.velocity.copy(side).multiplyScalar((source==='soldier'?1.08:2.05)+variation*.74)
      .addScaledVector(forward,-.25-.42*variation);
    item.velocity.y+=1.05+variation*.72;
    item.size=(source==='soldier'?.073:source==='tank'?.11:.116)*(.90+.18*variation);
    item.angle=n*2.4;item.spin=(n%2?1:-1)*(9+variation*11);
    item.age=0;item.hits=0;item.rest=0;item.live=true;
  };
  function draw(mesh:T.InstancedMesh,delta:number,ground:ReturnType<typeof createTankGroundProfile>) {
    if(!active)return;
    const dt=Math.min(.08,delta);
    let count=0;
    for(const item of slots){
      if(!item.live)continue;
      const {position:p,velocity:v}=item;
      item.age+=dt;
      if(item.hits<2){
        p.addScaledVector(v,dt);p.y-=GRAVITY*dt*dt*.5;v.y-=GRAVITY*dt;
        item.angle+=item.spin*dt;
        const floor=ground.height(p.x,p.z)+item.size*.175;
        if(v.y<0 && p.y<=Math.max(floor,RIVER_WATER_Y)){
          if(floor<RIVER_WATER_Y){item.live=false;continue;}
          // ASCII Magic Art's Sparks loses vertical and lateral speed at contact.
          p.y=floor;v.y*=-.38;v.x*=.6;v.z*=.6;item.spin*=.55;item.hits++;
        }
      }else item.rest+=dt;
      if(item.rest>.75 || item.age>7){item.live=false;continue;}
      pose.position.copy(p);
      pose.rotation.set(item.hits===2?Math.PI/2:item.angle,item.angle*.64,item.hits===2?0:item.angle*.41,'YXZ');
      pose.scale.setScalar(item.size);
      pose.updateMatrix();mesh.setMatrixAt(count++,pose.matrix);
    }
    active=count>0;
    mesh.count=count;mesh.visible=active;
    if(count)mesh.instanceMatrix.needsUpdate=true;
  }
  return {eject,draw,reset(){active=false;for(const item of slots)item.live=false;}};
}

export function SpentBrass({children,seed,resetKey}:{children:ReactNode;seed:number;resetKey:string}) {
  const pool=useMemo(makeBrassPool,[]);
  const ground=useMemo(()=>createTankGroundProfile(createRiverStations(seed),seed),[seed]);
  const mesh=useRef<T.InstancedMesh>(null);
  useLayoutEffect(()=>{
    pool.reset();
    if(mesh.current){mesh.current.count=0;mesh.current.visible=false;mesh.current.instanceMatrix.setUsage(T.DynamicDrawUsage);}
  },[pool,resetKey,seed]);
  useFrame((_,dt)=>{if(mesh.current)pool.draw(mesh.current,dt,ground);});
  return <Ejection.Provider value={pool.eject}>
    {children}
    <instancedMesh name="field-spent-brass" ref={mesh} args={[geometry,ink,CAPACITY]}
      frustumCulled={false} visible={false}/>
  </Ejection.Provider>;
}
