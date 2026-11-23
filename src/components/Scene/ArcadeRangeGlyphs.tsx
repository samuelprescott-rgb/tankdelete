import { useEffect,useMemo,useRef,type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CRAWLER,type CrawlerState } from '../../lib/arcadeShell';

type RGB=string;
// Painted industrial carrier: two track pods, a bed with strapped parcels,
// a scan head and exchangeable energy cells. Deliberately no crew or gun.
function cargoMesh(){
  const parts:THREE.BufferGeometry[]=[];
  const add=(g:THREE.BufferGeometry,color:RGB)=>{
    const geo=g.index?g.toNonIndexed():g;
    if(geo!==g)g.dispose();
    const n=geo.getAttribute('normal'),t=new THREE.Color(color),colors:number[]=[];
    for(let i=0;i<n.count;i++){
      const light=.69+.31*Math.max(0,n.getY(i)*.78-n.getZ(i)*.22);
      colors.push(t.r*light,t.g*light,t.b*light);
    }
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    parts.push(geo);
  };
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,col:RGB,bevel=0,angle=0)=>{
    const geo=bevel?new RoundedBoxGeometry(w,h,d,1,bevel):new THREE.BoxGeometry(w,h,d);
    add(geo.rotateZ(angle).translate(x,y,z),col);
  };
  const disk=(r:number,depth:number,x:number,y:number,z:number,c:RGB,n=12)=>
    add(new THREE.CylinderGeometry(r,r,depth,n).rotateX(Math.PI/2).translate(x,y,z),c);
  box(2.95,.39,.88,0,.44,0,'#256265',.105);
  box(3.03,.12,1.09,0,.68,0,'#d3a656',.036);
  box(2.83,.09,1.01,0,.755,0,'#343f3e',.025);
  for(const side of [-1,1]){
    box(2.91,.31,.20,0,.155,side*.41,'#333c39',.145);
    for(let i=0;i<7;i++){
      const x=-1.24+i*.413;
      disk(.194,.082,x,.17,side*.472,'#313939');
      disk(.143,.090,x,.17,side*.483,'#81775a');
      disk(.068,.096,x,.17,side*.491,'#455957');
    }
    for(let i=0;i<16;i++)box(.135,.038,.20,-1.4+i*.187,.028,side*.41,'#70664e',.009);
    box(2.87,.105,.25,0,.389,side*.42,'#2c5355',.026);
    // Recessed charcoal sockets and bright hazard chevrons on both sides.
    for(const x of [-.72,.72]){
      box(1.25,.56,.11,x,.79,side*.485,'#8b8e76',.060);
      box(1.12,.469,.047,x,.79,side*.55,'#172d30',.05);
    }
    for(const x of [-1.36,1.36])for(let k=0;k<2;k++)
      box(.069,.185,.053,x+k*.073-.041,.54,side*.54,'#dfa647',0,-.37);
  }
  for(const [x,w,h,tint] of [[-.80,.91,.42,'#ad8053'],[.19,.79,.51,'#87987d']] as const){
    box(w,h,.81,x,.79+h*.5,0,tint,.037);
    box(w+.035,.055,.84,x,.79+h,0,'#b2ae87',.012);
    for(const slot of [-1,1])box(.050,h+.027,.835,x+slot*w*.29,.80+h*.5,0,'#464b41',.009);
  }
  box(.50,.40,.70,1.00,1.00,0,'#d5aa55',.055);
  box(.38,.12,.56,1.00,1.225,0,'#3e5351',.023);
  for(let i=0;i<5;i++)box(.026,.14,.016,.86+i*.07,1.01,-.36,'#3f514b');
  // Non-text silhouette cues: lifting eyes, lamp stalk and cargo net rail.
  for(const x of [-1.39,1.39]) for(const z of [-.31,.31])
    add(new THREE.TorusGeometry(.073,.016,5,10).translate(x,.826,z),'#c1b58b');
  box(.11,.24,.11,1.0,1.36,0,'#394c4d',.02);
  const geo=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());return geo;
}

// The lettering and symbols are actual simple meshes: no extra fonts,
// HTML overlays, labels that show through other objects, or extra textures.
const typeface:Record<string,string[]>={
  A:['010','101','111','101','101'],R:['110','101','110','101','101'],C:['111','100','100','100','111'],
  O:['111','101','101','101','111'],F:['111','100','110','100','100'],
};
function panelArt(x:number,label:string,live:boolean) {
  const pos:number[]=[];
  function rect(l:number,b:number,r:number,t:number) {
    for(const side of [-1,1]) {
      const z=side*.581;
      for(const [xx,yy] of [[l,b],[r,b],[r,t],[l,b],[r,t],[l,t]])pos.push(x+xx*side, yy+.80,z);
    }
  }
  for(let j=0;j<label.length;j++)typeface[label[j]].forEach((row,k)=>[...row].forEach((on,i)=>{
    if(on==='1'){const xx=(j*4+i-5.5)*.047, yy=(2-k)*.045;rect(xx,yy,xx+.042,yy+.040);}
  }));
  rect(-.46,-.16,.46,-.14);
  // Broken upper and side light bars remain legible when the letters are
  // only a few pixels high in the chase view.
  for(const sign of [-1,1]){
    rect(sign*.34-.14,.156,sign*.34+.14,.183);
    rect(sign*.492-.012,-.141,sign*.492+.012,.141);
  }
  for(const sign of [-1,1]){
    rect(sign*.41-.048,-.073,sign*.41+.048,-.044);
    rect(sign*.41-.048,.071,sign*.41+.048,.102);
    rect(sign*.41-.049,-.049,sign*.41-.030,.075);
    rect(sign*.41+.030,-.049,sign*.41+.049,.075);
    if(live)rect(sign*.41-.018,-.026,sign*.41+.018,.051);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  return geometry;
}
export function ArcadeRangeGlyphs({state,skinRef}:{state:CrawlerState;skinRef:RefObject<THREE.Mesh|null>}) {
  // Only the toy shield skin reveals the near-surface glow of the internal
  // pulse. It never draws through other objects, and needs no extra draw.
  const coating=useMemo(()=>{
    const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88});
    const center={value:new THREE.Vector3()},strength={value:0};
    mat.onBeforeCompile=sh=>{
      sh.uniforms.cargoPulse=center;sh.uniforms.cargoStrength=strength;
      sh.vertexShader='varying vec3 vCargoPoint;\n'+sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n vCargoPoint=(modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader='varying vec3 vCargoPoint;uniform vec3 cargoPulse;uniform float cargoStrength;\n'+
        sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=vec3(.26,1.15,.83)*cargoStrength*(1.-smoothstep(.04,.55,distance(cargoPulse,vCargoPoint)));');
    };
    return {mat,center,strength};
  },[]);
  const asset=useMemo(()=>({body:cargoMesh(),arc:panelArt(-.72,'ARC',true),
    spent:panelArt(-.72,'OFF',false),empty:panelArt(.72,'OFF',false),
    bodyFinish:coating.mat,
    beacon:new THREE.MeshBasicMaterial({color:0xffc764,toneMapped:false}),
    offPanel:new THREE.MeshBasicMaterial({color:0xffa15a,side:THREE.DoubleSide,toneMapped:false})}),[coating]);
  useEffect(()=>()=>Object.values(asset).forEach(g=>g.dispose()),[asset]);
  const root=useRef<THREE.Group>(null),bed=useRef<THREE.Group>(null),lamp=useRef<THREE.Mesh>(null);
  const arc=useRef<THREE.Mesh>(null),spent=useRef<THREE.Mesh>(null),ring=useRef<THREE.Mesh>(null);
  useFrame(()=>{
    if(!root.current||!bed.current||!lamp.current||!arc.current||!spent.current||!ring.current)return;
    const off=state.offline>0;
    root.current.position.x=state.x;
    root.current.userData.power=off?'offline':state.charged?'shielded':'cell-drained';
    root.current.userData.hits=state.hits;root.current.userData.reboots=state.resets;
    root.current.userData.shieldResponse=state.outcome;
    const phase=Math.min(1,(.55-state.flash)/.44);
    coating.center.value.copy(state.contact).addScaledVector(state.into,phase*.39);
    coating.strength.value=state.outcome==='pass'?2.4*(1-phase):0;
    bed.current.position.y=off?-.11:.014*Math.sin(state.travel*3.5);
    bed.current.rotation.z=off?.035:state.flash*.045*Math.sin(state.flash*38);
    lamp.current.rotation.y=state.travel*5;
    asset.beacon.color.set(off?0x3c3930:state.charged?0xffc764:0xff853c);
    asset.bodyFinish.color.setRGB(off?.54:1,off?.60:1,off?.64:1);
    asset.offPanel.color.set(off?0xbe6950:0xffa15a);
    arc.current.visible=state.charged&&!off;spent.current.visible=!arc.current.visible;
    const powerTime=CRAWLER.reboot-state.offline;
    ring.current.visible=off && powerTime<1.1;
    if(ring.current.visible)ring.current.scale.setScalar(.35+powerTime*1.43);
  });
  return <group name="arcade-range-crawler" ref={root} position={[CRAWLER.x,0,CRAWLER.z]}>
    <group name="arcade-range-crawler-aim" position={[-.72,0,-.53]}/>
    <group name="arcade-range-crawler-empty-aim" position={[.72,0,-.53]}/>
    <group ref={bed}>
      <mesh name="arcade-crawler-contact-skin" ref={skinRef} geometry={asset.body} material={asset.bodyFinish} castShadow receiveShadow/>
      <mesh name="arcade-crawler-powered-plate" ref={arc} geometry={asset.arc}>
        <meshBasicMaterial color="#67f4e4" side={THREE.DoubleSide} toneMapped={false}/>
      </mesh>
      <mesh name="arcade-crawler-spent-plate" ref={spent} geometry={asset.spent} visible={false}>
        <meshBasicMaterial color="#ffa15a" side={THREE.DoubleSide} toneMapped={false}/>
      </mesh>
      <mesh name="arcade-crawler-depleted-plate" geometry={asset.empty} material={asset.offPanel}/>
      <mesh ref={lamp} name="arcade-crawler-beacon" position={[1,1.49,0]} material={asset.beacon}>
        <boxGeometry args={[.36,.14,.14]}/>
      </mesh>
    </group>
    <mesh name="arcade-crawler-reboot-ring" ref={ring} visible={false} position={[0,.11,0]} rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[.93,1.0,32]}/><meshBasicMaterial color="#fdaf65" side={THREE.DoubleSide} toneMapped={false}/>
    </mesh>
  </group>;
}
