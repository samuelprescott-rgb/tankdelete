import * as THREE from 'three';

/** The sector has a shadow-casting sun. Wait for a real world draw instead
 * of letting a scratch pass bind Three's uninitialized fallback depth map. */
export function napalmShadowMapsReady(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  if (!renderer.shadowMap.enabled) return true;
  let foundCaster = false, ready = true;
  scene.traverseVisible(object => {
    if (!object.castShadow || !object.layers.test(camera.layers)
      || !(object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight || object instanceof THREE.PointLight)) return;
    foundCaster = true;
    const map = object.shadow.map;
    if (!map || (renderer.shadowMap.type === THREE.PCFShadowMap && map.depthTexture?.compareFunction == null)) ready = false;
  });
  return foundCaster && ready;
}

/** Put the real materials through Three's link, reflection and draw path.
 * compile() alone leaves first draw/reflection work for the live strike. */
export function prepareNapalmRender(
  renderer: THREE.WebGLRenderer,
  liveScene: THREE.Scene,
  liveCamera: THREE.Camera,
  batch: readonly (THREE.Mesh | THREE.LineSegments)[],
) {
  const stage = new THREE.Scene();
  stage.environment = liveScene.environment;
  stage.environmentIntensity = liveScene.environmentIntensity;
  stage.environmentRotation.copy(liveScene.environmentRotation);
  stage.fog = liveScene.fog;

  // The visible light/shadow counts and fog determine lit shader variants.
  // Clone the lights, not the world; do not mutate a live shadow or rerender it.
  liveScene.traverseVisible(object => {
    if (!(object instanceof THREE.Light) || !object.layers.test(liveCamera.layers)) return;
    const copy = object.clone(false);
    object.getWorldPosition(copy.position);
    if ((object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight)
        && (copy instanceof THREE.DirectionalLight || copy instanceof THREE.SpotLight)) {
      object.target.getWorldPosition(copy.target.position);
      stage.add(copy.target);
    }
    if ((object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight || object instanceof THREE.PointLight)
        && (copy instanceof THREE.DirectionalLight || copy instanceof THREE.SpotLight || copy instanceof THREE.PointLight)) {
      copy.shadow.map = object.shadow.map;
      copy.shadow.matrix.copy(object.shadow.matrix);
    }
    stage.add(copy);
  });

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 40);
  camera.position.set(1.4, 1.7, 4.0);
  camera.lookAt(0, 0, 0);
  batch.forEach(object => {
    object.frustumCulled = false;
    stage.add(object);
  });

  // Match the composer's non-MSAA, linear HDR input. Default framebuffer
  // draws would warm a different tone mapping and output color-space key.
  const scratch = new THREE.WebGLRenderTarget(16, 16, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const mip = renderer.getActiveMipmapLevel();
  const autoClear = renderer.autoClear;
  const shadowAuto = renderer.shadowMap.autoUpdate;
  const shadowDirty = renderer.shadowMap.needsUpdate;
  const xrEnabled = renderer.xr.enabled;
  try {
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    renderer.autoClear = true;
    renderer.setRenderTarget(scratch);
    renderer.render(stage, camera);
  } finally {
    renderer.setRenderTarget(target, face, mip);
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = shadowAuto;
    renderer.shadowMap.needsUpdate = shadowDirty;
    renderer.xr.enabled = xrEnabled;
    scratch.dispose();
    for (const object of batch) {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
  }
}
