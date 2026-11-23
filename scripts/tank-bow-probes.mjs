import assert from 'node:assert/strict';
import * as T from 'three';

// Start at actual painted atlas pixels, project into triangles using UV
// barycentric coordinates, then check that the assembled vehicle does not
// hide them from either a lateral or a forward three-quarter viewpoint.
export function checkSharkMarkers(jaw,root){
  const g=jaw.geometry,uv=g.attributes.uv,p=g.attributes.position,tex=jaw.material.map.image;
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),bc=new T.Vector3();
  const ray=new T.Raycaster();root.updateWorldMatrix(true,true);
  for(const [label,sx,sy,rgb] of [
    ['eye',92,54,0xec4938],['sclera',82,56,0xfff0cb],['brow',99,54,0x1c2425],
    ['gum',77,44,0xbb3935],['canine',75,36,0xfff0cb],['throat',89,27,0x842a32],
  ]){
    let target,dist=Infinity;
    for(let y=0;y<64;y++)for(let x=0;x<128;x++){
      const i=(y*tex.width+x)*4,r=(tex.data[i]<<16)|(tex.data[i+1]<<8)|tex.data[i+2];
      const d=(sx-x)**2+(sy-y)**2;
      if(r===rgb&&d<dist){dist=d;target=new T.Vector3((x+.5)/tex.width,(y+.5)/tex.height,0);}
    }
    assert.ok(target&&dist<121,'Expected real '+label+' pigment near its registered region');
    for(const side of [-1,1]){
      let spot;
      for(let i=0;i<p.count;i+=3){
        if(side*p.getX(i)<=0)continue;
        [a,b,c].forEach((v,j)=>v.set(uv.getX(i+j),uv.getY(i+j),0));
        T.Triangle.getBarycoord(target,a,b,c,bc);
        if(Math.min(bc.x,bc.y,bc.z)<-1e-6)continue;
        [a,b,c].forEach((v,j)=>v.fromBufferAttribute(p,i+j));
        spot=a.clone().multiplyScalar(bc.x).addScaledVector(b,bc.y).addScaledVector(c,bc.z);break;
      }
      assert.ok(spot,'No registered 3D surface for '+label+' on side '+side);
      const world=spot.applyMatrix4(jaw.matrixWorld);
      for(const [x,y,z] of [[3.1,.94,-.7],[2.25,1.10,-2.5]]){
        const origin=new T.Vector3(side*x,y,z).applyMatrix4(jaw.matrixWorld);
        ray.set(origin,world.clone().sub(origin).normalize());
        const hit=ray.intersectObject(root,true).find(h=>{
          for(let n=h.object;n;n=n.parent)if(!n.visible)return false;
          return true;
        });
        assert.ok(hit?.object===jaw&&hit.point.distanceTo(world)<.004,
          `${label} on side ${side}, angle ${x}/${z} occluded or detached`);
      }
    }
  }
}

export function checkCompoundBow(jaw){
  const ray=new T.Raycaster();
  function profile(x,y){
    ray.set(new T.Vector3(x,y,-2),new T.Vector3(0,0,1));
    const h=ray.intersectObject(jaw)[0];
    assert.ok(h,`Missing continuous casting at ${x},${y}`);return h;
  }
  const center=profile(0,.354);
  for(const side of [-1,1]){
    const mid=profile(.36*side,.354),turn=profile(.68*side,.354);
    assert.ok(mid.point.z-center.point.z>.024&&turn.point.z-mid.point.z>.080,'Bow silhouette must visibly recede around both corners');
    assert.ok(Math.abs(turn.normal.x)>.38&&Math.abs(center.normal.x)<.03,'Surface normal must turn in plan, not just the texture');
  }
  const low=profile(0,.212),high=profile(0,.49);
  assert.ok(low.point.z-center.point.z>.036&&high.point.z-center.point.z>.027,'Both crown and lower chin must roll back from proud middle');
  assert.ok(low.normal.y<-.35&&high.normal.y>.26,'Top and undertuck must receive light from opposite elevations');
  const ink=jaw.material.map.image, read=(x,y)=>{
    const i=4*(y*ink.width+x);return (ink.data[i]<<16)|(ink.data[i+1]<<8)|ink.data[i+2];
  };
  const reds=new Set([0xbb3935,0x842a32]), hi=x=>{
    for(let y=63;y>=0;y--)if(reds.has(read(x,y)))return y;return -1;
  };
  assert.ok(hi(67)>hi(17)+13&&hi(67)>hi(123)+10,'Gumline must rise and fall across a cheek');
  assert.ok(hi(192)<hi(129)-16,'The mouth must turn under the centre, not create a second horizontal band');
  let middleTeeth=0;
  for(let x=165;x<218;x++)for(let y=0;y<64;y++)if([0xfff0cb,0xcbbb8b].includes(read(x,y)))middleTeeth++;
  assert.equal(middleTeeth,0,'No transverse comb of teeth across the front bumper');
}
