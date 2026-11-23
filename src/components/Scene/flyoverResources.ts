import * as THREE from 'three';
import { createHueyAirframeGeometries, createHueyPaintMaterial } from './hueyGeometry';
import { createVehicleInk, inkVehicle } from './ghostVehicleInk';
import { applyPaintedFinish } from './paintedMaterials';

/** Independent moving rigs may borrow these immutable assets; no rotor/group
 * transforms, mesh visibility, shadows or animation are shared. */
export function createHueyResources(wrecked: boolean, distant: boolean) {
  const shellInk = createVehicleInk('huey'), paneInk = createVehicleInk('glazing');
  const assets = {
    shellInk, paneInk, ...createHueyAirframeGeometries(wrecked, distant),
    paint: inkVehicle(createHueyPaintMaterial(wrecked), 'huey', shellInk, wrecked),
    trim: applyPaintedFinish(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, side: THREE.DoubleSide }),
      { scale: 1.35, strength: 0.48, edge: 0.49 }),
    glazing: inkVehicle(new THREE.MeshStandardMaterial({ color: '#586f73', roughness: 0.86, side: THREE.DoubleSide }), 'glazing', paneInk),
    rotorPaint: new THREE.MeshStandardMaterial({ color: '#626650', roughness: 0.91, side: THREE.DoubleSide }),
  };
  let owners = 0, disposed = false;
  return { assets, retain() {
    if (disposed) throw Error('Cannot retain a retired Huey bundle');
    owners++;
    let released = false;
    return () => {
      if (released) return;
      released = true; owners--;
      // StrictMode can release/reacquire the same owner synchronously.
      queueMicrotask(() => {
        if (owners !== 0 || disposed) return;
        disposed = true;
        Object.values(assets).forEach(asset => asset.dispose());
      });
    };
  } };
}

type Bundle = ReturnType<typeof createHueyResources>;
const formations = new WeakMap<THREE.Scene, { bundle: Bundle }>();

/** Mount-local registration for the existing, once-only sector preparation
 * pass. No global GPU-resource ownership or searches through the world. */
export function registerFlyoverResources(scene: THREE.Scene, bundle: Bundle) {
  const registration = { bundle };
  formations.set(scene, registration);
  return () => { if (formations.get(scene) === registration) formations.delete(scene); };
}

export function flyoverRenderBatch(scene: THREE.Scene): THREE.Mesh[] {
  const a = formations.get(scene)?.bundle.assets;
  if (!a) return [];
  // Detached, non-casting/non-receiving meshes match the distant live variant;
  // only these proxies are positioned/unculled by the tiny scratch stage.
  return [new THREE.Mesh(a.body, a.paint), new THREE.Mesh(a.dark, a.trim),
    new THREE.Mesh(a.glass, a.glazing), new THREE.Mesh(a.mainRotor, a.rotorPaint),
    new THREE.Mesh(a.tailRotor, a.rotorPaint)];
}

type RelayInk = {
  hull: THREE.Mesh; smoke: THREE.InstancedMesh; fire: THREE.InstancedMesh; streak: THREE.Mesh;
  flash: THREE.Mesh; wake: THREE.Mesh; groundFlame: THREE.Mesh;
  hits: readonly THREE.BufferGeometry[]; wakes: readonly THREE.BufferGeometry[];
};
const relayInk = new WeakMap<THREE.Scene, RelayInk>();
export function registerRelayInk(scene: THREE.Scene, ink: RelayInk) {
  relayInk.set(scene, ink);
  return () => { if (relayInk.get(scene) === ink) relayInk.delete(scene); };
}

/** Normally hidden until the scripted ridge hit. The fog-free, opaque paint
 * on the streak, instanced fragments and two-sided exhaust is three separate
 * programs, none shared by the mapped translucent smoke. Borrow the actual
 * cel bank so WebKit also sees the vertex/index buffers before the first hit. */
export function relayInkRenderBatch(scene: THREE.Scene): THREE.Mesh[] {
  const ink = relayInk.get(scene);
  if (!ink) return [];
  const proxy = (live: THREE.Mesh, geometry = live.geometry): THREE.Mesh => {
    const copy = live instanceof THREE.InstancedMesh
      ? new THREE.InstancedMesh(geometry, live.material, 1)
      : new THREE.Mesh(geometry, live.material);
    copy.castShadow = live.castShadow;
    copy.receiveShadow = live.receiveShadow;
    return copy;
  };
  const smoke = proxy(ink.smoke) as THREE.InstancedMesh;
  // Only smoke allocates instanceColor in the live animation.
  smoke.setColorAt(0, new THREE.Color(1, 1, 1));
  return [smoke, proxy(ink.hull), proxy(ink.streak), proxy(ink.fire), proxy(ink.groundFlame),
    ...ink.hits.map(g => proxy(ink.flash, g)), ...ink.wakes.map(g => proxy(ink.wake, g))];
}
