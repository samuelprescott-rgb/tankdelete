import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { events } from '@react-three/fiber';
import * as THREE from 'three';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/Scene/sceneEvents.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const moduleSource = outputText.replace(/from ['"]@react-three\/fiber['"]/g,
  `from ${JSON.stringify(import.meta.resolve('@react-three/fiber'))}`);
const { createSceneEvents } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.z = 5;
camera.updateMatrixWorld();
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
mesh.updateMatrixWorld();
const counts = { over: 0, out: 0, down: 0, up: 0, click: 0, missed: 0 };
const meshHandlers = { onPointerOver: () => counts.over++, onPointerOut: () => counts.out++ };
const wrappingDiv = new EventTarget(), canvas = new EventTarget();
const state = {
  camera, raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(), gl: { domElement: canvas },
  size: { width: 100, height: 100, left: 23, top: 17 },
  onPointerMissed() {}, // Fiber Canvas always supplies a wrapper for this optional callback.
  internal: { interaction: [mesh], capturedMap: new Map(), hovered: new Map(), initialHits: [],
    initialClick: [0, 0], lastEvent: { current: null } },
};
const store = { getState: () => state };
mesh.__r3f = { root: store, handlers: meshHandlers, eventCount: 2 };
let offsetReads = 0, picks = 0;
let layerReads = 0, captures = 0;
canvas.setPointerCapture = () => { captures++; };
canvas.releasePointerCapture = () => { captures--; };
const meshRaycast = mesh.raycast.bind(mesh);
mesh.raycast = (...args) => { picks++; meshRaycast(...args); };
class CanvasPointerEvent extends Event {
  #x;
  #y;
  #target;

  constructor(x, y, target) {
    super('pointerdown');
    this.#x = x;
    this.#y = y;
    this.#target = target;
    this.pointerId = 1;
    this.pointerType = 'mouse';
    // Use receiver-checked, enumerable getters like DOM pointer events.
    Object.defineProperties(this, {
      offsetX: { enumerable: true, get() { offsetReads++; return this.#x; } },
      offsetY: { enumerable: true, get() { offsetReads++; return this.#y; } },
      layerX: { enumerable: true, get() { layerReads++; return this.#x; } },
      layerY: { enumerable: true, get() { layerReads++; return this.#y; } },
    });
  }

  get target() { return this.#target; }
  get currentTarget() { return wrappingDiv; }
  get clientX() { return this.#x + state.size.left; }
  get clientY() { return this.#y + state.size.top; }
}
const position = (x = 51, y = 52, target = canvas) => new CanvasPointerEvent(x, y, target);

function downWithLateClick(factory, x = 51, y = 52) {
  state.events = { ...factory(store), connected: wrappingDiv };
  state.pointer.set(0, 0);
  state.internal.initialHits = [];
  const { handlers } = state.events;
  const down = position(x, y);
  offsetReads = layerReads = picks = 0;
  handlers.onPointerDown(down);
  const afterDown = {
    pointer: state.pointer.toArray(), initialClick: state.internal.initialClick,
    hitObjects: state.internal.initialHits.map((object) => object.uuid),
  };
  const work = { offsetReads, layerReads, picks };
  assert.equal(state.internal.lastEvent.current, down, 'stored native events keep their identity');

  const click = position(Math.floor(x), Math.floor(y));
  meshHandlers.onClick = (event) => {
    assert.equal(event.nativeEvent, click);
    assert.deepEqual(event.nativeEvent.composedPath(), []);
    counts.click++;
  };
  mesh.__r3f.eventCount++;
  handlers.onPointerUp(position());
  handlers.onClick(click);
  mesh.__r3f.eventCount--;
  delete meshHandlers.onClick;
  return { afterDown, work };
}

const stock = downWithLateClick(events);
const optimized = downWithLateClick(createSceneEvents);
assert.deepEqual(optimized.afterDown, stock.afterDown, 'aim, press origin, and down hit list match the stock manager');
assert.equal(stock.afterDown.hitObjects.length, 1);
assert.equal(counts.click, 2, 'a click handler attached after the down receives the click with either manager');
assert.ok(stock.work.offsetReads > 0 && stock.work.layerReads > 0 && stock.work.picks > 0,
  'the stock manager reads native offsets, layer coordinates, and picks');
assert.deepEqual(optimized.work, { offsetReads: 0, layerReads: 0, picks: stock.work.picks },
  'measured offsets avoid both native layout reads but keep picks');
assert.deepEqual(downWithLateClick(createSceneEvents, 50.6, 52.9), downWithLateClick(events, 50.6, 52.9),
  'fractional inputs keep stock pointerdown fractions and native click-distance rounding');

state.events = { ...createSceneEvents(store), connected: wrappingDiv };
const { handlers } = state.events;
state.events.update();
handlers.onPointerLeave(position());
handlers.onPointerMove(position());
handlers.onPointerCancel(position());
assert.deepEqual([counts.over, counts.out], [2, 2], 'event update, hover, leave and cancel still use Fiber behavior');

offsetReads = 0;
state.internal.capturedMap.set(1, new Map());
handlers.onPointerDown(position());
assert.ok(offsetReads > 0, 'pointer capture bypasses the optimization');
state.internal.capturedMap.clear();

offsetReads = 0;
handlers.onPointerDown(position(51, 52, wrappingDiv));
assert.ok(offsetReads > 0, 'a down somewhere on the wrapper rather than the measured canvas uses its native target offsets');

const subscribedDown = position();
Object.assign(meshHandlers, {
  onPointerDown: (event) => {
    assert.equal(event.nativeEvent, subscribedDown);
    assert.equal(event.nativeEvent.clientX, 74);
    event.currentTarget.setPointerCapture(event.nativeEvent.pointerId);
    counts.down++;
  },
  onPointerUp: (event) => { event.currentTarget.releasePointerCapture(event.nativeEvent.pointerId); counts.up++; },
  onClick: () => counts.click++,
});
mesh.__r3f.eventCount = Object.keys(meshHandlers).length;
offsetReads = 0;
handlers.onPointerDown(subscribedDown);
assert.equal(captures, 1);
handlers.onPointerUp(position(0, 0));
assert.equal(captures, 0, 'pointerup outside the original mesh is still delivered to the capture owner');
handlers.onClick(position());
assert.ok(offsetReads > 0);
assert.deepEqual([counts.down, counts.up, counts.click], [1, 1, 5], 'handlers registered at runtime receive original native Fiber presses');

delete meshHandlers.onPointerDown;
delete meshHandlers.onPointerUp;
delete meshHandlers.onClick;
mesh.__r3f.eventCount = Object.keys(meshHandlers).length;
handlers.onPointerDown(position(0, 0));
state.onPointerMissed = () => counts.missed++;
handlers.onClick(position(0, 0));
assert.equal(counts.missed, 1, 'a root missed-click handler mounted midpress is honored');
delete state.onPointerMissed;
meshHandlers.onPointerMissed = () => counts.missed++;
mesh.__r3f.eventCount++;
handlers.onPointerDown(position(0, 0));
handlers.onClick(position(0, 0));
assert.equal(counts.missed, 2, 'per-mesh missed-click callbacks still work');

console.log('Scene pointer events: canvas pointerdown requires no native offset reads on the listener-free path; Fiber aim, picking, hover, capture, click, and missed-click remain intact.');
