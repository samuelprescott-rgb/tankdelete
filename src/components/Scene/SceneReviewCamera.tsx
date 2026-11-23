import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Matrix4, Vector3, type InstancedMesh } from 'three';
import { sceneReviewGrassSweepX } from '../../lib/sceneReviewGrassSweep';

export const SCENE_REVIEW_VIEWS = {
  Chase: null,
  Tank: { actor: 'player-tank', distance: 3.5, height: 0.65 },
  Wreck: { eye: [-12.8, 2.8, -10.7], target: [-9, 1.65, -17] },
  Squad: { eye: [-7.3, 1.5, -2.7], target: [-4.9, 0.75, -5.3] },
  Infantry: { actor: 'us-rto-4', distance: 1.95, height: 0.88, side: .86 },
  'Enemy infantry': { actor: 'enemy-infantry-review', distance: 1.85, height: 0.75, side: .91 },
  'Rifle profile': { actor: 'us-rto-4', distance: 1.74, height: 1.24, profile: true },
  'Enemy rifle profile': { actor: 'enemy-field-head-review', distance: 1.74, height: -.18, profile: true },
  'US kit': { actor: 'us-rto-4', detail: { eye: [-.91, 1.30, -.47], target: [0, 1.20, -.035] } },
  'US chest': { actor: 'us-rto-4', detail: { eye: [-.34, 1.42, -.90], target: [0, 1.14, -.055] } },
  'US sleeve': { actor: 'us-rto-4', detail: { eye: [.86, 1.27, .32], target: [.13, 1.23, -.07] } },
  'US boots': { actor: 'us-rto-4', detail: { eye: [-.67, .45, .39], target: [0, .31, -.03] } },
  'US hems': { actor: 'us-rto-4', detail: { eye: [.69, .63, -.44], target: [0, .26, -.08] } },
  'VC kit': { actor: 'enemy-field-head-review', detail: { eye: [-.90, -.22, -.49], target: [0, -.23, -.045] } },
  Face: { actor: 'field-infantry-head-review', distance: 0.70, height: 0.13 },
  'Enemy face': { actor: 'enemy-field-head-review', distance: 0.70, height: 0.13 },
  Forest: { eye: [-21, 2.2, -9], target: [-35, 5.1, 3] },
  Edge: { eye: [53, 3, -42], target: [76, 6, -44] },
  Corner: { eye: [54, 3, 52], target: [78, 7, 76] },
  Embassy: { eye: [0, 5, -13], target: [0, 3, -26] },
  Village: { eye: [20, 8, 8], target: [0, 1.5, 29] },
  River: { eye: [-14, 4, -23], target: [-24, 0, -16] },
  Bridge: { eye: [9, 5, 9], target: [0, 0, 17] },
  Layout: { eye: [18, 95, -22], target: [0, 0, 0] },
  Phantom: { actor: 'napalm-phantom', distance: 12, height: 0 },
  Napalm: { eye: [-7, 5, -1], target: [0, 1.5, 8] },
  Zombie: { batch: 'nightmare-undead-heads', instance: 0 },
  Boss: { actor: 'nightmare-boss-sculpt', distance: 2.65, height: 0.84, side: .83 },
  Palm: { eye: [7.5, 2.5, -24], target: [12, 4.2, -19] },
  Shrub: { batch: 'authored-jungle-shrub-batch', instance: 0 },
  Ferns: { eye: [-31.1, 1.15, -7.15], target: [-29.65, 0.16, -5.25] },
  Paddies: { eye: [8, 2.8, -10], target: [3, 0.25, 6] },
  'Rice close': { eye: [4.05, 0.94, -6.28], target: [5.5, 0.24, -4.68] },
  'Grass sweep': { sweep: true },
  Arnold: { actor: 'boss-ally-atlas', distance: 2.8, height: 1.0 },
  Rambo: { actor: 'boss-ally-redwood', distance: 2.8, height: 1.0 },
  Roosevelt: { actor: 'boss-ally-sagamore', distance: 4.6, height: 1.5 },
} as const;
export type SceneReviewView = keyof typeof SCENE_REVIEW_VIEWS;

/** Development-only fixed inspection views, selected through visible buttons.
 * Does not teleport actors, change AI, pause clocks or bypass gameplay state. */
export function SceneReviewCamera({ view }: { view: SceneReviewView }) {
  const scratch = useMemo(() => ({ target: new Vector3(), eye: new Vector3(), matrix: new Matrix4() }), []);
  const sweep = useRef({ active: false, start: 0 });
  useFrame(({ camera, scene, clock }) => {
    const pose = SCENE_REVIEW_VIEWS[view];
    if (!pose || !('sweep' in pose)) sweep.current.active = false;
    if (!pose) return;
    if ('sweep' in pose) {
      if (!sweep.current.active) sweep.current = { active: true, start: clock.elapsedTime };
      camera.position.set(sceneReviewGrassSweepX(clock.elapsedTime - sweep.current.start), 3.2, -30);
      camera.lookAt(24, 0.35, 5);
      return;
    }
    if ('batch' in pose) {
      const batch = scene.getObjectByName(pose.batch) as InstancedMesh | undefined;
      if (!batch?.isInstancedMesh || !batch.visible || batch.count <= pose.instance) return;
      batch.getMatrixAt(pose.instance, scratch.matrix);
      if (view === 'Zombie') {
        // Dead/spawning slots are deliberately zero-scaled by the renderer.
        // Review a live slot; never point the camera into a collapsed matrix.
        let found = false;
        for (let slot = 0; slot < batch.count; slot++) {
          batch.getMatrixAt(slot, scratch.matrix);
          if (scratch.matrix.determinant() > 0.02) { found = true; break; }
        }
        if (!found) return;
      }
      scratch.matrix.premultiply(batch.matrixWorld);
      if (view === 'Zombie') {
        scratch.target.set(0, -0.54, 0).applyMatrix4(scratch.matrix);
        scratch.eye.set(1.9, -0.06, -2.25).applyMatrix4(scratch.matrix);
      } else {
        scratch.target.set(0, 0.35, 0).applyMatrix4(scratch.matrix);
        scratch.eye.set(1.2, 0.85, -1.6).applyMatrix4(scratch.matrix);
      }
      camera.position.copy(scratch.eye); camera.lookAt(scratch.target);
      return;
    }
    if ('actor' in pose) {
      const actor = scene.getObjectByName(pose.actor);
      if (!actor?.visible || !actor.parent?.visible) return;
      if ('detail' in pose) {
        const { eye, target } = pose.detail;
        actor.localToWorld(scratch.eye.set(eye[0], eye[1], eye[2]));
        actor.localToWorld(scratch.target.set(target[0], target[1], target[2]));
        camera.position.copy(scratch.eye);
        camera.lookAt(scratch.target);
        return;
      }
      if ('profile' in pose) {
        scratch.target.set(.02, pose.height, -.33);
        scratch.eye.set(pose.distance, pose.height + .18, -.54);
        actor.localToWorld(scratch.target);
        actor.localToWorld(scratch.eye);
        camera.position.copy(scratch.eye);
        camera.lookAt(scratch.target);
        return;
      }
      scratch.target.set(0, pose.height, 0);
      actor.localToWorld(scratch.target);
      scratch.eye.set(pose.distance * ('side' in pose ? pose.side : 0.65),
        pose.height + (view === 'Face' || view === 'Enemy face' ? 0.02 : view === 'Phantom' ? 5 : view === 'Tank' ? 0.8 : 0.3), -pose.distance);
      actor.localToWorld(scratch.eye);
      camera.position.copy(scratch.eye);
      camera.lookAt(scratch.target);
      return;
    }
    camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  }, 0.5); // After chase controls (0), before the existing composer render (1).
  return null;
}
