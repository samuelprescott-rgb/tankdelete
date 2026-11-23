import {
  DirectionalLight, OrthographicCamera, PCFShadowMap, Vector3, WebGLCoordinateSystem,
  type Camera, type Object3D, type Scene, type WebGLRenderer,
} from 'three';
import type { createStaticInstanceFrustum } from './staticInstanceFrustum';

type Caster = NonNullable<ReturnType<typeof createStaticInstanceFrustum>>;
export const JUNGLE_KEY_LIGHT = 'sector-key-shadow';

// The scene hook runs after Three has updated world matrices and selected its
// actual camera, before either render list/attribute upload. A detached napalm
// scratch scene never enters this hook. Never change a live shadow matrix.
function createWorldPass(scene: Scene) {
  const casters = new Set<Caster>();
  const shadowEye = new OrthographicCamera(), target = new Vector3();
  let key: DirectionalLight | null = null, unsupported = false, layerMask = 0;
  function discover(object: Object3D) {
    if (!object.visible || unsupported) return;
    if (object.castShadow && (object.layers.mask & layerMask) !== 0 && 'isLight' in object) {
      if (key || !(object instanceof DirectionalLight) || object.name !== JUNGLE_KEY_LIGHT) {
        unsupported = true; return;
      }
      key = object;
    }
    for (const child of object.children) discover(child);
  }
  function update(renderer: WebGLRenderer, camera: Camera) {
    key = null; unsupported = false; layerMask = camera.layers.mask;
    const standard = !renderer.xr.isPresenting && !('isArrayCamera' in camera) &&
      camera.coordinateSystem === WebGLCoordinateSystem && !camera.reversedDepth &&
      renderer.shadowMap.enabled && renderer.shadowMap.type === PCFShadowMap && renderer.shadowMap.autoUpdate;
    if (standard) discover(scene);
    const light = key as DirectionalLight | null;
    // First map allocation updates the real projection. Unknown/uninitialized
    // topology, multi-view, frozen shadows, and other renderer modes use full
    // buffers rather than extrapolating a previously observed light or camera.
    const shadow = light?.shadow;
    const source = shadow?.camera;
    let eye: Camera | undefined;
    if (light && !unsupported && shadow && (shadow.autoUpdate || light.userData.scheduledMoonShadow) && shadow.map?.depthTexture?.compareFunction != null &&
      source && !source.parent && source.coordinateSystem === WebGLCoordinateSystem && !source.reversedDepth) {
      shadowEye.projectionMatrix.copy(source.projectionMatrix);
      shadowEye.up.copy(source.up);
      shadowEye.position.setFromMatrixPosition(light.matrixWorld);
      shadowEye.lookAt(target.setFromMatrixPosition(light.target.matrixWorld));
      shadowEye.updateMatrixWorld();
      eye = shadowEye;
    }
    for (const caster of casters) caster.update(camera, eye);
  }
  const previous = scene.onBeforeRender;
  const before: typeof previous = function(...args) {
    previous.apply(scene, args);
    update(args[0], args[2]);
  };
  scene.onBeforeRender = before;
  return {casters, dispose() { if (scene.onBeforeRender === before) scene.onBeforeRender = previous; }};
}

const active = new WeakMap<Scene, ReturnType<typeof createWorldPass>>();
export function attachJungleCaster(scene: Scene, caster: Caster) {
  let pass = active.get(scene);
  if (!pass) { pass = createWorldPass(scene); active.set(scene, pass); }
  pass.casters.add(caster);
  return () => {
    pass.casters.delete(caster); caster.restore();
    if (!pass.casters.size) { pass.dispose(); active.delete(scene); }
  };
}
