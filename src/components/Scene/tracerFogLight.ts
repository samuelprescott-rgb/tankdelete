import * as T from 'three';
import {visitRoundLights} from './weaponWater';

const MAX_LIGHTS=6, SAMPLE_INTERVAL=.047, FADE_SECONDS=.095;
type Sample={start:T.Vector4;end:T.Vector4};
function makeSample(){
  return {time:-Infinity,count:0,segments:[] as Sample[]};
}

// Each sliced fog bank receives only the rounds near its ellipsoid.
// Two short-lived samples soften a passing round without extending its
// light down the whole firing lane or allocating a light for each bullet.
export function createTracerFogLight(){
  const uniforms={fogShotCount:{value:0},fogShotA:{value:new Float32Array(4*MAX_LIGHTS)},
    fogShotB:{value:new Float32Array(4*MAX_LIGHTS)}};
  const history=[makeSample(),makeSample()],live=makeSample();
  const samples=[live,...history];
  const scores=new Float32Array(MAX_LIGHTS);
  const center=new T.Vector3(),radii=new T.Vector3();
  let lastTime=-Infinity,newest=0;

  function update(scene:T.Scene,now:number){
    if(now===lastTime)return;
    lastTime=now;live.count=0;live.time=now;
    visitRoundLights(scene,(start,end)=>{
      let s=live.segments[live.count];
      if(!s)live.segments[live.count]=s={start:new T.Vector4(),end:new T.Vector4()};
      s.start.copy(start);s.end.copy(end);live.count++;
    });
    if(now-history[newest].time<SAMPLE_INTERVAL)return;
    newest=1-newest;
    const sample=history[newest];
    sample.time=now;sample.count=live.count;
    for(let i=0;i<live.count;i++){
      let s=sample.segments[i];
      if(!s)sample.segments[i]=s={start:new T.Vector4(),end:new T.Vector4()};
      s.start.copy(live.segments[i].start);s.end.copy(live.segments[i].end);
    }
  }

  function select(bank:T.Object3D,now:number){
    center.setFromMatrixPosition(bank.matrixWorld);radii.setFromMatrixScale(bank.matrixWorld);
    let count=0;
    for(const sample of samples){
      const age=now-sample.time;
      if(age>=FADE_SECONDS||(sample!==live && age<.012))continue;
      const power=sample===live?1:.58*(1-T.MathUtils.smoothstep(age,0,FADE_SECONDS));
      for(let i=0;i<sample.count;i++){
        const {start:a,end:b}=sample.segments[i];
        const radius=b.w===0?.91:1.20;
        const rx=radii.x+radius,ry=radii.y+radius,rz=radii.z+radius;
        const x=(a.x-center.x)/rx,y=(a.y-center.y)/ry,z=(a.z-center.z)/rz;
        const dx=(b.x-a.x)/rx,dy=(b.y-a.y)/ry,dz=(b.z-a.z)/rz;
        const t=T.MathUtils.clamp(-(x*dx+y*dy+z*dz)/Math.max(.00001,dx*dx+dy*dy+dz*dz),0,1);
        const dist=(x+t*dx)**2+(y+t*dy)**2+(z+t*dz)**2;
        if(dist>1.15)continue;
        const score=power/(.8+dist);
        let slot=count;
        if(count===MAX_LIGHTS){
          slot=0;for(let j=1;j<count;j++)if(scores[j]<scores[slot])slot=j;
          if(score<=scores[slot])continue;
        }else count++;
        scores[slot]=score;
        const offset=4*slot;
        a.toArray(uniforms.fogShotA.value,offset);uniforms.fogShotA.value[offset+3]=radius;
        b.toArray(uniforms.fogShotB.value,offset);uniforms.fogShotB.value[offset+3]=power;
      }
    }
    uniforms.fogShotCount.value=count;
  }
  function bind(material:T.ShaderMaterial){
    Object.assign(material.uniforms,uniforms);
    material.onBeforeRender=(_renderer,scene,_camera,_geometry,bank)=>{
      const now=material.uniforms.seconds.value;
      update(scene,now);select(bank,now);
      // Consecutive banks share this material but have different shortlists.
      material.uniformsNeedUpdate=true;
    };
  }
  return {bind};
}

export const tracerFogGLSL=`
  uniform int fogShotCount;
  uniform vec4 fogShotA[${MAX_LIGHTS}],fogShotB[${MAX_LIGHTS}];
  vec3 tracerScatter(vec3 p,float thickness,float wisps){
    float core=0.,haze=0.;
    for(int i=0;i<${MAX_LIGHTS};i++){
      if(i>=fogShotCount)break;
      vec4 a=fogShotA[i],b=fogShotB[i];
      vec3 axis=b.xyz-a.xyz;
      float t=clamp(dot(p-a.xyz,axis)/max(.00001,dot(axis,axis)),0.,1.);
      vec3 offset=p-(a.xyz+t*axis);
      // Integrate across part of this slice so the light can travel
      // between consecutive sample planes without popping.
      vec3 eyeRay=normalize(cameraPosition-p);
      offset-=eyeRay*clamp(dot(offset,eyeRay),-.45*thickness,.45*thickness);
      float d=length(offset)/a.w;
      float energy=b.w*(1.-.30*t)*(.81+.36*wisps);
      core=max(core,energy*(1.-smoothstep(.08,.53,d)));
      haze=max(haze,energy*(1.-smoothstep(.22,1.18,d)));
    }
    return core*vec3(2.5,1.04,.25)+haze*vec3(1.55,.39,.074);
  }
`;
