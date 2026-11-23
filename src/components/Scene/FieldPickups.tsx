import {useMemo,useRef,useEffect} from 'react';
import {useFrame, useLoader} from '@react-three/fiber';
import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {FIELD_PICKUPS,PICKUP_RADIUS,type PickupMode,type PickupKind,type FieldPickup} from '../../lib/fieldPickups';

// One vertex-painted mesh per crate, one animated luminous badge. The kit has
// depth from both sides; the emblem uses the same chunky pixels as the reliefs.
function crateArt(kind:PickupKind){
  const parts:T.BufferGeometry[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>{
    const g=new T.BoxGeometry(w,h,d);g.translate(x,y,z);
    const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<a.length;i+=3)c.toArray(a,i);
    g.setAttribute('color',new T.BufferAttribute(a,3));parts.push(g);
  };
  const accent=kind==='patch'?'#7ac3a2':'#e8b56f';
  box(0,.28,0,.95,.46,.61,'#3b473e');box(0,.53,0,1,.10,.65,'#737764');
  for(const x of [-.34,.34]){box(x,.30,0,.075,.48,.65,'#312f33');box(x,.59,0,.08,.03,.63,accent);}
  for(const z of [-.32,.32]){box(0,.31,z,.22,.17,.032,accent);box(0,.31,z*1.05,.08,.08,.028,'#d6dbc2');}
  const mesh=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());parts.length=0;
  const glyph=kind==='patch'?['..##..','..##..','######','######','..##..','..##..']:['.####.','######','#.##.#','#.##.#','.####.','..##..'];
  glyph.forEach((line,j)=>[...line].forEach((c,i)=>{if(c==='#')box((i-2.5)*.105,(5-j)*.105,0,.107,.107,.11,accent);}));
  const icon=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());return {mesh,icon};
}

const BURST_SECONDS = 1.08;
const BURST_FRAMES = 16;

function badgeFinish() {
  const material = new T.MeshBasicMaterial({vertexColors: true, toneMapped: false});
  const sweep = {value: -1};
  // Adapt PixelFX's key-glint to the faces of the existing cross and shield.
  material.onBeforeCompile = shader => {
    shader.uniforms.sweep = sweep;
    shader.vertexShader = 'varying float badgeBand;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n badgeBand = position.x + position.y * .45;');
    shader.fragmentShader = 'uniform float sweep; varying float badgeBand;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.99, .97, .79),
        .85 * (1. - smoothstep(.015, .075, abs(badgeBand - sweep))));`);
  };
  return {material, sweep};
}

interface SupplyProps {
  kills: number;
  running: boolean;
  tankRef: React.RefObject<T.Group | null>;
  onCollect: (kind: PickupKind) => boolean;
}

function SupplyKit({spec, index, kills, running, tankRef, onCollect}: SupplyProps & {spec: FieldPickup; index: number}) {
  const {kind, x, z, atKills} = spec;
  const atlas = useLoader(T.TextureLoader, '/images/textures/field-supply-pixelfx.png');
  const art = useMemo(() => crateArt(kind), [kind]);
  const finish = useMemo(badgeFinish, []);
  const frames = useMemo(() => {
    // Each kit advances independently and shares the cached image.
    const texture = atlas.clone();
    texture.colorSpace = T.SRGBColorSpace;
    texture.minFilter = texture.magFilter = T.NearestFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(1 / BURST_FRAMES, .5);
    texture.offset.set(0, kind === 'patch' ? .5 : 0);
    texture.needsUpdate = true;
    return texture;
  }, [atlas, kind]);
  useEffect(() => () => {art.mesh.dispose(); art.icon.dispose();}, [art]);
  useEffect(() => () => finish.material.dispose(), [finish]);
  useEffect(() => () => frames.dispose(), [frames]);

  const group = useRef<T.Group>(null), crate = useRef<T.Group>(null);
  const badge = useRef<T.Mesh>(null), burst = useRef<T.Sprite>(null);
  const clock = useRef(0), claimedAt = useRef<number | null>(null);
  useFrame((_, dt) => {
    if (!group.current || !crate.current || !badge.current || !burst.current) return;
    if (running) clock.current += Math.min(dt, .1);
    const now = clock.current;
    if (claimedAt.current === null) {
      group.current.visible = kills >= atKills;
      if (!group.current.visible) return;
      badge.current.position.y = .95 + Math.sin(now * 2.5 + index) * .08;
      badge.current.rotation.y = Math.sin(now * 1.5 + index) * .6;
      const pass = ((now + index * .9) % 2.8) / .64;
      finish.sweep.value = pass < 1 ? -.42 + pass * 1.15 : -1;
      const tank = tankRef.current;
      if (!running || !tank || (tank.position.x - x)**2 + (tank.position.z - z)**2 > PICKUP_RADIUS**2) return;
      if (!onCollect(kind)) return;
      claimedAt.current = now;
      crate.current.visible = false;
    }

    const t = (now - claimedAt.current) / BURST_SECONDS;
    group.current.visible = t < 1;
    if (!group.current.visible) return;
    burst.current.visible = true;
    burst.current.position.y = 1.28 + .48 * t;
    frames.offset.x = Math.floor(t * BURST_FRAMES) / BURST_FRAMES;
  });

  return <group ref={group} name={'pickup-' + kind} visible={atKills === 0} position={[x,.06,z]} rotation-y={index ? -.35 : .22}>
    <group ref={crate} name={'supply-crate-' + kind}>
      <mesh geometry={art.mesh} receiveShadow><meshStandardMaterial vertexColors roughness={.91}/></mesh>
      <mesh ref={badge} geometry={art.icon} material={finish.material} position-y={1}/>
    </group>
    <sprite ref={burst} name={'supply-collect-' + kind} visible={false} center={[.5, 44/108]} scale={[2.45,2.36,1]}>
      <spriteMaterial map={frames} transparent depthWrite={false} toneMapped={false}/>
    </sprite>
  </group>;
}

export function FieldPickups({mode, ...props}: SupplyProps & {mode: PickupMode}) {
  return <group name="recoverable-field-supplies">
    {FIELD_PICKUPS[mode].map((spec, index) =>
      <SupplyKit key={mode + spec.kind} spec={spec} index={index} {...props}/>)}
  </group>;
}
