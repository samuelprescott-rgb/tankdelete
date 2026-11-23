import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/lib/cleanupDesk.ts',import.meta.url),'utf8');
const code=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020});
const id='f15405c9-8a06-4add-84e4-499f14a95b72',calls=[];
function run(protocol,hostname,which='mac',receipt='picked'){
 const exports={};const context=vm.createContext({exports,location:{protocol,hostname},navigator:{userAgent:which==='mac'?'Macintosh':'Other'},window:{
   __TAURI_INTERNALS__:{async invoke(cmd,args){calls.push([cmd,args]); if(cmd==='cleanup_review')return 'cancelled';
     return JSON.stringify({status:receipt,files:[{id,name:'test.txt',path:'/mock/only/test.txt',size:1256}]});}}}});
 vm.runInContext(code,context);return exports;
}
const browser=run('http:','127.0.0.1');assert(!browser.canPickReal());await assert.rejects(browser.pickReal());
assert(!run('tauri:','somewhere-else').canPickReal());assert(!run('tauri:','localhost','not-mac').canPickReal());assert.equal(calls.length,0);
const sample=browser.sampleSelection(),field=browser.cleanupFieldEntries(sample.files);
assert.equal(sample.files[0].name,sample.files[1].name);assert.notEqual(field[0].name,field[1].name);
assert(!JSON.stringify(field).includes('Drafts'));assert.deepEqual([...browser.nominatedChoices(field,new Set([field[1].path,'pick:unknown','/mock/only/test.txt']))],['sample-b']);
const desktop=run('tauri:','localhost');assert(desktop.canPickReal());const chosen=await desktop.pickReal();assert.equal(chosen.files[0].id,id);
assert.equal(await desktop.reviewReal('/mock/only/test.txt'),'expired');assert.equal(calls.length,1);
assert.equal(await desktop.reviewReal(id),'cancelled');assert.equal(calls[1][1].token,id);assert.deepEqual(Object.keys(calls[1][1]),['token']);
assert.equal(await run('tauri:','localhost','mac','cancelled').pickReal(),null);
const adapter=fs.readFileSync(new URL('../src-tauri/src/cleanup_mac.m',import.meta.url),'utf8');
assert.equal((adapter.match(/\btrashItemAtURL:/g)||[]).length,1);assert.doesNotMatch(adapter,/removeItemAt|moveItemAt|\bunlink\s*\(|\bsystem\s*\(|\brename\s*\(|AppleScript/);
assert.match(adapter,/coordinateWritingItemAtURL:/);assert.match(adapter,/O_EVTONLY\|O_NOFOLLOW\|O_CLOEXEC/);
assert.match(adapter,/trashItemAtURL:c\.reference/);assert.match(adapter,/NSAlertSecondButtonReturn/);
const game=fs.readFileSync(new URL('../src/GameSession.tsx',import.meta.url),'utf8');
assert.doesNotMatch(game,/\b(reviewReal|pickReal|cleanup_review|cleanup_pick)\b/);
if(process.platform==='darwin'){
 const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'tankdelete-cleanup-inert-')),'inert');
 const exec=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.error?.message);if(r.stdout)process.stdout.write(r.stdout);};
 exec('/usr/bin/clang',['-fobjc-arc','-framework','AppKit','-framework','Foundation',new URL('check-cleanup-native.m',import.meta.url).pathname,'-o',out]);exec(out,[]);
}
console.log('PASS file shortlist: browser/foreign origin fail closed, duplicate names distinguished, field contains no real paths, exact opaque nomination only, fake desktop cancel, no host delete API in game.');
