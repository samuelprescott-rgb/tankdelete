// Render the real menu and HUD without WebGL or any filesystem bridge.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createElement, isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';

async function load(file) {
  const entry=fileURLToPath(new URL('../src/components/'+file+'.tsx',import.meta.url));
  const out=await build({configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},
    build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
  const js=out.output.find(v=>v.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
function buttons(node) {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement(node)) return [];
  return node.type==='button'?[node]:buttons(node.props.children);
}
const [{DirectoryPicker},{HUD}]=await Promise.all([load('DirectoryPicker'),load('HUD')]);
const render=(component,props)=>renderToStaticMarkup(createElement(component,props));
const noop=()=>{};
const menu={onStartCampaign:noop,onStartTraining:noop,onOpenCleanup:noop};
const fresh=render(DirectoryPicker,menu);
let secretCalls=0;
const secretButtons=buttons(DirectoryPicker({...menu,onSecretHorde:()=>secretCalls++}));
const secret=secretButtons.find(b=>b.props['aria-label']==='Tune hidden Horde channel');assert.ok(secret);
secret.props.onClick();assert.equal(secretCalls,1);
assert.match(fresh,/Start Campaign/);assert.match(fresh,/Boot Camp/);assert.match(fresh,/Cleanup Desk/);
assert.match(fresh,/bridge is open/);assert.match(fresh,/tank guarding the rear hut/);assert.match(fresh,/Demolish the outpost/);assert.doesNotMatch(fresh,/press F|Your call unlocks/i);
assert.doesNotMatch(fresh,/Launch Horde Mode|Relay|Vault|folder portal/i);
assert.match(render(DirectoryPicker,{...menu,onStartHordeMode:noop}),/Launch Horde Mode/);
const hud={bonusPhase:'locked',bonusWave:0,bonusTotalWaves:4,bonusRemaining:0,bonusBreaches:0,bonusMaxBreaches:3,
  bossAllies:[],bossAlliesVisible:false,deletedCount:0,deletedBytes:0,fileCount:8,folderCount:0,markedCount:0,markedBytes:0,
  score:0,weaponMode:'cannon',cannonReload:{ready:true,progress:1},machineGunHeat:{},flameFuel:1,napalmUntil:0,
  tankIntegrity:100,friendlyCount:4,hostileCount:3,missionTotal:1,missionRemaining:1,radioTrackName:'Ready'};
const campaign={...hud,campaignBrief:'Clear the field and approach the rear hut.'};
const near=render(HUD,campaign);
assert.match(near,/Campaign objective/);assert.match(near,/Clear the field/);
assert.doesNotMatch(near,/Bonus cleanup|confirmed duplicate|portals|Activate hut radio/i);
assert.match(render(HUD,hud),/Trash the confirmed duplicate/,'Boot Camp keeps its separate simulated file exercise');
assert.doesNotMatch(near,/aria-keyshortcuts="F"|Activate hut radio/i);
console.log('PASS campaign briefing: playable modes, no F prompt or surprise spoiler.');
