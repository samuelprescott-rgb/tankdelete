import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_DEPTH, ARENA_WIDTH } from '../../lib/arenaBounds';
import { ROAD_GRID_SPACING } from '../../lib/constants';
import {useCrossingWeather,type CrossingWeather} from './crossingWeather';
import { RIVER_SKY_TEXTURES } from './riverDawnAsset';
import { crossingSunFunction, gradeDawnGLSL } from './crossingSun';
import {createRiverStations,createRiverCrossings,type RiverStation,type RiverCrossing} from './riverLayout';
import {DRY_SOIL,riverApron} from './riverVerticalSection';

// Large pools of ochre soil and cool moss sit beneath directional drybrush.
// World anchoring keeps both the paint and tire ruts stable while driving.
const groundFunctions = /* glsl */ `
  varying vec2 vGroundXZ;
  #ifdef SIGNAL_ERODED_BANK
    varying vec2 vBankProfile;
  #endif
  uniform float uGroundSeed;
  uniform float uRoadSpacing;
  uniform float uRoadStrength;
  uniform vec3 uTrestle;
  uniform float uRainGround;
  uniform vec2 uRoadExtent;
  uniform vec3 uSoil;
  uniform vec3 uMoss;
  uniform vec3 uDryEarth;
  uniform vec3 uPackedEarth;
  uniform sampler2D uGroundDetail;
  uniform float uHasGroundDetail;
  float groundHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031 + uGroundSeed);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float groundNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(groundHash(i), groundHash(i + vec2(1., 0.)), f.x),
      mix(groundHash(i + vec2(0., 1.)), groundHash(i + 1.), f.x), f.y);
  }
`;

// Cached once across ground, relief and sector reloads. Individual materials
// own their generated bump grain, not this shared photographic base colour.
export function useTerrainDetail() {
  const texture = useLoader(THREE.TextureLoader, '/images/textures/jungle-ground-v1.png');
  return useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }, [texture]);
}

export function createTerrainMaterial(seed: number, roadStrength = 1, detail?: THREE.Texture, surface: 'ground' | 'relief' = 'ground', trestle?:RiverCrossing, dawn?:THREE.Texture, weather?:CrossingWeather|null) {
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  let randomState = (seed >>> 0) || 1968;
  for (let index = 0; index < size * size; index++) {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    const value = 75 + (randomState >>> 0) % 120;
    pixels.set([value, value, value, 255], index * 4);
  }
  const grain = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(58, 58);
  grain.magFilter = THREE.LinearFilter;
  grain.minFilter = THREE.LinearMipmapLinearFilter;
  grain.generateMipmaps = true;
  grain.anisotropy = 4;
  grain.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.98, metalness: 0,
    bumpMap: grain, bumpScale: 0.012,
  });
  const rain = { value: 0 };
  if (surface === 'relief') material.defines = { ...material.defines, SIGNAL_ERODED_BANK: 1 };
  material.onBeforeCompile = shader => {
    if(weather)Object.assign(shader.uniforms,weather);
    if(dawn)shader.uniforms.uRutSky={value:dawn};
    Object.assign(shader.uniforms, {
      uTrestle:{value:trestle?new THREE.Vector3(trestle.centerX,trestle.z,trestle.length*.5):new THREE.Vector3(0,0,0)},
      uGroundSeed: { value: (Math.abs(seed) % 997) / 997 },
      uRoadSpacing: { value: ROAD_GRID_SPACING },
      uRoadStrength: { value: roadStrength },
      uRainGround: rain,
      uRoadExtent: { value: new THREE.Vector2(ARENA_WIDTH * 0.5, ARENA_DEPTH * 0.5) },
      uSoil: { value: new THREE.Color('#625244') },
      uMoss: { value: new THREE.Color('#4b6145') },
      uDryEarth: { value: new THREE.Color('#937850') },
      uPackedEarth: { value: new THREE.Color('#79654f') },
      uGroundDetail: { value: detail ?? grain },
      uHasGroundDetail: { value: detail ? 1 : 0 },
    });
    shader.vertexShader = (surface==='ground'?'attribute float riverShelfWash; varying float vRiverShelfWash;\n':'')+'varying vec2 vGroundXZ;\n#ifdef SIGNAL_ERODED_BANK\nvarying vec2 vBankProfile;\n#endif\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 groundVertex = vec4(position, 1.0);
       #ifdef USE_INSTANCING
         groundVertex = instanceMatrix * groundVertex;
       #endif
       #if defined(SIGNAL_ERODED_BANK) && defined(USE_INSTANCING)
         // Real local ellipsoid slope, corrected for each mound's nonuniform
         // scale. This paints its geometry; the drivable surface stays unchanged.
         vec3 bankScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
         vBankProfile = vec2(groundVertex.y, 1.0 - normalize(normal / bankScale).y);
       #elif defined(SIGNAL_ERODED_BANK)
         vBankProfile = vec2(groundVertex.y, 1.0 - normal.y);
       #endif
       ${surface==='ground'?'vRiverShelfWash=riverShelfWash;':''}
       vGroundXZ = (modelMatrix * groundVertex).xz;`);
    shader.fragmentShader = (surface==='ground'?'varying float vRiverShelfWash;\n':'')+(dawn?'uniform sampler2D uRutSky;\n'+gradeDawnGLSL:'') + groundFunctions + crossingSunFunction + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
      #include <color_fragment>
      float broad = groundNoise(vGroundXZ * 0.13);
      float medium = groundNoise(vGroundXZ * 0.69 + 3.7);
      vec2 brushAxes = vec2(dot(vGroundXZ, vec2(0.91, 0.41)), dot(vGroundXZ, vec2(-0.41, 0.91)));
      vec2 drift = vec2(broad * 0.8, medium * 0.45);
      vec2 brushPoint = (brushAxes + drift) * vec2(3.2, 7.1);
      float brush = groundNoise(brushPoint);
      float roadWarp = (groundNoise(vGroundXZ * 0.78) - 0.5) * 0.64;
      vec2 laneDistance = abs(mod(vGroundXZ + uRoadSpacing * 0.5, uRoadSpacing) - uRoadSpacing * 0.5);
      float lane = min(laneDistance.x, laneDistance.y);
      vec2 paintedLanes = 1.0 - smoothstep(vec2(0.56), vec2(1.72), laneDistance + roadWarp);
      vec2 margin = uRoadExtent - abs(vGroundXZ);
      float roadLimit = uRoadStrength * smoothstep(-1.0, 8.0, min(margin.x, margin.y));
      float roadContinuity = 0.79 + smoothstep(0.29, 0.68, broad) * 0.21;
      float road = max(paintedLanes.x, paintedLanes.y) * roadLimit * roadContinuity;
      // Pair the track grooves on the approach, not across the crossing. Fade
      // narrow marks before they turn into repeating lines in distant vistas.
      float footprint = length(fwidth(vGroundXZ));
      float groove = abs(lane - (.69+.16*(medium-.5)+.06*(broad-.5)));
      float rut = (1.0 - smoothstep(0.075, 0.24, groove)) * road
        * (1.0 - min(paintedLanes.x, paintedLanes.y) * 0.86)
        * (1.0 - smoothstep(0.16, 0.55, footprint));
      float moss = smoothstep(0.36, 0.64, broad * 0.79 + medium * 0.21) * (1.0 - road * 0.80);
      float dryPaint = smoothstep(0.29, 0.70, medium * 0.43 + broad * 0.57);
      vec3 earth = mix(uSoil, uDryEarth, dryPaint * 0.48);
      earth = mix(earth, uMoss, moss * 0.83);
      earth = mix(earth, uPackedEarth * (0.92 + 0.13 * broad), road * 0.77);
      // The source litter adds fine grain under the paint without dominating the palette.
      vec3 litter = texture2D(uGroundDetail, vGroundXZ * 0.4).rgb;
      float grainValue = dot(litter, vec3(0.26, 0.61, 0.13));
      float drybrush = smoothstep(0.54, 0.73, brush) - (1.0 - smoothstep(0.20, 0.48, brush)) * 0.48;
      float strokeVisibility = 1.0 - smoothstep(0.45, 1.45, length(fwidth(brushPoint)));
      earth *= 0.96 + drybrush * strokeVisibility * 0.11 + (grainValue - 0.13) * uHasGroundDetail * 0.32;
      // Retain the photographed ground's small leaf/stone silhouettes. The
      // previous tiny scalar gain reduced nearly every texel to the same tan.
      vec3 litterTones=clamp((litter-vec3(.125,.087,.053))*vec3(4.2,4.9,5.2)+1.,.43,1.71);
      float earthCoat=uHasGroundDetail*(.48+.21*(1.-road))*(1.-smoothstep(.12,.50,footprint));
      earth*=mix(vec3(1.),litterTones,earthCoat);
      ${surface==='ground'?`// Clay, drowned root fibres and pockets of olive silt occupy the
      // actual lowered bench, fading into the same shaded dirt at its rim.
      vec3 shelfEarth=mix(vec3(.132,.108,.067),vec3(.066,.085,.060),smoothstep(.27,.75,medium+.14*brush));
      shelfEarth*=.86+.26*brush+.28*grainValue;
      earth=mix(earth,shelfEarth,vRiverShelfWash*(.80+.18*medium));`:''}
      // Granular pitted track bed, flaking dry ridges and darker pressed
      // pockets. Reuse the two filtered inputs already sampled above. No new
      // texture lookups, per-frame uploads or screen-space film grain.
      float pathWear=road*(1.-uRainGround)*clamp(1.21-.53*footprint,0.,1.);
      float dryFlake=smoothstep(.58,.78,brush+.56*(grainValue-.13))*(.27+.73*medium);
      float dampCut=(1.-smoothstep(.21,.42,brush+grainValue*.34))*(.42+.58*broad);
      float gravel=(dryFlake*.33-dampCut*.38)*strokeVisibility;
      earth*=1.+pathWear*(gravel+(grainValue-.14)*.82+.18*(medium-.5));
      float shoulder=smoothstep(.13,.22,groove)*(1.-smoothstep(.22,.34,groove));
      earth=mix(earth,earth*vec3(1.24,1.17,1.04),pathWear*shoulder*(.3+.7*brush)*strokeVisibility);
      earth *= 1.0 - rut * (.22 + broad * .14) * (.67+.33*medium);
      // Damp approach ruts are part of the soil. Their edges break on
      // grit and clods from the actual albedo; no opaque ribbons above it.
      float pocketWet=0.;
      if(uTrestle.z>0. && abs(vGroundXZ.x-uTrestle.x)<2.25){
        float dz=vGroundXZ.y-uTrestle.y, d=abs(dz)-uTrestle.z;
        float run=dz<0.?11.2:7.7, t=clamp(d/run,0.,1.);
        if(d>-.12 && d<run){
          float arc=dz<0.?.29*sin(t*2.1)-.46*t*t:.34*sin(t*2.8);
          float track=abs(abs(vGroundXZ.x-uTrestle.x-arc)-(.76+.09*t+.043*sin(d*.82)));
          float rim=.19+.075*sin(t*3.14159)+.12*(brush-.5)+.12*(medium-.5);
          float cycle=(1.-smoothstep(.70,1.,t))*(.72+.28*medium);
          float rutMask=(1.-smoothstep(rim*.24,rim+.077,track))*cycle;
          float siltyEdge=(1.-smoothstep(.008,.084,abs(track-rim)))*cycle*dryFlake;
          pocketWet=rutMask*smoothstep(.25,.69,.52*medium+.36*broad+.22*brush);
          earth*=1.-rutMask*(.16+.28*dampCut);
          earth=mix(earth,earth*vec3(1.28,1.12,.87),siltyEdge*.56);
          earth=mix(earth,earth*vec3(.68,.81,.90)+vec3(.008,.009,.011),pocketWet*.57);
        }
      }
      // Around the two bridgeheads the flood also reaches irregular adjoining
      // depressions in compressed silt. Leave the crowns and the grass dry.
      if(uTrestle.z>0. && uRainGround<.5){
        vec2 offset=vGroundXZ-vec2(uTrestle.x,uTrestle.y);
        float bankRun=abs(offset.y)-uTrestle.z;
        float siltReach=(1.-smoothstep(1.9,3.2,abs(offset.x)))*smoothstep(-.1,.4,bankRun)
                        *(1.-smoothstep(8.1,12.4,bankRun))*road;
        float low=medium*.50+broad*.31+brush*.19;
        float wash=smoothstep(.51,.66,low)*siltReach*(1.-.77*dryFlake);
        pocketWet=max(pocketWet,.87*wash);
      }
      // Rain pools in paired tread grooves and pockets of compacted mud,
      // leaving the higher verge matte. Sky colour is broken into short
      // horizontal marks; nothing scrolls across the player's tracks.
      float pooled = uRainGround * smoothstep(.35,.73, broad*.65+medium*.35)
        * clamp(rut*.76+road*.58+.24,0.,1.);
      float ripple = smoothstep(.48,.69,brush) * strokeVisibility;
      earth = mix(earth, earth*vec3(.49,.57,.72)+vec3(.008,.015,.024),uRainGround*.82);
      earth = mix(earth, vec3(.059,.085,.122)*(1.+ripple*.44), pooled*.76);
      #ifdef SIGNAL_ERODED_BANK
        // A cooler crown of scrub stops at broken exposed laterite banks. Long
        // sediment laps use existing broad/medium paint fields (no new texture
        // fetch or noise octaves) and disappear into the flat soil at the foot.
        float bankBlend = smoothstep(0.025, 0.34, vBankProfile.x);
        float blotch = groundNoise(vGroundXZ*2.1 + vec2(medium*.8,broad));
        float cap = smoothstep(0.32, 0.50, broad*.35+medium*.44+blotch*.31+.12-vBankProfile.y*.70);
        float ledgeCoord = vBankProfile.x * 1.7 + broad * 1.65 + medium * 0.44;
        float shelf = smoothstep(0.12, 0.21, fract(ledgeCoord)) * (1.0 - smoothstep(0.28, 0.43, fract(ledgeCoord)));
        vec3 stone=mix(vec3(.079,.068,.052),vec3(.165,.091,.054),medium*.77+brush*.23);
        vec3 bank=mix(earth,stone,.62);
        bank=mix(bank,vec3(.173,.143,.097),shelf * (.23+.22*brush)*(1.-cap));
        vec3 scrub=mix(vec3(.033,.056,.033),vec3(.104,.13,.064),dryPaint*.56+blotch*.44);
        bank=mix(bank,scrub,cap*.92);
        bank*=.77+.32*blotch+.20*brush;
        earth = mix(earth, bank, bankBlend);
      #endif
      float breakLight=(1.-uRainGround)*signalCrossingSun(vGroundXZ);
      earth*=mix(vec3(1.),vec3(1.55,1.23,.91),breakLight*(.64+.36*medium));
      diffuseColor.rgb *= earth;
    `);
    if(dawn)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      // Broken water films reflect the same painted sky as the river. The sky
      // sample is reached only on wet silt, never on distant hills, dry soil,
      // or rainy embassy ground. No decals, extra draws or screen coordinates.
      if(pocketWet>.035 && uRainGround<.5){
        vec3 puddlePos=vec3(vGroundXZ.x,${DRY_SOIL.toFixed(4)},vGroundXZ.y);
        vec3 i=normalize(puddlePos-cameraPosition);
        vec3 reflectedRay=reflect(i,normalize(vec3((medium-.5)*.073,1.,(brush-.5)*.052)));
        vec2 skyUV=signalDawnUv(atan(reflectedRay.z,reflectedRay.x)/6.2831853+.5,
                                asin(clamp(reflectedRay.y,-1.,1.)));
        vec3 paint=signalGradeDawn(texture2D(uRutSky,skyUV).rgb,reflectedRay);
        float exposure=smoothstep(.04,.28,reflectedRay.y+.04*(medium-.5));
        vec3 returnLight=mix(vec3(.023,.030,.027),paint*vec3(.72,.64,.58)+.014,exposure);
        float fresnel=.12+.61*pow(1.-clamp(-i.y,0.,1.),2.1);
        outgoingLight=mix(outgoingLight,returnLight,pocketWet*fresnel);
      }
      #include <opaque_fragment>`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */ `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(0.99, 0.82, rut * smoothstep(0.3, 0.8, broad));
      roughnessFactor = mix(roughnessFactor,.48,pocketWet);
      roughnessFactor = mix(roughnessFactor,.31,pooled);
    `);
  };
  material.customProgramCacheKey = () => 'world-soil-alluvial-shelf-v11:'+(weather?'weather:':'')+surface+':'+(dawn?'optical':'dry');
  return { material, rain, dispose: () => { material.dispose(); grain.dispose(); } };
}

export function cutGroundAroundRiver(stations:RiverStation[]){
  const x=(ARENA_WIDTH+56)/2,z=(ARENA_DEPTH+56)/2,p:number[]=[],uv:number[]=[],wash:number[]=[],idx:number[]=[];
  type P=[number,number,number,number]; // world xyz and wet-clay weight
  const used=new Map<string,number>();
  const emit=(a:P,b:P,c:P,d:P)=>{
    const ids=[a,b,c,d].map(([xx,yy,zz,w])=>{const key=xx+':'+yy+':'+zz,h=used.get(key);
      if(h!==undefined)return h;const id=p.length/3;used.set(key,id);p.push(xx,yy,zz);uv.push(.5+xx/(2*x),.5-zz/(2*z));wash.push(w);return id;});
    if(a[0]!==b[0])idx.push(ids[0],ids[2],ids[1]);
    if(c[0]!==d[0])idx.push(ids[1],ids[2],ids[3]);
  };
  const quad=(ax:number,bx:number,az:number,cx:number,dx:number,bz:number)=>emit([ax,DRY_SOIL,az,0],[bx,DRY_SOIL,az,0],[cx,DRY_SOIL,bz,0],[dx,DRY_SOIL,bz,0]);
  if(stations[0].z>-z)quad(-x,x,-z,-x,x,stations[0].z);
  for(let i=1;i<stations.length;i++){
    const a=stations[i-1],b=stations[i];
    for(const side of [-1,1]){
      const aa=riverApron(a,side),bb=riverApron(b,side),ax=aa.edge+side*aa.width,bx=bb.edge+side*bb.width;
      if(side<0)quad(-x,ax,a.z,-x,bx,b.z);else quad(ax,x,a.z,bx,x,b.z);
      if(!aa.width&&!bb.width)continue;
      const point=(q:typeof aa,z:number,k:number):P=>[q.edge+side*q.offsets[k],q.heights[k],z,q.wash[k]];
      for(let k=0;k<3;k++){const l=side<0?k:k+1,r=side<0?k+1:k;
        emit(point(aa,a.z,l),point(aa,a.z,r),point(bb,b.z,l),point(bb,b.z,r));}
    }
  }
  if(stations[stations.length-1].z<z)quad(-x,x,stations[stations.length-1].z,-x,x,z);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('riverShelfWash',new THREE.Float32BufferAttribute(wash,1));
  g.setIndex(idx);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
export function TerrainSurface({ seed, raining = false }: { seed: number; raining?: boolean }) {
  const detail = useTerrainDetail();
  const stations=useMemo(()=>createRiverStations(seed),[seed]);
  const bridge=useMemo(()=>createRiverCrossings(stations).find(c=>c.kind==='bridge'),[stations]);
  const weather=useCrossingWeather();
  const [,dawn]=useLoader(THREE.TextureLoader,RIVER_SKY_TEXTURES);
  const surface = useMemo(() => createTerrainMaterial(seed, 1, detail,'ground',bridge,dawn,weather), [seed, detail,bridge,dawn,weather]);
  const banks=useMemo(()=>cutGroundAroundRiver(stations),[stations]);
  useEffect(()=>()=>banks.dispose(),[banks]);
  useLayoutEffect(() => { surface.rain.value = raining ? 1 : 0; }, [surface, raining]);
  useEffect(() => () => surface.dispose(), [surface]);
  return (
    <mesh name="dry-ground-cut-around-river" receiveShadow material={surface.material} geometry={banks}/>
  );
}
