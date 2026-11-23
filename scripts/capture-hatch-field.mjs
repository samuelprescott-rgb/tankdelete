// Photograph the production hatch through the normal 1080p chase camera.
// Start Campaign, cannon fire and driving only for the four evidence shots.
// Optional --wood-study probes diffuse pigment after all normal photographs;
// the publication script explicitly rejects those experimental runs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {observeField} from './campaign-journey-qa.mjs';
const port=Number(process.argv[2]),expected=process.argv[3];
assert(Number.isInteger(port)&&port>1023&&port<65536&&port!==1420&&/^GameSession-[\w-]+\.js$/.test(expected));
const origin='http://127.0.0.1:'+port,base=resolve('tmp/visual-review');await mkdir(base,{recursive:true});
const out=await mkdtemp(join(base,'hatch-field-'+port+'-'));console.log(out);
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[];
const report={origin,bundle:expected,method:'Normal campaign through the stock chase camera. Cannon and driving input only. Raw full HUD screenshots; projected lid bounds are in CSS pixels.',shots:{},errors};
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS.*false|context lost/i.test(m.text()))errors.push(m.text());});
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const held=new Set();
async function keys(...want){
  for(const key of [...held])if(!want.includes(key)){await page.keyboard.up(key);held.delete(key);}
  for(const key of want)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
}
async function detail(){
  return page.evaluate(()=>{
    const radar=document.querySelector('canvas[data-game-ui]');if(!radar)return null;
    for(let f=radar[Object.keys(radar).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
      for(let h=f.memoizedState;h;h=h.next){
        const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
        const {scene,camera}=t.__r3f.root.getState(),o=scene.getObjectByName('signal-tunnel-warning')??scene.getObjectByName('spent-signal-hatch');
        if(!o)return null;
        const lid=o.getObjectByName('leafy-bamboo-camouflage'),bank=o.getObjectByName('tunnel-root-lined-shaft');
        const positions=lid.geometry.getAttribute('position'),p=camera.position.clone(),min=[Infinity,Infinity],max=[-Infinity,-Infinity];
        for(let i=0;i<positions.count;i+=2){
          p.fromBufferAttribute(positions,i).applyMatrix4(lid.matrixWorld).project(camera);
          const x=innerWidth*(1+p.x)*.5,y=innerHeight*(1-p.y)*.5;
          min[0]=Math.min(min[0],x);min[1]=Math.min(min[1],y);max[0]=Math.max(max[0],x);max[1]=Math.max(max[1],y);
        }
        return {angle:-lid.parent.rotation.x,site:o.position.toArray(),tank:t.position.toArray(),yaw:t.rotation.y,
          camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),state:o.name,box:[...min,...max].map(Math.round),
          surfaces:[lid,bank].map(n=>({name:n.name,material:n.material.type,receiveShadow:n.receiveShadow}))};
      }
    return null;
  });
}
async function shot(id,seen){
  assert(seen,'No visible hatch to capture');await page.screenshot({path:join(out,id+'.png')});
  report.shots[id]={before:seen,after:await detail()};
  console.log(id,JSON.stringify([seen.site,seen.tank,seen.angle,seen.box]));
}
try{
  await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===origin||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
  await page.goto(origin+'/');await page.getByRole('button',{name:'Start Campaign',exact:true}).click();
  await page.locator('.campaign-brief').waitFor({timeout:90000});
  await page.locator('.weapon-selector button').filter({hasText:'Cannon'}).click();
  const bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\/GameSession-[\w-]+\.js$/.test(n)));
  assert.equal(bundle,origin+'/assets/'+expected);
  if(process.argv.includes('--match-bank')){
    // The revised field starts on the road. Return to the old bank with real
    // driving controls so the hatch picker, raised face and background match.
    let done=false,stepping=0;const stopsAt=Date.now()+42000;
    while(Date.now()<stopsAt&&!done){
      const s=await page.evaluate(observeField);if(!s){await wait(40);continue;}
      const dx=s.x+15,dz=s.z-2.5,dist=Math.hypot(dx,dz),goal=dist>.65?Math.atan2(dx,dz):4.24,err=delta(goal,s.yaw);
      if(dist<=.65&&Math.abs(err)<.035){await keys();await wait(300);done=true;report.matchedBank={x:s.x,z:s.z,yaw:s.yaw};break;}
      const next=[];if(Math.abs(err)>.026)next.push(err>0?'a':'d');
      if(dist>.65&&Math.abs(err)<.23&&(dist>2.25||stepping%4===0))next.push('w');
      await keys(...next);await wait(48);stepping++;
      if(stepping%30===1)console.log('match-bank',s.x.toFixed(2),s.z.toFixed(2),s.yaw.toFixed(3),dist.toFixed(2));
    }
    assert(done,'Could not physically reach the original bank');console.log(report.matchedBank);
  }
  const end=Date.now()+140000;let lastShot=0,target,phase='warning',nearDeadline=0,prevLog='';
  while(Date.now()<end){
    const s=await page.evaluate(observeField);if(!s){await wait(65);continue;}
    const state=s.enemies.length+':'+phase;if(state!==prevLog){console.log(state,s.x,s.z);prevLog=state;}
    const d=(s.tunnel||s.spent)?await detail():null;
    if(phase==='warning'){
      if(d&&s.tunnel&&d.angle<.24){await shot('01-closed',d);phase='lifting';}
      else if(s.enemies.length>10&&Date.now()-lastShot>610){
        const e=s.enemies.filter(e=>e.aim.ok).sort((a,b)=>a.range-b.range)[0];
        if(e){await page.mouse.click(e.aim.x,e.aim.y);lastShot=Date.now();}
      }
    }else if(phase==='lifting'&&d&&d.angle>.51&&d.angle<1.39){await shot('02-lifting',d);phase='open';}
    else if(phase==='open'&&d&&s.spent&&d.angle>1.5){await shot('03-open',d);target=s.spent;phase='approach';nearDeadline=Date.now()+23000;}
    else if(phase==='approach'){
      const dist=Math.hypot(s.x-target.x,s.z-target.z),err=delta(Math.atan2(s.x-target.x,s.z-target.z),s.yaw);
      if((dist<4.5||Date.now()>nearDeadline)&&d){
        await keys();await wait(370);await shot('04-driven-close',await detail());report.closeRange=dist;
        if(process.argv.includes('--wood-study')){
          // Optional look-development only, AFTER all four normal photos. The
          // candidate stills for the handoff must always come from a frozen
          // unmodified production run without this flag.
          report.study={};
          for(const factor of [1,1.8,2.3,3]){
            await page.evaluate(factor=>{
              const c=document.querySelector('canvas[data-game-ui]');
              for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
                for(let h=f.memoizedState;h;h=h.next){
                  const t=h.memoizedState?.current;if(t?.name!=='player-tank')continue;
                  const g=t.__r3f.root.getState().scene.getObjectByName('leafy-bamboo-camouflage').geometry,col=g.attributes.color;
                  const original=g.userData.lookStudyAlbedo??=col.array.slice();
                  for(let i=0;i<(15*4+8*7)*30*3;i++)col.array[i]=factor*original[i];col.needsUpdate=true;return;
                }
              throw Error('No live mat for the optional look study');
            },factor);
            await wait(180);report.study[factor]={before:await detail()};await page.screenshot({path:join(out,'study-'+factor+'.png')});
            report.study[factor].after=await detail();
          }
        }
        break;
      }
      const steer=[];if(Math.abs(err)>.045)steer.push(err>0?'a':'d');if(Math.abs(err)<.27)steer.push('w');await keys(...steer);
    }
    await wait(60);
  }
  assert.equal(Object.keys(report.shots).length,4,'All opening phases and a natural drive-up are required');
  assert(report.shots['03-open'].before.angle>1.50);assert.deepEqual(errors,[]);
  assert(report.closeRange<10,'Drive-up did not reach the hatch');
  report.pass=true;
}finally{await keys();await writeFile(join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
