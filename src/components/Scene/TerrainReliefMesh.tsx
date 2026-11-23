import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RELIEF_PATCHES, RELIEF_STEPS, terrainReliefHeight } from '../../lib/terrain';

/** One static batch for all 42 individual banks. Cull invisible apron faces
 * under the main soil and sample the very same split used by the ground query. */
export function createReliefGeometry() {
  const xyz:number[]=[],uv:number[]=[],index:number[]=[];
  const n=RELIEF_STEPS,side=n+1;
  for(const {m,cs,sn,heights} of RELIEF_PATCHES){
    const base=xyz.length/3;
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
      const lx=(i*2/n-1)*m.sx,lz=(j*2/n-1)*m.sz;
      const x=m.x+cs*lx+sn*lz,z=m.z-sn*lx+cs*lz;
      xyz.push(x,heights[j*side+i],z);uv.push(x/170,z/170);
      if(i===n||j===n)continue;
      const a=j*side+i,b=a+1,c=a+side,d=c+1;
      if(Math.max(heights[a],heights[b],heights[c])>-.07)index.push(base+a,base+c,base+b);
      if(Math.max(heights[b],heights[c],heights[d])>-.07)index.push(base+b,base+c,base+d);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}

// Grass roots follow the sculpted surface. Uneven colonies interrupt a
// shoulder and spill around a notch; leaving the rest open exposes the scarp.
// One small opaque batch, without texture fetches, alpha sorting or shadows.
export function createBankGrowth(){
  const xyz:number[]=[],rgb:number[]=[],ind:number[]=[];
  const shades=['#384a32','#485d36','#596a3c','#716e41','#80734a'].map(s=>new THREE.Color(s));
  const rand=(n:number)=>{const a=Math.sin(n*67.191+31.117)*18473.43;return a-Math.floor(a);};
  for(let k=0;k<RELIEF_PATCHES.length;k++){
    const {m,cs,sn}=RELIEF_PATCHES[k];
    for(let cl=0;cl<(k<4?10:4);cl++){
      const salt=k*1147+cl*91,axis=rand(salt)*6.283,rad=.23+rand(salt+1)*.48;
      const lx=Math.cos(axis)*rad*m.sx,lz=Math.sin(axis)*rad*m.sz;
      const ox=m.x+cs*lx+sn*lz,oz=m.z-sn*lx+cs*lz;
      const n=3+Math.floor(rand(salt+2)*4);
      for(let j=0;j<n;j++){
        const s=salt+j*13,size=.19+rand(s+5)*.24;
        const x=ox+(rand(s+1)-.5)*1.59,z=oz+(rand(s+2)-.5)*1.23;
        const base=terrainReliefHeight(x,z);
        if(base<-.067)continue;
        for(let leaf=0;leaf<4;leaf++){
          const a=rand(s+3)*6.283+leaf*2.399,dx=Math.cos(a),dz=Math.sin(a);
          const h=size*(.63+.73*rand(s+leaf+4)),w=.018+rand(s+leaf+6)*.029;
          const reach=.13+rand(s+leaf+8)*.16, bx=x+dx*.025,bz=z+dz*.025,by=base-.025;
          const start=xyz.length/3,col=shades[Math.floor(rand(s+leaf+10)*shades.length)];
          xyz.push(bx-dz*w,by,bz+dx*w,bx+dz*w,by,bz-dx*w,
            bx+dx*reach*.44-dz*w*.7,by+h*.62,bz+dz*reach*.44+dx*w*.7,
            bx+dx*reach,by+h,bz+dz*reach);
          for(const l of [.54,.64,.92,1.13])rgb.push(col.r*l,col.g*l,col.b*l);
          ind.push(start,start+1,start+2,start+2,start+1,start+3);
        }
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));g.setIndex(ind);g.computeVertexNormals();g.computeBoundingSphere();
  return {geometry:g,material:new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide})};
}
export function TerrainReliefMesh({ material }: { material: THREE.Material }) {
  const geometry=useMemo(createReliefGeometry,[]);
  const growth=useMemo(createBankGrowth,[]);
  useEffect(()=>()=>{geometry.dispose();growth.geometry.dispose();growth.material.dispose();},[geometry,growth]);
  return <><mesh name="terrain-relief" geometry={geometry} material={material} castShadow receiveShadow dispose={null}/>
    <mesh name="rooted-bank-sedges" geometry={growth.geometry} material={growth.material} receiveShadow dispose={null}/></>;
}
