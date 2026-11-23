import * as THREE from 'three';
import {createRiverCrossings, sampleRiverStation, type RiverStation} from './riverLayout';
import {villageSurfaceUV, type HutSurface} from '../../lib/hutMaterials';

/** A static fishing shelter on the upstream, far-bank side of the crossing.
 * Not a file/objective. Its stilts and broken porch actually overhang the water.
 * One atlas-textured mesh; hit testing uses this same site in fieldBuildings. */
export function riverLandingSite(stations: RiverStation[]) {
  const bridge=createRiverCrossings(stations).find(s=>s.kind==='bridge')!;
  const z=bridge.z+bridge.length*.5+.3, bank=sampleRiverStation(stations,z)!;
  const ahead=sampleRiverStation(stations,z+1)!, behind=sampleRiverStation(stations,z-1)!;
  const yaw=-Math.atan2(2, ahead.centerX+(ahead.cut??0)*.5-behind.centerX-(behind.cut??0)*.5);
  // Local X follows the shore; negative local Z projects away from it.
  const cx=Math.max(bridge.width*.5+4.5,bank.centerX-bank.waterHalfWidth+(bank.cut??0)+.84);
  return {cx,z,yaw};
}
export function createRiverLanding(stations:RiverStation[],ruined=false) {
  const {cx,z,yaw}=riverLandingSite(stations);
  const pos:number[]=[], rgb:number[]=[], uv:number[]=[];
  type P = [number, number, number];
  const col=new THREE.Color();
  let skin:HutSurface='timber', projection:'body'|'roof'|'hip'|'awning'='body';
  const tri=(a:P,b:P,c:P,color:string) => {
    col.set(color);
    const n=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
    for(const [x,y,zz] of [a,b,c]){
      pos.push(cx+x*Math.cos(yaw)+zz*Math.sin(yaw),y,z-x*Math.sin(yaw)+zz*Math.cos(yaw));
      rgb.push(col.r,col.g,col.b);
      const up=Math.abs(n.y)>Math.max(Math.abs(n.x),Math.abs(n.z));
      const u=projection==='roof'?x/5.55+.5:projection==='hip'||projection==='awning'?zz/4.10+.5:
        up||Math.abs(n.z)>Math.abs(n.x)?x/5.6+.5:zz/4.4+.5;
      const v=projection==='roof'?1-Math.abs(zz)/2.05:projection==='hip'?(y-2.65)/1.65:
        projection==='awning'?(x+2.79)/1.02:up?zz/4.5+.5:(y+1.04)/5.35;
      uv.push(...villageSurfaceUV(skin,u,v));
    }
  };
  const quad=(a:P,b:P,c:P,d:P,color:string)=>{tri(a,b,c,color);tri(a,c,d,color);};
  const beam=(a:P,b:P,w:number,d:number,color:string)=>{
    const va=new THREE.Vector3(...a), vb=new THREE.Vector3(...b),axis=vb.clone().sub(va).normalize();
    const side=axis.clone().cross(Math.abs(axis.y)>.96?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0)).normalize().multiplyScalar(w*.5);
    const normal=side.clone().cross(axis).normalize().multiplyScalar(d*.5);
    const corners=(v:THREE.Vector3)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>v.clone().addScaledVector(side,i).addScaledVector(normal,j).toArray() as P);
    const u=corners(va),v=corners(vb);quad(u[0],u[1],u[2],u[3],color);quad(v[3],v[2],v[1],v[0],color);
    for(let j=0;j<4;j++)quad(u[j],v[j],v[(j+1)%4],u[(j+1)%4],color);
  };
  // Pigment, not a second copy of the final lighting: the shared scanned-in
  // boards supply the knots, grain and grey warmth on top of these values.
  const wood=['#a99a89','#b4a691','#b9ac97','#a69d8b'];
  if(ruined){
    // Short piles and split decking stay grounded in the bank; the tall roof is gone.
    for(const x of [-2.15,0,2.15]) for(const zz of [-1.47,1.43])
      beam([x,-.96,zz],[x+.06,.33+.12*Math.cos(2*x+zz),zz+.08],.14,.15,'#584332');
    for(let i=0;i<13;i++){
      const x=-2.11+i*.31,zz=-1.6+Math.sin(i*2.7)*.31;
      beam([x,.06+(i%3)*.042,zz],[x+.49*Math.sin(i*1.8),.22+.2*Math.cos(i),zz+1.15+(i%4)*.41],
        .21,.08,wood[i%4]);
    }
    beam([-1.7,.21,.83],[1.53,.36,-.83],.18,.12,'#57422b');
  } else {
  for(const x of [-2.15,0,2.15])for(const zz of [-1.47,1.43]){
    beam([x+.055*Math.sin(x+zz),-1.02,zz-.042],[x,2.97,zz],.15,.16,'#594b3c');
    beam([x-.04,.76,zz],[x+.49,1.17,zz],.09,.10,'#9f7847');
  }
  for(let i=0;i<21;i++){
    const x=-2.28+i*.221,front=i<4?-1.77:(i===4?-1.99:-2.15+(i%4)*.047);
    const top=1.17+.009*Math.sin(i*3.1), w=.106, end=1.61+.022*Math.cos(i);
    quad([x-w,top,front],[x-w,top,end],[x+w,top,end],[x+w,top,front],wood[(i*7)%4]);
    for(const edge of [front,end])quad([x-w,top,edge],[x+w,top,edge],[x+w,top-.10,edge],[x-w,top-.10,edge],'#635743');
  }
  for(const zz of [-1.56,1.55])beam([-2.32,1.02,zz],[2.32,1.02,zz],.16,.19,'#51402c');
  beam([-2.14,.19,-1.47],[-.04,.99,-1.47],.09,.11,'#886d46');
  beam([ .04,.99,-1.47],[2.14,.18,-1.47],.09,.11,'#785d3c');
  // One wall is missing; this produces a dark, open silhouette under the eaves.
  for(let j=0;j<8;j++){
    const y=1.19+j*.20;
    quad([-.35,y,1.40],[2.12,y+.023,1.40],[2.12,y+.192,1.40],[-.35,y+.177,1.40],wood[(j+1)%4]);
  }
  // Cut bamboo shutters and a warm slit of interior shade behind the deck.
  // The open, broken end remains visible; this isn't a solid hut-sized box.
  for(let j=0;j<8;j++){
    const y=1.26+j*.181,right=j<3?1.95:.89;
    quad([.27,y,-1.38],[right,y,-1.38],[right,y+.154,-1.38],[.27,y+.154,-1.38],wood[(j+2)%4]);
    if(j>2)quad([1.66,y,-1.38],[2.07,y,-1.38],[2.07,y+.154,-1.38],[1.66,y+.154,-1.38],wood[j%4]);
  }
  quad([1.00,1.86,-1.33],[1.57,1.86,-1.33],[1.57,2.51,-1.33],[1.00,2.51,-1.33],'#493e37');
  quad([1.48,1.88,-1.34],[1.57,1.88,-1.34],[1.57,2.48,-1.34],[1.48,2.48,-1.34],'#b18353');
  for(const x of [-1.86,-1.28])beam([x,-.73,-2.63],[x,1.19,-2.1],.065,.066,'#6b513a');
  for(let i=0;i<6;i++)beam([-1.91,-.48+i*.27,-2.56+i*.073],[-1.23,-.48+i*.27,-2.56+i*.073],.06,.079,'#ad895a');
  for(const x of [-2.16,-1.16,.65,2.15])beam([x,1.1,-2],[x,1.8,-2],.075,.07,'#795938');
  beam([.67,1.75,-2],[2.18,1.75,-2],.065,.08,'#bd9a63');
  beam([-2.16,1.75,-2],[-1.20,1.62,-2],.065,.08,'#ad8956');
  // Nipa sheets drape over two purlins. At a bridge approach it is the
  // gable, not these long faces, that presents to the camera. Keep a real
  // shadowed opening there, below a short clipped hip and an offset awning.
  const light=['#d3c9ba','#d6cbbd','#c9beae','#d0c5b4','#c9c1b3'];
  const dark=['#aa9e8c','#afa494','#b1a699','#b6aa9a','#aca295'];
  skin='thatch';projection='roof';
  for(const side of [-1,1])for(let row=0;row<3;row++)for(let i=0;i<16;i++){
    const at=(t:number,j:number):P=>{
      const u=j/8-1, sag=(1-u*u)*.12, tassel=.085*Math.sin(j*2.23+row*.8+side)**2;
      return [u*(2.10+.56*Math.min(1,t*2.55))+.036*Math.sin(t*5+j)*t,
        4.19-1.40*t-sag-.10*Math.sin(t*Math.PI)-t*t*t*tassel+.035*(2-row),
        side*(.035+t*(1.90+.05*Math.cos(j*2.2)))];
    };
    const a=row/3,b=(row+1)/3+.023,shade=(side<0?light:dark)[((i>>2)+row*2)%5];
    quad(at(a,i),at(a,i+1),at(b,i+1),at(b,i),shade);
    if(row===2){
      const l=at(b,i),r=at(b,i+1);
      tri(l,r,[(l[0]+r[0])*.5+.04,Math.min(l[1],r[1])-.09-.07*Math.cos(i)**2,(l[2]+r[2])*.5+.042*side],shade);
    }
  }
  for(const end of [-1,1]){
    projection='hip';skin='bamboo';
    // Gable screen set back from the verge: grey brown split reeds,
    // a ventilating slot at the crown and a deep shadow under both slopes.
    for(let i=0;i<13;i++){
      const za=-1.56+i*.24, zb=za+.224, top=(zz:number)=>3.91-.71*Math.abs(zz);
      quad([end*2.10,2.68,za],[end*2.10,2.68,zb],[end*2.10,top(zb),zb],[end*2.10,top(za),za],dark[(3*i)%5]);
    }
    for(const y of [2.86,3.18,3.48]){
      const w=(3.91-y)/.71;
      quad([end*2.13,y,-w],[end*2.13,y,w],[end*2.13,y+.049,w-.07],[end*2.13,y+.049,-w+.07],'#69594a');
    }
    // End-on thatch is individually hung. The hip covers only the top
    // third; below it the overhanging rake shows actual split leaf tips.
    skin='thatch';
    for(let i=0;i<10;i++){
      const u=i/5-1,v=(i+1)/5-1;
      const tip=(t:number):P=>[end*(2.67+.025*Math.sin(i*5)),3.64-.08*Math.abs(t)-.072*Math.sin(i*2.8)**2,.84*t];
      tri([end*2.10,4.26,0],tip(u),tip(v),light[(i>>1)%5]);
    }
    for(const side of [-1,1])for(let j=0;j<9;j++){
      const at=(k:number):P=>[end*2.66,3.64-k*.100,side*(.78+k*.129)];
      const l=at(j),r=at(j+1);
      tri(l,r,[end*(2.68+.035*Math.cos(j)),r[1]-.13-.062*Math.sin(j)**2,r[2]-.045*side],dark[(j+2)%5]);
    }
  }
  skin='timber';projection='body';
  beam([-2.16,4.21,0],[2.16,4.21,0],.12,.11,'#75685b');
  // Porch fly on the approach end (negative shoreline X). Its sloping fascia
  // and faded indigo net leave the opposite bay open all the way to the bank.
  skin='thatch';projection='awning';
  for(let i=0;i<9;i++){
    const a=-1.84+i*.235,b=a+.242,drop=.09*Math.sin(i*2.4)**2;
    quad([-1.84,2.99,a],[-1.84,2.99,b],[-2.70,2.44-drop,b+.02],[-2.70,2.42-drop,a],light[(2*i+1)%5]);
    tri([-2.70,2.42-drop,a],[-2.70,2.44-drop,b],[-2.73,2.30-drop,a+.09],dark[i%5]);
  }
  skin='timber';projection='body';
  for(const zz of [-1.53,.13]){
    beam([-2.45,1.16,zz],[-2.54,2.56,zz+.03],.072,.075,'#786653');
    quad([-2.59,2.33,zz-.065],[-2.59,2.40,zz-.06],[-2.59,2.42,zz+.06],[-2.59,2.35,zz+.06],'#bcad89');
    beam([-2.10,.81,zz],[-2.53,1.11,zz],.073,.074,'#6a594b');
  }
  for(let i=0;i<8;i++){
    const a=-1.66+i*.242,b=a+.227,tip=2.56+.041*Math.cos(i*2.6);
    quad([-2.19,1.16,a],[-2.19,1.16,b],[-tip,1.15,b],[-tip,1.15,a],wood[(i*3)%4]);
    quad([-tip,1.15,a],[-tip,1.15,b],[-tip,1.08,b],[-tip,1.08,a],'#75614f');
  }
  // A short screen hung behind the landing leaves a dark service doorway;
  // alternating split culms form a panel, not horizontal plank wallpaper.
  for(let i=0;i<8;i++){
    const a=.47+i*.12,b=a+.114,h=2.61+.045*Math.cos(i*2);
    quad([-1.88,1.20,a],[-1.88,1.20,b],[-1.88,h,b],[-1.88,h,a],wood[(i*7)%4]);
  }
  for(const y of [1.44,2.25])quad([-1.9,y,.47],[-1.9,y,1.43],[-1.9,y+.047,1.43],[-1.9,y+.047,.47],'#655342');
  // At normal driver distance this near porch is the landmark. Lash a
  // broad, faded work cloth to the rail rather than decorating every hut.
  // Loose folds break the rectangle; the open left bay still reads behind it.
  beam([-2.50,1.75,-1.50],[-2.50,1.68,-.39],.062,.066,'#bca585');
  skin='earth';
  const cloth=(u:number,v:number):P=>[-2.54-.074*Math.sin(u*10)-.051*v,1.75-.067*u-v*(.42+.09*Math.sin(u*5)+.05*u),-1.44+.78*u];
  for(let i=0;i<5;i++) {
    const u=i/5,w=(i+1)/5;
    quad(cloth(u,0),cloth(w,0),cloth(w,1),cloth(u,1),['#a25c54','#b66f63','#85504e','#b37468','#965c56'][i]);
  }
  skin='timber';
  // A bent fish net has holes, not a solid green curtain. Painted ribbons
  // share the single static mesh; the boatside light shows through it.
  const net=(u:number,v:number):P=>[-2.50+.15*v,2.33-.22*Math.sin(u*Math.PI)-v*(.52+.20*u),-1.5+1.61*u-.16*v];
  for(let i=0;i<=10;i++){const u=i/10;quad(net(u,0),net(u+.016,0),net(u+.018,1),net(u,1),'#65736c');}
  for(let j=0;j<=4;j++)for(let k=0;k<3;k++){const v=j/4;quad(net(k/3,v),net((k+1)/3,v),net((k+1)/3,v+.041),net(k/3,v+.041),'#818c7e');}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}
