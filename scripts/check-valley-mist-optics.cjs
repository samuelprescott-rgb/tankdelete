// A/B the contribution of *only* the low valley air in a single frozen
// production frame. No HUD/postprocessing here: actual stock-camera films
// are still the art gate. Local simulation only; never attach a native game.
const {chromium}=require('playwright'), fs=require('node:fs/promises'), assert=require('node:assert/strict');
const [origin,bundle,destination]=process.argv.slice(2);
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)&&/^GameSession-[\w-]+\.js$/.test(bundle)&&destination);
(async()=>{
 const b=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal']});
 try{
  const page=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
  await page.goto(origin);
  assert(!await page.evaluate(()=>!!window.__TAURI_INTERNALS__));
  await page.getByRole('button',{name:/^Start Campaign$/}).click();
  await page.waitForFunction(()=>{
   const el=document.querySelector('canvas[data-game-ui]');if(!el)return false;
   for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const tank=h.memoizedState?.current;if(tank?.name!=='player-tank')continue;
    const root=tank.__r3f.root,st=root.getState(),air=st.scene.getObjectByName('light-through-canopy-breaks');
    if(!air||st.clock.elapsedTime<2||st.gl.domElement.width!==1920)return false;
    if(!window.mistTarget){
     if(!window.awaitMistTarget){window.awaitMistTarget=true;
      const gl=st.gl,set=gl.setRenderTarget,own=Object.hasOwn(gl,'setRenderTarget');
      gl.setRenderTarget=function(dest,...args){
       if(dest?.isWebGLRenderTarget&&dest.depthBuffer&&!dest.isWebGLCubeRenderTarget){
        window.mistTarget=dest.constructor;if(own)gl.setRenderTarget=set;else delete gl.setRenderTarget;
       }
       return set.call(this,dest,...args);
      };
     }
     return false;
    }
    window.mistTankZ=()=>tank.position.z;
    window.mistOptics=()=>{
     const {camera,gl,scene}=root.getState(), W=gl.domElement.width,H=gl.domElement.height;
     const attributes=air.geometry.attributes,styles=attributes.style,banks=attributes.driftBank,saved=styles.array.slice();
     const before=gl.getRenderTarget(),auto=gl.autoClear,rt=new window.mistTarget(W,H,{depthBuffer:true,stencilBuffer:false});
     const draw=()=>{gl.setRenderTarget(rt);gl.autoClear=true;gl.render(scene,camera);
      const pixels=new Uint8Array(W*H*4);gl.readRenderTargetPixels(rt,0,0,W,H,pixels);return pixels;};
     try{
      for(let i=0;i<banks.count;i++)if(banks.getX(i)>3.5)styles.setW(i,0);
      styles.needsUpdate=true;const off=draw();
      styles.array.set(saved);styles.needsUpdate=true;const on=draw();
      const key=scene.getObjectByName('sector-key-shadow'),dir=key.position.clone().sub(key.target.position).normalize();
      const sun=camera.position.clone().addScaledVector(dir,200).project(camera);
      const sx=Math.round((sun.x+1)*W/2),sy=Math.round((1-sun.y)*H/2);
      const rows=Array(12).fill(0),columns=Array(12).fill(0);
      let changed=0,cooler=0,lifted=0,sunCore=0,foreground=0,highSky=0,horizontals=0;
      const m=camera.matrixWorld.elements,fy=Math.tan(camera.fov*Math.PI/360),fx=fy*camera.aspect;
      for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){
       const k=((H-y-1)*W+x)*4,r=on[k]-off[k],g=on[k+1]-off[k+1],bl=on[k+2]-off[k+2];
       if(Math.max(Math.abs(r),Math.abs(g),Math.abs(bl))<7)continue;
       changed++;if(bl-r>0)cooler++;if((r+g+bl)/3>5)lifted++;
       rows[Math.min(11,Math.floor(y*12/H))]++;columns[Math.min(11,Math.floor(x*12/W))]++;
       if(y>H*.56)foreground++;
       // Screen-space row 0 contains trees and mountains when the tank
       // pitches down the bridge. Classify the upper sky by WORLD elevation,
       // rather than pretending the camera always stares at a fixed horizon.
       const rx=(2*x/W-1)*fx,ry=(1-2*y/H)*fy;
       if((rx*m[1]+ry*m[5]-m[9])/Math.hypot(rx,ry,1)>Math.sin(20*Math.PI/180))highSky++;
       if((x-sx)**2+(y-sy)**2<16**2)sunCore++;
      }
      horizontals=columns.filter(n=>n>220).length;
      return {hull:tank.position.toArray(),fov:camera.fov,buffer:[W,H],sun:[sx,sy],changedSamples:changed,horizontalTwelfths:horizontals,
       coolerFraction:+(cooler/Math.max(1,changed)).toFixed(3),liftedFraction:+(lifted/Math.max(1,changed)).toFixed(3),
       sunCore,highSky,foreground,rows,columns};
     }finally{styles.array.set(saved);styles.needsUpdate=true;gl.setRenderTarget(before);gl.autoClear=auto;rt.dispose();}
    };return true;
   }return false;
  },null,{timeout:60000});
  const loaded=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(s=>/\/GameSession-[\w-]+\.js$/.test(s)));
  assert.equal(loaded,origin+'/assets/'+bundle);
  const spawn=await page.evaluate(()=>window.mistOptics());
  // Sample while actually rolling, in the first RAF at *each* position.
  // Round-tripping a keyup before the sample can overshoot by four metres
  // under GPU load; it can also flatten the ramp pitch in an artificial stop.
  const route=page.evaluate(()=>new Promise((ok,fail)=>{
   const until=performance.now()+40000;let bridge;
   function tick(){
    if(performance.now()>until)return fail(Error('Tank never crossed both sample lines.'));
    const z=window.mistTankZ();
    if(!bridge&&z>=15.1)bridge=window.mistOptics();
    if(bridge&&z>=23.2)return ok([bridge,window.mistOptics()]);
    requestAnimationFrame(tick);
   }requestAnimationFrame(tick);
  }));
  await page.keyboard.down('w');let bridge,farBank;try{[bridge,farBank]=await route;}finally{await page.keyboard.up('w');}
  const result={origin,bundle,scope:'Isolated depth-tested contribution before post-processing at 1/4 pixel sample density; no FPS or performance claim.',spawn,bridge,farBank};
  await fs.writeFile(destination,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  assert(Math.abs(bridge.hull[2]-15.39)<1.2);
  assert(farBank.hull[2]>=23.2&&farBank.hull[2]<24.7);
  for(const snap of [spawn,bridge,farBank]){
   assert.equal(snap.fov,60);assert.deepEqual(snap.buffer,[1920,1080]);
   assert(snap.changedSamples>5000&&snap.horizontalTwelfths>=8,'Mist must extend across the valley from the tank, not just one shaft.');
   assert(snap.coolerFraction>.55&&snap.liftedFraction>.5,'Distant air must actually be cooler and lighter.');
   assert(snap.sunCore===0&&snap.highSky===0&&snap.foreground===0,'Keep the sun core, upper sky and driver foreground clear.');
  }
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
