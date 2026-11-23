// CPU-only: exercise real pool ownership and the mounted proximity component.
// Font-worker completion is controllable; no WebGL, browser or real files.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import * as THREE from 'three';
import {build} from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
Object.defineProperty(globalThis,'window',{configurable:true,value:{document:{createElement(){}}}});
const {act,context,extend,reconciler}=await import('@react-three/fiber');
if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;
extend(THREE);
const workers=[],created=[];
class LabelText extends THREE.Mesh {
  constructor(){super(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial());this.disposals=0;created.push(this);}
  sync(callback){workers.push(callback);}
  dispose(){this.disposals++;this.geometry.dispose();}
  onBeforeRender(...args){this.lastRender=args;}
}
globalThis.__fileLabelText=LabelText;
const dir=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const entry=dir+'/virtual-file-label-pool-test.mjs';
const bundle=await build({root:dir,configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},
  plugins:[{name:'controlled-layout-worker',enforce:'pre',resolveId(id){
    if(id===entry)return id;
    if(id==='troika-three-text')return '\0controlled-text';
    if(id==='./WorldLabel')return '\0fallback-label';
  },load(id){
    if(id===entry)return ['fileLabelPool','ProximityFileLabels'].map(n=>'export * from '+JSON.stringify(dir+'/src/components/Scene/'+n)+';').join('\n');
    if(id==='\0controlled-text')return 'export const Text=globalThis.__fileLabelText;';
    if(id==='\0fallback-label')return 'export function WorldLabel(){throw Error("Unexpected unpooled label")}';
  }}],build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
const source=bundle.output.find(o=>o.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {createFileLabelPool,ProximityFileLabels}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const file=(path,x=0)=>({path,name:'Report '+path+'.txt',scale:1.25,position:[x,.4,8]});
const drain=()=>{for(const callback of workers.splice(0))callback?.();};
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));
let notifications=0;
const pool=createFileLabelPool();
const replay=pool.retain(()=>notifications++);replay();
const release=pool.retain(()=>notifications++);
const files=[file('a'),file('b',2),file('c',4)];
pool.reconcile(files);pool.reconcile(files);await flush();
assert.equal(created.length,6);assert.equal(workers.length,6);assert.equal(pool.size,3);
assert.deepEqual(pool.preparationBatch(),[],'Unresolved glyphs never enter the renderer');
drain();assert.equal(notifications,6);
const plain=pool.get('a',false),armed=pool.get('a',true);
assert.notEqual(plain,armed);assert.equal(plain.text,'Report a.txt');assert.equal(armed.text,'ARMED · Report a.txt');
for(const text of [plain,armed]){
  assert.equal(text.font,'/fonts/LiberationSans-Regular.ttf');assert.equal(text.fontSize,.2);assert.equal(text.sdfGlyphSize,64);
  assert.equal(text.anchorX,'center');assert.equal(text.anchorY,'bottom');assert.equal(text.outlineWidth,.02);assert.equal(text.outlineColor,'#000000');
  assert.equal(text.rotation.y,Math.PI);assert.deepEqual(text.position.toArray(),[0,.4+1.25*1.65+.45,8]);assert.equal(text.parent,null);
}
assert.equal(plain.color,'#e6ddc3');assert.equal(armed.color,'#ffb76b');
assert.equal(plain.material,armed.material);assert.equal(plain.material.transparent,true);assert.equal(plain.material.side,THREE.DoubleSide);
const [proxy]=pool.preparationBatch();assert.equal(proxy.geometry,armed.geometry);assert.equal(proxy.material,armed.material);
proxy.onBeforeRender(1,2,3,4,5,6);assert.deepEqual(armed.lastRender,[1,2,3,4,5,6]);assert.equal(armed.parent,null);
pool.prepared();assert.deepEqual(pool.preparationBatch(),[]);
for(let i=0;i<100;i++){assert.equal(pool.get('a',i%2===0),i%2===0?armed:plain);}
assert.equal(workers.length,0,'Arming/disarming never starts another font-worker job');
pool.reconcile(files.slice(1));assert.equal(pool.get('a',true),undefined);assert.equal(plain.disposals,0);
pool.reconcile(files);assert.equal(pool.get('a',false),plain);assert.equal(pool.get('a',true),armed);assert.equal(workers.length,0,'Undo reuses its original layouts');
pool.reconcile(Array.from({length:80},(_,i)=>file('page-'+i)));assert.equal(pool.size,80);
assert.ok(plain.disposals>0&&armed.disposals>0);drain();
pool.reconcile(Array.from({length:81},(_,i)=>file('next-'+i)));assert.equal(pool.size,80);assert.equal(pool.get('next-80',true),undefined,'Overflow keeps a bounded cache and uses the component fallback');
const late=pool.get('next-0',true),beforeExit=notifications;
release();await flush();assert.equal(pool.size,0);assert.ok(late.disposals>0);drain();
assert.equal(notifications,beforeExit,'Late worker completion cannot notify a departed scene');assert.ok(late.disposals>=2,'Late-completed geometry is released too');

const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),subscriptions=new Map();
camera.position.set(0,3,-30);
let target=null,warmups=0;
const gl={isWebGLRenderer:true,xr:{enabled:false,isPresenting:false},shadowMap:{enabled:false,autoUpdate:true,needsUpdate:false},
  autoClear:true,getContext:()=>({isContextLost:()=>false}),getRenderTarget:()=>target,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,
  setRenderTarget:t=>{target=t;},render(stage){warmups++;assert.equal(stage.children.filter(o=>o.isMesh).length,1);}};
const state={scene,camera,gl,invalidate(){},internal:{active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
  subscribe(ref,priority){subscriptions.set(ref,priority);return()=>subscriptions.delete(ref);}}};
const store=Object.assign((select=v=>v)=>select(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;};
const root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const render=(blocks,marked=[])=>act(async()=>reconciler.updateContainer(React.createElement(context.Provider,{value:store},
  React.createElement(React.StrictMode,null,React.createElement(ProximityFileLabels,{blocks,markedFiles:new Set(marked)}))),root,null,null));
let time=0;
const frame=()=>act(async()=>{time+=.1;for(const [cb]of [...subscriptions].sort((a,b)=>a[1]-b[1]))cb.current({...state,clock:{elapsedTime:time}},.1);});
try{
  await render(files);await frame();assert.equal(scene.children.length,0,'Preparing detached layouts does not reveal distant file names');
  await act(async()=>drain());await frame();await frame();assert.equal(warmups,1);
  assert.equal(scene.children.length,0,'The preflight never inserts labels into the live world');
  const completedJobs=created.length;
  await render(files,['a','b','c']);await frame();
  assert.deepEqual(scene.children.map(t=>t.text),files.map(f=>'ARMED · '+f.name));
  assert.ok(scene.children.every(t=>t.color==='#ffb76b'&&t.visible));assert.equal(created.length,completedJobs);assert.equal(workers.length,0);
  const shownA=scene.children[0];await render(files);await frame();assert.equal(scene.children.length,0);
  camera.position.set(0,3,0);for(let i=0;i<5;i++)await frame();
  assert.deepEqual(scene.children.map(t=>t.text),files.map(f=>f.name));
  await render(files,['a']);await frame();assert.equal(scene.children[0],shownA);
  await render(files.slice(1),['a']);await frame();assert.ok(!scene.children.includes(shownA));
  await render(files,['a']);await frame();assert.equal(scene.children[0],shownA);assert.equal(workers.length,0);assert.equal(warmups,1);
}finally{await act(async()=>reconciler.updateContainer(null,root,null,null));await flush();}
assert.equal(subscriptions.size,0);assert.equal(scene.children.length,0);
delete globalThis.__fileLabelText;
console.log('File-label pool: exact plain/armed styling, detached bounded80-entry cache, real-resource once-only preflight, unchanged mounted visibility/selection, no hit-time layout, undo identity, paging eviction and late-worker/StrictMode cleanup passed.');
