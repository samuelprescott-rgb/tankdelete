import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {build} from 'vite';

const dir=fileURLToPath(new URL('../',import.meta.url)),entry=dir+'command-print-fixture.mjs';
const bundle=await build({root:dir,configFile:false,publicDir:false,logLevel:'silent',
  plugins:[{name:'command-print-fixture',resolveId:id=>id===entry?id:null,load:id=>id===entry?
    `export * from '${dir}src/components/Scene/commandPortraitMasks';export {commandSkull} from '${dir}src/components/Scene/commandCreature';`:null}],
  build:{ssr:entry,write:false,minify:false,rollupOptions:{output:{format:'es'}}}});
const src=bundle.output.find(x=>x.isEntry).code.replace(/from "([^"]+)"/g,(_,id)=>'from '+JSON.stringify(import.meta.resolve(id)));
const game=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
assert.deepEqual(game.COMMAND_MASK_PRINTS,['/images/nightmare-boss-kamala-texture.png','/images/nightmare-boss-biden-texture.png']);
for(const [i,uri] of game.COMMAND_MASK_PRINTS.entries()){
  const file=await readFile(dir+'public'+uri);assert.equal(file.readUInt32BE(16),[640,600][i]);assert.equal(file[25],6,'RGBA original portrait, not a rectangular opaque substitute');
  assert.equal(createHash('sha256').update(file).digest('hex'),[
    '0b0e581fe9ef3564f1c53c0e4b50e86827291757c16678007c8171ab0a59933d',
    'd53ca2b1e94a9d2746ac6c70327184524b4776b30c7c9ff53b9be6412ece114c',
  ][i],'Exact portrait bytes matching the original game commit 95b5431');
}
const masks=game.createCommandPortraitMasks(),scene=new THREE.Group();scene.add(masks.root);
const heads=[false,true].map(rear=>{const m=new THREE.Mesh(game.commandSkull(rear),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));scene.add(m);return m;});
const hp={id:'wave-four',alive:true,health:1000,maxHealth:1000};
const simulate=(health,headsPresent=true,dt=1/60,alive=true)=>masks.sync({...hp,health,alive},headsPresent?heads:null,dt,1,0);
// Check front print occludes the underlying model at both real orbit sites
// and nose. No eye-through skin and no nameless second front left after drop.
for(let i=0;i<2;i++){
  const mesh=masks.pieces[i].mesh;mesh.material.visible=true;
  const kinds=mesh.geometry.getAttribute('maskSide').array;assert([0,1,2,3].every(k=>kinds.includes(k)),'front print, reverse fibre, thickness and woven band');
  for(const [x,y] of [[-.080,.085],[.082,.085],[0,.01]])for(const yaw of [0,.35,-.35]){
    const target=new THREE.Vector3(x,y,-.18),toward=new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw));
    const ray=new THREE.Raycaster(target.clone().addScaledVector(toward,2),toward.negate());
    const paper=ray.intersectObject(mesh)[0],base=ray.intersectObject(heads[i])[0];
    assert(paper&&base&&paper.distance<base.distance,'The printed front must sit in front of the real eyes and nose at 3/4 view');
  }
}
heads[0].position.set(-1,5,-8);heads[1].position.set(1,6,-8);
heads[1].rotation.set(.12,.54,-.11);
simulate(1000);assert.equal(masks.root.userData.phase,'worn');
simulate(501);assert.equal(masks.root.userData.phase,'worn');
scene.updateMatrixWorld(true);
for(let i=0;i<2;i++)assert(masks.pieces[i].mesh.matrixWorld.equals(heads[i].matrixWorld),'Physical prop follows the socket, not the camera');
simulate(500);assert.equal(masks.root.userData.phase,'falling');assert.equal(masks.root.userData.drops,1);
const released=masks.pieces.map(p=>p.mesh.position.clone());
heads.forEach(h=>h.position.x+=20);
for(let t=0;t<15;t++)simulate(800);
for(let i=0;i<2;i++){const mesh=masks.pieces[i].mesh;
  assert(mesh.visible&&mesh.position.distanceTo(released[i])>.35&&mesh.position.distanceTo(heads[i].position)>10,'Intact world-space prop travels independently after crossing');
}
for(let t=0;t<300;t++)simulate(800);
assert.equal(masks.root.userData.phase,'shed');assert(!masks.root.visible);assert.equal(masks.root.userData.drops,1);
simulate(275);simulate(960);assert.equal(masks.root.userData.drops,1);
masks.sync(undefined,null,0,1,0);assert.equal(masks.root.userData.phase,'absent');
simulate(1000);simulate(0,false,1/60,false);assert.equal(masks.root.userData.phase,'falling','A lethal crossing uses the last worn pose');
hp.id='replay';simulate(1000);assert.equal(masks.root.userData.phase,'worn');assert.equal(masks.root.userData.drops,0);
simulate(126);assert.equal(masks.root.userData.phase,'falling','A high damage hit must not skip the transition');
for(const p of heads){p.geometry.dispose();p.material.dispose();}masks.dispose();
console.log('Original RGBA prints; physical 3/4 eye/nose coverage; 501/500 exact threshold, skipped and lethal crossings, world-space drop, heal latch and replay reset pass.');
