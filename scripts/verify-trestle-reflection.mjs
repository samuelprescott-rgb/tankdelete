import assert from 'node:assert/strict';
import * as T from 'three';

// The trace deliberately uses scalar math and vector constructors. Run the
// actual shader function on the CPU, not a separate JS reimplementation of it.
function cpuTrace(glsl,m) {
  const vectors=data=>Array.from({length:data.length/4},(_,i)=>new T.Vector4().fromArray(data,4*i));
  const js=glsl.replace(/uniform [^;]+;/g,'')
    .replace(/(?:float|vec[234]) (\w+)\(([^)]*)\)\s*\{/g,(_,name,args)=>
      'function '+name+'('+args.replace(/\b(?:float|vec[234])\s+/g,'')+'){')
    .replace(/\b(?:float|int|vec[234])\s+(?=\w)/g,'let ');
  return new Function('mirrorFrame','mirrorPile','mirrorPost','mirrorHead','mirrorDeck','mirrorStations','mirrorDeckThickness',
    'const {min,max,abs}=Math,vec2=(x,y=x)=>({x,y}),vec3=(x,y,z)=>({x,y,z});'+js+';return traceTrestle;')
    (m.frame,m.pile,m.post,m.head,vectors(m.deck),vectors(m.stations),m.thickness);
}
export function checkTrestleTrace(glsl,profile,pieces,br,waterTest,waterY){
  const trace=cpuTrace(glsl,profile),cube=new T.BoxGeometry(),mat=new T.MeshBasicMaterial({side:T.DoubleSide});
  const objects=pieces.filter(p=>['pile','post','headstock'].includes(p.kind)||!p.kind&&p.scaleZ>br.width*.8).map(p=>{
    const m=new T.Mesh(cube,mat);m.userData.bent=Boolean(p.kind);m.position.set(p.x,p.y,p.z);
    m.rotation.set(0,p.rotation,p.pitch??0);m.scale.set(p.scaleX,p.scaleY,p.scaleZ);m.updateMatrixWorld();return m;
  });
  const ray=new T.Raycaster(),o=new T.Vector3(),d=new T.Vector3(),hits=[];
  let checked=0,mismatch=0,bents=0,deck=0,sky=0;
  function check(exact=false,required=null){
    hits.length=0;ray.set(o,d.normalize());ray.intersectObjects(objects,false,hits);
    const result=trace(o,d),shader=result.y?'wood':result.x?'deck':'sky',actual=hits.length?(hits[0].object.userData.bent?'wood':'deck'):'sky';
    if(exact)assert.equal(shader,actual,'Exact targeted ray from '+o.toArray()+' toward '+d.toArray());
    if(required)assert.equal(actual,required,'Targeted ray must test an actual '+required);
    mismatch+=shader!==actual;checked++;bents+=actual==='wood';deck+=actual==='deck';sky+=actual==='sky';
  }
  for(const p of pieces.filter(p=>p.kind==='post')){
    const side=Math.sign(p.x-br.centerX);
    // Hit the REAL upper tip and miss a few cm above it. A fixed height of
    // 1.48 would erase most of the inner posts, even on a heavily rippled day.
    for(const dy of [-.04,.08]){
      o.set(p.x+side*.7,p.y+p.scaleY*.5+dy,p.z);d.set(-side,0,0);check(dy<0,dy<0?'wood':null);
    }
  }
  for(const p of pieces.filter(p=>p.kind==='headstock')){
    o.set(p.x,p.y,p.z-.57);d.set(0,0,1);check(true,'wood');
  }
  // Sunlit bank inspection and both ordinary driver positions: reflect true
  // view vectors off the real water surface, including a small ripple tilt.
  for(const [ex,ey,ez] of [[-3.34,2.94,-1.98],[-3.34,2.94,1.02],[-10.3,2.4,10.1],[10.4,1.9,24.3]]){
    for(let ix=0;ix<64;ix++)for(let iz=0;iz<56;iz++){
      const x=br.centerX-10.64+ix*.338,z=br.z-8.74+iz*.311;
      if(!waterTest(x,z))continue;
      o.set(x,waterY,z);d.set(x-ex,ey-waterY,z-ez);d.x+=.11*Math.sin(ix*.8+iz*.37);check();
    }
  }
  assert.ok(checked>1500&&bents>65&&deck>45&&sky>400,'Survey must cover wood, deck and real negative space');
  assert.ok(mismatch/checked<.019,'Main timber reflection should agree with renderer triangles (except closed seams/eased slab edges): '+JSON.stringify({checked,mismatch}));
  mat.dispose();cube.dispose();return {checked,mismatch,bents,deck};
}
