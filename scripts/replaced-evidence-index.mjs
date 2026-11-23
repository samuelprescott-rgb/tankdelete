// Local evidence artifact, not part of the game's runtime. All panels use actual
// retained release-buffer screenshots; this script never renders a scene.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const sharp=createRequire(import.meta.url)('sharp'),stage=process.argv[2];
assert(/^replaced-r\d+$/.test(stage));
const baseline=process.argv[3]??'replaced-before';
assert(/^(replaced-before|replaced-r\d+)$/.test(baseline)&&baseline!==stage);
const root=new URL('../../TankDelete-Concepts/replaced-gauntlet/',import.meta.url);
const sections=[],stack=[];
for(const [i,height] of ['1080','1440'].entries()){
 const base=height+'p/',names=[baseline,stage];
 const reports=await Promise.all(names.map(name=>readFile(new URL(base+name+'/receipt.json',root),'utf8').then(JSON.parse)));
 assert(reports.every(r=>r.pass)&&reports[0].builds[0]!==reports[1].builds[0]);
 const cards=[];
 for(const [y,scene] of ['river','embassy'].entries()){
  const view=scene+'-scenic';
  const rows=reports.map(r=>r.shots.find(s=>s.id===view));assert.deepEqual(rows[0].eye,rows[1].eye);assert.deepEqual(rows[0].look,rows[1].look);
  const links=[];
  for(const [x,name] of names.entries()){
   const src=base+name+'/'+view+'.png',b=await readFile(new URL(src,root));
   assert.equal(createHash('sha256').update(b).digest('hex'),rows[x].sha256);
   const label=x?'After':'Before';
   links.push('<a href="'+src+'"><img loading="lazy" src="'+src+'" alt="'+label+' '+scene+' fixed camera"><small>'+label+' · full PNG</small></a>');
   if(!i){
    const w=720,h=405,bar=31;
    const text=Buffer.from('<svg width="720" height="31"><rect width="720" height="31" fill="#142023"/><text x="12" y="22" font-family="Helvetica,sans-serif" font-size="16" fill="#e7ebdd">'+label.toUpperCase()+'  /  '+scene.toUpperCase()+'</text></svg>');
    stack.push({input:text,left:x*w,top:y*(h+bar)},{input:await sharp(b).resize(w,h).png().toBuffer(),left:x*w,top:y*(h+bar)+bar});
   }
  }
  cards.push('<article><h3>'+ (scene==='river'?'River crossing':'Embassy approach')+'</h3><div>'+links.join('')+'</div><p><a href="'+base+stage+'-board/'+scene+'-comparison.jpg">All three camera pairs: chase, scenic and detail</a></p></article>');
 }
 sections.push('<section id="p'+height+'"><h2>'+height+'p</h2>'+cards.join('')+'<p>Capture records: <a href="'+base+names[0]+'/receipt.json">original</a> · <a href="'+base+stage+'/receipt.json">retained</a></p></section>');
}
await sharp({create:{width:1440,height:872,channels:3,background:'#142023'}}).composite(stack).jpeg({quality:91,chromaSubsampling:'4:4:4'}).toFile(new URL('showcase-'+stage+'.jpg',root).pathname);
await writeFile(new URL(baseline==='replaced-before'?'index.html':'index-'+stage+'.html',root),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ghost Signal · In-game comparison</title><style>body{max-width:1460px;margin:auto;padding:2vw;background:#111b20;color:#dfe7dc;font:16px/1.5 system-ui}a{color:#a9dbd0}article{margin-bottom:2rem}article div{display:grid;grid-template-columns:1fr 1fr;gap:8px}img{width:100%;height:auto;display:block}small{display:block}h1,h2,h3{line-height:1.2}</style><main><h1>Ghost Signal · In-game comparison</h1><p>Original on the left, retained build on the right. Both fixed cameras use the same position and lens. Click either picture to open the actual pixels. The three-camera sheets also include the normal play HUD.</p><nav><a href="#p1080">1920 × 1080</a> · <a href="#p1440">2560 × 1440</a></nav>'+sections.join('')+'</main></html>');
