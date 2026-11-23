import {useEffect,useMemo} from 'react';
import {useFrame} from '@react-three/fiber';
import * as T from 'three';
import { SMOKE_DRIFT_RATE } from './smokeMotion';
import {sootPigmentGLSL} from './sootPigment';
import type {Explosion} from '../../hooks/useExplosionPool';

const CLOUD_LIMIT=36, CAPACITY=CLOUD_LIMIT+24;
// Finite flipbook poses, resolved in the particle's own pixels, never the screen.
// Three offset lobes around each major contact leave distinct gaps in the silhouette.
export function plumePose(age:number,scale:number,lobe:number){
  const t=age-lobe*.035;
  if(t<0||t>=1.45||scale<.29)return null;
  const p=t/1.45,tail=1-Math.max(0,(p-.73)/.27);
  return {phase:Math.floor(p*20)/19, rise:scale*(.05+(lobe<3?2.35:.75)*p*SMOKE_DRIFT_RATE+(lobe===1?.42:0)),
    width:scale*(.95+1.80*Math.min(1,t*6)+p*.51)*(lobe<3?1.-.12*lobe:.54)*tail};
}
// The nearest short length of broken roof is visible immediately. It falls
// while the smoke rises. Small broken cross-sections resolve into ink glyphs.
// Ages are wall-clock effect ages, not an extra physics world.
export function splinterPose(age:number,index:number,id:number,scale:number,height:number){
  if(age<0||age>1.56||scale<=0)return null;
  const seed=(index*.618034+id*.137)%1, angle=seed*Math.PI*2;
  const big=index<4, t=Math.max(0,age-(big?0:index%3*.028));
  const size=scale*(big?1.55+.83*seed:.44+.42*seed);
  const radius=scale*(big?.83:.23)+t*(big?1.3+seed:2.3+seed*1.65)*scale;
  const y=Math.max(.10,height+scale*(big?-.22:.04)+t*(big?.45:2.05+seed)-5.7*t*t);
  const fade=1-T.MathUtils.smoothstep(t,1.04,1.56);
  return {x:Math.cos(angle)*radius,y,z:Math.sin(angle)*radius,side:size*fade,
    phase:t,mark:-(big?1+seed:3+seed)};
}
function makePlumes(){
  const g=new T.InstancedBufferGeometry(),quad=new T.PlaneGeometry(1,1);
  g.index=quad.index;g.setAttribute('position',quad.attributes.position);g.setAttribute('uv',quad.attributes.uv);
  const data=new T.InstancedBufferAttribute(new Float32Array(CAPACITY*4),4).setUsage(T.DynamicDrawUsage);
  const info=new T.InstancedBufferAttribute(new Float32Array(CAPACITY*2),2).setUsage(T.DynamicDrawUsage);
  g.setAttribute('cloud',data);g.setAttribute('beat',info);g.instanceCount=0;
  const mat=new T.ShaderMaterial({depthWrite:true,depthTest:true,fog:true,
    uniforms:T.UniformsUtils.clone(T.UniformsLib.fog),
    vertexShader:`
      #include <fog_pars_vertex>
      attribute vec4 cloud;attribute vec2 beat;varying vec2 cell;varying vec2 play;
      void main(){vec4 mvPosition=modelViewMatrix*vec4(cloud.xyz,1.);mvPosition.xy+=position.xy*cloud.w;
        gl_Position=projectionMatrix*mvPosition;cell=uv;play=beat;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      #include <fog_pars_fragment>
      ${sootPigmentGLSL}
      varying vec2 cell;varying vec2 play;
      void main(){vec2 p=(floor(cell*48.)+.5)/24.-1.;float age=play.x,seed=play.y;
        vec3 color;
        if(seed<0.){
          float h=fract(-seed), angle=(h-.5)*2.7+age*(h<.5?1.:-1.)*(.9+1.4*h);
          vec2 q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;
          if(seed> -3.){
            // Tapered slats with a jagged end, warm broken wood against a charred edge.
            float edge=.125+.056*(1.-q.x);
            if(abs(q.y)>edge||q.x<-.88||q.x>.78-.19*step(0.,q.y)-.08*step(.06,q.y))discard;
            color=q.y>edge-.06||q.x>.53?vec3(.58,.345,.14):
              abs(q.y)<.032?vec3(.14,.078,.037):vec3(.295,.157,.063);
          }else{
            // Thick, legible +, = and ] shapes, in world space only.
            vec2 k=abs(q);float code=floor(h*3.);
            bool hit=code<1.?(min(k.x,k.y)<.15&&max(k.x,k.y)<.63):
              code<2.?(abs(k.y-.27)<.12&&k.x<.61):
              ((abs(q.x-.36)<.13&&k.y<.64)||(abs(k.y-.50)<.13&&k.x<.44));
            if(!hit)discard;color=mix(vec3(.57,.29,.09),vec3(.79,.60,.31),h);
          }
        }else{
        float a=atan(p.y,p.x)+seed, r=length(p);
        float edge=.74+.11*cos(3.*a+age*4.)+.075*sin(5.*a-age*6.)+.05*sin(8.*a+seed);
        if(r>edge)discard;
        // A compact bright core peels into three tones of smoke and fades in scattered clusters.
        vec2 curl=p+vec2(sin(seed+2.*age),cos(seed))*.24;
        float fold=.5*sin(curl.x*5.+age*6.+1.9*sin(curl.y*3.+seed))
                 +.28*cos(7.*curl.y+seed-4.*age+sin(curl.x*8.))+.14*sin(11.*curl.x-5.*curl.y+seed);
        vec2 grid=floor(cell*38.);
        float stipple=fract(sin(dot(grid,vec2(17.3,53.7))+seed)*14591.);
        float light=fold*.64+dot(p,vec2(-.42,.43))+(stipple-.5)*.17;
        vec3 ash=sootPigment(.5+light,1.-smoothstep(.08,.52,age));
        // Heat escapes through torn pockets between dark billows; the cast-light
        // side is brighter than the lip. No concentric gradients or circular outline.
        float heat=.53+.46*fold-.52*p.y-.17*r-1.48*age;
        color=ash;
        if(heat>.26)color=vec3(.66,.122,.028);
        if(heat>.49)color=vec3(1.08,.315,.036);
        if(heat>.69)color=vec3(1.44,.69,.14);
        if(heat>.84&&age<.19)color=vec3(1.66,1.00,.48);
        if(age>.65){vec2 q=floor(cell*21.);float d=fract(sin(dot(q,vec2(12.1,39.7))+seed)*4375.);
          if(d<(age-.65)*2.3+(r/edge-.7)*.52)discard;}
        }
        gl_FragColor=vec4(color,1.);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`});
  return {g,mat,data,info};
}
export function ImpactPlumes({explosions}:{explosions:Explosion[]}){
  const b=useMemo(makePlumes,[]);
  useEffect(()=>()=>{b.g.dispose();b.mat.dispose();},[b]);
  useFrame(()=>{
    let n=0;const now=performance.now();
    for(let j=explosions.length-1;j>=0&&n<CLOUD_LIMIT;j--){
      const e=explosions[j],age=(now-e.spawnTime)*.001;
      for(let k=0;k<(e.scale>=.72?5:1)&&n<CLOUD_LIMIT;k++){
        const pose=plumePose(age,e.scale,k);if(!pose)continue;
        const seed=(e.id*.91+k*2.39)%6.28,drift=pose.phase*e.scale*.64,spread=k===0?0:e.scale*(k<3?.68:1.03)*Math.min(1,.23+age*5);
        b.data.setXYZW(n,e.position.x+Math.cos(seed)*spread+drift,e.position.y+pose.rise,
          e.position.z+Math.sin(seed)*spread,pose.width);
        b.info.setXY(n,pose.phase,seed);n++;
      }
    }
    // Share the same buffer, shader and draw as the smoke. Non-timber hits
    // never produce roof shards; the reserve cannot displace an existing cloud.
    const shardLimit=n+24;
    for(let j=explosions.length-1;j>=0&&n<shardLimit;j--){
      const e=explosions[j];if(e.surface!=='timber')continue;
      const age=(now-e.spawnTime)*.001;
      for(let k=0;k<(e.scale>=.72?12:4)&&n<shardLimit;k++){
        const part=splinterPose(age,k,e.id,e.scale,e.position.y);if(!part)break;
        b.data.setXYZW(n,e.position.x+part.x,part.y,e.position.z+part.z,part.side);
        b.info.setXY(n,part.phase,part.mark);n++;
      }
    }
    b.g.instanceCount=n;
    if(n){for(const a of [b.data,b.info]){a.clearUpdateRanges();a.addUpdateRange(0,n*a.itemSize);a.needsUpdate=true;}}
  });
  return <mesh name="ink-impact-plumes" geometry={b.g} material={b.mat} frustumCulled={false} dispose={null}/>;
}
