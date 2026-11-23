import * as T from 'three';

// World coordinates of the glass below the swan neck, on the service
// lane behind Records. The wet pavement and masonry sample this same point.
export const STREET_BULB = new T.Vector3(-6.95,6.54,-23.16);
const mastX=-9.27;

export function buildStreetlampMetal(deposit:(g:T.BufferGeometry,color:string)=>void){
  const {x,y,z}=STREET_BULB;
  deposit(new T.CylinderGeometry(.24,.34,.25,8).translate(mastX,.14,z),'#525c5a');
  deposit(new T.CylinderGeometry(.099,.15,5.66,10).translate(mastX,3.04,z),'#626e70');
  deposit(new T.CylinderGeometry(.14,.19,.99,10).translate(mastX,.72,z),'#3b484c');
  const curve=new T.CubicBezierCurve3(new T.Vector3(mastX,5.81,z),
    new T.Vector3(mastX,7.79,z),new T.Vector3(x,7.79,z),new T.Vector3(x,y+.21,z));
  deposit(new T.TubeGeometry(curve,16,.089,8,false),'#67777b');
  deposit(new T.CylinderGeometry(.13,.46,.22,12).translate(x,y+.14,z),'#485860');
  deposit(new T.CylinderGeometry(.46,.48,.06,12).translate(x,y+.014,z),'#92a4a2');
}

export function createStreetlamp(){
  const bulb=new T.SphereGeometry(1,12,6).scale(.41,.105,.41).translate(...STREET_BULB.toArray());
  const glass=new T.MeshBasicMaterial({toneMapped:false,fog:true});
  const size=64,data=new Uint8Array(size*size*4);
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const r=Math.hypot((i+.5)/size*2-1,(j+.5)/size*2-1);
    const a=Math.max(0,1-r);
    data.set([255,255,255,Math.round(255*a*a*a)],4*(j*size+i));
  }
  const map=new T.DataTexture(data,size,size);
  map.magFilter=T.LinearFilter;map.minFilter=T.LinearFilter;map.needsUpdate=true;
  const haze=new T.SpriteMaterial({map,color:'#74cedb',transparent:true,depthWrite:false,
    blending:T.AdditiveBlending,toneMapped:false});
  const halo=new T.Sprite(haze);halo.position.copy(STREET_BULB);halo.scale.set(3.7,2.65,1);
  const power={value:1},ink=new T.Color('#c9f7ff');
  const advance=(seconds:number)=>{
    // A single worn contact opens briefly, then warms up again.
    const t=seconds%3.85;
    const dip=T.MathUtils.smoothstep(t,1.82,1.96)*(1-T.MathUtils.smoothstep(t,2.31,2.60));
    power.value=1-.96*dip;
    glass.color.copy(ink).multiplyScalar(1.32*power.value);
    haze.opacity=.53*power.value;
  };
  advance(0);
  return {bulb,glass,halo,power,advance,dispose(){
    bulb.dispose();glass.dispose();haze.dispose();map.dispose();
  }};
}
