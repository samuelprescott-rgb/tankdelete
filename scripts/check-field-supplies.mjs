import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const text=await readFile(new URL('../src/lib/fieldPickups.ts',import.meta.url),'utf8');
const m=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText).toString('base64'));
const {collectSupply:take,splitFieldDamage:hit,FIELD_PICKUPS:s}=m;
assert.equal(take('patch',100,0),null);assert.equal(take('patch',0,0),null);
assert.deepEqual(take('patch',60,3),{hp:82,plate:3});assert.deepEqual(take('patch',94,0),{hp:100,plate:0});
assert.deepEqual(take('plate',61,0),{hp:61,plate:16});assert.equal(take('plate',61,8),null);
assert.deepEqual(hit(7,16),{plate:9,hull:0});assert.deepEqual(hit(15,9),{plate:0,hull:6});assert.deepEqual(hit(18,0),{plate:0,hull:18});
for(const kits of Object.values(s)){assert.equal(kits.length,2);assert.equal(new Set(kits.map(k=>k.kind)).size,2);
 assert.equal(kits.filter(k=>k.atKills===0).length,1);assert.ok(Math.hypot(kits[0].x-kits[1].x,kits[0].z-kits[1].z)>10);}
console.log('PASS field supplies: individual kit functions, no overheal or plate stacking, damage spillover, separate contested drops in both maps.');
