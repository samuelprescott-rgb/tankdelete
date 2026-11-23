// CPU harness sanity only. Actual final pictures must still be opened.
import assert from 'node:assert/strict';
import * as T from 'three';
import {installCommandPhotoPlanner} from './command-photo-sightlines.mjs';
const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,16/9,.1,340),boss=new T.Group();
boss.name='nightmare-boss-sculpt';boss.scale.set(5,4.3,4.5);boss.position.set(3,0,-18);scene.add(boss);
const simple=new T.MeshBasicMaterial({color:0xffffff}),base=new T.BoxGeometry(.20,.25,.20);
const mesh=(name,x,y,z,geom=base)=>{const o=new T.Mesh(geom,simple);o.name=name;o.position.set(x,y,z);return o;};
for(const [i,prefix] of ['command-double-faced-skull','command-watchers-skull'].entries()){
 const geom=base.clone(),pos=geom.getAttribute('position'),a=new Float32Array(pos.count);
 for(let k=0;k<a.length;k++)if(pos.getZ(k)<0)a[k]=1;geom.setAttribute('commandEmber',new T.BufferAttribute(a,1));
 boss.add(mesh(prefix,i?.28:-.24,i?1.43:1.51,-.07,geom));
}
boss.add(mesh('command-weight-bearing-chest',0,.7,0),mesh('command-upper-0',-.43,1.12,0),mesh('command-striking-arm',.44,1.10,0));
for(const [i,side] of ['left','right'].entries()){const leg=new T.Group();leg.name='command-leg-'+side;
 leg.add(mesh('boot',i?.25:-.25,.09,i?-.17:.17));boss.add(leg);}
const wall=new T.Mesh(new T.BoxGeometry(20,14,.45),simple);wall.position.set(4,3,-24);wall.name='test-annex-wall';scene.add(wall);
const state={scene,camera,raycaster:new T.Raycaster(),clock:{elapsedTime:1}};
globalThis.window={rigRoot:{getState:()=>state}};
const root=boss.position.toArray(),feet=[[-1,.5,0],[1,0,0]],start=camera.matrixWorld.clone();
installCommandPhotoPlanner();let p=window.commandPhotoPlanner.plan([],1,root,feet);
assert(!p||p.name!=='front-left','A binding ankle phase and visible boss flag do not excuse a wall blocking the canonical camera');
assert(window.commandPhotoPlanner.rejected['test-annex-wall']>0);
wall.visible=false;installCommandPhotoPlanner();p=window.commandPhotoPlanner.plan([],2,root,feet);
assert.equal(p.name,'front-left');assert.equal(p.protocol,'exact R14 root-local camera');
assert.equal(p.verifiedExternalRays,9);assert.deepEqual(p.reference.localEye,[.92,1.13,-2.85]);
assert.equal(p.targets.heads.length,2);assert.deepEqual(camera.matrixWorld.toArray(),start.toArray());
const done=[p];let mirror;for(let i=0;i<100;i++){const shot=window.commandPhotoPlanner.plan(done,3+i*.1,root,feet);if(!shot)continue;
 done.push(shot);if(shot.name==='opposite-front'){mirror=shot;break;}}
assert(mirror,'Actual opposite-side, not merely a second foot phase');
console.log('Physical wall rejection, canonical local pose, both skull landmarks, mirror-side view and untouched player lens passed.');
