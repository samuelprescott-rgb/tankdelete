// Driver-first index: link original production evidence; never stage a new
// presentation camera inside stills or label material inspections as gameplay.
import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
const [driver,detail,reveal]=process.argv.slice(2).map(f=>resolve(f));
const rec=JSON.parse(await readFile(join(driver,'provenance.json'),'utf8'));
const ref=p=>relative(driver,p);
const url=(p,t)=>'<a href="'+ref(p)+'">'+t+'</a>';
const gameLink=(key,i)=>ref(rec[key].observations[i].raw);
const card=(key,title,copy)=>'<section><h2>'+title+'</h2><p>'+copy+'</p><div class="pair">'+[0,1].map(i=>{
  const src=gameLink(key,i),m=rec[key].observations[i].distance.toFixed(1);
  return '<figure><a href="'+src+'"><img src="'+src+'" alt="'+['Original','Revised'][i]+' '+title+'"></a><figcaption>'+['Before','After'][i]+' &middot; '+m+' m &middot; open full frame</figcaption></figure>';
}).join('')+'</div></section>';
const review=['<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Ghost Signal / From the tank</title><style>',
':root{color-scheme:dark}body{background:#101718;color:#e5e0d3;font:17px/1.5 system-ui;max-width:1440px;margin:auto;padding:clamp(16px,4vw,60px)}h1{font-size:clamp(32px,5vw,66px);margin:.05em 0 .2em}h2{margin:0;color:#f0e5d4}header{max-width:860px}.tag,figcaption{font:13px/1.6 ui-monospace,monospace;color:#adbfb7}.tag{letter-spacing:.1em}section{padding:30px 0;border-top:1px solid #40504e;margin-top:16px}p{max-width:85ch}.pair{display:grid;grid-template-columns:1fr 1fr;gap:9px}figure{margin:0}a{color:#a6d6cc}img,video{width:100%;height:auto;background:#090e0f}video{max-width:1080px}@media(max-width:720px){.pair{grid-template-columns:1fr}}',
'</style><header><div class="tag">GHOST SIGNAL / CHARACTER REVIEW</div><h1>From the tank</h1><p>The full scene is the test. These are the live river crossing and embassy from the unaltered third-person camera. No reframing or lighting changes for the pictures. Compare what reads while driving; the portrait enlargements are available separately.</p></header>',
card('gunner','River crossing · crew','Watch the helmet and shoulders against the olive turret and far bank.'),
card('scout','Scout on the bank','Look for the head and shoulder shape rather than the HUD marker. Moving infantry are matched by identity, range and heading as closely as the two live runs allow.'),
card('boss','Embassy · the two-headed boss','The two heads cross the same courtyard mark in ordinary rain and firelight, with the HUD present.'),
'<p><video controls preload="none" src="boss-stride-before-after.mp4"></video><br>Normal chase-camera approach: original left, revised right.</p>',
card('undead-16','Night wave','Ordinary undead are included as a visibility control; their red eyes are not the principal change.'),
'<section><h2>The masks at half health</h2><p>The original Joe and Harris cutouts fall intact, revealing the two modeled heads. '+url(join(detail,'mask-drop-health.mp4'),'Inspection-camera clip with recorded health')+'; '+url(join(detail,'mask-drop.mp4'),'uncaptioned clip')+'.</p></section>',
'<section><h2>Secondary: surface and animation inspection</h2><p>'+url(join(detail,'index.html'),'Close-up gallery: human faces, hands, both monster heads and the mask reveal')+' &middot; '+url(join(detail,'boss-windup.png'),'Matched player-facing attack pose (inspection lens, not chase camera)')+'</p></section>'];
if(reveal){const p=join(reveal,'driver-mask-drop.mp4');try{await access(p);review.splice(review.length-1,0,'<p><video controls preload="metadata" src="'+ref(p)+'"></video><br>Mask transition from the normal player camera.</p>');}catch{}}
for(const k of ['gunner','scout','boss','undead-16'])for(const f of rec[k].observations)await access(f.raw);
await writeFile(join(driver,'from-the-tank.html'),review.join('\n')+'</html>');
