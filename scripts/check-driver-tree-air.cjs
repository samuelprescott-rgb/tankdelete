// Diagnostic only. Toggle the existing tree finish inside ONE frozen frame of
// a separate local simulation. No art captures, camera overrides or native IO.
const {chromium}=require('playwright'), assert=require('node:assert/strict'), fs=require('node:fs/promises');
const [origin,bundle,out]=process.argv.slice(2);
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)&&/^GameSession-[\w-]+\.js$/.test(bundle)&&out);
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal']});
 try {
  const p=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[];
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(/shader error|validate_status false/i.test(m.text()))errors.push(m.text());});
  await p.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
  await p.goto(origin);assert(!await p.evaluate(()=>!!window.__TAURI_INTERNALS__));
  await p.getByRole('button',{name:/^Start Campaign$/}).click();
  await p.waitForFunction(()=>{
   const el=document.querySelector('canvas[data-game-ui]');if(!el)return false;
   for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
    const root=t.__r3f.root,st=root.getState();
    if(st.clock.elapsedTime<2||!st.scene.getObjectByName('perimeter-leaf-cutouts')||!st.scene.getObjectByName('authored-jungle-palm-batch'))return false;
    if(!window.treeAirTarget){
     if(!window.treeAirWaiting){window.treeAirWaiting=true;
      const g=st.gl,set=g.setRenderTarget;
      g.setRenderTarget=function(dest,...args){
       if(dest?.isWebGLRenderTarget&&dest.depthBuffer&&!dest.isWebGLCubeRenderTarget){window.treeAirTarget=dest.constructor;g.setRenderTarget=set;}
       return set.call(this,dest,...args);
      };
     }return false;
    }
    window.treeAirProbe=()=>{
     const {scene,camera,gl}=root.getState(),mat=new Set(),batches=[];
     scene.traverse(o=>{if(o.isMesh&&o.material?.customProgramCacheKey?.().includes(':river-tree-air-v1')){mat.add(o.material);batches.push([o.parent?.name,o.name]);}});
     if(!mat.size)throw Error('Candidate did not mount any daylight tree materials.');
     const W=gl.domElement.width,H=gl.domElement.height,rt=new window.treeAirTarget(W,H,{depthBuffer:true});
     const mode={value:0},prev=gl.getRenderTarget(),auto=gl.autoClear,restore=[];
     try {
      for(const m of mat){
       const compile=m.onBeforeCompile,key=m.customProgramCacheKey;
       restore.push(()=>{m.onBeforeCompile=compile;m.customProgramCacheKey=key;m.needsUpdate=true;});
       m.customProgramCacheKey=()=>key.call(m)+':isolatedOpticalTest';
       m.onBeforeCompile=(s,r)=>{
        compile.call(m,s,r);
        const end='outgoingLight=mix(outgoingLight,distantInk,.88*vTreeAir.x);';
        if(!s.fragmentShader.includes(end))throw Error('Production tree pass no longer matches this test.');
        s.uniforms.treeProbeMode=mode;
        s.fragmentShader='uniform float treeProbeMode;\n'+s.fragmentShader.replace(end,`
          if(treeProbeMode==1. || (treeProbeMode==2. && length(vViewPosition)<28.)){${end}}
          if(treeProbeMode==3. && length(vViewPosition)<28.)outgoingLight=vec3(1.,0.,1.);
        `);
       };m.needsUpdate=true;
      }
      const draw=v=>{mode.value=v;gl.setRenderTarget(rt);gl.autoClear=true;gl.render(scene,camera);
       const bytes=new Uint8Array(W*H*4);gl.readRenderTargetPixels(rt,0,0,W,H,bytes);return bytes;};
      const off=draw(0),on=draw(1),near=draw(2),id=draw(3);
      const key=scene.getObjectByName('sector-key-shadow'),sun=camera.position.clone()
       .addScaledVector(key.position.clone().sub(key.target.position).normalize(),200).project(camera);
      const sx=(sun.x+1)*W/2,sy=(1+sun.y)*H/2;
      let changed=0,nearChanges=0,nearCoverage=0,solarChanges=0,green=0,greenOff=0,greenOn=0,cooler=0;
      const greenBias=(a,i)=>a[i+1]-(a[i]+a[i+2])*.5;
      const delta=(a,b,i)=>Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));
      for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){
       const k=(y*W+x)*4;
       if(delta(near,off,k)>1)nearChanges++;
       if(delta(id,off,k)>8)nearCoverage++;
       if(delta(on,off,k)<2)continue;
       changed++;
       if((sx-x)**2+(sy-y)**2<14**2)solarChanges++;
       if(on[k+2]-on[k]>off[k+2]-off[k])cooler++;
       const g=greenBias(off,k);if(g>3){green++;greenOff+=g;greenOn+=greenBias(on,k);}
      }
      return {hull:t.position.toArray(),width:W,height:H,fov:camera.fov,materials:mat.size,batches,
       changed,nearChanges,nearCoverage,solarChanges,green,greenBiasBefore:greenOff/Math.max(1,green),
       greenBiasAfter:greenOn/Math.max(1,green),coolerFraction:cooler/Math.max(1,changed)};
     }finally{restore.forEach(f=>f());gl.setRenderTarget(prev);gl.autoClear=auto;rt.dispose();}
    };return true;
   }return false;
  },null,{timeout:80000});
  const actual=await p.evaluate(()=>performance.getEntriesByType('resource').find(r=>/\/GameSession-[\w-]+\.js$/.test(r.name))?.name);
  assert.equal(actual,origin+'/assets/'+bundle);
  const spawn=await p.evaluate(()=>window.treeAirProbe());
  const result={origin,bundle,scope:'Isolated daylight tree shader only, before postprocessing; sampled every other pixel in both axes.',spawn,errors};
  await fs.writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(result);
  assert.deepEqual(errors,[]);assert.deepEqual([spawn.width,spawn.height,spawn.fov],[1920,1080,60]);
  assert(spawn.batches.some(a=>a[1]==='authored-jungle-palm-batch')&&spawn.batches.some(a=>a[1]==='perimeter-leaf-cutouts'));
  assert(spawn.changed>1000&&spawn.green>150&&spawn.greenBiasAfter<.9*spawn.greenBiasBefore);
  assert(spawn.nearCoverage>100&&spawn.nearChanges===0&&spawn.solarChanges===0);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
