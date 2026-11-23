// The game's first directional light is the shadow-casting jungle sun or
// embassy moon. Read its real view-space direction/colour. Model and camera
// can both turn; no camera-facing rim, additive pass or emissive fill.
export const FIELD_LIGHT_GROUPS=`
  vec3 fieldLightGroup(vec3 viewNormal){
    vec3 up=normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz);
    vec3 face=normalize(viewNormal);
    #if NUM_DIR_LIGHTS > 0
      vec3 key=normalize(directionalLights[0].direction);
      vec3 hue=directionalLights[0].color;
      float sun=smoothstep(.03,.38,(hue.r-hue.b)/max(.01,max(hue.r,hue.b)));
      // A worn upper plane receives a hemisphere as well as the low key.
      float lit=smoothstep(-.12,.66,dot(face,normalize(key+.75*up)));
      return vec3(lit,dot(face,up),sun);
    #else
      return vec3(smoothstep(-.08,.71,dot(face,up)),dot(face,up),0.);
    #endif
  }
  vec3 fieldWornDye(vec3 pigment,vec3 field,float amount,vec3 dayDye,vec3 nightDye){
    // Pigment raises diffuse reflectance only, so geometry shadows, fog,
    // tonemapping and each mode's cold/warm lights still act normally.
    float sky=smoothstep(-.16,.65,field.y);
    float group=smoothstep(.08,.83,.74*field.x+.26*sky);
    vec3 high=pigment*.50+mix(nightDye,dayDye,field.z);
    return mix(pigment,high,amount*(.13+.87*group));
  }
`;
