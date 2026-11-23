import * as THREE from 'three';
import {sootPigmentGLSL} from './sootPigment';

// Original indexed sprite cels, not a posterization of the scene. Coordinates
// are on a 24 x 28 drawing grid measured up from the scorched ground.
export const FX_W = 24, FX_H = 28, FX_FRAMES = 6;
type Points = number[][];
const flameKey: Points[] = [
  [[2,4],[3,8],[6,12],[5,17],[8,15],[9,10],[11,14],[11,20],[15,25],[14,19],[16,16],[17,12],[19,14],[20,18],[22,12],[20,8],[22,5],[18,2],[9,1],[4,2]],
  [[2,5],[5,10],[4,15],[7,18],[7,14],[9,12],[12,18],[11,22],[14,26],[15,21],[17,18],[16,13],[19,10],[21,15],[22,11],[20,7],[21,4],[15,1],[7,2]],
  [[3,4],[4,9],[7,13],[6,18],[9,16],[10,12],[12,14],[14,19],[13,23],[17,25],[16,21],[19,18],[17,12],[19,11],[22,13],[21,7],[19,3],[13,1],[6,2]],
  [[2,5],[4,9],[4,13],[7,11],[8,16],[7,21],[11,18],[11,14],[14,17],[16,22],[19,24],[17,18],[19,16],[17,11],[20,13],[21,16],[22,10],[20,4],[16,2],[7,1]],
  [[2,5],[5,10],[4,14],[6,17],[7,13],[9,14],[10,19],[9,23],[13,20],[13,15],[16,16],[17,20],[20,22],[18,17],[20,14],[18,11],[22,13],[21,7],[18,3],[10,1],[5,2]],
  [[2,4],[4,9],[6,12],[5,16],[7,15],[8,12],[11,17],[10,22],[14,25],[13,20],[15,15],[17,13],[19,17],[21,18],[20,14],[22,11],[20,7],[21,4],[15,2],[8,1]],
];
const inner:Points=[[4,4],[7,8],[6,12],[9,10],[10,7],[12,9],[12,14],[15,18],[14,13],[17,10],[16,7],[19,8],[18,5],[14,3],[7,2]];
const bright:Points=[[6,4],[9,6],[10,9],[11,6],[14,9],[15,11],[16,8],[15,6],[17,5],[14,3],[8,3]];
function inside(x:number,y:number,points:Points) {
  let hit=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [ax,ay]=points[i], [bx,by]=points[j];
    if((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax)hit=!hit;
  }
  return hit;
}
// sRGB for direct sprite sampling with Three's output conversion exactly once.
const paints = ['000000','932e20','ed5122','ff902c','ffd563','fff5af','251f25','393237','51474a','695b59'];
const rgba=paints.map(hex=>new THREE.Color('#'+hex).toArray().map(v=>Math.round(v*255)));
export function paintGhostVfxAtlas() {
  const stride=FX_W*FX_FRAMES, data=new Uint8Array(stride*FX_H*2*4);
  for(let k=0;k<FX_FRAMES;k++){
    const shifts=[0,1,1,0,-1,-1], s=shifts[k];
    const phase=k*2*Math.PI/FX_FRAMES;
    function put(x:number,y:number,bank:number,p:number,alpha=255) {
      const at=((y+bank*FX_H)*stride+k*FX_W+x)*4;
      data[at]=rgba[p][0];data[at+1]=rgba[p][1];data[at+2]=rgba[p][2];data[at+3]=alpha;
    }
    for(let j=0;j<FX_H;j++) for(let i=0;i<FX_W;i++){
      const x=i+.5,y=j+.5;
      // Fold the tongues sideways as hot bands travel up from the fuel.
      // The foot stays planted. Shading follows the same turn as the outline.
      const bend=(y/FX_H)*(2.8*Math.sin(y*.36-phase)+1.5*Math.sin(y*.59-phase));
      const flameX=12+(x-12)*(.99-.14*y/FX_H)-bend;
      if(inside(flameX,y,flameKey[k])){
        const border=!inside(flameX-1,y,flameKey[k])||!inside(flameX,y+1,flameKey[k]);
        let p=border?1:2;
        const lift=1.4*Math.sin(x*.44+y*.33-phase);
        if(inside(flameX-s*.45,y*.86+lift,inner))p=3;
        if(inside(flameX-s*.7,y*.76+lift,bright))p=4;
        if(y>=3&&y<=7&&x>9+s&&x<15+s-(y-4)*.4)p=5;
        put(i,j,0,p,y<2?135:255);
      }else if((i===5+k%3&&j===19+k%4)||(i===16-k%2&&j===26-k%3))put(i,j,0,k%2?3:2);

      // One sheared ribbon of soot. A dark seam under each turning fold
      // crosses the interior instead of outlining a collection of circles.
      const h=(y-3)/22;
      if(h<=0||h>=1)continue;
      const roll=2*Math.PI*h*1.8-phase;
      const center=9.6+4.6*h+1.7*Math.sin(roll);
      const u=(x-center)/(7.3*Math.pow(Math.sin(Math.PI*h),.57));
      const lip=Math.sin(roll+1.9*u+.78*Math.sin(3.5*u-roll));
      const edge=1+.18*lip+.11*Math.sin(5*u+2*roll);
      if(Math.abs(u)>edge)continue;
      const light=lip+.52*u+.19*Math.cos(x*.60+y*.39-phase);
      const paint=light<-.53?6:light<.34?7:light<1.04?8:9;
      put(i,j,1,paint,Math.abs(u)>edge-.13?168:226);
    }
  }
  return data;
}
let atlas: THREE.DataTexture | null=null, owners=0;
// Immutable source bytes are shared by the cel contours and their texture.
// Releasing the last GPU texture still disposes it; the small drawing is CPU-only.
let inkBytes:Uint8Array<ArrayBuffer>|undefined;
export function ghostVfxInk(){return inkBytes??=paintGhostVfxAtlas();}
export function attachGhostVfxAtlas(material:THREE.ShaderMaterial){
  if(!atlas){
    atlas=new THREE.DataTexture(ghostVfxInk(),FX_W*FX_FRAMES,FX_H*2);
    atlas.name='ghost-signal-six-cel-fire-and-soot';atlas.minFilter=atlas.magFilter=THREE.NearestFilter;
    atlas.generateMipmaps=false;atlas.needsUpdate=true;
  }
  material.uniforms.uGhostCels={value:atlas};owners++;
  const release=()=>{material.removeEventListener('dispose',release);if(!--owners){atlas?.dispose();atlas=null;}};
  material.addEventListener('dispose',release);return material;
}
export function ghostVfxFragment(kind:'fire'|'core'|'smoke', wreck=false) {
  const smoke=kind==='smoke';
  return `
    uniform sampler2D uGhostCels; ${wreck?'uniform float uTime;':'varying float vAtlasFrame;'}
    varying vec2 vUv; varying float vPhase; ${wreck?'varying float vLife;':''}
    ${smoke?sootPigmentGLSL:''}
    ${smoke&&!wreck?'varying float vSmokeHeight;':''}
    void main() {
      vec2 cell=clamp(floor(vUv*vec2(24.,28.)),vec2(0.),vec2(23.,27.));
      if(vPhase>.52)cell.x=23.-cell.x;
      float frame=${wreck?`mod(floor(uTime*${smoke?'5.':'9.'}+vPhase*17.),6.)`:'vAtlasFrame'};
      vec2 atlasUv=(cell+vec2(frame*24.,${smoke?'28.':'0.'})+.5)/vec2(144.,56.);
      vec4 ink=texture2D(uGhostCels,atlasUv);
      if(ink.a<.02)discard;
      ${smoke?`float h=clamp(${wreck?'vLife':'vSmokeHeight'}+.21*(vUv.y-.5),0.,1.);
      float band=clamp((ink.r-.016)*8.7,0.,1.);
      ink.rgb=sootPigment(band,1.-smoothstep(.05,.55,h));
      ink.a*=1.-.54*smoothstep(.52,1.,h);`:''}
      ${smoke&&wreck?'ink.a*=smoothstep(0.,.08,vLife)*(1.-smoothstep(.6,1.,vLife));':''}
      ${kind==='core'?'ink.a*=.78;ink.rgb=mix(ink.rgb,vec3(1.,.75,.29),.14);':''}
      gl_FragColor=ink;
      #include <colorspace_fragment>
    }`;
}
