// Browser-side inspection only. Select a camera for a real moving subject.
// Never change model/pose/light, remove scenery, or write to the live camera
// while TESTING a candidate. Only an accepted study pose is actually rendered.
export function installCommandPhotoPlanner(options={}){
  const scenic=options?.scenic===true;
  const store=window.rigRoot,{scene,camera,raycaster}=store.getState(),boss=scene.getObjectByName('nightmare-boss-sculpt');
  const get=n=>boss.getObjectByName(n),mk=()=>camera.position.clone(),probeCamera=camera.clone();
  const head=[get('command-double-faced-skull'),get('command-watchers-skull')],chest=get('command-weight-bearing-chest');
  const shoulders=[get('command-upper-0'),get('command-striking-arm')],legs=['left','right'].map(s=>get('command-leg-'+s).getObjectByName('boot'));
  const p=mk(),q=mk(),delta=mk(),viewer=mk(),aim=mk(),point=mk();
  const ray=new raycaster.constructor(),proxy=new head[0].constructor(),scratch=[],matrix=camera.matrix.clone();
  const seen=(o)=>{for(;o;o=o.parent)if(!o.visible)return false;return true;};
  const local=(o,x,y,z)=>mk().set(x,y,z).applyMatrix4(o.matrixWorld);
  const polar=(o,eye,target,turn=0,pull=1,rise=0)=>{
    viewer.fromArray(eye);aim.fromArray(target);viewer.sub(aim);
    const a=viewer.x*Math.cos(turn)-viewer.z*Math.sin(turn);
    viewer.z=viewer.x*Math.sin(turn)+viewer.z*Math.cos(turn);viewer.x=a;
    viewer.multiplyScalar(pull).add(aim);viewer.y+=rise;viewer.applyMatrix4(o.matrixWorld);aim.applyMatrix4(o.matrixWorld);
  };
  const ocular=head.map(o=>{
    const e=o.geometry.getAttribute('commandEmber'),v=o.geometry.getAttribute('position'),eyes=[mk().set(0,0,0),mk().set(0,0,0)],count=[0,0];
    for(let i=0;i<e.count;i++)if(e.getX(i)>.01){p.fromBufferAttribute(v,i);const k=p.x<0?0:1;eyes[k].add(p);count[k]++;}
    if(!count[0]||!count[1])throw Error('Could not locate physical iris vertices');
    return eyes.map((v,i)=>v.divideScalar(count[i]));
  });
  const models=[
    ['front-left',[.92,1.13,-2.85],0],['front-right',[.92,1.13,-2.85],1],
    ['profile-left',[-2.65,1,-.63],0],['profile-right',[-2.65,1,-.63],1],
    ['rear',[1.65,1.15,2.45],-1],['front-portrait',[.30,1.50,-1.28],-1,[-.035,1.30,-.04],0],
    ['watcher-portrait',[1.21,1.56,.38],-1,[.07,1.30,.045],1],
    // In R14 "-left/-right" refers to weight-bearing leg, NOT orbit side.
    // These two explicitly additional opposite-side views close that gap.
    ['opposite-front',[-.92,1.13,-2.85],-1],['opposite-profile',[2.65,1,-.63],-1],
  ].map(([name,eye,foot,target=[0,.81,0],portrait=-1],index)=>({name,eye,foot,target,portrait,index}));
  const layers=o=>{const ms=Array.isArray(o.material)?o.material:[o.material];return ms.some(m=>m?.visible&&m.depthTest!==false&&m.colorWrite!==false&&
    !(m.transparent&&(m.opacity<.28||(!m.depthWrite&&!m.alphaTest&&m.blending!==1))));};
  const primitive=o=>{for(let n=o;n;n=n.parent)if(n===boss)return false;return true;};
  const direct=[],instances=[];
  const pixelsFor=new WeakMap();
  function sample(tex,uv,channel){
    if(!tex||!uv)return 1;
    if(!pixelsFor.has(tex)){
      const im=tex.image;let plate=null;
      if(im?.data instanceof Uint8Array&&im.data.length===im.width*im.height*4)plate=im;
      else if(im?.width&&im?.height){
        // Alpha only: a sight ray touching a leaf card's clear corners must
        // not reject a view where the actual renderer discards that fragment.
        try{const c=document.createElement('canvas'),ratio=Math.min(1,512/Math.max(im.width,im.height));
          c.width=Math.max(1,Math.round(im.width*ratio));c.height=Math.max(1,Math.round(im.height*ratio));
          const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0,c.width,c.height);plate=g.getImageData(0,0,c.width,c.height);
        }catch{/* Unknown layouts conservatively block instead of inventing a clear window. */}
      }
      pixelsFor.set(tex,plate);
    }
    const plate=pixelsFor.get(tex);if(!plate)return 1;
    const xy=tex.transformUv(uv.clone()),x=Math.min(plate.width-1,Math.max(0,Math.floor(xy.x*plate.width)));
    const y=Math.min(plate.height-1,Math.max(0,Math.floor(xy.y*plate.height)));
    return plate.data[(y*plate.width+x)*4+channel]/255;
  }
  const solidHit=(mesh,hits)=>hits.some(hit=>{
    const mat=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
    if(!mat?.visible||mat.depthTest===false||mat.colorWrite===false)return false;
    if(!mat.transparent&&!mat.alphaTest)return true;
    return mat.opacity*sample(mat.map,hit.uv,3)*sample(mat.alphaMap,hit.uv,1)>=Math.max(.24,mat.alphaTest||0);
  });
  // One index per real fourth wave. The apron / village / tree transforms
  // are static; animated non-instanced meshes keep their live world matrices.
  function index(){
    scene.updateMatrixWorld(true);
    scene.traverse(o=>{
      if(!o.isMesh||!o.geometry||!primitive(o)||!seen(o)||!layers(o)||o.isSprite)return;
      const g=o.geometry;if(!g.getAttribute('position'))return;
      if(!g.boundingSphere)g.computeBoundingSphere();const b=g.boundingSphere;if(!(b.radius>0))return;
      if(!o.isInstancedMesh){direct.push({o,b});return;}
      for(let i=0;i<o.count;i++){
        o.getMatrixAt(i,matrix);matrix.premultiply(o.matrixWorld);
        const scale=matrix.getMaxScaleOnAxis(),r=b.radius*scale;if(r<.07)continue;
        p.copy(b.center).applyMatrix4(matrix); if(p.x+r< -30 || p.x-r>45 ||p.z+r< -52||p.z-r>14||p.y-r>23||p.y+r<-.5)continue;
        instances.push({o,center:p.clone(),r2:r*r,world:matrix.clone()});
      }
    });
  }
  const rejected={},attempts={};let indexed=false,lastTry=-Infinity,lastStudy=null;
  function blocked(origin,target){
    delta.subVectors(target,origin);const length=delta.length();ray.near=.06;ray.far=length-.08;
    ray.set(origin,delta.multiplyScalar(1/length));
    const inRange=(center,r2)=>{
      q.subVectors(center,origin);
      const along=Math.max(0,Math.min(length,q.dot(delta)));
      return q.addScaledVector(delta,-along).lengthSq()<=r2;
    };
    for(const {o,b} of direct){
      if(!seen(o))continue;point.copy(b.center).applyMatrix4(o.matrixWorld);
      if(!inRange(point,(b.radius*o.matrixWorld.getMaxScaleOnAxis())**2))continue;
      scratch.length=0;o.raycast(ray,scratch);if(solidHit(o,scratch))return o.name||o.parent?.name||'scene mesh';
    }
    for(const {o,center,r2,world} of instances){
      if(!seen(o)||!inRange(center,r2))continue;
      proxy.geometry=o.geometry;proxy.material=o.material;proxy.matrixWorld.copy(world);
      scratch.length=0;proxy.raycast(ray,scratch);
      if(solidHit(o,scratch))return o.name||o.parent?.name||'scene instance';
    }
    return null;
  }
  const reason=(key)=>{rejected[key]=(rejected[key]??0)+1;return null;};
  const pix=w=>{p.copy(w).project(probeCamera);return [(1+p.x)*960,(1-p.y)*540,p.z];};
  function inspect(study,spec,root,feet){
    const {portrait}=study;
    if(spec.kind==='portrait'){
      const o=head[portrait];polar(o,spec.eye,spec.aim);
    }else{
      polar(boss,study.eye,study.target,spec.turn,spec.pull,spec.rise);
      if(study.portrait<0&&study.name!=='rear'){
        const rel=boss.worldToLocal(p.copy(viewer));
        if(rel.x*study.eye[0]<=0||Math.abs(rel.x)<.14)return reason('crossed requested orbit side');
      }
    }
    probeCamera.position.copy(viewer);probeCamera.lookAt(aim);probeCamera.updateMatrixWorld();
    const mid=head.map(o=>local(o,0,.065,-.075)),chestP=local(chest,0,.28,-.13);
    const legP=legs.map(o=>local(o,0,.05,-.07)),midP=mid.map(pix);
    const shouldersP=shoulders.map(o=>local(o,0,-.035,0));
    const dot=head.map((o,i)=>q.set(0,0,-1).transformDirection(o.matrixWorld).dot(p.subVectors(viewer,mid[i]).normalize()));
    const irises=ocular.map((pair,i)=>pair.map(v=>v.clone().applyMatrix4(head[i].matrixWorld)));
    const irisPix=irises.map(pair=>pair.map(pix));
    const inFrame=([x,y,z],pad=45)=>z>0&&z<1&&x>pad&&x<1920-pad&&y>pad&&y<1080-pad;
    // Actual actor versus another actor part: the watcher's brow may sit
    // behind its partner or front shoulder even with a clear landscape ray.
    const selfOccluded=(o,w)=>{
      delta.subVectors(w,viewer);const len=delta.length();ray.set(viewer,delta.multiplyScalar(1/len));ray.near=.06;ray.far=len-.27;
      const hits=ray.intersectObject(boss,true);return hits.some(h=>{if(!seen(h.object))return false;for(let m=h.object;m;m=m.parent)if(m===o)return false;return true;});
    };
    if(portrait>=0){
      if(dot[portrait]<.60||!irisPix[portrait].every(v=>inFrame(v,60)))return reason('not facing portrait');
      // A portrait must show facial features at an inspectable scale. Distance
      // is measured in rendered eye pixels, not based on a canned zoom.
      if(Math.hypot(irisPix[portrait][0][0]-irisPix[portrait][1][0],irisPix[portrait][0][1]-irisPix[portrait][1][1])<23)
        return reason('portrait too small');
      for(const eye of irises[portrait]){
        const obscure=blocked(viewer,eye);if(obscure)return reason(obscure);
        if(selfOccluded(head[portrait],eye))return reason('self-obscured portrait');
      }
    }else{
      const points=[...head.map(o=>local(o,0,.34,0)),...mid,...legP,chestP,...shouldersP];
      if(scenic){
        // Reject when a foreground wall only narrowly misses the centre of a
        // toe, jaw or chest. Camera-side samples must see the whole mass.
        const across=probeCamera.position.clone().set(1,0,0).applyQuaternion(probeCamera.quaternion);
        for(const [w,r] of [...mid.map(p=>[p,.40]),...legP.map(p=>[p,.42]),[chestP,.85],...shouldersP.map(p=>[p,.36])])
          points.push(w.clone().addScaledVector(across,r), w.clone().addScaledVector(across,-r));
        const faceWidth=Math.max(...head.map((o,i)=>{
          const width=local(o,.15,.065,-.075).distanceTo(mid[i]);
          const a=pix(mid[i].clone().addScaledVector(across,width)),b=pix(mid[i].clone().addScaledVector(across,-width));
          return Math.abs(a[0]-b[0]);}));
        if(Math.abs(midP[0][0]-midP[1][0])<Math.max(72,.92*faceWidth))return reason('superimposed crown silhouettes');
        if(study.name==='rear'&&boss.worldToLocal(p.copy(viewer)).z<.35)return reason('crossed rear hemisphere');
      }
      if(!points.map(pix).every(v=>inFrame(v,22)))return reason('extremity outside frame');
      const headSeparation=Math.hypot(midP[0][0]-midP[1][0],midP[0][1]-midP[1][1]);
      if(headSeparation<44)return reason('overlapping heads');
      if(study.name!=='rear'&&Math.max(...dot)<.02)return reason('only backs of heads');
      for(const w of points){const obscure=blocked(viewer,w);if(obscure)return reason(obscure);}
      for(let i=0;i<2;i++)if(selfOccluded(head[i],mid[i]))return reason('skull behind actor');
    }
    const targets={heads:midP,feet:legP.map(pix),shoulders:shouldersP.map(pix),sternum:pix(chestP),irises:irisPix};
    return {name:study.name,t:store.getState().clock.elapsedTime,root,feet,opacity:head[0].material.opacity,
      eye:viewer.toArray(),look:aim.toArray(),reference:{localEye:study.eye,localAim:study.target,foot:study.foot},
      protocol:spec.kind==='portrait'?'disclosed skull-local inspection':spec.turn||spec.rise||spec.pull!==1?'disclosed clearance offset':
        study.index>6?'additional opposite-side camera':'exact R14 root-local camera',
      cameraOffset:spec,facing:dot,targets,requiredIris:portrait,verifiedExternalRays:portrait>=0?2:scenic?23:9,strictScenic:scenic};
  }
  function plan(done,now,root,feet){
    if(now-lastTry<.03)return null;lastTry=now;
    if(!indexed){index();indexed=true;}
    const available=models.filter(m=>!done.some(s=>s.name===m.name));
    // Finite deterministic search: at most one trial per eligible study per
    // selection tick, cycle views and offsets across genuine movement frames.
    for(const m of available){
      if(m.foot>=0&&feet[m.foot][1]-feet[1-m.foot][1]<.33)continue;
      // Real gait windows come first. Static and portrait studies remain
      // available after the boss plants both feet, without harming it.
      if((m.foot<0&&root[0]>8.0)||(scenic&&root[0]>9.2))continue;
      const cnt=(attempts[m.name]??0);attempts[m.name]=cnt+1;
      const seed={kind:'root',turn:0,pull:1,rise:0};
      const offsets=[seed,{...seed,turn:.13},{...seed,turn:-.15},{...seed,pull:.82,rise:.13},
        {...seed,turn:.30,pull:.86,rise:.19},{...seed,turn:-.30,pull:.9,rise:.11},
        {...seed,turn:.45,pull:.82,rise:.24},{...seed,turn:-.45,pull:.85,rise:.23}];
      if(scenic)for(const turn of [.58,-.58,.76,-.76,.92,-.92,.22,-.22])offsets.push({...seed,turn,pull:.85,rise:.17});
      if(m.portrait>=0)for(const x of [0,.38,-.43,.68,-.68])offsets.push({kind:'portrait',eye:[x,.22,-1.42],aim:[0,.052,-.02]});
      const shot=inspect(m,offsets[cnt%offsets.length],root,feet);
      if(shot){if(m.foot>=0)lastStudy=[m,shot.cameraOffset];return shot;}
    }
    return null;
  }
  function follow(root,feet){
    if(!lastStudy)return null;
    // Real camera-local walk footage, not an animation assembled from nine
    // stills. Re-test the lens as the subject and occluders move.
    return inspect(lastStudy[0],lastStudy[1],root,feet);
  }
  window.commandPhotoPlanner={plan,follow,count:models.length,attempts,rejected};
}
