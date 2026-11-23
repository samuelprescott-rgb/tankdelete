import * as T from 'three';

type Segment={start:T.Vector4;end:T.Vector4;rank:number};
export class WaterLightBatch {
  readonly segments:Segment[]=[];
  count=0;
  // W stores the emitting width and family (rifle, shell, flame).
  write(index:number,origin:T.Vector3,direction:T.Vector3,length:number,width:number,family:number){
    let segment=this.segments[index];
    if(!segment)this.segments[index]=segment={start:new T.Vector4(),end:new T.Vector4(),rank:0};
    segment.start.set(origin.x,origin.y,origin.z,width);
    segment.end.set(origin.x+direction.x*length,origin.y+direction.y*length,origin.z+direction.z*length,family);
  }
}

const limit=16;
function createState(){
  return {batches:new Set<WaterLightBatch>(),visible:[] as Segment[],frame:-1,camera:null as T.Camera|null,
    frustum:new T.Frustum(),viewProjection:new T.Matrix4(),bounds:new T.Sphere(),
    starts:new Float32Array(limit*4),ends:new Float32Array(limit*4),count:0,phase:0};
}
const scenes=new WeakMap<T.Scene,ReturnType<typeof createState>>();
export function registerWaterLights(scene:T.Scene,batch:WaterLightBatch){
  let state=scenes.get(scene);
  if(!state){state=createState();scenes.set(scene,state);}
  state.batches.add(batch);
  return ()=>{state.batches.delete(batch);batch.count=0;};
}

/** World-space tips and tails used by the visible round meshes, before the
 * water renderer ranks sources by their reflected image. */
export function visitRoundLights(scene:T.Scene,visit:(start:T.Vector4,end:T.Vector4)=>void){
  const state=scenes.get(scene);
  if(!state)return;
  for(const batch of state.batches)for(let i=0;i<batch.count;i++){
    const {start,end}=batch.segments[i];
    if(end.w<2)visit(start,end);
  }
}

function gather(state:ReturnType<typeof createState>,eye:T.Camera,frame:number){
  if(state.frame===frame && state.camera===eye)return;
  state.frame=frame;state.camera=eye;
  const live=state.visible;live.length=0;
  const e=eye.matrixWorld.elements;
  for(const batch of state.batches)for(let i=0;i<batch.count;i++){
    const segment=batch.segments[i],p=segment.start;
    const dx=p.x-e[12],dy=p.y-e[13],dz=p.z-e[14];
    segment.rank=(dx*dx+dy*dy+dz*dz)/(1+segment.end.w*4);
    live.push(segment);
  }
  if(live.length>limit){
    state.frustum.setFromProjectionMatrix(state.viewProjection.multiplyMatrices(eye.projectionMatrix,eye.matrixWorldInverse));
    for(const segment of live){
      const a=segment.start,b=segment.end,bounds=state.bounds;
      bounds.center.set((a.x+b.x)*.5,-(a.y+b.y)*.5,(a.z+b.z)*.5);
      bounds.radius=1.5+2*a.w+.5*Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
      if(!state.frustum.intersectsSphere(bounds))segment.rank+=1e8;
    }
    live.sort((a,b)=>a.rank-b.rank);
  }
  state.count=Math.min(limit,live.length);
  for(let i=0;i<state.count;i++){
    live[i].start.toArray(state.starts,i*4);live[i].end.toArray(state.ends,i*4);
  }
  state.phase=performance.now()*.001;
}

// Intersect the sightline to EACH mirrored endpoint with the actual water
// elevation. Low paddies, the sunken river and courtyard slabs project from
// different heights. Dry banks and rice occlude the result in their normal draws.
const reflectedWeaponsGLSL=`
uniform int uWaterShotCount;
uniform vec4 uWaterShotA[${limit}],uWaterShotB[${limit}];
uniform float uWaterShotTime;
vec2 waterMirrorPoint(vec3 source,float surfaceY,float eyeHeight){
  float lightHeight=max(.015,source.y-surfaceY);
  return mix(cameraPosition.xz,source.xz,eyeHeight/(eyeHeight+lightHeight));
}
vec3 weaponWaterInk(vec3 wp){
  vec3 ink=vec3(0.);
  if(uWaterShotCount==0 || cameraPosition.y<=wp.y)return ink;
  float eyeHeight=cameraPosition.y-wp.y;
  for(int i=0;i<${limit};i++){
    if(i>=uWaterShotCount)break;
    vec4 source=uWaterShotA[i],tail=uWaterShotB[i];
    if(max(source.y,tail.y)<wp.y-.035)continue;
    vec3 start=source.xyz,finish=tail.xyz;
    if(min(start.y,finish.y)<wp.y && abs(finish.y-start.y)>.0001){
      vec3 crossing=mix(start,finish,clamp((wp.y-start.y)/(finish.y-start.y),0.,1.));
      if(start.y<wp.y)start=crossing;else finish=crossing;
    }
    vec2 a=waterMirrorPoint(start,wp.y,eyeHeight);
    vec2 b=waterMirrorPoint(finish,wp.y,eyeHeight);
    float family=tail.w,flame=step(1.5,family);
    float width=source.w;
    vec2 margin=vec2(width*2.1);
    if(any(lessThan(wp.xz,min(a,b)-margin))||any(greaterThan(wp.xz,max(a,b)+margin)))continue;
    vec2 axis=b-a,delta=wp.xz-a;
    float t=clamp(dot(delta,axis)/max(.00001,dot(axis,axis)),0.,1.);
    vec2 at=delta-axis*t;
    vec2 texel=floor(wp.xz*32.)/32.;
    float ripple=sin(texel.y*16.1+texel.x*4.6+sin(texel.x*8.2)+uWaterShotTime*3.6);
    float flicker=sin(22.*t-8.*uWaterShotTime+.9*sin(9.*t+uWaterShotTime));
    float seam=.5+.5*sin(texel.x*5.8-texel.y*3.2+2.*t);
    float widthAt=width*mix(1.-.28*t,(.33+.68*t)*(.90+.15*flicker),flame);
    float d=length(at)/max(.02,widthAt);
    float core=1.-smoothstep(.09,.78,d+.13*ripple);
    float soft=1.-smoothstep(.29,1.57,d);
    float crest=.32+.68*smoothstep(-.69,.75,ripple+.69*seam);
    vec3 hot=mix(vec3(1.85,.76,.19),vec3(2.6,1.48,.48),step(.5,family));
    hot=mix(hot,vec3(1.10,.27,.035),t*.65);
    hot=mix(hot,mix(vec3(2.85,.83,.09),vec3(1.65,.25,.025),t)*(.85+.23*flicker),flame);
    ink+=(core*hot+soft*vec3(.54,.126,.018))*crest;
  }
  return ink;
}`;

export function reflectWeapons<M extends T.Material>(material:M,world?:string,weight='1.',raw=false){
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  const uniforms={uWaterShotCount:{value:0},uWaterShotA:{value:new Float32Array(limit*4)},
    uWaterShotB:{value:new Float32Array(limit*4)},uWaterShotTime:{value:0}};
  const beforeRender=material.onBeforeRender;
  material.onBeforeRender=(...args)=>{
    beforeRender.apply(material,args);
    const [renderer,scene,camera]=args;
    const state=scenes.get(scene);
    if(!state){uniforms.uWaterShotCount.value=0;return;}
    gather(state,camera,renderer.info.render.frame);
    uniforms.uWaterShotCount.value=state.count;uniforms.uWaterShotTime.value=state.phase;
    uniforms.uWaterShotA.value=state.starts;uniforms.uWaterShotB.value=state.ends;
  };
  material.onBeforeCompile=(s,r)=>{
    compile.call(material,s,r);
    Object.assign(s.uniforms,uniforms);
    if(!world){
      s.vertexShader='varying vec3 vRoadWater;\n'+s.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvRoadWater=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;');
      s.fragmentShader='varying vec3 vRoadWater;\n'+s.fragmentShader;
    }
    const gate=raw?'#include <colorspace_fragment>':'#include <opaque_fragment>';
    const target=raw?'gl_FragColor.rgb':'outgoingLight';
    s.fragmentShader=reflectedWeaponsGLSL+'\n'+s.fragmentShader.replace(gate,
      target+'+=weaponWaterInk('+(world??'vRoadWater')+')*('+weight+');\n'+gate);
  };
  material.customProgramCacheKey=()=>key+'-weapon-water-'+world+'-'+weight;
  return material;
}
