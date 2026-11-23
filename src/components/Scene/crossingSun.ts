// Footprints of the sun breaks in the village air. World metres, not
// screen UVs: the highlight follows the same diagonal over three surfaces.
// Shared with the shaft placements so a patch cannot drift onto a different
// section of river in a new camera angle.
export const SUN_BREAKS = [[-3.45,13.35,12.8,2.30,1.14,.27],[.28,15.54,13.2,1.28,.64,.24],
  [5.45,22.30,11.7,2.12,1.73,.23]] as const;

// One compass bearing for the actual directional light, canopy breaks, sky
// paint, and its two wet receivers. Azimuth is measured from +X toward +Z.
export const DAY_SUN_BEARING = .93;
export const DAY_SUN_ALTITUDE = .273;
export const DAY_SUN_XZ = [Math.cos(DAY_SUN_BEARING), Math.sin(DAY_SUN_BEARING)] as const;
export const DAY_SUN_RAY = [
  DAY_SUN_XZ[0] * Math.cos(DAY_SUN_ALTITUDE), Math.sin(DAY_SUN_ALTITUDE),
  DAY_SUN_XZ[1] * Math.cos(DAY_SUN_ALTITUDE),
] as const;
const glslVec = (v:readonly number[]) => `vec${v.length}(${v.map(n=>n.toFixed(8)).join(',')})`;
export const daySunAxisGLSL = glslVec(DAY_SUN_XZ);
export const crossingSunFunction = /* glsl */ `
float signalShaftFoot(vec2 p,vec2 foot,float width) {
  vec2 d=p-foot;
  vec2 axis=${daySunAxisGLSL};
  vec2 u=vec2(dot(d,vec2(axis.y,-axis.x))/width,dot(d,axis)/(width*2.9));
  return 1.-smoothstep(.13,1.35,dot(u,u));
}
float signalCrossingSun(vec2 p){
  if(p.y<4.||p.y>30.||abs(p.x)>14.)return 0.;
  return ${SUN_BREAKS.map(([x,z,,w])=>`signalShaftFoot(p,vec2(${x.toFixed(2)},${z.toFixed(2)}),${w.toFixed(3)})`).reduce((a,b)=>`max(${a},${b})`)};
}
`;
// R3 mapped the original horizon directly, without a grade or a longitude offset.
export const gradeDawnGLSL = /* glsl */ `
vec2 signalDawnUv(float azimuth,float elevation){
  return vec2(azimuth,clamp((elevation+.15)/1.28,.0015,.9985));
}
vec3 signalGradeDawn(vec3 paint,vec3 ray){return paint;}
`;
