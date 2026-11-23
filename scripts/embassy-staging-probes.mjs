import assert from 'node:assert/strict';
import * as T from 'three';

// Test the mounted shapes/placements in world space, including the actual
// alternative guard post, not only annotated screenshots or a point collider.
export async function checkEmbassyStaging({load,lib,archives,buildings,GHOST_EMBASSY_START,GHOST_EMBASSY_YAW,CAMERA_OFFSET}){
  const {createEmbassyColors}=await load('../src/components/Scene/embassyColors.ts');
  const {createEmbassyGroundworks}=await load('../src/components/Scene/embassyGroundworks.ts');
  const {coverInstances,coverGeometry,deployed}=await load('../src/components/Scene/USInfantrySquad.tsx');
  const {UPPER_BURN}=await load('../src/components/Scene/annexFirelight.ts');
  const offset=lib.EMBASSY_DEFENSE_OFFSET_Z,V=(...p)=>new T.Vector3(...p);
  const up=V(0,1,0),down=V(0,-1,0),asRoof=buildings.find(b=>b.position.x>0);
  const localHeight=(x,z)=>new T.Raycaster(V(x,10,z).add(asRoof.position),down).intersectObject(asRoof)[0]?.point.y;
  assert.deepEqual(archives[0].position,[0,0,-26]);
  assert.ok(archives[1].position[2]-archives[0].position[2]>5.7 && archives[2].position[2]-archives[0].position[2]>8,
    'both street wings stand forward of the working main building');
  const exterior=localHeight(1.42,-.53),low=localHeight(-1.03,-.53),opening=localHeight(-.29,.10);
  assert.ok(exterior>6 && low>4.0 && exterior-low>1.65 && opening<3.40,
    'Actual high corrugation, inward collapse and exposed open room: '+[exterior,low,opening]);
  const [bx,by,bz]=UPPER_BURN.dispatch,ground=new T.Raycaster(V(-bx,by+.10,bz).add(asRoof.position),down,.001,1)
    .intersectObject(asRoof)[0]?.point.y;
  assert.ok(Math.abs(ground-by)<.055,'actual smoulder sits on the broken slab: '+[ground,by]);
  const flags=createEmbassyColors(),field=flags.cloth.attributes.position,tex=flags.map.image;
  assert.equal(flags.stars.length,50);assert.equal(tex.width/tex.height,384/208);
  const inks=[];
  for(let i=0;i<13;i++){const k=4*(Math.floor((i+.5)*tex.height/13)*tex.width+Math.floor(tex.width*.72));
    inks.push(tex.data[k+1]>130?'ivory':'red');}
  assert.ok(inks.every((ink,i)=>ink===(i%2?'ivory':'red')),'13 alternating real stripe texels, red at both hems');
  flags.pole.computeBoundingBox();
  assert.ok(flags.pole.boundingBox.min.y<.033 && flags.pole.boundingBox.max.y>8.3);
  const flagWidths=[];
  for(const [position,yaw] of [[GHOST_EMBASSY_START,GHOST_EMBASSY_YAW],[lib.EMBASSY_GUARD_POSITION,lib.EMBASSY_GUARD_YAW]]){
    const cam=new T.PerspectiveCamera(60,16/9,.1,340),subject=V(...position);
    cam.position.set(CAMERA_OFFSET[0]+2.05,CAMERA_OFFSET[1]-.40,CAMERA_OFFSET[2]-.66).applyAxisAngle(up,yaw).add(subject);
    cam.lookAt(V(1.12,2.75,-1.28).applyAxisAngle(up,yaw).add(subject));cam.updateMatrixWorld();
    const projected=[];
    for(let i=0;i<field.count;i+=3){const p=new T.Vector3().fromBufferAttribute(field,i),q=p.clone().project(cam);
      assert.ok(Math.abs(q.x)<.99 && Math.abs(q.y)<.99,'flag cloth wholly in the ordinary view');
      const ray=new T.Raycaster(cam.position,p.clone().sub(cam.position).normalize(),0,cam.position.distanceTo(p)-.025);
      assert.equal(ray.intersectObjects(buildings,false).length,0,'flag must not disappear behind a roof or a beam');
      projected.push(q);}
    const w=960*(Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x))),
      h=540*(Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y)));
    assert.ok(w>48 && h>46,'readable 1080p flag '+[w,h]);flagWidths.push(Math.round(w)+'×'+Math.round(h));
  }
  flags.pole.dispose();flags.cloth.dispose();flags.map.dispose();flags.material.dispose();
  const works=createEmbassyGroundworks(),p=works.walls.attributes.position,index=works.walls.index,triangles=[];
  for(let i=0;i<(index?.count??p.count);i+=3){const vec=n=>new T.Vector3().fromBufferAttribute(p,index?index.getX(n):n);
    triangles.push(new T.Triangle(vec(i),vec(i+1),vec(i+2)));}
  let minGap=Infinity,samples=0;
  for(const member of deployed.filter(s=>s.id==='us-rifle-3'||s.id==='us-rto-4')){
    const from=V(...member.position),to=V(...(member.alternatePosition??member.position));from.z+=offset;to.z+=offset;
    for(let j=0;j<=40;j++)for(const h of [.20,.54,.94,member.kneeling?1.20:1.69]){
      const point=from.clone().lerp(to,j/40);point.y=h;
      for(const t of triangles)minGap=Math.min(minGap,t.closestPointToPoint(point,new T.Vector3()).distanceTo(point));samples++;}
  }
  assert.ok(minGap>.57,'both right-hand soldiers have body and gear clearance along entire shift: '+minGap);
  const bags=coverInstances(offset).sandbags;coverGeometry.sandbag.computeBoundingBox();
  // Inspect the real batched field asset: sealed volume, constricted knot,
  // flared asymmetric mouth and fixed 1080p review ray from R24's receipt.
  {
    const g=coverGeometry.sandbag,p=g.getAttribute('position'),finish=g.getAttribute('sackFinish');
    const radii=i=>{const a=Array.from({length:12},(_,j)=>p.getZ(i*12+j));return Math.max(...a)-Math.min(...a);};
    const neck=radii(12),mouth=radii(14),body=radii(4);
    assert(mouth/neck>1.45&&body/neck>2.9,'Rolled ear must open beyond an actual tied 3D neck');
    const edges=new Map(),ix=g.index.array;
    for(let j=0;j<ix.length;j+=3)for(let k=0;k<3;k++){const a=ix[j+k],b=ix[j+(k+1)%3],id=Math.min(a,b)+':'+Math.max(a,b);
      edges.set(id,(edges.get(id)||0)+1);}
    assert([...edges.values()].every(n=>n===2)&&ix.length/3<=440&&g.groups.length===0);
    assert(Math.abs(g.boundingBox.min.y+1)<1e-6&&Math.abs(g.boundingBox.max.y-1)<1e-6&&finish.count===p.count);
    const bag=new T.Mesh(g,new T.MeshBasicMaterial());bag.matrixAutoUpdate=false;
    const campaign=coverInstances(0).sandbags;bag.matrix.copy(campaign[25].matrix);bag.updateMatrixWorld(true);
    const eye=V(5.2068953984,.7472500039,-2.0464914862),look=V(4.9314322849,.3572500039,-3.2025567067);
    const r=new T.Raycaster(eye,look.sub(eye).normalize()),h=r.intersectObject(bag,false)[0];
    assert(h);const difference=h.point.distanceTo(V(4.9530784099,.3878965345,-3.1117121217));
    assert(difference<.025,'Retained same field bag and physical surface within 2.5 cm');
    const aim=new T.Vector3(),forward=campaign.map(s=>aim.set(1,0,0).transformDirection(s.matrix).x);
    assert(forward.filter(x=>x>.7).length>=3&&forward.filter(x=>x<-.7).length>=3,'The same closures must not all point the same way in stacked courses');
    console.log('Actual sandbag: '+ix.length/3+' triangles, '+p.count+' vertices, closed topology, cuff/neck '+(mouth/neck).toFixed(2)+', unchanged 1080p ray moved '+(difference*1000).toFixed(1)+' mm');bag.material.dispose();
  }
  const box=coverGeometry.sandbag.boundingBox,boxes=bags.map(s=>box.clone().applyMatrix4(s.matrix));
  for(const b of boxes){
    assert.ok(triangles.every(t=>!b.intersectsTriangle(t)),'actual sandbag intersects a courtyard wall or pier at '+b.min.toArray());
    if(b.min.y<.090)continue;
    assert.ok(boxes.some(other=>other!==b && other.min.y<.09 && other.max.y>b.min.y-.035 &&
      Math.min(other.max.x,b.max.x)-Math.max(other.min.x,b.min.x)>.12 &&
      Math.min(other.max.z,b.max.z)-Math.max(other.min.z,b.min.z)>.15),
      'every elevated sack must sit across a lower course, including trench tails: '+b.min.toArray());
  }
  for(const a of archives){const [x,,z]=a.approach;
    for(let step=0;step<6;step++)for(const dx of [-.32,0,.32]){const point=V(x+dx,.32,z+step*.27);
      assert.ok(triangles.every(t=>t.closestPointToPoint(point,new T.Vector3()).distanceTo(point)>.29),
        'approach to '+a.id+' clips a compound wall');}}
  works.court.dispose();works.walls.dispose();
  console.log('Embassy staging: ordinary flag '+flagWidths.join(' / ')+'px, guard path '+samples+' probes / '+minGap.toFixed(2)
    +'m minimum to masonry, '+bags.length+' grounded/stacked sacks; collapsed roof '+exterior.toFixed(2)+'→'+low.toFixed(2)+'m with open sky.');
}
