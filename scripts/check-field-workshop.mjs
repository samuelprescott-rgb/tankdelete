// Render the real HTML controls and dispatch their own JSX handlers. No
// WebGL, browser timing, real file access or synthetic gameplay damage.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createElement as el, isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';
const entry=fileURLToPath(new URL('../src/components/HUD/FieldKitPanel.tsx',import.meta.url));
const out=await build({configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},
  build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
const js=out.output.find(v=>v.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const {FieldKitPanel, FieldKitView}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const archives=[
  {id:'chancery',label:'Chancery · atlas.pdf',health:200,maxHealth:200},
  {id:'records',label:'Records · tickets.txt',health:192,maxHealth:200},
  {id:'dispatch',label:'Dispatch · lost.csv',health:0,maxHealth:200}];
let selected=null,proceeded=false;
const props={wave:3,archives,deadline:Date.now()+12000,kit:null,onSpend:id=>(selected=id,true),onProceed:()=>(proceeded=true,true)};
let html=renderToStaticMarkup(el(FieldKitPanel,props));
assert.match(html,/aria-label="Between-wave field kit"/);assert.match(html,/data-game-ui/);
assert.match(html,/Brace · block 1 hit/);assert.match(html,/Patch · \+8 integrity/);
assert.match(html,/Skip kit · start wave 3 now/);assert.doesNotMatch(html,/lost.csv/);
function buttons(node){
  if(Array.isArray(node))return node.flatMap(buttons);
  if(!isValidElement(node))return [];
  return node.type==='button'?[node]:buttons(node.props.children);
}
const choices=buttons(FieldKitView({...props,seconds:12}));
assert.ok(choices.every(e=>e.props.type==='button'&&typeof e.props.onClick==='function'));
assert.equal(choices.length,4);
for(const [i,target] of ['hull','chancery','records'].entries()){
  choices[i].props.onClick();assert.equal(selected,target);
}
choices.at(-1).props.onClick();assert.equal(proceeded,true);
for(const [type,target,amount,copy] of [['plate','hull',1,'Spare plate fitted'],['brace','chancery',1,'Braced Chancery · atlas.pdf'],
    ['patch','records',8,'Patched Records · tickets.txt · +8 integrity']]){
  const data={...props,kit:{type,target,amount}};html=renderToStaticMarkup(el(FieldKitPanel,data));
  assert.ok(html.includes(copy));assert.match(html,/role="status"/);assert.match(html,/Start wave 3 now/);
  assert.equal(buttons(FieldKitView({...data,seconds:7})).length,1,'Only the immediate proceed action remains');
}
console.log('Field workshop real React UI: living files only, correct repair quantity, one-shot kit, labeled native buttons, click destinations, confirmation, immediate proceed.');
