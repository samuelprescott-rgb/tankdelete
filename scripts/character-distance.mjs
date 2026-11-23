// Production game, synthetic files only. The camera is never reassigned or
// aimed at an actor. Keyboard steering is the same input available to a player.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const [port,out,mode,expected,matched]=process.argv.slice(2);
assert(/^\d{4}$/.test(port)&&['day','night'].includes(mode)&&/^GameSession-[\w-]+\.js$/.test(expected));
const match=matched?JSON.parse(await readFile(matched,'utf8')).shots:null;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const errors=[],shots={},trace=[];let setup;
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS.*false|compileShader.*failed/i.test(m.text()))errors.push(m.text());});
  const origin='http://127.0.0.1:'+port;
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
  await page.goto(origin+(mode==='night'?'/?ghostSignal=embassy':'/'));
  await page.getByRole('button',{name:mode==='night'?/^Embassy approach/i:/^Start Campaign$/}).click();
  await page.waitForFunction(()=>{
    if(window.__TAURI_INTERNALS__)throw Error('Virtual game required');
    const el=document.querySelector('canvas[data-game-ui]');if(!el)return false;
    for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState;h;h=h.next){
      const obj=h.memoizedState?.current;if(obj?.name==='player-tank'){window.field=obj.__r3f.root;window.unit=obj;return true;}
    }return false;
  },null,{timeout:90000});
  setup=await page.evaluate(()=>({bundle:performance.getEntriesByType('resource').map(r=>r.name).find(u=>/\/GameSession-[\w-]+\.js/.test(u)),
    tank:window.unit.position.toArray(),yaw:window.unit.rotation.y,camera:window.field.getState().camera.uuid}));
  assert.equal(setup.bundle,origin+'/assets/'+expected);
  if(mode==='night'){
    // Turn towards the first wave entering from beyond the tank, not the wall.
    await page.keyboard.down('d');
    try {await page.waitForFunction(()=>Math.atan2(Math.sin(window.unit.rotation.y),Math.cos(window.unit.rotation.y))<-2.22,null,{timeout:6500,polling:20});}
    finally {await page.keyboard.up('d');}
  }
  await page.evaluate(({mode,match})=>{
    const store=window.field,s=store.getState(),{scene,camera,gl}=s,gun=scene.getObjectByName('tank-crew-station'),
      heads=scene.getObjectByName('nightmare-undead-heads'),eyes=scene.getObjectByName('nightmare-undead-red-eyes'),
      mat=camera.matrix.clone(),p=camera.position.clone(),v=p.clone(),f=p.clone(),lens=camera.uuid;
    const sample=document.createElement('canvas');sample.width=40;sample.height=24;const read=sample.getContext('2d',{willReadFrequently:true});
    const scouts=[];scene.traverse(o=>{if(/^vc-\d+-\d+$/.test(o.name))scouts.push(o);});
    const pic={},survey=[];let previous=-Infinity,epoch=null;
    const screen=p=>{v.copy(p).project(camera);return [(v.x+1)*960,(1-v.y)*540,v.z];};
    const viable=k=>k[2]>0&&k[2]<1&&k[0]>190&&k[0]<1580&&k[1]>134&&k[1]<950;
    function pick(label,score,rec){
      if(match?.[label]){const ref=match[label];if(ref.id!==rec.id)return;
        score=Math.abs(ref.distance-rec.distance)+.012*Math.abs(ref.t-rec.t)
          +.52*Math.hypot(ref.world[0]-rec.world[0],ref.world[2]-rec.world[2])
          +(ref.facing==null?0:1.4*Math.abs(ref.facing-rec.facing));}
      if(pic[label]&&pic[label].score<score+.12)return;
      pic[label]={...rec,score,eyePixels:rec.eyePixels,frame:gl.domElement.toDataURL('image/png')};
    }
    const stop=s.internal.subscribe({current:()=>{
      const now=performance.now()/1000;if(epoch===null)epoch=now;if(now-previous<.16)return;previous=now;
      const t=now-epoch, buf=[gl.domElement.width,gl.domElement.height];
      const base={t,buf,camera:camera.position.toArray(),dir:camera.getWorldDirection(f).toArray(),
        fov:camera.fov,unalteredLens:camera.uuid===lens,tank:window.unit.position.toArray(),yaw:window.unit.rotation.y};
      const actors=[];
      if(mode==='day'){
        for(const o of [gun,...scouts]){
          if(!o||!o.visible)continue;let so=o;while(so&&so.visible)so=so.parent;if(so)continue;
          const ref=o===gun?.37:.59;p.set(0,ref,0).applyMatrix4(o.matrixWorld);const uv=screen(p),distance=camera.position.distanceTo(p);
          actors.push([o.name,+distance.toFixed(2),uv.slice(0,2)]);
          if(!viable(uv))continue;
          const rec={...base,id:o.name,distance,center:uv.slice(0,2),world:p.toArray()};
          if(o===gun&&t>.85)pick('gunner',Math.abs(t-1.6),rec);
          if(o!==gun&&t>1&&distance>5&&distance<35)pick('scout',Math.abs(distance-12)+Math.abs(uv[0]-990)*.00026,rec);
        }
      }else if(eyes&&heads){
        for(let k=0;k<heads.count;k++){
          heads.getMatrixAt(k,mat);if(mat.elements[5]<.55)continue;mat.premultiply(heads.matrixWorld);
          p.setFromMatrixPosition(mat);const uv=screen(p),world=p.toArray(),distance=camera.position.distanceTo(p);
          if(!viable(uv)||distance<6||distance>36)continue;
          const facing=f.set(0,0,-1).transformDirection(mat).dot(v.copy(camera.position).sub(p).normalize());
          const sockets=[0,1].map(side=>{eyes.getMatrixAt(k*2+side,mat);mat.premultiply(eyes.matrixWorld);return screen(p.setFromMatrixPosition(mat)).slice(0,2);});
          actors.push([k,+distance.toFixed(2),+facing.toFixed(2),uv.slice(0,2)]);
          if(facing<.27)continue;
          const x=Math.round(sockets[0][0]*buf[0]/1920)-20,y=Math.round(sockets[0][1]*buf[1]/1080)-12;
          read.drawImage(gl.domElement,x,y,40,24,0,0,40,24);
          const pix=read.getImageData(0,0,40,24).data, eyePixels=[0,0],maxRed=[0,0];
          for(let i=0;i<pix.length;i+=4){const r=pix[i],g=pix[i+1],b=pix[i+2];if(!(r>103&&r>g*1.65&&r>b*1.55))continue;
            const px=(x+i/4%40+.5)*1920/buf[0],py=(y+Math.floor(i/160)+.5)*1080/buf[1];
            const ds=sockets.map(u=>Math.hypot(u[0]-px,u[1]-py)),j=ds[0]<ds[1]?0:1;
            if(ds[j]<=2.7){eyePixels[j]++;maxRed[j]=Math.max(maxRed[j],r);}
          }
          const rec={...base,id:k,distance,center:uv.slice(0,2),world,sockets,eyePixels,maxRed,facing};
          for(const d of [11,16,24])if(Math.abs(d-distance)<3.5)
            pick('undead-'+d,Math.abs(d-distance)+(1-facing)*2,rec);
          // A second honest view of the same route: a face turning toward the
          // driver, not an assumption that a far eye should pierce a profile.
          if(facing>=.6&&distance>12.5&&distance<20)
            pick('undead-turn',Math.abs(distance-16)*.55+(1-facing)*10,rec);
        }
      }
      survey.push({t,actors});window.captureTime=t;
    }},10,store);
    Object.assign(window,{pics:pic,survey,stopCharacterCapture:stop});
  },{mode,match});
  const span=mode==='night'?31:12;
  await page.waitForFunction(n=>window.captureTime>=n,span,{timeout:(span+40)*1000,polling:155});
  await page.evaluate(()=>window.stopCharacterCapture());
  const result=await page.evaluate(()=>({pics:window.pics,survey:window.survey}));trace.push(...result.survey);
  for(const [k,v] of Object.entries(result.pics)){const {frame,...meta}=v;
    await writeFile(join(out,k+'.png'),Buffer.from(frame.split(',')[1],'base64'));shots[k]=meta;}
  await page.screenshot({path:join(out,'player-with-hud.jpg'),quality:93});
  console.log(JSON.stringify({mode,shots:Object.fromEntries(Object.entries(shots).map(([k,v])=>[k,[v.id,v.distance,v.eyePixels,v.buf]])),errors}));
  assert.deepEqual(errors,[]);assert(Object.keys(shots).length>0,'No visible actor for the declared route');
} finally {
  await writeFile(join(out,'receipt.json'),JSON.stringify({mode,expected,setup,shots,trace,errors,
    evidence:'Real production world pixels at actual screen distance before HUD compositing; normal camera, FOV and adaptive resolution. Night D-key pivot only. No actor placed or posed for photography. Selection by distance and facing, not by color.'}));
  await browser.close();
}
