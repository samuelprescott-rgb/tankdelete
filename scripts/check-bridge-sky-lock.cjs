// Secondary regression check for foliage passes. Render the real production
// sky material with a copy of an ordinary recorded tank camera. The driving
// film remains the visual gate; this isolates the sky from combat and trees.
const {chromium}=require('playwright'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const [before,oldBundle,after,newBundle,routeFile,out]=process.argv.slice(2);
assert([before,after].every(s=>/^http:\/\/127\.0\.0\.1:\d+$/.test(s)));
assert([oldBundle,newBundle].every(s=>/^GameSession-[\w-]+\.js$/.test(s)));
(async()=>{
 const route=JSON.parse(await fs.readFile(routeFile,'utf8'));
 const poses=[-12,7.7,15.4,23.2].map(z=>route.frames.reduce((a,b)=>Math.abs(a.z-z)<Math.abs(b.z-z)?a:b));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
 try {
  async function probe(origin,bundle) {
   const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
   try{
    await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
    await page.goto(origin);assert(!await page.evaluate(()=>!!window.__TAURI_INTERNALS__));
    await page.getByRole('button',{name:/^Start Campaign$/}).click();
    await page.waitForFunction(()=>{
     const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
     for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
      const {camera,scene,gl,clock}=t.__r3f.root.getState();
      let sky;scene.traverse(o=>{if(o.material?.uniforms?.uDayPaint)sky=o});
      if(!sky||!sky.material.uniforms.uDayPaint.value?.image||clock.elapsedTime<2||gl.domElement.width!==1920)return false;
      window.checkPaint=pose=>{
       const copy=camera.clone(),layer=new scene.constructor(),dome=sky.clone(),v=t.position.clone(),rgb=[];
       copy.position.fromArray(pose.camera);copy.quaternion.fromArray(pose.q);copy.updateMatrixWorld();
       dome.position.copy(copy.position);layer.add(dome);
       const dst=gl.getRenderTarget(),auto=gl.autoClear;
       try{
        gl.setRenderTarget(null);gl.autoClear=true;gl.render(layer,copy);
        const ctx=gl.getContext(),buf=new Uint8Array(1920*1080*4);
        ctx.readPixels(0,0,1920,1080,ctx.RGBA,ctx.UNSIGNED_BYTE,buf);
        for(let y=36;y<550;y+=6)for(let x=16;x<1919;x+=8){
         v.set(2*x/1920-1,1-2*y/1080,.5).unproject(copy).sub(copy.position).normalize();
         const facing=(v.x*Math.cos(1.14)+v.z*Math.sin(1.14))/Math.hypot(v.x,v.z);
         if(facing<.48||v.y<.05)continue;
         const i=4*((1079-y)*1920+x);rgb.push(buf[i],buf[i+1],buf[i+2]);
        }
        return rgb;
       }finally{gl.setRenderTarget(dst);gl.autoClear=auto;layer.remove(dome);}
      };return true;
     }return false;
    },null,{timeout:60000});
    assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').find(r=>/\/GameSession-[\w-]+\.js$/.test(r.name))?.name),origin+'/assets/'+bundle);
    return await page.evaluate(ps=>ps.map(window.checkPaint),poses.map(({camera,q})=>({camera,q})));
   }finally{await page.close();}
  }
  const a=await probe(before,oldBundle),b=await probe(after,newBundle);
  const result={before:oldBundle,after:newBundle,method:'Actual sky material, matched stock driving poses, bridge-facing ranges, sun and clouds; not whole-scene capture.',views:a.map((arr,i)=>{
    const other=b[i];assert.equal(other.length,arr.length);let max=0,total=0,changed=0;
    for(let j=0;j<arr.length;j+=3){let pix=0;for(let k=0;k<3;k++){const diff=Math.abs(arr[j+k]-other[j+k]);max=Math.max(max,diff);total+=diff;pix=Math.max(pix,diff);}if(pix)changed++;}
    assert(new Set(arr).size>50&&arr.length>6000,'Sky did not draw a silver-to-amber range');
    return {z:poses[i].z,samples:arr.length/3,changed,max,mean:total/arr.length};
  })};await fs.writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(result);
  assert(result.views.every(s=>s.max<=1&&s.mean<.01),'Bridge sky changed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
