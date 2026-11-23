import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(relative){
  const src=readFileSync(new URL(relative,import.meta.url),'utf8'),m={};
  new Function('exports','require',ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,require);
  return m;
}
const runtime=load('../src/components/Scene/burnOcclusion.ts').burnOcclusionBytes();
const reference=load('../art-source/burnOcclusionBake.ts').burnOcclusionBytes();
assert.deepEqual(runtime,reference);
console.log('PASS all 18,432 courtyard visibility samples match the authored three-ember occlusion bake.');
