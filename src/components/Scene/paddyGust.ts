// Shared world-space envelope. The curved front travels downwind while the
// crosswind lobes leave pockets of still rice and water between gusts.
export const paddyGustGLSL = /* glsl */ `
const vec2 paddyWind = normalize(vec2(1.65,.49));
vec2 paddyWindCoords(vec2 point) {
  return vec2(dot(point,paddyWind),dot(point,vec2(-paddyWind.y,paddyWind.x)));
}
float paddyGust(vec2 wind, float time) {
  float passage=wind.x*.83-time*1.75+.85*sin(wind.y*.63)+.37*sin(wind.y*1.24+wind.x*.19);
  float pocket=.57+.32*cos(wind.y*1.12+wind.x*.23-time*.30)+.17*sin(wind.y*.43-time*.33);
  return smoothstep(.04,.89,cos(passage))*smoothstep(.09,.80,pocket);
}
`;
