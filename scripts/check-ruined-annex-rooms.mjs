// Mount the actual archive, signal and firelight meshes in the R3F
// reconciler; no browser, WebGL, emulated image or substitute renderer.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import React from 'react';
import {act,context,extend,reconciler} from '@react-three/fiber';
import * as T from 'three';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),entry=root+'/virtual-annex.mjs';
const files=['components/Scene/EmbassyDefense','components/Scene/ruinedAnnex','components/Scene/annexStreetMasonry','lib/embassyDefense'];
const built=await build({root,configFile:false,logLevel:'silent',publicDir:false,esbuild:{jsx:'automatic'},plugins:[{
  name:'annex-rooms',resolveId:p=>p===entry?p:null,load:p=>p===entry?files.map(f=>'export * from "./src/'+f+'"').join(';'):null}],build:{ssr:entry,write:false}});
const source=built.output.find(f=>f.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const G=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(T);T.TextureLoader.prototype.load=function(p,cb){const t=new T.Texture();t.name=p;cb?.(t);return t;};
const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,16/9,.1,340),state={scene,camera,clock:{elapsedTime:0},invalidate(){},
  internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),subscribe(){return ()=>{};}}};
const store=Object.assign((fn=v=>v)=>fn(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;},rec=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null),el=React.createElement;
const render=n=>act(async()=>reconciler.updateContainer(n&&el(context.Provider,{value:store},el(React.Suspense,{fallback:null},n)),rec,null,null));
await render(el(G.EmbassyDefense,{archives:G.createEmbassyArchives()}));
scene.updateMatrixWorld(true);
const v=a=>new T.Vector3(...a),ray=(a,b,range=Infinity)=>new T.Raycaster(a,b.clone().sub(a).normalize(),.0001,range);
const paint=scene.getObjectByName('annex-lit-interiors-and-rubble-fires'),report=[];
for(const a of G.EMBASSY_ARCHIVE_SLOTS.slice(1)){
  const id=a.id,sign=id==='records'?1:-1,wall=scene.getObjectByName('embassy-'+id+'-masonry'),signal=scene.getObjectByName('ghost-signal-'+id+'-online'),
    batch=G.createAnnexBreakage(id),points=batch.attributes.position,index=batch.index;
  assert.ok(wall?.isMesh&&signal?.isMesh&&paint?.isMesh);
  const local=(x,y,z)=>v([x*sign,y,z]).add(wall.parent.position),hit=(x,y,z,sgn,to=Infinity)=>ray(local(x,y,z),local(x,y,z+sgn),to).intersectObjects([wall,paint,signal]);
  // Sample the rear-facade projection broadly, not one lucky pixel.
  let punched=0,recess=0,front=0,litCard=0;
  for(let x=.25;x<2.32;x+=.08)for(let y=1.77;y<2.80;y+=.065){
    const h=hit(x,y,-2.4,1,5);const first=h[0],localZ=first?first.point.z-wall.parent.position.z:Infinity;
    if(!first)punched++;if(localZ>-.53)recess++;if(localZ< -1.50)front++;
    if(first?.object===paint&&localZ<-.55)litCard++;}
  assert.ok(recess>front*.55&&punched>17&&litCard===0,id+' failed deep, actually open rear bays: '+[recess,front,punched,litCard]);
  if(id==='dispatch'){
    // The old floor tongue crossed the door at waist height. Probe across
    // the leaf at the slab elevation so the handle area cannot be cut in two.
    for(const x of [-.46,-.13,.18,.42]){
      const origin=v([x,1.53,2.70]).add(wall.parent.position);
      const first=new T.Raycaster(origin,v([0,0,-1]),0,1.3).intersectObjects([wall,signal])[0];
      assert.equal(first?.object,signal,'Dispatch slab hides the door at x='+x);
    }
  }
  // Actual surviving plaster pier shields the warm reflection on BOTH sides;
  // it reads from inside, never as a disconnected luminous rectangle behind.
  const j=G.OFFICE_JAMB,inHit=hit(j.x,j.y,-1.41,-1,.5),outHit=hit(j.x,j.y,-2.41,1,1);
  assert.equal(inHit[0]?.object,paint);assert.equal(outHit[0]?.object,wall);
  assert.ok(inHit.some(h=>h.object===wall&&Math.abs(h.distance-inHit[0].distance)<.008),'spill no longer touching masonry');
  // Every fallen vertex must still sit outside the tangible doorway and
  // respect the original ground contact and live geometry budget.
  const invalid=[];for(let i=batch.userData.fallFanIndexStart;i<index.count;i++){const q=new T.Vector3().fromBufferAttribute(points,index.getX(i));
    if(q.y<.34||q.y>2.28||q.z>1.84&&Math.abs(q.x)<=1.02)invalid.push(q.toArray().map(n=>+n.toFixed(3)));}
  assert.equal(invalid.length,0,'fallen geometry crosses approach/footprint: '+id+' '+JSON.stringify(invalid.slice(0,8)));
  assert(wall.geometry.index.count/3<2900,id+' must stay in current batch and geometry budget: '+wall.geometry.index.count/3);
  const receiptDir=new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/game/micro-r21/command/',import.meta.url);
  if(id==='dispatch'&&existsSync(new URL('receipt.json',receiptDir))){
    const rec=JSON.parse(readFileSync(new URL('receipt.json',receiptDir),'utf8')),shot=rec.shots.find(s=>s.name==='front-left');
    const scale=(shot.eye[1]-shot.root[1])/1.13;camera.position.fromArray(shot.eye);camera.lookAt(v(shot.root).add(v([0,.81*scale,0])));camera.updateMatrixWorld();
    const rgb=execFileSync('ffmpeg',['-v','error','-i',fileURLToPath(new URL('front-left.png',receiptDir)),
      '-vf','crop=220:87:1500:750','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
    assert.equal(rgb.length,220*87*3);
    let cavity=0,visible=0,rearLight=0,oldPeach=0,nowRecessed=0;const scan=new T.Raycaster();
    for(let x=1500;x<1720;x+=4)for(let y=750;y<837;y+=3){scan.setFromCamera(new T.Vector2(x/960-1,1-y/540),camera);
      const k=((y-750)*220+x-1500)*3,[r,g,b]=rgb.subarray(k,k+3);
      const peach=r>=121&&r<=170&&r-g>29&&g-b>11&&g-b<50&&b<90;
      if(peach)oldPeach++;
      const h=scan.intersectObjects([wall,signal,paint])[0],deep=!h||h.point.z-a.position[2]>-.60;
      if(deep){cavity++;if(peach)nowRecessed++;}if(h)visible++;
      if(h?.object===paint&&h.point.z-a.position[2]<-.55)rearLight++;}
    assert.ok(cavity>80&&rearLight===0,'R21 front-left peach window crop still closed or glowing: '+[cavity,visible,rearLight]);
    assert.ok(oldPeach>650&&nowRecessed>oldPeach*.5,'same original peach pixels must now primarily resolve to the true interior or sky');
    console.log('R21 front-left original lens and retained PNG crop:',{oldPeach,nowRecessed,cavity,visible,rearLight});
  }
  report.push({id,punched,recess,front,litCard,triangles:wall.geometry.index.count/3});batch.dispose();
}
await render(null);console.log(JSON.stringify(report));
