import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Quaternion,Vector3} from 'three';
import ts from 'typescript';
// Evaluate the scalar fragment helpers themselves. No second, hand-copied
// version of the wavelet envelopes or layout, no rendered image as a test.
const root=new URL('../src/components/Scene/',import.meta.url);
const js=ts.transpileModule(await readFile(new URL('crossingSun.ts',root),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {DAY_SUN_BEARING,DAY_SUN_XZ:[sx,sz]}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const helpers=(await readFile(new URL('riverSunGlints.ts',root),'utf8')).split('`')[1];
const scalar=helpers.replace(/float (river\w+)\(([^)]*)\)/g,(_,name,params)=>
  'function '+name+'('+params.replaceAll('float ','')+')').replace(/\bfloat /g,'let ');
const fract=x=>x-Math.floor(x),clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const smoothstep=(l,h,x)=>{const t=clamp((x-l)/(h-l),0,1);return t*t*(3-2*t);};
function wetlandHash([x,y]){
  let a=fract(x*.1031),b=fract(y*.1031),c=a;const d=a*(b+33.33)+b*(c+33.33)+c*(a+33.33);
  a+=d;b+=d;c+=d;return fract((a+b)*c);
}
const names=['sin','cos','abs','floor','fract','max','clamp','smoothstep','wetlandHash','vec2'];
const {riverCrestInk:crest,riverSunOpening:open}=Function(...names,scalar+';return {riverCrestInk,riverSunOpening};')(
  Math.sin,Math.cos,Math.abs,Math.floor,fract,Math.max,clamp,smoothstep,wetlandHash,(a,b)=>[a,b]);
const material=await readFile(new URL('wetlandGeometry.ts',root),'utf8');
assert.match(material,/crossing\?\.dayPaint && crossing.sunlit \? riverSunGlintsGLSL : ''/);
assert.ok(!/sampler|texture2D/.test(helpers),'No extra sample or map for a wavelet');
assert.match(material,/riverSunOpening\(solarBearing,reflectedRay.y,reflectedOpening\)/);
for(const mask of ['reflectedOpening*=1.-max(trestle.x,trestle.y)','reflectedOpening*=1.-blocked','openSky*=1.-crownField.b'])assert.ok(material.includes(mask));
assert.equal(open(1,.26,0),0,'No amber on an occluding bank or bridge');
assert.equal(open(.60,.26,1),0,'No amber facing away from sunrise');
assert.equal(crest(.0,.0,1,.30),0,'Unresolved, distant wavelets cannot shimmer');
// Retain the angular footprint of the R21 1920x1080 sample windows as a
// canonical wavelet fixture, rotating it to the current solar bearing. These
// are NOT the current shoreline, tree occlusion, or an actual playtest shot.
let eye=[-20.516101266438994,2.953441330708472,3.410209536013872];
let quaternion=[-.04488393779621369,-.7777143885983279,-.0558942014581903,.6245170935517986];
let fov=60;if(process.argv[2]){
  const receipt=JSON.parse(await readFile(process.argv[2],'utf8')),s=receipt.shots.find(s=>s.id==='river-chase');
  eye=s.eye;quaternion=s.quaternion;fov=s.verticalFov;assert.deepEqual(s.canvas,[1920,1080]);
}
const q=new Quaternion(...quaternion),vY=Math.tan(fov*Math.PI/360);
const delta=DAY_SUN_BEARING-Math.atan2(.454,.891),c=Math.cos(delta),s=Math.sin(delta);
function ray(x,y){
  const r=new Vector3((x/960-1)*vY*16/9,(1-y/540)*vY,-1).normalize().applyQuaternion(q);
  const t=(-.60-eye[1])/r.y,wx=eye[0]+t*r.x,wz=eye[2]+t*r.z;
  const px=wx*c-wz*s,pz=wx*s+wz*c,rx=r.x*c-r.z*s,rz=r.x*s+r.z*c;
  return [-sz*px+sx*pz,sx*px+sz*pz,(sx*rx+sz*rz)/Math.hypot(rx,rz),-r.y];
}
for(const t of [1,8,17]){
  let strong=0,quiet=0,total=0;
  for(const [x0,x1,y0,y1] of [[1093,1173,670,705],[1055,1110,733,804],[1035,1102,823,858],[1006,1083,935,1006]])
    for(let y=y0;y<=y1;y+=2)for(let x=x0;x<=x1;x+=2){
      const a=ray(x,y),b=ray(x+1,y),c=ray(x,y+1);
      const footprint=i=>Math.abs(a[i]-b[i])+Math.abs(a[i]-c[i]);
      const h=crest(a[0],a[1],t,Math.max(footprint(1),.28*footprint(0)))*open(a[2],a[3],1);
      strong+=h>.12;quiet+=h<.015;total++;
    }
  assert.ok(strong/total>.007&&strong/total<.15,'A few visible warm lips, not a bright slab');
  assert.ok(quiet/total>.82,'Troughs remain the dominant shape');
  console.log('Registered wavelet fixture t='+t+': strong '+(100*strong/total).toFixed(2)+'%, quiet '+(100*quiet/total).toFixed(2)+'%');
}
// Intersect the same metre-square field along both wave axes; elongated
// connected runs must be transversal, not a strip pointing down the river.
const n=600,step=.012,runs=[[],[]];
for(let dir=0;dir<2;dir++)for(let row=0;row<n;row+=5){let run=0;
  for(let j=0;j<n;j++){
    const a=(dir?row:j)*step-3,b=(dir?j:row)*step-4;
    if(crest(a,b,2,.007)>.1)run+=step;else{if(run)runs[dir].push(run);run=0;}
  }
}
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
assert.ok(mean(runs[0])>4*mean(runs[1])&&Math.max(...runs[0])<1.2);
console.log('Mean isolated crest run (across / into sunlight): '+runs.map(r=>mean(r).toFixed(3)).join(' / ')+' m; max across '+Math.max(...runs[0]).toFixed(3)+' m.');
