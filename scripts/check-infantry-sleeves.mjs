import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import ts from 'typescript';

const moduleCache = new Map();
async function moduleUrl(url) {
  if (moduleCache.has(url.href)) return moduleCache.get(url.href);
  const pending = (async () => {
    const source = await readFile(url, 'utf8');
    let { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    });
    for (const match of [...outputText.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
      const resolved = match[2].startsWith('.')
        ? await moduleUrl(new URL(`${match[2]}.ts`, url))
        : import.meta.resolve(match[2]);
      outputText = outputText.replace(match[0], `from '${resolved}'`);
    }
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  })();
  moduleCache.set(url.href, pending);
  return pending;
}
const model = await import(await moduleUrl(new URL('../src/components/Scene/infantryGeometry.ts', import.meta.url)));
const metrics = await import(await moduleUrl(new URL('../src/lib/infantryMetrics.ts', import.meta.url)));
const { createFieldBackLoadGeometry } = await import(await moduleUrl(new URL('../src/components/Scene/fieldBackLoadGeometry.ts', import.meta.url)));

function validateClosedSleeve(geometry) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  assert.ok(position.count <= 400 * 3);
  assert.equal(geometry.index, null);
  assert.equal(geometry.groups.length, 0);
  const edges = new Map();
  const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let v = 0; v < position.count; v += 3) {
    const keys = points.map((point, i) => {
      point.fromBufferAttribute(position, v + i);
      const n = Math.hypot(normal.getX(v + i), normal.getY(v + i), normal.getZ(v + i));
      assert.ok(Math.abs(n - 1) < 1e-5);
      return point.toArray().map(value => value.toFixed(6)).join('/');
    });
    assert.ok(a.subVectors(points[1], points[0]).cross(b.subVectors(points[2], points[0])).lengthSq() > 1e-12);
    for (let i = 0; i < 3; i++) {
      const edge = [keys[i], keys[(i + 1) % 3]].sort().join(':');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(count => count === 2), 'The sleeve should be a closed continuous surface');
}

for (const kneeling of [true, false]) {
  const offset = kneeling ? metrics.INFANTRY_KNEEL_OFFSET : 0;
  const rifleY = metrics.infantryRifleHeight(kneeling);
  for (const side of [-1, 1]) {
    const shoulder = [side * .201, 1.385 - offset, -.008];
    const elbow = [side < 0 ? -.22 : .298, rifleY - .23 + (side > 0 ? .01 : 0), side < 0 ? -.20 : .033];
    const wrist = side < 0 ? [metrics.INFANTRY_RIFLE_X - .032, rifleY - .038, -.405]
      : [metrics.INFANTRY_RIFLE_X + .03, rifleY - .074, -.111];
    const anchors = structuredClone({ shoulder, elbow, wrist });
    const sleeve = model.createFatigueSleeve(shoulder, elbow, wrist, '#586046');
    assert.deepEqual({ shoulder, elbow, wrist }, anchors);
    validateClosedSleeve(sleeve);
    sleeve.dispose();
  }
  const body = model.createInfantryGeometry({ faction: 'us', kneeling });
  const weights = body.getAttribute('skinWeight'), indices = body.getAttribute('skinIndex');
  const blendedJoints = new Set();
  for (let v = 0; v < weights.count; v++) {
    assert.equal(weights.getX(v) + weights.getY(v) + weights.getZ(v) + weights.getW(v), 1);
    if (weights.getX(v) > 0 && weights.getY(v) > 0) {
      assert.equal(indices.getY(v), indices.getX(v) + 1);
      blendedJoints.add(indices.getX(v));
    }
  }
  assert.deepEqual([...blendedJoints].sort(), [2, 5], 'Both knees should blend thigh and shin weights');
  body.dispose();
}

// Read back the visible shell, not constants used by the builder. An old
// smooth jacket or a merely painted stripe cannot pass the relief check.
const material = new THREE.MeshBasicMaterial({side:THREE.FrontSide});
const posedFit={min:1,max:0,samples:0,shoulder:[]};
for (const faction of ['us','vc']) for(const variant of [0,1,2]) {
  for (const kneeling of [false,true]) {
    const offset = kneeling ? metrics.INFANTRY_KNEEL_OFFSET : 0;
    const body = model.createInfantryGeometry({faction,variant,kneeling,fieldUniform:true});
    const mesh = new THREE.Mesh(body,material), surface=body.getAttribute('surfaceKind');
    const paint=body.getAttribute('color'), point=body.getAttribute('position');
    const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,0,-1),0,.44);
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(), bary=new THREE.Vector3();
    const back=(x,y)=>{
      ray.ray.origin.set(x,y-offset,.36);
      const hit=ray.intersectObject(mesh).find(h=>surface.getX(h.face.a)===0);
      assert.ok(hit,'The rear shirt must stay continuous');
      const {face:f}=hit;
      THREE.Triangle.getBarycoord(hit.point,a.fromBufferAttribute(point,f.a),b.fromBufferAttribute(point,f.b),c.fromBufferAttribute(point,f.c),bary);
      return [hit.point.z,[f.a,f.b,f.c].reduce((sum,v,i)=>sum+bary.getComponent(i)*paint.getY(v),0)];
    };
    const profile=Array.from({length:21},(_,i)=>back(.012,1.034+i*.0038));
    const peak=profile.reduce((best,s,i)=>s[0]>profile[best][0]?i:best,0);
    const valley=Math.min(...profile.slice(0,peak+1).map(p=>p[0]));
    const relief=profile[peak][0]-valley;
    assert.ok(peak>2 && peak<19 && relief>.010,`${faction}: waist fold needs physical relief; peak ${peak}, rise ${relief}`);
    const yoke=[1.303,1.312,1.316,1.322,1.327].map(y=>back(.048,y)[1]);
    const contrast=Math.max(...yoke)/Math.min(...yoke);
    assert.ok(contrast>1.18,`${faction}: folded yoke needs a grounded rim and shadow, ratio ${contrast}`);
    const pack=createFieldBackLoadGeometry(faction,offset);
    const kit = new THREE.Mesh(pack,material);
    const layerRay=new THREE.Raycaster(new THREE.Vector3(.104,1.040-offset,.40),new THREE.Vector3(0,0,-1),0,.40);
    if (faction==='us') {
      const hits=layerRay.intersectObject(kit).map(h=>h.point.z);
      assert.ok(hits.length>=2 && hits[0]-hits[1]>.001 && hits[0]-hits[1]<.009,
        'The face of the load strap must sit above the lid, without floating');
    } else {
      const lip=(dy)=>{
        layerRay.ray.origin.set(.012,1.065-offset+dy,.40);
        return layerRay.intersectObject(kit)[0]?.point.z ?? 0;
      };
      const fold=lip(-.009)-lip(-.019);
      assert.ok(fold>.003,`The roll needs a projecting cloth edge, measured ${fold}`);
    }
    // Test the actual continuous ribbon triangles AFTER skinning. Endpoints
    // alone all cleared the old jacket while the middle of a chord clipped.
    const actor = new THREE.SkinnedMesh(body,material), rig=model.createInfantryRig(kneeling);
    model.bindInfantryRig(actor,rig);
    const starts=body.userData.fieldSuspenderRanges;
    assert.equal(starts?.length,2);
    for (const [lookYaw,aimPitch,moving] of [[-.61,.20,true],[.72,-.16,false]]) {
      model.updateInfantryRig(rig,{time:1.7,delta:.06,moving,progress:.45,phase:.42,recoil:.31,aimPitch,lookYaw});
      actor.updateMatrixWorld(true); rig.skeleton.update();
      const xyz=[],v=new THREE.Vector3();
      for(let i=0;i<point.count;i+=3) {
        if(!body.userData.jacketFitRanges.some(([s,n])=>i>=s && i<s+n)) continue;
        for(let j=i;j<i+3;j++) {actor.getVertexPosition(j,v);xyz.push(v.x,v.y,v.z);}
      }
      const shirt=new THREE.BufferGeometry();
      shirt.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
      const clothMesh=new THREE.Mesh(shirt,material), sample=new THREE.Vector3(),n=new THREE.Vector3();
      const cast=new THREE.Raycaster(undefined,undefined,0,.050);
      for(const [start,count] of starts) {
        assert.equal(count/3,84,'Reallocated shoulder facets must stay in the original GPU budget');
        let low=1,high=-1,loAt='',hiAt='',tested=0,missed=0;
        for(let i=start;i<start+count;i+=3) {
          const y=(point.getY(i)+point.getY(i+1)+point.getY(i+2))/3+offset;
          if(y<1.075) continue;
          actor.getVertexPosition(i,a);actor.getVertexPosition(i+1,b);actor.getVertexPosition(i+2,c);
          THREE.Triangle.getNormal(a,b,c,n);
          // Different probes from the builder: include both sides of a
          // diagonal and almost the entire supported width, not just its
          // three control vertices or the samples used to fit the strap.
          const probes=[[1/3,1/3,1/3],[.02,.49,.49],[.49,.02,.49],[.49,.49,.02],[.86,.07,.07],[.07,.86,.07],[.07,.07,.86],
            [.21,.51,.28],[.58,.23,.19],[.19,.26,.55],[.29,.66,.05],[.63,.04,.33]];
          for(const [u,v,w] of probes) {
            sample.copy(a).multiplyScalar(u).addScaledVector(b,v).addScaledVector(c,w);
            cast.ray.origin.copy(sample).addScaledVector(n,.016);
            cast.ray.direction.copy(n).negate();
            const hit=cast.intersectObject(clothMesh)[0];
            if(!hit) {missed++;continue;}
            const clearance=hit.distance-.016;
            if(y>1.32) posedFit.shoulder.push(clearance);
            if(clearance<low) {low=clearance;loAt=`${i-start}/${y.toFixed(3)}`;}
            if(clearance>high) {high=clearance;hiAt=`${i-start}/${y.toFixed(3)}`;}
            tested++;
          }
        }
        assert.ok(tested>650 && missed===0 && low>0 && high<.015,
          `${faction}-${variant} offset ${offset} strap ${start}: posed clearance ${low.toFixed(4)}m (${loAt})..${high.toFixed(4)}m (${hiAt}), missed ${missed}/${tested}`);
        posedFit.min=Math.min(posedFit.min,low);posedFit.max=Math.max(posedFit.max,high);posedFit.samples+=tested;
      }
      shirt.dispose();
    }
    model.disposeInfantryRig(rig);body.dispose(); pack.dispose();
  }
}
material.dispose();
posedFit.shoulder.sort((a,b)=>a-b);
const shoulderP95=posedFit.shoulder[Math.floor(posedFit.shoulder.length*.95)];
assert.ok(shoulderP95<.008,'The crest of a loaded suspender must sit against the coat, not hover above it');
console.log(`Closed sleeves, blended knees, shaped shirt, rear loads and ${posedFit.samples} posed strap probes verified; clearance ${(posedFit.min*1000).toFixed(2)}–${(posedFit.max*1000).toFixed(2)} mm across both factions/stances; shoulder P95 ${(shoulderP95*1000).toFixed(2)} mm.`);
