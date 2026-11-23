// Isolated browser, standard guard spawn, ordinary mouse/keys for wave one.
// No native bridge, state injections, camera overrides, files, or clock jumps.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const [port,folder]=process.argv.slice(2);
assert.ok(/^\d{4,5}$/.test(port)&&port!=='1420'&&folder);
const {chromium}=createRequire(import.meta.url)('playwright'),out=resolve(folder);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']});
const ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await ctx.newPage(),errors=[],images=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|WebGLProgram.*ERROR/i.test(m.text()))errors.push(m.text());});
try{
  await page.goto('http://127.0.0.1:'+port+'/');
  assert.equal(await page.evaluate(()=>!!window.__TAURI_INTERNALS__),false);
  await page.getByRole('button',{name:'Tune hidden Horde channel'}).click();
  await page.waitForFunction(()=>{
    const c=document.querySelector('canvas[data-game-ui]');if(!c)return false;
    let t,r;
    for(let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return){
      if(f.memoizedProps?.zombiePosesRef?.current instanceof Map)r=f.memoizedProps;
      for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.name==='player-tank')t=h.memoizedState.current;
    }
    if(!t||!r)return false;
    const store=t.__r3f.root,st=store.getState(),bird=st.scene.getObjectByName('rook-relief-transport');
    if(!bird?.getObjectByName('seated-door-gunner'))return false;
    const B=st.gl.domElement.getBoundingClientRect(),xyz=t.position.clone();
    const project=o=>{const v=o.getWorldPosition(xyz).project(st.camera);return [v.x,v.y,v.z];};
    window.__relief=()=>{
      const targets=[...r.zombiePosesRef.current.values()].filter(z=>z.active).map(z=>{
        const p=z.position.clone();p.y=0;p.project(st.camera);
        const x=(p.x+1)*B.width/2,y=(1-p.y)*B.height/2;
        return {x,y,z:p.z,world:z.position.toArray(),range:z.position.distanceTo(t.position),hit:document.elementFromPoint(x,y)===st.gl.domElement};
      }).sort((a,b)=>a.range-b.range);
      const passengers=['amber','wren','cedar','moss'].flatMap(id=>{const o=st.scene.getObjectByName('lift-'+id);
        return o?.visible?[{id,xyz:o.position.toArray(),ndc:project(o)}]:[];});
      return {phase:document.querySelector('.nightmare-order')?.className,title:document.querySelector('.nightmare-order')?.innerText,
        yaw:t.rotation.y,spawn:t.position.toArray(),targets,passengers,air:bird.visible,altitude:bird.position.y,side:project(bird),
        gunner:project(bird.getObjectByName('seated-door-gunner')),filmTime:bird.userData.flightTime,
        practice:false,buffer:[st.gl.domElement.width,st.gl.domElement.height],camera:st.camera.position.toArray()};
    };
    return true;
  },null,{timeout:90000});
  const sample=()=>page.evaluate(()=>window.__relief()),heading=(await sample()).yaw;
  let last=0,lastEagle=0,rot='',previous='';
  const steer=async(angle,current)=>{
    const diff=Math.atan2(Math.sin(angle-current),Math.cos(angle-current)),next=Math.abs(diff)<.055?'':diff>0?'a':'d';
    if(next!==rot){if(rot)await page.keyboard.up(rot);if(next)await page.keyboard.down(next);rot=next;}
  };
  const end=Date.now()+180000;
  while(Date.now()<end){
    const s=await sample(),stamp=Date.now();
    const stage=s.title?.split('\n').slice(0,3).join(' · ');
    if(stage!==previous){previous=stage;console.log(stage);}
    if(s.air||s.passengers.length){
      await steer(heading,s.yaw);
      const name=s.passengers.length===4?'squad':s.passengers.length>=1?'door':s.altitude<1.22?'skids':null;
      if(name&&!images.some(i=>i.name===name)){
        await page.screenshot({path:join(out,'rook-'+name+'.png'),timeout:60000});
        images.push({name,...s,targets:s.targets.length});console.log('captured',name,s.side,s.passengers.length);
      }
      if(images.some(i=>i.name==='squad'))break;
    }else if(s.phase?.includes('intermission')){
      await steer(heading,s.yaw);
      if(!rot){const b=page.locator('.field-kit__proceed');if(await b.isEnabled())await b.click();}
    }else if(s.phase?.includes('combat')){
      const v=s.targets.find(z=>z.hit&&z.z>0&&z.z<1&&z.x>30&&z.x<1880&&z.y>30&&z.y<1045);
      if(v){
        await steer(s.yaw,s.yaw);await page.mouse.move(v.x,v.y);
        const eagle=page.getByRole('button',{name:'Arm Eagle Strafe target designator',exact:true});
        if(s.targets.length>=3&&stamp-lastEagle>7000&&await eagle.isVisible()&&await eagle.isEnabled()){
          await eagle.click();await page.mouse.click(v.x,v.y);lastEagle=last=stamp;
        }else if(stamp-last>750){await page.mouse.click(v.x,v.y);last=stamp;}
      }else if(s.targets.length){
        const o=s.targets[0].world;await steer(Math.atan2(s.spawn[0]-o[0],s.spawn[2]-o[2]),s.yaw);
      }else await steer(heading,s.yaw);
    }
    if(s.phase?.includes('defeat'))break;
    await page.waitForTimeout(85);
  }
  assert.ok(images.some(i=>i.name==='squad'),'no natural second-wave squad captured');
  assert.deepEqual(errors,[]);
}finally{
  await writeFile(join(out,'horde-chase.json'),JSON.stringify({images,errors},null,2));
  await ctx.close();await browser.close();
}
