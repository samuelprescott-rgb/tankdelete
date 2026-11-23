import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import ts from 'typescript';
const source=await readFile(new URL('../src/lib/radar.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {setRadarOffset}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for(let i=0;i<32;i++){
  const yaw=i*Math.PI/16, hull=new THREE.Group();hull.rotation.y=yaw;hull.position.set(7.25,0,-12.5);
  for(const [x,z] of [[0,-12],[8,0],[-7,3],[1,28]]){
    const p=hull.localToWorld(new THREE.Vector3(x,0,z)), out={x:0,y:0};
    setRadarOffset(out,p.x-hull.position.x,p.z-hull.position.z,Math.cos(yaw),Math.sin(yaw));
    assert.ok(Math.abs(out.x-x)<1e-9 && Math.abs(out.y-z)<1e-9,'Radar must agree with the hull-local bearing at '+yaw);
  }
}
console.log('128 real Three hull bearings agree with the radar, including forward, rear and both sides.');
