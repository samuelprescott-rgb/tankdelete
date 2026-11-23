import * as T from 'three';

export interface WeaponContact {
  t: number;
  kind: 'soil' | 'water' | 'wood' | 'building' | 'actor';
  key?: string;
}

// Only solid playfield surfaces participate. Reeds, mist, and impact sprites
// can cover the pointer without becoming targets themselves.
export function createWeaponSurfaceProbe() {
  const ray = new T.Raycaster(), hits: T.Intersection[] = [];
  const segment = new T.Box3();
  let lastScene: T.Scene | null = null, refreshAt = 0;
  let surfaces: {mesh: T.Mesh; bounds: T.Box3; kind: WeaponContact['kind']}[] = [];
  let crawler: T.Object3D | undefined;
  return (scene: T.Scene, from: T.Vector3, to: T.Vector3, sight = false): WeaponContact | null => {
    const now = performance.now();
    if (scene !== lastScene || now >= refreshAt) {
      surfaces = [];
      scene.traverse(o => {
        if (!(o as T.Mesh).isMesh) return;
        const name = o.name;
        const paddy = o.parent?.parent?.name === 'rice-paddy-surfaces';
        const river = o.parent?.name === 'winding-river' && !name.includes('reeds') && !name.includes('landing');
        const masonry = name === 'compound-breached-walls' || /^embassy-.*-masonry$/.test(name);
        if (!(paddy || river || masonry || ['terrain-relief','dry-ground-cut-around-river','road-puddles',
          'embassy-service-track','compound-drained-apron','embassy-road-checkpoint'].includes(name))) return;
        surfaces.push({mesh:o as T.Mesh, bounds:new T.Box3().setFromObject(o),
          kind:masonry ? 'building' : o.userData.contactSurface ?? 'soil'});
      });
      crawler = scene.getObjectByName('arcade-crawler-contact-skin');
      lastScene = scene;
      refreshAt = now + 1000;
    }
    const length = from.distanceTo(to);
    if (length < 1e-7) return null;
    ray.ray.origin.copy(from);
    ray.ray.direction.subVectors(to, from).divideScalar(length);
    ray.far = length;
    segment.makeEmpty().expandByPoint(from).expandByPoint(to);
    let best: WeaponContact | null = null;
    const check = (mesh: T.Object3D, kind: WeaponContact['kind']) => {
      hits.length = 0;
      ray.intersectObject(mesh, false, hits);
      if (!hits.length) return;
      ray.far = hits[0].distance;
      best = {t:ray.far / length, kind, key:kind === 'building' ? mesh.name : undefined};
    };
    for (const {mesh, bounds, kind} of surfaces) {
      if (mesh.parent && mesh.visible && segment.intersectsBox(bounds) && ray.ray.intersectsBox(bounds)) check(mesh, kind);
    }
    if (sight && crawler?.parent) check(crawler, 'actor');
    return best;
  };
}
