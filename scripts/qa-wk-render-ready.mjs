// Browser-serializable, premeasurement observation. CURRENT_PROGRAM describes
// current binding, not whether the last scene drew; never create a GL context
// or submit diagnostic draws. Require renderer callbacks from the mounted world.
export function physicalPresentation(report){
  const n=report.native,states=n?.samples??[],visible=states.filter(s=>s.occlusionVisible);
  const physicallyFitted=n?.order==='back-physical'||n?.order==='front-physical'||n?.order==='player-physical';
  const tested=visible.filter(s=>s.stage!=='start');
  const begin=states.findIndex(s=>['measureBegin','peak'].includes(s.stage));
  const end=states.findIndex((s,i)=>i>begin&&['measureEnd','complete'].includes(s.stage));
  const focused=begin>=0&&end>begin&&states.slice(begin,end+1).every(s=>s.key&&s.main&&s.appActive&&s.occlusionVisible&&s.onActiveSpace&&s.wholeFrameInUsableScreen);
  return {target:physicallyFitted?'1920x1080 physical pixels; fitted native window':'legacy 1920x1080 native points',
    verifiedPlayerFocus:n?.order==='player-physical'&&focused,
    verifiedPhysical1080:physicallyFitted&&tested.length>0&&tested.every(s=>s.backingSurface?.join('x')==='1920x1080'&&s.wholeFrameOnScreen===true&&s.wholeFrameInUsableScreen===true&&s.onActiveSpace),
    backing:tested.at(-1)?.backingSurface??null,css:report.viewport??report.device?.viewport??report.renderReadiness?.state?.viewport??null};
}

export async function waitForWorldFrames(mode,report,timeout=28000){
  const proof=report.renderReadiness={mode,samples:[],seen:[],state:null};
  const start=performance.now(),end=start+timeout,pause=ms=>new Promise(r=>setTimeout(r,ms));
  let scene,tank,renderer,ctx,original,observer,frame=0,request=0,world,latest,lastEpoch=-1;
  const epoch=()=>{frame++;request=requestAnimationFrame(epoch);};
  const observe=()=>{
    const badge=document.querySelector('.training-badge')?.textContent??null;
    const canvas=document.querySelector('canvas[data-engine]');
    const radar=document.querySelector('canvas[data-game-ui]');
    const horde=!!document.querySelector('.nightmare-order');
    const rect=canvas?.getBoundingClientRect();
    const data={badge,sector:document.querySelector('.header h2')?.textContent??null,horde,
      viewport:[innerWidth,innerHeight],hidden:document.hidden,engine:canvas?.dataset.engine??null,
      canvas:canvas?[canvas.width,canvas.height]:null,cssSize:rect?[rect.width,rect.height]:null,
      canvases:[...document.querySelectorAll('canvas')].map(c=>[c.dataset.engine??null,c.width,c.height])};
    const key=radar&&Object.keys(radar).find(k=>k.startsWith('__reactFiber$'));
    let object;for(let f=key&&radar[key];f&&!object;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const candidate=h.memoizedState?.current;if(candidate?.isGroup&&candidate.name==='player-tank'){object=candidate;break;}
    }
    const s=object?.__r3f?.root?.getState();
    if(s&&canvas&&s.gl.domElement===canvas&&s.scene.getObjectByName('player-tank')===object){
      const gl=s.gl.getContext();
      Object.assign(data,{batch:true,displayDepth:gl.getContextAttributes?.()?.depth,programBound:!!gl.getParameter(gl.CURRENT_PROGRAM),renderer:gl.getParameter(gl.RENDERER),
        gpuDrawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],contextLost:gl.isContextLost(),frameCounter:s.gl.info.render.frame});
      if(!observer&&badge?.trim().toLowerCase()==='simulation'&&horde===(mode==='horde')&&!document.hidden){
        scene=s.scene;tank=object;renderer=s.gl;ctx=gl;world=canvas;original=scene.onAfterRender;
        observer=function(r,drawn,camera,...rest){
          try{return original?.call(this,r,drawn,camera,...rest);}
          finally{
            const info=r.info.render;
            if(r===renderer&&drawn===scene&&camera===s.camera&&tank.parent&&world.isConnected&&world.width===1920&&world.height===1080&&
                !document.hidden&&Number.isFinite(info.calls)&&info.calls>0&&Number.isFinite(info.triangles)&&info.triangles>0&&lastEpoch!==frame&&proof.samples.length<3){
              const target=r.getRenderTarget?.();
              lastEpoch=frame;proof.samples.push({t:performance.now(),epoch:frame,frameCounter:info.frame,calls:info.calls,triangles:info.triangles,
                worldDepth:target?.depthBuffer,worldTarget:target?[target.width,target.height]:null});
            }
          }
        };
        scene.onAfterRender=observer;request=requestAnimationFrame(epoch);
      }
    }
    latest=data;proof.state=data;
    const signature=[badge,data.engine,!!s,!!observer,horde,data.programBound,document.hidden].join('|');
    if(proof.seen.at(-1)?.signature!==signature&&proof.seen.length<20)proof.seen.push({ms:performance.now()-start,signature});
  };
  try{
    while(performance.now()<end){
      observe();
      if(proof.samples.length>=3&&proof.samples[2].frameCounter>proof.samples[0].frameCounter&&
        latest?.gpuDrawingBuffer?.join('x')==='1920x1080'&&!ctx?.isContextLost()){
        proof.elapsedMs=performance.now()-start;return ctx;
      }
      await pause(80);
    }
    throw Error('No three live 1080p scene submissions: '+JSON.stringify(latest));
  }finally{
    if(request)cancelAnimationFrame(request);
    if(observer&&scene?.onAfterRender===observer)scene.onAfterRender=original;
  }
}
