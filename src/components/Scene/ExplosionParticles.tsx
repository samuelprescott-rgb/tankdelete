import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {Explosion} from '../../hooks/useExplosionPool';
import {ImpactPlumes} from './ImpactPlumes';

const CAPACITY=2000, STRIDE=12, SEEDS=2048;
interface Emitter {first:number;last:number;end:number}

// Each fragment is ballistic. For semi-implicit gravity, displacement after
// ANY sequence of frame lengths is v*t - g/2*(t² + sum(dt²)). The second
// clock channel preserves the old motion even across a stutter or pause.
const sparkTransform=`
  float age = max(0.0, uSparkClock.x - aSparkBirth.w);
  float life = max(aSparkFlight.w, 0.00001);
  vec3 center = aSparkBirth.xyz + aSparkFlight.xyz * age;
  center.y -= 2.45 * (age * age + uSparkClock.y);
  float size = aSparkSize * max(0.0, 1.0 - age / life);
  int lane = gl_InstanceID % 3;
  vec3 aspect = vec3(lane == 0 ? 2.45 : 1.0, lane == 1 ? 1.9 : 1.0, 1.0);
  transformed = center + transformed * (aspect * size);`;

function createPool(){
  const box=new THREE.BoxGeometry(.15,.15,.15);
  const data=new THREE.InstancedInterleavedBuffer(new Float32Array(CAPACITY*STRIDE),STRIDE,1).setUsage(THREE.DynamicDrawUsage);
  const attr=(length:number,offset:number)=>new THREE.InterleavedBufferAttribute(data,length,offset);
  const attributes={...box.attributes,aSparkBirth:attr(4,0),aSparkFlight:attr(4,4),color:attr(3,8),aSparkSize:attr(1,11)};
  const clock={value:new THREE.Vector2()};
  const compile=(shader:{uniforms:Record<string,THREE.IUniform>;vertexShader:string})=>{
    shader.uniforms.uSparkClock=clock;
    shader.vertexShader='uniform vec2 uSparkClock;\nattribute vec4 aSparkBirth;\nattribute vec4 aSparkFlight;\nattribute float aSparkSize;\n'+
      shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+sparkTransform);
  };
  // Build the scatter deck at mount, not on a hit. Each burst starts at a
  // different offset and rotates the deck; no trig/color parsing per fragment.
  const deck=new Float32Array(SEEDS*5);
  for(let i=0;i<SEEDS;i++){
    const j=i*5,angle=Math.random()*Math.PI*2,speed=2+Math.random()*3;
    deck[j]=Math.cos(angle)*speed;deck[j+1]=.5+Math.random()*1.5;deck[j+2]=Math.sin(angle)*speed;
    deck[j+3]=1+Math.random()*.5;deck[j+4]=Math.random()*.12;
  }
  return {data,attributes,index:box.index!,clock,compile,deck,deadAt:new Float64Array(CAPACITY),
    owner:new Float64Array(CAPACITY).fill(-1),emitters:new Map<number,Emitter>(),completed:new Set<number>(),
    colors:[new THREE.Color(),new THREE.Color(),new THREE.Color()],hot:new THREE.Color('#ffe9a1'),cool:new THREE.Color('#9b563f'),
    high:0};
}

export function ExplosionParticles({explosions,onExplosionComplete}:{
  explosions:Explosion[];onExplosionComplete:(id:number)=>void
}){
  const geometry=useRef<THREE.InstancedBufferGeometry>(null);
  const p=useMemo(createPool,[]);
  const live=useMemo(()=>new Set(explosions.map(e=>e.id)),[explosions]);
  useFrame((_,delta)=>{
    const g=geometry.current;if(!g)return;
    const clock=p.clock.value,buf=p.data.array;
    if(!explosions.length){
      if(p.emitters.size||p.completed.size){
        p.emitters.clear();p.completed.clear();p.deadAt.fill(0,0,p.high);p.owner.fill(-1,0,p.high);
        g.instanceCount=p.high=0;clock.set(0,0);
      }
      return;
    }
    const now=performance.now(),dt=Math.max(0,delta);
    let lo=CAPACITY,hi=-1;
    // Explicitly removing one explosion must not leave its fragments visible
    // inside another explosion's draw prefix. Natural expiration is shader-only.
    for(const [id,event] of p.emitters)if(!live.has(id)){
      if(event.end>clock.x)for(let i=event.first;i<=event.last;i++)if(p.owner[i]===id){
        p.deadAt[i]=0;p.owner[i]=-1;buf[i*STRIDE+11]=0;
        if(i<lo)lo=i;if(i>hi)hi=i;
      }
      p.emitters.delete(id);
    }
    for(const id of p.completed)if(!live.has(id))p.completed.delete(id);
    // Reset the local clocks only when no previous fragment could survive.
    // Clear the old deadlines and birth records before making time small again.
    if(!p.high){clock.set(0,0);}
    let cursor=0;
    for(const e of explosions){
      if(p.emitters.has(e.id)||p.completed.has(e.id)||(now-e.spawnTime)>=100)continue;
      const count=Math.min(500,Math.max(20,Math.floor(e.scale*200)));
      const start=(Math.random()*SEEDS)|0,angle=Math.random()*Math.PI*2,co=Math.cos(angle),si=Math.sin(angle);
      const [base,hot,cool]=p.colors;base.set(e.color);hot.copy(base).lerp(p.hot,.75);cool.copy(base).lerp(p.cool,.48);
      const y=e.position.y+2.45*clock.y;
      const event:Emitter={first:CAPACITY,last:-1,end:clock.x};p.emitters.set(e.id,event);
      for(let n=0;cursor<CAPACITY&&n<count;cursor++){
        const i=cursor;if(i<p.high&&p.deadAt[i]>clock.x)continue;
        const j=((start+n)&(SEEDS-1))*5,k=i*STRIDE;
        const x=p.deck[j],z=p.deck[j+2],life=p.deck[j+3];
        buf[k]=e.position.x;buf[k+1]=y;buf[k+2]=e.position.z;buf[k+3]=clock.x;
        buf[k+4]=co*x-si*z;buf[k+5]=p.deck[j+1];buf[k+6]=si*x+co*z;buf[k+7]=life;
        const ninth=n%9===0,tint=ninth?hot:n%3===0?cool:base;
        buf[k+8]=tint.r;buf[k+9]=tint.g;buf[k+10]=tint.b;buf[k+11]=(ninth?.34:.16)+p.deck[j+4];
        p.deadAt[i]=clock.x+life;p.owner[i]=e.id;
        if(event.first===CAPACITY)event.first=i;event.last=i;event.end=Math.max(event.end,p.deadAt[i]);
        n++;
      }
      if(event.last>=0){lo=Math.min(lo,event.first);hi=Math.max(hi,event.last);p.high=Math.max(p.high,event.last+1);}
    }
    clock.x+=dt;clock.y+=dt*dt;
    // Usually just one comparison. Interior holes have zero projected area;
    // there are no per-frame CPU pose calculations or live instance uploads.
    const hadDebris=p.high>0;
    while(p.high>0&&p.deadAt[p.high-1]<=clock.x)p.high--;
    if(hadDebris&&!p.high)for(const event of p.emitters.values())event.end=0;
    g.instanceCount=p.high;
    if(hi>=lo){p.data.addUpdateRange(lo*STRIDE,(hi-lo+1)*STRIDE);p.data.needsUpdate=true;}
    for(const e of explosions){
      if(now-e.spawnTime<=2500||p.completed.has(e.id))continue;
      const event=p.emitters.get(e.id);
      if(!event||event.end<=clock.x||!p.high){p.completed.add(e.id);onExplosionComplete(e.id);}
    }
  });
  return <><mesh name="impact-debris-pool" frustumCulled={false}>
    <instancedBufferGeometry ref={geometry} index={p.index} attributes={p.attributes} instanceCount={0} />
    <meshBasicMaterial vertexColors toneMapped={false} onBeforeCompile={p.compile}/>
  </mesh><ImpactPlumes explosions={explosions}/></>;
}
