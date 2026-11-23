// Use original camera plates only. Reject mismatched build hashes, lenses or resolutions.
import {access,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const sharp=createRequire(import.meta.url)('sharp'),[stage]=process.argv.slice(2);
assert(/^micro-r[1-9][0-9]*$/.test(stage));
const root=new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/game/',import.meta.url);
const file=(s)=>new URL(s,root);
const stages=['micro-before',stage], reports=await Promise.all(stages.map(s=>readFile(file(s+'/receipt.json'),'utf8').then(JSON.parse)));
assert(reports.every(r=>r.pass)&&reports[0].builds[0]!==reports[1].builds[0]);
const rows=[['river-bank','Bridge and riverbank'],['embassy-scenic','Embassy under siege'],['river-chase','Campaign driving view'],['embassy-chase','Horde driving view'],['river-scenic','Village skyline'],['embassy-facade','Embassy entrance']];
const sha=b=>createHash('sha256').update(b).digest('hex');
let sections='';const plates=[];
for(const [i,[id,label]] of rows.entries()){
 const shots=reports.map(r=>r.shots.find(s=>s.id===id));assert(shots.every(s=>s.canvas[0]===1920&&s.canvas[1]===1080));
 if(shots[0].camera==='fixed'){assert.deepEqual(shots[0].eye,shots[1].eye);assert.deepEqual(shots[0].look,shots[1].look);}
 const cap=[];
 for(const [j,s] of stages.entries()){
  const p=s+'/'+id+'.png',b=await readFile(file(p));assert.equal(sha(b),shots[j].sha256);
  if(i<2)plates.push({input:await sharp(b).resize(740,416).png().toBuffer(),left:j*742,top:i*418});
  cap.push('<figure><a href="'+p+'"><img src="'+p+'" loading="lazy" alt="'+label+'"></a><figcaption>'+(j?'Candidate':'Before')+' · '+label+' · 1920×1080</figcaption></figure>');
 }
 sections+='<section><h2>'+label+'</h2><div>'+cap.join('')+'</div></section>';
}
await sharp({create:{width:1482,height:834,channels:3,background:'#142027'}}).composite(plates).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(file(stage+'/in-game-comparison.jpg').pathname);
const extras=[
  ...(stage==='micro-r14'?[
    [stage+'/weather-and-hills.png','Last revision: hillside and fine rain · unaltered 1:1 crops, R13 left / R14 right'],
    ['micro-r13/armor-before-after.jpg','R13 close-ups · tank bow and hull before and after'],
    ['micro-r13/infantry-before-after.jpg','R13 close-ups · 3D infantry before and after'],
    ['micro-r13/named-allies/portraits-before-after.jpg','R13 close-ups · three named heroes before and after'],
    ['micro-r13/heroes/boss-player-chase.mp4','R13 · actual wave-four boss in the ordinary player camera'],
    ['micro-r13/aviation/campaign-contact.jpg','R13 · actual side landing and crash sequence'],
  ]:[]),
  [stage+'/surface-comparison.png','Bark, water and sandbag · 1:1 crops'],
  [stage+'/armor-before-after.jpg','Tank bow and flank · matched cameras'],
  [stage+'/infantry-before-after.jpg','Rifleman and radio operator · matched cameras'],
  [stage+'/stride/field-stride-filmstrip.jpg','Animated infantry · real opposite footfalls'],
  [stage+'/named-allies/portraits-before-after.jpg','Named heroes · portraits before and after, verified from the game'],
  [stage+'/named-allies/named-allies.jpg','Three named friendly heroes · full bodies and portraits'],
  [stage+'/heroes/front-portrait.png','Two-headed monster · live 3D sculpt'],
  [stage+'/heroes/boss-player-chase.mp4','Wave four · ordinary player-camera movie'],
  [stage+'/aviation/campaign-contact.jpg','Aircraft flyover and crash · sequence'],
  ['1440p/'+stage+'/receipt.json','2560×1440 camera and build receipt'],
];
const verified=[];
for(const [url,label] of extras){try{await access(file(url));verified.push('<a href="'+url+'">'+label+'</a>');}catch{}}
const extraSection=verified.length?'<section><h2>Inspect the details</h2><ul>'+verified.map(v=>'<li>'+v+'</li>').join('')+'</ul></section>':'';
const styled='body{background:#10191e;color:#ece5d3;font:16px/1.5 system-ui;margin:3vw}header,p{max-width:72ch}h1{font-size:2.4rem}a{color:#e7ba79}section{margin:2em 0}section div{display:grid;grid-template-columns:1fr 1fr;gap:.65em}img{display:block;width:100%;height:auto}figure{margin:0}figcaption,small{color:#c0bab0}@media(max-width:650px){section div{grid-template-columns:1fr}}';
await writeFile(file(stage+'/../review-'+stage+'.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ghost Signal — production art review</title><style>'+styled+'</style><header><h1>Ghost Signal · in-game art review</h1><p>Actual screenshots. Open either side for the unaltered PNG. Scenic images use the same camera. Chase images retain the game HUD and natural camera. Actors, fire and rain are live, not identical between captures.</p><p>Approved concept art (not gameplay): <a href="../01-river-crossing.png">River crossing</a> · <a href="../02-embassy-after-dark.png">Embassy</a> · <a href="../03-hidden-materials.png">Hidden materials</a>.</p></header>'+extraSection+sections+'<p><a href="micro-before/receipt.json">Before capture record</a> · <a href="'+stage+'/receipt.json">Candidate capture record</a></p></html>');
console.log(file('review-'+stage+'.html').pathname);
