import * as T from 'three';

// Screen-facing indexed cels. Bake contiguous ink spans into geometry: no
// transparent plate, second material, texture switch, or sort across the hull.
// All coordinates below are painted in the aircraft image, not on the map.
const inks=['','#252b29','#393731','#51443b','#715044','#733323','#ae4021','#f05a1d',
  '#ff9029','#ffbb4b','#ffe385','#fff4bd'];
export function relayCombustionCel(kind:'hit'|'wake',frame:number){
  const w=64,h=40,ink=new Uint8Array(w*h),peak=kind==='hit',s=frame;
  function put(x:number,y:number,c:number){x=Math.round(x);y=Math.round(y);if(x>=0&&x<w&&y>=0&&y<h)ink[y*w+x]=c;}
  function lobe(cx:number,cy:number,rx:number,ry:number,c:number,seed:number){
    for(let y=Math.floor(cy-ry-1);y<=cy+ry+1;y++)for(let x=Math.floor(cx-rx-1);x<=cx+rx+1;x++){
      const a=(x-cx)/rx,b=(y-cy)/ry,notch=.07*Math.sin(11*a+5*b+seed)+.052*Math.cos(7*b-4*a+seed);
      if(a*a+b*b<1+notch)put(x,y,c);
    }
  }
  // Quadratic, countercurving whips, tapering to broken points. Highlight
  // ribbons follow the bow of the flame, never the full outside silhouette.
  function lick(x0:number,y0:number,x1:number,y1:number,x2:number,y2:number,r:number,c:number){
    for(let i=0;i<=26;i++){const t=i/26,u=1-t,rr=r*Math.pow(u,.82)+.25;
      lobe(u*u*x0+2*u*t*x1+t*t*x2,u*u*y0+2*u*t*y1+t*t*y2,rr,rr*.84,c,s+i*.07);}
  }
  const phase=[0,.82,1.85,3.05][s%4],d=peak?[0,2,5,9][s%4]:s%3;
  const rootX=peak?18:12,rootY=peak?10:8;
  // Coal-black silhouettes, shaded inside rather than uniformly outlined.
  // The smoke tears off above the flame; two sky channels stay open.
  const clouds=peak?[[22,15,6,5],[29,18,7,6],[38,23,7,5],[45,26,5,4],[50,28,3,2],
    [32,9,4,3],[40,11,3,2],[52,34,2,1]]:[[19,12,5,4],[28,17,6,5],[35,20,5,4],
    [42,23,4,3],[49,25,2,2],[34,11,3,2],[42,12,2,1]];
  clouds.forEach(([x,y,rx,ry],i)=>{
    x+=Math.floor(d*(i%3)*.28+Math.sin(phase+i));y+=Math.floor(d*.34+Math.sin(phase+i*3)*1.3);
    lobe(x,y,rx,ry,1,i);lobe(x+1,y+1,rx*.83,ry*.78,2,i+2);
    lobe(x+rx*.2,y+ry*.55,rx*.57,ry*.38,3,i+3);
    if(i%2===0)lobe(x+rx*.34,y+ry*.72,rx*.30,ry*.22,4,i+4);
  });
  const sway=Math.sin(phase)*3,stretch=peak?d:1;
  lick(rootX,rootY,27,22+sway,42+stretch,22+sway,7,5);
  lick(rootX+1,rootY+1,26,22+sway,41+stretch,22+sway,5,7);
  lick(rootX+1,rootY,24,18+sway,35+stretch*.6,21+sway,3.6,8);
  lick(rootX,rootY,26,7-sway,39+stretch*.8,14-sway,5,6);
  lick(rootX,rootY,26,8-sway,36+stretch*.8,13-sway,3,8);
  lick(rootX-1,rootY+1,16+sway,21,25+sway,25+d*.3,4.7,6);
  lick(rootX-1,rootY+1,16+sway,20,23+sway,23+d*.3,2.9,8);
  lobe(rootX,rootY,6,4,7,1);
  lick(rootX-2,rootY,rootX+1,rootY+3,rootX+7,rootY+4,4,9);
  if(!peak||s<3){
    lick(rootX-2,rootY,rootX,rootY+2,rootX+4,rootY+3,2.8,10);
    lobe(rootX-2,rootY,peak&&s<2?2.2:1.1,peak&&s<2?1.55:1,11,2);
  }
  // Released flecks, not rays touching the main mass.
  for(let i=0;i<6;i++){const x=31+((i*13+s*3)%28),y=9+((i*11+s*5)%23);
    lobe(x,y,1.3+(i%2),.7+(i%2)*.3,i%3===0?9:i%3===1?7:5,i);}
  // Only a handful of spans per row; one double-triangle per solid ink run.
  const pos:number[]=[],rgb:number[]=[],ix:number[]=[],colors=inks.map(c=>new T.Color(c||'#000000'));
  const px=peak?.069:.055;
  for(let y=0;y<h;y++)for(let x=0;x<w;){
    const c=ink[y*w+x],left=x;while(x<w&&ink[y*w+x]===c)x++;if(!c)continue;
    const a=(left-rootX)*px,b=(x-rootX)*px,v=(y-rootY)*px,k=pos.length/3;
    pos.push(a,v,0,b,v,0,b,v+px,0,a,v+px,0);ix.push(k,k+1,k+2,k,k+2,k+3);
    for(let n=0;n<4;n++)rgb.push(colors[c].r,colors[c].g,colors[c].b);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));g.setIndex(ix);g.computeBoundingSphere();
  g.name='relay-'+kind+'-cel-'+s;return g;
}

/** Camera-facing shoulder fire used by the airborne gunner and ground combatants. */
export function paintCharacterFlame(object:T.Object3D,camera:T.Camera,age:number,scale:number){
  object.quaternion.copy(camera.quaternion);object.rotateZ(.80+.13*Math.sin(age*5));
  object.scale.setScalar(scale*(.58+.06*Math.sin(age*11)));
  return Math.floor(age*9)%4;
}
