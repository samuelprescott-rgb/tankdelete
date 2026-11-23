// CPU garment acceptance: mount the combatant, skin its actual triangles and
// depth-test their projected coverage on a 4px lattice for portraits, or at
// native 1080p pixel spacing in a cropped field view. This produces no images
// and does not simulate lighting, scene occluders or final WebKit.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import React from 'react';
import {act,context,extend,reconciler} from '@react-three/fiber';
import * as T from 'three';

async function load(path) {
  const result=await build({configFile:false,logLevel:'silent',publicDir:false,esbuild:{jsx:'automatic'},
    build:{ssr:fileURLToPath(new URL(path,import.meta.url)),write:false,minify:false}});
  const code=result.output.find(c=>c.type==='chunk'&&c.isEntry).code
    .replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const reference={
  sha256:'e8cfff5cd6ead4f631a6d81a03c74d99dbc53153cfa644ed964e58d3088cd01c',
  actor:'vc-1969-1',body:'vc-field-infantry-volume',localEye:[1.22,1.32,-1.38],
  localLook:[0,1.02,0],fov:60,buffer:[1920,1080],
};
const kitURL=new URL('../../TankDelete-Concepts/ghost-signal-microcode-01/game/micro-r21/kit/',import.meta.url);
try {
  const receipt=JSON.parse(await readFile(new URL('kit.json',kitURL),'utf8')).shots.find(s=>s.id==='local-scout');
  for(const [name,value] of Object.entries(reference))assert.deepEqual(receipt[name],value,'R21 camera/actor drift: '+name);
  assert.equal(sha(await readFile(new URL('local-scout.png',kitURL))),reference.sha256,'R21 source image changed');
}catch(e){if(e.code!=='ENOENT')throw e;console.warn('R21 sibling art archive absent: using frozen kit camera, PNG not reverified');}

const [{VietCongCombatants},combat]=await Promise.all(['../src/components/Scene/VietCongCombatants.tsx','../src/lib/combat.ts'].map(load));
const {fieldHandInk}=await load('../src/components/Scene/handPaintPlate.ts');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;extend(T);
const scene=new T.Scene(),subscribers=new Set(),ref=current=>({current});
const state={scene,camera:new T.PerspectiveCamera(),clock:{elapsedTime:0},invalidate(){},internal:{
  active:false,frames:0,interaction:[],initialHits:[],hovered:new Map(),capturedMap:new Map(),
  subscribe(ref){subscribers.add(ref);return ()=>subscribers.delete(ref);}}};
const store=Object.assign((s=v=>v)=>s(state),{getState:()=>state,getInitialState:()=>state,subscribe:()=>()=>{}});
scene.__r3f={root:store,type:'scene',parent:null,children:[],props:{},object:scene,eventCount:0,handlers:{},isHidden:false};
const fail=e=>{throw e;},root=reconciler.createContainer(store,1,null,false,null,'',fail,fail,fail,null);
const render=node=>act(async()=>reconciler.updateContainer(node&&React.createElement(context.Provider,{value:store},node),root,null,null));
const fighter=combat.createVietCongCombatants(1969,6);
assert.deepEqual([fighter[1].id,fighter[1].stance,fighter[1].headwear,fighter[1].uniformVariant],
  [reference.actor,'standing','boonie',1]);

function probe(actor,body,eye,look,field=false) {
  const g=body.geometry,{position:p,normal:n,surfaceKind:k,garmentPanel:id,color}=g.attributes;
  assert(!g.index,'probe expects the mounted mesh to retain its nonindexed triangle topology');
  const [w,h]=reference.buffer,step=field?1:4,nx=field?256:w/step,ny=field?256:h/step;
  const cam=new T.PerspectiveCamera(reference.fov,w/h,.01,400);
  cam.position.fromArray(eye).applyMatrix4(actor.matrixWorld);
  cam.lookAt(new T.Vector3(...look).applyMatrix4(actor.matrixWorld));cam.updateMatrixWorld();
  const s=[],v=new T.Vector3(),depth=new Float64Array(nx*ny).fill(Infinity);
  const hit=new Int32Array(nx*ny).fill(-1);
  const rice=g.userData.scoutRiceRoll,other=rice?new Uint8Array(nx*ny):null;
  const rollVertex=i=>rice&&i>=rice[0]&&i<rice[0]+rice[1];
  const bary=new Float32Array(nx*ny*2);
  for(let i=0;i<p.count;i++) {
    body.getVertexPosition(i,v).applyMatrix4(body.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
    const invW=-1/v.z;v.applyMatrix4(cam.projectionMatrix);
    s.push([nx/2+v.x*w/(2*step),ny/2-v.y*h/(2*step),v.z,invW]);
  }
  for(let i=0;i<s.length;i+=3){
    const [x,y,z]=s[i],[x1,y1,z1]=s[i+1],[x2,y2,z2]=s[i+2];
    const ax=x1-x,ay=y1-y,bx=x2-x,by=y2-y,area=ax*by-ay*bx;
    if(Math.abs(area)<1e-8||(body.material.side===T.FrontSide&&area>=0))continue;
    const xlo=Math.max(0,Math.ceil(Math.min(x,x1,x2)-.5)),xhi=Math.min(nx-1,Math.floor(Math.max(x,x1,x2)-.5));
    const ylo=Math.max(0,Math.ceil(Math.min(y,y1,y2)-.5)),yhi=Math.min(ny-1,Math.floor(Math.max(y,y1,y2)-.5));
    for(let j=ylo;j<=yhi;j++)for(let q=xlo;q<=xhi;q++){
      const dx=q+.5-x,dy=j+.5-y,u=(dx*by-dy*bx)/area,v=(ax*dy-ay*dx)/area;
      if(u<0||v<0||u+v>1)continue;
      const index=j*nx+q,d=z+u*(z1-z)+v*(z2-z);
      if(other && !rollVertex(i) && d>=-1 && d<=1)other[index]=1;
      if(d>=depth[index]||d< -1||d>1)continue;
      depth[index]=d;hit[index]=i;
      const bu=u*s[i+1][3],bv=v*s[i+2][3],sum=(1-u-v)*s[i][3]+bu+bv;
      bary[index*2]=bu/sum;bary[index*2+1]=bv/sum;
    }
  }
  const pixels={satchel:0,strap:0,sleeve:0,trouser:0,coat:0},shades={sleeve:[],trouser:[],coat:[]},
    warmCool={sleeve:[],trouser:[],coat:[]};
  const satchel=g.userData.localScoutSatchel;
  const sling=g.userData.fieldSuspenderRanges?.length===1?g.userData.fieldSuspenderRanges[0]:null;
  const satchelSides=new Set();
  const strapBins=new Set(),facetBins=new Set();
  const band=field?Array.from({length:ny},()=>[]):null;
  let ricePixels=0,riceOutline=0;
  const handInkPx=[0,0,0,0],handChart=g.attributes.fieldHandArt;
  for(let j=0;j<hit.length;j++){
    const i=hit[j];if(i<0)continue;
    if(rollVertex(i)){ricePixels++;if(!other[j])riceOutline++;}
    // Bind-space predicates select only textiles: do not count bare hands,
    // the prop, or the upper chest as if they were visible satchel fabric.
    const u=bary[j*2],v=bary[j*2+1],a=1-u-v;
    const val=(attr,fn)=>a*attr[fn](i)+u*attr[fn](i+1)+v*attr[fn](i+2);
    const x=val(p,'getX'),y=val(p,'getY'),z=val(p,'getZ'),kind=k.getX(i),panel=id.getX(i);
    if(kind===1&&handChart?.getX(i)>.001){
      const xx=Math.floor(val(handChart,'getX')*64),yy=Math.floor(val(handChart,'getY')*32),
        pixel=(yy*64+xx)*4;
      for(let ch=0;ch<4;ch++)if(fieldHandInk.image.data[pixel+ch]>98)handInkPx[ch]+=step*step;
    }
    if(band && y>.66 && y<1.44 && kind!==7)band[Math.floor(j/nx)].push(j%nx);
    if(satchel&&i>=satchel[0]&&i<satchel[0]+satchel[1]&&kind===4&&(panel===2||panel===3)){
      pixels.satchel+=step*step;
      [val(n,'getX'),val(n,'getY'),val(n,'getZ')].forEach((nv,axis)=>{if(Math.abs(nv)>.67)satchelSides.add(axis+':'+Math.sign(nv));});
    }
    if(sling&&i>=sling[0]&&i<sling[0]+sling[1]&&kind===4&&panel===3&&z<-.035&&y>1.055&&y<1.415){
      pixels.strap+=step*step;strapBins.add(Math.floor((y-1.055)/.060));
    }
    if(kind!==0||panel!==4)continue;
    const zone=y<.91?'trouser':Math.abs(x)>.149&&y>1.07?'sleeve':y>1.04&&y<1.39?'coat':null;
    if(!zone)continue;
    pixels[zone]+=step*step;
    const R=val(color,'getX'),G=val(color,'getY'),B=val(color,'getZ');
    shades[zone].push(R*.2126+G*.7152+B*.0722);
    warmCool[zone].push((R-B)/Math.max(.0001,R+G+B)); // relative warm/cool independent of geometry brightness
    const normal=[val(n,'getX'),val(n,'getY'),val(n,'getZ')];
    normal.forEach((value,axis)=>{if(Math.abs(value)>.67)facetBins.add(axis+':'+Math.sign(value));});
  }
  const range=values=>{
    values.sort((a,b)=>a-b);
    const q=f=>Number((values[Math.floor((values.length-1)*f)]||0).toFixed(4));
    return [q(.1),q(.9)];
  };
  const stats=zones=>Object.fromEntries(Object.entries(zones).map(([key,values])=>[key,range(values)]));
  let fieldSilhouette;
  if(band){
    const contour=band.filter(row=>row.length>0).map(row=>row.at(-1)-row[0]+1).sort((a,b)=>a-b);
    const yAt=y=>ny/2-new T.Vector3(0,y,0).applyMatrix4(actor.matrixWorld).project(cam).y*h/2;
    let upperGapPx=0;
    for(let y=Math.ceil(yAt(1.32));y<=Math.floor(yAt(1.04));y++){
      const row=band[y];if(!row.length)continue;
      for(let x=row[0];x<=row.at(-1);x++) if(hit[y*nx+x]===-1)upperGapPx++;
    }
    fieldSilhouette={midWidthP90:contour[Math.floor(contour.length*.90)],upperGapPx};
  }
  return {visibleApproxPx2:pixels,handInkPx,fieldSilhouette,ricePixels,riceOutline,dyeLumaP10P90:stats(shades),warmCoolP10P90:stats(warmCool),diagonalStrapHeightBands:strapBins.size,
    chartedClothNormalSectors:facetBins.size,visibleSatchelNormalSectors:satchelSides.size};
}

try{
  await render(React.createElement(VietCongCombatants,{enemies:fighter,tankRef:ref(null),enemyPosesRef:ref(new Map()),
    friendlyPosesRef:ref(new Map()),friendliesRef:ref([])}));scene.updateMatrixWorld(true);
  const actor=scene.getObjectByName(reference.actor),body=actor?.getObjectByName(reference.body),draws=[];
  assert(body?.isSkinnedMesh&&actor.visible);actor.traverseVisible(o=>{if(o.isMesh||o.isSprite)draws.push(o);});
  assert.deepEqual(draws.filter(o=>o.name!=='field-hostile-chevron'),[body]);
  assert.equal(body.skeleton.bones.length,11);
  const g=body.geometry,{position:p,skinIndex:bone,skinWeight:weight,surfaceKind:k,garmentPanel:id,fieldFaceUV:face}=g.attributes;
  assert.equal(g.userData.fieldPortrait.mode,'baked-CC0-UV-globes');
  const firearm=[],bag=new T.Box3(),pt=new T.Vector3(),satchel=g.userData.localScoutSatchel;
  let ocular=0,faceVerts=0;
  for(let i=0;i<p.count;i++){
    const kind=k.getX(i),panel=id.getX(i),u=face.getX(i),v=face.getY(i);
    if(u+v>.001){assert.equal(kind,2);assert.equal(panel,0);if(Math.min(u,v)>.9995)ocular++;else faceVerts++;}
    if(kind===7){
      assert.equal(panel,0);assert.deepEqual([bone.getX(i),weight.getX(i)],[1,1]);
      firearm.push(p.getX(i),p.getY(i),p.getZ(i));
    }
    pt.fromBufferAttribute(p,i);
    if(satchel&&i>=satchel[0]&&i<satchel[0]+satchel[1]&&kind===4&&(panel===2||panel===3))bag.expandByPoint(pt);
  }
  // The R21 rigid core has 1,572 vertices. Keep its exact positions; the
  // additional guard and worn metal hardware are appended, never swapped
  // for the originally aligned core or merged into hand anatomy.
  const derivedRifle=sha(new Float32Array(firearm.slice(0,1572*3))),bagDim=bag.getSize(pt).toArray().map(x=>Number(x.toFixed(4)));
  assert(firearm.length>1572*3);
  const sling=g.userData.fieldSuspenderRanges?.length===1?g.userData.fieldSuspenderRanges[0]:null;
  // The ribbon's first and last centre vertices should actually reach the
  // opposite canvas tabs; nearby bounding boxes alone can't establish this.
  const joins=[];
  if(sling&&satchel)for(const tip of [[0,1,7],[sling[1]-10,sling[1]-1,sling[1]-2]]){
    const edgeToBag=[];
    for(const tipOffset of tip){
    const i=sling[0]+tipOffset;
    const end=new T.Vector3().fromBufferAttribute(p,i),tri=new T.Triangle(),nearest=new T.Vector3();
    let gap=Infinity;
    for(let j=satchel[0];j<satchel[0]+satchel[1];j+=3){
      tri.a.fromBufferAttribute(p,j);tri.b.fromBufferAttribute(p,j+1);tri.c.fromBufferAttribute(p,j+2);
      tri.closestPointToPoint(end,nearest);gap=Math.min(gap,end.distanceTo(nearest));
    }
    edgeToBag.push(Number((gap*1000).toFixed(2)));
    }
    joins.push(edgeToBag);
  }
  const front=probe(actor,body,reference.localEye,reference.localLook);
  const rear=probe(actor,body,[.80,1.28,.98],[0,1.04,.02]);
  const fieldViews=[10,20].map(distance=>{
    const radius=distance/actor.getWorldScale(new T.Vector3()).x; // source body in metres; tank in scaled world units
    const field=probe(actor,body,[.35*radius,2.45,-.93675*radius],[0,.87,0],true);
    return {distance,satchel:field.visibleApproxPx2.satchel,...field.fieldSilhouette};
  });
  console.log('1080p tank-height triangulated scout, no occluders:',JSON.stringify(fieldViews));
  // R26 measured only 77/20 bag pixels and an upper/hip silhouette no
  // wider than 39/19 pixels. These use the real mounted actor scale and
  // the original 60-degree lens, not a close-up enlarged to pretend range.
  for(const [i,v] of fieldViews.entries()){
    assert(v.satchel >= [120,30][i],v.distance+'m: bag disappeared into the torso');
    assert(v.midWidthP90 >= [41,20][i],v.distance+'m: sleeve/hip profile regressed to the narrow R26 column');
    assert(v.upperGapPx >= [8,1][i],v.distance+'m: no sky remains between the arm and torso');
  }
  const tris=p.count/3;
  console.log(JSON.stringify({actor:actor.name,triangles:tris,draws:1,rifleXYZSha256:derivedRifle,bagDim,slingTipAcrossWidthMm:joins,front,rear},null,2));
  assert.deepEqual([faceVerts,ocular],[5280,780]);assert(tris<=9100);
  assert.equal(derivedRifle,'60379e408383b73bd734515a43e12acbc117e89dacf808f2dff22f0e72d67802','mounted R21 rigid rifle bind changed');
  assert(body.material.isMeshStandardMaterial&&body.material.roughness>=.88,'scout must have matte cloth');
  const shader={...T.ShaderLib.standard,uniforms:{}};body.material.onBeforeCompile(shader,{});
  assert.match(shader.fragmentShader,/textureGrad\(fieldGearPlate/,'body no longer samples the canvas/garment swatches');
  assert.match(shader.fragmentShader,/roughnessFactor\s*=\s*\.98/,'mounted cloth no longer has a matte treatment');
  assert(satchel?.length===2&&satchel[1]>=60,'no actual satchel range on the drawn fighter');
  assert(bagDim.every((x,i)=>x>[.09,.155,.08][i])&&bag.max.x>.19&&bag.max.z>.13,'needs an independently hanging hip bag rather than a flat patch or rear waist roll');
  assert(front.visibleApproxPx2.satchel>=2200&&rear.visibleApproxPx2.satchel>=11000,'satchel must clear the torso/prop from both views');
  assert(front.visibleSatchelNormalSectors>=3&&rear.visibleSatchelNormalSectors>=3,'satchel depth is not visible on the actor');
  assert(joins.length===2&&joins.every(edge=>edge.length===3&&edge.every(mm=>mm>=0&&mm<=2)),
    'every terminal sewing point must meet the bag within 2mm; gaps (mm): '+JSON.stringify(joins));
  assert(front.diagonalStrapHeightBands>=3&&front.visibleApproxPx2.strap>=210,'front shoulder sling is missing or hidden');
  const oldBright={sleeve:.0642,trouser:.0420,coat:.0679},oldWarm={sleeve:-.1432,trouser:-.2336,coat:-.1159};
  for(const zone of ['sleeve','trouser','coat']){
    assert(front.visibleApproxPx2[zone]>4000,zone+' has no meaningful charted area');
    const [lo,hi]=front.dyeLumaP10P90[zone];
    const [cool,warm]=front.warmCoolP10P90[zone];
    assert(hi>lo*1.3&&hi>oldBright[zone]*1.16,zone+' has no readable authored dye range beyond the R21 blue');
    assert(warm>oldWarm[zone]+.05&&warm-cool>.05,zone+' lost local sun-faded highs against cool shadow dye');
  }
  assert(front.chartedClothNormalSectors>=4&&rear.chartedClothNormalSectors>=4,'fabric does not turn around the body');

  // The field plate targets a different actor than the R21/R26 portrait.
  // Exercise the real component's frame callback, not just a free-standing
  // hat or a metadata flag. Bone positions are measured in the torso frame.
  const fieldCast=combat.createVietCongCombatants(1968,6);
  assert.deepEqual([fieldCast[2].id,fieldCast[2].stance,fieldCast[2].headwear,fieldCast[2].uniformVariant],
    ['vc-1968-2','kneeling','boonie',2]);
  const tank=new T.Group();tank.position.set(-15,0,2.5);
  await render(React.createElement(VietCongCombatants,{enemies:fieldCast,tankRef:ref(tank),enemyPosesRef:ref(new Map()),
    friendlyPosesRef:ref(new Map()),friendliesRef:ref([])}));
  for(const fn of subscribers)fn.current(state,1/60);
  scene.updateMatrixWorld(true);
  const sight=scene.getObjectByName(fieldCast[2].id).getObjectByName(reference.body);
  const bones=sight.skeleton.bones,head=bones[8],mid=bones[1];
  // Retained scout-trigger view: depth-test all posed body/prop triangles
  // before counting a single palm/nail texel. This is coverage, not lighting.
  const handPhoto=probe(head,sight,[.46,-.245,-.29],[0,-.185,-.14]).handInkPx;
  assert(handPhoto.every(n=>n>100));
  console.log('Scout-trigger: exposed shadow, crease, knuckle and nail coverage at 1080p:',handPhoto);
  const seat=head.position.clone().sub(new T.Vector3(0,1.44-.44,.008).sub(new T.Vector3(0,.89-.44,.025)));
  const shoulderLine=bones[10].position.clone().sub(bones[9].position);
  assert.equal(head.parent,mid);
  assert.ok(seat.z<-.13 && seat.x>.09 && seat.y<-.035,'field head still sits upright on the old shirt');
  assert.ok(shoulderLine.z>.17 && Math.abs(shoulderLine.y)>.055,'actual two shoulder joints still align front-on');
  const hat=new T.Box3();let sewnSkin=0;
  const a=sight.geometry.attributes;
  for(let i=0;i<a.position.count;i++){
    if(a.surfaceKind.getX(i)===3)hat.expandByPoint(new T.Vector3().fromBufferAttribute(a.position,i));
    if(a.surfaceKind.getX(i)===1 && a.skinIndex.getY(i)===10 && a.skinWeight.getY(i)>.03)sewnSkin++;
  }
  assert.ok(hat.getSize(new T.Vector3()).x>.50 && sewnSkin>90,'the field silhouette lost its flared woven brim or articulated rolled forearm');
  console.log('Mounted vc-1968-2: head displacement',seat.toArray().map(x=>x.toFixed(3)),
    'shoulder yaw',Math.atan2(shoulderLine.z,shoulderLine.x)*180/Math.PI,'degrees; forearm skin vertices',sewnSkin);
  const loaded=sight.parent,radius=12.7/loaded.getWorldScale(new T.Vector3()).x;
  const ranges=[[-.67,-.74],[-.99,.13],[.24,.97]].map(([a,b])=>{
    const {ricePixels,riceOutline}=probe(loaded,sight,[a*radius,3.2,b*radius],[0,.85,0],true);
    return {ricePixels,riceOutline};
  });
  const feet=[bones[4],bones[7]].map(o=>loaded.worldToLocal(o.getWorldPosition(new T.Vector3())));
  // The cap facets are the last six alternating pairs of triangles. At
  // each end find the actual join against another mounted canvas triangle,
  // not against the roll's own bounding box or the bone that carries it.
  const [start,count]=sight.geometry.userData.scoutRiceRoll;
  const stem=[Infinity,Infinity],tri=new T.Triangle(),q=new T.Vector3(),s=new T.Vector3();
  for(let i=start+count-36;i<start+count;i++){
    const end=Math.floor((i-start-count+36)/3)%2;
    s.fromBufferAttribute(a.position,i);
    for(let j=0;j<a.position.count;j+=3){
      if((j>=start&&j<start+count)||a.surfaceKind.getX(j)!==4)continue;
      tri.a.fromBufferAttribute(a.position,j);tri.b.fromBufferAttribute(a.position,j+1);tri.c.fromBufferAttribute(a.position,j+2);
      tri.closestPointToPoint(s,q);stem[end]=Math.min(stem[end],s.distanceTo(q));
    }
  }
  console.log('12.7m roll, total exposed and outside all other actor meshes:',ranges,'boot spread',(feet[1].x-feet[0].x).toFixed(3));
  console.log('Shoulder / lower tie to mounted canvas, mm:',stem.map(m=>Math.round(m*1000)));
  assert(stem.every(d=>d<.014),'rice sling is not seated on the existing harness');
  assert(ranges[0].riceOutline>=8 && ranges[1].riceOutline>=20 && ranges[2].ricePixels>=40,'back sling must carry silhouette at ordinary distance');
  assert(feet[1].x-feet[0].x>.46,'lead boot does not catch the weight on a distinct outside contact');
}finally{await render(null);}
