import * as THREE from 'three';
import { SMOKE_DRIFT_RATE } from './smokeMotion';
import {prepareSmokeInk,rollingSmokeGLSL} from './rollingSmoke';
import { attachGhostVfxAtlas, ghostVfxFragment, ghostVfxInk, FX_W, FX_H, FX_FRAMES } from './ghostVfxAtlas';

export function createNapalmParticleGeometry(width: number, height: number, count: number, bank:'fire'|'smoke'='fire') {
  const geometry=new THREE.BufferGeometry(),positions:number[]=[],celA:number[]=[],celB:number[]=[],indices:number[]=[];
  const ink=ghostVfxInk(),stride=FX_W*FX_FRAMES,rows=bank==='smoke'?FX_H:0;
  // Partition the cel in four disjoint horizontal strips. Fit each strip to
  // *all* of that cel's ink, including disconnected, single-pixel embers.
  // Store its integer UV corners for all six frames in two vec3 attributes.
  // Slots are immutable; changing poses needs no pointer, allocation or upload.
  for(let y0=0;y0<FX_H;y0+=7){
    const coordinates:number[][]=[[],[],[],[]];
    for(let f=0;f<FX_FRAMES;f++){
      let x0=FX_W,x1=0,lo=FX_H,hi=0;
      for(let y=y0;y<Math.min(FX_H,y0+7);y++)for(let x=0;x<FX_W;x++)
        if(ink[4*((y+rows)*stride+f*FX_W+x)+3]){
          x0=Math.min(x0,x);x1=Math.max(x1,x+1);lo=Math.min(lo,y);hi=Math.max(hi,y+1);
        }
      if(!hi){
        x0=x1=FX_W/2;
        lo=hi=y0; // Collapse inside this strip, including while transitioning between poses.
      }
      const corners=[lo*32+x0,lo*32+x1,hi*32+x1,hi*32+x0];
      for(let v=0;v<4;v++)coordinates[v].push(corners[v]);
    }
    const n=positions.length/3;
    for(let i=0;i<4;i++){
      positions.push((i===0||i===3?-.5:.5)*width,(i<2?-.5:.5)*height,0);
      celA.push(...coordinates[i].slice(0,3));celB.push(...coordinates[i].slice(3));
    }
    indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  geometry.setIndex(indices);geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('aCelA',new THREE.Float32BufferAttribute(celA,3));
  geometry.setAttribute('aCelB',new THREE.Float32BufferAttribute(celB,3));
  geometry.setAttribute('aParticleSeed', new THREE.InstancedBufferAttribute(
    Float32Array.from({ length: count }, (_, index) => ((index * 0.61803398875) + 0.13) % 1), 1));
  return geometry;
}

/** Six-cel instanced fire/smoke, with the existing CPU particle/strike clock.
 * No new postprocess, point lights, texture requests or particle allocations. */
export function createNapalmParticleMaterial(time: { value: number }, kind: 'fire' | 'core' | 'smoke', atlas?:THREE.Texture, airInk?:string) {
  const smoke = kind === 'smoke';
  const blendSmoke = smoke && atlas !== undefined;
  const celRate = smoke ? 5 * SMOKE_DRIFT_RATE : 9;
  return attachGhostVfxAtlas(new THREE.ShaderMaterial({
    uniforms: { uTime: time, ...(atlas?{cloudAtlas:{value:prepareSmokeInk(atlas)}}:{}),
      ...(airInk?{airInk:{value:new THREE.Color(airInk)},airStrength:{value:1}}:{}) }, transparent: true, depthWrite: false,
    depthTest: true, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    vertexShader: `
      #include <fog_pars_vertex>
      attribute float aParticleSeed;
      attribute vec3 aCelA;attribute vec3 aCelB;uniform float uTime;
      varying vec2 vUv;
      varying float vPhase;varying float vAtlasFrame;
      ${smoke?'varying float vSmokeHeight;':''}
      ${blendSmoke?'varying float vSmokeBlend;varying vec2 vFromUv,vToUv;':''}
      vec2 celCorner(int frame){
        int slot=frame%3;
        float corner=frame<3?aCelA[slot]:aCelB[slot];
        float row=floor(corner/32.);
        return vec2((corner-row*32.)/24.,row/28.);
      }
      void main() {
        vPhase = aParticleSeed;
        vAtlasFrame=mod(floor(uTime*${celRate.toFixed(1)}+vPhase*17.),6.);
        int frame=int(vAtlasFrame);
        vUv=celCorner(frame);
        ${blendSmoke?`
          // Morph the tight strip between poses and sample each pose in its own UVs.
          vFromUv=vUv;
          vToUv=celCorner((frame+1)%6);
          vSmokeBlend=smoothstep(0.,1.,fract(uTime*${celRate.toFixed(1)}+vPhase*17.));
          vUv=mix(vFromUv,vToUv,vSmokeBlend);
        `:''}
        if(vPhase>.52)vUv.x=1.0-vUv.x;
        vec2 sprite=(vUv*2.0-1.0)*abs(position.xy);
        mat4 worldInstance = modelMatrix * instanceMatrix;
        vec4 mvCenter = viewMatrix * worldInstance * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 size = vec2(length(worldInstance[0].xyz), length(worldInstance[1].xyz));
        ${smoke ? `
          vSmokeHeight=clamp(instanceMatrix[3].y/7.,0.,1.);
          // Rising smoke has no ground contact and can face the full camera.
          mvCenter.xy += sprite * size;
        ` : `
          // Turn on the ground plane only. If this quad pitches with the
          // chase camera its foot slides toward the lens and appears to float.
          vec2 groundRight = vec2(viewMatrix[0].x, viewMatrix[2].x);
          groundRight *= inversesqrt(max(0.00001, dot(groundRight, groundRight)));
          vec2 across = groundRight * sprite.x * size.x;
          mvCenter += viewMatrix * vec4(across.x, sprite.y * size.y, across.y, 0.0);
        `}
        vec4 mvPosition = mvCenter;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: smoke&&atlas ? `
      #include <fog_pars_fragment>
      ${rollingSmokeGLSL}
      uniform float uTime;
      uniform sampler2D uGhostCels;
      ${airInk?'uniform vec3 airInk; uniform float airStrength;':''}
      varying vec2 vUv;
      varying float vPhase,vAtlasFrame,vSmokeHeight,vSmokeBlend;
      varying vec2 vFromUv,vToUv;
      vec4 smokeCel(vec2 uv,float frame){
        vec2 cell=clamp(floor(uv*vec2(24.,28.)),vec2(0.),vec2(23.,27.));
        return texture2D(uGhostCels,(cell+vec2(frame*24.,28.)+.5)/vec2(144.,56.));
      }
      void main(){
        float frame=vAtlasFrame;
        vec4 cel=mix(smokeCel(vFromUv,frame),smokeCel(vToUv,mod(frame+1.,6.)),vSmokeBlend);
        float h=clamp(vSmokeHeight+.25*(vUv.y-.5),0.,1.);
        float beat=uTime*${SMOKE_DRIFT_RATE}*1.46+vPhase*6.283;
        vec4 ink=rollingSmoke(vUv,h,vPhase*6.283,beat,clamp((cel.r-.016)*8.7,0.,1.));
        // Keep the six-cel silhouette as a turning shoulder and let the
        // painted body show through the gaps opened by the curl.
        ink.a*=cel.a*(1.-.55*smoothstep(.56,1.,h));
        ink.a*=mix(.82,1.,smoothstep(.06,.30,vSmokeHeight));
        ${airInk?`float root=1.-smoothstep(.08,.40,h);
          float veil=mix(airStrength,1.,root*.72);
          ink.rgb=mix(ink.rgb,airInk,(.49+.33*h)*veil);
          ink.rgb=mix(ink.rgb,airInk*.36,.28*root);
          ink.a*=mix(1.,.69-.27*h+.095*root,veil);`:''}
        if(ink.a<.02)discard;
        gl_FragColor=ink;
        #include <colorspace_fragment>
        #include <fog_fragment>
      }` : ghostVfxFragment(kind),
  }));
}

export function createNapalmScorchMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#261711', roughness: 1,
    transparent: true, opacity: 0.78, depthWrite: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vScorchUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvScorchUv = uv;');
    shader.fragmentShader = 'varying vec2 vScorchUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 p = vScorchUv * 2.0 - 1.0;
      float edgeNoise = sin(p.x * 19.0 + sin(p.y * 13.0)) * sin(p.y * 17.0) * 0.09;
      diffuseColor.a *= 1.0 - smoothstep(0.28, 0.98, length(p) + edgeNoise);
    `);
  };
  material.customProgramCacheKey = () => 'napalm-soft-scorch-v1';
  return material;
}
