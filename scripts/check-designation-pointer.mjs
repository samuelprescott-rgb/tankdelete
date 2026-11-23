import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {Vector2,Vector3} from 'three';
const file=await readFile(new URL('../src/lib/designationPointer.ts',import.meta.url),'utf8');
const code=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {readDesignationPress,faceDesignation}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
for(const size of [{width:1920,height:1080,left:0,top:0},{width:800,height:600,left:60.5,top:37.25}]){
  const result=new Vector2(1,-1),x=size.left+size.width/2,y=size.top+size.height*.3;
  assert.ok(readDesignationPress(result,{clientX:x,clientY:y},size));assert.equal(result.x,0);assert.ok(Math.abs(result.y-.4)<1e-10);
  assert.ok(!readDesignationPress(result,{clientX:size.left-1,clientY:y},size));
  assert.ok(!readDesignationPress(result,{clientX:NaN,clientY:y},size));
}
for(const fallback of [new Vector3(1,0,0),new Vector3(0,.2,-1)]){
  assert.deepEqual(faceDesignation({x:0,z:-4},{x:0,z:8},fallback).toArray(),[0,0,1]);
}
assert.deepEqual(faceDesignation({x:0,z:0},{x:0,z:0},new Vector3(-1,0,0)).toArray(),[-1,0,0]);
console.log('Designation uses the current physical press and its world bearing even without hover; rejects outside and invalid input.');
