// Verify all inputs are unchanged production captures before resizing them for review.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const sharp=createRequire(import.meta.url)('sharp'),root=fileURLToPath(new URL('../../TankDelete-Concepts/ghost-signal-forest/',import.meta.url));
const candidate=process.argv[2], blindDir=process.argv[3], challenger=process.argv[4];
assert.match(candidate,/^forest-(r[1-9]\d*|restored)$/);
if(challenger)assert.match(challenger,/^forest-r[1-9]\d*$/);
const stages=['forest-original','forest-rejected',candidate];
const ids=['river-scenic','embassy-scenic','river-canopy','embassy-clouds','river-chase','embassy-chase'];
const names=['River village','Embassy courtyard','Riverbank tree · near view','Embassy cloud bank','River driving camera','Embassy driving camera'];
const receipts=await Promise.all(stages.map(s=>readFile(join(root,s,'receipt.json'),'utf8').then(JSON.parse)));
assert(receipts.every(r=>r.pass&&r.errors.length===0&&r.builds.length===1));
const reports=[];
if(blindDir)await mkdir(blindDir,{recursive:true});
const bar=(text,w)=>Buffer.from('<svg width="'+w+'" height="34"><rect width="100%" height="100%" fill="#14232a"/><text x="13" y="23" font-size="17" font-family="Helvetica,Arial" fill="#eff4e9">'+text+'</text></svg>');
for(const [n,id] of ids.entries()){
  const bytes=[],views=[];
  for(const [i,s] of stages.entries()){
    const row=receipts[i].shots.find(r=>r.id===id);
    const raw=await readFile(join(root,s,id+'.png'));
    assert.equal(createHash('sha256').update(raw).digest('hex'),row.sha256);
    assert.deepEqual(row.canvas,[1920,1080]);if(row.camera==='fixed'){assert.deepEqual(row.eye,receipts[0].shots.find(r=>r.id===id).eye);assert.deepEqual(row.look,receipts[0].shots.find(r=>r.id===id).look);}
    bytes.push(raw);views.push(await sharp(raw).resize(780,439).toBuffer());
  }
  const indices=[1,2],plates=[];
  for(const [j,i] of indices.entries())plates.push({input:bar(i===1?'Previous pass':'Revised build',780),left:j*780,top:0},{input:views[i],left:j*780,top:34});
  await sharp({create:{width:1560,height:473,channels:3,background:'#14232a'}}).composite(plates).jpeg({quality:94}).toFile(join(root,id+'-comparison.jpg'));
  if(blindDir){
    let other=views[1];
    if(challenger){
      const old=JSON.parse(await readFile(join(root,challenger,'receipt.json'),'utf8'));assert(old.pass);
      const row=old.shots.find(s=>s.id===id),raw=await readFile(join(root,challenger,id+'.png'));
      assert.equal(createHash('sha256').update(raw).digest('hex'),row.sha256);
      if(row.camera==='fixed')assert.deepEqual(row.eye,receipts[2].shots.find(s=>s.id===id).eye);
      other=await sharp(raw).resize(780,439).toBuffer();
    }
    const order=(challenger?[1,4,5]:[0,3,4]).includes(n)?[views[2],other]:[other,views[2]];const parts=order.map((input,j)=>({input,left:j*780,top:0}));
    await sharp({create:{width:1560,height:439,channels:3,background:'#14232a'}}).composite(parts).jpeg({quality:94}).toFile(join(resolve(blindDir),'pair-'+(n+1)+'.jpg'));
  }
  if(id==='embassy-clouds'){
    const crops=await Promise.all(bytes.map(b=>sharp(b).extract({left:70,top:48,width:1430,height:338}).resize(100,24,{fit:'fill'}).removeAlpha().raw().toBuffer()));
    const rms=(a,b)=>Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)/a.length);
    reports.push({subject:id,metric:'display RGB RMS, downsampled clear-sky region at x70/y48/w1430/h338, 0..255; real rain/drift not synchronized',originalVsPrevious:rms(crops[0],crops[1]),originalVsCandidate:rms(crops[0],crops[2])});
    const sky=stages.flatMap((s,i)=>[{input:bar(['Original sky','Previous pass','Revised build'][i],780),left:i*780,top:0},{input:views[i],left:i*780,top:34}]);
    await sharp({create:{width:2340,height:473,channels:3,background:'#14232a'}}).composite(sky).jpeg({quality:94}).toFile(join(root,'sky-history.jpg'));
  }else if(id==='river-scenic'){
    const [a,b]=await Promise.all(bytes.slice(1).map(raw=>sharp(raw).extract({left:840,top:12,width:420,height:115}).resize(100,24).raw().toBuffer()));
    reports.push({subject:id,metric:'display RGB RMS, daylight control patch x840/y12/w420/h115 after same resampling, 0..255',previousVsCandidate:Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)/a.length)});
  }
}
await writeFile(join(root,'comparison.json'),JSON.stringify({candidate,bundles:receipts.map(r=>r.builds[0]),measurements:reports},null,2));
await sharp({create:{width:1560,height:946,channels:3,background:'#14232a'}}).composite(
  ['river-canopy','embassy-clouds'].map((id,i)=>({input:join(root,id+'-comparison.jpg'),left:0,top:473*i})),
).jpeg({quality:92}).toFile(join(root,'tree-and-sky.jpg'));
const html=ids.map((id,i)=>'<section><h2>'+names[i]+'</h2><a href="'+id+'-comparison.jpg"><img src="'+id+'-comparison.jpg" alt="Previous pass on the left, revised build on the right"></a><p>Full-size PNG: '+stages.map((s,j)=>'<a href="'+s+'/'+id+'.png">'+['Original','Previous','Revised'][j]+'</a>').join(' · ')+'</p></section>').join('');
let films='';
for(const film of receipts[2].films??[]){
  const href=candidate+'/'+film.id+'-motion.webm';
  assert.equal(createHash('sha256').update(await readFile(join(root,href))).digest('hex'),film.sha256);
  films+='<p><a href="'+href+'">'+(film.id==='tree'?'Near branches':'Distant treeline')+' · actual camera movement, WebM</a></p>';
}
await writeFile(join(root,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ghost Signal • Sky and tree review</title><style>body{background:#14232a;color:#eff4e9;font:16px/1.5 system-ui;max-width:1500px;margin:20px auto;padding:0 2vw}a{color:#a9ddd1}img{width:100%;height:auto}section{margin:2.5rem 0}</style><h1>Ghost Signal · Embassy sky and forest canopy</h1><p>Actual 1920×1080 production frames. The first four pairs have identical camera positions and lenses. The last two show the unmodified driving HUD. The river tree is the same tree at the same world coordinate. Rain, smoke, combat and leaf motion are live.</p><a href="sky-history.jpg">Three-way sky comparison: original, previous and revised</a>'+html+'<p><a href="comparison.json">Measurement and bundle IDs</a></p>');
await writeFile(join(root,'index.html'),await readFile(join(root,'index.html'),'utf8')
  +(films?'<h2>Foliage in motion</h2>'+films:'')
  +'<p><a href="tree-and-sky.jpg">Two-view comparison sheet</a> · <a href="review.md">Build, art and timing notes</a></p>');
console.log({candidate,reports});
