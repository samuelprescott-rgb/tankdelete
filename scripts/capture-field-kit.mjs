// Field-costume acceptance on the mounted game character, not a showroom.
// The only override is an actor-relative camera and fixed full-resolution DPR.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,basename,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const [port,folder,bundle]=process.argv.slice(2);assert(/^\d{4}$/.test(port)&&folder&&bundle);
const origin='http://127.0.0.1:'+port,out=resolve(folder),errors=[],shots=[];
await mkdir(out,{recursive:true});
const plans=process.env.SCOUT_BAG_STUDY==='1' ? [
 ['scout-front','first-vc',[1.22,1.32,-1.38],[0,1.02,0]],
 ['scout-rear','first-vc',[.80,1.28,.98],[0,1.04,.02]],
] : [
 ['pack','us-rifle-2',[.64,1.16,.93],[0,.82,.09]],
 ['helmet','us-rifle-2',[.35,1.35,-.64],[0,1.16,-.025]],
 ['load-bearing','us-rifle-2',[1.56,1.36,-1.74],[0,.74,0]],
 ['radio','us-rto-4',[-.82,1.50,1.12],[0,1.24,.085]],
 ['local-scout','first-vc',[1.22,1.32,-1.38],[0,1.02,0]],
];
const sha=b=>createHash('sha256').update(b).digest('hex');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS.*false|WebGL: INVALID|context lost/i.test(m.text()))errors.push(m.text());});
 const asset=page.waitForResponse(r=>r.url().startsWith(origin+'/assets/')&&/GameSession-.*\.js$/.test(r.url())&&r.ok());
 void asset.catch(()=>{});
 await page.goto(origin+'/?ghostSignal=river');await page.getByRole('button',{name:/^River crossing/i}).click();
 const js=await asset;assert.equal(basename(new URL(js.url()).pathname),basename(bundle));const jsHash=sha(await js.body());
 if(bundle.includes('/'))assert.equal(jsHash,sha(await readFile(resolve(bundle))));
 await page.waitForFunction(()=>{
  if(window.__TAURI_INTERNALS__)throw Error('Simulation browser only');
  const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
  for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
   const o=h.memoizedState?.current;if(o?.name!=='player-tank')continue;
   const st=o.__r3f.root,s=st.getState();if(!s.scene.getObjectByName('us-rifle-2')||!s.scene.getObjectByName('us-rto-4'))return false;
   if(!window.kitStore){window.kitStore=st;st.subscribe(s=>{if(s.viewport.dpr!==1)s.setDpr(1)});s.setDpr(1);}
   return true;
  }return false;
 },null,{timeout:75000});
 await page.addStyleTag({content:'body *:not(:has(canvas)):not(canvas){visibility:hidden!important} canvas[data-game-ui]{visibility:hidden!important}'});
 for(const [id,name,eye,look] of plans){
  const data=await page.evaluate(async({name,eye,look})=>{
   const st=window.kitStore,s=st.getState(),{gl,scene,camera}=s,aim=camera.position.clone();
   let actor=scene.getObjectByName(name);
   if(name==='first-vc'){const choices=[];scene.traverseVisible(o=>{if(o.name.match(/^vc-\d+-\d+$/))choices.push(o)});actor=choices.sort((a,b)=>a.name.localeCompare(b.name))[0];}
   if(!actor)throw Error('No mounted actor: '+name);
   let skin=null;actor.traverseVisible(o=>{if(o.isSkinnedMesh&&o.name.includes('field-infantry-volume'))skin=o;});
   if(!skin)throw Error('No visible weighted infantry body '+actor.name);
   window.releaseKit=s.internal.subscribe({current:()=>{actor.updateWorldMatrix(true,false);camera.position.fromArray(eye).applyMatrix4(actor.matrixWorld);
    aim.fromArray(look).applyMatrix4(actor.matrixWorld);camera.lookAt(aim);camera.updateMatrixWorld();}},.90,st);
   await new Promise(r=>{let f=0;const tick=()=>++f<18?requestAnimationFrame(tick):r();requestAnimationFrame(tick);});
   const face=skin.geometry.userData.fieldPortrait,uv=skin.geometry.getAttribute('fieldFaceUV'),ink=skin.material.userData.fieldPortraitWash,
     semantic=skin.geometry.getAttribute('surfaceKind'),dye=skin.geometry.getAttribute('color');
   let actualFace=0,lo=Infinity,hi=0;
   for(let j=0;j<semantic.count;j++)if(semantic.getX(j)===2){
     actualFace++;const l=.213*dye.getX(j)+.715*dye.getY(j)+.072*dye.getZ(j);lo=Math.min(lo,l);hi=Math.max(hi,l);
   }
   let ocular=0,mapped=0;if(face&&uv)for(let j=face.firstVertex;j<face.firstVertex+face.vertexCount;j++){
     const u=uv.getX(j),v=uv.getY(j);if(Math.min(u,v)>.9995)ocular++;else if(u+v>.001)mapped++;
   }
   const portrait={geometry:face?.mode??(actualFace===6060?'legacy / baked 2020-triangle topology':actualFace===6600?'legacy / procedural 2200-triangle topology':'legacy / unknown'),
     faceTriangles:actualFace/3,facePaintLuma:[lo,hi],mappedVertices:mapped,ocularVertices:ocular,
     pigment:ink?.status??'legacy / vertex paint',plate:ink?.map.value?.name??null,program:skin.material.customProgramCacheKey()};
   return {actor:actor.name,body:skin.name,portrait,bones:skin.skeleton.bones.map(b=>b.name),buffer:[gl.domElement.width,gl.domElement.height],localEye:eye,localLook:look,t:s.clock.elapsedTime,fov:camera.fov};
  },{name,eye,look});
  assert.deepEqual(data.buffer,[1920,1080]);assert(data.bones.length>=11);
  const bytes=await page.screenshot({path:join(out,id+'.png')});
  const stats=await sharp(bytes).stats();assert(stats.entropy>1.8);
  shots.push({id,sha256:sha(bytes),...data});console.log(id,data.actor,data.body,stats.entropy.toFixed(2));
  await page.evaluate(()=>window.releaseKit());
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'kit.json'),JSON.stringify({bundle:basename(bundle),jsHash,mode:'River crossing practice, camera only; HUD hidden; real articulated game characters',shots,errors},null,2));
}finally{await browser.close();}
