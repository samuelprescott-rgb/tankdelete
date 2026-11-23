// Run against the production preview in a separate local Chrome instance.
// NODE_PATH=<playwright install root> node scripts/ghost-crossing-qa.mjs [previewPort] [cdpPort]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const port = Number(process.argv[2] ?? 1495), cdp = Number(process.argv[3] ?? 9453);
assert.ok([port, cdp].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535)&&port!==cdp);
const artifacts = new URL('../tmp/production-qa/', import.meta.url).pathname;
await mkdir(artifacts,{recursive:true});
const out = await mkdtemp(artifacts+'ghost-river-');
const browser = await chromium.connectOverCDP('http://127.0.0.1:'+cdp);
const context = await browser.newContext({ viewport:{width:1920,height:1080},deviceScaleFactor:1 });
const page = await context.newPage();
const report={origin:'http://127.0.0.1:'+port,out,errors:[],inputs:[]};
page.on('pageerror',error=>report.errors.push(String(error)));
page.on('console',msg=>{if(/Shader Error|VALIDATE_STATUS|WebGLProgram.*ERROR/i.test(msg.text()))report.errors.push(msg.text())});
const capture = name=>page.screenshot({path:out+'/'+name+'.png',timeout:30000});
// Read the mounted meshes and camera, not a fixture or parallel ballistics sim.
// React DOM already exposes a ref to the real R3F tank through the minimap.
function probe() {
  const radar=document.querySelector('canvas[data-game-ui]'); if(!radar)return null;
  const key=Object.keys(radar).find(k=>k.startsWith('__reactFiber$')); let tank;
  for(let f=radar[key];f&&!tank;f=f.return)for(let h=f.memoizedState;h;h=h.next) {
    if(h.memoizedState?.current?.name==='player-tank'){tank=h.memoizedState.current;break;}
  }
  const state=tank?.__r3f?.root?.getState();
  if(!state)return null;
  const {camera,scene,gl}=state, bounds=gl.domElement.getBoundingClientRect(), blocks=[];
  function project(x,y,z) {
    const p=tank.position.clone().set(x,y,z).project(camera);
    return {x:bounds.x+(p.x+1)*bounds.width/2,y:bounds.y+(1-p.y)*bounds.height/2,visible:p.z>=0&&p.z<=1};
  }
  scene.traverse(mesh=>{
    const skin=mesh.userData?.ghostHutSkin;if(!skin)return;
    for(const {block,index} of skin.entries) {
      const {path,position,scale}=block, [x,,z]=position;
      const dx=x-tank.position.x,dz=z-tank.position.z,d=Math.hypot(dx,dz)||1;
      // Turret aiming in this game uses ground-plane pointer rays. Offset in
      // both directions across the wall, perpendicular to the actual shot.
      const aims=[-.33,.33].map(k=>project(x-k*scale*dz/d,0,z+k*scale*dx/d));
      const read=attr=>['getX','getY','getZ','getW'].map(fn=>mesh.geometry.attributes[attr][fn](index));
      const centre=project(x,position[1]+.5*scale,z);
      blocks.push({path,position,scale,aims,centre,d,scar:read('ghostScar'),face:read('ghostFace')});
    }
  });
  return {tank:tank.position.toArray(),camera:camera.position.toArray(),blocks,glCanvas:[gl.domElement.width,gl.domElement.height],
    crossing:scene.getObjectByName('winding-river-water')?.material.customProgramCacheKey(),
    hud:document.body.innerText.slice(0,1200), realBridge:'__TAURI_INTERNALS__' in window};
}
const snapshot=()=>page.evaluate(probe);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Photo framing only for labeled inspection stills. Both impact inputs and
// main screenshots use the normal chase camera. No world state is authored.
async function detail(name,path) {
  const pose=await page.evaluate(({name,path})=>{
    const radar=document.querySelector('canvas[data-game-ui]');
    let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))],tank;
    for(;f&&!tank;f=f.return)for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.name==='player-tank')tank=h.memoizedState.current;
    const store=tank.__r3f.root,state=store.getState(),camera=state.camera;
    const eye=tank.position.clone(),aim=eye.clone();
    if(!path){
      const deck=state.scene.getObjectByName('winding-river-bridge'),m=deck.matrix.clone();
      deck.getMatrixAt(deck.count-1,m);aim.setFromMatrixPosition(m);deck.getMatrixAt(deck.count-2,m);
      aim.add(eye.setFromMatrixPosition(m)).multiplyScalar(.5);deck.localToWorld(aim);
      eye.copy(aim);eye.x+=.2;eye.y+=10.4;eye.z-=2.1;
    }else{
      state.scene.traverse(o=>{
        const entry=o.userData.ghostHutSkin?.entries.find(e=>e.block.path===path);if(!entry)return;
        const m=o.matrix.clone();o.getMatrixAt(entry.index,m);m.premultiply(o.matrixWorld);
        aim.set(0,.33,-.40).applyMatrix4(m); eye.set(.18,.60,-2.95).applyMatrix4(m);
      });
    }
    const pos=camera.position.clone(),q=camera.quaternion.clone();
    const apply=()=>{camera.position.copy(eye);camera.lookAt(aim);camera.updateMatrixWorld();};
    const end=state.internal.subscribe({current:apply},0,store);apply();
    window.__ghostPhotoEnd=()=>{end();camera.position.copy(pos);camera.quaternion.copy(q);camera.updateMatrixWorld();delete window.__ghostPhotoEnd;};
    return {name,eye:eye.toArray(),aim:aim.toArray()};
  },{name,path});
  await wait(250);await capture(name);await page.evaluate(()=>window.__ghostPhotoEnd());
  return pose;
}
try {
  await page.goto(report.origin+'/?ghostSignal=river');
  await page.getByRole('button',{name:/^River crossing/i}).click();
  const began=Date.now();
  do {report.start=await snapshot();if(report.start?.blocks.length)break;await wait(200)}while(Date.now()-began<50000);
  assert.ok(report.start?.blocks.length, 'Production preview has no river huts with mounted impact skins');
  assert.equal(report.start.realBridge,false);
  assert.equal(report.start.crossing,'wetland-water-ghost-crossing-v3');
  report.bundle=await page.evaluate(()=>performance.getEntriesByType('resource')
    .map(r=>new URL(r.name)).filter(u=>u.origin===location.origin&&/\/assets\/(?:index|GameSession)-[^/]+\.js$/.test(u.pathname)).map(u=>u.pathname));
  assert.ok(report.bundle.some(p=>p.includes('/GameSession-')), 'QA must exercise the built gameplay bundle, not Vite development');
  await wait(1450);report.start=await snapshot();await capture('01-river-play-camera');
  report.crossingPhoto=await detail('01b-bridge-material-inspection');
  await wait(500);report.start=await snapshot();
  const playable=({x,y,visible})=>visible&&x>40&&x<1615&&y>160&&y<1000;
  const choices=report.start.blocks.filter(b=>b.aims.every(playable)&&b.d>2).sort((a,b)=>a.d-b.d);
  assert.ok(choices.length, 'No two visible shot positions on the same wall');
  // Follow the same wall for both hits; disarm between shots to avoid deleting
  // it before the second impact location can be inspected and photographed.
  let target, first, second;
  for(const b of choices.slice(0,6)){
    await page.mouse.move(b.aims[0].x,b.aims[0].y);await wait(500);await page.mouse.down();await page.mouse.up();
    const t=Date.now();do{const s=await snapshot();first=s.blocks.find(q=>q.face[3]===1);if(first)break;await wait(100)}while(Date.now()-t<1800);
    report.inputs.push({intended:b.path,aim:b.aims[0],actual:first?.path});
    if(first?.path===b.path){target=b;break;}
    if(first){await page.keyboard.press('Escape');first=null;}
    await wait(1100);
  }
  assert.ok(target&&first,'No trusted cannon hit marked the chosen wall');
  report.first=first;
  await capture('02-first-impact');
  report.firstPhoto=await detail('02b-first-wall-inspection',target.path);
  await page.keyboard.press('Escape');await wait(1450);
  const clear=await snapshot();assert.equal(clear.blocks.find(b=>b.path===target.path)?.face[3],0);
  const pos=clear.blocks.find(b=>b.path===target.path).aims[1];
  await page.mouse.move(pos.x,pos.y);await wait(350);await page.mouse.down();await page.mouse.up();
  const t=Date.now();do{const s=await snapshot();second=s.blocks.find(q=>q.path===target.path&&q.face[3]===1);if(second)break;await wait(100)}while(Date.now()-t<3000);
  assert.ok(second,'Second real cannon shot did not mark the same hut');
  report.second=second;
  report.contactSeparation=Math.hypot(...second.scar.slice(0,3).map((v,i)=>v-first.scar[i]));
  assert.ok(report.contactSeparation>.20,'Separate shots reused one fixed wall coordinate');
  await capture('03-second-impact');report.secondPhoto=await detail('03b-second-wall-inspection',target.path);
  await wait(1150);
  const point=(await snapshot()).blocks.find(b=>b.path===target.path).aims[1];
  await page.mouse.move(point.x,point.y);await wait(350);await page.mouse.down();await page.mouse.up();
  const removedBy=Date.now()+4200;let after;
  do {after=await snapshot();if(!after.blocks.some(b=>b.path===target.path))break;await wait(120);}while(Date.now()<removedBy);
  assert.ok(!after.blocks.some(b=>b.path===target.path),'Confirm shot must remove only the selected simulated file');
  assert.deepEqual(after.blocks.map(b=>b.path).sort(),report.start.blocks.filter(b=>b.path!==target.path).map(b=>b.path).sort());
  await page.keyboard.press('Control+z');
  const restoredBy=Date.now()+3600;let restored;
  do {restored=(await snapshot()).blocks.find(b=>b.path===target.path);if(restored)break;await wait(100);}while(Date.now()<restoredBy);
  assert.deepEqual(restored?.position,target.position,'Undo must restore the simulated file to its own exact plot');
  report.virtualTrashUndo={file:target.path,restored:restored.position};
  assert.deepEqual(report.errors,[]);
  report.passed=true;
} catch(e){report.failure=String(e);await capture('failure').catch(()=>{});process.exitCode=1;}
finally{console.log(JSON.stringify({out:relative(process.cwd(),out),passed:report.passed??false,failure:report.failure,
  contactSeparation:report.contactSeparation,inputs:report.inputs,errors:report.errors}));await writeFile(out+'/report.json',JSON.stringify(report,null,2));await context.close();await browser.close();}
