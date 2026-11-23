import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { type TankImpactContact, type TankImpactFeed } from '../../lib/tankImpactFeedback';

// A small broken primer scrape with a narrow worn lip. It is fixed to the
// affected vehicle, never projected onto another object or tied to its HP.
function paintScrape() {
  const pos:number[]=[],colors:number[]=[];
  const triangle=(pts:number[][],value:string)=>{
    const c=new THREE.Color(value);
    for(const [x,z] of pts){pos.push(x,0,z);colors.push(c.r,c.g,c.b);}
  };
  triangle([[-.034,-.13],[-.012,.052],[.010,.105]],'#413c31');
  triangle([[-.034,-.13],[.010,.105],[.014,-.038]],'#4e4334');
  triangle([[-.034,-.13],[-.023,-.053],[.004,.066]],'#928775');
  triangle([[.011,-.108],[.034,-.034],[.029,.052]],'#564b38');
  triangle([[.031,.063],[.044,.118],[.037,.100]],'#958773');
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();return g;
}
const SLOTS=['left-track','right-track','engine'] as const;
const TARGETS=['tank-left-fender','tank-right-fender','tank-engine-cover'] as const;
const RECOVER=1.17;
export function TankImpactFeedback({feed,resetPosition}:{feed:TankImpactFeed;resetPosition:readonly number[]}) {
  const group=useRef<THREE.Group>(null);
  const spark=useRef<THREE.InstancedMesh>(null),vapor=useRef<THREE.InstancedMesh>(null);
  const marks=useRef<THREE.InstancedMesh>(null);
  const art=useMemo(()=>({
    scratch:paintScrape(),
    markFinish:new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,
      transparent:false,roughness:.91,metalness:.04,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),
    sparkFinish:new THREE.MeshBasicMaterial({color:0xffb963,toneMapped:false,depthWrite:false}),
    dustFinish:new THREE.MeshBasicMaterial({color:0x847b66,transparent:true,opacity:0,depthWrite:false}),
    stamp:new THREE.Object3D(),
  }),[]);
  const s=useMemo(()=>({rev:feed.revision,epoch:feed.epoch,elapsed:RECOVER,
    contact:null as TankImpactContact|null,target:null as THREE.Object3D|null,
    restY:0,restRoll:0,slots:[null,null,null] as (TankImpactContact|null)[]}),[feed]);

  function restore() {
    if(s.target){s.target.position.y=s.restY;s.target.rotation.z=s.restRoll;s.target=null;}
    if(spark.current)spark.current.visible=false;
    if(vapor.current)vapor.current.visible=false;
    if(group.current)group.current.userData.response=null;
    s.contact=null;s.elapsed=RECOVER;
  }
  function clear() {
    restore();s.slots.fill(null);s.rev=feed.revision;s.epoch=feed.epoch;
    if(marks.current){marks.current.count=0;marks.current.visible=false;}
  }
  function stampMarks() {
    const mesh=marks.current;if(!mesh)return;
    let count=0;
    for(const c of s.slots)if(c) {
      art.stamp.position.set(c.x,c.y,c.z);
      art.stamp.rotation.set(0,c.panel==='engine'?.83:c.x<0?.09:-.14,0);
      art.stamp.scale.setScalar(c.panel==='engine'?1.24:1);
      art.stamp.updateMatrix();mesh.setMatrixAt(count++,art.stamp.matrix);
    }
    mesh.count=count;mesh.visible=count>0;mesh.instanceMatrix.needsUpdate=true;
  }
  useLayoutEffect(()=>{
    clear();
    return restore;
    // A respawn replaces the presentation, not just the world transform.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[feed,resetPosition]);
  useLayoutEffect(()=>()=>{art.scratch.dispose();art.markFinish.dispose();art.sparkFinish.dispose();art.dustFinish.dispose();},[art]);
  useFrame((_state,dt)=>{
    if(s.epoch!==feed.epoch){
      clear();
      if(!feed.contact)return;
      // A genuinely new contact may already have followed the reset between
      // two renders. Consume it after clearing the previous encounter's marks.
      s.rev=feed.revision-1;
    }
    if(s.rev!==feed.revision) {
      restore();s.rev=feed.revision;
      const c=feed.contact;
      if(c&&group.current) {
        const slot=SLOTS.indexOf(c.panel);
        s.target=group.current.parent?.getObjectByName(TARGETS[slot])??null;
        if(s.target){s.restY=s.target.position.y;s.restRoll=s.target.rotation.z;}
        s.elapsed=0;s.contact=c;s.slots[slot]=c;stampMarks();
        group.current.userData.response=c.panel;
      }
    }
    if(!s.contact || !spark.current || !vapor.current)return;
    if(!Number.isFinite(dt)||dt>.33){restore();return;}
    const t=s.elapsed+=Math.max(0,dt), c=s.contact,engine=c.panel==='engine';
    if(t>=RECOVER){restore();return;}
    if(s.target){
      const wiggle=Math.max(0,1-t/(engine?.63:.42))**2*Math.sin(t*(engine?54:72));
      s.target.position.y=s.restY+wiggle*(engine?.021:.036);
      s.target.rotation.z=s.restRoll+wiggle*(engine?.016:.028)*Math.sign(c.x||1);
    }
    const kick=spark.current,mist=vapor.current;
    const stamp=art.stamp,sign=c.x<0?-1:1;
    kick.visible=t<.235;
    if(kick.visible){
      for(let i=0;i<5;i++){
        const a=i*2.4+.6,progress=t/.235;
        stamp.position.set(c.x+(engine?Math.sin(a)*.18:sign*(.045+i*.028))*progress,
          c.y+.034+(.15+.13*(i%3))*Math.sin(progress*Math.PI*.79),c.z+Math.cos(a)*.23*progress);
        stamp.rotation.set(Math.sin(a)*.83,0,engine?Math.cos(a):sign*(.27+.14*i));
        const fade=1-progress;stamp.scale.set(.016*fade,(.039+.014*(i%3))*fade,.014*fade);
        stamp.updateMatrix();kick.setMatrixAt(i,stamp.matrix);
      }
      kick.instanceMatrix.needsUpdate=true;
    }
    const end=engine?RECOVER:.71, f=t/end;
    mist.visible=f<1;
    if(mist.visible){
      art.dustFinish.opacity=(1-f)*Math.min(1,t*15)*(engine?.57:.40);
      for(let i=0;i<4;i++){
        const q=Math.max(0,f-i*.13), a=i*2.2;
        stamp.position.set(c.x+Math.sin(a)*(.028+q*.13)+(engine?.041:sign*.18)*q,
          c.y+.046+q*(engine?.79:.42),c.z+Math.cos(a)*.06+q*.12);
        stamp.rotation.set(q*.4,a+.5*q,0);
        const r=(.047+q*(engine?.175:.142))*(f<i*.13?.012:1);
        stamp.scale.set(r*1.13,r*.87,r);
        stamp.updateMatrix();mist.setMatrixAt(i,stamp.matrix);
      }
      mist.instanceMatrix.needsUpdate=true;
    }
  });
  return <group ref={group} name="tank-contact-feedback">
    <instancedMesh name="tank-contact-scuffs" ref={marks} visible={false} frustumCulled={false}
      args={[art.scratch,art.markFinish,3]}/>
    <instancedMesh name="tank-contact-flecks" ref={spark} visible={false} frustumCulled={false} args={[undefined,art.sparkFinish,5]}>
      <octahedronGeometry args={[1,0]}/>
    </instancedMesh>
    <instancedMesh name="tank-contact-vapor" ref={vapor} visible={false} frustumCulled={false} args={[undefined,art.dustFinish,4]}>
      <icosahedronGeometry args={[1,0]}/>
    </instancedMesh>
  </group>;
}
