// Identify the *actual visible authored surface* under a fixed-camera QA
// pixel. Legacy talus, the new root stools, water, and props overlap. A
// change to the wrong mesh can pass all local geometry unit tests.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const [port,folder]=process.argv.slice(2),out=resolve(folder);
const receipt=JSON.parse(await readFile(join(out,'receipt.json'),'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.goto('http://127.0.0.1:'+port+'/?ghostSignal=river');await page.getByRole('button',{name:/^River crossing/i}).click();
 await page.waitForFunction(()=>{const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
  for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const t=h.memoizedState?.current;if(t?.name==='player-tank'){const s=t.__r3f.root.getState();
     if(s.clock.elapsedTime>5 && s.scene.getObjectByName('low-shale-and-wet-river-stones')){window.fieldProbe=s;return true;}}}return false;
 },undefined,{timeout:60000});
 const picks=[];
 for(const id of ['river-bank','river-chase']){
  const shot=receipt.shots.find(x=>x.id===id);assert(shot);
  const coords=id==='river-bank'?[[1090,935],[1120,963],[1168,966],[1200,980],[1205,1040],[1240,1020],[1260,1050],[1310,970],[1290,985],[1260,925],[1280,950],[995,1005],[1160,890]]:
   [[1125,954],[1200,971],[1232,944],[1270,980],[1290,1005],[1320,955],[1342,1020],[1370,1042],[1360,964],[1420,1020]];
  const result=await page.evaluate(({shot,coords})=>{const s=window.fieldProbe,cam=s.camera.clone(),ray=new s.raycaster.constructor();
    cam.position.fromArray(shot.eye);cam.quaternion.fromArray(shot.quaternion);cam.fov=shot.verticalFov;cam.aspect=16/9;cam.updateProjectionMatrix();cam.updateMatrixWorld();
    const meshes=[];s.scene.updateMatrixWorld(true);s.scene.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.geometry?.attributes.position?.count>0)meshes.push(o);});
    if(meshes.length<10)throw Error("Missing meshes "+meshes.length);ray.near=0;ray.far=100;ray.layers.enableAll();return coords.map(([x,y])=>{ray.setFromCamera({x:x/960-1,y:1-y/540},cam);return {x,y,hits:ray.intersectObjects(meshes,false).filter(h=>!h.object.name.includes('mist')).slice(0,4).map(h=>{
      const g=h.object.geometry,ix=h.face.a;
      return {name:h.object.name,figure:g.attributes.bankFigure?.getX(ix),shader:h.object.material.type,distance:+h.distance.toFixed(2),xyz:h.point.toArray().map(n=>+n.toFixed(3))};
    })};});},{shot,coords});picks.push({id,result});
 }
 await writeFile(join(out,'field-picks.json'),JSON.stringify(picks,null,2));
 assert(picks.every(v=>v.result.some(p=>p.hits.length)),'No surface hits');for(const view of picks)console.log(view.id,view.result.map(p=>p.x+':'+p.y+'='+p.hits.map(h=>h.name+'['+(h.figure??'')+']').slice(0,2).join('>')).join('\n'));
}finally{await browser.close();}
