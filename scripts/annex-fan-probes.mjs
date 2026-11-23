import assert from 'node:assert/strict';
import * as T from 'three';

// Retained R10 world camera poses, including the normal (not inspection)
// player view. Measure the nearest visible surface on the actual live annex,
// including its archive door/plaque and working front panes, not just rubble.
export function checkFallFans(building,breakage,signal,slots,obstacles){
  const mat=new T.MeshBasicMaterial(),view=new T.PerspectiveCamera(60,16/9,.1,340);
  const cams=[
    [new T.Vector3(7,2.7,-5.7),new T.Vector3(-1.8,2,-23)],
    [new T.Vector3(6.228966,3.80,-2.889663),new T.Quaternion(-.0687765,.1612382,.0112645,.9844517)],
  ];
  const result=[];
  for(const id of ['records','dispatch']){
    const slot=slots.find(a=>a.id===id),mesh=(g)=>{const m=new T.Mesh(g,mat);m.position.fromArray(slot.position);m.updateMatrixWorld();return m;};
    const shell=mesh(building(false,false,id)),lights=mesh(signal(id)),fan=mesh(breakage(id)),g=fan.geometry,
      start=g.userData.fallFanIndexStart,index=g.index,p=g.attributes.position;
    assert.ok(Number.isInteger(start)&&start>0&&start<index.count);
    g.setDrawRange(start,index.count-start);
    const points=[],inside=obstacles.filter(o=>o.archiveId===id);
    for(let i=start;i<index.count;i++){
      const q=new T.Vector3().fromBufferAttribute(p,index.getX(i));points.push(q);
      assert.ok(q.y>=.34&&q.y<2.28,'Fall stays on the plinth below the occupied floor');
      assert.ok(q.z<1.84||Math.abs(q.x)>1.02,'No rubble in front of the door/open approach');
      const w=q.clone().add(fan.position);
      assert.ok(inside.some(o=>Math.hypot(w.x-o.position[0],w.z-o.position[2])<o.radius),
        id+' art projects outside existing obstacle footprint '+q.toArray());
    }
    const floorContacts=points.filter(q=>q.y<=.37),foreWet=points.filter(q=>q.z>2.20&&q.y<1.0);
    assert.ok(floorContacts.length>5&&Math.max(...points.map(q=>q.y))>1.60,'Rubble needs a planted toe and a standing broken section');
    if(id==='records')assert.ok(foreWet.length>12&&Math.min(...points.map(q=>q.z))>.70,'Records fans out toward the court');
    else assert.ok(Math.min(...points.map(q=>q.z))<-.45&&foreWet.length===0,'Dispatch folds back into its room, not a mirrored spill');
    const area=[];
    for(const [eye,aim] of cams){
      view.position.copy(eye);if(aim.isQuaternion)view.quaternion.copy(aim);else view.lookAt(aim);view.updateMatrixWorld();
      const rect=new T.Box2(),v=new T.Vector2(),ray=new T.Raycaster();
      for(const q of points){const n=q.clone().add(fan.position).project(view);rect.expandByPoint(v.set((1+n.x)*960,(1-n.y)*540));}
      let pixels=0;
      for(let y=Math.max(1,Math.floor(rect.min.y/2)*2+1);y<Math.min(1080,rect.max.y);y+=2)
        for(let x=Math.max(1,Math.floor(rect.min.x/2)*2+1);x<Math.min(1920,rect.max.x);x+=2){
          ray.setFromCamera(v.set(x/960-1,1-y/540),view);
          const hit=ray.intersectObject(fan,false)[0];
          if(!hit)continue;
          const first=ray.intersectObjects([shell,lights],false)[0];
          if(first&&Math.abs(first.distance-hit.distance)<.001)pixels+=4;
        }
      area.push(pixels);
    }
    result.push({id,triangles:(index.count-start)/3,screenPx:area});
    shell.geometry.dispose();lights.geometry.dispose();g.dispose();
  }
  mat.dispose();
  console.log('Visible fall fans, 1080p scenic / play camera:',JSON.stringify(result));
  assert.ok(result.reduce((n,r)=>n+r.triangles,0)<650,'Both falls must fit one small geometry allowance');
  assert.ok(result.every(r=>r.screenPx[0]>550&&r.screenPx[1]>550),'Masonry has to be exposed on both real annexes');
}
