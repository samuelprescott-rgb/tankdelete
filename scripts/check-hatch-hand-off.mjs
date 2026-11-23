// Exercise the actual mounted lid during the interval between the simulation
// admitting a wave and React retiring its warning cue.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import * as T from 'three';
import {act,context,extend,reconciler} from '@react-three/fiber';
import {build} from 'vite';
const entry=fileURLToPath(new URL('../src/components/Scene/CampaignTunnels.tsx',import.meta.url));
const output=await build({configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},build:{ssr:entry,write:false}});
const source=output.output.find(c=>c.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {CampaignTunnels}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(T);
const subscriber=new Set(),scene=new T.Scene(),state={scene,invalidate(){},internal:{active:false,frames:0,interaction:[],initialHits:[],
  hovered:new Map(),capturedMap:new Map(),subscribe(ref){subscriber.add(ref);return ()=>subscriber.delete(ref);}}};
const store=Object.assign((select=x=>x)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;},root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
let age=0;
const props={running:true,tankRef:{current:new T.Group()},obstacles:[],river:[],advance:()=>age},
  reset=element=>act(async()=>reconciler.updateContainer(React.createElement(context.Provider,{value:store},element),root,null,null)),
  render=cue=>reset(React.createElement(CampaignTunnels,{...props,cue})),hinge=()=>scene.getObjectByName('bamboo-hatch-hinge'),
  tick=t=>{age=t;for(const ref of subscriber)ref.current(state,1/60);return -hinge().rotation.x;};
try{
  await render({site:{x:8,z:7},batch:1});
  for(const n of ['leafy-bamboo-camouflage','tunnel-root-lined-shaft']){
    const s=scene.getObjectByName(n);
    assert(s.receiveShadow&&s.material.isMeshLambertMaterial&&s.material.vertexColors,'Live '+n+' must respond to the site light.');
  }
  const g=scene.getObjectByName('leafy-bamboo-camouflage').geometry,colors=g.getAttribute('color'),pos=g.getAttribute('position');
  const wood=[],foliage=[];
  for(let i=0;i<colors.count;i++){
    const y=pos.getY(i),v=.2126*colors.getX(i)+.7152*colors.getY(i)+.0722*colors.getZ(i);
    if(y<0)wood.push(v);else if(y>.25)foliage.push(v);
  }
  const p95=a=>a.sort((a,b)=>a-b)[Math.floor(a.length*.95)],w95=p95(wood),f95=p95(foliage);
  assert(w95>.14&&w95<.21,'Raised split-cane detail needs a visible but muted diffuse ridge: '+w95);
  assert(f95<.15&&f95>.075,'Closed foliage must retain the original soil/brush range: '+f95);
  const soil=scene.getObjectByName('tunnel-spilling-earth'),leaves=scene.getObjectByName('tunnel-falling-leaves');
  assert(tick(.016)<.07);
  assert.deepEqual([soil.count,leaves.count],[0,0]);
  assert(tick(2)>.5);
  assert(soil.count>0&&leaves.count>0&&leaves.count<12,'Both effects shed gradually during the lift.');
  const mid=leaves.instanceMatrix.version;
  tick(2);
  assert.equal(leaves.instanceMatrix.version,mid,'A frozen warning clock must keep the same litter cel.');
  const open=tick(3.97);assert(open>1.55);assert.equal(tick(0),open,'Admission reset cannot reclose the outgoing cover.');
  await render(null);assert(tick(0)>1.55&&scene.getObjectByName('spent-signal-hatch'));
  const settled=soil.instanceMatrix.version;
  assert.equal(leaves.count,12);
  tick(0);
  assert.equal(soil.instanceMatrix.version,settled,'Spent soil stays on the ground without matrix uploads.');
  await render({site:{x:-8,z:7},batch:2});
  assert.deepEqual([soil.count,leaves.count],[0,0],'A new site starts with the litter on its mat.');assert(tick(0)<.06,'The next lid starts closed.');
  console.log('PASS: matte site-lit camouflage; p95 linear albedo (weave, leaves)',w95.toFixed(3),f95.toFixed(3),'and stable admission handoff.');
}finally{await reset(null);}
