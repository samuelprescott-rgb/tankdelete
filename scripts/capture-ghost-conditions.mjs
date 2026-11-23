// Unstaged ~6 second capture of the actual Embassy practice chase. Start after
// renderer/HUD become ready. Do not freeze the camera, simulation or weather.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,basename,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const {chromium}=createRequire(import.meta.url)('playwright'),[port,dir,bundle,mode='embassy']=process.argv.slice(2);
assert(/^\d{4}$/.test(port)&&dir&&bundle&&['embassy','river'].includes(mode));const out=resolve(dir),origin='http://127.0.0.1:'+port;
await mkdir(out,{recursive:true});const temp=await mkdtemp(join(tmpdir(),'ghost-shotfilm-')),errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(/Shader Error|VALIDATE_STATUS.*false|context lost/i.test(e.text()))errors.push(e.text());});
 const js=page.waitForResponse(r=>r.url().startsWith(origin+'/assets/')&&/GameSession-.*\.js$/.test(r.url())&&r.ok());void js.catch(()=>{});
 await page.goto(origin+'/?ghostSignal='+mode);
 await page.getByRole('button',{name:mode==='embassy'?/^Embassy approach/i:/^River crossing/i}).click();
 const asset=await js;assert.equal(basename(new URL(asset.url()).pathname),basename(bundle));const hash=b=>createHash('sha256').update(b).digest('hex');
 assert.equal(hash(await asset.body()),hash(await readFile(resolve(bundle))));
 await page.waitForFunction(m=>{
  if(window.__TAURI_INTERNALS__)throw Error('Browser practice only');
  const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
  for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
   const o=h.memoizedState?.current;if(o?.name!=='player-tank')continue;
   const store=o.__r3f.root,s=store.getState();if(!s.scene.getObjectByName(m==='embassy'?'ghost-signal-horde-rain':'winding-river-water'))return false;
   if(s.clock.elapsedTime>3.8&&!document.querySelector('.nightmare-transition')){window.conditionsStore=store;return true;}
  }return false;
 },mode,{timeout:75000});
 const meta=()=>page.evaluate(()=>{const s=window.conditionsStore.getState(),c=s.gl.domElement;
  // Read endpoints only, outside the recorded interval. Skinning the real
  // indexed vertices measures wardrobe scale in the normal HUD view, not
  // the unposed bind box or the metre-high health sprite above the head.
  const a=s.scene.getObjectByName('us-rifle-3'),p=s.camera.position.clone(),squad=[];
  a?.traverseVisible(o=>{if(!o.isSkinnedMesh||!o.name.includes('field-infantry-volume'))return;
    const b=[Infinity,Infinity,-Infinity,-Infinity];let count=0;
    for(let i=0;i<o.geometry.attributes.position.count;i++){
      o.getVertexPosition(i,p).applyMatrix4(o.matrixWorld).project(s.camera);if(p.z<0||p.z>=1)continue;
      const x=(.5+.5*p.x)*innerWidth,y=(.5-.5*p.y)*innerHeight;b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);
      b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);count++;}
    if(count)squad.push({name:a.name,projected:b.map(Math.round),pxTall:Math.round(b[3]-b[1]),actorXYZ:a.getWorldPosition(p).toArray()});});
  return {time:s.clock.elapsedTime,buffer:[c.width,c.height],eye:s.camera.position.toArray(),yaw:s.camera.quaternion.toArray(),squad};});
 const first=await meta(),session=await page.context().newCDPSession(page),frames=[];
 session.on('Page.screencastFrame',f=>{void session.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});frames.push({t:f.metadata.timestamp,data:f.data});});
 await session.send('Page.startScreencast',{format:'jpeg',quality:88,maxWidth:1920,maxHeight:1080,everyNthFrame:2});
 await page.waitForFunction(t=>window.conditionsStore.getState().clock.elapsedTime>=t+6,first.time,{timeout:25000});
 await session.send('Page.stopScreencast');const last=await meta();
 assert(frames.length>=15&&frames.at(-1).t-frames[0].t>4.6,'No real motion segment');
 const list=[];
 for(const [i,f] of frames.entries()){const name='f-'+i+'.jpg';await writeFile(join(temp,name),Buffer.from(f.data,'base64'));
  list.push("file '"+name+"'","duration "+Math.max(.001,(frames[i+1]?.t??f.t+.04)-f.t).toFixed(5));}
 await writeFile(join(temp,'durations.txt'),list.join('\n')+'\n');
 const film=mode+'-player.mp4',r=spawnSync(process.env.FFMPEG??'/opt/homebrew/bin/ffmpeg',['-loglevel','error','-y','-f','concat','-safe','1','-i','durations.txt','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',join(out,film)],{cwd:temp});
 assert.equal(r.status,0,r.stderr?.toString());assert.deepEqual(errors,[]);
 await writeFile(join(out,mode+'-film.json'),JSON.stringify({bundle:basename(bundle),source:asset.url(),first,last,realSeconds:frames.at(-1).t-frames[0].t,frames:frames.length,film,errors,kind:'Normal production practice chase; gameplay, shaders, time, weather and ordinary adaptive resolution unmodified. Film is not used for frame-time qualification.'},null,2));
 console.log(mode,frames.length,last.time-first.time,film);
}finally{await browser.close();}
