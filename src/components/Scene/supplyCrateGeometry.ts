import * as THREE from 'three';

/** Shared closed plank boxes; one batch for all three supply crates. */
export function createSupplyCrateGeometry() {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], kinds: number[] = [];
  function board(size: [number, number, number], at: [number, number, number], color: string, metal = false) {
    const indexed = new THREE.BoxGeometry(...size);
    const part = indexed.toNonIndexed(); indexed.dispose(); part.translate(...at);
    const p = part.getAttribute('position'), n = part.getAttribute('normal'), tint = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(tint.r, tint.g, tint.b); kinds.push(metal ? 1 : 0);
    }
    part.dispose();
  }
  const timber = ['#6e6850', '#777057', '#635e49', '#7c7358'];
  // Recessed interior blocks prevent bright gaps through the closed container.
  board([0.93, 0.65, 0.69], [0, 0.4, 0], '#3e3d31');
  for (let row = 0; row < 4; row++) {
    const y = 0.14 + row * 0.174;
    for (const side of [-1, 1]) {
      board([1, 0.166, 0.045], [0, y, side * 0.37], timber[row]);
      board([0.045, 0.166, 0.69], [side * 0.478, y, 0], timber[(row + 1) % 4]);
    }
  }
  for (let plank = 0; plank < 4; plank++) {
    const z = -0.2775 + plank * 0.185;
    board([1, 0.048, 0.177], [0, 0.771, z], timber[(plank + 2) % 4]);
  }
  for (const side of [-1, 1]) {
    board([0.094, 0.7, 0.042], [side * 0.34, 0.398, -0.413], '#80785c');
    board([0.094, 0.7, 0.042], [side * 0.34, 0.398, 0.413], '#736c53');
    board([0.105, 0.04, 0.85], [side * 0.34, 0.815, 0], '#837c60');
    board([0.15, 0.065, 0.77], [side * 0.32, 0.0325, 0], '#514e3b');
    // Narrow dark steel straps and recessed hand holds; no extra materials.
    board([0.021, 0.055, 0.3], [side * 0.511, 0.56, 0], '#30372f', true);
    for (const z of [-0.4, 0.4]) {
      board([0.044, 0.69, 0.011], [side * 0.446, 0.4, z], '#41473b', true);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('crateMetal', new THREE.Float32BufferAttribute(kinds, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createSupplyCrateMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nattribute float crateMetal;\nvarying float vCrateMetal;\nvarying vec3 vCrateLocal;\nvarying vec3 vCrateNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrateMetal = crateMetal;\nvCrateLocal = position;\nvCrateNormal = normal;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying float vCrateMetal;\nvarying vec3 vCrateLocal;\nvarying vec3 vCrateNormal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float along = mix(vCrateLocal.x, vCrateLocal.z, abs(vCrateNormal.x));
        float across = mix(vCrateLocal.y, vCrateLocal.z, abs(vCrateNormal.y));
        float bands = sin(across * 190.0 + sin(along * 9.0 + across * 16.0) * 2.3);
        float detail = 1.0 - smoothstep(0.015, 0.06, fwidth(across));
        float wash = sin(vCrateLocal.x * 15.0 + vCrateLocal.y * 11.0 + vCrateLocal.z * 19.0) * 0.045;
        float grain = 0.95 + bands * 0.095 * detail + wash;
        diffuseColor.rgb *= mix(grain, 0.94 + wash, vCrateMetal);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.72, vCrateMetal);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vCrateMetal * 0.36;');
  };
  material.customProgramCacheKey = () => 'weathered-plank-supply-crate-v1';
  return material;
}
