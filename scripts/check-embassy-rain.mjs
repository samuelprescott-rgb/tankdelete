// Offline structural/projection checks. Does not measure WebKit or declare
// that moving/final-graded rain is visually approved.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
const root=new URL('../src/components/Scene/',import.meta.url);
async function load(file,extra=''){
  const source=await readFile(new URL(file,root),'utf8');
  let code=ts.transpileModule(source+extra,{compilerOptions:{target:ts.ScriptTarget.ES2020,
    module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for(const [match,,name] of code.matchAll(/from (['"])([^'"]+)\1/g)){
    const url=name.startsWith('.')?await load(name+'.ts'):import.meta.resolve(name);
    code=code.replace(match,'from '+JSON.stringify(url));
  }
  return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
const {createRain}=await import(await load('GhostHordeRain.tsx','\nexport {createRain};'));
const {geo,mat,apron,puddle}=createRain(),seeds=geo.getAttribute('drop');
const family=geo.getAttribute('family'),counts=[0,0,0,0];
const cards=800+48*2;
assert.equal(seeds.count,cards*4);assert.equal(geo.index.count,cards*6);assert.equal(geo.groups.length,0);
assert.ok(mat.transparent&&mat.depthTest&&!mat.depthWrite&&mat.forceSinglePass);
assert.equal(apron.index.count,11*6);
const distinct=new Set(),air=[],cells=new Uint8Array(20*20);
for(let i=0;i<seeds.count;i+=4){
 const k=family.getX(i),a=seeds.array.slice(i*4,i*4+4);counts[k]++;distinct.add(k+':'+a.join(','));
 assert.ok([...a].every(Number.isFinite));
 if(k===0){air.push([...a]);cells[Math.floor(a[2]/2.4)*20+Math.floor(a[0]/2.4)]++;}
 for(let j=1;j<4;j++)assert.deepEqual(seeds.array.slice((i+j)*4,(i+j+1)*4),a);
}
assert.equal(distinct.size,cards);assert.deepEqual(counts,[800,0,48,48]);
assert.ok(cells.every(count=>count===2),'One even population, not a second burst toward the embassy');
// Use the actual GLSL width/length formulas, projected with the actual
// 60-degree chase lens. Near-camera highlighters were the regression.
function formula(name){
 const rhs=mat.vertexShader.match(new RegExp('float '+name+'=([^;]+);'))?.[1];
 assert.ok(rhs);assert.match(rhs,/^[a-z0-9.,+*() ]+$/);
 return Function('depth','kind','drop','clamp','min','return '+rhs);
}
const width=formula('halfWidth'),length=formula('span'),clamp=THREE.MathUtils.clamp;
const focal=540/Math.tan(Math.PI/6);let maxWidth=0,minWidth=Infinity,maxLength=0;
for(const z of [1,2,3,4,6,8,12,16,18])for(const k of [0,.25,.5,.75,1])for(const w of [0,.5,1]){
 const args=[z,k,{w},clamp,Math.min],px=2*focal*width(...args)/z,py=focal*length(...args)/z;
 minWidth=Math.min(minWidth,px);maxWidth=Math.max(maxWidth,px);maxLength=Math.max(maxLength,py);
 assert.ok(py>5&&py/px>5);
}
// In the final grade subpixel lines faded completely. The silver minority
// is now legible, but even the nearest still cannot project as a long slash.
assert.ok(minWidth>.75&&maxWidth<1.55&&maxLength<20);
assert.ok(!mat.fragmentShader.includes('step(tip')&&mat.fragmentShader.includes('opacity*edge*taper'));
// Project the actual seeds through a stock 16:9, 60-degree driver lens at
// 16 headings, at spawn and after a drive. Sample several fall cycles, count
// perceptible heads AND their projected ink, before opaque geometry hides
// them. A bright courthouse curtain must not pass merely by averaging it
// together with an empty rear hemisphere.
const mod=THREE.MathUtils.euclideanModulo,fract=x=>mod(x,1);
const smooth=(lo,hi,x)=>THREE.MathUtils.smoothstep(x,lo,hi);
const glsl=mat.vertexShader;
const param=(pattern)=>{const m=glsl.match(pattern);assert.ok(m,pattern.toString());return m.slice(1).map(Number);};
const [speedBase,speedNoise]=param(/float speed=([\d.]+)\+([\d.]+)\*drop.w/);
const [windX,windZ]=param(/vec3 p=drop.xyz\+vec3\(([\d.]+),-speed,([\d.]+)\)\*elapsed/);
const [halfPeriod,period,negative]=param(/mod\(p.xz-cameraPosition.xz\+([\d.]+),([\d.]+)\)-([\d.]+)/);
assert.equal(halfPeriod*2,period);assert.equal(negative,halfPeriod);
const [height,lift]=param(/p.y=mod\(p.y,([\d.]+)\)\+([\d.]+)/);
const [fadeStart,fadeEnd]=param(/float visibleRange=1.-smoothstep\(([\d.]+),([\d.]+),range\)/);
const [base,grain,practical,near0,near1]=param(/opacity=\(([\d.]+)\+([\d.]+)\*kind\+([\d.]+)\*sideLight\)\*smoothstep\(([\d.]+),([\d.]+),depth\)/);
const [floor0,floor1,roof0,roof1]=param(/smoothstep\(([\d.]+),([\d.]+),p.y\)\*\(1.-smoothstep\(([\d.]+),([\d.]+),p.y\)\)/);
const volume=(p,x,y,z,rx,ry,rz)=>1.-smooth(0,1,Math.hypot((p.x-x)/rx,(p.y-y)/ry,(p.z-z)/rz));
const up=new THREE.Vector3(0,1,0),p=new THREE.Vector3(),look=new THREE.Vector3(),ndc=new THREE.Vector3();
const cam=new THREE.PerspectiveCamera(60,16/9,.1,150);
let countMin=Infinity,countMax=0,inkMin=Infinity,inkMax=0,maxArea=0,minThird=Infinity;
for(const [tx,tz] of [[3,-8.5],[-6,-13]])for(let heading=0;heading<16;heading++){
 const yaw=.2+heading*Math.PI/8;
 cam.position.set(2.05,3.8,6.14).applyAxisAngle(up,yaw).add(new THREE.Vector3(tx,0,tz));
 look.set(1.12,2.75,-1.28).applyAxisAngle(up,yaw).add(new THREE.Vector3(tx,0,tz));
 cam.lookAt(look);cam.updateMatrixWorld();
 let countSum=0,inkSum=0;const thirds=[0,0,0];
 for(let t=0;t<12;t++){
  let area=0;const time=.19+1.37*t;
  for(const [x,y,z,w] of air){
   p.set(cam.position.x+mod(x+windX*time-cam.position.x+halfPeriod,period)-halfPeriod,
    mod(y-(speedBase+speedNoise*w)*time,height)+lift,
    cam.position.z+mod(z+windZ*time-cam.position.z+halfPeriod,period)-halfPeriod);
   ndc.copy(p).applyMatrix4(cam.matrixWorldInverse);const depth=-ndc.z;
   if(depth<=0)continue;
   ndc.applyMatrix4(cam.projectionMatrix);if(Math.abs(ndc.x)>=1||Math.abs(ndc.y)>=1)continue;
   const kind=fract(y*.67+z*.19),range=Math.hypot(p.x-cam.position.x,p.z-cam.position.z);
   const lit=Math.max(volume(p,.05,2.82,-21.3,5.8,5.6,5.4),volume(p,8.34,2.8,-18.96,3.2,4.2,4.),volume(p,3.8,2.6,-21.75,3.5,5.6,4.2));
   const alpha=(base+grain*kind+practical*lit)*smooth(near0,near1,depth)*(1.-smooth(fadeStart,fadeEnd,range))*
    smooth(floor0,floor1,p.y)*(1.-smooth(roof0,roof1,p.y));
   if(alpha<.065)continue;
   const args=[depth,kind,{w},clamp,Math.min],pixels=2*focal*focal*width(...args)*length(...args)/(depth*depth);
   countSum++;thirds[Math.floor((ndc.x+1)*1.5)]++;inkSum+=pixels*alpha;area+=pixels;
  }
  maxArea=Math.max(maxArea,area/(1920*1080));
 }
 const count=countSum/12,ink=inkSum/12;
 countMin=Math.min(countMin,count);countMax=Math.max(countMax,count);
 inkMin=Math.min(inkMin,ink);inkMax=Math.max(inkMax,ink);minThird=Math.min(minThird,...thirds.map(v=>v/12));
}
console.log('384 stock-chase samples (two sites, sixteen headings, twelve times). Visible streak averages by heading: '+
 countMin.toFixed(1)+'–'+countMax.toFixed(1)+'; minimum per screen third: '+minThird.toFixed(1)+
 '; max/min alpha-weighted ink: '+(inkMax/inkMin).toFixed(2)+'; peak unoccluded stroke coverage: '+(maxArea*100).toFixed(3)+'%.');
assert.ok(countMin>=30&&countMax<100&&countMax/countMin<1.32,'Light shower presence across headings');
assert.ok(minThird>=6&&inkMax/inkMin<1.42&&maxArea<.001,'No concentrated side or wall of drizzle');
console.log('800 unpaired airborne drops + 48 small paired splash sites; one transparent submission; nominal 1080p width '
 +minWidth.toFixed(2)+'–'+maxWidth.toFixed(2)+' px, max length '+maxLength.toFixed(1)+' px; eleven puddles unchanged.');
geo.dispose();mat.dispose();apron.dispose();puddle.dispose();
