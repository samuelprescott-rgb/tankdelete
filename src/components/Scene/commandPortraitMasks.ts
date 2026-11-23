import * as THREE from 'three';
import type { TankGroundProfile } from '../../lib/tankGroundProfile';
import { undeadSupportY } from '../../lib/undeadGround';

// Original two game prints, in the original lead/watcher order. They belong
// only to the paper costume; neither monster skin uses a portrait texture.
export const COMMAND_MASK_PRINTS=[
  '/images/nightmare-boss-kamala-texture.png',
  '/images/nightmare-boss-biden-texture.png',
] as const;
type Life={id:string;health:number;maxHealth:number;alive:boolean};
type Phase='absent'|'worn'|'falling'|'shed';
// Original image-space cut lines (top, left edge, right edge). Crop only the
// old print's dangling neckline, not the eyes, mouth, or individual hairline.
const cuts=[
  [[.108,.533,.555],[.137,.401,.645],[.199,.324,.709],[.276,.269,.750],[.346,.244,.777],[.427,.231,.796],[.512,.219,.803],[.574,.264,.783],[.628,.250,.791],[.674,.170,.817],[.709,.195,.869],[.748,.204,.881],[.773,.300,.822],[.787,.405,.646],[.799,.496,.563]],
  [[.020,.469,.515],[.039,.396,.583],[.082,.307,.694],[.142,.264,.742],[.207,.244,.761],[.286,.235,.771],[.350,.219,.790],[.408,.224,.783],[.460,.231,.779],[.512,.242,.767],[.558,.262,.742],[.612,.295,.710],[.674,.319,.700],[.734,.337,.682],[.776,.373,.641],[.802,.416,.600],[.817,.470,.551]],
];
function sheetPoint(h:number,u:number,v:number):[number,number,number] {
  const x=((h?.500:.520)-u)*(h?.722:.714),y=(h?.350:.347)-(v-(h?.02:.108))*(h?.728:.875);
  const cheek=Math.min(1.12,Math.abs(x)/.213);
  return [x,y,-.294+.190*cheek**1.85+.080*((y-.045)/.36)**2
    -.030*Math.exp(-((x/.052)**2)-(((y-.012)/.109)**2))];
}
function propGeometry(h:number){
  const points:number[]=[],uv:number[]=[],kinds:number[]=[],indices:number[]=[];
  const vert=(p:number[],u:number,v:number,k:number)=>{points.push(...p);uv.push(u,1-v);kinds.push(k);return kinds.length-1;};
  const rows=cuts[h],cols=14,count=cols+1,faceSize=rows.length*count;
  for(let back=0;back<2;back++)for(let j=0;j<rows.length;j++)for(let i=0;i<=cols;i++){
    const [v,l,r]=rows[j],u=THREE.MathUtils.lerp(l,r,i/cols),p=sheetPoint(h,u,v);
    p[2]+=.009*back;
    vert(p,u,v,back?1:0);
    if(i&&j){const n=back*faceSize+j*count+i,a=n-count-1,b=n-count,c=n-1;
      if(!back)indices.push(a,c,b,b,c,n);else indices.push(a,b,c,b,n,c);}
  }
  const edge=(a:number,b:number)=>{const q=[a,b,a+faceSize,b+faceSize].map(i=>vert(points.slice(i*3,i*3+3),0,0,2));indices.push(q[0],q[1],q[2],q[2],q[1],q[3]);};
  for(let j=1;j<rows.length;j++){edge((j-1)*count,j*count);edge(j*count+cols,(j-1)*count+cols);}
  for(let i=0;i<cols;i++){edge(i,i+1);const n=(rows.length-1)*count+i;edge(n+1,n);}
  // A continuous dark woven band disappears around the occiput when worn;
  // it swings with the card rather than being stuck on the newly bare face.
  const strapStart=kinds.length;
  for(let i=0;i<=24;i++){
    const a=i*Math.PI/24,x=.193*Math.cos(a),z=-.152+.353*Math.sin(a);
    const y=.059+.025*Math.sin(a)+(h?.007:-.007)*Math.cos(a);
    vert([x,y-.013,z],0,0,3);vert([x,y+.013,z],0,0,3);
    if(i){const n=strapStart+i*2;indices.push(n-2,n,n-1,n-1,n,n+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('maskSide',new THREE.Float32BufferAttribute(kinds,1));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
  return g;
}
function stock(){
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.96,metalness:0,side:THREE.DoubleSide,transparent:true});
  m.visible=false;m.forceSinglePass=true;
  m.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float maskSide; varying float printedSide;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nprintedSide=maskSide;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float printedSide;')
      .replace('#include <map_fragment>',`#ifdef USE_MAP
        vec2 px=floor(vMapUv*144.);
        vec4 src=texture2D(map,(px+.5)/144.);
        if(printedSide<1.5 && src.a<.44) discard;
        if(printedSide<.5){
          vec3 print=pow(max(src.rgb,vec3(0.)),vec3(.455));
          float value=dot(print,vec3(.299,.587,.114));
          // Fourteen ink-value families, with the print's chroma preserved.
          float group=floor(value*13.+.5)/13.;
          print=clamp(vec3(group)+(print-vec3(value))*.74,0.,1.);
          diffuseColor.rgb=pow(mix(vec3(.08,.09,.108),vec3(.91,.82,.71),print),vec3(2.2));
        }else if(printedSide<1.5){
          float fold=step(.93,fract(px.x*.029+px.y*.073));
          diffuseColor.rgb=mix(vec3(.155,.108,.073),vec3(.19,.147,.103),fold);
        }else if(printedSide<2.5){diffuseColor.rgb=vec3(.20,.137,.086);}
        else{diffuseColor.rgb=vec3(.041,.031,.025);}
        #endif`)
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nif(printedSide<.5)totalEmissiveRadiance+=.10*diffuseColor.rgb;');
  };
  m.customProgramCacheKey=()=> 'ghost-signal-printed-paper-v1';return m;
}
export function createCommandPortraitMasks(){
  const root=new THREE.Group();root.name='command-portrait-masks';root.visible=false;
  const pieces=COMMAND_MASK_PRINTS.map((_,i)=>{
    const mesh=new THREE.Mesh(propGeometry(i),stock());mesh.name=i?'command-joe-mask':'command-harris-mask';
    mesh.visible=false;root.add(mesh);
    return {mesh,texture:null as THREE.Texture|null,velocity:new THREE.Vector3(),spin:new THREE.Vector3(),contact:-1,rest:new THREE.Quaternion()};
  });
  const inv=new THREE.Matrix4(),pose=new THREE.Matrix4(),v=new THREE.Vector3(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  let id='',phase:Phase='absent',age=0,hasPose=false,drops=0;
  function report(){Object.assign(root.userData,{phase,age,drops,encounter:id});}
  function reset(key=''){id=key;phase=key?'worn':'absent';age=drops=0;hasPose=false;root.visible=false;
    for(const p of pieces){p.mesh.visible=false;p.contact=-1;p.mesh.material.opacity=1;}report();}
  function sync(actor:Life|undefined,heads:(THREE.Mesh|null)[]|null,dt:number,opacity:number,floor:number,ground?:TankGroundProfile){
    if(!actor){if(id)reset();return;}
    if(id!==actor.id)reset(actor.id);
    if(phase==='shed')return;
    dt=THREE.MathUtils.clamp(dt,0,.10);
    if(phase==='worn'){
      if(heads?.[0]&&heads[1]){
        root.updateWorldMatrix(true,false);inv.copy(root.matrixWorld).invert();
        for(let i=0;i<2;i++){const h=heads[i]!,m=pieces[i].mesh;h.updateWorldMatrix(true,false);
          pose.multiplyMatrices(inv,h.matrixWorld).decompose(m.position,m.quaternion,m.scale);
          // Head and chest carry non-uniform scale. Preserve their *full*
          // affine transform while strapped on, not a shear-free billboard.
          m.matrixAutoUpdate=false;m.matrix.copy(pose);m.matrixWorldNeedsUpdate=true;
          m.visible=true;m.material.opacity=opacity;m.material.depthWrite=opacity>.86;}
        hasPose=true;root.visible=true;
      }else root.visible=false;
      if(actor.maxHealth>0&&actor.health*2<=actor.maxHealth){
        if(!hasPose){if(!actor.alive){phase='shed';report();}return;}
        phase='falling';drops++;age=0;root.visible=true;
        for(let i=0;i<2;i++){const p=pieces[i],m=p.mesh,side=i?1:-1;
          p.velocity.set(side*(2.0+i*.25),0,-(2.8-i*.28)).applyQuaternion(m.quaternion);
          p.velocity.y=1.15+i*.32;p.spin.set(1.74+i*.69,side*(1.4+i*.9),side*(2.3-i*.3));
          p.rest.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2).premultiply(q.setFromAxisAngle(up,side*1.27));
          m.matrixAutoUpdate=true;m.visible=true;m.material.opacity=1;m.material.depthWrite=true;
        }report();
      }
      return;
    }
    age+=dt;
    let visible=false;
    for(const p of pieces){const m=p.mesh;
      if(p.contact<0){
        p.velocity.y-=12.5*dt;m.position.addScaledVector(p.velocity,dt);
        m.rotateX(p.spin.x*dt);m.rotateY(p.spin.y*dt);m.rotateZ(p.spin.z*dt);
        const y=ground?undeadSupportY(ground,m.position.x,m.position.z):floor;
        if(m.position.y<=y+.13){m.position.y=y+.13;p.contact=age;p.velocity.set(0,0,0);}
      }else{
        m.quaternion.slerp(p.rest,1-Math.exp(-9*dt));
        const y=ground?undeadSupportY(ground,m.position.x,m.position.z):floor;
        // With the print facing the ground, the centre plane lies above its
        // tilted printed nose; the blank fibre back is what the player sees.
        v.set(0,0,-.33*m.scale.z).applyQuaternion(m.quaternion);m.position.y=y+Math.max(.018,-v.y)+.012;
        m.material.opacity=1-THREE.MathUtils.smoothstep(age-p.contact,.40,1.1);m.material.depthWrite=m.material.opacity>.86;
      }
      m.visible=m.material.opacity>.015&&age<4.5;visible||=m.visible;
    }
    root.visible=visible;if(!visible)phase='shed';report();
  }
  // No network/compile stalls in the campaign or regular horde waves. Load
  // both bundled prints at wave-four setup, before the boss becomes visible.
  function load(){
    if(typeof document==='undefined'||typeof document.createElementNS!=='function')return ()=>{};
    let live=true;const textures=COMMAND_MASK_PRINTS.map((url,i)=>new THREE.TextureLoader().load(url,t=>{
      if(!live)return;t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;
      t.minFilter=THREE.LinearMipmapLinearFilter;const p=pieces[i];p.texture=t;
      p.mesh.material.map=t;p.mesh.material.visible=true;p.mesh.material.needsUpdate=true;
    }));
    return ()=>{live=false;for(let i=0;i<2;i++){const m=pieces[i].mesh.material;m.map=null;m.visible=false;m.needsUpdate=true;pieces[i].texture=null;textures[i].dispose();}};
  }
  function dispose(){for(const p of pieces){p.mesh.geometry.dispose();p.mesh.material.dispose();}}
  reset();return {root,pieces,sync,load,dispose};
}
