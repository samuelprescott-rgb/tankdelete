// Real, unmodified local build in windowless WebKit. This is a render and
// registration check, not an FPS test or native-window sign-off.
const {webkit}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [origin,bundle,destination]=process.argv.slice(2);
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)&&/^GameSession-[\w-]+\.js$/.test(bundle)&&destination);
(async()=>{
 const out=await fs.mkdtemp(path.join(destination,'webkit-')),b=await webkit.launch({headless:true});
 const report={origin,bundle,engine:b.version(),scope:'Unmodified simulated game; untouched initial camera; no frame-time measurement.',modes:{}};
 try{
  for(const night of [false,true]){
   const kind=night?'embassy':'campaign',p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
   const errors=[];
   p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(/shader error|validate_status.*false|context lost/i.test(m.text()))errors.push(m.text());});
   await p.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
   await p.goto(origin+(night?'/?ghostSignal=embassy':'/'));
   await p.getByRole('button',{name:night?/^embassy approach/i:/^start campaign$/i}).click();
   await p.waitForFunction(n=>{
    if(window.__TAURI_INTERNALS__)throw Error('Do not run this in a host file session');
    const radar=document.querySelector('canvas[data-game-ui]');if(!radar)return false;
    for(let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
     const tank=h.memoizedState?.current;if(tank?.name!=='player-tank')continue;
     const {scene,gl,clock,camera}=tank.__r3f.root.getState();
     const key=scene.getObjectByName('sector-key-shadow'),rain=scene.getObjectByName('ghost-signal-horde-rain'),
      hill=scene.getObjectByName('sunlit-paddy-spurs-and-stilt-homesteads');
     let sky;scene.traverse(o=>{if(o.material?.uniforms?.uNightmare&&o.material.uniforms.uPanorama)sky=o;});
     if(!sky||!key||clock.elapsedTime<(n?8:3)||Number(sky.material.uniforms.uNightmare.value)>(n?1:.01)||
       (n&&(!rain||sky.material.uniforms.uNightmare.value<.99||document.querySelector('.nightmare-takeover')))||(!n&&!hill))return false;
     function screen(v){const pt=v.project(camera);return [(pt.x+1)*960,(1-pt.y)*540].map(Math.round);}
     const {width,height}=gl.domElement,ctx=gl.getContext();
     const ray=key.position.clone().sub(key.target.position).normalize(),bearing=Math.atan2(ray.z,ray.x);
     const sunPx=screen(camera.position.clone().addScaledVector(ray,200));
     // A projected roof can still be obscured. Optical sign-off comes from
     // the photographed approach; this just catches lost or displaced huts.
     window.__skyReceipt={buffer:[width,height],contextLost:ctx.isContextLost(),time:clock.elapsedTime,
      fov:camera.fov,nightWeight:sky.material.uniforms.uNightmare.value,weather:n?'rain':'dry',rainIndices:rain?.geometry.index?.count??0,
      keyBearing:bearing,keyProjected:sunPx,roofPeaks:hill?.geometry.userData.dwellings.map(h=>screen(tank.position.clone().fromArray(h.roofPeak)))??[]};
     return true;
    }return false;
   },night,{timeout:60000});
   const s=await p.evaluate(()=>({state:window.__skyReceipt,loaded:performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\/GameSession-[\w-]+\.js$/.test(n))}));
   assert.equal(s.loaded,origin+'/assets/'+bundle);assert.deepEqual(s.state.buffer,[1920,1080]);assert.equal(s.state.fov,60);assert(!s.state.contextLost);
   assert(night?s.state.rainIndices>0:s.state.rainIndices===0&&s.state.roofPeaks.length>0);
   await p.screenshot({path:path.join(out,kind+'.jpg'),quality:90});assert.deepEqual(errors,[]);
   report.modes[kind]={...s.state,errors};await p.close();
  }
  report.pass=true;console.log(out,JSON.stringify(report));
 }finally{await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
