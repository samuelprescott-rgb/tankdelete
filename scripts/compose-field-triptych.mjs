// Offline, CPU only. Run: node scripts/compose-field-triptych.mjs micro-r25
// --scratch builds a functional gallery in the OS temp directory without touching either capture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access,mkdtemp,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {basename,dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const req=createRequire(import.meta.url);
let sharp;try{sharp=req('sharp');}catch{sharp=createRequire(process.execPath)('sharp');}
const [candidate,flag]=process.argv.slice(2),scratch=flag==='--scratch';
assert(/^micro-r(?:1[5-9]|[2-9]\d|\d{3,})$/.test(candidate)&&(!flag||scratch)&&process.argv.length<=4,'Use micro-r15 or later and optional --scratch');
const concept=fileURLToPath(new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/',import.meta.url)),game=join(concept,'game'),stages=['micro-r14',candidate];
const dest=join(game,candidate,'direction-review'),exists=async f=>{try{await access(f);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
if(!scratch)assert(!await exists(dest),'Refusing to replace an existing direction-review');
assert(await exists(join(game,candidate,'receipt.json')),'Candidate capture is missing');
const files=new Map(),sources=new Map(),groups=new Map(),cameraMeta={};
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const digest=async f=>{const h=createHash('sha256');for await(const b of createReadStream(f))h.update(b);return h.digest('hex');};
async function add(path,expected){
  const key=relative(concept,path);assert(!key.startsWith('..'));
  if(!files.has(key)){const sha256=await digest(path);const meta=/\.(png|jpg)$/i.test(path)?await sharp(path).metadata():null;
    files.set(key,{path:key,sha256,...(meta?{width:meta.width,height:meta.height}:{})});}
  const obj=files.get(key);if(expected){assert.equal(obj.sha256,expected,'Capture digest differs: '+key);obj.captureHashMatched=true;}return obj;
}
async function json(root,rel){const f=join(root,rel);await add(f);return JSON.parse(await readFile(f,'utf8'));}
const listed=(rows,id)=>{const s=rows.filter(x=>x.id===id);assert.equal(s.length,1,id);return s[0];};
function row(group,title,...paths){if(!groups.has(group))groups.set(group,[]);groups.get(group).push({title,paths});}
const scenes=[
  {id:'01-river-crossing',title:'River crossing',color:'#ddb577',rows:[['river-bank','Bank / fixed inspection camera'],['river-chase','Driving / production chase with HUD']],
   note:['Follow the bridge through the bend.','Compare the tank silhouette, shoreline,','ridge layers and warm sky.']},
  {id:'02-embassy-after-dark',title:'Embassy after dark',color:'#9abfd1',rows:[['embassy-chase','Forecourt / production chase with HUD'],['contact','Command contact / selected player-film frame']],
   note:['Read the facade and the threat together.','Compare the sign, wet ground and silhouette','at the distance the player actually sees.']},
  {id:'03-hidden-materials',title:'Hidden materials',color:'#b5bf8b',rows:[['bark','Bark / fixed near-surface inspection'],['water','Water / fixed near-surface inspection'],['sandbag','Burlap / fixed near-surface inspection']],
   note:['Look for glyphs inside the material.','Open the originals at native size. A reduced','plate is not a glyph-density measurement.']},
];
for(const s of scenes)s.concept=await add(join(concept,s.id+'.png'));
const displayStage=s=>s.replace('micro-r','R');
for(const stage of stages){
  const root=join(game,stage),env=await json(root,'receipt.json'),surface=await json(root,'surface-receipt.json');
  for(const data of [env,surface]){assert.equal(data.stage,stage);assert.equal(data.pass,true);assert.deepEqual(data.errors,[]);}
  const stageMap=new Map();sources.set(stage,stageMap);cameraMeta[stage]={};
  assert.equal(env.builds.length,1,'Expected one capture build per stage');const bundle=basename(env.builds[0]);
  for(const [ids,data,prefix] of [[['river-bank','river-chase','embassy-chase'],env,''],[['bark','water','sandbag'],surface,'surface-']]){
    for(const id of ids){const shot=listed(data.shots,id),source=await add(join(root,prefix+id+'.png'),shot.sha256);
      assert.equal(basename(shot.bundle),bundle,'Mixed capture bundles: '+id);
      assert.deepEqual([source.width,source.height],[1920,1080]);stageMap.set(id,source);
      cameraMeta[stage][id]={camera:shot.camera||'fixed near-surface',fov:shot.verticalFov??shot.fov,eye:shot.eye,quaternion:shot.quaternion,bundle:shot.bundle};}
  }
  const player=await json(root,'command/player-chase.json'),contact=player.picks.find(p=>p.name==='contact');
  assert.equal(basename(player.bundle),bundle,'Contact film is from a different build');
  assert(contact?.frame&&basename(contact.frame)===contact.frame,'No ordinary contact-frame receipt');
  const raw=join(root,'command/chase-frames',contact.frame),alias=join(root,'command/player-contact.jpg');
  const picked=await add(await exists(alias)?alias:raw);if(await exists(raw))assert.equal(picked.sha256,await digest(raw),'Contact JPEG differs from selected film frame');
  assert.deepEqual([picked.width,picked.height],[1920,1080]);stageMap.set('contact',picked);
  cameraMeta[stage].contact={camera:'selected ordinary chase film frame; action-dependent',frame:contact.frame,eye:contact.camera,direction:contact.cameraDir,bundle:player.bundle};
}
const notes='Full originals fitted proportionally in labeled cells. No crop, retouch, grading, sharpening or compositing within the source frame. Live actors, weather and exposure can vary; the concept is not a registered camera match.';
for(const s of scenes)for(const [id,label] of s.rows)row(s.title,label,...stages.map(st=>sources.get(st).get(id)));
const pairs=async(group,title,relatives)=>{
  const p=await Promise.all(stages.map(async(s,i)=>{const choices=Array.isArray(relatives[i])?relatives[i]:[relatives[i]];for(const f of choices){const path=join(game,s,f);if(await exists(path))return add(path);}return null;}));
  if(p.some(Boolean))row(group,title,...p);
};
const same=(path)=>[path,path];
for(const id of ['pack','helmet','load-bearing','radio','local-scout'])await pairs('Field kit · actor inspection',id,same('kit/'+id+'.png'));
for(const id of ['scout-front','scout-rear'])await pairs('Field kit · actor inspection',id,same('scout/'+id+'.png'));
for(const [label,file] of [['Tank / shark-mouth bow','tank-bow'],['Tank / flank','tank-flank'],['River / hero study','river-hero'],['Command / front portrait','front-portrait'],['Command / opposite profile','opposite-profile']])await pairs('Actor & armor · inspection cameras',label,same('command/'+file+'.png'));
for(const route of ['campaign','embassy'])for(const phase of ['seated-near','seated-reverse','at-sill','ground-handoff','cabin-empty']){
  const f=route+'-'+phase+'.png';await pairs('Transport · cabin inspection cameras',route+' / '+phase,[['cabin/baseline-'+f,'cabin/'+f],'cabin/'+f]);}
for(const [label,file] of [['Fig roots','shore/bank-fig-roots.png'],['Wet ledge','shore/bank-wet-ledge.png'],['River scenic','river-scenic.png'],['Embassy scenic','embassy-scenic.png'],['Embassy facade','embassy-facade.png']])await pairs('Environment · inspection cameras',label,same(file));
for(const [label,file] of [['River / player chase','conditions/river-player.mp4'],['Embassy / player chase','conditions/embassy-player.mp4'],['Command / ordinary player chase','command/boss-player-chase.mp4'],['Command / inspection walk','command/boss-walk.mp4']])await pairs('Motion · original MP4s',label,same(file));
for(const [label,file] of [['World cameras','receipt.json'],['Material cameras','surface-receipt.json'],['Player-contact frame selection','command/player-chase.json'],['Field kit cameras','kit/kit.json'],['Local scout cameras','scout/kit.json'],['Shore cameras','shore/receipt.json'],['River film','conditions/river-film.json'],['Embassy film','conditions/embassy-film.json']])await pairs('Capture receipts',label,same(file));
for(const route of ['both','campaign','embassy'])await pairs('Capture receipts','Cabin / '+route,['cabin/transport-cabin-baseline-'+route+'.json','cabin/transport-cabin-'+route+'.json']);
const out=scratch?await mkdtemp(join(tmpdir(),'ghost-field-direction-')):await mkdtemp(join(dirname(dest),'.direction-review-'));
const linkRoot=scratch?out:dest,href=obj=>relative(linkRoot,join(concept,obj.path)).split('/').map(encodeURIComponent).join('/');
const w=2400,col=748,gap=32,left=46,hImg=421,rowH=469,top=190;
const t=(x,y,sz,str,fill='#e8ebdf',weight='400')=>`<text x="${x}" y="${y}" font-family="Helvetica,Arial,sans-serif" font-size="${sz}" font-weight="${weight}" fill="${fill}">${xml(str)}</text>`;
const svg=(str,h)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${str}</svg>`);
for(const [n,s] of scenes.entries()){
  const h=top+rowH*s.rows.length+60,cs=[0,1,2].map(i=>left+i*(col+gap)),layers=[];
  let type=t(left,50,22,'GHOST SIGNAL     /     FIELD DIRECTION',s.color,'700')+t(left,116,64,s.title)+t(2100,80,30,'PLATE   0'+(n+1),'#a7afa2');
  for(const [i,legend] of ['01   BEFORE   /   '+displayStage(stages[0]),'02   CANDIDATE   /   '+displayStage(candidate),'03   APPROVED CONCEPT   /   NOT GAMEPLAY'].entries())type+=t(cs[i],168,25,legend,s.color,'700');
  const panel=async(obj,x,y)=>{const source=join(concept,obj.path),input=await sharp(source).resize(col,hImg,{fit:'contain',background:'#0c1214'}).removeAlpha().png().toBuffer();layers.push({input,left:x,top:y});};
  for(const [j,[id,label]] of s.rows.entries()){
    const y=top+j*rowH;for(const [i,st] of stages.entries()){await panel(sources.get(st).get(id),cs[i],y);type+=t(cs[i],y+hImg+27,23,label,'#cbd2c9');}
  }
  await panel(s.concept,cs[2],top);type+=t(cs[2],top+hImg+27,23,'Illustrated art direction / full reference frame','#cbd2c9');
  const ry=top+rowH+52;type+=t(cs[2],ry,24,'WHAT TO LOOK FOR',s.color,'700');
  for(const [i,line] of s.note.entries())type+=t(cs[2],ry+56+i*36,28,line);
  type+=t(cs[2],ry+218,22,'Different composition, lens and scale.','#cbd2c9')+t(cs[2],ry+249,22,'Not a pixel-aligned comparison.','#cbd2c9');
  type+=t(left,h-20,22,'FULL FRAMES  /  REDUCED TO FIT  /  ORIGINALS + CAMERA RECEIPTS IN THE OFFLINE INDEX','#a7afa2');
  layers.unshift({input:svg(type,h),left:0,top:0});
  await sharp({create:{width:w,height:h,channels:3,background:'#162021'}}).composite(layers).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(join(out,s.id+'.jpg'));
}
const a=(url,label)=>'<a href="'+xml(url)+'">'+xml(label)+'</a>',title='Ghost Signal · Field direction';
const tables=[...groups].map(([group,rows])=>'<details><summary>'+xml(group)+'</summary><table><thead><tr><th>View</th>'+stages.map(s=>'<th>'+displayStage(s)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>'+xml(r.title)+'</td>'+r.paths.map(x=>'<td>'+(x?a(href(x),x.width?x.width+' × '+x.height:'Original '+x.path.split('.').pop().toUpperCase()):'Not retained')+'</td>').join('')+'</tr>').join('')+'</tbody></table></details>').join('');
const style='*{box-sizing:border-box}body{margin:0;background:#162021;color:#e8ebdf;font:17px/1.5 system-ui,sans-serif}main{max-width:1570px;margin:0 auto;padding:36px clamp(14px,4vw,66px)}h1{font:500 clamp(42px,6vw,88px)/1 Georgia,serif;margin:.16em 0 .27em}h2{font-size:26px;margin:.3em 0}p{max-width:83ch}.eyebrow{color:#deb77d;font:bold 12px/1.6 ui-monospace,monospace;letter-spacing:.15em}a{color:#d5dbc4;text-underline-offset:3px}nav,.links{display:flex;flex-wrap:wrap;gap:8px 24px}nav{margin:18px 0}section{padding:26px 0;border-top:1px solid #445150}img{display:block;width:100%;height:auto;background:#162021}details{border-top:1px solid #445150;padding:14px 0}summary{cursor:pointer;font-weight:600}table{border-collapse:collapse;margin:12px 0}td,th{text-align:left;padding:6px 20px 6px 0}footer{color:#cad0c9}.intro{margin:0 0 22px}@page{size:A3 landscape;margin:9mm}@media print{body{background:white;color:black}main{max-width:none;padding:0}header,footer,section h2,.links,section>p{display:none}.plate{padding:0;border:0;break-inside:avoid;break-after:page}.plate img{width:100%;max-height:267mm;object-fit:contain}.plate:last-of-type{break-after:auto}}';
const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>'+style+'</style><main><header><div class="eyebrow">TANKDELETE  /  ART DEPARTMENT  /  COMPARISON FILE</div><h1>Ghost Signal</h1><p class="intro"><strong>'+displayStage(stages[0])+' before · '+displayStage(candidate)+' candidate · approved concept.</strong> Read left to right. The images at right are direction, not gameplay.</p><p>'+xml(notes)+' An ordinary command encounter is selected by event, not by pose or timestamp. No parity or performance verdict is implied.</p><nav>'+scenes.map((s,i)=>a('#'+s.id,'0'+(i+1)+' / '+s.title)).join('')+a('#sources','Originals & motion')+'</nav></header>'+scenes.map(s=>'<section class="plate" id="'+s.id+'"><h2>'+xml(s.title)+'</h2><a href="'+s.id+'.jpg"><img src="'+s.id+'.jpg" alt="'+xml(s.title+' — '+displayStage(stages[0])+', '+displayStage(candidate)+' and concept side by side')+'"></a><p class="links">'+a(s.id+'.jpg','Open plate')+a(href(s.concept),'Open original concept')+s.rows.map(([id,label])=>a(href(sources.get(candidate).get(id)),displayStage(candidate)+' / '+label.split(' / ')[0])).join('')+'</p></section>').join('')+'<footer id="sources"><div class="eyebrow">SOURCE REGISTER</div><h2>Originals &amp; motion</h2><p>These links open files already on disk. Expand any category to compare full-size stills, run the original clips or inspect the camera records. Leave this gallery inside its concept folder when sharing it; it contains no copies of the original media.</p>'+tables+'<p>'+a('provenance.json','SHA-256 file manifest & camera metadata')+'</p></footer></main></html>';
await writeFile(join(out,'index.html'),html);
for(const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g))if(url[0]!=='#'&&url!=='provenance.json'){const path=decodeURIComponent(url);await access(path.startsWith('..')?resolve(linkRoot,path):join(out,path));}
const outputs={};for(const filename of await readdir(out))outputs[filename]=await digest(join(out,filename));
await writeFile(join(out,'provenance.json'),JSON.stringify({stages,method:notes,pathsRelativeTo:'ghost-signal-microcode-01',files:[...files.values()],cameraMeta,plateOutputs:outputs},null,2)+'\n');
if(!scratch){assert(!await exists(dest));await rename(out,dest);}
console.log(join(scratch?out:dest,'index.html'));
