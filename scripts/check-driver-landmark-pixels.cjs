// Optical visibility check, not an art screenshot. In an isolated, local browser,
// recolor just one dwelling twice within the same frame. Its silhouette is what
// survives depth testing against the real landscape. Do not publish the ID pass
// as normal gameplay. The HTML HUD is assessed separately in driver captures.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const [origin,bundle,out,mode,spawnAt]=process.argv.slice(2);
// Default captures ignition as before. Optional explicit scene time captures
// an established plume as a second receipt; never wait for a desired image.
const spawnAtSeconds=Number(spawnAt??2);
assert(Number.isFinite(spawnAtSeconds)&&spawnAtSeconds>=2&&spawnAtSeconds<=10);
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)&&/^GameSession-[\w-]+\.js$/.test(bundle)&&out);
assert(['baseline','candidate','crossing'].includes(mode));
(async()=>{
  const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
  try{
    const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    await p.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
    await p.goto(origin);assert(!await p.evaluate(()=>!!window.__TAURI_INTERNALS__));
    await p.getByRole('button',{name:/^Start Campaign$/}).click();
    await p.waitForFunction(()=>{
      const el=document.querySelector('canvas[data-game-ui]');if(!el)return false;
      for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
        const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
        const root=t.__r3f.root,st=root.getState(),o=st.scene.getObjectByName('sunlit-paddy-spurs-and-stilt-homesteads');
        if(!o||st.clock.elapsedTime<2||st.gl.domElement.width!==1920)return false;
        // This game intentionally creates a depthless default framebuffer:
        // opaque world depth lives in the composer's first render target.
        // Learn the production target type once, then use a private RGBA8
        // depth target. Drawing directly to the canvas puts sky over houses.
        if(!window.landmarkTargetType){
          if(!window.landmarkWaiting){
            window.landmarkWaiting=true;
            const renderer=st.gl,set=renderer.setRenderTarget,own=Object.hasOwn(renderer,'setRenderTarget');
            renderer.setRenderTarget=function(dest,...args){
              if(dest?.isWebGLRenderTarget&&dest.depthBuffer&&!dest.isWebGLCubeRenderTarget){
                window.landmarkTargetType=dest.constructor;
                if(own)renderer.setRenderTarget=set;else delete renderer.setRenderTarget;
              }
              return set.call(this,dest,...args);
            };
          }return false;
        }
        window.landmarkTankZ=()=>t.position.z;
        window.landmarkElapsed=()=>root.getState().clock.elapsedTime;
        window.landmarkOptics=(fieldSurvey=false)=>{
          const {scene,camera,gl}=root.getState(),W=gl.domElement.width,H=gl.domElement.height;
          const g=o.geometry,c=g.getAttribute('color'),pos=g.getAttribute('position');
          const vector=t.position.clone(),prior=gl.getRenderTarget(),auto=gl.autoClear;
          const target=new window.landmarkTargetType(W,H,{depthBuffer:true,stencilBuffer:false});
          const draw=()=>{gl.setRenderTarget(target);gl.autoClear=true;gl.render(scene,camera);};
          let results,roofEffects=null;const fieldEffects=[];
          try{results=g.userData.dwellings.map(d=>{
            const start=d.begin*c.itemSize,end=d.end*c.itemSize,original=c.array.slice(start,end);
            let x0=W,x1=0,top=H,bottom=0,front=false;
            for(let i=d.begin;i<d.end;i++){
              vector.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).project(camera);
              if(vector.z<=-1||vector.z>=1)continue;front=true;
              const x=(1+vector.x)*W/2,y=(1-vector.y)*H/2;
              x0=Math.min(x0,Math.floor(x));x1=Math.max(x1,Math.ceil(x));top=Math.min(top,Math.floor(y));bottom=Math.max(bottom,Math.ceil(y));
            }
            x0=Math.max(0,x0-1);x1=Math.min(W,x1+1);top=Math.max(0,top-1);bottom=Math.min(H,bottom+1);
            const width=x1-x0,height=bottom-top,box=[x0,top,x1,bottom],role=d.role||'field-house';
            if(!front||width<=0||height<=0)return {role,pixels:0};
            const pass=value=>{c.array.fill(value,start,end);c.needsUpdate=true;draw();
              const a=new Uint8Array(width*height*4);gl.readRenderTargetPixels(target,x0,H-bottom,width,height,a);return a;};
            try{
              const a=pass(0),z=pass(1);let pixels=0,loX=W,hiX=0,loY=H,hiY=0;
              for(let i=0;i<a.length;i+=4)if(Math.max(z[i]-a[i],z[i+1]-a[i+1],z[i+2]-a[i+2])>=32){
                pixels++;const x=x0+(i/4)%width,y=bottom-1-Math.floor(i/4/width);
                loX=Math.min(x,loX);hiX=Math.max(x,hiX);loY=Math.min(y,loY);hiY=Math.max(y,hiY);
              }
              const local={lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity],meanPigment:0};
              if(fieldSurvey)for(let v=d.begin;v<d.end;v++){
                for(let k=0;k<3;k++){const q=pos.array[v*3+k]-d.center[k];local.lo[k]=Math.min(local.lo[k],q);local.hi[k]=Math.max(local.hi[k],q);}
                const i=(v-d.begin)*3;
                local.meanPigment+=(original[i]*.2126+original[i+1]*.7152+original[i+2]*.0722)/(d.end-d.begin);
              }
              return {role,pixels,projected:box,visible:pixels?[loX,loY,hiX,hiY]:null,...(fieldSurvey?{local}:{} )};
            }finally{c.array.set(original,start);c.needsUpdate=true;}
          });
            const fx=scene.getObjectByName('distant-ridge: thatch smoke and roof fires');
            if(fx)for(const i of (fieldSurvey?[0,1,2]:[g.userData.dwellings.findIndex(d=>d.role==='ridge-longhouse')])){
              const sites=g.userData.roofBurns,anchor=vector.fromArray(sites[i].breach).project(camera);
              const ax=Math.round((anchor.x+1)*W/2),ay=Math.round((1-anchor.y)*H/2);
              const x=Math.max(0,ax-110),y=Math.max(0,ay-140),w=Math.min(220,W-x),h=Math.min(178,H-y);
              const roof=fx.children[i],fireMesh=roof.getObjectByName('fuel-flames'),cloud=roof.getObjectByName('fuel-cloud');
              // Inspect the actual active clock, regardless of whether this
              // production snapshot uses volume fires, folded sprite smoke,
              // or depth-faded roof ash. Do not synthesize an animation.
              const fireClock=fireMesh?.material.uniforms?.time??fireMesh?.material.userData.fireClock;
              const cloudUniforms=cloud?.material.uniforms,cloudClock=cloudUniforms?.burnDrift??cloudUniforms?.uTime;
              if(!Number.isFinite(fireClock?.value)||!Number.isFinite(cloudClock?.value))throw Error('Missing roof fire/smoke animation clock');
              const saved=[fireMesh.visible,cloud.visible,fireClock.value,cloudClock.value];
              const read=(fire,smoke)=>{fireMesh.visible=fire;cloud.visible=smoke;draw();const a=new Uint8Array(w*h*4);
                gl.readRenderTargetPixels(target,x,H-y-h,w,h,a);return a;};
              const diff=(a,b)=>{let n=0,hot=0,l=W,r=0,t=H,btm=0;
                for(let q=0;q<a.length;q+=4){
                  const dr=b[q]-a[q],dg=b[q+1]-a[q+1],db=b[q+2]-a[q+2];
                  if(Math.max(Math.abs(dr),Math.abs(dg),Math.abs(db))>=4){
                    n++;if(b[q]>b[q+1]+16&&b[q+1]>b[q+2]+4)hot++;
                    if(fieldSurvey){const u=x+(q/4)%w,v=y+h-1-Math.floor(q/4/w);
                      l=Math.min(l,u);r=Math.max(r,u);t=Math.min(t,v);btm=Math.max(btm,v);}
                  }
                }return {pixels:n,warm:hot,...(fieldSurvey?{bounds:n?[l,t,r,btm]:null}:{})};
              };
              // Compare with the *same frozen scene*, same camera, same pass,
              // this time with just the inspected roof's original ink drawn.
              try{
                const off=read(false,false),smoke=read(false,true),fire=read(true,false);
                fireClock.value+=.67;cloudClock.value+=.67;
                const active=cloud.isInstancedMesh?cloud.count:null,matrices=cloud.instanceMatrix?.array;
                const folds=active===null?null:{count:active,finite:[...matrices.slice(0,active*16)].every(Number.isFinite)};
                const effect={at:[ax,ay],smoke:diff(off,smoke),fire:diff(off,fire),...(fieldSurvey?{folds}:{}),
                  changedAfter670ms:{smoke:diff(smoke,read(false,true)).pixels,fire:diff(fire,read(true,false)).pixels}};
                if(g.userData.dwellings[i].role==='ridge-longhouse')roofEffects=effect;
                else fieldEffects.push(effect);
              }finally{[fireMesh.visible,cloud.visible,fireClock.value,cloudClock.value]=saved;}
            }
          }finally{gl.setRenderTarget(prior);gl.autoClear=auto;target.dispose();}
          return {sceneSeconds:window.landmarkElapsed(),buffer:[W,H],fov:camera.fov,hull:t.position.toArray(),houses:results,roofEffects,...(fieldSurvey?{fieldEffects}:{} )};
        };
        return true;
      }return false;
    },null,{timeout:60000});
    assert.equal(await p.evaluate(()=>performance.getEntriesByType('resource').find(r=>/\/GameSession-[\w-]+\.js$/.test(r.name))?.name),origin+'/assets/'+bundle);
    await p.waitForFunction(sec=>window.landmarkElapsed()>=sec,spawnAtSeconds,{timeout:20000});
    if(mode==='crossing'){
      // The near end of this production bridge is at z=7.69. Drive to
      // it using the same controls and coast to rest, never setting a pose.
      await p.keyboard.down('w');
      try{await p.waitForFunction(()=>window.landmarkTankZ()>=6.49,null,{polling:'raf',timeout:22000});}
      finally{await p.keyboard.up('w');}
      await p.waitForTimeout(650);
    }
    const first=await p.evaluate(on=>window.landmarkOptics(on),process.argv[7]==='fields');
    await p.keyboard.down('w');try{await p.waitForFunction(()=>window.landmarkTankZ()>=14.20,null,{polling:'raf',timeout:22000});}finally{await p.keyboard.up('w');}
    await p.waitForTimeout(650);
    const bridge=await p.evaluate(on=>window.landmarkOptics(on),process.argv[7]==='fields');
    assert.deepEqual(first.buffer,[1920,1080]);assert.equal(first.fov,60);
    if(mode==='crossing')assert(Math.abs(first.hull[2]-7.69)<1.2,'Near bridge entry');
    else assert(Math.abs(first.hull[2]+12)<.1);
    assert(Math.abs(bridge.hull[2]-15.39)<1.2,'Bridge sample must be within 1.2 units of midspan');
    const result={origin,bundle,mode,scope:'Depth-tested canvas visibility; no HUD or post-process; no frame-rate claim',
      ...(mode==='crossing'?{approach:first}:{spawn:first}),bridge};
    await fs.writeFile(out,JSON.stringify(result,null,2)+'\n');
    if(process.argv[7]==='fields')for(const s of [first,bridge]){
      for(const e of [...s.fieldEffects,s.roofEffects])assert(e?.folds?.count>=1&&e.folds.finite,'No finite folds on this roof: '+JSON.stringify(e));
      assert(s.fieldEffects.some(e=>e.smoke.pixels>=12),'No visible smoke on either field house: '+JSON.stringify(s.fieldEffects));
    }
    // On approach the angular size falls between the two validated endpoints.
    if(mode!=='baseline')for(const [snap,min,max,wmin,wmax] of [[first,250,mode==='crossing'?1800:1000,31,mode==='crossing'?72:51],[bridge,440,1800,43,72]]){
      const d=snap.houses.find(d=>d.role==='ridge-longhouse'),width=d?.visible?d.visible[2]-d.visible[0]+1:0;
      assert(d&&d.pixels>=min&&d.pixels<=max&&width>=wmin&&width<=wmax,
        'Distant thatched roof must remain visible at stock scale without looking like a foreground building: '+JSON.stringify(d));
      const fx=snap.roofEffects;
      assert(fx?.fire.warm>=12&&fx.smoke.pixels>=65&&fx.changedAfter670ms.smoke>18&&fx.changedAfter670ms.fire>8,
        'Flames and animated smoke must both be visible at the stock camera, not just mounted in the scene: '+JSON.stringify(fx));
    }
    console.log(JSON.stringify(result));
  }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
