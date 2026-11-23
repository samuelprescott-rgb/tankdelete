import * as T from 'three';
import {createRiverCrossings,riverCrossingAmount,sampleRiverStation,type RiverStation} from './riverLayout';
import {coordinateNoise} from './environmentGeneration';
import {riverApron} from './riverVerticalSection';
import {createTankGroundProfile} from '../../lib/tankGroundProfile';
import {createScouredBank,type ScouredBank} from './scouredBank';
import {cipherGLSL,surfaceCipherAtlas} from './surfaceCipher';

// Small, partly exposed plates follow the measured soil triangle everywhere.
// Their highest skin is at most a boot-sole above the bed. Keep the whole
// playable timber span and ford clear; these are shoreline detail, not cover.
export function createRiverTalus(river:RiverStation[],seed:number,slice:ScouredBank|null=createScouredBank(river,seed)){
  const xyz:number[]=[],rgb:number[]=[],paint=new T.Color(),ground=createTankGroundProfile(river,seed),
    crossings=createRiverCrossings(river);
  type P=[number,number,number];
  const tri=(a:P,b:P,c:P,ink:string,lum:number)=>{
    paint.set(ink).multiplyScalar(lum);
    for(const p of [a,b,c]){xyz.push(...p);rgb.push(paint.r,paint.g,paint.b);}
  };
  // Broken sod and gravel fans occur in pockets on the newly exposed low
  // benches, not as a continuous pale outline. Each fragment sits back on
  // real soil and the reed clumps pinch out with the terrace; one static draw.
  for(const side of [-1,1])for(let i=0;i<11;i++){
    const n=(j:number,k:number)=>coordinateNoise(i*11+j,side,seed,k+5910),
      z=2.3+i*.95+n(0,1)*.58,s=sampleRiverStation(river,z)!,bank=riverApron(s,side);
    if(bank.mass<.24||n(0,2)<.24)continue;
    // Stepped setback is independent of the waterline; most of these
    // pockets are out on the previously flat land, never over open water.
    const x=bank.edge+side*bank.width*(.12+.39*n(1,1)),
      dx=(sampleRiverStation(river,z+.35)!.centerX-sampleRiverStation(river,z-.35)!.centerX)/.7,
      norm=Math.hypot(dx,1),tx=dx/norm,tz=1/norm,
      point=(l:number,d:number,h:number):P=>{const a=x+tx*l+side*tz*d,b=z+tz*l-side*tx*d;
        return [a,ground.height(a,b)+h,b];};
    for(let k=0;k<4;k++){
      const l=(n(k,3)-.5)*1.70,d=(n(k,4)-.5)*.61,p=.15+.17*n(k,5),q=.095+.13*n(k,6),
        a=point(l-p,d-.33*q,.012),b=point(l-.38*p,d+.87*q,.021),c=point(l+.82*p,d+.49*q,.019),
        e=point(l+p,d-.32*q,.010),f=point(l-.14*p,d-q,.009),ridge=point(l-.13*p,d+.06*q,.040+.037*n(k,7)),
        ink=['#645a42','#716b54','#67684f','#786a53'][k],ring=[a,b,c,e,f];
      for(let j=0;j<5;j++)tri(ridge,ring[j],ring[(j+1)%5],ink,.86+.17*n(j,k+20));
    }
    if(n(0,12)<.37)continue;
    const length=.30+.43*n(0,13);
    for(let k=0;k<14;k++){
      const t=n(k,14)*2-1,l=t*length,d=(n(k,15)-.5)*.30*(1-t*t),h=(.095+.19*n(k,16))*(1-.56*Math.abs(t)),
        root=point(l,d,.014),second=point(l+.021+.014*n(k,18),d+.016,.014),mid=point(l+.024,d-.035,h*.65),tip=point(l+.039,d-.085,h);
      tri(root,mid,second,k%4?'#67704c':'#877e56',1);tri(second,mid,tip,k%3?'#788253':'#a39865',1);
    }
  }
  // The approach ruts now belong to the dry soil material. Discrete bright
  // tread quads looked like rails laid on top of the track at chase distance.
  for(let i=0;i<46;i++)for(const side of [-1,1]){
    const n=(j:number,k:number)=>coordinateNoise(i*13+j,side,seed,k+3170);
    if(n(0,0)<.34)continue;
    const z0=.8+i*.88+(n(1,1)-.5)*.55;
    // This reach has its own individually surveyed ledges and tree roots.
    if(slice&&z0>3.4&&z0<17.6)continue;
    for(let j=0;j<2+Math.ceil(n(1,2)*3);j++){
      // Keep distinct stones on the new stepped banks, rather than filling
      // every previously dry fan or increasing the single-draw budget.
      if(z0>18&&z0<40&&j>1&&((i+j+side)%3===0))continue;
      const z=z0+(n(j,3)-.5)*1.36,s=sampleRiverStation(river,z)!,
        w=s.waterHalfWidth,x=s.centerX+side*(w-.14+n(j,4)*(s.mudHalfWidth-w+.15));
      if(crossings.some(c=>riverCrossingAmount(x,z,c,1.06)>0))continue;
      const beach=T.MathUtils.smoothstep(z,-.5,3.1)*(1-T.MathUtils.smoothstep(z,10,14.2));
      const along=(.17+.44*n(j,5))*(1-.37*beach),across=(.10+.19*n(j,6))*(1-.39*beach),lean=Math.atan2(
        sampleRiverStation(river,z+.4)!.centerX-sampleRiverStation(river,z-.4)!.centerX,.8),
        rot=lean+(n(j,7)-.5)*.91,walk=[Math.sin(rot),Math.cos(rot)],rip=[walk[1],-walk[0]];
      const hot=n(j,8),wet=Math.abs(x-s.centerX)<w+.15;
      // Small embedded pebbles near the player, not large elevated bevels
      // bridging two levels of a steep bank. Broader slates remain downstream.
      const top=wet?['#777c78','#8a8573','#738074'][j%3]:beach>.45?['#94846f','#9a8b70','#847f6d','#927d64'][j%4]:['#b19b76','#aa9e83','#93968a','#a58a6e'][j%4];
      const y=ground.height(x,z),peak:P=[x,y+(.043+.098*hot)*(1-.72*beach),z],ring:P[]=[],base:P[]=[];
      const sides=5+(j%2)+(beach>.5?2:0);
      for(let k=0;k<sides;k++){
        const a=(k+.19*n(j,k+12))*2*Math.PI/sides,l=Math.cos(a)*along*(.82+.22*n(j,k+23)),
          q=Math.sin(a)*across,xx=x+l*walk[0]+q*rip[0],zz=z+l*walk[1]+q*rip[1],h=ground.height(xx,zz);
        ring.push([xx,h+(.014+.052*n(j,k+32))*(1-.66*beach),zz]);base.push([xx,h-.13,zz]);
      }
      for(let k=0;k<sides;k++){
        const u=(k+1)%sides;tri(peak,ring[k],ring[u],top,.82+.29*n(j,k+41));
        tri(ring[k],ring[u],base[u],wet?'#505c58':'#776b59',.97);tri(ring[k],base[u],base[k],'#615e50',.94);
      }
    }
    // Thin deposited silt fans and overlapping straw/sedge islands give the
    // shore a soft irregular margin. Each vertex is set back onto its own
    // surveyed bed triangle, also where the river bends across the road.
    for(let h=0;h<3;h++){
      const z=z0+(h-1)*.51+n(h,60)*.36,s=sampleRiverStation(river,z)!,rim=s.mudHalfWidth-s.waterHalfWidth,
        x=s.centerX+side*(s.waterHalfWidth+rim*(.13+.61*n(h,61)));
      if(crossings.some(c=>riverCrossingAmount(x,z,c,1.11)>0))continue;
      const len=.26+.61*n(h,62),width=.09+.19*n(h,63),along=Math.atan2(sampleRiverStation(river,z+.4)!.centerX-sampleRiverStation(river,z-.4)!.centerX,.8),
        point=(l:number,d:number,up:number=0):P=>{const xx=x+Math.sin(along)*l+Math.cos(along)*d,zz=z+Math.cos(along)*l-Math.sin(along)*d;
          return [xx,ground.height(xx,zz)+.013+up,zz];},tip=point(len,.03,0),tail=point(-len*.72,-width*.04),l=point(-len*.22,-width),r=point(len*.29,width*.86),c=point(.01,-width*.09,.013);
      const skin=['#998362','#a28c6d','#8f8165'][h];tri(tip,c,l,skin,.94);tri(tip,r,c,skin,1.01);tri(c,tail,l,skin,.91);tri(r,tail,c,skin,.98);
      if(h===1||n(h,64)<.42)continue;
      // Folded blades bend outward in a shared gust; not round bushes or a
      // continuous line of identical reed cones at the water boundary.
      for(let b=0;b<10;b++){
        const salt=h*20+b,a=n(salt,65)*6.283,ext=.12+.20*n(salt,66),height=.12+.24*n(salt,67),
          base=point((n(salt,68)-.5)*.38,(n(salt,69)-.5)*.16),w=.038+.032*n(salt,70),
          root2:P=[base[0]+w*Math.cos(a),base[1],base[2]-w*Math.sin(a)],
          mid:P=[base[0]+.6*ext*Math.sin(a),base[1]+height*.62,base[2]+.6*ext*Math.cos(a)],
          end:P=[base[0]+ext*Math.sin(a),base[1]+height*(.82+.2*n(salt,71)),base[2]+ext*Math.cos(a)];
        tri(base,mid,root2,b%3?'#59623b':'#867d44',1);tri(mid,end,root2,b%4?'#7c8550':'#adb074',.97);
      }
    }
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(xyz.concat(slice?.pos??[]),3));
  geo.setAttribute('bankFigure',new T.Float32BufferAttribute(new Array(xyz.length/3).fill(0).concat(slice?.figure??[]),1));
  geo.setAttribute('bankBrush',new T.Float32BufferAttribute(new Array(xyz.length*2/3).fill(0).concat(slice?.brush??[]),2));
  geo.setAttribute('color',new T.Float32BufferAttribute(rgb.concat(slice?.color??[]),3));geo.computeVertexNormals();
  if(slice){
    // Keep fractured planes in the dipping schist but carry soft, connected
    // normals over worn lips and the root flutes; formerly each tip was a
    // conspicuous triangular bevel. Only average within the same figure.
    const pos=geo.getAttribute('position'),norm=geo.getAttribute('normal'),skin=geo.getAttribute('bankFigure');
    const cache=new Map<string,T.Vector3>(),start=xyz.length/3,v=new T.Vector3();
    const key=(i:number)=>[skin.getX(i),pos.getX(i),pos.getY(i),pos.getZ(i)].join(':');
    for(let i=start;i<pos.count;i++){const k=key(i);if(!cache.has(k))cache.set(k,new T.Vector3());cache.get(k)!.add(v.fromBufferAttribute(norm,i));}
    for(const n of cache.values())n.normalize();
    for(let i=start;i<pos.count;i++){
      const n=v.fromBufferAttribute(norm,i).lerp(cache.get(key(i))!,skin.getX(i)===2?.88:.73).normalize();
      norm.setXYZ(i,n.x,n.y,n.z);
    }
  }
  geo.computeBoundingSphere();return geo;
}

export function createTalusMaterial(grit?:T.Texture,bark?:T.Texture){
  const m=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  m.onBeforeCompile=shader=>{
    shader.uniforms.bankGrit={value:grit??null};shader.uniforms.bankBark={value:bark??null};
    shader.uniforms.surfaceCipherMap={value:surfaceCipherAtlas()};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float bankFigure; attribute vec2 bankBrush; varying float vBankSkin; varying vec3 vBankP; varying vec2 vBrush;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvBankP=position; vBankSkin=bankFigure;vBrush=bankBrush;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vBankSkin; varying vec3 vBankP; varying vec2 vBrush; uniform sampler2D bankGrit,bankBark;'+cipherGLSL)
      .replace('#include <color_fragment>',`#include <color_fragment>
        if(vBankSkin>.5){
          vec3 p=vBankP;
          float rock=1.-step(1.5,vBankSkin);
          vec2 uv=vec2(p.x*.78+p.z*.47,p.z*.89-p.x*.23+p.y*.87);
          vec2 marks=cipherField(uv*vec2(32.,27.));
          float grain=dot(uv,vec2(9.8,6.3))+1.31*sin(uv.x*4.7)+.72*cos(uv.y*9.0);
          float wetline=1.-smoothstep(-.584,-.418,p.y+.029*sin(grain));
          float chips=${grit?`smoothstep(.025,.24,dot(texture2D(bankGrit,uv*.77).rgb,vec3(.33,.52,.15)))`:'.47'};
          float rifts=${bark?`smoothstep(.030,.216,dot(texture2D(bankBark,vec2(vBrush.x*1.78,vBrush.y*.63+.07*sin(vBrush.x*6.28))).rgb,vec3(.30,.54,.16)))`:'.48'};
          float bedding=sin(7.3*p.x-3.2*p.z+29.*p.y+1.96*sin(1.56*p.x+.56*p.z));
          diffuseColor.rgb*=1.+.105*sin(grain)*sin(uv.x*17.1-uv.y*11.3)+.078*bedding*rock;
          diffuseColor.rgb*=mix(.61+1.01*rifts, .69+.73*chips,rock);
          diffuseColor.rgb+=rock*vec3(.035,.040,.041)*smoothstep(.63,.96,chips)*(1.-wetline*.7);
          diffuseColor.rgb*=mix(vec3(1.),vec3(.57,.72,.80),wetline);
          float quartz=smoothstep(.95,.995,bedding)*smoothstep(.16,.77,sin(grain*.53))*(1.-wetline)*rock;
          diffuseColor.rgb+=vec3(.057,.052,.039)*quartz;
          diffuseColor.rgb=diffuseColor.rgb*(1.-.11*marks.g)+marks.r*(diffuseColor.rgb*.31+vec3(.022,.024,.022));
          if(rock<.5){
            float split=vBrush.x*147.+2.7*sin(vBrush.y*3.87)+.72*sin(vBrush.y*9.12+7.*vBrush.x);
            float resolve=1.-smoothstep(.31,1.82,fwidth(split));
            float crease=smoothstep(.34,.95,sin(split))*smoothstep(-.54,.75,sin(vBrush.y*8.1+vBrush.x*33.));
            diffuseColor.rgb*=1.-.36*crease*resolve-.19*wetline;
            diffuseColor.rgb+=vec3(.052,.044,.032)*smoothstep(.84,.99,sin(split+.82))*resolve*(1.-wetline);
          }
        }`).replace('#include <opaque_fragment>',`if(vBankSkin>.5){ float soak=1.-smoothstep(-.60,-.39,vBankP.y); vec3 V=normalize(vViewPosition); float rim=1.-abs(dot(normal,V)); outgoingLight+=vec3(.044,.053,.063)*soak*(rim*rim)*(.3+.7*max(0.,normal.y)); }\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey=()=>'mineral-bark-seep-v3:'+Number(!!grit)+Number(!!bark);return m;
}
