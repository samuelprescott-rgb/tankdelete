import {runningZerosGLSL} from './runningZeros';
import * as THREE from 'three';

type Block = { path: string; position: [number, number, number]; scale: number };
export const HUT_BREAK_SECONDS = .8;
export const HUT_RESTORE_SECONDS = .85;
export interface GhostScar { point: THREE.Vector3; normal: THREE.Vector3; start: number; phase: number }
export interface GhostSkin {
  entries: { index: number; block: Block }[];
  strike(index: number, point: THREE.Vector3, normal: THREE.Vector3): void;
}
export interface GhostContact {
  t: number; path: string; index: number; skin: GhostSkin | null;
  point: THREE.Vector3; normal: THREE.Vector3;
}

/** Use the scene's own triangles, including the porch opening and inner wall.
 * InstancedMesh.raycast would visit every hut in a batch. Only the small
 * crossing plot list is eligible, and only a swept broad-phase survivor gets
 * a triangle query. No per-frame geometry, raycaster or scene graph changes. */
export function createGhostHutProbe() {
  const ray = new THREE.Raycaster(), shell = new THREE.Mesh();
  const emptyGeometry=shell.geometry, emptyMaterial=shell.material;
  const center=new THREE.Vector3();
  const matrix = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  const hits: THREE.Intersection[] = [];
  const best: GhostContact = { t: Infinity, path: '', index: -1, skin: null,
    point: new THREE.Vector3(), normal: new THREE.Vector3() };
  return (refs: readonly {current:THREE.InstancedMesh | null}[], a:THREE.Vector3, b:THREE.Vector3) => {
    best.t=Infinity; best.skin=null;
    const length=a.distanceTo(b);
    if (length<1e-8) return null;
    ray.ray.origin.copy(a);
    ray.ray.direction.subVectors(b,a).multiplyScalar(1/length);
    ray.near=0; ray.far=length;
    for (const ref of refs) {
      const batch=ref.current;
      const skin:GhostSkin|undefined=batch?.userData.ghostHutSkin;
      if (!batch || !skin) continue;
      for (const {index,block} of skin.entries) {
        const [x,y,z]=block.position, bound=block.scale*1.8;
        if (Math.max(a.x,b.x)<x-bound || Math.min(a.x,b.x)>x+bound ||
          Math.max(a.z,b.z)<z-bound || Math.min(a.z,b.z)>z+bound ||
          Math.max(a.y,b.y)<y-bound || Math.min(a.y,b.y)>y+bound) continue;
        if(ray.ray.distanceSqToPoint(center.set(x,y,z))>bound*bound)continue;
        batch.getMatrixAt(index,matrix); shell.matrixWorld.multiplyMatrices(batch.matrixWorld,matrix);
        shell.geometry=batch.geometry; shell.material=batch.material; hits.length=0;
        shell.raycast(ray,hits);
        for (const hit of hits) {
          if (!hit.face || hit.distance/length>=best.t) continue;
          best.t=hit.distance/length; best.path=block.path; best.index=index; best.skin=skin;
          best.point.copy(hit.point).applyMatrix4(inverse.copy(shell.matrixWorld).invert());
          best.normal.copy(hit.face.normal);
          ray.far=hit.distance;
        }
      }
    }
    hits.length=0; shell.geometry=emptyGeometry; shell.material=emptyMaterial;
    if(!best.skin) return null;
    // Only an actual hit allocates. Do not retain a disposed hut batch on the
    // probe when the next sector is the embassy and contains no file huts.
    const result={...best}; best.skin=null;
    return result;
  };
}

/** Contact is authored in geometry coordinates, before the instance transform.
 * The advancing edge removes actual coverage (and shadow/depth texels); its
 * survivors inherit the plank surface, with no separate floating quads. */
export function ghostHutShader(clock:{value:number}, zeroTile:THREE.DataTexture) {
  return (shader:THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uGhostHutTime=clock;
    shader.uniforms.uGhostZeros={ value:zeroTile };
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec4 ghostScar;
attribute vec4 ghostFace;
attribute float ghostPlank;
varying float vHutPlank;
varying vec3 vHutLocal;
varying vec3 vHutFace;
varying vec4 vHutScar;
varying vec4 vHutAxis;`).replace('#include <begin_vertex>',`#include <begin_vertex>
vHutLocal=position; vHutFace=normal; vHutScar=ghostScar; vHutAxis=ghostFace; vHutPlank=ghostPlank;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform float uGhostHutTime;
uniform sampler2D uGhostZeros;
float splinterHash(vec2 p){return fract(sin(dot(p,vec2(37.21,79.31)))*1783.47);}
vec2 hutPanelUV(vec3 p,vec3 n) {
  if(abs(n.y)>.72)return p.xz;
  return abs(n.x)>abs(n.z)?vec2(-sign(n.x)*p.z,p.y):vec2(sign(n.z)*p.x,p.y);
}
${runningZerosGLSL}
varying float vHutPlank;
varying vec3 vHutLocal;
varying vec3 vHutFace;
varying vec4 vHutScar;
varying vec4 vHutAxis;`).replace('#include <color_fragment>',`
// Six broad saw-cut boards across a typical wall; one staggered splice per
// board, a lit lip, and only a few split-grain strokes. No noise field.
if(vHutPlank>.5 && vHutAxis.w>=0.0) {
  float along=abs(vHutFace.x)>.65 ? vHutLocal.z : vHutLocal.x;
  float y=(vHutLocal.y+.08)/.135, board=floor(y), v=fract(y);
  float ax=along/.79+fract(board*.382+.31);
  float u=fract(ax), piece=fract(board*.381966+floor(ax)*.618+.43);
  float ay=min(.13,max(.009,fwidth(y)*.48)), au=min(.09,max(.005,fwidth(ax)*.48));
  float seam=smoothstep(.045-ay,.045+ay,min(v,1.0-v));
  float splice=smoothstep(.012-au,.012+au,min(u,1.0-u));
  float lip=1.0-smoothstep(.025,.060+ay,abs(v-.12));
  float dryEdge=lip*(.55+.45*step(.22,u));
  float split=(1.0-smoothstep(.012,.033+ay,abs(v-.60-.035*floor(u*4.0))))*
    (1.0-smoothstep(.0,.32,u))*step(.32,piece);
  vec3 plank=mix(vec3(.79,.80,.79),vec3(1.10,1.07,1.01),piece);
  // Sample an offset piece of the painted timber for each board: grain,
  // splits and knots should survive until a hit unweaves this very panel.
  // Gable ends keep their woven infill between the tied courses.
  vec3 grain=diffuseColor.rgb;
  #ifdef USE_MAP
    vec2 paintedUV=vec2((8.+240.*u)/768.,(8.+240.*fract(piece*.64+v*.36))/512.);
    grain=mix(texture2D(map,paintedUV).rgb,diffuseColor.rgb,.10+.18*smoothstep(.72,.98,abs(vHutFace.z)));
  #endif
  diffuseColor.rgb=grain*plank*(.69+.31*seam*splice)+vec3(.114,.105,.082)*dryEdge-vec3(.063,.050,.039)*split;
}
#include <color_fragment>`).replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
float ghostInk=0.0;

float releaseRim=0.0;
float restoreRim=0.0;
if(vHutAxis.w==3.0) {
  // Reverse pixel dissolve. The surface is solid behind the rising seam.
  // Both the color and depth materials use the same cell and reveal time.
  float remaining=vHutScar.w-uGhostHutTime;
  if(remaining>0.0) {
    vec3 cell=floor(vHutLocal*10.0);
    float jitter=fract(dot(cell,vec3(.7549,.5698,.4383)));
    float height=vHutLocal.y+.22*(jitter-.5);
    float front=mix(-.85,1.95,clamp(1.-remaining/${HUT_RESTORE_SECONDS.toFixed(2)},0.,1.));
    if(height>front) discard;
    restoreRim=1.-smoothstep(.02,.21,front-height);
  }
} else if(vHutScar.w>=0.0) {
  float age=max(0.0,uGhostHutTime-vHutScar.w);
  bool unloading=vHutAxis.w>1.5;
  vec3 axis=normalize(vHutAxis.xyz);
  vec3 face=normalize(vHutFace);
  vec3 localDelta=vHutLocal-vHutScar.xyz;
  float dist=length(localDelta);
  vec3 proj=unloading ? face : axis;
  vec2 uv=hutPanelUV(vHutLocal,proj);
  vec2 glyph=vec2(uv.x/.00046,(uv.y+.08)/.00064);
  vec2 dx=dFdx(glyph),dy=dFdy(glyph);
  vec2 markTexel=vec2(.020,.042/1.65);
  vec2 markDx=dFdx(uv)/markTexel, markDy=dFdy(uv)/markTexel;
  if(!unloading && abs(dot(localDelta,axis))<.105 && dot(face,axis)>.48) {
    vec2 q=hutPanelUV(localDelta,axis);
    vec2 seed=floor(vHutScar.xy*167.+vHutScar.z*49.+vHutAxis.xz*7.);
    // Split along uneven grain rows. Each contact has its own outline, fixed
    // to the panel while the first hit is armed.
    float row=floor(q.y/.031+.5), a=splinterHash(seed+row), b=splinterHash(seed-row-17.);
    float reach=max(0.,1.-abs(row)*.145);
    float left=reach*(.12+.37*a), right=reach*(.15+.32*b);
    float stagger=(splinterHash(seed+floor(row*.5)+11.)-.5)*.13;
    float x=q.x+row*(splinterHash(seed+3.)-.5)*.045+stagger;
    float edge=min(x+left,right-x);
    if(reach>0. && edge>0.) {
      // Short four-digit runs leave strips of bare timber between the rows.
      vec2 cell=q/vec2(.020,.042);
      cell.x+=floor(splinterHash(seed+floor(cell.y))*6.);
      float line=fract(cell.y);
      vec2 digit=vec2(cell.x,line*1.65);
      float ink=textureGrad(uGhostZeros,digit,markDx,markDy).r;
      float occupied=step(mod(floor(cell.x),6.),3.)*(1.-smoothstep(.55,.62,line));
      float hold=vHutAxis.w>.5 ? 1. : 1.-smoothstep(.9,1.4,age);
      ghostInk=ink*occupied*(.61+.24*a)*smoothstep(0.,.012,edge)*hold;
    }
  } else if(unloading) {
    float radius=mix(.24,4.6,clamp(age/${HUT_BREAK_SECONDS.toFixed(2)},0.,1.));
    if(dist<radius+.05) {
      vec2 chip=floor(uv*47.);
      float noise=fract(sin(dot(chip,vec2(12.9898,78.233)))*4375.5453);
      float edge=radius-dist+(noise-.5)*.042;
      releaseRim=1.-smoothstep(.008,.034,abs(edge));
      if(edge>0.) {
        if(edge>.42+noise*.16)discard;
        vec2 rain=runningZeros(uGhostZeros,glyph,dx,dy,uv*vec2(64.,5.5),age);
        if(rain.x<.008)discard;
        ghostInk=min(1.,rain.x*(.11+1.85*rain.y))*smoothstep(0.,.025,edge);
      }
    }
  }
}`).replace('#include <opaque_fragment>',`
outgoingLight=mix(outgoingLight,vec3(.91,.54,.25),ghostInk);
outgoingLight=mix(outgoingLight,vec3(1.7,.57,.12),releaseRim);
outgoingLight=mix(outgoingLight,vec3(.43,1.35,.84),restoreRim);
#include <opaque_fragment>`);
  };
}

export function ghostHutAttribute(count:number, empty=false) {
  const a=new THREE.InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(THREE.DynamicDrawUsage);
  if (empty) for (let i=0;i<count;i++) a.setW(i,-1);
  return a;
}
