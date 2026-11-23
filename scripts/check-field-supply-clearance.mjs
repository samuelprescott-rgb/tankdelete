import assert from 'node:assert/strict';
import * as THREE from 'three';

// Real ordinary campaign boot anchors, two opposite foot plants on R7
// GameSession-CzGxyrAR (us-rto-4, 7.4100s and 7.7931s). These three
// penetrations reproduced the lower shins visibly disappearing into the lid.
const recorded=[
  [5.736070534,.169125971,-3.692290107],[5.735070506,.1352,-3.917483962],
  [5.754594267,.1352,-3.942353115],[5.816205516,.207151666,-4.023943471],
].map(p=>new THREE.Vector3(...p));

export function checkFieldSupplyClearance({scene,state,subscriptions,offset,footLaneClear,fieldSupplyFootprints}){
  scene.updateMatrixWorld(true);
  const matrix=new THREE.Matrix4(),v=new THREE.Vector3(),boxes=[];
  for(const name of ['field-kit-crates','field-kit-lids','field-kit-cans']){
    const mesh=scene.getObjectByName(name);
    assert.equal(mesh?.count,3,name+' should still furnish all three fighting positions');
    mesh.geometry.computeBoundingBox();
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);
      boxes.push(mesh.geometry.boundingBox.clone().applyMatrix4(matrix.premultiply(mesh.matrixWorld)));
    }
  }
  if(offset===0){
    const old=new THREE.Box3(new THREE.Vector3(5.629034874,.02,-4.210861859),new THREE.Vector3(6.109034874,.30,-3.860861859));
    assert.equal(recorded.filter(p=>old.containsPoint(p)).length,3);
    const clearance=Math.min(...recorded.flatMap(p=>boxes.map(b=>b.distanceToPoint(p))));
    assert.ok(clearance>.65,'Retained R7 boot anchors fail clearance against the *new real* instance matrices: '+clearance);
  }
  const lines=fieldSupplyFootprints(offset), movers=[];
  scene.traverseVisible(o=>{
    if(!o.isSkinnedMesh || o.name!=='us-field-infantry-volume')return;
    const kind=o.geometry.getAttribute('surfaceKind'),bones=o.geometry.getAttribute('skinIndex');
    const pos=o.geometry.getAttribute('position'),vertices=[],seen=new Set();
    // Each unique boot vertex; remove the repeated non-indexed triangle corners.
    for(let i=0;i<kind.count;i++)if(kind.getX(i)===5){
      const key=[pos.getX(i),pos.getY(i),pos.getZ(i),bones.getX(i)].join('/');
      if(!seen.has(key)){seen.add(key);vertices.push(i);}
    }
    assert.ok(vertices.length>70);movers.push({body:o,vertices,start:o.parent.position.clone(),wide:0});
  });
  assert.equal(movers.length,5);
  let minimum=Infinity,poses=0,moved=0;
  for(let tick=0;tick<900;tick++){
    state.clock.elapsedTime+=1/30;
    for(const f of subscriptions)f.current(state,1/30);
    if(tick%5)continue;
    scene.updateMatrixWorld(true);
    for(const m of movers){
      const p=m.body.parent.getWorldPosition(v);
      m.wide=Math.max(m.wide,p.distanceTo(m.start));
      assert.ok(footLaneClear(p.x,p.z,p.x,p.z,lines),'Live root inside kit reservation: '+m.body.parent.name);
      for(const i of m.vertices){
        m.body.getVertexPosition(i,v).applyMatrix4(m.body.matrixWorld);
        for(const b of boxes)minimum=Math.min(minimum,b.distanceToPoint(v));
      }
      poses++;
    }
  }
  moved=movers.filter(m=>m.wide>.30).length;
  assert.ok(moved>0,'Hold-position-only test does not qualify');
  assert.ok(minimum>.12,'An actual boot clips or grazes the kit; minimum '+minimum);
  console.log(`Field kit ${offset?'embassy':'day'}: ${poses} real poses, ${moved} travelled >.30u, nearest skinned boot to rendered kit AABB ${minimum.toFixed(3)}u`);
}
