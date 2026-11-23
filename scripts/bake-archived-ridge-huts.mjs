// Bake only the three painted 1608 house triangle ranges. Never load the
// source scene, terrain, or woodland pigment atlas in the running game.
// Default verifies the checked-in asset; --write regenerates it.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';

const output=new URL('../src/components/Scene/bakedRidgeHuts.json',import.meta.url);
async function load(name){
  const entry=fileURLToPath(new URL('../src/components/Scene/'+name,import.meta.url));
  const bundle=await build({configFile:false,publicDir:false,logLevel:'silent',esbuild:{jsx:'automatic'},build:{ssr:entry,write:false,minify:false}});
  const code=bundle.output.find(c=>c.type==='chunk'&&c.isEntry).code
    .replace(/from (['"])([^'"]+)\1/g,(_,q,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const {createInhabitedTerraces}=await load('InhabitedTerraces.tsx');
const source=createInhabitedTerraces(),{dwellings,roofBurns,groundVertices}=source.userData;
const xyz=source.getAttribute('position'),rgb=source.getAttribute('color');
const pack=(array,format='f32')=>{
  const b=Buffer.alloc(array.length*(format==='f32'?4:2));
  array.forEach((n,i)=>format==='f32'?b.writeFloatLE(n,i*4):b.writeUInt16LE(n,i*2));
  return b.toString('base64');
};
function table(){
  const values=[],indices=new Map();
  return {values,id(v){
    const key=v.join(',');let id=indices.get(key);
    if(id===undefined){id=values.length/3;indices.set(key,id);values.push(...v);}
    assert(id<65536);return id;
  }};
}
assert.equal(dwellings.length,3);
const houses=dwellings.map((d,i)=>{
  assert(d.begin>=groundVertices&&d.end>d.begin);
  const local=p=>p.map((v,k)=>Math.fround(v-d.center[k]));
  const positions=table(),colors=table(),indices=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let v=d.begin;v<d.end;v++){
    const p=local([xyz.getX(v),xyz.getY(v),xyz.getZ(v)]),c=[rgb.getX(v),rgb.getY(v),rgb.getZ(v)];
    indices.push(positions.id(p),colors.id(c));
    for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
  }
  const {breach,eave,size,seed}=roofBurns[i];
  return {role:d.role,deck:d.center,feet:d.footings.map(local),roof:local(d.roofPeak),bounds:[lo,hi],
    fire:{breach:local(breach),eave:local(eave),size,seed},positions:pack(positions.values),colors:pack(colors.values),triangles:pack(indices,'u16')};
});
const out=JSON.stringify(houses)+'\n';
if(process.argv.includes('--write'))writeFileSync(output,out);
else{
  assert.equal(readFileSync(output,'utf8'),out,'Regenerate the original ridge house export');
  const {createArchivedRidgeHut,ARCHIVED_RIDGE_HUTS}=await load('archivedRidgeHuts.ts');
  for(const [i,d] of dwellings.entries()){
    const g=createArchivedRidgeHut(i),h=ARCHIVED_RIDGE_HUTS[i],p=g.getAttribute('position'),c=g.getAttribute('color');
    assert.equal(p.count,d.end-d.begin);
    for(let j=0;j<p.count;j++)for(let k=0;k<3;k++){
      assert.equal(Math.fround(p.array[3*j+k]+h.deck[k]),xyz.array[3*(d.begin+j)+k]);
      assert.equal(c.array[3*j+k],rgb.array[3*(d.begin+j)+k]);
    }
    for(const key of ['eave','breach'])for(let k=0;k<3;k++)assert(Math.abs(h.fire[key][k]+h.deck[k]-roofBurns[i][key][k])<2e-6);
    g.dispose();
  }
}
console.log('Archived huts: '+houses.map(h=>Buffer.from(h.triangles,'base64').length/12+' triangles').join(', ')+'; '+out.length+' bytes');
