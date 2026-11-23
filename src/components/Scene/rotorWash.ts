import {useContext, useEffect, useMemo} from 'react';
import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {makePixelLeafGeometry} from './pixelLeafGeometry';
import {RotorGust} from './rotorGust';

function sprayGeometry() {
  // Broken highlights across a thin sheet lifted from the wet road.
  const strokes = [
    new T.BoxGeometry(.64,.05,.12),
    new T.BoxGeometry(.23,.04,.09).translate(-.37,.09,.05),
    new T.BoxGeometry(.12,.045,.07).translate(.29,.16,-.04),
  ];
  const geometry = mergeGeometries(strokes)!;
  for (const stroke of strokes) stroke.dispose();
  return geometry;
}

export function useRotorWash(surface: 'verge' | 'road') {
  const gust = useContext(RotorGust);
  const wash = useMemo(() => {
    const wet = surface === 'road';
    const geometry = wet ? sprayGeometry() : makePixelLeafGeometry();
    const material = wet
      ? new T.MeshBasicMaterial({transparent:true, opacity:.63, depthWrite:false, toneMapped:false})
      : new T.MeshLambertMaterial({vertexColors:true});
    const count = wet ? 48 : 128;
    const mesh = new T.InstancedMesh(geometry,material,count);
    mesh.name = wet ? 'rotor-wash-on-wet-road' : 'kestrel-downwash';
    mesh.visible = false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.boundingSphere = new T.Sphere(new T.Vector3(0,.35,0),5.6);
    const palette = wet ? ['#6e8e91','#90aaa3','#b2c7b7','#566f74'] : ['#827951','#69724e','#978358','#7a704f'];
    const tint = new T.Color();
    const seeds = Array.from({length:count}, (_,i) => {
      mesh.setColorAt(i,tint.set(palette[i % palette.length]));
      return {angle:i*2.39996, phase:(i*.618034)%1, speed:.57+.26*((i*7)%13)/12,
        reach:1.7+.9*((i*11)%17)/16, lift:.18+.46*((i*5)%19)/18};
    });
    const stamp = new T.Object3D();
    let lastCel = -1;
    function update(x:number,z:number,clearance:number,visible:boolean,time:number) {
      const strength = visible ? 1-T.MathUtils.smoothstep(clearance,0,wet?3.2:3.5) : 0;
      const cel = Math.floor(time*18);
      if (gust) gust.value.set(x,z,strength,cel/18);
      mesh.visible = strength>.005;
      if (!mesh.visible) { lastCel=-1; return; }
      mesh.position.set(x,wet?.063:.047,z);
      if (lastCel===cel) return;
      lastCel=cel;
      for (let i=0; i<count; i++) {
        const s=seeds[i], t=cel/18, u=(t*s.speed+s.phase)%1;
        // Leaf Storm's expanding ground swirl and edge-on flip, stretched
        // outward into low gusts. The envelope hides each cycle boundary.
        const angle=s.angle + u*(wet?.42:.82) + .12*Math.sin(t+s.phase*5);
        const radius=.85 + u*s.reach + u*(wet?1.35:1.60);
        const arc=Math.sin(Math.PI*u);
        const size=Math.min(1, u*7, (1-u)*5)*strength;
        stamp.position.set(Math.cos(angle)*radius,arc*s.lift*(wet?.37:.78)*strength,Math.sin(angle)*radius);
        stamp.rotation.set(wet?.14*arc:arc*Math.cos(7*u+s.angle),
          -angle+(wet?.28:2.4*u),wet?.11*arc:arc*Math.sin(9*u+s.angle)*1.85,'YXZ');
        stamp.scale.setScalar(size*(wet?.47+s.lift*.34:.013+s.lift*.012));
        stamp.updateMatrix();mesh.setMatrixAt(i,stamp.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
    return {mesh,update,dispose(){mesh.dispose();geometry.dispose();material.dispose();}};
  },[surface,gust]);
  useEffect(()=>()=>{if(gust)gust.value.z=0;wash.dispose();},[wash,gust]);
  return wash;
}
