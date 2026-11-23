// CPU-only survey: use the real meshes, settled production chase lens and
// rotated fixture huts. Even the transparent parts of a spray count as solid.
const assert=require('node:assert/strict'),fs=require('node:fs'),T=require('three'),ts=require('typescript');
const React=require('react'),{renderToString}=require('react-dom/server');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>{
  const source=fs.readFileSync(f,'utf8').replaceAll('import.meta.env.DEV','false');
  m._compile(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);
};
const {createBankFigGeometry,BANK_FIG_FOOT}=require('../src/components/Scene/OldBankFig');
const {TRAINING_DIRECTORY,createTrainingEntries}=require('../src/lib/training');
const {CAMPAIGN_ROOT,createCampaignFixtures}=require('../src/lib/campaignFixtures');
const {createFileObjective}=require('../src/lib/mission'),{createSectorPage}=require('../src/lib/sectorPaging');
const {useFileBlocks}=require('../src/hooks/useFileBlocks'),{villageHutYaw,villageStructureVariant}=require('../src/lib/layout');
const {createStructureGeometry}=require('../src/components/Scene/FileBlocks');
const {DAY_OUT,transportPose}=require('../src/lib/campaignFlights');
const {isInsidePaddy}=require('../src/components/Scene/VietnamEnvironment');
const foot=new T.Vector3(...BANK_FIG_FOOT),geo=createBankFigGeometry(),world=[],tria=new T.Triangle();
assert(!isInsidePaddy(foot.x,foot.z,.2),'The bole is planted on the dry verge');
for(const g of Object.values(geo)){
  assert(g.boundingBox&&g.boundingSphere&&g.index);
  const pts=Array.from({length:g.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(g.attributes.position,i).add(foot));
  for(let i=0;i<g.index.count;i+=3)world.push([pts[g.index.getX(i)],pts[g.index.getX(i+1)],pts[g.index.getX(i+2)]]);
}
assert(world.length<3400);
const all=world.flat(),minClear=Math.min(...all.filter(v=>v.x<3.2).map(v=>v.y));
assert(minClear>6,'High fingers may reach over the camera margin; the bridge lane stays clear below');
const bounds=new T.Box3().setFromPoints(all),base=new T.Box3().setFromPoints(all.filter(p=>p.y<2.1));
assert(base.min.x>10.5&&base.max.z<7.46,'Roots and low trunk clear the driveway and village yards');
for(let time=0;time<=DAY_OUT;time+=.125){
  const pose=transportPose(time);if(pose.visible)assert(bounds.distanceToPoint(new T.Vector3(pose.x,pose.y,pose.z))>8);
}
const cam=new T.PerspectiveCamera(60,16/9,.1,340);
// Camera captures in the R8 gallery (1920x1080). Projection happens in
// screen pixels; the sun checks below use an intentionally opaque full card.
const views=[
  ['chase',[-3.3420837179851945,2.9436660774289405,-1.9771749419277562],[.009036125949293506,.9893722639624047,.0704686524154229,-.1268662317422903]],
  ['bank',[-10.3,2.4,10.1],[.008788878896940105,.8689681064773693,.015442869383131571,-.49454898980595013]],
];
const rect=(x,y)=>new T.Box3(new T.Vector3(x,y,-.1),new T.Vector3(1920,1080,.1));
for(const [name,eye,rotation] of views){
  cam.position.fromArray(eye);cam.quaternion.fromArray(rotation);cam.updateMatrixWorld();
  const pixels=p=>{const v=p.clone().project(cam);return v.set((1+v.x)*960,(1-v.y)*540,0);};
  const origin=new T.Vector3(),near=new T.Vector3(),excluded=name==='chase'?[rect(490,220),rect(164,300)]:[rect(480,0)];
  let sun=Infinity;
  for(const face of world){
    const v=face.map(pixels);tria.set(...v);
    excluded.forEach(box=>assert(!box.intersectsTriangle(tria),name+' fig encroaches on the open view'));
    if(name==='chase'){
      for(const p of v)p.set((p.x-556)/42,(p.y-105)/18,0);
      tria.set(...v).closestPointToPoint(origin,near);sun=Math.min(sun,near.length());
    }
  }
  if(name==='chase'){assert(sun>1.3);console.log('solar disk clearance, including opaque spray margins:',sun.toFixed(2),'radii');}
}
const fixtures=createCampaignFixtures();
for(const [dir,entries] of [[TRAINING_DIRECTORY,createTrainingEntries()],[CAMPAIGN_ROOT,fixtures.directories.get(CAMPAIGN_ROOT).children]]){
  const objective=createFileObjective(entries,dir),page=createSectorPage(entries,0,objective?.targets[0].path);
  let huts;function Load(){huts=useFileBlocks(page.entries,objective,page.layoutEntries).allBlocks;return null;}
  renderToString(React.createElement(Load));assert(huts.length>0);
  for(const h of huts){
    const g=createStructureGeometry(h.category,villageStructureVariant(h.path)),mesh=new T.Mesh(g);
    mesh.position.fromArray(h.position);mesh.scale.setScalar(h.scale);mesh.rotation.y=villageHutYaw(h.path,h.position[0],h.position[2]);
    mesh.updateMatrixWorld();g.computeBoundingBox();
    const box=g.boundingBox.clone().expandByScalar(.12/h.scale),inverse=mesh.matrixWorld.clone().invert();
    if(bounds.intersectsBox(box.clone().applyMatrix4(mesh.matrixWorld)))for(const face of world){
      tria.set(...face.map(v=>v.clone().applyMatrix4(inverse)));
      assert(!box.intersectsTriangle(tria),'Fig overlaps hut or 12 cm extra clearance: '+h.path);
    }
    g.dispose();
  }
  console.log(dir,huts.length,'rotated hut bounds clear with 0.12m additional margin');
}
console.log('Fig survey:',world.length,'triangles, lowest canopy/wood above bridge lane',minClear.toFixed(2),'m');
Object.values(geo).forEach(g=>g.dispose());
