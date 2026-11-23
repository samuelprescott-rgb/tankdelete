import assert from 'node:assert/strict';
import * as T from 'three';

const mix=T.MathUtils.lerp;
function standardProgram(material){
  assert.ok(material?.isMeshStandardMaterial);
  const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(s,null);return s;
}

// Interpret the mounted program's final four mix operations, including their
// actual endpoints and wet-chip grain floor. Do not give a green result for
// unapplied values on an unused material or for an albedo/emissive substitute.
function pbrFactors(shader){
  const f=shader.fragmentShader.replace(/\/\/[^\n]*/g,'');
  assert.match(shader.vertexShader,/attribute vec2 tankCastContact;/);
  assert.match(shader.vertexShader,/vTankCastContact\s*=\s*tankCastContact\s*;/);
  assert.match(f,/varying vec2 vTankCastContact;/);
  assert.match(f,/castSteelGrain\s*=\s*smoothstep\(\.29,\.81,chip\)/);
  const start=f.indexOf('float scrubbed'),end=f.indexOf('#include <normal_fragment_begin>'),
    existing=f.indexOf('roughnessFactor = clamp('),metalMap=f.indexOf('#include <metalnessmap_fragment>');
  assert.ok(existing>=0&&metalMap>existing&&start>metalMap&&end>start,
    'Contact must be applied after established dirt roughness and before direct light');
  const block=f.slice(start,end);
  assert.match(block,/float scrubbed\s*=\s*vTankCastContact\.x\s*;/);
  const grain=block.match(/float wetChip\s*=\s*vTankCastContact\.y\s*\*\s*\(\s*([\d.]+)\s*\+\s*([\d.]+)\s*\*\s*castSteelGrain\s*\)/);
  assert.ok(grain);
  const seq=[...block.matchAll(/(roughnessFactor|metalnessFactor)\s*=\s*mix\(\s*\1\s*,\s*([\d.]+)\s*,\s*(scrubbed|wetChip)\s*\)\s*;/g)];
  assert.deepEqual(seq.map(m=>[m[1],m[3]]),[
    ['roughnessFactor','scrubbed'],['metalnessFactor','scrubbed'],['roughnessFactor','wetChip'],['metalnessFactor','wetChip']]);
  return (x,y,g,r,m)=>{
    const factors={roughnessFactor:r,metalnessFactor:m},alpha={scrubbed:x,wetChip:y*(Number(grain[1])+Number(grain[2])*g)};
    for(const [,field,target,region] of seq)factors[field]=mix(factors[field],Number(target),alpha[region]);
    return [factors.roughnessFactor,factors.metalnessFactor];
  };
}
// Direct reflected specular radiance for unit incident light, using Three's
// isotropic D_GGX, V_GGX_SmithCorrelated and Schlick Fresnel approximation.
// Normal-incidence and 65-degree-offset light, same view and linear pigment.
function specular([roughness,metalness],lightAngle,base=.18){
  const nl=Math.cos(lightAngle),nv=1,nh=Math.cos(lightAngle/2),vh=nh,a2=roughness**4;
  const D=a2/(Math.PI*(nh*nh*(a2-1)+1)**2);
  const V=.5/(nl*Math.sqrt(a2+(1-a2)*nv*nv)+nv*Math.sqrt(a2+(1-a2)*nl*nl));
  const f0=mix(.04,base,metalness),F=mix(f0,1,2**((-5.55473*vh-6.98316)*vh));
  return nl*D*V*F;
}
function surfaceSamples(mesh,study){
  const {position:p,tankCastContact:ch}=mesh.geometry.attributes,index=mesh.geometry.index;
  assert.ok(ch?.normalized&&ch.itemSize===2&&ch.count===p.count&&ch.array instanceof Uint8Array);
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ac=new T.Vector3(),ab=new T.Vector3(),samples=[];
  const tex=study.image,fract=v=>v-Math.floor(v);
  for(let t=0;t<(index?.count??p.count);t+=3){
    const ids=[0,1,2].map(i=>index?index.getX(t+i):t+i);
    [a,b,c].forEach((v,i)=>v.fromBufferAttribute(p,ids[i]));
    const area=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;
    if(area<1e-9)continue;
    for(const w of [[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]]){
      const v=new T.Vector3().addScaledVector(a,w[0]).addScaledVector(b,w[1]).addScaledVector(c,w[2]);
      const x=ids.reduce((s,k,i)=>s+w[i]*ch.getX(k),0),y=ids.reduce((s,k,i)=>s+w[i]*ch.getY(k),0);
      // Nearest magnification sample of the actual mounted object-space ink.
      const sx=Math.floor(fract((v.z+.62*v.x)*3.7+.29)*tex.width);
      const sy=Math.floor(fract((v.y-.48*v.x+.17*v.z)*3.7+.61)*tex.height);
      const grain=T.MathUtils.smoothstep(tex.data[(sy*tex.width+sx)*4+1]/255,.29,.81);
      samples.push({x,y,grain,area:area/3,v});
    }
  }
  return samples;
}
function isExposed(samples,root,mesh,weight){
  const pool=samples.filter(s=>weight(s)>.52),ray=new T.Raycaster(),dir=new T.Vector3(),objects=[];
  root.traverseVisible(o=>{if(o.isMesh&&o.material?.visible!==false&&
    (!o.material?.transparent||o.material.opacity>.8))objects.push(o);});
  for(const a of [-.86,.25,.86]){
    const origin=mesh.localToWorld(new T.Vector3(2*Math.sin(a),.76,2*Math.cos(a)));
    // Check actual selected surface triangles throughout a continuous band
    // or across the small pockets. The basket/fuel cells can hide a good mask.
    for(let i=0;i<pool.length;i+=Math.max(1,Math.floor(pool.length/28))){
      const p=mesh.localToWorld(pool[i].v.clone());
      ray.set(origin,dir.copy(p).sub(origin).normalize());ray.far=p.distanceTo(origin)+.004;
      const h=ray.intersectObjects(objects,false)[0];
      if(h?.object===mesh&&p.distanceTo(h.point)<.003)return true;
    }
  }
  return false;
}
export function checkTankLacquer(root,cheek,cloth,jaw){
  const tagged=[];
  root.traverse(o=>{if(o.isMesh&&o.geometry?.getAttribute('tankCastContact'))tagged.push(o);});
  assert.deepEqual(tagged.map(o=>o.uuid),[cheek.uuid],'Only the mounted steel casting can carry this region mask');
  const program=standardProgram(cheek.material),factors=pbrFactors(program),mat=cheek.material;
  assert.ok(cloth&&cloth.parent===cheek.parent&&cloth!==cheek);
  const textile=standardProgram(cloth.material);
  assert.deepEqual([cloth.material.roughness,cloth.material.metalness],[1,0]);
  assert.doesNotMatch(textile.fragmentShader,/\b(?:roughnessFactor|metalnessFactor)\s*=/,
    'Mounted canvas must not acquire a hidden specular polish via a shader hook');
  for(const other of [textile,standardProgram(jaw.material)]){
    assert.doesNotMatch(other.fragmentShader,/vTankCastContact|castSteelGrain/);
    assert.doesNotMatch(other.vertexShader,/attribute vec2 tankCastContact/);
  }
  const samples=surfaceSamples(cheek,program.uniforms.uFineTankStudy.value);
  const total=samples.reduce((n,s)=>n+s.area,0);
  const weighted=(fn)=>samples.reduce((n,s)=>n+s.area*fn(s),0)/total;
  const upper=weighted(s=>s.x),lower=weighted(s=>s.y);
  assert.ok(upper>.035&&upper<.36&&lower>.001&&lower<.09,'Worn contact belongs on a shoulder and isolated wet spots, not every triangle');
  assert.ok(weighted(s=>s.x*s.v.z)/upper>.10&&weighted(s=>s.x*s.v.y)/upper>
    weighted(s=>s.y*s.v.y)/lower+.10,'Upper shoulder must arc behind and above separate lower contacts');
  assert.ok(isExposed(samples,root,cheek,s=>s.x)&&isExposed(samples,root,cheek,s=>s.y),
    'Both material regions must be exposed to a real rear-quarter view with all tank meshes in place');
  const first=samples.reduce((a,b)=>b.x>a.x?b:a);
  const second=samples.reduce((a,b)=>b.y*(.28+.72*b.grain)>a.y*(.28+.72*a.grain)?b:a);
  const base=[mat.roughness,mat.metalness],skin=[cloth.material.roughness,cloth.material.metalness];
  const read=s=>factors(s.x,s.y,s.grain,...base);
  const shoulder=read(first),wet=read(second);
  assert.deepEqual(factors(0,0,1,...base),base,'Unworn cast pigment must stay dry');
  assert.ok(shoulder[0]<.48&&shoulder[1]>.185&&wet[0]<.49&&wet[1]>.2,'Actual cast samples must change both PBR channels');
  const coated=[shoulder,wet].map(v=>[specular(v,0),specular(v,65*Math.PI/180)]);
  for(const [lit,off] of coated)assert.ok(lit>specular(base,0)*3&&lit>specular(skin,0)*5&&off<lit*.27,
    'Only aligned direct light may bring up a contact; canvas remains diffuse');
  console.log('Mounted casting PBR:',JSON.stringify({areaWeightedPct:[upper,lower].map(x=>+(100*x).toFixed(2)),
    shoulder:shoulder.map(x=>+x.toFixed(3)),wet:wet.map(x=>+x.toFixed(3)),cloth:skin,
    alignedOverOff:coated.map(([a,b])=>+(a/b).toFixed(1))}));
}
