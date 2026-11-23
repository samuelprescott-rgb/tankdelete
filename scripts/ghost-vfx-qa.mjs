// Isolated QA context, production game and production composer. Wreck stills
// synchronize only the visual clock. Projectile stills freeze the first live
// flight frame following an ordinary pointer shot, never injecting a round.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=createRequire(import.meta.url)('playwright');
const [stage,port]=process.argv.slice(2);
const weapon=process.argv[4]??'cannon';assert.ok(['cannon','machinegun'].includes(weapon));
assert.ok(['before','after'].includes(stage)&&/^14\d\d$/.test(port));
const out=resolve('../TankDelete-Concepts/pixel-ascii-02/fx-'+stage);
await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:9463');
const ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await ctx.newPage(), errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS/.test(m.text()))errors.push(m.text())});
const origin='http://127.0.0.1:'+port, report={origin,stage,weapon,errors,
  photoSurface:[1920,1080],inspectionCrop:[940,620],stillDpr:1,shots:{}};
try{
  await page.goto(origin+'/?ghostSignal=river');
  await page.getByRole('button',{name:/^River crossing/i}).click();
  await page.waitForFunction(()=>{
    const radar=document.querySelector('canvas[data-game-ui]');if(!radar)return false;
    for(let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const tank=h.memoizedState?.current;if(tank?.name!=='player-tank')continue;
      const store=tank.__r3f.root,s=store.getState(),meshes={};
      s.scene.traverse(o=>{
        if(o.isInstancedMesh&&o.material.uniforms?.uTime&&o.count===8&&o.renderOrder===4)meshes.fire=o;
        if(o.isInstancedMesh&&o.material.uniforms?.uTime&&o.count===12&&o.renderOrder===5)meshes.smoke=o;
        if(o.isInstancedMesh&&o.renderOrder===82&&o.instanceMatrix.count===48)meshes.head=o;
        if(o.isInstancedMesh&&o.renderOrder===81&&o.instanceMatrix.count===48)meshes.core=o;
      });
      if(meshes.fire&&meshes.head&&meshes.core&&meshes.smoke){
        // These are detailed stills, not timing receipts. Keep the real composer
        // at 1:1 so adaptive resolution cannot change the pixel grid mid-pair.
        s.internal.subscribe({current:()=>{const live=store.getState();if(live.viewport.dpr!==1)live.setDpr(1);}},.4,store);
        window.vfxQa={s,store,tank,meshes};return true;
      }
    }return false;
  },{},{timeout:75000});
  await page.waitForTimeout(1300);
  report.bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname).filter(p=>/\/GameSession-[\w-]+\.js$/.test(p)));
  assert.ok(report.bundle.length);
  async function photograph(name){
    const frame=await page.evaluate(()=>window.vfxFrame);
    if(frame){
      for(const [suffix,pixels] of [['-full',frame.full],['',frame.crop]]){
        await writeFile(out+'/'+name+suffix+'.png',Buffer.from(pixels.split(',')[1],'base64'));
      }
      await page.evaluate(()=>{delete window.vfxFrame;});return;
    }
    // Includes real HUD and composer; crop is a second lossless view of the same held frame.
    await page.screenshot({path:out+'/'+name+'-full.png',timeout:45000});
    await page.screenshot({path:out+'/'+name+'.png',clip:{x:475,y:230,width:940,height:620},timeout:45000});
  }
  if(weapon==='cannon'){
  report.shots.wreck=await page.evaluate(()=>{
    const {s,store,meshes,tank}=window.vfxQa,c=s.camera;
    const aim=tank.position.clone().set(.20,1.45,.35), eye=aim.clone().set(-3.55,2.35,-4.9);
    meshes.fire.localToWorld(aim);meshes.fire.localToWorld(eye);
    const apply=()=>{meshes.fire.material.uniforms.uTime.value=2.75;meshes.smoke.material.uniforms.uTime.value=2.75;
      c.position.copy(eye);c.lookAt(aim);c.updateMatrixWorld();};
    const stop=s.internal.subscribe({current:apply},.5,store);window.endPhoto=stop;apply();
    return {eye:eye.toArray(),aim:aim.toArray(),effectsTime:2.75,geometry:meshes.fire.geometry.type,material:meshes.fire.material.uniforms.uGhostCels?.value.name??'turbulence'};
  });
  await page.waitForTimeout(500);await photograph('wreck-flame');
  await page.evaluate(()=>window.endPhoto());await page.waitForTimeout(600);
  }else{await page.keyboard.press('2');await page.waitForTimeout(300);}
  // The aim remains on the normal chase camera until a round is confirmed live.
  await page.mouse.move(1130,455);await page.waitForTimeout(450);
  await page.evaluate(()=>{
    const {s,store,tank,meshes:{head,core}}=window.vfxQa,c=s.camera;
    // Read the WebGL front buffer in the SAME animation callback, after the
    // game's real composer. A screenshot on another RAF can show the prior
    // chase camera on Mac when a tab is made idle part way through its RAF.
    s.internal.subscribe({current:()=>{
      if(!window.vfxGrab)return;
      const source=s.gl.domElement,width=source.width,height=source.height;
      if(width!==1920||height!==1080)throw Error('Photo viewport is not native 1920x1080: '+width+'x'+height);
      const w=Math.round(width*940/1920),h=Math.round(height*620/1080);
      const cropped=document.createElement('canvas');cropped.width=w;cropped.height=h;
      cropped.getContext('2d').drawImage(source,Math.round((width-w)/2),Math.round((height-h)/2),w,h,0,0,w,h);
      window.vfxFrame={full:source.toDataURL(),crop:cropped.toDataURL()};
      window.vfxGrab=false;s.setFrameloop('never');
    }},10,store);
    const stop=s.internal.subscribe({current:()=>{
      if(head.count<1||head.count===48||window.vfxFlight)return;
      const mat=head.matrix.clone();head.getMatrixAt(0,mat);mat.premultiply(head.matrixWorld);
      const p=tank.position.clone().setFromMatrixPosition(mat);
      if(!window.vfxFirst){window.vfxFirst=p.clone();return;}
      if(p.distanceTo(window.vfxFirst)<2.2)return;
      const dir=p.clone().set(0,0,1).transformDirection(mat), right=p.clone().set(dir.z,0,-dir.x).normalize();
      const aim=p.clone().addScaledVector(dir,-.52);
      const eye=aim.clone().addScaledVector(right,2.40).addScaledVector(dir,-.12);eye.y+=.65;
      c.position.copy(eye);c.lookAt(aim);c.updateMatrixWorld();
      window.vfxFlight={head:p.toArray(),dir:dir.toArray(),eye:eye.toArray(),aim:aim.toArray(),liveRounds:head.count,art:core.geometry.name||core.geometry.type};
      window.vfxGrab=true;
    }},.52,store);window.endFlight=stop;
  });
  await page.mouse.down();await page.mouse.up();
  await page.waitForFunction(()=>window.vfxFlight&&window.vfxFrame,{},{timeout:14000});
  report.shots.flight=await page.evaluate(()=>window.vfxFlight);
  await photograph(weapon+'-in-flight');
  if(weapon==='cannon'){
  await page.evaluate(()=>{
    const {s,store,tank}=window.vfxQa,c=s.camera,pulse=s.scene.getObjectByName('arcade-contact-echoes');
    window.endFlight();
    if(!pulse)throw new Error('Missing live impact pulse mesh');
    const stop=s.internal.subscribe({current:()=>{
      if(window.vfxContact||pulse.count<5||pulse.count===60)return;
      const aim=tank.position.clone().set(0,0,0),p=aim.clone(),start=aim.clone(),m=pulse.matrix.clone();
      for(let i=0;i<5;i++){pulse.getMatrixAt(i,m);p.setFromMatrixPosition(m);if(!i)start.copy(p);aim.add(p);}
      aim.multiplyScalar(.2);if(aim.distanceTo(start)<.19)return;
      pulse.localToWorld(aim);
      const eye=aim.clone();eye.x+=1.18;eye.y+=1.92;eye.z-=1.55;
      c.position.copy(eye);c.lookAt(aim);c.updateMatrixWorld();
      window.vfxContact={eye:eye.toArray(),aim:aim.toArray(),chips:pulse.count,geometry:pulse.geometry.name||pulse.geometry.type};
      window.vfxGrab=true;
    }},.52,store);window.endImpact=stop;s.setFrameloop('always');
  });
  try{
    const waitContact=ms=>page.waitForFunction(()=>window.vfxContact&&window.vfxFrame,{},{timeout:ms}).then(()=>true,()=>false);
    let contact=await waitContact(3000);
    for(const target of [[-16,15],[15,5],[24,42],[-24,55]]){
      if(contact)break;
      await page.keyboard.press('Escape');await page.waitForTimeout(350);
      const pos=await page.evaluate(([tx,tz])=>{
        const {s,tank}=window.vfxQa,v=tank.position.clone();v.x+=(tx-v.x)*.28;v.z+=(tz-v.z)*.28;
        v.y=0;v.project(s.camera);
        return [Math.min(1850,Math.max(55,(v.x+1)*960)),Math.min(995,Math.max(180,(1-v.y)*540))];
      },target);
      await page.mouse.move(...pos);await page.waitForTimeout(700);await page.mouse.down();await page.mouse.up();
      contact=await waitContact(3400);
    }
    assert.ok(contact);
    report.shots.impact=await page.evaluate(()=>window.vfxContact);
    await photograph('cannon-soil-impact');
  }catch{report.shots.impact='Round did not land on soil on this route';}
  }
  console.log(JSON.stringify(report));
  assert.equal(errors.length,0);
}finally{
  await writeFile(out+(weapon==='cannon'?'/capture.json':'/machinegun-capture.json'),JSON.stringify(report,null,2));await ctx.close();await browser.close();
}
