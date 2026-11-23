import * as T from 'three';

/** Ridge aircraft only. A short, round, lower nose projecting beyond the
 * flat end-cap; the existing faceted windscreen still forms the upper half.
 * Its broad shoulder and dipped chin turn the flank light toward the viewer.
 * No painted geometry crosses the open bay, glazing, or skids. */
export function relayChinFairing(){
  const bands=[[1.79,.565,.235,-.14],[1.91,.530,.225,-.145],
    [2.00,.445,.186,-.141],[2.09,.315,.125,-.13],[2.144,.15,.065,-.112],
    [2.157,.010,.013,-.106]];
  const p:number[]=[],norm:number[]=[],rgb:number[]=[],indices:number[]=[],n=16;
  const palette=['#434e40','#566445','#697552','#7c8161'].map(x=>new T.Color(x));
  for(let j=0;j<bands.length;j++){
    const [depth,rx,ry,cy]=bands[j];
    for(let i=0;i<n;i++){const theta=i*Math.PI*2/n,si=Math.sin(theta),co=Math.cos(theta);
      p.push(rx*si,cy+ry*co,-depth);
      // Analytical normals: the last two short sections roll toward the nose.
      const normal=new T.Vector3(si*.78,co,-[.06,.22,.43,.64,.89,1.65][j]).normalize();
      norm.push(normal.x,normal.y,normal.z);const c=palette[co>.70?3:co>.05?2:co>-.6?1:0];
      rgb.push(c.r,c.g,c.b);
      if(j>0){const a=(j-1)*n+i,b=(j-1)*n+(i+1)%n;indices.push(a,b,a+n,b,b+n,a+n);}
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));
  g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
  g.setIndex(indices);g.computeBoundingSphere();return g;
}
