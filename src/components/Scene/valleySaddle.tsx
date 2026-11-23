import {useEffect,useMemo} from 'react';
import {useLoader} from '@react-three/fiber';
import * as T from 'three';
import {DAY_SUN_BEARING} from './crossingSun';

const TAU=2*Math.PI;
const sat=(n:number)=>Math.max(0,Math.min(1,n));
const tint=(c:string)=>new T.Color(c);
const SCARP_PROFILE=[[-1,0],[-.63,.22],[-.39,.34],[-.25,.66],[-.13,.72],[0,1],[.14,.92],[.19,.57],[.45,.40],[.69,.14],[1,0]] as const;
// An offset shoulder of wooded limestone, not a radial Gaussian hump. The
// scarps rise by shelves on one side and carry talus along the other side.
function scarp(a:number,c:number,left:number,right:number,reverse=false){
  const d=Math.atan2(Math.sin(a-c),Math.cos(a-c))*(reverse?-1:1);
  const s=d/(d<0?left:right);
  if(s<=-1||s>=1)return 0;
  let k=1;while(s>SCARP_PROFILE[k][0])k++;
  const [x,y]=SCARP_PROFILE[k-1],[nx,ny]=SCARP_PROFILE[k];
  return y+(ny-y)*(s-x)/(nx-x);
}
function middleRelief(a:number,far:boolean){
  // Interleaved on the two physical layers. Leave the actual 71° sun gap
  // and the approach to the occupied east shoulder quiet in both layers.
  return far
    ?16*scarp(a,.66,.35,.18)+8*scarp(a,.91,.14,.20,true)
      +12*scarp(a,2.20,.26,.36)+6*scarp(a,3.44,.24,.16,true)+10*scarp(a,4.78,.39,.30)
    :7*scarp(a,.77,.32,.24,true)+6*scarp(a,2.30,.21,.31)
      +8*scarp(a,3.25,.25,.43,true)+6*scarp(a,4.64,.31,.26);
}
/** Two interlocking foothills. The dark face is a ravine cut *into* the
 * hillside, not a stripe on a cylinder; its projecting spur recedes as the
 * creek fans toward the foot. The bottom of both skirts closes the view even
 * from the elevated crash camera on the far side of the patrol loop. */
export function createValleySaddle(){
  const xyz:number[]=[],shade:number[]=[],uv:number[]=[],idx:number[]=[],N=272,
    levels=[0,.19,.41,.60,.78,.91,1],color=new T.Color(),
    greens=[tint('#484a46'),tint('#706b5c')],blues=[tint('#717a71'),tint('#929184')],
    treeShade=tint('#444d4c'),rock=tint('#7a705f'),sunAir=tint('#bc9d76'),riverAir=tint('#85958a');
  for(let layer=0;layer<2;layer++){
    const far=layer===0,base=xyz.length/3;
    for(let i=0;i<=N;i++){
      const a=(i%N)*TAU/N,bearing=a+layer*.37,
        fold=Math.sin(18*bearing+1.6*Math.sin(bearing*7)+.54*Math.sin(bearing*11)),
        lip=Math.abs(Math.sin(37*bearing+2.4*Math.sin(bearing*8)))*1.7,
        horn=middleRelief(a,far),
        crease=3.5*Math.abs(fold)+.94*Math.cos(67*bearing)+lip,
        crest=(far?15.6:9.2)+(far?1.13:.84)*horn+4*Math.sin(4*bearing+.7)+crease,
        skirt=(far?158:127)+3.7*Math.cos(a*5+1.2*layer);
      for(let j=0;j<levels.length;j++){
        const f=levels[j],fall=1-f,
          // Stream beds bifurcate low on the face, constrict beneath the crown.
          axis=bearing+fall*(.021*Math.sin(11*bearing+layer)+.013*Math.cos(19*bearing)),
          ravine=Math.pow(1-Math.abs(Math.sin(axis*17+1.64*Math.sin(axis*7)+fall*1.33)),2),
          spur=Math.abs(Math.sin(axis*24+1.83*Math.sin(axis*6)+fall*.9)),
          split=Math.sin(axis*30+fall*2.6+.86*Math.sin(9*axis)),
          radius=skirt+f*23+fall*(4*ravine-8*spur),
          h=j===0?-34:crest*(f-.05)-3.2*ravine*(1-Math.abs(f-.58))+1.9*spur*Math.sin(Math.PI*f),
          // Shear each sloping facet around its gully instead of a ring of
          // strictly horizontal levels. All rows meet exactly at the seam.
          az=a+fall*.014*Math.sin(bearing*7+f*3.4);
        xyz.push(Math.cos(az)*radius,h,Math.sin(az)*radius);
        const p=far?blues:greens;
        color.copy(p[0]).lerp(p[1],sat(.28+.28*f+.26*split+.18*spur-.35*ravine));
        // R3's river painting has ochre under the solar break, then a run
        // of muted eucalyptus and slate shoulders. The haze is in the
        // *valley*; giving every summit a bright rim outlines the layers.
        const sunrise=sat((Math.cos(a-DAY_SUN_BEARING)-.55)/.45),upper=sat((f-.40)/.60);
        if(far)color.lerp(riverAir,.24+.09*(1-upper)).lerp(sunAir,sunrise*sunrise*(.28+.19*(1-upper)));
        else color.lerp(treeShade,.15*ravine).lerp(rock,.12*upper*sat(split))
          .lerp(riverAir,.12+.07*(1-upper)).lerp(sunAir,.14*sunrise*sunrise);
        color.toArray(shade,shade.length);
        // Borrow ONLY the existing painted mountain toe; no new texture,
        // screen projection, horizon cutout or repeated texture fetch.
        uv.push(i/N+(far?.21:.57)+.025*fall*Math.sin(a*7+.7*layer),
          .008+.115*f+.018*split*Math.sin(Math.PI*f));
        if(i&&j){const b=base+i*levels.length+j;idx.push(b-levels.length-1,b-1,b-levels.length,b-levels.length,b-1,b);}
      }
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
  g.setAttribute('color',new T.Float32BufferAttribute(shade,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeBoundingSphere();return g;
}
export function ValleySaddle(){
  // Match SkyDome's complete loader key, so this is the exact shared texture
  // object (a single-URL lookup would create another cached GPU texture).
  const [,painted]=useLoader(T.TextureLoader,['/images/textures/vietnam-monsoon-panorama-v1.png','/images/textures/ghost-river-olive-karst-v9.png']);
  const geo=useMemo(createValleySaddle,[]),material=useMemo(()=>{
    const m=new T.MeshBasicMaterial({map:painted,vertexColors:true,side:T.DoubleSide,fog:false});
    m.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`
      // Painted escarpment detail complements the physical folded surface;
      // retain blue atmospheric separation from the much greener near brush.
      vec3 ridgePaint=texture2D(map,vMapUv).rgb;
      float ridgeValue=dot(ridgePaint,vec3(.26,.57,.17));
      // A sunless, forested foothill is nearer than the painted ranges.
      // The old gain pushed its crest to chalk after ACES, particularly
      // between palms on the rear turn. Preserve folds in this narrow value
      // range without turning their silhouette into a white distant rim.
      diffuseColor.rgb*=clamp(.66+ridgeValue*1.62,.69,.91);
    `);};m.customProgramCacheKey=()=>'forested-spur-amber-air-v3';return m;
  },[painted]);
  useEffect(()=>()=>{geo.dispose();material.dispose();},[geo,material]);
  return <mesh name="mist-layered-river-saddle" geometry={geo} material={material}/>;
}
