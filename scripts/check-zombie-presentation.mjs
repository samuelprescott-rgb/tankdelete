import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import ts from 'typescript';

const source=await readFile(new URL('../src/components/Scene/zombieGeometry.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
  .replace("from 'three'",`from '${import.meta.resolve('three')}'`);
const model=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const helperModule = async filename => {
  const source = await readFile(new URL(`../src/components/Scene/${filename}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
};
const { applyUndeadReadability, UNDEAD_VALUE_BAND } = await helperModule('undeadReadability');
const { createUndeadUpperPose, writeUndeadUpperPose } = await helperModule('undeadUpperPose');
const { applyPaintedFinish } = await helperModule('paintedMaterials');
let total=0;
for(const part of ['Torso','Arm','Leg','Head','Helmet']) {
  const geometry=model[`createZombie${part}Geometry`]();
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
  for(const attribute of ['position','normal','color','zombieLocalPigment']) {
    const data=geometry.getAttribute(attribute);
    assert.equal(data.count,p.count);
    assert.ok(data.array.every(Number.isFinite),`${part} finite ${attribute}`);
  }
  assert.equal(p.count%3,0);
  assert.equal(geometry.groups.length,0,'Each anatomy part remains one instanced draw');
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let vertex=0;vertex<p.count;vertex+=3) {
    a.fromBufferAttribute(p,vertex);b.fromBufferAttribute(p,vertex+1);c.fromBufferAttribute(p,vertex+2);
    assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-16,`${part} has a degenerate triangle`);
  }
  for(let vertex=0;vertex<n.count;vertex++)assert.ok(Math.abs(Math.hypot(n.getX(vertex),n.getY(vertex),n.getZ(vertex))-1)<1e-5);
  assert.ok(geometry.boundingSphere.radius<0.6,'Anatomy fits the existing animation frame');
  if(part==='Head')assert.ok(geometry.boundingBox.min.z<-.18&&geometry.boundingBox.min.y<-.20,'Gaunt jaw and nose remain in silhouette');
  if(part==='Torso') {
    const mask=geometry.getAttribute('zombieLocalPigment');
    const panel=new THREE.Box3(), cross=new THREE.Vector3();
    let area=0,frontArea=0,backArea=0;
    for(let i=0;i<p.count;i+=3) {
      if(mask.getX(i)!==1)continue;
      a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
      if(Math.min(a.y,b.y,c.y)>=.28&&Math.max(a.x,b.x,c.x)<.07)continue; // neck
      panel.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      cross.subVectors(b,a).cross(c.sub(a)).multiplyScalar(.5);
      area+=cross.length();frontArea+=Math.max(0,-cross.z);backArea+=Math.max(0,cross.z);
    }
    assert.ok(area>.11&&area<.25&&frontArea>.034&&backArea>.020,'Woven shoulder folds have bounded, front- and back-facing area');
    assert.ok(panel.min.x>-.05&&panel.max.x>.24&&panel.min.y>-.01&&panel.max.y<.35,
      'Pale pigment belongs to one shoulder, not the entire coat');
  }
  if(part==='Leg')assert.ok(geometry.boundingBox.min.y>=-.291,'Boot soles remain planted in the old 0.29m gait frame');
  total+=p.count/3*(['Arm','Leg'].includes(part)?2:1);
  geometry.dispose();
}
assert.ok(total<=1800,`Standard undead budget exceeded: ${total}`);
for(const kind of ['cloth','skin','helmet']) {
  const material=model.createZombieMaterial(kind);
  const shader={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};
  material.onBeforeCompile(shader,{});
  assert.ok(material.vertexColors&&shader.vertexShader.includes('zombieLocalPigment'));
  assert.ok(shader.fragmentShader.includes('mix(diffuseColor.rgb'));
  assert.equal(material.transparent,false,'Undead do not add per-character transparent passes');
  material.dispose();

  const lit = applyPaintedFinish(model.createZombieMaterial(kind));
  const oldKey = lit.customProgramCacheKey(), oldShader = { ...THREE.ShaderLib.standard };
  lit.onBeforeCompile(oldShader, {});
  assert.equal(applyUndeadReadability(lit, kind), lit, 'Reuse the same MeshStandardMaterial');
  const composed = { ...THREE.ShaderLib.standard };
  lit.onBeforeCompile(composed, {});
  assert.equal(composed.vertexShader, oldShader.vertexShader, 'No new varyings, attributes, uniforms or vertex work');
  const block = composed.fragmentShader.match(/\n      \{\s*float undeadDepth =[\s\S]+?\n      #include <opaque_fragment>\n    /);
  assert.ok(block, 'Readability must hook the shipped Three.js standard fragment program');
  assert.equal(composed.fragmentShader.replace(block[0], '#include <opaque_fragment>'), oldShader.fragmentShader,
    'Preserve existing flesh, paint, shadows, fog and opaque depth output');
  assert.match(block[0], /vViewPosition\.z/);
  assert.match(block[0], /shadowRoom/);
  assert.match(THREE.ShaderChunk.lights_fragment_begin, /vec3 geometryViewDir/);
  assert.deepEqual([lit.fog, lit.depthWrite, lit.depthTest, lit.transparent], [true, true, true, false]);
  assert.match(block[0], /directionalLights\[0\]\.direction/);
  assert.equal(lit.customProgramCacheKey(), `${oldKey}:undead-value-v6:${kind}`);
  lit.dispose();
}
const { near, full, recede, far } = UNDEAD_VALUE_BAND;
const weight = depth => THREE.MathUtils.smoothstep(depth, near, full) * (1 - THREE.MathUtils.smoothstep(depth, recede, far));
assert.equal(weight(0), 0);
assert.equal(weight(near), 0);
assert.ok(weight(near + 5) < 0.25);
assert.equal(weight(full), 1);
assert.equal(weight(recede), 1);
assert.ok(weight(far - 5) < 0.25);
assert.equal(weight(far), 0);
assert.equal(weight(far + 50), 0);
const anim=createUndeadUpperPose();
let poses=0;
for(const [variant,runner] of [[0,false],[1,false],[2,false],[2,true]])for(let phase=0;phase<64;phase++) {
  const gait=Math.sin(phase*Math.PI/32);
  writeUndeadUpperPose(anim,variant,runner,gait,gait*.47);
  const reachLeft=variant!==1;
  const shoulder=new THREE.Euler(anim.pitch,0,anim.roll);
  const l=new THREE.Vector3(-.204,.208,.002).applyEuler(shoulder),
    r=new THREE.Vector3(.209,.228,.017).applyEuler(shoulder);
  const wrist=new THREE.Vector3(0,-.47,-.292);
  l.add(wrist.clone().applyEuler(new THREE.Euler(anim.lx,anim.ly,anim.lz)));
  r.add(wrist.clone().applyEuler(new THREE.Euler(anim.rx,anim.ry,anim.rz)));
  const lead=reachLeft?l:r, drag=reachLeft?r:l;
  assert.ok(Math.abs(lead.x)>.40,'Held wrist stays clear of the rib cage in a frontal chase view');
  assert.ok(r.x-l.x>.67,'Reaching and trailing hands remain separate throughout the gait');
  assert.ok(!runner?lead.y-drag.y>.14:true,'Shambler holds visibly unequal arm heights');
  assert.ok(lead.z<drag.z-.045,'Side views retain forward reach');
  poses++;
}
const component=await readFile(new URL('../src/components/Scene/ZombieHorde.tsx',import.meta.url),'utf8');
for(const part of ['ARM_GEOMETRY','LEG_GEOMETRY','STANDARD_HEAD_GEOMETRY'])assert.match(component,new RegExp(`args=\\{\\[${part},`));
assert.match(component,/geometry=\{BOSS_HEADS\[h\]\}/,'Two original independent solid heads');
assert.doesNotMatch(component,/nightmare-boss-.*texture|\b(?:kamala|biden)\b/i,'The sculpt materials do not own the separately detachable printed portraits');
assert.match(component,/portraitMasks\.sync\(maskWearer/,'Detachable masks read the active combatant, not an animation timer');
assert.match(component,/geometry=\{BOSS_JAWS\[h\]\}/,'Both lower dental arches have a working hinge');
assert.equal(Array.from(component.matchAll(/applyUndeadReadability\(/g)).length, 3, 'Only regular shared standard/fallback materials are graded');
const authoredHead = await readFile(new URL('../src/components/Scene/AuthoredZombieHead.tsx', import.meta.url), 'utf8');
assert.match(authoredHead, /applyUndeadReadability\(material, 'skin'\)/, 'The loaded head keeps the same rules as the fallback');
const creatureSource=await readFile(new URL('../src/components/Scene/commandCreature.ts',import.meta.url),'utf8');
const pigmentSource=await readFile(new URL('../src/components/Scene/commandBonePaint.ts',import.meta.url),'utf8');
const pigmentJs=ts.transpileModule(pigmentSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
  .replace(/from '(three[^']*)'/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const pigmentUrl='data:text/javascript;base64,'+Buffer.from(pigmentJs).toString('base64');
const compiled=ts.transpileModule(creatureSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
  .replace(/from '(three[^']*)'/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)))
  .replace("from './commandBonePaint'",'from '+JSON.stringify(pigmentUrl));
const creature=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const tris=g=>(g.index?.count??g.getAttribute('position').count)/3;
let creatureTris=0;
for(const rear of [false,true]){
  const top=creature.commandSkull(rear),jaw=creature.commandSkull(rear,true);
  const depth=top.boundingBox.max.z-top.boundingBox.min.z;
  assert.ok(depth>.40,'Cranium, muzzle and bridge must have substantial physical depth.');
  const p=top.getAttribute('position'),q=jaw.getAttribute('position'),v=new THREE.Vector3(),w=new THREE.Vector3();
  const offset=new THREE.Vector3(...creature.COMMAND_JAW_HINGE);
  for(let i=0;i<=64;i++){
    v.fromBufferAttribute(p,i);w.fromBufferAttribute(q,q.count-65+i).add(offset);
    assert(v.distanceTo(w)<.00001,'The upper lip must meet the hinged lower surface when the jaw closes.');
  }
  const eyes=top.getAttribute('commandEmber'),mask=eyes.array;
  assert.ok(p.count===eyes.count&&mask.includes(0));
  assert.ok(!top.getAttribute('uv')&&!top.getAttribute('portraitWeight'),'The sculpt has no portrait chart');
  const pc=top.getAttribute('commandPigmentCoord'),jc=jaw.getAttribute('commandPigmentCoord');
  assert.equal(pc.count,p.count);assert.equal(jc.count,q.count);
  for(let i=0;i<=64;i++){
    const k=q.count-65+i;assert.equal(pc.getY(i),jc.getY(k));
    assert(pc.getX(i)>(rear?.5:0)&&pc.getX(i)<(rear?1:.5),'Both original head studies have independent texels');
  }
  assert.ok(jaw.getAttribute('commandEmber').array.every(x=>x===0),'No emission on the jaw');
  const trim=creature.commandHeadTrim(rear,true),crown=creature.commandHeadTrim(rear);
  const material=new THREE.MeshBasicMaterial(),head=new THREE.Mesh(top,material),support=new THREE.Mesh(crown,material);
  const caster=new THREE.Raycaster(),direction=new THREE.Vector3();
  const groups=[new THREE.Box3(),new THREE.Box3()];
  let marked=0;
  for(let i=0;i<mask.length;i++)if(mask[i]>0){marked++;v.fromBufferAttribute(p,i);groups[Number(v.x>0)].expandByPoint(v);}
  assert.ok(marked>0&&marked<.10*p.count);
  for(const bounds of groups){
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    assert.ok(size.x>.018&&size.x<.027&&size.z>.015&&size.z<.024,'Each ember is a small convex piece, not a marked face');
    for(const angle of [0,Math.sign(center.x)*.38]){
      direction.set(Math.sin(angle),0,-Math.cos(angle)).normalize();
      caster.set(center.clone().addScaledVector(direction,.6),direction.clone().negate());
      const first=caster.intersectObjects([head,support])[0];
      assert.ok(first?.object===head&&eyes.getX(first.face.a)>0,'An ember, not the surrounding cheek or trim, is visible in this socket');
    }
  }
  assert.ok(trim.boundingSphere.radius>.095,'A real lower dental arch travels with each mandible.');
  creatureTris+=tris(top)+tris(jaw)+tris(crown)+tris(trim);
  top.dispose();jaw.dispose();trim.dispose();crown.dispose();material.dispose();
}
for(const side of [-1,1])for(const back of [true,false])for(const segment of ['upper','fore','hand']){
  const g=creature.commandArm(side,back,segment);
  assert.equal(g.groups.length,0);assert.ok(g.getAttribute('normal').array.every(Number.isFinite));
  const constituents=g.getAttribute('commandRakePigment');
  if(side>0&&!back&&segment==='hand'){
    const pos=g.getAttribute('position');let keratin=0,saddle=0,rest=0;
    assert.equal(constituents.count,pos.count);
    for(let k=0;k<pos.count;k++){
      const horn=constituents.getX(k),pad=constituents.getY(k),wear=constituents.getZ(k);
      assert([horn,pad,wear].every(v=>v>=0&&v<=1));
      if(horn>.80){keratin++;assert(pos.getZ(k)<-.077&&pos.getY(k)<-.11,'Keratin belongs to the hooks, not the arm');}
      if(pad>.44)saddle++;
      if(!horn&&pad<.1)rest++;
    }
    assert(keratin>120&&saddle>30&&rest>150,'Rake retains distinct hook, warmer pad and unchanged shadow regions');
  }else assert(!constituents,'Other body parts share only the existing hide material');
  assert.ok(g.boundingBox.max.z-g.boundingBox.min.z>.11);
  creatureTris+=tris(g);
  g.dispose();
}
for(const fn of ['commandMantle','commandWaist','commandCoat']){
  const g=creature[fn]();
  assert.equal(g.groups.length,0,'One batch for each rigid chunk');
  assert(g.getAttribute('normal').array.every(Number.isFinite));
  if(fn==='commandCoat'){
    const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),cast=new THREE.Raycaster();
    let clear=0,thread=0;
    for(let y=.368;y<.493;y+=.009)for(let x=-.20;x<.20;x+=.013){
      cast.set(new THREE.Vector3(x,y,-.9),new THREE.Vector3(0,0,1));
      if(cast.intersectObject(mesh).length)thread++;else clear++;
    }
    assert.ok(clear>20&&thread>100,'Light passes between actual hem tatters, with canvas still present');
    mesh.material.dispose();
  }
  creatureTris+=tris(g);g.dispose();
}
assert.ok(creatureTris<42000,'Merged monster anatomy stays within its fixed rigid-mesh triangle budget');
console.log('Original command anatomy subtotal (head, arms, coat, chest and waist):',creatureTris,'triangles');
const coarse=applyPaintedFinish(new THREE.MeshStandardMaterial({vertexColors:true}));
creature.commandHideFinish(coarse);
const clawPaint=creature.commandHideFinish(applyPaintedFinish(new THREE.MeshStandardMaterial({vertexColors:true})),true);
const clawShader={...THREE.ShaderLib.standard,uniforms:{}};clawPaint.onBeforeCompile(clawShader,{});
assert(clawShader.vertexShader.includes('vRakeInk=commandRakePigment')&&clawShader.fragmentShader.includes('reflectedLight.indirectDiffuse+=horn*oldIvory'));
assert.notEqual(clawPaint.customProgramCacheKey(),coarse.customProgramCacheKey(),'Horn dye must not share the plain body shader cache');
clawPaint.dispose();
const paint={...THREE.ShaderLib.standard,uniforms:{}};coarse.onBeforeCompile(paint,{});
assert.ok(paint.fragmentShader.includes('uCommandTissue')&&paint.fragmentShader.includes('vPaintPosition'));
assert.equal(paint.uniforms.uCommandTissue.value.minFilter,THREE.LinearMipmapLinearFilter);
const grain=paint.uniforms.uCommandTissue.value.image;assert.equal(grain.width,96);assert.equal(grain.height,96);
assert.ok(new Set(grain.data).size>100,'Bound tissue plate has a spread of values, not a single flat overlay.');
const face=creature.commandFaceMaterial(),fs={...THREE.ShaderLib.standard,uniforms:{}};
face.onBeforeCompile(fs,{});
const study=fs.uniforms.uBonePaint.value;assert.equal(study.magFilter,THREE.NearestFilter);assert.equal(study.minFilter,THREE.LinearMipmapLinearFilter);
assert.equal(study.image.width,384);assert.equal(study.image.height,96);
const swatches=new Set();for(let i=0;i<study.image.data.length;i+=4)swatches.add((study.image.data[i]<<16)|(study.image.data[i+1]<<8)|study.image.data[i+2]);
assert(swatches.size>=14&&swatches.size<32,'A deliberate limited character pigment ramp, not continuous image noise');
assert.equal(fs.uniforms.uCommandTissue.value,paint.uniforms.uCommandTissue.value,'Face and limbs share the one texture');
assert.equal(face.map,null);assert.match(fs.fragmentShader,/outgoingLight\+=vCommandEmber/);
assert.doesNotMatch(fs.fragmentShader,/portrait|outgoingLight\s*\+=\s*diffuseColor/);
face.dispose();
paint.uniforms.uCommandTissue.value.dispose();coarse.dispose();
console.log(`Undead presentation checks passed: ${total} triangles per standard zombie, single-shoulder pigment, ${poses} asymmetric gait samples, shared draws and depth-banded value masking.`);
