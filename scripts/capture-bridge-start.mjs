// Read-only measurements on real game instances. No special URL, camera, time
// control or drive input: only Start Campaign, exit, then a second Start Campaign.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const [port,bundle,folder,kind]=process.argv.slice(2),origin='http://127.0.0.1:'+port,out=resolve(folder);
assert(/^\d{4,5}$/.test(port)&&/^GameSession-[\w-]+\.js$/.test(bundle)&&['original','fixed'].includes(kind));
await mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal','--no-first-run']});
const report={origin,bundle,kind,runs:[],errors:[]};
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 let lossMessages=0;
 page.on('console',m=>{if(/context lost/i.test(m.text()))lossMessages++;
   else if(/shader error|VALIDATE_STATUS false/i.test(m.text()))report.errors.push(m.text());});
 await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
 await page.goto(origin+'/');assert(!await page.evaluate(()=>!!window.__TAURI_INTERNALS__));
 for(let i=0;i<(kind==='fixed'?2:1);i++){
  await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
  await page.waitForFunction(()=>{
   const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
   for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
    const st=t.__r3f.root.getState(),br=st.scene.getObjectByName('winding-river-bridge');
    if(!br?.count||st.clock.elapsedTime<4||!br.visible||st.gl.domElement.width!==1920)return false;
    // The last two instances are the actual left and right longitudinal
    // stringers. Their common midpoint is independent of river width/seed.
    const v=t.position.clone(),mid=t.position.clone().set(0,0,0),m=t.matrix.clone();
    for(const j of [br.count-1,br.count-2]){br.getMatrixAt(j,m);mid.add(v.setFromMatrixPosition(m).applyMatrix4(br.matrixWorld));}mid.multiplyScalar(.5);
    const p=mid.clone().project(st.camera),to=mid.clone().sub(t.position);to.y=0;to.normalize();
    const facing=t.position.clone().set(0,0,-1).applyQuaternion(t.quaternion);facing.y=0;facing.normalize();
    const canvas=st.gl.domElement;
    if(canvas!==window.startCanvas){window.startCanvas=canvas;window.startLosses??=[];
      canvas.addEventListener('webglcontextlost',()=>window.startLosses.push({retired:canvas===window.exitedCanvas,detached:!canvas.isConnected}));}
    if(st.gl.getContext().isContextLost())return false;
    window.startReceipt={tank:t.position.toArray(),yaw:t.rotation.y,bridge:mid.toArray(),bridgeScreen:[(p.x+1)*960,(1-p.y)*540],clipZ:p.z,
      headingErrorDeg:Math.acos(Math.max(-1,Math.min(1,facing.dot(to))))*180/Math.PI,buffer:[st.gl.domElement.width,st.gl.domElement.height]};
    return true;
   }return false;
  },undefined,{timeout:90000});
  const a=await page.evaluate(()=>window.startReceipt);
  assert.deepEqual(a.buffer,[1920,1080]);report.runs.push(a);
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').find(o=>/\/GameSession-[\w-]+\.js/.test(o.name))?.name),origin+'/assets/'+bundle);
  await page.screenshot({path:join(out,i?'reenter.jpg':'spawn.jpg'),quality:94});
  if(kind==='fixed'){assert(Math.abs(a.tank[0])<.03&&Math.abs(a.tank[2]+12)<.03&&a.headingErrorDeg<.3,'not on original bridge axis');
    // The stock camera looks over one shoulder, not straight down the bore.
    // The centre road must be directly ahead of the hull, in the central
    // third of that unchanged camera's frame, on both entries.
    assert(Math.abs(a.bridgeScreen[0]-960)<320&&a.clipZ>-1&&a.clipZ<1&&a.bridgeScreen[1]>0&&a.bridgeScreen[1]<1080,'bridge not center-visible');
    if(i===0){await page.evaluate(()=>window.exitedCanvas=window.startCanvas);await page.locator('[data-session-exit]').click();}}
 }
 report.contextLosses=await page.evaluate(()=>window.startLosses??[]);
 assert(report.contextLosses.every(v=>v.retired&&v.detached),'A live gameplay canvas lost its context');
 assert.equal(lossMessages,report.contextLosses.length,'Unattributed rendering context loss');
 assert.deepEqual(report.errors,[]);report.ok=true;
}catch(e){report.error=String(e);throw e;}finally{await writeFile(join(out,'receipt.json'),JSON.stringify(report,null,2));await browser.close();}
