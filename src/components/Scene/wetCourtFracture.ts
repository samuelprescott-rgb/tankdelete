/** World-pinned water coverage, shared by the two existing pavement passes.
 * Every short, bent crest has its own centre, taper, and missing chips. No
 * screen noise, random frame seed, or horizontal stripe spanning a slab. */
export const WET_CREST_GLSL=/* glsl */`
  float crestHash(vec2 cell){
    vec3 n=fract(vec3(cell.xyx)*vec3(.1031,.11369,.13787));
    n+=dot(n,n.yzx+19.19); return fract((n.x+n.y)*n.z);
  }
  float waterCrest(vec2 world,float salt){
    vec2 p=floor(world*36.)/36.;
    float bend=.047*sin(p.x*3.5+p.y*.73+salt)+.035*sin(p.x*6.8-p.y*1.4);
    float row=(p.y+bend)*8.75, ri=floor(row);
    float shift=crestHash(vec2(ri,salt));
    float col=p.x*(1.10+.92*shift)+shift*8.;
    float chip=crestHash(vec2(floor(col)+salt,ri));
    float u=fract(col), v=fract(row);
    float mid=.31+.34*chip, offset=abs(u-mid)/(.26+.20*shift);
    float lens=max(0.,1.-offset*offset);
    float edge=abs(v-(.35+.26*shift+(u-mid)*(.43-chip)))-(.12+.23*chip)*lens;
    float bank=(1.-smoothstep(-.035,.090,edge))*(1.-smoothstep(.84,1.05,offset));
    // Individual dry notches split selected islands, not an infinitely long
    // fissure across unrelated water. The missing ends expose the slab.
    float fiss=abs(u-(.22+.54*shift)+.17*(v-.5));
    return bank*mix(1.,smoothstep(.033,.089,fiss),step(.42,chip));
  }
`;
