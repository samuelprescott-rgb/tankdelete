import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import ts from 'typescript';

async function load(path) {
  let { outputText } = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  });
  for (const match of [...outputText.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
    outputText = outputText.replace(match[0], `from '${import.meta.resolve(match[2])}'`);
  }
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const phantom = await load('../src/components/Scene/phantomGeometry.ts');
const huey = await load('../src/components/Scene/hueyGeometry.ts');
const summaries = [];
function inspect(geometries, name, budget) {
  let total = 0;
  for (const [part, geometry] of Object.entries(geometries)) {
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    assert.ok(positions.count > 0 && positions.count % 3 === 0, `${name}/${part}: complete triangles`);
    assert.ok(positions.array.every(Number.isFinite) && normals.array.every(Number.isFinite), `${name}/${part}: finite geometry`);
    for (let vertex = 0; vertex < normals.count; vertex++) {
      const length = Math.hypot(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex));
      assert.ok(length > 0.999 && length < 1.001, `${name}/${part}: unit normals`);
    }
    assert.ok(geometry.boundingBox && geometry.boundingSphere && Number.isFinite(geometry.boundingSphere.radius));
    assert.equal(geometry.groups.length, 0, `${name}/${part}: one merged batch`);
    total += positions.count / 3;
  }
  assert.ok(total <= budget, `${name}: ${total} triangles exceeds ${budget}`);
  summaries.push(`${name}: ${total} triangles / ${Object.keys(geometries).length} batches`);
}
const plane = phantom.createPhantomGeometries();
inspect(plane, 'Phantom F-4C', 1800);
const contains = (geometry, point, tolerance = 1e-5) => {
  const p = geometry.getAttribute('position');
  for (let vertex = 0; vertex < p.count; vertex++) {
    if (Math.hypot(p.getX(vertex) - point[0], p.getY(vertex) - point[1], p.getZ(vertex) - point[2]) < tolerance) return true;
  }
  return false;
};
assert.ok(Math.abs(plane.dark.boundingBox.max.x - 4.8) < 1e-5, 'Phantom +X-forward radome stays bounded');
assert.ok(Math.abs(plane.body.boundingBox.max.z - 2.64) < 1e-5, 'Phantom wingspan follows the compact reference ratio');
for (const side of [-1, 1]) {
  assert.ok(contains(plane.body, [-1.18, 0.038, side * 2.64]), 'Outer wing must turn up');
  assert.ok(contains(plane.body, [-0.55, -0.132, side * 1.85]), 'Inner wing remains lower than its tip');
  assert.ok(contains(plane.body, [-3.08, -0.2965, side * 1.70]), 'Stabilator must droop, not rise');
  assert.ok(contains(plane.dark, [-3.476, -0.14, side * 0.32]), 'Both close-spaced exhaust cavities need a dark rear cap');
}
assert.ok(plane.glass.boundingBox.min.x < 0.14 && plane.glass.boundingBox.max.x > 2.30, 'Tandem cockpit must span both seats');
const ordnance = await readFile(new URL('../src/components/Scene/OrdnanceEffects.tsx', import.meta.url), 'utf8');
assert.match(ordnance, /<group ref=\{jetRef\} name="napalm-phantom" visible=\{false\} scale=\{0\.52\}>/);
assert.match(ordnance, /new THREE\.Vector3\(1, 0, 0\)/, 'Model must retain the flight path forward axis');
assert.match(ordnance, /NAPALM_TIMELINE\.bombReleaseSeconds/, 'Aircraft presentation does not replace the release clock');
assert.match(ordnance, /setHermiteDirection\(/, 'Existing C1 direction sampling must remain in use');
// Exercise the actual renderer interpolation with its new canopy-clear framing,
// not a reimplementation of the curve. The presentation may not move the audio clock.
const { NAPALM_FLIGHT_ENVELOPE: envelope, NAPALM_TIMELINE: timeline } = await load('../src/lib/weapons.ts');
assert.equal(timeline.impactSeconds, 8.45);
assert.equal(timeline.bombReleaseSeconds, 7.3);
for (const name of ['ingress', 'pass', 'exit']) {
  assert.ok(ordnance.includes(`resolveFlightPoint(...NAPALM_FLIGHT_ENVELOPE.${name},`));
}
const interpolationSource = ordnance.slice(ordnance.indexOf('function setHermitePosition('), ordnance.indexOf('function seededRandom('));
const interpolationJs = ts.transpileModule(interpolationSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const { setHermitePosition, setHermiteDirection } = new Function(`${interpolationJs}; return {setHermitePosition, setHermiteDirection};`)();
const approachSeconds = timeline.impactSeconds - timeline.jetIngressSeconds;
const exitSeconds = timeline.jetExitSeconds - timeline.impactSeconds;
for (const cameraHeight of [4.2, 8, 15, 32]) for (const pitch of [-0.1, 0.11, 0.35]) {
  const camera = new THREE.PerspectiveCamera(60, 881 / 913, 0.1, 340);
  camera.position.set(0, cameraHeight, 0); camera.rotation.x = -pitch;
  camera.updateMatrixWorld(true);
  const points = Object.values(envelope).map(([x, y, z, floor]) => {
    const point = camera.localToWorld(new THREE.Vector3(x, y, z));
    point.y = Math.max(point.y, floor); return point;
  });
  const [start, pass, exit] = points;
  const incoming = pass.clone().sub(start).divideScalar(approachSeconds);
  const outgoing = exit.clone().sub(pass).divideScalar(exitSeconds);
  const junction = incoming.clone().add(outgoing).normalize().multiplyScalar((incoming.length() + outgoing.length()) * 0.5);
  const position = new THREE.Vector3(), direction = new THREE.Vector3();
  for (const [a, b, v0, v1, duration] of [[start, pass, incoming, junction, approachSeconds], [pass, exit, junction, outgoing, exitSeconds]]) {
    let previous = null;
    for (let step = 0; step <= 200; step++) {
      setHermitePosition(position, a, b, v0, v1, duration, step / 200);
      setHermiteDirection(direction, a, b, v0, v1, duration, step / 200);
      assert.ok(position.toArray().every(Number.isFinite) && position.y >= 25.5, 'Entire path clears the rebuilt forest canopy');
      assert.ok(Math.abs(direction.length() - 1) < 1e-6, 'The jet retains a finite forward direction');
      if (previous) assert.ok(position.distanceTo(previous) > 0.1, 'No stopped or duplicate interval mid-flight');
      previous = position.clone();
    }
  }
  const before = new THREE.Vector3(), after = new THREE.Vector3();
  setHermitePosition(before, start, pass, incoming, junction, approachSeconds, 1 - 1e-5);
  setHermitePosition(after, pass, exit, junction, outgoing, exitSeconds, 1e-5);
  const velocityBefore = pass.clone().sub(before).divideScalar(approachSeconds * 1e-5);
  const velocityAfter = after.clone().sub(pass).divideScalar(exitSeconds * 1e-5);
  assert.ok(velocityBefore.distanceTo(velocityAfter) < 0.002, 'C1 velocity survives the higher flight envelope');
  if (cameraHeight === 4.2 && pitch === 0.11) {
    const projected = pass.clone().project(camera);
    assert.ok(Math.abs(projected.x) < 0.9 && Math.abs(projected.y) < 0.98, 'Pass stays in the normal chase field of view');
  }
}
Object.values(plane).forEach(geometry => geometry.dispose());

for (const distant of [false, true]) for (const wrecked of [false, true]) {
  const helicopter = huey.createHueyAirframeGeometries(wrecked, distant);
  inspect(helicopter, `UH-1${distant ? ' distant' : ''}${wrecked ? ' wreck' : ''}`, distant ? 780 : 1100);
  const rotor = helicopter.mainRotor.boundingBox;
  assert.ok(Math.abs(rotor.min.x + 3.65) < 1e-5);
  assert.ok(Math.abs(rotor.max.x - (wrecked ? 1.85 : 3.65)) < 1e-5);
  assert.ok(Math.max(Math.abs(rotor.min.z), Math.abs(rotor.max.z)) < 0.55, 'No second full-length crossed rotor');
  const tail = helicopter.tailRotor.boundingBox.getSize(new THREE.Vector3());
  assert.ok(tail.x < 0.10 && tail.y > 1.11 && tail.z < 0.14, 'Tail rotor is in YZ and spins about X');
  assert.ok(helicopter.dark.boundingBox.min.y > -1.12 && helicopter.dark.boundingBox.min.y < -1.0, 'Skids retain the wreck grounding envelope');
  assert.ok(helicopter.body.boundingBox.max.z > 5.4 && helicopter.body.boundingBox.min.z < -1.89, 'Long cabin and tail remain present');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(helicopter.body, material); mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(-2, 0, 0.25), new THREE.Vector3(1, 0, 0));
  assert.equal(ray.intersectObject(mesh).length, 0, 'Troop-bay aperture must remain open');
  ray.ray.origin.y = -0.5;
  assert.ok(ray.intersectObject(mesh).length >= 2, 'Door opening must not remove the lower cabin shell');
  material.dispose(); Object.values(helicopter).forEach(geometry => geometry.dispose());
}
assert.deepEqual(huey.HUEY_ANCHORS.mainRotor, [0, 1.29, 0]);
assert.deepEqual(huey.HUEY_ANCHORS.tailRotor, [0.12, 0.62, 5.14]);
for (const wrecked of [false, true]) {
  const material = huey.createHueyPaintMaterial(wrecked);
  const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
  material.onBeforeCompile(shader, {});
  assert.ok(shader.fragmentShader.includes(`scorch * ${wrecked ? '0.84' : '0.0'}`), 'Only wrecks receive the baked scorch patch');
  material.dispose();
}
console.log(`Aircraft silhouette, bounds, rotor axes, open doors, paint and flight-frame checks passed.\n${summaries.join('\n')}`);
