import {eclipseBearingGLSL} from './hordeEclipse';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {createTracerFogLight,tracerFogGLSL} from './tracerFogLight';
import { PILLAR_COUNT, pillarGLSL, pillarUniforms, readPillars, scenePillars } from './summoningLight';
import { CHECKPOINT_FLOOD, CHECKPOINT_LAMPS, checkpointBulb } from './checkpointLamps';

// Narrow beds across the gate and behind the two approaches. Each radius is
// in world metres. The gap on the service road keeps the near fight clear.
const BANKS = [
  { center: [-5.2, .94, 2.6], radius: [6.7, 1.55, 2.9] },
  { center: [9.2, .91, 5.8], radius: [7.1, 1.7, 3.4] },
  { center: [-1, 1.15, 11.1], radius: [8.3, 2.1, 3.1] },
  { center: [18.6, 1.5, 11], radius: [4.5, 3.0, 8.2] },
  { center: [18, 1.1, -5.2], radius: [4.8, 2.0, 5.6] },
  { center: [41.5, 1.4, 14.5], radius: [3.7, 3.5, 11] },
  { center: [27, 1.6, 40.5], radius: [13, 3.8, 3.4] },
] as const;
const SLICES = 12;
// Composite mist over the river, paddies and surface wakes, before airborne rain.
const FOG_RENDER_ORDER = 4.5;

function noiseVolume() {
  const size = 32, bytes = new Uint8Array(size ** 3);
  let seed = 1975;
  for (let i = 0; i < bytes.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    bytes[i] = seed >>> 24;
  }
  const texture = new THREE.Data3DTexture(bytes, size, size, size);
  texture.format = THREE.RedFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function makeFog() {
  const noise = noiseVolume();
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i < SLICES; i++) {
    // Back to front within the ellipsoid. Opaque limbs and trunks stop
    // individual samples, even when an actor is standing inside the mist.
    const z = 2 * (i + .5) / SLICES - 1;
    for (const [x,y] of [[-1,-1],[1,-1],[-1,1],[1,1]]) vertices.push(x,y,z);
    const v = 4 * i;
    indices.push(v,v+1,v+2,v+2,v+1,v+3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const bulbs = CHECKPOINT_LAMPS.map(lamp => new THREE.Vector3(...checkpointBulb(lamp)));
  const axes = CHECKPOINT_LAMPS.map((lamp,i) => new THREE.Vector3().fromArray(lamp.aim).sub(bulbs[i]).normalize());
  const source = new THREE.Vector3().fromArray(CHECKPOINT_FLOOD.position);
  const axis = new THREE.Vector3().fromArray(CHECKPOINT_FLOOD.aim).sub(source).normalize();
  const material = new THREE.ShaderMaterial({
    uniforms: { smoke: { value: noise }, seconds: { value: 0 }, bulb: { value: bulbs }, beam: { value: axes },
      floodSource: {value: source}, floodAxis: {value: axis}, ...pillarUniforms() },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    vertexShader: `
      varying vec3 samplePos, local;
      varying float stepLength;
      void main(){
        vec3 radius=vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
        vec3 eye=cameraPosition-modelMatrix[3].xyz;
        vec3 ray=normalize(eye/radius);
        vec3 across=normalize(cross(abs(ray.y)>.98?vec3(0,0,1):vec3(0,1,0),ray));
        vec3 up=cross(ray,across);
        float ring=sqrt(1.-position.z*position.z);
        local=ray*position.z+ring*(across*position.x+up*position.y);
        samplePos=(modelMatrix*vec4(local,1.)).xyz;
        stepLength=(2./${SLICES}.)/max(.05,length(normalize(eye)/radius));
        gl_Position=projectionMatrix*viewMatrix*vec4(samplePos,1.);
      }`,
    fragmentShader: `
      precision highp sampler3D;
      uniform sampler3D smoke;
      uniform float seconds;
      uniform vec3 bulb[2],beam[2];
      uniform vec3 floodSource,floodAxis;
      varying vec3 samplePos,local;
      varying float stepLength;
      ${eclipseBearingGLSL}
      ${tracerFogGLSL}
      ${pillarGLSL}
      float grain(vec3 p){return texture(smoke,p/32.).r;}
      void main(){
        float edge=1.-dot(local,local);
        if(edge<=0.)discard;
        vec3 ray=samplePos-floodSource;
        float along=dot(ray,floodAxis);
        float across=length(ray-along*floodAxis);
        float radius=max(.001,along*${Math.tan(CHECKPOINT_FLOOD.angle).toFixed(6)});
        // Same projection axes as the spotlight camera and its shutter map.
        vec3 right=normalize(cross(floodAxis,vec3(0.,1.,0.)));
        vec3 up=cross(right,floodAxis);
        float slit=abs(dot(ray,up)-${CHECKPOINT_FLOOD.shutterSlope}*dot(ray,right))/radius;
        float shutter=1.-smoothstep(${(CHECKPOINT_FLOOD.shutterHalfHeight-CHECKPOINT_FLOOD.shutterFeather).toFixed(4)},${CHECKPOINT_FLOOD.shutterHalfHeight},slit);
        float cone=shutter*(1.-smoothstep(${(1-CHECKPOINT_FLOOD.penumbra).toFixed(2)}*radius,radius,across))*smoothstep(0.,.50,along)
          *(1.-smoothstep(16.,${CHECKPOINT_FLOOD.range.toFixed(1)},along));
        #ifdef CROSSING_SHAFT
          if(cone<.003)discard;
        #endif
        // A wind shared across the gate carries the very same curl from
        // moonlight through the sodium pool and out the other side.
        vec3 p=samplePos-vec3(.91,0.,-.36)*seconds;
        vec3 coarse=p*vec3(.37,.66,.32);
        float eddy=grain(coarse);
        float fold=grain(p*vec3(.74,1.48,.55)+vec3(eddy*1.85,-eddy*1.7,seconds*.09));
        float wisps=grain(p*vec3(1.24,2.35,.92)+vec3(0.,fold*2.9,-eddy*1.7));
        // Metre-scale banks move broadside through the fixed shutter. Use
        // one world-space density field for the amber shaft and its cool banks.
        float drift=.92*samplePos.x+.64*samplePos.z-1.48*seconds;
        float roll=.5+.5*cos(drift+2.8*eddy+1.15*samplePos.y);
        float bankCrest=smoothstep(.39,.82,roll+.37*(fold-.5));
        float lane=(1.-smoothstep(3.,7.,across))*smoothstep(-1.,2.,along)
          *(1.-smoothstep(18.,25.,along));
        #ifdef CROSSING_SHAFT
          // Even the clear stretches carry a little rain. Ragged sheets of
          // vapour travel through the fixed beam and briefly catch its light.
          float wave=sin(p.x*.8+p.z*.51+samplePos.y*2.4+4.1*eddy);
          float foldLight=smoothstep(.18,.80,.48*fold+.32*wisps+.20*wave);
          // The paddy bank on the far side holds the densest vapour. The
          // open road in front can be brightly lit without hiding a coat.
          float bankSide=ray.z-along*floodAxis.z+.58*wave;
          float bankMist=mix(.21,1.,smoothstep(-.75,.98,bankSide));
          float extinction=cone*smoothstep(0.,.19,edge)*(.022+.09*foldLight+
            bankCrest*(.48+.47*foldLight))*mix(bankMist,1.,.35*bankCrest);
          vec3 honey=mix(vec3(.48,.154,.024),vec3(1.16,.50,.094),.50*foldLight+.50*bankCrest);
          gl_FragColor=vec4(honey,1.-exp(-stepLength*extinction));
        #else
        // Fold a thin sheet vertically as it rolls. There is open air both
        // above and below the lip, so silhouettes can cut across it.
        float crest=-.39+.92*eddy+.26*fold;
        float rolledHeight=local.y-crest+.12*sin(p.x*.96+p.z*.59+3.7*fold);
        float lipBody=exp2(-14.*rolledHeight*rolledHeight);
        float ground=1.-smoothstep(-.4,.28,local.y);
        float density=(.30*ground+.91*lipBody)*smoothstep(.28,.79,eddy*.49+fold*.35+wisps*.16)
          *smoothstep(0.,.49,edge)*smoothstep(-.30,.36,samplePos.y);
        float billow=exp2(-4.6*rolledHeight*rolledHeight)*smoothstep(0.,.44,edge)
          *smoothstep(-.30,.36,samplePos.y);
        density=density*(1.-.58*lane)+lane*bankCrest*billow*(1.1+1.9*fold);
        float key=0.;
        for(int i=0;i<2;i++){
          vec3 delta=samplePos-bulb[i];
          float axial=dot(delta,beam[i]);
          float offAxis=length(delta-axial*beam[i]);
          float spread=.31+max(0.,axial)*.72;
          float core=exp2(-2.8*offAxis*offAxis/(spread*spread));
          key+=core*smoothstep(0.,.70,axial)*(1.-smoothstep(4.,8.8,axial));
        }
        // The upper curl catches moonlight. Its belly stays blue-grey.
        float lip=smoothstep(.24,.82,fold+.26*local.y);
        vec3 moon=mix(vec3(.028,.064,.084),vec3(.14,.24,.29),lip);
        float skyFacing=smoothstep(.42,.94,dot(normalize(samplePos-cameraPosition),eclipseRay));
        moon+=vec3(.078,-.017,.118)*skyFacing*lip*lip;
        vec3 sodium=mix(vec3(.32,.092,.018),vec3(.79,.34,.072),lip);
        vec3 light=mix(moon,sodium,smoothstep(.035,.60,key+.78*cone));
        float alpha=1.-exp(-density*stepLength*(.27+.21*key));
        gl_FragColor=vec4(light,alpha);
        #endif
        float gold = 0.;
        for (int i=0; i<uPillarCount; i++) {
          vec4 source = uPillars[i];
          vec3 d = samplePos-source.xyz;
          float r2 = dot(d.xz,d.xz);
          float spill = pillarSpill(source.w);
          gold += spill * exp2(-r2*.105) * (1.-smoothstep(2.4,5.8,d.y));
        }
        #ifdef PILLAR_MIST
          float filament = smoothstep(.23,.82,.55*eddy+.30*fold+.15*wisps);
          gl_FragColor = vec4(mix(vec3(.59,.31,.10),vec3(1.42,.98,.42),fold),
            gl_FragColor.a*min(1.,gold)*(.24+.70*filament));
        #else
          gl_FragColor.rgb += vec3(1.55,1.03,.40)*gold*(.55+.60*wisps);
        #endif
        // Existing extinction controls how much illuminated mist reaches
        // the camera. Clear gaps stay clear, even directly behind a tracer.
        if(fogShotCount>0)gl_FragColor.rgb+=tracerScatter(samplePos,stepLength,wisps);
        #include <colorspace_fragment>
      }`,
  });
  const shaft = material.clone();
  shaft.defines = {CROSSING_SHAFT: 1};
  shaft.uniforms = material.uniforms;
  const arrivalMist = material.clone();
  arrivalMist.defines = {PILLAR_MIST: 1};
  arrivalMist.uniforms = material.uniforms;
  const tracerLight=createTracerFogLight();
  tracerLight.bind(material);tracerLight.bind(shaft);tracerLight.bind(arrivalMist);
  return {geometry,material,shaft,arrivalMist,noise};
}

export function CheckpointFog() {
  const fog = useMemo(makeFog, []);
  const patches = useRef<Array<THREE.Mesh | null>>([]);
  const lighting = useMemo(pillarUniforms, []);
  useFrame(({scene},dt) => {
    fog.material.uniforms.seconds.value += Math.min(.1,dt);
    readPillars(scene, lighting);
    fog.material.uniforms.uPillarCount.value = lighting.uPillarCount.value;
    fog.material.uniforms.uPillars.value = lighting.uPillars.value;
    let count = 0;
    for (const source of scenePillars(scene)) {
      if (source.age <= .35 || source.age >= 2.85) continue;
      const patch = patches.current[count++];
      if (patch) {
        patch.position.copy(source.position);
        patch.position.y += .73;
        patch.visible = true;
      }
    }
    for (let i=count; i<patches.current.length; i++) {
      const patch = patches.current[i];
      if (patch) patch.visible = false;
    }
  });
  useEffect(() => () => { fog.geometry.dispose(); fog.material.dispose(); fog.shaft.dispose(); fog.arrivalMist.dispose(); fog.noise.dispose(); }, [fog]);
  return <group name="checkpoint-drifting-fog" dispose={null}>
    {BANKS.map(({center,radius},i) => <mesh key={i} position={center} scale={radius}
      geometry={fog.geometry} material={fog.material} renderOrder={FOG_RENDER_ORDER} />)}
    <mesh name="east-post-beam-in-rain" position={[-1.0,2.0,3.7]} scale={[12.4,3.8,4.8]}
      geometry={fog.geometry} material={fog.shaft} renderOrder={FOG_RENDER_ORDER} />
    {Array.from({length: PILLAR_COUNT}, (_,i) => <mesh key={'arrival'+i} name={'summoning-mist-'+i}
      ref={node => { patches.current[i] = node; }} scale={[4.1,1.12,3.2]} visible={false}
      geometry={fog.geometry} material={fog.arrivalMist} renderOrder={FOG_RENDER_ORDER} />)}
  </group>;
}
