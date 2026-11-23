// Linear-light endpoints also feed the relay's CPU-painted slipstream.
export const coalShadow = [.012,.010,.014] as const;
export const coalRim = [.114,.091,.095] as const;

// Shared linear-light pigments. The final argument is incident light from
// the fuel below the fold, so only the lower smoke catches the orange glow.
export const sootPigmentGLSL = `
  vec3 sootPigment(float light, float heat) {
    float band=floor(clamp(light,0.,.999)*5.)*.25;
    vec3 coal=mix(vec3(${coalShadow.join(',')}),vec3(${coalRim.join(',')}),band*band);
    vec3 ember=mix(vec3(.068,.019,.015),vec3(.66,.162,.036),band);
    return mix(coal,ember,heat*(.44+.56*band));
  }
`;
