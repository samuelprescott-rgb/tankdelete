import * as THREE from 'three';
import { createJungleCanopyTexture } from './jungleGeometry';

export const BRANCH_SPRAY_URL = '/images/textures/jungle-branch-spray-v1.png';

/** The exterior and playable trees borrow the same loader-cached photograph.
 * Demand a real, filtered alpha silhouette at all distances. */
export function configureBranchSpray(map: THREE.Texture) {
  if (map.colorSpace !== THREE.SRGBColorSpace || map.anisotropy !== 4
    || map.magFilter !== THREE.LinearFilter || map.minFilter !== THREE.LinearMipmapLinearFilter || !map.generateMipmaps) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 4;
    map.needsUpdate = true;
  }
  return map;
}

let fallbackSource: THREE.DataTexture['source'] | undefined;
/** While loading or offline, use branching leaves, never unmasked cards.
 * The deterministic fallback pixels/GPU source survive independent owners. */
export function createSignalCrownTexture() {
  const map = fallbackSource ? new THREE.DataTexture() : createJungleCanopyTexture(64);
  if (fallbackSource) map.source = fallbackSource;
  else fallbackSource = map.source;
  map.name = 'jungle-branch-spray-fallback';
  configureBranchSpray(map);
  map.needsUpdate = true;
  return map;
}
