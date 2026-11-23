import { events, type Instance, type RootStore } from '@react-three/fiber';
import type { Object3D } from 'three';

export function createSceneEvents(store: RootStore): ReturnType<typeof events> {
  const manager = events(store);
  if (!manager.handlers) return manager;

  const handlers = { ...manager.handlers };
  const dispatch = handlers.onPointerDown;
  handlers.onPointerDown = (nativeEvent) => {
    const state = store.getState();
    const { events: active, internal, size } = state;
    const event = nativeEvent as PointerEvent;
    // The untransformed Scene canvas fills Fiber's measured box. Its wrapper
    // listens for events, but only a hit on the canvas has these exact offsets.
    if (event.pointerType !== 'mouse' || !active.connected
      || event.currentTarget !== active.connected || event.target !== state.gl.domElement
      || active.compute !== manager.compute || active.filter || state.previousRoot || internal.capturedMap.size
      || internal.interaction.some((object) => {
        const instance = (object as Instance<Object3D>['object']).__r3f;
        return !instance || instance.root !== store || instance.handlers.onPointerDown;
      })) {
      dispatch(event);
      return;
    }

    const { clientX, clientY } = event;
    const x = clientX - size.left;
    const y = clientY - size.top;
    // Let the browser preserve its exact offset rounding for fractional input or sizing.
    if (!Number.isInteger(clientX) || !Number.isInteger(clientY)
      || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size.width || y >= size.height) {
      dispatch(event);
      return;
    }

    // Run stock picking to keep the shared pointer and down hits current, even
    // when a hover object acquires a click listener before the button goes up.
    // Fiber enumerates every native property on hits, including layerX/Y that can
    // also force layout. Use a private snapshot only when no user callback can see it.
    const withMeasuredOffsets = {
      offsetX: x, offsetY: y, pointerId: event.pointerId, target: event.target,
    } as PointerEvent;
    try {
      dispatch(withMeasuredOffsets);
    } finally {
      if (internal.lastEvent.current === withMeasuredOffsets) {
        internal.lastEvent.current = event;
      }
    }
  };

  return { ...manager, handlers };
}
