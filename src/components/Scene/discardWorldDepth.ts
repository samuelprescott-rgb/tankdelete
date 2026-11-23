import type { ComponentRef } from 'react';
import type { EffectComposer } from '@react-three/postprocessing';
import type { Camera, Scene, WebGLRenderer } from 'three';

type Composer = ComponentRef<typeof EffectComposer>;
type WorldPass = Composer['passes'][number] & {
  clearPass: { enabled: boolean; depth: boolean };
};

/** The world needs its depth attachment while rendering. The current color-only
 * chain never samples it afterward. Tell a tile renderer at the end of that
 * pass, before switching targets, that these depth tiles do not need storing.
 * Never bind a framebuffer or discard color, shadow depth, or the canvas. */
export function attachWorldDepthDiscard(composer: Composer, owner: WebGLRenderer, scene: Scene, camera: Camera) {
  const world = composer.passes[0] as WorldPass | undefined;
  if (!world || world.name !== 'RenderPass' || !world.clearPass || composer.getRenderer() !== owner) return;
  const gl = owner.getContext();
  if (!('invalidateFramebuffer' in gl) || typeof gl.invalidateFramebuffer !== 'function') return;
  const depthOnly = [gl.DEPTH_ATTACHMENT], original = world.render;
  const wasOwn = Object.prototype.hasOwnProperty.call(world, 'render');
  const wrapped: typeof original = function(this: WorldPass, renderer, input, output, dt, stencil) {
    original.call(this, renderer, input, output, dt, stencil);
    if (this !== world || renderer !== owner || composer.passes[0] !== world ||
        world.renderToScreen || !world.clearPass.enabled || !world.clearPass.depth ||
        owner.xr.isPresenting || owner.getScissorTest() || stencil ||
        !input || input !== composer.inputBuffer || owner.getRenderTarget() !== input ||
        input.scissorTest || input.samples !== 0 || !input.depthBuffer || input.stencilBuffer || input.depthTexture ||
        composer.outputBuffer.depthTexture || composer.passes.length < 2) return;
    // RenderPass owns these internal references; reject a borrowed/reconfigured pass.
    const bound = world as unknown as { scene: Scene; camera: Camera };
    if (bound.scene !== scene || bound.camera !== camera) return;
    for (let i = 1; i < composer.passes.length; i++) {
      const pass = composer.passes[i];
      if (pass.name !== 'EffectPass' || pass.needsDepthTexture || pass.fullscreenMaterial?.depthTest !== false ||
          pass.fullscreenMaterial.depthWrite !== false) return;
    }
    gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, depthOnly);
  };
  world.render = wrapped;
  return () => {
    if (world.render !== wrapped) return;
    if (wasOwn) world.render = original;
    else Reflect.deleteProperty(world, 'render');
  };
}
