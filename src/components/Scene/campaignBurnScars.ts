import * as T from 'three';
import {createRiverStations,sampleRiverStation} from './riverLayout';
import {createTankGroundProfile} from '../../lib/tankGroundProfile';
import {terrainReliefHeight} from '../../lib/terrain';

type P=[number,number,number];
const vec=(p:P)=>new T.Vector3(...p);
const tone=(s:string)=>new T.Color(s);
const coal=tone('#29292c'),wood=tone('#6b5143'),breakwood=tone('#a38062'),ash=tone('#827b6c');
const rust=tone('#7d4d3c'),burn=tone('#a6482d'),rim=tone('#674034');
const noise=(i:number,j:number)=>{const f=Math.sin(i*24.846+j*87.7)*19573.3;return f-Math.floor(f);};

/** No per-plank scene nodes or per-frame geometry. These are broken parts of
 * a small stilt storage bay: a standing side bent, fallen woven shutter and
 * the other half of the roof folded across the floor. The near bank is not
 * moved to make room; its posts find the exact same bed as the tank. */
export function createCampaignBurnScars(sites:readonly (readonly number[])[],seed:number){
  const river=createRiverStations(seed),ground=createTankGroundProfile(river,seed);
  const worldGround=(x:number,z:number)=>{const relief=terrainReliefHeight(x,z);return Math.max(ground.height(x,z),relief>0?relief:-Infinity);};
  const p:number[]=[],colors:number[]=[],ix:number[]=[];
  const fp:number[]=[],fuv:number[]=[],attr:number[]=[],fi:number[]=[];
  const records:{origin:P,feet:P[],fire:{position:P;scale:P}[],yaw:number}[]=[];

  sites.forEach(([cx,,cz],site)=>{
    const a=sampleRiverStation(river,cz-.5),b=sampleRiverStation(river,cz+.5);
    const yaw=site===1&&a&&b?Math.atan2((b.centerX-b.mudHalfWidth)-(a.centerX-a.mudHalfWidth),1):[.62,0,-.39,-.92,.31][site];
    const cs=Math.cos(yaw),sn=Math.sin(yaw),sz=[.78,1,.88,1.12,.94][site],mirror=site%3===0?-1:1;
    const world=(u:number,z:number):[number,number]=>[cx+sz*(cs*u+sn*z*mirror),cz+sz*(-sn*u+cs*z*mirror)];
    const X=(u:number,y:number,z:number):P=>{const [x,w]=world(u,z);return [x,base+y*sz,w];};
    // Level joists sit above the highest corner; short uphill and long downhill
    // stilts reach the actual soil independently, even on a steep perimeter.
    const base=Math.max(...[[-1.76,-1.06],[-1.75,.96],[.39,-1.04],[.44,.91],[-.70,0]]
      .map(([u,z])=>worldGround(...world(u,z))));
    const feet:P[]=[];
    const vtx=(v:T.Vector3,c:T.Color)=>{p.push(v.x,v.y,v.z);colors.push(c.r,c.g,c.b);return colors.length/3-1;};
    const mixed=(a:T.Color,b:T.Color,t:number)=>a.clone().lerp(b,Math.max(0,Math.min(1,t)));
    const quad=(q:T.Vector3[],cs:T.Color[])=>{const idx=q.map((v,j)=>vtx(v,cs[j]));ix.push(idx[0],idx[1],idx[2],idx[0],idx[2],idx[3]);};
    let serial=0;
    // Four real hewn faces; the ring at the hot end fractures across the
    // grain. Broad weathered top, cooled char sides, fresh snapped end.
    function beam(from:P,to:P,w:number,h:number,c:T.Color,hot=0,worn=.38,roll=0){
      const va=vec(X(...from)),vb=vec(X(...to)),axis=vb.clone().sub(va).normalize();
      let side=new T.Vector3().crossVectors(axis,Math.abs(axis.y)>.89?new T.Vector3(cs,0,-sn):new T.Vector3(0,1,0)).normalize();
      if(roll)side.applyAxisAngle(axis,roll);
      const up=new T.Vector3().crossVectors(axis,side).normalize();const id=++serial;
      const skew=Math.min(w,h)*sz,wp=w*sz*.5,hp=h*sz*.5;
      const shape=[[-1,-1],[1,-1],[1,1],[-1,1]],rings=[va,vb].map((v,k)=>shape.map(([x,y],j)=>v.clone()
        .addScaledVector(side,x*wp).addScaledVector(up,y*hp).addScaledVector(axis,(noise(id+j*13,k+site)-.5)*skew*(k?1.20:.18))));
      for(let j=0;j<4;j++){const n=(j+1)%4,pa=rings[0][j],pb=rings[0][n],pc=rings[1][n],pd=rings[1][j];
        const normal=new T.Vector3().crossVectors(pb.clone().sub(pa),pc.clone().sub(pa)).normalize();
        const tint=mixed(c,ash,worn*Math.max(0,normal.y+.15)*(.65+.30*noise(id,j)));
        const unlit=mixed(tint,coal,.10+.31*Math.max(0,-normal.y));
        const end=mixed(unlit,hot>0?rim:breakwood,hot>0?hot*.70:.10);
        quad([pa,pb,pc,pd],[unlit,mixed(unlit,coal,.10),mixed(end,coal,.055),end]);
      }
      for(let k=0;k<2;k++){const mid=(k?rings[1]:rings[0]),e=k?mixed(c,hot?burn:breakwood,hot?hot*.72:.54):mixed(c,coal,.42);
        quad(k?mid:[...mid].reverse(),[e,mixed(e,coal,.20),mixed(e,coal,.05),e]);}
    }
    const post=(u:number,z:number,top:P,width:number)=>{const [x,w]=world(u,z),y=worldGround(x,w);
      feet.push([x,y,w]);beam([u,(y-base)/sz-.13,z],top,width,width*.90,coal,.29,.42);};
    // The stored goods and reed roofing have burned; the off-centre fork and
    // diagonal rafter identify a structure from the tank long before grain is visible.
    post(-1.76,-1.06,[-1.70,1.88,-1.05],.20);
    post(-1.75,.96,[-1.69,1.46,.99],.19);
    post(.39,-1.04,[.41,.48,-1.03],.19);
    post(.44,.91,[.48,.37,.93],.19);
    beam([-1.74,1.70,-1.16],[-1.69,1.43,1.12],.15,.17,wood,.12);
    beam([-1.77,.77,-.93],[-1.69,1.62,-.31],.09,.12,wood,.32);
    beam([-1.74,.51,-1.05],[-.59,1.29,-1.02],.12,.13,wood,.21);
    // Ragged eave stubs hang at unlike heights, with a visible bite out of
    // the centre. Each is chunky enough to survive a long chase lens.
    for(const z of [-.98,-.73,.31,.59,.92]){
      const len=.46+noise(site+5,serial)*.42;
      beam([-1.76,1.58-z*.14,z],[-1.82,1.58-z*.14-len,z-.04],.08,.20,mixed(wood,ash,.37),.52,.44);
    }
    // Broken shutters across a supported deck; lean a dark rafter between
    // the two flame pockets so orange never floats free like a campfire.
    beam([-1.84,.23,-1.05],[.62,.28,-1.07],.17,.22,wood,.11);
    beam([-1.85,.24,.93],[.67,.20,.96],.18,.20,wood,.17);
    for(const u of [-1.56,-1.19,-.84,-.50,.24,.51]){
      const missing=u>-.8&&u<.45;
      beam([u,.33,-1.22],[u+.025,.30,(missing?.02:1.08)+.13*noise(site,serial)],.24,.08,mixed(wood,coal,.40),.30,.48);
    }
    beam([-1.75,1.69,-1.05],[.45,.35,.68],.19,.20,mixed(coal,wood,.19),.78);
    beam([-1.7,1.23,.73],[.47,.36,-.40],.12,.15,wood,.61);
    // One half of the roof has fallen in a sheet, with a sloping comb edge.
    // Narrow timbers joined into this plane are deliberately not random sticks.
    for(let j=0;j<7;j++){
      const z=.18+j*.15,span=.88+.56*noise(j+2,site+3),endU=-1.60+span;
      beam([-1.61,1.25-.14*z,z],[endU,1.25-.14*z-.59*span,z+.14],
        .11,.125,mixed(j%3?wood:rust,coal,.29+.18*noise(j,site)),.68,.51,.18);
    }
    // Dark irregular dirt/ash splash on the visible terrain, heated small
    // slivers just inside the split floor. Split cracks, not a solid orange tile.
    const center=vec(X(-.63,0,-.16)),ig=p.length/3;center.y=worldGround(center.x,center.z)+.026;vtx(center,mixed(coal,rim,.22));
    for(let j=0;j<11;j++){const an=j*2*Math.PI/11,rad=.76+.22*noise(j+4,site+5),[x,w]=world(-.67+1.3*rad*Math.cos(an),1.47*rad*Math.sin(an));
      vtx(new T.Vector3(x,worldGround(x,w)+.021,w),mixed(ash,coal,.52+.29*noise(j,site*3)));}
    for(let j=0;j<11;j++){const a=ig+1+j,b=ig+1+(j+1)%11;ix.push(ig,mirror>0?b:a,mirror>0?a:b);}
    for(let j=0;j<6;j++){const u=-.60+noise(j+1,site)*.58,z=-.80+noise(j+23,site)*1.00;
      beam([u,.29,z],[u+.12+.15*noise(j,60),.34,z+.13],.041,.032,mixed(burn,coal,.26),.91,.03);}
    for(const [u,y,z] of [[-.62,.26,-.56],[.07,.25,-.19],[-1.22,.37,.55]])
      beam([u-.29,y,z-.13],[u+.31,y+.04,z+.13],.17,.12,mixed(coal,burn,.26),.87);
    const pocket=(u:number,y:number,z:number,w:number,h:number,d:number)=>({
      position:X(u,y,z),scale:[w*sz,h*sz,d*sz] as P,
    });
    const fire=[pocket(-.62,.30,-.56,1.70,2.14,1.27),pocket(.07,.30,-.19,.98,1.24,.79),
      pocket(-1.22,.44,.55,.92,1.32,.74)];
    // Four windblown cinders still lift off the hot side of the collapsed deck.
    for(let j=0;j<4;j++){
      const pt=X(-.60+.22*noise(j,site),.52,-.51+.21*noise(site,j)),n=fp.length/3;
      for(let i=0;i<4;i++){
        fp.push(...pt);fuv.push(i%2,Math.floor(i/2));
        attr.push((.082+.03*noise(j,2))*sz,(.11+.035*noise(j,4))*sz,.12+j*.27+site*.19);
      }
      fi.push(n,n+1,n+2,n+1,n+3,n+2);
    }
    records.push({origin:[cx,base,cz],feet,fire,yaw});
  });
  const timber=new T.BufferGeometry();timber.setAttribute('position',new T.Float32BufferAttribute(p,3));
  timber.setAttribute('color',new T.Float32BufferAttribute(colors,3));timber.setIndex(ix);timber.computeVertexNormals();timber.computeBoundingSphere();
  const cinders=new T.BufferGeometry();
  cinders.setAttribute('position',new T.Float32BufferAttribute(fp,3));
  cinders.setAttribute('uv',new T.Float32BufferAttribute(fuv,2));
  cinders.setAttribute('cinder',new T.Float32BufferAttribute(attr,3));
  cinders.setIndex(fi);cinders.computeBoundingSphere();cinders.boundingSphere!.radius+=3;
  return {timber,cinders,sites:records};
}

export function createCampaignCinderMaterial(time:{value:number}){
  return new T.ShaderMaterial({
    name:'campaign-rubble: windblown cinders',fog:true,toneMapped:false,depthWrite:false,transparent:true,
    uniforms:{...T.UniformsUtils.clone(T.UniformsLib.fog),uTime:time},
    vertexShader:`#include <fog_pars_vertex>
      attribute vec3 cinder;uniform float uTime;varying vec2 vCell;
      void main(){vCell=uv;float t=fract(uTime*.52+cinder.z);
        vec3 pos=position+vec3(.84*t*t+.16*sin(t*6.+cinder.z)*t,.24+1.48*t,.20*t*t);
        vec2 size=cinder.xy*smoothstep(0.,.10,t)*(1.-smoothstep(.58,.93,t));
        vec4 mvPosition=modelViewMatrix*vec4(pos,1.);
        mvPosition.xy+=(uv-vec2(.5,0.))*size;gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`#include <fog_pars_fragment>
      varying vec2 vCell;
      void main(){if(vCell.x+vCell.y<.46||vCell.x+vCell.y>1.53)discard;
        gl_FragColor=vec4(mix(vec3(.66,.136,.025),vec3(.94,.47,.112),step(.5,vCell.y)),1.);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
