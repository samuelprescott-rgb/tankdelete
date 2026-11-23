import * as THREE from 'three';
// A baked waffle lattice under a melting, fiery scoop. Three authored
// batches replace the original cone, icosphere and translucent glow sphere.
export function makeGhostDoomSundae(part:'wafer'|'scoop'|'sparks'){
  const p:number[]=[],rgb:number[]=[],color=new THREE.Color();
  function quad(verts:number[][],ink:string){
    color.set(ink);for(const k of [0,2,1,0,3,2]){
      p.push(...verts[k]);rgb.push(color.r,color.g,color.b);
    }
  }
  const rings=part==='wafer'?[
    [-.33,.245],[-.30,.25],[-.26,.224],[-.21,.213],[-.16,.195],[-.11,.173],
    [-.06,.156],[-.01,.136],[.05,.112],[.11,.088],[.17,.066],[.23,.042],[.29,.023],[.33,.009],
  ]:[[-.24,.12],[-.20,.22],[-.15,.245],[-.08,.286],[.01,.298],[.08,.29],[.14,.255],[.19,.217],[.23,.154],[.25,.094],[.251,.001]];
  if(part!=='sparks'){
    const sectors=part==='wafer'?24:16;
    const vertex=(ring:number,col:number)=>{
      const [height,radius]=rings[ring], angle=col*Math.PI*2/sectors;
      const drip=part==='scoop'&&ring<3?(1-ring/3)*Math.max(0, Math.cos(angle*5+.4))**6*.13:0;
      const r=radius*(part==='scoop'?1+.034*Math.sin(angle*5):1);
      return [r*Math.cos(angle),height-drip,r*Math.sin(angle)];
    };
    for(let r=0;r<rings.length-1;r++)for(let x=0;x<sectors;x++){
      let tint='#bc7137';
      if(part==='wafer'){
        tint=r===0?'#744235':r===1?'#fbca7b':(x+r)%6===0||(x+24-r)%6===0?'#ebb268':
          (x+r+1)%6===0?'#955037':x<9?'#b36b38':'#c88341';
      }else{
        tint=r<=1?'#b44440':r<=3?'#ec6847':r<=5?'#ff925c':r<=7?'#ffb579':'#ffe6a6';
        if(r>=3&&r<=7&&((x+Math.floor(r/2))%11===3))tint='#ffda8b';
        if(r===2&&(x%4===0))tint='#9d4544';
      }
      quad([vertex(r,x),vertex(r,x+1),vertex(r+1,x+1),vertex(r+1,x)],tint);
    }
  }else{
    for(const [x,y,z,size] of [[-.20,.32,.05,.056],[-.25,.41,.09,.03],[.125,.37,.11,.038],[.23,.295,-.09,.052]]){
      const a=size/2,b=size*.8;
      const v=[[x-a,y-b,z-a],[x+a,y-b,z-a],[x+a,y+b,z-a],[x-a,y+b,z-a],
        [x-a,y-b,z+a],[x+a,y-b,z+a],[x+a,y+b,z+a],[x-a,y+b,z+a]];
      for(const [idx,ink] of [[[0,1,2,3],'#fca659'],[[4,7,6,5],'#ffdf85'],[[0,3,7,4],'#fa8c45'],[[1,5,6,2],'#ffc967'],[[3,2,6,7],'#fff0a6'],[[0,4,5,1],'#ed773e']] as const)
        quad(idx.map(i=>v[i]),ink);
    }
  }
  const g=new THREE.BufferGeometry();g.name='ghost-signal-sundae-'+part;
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  g.computeBoundingSphere();return g;
}
