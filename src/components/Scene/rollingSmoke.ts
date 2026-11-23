import * as T from 'three';

export const CHARCOAL_TEXTURE='/images/textures/charcoal-cloud.png';

export function prepareSmokeInk(texture:T.Texture){
  texture.colorSpace=T.SRGBColorSpace;
  texture.magFilter=texture.minFilter=T.NearestFilter;
  texture.generateMipmaps=false;
  return texture;
}

// Two differently shaped lobes overturn around a moving contact patch. Combine
// their coverage before selecting an ink, so no outline survives inside the join.
export const rollingSmokeGLSL=`
  uniform sampler2D cloudAtlas;
  mat2 curlRotation(float angle){
    return mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
  }
  vec2 paintedLobe(vec2 uv,float tile){
    if(any(lessThan(uv,vec2(0.)))||any(greaterThanEqual(uv,vec2(1.))))return vec2(0.);
    vec2 sampleAt=(floor(uv*96.)+.5)/96.;
    vec2 cell=vec2(mod(tile,2.),floor(tile*.5));
    vec4 art=texture2D(cloudAtlas,(cell+sampleAt)*.5);
    return vec2(smoothstep(.008,.19,dot(art.rgb,vec3(.27,.57,.16))),art.a);
  }
  vec4 rollingSmoke(vec2 uv,float h,float seed,float beat,float celLight){
    vec2 p=(floor(uv*64.)+.5)/64.-.5;
    float swing=sin(beat+seed*2.), lift=cos(beat*.83+seed);
    // The trailing bank opens on the opposite side as the leading bank compresses.
    vec2 q=p+vec2(.095*swing,.09*lift);
    q.x+=.075*sin(7.*q.y+beat)*cos(q.y*2.7);
    vec2 a=curlRotation(.56*swing+.17*sin(beat*1.53+seed))*q/vec2(.78+.12*lift,.89-.10*swing)+.5;
    vec2 b=curlRotation(-.79*swing+seed)*(p-vec2(.17*swing+.055,-.12*lift))
             /vec2(.64-.12*lift,.67+.10*swing)+.5;
    float tile=mod(floor(seed*7.13),4.);
    vec2 first=paintedLobe(a,tile);
    vec2 second=paintedLobe(b,mod(tile+1.+mod(floor(seed*2.7),3.),4.));
    float cover=max(first.y,second.y);
    float seam=smoothstep(-.16,.16,p.x*swing+p.y*lift+.12*sin(beat+6.*p.x));
    float joined=mix(first.x,second.x,second.y*(1.-first.y+first.y*seam));
    // Shade the recess where the rear lobe turns under the forward shoulder.
    float overlap=first.y*second.y;
    float recess=overlap*(1.-abs(2.*seam-1.))*abs(first.x-second.x);
    float fold=clamp(joined+.14*celLight-.28*recess,0.,1.);
    float band=floor(fold*5.+.5)/5.;
    vec3 ink=mix(vec3(.012,.010,.016),vec3(.145,.130,.139),band*band);
    // Bounce reaches the shadowed undersides first and falls away across the
    // actual height of each parcel, including its overlap with the flame tips.
    float heat=(1.-smoothstep(.08,.52,h))*(.82+.18*cos(beat*1.6+seed));
    #if defined(USE_FOG) && !defined(FOG_EXP2)
      // In daylight only the underside nearest the fuel reads warm across the field.
      float acrossField=smoothstep(fogNear*.75,mix(fogNear,fogFar,.42),vFogDepth);
      heat*=mix(1.,.055+.23*(1.-smoothstep(.035,.22,h)),acrossField);
    #endif
    float face=clamp(.36+.87*fold-.35*p.y+.12*lift,0.,1.);
    vec3 hot=mix(vec3(.16,.026,.012),vec3(.99,.32,.052),floor(face*5.+.5)/5.);
    return vec4(mix(ink,hot,heat*(.30+.70*face)*(1.-.28*recess)),cover);
  }`;
