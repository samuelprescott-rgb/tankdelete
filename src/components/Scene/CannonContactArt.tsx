import { useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

const clips = {
  soil:  { row: 0, duration: .72, width: 3.8, pivot: .156 },
  water: { row: 1, duration: .84, width: 3.2, pivot: .224 },
  metal: { row: 2, duration: .36, width: 2.1, pivot: .416 },
} as const;
export type CannonContact = keyof typeof clips;
interface ContactPulse {
  origin: THREE.Vector3;
  age: number;
  art: CannonContact | null;
  small: boolean;
}

const vertexShader = `
attribute vec4 contact;
attribute vec4 style;
varying vec2 atlasUv;
varying float opacity;
void main() {
  vec4 eye = modelViewMatrix * vec4(contact.xyz, 1.);
  // Fold the lower half onto the field. The ripple can spread toward the
  // camera while the upper half carries the upright plume.
  float tileY = uv.y < .5 ? uv.y * 2. * style.z : mix(style.z, 1., uv.y * 2. - 1.);
  float height = (tileY - style.z) * .866 * style.y;
  if (height < 0. && style.x < 1.5) {
    vec2 toward = cameraPosition.xz - contact.xz;
    vec2 ground = toward / max(length(toward), .001) * -height;
    eye.xyz += mat3(viewMatrix) * vec3(ground.x, 0., ground.y);
  } else {
    eye.y += height;
  }
  eye.x += position.x * style.y;
  gl_Position = projectionMatrix * eye;
  vec2 tileUv = clamp(vec2(uv.x, tileY), vec2(.5 / 128.), vec2(1. - .5 / 128.));
  atlasUv = (vec2(contact.w, 2. - style.x) + tileUv) / vec2(12., 3.);
  opacity = style.w;
}`;
const fragmentShader = `
uniform sampler2D atlas;
varying vec2 atlasUv;
varying float opacity;
void main() {
  vec4 color = texture2D(atlas, atlasUv);
  color.a *= opacity;
  color.a *= smoothstep(.01, .18, color.a);
  if (color.a < .005) discard;
  gl_FragColor = color;
  #include <colorspace_fragment>
}`;

export function CannonContactArt({ pulses }: { pulses: ContactPulse[] }) {
  const atlas = useLoader(THREE.TextureLoader, '/images/textures/cannon-contacts-pixelfx.png');
  const uniforms = useMemo(() => {
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.minFilter = atlas.magFilter = THREE.NearestFilter;
    atlas.generateMipmaps = false;
    atlas.needsUpdate = true;
    return { atlas: { value: atlas } };
  }, [atlas]);
  const geometry = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1, 1, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(quad.index);
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    for (const name of ['contact', 'style']) {
      geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(pulses.length * 4), 4)
        .setUsage(THREE.DynamicDrawUsage));
    }
    geo.instanceCount = 0;
    return geo;
  }, [pulses]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const contact = geometry.getAttribute('contact'), style = geometry.getAttribute('style');
    let count = 0;
    for (const pulse of pulses) {
      if (!pulse.art) continue;
      const clip = clips[pulse.art], time = pulse.age / (clip.duration * (pulse.small ? .58 : 1));
      if (time >= 1) continue;
      const { x, y, z } = pulse.origin;
      contact.setXYZW(count, x, y + .025, z, Math.floor(time * 12));
      style.setXYZW(count, clip.row, clip.width * (pulse.small ? .48 : 1), clip.pivot, Math.min(1, (1 - time) * 6));
      count++;
    }
    geometry.instanceCount = count;
    if (count) contact.needsUpdate = style.needsUpdate = true;
  });

  return <mesh name="cannon-contact-art" frustumCulled={false} renderOrder={78}>
    <primitive object={geometry} attach="geometry" />
    <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader}
      transparent depthWrite={false} toneMapped={false} />
  </mesh>;
}
