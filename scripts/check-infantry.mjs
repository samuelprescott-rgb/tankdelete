import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import ts from 'typescript';
import './check-field-helmet.mjs';

const moduleCache = new Map();
async function moduleUrl(url) {
  if (moduleCache.has(url.href)) return moduleCache.get(url.href);
  const pending = (async () => {
    const source = await readFile(url, 'utf8');
    let { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    });
    for (const match of [...outputText.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
      const resolved = match[2].startsWith('.')
        ? await moduleUrl(new URL(`${match[2]}.ts`, url))
        : import.meta.resolve(match[2]);
      outputText = outputText.replace(match[0], `from '${resolved}'`);
    }
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  })();
  moduleCache.set(url.href, pending);
  return pending;
}
const load = async path => import(await moduleUrl(new URL(path, import.meta.url)));
const { createInfantryGeometry, createTankCrewGeometry, INFANTRY_MATERIAL,
  createInfantryRig, bindInfantryRig, disposeInfantryRig, releaseInfantryRig, updateInfantryRig,
  applyInfantryWeaponPose, infantrySocketPosition } = await load('../src/components/Scene/infantryGeometry.ts');
const metrics = await load('../src/lib/infantryMetrics.ts');
const combat = await load('../src/lib/combat.ts');
const allyPresentation = await load('../src/components/Scene/allyPresentationGeometry.ts');
const guardian = await load('../src/components/Scene/guardianPortrait.ts');
const { createFieldHeadGeometry } = await load('../src/components/Scene/fieldHeadGeometry.ts');
const { createFieldPortrait } = await load('../src/components/Scene/fieldPortraitGeometry.ts');
const { createFieldHelmetGeometry } = await load('../src/components/Scene/fieldHelmetGeometry.ts');
const {createPropContactHand}=await load('../src/components/Scene/fieldHandGeometry.ts');
const { INFANTRY_SURFACE } = await load('../src/components/Scene/infantryClothFinish.ts');
const { createGhostInfantryMaterial } = await load('../src/components/Scene/ghostInfantrySurface.ts');
{
  // Shared skinned draw, not a new sheet in front of the model. Run the real
  // production callbacks against the same shader templates Three compiles.
  const baseKey=INFANTRY_MATERIAL.customProgramCacheKey(), plates=[], fragments=[];
  for(const faction of ['us','vc']) {
    const m=createGhostInfantryMaterial(INFANTRY_MATERIAL,faction);
    const shader={ uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
      vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(shader,null);
    if(faction==='vc'){
      assert.ok(shader.uniforms.fieldPortraitInks.value.isDataTexture);
      assert.match(shader.fragmentShader,/fieldCutPortrait\(flesh,vec3\(face,p.z-.020\)\)/);
      assert.match(shader.fragmentShader,/if\(cornea\)\{diffuseColor.rgb=source;\}/);
      assert.match(shader.fragmentShader,/if\(vGarmentPanel>4.5\)/);
      assert.match(shader.fragmentShader,/fieldLightGroup\(vNormal\)/);
      assert.match(shader.fragmentShader,/directionalLights\[0\]\.color/);
    }else assert.equal(shader.uniforms.fieldPortraitInks,undefined,'Unrelated US field infantry must not acquire crew/scout ink');
    assert.ok(m.isMeshStandardMaterial&&m.vertexColors&&m.depthWrite&&!m.transparent);
    assert.match(shader.vertexShader,/vInfantryLocal = position;/,'Pigment must move with the original bind geometry');
    assert.match(shader.vertexShader,/#include <skinning_vertex>/);
    assert.match(shader.fragmentShader,/lights_fragment_end/);
    assert.match(shader.vertexShader,/vGarmentPanel = garmentPanel/);
    assert.match(shader.fragmentShader,/textureGrad\(fieldGearPlate/);
    assert.ok(shader.uniforms.fieldGearReady && shader.uniforms.fieldGearPlate,'Painted plate must stay bound on both production uniforms');
    assert.equal((shader.fragmentShader.match(/uniform sampler2D ghostInfantryInk;/g)||[]).length,1);
    assert.equal((shader.fragmentShader.match(/textureGrad\(ghostInfantryInk/g)||[]).length,1);
    assert.match(m.customProgramCacheKey(),new RegExp(faction+'$'));
    plates.push(shader.uniforms.ghostInfantryInk.value);fragments.push(shader.fragmentShader);m.dispose();
  }
  assert.equal(plates[0],plates[1],'Both factions share one 4 KiB plate');
  const tex=plates[0], data=tex.image.data;assert.equal(data.length,32*32*4);
  assert.equal(tex.magFilter,THREE.NearestFilter);assert.ok(tex.generateMipmaps);
  for (let c=0;c<4;c++) {
    const values=data.filter((_,i)=>i%4===c);
    assert.ok(Math.min(...values)<110&&Math.max(...values)>155,'A material ink channel is empty');
    assert.ok(values.filter(x=>x===128).length>values.length*.55,'Marks should not blanket the issued dye');
  }
  assert.notEqual(fragments[0],fragments[1]);assert.equal(INFANTRY_MATERIAL.customProgramCacheKey(),baseKey);
}
const { createFieldRadioKit } = await load('../src/components/Scene/fieldRadioKitGeometry.ts');
const { createFieldBackLoadGeometry } = await load('../src/components/Scene/fieldBackLoadGeometry.ts');
const summaries = [];

// Validate the dressed, visible envelope in metres, not just the presence
// of a filename. A buttpack/scale tweak, flat yellow shell or shared gear on
// every role cannot satisfy these probes.
{
  const side=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
  const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,0,-1));
  const envelopes={};
  for(const issue of ['patrol','heavy','scout','dispatch']){
    const g=createFieldBackLoadGeometry('us',0,0,issue), m=new THREE.Mesh(g,side);
    g.computeBoundingBox();
    const depth=(x,y)=>{ray.ray.origin.set(x,y,.6);return ray.intersectObject(m)[0]?.point.z??0;};
    envelopes[issue]=g.boundingBox.getSize(new THREE.Vector3());
    assert.ok(g.groups.length===0 && g.userData.gearPanel===2);
    if(issue==='patrol'){
      assert.ok(g.boundingBox.max.y>1.320 && g.boundingBox.max.y<1.360 && g.boundingBox.min.y<.920 && envelopes[issue].x>.390);
      assert.ok(depth(0,1.230)>.220 && depth(.074,1.08)>.20,'Upper and lower canvas must face the rear camera');
      assert.ok(depth(.010,1.130)>depth(.010,1.100)+.020,'The hood overhang must have a physical lip');
      const ledgeY=x=>Array.from({length:24},(_,i)=>1.079+.005*i).reduce((y,v)=>depth(x,v)>depth(x,y)?v:y);
      assert.ok(ledgeY(.083)-ledgeY(-.060)>.042,'The free edge must sag unevenly under weight, not lie horizontal');
    }
    g.dispose();
  }
  assert.ok(envelopes.heavy.x>envelopes.patrol.x && envelopes.scout.y<envelopes.patrol.y &&
    envelopes.dispatch.z<envelopes.scout.z,'Different carried weight must change real width, height and depth');
  side.dispose();
}

function validateGeometry(geometry, name, budget = 8500) {
  const position = geometry.getAttribute('position');
  assert.ok(position.count > 0 && position.count % 3 === 0, `${name}: complete triangles required`);
  for (const attribute of ['position', 'normal', 'color']) {
    const values = geometry.getAttribute(attribute);
    assert.equal(values.count, position.count, `${name}: unmatched ${attribute}`);
    assert.ok(values.array.every(Number.isFinite), `${name}: nonfinite ${attribute}`);
  }
  const normals = geometry.getAttribute('normal');
  for (let vertex = 0; vertex < normals.count; vertex++) {
    const length = Math.hypot(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex));
    assert.ok(length > 0.99 && length < 1.01, `${name}: invalid lighting normal at ${vertex}`);
  }
  assert.ok(position.count / 3 <= budget, `${name}: ${position.count / 3} exceeds triangle budget ${budget}`);
  assert.ok(geometry.boundingBox && geometry.boundingSphere, `${name}: missing frustum culling bounds`);
  const { min, max } = geometry.boundingBox;
  assert.ok([...min, ...max].every(Number.isFinite), `${name}: invalid culling bounds`);
  summaries.push(`${name}: ${position.count / 3} triangles`);
}

// Execute the actual regular-squad rifle builder, without booting unrelated
// React/audio/scene modules. Its authored frame is also the gameplay frame.
const squadSource = await readFile(new URL('../src/components/Scene/USInfantrySquad.tsx', import.meta.url), 'utf8');
const rifleStart = squadSource.indexOf('type SoldierVectorTuple');
const rifleEnd = squadSource.indexOf('const M16_MATERIAL');
assert.ok(rifleStart > 0 && rifleEnd > rifleStart, 'Actual shared rifle builder must be present');
const rifleJs = ts.transpileModule(squadSource.slice(rifleStart, rifleEnd).replace('export const M16_GEOMETRY', 'const M16_GEOMETRY'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const { rifle, carryHandle } = new Function('THREE', 'mergeGeometries',
  `${rifleJs}; return { rifle: M16_GEOMETRY, carryHandle: rifleCarryHandle() };`)(THREE, mergeGeometries);
validateGeometry(rifle, 'regular-us-m16', 600);
assert.equal(rifle.groups.length, 0, 'The rifle must remain one merged material batch');
assert.ok(Math.abs(rifle.boundingBox.min.z + 0.7655) < 1e-6, 'Flash-hider endpoint must not move');
assert.ok(Math.abs(rifle.boundingBox.max.z - 0.30130157) < 1e-6, 'Butt-plate endpoint must not move');
assert.ok(Math.abs(rifle.boundingBox.max.x - 0.0357) < 1e-6, 'Existing narrow rifle width/frame must remain fixed');
assert.ok(rifle.boundingBox.max.y < 0.145, 'Carry handle must lose the oversized tall box silhouette');
assert.match(squadSource, /position=\{rifle.origin\}/);
assert.match(squadSource, /rifle.localMuzzle\[2\] \* rifle.scaleZ/);

const vertices = rifle.getAttribute('position');
const triangle = new THREE.Triangle(), closest = new THREE.Vector3();
const distanceToRifle = point => {
  let minimum = Infinity;
  for (let vertex = 0; vertex < vertices.count; vertex += 3) {
    triangle.a.fromBufferAttribute(vertices, vertex);
    triangle.b.fromBufferAttribute(vertices, vertex + 1);
    triangle.c.fromBufferAttribute(vertices, vertex + 2);
    triangle.closestPointToPoint(point, closest);
    minimum = Math.min(minimum, closest.distanceTo(point));
  }
  return minimum;
};
assert.ok(Math.abs(distanceToRifle(new THREE.Vector3(0, 0.012, -0.77)) - 0.0045) < 1e-6,
  'Muzzle socket must remain 4.5mm beyond the actual flash-hider end cap');

const handleMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const handleMesh = new THREE.Mesh(carryHandle, handleMaterial);
handleMesh.scale.x = 0.68; handleMesh.updateMatrixWorld(true);
const acrossHandle = new THREE.Raycaster(new THREE.Vector3(-1, 0.09, -0.08), new THREE.Vector3(1, 0, 0));
assert.equal(acrossHandle.intersectObject(handleMesh).length, 0, 'Carry handle opening must be real negative space');
acrossHandle.ray.origin.y = 0.12;
assert.ok(acrossHandle.intersectObject(handleMesh).length >= 2, 'Thin carry-handle bridge must remain closed/visible');
carryHandle.dispose(); handleMaterial.dispose();

const vcSource = await readFile(new URL('../src/components/Scene/VietCongCombatants.tsx', import.meta.url), 'utf8');
const vcBuilder = ts.transpileModule(vcSource.slice(vcSource.indexOf('function colorizeGeometry'),
  vcSource.indexOf('function buildFighterGeometry')).replace('export function buildVietCongRifleParts', 'function buildVietCongRifleParts'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const createVcParts = new Function('THREE', 'RoundedBoxGeometry', 'mergeGeometries',
  `${vcBuilder}; return buildVietCongRifleParts;`)(THREE, RoundedBoxGeometry, mergeGeometries);
// From both sides of the drawn scout prop, see actual open space near the
// index finger and real, shaded metal just below it. A painted ellipse or
// yet another solid box around the hand fails the second or first ray.
for(const longStock of [true,false]) {
  const parts=createVcParts(longStock),guard=parts.at(-7);
  const m=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),surface=new THREE.Mesh(guard,m);
  for(const side of [-1,1]){
    const z=longStock?-.061:-.080,voidY=longStock?-.060:-.074,railY=longStock?-.084:-.112;
    const hit=y=>new THREE.Raycaster(new THREE.Vector3(side*.14,y,z),new THREE.Vector3(-side,0,0),0,.28).intersectObject(surface).length;
    assert.equal(hit(voidY),0);assert.ok(hit(railY)>0);
  }
  m.dispose();parts.forEach(g=>g.dispose());
}

function checkPropFit(body, prop, bind, kneeling, name) {
  const geometry = prop.getAttribute('position'), skin = body.getAttribute('surfaceKind');
  const pad = new THREE.Vector3(...bind.pad), muzzle = new THREE.Vector3(...bind.muzzle);
  if(body.userData.fieldSleeveBinds && !kneeling && ['service','wood-rifle','wood-carbine'].includes(name)) {
    // Weld the actual vertices by position. Inspect each connected skin
    // volume, not a claimed finger count or a list of sculpt landmarks.
    const pos=body.attributes.position, key=(p,i)=>p.getX(i)+','+p.getY(i)+','+p.getZ(i);
    const bodySkin=new Set();
    for(let i=0;i<pos.count;i++)if(body.attributes.surfaceKind.getX(i)===1)bodySkin.add(key(pos,i));
    for(const [side,{wrist}] of body.userData.fieldSleeveBinds.entries()){
      const h=createPropContactHand(wrist,side?bind.firing:bind.support,!side,'#be8965',name!=='service');
      const p=h.attributes.position,edge=new Map(),points=new Map(),edges=new Map();
      for(let i=0;i<p.count;i+=3) {
        const ids=[i,i+1,i+2].map(j=>{
          const s=key(p,j);assert.ok(bodySkin.has(s),'Hand sculpt vertex must be on the mounted soldier');
          if(!edge.has(s)){edge.set(s,new Set());points.set(s,new THREE.Vector3().fromBufferAttribute(p,j));}
          return s;
        });
        for(let k=0;k<3;k++){
          const a=ids[k],b=ids[(k+1)%3];edge.get(a).add(b);edge.get(b).add(a);
          const e=[a,b].sort().join('|');edges.set(e,(edges.get(e)??0)+1);
        }
      }
      const todo=new Set(edge.keys()),pieces=[];
      while(todo.size){
        const q=[todo.values().next().value],seen=[];todo.delete(q[0]);
        for(let i=0;i<q.length;i++){seen.push(q[i]);for(const n of edge.get(q[i]))if(todo.delete(n))q.push(n);}
        pieces.push(seen);
      }
      assert.equal(pieces.length,6,'Both hands need a palm, a distinct thumb and four separate fingers');
      pieces.sort((a,b)=>b.length-a.length);
      const palmSet=new Set(pieces[0]),surfaces=[];
      for(let i=0;i<p.count;i+=3)if(palmSet.has(key(p,i)))for(let j=i;j<i+3;j++)surfaces.push(...points.get(key(p,j)).toArray());
      const palm=new THREE.BufferGeometry();palm.setAttribute('position',new THREE.Float32BufferAttribute(surfaces,3));palm.computeVertexNormals();
      const palmMat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),palmMesh=new THREE.Mesh(palm,palmMat);
      const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(.76,.314,.58).normalize());
      const box=new THREE.Box3().setFromPoints([...palmSet].map(k=>points.get(k)));
      assert.ok(Math.max(...box.getSize(new THREE.Vector3()).toArray())>.075,'Palm should span more than 75mm');
      for(const digit of pieces.slice(1)){
        const fingerSet=new Set(digit),roots=new Set();
        for(const [e,count] of edges)if(count===1) {const [a,b]=e.split('|');if(fingerSet.has(a)){roots.add(a);roots.add(b);}}
        assert.equal(roots.size,name==='service'?5:6,'Only the buried root of a digit may be uncapped');
        const center=[...roots].reduce((v,k)=>v.add(points.get(k)),new THREE.Vector3()).multiplyScalar(1/roots.size);
        ray.ray.origin.copy(center);
        assert.equal(ray.intersectObject(palmMesh).length%2,1,'Finger base must actually enter the palm, not float beside it: '+side+'/'+center.toArray());
        const reach=Math.max(...digit.map(k=>center.distanceTo(points.get(k))));
        assert.ok(reach>.034 && reach<.092,'Finger must have a bent solid span');
      }
      palm.dispose();palmMat.dispose();h.dispose();
    }
  }
  {
    prop.computeBoundingBox();
    assert.ok(prop.boundingBox.max.z < -.058, `${name}: stock passes into the torso`);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const ray = new THREE.Raycaster(pad.clone().add(new THREE.Vector3(0, 0, -.06)), new THREE.Vector3(0,0,1), 0, .095);
    const hit = ray.intersectObject(new THREE.Mesh(body, mat))[0];
    mat.dispose();
    assert.ok(hit && Math.abs(hit.point.z - pad.z) < .026, `${name}: rear pad must seat on the jacket (observed ${hit?.point.z})`);
  }
  const rig = createInfantryRig(kneeling), actor = new THREE.Group(), renderedProp = new THREE.Group();
  const mesh = new THREE.SkinnedMesh(body, INFANTRY_MATERIAL);
  actor.add(mesh, renderedProp);
  bindInfantryRig(mesh, rig);
  const handVertices = [bind.support, bind.firing].map(contact => {
    const point = new THREE.Vector3(...contact), indices = [];
    const pos = body.getAttribute('position'), scratch = new THREE.Vector3();
    for (let i = 0; i < pos.count; ++i) {
      if (skin.getX(i) === 1 && scratch.fromBufferAttribute(pos, i).distanceTo(point) < .082)
        indices.push(i);
    }
    assert.ok(indices.length > 35, `${name}: both grips require real hand geometry`);
    return indices;
  });
  // Sample an entire real rig over travel; compare vertices in the *moving
  // prop's local space*. A chest turn, actor translation or idle clock cannot
  // impersonate an independently articulating sleeve.
  const binds=body.userData.fieldSleeveBinds;
  if (binds) {
    const pos=body.getAttribute('position'), ix=body.getAttribute('skinIndex'), wt=body.getAttribute('skinWeight');
    assert.equal(rig.skeleton.bones.length,11); assert.equal(binds.length,2);
    const shirtCount=body.userData.jacketFitRanges.at(-1)[0];
    const probes=binds.map(({wrist,elbow},side)=>{
      const w=new THREE.Vector3(...wrist),e=new THREE.Vector3(...elbow),v=new THREE.Vector3();
      const wristRing=[],sewn=[],hands=handVertices[side].filter(i=>i>=shirtCount);
      let closest=-1, distance=Infinity;
      for(let i=0;i<shirtCount;i++){
        v.fromBufferAttribute(pos,i);
        if(v.distanceTo(w)<.04)wristRing.push(i);
        if(ix.getY(i)===9+side && wt.getY(i)>=.94 && v.distanceToSquared(e)<distance){
          distance=v.distanceToSquared(e);closest=i;
        }
      }
      for (const [start,count] of body.userData.jacketFitRanges.slice(0,-1))
        for(let i=start;i<start+count;i+=11)sewn.push(i);
      assert.ok(closest>=0 && wristRing.length>20 && hands.length>30);
      return {elbow:closest,locked:[...hands,...wristRing,...sewn]};
    });
    const at=[[],[]], inv=new THREE.Matrix4(), scratch=new THREE.Vector3();
    const relative=(i)=>mesh.getVertexPosition(i,scratch).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
    let maxDrift=0;
    for(let frame=0;frame<=120;frame++){
      const p=frame/120,walked=p*p*(3-2*p);
      actor.position.set(2,.03,-4-2*walked); actor.scale.setScalar(.72);
      updateInfantryRig(rig,{time:frame/60,delta:1/60, moving:frame<120,progress:p,phase:.4,recoil:0,
        lookYaw:.2,holdingRifle:true,fieldStance:true,worldX:2,worldZ:actor.position.z,worldYaw:0,worldScale:.72,
        moveFromX:2,moveFromZ:-4,moveToX:2,moveToZ:-6});
      actor.updateMatrixWorld(true);rig.skeleton.update();applyInfantryWeaponPose(renderedProp,rig);
      renderedProp.updateMatrixWorld(true);inv.copy(renderedProp.matrixWorld).invert();
      const phase=rig.sleeveBeat<-.7?0:rig.sleeveBeat>.7?1:-1;
      if(phase>=0 && !at[phase].length){
        for(const probe of probes){
          at[phase].push(relative(probe.elbow).clone());
          for(const i of probe.locked) maxDrift=Math.max(maxDrift,relative(i).distanceTo(new THREE.Vector3().fromBufferAttribute(pos,i)));
        }
      }
    }
    assert.ok(at.every(p=>p.length===2),name+': opposite footfalls not observed');
    const travels=at[0].map((v,i)=>v.distanceTo(at[1][i])*.72);
    assert.ok(travels.every(n=>n>.030 && n<.12),name+': implausible elbow excursion '+travels);
    assert.ok(maxDrift<1e-6,name+': shoulder seam, wrist or true hand slipped '+maxDrift);
    console.log(`field stride ${name} ${kneeling?'low':'standing'}: two world elbow excursions ${travels.map(n=>(n*100).toFixed(1)).join('/')} cm; endpoint/grip error ${maxDrift.toExponential(2)} m`);
  } else assert.equal(rig.skeleton.bones.length,9,name+': non-field allies must retain their original rig');
  const projected = new THREE.Vector3(), tri = new THREE.Triangle(), near = new THREE.Vector3();
  for (const [yaw, pitch, recoil, moving] of [[0,0,0,false],[.6,.22,1,false],[-.8,-.19,.3,true]]) {
    actor.position.set(2, .03, -4); actor.scale.set(.72,.69,.72); actor.rotation.y = yaw;
    updateInfantryRig(rig, { time: 1.13, delta: .08, moving, progress: .30, phase: .4, aimPitch: pitch,
      recoil, worldX: 2, worldZ: -4, worldYaw: yaw, worldScale: .72, holdingRifle: true, fieldStance: true });
    applyInfantryWeaponPose(renderedProp, rig);
    actor.updateMatrixWorld(true); rig.skeleton.update();
    const muzzleWorld = muzzle.clone().applyMatrix4(renderedProp.matrixWorld);
    const socketWorld = infantrySocketPosition(new THREE.Vector3(), muzzle, rig).applyMatrix4(actor.matrixWorld);
    assert.ok(muzzleWorld.distanceTo(socketWorld) < 1e-8, `${name}: muzzle drifted after pose`);
    for (const indices of handVertices) {
      let minimum = Infinity;
      const backToProp = renderedProp.matrixWorld.clone().invert();
      for (const index of indices) {
        mesh.getVertexPosition(index, projected).applyMatrix4(mesh.matrixWorld).applyMatrix4(backToProp);
        for (let v = 0; v < geometry.count; v += 3) {
          tri.a.fromBufferAttribute(geometry, v);
          tri.b.fromBufferAttribute(geometry, v + 1);
          tri.c.fromBufferAttribute(geometry, v + 2);
          tri.closestPointToPoint(projected, near);
          minimum = Math.min(minimum, projected.distanceTo(near));
        }
      }
      assert.ok(minimum < .012, `${name}: animated hand separates from its prop by ${minimum.toFixed(4)}m`);
    }
  }
  disposeInfantryRig(rig);
}
for (const kneeling of [false, true]) for (const [faction, variant] of [['us',0],['vc',0],['vc',1],['vc',2]]) {
  const style = metrics.fieldRifleStyle(faction, variant);
  const bind = metrics.infantryRifleBind(style, kneeling);
  const body = createInfantryGeometry({ faction, variant, kneeling, fieldUniform: true });
  const parts = faction === 'us' ? [rifle.clone()] : createVcParts(variant === 0);
  for (const part of parts) {
    part.deleteAttribute('uv');
    part.scale(faction === 'us' ? 1 : .68, 1, bind.scaleZ).translate(...bind.origin);
  }
  const prop = mergeGeometries(parts, false);
  checkPropFit(body, prop, bind, kneeling, style);
  body.dispose(); prop.dispose(); parts.forEach(part => part.dispose());
}
rifle.dispose();

for (const faction of ['us', 'vc']) {
  for (const kneeling of [false, true]) {
    for (const headwear of faction === 'us' ? ['pith'] : ['pith', 'boonie']) {
      const options = { faction, kneeling, headwear, variant: 0, fieldUniform: true };
      const body = createInfantryGeometry(options);
      const again = createInfantryGeometry(options);
      const name = `${faction}-${kneeling ? 'kneeling' : 'standing'}-${headwear}`;
      validateGeometry(body, name);
      assert.deepEqual(body.getAttribute('position').array, again.getAttribute('position').array, `${name}: geometry must not change on restart`);
      assert.deepEqual(body.getAttribute('color').array, again.getAttribute('color').array, `${name}: wear colors must be deterministic`);
      assert.ok(body.boundingBox.min.y >= -0.001 && body.boundingBox.min.y < 0.04, `${name}: feet must touch the ground`);
      assert.ok(body.boundingBox.max.y > (kneeling ? 1.2 : 1.7) && body.boundingBox.max.y < (kneeling ? 1.4 : 1.85), `${name}: adult height/proportions out of bounds`);
      const shoulderY = 1.34 - (kneeling ? metrics.INFANTRY_KNEEL_OFFSET : 0);
      // Probe the outside of the upper chest, inside the webbing/pockets.
      // Using two-sided hits verifies winding without depending on row counts.
      const torsoMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const torso = new THREE.Mesh(body, torsoMaterial);
      for (const x of [-.04, .044]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, shoulderY, -.20), new THREE.Vector3(0, 0, 1), 0, .15);
        const hit = ray.intersectObject(torso)[0];
        assert.ok(hit?.face && hit.point.z < -.07 && hit.face.normal.z < -.30,
          `${name}: missing or inward-facing front torso at X = ${x}`);
      }
      torsoMaterial.dispose();
      body.dispose();
      again.dispose();
    }
  }
}
// Measure the actual merged kit, on the rear that the chase camera sees.
// Include all three swatches so stronger cues can never come from skin tone.
for (const faction of ['us', 'vc']) for (let variant = 0; variant < 3; variant++) {
  const options = { faction, variant, kneeling: false, headwear: 'pith' };
  const before = createInfantryGeometry(options), field = createInfantryGeometry({ ...options, fieldUniform: true });
  const pos = field.getAttribute('position'), surface = field.getAttribute('surfaceKind');
  const panel=field.getAttribute('garmentPanel');
  const charts=new Set(panel.array);
  for(const id of faction==='us'?[0,1,2,3,4]:[0,2,3,4]) assert.ok(charts.has(id),'Missing material chart '+id+' on '+faction);
  if(faction==='vc')assert.ok(!charts.has(1),'Local woven hats must not acquire US helmet camo');
  for(let i=0;i<pos.count;i++)if([1,2,5,6,7].includes(surface.getX(i)))assert.equal(panel.getX(i),0,'No textile on skin, leather or hard fittings');
  const paint = field.getAttribute('color'), original = before.getAttribute('color');
  assert.ok(pos.count <= before.getAttribute('position').count, 'Field portrait stays inside the original vertex budget');
  assert.equal(field.groups.length, 0, 'Field paint must stay in the existing single draw');
  let cloth = 0, dryKit = 0, clothSamples = 0, kitSamples = 0, skinSamples = 0, loadSamples = 0;
  const oldSkin = [], originalPosition=before.getAttribute('position');
  const pointKey=(p,i)=>p.getX(i)+','+p.getY(i)+','+p.getZ(i);
  const originalKeys=new Set(), shirtKeys=new Set(), bareKeys=new Map();
  for (let i=0; i<original.count; i++) if (before.getAttribute('surfaceKind').getX(i) === INFANTRY_SURFACE.skin) {
    oldSkin.push(i);originalKeys.add(pointKey(originalPosition,i));
  }
  const lightness = i => .2126 * paint.getX(i) + .7152 * paint.getY(i) + .0722 * paint.getZ(i);
  for (let i = 0; i < pos.count; i++) {
    const kind = surface.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (kind === INFANTRY_SURFACE.skin) {
      const key=pointKey(pos,i);
      if (originalKeys.has(key)) {
        for (let c = 0; c < 3; c++) assert.equal(paint.array[i * 3 + c], original.array[oldSkin[skinSamples] * 3 + c], 'Existing hand and neck pigment must stay unchanged');
        skinSamples++;
      } else {
        assert.ok(faction==='us'||(faction==='vc'&&variant===2),'Only rolled sleeves expose additional skin');
        assert.ok(paint.getX(i)>paint.getY(i)*1.45 && paint.getY(i)>paint.getZ(i)*1.3,'Forearm must use skin pigment, not fatigues');
        bareKeys.set(key,i);
      }
    }
    if (kind===INFANTRY_SURFACE.cloth) shirtKeys.add(pointKey(pos,i));
    if (z < .04) continue;
    if (kind === INFANTRY_SURFACE.canvas && y > .90 && y < 1.13 && z > .190) loadSamples++;
    if (kind === INFANTRY_SURFACE.cloth && y > 1.16 && y < 1.37) { cloth += lightness(i); clothSamples++; }
    // The upper back is now covered by a considerably darker rucksack.
    // Measure the same dry shoulder webbing as before, not the new duck.
    const mark = faction === 'us' ? field.userData.fieldSuspenderRanges.some(([s,n])=>i>=s&&i<s+n) && kind === INFANTRY_SURFACE.canvas && y > 1.13 && y < 1.42
      : kind === INFANTRY_SURFACE.headwear && y > 1.64;
    if (mark) { dryKit += lightness(i); kitSamples++; }
  }
  assert.ok(skinSamples === oldSkin.length && skinSamples > 500 && kitSamples > 40 && clothSamples > 40);
  if (faction==='us'||variant===2) {
    const rimKeys=new Set([...bareKeys.keys()].filter(k=>shirtKeys.has(k)));
    const rolledSides=faction==='us'?[-1,1]:[1];
    assert.equal(rimKeys.size,14*rolledSides.length,'Each rolled cuff needs a closed fourteen-sided underturn');
    // Read the outer cuff and the inner join from the *actual triangles*.
    // Repainting the once-long sleeve cannot produce a projecting cloth roll.
    for(const sign of rolledSides) {
      const inner=[...rimKeys].map(k=>bareKeys.get(k)).filter(i=>pos.getX(i)*sign>0);
      assert.equal(inner.length,14);
      const center=new THREE.Vector3(),v=new THREE.Vector3();
      for(const i of inner) center.add(v.fromBufferAttribute(pos,i));
      center.multiplyScalar(1/inner.length);
      const radial=indices=>indices.reduce((s,i)=>s+v.fromBufferAttribute(pos,i).distanceTo(center),0)/indices.length;
      const outer=new Map();
      for(let i=0;i<pos.count;i+=3) {
        if(surface.getX(i)!==INFANTRY_SURFACE.cloth || pos.getX(i)*sign<=0)continue;
        const ids=[i,i+1,i+2];
        if(ids.some(j=>rimKeys.has(pointKey(pos,j))))
          for(const j of ids) if(!rimKeys.has(pointKey(pos,j)))outer.set(pointKey(pos,j),j);
      }
      assert.equal(outer.size,14);
      const rise=radial([...outer.values()])-radial(inner);
      assert.ok(rise>.019 && rise<.056,'Cuff must turn under onto a distinctly narrower forearm: '+rise);
    }
  }
  assert.ok(loadSamples > 50, 'The visible rear load must meet the belt, not end at naked suspenders');
  const ratio = (dryKit / kitSamples) / (cloth / clothSamples);
  assert.ok(ratio > (faction === 'us' ? 2 : 3), `${faction}-${variant}: unlit rear kit/cloth value ratio ${ratio.toFixed(2)}`);
  field.dispose(); before.dispose();
}
for (const faction of ['us', 'vc']) {
  for (let variant = 0; variant < 3; variant++) {
    const head = createFieldHeadGeometry(1.568, '#ad7c5c', variant, faction);
    head.computeBoundingBox();
    head.computeBoundingSphere();
    validateGeometry(head, `field-head-${faction}-${variant}`, 2250);
    const size = head.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x >= .18 && size.x <= .22 && size.y >= .24 && size.y <= .26, 'Head fits the established soldier scale');
    assert.deepEqual(Object.keys(head.attributes).sort(), ['color', 'normal', 'position'],
      'Painted head must not require a texture or a new vertex layout');
    head.dispose();
  }
}
for (const crewman of [false, true]) {
  const helmet = createFieldHelmetGeometry({ headY: 1.568, variant: 0, crewman });
  helmet.computeBoundingBox();
  helmet.computeBoundingSphere();
  validateGeometry(helmet, crewman ? 'm1-crew-cover' : 'm1-field-cover', 1200);
  helmet.dispose();
}
// A globe that draws over the lids (or an empty socket hidden in shade)
// can pass mesh/budget checks. Test which surface a portrait camera sees.
for (const faction of ['us','vc']) for (let variant=0; variant<3; variant++) {
  const face = createFieldPortrait(0,'#bf8f6d',variant,faction);
  const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide}), mesh = new THREE.Mesh(face, material);
  const ray = new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,0,1));
  const hit = (x,y) => {ray.ray.origin.set(x,y,-.4); return ray.intersectObject(mesh)[0];};
  const skinTriangles = 1760;
  assert.equal(face.attributes.position.count/3,2020,'Regular actors use the baked portrait, not fallback skin');
  for (const sign of [-1,1]) {
    let irisExposed = 0, upperLid = 0, lowerLid = 0;
    const pupilY=.0116, eyeX=.012+sign*.0293;
    for (let j=-2; j<=2; j++) for (let i=-3; i<=3; i++) {
      const x=eyeX+i*.001;
      if (hit(x,pupilY+j*.00075)?.faceIndex >= skinTriangles) irisExposed++;
      if (hit(x,pupilY+j*.00075+.0105)?.faceIndex < skinTriangles) upperLid++;
      if (hit(x,pupilY+j*.00075-.0105)?.faceIndex < skinTriangles) lowerLid++;
    }
    assert.ok(irisExposed>=30 && upperLid>30 && lowerLid>30, `${faction} ${variant}: eye aperture should be bounded by real lids (iris/upper/lower ${irisExposed}/${upperLid}/${lowerLid})`);
    let openingMm=0;
    for(let y=.003;y<.022;y+=.00025) if(hit(eyeX,y)?.faceIndex>=skinTriangles) openingMm+=.25;
    assert.ok(openingMm>=7 && openingMm<=9.75,`${faction} ${variant}: alert open eye must have 7–9.75 mm central clearance, got ${openingMm}`);
    const crest=hit(.012+sign*.052,-.004), returnPlane=hit(.012+sign*.055,-.034), temple=hit(.012+sign*.063,.031);
    assert.ok(crest.normal.y-returnPlane.normal.y>.29 && Math.abs(temple.normal.x)>.89
      && returnPlane.point.z-crest.point.z>.011,'A raised malar plane must turn down into the cheek and outward into the temple');
    // Cast actual 1080p pixel-center rays against front faces, from a frontal
    // camera and the production portrait's 3/4 camera in head bind space.
    // Count visible pupil, iris and sclera separately: a white-only slit fails.
    for(const cameraX of [0,.39,.35]) {
      const camera=new THREE.PerspectiveCamera(60,16/9,.01,50);
      const kit=cameraX===.35;
      // Actual helmet receipt: local eye [.35,1.35,-.64], local target
      // [0,1.16,-.025], minus the kneeling 1.128 m head bind height.
      camera.position.set(cameraX,kit?.222:.21-.128,kit?-.64:-.73+.008);
      camera.lookAt(0,kit?.032:.10-.128,kit?-.025:-.03+.008); camera.updateMatrixWorld();
      const center=new THREE.Vector3(eyeX,pupilY,-.107).project(camera);
      const cx=Math.round(960+960*center.x),cy=Math.round(540-540*center.y);
      const pixel=new THREE.Vector2(),screenRay=new THREE.Raycaster(),cols=new Map();
      const first=skinTriangles+(sign>0?130:0),visible=[0,0,0];
      material.side=THREE.FrontSide;
      for(let dy=-9;dy<=9;dy++) for(let dx=-22;dx<=22;dx++) {
        screenRay.setFromCamera(pixel.set((cx+dx+.5)/960-1,1-(cy+dy+.5)/540),camera);
        const triangle=(screenRay.intersectObject(mesh)[0]?.faceIndex??-1)-first;
        if(triangle<0||triangle>=130) continue;
        if(triangle<10) visible[0]++;
        else if(triangle<70) visible[1]++;
        else if(triangle>=90) visible[2]++;
        cols.set(dx,(cols.get(dx)??0)+1);
      }
      material.side=THREE.DoubleSide;
      const height=Math.max(0,...cols.values());
      assert.ok(visible[0]>=(kit?(sign<0?3:10):6) && visible[1]>=22 && visible[2]>=7
        && height>=6 && height<=15 && cols.size>=height*(cameraX?.99:1.6),
        `${faction}/${variant} eye ${sign} at camera x=${cameraX}: visible pupil/iris/sclera ${visible} in ${cols.size}x${height}px`);
    }
  }
  const redOverGreen = (x,y) => {
    const tri = hit(x,y).face, p = face.attributes.color;
    return (p.getX(tri.a)+p.getX(tri.b)+p.getX(tri.c))/(p.getY(tri.a)+p.getY(tri.b)+p.getY(tri.c));
  };
  const lip = Math.max(...[-.060,-.055,-.052,-.049].map(y=>redOverGreen(.018,y)));
  assert.ok(lip > redOverGreen(.060,-.023)*1.18,'Lip pigment must read separately from the cheek under the same lighting');
  // Inspect the visible surface (not an arbitrary vertex behind the lid).
  // The broad alar plane cannot carry the old near-black nasal stain, and
  // the eye needs two neutral, graded corners without a white painted disc.
  const sampleDye=(x,y)=>{
    const h=hit(x+.012,y-.128),p=face.attributes.color,c=new THREE.Color(0,0,0);
    for(const [j,k] of ['a','b','c'].entries()){
      const i=h.face[k],w=h.barycoord.getComponent(j);
      c.r+=w*p.getX(i);c.g+=w*p.getY(i);c.b+=w*p.getZ(i);
    }
    return c;
  };
  const value=c=>.213*c.r+.715*c.g+.072*c.b;
  const wing=sampleDye(.011,.096),bulb=sampleDye(0,.103),sclera=sampleDye(.039,.140),brow=sampleDye(.034,.160);
  assert.ok(value(wing)>value(bulb)*.47&&value(wing)<value(bulb)*.83,'Nasal wing must turn in a middle value; only the actual nostril is dark');
  assert.ok(sclera.r/sclera.b<1.42&&value(sclera)>value(brow)*1.45&&value(sclera)<.62,'Retain a neutral, shaded sclera against the colored eyelid');
  face.dispose(); material.dispose();
}
const styledBody = createInfantryGeometry({ faction: 'us', kneeling: false });
assert.equal(styledBody.groups.length, 0, 'Face, cover and uniform must share a draw');
const surface = styledBody.getAttribute('surfaceKind');
const bodyBones = styledBody.getAttribute('skinIndex');
let authoredSkin = 0, authoredHeadwear = 0, canvas = 0, leather = 0;
for (let i = 0; i < surface.count; i++) {
  const kind = surface.getX(i);
  assert.ok(Number.isInteger(kind) && kind >= 0 && kind <= 7, 'Material selection is stable per surface');
  if (kind === INFANTRY_SURFACE.face || kind === INFANTRY_SURFACE.headwear) {
    assert.equal(bodyBones.getX(i), 8, 'All authored head parts must move with the existing pose');
    if (kind === INFANTRY_SURFACE.face) authoredSkin++;
    else authoredHeadwear++;
  }
  if (kind === INFANTRY_SURFACE.canvas) canvas++;
  if (kind === INFANTRY_SURFACE.leather) {
    assert.ok([4, 7].includes(bodyBones.getX(i)), 'Boot leather follows planted foot bones');
    leather++;
  }
}
assert.ok(authoredSkin > 6000 && authoredHeadwear > 3000, 'Skin and headwear receive distinct material treatment');
assert.ok(canvas > 100 && leather > 100, 'Canvas and boot leather are tagged on actual body geometry');

// Rebuild connectivity across the final non-indexed cloth. Both cuff
// bands must connect to the shirt; coincident but detached arm tubes fail.
const stylePos = styledBody.getAttribute('position');
const shirtNodes = new Map();
const links = [];
const point = new THREE.Vector3();
const nodeAt = index => {
  const coords = point.fromBufferAttribute(stylePos, index).toArray();
  const key = coords.map(value => value.toFixed(5)).join('/');
  if (!shirtNodes.has(key)) {
    const id = links.length;
    shirtNodes.set(key, { id, coords });
    links.push(id);
  }
  return shirtNodes.get(key).id;
};
const representative = id => {
  while (links[id] !== id) { links[id] = links[links[id]]; id = links[id]; }
  return id;
};
for (let index = 0; index < stylePos.count; index += 3) {
  if (![index, index + 1, index + 2].every(i =>
    surface.getX(i) === INFANTRY_SURFACE.cloth && bodyBones.getX(i) === 1)) continue;
  const first = representative(nodeAt(index));
  links[representative(nodeAt(index + 1))] = first;
  links[representative(nodeAt(index + 2))] = first;
}
const nearestCloth = target => {
  let best = Infinity, id = -1;
  const reference = new THREE.Vector3(...target);
  for (const entry of shirtNodes.values()) {
    const distance = point.set(...entry.coords).distanceToSquared(reference);
    if (distance < best) { best = distance; id = entry.id; }
  }
  assert.ok(id >= 0 && best < .005, 'Expected a nearby jacket or cuff surface');
  return representative(id);
};
const rifleFit = metrics.infantryRifleBind('service', false);
const shirt = nearestCloth([0, 1.24, .123]);
assert.equal(nearestCloth([rifleFit.support[0] - .046, rifleFit.support[1] - .054, rifleFit.support[2] + .016]), shirt,
  'Support-side shirt cuff must be part of the torso topology');
assert.equal(nearestCloth([rifleFit.firing[0] + .038, rifleFit.firing[1] - .035, rifleFit.firing[2] + .027]), shirt,
  'Firing-side shirt cuff must be part of the torso topology');
styledBody.dispose();
const radioParts = createFieldRadioKit(0);
const radioKit = mergeGeometries(radioParts, false);
radioKit.computeBoundingBox(); radioKit.computeBoundingSphere();
validateGeometry(radioKit, 'layered-radio-kit', 220);
assert.ok(radioKit.boundingBox.min.z < .115 && radioKit.boundingBox.max.z < .34, 'Kit seats against the back without inflating the profile');
radioParts.forEach(part => part.dispose()); radioKit.dispose();
const crew = createTankCrewGeometry();
validateGeometry(crew, 'tank-crew', 7000);
assert.ok(crew.boundingBox.max.y < 0.75 && crew.boundingBox.min.y > -0.15, 'Crew must be bounded to the cupola, without hidden full-length legs');
crew.dispose();
assert.equal(INFANTRY_MATERIAL.flatShading, false, 'Smooth cloth and face normals must be retained');
assert.equal(INFANTRY_MATERIAL.emissiveIntensity, 1);
assert.equal(INFANTRY_MATERIAL.emissive.getHex(), 0, 'Infantry must use scene lighting, not a fake glow');

for (const role of ['heavy-gunner', 'rifle-scout', 'mounted-cavalry']) {
  const body = allyPresentation.createAllyBodyGeometry(role);
  validateGeometry(body, `boss-ally-${role}`, 10000);
  const headTop=body.boundingBox.max.y;
  assert.ok(headTop>1.675&&headTop<(role==='mounted-cavalry'?1.79:1.735),`${role}: headwear must seat at actual human scale`);
  assert.ok(body.boundingBox.min.y >= -0.001);
  const indices = body.getAttribute('skinIndex');
  assert.ok(indices.array.every(index => index <= 8), 'All costume/head attachments must use the shared nine-bone rig');
  const face=guardian.createGuardianPortrait(role),closeMat=new THREE.MeshBasicMaterial(),human=new THREE.Mesh(face,closeMat),dressed=new THREE.Mesh(body,closeMat);
  assert.equal(face.userData.authoredPortraitTriangles,2020,'Final-wave figures use the actual two-orbit CC0 portrait plus fitted ocular globes');
  const facialRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,0,1));
  let skinWitness=0,eyeWitness=0;
  for(const sign of [-1,1])for(let row=-1;row<=1;row++)for(let col=-1;col<=1;col++)for(const delta of [0,.011,-.011]){
    facialRay.ray.origin.set(.012+sign*.0293+col*.0008,1.5796+row*.00055+delta,-.70);
    const exposed=facialRay.intersectObject(human)[0],worn=facialRay.intersectObject(dressed)[0];
    assert(exposed&&worn&&Math.abs(exposed.point.z-worn.point.z)<.0001,role+': hair, spectacles or headwear obscure an actual eye/lid');
    if(delta===0){assert(exposed.faceIndex>=1760,'Visible eye must be the curved globe, not a pigmented patch');eyeWitness++;}
    else{assert(exposed.faceIndex<1760,'Actual upper and lower skin rims enclose each opening');skinWitness++;}
  }
  if(role==='rifle-scout'){
    const band=guardian.createGuardianBand(face),bp=band.attributes.position,cross=guardian.guardianSurface(face);
    for(let i=0;i<bp.count;i++){
      const x=bp.getX(i),z=bp.getZ(i),y=bp.getY(i),dx=x-.012,dz=z+.024,d=Math.hypot(dx,dz);
      const at=cross(+y.toFixed(3),dx,dz),gap=d-Math.hypot(at[0]-.012,at[2]+.024);
      assert(gap>.001&&gap<.0035&&d>.056,role+': fitted cloth neither clips scalp nor floats away from it');
    }
    band.dispose();
  }
  if(role==='mounted-cavalry'){
    const hair=guardian.createGuardianMoustache(face),fn=hair.attributes.normal;
    const outward=Array.from({length:fn.count},(_,i)=>fn.getZ(i)).filter(z=>z<-.20).length;
    assert(outward>fn.count*.86,'Mustache has real outward-facing volume across the modeled upper lip');
    const hat=body.boundingBox.max.y;assert(hat>1.737&&hat<1.785,'Campaign crown seats over the upper forehead; no floating hat');
    hair.dispose();
  }
  console.log(role+': '+eyeWitness+' unobscured globe and '+skinWitness+' true lid rays on dressed model; 2,020 actual portrait triangles');
  face.dispose();closeMat.dispose();
  if (role === 'rifle-scout') {
    const colors = body.getAttribute('color'), positions = body.getAttribute('position');
    assert.ok(Array.from({ length: colors.count }, (_, index) => index).some(index =>
      positions.getY(index) > 1.59 && colors.getX(index) > colors.getY(index) * 3 && colors.getX(index) > colors.getZ(index) * 3), 'Rambo must retain his visible red headband');
  }
  if (role !== 'mounted-cavalry') {
    const bind = metrics.infantryRifleBind(role === 'heavy-gunner' ? 'heavy' : 'scout', false);
    const weaponGeometry = allyPresentation.createAllyWeaponGeometry(role);
    validateGeometry(weaponGeometry, `${role}-weapon`, 2500);
    assert.ok(Math.abs(weaponGeometry.boundingBox.min.z - bind.muzzle[2]) < 1e-6, 'Barrel tip must end at the authored muzzle');
    const socket = new THREE.Vector3(...bind.muzzle), positions = weaponGeometry.getAttribute('position');
    assert.ok(Array.from({ length: positions.count }, (_, index) => index).some(index =>
      new THREE.Vector3().fromBufferAttribute(positions, index).distanceTo(socket) < 1e-5), 'The muzzle socket must coincide with the actual barrel end cap');
    checkPropFit(body, weaponGeometry, bind, false, role);
    const rig = createInfantryRig(false), mesh = new THREE.SkinnedMesh(body, INFANTRY_MATERIAL), weapon = new THREE.Group();
    bindInfantryRig(mesh, rig);
    for (const aimPitch of [0, 0.18, 0.35]) {
      updateInfantryRig(rig, { time: 1.2, delta: 1 / 60, moving: false, progress: 0, phase: 0, recoil: 0.7, aimPitch });
      applyInfantryWeaponPose(weapon, rig); weapon.updateMatrixWorld(true);
      const expected = infantrySocketPosition(new THREE.Vector3(), socket, rig);
      assert.ok(expected.distanceTo(socket.clone().applyMatrix4(weapon.matrix)) < 1e-8, 'Hero muzzle and held weapon must share the complete spine transform');
    }
    disposeInfantryRig(rig); weaponGeometry.dispose();
  }
  body.dispose();
}
const horseBody = allyPresentation.createHorseBodyGeometry(), horseLeg = allyPresentation.createHorseLegGeometry();
validateGeometry(horseBody, 'cavalry-horse', 13000); validateGeometry(horseLeg, 'horse-leg', 1600);
assert.ok(horseLeg.boundingBox.min.y + 0.989 >= 0 && horseLeg.boundingBox.min.y + 0.989 < 0.03, 'Hooves must contact the ground at authored hip height');
horseBody.dispose(); horseLeg.dispose();
const allyMaterial = allyPresentation.createProtectedAllyMaterial();
assert.equal(allyMaterial.isMeshStandardMaterial, true, 'Hero bodies must be normally shaded, not unlit flat silhouettes');
assert.equal(allyMaterial.emissive.getHex(), 0, 'No emissive aura/body wash');
const allyShader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
allyMaterial.onBeforeCompile(allyShader, null);
assert.match(allyShader.fragmentShader, /dot\(normal, guardianDirection\)/, 'Protected fill must preserve directional shape');
assert.match(allyShader.fragmentShader, /fabricWeave/, 'Hero materials must retain shared cloth/skin surface response');
assert.match(allyShader.fragmentShader, /fwidth\(weaveUV\)/, 'Fine weave must fade with pixel footprint');
assert.match(allyShader.fragmentShader, /roughnessFactor = mix\(.94,.82/, 'Boot upper and sole do not shade like cloth');
allyMaterial.dispose();

// Execute the exported frame-order boundary itself. The pose callback must see
// this frame's actor transform before it anchors feet or exposes a muzzle.
const presentationSource = await readFile(new URL('../src/components/Scene/FinalBossAllyPresentation.tsx', import.meta.url), 'utf8');
const presentationAst = ts.createSourceFile('FinalBossAllyPresentation.tsx', presentationSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const syncDeclaration = presentationAst.statements.find(statement => ts.isFunctionDeclaration(statement)
  && statement.name?.text === 'syncFinalBossAllyPresentation');
assert.ok(syncDeclaration, 'Explicit ally movement-to-pose synchronization boundary required');
const syncJs = ts.transpileModule(syncDeclaration.getText(presentationAst), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { syncFinalBossAllyPresentation } = await import(`data:text/javascript;base64,${Buffer.from(syncJs).toString('base64')}`);
assert.ok(!/useFrame\s*\(/.test(presentationSource), 'Ally presentation must not race the parent AI in a separate frame subscription');
for (const rifleY of [0.94, 0.9]) {
  const actor = new THREE.Group(), weapon = new THREE.Group(), flash = new THREE.Object3D();
  actor.add(weapon); weapon.add(flash); flash.position.set(0, rifleY, -0.72);
  let updates = 0;
  for (const [x, z, yaw] of [[2, -4, 0], [2.16, -3.95, 0.7], [-1, 3, -1.2]]) {
    const current = new THREE.Vector3(x, 0.02, z);
    syncFinalBossAllyPresentation(actor, current, yaw, (now, delta) => {
      updates++;
      assert.deepEqual(actor.position.toArray(), current.toArray(), 'Pose must see current actor translation, not the preceding frame');
      assert.equal(actor.rotation.y, yaw, 'Pose must see current actor yaw');
      assert.equal(now, 10); assert.equal(delta, 1 / 60);
      weapon.position.y = 0.025; // This frame's cosmetic breathing/stance result.
    }, 10, 1 / 60);
    const actual = flash.getWorldPosition(new THREE.Vector3());
    const expected = new THREE.Vector3(0, rifleY + 0.025, -0.72).applyMatrix4(actor.matrixWorld);
    assert.ok(actual.distanceTo(expected) < 1e-9, 'Muzzle sampling must include current root and current presentation matrices');
  }
  assert.equal(updates, 3, 'One presentation update per simulation frame');
}
const allyParentSource = await readFile(new URL('../src/components/Scene/FinalBossAllies.tsx', import.meta.url), 'utf8');
assert.match(allyParentSource, /if \(!presentationUpdated\) syncFinalBossAllyPresentation/);
assert.match(allyParentSource, /syncFinalBossAllyPresentation\(model,[\s\S]*?presentationUpdated = true;\s*flash\.getWorldPosition\(muzzlePosition\)/,
  'A firing actor must finish its pose before sampling the rendered muzzle');
assert.match(allyParentSource, /name=\{ally\.id\}/, 'Stable actor names support following camera review');

// One shared geometry/material and nine bone matrices per combatant: animation
// never rebuilds geometry or adds per-limb draw calls. Check actual skin transforms
// rather than only asserting animation source text or socket constants.
for (const kneeling of [false, true]) {
  const geometry = createInfantryGeometry({ faction: 'us', kneeling });
  const rig = createInfantryRig(kneeling);
  const mesh = new THREE.SkinnedMesh(geometry, INFANTRY_MATERIAL);
  const parent = new THREE.Group(); parent.add(mesh);
  parent.position.set(2, 0.02, -3); parent.scale.setScalar(metrics.INFANTRY_WORLD_SCALE);
  let unbind = bindInfantryRig(mesh, rig);
  assert.equal(rig.skeleton.bones.length, 9, 'Rig must stay within its nine-bone budget');
  const skinIndices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
  assert.ok(skinIndices.array.every(value => value >= 0 && value <= 8));
  for (let vertex = 0; vertex < weights.count; vertex++) {
    assert.equal(weights.getX(vertex) + weights.getY(vertex) + weights.getZ(vertex) + weights.getW(vertex), 1);
  }
  const originalPositions = geometry.getAttribute('position').array.slice();
  const bindInverses = rig.skeleton.boneInverses.map(matrix => matrix.clone());
  const left = new THREE.Vector3(), right = new THREE.Vector3(), previousFeet = [new THREE.Vector3(), new THREE.Vector3()];
  const weapon = new THREE.Group(), socket = new THREE.Vector3(-0.13, metrics.infantryRifleHeight(kneeling), -1.24);
  const cpuSocket = new THREE.Vector3(), skinSocket = new THREE.Vector3(), weaponSocket = new THREE.Vector3();
  updateInfantryRig(rig,{time:0,delta:1/60,moving:false,progress:0,phase:0,recoil:0,
    fieldStance:true,holdingRifle:true,worldX:2,worldZ:-3,worldScale:metrics.INFANTRY_WORLD_SCALE});
  parent.updateMatrixWorld(true);
  assert.ok(kneeling ? rig.root.position.x===0 : rig.root.position.x>.035 && rig.root.position.y<-.018,
    'Standing field stance should load one hip; the established kneeling support must stay put');
  for(const leg of rig.legs) {
    const wanted=leg.ankle.clone().applyMatrix4(mesh.matrixWorld);
    assert.ok(leg.foot.getWorldPosition(left).distanceTo(wanted)<1e-5,'A weight shift must not slide either boot');
  }
  let maximumLift = 0, groundedContacts = 0, maxContactDrift = 0;
  for (let frame = 0; frame <= 120; frame++) {
    const progress = frame / 120, smooth = progress * progress * (3 - 2 * progress);
    parent.position.x = 2 + smooth * 0.28;
    updateInfantryRig(rig, { time: progress, delta: 1 / 120, moving: frame < 120,
      progress, phase: 0.4, recoil: frame % 17 === 0 ? 1 : 0, aimPitch: 0.16, lookYaw: 0.1, fieldStance:true,
      worldX: parent.position.x, worldZ: -3, worldYaw: 0, worldScale: metrics.INFANTRY_WORLD_SCALE,
      moveFromX: 2, moveFromZ: -3, moveToX: 2.28, moveToZ: -3 });
    parent.updateMatrixWorld(true); rig.skeleton.update();
    rig.legs[0].foot.getWorldPosition(left); rig.legs[1].foot.getWorldPosition(right);
    [left, right].forEach((foot, index) => {
      const expectedY = 0.02 + rig.legs[index].ankle.y * metrics.INFANTRY_WORLD_SCALE;
      assert.ok(foot.y >= expectedY - 0.00001, 'IK must not drive a boot below its ground contact');
      maximumLift = Math.max(maximumLift, foot.y - expectedY);
      const segment = Math.min(3, Math.floor(progress * 4));
      if (frame > 1 && frame % 30 > 1 && (segment+Number(kneeling)) % 2 !== index) {
        const drift = Math.hypot(foot.x - previousFeet[index].x, foot.z - previousFeet[index].z);
        maxContactDrift = Math.max(maxContactDrift, drift);
        assert.ok(drift < 0.00001, `Planted foot drift ${drift} at frame ${frame}, leg ${index}`);
        groundedContacts++;
      }
      previousFeet[index].copy(foot);
    });
    infantrySocketPosition(cpuSocket, socket, rig);
    applyInfantryWeaponPose(weapon, rig); weapon.updateMatrixWorld(true);
    weaponSocket.copy(socket).applyMatrix4(weapon.matrix);
    skinSocket.copy(socket).applyMatrix4(mesh.bindMatrix).applyMatrix4(rig.skeleton.boneInverses[1])
      .applyMatrix4(rig.spine.matrixWorld).applyMatrix4(mesh.bindMatrixInverse);
    assert.ok(cpuSocket.distanceTo(weaponSocket) < 1e-9, 'US rifle group must follow the exact spine socket');
    assert.ok(cpuSocket.distanceTo(skinSocket) < 1e-7, 'VC skinned rifle and muzzle flash must have identical transforms');
  }
  assert.ok(maximumLift > 0.05 && maximumLift < 0.08, 'Feet must visibly alternate lifting without hopping');
  assert.ok(groundedContacts > 100 && maxContactDrift < 1e-5, 'Need measured world-space planted support contacts');
  assert.deepEqual(geometry.getAttribute('position').array, originalPositions, 'Animation must not mutate shared geometry');
  // Re-attach at an animated pose: bind inverses must remain the original rest pose.
  unbind(); releaseInfantryRig(rig); unbind = bindInfantryRig(mesh, rig);
  await Promise.resolve();
  assert.equal(rig.disposed, false, 'StrictMode effect replay must not dispose a reattached skeleton');
  bindInverses.forEach((matrix, index) => assert.deepEqual(rig.skeleton.boneInverses[index].elements, matrix.elements));
  // GPU bone texture is an owned resource; a real exit must dispose it once.
  rig.skeleton.computeBoneTexture();
  let textureDisposals = 0;
  rig.skeleton.boneTexture.addEventListener('dispose', () => textureDisposals++);
  unbind(); releaseInfantryRig(rig); await Promise.resolve();
  assert.equal(rig.disposed, true); assert.equal(textureDisposals, 1);
  disposeInfantryRig(rig); assert.equal(textureDisposals, 1, 'Repeated exit cleanup must be idempotent');
  geometry.dispose();
}

// The old animation lifted feet but left the rear knee at ground height for
// the entire trip. Measure the real shin/boot transforms between the start
// and stop, then require an independently placed, stationary cover pose.
for (const faction of ['us','vc']) {
  const rig=createInfantryRig(true),geometry=createInfantryGeometry({faction,kneeling:true,fieldUniform:true});
  const mesh=new THREE.SkinnedMesh(geometry,INFANTRY_MATERIAL),actor=new THREE.Group();
  const scale=metrics.INFANTRY_WORLD_SCALE;
  actor.add(mesh);actor.scale.setScalar(scale);bindInfantryRig(mesh,rig);
  const v=new THREE.Vector3(),prev=[new THREE.Vector3(),new THREE.Vector3()];
  let lowKnee=Infinity,lowHip=Infinity,contactDrift=0,contactCount=0,steps=0,lastSwing=-1;
  const peak=[0,0],settleSteps=new Set();
  for(let i=0;i<=180;i++){
    const p=Math.min(1,i/120),dz=-2.4*p*p*(3-2*p);
    actor.position.z=dz;
    updateInfantryRig(rig,{time:i/60,delta:1/60,moving:i<120,progress:p,phase:.4,recoil:0,
      fieldStance:true,holdingRifle:true,worldScale:scale,worldZ:dz,moveFromZ:0,moveToZ:-2.4});
    actor.updateMatrixWorld(true);
    for(const [j,leg] of rig.legs.entries()){
      const ankle=leg.foot.getWorldPosition(v);
      if(i>=38&&i<=103){
        if(leg.lift>.08&&lastSwing!==j){steps++;lastSwing=j;}
        if(i>38&&!leg.lift && peak[j]===0){contactDrift=Math.max(contactDrift,v.distanceTo(prev[j]));contactCount++;}
        lowHip=Math.min(lowHip,rig.root.position.y);
      }
      if(i>120&&leg.lift>.04)settleSteps.add(j);
      peak[j]=leg.lift;prev[j].copy(ankle);
      if(i>=38&&i<=103)lowKnee=Math.min(lowKnee,leg.lower.getWorldPosition(v).y/scale);
    }
  }
  assert.ok(lowHip>.195 && lowKnee>.28,`${faction} travelled on a lowered knee: pelvis rise ${lowHip}, knee ${lowKnee}`);
  assert.ok(steps>=4&&contactCount>=35&&contactDrift<.0001,`${faction} failed planted stride: ${steps}/${contactCount}/${contactDrift}`);
  assert.equal(settleSteps.size,2,'Each boot should take its own settling step into cover');
  assert.ok(Math.abs(rig.root.position.y)<.001,'Should resume authored kneel only after travel');
  for(const leg of rig.legs)assert.ok(leg.lower.getWorldPosition(v).distanceTo(leg.knee.clone().applyMatrix4(actor.matrixWorld))<.001);
  console.log(`${faction} cover stride: minimum moving knee ${lowKnee.toFixed(3)}m, pelvis rose ${lowHip.toFixed(3)}m; ${steps} foot exchanges, ${contactDrift.toFixed(6)} world-unit plant drift`);
  disposeInfantryRig(rig);geometry.dispose();
}

// The authored US bounds are longer/diagonal; inspect their actual grounded
// ankle transforms, including a turned actor, rather than a generic walk only.
for (const [distanceX, distanceZ, yaw] of [[0.35, -0.35, Math.PI], [-0.36, -0.44, Math.PI], [0.35, -0.37, Math.PI], [0.28, 0, Math.PI / 2]]) {
  const rig = createInfantryRig(true), mesh = new THREE.SkinnedMesh(createInfantryGeometry({ faction: 'us', kneeling: true }), INFANTRY_MATERIAL);
  const parent = new THREE.Group(); parent.add(mesh); parent.scale.setScalar(metrics.INFANTRY_WORLD_SCALE); parent.rotation.y = yaw;
  bindInfantryRig(mesh, rig);
  for (let frame = 0; frame <= 100; frame++) {
    const progress = frame / 100, smooth = progress * progress * (3 - 2 * progress);
    parent.position.set(distanceX * smooth, 0.02, distanceZ * smooth);
    updateInfantryRig(rig, { time: progress, delta: 0.01, moving: frame < 100, progress, phase: 0, recoil: 0,
      worldX: parent.position.x, worldZ: parent.position.z, worldYaw: yaw, worldScale: metrics.INFANTRY_WORLD_SCALE,
      moveFromX: 0, moveFromZ: 0, moveToX: distanceX, moveToZ: distanceZ });
    parent.updateMatrixWorld(true);
    for (const leg of rig.legs) {
      const world = leg.foot.getWorldPosition(new THREE.Vector3());
      assert.ok(world.y >= 0.02 + leg.ankle.y * metrics.INFANTRY_WORLD_SCALE - 1e-5, 'Authored diagonal bound must keep both soles above ground');
      assert.ok(leg.upper.quaternion.toArray().every(Number.isFinite) && leg.lower.quaternion.toArray().every(Number.isFinite));
    }
  }
  disposeInfantryRig(rig); mesh.geometry.dispose();
}

for (const stance of ['standing', 'kneeling']) {
  const enemy = { id: 'test-soldier', position: [0, 0.02, 0], alive: true, stance };
  for (const height of [0.3, metrics.infantryAimHeight(stance === 'kneeling'), stance === 'kneeling' ? 0.9 : 1.18]) {
    const start = new THREE.Vector3(-4, height, 0);
    const end = new THREE.Vector3(4, height, 0);
    assert.equal(combat.findNearestLivingEnemyHit(start, end, [enemy])?.enemy, enemy, `${stance}: torso/head should remain hittable`);
  }
  const machineGun = combat.findNearestLivingEnemyHit(
    new THREE.Vector3(-4, 1.44, 0), new THREE.Vector3(4, 1.44, 0), [enemy], combat.ENEMY_HIT_RADIUS * 1.18,
  );
  assert.equal(machineGun?.enemy, enemy, `${stance}: high pintle MG must not pass over infantry`);
  enemy.alive = false;
  assert.equal(combat.findNearestLivingEnemyHit(new THREE.Vector3(-4, 0.6, 0), new THREE.Vector3(4, 0.6, 0), [enemy]), null, 'Defeated enemies must not absorb shots');
}
for (const kneeling of [false, true]) {
  const friendly = { id: 'friendly', position: [0, 0.02, 0], alive: true, kneeling };
  const height = metrics.infantryAimHeight(kneeling);
  assert.equal(combat.findNearestLivingFriendlyHit(new THREE.Vector3(-4, height, 0), new THREE.Vector3(4, height, 0), [friendly])?.friendly, friendly,
    'Opposing rifle aim must intersect the updated friendly profile');
}
const movingEnemy = { id: 'moving-vc', position: [0, 0.02, 0], alive: true, stance: 'standing' };
const livePoses = new Map([[movingEnemy.id, { position: new THREE.Vector3(3, 0.02, 0), yaw: 0.3 }]]);
const movedStart = new THREE.Vector3(3, 1.25, -3), movedEnd = new THREE.Vector3(3, 1.25, 3);
assert.equal(combat.findNearestLivingEnemyHit(movedStart, movedEnd, [movingEnemy]), null);
assert.equal(combat.findNearestLivingEnemyHit(movedStart, movedEnd, [movingEnemy], undefined, livePoses)?.enemy, movingEnemy,
  'Swept hit volumes must follow the live rendered VC center');
assert.deepEqual(combat.enemyWorldPosition(new THREE.Vector3(), movingEnemy, livePoses).toArray(), [3, 0.02, 0], 'Friendly target acquisition must read that same live center');
assert.deepEqual(movingEnemy.position, [0, 0.02, 0], 'Animated soldiers must not move their physical cover placement');
livePoses.clear();
assert.equal(combat.findNearestLivingEnemyHit(movedStart, movedEnd, [movingEnemy], undefined, livePoses), null, 'Cleared encounter poses must fall back to authored positions');
console.log(`Infantry geometry, nine-bone articulation, planted contacts, sockets, lifecycle and swept-hit checks passed.\n${summaries.join('\n')}`);
