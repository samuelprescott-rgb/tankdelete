import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// Called only after the real horde wave fixture has completed waves 1-3.
// No QA spawning: wait for the boss to naturally display its round in-game.
export async function photoSundae(page,version){
  const out=resolve('../TankDelete-Concepts/pixel-ascii-02/fx-'+version);
  await mkdir(out,{recursive:true});
  await page.evaluate(()=>{
    const store=window.__photoStore,s=store.getState(),c=s.camera;
    const boss=s.scene.getObjectByName('nightmare-boss-sculpt'),tank=s.scene.getObjectByName('player-tank');let cone;
    s.scene.traverse(o=>{
      const kids=o.children;if(!o.isGroup||kids.length!==3)return;
      if(kids[0].position.y===-.12&&kids[1].position.y===.22&&kids[2].position.y===.22&&kids[0].isMesh)cone=o;
    });
    if(!cone)throw Error('Real boss projectile was not mounted');
    s.internal.subscribe({current:()=>{const live=store.getState();if(live.viewport.dpr!==1)live.setDpr(1);}},.4,store);
    // Photographic staging: move only the virtual player into the existing boss
    // attack range. Never set a target, mutate its AI, or synthesize a round.
    const spawn=s.camera.position.clone().setFromMatrixPosition(boss.matrixWorld);
    const away=tank.position.clone().sub(spawn);away.y=0;away.normalize();
    const tankBefore=tank.position.toArray();tank.position.x=spawn.x+away.x*12.5;tank.position.z=spawn.z+away.z*12.5;
    s.internal.subscribe({current:()=>{
      if(window.sundaeImage||!cone.visible)return;
      cone.updateWorldMatrix(true,false);const m=cone.matrixWorld.elements;
      const sc=Math.hypot(m[0],m[1],m[2]);if(sc<.90)return;
      const aim=c.position.clone().setFromMatrixPosition(cone.matrixWorld),b=c.position.clone().setFromMatrixPosition(boss.matrixWorld);
      const dir=aim.clone().sub(b);dir.y=0;dir.normalize();
      const eye=aim.clone().addScaledVector(dir,2.75*sc);eye.y+=.53*sc;aim.y+=.035*sc;
      c.position.copy(eye);c.lookAt(aim);c.updateMatrixWorld();
      window.sundaeStamp={localClock:s.clock.elapsedTime,eye:eye.toArray(),aim:aim.toArray(),scale:sc,
        tankBefore,stagedTank:tank.position.toArray(),stagedRange:12.5,
        origin:location.origin,geometry:cone.children.map(o=>o.geometry.name||o.geometry.type),
        bundle:performance.getEntriesByType('resource').map(e=>e.name).find(u=>/\/GameSession-[\w-]+\.js/.test(u))};
    }},.6,store);
    s.internal.subscribe({current:()=>{
      if(window.sundaeImage||!window.sundaeStamp)return;
      const gl=s.gl.domElement,canvas=document.createElement('canvas');
      if(gl.width!==1920||gl.height!==1080)throw Error('Boss photo viewport is not native 1920x1080');
      canvas.width=Math.round(gl.width*940/1920);canvas.height=Math.round(gl.height*620/1080);
      canvas.getContext('2d').drawImage(gl,Math.round((gl.width-canvas.width)/2),Math.round((gl.height-canvas.height)/2),canvas.width,canvas.height,0,0,canvas.width,canvas.height);
      window.sundaeImage={crop:canvas.toDataURL(),full:gl.toDataURL()};s.setFrameloop('never');
    }},10,store);
  });
  await page.waitForFunction(()=>window.sundaeImage,null,{timeout:42000});
  const {images,signature}=await page.evaluate(()=>({images:window.sundaeImage,signature:window.sundaeStamp}));
  for(const [key,suffix] of [['full','-full'],['crop','']])await writeFile(out+'/doom-sundae'+suffix+'.png',Buffer.from(images[key].split(',')[1],'base64'));
  await writeFile(out+'/sundae-capture.json',JSON.stringify(signature,null,2));
  return signature;
}
