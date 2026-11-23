import * as T from 'three';

export const EMBASSY_FUEL_TEXTURE='/images/textures/embassy-burning-fuel.png';
export const FUEL_FRAME={width:80,height:96,columns:8,rows:4,fps:16} as const;

export function configureBurningFuel(texture:T.Texture){
  texture.colorSpace=T.SRGBColorSpace;
  texture.magFilter=texture.minFilter=T.NearestFilter;
  texture.generateMipmaps=false;
  return texture;
}

// Sample at texel centres so a wisp never bleeds into a neighbouring frame.
export const burningFuelGLSL=`
  uniform sampler2D burningFuel;
  vec4 sampleBurningFuel(vec2 uv,float seconds,float phase){
    vec2 grid=vec2(${FUEL_FRAME.columns}.,${FUEL_FRAME.rows}.);
    vec2 pixels=vec2(${FUEL_FRAME.width}.,${FUEL_FRAME.height}.);
    float frame=mod(floor(seconds*${FUEL_FRAME.fps}.+phase),grid.x*grid.y);
    vec2 tile=vec2(mod(frame,grid.x),grid.y-1.-floor(frame/grid.x));
    vec2 pixel=clamp(floor(uv*pixels),vec2(0.),pixels-1.)+.5;
    return texture2D(burningFuel,(tile+pixel/pixels)/grid);
  }`;

export interface FuelPocket {position:readonly [number,number,number];size:number;phase:number}

/** Curved, intersecting fronts keep the burning bed visible when viewed edge-on. */
export function createFuelFlames(pockets:readonly FuelPocket[],fuelAtlas:T.Texture){
  const flamePositions:number[]=[],heat:number[]=[],fireCell:number[]=[];
  const fire=(x:number,y:number,z:number,size:number,phase:number)=>{
    for(const [yaw,width,height,side,depth,offset] of [
      [-.12,1.24,1.30,0,-.06,0], [1.10,.90,.79,-.17,.05,9], [-1.04,.84,.65,.19,.13,21],
    ]){
      const corner=(u:number,v:number)=>{
        const across=(u-.5)*width+.07*v*v;
        const bow=.16*(1-(2*u-1)**2)+.06*v*v;
        flamePositions.push(x+size*(side+Math.cos(yaw)*across-Math.sin(yaw)*bow),y+size*height*v,
          z+size*(depth+Math.sin(yaw)*across+Math.cos(yaw)*bow));
        heat.push(1+offset+phase);fireCell.push(u,v);
      };
      for(let j=0;j<3;j++)for(let i=0;i<3;i++){
        const u=i/3,v=j/3,r=(i+1)/3,h=(j+1)/3;
        corner(u,v);corner(r,v);corner(r,h);corner(u,v);corner(r,h);corner(u,h);
      }
    }
  };
  for(const {position,size,phase} of pockets)fire(...position,size,phase);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(flamePositions,3));
  geometry.setAttribute('heat',new T.Float32BufferAttribute(heat,1));
  geometry.setAttribute('fireCell',new T.Float32BufferAttribute(fireCell,2));
  geometry.computeBoundingSphere();
  const clock={value:0},material=new T.MeshBasicMaterial({side:T.DoubleSide,toneMapped:false,transparent:true,depthWrite:false,forceSinglePass:true});
  material.userData.fireClock=clock;
  material.onBeforeCompile=shader=>{
    shader.uniforms.annexClock=clock;
    shader.uniforms.burningFuel={value:configureBurningFuel(fuelAtlas)};
    shader.vertexShader='attribute float heat;attribute vec2 fireCell;varying vec3 vFuel;\n'+
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFuel=vec3(fireCell,heat);');
    shader.fragmentShader=burningFuelGLSL+'\nvarying vec3 vFuel;uniform float annexClock;\n'+
      shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          vec4 fuel=sampleBurningFuel(vFuel.xy,annexClock,vFuel.z-1.);
          if(fuel.a<.01)discard;
          diffuseColor=fuel;`);
  };
  material.customProgramCacheKey=()=>'embassy-burning-fuel-32';
  return {geometry,material,clock};
}
