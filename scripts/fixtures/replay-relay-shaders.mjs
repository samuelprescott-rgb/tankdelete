// Offline shader-source replay. Three assembles the actual shader bytes;
// this sink only records shaderSource strings, never creates a GPU context.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {WebGLPrograms} from 'three/src/renderers/webgl/WebGLPrograms.js';
import {WebGLProgram} from 'three/src/renderers/webgl/WebGLProgram.js';
import {ShaderChunk} from 'three/src/renderers/shaders/ShaderChunk.js';

export async function replayRelayShaders(capturePath, objects) {
  const capture=JSON.parse(await readFile(capturePath,'utf8')), recorded=[];
  const nop=()=>{}, sink={createProgram:()=>({}),createShader:()=>({}),shaderSource:(_,s)=>recorded.push(s),
    attachShader:nop,compileShader:nop,linkProgram:nop,bindAttribLocation:nop};
  const renderer={getContext:()=>sink,getRenderTarget:()=>({}),shadowMap:{enabled:true,type:THREE.PCFShadowMap},
    state:{buffers:{depth:{getReversed:()=>false}}}};
  const noMaps={get:()=>null},stage=new THREE.Scene();stage.fog=new THREE.Fog(0,10,100);
  const programs=WebGLPrograms(renderer,noMaps,noMaps,{has:()=>false},{precision:'highp'}, {}, {numPlanes:0,numIntersection:0});
  const lights={directional:[0,0],point:[0],spot:[],spotLightMap:[],rectArea:[],hemi:[0],directionalShadowMap:[0],
    pointShadowMap:[],spotShadowMap:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};
  const previous={...ShaderChunk};
  try {
    // Three's distributed module strips GLSL comments/whitespace during its
    // own build; replay the shipped chunks rather than expanded author files.
    Object.assign(ShaderChunk, THREE.ShaderChunk);
    for(const object of objects){
      const params=programs.getParameters(object.material,lights,[0],stage,object);
      Object.assign(params,{vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader});
      new WebGLProgram(renderer,programs.getProgramCacheKey(params),params,{});
    }
  } finally {Object.assign(ShaderChunk,previous);}
  const fingerprints=new Set(recorded.map(source=>{
    let hash=0x811c9dc5;
    for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),0x01000193);
    return 'fnv1a32-codeunits:'+(hash>>>0).toString(16).padStart(8,'0')+':'+source.length;
  }));
  const relevant=capture.shaders.filter(s=>s.type==='MeshBasicMaterial' && 'USE_COLOR' in s.defines && !('USE_FOG' in s.defines));
  assert.equal(relevant.length,5,'Requires a complete captured ordinary/instanced/double-sided regression');
  assert.deepEqual(fingerprints,new Set(relevant.map(s=>s.fingerprint)));
  console.log('CPU replay: all five shader fingerprints match the three captured WebKit links byte-for-byte.');
}
