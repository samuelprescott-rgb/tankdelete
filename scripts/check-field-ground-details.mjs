import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import ts from 'typescript';

const url = new URL('../src/components/Scene/fieldGroundDetails.ts', import.meta.url);
const src = ts.transpileModule(await readFile(url, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
}).outputText.replace("'three'", JSON.stringify(import.meta.resolve('three')));
const { buildFightingPositionGeometry, buildBrushScreenGeometry } =
  await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);

const brush = buildBrushScreenGeometry(), bank = buildFightingPositionGeometry();
const triangles = g => g.attributes.position.count / 3;
function check(g, bounds, budget, minPigments) {
  const { position, normal, color } = g.attributes;
  assert.deepEqual(Object.keys(g.attributes).sort(), ['color','normal','position']);
  assert.equal(g.groups.length, 0, 'one material pass');
  assert.ok(triangles(g) <= budget && g.boundingSphere.radius > 0);
  assert.equal(position.count, normal.count); assert.equal(position.count, color.count);
  const pigments = new Set(), n = new THREE.Vector3();
  for (let i = 0; i < position.count; ++i) {
    assert.ok(n.fromBufferAttribute(position, i).toArray().every(Number.isFinite));
    assert.ok(Math.abs(n.fromBufferAttribute(normal, i).length() - 1) < 1e-5, 'nondegenerate triangle');
    const rgb = n.fromBufferAttribute(color, i).toArray();
    assert.ok(rgb.every(c => c > 0 && c < 1)); pigments.add(rgb.join(','));
  }
  assert.ok(pigments.size >= minPigments, 'color is authored into the surface');
  const measured = [...g.boundingBox.min.toArray(), ...g.boundingBox.max.toArray()];
  measured.forEach((value, i) => assert.ok(Math.abs(value - bounds[i]) < .02, 'retain measured gameplay-distance envelope'));
}
// Bounds and budgets come from the actual replaced assets, not the collision model.
check(brush, [-.30354,0,-.28817,.26817,.41463,.23855], 206, 12);
check(bank, [-.88475,-.00936,-.65924,.87839,.31946,.456], 500, 25);
assert.ok(triangles(bank) + 3 * triangles(brush) < 700 + 3 * 200, 'cheaper at maximum brush density');
const mesh = g => new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
const leaves = mesh(brush), soil = mesh(bank), ray = new THREE.Raycaster();
function hits(object, x, z, below = false) {
  ray.set(new THREE.Vector3(x, below ? -1 : 1, z), new THREE.Vector3(0, below ? 1 : -1, 0));
  return ray.intersectObject(object, false);
}
for (const [x,z] of [[-.187,-.198],[.168,.133],[-.035,.165]]) {
  const upper = hits(leaves,x,z), lower = hits(leaves,x,z,true);
  assert.ok(upper.length && lower.length, 'folded blade is visible from both sides with an opaque front-side material');
  assert.ok(upper[0].point.y - lower[0].point.y > .002, 'blade has thickness, not coincident polygons');
}
for (const [x,z] of [[-.62,-.05],[-.46,-.34],[0,-.46],[.45,-.33],[.62,-.05]]) {
  assert.ok(hits(soil,x,z)[0]?.point.y > .20, 'bank remains continuous through its front and sides');
}
assert.ok(hits(soil,0,.12)[0]?.point.y < .04, 'rear floor stays low');
const scene = await readFile(new URL('../src/components/Scene/VietCongCombatants.tsx', import.meta.url), 'utf8');
for (const [geometry, placements] of [['BRUSH_SCREEN_GEOMETRY','brush'],['FIGHTING_POSITION_GEOMETRY','fightingPositions']]) {
  assert.equal(scene.split(`<StaticCoverBatch geometry={${geometry}} placements={placements.${placements}}`).length, 2);
}
console.log(`Field cover passed: ${triangles(brush)} brush + ${triangles(bank)} soil triangles; bounds, pigment, front/back faces and static batches verified.`);
