// Real seeded Three triangles and the stationary defense camera. Does not
// certify the image (wind, all scenery and animation still need live footage).
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),T=require('three');
const {instrumentRiceFixture}=require('./qa-rice-fixture.cjs');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,file)=>{
  let source=fs.readFileSync(file,'utf8').replaceAll('import.meta.env.DEV','false');
  if(file.endsWith('/VietnamEnvironment.tsx'))source=instrumentRiceFixture(source,file);
  m._compile(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
};
const {hashCombatSession}=require('../src/lib/combat'),{TRAINING_DIRECTORY}=require('../src/lib/training');
const {EMBASSY_GUARD_POSITION,EMBASSY_GUARD_YAW,EMBASSY_DEFENSE_OFFSET_Z}=require('../src/lib/embassyDefense');
const {CAMERA_OFFSET}=require('../src/lib/constants'),wear=require('../src/components/Scene/embassyServiceTrack');
const {__rice}=require('../src/components/Scene/VietnamEnvironment');
const seed=hashCombatSession(TRAINING_DIRECTORY), eye=new T.Vector3(...CAMERA_OFFSET)
  .applyAxisAngle(new T.Vector3(0,1,0),EMBASSY_GUARD_YAW).add(new T.Vector3(...EMBASSY_GUARD_POSITION));
const candidate=__rice(seed,EMBASSY_DEFENSE_OFFSET_Z),day=__rice(seed,0);
const dayFlight=__rice(seed,0,true),dayPadGrass=require('../src/lib/campaignFlights').dayPadGrass;
let dayStubble=0;
for(let i=0;i<dayFlight.count;i++){
  const a=new T.Matrix4(),b=new T.Matrix4();day.getMatrixAt(i,a);dayFlight.getMatrixAt(i,b);
  if(!a.equals(b)){
    assert.ok(dayPadGrass(a.elements[12],a.elements[14])<1&&b.elements[5]<a.elements[5]);
    assert.deepEqual(a.elements.slice(12,15),b.elements.slice(12,15));dayStubble++;
  }
}
assert.ok(dayStubble>12&&dayStubble<day.count*.12,'Crop height change is bounded to the actual day landing pad');
const realProfile=wear.paddyCrossingHeight;
wear.paddyCrossingHeight=()=>1;
const earlier=__rice(seed,EMBASSY_DEFENSE_OFFSET_Z),oldDay=__rice(seed,0);
wear.paddyCrossingHeight=realProfile;
assert.deepEqual(day.instanceMatrix.array,oldDay.instanceMatrix.array,'Day cannot inherit the defense cut');
assert.equal(candidate.count,earlier.count,'No roots removed');
const oldMat=new T.Matrix4(),newMat=new T.Matrix4();
let shortened=0;
for(let i=0;i<candidate.count;i++){
  candidate.getMatrixAt(i,newMat);earlier.getMatrixAt(i,oldMat);
  for(const n of [12,13,14])assert.equal(newMat.elements[n],oldMat.elements[n],'Plant anchors cannot shift');
  if(!newMat.equals(oldMat)){
    shortened++;const [x,,z]=newMat.elements.slice(12,15);
    assert.ok(realProfile(x,z)<1 && newMat.elements[5]<oldMat.elements[5],'Only plants in the actual foot cut get shorter');
  }
}
assert.ok(shortened>20 && shortened<candidate.count*.12,'A maintained lane, not a shorn field');
// The actual 8-second shutter bracket (reports: w5XBBb/before and after).
// Sweep the runner's width between these two known positions.
const ray=new T.Raycaster(),target=new T.Vector3();
const measures={};
for(const [label,y] of [['shin',.23],['knee',.46],['head',1.23]]){
  let blockedBefore=0,blockedAfter=0,total=0;
  for(let step=0;step<=25;step++)for(const lateral of [-.20,-.10,0,.10,.20]){
    target.set(10.247-.020*step/25+lateral,y,.092-1.486*step/25);
    ray.set(eye,target.clone().sub(eye).normalize());ray.far=eye.distanceTo(target)-.02;
    blockedBefore+=Number(ray.intersectObject(earlier,false).length>0);
    blockedAfter+=Number(ray.intersectObject(candidate,false).length>0);
    total++;
  }
  measures[label]=[blockedBefore,blockedAfter,total];
}
console.log(JSON.stringify({shortened,allRoots:candidate.count,blockedRayCountsBeforeAfterTotal:measures}));
assert.ok(measures.shin[1]<=measures.shin[0]*.75 && measures.knee[1]<=measures.knee[0]*.75,
  'At least one quarter fewer blocked rays, or preserve an already completely clear silhouette');
assert.equal(measures.knee[1],0,'The lower, grouped planting must leave the entire knee silhouette clear');
assert.ok(measures.head[1]<=measures.head[0]);
for(const mesh of [candidate,earlier,day,oldDay,dayFlight]){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}
