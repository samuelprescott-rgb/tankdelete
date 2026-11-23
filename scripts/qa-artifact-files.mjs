import {access} from 'node:fs/promises';
import path from 'node:path';

// The bundler does not hash public art in its entry chunks. Match disk to
// HTTP for the actual armor, painted markings, and mounted crew portrait too.
export async function qaArtifactFiles(dist, manifest) {
  const files = new Set(['index.html', ...Object.values(manifest).flatMap(m => [m.file, ...(m.css ?? [])])]);
  for (const file of [
    'images/nightmare-boss-kamala-texture.png','images/nightmare-boss-biden-texture.png',
    'images/textures/ghost-horizon-river.png','images/textures/ghost-dawn-uplands-v2.png','images/textures/ghost-joined-valley-v3.png','images/textures/ghost-river-cloudbreak-v5.png','images/textures/ghost-river-olive-karst-v9.png','images/textures/vietnam-monsoon-panorama-v1.png',
    'images/textures/jungle-branch-spray-v1.png','images/textures/ghost-field-gear-v1.png','images/textures/field-portrait-wash-v1.png',
    'images/textures/ghost-hut-materials-v1.png',
    'images/textures/ghost-hut-materials-v2.png','images/textures/compound-plaster-v2.png','images/textures/compound-aggregate-v2.png',
    'images/textures/tank-shark-bow-v1.svg', 'images/textures/tank-unit-23.svg',
    'images/textures/tank-armor-v1.png', 'images/textures/tank-field-wear-v1.svg','images/textures/ghost-cast-enamel-v1.png',
    'models/us-infantry-head/us-male-head.gltf',
    'models/us-infantry-head/us-male-head.bin', 'models/us-infantry-head/Aksel_Skin_diffuse.png',
    'fonts/LiberationSans-Regular.ttf',
  ]) {
    try { await access(path.join(dist, file)); files.add(file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; } // older baseline builds
  }
  return files;
}
