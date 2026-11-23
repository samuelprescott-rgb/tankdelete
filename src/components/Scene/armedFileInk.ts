import * as THREE from 'three';
import {createZeroTile} from './runningZeros';

/** One unit-size art set per field. Each armed file still has separate mesh
 * transforms and render-list entries, so transparent sorting is unchanged. */
export function createArmedFileInk() {
  const cage = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.55, 1.35),
    new THREE.MeshBasicMaterial({color:'#ffa263', wireframe:true, transparent:true, opacity:.38, toneMapped:false}));
  const zeroTile=createZeroTile();
  const material=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false});
  material.onBeforeCompile=s=>{
    s.uniforms.zeroTile={value:zeroTile};
    s.vertexShader='varying vec2 ringXY;\n'+s.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      ringXY=position.xy;
      float angle=atan(position.y,position.x);
      float seed=dot(modelMatrix[3].xz,vec2(.43,.67));
      transformed.xy*=1.+.043*sin(3.*angle+seed)+.028*cos(5.*angle-seed);`);
    s.fragmentShader='uniform sampler2D zeroTile; varying vec2 ringXY;\n'+
      s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float turn=atan(ringXY.y,ringXY.x)/6.2831853+.5;
        float row=(length(ringXY)-.80)/.25;
        // Four zeros, then four empty cells. Shift adjacent rows so the
        // clearings reveal ground all the way around the warped footprint.
        float radial=row*3.;
        float slot=turn*216.+floor(radial)*3.;
        float line=fract(radial);
        vec2 glyph=vec2(slot,line*1.6);
        // Differentiate the continuous coordinates before wrapping the rows
        // or crossing the angle seam, so grazing views select the right mip.
        vec2 tangent=vec2(-ringXY.y,ringXY.x)*(216./(6.2831853*dot(ringXY,ringXY)));
        vec2 dx=vec2(dot(tangent,dFdx(ringXY)),dFdx(radial)*1.6);
        vec2 dy=vec2(dot(tangent,dFdy(ringXY)),dFdy(radial)*1.6);
        float zeros=textureGrad(zeroTile,glyph,dx,dy).r;
        float run=1.-step(4.,mod(slot,8.));
        float ink=run*(1.-smoothstep(.56,.625,line))*zeros;
        float accent=smoothstep(.72,.96,cos(turn*31.416));
        float feather=smoothstep(0.,.08,row)*(1.-smoothstep(.92,1.,row));
        diffuseColor.rgb=mix(vec3(.84,.042,.012),vec3(1.22,.93,.80),accent);
        diffuseColor.a*=ink*feather;`);
  };
  material.customProgramCacheKey=()=>'hut-warning-code';
  const ring=new THREE.Mesh(new THREE.RingGeometry(.80,1.05,72),material);
  return { cage, ring, zeroTile, dispose() {
    zeroTile.dispose(); cage.geometry.dispose(); cage.material.dispose(); ring.geometry.dispose(); ring.material.dispose();
  } };
}
export type ArmedFileInk = ReturnType<typeof createArmedFileInk>;
const fields = new WeakMap<THREE.Scene, ArmedFileInk>();
export function registerArmedFileInk(scene: THREE.Scene, ink: ArmedFileInk) {
  fields.set(scene, ink);
  return () => { if (fields.get(scene) === ink) fields.delete(scene); };
}
export function armedFileRenderBatch(scene: THREE.Scene) {
  const ink = fields.get(scene);
  // A real wireframe draw also creates Three's geometry-specific wire index.
  return ink ? [ink.cage.clone(), ink.ring.clone()] : [];
}
