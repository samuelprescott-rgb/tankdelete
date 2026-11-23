// Sky, foliage and water use the same world-space bearing.
export const eclipseBearingGLSL = 'const vec3 eclipseRay=normalize(vec3(.895,.254,.37));';

export const eclipseReflectionGLSL = /* glsl */ `
  ${eclipseBearingGLSL}
  vec3 wetEclipse(vec3 mirrorRay,float crest){
    float facing=dot(mirrorRay,eclipseRay);
    float cloud=smoothstep(.92,.994,facing);
    float core=smoothstep(.984,.999,facing);
    return vec3(.14,.037,.24)*(cloud*.11+core*(.16+.73*crest));
  }
`;
