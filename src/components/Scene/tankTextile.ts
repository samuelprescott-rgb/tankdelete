import * as THREE from 'three';
import {castEnamelSource} from './tankSurface';

/** Small, repeatable surface study. Red carries over-under canvas threads;
 * green carries irregular islands of broken paint, blue their polished edge.
 * Nearest on magnification keeps the grouped pixels, mips integrate threads
 * at drive distance instead of crawling as the camera travels. No animation. */
export function createTankSurfaceStudy() {
  const n=64, bytes=new Uint8Array(n*n*4);
  const field=(x:number,y:number)=>{
    const h=Math.sin((x%16)*73.23+(y%16)*29.61+2.481)*986.321;
    return h-Math.floor(h);
  };
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=(y*n+x)*4;
    const u=(x+(y>>2))&7,v=y&7, cross=((x>>3)+(y>>3))&1;
    const highY=cross===0?v<4:v>=4,highX=u<4;
    const lift=highY?(u===1||u===5?.29:u===2||u===6?.17:0):(v===1||v===5?.27:v===2||v===6?.13:0);
    const shade=highY?(u===3||u===7?.20:0):(v===3||v===7?.18:0);
    const fleck=field(x>>2,y>>2);
    bytes[i]=Math.round((.47+lift-shade+(highX?.025:-.025)+(fleck-.5)*.095)*255);
    const cluster=field(x>>2,y>>2)*.73+field(x>>1,y>>1)*.19+field(x,y)*.08;
    bytes[i+1]=Math.round(255*THREE.MathUtils.smoothstep(cluster,.45,.77));
    bytes[i+2]=cluster>.62 && (((x+2*y)&7)===1||((x+y)&7)===3)?221:0;
    bytes[i+3]=255;
  }
  const t=new THREE.DataTexture(bytes,n,n,THREE.RGBAFormat);
  t.name='tank-woven-canvas-and-chipped-enamel';
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.NoColorSpace;
  t.magFilter=THREE.NearestFilter;t.minFilter=THREE.LinearMipmapLinearFilter;
  t.generateMipmaps=true;t.needsUpdate=true;return t;
}

/** Two *physical* finish fields on the real casting, not a view-facing line.
 * The broad one arcs from the port basket across the aft brow to the right
 * cheek. The lower one collects only in the hollows behind the lifting gear.
 * Neither changes the silhouette, normal, vertex paint or triangle count. */
export function dressTankCastContact(geometry:THREE.BufferGeometry) {
  const p=geometry.getAttribute('position'),norm=geometry.getAttribute('normal');
  const contact=new Uint8Array(2*p.count),step=THREE.MathUtils.smoothstep;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),ny=norm.getY(i),a=Math.atan2(x,z);
    const aftArc=1-step(Math.abs(a-.22),.91,1.95);
    const bow=.222+.052*Math.cos(a*1.39-.15)+.017*Math.sin(2.6*a+.45);
    const pressed=aftArc*(1-step(Math.abs(y-bow),.047,.153))
      *(.61+.39*step(ny,-.13,.64));
    const pocket=(cx:number,cy:number,cz:number,rx:number,ry:number,rz:number)=>
      1-step(Math.hypot((x-cx)/rx,(y-cy)/ry,(z-cz)/rz),.30,1);
    const lower=Math.max(pocket(.49,.015,.44,.17,.080,.21),
      pocket(-.29,.030,.66,.17,.087,.23),pocket(.13,-.020,.716,.14,.071,.19));
    contact[2*i]=Math.round(255*pressed);
    contact[2*i+1]=Math.round(255*lower);
  }
  geometry.setAttribute('tankCastContact',new THREE.Uint8BufferAttribute(contact,2,true));
  return geometry;
}

/** These parent materials are already textured. Use their broad rust,
 * fold and paint shapes to choose *where* a finer-scale layer can show.
 * Teeth and eye stay quiet; never tile a speckle over an entire vehicle. */
export function finishTankEnamel(m:THREE.MeshStandardMaterial,study:THREE.Texture,
                                 part:'jaw'|'guard'|'cheek',castCoat?:THREE.Texture) {
  const prior=m.onBeforeCompile,key=m.customProgramCacheKey();
  m.onBeforeCompile=function(shader,renderer) {
    prior.call(this,shader,renderer);
    shader.uniforms.uFineTankStudy={value:study};
    if(castCoat)shader.uniforms.uTankCastCoat={value:castCoat};
    const vary='varying vec3 vEnamelP;\nvarying vec3 vEnamelN;\n'
      +(part==='cheek'?'varying vec2 vTankCastContact;\n':'');
    shader.vertexShader=vary+(part==='cheek'?'attribute vec2 tankCastContact;\n':'')+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vEnamelP=position;vEnamelN=normal;
      ${part==='cheek'?'vTankCastContact=tankCastContact;':''}
    `);
    shader.fragmentShader=vary+'uniform sampler2D uFineTankStudy;\n'+(castCoat?castEnamelSource:'')+shader.fragmentShader.replace('#include <alphamap_fragment>',`
      ${part==='cheek'?'float castSteelGrain=0.;':''}
      {
        vec3 p=vEnamelP,n=normalize(vEnamelN);
        vec2 q=vec2(p.z+.62*p.x,p.y-.48*p.x+.17*p.z);
        vec3 sampleInk=texture2D(uFineTankStudy,q*3.7+vec2(.29,.61)).rgb;
        float chip=sampleInk.g;
        vec3 coat=diffuseColor.rgb;
        float ochre=smoothstep(.022,.091,coat.r-1.36*coat.g);
        float peak=clamp(n.y+.21*abs(n.z),.0,1.);
        ${part==='cheek'?`
          castSteelGrain=smoothstep(.29,.81,chip);
          // The broad aft plane is weather-darkened cast olive; the small
          // brow facing the sky keeps its original worn pigment. Reserve
          // the warm light swatch for the off-centre cloth, not the casting.
          float aft=smoothstep(.10,.62,p.z);
          float turn=smoothstep(-.36,.96,n.y+.22*n.z);
          coat=mix(coat,coat*vec3(.59,.69,.71),aft*(.94-.42*turn));
          float handle=1.-smoothstep(.038,.145,min(abs(p.z+.15),abs(p.z-.135)));
          float toe=1.-smoothstep(.07,.20,abs(p.y-.045));
          float rim=(1.-smoothstep(.026,.12,abs(p.y-.223)))*smoothstep(.33,.55,abs(p.x));
          float field=max(handle*toe*.79,rim*(.34+.31*peak));
        `:part==='guard'?`
          float contact=smoothstep(.855,.916,abs(p.x));
          float deckEnd=smoothstep(.48,.93,abs(p.z));
          float field=min(.91,ochre*.69+contact*(.24+.15*deckEnd)+peak*.13);
        `:`
          float red=smoothstep(.05,.22,coat.r-coat.g*1.45);
          float ivory=smoothstep(.46,.76,coat.g);
          // Rain carries old earth down from the lamp feet. On the rolled
          // rubbing edge the same cast olive thins to muted steel. Keep
          // the eye and ivory inside the original paint, not dirt noise.
          float handed=sign(p.x),xx=abs(p.x);
          float olive=smoothstep(.033,.085,coat.g-.99*coat.b)
            *(1.-smoothstep(.22,.46,coat.g))*(1.-red);
          float wipe=1.-smoothstep(.012,.105,abs(p.y-.56+.12*(p.z+.79)-.014*handed));
          wipe*=smoothstep(.40,.78,xx)*(1.-smoothstep(.025,.31,abs(p.z+.78+.07*handed)));
          float fall=1.-smoothstep(.025,.144,abs(xx-.45-.09*(p.y-.43)-handed*.036));
          fall*=smoothstep(.17,.26,p.y)*(1.-smoothstep(.47,.61,p.y))*smoothstep(.72,.99,-p.z);
          ${castCoat?`
            vec3 shellPigment=readCastEnamel(p,.59,1.35);
            // Only repaint the olive substrate: deep red, ivory, red iris
            // and black outline remain the already approved R9 pigments.
            vec3 drawnCoat=castEnamelGround(coat,shellPigment,.58);
            coat=mix(coat,drawnCoat,olive);
            float raw=sampleInk.g*.65+min(1.,dot(shellPigment,vec3(.26,.57,.17))*3.1)*.35;
          `:`float raw=sampleInk.g*.65+texture2D(uFineTankStudy,q*1.61+vec2(.49,.15)).g*.35;`}
          coat=mix(coat,vec3(.236,.205,.126),olive*fall*(.22+.27*raw));
          coat=mix(coat,vec3(.101,.114,.092),olive*wipe*(.17+.52*raw));
          coat=mix(coat,vec3(.294,.295,.226),olive*wipe*smoothstep(.74,.96,raw)*.63);
          float field=(.058+.13*red+.33*olive*wipe)*(1.-.94*ivory)*(.68+.32*abs(n.x));
        `}
        float floorChip=field*smoothstep(.36,.83,chip);
        diffuseColor.rgb=mix(coat,vec3(.093,.081,.058),floorChip*.63);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.40,.365,.272),field*sampleInk.b*(.37+.33*peak));
      }
      #include <alphamap_fragment>
    `);
    if(part==='cheek')shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`
      #include <metalnessmap_fragment>
      // After the upstream dirt/roughness layers; still before Three's
      // light evaluation and shadowing. No additive light or albedo change.
      float scrubbed = vTankCastContact.x;
      float wetChip = vTankCastContact.y * (.28 + .72 * castSteelGrain);
      roughnessFactor = mix(roughnessFactor,.38,scrubbed);
      metalnessFactor = mix(metalnessFactor,.25,scrubbed);
      roughnessFactor = mix(roughnessFactor,.31,wetChip);
      metalnessFactor = mix(metalnessFactor,.36,wetChip);
    `);
  };
  m.customProgramCacheKey=()=>key+'/field-enamel:'+part+(part==='cheek'?'/pressed-steel-v1':'')+(castCoat?'/cast-enamel-v1':'');
  return m;
}
