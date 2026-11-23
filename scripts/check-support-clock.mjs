import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {act,reconciler} from '@react-three/fiber';
import * as THREE from 'three';
import ts from 'typescript';
const source=await readFile(new URL('../src/hooks/useSupportCooldown.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from ['"]react['"]/g,'from '+JSON.stringify(import.meta.resolve('react')));
const {useSupportCooldown}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const original=Date.now;let now=500,id=0,clock,renders=0;
const timers=new Map();Date.now=()=>now;
globalThis.window={setTimeout:(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;},clearTimeout:key=>timers.delete(key)};
const fail=e=>{throw e},root=reconciler.createContainer({getState:()=>({scene:new THREE.Scene(),internal:{active:false,frames:0},invalidate(){}})},1,null,false,null,'',fail,fail,fail,null);
function World(){clock=useSupportCooldown(500);renders++;return null;}
async function advance(ms){now+=ms;await act(async()=>{for(const [id,t] of timers)if(t.at<=now&&timers.delete(id))t.fn();});}
try{
 await act(async()=>reconciler.updateContainer(React.createElement(World),root,null,null));
 assert.equal(clock.cinematic,false);assert.equal(timers.size,0);
 await act(async()=>clock.start(10));const first=renders;assert.equal(clock.readyAt.current,10500);assert.equal(timers.size,2);
 for(let i=0;i<94;i++)await advance(100);
 assert.equal(renders,first,'Readout ticks must never invalidate the world');assert.equal(clock.cinematic,true);
 await advance(100);assert.equal(clock.cinematic,false);assert.equal(clock.until,10500);
 await advance(500);assert.equal(clock.until,0);assert.equal(clock.readyAt.current,0);assert.equal(timers.size,0);
 await act(async()=>clock.start(10));await advance(1000);await act(async()=>clock.start(15));
 await advance(9500);assert.ok(clock.cinematic,'old expiry must not release new clock');
 await act(async()=>clock.start(0));assert.equal(timers.size,0);
 await act(async()=>clock.start(10));await act(async()=>reconciler.updateContainer(null,root,null,null));assert.equal(timers.size,0);
}finally{Date.now=original;delete globalThis.window;}
console.log('Mounted support clock: 94 visual tenths without world updates; preserved camera and ready edges; replacement, reset and unmount cancelled stale timers.');
