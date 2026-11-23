import {useEffect,useMemo,useRef} from 'react';
import * as THREE from 'three';
import {ACTOR_PALETTE, INK_CELL, paintGhostActor, type InkActor} from './ghostActorInk';

const quads=new Map<number,THREE.PlaneGeometry>();
const sheets=new Map<string,THREE.DataTexture>();
function quad(size:number) {
 let g=quads.get(size);if(!g){g=new THREE.PlaneGeometry(size,size);g.translate(0,size*(.5-5/96),0);quads.set(size,g);}return g;
}
function sheet(kind:InkActor,kneel:boolean,variant:number) {
 const key=[kind,kneel,variant].join(':');let tex=sheets.get(key);if(tex)return tex;
 const rows=kind==='boss'?5:3,N=INK_CELL,w=N*5,h=N*rows,px=new Uint8Array(w*h*4);
 for(let step=0;step<rows;step++)for(let view=0;view<5;view++){
  const cel=paintGhostActor(kind,view,step,kneel,variant);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
   const ci=cel[y*N+x],c=ACTOR_PALETTE[ci],i=4*((h-1-(step*N+y))*w+view*N+x);
   px[i]=c>>16;px[i+1]=c>>8;px[i+2]=c;px[i+3]=ci?255:0;
  }
 }
 tex=new THREE.DataTexture(px,w,h);tex.name='ghost-signal:ink:'+key;tex.colorSpace=THREE.SRGBColorSpace;
 tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true;sheets.set(key,tex);return tex;
}
const vert=`varying vec2 inkUv;
 #include <fog_pars_vertex>
 void main(){inkUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
 }`;
const frag=`uniform sampler2D ink;uniform vec3 cell;uniform float opacity;uniform float rows;varying vec2 inkUv;
 #include <fog_pars_fragment>
 void main(){vec2 px=floor(clamp(inkUv,vec2(0.),vec2(.99999))*96.);
 if(cell.z<0.)px.x=95.-px.x;
 vec2 at=(vec2(cell.x,rows-1.-cell.y)*96.+px+.5)/vec2(480.,96.*rows);
 vec4 swatch=texture2D(ink,at);if(swatch.a<.5)discard;
 // Ordered, world-anchored transparency: near-camera boss does not erase
 // the chase view, and both depth-writing and the pixel silhouette stay stable.
 float rank=mod(2.*mod(px.x,2.)+3.*mod(px.y,2.)+4.*mod(floor(px.x*.5)+floor(px.y*.5),2.),8.);
 if(opacity<.99&&opacity*8.<=rank+.25)discard;
 gl_FragColor=vec4(swatch.rgb,1.);
 #include <fog_fragment>
 #include <colorspace_fragment>
 }`;
export function GhostActor({kind,kneel=false,variant=0,fade,meleeCel}:{
 kind:InkActor;kneel?:boolean;variant?:number;fade?:()=>number;meleeCel?:{current:number};
}){
 const m=useMemo(()=>new THREE.ShaderMaterial({fog:true,uniforms:{
   ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),ink:{value:sheet(kind,kneel,variant)},cell:{value:new THREE.Vector3()},opacity:{value:1},rows:{value:kind==='boss'?5:3},
 },vertexShader:vert,fragmentShader:frag,toneMapped:false}),[kind,kneel,variant]);
 const p=useMemo(()=>({camera:new THREE.Vector3(),pos:new THREE.Vector3(),last:new THREE.Vector3(),phase:0,ready:false}),[]);
 const ref=useRef<THREE.Mesh>(null);
 useEffect(()=>()=>m.dispose(),[m]);
 return <mesh ref={ref} name="ghost-actor-pixels" geometry={quad(kind==='boss'?1.85:1.90)}
  material={m} frustumCulled={false} dispose={null} onBeforeRender={(_r,_s,camera)=>{
   const mesh=ref.current,parent=mesh?.parent;if(!mesh||!parent)return;
   camera.getWorldPosition(p.camera);parent.worldToLocal(p.camera);
   const theta=Math.atan2(p.camera.x,-p.camera.z),view=Math.min(4,Math.round(Math.abs(theta)*4/Math.PI));
   mesh.rotation.y=Math.atan2(p.camera.x,p.camera.z);mesh.updateMatrixWorld(true);
   p.pos.setFromMatrixPosition(parent.matrixWorld);
   const distance=p.pos.distanceTo(p.last);if(p.ready&&distance<2)p.phase+=distance*(kind==='boss'?1:5);
   p.last.copy(p.pos);p.ready=true;
   const step=distance<.00015?0:[0,1,0,2][Math.floor(p.phase*3)%4];
   m.uniforms.cell.value.set(view,meleeCel?.current||step,theta<-.01?-1:1);m.uniforms.opacity.value=fade?.()??1;m.uniformsNeedUpdate=true;
  }}/>;
}
