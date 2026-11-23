import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3} from 'three';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/Scene/fieldHelmetGeometry.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}})
  .outputText.replace("from 'three'", `from '${import.meta.resolve('three')}'`);
const {createFieldHelmetGeometry} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const mat = new MeshBasicMaterial({side:DoubleSide}), ray = new Raycaster();
for (let variant = 0; variant < 3; variant++) {
  const geometry = createFieldHelmetGeometry({headY:0,variant,fieldUniform:true}), shell = new Mesh(geometry,mat);
  const surface = (start, dir) => {
    ray.set(new Vector3(...start),new Vector3(...dir));
    const hit = ray.intersectObject(shell)[0];
    assert.ok(hit, 'A section ray must cross the shell');
    return hit.point;
  };
  // Rays at the brow and temple cross the actual drawn steel and band, not
  // merely their source profile radii (the section sweeps upward at the face).
  const brow = y => surface([.010,y,-1],[0,0,1]).z;
  const temple = y => surface([1,y,-.022],[-1,0,0]).x;
  const browShelf = brow(.075)-brow(.056), templeShelf = temple(.009)-temple(.030);
  assert.ok(browShelf > .012 && browShelf < .020, 'Stamped brow must project past the elastic without becoming a long visor');
  assert.ok(templeShelf > .008 && templeShelf < .015, 'Slight skirt flare should read without growing into a pith brim');
  const width=geometry.boundingBox.max.x-geometry.boundingBox.min.x;
  assert.ok(width>.268 && width<.280 && geometry.boundingBox.max.y<.138,
    'Wider temple protection with a low pressed crown, not a scaled-up dome');
  assert.equal(geometry.groups.length,0);
  assert.equal(geometry.attributes.position.count/3,1154, 'Stay in the existing field cover triangle budget');
  geometry.dispose();
}
mat.dispose();
console.log('Three US field shells: front and temple brim clearance, crown envelope and triangle count passed.');
