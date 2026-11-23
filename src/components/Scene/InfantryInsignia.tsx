import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {findNearestObstacleHit,type CombatObstacle} from '../../lib/combat';
import {firstReliefContact} from '../../lib/terrain';

// Two pixel stamps, not labels: a split ochre chevron for the opposing team,
// one shorter pale blue dash for allies. Dark keylines survive pale sky.
function stamp(hostile:boolean){
  const pattern=hostile?[
    '1110000000111','1221000001221','0122100012210','0012210122100',
    '0001221221000','0000122210000','0000012100000','0000001000000',
  ]:['0000000000000','0011111111100','0012222222100','0011111111100'];
  const w=pattern[0].length,h=pattern.length,px=new Uint8Array(w*h*4);
  const colors=hostile?[0,0x442e2b,0xffb583]:[0,0x253e42,0xabdedc];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=Number(pattern[h-1-y][x]),k=4*(y*w+x),c=colors[i];
    px.set([c>>16,c>>8&255,c&255,i?255:0],k);
  }
  const map=new THREE.DataTexture(px,w,h);
  map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;map.magFilter=map.minFilter=THREE.NearestFilter;
  return new THREE.SpriteMaterial({map,alphaTest:.5,transparent:false,depthWrite:true,depthTest:true,fog:true,toneMapped:false});
}
const insignia={ally:stamp(false),hostile:stamp(true)};
export function InfantryInsignia({hostile=false,kneeling,pelvis,obstacles}:{hostile?:boolean;kneeling:boolean;pelvis:THREE.Bone;obstacles:readonly CombatObstacle[]}){
  const ref=useRef<THREE.Sprite>(null);
  const scratch=useMemo(()=>({head:new THREE.Vector3(),eye:new THREE.Vector3(),oldEye:new THREE.Vector3(Infinity,0,0),
    next:0,clear:false,obstacles:null as readonly CombatObstacle[]|null}),[]);
  const head=kneeling?1.28:1.72, cut=hostile?54:31;
  useFrame(({camera,clock})=>{
    const s=ref.current;if(!camera||!s?.parent?.visible){if(s)s.visible=false;return;}
    s.position.y=head+.20+pelvis.position.y;
    s.parent.localToWorld(scratch.head.set(0,s.position.y-.32,0));camera.getWorldPosition(scratch.eye);
    const distance=scratch.eye.distanceTo(scratch.head);
    if(distance<=2 || distance>=cut){s.visible=false;return;}
    if(clock.elapsedTime>=scratch.next || scratch.obstacles!==obstacles || scratch.oldEye.distanceToSquared(scratch.eye)>1){
      scratch.clear=findNearestObstacleHit(scratch.eye,scratch.head,obstacles)===null
        && firstReliefContact(scratch.eye,scratch.head,Infinity)===Infinity;
      scratch.next=clock.elapsedTime+.10;scratch.obstacles=obstacles;scratch.oldEye.copy(scratch.eye);
    }
    s.visible=scratch.clear;
    if(s.visible){
      // Stay helmet-sized up close; a capped optical floor holds the chevron
      // to a handful of pixels at normal chase distance, then completely off.
      const w=(hostile?.40:.28)+Math.min(.53,distance*.011);
      s.scale.set(w,w*(hostile?8:4)/13,1);
    }
  });
  return <sprite ref={ref} name={hostile?'field-hostile-chevron':'field-ally-dash'} position={[0,head+.20,0]}
    material={hostile?insignia.hostile:insignia.ally} renderOrder={3} dispose={null}/>;
}
