// Sunlit crossing only. Metres along the crest and into the low sunrise;
// independent finite crests instead of a light stripe parallel to the bed.
// A crest is broad enough to read from the chase camera but thin in depth.
export const riverSunGlintsGLSL = /* glsl */ `
float riverCrestInk(float across,float toward,float time,float pixel){
  float shear=.103*sin(across*.82+toward*.43)+.033*sin(across*2.47-toward*.52);
  float lanes=(toward+shear-time*.055)/.287;
  float row=floor(lanes);
  float columns=across/1.46+.86*wetlandHash(vec2(row,8.9));
  float col=floor(columns);
  float pick=wetlandHash(vec2(col+6.2,row-3.4));
  float size=wetlandHash(vec2(col-4.3,row+8.1));
  float u=(fract(columns)-.50)*1.46+(size-.5)*.19;
  float v=(fract(lanes)-.50)*.287+.045*(pick-.50);
  float span=.118+.296*size;
  float tip=1.-smoothstep(.54,1.,abs(u)/span);
  float ridgeTilt=.13*(pick-.5)+.066*sin(col*.93-row*.42);
  float bend=.023*(u/span)*(u/span)+ridgeTilt*u+.008*sin(12.*u+row*.83);
  float width=.0085+.012*size+.008*tip;
  float aa=clamp(pixel*.53,.003,.065);
  float stroke=1.-smoothstep(max(.0,width-aa),width+aa,abs(v-bend));
  // Occasional neighbouring lip, shorter and offset, not a second full row.
  // Wind rips a long lip into a few uneven flecks, not evenly spaced rails.
  float ripped=.56+.44*smoothstep(-.36,.38,sin(u*(31.+15.*size)+row*2.49+col*.53)+.73*sin(u*18.3-row*1.39));
  float skip=smoothstep(.10,.38,pick)*tip*ripped;
  float lip=(1.-smoothstep(.006,.015+aa,abs(v-bend-.078)))*(1.-smoothstep(.14,.62,abs(u/span+.18)))*smoothstep(.63,.86,pick);
  float packet=smoothstep(-.72,.52,.64*sin(toward*1.01+.66*sin(across*.79))+.48*cos(across*1.42-toward*.35));
  return (stroke*skip+.42*lip)*(.26+.74*packet)*(.55+.45*size)*(1.-smoothstep(.105,.29,pixel));
}
float riverSunOpening(float alignment,float elevation,float opening){
  return opening*smoothstep(.951,.995,alignment)*(1.-smoothstep(.135,.44,abs(elevation-.26)));
}
`;
