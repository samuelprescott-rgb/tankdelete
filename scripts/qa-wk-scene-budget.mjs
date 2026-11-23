// AFTER timing only. Observe one genuine main-world draw and the actual
// renderer counters. No extra render, quality/visibility/geometry or GL writes.
// For large batches, bound how many currently submitted instances could be
// rejected from the recorded camera if static placements were batched by
// world X/Z. Geometry bounds include a 1 m pad; shader deformation, skinning
// and motion must be independently bounded before using a candidate in game.
export async function inspectDrawBudget(){
  const radar=document.querySelector('canvas[data-game-ui]'),key=radar&&Object.keys(radar).find(k=>k.startsWith('__reactFiber$'));
  let root;for(let f=key&&radar[key];f&&!root;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const o=h.memoizedState?.current;if(o?.name==='player-tank'&&o.isGroup){root=o.__r3f?.root?.getState();break;}}
  if(!root)return {error:'No mounted world'};
  const {scene,camera,gl}=root,undo=[],counts=new Map();let active=false;
  const wrap=(o,key,wrapper)=>{const own=Object.hasOwn(o,key),source=o[key],next=wrapper(source);o[key]=next;
    undo.push(()=>{if(o[key]===next){if(own)o[key]=source;else delete o[key];}});};
  function label(o){const s=[];for(let v=o;v;v=v.parent){if(v.name)s.unshift(v.name);if(s.length===3)break;}
    return s.join('/')||o.geometry?.type||o.type;}
  let timeout;
  try{
    await new Promise((resolve,reject)=>{
      timeout=setTimeout(()=>reject(Error('No complete mounted world draw for budget')),2500);
      wrap(scene,'onBeforeRender',fn=>function(r,s,c,...args){const out=fn?.call(this,r,s,c,...args);if(r===gl&&s===scene&&c===camera)active=true;return out;});
      wrap(scene,'onAfterRender',fn=>function(r,s,c,...args){const out=fn?.call(this,r,s,c,...args);if(active&&r===gl&&s===scene&&c===camera){active=false;resolve();}return out;});
      scene.traverseVisible(o=>{if(!o.geometry||!o.material)return;let at=null;
        wrap(o,'onBeforeRender',fn=>function(r,s,c,...args){const out=fn?.call(this,r,s,c,...args);
          if(active&&r===gl&&s===scene&&c===camera)at=[r.info.render.calls,r.info.render.triangles];return out;});
        wrap(o,'onAfterRender',fn=>function(r,s,c,...args){if(at&&active&&r===gl&&s===scene&&c===camera){
          const v=counts.get(o)??{calls:0,triangles:0};v.calls+=r.info.render.calls-at[0];v.triangles+=r.info.render.triangles-at[1];counts.set(o,v);at=null;}
          return fn?.call(this,r,s,c,...args);});
      });
    });
  }finally{clearTimeout(timeout);for(const fn of undo.reverse())fn();}
  const projection=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).elements;
  // Left/right/top/bottom only: no assumptions about reversed Z or near/far.
  const planes=[];for(const axis of [0,1])for(const sign of [-1,1])planes.push([0,4,8,12].map(k=>projection[k+3]+sign*projection[k+axis]));
  const staticBatchEstimate=(o,triangles)=>{
    const sphere=o.geometry.boundingSphere;if(!sphere||!Number.isFinite(sphere.radius)||o.count<128||triangles<5000)return undefined;
    const m=o.matrix.clone(),wm=o.matrixWorld.clone(),c=sphere.center.clone(),cells=[10,20,30].map(size=>({size,map:new Map()}));
    for(let i=0;i<o.count;i++){o.getMatrixAt(i,m);wm.multiplyMatrices(o.matrixWorld,m);c.copy(sphere.center).applyMatrix4(wm);
      const e=wm.elements,R=sphere.radius,r=[0,1,2].map(k=>1+R*Math.hypot(e[k],e[k+4],e[k+8]));
      const x=[c.x,c.y,c.z];for(const {size,map} of cells){const id=Math.floor(x[0]/size)+','+Math.floor(x[2]/size);
        let box=map.get(id);if(!box){box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity,0];map.set(id,box);}box[6]++;
        for(let k=0;k<3;k++){box[k]=Math.min(box[k],x[k]-r[k]);box[k+3]=Math.max(box[k+3],x[k]+r[k]);}}
    }
    return cells.map(({size,map})=>{let rejected=0,hidden=0;for(const box of map.values()){
      if(planes.some(p=>p[3]+p.slice(0,3).reduce((v,n,k)=>v+n*box[k+(n<0?0:3)],0)<0)){rejected+=box[6];hidden++;}}
      return {cellSize:size,totalCells:map.size,visibleCells:map.size-hidden,excludedInstances:rejected,estimatedSkippedTriangles:Math.round(triangles*rejected/o.count)};});
  };
  const all=[...counts].sort(([,a],[,b])=>b.triangles-a.triangles);
  const cohorts=all.filter(([o,v])=>o.isInstancedMesh&&o.count>0&&v.calls>0&&!o.castShadow&&
    (o.name==='perimeter-leaf-cutouts'||o.name==='paddy-rice-shoots'||o.parent?.name==='layered-jungle')).map(([o,v])=>({
      name:label(o),capacity:o.instanceMatrix.count,submittedInstances:o.count,submittedTriangles:v.triangles,
      fullCapacityTriangles:v.triangles*o.instanceMatrix.count/o.count}));
  return {scope:'Post-measurement one actual main camera submission; excludes shadow/composer passes. Cell estimates include a 1 m world-space pad and are analytical, not timings or validation of shader displacement.',
    camera:camera.position.toArray(),calls:all.reduce((n,[,v])=>n+v.calls,0),triangles:all.reduce((n,[,v])=>n+v.triangles,0),objects:all.length,
    submittedStaticCohorts:cohorts,notSubmittedByCompaction:cohorts.reduce((n,v)=>n+v.fullCapacityTriangles-v.submittedTriangles,0),
    highest:all.slice(0,30).map(([o,v])=>({name:label(o),...v,instances:o.isInstancedMesh?o.count:1,capacity:o.isInstancedMesh?o.instanceMatrix.count:1,castShadow:o.castShadow,
      spatialEstimate:o.isInstancedMesh?staticBatchEstimate(o,v.triangles):undefined}))};
}
